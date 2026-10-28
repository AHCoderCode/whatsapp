import { createClient } from "npm:@supabase/supabase-js@2";
import webPushModule from "npm:web-push@3.6.7";

const webPush: any = (webPushModule as any).default || webPushModule;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!serviceKey && secretKeysRaw) {
  try { serviceKey = JSON.parse(secretKeysRaw).default || ""; } catch (_) {}
}
const admin = SUPABASE_URL && serviceKey
  ? createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max = 180) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const readBody = async (req: Request) => {
  try { return await req.json(); } catch (_) { return null; }
};

async function authenticate(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!admin || !token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
}

async function getVapidConfig() {
  if (!admin) throw new Error("Push service is not configured with a Supabase service key.");
  const existing = await admin.from("whatsapp_push_config")
    .select("id,vapid_public_key,vapid_private_key,subject").eq("id", 1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const generated = webPush.generateVAPIDKeys();
  const candidate = {
    id: 1,
    vapid_public_key: generated.publicKey,
    vapid_private_key: generated.privateKey,
    subject: "mailto:notifications@whatsapp-for.vercel.app"
  };
  // Insert-only is deliberate: concurrent first requests must not replace the key pair
  // after another device has already received the original public key.
  const inserted = await admin.from("whatsapp_push_config").insert(candidate);
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  const reread = await admin.from("whatsapp_push_config")
    .select("id,vapid_public_key,vapid_private_key,subject").eq("id", 1).single();
  if (reread.error || !reread.data) throw reread.error || new Error("Could not initialize push signing keys.");
  return reread.data;
}

function boolSetting(settings: any, key: string, fallback: boolean) {
  return typeof settings?.[key] === "boolean" ? settings[key] : fallback;
}

async function subscribeUser(userId: string, body: any) {
  if (!admin) throw new Error("Push service is unavailable.");
  const sub = body?.subscription;
  const endpoint = clean(sub?.endpoint, 2048);
  if (!endpoint.startsWith("https://") || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error("The browser returned an invalid push subscription.");
  }
  const settings = body?.settings || {};
  const row = {
    user_id: userId,
    endpoint,
    subscription: sub,
    messages_enabled: boolSetting(settings, "messageNotifications", false),
    groups_enabled: boolSetting(settings, "groupNotifications", false),
    calls_enabled: boolSetting(settings, "callNotifications", false),
    updated_at: new Date().toISOString()
  };
  const { error } = await admin.from("whatsapp_push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) throw error;
  return { ok: true };
}

async function updatePreferences(userId: string, body: any) {
  if (!admin) throw new Error("Push service is unavailable.");
  const endpoint = clean(body?.endpoint, 2048);
  if (!endpoint.startsWith("https://")) throw new Error("The browser push endpoint is invalid.");
  const settings = body?.settings || {};
  const patch = {
    messages_enabled: boolSetting(settings, "messageNotifications", false),
    groups_enabled: boolSetting(settings, "groupNotifications", false),
    calls_enabled: boolSetting(settings, "callNotifications", false),
    updated_at: new Date().toISOString()
  };
  const { error } = await admin.from("whatsapp_push_subscriptions")
    .update(patch).eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw error;
  return { ok: true };
}

async function sendPushToUsers(
  userIds: string[],
  preferenceColumn: "messages_enabled" | "groups_enabled" | "calls_enabled",
  payload: any,
  ttl: number
) {
  if (!admin || !userIds.length) return { sent: 0, stale: 0 };
  const config = await getVapidConfig();
  webPush.setVapidDetails(config.subject, config.vapid_public_key, config.vapid_private_key);
  let query = admin.from("whatsapp_push_subscriptions")
    .select("id,user_id,endpoint,subscription")
    .in("user_id", Array.from(new Set(userIds)))
    .eq(preferenceColumn, true);
  const { data, error } = await query;
  if (error) throw error;
  const subscriptions = data || [];
  let sent = 0, stale = 0, failed = 0;
  const jobs = subscriptions.map(async (item: any) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await webPush.sendNotification(item.subscription, JSON.stringify(payload), {
          TTL: ttl,
          urgency: preferenceColumn === "calls_enabled" ? "high" : "normal"
        });
        sent++;
        return;
      } catch (error: any) {
        const status = Number(error?.statusCode || error?.status || 0);
        if (status === 404 || status === 410) {
          await admin.from("whatsapp_push_subscriptions").delete().eq("endpoint", item.endpoint);
          stale++;
          return;
        }
        if (attempt === 0 && (status === 0 || status === 408 || status === 429 || status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, 350));
          continue;
        }
        failed++;
        console.error("Web Push delivery failed:", status || "unknown", clean(error?.message, 180));
        return;
      }
    }
  });
  await Promise.allSettled(jobs);
  return { sent, stale, failed };
}

async function notifyMessage(userId: string, body: any) {
  if (!admin) throw new Error("Push service is unavailable.");
  const messageId = String(body?.messageId || "");
  if (!uuidPattern.test(messageId)) throw new Error("A valid message ID is required.");
  const { data: message, error } = await admin.from("aeroshell_messages")
    .select("id,sender_id,recipient_id,group_id,body,message_type,attachment_name,created_at")
    .eq("id", messageId).maybeSingle();
  if (error) throw error;
  if (!message || message.sender_id !== userId) return { sent: 0, reason: "message-not-owned" };

  const { data: sender } = await admin.from("aeroshell_profiles")
    .select("id,username,display_name").eq("id", userId).maybeSingle();
  const senderName = clean(sender?.display_name || sender?.username || "New message", 80);
  const messageText = message.message_type === "voice" ? "🎤 Voice message"
    : message.message_type === "file" ? "📎 " + clean(message.attachment_name || "Attachment", 100)
    : clean(message.body || "New message", 180);

  let recipientIds: string[] = [];
  let title = senderName;
  let notificationBody = messageText;
  let chatId = message.sender_id;
  let preferenceColumn: "messages_enabled" | "groups_enabled" = "messages_enabled";
  if (message.recipient_id) {
    recipientIds = [message.recipient_id];
  } else if (message.group_id) {
    const [membersResult, groupResult] = await Promise.all([
      admin.from("aeroshell_group_members").select("user_id").eq("group_id", message.group_id),
      admin.from("aeroshell_groups").select("name").eq("id", message.group_id).maybeSingle()
    ]);
    if (membersResult.error) throw membersResult.error;
    recipientIds = (membersResult.data || []).map((row: any) => row.user_id).filter((id: string) => id !== userId);
    title = clean(groupResult.data?.name || "Group message", 80);
    notificationBody = senderName + ": " + messageText;
    chatId = message.group_id;
    preferenceColumn = "groups_enabled";
  } else {
    return { sent: 0, reason: "no-recipient" };
  }

  return await sendPushToUsers(recipientIds, preferenceColumn, {
    kind: "message",
    title,
    body: notificationBody.slice(0, 200),
    tag: "wa-message-" + message.id,
    data: {
      kind: "message",
      messageId: message.id,
      chatId: String(chatId),
      url: "/?waChatId=" + encodeURIComponent(String(chatId))
    }
  }, 3600);
}

async function notifyCall(userId: string, body: any) {
  if (!admin) throw new Error("Push service is unavailable.");
  const callId = String(body?.callId || "");
  if (!uuidPattern.test(callId)) throw new Error("A valid call ID is required.");
  const { data: call, error } = await admin.from("aeroshell_calls")
    .select("id,caller_id,callee_id,status,media_type,group_call_id,created_at")
    .eq("id", callId).maybeSingle();
  if (error) throw error;
  if (!call || call.caller_id !== userId || call.status !== "ringing" || call.group_call_id) {
    return { sent: 0, reason: "call-not-active" };
  }
  const { data: caller } = await admin.from("aeroshell_profiles")
    .select("id,username,display_name").eq("id", userId).maybeSingle();
  const callerName = clean(caller?.display_name || caller?.username || "Contact", 80);
  return await sendPushToUsers([call.callee_id], "calls_enabled", {
    kind: "call",
    title: "Incoming call · " + callerName,
    body: call.media_type === "video" ? "Incoming video call" : "Incoming voice call",
    tag: "wa-call-" + call.id,
    data: {
      kind: "call",
      callId: String(call.id),
      chatId: String(call.caller_id),
      url: "/?waCallId=" + encodeURIComponent(String(call.id))
    }
  }, 300);
}

async function testCallPush(userId: string) {
  return await sendPushToUsers([userId], "calls_enabled", {
    kind: "call",
    title: "WhatsApp call alert test",
    body: "Background call-alert test. Check notification sound, vibration and lock-screen display.",
    tag: "wa-call-test-" + Date.now().toString(36),
    data: { kind: "call", test: true, url: "/" }
  }, 300);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);
  if (!admin) return response({ error: "The push service is missing its Supabase server key." }, 503);
  const user = await authenticate(req);
  if (!user) return response({ error: "Sign in before using device notifications." }, 401);
  const body = await readBody(req);
  if (!body || typeof body.action !== "string") return response({ error: "Invalid request." }, 400);
  try {
    if (body.action === "public-key") {
      const config = await getVapidConfig();
      return response({ publicKey: config.vapid_public_key });
    }
    if (body.action === "subscribe") return response(await subscribeUser(user.id, body));
    if (body.action === "preferences") return response(await updatePreferences(user.id, body));
    if (body.action === "unsubscribe") {
      const endpoint = clean(body.endpoint, 2048);
      if (endpoint.startsWith("https://")) {
        const { error } = await admin.from("whatsapp_push_subscriptions").delete()
          .eq("user_id", user.id).eq("endpoint", endpoint);
        if (error) throw error;
      }
      return response({ ok: true });
    }
    if (body.action === "notify-message") return response(await notifyMessage(user.id, body));
    if (body.action === "notify-call") return response(await notifyCall(user.id, body));
    if (body.action === "test-call-push") return response(await testCallPush(user.id));
    return response({ error: "Unknown action." }, 400);
  } catch (error: any) {
    console.error("whatsapp-push error:", clean(error?.message || error, 300));
    return response({ error: "The notification service could not complete this request." }, 500);
  }
});
