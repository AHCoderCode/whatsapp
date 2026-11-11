-- Permit signed-in users to read channel media associated with a readable channel post.
-- Actual expiry and media deletion are scheduled by the later Vault + Edge Function migration.
DROP POLICY IF EXISTS "WhatsApp channel readers can read channel media" ON storage.objects;
CREATE POLICY "WhatsApp channel readers can read channel media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='channels'
    AND EXISTS (SELECT 1 FROM public.whatsapp_channel_posts p WHERE p.media_path=objects.name)
  );
NOTIFY pgrst,'reload schema';
