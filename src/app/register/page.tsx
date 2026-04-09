    "use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.fullName.trim()) {
      setError("El nombre completo es obligatorio");
      return;
    }

    if (!form.email.trim()) {
      setError("El correo es obligatorio");
      return;
    }

    if (form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          password: form.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "No se pudo registrar el usuario");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setSuccess("Cuenta creada correctamente");

      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-700 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-center text-gray-900">
          Crear cuenta
        </h1>
        <p className="mb-6 text-center text-gray-600">
          Regístrate en InmoScore
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nombre completo
            </label>
            <input
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-blue-600"
              placeholder="Tu nombre completo"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Correo electrónico
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-blue-600"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Teléfono
            </label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-blue-600"
              placeholder="3001234567"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-blue-600"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Confirmar contraseña
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-blue-600"
              placeholder="Repite tu contraseña"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-100 px-4 py-2 text-sm text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "Registrando..." : "Registrarme"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-blue-700 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}