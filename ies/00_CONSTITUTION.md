# InmoScore Engineering Constitution

**Version:** v1.0
**Fecha de creacion:** 2026-07-10
**Ultima actualizacion:** 2026-07-10
**Responsable:** InmoScore Engineering Team
**Estado del documento:** Active

## Indice

1. Proposito
2. Alcance
3. Principios fundamentales
4. Reglas de aplicacion
5. Criterios de revision

## 1. Proposito

Esta constitucion define los principios fundamentales de ingenieria que guian el desarrollo, mantenimiento, despliegue y evolucion de InmoScore. Su objetivo es proteger la calidad tecnica, la seguridad, la trazabilidad legal y la continuidad del producto.

## 2. Alcance

Aplica a todo cambio en frontend, backend, base de datos, integraciones, despliegue, seguridad, documentacion tecnica y procesos operativos del proyecto InmoScore.

## 3. Principios fundamentales

### 1. Seguridad por defecto

Toda funcionalidad debe disenar sus controles de seguridad desde el inicio. Autenticacion, autorizacion, rate limits, proteccion de secretos, validacion de entrada y minimizacion de datos no son tareas opcionales.

### 2. Legalidad y trazabilidad primero

Los flujos que involucren datos personales, reportes, historiales, documentos, solicitudes legales o decisiones de riesgo deben preservar origen, evidencia, base legal, estado, auditoria y capacidad de revision.

### 3. No romper scoring

El motor de scoring es un nucleo critico del producto. Cualquier cambio que afecte calculos, ponderaciones, inputs o interpretacion de score requiere revision cuidadosa, pruebas dirigidas y documentacion.

### 4. Autenticacion intocable sin pruebas

Registro, login, reset password, cambio de password, verificacion, JWT, Supabase Auth y Turnstile son superficies criticas. Ningun cambio en auth debe cerrarse sin prueba funcional del flujo afectado.

### 5. Secretos nunca en cliente ni logs

`service_role`, API keys privadas, JWT secrets, tokens, passwords, firmas de webhook y credenciales de proveedores solo pertenecen al backend o a gestores seguros de variables. Nunca deben exponerse en frontend, consola, logs o commits.

### 6. Migraciones idempotentes

Toda migracion debe tolerar ejecucion repetida. Se deben preferir patrones como `create table if not exists`, `add column if not exists` y `drop constraint if exists` cuando aplique.

### 7. Idempotencia en operaciones economicas y de credito

Creditos, pagos, webhooks, upgrades y beneficios de usuario deben evitar efectos duplicados ante reintentos, latencia, callbacks repetidos o errores parciales.

### 8. Auditoria best-effort con criterio

Los eventos relevantes deben auditarse. Cuando la auditoria sea auxiliar, los fallos de logging no deben romper flujos validos. Cuando la auditoria sea requisito legal o economico, el flujo debe tratarla como condicion critica.

### 9. Cambios pequenos, verificables y reversibles

La ingenieria de InmoScore favorece cambios acotados, con intencion clara, faciles de revisar, verificar y revertir. Las refactorizaciones grandes deben tener justificacion y plan.

### 10. Documentacion como contrato operativo

El conocimiento critico del proyecto debe quedar documentado. Roadmap, arquitectura, backlog, decisiones, riesgos, despliegue y contexto de IA deben actualizarse cuando el sistema cambie.

## 4. Reglas de aplicacion

- Antes de cambiar una zona critica, revisar su documentacion y dependencias.
- Antes de cerrar cambios funcionales, validar TypeScript/build correspondiente.
- Antes de tocar datos productivos, definir respaldo, migracion y rollback.
- Antes de desplegar, verificar variables, secretos, dominios y proveedores externos.
- Despues de decisiones tecnicas relevantes, actualizar el registro documental correspondiente.

## 5. Criterios de revision

Un cambio contradice esta constitucion si:

- Expone secretos o PII innecesaria.
- Rompe trazabilidad legal.
- Cambia auth sin pruebas.
- Cambia scoring sin control.
- Introduce migraciones no idempotentes.
- Duplica cobros, creditos o beneficios.
- Reduce auditabilidad de acciones sensibles.
- Deja conocimiento critico solo en memoria o conversacion.
