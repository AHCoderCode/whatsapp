DROP POLICY IF EXISTS "Service role can read cleanup token hash"
  ON public.whatsapp_maintenance_secrets;
CREATE POLICY "Service role can read cleanup token hash"
  ON public.whatsapp_maintenance_secrets
  FOR SELECT TO service_role USING (true);
