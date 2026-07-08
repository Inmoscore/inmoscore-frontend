-- Report evidence foundation: metadata-only support files and reinforced declaration.
-- No binaries are stored in the database and no scoring behavior is changed.

create table if not exists report_evidence_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete set null,
  uploaded_by_user_id uuid not null references users(id) on delete cascade,
  evidence_type text not null
    check (
      evidence_type in (
        'lease_contract',
        'payment_proof',
        'chat_or_message',
        'delivery_record',
        'debt_acknowledgement',
        'property_damage',
        'other'
      )
    ),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size integer not null,
  sha256_hash text,
  legal_declaration_accepted boolean not null default false,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_report_evidence_files_report_id
  on report_evidence_files (report_id);

create index if not exists idx_report_evidence_files_uploaded_by_user_id
  on report_evidence_files (uploaded_by_user_id);

create index if not exists idx_report_evidence_files_evidence_type
  on report_evidence_files (evidence_type);

create index if not exists idx_report_evidence_files_uploaded_at
  on report_evidence_files (uploaded_at);

do $$
begin
  if to_regclass('public.reports') is not null then
    alter table reports
      add column if not exists evidence_required boolean not null default true,
      add column if not exists evidence_status text not null default 'pending',
      add column if not exists legal_declaration_accepted boolean not null default false,
      add column if not exists legal_declaration_text text,
      add column if not exists report_verification_status text not null default 'pending_verification';

    if not exists (
      select 1
      from pg_constraint
      where conname = 'reports_evidence_status_check'
    ) then
      alter table reports
        add constraint reports_evidence_status_check
        check (evidence_status in ('pending', 'submitted', 'approved', 'rejected', 'needs_more_info'));
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'reports_report_verification_status_check'
    ) then
      alter table reports
        add constraint reports_report_verification_status_check
        check (report_verification_status in ('pending_verification', 'verified', 'rejected', 'needs_more_info'));
    end if;
  end if;
end $$;
