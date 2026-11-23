-- Persist recipient-device delivery acknowledgements separately from read receipts.
-- One grey tick means stored by the server, two grey ticks means received by a recipient device,
-- and the existing aeroshell_message_reads table continues to represent read receipts.
create table if not exists public.aeroshell_message_deliveries (
  message_id uuid not null references public.aeroshell_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists aeroshell_message_deliveries_user_id_idx
  on public.aeroshell_message_deliveries(user_id);

alter table public.aeroshell_message_deliveries enable row level security;
revoke all on table public.aeroshell_message_deliveries from anon, public;
grant select, insert on table public.aeroshell_message_deliveries to authenticated;

drop policy if exists "Participants can read message delivery receipts" on public.aeroshell_message_deliveries;
create policy "Participants can read message delivery receipts"
  on public.aeroshell_message_deliveries for select to authenticated
  using (
    (select private.aeroshell_chat_actor_is_valid())
    and exists (
      select 1 from public.aeroshell_messages m
      where m.id = aeroshell_message_deliveries.message_id
        and (
          (m.group_id is null and ((select auth.uid()) = m.sender_id or (select auth.uid()) = m.recipient_id))
          or (m.group_id is not null and private.aeroshell_group_is_member(m.group_id, (select auth.uid())))
        )
    )
  );

drop policy if exists "Recipients can record message delivery" on public.aeroshell_message_deliveries;
create policy "Recipients can record message delivery"
  on public.aeroshell_message_deliveries for insert to authenticated
  with check (
    (select private.aeroshell_chat_actor_is_valid())
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.aeroshell_messages m
      where m.id = aeroshell_message_deliveries.message_id
        and m.sender_id <> (select auth.uid())
        and (
          (m.group_id is null and m.recipient_id = (select auth.uid()))
          or (m.group_id is not null and private.aeroshell_group_is_member(m.group_id, (select auth.uid())))
        )
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'aeroshell_message_deliveries'
     ) then
    alter publication supabase_realtime add table public.aeroshell_message_deliveries;
  end if;
end $$;

notify pgrst, 'reload schema';
