-- Verified reporting foundation: identity traceability and report eligibility.
-- This migration is intentionally incremental: nullable user fields, metadata-only
-- document records, and no uniqueness constraint on document_number yet.

alter table users
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists full_legal_name text,
  add column if not exists phone_number text,
  add column if not exists identity_verification_status text not null default 'unverified',
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verification_method text,
  add column if not exists identity_verification_notes text,
  add column if not exists reporting_eligibility_status text not null default 'not_allowed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_identity_verification_status_check'
  ) then
    alter table users
      add constraint users_identity_verification_status_check
      check (identity_verification_status in ('unverified', 'pending_review', 'verified', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_reporting_eligibility_status_check'
  ) then
    alter table users
      add constraint users_reporting_eligibility_status_check
      check (reporting_eligibility_status in ('not_allowed', 'limited', 'allowed', 'suspended'));
  end if;
end $$;

create index if not exists idx_users_document_number
  on users (document_number);

create table if not exists identity_verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size integer not null,
  sha256_hash text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected')),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_identity_verification_documents_user_id
  on identity_verification_documents (user_id);

create index if not exists idx_identity_verification_documents_status
  on identity_verification_documents (verification_status);

create index if not exists idx_identity_verification_documents_uploaded_at
  on identity_verification_documents (uploaded_at);
