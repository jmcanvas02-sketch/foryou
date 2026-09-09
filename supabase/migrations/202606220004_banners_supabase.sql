begin;

alter table public.banners
  add column if not exists badge text not null default '',
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists primary_label text not null default '',
  add column if not exists primary_link text not null default '/san-pham',
  add column if not exists secondary_label text not null default '',
  add column if not exists secondary_link text not null default '/in-rieng',
  add column if not exists emoji text not null default '🐲',
  add column if not exists background text not null default
    'linear-gradient(135deg, #d9eaff 0%, #edf4ff 55%, #ffe1ef 100%)',
  add column if not exists image_public_id text,
  add column if not exists image_alt text;

alter table public.banners
  alter column image_desktop_url set default '';

update public.banners
set
  title = case
    when btrim(title) = '' then internal_title
    else title
  end,
  primary_label = case
    when btrim(primary_label) = '' then 'Khám phá ngay →'
    else primary_label
  end,
  secondary_label = case
    when btrim(secondary_label) = '' then 'Yêu cầu in riêng'
    else secondary_label
  end
where
  btrim(title) = ''
  or btrim(primary_label) = ''
  or btrim(secondary_label) = '';

commit;