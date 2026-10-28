-- Adds sender-only text editing and permits private video attachments within the current 15 MB policy.
ALTER TABLE public.aeroshell_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

DROP POLICY IF EXISTS "Send messages as yourself" ON public.aeroshell_messages;
CREATE POLICY "Send messages as yourself" ON public.aeroshell_messages FOR INSERT TO authenticated
WITH CHECK (
 sender_id=(SELECT auth.uid()) AND (
  (group_id IS NULL AND recipient_id IS NOT NULL AND recipient_id<>(SELECT auth.uid())
   AND private.aeroshell_are_friends(sender_id,recipient_id)
   AND EXISTS(SELECT 1 FROM public.aeroshell_profiles p WHERE p.id=aeroshell_messages.recipient_id))
  OR (group_id IS NOT NULL AND recipient_id IS NULL AND private.aeroshell_group_is_member(group_id,(SELECT auth.uid())))
 ) AND (
  (message_type='text' AND char_length(btrim(body)) BETWEEN 1 AND 2000)
  OR (message_type='file' AND attachment_path IS NOT NULL AND attachment_size BETWEEN 1 AND 15728640)
  OR (message_type='voice' AND attachment_path IS NOT NULL AND attachment_mime LIKE 'audio/%'
      AND attachment_size BETWEEN 1 AND 15728640 AND voice_duration_ms BETWEEN 1 AND 120000)
 )
);

DROP POLICY IF EXISTS "Senders can edit their own text messages" ON public.aeroshell_messages;
CREATE POLICY "Senders can edit their own text messages" ON public.aeroshell_messages FOR UPDATE TO authenticated
USING(sender_id=(SELECT auth.uid()) AND message_type='text')
WITH CHECK(sender_id=(SELECT auth.uid()) AND message_type='text' AND char_length(btrim(body)) BETWEEN 1 AND 2000);

REVOKE UPDATE ON TABLE public.aeroshell_messages FROM PUBLIC, authenticated;
GRANT UPDATE(body,edited_at) ON TABLE public.aeroshell_messages TO authenticated;

DROP POLICY IF EXISTS "Participants can upload Master Chat attachments" ON storage.objects;
CREATE POLICY "Participants can upload Master Chat attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='master-chat-attachments'
 AND (NULLIF(metadata->>'size','') IS NULL OR ((metadata->>'size')~'^[0-9]+$' AND (metadata->>'size')::bigint BETWEEN 1 AND 15728640))
 AND (
  ((storage.foldername(name))[1]='direct' AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
   AND (storage.foldername(name))[3]<>(SELECT auth.uid())::text
   AND EXISTS(SELECT 1 FROM public.aeroshell_profiles p WHERE p.id::text=(storage.foldername(name))[3]))
  OR ((storage.foldername(name))[1]='groups' AND (storage.foldername(name))[3]=(SELECT auth.uid())::text
   AND private.aeroshell_group_is_member(
    CASE WHEN (storage.foldername(name))[2]~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (storage.foldername(name))[2]::uuid ELSE NULL::uuid END,(SELECT auth.uid())))
 )
);
NOTIFY pgrst,'reload schema';
