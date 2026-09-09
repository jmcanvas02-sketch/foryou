begin;

create extension if not exists unaccent
with schema extensions;

create extension if not exists pg_trgm
with schema extensions;

create or replace function public.catalog_normalize(
  input_text text
)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select lower(
    extensions.unaccent(
      'extensions.unaccent'::regdictionary,
      coalesce(input_text, '')
    )
  );
$$;

alter table public.products
  add column if not exists search_text text
  not null default '';

create or replace function
public.refresh_product_search_text()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.search_text := public.catalog_normalize(
    coalesce(new.name, '') || ' ' ||
    coalesce(new.description, '')
  );

  return new;
end;
$$;

drop trigger if exists
products_refresh_search_text
on public.products;

create trigger products_refresh_search_text
before insert or update of name, description
on public.products
for each row
execute function
public.refresh_product_search_text();

update public.products
set search_text = public.catalog_normalize(
  coalesce(name, '') || ' ' ||
  coalesce(description, '')
)
where search_text = '';

create index if not exists
products_search_text_trgm_idx
on public.products
using gin (search_text gin_trgm_ops);

create index if not exists
products_public_catalog_idx
on public.products (
  status,
  category_id,
  price,
  created_at desc
);

create index if not exists
products_featured_public_idx
on public.products (
  is_featured,
  created_at desc
)
where status in ('active', 'out_of_stock');

create index if not exists
product_images_catalog_idx
on public.product_images (
  product_id,
  is_primary desc,
  sort_order asc
);

create index if not exists
orders_completed_catalog_idx
on public.orders (
  status,
  id
)
where status = 'completed';

create index if not exists
order_items_product_catalog_idx
on public.order_items (product_id);

create or replace function
public.search_catalog_products(
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
      primary_image.public_id
        as image_public_id,
      primary_image.alt_text
        as image_alt_text,
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
          public.catalog_normalize(
            categories.name
          ),
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
    where
      products.status in (
        'active',
        'out_of_stock'
      )
      and (
        products.category_id = p_category_id
        or p_category_id is null
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
        or products.search_text like
          '%' || normalized.query_text || '%'
        or public.catalog_normalize(
          categories.name
        ) like
          '%' || normalized.query_text || '%'
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

revoke all on function
public.search_catalog_products(
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

grant execute on function
public.search_catalog_products(
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

analyze public.products;
analyze public.product_images;
analyze public.order_items;

commit;