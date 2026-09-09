begin;

alter table public.store_settings
  add column if not exists logo_url text,
  add column if not exists logo_public_id text;

alter table public.store_settings
  drop constraint if exists store_settings_logo_url_length,
  drop constraint if exists store_settings_logo_public_id_length;

alter table public.store_settings
  add constraint store_settings_logo_url_length
    check (
      logo_url is null
      or char_length(logo_url) <= 2048
    ),
  add constraint store_settings_logo_public_id_length
    check (
      logo_public_id is null
      or char_length(logo_public_id) <= 512
    );

comment on column public.store_settings.logo_url is
  'Public website logo URL managed from the admin settings page.';

comment on column public.store_settings.logo_public_id is
  'Cloudinary public id of the website logo.';

commit;
