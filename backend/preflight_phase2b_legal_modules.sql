begin transaction read only;

with
expected_relations(module_name, relation_name) as (
  values
    ('data_disputes','data_disputes'),
    ('human_review_requests','human_review_requests'),
    ('data_inventory','data_inventory_items'),
    ('legal_case_signals','legal_case_signals')
),
expected_enums(type_name, expected_labels) as (
  values
    ('data_dispute_target_type',array['report','judicial_signal','score','search_result','other']::text[]),
    ('data_dispute_type',array['inaccurate','outdated','paid_or_resolved','identity_theft','unauthorized_processing','not_mine','other']::text[]),
    ('data_dispute_status',array['received','in_review','awaiting_user_info','accepted','rejected','resolved']::text[]),
    ('data_inventory_domain',array['users','reports','judicial_signals','searches','payments','scoring','admin_audit','legal_requests']::text[]),
    ('data_inventory_category',array['identification','contact','financial','behavioral','judicial','transactional','technical','legal','derived_score']::text[]),
    ('data_inventory_sensitivity',array['low','medium','high','sensitive']::text[]),
    ('data_inventory_source_type',array['user_provided','admin_provided','public_registry','third_party_report','system_generated','payment_provider']::text[]),
    ('data_inventory_legal_basis',array['consent','contract','legal_obligation','public_source','legitimate_interest']::text[])
),
expected_signal_columns(column_name,type_name,default_fragment) as (
  values
    ('data_origin','text',null),('source_type','text',null),('source_name','text',null),
    ('legal_basis','text',null),('consent_required','boolean','true'),
    ('consent_verified','boolean','false'),('public_source_flag','boolean','false'),
    ('impacts_scoring','boolean','false'),('legal_review_status','text','pending'),
    ('legal_notes','text',null),('created_by_admin_id','uuid',null)
),
role_state as (
  select jsonb_object_agg(required.role_name,jsonb_build_object(
    'exists',r.rolname is not null,
    'bypass_rls',coalesce(r.rolbypassrls,false)
  )) as result
  from (values ('anon'),('authenticated'),('service_role')) required(role_name)
  left join pg_roles r on r.rolname=required.role_name
),
relation_state as (
  select jsonb_object_agg(er.module_name,jsonb_build_object(
    'regclass',to_regclass(format('public.%I',er.relation_name))::text,
    'relation_kind',c.relkind,
    'rls_enabled',c.relrowsecurity,
    'rls_forced',c.relforcerowsecurity,
    'owner',pg_get_userbyid(c.relowner),
    'raw_acl',coalesce(c.relacl::text,'<owner/default ACL>'),
    'policies',coalesce((select jsonb_agg(p.polname order by p.polname) from pg_policy p where p.polrelid=c.oid),'[]'::jsonb),
    'columns',coalesce((select jsonb_agg(jsonb_build_object(
      'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
    'constraints',coalesce((select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname)
      from pg_constraint con where con.conrelid=c.oid),'[]'::jsonb),
    'indexes',coalesce((select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname)
      from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid),'[]'::jsonb),
    'triggers',coalesce((select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname)
      from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'[]'::jsonb)
  )) as result
  from expected_relations er
  left join pg_class c on c.oid=to_regclass(format('public.%I',er.relation_name))
),
enum_state as (
  select jsonb_object_agg(ee.type_name,jsonb_build_object(
    'kind',t.typtype,
    'actual_labels',actual.labels,
    'expected_labels',ee.expected_labels,
    'compatible',t.typtype='e' and actual.labels is not distinct from ee.expected_labels
  )) as result
  from expected_enums ee
  left join pg_type t on t.typname=ee.type_name and t.typnamespace=(select oid from pg_namespace where nspname='public')
  left join lateral (
    select array_agg(e.enumlabel::text order by e.enumsortorder) labels
    from pg_enum e where e.enumtypid=t.oid
  ) actual on true
),
signal_gap as (
  select jsonb_build_object(
    'expected_fields',jsonb_agg(jsonb_build_object(
      'name',esc.column_name,'expected_type',esc.type_name,'expected_default',esc.default_fragment,
      'actual_type',format_type(a.atttypid,a.atttypmod),'actual_not_null',a.attnotnull,
      'actual_default',pg_get_expr(d.adbin,d.adrelid),
      'missing',a.attname is null
    ) order by esc.column_name),
    'tenant_fk_present',exists(
      select 1 from pg_constraint con
      where con.conrelid=to_regclass('public.legal_case_signals')
        and con.confrelid=to_regclass('public.tenants') and con.contype='f'
    )
  ) result
  from expected_signal_columns esc
  left join pg_attribute a on a.attrelid=to_regclass('public.legal_case_signals')
    and a.attname=esc.column_name and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
)
select jsonb_build_object(
  'mode','PHASE2B PREFLIGHT - READ ONLY',
  'roles',(select result from role_state),
  'relations',(select result from relation_state),
  'enums',(select result from enum_state),
  'legal_case_signals_reconciliation',(select result from signal_gap),
  'decision','Review incompatible objects and ACLs before running any migration'
) as phase2b_preflight;

commit;
