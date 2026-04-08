'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [logueado, setLogueado] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setLogueado(!!token);
  }, []);

  const handleBuscar = () => {
    if (!logueado) {
      router.push('/login');
    } else {
      router.push('/buscar');
    }
  };

  const handleReportar = () => {
    if (!logueado) {
      router.push('/login');
    } else {
      router.push('/reportar');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setLogueado(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800">
      <div className="text-center text-white">
        <h1 className="text-5xl font-bold mb-4">InmoScore</h1>
        <p className="mb-8 text-lg">
          Consulta el historial de riesgo de arrendatarios en Colombia
        </p>

        <div className="flex gap-4 justify-center mb-6">
          <button
            onClick={handleBuscar}
            className="px-6 py-3 bg-white text-blue-700 rounded font-semibold"
          >
            Buscar Arrendatario
          </button>

          <button
            onClick={handleReportar}
            className="px-6 py-3 border border-white rounded font-semibold"
          >
            Reportar
          </button>
        </div>

        {/* 🔐 Estado de sesión */}
        {!logueado ? (
          <button
            onClick={() => router.push('/login')}
            className="underline"
          >
            Iniciar sesión
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="underline text-red-200"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </main>
  );
}