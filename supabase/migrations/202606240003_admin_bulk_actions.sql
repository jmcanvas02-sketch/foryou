begin;

create or replace function public.admin_search_product_ids(
  p_query text default '',
  p_category_id uuid default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := public.catalog_normalize(btrim(coalesce(p_query, '')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 50);
  v_total bigint := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền xem danh sách sản phẩm.';
  end if;

  if p_status is not null
    and p_status not in ('active', 'hidden', 'out_of_stock')
  then
    raise exception 'Trạng thái sản phẩm không hợp lệ.';
  end if;

  with filtered as (
    select products.id
    from public.products as products
    where (
      v_query = ''
      or public.catalog_normalize(products.name) like '%' || v_query || '%'
      or products.id::text ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
      and (
        p_category_id is null
        or products.category_id = p_category_id
      )
      and (
        p_status is null
        or (
          p_status = 'hidden'
          and products.status::text in ('hidden', 'draft')
        )
        or products.status::text = p_status
      )
  )
  select count(*)
  into v_total
  from filtered;

  with filtered as (
    select
      products.id,
      products.created_at
    from public.products as products
    where (
      v_query = ''
      or public.catalog_normalize(products.name) like '%' || v_query || '%'
      or products.id::text ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
      and (
        p_category_id is null
        or products.category_id = p_category_id
      )
      and (
        p_status is null
        or (
          p_status = 'hidden'
          and products.status::text in ('hidden', 'draft')
        )
        or products.status::text = p_status
      )
    order by products.created_at desc, products.id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select coalesce(jsonb_agg(filtered.id order by filtered.created_at desc, filtered.id desc), '[]'::jsonb)
  into v_ids
  from filtered;

  return jsonb_build_object(
    'ids', v_ids,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
end;
$$;

create or replace function public.admin_bulk_update_product_status(
  p_product_ids uuid[],
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested integer;
  v_updated integer := 0;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền cập nhật sản phẩm.';
  end if;

  if p_status is null
    or p_status not in ('active', 'hidden', 'out_of_stock')
  then
    raise exception 'Trạng thái sản phẩm không hợp lệ.';
  end if;

  select count(distinct item_id)
  into v_requested
  from unnest(coalesce(p_product_ids, array[]::uuid[])) as item(item_id);

  if v_requested = 0 then
    raise exception 'Chưa chọn sản phẩm.';
  end if;

  if v_requested > 50 then
    raise exception 'Chỉ được thao tác tối đa 50 sản phẩm mỗi lần.';
  end if;

  if p_status = 'active' then
    update public.products
    set status = 'active'
    where id = any(p_product_ids)
      and stock > 0;
    get diagnostics v_count = row_count;
    v_updated := v_updated + v_count;

    update public.products
    set status = 'out_of_stock'
    where id = any(p_product_ids)
      and stock <= 0;
    get diagnostics v_count = row_count;
    v_updated := v_updated + v_count;
  elsif p_status = 'hidden' then
    update public.products
    set status = 'hidden'
    where id = any(p_product_ids);
    get diagnostics v_updated = row_count;
  else
    update public.products
    set status = 'out_of_stock'
    where id = any(p_product_ids);
    get diagnostics v_updated = row_count;
  end if;

  if v_updated <> v_requested then
    raise exception 'Có sản phẩm không còn tồn tại.';
  end if;

  return jsonb_build_object(
    'requested', v_requested,
    'updated', v_updated,
    'status', p_status
  );
end;
$$;

create or replace function public.admin_bulk_delete_products(
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested integer;
  v_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền xóa sản phẩm.';
  end if;

  select count(distinct item_id)
  into v_requested
  from unnest(coalesce(p_product_ids, array[]::uuid[])) as item(item_id);

  if v_requested = 0 then
    raise exception 'Chưa chọn sản phẩm.';
  end if;

  if v_requested > 50 then
    raise exception 'Chỉ được xóa tối đa 50 sản phẩm mỗi lần.';
  end if;

  delete from public.products
  where id = any(p_product_ids);

  get diagnostics v_deleted = row_count;

  if v_deleted <> v_requested then
    raise exception 'Có sản phẩm không còn tồn tại.';
  end if;

  return jsonb_build_object(
    'requested', v_requested,
    'deleted', v_deleted
  );
end;
$$;

create or replace function public.admin_search_order_ids(
  p_query text default '',
  p_status text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := public.catalog_normalize(btrim(coalesce(p_query, '')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 50);
  v_total bigint := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền xem danh sách đơn hàng.';
  end if;

  if p_status is not null
    and p_status not in (
      'new',
      'confirmed',
      'preparing',
      'shipping',
      'completed',
      'cancelled'
    )
  then
    raise exception 'Trạng thái đơn hàng không hợp lệ.';
  end if;

  with filtered as (
    select orders.id
    from public.orders as orders
    where (
      v_query = ''
      or public.catalog_normalize(orders.order_code) like '%' || v_query || '%'
      or public.catalog_normalize(orders.customer_name) like '%' || v_query || '%'
      or public.catalog_normalize(orders.customer_phone) like '%' || v_query || '%'
    )
      and (
        p_status is null
        or orders.status::text = p_status
      )
      and (
        p_date_from is null
        or orders.created_at >= p_date_from
      )
      and (
        p_date_to is null
        or orders.created_at <= p_date_to
      )
  )
  select count(*)
  into v_total
  from filtered;

  with filtered as (
    select
      orders.id,
      orders.created_at
    from public.orders as orders
    where (
      v_query = ''
      or public.catalog_normalize(orders.order_code) like '%' || v_query || '%'
      or public.catalog_normalize(orders.customer_name) like '%' || v_query || '%'
      or public.catalog_normalize(orders.customer_phone) like '%' || v_query || '%'
    )
      and (
        p_status is null
        or orders.status::text = p_status
      )
      and (
        p_date_from is null
        or orders.created_at >= p_date_from
      )
      and (
        p_date_to is null
        or orders.created_at <= p_date_to
      )
    order by orders.created_at desc, orders.id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select coalesce(jsonb_agg(filtered.id order by filtered.created_at desc, filtered.id desc), '[]'::jsonb)
  into v_ids
  from filtered;

  return jsonb_build_object(
    'ids', v_ids,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
end;
$$;

create or replace function public.admin_bulk_update_order_status(
  p_order_ids uuid[],
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested integer;
  v_updated integer := 0;
  v_order_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền cập nhật đơn hàng.';
  end if;

  if p_status is null
    or p_status not in (
      'new',
      'confirmed',
      'preparing',
      'shipping',
      'completed',
      'cancelled'
    )
  then
    raise exception 'Trạng thái đơn hàng không hợp lệ.';
  end if;

  select count(distinct item_id)
  into v_requested
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as item(item_id);

  if v_requested = 0 then
    raise exception 'Chưa chọn đơn hàng.';
  end if;

  if v_requested > 50 then
    raise exception 'Chỉ được thao tác tối đa 50 đơn hàng mỗi lần.';
  end if;

  for v_order_id in
    select distinct item_id
    from unnest(p_order_ids) as item(item_id)
    where item_id is not null
    order by item_id
  loop
    perform public.update_store_order_status(
      v_order_id,
      p_status,
      'Cập nhật hàng loạt'
    );
    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'requested', v_requested,
    'updated', v_updated,
    'status', p_status
  );
end;
$$;

create or replace function public.admin_bulk_delete_orders(
  p_order_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested integer;
  v_deleted integer := 0;
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_coupon record;
  v_metadata jsonb;
  v_new_stock integer;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền xóa đơn hàng.';
  end if;

  select count(distinct item_id)
  into v_requested
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as item(item_id);

  if v_requested = 0 then
    raise exception 'Chưa chọn đơn hàng.';
  end if;

  if v_requested > 50 then
    raise exception 'Chỉ được xóa tối đa 50 đơn hàng mỗi lần.';
  end if;

  for v_order in
    select orders.*
    from public.orders as orders
    where orders.id = any(p_order_ids)
    order by orders.id
    for update
  loop
    if v_order.inventory_reserved
      and v_order.status::text not in ('completed', 'cancelled')
    then
      for v_item in
        select items.*
        from public.order_items as items
        where items.order_id = v_order.id
        order by items.id
      loop
        if v_item.product_id is null then
          continue;
        end if;

        select products.*
        into v_product
        from public.products as products
        where products.id = v_item.product_id
        for update;

        if not found or not v_product.track_inventory then
          continue;
        end if;

        v_new_stock := v_product.stock + v_item.quantity;
        v_metadata := public.adjust_variant_stocks(
          v_product.metadata,
          v_item.selected_variants,
          v_item.quantity
        );

        update public.products
        set
          stock = v_new_stock,
          metadata = v_metadata,
          status = case
            when v_product.status::text in ('hidden', 'draft')
              then v_product.status
            else 'active'
          end
        where id = v_product.id;
      end loop;
    end if;

    for v_coupon in
      select
        usages.coupon_id,
        count(*)::integer as usage_count
      from public.coupon_usages as usages
      where usages.order_id = v_order.id
      group by usages.coupon_id
    loop
      update public.coupons
      set used_count = greatest(0, used_count - v_coupon.usage_count)
      where id = v_coupon.coupon_id;
    end loop;

    delete from public.coupon_usages
    where order_id = v_order.id;

    delete from public.order_status_history
    where order_id = v_order.id;

    delete from public.order_items
    where order_id = v_order.id;

    delete from public.orders
    where id = v_order.id;

    v_deleted := v_deleted + 1;
  end loop;

  if v_deleted <> v_requested then
    raise exception 'Có đơn hàng không còn tồn tại.';
  end if;

  return jsonb_build_object(
    'requested', v_requested,
    'deleted', v_deleted
  );
end;
$$;

revoke all on function public.admin_search_product_ids(text, uuid, text, integer, integer)
from public;

revoke all on function public.admin_bulk_update_product_status(uuid[], text)
from public;

revoke all on function public.admin_bulk_delete_products(uuid[])
from public;

revoke all on function public.admin_search_order_ids(text, text, timestamptz, timestamptz, integer, integer)
from public;

revoke all on function public.admin_bulk_update_order_status(uuid[], text)
from public;

revoke all on function public.admin_bulk_delete_orders(uuid[])
from public;

grant execute on function public.admin_search_product_ids(text, uuid, text, integer, integer)
to authenticated;

grant execute on function public.admin_bulk_update_product_status(uuid[], text)
to authenticated;

grant execute on function public.admin_bulk_delete_products(uuid[])
to authenticated;

grant execute on function public.admin_search_order_ids(text, text, timestamptz, timestamptz, integer, integer)
to authenticated;

grant execute on function public.admin_bulk_update_order_status(uuid[], text)
to authenticated;

grant execute on function public.admin_bulk_delete_orders(uuid[])
to authenticated;

commit;
