-- WhatsApp missing feature foundations: media, lists, moderation, expiry and community subgroups.
ALTER TABLE public.whatsapp_statuses
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint;
ALTER TABLE public.whatsapp_statuses DROP CONSTRAINT IF EXISTS whatsapp_statuses_content_type_check;
ALTER TABLE public.whatsapp_statuses ADD CONSTRAINT whatsapp_statuses_content_type_check CHECK (
  content_type IN ('text','image','video') AND (
    (content_type='text' AND media_path IS NULL AND media_mime IS NULL AND media_size IS NULL) OR
    (content_type IN ('image','video') AND media_path IS NOT NULL AND media_mime IS NOT NULL
     AND media_size BETWEEN 1 AND 15728640
     AND ((content_type='image' AND media_mime LIKE 'image/%') OR (content_type='video' AND media_mime LIKE 'video/%')))
  )
);

ALTER TABLE public.whatsapp_channel_posts
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint;
ALTER TABLE public.whatsapp_channel_posts DROP CONSTRAINT IF EXISTS whatsapp_channel_posts_content_type_check;
ALTER TABLE public.whatsapp_channel_posts ADD CONSTRAINT whatsapp_channel_posts_content_type_check CHECK (
  content_type IN ('text','image','video') AND (
    (content_type='text' AND media_path IS NULL AND media_mime IS NULL AND media_size IS NULL) OR
    (content_type IN ('image','video') AND media_path IS NOT NULL AND media_mime IS NOT NULL
     AND media_size BETWEEN 1 AND 15728640
     AND ((content_type='image' AND media_mime LIKE 'image/%') OR (content_type='video' AND media_mime LIKE 'video/%')))
  )
);

CREATE TABLE IF NOT EXISTS public.whatsapp_custom_chat_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
  chat_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(chat_ids)='array' AND jsonb_array_length(chat_ids)<=500),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_custom_chat_lists_user_name_uq
  ON public.whatsapp_custom_chat_lists(user_id,lower(name));
CREATE INDEX IF NOT EXISTS whatsapp_custom_chat_lists_user_order_idx
  ON public.whatsapp_custom_chat_lists(user_id,sort_order,created_at);
ALTER TABLE public.whatsapp_custom_chat_lists ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.whatsapp_custom_chat_lists TO authenticated;
DROP POLICY IF EXISTS "Users manage their own custom chat lists" ON public.whatsapp_custom_chat_lists;
CREATE POLICY "Users manage their own custom chat lists" ON public.whatsapp_custom_chat_lists
  FOR ALL TO authenticated USING (user_id=(SELECT auth.uid()))
  WITH CHECK (user_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.whatsapp_user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id,blocked_id),
  CHECK (blocker_id<>blocked_id)
);
ALTER TABLE public.whatsapp_user_blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE ON public.whatsapp_user_blocks TO authenticated;
DROP POLICY IF EXISTS "Users can see block relationships involving themselves" ON public.whatsapp_user_blocks;
DROP POLICY IF EXISTS "Users can block accounts as themselves" ON public.whatsapp_user_blocks;
DROP POLICY IF EXISTS "Users can unblock accounts they blocked" ON public.whatsapp_user_blocks;
CREATE POLICY "Users can see block relationships involving themselves" ON public.whatsapp_user_blocks
  FOR SELECT TO authenticated USING (blocker_id=(SELECT auth.uid()) OR blocked_id=(SELECT auth.uid()));
CREATE POLICY "Users can block accounts as themselves" ON public.whatsapp_user_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id=(SELECT auth.uid()) AND blocked_id<>(SELECT auth.uid()));
CREATE POLICY "Users can unblock accounts they blocked" ON public.whatsapp_user_blocks
  FOR DELETE TO authenticated USING (blocker_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.whatsapp_user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  chat_id uuid,
  reason text NOT NULL CHECK (reason IN ('spam','harassment','impersonation','inappropriate_content','other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','resolved','dismissed')),
  CHECK (reporter_id<>reported_user_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_user_reports_created_idx ON public.whatsapp_user_reports(created_at DESC);
ALTER TABLE public.whatsapp_user_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.whatsapp_user_reports TO authenticated;
DROP POLICY IF EXISTS "Users can submit reports as themselves" ON public.whatsapp_user_reports;
DROP POLICY IF EXISTS "Users can see reports they submitted" ON public.whatsapp_user_reports;
CREATE POLICY "Users can submit reports as themselves" ON public.whatsapp_user_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id=(SELECT auth.uid()) AND reported_user_id<>(SELECT auth.uid()));
CREATE POLICY "Users can see reports they submitted" ON public.whatsapp_user_reports
  FOR SELECT TO authenticated USING (reporter_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.whatsapp_disappearing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_user_low uuid REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  direct_user_high uuid REFERENCES public.aeroshell_profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.aeroshell_groups(id) ON DELETE CASCADE,
  disappearing_seconds integer NOT NULL DEFAULT 0 CHECK (disappearing_seconds IN (0,86400,604800,7776000)),
  changed_by uuid NOT NULL REFERENCES public.aeroshell_profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (group_id IS NOT NULL AND direct_user_low IS NULL AND direct_user_high IS NULL) OR
    (group_id IS NULL AND direct_user_low IS NOT NULL AND direct_user_high IS NOT NULL AND direct_user_low<direct_user_high)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_disappearing_direct_uq
  ON public.whatsapp_disappearing_settings(direct_user_low,direct_user_high) WHERE group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_disappearing_group_uq
  ON public.whatsapp_disappearing_settings(group_id) WHERE group_id IS NOT NULL;
ALTER TABLE public.whatsapp_disappearing_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.whatsapp_disappearing_settings TO authenticated;
DROP POLICY IF EXISTS "Conversation participants can read disappearing settings" ON public.whatsapp_disappearing_settings;
DROP POLICY IF EXISTS "Conversation participants can set disappearing settings" ON public.whatsapp_disappearing_settings;
CREATE POLICY "Conversation participants can read disappearing settings" ON public.whatsapp_disappearing_settings
  FOR SELECT TO authenticated USING (
    (group_id IS NOT NULL AND private.aeroshell_group_is_member(group_id,(SELECT auth.uid()))) OR
    (group_id IS NULL AND ((SELECT auth.uid())=direct_user_low OR (SELECT auth.uid())=direct_user_high)
     AND private.aeroshell_are_friends(direct_user_low,direct_user_high))
  );
CREATE POLICY "Conversation participants can set disappearing settings" ON public.whatsapp_disappearing_settings
  FOR ALL TO authenticated USING (
    (group_id IS NOT NULL AND private.aeroshell_group_is_member(group_id,(SELECT auth.uid()))) OR
    (group_id IS NULL AND ((SELECT auth.uid())=direct_user_low OR (SELECT auth.uid())=direct_user_high)
     AND private.aeroshell_are_friends(direct_user_low,direct_user_high))
  ) WITH CHECK (
    changed_by=(SELECT auth.uid()) AND (
      (group_id IS NOT NULL AND private.aeroshell_group_is_member(group_id,(SELECT auth.uid()))) OR
      (group_id IS NULL AND ((SELECT auth.uid())=direct_user_low OR (SELECT auth.uid())=direct_user_high)
       AND private.aeroshell_are_friends(direct_user_low,direct_user_high))
    )
  );

ALTER TABLE public.aeroshell_messages ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE OR REPLACE FUNCTION private.set_whatsapp_message_expiration()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,private AS $$
DECLARE timer_seconds integer := 0;
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    SELECT disappearing_seconds INTO timer_seconds FROM public.whatsapp_disappearing_settings WHERE group_id=NEW.group_id;
  ELSE
    SELECT disappearing_seconds INTO timer_seconds FROM public.whatsapp_disappearing_settings
      WHERE direct_user_low=LEAST(NEW.sender_id,NEW.recipient_id)
        AND direct_user_high=GREATEST(NEW.sender_id,NEW.recipient_id);
  END IF;
  IF COALESCE(timer_seconds,0)>0 THEN NEW.expires_at:=now()+make_interval(secs=>timer_seconds);
  ELSE NEW.expires_at:=NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_whatsapp_message_expiration ON public.aeroshell_messages;
CREATE TRIGGER set_whatsapp_message_expiration BEFORE INSERT ON public.aeroshell_messages
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_message_expiration();

DROP POLICY IF EXISTS "Hide expired messages" ON public.aeroshell_messages;
CREATE POLICY "Hide expired messages" ON public.aeroshell_messages
  AS RESTRICTIVE FOR SELECT TO authenticated USING (expires_at IS NULL OR expires_at>now());
DROP POLICY IF EXISTS "Prevent direct messages across a block" ON public.aeroshell_messages;
CREATE POLICY "Prevent direct messages across a block" ON public.aeroshell_messages
  AS RESTRICTIVE FOR SELECT TO authenticated USING (
    NOT EXISTS (
      SELECT 1 FROM public.whatsapp_user_blocks b
      WHERE (b.blocker_id=(SELECT auth.uid()) AND b.blocked_id=CASE WHEN sender_id=(SELECT auth.uid()) THEN recipient_id ELSE sender_id END)
         OR (b.blocked_id=(SELECT auth.uid()) AND b.blocker_id=CASE WHEN sender_id=(SELECT auth.uid()) THEN recipient_id ELSE sender_id END)
    )
  );
DROP POLICY IF EXISTS "Prevent sending direct messages across a block" ON public.aeroshell_messages;
CREATE POLICY "Prevent sending direct messages across a block" ON public.aeroshell_messages
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
    group_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.whatsapp_user_blocks b
      WHERE (b.blocker_id=sender_id AND b.blocked_id=recipient_id)
         OR (b.blocker_id=recipient_id AND b.blocked_id=sender_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.whatsapp_community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.whatsapp_communities(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.aeroshell_groups(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  created_by uuid NOT NULL REFERENCES public.aeroshell_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id,group_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_community_groups_community_idx
  ON public.whatsapp_community_groups(community_id,created_at);
ALTER TABLE public.whatsapp_community_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE ON public.whatsapp_community_groups TO authenticated;
DROP POLICY IF EXISTS "Community members can see linked subgroups" ON public.whatsapp_community_groups;
DROP POLICY IF EXISTS "Community owners who administer groups can link them" ON public.whatsapp_community_groups;
DROP POLICY IF EXISTS "Community owners or group admins can unlink groups" ON public.whatsapp_community_groups;
CREATE POLICY "Community members can see linked subgroups" ON public.whatsapp_community_groups
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.whatsapp_community_members cm
    WHERE cm.community_id=whatsapp_community_groups.community_id AND cm.user_id=(SELECT auth.uid())
  ));
CREATE POLICY "Community owners who administer groups can link them" ON public.whatsapp_community_groups
  FOR INSERT TO authenticated WITH CHECK (
    created_by=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_community_members cm
      WHERE cm.community_id=whatsapp_community_groups.community_id AND cm.user_id=(SELECT auth.uid()) AND cm.role='owner'
    )
    AND private.aeroshell_group_is_admin(group_id,(SELECT auth.uid()))
  );
CREATE POLICY "Community owners or group admins can unlink groups" ON public.whatsapp_community_groups
  FOR DELETE TO authenticated USING (
    private.aeroshell_group_is_admin(group_id,(SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_community_members cm
      WHERE cm.community_id=whatsapp_community_groups.community_id AND cm.user_id=(SELECT auth.uid()) AND cm.role='owner'
    )
  );
DROP POLICY IF EXISTS "Community members can join linked subgroups" ON public.aeroshell_group_members;
CREATE POLICY "Community members can join linked subgroups" ON public.aeroshell_group_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id=(SELECT auth.uid()) AND added_by=(SELECT auth.uid()) AND role='member'
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_community_groups cg
      JOIN public.whatsapp_community_members cm ON cm.community_id=cg.community_id
      WHERE cg.group_id=aeroshell_group_members.group_id AND cm.user_id=(SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "WhatsApp status owners can upload status media" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp status viewers can read status media" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp status owners can delete status media" ON storage.objects;
CREATE POLICY "WhatsApp status owners can upload status media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='statuses'
    AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
    AND COALESCE((metadata->>'size')::bigint,0) BETWEEN 1 AND 15728640
    AND COALESCE(metadata->>'mimetype','') LIKE ANY(ARRAY['image/%','video/%'])
  );
CREATE POLICY "WhatsApp status viewers can read status media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='statuses'
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_statuses s
      WHERE s.media_path=objects.name AND s.expires_at>now()
        AND (s.user_id=(SELECT auth.uid()) OR private.aeroshell_are_friends((SELECT auth.uid()),s.user_id))
    )
  );
CREATE POLICY "WhatsApp status owners can delete status media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='statuses'
    AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "WhatsApp channel owners can upload channel media" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp channel readers can read channel media" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp channel owners can delete channel media" ON storage.objects;
CREATE POLICY "WhatsApp channel owners can upload channel media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='channels'
    AND (storage.foldername(name))[3]=(SELECT auth.uid())::text
    AND COALESCE((metadata->>'size')::bigint,0) BETWEEN 1 AND 15728640
    AND COALESCE(metadata->>'mimetype','') LIKE ANY(ARRAY['image/%','video/%'])
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_channels c
      WHERE c.id::text=(storage.foldername(name))[2] AND c.created_by=(SELECT auth.uid())
    )
  );
CREATE POLICY "WhatsApp channel readers can read channel media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='channels'
    AND EXISTS (SELECT 1 FROM public.whatsapp_channel_posts p WHERE p.media_path=objects.name)
  );
CREATE POLICY "WhatsApp channel owners can delete channel media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='channels'
    AND (storage.foldername(name))[3]=(SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_channels c
      WHERE c.id::text=(storage.foldername(name))[2] AND c.created_by=(SELECT auth.uid())
    )
  );
NOTIFY pgrst,'reload schema';
