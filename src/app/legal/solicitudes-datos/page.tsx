"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, ClipboardCheck, Database, FileText, ShieldCheck } from "lucide-react";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

type RequestType =
  | "access"
  | "correction"
  | "deletion"
  | "authorization_revocation"
  | "claim"
  | "other";

type DataRequestResponse = {
  success?: boolean;
  message?: string;
  request?: {
    id: string;
    status: string;
    submitted_at: string;
    due_at: string;
  };
};

const requestTypes: Array<{ value: RequestType; label: string }> = [
  { value: "access", label: "Acceso a mis datos" },
  { value: "correction", label: "Corrección de datos" },
  { value: "deletion", label: "Eliminación de datos" },
  { value: "authorization_revocation", label: "Revocatoria de autorización" },
  { value: "claim", label: "Reclamo" },
  { value: "other", label: "Otra solicitud" },
];

const legalLinks = [
  ["Disputas", "/legal/disputas"],
  ["Revisión humana", "/legal/revision-humana"],
  ["Verificación identidad", "/legal/verificacion-identidad"],
];

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-100";

function formatDate(value?: string) {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return date.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SolicitudesDatosPage() {
  const [form, setForm] = useState({
    requester_name: "",
    requester_email: "",
    requester_document_id: "",
    request_type: "access" as RequestType,
    description: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] = useState<DataRequestResponse["request"] | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    if (status !== "submitting") {
      setStatus("idle");
      setError("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (status === "submitting") return;

    const requesterEmail = form.requester_email.trim().toLowerCase();
    const description = form.description.trim();

    if (!API_URL) {
      setError("La URL del backend no está configurada.");
      setStatus("error");
      return;
    }

    if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      setError("Ingresa un correo electrónico válido.");
      setStatus("error");
      return;
    }

    if (description.length < 20) {
      setError("Describe tu solicitud con al menos 20 caracteres.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/legal/data-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requester_name: form.requester_name.trim() || null,
          requester_email: requesterEmail,
          requester_document_id: form.requester_document_id.trim() || null,
          request_type: form.request_type,
          description,
        }),
      });

      const data: DataRequestResponse = await response.json().catch(() => ({}));

      if (!response.ok || !data.success || !data.request) {
        throw new Error(data.message || "No se pudo registrar la solicitud.");
      }

      setCreatedRequest(data.request);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la solicitud.");
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <PageContainer>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="text-sm font-black text-slate-700 hover:text-slate-950">
              InmoScore
            </Link>
            <div className="flex flex-wrap gap-2">
              {legalLinks.map(([label, href]) => (
                <Link key={href} href={href} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-50">
                  {label}
                </Link>
              ))}
            </div>
          </header>

          <ActionBanner
            tone="dark"
            title="Solicitudes sobre datos personales"
            description="Radica solicitudes de acceso, corrección, eliminación, revocatoria o reclamo sobre tus datos personales tratados por InmoScore."
            action={<StatusBadge tone="info">Habeas data</StatusBadge>}
          />

          {status === "success" && createdRequest ? (
            <AppCard>
              <SectionHeader
                eyebrow="Confirmación"
                title="Solicitud recibida"
                description="Tu solicitud quedó registrada con trazabilidad operativa. Conserva el número para seguimiento."
                action={<StatusBadge tone="success">Registrada</StatusBadge>}
              />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <ResultBox label="Número de solicitud" value={createdRequest.id} mono />
                <ResultBox label="Estado" value={createdRequest.status} />
                <ResultBox label="Plazo estimado" value={formatDate(createdRequest.due_at)} />
              </div>
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                Siguiente paso: revisa tu correo. Si la solicitud requiere validación adicional, el equipo te indicará qué información falta.
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm({
                    requester_name: "",
                    requester_email: "",
                    requester_document_id: "",
                    request_type: "access",
                    description: "",
                  });
                  setCreatedRequest(null);
                  setStatus("idle");
                }}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white hover:bg-slate-800"
              >
                Radicar otra solicitud
              </button>
            </AppCard>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <form onSubmit={handleSubmit} className="space-y-6">
                <AppCard>
                  <SectionHeader
                    eyebrow="Formulario"
                    title="Radicación de solicitud"
                    description="Identifícate, selecciona el tipo de solicitud y describe qué necesitas que revisemos."
                    action={<StatusBadge tone={status === "error" ? "warning" : "info"}>20 caracteres mínimo</StatusBadge>}
                  />
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label="Nombre">
                      <input type="text" value={form.requester_name} onChange={(event) => updateField("requester_name", event.target.value)} maxLength={150} disabled={status === "submitting"} className={inputClass} />
                    </Field>
                    <Field label="Correo electrónico">
                      <input type="email" value={form.requester_email} onChange={(event) => updateField("requester_email", event.target.value)} required disabled={status === "submitting"} className={inputClass} />
                    </Field>
                    <Field label="Documento">
                      <input type="text" value={form.requester_document_id} onChange={(event) => updateField("requester_document_id", event.target.value)} maxLength={80} disabled={status === "submitting"} className={inputClass} />
                    </Field>
                    <Field label="Tipo de solicitud">
                      <select value={form.request_type} onChange={(event) => updateField("request_type", event.target.value as RequestType)} disabled={status === "submitting"} className={inputClass}>
                        {requestTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Detalle" title="Qué necesitas" description="Describe la solicitud sin adjuntar datos sensibles completos." />
                  <Field label="Descripción">
                    <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} required minLength={20} maxLength={2000} rows={6} disabled={status === "submitting"} className={`${inputClass} min-h-36`} placeholder="Describe de forma clara qué necesitas que revisemos." />
                  </Field>
                  <span className="mt-1 block text-xs text-slate-500">
                    No incluyas contraseñas, tokens, datos bancarios ni documentos completos.
                  </span>

                  {error && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={status === "submitting"} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                    {status === "submitting" ? "Enviando..." : "Radicar solicitud"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </AppCard>
              </form>

              <aside className="space-y-4">
                <AppCard muted>
                  <SectionHeader eyebrow="Contexto" title="Qué hace este proceso" />
                  <div className="mt-5 space-y-3">
                    {[
                      [Database, "Registra solicitudes sobre datos personales y deja trazabilidad del caso."],
                      [ClipboardCheck, "Úsalo para acceso, corrección, eliminación, revocatoria o reclamos generales."],
                      [FileText, "No elimina ni modifica datos automáticamente al radicar la solicitud."],
                    ].map(([Icon, text]) => {
                      const TypedIcon = Icon as typeof Database;
                      return (
                        <div key={text as string} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                          <TypedIcon className="mt-0.5 h-5 w-5 text-slate-700" />
                          <p className="text-sm leading-6 text-slate-700">{text as string}</p>
                        </div>
                      );
                    })}
                  </div>
                </AppCard>
                <CrossLinks />
              </aside>
            </div>
          )}
        </PageContainer>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-900">{label}</span>
      {children}
    </label>
  );
}

function ResultBox({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 break-all text-sm font-black text-slate-950 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function CrossLinks() {
  return (
    <AppCard>
      <SectionHeader eyebrow="Centro legal" title="Canales relacionados" />
      <div className="mt-5 grid gap-2">
        {legalLinks.map(([label, href]) => (
          <Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-800 hover:bg-white">
            {label}
            <ShieldCheck className="h-4 w-4 text-slate-500" />
          </Link>
        ))}
      </div>
    </AppCard>
  );
}
