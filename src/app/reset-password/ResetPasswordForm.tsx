"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { completePasswordReset } from "./actions";
import { initialResetPasswordState } from "./resetPasswordState";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    completePasswordReset,
    initialResetPasswordState
  );

  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(() => router.replace("/login"), 1800);
    return () => window.clearTimeout(timer);
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-700">
          Nueva contraseña
        </label>
        <input
          type="password"
          name="password"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending || state.status === "success"}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-slate-700">
          Confirmar contraseña
        </label>
        <input
          type="password"
          name="confirmPassword"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending || state.status === "success"}
        />
      </div>

      {state.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.message}
        </div>
      )}

      {state.status === "success" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || state.status === "success"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}
        Actualizar contraseña
      </button>

      <Link
        href="/login"
        className="block text-center text-sm font-bold text-blue-700 hover:text-blue-900"
      >
        Volver al login
      </Link>
    </form>
  );
}
