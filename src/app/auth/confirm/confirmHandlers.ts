import type { Session, User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server.js";
import {
  PENDING_RECOVERY_COOKIE,
  PENDING_RECOVERY_TTL_SECONDS,
  RECOVERY_GRANT_COOKIE,
  RECOVERY_GRANT_TTL_SECONDS,
  createRecoveryGrant,
  extractSupabaseSessionId,
  openPendingRecovery,
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

const secureCookies = process.env.NODE_ENV === "production";

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
  const invalidResponse = redirect(request, "/reset-password?error=invalid_link");
  deletePendingCookie(invalidResponse);

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return invalidResponse;

  const pendingCookie = request.cookies.get(PENDING_RECOVERY_COOKIE)?.value;
  if (!pendingCookie) return invalidResponse;

  let pending;
  let secret: string;
  try {
    secret = requireRecoveryFlowSecret();
    pending = openPendingRecovery(pendingCookie, secret);
  } catch {
    console.error("[AUTH_RECOVERY_CONFIRM_CONFIGURATION_ERROR]");
    return invalidResponse;
  }
  if (!pending) return invalidResponse;

  const response = redirect(request, pending.next);
  deletePendingCookie(response);

  try {
    let verifyOtp = verifyOtpOverride;
    if (!verifyOtp) {
      const supabase = createSupabaseServerClient({
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      });
      verifyOtp = (params) => supabase.auth.verifyOtp(params);
    }

    const { data, error } = await verifyOtp({
      token_hash: pending.tokenHash,
      type: "recovery",
    });
    const sessionId = data.session?.access_token
      ? extractSupabaseSessionId(data.session.access_token)
      : null;

    if (error || !data.user?.id || !data.session?.access_token || !sessionId) {
      console.warn("[AUTH_RECOVERY_CONFIRM_REJECTED]", { reason: "invalid_or_expired" });
      return invalidResponse;
    }

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
    console.info("[AUTH_RECOVERY_CONFIRM_ACCEPTED]", { user_id: data.user.id });
    return response;
  } catch {
    console.warn("[AUTH_RECOVERY_CONFIRM_REJECTED]", { reason: "verification_error" });
    return invalidResponse;
  }
}
