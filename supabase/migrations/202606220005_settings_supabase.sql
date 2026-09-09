begin;

alter table public.store_settings
  add column if not exists shop_name text not null default 'InGiDay',
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists messenger_url text,
  add column if not exists footer_text text,
  add column if not exists shipping_fee numeric(12, 0) not null
    default 15000,
  add column if not exists free_shipping_threshold numeric(12, 0)
    not null default 200000,
  add column if not exists currency text not null default 'VND',
  add column if not exists enable_coupons boolean not null
    default true,
  add column if not exists enable_inventory boolean not null
    default true,
  add column if not exists custom_print_title text not null
    default 'Biến ý tưởng thành món đồ thật',
  add column if not exists custom_print_description text not null
    default 'Gửi hình ảnh hoặc mô tả qua Messenger. Shop sẽ trao đổi mẫu, kích thước, màu sắc, giá và thời gian hoàn thiện.',
  add column if not exists custom_print_button_text text not null
    default 'Va ngay với chủ shop để yêu cầu',
  add column if not exists custom_print_step_1_title text not null
    default 'Gửi ý tưởng',
  add column if not exists custom_print_step_1_description text not null
    default 'Gửi hình ảnh, mô tả hoặc kích thước mong muốn qua Messenger.',
  add column if not exists custom_print_step_2_title text not null
    default 'Shop tư vấn',
  add column if not exists custom_print_step_2_description text not null
    default 'Shop trao đổi về mẫu, màu sắc, kích thước, giá và thời gian hoàn thiện.',
  add column if not exists custom_print_step_3_title text not null
    default 'Xác nhận và in',
  add column if not exists custom_print_step_3_description text not null
    default 'Sau khi chốt yêu cầu, shop tiến hành in và cập nhật tiến độ cho bạn.';

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists store_settings_public_select
on public.store_settings;

create policy store_settings_public_select
on public.store_settings
for select
to anon, authenticated
using (true);

drop policy if exists store_settings_admin_update
on public.store_settings;

create policy store_settings_admin_update
on public.store_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;

create or replace function public.validate_store_coupon(
  p_code text,
  p_subtotal numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon public.coupons%rowtype;
  v_code text;
  v_subtotal numeric := greatest(coalesce(p_subtotal, 0), 0);
  v_raw_discount numeric := 0;
  v_discount numeric := 0;
  v_coupons_enabled boolean := true;
begin
  select enable_coupons
  into v_coupons_enabled
  from public.store_settings
  where id = 1;

  if not coalesce(v_coupons_enabled, true) then
    return jsonb_build_object(
      'valid', false,
      'message', 'Cửa hàng đang tạm ngừng mã giảm giá.',
      'discount', 0
    );
  end if;

  v_code := upper(
    regexp_replace(
      btrim(coalesce(p_code, '')),
      '[[:space:]]+',
      '',
      'g'
    )
  );

  if v_code = '' then
    return jsonb_build_object(
      'valid', false,
      'message', 'Vui lòng nhập mã giảm giá.',
      'discount', 0
    );
  end if;

  select *
  into v_coupon
  from public.coupons
  where lower(code) = lower(v_code)
  limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'message', 'Mã giảm giá không tồn tại.',
      'discount', 0
    );
  end if;

  if not v_coupon.active then
    return jsonb_build_object(
      'valid', false,
      'message', 'Mã giảm giá đang tạm khóa.',
      'discount', 0
    );
  end if;

  if v_coupon.starts_at is not null
    and v_coupon.starts_at > now()
  then
    return jsonb_build_object(
      'valid', false,
      'message', 'Mã giảm giá chưa bắt đầu.',
      'discount', 0
    );
  end if;

  if v_coupon.ends_at is not null
    and v_coupon.ends_at < now()
  then
    return jsonb_build_object(
      'valid', false,
      'message', 'Mã giảm giá đã hết hạn.',
      'discount', 0
    );
  end if;

  if v_coupon.usage_limit is not null
    and v_coupon.used_count >= v_coupon.usage_limit
  then
    return jsonb_build_object(
      'valid', false,
      'message', 'Mã giảm giá đã hết lượt sử dụng.',
      'discount', 0
    );
  end if;

  if v_subtotal < v_coupon.minimum_order_value then
    return jsonb_build_object(
      'valid', false,
      'message',
      'Đơn hàng chưa đạt giá trị tối thiểu ' ||
        trim(
          to_char(
            v_coupon.minimum_order_value,
            'FM999G999G999G990'
          )
        ) ||
        'đ.',
      'discount', 0
    );
  end if;

  if v_coupon.discount_type = 'fixed' then
    v_raw_discount := v_coupon.discount_value;
  else
    v_raw_discount :=
      v_subtotal * v_coupon.discount_value / 100;
  end if;

  v_discount := least(v_raw_discount, v_subtotal);

  if v_coupon.maximum_discount is not null then
    v_discount := least(
      v_discount,
      v_coupon.maximum_discount
    );
  end if;

  v_discount := round(greatest(v_discount, 0));

  return jsonb_build_object(
    'valid', true,
    'message', 'Áp dụng mã giảm giá thành công.',
    'discount', v_discount,
    'coupon', jsonb_build_object(
      'id', v_coupon.id,
      'code', v_coupon.code,
      'type', case
        when v_coupon.discount_type = 'percent'
          then 'percentage'
        else 'fixed'
      end,
      'value', v_coupon.discount_value,
      'minOrder', v_coupon.minimum_order_value,
      'maxDiscount', v_coupon.maximum_discount,
      'usageLimit', v_coupon.usage_limit,
      'usedCount', v_coupon.used_count,
      'startsAt', case
        when v_coupon.starts_at is null then null
        else to_char(
          v_coupon.starts_at at time zone 'Asia/Ho_Chi_Minh',
          'YYYY-MM-DD'
        )
      end,
      'endsAt', case
        when v_coupon.ends_at is null then null
        else to_char(
          v_coupon.ends_at at time zone 'Asia/Ho_Chi_Minh',
          'YYYY-MM-DD'
        )
      end,
      'active', v_coupon.active,
      'createdAt', v_coupon.created_at,
      'updatedAt', v_coupon.updated_at
    )
  );
end;
$$;

create or replace function public.enforce_coupon_feature_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean := true;
begin
  select enable_coupons
  into v_enabled
  from public.store_settings
  where id = 1;

  if not coalesce(v_enabled, true) then
    raise exception
      'Cửa hàng đang tạm ngừng mã giảm giá.';
  end if;

  return new;
end;
$$;

drop trigger if exists coupon_usages_feature_enabled
on public.coupon_usages;

create trigger coupon_usages_feature_enabled
before insert
on public.coupon_usages
for each row
execute function public.enforce_coupon_feature_enabled();

revoke all on function public.validate_store_coupon(text, numeric)
from public;

grant execute on function public.validate_store_coupon(text, numeric)
to anon, authenticated;

revoke all on function public.enforce_coupon_feature_enabled()
from public;

commit;