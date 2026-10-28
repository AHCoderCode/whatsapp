import { createClient } from "npm:@supabase/supabase-js@2";
import webPushModule from "npm:web-push@3.6.7";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

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

async function registerAndroidToken(userId: string, body: any) {
  if (!admin) throw new Error("Push service is unavailable.");
  const token = String(body?.token || "").trim();
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new Error("The Android push token is invalid.");
  }
  const settings = body?.settings || {};
  const row = {
    user_id: userId,
    token,
    messages_enabled: boolSetting(settings, "messageNotifications", false),
    groups_enabled: boolSetting(settings, "groupNotifications", false),
    calls_enabled: boolSetting(settings, "callNotifications", false),
    updated_at: new Date().toISOString()
  };
  const { error } = await admin.from("whatsapp_android_push_tokens").upsert(row, { onConflict: "token" });
  if (error) throw error;
  return { ok: true };
}

async function unregisterAndroidToken(userId: string, body: any) {
  if (!admin) throw new Error("Push service is unavailable.");
  const token = String(body?.token || "").trim();
  if (token.length < 20 || token.length > 4096) return { ok: true };
  const { error } = await admin.from("whatsapp_android_push_tokens").delete()
    .eq("user_id", userId).eq("token", token);
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
  if (!admin || !userIds.length) return { sent: 0, stale: 0, failed: 0, subscriptions: 0 };
  const config = await getVapidConfig();
  webPush.setVapidDetails(config.subject, config.vapid_public_key, config.vapid_private_key);
  const { data, error } = await admin.from("whatsapp_push_subscriptions")
    .select("id,user_id,endpoint,subscription")
    .in("user_id", Array.from(new Set(userIds)))
    .eq(preferenceColumn, true);
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
  return { sent, stale, failed, subscriptions: subscriptions.length };
}

let cachedFirebaseToken = "";
let cachedFirebaseTokenExpiresAt = 0;
let cachedFirebaseProjectId = "";

async function getFirebaseAccessToken() {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || "";
  if (!raw) return null;
  let account: any;
  try { account = JSON.parse(raw); }
  catch (_) { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  const projectId = clean(account?.project_id, 180);
  const clientEmail = clean(account?.client_email, 255);
  const privateKeyPem = String(account?.private_key || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Firebase service-account JSON is missing project_id, client_email, or private_key.");
  }
  if (cachedFirebaseToken && cachedFirebaseTokenExpiresAt > Date.now() + 60_000 && cachedFirebaseProjectId === projectId) {
    return { accessToken: cachedFirebaseToken, projectId };
  }

  const key = await importPKCS8(privateKeyPem, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3500)
    .sign(key);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error("Google OAuth did not provide an FCM access token (HTTP " + tokenResponse.status + ").");
  }
  cachedFirebaseToken = String(tokenBody.access_token);
  cachedFirebaseTokenExpiresAt = Date.now() + Math.max(60, Number(tokenBody.expires_in || 3600)) * 1000;
  cachedFirebaseProjectId = projectId;
  return { accessToken: cachedFirebaseToken, projectId };
}

async function sendAndroidCallPushToUsers(userIds: string[], payload: any) {
  if (!admin || !userIds.length) return { sent: 0, stale: 0, failed: 0, subscriptions: 0, reason: "not-configured" };
  if (!Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")) {
    return { sent: 0, stale: 0, failed: 0, subscriptions: 0, reason: "firebase-not-configured" };
  }
  try {
    const { data, error } = await admin.from("whatsapp_android_push_tokens")
      .select("id,user_id,token")
      .in("user_id", Array.from(new Set(userIds)))
      .eq("calls_enabled", true);
    if (error) throw error;
    const tokens = data || [];
    if (!tokens.length) return { sent: 0, stale: 0, failed: 0, subscriptions: 0, reason: "no-registered-android-device" };
    const firebase = await getFirebaseAccessToken();
    if (!firebase) return { sent: 0, stale: 0, failed: 0, subscriptions: tokens.length, reason: "firebase-not-configured" };

    const d = payload?.data || {};
    const callId = String(d.callId || "");
    const callKey = callId || String(Date.now());
    const nativeData: Record<string, string> = {
      kind: "call",
      title: clean(payload?.title || "Incoming call", 120),
      body: clean(payload?.body || "Someone is calling you.", 200),
      callId,
      callerName: clean(d.callerName || String(payload?.title || "Incoming call").replace(/^Incoming call\s*[·-]\s*/i, ""), 80),
      mediaType: d.mediaType === "video" ? "video" : "audio",
      url: clean(d.url || "/", 500),
      test: d.test === true || d.test === "true" ? "true" : "false"
    };
    let sent = 0, stale = 0, failed = 0;
    await Promise.all(tokens.map(async (item: any) => {
      try {
        const response = await fetch("https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(firebase.projectId) + "/messages:send", {
          method: "POST",
          headers: { "Authorization": "Bearer " + firebase.accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: item.token,
              data: nativeData,
              android: {
                priority: "HIGH",
                ttl: "60s",
                collapse_key: "wa-call-" + callKey
              }
            }
          })
        });
        if (response.ok) { sent++; return; }
        const errorBody = await response.text().catch(() => "");
        if (response.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(errorBody)) {
          await admin.from("whatsapp_android_push_tokens").delete().eq("token", item.token);
          stale++;
          return;
        }
        failed++;
        console.error("Android FCM delivery failed:", response.status, clean(errorBody, 240));
      } catch (error: any) {
        failed++;
        console.error("Android FCM request failed:", clean(error?.message || error, 180));
      }
    }));
    return { sent, stale, failed, subscriptions: tokens.length };
  } catch (error: any) {
    console.error("Android FCM setup failed:", clean(error?.message || error, 240));
    return { sent: 0, stale: 0, failed: 1, subscriptions: 0, reason: "firebase-setup-error" };
  }
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

  const pushPayload = {
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
  };
  const webResult = await sendPushToUsers(recipientIds, preferenceColumn, pushPayload, 3600);
  const androidResult = await sendAndroidCallPushToUsers([], pushPayload);
  return { sent: webResult.sent, web: webResult, android: androidResult };
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
  const pushPayload = {
    kind: "call",
    title: "Incoming call · " + callerName,
    body: call.media_type === "video" ? "Incoming video call" : "Incoming voice call",
    tag: "wa-call-" + call.id,
    data: {
      kind: "call",
      callId: String(call.id),
      chatId: String(call.caller_id),
      callerName,
      mediaType: call.media_type === "video" ? "video" : "audio",
      url: "/?waCallId=" + encodeURIComponent(String(call.id))
    }
  };
  const [webResult, androidResult] = await Promise.all([
    sendPushToUsers([call.callee_id], "calls_enabled", pushPayload, 300),
    sendAndroidCallPushToUsers([call.callee_id], pushPayload)
  ]);
  const result = {
    sent: Number(webResult.sent || 0) + Number(androidResult.sent || 0),
    stale: Number(webResult.stale || 0) + Number(androidResult.stale || 0),
    failed: Number(webResult.failed || 0) + Number(androidResult.failed || 0),
    subscriptions: Number(webResult.subscriptions || 0) + Number(androidResult.subscriptions || 0),
    web: webResult,
    android: androidResult
  };
  // Log provider-level outcomes without logging push endpoints, tokens, or message content.
  console.info("[whatsapp-push] Incoming-call delivery result: " + JSON.stringify({
    sent: result.sent, stale: result.stale, failed: result.failed, subscriptions: result.subscriptions,
    web: { sent: Number(webResult.sent || 0), stale: Number(webResult.stale || 0), failed: Number(webResult.failed || 0), subscriptions: Number(webResult.subscriptions || 0), reason: webResult.reason || null },
    android: { sent: Number(androidResult.sent || 0), stale: Number(androidResult.stale || 0), failed: Number(androidResult.failed || 0), subscriptions: Number(androidResult.subscriptions || 0), reason: androidResult.reason || null }
  }));
  return result;
}

async function testCallPush(userId: string, requestedDelaySeconds: unknown = 0) {
  const delaySeconds = Math.max(0, Math.min(10, Math.floor(Number(requestedDelaySeconds) || 0)));
  // Let the signed-in user switch apps before dispatch, so this test checks the
  // real service-worker/OS background delivery path rather than foreground UI.
  if (delaySeconds > 0) {
    console.info("[whatsapp-push] Delaying background call test by " + delaySeconds + " seconds.");
    await new Promise<void>(resolve => setTimeout(resolve, delaySeconds * 1000));
  }
  const pushPayload = {
    kind: "call",
    title: "WhatsApp call alert test",
    body: "Background call alert test. Check sound, vibration and lock-screen display.",
    tag: "wa-call-test-" + Date.now().toString(36),
    data: { kind: "call", test: true, url: "/" }
  };
  const [webResult, androidResult] = await Promise.all([
    sendPushToUsers([userId], "calls_enabled", pushPayload, 300),
    sendAndroidCallPushToUsers([userId], pushPayload)
  ]);
  const result = {
    sent: Number(webResult.sent || 0) + Number(androidResult.sent || 0),
    stale: Number(webResult.stale || 0) + Number(androidResult.stale || 0),
    failed: Number(webResult.failed || 0) + Number(androidResult.failed || 0),
    subscriptions: Number(webResult.subscriptions || 0) + Number(androidResult.subscriptions || 0),
    web: webResult,
    android: androidResult
  };
  console.info("[whatsapp-push] Background call-test result: " + JSON.stringify({
    delaySeconds,
    sent: result.sent,
    stale: result.stale,
    failed: result.failed,
    subscriptions: result.subscriptions,
    web: { sent: Number(webResult.sent || 0), stale: Number(webResult.stale || 0), failed: Number(webResult.failed || 0), subscriptions: Number(webResult.subscriptions || 0), reason: webResult.reason || null },
    android: { sent: Number(androidResult.sent || 0), stale: Number(androidResult.stale || 0), failed: Number(androidResult.failed || 0), subscriptions: Number(androidResult.subscriptions || 0), reason: androidResult.reason || null }
  }));
  return result;
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
    if (body.action === "register-android-token") return response(await registerAndroidToken(user.id, body));
    if (body.action === "unregister-android-token") return response(await unregisterAndroidToken(user.id, body));
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
    if (body.action === "test-call-push") return response(await testCallPush(user.id, body.delaySeconds));
    return response({ error: "Unknown action." }, 400);
  } catch (error: any) {
    console.error("whatsapp-push error:", clean(error?.message || error, 300));
    return response({ error: "The notification service could not complete this request." }, 500);
  }
});