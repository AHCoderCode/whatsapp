-- Replace the database-only expiry cleanup with a service-role Edge Function
-- so media is deleted from Supabase Storage itself, not just storage.objects.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.whatsapp_maintenance_secrets (
  name text PRIMARY KEY,
  secret_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_maintenance_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_maintenance_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.whatsapp_maintenance_secrets TO service_role;

DO $$
DECLARE
  cleanup_token text := encode(gen_random_bytes(32), 'hex');
  saved_secret_id uuid;
  publishable_key text := 'sb_publishable_w59xgI2zOLJe2Hmx_PC4MQ_zDQ8g9hp';
BEGIN
  SELECT id INTO saved_secret_id
  FROM vault.secrets
  WHERE name = 'whatsapp_expiry_cleanup_token'
  ORDER BY created_at DESC
  LIMIT 1;

  IF saved_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      cleanup_token,
      'whatsapp_expiry_cleanup_token',
      'Private token for the scheduled WhatsApp expiry cleanup Edge Function',
      NULL
    );
  ELSE
    PERFORM vault.update_secret(
      saved_secret_id,
      cleanup_token,
      'whatsapp_expiry_cleanup_token',
      'Private token for the scheduled WhatsApp expiry cleanup Edge Function',
      NULL
    );
  END IF;

  INSERT INTO public.whatsapp_maintenance_secrets(name, secret_hash, updated_at)
  VALUES ('expiry_cleanup', encode(digest(convert_to(cleanup_token, 'UTF8'), 'sha256'), 'hex'), now())
  ON CONFLICT (name) DO UPDATE
    SET secret_hash = EXCLUDED.secret_hash, updated_at = now();

  SELECT id INTO saved_secret_id
  FROM vault.secrets
  WHERE name = 'whatsapp_expiry_cleanup_publishable_key'
  ORDER BY created_at DESC
  LIMIT 1;

  IF saved_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      publishable_key,
      'whatsapp_expiry_cleanup_publishable_key',
      'Publishable key used by the scheduled expiry function HTTP request',
      NULL
    );
  ELSE
    PERFORM vault.update_secret(
      saved_secret_id,
      publishable_key,
      'whatsapp_expiry_cleanup_publishable_key',
      'Publishable key used by the scheduled expiry function HTTP request',
      NULL
    );
  END IF;

  SELECT id INTO saved_secret_id
  FROM vault.secrets
  WHERE name = 'whatsapp_expiry_cleanup_project_url'
  ORDER BY created_at DESC
  LIMIT 1;

  IF saved_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      'https://qoyqfmovzvtyvxutakym.supabase.co',
      'whatsapp_expiry_cleanup_project_url',
      'Supabase project URL used by the scheduled expiry cleanup',
      NULL
    );
  ELSE
    PERFORM vault.update_secret(
      saved_secret_id,
      'https://qoyqfmovzvtyvxutakym.supabase.co',
      'whatsapp_expiry_cleanup_project_url',
      'Supabase project URL used by the scheduled expiry cleanup',
      NULL
    );
  END IF;
END $$;

DO $$
DECLARE old_job bigint;
BEGIN
  SELECT jobid INTO old_job FROM cron.job WHERE jobname = 'whatsapp-purge-expired-content';
  IF old_job IS NOT NULL THEN PERFORM cron.unschedule(old_job); END IF;

  PERFORM cron.schedule(
    'whatsapp-purge-expired-content',
    '*/5 * * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatsapp_expiry_cleanup_project_url')
          || '/functions/v1/whatsapp-expiry-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatsapp_expiry_cleanup_publishable_key'),
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatsapp_expiry_cleanup_publishable_key'),
          'x-whatsapp-cleanup-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatsapp_expiry_cleanup_token')
        ),
        body := jsonb_build_object('trigger', 'pg_cron'),
        timeout_milliseconds := 10000
      ) AS request_id;
    $job$
  );
END $$;

DROP FUNCTION IF EXISTS private.purge_expired_whatsapp_content();
NOTIFY pgrst, 'reload schema';
