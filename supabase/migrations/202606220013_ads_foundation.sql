begin;

create extension if not exists pgcrypto;

create table if not exists public.ad_data_sources (
  id uuid primary key default gen_random_uuid(),
  platform text not null
    check (platform in ('meta', 'tiktok')),
  name text not null,
  pixel_id text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  browser_enabled boolean not null default true,
  server_enabled boolean not null default true,
  test_mode boolean not null default true,
  test_event_code text not null default '',
  api_version text not null default '',
  purchase_trigger text not null default 'order_created'
    check (
      purchase_trigger in (
        'order_created',
        'order_confirmed',
        'order_completed'
      )
    ),
  last_tested_at timestamptz,
  last_test_status text
    check (
      last_test_status is null
      or last_test_status in (
        'success',
        'failed'
      )
    ),
  last_test_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (btrim(pixel_id) <> '')
);

create unique index if not exists
  ad_data_sources_platform_pixel_id_unique_idx
on public.ad_data_sources (
  platform,
  pixel_id
);

create unique index if not exists
  ad_data_sources_one_default_per_platform_idx
on public.ad_data_sources (platform)
where is_default = true;

create index if not exists
  ad_data_sources_active_platform_idx
on public.ad_data_sources (
  platform,
  is_active
);

drop trigger if exists
  trg_ad_data_sources_updated_at
on public.ad_data_sources;

create trigger trg_ad_data_sources_updated_at
before update on public.ad_data_sources
for each row
execute function public.set_updated_at();

create or replace function
  public.normalize_ad_data_source_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.name := btrim(new.name);
  new.pixel_id := btrim(new.pixel_id);
  new.test_event_code :=
    btrim(coalesce(new.test_event_code, ''));
  new.api_version :=
    btrim(coalesce(new.api_version, ''));
  new.last_test_message :=
    coalesce(new.last_test_message, '');

  if not new.is_active then
    new.is_default := false;
  end if;

  if new.is_default then
    update public.ad_data_sources
    set is_default = false
    where platform = new.platform
      and id <> new.id
      and is_default = true;
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_ad_data_sources_normalize_default
on public.ad_data_sources;

create trigger
  trg_ad_data_sources_normalize_default
before insert or update on public.ad_data_sources
for each row
execute function
  public.normalize_ad_data_source_default();

create table if not exists
  public.ad_data_source_secrets (
    ad_data_source_id uuid primary key
      references public.ad_data_sources(id)
      on delete cascade,
    ciphertext text not null,
    initialization_vector text not null,
    algorithm text not null default 'AES-GCM'
      check (algorithm = 'AES-GCM'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (btrim(ciphertext) <> ''),
    check (btrim(initialization_vector) <> '')
  );

drop trigger if exists
  trg_ad_data_source_secrets_updated_at
on public.ad_data_source_secrets;

create trigger
  trg_ad_data_source_secrets_updated_at
before update on public.ad_data_source_secrets
for each row
execute function public.set_updated_at();

create table if not exists
  public.ad_event_settings (
    id uuid primary key default gen_random_uuid(),
    ad_data_source_id uuid not null
      references public.ad_data_sources(id)
      on delete cascade,
    event_name text not null
      check (
        event_name in (
          'PageView',
          'ViewContent',
          'Search',
          'AddToCart',
          'InitiateCheckout',
          'Purchase'
        )
      ),
    browser_enabled boolean not null default true,
    server_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (
      ad_data_source_id,
      event_name
    )
  );

create index if not exists
  ad_event_settings_source_idx
on public.ad_event_settings (
  ad_data_source_id
);

drop trigger if exists
  trg_ad_event_settings_updated_at
on public.ad_event_settings;

create trigger trg_ad_event_settings_updated_at
before update on public.ad_event_settings
for each row
execute function public.set_updated_at();

create or replace function
  public.seed_ad_event_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.ad_event_settings (
    ad_data_source_id,
    event_name,
    browser_enabled,
    server_enabled
  )
  values
    (new.id, 'PageView', true, false),
    (new.id, 'ViewContent', true, true),
    (new.id, 'Search', true, false),
    (new.id, 'AddToCart', true, true),
    (
      new.id,
      'InitiateCheckout',
      true,
      true
    ),
    (new.id, 'Purchase', true, true)
  on conflict (
    ad_data_source_id,
    event_name
  ) do nothing;

  return new;
end;
$$;

drop trigger if exists
  trg_ad_data_sources_seed_events
on public.ad_data_sources;

create trigger trg_ad_data_sources_seed_events
after insert on public.ad_data_sources
for each row
execute function public.seed_ad_event_settings();

create table if not exists
  public.product_ad_assignments (
    product_id uuid not null
      references public.products(id)
      on delete cascade,
    platform text not null
      check (platform in ('meta', 'tiktok')),
    ad_data_source_id uuid not null
      references public.ad_data_sources(id)
      on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (
      product_id,
      platform
    )
  );

create index if not exists
  product_ad_assignments_source_idx
on public.product_ad_assignments (
  ad_data_source_id
);

drop trigger if exists
  trg_product_ad_assignments_updated_at
on public.product_ad_assignments;

create trigger
  trg_product_ad_assignments_updated_at
before update on public.product_ad_assignments
for each row
execute function public.set_updated_at();

create or replace function
  public.validate_product_ad_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_platform text;
begin
  select source.platform
  into source_platform
  from public.ad_data_sources source
  where source.id = new.ad_data_source_id;

  if source_platform is null then
    raise exception
      'Không tìm thấy Pixel đã chọn.';
  end if;

  if source_platform <> new.platform then
    raise exception
      'Nền tảng Pixel không khớp với cấu hình sản phẩm.';
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_product_ad_assignments_validate
on public.product_ad_assignments;

create trigger
  trg_product_ad_assignments_validate
before insert or update
on public.product_ad_assignments
for each row
execute function
  public.validate_product_ad_assignment();

create table if not exists
  public.ad_event_logs (
    id uuid primary key default gen_random_uuid(),
    ad_data_source_id uuid
      references public.ad_data_sources(id)
      on delete set null,
    platform text not null
      check (platform in ('meta', 'tiktok')),
    event_name text not null,
    event_id text not null,
    channel text not null
      check (channel in ('browser', 'server')),
    status text not null
      check (
        status in (
          'pending',
          'success',
          'failed',
          'ignored'
        )
      ),
    product_id uuid
      references public.products(id)
      on delete set null,
    order_id uuid
      references public.orders(id)
      on delete set null,
    error_code text not null default '',
    error_message text not null default '',
    response_summary jsonb,
    attempt_count integer not null default 0
      check (attempt_count >= 0),
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    unique (
      ad_data_source_id,
      event_name,
      event_id,
      channel
    )
  );

create index if not exists
  ad_event_logs_created_at_idx
on public.ad_event_logs (
  created_at desc
);

create index if not exists
  ad_event_logs_status_idx
on public.ad_event_logs (
  status,
  created_at desc
);

create index if not exists
  ad_event_logs_order_idx
on public.ad_event_logs (
  order_id
)
where order_id is not null;

create or replace function
  public.admin_get_ad_secret_status()
returns table (
  ad_data_source_id uuid,
  token_configured boolean,
  token_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception
      'Bạn không có quyền xem trạng thái token.';
  end if;

  return query
  select
    source.id,
    secret.ad_data_source_id is not null,
    secret.updated_at
  from public.ad_data_sources source
  left join public.ad_data_source_secrets secret
    on secret.ad_data_source_id = source.id
  order by
    source.platform,
    source.created_at;
end;
$$;

alter table public.ad_data_sources
  enable row level security;

alter table public.ad_data_source_secrets
  enable row level security;

alter table public.ad_event_settings
  enable row level security;

alter table public.product_ad_assignments
  enable row level security;

alter table public.ad_event_logs
  enable row level security;

drop policy if exists
  ad_data_sources_admin_all
on public.ad_data_sources;

create policy ad_data_sources_admin_all
on public.ad_data_sources
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists
  ad_event_settings_admin_all
on public.ad_event_settings;

create policy ad_event_settings_admin_all
on public.ad_event_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists
  product_ad_assignments_admin_all
on public.product_ad_assignments;

create policy product_ad_assignments_admin_all
on public.product_ad_assignments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists
  ad_event_logs_admin_select
on public.ad_event_logs;

create policy ad_event_logs_admin_select
on public.ad_event_logs
for select
to authenticated
using (public.is_admin());

revoke all
on table public.ad_data_source_secrets
from anon, authenticated;

grant select, insert, update, delete
on table public.ad_data_sources
to authenticated;

grant select, insert, update, delete
on table public.ad_event_settings
to authenticated;

grant select, insert, update, delete
on table public.product_ad_assignments
to authenticated;

grant select
on table public.ad_event_logs
to authenticated;

revoke all
on function public.admin_get_ad_secret_status()
from public;

grant execute
on function public.admin_get_ad_secret_status()
to authenticated;

commit;
