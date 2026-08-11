begin;

do $$
declare
  target_oid oid;
  target_kind "char";
  target_owner oid;
  target_acl aclitem[];
  service_role_oid oid;
  inherited_evidence text[];
  unexplained_evidence text[];
  unexpected_grantees text[];
begin
  select c.oid, c.relkind, c.relowner, c.relacl
    into target_oid, target_kind, target_owner, target_acl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'legal_case_signals';

  if target_oid is null then
    raise exception 'PREREQUISITE_FAILURE: public.legal_case_signals does not exist';
  end if;
  if target_kind not in ('r', 'p') then
    raise exception 'INCOMPATIBLE_SCHEMA: public.legal_case_signals is not a regular or partitioned table';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'PREREQUISITE_FAILURE: required Supabase roles are missing';
  end if;

  select oid into service_role_oid from pg_roles where rolname = 'service_role';
  if not exists (
    select 1 from pg_roles where oid = service_role_oid and rolbypassrls
  ) then
    raise exception 'PREREQUISITE_FAILURE: service_role.rolbypassrls must be true';
  end if;

  if exists (
    select 1 from pg_policy where polrelid = target_oid
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: public.legal_case_signals must have exactly zero policies';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
      and oid = target_owner
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: anon, authenticated, and service_role must not own public.legal_case_signals';
  end if;

  if exists (
    select 1 from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role') and rolsuper
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: target roles must not be superusers because exact effective ACLs could not be guaranteed';
  end if;

  select array_agg(coalesce(grantee_role.rolname, acl.grantee::text) order by coalesce(grantee_role.rolname, acl.grantee::text))
    into unexpected_grantees
  from aclexplode(target_acl) acl
  left join pg_roles grantee_role on grantee_role.oid = acl.grantee
  where acl.grantee <> 0
    and acl.grantee <> target_owner
    and acl.grantee not in (
      select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
    );

  if unexpected_grantees is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: unexpected direct ACL grantees exist: %',
      array_to_string(unexpected_grantees, ', ');
  end if;

  with recursive
  requested_roles as (
    select oid as principal_oid, rolname as principal_name, rolinherit
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  ),
  memberships as (
    select
      principal_oid,
      principal_name,
      principal_oid as inherited_role_oid,
      principal_name as inherited_role_name,
      0 as depth,
      rolinherit as inheritance_active,
      array[principal_oid]::oid[] as role_path
    from requested_roles

    union all

    select
      m.principal_oid,
      m.principal_name,
      parent_role.oid,
      parent_role.rolname,
      m.depth + 1,
      m.inheritance_active and member_role.rolinherit,
      m.role_path || parent_role.oid
    from memberships m
    join pg_auth_members am on am.member = m.inherited_role_oid
    join pg_roles member_role on member_role.oid = am.member
    join pg_roles parent_role on parent_role.oid = am.roleid
    where not parent_role.oid = any(m.role_path)
  ),
  inherited_findings as (
    select distinct format(
      '%s inherits %s via role %s',
      m.principal_name,
      acl.privilege_type,
      m.inherited_role_name
    ) as finding
    from memberships m
    join aclexplode(target_acl) acl on acl.grantee = m.inherited_role_oid
    where m.depth > 0 and m.inheritance_active

    union

    select distinct format(
      '%s actively inherits table owner role %s',
      m.principal_name,
      m.inherited_role_name
    )
    from memberships m
    where m.depth > 0
      and m.inheritance_active
      and m.inherited_role_oid = target_owner
  )
  select array_agg(finding order by finding)
    into inherited_evidence
  from inherited_findings;

  if inherited_evidence is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: active inherited privileges prevent exact ACL enforcement: %',
      array_to_string(inherited_evidence, '; ');
  end if;

  with recursive
  requested_roles as (
    select oid as principal_oid, rolname as principal_name, rolinherit
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  ),
  memberships as (
    select
      principal_oid,
      principal_name,
      principal_oid as inherited_role_oid,
      0 as depth,
      rolinherit as inheritance_active,
      array[principal_oid]::oid[] as role_path
    from requested_roles

    union all

    select
      m.principal_oid,
      m.principal_name,
      parent_role.oid,
      m.depth + 1,
      m.inheritance_active and member_role.rolinherit,
      m.role_path || parent_role.oid
    from memberships m
    join pg_auth_members am on am.member = m.inherited_role_oid
    join pg_roles member_role on member_role.oid = am.member
    join pg_roles parent_role on parent_role.oid = am.roleid
    where not parent_role.oid = any(m.role_path)
  ),
  privileges(privilege_type) as (
    values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
  ),
  acl as (
    select * from aclexplode(target_acl)
  ),
  unexplained as (
    select format('%s has unexplained effective %s', r.principal_name, p.privilege_type) as finding
    from requested_roles r
    cross join privileges p
    where has_table_privilege(r.principal_oid, target_oid, p.privilege_type)
      and not exists (
        select 1 from acl
        where acl.grantee = r.principal_oid and acl.privilege_type = p.privilege_type
      )
      and not exists (
        select 1 from acl
        where acl.grantee = 0 and acl.privilege_type = p.privilege_type
      )
      and not exists (
        select 1
        from memberships m
        join acl on acl.grantee = m.inherited_role_oid
        where m.principal_oid = r.principal_oid
          and m.depth > 0
          and m.inheritance_active
          and acl.privilege_type = p.privilege_type
      )
  )
  select array_agg(finding order by finding)
    into unexplained_evidence
  from unexplained;

  if unexplained_evidence is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: unexplained effective privileges prevent exact ACL enforcement: %',
      array_to_string(unexplained_evidence, '; ');
  end if;
end $$;

alter table public.legal_case_signals enable row level security;
alter table public.legal_case_signals force row level security;

revoke all privileges on table public.legal_case_signals from public, anon, authenticated, service_role;
grant select, insert, update on table public.legal_case_signals to service_role;

do $$
declare
  target_oid oid := to_regclass('public.legal_case_signals');
  service_role_oid oid;
  inspected_role record;
  privilege_name text;
begin
  select oid into service_role_oid from pg_roles where rolname = 'service_role';

  if not exists (
    select 1 from pg_class
    where oid = target_oid and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: RLS must be enabled and forced after hardening';
  end if;
  if exists (select 1 from pg_policy where polrelid = target_oid) then
    raise exception 'INCOMPATIBLE_SCHEMA: hardening must leave exactly zero policies';
  end if;
  if exists (
    select 1 from aclexplode((select relacl from pg_class where oid = target_oid)) acl
    where acl.grantee = 0
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: PUBLIC retains table privileges after hardening';
  end if;

  for inspected_role in
    select oid, rolname from pg_roles where rolname in ('anon', 'authenticated')
  loop
    foreach privilege_name in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE',
      'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]
    loop
      if has_table_privilege(inspected_role.oid, target_oid, privilege_name) then
        raise exception 'INCOMPATIBLE_SCHEMA: % retains effective % after hardening',
          inspected_role.rolname, privilege_name;
      end if;
    end loop;
  end loop;

  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE']
  loop
    if not has_table_privilege(service_role_oid, target_oid, privilege_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: service_role lacks required % after hardening', privilege_name;
    end if;
  end loop;
  foreach privilege_name in array array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
  loop
    if has_table_privilege(service_role_oid, target_oid, privilege_name) then
      raise exception 'INCOMPATIBLE_SCHEMA: service_role retains forbidden % after hardening', privilege_name;
    end if;
  end loop;

  if (
    select count(*) <> 3
      or count(*) filter (where acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE')) <> 3
      or bool_or(acl.is_grantable)
    from aclexplode((select relacl from pg_class where oid = target_oid)) acl
    where acl.grantee = service_role_oid
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: service_role direct ACL is not exactly SELECT, INSERT, UPDATE without grant option';
  end if;
end $$;

commit;
