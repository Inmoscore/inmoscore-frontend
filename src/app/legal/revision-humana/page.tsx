"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Brain, FileSearch, Scale, ShieldCheck } from "lucide-react";
import { getToken } from "@/lib/auth";
import { uploadSecureDocument } from "@/lib/secureDocuments";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkflowStepper } from "@/components/workflows/WorkflowStepper";

type HumanReviewReason =
  | "disputed_information"
  | "outdated_information"
  | "inaccurate_score"
  | "identity_theft"
  | "automated_decision_concern"
  | "other";

type HumanReviewResponse = {
  success?: boolean;
  message?: string;
  request?: {
    id: string;
    status: string;
    created_at: string;
  };
};

const reasonOptions: Array<{ value: HumanReviewReason; label: string }> = [
  { value: "disputed_information", label: "Información en disputa" },
  { value: "outdated_information", label: "Información desactualizada" },
  { value: "inaccurate_score", label: "Score posiblemente inexacto" },
  { value: "identity_theft", label: "Suplantación o robo de identidad" },
  { value: "automated_decision_concern", label: "Preocupación por decisión automatizada" },
  { value: "other", label: "Otro motivo" },
];

const legalLinks = [
  ["Solicitudes de datos", "/legal/solicitudes-datos"],
  ["Disputas", "/legal/disputas"],
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

function RevisionHumanaContent() {
  const searchParams = useSearchParams();
  const initialForm = useMemo(
    () => ({
      requester_name: "",
      requester_email: "",
      requester_document_id: "",
      cedula_consultada: searchParams.get("cedula") || "",
      current_score: searchParams.get("score") || "",
      current_classification: searchParams.get("classification") || "",
      reason: "automated_decision_concern" as HumanReviewReason,
      description: "",
    }),
    [searchParams]
  );

  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] = useState<HumanReviewResponse["request"] | null>(null);
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
    const scoreText = form.current_score.trim();
    const currentScore = scoreText === "" ? null : Number(scoreText);

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

    if (
      scoreText &&
      (currentScore === null ||
        !Number.isInteger(currentScore) ||
        currentScore < 0 ||
        currentScore > 100)
    ) {
      setError("El score debe ser un número entero entre 0 y 100.");
      setStatus("error");
      return;
    }

    if (form.cedula_consultada.trim() && !/^\d{5,15}$/.test(form.cedula_consultada.trim())) {
      setError("La cédula consultada debe contener entre 5 y 15 dígitos.");
      setStatus("error");
      return;
    }

    if (description.length < 20) {
      setError("Describe la situación con al menos 20 caracteres.");
      setStatus("error");
      return;
    }

    const token = getToken();
    if (evidenceFile && !token) {
      setError("Debes iniciar sesiÃ³n para adjuntar documentos privados.");
      setStatus("error");
      return;
    }

    try {
      setStatus("submitting");
      setError("");

      const secureEvidence = evidenceFile && token
        ? await uploadSecureDocument({
            apiUrl: API_URL,
            token,
            file: evidenceFile,
            category: "human_review_evidence",
            relatedEntityType: "human_review_request",
            metadata: {
              reason: form.reason,
              source: "revision-humana",
            },
          })
        : null;

      const response = await fetch(`${API_URL}/api/legal/human-review-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          requester_email: requesterEmail,
          requester_name: form.requester_name.trim() || null,
          requester_document_id: form.requester_document_id.trim() || null,
          cedula_consultada: form.cedula_consultada.trim() || null,
          current_score: currentScore,
          current_classification: form.current_classification.trim() || null,
          reason: form.reason,
          description,
          secure_document_ids: secureEvidence ? [secureEvidence.documentId] : [],
        }),
      });

      const data: HumanReviewResponse = await response.json();

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
            title="Solicitar revisión humana"
            description="Usa este canal cuando un score o resultado automatizado requiere evaluación humana por contexto, disputa, suplantación o posible inexactitud."
            action={<StatusBadge tone="review">Intervención humana</StatusBadge>}
          />

          {status === "success" && createdRequest ? (
            <AppCard>
              <SectionHeader
                eyebrow="Confirmación"
                title="Solicitud recibida"
                description="Conserva este número para seguimiento. La solicitud no recalcula ni modifica datos automáticamente."
                action={<StatusBadge tone="success">Registrada</StatusBadge>}
              />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <ResultBox label="Número de solicitud" value={createdRequest.id} mono />
                <ResultBox label="Estado" value={createdRequest.status} />
                <ResultBox label="Radicación" value={formatDate(createdRequest.created_at)} />
              </div>
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                Siguiente paso: el equipo revisará el contexto enviado. Si necesitas controvertir datos concretos, también puedes abrir una disputa.
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setCreatedRequest(null);
                  setEvidenceFile(null);
                  setStatus("idle");
                }}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white hover:bg-slate-800"
              >
                Crear otra solicitud
              </button>
            </AppCard>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <form onSubmit={handleSubmit} className="space-y-6">
                <AppCard>
                  <SectionHeader
                    eyebrow="Proceso"
                    title="Evaluación humana del resultado"
                    description="Identifica el resultado, explica el contexto y deja un correo de seguimiento."
                    action={<StatusBadge tone={status === "error" ? "warning" : "info"}>20 caracteres mínimo</StatusBadge>}
                  />
                  <div className="mt-6">
                    <WorkflowStepper
                      currentStep={form.cedula_consultada || form.current_score ? "result" : "contact"}
                      steps={[
                        { key: "contact", title: "Contacto", description: "Quién solicita" },
                        { key: "result", title: "Resultado", description: "Score o cédula" },
                        { key: "context", title: "Contexto", description: "Motivo y detalle" },
                      ]}
                    />
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Contacto" title="Persona solicitante" />
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label="Nombre">
                      <input value={form.requester_name} onChange={(event) => updateField("requester_name", event.target.value)} className={inputClass} maxLength={150} disabled={status === "submitting"} />
                    </Field>
                    <Field label="Correo electrónico">
                      <input type="email" value={form.requester_email} onChange={(event) => updateField("requester_email", event.target.value)} className={inputClass} required maxLength={180} disabled={status === "submitting"} />
                    </Field>
                    <Field label="Documento">
                      <input value={form.requester_document_id} onChange={(event) => updateField("requester_document_id", event.target.value)} className={inputClass} maxLength={80} disabled={status === "submitting"} />
                    </Field>
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Resultado" title="Dato que quieres revisar" />
                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <Field label="Cédula consultada">
                      <input value={form.cedula_consultada} onChange={(event) => updateField("cedula_consultada", event.target.value.replace(/\D/g, "").slice(0, 15))} className={inputClass} inputMode="numeric" disabled={status === "submitting"} />
                    </Field>
                    <Field label="Score actual">
                      <input value={form.current_score} onChange={(event) => updateField("current_score", event.target.value.replace(/\D/g, "").slice(0, 3))} className={inputClass} inputMode="numeric" disabled={status === "submitting"} />
                    </Field>
                    <Field label="Clasificación actual">
                      <input value={form.current_classification} onChange={(event) => updateField("current_classification", event.target.value)} className={inputClass} maxLength={80} disabled={status === "submitting"} />
                    </Field>
                  </div>
                </AppCard>

                <AppCard>
                  <SectionHeader eyebrow="Contexto" title="Motivo de revisión" />
                  <Field label="Motivo">
                    <select value={form.reason} onChange={(event) => updateField("reason", event.target.value)} className={inputClass} disabled={status === "submitting"}>
                      {reasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <div className="mt-4">
                    <Field label="Descripción">
                      <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} className={`${inputClass} min-h-36`} required maxLength={2500} disabled={status === "submitting"} placeholder="Explica por qué el resultado requiere revisión humana." />
                    </Field>
                  </div>

                  <div className="mt-4">
                    <Field label="Archivo de soporte privado">
                      <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} disabled={status === "submitting"} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-black file:text-slate-700" />
                      {evidenceFile && <p className="mt-2 text-xs text-slate-600">{evidenceFile.name} Â· {evidenceFile.type || "sin tipo"} Â· {evidenceFile.size} bytes</p>}
                    </Field>
                  </div>

                  {status === "error" && error && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={status === "submitting"} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                    {status === "submitting" ? "Enviando..." : "Solicitar revisión humana"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </AppCard>
              </form>

              <aside className="space-y-4">
                <AppCard muted>
                  <SectionHeader eyebrow="Contexto" title="Qué hace este canal" />
                  <div className="mt-5 space-y-3">
                    {[
                      [Brain, "Permite que una persona revise contexto que el resultado automatizado puede no reflejar."],
                      [FileSearch, "Úsalo si hay información en disputa, desactualizada, suplantación o preocupación por automatización."],
                      [Scale, "No cambia score ni elimina datos al enviarse; abre una revisión formal."],
                    ].map(([Icon, text]) => {
                      const TypedIcon = Icon as typeof Brain;
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

export default function RevisionHumanaPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f6f7f9] px-4 py-8">
          <div className="mx-auto max-w-6xl">
            <AppCard>
              <SectionHeader title="Cargando formulario" description="Preparando datos de revisión humana..." />
            </AppCard>
          </div>
        </main>
      }
    >
      <RevisionHumanaContent />
    </Suspense>
  );
}
