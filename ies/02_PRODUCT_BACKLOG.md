# InmoScore Product Backlog

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-28
**Responsable:** InmoScore Engineering Team
**Estado del documento:** Active

## Indice

1. Proposito
2. Reglas del backlog
3. Epicas
4. Features
5. Stories y tasks iniciales
6. Bugs
7. Tech debt
8. Criterios generales de aceptacion
9. Registro de actualizacion

## 1. Proposito

Este archivo es el backlog profesional del proyecto InmoScore. Organiza epicas, features, stories, tasks, bugs y deuda tecnica usando los estados, prioridades, tipos e IDs oficiales definidos en `ies/STANDARDS.md`.

## 2. Reglas del backlog

- Todo item debe tener ID global.
- No usar nombres libres como identificador.
- Todo feature debe estar asociado a una epica.
- Todo item listo para sprint debe tener acceptance criteria.
- Todo bug critico debe aparecer tambien en el dashboard.
- Todo item sin informacion suficiente debe permanecer en `BACKLOG`.

## 3. Epicas

| ID | Titulo | Estado | Prioridad | Responsable | Notas |
| --- | --- | --- | --- | --- | --- |
| EPIC-001 | Autenticacion segura | REVIEW | CRITICAL | InmoScore Engineering Team | Auditoria completada en SPR-003; reset password productivo queda incluido en SPR-004. |
| EPIC-002 | Busqueda y scoring | DONE | CRITICAL | InmoScore Engineering Team | Busqueda, creditos, auditoria y scoring base implementados. |
| EPIC-003 | Reportes legales | DONE | CRITICAL | InmoScore Engineering Team | Reportes con evidencia, revision y trazabilidad legal. |
| EPIC-004 | Gestion legal y titulares | REVIEW | CRITICAL | InmoScore Engineering Team | Solicitudes, disputas, revision humana e identidad. |
| EPIC-005 | Administracion operativa | IN_PROGRESS | HIGH | InmoScore Engineering Team | Usuarios, planes, reportes, pagos, metricas, inventario y auditoria. |
| EPIC-006 | Documentos seguros | REVIEW | HIGH | InmoScore Engineering Team | Carga, confirmacion, acceso firmado y logs. |
| EPIC-007 | Billing y monetizacion | IN_PROGRESS | HIGH | InmoScore Engineering Team | Planes, Wompi, Stripe, webhooks y upgrades. |
| EPIC-008 | Despliegue productivo | READY | CRITICAL | InmoScore Engineering Team | SPR-004 Deploy Production Foundation. |
| EPIC-009 | Enterprise SaaS | BACKLOG | MEDIUM | InmoScore Engineering Team | Multi-tenant avanzado, roles y auditoria enterprise. |
| EPIC-010 | Authentication Audit Refactor | BACKLOG | HIGH | InmoScore Engineering Team | Refactor independiente y no bloqueante para normalizar taxonomia, correlacion, PII y persistencia de auditoria. |

## 4. Features

### EPIC-001 Autenticacion segura

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-001 | Registro seguro | DONE | CRITICAL | EPIC-001 | Supabase Auth, Turnstile, backend auth | InmoScore Engineering Team | SPR-004 | Registro valida datos, verifica Turnstile y registra auditoria. | Funcionalidad actual. |
| FEAT-002 | Login seguro | DONE | CRITICAL | EPIC-001 | Supabase/Auth backend, JWT, Turnstile | InmoScore Engineering Team | SPR-004 | Login exitoso emite sesion valida; Turnstile invalido bloquea; errores no filtran secretos. | Funcionalidad actual. |
| FEAT-003 | Reset password productivo | DONE | CRITICAL | EPIC-001 | Supabase redirects, Resend, Turnstile, dominio productivo | InmoScore Engineering Team | SPR-004 | Email llega, redirect abre flujo correcto, password cambia en Supabase y login local, password anterior falla y evento queda auditado. | Criterios aceptados con validacion productiva y evidencia persistida `password.reset.success`; el refactor de auditoria continua en EPIC-010. |
| FEAT-004 | Auditoria de autenticacion | DONE | HIGH | EPIC-001 | authentication_audit_logs, security_events | InmoScore Engineering Team | SPR-003 | Registro, login, reset y cambios relevantes dejan evento auditable. | Funcionalidad actual. |

### EPIC-002 Busqueda y scoring

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-005 | Busqueda de inquilinos | DONE | CRITICAL | EPIC-002 | Auth, tenants, backend API | InmoScore Engineering Team | SPR-001 | Usuario autenticado consulta inquilino con permisos correctos. | Funcionalidad actual. |
| FEAT-006 | Creditos de busqueda idempotentes | DONE | CRITICAL | EPIC-002 | user_search_credits, search audit | InmoScore Engineering Team | SPR-001 | Reintentos no descuentan doble credito; consumo queda trazado. | Funcionalidad actual. |
| FEAT-007 | Auditoria de busqueda | DONE | HIGH | EPIC-002 | search_logs, search_audit_logs | InmoScore Engineering Team | SPR-001 | Cada busqueda relevante genera evento auditable. | Funcionalidad actual. |
| FEAT-008 | Motor de scoring | DONE | CRITICAL | EPIC-002 | Modulo scoring backend | InmoScore Engineering Team | SPR-001 | Score se calcula de forma consistente sin mezclar logica de rutas. | No tocar sin pruebas. |

### EPIC-003 Reportes legales

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-009 | Creacion de reportes | DONE | CRITICAL | EPIC-003 | Auth, reports | InmoScore Engineering Team | SPR-002 | Reporte se crea con datos minimos, usuario asociado y estado inicial. | Funcionalidad actual. |
| FEAT-010 | Evidencia de reportes | DONE | CRITICAL | EPIC-003 | report_evidence_files | InmoScore Engineering Team | SPR-002 | Evidencia queda vinculada al reporte y trazable. | Funcionalidad actual. |
| FEAT-011 | Revision administrativa de reportes | DONE | HIGH | EPIC-003 | Admin, report_review_logs | InmoScore Engineering Team | SPR-002 | Admin puede revisar, cambiar estado y dejar log. | Funcionalidad actual. |
| FEAT-012 | Notificacion y contradiccion | DONE | HIGH | EPIC-003 | report_subject_notices | InmoScore Engineering Team | SPR-002 | Notificacion queda registrada y disponible para trazabilidad. | Funcionalidad actual. |
| FEAT-013 | Auditoria legal de reportes | DONE | CRITICAL | EPIC-003 | legal_report_audit_logs | InmoScore Engineering Team | SPR-002 | Eventos legales relevantes quedan auditados. | Funcionalidad actual. |

### EPIC-004 Gestion legal y titulares

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-014 | Documentos legales activos | DONE | HIGH | EPIC-004 | legal_document_versions | InmoScore Engineering Team | SPR-002 | Frontend puede consultar documentos legales activos. | Funcionalidad actual. |
| FEAT-015 | Aceptaciones legales | DONE | HIGH | EPIC-004 | user_legal_acceptances | InmoScore Engineering Team | SPR-002 | Aceptacion queda vinculada a usuario y version legal. | Funcionalidad actual. |
| FEAT-016 | Solicitudes de datos | DONE | CRITICAL | EPIC-004 | data_subject_requests | InmoScore Engineering Team | SPR-002 | Titular puede crear y consultar su solicitud. | Funcionalidad actual. |
| FEAT-017 | Disputas | DONE | CRITICAL | EPIC-004 | data_disputes | InmoScore Engineering Team | SPR-002 | Titular puede registrar disputa trazable. | Funcionalidad actual. |
| FEAT-018 | Revision humana | DONE | HIGH | EPIC-004 | human_review_requests | InmoScore Engineering Team | SPR-002 | Solicitud puede crearse y revisarse por admin. | Funcionalidad actual. |
| FEAT-019 | Verificacion de identidad | REVIEW | HIGH | EPIC-004 | identity_verification_documents, secure docs | InmoScore Engineering Team | SPR-004 | Usuario solicita verificacion; admin revisa documentos; acceso queda auditado. | Validar flujo completo. |

### EPIC-005 Administracion operativa

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-020 | Gestion de usuarios | IN_PROGRESS | HIGH | EPIC-005 | Auth admin, users | InmoScore Engineering Team | SPR-004 | Admin lista usuarios y gestiona plan con auditoria. | Funcionalidad actual parcial. |
| FEAT-021 | MFA admin | IN_PROGRESS | CRITICAL | EPIC-005 | admin MFA | InmoScore Engineering Team | SPR-004 | Admin configura, verifica, desafia y desactiva MFA de forma segura. | Funcionalidad actual parcial. |
| FEAT-022 | Gestion admin de reportes | IN_PROGRESS | CRITICAL | EPIC-005 | reports, admin audit | InmoScore Engineering Team | SPR-004 | Admin lista, revisa y acciona reportes con trazabilidad. | Funcionalidad actual parcial. |
| FEAT-023 | Auditoria admin | IN_PROGRESS | CRITICAL | EPIC-005 | admin_audit_logs | InmoScore Engineering Team | SPR-004 | Acciones sensibles admin generan evento auditable. | Funcionalidad actual parcial. |
| FEAT-024 | Metricas operativas | IN_PROGRESS | MEDIUM | EPIC-005 | Backend metrics | InmoScore Engineering Team | SPR-004 | Admin visualiza metricas clave sin exponer PII innecesaria. | Funcionalidad actual parcial. |

### EPIC-006 Documentos seguros

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-025 | Intento de carga segura | DONE | HIGH | EPIC-006 | secure_documents | InmoScore Engineering Team | SPR-004 | Backend crea upload intent autorizado. | Funcionalidad actual. |
| FEAT-026 | Confirmacion de carga | DONE | HIGH | EPIC-006 | Storage, secure_documents | InmoScore Engineering Team | SPR-004 | Documento queda confirmado y asociado. | Funcionalidad actual. |
| FEAT-027 | Lectura firmada | DONE | HIGH | EPIC-006 | Signed URLs, permissions | InmoScore Engineering Team | SPR-004 | URL firmada requiere permiso y expira. | Funcionalidad actual. |
| FEAT-028 | Auditoria de acceso documental | DONE | HIGH | EPIC-006 | document_access_logs | InmoScore Engineering Team | SPR-004 | Accesos sensibles quedan registrados. | Funcionalidad actual. |

### EPIC-007 Billing y monetizacion

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-029 | Planes de usuario | IN_PROGRESS | HIGH | EPIC-007 | users, plan_change_logs | InmoScore Engineering Team | SPR-004 | Plan visible, actualizable y auditable. | Funcionalidad actual parcial. |
| FEAT-030 | Pagos Wompi | IN_PROGRESS | HIGH | EPIC-007 | wompi_payments | InmoScore Engineering Team | SPR-004 | Pago se registra y puede verificarse/reconciliarse. | Funcionalidad actual parcial. |
| FEAT-031 | Webhooks idempotentes | REVIEW | CRITICAL | EPIC-007 | Wompi, Stripe, payment IDs | InmoScore Engineering Team | SPR-005 | Evento duplicado no duplica beneficios ni creditos. | Revalidar en beta. |
| FEAT-032 | Upgrade events | DONE | MEDIUM | EPIC-007 | upgrade_events | InmoScore Engineering Team | SPR-004 | Evento de upgrade queda registrado. | Funcionalidad actual. |

### EPIC-008 Despliegue productivo

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FEAT-033 | Despliegue frontend | READY | CRITICAL | EPIC-008 | Vercel, variables frontend, `NEXT_PUBLIC_API_URL` | InmoScore Engineering Team | SPR-004 | Frontend productivo carga con variables correctas y API URL productiva validada. | Incluye configurar variables Production en Vercel. |
| FEAT-034 | Despliegue backend | READY | CRITICAL | EPIC-008 | Railway o alternativa, variables backend | InmoScore Engineering Team | SPR-004 | Backend productivo responde healthcheck o existe decision formal de reemplazo de Railway. | Bloqueado operativamente por trial Railway expirado hasta resolver hosting. |
| FEAT-035 | Configuracion Supabase productiva | READY | CRITICAL | EPIC-008 | Supabase redirects, dominio productivo | InmoScore Engineering Team | SPR-004 | Auth redirects productivos validados para registro, login y reset password. | Requerido para STORY-001. |
| FEAT-036 | Validacion Resend productiva | READY | HIGH | EPIC-008 | Resend domain/sender `inmoscore.com` | InmoScore Engineering Team | SPR-004 | Correos de auth llegan correctamente desde remitente de `inmoscore.com`. | Reemplaza SMTP GoDaddy. |
| FEAT-037 | Validacion Turnstile productiva | READY | HIGH | EPIC-008 | Turnstile domain keys, dominio productivo | InmoScore Engineering Team | SPR-004 | Registro, login y reset verifican tokens validos en dominio productivo. | Dominios productivos requeridos. |

## 5. Stories y tasks iniciales

| ID | Tipo | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STORY-001 | STORY | Como usuario quiero recuperar mi password de forma segura | DONE | CRITICAL | EPIC-001 | FEAT-003, FEAT-035, FEAT-036, FEAT-037 | InmoScore Engineering Team | SPR-004 | Respuesta generica, email llega, link funciona, ambos almacenes de password quedan sincronizados y auditoria registra exito. | Criterios aceptados con evidencia funcional productiva y eventos `password.reset.success` persistidos durante la ventana de validacion. |
| STORY-002 | STORY | Como equipo de ingenieria quiero configurar variables Production en Vercel | READY | CRITICAL | EPIC-008 | FEAT-033 | InmoScore Engineering Team | SPR-004 | Variables requeridas existen y no hay secretos privados en variables publicas. | Incluido en SPR-004. |
| STORY-003 | STORY | Como equipo de ingenieria quiero confirmar backend productivo o decidir reemplazo de Railway | READY | CRITICAL | EPIC-008 | FEAT-034 | InmoScore Engineering Team | SPR-004 | Railway queda restaurado/usable o reemplazo productivo queda decidido. | Railway trial expirado es bloqueante actual. |
| STORY-004 | STORY | Como equipo de ingenieria quiero validar `NEXT_PUBLIC_API_URL` productiva | READY | CRITICAL | EPIC-008 | FEAT-033, FEAT-034 | InmoScore Engineering Team | SPR-004 | URL apunta al backend productivo correcto. | No debe apuntar a localhost o preview accidental. |
| STORY-005 | STORY | Como equipo de ingenieria quiero configurar redirects productivos en Supabase Auth | READY | CRITICAL | EPIC-008 | FEAT-035 | InmoScore Engineering Team | SPR-004 | Site URL y Redirect URLs productivos permiten flujos de auth. | Requerido para reset password. |
| STORY-006 | STORY | Como equipo de ingenieria quiero configurar dominios productivos de Turnstile | READY | HIGH | EPIC-008 | FEAT-037 | InmoScore Engineering Team | SPR-004 | Dominios productivos autorizados y tokens validos verifican en auth. | Registro, login y reset password. |
| STORY-007 | STORY | Como equipo de ingenieria quiero validar Resend con remitente de `inmoscore.com` | READY | HIGH | EPIC-008 | FEAT-036 | InmoScore Engineering Team | SPR-004 | Correo transaccional llega desde remitente productivo validado. | No usar SMTP GoDaddy. |
| STORY-008 | STORY | Como equipo de QA quiero probar registro, login, reset password, busqueda, reporte e historial | READY | CRITICAL | EPIC-008 | FEAT-033, FEAT-034, FEAT-035, FEAT-036, FEAT-037 | InmoScore Engineering Team | SPR-004 | Flujos criticos probados y resultado registrado. | Sin ejecutar builds desde esta tarea documental. |
| STORY-009 | STORY | Como equipo de auditoria quiero validar auditorias search, legal report y authentication | READY | CRITICAL | EPIC-008 | FEAT-007, FEAT-013, FEAT-004 | InmoScore Engineering Team | SPR-004 | Eventos esperados aparecen en auditorias sin secretos. | Search, legal report y authentication. |
| STORY-010 | STORY | Como equipo de ingenieria quiero revisar logs temporales antes del despliegue | READY | HIGH | EPIC-008 | Backend host, Vercel, Supabase | InmoScore Engineering Team | SPR-004 | Logs temporales revisados sin secretos, tokens, passwords ni PII innecesaria. | Pre-deploy. |
| TASK-001 | TASK | Validar reset password en produccion | DONE | CRITICAL | EPIC-001 | Supabase, Resend, Turnstile, backend productivo | InmoScore Engineering Team | SPR-004 | Prueba real documentada con resultado OK. | Validacion productiva completada el 2026-07-24. |
| TASK-002 | TASK | Auditar variables productivas | READY | HIGH | EPIC-008 | Vercel, backend host, Supabase | InmoScore Engineering Team | SPR-004 | Variables publicas/privadas revisadas sin secretos expuestos. | Preparacion deploy. |
| TASK-003 | TASK | Confirmar hosting backend productivo | BLOCKED | CRITICAL | EPIC-008 | Railway o alternativa | InmoScore Engineering Team | SPR-004 | Host elegido, healthcheck definido y CORS planificado. | Bloqueado por Railway trial expirado. |
| TASK-006 | TASK | Configurar redirects Supabase Auth productivos | DONE | CRITICAL | EPIC-008 | Supabase, dominio productivo | InmoScore Engineering Team | SPR-004 | Redirects productivos validados. | Redirect de recovery validado en produccion el 2026-07-24. |
| TASK-007 | TASK | Configurar dominios Turnstile productivos | READY | HIGH | EPIC-008 | Cloudflare Turnstile, dominio productivo | InmoScore Engineering Team | SPR-004 | Dominios productivos autorizados. | Requerido para auth. |
| TASK-008 | TASK | Validar Resend con remitente `inmoscore.com` | READY | HIGH | EPIC-008 | Resend, dominio/remitente | InmoScore Engineering Team | SPR-004 | Email productivo llega correctamente. | Requerido para reset password. |
| TASK-009 | TASK | Revisar logs temporales antes del despliegue | READY | HIGH | EPIC-008 | Vercel, backend host, Supabase | InmoScore Engineering Team | SPR-004 | Logs revisados y sin secretos. | Pre-deploy. |

## 6. Bugs

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Reset password no validado en produccion | DONE | CRITICAL | EPIC-001 | Supabase redirects, Resend, Turnstile | InmoScore Engineering Team | SPR-004 | Password nueva aceptada, anterior rechazada, sesion normal rechazada y enlace reutilizado rechazado en produccion. | Validacion productiva exitosa; bug cerrado el 2026-07-24. |
| BUG-002 | Backend Railway con trial expirado bloquea entorno productivo | BLOCKED | CRITICAL | EPIC-008 | Railway o alternativa | InmoScore Engineering Team | SPR-004 | Backend productivo restaurado o reemplazo decidido. | Bloqueante actual de despliegue. |

## 7. Tech debt

| ID | Titulo | Estado | Prioridad | Epic | Dependencias | Responsable | Sprint | Acceptance Criteria | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-004 | Definir baseline de coverage | BACKLOG | MEDIUM | EPIC-008 | Herramienta de testing | InmoScore Engineering Team | TBD | Coverage reportable sin dato inventado. | Deuda de medicion. |
| TASK-005 | Definir baseline de performance | BACKLOG | MEDIUM | EPIC-008 | Web/API metrics | InmoScore Engineering Team | TBD | Metrica de performance acordada y registrada. | Deuda de medicion. |
| TASK-020 | Normalizar taxonomia de auditoria de autenticacion | BACKLOG | HIGH | EPIC-010 | authentication_audit_logs, security_events | InmoScore Engineering Team | TBD | Request, confirm, complete y change usan nombres inequivocos y documentados. | No bloquea FEAT-003 ni STORY-001. |
| TASK-021 | Correlacionar eventos de recuperacion de extremo a extremo | BACKLOG | HIGH | EPIC-010 | request_id o identificador seguro equivalente | InmoScore Engineering Team | TBD | Solicitud, confirmacion y finalizacion pueden correlacionarse sin almacenar tokens ni cookies. | No bloquear el flujo valido si falla auditoria auxiliar. |
| TASK-022 | Revisar PII en auditoria de autenticacion | BACKLOG | HIGH | EPIC-010 | Politica de minimizacion y retencion | InmoScore Engineering Team | TBD | Correo, IP y user agent tienen justificacion, acceso y retencion documentados o se minimizan. | Nunca registrar password, TokenHash, bearer token, cookies o secretos. |
| TASK-023 | Fortalecer persistencia de auditoria de autenticacion | BACKLOG | HIGH | EPIC-010 | Supabase, observabilidad | InmoScore Engineering Team | TBD | Fallos de insercion son detectables y medibles manteniendo la politica best-effort acordada. | Evitar fallos silenciosos. |

## 8. Criterios generales de aceptacion

- El item tiene ID global valido.
- Estado, prioridad y tipo usan valores oficiales.
- La feature esta asociada a una epica.
- Dependencias criticas estan registradas.
- Acceptance Criteria es verificable.
- Seguridad y trazabilidad legal se preservan.
- No se exponen secretos ni PII innecesaria.
- Operaciones economicas o de credito son idempotentes.
- Documentacion relacionada se actualiza cuando aplique.

## 9. Registro de actualizacion

| Fecha | Cambio | Responsable |
| --- | --- | --- |
| 2026-07-10 | Conversion a backlog profesional con IDs globales, estados y prioridades oficiales. | InmoScore Engineering Team |
| 2026-07-10 | Preparacion de SPR-004 Deploy Production Foundation; features de despliegue movidas a READY y asociadas a SPR-004. | InmoScore Engineering Team |
| 2026-07-22 | FEAT-003 y STORY-001 pasan a REVIEW tras 19 pruebas y builds locales exitosos; BUG-001 y TASK-001 permanecen BLOCKED hasta validacion productiva. | InmoScore Engineering Team |
| 2026-07-24 | TASK-001, TASK-006 y BUG-001 pasan a DONE tras validacion productiva; FEAT-003 y STORY-001 conservan REVIEW hasta cerrar evidencia de auditoria. | InmoScore Engineering Team |
| 2026-07-28 | FEAT-003 y STORY-001 pasan a DONE con evidencia persistida `password.reset.success`; EPIC-010 y TASK-020 a TASK-023 absorben el refactor no bloqueante de auditoria. | InmoScore Engineering Team |
