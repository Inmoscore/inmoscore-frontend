create extension if not exists pgcrypto;

create table if not exists plan_change_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references users(id) on delete set null,
  target_user_id uuid references users(id) on delete set null,
  previous_plan_type text,
  new_plan_type text not null,
  previous_daily_search_limit integer,
  new_daily_search_limit integer,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_plan_change_logs_target_user_created_at
  on plan_change_logs (target_user_id, created_at desc);

create index if not exists idx_plan_change_logs_admin_user_created_at
  on plan_change_logs (admin_user_id, created_at desc);

create index if not exists idx_plan_change_logs_created_at
  on plan_change_logs (created_at desc);
