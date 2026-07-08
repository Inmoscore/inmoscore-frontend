create extension if not exists pgcrypto;

create table if not exists public.search_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  cedula_consultada text not null,
  found boolean not null default false,
  score_normalized numeric(6,2),
  classification text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_logs_created_at
  on public.search_logs (created_at desc);

create index if not exists idx_search_logs_user_id
  on public.search_logs (user_id);

create index if not exists idx_search_logs_user_created_at
  on public.search_logs (user_id, created_at desc);

create index if not exists idx_search_logs_tenant_id
  on public.search_logs (tenant_id);

create index if not exists idx_search_logs_cedula
  on public.search_logs (cedula_consultada);
