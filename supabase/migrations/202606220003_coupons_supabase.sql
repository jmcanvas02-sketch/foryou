begin;

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
begin
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
        trim(to_char(v_coupon.minimum_order_value, 'FM999G999G999G990')) ||
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
    v_discount := least(v_discount, v_coupon.maximum_discount);
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
        else to_char(v_coupon.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
      end,
      'endsAt', case
        when v_coupon.ends_at is null then null
        else to_char(v_coupon.ends_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
      end,
      'active', v_coupon.active,
      'createdAt', v_coupon.created_at,
      'updatedAt', v_coupon.updated_at
    )
  );
end;
$$;

revoke all on function public.validate_store_coupon(text, numeric)
from public;

grant execute on function public.validate_store_coupon(text, numeric)
to anon, authenticated;

commit;