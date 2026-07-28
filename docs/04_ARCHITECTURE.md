# InmoScore - Architecture

## Vista general

InmoScore esta dividido en un frontend Next.js y un backend Express. Supabase provee PostgreSQL y servicios de autenticacion. Los servicios externos principales son Resend para correo, Turnstile para proteccion antifraude y proveedores de pago segun modulo.

## Frontend

Tecnologias:

- Next.js 16.
- React 19.
- TypeScript.
- Tailwind CSS 4.
- Supabase JS client.
- Axios para llamadas HTTP.

Responsabilidades:

- UI publica y autenticada.
- Login, registro, reset password y cambio de password.
- Dashboard, busqueda, reportes, configuracion, admin y flujos legales.
- Integracion con Turnstile en auth.
- Uso exclusivo de claves publicas o anonimas permitidas.

## Backend

Tecnologias:

- Express 4.
- TypeScript.
- Supabase JS.
- JWT.
- Helmet, CORS, rate limits.
- Zod y express-validator.

Responsabilidades:

- API de negocio.
- Autenticacion y autorizacion server-side.
- Scoring.
- Auditoria.
- Reportes legales.
- Creditos y pagos.
- Integracion con Supabase, Resend, Turnstile, Wompi y Stripe.

## Base de datos

Supabase/PostgreSQL almacena:

- Usuarios, organizaciones y planes.
- Inquilinos e historiales.
- Busquedas, creditos y auditoria.
- Reportes, evidencia, revisiones y notificaciones.
- Solicitudes legales, disputas, revision humana e identidad.
- Documentos seguros y logs de acceso.
- Pagos y eventos de billing.

## Servicios externos

- Vercel: hosting del frontend.
- Railway o alternativa: hosting del backend Express.
- Supabase: Auth, PostgreSQL y storage segun configuracion.
- Resend: emails transaccionales.
- Turnstile: proteccion contra abuso en auth.
- Wompi/Stripe: pagos y webhooks.

## Flujo de alto nivel

1. Usuario opera en frontend Next.js.
2. Frontend llama al backend Express usando token valido cuando aplica.
3. Backend valida token, rate limits, Turnstile o permisos segun endpoint.
4. Backend ejecuta logica de negocio y persiste en Supabase/PostgreSQL.
5. Eventos criticos generan auditoria best-effort.
6. Servicios externos se consumen desde backend, nunca desde cliente con secretos.

## Limites criticos

- El frontend no debe conocer secretos.
- El backend es la frontera para operaciones privilegiadas.
- Scoring debe mantenerse aislado en su modulo.
- Auditoria no debe filtrar PII innecesaria ni secretos.
- Migraciones deben poder ejecutarse mas de una vez sin romper datos.
