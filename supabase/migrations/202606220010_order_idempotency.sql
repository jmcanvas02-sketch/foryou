begin;

alter table public.orders
  add column if not exists client_request_id uuid;

create unique index if not exists
orders_client_request_id_unique_idx
on public.orders (client_request_id)
where client_request_id is not null;

comment on column public.orders.client_request_id is
'MÃ£ Ä‘á»‹nh danh do trÃ¬nh duyá»‡t táº¡o Ä‘á»ƒ chá»‘ng táº¡o Ä‘Æ¡n trÃ¹ng khi retry.';

create or replace function
public.create_store_order_idempotent(
  p_client_request_id uuid,
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
  v_order public.orders%rowtype;
  v_result jsonb;
  v_order_id uuid;
begin
  if p_client_request_id is null then
    raise exception 'Thiáº¿u mÃ£ Ä‘á»‹nh danh yÃªu cáº§u Ä‘áº·t hÃ ng.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_client_request_id::text,
      0
    )
  );

  select *
  into v_order
  from public.orders
  where client_request_id = p_client_request_id
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_order.id,
      'order_code', v_order.order_code,
      'created_at', v_order.created_at,
      'subtotal', v_order.subtotal,
      'discount_amount',
        v_order.discount_amount,
      'shipping_fee', v_order.shipping_fee,
      'total_amount', v_order.total_amount,
      'inventory_reserved',
        v_order.inventory_reserved,
      'client_request_id',
        v_order.client_request_id,
      'replayed', true
    );
  end if;

  v_result := public.create_store_order(
    p_customer,
    p_items,
    p_coupon_code
  );

  begin
    v_order_id := (v_result ->> 'id')::uuid;
  exception
    when others then
      raise exception
        'Há»‡ thá»‘ng khÃ´ng tráº£ vá» mÃ£ Ä‘Æ¡n há»£p lá»‡.';
  end;

  update public.orders
  set client_request_id = p_client_request_id
  where id = v_order_id
  returning * into v_order;

  if not found then
    raise exception
      'KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng vá»«a táº¡o.';
  end if;

  return v_result || jsonb_build_object(
    'client_request_id',
      p_client_request_id,
    'replayed',
      false
  );
end;
$$;

revoke all on function
public.create_store_order_idempotent(
  uuid,
  jsonb,
  jsonb,
  text
)
from public;

grant execute on function
public.create_store_order_idempotent(
  uuid,
  jsonb,
  jsonb,
  text
)
to anon, authenticated;

commit;