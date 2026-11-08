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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeText = (value: unknown, max = 1000) => String(value || "").trim().slice(0, max);

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (!allowedOrigin(origin)) return json({ error: "origin_not_allowed" }, 403, origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: "service_not_configured" }, 503, origin);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authentication_required" }, 401, origin);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const actorId = authData?.user?.id;
  if (authError || !actorId) return json({ error: "authentication_required" }, 401, origin);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "invalid_request" }, 400, origin); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roleRow, error: roleError } = await admin.from("whatsapp_moderator_roles")
    .select("role").eq("user_id", actorId).maybeSingle();
  if (roleError || !roleRow || !["admin", "moderator"].includes(roleRow.role)) {
    return json({ error: "moderator_access_required" }, 403, origin);
  }

  if (body.action === "list_reports") {
    const { data, error } = await admin.from("whatsapp_user_reports")
      .select("id,reporter_id,reported_user_id,chat_id,reason,details,status,created_at,reporter:aeroshell_profiles!whatsapp_user_reports_reporter_id_fkey(username,display_name),reported:aeroshell_profiles!whatsapp_user_reports_reported_user_id_fkey(username,display_name)")
      .in("status", ["submitted", "reviewing"])
      .order("created_at", { ascending: false }).limit(100);
    if (error) {
      console.error("Moderator report list failed", error.code);
      return json({ error: "moderation_query_failed" }, 500, origin);
    }
    return json({ reports: data || [] }, 200, origin);
  }

  const reportId = String(body.reportId || "");
  if (reportId && !uuidPattern.test(reportId)) return json({ error: "invalid_report_id" }, 400, origin);
  const reason = safeText(body.reason, 1000);
  const action = String(body.action || "");

  if (action === "mark_reviewing" || action === "resolve_report" || action === "dismiss_report") {
    if (!reportId) return json({ error: "report_id_required" }, 400, origin);
    const status = action === "mark_reviewing" ? "reviewing" : action === "resolve_report" ? "resolved" : "dismissed";
    const { data: report, error: reportError } = await admin.from("whatsapp_user_reports")
      .update({ status }).eq("id", reportId).select("id,reported_user_id").maybeSingle();
    if (reportError || !report) return json({ error: "report_update_failed" }, 404, origin);
    const { error: auditError } = await admin.from("whatsapp_moderation_actions").insert({
      actor_user_id: actorId, target_user_id: report.reported_user_id, report_id: reportId,
      action_type: action, reason,
    });
    if (auditError) console.error("Moderation audit write failed", auditError.code);
    return json({ success: true }, 200, origin);
  }

  if (action === "restrict_messaging") {
    const targetUserId = String(body.targetUserId || "");
    const durationHours = Number(body.durationHours);
    if (!uuidPattern.test(targetUserId) || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720 || reason.length < 3) {
      return json({ error: "invalid_restriction" }, 400, origin);
    }
    const restrictedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from("whatsapp_user_restrictions").upsert({
      user_id: targetUserId, reason, restricted_until: restrictedUntil,
      created_by: actorId, updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: "restriction_failed" }, 500, origin);
    const { error: auditError } = await admin.from("whatsapp_moderation_actions").insert({
      actor_user_id: actorId, target_user_id: targetUserId, report_id: reportId || null,
      action_type: action, reason, restricted_until: restrictedUntil,
    });
    if (auditError) console.error("Moderation audit write failed", auditError.code);
    return json({ success: true, restrictedUntil }, 200, origin);
  }

  if (action === "restore_messaging") {
    const targetUserId = String(body.targetUserId || "");
    if (!uuidPattern.test(targetUserId)) return json({ error: "invalid_user_id" }, 400, origin);
    const { error } = await admin.from("whatsapp_user_restrictions").delete().eq("user_id", targetUserId);
    if (error) return json({ error: "restriction_restore_failed" }, 500, origin);
    const { error: auditError } = await admin.from("whatsapp_moderation_actions").insert({
      actor_user_id: actorId, target_user_id: targetUserId, report_id: reportId || null,
      action_type: action, reason,
    });
    if (auditError) console.error("Moderation audit write failed", auditError.code);
    return json({ success: true }, 200, origin);
  }

  return json({ error: "invalid_action" }, 400, origin);
});
