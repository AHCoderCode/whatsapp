create table if not exists public.whatsapp_push_diagnostics (
  probe_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_sent boolean not null default false,
  provider_sent_at timestamptz,
  push_event_received_at timestamptz,
  notification_api_resolved_at timestamptz,
  notification_error text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_push_diagnostics enable row level security;
revoke all on table public.whatsapp_push_diagnostics from anon, authenticated;
grant all on table public.whatsapp_push_diagnostics to service_role;

create index if not exists whatsapp_push_diagnostics_created_at_idx
  on public.whatsapp_push_diagnostics (created_at desc);
