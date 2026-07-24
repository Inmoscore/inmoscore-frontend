# InmoScore - API

## Principios de diseno

- API backend Express como frontera de seguridad.
- Respuestas consistentes y sin exposicion de secretos.
- Validacion de entrada en todos los endpoints sensibles.
- Autenticacion obligatoria salvo endpoints publicos explicitamente definidos.
- Idempotencia para creditos, pagos y webhooks.
- Auditoria en acciones sensibles.

## Health

- `GET /health`

## Autenticacion y cuenta

- `GET/POST /auth/confirm` (frontend, confirmacion publica de recovery TokenHash)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/resend-verification`
- `POST /api/auth/password-reset`
- `POST /api/auth/password-reset/success-audit`
- `POST /api/auth/change-password`
- `GET /api/account/status`

Reglas:

- Turnstile requerido en registro, login y reset password.
- `/auth/confirm` solo acepta `token_hash`, `type` y `next`; recovery exige `type=recovery`.
- El GET no consume OTP: usa cookie HttpOnly temporal y redireccion 303 sin query string.
- La sesion de reset requiere una autorizacion firmada efimera, no solo una sesion normal.
- No filtrar existencia de usuarios de forma insegura.
- Registrar auditoria de eventos relevantes.

## Busqueda e historial

- `GET /api/tenants/search`
- `GET /api/tenants/:cedula`
- `POST /api/rental-histories`

Reglas:

- Requiere autenticacion.
- Validar permisos, creditos y organizacion.
- Descontar creditos con idempotencia.
- Auditar busquedas.

## Reportes

- `POST /api/reports`

Reglas:

- Requiere autenticacion.
- Conservar evidencia, trazabilidad y estado de revision.
- No permitir reportes sin datos minimos legales.

## Documentos seguros

- `POST /api/documents/upload-intent`
- `GET /api/documents/:id/access`
- `POST /api/documents/:id/confirm-upload`
- `GET /api/documents/:id/signed-read`

Reglas:

- Requiere autenticacion.
- Validar propiedad o permiso.
- Registrar accesos.
- Usar URLs firmadas y expirables.

## Legal y cumplimiento

- `GET /api/legal/documents/active`
- `POST /api/legal/acceptances`
- `POST /api/legal/data-requests`
- `GET /api/legal/data-requests/my`
- `POST /api/legal/disputes`
- `GET /api/legal/disputes/my`
- `POST /api/legal/human-review-requests`
- `GET /api/legal/human-review-requests/my`
- `POST /api/legal/identity-verification/request`
- `GET /api/legal/identity-verification/my`

Reglas:

- Flujos publicos deben validar identidad minima y rate limit.
- Flujos autenticados deben asociarse al usuario.
- Mantener trazabilidad para solicitudes, disputas y revision humana.

## Billing y webhooks

- `POST /api/stripe/webhook`
- `POST /api/wompi/webhook`
- `USE /api/billing`
- `POST /api/upgrade-events`

Reglas:

- Webhooks deben verificar firma cuando el proveedor lo soporte.
- Operaciones de pago deben ser idempotentes.
- Reconciliacion debe quedar auditable.

## Administracion

Endpoints principales:

- `/api/admin/mfa/*`
- `/api/admin/users`
- `/api/admin/users/:userId/plan`
- `/api/admin/plan-change-logs`
- `/api/admin/rental-histories`
- `/api/admin/wompi-payments`
- `/api/admin/metrics`
- `/api/admin/identity-verifications`
- `/api/admin/reports`
- `/api/admin/data-requests`
- `/api/admin/human-review-requests`
- `/api/admin/disputes`
- `/api/admin/data-inventory`
- `/api/admin/audit-logs`
- `/api/admin/report-actions`
- `/api/admin/legal-case-signals`

Reglas:

- Requiere autenticacion admin.
- Acciones sensibles deben generar auditoria admin.
- No devolver datos sensibles innecesarios.
- Cambios de estado deben ser trazables.
