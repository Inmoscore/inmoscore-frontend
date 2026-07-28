# SPR-005 - Production Readiness

**Version:** v1.0
**Fecha de creacion:** 2026-07-28
**Ultima actualizacion:** 2026-07-28
**Responsable:** CTO
**Estado:** REVIEW

## Indice

1. Objetivo
2. Fechas
3. Condiciones de entrada
4. FRENTE 1 - Infraestructura
5. FRENTE 2 - Monetizacion
6. FRENTE 3 - Seguridad
7. FRENTE 4 - Operacion
8. FRENTE 5 - Go Live
9. Fuera de alcance
10. Riesgos de ejecucion
11. Definition of Done
12. Rollback del sprint
13. Cierre

## 1. Objetivo

Convertir la base funcional de InmoScore en una plataforma operable y aceptable para clientes publicos, cerrando las brechas de infraestructura, monetizacion, seguridad, operacion y validacion de salida identificadas en la auditoria de Production Readiness.

SPR-005 no agrega nuevas capacidades de producto. Su resultado esperado es una decision formal `GO` o `NO-GO` sustentada en evidencia reproducible. Ningun item `READY`, `IN_PROGRESS` o `REVIEW` se considera validado sin cumplir su criterio de aceptacion.

## 2. Fechas

| Campo | Valor |
| --- | --- |
| Inicio | TBD, despues de la condicion de salida de SPR-004 |
| Cierre objetivo | TBD |
| Cierre real | TBD |
| Release objetivo | REL-001 Production Beta |

## 3. Condiciones de entrada

- SPR-004 permanece `IN_PROGRESS` hasta cerrar o decidir formalmente sus bloqueantes.
- Existe decision sobre el hosting del backend o una alternativa aprobada.
- El alcance de SPR-005 es aceptado por CTO, Product Owner, QA y Legal.
- No se cambian estados de Features por la sola creacion de este plan.
- Los accesos productivos requeridos se entregan por canales seguros; ningun secreto se copia a este documento.

## 4. FRENTE 1 — Infraestructura

| ID | Tarea | Prioridad | Dependencias | Riesgo | Responsable | Estimacion | Criterio de aceptacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-024 | [ ] Seleccionar y aprobar hosting backend | CRITICAL | TASK-003, BUG-002, FEAT-034 | Alto: no existe backend productivo utilizable. | CTO | S | Railway queda restaurado o existe ADR/decision equivalente con proveedor, costo, region, capacidad, rollback y responsable aprobados. |
| TASK-025 | [ ] Desplegar backend productivo | CRITICAL | TASK-024, variables backend | Alto: indisponibilidad o configuracion divergente. | DevOps | L | Backend Express queda desplegado por pipeline reproducible, inicia sin secretos en logs y responde desde una URL HTTPS estable. |
| TASK-026 | [ ] Inventariar y validar variables de entorno | CRITICAL | TASK-024, TASK-002 | Critico: secreto ausente, expuesto o ubicado en cliente. | DevOps | M | Existe matriz por entorno y servicio; variables obligatorias estan configuradas, valores sensibles permanecen privados y ninguna variable publica contiene secretos. |
| TASK-027 | [ ] Validar Supabase de produccion | CRITICAL | FEAT-035, TASK-026 | Alto: redirects, Auth, Storage o esquema divergentes. | Backend | M | Auth, base, Storage, Site URL y Redirect URLs productivos funcionan con configuracion registrada sin valores sensibles. |
| TASK-028 | [ ] Validar Resend y entrega transaccional | HIGH | FEAT-036, TASK-026, DNS | Alto: usuarios no reciben verificacion o recovery. | DevOps | M | Dominio y remitente estan verificados; correos de registro, reenvio y recovery llegan desde `inmoscore.com` y los fallos son observables. |
| TASK-029 | [ ] Validar Turnstile productivo | CRITICAL | FEAT-037, TASK-026, dominio | Alto: bloqueo de usuarios o bypass antifraude. | Frontend | M | Registro, login y recovery aceptan tokens validos, rechazan ausentes/invalidos y no registran token ni fragmentos de secreto. |
| TASK-030 | [ ] Endurecer y validar CORS | CRITICAL | TASK-025, dominio frontend | Alto: origen no autorizado o bloqueo del frontend real. | Backend | S | Solo origenes productivos y entornos aprobados son aceptados; previews no autorizados y origenes arbitrarios son rechazados mediante prueba registrada. |
| TASK-031 | [ ] Implementar health checks de servicio y dependencias | CRITICAL | TASK-025, TASK-027 | Alto: despliegue degradado no detectable. | DevOps | M | Health y readiness distinguen proceso activo de dependencias disponibles, no exponen detalles sensibles y son supervisados externamente. |

## 5. FRENTE 2 — Monetizacion

| ID | Tarea | Prioridad | Dependencias | Riesgo | Responsable | Estimacion | Criterio de aceptacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-032 | [ ] Validar configuracion productiva de Wompi | CRITICAL | TASK-026, FEAT-030 | Critico: cobro invalido o uso de credenciales incorrectas. | Backend | M | Ambiente, llaves, firma de integridad, secreto de eventos, moneda, montos y callback corresponden a produccion y no aparecen en logs. |
| TASK-033 | [ ] Garantizar idempotencia atomica de pagos | CRITICAL | FEAT-031, TASK-032, base productiva | Critico: doble beneficio, doble cambio de plan o carrera de webhooks. | Backend | L | Duplicados y entregas concurrentes producen un unico efecto economico mediante restriccion/transaccion persistente; existe prueba automatizada concurrente. |
| TASK-034 | [ ] Aprobar modelo de suscripcion | CRITICAL | Pricing, Wompi, Legal | Alto: venta de un producto sin ciclo contractual definido. | CTO | M | Se documentan pago unico o recurrente, periodo, fecha de inicio, renovacion, cancelacion, reembolso, mora y proveedor fuente de verdad. |
| TASK-035 | [ ] Definir y persistir vigencia de planes | CRITICAL | TASK-034, FEAT-029 | Alto: acceso pagado indefinido o expiracion incorrecta. | Backend | M | Cada plan pagado tiene inicio, fin, estado y proveedor; el acceso se calcula desde datos persistidos y auditables. |
| TASK-036 | [ ] Validar renovaciones | CRITICAL | TASK-033, TASK-035 | Alto: cobro renovado sin mantener beneficio o viceversa. | Backend | L | Renovacion valida extiende una sola vez la vigencia; reintentos y eventos fuera de orden no duplican periodo ni beneficios. |
| TASK-037 | [ ] Validar cancelacion y downgrade | CRITICAL | TASK-034, TASK-035 | Alto: derechos de plan incorrectos tras cancelacion o impago. | Backend | M | Cancelacion, vencimiento, impago y reembolso aplican la politica aprobada y terminan en el plan correcto con auditoria. |
| TASK-038 | [ ] Cerrar reconciliacion financiera | CRITICAL | TASK-032 a TASK-037, Panel Admin | Critico: diferencia entre proveedor, pago y plan. | Backend | L | Operacion puede comparar Wompi, pagos y planes, corregir divergencias con doble control y producir evidencia de conciliacion sin alterar pagos validos. |

## 6. FRENTE 3 — Seguridad

| ID | Tarea | Prioridad | Dependencias | Riesgo | Responsable | Estimacion | Criterio de aceptacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-039 | [ ] Eliminar logs sensibles y temporales | CRITICAL | STORY-010, RISK-002 | Critico: exposicion de secretos, tokens o PII. | Backend | M | No se registran passwords, tokens, cookies, emails completos, payloads con PII ni prefijos/sufijos de secretos; escaneo y prueba manual quedan documentados. |
| TASK-040 | [ ] Revisar arquitectura JWT | CRITICAL | Auth backend, Frontend | Alto: secuestro de sesion o token de larga vida. | CTO | M | Se aprueba duracion, almacenamiento, rotacion, revocacion y estrategia de logout; riesgos residuales tienen decision formal. |
| TASK-041 | [ ] Revisar cookies y almacenamiento de sesion | CRITICAL | TASK-040, middleware | Alto: token accesible a JavaScript o proteccion insuficiente. | Frontend | M | Cookies y almacenamiento cumplen la estrategia aprobada; `HttpOnly`, `Secure`, `SameSite`, expiracion y alcance se validan donde corresponda. |
| TASK-042 | [ ] Auditar y rotar secretos cuando aplique | CRITICAL | TASK-026, TASK-039 | Critico: credencial potencialmente expuesta o sin gobierno. | DevOps | M | Inventario, propietario, entorno, ultima rotacion y acceso minimo estan verificados; toda credencial con sospecha de exposicion queda rotada. |
| TASK-043 | [ ] Ejecutar hardening de API y autenticacion | CRITICAL | TASK-029, TASK-030, TASK-040 a TASK-042 | Alto: abuso, enumeracion o acceso privilegiado. | Backend | L | Rate limits, validacion, errores genericos, autorizacion, MFA admin y cabeceras se prueban contra matriz de amenazas priorizada. |

## 7. FRENTE 4 — Operacion

| ID | Tarea | Prioridad | Dependencias | Riesgo | Responsable | Estimacion | Criterio de aceptacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-044 | [ ] Implementar observabilidad minima | CRITICAL | TASK-025, TASK-031 | Alto: incidentes invisibles. | DevOps | L | Frontend, backend y dependencias reportan disponibilidad, tasa de error, latencia y fallos criticos en una vista operacional accesible. |
| TASK-045 | [ ] Configurar alertas accionables | CRITICAL | TASK-044 | Alto: deteccion tardia o fatiga por alertas. | DevOps | M | Caida, error rate, health degradado, fallos de pago y auth disparan alertas con umbral, destinatario, severidad y procedimiento asociado. |
| TASK-046 | [ ] Estandarizar logs estructurados y redaccion | HIGH | TASK-039, TASK-044 | Alto: diagnostico insuficiente o PII expuesta. | Backend | L | Logs usan nivel, evento, timestamp y correlacion segura; existe lista de campos prohibidos, redaccion y retencion por entorno. |
| TASK-047 | [ ] Configurar backups y prueba de restauracion | CRITICAL | Supabase produccion, politica de datos | Critico: perdida irreversible o backup no restaurable. | DevOps | L | Frecuencia, retencion, cifrado y responsables estan definidos; una restauracion controlada demuestra RPO/RTO acordados sin afectar produccion. |
| TASK-048 | [ ] Crear runbooks operativos | HIGH | TASK-031, TASK-038, TASK-044 a TASK-047 | Alto: respuesta inconsistente. | DevOps | M | Existen runbooks de caida backend, Supabase, auth/email, Turnstile, pagos, exposicion de secreto, restauracion y rollback. |
| TASK-049 | [ ] Definir gestion de incidentes | CRITICAL | TASK-045, TASK-048 | Alto: escalamiento y comunicacion tardios. | CTO | M | Severidades, on-call, responsables, canales, tiempos internos, comunicacion al cliente, preservacion de evidencia y postmortem estan aprobados. |

## 8. FRENTE 5 — Go Live

Todos los checks son obligatorios para una decision `GO`, salvo excepcion documentada y aceptada por CTO, QA y el responsable del riesgo. Una excepcion no puede ocultar un riesgo `CRITICAL`.

| ID | Checklist | Prioridad | Dependencias | Riesgo | Responsable | Estimacion | Criterio de aceptacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-050 | [ ] Registro | CRITICAL | TASK-027, TASK-029, TASK-039, Legal | Alto: cuenta parcial, abuso o consentimiento invalido. | QA | M | Registro productivo crea cuenta consistente, exige Turnstile y consentimientos vigentes, entrega verificacion y genera auditoria segura. |
| TASK-051 | [ ] Login | CRITICAL | TASK-029, TASK-040, TASK-041 | Alto: acceso indebido o sesion insegura. | QA | M | Login valido crea sesion aprobada; credenciales/Turnstile invalidos fallan sin enumeracion ni datos sensibles. |
| TASK-052 | [ ] Recuperacion | CRITICAL | TASK-027 a TASK-029, TASK-039 | Alto: toma de cuenta o flujo alterno roto. | QA | M | Todas las entradas de recovery exigen controles equivalentes; password nueva funciona, anterior falla y enlace no se reutiliza. |
| TASK-053 | [ ] Busqueda | CRITICAL | TASK-025, FEAT-005 a FEAT-008 | Alto: resultado incorrecto, fuga de PII o consumo inconsistente. | QA | M | Busqueda respeta permisos, plan y creditos; resultado y auditoria coinciden y el reintento no produce efecto economico duplicado. |
| TASK-054 | [ ] Reportes | CRITICAL | FEAT-009 a FEAT-013, FEAT-019, Panel Admin | Critico: decision sin evidencia o trazabilidad legal. | QA | L | Reporte recorre creacion, evidencia, revision, notificacion, contradiccion y auditoria con estados coherentes. |
| TASK-055 | [ ] Pagos | CRITICAL | TASK-032 a TASK-038 | Critico: perdida financiera o doble beneficio. | QA | L | Pago aprobado, rechazado, duplicado, concurrente y reconciliado produce exactamente el resultado esperado y auditable. |
| TASK-056 | [ ] Planes | CRITICAL | TASK-034 a TASK-038 | Alto: derechos incorrectos. | QA | M | Alta, vigencia, renovacion, cancelacion, vencimiento y downgrade aplican limites y acceso conforme al contrato. |
| TASK-057 | [ ] Panel Admin | CRITICAL | FEAT-020 a FEAT-023, TASK-043 | Alto: operacion sin control o acceso privilegiado. | QA | L | Usuario no admin es rechazado; MFA protege acciones criticas y usuarios, reportes, pagos, legal y auditoria pueden operarse con trazabilidad. |
| TASK-058 | [ ] Correos | HIGH | TASK-028 | Alto: onboarding o recovery incompletos. | QA | M | Verificacion, reenvio y recovery llegan al destinatario, usan remitente aprobado y sus fallos son detectables sin exponer contenido sensible. |
| TASK-059 | [ ] Variables | CRITICAL | TASK-026, TASK-042 | Critico: secreto expuesto o dependencia mal configurada. | DevOps | S | Matriz de variables queda aprobada; no hay localhost accidental, secretos publicos ni variables obligatorias ausentes. |
| TASK-060 | [ ] SSL | CRITICAL | TASK-025, dominio | Critico: trafico no cifrado o certificado invalido. | DevOps | S | Frontend, backend y callbacks publicos usan HTTPS valido, cadena confiable, renovacion operativa y redireccion desde HTTP cuando aplique. |
| TASK-061 | [ ] Dominio | CRITICAL | DNS, TASK-025, TASK-027 a TASK-030 | Alto: rutas, redirects o proveedores apuntan al entorno incorrecto. | DevOps | S | DNS, frontend, backend, Supabase, Resend, Turnstile, Wompi y CORS usan dominios productivos aprobados. |
| TASK-062 | [ ] Backups | CRITICAL | TASK-047 | Critico: perdida de datos no recuperable. | DevOps | M | Backup reciente existe, restauracion fue probada y RPO/RTO y responsable de ejecucion estan documentados. |
| TASK-063 | [ ] Monitoreo | CRITICAL | TASK-044, TASK-045 | Alto: degradacion no detectada. | DevOps | M | Dashboards reciben datos reales y una alerta sintetica alcanza al responsable dentro del tiempo acordado. |
| TASK-064 | [ ] Pruebas E2E | CRITICAL | TASK-050 a TASK-063 | Alto: integraciones no verificadas como sistema. | QA | XL | Suite o protocolo reproducible cubre auth, busqueda, reportes, pagos, planes, admin y legal en production-like con evidencia. |
| TASK-065 | [ ] QA funcional | CRITICAL | TASK-064, docs/11_TESTING_QA.md | Alto: regresion visible al cliente. | QA | L | Checklist funcional completo queda ejecutado, con resultados, evidencias y cero defectos `CRITICAL` abiertos. |
| TASK-066 | [ ] QA legal | CRITICAL | Legal/Habeas Data, TASK-050, TASK-054 | Critico: tratamiento o decision sin base legal suficiente. | Legal | L | Versiones, textos, aceptaciones, derechos del titular, disputas, revision humana, retencion y trazabilidad reciben aprobacion legal escrita. |
| TASK-067 | [ ] QA seguridad | CRITICAL | TASK-039 a TASK-043, TASK-064 | Critico: vulnerabilidad explotable en produccion. | QA | L | Matriz de seguridad y escaneo de secretos/logs se completan; no quedan hallazgos `CRITICAL` o `HIGH` sin mitigacion aceptada. |
| TASK-068 | [ ] Rollback | CRITICAL | TASK-025, TASK-047, TASK-048 | Critico: imposibilidad de volver a estado estable. | DevOps | M | Rollback de frontend, backend y configuracion se ensaya; datos y pagos tienen estrategia no destructiva y responsables claros. |
| TASK-069 | [ ] Decision Go/No-Go | CRITICAL | TASK-050 a TASK-068 | Critico: apertura sin evidencia o excepciones ocultas. | CTO | S | CTO, QA y Legal firman `GO`; o se registra `NO-GO` con bloqueantes, responsables y nueva fecha. |

## 9. Fuera de alcance

- Nuevas funcionalidades de producto que no reduzcan un riesgo de Production Readiness.
- EPIC-009 Enterprise SaaS.
- Cambios al motor de scoring no requeridos por un defecto bloqueante.
- Refactorizaciones amplias sin relacion directa con seguridad, pagos u operacion.
- Cambios de estado de Features por avance documental.
- Apertura publica antes de completar la decision `GO`.

## 10. Riesgos de ejecucion

| Riesgo | Prioridad | Mitigacion |
| --- | --- | --- |
| Hosting backend no resuelto al iniciar SPR-005 | CRITICAL | No iniciar ejecucion dependiente; resolver TASK-024 como primera puerta. |
| Alcance de monetizacion no definido | CRITICAL | Aprobar TASK-034 antes de implementar vigencia, renovacion o downgrade. |
| Hallazgo de secretos en logs historicos | CRITICAL | Retirar instrumentacion, limitar acceso, evaluar exposicion y rotar credenciales afectadas. |
| Aprobacion legal tardia | CRITICAL | Involucrar Legal desde registro, reportes y planes; no concentrar revision al final. |
| QA E2E bloqueado por entorno inestable | HIGH | Mantener production-like reproducible y health/readiness como condicion previa. |
| Excepciones de salida sin responsable | CRITICAL | Toda excepcion requiere riesgo, responsable, fecha y aprobacion formal; un riesgo CRITICAL impide `GO`. |

## 11. Definition of Done

- Los cinco frentes tienen evidencia de aceptacion.
- TASK-050 a TASK-068 aparecen marcadas `[x]`.
- TASK-069 contiene una decision formal `GO`.
- No existen defectos, bloqueantes o riesgos `CRITICAL` abiertos para REL-001.
- No existen secretos, tokens, passwords, cookies ni PII innecesaria en logs.
- Pagos, planes y webhooks son persistente y atomicamente idempotentes.
- Registro y tratamiento de datos tienen aprobacion Legal.
- Backups, restauracion, monitoreo, alertas, incidentes y rollback fueron probados.
- Frontend y backend productivos operan sobre HTTPS y dominios aprobados.
- La evidencia de QA funcional, legal y seguridad queda vinculada al cierre.

## 12. Rollback del sprint

- Un despliegue fallido no habilita trafico publico y vuelve a la ultima version productiva conocida.
- Cambios de variables se restauran desde configuracion versionada sin copiar secretos al repositorio.
- Cambios de auth, CORS, Supabase, Resend o Turnstile se revierten al ultimo conjunto validado.
- Cambios de monetizacion se despliegan con capacidad de desactivar checkout sin alterar pagos ya confirmados.
- Migraciones o cambios de datos requieren rollback no destructivo y backup verificado.
- Si el rollback no es seguro, la decision automatica es `NO-GO`.

## 13. Cierre

| Campo | Valor |
| --- | --- |
| Resultado | TBD |
| Decision Go/No-Go | TBD |
| Items DONE | TBD |
| Items pendientes | TBD |
| Bugs abiertos | TBD |
| Riesgos aceptados | TBD |
| Evidencia de QA | TBD |
