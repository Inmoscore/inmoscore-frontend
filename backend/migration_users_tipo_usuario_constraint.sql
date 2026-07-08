-- Defensive role constraint for public registration hardening.
-- This migration does not change existing data. If unexpected role values exist,
-- it emits a NOTICE and skips the constraint so operators can review first.

do $$
declare
  invalid_role_count integer;
  invalid_role_values text[];
begin
  select
    count(*),
    array_agg(distinct tipo_usuario order by tipo_usuario)
  into invalid_role_count, invalid_role_values
  from users
  where tipo_usuario is null
     or tipo_usuario not in ('usuario', 'admin');

  if invalid_role_count > 0 then
    raise notice
      'Skipping users_tipo_usuario_check: % users have unexpected tipo_usuario values: %',
      invalid_role_count,
      invalid_role_values;
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_tipo_usuario_check'
      and conrelid = 'users'::regclass
  ) then
    alter table users
      add constraint users_tipo_usuario_check
      check (tipo_usuario in ('usuario', 'admin'));
  end if;
end $$;
