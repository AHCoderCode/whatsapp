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
  includes(files.html, "whatsapp-final-20261028e");
  includes(files.sw, "whatsapp-final-20261028e");
  includes(files.manifest, "whatsapp-final-20261028e");
  includes(files.sw, "whatsapp-final-shell-v34");
});
check("legacy ESC compatibility alias exists", () => includes(files.html, "window.ESC=window.ESC||function"));
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
check("voice notes use inline audio playback", () => {
  includes(files.backend, "wa-inline-voice-audio");
  includes(files.backend, "createSignedUrl(message.attachmentPath,120)");
  includes(files.backend, 'action==="open-attachment"');
});
check("read receipt setting prevents database reads when disabled", () => includes(files.backend, "if(settings.readReceipts===false)return;"));
check("read ticks have distinct grey and blue states", () => {
  includes(files.css, ".message-read-status.is-read");
  includes(files.css, ".message-read-status:not(.is-read)");
  includes(files.app, 'message.status==="read"?"is-read":"is-delivered"');
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
  const count = (files.backend.match(/dispatchServerPush\\("notify-message"/g) || []).length;
  assert.ok(count >= 5, "text, forwarded, attachment/voice, poll and event messages should trigger push");
  includes(files.backend, 'say("Poll sent.');
  includes(files.backend, 'say("Event sent.');
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
  const mediaPrompt = files.calls.indexOf('await userMedia(mediaType==="video")', start);
  assert.ok(start >= 0 && insert > start && mediaPrompt > insert);
});
check("call notification action can be queued until offer arrives", () => {
  includes(files.calls, "runPendingNotificationAction");
  includes(files.calls, "handleNotificationAction");
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
