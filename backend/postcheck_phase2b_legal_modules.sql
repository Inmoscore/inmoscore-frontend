begin transaction read only;

with
modules(module_name,relation_name,expected_columns,expected_indexes,expected_constraints,expected_trigger) as (
  values
    ('data_disputes','data_disputes',
      array['id','user_id','requester_email','requester_name','requester_document_id','target_type','target_id','target_reference','dispute_type','status','description','evidence_url','admin_notes','resolution_summary','submitted_at','due_at','resolved_at','resolved_by','ip_address','user_agent','created_at','updated_at']::text[],
      array['idx_data_disputes_requester_email','idx_data_disputes_requester_document_id','idx_data_disputes_target','idx_data_disputes_status','idx_data_disputes_due_at','idx_data_disputes_dispute_type','idx_data_disputes_user_id']::text[],
      array['data_disputes_pkey','data_disputes_user_id_fkey','data_disputes_resolved_by_fkey']::text[],
      'trg_set_data_dispute_due_at'),
    ('human_review_requests','human_review_requests',
      array['id','user_id','requester_email','requester_name','requester_document_id','cedula_consultada','current_score','current_classification','reason','description','status','admin_notes','review_summary','resolved_at','resolved_by','ip_address','user_agent','created_at','updated_at']::text[],
      array['idx_human_review_requests_user_id','idx_human_review_requests_requester_email','idx_human_review_requests_requester_document_id','idx_human_review_requests_status','idx_human_review_requests_reason','idx_human_review_requests_created_at']::text[],
      array['human_review_requests_pkey','human_review_requests_user_id_fkey','human_review_requests_resolved_by_fkey','human_review_requests_reason_check','human_review_requests_status_check','human_review_requests_current_score_check']::text[],
      'trg_human_review_requests_updated_at'),
    ('data_inventory','data_inventory_items',
      array['id','data_domain','field_name','description','data_category','sensitivity_level','source_type','legal_basis','purpose','retention_policy','retention_days','impacts_scoring','requires_consent','is_public_source','is_active','created_at','updated_at']::text[],
      array['idx_data_inventory_items_domain','idx_data_inventory_items_category','idx_data_inventory_items_sensitivity','idx_data_inventory_items_legal_basis','idx_data_inventory_items_impacts_scoring']::text[],
      array['data_inventory_items_pkey','data_inventory_items_domain_field_unique','data_inventory_items_retention_days_check']::text[],
      'trg_data_inventory_items_updated_at'),
    ('legal_case_signals','legal_case_signals',
      array['data_origin','source_type','source_name','legal_basis','consent_required','consent_verified','public_source_flag','impacts_scoring','legal_review_status','legal_notes','created_by_admin_id']::text[],
      array['idx_legal_case_signals_source_type','idx_legal_case_signals_legal_basis','idx_legal_case_signals_impacts_scoring','idx_legal_case_signals_legal_review_status']::text[],
      array['legal_case_signals_source_type_check','legal_case_signals_legal_basis_check','legal_case_signals_legal_review_status_check']::text[],
      null)
),
expected_enums(type_name,expected_labels) as (
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
enum_checks as (
  select ee.type_name,t.typtype,
    array_agg(e.enumlabel::text order by e.enumsortorder) actual_labels,
    ee.expected_labels
  from expected_enums ee
  left join pg_type t on t.typname=ee.type_name and t.typnamespace=(select oid from pg_namespace where nspname='public')
  left join pg_enum e on e.enumtypid=t.oid
  group by ee.type_name,t.typtype,ee.expected_labels
),
module_checks as (
  select m.module_name,c.oid relation_oid,
    case when c.oid is null then 'NOT_INSTALLED'
      when c.relkind<>'r' then 'INCOMPATIBLE'
      when missing.columns<>array[]::text[] or missing.indexes<>array[]::text[]
        or missing.constraints<>array[]::text[] or not checks_ok.value then 'INCOMPLETE'
      else 'VERIFIED' end status,
    jsonb_build_object(
      'relation_kind',c.relkind,'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,
      'missing_columns',missing.columns,'missing_indexes',missing.indexes,'missing_constraints',missing.constraints,
      'enum_contract_ok',enum_state.ok,
      'trigger_ok',trigger_state.ok,'policy_count',(select count(*) from pg_policy p where p.polrelid=c.oid),
      'raw_acl',coalesce(c.relacl::text,'<owner/default ACL>'),
      'service_role_privileges',jsonb_build_object(
        'select',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'select') end,
        'insert',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'insert') end,
        'update',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'update') end,
        'delete',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'delete') end
      ),
      'client_privileges',jsonb_build_object(
        'anon_any',case when c.oid is null or not exists(select 1 from pg_roles where rolname='anon') then false else
          has_table_privilege('anon',c.oid,'select') or has_table_privilege('anon',c.oid,'insert')
          or has_table_privilege('anon',c.oid,'update') or has_table_privilege('anon',c.oid,'delete') end,
        'authenticated_any',case when c.oid is null or not exists(select 1 from pg_roles where rolname='authenticated') then false else
          has_table_privilege('authenticated',c.oid,'select') or has_table_privilege('authenticated',c.oid,'insert')
          or has_table_privilege('authenticated',c.oid,'update') or has_table_privilege('authenticated',c.oid,'delete') end
      )
    ) details
  from modules m
  left join pg_class c on c.oid=to_regclass(format('public.%I',m.relation_name))
  cross join lateral (
    select
      coalesce(array(select unnest(m.expected_columns) except select a.attname from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),array[]::text[]) columns,
      coalesce(array(select unnest(m.expected_indexes) except select ci.relname from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid and i.indisvalid),array[]::text[]) indexes,
      coalesce(array(select unnest(m.expected_constraints) except select con.conname from pg_constraint con where con.conrelid=c.oid),array[]::text[]) constraints
  ) missing
  cross join lateral (
    select m.expected_trigger is null or exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname=m.expected_trigger and not t.tgisinternal) ok
  ) trigger_state
  cross join lateral (
    select case
      when m.module_name='data_disputes' then not exists (
        select 1 from enum_checks where type_name like 'data_dispute_%'
          and not coalesce(typtype='e' and actual_labels is not distinct from expected_labels,false)
      )
      when m.module_name='data_inventory' then not exists (
        select 1 from enum_checks where type_name like 'data_inventory_%'
          and not coalesce(typtype='e' and actual_labels is not distinct from expected_labels,false)
      )
      else true end ok
  ) enum_state
  cross join lateral (
    select jsonb_build_object(
      'select',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'select') end,
      'insert',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'insert') end,
      'update',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'update') end,
      'delete',case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else has_table_privilege('service_role',c.oid,'delete') end
    ) service_acl,
    case when c.oid is null or not exists(select 1 from pg_roles where rolname='service_role') then false else
      has_table_privilege('service_role',c.oid,'select') and has_table_privilege('service_role',c.oid,'insert')
      and has_table_privilege('service_role',c.oid,'update') and not has_table_privilege('service_role',c.oid,'delete') end backend_minimum_ok,
    case when c.oid is null then false else
      (not exists(select 1 from pg_roles where rolname='anon') or not (
        has_table_privilege('anon',c.oid,'select') or has_table_privilege('anon',c.oid,'insert')
        or has_table_privilege('anon',c.oid,'update') or has_table_privilege('anon',c.oid,'delete')))
      and (not exists(select 1 from pg_roles where rolname='authenticated') or not (
        has_table_privilege('authenticated',c.oid,'select') or has_table_privilege('authenticated',c.oid,'insert')
        or has_table_privilege('authenticated',c.oid,'update') or has_table_privilege('authenticated',c.oid,'delete'))) end clients_blocked
  ) acl_state
  cross join lateral (
    select case when m.module_name='legal_case_signals' then
      c.relrowsecurity and missing.columns=array[]::text[] and missing.indexes=array[]::text[]
      and missing.constraints=array[]::text[]
    else
      c.relrowsecurity and c.relforcerowsecurity and missing.columns=array[]::text[] and missing.indexes=array[]::text[]
      and missing.constraints=array[]::text[] and trigger_state.ok and enum_state.ok
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid)
      and exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls)
      and acl_state.backend_minimum_ok and acl_state.clients_blocked
    end value
  ) checks_ok
),
enum_summary as (
  select jsonb_object_agg(type_name,jsonb_build_object(
    'compatible',typtype='e' and actual_labels is not distinct from expected_labels,
    'actual_labels',actual_labels,'expected_labels',expected_labels
  )) result from enum_checks
)
select jsonb_build_object(
  'mode','PHASE2B POST-CHECK - READ ONLY',
  'modules',(select jsonb_object_agg(module_name,jsonb_build_object('status',status,'details',details)) from module_checks),
  'enums',(select result from enum_summary),
  'interpretation','Each module is independent: VERIFIED is useful even when others are NOT_INSTALLED'
) as phase2b_postcheck;

commit;
