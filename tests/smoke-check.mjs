import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const files = {
  app: read("app.js"),
  backend: read("backend.js"),
  calls: read("calls.js"),
  sw: read("sw.js"),
  html: read("index.html"),
  css: read("styles.css"),
  manifest: read("manifest.webmanifest"),
  push: read("supabase/functions/whatsapp-push/index.ts"),
  pushMigration: read("supabase/migrations/20261028123000_whatsapp_device_push_notifications.sql"),
  deviceMigration: read("supabase/migrations/20261028130000_whatsapp_linked_devices.sql")
};
let passed = 0;
let failed = 0;
function check(name, run) {
  try {
    run();
    passed++;
    console.log("PASS " + name);
  } catch (error) {
    failed++;
    console.error("FAIL " + name + ": " + (error?.message || error));
  }
}
function includes(source, value, message) {
  assert.ok(source.includes(value), message || "missing expected source: " + value);
}
function excludes(source, value, message) {
  assert.ok(!source.includes(value), message || "unexpected source found: " + value);
}

for (const [name, source] of [["app.js",files.app],["backend.js",files.backend],["calls.js",files.calls],["sw.js",files.sw]]) {
  check(name + " JavaScript parses", () => new Script(source, { filename: name }));
}
check("inline HTML scripts parse", () => {
  const scripts = [...files.html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.ok(scripts.length >= 2);
  scripts.forEach((source, index) => new Script(source, { filename: "index-inline-" + index }));
});
check("manifest is valid JSON", () => JSON.parse(files.manifest));
check("CSS braces balance", () => assert.equal((files.css.match(/{/g)||[]).length, (files.css.match(/}/g)||[]).length));
check("current asset version is shared by HTML and service worker", () => {
  includes(files.html, "whatsapp-final-20261028l");
  includes(files.sw, "whatsapp-final-20261028l");
  includes(files.manifest, "whatsapp-final-20261028l");
  includes(files.sw, "whatsapp-final-shell-v41");
});
check("legacy ESC compatibility aliases exist as browser globals", () => {
  includes(files.html, "var ESC = window.ESC = window.ESC || function");
  includes(files.html, "var Escape = window.Escape = window.Escape || ESC");
  includes(files.html, "var icon = window.icon = window.icon || function");
  includes(files.app, "window.ESC = window.ESC || esc");
});
check("checkmark icons use outlined strokes and blue read-state styling", () => {
  includes(files.html, 'id="i-checks" viewBox="0 0 24 24"><path');
  includes(files.html, 'fill="none" stroke="currentColor"');
  includes(files.app, 'icon(isRead?"checks":"check")');
  includes(files.css, ".message-meta .message-read-status svg{fill:none!important;stroke:currentColor!important");
  includes(files.css, ".message-meta .message-read-status.is-read svg{color:#078ee8!important}");
});
check("startup notification onboarding registers all device push preferences", () => {
  includes(files.app, "async function promptNotificationSetup()");
  includes(files.app, "async function enableNotificationsFromPrompt()");
  includes(files.app, "messageNotifications:true,groupNotifications:true,callNotifications:true");
  includes(files.app, 'if(action==="enable-notifications"){void enableNotificationsFromPrompt();return;}');
  includes(files.backend, "promptNotificationSetup();},650)");
  includes(files.backend, "async function enableDevicePush(");
});
check("foreground notifications still show when another chat is open", () => {
  includes(files.backend, 'const appIsFocused=document.visibilityState==="visible"&&document.hasFocus();');
  includes(files.backend, 'if(!appIsFocused&&"serviceWorker" in navigator&&"PushManager" in window)');
});
check("online/offline presence is tracked and reflected in direct chats", () => {
  includes(files.backend, "function subscribePresence(userId)");
  includes(files.backend, '.on("presence",{event:"sync"},reconcile)');
  includes(files.backend, 'channel.track({user_id:String(userId),online:true');
  includes(files.app, 'chat.online ? "online" : "offline"');
});
check("call setup has bounded permission/relay/signaling waits", () => {
  includes(files.calls, "async function userMediaWithTimeout(video,ms=20000)");
  includes(files.calls, "function withCallTimeout(promise,ms,message)");
  includes(files.calls, "Preparing the secure relay…");
  includes(files.calls, "callSetupTimer=setTimeout(");
});
check("optional feed failures cannot hide direct chats", () => {
  includes(files.backend, "if(profileResult.error)throw profileResult.error;");
  includes(files.backend, 'console.warn("Optional WhatsApp data could not load ("+label+"):"');
  includes(files.backend, "const relations=requestResult.error?[]:(requestResult.data||[]);");
  includes(files.backend, "const directMessagePeers=");
});
check("voice recorder exposes explicit discard/send and live audio levels", () => {
  includes(files.backend, "data-wa-recording-action='cancel'");
  includes(files.backend, "data-wa-recording-action='send'");
  includes(files.backend, "createMediaStreamSource(recorderStream).connect(recorderAnalyser)");
  includes(files.backend, 'if(stopReason==="cancel"){say("Voice message discarded.");return;}');
  includes(files.css, ".wa-recording-bar{");
  includes(files.css, ".wa-recording-waveform i.active");
});
check("incoming read receipts update visible blue ticks immediately", () => {
  includes(files.backend, 'table:"aeroshell_message_reads"},event=>{');
  includes(files.backend, 'if(message)message.status="read"');
});
check("settings startup uses querySelectorAll for its forEach loop", () => {
  const line = files.app.split(String.fromCharCode(10)).find(line => line.includes("#app-screen input,#app-screen textarea,[contenteditable='true']"));
  assert.ok(line, "applySettings field selector is present");
  assert.ok(line.trimStart().startsWith(String.fromCharCode(36).repeat(2)+"("), "field loop must use the querySelectorAll helper");
  assert.ok(!line.trimStart().startsWith(String.fromCharCode(36)+"("), "single-element querySelector must not be used with forEach");
});
check("Linked devices uses the backend bridge icon helper", () => {
  const line = files.backend.split(String.fromCharCode(10)).find(line => line.includes('icon("monitor")'));
  assert.ok(line && line.includes('bridge.icon("monitor")'), "Linked devices must call bridge.icon");
  assert.ok(!line || !line.includes('+icon("monitor")'), "undefined icon() call must not remain");
});
check("profile photo and About have independent editing actions", () => {
  includes(files.app, "data-action='change-profile-photo'");
  includes(files.app, "function editAboutDialog()");
  includes(files.app, "data-action='edit-about'");
  includes(files.backend, 'dialogAction==="save-about"');
});
check("new accounts can start a chat from the empty state", () => {
  includes(files.app, "wa-empty-actions");
  includes(files.app, "data-action='new-chat'>Find people");
  includes(files.app, "data-action='new-group'>Create group");
});
check("old recursive shared menu branch is absent", () => excludes(files.app, 'if(action==="broadcast-list"||action==="linked-devices"||action==="mark-all-read"'));
check("menu actions route to concrete handlers", () => {
  includes(files.app, '["linked-devices","mark-all-read","install-app"');
  includes(files.app, 'if(action==="linked-devices"){');
});
check("touch tap highlight and long-press text selection are suppressed", () => {
  includes(files.css, "-webkit-tap-highlight-color:transparent");
  includes(files.css, "user-select:none");
});
check("keyboard-visible focus is preserved", () => includes(files.css, "button:focus-visible"));
check("URLs in messages are safely linkified", () => {
  includes(files.app, "function linkifyText(value)");
  includes(files.app, "rel='noopener noreferrer'");
  includes(files.app, "linkifyText(message.text)");
});
check("backend defines the attachment escaping helper used before voice playback", () => {
  includes(files.backend, 'const esc = value => bridge.escapeHTML(String(value == null ? "" : value));');
  includes(files.backend, 'name=esc(message.attachmentName||"Attachment")');
});

check("message long-press waits two seconds and a held voice note cannot start playback", () => {
  includes(files.app, 'event.target.closest(".message-attachment-open.voice-message-open")');
  includes(files.app, "},2000);");
  includes(files.app, "let messageHoldTriggeredRow = null;");
  includes(files.app, "if(audio&&!audio.paused)audio.pause();");
  includes(files.app, "Run at document capture before backend.js handles a voice attachment click.");
  includes(files.app, "#message-selection-toolbar,#message-reaction-picker,#popup-menu,#dialog-backdrop");
  includes(files.app, "dismissMessageSelection(false);");
});
check("locked-screen call alerts repeat and delayed incoming calls are not dropped after 45 seconds", () => {
  includes(files.calls, "callPushReminderTimer");
  includes(files.calls, "},12000);");
  includes(files.calls, 'body:{action:"notify-call",callId:expectedId}');
  excludes(files.calls, "Date.now()-Date.parse(row.created_at)>45000");
  excludes(files.calls, "Date.now()-Date.parse(data.created_at)>45000");
  excludes(files.calls, "Date.now()-Date.parse(call.created_at)>45000");
  includes(files.sw, "requireInteraction: kind === \"call\"");
  includes(files.sw, "silent: false");
});
check("incoming call ringtones support a persistent custom MP3 and a loud built-in tone", () => {
  includes(files.app, '["phone","Ringtone","Choose a built-in tone or select an MP3 for incoming calls.","ringer"]');
  includes(files.app, "id='wa-ringtone-file-input'");
  includes(files.app, "data-action='preview-ringtone'");
  includes(files.app, "data-action='select-ringtone-file'");
  includes(files.calls, 'indexedDB.open(RINGTONE_DB_NAME,1)');
  includes(files.calls, 'async function setCustomRingtone(file)');
  includes(files.calls, 'function createBuiltInRingtone()');
  includes(files.calls, 'function stopIncomingRingtone()');
  includes(files.calls, 'setRingtoneVolume,');
});
check("incoming calls start ringing and the top Accept action queues until the offer arrives", () => {
  includes(files.calls, 'void startIncomingRingtone();');
  includes(files.calls, 'pendingNotificationAction={kind:"call",callId:String(activeCall.id),action:"accept"}');
  includes(files.calls, "data-wa-call='accept' aria-label='Accept call'>Accept</button>");
  assert.ok(!files.calls.includes('(waiting?"disabled":"")'), "Accept must remain available while the caller prepares the offer");
  includes(files.calls, 'stopIncomingRingtone();');
});
check("call notifications request an audible, vibrating alert and show actionable details", () => {
  includes(files.sw, 'silent: false');
  includes(files.sw, 'vibrate: kind === "call"');
  includes(files.sw, 'actions: kind === "call"');
  includes(files.calls, 'vibrate:[1200,350,1200,350,1600]');
});
check("notification onboarding prompt is only scheduled once per hydration", () => {
  assert.equal((files.backend.match(/promptNotificationSetup\(\);\},650/g)||[]).length, 1);
});


check("startup screen always exits when auth bootstrap stalls", () => {
  includes(files.backend, "withTimeout(db.auth.getSession(),12000");
  includes(files.backend, "withTimeout(hydrate(data.session.user),18000");
  includes(files.backend, 'window.dispatchEvent(new Event("wa-startup-finished"))');
  includes(files.html, "var startupWatchdog=window.setTimeout");
  includes(files.html, "wa-startup-retry");
});
check("custom ringtone gain supports 300 percent and loops until call state changes", () => {
  includes(files.calls, "value>=25&&value<=300?value:300");
  includes(files.calls, "gain.gain.value=getRingtoneVolume()/100");
  includes(files.calls, "audio.loop=true");
  includes(files.calls, "Keep incoming audio looping until answered or ended.");
  excludes(files.calls, "No answer. Call ended after 45 seconds.");
  includes(files.app, "max='300'");
});

check("voice notes use inline audio playback", () => {
  includes(files.backend, "wa-inline-voice-audio");
  includes(files.backend, "createSignedUrl(message.attachmentPath,120)");
  includes(files.backend, 'action==="open-attachment"');
});
check("read receipt setting prevents database reads when disabled", () => includes(files.backend, "if(settings.readReceipts===false)return;"));
check("read ticks have distinct grey and blue states", () => {
  includes(files.css, ".message-read-status.is-read");
  includes(files.css, ".message-read-status:not(.is-read)");
  includes(files.app, 'const isRead=message.status==="read"');
  includes(files.app, 'icon(isRead?"checks":"check")');
});
check("message date separators distinguish today and yesterday", () => {
  includes(files.app, 'return "TODAY"');
  includes(files.app, 'return "YESTERDAY"');
});
check("notification opt-in requests browser permission", () => includes(files.app, "Notification.requestPermission()"));
check("message notification preferences are mapped to persisted settings", () => {
  includes(files.app, "messageNotifications:false,groupNotifications:false,callNotifications:false");
  includes(files.app, "window.waBackendEnablePush(state.settings)");
});
check("push subscriptions are registered through Supabase", () => {
  includes(files.backend, 'action:"public-key"');
  includes(files.backend, 'action:"subscribe"');
  includes(files.backend, "pushManager.subscribe");
});
check("sender triggers push for inserted messages", () => includes(files.backend, 'dispatchServerPush("notify-message",{messageId:data.id})'));
check("poll and event messages also trigger background notifications", () => {
  const count = files.backend.split('dispatchServerPush("notify-message"').length - 1;
  assert.ok(count >= 5, "text, forwarded, attachment/voice, poll and event messages should trigger push");
  includes(files.backend, 'say("Poll sent.');
  const eventStart = files.backend.indexOf("async function sendEvent");
  const eventEnd = files.backend.indexOf("async function respondToEvent", eventStart);
  assert.ok(eventStart >= 0 && eventEnd > eventStart, "event-send handler must exist");
  includes(files.backend.slice(eventStart, eventEnd), 'dispatchServerPush("notify-message",{messageId:message.id})');
});
check("push Edge Function authenticates users and validates message ownership", () => {
  includes(files.push, "admin.auth.getUser(token)");
  includes(files.push, 'message.sender_id !== userId');
  includes(files.push, 'call.caller_id !== userId');
});
check("push Edge Function sends Web Push requests", () => {
  includes(files.push, "webPush.sendNotification");
  includes(files.push, 'preferenceColumn === "calls_enabled"');
});
check("push and click events are handled by the service worker", () => {
  includes(files.sw, 'self.addEventListener("push"');
  includes(files.sw, 'self.addEventListener("notificationclick"');
  includes(files.sw, 'target.searchParams.set("waPushAction", action)');
});
check("incoming calls have an early top banner with accept/decline", () => {
  includes(files.calls, "wa-incoming-call-banner");
  includes(files.calls, "data-wa-call='accept'");
  includes(files.calls, "data-wa-call='decline'");
});
check("call row is created before asking for microphone or camera permission", () => {
  const start = files.calls.indexOf("async function startCall");
  const insert = files.calls.indexOf('from("aeroshell_calls").insert', start);
  const mediaPrompt = files.calls.indexOf('await userMediaWithTimeout(mediaType==="video",20000)', start);
  assert.ok(start >= 0 && insert > start && mediaPrompt > insert);
});
check("call notification action can be queued until offer arrives", () => {
  includes(files.calls, "runPendingNotificationAction");
  includes(files.calls, "handleNotificationAction");
});
check("background call alerts always show, retry transient push errors, and can be tested", () => {
  includes(files.sw, "if (kind !== \"call\" && clients.some");
  includes(files.sw, "const isCallTest = kind === \"call\" && data.test === true");
  includes(files.push, 'body.action === "test-call-push"');
  includes(files.push, "attempt < 2");
  includes(files.push, "urgency: preferenceColumn === \"calls_enabled\" ? \"high\" : \"normal\"");
  includes(files.push, "Background call-alert test.");
  includes(files.app, '["phone","Test call alert"');
  includes(files.app, 'if(title==="Test call alert")');
  includes(files.backend, "window.waBackendTestCallPush=testCallPush;");
});
check("audio calls provide speaker-volume, mute and end controls", () => {
  includes(files.calls, "data-wa-call='speaker'");
  includes(files.calls, "data-wa-call='mute'");
  includes(files.calls, "data-wa-call='end'");
});
check("landscape phone layout focuses the open conversation", () => {
  includes(files.app, "mobile-landscape");
  includes(files.css, ".mobile-landscape.mobile-conversation-open .chat-sidebar");
});
check("linked devices are registered and can be revoked in Supabase", () => {
  includes(files.backend, 'from("whatsapp_linked_devices")');
  includes(files.backend, "async function revokeLinkedDevice");
  includes(files.backend, "setInterval(async()");
});
check("push tables are protected with row-level security", () => {
  includes(files.pushMigration, "enable row level security");
  includes(files.pushMigration, "revoke all on table");
});
check("linked device records have per-user RLS policies", () => {
  includes(files.deviceMigration, "auth.uid() = user_id");
  includes(files.deviceMigration, "whatsapp_linked_devices_update_own");
});
check("Supabase profile edit is intercepted by backend update", () => {
  includes(files.backend, 'dialogAction==="save-profile"');
  includes(files.backend, "async function updateProfile");
});
check("communities have real create and membership functions", () => {
  includes(files.backend, "async function createCommunity");
  includes(files.backend, "async function setCommunityMembership");
});
console.log("\n" + passed + " passed, " + failed + " failed.");
if (failed) process.exitCode = 1;
