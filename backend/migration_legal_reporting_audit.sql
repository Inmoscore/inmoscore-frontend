create extension if not exists pgcrypto;

create table if not exists public.legal_report_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  report_id uuid null,
  admin_action_id uuid null,
  actor_user_id uuid null,
  actor_role text null,
  event_type text not null,
  event_status text not null,
  report_status_before text null,
  report_status_after text null,
  review_status_before text null,
  review_status_after text null,
  subject_document_number text null,
  subject_document_type text null,
  report_type text null,
  legal_basis text null,
  legal_version_id uuid null,
  evidence_count integer null,
  evidence_hashes jsonb not null default '[]'::jsonb,
  ip_address text null,
  user_agent text null,
  request_id text null,
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.legal_report_audit_logs
  add column if not exists tenant_id uuid null,
  add column if not exists report_id uuid null,
  add column if not exists admin_action_id uuid null,
  add column if not exists actor_user_id uuid null,
  add column if not exists actor_role text null,
  add column if not exists event_type text,
  add column if not exists event_status text,
  add column if not exists report_status_before text null,
  add column if not exists report_status_after text null,
  add column if not exists review_status_before text null,
  add column if not exists review_status_after text null,
  add column if not exists subject_document_number text null,
  add column if not exists subject_document_type text null,
  add column if not exists report_type text null,
  add column if not exists legal_basis text null,
  add column if not exists legal_version_id uuid null,
  add column if not exists evidence_count integer null,
  add column if not exists evidence_hashes jsonb not null default '[]'::jsonb,
  add column if not exists ip_address text null,
  add column if not exists user_agent text null,
  add column if not exists request_id text null,
  add column if not exists error_code text null,
  add column if not exists error_message text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

update public.legal_report_audit_logs
set
  event_type = coalesce(event_type, 'unknown'),
  event_status = coalesce(event_status, 'unknown'),
  evidence_hashes = coalesce(evidence_hashes, '[]'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now());

alter table public.legal_report_audit_logs
  alter column id set default gen_random_uuid(),
  alter column event_type set not null,
  alter column event_status set not null,
  alter column evidence_hashes set default '[]'::jsonb,
  alter column evidence_hashes set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_legal_report_audit_logs_created_at_desc
  on public.legal_report_audit_logs (created_at desc);

create index if not exists idx_legal_report_audit_logs_tenant_id
  on public.legal_report_audit_logs (tenant_id);

create index if not exists idx_legal_report_audit_logs_report_id
  on public.legal_report_audit_logs (report_id);

create index if not exists idx_legal_report_audit_logs_admin_action_id
  on public.legal_report_audit_logs (admin_action_id);

create index if not exists idx_legal_report_audit_logs_actor_user_id
  on public.legal_report_audit_logs (actor_user_id);

create index if not exists idx_legal_report_audit_logs_event_type
  on public.legal_report_audit_logs (event_type);

create index if not exists idx_legal_report_audit_logs_event_status
  on public.legal_report_audit_logs (event_status);

create index if not exists idx_legal_report_audit_logs_subject_document_number
  on public.legal_report_audit_logs (subject_document_number);
