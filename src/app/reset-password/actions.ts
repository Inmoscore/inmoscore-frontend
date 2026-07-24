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

export async function completePasswordReset(
  _previousState: ResetPasswordActionState,
  formData: FormData
): Promise<ResetPasswordActionState> {
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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (userError || sessionError || !user?.id || !session?.access_token) {
      deleteGrant();
      return genericError();
    }

    const grant = recoveryGrantMatchesSession(
      cookieStore.get(RECOVERY_GRANT_COOKIE)?.value,
      { userId: user.id, accessToken: session.access_token },
      secret
    );
    if (!grant) {
      deleteGrant();
      return genericError();
    }

    if (grant.phase === "verified") {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) return genericError();

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
    return {
      status: "success",
      message: "Contraseña actualizada correctamente. Te llevaremos al login.",
    };
  } catch {
    return genericError();
  }
}
