# SPR-004 - Deploy Production Foundation

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-28
**Responsable:** InmoScore Engineering Team
**Estado:** IN_PROGRESS

## Indice

1. Objetivo
2. Fechas
3. Alcance comprometido
4. Historias incluidas
5. Dependencias
6. Fuera de alcance
7. Riesgos
8. Bloqueantes
9. Criterios de aceptacion
10. Plan de pruebas
11. Plan de rollback
12. Definition of Done
13. Cierre
14. Notas

## 1. Objetivo

Preparar la base productiva de InmoScore para una release beta controlada, dejando configurados y validados los fundamentos de despliegue: variables Production en Vercel, backend productivo o decision formal de reemplazo de Railway, API URL publica, redirects de Supabase Auth, dominios productivos de Turnstile, Resend con remitente de `inmoscore.com`, flujos funcionales criticos y auditorias principales.

## 2. Fechas

| Campo | Valor |
| --- | --- |
| Inicio | 2026-07-10 |
| Cierre objetivo | TBD |
| Cierre real | TBD |

## 3. Alcance comprometido

| ID | Tipo | Titulo | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| FEAT-033 | FEATURE | Despliegue frontend | CRITICAL | READY |
| FEAT-034 | FEATURE | Despliegue backend | CRITICAL | READY |
| FEAT-035 | FEATURE | Configuracion Supabase productiva | CRITICAL | READY |
| FEAT-036 | FEATURE | Validacion Resend productiva | HIGH | READY |
| FEAT-037 | FEATURE | Validacion Turnstile productiva | HIGH | READY |
| STORY-001 | STORY | Como usuario quiero recuperar mi password de forma segura | CRITICAL | DONE |
| STORY-002 | STORY | Como equipo de ingenieria quiero configurar variables Production en Vercel | CRITICAL | READY |
| STORY-003 | STORY | Como equipo de ingenieria quiero confirmar backend productivo o decidir reemplazo de Railway | CRITICAL | READY |
| STORY-004 | STORY | Como equipo de ingenieria quiero validar `NEXT_PUBLIC_API_URL` productiva | CRITICAL | READY |
| STORY-005 | STORY | Como equipo de ingenieria quiero configurar redirects productivos en Supabase Auth | CRITICAL | READY |
| STORY-006 | STORY | Como equipo de ingenieria quiero configurar dominios productivos de Turnstile | HIGH | READY |
| STORY-007 | STORY | Como equipo de ingenieria quiero validar Resend con remitente de `inmoscore.com` | HIGH | READY |
| STORY-008 | STORY | Como equipo de QA quiero probar registro, login, reset password, busqueda, reporte e historial | CRITICAL | READY |
| STORY-009 | STORY | Como equipo de auditoria quiero validar auditorias search, legal report y authentication | CRITICAL | READY |
| STORY-010 | STORY | Como equipo de ingenieria quiero revisar logs temporales antes del despliegue | HIGH | READY |
| BUG-003 | BUG | Cuentas con correo no confirmado reciben sesion completa y pueden ejecutar operaciones sensibles | HIGH | REVIEW |

## 4. Historias incluidas

| ID | Historia | Dependencias | Acceptance Criteria |
| --- | --- | --- | --- |
| STORY-001 | Recuperar password de forma segura | Supabase Auth, backend, redirects productivos | Sesion normal no habilita el formulario; hash y PKCE se validan; password nueva sincroniza Supabase Auth y `public.users`; no se reporta exito ante fallo parcial. |
| STORY-002 | Configurar variables Production en Vercel | Vercel, Supabase, backend URL, Turnstile site key | Variables productivas requeridas registradas; no hay secretos privados en variables publicas; valores sensibles no se documentan en texto plano. |
| STORY-003 | Confirmar backend productivo o decidir reemplazo de Railway | Railway o alternativa, healthcheck backend, CORS | Existe decision operativa: Railway restaurado/usable o alternativa seleccionada; `GET /health` queda como criterio de validacion. |
| STORY-004 | Validar `NEXT_PUBLIC_API_URL` productiva | Backend productivo, Vercel | URL apunta al backend productivo correcto; no apunta a localhost, preview accidental o entorno incorrecto. |
| STORY-005 | Configurar redirects productivos en Supabase Auth | Supabase Auth, dominio frontend productivo | Site URL y Redirect URLs productivos permiten registro, login y reset password. |
| STORY-006 | Configurar dominios productivos de Turnstile | Cloudflare Turnstile, dominio frontend productivo | Dominios productivos autorizados; registro, login y reset password pueden verificar token valido. |
| STORY-007 | Validar Resend con remitente de `inmoscore.com` | Resend, dominio/remitente, DNS si aplica | Remitente productivo validado; correo de autenticacion llega sin usar SMTP GoDaddy. |
| STORY-008 | Probar registro, login, reset password, busqueda, reporte e historial | FEAT-033, FEAT-034, FEAT-035, FEAT-036, FEAT-037 | Flujos criticos ejecutados en entorno productivo o production-like con resultado registrado. |
| STORY-009 | Validar auditorias search, legal report y authentication | Search audit, legal report audit, authentication audit | Eventos esperados aparecen en tablas/logs correspondientes sin exponer secretos. |
| STORY-010 | Revisar logs temporales antes del despliegue | Backend host, Vercel, Supabase | Logs temporales revisados; no hay secretos, tokens, passwords ni PII innecesaria. |

## 5. Dependencias

| ID | Dependencia | Tipo | Estado | Nota |
| --- | --- | --- | --- | --- |
| TASK-002 | Auditar variables productivas | TASK | READY | Necesario antes de validar frontend productivo. |
| TASK-003 | Confirmar hosting backend productivo | TASK | BLOCKED | Bloqueado por Railway trial expirado hasta restaurar servicio o decidir reemplazo. |
| TASK-006 | Configurar redirects Supabase Auth productivos | TASK | DONE | Redirect de recovery validado en el flujo productivo. |
| TASK-007 | Configurar dominios Turnstile productivos | TASK | READY | Requerido para auth productiva. |
| TASK-008 | Validar Resend con remitente `inmoscore.com` | TASK | READY | Requerido para correos de autenticacion. |

## 6. Fuera de alcance

- Cambios funcionales fuera del flujo de recuperacion de password autorizado.
- Refactorizaciones amplias de autenticacion.
- Ejecutar migraciones.
- Cambiar scoring.
- Implementar nuevas funcionalidades de producto.
- Crear nuevas integraciones de pago.
- Abrir produccion publica.

Excepcion de alcance autorizada el 2026-07-22: correccion minima de reset password en frontend/backend, pruebas automatizadas, builds y actualizacion documental basada en evidencia.

## 7. Riesgos

| ID | Riesgo | Prioridad | Estado | Mitigacion |
| --- | --- | --- | --- | --- |
| RISK-001 | Reset password falla en produccion por redirects o sincronizacion | CRITICAL | DONE | Mitigado mediante validacion productiva del cambio, sincronizacion, enlace de un solo uso y redirect final. |
| RISK-002 | Exposicion accidental de secretos | CRITICAL | REVIEW | Revisar variables Vercel/backend y logs temporales antes del despliegue. |
| RISK-005 | Backend Railway con trial expirado bloquea despliegue | CRITICAL | BLOCKED | Restaurar Railway o decidir reemplazo documentado antes de continuar. |
| RISK-006 | `NEXT_PUBLIC_API_URL` apunta a entorno incorrecto | CRITICAL | READY | Validar valor productivo antes de pruebas funcionales. |
| RISK-007 | Turnstile bloquea usuarios reales por dominio no autorizado | HIGH | READY | Configurar dominios productivos y probar tokens validos. |
| RISK-008 | Resend no entrega correos desde `inmoscore.com` | HIGH | READY | Validar dominio/remitente y entrega real. |

## 8. Bloqueantes

| ID | Bloqueante | Estado | Accion |
| --- | --- | --- | --- |
| TASK-003 | Backend Railway con trial expirado | BLOCKED | Restaurar Railway o decidir reemplazo productivo compatible con Express. |
| TASK-001 | Validar reset password en produccion | DONE | Evidencia productiva completada el 2026-07-24. |

## 9. Criterios de aceptacion

- FEAT-033 queda validada con variables Production en Vercel y `NEXT_PUBLIC_API_URL` correcta.
- FEAT-034 queda validada con backend productivo disponible o decision formal de reemplazo de Railway.
- FEAT-035 queda validada con redirects productivos de Supabase Auth.
- FEAT-036 queda validada con remitente de `inmoscore.com` en Resend.
- FEAT-037 queda validada con dominios productivos de Turnstile.
- STORY-008 queda completada con registro, login, reset password, busqueda, reporte e historial probados.
- STORY-009 queda completada con auditorias search, legal report y authentication verificadas.
- STORY-010 queda completada sin secretos ni PII innecesaria en logs temporales.
- Todos los bloqueantes `CRITICAL` del sprint quedan resueltos o documentados con decision formal.
- BUG-003 queda validado con sesion restringida, bloqueo backend directo, reenvio, recovery, renovacion de sesion y pago Wompi diferido.

## 10. Plan de pruebas

| ID | Prueba | Resultado esperado |
| --- | --- | --- |
| TASK-009 | Verificar variables Production en Vercel | Variables requeridas existen; secretos privados no estan expuestos como publicos. |
| TASK-010 | Verificar backend productivo | `GET /health` responde correctamente en host productivo elegido. |
| TASK-011 | Validar `NEXT_PUBLIC_API_URL` productiva | Frontend llama al backend productivo correcto. |
| TASK-012 | Probar registro | Registro funciona con Turnstile y auditoria. |
| TASK-013 | Probar login | Login funciona con Turnstile y sesion valida. |
| TASK-014 | Probar reset password | Email llega desde flujo productivo y cambio de password finaliza. |
| TASK-015 | Probar busqueda | Busqueda funciona y genera auditoria search. |
| TASK-016 | Probar reporte | Reporte se crea y genera auditoria legal report. |
| TASK-017 | Probar historial | Historial se crea o consulta segun flujo disponible. |
| TASK-018 | Revisar authentication audit | Eventos de auth esperados quedan registrados. |
| TASK-019 | Revisar logs temporales | No hay secretos, tokens, passwords ni PII innecesaria. |
| BUG-003 | Validar correo pendiente | Sesion restringida conserva solo allowlist exacta; operaciones sensibles fallan por backend; nuevo login habilita despues de sincronizar. |

### Evidencia local 2026-07-22

- 8 pruebas frontend exitosas: evento `PASSWORD_RECOVERY`, rechazo de sesion normal, hash implicito, tipo incorrecto, enlace implicito expirado/reutilizado, PKCE, code expirado/reutilizado y limpieza posterior de URL.
- 11 pruebas backend exitosas: contrato Zod estricto, descarte de cliente anonimo, token invalido, verificacion de password Supabase, fallo parcial, reintento, bcrypt nuevo/anterior y validacion productiva de `FRONTEND_URL`.
- Build Next.js 16.2.0 exitoso con `/reset-password` generado.
- Build TypeScript backend exitoso.
- Lint dirigido sobre los archivos nuevos y modificados del flujo exitoso.
- Lint global no aprobado: 178 problemas preexistentes, incluidos artefactos `backend/dist` y modulos no relacionados. No se registran como corregidos en este sprint.
- No se ejecutaron migraciones ni pruebas contra datos productivos.

### Evidencia productiva 2026-07-24

- La password nueva permite iniciar sesion y la password anterior es rechazada.
- El enlace de recovery no puede reutilizarse.
- El flujo redirige a `/login?password_reset=success`, muestra confirmacion y limpia el parametro sin recarga.
- Se retiraron razones publicas y logs temporales de diagnostico; los fallos vuelven a exponer unicamente `error=invalid_link`.
- La auditoria permanente del backend, el rate limit y los controles de TokenHash permanecen intactos.
- La base configurada contiene seis eventos persistidos `password.reset.success`; cuatro coinciden con la ventana de validacion del 2026-07-24 y no existen eventos `password_changed` en esa ventana.
- La evidencia persistida satisface los criterios actuales de FEAT-003 y STORY-001 sin exponer valores PII en este documento.
- La normalizacion futura de taxonomia, correlacion, PII y persistencia se traslada a EPIC-010 Authentication Audit Refactor y no bloquea este cierre.

## 11. Plan de rollback

| Escenario | Accion de rollback |
| --- | --- |
| Backend productivo falla | Revertir variable `NEXT_PUBLIC_API_URL` al entorno anterior valido o pausar release hasta backend estable. |
| Supabase redirects rompen auth | Restaurar redirects anteriores conocidos y bloquear release. |
| Turnstile bloquea auth productiva | Restaurar configuracion anterior o desactivar despliegue productivo hasta corregir dominios. |
| Resend no entrega correos | Pausar release y corregir dominio/remitente antes de retomar pruebas. |
| Logs exponen secretos | Retirar logs temporales, rotar secreto afectado si aplica y bloquear release hasta limpieza. |

## 12. Definition of Done

- Sprint `SPR-004` esta actualizado en dashboard como `READY` al inicio y pasa a `DONE` solo cuando todos los criterios se acepten.
- Variables Production en Vercel revisadas.
- Backend productivo confirmado o reemplazo de Railway decidido.
- `NEXT_PUBLIC_API_URL` productiva validada.
- Supabase Auth redirects productivos configurados.
- Dominios productivos de Turnstile configurados.
- Resend validado con remitente de `inmoscore.com`.
- Registro, login, reset password, busqueda, reporte e historial probados.
- Auditorias search, legal report y authentication validadas.
- Logs temporales revisados antes del despliegue.
- Bloqueantes `CRITICAL` resueltos o documentados con decision formal.

## 13. Cierre

| Campo | Valor |
| --- | --- |
| Resultado | TBD |
| Items DONE | TBD |
| Items pendientes | TBD |
| Bugs abiertos | TBD |
| Riesgos nuevos | TBD |

## 14. Notas

- No registrar valores reales de secretos en este documento.
- La correccion funcional de reset password fue autorizada explicitamente el 2026-07-22.
- TASK-001, BUG-001 y RISK-001 quedaron cerrados con evidencia productiva el 2026-07-24.
- FEAT-003 y STORY-001 quedaron cerrados con evidencia funcional y auditoria persistida el 2026-07-28.
- EPIC-010 concentra la deuda independiente de refactor de auditoria de autenticacion.
- El sprint completo permanece `IN_PROGRESS` porque los demas criterios de despliegue y QA no forman parte de esta validacion.
