begin;

alter table public.orders
  add column if not exists normalized_province text,
  add column if not exists normalized_district text,
  add column if not exists normalized_ward text,
  add column if not exists normalized_address_line text,
  add column if not exists normalized_at timestamptz,
  add column if not exists normalized_address_stale boolean not null default false;

comment on column public.orders.normalized_province
  is 'Tỉnh/thành phố đã được admin chuẩn hóa, không ghi đè địa chỉ gốc.';
comment on column public.orders.normalized_district
  is 'Quận/huyện đã được admin chuẩn hóa, không ghi đè địa chỉ gốc.';
comment on column public.orders.normalized_ward
  is 'Xã/phường đã được admin chuẩn hóa, không ghi đè địa chỉ gốc.';
comment on column public.orders.normalized_address_line
  is 'Địa chỉ chi tiết đã được admin chuẩn hóa, không ghi đè địa chỉ gốc.';
comment on column public.orders.normalized_at
  is 'Thời điểm admin lưu địa chỉ chuẩn hóa gần nhất.';
comment on column public.orders.normalized_address_stale
  is 'True khi địa chỉ gốc đã thay đổi sau lần chuẩn hóa gần nhất.';

create or replace function public.mark_order_normalized_address_stale()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.normalized_at is not null
    and (
      old.province is distinct from new.province
      or old.district is distinct from new.district
      or old.ward is distinct from new.ward
      or old.address_line is distinct from new.address_line
    )
  then
    new.normalized_address_stale := true;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_mark_normalized_address_stale
on public.orders;

create trigger orders_mark_normalized_address_stale
before update of province, district, ward, address_line
on public.orders
for each row
execute function public.mark_order_normalized_address_stale();

create or replace function public.admin_bulk_normalize_order_addresses(
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
  v_order_id uuid;
  v_requested integer;
  v_distinct integer;
  v_updated integer := 0;
  v_province text;
  v_district text;
  v_ward text;
  v_address_line text;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền chuẩn hóa địa chỉ đơn hàng.';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Danh sách địa chỉ chuẩn hóa không hợp lệ.';
  end if;

  v_requested := jsonb_array_length(p_entries);

  if v_requested = 0 then
    raise exception 'Chưa có địa chỉ cần chuẩn hóa.';
  end if;

  if v_requested > 50 then
    raise exception 'Chỉ được chuẩn hóa tối đa 50 đơn hàng mỗi lần.';
  end if;

  select count(distinct nullif(btrim(value ->> 'orderId'), ''))
  into v_distinct
  from jsonb_array_elements(p_entries);

  if v_distinct <> v_requested then
    raise exception 'Danh sách có đơn hàng trùng lặp hoặc thiếu mã đơn.';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_entries)
  loop
    begin
      v_order_id := (v_entry ->> 'orderId')::uuid;
    exception when others then
      raise exception 'Mã đơn hàng cần chuẩn hóa không hợp lệ.';
    end;

    v_province := btrim(coalesce(v_entry ->> 'province', ''));
    v_district := btrim(coalesce(v_entry ->> 'district', ''));
    v_ward := btrim(coalesce(v_entry ->> 'ward', ''));
    v_address_line := btrim(coalesce(v_entry ->> 'addressDetail', ''));

    if v_province = ''
      or v_district = ''
      or v_ward = ''
      or v_address_line = ''
    then
      raise exception 'Địa chỉ chuẩn hóa phải đủ địa chỉ chi tiết, xã/phường, quận/huyện và tỉnh/thành phố.';
    end if;

    update public.orders
    set
      normalized_province = v_province,
      normalized_district = v_district,
      normalized_ward = v_ward,
      normalized_address_line = v_address_line,
      normalized_at = now(),
      normalized_address_stale = false
    where id = v_order_id;

    if not found then
      raise exception 'Có đơn hàng không còn tồn tại.';
    end if;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'requested', v_requested,
    'updated', v_updated
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
    'confirmed',
    'preparing',
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

revoke all on function public.admin_bulk_normalize_order_addresses(jsonb)
from public;

revoke all on function public.admin_update_order(uuid, jsonb, jsonb)
from public;

grant execute on function public.admin_bulk_normalize_order_addresses(jsonb)
to authenticated;

grant execute on function public.admin_update_order(uuid, jsonb, jsonb)
to authenticated;

commit;
