begin;

comment on column public.orders.utm_attribution is
'Last non-direct-touch campaign attribution captured by the storefront at checkout, including standard UTM and Meta URL parameters.';

create or replace function
public.normalize_order_utm_attribution(
  p_value jsonb
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_value is null
      or jsonb_typeof(p_value) <> 'object'
      then '{}'::jsonb
    else jsonb_strip_nulls(
      jsonb_build_object(
        'source',
          nullif(left(btrim(coalesce(p_value ->> 'source', '')), 200), ''),
        'medium',
          nullif(left(btrim(coalesce(p_value ->> 'medium', '')), 200), ''),
        'campaign',
          nullif(left(btrim(coalesce(p_value ->> 'campaign', '')), 200), ''),
        'content',
          nullif(left(btrim(coalesce(p_value ->> 'content', '')), 200), ''),
        'term',
          nullif(left(btrim(coalesce(p_value ->> 'term', '')), 200), ''),
        'utmId',
          nullif(left(btrim(coalesce(p_value ->> 'utmId', '')), 200), ''),
        'campaignId',
          nullif(left(btrim(coalesce(p_value ->> 'campaignId', '')), 200), ''),
        'adsetId',
          nullif(left(btrim(coalesce(p_value ->> 'adsetId', '')), 200), ''),
        'adId',
          nullif(left(btrim(coalesce(p_value ->> 'adId', '')), 200), ''),
        'campaignName',
          nullif(left(btrim(coalesce(p_value ->> 'campaignName', '')), 200), ''),
        'adsetName',
          nullif(left(btrim(coalesce(p_value ->> 'adsetName', '')), 200), ''),
        'adName',
          nullif(left(btrim(coalesce(p_value ->> 'adName', '')), 200), ''),
        'placement',
          nullif(left(btrim(coalesce(p_value ->> 'placement', '')), 200), ''),
        'siteSourceName',
          nullif(left(btrim(coalesce(p_value ->> 'siteSourceName', '')), 200), ''),
        'fbclid',
          nullif(left(btrim(coalesce(p_value ->> 'fbclid', '')), 500), ''),
        'capturedAt',
          nullif(left(btrim(coalesce(p_value ->> 'capturedAt', '')), 64), '')
      )
    )
  end;
$$;

revoke all on function
public.normalize_order_utm_attribution(jsonb)
from public;

commit;