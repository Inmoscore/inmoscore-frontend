'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getToken } from '@/lib/auth';

type ReporteResponse = {
  success?: boolean;
  message?: string;
};

export default function ReportarPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    nombre: '',
    cedula: '',
    telefono: '',
    ciudad: '',
    tipo_problema: '',
    descripcion: '',
  });

  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  const handleGoHome = () => {
    router.push('/');
  };

  const enviarReporte = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (cargando) return;

    setCargando(true);
    setMensaje('');
    setError('');

    try {
      if (!API_URL) {
        setError('La URL del backend no está configurada');
        return;
      }

      const token = getToken();

      if (!token) {
        setError('Debes iniciar sesión para reportar');
        router.push('/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          cedula: formData.cedula.trim(),
          telefono: formData.telefono.trim(),
          ciudad: formData.ciudad.trim(),
          tipo_problema: formData.tipo_problema,
          descripcion: formData.descripcion.trim(),
        }),
      });

      let data: ReporteResponse = {};

      try {
        data = await response.json();
      } catch {
        throw new Error('El servidor devolvió una respuesta inválida');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al enviar reporte');
      }

      setMensaje(data.message || 'Reporte enviado correctamente');

      setFormData({
        nombre: '',
        cedula: '',
        telefono: '',
        ciudad: '',
        tipo_problema: '',
        descripcion: '',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al conectar con el servidor';
      setError(message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-xl mx-auto">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-center sm:text-left">
            Reportar Inquilino
          </h1>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleGoHome}
              className="rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-800"
            >
              Inicio
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <form onSubmit={enviarReporte} className="space-y-4">
            <input
              type="text"
              name="nombre"
              placeholder="Nombre completo"
              value={formData.nombre}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
              disabled={cargando}
            />

            <input
              type="text"
              name="cedula"
              placeholder="Cédula"
              value={formData.cedula}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
              disabled={cargando}
            />

            <input
              type="text"
              name="telefono"
              placeholder="Teléfono (opcional)"
              value={formData.telefono}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              disabled={cargando}
            />

            <input
              type="text"
              name="ciudad"
              placeholder="Ciudad"
              value={formData.ciudad}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
              disabled={cargando}
            />

            <select
              name="tipo_problema"
              value={formData.tipo_problema}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
              disabled={cargando}
            >
              <option value="">Selecciona el tipo de problema</option>
              <option value="impago">Mora / Impago</option>
              <option value="danos">Daños al inmueble</option>
              <option value="desalojo">Desalojo</option>
              <option value="ruido">Ruido</option>
              <option value="otros">Otros</option>
            </select>

            <textarea
              name="descripcion"
              placeholder="Describe el problema"
              value={formData.descripcion}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              rows={4}
              required
              disabled={cargando}
            />

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {cargando ? 'Enviando...' : 'Enviar reporte'}
            </button>
          </form>

          {mensaje && (
            <div className="mt-4 rounded-lg bg-green-100 px-4 py-3 text-green-700">
              {mensaje}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-red-100 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}