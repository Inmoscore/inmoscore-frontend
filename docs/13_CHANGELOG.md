# InmoScore - Changelog

## 2026-07-09

### Documentacion

- Creada carpeta `docs/` como fuente oficial de verdad del proyecto.
- Agregado master context del estado actual.
- Agregado project charter.
- Agregado roadmap por fases.
- Agregado registro de sprints.
- Agregada arquitectura de alto nivel.
- Agregado decision log con decisiones clave.
- Agregado engineering handbook.
- Agregada documentacion de seguridad.
- Agregada documentacion de base de datos y migraciones.
- Agregada documentacion de API.
- Agregada documentacion de despliegue.
- Agregado checklist de testing/QA.
- Agregado registro de riesgos.
- Agregado changelog inicial.

### Estado de producto documentado

- Sprint 1 Search Audit: completado.
- Sprint 2 Legal Reporting Audit: completado.
- Sprint 3A Authentication Audit: completado.
- Sprint 3B Authentication Hardening: casi cerrado.
- Sprint 4 Deploy Production: siguiente.

### Decisiones registradas

- Resend reemplaza SMTP GoDaddy.
- Turnstile obligatorio en auth.
- Auditoria best-effort.
- Creditos con idempotencia.
- Reportes con trazabilidad legal.

## 2026-07-23

### Password recovery hardening (implementacion local; pendiente validacion productiva)

- Migracion a TokenHash y `verifyOtp` para recovery.
- Intersticial `/auth/confirm` con cookie temporal cifrada y POST explicito.
- Autorizacion firmada efimera ligada a usuario y `session_id` de Supabase.
- Sin migraciones ni cambios de datos productivos.
- No marcar IES como DONE hasta completar la prueba productiva.
