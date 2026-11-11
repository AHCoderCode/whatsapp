-- Enforce the group-call mesh size in Postgres, including concurrent REST inserts.
CREATE OR REPLACE FUNCTION private.enforce_group_call_participant_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
DECLARE participant_count integer;
BEGIN
  -- Serialize participant additions for this call so concurrent inserts
  -- cannot both pass the same count check.
  PERFORM 1
  FROM public.aeroshell_group_calls
  WHERE id = NEW.group_call_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_call_not_active'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer INTO participant_count
  FROM public.aeroshell_group_call_participants
  WHERE group_call_id = NEW.group_call_id;

  IF participant_count >= 8 THEN
    RAISE EXCEPTION 'group_call_participant_limit_exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_group_call_participant_limit
  ON public.aeroshell_group_call_participants;
CREATE TRIGGER enforce_group_call_participant_limit
  BEFORE INSERT ON public.aeroshell_group_call_participants
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_group_call_participant_limit();
