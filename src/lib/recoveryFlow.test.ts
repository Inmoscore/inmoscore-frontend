import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_RECOVERY_TTL_SECONDS,
  createRecoveryGrant,
  openPendingRecovery,
  recoveryGrantMatchesSession,
  sealPendingRecovery,
  verifyRecoveryGrant,
} from "./recoveryCookies.server.ts";
import { parseAuthConfirmQuery } from "./recoveryRedirect.ts";

const secret = "test-only-recovery-secret-with-at-least-32-characters";

function accessToken(sessionId: string): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url"),
    "signature",
  ].join(".");
}

test("allows only the internal recovery destination", () => {
  const parsed = parseAuthConfirmQuery(
    new URLSearchParams({
      token_hash: "token",
      type: "recovery",
      next: "/reset-password",
    })
  );
  assert.equal(parsed.kind, "valid");
});

test("blocks absolute, protocol-relative and unknown destinations", () => {
  for (const next of [
    "https://attacker.test/reset",
    "//attacker.test/reset",
    "/reset-password\\@attacker.test",
    "/dashboard",
  ]) {
    const parsed = parseAuthConfirmQuery(
      new URLSearchParams({ token_hash: "token", type: "recovery", next })
    );
    assert.deepEqual(parsed, { kind: "invalid", redirectTo: "/login" });
  }
});

test("rejects unknown, duplicate or missing parameters and incorrect type", () => {
  const cases = [
    "token_hash=t&type=recovery&next=%2Freset-password&extra=1",
    "token_hash=t&token_hash=t2&type=recovery&next=%2Freset-password",
    "token_hash=t&type=recovery",
    "token_hash=t&type=email&next=%2Freset-password",
  ];
  for (const value of cases) {
    assert.equal(parseAuthConfirmQuery(new URLSearchParams(value)).kind, "invalid");
  }
});

test("pending recovery cookie is encrypted, authenticated and expires quickly", () => {
  const now = Date.now();
  const sealed = sealPendingRecovery(
    { tokenHash: "sensitive-token", type: "recovery", next: "/reset-password" },
    secret,
    now
  );
  assert.equal(sealed.includes("sensitive-token"), false);
  assert.deepEqual(openPendingRecovery(sealed, secret, now + 1), {
    tokenHash: "sensitive-token",
    type: "recovery",
    next: "/reset-password",
  });
  assert.equal(
    openPendingRecovery(sealed, secret, now + PENDING_RECOVERY_TTL_SECONDS * 1000),
    null
  );
  assert.equal(openPendingRecovery(`${sealed}tampered`, secret, now + 1), null);
});

test("normal session without a signed recovery authorization is rejected", () => {
  assert.equal(
    recoveryGrantMatchesSession(
      undefined,
      { userId: "user-1", accessToken: accessToken("session-1") },
      secret
    ),
    null
  );
});

test("signed recovery authorization is bound to user and Supabase session_id", () => {
  const grant = createRecoveryGrant(
    { userId: "user-1", sessionId: "session-1" },
    secret
  );
  assert.equal(
    recoveryGrantMatchesSession(
      grant,
      { userId: "user-1", accessToken: accessToken("session-1") },
      secret
    )?.purpose,
    "password_recovery"
  );
  assert.equal(
    recoveryGrantMatchesSession(
      grant,
      { userId: "user-2", accessToken: accessToken("session-1") },
      secret
    ),
    null
  );
  assert.equal(
    recoveryGrantMatchesSession(
      grant,
      { userId: "user-1", accessToken: accessToken("session-2") },
      secret
    ),
    null
  );
});

test("expired or tampered recovery authorization is rejected", () => {
  const now = Date.now();
  const grant = createRecoveryGrant(
    { userId: "user-1", sessionId: "session-1" },
    secret,
    now
  );
  const decoded = verifyRecoveryGrant(grant, secret, now + 10 * 60 * 1000);
  assert.equal(decoded, null);
  assert.equal(verifyRecoveryGrant(`${grant}tampered`, secret, now + 1), null);
});
