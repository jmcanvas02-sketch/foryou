begin;

lock table public.products in share row exclusive mode;

create sequence if not exists public.product_sku_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1
  no cycle;

do $$
declare
  v_existing_max bigint := 0;
  v_sequence_value bigint := 0;
  v_sequence_called boolean := false;
  v_floor bigint := 0;
begin
  select coalesce(
    max((substring(upper(btrim(sku)) from '^IGD([0-9]+)$'))::bigint),
    0
  )
  into v_existing_max
  from public.products
  where upper(btrim(sku)) ~ '^IGD[0-9]+$';

  select last_value, is_called
  into v_sequence_value, v_sequence_called
  from public.product_sku_seq;

  v_floor := greatest(
    v_existing_max,
    case when v_sequence_called then v_sequence_value else 0 end
  );

  if v_floor > 0 then
    perform setval('public.product_sku_seq'::regclass, v_floor, true);
  else
    perform setval('public.product_sku_seq'::regclass, 1, false);
  end if;
end;
$$;

create or replace function public.assign_product_sku()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'IGD' || lpad(
      nextval('public.product_sku_seq'::regclass)::text,
      6,
      '0'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists products_assign_sku_before_insert
on public.products;

create trigger products_assign_sku_before_insert
before insert on public.products
for each row
execute function public.assign_product_sku();

do $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select id
    from public.products
    where sku is null or btrim(sku) = ''
    order by created_at, id
  loop
    update public.products
    set sku = 'IGD' || lpad(
      nextval('public.product_sku_seq'::regclass)::text,
      6,
      '0'
    )
    where id = v_product_id;
  end loop;
end;
$$;

alter table public.products
  alter column sku set not null;

create or replace function public.prevent_product_sku_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sku is distinct from old.sku then
    raise exception 'Không được thay đổi mã sản phẩm.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_prevent_sku_change_before_update
on public.products;

create trigger products_prevent_sku_change_before_update
before update of sku on public.products
for each row
execute function public.prevent_product_sku_change();

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
      or public.catalog_normalize(products.sku) like '%' || v_query || '%'
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
      or public.catalog_normalize(products.sku) like '%' || v_query || '%'
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
  select coalesce(
    jsonb_agg(filtered.id order by filtered.created_at desc, filtered.id desc),
    '[]'::jsonb
  )
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

commit;