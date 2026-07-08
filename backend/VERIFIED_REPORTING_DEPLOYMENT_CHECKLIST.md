# InmoScore Verified Reporting Deployment Checklist

Runbook tecnico-operativo para desplegar y validar el sistema de reportes verificados de InmoScore sin depender de memoria tribal.

Este documento no reemplaza revision legal externa. Debe usarse como guia tecnica para asegurar que identidad, evidencia, revision administrativa, notificacion, contradiccion y elegibilidad para scoring queden trazables antes de liberar el flujo.

## 0. Principios

- No consolidar informacion negativa para scoring sin identidad verificada, evidencia, declaracion legal, revision admin y trazabilidad de notificacion/contradiccion.
- No enviar correos/SMS desde este flujo todavia; la notificacion actual es una marca administrativa trazable.
- No recalcular score automaticamente durante la revision, notificacion o contradiccion.
- No usar metadata como reemplazo de almacenamiento seguro de documentos/evidencia.
- Ejecutar validaciones SQL en modo solo lectura.
- Mantener el service role key solo en backend.

## 1. Orden De Migraciones

Aplicar en este orden, sobre la misma base de datos Supabase:

1. `migration_verified_reporting_foundation.sql`
2. `migration_report_evidence_foundation.sql`
3. `migration_report_review_workflow.sql`
4. `migration_report_notice_contradiction.sql`

No desplegar backend/frontend que dependan de una migracion antes de aplicarla y validarla.

## 2. Que Valida Cada Migracion

`migration_verified_reporting_foundation.sql`
- Agrega la base de verificacion de identidad para usuarios reportantes.
- Debe permitir distinguir usuarios verificados, pendientes, rechazados o no iniciados.
- Crea o habilita tablas/campos para documentos de verificacion de identidad.
- Soporta que solo usuarios elegibles puedan iniciar reportes verificados.

`migration_report_evidence_foundation.sql`
- Agrega campos de evidencia obligatoria a `reports`.
- Crea `report_evidence_files`.
- Debe permitir conservar tipo de evidencia, nombre de archivo, storage path, hash/metadata y fecha de carga.
- Debe soportar que un reporte sin evidencia obligatoria no avance como reporte valido.

`migration_report_review_workflow.sql`
- Agrega estados de revision administrativa sobre reportes.
- Crea `report_review_logs`.
- Debe soportar `pending_verification`, `in_review`, `verified`, `rejected` y `needs_more_info`.
- Debe separar verificacion legal/admin de elegibilidad para scoring.
- Debe registrar cambios admin con estado previo, estado nuevo, elegibilidad previa/nueva y notas.

`migration_report_notice_contradiction.sql`
- Crea `report_subject_notices`.
- Agrega a `reports` campos de notificacion al titular y contradiccion.
- Debe soportar estados de notificacion: `pending`, `sent`, `failed`, `waived`, `not_required`.
- Debe soportar estados de contradiccion: `none`, `received`, `under_review`, `accepted`, `rejected`, `expired`.
- Debe permitir deadline de contradiccion y trazabilidad de eventos sin envio real de email/SMS.

## 3. Flujo Legal Completo

1. Usuario registrado
- El usuario existe en `users`.
- Tiene token valido para consumir endpoints autenticados.

2. Verificacion de identidad
- El usuario inicia verificacion desde `/legal/verificacion-identidad`.
- Se registran documentos o metadata operativa en `identity_verification_documents`.
- Admin revisa desde `/admin > Verificacion identidad`.
- El usuario queda con `identity_verification_status` aprobado/verificado antes de reportar.

3. Elegibilidad para reportar
- El backend valida que el usuario autenticado este verificado.
- Usuario no verificado no debe poder crear reportes verificados.

4. Evidencia obligatoria
- El reporte debe incluir evidencia.
- Cada evidencia debe quedar trazada en `report_evidence_files`.
- `reports.evidence_status` debe reflejar el estado operativo de evidencia.

5. Declaracion legal
- El usuario acepta declaracion legal antes de enviar.
- El reporte conserva `legal_declaration_accepted` y texto/version aplicable si existe.
- Sin declaracion legal, el backend debe rechazar el reporte.

6. Reporte `pending_verification`
- El reporte entra con `report_verification_status = 'pending_verification'`.
- El reporte debe entrar con `scoring_eligibility_status = 'not_eligible'`.
- No debe impactar scoring al crearse.

7. Revision admin
- Admin revisa evidencia, declaracion y contexto legal desde `/admin > Reportes`.
- Admin puede marcar en revision, pedir mas informacion, aprobar, rechazar o bloquear scoring.
- Aprobacion admin solo puede producir impacto futuro si tambien se resuelve notificacion/contradiccion.
- Rechazo admin debe tener motivo.

8. Notificacion al titular
- Admin marca notificacion enviada desde `/admin > Reportes`.
- Se registra fila en `report_subject_notices`.
- `reports.subject_notice_status` pasa a `sent`.
- `reports.contradiction_deadline` queda en `now + 10 dias calendario` inicialmente.
- No se envia email/SMS real en esta fase.

9. Contradiccion
- Si el titular contradice, admin registra contradiccion.
- `reports.contradiction_status` pasa a `received`.
- `reports.report_verification_status` vuelve a `in_review`.
- `reports.scoring_eligibility_status` pasa a `not_eligible`.
- Si admin acepta la contradiccion, el reporte queda rechazado o requiere mas informacion, y scoring queda bloqueado.
- Si admin rechaza la contradiccion, el reporte queda pendiente de decision admin posterior.
- Si vence el plazo, admin puede marcar contradiccion expirada segun criterio operativo/legal.

10. Elegibilidad para scoring
- Solo un reporte con `report_verification_status = 'verified'`, `scoring_eligibility_status = 'eligible'` y contradiccion resuelta puede impactar scoring futuro.
- Contradiccion resuelta significa notificacion eximida/no requerida, o contradiccion rechazada/expirada despues de oportunidad de contradiccion.
- No recalcular automaticamente durante este despliegue.

## 4. Pruebas Obligatorias

Ejecutar en staging o local con base de datos de prueba.

- Usuario no verificado no puede reportar.
- Usuario verificado si puede iniciar reporte.
- Reporte sin evidencia falla.
- Reporte sin declaracion legal falla.
- Reporte valido entra como `pending_verification`.
- Admin aprueba reporte.
- Admin rechaza reporte con motivo.
- Admin marca notificacion enviada.
- Contradiccion recibida bloquea scoring.
- Contradiccion aceptada bloquea scoring.
- Solo `verified` + `eligible` + contradiccion resuelta puede impactar scoring futuro.

Validaciones esperadas:

- No se crea reporte elegible al primer envio del usuario.
- No hay recalculo automatico de score al aprobar, notificar o registrar contradiccion.
- Todo cambio admin queda trazado en `report_review_logs` o `report_subject_notices`.
- Las respuestas de `/buscar` no deben incluir reportes no elegibles en el detalle que impacta scoring.

## 5. SQL Seguro Para Validar

Usar consultas de solo lectura. No ejecutar `DELETE`, `UPDATE`, `TRUNCATE`, `ALTER` ni cambios masivos durante validacion.

Usuarios y estado de verificacion:

```sql
select
  id,
  email,
  tipo_usuario,
  identity_verification_status,
  identity_verified_at,
  created_at
from users
order by created_at desc
limit 50;
```

Documentos de verificacion de identidad:

```sql
select
  id,
  user_id,
  document_type,
  storage_path,
  verification_status,
  reviewed_by_admin_id,
  reviewed_at,
  created_at
from identity_verification_documents
order by created_at desc
limit 50;
```

Reportes y estados criticos:

```sql
select
  id,
  tenant_id,
  reportado_por,
  estado,
  evidence_status,
  legal_declaration_accepted,
  report_verification_status,
  scoring_eligibility_status,
  subject_notice_required,
  subject_notice_status,
  contradiction_status,
  contradiction_deadline,
  fecha_reporte
from reports
order by fecha_reporte desc
limit 50;
```

Evidencias de reportes:

```sql
select
  id,
  report_id,
  uploaded_by_user_id,
  evidence_type,
  file_name,
  storage_path,
  mime_type,
  file_size,
  sha256_hash,
  legal_declaration_accepted,
  uploaded_at
from report_evidence_files
order by uploaded_at desc
limit 50;
```

Logs de revision admin:

```sql
select
  id,
  report_id,
  admin_id,
  previous_status,
  new_status,
  previous_scoring_eligibility_status,
  new_scoring_eligibility_status,
  notes,
  created_at
from report_review_logs
order by created_at desc
limit 50;
```

Notificacion y contradiccion:

```sql
select
  id,
  report_id,
  subject_document_number,
  subject_email,
  notice_status,
  notice_channel,
  notice_reference,
  notice_sent_at,
  contradiction_deadline,
  contradiction_received_at,
  contradiction_status,
  contradiction_summary,
  created_at,
  updated_at
from report_subject_notices
order by created_at desc
limit 50;
```

Reportes que no deben impactar scoring:

```sql
select
  id,
  estado,
  report_verification_status,
  scoring_eligibility_status,
  subject_notice_status,
  contradiction_status,
  contradiction_deadline
from reports
where scoring_eligibility_status <> 'eligible'
   or report_verification_status <> 'verified'
   or (
     coalesce(subject_notice_required, true) = true
     and coalesce(subject_notice_status, 'pending') not in ('waived', 'not_required')
     and coalesce(contradiction_status, 'none') not in ('rejected', 'expired')
   )
order by fecha_reporte desc
limit 100;
```

Reportes potencialmente elegibles para scoring futuro:

```sql
select
  id,
  estado,
  report_verification_status,
  scoring_eligibility_status,
  subject_notice_required,
  subject_notice_status,
  contradiction_status,
  contradiction_deadline
from reports
where estado = 'aprobado'
  and report_verification_status = 'verified'
  and scoring_eligibility_status = 'eligible'
  and (
    coalesce(subject_notice_required, true) = false
    or subject_notice_status in ('waived', 'not_required')
    or contradiction_status in ('rejected', 'expired')
  )
order by fecha_reporte desc
limit 100;
```

## 6. Checklist UI

`/legal/verificacion-identidad`
- Usuario autenticado puede iniciar o consultar su verificacion.
- La pantalla informa estado actual de verificacion.
- No expone rutas privadas de documentos como URLs publicas reutilizables.
- Maneja estados pendiente, aprobado/verificado y rechazado.

`/reportar`
- Usuario no verificado no puede enviar reporte.
- Usuario verificado puede iniciar reporte.
- Evidencia es obligatoria.
- Declaracion legal es obligatoria.
- Al enviar, el reporte queda pendiente de revision admin.
- La UI no promete publicacion inmediata ni impacto inmediato en score.

`/admin > Verificacion identidad`
- Solo admin puede acceder.
- Admin ve usuarios/documentos pendientes.
- Admin puede aprobar o rechazar con trazabilidad.
- Rechazos deben dejar notas o motivo operativo.

`/admin > Reportes`
- Solo admin puede acceder.
- Muestra evidencia, declaracion legal, estado de revision y elegibilidad de scoring.
- Permite aprobar, rechazar con motivo, solicitar mas informacion o bloquear scoring.
- Muestra estado de notificacion.
- Muestra deadline de contradiccion.
- Muestra estado de contradiccion.
- Permite marcar notificacion enviada.
- Permite registrar contradiccion.
- Permite aceptar contradiccion.
- Permite rechazar contradiccion.
- Permite eximir notificacion con nota.
- Muestra historial de revision y de notificacion/contradiccion.

`/buscar`
- Muestra advertencias legales cuando hay datos no elegibles, disputados o pendientes.
- No debe presentar reportes no elegibles como informacion negativa consolidada.
- Debe mantener explicacion del score y recomendacion de revision humana cuando aplique.

## 7. Riesgos Conocidos

- No hay OCR: la revision documental depende de inspeccion humana y metadatos.
- No hay biometria: la verificacion de identidad no prueba presencia o liveness.
- No hay envio real email/SMS: el estado de notificacion actual es administrativo/manual.
- Los archivos no deben ser publicos: documentos de identidad y evidencia requieren storage privado, politicas estrictas y URLs temporales.
- Metadata no reemplaza almacenamiento seguro: `storage_path`, hash o nombre de archivo no prueban custodia completa por si solos.
- Dias calendario vs habiles: el plazo inicial de contradiccion usa 10 dias calendario; validar con counsel si debe ser dias habiles u otro termino.
- No usar como reemplazo de abogado: decisiones de elegibilidad, exencion y aceptacion/rechazo de contradiccion requieren criterio legal.
- Los admins tienen alta sensibilidad operacional: acciones admin deben auditarse y protegerse con controles fuertes.
- La trazabilidad actual no es necesariamente inmutable si la base permite cambios directos.

## 8. Criterios De Rollback

Rollback funcional recomendado:

- Desactivar temporalmente en UI la creacion de nuevos reportes verificados si se detecta falla en identidad, evidencia o declaracion.
- Mantener busqueda usando solo reportes previamente elegibles y no afectados.
- No borrar datos de reportes, evidencia, logs o notificaciones.
- Marcar reportes dudosos como `scoring_eligibility_status = 'not_eligible'` mediante procedimiento controlado y auditado si counsel/operacion lo aprueba.
- Suspender aprobaciones admin si `report_review_logs` o `report_subject_notices` no registran trazabilidad.

Rollback tecnico:

- Revertir despliegue backend/frontend al release anterior si los endpoints fallan.
- No revertir migraciones en produccion salvo plan explicito de DBA, backup probado y ventana aprobada.
- Si una migracion quedo parcialmente aplicada, detener despliegue y validar esquema con `information_schema` antes de reintentar.
- Confirmar que `/buscar` no usa reportes en estados `not_eligible`, `blocked`, contradiccion `received` o revision pendiente.

Condiciones que obligan rollback o pausa:

- Usuario no verificado logra crear reporte.
- Reporte sin evidencia o sin declaracion legal se crea exitosamente.
- Reporte nuevo entra como `eligible`.
- Contradiccion recibida no bloquea scoring.
- Contradiccion aceptada no bloquea scoring.
- Admin puede aprobar sin trazabilidad minima.
- Archivos de identidad/evidencia quedan publicamente accesibles.

## 9. Criterios De Listo Para Produccion

- Migraciones aplicadas en orden y verificadas con SQL de solo lectura.
- Variables backend/frontend configuradas por ambiente.
- Usuario admin productivo creado y validado.
- Storage de documentos/evidencia revisado para no exponer archivos publicamente.
- Pruebas obligatorias ejecutadas y documentadas.
- `/reportar` bloquea usuarios no verificados.
- Reporte valido queda `pending_verification` y `not_eligible`.
- Admin puede aprobar/rechazar y se crean logs.
- Admin puede marcar notificacion enviada y se crea registro en `report_subject_notices`.
- Contradiccion recibida devuelve reporte a revision y bloquea scoring.
- Contradiccion aceptada bloquea scoring.
- Busqueda/scoring solo considera reportes `verified` + `eligible` + contradiccion resuelta.
- No hay envio real email/SMS activado accidentalmente.
- No hay recalculo automatico introducido por este flujo.
- Soporte/operacion entiende como pausar aprobaciones y como escalar casos legales.
- Counsel o asesor legal externo reviso el flujo antes de produccion si habra impacto real sobre titulares.

## 10. Pendientes Siguientes

- Storage privado real para documentos/evidencia.
- MFA admin.
- Audit trail inmutable.
- Notificacion real email/SMS.
- Politica de retencion.
- Revision legal externa.
- URLs temporales firmadas para acceso admin a evidencia.
- Controles de segregacion de funciones para admins.
- Alertas operativas para contradicciones cerca del deadline.
- Definicion legal de dias calendario vs dias habiles.

## 11. Validacion De Este Runbook

Este cambio es solo documentacion Markdown y no requiere build.

Si se toca codigo por accidente, ejecutar:

```powershell
cd backend
npm.cmd run build
cd ..
npm.cmd run build
```

Si Next modifica `next-env.d.ts` durante una validacion accidental, revertir ese archivo antes de cerrar el cambio.
