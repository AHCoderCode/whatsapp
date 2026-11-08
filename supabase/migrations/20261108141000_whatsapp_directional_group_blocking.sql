-- Correct shared-group block semantics:
-- A blocker hides messages authored by the blocked account only from the blocker's view.
-- Direct-message privacy remains symmetric, preserving the existing block behavior.

drop policy if exists "Hide messages between blocked accounts in every chat" on public.aeroshell_messages;
create policy "Hide blocked authors in shared groups and direct chats"
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
        public.aeroshell_messages.group_id is not null
        and b.blocker_id = (select auth.uid())
        and b.blocked_id = public.aeroshell_messages.sender_id
      )
      or
      (
        public.aeroshell_messages.group_id is null
        and (
          (b.blocker_id = (select auth.uid()) and b.blocked_id = case
            when public.aeroshell_messages.sender_id = (select auth.uid()) then public.aeroshell_messages.recipient_id
            else public.aeroshell_messages.sender_id
          end)
          or
          (b.blocked_id = (select auth.uid()) and b.blocker_id = case
            when public.aeroshell_messages.sender_id = (select auth.uid()) then public.aeroshell_messages.recipient_id
            else public.aeroshell_messages.sender_id
          end)
        )
      )
  )
);
