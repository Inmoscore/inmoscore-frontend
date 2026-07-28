# InmoScore Engineering System Index

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-10
**Responsable:** InmoScore Engineering Team
**Estado del documento:** Active

## Indice

1. Que es el IES
2. Como navegarlo
3. Que archivo abrir primero
4. Como iniciar un sprint
5. Como cerrar un sprint
6. Como actualizar el dashboard
7. Como crear un ADR
8. Como crear una release
9. Mapa de archivos

## 1. Que es el IES

El InmoScore Engineering System es el sistema operativo documental del proyecto. Centraliza principios, tablero, backlog, contexto para IA, estandares, plantillas y procedimientos para gestionar el trabajo de ingenieria sin depender de memoria informal.

## 2. Como navegarlo

Usar este orden:

1. `INDEX.md` para orientacion.
2. `STANDARDS.md` para estados, prioridades, tipos e IDs.
3. `01_PROJECT_DASHBOARD.md` para estado actual.
4. `02_PRODUCT_BACKLOG.md` para trabajo planificado.
5. `03_AI_CONTEXT.md` para contexto maestro de asistentes IA.
6. `00_CONSTITUTION.md` para principios no negociables.
7. `TEMPLATES/` para crear nuevos artefactos.

## 3. Que archivo abrir primero

Abrir primero `ies/INDEX.md`. Luego abrir `ies/01_PROJECT_DASHBOARD.md` para saber el estado actual y `ies/02_PRODUCT_BACKLOG.md` para elegir el trabajo siguiente.

## 4. Como iniciar un sprint

1. Crear o copiar `TEMPLATES/SPRING_TEMPLATE.md`.
2. Asignar un ID `SPR-*` segun `STANDARDS.md`.
3. Seleccionar items `READY` desde `02_PRODUCT_BACKLOG.md`.
4. Confirmar dependencias, responsable y acceptance criteria.
5. Actualizar `01_PROJECT_DASHBOARD.md` con sprint actual, progreso inicial, riesgos y bloqueantes.

## 5. Como cerrar un sprint

1. Revisar cada item comprometido.
2. Mover a `DONE` solo lo aceptado.
3. Mantener en `REVIEW`, `BLOCKED` o `BACKLOG` lo incompleto.
4. Registrar bugs, riesgos o deuda tecnica descubierta.
5. Actualizar sprint progress y project progress en dashboard.
6. Preparar el siguiente `SPR-*`.

## 6. Como actualizar Dashboard

1. No inventar metricas.
2. Usar `TBD`, `No medido` o `Pendiente de validacion` cuando no haya evidencia.
3. Registrar bloqueantes con ID `TASK-*`, `BUG-*` o `RISK-*`.
4. Registrar riesgos con ID `RISK-*`.
5. Mantener release y sprint alineados con backlog.
6. Actualizar la tabla de registro de cambios del dashboard.

## 7. Como crear ADR

1. Copiar `TEMPLATES/ADR_TEMPLATE.md`.
2. Asignar ID `ADR-*`.
3. Describir contexto, decision, alternativas, consecuencias y estado.
4. Vincular features, riesgos, releases o RFCs relacionados.
5. Registrar la decision en backlog o dashboard si impacta el plan.

## 8. Como crear Release

1. Copiar `TEMPLATES/RELEASE_TEMPLATE.md`.
2. Asignar ID `REL-*`.
3. Definir alcance, criterios de entrada, criterios de salida y rollback.
4. Asociar sprint objetivo.
5. Validar riesgos, bloqueantes, bugs criticos y checklist operativo.
6. Actualizar `01_PROJECT_DASHBOARD.md`.

## 9. Mapa de archivos

| Archivo | Proposito |
| --- | --- |
| `00_CONSTITUTION.md` | Principios fundamentales de ingenieria. |
| `01_PROJECT_DASHBOARD.md` | Tablero editable del estado actual. |
| `02_PRODUCT_BACKLOG.md` | Backlog profesional con IDs globales. |
| `03_AI_CONTEXT.md` | Contexto maestro para asistentes IA. |
| `STANDARDS.md` | Estados, prioridades, tipos e IDs oficiales. |
| `TEMPLATES/` | Plantillas reutilizables. |
