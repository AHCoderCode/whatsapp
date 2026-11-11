create table if not exists public.whatsapp_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.aeroshell_profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint like 'https://%'),
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  messages_enabled boolean not null default true,
  groups_enabled boolean not null default true,
  calls_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_push_subscriptions enable row level security;
revoke all on table public.whatsapp_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_push_subscriptions to service_role;

create table if not exists public.whatsapp_push_config (
  id integer primary key default 1 check (id = 1),
  vapid_public_key text not null,
  vapid_private_key text not null,
  subject text not null default 'mailto:notifications@whatsapp-for.vercel.app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_push_config enable row level security;
revoke all on table public.whatsapp_push_config from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_push_config to service_role;
