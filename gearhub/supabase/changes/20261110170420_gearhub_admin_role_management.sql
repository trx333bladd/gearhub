-- Reassert the protected public wrapper and private implementation for admin delegation.
create or replace function private.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_user_id is null or p_role is null then
    raise exception 'User and role are required';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own administrator role';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
end;
$$;
revoke all on function private.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function private.admin_set_user_role(uuid, public.app_role) to authenticated;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_set_user_role(p_user_id, p_role);
$$;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
