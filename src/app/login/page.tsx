'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSession } from '@/lib/auth';

type LoginResponse = {
  success?: boolean;
  message?: string;
  token?: string;
  user?: {
    id: string;
    nombre?: string;
    fullName?: string;
    email: string;
    tipo_usuario?: string;
  };
};

export default function LoginPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (cargando) return;

    setCargando(true);
    setError('');

    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (!API_URL) {
      setError('La URL del backend no está configurada');
      setCargando(false);
      return;
    }

    if (!email || !password) {
      setError('Email y contraseña son requeridos');
      setCargando(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      let data: LoginResponse = {};

      try {
        data = await response.json();
      } catch {
        throw new Error('El servidor devolvió una respuesta inválida');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al iniciar sesión');
      }

      if (!data.token || !data.user) {
        throw new Error('La respuesta del servidor está incompleta');
      }

      setSession(data.token, data.user);

      const next = new URLSearchParams(window.location.search).get('redirect');
      const safeRedirect =
        next &&
        next.startsWith('/') &&
        !next.startsWith('//') &&
        !next.includes(':');

      router.push(safeRedirect ? next : '/');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al conectar con el servidor';
      setError(message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Iniciar Sesión</h1>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={cargando}
              autoComplete="email"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">Contraseña</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={cargando}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {cargando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>

          <p className="mt-4 text-center text-gray-600">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-blue-600 hover:underline">
              Regístrate aquí
            </Link>
          </p>
        </form>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}