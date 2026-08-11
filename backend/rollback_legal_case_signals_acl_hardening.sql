begin;

do $$
declare
  target_oid oid;
  target_kind "char";
  target_owner oid;
  unexpected_grantees text[];
begin
  select c.oid, c.relkind, c.relowner
    into target_oid, target_kind, target_owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'legal_case_signals';

  if target_oid is null then
    raise exception 'PREREQUISITE_FAILURE: public.legal_case_signals does not exist';
  end if;
  if target_kind not in ('r', 'p') then
    raise exception 'INCOMPATIBLE_SCHEMA: public.legal_case_signals is not a regular or partitioned table';
  end if;
  if not exists (
    select 1 from pg_roles where oid = target_owner and rolname = 'postgres'
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: public.legal_case_signals owner is no longer postgres';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'PREREQUISITE_FAILURE: baseline roles required for rollback are missing';
  end if;
  if exists (select 1 from pg_policy where polrelid = target_oid) then
    raise exception 'INCOMPATIBLE_SCHEMA: rollback baseline requires exactly zero policies';
  end if;

  select array_agg(coalesce(grantee_role.rolname, acl.grantee::text) order by coalesce(grantee_role.rolname, acl.grantee::text))
    into unexpected_grantees
  from aclexplode((select relacl from pg_class where oid = target_oid)) acl
  left join pg_roles grantee_role on grantee_role.oid = acl.grantee
  where acl.grantee <> 0
    and acl.grantee not in (
      select oid from pg_roles
      where rolname in ('postgres', 'anon', 'authenticated', 'service_role')
    );

  if unexpected_grantees is not null then
    raise exception 'INCOMPATIBLE_SCHEMA: rollback refuses to overwrite unexpected ACL grantees: %',
      array_to_string(unexpected_grantees, ', ');
  end if;
end $$;

alter table public.legal_case_signals no force row level security;
alter table public.legal_case_signals enable row level security;

revoke all privileges on table public.legal_case_signals
  from public, postgres, anon, authenticated, service_role;

grant select, insert, update, delete, truncate, references, trigger, maintain
  on table public.legal_case_signals
  to postgres, anon, authenticated, service_role;

do $$
declare
  target_oid oid := to_regclass('public.legal_case_signals');
  postgres_role_oid oid;
  expected_role record;
begin
  select oid into postgres_role_oid from pg_roles where rolname = 'postgres';
  if not exists (
    select 1
    from pg_class c
    join pg_roles owner_role on owner_role.oid = c.relowner
    where c.oid = target_oid
      and owner_role.rolname = 'postgres'
      and c.relrowsecurity
      and not c.relforcerowsecurity
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: rollback did not restore owner/RLS baseline';
  end if;
  if exists (select 1 from pg_policy where polrelid = target_oid) then
    raise exception 'INCOMPATIBLE_SCHEMA: rollback must leave exactly zero policies';
  end if;
  if exists (
    select 1
    from aclexplode((select relacl from pg_class where oid = target_oid)) acl
    where acl.grantee = 0
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: rollback baseline must not grant privileges to PUBLIC';
  end if;

  for expected_role in
    select oid, rolname
    from pg_roles
    where rolname in ('postgres', 'anon', 'authenticated', 'service_role')
  loop
    if (
      select count(*) <> 8
        or count(*) filter (where acl.privilege_type in (
          'SELECT', 'INSERT', 'UPDATE', 'DELETE',
          'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
        )) <> 8
        or count(*) filter (where acl.grantor = postgres_role_oid) <> 8
        or bool_or(acl.is_grantable)
      from aclexplode((select relacl from pg_class where oid = target_oid)) acl
      where acl.grantee = expected_role.oid
    ) then
      raise exception 'INCOMPATIBLE_SCHEMA: rollback ACL for % does not match arwdDxtm baseline',
        expected_role.rolname;
    end if;
  end loop;

  if (
    select count(distinct acl.grantee) <> 4
    from aclexplode((select relacl from pg_class where oid = target_oid)) acl
  ) then
    raise exception 'INCOMPATIBLE_SCHEMA: rollback ACL contains unexpected or missing grantees';
  end if;
end $$;

commit;
