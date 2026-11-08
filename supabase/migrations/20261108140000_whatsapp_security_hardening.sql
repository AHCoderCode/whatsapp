-- WhatsApp security hardening: recovery codes, moderation controls, shared-group blocks.
-- No end-to-end encryption is enabled by this migration.

create schema if not exists private;
grant usage on schema private to authenticated;

create table if not exists public.whatsapp_account_recovery_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  used_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz
);
alter table public.whatsapp_account_recovery_codes enable row level security;
revoke all on table public.whatsapp_account_recovery_codes from public, anon, authenticated;
grant all on table public.whatsapp_account_recovery_codes to service_role;

create table if not exists public.whatsapp_recovery_ip_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default pg_catalog.now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.whatsapp_recovery_ip_limits enable row level security;
revoke all on table public.whatsapp_recovery_ip_limits from public, anon, authenticated;
grant all on table public.whatsapp_recovery_ip_limits to service_role;

create or replace function public.whatsapp_consume_recovery_ip_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into public.whatsapp_recovery_ip_limits(ip_hash, window_started_at, attempts)
  values (p_ip_hash, pg_catalog.now(), 1)
  on conflict (ip_hash) do update
  set attempts = case
        when public.whatsapp_recovery_ip_limits.window_started_at < pg_catalog.now() - interval '30 minutes'
          then 1
        else public.whatsapp_recovery_ip_limits.attempts + 1
      end,
      window_started_at = case
        when public.whatsapp_recovery_ip_limits.window_started_at < pg_catalog.now() - interval '30 minutes'
          then pg_catalog.now()
        else public.whatsapp_recovery_ip_limits.window_started_at
      end
  returning attempts into v_attempts;

  return v_attempts <= 12;
end;
$$;
revoke all on function public.whatsapp_consume_recovery_ip_limit(text) from public, anon, authenticated;
grant execute on function public.whatsapp_consume_recovery_ip_limit(text) to service_role;

create or replace function public.whatsapp_revoke_auth_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  delete from auth.sessions where user_id = p_user_id;
end;
$$;
revoke all on function public.whatsapp_revoke_auth_sessions(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_revoke_auth_sessions(uuid) to service_role;

create table if not exists public.whatsapp_moderator_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator', 'child_safety')),
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.whatsapp_moderator_roles enable row level security;
revoke all on table public.whatsapp_moderator_roles from public, anon, authenticated;
grant all on table public.whatsapp_moderator_roles to service_role;

create table if not exists public.whatsapp_user_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 1000),
  restricted_until timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
alter table public.whatsapp_user_restrictions enable row level security;
revoke all on table public.whatsapp_user_restrictions from public, anon, authenticated;
grant all on table public.whatsapp_user_restrictions to service_role;

create table if not exists public.whatsapp_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.whatsapp_user_reports(id) on delete set null,
  action_type text not null check (action_type in ('mark_reviewing', 'resolve_report', 'dismiss_report', 'restrict_messaging', 'restore_messaging')),
  reason text not null default '' check (pg_catalog.char_length(reason) <= 1000),
  restricted_until timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.whatsapp_moderation_actions enable row level security;
revoke all on table public.whatsapp_moderation_actions from public, anon, authenticated;
grant all on table public.whatsapp_moderation_actions to service_role;

create index if not exists whatsapp_moderation_actions_report_created_idx
  on public.whatsapp_moderation_actions(report_id, created_at desc);
create index if not exists whatsapp_user_restrictions_until_idx
  on public.whatsapp_user_restrictions(restricted_until);

create or replace function private.whatsapp_current_user_is_restricted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.whatsapp_user_restrictions r
    where r.user_id = (select auth.uid())
      and r.restricted_until > pg_catalog.now()
  );
$$;
revoke all on function private.whatsapp_current_user_is_restricted() from public, anon;
grant execute on function private.whatsapp_current_user_is_restricted() to authenticated;

drop policy if exists "Prevent direct messages across a block" on public.aeroshell_messages;
create policy "Hide messages between blocked accounts in every chat"
on public.aeroshell_messages
as restrictive
for select
to authenticated
using (
  not exists (
    select 1
    from public.whatsapp_user_blocks b
    where
      (
        b.blocker_id = (select auth.uid())
        and b.blocked_id = case
          when public.aeroshell_messages.group_id is not null then public.aeroshell_messages.sender_id
          when public.aeroshell_messages.sender_id = (select auth.uid()) then public.aeroshell_messages.recipient_id
          else public.aeroshell_messages.sender_id
        end
      )
      or
      (
        b.blocked_id = (select auth.uid())
        and b.blocker_id = case
          when public.aeroshell_messages.group_id is not null then public.aeroshell_messages.sender_id
          when public.aeroshell_messages.sender_id = (select auth.uid()) then public.aeroshell_messages.recipient_id
          else public.aeroshell_messages.sender_id
        end
      )
  )
);

create policy "Restricted users cannot send messages"
on public.aeroshell_messages
as restrictive
for insert
to authenticated
with check (not (select private.whatsapp_current_user_is_restricted()));

create policy "Prevent friend requests across a block"
on public.aeroshell_friend_requests
as restrictive
for insert
to authenticated
with check (
  not exists (
    select 1
    from public.whatsapp_user_blocks b
    where
      (b.blocker_id = (select auth.uid()) and b.blocked_id = public.aeroshell_friend_requests.recipient_id)
      or
      (b.blocked_id = (select auth.uid()) and b.blocker_id = public.aeroshell_friend_requests.recipient_id)
  )
);

create or replace function private.whatsapp_guard_report_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recent_count integer;
begin
  select pg_catalog.count(*)
  into v_recent_count
  from public.whatsapp_user_reports r
  where r.reporter_id = new.reporter_id
    and r.created_at > pg_catalog.now() - interval '1 hour';

  if v_recent_count >= 6 then
    raise exception using errcode = 'P0001', message = 'report_rate_limited';
  end if;

  return new;
end;
$$;
revoke all on function private.whatsapp_guard_report_rate() from public, anon, authenticated;

drop trigger if exists whatsapp_user_reports_rate_guard on public.whatsapp_user_reports;
create trigger whatsapp_user_reports_rate_guard
before insert on public.whatsapp_user_reports
for each row execute function private.whatsapp_guard_report_rate();


create policy "Prevent accepting requests across a block"
on public.aeroshell_friend_requests
as restrictive
for update
to authenticated
using (true)
with check (
  not (
    public.aeroshell_friend_requests.status = 'accepted'
    and exists (
      select 1
      from public.whatsapp_user_blocks b
      where
        (b.blocker_id = public.aeroshell_friend_requests.requester_id and b.blocked_id = public.aeroshell_friend_requests.recipient_id)
        or
        (b.blocker_id = public.aeroshell_friend_requests.recipient_id and b.blocked_id = public.aeroshell_friend_requests.requester_id)
    )
  )
);
