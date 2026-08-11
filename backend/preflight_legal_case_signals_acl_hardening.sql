begin transaction read only;

with recursive
target as (
  select
    to_regclass('public.legal_case_signals') as relation_oid
),
relation_state as (
  select
    t.relation_oid,
    c.relkind,
    c.relowner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relacl
  from target t
  left join pg_class c on c.oid = t.relation_oid
),
requested_roles(role_name) as (
  values
    ('anon'::text collate "C"),
    ('authenticated'::text collate "C"),
    ('service_role'::text collate "C")
),
role_state as (
  select
    rr.role_name::text collate "C" as role_name,
    r.oid as role_oid,
    r.rolsuper,
    r.rolinherit,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolbypassrls
  from requested_roles rr
  left join pg_roles r on r.rolname = rr.role_name
),
membership_closure as (
  select
    rs.role_name::text collate "C" as principal_name,
    rs.role_oid as principal_oid,
    rs.role_oid as inherited_role_oid,
    rs.role_name::text collate "C" as inherited_role_name,
    0 as depth,
    coalesce(rs.rolinherit, false) as inheritance_active,
    case when rs.role_oid is null then array[]::oid[] else array[rs.role_oid]::oid[] end as role_path
  from role_state rs

  union all

  select
    mc.principal_name::text collate "C",
    mc.principal_oid,
    parent_role.oid,
    parent_role.rolname::text collate "C",
    mc.depth + 1,
    mc.inheritance_active and member_role.rolinherit,
    mc.role_path || parent_role.oid
  from membership_closure mc
  join pg_auth_members am on am.member = mc.inherited_role_oid
  join pg_roles member_role on member_role.oid = am.member
  join pg_roles parent_role on parent_role.oid = am.roleid
  where mc.inherited_role_oid is not null
    and not parent_role.oid = any(mc.role_path)
),
raw_acl_expanded as (
  select
    acl.grantor,
    grantor_role.rolname as grantor_name,
    acl.grantee,
    case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end as grantee_name,
    acl.privilege_type,
    acl.is_grantable
  from relation_state rs
  cross join lateral aclexplode(rs.relacl) acl
  left join pg_roles grantor_role on grantor_role.oid = acl.grantor
  left join pg_roles grantee_role on grantee_role.oid = acl.grantee
),
privileges(privilege_type) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
principals(principal_name, principal_oid, is_public) as (
  select 'PUBLIC', null::oid, true
  union all
  select rs.role_name, rs.role_oid, false
  from role_state rs
),
privilege_matrix as (
  select
    p.principal_name,
    pv.privilege_type,
    case
      when rs.relation_oid is null then false
      when p.is_public then exists (
        select 1
        from raw_acl_expanded ra
        where ra.grantee = 0 and ra.privilege_type = pv.privilege_type
      )
      when p.principal_oid is null then false
      else has_table_privilege(p.principal_oid, rs.relation_oid, pv.privilege_type)
    end as effective,
    exists (
      select 1
      from raw_acl_expanded ra
      where ra.grantee = p.principal_oid
        and ra.privilege_type = pv.privilege_type
    ) as directly_granted,
    exists (
      select 1
      from raw_acl_expanded ra
      where ra.grantee = 0
        and ra.privilege_type = pv.privilege_type
    ) as granted_via_public,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'role', mc.inherited_role_name,
          'depth', mc.depth,
          'inheritance_active', mc.inheritance_active,
          'is_grantable', ra.is_grantable
        )
        order by mc.depth, mc.inherited_role_name
      )
      from membership_closure mc
      join raw_acl_expanded ra on ra.grantee = mc.inherited_role_oid
      where mc.principal_name = p.principal_name
        and mc.depth > 0
        and mc.inheritance_active
        and ra.privilege_type = pv.privilege_type
    ), '[]'::jsonb) as inherited_grant_sources
  from principals p
  cross join privileges pv
  cross join relation_state rs
),
active_inherited_acl_evidence as (
  select distinct
    mc.principal_name,
    mc.inherited_role_name as source_role,
    mc.depth,
    ra.privilege_type,
    ra.is_grantable
  from membership_closure mc
  join raw_acl_expanded ra on ra.grantee = mc.inherited_role_oid
  where mc.depth > 0
    and mc.inheritance_active
),
unexplained_effective_privileges as (
  select pm.principal_name, pm.privilege_type
  from privilege_matrix pm
  where pm.principal_name <> 'PUBLIC'
    and pm.effective
    and not pm.directly_granted
    and not pm.granted_via_public
    and jsonb_array_length(pm.inherited_grant_sources) = 0
),
policy_state as (
  select
    p.polname,
    case p.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      when '*' then 'ALL'
      else p.polcmd::text
    end as command,
    case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as policy_mode,
    coalesce((
      select jsonb_agg(
        case when policy_role.role_oid = 0 then 'PUBLIC' else policy_role_name.rolname end
        order by case when policy_role.role_oid = 0 then 'PUBLIC' else policy_role_name.rolname end
      )
      from unnest(p.polroles) as policy_role(role_oid)
      left join pg_roles policy_role_name on policy_role_name.oid = policy_role.role_oid
    ), '[]'::jsonb) as roles,
    pg_get_expr(p.polqual, p.polrelid) as using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
  from relation_state rs
  join pg_policy p on p.polrelid = rs.relation_oid
),
function_definitions as materialized (
  select
    n.nspname as function_schema,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    owner_role.rolname as owner,
    p.prosecdef,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles owner_role on owner_role.oid = p.proowner
  where p.prokind in ('f', 'p')
),
matching_functions as (
  select *
  from function_definitions
  where definition ilike '%legal_case_signals%'
),
view_definitions as materialized (
  select
    n.nspname as view_schema,
    c.relname as view_name,
    case c.relkind when 'v' then 'view' when 'm' then 'materialized_view' end as view_kind,
    owner_role.rolname as owner,
    pg_get_viewdef(c.oid, true) as definition
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles owner_role on owner_role.oid = c.relowner
  where c.relkind in ('v', 'm')
),
matching_views as (
  select *
  from view_definitions
  where definition ilike '%legal_case_signals%'
),
foreign_keys as (
  select
    case when fk.conrelid = rs.relation_oid then 'outgoing' else 'incoming' end as direction,
    source_namespace.nspname as source_schema,
    source_table.relname as source_table,
    fk.conname as constraint_name,
    coalesce((
      select jsonb_agg(source_attribute.attname order by source_key.ordinality)
      from unnest(fk.conkey) with ordinality as source_key(attnum, ordinality)
      join pg_attribute source_attribute
        on source_attribute.attrelid = fk.conrelid
       and source_attribute.attnum = source_key.attnum
    ), '[]'::jsonb) as source_columns,
    target_namespace.nspname as target_schema,
    target_table.relname as target_table,
    coalesce((
      select jsonb_agg(target_attribute.attname order by target_key.ordinality)
      from unnest(fk.confkey) with ordinality as target_key(attnum, ordinality)
      join pg_attribute target_attribute
        on target_attribute.attrelid = fk.confrelid
       and target_attribute.attnum = target_key.attnum
    ), '[]'::jsonb) as target_columns,
    pg_get_constraintdef(fk.oid, true) as definition
  from relation_state rs
  join pg_constraint fk
    on fk.contype = 'f'
   and (fk.conrelid = rs.relation_oid or fk.confrelid = rs.relation_oid)
  join pg_class source_table on source_table.oid = fk.conrelid
  join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
  join pg_class target_table on target_table.oid = fk.confrelid
  join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
),
trigger_state as (
  select
    t.tgname as trigger_name,
    t.tgenabled as enabled_mode,
    function_namespace.nspname as function_schema,
    function_proc.proname as function_name,
    pg_get_function_identity_arguments(function_proc.oid) as function_arguments,
    function_owner.rolname as function_owner,
    function_proc.prosecdef as function_security_definer,
    pg_get_triggerdef(t.oid, true) as trigger_definition
  from relation_state rs
  join pg_trigger t on t.tgrelid = rs.relation_oid and not t.tgisinternal
  join pg_proc function_proc on function_proc.oid = t.tgfoid
  join pg_namespace function_namespace on function_namespace.oid = function_proc.pronamespace
  join pg_roles function_owner on function_owner.oid = function_proc.proowner
),
catalog_dependencies as (
  select distinct
    d.deptype,
    pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object,
    pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) as referenced_object
  from relation_state rs
  join pg_depend d
    on d.refclassid = to_regclass('pg_catalog.pg_class')
   and d.refobjid = rs.relation_oid
),
readiness_blockers as (
  select 'TABLE_MISSING' as code,
    'public.legal_case_signals does not exist' as detail
  from relation_state where relation_oid is null

  union all

  select 'SERVICE_ROLE_MISSING',
    'service_role does not exist'
  from role_state where role_name = 'service_role' and role_oid is null

  union all

  select 'RELATION_IS_NOT_A_TABLE',
    format('public.legal_case_signals has relkind %s instead of a regular or partitioned table', relkind)
  from relation_state
  where relation_oid is not null and relkind not in ('r', 'p')

  union all

  select 'SERVICE_ROLE_WITHOUT_BYPASSRLS',
    'service_role.rolbypassrls is not true'
  from role_state
  where role_name = 'service_role' and role_oid is not null
    and rolbypassrls is distinct from true

  union all

  select 'REQUESTED_ROLE_IS_SUPERUSER',
    format('%s is a superuser, so table ACL revokes cannot guarantee the intended effective privileges', role_name)
  from role_state
  where rolsuper is true

  union all

  select 'REQUESTED_ROLE_OWNS_TABLE',
    format('%s owns public.legal_case_signals, so ownership privileges must be addressed explicitly', role_name)
  from role_state
  cross join relation_state
  where role_oid is not null and role_oid = relowner

  union all

  select 'INHERITS_TABLE_OWNER_ROLE',
    format('%s actively inherits the table owner role %s', mc.principal_name, mc.inherited_role_name)
  from membership_closure mc
  cross join relation_state rs
  where mc.depth > 0
    and mc.inheritance_active
    and mc.inherited_role_oid = rs.relowner

  union all

  select 'UNEXPECTED_POLICIES',
    format('%s policies exist on public.legal_case_signals', count(*))
  from policy_state
  having count(*) > 0

  union all

  select 'ACTIVE_INHERITED_TABLE_PRIVILEGES',
    format('%s active inherited ACL entries require review before exact ACL enforcement', count(*))
  from active_inherited_acl_evidence
  having count(*) > 0

  union all

  select 'UNEXPLAINED_EFFECTIVE_PRIVILEGES',
    format('%s effective privileges are not explained by direct, PUBLIC, or catalog-visible inherited ACL entries', count(*))
  from unexplained_effective_privileges
  having count(*) > 0
),
readiness as (
  select jsonb_build_object(
    'status', case when count(*) = 0 then 'POSTGRESQL_PREREQUISITES_CLEAR' else 'BLOCKED' end,
    'blockers', coalesce(
      jsonb_agg(jsonb_build_object('code', code, 'detail', detail) order by code)
        filter (where code is not null),
      '[]'::jsonb
    ),
    'review_only_counts', jsonb_build_object(
      'functions', (select count(*) from matching_functions),
      'views', (select count(*) from matching_views),
      'foreign_keys', (select count(*) from foreign_keys),
      'triggers', (select count(*) from trigger_state),
      'catalog_dependencies', (select count(*) from catalog_dependencies)
    ),
    'classification_scope', 'Only prerequisites verifiable from PostgreSQL catalogs are classified'
  ) as result
  from readiness_blockers
)
select jsonb_build_object(
  'preflight', 'legal_case_signals ACL/RLS hardening',
  'relation', jsonb_build_object(
    'exists', rs.relation_oid is not null,
    'qualified_name', case when rs.relation_oid is null then null else rs.relation_oid::text end,
    'relkind', rs.relkind,
    'owner', owner_role.rolname,
    'relrowsecurity', rs.relrowsecurity,
    'relforcerowsecurity', rs.relforcerowsecurity,
    'raw_relacl', rs.relacl::text
  ),
  'expanded_acl', coalesce((
    select jsonb_agg(jsonb_build_object(
      'grantor_oid', grantor,
      'grantor', grantor_name,
      'grantee_oid', grantee,
      'grantee', grantee_name,
      'privilege_type', privilege_type,
      'is_grantable', is_grantable
    ) order by grantee_name, privilege_type, grantor_name)
    from raw_acl_expanded
  ), '[]'::jsonb),
  'effective_privileges', coalesce((
    select jsonb_object_agg(principal_name, privilege_rows order by principal_name)
    from (
      select principal_name, jsonb_object_agg(
        privilege_type,
        jsonb_build_object(
          'effective', effective,
          'directly_granted', directly_granted,
          'granted_via_public', granted_via_public,
          'inherited_grant_sources', inherited_grant_sources
        ) order by privilege_type
      ) as privilege_rows
      from privilege_matrix
      group by principal_name
    ) grouped_privileges
  ), '{}'::jsonb),
  'roles', coalesce((
    select jsonb_object_agg(role_name, jsonb_build_object(
      'exists', role_oid is not null,
      'oid', role_oid,
      'rolsuper', rolsuper,
      'rolinherit', rolinherit,
      'rolcreaterole', rolcreaterole,
      'rolcreatedb', rolcreatedb,
      'rolcanlogin', rolcanlogin,
      'rolreplication', rolreplication,
      'rolbypassrls', rolbypassrls
    ) order by role_name)
    from role_state
  ), '{}'::jsonb),
  'transitive_memberships', coalesce((
    select jsonb_agg(jsonb_build_object(
      'principal', principal_name,
      'inherited_role', inherited_role_name,
      'depth', depth,
      'inheritance_active', inheritance_active,
      'role_path_oids', role_path
    ) order by principal_name, depth, inherited_role_name)
    from membership_closure
    where depth > 0
  ), '[]'::jsonb),
  'active_inherited_acl_evidence', coalesce((
    select jsonb_agg(to_jsonb(evidence) order by principal_name, depth, source_role, privilege_type)
    from active_inherited_acl_evidence evidence
  ), '[]'::jsonb),
  'unexplained_effective_privileges', coalesce((
    select jsonb_agg(to_jsonb(evidence) order by principal_name, privilege_type)
    from unexplained_effective_privileges evidence
  ), '[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(to_jsonb(policy) order by polname)
    from policy_state policy
  ), '[]'::jsonb),
  'functions_mentioning_relation', coalesce((
    select jsonb_agg(to_jsonb(function_row) order by function_schema, function_name, arguments)
    from matching_functions function_row
  ), '[]'::jsonb),
  'views_mentioning_relation', coalesce((
    select jsonb_agg(to_jsonb(view_row) order by view_schema, view_name)
    from matching_views view_row
  ), '[]'::jsonb),
  'foreign_keys', coalesce((
    select jsonb_agg(to_jsonb(foreign_key) order by direction, source_schema, source_table, constraint_name)
    from foreign_keys foreign_key
  ), '[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(to_jsonb(trigger_row) order by trigger_name)
    from trigger_state trigger_row
  ), '[]'::jsonb),
  'catalog_dependencies', coalesce((
    select jsonb_agg(to_jsonb(dependency) order by dependent_object, deptype)
    from catalog_dependencies dependency
  ), '[]'::jsonb),
  'hardening_readiness', (select result from readiness),
  'limitations', jsonb_build_array(
    'This preflight only inspects PostgreSQL catalogs and effective database privileges.',
    'PUBLIC effective privileges are represented by grants whose ACL grantee is PUBLIC; PUBLIC is not a PostgreSQL role row.',
    'It cannot detect Supabase Edge Functions, external clients, Railway jobs, CI tasks, or other automations outside PostgreSQL.',
    'Functions, views, foreign keys, triggers, and dependencies are reported for manual review and are not automatically classified as errors.'
  )
) as legal_case_signals_acl_hardening_preflight
from relation_state rs
left join pg_roles owner_role on owner_role.oid = rs.relowner;

commit;
