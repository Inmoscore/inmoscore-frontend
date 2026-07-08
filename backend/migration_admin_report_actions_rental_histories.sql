-- Extend admin decision history to include rental history moderation actions.

create extension if not exists pgcrypto;

create table if not exists public.admin_report_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  admin_user_id uuid references public.users(id) on delete set null,
  accion text,
  fecha_accion timestamptz not null default now()
);

alter table public.admin_report_actions
  add column if not exists rental_history_id uuid,
  add column if not exists action text,
  add column if not exists "timestamp" timestamptz;

alter table public.admin_report_actions
  alter column report_id drop not null,
  alter column accion drop not null,
  alter column fecha_accion set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_report_actions_rental_history_id_fkey'
      and conrelid = 'public.admin_report_actions'::regclass
  ) then
    alter table public.admin_report_actions
      add constraint admin_report_actions_rental_history_id_fkey
        foreign key (rental_history_id)
        references public.tenant_rental_histories(id)
        on delete cascade;
  end if;
end $$;

update public.admin_report_actions
set
  action = case
    when action is not null then action
    when accion = 'aprobado' then 'report_approved'
    when accion = 'rechazado' then 'report_rejected'
    else accion
  end,
  "timestamp" = coalesce("timestamp", fecha_accion)
where action is null
   or "timestamp" is null;

create index if not exists idx_admin_report_actions_report_id
  on public.admin_report_actions(report_id);

create index if not exists idx_admin_report_actions_rental_history_id
  on public.admin_report_actions(rental_history_id);

create index if not exists idx_admin_report_actions_admin_user_id
  on public.admin_report_actions(admin_user_id);

create index if not exists idx_admin_report_actions_timestamp_desc
  on public.admin_report_actions("timestamp" desc);
