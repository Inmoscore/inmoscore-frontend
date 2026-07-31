"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  LoaderCircle,
  LogOut,
  MailCheck,
  RefreshCw,
  Send,
} from "lucide-react";
import { clearSession, getToken } from "@/lib/auth";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_DELAYS_MS = [15_000, 30_000, 60_000, 120_000] as const;

type AccountStatusResponse = {
  success?: boolean;
  message?: string;
  account?: {
    email_verified?: boolean;
    email_verified_at?: string | null;
    session_reissue_required?: boolean;
  };
};

export default function CorreoPendientePage() {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const pollAttemptRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [checking, setChecking] = useState(true);
  const [resending, setResending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState(
    "Revisa tu bandeja de entrada y la carpeta de correo no deseado."
  );
  const [error, setError] = useState("");

  const finishConfirmedFlow = useCallback(() => {
    if (confirmed) return;
    setConfirmed(true);
    setMessage("Correo confirmado. Debes iniciar sesion nuevamente para habilitar tu cuenta.");
    clearSession();
    window.setTimeout(() => {
      router.replace("/login?email_verified=success");
    }, 1200);
  }, [confirmed, router]);

  const scheduleNextPoll = useCallback((checkStatus: () => Promise<void>) => {
    if (!mountedRef.current || document.visibilityState !== "visible") return;

    const delay =
      POLL_DELAYS_MS[Math.min(pollAttemptRef.current, POLL_DELAYS_MS.length - 1)];
    pollAttemptRef.current += 1;
    timerRef.current = window.setTimeout(() => {
      void checkStatus();
    }, delay);
  }, []);

  const checkStatus = useCallback(
    async (manual = false) => {
      if (requestInFlightRef.current || confirmed) return;

      const token = getToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      if (!API_URL) {
        setChecking(false);
        setError("La URL del backend no esta configurada.");
        return;
      }

      requestInFlightRef.current = true;
      if (manual) setChecking(true);

      try {
        const response = await globalThis.fetch(`${API_URL}/api/account/status`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as AccountStatusResponse | null;

        if (response.status === 401 || response.status === 403) {
          clearSession();
          router.replace("/login");
          return;
        }

        if (!response.ok || !data?.success || !data.account) {
          throw new Error(data?.message || "No se pudo consultar el estado de la cuenta.");
        }

        if (data.account.email_verified) {
          finishConfirmedFlow();
          return;
        }

        setError("");
        if (manual) {
          setMessage("La confirmacion aun no aparece. Espera unos segundos y vuelve a intentar.");
        }
      } catch (statusError) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : "No se pudo consultar el estado de la cuenta."
        );
      } finally {
        requestInFlightRef.current = false;
        setChecking(false);
        if (!confirmed) {
          scheduleNextPoll(() => checkStatus(false));
        }
      }
    },
    [confirmed, finishConfirmedFlow, router, scheduleNextPoll]
  );

  useEffect(() => {
    mountedRef.current = true;
    void checkStatus(false);

    const onVisibilityChange = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (document.visibilityState === "visible" && !confirmed) {
        pollAttemptRef.current = 0;
        void checkStatus(false);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [checkStatus, confirmed]);

  const resendVerification = async () => {
    const token = getToken();
    if (!token || !API_URL || resending) return;

    setResending(true);
    setError("");
    try {
      const response = await globalThis.fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo reenviar el correo.");
      }

      setMessage(data.message || "Correo de verificacion reenviado.");
      pollAttemptRef.current = 0;
    } catch (resendError) {
      setError(
        resendError instanceof Error ? resendError.message : "No se pudo reenviar el correo."
      );
    } finally {
      setResending(false);
    }
  };

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <PageContainer>
        <div className="mx-auto max-w-2xl space-y-6">
          <SectionHeader
            eyebrow="Seguridad de la cuenta"
            title="Correo pendiente de verificacion"
            description="Tu dashboard basico sigue disponible, pero las operaciones sensibles permanecen bloqueadas hasta confirmar el correo y volver a iniciar sesion."
          />

          <ActionBanner
            tone={confirmed ? "success" : "warning"}
            title={confirmed ? "Correo confirmado" : "Confirma que controlas este correo"}
            description={message}
          />

          <AppCard>
            <div className="space-y-5 p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  {confirmed ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <MailCheck className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h2 className="font-black text-slate-950">Pasos para continuar</h2>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">
                    <li>Abre el mensaje de confirmacion enviado por InmoScore.</li>
                    <li>Usa el enlace de verificacion.</li>
                    <li>Regresa aqui y selecciona “Ya confirme mi correo”.</li>
                    <li>Inicia sesion nuevamente para obtener una sesion completa.</li>
                  </ol>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                  {error}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void checkStatus(true)}
                  disabled={checking || confirmed}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {checking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Ya confirme mi correo
                </button>
                <button
                  type="button"
                  onClick={() => void resendVerification()}
                  disabled={resending || confirmed}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {resending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Reenviar confirmacion
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                <Link href="/dashboard" className="text-sm font-bold text-blue-700 hover:underline">
                  Volver al dashboard limitado
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-slate-950"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesion
                </button>
              </div>
            </div>
          </AppCard>
        </div>
      </PageContainer>
    </main>
  );
}
