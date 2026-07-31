export const RECOVERY_REDIRECT_ALLOW_LIST = new Set(["/reset-password"]);

export type PendingRecoveryConfirmation = {
  tokenHash: string;
  type: "recovery";
  next: "/reset-password";
};

export type AuthConfirmQueryResult =
  | { kind: "clean" }
  | { kind: "valid"; value: PendingRecoveryConfirmation }
  | { kind: "invalid"; redirectTo: "/login" | "/reset-password?error=invalid_link" };

const ALLOWED_QUERY_KEYS = new Set(["token_hash", "type", "next"]);
const EMAIL_CONFIRMATION_NEXT = "/correo-pendiente";

export type EmailConfirmationQueryResult =
  | { kind: "not_email_confirmation" }
  | { kind: "invalid" }
  | {
      kind: "valid";
      value: {
        tokenHash: string;
        type: "signup";
        next: "/correo-pendiente";
      };
    };

export function parseEmailConfirmationQuery(
  searchParams: URLSearchParams
): EmailConfirmationQueryResult {
  if (searchParams.get("type") !== "signup") {
    return { kind: "not_email_confirmation" };
  }

  const entries = [...searchParams.entries()];
  if (entries.some(([key]) => !ALLOWED_QUERY_KEYS.has(key))) {
    return { kind: "invalid" };
  }

  const tokenHashes = searchParams.getAll("token_hash");
  const types = searchParams.getAll("type");
  const destinations = searchParams.getAll("next");
  const next = destinations.length === 0 ? EMAIL_CONFIRMATION_NEXT : destinations[0];

  if (
    tokenHashes.length !== 1 ||
    types.length !== 1 ||
    destinations.length > 1 ||
    !tokenHashes[0].trim() ||
    tokenHashes[0].length > 4096 ||
    next !== EMAIL_CONFIRMATION_NEXT
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "valid",
    value: {
      tokenHash: tokenHashes[0].trim(),
      type: "signup",
      next: EMAIL_CONFIRMATION_NEXT,
    },
  };
}

export function parseAuthConfirmQuery(searchParams: URLSearchParams): AuthConfirmQueryResult {
  const entries = [...searchParams.entries()];
  if (entries.length === 0) return { kind: "clean" };

  if (entries.some(([key]) => !ALLOWED_QUERY_KEYS.has(key))) {
    return { kind: "invalid", redirectTo: "/reset-password?error=invalid_link" };
  }

  const tokenHashes = searchParams.getAll("token_hash");
  const types = searchParams.getAll("type");
  const destinations = searchParams.getAll("next");

  if (tokenHashes.length !== 1 || types.length !== 1 || destinations.length !== 1) {
    return { kind: "invalid", redirectTo: "/reset-password?error=invalid_link" };
  }

  const tokenHash = tokenHashes[0].trim();
  const type = types[0];
  const next = destinations[0];

  if (!tokenHash || tokenHash.length > 4096 || type !== "recovery") {
    return { kind: "invalid", redirectTo: "/reset-password?error=invalid_link" };
  }

  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return { kind: "invalid", redirectTo: "/login" };
  }

  if (!RECOVERY_REDIRECT_ALLOW_LIST.has(next)) {
    return { kind: "invalid", redirectTo: "/login" };
  }

  return {
    kind: "valid",
    value: {
      tokenHash,
      type: "recovery",
      next: "/reset-password",
    },
  };
}

export function isAllowedRecoveryRedirect(value: string): value is "/reset-password" {
  return RECOVERY_REDIRECT_ALLOW_LIST.has(value);
}
