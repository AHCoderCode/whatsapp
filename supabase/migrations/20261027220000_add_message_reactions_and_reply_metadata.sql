-- Message replies and persistent emoji reactions.
-- This migration intentionally keeps Row Level Security enabled; only participants in
-- a message's direct chat or group can read/react to it, and users may change only
-- their own reaction.

ALTER TABLE public.aeroshell_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.aeroshell_messages(id) ON DELETE SET NULL;
ALTER TABLE public.aeroshell_messages
  ADD COLUMN IF NOT EXISTS reply_to_text text;
ALTER TABLE public.aeroshell_messages
  ADD COLUMN IF NOT EXISTS reply_to_sender text;

CREATE TABLE IF NOT EXISTS public.aeroshell_message_reactions (
  message_id uuid NOT NULL REFERENCES public.aeroshell_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','🙏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.aeroshell_message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aeroshell_message_reactions TO authenticated;

DROP POLICY IF EXISTS "Chat participants can read reactions" ON public.aeroshell_message_reactions;
CREATE POLICY "Chat participants can read reactions"
ON public.aeroshell_message_reactions FOR SELECT TO authenticated
USING (
  private.aeroshell_chat_actor_is_valid()
  AND EXISTS (
    SELECT 1
    FROM public.aeroshell_messages m
    WHERE m.id = aeroshell_message_reactions.message_id
      AND NOT EXISTS (
        SELECT 1 FROM public.aeroshell_message_hides h
        WHERE h.message_id = m.id AND h.user_id = (SELECT auth.uid())
      )
      AND (
        (m.group_id IS NULL
          AND private.aeroshell_are_friends(m.sender_id, m.recipient_id)
          AND ((SELECT auth.uid()) = m.sender_id OR (SELECT auth.uid()) = m.recipient_id))
        OR
        (m.group_id IS NOT NULL AND private.aeroshell_group_is_member(m.group_id, (SELECT auth.uid())))
      )
  )
);

DROP POLICY IF EXISTS "Participants can add reactions as themselves" ON public.aeroshell_message_reactions;
CREATE POLICY "Participants can add reactions as themselves"
ON public.aeroshell_message_reactions FOR INSERT TO authenticated
WITH CHECK (
  private.aeroshell_chat_actor_is_valid()
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.aeroshell_messages m
    WHERE m.id = aeroshell_message_reactions.message_id
      AND NOT EXISTS (
        SELECT 1 FROM public.aeroshell_message_hides h
        WHERE h.message_id = m.id AND h.user_id = (SELECT auth.uid())
      )
      AND (
        (m.group_id IS NULL
          AND private.aeroshell_are_friends(m.sender_id, m.recipient_id)
          AND ((SELECT auth.uid()) = m.sender_id OR (SELECT auth.uid()) = m.recipient_id))
        OR
        (m.group_id IS NOT NULL AND private.aeroshell_group_is_member(m.group_id, (SELECT auth.uid())))
      )
  )
);

DROP POLICY IF EXISTS "Users can update their own message reactions" ON public.aeroshell_message_reactions;
CREATE POLICY "Users can update their own message reactions"
ON public.aeroshell_message_reactions FOR UPDATE TO authenticated
USING (
  private.aeroshell_chat_actor_is_valid()
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.aeroshell_messages m
    WHERE m.id = aeroshell_message_reactions.message_id
      AND (
        (m.group_id IS NULL
          AND private.aeroshell_are_friends(m.sender_id, m.recipient_id)
          AND ((SELECT auth.uid()) = m.sender_id OR (SELECT auth.uid()) = m.recipient_id))
        OR
        (m.group_id IS NOT NULL AND private.aeroshell_group_is_member(m.group_id, (SELECT auth.uid())))
      )
  )
)
WITH CHECK (
  private.aeroshell_chat_actor_is_valid()
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.aeroshell_messages m
    WHERE m.id = aeroshell_message_reactions.message_id
      AND (
        (m.group_id IS NULL
          AND private.aeroshell_are_friends(m.sender_id, m.recipient_id)
          AND ((SELECT auth.uid()) = m.sender_id OR (SELECT auth.uid()) = m.recipient_id))
        OR
        (m.group_id IS NOT NULL AND private.aeroshell_group_is_member(m.group_id, (SELECT auth.uid())))
      )
  )
);

DROP POLICY IF EXISTS "Users can remove their own message reactions" ON public.aeroshell_message_reactions;
CREATE POLICY "Users can remove their own message reactions"
ON public.aeroshell_message_reactions FOR DELETE TO authenticated
USING (
  private.aeroshell_chat_actor_is_valid()
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.aeroshell_messages m
    WHERE m.id = aeroshell_message_reactions.message_id
      AND (
        (m.group_id IS NULL
          AND private.aeroshell_are_friends(m.sender_id, m.recipient_id)
          AND ((SELECT auth.uid()) = m.sender_id OR (SELECT auth.uid()) = m.recipient_id))
        OR
        (m.group_id IS NOT NULL AND private.aeroshell_group_is_member(m.group_id, (SELECT auth.uid())))
      )
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'aeroshell_message_reactions'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.aeroshell_message_reactions;
  END IF;
END $$;
