-- Durable LINE shipping notification claims. One outbox row exists per order/notification type.
create table if not exists public.order_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade check (char_length(order_id) between 1 and 120),
  notification_type text not null default 'shipped' check (notification_type = 'shipped'),
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed', 'uncertain', 'skipped')),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  claimed_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  uncertain_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, notification_type)
);

alter table public.order_notification_outbox enable row level security;
revoke all on table public.order_notification_outbox from anon, authenticated, public;
revoke all on table public.order_notification_outbox from service_role;
grant select, insert, update, delete on table public.order_notification_outbox to service_role;

comment on table public.order_notification_outbox is
  'Backend-only durable delivery claims for customer notifications, starting with shipped LINE messages.';
