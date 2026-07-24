"use server";

import { cookies } from "next/headers";
import {
  RECOVERY_GRANT_COOKIE,
  advanceRecoveryGrantToSyncPending,
  recoveryGrantMatchesSession,
  requireRecoveryFlowSecret,
} from "../../lib/recoveryCookies.server";
import { createSupabaseServerClient } from "../../lib/supabaseServer";
import type { ResetPasswordActionState } from "./resetPasswordState";

const secureCookies = process.env.NODE_ENV === "production";

function genericError(): ResetPasswordActionState {
  return {
    status: "error",
    message: "No se pudo completar la recuperación. Solicita un enlace nuevo.",
  };
}

function logResetPasswordStage(
  stage: string,
  level: "info" | "error" = "info"
): void {
  const metadata = {
    stage,
    timestamp: new Date().toISOString(),
  };
  if (level === "error") {
    console.error("[RESET_PASSWORD_STAGE]", metadata);
  } else {
    console.info("[RESET_PASSWORD_STAGE]", metadata);
  }
}

function redactSensitiveLogText(value: string): string {
  return value
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[REDACTED_EMAIL]"
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[REDACTED_JWT]"
    )
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
      "Bearer [REDACTED]"
    )
    .replace(
      /\b(password|token(?:_hash)?|access[_-]?token|refresh[_-]?token|cookie|grant|authorization)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1$2[REDACTED]"
    );
}

function safeUpdateErrorField(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return redactSensitiveLogText(value);
  return null;
}

function logResetPasswordUpdateError(error: unknown): void {
  const candidate =
    error && typeof error === "object"
      ? (error as {
          name?: unknown;
          status?: unknown;
          code?: unknown;
          message?: unknown;
        })
      : {};

  console.error("[RESET_PASSWORD_STAGE]", {
    stage: "RESET_PASSWORD_UPDATE_FAILED",
    timestamp: new Date().toISOString(),
    name: safeUpdateErrorField(candidate.name),
    status: safeUpdateErrorField(candidate.status),
    code: safeUpdateErrorField(candidate.code),
    message: safeUpdateErrorField(candidate.message),
  });
}

export async function completePasswordReset(
  _previousState: ResetPasswordActionState,
  formData: FormData
): Promise<ResetPasswordActionState> {
  logResetPasswordStage("RESET_PASSWORD_START");
  const password = formData.get("password");
  const confirmation = formData.get("confirmPassword");
  if (
    typeof password !== "string" ||
    typeof confirmation !== "string" ||
    password.length < 8 ||
    password.length > 128 ||
    password !== confirmation
  ) {
    return {
      status: "error",
      message:
        password !== confirmation
          ? "Las contraseñas no coinciden."
          : "La nueva contraseña debe tener entre 8 y 128 caracteres.",
    };
  }

  const cookieStore = await cookies();
  const deleteGrant = () => {
    logResetPasswordStage("RESET_PASSWORD_DELETE_COOKIES");
    cookieStore.set(RECOVERY_GRANT_COOKIE, "", {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: "/reset-password",
      maxAge: 0,
    });
  };

  try {
    const secret = requireRecoveryFlowSecret();
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: (updatedCookies) => {
        updatedCookies.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    });
    logResetPasswordStage("RESET_PASSWORD_SUPABASE_READY");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (userError || sessionError || !user?.id || !session?.access_token) {
      logResetPasswordStage("RESET_PASSWORD_SESSION_FAILED", "error");
      deleteGrant();
      return genericError();
    }
    logResetPasswordStage("RESET_PASSWORD_SESSION_READY");

    const recoveryGrantCookie = cookieStore.get(RECOVERY_GRANT_COOKIE)?.value;
    logResetPasswordStage("RESET_PASSWORD_GRANT_READ");
    const grant = recoveryGrantMatchesSession(
      recoveryGrantCookie,
      { userId: user.id, accessToken: session.access_token },
      secret
    );
    if (!grant) {
      logResetPasswordStage(
        recoveryGrantCookie
          ? "RESET_PASSWORD_GRANT_INVALID"
          : "RESET_PASSWORD_GRANT_MISSING",
        "error"
      );
      deleteGrant();
      return genericError();
    }
    logResetPasswordStage("RESET_PASSWORD_GRANT_VALID");

    if (grant.phase === "verified") {
      logResetPasswordStage("RESET_PASSWORD_UPDATE_START");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        logResetPasswordUpdateError(updateError);
        return genericError();
      }
      logResetPasswordStage("RESET_PASSWORD_UPDATE_SUCCESS");

      const remainingSeconds = Math.max(1, Math.floor((grant.expiresAt - Date.now()) / 1000));
      cookieStore.set(
        RECOVERY_GRANT_COOKIE,
        advanceRecoveryGrantToSyncPending(grant, secret),
        {
          httpOnly: true,
          secure: secureCookies,
          sameSite: "strict",
          path: "/reset-password",
          maxAge: remainingSeconds,
          priority: "high",
        }
      );
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
    if (!apiUrl) return genericError();

    const response = await fetch(`${apiUrl}/api/auth/password-reset/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ new_password: password }),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as
      | { success?: boolean }
      | null;

    if (!response.ok || !result?.success) return genericError();

    deleteGrant();
    await supabase.auth.signOut().catch(() => null);
    logResetPasswordStage("RESET_PASSWORD_SUCCESS");
    return {
      status: "success",
      message: "Contraseña actualizada correctamente. Te llevaremos al login.",
    };
  } catch {
    logResetPasswordStage("RESET_PASSWORD_UNEXPECTED", "error");
    return genericError();
  }
}
