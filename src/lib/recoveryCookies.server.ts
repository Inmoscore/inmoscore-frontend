import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { PendingRecoveryConfirmation } from "./recoveryRedirect.ts";

// Do not use the __Secure- prefix here: that prefix requires Secure even on
// local HTTP development, while this flow enables Secure conditionally in
// production. The explicit cookie options below still enforce the policy.
export const PENDING_RECOVERY_COOKIE = "inmoscore_recovery_pending";
export const RECOVERY_GRANT_COOKIE = "inmoscore_recovery_grant";
export const PENDING_RECOVERY_TTL_SECONDS = 120;
export const RECOVERY_GRANT_TTL_SECONDS = 10 * 60;

type PendingRecoveryPayload = PendingRecoveryConfirmation & {
  purpose: "password_recovery_pending";
  issuedAt: number;
  expiresAt: number;
};

export type RecoveryGrantPhase = "verified" | "sync_pending";

export type RecoveryGrant = {
  version: 1;
  purpose: "password_recovery";
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  phase: RecoveryGrantPhase;
};

export type PendingRecoveryInspection =
  | { status: "valid"; value: PendingRecoveryConfirmation }
  | { status: "expired" }
  | { status: "decrypt_failed" };

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(`pending:${secret}`, "utf8").digest();
}

function signingKey(secret: string): Buffer {
  return createHash("sha256").update(`grant:${secret}`, "utf8").digest();
}

export function requireRecoveryFlowSecret(): string {
  const secret = process.env.RECOVERY_FLOW_SECRET?.trim() || "";
  if (secret.length < 32) {
    throw new Error("RECOVERY_FLOW_SECRET must contain at least 32 characters");
  }
  return secret;
}

export function sealPendingRecovery(
  value: PendingRecoveryConfirmation,
  secret: string,
  now = Date.now()
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const payload: PendingRecoveryPayload = {
    ...value,
    purpose: "password_recovery_pending",
    issuedAt: now,
    expiresAt: now + PENDING_RECOVERY_TTL_SECONDS * 1000,
  };
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${encode(iv)}.${encode(ciphertext)}.${encode(tag)}`;
}

export function inspectPendingRecovery(
  value: string,
  secret: string,
  now = Date.now()
): PendingRecoveryInspection {
  try {
    const [version, encodedIv, encodedCiphertext, encodedTag, extra] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag || extra) {
      return { status: "decrypt_failed" };
    }

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), decode(encodedIv));
    decipher.setAuthTag(decode(encodedTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(encodedCiphertext)),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<PendingRecoveryPayload>;

    if (
      payload.purpose !== "password_recovery_pending" ||
      payload.type !== "recovery" ||
      payload.next !== "/reset-password" ||
      typeof payload.tokenHash !== "string" ||
      !payload.tokenHash ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.issuedAt > now
    ) {
      return { status: "decrypt_failed" };
    }

    if (payload.expiresAt <= now) return { status: "expired" };

    return {
      status: "valid",
      value: {
        tokenHash: payload.tokenHash,
        type: "recovery",
        next: "/reset-password",
      },
    };
  } catch {
    return { status: "decrypt_failed" };
  }
}

export function openPendingRecovery(
  value: string,
  secret: string,
  now = Date.now()
): PendingRecoveryConfirmation | null {
  const result = inspectPendingRecovery(value, secret, now);
  return result.status === "valid" ? result.value : null;
}

export function createRecoveryGrant(
  params: { userId: string; sessionId: string; phase?: RecoveryGrantPhase },
  secret: string,
  now = Date.now()
): string {
  const payload: RecoveryGrant = {
    version: 1,
    purpose: "password_recovery",
    userId: params.userId,
    sessionId: params.sessionId,
    issuedAt: now,
    expiresAt: now + RECOVERY_GRANT_TTL_SECONDS * 1000,
    nonce: randomBytes(18).toString("base64url"),
    phase: params.phase ?? "verified",
  };
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", signingKey(secret)).update(encodedPayload).digest();
  return `${encodedPayload}.${encode(signature)}`;
}

function signRecoveryGrant(payload: RecoveryGrant, secret: string): string {
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", signingKey(secret)).update(encodedPayload).digest();
  return `${encodedPayload}.${encode(signature)}`;
}

export function advanceRecoveryGrantToSyncPending(
  grant: RecoveryGrant,
  secret: string
): string {
  return signRecoveryGrant({ ...grant, phase: "sync_pending" }, secret);
}

export function verifyRecoveryGrant(
  value: string,
  secret: string,
  now = Date.now()
): RecoveryGrant | null {
  try {
    const [encodedPayload, encodedSignature, extra] = value.split(".");
    if (!encodedPayload || !encodedSignature || extra) return null;

    const actual = decode(encodedSignature);
    const expected = createHmac("sha256", signingKey(secret)).update(encodedPayload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(decode(encodedPayload).toString("utf8")) as Partial<RecoveryGrant>;
    if (
      payload.version !== 1 ||
      payload.purpose !== "password_recovery" ||
      typeof payload.userId !== "string" ||
      !payload.userId ||
      typeof payload.sessionId !== "string" ||
      !payload.sessionId ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.issuedAt > now ||
      payload.expiresAt <= now ||
      typeof payload.nonce !== "string" ||
      !payload.nonce ||
      (payload.phase !== "verified" && payload.phase !== "sync_pending")
    ) {
      return null;
    }
    return payload as RecoveryGrant;
  } catch {
    return null;
  }
}

export function extractSupabaseSessionId(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(decode(parts[1]).toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof payload.session_id === "string" && payload.session_id
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}

export function recoveryGrantMatchesSession(
  grantValue: string | undefined,
  params: { userId: string; accessToken: string },
  secret: string,
  now = Date.now()
): RecoveryGrant | null {
  if (!grantValue) return null;
  const grant = verifyRecoveryGrant(grantValue, secret, now);
  const sessionId = extractSupabaseSessionId(params.accessToken);
  if (!grant || !sessionId) return null;
  if (grant.userId !== params.userId || grant.sessionId !== sessionId) return null;
  return grant;
}
