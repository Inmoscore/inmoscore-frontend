"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck2, ShieldCheck, UserPlus } from "lucide-react";
import { setSession } from "@/lib/auth";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";

type RegisterResponse = {
  success?: boolean;
  message?: string;
  code?: string;
  token?: string;
  user?: {
    id: string;
    nombre?: string;
    fullName?: string;
    email: string;
    tipo_usuario?: string;
  };
};

type ApiError = Error & {
  code?: string;
};

type LegalDocumentType =
  | "privacy_policy"
  | "terms_conditions"
  | "scoring_authorization"
  | "habeas_data_authorization"
  | "cookies_policy";

type ActiveLegalDocument = {
  document_type: LegalDocumentType;
  version: string;
  effective_date: string;
  title: string;
};

type ActiveLegalDocumentsResponse = {
  success?: boolean;
  documents?: ActiveLegalDocument[];
};

function createApiError(message: string, code?: string): ApiError {
  const error = new Error(message) as ApiError;
  error.code = code;
  return error;
}

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    documentNumber: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    acceptPrivacy: false,
    acceptScoring: false,
    marketingConsent: false,
  });

  const [legalDocuments, setLegalDocuments] = useState<ActiveLegalDocument[]>([]);
  const [legalDocumentsLoading, setLegalDocumentsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isFormLocked = loading || !!success;
  const turnstileErrorMessage = "No pudimos validar que eres una persona real. Intenta nuevamente.";

  useEffect(() => {
    let cancelled = false;

    async function loadLegalDocuments() {
      if (!API_URL) {
        setLegalDocumentsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/legal/documents/active`, {
          cache: "no-store",
        });
        const data: ActiveLegalDocumentsResponse = await response.json().catch(() => ({}));

        if (!cancelled && response.ok && data.success && Array.isArray(data.documents)) {
          setLegalDocuments(data.documents);
        }
      } finally {
        if (!cancelled) {
          setLegalDocumentsLoading(false);
        }
      }
    }

    loadLegalDocuments();

    return () => {
      cancelled = true;
    };
  }, [API_URL]);

  const legalDocumentByType = useMemo(() => {
    return legalDocuments.reduce((acc, document) => {
      acc[document.document_type] = document;
      return acc;
    }, {} as Partial<Record<LegalDocumentType, ActiveLegalDocument>>);
  }, [legalDocuments]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isFormLocked) return;

    setError("");
    setSuccess("");

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const documentNumber = form.documentNumber.replace(/\D/g, "").slice(0, 40);
    const phone = form.phone.trim();
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (!API_URL) {
      setError("La URL del backend no está configurada");
      return;
    }

    if (!fullName) {
      setError("El nombre completo es obligatorio");
      return;
    }

    if (!email) {
      setError("El correo es obligatorio");
      return;
    }

    if (documentNumber.length < 4) {
      setError("La cedula es obligatoria");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Ingresa un correo electrónico válido");
      return;
    }

    if (password.length < 8) {
      setError("La contrasena debe tener al menos 8 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!form.acceptTerms || !form.acceptPrivacy || !form.acceptScoring) {
      setError("Debes aceptar Términos, Privacidad y Autorización de scoring para crear tu cuenta");
      return;
    }

    if (!turnstileToken) {
      setError(turnstileErrorMessage);
      return;
    }

    const requiredLegalDocuments = [
      legalDocumentByType.terms_conditions,
      legalDocumentByType.privacy_policy,
      legalDocumentByType.scoring_authorization,
    ];

    if (legalDocumentsLoading || requiredLegalDocuments.some((document) => !document)) {
      setError("No se pudieron cargar las versiones legales vigentes. Intenta nuevamente.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre: fullName,
          email,
          document_type: "CC",
          document_number: documentNumber,
          cedula: documentNumber,
          phone,
          password,
          turnstileToken,
          marketing_consent: form.marketingConsent,
          legal_acceptances: [
            {
              document_type: "terms_conditions",
              document_version: legalDocumentByType.terms_conditions?.version,
              acceptance_method: "registration_checkbox",
              consent_purposes: {
                account_creation: true,
                service_terms: true,
              },
            },
            {
              document_type: "privacy_policy",
              document_version: legalDocumentByType.privacy_policy?.version,
              acceptance_method: "registration_checkbox",
              consent_purposes: {
                personal_data_processing: true,
                account_management: true,
                service_operation: true,
              },
            },
            {
              document_type: "scoring_authorization",
              document_version: legalDocumentByType.scoring_authorization?.version,
              acceptance_method: "registration_checkbox",
              consent_purposes: {
                real_estate_risk_analysis: true,
                automated_scoring_preparation: true,
              },
            },
          ],
        }),
      });

      let data: RegisterResponse = {};

      try {
        data = await response.json();
      } catch {
        throw new Error("El servidor devolvió una respuesta inválida");
      }

      if (!response.ok || !data.success) {
        const friendlyMessageByCode: Record<string, string> = {
          DUPLICATE_EMAIL: "Este correo ya está registrado.",
          DUPLICATE_DOCUMENT: "Esta cédula ya está asociada a una cuenta.",
          DUPLICATE_PHONE: "Este teléfono ya fue usado recientemente.",
          DOCUMENT_REQUIRED: "La cedula es obligatoria",
          TURNSTILE_REQUIRED: turnstileErrorMessage,
          TURNSTILE_FAILED: turnstileErrorMessage,
        };
        throw createApiError(
          (data.code && friendlyMessageByCode[data.code]) ||
            data.message ||
            "No se pudo registrar el usuario",
          data.code
        );
      }

      if (!data.token || !data.user) {
        throw new Error("La respuesta del servidor está incompleta");
      }

      setSession(data.token, data.user);
      setSuccess("Cuenta creada correctamente");

      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ocurrió un error inesperado";
      setError(message);
      if ((err as ApiError).code === "TURNSTILE_FAILED") {
        setTurnstileToken("");
        setTurnstileResetKey((current) => current + 1);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
            <UserPlus className="h-6 w-6" />
          </div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Registro con consentimientos
          </div>
        <h1 className="mb-2 text-center text-3xl font-black tracking-tight text-slate-950">
          Crear cuenta
        </h1>

        <p className="text-center text-sm text-slate-600">
          Regístrate en InmoScore
        </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="fullName"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              autoComplete="name"
              required
              disabled={isFormLocked}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              placeholder="Tu nombre completo"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
              disabled={isFormLocked}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="documentNumber"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Cedula
            </label>
            <input
              id="documentNumber"
              type="text"
              name="documentNumber"
              value={form.documentNumber}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  documentNumber: event.target.value.replace(/\D/g, "").slice(0, 40),
                }))
              }
              inputMode="numeric"
              autoComplete="off"
              required
              disabled={isFormLocked}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              placeholder="Numero de cedula"
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Teléfono
            </label>
            <input
              id="phone"
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
              disabled={isFormLocked}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              placeholder="3001234567"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
              disabled={isFormLocked}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
              disabled={isFormLocked}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              placeholder="Repite tu contraseña"
            />
          </div>

          <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <legend className="inline-flex items-center gap-2 px-1 text-sm font-black text-slate-900">
              <FileCheck2 className="h-4 w-4 text-blue-700" />
              Consentimientos legales
            </legend>

            <label className="flex gap-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={form.acceptTerms}
                onChange={handleChange}
                disabled={isFormLocked}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Acepto los{" "}
                <a href="#terms_conditions" className="font-medium text-blue-700 hover:underline">
                  Términos y Condiciones
                </a>
                .
              </span>
            </label>

            <label className="flex gap-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                name="acceptPrivacy"
                checked={form.acceptPrivacy}
                onChange={handleChange}
                disabled={isFormLocked}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Acepto la{" "}
                <a href="#privacy_policy" className="font-medium text-blue-700 hover:underline">
                  Política de Privacidad
                </a>
                .
              </span>
            </label>

            <label className="flex gap-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                name="acceptScoring"
                checked={form.acceptScoring}
                onChange={handleChange}
                disabled={isFormLocked}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Autorizo el{" "}
                <a
                  href="#scoring_authorization"
                  className="font-medium text-blue-700 hover:underline"
                >
                  tratamiento para scoring inmobiliario
                </a>
                .
              </span>
            </label>

            <label className="flex gap-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                name="marketingConsent"
                checked={form.marketingConsent}
                onChange={handleChange}
                disabled={isFormLocked}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>Acepto recibir comunicaciones comerciales. Opcional.</span>
            </label>

            <p className="text-xs leading-5 text-slate-500">
              {legalDocumentsLoading
                ? "Cargando versiones legales vigentes..."
                : "Las aceptaciones se registran con versión, fecha, IP y navegador."}
            </p>
          </fieldset>

          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            resetKey={turnstileResetKey}
            onTokenChange={handleTurnstileToken}
            onError={() => setError(turnstileErrorMessage)}
          />

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={isFormLocked}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {success
              ? "Cuenta creada"
              : loading
                ? "Registrando..."
                : "Registrarme"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-bold text-blue-700 hover:underline"
          >
            Inicia sesión
          </Link>
        </p>

        <p className="mt-4 text-center text-xs leading-6 text-slate-500">
          <Link href="/legal/solicitudes-datos" className="hover:text-blue-700 hover:underline">
            Solicitudes sobre datos personales
          </Link>
          <span className="mx-2">|</span>
          <Link href="/legal/disputas" className="hover:text-blue-700 hover:underline">
            Disputas
          </Link>
          <span className="mx-2">|</span>
          <Link href="/legal/revision-humana" className="hover:text-blue-700 hover:underline">
            Revisión humana
          </Link>
        </p>
      </div>
    </main>
  );
}
