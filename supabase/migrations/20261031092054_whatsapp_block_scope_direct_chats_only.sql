-- Blocking applies to direct conversations only. Shared group conversations remain intact.
DROP POLICY IF EXISTS "Prevent direct messages across a block" ON public.aeroshell_messages;
CREATE POLICY "Prevent direct messages across a block"
  ON public.aeroshell_messages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    group_id IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.whatsapp_user_blocks b
      WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = CASE WHEN sender_id = (SELECT auth.uid()) THEN recipient_id ELSE sender_id END)
         OR (b.blocked_id = (SELECT auth.uid()) AND b.blocker_id = CASE WHEN sender_id = (SELECT auth.uid()) THEN recipient_id ELSE sender_id END)
    )
  );
NOTIFY pgrst, 'reload schema';
