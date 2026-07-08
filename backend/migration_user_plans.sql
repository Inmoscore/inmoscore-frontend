alter table users
add column if not exists plan_type text not null default 'free';

alter table users
add column if not exists daily_search_limit integer default 3;

alter table users
add column if not exists stripe_customer_id text;

alter table users
add column if not exists stripe_subscription_id text;

alter table users
alter column daily_search_limit drop not null;

create index if not exists idx_users_plan_type
on users(plan_type);

create index if not exists idx_users_plan_lookup
on users(id, plan_type, daily_search_limit);

create index if not exists idx_users_stripe_subscription
on users(stripe_subscription_id)
where stripe_subscription_id is not null;

update users
set plan_type = 'admin',
    daily_search_limit = null
where tipo_usuario = 'admin';
