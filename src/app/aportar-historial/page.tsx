'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getToken } from '@/lib/auth';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { ActionBanner } from '@/components/ui/ActionBanner';
import { WorkflowStepper } from '@/components/workflows/WorkflowStepper';
import { VerificationRequiredCard } from '@/components/identity/VerificationRequiredCard';
import { emailVerificationFetch as fetch } from '@/lib/emailVerification';
import {
  IDENTITY_VERIFICATION_REQUIRED_CODE,
  IDENTITY_VERIFICATION_REQUIRED_MESSAGE,
  fetchCurrentIdentityUser,
  isIdentityVerified,
  type IdentityAwareUser,
} from '@/lib/identityVerification';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';
type BooleanField = '' | 'true' | 'false';
type WorkflowStep = 'tenant' | 'contract' | 'compliance' | 'support' | 'review';
type SubjectType = '' | 'natural_person' | 'legal_entity';
type SubjectDocumentType = '' | 'CC' | 'CE' | 'NIT' | 'PAS' | 'PEP' | 'PPT' | 'TI' | 'OTHER';
type SourceType = '' | 'lessor_reported' | 'tenant_self_declared';
type BackendErrorDetail = {
  field?: unknown;
  message?: unknown;
};

type BackendErrorResponse = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

type FormState = {
  subject_type: SubjectType;
  subject_document_type: SubjectDocumentType;
  subject_document_number: string;
  source_type: SourceType;
  cedula_inquilino: string;
  city: string;
  property_type: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_duration_months: string;
  monthly_rent_amount: string;
  deposit_amount: string;
  had_late_payments: BooleanField;
  late_payment_months: string;
  formal_handover: BooleanField;
  had_debt_at_handover: BooleanField;
  debt_amount: string;
  had_property_damage: BooleanField;
  property_damage_notes: string;
  lessor_name: string;
  lessor_contact: string;
  lessor_document: string;
  has_supporting_documents: BooleanField;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const initialFormState: FormState = {
  subject_type: 'natural_person',
  subject_document_type: 'CC',
  subject_document_number: '',
  source_type: 'lessor_reported',
  cedula_inquilino: '',
  city: '',
  property_type: '',
  contract_start_date: '',
  contract_end_date: '',
  contract_duration_months: '',
  monthly_rent_amount: '',
  deposit_amount: '',
  had_late_payments: '',
  late_payment_months: '',
  formal_handover: '',
  had_debt_at_handover: '',
  debt_amount: '',
  had_property_damage: '',
  property_damage_notes: '',
  lessor_name: '',
  lessor_contact: '',
  lessor_document: '',
  has_supporting_documents: '',
};

const textLimits = {
  city: 100,
  property_type: 100,
  property_damage_notes: 500,
  lessor_name: 150,
  lessor_contact: 150,
  lessor_document: 80,
} as const;

const workflowSteps: Array<{ key: WorkflowStep; title: string; description: string }> = [
  {
    key: 'tenant',
    title: 'Inquilino',
    description: 'Identifica a la persona y el inmueble asociado al historial.',
  },
  {
    key: 'contract',
    title: 'Contrato',
    description: 'Registra fechas, duración y valores pactados.',
  },
  {
    key: 'compliance',
    title: 'Cumplimiento',
    description: 'Describe pagos, entrega y estado del inmueble.',
  },
  {
    key: 'support',
    title: 'Soportes',
    description: 'Datos del aportante y disponibilidad documental.',
  },
  {
    key: 'review',
    title: 'Revisión',
    description: 'Confirma el resumen antes de enviar a verificación.',
  },
];

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-100';

const subjectTypeLabels: Record<Exclude<SubjectType, ''>, string> = {
  natural_person: 'Persona natural',
  legal_entity: 'Empresa',
};

const subjectDocumentOptions: Array<{ value: Exclude<SubjectDocumentType, ''>; label: string }> = [
  { value: 'CC', label: 'Cedula de ciudadania (CC)' },
  { value: 'CE', label: 'Cedula de extranjeria (CE)' },
  { value: 'NIT', label: 'NIT' },
  { value: 'PAS', label: 'Pasaporte (PAS)' },
  { value: 'PEP', label: 'PEP' },
  { value: 'PPT', label: 'PPT' },
  { value: 'TI', label: 'Tarjeta de identidad (TI)' },
  { value: 'OTHER', label: 'Otro' },
];

const sourceTypeLabels: Record<Exclude<SourceType, ''>, string> = {
  lessor_reported: 'Aportado por arrendador',
  tenant_self_declared: 'Autodeclarado por inquilino',
};

function normalizeDocumentNumber(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeDocumentInput(value: string, documentType: SubjectDocumentType) {
  const normalized = normalizeDocumentNumber(value);

  if (documentType === 'CC' || documentType === 'TI') {
    return normalized.replace(/\D/g, '').slice(0, 30);
  }

  if (documentType === 'NIT') {
    return normalized.replace(/[^0-9-]/g, '').slice(0, 30);
  }

  return normalized.replace(/[^A-Z0-9]/g, '').slice(0, 30);
}

function parseOptionalNumber(value: string) {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function parseRequiredNumber(value: string) {
  if (value.trim() === '') return Number.NaN;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function parseBooleanField(value: BooleanField) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function formatBooleanField(value: BooleanField) {
  if (value === 'true') return 'Sí';
  if (value === 'false') return 'No';
  return 'Pendiente';
}

function formatMoney(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Pendiente';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(parsed);
}

function displayValue(value: string, fallback = 'Pendiente') {
  return value.trim() || fallback;
}

function normalizeForTextCheck(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasDangerousSubjectiveText(value: string) {
  const normalized = normalizeForTextCheck(value);
  const dangerousPatterns = [
    /\bmal\s+inquilino\b/,
    /\bmala\s+inquilina\b/,
    /\bno\s+l[oa]\s+recomiendo\b/,
    /\bproblematic[oa]\b/,
    /\birresponsable\b/,
    /\bdeshonest[oa]\b/,
    /\bestafador(?:a)?\b/,
    /\bladron(?:a)?\b/,
    /\bdelincuente\b/,
    /\bidiot[ao]\b/,
    /\bestupid[oa]\b/,
    /\bimbecil\b/,
    /\bmalparid[oa]\b/,
    /\bhij[oa]\s+de\s+puta\b/,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(normalized));
}

function addOptionalText(
  payload: Record<string, string | number | boolean>,
  key: keyof FormState,
  value: string
) {
  const trimmed = value.trim();
  if (trimmed) {
    payload[key] = trimmed;
  }
}

function addOptionalNumber(
  payload: Record<string, string | number | boolean>,
  key: keyof FormState,
  value: string
) {
  const parsed = parseOptionalNumber(value);
  if (parsed !== undefined && !Number.isNaN(parsed)) {
    payload[key] = parsed;
  }
}

function validateForm(form: FormState) {
  const errors: string[] = [];
  const documentNumber = normalizeDocumentNumber(form.subject_document_number);

  if (!form.subject_type) errors.push('El tipo de titular del historial es requerido.');
  if (!form.subject_document_type) errors.push('El tipo de documento es requerido.');
  if (!form.source_type) errors.push('El origen del aporte es requerido.');

  if (!documentNumber) {
    errors.push('El documento del inquilino o arrendatario es requerido.');
  } else if (documentNumber.length < 4 || documentNumber.length > 30) {
    errors.push('El documento debe tener entre 4 y 30 caracteres.');
  } else if (
    (form.subject_document_type === 'CC' || form.subject_document_type === 'TI') &&
    !/^\d+$/.test(documentNumber)
  ) {
    errors.push('CC y TI deben contener solo numeros.');
  } else if (form.subject_document_type === 'NIT' && !/^\d+(?:-\d)?$/.test(documentNumber)) {
    errors.push('El NIT debe contener numeros y un guion opcional.');
  } else if (
    !['', 'CC', 'TI', 'NIT'].includes(form.subject_document_type) &&
    !/^[A-Z0-9]+$/.test(documentNumber)
  ) {
    errors.push('El documento debe ser alfanumerico.');
  }

  if (!form.city.trim()) errors.push('La ciudad es requerida.');
  if (!form.property_type.trim()) errors.push('El tipo de inmueble es requerido.');
  if (!form.contract_start_date) errors.push('La fecha de inicio es requerida.');
  if (!form.contract_end_date) errors.push('La fecha de finalización es requerida.');
  if (Number.isNaN(parseRequiredNumber(form.monthly_rent_amount))) {
    errors.push('El canon mensual es requerido y debe ser un entero mayor o igual a 0.');
  }
  if (!form.lessor_name.trim()) errors.push('El nombre del arrendador aportante es requerido.');
  if (!form.lessor_contact.trim()) errors.push('El contacto del arrendador aportante es requerido.');

  const requiredBooleanFields: Array<[BooleanField, string]> = [
    [form.had_late_payments, 'Indica si hubo pagos tardíos.'],
    [form.formal_handover, 'Indica si hubo entrega formal.'],
    [form.had_debt_at_handover, 'Indica si hubo deuda pendiente en entrega.'],
    [form.had_property_damage, 'Indica si hubo daños verificables al inmueble.'],
    [form.has_supporting_documents, 'Indica si cuentas con soporte documental.'],
  ];

  requiredBooleanFields.forEach(([value, message]) => {
    if (value === '') errors.push(message);
  });

  if (form.had_late_payments === 'true' && form.late_payment_months.trim() === '') {
    errors.push('Los meses con mora son requeridos si hubo pagos tardíos.');
  }

  if (form.had_debt_at_handover === 'true' && form.debt_amount.trim() === '') {
    errors.push('El monto de deuda es requerido si hubo deuda pendiente en entrega.');
  }

  if (form.had_property_damage === 'true' && !form.property_damage_notes.trim()) {
    errors.push('Las notas sobre daños son requeridas si hubo daños verificables.');
  }

  if (
    form.had_property_damage === 'true' &&
    form.property_damage_notes.trim() &&
    hasDangerousSubjectiveText(form.property_damage_notes)
  ) {
    errors.push(
      'Las notas sobre daños deben describir hechos objetivos, sin opiniones, recomendaciones ni insultos.'
    );
  }

  const nonNegativeFields: Array<[keyof FormState, string]> = [
    ['deposit_amount', 'El depósito debe ser mayor o igual a 0.'],
    ['debt_amount', 'La deuda al entregar debe ser mayor o igual a 0.'],
    ['late_payment_months', 'Los meses de mora deben ser mayores o iguales a 0.'],
    ['contract_duration_months', 'La duración del contrato debe ser mayor o igual a 0.'],
  ];

  nonNegativeFields.forEach(([key, message]) => {
    const value = parseOptionalNumber(String(form[key]));
    if (Number.isNaN(value) || (value !== undefined && value < 0)) {
      errors.push(message);
    }
  });

  if (
    form.contract_start_date &&
    form.contract_end_date &&
    form.contract_end_date < form.contract_start_date
  ) {
    errors.push('La fecha de finalización debe ser posterior o igual a la fecha de inicio.');
  }

  Object.entries(textLimits).forEach(([key, limit]) => {
    const value = form[key as keyof typeof textLimits];
    if (value.length > limit) {
      errors.push(`El campo ${key.replaceAll('_', ' ')} no debe superar ${limit} caracteres.`);
    }
  });

  return errors;
}

function buildPayload(form: FormState) {
  const subjectDocumentNumber = normalizeDocumentNumber(form.subject_document_number);
  const payload: Record<string, string | number | boolean> = {
    subject_type: form.subject_type || 'natural_person',
    subject_document_type: form.subject_document_type || 'CC',
    subject_document_number: subjectDocumentNumber,
    source_type: form.source_type || 'lessor_reported',
    cedula_inquilino: subjectDocumentNumber,
    city: form.city.trim(),
    property_type: form.property_type.trim(),
    contract_start_date: form.contract_start_date,
    contract_end_date: form.contract_end_date,
    monthly_rent_amount: parseRequiredNumber(form.monthly_rent_amount),
    lessor_name: form.lessor_name.trim(),
    lessor_contact: form.lessor_contact.trim(),
    had_late_payments: parseBooleanField(form.had_late_payments) ?? false,
    formal_handover: parseBooleanField(form.formal_handover) ?? false,
    had_debt_at_handover: parseBooleanField(form.had_debt_at_handover) ?? false,
    had_property_damage: parseBooleanField(form.had_property_damage) ?? false,
    has_supporting_documents: parseBooleanField(form.has_supporting_documents) ?? false,
  };

  addOptionalText(payload, 'lessor_document', form.lessor_document);
  addOptionalNumber(payload, 'contract_duration_months', form.contract_duration_months);
  addOptionalNumber(payload, 'deposit_amount', form.deposit_amount);

  if (form.had_late_payments === 'true') {
    addOptionalNumber(payload, 'late_payment_months', form.late_payment_months);
  } else {
    payload.late_payment_months = 0;
  }

  if (form.had_debt_at_handover === 'true') {
    addOptionalNumber(payload, 'debt_amount', form.debt_amount);
  } else {
    payload.debt_amount = 0;
  }

  if (form.had_property_damage === 'true') {
    addOptionalText(payload, 'property_damage_notes', form.property_damage_notes);
  }

  return payload;
}

function getBackendErrorDetails(data: BackendErrorResponse | null) {
  if (!Array.isArray(data?.details)) return [];

  return data.details
    .map((detail: BackendErrorDetail) => {
      const field = typeof detail.field === 'string' ? detail.field.trim() : '';
      const message = typeof detail.message === 'string' ? detail.message.trim() : '';

      if (field && message) return `${field}: ${message}`;
      return field || message;
    })
    .filter(Boolean);
}

function getBackendErrorMessage(data: BackendErrorResponse | null) {
  const error = typeof data?.error === 'string' ? data.error.trim() : '';
  const message = typeof data?.message === 'string' ? data.message.trim() : '';

  return error || message
    ? (error || message)
    : 'No se pudo enviar el historial. Revisa los datos e intenta nuevamente.';
}

function YesNoSelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: BooleanField;
  onChange: (value: BooleanField) => void;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label} *</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as BooleanField)}
        required
        disabled={disabled}
        className={inputClass}
      >
        <option value="">Selecciona</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

export default function AportarHistorialPage() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const [activeStep, setActiveStep] = useState<WorkflowStep>('tenant');
  const [identityUser, setIdentityUser] = useState<IdentityAwareUser | null>(null);
  const identityVerified = isIdentityVerified(identityUser);

  useEffect(() => {
    const currentToken = getToken();
    setToken(currentToken);

    if (currentToken) {
      fetchCurrentIdentityUser(API_URL)
        .then((user) => setIdentityUser(user))
        .catch(() => setIdentityUser(null))
        .finally(() => setAuthChecked(true));
      return;
    }

    setAuthChecked(true);
  }, []);

  const damageCharactersLeft = useMemo(
    () => textLimits.property_damage_notes - form.property_damage_notes.length,
    [form.property_damage_notes]
  );

  const activeStepIndex = workflowSteps.findIndex((step) => step.key === activeStep);
  const currentStep = workflowSteps[activeStepIndex] || workflowSteps[0];
  const progressPercent = ((activeStepIndex + 1) / workflowSteps.length) * 100;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    if (status !== 'submitting') {
      setStatus('idle');
      setSubmitErrorMessage('');
    }
  };

  const updateSubjectType = (value: SubjectType) => {
    setForm((current) => ({
      ...current,
      subject_type: value,
      subject_document_type:
        value === 'legal_entity' &&
        (current.subject_document_type === '' || current.subject_document_type === 'CC')
          ? 'NIT'
          : current.subject_document_type,
    }));
    if (status !== 'submitting') {
      setStatus('idle');
      setSubmitErrorMessage('');
    }
  };

  const updateSubjectDocumentType = (value: SubjectDocumentType) => {
    setForm((current) => ({
      ...current,
      subject_document_type: value,
      subject_document_number: normalizeDocumentInput(current.subject_document_number, value),
    }));
    if (status !== 'submitting') {
      setStatus('idle');
      setSubmitErrorMessage('');
    }
  };

  const submitRentalHistory = async () => {
    if (!token) {
      setSubmitErrorMessage('Tu sesion expiro. Inicia sesion nuevamente para enviar el historial.');
      setStatus('error');
      return;
    }

    if (!identityVerified) {
      setSubmitErrorMessage(IDENTITY_VERIFICATION_REQUIRED_MESSAGE);
      setStatus('error');
      return;
    }

    const errors = validateForm(form);
    setValidationErrors(errors);
    setSubmitErrorMessage('');

    if (errors.length > 0) {
      setStatus('idle');
      return;
    }

    if (!API_URL) {
      setSubmitErrorMessage('No se pudo conectar con el servicio. Intenta nuevamente en unos minutos.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    const payload = buildPayload(form);

    try {
      const response = await fetch(`${API_URL}/api/rental-histories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as BackendErrorResponse | null;

      if (
        response.status === 403 &&
        typeof data?.code === 'string' &&
        data.code === IDENTITY_VERIFICATION_REQUIRED_CODE
      ) {
        setIdentityUser((current) => ({
          ...(current || {}),
          identity_verification_status: current?.identity_verification_status || 'unverified',
        }));
        setSubmitErrorMessage(
          typeof data?.message === 'string' ? data.message : IDENTITY_VERIFICATION_REQUIRED_MESSAGE
        );
        setValidationErrors([]);
        setStatus('error');
        return;
      }

      if (!response.ok) {
        console.warn('[RENTAL_HISTORY_SUBMIT_FAILED]', { status: response.status });
        setSubmitErrorMessage(
          response.status >= 500
            ? 'No se pudo conectar con el servicio. Intenta nuevamente en unos minutos.'
            : getBackendErrorMessage(data)
        );
        setValidationErrors(getBackendErrorDetails(data));
        setStatus('error');
        return;
      }

      setStatus('success');
      setValidationErrors([]);
      setSubmitErrorMessage('');
    } catch {
      console.warn('[RENTAL_HISTORY_SUBMIT_FAILED]', { status: 'network_error' });
      setSubmitErrorMessage('No se pudo conectar con el servicio. Intenta nuevamente en unos minutos.');
      setStatus('error');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitRentalHistory();
  };

  const resetForm = () => {
    setForm(initialFormState);
    setValidationErrors([]);
    setSubmitErrorMessage('');
    setStatus('idle');
    setActiveStep('tenant');
  };

  const goToPreviousStep = () => {
    setValidationErrors([]);
    setSubmitErrorMessage('');
    setActiveStep(workflowSteps[Math.max(activeStepIndex - 1, 0)].key);
  };

  const goToNextStep = () => {
    setValidationErrors([]);
    setSubmitErrorMessage('');
    setActiveStep(workflowSteps[Math.min(activeStepIndex + 1, workflowSteps.length - 1)].key);
  };

  if (!authChecked) {
    return (
      <PlatformShell
        title="Historial arrendaticio"
        eyebrow="Verificación"
        description="Aporta información objetiva para revisión administrativa."
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Validando sesión...</p>
        </div>
      </PlatformShell>
    );
  }

  if (!token) {
    return (
      <PlatformShell
        title="Historial arrendaticio"
        eyebrow="Acceso requerido"
        description="Inicia sesión para aportar historial verificable."
      >
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Acceso requerido</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">Debes iniciar sesión</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Para aportar un historial arrendaticio necesitas iniciar sesión.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-50"
            >
              Inicio
            </Link>
          </div>
        </section>
      </PlatformShell>
    );
  }

  if (!identityVerified) {
    return (
      <PlatformShell
        title="Historial arrendaticio"
        eyebrow="Verificacion requerida"
        description="Aporta informacion objetiva para revision administrativa."
        user={identityUser}
      >
        <VerificationRequiredCard />
      </PlatformShell>
    );
  }

  if (status === 'success') {
    return (
      <PlatformShell
        title="Historial arrendaticio"
        eyebrow="Enviado a revisión"
        description="El aporte queda separado del score hasta verificación."
      >
        <section className="rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <h1 className="text-2xl font-black text-green-950">Historial enviado para revisión</h1>
          <p className="mt-3 text-sm leading-6 text-green-800">
            Tu aporte quedó pendiente de revisión administrativa. Si es validado, podrá contribuir
            al historial arrendaticio consultable por usuarios autorizados.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-700 px-5 py-2 text-sm font-black text-white transition hover:bg-green-800"
            >
              Enviar otro historial
            </button>
            <Link
              href="/buscar"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-green-300 bg-white px-5 py-2 text-sm font-black text-green-900 transition hover:bg-green-100"
            >
              Volver a buscar
            </Link>
          </div>
        </section>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell
      title="Historial arrendaticio"
      eyebrow="Aporte verificable"
      description="Información informativa, revisable y separada de reportes negativos."
    >
      <div className="space-y-6">
        <ActionBanner
          tone="dark"
          title="Aportar historial arrendaticio"
          description="Registra información objetiva y verificable sobre una experiencia de arriendo previa. Cada paso separa contexto, contrato, cumplimiento y soporte antes del envío."
          action={
            <Link
              href="/buscar"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/15"
            >
              Volver a buscar
            </Link>
          }
        />

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                Workflow guiado
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                Aportar historial arrendaticio
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Registra información objetiva y verificable sobre una experiencia de arriendo previa.
                Cada paso separa contexto, contrato, cumplimiento y soporte antes del envío.
              </p>
            </div>
            <Link
              href="/buscar"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/15"
            >
              Volver a buscar
            </Link>
          </div>

          <div className="p-5 sm:p-6">
            <WorkflowStepper
              steps={workflowSteps.map((step) => ({
                key: step.key,
                title: step.title,
                description: step.description,
              }))}
              currentStep={activeStep}
              onStepChange={(step) => setActiveStep(step as WorkflowStep)}
            />
            <div className="hidden">
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-950 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              {workflowSteps.map((step, index) => {
                const isActive = step.key === activeStep;
                const isComplete = index < activeStepIndex;

                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setActiveStep(step.key)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      isActive
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : isComplete
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-black">{String(index + 1).padStart(2, '0')}</span>
                    <span className="mt-1 block text-sm font-black">{step.title}</span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        </section>

        {validationErrors.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Revisa estos datos antes de enviar:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        )}

        {status === 'error' && (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {submitErrorMessage || 'No se pudo enviar el historial. Revisa los datos e intenta nuevamente.'}
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={handleSubmit} className="min-w-0">
            <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5 sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Paso {activeStepIndex + 1} de {workflowSteps.length}
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{currentStep.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{currentStep.description}</p>
              </div>

              <div className="p-5 sm:p-6">
                {activeStep === 'tenant' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-lg font-black text-slate-950">Tipo de titular del historial</h3>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-800">Titular *</span>
                          <select
                            value={form.subject_type}
                            onChange={(event) => updateSubjectType(event.target.value as SubjectType)}
                            disabled={status === 'submitting'}
                            className={inputClass}
                          >
                            <option value="natural_person">Persona natural</option>
                            <option value="legal_entity">Empresa</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-800">Origen del aporte *</span>
                          <select
                            value={form.source_type}
                            onChange={(event) => updateField('source_type', event.target.value as SourceType)}
                            disabled={status === 'submitting'}
                            className={inputClass}
                          >
                            <option value="lessor_reported">
                              Soy arrendador / administrador y aporto historial de un tercero
                            </option>
                            <option value="tenant_self_declared">
                              Soy el inquilino y aporto mi propio historial
                            </option>
                          </select>
                        </label>
                      </div>
                      {form.source_type === 'tenant_self_declared' && (
                        <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950">
                          Este historial sera tratado como autodeclarado y debera ser verificado antes de ser visible para usuarios autorizados.
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">Tipo de documento *</span>
                        <select
                          value={form.subject_document_type}
                          onChange={(event) => updateSubjectDocumentType(event.target.value as SubjectDocumentType)}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        >
                          {subjectDocumentOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">
                          Documento del inquilino o arrendatario *
                        </span>
                        <input
                          type="text"
                          value={form.subject_document_number}
                          onChange={(event) =>
                            updateField(
                              'subject_document_number',
                              normalizeDocumentInput(event.target.value, form.subject_document_type)
                            )
                          }
                          required
                          inputMode={form.subject_document_type === 'CC' || form.subject_document_type === 'TI' ? 'numeric' : 'text'}
                          maxLength={30}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">Ciudad *</span>
                        <input
                          type="text"
                          value={form.city}
                          onChange={(event) => updateField('city', event.target.value.slice(0, textLimits.city))}
                          maxLength={textLimits.city}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">Tipo de inmueble *</span>
                        <input
                          type="text"
                          value={form.property_type}
                          onChange={(event) =>
                            updateField('property_type', event.target.value.slice(0, textLimits.property_type))
                          }
                          maxLength={textLimits.property_type}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {activeStep === 'contract' && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Fecha de inicio *</span>
                      <input
                        type="date"
                        value={form.contract_start_date}
                        onChange={(event) => updateField('contract_start_date', event.target.value)}
                        disabled={status === 'submitting'}
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Fecha de finalización *</span>
                      <input
                        type="date"
                        value={form.contract_end_date}
                        onChange={(event) => updateField('contract_end_date', event.target.value)}
                        disabled={status === 'submitting'}
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Duración en meses</span>
                      <input
                        type="number"
                        min="0"
                        value={form.contract_duration_months}
                        onChange={(event) => updateField('contract_duration_months', event.target.value)}
                        disabled={status === 'submitting'}
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Canon mensual *</span>
                      <input
                        type="number"
                        min="0"
                        value={form.monthly_rent_amount}
                        onChange={(event) => updateField('monthly_rent_amount', event.target.value)}
                        disabled={status === 'submitting'}
                        className={inputClass}
                      />
                      <span className="mt-1 block text-xs text-slate-500">Valor mensual pactado en pesos colombianos.</span>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Depósito</span>
                      <input
                        type="number"
                        min="0"
                        value={form.deposit_amount}
                        onChange={(event) => updateField('deposit_amount', event.target.value)}
                        disabled={status === 'submitting'}
                        className={inputClass}
                      />
                    </label>
                  </div>
                )}

                {activeStep === 'compliance' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <YesNoSelect
                        label="Pagos tardíos verificables"
                        value={form.had_late_payments}
                        onChange={(value) => updateField('had_late_payments', value)}
                        disabled={status === 'submitting'}
                      />
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">
                          Meses con mora {form.had_late_payments === 'true' ? '*' : ''}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={form.had_late_payments === 'true' ? form.late_payment_months : '0'}
                          onChange={(event) => updateField('late_payment_months', event.target.value)}
                          disabled={form.had_late_payments !== 'true' || status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                      <YesNoSelect
                        label="Entrega formal realizada"
                        value={form.formal_handover}
                        onChange={(value) => updateField('formal_handover', value)}
                        disabled={status === 'submitting'}
                      />
                      <YesNoSelect
                        label="Deuda pendiente en entrega"
                        value={form.had_debt_at_handover}
                        onChange={(value) => updateField('had_debt_at_handover', value)}
                        disabled={status === 'submitting'}
                      />
                      <label className="block md:col-span-2">
                        <span className="text-sm font-semibold text-slate-800">
                          Monto de deuda {form.had_debt_at_handover === 'true' ? '*' : ''}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={form.had_debt_at_handover === 'true' ? form.debt_amount : '0'}
                          onChange={(event) => updateField('debt_amount', event.target.value)}
                          disabled={form.had_debt_at_handover !== 'true' || status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="font-black text-slate-950">Estado del inmueble</h3>
                      <div className="mt-4 space-y-4">
                        <YesNoSelect
                          label="Daños verificables al inmueble"
                          value={form.had_property_damage}
                          onChange={(value) => updateField('had_property_damage', value)}
                          disabled={status === 'submitting'}
                        />
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-800">
                            Notas sobre daños {form.had_property_damage === 'true' ? '*' : ''}
                          </span>
                          <textarea
                            value={form.had_property_damage === 'true' ? form.property_damage_notes : ''}
                            onChange={(event) =>
                              updateField(
                                'property_damage_notes',
                                event.target.value.slice(0, textLimits.property_damage_notes)
                              )
                            }
                            maxLength={textLimits.property_damage_notes}
                            rows={4}
                            disabled={form.had_property_damage !== 'true' || status === 'submitting'}
                            className={`${inputClass} min-h-28`}
                          />
                          <span className="mt-1 block text-xs text-slate-500">
                            Máximo 500 caracteres. Restantes: {Math.max(damageCharactersLeft, 0)}.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 'support' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">Nombre *</span>
                        <input
                          type="text"
                          value={form.lessor_name}
                          onChange={(event) =>
                            updateField('lessor_name', event.target.value.slice(0, textLimits.lessor_name))
                          }
                          maxLength={textLimits.lessor_name}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">Contacto *</span>
                        <input
                          type="text"
                          value={form.lessor_contact}
                          onChange={(event) =>
                            updateField('lessor_contact', event.target.value.slice(0, textLimits.lessor_contact))
                          }
                          maxLength={textLimits.lessor_contact}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-800">Documento</span>
                        <input
                          type="text"
                          value={form.lessor_document}
                          onChange={(event) =>
                            updateField('lessor_document', event.target.value.slice(0, textLimits.lessor_document))
                          }
                          maxLength={textLimits.lessor_document}
                          disabled={status === 'submitting'}
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="font-black text-slate-950">Soporte documental</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        En esta versión no se cargan documentos. Indica si cuentas con soportes para una eventual verificación administrativa.
                      </p>
                      <div className="mt-4">
                        <YesNoSelect
                          label="Cuentas con soporte documental verificable"
                          value={form.has_supporting_documents}
                          onChange={(value) => updateField('has_supporting_documents', value)}
                          disabled={status === 'submitting'}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 'review' && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                      <h3 className="font-black">Listo para revisión administrativa</h3>
                      <p className="mt-1 text-sm leading-6">
                        Revisa el resumen antes de enviar. Este aporte no es un reporte negativo y no modifica el score automáticamente.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SummaryItem
                        label="Documento"
                        value={`${form.subject_document_type || 'Documento'} ${displayValue(form.subject_document_number)}`}
                      />
                      <SummaryItem
                        label="Titular"
                        value={form.subject_type ? subjectTypeLabels[form.subject_type] : 'Pendiente'}
                      />
                      <SummaryItem
                        label="Origen"
                        value={form.source_type ? sourceTypeLabels[form.source_type] : 'Pendiente'}
                      />
                      <SummaryItem label="Ciudad" value={displayValue(form.city)} />
                      <SummaryItem label="Inmueble" value={displayValue(form.property_type)} />
                      <SummaryItem
                        label="Fechas"
                        value={`${displayValue(form.contract_start_date)} a ${displayValue(form.contract_end_date)}`}
                      />
                      <SummaryItem label="Canon" value={formatMoney(form.monthly_rent_amount)} />
                      <SummaryItem
                        label="Cumplimiento"
                        value={`Mora: ${formatBooleanField(form.had_late_payments)} · Entrega: ${formatBooleanField(form.formal_handover)}`}
                      />
                      <SummaryItem
                        label="Estado inmueble"
                        value={`Daños: ${formatBooleanField(form.had_property_damage)} · Deuda entrega: ${formatBooleanField(form.had_debt_at_handover)}`}
                      />
                      <SummaryItem label="Soportes" value={formatBooleanField(form.has_supporting_documents)} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  disabled={activeStepIndex === 0 || status === 'submitting'}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Atrás
                </button>

                {activeStep === 'review' ? (
                  <button
                    type="button"
                    onClick={submitRentalHistory}
                    disabled={status === 'submitting'}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-6 py-2 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {status === 'submitting' ? 'Enviando...' : 'Enviar historial para revisión'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goToNextStep}
                    disabled={status === 'submitting'}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-6 py-2 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    Continuar
                  </button>
                )}
              </div>
            </section>
          </form>

          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Guía de aporte</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Historial informativo</h2>
            <div className="mt-5 space-y-3">
              {[
                'Esto no es un reporte negativo.',
                'La información será revisada.',
                'No afecta score automáticamente.',
                'Historial verificado puede otorgar créditos.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold leading-6 text-slate-800">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
              <p className="text-sm font-semibold leading-6">
                Evita opiniones personales, insultos o acusaciones sin soporte. El objetivo es aportar contexto verificable.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </PlatformShell>
  );
}
