"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type FormState = {
  password: string;
  confirmPassword: string;
};

type SessionState = "checking" | "ready" | "invalid" | "success";

const isDevelopment = process.env.NODE_ENV === "development";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}

function getAuthErrorMessage(err: unknown): string {
  const message = getErrorMessage(err);
  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (typeof err.status === "number" || typeof err.status === "string")
      ? err.status
      : null;

  return status ? `${message} (status: ${status})` : message;
}

function getHashParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return params.get(name);
}

function logResetPasswordSessionReady(userId: string) {
  if (!isDevelopment) return;
  console.log("[RESET_PASSWORD_SESSION_READY]", {
    hasUser: true,
    userId,
  });
}

function logResetPasswordUpdateResult(success: boolean, errorMessage = "") {
  if (!isDevelopment) return;
  console.log("[RESET_PASSWORD_UPDATE_RESULT]", {
    success,
    errorMessage,
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function auditPasswordResetSuccess(
  supabase: ReturnType<typeof getSupabaseBrowserClient>
) {
  if (!API_URL) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    await fetch(`${API_URL}/api/auth/password-reset/success-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ source: "reset-password" }),
    });
  } catch {
    // Best-effort audit: password reset UX must not depend on the audit write.
  }
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const hasResolvedRef = useRef(false);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<FormState>({
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const passwordTooShort = useMemo(
    () => formData.password.length > 0 && formData.password.length < 6,
    [formData.password]
  );

  useEffect(() => {
    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;

    async function resolveRecoverySession() {
      let supabase: ReturnType<typeof getSupabaseBrowserClient>;

      function markInvalid(message = "") {
        setUser(null);
        setError(message);
        setSessionState("invalid");
      }

      try {
        supabase = getSupabaseBrowserClient();
      } catch {
        markInvalid("Supabase frontend no configurado");
        return;
      }

      try {
        const accessToken = getHashParam("access_token");
        const refreshToken = getHashParam("refresh_token");
        const type = getHashParam("type");

        if (!accessToken || !refreshToken || type !== "recovery") {
          markInvalid();
          return;
        }

        await supabase.auth.signOut({ scope: "local" }).catch(() => null);

        try {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            markInvalid(isDevelopment ? getAuthErrorMessage(setSessionError) : "");
            return;
          }
        } catch (err) {
          markInvalid(isDevelopment ? getAuthErrorMessage(err) : "");
          return;
        }

        try {
          const {
            data: { user: currentUser },
            error: userError,
          } = await supabase.auth.getUser();

          if (userError) {
            markInvalid(isDevelopment ? getAuthErrorMessage(userError) : "");
            return;
          }

          if (!currentUser) {
            markInvalid();
            return;
          }

          setUser(currentUser);
          setError("");
          setSessionState("ready");
          logResetPasswordSessionReady(currentUser.id);
        } catch (err) {
          markInvalid(isDevelopment ? getAuthErrorMessage(err) : "");
        }
      } catch {
        markInvalid();
      }
    }

    resolveRecoverySession();
  }, []);

  const handleChange =
    (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((current) => ({
        ...current,
        [field]: event.target.value,
      }));
      setError("");
    };

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting || sessionState !== "ready") return;

      const newPassword = formData.password;

      if (newPassword.length < 6) {
        setError("La nueva contrasena debe tener al menos 6 caracteres.");
        return;
      }

      if (newPassword !== formData.confirmPassword) {
        setError("Las contrasenas no coinciden.");
        return;
      }

      try {
        setSubmitting(true);
        setError("");
        const supabase = getSupabaseBrowserClient();
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          logResetPasswordUpdateResult(false, getAuthErrorMessage(updateError));
          throw updateError;
        }

        const {
          data: { user: confirmedUser },
          error: confirmUserError,
        } = await supabase.auth.getUser();

        if (confirmUserError || !confirmedUser) {
          const message = confirmUserError
            ? getAuthErrorMessage(confirmUserError)
            : "No se pudo confirmar la sesion de recuperacion.";
          logResetPasswordUpdateResult(false, message);
          throw new Error(message);
        }

        logResetPasswordUpdateResult(true);
        await auditPasswordResetSuccess(supabase);

        setSessionState("success");
        setNotice("Contrasena actualizada correctamente. Te llevaremos al login.");
        await delay(1800);
        await supabase.auth.signOut();
        router.replace("/login");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo actualizar la contrasena. Solicita un nuevo enlace."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [formData.confirmPassword, formData.password, router, sessionState, submitting]
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-950 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Cambiar contrasena
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Ingresa una nueva contrasena para recuperar el acceso a InmoScore.
            </p>
          </div>

          {sessionState === "checking" && (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin" />
              Validando enlace de recuperacion...
            </div>
          )}

          {sessionState === "invalid" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                <div className="mb-2 flex items-center gap-2 font-bold">
                  <ShieldAlert className="h-5 w-5" />
                  Enlace invalido o expirado
                </div>
                {error ||
                  "Solicita un nuevo correo de recuperacion desde la pantalla de login."}
              </div>
              <Link
                href="/login"
                className="block w-full rounded-xl bg-blue-700 px-4 py-3 text-center font-bold text-white transition hover:bg-blue-800"
              >
                Volver al login
              </Link>
            </div>
          )}

          {((sessionState === "ready" && user) || sessionState === "success") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nueva contrasena
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={handleChange("password")}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  disabled={submitting || sessionState === "success"}
                />
                {passwordTooShort && (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    Debe tener al menos 6 caracteres.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Confirmar contrasena
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange("confirmPassword")}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  disabled={submitting || sessionState === "success"}
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}

              {notice && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  {notice}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || sessionState === "success"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                Actualizar contrasena
              </button>

              <Link
                href="/login"
                className="block text-center text-sm font-bold text-blue-700 hover:text-blue-900"
              >
                Volver al login
              </Link>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
