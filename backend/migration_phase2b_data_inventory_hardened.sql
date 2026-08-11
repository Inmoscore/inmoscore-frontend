begin;

create extension if not exists pgcrypto;

do $$
declare
  enum_spec record;
  existing_kind "char";
  existing_labels text[];
begin
  for enum_spec in select * from (values
    ('data_inventory_domain', array['users','reports','judicial_signals','searches','payments','scoring','admin_audit','legal_requests']::text[]),
    ('data_inventory_category', array['identification','contact','financial','behavioral','judicial','transactional','technical','legal','derived_score']::text[]),
    ('data_inventory_sensitivity', array['low','medium','high','sensitive']::text[]),
    ('data_inventory_source_type', array['user_provided','admin_provided','public_registry','third_party_report','system_generated','payment_provider']::text[]),
    ('data_inventory_legal_basis', array['consent','contract','legal_obligation','public_source','legitimate_interest']::text[])
  ) as expected(type_name, labels)
  loop
    existing_kind := null; existing_labels := null;
    select t.typtype, array_agg(e.enumlabel::text order by e.enumsortorder)
      into existing_kind, existing_labels
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    left join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public' and t.typname = enum_spec.type_name
    group by t.typtype;
    if existing_kind is null then
      execute format('create type public.%I as enum (%s)', enum_spec.type_name,
        (select string_agg(quote_literal(label), ', ') from unnest(enum_spec.labels) valueset(label)));
    elsif existing_kind <> 'e' or existing_labels is distinct from enum_spec.labels then
      raise exception 'INCOMPATIBLE_SCHEMA: public.% has an unexpected enum definition', enum_spec.type_name;
    end if;
  end loop;
end $$;

do $$
declare existing_relkind "char";
begin
  select c.relkind into existing_relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'data_inventory_items';
  if existing_relkind is not null and existing_relkind <> 'r' then
    raise exception 'INCOMPATIBLE_SCHEMA: public.data_inventory_items exists but is not a regular table';
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

create table if not exists public.data_inventory_items (
  id uuid primary key default gen_random_uuid(),
  data_domain public.data_inventory_domain not null,
  field_name text not null,
  description text not null,
  data_category public.data_inventory_category not null,
  sensitivity_level public.data_inventory_sensitivity not null,
  source_type public.data_inventory_source_type not null,
  legal_basis public.data_inventory_legal_basis not null,
  purpose text not null,
  retention_policy text not null,
  retention_days integer,
  impacts_scoring boolean not null default false,
  requires_consent boolean not null default true,
  is_public_source boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_inventory_items_retention_days_check check (retention_days is null or retention_days >= 0),
  constraint data_inventory_items_domain_field_unique unique (data_domain, field_name)
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
  execute 'select exists (select 1 from public.data_inventory_items limit 1)' into table_has_rows;
  select array_agg(required_column) into missing_required_columns
  from unnest(array['data_domain','field_name','description','data_category','sensitivity_level','source_type','legal_basis','purpose','retention_policy']) required(required_column)
  where not exists (
    select 1 from pg_attribute a where a.attrelid = 'public.data_inventory_items'::regclass
      and a.attname = required_column and a.attnum > 0 and not a.attisdropped
  );
  if table_has_rows and missing_required_columns is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: populated data_inventory_items lacks required columns: %',
      array_to_string(missing_required_columns, ', ');
  end if;

  alter table public.data_inventory_items
    add column if not exists id uuid not null default gen_random_uuid(),
    add column if not exists data_domain public.data_inventory_domain not null,
    add column if not exists field_name text not null,
    add column if not exists description text not null,
    add column if not exists data_category public.data_inventory_category not null,
    add column if not exists sensitivity_level public.data_inventory_sensitivity not null,
    add column if not exists source_type public.data_inventory_source_type not null,
    add column if not exists legal_basis public.data_inventory_legal_basis not null,
    add column if not exists purpose text not null,
    add column if not exists retention_policy text not null,
    add column if not exists retention_days integer,
    add column if not exists impacts_scoring boolean not null default false,
    add column if not exists requires_consent boolean not null default true,
    add column if not exists is_public_source boolean not null default false,
    add column if not exists is_active boolean not null default true,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

  for column_spec in select * from (values
    ('id','uuid',true,'gen_random_uuid'), ('data_domain','public.data_inventory_domain',true,null),
    ('field_name','text',true,null), ('description','text',true,null),
    ('data_category','public.data_inventory_category',true,null),
    ('sensitivity_level','public.data_inventory_sensitivity',true,null),
    ('source_type','public.data_inventory_source_type',true,null),
    ('legal_basis','public.data_inventory_legal_basis',true,null),
    ('purpose','text',true,null), ('retention_policy','text',true,null),
    ('retention_days','integer',false,null), ('impacts_scoring','boolean',true,'false'),
    ('requires_consent','boolean',true,'true'), ('is_public_source','boolean',true,'false'),
    ('is_active','boolean',true,'true'), ('created_at','timestamp with time zone',true,'now'),
    ('updated_at','timestamp with time zone',true,'now')
  ) as expected(column_name, type_name, required_not_null, default_fragment)
  loop
    select a.atttypid, a.attnotnull, pg_get_expr(d.adbin,d.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.data_inventory_items'::regclass and a.attname=column_spec.column_name
      and a.attnum>0 and not a.attisdropped;
    if actual_type <> to_regtype(column_spec.type_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_inventory_items.% has an unexpected type', column_spec.column_name;
    end if;
    if actual_not_null is distinct from column_spec.required_not_null then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_inventory_items.% has unexpected nullability', column_spec.column_name;
    end if;
    if column_spec.default_fragment is null and actual_default is not null then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_inventory_items.% has an unexpected default', column_spec.column_name;
    end if;
    if column_spec.default_fragment is not null and (actual_default is null or position(column_spec.default_fragment in actual_default)=0) then
      raise exception 'INCOMPATIBLE_SCHEMA: column data_inventory_items.% has an unexpected default', column_spec.column_name;
    end if;
  end loop;
end $$;

do $$
declare
  pk_count integer;
  pk_definition text;
  existing_type "char";
  existing_definition text;
  domain_attnum smallint;
  field_attnum smallint;
begin
  select count(*), min(pg_get_constraintdef(oid)) into pk_count, pk_definition
  from pg_constraint where conrelid='public.data_inventory_items'::regclass and contype='p';
  if pk_count=0 then
    if exists (select 1 from pg_constraint where conrelid='public.data_inventory_items'::regclass and conname='data_inventory_items_pkey') then
      raise exception 'INCOMPATIBLE_SCHEMA: constraint data_inventory_items_pkey has an unexpected definition';
    end if;
    alter table public.data_inventory_items add constraint data_inventory_items_pkey primary key (id);
  elsif pk_count<>1 or pk_definition<>'PRIMARY KEY (id)' then
    raise exception 'INCOMPATIBLE_SCHEMA: data_inventory_items has an unexpected primary key';
  end if;

  select attnum into domain_attnum from pg_attribute where attrelid='public.data_inventory_items'::regclass and attname='data_domain';
  select attnum into field_attnum from pg_attribute where attrelid='public.data_inventory_items'::regclass and attname='field_name';
  select c.contype, pg_get_constraintdef(c.oid) into existing_type, existing_definition
  from pg_constraint c where c.conrelid='public.data_inventory_items'::regclass and c.conname='data_inventory_items_domain_field_unique';
  if existing_type is null then
    alter table public.data_inventory_items add constraint data_inventory_items_domain_field_unique unique (data_domain, field_name);
  elsif existing_type<>'u' or not exists (
    select 1 from pg_constraint c where c.conrelid='public.data_inventory_items'::regclass
      and c.conname='data_inventory_items_domain_field_unique'
      and c.conkey=array[domain_attnum,field_attnum]::smallint[]
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: UNIQUE constraint data_inventory_items_domain_field_unique has an unexpected definition';
  end if;

  existing_type:=null; existing_definition:=null;
  select c.contype, pg_get_constraintdef(c.oid) into existing_type,existing_definition
  from pg_constraint c where c.conrelid='public.data_inventory_items'::regclass and c.conname='data_inventory_items_retention_days_check';
  if existing_type is null then
    alter table public.data_inventory_items add constraint data_inventory_items_retention_days_check
      check (retention_days is null or retention_days >= 0);
  elsif existing_type<>'c' or position('retention_days >= 0' in existing_definition)=0 then
    raise exception 'INCOMPATIBLE_SCHEMA: CHECK constraint data_inventory_items_retention_days_check has an unexpected definition';
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
    ('idx_data_inventory_items_domain','(data_domain)'),
    ('idx_data_inventory_items_category','(data_category)'),
    ('idx_data_inventory_items_sensitivity','(sensitivity_level)'),
    ('idx_data_inventory_items_legal_basis','(legal_basis)'),
    ('idx_data_inventory_items_impacts_scoring','(impacts_scoring)')
  ) expected(index_name,definition_fragment)
  loop
    existing_kind:=null; index_definition:=null; index_is_valid:=null; index_is_unique:=null; index_has_predicate:=null;
    select c.relkind,pg_get_indexdef(c.oid),i.indisvalid,i.indisunique,i.indpred is not null
      into existing_kind,index_definition,index_is_valid,index_is_unique,index_has_predicate
    from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_index i on i.indexrelid=c.oid
    where n.nspname='public' and c.relname=index_spec.index_name;
    if existing_kind is null then
      execute format('create index %I on public.data_inventory_items %s',index_spec.index_name,index_spec.definition_fragment);
    elsif existing_kind<>'i' or index_definition is null then
      raise exception 'INCOMPATIBLE_SCHEMA: object % exists but is not an index',index_spec.index_name;
    elsif not index_is_valid or index_is_unique or index_has_predicate or position(index_spec.definition_fragment in index_definition)=0
      or position('public.data_inventory_items' in index_definition)=0 then
      raise exception 'INCOMPATIBLE_SCHEMA: index % has an unexpected definition',index_spec.index_name;
    end if;
  end loop;
end $$;

do $$
declare existing_count integer; function_return_type oid; function_language text;
  function_arguments integer; function_kind text;
begin
  select count(*),min(p.prorettype::int)::oid,min(l.lanname),min(p.pronargs),min(p.prokind::text)
    into existing_count,function_return_type,function_language,function_arguments,function_kind
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.proname='set_data_inventory_items_updated_at';
  if existing_count>1 or (existing_count=1 and (function_return_type<>'trigger'::regtype
    or function_language<>'plpgsql' or function_arguments<>0 or function_kind<>'f')) then
    raise exception 'INCOMPATIBLE_SCHEMA: set_data_inventory_items_updated_at has an unexpected signature or language';
  end if;
end $$;

create or replace function public.set_data_inventory_items_updated_at()
returns trigger language plpgsql set search_path=pg_catalog,public
as $$ begin new.updated_at:=now(); return new; end; $$;

do $$
declare trigger_exists boolean:=false; trigger_type smallint; trigger_function oid; trigger_arguments smallint; trigger_has_condition boolean;
begin
  select true,t.tgtype,t.tgfoid,t.tgnargs,t.tgqual is not null
    into trigger_exists,trigger_type,trigger_function,trigger_arguments,trigger_has_condition
  from pg_trigger t where t.tgrelid='public.data_inventory_items'::regclass
    and t.tgname='trg_data_inventory_items_updated_at' and not t.tgisinternal;
  trigger_exists:=coalesce(trigger_exists,false);
  if not trigger_exists then
    create trigger trg_data_inventory_items_updated_at before update on public.data_inventory_items
      for each row execute function public.set_data_inventory_items_updated_at();
  elsif trigger_type<>19 or trigger_function<>'public.set_data_inventory_items_updated_at()'::regprocedure
    or trigger_arguments<>0 or trigger_has_condition then
    raise exception 'INCOMPATIBLE_SCHEMA: trg_data_inventory_items_updated_at has an unexpected definition';
  end if;
end $$;

do $$ begin
  if exists(select 1 from pg_policy where polrelid='public.data_inventory_items'::regclass) then
    raise exception 'INCOMPATIBLE_SCHEMA: backend-only data_inventory_items must not have direct-client policies';
  end if;
end $$;

alter table public.data_inventory_items enable row level security;
alter table public.data_inventory_items force row level security;

revoke all on table public.data_inventory_items from public,anon,authenticated,service_role;
grant usage on schema public to service_role;
grant select,insert,update on table public.data_inventory_items to service_role;

revoke all on type public.data_inventory_domain from public,anon,authenticated,service_role;
revoke all on type public.data_inventory_category from public,anon,authenticated,service_role;
revoke all on type public.data_inventory_sensitivity from public,anon,authenticated,service_role;
revoke all on type public.data_inventory_source_type from public,anon,authenticated,service_role;
revoke all on type public.data_inventory_legal_basis from public,anon,authenticated,service_role;
grant usage on type public.data_inventory_domain,public.data_inventory_category,
  public.data_inventory_sensitivity,public.data_inventory_source_type,
  public.data_inventory_legal_basis to service_role;

revoke all on function public.set_data_inventory_items_updated_at() from public,anon,authenticated,service_role;
grant execute on function public.set_data_inventory_items_updated_at() to service_role;

-- Intentionally no seed DML. An empty inventory is a valid structural state.
commit;
