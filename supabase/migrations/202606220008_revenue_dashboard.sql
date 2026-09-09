begin;

create or replace function public.get_revenue_summary(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  completed_orders bigint,
  total_revenue numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Bạn không có quyền xem doanh thu.';
  end if;

  if p_start_at is null or p_end_at is null then
    raise exception 'Khoảng thời gian không hợp lệ.';
  end if;

  if p_start_at >= p_end_at then
    raise exception 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc.';
  end if;

  return query
  select
    count(*)::bigint as completed_orders,
    coalesce(sum(orders.total_amount), 0)::numeric
      as total_revenue
  from public.orders
  where orders.status = 'completed'
    and orders.created_at >= p_start_at
    and orders.created_at < p_end_at;
end;
$$;

revoke all on function public.get_revenue_summary(
  timestamptz,
  timestamptz
) from public;

grant execute on function public.get_revenue_summary(
  timestamptz,
  timestamptz
) to authenticated;

create index if not exists
orders_completed_created_at_desc_idx
on public.orders (created_at desc)
where status = 'completed';

commit;