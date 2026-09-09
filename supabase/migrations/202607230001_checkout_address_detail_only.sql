-- Checkout: use one complete delivery address field.
-- Legacy province, district and ward columns remain for compatibility
-- and receive empty strings for new orders.
create or replace function public.create_store_order(
  p_customer jsonb,
  p_items jsonb,
  p_coupon_code text,
  p_attribution jsonb
) returns jsonb
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
  v_custom_result jsonb;
  v_custom_options jsonb;
  v_custom_price_delta numeric(12, 0);
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
  v_utm_attribution jsonb := '{}'::jsonb;
begin
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'Thong tin khach hang khong hop le.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Gio hang dang trong.';
  end if;

  v_customer_phone := btrim(coalesce(p_customer ->> 'phone', ''));

  if length(btrim(coalesce(p_customer ->> 'fullName', ''))) < 2 then
    raise exception 'Ho ten khach hang khong hop le.';
  end if;

  if v_customer_phone !~ '^0[0-9]{9}$' then
    raise exception 'So dien thoai khong hop le.';
  end if;

  if btrim(coalesce(p_customer ->> 'addressDetail', '')) = '' then
    raise exception 'Dia chi nhan hang chua day du.';
  end if;

  v_utm_attribution :=
    public.normalize_order_utm_attribution(p_attribution);

  select * into v_settings from public.store_settings where id = 1;
  if not found then
    raise exception 'Chua co cau hinh cua hang.';
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
    inventory_reserved,
    utm_attribution
  ) values (
    btrim(p_customer ->> 'fullName'),
    v_customer_phone,
    '',
    '',
    '',
    btrim(p_customer ->> 'addressDetail'),
    nullif(btrim(coalesce(p_customer ->> 'note', '')), ''),
    0,
    0,
    0,
    0,
    nullif(upper(btrim(coalesce(p_coupon_code, ''))), ''),
    'cod',
    'new',
    false,
    v_utm_attribution
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product_id := (v_item ->> 'productId')::uuid;
    exception when others then
      raise exception 'Ma san pham khong hop le.';
    end;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity <= 0 then
      raise exception 'So luong san pham khong hop le.';
    end if;

    select *
      into v_product
    from public.products
    where id = v_product_id
      and status = 'active'
    for update;

    if not found then
      raise exception 'Co san pham khong con duoc ban.';
    end if;

    v_selected_variants := coalesce(v_item -> 'selectedVariants', '[]'::jsonb);
    if jsonb_typeof(v_selected_variants) <> 'array' then
      raise exception 'Du lieu bien the khong hop le.';
    end if;

    v_unit_price := v_product.price;
    v_variant_name := '';

    for v_selected in select value from jsonb_array_elements(v_selected_variants) loop
      select g.value, o.value
        into v_group_json, v_option_json
      from jsonb_array_elements(coalesce(v_product.metadata -> 'variantGroups', '[]'::jsonb)) as g(value)
      cross join lateral jsonb_array_elements(coalesce(g.value -> 'options', '[]'::jsonb)) as o(value)
      where g.value ->> 'id' = v_selected ->> 'groupId'
        and o.value ->> 'id' = v_selected ->> 'optionId'
      limit 1;

      if not found then
        raise exception 'Bien the san pham khong con ton tai.';
      end if;

      v_unit_price := v_unit_price + coalesce(nullif(v_option_json ->> 'priceDelta', '')::numeric, 0);
      v_variant_name := concat_ws(
        ' Â· ',
        nullif(v_variant_name, ''),
        coalesce(v_group_json ->> 'name', v_selected ->> 'groupName') || ': ' || coalesce(v_option_json ->> 'label', v_selected ->> 'optionLabel')
      );
    end loop;

    v_custom_result := public.resolve_order_item_custom_options(v_product.id, v_item);
    v_custom_options := coalesce(v_custom_result -> 'snapshot', '{}'::jsonb);
    v_custom_price_delta := coalesce((v_custom_result ->> 'price_delta')::numeric, 0);
    v_unit_price := v_unit_price + v_custom_price_delta;

    if v_settings.enable_inventory and v_product.track_inventory then
      if v_product.stock < v_quantity then
        raise exception '% khong du ton kho.', v_product.name;
      end if;

      v_metadata := public.adjust_variant_stocks(v_product.metadata, v_selected_variants, -v_quantity);

      update public.products
      set stock = v_product.stock - v_quantity,
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
      selected_variants,
      custom_options
    ) values (
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
      coalesce(v_product.metadata ->> 'emoji', ''),
      v_selected_variants,
      v_custom_options
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
      raise exception 'Ma giam gia khong hop le.';
    end if;

    if v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      raise exception 'Ma giam gia chua bat dau.';
    end if;

    if v_coupon.ends_at is not null and v_coupon.ends_at < now() then
      raise exception 'Ma giam gia da het han.';
    end if;

    if v_subtotal < v_coupon.minimum_order_value then
      raise exception 'Don hang chua dat gia tri toi thieu cua ma giam gia.';
    end if;

    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      raise exception 'Ma giam gia da het luot su dung.';
    end if;

    if v_coupon.usage_limit_per_customer is not null then
      select count(*)
        into v_usage_count
      from public.coupon_usages
      where coupon_id = v_coupon.id
        and customer_phone = v_customer_phone;

      if v_usage_count >= v_coupon.usage_limit_per_customer then
        raise exception 'So dien thoai nay da het luot dung ma giam gia.';
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
    ) values (
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
  set subtotal = v_subtotal,
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
  ) values (
    v_order.id,
    null,
    'new',
    'Khach dat don COD',
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
    'inventory_reserved', v_order.inventory_reserved,
    'utm_attribution', v_order.utm_attribution
  );
end;
$$;
