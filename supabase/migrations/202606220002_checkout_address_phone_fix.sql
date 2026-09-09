begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_order_code()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select
    'IGD-' ||
    to_char(clock_timestamp(), 'YYMMDDHH24MISS') ||
    '-' ||
    upper(
      substr(
        encode(extensions.gen_random_bytes(4), 'hex'),
        1,
        6
      )
    );
$$;

create or replace function public.validate_order_phone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.customer_phone := regexp_replace(
    coalesce(new.customer_phone, ''),
    '[^0-9]',
    '',
    'g'
  );

  if new.customer_phone !~ '^0(3|5|7|8|9)[0-9]{8}$' then
    raise exception
      'Số điện thoại không hợp lệ. Vui lòng nhập 10 số với đầu số 03, 05, 07, 08 hoặc 09.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_validate_phone_before_write
on public.orders;

create trigger orders_validate_phone_before_write
before insert or update of customer_phone
on public.orders
for each row
execute function public.validate_order_phone();

revoke all on function public.validate_order_phone()
from public;

grant execute on function public.generate_order_code()
to anon, authenticated;

commit;