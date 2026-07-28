# InmoScore Engineering System Standards

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-10
**Responsable:** InmoScore Engineering Team
**Estado del documento:** Active

## Indice

1. Proposito
2. Estados oficiales
3. Prioridades oficiales
4. Tipos oficiales
5. Sistema global de IDs
6. Reglas de uso

## 1. Proposito

Este documento estandariza el lenguaje operativo del InmoScore Engineering System. Todos los documentos dentro de `ies/` deben usar estos estados, prioridades, tipos e IDs globales.

## 2. Estados oficiales

| Estado | Definicion |
| --- | --- |
| BACKLOG | Item registrado pero aun no listo para ejecucion. |
| READY | Item refinado, con alcance claro y listo para sprint. |
| IN_PROGRESS | Item en ejecucion activa. |
| REVIEW | Item implementado o redactado y pendiente de validacion/revision. |
| BLOCKED | Item detenido por dependencia, decision, acceso, entorno o informacion faltante. |
| DONE | Item terminado y aceptado segun sus criterios. |

## 3. Prioridades oficiales

| Prioridad | Definicion |
| --- | --- |
| CRITICAL | Bloquea release, seguridad, legalidad, auth, datos, pagos o operacion esencial. |
| HIGH | Importante para el proximo hito o reduce riesgo relevante. |
| MEDIUM | Valioso, pero no bloquea el hito inmediato. |
| LOW | Conveniente, cosmetico o diferible sin riesgo material. |

## 4. Tipos oficiales

| Tipo | Definicion |
| --- | --- |
| EPIC | Resultado grande de producto o plataforma compuesto por multiples features. |
| FEATURE | Capacidad funcional entregable para usuario, admin, sistema o operacion. |
| STORY | Necesidad expresada desde perspectiva de usuario o actor. |
| TASK | Trabajo tecnico u operativo concreto. |
| BUG | Defecto observado o riesgo funcional confirmado. |
| TECH_DEBT | Deuda tecnica, deuda de medicion o mejora interna diferible. |
| SPIKE | Investigacion acotada para reducir incertidumbre. |
| RFC | Propuesta tecnica abierta a discusion. |
| ADR | Decision tecnica aceptada o rechazada. |
| RISK | Riesgo tecnico, legal, operativo o de seguridad. |
| RELEASE | Paquete de entrega hacia un entorno o audiencia. |

## 5. Sistema global de IDs

Todo item del proyecto debe usar uno de estos formatos:

| Tipo | Formato |
| --- | --- |
| EPIC | `EPIC-001` |
| FEATURE | `FEAT-001` |
| STORY | `STORY-001` |
| TASK | `TASK-001` |
| BUG | `BUG-001` |
| SPRINT | `SPR-001` |
| ADR | `ADR-001` |
| RFC | `RFC-001` |
| RELEASE | `REL-001` |
| RISK | `RISK-001` |

## 6. Reglas de uso

- No usar IDs libres como `AUTH-F01`, `EP-01` o nombres descriptivos como identificador primario.
- No reutilizar IDs eliminados.
- No renombrar IDs una vez referenciados.
- Cada feature debe pertenecer a una epica.
- Cada sprint debe usar ID `SPR-*`.
- Cada release debe usar ID `REL-*`.
- Cada decision formal debe usar ADR.
- Cada propuesta abierta debe usar RFC.
- Cada bug critico debe figurar en dashboard y backlog.
- Cada riesgo relevante debe figurar en dashboard o registro de riesgos.
