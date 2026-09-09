begin;

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
        and current_order.customer_phone <> ''
        and exists (
          select 1
          from public.orders as matching_order
          where matching_order.customer_phone = current_order.customer_phone
            and matching_order.id <> current_order.id
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

create or replace function public.admin_duplicate_phone_orders(
  p_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := coalesce(p_phone, '');
begin
  if not public.is_admin() then
    raise exception 'Không có quyền xem các đơn hàng trùng số điện thoại.';
  end if;

  if v_phone = '' then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', matching_order.id,
          'code', matching_order.order_code,
          'customerName', matching_order.customer_name,
          'phone', matching_order.customer_phone,
          'status', matching_order.status,
          'total', matching_order.total_amount,
          'createdAt', matching_order.created_at
        )
        order by matching_order.created_at desc, matching_order.id desc
      )
      from public.orders as matching_order
      where matching_order.customer_phone = v_phone
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_duplicate_phone_orders(text)
from public;

grant execute on function public.admin_duplicate_phone_orders(text)
to authenticated;

commit;
