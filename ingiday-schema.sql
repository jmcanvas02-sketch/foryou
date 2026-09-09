-- InGiDay - Supabase schema
-- Chạy toàn bộ file trong Supabase SQL Editor.
-- Không đặt secret key hoặc service_role key trong file này.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- HÀM DÙNG CHUNG
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_order_code()
returns text
language sql
volatile
as $$
  select
    'IGD-' ||
    to_char(clock_timestamp(), 'YYMMDDHH24MISS') ||
    '-' ||
    upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
$$;

-- =========================================================
-- QUẢN TRỊ VIÊN
-- =========================================================

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'admin'
    check (role in ('admin', 'super_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_profiles_email_lower_uidx
  on public.admin_profiles (lower(email));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.id = auth.uid()
      and ap.active = true
      and ap.role in ('admin', 'super_admin')
  );
$$;

-- =========================================================
-- DANH MỤC
-- =========================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  image_url text,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_slug_lower_uidx
  on public.categories (lower(slug));

-- =========================================================
-- SẢN PHẨM
-- =========================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete restrict,
  name text not null,
  slug text not null,
  sku text,
  short_description text,
  description text,
  price numeric(12, 0) not null default 0 check (price >= 0),
  compare_at_price numeric(12, 0)
    check (compare_at_price is null or compare_at_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  track_inventory boolean not null default true,
  low_stock_threshold integer not null default 5
    check (low_stock_threshold >= 0),
  has_variants boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'hidden', 'out_of_stock')),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_slug_lower_uidx
  on public.products (lower(slug));

create unique index if not exists products_sku_lower_uidx
  on public.products (lower(sku))
  where sku is not null and btrim(sku) <> '';

create index if not exists products_category_id_idx
  on public.products (category_id);

create index if not exists products_status_idx
  on public.products (status);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  public_id text,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx
  on public.product_images (product_id);

create unique index if not exists product_images_one_primary_uidx
  on public.product_images (product_id)
  where is_primary = true;

-- =========================================================
-- BIẾN THỂ
-- =========================================================

create table if not exists public.product_variant_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_variant_groups_product_id_idx
  on public.product_variant_groups (product_id);

create table if not exists public.product_variant_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_variant_groups(id) on delete cascade,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, value)
);

create index if not exists product_variant_values_group_id_idx
  on public.product_variant_values (group_id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  option_signature text not null,
  price numeric(12, 0)
    check (price is null or price >= 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_signature)
);

create unique index if not exists product_variants_sku_lower_uidx
  on public.product_variants (lower(sku))
  where sku is not null and btrim(sku) <> '';

create index if not exists product_variants_product_id_idx
  on public.product_variants (product_id);

create table if not exists public.product_variant_value_links (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  value_id uuid not null references public.product_variant_values(id) on delete cascade,
  primary key (variant_id, value_id)
);

-- =========================================================
-- MÃ GIẢM GIÁ
-- =========================================================

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null
    check (discount_type in ('fixed', 'percent')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  minimum_order_value numeric(12, 0) not null default 0
    check (minimum_order_value >= 0),
  maximum_discount numeric(12, 0)
    check (maximum_discount is null or maximum_discount >= 0),
  usage_limit integer
    check (usage_limit is null or usage_limit >= 0),
  usage_limit_per_customer integer
    check (usage_limit_per_customer is null or usage_limit_per_customer >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index if not exists coupons_code_lower_uidx
  on public.coupons (lower(code));

-- =========================================================
-- ĐƠN HÀNG
-- =========================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null default public.generate_order_code(),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  province text not null,
  district text not null,
  ward text not null,
  address_line text not null,
  note text,
  subtotal numeric(12, 0) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12, 0) not null default 0 check (discount_amount >= 0),
  shipping_fee numeric(12, 0) not null default 15000 check (shipping_fee >= 0),
  total_amount numeric(12, 0) not null default 0 check (total_amount >= 0),
  coupon_code text,
  payment_method text not null default 'cod'
    check (payment_method in ('cod')),
  status text not null default 'new'
    check (
      status in (
        'new',
        'confirmed',
        'preparing',
        'shipping',
        'completed',
        'cancelled'
      )
    ),
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orders_order_code_uidx
  on public.orders (order_code);

create index if not exists orders_customer_phone_idx
  on public.orders (customer_phone);

create index if not exists orders_status_idx
  on public.orders (status);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  product_sku text,
  variant_name text,
  product_image_url text,
  unit_price numeric(12, 0) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 0) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_phone text not null,
  used_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);

create index if not exists coupon_usages_customer_phone_idx
  on public.coupon_usages (customer_phone);

-- =========================================================
-- BANNER
-- =========================================================

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  internal_title text not null,
  image_desktop_url text not null,
  image_mobile_url text,
  link_url text,
  position text not null default 'home_hero',
  sort_order integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists banners_position_sort_idx
  on public.banners (position, sort_order);

-- =========================================================
-- CÀI ĐẶT CỬA HÀNG
-- =========================================================

create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  shop_name text not null default 'InGiDay',
  logo_url text,
  favicon_url text,
  phone text,
  email text,
  address text,
  messenger_url text,
  footer_text text,
  shipping_fee numeric(12, 0) not null default 15000
    check (shipping_fee >= 0),
  free_shipping_threshold numeric(12, 0) not null default 200000
    check (free_shipping_threshold >= 0),
  currency text not null default 'VND',
  enable_coupons boolean not null default true,
  enable_inventory boolean not null default true,
  custom_print_title text not null default 'In 3D theo yêu cầu',
  custom_print_description text not null default
    'Bạn có ý tưởng, hình ảnh hoặc mẫu sản phẩm muốn làm riêng? Gửi yêu cầu qua Messenger để shop tư vấn trực tiếp.',
  custom_print_button_text text not null default
    'Va ngay với chủ shop để yêu cầu',
  custom_print_step_1_title text not null default 'Gửi ý tưởng',
  custom_print_step_1_description text not null default
    'Gửi hình ảnh, mô tả hoặc kích thước mong muốn qua Messenger.',
  custom_print_step_2_title text not null default 'Shop tư vấn',
  custom_print_step_2_description text not null default
    'Shop trao đổi về mẫu, màu sắc, kích thước, giá và thời gian hoàn thiện.',
  custom_print_step_3_title text not null default 'Xác nhận và in',
  custom_print_step_3_description text not null default
    'Sau khi chốt yêu cầu, shop tiến hành in và cập nhật tiến độ cho bạn.',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

-- =========================================================
-- VIEW TỔNG HỢP KHÁCH HÀNG
-- =========================================================

create or replace view public.customer_summary
with (security_invoker = true)
as
select
  customer_phone,
  max(customer_name) as customer_name,
  max(customer_email) as customer_email,
  count(*)::integer as total_orders,
  count(*) filter (where status = 'completed')::integer as completed_orders,
  count(*) filter (where status = 'cancelled')::integer as cancelled_orders,
  coalesce(
    sum(total_amount) filter (where status = 'completed'),
    0
  )::numeric(12, 0) as completed_revenue,
  max(created_at) as last_order_at
from public.orders
group by customer_phone;

-- =========================================================
-- TRIGGER UPDATED_AT
-- =========================================================

drop trigger if exists trg_admin_profiles_updated_at on public.admin_profiles;
create trigger trg_admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
before update on public.coupons
for each row execute function public.set_updated_at();

drop trigger if exists trg_banners_updated_at on public.banners;
create trigger trg_banners_updated_at
before update on public.banners
for each row execute function public.set_updated_at();

drop trigger if exists trg_store_settings_updated_at on public.store_settings;
create trigger trg_store_settings_updated_at
before update on public.store_settings
for each row execute function public.set_updated_at();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.admin_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variant_groups enable row level security;
alter table public.product_variant_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_value_links enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.coupon_usages enable row level security;
alter table public.banners enable row level security;
alter table public.store_settings enable row level security;

-- Admin profile: người dùng xem hồ sơ của chính mình; admin quản lý toàn bộ.
drop policy if exists admin_profiles_select_self on public.admin_profiles;
create policy admin_profiles_select_self
on public.admin_profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists admin_profiles_admin_all on public.admin_profiles;
create policy admin_profiles_admin_all
on public.admin_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Danh mục công khai.
drop policy if exists categories_public_select on public.categories;
create policy categories_public_select
on public.categories
for select
to anon, authenticated
using (active = true);

drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all
on public.categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Sản phẩm công khai.
drop policy if exists products_public_select on public.products;
create policy products_public_select
on public.products
for select
to anon, authenticated
using (status = 'active');

drop policy if exists products_admin_all on public.products;
create policy products_admin_all
on public.products
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Ảnh sản phẩm công khai khi sản phẩm đang hoạt động.
drop policy if exists product_images_public_select on public.product_images;
create policy product_images_public_select
on public.product_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and p.status = 'active'
  )
);

drop policy if exists product_images_admin_all on public.product_images;
create policy product_images_admin_all
on public.product_images
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Nhóm biến thể.
drop policy if exists variant_groups_public_select on public.product_variant_groups;
create policy variant_groups_public_select
on public.product_variant_groups
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_variant_groups.product_id
      and p.status = 'active'
  )
);

drop policy if exists variant_groups_admin_all on public.product_variant_groups;
create policy variant_groups_admin_all
on public.product_variant_groups
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Giá trị biến thể.
drop policy if exists variant_values_public_select on public.product_variant_values;
create policy variant_values_public_select
on public.product_variant_values
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.product_variant_groups g
    join public.products p on p.id = g.product_id
    where g.id = product_variant_values.group_id
      and p.status = 'active'
  )
);

drop policy if exists variant_values_admin_all on public.product_variant_values;
create policy variant_values_admin_all
on public.product_variant_values
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Tổ hợp biến thể.
drop policy if exists product_variants_public_select on public.product_variants;
create policy product_variants_public_select
on public.product_variants
for select
to anon, authenticated
using (
  active = true
  and exists (
    select 1
    from public.products p
    where p.id = product_variants.product_id
      and p.status = 'active'
  )
);

drop policy if exists product_variants_admin_all on public.product_variants;
create policy product_variants_admin_all
on public.product_variants
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Liên kết giá trị biến thể.
drop policy if exists variant_value_links_public_select on public.product_variant_value_links;
create policy variant_value_links_public_select
on public.product_variant_value_links
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = product_variant_value_links.variant_id
      and v.active = true
      and p.status = 'active'
  )
);

drop policy if exists variant_value_links_admin_all on public.product_variant_value_links;
create policy variant_value_links_admin_all
on public.product_variant_value_links
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Mã giảm giá chỉ quản trị viên đọc và chỉnh sửa trực tiếp.
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all
on public.coupons
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Đơn hàng chỉ quản trị viên đọc và chỉnh sửa trực tiếp.
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all
on public.orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all
on public.order_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists order_status_history_admin_all on public.order_status_history;
create policy order_status_history_admin_all
on public.order_status_history
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists coupon_usages_admin_all on public.coupon_usages;
create policy coupon_usages_admin_all
on public.coupon_usages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Banner công khai theo trạng thái và thời gian.
drop policy if exists banners_public_select on public.banners;
create policy banners_public_select
on public.banners
for select
to anon, authenticated
using (
  active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

drop policy if exists banners_admin_all on public.banners;
create policy banners_admin_all
on public.banners
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Cài đặt cửa hàng được đọc công khai, chỉ admin được sửa.
drop policy if exists store_settings_public_select on public.store_settings;
create policy store_settings_public_select
on public.store_settings
for select
to anon, authenticated
using (true);

drop policy if exists store_settings_admin_update on public.store_settings;
create policy store_settings_admin_update
on public.store_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =========================================================
-- QUYỀN DATA API
-- =========================================================

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on
  public.categories,
  public.products,
  public.product_images,
  public.product_variant_groups,
  public.product_variant_values,
  public.product_variants,
  public.product_variant_value_links,
  public.banners,
  public.store_settings
to anon;

grant select, insert, update, delete on all tables in schema public
to authenticated;

grant select on public.customer_summary to authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.generate_order_code() from public;
grant execute on function public.generate_order_code() to authenticated;

commit;
