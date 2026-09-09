begin;

drop view if exists public.customer_summary;

create view public.customer_summary
with (security_invoker = true)
as
with customer_stats as (
  select
    customer_phone,
    count(*)::integer as total_orders,
    count(*) filter (
      where status in (
        'new',
        'confirmed',
        'preparing',
        'shipping'
      )
    )::integer as new_orders,
    count(*) filter (
      where status = 'completed'
    )::integer as completed_orders,
    count(*) filter (
      where status = 'cancelled'
    )::integer as cancelled_orders,
    coalesce(
      sum(total_amount) filter (
        where status = 'completed'
      ),
      0
    )::numeric(12, 0) as completed_revenue,
    min(created_at) as first_order_at,
    max(created_at) as last_order_at
  from public.orders
  group by customer_phone
),
latest_customer_order as (
  select distinct on (customer_phone)
    customer_phone,
    customer_name,
    customer_email,
    province,
    district,
    ward,
    address_line,
    order_code,
    status,
    total_amount,
    created_at
  from public.orders
  order by
    customer_phone,
    created_at desc,
    id desc
)
select
  stats.customer_phone,
  latest.customer_name,
  latest.customer_email,
  latest.province,
  latest.district,
  latest.ward,
  latest.address_line,
  stats.total_orders,
  stats.new_orders,
  stats.completed_orders,
  stats.cancelled_orders,
  stats.completed_revenue,
  stats.first_order_at,
  stats.last_order_at,
  latest.order_code as last_order_code,
  latest.status as last_order_status,
  latest.total_amount as last_order_total
from customer_stats as stats
join latest_customer_order as latest
  on latest.customer_phone = stats.customer_phone;

grant select on public.customer_summary to authenticated;

commit;