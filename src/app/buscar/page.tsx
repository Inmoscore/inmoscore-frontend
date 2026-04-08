'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ResultadoBusqueda = {
  success: boolean;
  cedula: string;
  nombre: string | null;
  score: number | null;
  clasificacion: string | null;
  total_reportes: number;
  reportes_aprobados: number;
  procesos_judiciales: number;
  detalle_reportes: any[];
  detalle_procesos: any[];
};

export default function BuscarPage() {
  const router = useRouter();

  const [cedula, setCedula] = useState('');
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const buscarArrendatario = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    setResultado(null);

    try {
      const token = localStorage.getItem('token');

      if (!token) {
        setError('Debes iniciar sesión para realizar búsquedas');
        router.push('/login');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/tenants/search?cedula=${encodeURIComponent(cedula)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setResultado(data);
      } else {
        setError(data.message || 'No se pudo completar la búsqueda');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  const noEncontrado = resultado && resultado.nombre === null;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Buscar Arrendatario</h1>

        <form onSubmit={buscarArrendatario} className="bg-white p-6 rounded-lg shadow-md mb-6">
          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">
              Número de Cédula
            </label>
            <input
              type="text"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ingrese la cédula"
              required
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {cargando ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {resultado && noEncontrado && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 p-4 rounded-lg shadow-sm">
            No se encontró historial para la cédula <strong>{resultado.cedula}</strong>.
          </div>
        )}

        {resultado && !noEncontrado && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold mb-4">Resultado</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <p><strong>Nombre:</strong> {resultado.nombre}</p>
                <p><strong>Cédula:</strong> {resultado.cedula}</p>
                <p><strong>Score:</strong> {resultado.score}</p>
                <p><strong>Clasificación:</strong> {resultado.clasificacion}</p>
                <p><strong>Total reportes:</strong> {resultado.total_reportes}</p>
                <p><strong>Procesos judiciales:</strong> {resultado.procesos_judiciales}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Detalle de reportes</h3>

              {resultado.detalle_reportes?.length > 0 ? (
                <div className="space-y-4">
                  {resultado.detalle_reportes.map((reporte, index) => (
                    <div key={reporte.id || index} className="border rounded-lg p-4">
                      <p><strong>Tipo:</strong> {reporte.tipo_problema}</p>
                      <p><strong>Estado:</strong> {reporte.estado}</p>
                      <p><strong>Fecha:</strong> {reporte.fecha_reporte}</p>
                      <p><strong>Descripción:</strong> {reporte.descripcion}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No hay reportes aprobados para este arrendatario.</p>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Procesos judiciales</h3>

              {resultado.detalle_procesos?.length > 0 ? (
                <div className="space-y-4">
                  {resultado.detalle_procesos.map((proceso, index) => (
                    <div key={proceso.id || index} className="border rounded-lg p-4">
                      <p><strong>Tipo proceso:</strong> {proceso.tipo_proceso || 'N/A'}</p>
                      <p><strong>Juzgado:</strong> {proceso.juzgado || 'N/A'}</p>
                      <p><strong>Ciudad:</strong> {proceso.ciudad || 'N/A'}</p>
                      <p><strong>Fecha:</strong> {proceso.fecha || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No se encontraron procesos judiciales.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}