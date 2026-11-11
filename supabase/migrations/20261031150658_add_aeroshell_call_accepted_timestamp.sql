-- Track whether a direct call was answered before it ended.
-- This lets the chat timeline distinguish an unanswered/missed incoming call
-- from a call that was received and later ended.
ALTER TABLE public.aeroshell_calls
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.aeroshell_calls.accepted_at IS
  'Set when the callee accepts the call; retained after it ends to distinguish missed calls from completed calls.';
