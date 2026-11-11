create or replace function public.aeroshell_guard_call_signal_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor uuid := (select auth.uid());
  recent_signals integer;
begin
  if actor is null or new.from_user_id is distinct from actor then
    raise exception 'Call signals must be sent by the signed-in user.' using errcode = '42501';
  end if;
  if jsonb_typeof(new.payload) <> 'object' or pg_column_size(new.payload) > 8192 then
    raise exception 'Invalid call signal payload.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 2));
  if not exists (
    select 1
    from public.aeroshell_calls c
    where c.id = new.call_id
      and c.status in ('ringing', 'accepted')
      and (
        (c.caller_id = actor and c.callee_id = new.to_user_id)
        or (c.callee_id = actor and c.caller_id = new.to_user_id)
      )
      and (
        new.kind = 'ice'
        or (new.kind = 'offer' and c.caller_id = actor)
        or (new.kind = 'answer' and c.callee_id = actor and c.status = 'accepted')
        or (new.kind = 'fallback-request' and c.callee_id = actor and c.status = 'accepted')
        or (new.kind = 'fallback-offer' and c.caller_id = actor)
        or (new.kind = 'fallback-answer' and c.callee_id = actor and c.status = 'accepted')
        or new.kind = 'fallback-ice'
      )
  ) then
    raise exception 'Signal is not permitted for this call state.' using errcode = '42501';
  end if;
  select count(*) into recent_signals
  from public.aeroshell_call_signals s
  where s.from_user_id = actor
    and s.created_at > clock_timestamp() - interval '1 minute';
  if recent_signals >= 200 then
    raise exception 'Too many call signals. Wait before continuing.' using errcode = '54000';
  end if;
  return new;
end;
$function$;
