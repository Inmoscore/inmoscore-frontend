-- Report subject notice and contradiction foundation.
-- Stores administrative notice traceability only; no email/SMS is sent here and no score is recalculated.

do $$
begin
  if to_regclass('public.reports') is not null then
    alter table reports
      add column if not exists subject_notice_required boolean not null default true,
      add column if not exists subject_notice_status text not null default 'pending',
      add column if not exists contradiction_status text not null default 'none',
      add column if not exists contradiction_deadline timestamptz;

    alter table reports
      drop constraint if exists reports_subject_notice_status_check;

    alter table reports
      add constraint reports_subject_notice_status_check
      check (
        subject_notice_status in (
          'pending',
          'sent',
          'failed',
          'waived',
          'not_required'
        )
      ) not valid;

    alter table reports
      drop constraint if exists reports_contradiction_status_check;

    alter table reports
      add constraint reports_contradiction_status_check
      check (
        contradiction_status in (
          'none',
          'received',
          'under_review',
          'accepted',
          'rejected',
          'expired'
        )
      ) not valid;

    create index if not exists idx_reports_subject_notice_status
      on reports (subject_notice_status);

    create index if not exists idx_reports_contradiction_status
      on reports (contradiction_status);

    create index if not exists idx_reports_contradiction_deadline
      on reports (contradiction_deadline);
  end if;
end $$;

create table if not exists report_subject_notices (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  subject_document_number text not null,
  subject_email text,
  notice_status text not null default 'pending',
  notice_channel text not null default 'manual_admin',
  notice_reference text,
  notice_sent_at timestamptz,
  contradiction_deadline timestamptz,
  contradiction_received_at timestamptz,
  contradiction_status text not null default 'none',
  contradiction_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_subject_notices_notice_status_check
    check (
      notice_status in (
        'pending',
        'sent',
        'failed',
        'waived',
        'not_required'
      )
    ),
  constraint report_subject_notices_contradiction_status_check
    check (
      contradiction_status in (
        'none',
        'received',
        'under_review',
        'accepted',
        'rejected',
        'expired'
      )
    )
);

create index if not exists idx_report_subject_notices_report_id_created_at
  on report_subject_notices (report_id, created_at desc);

create index if not exists idx_report_subject_notices_subject_document_number
  on report_subject_notices (subject_document_number);

create index if not exists idx_report_subject_notices_notice_status
  on report_subject_notices (notice_status);

create index if not exists idx_report_subject_notices_contradiction_status
  on report_subject_notices (contradiction_status);

create or replace function set_report_subject_notices_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_report_subject_notices_updated_at on report_subject_notices;
create trigger trg_report_subject_notices_updated_at
  before update on report_subject_notices
  for each row
  execute function set_report_subject_notices_updated_at();
