-- Registration anti-fraud foundation.
-- Additive/idempotent migration: no destructive data changes.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists phone_number text,
  add column if not exists auth_user_id uuid,
  add column if not exists registration_ip_address text,
  add column if not exists registration_user_agent text,
  add column if not exists registration_suspicion_status text not null default 'clear',
  add column if not exists registration_suspicion_reason text;

create index if not exists idx_users_registration_document_lookup
  on public.users(document_type, document_number)
  where document_number is not null;

create index if not exists idx_users_registration_phone_lookup
  on public.users(phone_number, fecha_registro)
  where phone_number is not null;

create index if not exists idx_users_registration_ip_address
  on public.users(registration_ip_address)
  where registration_ip_address is not null;

alter table public.user_search_credits
  add column if not exists source text,
  add column if not exists idempotency_key text;

update public.user_search_credits
set source = coalesce(source, nullif(metadata->>'source', ''), credit_type)
where source is null;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'uniq_user_search_credits_user_source_idempotency'
  )
  and not exists (
    select 1
    from (
      select user_id, source, idempotency_key
      from public.user_search_credits
      where source is not null
        and idempotency_key is not null
      group by user_id, source, idempotency_key
      having count(*) > 1
    ) duplicates
  ) then
    create unique index uniq_user_search_credits_user_source_idempotency
      on public.user_search_credits(user_id, source, idempotency_key)
      where source is not null
        and idempotency_key is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'uniq_user_search_credits_account_bonus_identity'
  )
  and not exists (
    select 1
    from (
      select source, idempotency_key
      from public.user_search_credits
      where source in ('registration', 'email_verification', 'phone_verification')
        and idempotency_key is not null
      group by source, idempotency_key
      having count(*) > 1
    ) duplicates
  ) then
    create unique index uniq_user_search_credits_account_bonus_identity
      on public.user_search_credits(source, idempotency_key)
      where source in ('registration', 'email_verification', 'phone_verification')
        and idempotency_key is not null;
  end if;
end $$;

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

create index if not exists idx_security_events_user
  on public.security_events(user_id);

create index if not exists idx_security_events_type
  on public.security_events(event_type);

create index if not exists idx_security_events_created
  on public.security_events(created_at);

create index if not exists idx_security_events_registration_antifraud
  on public.security_events(event_type, created_at desc)
  where event_type in (
    'duplicate_email_attempt',
    'duplicate_document_attempt',
    'duplicate_phone_attempt',
    'suspicious_registration_attempt',
    'registration_bonus_granted',
    'registration_bonus_denied'
  );
