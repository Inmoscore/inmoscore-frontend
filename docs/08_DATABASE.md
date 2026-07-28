# InmoScore - Database

## Motor

La base de datos principal es PostgreSQL administrada por Supabase. Las migraciones viven actualmente en `backend/*.sql` y `backend/scripts/*.sql`.

## Tablas principales

Usuarios y organizaciones:

- `users`
- `organizations`
- `user_plans`
- `plan_change_logs`
- `upgrade_events`

Busqueda y scoring:

- `tenants`
- `tenant_rental_histories`
- `search_logs`
- `search_audit_logs`
- `user_search_credits`

Reportes y legal:

- `reports`
- `report_evidence_files`
- `report_review_logs`
- `report_subject_notices`
- `legal_report_audit_logs`
- `legal_cases`
- `legal_case_signals`
- `legal_document_versions`
- `user_legal_acceptances`

Derechos de titulares y cumplimiento:

- `data_subject_requests`
- `data_disputes`
- `human_review_requests`
- `identity_verification_documents`
- `data_inventory_items`

Documentos seguros:

- `secure_documents`
- `document_access_logs`

Seguridad y administracion:

- `security_events`
- `authentication_audit_logs`
- `admin_audit_logs`
- `admin_report_actions`

Pagos:

- `wompi_payments`

## Migraciones aplicadas o existentes

- `migration_search_logs.sql`
- `migration_search_audit_foundation.sql`
- `migration_user_search_credits.sql`
- `migration_legal_reporting_audit.sql`
- `migration_verified_reporting_foundation.sql`
- `migration_report_evidence_foundation.sql`
- `migration_report_review_workflow.sql`
- `migration_report_notice_contradiction.sql`
- `migration_report_submit_schema_alignment.sql`
- `migration_authentication_audit.sql`
- `migration_auth_security_foundation.sql`
- `migration_registration_antifraud_foundation.sql`
- `migration_secure_document_storage_foundation.sql`
- `migration_legal_compliance_foundation.sql`
- `migration_data_subject_requests.sql`
- `migration_data_disputes.sql`
- `migration_human_review_requests.sql`
- `migration_data_inventory.sql`
- `migration_data_origin_traceability.sql`
- `migration_phase1_organization_id.sql`
- `migration_phase2_multitenant_hardening.sql`
- `migration_admin_audit_trail.sql`
- `migration_admin_mfa_foundation.sql`
- `migration_admin_report_missing_review_tables.sql`
- `migration_admin_report_actions_rental_histories.sql`
- `migration_plan_change_logs.sql`
- `migration_plan_change_logs_operational_trace.sql`
- `migration_upgrade_events.sql`
- `migration_tenant_rental_histories.sql`
- `migration_tenant_rental_history_subject_identity.sql`
- `migration_wompi_payments.sql`
- `migration_wompi_webhook_processing.sql`
- `scripts/migration_security_events.sql`

## Reglas de migracion

- Toda migracion debe ser idempotente.
- Preferir `create table if not exists`.
- Preferir `alter table ... add column if not exists`.
- Usar `drop constraint if exists` antes de recrear constraints cuando sea necesario.
- No asumir entorno limpio.
- No borrar datos productivos sin plan, respaldo y aprobacion.
- Documentar nuevas tablas, columnas criticas y efectos en este archivo.
- Validar migraciones en entorno no productivo antes de produccion.

## Reglas de datos legales

- Datos que impactan scoring deben tener origen y base legal cuando aplique.
- Reportes deben conservar evidencia y estado de revision.
- Disputas, solicitudes de datos y revision humana deben mantener trazabilidad.
- Accesos a documentos sensibles deben quedar registrados.
