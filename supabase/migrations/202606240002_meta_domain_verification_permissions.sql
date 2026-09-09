begin;

grant select, update
on table public.store_settings
to service_role;

commit;
