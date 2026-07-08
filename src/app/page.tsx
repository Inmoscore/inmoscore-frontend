"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gavel,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { clearSession, hasSession } from "@/lib/auth";

type SessionUser = {
  id: string;
  nombre?: string;
  fullName?: string;
  email: string;
  tipo_usuario?: string;
};

function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;

  const raw =
    localStorage.getItem("user") || localStorage.getItem("inmoscore_user");

  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const [logueado, setLogueado] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const sessionExists = hasSession();
    setLogueado(sessionExists);
    setUser(sessionExists ? getStoredUser() : null);
  }, []);

  const esAdmin = useMemo(() => user?.tipo_usuario === "admin", [user]);

  const handleBuscar = () => {
    if (!logueado) {
      router.push("/login?redirect=/buscar");
      return;
    }

    router.push("/buscar");
  };

  const handleReportar = () => {
    if (!logueado) {
      router.push("/login?redirect=/reportar");
      return;
    }

    router.push("/reportar");
  };

  const handleAportarHistorial = () => {
    if (!logueado) {
      router.push("/login?redirect=/aportar-historial");
      return;
    }

    router.push("/aportar-historial");
  };

  const handleAdmin = () => {
    if (!logueado) {
      router.push("/login?redirect=/admin");
      return;
    }

    router.push("/admin");
  };

  const handleLogout = () => {
    clearSession();
    setLogueado(false);
    setUser(null);
    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  const handleRegister = () => {
    router.push("/register");
  };

  const displayName = user?.nombre || user?.fullName || user?.email || "Usuario";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.38),_transparent_34%),linear-gradient(135deg,#07111f_0%,#0f172a_48%,#111827_100%)]">
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-left text-2xl font-black tracking-tight"
            >
              InmoScore
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {logueado && user ? (
                <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs text-slate-200">
                  {displayName}
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleBuscar}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Buscar
              </button>
              <button
                type="button"
                onClick={handleAportarHistorial}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Aportar historial
              </button>
              <button
                type="button"
                onClick={() => router.push("/upgrade")}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Planes
              </button>
              {!logueado ? (
                <button
                  type="button"
                  onClick={handleLogin}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
                >
                  Ingresar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
                >
                  Salir
                </button>
              )}
            </div>
          </header>

          <div className="grid min-h-[calc(100vh-96px)] items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                <ShieldCheck className="h-4 w-4" />
                Riesgo inmobiliario con trazabilidad legal
              </div>
              <h1 className="max-w-4xl text-4xl font-black leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
                Decide a quién arrendar con señales verificadas, no con intuición.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                InmoScore ayuda a propietarios e inmobiliarias en Colombia a consultar riesgo, revisar reportes verificados y documentar decisiones con cumplimiento, evidencia y control humano.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleBuscar}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-4 text-base font-black text-white shadow-xl shadow-blue-950/40 transition hover:bg-blue-400"
                >
                  Consultar riesgo
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/upgrade")}
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-4 text-base font-bold text-white transition hover:bg-white/15"
                >
                  Ver planes
                </button>
                <button
                  type="button"
                  onClick={handleAportarHistorial}
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-6 py-4 text-base font-bold text-emerald-50 transition hover:bg-emerald-300/15"
                >
                  Aportar historial
                </button>
              </div>
              <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                {["Identidad verificada", "Reportes con evidencia", "Contradicción trazable"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-slate-950/60 backdrop-blur">
              <div className="rounded-[1.5rem] bg-slate-950/70 p-5 ring-1 ring-white/10">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-400">Consulta simulada</p>
                    <h2 className="mt-1 text-2xl font-black">Perfil de riesgo</h2>
                  </div>
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">
                    Revisión recomendada
                  </span>
                </div>
                <div className="grid gap-4 py-6 sm:grid-cols-[160px_1fr]">
                  <div className="flex aspect-square items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-blue-500 text-5xl font-black text-white">
                    82
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs font-bold uppercase text-slate-400">Clasificación</p>
                      <p className="mt-1 text-xl font-black text-emerald-200">Riesgo bajo moderado</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs font-bold uppercase text-slate-400">Base documental</p>
                      <p className="mt-1 text-sm text-slate-200">Señales aprobadas, reportes elegibles y trazabilidad legal.</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["3", "Reportes verificados"],
                    ["0", "Contradicciones activas"],
                    ["v1", "Modelo score"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-2xl font-black">{value}</p>
                      <p className="mt-1 text-xs text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-5 py-16 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: UserRoundCheck, title: "Para propietarios", text: "Consulta señales relevantes antes de entregar tu inmueble y documenta decisiones con mayor confianza." },
              { icon: Building2, title: "Para inmobiliarias", text: "Centraliza consultas, reportes y criterios de riesgo para equipos comerciales y operativos." },
              { icon: FileCheck2, title: "Reportes verificados", text: "Cada reporte debe pasar por identidad, evidencia, declaración legal y revisión administrativa." },
              { icon: Gavel, title: "Cumplimiento", text: "Trazabilidad de notificación, contradicción y elegibilidad antes de impactar scoring." },
            ].map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <item.icon className="h-7 w-7 text-blue-700" />
                <h3 className="mt-5 text-lg font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">Cómo funciona</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Un flujo diseñado para vender confianza, no solo mostrar datos.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                La plataforma combina consultas, reportes verificados, planes de uso y revisión humana para soportar decisiones comerciales sin automatizar consecuencias sensibles.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["01", "Consulta", "Ingresa la cédula y revisa score, señales y advertencias legales."],
                ["02", "Evalúa", "Interpreta clasificación, explicación y factores con cautelas visibles."],
                ["03", "Reporta", "Aporta casos con evidencia y declaración legal cuando corresponda."],
                ["04", "Escala", "Elige un plan para aumentar búsquedas y cobertura operativa."],
              ].map(([step, title, text]) => (
                <article key={step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="text-sm font-black text-blue-700">{step}</span>
                  <h3 className="mt-3 text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </div>

          <section className="mt-16 overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-100">
                  <ClipboardCheck className="h-4 w-4" />
                  Historial informativo
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                  Aporta historial arrendaticio verificado
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300">
                  Comparte información básica y verificable de una experiencia de arriendo para que otros arrendadores tengan más contexto antes de decidir.
                </p>
                <button
                  type="button"
                  onClick={handleAportarHistorial}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                >
                  Aportar historial
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "No es un reporte negativo ni una sanción.",
                  "No afecta el score automáticamente.",
                  "Requiere revisión y verificación administrativa.",
                  "Puede otorgar créditos si el aporte es verificado.",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="mt-16 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
                  <LockKeyhole className="h-4 w-4" />
                  Planes para cada ritmo de operación
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-tight">Empieza gratis y escala cuando el equipo lo necesite.</h2>
                <p className="mt-3 max-w-2xl text-slate-300">
                  Free, Básico, Pro y Empresa cubren desde consultas ocasionales hasta operación inmobiliaria intensiva.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/upgrade")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-4 font-black text-slate-950 transition hover:bg-slate-100"
              >
                Ver planes
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <section className="mt-16">
            <h2 className="text-2xl font-black tracking-tight">Preguntas frecuentes</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                ["¿El score decide automáticamente?", "No. Es una señal de apoyo y puede requerir revisión humana según el caso."],
                ["¿Un reporte nuevo impacta de inmediato?", "No. Debe superar revisión, elegibilidad y contradicción cuando aplique."],
                ["¿Hay pagos en línea?", "Los planes Basic y Pro usan el flujo de Wompi integrado en la plataforma."],
              ].map(([q, a]) => (
                <article key={q} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="font-black">{q}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{a}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleBuscar}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-4 font-black text-white transition hover:bg-blue-800"
            >
              Consultar riesgo
              <BarChart3 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleReportar}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-4 font-bold text-slate-950 transition hover:bg-slate-100"
            >
              Reportar con evidencia
            </button>
            <button
              type="button"
              onClick={handleAportarHistorial}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-4 font-bold text-slate-950 transition hover:bg-slate-100"
            >
              Aportar historial
              <ClipboardCheck className="h-5 w-5 text-blue-700" />
            </button>
            {esAdmin && (
              <button
                type="button"
                onClick={handleAdmin}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-4 font-bold text-slate-950 transition hover:bg-slate-100"
              >
                Panel Admin
              </button>
            )}
            {!logueado && (
              <button
                type="button"
                onClick={handleRegister}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-4 font-bold text-slate-950 transition hover:bg-slate-100"
              >
                Crear cuenta
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
