begin;

create table public.product_categories (
  product_id uuid not null
    references public.products(id)
    on delete cascade,
  category_id uuid not null
    references public.categories(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index product_categories_category_product_idx
  on public.product_categories (category_id, product_id);

insert into public.product_categories (
  product_id,
  category_id
)
select
  products.id,
  products.category_id
from public.products as products
where products.category_id is not null
on conflict (product_id, category_id) do nothing;

alter table public.product_categories
  enable row level security;

create policy product_categories_admin_select
on public.product_categories
for select
to authenticated
using (public.is_admin());

grant select
on public.product_categories
to authenticated;

create or replace function public.sync_primary_product_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.category_id is not null then
    insert into public.product_categories (
      product_id,
      category_id
    )
    values (
      new.id,
      new.category_id
    )
    on conflict (product_id, category_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all
on function public.sync_primary_product_category()
from public;

drop trigger if exists products_sync_primary_category
on public.products;

create trigger products_sync_primary_category
after insert or update of category_id
on public.products
for each row
execute function public.sync_primary_product_category();

create or replace function public.admin_set_product_categories(
  p_product_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primary_category_id uuid;
  v_category_ids uuid[];
  v_requested integer;
  v_existing integer;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền cập nhật bộ sưu tập sản phẩm.';
  end if;

  select products.category_id
  into v_primary_category_id
  from public.products as products
  where products.id = p_product_id;

  if not found then
    raise exception 'Sản phẩm không tồn tại.';
  end if;

  select coalesce(
    array_agg(distinct selected.category_id),
    array[]::uuid[]
  )
  into v_category_ids
  from unnest(
    coalesce(p_category_ids, array[]::uuid[])
  ) as selected(category_id)
  where selected.category_id is not null;

  v_requested := cardinality(v_category_ids);

  if v_requested = 0 then
    raise exception 'Sản phẩm phải thuộc ít nhất một bộ sưu tập.';
  end if;

  if v_primary_category_id is null
    or not (v_primary_category_id = any(v_category_ids))
  then
    raise exception 'Danh mục chính phải nằm trong danh sách bộ sưu tập.';
  end if;

  select count(*)
  into v_existing
  from public.categories
  where id = any(v_category_ids);

  if v_existing <> v_requested then
    raise exception 'Có bộ sưu tập không tồn tại.';
  end if;

  delete from public.product_categories
  where product_id = p_product_id;

  insert into public.product_categories (
    product_id,
    category_id
  )
  select
    p_product_id,
    selected.category_id
  from unnest(v_category_ids) as selected(category_id);
end;
$$;

revoke all
on function public.admin_set_product_categories(uuid, uuid[])
from public;

grant execute
on function public.admin_set_product_categories(uuid, uuid[])
to authenticated;

create or replace function public.search_catalog_products(
  p_query text default '',
  p_category_id uuid default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock boolean default false,
  p_featured boolean default null,
  p_sort text default 'relevance',
  p_page integer default 1,
  p_page_size integer default 12
)
returns table (
  product_id uuid,
  product_name text,
  product_slug text,
  category_id uuid,
  category_name text,
  price numeric,
  compare_at_price numeric,
  stock integer,
  status text,
  is_featured boolean,
  description text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  image_id uuid,
  image_url text,
  image_public_id text,
  image_alt_text text,
  sold_quantity bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with normalized as (
    select
      public.catalog_normalize(
        btrim(coalesce(p_query, ''))
      ) as query_text,
      greatest(coalesce(p_page, 1), 1)
        as page_number,
      least(
        greatest(coalesce(p_page_size, 12), 1),
        48
      ) as page_size
  ),
  sales as (
    select
      items.product_id,
      coalesce(sum(items.quantity), 0)::bigint
        as sold_quantity
    from public.order_items as items
    join public.orders as orders
      on orders.id = items.order_id
      and orders.status = 'completed'
    where items.product_id is not null
    group by items.product_id
  ),
  catalog as (
    select
      products.id as product_id,
      products.name as product_name,
      products.slug as product_slug,
      products.category_id,
      categories.name as category_name,
      products.price,
      products.compare_at_price,
      products.stock,
      products.status::text as status,
      products.is_featured,
      products.description,
      products.metadata,
      products.created_at,
      products.updated_at,
      primary_image.id as image_id,
      primary_image.image_url,
      primary_image.public_id as image_public_id,
      primary_image.alt_text as image_alt_text,
      coalesce(
        sales.sold_quantity,
        0
      )::bigint as sold_quantity,
      normalized.query_text,
      greatest(
        extensions.similarity(
          products.search_text,
          normalized.query_text
        ),
        extensions.similarity(
          public.catalog_normalize(categories.name),
          normalized.query_text
        )
      ) as relevance_score
    from public.products as products
    left join public.categories as categories
      on categories.id = products.category_id
    left join sales
      on sales.product_id = products.id
    cross join normalized
    left join lateral (
      select
        images.id,
        images.image_url,
        images.public_id,
        images.alt_text
      from public.product_images as images
      where images.product_id = products.id
      order by
        images.is_primary desc,
        images.sort_order asc,
        images.created_at asc
      limit 1
    ) as primary_image on true
    where products.status in (
      'active',
      'out_of_stock'
    )
    and (
      p_category_id is null
      or exists (
        select 1
        from public.product_categories as membership
        where membership.product_id = products.id
          and membership.category_id = p_category_id
      )
    )
    and (
      products.price >= p_min_price
      or p_min_price is null
    )
    and (
      products.price <= p_max_price
      or p_max_price is null
    )
    and (
      not coalesce(p_in_stock, false)
      or (
        products.stock > 0
        and products.status = 'active'
      )
    )
    and (
      products.is_featured = p_featured
      or p_featured is null
    )
    and (
      normalized.query_text = ''
      or products.search_text
        like '%' || normalized.query_text || '%'
      or public.catalog_normalize(categories.name)
        like '%' || normalized.query_text || '%'
      or extensions.similarity(
        products.search_text,
        normalized.query_text
      ) >= 0.18
    )
  )
  select
    catalog.product_id,
    catalog.product_name,
    catalog.product_slug,
    catalog.category_id,
    catalog.category_name,
    catalog.price,
    catalog.compare_at_price,
    catalog.stock,
    catalog.status,
    catalog.is_featured,
    catalog.description,
    catalog.metadata,
    catalog.created_at,
    catalog.updated_at,
    catalog.image_id,
    catalog.image_url,
    catalog.image_public_id,
    catalog.image_alt_text,
    catalog.sold_quantity,
    count(*) over() as total_count
  from catalog
  cross join normalized
  order by
    case
      when p_sort = 'relevance'
        and normalized.query_text <> ''
      then catalog.relevance_score
    end desc nulls last,
    case
      when p_sort = 'bestselling'
      then catalog.sold_quantity
    end desc nulls last,
    case
      when p_sort = 'price_asc'
      then catalog.price
    end asc nulls last,
    case
      when p_sort = 'price_desc'
      then catalog.price
    end desc nulls last,
    case
      when p_sort = 'newest'
      then catalog.created_at
    end desc nulls last,
    catalog.created_at desc,
    catalog.product_id
  offset (
    greatest(coalesce(p_page, 1), 1) - 1
  ) * least(
    greatest(coalesce(p_page_size, 12), 1),
    48
  )
  limit least(
    greatest(coalesce(p_page_size, 12), 1),
    48
  );
$$;

revoke all
on function public.search_catalog_products(
  text,
  uuid,
  numeric,
  numeric,
  boolean,
  boolean,
  text,
  integer,
  integer
)
from public;

grant execute
on function public.search_catalog_products(
  text,
  uuid,
  numeric,
  numeric,
  boolean,
  boolean,
  text,
  integer,
  integer
)
to anon, authenticated;

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
  v_query text := public.catalog_normalize(
    btrim(coalesce(p_query, ''))
  );
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(
    greatest(coalesce(p_page_size, 50), 1),
    50
  );
  v_total bigint := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không có quyền xem danh sách sản phẩm.';
  end if;

  if p_status is not null
    and p_status not in (
      'active',
      'hidden',
      'out_of_stock'
    )
  then
    raise exception 'Trạng thái sản phẩm không hợp lệ.';
  end if;

  with filtered as (
    select products.id
    from public.products as products
    where (
      v_query = ''
      or public.catalog_normalize(products.name)
        like '%' || v_query || '%'
      or products.id::text
        ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
    and (
      p_category_id is null
      or exists (
        select 1
        from public.product_categories as membership
        where membership.product_id = products.id
          and membership.category_id = p_category_id
      )
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
      or public.catalog_normalize(products.name)
        like '%' || v_query || '%'
      or products.id::text
        ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
    and (
      p_category_id is null
      or exists (
        select 1
        from public.product_categories as membership
        where membership.product_id = products.id
          and membership.category_id = p_category_id
      )
    )
    and (
      p_status is null
      or (
        p_status = 'hidden'
        and products.status::text in ('hidden', 'draft')
      )
      or products.status::text = p_status
    )
    order by
      products.created_at desc,
      products.id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select coalesce(
    jsonb_agg(
      filtered.id
      order by
        filtered.created_at desc,
        filtered.id desc
    ),
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

revoke all
on function public.admin_search_product_ids(
  text,
  uuid,
  text,
  integer,
  integer
)
from public;

grant execute
on function public.admin_search_product_ids(
  text,
  uuid,
  text,
  integer,
  integer
)
to authenticated;

analyze public.product_categories;

commit;
