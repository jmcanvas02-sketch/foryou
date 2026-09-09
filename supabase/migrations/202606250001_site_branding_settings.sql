begin;

alter table public.store_settings
  add column if not exists favicon_url text,
  add column if not exists favicon_public_id text,
  add column if not exists social_share_image_url text,
  add column if not exists social_share_image_public_id text,
  add column if not exists social_share_title text
    default 'InGiDay | Sản phẩm in 3D đáng yêu',
  add column if not exists social_share_description text
    default 'Khám phá móc khóa, mô hình mini và các sản phẩm in 3D độc đáo từ InGiDay.';

alter table public.store_settings
  alter column social_share_title
    set default 'InGiDay | Sản phẩm in 3D đáng yêu',
  alter column social_share_description
    set default 'Khám phá móc khóa, mô hình mini và các sản phẩm in 3D độc đáo từ InGiDay.';

update public.store_settings
set
  social_share_title = coalesce(
    nullif(btrim(social_share_title), ''),
    'InGiDay | Sản phẩm in 3D đáng yêu'
  ),
  social_share_description = coalesce(
    nullif(btrim(social_share_description), ''),
    'Khám phá móc khóa, mô hình mini và các sản phẩm in 3D độc đáo từ InGiDay.'
  );

alter table public.store_settings
  alter column social_share_title set not null,
  alter column social_share_description set not null;

alter table public.store_settings
  drop constraint if exists store_settings_favicon_url_length,
  drop constraint if exists store_settings_favicon_public_id_length,
  drop constraint if exists store_settings_social_image_url_length,
  drop constraint if exists store_settings_social_image_public_id_length,
  drop constraint if exists store_settings_social_title_length,
  drop constraint if exists store_settings_social_description_length;

alter table public.store_settings
  add constraint store_settings_favicon_url_length
    check (
      favicon_url is null
      or char_length(favicon_url) <= 2048
    ),
  add constraint store_settings_favicon_public_id_length
    check (
      favicon_public_id is null
      or char_length(favicon_public_id) <= 512
    ),
  add constraint store_settings_social_image_url_length
    check (
      social_share_image_url is null
      or char_length(social_share_image_url) <= 2048
    ),
  add constraint store_settings_social_image_public_id_length
    check (
      social_share_image_public_id is null
      or char_length(social_share_image_public_id) <= 512
    ),
  add constraint store_settings_social_title_length
    check (
      char_length(btrim(social_share_title))
      between 1 and 120
    ),
  add constraint store_settings_social_description_length
    check (
      char_length(btrim(social_share_description))
      between 1 and 200
    );

comment on column public.store_settings.favicon_url is
  'Public favicon URL managed from the admin settings page.';

comment on column public.store_settings.social_share_image_url is
  'Public 1200x630 social sharing image URL.';

comment on column public.store_settings.social_share_title is
  'Default Open Graph and Twitter card title.';

comment on column public.store_settings.social_share_description is
  'Default Open Graph and Twitter card description.';

commit;
