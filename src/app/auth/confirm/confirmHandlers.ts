import { randomUUID } from "node:crypto";
import type { Session, User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server.js";
import {
  PENDING_RECOVERY_COOKIE,
  PENDING_RECOVERY_TTL_SECONDS,
  RECOVERY_GRANT_COOKIE,
  RECOVERY_GRANT_TTL_SECONDS,
  createRecoveryGrant,
  extractSupabaseSessionId,
  inspectPendingRecovery,
  requireRecoveryFlowSecret,
  sealPendingRecovery,
} from "../../../lib/recoveryCookies.server.ts";
import { parseAuthConfirmQuery } from "../../../lib/recoveryRedirect.ts";
import { createSupabaseServerClient } from "../../../lib/supabaseServer.ts";

type VerifyOtpResult = {
  data: { user: User | null; session: Session | null };
  error: unknown | null;
};

type VerifyRecoveryOtp = (params: {
  token_hash: string;
  type: "recovery";
}) => Promise<VerifyOtpResult>;

export const RECOVERY_FAILURE_REASONS = [
  "cookie_missing",
  "cookie_decrypt_failed",
  "cookie_expired",
  "otp_rejected",
  "session_missing",
  "session_cookie_failed",
  "grant_failed",
  "unexpected_error",
] as const;

export type RecoveryFailureReason = (typeof RECOVERY_FAILURE_REASONS)[number];

const secureCookies = process.env.NODE_ENV === "production";

type SafeSupabaseError = {
  code?: string;
  status?: number;
};

function safeSupabaseError(error: unknown): SafeSupabaseError {
  if (!error || typeof error !== "object") return {};
  const candidate = error as { code?: unknown; status?: unknown };
  const result: SafeSupabaseError = {};
  if (typeof candidate.code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(candidate.code)) {
    result.code = candidate.code;
  }
  if (typeof candidate.status === "number" && Number.isInteger(candidate.status)) {
    result.status = candidate.status;
  }
  return result;
}

function logRecoveryStage(
  stage: string,
  requestId: string,
  error?: unknown
): void {
  const metadata = {
    request_id: requestId,
    stage,
    timestamp: new Date().toISOString(),
    ...safeSupabaseError(error),
  };
  if (stage === "RECOVERY_CONFIRM_SUCCESS") {
    console.info(`[${stage}]`, metadata);
  } else {
    console.warn(`[${stage}]`, metadata);
  }
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

function redirect(request: NextRequest, destination: string, status = 303): NextResponse {
  return withSecurityHeaders(
    NextResponse.redirect(new URL(destination, request.url), { status })
  );
}

function deletePendingCookie(response: NextResponse) {
  response.cookies.set(PENDING_RECOVERY_COOKIE, "", {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/auth/confirm",
    maxAge: 0,
  });
}

export function createRecoveryFailureResponse(
  request: NextRequest,
  reason: RecoveryFailureReason
): NextResponse {
  const response = redirect(
    request,
    `/reset-password?error=invalid_link&reason=${reason}`
  );
  deletePendingCookie(response);
  return response;
}

export function renderConfirmHtml(hasPendingRecovery: boolean): string {
  const content = hasPendingRecovery
    ? `<p>Confirma que deseas continuar con el cambio de contraseña.</p>
       <form method="post" action="/auth/confirm">
         <button type="submit">Continuar con la recuperación</button>
       </form>`
    : `<p>El enlace de recuperación no está disponible o expiró.</p>
       <a class="button" href="/login">Solicitar un enlace nuevo</a>`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>Confirmar recuperación | InmoScore</title>
    <style>
      :root { color-scheme: dark; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: #020617; }
      main { width: min(100%, 28rem); border-radius: 1rem; padding: 2rem; background: #fff; color: #0f172a; box-shadow: 0 24px 70px #0008; text-align: center; }
      h1 { margin: 0 0 .75rem; font-size: 1.8rem; }
      p { margin: 0 0 1.5rem; color: #475569; line-height: 1.6; }
      button, .button { display: block; width: 100%; border: 0; border-radius: .75rem; padding: .9rem 1rem; background: #1d4ed8; color: #fff; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
      button:hover, .button:hover { background: #1e40af; }
    </style>
  </head>
  <body>
    <main>
      <h1>Recuperar contraseña</h1>
      ${content}
    </main>
  </body>
</html>`;
}

export async function handleConfirmGet(request: NextRequest): Promise<NextResponse> {
  const parsed = parseAuthConfirmQuery(request.nextUrl.searchParams);

  if (parsed.kind === "invalid") {
    return redirect(request, parsed.redirectTo);
  }

  if (parsed.kind === "valid") {
    let sealedPending: string;
    try {
      sealedPending = sealPendingRecovery(parsed.value, requireRecoveryFlowSecret());
    } catch {
      console.error("[AUTH_RECOVERY_CONFIRM_CONFIGURATION_ERROR]");
      return redirect(request, "/reset-password?error=invalid_link");
    }

    const response = redirect(request, "/auth/confirm");
    response.cookies.set(PENDING_RECOVERY_COOKIE, sealedPending, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/auth/confirm",
      maxAge: PENDING_RECOVERY_TTL_SECONDS,
      priority: "high",
    });
    return response;
  }

  const hasPendingRecovery = Boolean(request.cookies.get(PENDING_RECOVERY_COOKIE)?.value);
  return withSecurityHeaders(
    new NextResponse(renderConfirmHtml(hasPendingRecovery), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
}

export async function handleConfirmPost(
  request: NextRequest,
  verifyOtpOverride?: VerifyRecoveryOtp
): Promise<NextResponse> {
  const requestId = randomUUID();

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return createRecoveryFailureResponse(request, "unexpected_error");
  }

  const pendingCookie = request.cookies.get(PENDING_RECOVERY_COOKIE)?.value;
  if (!pendingCookie) {
    logRecoveryStage("RECOVERY_CONFIRM_COOKIE_MISSING", requestId);
    return createRecoveryFailureResponse(request, "cookie_missing");
  }

  let pendingResult;
  let secret: string;
  try {
    secret = requireRecoveryFlowSecret();
    pendingResult = inspectPendingRecovery(pendingCookie, secret);
  } catch {
    logRecoveryStage("RECOVERY_CONFIRM_COOKIE_DECRYPT_FAILED", requestId);
    return createRecoveryFailureResponse(request, "cookie_decrypt_failed");
  }
  if (pendingResult.status === "decrypt_failed") {
    logRecoveryStage("RECOVERY_CONFIRM_COOKIE_DECRYPT_FAILED", requestId);
    return createRecoveryFailureResponse(request, "cookie_decrypt_failed");
  }
  if (pendingResult.status === "expired") {
    logRecoveryStage("RECOVERY_CONFIRM_COOKIE_EXPIRED", requestId);
    return createRecoveryFailureResponse(request, "cookie_expired");
  }
  const pending = pendingResult.value;

  const response = redirect(request, pending.next);
  deletePendingCookie(response);

  try {
    let verifyOtp = verifyOtpOverride;
    let sessionCookieSetAllInvoked = false;
    if (!verifyOtp) {
      const supabase = createSupabaseServerClient({
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          sessionCookieSetAllInvoked = true;
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      });
      verifyOtp = (params) => supabase.auth.verifyOtp(params);
    }

    let data: VerifyOtpResult["data"];
    let error: VerifyOtpResult["error"];
    try {
      ({ data, error } = await verifyOtp({
        token_hash: pending.tokenHash,
        type: "recovery",
      }));
    } catch (verificationError) {
      logRecoveryStage("RECOVERY_CONFIRM_OTP_REJECTED", requestId, verificationError);
      return createRecoveryFailureResponse(request, "otp_rejected");
    }

    if (error) {
      logRecoveryStage("RECOVERY_CONFIRM_OTP_REJECTED", requestId, error);
      return createRecoveryFailureResponse(request, "otp_rejected");
    }

    const sessionId = data.session?.access_token
      ? extractSupabaseSessionId(data.session.access_token)
      : null;

    if (!data.user?.id) {
      logRecoveryStage("RECOVERY_CONFIRM_SESSION_MISSING", requestId);
      return createRecoveryFailureResponse(request, "session_missing");
    }

    if (!data.session?.access_token) {
      logRecoveryStage("RECOVERY_CONFIRM_SESSION_MISSING", requestId);
      return createRecoveryFailureResponse(request, "session_missing");
    }

    if (!sessionId) {
      logRecoveryStage("RECOVERY_CONFIRM_SESSION_MISSING", requestId);
      return createRecoveryFailureResponse(request, "session_missing");
    }

    if (!verifyOtpOverride && !sessionCookieSetAllInvoked) {
      logRecoveryStage("RECOVERY_CONFIRM_SESSION_COOKIE_FAILED", requestId);
      return createRecoveryFailureResponse(request, "session_cookie_failed");
    }

    try {
      response.cookies.set(
        RECOVERY_GRANT_COOKIE,
        createRecoveryGrant({ userId: data.user.id, sessionId }, secret),
        {
          httpOnly: true,
          secure: secureCookies,
          sameSite: "strict",
          path: "/reset-password",
          maxAge: RECOVERY_GRANT_TTL_SECONDS,
          priority: "high",
        }
      );
    } catch (grantError) {
      logRecoveryStage("RECOVERY_CONFIRM_GRANT_FAILED", requestId, grantError);
      return createRecoveryFailureResponse(request, "grant_failed");
    }
    logRecoveryStage("RECOVERY_CONFIRM_SUCCESS", requestId);
    return response;
  } catch (error) {
    logRecoveryStage("RECOVERY_CONFIRM_OTP_REJECTED", requestId, error);
    return createRecoveryFailureResponse(request, "unexpected_error");
  }
}
