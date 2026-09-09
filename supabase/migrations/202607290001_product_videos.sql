begin;

create table if not exists public.product_videos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products(id)
    on delete cascade,
  video_url text not null,
  public_id text,
  poster_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  duration_seconds numeric(8, 3) not null,
  width integer not null,
  height integer not null,
  bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_videos_video_url_not_blank
    check (btrim(video_url) <> ''),
  constraint product_videos_poster_url_not_blank
    check (btrim(poster_url) <> ''),
  constraint product_videos_public_id_not_blank
    check (public_id is null or btrim(public_id) <> ''),
  constraint product_videos_sort_order_nonnegative
    check (sort_order >= 0),
  constraint product_videos_duration_valid
    check (
      duration_seconds > 0
      and duration_seconds <= 60
    ),
  constraint product_videos_width_positive
    check (width > 0),
  constraint product_videos_height_positive
    check (height > 0),
  constraint product_videos_bytes_positive
    check (bytes > 0)
);

create index if not exists
product_videos_product_sort_idx
on public.product_videos (
  product_id,
  sort_order,
  created_at,
  id
);

drop trigger if exists
trg_product_videos_updated_at
on public.product_videos;

create trigger trg_product_videos_updated_at
before update on public.product_videos
for each row
execute function public.set_updated_at();

alter table public.product_videos
enable row level security;

drop policy if exists
product_videos_public_select
on public.product_videos;

create policy product_videos_public_select
on public.product_videos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_videos.product_id
      and p.status = 'active'
  )
);

drop policy if exists
product_videos_admin_all
on public.product_videos;

create policy product_videos_admin_all
on public.product_videos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select
on public.product_videos
to anon;

grant select, insert, update, delete
on public.product_videos
to authenticated;

comment on table public.product_videos is
  'Multiple Cloudinary videos attached to a product. Product images remain unchanged.';

comment on column public.product_videos.video_url is
  'Cloudinary delivery URL for the video resource.';

comment on column public.product_videos.poster_url is
  'Lightweight poster image shown before or instead of loading the video.';

comment on column public.product_videos.sort_order is
  'Zero-based display order among the product videos. Images remain ordered separately.';

comment on column public.product_videos.duration_seconds is
  'Video duration in seconds. Product videos are limited to 60 seconds.';

commit;