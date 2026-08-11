begin;

create extension if not exists pgcrypto;

do $$
declare
  enum_spec record;
  existing_kind "char";
  existing_labels text[];
begin
  for enum_spec in
    select * from (values
      ('data_dispute_target_type', array['report', 'judicial_signal', 'score', 'search_result', 'other']::text[]),
      ('data_dispute_type', array['inaccurate', 'outdated', 'paid_or_resolved', 'identity_theft', 'unauthorized_processing', 'not_mine', 'other']::text[]),
      ('data_dispute_status', array['received', 'in_review', 'awaiting_user_info', 'accepted', 'rejected', 'resolved']::text[])
    ) as expected(type_name, labels)
  loop
    existing_kind := null;
    existing_labels := null;

    select t.typtype, array_agg(e.enumlabel::text order by e.enumsortorder)
      into existing_kind, existing_labels
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    left join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public' and t.typname = enum_spec.type_name
    group by t.typtype;

    if existing_kind is null then
      execute format(
        'create type public.%I as enum (%s)',
        enum_spec.type_name,
        (select string_agg(quote_literal(label), ', ') from unnest(enum_spec.labels) as valueset(label))
      );
    elsif existing_kind <> 'e' or existing_labels is distinct from enum_spec.labels then
      raise exception 'INCOMPATIBLE_SCHEMA: public.% has an unexpected enum definition', enum_spec.type_name;
    end if;
  end loop;
end $$;

do $$
declare
  existing_relkind "char";
begin
  select c.relkind into existing_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'data_disputes';

  if existing_relkind is not null and existing_relkind <> 'r' then
    raise exception 'INCOMPATIBLE_SCHEMA: public.data_disputes exists but is not a regular table';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='users' and c.relkind in ('r','p')
  ) then
    raise exception 'PREREQUISITE_FAILURE: required table public.users does not exist';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = to_regclass('public.users') and attname = 'id'
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

create table if not exists public.data_disputes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  requester_email text not null,
  requester_name text,
  requester_document_id text,
  target_type public.data_dispute_target_type not null,
  target_id uuid,
  target_reference text,
  dispute_type public.data_dispute_type not null,
  status public.data_dispute_status not null default 'received',
  description text not null,
  evidence_url text,
  admin_notes text,
  resolution_summary text,
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
  execute 'select exists (select 1 from public.data_disputes limit 1)' into table_has_rows;

  select array_agg(required_column) into missing_required_columns
  from unnest(array['requester_email', 'target_type', 'dispute_type', 'description']) as required(required_column)
  where not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.data_disputes'::regclass and a.attname = required_column
      and a.attnum > 0 and not a.attisdropped
  );

  if table_has_rows and missing_required_columns is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: populated data_disputes lacks required columns: %',
      array_to_string(missing_required_columns, ', ');
  end if;

  alter table public.data_disputes
    add column if not exists id uuid not null default gen_random_uuid(),
    add column if not exists user_id uuid,
    add column if not exists requester_email text not null,
    add column if not exists requester_name text,
    add column if not exists requester_document_id text,
    add column if not exists target_type public.data_dispute_target_type not null,
    add column if not exists target_id uuid,
    add column if not exists target_reference text,
    add column if not exists dispute_type public.data_dispute_type not null,
    add column if not exists status public.data_dispute_status not null default 'received',
    add column if not exists description text not null,
    add column if not exists evidence_url text,
    add column if not exists admin_notes text,
    add column if not exists resolution_summary text,
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
      ('id', 'uuid', true, 'gen_random_uuid'), ('user_id', 'uuid', false, null),
      ('requester_email', 'text', true, null), ('requester_name', 'text', false, null),
      ('requester_document_id', 'text', false, null), ('target_type', 'public.data_dispute_target_type', true, null),
      ('target_id', 'uuid', false, null), ('target_reference', 'text', false, null),
      ('dispute_type', 'public.data_dispute_type', true, null), ('status', 'public.data_dispute_status', true, 'received'),
      ('description', 'text', true, null), ('evidence_url', 'text', false, null),
      ('admin_notes', 'text', false, null), ('resolution_summary', 'text', false, null),
      ('submitted_at', 'timestamp with time zone', true, 'now'), ('due_at', 'timestamp with time zone', false, null),
      ('resolved_at', 'timestamp with time zone', false, null), ('resolved_by', 'uuid', false, null),
      ('ip_address', 'text', false, null), ('user_agent', 'text', false, null),
      ('created_at', 'timestamp with time zone', true, 'now'), ('updated_at', 'timestamp with time zone', true, 'now')
    ) as expected(column_name, type_name, required_not_null, default_fragment)
  loop
    select a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.data_disputes'::regclass and a.attname = column_spec.column_name
      and a.attnum > 0 and not a.attisdropped;

    if actual_type <> to_regtype(column_spec.type_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_disputes.% has an unexpected type', column_spec.column_name;
    end if;
    if actual_not_null is distinct from column_spec.required_not_null then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_disputes.% has unexpected nullability', column_spec.column_name;
    end if;
    if column_spec.default_fragment is null and actual_default is not null then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_disputes.% has an unexpected default', column_spec.column_name;
    end if;
    if column_spec.default_fragment is not null
      and (actual_default is null or position(column_spec.default_fragment in actual_default) = 0) then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_disputes.% has an unexpected default', column_spec.column_name;
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
  from pg_constraint where conrelid = 'public.data_disputes'::regclass and contype = 'p';
  if pk_count = 0 then
    if exists (select 1 from pg_constraint where conrelid = 'public.data_disputes'::regclass and conname = 'data_disputes_pkey') then
      raise exception 'INCOMPATIBLE_SCHEMA: constraint data_disputes_pkey has an unexpected definition';
    end if;
    alter table public.data_disputes add constraint data_disputes_pkey primary key (id);
  elsif pk_count <> 1 or pk_definition <> 'PRIMARY KEY (id)' then
    raise exception 'INCOMPATIBLE_SCHEMA: data_disputes has an unexpected primary key';
  end if;

  for fk_spec in select * from (values
    ('user_id', 'data_disputes_user_id_fkey'), ('resolved_by', 'data_disputes_resolved_by_fkey')
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
    left join pg_constraint c on c.conrelid = 'public.data_disputes'::regclass and c.contype = 'f'
    where a.attrelid = 'public.data_disputes'::regclass and a.attname = fk_spec.column_name
      and u.attrelid = 'public.users'::regclass and u.attname = 'id';

    if incompatible_count > 0 or matching_count > 1 then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_disputes.% has an unexpected foreign key', fk_spec.column_name;
    elsif matching_count = 0 then
      if exists (select 1 from pg_constraint where conrelid = 'public.data_disputes'::regclass and conname = fk_spec.constraint_name) then
        raise exception 'INCOMPATIBLE_SCHEMA: constraint % has an unexpected definition', fk_spec.constraint_name;
      end if;
      execute format('alter table public.data_disputes add constraint %I foreign key (%I) references public.users(id) on delete set null', fk_spec.constraint_name, fk_spec.column_name);
    end if;
  end loop;
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
    ('idx_data_disputes_requester_email', '(lower(requester_email))'),
    ('idx_data_disputes_requester_document_id', '(requester_document_id)'),
    ('idx_data_disputes_target', '(target_type, target_id)'),
    ('idx_data_disputes_status', '(status)'), ('idx_data_disputes_due_at', '(due_at)'),
    ('idx_data_disputes_dispute_type', '(dispute_type)'), ('idx_data_disputes_user_id', '(user_id)')
  ) as expected(index_name, definition_fragment)
  loop
    existing_kind := null; index_definition := null; index_is_valid := null; index_is_unique := null; index_has_predicate := null;
    select c.relkind, pg_get_indexdef(c.oid), i.indisvalid, i.indisunique, i.indpred is not null
      into existing_kind, index_definition, index_is_valid, index_is_unique, index_has_predicate
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    left join pg_index i on i.indexrelid = c.oid
    where n.nspname = 'public' and c.relname = index_spec.index_name;

    if existing_kind is null then
      execute format('create index %I on public.data_disputes %s', index_spec.index_name, index_spec.definition_fragment);
    elsif existing_kind <> 'i' or index_definition is null then
      raise exception 'INCOMPATIBLE_SCHEMA: object % exists but is not an index', index_spec.index_name;
    elsif not index_is_valid or index_is_unique or index_has_predicate
      or position(index_spec.definition_fragment in index_definition) = 0
      or position('public.data_disputes' in index_definition) = 0 then
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
  where n.nspname = 'public' and p.proname = 'set_data_dispute_due_at';
  if existing_count > 1 or (existing_count = 1 and (function_return_type <> 'trigger'::regtype
    or function_language <> 'plpgsql' or function_arguments <> 0 or function_kind <> 'f')) then
    raise exception 'INCOMPATIBLE_SCHEMA: set_data_dispute_due_at has an unexpected signature or language';
  end if;
end $$;

-- Provisional product SLA only: calendar days, pending qualified legal validation.
create or replace function public.set_data_dispute_due_at()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.due_at is null then
    new.due_at := coalesce(new.submitted_at, now()) + interval '15 days';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

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
  from pg_trigger t where t.tgrelid = 'public.data_disputes'::regclass
    and t.tgname = 'trg_set_data_dispute_due_at' and not t.tgisinternal;
  trigger_exists := coalesce(trigger_exists, false);
  if not trigger_exists then
    create trigger trg_set_data_dispute_due_at before insert or update on public.data_disputes
      for each row execute function public.set_data_dispute_due_at();
  elsif trigger_type <> 23 or trigger_function <> 'public.set_data_dispute_due_at()'::regprocedure
    or trigger_arguments <> 0 or trigger_has_condition then
    raise exception 'INCOMPATIBLE_SCHEMA: trg_set_data_dispute_due_at has an unexpected definition';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_policy where polrelid = 'public.data_disputes'::regclass) then
    raise exception 'INCOMPATIBLE_SCHEMA: backend-only data_disputes must not have direct-client policies';
  end if;
end $$;

alter table public.data_disputes enable row level security;
alter table public.data_disputes force row level security;

revoke all on table public.data_disputes from public, anon, authenticated, service_role;
grant usage on schema public to service_role;
grant select, insert, update on table public.data_disputes to service_role;

revoke all on type public.data_dispute_target_type from public, anon, authenticated, service_role;
revoke all on type public.data_dispute_type from public, anon, authenticated, service_role;
revoke all on type public.data_dispute_status from public, anon, authenticated, service_role;
grant usage on type public.data_dispute_target_type, public.data_dispute_type, public.data_dispute_status to service_role;

revoke all on function public.set_data_dispute_due_at() from public, anon, authenticated, service_role;
grant execute on function public.set_data_dispute_due_at() to service_role;

commit;
