create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'legal_document_type') then
    create type legal_document_type as enum (
      'privacy_policy',
      'terms_conditions',
      'scoring_authorization',
      'habeas_data_authorization',
      'cookies_policy'
    );
  end if;
end $$;

create table if not exists legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_type legal_document_type not null,
  version text not null,
  title text not null,
  content_hash text not null,
  is_active boolean not null default false,
  effective_date timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  unique (document_type, version)
);

create index if not exists idx_legal_document_versions_document_type
on legal_document_versions(document_type);

create index if not exists idx_legal_document_versions_active
on legal_document_versions(document_type, is_active, effective_date desc);

create table if not exists user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  document_type legal_document_type not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  acceptance_method text not null default 'checkbox',
  consent_purposes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (document_type, document_version)
    references legal_document_versions(document_type, version)
);

create index if not exists idx_user_legal_acceptances_user_id
on user_legal_acceptances(user_id);

create index if not exists idx_user_legal_acceptances_document_type
on user_legal_acceptances(document_type);

create index if not exists idx_user_legal_acceptances_accepted_at
on user_legal_acceptances(accepted_at desc);

create index if not exists idx_user_legal_acceptances_user_document_accepted
on user_legal_acceptances(user_id, document_type, accepted_at desc);

alter table users
add column if not exists privacy_policy_accepted_at timestamptz;

alter table users
add column if not exists terms_accepted_at timestamptz;

alter table users
add column if not exists scoring_consent_accepted_at timestamptz;

alter table users
add column if not exists marketing_consent boolean not null default false;

alter table users
add column if not exists legal_compliance_version text;

insert into legal_document_versions (
  document_type,
  version,
  title,
  content_hash,
  is_active,
  effective_date,
  created_by
) values
  (
    'terms_conditions',
    'v2026-05-08-initial',
    'Terminos y Condiciones InmoScore - version inicial',
    'sha256:terms_conditions:v2026-05-08-initial',
    true,
    '2026-05-08T00:00:00Z',
    null
  ),
  (
    'privacy_policy',
    'v2026-05-08-initial',
    'Politica de Privacidad InmoScore - version inicial',
    'sha256:privacy_policy:v2026-05-08-initial',
    true,
    '2026-05-08T00:00:00Z',
    null
  ),
  (
    'scoring_authorization',
    'v2026-05-08-initial',
    'Autorizacion para scoring inmobiliario - version inicial',
    'sha256:scoring_authorization:v2026-05-08-initial',
    true,
    '2026-05-08T00:00:00Z',
    null
  ),
  (
    'habeas_data_authorization',
    'v2026-05-08-initial',
    'Autorizacion Habeas Data - version inicial',
    'sha256:habeas_data_authorization:v2026-05-08-initial',
    true,
    '2026-05-08T00:00:00Z',
    null
  ),
  (
    'cookies_policy',
    'v2026-05-08-initial',
    'Politica de Cookies InmoScore - version inicial',
    'sha256:cookies_policy:v2026-05-08-initial',
    true,
    '2026-05-08T00:00:00Z',
    null
  )
on conflict (document_type, version) do update
set
  title = excluded.title,
  content_hash = excluded.content_hash,
  is_active = excluded.is_active,
  effective_date = excluded.effective_date;
