begin;

create table if not exists public.custom_option_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  color_hex text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_option_colors_name_not_blank check (btrim(name) <> ''),
  constraint custom_option_colors_image_url_not_blank check (btrim(image_url) <> ''),
  constraint custom_option_colors_color_hex_format check (
    color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create unique index if not exists custom_option_colors_name_unique_idx
  on public.custom_option_colors (lower(btrim(name)));

create index if not exists custom_option_colors_active_sort_idx
  on public.custom_option_colors (active, sort_order, created_at);

create table if not exists public.product_custom_options (
  product_id uuid primary key references public.products(id) on delete cascade,
  enabled boolean not null default false,
  text_enabled boolean not null default false,
  text_label text not null default 'Custom text',
  text_placeholder text not null default '',
  text_max_length integer not null default 30,
  text_price_delta numeric(12, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_custom_options_text_label_not_blank check (btrim(text_label) <> ''),
  constraint product_custom_options_text_max_length_range check (text_max_length between 1 and 120),
  constraint product_custom_options_text_price_delta_non_negative check (text_price_delta >= 0)
);

create index if not exists product_custom_options_enabled_idx
  on public.product_custom_options (enabled, text_enabled);

create table if not exists public.product_custom_option_colors (
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid not null references public.custom_option_colors(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, color_id)
);

create index if not exists product_custom_option_colors_product_sort_idx
  on public.product_custom_option_colors (product_id, sort_order, created_at);

alter table public.order_items
  add column if not exists custom_options jsonb not null default '{}'::jsonb;

comment on table public.custom_option_colors is 'Admin-managed color palette for custom product text. Colors are free and do not carry price deltas.';
comment on table public.product_custom_options is 'Per-product global custom option settings. Custom text can add a fee only when customer enters text.';
comment on table public.product_custom_option_colors is 'Per-product allow-list of free colors customers can choose for custom text.';
comment on column public.order_items.custom_options is 'Snapshot of custom text/color and custom text fee at order time.';

create or replace function public.touch_custom_product_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists custom_option_colors_touch_updated_at on public.custom_option_colors;
create trigger custom_option_colors_touch_updated_at
  before update on public.custom_option_colors
  for each row execute function public.touch_custom_product_options_updated_at();

drop trigger if exists product_custom_options_touch_updated_at on public.product_custom_options;
create trigger product_custom_options_touch_updated_at
  before update on public.product_custom_options
  for each row execute function public.touch_custom_product_options_updated_at();

alter table public.custom_option_colors enable row level security;
alter table public.product_custom_options enable row level security;
alter table public.product_custom_option_colors enable row level security;

drop policy if exists custom_option_colors_public_select_active on public.custom_option_colors;
create policy custom_option_colors_public_select_active
  on public.custom_option_colors
  for select
  to anon, authenticated
  using (active = true or public.is_admin());

drop policy if exists custom_option_colors_admin_all on public.custom_option_colors;
create policy custom_option_colors_admin_all
  on public.custom_option_colors
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists product_custom_options_public_select_enabled on public.product_custom_options;
create policy product_custom_options_public_select_enabled
  on public.product_custom_options
  for select
  to anon, authenticated
  using (enabled = true or public.is_admin());

drop policy if exists product_custom_options_admin_all on public.product_custom_options;
create policy product_custom_options_admin_all
  on public.product_custom_options
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists product_custom_option_colors_public_select_enabled on public.product_custom_option_colors;
create policy product_custom_option_colors_public_select_enabled
  on public.product_custom_option_colors
  for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.product_custom_options options
      where options.product_id = product_custom_option_colors.product_id
        and options.enabled = true
    )
  );

drop policy if exists product_custom_option_colors_admin_all on public.product_custom_option_colors;
create policy product_custom_option_colors_admin_all
  on public.product_custom_option_colors
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.custom_option_colors to anon, authenticated;
grant select on public.product_custom_options to anon, authenticated;
grant select on public.product_custom_option_colors to anon, authenticated;

grant insert, update, delete on public.custom_option_colors to authenticated;
grant insert, update, delete on public.product_custom_options to authenticated;
grant insert, update, delete on public.product_custom_option_colors to authenticated;

commit;