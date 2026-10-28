create table if not exists public.whatsapp_linked_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.aeroshell_profiles(id) on delete cascade,
  device_key uuid not null,
  device_name text not null default 'Browser',
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_key)
);
alter table public.whatsapp_linked_devices enable row level security;
revoke all on table public.whatsapp_linked_devices from public, anon;
grant select, insert, update, delete on table public.whatsapp_linked_devices to authenticated;
drop policy if exists whatsapp_linked_devices_select_own on public.whatsapp_linked_devices;
drop policy if exists whatsapp_linked_devices_insert_own on public.whatsapp_linked_devices;
drop policy if exists whatsapp_linked_devices_update_own on public.whatsapp_linked_devices;
drop policy if exists whatsapp_linked_devices_delete_own on public.whatsapp_linked_devices;
create policy whatsapp_linked_devices_select_own on public.whatsapp_linked_devices for select to authenticated using (auth.uid() = user_id);
create policy whatsapp_linked_devices_insert_own on public.whatsapp_linked_devices for insert to authenticated with check (auth.uid() = user_id);
create policy whatsapp_linked_devices_update_own on public.whatsapp_linked_devices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy whatsapp_linked_devices_delete_own on public.whatsapp_linked_devices for delete to authenticated using (auth.uid() = user_id);
