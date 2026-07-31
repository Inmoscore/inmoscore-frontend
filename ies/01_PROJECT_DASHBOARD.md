# InmoScore Project Dashboard

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-28
**Responsable:** InmoScore Engineering Team
**Estado del documento:** Active

## Indice

1. Uso del dashboard
2. Estado general
3. Health Score
4. Progreso
5. Calidad tecnica
6. Seguridad
7. Despliegue
8. Sprint actual
9. Riesgos
10. Bloqueantes
11. Proxima release
12. Registro de actualizacion

## 1. Uso del dashboard

Este archivo es el tablero operativo del InmoScore Engineering System. Debe actualizarse al iniciar sprint, al cerrar sprint, antes de una release y cuando aparezcan bloqueantes o riesgos relevantes.

No se deben inventar metricas. Cuando un dato no este medido, usar `TBD`, `No medido` o `Pendiente de validacion`.

Estados, prioridades, tipos e IDs oficiales se definen en `ies/STANDARDS.md`.

## 2. Estado general

| Campo | Valor |
| --- | --- |
| Estado del proyecto | Preproduccion avanzada |
| Version del producto | TBD |
| Version del IES | v1.0 |
| Sprint actual | SPR-004 |
| Proximo sprint | SPR-005 - Production Readiness |
| Proxima release | REL-001 |
| Responsable operativo | InmoScore Engineering Team |
| Ultima revision | 2026-07-24 |

## 3. Health Score

| Dimension | Score | Estado | Evidencia / nota |
| --- | --- | --- | --- |
| Health Score global | TBD | TBD | Pendiente definir formula de medicion. |
| Product Readiness | TBD | TBD | Pendiente checklist de release. |
| Engineering Readiness | Recovery productivo cerrado | REVIEW | FEAT-003 y STORY-001 aceptados con evidencia funcional productiva y auditoria persistida; otros criterios de release permanecen pendientes. |
| Operational Readiness | TBD | TBD | Pendiente despliegue y monitoreo beta. |

## 4. Progreso

| Indicador | Valor | Estado | Nota |
| --- | --- | --- | --- |
| Project Progress | TBD | TBD | No completar sin criterio medible. |
| Sprint Progress | TBD | TBD | Actualizar durante el sprint activo. |
| Roadmap Progress | TBD | TBD | Actualizar al cerrar releases. |
| Release Progress | TBD | TBD | Asociado a REL-001. |

## 5. Calidad tecnica

| Indicador | Valor | Estado | Nota |
| --- | --- | --- | --- |
| Technical Debt | TBD | TBD | Registrar items como TECH_DEBT con ID global. |
| Open Bugs | TBD | TBD | Contar BUG-* abiertos. |
| Critical Bugs | TBD | TBD | Contar BUG-* con prioridad CRITICAL. |
| Coverage | No medido | TBD | Definir herramienta y baseline antes de reportar porcentaje. |
| Performance | No medido | TBD | Definir metrica: Web Vitals, API latency o carga. |
| Documentation | En progreso | IN_PROGRESS | IES v1.0 en formalizacion. |

## 6. Seguridad

| Indicador | Valor | Estado | Nota |
| --- | --- | --- | --- |
| Security | Recovery productivo validado | IN_PROGRESS | TokenHash, enlace de un solo uso, sincronizacion y cierre de sesion validados; otros controles de release siguen en revision. |
| Secrets Exposure | TBD | TBD | Auditar variables y logs antes de release. |
| Auth Hardening | Reset password funcional cerrado | REVIEW | FEAT-003 y STORY-001 estan DONE; el cierre global de auth mantiene criterios no relacionados pendientes. |
| Turnstile | Implementado pendiente validacion productiva completa | REVIEW | El recovery productivo fue exitoso; registro y demas escenarios siguen pendientes de evidencia. |
| Auditability | Recovery auditado con taxonomia heredada | REVIEW | La evidencia `password.reset.success` satisface el cierre actual; EPIC-010 concentra el refactor no bloqueante de auditoria. |

## 7. Despliegue

| Indicador | Valor | Estado | Nota |
| --- | --- | --- | --- |
| Deploy | Preparacion productiva | READY | Asociado a SPR-004. |
| Frontend Deploy | TBD | READY | Vercel. |
| Backend Deploy | Railway productivo validado | DONE | Build exitoso y `GET /health` con respuesta `200` el 2026-07-31. |
| Supabase Redirects | Configuracion productiva reportada | REVIEW | Site URL y redirects fueron confirmados; falta validar el flujo desplegado. |
| Resend | Pendiente validacion productiva | READY | Validar remitente de inmoscore.com. |

## 8. Sprint actual

| Campo | Valor |
| --- | --- |
| ID | SPR-004 |
| Nombre | Deploy Production Foundation |
| Estado | IN_PROGRESS |
| Objetivo | Preparar base productiva: Vercel Production, backend productivo, API URL, Supabase Auth redirects, Turnstile, Resend y pruebas criticas. |
| Bloqueante principal | Sin bloqueante activo de hosting; permanecen criterios funcionales y operativos del sprint. |
| Definition of Done | Variables productivas revisadas, backend confirmado o reemplazo decidido, auth y flujos criticos validados, auditorias revisadas y logs temporales limpios. |

### Sprint planificado

| Campo | Valor |
| --- | --- |
| ID | SPR-005 |
| Nombre | Production Readiness |
| Estado | REVIEW |
| Responsable | CTO |
| Objetivo | Cerrar infraestructura, monetizacion, seguridad, operacion y puertas de Go Live antes de aceptar clientes publicos. |
| Condicion de entrada | SPR-004 cierra sus criterios o documenta formalmente los bloqueantes transferidos. |
| Artefacto | `ies/SPRINTS/SPR-005_PRODUCTION_READINESS.md` |

## 9. Riesgos

| ID | Titulo | Prioridad | Estado | Mitigacion | Responsable |
| --- | --- | --- | --- | --- | --- |
| RISK-001 | Reset password falla en produccion por redirects o sincronizacion | CRITICAL | DONE | Mitigado y validado en produccion: password nueva funciona, anterior falla y enlace no se reutiliza. | InmoScore Engineering Team |
| RISK-002 | Exposicion accidental de secretos | CRITICAL | REVIEW | Auditar variables frontend/backend y logs. | InmoScore Engineering Team |
| RISK-003 | Doble consumo de creditos | HIGH | REVIEW | Mantener idempotencia y auditoria de busqueda. | InmoScore Engineering Team |
| RISK-004 | Reportes sin trazabilidad legal suficiente | HIGH | REVIEW | Conservar evidencia, revision, estado y logs. | InmoScore Engineering Team |
| RISK-005 | Backend Railway con trial expirado bloquea despliegue | CRITICAL | DONE | Railway restaurado y validado con build exitoso y healthcheck productivo. | InmoScore Engineering Team |

## 10. Bloqueantes

| ID | Bloqueante | Prioridad | Estado | Dependencia | Accion siguiente |
| --- | --- | --- | --- | --- | --- |
| TASK-001 | Validar reset password en produccion | CRITICAL | DONE | Supabase, backend y dominio productivo | Evidencia productiva completada el 2026-07-24. |
| TASK-002 | Auditar variables productivas | HIGH | READY | Vercel, backend host, Supabase | Revisar variables publicas y privadas. |
| TASK-003 | Confirmar hosting backend productivo | CRITICAL | DONE | Railway | Servicio desplegado; `GET /health` responde `200`. |

## 11. Proxima release

| Campo | Valor |
| --- | --- |
| ID | REL-001 |
| Nombre | Production Beta |
| Estado | BACKLOG |
| Sprint objetivo | SPR-004 |
| Criterio de entrada | Sprint SPR-004 listo y bloqueantes productivos identificados. |
| Criterio de salida | Frontend/backend desplegados, healthcheck OK, flujos criticos validados. |

## 12. Registro de actualizacion

| Fecha | Cambio | Responsable |
| --- | --- | --- |
| 2026-07-10 | Estandarizacion del dashboard con metricas editables e IDs globales. | InmoScore Engineering Team |
| 2026-07-10 | Actualizacion de sprint actual a SPR-004 Deploy Production Foundation y registro de bloqueante Railway trial expirado. | InmoScore Engineering Team |
| 2026-07-22 | Correccion local de reset password implementada; 19 pruebas, builds frontend/backend y lint dirigido exitosos. Validacion productiva permanece bloqueada. | InmoScore Engineering Team |
| 2026-07-24 | Reset password validado en produccion: credencial nueva aceptada, anterior rechazada, enlace de un solo uso y redirect al login confirmados; RISK-001 y TASK-001 cerrados. | InmoScore Engineering Team |
| 2026-07-28 | FEAT-003 y STORY-001 cerrados con evidencia persistida `password.reset.success`; EPIC-010 registra el refactor independiente de auditoria. El sprint permanece IN_PROGRESS. | InmoScore Engineering Team |
| 2026-07-28 | SPR-005 Production Readiness creado en REVIEW con cinco frentes: infraestructura, monetizacion, seguridad, operacion y Go Live. SPR-004 permanece IN_PROGRESS. | InmoScore Engineering Team |
| 2026-07-31 | Railway, `/health`, sesion restringida y checkout Wompi validados en produccion. BUG-003 y TASK-003 pasan a DONE; el `500` de checkout queda resuelto mediante configuracion de variables Wompi. SPR-004 permanece IN_PROGRESS. | InmoScore Engineering Team |
