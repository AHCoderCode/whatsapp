import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE = "https://whatsapp-for.vercel.app";
const allowedOrigin = (origin: string | null) => !origin ||
  origin === SITE ||
  /^https:\/\/whatsapp-for-[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
  origin === "http://localhost:8080" ||
  origin === "http://127.0.0.1:8080";
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};
const usernamePattern = /^[a-z0-9_]{3,20}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (!allowedOrigin(origin)) return json({ error: "origin_not_allowed" }, 403, origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: "service_not_configured" }, 503, origin);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "invalid_request" }, 400, origin); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "create") {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "authentication_required" }, 401, origin);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const userId = authData?.user?.id;
    if (authError || !userId) return json({ error: "authentication_required" }, 401, origin);

    const recoveryCode = hex(crypto.getRandomValues(new Uint8Array(32)));
    const codeHash = await digest(recoveryCode);
    const { error } = await admin.from("whatsapp_account_recovery_codes").upsert({
      user_id: userId, code_hash: codeHash, created_at: new Date().toISOString(),
      used_at: null, failed_attempts: 0, locked_until: null,
    });
    if (error) {
      console.error("Recovery-code creation failed", error.code);
      return json({ error: "recovery_code_creation_failed" }, 500, origin);
    }
    return json({ success: true, recoveryCode }, 200, origin);
  }

  if (body.action === "recover") {
    const username = String(body.username || "").trim().replace(/^@+/, "").toLowerCase();
    const recoveryCode = String(body.recoveryCode || "").trim().toLowerCase();
    const newPassword = String(body.newPassword || "");
    if (!usernamePattern.test(username) || !/^[0-9a-f]{64}$/.test(recoveryCode) || newPassword.length < 10 || newPassword.length > 128) {
      return json({ error: "recovery_failed" }, 400, origin);
    }

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await digest("whatsapp-recovery-ip:v1:" + ip);
    const { data: allowed, error: limitError } = await admin.rpc("whatsapp_consume_recovery_ip_limit", { p_ip_hash: ipHash });
    if (limitError || allowed !== true) return json({ error: "recovery_rate_limited" }, 429, origin);

    const { data: profile, error: profileError } = await admin.from("aeroshell_profiles")
      .select("id").eq("username", username).maybeSingle();
    if (profileError || !profile?.id || !uuidPattern.test(String(profile.id))) return json({ error: "recovery_failed" }, 400, origin);
    const userId = String(profile.id);

    const { data: stored, error: storedError } = await admin.from("whatsapp_account_recovery_codes")
      .select("code_hash,used_at,failed_attempts,locked_until").eq("user_id", userId).maybeSingle();
    if (storedError || !stored || stored.used_at || (stored.locked_until && new Date(stored.locked_until).getTime() > Date.now())) {
      return json({ error: "recovery_failed" }, 400, origin);
    }

    const submittedHash = await digest(recoveryCode);
    if (!constantTimeEqual(submittedHash, String(stored.code_hash || ""))) {
      const nextAttempts = Math.min(5, Number(stored.failed_attempts || 0) + 1);
      const patch: Record<string, unknown> = { failed_attempts: nextAttempts };
      if (nextAttempts >= 5) patch.locked_until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await admin.from("whatsapp_account_recovery_codes").update(patch).eq("user_id", userId).is("used_at", null);
      return json({ error: "recovery_failed" }, 400, origin);
    }

    const { data: claimed, error: claimError } = await admin.from("whatsapp_account_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId).is("used_at", null)
      .or("locked_until.is.null,locked_until.lt." + new Date().toISOString())
      .select("user_id").maybeSingle();
    if (claimError || !claimed) return json({ error: "recovery_failed" }, 400, origin);

    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (passwordError) {
      await admin.from("whatsapp_account_recovery_codes").update({ used_at: null }).eq("user_id", userId);
      console.error("Recovery password update failed", passwordError.message);
      return json({ error: "recovery_failed" }, 500, origin);
    }

    const { error: revokeError } = await admin.rpc("whatsapp_revoke_auth_sessions", { p_user_id: userId });
    if (revokeError) console.error("Recovery session revocation failed", revokeError.message);
    return json({ success: true, sessionsRevoked: !revokeError }, 200, origin);
  }

  return json({ error: "invalid_action" }, 400, origin);
});
