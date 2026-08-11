begin transaction read only;

with
target as (
  select to_regclass('public.legal_case_signals') as relation_oid
),
relation_state as (
  select
    t.relation_oid,
    c.relkind,
    c.relowner,
    owner_role.rolname as owner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relacl
  from target t
  left join pg_class c on c.oid = t.relation_oid
  left join pg_roles owner_role on owner_role.oid = c.relowner
),
requested_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
),
role_state as (
  select
    requested.role_name,
    role.oid as role_oid,
    role.rolbypassrls
  from requested_roles requested
  left join pg_roles role on role.rolname = requested.role_name
),
privileges(privilege_type) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
),
raw_acl as (
  select acl.*
  from relation_state relation
  cross join lateral aclexplode(relation.relacl) acl
),
principals(principal_name, principal_oid, is_public) as (
  select 'PUBLIC', null::oid, true
  union all
  select role_name, role_oid, false from role_state
),
privilege_matrix as (
  select
    principal.principal_name,
    privilege.privilege_type,
    case
      when relation.relation_oid is null then false
      when principal.is_public then exists (
        select 1 from raw_acl acl
        where acl.grantee = 0 and acl.privilege_type = privilege.privilege_type
      )
      when principal.principal_oid is null then false
      else has_table_privilege(
        principal.principal_oid,
        relation.relation_oid,
        privilege.privilege_type
      )
    end as effective
  from principals principal
  cross join privileges privilege
  cross join relation_state relation
),
failures as (
  select 'TABLE_MISSING' as code,
    'public.legal_case_signals does not exist' as detail
  from relation_state where relation_oid is null

  union all

  select 'RELATION_KIND',
    format('unexpected relkind: %s', relkind)
  from relation_state
  where relation_oid is not null and relkind not in ('r', 'p')

  union all

  select 'OWNER_CHANGED',
    format('expected owner postgres, found %s', coalesce(owner, '<missing>'))
  from relation_state
  where relation_oid is not null and owner is distinct from 'postgres'

  union all

  select 'RLS_NOT_ENABLED', 'row level security is not enabled'
  from relation_state
  where relation_oid is not null and relrowsecurity is distinct from true

  union all

  select 'RLS_NOT_FORCED', 'row level security is not forced'
  from relation_state
  where relation_oid is not null and relforcerowsecurity is distinct from true

  union all

  select 'POLICIES_PRESENT', format('%s policies exist', count(*))
  from relation_state relation
  join pg_policy policy on policy.polrelid = relation.relation_oid
  having count(*) > 0

  union all

  select 'ROLE_MISSING', format('%s does not exist', role_name)
  from role_state where role_oid is null

  union all

  select 'SERVICE_ROLE_WITHOUT_BYPASSRLS', 'service_role.rolbypassrls is not true'
  from role_state
  where role_name = 'service_role'
    and role_oid is not null
    and rolbypassrls is distinct from true

  union all

  select 'CLIENT_OR_PUBLIC_PRIVILEGE',
    format('%s retains effective %s', principal_name, privilege_type)
  from privilege_matrix
  where principal_name in ('PUBLIC', 'anon', 'authenticated') and effective

  union all

  select 'SERVICE_ROLE_REQUIRED_PRIVILEGE_MISSING',
    format('service_role lacks effective %s', privilege_type)
  from privilege_matrix
  where principal_name = 'service_role'
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
    and not effective

  union all

  select 'SERVICE_ROLE_FORBIDDEN_PRIVILEGE',
    format('service_role retains effective %s', privilege_type)
  from privilege_matrix
  where principal_name = 'service_role'
    and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
    and effective

  union all

  select 'SERVICE_ROLE_DIRECT_ACL_MISMATCH',
    'service_role direct ACL is not exactly SELECT, INSERT, UPDATE without grant option'
  from relation_state relation
  cross join role_state service
  where service.role_name = 'service_role'
    and service.role_oid is not null
    and (
      (select count(*) from raw_acl acl where acl.grantee = service.role_oid) <> 3
      or (select count(*) from raw_acl acl
          where acl.grantee = service.role_oid
            and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE')) <> 3
      or exists (select 1 from raw_acl acl
          where acl.grantee = service.role_oid and acl.is_grantable)
    )

  union all

  select 'UNEXPECTED_ACL_GRANTEE',
    format('unexpected ACL grantee oid %s', acl.grantee)
  from raw_acl acl
  cross join relation_state relation
  left join role_state service on service.role_name = 'service_role'
  where acl.grantee <> relation.relowner
    and acl.grantee <> coalesce(service.role_oid, 0)
),
summary as (
  select jsonb_build_object(
    'status', case when count(*) = 0 then 'VERIFIED' else 'FAILED' end,
    'failures', coalesce(
      jsonb_agg(jsonb_build_object('code', code, 'detail', detail) order by code, detail)
        filter (where code is not null),
      '[]'::jsonb
    )
  ) as result
  from failures
)
select jsonb_build_object(
  'postcheck', 'legal_case_signals ACL/RLS hardening',
  'owner', relation.owner,
  'relkind', relation.relkind,
  'rls_enabled', relation.relrowsecurity,
  'rls_forced', relation.relforcerowsecurity,
  'policy_count', (
    select count(*) from pg_policy where polrelid = relation.relation_oid
  ),
  'raw_relacl', relation.relacl::text,
  'service_role_rolbypassrls', (
    select rolbypassrls from role_state where role_name = 'service_role'
  ),
  'effective_privileges', coalesce((
    select jsonb_object_agg(principal_name, privilege_rows order by principal_name)
    from (
      select principal_name,
        jsonb_object_agg(privilege_type, effective order by privilege_type) as privilege_rows
      from privilege_matrix
      group by principal_name
    ) grouped
  ), '{}'::jsonb),
  'hardening_verification', (select result from summary)
) as legal_case_signals_acl_hardening_postcheck
from relation_state relation;

commit;
