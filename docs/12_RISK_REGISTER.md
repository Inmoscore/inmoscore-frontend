# InmoScore - Risk Register

## Riesgos tecnicos

| Riesgo | Impacto | Probabilidad | Mitigacion |
| --- | --- | --- | --- |
| Reset password falla en produccion por redirects | Alto | Baja | Mitigado con validacion productiva del flujo TokenHash, sincronizacion, enlace de un solo uso y redirect final el 2026-07-24. |
| Secretos expuestos en frontend | Critico | Media | Revisar variables `NEXT_PUBLIC_*`; prohibir service role en cliente. |
| Doble descuento de creditos | Alto | Media | Mantener idempotencia y auditoria de busquedas. |
| Webhooks duplicados aplican beneficios multiples | Alto | Media | Usar estado, IDs externos e idempotencia en pagos. |
| Regresion en scoring | Critico | Baja | No tocar scoring sin pruebas y revision dirigida. |
| Migracion no idempotente rompe produccion | Alto | Media | Validar migraciones en staging y usar patrones idempotentes. |

## Riesgos legales

| Riesgo | Impacto | Probabilidad | Mitigacion |
| --- | --- | --- | --- |
| Reporte sin trazabilidad suficiente | Critico | Media | Exigir evidencia, origen, base legal, revision y logs. |
| Titular no puede ejercer derechos | Alto | Media | Mantener flujos de solicitud de datos, disputa y revision humana. |
| Datos impactan scoring sin origen claro | Alto | Media | Registrar origen, base legal y estado de revision. |
| Exposicion indebida de PII | Critico | Media | Control de permisos, minimizacion de respuestas y logs seguros. |

## Riesgos operativos

| Riesgo | Impacto | Probabilidad | Mitigacion |
| --- | --- | --- | --- |
| Falta de monitoreo en beta | Alto | Media | Revisar logs, healthcheck y flujos criticos diariamente durante beta. |
| Proveedor de email no entrega | Alto | Media | Verificar dominio Resend y monitorear rebotes. |
| Turnstile mal configurado bloquea usuarios reales | Medio | Media | Configurar dominios correctos y probar local/staging/produccion. |
| Soporte no responde disputas a tiempo | Alto | Media | Definir SLA interno y bandeja admin para solicitudes legales. |

## Riesgos de seguridad

| Riesgo | Impacto | Probabilidad | Mitigacion |
| --- | --- | --- | --- |
| Ataques de fuerza bruta a login | Alto | Media | Turnstile, rate limiting, logs de seguridad y bloqueo progresivo si aplica. |
| Enumeracion de usuarios | Alto | Media | Mensajes genericos y auditoria de intentos. |
| Acceso no autorizado a documentos | Critico | Media | URLs firmadas, permisos backend y logs de acceso. |
| Uso indebido de rol admin | Critico | Baja | MFA admin, auditoria admin y minimo privilegio. |
