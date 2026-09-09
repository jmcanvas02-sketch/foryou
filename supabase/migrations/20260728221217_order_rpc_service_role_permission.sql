begin;

-- Cloudflare order intake gọi Data API bằng SUPABASE_SERVER_KEY,
-- nên PostgreSQL thực thi RPC dưới role service_role.
-- Hai overload hiện chỉ được grant cho anon/authenticated.

do $$
begin
  if to_regprocedure(
    'public.create_store_order_idempotent(uuid,jsonb,jsonb,text,jsonb)'
  ) is null then
    raise exception
      'Thiếu overload create_store_order_idempotent 5 tham số.';
  end if;

  if to_regprocedure(
    'public.create_store_order_idempotent(uuid,jsonb,jsonb,text)'
  ) is null then
    raise exception
      'Thiếu overload create_store_order_idempotent 4 tham số.';
  end if;
end;
$$;

grant execute on function
public.create_store_order_idempotent(
  uuid, jsonb, jsonb, text, jsonb
)
to service_role;

grant execute on function
public.create_store_order_idempotent(
  uuid, jsonb, jsonb, text
)
to service_role;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.create_store_order_idempotent(uuid,jsonb,jsonb,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'service_role chưa có EXECUTE trên overload 5 tham số.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.create_store_order_idempotent(uuid,jsonb,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception
      'service_role chưa có EXECUTE trên overload 4 tham số.';
  end if;
end;
$$;

commit;
