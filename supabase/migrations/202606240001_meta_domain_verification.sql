begin;

alter table public.store_settings
  add column if not exists meta_domain_verification_code text;

comment on column public.store_settings.meta_domain_verification_code is
  'Meta domain verification code rendered as a static meta tag in the HTML head.';

commit;
