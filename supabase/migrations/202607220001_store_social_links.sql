begin;

alter table public.store_settings
  add column if not exists social_links jsonb
    not null default '{}'::jsonb;

update public.store_settings
set social_links = '{}'::jsonb
where social_links is null
   or jsonb_typeof(social_links) <> 'object';

alter table public.store_settings
  drop constraint if exists store_settings_social_links_object,
  drop constraint if exists store_settings_social_links_size;

alter table public.store_settings
  add constraint store_settings_social_links_object
    check (jsonb_typeof(social_links) = 'object'),
  add constraint store_settings_social_links_size
    check (octet_length(social_links::text) <= 12000);

comment on column public.store_settings.social_links is
  'Public social links configured by admins. Supported app keys: facebook, tiktok, instagram, youtube, zalo.';

commit;
