begin;

create or replace function public.admin_bulk_add_product_categories(
  p_product_ids uuid[],
  p_category_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_ids uuid[];
  v_category_ids uuid[];
  v_requested_products integer;
  v_existing_products integer;
  v_requested_categories integer;
  v_existing_categories integer;
  v_inserted integer;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền cập nhật bộ sưu tập sản phẩm.';
  end if;

  select coalesce(
    array_agg(distinct selected.product_id),
    array[]::uuid[]
  )
  into v_product_ids
  from unnest(
    coalesce(p_product_ids, array[]::uuid[])
  ) as selected(product_id)
  where selected.product_id is not null;

  select coalesce(
    array_agg(distinct selected.category_id),
    array[]::uuid[]
  )
  into v_category_ids
  from unnest(
    coalesce(p_category_ids, array[]::uuid[])
  ) as selected(category_id)
  where selected.category_id is not null;

  v_requested_products := cardinality(v_product_ids);
  v_requested_categories := cardinality(v_category_ids);

  if v_requested_products = 0 then
    raise exception 'Chưa chọn sản phẩm.';
  end if;

  if v_requested_products > 50 then
    raise exception 'Chỉ có thể cập nhật tối đa 50 sản phẩm mỗi lần.';
  end if;

  if v_requested_categories = 0 then
    raise exception 'Chưa chọn bộ sưu tập.';
  end if;

  select count(*)
  into v_existing_products
  from public.products
  where id = any(v_product_ids);

  if v_existing_products <> v_requested_products then
    raise exception 'Có sản phẩm không tồn tại.';
  end if;

  select count(*)
  into v_existing_categories
  from public.categories
  where id = any(v_category_ids);

  if v_existing_categories <> v_requested_categories then
    raise exception 'Có bộ sưu tập không tồn tại.';
  end if;

  insert into public.product_categories (
    product_id,
    category_id
  )
  select
    selected_product.product_id,
    selected_category.category_id
  from unnest(v_product_ids)
    as selected_product(product_id)
  cross join unnest(v_category_ids)
    as selected_category(category_id)
  on conflict (product_id, category_id) do nothing;

  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

revoke all
on function public.admin_bulk_add_product_categories(uuid[], uuid[])
from public;

grant execute
on function public.admin_bulk_add_product_categories(uuid[], uuid[])
to authenticated;

commit;