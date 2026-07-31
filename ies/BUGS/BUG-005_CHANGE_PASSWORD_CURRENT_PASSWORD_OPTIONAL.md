# BUG-005 - POST /api/auth/change-password acepta current_password opcional

**Version:** v1.0
**Fecha de creacion:** 2026-07-30
**Ultima actualizacion:** 2026-07-30
**Responsable:** InmoScore Engineering Team
**Estado:** BACKLOG
**Prioridad:** HIGH

## 1. Resumen

El contrato backend declara `current_password` opcional y omite la comparacion cuando el
cliente no lo envia.

## 2. Impacto

La posesion de un bearer token puede bastar para intentar sustituir la contrasena sin
demostrar conocimiento de la credencial vigente.

## 3. Pasos para reproducir

1. Obtener una sesion valida.
2. Invocar `POST /api/auth/change-password` sin `current_password`.
3. Observar que el esquema acepta la solicitud.

## 4. Resultado actual

BUG-003 bloquea el endpoint para correo no confirmado. El contrato opcional permanece
sin cambios para sesiones confirmadas.

## 5. Resultado esperado

El cambio directo exige la contrasena actual; recovery mediante enlace permanece separado.

## 6. Evidencia

Revision del esquema y handler backend.

## 7. Dependencias

EPIC-001 y recovery productivo.

## 8. Acceptance Criteria

- `current_password` obligatorio y validado.
- Recovery mediante enlace continua funcionando.
- Existen pruebas de contrato y regresion.

## 9. Notas

Fuera del alcance de BUG-003.
