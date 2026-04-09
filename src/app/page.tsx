'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, hasSession } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  const [logueado, setLogueado] = useState(false);

  useEffect(() => {
    setLogueado(hasSession());
  }, []);

  const handleBuscar = () => {
    if (!logueado) {
      router.push('/login?redirect=/buscar');
      return;
    }

    router.push('/buscar');
  };

  const handleReportar = () => {
    if (!logueado) {
      router.push('/login?redirect=/reportar');
      return;
    }

    router.push('/reportar');
  };

  const handleLogout = () => {
    clearSession();
    setLogueado(false);
    router.push('/login');
  };

  const handleLogin = () => {
    router.push('/login');
  };

  const handleRegister = () => {
    router.push('/register');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 px-6">
      <div className="max-w-2xl text-center text-white">
        <h1 className="mb-4 text-5xl font-bold">InmoScore</h1>

        <p className="mb-8 text-lg">
          Consulta el historial de riesgo de arrendatarios en Colombia
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <button
            onClick={handleBuscar}
            className="rounded-lg bg-white px-6 py-3 font-semibold text-blue-700 hover:bg-gray-100"
          >
            Buscar Arrendatario
          </button>

          <button
            onClick={handleReportar}
            className="rounded-lg border border-white px-6 py-3 font-semibold text-white hover:bg-white hover:text-blue-700"
          >
            Reportar
          </button>
        </div>

        {!logueado ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={handleLogin}
              className="rounded-lg bg-blue-900 px-6 py-3 font-semibold text-white hover:bg-blue-950"
            >
              Iniciar sesión
            </button>

            <button
              onClick={handleRegister}
              className="rounded-lg border border-white px-6 py-3 font-semibold text-white hover:bg-white hover:text-blue-700"
            >
              Registrarse
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </main>
  );
}