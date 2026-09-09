begin;

alter table public.orders
  add column if not exists inventory_reserved boolean not null default false;

alter table public.order_items
  add column if not exists product_slug text,
  add column if not exists product_background text,
  add column if not exists product_emoji text,
  add column if not exists selected_variants jsonb not null default '[]'::jsonb;

create or replace function public.adjust_variant_stocks(
  p_metadata jsonb,
  p_selected_variants jsonb,
  p_delta integer
)
returns jsonb
language plpgsql
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_groups jsonb := coalesce(v_metadata -> 'variantGroups', '[]'::jsonb);
  v_selected jsonb;
  v_group jsonb;
  v_option jsonb;
  v_found_group jsonb;
  v_found_option jsonb;
  v_new_groups jsonb := '[]'::jsonb;
  v_new_options jsonb;
  v_current_stock integer;
  v_new_stock integer;
begin
  if p_selected_variants is null or jsonb_typeof(p_selected_variants) <> 'array' then
    return v_metadata;
  end if;

  if jsonb_array_length(p_selected_variants) = 0 then
    return v_metadata;
  end if;

  if jsonb_typeof(v_groups) <> 'array' then
    raise exception 'Dữ liệu biến thể của sản phẩm không hợp lệ.';
  end if;

  for v_selected in
    select value from jsonb_array_elements(p_selected_variants)
  loop
    select g.value, o.value
    into v_found_group, v_found_option
    from jsonb_array_elements(v_groups) as g(value)
    cross join lateral jsonb_array_elements(
      coalesce(g.value -> 'options', '[]'::jsonb)
    ) as o(value)
    where g.value ->> 'id' = v_selected ->> 'groupId'
      and o.value ->> 'id' = v_selected ->> 'optionId'
    limit 1;

    if not found then
      raise exception 'Biến thể sản phẩm không còn tồn tại.';
    end if;
  end loop;

  for v_group in
    select value from jsonb_array_elements(v_groups)
  loop
    v_new_options := '[]'::jsonb;

    for v_option in
      select value
      from jsonb_array_elements(coalesce(v_group -> 'options', '[]'::jsonb))
    loop
      if exists (
        select 1
        from jsonb_array_elements(p_selected_variants) as selected(value)
        where selected.value ->> 'groupId' = v_group ->> 'id'
          and selected.value ->> 'optionId' = v_option ->> 'id'
      ) then
        if v_option ? 'stock' and jsonb_typeof(v_option -> 'stock') = 'number' then
          v_current_stock := (v_option ->> 'stock')::integer;
          v_new_stock := v_current_stock + p_delta;

          if v_new_stock < 0 then
            raise exception 'Biến thể đã chọn không đủ tồn kho.';
          end if;

          v_option := jsonb_set(
            v_option,
            '{stock}',
            to_jsonb(v_new_stock),
            true
          );
        end if;
      end if;

      v_new_options := v_new_options || jsonb_build_array(v_option);
    end loop;

    v_group := jsonb_set(v_group, '{options}', v_new_options, true);
    v_new_groups := v_new_groups || jsonb_build_array(v_group);
  end loop;

  return jsonb_set(v_metadata, '{variantGroups}', v_new_groups, true);
end;
$$;

create or replace function public.create_store_order(
  p_customer jsonb,
  p_items jsonb,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.store_settings%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_coupon public.coupons%rowtype;
  v_item jsonb;
  v_selected jsonb;
  v_group_json jsonb;
  v_option_json jsonb;
  v_selected_variants jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12, 0);
  v_line_total numeric(12, 0);
  v_subtotal numeric(12, 0) := 0;
  v_discount numeric(12, 0) := 0;
  v_shipping numeric(12, 0) := 0;
  v_total numeric(12, 0) := 0;
  v_variant_name text;
  v_image_url text;
  v_metadata jsonb;
  v_inventory_reserved boolean := false;
  v_customer_phone text;
  v_usage_count integer;
begin
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'Thông tin khách hàng không hợp lệ.';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception 'Giỏ hàng đang trống.';
  end if;

  v_customer_phone := btrim(coalesce(p_customer ->> 'phone', ''));

  if length(btrim(coalesce(p_customer ->> 'fullName', ''))) < 2 then
    raise exception 'Họ tên khách hàng không hợp lệ.';
  end if;

  if v_customer_phone !~ '^0[0-9]{9}$' then
    raise exception 'Số điện thoại không hợp lệ.';
  end if;

  if btrim(coalesce(p_customer ->> 'province', '')) = ''
    or btrim(coalesce(p_customer ->> 'district', '')) = ''
    or btrim(coalesce(p_customer ->> 'ward', '')) = ''
    or btrim(coalesce(p_customer ->> 'addressDetail', '')) = ''
  then
    raise exception 'Địa chỉ nhận hàng chưa đầy đủ.';
  end if;

  select *
  into v_settings
  from public.store_settings
  where id = 1;

  if not found then
    raise exception 'Chưa có cấu hình cửa hàng.';
  end if;

  insert into public.orders (
    customer_name,
    customer_phone,
    province,
    district,
    ward,
    address_line,
    note,
    subtotal,
    discount_amount,
    shipping_fee,
    total_amount,
    coupon_code,
    payment_method,
    status,
    inventory_reserved
  )
  values (
    btrim(p_customer ->> 'fullName'),
    v_customer_phone,
    btrim(p_customer ->> 'province'),
    btrim(p_customer ->> 'district'),
    btrim(p_customer ->> 'ward'),
    btrim(p_customer ->> 'addressDetail'),
    nullif(btrim(coalesce(p_customer ->> 'note', '')), ''),
    0,
    0,
    0,
    0,
    nullif(upper(btrim(coalesce(p_coupon_code, ''))), ''),
    'cod',
    'new',
    false
  )
  returning * into v_order;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'productId')::uuid;
    exception
      when others then
        raise exception 'Mã sản phẩm không hợp lệ.';
    end;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_quantity <= 0 then
      raise exception 'Số lượng sản phẩm không hợp lệ.';
    end if;

    select *
    into v_product
    from public.products
    where id = v_product_id
      and status = 'active'
    for update;

    if not found then
      raise exception 'Có sản phẩm không còn được bán.';
    end if;

    v_selected_variants := coalesce(
      v_item -> 'selectedVariants',
      '[]'::jsonb
    );

    if jsonb_typeof(v_selected_variants) <> 'array' then
      raise exception 'Dữ liệu biến thể không hợp lệ.';
    end if;

    v_unit_price := v_product.price;
    v_variant_name := '';

    for v_selected in
      select value from jsonb_array_elements(v_selected_variants)
    loop
      select g.value, o.value
      into v_group_json, v_option_json
      from jsonb_array_elements(
        coalesce(v_product.metadata -> 'variantGroups', '[]'::jsonb)
      ) as g(value)
      cross join lateral jsonb_array_elements(
        coalesce(g.value -> 'options', '[]'::jsonb)
      ) as o(value)
      where g.value ->> 'id' = v_selected ->> 'groupId'
        and o.value ->> 'id' = v_selected ->> 'optionId'
      limit 1;

      if not found then
        raise exception 'Biến thể sản phẩm không còn tồn tại.';
      end if;

      v_unit_price := v_unit_price + coalesce(
        nullif(v_option_json ->> 'priceDelta', '')::numeric,
        0
      );

      v_variant_name := concat_ws(
        ' · ',
        nullif(v_variant_name, ''),
        coalesce(v_group_json ->> 'name', v_selected ->> 'groupName') ||
          ': ' ||
          coalesce(v_option_json ->> 'label', v_selected ->> 'optionLabel')
      );
    end loop;

    if v_settings.enable_inventory and v_product.track_inventory then
      if v_product.stock < v_quantity then
        raise exception '% không đủ tồn kho.', v_product.name;
      end if;

      v_metadata := public.adjust_variant_stocks(
        v_product.metadata,
        v_selected_variants,
        -v_quantity
      );

      update public.products
      set
        stock = v_product.stock - v_quantity,
        metadata = v_metadata,
        status = case
          when v_product.stock - v_quantity <= 0 then 'out_of_stock'
          else 'active'
        end
      where id = v_product.id;

      v_inventory_reserved := true;
    end if;

    select image_url
    into v_image_url
    from public.product_images
    where product_id = v_product.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1;

    v_line_total := round(v_unit_price) * v_quantity;
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
      selected_variants
    )
    values (
      v_order.id,
      v_product.id,
      v_product.name,
      v_product.sku,
      nullif(v_variant_name, ''),
      v_image_url,
      round(v_unit_price),
      v_quantity,
      v_line_total,
      v_product.slug,
      coalesce(v_product.metadata ->> 'background', '#dff4ff'),
      coalesce(v_product.metadata ->> 'emoji', '📦'),
      v_selected_variants
    );
  end loop;

  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    select *
    into v_coupon
    from public.coupons
    where lower(code) = lower(btrim(p_coupon_code))
      and active = true
    for update;

    if not found then
      raise exception 'Mã giảm giá không hợp lệ.';
    end if;

    if v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      raise exception 'Mã giảm giá chưa bắt đầu.';
    end if;

    if v_coupon.ends_at is not null and v_coupon.ends_at < now() then
      raise exception 'Mã giảm giá đã hết hạn.';
    end if;

    if v_subtotal < v_coupon.minimum_order_value then
      raise exception 'Đơn hàng chưa đạt giá trị tối thiểu của mã giảm giá.';
    end if;

    if v_coupon.usage_limit is not null
      and v_coupon.used_count >= v_coupon.usage_limit
    then
      raise exception 'Mã giảm giá đã hết lượt sử dụng.';
    end if;

    if v_coupon.usage_limit_per_customer is not null then
      select count(*)
      into v_usage_count
      from public.coupon_usages
      where coupon_id = v_coupon.id
        and customer_phone = v_customer_phone;

      if v_usage_count >= v_coupon.usage_limit_per_customer then
        raise exception 'Số điện thoại này đã hết lượt dùng mã giảm giá.';
      end if;
    end if;

    if v_coupon.discount_type = 'fixed' then
      v_discount := round(v_coupon.discount_value);
    else
      v_discount := round(v_subtotal * v_coupon.discount_value / 100);
    end if;

    if v_coupon.maximum_discount is not null then
      v_discount := least(v_discount, v_coupon.maximum_discount);
    end if;

    v_discount := least(v_discount, v_subtotal);

    update public.coupons
    set used_count = used_count + 1
    where id = v_coupon.id;

    insert into public.coupon_usages (
      coupon_id,
      order_id,
      customer_phone
    )
    values (
      v_coupon.id,
      v_order.id,
      v_customer_phone
    );
  end if;

  v_shipping := case
    when v_subtotal >= v_settings.free_shipping_threshold then 0
    else v_settings.shipping_fee
  end;

  v_total := greatest(0, v_subtotal - v_discount) + v_shipping;

  update public.orders
  set
    subtotal = v_subtotal,
    discount_amount = v_discount,
    shipping_fee = v_shipping,
    total_amount = v_total,
    inventory_reserved = v_inventory_reserved
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
    null,
    'new',
    'Khách đặt đơn COD',
    null
  );

  return jsonb_build_object(
    'id', v_order.id,
    'order_code', v_order.order_code,
    'created_at', v_order.created_at,
    'subtotal', v_order.subtotal,
    'discount_amount', v_order.discount_amount,
    'shipping_fee', v_order.shipping_fee,
    'total_amount', v_order.total_amount,
    'inventory_reserved', v_order.inventory_reserved
  );
end;
$$;

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
begin
  if not public.is_admin() then
    raise exception 'Không có quyền cập nhật đơn hàng.';
  end if;

  if p_status not in (
    'new',
    'confirmed',
    'preparing',
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

  if v_order.status = p_status then
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
  elsif v_order.status = 'cancelled'
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
      when v_order.status = 'cancelled' then null
      else cancelled_at
    end,
    completed_at = case
      when p_status = 'completed' then now()
      when v_order.status = 'completed' then null
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
    v_order.status,
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

insert into public.coupons (
  code,
  discount_type,
  discount_value,
  minimum_order_value,
  maximum_discount,
  usage_limit,
  active
)
values
  ('INGIDAY10', 'percent', 10, 100000, 30000, 100, true),
  ('GIAM20K', 'fixed', 20000, 200000, null, 50, true)
on conflict do nothing;

revoke all on function public.adjust_variant_stocks(jsonb, jsonb, integer)
from public;

revoke all on function public.create_store_order(jsonb, jsonb, text)
from public;

revoke all on function public.update_store_order_status(uuid, text, text)
from public;

grant execute on function public.create_store_order(jsonb, jsonb, text)
to anon, authenticated;

grant execute on function public.update_store_order_status(uuid, text, text)
to authenticated;

commit;
