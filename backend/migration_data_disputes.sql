create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_dispute_target_type') then
    create type data_dispute_target_type as enum (
      'report',
      'judicial_signal',
      'score',
      'search_result',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_dispute_type') then
    create type data_dispute_type as enum (
      'inaccurate',
      'outdated',
      'paid_or_resolved',
      'identity_theft',
      'unauthorized_processing',
      'not_mine',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_dispute_status') then
    create type data_dispute_status as enum (
      'received',
      'in_review',
      'awaiting_user_info',
      'accepted',
      'rejected',
      'resolved'
    );
  end if;
end $$;

create table if not exists data_disputes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  requester_email text not null,
  requester_name text,
  requester_document_id text,
  target_type data_dispute_target_type not null,
  target_id uuid,
  target_reference text,
  dispute_type data_dispute_type not null,
  status data_dispute_status not null default 'received',
  description text not null,
  evidence_url text,
  admin_notes text,
  resolution_summary text,
  submitted_at timestamptz not null default now(),
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_disputes_requester_email
on data_disputes(lower(requester_email));

create index if not exists idx_data_disputes_requester_document_id
on data_disputes(requester_document_id);

create index if not exists idx_data_disputes_target
on data_disputes(target_type, target_id);

create index if not exists idx_data_disputes_status
on data_disputes(status);

create index if not exists idx_data_disputes_due_at
on data_disputes(due_at);

create index if not exists idx_data_disputes_dispute_type
on data_disputes(dispute_type);

-- Technical note:
-- due_at currently uses a simple 15-calendar-day approximation. Replace this
-- with a Colombian business-day calculator before final legal SLA automation.

create or replace function set_data_dispute_due_at()
returns trigger as $$
begin
  if new.due_at is null then
    new.due_at := coalesce(new.submitted_at, now()) + interval '15 days';
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_data_dispute_due_at on data_disputes;

create trigger trg_set_data_dispute_due_at
before insert or update on data_disputes
for each row
execute function set_data_dispute_due_at();
