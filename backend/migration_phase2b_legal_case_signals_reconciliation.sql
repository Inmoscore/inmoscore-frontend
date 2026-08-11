begin;

do $$
declare
  existing_relkind "char";
  required_column text;
  required_columns text[] := array[
    'id','tenant_id','source','source_reference','source_url','cedula_consultada',
    'process_type','process_subject','court_name','city','process_date','detection_date',
    'status','verification_notes','verified_by_admin_id','verified_at',
    'rejected_by_admin_id','rejected_at','dispute_status','dispute_notes','disputed_at',
    'relevance_for_rental_risk','score_impact_enabled','metadata','created_at','updated_at'
  ];
begin
  select c.relkind into existing_relkind
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='legal_case_signals';
  if existing_relkind is null then
    raise exception 'PREREQUISITE_FAILURE: public.legal_case_signals must already exist';
  elsif existing_relkind<>'r' then
    raise exception 'INCOMPATIBLE_SCHEMA: public.legal_case_signals is not a regular table';
  end if;

  if to_regclass('public.tenants') is null then
    raise exception 'PREREQUISITE_FAILURE: public.tenants must already exist';
  end if;
  foreach required_column in array required_columns loop
    if not exists (
      select 1 from pg_attribute where attrelid='public.legal_case_signals'::regclass
        and attname=required_column and attnum>0 and not attisdropped
    ) then
      raise exception 'INCOMPATIBLE_SCHEMA: required base column legal_case_signals.% is missing', required_column;
    end if;
  end loop;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute source_column on source_column.attrelid=c.conrelid and source_column.attname='tenant_id'
    join pg_attribute target_column on target_column.attrelid=c.confrelid and target_column.attname='id'
    where c.conrelid='public.legal_case_signals'::regclass and c.contype='f'
      and c.confrelid=to_regclass('public.tenants')
      and c.conkey=array[source_column.attnum]::smallint[]
      and c.confkey=array[target_column.attnum]::smallint[]
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: legal_case_signals.tenant_id must reference public.tenants(id)';
  end if;
  if not exists (
    select 1 from pg_class where oid='public.legal_case_signals'::regclass and relrowsecurity
  ) then
    raise exception 'PREREQUISITE_FAILURE: public.legal_case_signals must have RLS enabled';
  end if;
end $$;

-- These are the exact eleven fields confirmed missing in Production. Existing rows
-- receive only the documented defaults; no other table, column, constraint or data is touched.
alter table public.legal_case_signals
  add column if not exists data_origin text,
  add column if not exists source_type text,
  add column if not exists source_name text,
  add column if not exists legal_basis text,
  add column if not exists consent_required boolean default true,
  add column if not exists consent_verified boolean default false,
  add column if not exists public_source_flag boolean default false,
  add column if not exists impacts_scoring boolean default false,
  add column if not exists legal_review_status text default 'pending',
  add column if not exists legal_notes text,
  add column if not exists created_by_admin_id uuid;

do $$
declare
  column_spec record;
  actual_type oid;
  actual_not_null boolean;
  actual_default text;
begin
  for column_spec in select * from (values
    ('data_origin','text',false,null), ('source_type','text',false,null),
    ('source_name','text',false,null), ('legal_basis','text',false,null),
    ('consent_required','boolean',false,'true'), ('consent_verified','boolean',false,'false'),
    ('public_source_flag','boolean',false,'false'), ('impacts_scoring','boolean',false,'false'),
    ('legal_review_status','text',false,'pending'), ('legal_notes','text',false,null),
    ('created_by_admin_id','uuid',false,null)
  ) expected(column_name,type_name,required_not_null,default_fragment)
  loop
    select a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
      into actual_type,actual_not_null,actual_default
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.legal_case_signals'::regclass and a.attname=column_spec.column_name
      and a.attnum>0 and not a.attisdropped;
    if actual_type<>to_regtype(column_spec.type_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: column legal_case_signals.% has an unexpected type',column_spec.column_name;
    end if;
    if actual_not_null is distinct from column_spec.required_not_null then
      raise exception 'INCOMPATIBLE_SCHEMA: column legal_case_signals.% has unexpected nullability',column_spec.column_name;
    end if;
    if column_spec.default_fragment is null and actual_default is not null then
      raise exception 'INCOMPATIBLE_SCHEMA: column legal_case_signals.% has an unexpected default',column_spec.column_name;
    end if;
    if column_spec.default_fragment is not null and (actual_default is null or position(column_spec.default_fragment in actual_default)=0) then
      raise exception 'INCOMPATIBLE_SCHEMA: column legal_case_signals.% has an unexpected default',column_spec.column_name;
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
    ('legal_case_signals_source_type_check', array['user_provided','admin_provided','public_registry','judicial_public_source','third_party_report','system_generated']::text[],
      'check (source_type is null or source_type in (''user_provided'',''admin_provided'',''public_registry'',''judicial_public_source'',''third_party_report'',''system_generated''))'),
    ('legal_case_signals_legal_basis_check', array['consent','public_source','legitimate_interest','contract','legal_obligation']::text[],
      'check (legal_basis is null or legal_basis in (''consent'',''public_source'',''legitimate_interest'',''contract'',''legal_obligation''))'),
    ('legal_case_signals_legal_review_status_check', array['pending','reviewed','approved','rejected','needs_more_info']::text[],
      'check (legal_review_status is null or legal_review_status in (''pending'',''reviewed'',''approved'',''rejected'',''needs_more_info''))')
  ) expected(constraint_name,required_values,create_clause)
  loop
    existing_type:=null; existing_definition:=null;
    select c.contype,pg_get_constraintdef(c.oid) into existing_type,existing_definition
    from pg_constraint c where c.conrelid='public.legal_case_signals'::regclass and c.conname=check_spec.constraint_name;
    if existing_type is null then
      execute format('alter table public.legal_case_signals add constraint %I %s',check_spec.constraint_name,check_spec.create_clause);
    elsif existing_type<>'c' or exists (
      select 1 from unnest(check_spec.required_values) value where position(quote_literal(value) in existing_definition)=0
    ) then
      raise exception 'INCOMPATIBLE_SCHEMA: CHECK constraint % has an unexpected definition',check_spec.constraint_name;
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
    ('idx_legal_case_signals_source_type','(source_type)'),
    ('idx_legal_case_signals_legal_basis','(legal_basis)'),
    ('idx_legal_case_signals_impacts_scoring','(impacts_scoring)'),
    ('idx_legal_case_signals_legal_review_status','(legal_review_status)')
  ) expected(index_name,definition_fragment)
  loop
    existing_kind:=null; index_definition:=null; index_is_valid:=null; index_is_unique:=null; index_has_predicate:=null;
    select c.relkind,pg_get_indexdef(c.oid),i.indisvalid,i.indisunique,i.indpred is not null
      into existing_kind,index_definition,index_is_valid,index_is_unique,index_has_predicate
    from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_index i on i.indexrelid=c.oid
    where n.nspname='public' and c.relname=index_spec.index_name;
    if existing_kind is null then
      execute format('create index %I on public.legal_case_signals %s',index_spec.index_name,index_spec.definition_fragment);
    elsif existing_kind<>'i' or index_definition is null then
      raise exception 'INCOMPATIBLE_SCHEMA: object % exists but is not an index',index_spec.index_name;
    elsif not index_is_valid or index_is_unique or index_has_predicate or position(index_spec.definition_fragment in index_definition)=0
      or position('public.legal_case_signals' in index_definition)=0 then
      raise exception 'INCOMPATIBLE_SCHEMA: index % has an unexpected definition',index_spec.index_name;
    end if;
  end loop;
end $$;

-- ACLs are deliberately observed, not changed. External consumers have not been ruled out.
do $$
declare acl_report jsonb;
begin
  select jsonb_build_object(
    'owner',pg_get_userbyid(c.relowner),
    'raw_acl',coalesce(c.relacl::text,'<owner/default ACL>'),
    'rls_enabled',c.relrowsecurity,
    'rls_forced',c.relforcerowsecurity,
    'policies',coalesce((select jsonb_agg(p.polname order by p.polname) from pg_policy p where p.polrelid=c.oid),'[]'::jsonb)
  ) into acl_report
  from pg_class c where c.oid='public.legal_case_signals'::regclass;
  raise notice 'PHASE2B legal_case_signals ACL unchanged: %',acl_report;
end $$;

commit;
