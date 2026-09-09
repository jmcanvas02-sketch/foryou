begin;

create or replace function
  public.admin_set_product_ad_assignments(
    p_product_id uuid,
    p_meta_source_id uuid default null,
    p_tiktok_source_id uuid default null
  )
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception
      'Bạn không có quyền cập nhật Pixel cho sản phẩm.';
  end if;

  if not exists (
    select 1
    from public.products
    where id = p_product_id
  ) then
    raise exception 'Không tìm thấy sản phẩm.';
  end if;

  delete from public.product_ad_assignments
  where product_id = p_product_id;

  if p_meta_source_id is not null then
    insert into public.product_ad_assignments (
      product_id,
      platform,
      ad_data_source_id
    )
    values (
      p_product_id,
      'meta',
      p_meta_source_id
    );
  end if;

  if p_tiktok_source_id is not null then
    insert into public.product_ad_assignments (
      product_id,
      platform,
      ad_data_source_id
    )
    values (
      p_product_id,
      'tiktok',
      p_tiktok_source_id
    );
  end if;
end;
$$;

revoke all
on function public.admin_set_product_ad_assignments(
  uuid,
  uuid,
  uuid
)
from public;

grant execute
on function public.admin_set_product_ad_assignments(
  uuid,
  uuid,
  uuid
)
to authenticated;

commit;
