begin;

create index if not exists orders_customer_phone_created_at_id_idx
on public.orders (customer_phone, created_at, id);

create or replace function public.admin_duplicate_phone_order_ids(
  p_order_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_ids uuid[] := coalesce(p_order_ids, '{}'::uuid[]);
begin
  if not public.is_admin() then
    raise exception 'Không có quyền kiểm tra đơn hàng trùng số điện thoại.';
  end if;

  if cardinality(v_order_ids) > 50 then
    raise exception 'Chỉ được kiểm tra tối đa 50 đơn hàng mỗi lần.';
  end if;

  return coalesce(
    array(
      select current_order.id
      from public.orders as current_order
      where current_order.id = any(v_order_ids)
        and exists (
          select 1
          from public.orders as previous_order
          where previous_order.customer_phone = current_order.customer_phone
            and (
              previous_order.created_at < current_order.created_at
              or (
                previous_order.created_at = current_order.created_at
                and previous_order.id < current_order.id
              )
            )
        )
      order by current_order.created_at desc, current_order.id desc
    ),
    '{}'::uuid[]
  );
end;
$$;

revoke all on function public.admin_duplicate_phone_order_ids(uuid[])
from public;

grant execute on function public.admin_duplicate_phone_order_ids(uuid[])
to authenticated;

commit;
