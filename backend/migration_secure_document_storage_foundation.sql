-- Secure document custody foundation.
-- Metadata-only storage registry for private Supabase Storage objects.
-- No binaries are stored in the database and no public URLs are generated.

create table if not exists secure_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references users(id) on delete set null,
  related_entity_type text not null,
  related_entity_id uuid,
  document_category text not null
    check (
      document_category in (
        'identity_document',
        'report_evidence',
        'dispute_evidence',
        'human_review_evidence',
        'contract',
        'other'
      )
    ),
  bucket_name text not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  sha256_hash text,
  status text not null default 'pending_upload'
    check (
      status in (
        'pending_upload',
        'uploaded',
        'ready_for_review',
        'quarantined',
        'rejected',
        'deleted'
      )
    ),
  uploaded_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  retention_until timestamptz,
  legal_hold boolean not null default false,
  deleted_at timestamptz,
  deletion_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references secure_documents(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  actor_email text,
  actor_role text,
  action_type text not null
    check (
      action_type in (
        'upload_intent_created',
        'upload_confirmed',
        'view_requested',
        'download_requested',
        'signed_url_issued',
        'access_denied',
        'deleted',
        'legal_hold_enabled',
        'legal_hold_disabled'
      )
    ),
  access_result text not null
    check (access_result in ('allowed', 'denied', 'failed')),
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_secure_documents_storage_location
  on secure_documents (bucket_name, storage_path);

create index if not exists idx_secure_documents_owner_user_id
  on secure_documents (owner_user_id);

create index if not exists idx_secure_documents_related_entity
  on secure_documents (related_entity_type, related_entity_id);

create index if not exists idx_secure_documents_document_category
  on secure_documents (document_category);

create index if not exists idx_secure_documents_status
  on secure_documents (status);

create index if not exists idx_secure_documents_legal_hold
  on secure_documents (legal_hold);

create index if not exists idx_secure_documents_retention_until
  on secure_documents (retention_until);

create index if not exists idx_document_access_logs_document_id
  on document_access_logs (document_id);

create index if not exists idx_document_access_logs_actor_user_id
  on document_access_logs (actor_user_id);

create index if not exists idx_document_access_logs_action_type
  on document_access_logs (action_type);

create index if not exists idx_document_access_logs_created_at
  on document_access_logs (created_at);

create or replace function set_secure_documents_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_secure_documents_updated_at on secure_documents;

create trigger trg_secure_documents_updated_at
before update on secure_documents
for each row
execute function set_secure_documents_updated_at();
