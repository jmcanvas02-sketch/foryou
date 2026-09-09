begin;

alter table public.ad_event_logs
  add column if not exists request_payload jsonb;

alter table public.ad_event_logs
  add column if not exists last_attempt_at timestamptz;

create index if not exists
  ad_event_logs_source_created_idx
on public.ad_event_logs (
  ad_data_source_id,
  created_at desc
);

create or replace function public.get_public_ad_runtime_config(
  p_product_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'sources',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', source.id,
            'platform', source.platform,
            'pixelId', source.pixel_id,
            'isDefault', source.is_default,
            'testMode', source.test_mode,
            'purchaseTrigger', source.purchase_trigger,
            'browserEvents',
            coalesce(
              (
                select jsonb_agg(
                  setting.event_name
                  order by setting.event_name
                )
                from public.ad_event_settings setting
                where setting.ad_data_source_id = source.id
                  and setting.browser_enabled = true
                  and source.browser_enabled = true
              ),
              '[]'::jsonb
            ),
            'serverEvents',
            coalesce(
              (
                select jsonb_agg(
                  setting.event_name
                  order by setting.event_name
                )
                from public.ad_event_settings setting
                where setting.ad_data_source_id = source.id
                  and setting.server_enabled = true
                  and source.server_enabled = true
              ),
              '[]'::jsonb
            )
          )
          order by
            source.platform,
            source.is_default desc,
            source.created_at
        )
        from public.ad_data_sources source
        where source.is_active = true
          and (
            source.browser_enabled = true
            or source.server_enabled = true
          )
          and exists (
            select 1
            from public.ad_event_settings setting
            where setting.ad_data_source_id = source.id
              and (
                (
                  source.browser_enabled = true
                  and setting.browser_enabled = true
                )
                or (
                  source.server_enabled = true
                  and setting.server_enabled = true
                )
              )
          )
      ),
      '[]'::jsonb
    ),
    'assignments',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'productId', assignment.product_id,
            'platform', assignment.platform,
            'sourceId', assignment.ad_data_source_id
          )
          order by
            assignment.product_id,
            assignment.platform
        )
        from public.product_ad_assignments assignment
        join public.ad_data_sources source
          on source.id = assignment.ad_data_source_id
        where assignment.product_id = any(
          coalesce(p_product_ids, '{}'::uuid[])
        )
          and source.is_active = true
          and (
            source.browser_enabled = true
            or source.server_enabled = true
          )
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all
on function public.get_public_ad_runtime_config(uuid[])
from public;

grant execute
on function public.get_public_ad_runtime_config(uuid[])
to anon, authenticated;

commit;
