-- A block must stop new direct messages in both directions at the database boundary.
-- Shared group conversations remain available, matching the existing SELECT restriction.
DROP POLICY IF EXISTS "Prevent direct messages across a block on insert" ON public.aeroshell_messages;
CREATE POLICY "Prevent direct messages across a block on insert"
  ON public.aeroshell_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    group_id IS NOT NULL
    OR (
      sender_id = (SELECT auth.uid())
      AND recipient_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_user_blocks b
        WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = recipient_id)
           OR (b.blocked_id = (SELECT auth.uid()) AND b.blocker_id = recipient_id)
      )
    )
  );
NOTIFY pgrst, 'reload schema';
