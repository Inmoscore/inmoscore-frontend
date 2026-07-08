-- Admin report review workflow.
-- Adds an auditable manual review gate before reports can be verified or eligible for scoring.
-- This migration does not recalculate scores and does not alter evidence files.

do $$
begin
  if to_regclass('public.reports') is not null then
    alter table reports
      add column if not exists reviewed_by_admin_id uuid references users(id) on delete set null,
      add column if not exists reviewed_at timestamptz,
      add column if not exists rejection_reason text,
      add column if not exists legal_review_notes text,
      add column if not exists scoring_eligibility_status text not null default 'not_eligible';

    update reports
    set scoring_eligibility_status = 'not_eligible'
    where scoring_eligibility_status is null;

    alter table reports
      alter column scoring_eligibility_status set default 'not_eligible';

    alter table reports
      drop constraint if exists reports_report_verification_status_check;

    alter table reports
      add constraint reports_report_verification_status_check
      check (
        report_verification_status in (
          'pending_verification',
          'in_review',
          'verified',
          'rejected',
          'needs_more_info'
        )
      ) not valid;

    alter table reports
      drop constraint if exists reports_scoring_eligibility_status_check;

    alter table reports
      add constraint reports_scoring_eligibility_status_check
      check (
        scoring_eligibility_status in (
          'not_eligible',
          'eligible',
          'blocked',
          'expired'
        )
      ) not valid;

    create index if not exists idx_reports_review_status
      on reports (report_verification_status);

    create index if not exists idx_reports_scoring_eligibility_status
      on reports (scoring_eligibility_status);
  end if;
end $$;

create table if not exists report_review_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  admin_id uuid not null references users(id) on delete restrict,
  previous_status text,
  new_status text not null,
  previous_scoring_eligibility_status text,
  new_scoring_eligibility_status text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint report_review_logs_previous_status_check
    check (
      previous_status is null or previous_status in (
        'pending_verification',
        'in_review',
        'verified',
        'rejected',
        'needs_more_info'
      )
    ),
  constraint report_review_logs_new_status_check
    check (
      new_status in (
        'pending_verification',
        'in_review',
        'verified',
        'rejected',
        'needs_more_info'
      )
    ),
  constraint report_review_logs_previous_scoring_check
    check (
      previous_scoring_eligibility_status is null
      or previous_scoring_eligibility_status in (
        'not_eligible',
        'eligible',
        'blocked',
        'expired'
      )
    ),
  constraint report_review_logs_new_scoring_check
    check (
      new_scoring_eligibility_status in (
        'not_eligible',
        'eligible',
        'blocked',
        'expired'
      )
    )
);

create index if not exists idx_report_review_logs_report_id_created_at
  on report_review_logs (report_id, created_at desc);

create index if not exists idx_report_review_logs_admin_id
  on report_review_logs (admin_id);
