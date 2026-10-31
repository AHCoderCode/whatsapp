-- Periodically hard-delete expired message/status rows and their private Storage objects.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DROP POLICY IF EXISTS "WhatsApp channel readers can read channel media" ON storage.objects;
CREATE POLICY "WhatsApp channel readers can read channel media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='master-chat-attachments' AND (storage.foldername(name))[1]='channels'
    AND EXISTS (SELECT 1 FROM public.whatsapp_channel_posts p WHERE p.media_path=objects.name)
  );

CREATE OR REPLACE FUNCTION private.purge_expired_whatsapp_content()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,storage AS $$
BEGIN
  DELETE FROM storage.objects so
  USING public.whatsapp_statuses s
  WHERE so.bucket_id='master-chat-attachments' AND so.name=s.media_path
    AND s.expires_at<=now() AND s.media_path IS NOT NULL;
  DELETE FROM public.whatsapp_statuses WHERE expires_at<=now();

  DELETE FROM storage.objects so
  USING public.aeroshell_messages m
  WHERE so.bucket_id='master-chat-attachments' AND so.name=m.attachment_path
    AND m.expires_at IS NOT NULL AND m.expires_at<=now() AND m.attachment_path IS NOT NULL;
  DELETE FROM public.aeroshell_messages WHERE expires_at IS NOT NULL AND expires_at<=now();

  DELETE FROM storage.objects so
  WHERE so.bucket_id='master-chat-attachments'
    AND (storage.foldername(so.name))[1] IN ('statuses','channels')
    AND NOT EXISTS (SELECT 1 FROM public.whatsapp_statuses s WHERE s.media_path=so.name)
    AND NOT EXISTS (SELECT 1 FROM public.whatsapp_channel_posts p WHERE p.media_path=so.name);
END $$;
REVOKE ALL ON FUNCTION private.purge_expired_whatsapp_content() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname='whatsapp-purge-expired-content';
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
  PERFORM cron.schedule('whatsapp-purge-expired-content','*/5 * * * *',
    'SELECT private.purge_expired_whatsapp_content();');
END $$;
NOTIFY pgrst,'reload schema';
