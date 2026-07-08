"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { BadgeCheck, FileCheck2, Fingerprint, ShieldCheck, UserCheck } from "lucide-react";
import { getToken } from "@/lib/auth";
import { uploadSecureDocument } from "@/lib/secureDocuments";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { WorkflowStepper } from "@/components/workflows/WorkflowStepper";

type IdentityStatus = "unverified" | "pending_review" | "verified" | "rejected";
type ReportingEligibilityStatus = "not_allowed" | "limited" | "allowed" | "suspended";

type IdentityDocument = {
  id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string | null;
  verification_status: "pending" | "approved" | "rejected";
  uploaded_at: string;
  reviewed_at: string | null;
  admin_notes: string | null;
};

type IdentityUser = {
  document_type: string | null;
  document_number: string | null;
  full_legal_name: string | null;
  phone_number: string | null;
  identity_verification_status: IdentityStatus;
  identity_verified_at: string | null;
  identity_verification_notes: string | null;
  reporting_eligibility_status: ReportingEligibilityStatus;
};

type IdentityResponse = {
  success?: boolean;
  message?: string;
  identity?: IdentityUser;
  documents?: IdentityDocument[];
};

const LEGAL_DECLARATION =
  "Declaro bajo gravedad de juramento que la información suministrada es veraz y corresponde a mi identidad real.";

const statusLabels: Record<IdentityStatus, string> = {
  unverified: "Sin verificar",
  pending_review: "Pendiente de revisión",
  verified: "Aprobada",
  rejected: "Rechazada",
};

const statusTones: Record<IdentityStatus, StatusTone> = {
  unverified: "pending",
  pending_review: "review",
  verified: "success",
  rejected: "error",
};

const eligibilityLabels: Record<ReportingEligibilityStatus, string> = {
  not_allowed: "No habilitado",
  limited: "Limitado",
  allowed: "Habilitado",
  suspended: "Suspendido",
};

const legalLinks = [
  ["Solicitudes de datos", "/legal/solicitudes-datos"],
  ["Disputas", "/legal/disputas"],
  ["Revisión humana", "/legal/revision-humana"],
];

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-100";

function formatDate(value?: string | null) {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return date.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function onlyDocumentChars(value: string) {
  return value.replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 40);
}

function onlyPhoneChars(value: string) {
  return value.replace(/[^\d+()\s-]/g, "").slice(0, 25);
}

export default function IdentityVerificationPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const [form, setForm] = useState({
    document_type: "cedula_ciudadania",
    document_number: "",
    full_legal_name: "",
    phone_number: "",
    sha256_hash: "",
    legal_declaration_accepted: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [identity, setIdentity] = useState<IdentityUser | null>(null);
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!API_URL || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/legal/identity-verification/my`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const data: IdentityResponse = await response.json().catch(() => ({}));

      if (!response.ok || !data.success || !data.identity) {
        throw new Error(data.message || "No se pudo cargar el estado de identidad.");
      }

      setIdentity(data.identity);
      setDocuments(data.documents || []);
      setForm((current) => ({
        ...current,
        document_type: data.identity?.document_type || current.document_type,
        document_number: data.identity?.document_number || current.document_number,
        full_legal_name: data.identity?.full_legal_name || current.full_legal_name,
        phone_number: data.identity?.phone_number || current.phone_number,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el estado de identidad.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    setToken(getToken());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_URL, mounted, token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setMessage("");

    if (!API_URL) {
      setError("La URL del backend no está configurada.");
      return;
    }

    if (!token) {
      setError("Debes iniciar sesión para solicitar verificación.");
      return;
    }

    if (!selectedFile) {
      setError("Adjunta la metadata de al menos un documento.");
      return;
    }

    if (!form.legal_declaration_accepted) {
      setError("Debes aceptar la declaración legal obligatoria.");
      return;
    }

    setSubmitting(true);

    try {
      const secureDocument = await uploadSecureDocument({
        apiUrl: API_URL,
        token,
        file: selectedFile,
        category: "identity_document",
        relatedEntityType: "identity_verification",
        sha256Hash: form.sha256_hash.trim() || null,
        metadata: {
          document_type: form.document_type,
          source: "verificacion-identidad",
        },
      });

      const response = await fetch(`${API_URL}/api/legal/identity-verification/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_type: form.document_type,
          document_number: form.document_number.trim(),
          full_legal_name: form.full_legal_name.trim(),
          phone_number: form.phone_number.trim() || null,
          legal_declaration_accepted: form.legal_declaration_accepted,
          documents: [
            {
              document_type: form.document_type,
              file_name: selectedFile.name,
              mime_type: selectedFile.type || "application/octet-stream",
              file_size: selectedFile.size,
              sha256_hash: form.sha256_hash.trim() || null,
              secure_document_id: secureDocument.documentId,
            },
          ],
        }),
      });
      const data: IdentityResponse = await response.json().catch(() => ({}));

      if (!response.ok || !data.success || !data.identity) {
        console.warn("[SECURE_DOCUMENT_FRONTEND]", {
          step: "identity_request",
          status: "failed",
          response_status: response.status,
          response_error: data.message || "identity_request_failed",
          document_id: secureDocument.documentId,
        });
        throw new Error(data.message || "No se pudo registrar la solicitud.");
      }

      console.warn("[SECURE_DOCUMENT_FRONTEND]", {
        step: "identity_request",
        status: "success",
        response_status: response.status,
        response_error: null,
        document_id: secureDocument.documentId,
      });

      setIdentity(data.identity);
      setDocuments(data.documents || []);
      setSelectedFile(null);
      setMessage("Solicitud registrada. Tu identidad quedó pendiente de revisión administrativa.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  const identityStatus = identity?.identity_verification_status || "unverified";
  const eligibilityStatus = identity?.reporting_eligibility_status || "not_allowed";

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
            title="Verificación de identidad"
            description="Registra metadata documental para revisión administrativa. Este proceso habilita mayor confianza en reportes, pero no aprueba la identidad automáticamente."
            action={<StatusBadge tone={statusTones[identityStatus]}>{statusLabels[identityStatus]}</StatusBadge>}
          />

          {mounted && !token && (
            <ActionBanner
              tone="warning"
              title="Acceso requerido"
              description="Debes iniciar sesión para solicitar verificación de identidad."
              action={
                <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-black text-white hover:bg-amber-800">
                  Iniciar sesión
                </Link>
              }
            />
          )}

          {message && (
            <ActionBanner
              tone="success"
              title="Solicitud enviada"
              description={message}
              action={<StatusBadge tone="review">Pendiente de revisión</StatusBadge>}
            />
          )}

          {error && (
            <ActionBanner tone="warning" title="Revisa la solicitud" description={error} />
          )}

          <section className="grid gap-3 md:grid-cols-3">
            <StatusBox label="Identidad" value={loading ? "Cargando..." : statusLabels[identityStatus]} />
            <StatusBox label="Elegibilidad reportes" value={eligibilityLabels[eligibilityStatus]} />
            <StatusBox label="Verificada en" value={formatDate(identity?.identity_verified_at)} />
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <form onSubmit={handleSubmit} className="space-y-6">
              <AppCard>
                <SectionHeader
                  eyebrow="Proceso"
                  title="Solicitud de verificación"
                  description="Completa tus datos legales, registra la metadata del documento y acepta la declaración."
                  action={<StatusBadge tone="info">No carga archivos binarios</StatusBadge>}
                />
                <div className="mt-6">
                  <WorkflowStepper
                    currentStep={selectedFile ? "declaration" : "identity"}
                    steps={[
                      { key: "identity", title: "Identidad", description: "Datos legales" },
                      { key: "document", title: "Documento", description: "Metadata soporte" },
                      { key: "declaration", title: "Declaración", description: "Responsabilidad" },
                    ]}
                  />
                </div>
              </AppCard>

              <AppCard>
                <SectionHeader eyebrow="Datos legales" title="Persona a verificar" />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Tipo de documento">
                    <select value={form.document_type} onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value }))} className={inputClass} disabled={submitting || !mounted || !token}>
                      <option value="cedula_ciudadania">Cédula de ciudadanía</option>
                      <option value="cedula_extranjeria">Cédula de extranjería</option>
                      <option value="pasaporte">Pasaporte</option>
                      <option value="nit">NIT</option>
                    </select>
                  </Field>
                  <Field label="Número de documento">
                    <input type="text" value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: onlyDocumentChars(event.target.value) }))} minLength={4} maxLength={40} required disabled={submitting || !mounted || !token} className={inputClass} />
                  </Field>
                  <Field label="Nombre legal completo">
                    <input type="text" value={form.full_legal_name} onChange={(event) => setForm((current) => ({ ...current, full_legal_name: event.target.value }))} minLength={3} maxLength={180} required disabled={submitting || !mounted || !token} className={inputClass} />
                  </Field>
                  <Field label="Teléfono">
                    <input type="text" value={form.phone_number} onChange={(event) => setForm((current) => ({ ...current, phone_number: onlyPhoneChars(event.target.value) }))} minLength={7} maxLength={25} disabled={submitting || !mounted || !token} className={inputClass} />
                  </Field>
                </div>
              </AppCard>

              <AppCard>
                <SectionHeader eyebrow="Soporte" title="Documento y declaración" />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Documento soporte">
                    <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} required disabled={submitting || !mounted || !token} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-black file:text-slate-700" />
                    {selectedFile && <p className="mt-2 text-xs text-slate-600">Metadata: {selectedFile.name} · {selectedFile.type || "sin tipo"} · {selectedFile.size} bytes</p>}
                  </Field>
                  <Field label="SHA-256 del archivo">
                    <input type="text" value={form.sha256_hash} onChange={(event) => setForm((current) => ({ ...current, sha256_hash: event.target.value.trim().slice(0, 64) }))} maxLength={64} disabled={submitting || !mounted || !token} placeholder="Opcional" className={`${inputClass} font-mono text-sm`} />
                  </Field>
                </div>

                <label className="mt-5 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  <input type="checkbox" checked={form.legal_declaration_accepted} onChange={(event) => setForm((current) => ({ ...current, legal_declaration_accepted: event.target.checked }))} required disabled={submitting || !mounted || !token} className="mt-1 h-4 w-4" />
                  <span>{LEGAL_DECLARATION}</span>
                </label>

                <button type="submit" disabled={submitting || !mounted || !token} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                  {submitting ? "Enviando..." : "Solicitar revisión"}
                </button>
              </AppCard>
            </form>

            <aside className="space-y-4">
              <AppCard muted>
                <SectionHeader eyebrow="Contexto" title="Qué puedes esperar" />
                <div className="mt-5 space-y-3">
                  {[
                    [Fingerprint, "Se registra metadata documental y datos legales para revisión administrativa."],
                    [UserCheck, "Úsalo para fortalecer confianza antes de reportar o operar flujos sensibles."],
                    [ShieldCheck, "No aprueba identidad ni habilita reportes automáticamente."],
                  ].map(([Icon, text]) => {
                    const TypedIcon = Icon as typeof Fingerprint;
                    return (
                      <div key={text as string} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <TypedIcon className="mt-0.5 h-5 w-5 text-slate-700" />
                        <p className="text-sm leading-6 text-slate-700">{text as string}</p>
                      </div>
                    );
                  })}
                </div>
              </AppCard>

              <AppCard>
                <SectionHeader eyebrow="Documentos" title="Registros enviados" />
                {documents.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {documents.map((document) => (
                      <article key={document.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-black text-slate-950">{document.file_name}</p>
                          <StatusBadge tone={document.verification_status === "approved" ? "success" : document.verification_status === "rejected" ? "error" : "review"}>
                            {document.verification_status}
                          </StatusBadge>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Subido: {formatDate(document.uploaded_at)}</p>
                        <p className="mt-1 text-xs text-slate-500">Revisado: {formatDate(document.reviewed_at)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState title="Sin documentos registrados" description="Cuando envíes una solicitud, verás aquí la metadata recibida." />
                  </div>
                )}
              </AppCard>

              <CrossLinks />
            </aside>
          </div>
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

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{value}</p>
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
            <FileCheck2 className="h-4 w-4 text-slate-500" />
          </Link>
        ))}
      </div>
    </AppCard>
  );
}
