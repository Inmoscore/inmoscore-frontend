# InmoScore AI Context

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-10
**Responsable:** InmoScore Engineering Team
**Estado del documento:** Active

## Indice

1. Proposito
2. Resumen del proyecto
3. Arquitectura
4. Stack
5. Restricciones
6. Modulos existentes
7. Decisiones clave
8. Reglas de desarrollo
9. Estado actual
10. Sprint actual
11. Proximos objetivos
12. Estandares IES
13. Instrucciones para asistentes de IA

## 1. Proposito

Este documento entrega contexto maestro para asistentes de IA que trabajen en InmoScore. Debe usarse para entender el producto, sus limites tecnicos, sus reglas de seguridad y el estado actual antes de proponer o ejecutar cambios.

## 2. Resumen del proyecto

InmoScore es una plataforma para evaluacion arrendaticia, consulta de inquilinos, scoring, reportes legales, gestion documental y cumplimiento. El producto busca operar con trazabilidad, seguridad y criterios legales para Colombia.

El proyecto esta en preproduccion avanzada. Los modulos base estan implementados y el foco actual es cerrar autenticacion productiva y preparar despliegue beta.

## 3. Arquitectura

La arquitectura esta separada en:

- Frontend Next.js para interfaz de usuario, dashboard, auth, busqueda, reportes, legal y admin.
- Backend Express para API, validaciones, autenticacion server-side, scoring, auditoria, documentos, billing y operaciones privilegiadas.
- Supabase para PostgreSQL y autenticacion.
- Servicios externos para email, antifraude, despliegue y pagos.

Flujo general:

1. Usuario interactua con frontend.
2. Frontend llama backend con token cuando aplica.
3. Backend valida auth, permisos, Turnstile, rate limits y datos.
4. Backend persiste o consulta en Supabase/PostgreSQL.
5. Eventos sensibles generan auditoria.
6. Integraciones externas se invocan desde backend.

## 4. Stack

Frontend:

- Next.js 16.
- React 19.
- TypeScript.
- Tailwind CSS 4.
- Supabase JS.
- Axios.
- lucide-react.

Backend:

- Node.js.
- Express 4.
- TypeScript.
- Supabase JS.
- JWT.
- Zod.
- express-validator.
- helmet.
- express-rate-limit.

Datos e infraestructura:

- Supabase PostgreSQL.
- Supabase Auth.
- Vercel para frontend.
- Railway o alternativa para backend.
- Resend para email transaccional.
- Cloudflare Turnstile para proteccion antifraude.
- Wompi y Stripe para pagos segun modulo.

## 5. Restricciones

- No modificar scoring sin pruebas especificas.
- No tocar autenticacion sin pruebas funcionales.
- No ejecutar migraciones destructivas sin plan.
- No exponer `service_role` en frontend.
- No registrar secretos en logs.
- No usar secretos en variables `NEXT_PUBLIC_*`.
- No romper trazabilidad legal de reportes.
- No duplicar descuentos de creditos, pagos o beneficios.
- No asumir que una migracion corre en base limpia.
- No cambiar APIs de Next.js sin revisar documentacion local de la version instalada.

## 6. Modulos existentes

- Autenticacion: registro, login, reset password, change password, resend verification y account status.
- Turnstile: validacion en registro, login y reset password.
- Busqueda: consulta de inquilinos y consumo de creditos.
- Scoring: motor dedicado en backend.
- Reportes: creacion, evidencia, revision, notificacion y auditoria legal.
- Legal: documentos activos, aceptaciones, solicitudes de datos, disputas, revision humana e identidad.
- Documentos seguros: upload intent, access check, confirm upload y signed read.
- Admin: MFA, usuarios, planes, reportes, historiales, pagos, metricas, inventario de datos, auditoria y acciones.
- Billing: rutas de facturacion, Wompi, Stripe, webhooks y upgrade events.
- Base de datos: migraciones para auth, security events, legal, search, reports, documents, billing y multi-tenant foundation.

## 7. Decisiones clave

- Resend reemplaza SMTP GoDaddy como proveedor de correo transaccional.
- Turnstile es obligatorio en flujos sensibles de autenticacion.
- Auditoria se maneja como best-effort cuando no sea condicion legal/economica bloqueante.
- Creditos, pagos y webhooks deben ser idempotentes.
- Reportes deben conservar trazabilidad legal, evidencia, revision y estado.
- Frontend se despliega en Vercel.
- Backend Express se despliega en Railway o alternativa equivalente.
- Supabase es la fuente principal de autenticacion y datos.

## 8. Reglas de desarrollo

- Leer el codigo existente antes de editar.
- Mantener cambios acotados al pedido.
- Preferir patrones existentes del repo.
- No tocar frontend/backend si el pedido es solo documental.
- Usar migraciones idempotentes.
- Validar auth, permisos y organizacion en backend.
- Mantener secretos fuera del cliente.
- Actualizar documentacion cuando cambie arquitectura, DB, API, seguridad o despliegue.
- Antes de finalizar cambios funcionales, ejecutar build/tsc correspondiente salvo instruccion contraria.

## 9. Estado actual

Estado del producto: preproduccion avanzada.

Completado:

- SPR-001 Search Audit.
- SPR-002 Legal Reporting Audit.
- SPR-003 Authentication Audit.

En cierre:

- SPR-004 Authentication Hardening.

Pendiente critico:

- Validacion final de reset password en produccion.

## 10. Sprint actual

**Sprint:** SPR-004 Authentication Hardening
**Estado:** REVIEW
**Objetivo:** asegurar flujos de autenticacion con Turnstile, auditoria y correo transaccional confiable.
**Pendiente:** probar reset password en produccion con Supabase redirects, Resend y Turnstile.

## 11. Proximos objetivos

1. Validar reset password en produccion.
2. Auditar variables productivas.
3. Confirmar despliegue frontend en Vercel.
4. Confirmar despliegue backend en Railway o alternativa.
5. Validar healthcheck backend.
6. Ejecutar checklist funcional de SPR-005 Deploy Production.
7. Abrir produccion beta con monitoreo cercano.

## 12. Estandares IES

- Usar `ies/STANDARDS.md` como fuente de verdad para estados, prioridades, tipos e IDs.
- Usar IDs globales como `EPIC-001`, `FEAT-001`, `STORY-001`, `TASK-001`, `BUG-001`, `SPR-001`, `ADR-001`, `RFC-001`, `REL-001` y `RISK-001`.
- No crear identificadores libres para backlog, releases, riesgos, decisiones o sprints.
- Usar plantillas de `ies/TEMPLATES/` para nuevos artefactos del sistema.

## 13. Instrucciones para asistentes de IA

- Si el usuario pide trabajo local, no usar servicios remotos salvo solicitud explicita.
- Si el usuario pide documentacion, no modificar codigo funcional.
- Si el usuario prohibe builds, no ejecutar builds.
- Si se toca autenticacion, proponer o ejecutar pruebas funcionales segun permisos.
- Si se toca base de datos, revisar migraciones existentes y mantener idempotencia.
- Si se toca Next.js, revisar primero la documentacion local indicada en `AGENTS.md`.
- Si hay cambios no relacionados en git, no revertirlos.
- Al finalizar, reportar archivos creados o modificados y verificacion realizada.
