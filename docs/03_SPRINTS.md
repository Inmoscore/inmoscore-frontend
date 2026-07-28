# InmoScore - Sprints

## Registro de sprints

| Sprint | Nombre | Estado | Resultado |
| --- | --- | --- | --- |
| 1 | Search Audit | Completado | Se incorporo auditoria de busquedas, control de creditos y trazabilidad del uso de consultas. |
| 2 | Legal Reporting Audit | Completado | Se fortalecieron reportes con evidencia, revision, notificacion y trazabilidad legal. |
| 3A | Authentication Audit | Completado | Se auditaron flujos de registro, login, verificacion, reset y eventos de autenticacion. |
| 3B | Authentication Hardening | Casi cerrado | Turnstile y endurecimiento de auth implementados; pendiente validacion final de reset password en produccion. |
| 4 | Deploy Production | Siguiente | Preparar y ejecutar despliegue productivo controlado. |

## Sprint 1: Search Audit

Estado: completado.

Entregables:

- Logs de busqueda.
- Auditoria de consultas.
- Consumo controlado de creditos.
- Enfoque idempotente para evitar doble descuento.

## Sprint 2: Legal Reporting Audit

Estado: completado.

Entregables:

- Reportes con trazabilidad legal.
- Evidencia asociada a reportes.
- Revision y estados administrativos.
- Notificaciones y derecho de contradiccion.
- Logs de auditoria legal.

## Sprint 3A: Authentication Audit

Estado: completado.

Entregables:

- Auditoria de registro, login, reset y cambios de password.
- Eventos de seguridad para autenticacion.
- Verificacion de exposicion de errores y trazas.

## Sprint 3B: Authentication Hardening

Estado: casi cerrado.

Entregables:

- Turnstile obligatorio en registro.
- Turnstile obligatorio en login.
- Turnstile obligatorio en reset password.
- Resend como proveedor oficial de correo transaccional.
- Auditoria de exito de reset password.

Pendiente:

- Validacion final del reset password en produccion.

## Sprint 4: Deploy Production

Estado: siguiente.

Objetivo:

- Llevar InmoScore a produccion con frontend, backend, Supabase, Resend, Turnstile y variables configuradas.

Checklist inicial:

- Build frontend.
- Build backend.
- Variables de entorno productivas.
- Redirects de Supabase.
- Dominios autorizados Turnstile.
- Dominio/remitente Resend.
- Healthcheck backend.
- Pruebas funcionales de auth, busqueda, reportes y admin.
