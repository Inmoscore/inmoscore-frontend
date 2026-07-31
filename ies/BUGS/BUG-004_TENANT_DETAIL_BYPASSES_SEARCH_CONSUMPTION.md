# BUG-004 - GET /api/tenants/:cedula puede evitar el control de consumo de busquedas

**Version:** v1.0
**Fecha de creacion:** 2026-07-30
**Ultima actualizacion:** 2026-07-30
**Responsable:** InmoScore Engineering Team
**Estado:** BACKLOG
**Prioridad:** HIGH

## 1. Resumen

La ruta de detalle consulta datos sin pasar por el mismo control de plan, creditos y
consumo utilizado por `GET /api/tenants/search`.

## 2. Impacto

Un usuario confirmado podria evitar limites y trazabilidad economica mediante llamada
directa.

## 3. Pasos para reproducir

1. Autenticarse sin busquedas disponibles.
2. Invocar directamente `GET /api/tenants/:cedula`.
3. Comparar con `GET /api/tenants/search`.

## 4. Resultado actual

BUG-003 bloquea ambas rutas para correo no confirmado, pero no corrige la diferencia de
consumo para usuarios confirmados.

## 5. Resultado esperado

Toda consulta equivalente aplica permisos, consumo, idempotencia y auditoria consistentes.

## 6. Evidencia

Revision estatica de rutas backend.

## 7. Dependencias

FEAT-005, FEAT-006 y FEAT-007.

## 8. Acceptance Criteria

- La ruta no evita limites ni creditos.
- Reintentos no producen doble consumo.
- La auditoria registra consulta y resultado.

## 9. Notas

Fuera del alcance de BUG-003.
