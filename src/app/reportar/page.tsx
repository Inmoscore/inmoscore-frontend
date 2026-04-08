'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const [cargando, setCargando] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const enviarReporte = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setMensaje('');

    try {
      const token = localStorage.getItem('token');

      if (!token) {
        setMensaje('Debes iniciar sesión para reportar');
        router.push('/login');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setMensaje('Reporte enviado correctamente');
        setFormData({
          nombre: '',
          cedula: '',
          telefono: '',
          ciudad: '',
          tipo_problema: '',
          descripcion: '',
        });
      } else {
        setMensaje(data.message || 'Error al enviar reporte');
      }
    } catch (error) {
      setMensaje('Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Reportar Inquilino
        </h1>

        <form onSubmit={enviarReporte} className="space-y-4">
          <input
            type="text"
            name="nombre"
            placeholder="Nombre completo"
            value={formData.nombre}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />

          <input
            type="text"
            name="cedula"
            placeholder="Cédula"
            value={formData.cedula}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />

          <input
            type="text"
            name="telefono"
            placeholder="Teléfono (opcional)"
            value={formData.telefono}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
          />

          <input
            type="text"
            name="ciudad"
            placeholder="Ciudad"
            value={formData.ciudad}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />

          <select
  name="tipo_problema"
  value={formData.tipo_problema}
  onChange={handleChange}
  className="w-full px-3 py-2 border rounded-lg"
  required
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
          />

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:bg-gray-400"
          >
            {cargando ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </form>

        {mensaje && (
          <p className="mt-4 text-center">{mensaje}</p>
        )}
      </div>
    </div>
  );
}