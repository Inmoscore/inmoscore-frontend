"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  MailWarning,
  Search,
} from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { MetricCard } from "@/components/ui/MetricCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VerificationRequiredCard } from "@/components/identity/VerificationRequiredCard";
import { getToken } from "@/lib/auth";
import {
  fetchCurrentIdentityUser,
  isIdentityVerified,
  type IdentityAwareUser,
} from "@/lib/identityVerification";

type DashboardUser = IdentityAwareUser & {
  email?: string;
  nombre?: string;
  fullName?: string;
  tipo_usuario?: string;
  plan_type?: string;
  daily_search_limit?: number | null;
  bonus_credits_available?: number | null;
  email_verified?: boolean | null;
  email_verified_at?: string | null;
  phone_verified?: boolean | null;
  phone_verified_at?: string | null;
  identity_verification_status?: string | null;
};

function getStoredUser(): DashboardUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user") || localStorage.getItem("inmoscore_user");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DashboardUser;
  } catch {
    return null;
  }
}

const primaryActions = [
  {
    title: "Buscar",
    description: "Consulta por cédula y revisa score, señales e historial disponible.",
    href: "/buscar",
    icon: Search,
  },
  {
    title: "Aportar historial",
    description: "Registra una experiencia arrendaticia verificable para revisión.",
    href: "/aportar-historial",
    icon: ClipboardCheck,
  },
  {
    title: "Reportar",
    description: "Radica un incumplimiento con evidencia y declaración legal.",
    href: "/reportar",
    icon: FileCheck2,
  },
];

function formatIdentityStatus(status?: string | null) {
  if (!status) return "Pendiente";
  return status.replaceAll("_", " ");
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);

    if (storedUser?.tipo_usuario === "admin") {
      router.replace("/admin");
      return;
    }

    const token = getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (token && apiUrl) {
      fetch(`${apiUrl}/api/account/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data?.success && data.account) {
            if (data.account.session_reissue_required) {
              router.replace("/correo-pendiente");
              return;
            }

            setUser((current) => ({
              ...(current || {}),
              email_verified: data.account.email_verified,
              email_verified_at: data.account.email_verified_at,
              phone_verified: data.account.phone_verified,
              phone_verified_at: data.account.phone_verified_at,
              bonus_credits_available: data.account.available_credits,
            }));

            if (data.account.email_verified) {
              void fetchCurrentIdentityUser(apiUrl)
                .then((identityUser) => {
                  if (identityUser) {
                    setUser((current) => ({ ...(current || {}), ...identityUser }));
                  }
                })
                .catch(() => {
                  // Keep the dashboard usable from the stored session when identity refresh fails.
                });
            }
          }
        })
        .catch(() => {
          // The dashboard remains usable with the local session snapshot.
        });
    }
  }, [router]);

  const displayName = user?.nombre || user?.fullName || user?.email || "tu operación";
  const plan = user?.plan_type || (user?.tipo_usuario === "admin" ? "admin" : "free");
  const dailyLimit =
    user?.daily_search_limit === null
      ? "Ilimitadas"
      : typeof user?.daily_search_limit === "number"
        ? String(user.daily_search_limit)
        : plan === "admin"
          ? "Ilimitadas"
          : "Según plan";
  const bonusCredits = user?.bonus_credits_available ?? 0;
  const identityStatus = formatIdentityStatus(user?.identity_verification_status);
  const identityVerified = isIdentityVerified(user);
  const emailVerified = Boolean(user?.email_verified);

  return (
    <PlatformShell
      title="Dashboard"
      eyebrow="Inicio"
      description="Tres acciones principales para consultar, aportar o reportar."
      user={user}
    >
      <PageContainer>
        <ActionBanner
          tone="dark"
          title={`Hola, ${displayName}`}
          description="Empieza por una búsqueda. Si tienes soporte verificable, aporta historial o radica un reporte con evidencia."
          action={
            <Link
              href="/buscar"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-100"
            >
              Buscar ahora
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        {!identityVerified && (
          <VerificationRequiredCard title="Verifica tu identidad para reportar o aportar historial" />
        )}

        {!emailVerified && (
          <ActionBanner
            tone="warning"
            title="Verifica tu correo"
            description="Tu cuenta puede seguir operando, pero el bono por correo verificado y las mejoras de seguridad quedan pendientes."
            action={
              <Link
                href="/configuracion"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-900 px-5 py-2 text-sm font-black text-white transition hover:bg-amber-800"
              >
                <MailWarning className="h-4 w-4" />
                Revisar seguridad
              </Link>
            }
          />
        )}

        <section className="grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Consultas disponibles"
            value={dailyLimit}
            description="Cupo operativo según tu plan."
            icon={Search}
          />
          <MetricCard
            label="Créditos extra"
            value={bonusCredits}
            description="Bonos disponibles para consultas adicionales."
            icon={CreditCard}
          />
          <MetricCard
            label="Verificación identidad"
            value={identityStatus}
            description="Estado requerido para flujos sensibles."
            icon={BadgeCheck}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {primaryActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-lg font-black text-slate-950">{action.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{action.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-950">
                  Abrir
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <AppCard>
            <SectionHeader
              eyebrow="Próximos pasos"
              title="Qué hacer ahora"
              description="Elige una sola ruta según lo que tienes en este momento."
            />
            <div className="mt-5 grid gap-3">
              {[
                ["Tengo una cédula", "Buscar un perfil de riesgo", "/buscar"],
                ["Tengo historial positivo o verificable", "Aportar historial", "/aportar-historial"],
                ["Tengo evidencia de incumplimiento", "Reportar incumplimiento", "/reportar"],
              ].map(([context, action, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm"
                >
                  <span>
                    <span className="block text-sm font-black text-slate-950">{context}</span>
                    <span className="mt-1 block text-sm text-slate-600">{action}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
                </Link>
              ))}
            </div>
          </AppCard>

          <AppCard>
            <SectionHeader
              eyebrow="Cuenta"
              title="Plan y seguridad"
              action={<StatusBadge tone="info">Plan {plan.toUpperCase()}</StatusBadge>}
            />
            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
              <p>
                Mantén tu identidad verificada y revisa tu plan cuando necesites más consultas o créditos.
              </p>
              <div className="grid gap-2">
                <Link
                  href="/legal/verificacion-identidad"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 font-black text-slate-950 transition hover:bg-slate-50"
                >
                  Verificar identidad
                </Link>
                <Link
                  href="/upgrade"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 font-black text-white transition hover:bg-slate-800"
                >
                  Ver plan
                </Link>
              </div>
            </div>
          </AppCard>
        </div>
      </PageContainer>
    </PlatformShell>
  );
}
