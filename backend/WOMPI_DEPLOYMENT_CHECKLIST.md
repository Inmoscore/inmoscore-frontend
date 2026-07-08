# Wompi Deployment Checklist - InmoScore

Runbook tecnico-operativo para desplegar y validar pagos Wompi sin depender de memoria tribal. Este documento cubre el flujo completo: checkout, webhook, activacion de plan, auditoria admin, verificacion manual y reconciliacion segura.

## 0. Principios

- No desplegar pagos sin migraciones aplicadas y verificadas.
- No confiar solo en `reference`; para decisiones operativas usar tambien `wompi_transaction_id`, estado consultado contra Wompi, monto, moneda y plan esperado.
- No exponer secretos, tokens, payloads completos ni datos personales en capturas, tickets o queries compartidas.
- No activar manualmente un plan sin dejar traza en `plan_change_logs`.
- Todo caso `APPROVED` debe terminar con usuario actualizado, pago actualizado y log operacional.

## 1. Orden Correcto De Migraciones

Aplicar en el ambiente objetivo, en este orden:

1. `migration_user_plans.sql`
2. `migration_wompi_payments.sql`
3. `migration_wompi_webhook_processing.sql`
4. `migration_plan_change_logs.sql`
5. `migration_plan_change_logs_operational_trace.sql`

Notas:

- `migration_user_plans.sql` prepara `users.plan_type`, `daily_search_limit` y compatibilidad con planes.
- `migration_wompi_payments.sql` crea `wompi_payments` y campos de proveedor en `users`.
- `migration_wompi_webhook_processing.sql` agrega `processed_at`, `webhook_payload` e indice unico parcial para idempotencia por transaccion procesada.
- `migration_plan_change_logs.sql` debe existir antes de la traza operacional.
- `migration_plan_change_logs_operational_trace.sql` conecta logs con pagos, referencia, proveedor y metadata.

Validacion post-migracion:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('users', 'wompi_payments', 'plan_change_logs')
order by table_name;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wompi_payments'
  and column_name in ('processed_at', 'webhook_payload', 'wompi_transaction_id')
order by column_name;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'plan_change_logs'
  and column_name in ('payment_id', 'payment_reference', 'payment_provider', 'metadata')
order by column_name;
```

## 2. Variables De Entorno Requeridas

Backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `FRONTEND_URL`
- `WOMPI_PUBLIC_KEY`
- `WOMPI_PRIVATE_KEY`
- `WOMPI_INTEGRITY_SECRET`
- `WOMPI_EVENTS_SECRET`

Frontend:

- `NEXT_PUBLIC_API_URL`

Verificaciones:

- Las llaves Wompi deben corresponder al mismo ambiente: sandbox con sandbox, produccion con produccion.
- `FRONTEND_URL` debe apuntar al dominio del frontend del ambiente para redirects de checkout.
- `NEXT_PUBLIC_API_URL` debe apuntar al backend publico del mismo ambiente.
- No commitear `.env` con valores reales. Si un secreto real quedo expuesto en repositorio remoto, rotarlo antes de produccion.

## 3. Configuracion Del Webhook En Wompi

Endpoint:

```text
POST https://<backend-public-host>/api/wompi/webhook
```

Eventos requeridos:

- Transacciones aprobadas.
- Transacciones rechazadas, fallidas o con error, si Wompi permite seleccion granular.

Checklist Wompi:

- URL publica usa HTTPS.
- El secreto de eventos configurado en Wompi coincide con `WOMPI_EVENTS_SECRET`.
- El webhook apunta al backend, no al frontend.
- El ambiente Wompi coincide con las llaves del backend.
- El endpoint responde 2xx para eventos validos.
- El endpoint rechaza firma invalida con 400.

## 4. Pruebas Obligatorias En Staging/Local Con Ngrok

Preparacion local:

1. Backend local con variables Wompi sandbox.
2. Frontend local con `NEXT_PUBLIC_API_URL` apuntando al backend local o al tunel.
3. Exponer backend con ngrok:

```powershell
ngrok http 4000
```

4. Configurar en Wompi el webhook:

```text
https://<ngrok-host>/api/wompi/webhook
```

5. Confirmar que el backend recibe requests sin errores de CORS, proxy o body parsing.

Pruebas minimas:

- Crear checkout desde `/upgrade` para plan Basic.
- Crear checkout desde `/upgrade` para plan Pro.
- Completar pago aprobado en sandbox.
- Forzar o simular estados no aprobados si el sandbox lo permite.
- Reenviar el mismo webhook para validar idempotencia.
- Enviar webhook con firma invalida y confirmar rechazo.
- Intentar webhook con `reference` inexistente y confirmar que no activa plan.
- Usar `/admin > Pagos` para ver estado.
- Usar verificacion manual contra Wompi.
- Usar reconciliacion manual solo en un pago aprobado y verificable.

## 5. Casos Esperados

### APPROVED Basic

Resultado esperado:

- `wompi_payments.status = 'approved'`.
- `wompi_payments.wompi_status = 'APPROVED'`.
- `wompi_payments.wompi_transaction_id` poblado.
- `wompi_payments.processed_at` poblado.
- `users.plan_type = 'basic'`.
- `users.daily_search_limit = 8`.
- `users.last_payment_provider = 'wompi'`.
- Existe log en `plan_change_logs` con `reason = 'wompi_webhook_auto_activation'`.

### APPROVED Pro

Resultado esperado:

- `wompi_payments.status = 'approved'`.
- `users.plan_type = 'pro'`.
- `users.daily_search_limit = 30`.
- Existe log operacional con `payment_provider = 'wompi'`, `payment_id` y `payment_reference`.

### Webhook Duplicado

Resultado esperado:

- No duplica activacion.
- No duplica cambio de plan para la misma transaccion procesada.
- Respuesta 2xx o manejo controlado para evitar reintentos infinitos.
- El indice unico parcial por `wompi_transaction_id` procesado protege idempotencia.

### DECLINED / FAILED / ERROR

Resultado esperado:

- Pago queda en estado no aprobado: `declined`, `failed` o `error`.
- `users.plan_type` no cambia por ese evento.
- No se crea log de activacion de plan.
- Admin puede ver el pago y su estado.

### Firma Invalida

Resultado esperado:

- Webhook responde 400.
- No se actualiza `wompi_payments`.
- No se actualiza `users`.
- No se crea `plan_change_logs`.

### Reference Inexistente

Resultado esperado:

- Webhook no activa ningun plan.
- Se registra evento controlado en logs de backend.
- No se inserta pago fantasma sin proceso de checkout previo.

### Verificacion Admin

Resultado esperado:

- Solo disponible para admin autenticado.
- Consulta Wompi por `wompi_transaction_id`.
- Actualiza estado actual de Wompi en el registro si aplica.
- Si el pago no tiene `wompi_transaction_id`, muestra que no se puede verificar por ID todavia.
- No activa plan por si sola si la verificacion no esta respaldada por estado aprobado y flujo permitido.

### Reconciliacion Admin

Resultado esperado:

- Solo disponible para admin autenticado.
- Requiere `wompi_transaction_id`.
- Consulta Wompi antes de activar.
- Activa solo si Wompi confirma `APPROVED` y los datos coinciden.
- Actualiza `wompi_payments`, `users` y `plan_change_logs`.
- Usa `reason = 'wompi_admin_manual_reconcile'`.

## 6. Queries SQL Seguras

Estas consultas evitan mostrar payloads crudos, tokens o datos personales completos. Ejecutarlas en modo lectura salvo que el rollback haya sido aprobado.

### Pagos Recientes

```sql
select
  id,
  left(reference, 12) || '...' as reference_masked,
  plan_type,
  amount_in_cents,
  currency,
  status,
  wompi_status,
  case when wompi_transaction_id is null then false else true end as has_transaction_id,
  processed_at is not null as processed,
  created_at,
  updated_at
from wompi_payments
order by created_at desc
limit 25;
```

### Pago Por Referencia Enmascarada

```sql
select
  id,
  left(reference, 12) || '...' as reference_masked,
  plan_type,
  amount_in_cents,
  currency,
  status,
  wompi_status,
  case when wompi_transaction_id is null then false else true end as has_transaction_id,
  processed_at,
  created_at,
  updated_at
from wompi_payments
where reference = '<reference-completa>'
limit 1;
```

### Usuarios Con Planes Activos Recientes

```sql
select
  id,
  left(coalesce(email, ''), 2) || '***' || substring(coalesce(email, '') from position('@' in coalesce(email, ''))) as email_masked,
  tipo_usuario,
  plan_type,
  daily_search_limit,
  searches_used_today,
  last_payment_provider
from users
where plan_type in ('basic', 'pro')
order by id desc
limit 25;
```

### Trazabilidad De Cambios De Plan

```sql
select
  id,
  target_user_id,
  previous_plan_type,
  new_plan_type,
  previous_daily_search_limit,
  new_daily_search_limit,
  reason,
  payment_provider,
  case when payment_id is null then false else true end as has_payment_id,
  case when payment_reference is null then null else left(payment_reference, 12) || '...' end as payment_reference_masked,
  created_at
from plan_change_logs
where reason in ('wompi_webhook_auto_activation', 'wompi_admin_manual_reconcile')
order by created_at desc
limit 50;
```

### Integridad Pago Usuario Log

```sql
select
  wp.id as payment_id,
  left(wp.reference, 12) || '...' as reference_masked,
  wp.plan_type as paid_plan,
  wp.status as payment_status,
  wp.wompi_status,
  wp.processed_at,
  u.id as user_id,
  u.plan_type as current_user_plan,
  u.daily_search_limit,
  pcl.reason,
  pcl.created_at as log_created_at
from wompi_payments wp
left join users u on u.id = wp.user_id
left join plan_change_logs pcl on pcl.payment_id = wp.id
where wp.created_at >= now() - interval '7 days'
order by wp.created_at desc
limit 50;
```

## 7. Checklist De UI

### `/upgrade`

- Usuario no autenticado recibe mensaje seguro para iniciar sesion.
- Usuario autenticado ve planes Free, Basic, Pro y Empresa.
- Boton Basic abre Wompi WidgetCheckout.
- Boton Pro abre Wompi WidgetCheckout.
- Monto, moneda, referencia y firma llegan completos al widget.
- Resultado visual no expone secretos ni payload completo.

### `/admin > Pagos`

- Admin puede filtrar por estado, plan, referencia y email.
- Se listan pagos recientes con estado interno y estado Wompi.
- Pagos sin `wompi_transaction_id` no permiten reconciliacion por ID.
- Verificacion manual muestra resultado claro y no filtra datos sensibles.
- Reconciliacion manual pide confirmacion antes de actuar.

### `/admin > Historial`

- Cambios por webhook aparecen con `wompi_webhook_auto_activation`.
- Cambios por reconciliacion aparecen con `wompi_admin_manual_reconcile`.
- Se observan plan anterior, plan nuevo, limites anteriores/nuevos y proveedor.
- La metadata se usa para auditoria, no como fuente unica de verdad.

### `/buscar` Despues De Upgrade

- Basic refleja limite diario esperado.
- Pro refleja limite diario esperado.
- El contador de busquedas restantes se comporta segun el plan actualizado.
- Si el usuario ya estaba en sesion, considerar recargar o volver a consultar backend para ver plan actualizado.

## 8. Riesgos Conocidos

- `EPERM` sandbox Next: builds o procesos de Next pueden fallar por permisos en `.next` o archivos bloqueados. Cerrar dev server, limpiar solo artefactos generados si esta aprobado y reintentar.
- `next-env.d.ts` puede cambiar despues de `next build`, por ejemplo entre `.next/dev/types/routes.d.ts` y `.next/types/routes.d.ts`. No dejarlo como cambio final si el build lo modifico automaticamente.
- Pagos sin `wompi_transaction_id` no son reconciliables por ID. No forzar activacion basada solo en referencia.
- No confiar solo en `reference`: validar transaccion contra Wompi, monto, moneda, estado y plan.
- Reintentos de webhook pueden llegar duplicados o fuera de orden. La idempotencia debe mantenerse.
- Ambientes cruzados sandbox/produccion pueden producir firmas invalidas o transacciones imposibles de verificar.
- Logs con payloads completos pueden contener datos sensibles; limitar acceso y retencion.

## 9. Criterios De Rollback

Rollback funcional inmediato si ocurre cualquiera de estos puntos:

- Un pago `DECLINED`, `FAILED` o `ERROR` activa un plan.
- Un webhook con firma invalida modifica datos.
- Un webhook duplicado genera multiples activaciones para la misma transaccion.
- Basic o Pro asignan limites incorrectos.
- Admin puede reconciliar sin `wompi_transaction_id` o sin confirmacion de Wompi.
- Se detecta exposicion de secretos en logs, UI, commits o tickets.
- El checkout cobra un monto distinto al plan seleccionado.

Acciones de rollback:

1. Deshabilitar temporalmente el webhook en Wompi o apuntarlo a un endpoint de mantenimiento.
2. Pausar CTA de pago si el frontend ya esta en produccion.
3. Preservar registros para auditoria; no borrar filas sin respaldo.
4. Revertir deploy de backend/frontend al ultimo release estable.
5. Corregir manualmente planes solo con aprobacion operacional y registro en `plan_change_logs`.
6. Rotar secretos si hubo exposicion.

## 10. Criterios De Listo Para Produccion

Produccion esta lista cuando:

- Todas las migraciones requeridas estan aplicadas en el orden correcto.
- Variables de entorno estan configuradas, rotadas y corresponden al ambiente correcto.
- Webhook Wompi usa HTTPS y secreto de eventos correcto.
- `APPROVED basic` y `APPROVED pro` pasan de punta a punta.
- Estados no aprobados no activan planes.
- Firma invalida y referencia inexistente no modifican datos.
- Webhook duplicado es idempotente.
- Verificacion admin consulta Wompi por ID y maneja pagos sin ID.
- Reconciliacion admin activa solo con confirmacion `APPROVED` desde Wompi.
- `/upgrade`, `/admin > Pagos`, `/admin > Historial` y `/buscar` fueron validados.
- Queries de auditoria muestran consistencia entre `wompi_payments`, `users` y `plan_change_logs`.
- No hay secretos en repositorio remoto, logs compartidos ni capturas.
- Existe responsable operativo para revisar pagos fallidos y reconciliaciones.
- Hay plan de rollback comunicado antes de habilitar pagos reales.
