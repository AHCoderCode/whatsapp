alter policy "Participants can send signaling only to the other participant"
on public.aeroshell_call_signals
to authenticated
with check (
  private.aeroshell_chat_actor_is_valid()
  and (select auth.uid()) = from_user_id
  and from_user_id <> to_user_id
  and exists (
    select 1
    from public.aeroshell_calls c
    where c.id = aeroshell_call_signals.call_id
      and c.status = any (array['ringing'::text, 'accepted'::text])
      and (
        (c.caller_id = (select auth.uid()) and c.callee_id = aeroshell_call_signals.to_user_id)
        or
        (c.callee_id = (select auth.uid()) and c.caller_id = aeroshell_call_signals.to_user_id)
      )
      and (
        aeroshell_call_signals.kind = 'ice'
        or (aeroshell_call_signals.kind = 'offer' and c.caller_id = (select auth.uid()))
        or (aeroshell_call_signals.kind = 'answer' and c.callee_id = (select auth.uid()) and c.status = 'accepted')
        or (aeroshell_call_signals.kind = 'fallback-request' and c.callee_id = (select auth.uid()))
        or (aeroshell_call_signals.kind = 'fallback-offer' and c.caller_id = (select auth.uid()))
        or (aeroshell_call_signals.kind = 'fallback-answer' and c.callee_id = (select auth.uid()))
        or aeroshell_call_signals.kind = 'fallback-ice'
      )
  )
);
