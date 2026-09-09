create table if not exists order_intake_requests (
  request_id text primary key,
  payload_json text not null,
  payload_hash text not null,
  status text not null default 'received'
    check (
      status in (
        'received',
        'queued',
        'processing',
        'retrying',
        'completed',
        'failed'
      )
    ),
  attempt_count integer not null default 0,
  result_json text,
  supabase_order_id text,
  order_code text,
  last_error text,
  received_at text not null,
  updated_at text not null,
  completed_at text
);

create index if not exists
order_intake_requests_status_updated_idx
on order_intake_requests (
  status,
  updated_at
);

create index if not exists
order_intake_requests_phone_idx
on order_intake_requests (
  json_extract(
    payload_json,
    '$.customer.phone'
  )
);
