begin;

create or replace function public.admin_can_manage_ads()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin();
$$;

create or replace function public.admin_save_ad_secret(
  p_ad_data_source_id uuid,
  p_ciphertext text,
  p_initialization_vector text,
  p_algorithm text default 'AES-GCM'
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_at timestamptz := now();
begin
  if not public.is_admin() then
    raise exception
      'Bạn không có quyền quản trị Pixel.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ad_data_sources
    where id = p_ad_data_source_id
  ) then
    raise exception
      'Không tìm thấy cấu hình Pixel.'
      using errcode = 'P0002';
  end if;

  if btrim(coalesce(p_ciphertext, '')) = '' then
    raise exception
      'Dữ liệu Access Token không hợp lệ.'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_initialization_vector, '')) = '' then
    raise exception
      'Vector mã hóa không hợp lệ.'
      using errcode = '22023';
  end if;

  if p_algorithm <> 'AES-GCM' then
    raise exception
      'Thuật toán mã hóa không được hỗ trợ.'
      using errcode = '22023';
  end if;

  insert into public.ad_data_source_secrets (
    ad_data_source_id,
    ciphertext,
    initialization_vector,
    algorithm,
    updated_at
  )
  values (
    p_ad_data_source_id,
    p_ciphertext,
    p_initialization_vector,
    p_algorithm,
    v_updated_at
  )
  on conflict (ad_data_source_id)
  do update set
    ciphertext = excluded.ciphertext,
    initialization_vector =
      excluded.initialization_vector,
    algorithm = excluded.algorithm,
    updated_at = excluded.updated_at;

  return v_updated_at;
end;
$$;

create or replace function public.admin_delete_ad_secret(
  p_ad_data_source_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception
      'Bạn không có quyền quản trị Pixel.'
      using errcode = '42501';
  end if;

  delete from public.ad_data_source_secrets
  where ad_data_source_id = p_ad_data_source_id;

  return found;
end;
$$;

revoke all
on function public.admin_can_manage_ads()
from public;

revoke all
on function public.admin_save_ad_secret(
  uuid,
  text,
  text,
  text
)
from public;

revoke all
on function public.admin_delete_ad_secret(uuid)
from public;

grant execute
on function public.admin_can_manage_ads()
to authenticated;

grant execute
on function public.admin_save_ad_secret(
  uuid,
  text,
  text,
  text
)
to authenticated;

grant execute
on function public.admin_delete_ad_secret(uuid)
to authenticated;

commit;
