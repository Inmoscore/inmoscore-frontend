# InmoScore - Engineering Handbook

## Reglas no negociables

- No romper scoring.
- No tocar autenticacion sin pruebas.
- Migraciones siempre idempotentes.
- `npm run build` y TypeScript son obligatorios antes de cerrar cambios funcionales.
- No logs con secretos, tokens, passwords, API keys o datos sensibles innecesarios.
- No usar `service_role` en frontend.

## Desarrollo frontend

- Mantener consistencia con Next.js 16 y React 19.
- Revisar `node_modules/next/dist/docs/` antes de tocar APIs especificas de Next.js.
- Usar componentes existentes cuando sea razonable.
- Mantener flujos de auth claros y verificables.
- No introducir secretos en variables `NEXT_PUBLIC_*`.

## Desarrollo backend

- Validar entradas con Zod, express-validator o patron existente.
- Mantener permisos y scopes antes de ejecutar logica sensible.
- Registrar eventos relevantes con auditoria best-effort cuando aplique.
- Usar rate limits en superficies publicas o abusables.
- No mezclar logica de scoring con rutas no relacionadas.

## Base de datos y migraciones

- Usar `create table if not exists`, `add column if not exists` y `drop constraint if exists` cuando aplique.
- No borrar columnas o datos sin plan de migracion y respaldo.
- Mantener nombres consistentes y prefijo `public.` cuando el archivo existente lo usa.
- Documentar nuevas tablas en `08_DATABASE.md`.

## Seguridad

- Turnstile obligatorio en registro, login y reset password.
- JWT y sesiones deben validarse server-side.
- Cualquier operacion admin debe exigir autenticacion y permisos.
- Nunca exponer respuestas que permitan enumeracion de usuarios.
- Proteger documentos con URLs firmadas y logs de acceso.

## Definition of Done

Para cambios funcionales:

- Build frontend pasa si se toca frontend.
- Build backend pasa si se toca backend.
- No hay secretos en logs o diffs.
- Flujos criticos probados manualmente.
- Documentacion actualizada si cambia arquitectura, API, seguridad, DB o despliegue.

Para cambios de documentacion:

- Archivos Markdown creados o actualizados.
- Sin cambios funcionales accidentales.
- Contenido consistente con estado actual del repo.
