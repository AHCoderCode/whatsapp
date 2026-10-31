-- Per-user server-enforced quota for temporary group-call TURN credentials.
CREATE TABLE IF NOT EXISTS public.aeroshell_group_turn_credential_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_call_id uuid NOT NULL REFERENCES public.aeroshell_group_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aeroshell_group_turn_requests_user_time_idx
  ON public.aeroshell_group_turn_credential_requests(user_id, created_at DESC);
ALTER TABLE public.aeroshell_group_turn_credential_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.aeroshell_group_turn_credential_requests TO authenticated;
DROP POLICY IF EXISTS "Participants can read their group relay request history"
  ON public.aeroshell_group_turn_credential_requests;
DROP POLICY IF EXISTS "Accepted group call participants can request relay credentials"
  ON public.aeroshell_group_turn_credential_requests;
CREATE POLICY "Participants can read their group relay request history"
  ON public.aeroshell_group_turn_credential_requests FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()));
CREATE POLICY "Accepted group call participants can request relay credentials"
  ON public.aeroshell_group_turn_credential_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.aeroshell_group_calls gc
      JOIN public.aeroshell_group_call_participants p ON p.group_call_id=gc.id
      WHERE gc.id=aeroshell_group_turn_credential_requests.group_call_id
        AND gc.status='active' AND p.user_id=(SELECT auth.uid()) AND p.status='accepted'
    )
  );
