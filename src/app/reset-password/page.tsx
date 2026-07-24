import Link from "next/link";
import { cookies } from "next/headers";
import { KeyRound, ShieldAlert } from "lucide-react";
import {
  RECOVERY_GRANT_COOKIE,
  recoveryGrantMatchesSession,
  requireRecoveryFlowSecret,
} from "../../lib/recoveryCookies.server";
import { createSupabaseServerClient } from "../../lib/supabaseServer";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

function InvalidRecoveryLink() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        <div className="mb-2 flex items-center gap-2 font-bold">
          <ShieldAlert className="h-5 w-5" />
          Enlace inválido o expirado
        </div>
        Solicita un nuevo correo de recuperación desde la pantalla de login.
      </div>
      <Link
        href="/login"
        className="block w-full rounded-xl bg-blue-700 px-4 py-3 text-center font-bold text-white transition hover:bg-blue-800"
      >
        Volver al login
      </Link>
    </div>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const query = await searchParams;
  const cookieStore = await cookies();
  let recoveryAuthorized = false;

  if (query.error !== "invalid_link") {
    try {
      const supabase = createSupabaseServerClient({
        getAll: () => cookieStore.getAll(),
      });
      const [
        {
          data: { user },
          error: userError,
        },
        {
          data: { session },
          error: sessionError,
        },
      ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

      recoveryAuthorized = Boolean(
        !userError &&
          !sessionError &&
          user?.id &&
          session?.access_token &&
          recoveryGrantMatchesSession(
            cookieStore.get(RECOVERY_GRANT_COOKIE)?.value,
            { userId: user.id, accessToken: session.access_token },
            requireRecoveryFlowSecret()
          )
      );
    } catch {
      recoveryAuthorized = false;
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-950 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Cambiar contraseña
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Ingresa una nueva contraseña para recuperar el acceso a InmoScore.
            </p>
          </div>

          {recoveryAuthorized ? <ResetPasswordForm /> : <InvalidRecoveryLink />}
        </div>
      </section>
    </main>
  );
}
