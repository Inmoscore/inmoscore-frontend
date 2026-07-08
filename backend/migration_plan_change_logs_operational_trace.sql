alter table plan_change_logs
add column if not exists payment_id uuid references wompi_payments(id) on delete set null;

alter table plan_change_logs
add column if not exists payment_reference text;

alter table plan_change_logs
add column if not exists payment_provider text;

alter table plan_change_logs
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_plan_change_logs_payment_id
on plan_change_logs(payment_id)
where payment_id is not null;

create index if not exists idx_plan_change_logs_payment_reference
on plan_change_logs(payment_reference)
where payment_reference is not null;

create index if not exists idx_plan_change_logs_reason_created_at
on plan_change_logs(reason, created_at desc);

create index if not exists idx_plan_change_logs_previous_plan_created_at
on plan_change_logs(previous_plan_type, created_at desc);

create index if not exists idx_plan_change_logs_new_plan_created_at
on plan_change_logs(new_plan_type, created_at desc);
