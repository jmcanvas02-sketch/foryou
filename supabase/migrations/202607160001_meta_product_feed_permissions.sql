begin;

-- The Meta catalog feed runs only in Cloudflare Pages Functions with
-- SUPABASE_SERVER_KEY. New Supabase secret keys authenticate as service_role,
-- which still requires explicit table privileges even though it bypasses RLS.
grant usage
on schema public
to service_role;

grant select
on table public.products
to service_role;

grant select
on table public.product_images
to service_role;

commit;