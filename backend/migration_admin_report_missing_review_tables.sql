-- Incremental repair for Admin report review traceability tables.
-- Creates the missing public tables expected by the current backend.

create table if not exists public.report_review_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  admin_id uuid references public.users(id) on delete set null,
  previous_status text,
  new_status text not null,
  previous_scoring_eligibility_status text,
  new_scoring_eligibility_status text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.report_review_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists report_id uuid,
  add column if not exists admin_id uuid,
  add column if not exists previous_status text,
  add column if not exists new_status text,
  add column if not exists previous_scoring_eligibility_status text,
  add column if not exists new_scoring_eligibility_status text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now();

alter table public.report_review_logs
  alter column id set default gen_random_uuid(),
  alter column admin_id drop not null,
  alter column new_status set not null,
  alter column new_scoring_eligibility_status drop not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_review_logs_pkey'
      and conrelid = 'public.report_review_logs'::regclass
  ) then
    alter table public.report_review_logs
      add constraint report_review_logs_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_review_logs_report_id_fkey'
      and conrelid = 'public.report_review_logs'::regclass
  ) then
    alter table public.report_review_logs
      alter column report_id set not null,
      add constraint report_review_logs_report_id_fkey
        foreign key (report_id) references public.reports(id) on delete cascade;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'report_review_logs_admin_id_fkey'
      and conrelid = 'public.report_review_logs'::regclass
      and confdeltype <> 'n'
  ) then
    alter table public.report_review_logs
      drop constraint report_review_logs_admin_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_review_logs_admin_id_fkey'
      and conrelid = 'public.report_review_logs'::regclass
  ) then
    alter table public.report_review_logs
      add constraint report_review_logs_admin_id_fkey
        foreign key (admin_id) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_report_review_logs_report_id
  on public.report_review_logs (report_id);

create index if not exists idx_report_review_logs_admin_id
  on public.report_review_logs (admin_id);

create index if not exists idx_report_review_logs_created_at_desc
  on public.report_review_logs (created_at desc);

create table if not exists public.report_subject_notices (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  subject_user_id uuid references public.users(id) on delete set null,
  subject_document_number text,
  subject_email text,
  notice_status text default 'pending',
  notice_channel text,
  notice_reference text,
  sent_at timestamptz,
  notice_sent_at timestamptz,
  contradiction_deadline timestamptz,
  contradiction_received_at timestamptz,
  contradiction_status text default 'none',
  contradiction_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.report_subject_notices
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists report_id uuid,
  add column if not exists subject_user_id uuid,
  add column if not exists subject_document_number text,
  add column if not exists subject_email text,
  add column if not exists notice_status text default 'pending',
  add column if not exists notice_channel text,
  add column if not exists notice_reference text,
  add column if not exists sent_at timestamptz,
  add column if not exists notice_sent_at timestamptz,
  add column if not exists contradiction_deadline timestamptz,
  add column if not exists contradiction_received_at timestamptz,
  add column if not exists contradiction_status text default 'none',
  add column if not exists contradiction_summary text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.report_subject_notices
  alter column id set default gen_random_uuid(),
  alter column subject_document_number drop not null,
  alter column notice_status set default 'pending',
  alter column notice_channel drop not null,
  alter column contradiction_status set default 'none',
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_subject_notices_pkey'
      and conrelid = 'public.report_subject_notices'::regclass
  ) then
    alter table public.report_subject_notices
      add constraint report_subject_notices_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_subject_notices_report_id_fkey'
      and conrelid = 'public.report_subject_notices'::regclass
  ) then
    alter table public.report_subject_notices
      alter column report_id set not null,
      add constraint report_subject_notices_report_id_fkey
        foreign key (report_id) references public.reports(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_subject_notices_subject_user_id_fkey'
      and conrelid = 'public.report_subject_notices'::regclass
  ) then
    alter table public.report_subject_notices
      add constraint report_subject_notices_subject_user_id_fkey
        foreign key (subject_user_id) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_report_subject_notices_report_id
  on public.report_subject_notices (report_id);

create index if not exists idx_report_subject_notices_subject_user_id
  on public.report_subject_notices (subject_user_id);

create index if not exists idx_report_subject_notices_notice_status
  on public.report_subject_notices (notice_status);

create index if not exists idx_report_subject_notices_created_at_desc
  on public.report_subject_notices (created_at desc);
