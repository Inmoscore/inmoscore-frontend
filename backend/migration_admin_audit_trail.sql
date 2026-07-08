-- Centralized append-only administrative audit trail.
-- Stores summarized operational evidence for sensitive admin actions.
-- Do not store secrets, tokens, passwords, binaries, or full provider payloads here.

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references users(id) on delete set null,
  admin_email text,
  action_type text not null,
  severity text not null,
  target_type text not null,
  target_id uuid,
  target_reference text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  ip_address text,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now(),
  constraint admin_audit_logs_severity_check
    check (severity in ('low', 'medium', 'high', 'critical'))
);

create index if not exists idx_admin_audit_logs_admin_user_id
  on admin_audit_logs (admin_user_id);

create index if not exists idx_admin_audit_logs_action_type
  on admin_audit_logs (action_type);

create index if not exists idx_admin_audit_logs_severity
  on admin_audit_logs (severity);

create index if not exists idx_admin_audit_logs_target_type
  on admin_audit_logs (target_type);

create index if not exists idx_admin_audit_logs_target_id
  on admin_audit_logs (target_id);

create index if not exists idx_admin_audit_logs_created_at
  on admin_audit_logs (created_at desc);

create or replace function prevent_admin_audit_logs_mutation()
returns trigger as $$
begin
  raise exception 'admin_audit_logs is append-only';
end;
$$ language plpgsql;

drop trigger if exists trg_admin_audit_logs_prevent_update on admin_audit_logs;
create trigger trg_admin_audit_logs_prevent_update
  before update on admin_audit_logs
  for each row
  execute function prevent_admin_audit_logs_mutation();

drop trigger if exists trg_admin_audit_logs_prevent_delete on admin_audit_logs;
create trigger trg_admin_audit_logs_prevent_delete
  before delete on admin_audit_logs
  for each row
  execute function prevent_admin_audit_logs_mutation();
