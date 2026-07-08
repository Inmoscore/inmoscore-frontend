create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_subject_request_type') then
    create type data_subject_request_type as enum (
      'access',
      'correction',
      'deletion',
      'authorization_revocation',
      'claim',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_subject_request_status') then
    create type data_subject_request_status as enum (
      'received',
      'in_review',
      'awaiting_user_info',
      'resolved',
      'rejected'
    );
  end if;
end $$;

create table if not exists data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  requester_email text not null,
  requester_name text,
  requester_document_id text,
  request_type data_subject_request_type not null,
  status data_subject_request_status not null default 'received',
  description text not null,
  admin_notes text,
  submitted_at timestamptz not null default now(),
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_subject_requests_requester_email
on data_subject_requests(lower(requester_email));

create index if not exists idx_data_subject_requests_user_id
on data_subject_requests(user_id);

create index if not exists idx_data_subject_requests_status
on data_subject_requests(status);

create index if not exists idx_data_subject_requests_due_at
on data_subject_requests(due_at);

create index if not exists idx_data_subject_requests_type_status
on data_subject_requests(request_type, status);

-- Technical note:
-- due_at is intentionally calculated by the application layer using simple calendar days
-- and backed by this database trigger in the foundation phase. Replace with a Colombian
-- business-day helper before relying on this field for final legal SLA automation.

create or replace function set_data_subject_request_due_at()
returns trigger as $$
begin
  if new.due_at is null then
    if new.request_type = 'access' then
      new.due_at := coalesce(new.submitted_at, now()) + interval '10 days';
    else
      new.due_at := coalesce(new.submitted_at, now()) + interval '15 days';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_data_subject_request_due_at on data_subject_requests;

create trigger trg_set_data_subject_request_due_at
before insert or update on data_subject_requests
for each row
execute function set_data_subject_request_due_at();
