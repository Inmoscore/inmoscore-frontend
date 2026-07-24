import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  PENDING_RECOVERY_COOKIE,
  sealPendingRecovery,
} from "../../../lib/recoveryCookies.server.ts";
import {
  handleConfirmGet,
  handleConfirmPost,
  renderConfirmHtml,
} from "./confirmHandlers.ts";

const secret = "test-only-recovery-secret-with-at-least-32-characters";
process.env.RECOVERY_FLOW_SECRET = secret;

function token(sessionId: string): string {
  return [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url"),
    "signature",
  ].join(".");
}

function pendingCookie(tokenHash = "sensitive-token", now = Date.now()): string {
  return sealPendingRecovery(
    { tokenHash, type: "recovery", next: "/reset-password" },
    secret,
    now
  );
}

test("GET stores the temporary HttpOnly cookie and redirects 303 to the clean URL", async () => {
  const response = await handleConfirmGet(
    new NextRequest(
      "https://app.test/auth/confirm?token_hash=sensitive-token&type=recovery&next=/reset-password"
    )
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.test/auth/confirm");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, new RegExp(`${PENDING_RECOVERY_COOKIE}=`));
  assert.match(setCookie.toLowerCase(), /httponly/);
  assert.match(setCookie.toLowerCase(), /samesite=lax/);
  assert.equal(setCookie.includes("sensitive-token"), false);
});

test("external email navigation preserves the pending cookie for the clean GET", async () => {
  const initial = await handleConfirmGet(
    new NextRequest(
      "https://app.test/auth/confirm?token_hash=email-token&type=recovery&next=/reset-password",
      { headers: { referer: "https://outlook.office.com/" } }
    )
  );
  const setCookie = initial.headers.get("set-cookie") || "";
  const cookieValue = setCookie.match(new RegExp(`${PENDING_RECOVERY_COOKIE}=([^;]+)`))?.[1];

  assert.equal(initial.status, 303);
  assert.match(setCookie.toLowerCase(), /samesite=lax/);
  assert.ok(cookieValue);

  const clean = await handleConfirmGet(
    new NextRequest("https://app.test/auth/confirm", {
      headers: { cookie: `${PENDING_RECOVERY_COOKIE}=${cookieValue}` },
    })
  );
  assert.equal(clean.status, 200);
  assert.match(await clean.text(), /Continuar con la recuperaci/);
});

test("GET and scanner-only GET never execute verifyOtp", async () => {
  const verificationCalls = 0;
  await handleConfirmGet(
    new NextRequest(
      "https://app.test/auth/confirm?token_hash=token&type=recovery&next=/reset-password"
    )
  );
  assert.equal(verificationCalls, 0);
});

test("clean interstitial HTML never contains token_hash or a hidden credential", () => {
  const html = renderConfirmHtml(true);
  assert.match(html, /Continuar con la recuperación/);
  assert.equal(html.includes("token_hash"), false);
  assert.equal(html.includes("sensitive-token"), false);
  assert.equal(/type=["']hidden/i.test(html), false);
});

test("POST without pending cookie is rejected and expires the pending cookie", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", { method: "POST" }),
    async () => {
      throw new Error("must not execute");
    }
  );
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") || "", /invalid_link/);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/i);
});

test("expired pending cookie is rejected without executing verifyOtp", async () => {
  let verificationCalls = 0;
  const expired = pendingCookie(
    "expired-token",
    Date.now() - (2 * 60 + 1) * 1000
  );
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { cookie: `${PENDING_RECOVERY_COOKIE}=${expired}` },
    }),
    async () => {
      verificationCalls += 1;
      throw new Error("must not execute");
    }
  );
  assert.equal(verificationCalls, 0);
  assert.match(response.headers.get("location") || "", /invalid_link/);
});

test("valid POST executes verifyOtp once, deletes pending cookie and creates grant", async () => {
  let verificationCalls = 0;
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}` },
    }),
    async (params) => {
      verificationCalls += 1;
      assert.deepEqual(params, { token_hash: "sensitive-token", type: "recovery" });
      return {
        data: {
          user: { id: "user-1" } as never,
          session: { access_token: token("session-1") } as never,
        },
        error: null,
      };
    }
  );
  assert.equal(verificationCalls, 1);
  assert.equal(response.headers.get("location"), "https://app.test/reset-password");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /Max-Age=0/i);
  assert.match(setCookie, /inmoscore_recovery_grant=/);
  assert.equal(setCookie.includes("sensitive-token"), false);
});

test("reused token is rejected when Supabase reports it consumed", async () => {
  let verificationCalls = 0;
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie("reused-token")}` },
    }),
    async () => {
      verificationCalls += 1;
      return {
        data: { user: null, session: null },
        error: new Error("already consumed"),
      };
    }
  );
  assert.equal(verificationCalls, 1);
  assert.match(response.headers.get("location") || "", /invalid_link/);
});
