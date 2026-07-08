create extension if not exists pgcrypto;

create table if not exists public.authentication_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text null,
  event_type text not null,
  event_status text not null,
  failure_reason text null,
  ip_address text null,
  user_agent text null,
  request_id text null,
  created_at timestamptz not null default now()
);

alter table public.authentication_audit_logs
  add column if not exists user_id uuid null,
  add column if not exists email text null,
  add column if not exists event_type text,
  add column if not exists event_status text,
  add column if not exists failure_reason text null,
  add column if not exists ip_address text null,
  add column if not exists user_agent text null,
  add column if not exists request_id text null,
  add column if not exists created_at timestamptz not null default now();

update public.authentication_audit_logs
set
  event_type = coalesce(event_type, 'unknown'),
  event_status = coalesce(event_status, 'unknown'),
  created_at = coalesce(created_at, now());

alter table public.authentication_audit_logs
  alter column id set default gen_random_uuid(),
  alter column event_type set not null,
  alter column event_status set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_authentication_audit_logs_user_id
  on public.authentication_audit_logs (user_id);

create index if not exists idx_authentication_audit_logs_email
  on public.authentication_audit_logs (email);

create index if not exists idx_authentication_audit_logs_event_type
  on public.authentication_audit_logs (event_type);

create index if not exists idx_authentication_audit_logs_created_at_desc
  on public.authentication_audit_logs (created_at desc);
