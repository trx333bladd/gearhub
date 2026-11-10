-- GearHub admin role delegation and sale catalog values.
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

update public.products set compare_at_price = 89900, badge = 'SALE' where slug = 'logitech-g-pro-x-superlight-2';
update public.products set compare_at_price = 45900, badge = 'SALE' where slug = 'ajazz-ak820-pro';
update public.products set compare_at_price = 199000, badge = 'SALE' where slug = 'wooting-80he';
update public.products set compare_at_price = 119900, badge = 'SALE' where slug = 'razer-viper-v4-pro';
update public.products set compare_at_price = 89900, badge = 'SALE' where slug = 'hyperx-cloud-flight-2';
update public.products set compare_at_price = 44900, badge = 'SALE' where slug = 'fifine-k688';
update public.products set compare_at_price = 79900, badge = 'SALE' where slug = 'xiaomi-g24i';
update public.products set compare_at_price = 52900, badge = 'SALE' where slug = 'artisan-zero-daidai';
update public.products set compare_at_price = 79900, badge = 'SALE' where slug = 'elgato-stream-deck-neo';
