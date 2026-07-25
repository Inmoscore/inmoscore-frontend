"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import { setSession } from "@/lib/auth";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";

type LoginResponse = {
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

type FormState = {
  email: string;
  password: string;
};

const passwordResetSuccessMessage =
  "Contraseña actualizada correctamente. Ya puedes iniciar sesión.";

function getSafeRedirect(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes(":")) return "/";
  return value;
}

function createApiError(message: string, code?: string): ApiError {
  const error = new Error(message) as ApiError;
  error.code = code;
  return error;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordResetSucceeded =
    searchParams.get("password_reset") === "success";

  const [formData, setFormData] = useState<FormState>({
    email: "",
    password: "",
  });

  const [cargando, setCargando] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [loginTurnstileToken, setLoginTurnstileToken] = useState("");
  const [resetTurnstileToken, setResetTurnstileToken] = useState("");
  const [loginTurnstileResetKey, setLoginTurnstileResetKey] = useState(0);
  const [resetTurnstileResetKey, setResetTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    passwordResetSucceeded ? passwordResetSuccessMessage : ""
  );

  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileErrorMessage = "No pudimos validar que eres una persona real. Intenta nuevamente.";

  const redirectTo = useMemo(() => {
    return getSafeRedirect(searchParams.get("redirect"));
  }, [searchParams]);

  useEffect(() => {
    if (!passwordResetSucceeded) return;

    const cleanedSearchParams = new URLSearchParams(searchParams.toString());
    cleanedSearchParams.delete("password_reset");
    const cleanedQuery = cleanedSearchParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      cleanedQuery ? `/login?${cleanedQuery}` : "/login"
    );
  }, [passwordResetSucceeded, searchParams]);

  const handleChange =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  const handleLoginTurnstileToken = useCallback((token: string) => {
    setLoginTurnstileToken(token.trim());
  }, []);

  const handleResetTurnstileToken = useCallback((token: string) => {
    setResetTurnstileToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (cargando) return;

    setCargando(true);
    setError("");

    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (!API_URL) {
      setError("La URL del backend no está configurada");
      setCargando(false);
      return;
    }

    if (!email || !password) {
      setError("Email y contraseña son requeridos");
      setCargando(false);
      return;
    }

    const turnstileToken = loginTurnstileToken.trim();

    if (!turnstileToken) {
      setError(turnstileErrorMessage);
      setCargando(false);
      return;
    }

    try {
      console.log("[LOGIN_TURNSTILE_SUBMIT]", {
        hasToken: Boolean(turnstileToken),
        tokenLength: turnstileToken?.length || 0,
      });

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          turnstileToken,
        }),
      });

      let data: LoginResponse = {};

      try {
        data = await response.json();
      } catch {
        throw new Error("El servidor devolvió una respuesta inválida");
      }

      if (!response.ok || !data.success) {
        if (data.code === "TURNSTILE_REQUIRED" || data.code === "TURNSTILE_FAILED") {
          throw createApiError(turnstileErrorMessage, data.code);
        }
        throw new Error(data.message || "Error al iniciar sesión");
      }

      if (!data.token || !data.user) {
        throw new Error("La respuesta del servidor está incompleta");
      }

      setSession(data.token, data.user);

      router.replace(redirectTo);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al conectar con el servidor";
      setError(message);
      if ((err as ApiError).code === "TURNSTILE_FAILED") {
        setLoginTurnstileToken("");
        setLoginTurnstileResetKey((current) => current + 1);
      }
    } finally {
      setCargando(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resetting) return;

    if (!API_URL) {
      setError("La URL del backend no esta configurada");
      return;
    }

    if (!resetTurnstileToken) {
      setError(turnstileErrorMessage);
      return;
    }

    try {
      setResetting(true);
      setError("");
      setNotice("");
      const response = await fetch(`${API_URL}/api/auth/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          turnstileToken: resetTurnstileToken,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === "TURNSTILE_REQUIRED" || data.code === "TURNSTILE_FAILED") {
          throw createApiError(turnstileErrorMessage, data.code);
        }
        throw new Error(data.message || "No se pudo solicitar recuperacion");
      }

      setNotice(data.message || "Revisa tu correo para continuar.");
      setResetEmail("");
      setResetTurnstileToken("");
      setResetTurnstileResetKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar recuperacion");
      if ((err as ApiError).code === "TURNSTILE_FAILED") {
        setResetTurnstileToken("");
        setResetTurnstileResetKey((current) => current + 1);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-md w-full rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Plataforma segura
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Iniciar Sesión</h1>
          <p className="mt-2 text-sm text-slate-600">Accede a consultas de riesgo y reportes verificados.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-bold text-slate-700">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={handleChange("email")}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              required
              disabled={cargando}
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-bold text-slate-700">Contraseña</label>
            <input
              type="password"
              value={formData.password}
              onChange={handleChange("password")}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              required
              disabled={cargando}
              autoComplete="current-password"
            />
          </div>

          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            resetKey={loginTurnstileResetKey}
            onTokenChange={handleLoginTurnstileToken}
            onError={() => setError(turnstileErrorMessage)}
          />

          <button
            type="submit"
            disabled={cargando || !loginTurnstileToken}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {cargando ? "Iniciando sesión..." : "Iniciar Sesión"}
          </button>

          <button
            type="button"
            onClick={() => setShowReset((current) => !current)}
            className="w-full text-sm font-bold text-blue-700 hover:underline"
          >
            Olvide mi contrasena
          </button>

          <p className="mt-5 text-center text-sm text-slate-600">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-bold text-blue-700 hover:underline">
              Regístrate aquí
            </Link>
            <span className="mx-2">|</span>
            <Link href="/legal/verificacion-identidad" className="font-bold hover:text-blue-700 hover:underline">
              Verificación identidad
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
        </form>

        {showReset && (
          <form onSubmit={handleResetRequest} className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950">
              <MailCheck className="h-4 w-4" />
              Recuperar contrasena
            </div>
            <input
              type="email"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              placeholder="correo@ejemplo.com"
              autoComplete="email"
              required
            />
            <div className="mt-3">
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                resetKey={resetTurnstileResetKey}
                onTokenChange={handleResetTurnstileToken}
                onError={() => setError(turnstileErrorMessage)}
              />
            </div>
            <button
              type="submit"
              disabled={resetting}
              className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {resetting ? "Enviando..." : "Enviar instrucciones"}
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
          <div className="max-w-md w-full">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <p className="text-center text-gray-600">Cargando...</p>
            </div>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
