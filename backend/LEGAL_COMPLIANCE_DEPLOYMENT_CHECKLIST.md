# InmoScore Legal/Compliance Deployment Checklist

Runbook técnico-operativo para desplegar y validar la fase de datos personales, compliance y derechos de titulares.

Este documento no reemplaza revisión legal. Debe usarse como guía técnica para asegurar que migraciones, endpoints, UI y flujos administrativos estén disponibles antes de liberar la fase.

## 1. Orden Correcto De Migraciones

Aplicar en este orden, sobre la misma base de datos Supabase:

1. `migration_legal_compliance_foundation.sql`
2. `migration_data_subject_requests.sql`
3. `migration_data_inventory.sql`
4. `migration_data_origin_traceability.sql`
5. `migration_data_disputes.sql`
6. `migration_human_review_requests.sql`

No desplegar frontend/backend que dependan de estas tablas antes de aplicar las migraciones correspondientes.

### Fase 2B endurecida

Para instalaciones donde las migraciones legacy no fueron aplicadas, usar este orden y no mezclarlo con la ejecucion posterior de las cuatro migraciones legacy equivalentes:

1. Ejecutar `preflight_phase2b_legal_modules.sql` (solo lectura) y revisar objetos incompatibles y ACL.
2. Ejecutar `migration_phase2b_data_disputes_hardened.sql`.
3. Ejecutar `postcheck_phase2b_legal_modules.sql`; `data_disputes` debe quedar `VERIFIED` aunque otros modulos indiquen `NOT_INSTALLED`.
4. Ejecutar `migration_phase2b_human_review_requests_hardened.sql` y repetir el post-check.
5. Ejecutar `migration_phase2b_data_inventory_hardened.sql` y repetir el post-check. La tabla vacia es valida; no hay seeds.
6. Ejecutar `migration_phase2b_legal_case_signals_reconciliation.sql` y repetir el post-check.
7. Ejecutar `backend/preflight_legal_case_signals_acl_hardening.sql` (solo lectura) y confirmar que no existan blockers PostgreSQL.
8. Ejecutar `backend/migration_phase2b_legal_case_signals_acl_hardening.sql` para aplicar el hardening ACL/RLS posterior a la reconciliacion estructural.
9. Ejecutar `backend/postcheck_legal_case_signals_acl_hardening.sql` (solo lectura) y exigir `VERIFIED` sin failures.

Las tres tablas nuevas son backend-only: RLS `ENABLE + FORCE`, cero policies de cliente, `anon`/`authenticated` sin acceso y `service_role` con `SELECT, INSERT, UPDATE`, sin `DELETE`.

La reconciliacion estructural de `legal_case_signals` no recrea la tabla y se limita a agregar o validar los once campos de trazabilidad faltantes. El hardening ACL/RLS se aplica despues, mediante una migracion independiente. `backend/rollback_legal_case_signals_acl_hardening.sql` restaura el baseline anterior exclusivamente como mecanismo de contingencia; no es un paso normal del despliegue.

El hardening ACL/RLS de `public.legal_case_signals` fue ejecutado y validado en produccion con este estado final:

- RLS habilitado: `true`.
- FORCE RLS: `true`.
- Policies: `0`.
- `PUBLIC`, `anon` y `authenticated`: sin privilegios.
- `service_role`: `SELECT`, `INSERT` y `UPDATE`; sin `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` ni `MAINTAIN`.
- `service_role.rolbypassrls`: `true`.
- Post-check: `VERIFIED`, con `failures: []`.

Validacion funcional productiva realizada:

- Admin Senales judiciales carga correctamente.
- La busqueda por cedula funciona.
- Scoring funciona.
- Una senal existente pudo actualizarse administrativamente.
- Los contadores administrativos se actualizaron.
- Disputas carga correctamente en estado vacio.

No se probo una disputa real vinculada a `judicial_signal`; esa comprobacion especifica queda fuera de la evidencia anterior.

## 2. Que Valida Cada Migracion

`migration_legal_compliance_foundation.sql`
- Crea la base de documentos legales versionados.
- Permite registrar aceptaciones legales de usuarios.
- Debe dejar disponibles documentos activos para terminos, politica de privacidad y/o autorizaciones.

`migration_data_subject_requests.sql`
- Crea solicitudes de titulares para acceso, correccion, eliminacion, revocatoria, reclamos y otros.
- Debe soportar solicitudes publicas y autenticadas.
- Debe conservar trazabilidad minima: email, descripcion, estado, fechas, IP y user-agent si estan definidos.

`migration_data_inventory.sql`
- Crea inventario de datos personales.
- Debe permitir clasificar dominio, categoria, sensibilidad, origen, base legal, finalidad, retencion e impacto en scoring.
- Sirve como base tecnica para RNBD y auditoria interna.

`migration_data_origin_traceability.sql`
- Agrega trazabilidad de origen/base legal sobre reportes y senales judiciales.
- Debe habilitar campos como origen, fuente, base legal, consentimiento, fuente publica, impacto en score y estado de revision legal.

`migration_data_disputes.sql`
- Crea disputas de titulares sobre reportes, senales judiciales, score, resultados de busqueda u otros.
- Debe permitir marcar datos como disputados sin borrar ni recalcular automaticamente.
- Debe conservar evidencia, estado, notas administrativas y resumen de resolucion.

`migration_human_review_requests.sql`
- Crea solicitudes de revision humana sobre score o resultado automatizado.
- Debe permitir registrar motivo, score/clasificacion actuales opcionales, estado, notas y resumen de revision.
- No debe modificar scores ni decisiones actuales.

Las variantes `migration_phase2b_*_hardened.sql` conservan estos contratos y agregan validacion defensiva, transaccion, idempotencia, RLS y privilegio minimo. `migration_phase2b_legal_case_signals_reconciliation.sql` cubre unicamente los once campos faltantes confirmados, sin alterar otras tablas. Un esquema homonimo o parcialmente incompatible produce `INCOMPATIBLE_SCHEMA`/`PREREQUISITE_FAILURE` y rollback.

## 3. Variables Y Configuracion Requerida

Backend:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `PORT` opcional, por defecto `3001`

Frontend:
- `NEXT_PUBLIC_API_URL` apuntando al backend desplegado.

Configuracion operativa:
- CORS debe permitir el dominio frontend productivo.
- El usuario administrador debe existir con `tipo_usuario = 'admin'`.
- Las migraciones deben estar aplicadas antes de validar UI legal/admin.
- Los documentos legales activos deben existir en `legal_document_versions`.
- Revisar que el service role key solo viva en backend, nunca en frontend.

## 4. Pruebas Obligatorias

Registro y consentimientos:
- Registrar usuario desde `/register` aceptando documentos obligatorios.
- Validar que se crea el usuario.
- Validar que se crean filas en `user_legal_acceptances`.
- Validar que marketing es opcional: registro debe funcionar con marketing aceptado y no aceptado.

Documentos y aceptaciones:
- `GET /api/legal/documents/active` responde documentos activos.
- `POST /api/legal/acceptances` con token registra aceptacion legal.

Solicitudes y disputas:
- `POST /api/legal/data-requests` crea solicitud de datos personales.
- `GET /api/legal/data-requests/my` lista solicitudes del usuario autenticado.
- `POST /api/legal/disputes` crea disputa.
- `GET /api/legal/disputes/my` lista disputas del usuario autenticado.

Revision humana:
- `POST /api/legal/human-review-requests` crea solicitud publica o autenticada.
- `GET /api/legal/human-review-requests/my` lista solicitudes propias.

Admin:
- `GET /api/admin/data-requests` lista solicitudes de datos con filtros.
- `PATCH /api/admin/data-requests/:id` cambia estado/notas.
- `GET /api/admin/disputes` lista disputas con filtros.
- `PATCH /api/admin/disputes/:id` cambia estado/notas/resumen.
- `GET /api/admin/human-review-requests` lista solicitudes de revision humana.
- `PATCH /api/admin/human-review-requests/:id` cambia estado/notas/resumen.

Busqueda:
- `/api/tenants/search?cedula=...` mantiene `score`, `clasificacion` y `score_version`.
- La respuesta incluye `legal_flags`.
- La respuesta incluye `score_explanation`.
- `/buscar` muestra explicacion compacta.
- `/buscar` muestra link a revision humana cuando `score_explanation.human_review_recommended = true`.

## 5. SQL Seguro Para Validar

Usar consultas de solo lectura. No ejecutar `DELETE`, `UPDATE`, `TRUNCATE` ni cambios masivos durante validacion.

Documentos legales activos:

```sql
select
  id,
  document_type,
  version,
  title,
  effective_date,
  is_active,
  created_at
from legal_document_versions
order by document_type, effective_date desc;
```

Aceptaciones legales:

```sql
select
  id,
  user_id,
  document_type,
  document_version,
  acceptance_method,
  marketing_consent,
  accepted_at,
  created_at
from user_legal_acceptances
order by accepted_at desc
limit 50;
```

Solicitudes de datos personales:

```sql
select
  id,
  user_id,
  requester_email,
  requester_name,
  request_type,
  status,
  submitted_at,
  due_at,
  resolved_at,
  created_at
from data_subject_requests
order by submitted_at desc
limit 50;
```

Inventario de datos:

```sql
select
  id,
  data_domain,
  field_name,
  data_category,
  sensitivity_level,
  source_type,
  legal_basis,
  impacts_scoring,
  requires_consent,
  is_public_source,
  is_active
from data_inventory_items
order by data_domain, field_name;
```

Disputas:

```sql
select
  id,
  user_id,
  requester_email,
  requester_document_id,
  target_type,
  target_id,
  dispute_type,
  status,
  submitted_at,
  due_at,
  resolved_at,
  created_at
from data_disputes
order by submitted_at desc
limit 50;
```

Revision humana:

```sql
select
  id,
  user_id,
  requester_email,
  requester_document_id,
  cedula_consultada,
  current_score,
  current_classification,
  reason,
  status,
  resolved_at,
  created_at
from human_review_requests
order by created_at desc
limit 50;
```

Registros con `dispute_status`:

```sql
select
  id,
  tenant_id,
  tipo_problema,
  estado,
  dispute_status,
  legal_review_status,
  public_source_flag,
  impacts_scoring,
  created_by_admin_id,
  verified_by_admin_id,
  verified_at
from reports
where dispute_status is not null
order by fecha_reporte desc
limit 50;
```

Senales judiciales con trazabilidad legal:

```sql
select
  id,
  tenant_id,
  source,
  source_reference,
  source_type,
  legal_basis,
  public_source_flag,
  impacts_scoring,
  status,
  dispute_status,
  legal_review_status,
  relevance_for_rental_risk,
  score_impact_enabled,
  verified_at
from legal_case_signals
order by updated_at desc
limit 50;
```

Reportes con trazabilidad legal:

```sql
select
  id,
  tenant_id,
  tipo_problema,
  data_origin,
  source_type,
  source_name,
  source_reference,
  legal_basis,
  consent_required,
  consent_verified,
  public_source_flag,
  impacts_scoring,
  dispute_status,
  legal_review_status
from reports
order by fecha_reporte desc
limit 50;
```

## 6. Checklist UI

`/register`
- Muestra documentos legales obligatorios.
- Permite aceptar consentimientos obligatorios.
- Marketing se presenta como opcional.
- Link a solicitudes de datos.
- Link a disputas.
- Link a revision humana.

`/login`
- Link a solicitudes de datos.
- Link a disputas.
- Link a revision humana.

`/legal/solicitudes-datos`
- Formulario publico funciona.
- Muestra confirmacion con numero de solicitud.
- Enlaza a disputas y revision humana cuando aplica.

`/legal/disputas`
- Formulario publico funciona.
- Muestra confirmacion con numero de disputa.
- Enlaza a solicitudes de datos y revision humana.

`/legal/revision-humana`
- Formulario publico funciona.
- Permite nombre, email, documento opcional, cedula consultada opcional, score/clasificacion opcional, motivo y descripcion.
- Muestra confirmacion con numero de solicitud.
- No promete recalculo ni modificacion automatica.

`/buscar`
- Mantiene flujo de busqueda, rate limit y autenticacion.
- Muestra `legal_flags` cuando existen.
- Muestra `score_explanation`.
- Muestra texto de cautela: "Este resultado es una senal de apoyo para analisis de riesgo, no una decision automatica definitiva."
- Muestra link a revision humana si `human_review_recommended = true`.

`/admin`
- Tab de solicitudes de datos funciona.
- Tab de disputas funciona.
- Tab de revision humana funciona.
- Filtros funcionan.
- Cambios de estado/notas/resumen persisten.
- No hay acciones que borren datos o recalculen score automaticamente.

## 7. Riesgos Conocidos

- Migraciones no aplicadas antes del frontend: la UI puede cargar, pero los endpoints fallaran por tablas/columnas inexistentes.
- Columnas defensivas nullable: algunos campos legales pueden ser `null` para datos historicos o migraciones parciales.
- Dias calendario vs habiles: los vencimientos actuales son aproximaciones tecnicas; deben ajustarse a reglas legales colombianas antes de automatizar SLA final.
- Score no recalculado todavia por disputa: una disputa marca trazabilidad, pero no cambia `score_normalized`.
- Revision humana no modifica score todavia: registra gestion operativa, no cambia algoritmo ni clasificacion.
- No usar esto como reemplazo de abogado: requiere revision legal colombiana.
- `next-env.d.ts` puede ser modificado por `next build`; si ocurre, revertir el archivo antes de cerrar cambios.

## 8. Criterios De Rollback

Rollback tecnico recomendado si ocurre cualquiera de estos casos:
- Backend no compila despues de cambios accidentales.
- Frontend no compila despues de cambios accidentales.
- Endpoints criticos existentes fallan: auth, `/buscar`, Wompi, admin base, disputas existentes.
- Migracion falla parcialmente y deja tablas incompletas.
- UI productiva llama endpoints no disponibles por migraciones ausentes.
- Se detecta exposicion de datos sensibles no necesarios.
- Se detecta modificacion accidental de `score_normalized`, `classification`, pesos o calculadora de score.

Estrategia:
- Si solo fallo frontend: revertir deploy frontend y mantener backend estable.
- Si fallo backend: revertir deploy backend al artefacto anterior.
- Si fallo migracion antes de trafico real: revisar estado de tablas, indices y constraints; corregir con migracion nueva.
- Si fallo migracion con trafico real: no borrar datos. Crear migracion correctiva con respaldo/verificacion previa.
- Si `next-env.d.ts` fue modificado por build: revertir ese archivo.

## 9. Criterios De Listo Para Produccion

Tecnico:
- Todas las migraciones aplicadas en orden.
- Backend compila.
- Frontend compila.
- Variables de entorno configuradas.
- CORS productivo validado.
- Admin productivo disponible solo para usuarios `admin`.
- No hay `SELECT *` nuevo en rutas legales/admin nuevas.
- No se expone service role key al frontend.
- Busqueda mantiene score/clasificacion existentes.
- `legal_flags` y `score_explanation` aparecen sin romper compatibilidad hacia atras.
- Formularios publicos crean registros y devuelven IDs de seguimiento.

Operativo:
- Equipo sabe como revisar solicitudes, disputas y revision humana en admin.
- Existe responsable para responder solicitudes de titulares.
- Existe criterio interno para pasar estados a `resolved` o `rejected`.
- Existe canal de soporte para solicitudes incompletas.
- Logs no contienen secretos ni datos sensibles innecesarios.

Legal/compliance:
- Documentos legales activos cargados.
- Flujo de aceptacion legal probado.
- Politica de tratamiento y autorizaciones revisadas por abogado.
- Procedimiento interno para PQR/SIC definido.

## 10. Pendientes Legales No Tecnicos

- Revision por abogado colombiano.
- Politica de tratamiento de datos personales.
- Terminos y condiciones.
- Aviso de privacidad.
- Inscripcion RNBD cuando aplique.
- Procedimiento interno SIC/PQR.
- Contratos con encargados y proveedores que traten datos.
- Matriz de finalidades y bases legales por dato.
- Politica de retencion y eliminacion.
- Procedimiento formal de atencion de disputas y revision humana.
- Evaluacion de riesgos de decisiones automatizadas y explicabilidad.

## Validacion

Este cambio es solo documentacion Markdown y no requiere build.

Si por accidente se toca codigo, ejecutar:

```powershell
cd backend
npm.cmd run build
cd ..
npm.cmd run build
```

Si `next-env.d.ts` cambia por el build, revertirlo.
