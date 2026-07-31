# InmoScore - Changelog

## 2026-07-31

### Cierre productivo de BUG-003 y TASK-003

- BUG-003 pasa de REVIEW a DONE con validacion productiva de sesion restringida, bloqueo
  `403 EMAIL_VERIFICATION_REQUIRED`, confirmacion y nuevo login con alcance `full`.
- TASK-003 pasa de BLOCKED a DONE: Railway queda confirmado como backend productivo y
  `GET /health` responde `200`.
- El incidente `500` de `POST /api/billing/create-wompi-checkout` queda resuelto mediante
  configuracion de las cuatro variables Wompi requeridas en Railway y redespliegue del
  servicio, sin cambios de codigo.
- El checkout controlado responde `200`, genera una referencia unica, registra una sola
  fila `created` y permite cargar el widget.
- No se autoriza pago, no se capturan fondos y no se activa el plan.
- La fila de checkout y la cuenta QA se eliminan al finalizar.
- SPR-004 permanece `IN_PROGRESS`; no se cierran los demas criterios del sprint.

## 2026-07-28

### Creacion de SPR-005 Production Readiness

- Se crea `ies/SPRINTS/SPR-005_PRODUCTION_READINESS.md` en estado REVIEW.
- El responsable del sprint es CTO.
- El sprint se divide en cinco frentes: infraestructura, monetizacion, seguridad, operacion y Go Live.
- Se incorpora un checklist de salida para registro, login, recovery, busqueda, reportes, pagos, planes, admin, correo, infraestructura, QA y rollback.
- SPR-005 depende del cierre o transferencia formal de bloqueantes de SPR-004.
- No se cambian estados de Features ni se mueve el Product Backlog.

### Cierre documental de password recovery

- FEAT-003 y STORY-001 pasan a DONE con la evidencia funcional productiva existente.
- Se acepta `password.reset.success` como evidencia persistida del criterio actual de auditoria.
- Se crea EPIC-010 Authentication Audit Refactor como deuda independiente y no bloqueante.
- EPIC-010 concentra normalizacion de taxonomia, correlacion completa, revision de PII y fortalecimiento de persistencia.
- El sprint SPR-004 permanece IN_PROGRESS.
- La documentacion de API se alinea con `/api/auth/password-reset/complete`.

## 2026-07-24

### Password recovery validado en produccion

- Flujo TokenHash validado de extremo a extremo con `verifyOtp`, recovery grant y sincronizacion backend.
- Password nueva aceptada y password anterior rechazada en login.
- Enlace de recovery confirmado como no reutilizable.
- Redirect de servidor a `/login?password_reset=success` y mensaje de exito validados.
- Retiradas las razones publicas temporales y los logs `RECOVERY_CONFIRM_*`/`RESET_PASSWORD_STAGE`.
- Los fallos vuelven a exponer unicamente `/reset-password?error=invalid_link`.
- Se mantienen la validacion de Origin detras del proxy de Vercel, cookies, rate limit y auditoria permanente.

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

### Password recovery hardening (implementacion local)

- Migracion a TokenHash y `verifyOtp` para recovery.
- Intersticial `/auth/confirm` con cookie temporal cifrada y POST explicito.
- Autorizacion firmada efimera ligada a usuario y `session_id` de Supabase.
- Sin migraciones ni cambios de datos productivos.
- La validacion productiva se completo el 2026-07-24.
