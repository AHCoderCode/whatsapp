-- Consolidate overlapping RLS policies and add FK indexes for feature-completion tables.
DROP POLICY IF EXISTS "Conversation participants can read disappearing settings"
  ON public.whatsapp_disappearing_settings;
DROP POLICY IF EXISTS "Conversation participants can set disappearing settings"
  ON public.whatsapp_disappearing_settings;
CREATE POLICY "Conversation participants manage disappearing settings"
  ON public.whatsapp_disappearing_settings FOR ALL TO authenticated
  USING (
    (group_id IS NOT NULL AND private.aeroshell_group_is_member(group_id,(SELECT auth.uid())))
    OR (group_id IS NULL AND ((SELECT auth.uid())=direct_user_low OR (SELECT auth.uid())=direct_user_high)
        AND private.aeroshell_are_friends(direct_user_low,direct_user_high))
  )
  WITH CHECK (
    changed_by=(SELECT auth.uid()) AND (
      (group_id IS NOT NULL AND private.aeroshell_group_is_member(group_id,(SELECT auth.uid())))
      OR (group_id IS NULL AND ((SELECT auth.uid())=direct_user_low OR (SELECT auth.uid())=direct_user_high)
          AND private.aeroshell_are_friends(direct_user_low,direct_user_high))
    )
  );

DROP POLICY IF EXISTS "Community members can join linked subgroups" ON public.aeroshell_group_members;
ALTER POLICY "Group admins can add members and creators can start a group"
  ON public.aeroshell_group_members
  WITH CHECK (
    added_by=(SELECT auth.uid()) AND (
      (user_id=(SELECT auth.uid()) AND role='admin' AND EXISTS (
        SELECT 1 FROM public.aeroshell_groups g
        WHERE g.id=aeroshell_group_members.group_id AND g.created_by=(SELECT auth.uid())
      ) AND NOT EXISTS (
        SELECT 1 FROM public.aeroshell_group_members gm WHERE gm.group_id=aeroshell_group_members.group_id
      ))
      OR (role='member' AND private.aeroshell_group_is_admin(group_id,(SELECT auth.uid())))
      OR (user_id=(SELECT auth.uid()) AND role='member' AND EXISTS (
        SELECT 1 FROM public.whatsapp_community_groups cg
        JOIN public.whatsapp_community_members cm ON cm.community_id=cg.community_id
        WHERE cg.group_id=aeroshell_group_members.group_id AND cm.user_id=(SELECT auth.uid())
      ))
    )
  );

CREATE INDEX IF NOT EXISTS whatsapp_community_groups_group_id_idx ON public.whatsapp_community_groups(group_id);
CREATE INDEX IF NOT EXISTS whatsapp_community_groups_created_by_idx ON public.whatsapp_community_groups(created_by);
CREATE INDEX IF NOT EXISTS whatsapp_disappearing_changed_by_idx ON public.whatsapp_disappearing_settings(changed_by);
CREATE INDEX IF NOT EXISTS whatsapp_disappearing_direct_high_idx ON public.whatsapp_disappearing_settings(direct_user_high);
CREATE INDEX IF NOT EXISTS whatsapp_user_blocks_blocked_id_idx ON public.whatsapp_user_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS whatsapp_user_reports_reporter_id_idx ON public.whatsapp_user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS whatsapp_user_reports_reported_user_id_idx ON public.whatsapp_user_reports(reported_user_id);
