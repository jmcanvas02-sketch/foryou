begin;

-- Cloudflare Functions uses SUPABASE_SERVER_KEY to read ad configuration,
-- read orders, and write server-side ad event delivery status.
grant usage
on schema public
to service_role;

grant select, update
on table public.ad_data_sources
to service_role;

grant select
on table public.ad_data_source_secrets
to service_role;

grant select
on table public.ad_event_settings
to service_role;

grant select
on table public.product_ad_assignments
to service_role;

grant select, insert, update
on table public.ad_event_logs
to service_role;

grant select
on table public.orders
to service_role;

grant select
on table public.order_items
to service_role;

commit;
