-- Search credits granted for verified rental history contributions.
-- This migration is intentionally additive and does not modify existing tables.

create table if not exists user_search_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  rental_history_id uuid references tenant_rental_histories(id) on delete set null,
  credit_type text not null default 'rental_history_verified'
    check (credit_type in ('rental_history_verified', 'manual_admin_grant', 'promo')),
  amount integer not null default 1,
  remaining integer not null default 1,
  status text not null default 'active'
    check (status in ('active', 'used', 'expired', 'revoked')),
  reason text,
  granted_by_admin_id uuid references users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  used_at timestamptz,
  used_for_search_log_id uuid references search_logs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_search_credits_user_status_expires
  on user_search_credits (user_id, status, expires_at);

create index if not exists idx_user_search_credits_rental_history_id
  on user_search_credits (rental_history_id);

create index if not exists idx_user_search_credits_granted_at_desc
  on user_search_credits (granted_at desc);

create index if not exists idx_user_search_credits_credit_type
  on user_search_credits (credit_type);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = current_schema()
      and indexname = 'uniq_user_search_credits_rental_history_verified'
  ) then
    create unique index uniq_user_search_credits_rental_history_verified
      on user_search_credits (rental_history_id)
      where credit_type = 'rental_history_verified'
        and rental_history_id is not null;
  end if;
end $$;
