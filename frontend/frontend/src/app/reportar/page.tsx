'use client';

import { useState } from 'react';

export default function BuscarPage() {
  const [cedula, setCedula] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const buscarArrendatario = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    setResultado(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search-tenant?cedula=${cedula}`);
      const data = await response.json();
      
      if (response.ok) {
        setResultado(data);
      } else {
        setError(data.message || 'No se encontró el arrendatario');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
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

        {resultado && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">Resultado</h2>
            <div className="space-y-2">
              <p><strong>Nombre:</strong> {resultado.nombre}</p>
              <p><strong>Cédula:</strong> {resultado.cedula}</p>
              <p><strong>Score:</strong> {resultado.score}</p>
              <p><strong>Clasificación:</strong> {resultado.clasificacion}</p>
              <p><strong>Reportes:</strong> {resultado.numero_reportes}</p>
              <p><strong>Procesos judiciales:</strong> {resultado.procesos_judiciales}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}