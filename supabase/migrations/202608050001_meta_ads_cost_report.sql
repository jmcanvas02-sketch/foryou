begin;

create table if not exists public.meta_ads_report_connections (
  singleton_key text primary key default 'primary'
    check (singleton_key = 'primary'),
  ciphertext text not null,
  initialization_vector text not null,
  algorithm text not null default 'AES-GCM'
    check (algorithm = 'AES-GCM'),
  token_last_four text not null default '',
  token_status text not null default 'connected'
    check (token_status in ('connected', 'error')),
  last_verified_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(ciphertext) <> ''),
  check (btrim(initialization_vector) <> ''),
  check (char_length(token_last_four) <= 4)
);

drop trigger if exists
  trg_meta_ads_report_connections_updated_at
on public.meta_ads_report_connections;

create trigger trg_meta_ads_report_connections_updated_at
before update on public.meta_ads_report_connections
for each row
execute function public.set_updated_at();

create table if not exists public.meta_ads_report_accounts (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null unique,
  account_name text not null,
  currency text not null default 'VND',
  timezone_name text not null default 'Asia/Ho_Chi_Minh',
  account_status integer,
  is_enabled boolean not null default true,
  last_verified_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ad_account_id ~ '^act_[0-9]{5,30}$'),
  check (btrim(account_name) <> ''),
  check (btrim(currency) <> ''),
  check (btrim(timezone_name) <> '')
);

create index if not exists
  meta_ads_report_accounts_enabled_idx
on public.meta_ads_report_accounts (
  is_enabled,
  created_at
);

drop trigger if exists
  trg_meta_ads_report_accounts_updated_at
on public.meta_ads_report_accounts;

create trigger trg_meta_ads_report_accounts_updated_at
before update on public.meta_ads_report_accounts
for each row
execute function public.set_updated_at();

alter table public.meta_ads_report_connections enable row level security;
alter table public.meta_ads_report_accounts enable row level security;

revoke all on table public.meta_ads_report_connections
  from anon, authenticated;
revoke all on table public.meta_ads_report_accounts
  from anon, authenticated;

grant select, insert, update, delete
  on table public.meta_ads_report_connections
  to service_role;
grant select, insert, update, delete
  on table public.meta_ads_report_accounts
  to service_role;

comment on table public.meta_ads_report_connections is
  'Server-only encrypted Meta token used by the admin Ads cost report.';
comment on table public.meta_ads_report_accounts is
  'Server-only list of Meta ad accounts included in the admin Ads cost report.';

commit;
