begin;

create extension if not exists pgcrypto;

do $$
declare
  existing_relkind "char";
begin
  select c.relkind into existing_relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'human_review_requests';
  if existing_relkind is not null and existing_relkind <> 'r' then
    raise exception 'INCOMPATIBLE_SCHEMA: public.human_review_requests exists but is not a regular table';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='users' and c.relkind in ('r','p')
  ) then
    raise exception 'PREREQUISITE_FAILURE: required table public.users does not exist';
  end if;
  if not exists (
    select 1 from pg_attribute where attrelid = to_regclass('public.users') and attname = 'id'
      and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: public.users.id must exist and use uuid';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'PREREQUISITE_FAILURE: required Supabase roles are missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'PREREQUISITE_FAILURE: service_role must have BYPASSRLS for backend-only access';
  end if;
end $$;

create table if not exists public.human_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  requester_email text not null,
  requester_name text,
  requester_document_id text,
  cedula_consultada text,
  current_score integer,
  current_classification text,
  reason text not null,
  description text not null,
  status text not null default 'received',
  admin_notes text,
  review_summary text,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint human_review_requests_reason_check check (reason in (
    'disputed_information', 'outdated_information', 'inaccurate_score',
    'identity_theft', 'automated_decision_concern', 'other'
  )),
  constraint human_review_requests_status_check check (status in (
    'received', 'in_review', 'awaiting_user_info', 'resolved', 'rejected'
  )),
  constraint human_review_requests_current_score_check check (
    current_score is null or (current_score >= 0 and current_score <= 100)
  )
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
  execute 'select exists (select 1 from public.human_review_requests limit 1)' into table_has_rows;
  select array_agg(required_column) into missing_required_columns
  from unnest(array['requester_email', 'reason', 'description']) as required(required_column)
  where not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.human_review_requests'::regclass and a.attname = required_column
      and a.attnum > 0 and not a.attisdropped
  );
  if table_has_rows and missing_required_columns is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: populated human_review_requests lacks required columns: %',
      array_to_string(missing_required_columns, ', ');
  end if;

  alter table public.human_review_requests
    add column if not exists id uuid not null default gen_random_uuid(),
    add column if not exists user_id uuid,
    add column if not exists requester_email text not null,
    add column if not exists requester_name text,
    add column if not exists requester_document_id text,
    add column if not exists cedula_consultada text,
    add column if not exists current_score integer,
    add column if not exists current_classification text,
    add column if not exists reason text not null,
    add column if not exists description text not null,
    add column if not exists status text not null default 'received',
    add column if not exists admin_notes text,
    add column if not exists review_summary text,
    add column if not exists resolved_at timestamptz,
    add column if not exists resolved_by uuid,
    add column if not exists ip_address text,
    add column if not exists user_agent text,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

  for column_spec in select * from (values
    ('id', 'uuid', true, 'gen_random_uuid'), ('user_id', 'uuid', false, null),
    ('requester_email', 'text', true, null), ('requester_name', 'text', false, null),
    ('requester_document_id', 'text', false, null), ('cedula_consultada', 'text', false, null),
    ('current_score', 'integer', false, null), ('current_classification', 'text', false, null),
    ('reason', 'text', true, null), ('description', 'text', true, null),
    ('status', 'text', true, 'received'), ('admin_notes', 'text', false, null),
    ('review_summary', 'text', false, null), ('resolved_at', 'timestamp with time zone', false, null),
    ('resolved_by', 'uuid', false, null), ('ip_address', 'text', false, null),
    ('user_agent', 'text', false, null), ('created_at', 'timestamp with time zone', true, 'now'),
    ('updated_at', 'timestamp with time zone', true, 'now')
  ) as expected(column_name, type_name, required_not_null, default_fragment)
  loop
    select a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.human_review_requests'::regclass and a.attname = column_spec.column_name
      and a.attnum > 0 and not a.attisdropped;
    if actual_type <> to_regtype(column_spec.type_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: column human_review_requests.% has an unexpected type', column_spec.column_name;
    end if;
    if actual_not_null is distinct from column_spec.required_not_null then
      raise exception 'INCOMPATIBLE_SCHEMA: column human_review_requests.% has unexpected nullability', column_spec.column_name;
    end if;
    if column_spec.default_fragment is null and actual_default is not null then
      raise exception 'INCOMPATIBLE_SCHEMA: column human_review_requests.% has an unexpected default', column_spec.column_name;
    end if;
    if column_spec.default_fragment is not null
      and (actual_default is null or position(column_spec.default_fragment in actual_default) = 0) then
      raise exception 'INCOMPATIBLE_SCHEMA: column human_review_requests.% has an unexpected default', column_spec.column_name;
    end if;
  end loop;
end $$;

do $$
declare
  pk_count integer;
  pk_definition text;
  fk_spec record;
  matching_count integer;
  incompatible_count integer;
begin
  select count(*), min(pg_get_constraintdef(oid)) into pk_count, pk_definition
  from pg_constraint where conrelid = 'public.human_review_requests'::regclass and contype = 'p';
  if pk_count = 0 then
    if exists (select 1 from pg_constraint where conrelid = 'public.human_review_requests'::regclass and conname = 'human_review_requests_pkey') then
      raise exception 'INCOMPATIBLE_SCHEMA: constraint human_review_requests_pkey has an unexpected definition';
    end if;
    alter table public.human_review_requests add constraint human_review_requests_pkey primary key (id);
  elsif pk_count <> 1 or pk_definition <> 'PRIMARY KEY (id)' then
    raise exception 'INCOMPATIBLE_SCHEMA: human_review_requests has an unexpected primary key';
  end if;

  for fk_spec in select * from (values
    ('user_id', 'human_review_requests_user_id_fkey'),
    ('resolved_by', 'human_review_requests_resolved_by_fkey')
  ) as expected(column_name, constraint_name)
  loop
    select
      count(*) filter (where c.confrelid = 'public.users'::regclass and c.confdeltype = 'n'
        and c.conkey = array[a.attnum]::smallint[] and c.confkey = array[u.attnum]::smallint[]),
      count(*) filter (where a.attnum = any(c.conkey) and not (c.confrelid = 'public.users'::regclass
        and c.confdeltype = 'n' and c.conkey = array[a.attnum]::smallint[]
        and c.confkey = array[u.attnum]::smallint[]))
      into matching_count, incompatible_count
    from pg_attribute a cross join pg_attribute u
    left join pg_constraint c on c.conrelid = 'public.human_review_requests'::regclass and c.contype = 'f'
    where a.attrelid = 'public.human_review_requests'::regclass and a.attname = fk_spec.column_name
      and u.attrelid = 'public.users'::regclass and u.attname = 'id';
    if incompatible_count > 0 or matching_count > 1 then
      raise exception 'INCOMPATIBLE_SCHEMA: column human_review_requests.% has an unexpected foreign key', fk_spec.column_name;
    elsif matching_count = 0 then
      if exists (select 1 from pg_constraint where conrelid = 'public.human_review_requests'::regclass and conname = fk_spec.constraint_name) then
        raise exception 'INCOMPATIBLE_SCHEMA: constraint % has an unexpected definition', fk_spec.constraint_name;
      end if;
      execute format('alter table public.human_review_requests add constraint %I foreign key (%I) references public.users(id) on delete set null', fk_spec.constraint_name, fk_spec.column_name);
    end if;
  end loop;
end $$;

do $$
declare
  check_spec record;
  existing_type "char";
  existing_definition text;
begin
  for check_spec in select * from (values
    ('human_review_requests_reason_check', 'reason', array['disputed_information','outdated_information','inaccurate_score','identity_theft','automated_decision_concern','other']::text[],
      'check (reason in (''disputed_information'', ''outdated_information'', ''inaccurate_score'', ''identity_theft'', ''automated_decision_concern'', ''other''))'),
    ('human_review_requests_status_check', 'status', array['received','in_review','awaiting_user_info','resolved','rejected']::text[],
      'check (status in (''received'', ''in_review'', ''awaiting_user_info'', ''resolved'', ''rejected''))')
  ) as expected(constraint_name, column_name, required_values, create_clause)
  loop
    existing_type := null; existing_definition := null;
    select c.contype, pg_get_constraintdef(c.oid) into existing_type, existing_definition
    from pg_constraint c where c.conrelid = 'public.human_review_requests'::regclass and c.conname = check_spec.constraint_name;
    if existing_type is null then
      execute format('alter table public.human_review_requests add constraint %I %s', check_spec.constraint_name, check_spec.create_clause);
    elsif existing_type <> 'c' or exists (
      select 1 from unnest(check_spec.required_values) value where position(quote_literal(value) in existing_definition) = 0
    ) then
      raise exception 'INCOMPATIBLE_SCHEMA: CHECK constraint % has an unexpected definition', check_spec.constraint_name;
    end if;
  end loop;

  existing_type := null; existing_definition := null;
  select c.contype, pg_get_constraintdef(c.oid) into existing_type, existing_definition
  from pg_constraint c where c.conrelid = 'public.human_review_requests'::regclass
    and c.conname = 'human_review_requests_current_score_check';
  if existing_type is null then
    alter table public.human_review_requests add constraint human_review_requests_current_score_check
      check (current_score is null or (current_score >= 0 and current_score <= 100));
  elsif existing_type <> 'c' or position('current_score >= 0' in existing_definition) = 0
    or position('current_score <= 100' in existing_definition) = 0 then
    raise exception 'INCOMPATIBLE_SCHEMA: CHECK constraint human_review_requests_current_score_check has an unexpected definition';
  end if;
end $$;

do $$
declare
  index_spec record;
  existing_kind "char";
  index_definition text;
  index_is_valid boolean;
  index_is_unique boolean;
  index_has_predicate boolean;
begin
  for index_spec in select * from (values
    ('idx_human_review_requests_user_id', '(user_id)'),
    ('idx_human_review_requests_requester_email', '(requester_email)'),
    ('idx_human_review_requests_requester_document_id', '(requester_document_id)'),
    ('idx_human_review_requests_status', '(status)'), ('idx_human_review_requests_reason', '(reason)'),
    ('idx_human_review_requests_created_at', '(created_at DESC)')
  ) as expected(index_name, definition_fragment)
  loop
    existing_kind := null; index_definition := null; index_is_valid := null; index_is_unique := null; index_has_predicate := null;
    select c.relkind, pg_get_indexdef(c.oid), i.indisvalid, i.indisunique, i.indpred is not null
      into existing_kind, index_definition, index_is_valid, index_is_unique, index_has_predicate
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    left join pg_index i on i.indexrelid = c.oid
    where n.nspname = 'public' and c.relname = index_spec.index_name;
    if existing_kind is null then
      execute format('create index %I on public.human_review_requests %s', index_spec.index_name, index_spec.definition_fragment);
    elsif existing_kind <> 'i' or index_definition is null then
      raise exception 'INCOMPATIBLE_SCHEMA: object % exists but is not an index', index_spec.index_name;
    elsif not index_is_valid or index_is_unique or index_has_predicate or position(index_spec.definition_fragment in index_definition) = 0
      or position('public.human_review_requests' in index_definition) = 0 then
      raise exception 'INCOMPATIBLE_SCHEMA: index % has an unexpected definition', index_spec.index_name;
    end if;
  end loop;
end $$;

do $$
declare
  existing_count integer;
  function_return_type oid;
  function_language text;
  function_arguments integer;
  function_kind text;
begin
  select count(*), min(p.prorettype::int)::oid, min(l.lanname), min(p.pronargs), min(p.prokind::text)
    into existing_count, function_return_type, function_language, function_arguments, function_kind
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.proname = 'set_human_review_requests_updated_at';
  if existing_count > 1 or (existing_count = 1 and (function_return_type <> 'trigger'::regtype
    or function_language <> 'plpgsql' or function_arguments <> 0 or function_kind <> 'f')) then
    raise exception 'INCOMPATIBLE_SCHEMA: set_human_review_requests_updated_at has an unexpected signature or language';
  end if;
end $$;

create or replace function public.set_human_review_requests_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$ begin new.updated_at := now(); return new; end; $$;

do $$
declare
  trigger_exists boolean := false;
  trigger_type smallint;
  trigger_function oid;
  trigger_arguments smallint;
  trigger_has_condition boolean;
begin
  select true, t.tgtype, t.tgfoid, t.tgnargs, t.tgqual is not null
    into trigger_exists, trigger_type, trigger_function, trigger_arguments, trigger_has_condition
  from pg_trigger t where t.tgrelid = 'public.human_review_requests'::regclass
    and t.tgname = 'trg_human_review_requests_updated_at' and not t.tgisinternal;
  trigger_exists := coalesce(trigger_exists, false);
  if not trigger_exists then
    create trigger trg_human_review_requests_updated_at before update on public.human_review_requests
      for each row execute function public.set_human_review_requests_updated_at();
  elsif trigger_type <> 19 or trigger_function <> 'public.set_human_review_requests_updated_at()'::regprocedure
    or trigger_arguments <> 0 or trigger_has_condition then
    raise exception 'INCOMPATIBLE_SCHEMA: trg_human_review_requests_updated_at has an unexpected definition';
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_policy where polrelid = 'public.human_review_requests'::regclass) then
    raise exception 'INCOMPATIBLE_SCHEMA: backend-only human_review_requests must not have direct-client policies';
  end if;
end $$;

alter table public.human_review_requests enable row level security;
alter table public.human_review_requests force row level security;

revoke all on table public.human_review_requests from public, anon, authenticated, service_role;
grant usage on schema public to service_role;
grant select, insert, update on table public.human_review_requests to service_role;

revoke all on function public.set_human_review_requests_updated_at() from public, anon, authenticated, service_role;
grant execute on function public.set_human_review_requests_updated_at() to service_role;

commit;
