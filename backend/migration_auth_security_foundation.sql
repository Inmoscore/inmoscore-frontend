-- Authentication & Security Foundation.
-- Additive/idempotent migration for account verification and unified search-credit ledger metadata.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists auth_user_id uuid,
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_number text;

update public.users
set
  email_verified = coalesce(email_verified, false) or coalesce(email_verificado, false),
  email_verified_at = case
    when email_verified_at is null and coalesce(email_verificado, false) then fecha_registro
    else email_verified_at
  end
where coalesce(email_verificado, false) = true
   or email_verified is null;

create index if not exists idx_users_auth_user_id
  on public.users(auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_users_email_verified
  on public.users(email_verified, email_verified_at);

alter table public.user_search_credits
  add column if not exists source text,
  add column if not exists idempotency_key text;

update public.user_search_credits
set
  source = coalesce(
    source,
    nullif(metadata->>'source', ''),
    case
      when credit_type = 'rental_history_verified' then 'rental_history_verification'
      when credit_type = 'manual_admin_grant' then 'admin_manual'
      when credit_type = 'promo' then 'promo'
      else credit_type
    end
  ),
  idempotency_key = coalesce(
    idempotency_key,
    case
      when credit_type = 'rental_history_verified' and rental_history_id is not null
        then 'rental_history_verified:' || rental_history_id::text
      else null
    end
  )
where source is null
   or idempotency_key is null;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.user_search_credits'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%credit_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.user_search_credits drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.user_search_credits
  add constraint user_search_credits_credit_type_check
  check (
    credit_type in (
      'rental_history_verified',
      'manual_admin_grant',
      'promo',
      'registration_bonus',
      'email_verified_bonus',
      'phone_verified_bonus',
      'search_consumption'
    )
  ) not valid;

alter table public.user_search_credits
  validate constraint user_search_credits_credit_type_check;

create index if not exists idx_user_search_credits_source
  on public.user_search_credits(source);

create unique index if not exists uniq_user_search_credits_user_idempotency
  on public.user_search_credits(user_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  organization_id uuid,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz default now()
);

create index if not exists idx_security_events_org
  on public.security_events(organization_id);

create index if not exists idx_security_events_user
  on public.security_events(user_id);

create index if not exists idx_security_events_type
  on public.security_events(event_type);

create index if not exists idx_security_events_created
  on public.security_events(created_at);
