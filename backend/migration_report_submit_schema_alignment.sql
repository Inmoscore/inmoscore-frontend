-- Report submit schema alignment.
-- Incremental and idempotent: aligns the current POST /api/reports endpoint
-- with the database schema without changing business logic.

create extension if not exists pgcrypto;

alter table public.reports
  add column if not exists data_origin text default 'user_reported',
  add column if not exists review_status text default 'pending_review',
  add column if not exists review_required boolean default true,
  add column if not exists visibility_status text default 'not_public',
  add column if not exists secure_document_id uuid references public.secure_documents(id) on delete set null,
  add column if not exists submitted_for_review_at timestamptz;

-- Columns already used by the current report submission/review flow.
alter table public.reports
  add column if not exists source_type text,
  add column if not exists source_name text,
  add column if not exists source_reference text,
  add column if not exists source_url text,
  add column if not exists legal_basis text,
  add column if not exists consent_required boolean default true,
  add column if not exists consent_verified boolean default false,
  add column if not exists public_source_flag boolean default false,
  add column if not exists impacts_scoring boolean default false,
  add column if not exists dispute_status text default 'none',
  add column if not exists legal_review_status text default 'pending',
  add column if not exists legal_notes text,
  add column if not exists created_by_admin_id uuid,
  add column if not exists verified_by_admin_id uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists evidence_required boolean not null default true,
  add column if not exists evidence_status text not null default 'pending',
  add column if not exists legal_declaration_accepted boolean not null default false,
  add column if not exists legal_declaration_text text,
  add column if not exists report_verification_status text not null default 'pending_verification',
  add column if not exists reviewed_by_admin_id uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists legal_review_notes text,
  add column if not exists scoring_eligibility_status text default 'not_eligible',
  add column if not exists subject_notice_required boolean default true,
  add column if not exists subject_notice_status text default 'pending',
  add column if not exists contradiction_status text default 'none',
  add column if not exists contradiction_deadline timestamptz;

create table if not exists public.report_evidence_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  secure_document_id uuid references public.secure_documents(id) on delete set null,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  file_name text not null,
  storage_path text,
  mime_type text not null,
  file_size integer not null,
  sha256_hash text,
  evidence_type text,
  legal_declaration_accepted boolean not null default false,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- If the table already existed from an earlier partial migration, add the
-- endpoint-required columns defensively.
alter table public.report_evidence_files
  add column if not exists secure_document_id uuid references public.secure_documents(id) on delete set null,
  add column if not exists uploaded_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists storage_path text,
  add column if not exists legal_declaration_accepted boolean not null default false,
  add column if not exists uploaded_at timestamptz not null default now();

create index if not exists idx_report_evidence_files_report_id
  on public.report_evidence_files (report_id);

create index if not exists idx_report_evidence_files_secure_document_id
  on public.report_evidence_files (secure_document_id);

create index if not exists idx_reports_review_status
  on public.reports (review_status);

create index if not exists idx_reports_secure_document_id
  on public.reports (secure_document_id);

