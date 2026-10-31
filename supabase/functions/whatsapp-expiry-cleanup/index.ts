import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://whatsapp-for.vercel.app",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-whatsapp-cleanup-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const suppliedToken = request.headers.get("x-whatsapp-cleanup-token") || "";
  if (!/^[a-f0-9]{64}$/i.test(suppliedToken)) return respond({ error: "forbidden" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: "cleanup_service_unavailable" }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(suppliedToken)));
    const { data: tokenRow, error: tokenError } = await admin.from("whatsapp_maintenance_secrets")
      .select("secret_hash").eq("name", "expiry_cleanup").maybeSingle();
    if (tokenError || !tokenRow?.secret_hash || tokenRow.secret_hash !== digest) {
      return respond({ error: "forbidden" }, 403);
    }

    const cutoff = new Date().toISOString();
    const [statuses, messages] = await Promise.all([
      admin.from("whatsapp_statuses").select("id,media_path").lte("expires_at", cutoff).limit(500),
      admin.from("aeroshell_messages").select("id,attachment_path").not("expires_at", "is", null).lte("expires_at", cutoff).limit(1000)
    ]);
    if (statuses.error) throw statuses.error;
    if (messages.error) throw messages.error;

    const paths = Array.from(new Set([
      ...(statuses.data || []).map(row => row.media_path),
      ...(messages.data || []).map(row => row.attachment_path)
    ].filter((path): path is string => typeof path === "string" && path.length > 0)));

    let removedFiles = 0;
    for (let offset = 0; offset < paths.length; offset += 100) {
      const batch = paths.slice(offset, offset + 100);
      const { data, error } = await admin.storage.from("master-chat-attachments").remove(batch);
      if (error) throw error;
      removedFiles += (data || []).length;
    }

    const [removedStatuses, removedMessages] = await Promise.all([
      admin.from("whatsapp_statuses").delete().lte("expires_at", cutoff).select("id"),
      admin.from("aeroshell_messages").delete().not("expires_at", "is", null).lte("expires_at", cutoff).select("id")
    ]);
    if (removedStatuses.error) throw removedStatuses.error;
    if (removedMessages.error) throw removedMessages.error;

    // Close abandoned group-call sessions after four hours so crashed or
    // disconnected initiators cannot leave permanent active invitations.
    const staleCallCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const staleCalls = await admin.from("aeroshell_group_calls")
      .update({ status: "ended", ended_at: cutoff })
      .eq("status", "active")
      .lt("created_at", staleCallCutoff)
      .select("id");
    if (staleCalls.error) throw staleCalls.error;
    const staleCallIds = (staleCalls.data || []).map(row => row.id);
    if (staleCallIds.length) {
      const closedParticipants = await admin.from("aeroshell_group_call_participants")
        .update({ status: "left", responded_at: cutoff })
        .in("group_call_id", staleCallIds)
        .in("status", ["invited", "accepted"]);
      if (closedParticipants.error) throw closedParticipants.error;
    }

    return respond({
      ok: true,
      cutoff,
      statusesDeleted: (removedStatuses.data || []).length,
      messagesDeleted: (removedMessages.data || []).length,
      storageObjectsRemoved: removedFiles,
      staleGroupCallsEnded: staleCallIds.length
    });
  } catch (error) {
    console.error("[whatsapp-expiry-cleanup] failed:", String((error as Error)?.message || error));
    return respond({ error: "cleanup_failed" }, 500);
  }
});
