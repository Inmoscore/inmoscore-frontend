begin;

create extension if not exists pgcrypto;

do $$
declare
  existing_kind "char";
  existing_labels text[];
begin
  select t.typtype, array_agg(e.enumlabel::text order by e.enumsortorder)
    into existing_kind, existing_labels
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  left join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public' and t.typname = 'data_subject_request_type'
  group by t.typtype;

  if existing_kind is null then
    create type public.data_subject_request_type as enum (
      'access',
      'correction',
      'deletion',
      'authorization_revocation',
      'claim',
      'other'
    );
  elsif existing_kind <> 'e' or existing_labels is distinct from
    array['access', 'correction', 'deletion', 'authorization_revocation', 'claim', 'other'] then
    raise exception 'INCOMPATIBLE_SCHEMA: public.data_subject_request_type has an unexpected definition';
  end if;

  select t.typtype, array_agg(e.enumlabel::text order by e.enumsortorder)
    into existing_kind, existing_labels
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  left join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public' and t.typname = 'data_subject_request_status'
  group by t.typtype;

  if existing_kind is null then
    create type public.data_subject_request_status as enum (
      'received',
      'in_review',
      'awaiting_user_info',
      'resolved',
      'rejected'
    );
  elsif existing_kind <> 'e' or existing_labels is distinct from
    array['received', 'in_review', 'awaiting_user_info', 'resolved', 'rejected'] then
    raise exception 'INCOMPATIBLE_SCHEMA: public.data_subject_request_status has an unexpected definition';
  end if;
end $$;

do $$
declare
  existing_relkind "char";
begin
  select c.relkind
    into existing_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'data_subject_requests';

  if existing_relkind is not null and existing_relkind <> 'r' then
    raise exception 'INCOMPATIBLE_SCHEMA: public.data_subject_requests exists but is not a regular table';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'users'
      and c.relkind in ('r', 'p')
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: required table public.users does not exist';
  end if;
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.users'::regclass
      and attname = 'id'
      and atttypid = 'uuid'::regtype
      and attnum > 0
      and not attisdropped
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: public.users.id must exist and use uuid';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'INCOMPATIBLE_SCHEMA: required Supabase roles are missing';
  end if;
  if not exists (
    select 1 from pg_roles where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: service_role must have BYPASSRLS for backend-only access';
  end if;
end $$;

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  requester_email text not null,
  requester_name text,
  requester_document_id text,
  request_type public.data_subject_request_type not null,
  status public.data_subject_request_status not null default 'received',
  description text not null,
  admin_notes text,
  submitted_at timestamptz not null default now(),
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_has_rows boolean;
  missing_required_columns text[];
  column_spec record;
  actual_type oid;
  actual_not_null boolean;
  actual_default text;
begin
  execute 'select exists (select 1 from public.data_subject_requests limit 1)'
    into table_has_rows;

  select array_agg(required_column)
    into missing_required_columns
  from unnest(array['requester_email', 'request_type', 'description']) as missing(required_column)
  where not exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.data_subject_requests'::regclass
      and a.attname = required_column
      and a.attnum > 0
      and not a.attisdropped
  );

  if table_has_rows and missing_required_columns is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: populated data_subject_requests lacks required columns: %',
      array_to_string(missing_required_columns, ', ');
  end if;

  alter table public.data_subject_requests
    add column if not exists id uuid not null default gen_random_uuid(),
    add column if not exists user_id uuid,
    add column if not exists requester_email text not null,
    add column if not exists requester_name text,
    add column if not exists requester_document_id text,
    add column if not exists request_type public.data_subject_request_type not null,
    add column if not exists status public.data_subject_request_status not null default 'received',
    add column if not exists description text not null,
    add column if not exists admin_notes text,
    add column if not exists submitted_at timestamptz not null default now(),
    add column if not exists due_at timestamptz,
    add column if not exists resolved_at timestamptz,
    add column if not exists resolved_by uuid,
    add column if not exists ip_address text,
    add column if not exists user_agent text,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

  for column_spec in
    select * from (values
      ('id', 'uuid', true, 'gen_random_uuid'),
      ('user_id', 'uuid', false, null),
      ('requester_email', 'text', true, null),
      ('requester_name', 'text', false, null),
      ('requester_document_id', 'text', false, null),
      ('request_type', 'public.data_subject_request_type', true, null),
      ('status', 'public.data_subject_request_status', true, 'received'),
      ('description', 'text', true, null),
      ('admin_notes', 'text', false, null),
      ('submitted_at', 'timestamp with time zone', true, 'now'),
      ('due_at', 'timestamp with time zone', false, null),
      ('resolved_at', 'timestamp with time zone', false, null),
      ('resolved_by', 'uuid', false, null),
      ('ip_address', 'text', false, null),
      ('user_agent', 'text', false, null),
      ('created_at', 'timestamp with time zone', true, 'now'),
      ('updated_at', 'timestamp with time zone', true, 'now')
    ) as expected(column_name, type_name, required_not_null, default_fragment)
  loop
    select a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.data_subject_requests'::regclass
      and a.attname = column_spec.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if actual_type <> to_regtype(column_spec.type_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: column % has an unexpected type', column_spec.column_name;
    end if;
    if actual_not_null is distinct from column_spec.required_not_null then
      raise exception 'INCOMPATIBLE_SCHEMA: column % has unexpected nullability', column_spec.column_name;
    end if;
    if column_spec.default_fragment is null and actual_default is not null then
      raise exception 'INCOMPATIBLE_SCHEMA: column % has an unexpected default', column_spec.column_name;
    end if;
    if column_spec.default_fragment is not null
      and (actual_default is null or position(column_spec.default_fragment in actual_default) = 0) then
      raise exception 'INCOMPATIBLE_SCHEMA: column % has an unexpected default', column_spec.column_name;
    end if;
  end loop;
end $$;

do $$
declare
  primary_key_count integer;
  primary_key_definition text;
begin
  select count(*), min(pg_get_constraintdef(c.oid))
    into primary_key_count, primary_key_definition
  from pg_constraint c
  where c.conrelid = 'public.data_subject_requests'::regclass and c.contype = 'p';

  if primary_key_count = 0 then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.data_subject_requests'::regclass
        and conname = 'data_subject_requests_pkey'
    ) then
      raise exception 'INCOMPATIBLE_SCHEMA: constraint data_subject_requests_pkey has an unexpected definition';
    end if;
    alter table public.data_subject_requests
      add constraint data_subject_requests_pkey primary key (id);
  elsif primary_key_count <> 1 or primary_key_definition <> 'PRIMARY KEY (id)' then
    raise exception 'INCOMPATIBLE_SCHEMA: data_subject_requests has an unexpected primary key';
  end if;
end $$;

do $$
declare
  fk_spec record;
  matching_count integer;
  incompatible_count integer;
begin
  for fk_spec in
    select * from (values
      ('user_id', 'data_subject_requests_user_id_fkey'),
      ('resolved_by', 'data_subject_requests_resolved_by_fkey')
    ) as expected(column_name, constraint_name)
  loop
    select
      count(*) filter (
        where c.confrelid = 'public.users'::regclass
          and c.confdeltype = 'n'
          and c.conkey = array[a.attnum]::smallint[]
          and c.confkey = array[ua.attnum]::smallint[]
      ),
      count(*) filter (
        where a.attnum = any(c.conkey)
          and not (
            c.confrelid = 'public.users'::regclass
            and c.confdeltype = 'n'
            and c.conkey = array[a.attnum]::smallint[]
            and c.confkey = array[ua.attnum]::smallint[]
          )
      )
      into matching_count, incompatible_count
    from pg_attribute a
    cross join pg_attribute ua
    left join pg_constraint c
      on c.conrelid = 'public.data_subject_requests'::regclass and c.contype = 'f'
    where a.attrelid = 'public.data_subject_requests'::regclass
      and a.attname = fk_spec.column_name
      and ua.attrelid = 'public.users'::regclass
      and ua.attname = 'id';

    if incompatible_count > 0 or matching_count > 1 then
      raise exception 'INCOMPATIBLE_SCHEMA: column % has an unexpected foreign key', fk_spec.column_name;
    elsif matching_count = 0 then
      if exists (
        select 1 from pg_constraint
        where conrelid = 'public.data_subject_requests'::regclass
          and conname = fk_spec.constraint_name
      ) then
        raise exception 'INCOMPATIBLE_SCHEMA: constraint % has an unexpected definition', fk_spec.constraint_name;
      end if;
      execute format(
        'alter table public.data_subject_requests add constraint %I foreign key (%I) references public.users(id) on delete set null',
        fk_spec.constraint_name,
        fk_spec.column_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  index_spec record;
  index_definition text;
  index_is_valid boolean;
  index_is_unique boolean;
  object_exists boolean;
begin
  for index_spec in
    select * from (values
      ('idx_data_subject_requests_requester_email', '(lower(requester_email))'),
      ('idx_data_subject_requests_user_id', '(user_id)'),
      ('idx_data_subject_requests_status', '(status)'),
      ('idx_data_subject_requests_due_at', '(due_at)'),
      ('idx_data_subject_requests_type_status', '(request_type, status)')
    ) as expected(index_name, definition_fragment)
  loop
    object_exists := false;
    index_definition := null;
    index_is_valid := null;
    index_is_unique := null;
    select true, pg_get_indexdef(c.oid), i.indisvalid, i.indisunique
      into object_exists, index_definition, index_is_valid, index_is_unique
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_index i on i.indexrelid = c.oid
    where n.nspname = 'public' and c.relname = index_spec.index_name;

    object_exists := coalesce(object_exists, false);

    if object_exists and index_definition is null then
      raise exception 'INCOMPATIBLE_SCHEMA: object % exists but is not an index', index_spec.index_name;
    elsif not object_exists then
      execute format(
        'create index %I on public.data_subject_requests %s',
        index_spec.index_name,
        index_spec.definition_fragment
      );
    elsif not index_is_valid
      or index_is_unique
      or position(index_spec.definition_fragment in index_definition) = 0
      or position('public.data_subject_requests' in index_definition) = 0 then
      raise exception 'INCOMPATIBLE_SCHEMA: index % has an unexpected definition', index_spec.index_name;
    end if;
  end loop;
end $$;

do $$
declare
  function_return_type oid;
begin
  select p.prorettype
    into function_return_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'set_data_subject_request_due_at'
    and p.pronargs = 0;

  if function_return_type is not null and function_return_type <> 'trigger'::regtype then
    raise exception 'INCOMPATIBLE_SCHEMA: set_data_subject_request_due_at has an unexpected signature';
  end if;
end $$;

-- due_at is a provisional product SLA indicator, not a definitive legal deadline.
-- It uses calendar days and intentionally does not claim automatic legal compliance.
-- The 10/15-day approximation requires validation by qualified legal counsel.
create or replace function public.set_data_subject_request_due_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
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
$$;

do $$
declare
  trigger_exists boolean := false;
  existing_trigger_type smallint;
  existing_trigger_function oid;
  existing_trigger_arguments smallint;
  existing_trigger_has_condition boolean;
begin
  select true, t.tgtype, t.tgfoid, t.tgnargs, t.tgqual is not null
    into trigger_exists, existing_trigger_type, existing_trigger_function,
      existing_trigger_arguments, existing_trigger_has_condition
  from pg_trigger t
  where t.tgrelid = 'public.data_subject_requests'::regclass
    and t.tgname = 'trg_set_data_subject_request_due_at'
    and not t.tgisinternal;

  trigger_exists := coalesce(trigger_exists, false);

  if not trigger_exists then
    create trigger trg_set_data_subject_request_due_at
    before insert or update on public.data_subject_requests
    for each row
    execute function public.set_data_subject_request_due_at();
  elsif existing_trigger_type <> 23
    or existing_trigger_function <> 'public.set_data_subject_request_due_at()'::regprocedure
    or existing_trigger_arguments <> 0
    or existing_trigger_has_condition then
    raise exception 'INCOMPATIBLE_SCHEMA: trg_set_data_subject_request_due_at has an unexpected definition';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_policy
    where polrelid = 'public.data_subject_requests'::regclass
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: backend-only data_subject_requests must not have direct-client policies';
  end if;
end $$;

-- Backend-only access model. FORCE also subjects the table owner to RLS; the Supabase
-- service_role keeps operating through its BYPASSRLS attribute. No client policy is created.
alter table public.data_subject_requests enable row level security;
alter table public.data_subject_requests force row level security;

revoke all on table public.data_subject_requests from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.data_subject_requests to service_role;

revoke all on type public.data_subject_request_type from public, anon, authenticated;
revoke all on type public.data_subject_request_status from public, anon, authenticated;
grant usage on type public.data_subject_request_type to service_role;
grant usage on type public.data_subject_request_status to service_role;

revoke all on function public.set_data_subject_request_due_at() from public, anon, authenticated;
grant execute on function public.set_data_subject_request_due_at() to service_role;

commit;
