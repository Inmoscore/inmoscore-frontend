create extension if not exists pgcrypto;

create table if not exists public.search_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  user_id uuid null,
  searched_document text not null,
  normalized_document text not null,
  search_status text not null,
  result_status text null,
  http_status integer null,
  credits_before integer null,
  credits_after integer null,
  plan_code text null,
  used_extra_credit boolean default false,
  ip_address text null,
  user_agent text null,
  request_id text null,
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.search_audit_logs
  add column if not exists tenant_id uuid null,
  add column if not exists user_id uuid null,
  add column if not exists searched_document text,
  add column if not exists normalized_document text,
  add column if not exists search_status text,
  add column if not exists result_status text null,
  add column if not exists http_status integer null,
  add column if not exists credits_before integer null,
  add column if not exists credits_after integer null,
  add column if not exists plan_code text null,
  add column if not exists used_extra_credit boolean default false,
  add column if not exists ip_address text null,
  add column if not exists user_agent text null,
  add column if not exists request_id text null,
  add column if not exists error_code text null,
  add column if not exists error_message text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

update public.search_audit_logs
set
  searched_document = coalesce(searched_document, ''),
  normalized_document = coalesce(normalized_document, ''),
  search_status = coalesce(search_status, 'unknown'),
  used_extra_credit = coalesce(used_extra_credit, false),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now());

alter table public.search_audit_logs
  alter column id set default gen_random_uuid(),
  alter column searched_document set not null,
  alter column normalized_document set not null,
  alter column search_status set not null,
  alter column used_extra_credit set default false,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_search_audit_logs_created_at_desc
  on public.search_audit_logs (created_at desc);

create index if not exists idx_search_audit_logs_user_id
  on public.search_audit_logs (user_id);

create index if not exists idx_search_audit_logs_tenant_id
  on public.search_audit_logs (tenant_id);

create index if not exists idx_search_audit_logs_normalized_document
  on public.search_audit_logs (normalized_document);

create index if not exists idx_search_audit_logs_search_status
  on public.search_audit_logs (search_status);

create index if not exists idx_search_audit_logs_result_status
  on public.search_audit_logs (result_status);
