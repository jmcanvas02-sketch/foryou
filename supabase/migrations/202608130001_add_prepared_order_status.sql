begin;

-- STEP 5: thêm trạng thái prepared = "Đã chuẩn bị".
-- Không sửa migration cũ. Migration này mở rộng schema/rpc hiện tại.

-- Nếu status đang dùng PostgreSQL enum, thêm giá trị mới trước rồi commit
-- để giá trị có thể được dùng an toàn ở transaction tiếp theo.
do $migration$
declare
  v_type record;
begin
  for v_type in
    select distinct
      type_namespace.nspname as type_schema,
      column_type.typname as type_name
    from pg_attribute as attribute
    join pg_class as relation
      on relation.oid = attribute.attrelid
    join pg_namespace as relation_namespace
      on relation_namespace.oid = relation.relnamespace
    join pg_type as column_type
      on column_type.oid = attribute.atttypid
    join pg_namespace as type_namespace
      on type_namespace.oid = column_type.typnamespace
    where relation_namespace.nspname = 'public'
      and (
        (
          relation.relname = 'orders'
          and attribute.attname = 'status'
        )
        or (
          relation.relname = 'order_status_history'
          and attribute.attname in ('from_status', 'to_status')
        )
      )
      and attribute.attnum > 0
      and not attribute.attisdropped
      and column_type.typtype = 'e'
  loop
    execute format(
      'alter type %I.%I add value if not exists %L',
      v_type.type_schema,
      v_type.type_name,
      'prepared'
    );
  end loop;
end;
$migration$;

commit;

begin;

-- Nếu status dùng text/domain + check constraint, thay constraint bằng
-- danh sách đầy đủ có thêm prepared.
do $migration$
declare
  v_target record;
  v_constraint record;
  v_type_kind text;
  v_table regclass;
begin
  for v_target in
    select *
    from (
      values
        ('orders', 'status', false, 'orders_status_check'),
        (
          'order_status_history',
          'from_status',
          true,
          'order_status_history_from_status_check'
        ),
        (
          'order_status_history',
          'to_status',
          false,
          'order_status_history_to_status_check'
        )
    ) as targets(table_name, column_name, nullable_value, constraint_name)
  loop
    v_table := to_regclass(format('public.%I', v_target.table_name));

    if v_table is null then
      raise exception 'Không tìm thấy bảng public.%', v_target.table_name;
    end if;

    select column_type.typtype
    into v_type_kind
    from pg_attribute as attribute
    join pg_type as column_type
      on column_type.oid = attribute.atttypid
    where attribute.attrelid = v_table
      and attribute.attname = v_target.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if v_type_kind is null then
      raise exception
        'Không tìm thấy cột public.%.%',
        v_target.table_name,
        v_target.column_name;
    end if;

    if v_type_kind <> 'e' then
      for v_constraint in
        select constraint_row.conname
        from pg_constraint as constraint_row
        where constraint_row.conrelid = v_table
          and constraint_row.contype = 'c'
          and lower(pg_get_constraintdef(constraint_row.oid))
            like '%' || lower(v_target.column_name) || '%'
          and lower(pg_get_constraintdef(constraint_row.oid))
            like '%cancelled%'
      loop
        execute format(
          'alter table public.%I drop constraint %I',
          v_target.table_name,
          v_constraint.conname
        );
      end loop;

      if v_target.nullable_value then
        execute format(
          'alter table public.%I add constraint %I check (
            %I is null
            or %I::text in (
              %L, %L, %L, %L, %L, %L, %L, %L
            )
          )',
          v_target.table_name,
          v_target.constraint_name,
          v_target.column_name,
          v_target.column_name,
          'new',
          'unreachable',
          'confirmed',
          'preparing',
          'prepared',
          'shipping',
          'completed',
          'cancelled'
        );
      else
        execute format(
          'alter table public.%I add constraint %I check (
            %I::text in (
              %L, %L, %L, %L, %L, %L, %L, %L
            )
          )',
          v_target.table_name,
          v_target.constraint_name,
          v_target.column_name,
          'new',
          'unreachable',
          'confirmed',
          'preparing',
          'prepared',
          'shipping',
          'completed',
          'cancelled'
        );
      end if;
    end if;
  end loop;
end;
$migration$;

create or replace view public.customer_summary
with (security_invoker = true)
as
with customer_stats as (
  select
    customer_phone,
    count(*)::integer as total_orders,
    count(*) filter (
      where status::text in (
        'new',
        'unreachable',
        'confirmed',
        'preparing',
        'prepared',
        'shipping'
      )
    )::integer as new_orders,
    count(*) filter (
      where status::text = 'completed'
    )::integer as completed_orders,
    count(*) filter (
      where status::text = 'cancelled'
    )::integer as cancelled_orders,
    coalesce(
      sum(total_amount) filter (
        where status::text = 'completed'
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

create or replace function public.update_store_order_status(
  p_order_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_metadata jsonb;
  v_new_stock integer;
  v_inventory_reserved boolean;
  v_old_status text;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền cập nhật đơn hàng.';
  end if;

  if p_status not in (
    'new',
    'unreachable',
    'confirmed',
    'preparing',

    'prepared',
    'shipping',
    'completed',
    'cancelled'
  ) then
    raise exception 'Trạng thái đơn hàng không hợp lệ.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn hàng.';
  end if;

  v_old_status := v_order.status::text;

  if v_old_status = p_status then
    return jsonb_build_object(
      'id', v_order.id,
      'order_code', v_order.order_code,
      'status', v_order.status
    );
  end if;

  v_inventory_reserved := v_order.inventory_reserved;

  if p_status = 'cancelled' and v_order.inventory_reserved then
    for v_item in
      select *
      from public.order_items
      where order_id = v_order.id
    loop
      if v_item.product_id is null then
        continue;
      end if;

      select *
      into v_product
      from public.products
      where id = v_item.product_id
      for update;

      if not found then
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
          when v_product.status in ('hidden', 'draft') then v_product.status
          else 'active'
        end
      where id = v_product.id;
    end loop;

    v_inventory_reserved := false;
  elsif v_old_status = 'cancelled'
    and p_status <> 'cancelled'
    and not v_order.inventory_reserved
  then
    for v_item in
      select *
      from public.order_items
      where order_id = v_order.id
    loop
      if v_item.product_id is null then
        raise exception 'Không thể giữ lại tồn kho vì sản phẩm đã bị xóa.';
      end if;

      select *
      into v_product
      from public.products
      where id = v_item.product_id
      for update;

      if not found then
        raise exception 'Không thể giữ lại tồn kho vì sản phẩm không còn tồn tại.';
      end if;

      if v_product.track_inventory then
        if v_product.stock < v_item.quantity then
          raise exception '% không đủ tồn kho.', v_product.name;
        end if;

        v_new_stock := v_product.stock - v_item.quantity;
        v_metadata := public.adjust_variant_stocks(
          v_product.metadata,
          v_item.selected_variants,
          -v_item.quantity
        );

        update public.products
        set
          stock = v_new_stock,
          metadata = v_metadata,
          status = case
            when v_product.status in ('hidden', 'draft') then v_product.status
            when v_new_stock <= 0 then 'out_of_stock'
            else 'active'
          end
        where id = v_product.id;
      end if;
    end loop;

    v_inventory_reserved := true;
  end if;

  update public.orders
  set
    status = p_status,
    inventory_reserved = v_inventory_reserved,
    cancelled_at = case
      when p_status = 'cancelled' then now()
      when v_old_status = 'cancelled' then null
      else cancelled_at
    end,
    completed_at = case
      when p_status = 'completed' then now()
      when v_old_status = 'completed' then null
      else completed_at
    end
  where id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (
    order_id,
    from_status,
    to_status,
    note,
    changed_by
  )
  values (
    v_order.id,
    v_old_status,
    p_status,
    nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid()
  );

  return jsonb_build_object(
    'id', v_order.id,
    'order_code', v_order.order_code,
    'status', v_order.status,
    'inventory_reserved', v_order.inventory_reserved,
    'updated_at', v_order.updated_at
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
      'unreachable',
      'confirmed',
      'preparing',

      'prepared',
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
      'unreachable',
      'confirmed',
      'preparing',

      'prepared',
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

create or replace function public.admin_update_order(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_old_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_settings public.store_settings%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_selected_variants jsonb;
  v_custom_options jsonb;
  v_metadata jsonb;
  v_product_name text;
  v_product_slug text;
  v_product_image_url text;
  v_product_background text;
  v_product_emoji text;
  v_product_sku text;
  v_variant_name text;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_province text;
  v_district text;
  v_ward text;
  v_address_line text;
  v_note text;
  v_target_status text;
  v_old_status text;
  v_quantity integer;
  v_unit_price numeric(12, 0);
  v_line_total numeric(12, 0);
  v_subtotal numeric(12, 0) := 0;
  v_discount numeric(12, 0);
  v_shipping numeric(12, 0);
  v_total numeric(12, 0);
  v_inventory_reserved boolean := false;
  v_new_stock integer;
  v_item_count integer;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền chỉnh sửa đơn hàng.';
  end if;

  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'Thông tin đơn hàng không hợp lệ.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Danh sách sản phẩm không hợp lệ.';
  end if;

  v_item_count := jsonb_array_length(p_items);

  if v_item_count = 0 then
    raise exception 'Đơn hàng phải có ít nhất một sản phẩm.';
  end if;

  if v_item_count > 100 then
    raise exception 'Đơn hàng chỉ được có tối đa 100 dòng sản phẩm.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn hàng.';
  end if;

  v_old_status := v_order.status::text;

  select *
  into v_settings
  from public.store_settings
  where id = 1;

  if not found then
    raise exception 'Chưa có cấu hình cửa hàng.';
  end if;

  v_customer_name := btrim(coalesce(p_order ->> 'customerName', ''));
  v_customer_phone := btrim(coalesce(p_order ->> 'customerPhone', ''));
  v_customer_email := nullif(btrim(coalesce(p_order ->> 'customerEmail', '')), '');
  v_province := btrim(coalesce(p_order ->> 'province', ''));
  v_district := btrim(coalesce(p_order ->> 'district', ''));
  v_ward := btrim(coalesce(p_order ->> 'ward', ''));
  v_address_line := btrim(coalesce(p_order ->> 'addressDetail', ''));
  v_note := nullif(btrim(coalesce(p_order ->> 'note', '')), '');
  v_target_status := btrim(coalesce(p_order ->> 'status', ''));

  if length(v_customer_name) < 2 then
    raise exception 'Tên người nhận không hợp lệ.';
  end if;

  if length(v_customer_phone) < 8 or length(v_customer_phone) > 30 then
    raise exception 'Số điện thoại không hợp lệ.';
  end if;

  if v_address_line = '' then
    raise exception 'Địa chỉ chi tiết không được để trống.';
  end if;

  if v_target_status not in (
    'new',
    'unreachable',
    'confirmed',
    'preparing',

    'prepared',
    'shipping',
    'completed',
    'cancelled'
  ) then
    raise exception 'Trạng thái đơn hàng không hợp lệ.';
  end if;

  begin
    v_discount := greatest(
      0,
      round(coalesce(nullif(p_order ->> 'discount', '')::numeric, 0))
    );
    v_shipping := greatest(
      0,
      round(coalesce(nullif(p_order ->> 'shipping', '')::numeric, 0))
    );
  exception when others then
    raise exception 'Tiền giảm giá hoặc phí vận chuyển không hợp lệ.';
  end;

  -- Hoàn lại phần tồn kho đang giữ của phiên bản đơn hàng cũ.
  if v_order.inventory_reserved then
    for v_old_item in
      select *
      from public.order_items
      where order_id = v_order.id
      order by id
    loop
      if v_old_item.product_id is null then
        continue;
      end if;

      select *
      into v_product
      from public.products
      where id = v_old_item.product_id
      for update;

      if not found or not v_product.track_inventory then
        continue;
      end if;

      v_new_stock := v_product.stock + v_old_item.quantity;

      begin
        v_metadata := public.adjust_variant_stocks(
          v_product.metadata,
          v_old_item.selected_variants,
          v_old_item.quantity
        );
      exception when others then
        -- Sản phẩm/biến thể có thể đã được thay đổi sau lúc đặt đơn.
        -- Vẫn hoàn tồn kho tổng, nhưng không tự tạo lại biến thể đã bị xóa.
        v_metadata := v_product.metadata;
      end;

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

  delete from public.order_items
  where order_id = v_order.id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := null;

    if nullif(btrim(coalesce(v_item ->> 'productId', '')), '') is not null then
      begin
        v_product_id := (v_item ->> 'productId')::uuid;
      exception when others then
        raise exception 'Có mã sản phẩm không hợp lệ.';
      end;
    end if;

    v_product_name := btrim(coalesce(v_item ->> 'productName', ''));
    v_product_slug := nullif(btrim(coalesce(v_item ->> 'productSlug', '')), '');
    v_product_image_url := nullif(btrim(coalesce(v_item ->> 'productImageUrl', '')), '');
    v_product_background := nullif(btrim(coalesce(v_item ->> 'productBackground', '')), '');
    v_product_emoji := nullif(btrim(coalesce(v_item ->> 'productEmoji', '')), '');
    v_selected_variants := coalesce(v_item -> 'selectedVariants', '[]'::jsonb);
    v_custom_options := coalesce(v_item -> 'customOptions', '{}'::jsonb);

    if jsonb_typeof(v_selected_variants) <> 'array' then
      raise exception 'Dữ liệu biến thể sản phẩm không hợp lệ.';
    end if;

    if jsonb_typeof(v_custom_options) <> 'object' then
      raise exception 'Dữ liệu tùy chỉnh sản phẩm không hợp lệ.';
    end if;

    begin
      v_quantity := coalesce(nullif(v_item ->> 'quantity', '')::integer, 0);
      v_unit_price := round(coalesce(nullif(v_item ->> 'unitPrice', '')::numeric, 0));
    exception when others then
      raise exception 'Số lượng hoặc đơn giá sản phẩm không hợp lệ.';
    end;

    if v_quantity <= 0 or v_quantity > 999 then
      raise exception 'Số lượng mỗi sản phẩm phải từ 1 đến 999.';
    end if;

    if v_unit_price < 0 then
      raise exception 'Đơn giá sản phẩm không được âm.';
    end if;

    v_product_sku := null;

    if v_product_id is not null then
      select *
      into v_product
      from public.products
      where id = v_product_id
      for update;

      if not found then
        raise exception 'Có sản phẩm liên kết không còn tồn tại.';
      end if;

      if v_product_name = '' then
        v_product_name := v_product.name;
      end if;

      v_product_slug := coalesce(v_product_slug, v_product.slug);
      v_product_background := coalesce(
        v_product_background,
        nullif(v_product.metadata ->> 'background', ''),
        '#dff4ff'
      );
      v_product_emoji := coalesce(
        v_product_emoji,
        nullif(v_product.metadata ->> 'emoji', ''),
        '📦'
      );
      v_product_sku := v_product.sku;

      if v_target_status <> 'cancelled'
        and v_settings.enable_inventory
        and v_product.track_inventory
      then
        if v_product.stock < v_quantity then
          raise exception '% không đủ tồn kho để lưu đơn.', v_product.name;
        end if;

        v_metadata := public.adjust_variant_stocks(
          v_product.metadata,
          v_selected_variants,
          -v_quantity
        );
        v_new_stock := v_product.stock - v_quantity;

        update public.products
        set
          stock = v_new_stock,
          metadata = v_metadata,
          status = case
            when v_product.status::text in ('hidden', 'draft')
              then v_product.status
            when v_new_stock <= 0
              then 'out_of_stock'
            else 'active'
          end
        where id = v_product.id;

        v_inventory_reserved := true;
      end if;
    end if;

    if v_product_name = '' then
      raise exception 'Tên sản phẩm không được để trống.';
    end if;

    select string_agg(
      concat_ws(
        ': ',
        nullif(btrim(value ->> 'groupName'), ''),
        nullif(btrim(value ->> 'optionLabel'), '')
      ),
      ' · '
    )
    into v_variant_name
    from jsonb_array_elements(v_selected_variants);

    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      product_sku,
      variant_name,
      product_image_url,
      unit_price,
      quantity,
      line_total,
      product_slug,
      product_background,
      product_emoji,
      selected_variants,
      custom_options
    ) values (
      v_order.id,
      v_product_id,
      v_product_name,
      v_product_sku,
      nullif(v_variant_name, ''),
      v_product_image_url,
      v_unit_price,
      v_quantity,
      v_line_total,
      v_product_slug,
      coalesce(v_product_background, '#dff4ff'),
      coalesce(v_product_emoji, '📦'),
      v_selected_variants,
      v_custom_options
    );
  end loop;

  v_discount := least(v_discount, v_subtotal);
  v_total := greatest(0, v_subtotal - v_discount) + v_shipping;

  update public.orders
  set
    customer_name = v_customer_name,
    customer_phone = v_customer_phone,
    customer_email = v_customer_email,
    province = v_province,
    district = v_district,
    ward = v_ward,
    address_line = v_address_line,
    note = v_note,
    subtotal = v_subtotal,
    discount_amount = v_discount,
    shipping_fee = v_shipping,
    total_amount = v_total,
    status = v_target_status,
    inventory_reserved = v_inventory_reserved,
    cancelled_at = case
      when v_target_status = 'cancelled' then coalesce(cancelled_at, now())
      when v_order.status::text = 'cancelled' then null
      else cancelled_at
    end,
    completed_at = case
      when v_target_status = 'completed' then coalesce(completed_at, now())
      when v_order.status::text = 'completed' then null
      else completed_at
    end
  where id = v_order.id
  returning * into v_order;

  if v_target_status <> v_old_status then
    insert into public.order_status_history (
      order_id,
      from_status,
      to_status,
      note,
      changed_by
    ) values (
      v_order.id,
      v_old_status,
      v_target_status,
      'Admin chỉnh sửa đơn hàng',
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'order_code', v_order.order_code,
    'status', v_order.status,
    'subtotal', v_order.subtotal,
    'discount_amount', v_order.discount_amount,
    'shipping_fee', v_order.shipping_fee,
    'total_amount', v_order.total_amount,
    'inventory_reserved', v_order.inventory_reserved,
    'updated_at', v_order.updated_at
  );
end;
$$;

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
    'prepared',
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
      ('prepared', 'Đã chuẩn bị', '#2f91b4', 5),
      ('shipping', 'Đang giao', '#fe7e4f', 6),
      ('completed', 'Hoàn thành', '#24a775', 7),
      ('cancelled', 'Đã hủy', '#e85d64', 8)
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

  -- Khóa toàn bộ đơn được yêu cầu theo thứ tự cố định.
  -- Việc kiểm tra và cập nhật diễn ra trong cùng một RPC/transaction.
  perform 1
  from public.orders as orders
  join (
    select distinct item_id
    from unnest(p_order_ids) as item(item_id)
    where item_id is not null
  ) as requested
    on requested.item_id = orders.id
  order by orders.id
  for update;

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