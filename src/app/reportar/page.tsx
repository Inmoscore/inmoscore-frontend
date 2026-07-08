"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gavel,
  IdCard,
  LockKeyhole,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { clearSession, getToken } from "@/lib/auth";
import { uploadSecureDocument } from "@/lib/secureDocuments";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { WorkflowStepper, type WorkflowStepItem } from "@/components/workflows/WorkflowStepper";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { AppCard } from "@/components/ui/AppCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { VerificationRequiredCard } from "@/components/identity/VerificationRequiredCard";
import {
  IDENTITY_VERIFICATION_REQUIRED_CODE,
  IDENTITY_VERIFICATION_REQUIRED_MESSAGE,
  fetchCurrentIdentityUser,
  isIdentityVerified,
  type IdentityAwareUser,
} from "@/lib/identityVerification";

type ReporteResponse = {
  success?: boolean;
  code?: string;
  message?: string;
};

type ReportarFormData = {
  nombre: string;
  cedula: string;
  telefono: string;
  ciudad: string;
  tipo_problema: string;
  descripcion: string;
  evidence_type: EvidenceType;
  sha256_hash: string;
  legal_declaration_accepted: boolean;
};

type StepKey = "contexto" | "inquilino" | "evidencia" | "declaracion" | "revision";

const MIN_DESCRIPCION_LENGTH = 20;
const REPORT_LEGAL_DECLARATION_TEXT =
  "Declaro bajo gravedad de juramento que la información reportada es veraz, que tengo una relación legítima con los hechos reportados y que cuento con soportes documentales para respaldarla.";

type EvidenceType =
  | "lease_contract"
  | "payment_proof"
  | "chat_or_message"
  | "delivery_record"
  | "debt_acknowledgement"
  | "property_damage"
  | "other";

const PROBLEM_OPTIONS = [
  {
    value: "mora_leve",
    label: "Mora leve",
    help: "Retrasos frecuentes o leves en pagos.",
  },
  {
    value: "impago_relevante",
    label: "Impago relevante",
    help: "Deuda importante o incumplimiento claro de pago.",
  },
  {
    value: "impago_severo",
    label: "Impago severo",
    help: "Varios meses sin pagar o deuda grave.",
  },
  {
    value: "danos_menores",
    label: "Danos menores al inmueble",
    help: "Deterioro menor por mal uso.",
  },
  {
    value: "danos_relevantes",
    label: "Danos relevantes al inmueble",
    help: "Afectación material con costo de reparación importante.",
  },
  {
    value: "danos_severos",
    label: "Danos severos al inmueble",
    help: "Destrucción, afectación crítica o entrega en estado grave.",
  },
  {
    value: "convivencia",
    label: "Problema de convivencia",
    help: "Ruido, conflictos o incumplimientos reiterados de convivencia.",
  },
  {
    value: "uso_no_autorizado",
    label: "Uso no autorizado del inmueble",
    help: "Subarriendo, uso comercial no permitido u ocupación irregular.",
  },
  {
    value: "fraude_documental",
    label: "Fraude documental",
    help: "Documentos falsos, suplantación o información engañosa.",
  },
  {
    value: "desalojo",
    label: "Proceso judicial / desalojo",
    help: "Restitución, desalojo o proceso judicial arrendaticio.",
  },
];

const EVIDENCE_TYPE_OPTIONS: Array<{ value: EvidenceType; label: string }> = [
  { value: "lease_contract", label: "Contrato de arrendamiento" },
  { value: "payment_proof", label: "Soporte de pago o deuda" },
  { value: "chat_or_message", label: "Chat o mensaje" },
  { value: "delivery_record", label: "Acta de entrega" },
  { value: "debt_acknowledgement", label: "Reconocimiento de deuda" },
  { value: "property_damage", label: "Soporte de dano al inmueble" },
  { value: "other", label: "Otro soporte" },
];

const STEP_ORDER: StepKey[] = ["contexto", "inquilino", "evidencia", "declaracion", "revision"];

const WORKFLOW_COPY: Record<StepKey, { title: string; description: string }> = {
  contexto: {
    title: "Contexto del reporte",
    description: "Clasifica el incumplimiento y registra una descripción objetiva de los hechos.",
  },
  inquilino: {
    title: "Informacion del inquilino",
    description: "Identifica a la persona reportada con datos suficientes para revisión.",
  },
  evidencia: {
    title: "Evidencia y soporte",
    description: "Adjunta metadata documental verificable antes de enviar a revisión.",
  },
  declaracion: {
    title: "Declaración legal",
    description: "Confirma que el reporte se realiza bajo responsabilidad legal.",
  },
  revision: {
    title: "Revisión y envío",
    description: "Verifica el resumen completo antes de enviar a control administrativo.",
  },
};

const LEGAL_CONTEXT_ITEMS: Array<{
  text: string;
  tone: StatusTone;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { text: "La información será revisada", tone: "review", icon: ShieldCheck },
  { text: "Los reportes no son visibles inmediatamente", tone: "pending", icon: LockKeyhole },
  { text: "Se requiere evidencia verificable", tone: "info", icon: FileCheck2 },
  { text: "Información falsa puede generar bloqueo", tone: "warning", icon: ShieldAlert },
  { text: "Existe proceso de contradicción", tone: "neutral", icon: Gavel },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeTextInput(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isValidCedula(value: string): boolean {
  return /^\d{6,10}$/.test(value);
}

function formatReviewValue(value?: string | null) {
  return value && value.trim() ? value : "Pendiente";
}

export default function ReportarPage() {
  const router = useRouter();

  const [formData, setFormData] = useState<ReportarFormData>({
    nombre: "",
    cedula: "",
    telefono: "",
    ciudad: "",
    tipo_problema: "",
    descripcion: "",
    evidence_type: "lease_contract",
    sha256_hash: "",
    legal_declaration_accepted: false,
  });

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepKey>("contexto");
  const [stepNotice, setStepNotice] = useState("");
  const [identityUser, setIdentityUser] = useState<IdentityAwareUser | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const identityVerified = isIdentityVerified(identityUser);

  useEffect(() => {
    fetchCurrentIdentityUser(API_URL)
      .then((user) => setIdentityUser(user))
      .catch(() => setIdentityUser(null))
      .finally(() => setIdentityChecked(true));
  }, [API_URL]);

  const descripcionLength = useMemo(
    () => normalizeTextInput(formData.descripcion).length,
    [formData.descripcion]
  );

  const selectedProblem = useMemo(
    () => PROBLEM_OPTIONS.find((option) => option.value === formData.tipo_problema) || null,
    [formData.tipo_problema]
  );

  const selectedEvidence = useMemo(
    () => EVIDENCE_TYPE_OPTIONS.find((option) => option.value === formData.evidence_type),
    [formData.evidence_type]
  );

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setStepNotice("");

    if (name === "cedula" || name === "telefono") {
      setFormData((prev) => ({
        ...prev,
        [name]: onlyDigits(value),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      nombre: "",
      cedula: "",
      telefono: "",
      ciudad: "",
      tipo_problema: "",
      descripcion: "",
      evidence_type: "lease_contract",
      sha256_hash: "",
      legal_declaration_accepted: false,
    });
    setEvidenceFile(null);
    setCurrentStep("contexto");
    setStepNotice("");
  };

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  const handleGoHome = () => {
    router.push("/");
  };

  const validarFormulario = (): string | null => {
    const nombre = normalizeTextInput(formData.nombre);
    const cedula = formData.cedula.trim();
    const telefono = formData.telefono.trim();
    const ciudad = normalizeTextInput(formData.ciudad);
    const tipoProblema = formData.tipo_problema.trim();
    const descripcion = normalizeTextInput(formData.descripcion);

    if (!API_URL) {
      return "La URL del backend no está configurada";
    }

    if (!nombre || !cedula || !ciudad || !tipoProblema || !descripcion) {
      return "Todos los campos obligatorios deben estar completos";
    }

    if (nombre.length < 3) {
      return "El nombre debe tener al menos 3 caracteres";
    }

    if (!isValidCedula(cedula)) {
      return "La cédula debe tener entre 6 y 10 dígitos";
    }

    if (telefono && telefono.length < 7) {
      return "El teléfono debe tener al menos 7 dígitos o dejarse vacío";
    }

    if (ciudad.length < 2) {
      return "La ciudad debe tener al menos 2 caracteres";
    }

    if (descripcion.length < MIN_DESCRIPCION_LENGTH) {
      return `La descripción debe tener al menos ${MIN_DESCRIPCION_LENGTH} caracteres`;
    }

    if (!evidenceFile) {
      return "Debes adjuntar metadata de al menos una evidencia documental";
    }

    if (!formData.legal_declaration_accepted) {
      return "Debes aceptar la declaración legal reforzada";
    }

    return null;
  };

  const getStepError = (step: StepKey): string | null => {
    const nombre = normalizeTextInput(formData.nombre);
    const cedula = formData.cedula.trim();
    const telefono = formData.telefono.trim();
    const ciudad = normalizeTextInput(formData.ciudad);
    const descripcion = normalizeTextInput(formData.descripcion);

    if (step === "contexto") {
      if (!formData.tipo_problema.trim()) return "Selecciona el tipo de problema reportado.";
      if (!descripcion) return "Describe los hechos antes de continuar.";
      if (descripcion.length < MIN_DESCRIPCION_LENGTH) {
        return `La descripción debe tener al menos ${MIN_DESCRIPCION_LENGTH} caracteres.`;
      }
    }

    if (step === "inquilino") {
      if (!nombre || !cedula || !ciudad) return "Completa nombre, cédula y ciudad.";
      if (nombre.length < 3) return "El nombre debe tener al menos 3 caracteres.";
      if (!isValidCedula(cedula)) return "La cédula debe tener entre 6 y 10 dígitos.";
      if (telefono && telefono.length < 7) {
        return "El teléfono debe tener al menos 7 dígitos o dejarse vacío.";
      }
      if (ciudad.length < 2) return "La ciudad debe tener al menos 2 caracteres.";
    }

    if (step === "evidencia" && !evidenceFile) {
      return "Adjunta metadata de al menos una evidencia documental.";
    }

    if (step === "declaracion" && !formData.legal_declaration_accepted) {
      return "Acepta la declaracion legal reforzada para continuar.";
    }

    return null;
  };

  const canReachStep = (step: StepKey) => {
    const targetIndex = STEP_ORDER.indexOf(step);
    if (targetIndex <= currentStepIndex) return true;

    return STEP_ORDER.slice(0, targetIndex).every((stepKey) => !getStepError(stepKey));
  };

  const handleStepChange = (step: string) => {
    const nextStep = step as StepKey;
    if (!STEP_ORDER.includes(nextStep)) return;

    if (!canReachStep(nextStep)) {
      setStepNotice("Completa las validaciones previas para avanzar en el flujo.");
      return;
    }

    setStepNotice("");
    setCurrentStep(nextStep);
  };

  const goNext = () => {
    const currentError = getStepError(currentStep);
    if (currentError) {
      setStepNotice(currentError);
      return;
    }

    const nextStep = STEP_ORDER[currentStepIndex + 1];
    if (nextStep) {
      setStepNotice("");
      setCurrentStep(nextStep);
    }
  };

  const goBack = () => {
    const previousStep = STEP_ORDER[currentStepIndex - 1];
    if (previousStep) {
      setStepNotice("");
      setCurrentStep(previousStep);
    }
  };

  const enviarReporte = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (cargando) return;

    setCargando(true);
    setMensaje("");
    setError("");

    try {
      const token = getToken();

      if (!token) {
        setError("Debes iniciar sesión para reportar");
        router.push("/login");
        return;
      }

      if (!identityVerified) {
        setError(IDENTITY_VERIFICATION_REQUIRED_MESSAGE);
        return;
      }

      const validationError = validarFormulario();
      if (validationError) {
        setError(validationError);
        return;
      }

      const secureEvidence = evidenceFile
        ? await uploadSecureDocument({
            apiUrl: API_URL!,
            token,
            file: evidenceFile,
            category:
              formData.evidence_type === "lease_contract" ? "contract" : "report_evidence",
            relatedEntityType: "report",
            sha256Hash: formData.sha256_hash.trim() || null,
            metadata: {
              evidence_type: formData.evidence_type,
              source: "reportar",
            },
          })
        : null;

      const payload = {
        nombre: normalizeTextInput(formData.nombre),
        cedula: formData.cedula.trim(),
        telefono: formData.telefono.trim() || "",
        ciudad: normalizeTextInput(formData.ciudad),
        tipo_problema: formData.tipo_problema.trim(),
        descripcion: normalizeTextInput(formData.descripcion),
        legal_declaration_accepted: formData.legal_declaration_accepted,
        evidence: evidenceFile
          ? [
              {
                evidence_type: formData.evidence_type,
                file_name: evidenceFile.name,
                mime_type: evidenceFile.type || "application/octet-stream",
                file_size: evidenceFile.size,
                sha256_hash: formData.sha256_hash.trim() || null,
                secure_document_id: secureEvidence?.documentId || null,
              },
            ]
          : [],
      };

      const response = await fetch(`${API_URL}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      let data: ReporteResponse = {};

      try {
        data = await response.json();
      } catch {
        throw new Error("El servidor devolvio una respuesta invalida");
      }

      if (response.status === 401) {
        clearSession();
        router.push("/login");
        return;
      }

      if (response.status === 403 && data.code === IDENTITY_VERIFICATION_REQUIRED_CODE) {
        setIdentityUser((current) => ({
          ...(current || {}),
          identity_verification_status: current?.identity_verification_status || "unverified",
        }));
        throw new Error(data.message || IDENTITY_VERIFICATION_REQUIRED_MESSAGE);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Error al enviar reporte");
      }

      setMensaje(data.message || "Reporte enviado correctamente");
      resetForm();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al conectar con el servidor";
      setError(message);
    } finally {
      setCargando(false);
    }
  };

  const workflowSteps: WorkflowStepItem[] = STEP_ORDER.map((stepKey, index) => {
    const issue = getStepError(stepKey);
    const state =
      stepKey === currentStep
        ? "current"
        : issue && index < currentStepIndex
          ? "warning"
          : stepKey === "revision" && currentStep === "revision"
            ? "review"
            : undefined;

    return {
      key: stepKey,
      title: WORKFLOW_COPY[stepKey].title,
      description: WORKFLOW_COPY[stepKey].description,
      state,
    };
  });

  const currentCopy = WORKFLOW_COPY[currentStep];
  const allValidationError = validarFormulario();

  return (
    <PlatformShell
      title="Reportar incumplimiento"
      eyebrow="Workflow legal"
      description="Proceso guiado con evidencia, declaración legal y revisión administrativa."
      user={identityUser}
      topbarActions={<StatusBadge tone="review">Revisión admin</StatusBadge>}
    >
      <PageContainer>
        {!identityChecked ? (
          <AppCard>
            <p className="text-sm font-bold text-slate-600">Validando identidad...</p>
          </AppCard>
        ) : !identityVerified ? (
          <VerificationRequiredCard />
        ) : (
          <>
        <ActionBanner
          title="Reporte con evidencia y control humano"
          description="Este flujo es para incumplimientos verificables. Los reportes no son visibles inmediatamente y no impactan scoring al enviarse."
          tone="dark"
          action={
            <button
              type="button"
              onClick={() => router.push("/aportar-historial")}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-slate-100"
            >
              <ClipboardCheck className="h-4 w-4" />
              Aportar historial
            </button>
          }
        />

        <AppCard>
          <SectionHeader
            eyebrow="Proceso controlado"
            title="Radicacion de reporte legal"
            description="Completa cada etapa con información objetiva. Antes del envío verás un resumen completo para confirmar trazabilidad, evidencia y declaración."
            action={<StatusBadge tone={allValidationError ? "warning" : "verified"}>{allValidationError ? "Incompleto" : "Listo para envío"}</StatusBadge>}
          />
          <div className="mt-6">
            <WorkflowStepper
              steps={workflowSteps}
              currentStep={currentStep}
              onStepChange={handleStepChange}
            />
          </div>
        </AppCard>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={enviarReporte} className="space-y-6">
            <AppCard>
              <SectionHeader
                eyebrow={`Paso ${currentStepIndex + 1} de ${STEP_ORDER.length}`}
                title={currentCopy.title}
                description={currentCopy.description}
                action={
                  <StatusBadge tone={getStepError(currentStep) ? "warning" : "success"}>
                    {getStepError(currentStep) ? "Requiere datos" : "Validado"}
                  </StatusBadge>
                }
              />

              {stepNotice && (
                <div className="mt-5">
                  <ActionBanner title="Validación pendiente" description={stepNotice} tone="warning" />
                </div>
              )}

              {currentStep === "contexto" && (
                <div className="mt-6 space-y-5">
                  <ActionBanner
                    title="Reporta solo hechos verificables"
                    description="La información debe estar relacionada con el contrato, el comportamiento arrendaticio o un proceso jurídico documentable."
                    tone="warning"
                  />

                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Tipo de reporte</span>
                    <select
                      name="tipo_problema"
                      value={formData.tipo_problema}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      required
                      disabled={cargando}
                    >
                      <option value="">Selecciona el tipo de problema</option>
                      {PROBLEM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedProblem && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                      <span className="font-black">Criterio operativo: </span>
                      {selectedProblem.help}
                    </div>
                  )}

                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Descripción objetiva de los hechos</span>
                    <textarea
                      name="descripcion"
                      placeholder="Describe fechas, obligaciones incumplidas, montos o hechos verificables. Evita juicios personales."
                      value={formData.descripcion}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      rows={7}
                      required
                      disabled={cargando}
                      maxLength={2000}
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Minimo {MIN_DESCRIPCION_LENGTH} caracteres. Actual: {descripcionLength}
                    </span>
                  </label>
                </div>
              )}

              {currentStep === "inquilino" && (
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="text-sm font-black text-slate-900">Nombre completo</span>
                    <input
                      type="text"
                      name="nombre"
                      placeholder="Nombre completo del inquilino"
                      value={formData.nombre}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      required
                      disabled={cargando}
                      maxLength={120}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Cédula</span>
                    <input
                      type="text"
                      name="cedula"
                      placeholder="Entre 6 y 10 dígitos"
                      value={formData.cedula}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      required
                      disabled={cargando}
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Teléfono opcional</span>
                    <input
                      type="text"
                      name="telefono"
                      placeholder="Solo dígitos"
                      value={formData.telefono}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      disabled={cargando}
                      inputMode="numeric"
                      maxLength={15}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="text-sm font-black text-slate-900">Ciudad</span>
                    <input
                      type="text"
                      name="ciudad"
                      placeholder="Ciudad asociada al contrato o inmueble"
                      value={formData.ciudad}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      required
                      disabled={cargando}
                      maxLength={80}
                    />
                  </label>
                </div>
              )}

              {currentStep === "evidencia" && (
                <div className="mt-6 space-y-5">
                  <ActionBanner
                    title="La evidencia es obligatoria"
                    description="El sistema envía metadata documental para revisión. Usa soportes verificables y relacionados con los hechos reportados."
                    tone="info"
                  />

                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Tipo de evidencia</span>
                    <select
                      name="evidence_type"
                      value={formData.evidence_type}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      required
                      disabled={cargando}
                    >
                      {EVIDENCE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                    <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <FileCheck2 className="h-4 w-4 text-blue-700" />
                      Archivo de soporte
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      onChange={(event) => {
                        setStepNotice("");
                        setEvidenceFile(event.target.files?.[0] || null);
                      }}
                      className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-blue-700"
                      required
                      disabled={cargando}
                    />
                    {evidenceFile ? (
                      <span className="mt-3 block text-xs text-slate-600">
                        Metadata: {evidenceFile.name} - {evidenceFile.type || "sin tipo"} - {evidenceFile.size} bytes
                      </span>
                    ) : (
                      <span className="mt-3 block text-xs text-slate-500">
                        Formatos permitidos: PDF, PNG o JPG.
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-sm font-black text-slate-900">SHA-256 del archivo opcional</span>
                    <input
                      type="text"
                      name="sha256_hash"
                      value={formData.sha256_hash}
                      onChange={handleChange}
                      placeholder="Hash de trazabilidad si lo tienes"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      maxLength={64}
                      disabled={cargando}
                    />
                  </label>
                </div>
              )}

              {currentStep === "declaracion" && (
                <div className="mt-6 space-y-5">
                  <ActionBanner
                    title="Declaración bajo responsabilidad"
                    description="Este paso confirma que el reporte se radica con soportes y responsabilidad sobre la veracidad de la información."
                    tone="warning"
                  />

                  <label className="flex gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-800">
                    <input
                      type="checkbox"
                      checked={formData.legal_declaration_accepted}
                      onChange={(event) => {
                        setStepNotice("");
                        setFormData((prev) => ({
                          ...prev,
                          legal_declaration_accepted: event.target.checked,
                        }));
                      }}
                      required
                      disabled={cargando}
                      className="mt-1 h-4 w-4"
                    />
                    <span>{REPORT_LEGAL_DECLARATION_TEXT}</span>
                  </label>
                </div>
              )}

              {currentStep === "revision" && (
                <div className="mt-6 space-y-5">
                  {allValidationError ? (
                    <ActionBanner
                      title="Faltan datos antes del envío"
                      description={allValidationError}
                      tone="warning"
                    />
                  ) : (
                    <ActionBanner
                      title="Listo para enviar a revisión"
                      description="El reporte será recibido como caso pendiente de control administrativo. No se publica ni afecta el score automáticamente."
                      tone="success"
                    />
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <ReviewBlock
                      title="Inquilino"
                      items={[
                        ["Nombre", formatReviewValue(formData.nombre)],
                        ["Cédula", formatReviewValue(formData.cedula)],
                        ["Teléfono", formatReviewValue(formData.telefono || "Opcional no informado")],
                        ["Ciudad", formatReviewValue(formData.ciudad)],
                      ]}
                    />
                    <ReviewBlock
                      title="Reporte"
                      items={[
                        ["Tipo", selectedProblem?.label || "Pendiente"],
                        ["Criterio", selectedProblem?.help || "Pendiente"],
                        ["Descripción", formatReviewValue(normalizeTextInput(formData.descripcion))],
                      ]}
                    />
                    <ReviewBlock
                      title="Evidencia"
                      items={[
                        ["Tipo", selectedEvidence?.label || "Pendiente"],
                        ["Archivo", evidenceFile?.name || "Pendiente"],
                        ["Tamano", evidenceFile ? `${evidenceFile.size} bytes` : "Pendiente"],
                        ["SHA-256", formData.sha256_hash.trim() || "No informado"],
                      ]}
                    />
                    <ReviewBlock
                      title="Consecuencias y revisión"
                      items={[
                        ["Visibilidad", "No visible inmediatamente"],
                        ["Control", "Revisión administrativa"],
                        ["Contradicción", "Disponible dentro del proceso legal"],
                        ["Declaración", formData.legal_declaration_accepted ? "Aceptada" : "Pendiente"],
                      ]}
                    />
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={currentStepIndex === 0 ? handleGoHome : goBack}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {currentStepIndex === 0 ? "Salir" : "Volver"}
                </button>

                {currentStep === "revision" ? (
                  <button
                    type="submit"
                    disabled={cargando || Boolean(allValidationError)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    {cargando ? "Enviando..." : "Enviar reporte a revisión"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </AppCard>
          </form>

          <aside className="space-y-4">
            <AppCard muted>
              <SectionHeader
                eyebrow="Marco legal"
                title="Panel contextual"
                description="Reglas del flujo antes de radicar un reporte negativo."
              />
              <div className="mt-5 space-y-3">
                {LEGAL_CONTEXT_ITEMS.map(({ text, tone, icon: Icon }) => (
                  <div key={text} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <StatusBadge tone={tone}>Legal</StatusBadge>
                      <p className="mt-2 text-sm font-bold leading-5 text-slate-900">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AppCard>

            <AppCard>
              <SectionHeader
                eyebrow="Estado del caso"
                title="Trazabilidad"
                description="El envío queda como caso para revisión, no como publicación libre."
              />
              <div className="mt-5 grid gap-3">
                <TraceItem icon={IdCard} label="Identidad verificada" value="Requerida por backend" />
                <TraceItem icon={FileCheck2} label="Evidencia" value={evidenceFile ? "Adjuntada" : "Pendiente"} />
                <TraceItem icon={ShieldCheck} label="Declaración" value={formData.legal_declaration_accepted ? "Aceptada" : "Pendiente"} />
                <TraceItem icon={Send} label="Destino" value="Revisión administrativa" />
              </div>
            </AppCard>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => router.push("/aportar-historial")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 hover:bg-emerald-100"
              >
                <ClipboardCheck className="h-4 w-4" />
                Aportar historial informativo
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>

        {mensaje && (
          <ActionBanner title="Reporte recibido" description={mensaje} tone="success" />
        )}

        {error && (
          <ActionBanner
            title="No se pudo enviar el reporte"
            description={error}
            tone="warning"
            action={
              error === IDENTITY_VERIFICATION_REQUIRED_MESSAGE ||
              error.includes("verificación de identidad") ? (
                <button
                  type="button"
                  onClick={() => router.push("/legal/verificacion-identidad")}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white hover:bg-red-800"
                >
                  Completar verificación
                </button>
              ) : null
            }
          />
        )}
          </>
        )}
      </PageContainer>
    </PlatformShell>
  );
}

function ReviewBlock({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <dl className="mt-3 space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</dt>
            <dd className="break-words text-sm leading-6 text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TraceItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-700">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-black text-slate-950">{label}</p>
        <p className="text-xs text-slate-500">{value}</p>
      </div>
    </div>
  );
}
