# InmoScore - Deployment

## Objetivo

Desplegar InmoScore en produccion con frontend, backend, Supabase, Resend, Turnstile y pagos configurados de forma segura.

## Frontend: Vercel

Aplicacion:

- Next.js 16.
- Comando build: `npm run build`.
- Comando dev local: `npm run dev`.

Variables esperadas:

- URL publica del backend.
- Supabase URL publica.
- Supabase anon/public key.
- Turnstile site key.
- `RECOVERY_FLOW_SECRET` privado (minimo 32 caracteres), exclusivo del frontend.

Reglas:

- No subir secretos privados como `NEXT_PUBLIC_*`.
- Validar dominios y redirects productivos.
- Revisar errores de build antes de promover.

## Backend: Railway o alternativa

Aplicacion:

- Express/Node.
- Comando build: `npm run build` dentro de `backend`.
- Comando start: `npm run start` dentro de `backend`.

Variables esperadas:

- Supabase URL.
- Supabase anon key si aplica.
- Supabase service role solo en backend.
- JWT secret.
- Resend API key.
- Turnstile secret key.
- Wompi/Stripe secrets segun modulo activo.
- CORS origin del frontend.

Reglas:

- Backend debe exponer `GET /health`.
- Configurar logs sin secretos.
- Configurar dominios CORS exactos.
- Usar variables por entorno, no archivos `.env` en produccion.

## Supabase

Validar:

- Redirect URL de produccion.
- Site URL de produccion.
- Plantillas de email.
- RLS y permisos segun tabla.
- Migraciones aplicadas.
- Service role restringido a backend.

### Password recovery TokenHash

La plantilla de reset debe ser exactamente:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

El orden de activacion es: configurar `RECOVERY_FLOW_SECRET`, desplegar el frontend,
probar `/auth/confirm`, actualizar la plantilla y solicitar un enlace nuevo. El
`GET` solo cifra el TokenHash en una cookie temporal y redirige a una URL limpia;
`verifyOtp` se ejecuta únicamente después del `POST` del usuario.

## Resend

Validar:

- Dominio verificado.
- Remitente autorizado.
- API key en backend o Supabase Auth segun configuracion final.
- Entrega de emails de reset/verificacion.

## Turnstile

Validar:

- Site key en frontend.
- Secret key en backend.
- Dominios autorizados: local, staging y produccion segun necesidad.
- Registro, login y reset password bloquean tokens invalidos.

## Checklist de despliegue

- `npm run build` en raiz.
- `npm run build` en `backend`.
- Variables productivas completas.
- Supabase redirects revisados.
- Resend probado.
- Turnstile probado.
- Healthcheck backend OK.
- Registro OK.
- Login OK.
- Reset password OK.
- Busqueda OK.
- Reporte OK.
- Admin OK.
