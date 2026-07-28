# InmoScore - Roadmap

## Fase 1: Preproduccion

Objetivo: cerrar seguridad, legalidad, flujos criticos y despliegue productivo controlado.

Alcance:

- Auditoria de busqueda.
- Auditoria de reportes legales.
- Auditoria y hardening de autenticacion.
- Turnstile en registro, login y reset password.
- Resend como proveedor oficial de email transaccional.
- Trazabilidad legal en reportes.
- Creditos de busqueda con idempotencia.
- Documentacion tecnica y operacional en `docs/`.
- Checklist de produccion.

Criterio de salida:

- Reset password validado en produccion.
- Frontend y backend compilando.
- Variables productivas configuradas.
- Supabase redirects, Resend y Turnstile verificados.

## Fase 2: Produccion beta

Objetivo: operar con usuarios reales limitados y monitoreo cercano.

Alcance:

- Despliegue frontend en Vercel.
- Despliegue backend en Railway o alternativa.
- Monitoreo manual de errores, auth, reportes y pagos.
- Validacion de flujos legales con casos reales controlados.
- Ajustes de UX en dashboard, reportes, busqueda y administracion.
- Procedimiento de soporte para disputas, datos y revision humana.

Criterio de salida:

- Operacion estable con cohortes beta.
- Incidentes criticos resueltos.
- Evidencia de uso real sin regresiones de seguridad.

## Fase 3: Produccion publica

Objetivo: abrir el producto al mercado con procesos operativos repetibles.

Alcance:

- Hardening adicional de rate limits y monitoreo.
- Politicas publicas finales.
- Flujos de onboarding y pagos estabilizados.
- Panel administrativo operativo.
- Procedimiento formal de backup, incidentes y cambios.
- Metricas de activacion, busqueda, reportes y retencion.

Criterio de salida:

- Plataforma lista para crecimiento sin supervision diaria intensiva.
- Soporte y auditoria con SLA interno.

## Fase 4: Enterprise SaaS

Objetivo: evolucionar a plataforma multi-tenant robusta para organizaciones grandes.

Alcance:

- Multi-tenant avanzado por organizacion.
- Roles y permisos granulares.
- Auditoria exportable.
- Integraciones con sistemas externos.
- Contratos enterprise, SLA y controles de cumplimiento ampliados.
- Observabilidad formal, alertas y reportes ejecutivos.

Criterio de salida:

- Capacidad de atender clientes enterprise con aislamiento, soporte y cumplimiento documentado.
