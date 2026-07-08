"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AlertTriangle, ArrowRight, FileSearch, Scale, ShieldCheck } from "lucide-react";
import { getToken } from "@/lib/auth";
import { uploadSecureDocument } from "@/lib/secureDocuments";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkflowStepper } from "@/components/workflows/WorkflowStepper";

type TargetType = "report" | "judicial_signal" | "score" | "search_result" | "other";
type DisputeType =
  | "inaccurate"
  | "outdated"
  | "paid_or_resolved"
  | "identity_theft"
  | "unauthorized_processing"
  | "not_mine"
  | "other";

type DisputeResponse = {
  success?: boolean;
  message?: string;
  dispute?: {
    id: string;
    status: string;
    submitted_at: string;
    due_at: string;
  };
};

const targetTypes: Array<{ value: TargetType; label: string }> = [
  { value: "report", label: "Reporte" },
  { value: "judicial_signal", label: "Señal judicial" },
  { value: "score", label: "Score" },
  { value: "search_result", label: "Resultado de búsqueda" },
  { value: "other", label: "Otro" },
];

const disputeTypes: Array<{ value: DisputeType; label: string }> = [
  { value: "inaccurate", label: "Dato inexacto" },
  { value: "outdated", label: "Dato desactualizado" },
  { value: "paid_or_resolved", label: "Pagado o resuelto" },
  { value: "identity_theft", label: "Suplantación" },
  { value: "unauthorized_processing", label: "Tratamiento no autorizado" },
  { value: "not_mine", label: "No corresponde a mí" },
  { value: "other", label: "Otra disputa" },
];

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-100";

const legalLinks = [
  ["Solicitudes de datos", "/legal/solicitudes-datos"],
  ["Revisión humana", "/legal/revision-humana"],
  ["Verificación identidad", "/legal/verificacion-identidad"],
];

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

export default function DisputasPage() {
  const [form, setForm] = useState({
    requester_name: "",
    requester_email: "",
    requester_document_id: "",
    target_type: "report" as TargetType,
    target_reference: "",
    dispute_type: "inaccurate" as DisputeType,
    description: "",
    evidence_url: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [createdDispute, setCreatedDispute] = useState<DisputeResponse["dispute"] | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

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
    const evidenceUrl = form.evidence_url.trim();
    const targetReference = form.target_reference.trim();
    const targetId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetReference)
        ? targetReference
        : null;

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
      setError("Describe la disputa con al menos 20 caracteres.");
      setStatus("error");
      return;
    }

    if (evidenceUrl && !/^https?:\/\/\S+$/i.test(evidenceUrl)) {
      setError("El enlace de evidencia debe iniciar con http:// o https://.");
      setStatus("error");
      return;
    }

    const token = getToken();
    if (evidenceFile && !token) {
      setError("Debes iniciar sesiÃ³n para adjuntar documentos privados.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");

    try {
      const secureEvidence = evidenceFile && token
        ? await uploadSecureDocument({
            apiUrl: API_URL,
            token,
            file: evidenceFile,
            category: "dispute_evidence",
            relatedEntityType: "data_dispute",
            metadata: {
              target_type: form.target_type,
              dispute_type: form.dispute_type,
              source: "disputas",
            },
          })
        : null;

      const response = await fetch(`${API_URL}/api/legal/disputes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          requester_name: form.requester_name.trim() || null,
          requester_email: requesterEmail,
          requester_document_id: form.requester_document_id.trim() || null,
          target_type: form.target_type,
          target_id: targetId,
          target_reference: targetReference || null,
          dispute_type: form.dispute_type,
          description,
          evidence_url: evidenceUrl || null,
          secure_document_id: secureEvidence?.documentId || null,
        }),
      });

      const data: DisputeResponse = await response.json().catch(() => ({}));

      if (!response.ok || !data.success || !data.dispute) {
        throw new Error(data.message || "No se pudo registrar la disputa.");
      }

      setCreatedDispute(data.dispute);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la disputa.");
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
                <Link
                  key={href}
                  href={href}
                  className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  {label}
                </Link>
              ))}
            </div>
          </header>

          <ActionBanner
            tone="dark"
            title="Disputas sobre datos y reportes"
            description="Radica una controversia cuando encuentres información inexacta, desactualizada, no autorizada o que no corresponda a ti. Recibirás un número de caso y plazo estimado."
            action={<StatusBadge tone="review">Proceso formal</StatusBadge>}
          />

          {status === "success" && createdDispute ? (
            <AppCard>
              <SectionHeader
                eyebrow="Confirmación"
                title="Disputa recibida"
                description="Conserva este número para seguimiento. El equipo revisará la información y la evidencia enviada."
                action={<StatusBadge tone="success">Registrada</StatusBadge>}
              />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <ResultBox label="Número de disputa" value={createdDispute.id} mono />
                <ResultBox label="Estado" value={createdDispute.status} />
                <ResultBox label="Plazo estimado" value={formatDate(createdDispute.due_at)} />
              </div>
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                Siguiente paso: revisa tu correo y ten a mano soportes adicionales si el equipo los solicita.
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm({
                    requester_name: "",
                    requester_email: "",
                    requester_document_id: "",
                    target_type: "report",
                    target_reference: "",
                    dispute_type: "inaccurate",
                    description: "",
                    evidence_url: "",
                  });
                  setEvidenceFile(null);
                  setCreatedDispute(null);
                  setStatus("idle");
                }}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white hover:bg-slate-800"
              >
                Radicar otra disputa
              </button>
            </AppCard>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <form onSubmit={handleSubmit} className="space-y-6">
                <AppCard>
                  <SectionHeader
                    eyebrow="Proceso"
                    title="Radicación de disputa"
                    description="Completa los datos de contacto, identifica el elemento y explica por qué debe revisarse."
                    action={<StatusBadge tone={status === "error" ? "warning" : "info"}>20 caracteres mínimo</StatusBadge>}
                  />
                  <div className="mt-6">
                    <WorkflowStepper
                      currentStep={status === "error" ? "review" : "contact"}
                      steps={[
                        { key: "contact", title: "Contacto", description: "Quién radica" },
                        { key: "target", title: "Elemento", description: "Qué se disputa" },
                        { key: "review", title: "Revisión", description: "Soporte y envío" },
                      ]}
                    />
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Datos de contacto" title="Persona solicitante" />
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
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Elemento disputado" title="Información a revisar" />
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label="Tipo de elemento">
                      <select value={form.target_type} onChange={(event) => updateField("target_type", event.target.value)} disabled={status === "submitting"} className={inputClass}>
                        {targetTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Referencia o ID">
                      <input type="text" value={form.target_reference} onChange={(event) => updateField("target_reference", event.target.value)} maxLength={250} disabled={status === "submitting"} className={inputClass} />
                    </Field>
                    <Field label="Tipo de disputa">
                      <select value={form.dispute_type} onChange={(event) => updateField("dispute_type", event.target.value)} disabled={status === "submitting"} className={inputClass}>
                        {disputeTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Soporte" title="Explicación y evidencia" />
                  <Field label="Descripción">
                    <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} required minLength={20} maxLength={2500} rows={5} disabled={status === "submitting"} className={`${inputClass} min-h-32`} placeholder="Describe qué información disputas y por qué debe revisarse." />
                  </Field>
                  <p className="mt-1 text-xs text-slate-500">No incluyas contraseñas, tokens, datos bancarios ni documentos completos.</p>
                  <div className="mt-4">
                    <Field label="Enlace a evidencia">
                      <input type="url" value={form.evidence_url} onChange={(event) => updateField("evidence_url", event.target.value)} maxLength={1000} disabled={status === "submitting"} placeholder="https://..." className={inputClass} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Archivo de evidencia privado">
                      <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} disabled={status === "submitting"} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-black file:text-slate-700" />
                      {evidenceFile && <p className="mt-2 text-xs text-slate-600">{evidenceFile.name} Â· {evidenceFile.type || "sin tipo"} Â· {evidenceFile.size} bytes</p>}
                    </Field>
                  </div>

                  {error && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={status === "submitting"} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                    {status === "submitting" ? "Enviando..." : "Radicar disputa"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </AppCard>
              </form>

              <aside className="space-y-4">
                <ContextCard />
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

function ContextCard() {
  return (
    <AppCard muted>
      <SectionHeader eyebrow="Contexto" title="Qué hace este canal" />
      <div className="mt-5 space-y-3">
        {[
          [Scale, "Registra una controversia formal sobre datos, reportes, señales o score."],
          [FileSearch, "Se usa cuando hay evidencia de inexactitud, desactualización o tratamiento no autorizado."],
          [AlertTriangle, "No elimina datos ni recalcula score automáticamente."],
        ].map(([Icon, text]) => {
          const TypedIcon = Icon as typeof Scale;
          return (
            <div key={text as string} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
              <TypedIcon className="mt-0.5 h-5 w-5 text-slate-700" />
              <p className="text-sm leading-6 text-slate-700">{text as string}</p>
            </div>
          );
        })}
      </div>
    </AppCard>
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
