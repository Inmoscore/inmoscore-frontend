# InmoScore - Project Charter

## Vision

Construir la infraestructura de confianza para decisiones arrendaticias en Colombia, permitiendo consultar, reportar y auditar historial inmobiliario de forma segura, legalmente trazable y operacionalmente escalable.

## Objetivo del producto

InmoScore debe ayudar a inmobiliarias, arrendadores, administradores y equipos legales a reducir riesgo operativo al evaluar potenciales inquilinos, registrar historial arrendaticio y gestionar evidencia con criterios de cumplimiento, seguridad y transparencia.

## Usuarios objetivo

- Inmobiliarias y administradores de propiedades.
- Arrendadores independientes.
- Equipos legales o de cartera.
- Administradores internos de InmoScore.
- Titulares de datos que solicitan acceso, rectificacion, disputa o revision humana.

## Principios del producto

- Legalidad primero: todo dato sensible debe tener base legal, origen y trazabilidad.
- Seguridad por defecto: secretos, tokens, documentos y PII se tratan como activos criticos.
- No romper scoring: el motor de score debe conservar estabilidad, explicabilidad y consistencia.
- Auditoria best-effort: los eventos relevantes se registran sin impedir innecesariamente el flujo principal si el log falla de forma no critica.
- Idempotencia en operaciones economicas: creditos, pagos y webhooks no deben duplicar efectos.
- Experiencia sobria: interfaces claras, orientadas a trabajo y decisiones.

## Restricciones

- No exponer `service_role` ni secretos en frontend.
- No registrar datos sensibles o secretos en logs.
- No tocar autenticacion sin pruebas funcionales.
- Las migraciones deben ser idempotentes.
- Los flujos legales deben conservar evidencia y trazabilidad.
- El producto debe poder desplegarse con frontend en Vercel y backend Express separado.

## Criterios de exito

- Registro, login y reset password funcionan en produccion.
- Busquedas descuentan creditos una sola vez y dejan auditoria.
- Reportes incluyen evidencia, estado, revision y trazabilidad.
- Administracion puede auditar usuarios, reportes, solicitudes y pagos.
- Build TypeScript pasa en frontend y backend.
- No hay secretos expuestos en cliente, logs o repositorio.
- Documentacion `docs/` refleja el estado real del proyecto.
