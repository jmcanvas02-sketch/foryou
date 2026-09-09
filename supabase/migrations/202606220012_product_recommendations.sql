begin;

create or replace function
public.get_similar_products(
  p_product_id uuid,
  p_category_id uuid default null,
  p_limit integer default 6
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
  sold_quantity bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sales as (
    select
      items.product_id,
      coalesce(
        sum(items.quantity),
        0
      )::bigint as sold_quantity
    from public.order_items as items
    join public.orders as orders
      on orders.id = items.order_id
     and orders.status <> 'cancelled'
    where items.product_id is not null
    group by items.product_id
  )
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
    )::bigint as sold_quantity
  from public.products as products
  left join public.categories as categories
    on categories.id = products.category_id
  left join sales
    on sales.product_id = products.id
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
  where products.id <> p_product_id
    and products.status in (
      'active',
      'out_of_stock'
    )
  order by
    case
      when products.category_id
        is not distinct from p_category_id
      then 0
      else 1
    end,
    case
      when products.status = 'active'
       and products.stock > 0
      then 0
      else 1
    end,
    coalesce(
      sales.sold_quantity,
      0
    ) desc,
    products.is_featured desc,
    products.created_at desc
  limit least(
    greatest(
      coalesce(p_limit, 6),
      1
    ),
    12
  );
$$;

create or replace function
public.get_bestselling_products(
  p_exclude_product_id uuid default null,
  p_limit integer default 6
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
  sold_quantity bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sales as (
    select
      items.product_id,
      coalesce(
        sum(items.quantity),
        0
      )::bigint as sold_quantity
    from public.order_items as items
    join public.orders as orders
      on orders.id = items.order_id
     and orders.status <> 'cancelled'
    where items.product_id is not null
    group by items.product_id
  )
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
    )::bigint as sold_quantity
  from public.products as products
  left join public.categories as categories
    on categories.id = products.category_id
  left join sales
    on sales.product_id = products.id
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
  where (
      p_exclude_product_id is null
      or products.id <> p_exclude_product_id
    )
    and products.status in (
      'active',
      'out_of_stock'
    )
  order by
    coalesce(
      sales.sold_quantity,
      0
    ) desc,
    case
      when products.status = 'active'
       and products.stock > 0
      then 0
      else 1
    end,
    products.is_featured desc,
    products.created_at desc
  limit least(
    greatest(
      coalesce(p_limit, 6),
      1
    ),
    12
  );
$$;

revoke all on function
public.get_similar_products(
  uuid,
  uuid,
  integer
)
from public;

revoke all on function
public.get_bestselling_products(
  uuid,
  integer
)
from public;

grant execute on function
public.get_similar_products(
  uuid,
  uuid,
  integer
)
to anon, authenticated;

grant execute on function
public.get_bestselling_products(
  uuid,
  integer
)
to anon, authenticated;

commit;