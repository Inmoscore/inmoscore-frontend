"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  KeyRound,
  LogOut,
  MailCheck,
  MailWarning,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { clearSession, getToken } from "@/lib/auth";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { MetricCard } from "@/components/ui/MetricCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { emailVerificationFetch as fetch } from "@/lib/emailVerification";

type AccountStatus = {
  email_verified: boolean;
  email_verified_at: string | null;
  session_reissue_required?: boolean;
  phone_verified: boolean;
  phone_verified_at: string | null;
  available_credits: number;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

function formatDate(value: string | null) {
  if (!value) return "Pendiente";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ConfiguracionPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [resetEmail, setResetEmail] = useState("");

  const token = useMemo(() => getToken(), []);

  const loadAccount = async () => {
    if (!API_URL || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/account/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar el estado de cuenta");
      }

      if (!data.account.email_verified || data.account.session_reissue_required) {
        router.replace("/correo-pendiente");
        return;
      }

      setAccount(data.account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el estado de cuenta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    loadAccount();
  }, [router, token]);

  const handleLogout = () => {
    clearSession();
    router.replace("/login");
  };

  const resendVerification = async () => {
    if (!API_URL || !token || resending) return;

    try {
      setResending(true);
      setError("");
      setMessage("");
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo reenviar la verificacion");
      }

      setMessage(data.message || "Correo reenviado");
      await loadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reenviar la verificacion");
    } finally {
      setResending(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!API_URL || !token || changingPassword) return;

    if (passwordForm.new_password.length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres");
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError("Las contrasenas no coinciden");
      return;
    }

    try {
      setChangingPassword(true);
      setError("");
      setMessage("");
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cambiar la contrasena");
      }

      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setMessage(data.message || "Contrasena actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contrasena");
    } finally {
      setChangingPassword(false);
    }
  };

  const requestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!API_URL || resetting) return;

    try {
      setResetting(true);
      setError("");
      setMessage("");
      const response = await fetch(`${API_URL}/api/auth/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo solicitar recuperacion");
      }

      setMessage(data.message || "Solicitud enviada");
      setResetEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar recuperacion");
    } finally {
      setResetting(false);
    }
  };

  const emailVerified = Boolean(account?.email_verified);
  const phoneVerified = Boolean(account?.phone_verified);
  const credits = account?.available_credits ?? 0;

  return (
    <PlatformShell
      title="Configuracion"
      eyebrow="Cuenta"
      description="Seguridad, verificacion y creditos disponibles."
    >
      <PageContainer>
        {!loading && !emailVerified && (
          <ActionBanner
            tone="warning"
            title="Correo pendiente de verificacion"
            description="Verifica tu correo para activar el bono adicional y reforzar la seguridad de tu cuenta."
            action={
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-900 px-5 py-2 text-sm font-black text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <MailCheck className="h-4 w-4" />
                {resending ? "Enviando..." : "Reenviar verificacion"}
              </button>
            }
          />
        )}

        {(message || error) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error || message}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Correo"
            value={emailVerified ? "Verificado" : "Pendiente"}
            description={formatDate(account?.email_verified_at || null)}
            icon={emailVerified ? MailCheck : MailWarning}
          />
          <MetricCard
            label="Telefono"
            value={phoneVerified ? "Verificado" : "Proximamente"}
            description={formatDate(account?.phone_verified_at || null)}
            icon={Smartphone}
          />
          <MetricCard
            label="Creditos disponibles"
            value={loading ? "..." : String(credits)}
            description="Consultas extra activas."
            icon={CreditCard}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <AppCard>
            <SectionHeader
              eyebrow="Seguridad"
              title="Acceso y contrasena"
              action={
                <StatusBadge tone={emailVerified ? "success" : "warning"}>
                  {emailVerified ? "Correo verificado" : "Correo pendiente"}
                </StatusBadge>
              }
            />

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <form onSubmit={changePassword} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <KeyRound className="h-4 w-4" />
                  Cambiar contrasena
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        current_password: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Contrasena actual"
                    autoComplete="current-password"
                    required
                  />
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        new_password: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Nueva contrasena"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirm_password: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Confirmar nueva contrasena"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {changingPassword ? "Guardando..." : "Actualizar contrasena"}
                  </button>
                </div>
              </form>

              <form onSubmit={requestReset} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <ShieldCheck className="h-4 w-4" />
                  Olvide mi contrasena
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    className={inputClass}
                    placeholder="correo@ejemplo.com"
                    autoComplete="email"
                    required
                  />
                  <button
                    type="submit"
                    disabled={resetting}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {resetting ? "Enviando..." : "Enviar recuperacion"}
                  </button>
                </div>
              </form>
            </div>
          </AppCard>

          <AppCard>
            <SectionHeader eyebrow="Onboarding" title="Checklist" />
            <div className="mt-5 grid gap-3">
              {[
                ["Registro completado", true, "Credito inicial aplicado"],
                ["Verificar correo", emailVerified, "+1 consulta"],
                ["Verificar telefono", phoneVerified, "+1 consulta futura"],
                ["Consultas disponibles", credits > 0, `${credits} creditos activos`],
              ].map(([label, done, detail]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        done ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-slate-950">{label}</span>
                      <span className="block text-xs text-slate-500">{detail}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/legal/verificacion-identidad"
              className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-50"
            >
              Verificacion de identidad
            </Link>
          </AppCard>
        </div>

        <AppCard>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-black text-slate-950">Sesion activa</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Cierra sesion desde aqui si estas usando un equipo compartido.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          </div>
        </AppCard>
      </PageContainer>
    </PlatformShell>
  );
}
