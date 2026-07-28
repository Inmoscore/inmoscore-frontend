# InmoScore - Master Context

## Resumen ejecutivo

InmoScore es una plataforma para evaluar, consultar y reportar historial arrendaticio con trazabilidad legal, controles de seguridad y flujos de cumplimiento para Colombia. El producto combina busqueda de inquilinos, scoring, reportes verificados, gestion de documentos, auditoria administrativa, solicitudes legales y controles antifraude.

Esta carpeta `docs/` es la fuente oficial de verdad del proyecto. Cualquier cambio relevante de arquitectura, seguridad, roadmap, despliegue, base de datos o decisiones tecnicas debe reflejarse aqui.

## Estado actual

El proyecto se encuentra en etapa de preproduccion avanzada. Los sprints de auditoria de busqueda, reportes legales y autenticacion ya fueron completados. El flujo de reset password fue validado de extremo a extremo en produccion el 2026-07-24.

## Stack actual

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, lucide-react.
- Backend: Express 4, TypeScript, Node.js, Zod, express-validator, helmet, rate limiting.
- Base de datos: Supabase sobre PostgreSQL.
- Autenticacion: Supabase Auth, JWT de backend, Turnstile en flujos sensibles.
- Email transaccional: Resend.
- Pagos: Wompi y Stripe segun modulo.
- Hosting frontend: Vercel.
- Hosting backend: Railway o alternativa compatible con Node/Express.

## Modulos implementados

- Autenticacion: registro, login, verificacion, reset password, cambio de password y auditoria.
- Busqueda de inquilinos: consulta por cedula, consumo de creditos y logs de busqueda.
- Scoring: motor dedicado en `backend/src/scoring`.
- Reportes: envio de reportes, evidencia, revision, notificacion y trazabilidad legal.
- Gestion legal: documentos activos, aceptaciones, disputas, solicitudes de datos, revision humana e identidad.
- Administracion: usuarios, planes, MFA, reportes, pagos, metricas, inventario de datos y auditoria.
- Documentos seguros: intentos de carga, confirmacion, acceso y lectura firmada.
- Billing: rutas de facturacion y webhooks de pago.

## Sprints completados

- Sprint 1 Search Audit: completado.
- Sprint 2 Legal Reporting Audit: completado.
- Sprint 3A Authentication Audit: completado.

## Sprint actual

- Sprint 3B Authentication Hardening: recovery productivo validado; permanecen pendientes controles no relacionados de cierre de release.
- Reset password: TokenHash, password nueva/anterior, enlace de un solo uso, sincronizacion y redirect final validados.

## Siguiente sprint

- Sprint 4 Deploy Production: preparacion, verificacion y despliegue productivo de frontend, backend, variables, dominios, Supabase, Resend y Turnstile.

## Pendientes inmediatos

- Ejecutar `npm run build` en frontend y backend antes de cierre.
- Revisar variables productivas sin exponer secretos.
- Confirmar redirects de Supabase Auth.
- Confirmar dominios autorizados de Turnstile.
- Confirmar remitente/dominio de Resend.
- Completar checklist funcional de produccion en `11_TESTING_QA.md`.
