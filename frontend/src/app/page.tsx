export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 text-white">
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">
            InmoScore
          </h1>
          <p className="text-xl mb-8 text-blue-100">
            Consulta el historial de riesgo de arrendatarios en Colombia
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/buscar" className="px-8 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition">
              Buscar Arrendatario
            </a>
            <a href="/reportar" className="px-8 py-3 bg-blue-700 text-white border-2 border-white rounded-lg font-semibold hover:bg-blue-800 transition">
              Reportar
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}