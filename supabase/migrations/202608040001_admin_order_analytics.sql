begin;

create or replace function public.get_order_analytics(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Bạn không có quyền xem phân tích đơn hàng.';
  end if;

  if p_start_at is null or p_end_at is null then
    raise exception 'Khoảng thời gian không hợp lệ.';
  end if;

  if p_start_at >= p_end_at then
    raise exception 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc.';
  end if;

  if p_end_at - p_start_at > interval '370 days' then
    raise exception 'Khoảng phân tích tối đa là 370 ngày.';
  end if;

  if p_status is not null and p_status not in (
    'new',
    'unreachable',
    'confirmed',
    'preparing',
    'shipping',
    'completed',
    'cancelled'
  ) then
    raise exception 'Trạng thái đơn hàng không hợp lệ.';
  end if;

  with
  params as (
    select
      p_start_at as start_at,
      p_end_at as end_at,
      p_start_at - (p_end_at - p_start_at) as previous_start_at,
      p_start_at as previous_end_at,
      greatest(
        1,
        ceil(
          extract(epoch from (p_end_at - p_start_at)) / 86400.0
        )::integer
      ) as period_days,
      (p_start_at at time zone 'Asia/Ho_Chi_Minh')::date as start_date,
      (
        (p_end_at - interval '1 microsecond')
        at time zone 'Asia/Ho_Chi_Minh'
      )::date as end_date,
      (
        (p_start_at - (p_end_at - p_start_at))
        at time zone 'Asia/Ho_Chi_Minh'
      )::date as previous_start_date
  ),
  current_orders as materialized (
    select
      orders.id,
      orders.status::text as status,
      orders.created_at
    from public.orders
    cross join params
    where orders.created_at >= params.start_at
      and orders.created_at < params.end_at
      and (
        p_status is null
        or orders.status::text = p_status
      )
  ),
  previous_orders as materialized (
    select
      orders.id,
      orders.status::text as status,
      orders.created_at
    from public.orders
    cross join params
    where orders.created_at >= params.previous_start_at
      and orders.created_at < params.previous_end_at
      and (
        p_status is null
        or orders.status::text = p_status
      )
  ),
  current_items as materialized (
    select
      items.*,
      current_orders.status as order_status
    from public.order_items as items
    join current_orders
      on current_orders.id = items.order_id
  ),
  previous_items as materialized (
    select
      items.*,
      previous_orders.status as order_status
    from public.order_items as items
    join previous_orders
      on previous_orders.id = items.order_id
  ),
  summary_values as (
    select
      params.period_days,
      (select count(*) from current_orders)::numeric
        as current_orders,
      (select count(*) from previous_orders)::numeric
        as previous_orders,
      coalesce(
        (select sum(quantity) from current_items),
        0
      )::numeric as current_items,
      coalesce(
        (select sum(quantity) from previous_items),
        0
      )::numeric as previous_items,
      (
        select count(*)
        from current_orders
        where status = 'completed'
      )::numeric as current_completed,
      (
        select count(*)
        from previous_orders
        where status = 'completed'
      )::numeric as previous_completed,
      (
        select count(*)
        from current_orders
        where status = 'cancelled'
      )::numeric as current_cancelled,
      (
        select count(*)
        from previous_orders
        where status = 'cancelled'
      )::numeric as previous_cancelled,
      (
        select count(*)
        from current_orders
        where status = 'unreachable'
      )::numeric as current_unreachable
    from params
  ),
  summary_rates as (
    select
      summary_values.*,
      case
        when current_orders = 0 then 0::numeric
        else round(current_completed * 100.0 / current_orders, 1)
      end as current_completion_rate,
      case
        when previous_orders = 0 then 0::numeric
        else round(previous_completed * 100.0 / previous_orders, 1)
      end as previous_completion_rate,
      case
        when current_orders = 0 then 0::numeric
        else round(current_cancelled * 100.0 / current_orders, 1)
      end as current_cancellation_rate,
      case
        when previous_orders = 0 then 0::numeric
        else round(previous_cancelled * 100.0 / previous_orders, 1)
      end as previous_cancellation_rate,
      round(current_orders / period_days, 1)
        as current_average,
      round(previous_orders / period_days, 1)
        as previous_average
    from summary_values
  ),
  summary_json as (
    select jsonb_build_object(
      'totalOrders', current_orders,
      'totalItems', current_items,
      'completedOrders', current_completed,
      'cancelledOrders', current_cancelled,
      'unreachableOrders', current_unreachable,
      'averageOrdersPerDay', current_average,
      'completionRate', current_completion_rate,
      'cancellationRate', current_cancellation_rate,
      'ordersChangePercent',
        case
          when previous_orders = 0 then
            case when current_orders = 0 then 0 else 100 end
          else round(
            (current_orders - previous_orders) * 100.0
            / previous_orders,
            1
          )
        end,
      'itemsChangePercent',
        case
          when previous_items = 0 then
            case when current_items = 0 then 0 else 100 end
          else round(
            (current_items - previous_items) * 100.0
            / previous_items,
            1
          )
        end,
      'completionRateChange', round(
        current_completion_rate - previous_completion_rate,
        1
      ),
      'cancellationRateChange', round(
        current_cancellation_rate - previous_cancellation_rate,
        1
      ),
      'averageOrdersChange', round(
        current_average - previous_average,
        1
      )
    ) as value
    from summary_rates
  ),
  status_defs(status, label, color, sort_order) as (
    values
      ('new', 'Đơn mới', '#4388f5', 1),
      ('unreachable', 'Không gọi được', '#7c63d6', 2),
      ('confirmed', 'Đã xác nhận', '#a76bd4', 3),
      ('preparing', 'Đang chuẩn bị', '#f2b84b', 4),
      ('shipping', 'Đang giao', '#fe7e4f', 5),
      ('completed', 'Hoàn thành', '#24a775', 6),
      ('cancelled', 'Đã hủy', '#e85d64', 7)
  ),
  status_rows as (
    select
      status_defs.status,
      status_defs.label,
      status_defs.color,
      status_defs.sort_order,
      count(current_orders.id)::numeric as order_count,
      case
        when summary_rates.current_orders = 0 then 0::numeric
        else round(
          count(current_orders.id) * 100.0
          / summary_rates.current_orders,
          1
        )
      end as percentage
    from status_defs
    cross join summary_rates
    left join current_orders
      on current_orders.status = status_defs.status
    group by
      status_defs.status,
      status_defs.label,
      status_defs.color,
      status_defs.sort_order,
      summary_rates.current_orders
  ),
  statuses_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'status', status,
          'label', label,
          'color', color,
          'orderCount', order_count,
          'percentage', percentage
        )
        order by sort_order
      ),
      '[]'::jsonb
    ) as value
    from status_rows
  ),
  day_series as (
    select
      series_index,
      params.start_date + series_index as bucket_date,
      params.previous_start_date + series_index
        as previous_bucket_date
    from params
    cross join generate_series(
      0,
      params.period_days - 1
    ) as series(series_index)
  ),
  current_day_counts as (
    select
      (created_at at time zone 'Asia/Ho_Chi_Minh')::date
        as bucket_date,
      count(*)::numeric as order_count
    from current_orders
    group by 1
  ),
  previous_day_counts as (
    select
      (created_at at time zone 'Asia/Ho_Chi_Minh')::date
        as bucket_date,
      count(*)::numeric as order_count
    from previous_orders
    group by 1
  ),
  trend_rows as (
    select
      day_series.series_index,
      day_series.bucket_date,
      coalesce(current_day_counts.order_count, 0)::numeric
        as order_count,
      coalesce(previous_day_counts.order_count, 0)::numeric
        as previous_order_count
    from day_series
    left join current_day_counts
      on current_day_counts.bucket_date = day_series.bucket_date
    left join previous_day_counts
      on previous_day_counts.bucket_date
        = day_series.previous_bucket_date
  ),
  trend_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(bucket_date, 'YYYY-MM-DD'),
          'label', to_char(bucket_date, 'DD/MM'),
          'orderCount', order_count,
          'previousOrderCount', previous_order_count
        )
        order by series_index
      ),
      '[]'::jsonb
    ) as value
    from trend_rows
  ),
  weekday_defs(weekday, label) as (
    values
      (1, 'T2'),
      (2, 'T3'),
      (3, 'T4'),
      (4, 'T5'),
      (5, 'T6'),
      (6, 'T7'),
      (7, 'CN')
  ),
  slot_defs(slot, label) as (
    values
      (0, '0–3h'),
      (1, '3–6h'),
      (2, '6–9h'),
      (3, '9–12h'),
      (4, '12–15h'),
      (5, '15–18h'),
      (6, '18–21h'),
      (7, '21–24h')
  ),
  heat_counts as (
    select
      extract(
        isodow from created_at at time zone 'Asia/Ho_Chi_Minh'
      )::integer as weekday,
      floor(
        extract(
          hour from created_at at time zone 'Asia/Ho_Chi_Minh'
        ) / 3
      )::integer as slot,
      count(*)::numeric as order_count
    from current_orders
    group by 1, 2
  ),
  heat_rows as (
    select
      weekday_defs.weekday,
      weekday_defs.label as weekday_label,
      slot_defs.slot,
      slot_defs.label as slot_label,
      coalesce(heat_counts.order_count, 0)::numeric
        as order_count
    from weekday_defs
    cross join slot_defs
    left join heat_counts
      on heat_counts.weekday = weekday_defs.weekday
      and heat_counts.slot = slot_defs.slot
  ),
  heatmap_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'weekday', weekday,
          'weekdayLabel', weekday_label,
          'slot', slot,
          'slotLabel', slot_label,
          'orderCount', order_count
        )
        order by weekday, slot
      ),
      '[]'::jsonb
    ) as value
    from heat_rows
  ),
  weekday_occurrences as (
    select
      extract(isodow from bucket_date)::integer as weekday,
      count(*)::numeric as occurrences
    from day_series
    group by 1
  ),
  weekday_order_counts as (
    select
      extract(
        isodow from created_at at time zone 'Asia/Ho_Chi_Minh'
      )::integer as weekday,
      count(*)::numeric as order_count
    from current_orders
    group by 1
  ),
  weekday_rows as (
    select
      weekday_defs.weekday,
      weekday_defs.label,
      coalesce(weekday_order_counts.order_count, 0)::numeric
        as total_orders,
      case
        when coalesce(weekday_occurrences.occurrences, 0) = 0
          then 0::numeric
        else round(
          coalesce(weekday_order_counts.order_count, 0)
          / weekday_occurrences.occurrences,
          1
        )
      end as average_orders
    from weekday_defs
    left join weekday_occurrences
      on weekday_occurrences.weekday = weekday_defs.weekday
    left join weekday_order_counts
      on weekday_order_counts.weekday = weekday_defs.weekday
  ),
  weekdays_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'weekday', weekday,
          'label', label,
          'totalOrders', total_orders,
          'averageOrders', average_orders
        )
        order by weekday
      ),
      '[]'::jsonb
    ) as value
    from weekday_rows
  ),
  current_product_base as (
    select
      items.order_id,
      items.product_id,
      items.product_name,
      coalesce(items.product_sku, '') as product_sku,
      coalesce(items.product_image_url, '') as product_image_url,
      coalesce(items.product_background, '#dff4ff')
        as product_background,
      coalesce(items.product_emoji, '📦') as product_emoji,
      items.quantity,
      coalesce(
        nullif(btrim(coalesce(items.variant_name, '')), ''),
        nullif(
          (
            select string_agg(
              concat_ws(
                ': ',
                nullif(btrim(variant.value ->> 'groupName'), ''),
                nullif(btrim(variant.value ->> 'optionLabel'), '')
              ),
              ' • '
              order by variant.ordinality
            )
            from jsonb_array_elements(
              coalesce(items.selected_variants, '[]'::jsonb)
            ) with ordinality as variant(value, ordinality)
          ),
          ''
        ),
        'Mặc định'
      ) as variant_label
    from current_items as items
    where p_status is not null
      or items.order_status <> 'cancelled'
  ),
  previous_product_base as (
    select
      items.order_id,
      items.product_id,
      items.product_name,
      coalesce(items.product_sku, '') as product_sku,
      items.quantity,
      coalesce(
        nullif(btrim(coalesce(items.variant_name, '')), ''),
        nullif(
          (
            select string_agg(
              concat_ws(
                ': ',
                nullif(btrim(variant.value ->> 'groupName'), ''),
                nullif(btrim(variant.value ->> 'optionLabel'), '')
              ),
              ' • '
              order by variant.ordinality
            )
            from jsonb_array_elements(
              coalesce(items.selected_variants, '[]'::jsonb)
            ) with ordinality as variant(value, ordinality)
          ),
          ''
        ),
        'Mặc định'
      ) as variant_label
    from previous_items as items
    where p_status is not null
      or items.order_status <> 'cancelled'
  ),
  current_product_grouped as (
    select
      concat_ws(
        '|',
        coalesce(product_id::text, 'snapshot'),
        lower(product_name),
        lower(product_sku),
        lower(variant_label)
      ) as product_key,
      product_id,
      product_name,
      product_sku,
      variant_label,
      max(product_image_url) as product_image_url,
      max(product_background) as product_background,
      max(product_emoji) as product_emoji,
      count(distinct order_id)::numeric as order_count,
      sum(quantity)::numeric as quantity
    from current_product_base
    group by
      product_id,
      product_name,
      product_sku,
      variant_label
  ),
  previous_product_grouped as (
    select
      concat_ws(
        '|',
        coalesce(product_id::text, 'snapshot'),
        lower(product_name),
        lower(product_sku),
        lower(variant_label)
      ) as product_key,
      sum(quantity)::numeric as quantity
    from previous_product_base
    group by
      product_id,
      product_name,
      product_sku,
      variant_label
  ),
  product_rows as (
    select
      current_product_grouped.*,
      coalesce(previous_product_grouped.quantity, 0)::numeric
        as previous_quantity,
      sum(current_product_grouped.quantity) over()::numeric
        as total_product_quantity
    from current_product_grouped
    left join previous_product_grouped
      on previous_product_grouped.product_key
        = current_product_grouped.product_key
  ),
  top_product_rows as (
    select
      product_key,
      product_id,
      product_name,
      product_sku,
      variant_label,
      product_image_url,
      product_background,
      product_emoji,
      order_count,
      quantity,
      previous_quantity,
      case
        when total_product_quantity = 0 then 0::numeric
        else round(quantity * 100.0 / total_product_quantity, 1)
      end as share_percent,
      case
        when previous_quantity = 0 then
          case when quantity = 0 then 0 else 100 end
        else round(
          (quantity - previous_quantity) * 100.0
          / previous_quantity,
          1
        )
      end as trend_percent
    from product_rows
    order by quantity desc, order_count desc, product_name
    limit 20
  ),
  products_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'productKey', product_key,
          'productId', product_id,
          'productName', product_name,
          'productSku', product_sku,
          'variantName', variant_label,
          'productImageUrl', product_image_url,
          'productBackground', product_background,
          'productEmoji', product_emoji,
          'orderCount', order_count,
          'quantity', quantity,
          'sharePercent', share_percent,
          'previousQuantity', previous_quantity,
          'trendPercent', trend_percent
        )
        order by quantity desc, order_count desc, product_name
      ),
      '[]'::jsonb
    ) as value
    from top_product_rows
  ),
  slot_summary as (
    select
      slot_defs.slot,
      slot_defs.label,
      coalesce(sum(heat_rows.order_count), 0)::numeric
        as order_count
    from slot_defs
    left join heat_rows
      on heat_rows.slot = slot_defs.slot
    group by slot_defs.slot, slot_defs.label
  ),
  peak_slot as (
    select *
    from slot_summary
    order by order_count desc, slot
    limit 1
  ),
  peak_weekday as (
    select *
    from weekday_rows
    order by average_orders desc, total_orders desc, weekday
    limit 1
  ),
  current_new_orders as (
    select
      count(*)::numeric as new_orders,
      count(*) filter (
        where orders.created_at < now() - interval '6 hours'
      )::numeric as stale_new_orders
    from public.orders as orders
    cross join params
    where orders.status::text = 'new'
      and orders.created_at >= params.start_at
      and orders.created_at < params.end_at
  ),
  insights_json as (
    select jsonb_build_object(
      'peakTimeLabel', coalesce(peak_slot.label, 'Chưa có dữ liệu'),
      'peakTimeOrders', coalesce(peak_slot.order_count, 0),
      'peakTimeShare',
        case
          when summary_rates.current_orders = 0 then 0::numeric
          else round(
            coalesce(peak_slot.order_count, 0) * 100.0
            / summary_rates.current_orders,
            1
          )
        end,
      'peakWeekdayLabel',
        coalesce(peak_weekday.label, 'Chưa có dữ liệu'),
      'peakWeekdayAverage',
        coalesce(peak_weekday.average_orders, 0),
      'topProductName',
        coalesce(
          (
            select product_name
            from top_product_rows
            order by quantity desc, order_count desc, product_name
            limit 1
          ),
          'Chưa có dữ liệu'
        ),
      'topProductQuantity',
        coalesce(
          (
            select quantity
            from top_product_rows
            order by quantity desc, order_count desc, product_name
            limit 1
          ),
          0
        ),
      'newOrders', current_new_orders.new_orders,
      'staleNewOrders', current_new_orders.stale_new_orders
    ) as value
    from summary_rates
    cross join current_new_orders
    left join peak_slot on true
    left join peak_weekday on true
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'timezone', 'Asia/Ho_Chi_Minh',
    'period', jsonb_build_object(
      'startAt', params.start_at,
      'endAt', params.end_at,
      'days', params.period_days,
      'previousStartAt', params.previous_start_at,
      'previousEndAt', params.previous_end_at,
      'status', p_status,
      'productExcludesCancelled', p_status is null
    ),
    'summary', summary_json.value,
    'statuses', statuses_json.value,
    'trend', trend_json.value,
    'heatmap', heatmap_json.value,
    'weekdays', weekdays_json.value,
    'topProducts', products_json.value,
    'insights', insights_json.value
  )
  into v_result
  from params
  cross join summary_json
  cross join statuses_json
  cross join trend_json
  cross join heatmap_json
  cross join weekdays_json
  cross join products_json
  cross join insights_json;

  return v_result;
end;
$$;

revoke all on function public.get_order_analytics(
  timestamptz,
  timestamptz,
  text
) from public;

grant execute on function public.get_order_analytics(
  timestamptz,
  timestamptz,
  text
) to authenticated;

comment on function public.get_order_analytics(
  timestamptz,
  timestamptz,
  text
) is 'Admin-only order analytics aggregated in Asia/Ho_Chi_Minh timezone.';

commit;
