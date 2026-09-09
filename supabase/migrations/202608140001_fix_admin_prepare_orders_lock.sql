begin;

-- Fix lỗi runtime:
-- FOR UPDATE is not allowed with DISTINCT clause
--
-- Migration 202608130001 đã được áp dụng remote nên KHÔNG sửa file cũ.
-- Chỉ thay cách khóa các order trong admin_prepare_orders:
-- bỏ JOIN subquery SELECT DISTINCT khỏi câu lệnh có FOR UPDATE.
-- Các rule nghiệp vụ khác giữ nguyên.

create or replace function public.admin_prepare_orders(
  p_order_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested integer := 0;
  v_found integer := 0;
  v_updated integer := 0;
  v_already_preparing integer := 0;
  v_already_prepared integer := 0;
  v_blocked text;
  v_order record;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền chuẩn bị đơn hàng.';
  end if;

  select count(distinct item_id)
  into v_requested
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as item(item_id)
  where item_id is not null;

  if v_requested = 0 then
    raise exception 'Chưa chọn đơn hàng.';
  end if;

  if v_requested > 50 then
    raise exception 'Chỉ được chuẩn bị tối đa 50 đơn hàng mỗi lần.';
  end if;

  -- Khóa trực tiếp các row của public.orders.
  -- Không dùng DISTINCT trong SELECT có locking clause.
  perform orders.id
  from public.orders as orders
  where orders.id = any(coalesce(p_order_ids, array[]::uuid[]))
  order by orders.id
  for update of orders;

  select count(*)
  into v_found
  from public.orders as orders
  where orders.id in (
    select distinct item_id
    from unnest(p_order_ids) as item(item_id)
    where item_id is not null
  );

  if v_found <> v_requested then
    raise exception 'Có đơn hàng không còn tồn tại. Không có đơn nào được cập nhật.';
  end if;

  select string_agg(
    format('%s (%s)', orders.order_code, orders.status::text),
    ', '
    order by orders.order_code
  )
  into v_blocked
  from public.orders as orders
  where orders.id in (
    select distinct item_id
    from unnest(p_order_ids) as item(item_id)
    where item_id is not null
  )
    and orders.status::text in (
      'unreachable',
      'shipping',
      'completed',
      'cancelled'
    );

  if v_blocked is not null then
    raise exception
      'Không thể chuẩn bị vì có đơn không hợp lệ: %',
      v_blocked;
  end if;

  for v_order in
    select
      orders.id,
      orders.status::text as status
    from public.orders as orders
    where orders.id in (
      select distinct item_id
      from unnest(p_order_ids) as item(item_id)
      where item_id is not null
    )
    order by orders.id
  loop
    if v_order.status = 'prepared' then
      v_already_prepared := v_already_prepared + 1;
      continue;
    end if;

    if v_order.status = 'preparing' then
      v_already_preparing := v_already_preparing + 1;
      continue;
    end if;

    perform public.update_store_order_status(
      v_order.id,
      'preparing',
      'Bắt đầu chuẩn bị đơn hàng'
    );

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'requested', v_requested,
    'updated', v_updated,
    'alreadyPreparing', v_already_preparing,
    'alreadyPrepared', v_already_prepared,
    'status', 'preparing'
  );
end;
$$;

revoke all on function public.admin_prepare_orders(uuid[]) from public;
revoke all on function public.admin_prepare_orders(uuid[]) from anon;
grant execute on function public.admin_prepare_orders(uuid[]) to authenticated;

commit;