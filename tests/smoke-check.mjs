import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const files = {
  app: read("app.js"),
  backend: read("backend.js"),
  featureGaps: read("feature-gaps.js"),
  groupCalls: read("group-calls.js"),
  groupTurn: read("supabase/functions/whatsapp-group-turn-credentials/index.ts"),
  cleanup: read("supabase/functions/whatsapp-expiry-cleanup/index.ts"),
  groupCallLimitMigration: read("supabase/migrations/20261031091826_whatsapp_group_call_participant_limit.sql"),
  blockScopeMigration: read("supabase/migrations/20261031091900_whatsapp_block_scope_direct_chats_only.sql"),
  nativeNotifications: read("android-native/app/src/main/java/com/ahcodercode/whatsapp/NativeCallNotifications.java"),
  nativeReceiver: read("android-native/app/src/main/java/com/ahcodercode/whatsapp/CallNotificationActionReceiver.java"),
  nativeActivity: read("android-native/app/src/main/java/com/ahcodercode/whatsapp/MainActivity.java"),
  incomingActivity: read("android-native/app/src/main/java/com/ahcodercode/whatsapp/IncomingCallActivity.java"),
  updater: read("updater.js"),
  buildWorkflow: read(".github/workflows/build-native-android.yml"),
  nativeManifest: read("android-native/app/src/main/AndroidManifest.xml"),
  calls: read("calls.js"),
  sw: read("sw.js"),
  html: read("index.html"),
  css: read("styles.css"),
  manifest: read("manifest.webmanifest"),
  push: read("supabase/functions/whatsapp-push/index.ts"),
  turn: read("supabase/functions/master-chat-turn-credentials/index.ts"),
  pushMigration: read("supabase/migrations/20261028123000_whatsapp_device_push_notifications.sql"),
  deviceMigration: read("supabase/migrations/20261028130000_whatsapp_linked_devices.sql"),
  signalFallbackMigration: read("supabase/migrations/20261030081609_add_webrtc_direct_fallback_signal_kinds.sql"),
  signalFallbackRlsMigration: read("supabase/migrations/20261030081801_extend_webrtc_direct_fallback_signaling_rls.sql"),
  signalFallbackTriggerMigration: read("supabase/migrations/20261030082258_allow_authenticated_webrtc_fallback_signal_types.sql")
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

for (const [name, source] of [["app.js",files.app],["backend.js",files.backend],["feature-gaps.js",files.featureGaps],["group-calls.js",files.groupCalls],["calls.js",files.calls],["sw.js",files.sw],["updater.js",files.updater]]) {
  check(name + " JavaScript parses", () => new Script(source, { filename: name }));
}
check("group calling uses authenticated group-call rows and relay-only mesh peers", () => {
  for (const marker of ["aeroshell_group_calls","aeroshell_group_call_participants","aeroshell_group_call_signals","whatsapp-group-turn-credentials","iceTransportPolicy: \"relay\"","notify-group-call","wa-group-accept","wa-group-end"]) {
    includes(files.groupCalls, marker);
  }
  includes(files.groupTurn, "aeroshell_group_turn_credential_requests");
  includes(files.groupTurn, "METERED_TURN_DOMAIN");
  includes(files.groupCallLimitMigration, "enforce_group_call_participant_limit");
  includes(files.groupCallLimitMigration, "participant_count >= 8");
  includes(files.groupCallLimitMigration, "FOR UPDATE");
  includes(files.blockScopeMigration, "group_id IS NOT NULL");
  includes(files.cleanup, "staleGroupCallsEnded");
  includes(files.cleanup, "staleCallCutoff");
  includes(files.push, "async function notifyGroupCall");
  includes(files.push, 'body.action === "notify-group-call"');
});
check("media, privacy, subgroup and synced-list handlers are present", () => {
  for (const marker of ["wa-publish-status","wa-publish-channel-post","whatsapp_user_blocks","whatsapp_user_reports","whatsapp_disappearing_settings","whatsapp_custom_chat_lists","whatsapp_community_groups"]) {
    includes(files.featureGaps, marker);
  }
  includes(files.app, "WhatsAppFeatureGaps.onBackendData");
});
check("feature-gap module is in the app shell cache", () => {
  includes(files.html, "/feature-gaps.js?v=whatsapp-fix-20261031c");
  includes(files.sw, "/feature-gaps.js?v=whatsapp-fix-20261031c");
  includes(files.html, "/group-calls.js?v=whatsapp-fix-20261031c");
  includes(files.sw, "/group-calls.js?v=whatsapp-fix-20261031c");
});
check("inline HTML scripts parse", () => {
  const scripts = [...files.html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.ok(scripts.length >= 2);
  scripts.forEach((source, index) => new Script(source, { filename: "index-inline-" + index }));
});
check("manifest is valid JSON", () => JSON.parse(files.manifest));
check("CSS braces balance", () => assert.equal((files.css.match(/{/g)||[]).length, (files.css.match(/}/g)||[]).length));
check("current asset version is shared by HTML and service worker", () => {
  includes(files.html, "whatsapp-fix-20261031c");
  includes(files.sw, "whatsapp-fix-20261031c");
  includes(files.manifest, "whatsapp-fix-20261031c");
  includes(files.sw, "whatsapp-final-shell-v64");
});
check("mobile settings use a full-width account detail pane", () => {
  includes(files.css, ".settings-layout{display:flex!important;flex-direction:column!important");
  includes(files.css, ".setting-option-copy{flex:1 1 0;min-width:0");
});
check("contact profile uses consistent, semantic More options buttons", () => {
  includes(files.app, "wa-contact-options-card");
  includes(files.app, "wa-contact-option-row");
  for (const action of ["toggle-favorite","toggle-mute","disappearing","report-chat","block-chat","clear-chat","remove-contact"]) {
    includes(files.app, action);
  }
  includes(files.app, "More options");
});
check("contact info is full-width and independently scrollable on mobile", () => {
  includes(files.css, ".main-pane>.details-layout{display:flex!important;flex:1 1 auto!important");
  includes(files.css, ".details-content{display:block;flex:1 1 auto;width:100%;max-width:100%;min-width:0");
  includes(files.css, "grid-template-columns:22px minmax(0,1fr) 16px");
  includes(files.css, ".wa-contact-option-copy strong{display:block;min-width:0;max-width:100%");
  includes(files.css, "overflow-y:auto;overscroll-behavior:contain");
});
check("contact details copy and edit controls have separate tap targets", () => {
  includes(files.app, "wa-contact-detail-row");
  includes(files.app, "wa-contact-inline-action");
  includes(files.app, "copy-chat-username");
  includes(files.app, "copy-chat-phone");
});
check("Calls history has dedicated responsive rows", () => {
  includes(files.app, "wa-call-history-row");
  includes(files.app, "wa-call-history-direction");
  includes(files.css, ".wa-call-history-list{");
});
check("call setup overlaps push, TURN and microphone waits without disabling relay-only ICE", () => {
  includes(files.calls, 'iceTransportPolicy:"relay",iceCandidatePoolSize:1');
  includes(files.calls, 'action:"notify-call",callId:newId');
  includes(files.calls, "const relaySetup=relayServers(call.id).then");
  includes(files.calls, "startCallPushReminders(newId,client)");
});
check("Android incoming-call actions launch the Activity directly and can wake the lock screen", () => {
  includes(files.nativeManifest, "android.permission.USE_FULL_SCREEN_INTENT");
  includes(files.nativeNotifications, "builder.setFullScreenIntent(");
  includes(files.nativeReceiver, "PendingIntent.getActivity(");
  excludes(files.nativeReceiver, "return PendingIntent.getBroadcast(");
  includes(files.nativeActivity, "setShowWhenLocked(incomingCall)");
  includes(files.nativeActivity, "setTurnScreenOn(incomingCall)");
  includes(files.nativeActivity, "canUseFullScreenIntent()");
});
check("dedicated incoming-call activity presents Accept and Decline above the lock screen", () => {
  includes(files.nativeManifest, 'android:name=".IncomingCallActivity"');
  includes(files.incomingActivity, "setShowWhenLocked(true)");
  includes(files.incomingActivity, "setTurnScreenOn(true)");
  includes(files.incomingActivity, 'accept.setText("Accept")');
  includes(files.incomingActivity, 'decline.setText("Decline")');
});
check("web/PWA clients receive an actionable update banner while Android checks signed APK releases", () => {
  includes(files.updater, "WhatsApp update available");
  includes(files.updater, 'data-wa-web-update-reload');
  includes(files.updater, "controllerchange");
  includes(files.updater, "registration.update()");
  includes(files.updater, "native.checkForUpdates()");
  includes(files.updater, "downloadAndInstallUpdate(latestUpdate.apkUrl, latestUpdate.sha256)");
});
check("in-app update checker validates trusted release APK and checksum before install", () => {
  includes(files.updater, "Update now");
  includes(files.nativeActivity, "downloadAndInstallUpdate(String url, String sha256)");
  includes(files.nativeActivity, "MessageDigest.getInstance");
  includes(files.nativeActivity, "hasSameSigningCertificate(apk)");
  includes(files.buildWorkflow, "ANDROID_SIGNING_KEYSTORE_BASE64");
  includes(files.buildWorkflow, "softprops/action-gh-release@v2");
  includes(files.buildWorkflow, "APK SHA-256:");
});
check("WebView attachment inputs remain clickable and native calls set audio mode", () => {
  includes(files.app, 'addInput.style.cssText="position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1');
  includes(files.calls, "beginNativeCallAudioSession();");
  includes(files.calls, "endNativeCallAudioSession();");
  includes(files.nativeActivity, "AudioManager.MODE_IN_COMMUNICATION");
});
check("attachment menu opens the Android file picker before closing and has a WebView fallback", () => {
  const start = files.app.indexOf("function runMenuAction");
  const end = files.app.indexOf('document.addEventListener("click",event=>', start);
  const source = files.app.slice(start, end);
  const pickerBranch = source.indexOf('if(["pick-file","pick-image","pick-audio","camera"].includes(action))');
  const firstClose = source.indexOf("closePopup();");
  assert.ok(start >= 0 && end > start, "runMenuAction function must exist");
  assert.ok(pickerBranch >= 0 && pickerBranch < firstClose, "launch the file chooser before detaching the clicked menu item");
  includes(files.app, "function openAttachmentPicker(kind)");
  includes(files.app, 'typeof input.showPicker==="function"');
  includes(files.app, "else input.click()");
  includes(files.app, 'if(action==="pick-image"){openAttachmentPicker("image");return;}');
  includes(files.app, 'if(action==="pick-audio"){openAttachmentPicker("audio");return;}');
  includes(files.nativeActivity, "onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params)");
  includes(files.nativeActivity, "WebChromeClient.FileChooserParams.parseResult(result, data)");
});
check("microphone source errors retry default constraints and explain permission/device failures", () => {
  includes(files.calls, "noiseSuppression:true");
  includes(files.calls, "audio:true,video:video?{facingMode:\"user\"}:false");
  includes(files.calls, "Could not start the microphone audio source.");
  includes(files.calls, "Allow the permission for WhatsApp in browser or Android app settings");
});
check("notification toggles roll back when background push registration fails", () => {
  includes(files.app, "The device subscription was not confirmed by the server.");
  includes(files.app, "state.settings[settingKey]=false;state.settings.notificationsSetupComplete=false;saveState();renderSettings();");
  includes(files.app, "Could not enable \"+labelForNotificationKey(settingKey)+\" notifications: \"+detail");
});
check("hidden call pages show a fallback if Web Push is delayed", () => {
  includes(files.calls, 'const tag="wa-call-"+String(call.id);');
  includes(files.calls, "registration.getNotifications({tag})");
  includes(files.calls, "renotify:false");
  excludes(files.calls, 'if(await registration.pushManager.getSubscription())return;');
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
check("direct ICE fallback recovers a pending relay offer and retries several STUN routes", () => {
  includes(files.calls, 'connection.setLocalDescription({type:"rollback"})');
  includes(files.calls, "waitForSignalingStableForFallback");
  includes(files.calls, 'stun:stun.cloudflare.com:3478');
  includes(files.calls, 'stun:stun.l.google.com:19302');
  includes(files.calls, "direct ICE-restart offer");
  includes(files.calls, "network address may be visible");
  includes(files.calls, "pc&&!directFallbackLocalStarted");
});
check("failed TURN calls coordinate an encrypted direct ICE fallback", () => {
  includes(files.calls, 'const DIRECT_FALLBACK_ICE_SERVERS=[{urls:"stun:stun.relay.metered.ca:80"},{urls:"stun:stun.cloudflare.com:3478"}');
  includes(files.calls, "function configureDirectFallback(connection)");
  includes(files.calls, "connection.getConfiguration()");
  includes(files.calls, "iceServers:DIRECT_FALLBACK_ICE_SERVERS");
  includes(files.calls, "iceTransportPolicy:\"all\"");
  includes(files.calls, "configureDirectFallback(connection)");
  excludes(files.calls, "iceCandidatePoolSize:0");
  includes(files.calls, "connection.restartIce()");
  includes(files.calls, '"fallback-request"');
  includes(files.calls, '"fallback-offer"');
  includes(files.calls, '"fallback-answer"');
  includes(files.calls, '"fallback-ice"');
  includes(files.calls, "network address may be visible");
  excludes(files.calls, "No direct-connection fallback was attempted.");
  for (const kind of ["fallback-request", "fallback-offer", "fallback-answer", "fallback-ice"]) {
    includes(files.signalFallbackMigration, "'" + kind + "'::text");
    includes(files.signalFallbackRlsMigration, "kind = '" + kind + "'");
    includes(files.signalFallbackTriggerMigration, "new.kind = '" + kind + "'");
  }
  includes(files.signalFallbackRlsMigration, 'to authenticated');
  includes(files.signalFallbackRlsMigration, "private.aeroshell_chat_actor_is_valid()");
  includes(files.signalFallbackTriggerMigration, "security definer");
  includes(files.signalFallbackTriggerMigration, "auth.uid()");
  includes(files.signalFallbackTriggerMigration, "recent_signals >= 200");
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

check("message long-press is responsive and a held voice note cannot start playback", () => {
  includes(files.app, 'event.target.closest(".message-attachment-open.voice-message-open")');
  includes(files.app, "},500);");
  includes(files.app, "let messageHoldTriggeredRow = null;");
  includes(files.app, "if(audio&&!audio.paused)audio.pause();");
  includes(files.app, "Run at document capture before backend.js handles a voice attachment click.");
  includes(files.app, "#message-selection-toolbar,#message-reaction-picker,#popup-menu,#dialog-backdrop");
  includes(files.app, "dismissMessageSelection(false);");
});
check("sent text messages can be edited and the UI displays an edited marker", () => {
  includes(files.app, "data-dialog-action='save-edited-message'");
  includes(files.app, 'action==="edit-message"');
  includes(files.backend, "editBackendMessage=editMessage");
  includes(files.backend, "edited_at:new Date().toISOString()");
  includes(files.app, "message-edited-label");
});
check("pinning a message supports jumping to it and unpinning it", () => {
  includes(files.app, 'label:isPinned?"Unpin message":"Pin message"');
  includes(files.app, 'action==="pin-message"');
  includes(files.app, 'action==="pinned-preview"');
  includes(files.app, 'row.scrollIntoView({behavior:"smooth",block:"center"})');
  includes(files.app, "wa_pinned_messages_");
  includes(files.app, "persistPinnedMessage(chat.id,chat.pinnedMessage)");
  includes(files.app, "const pins=readPinnedMessages()");
});
check("videos can be uploaded and played in a private attachment preview", () => {
  excludes(files.backend, "Video attachments are not enabled by the current secure storage policy");
  includes(files.backend, 'else if(mime.startsWith("video/"))preview="<video');
  includes(files.app, 'image:"image/*,video/*"');
});
check("poll and event workflows have local fallbacks as well as backend persistence", () => {
  includes(files.app, "function sendLocalPoll()");
  includes(files.app, "function sendLocalEvent()");
  includes(files.app, "function voteLocalPoll(");
  includes(files.app, "function respondLocalEvent(");
  includes(files.backend, "async function sendPoll()");
  includes(files.backend, "async function sendEvent()");
});
check("contact removal displays a warning and does not delete the person's account", () => {
  includes(files.app, "This hides the contact and removes the conversation from this device only.");
  includes(files.app, "It does not delete their account");
  includes(files.app, "data-dialog-action='remove-contact-local'");
});
check("locked-screen call alerts repeat and delayed incoming calls are not dropped after 45 seconds", () => {
  includes(files.calls, "callPushReminderTimer");
  includes(files.calls, "},12000);");
  includes(files.calls, 'body:{action:"notify-call",callId:expectedId}');
  includes(files.calls, "await withCallTimeout(");
  includes(files.calls, "Background call alert dispatch timed out.");
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
  includes(files.calls, 'setPendingNotificationAction({kind:"call",callId:String(activeCall.id),action:"accept"});');
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


check("slow session restoration preserves sign-in and offers retry instead of showing signup", () => {
  includes(files.backend, "const {data,error}=await db.auth.getSession()");
  includes(files.backend, "finishStartup(false)");
  includes(files.backend, "finishStartup(true)");
  includes(files.backend, "showStartupRecovery(safeError(error");
  includes(files.backend, "Your account session has not been cleared");
  includes(files.html, "window.waShowStartupRecovery = function(message)");
  includes(files.html, "Retry connection");
  includes(files.backend, 'window.dispatchEvent(new Event("wa-startup-finished"))');
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
check("outgoing calls acquire local media before creating a call row or alerting the peer", () => {
  const start = files.calls.indexOf("async function startCall");
  const end = files.calls.indexOf("async function receiveSignal", start);
  const source = files.calls.slice(start, end);
  const mediaPrompt = source.indexOf('await userMediaWithTimeout(mediaType==="video",20000)');
  const insert = source.indexOf('from("aeroshell_calls")');
  const push = source.indexOf('action:"notify-call"');
  const nativeAudio = source.indexOf("beginNativeCallAudioSession()");
  assert.ok(start >= 0 && end > start, "startCall function must exist");
  assert.ok(mediaPrompt >= 0 && insert > mediaPrompt, "capture must succeed before creating a remote call row");
  assert.ok(push > insert, "the remote call alert must happen after the local call row and successful capture");
  assert.ok(nativeAudio >= 0 && nativeAudio < mediaPrompt, "native communication audio routing must be ready before microphone capture");
  includes(source, "Notify the callee after local media is ready");
});
check("native Android manifest declares audio-settings permission for WebRTC routing", () => {
  includes(files.nativeManifest, 'android.permission.RECORD_AUDIO');
  includes(files.nativeManifest, 'android.permission.MODIFY_AUDIO_SETTINGS');
  includes(files.nativeActivity, 'private synchronized boolean beginNativeCallAudio(boolean useSpeaker)');
  includes(files.nativeActivity, '@JavascriptInterface public boolean beginCallAudio()');
  includes(files.nativeActivity, 'return false;');
});
check("incoming calls acquire microphone before switching Android to communication audio mode", () => {
  const start = files.calls.indexOf("async function acceptCall");
  const end = files.calls.indexOf("async function notifyCallEnded", start);
  const source = files.calls.slice(start, end);
  const mediaPrompt = source.indexOf('await userMediaWithTimeout(call.media_type==="video",20000)');
  const nativeAudio = source.indexOf("beginNativeCallAudioSession()");
  assert.ok(mediaPrompt >= 0 && nativeAudio >= 0 && nativeAudio < mediaPrompt, "acceptCall must prepare native audio mode before opening the microphone");
});
check("transient Android audio capture failures retry with delayed default constraints", () => {
  includes(files.calls, 'await new Promise(resolve=>setTimeout(resolve,350))');
  includes(files.calls, 'await new Promise(resolve=>setTimeout(resolve,650))');
  includes(files.calls, "released. Wait briefly, then retry with default capture constraints.");
});
check("call notification action can be queued until offer arrives", () => {
  includes(files.calls, "runPendingNotificationAction");
  includes(files.calls, "handleNotificationAction");
});
check("native Android FCM token registration is authenticated and preference-aware", () => {
  includes(files.backend, 'action:"register-android-token"');
  includes(files.backend, "window.waBackendRegisterAndroidPushToken=registerNativeAndroidPushToken");
  includes(files.backend, "unregister-android-token");
  includes(files.backend, "window.__waNativeFCMToken");
});
check("background call-test diagnostics record service-worker receipt and display stages", () => {
  includes(files.sw, 'reportCallTestReceipt(probeId, "received")');
  includes(files.sw, 'reportCallTestReceipt(probeId, "shown")');
  includes(files.push, 'body.action === "push-receipt"');
  includes(files.push, "push_event_received_at");
  includes(files.push, "notification_api_resolved_at");
});
check("background call alerts always show, retry transient push errors, and can be tested", () => {
  includes(files.sw, "if (kind !== \"call\" && clients.some");
  includes(files.sw, "const isCallTest = kind === \"call\" && data.test === true");
  includes(files.push, 'body.action === "test-call-push"');
  includes(files.push, "attempt < 2");
  includes(files.push, "urgency: preferenceColumn === \"calls_enabled\" ? \"high\" : \"normal\"");
  includes(files.push, "Background call alert test. Check sound, vibration and lock-screen display.");
  includes(files.push, "subscriptions: subscriptions.length");
  includes(files.app, "switch to Facebook now and leave WhatsApp closed");
  includes(files.app, '["phone","Test call alert"');
  includes(files.app, 'if(title==="Test call alert")');
  includes(files.backend, "window.waBackendTestCallPush=testCallPush;");
  includes(files.app, "window.waBackendTestCallPush(8)");
  includes(files.backend, "delaySeconds:delay");
  includes(files.push, "body.delaySeconds");
  includes(files.push, "setTimeout(resolve, delaySeconds * 1000)");
  includes(files.push, "[whatsapp-push] Incoming-call delivery result");
  includes(files.push, "[whatsapp-push] Background call-test result");
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
check("Android notification switches sync Messages, Groups and Calls push preferences", () => {
  includes(files.app, 'nativeAndroidNotificationsEnabled(settingKey="callNotifications")');
  includes(files.app, 'supportedKeys=["messageNotifications","groupNotifications","callNotifications"]');
  includes(files.push, 'sendAndroidPushToUsers(recipientIds, preferenceColumn, pushPayload)');
  includes(files.push, '.eq(preferenceColumn, true)');
  includes(files.nativeNotifications, 'MESSAGE_CHANNEL_ID = "wa_messages_v2"');
});
check("signed-in attachments use shared secure storage", () => {
  includes(files.app, 'bridge.uploadBackendAttachment(file,{type:"file"');
  includes(files.backend, 'bridge.uploadBackendAttachment=uploadStoredAttachment');
  includes(files.backend, 'db.storage.from(ATTACHMENT_BUCKET).upload(path,uploadFile');
});
check("signed-in events and polls use shared backend workflows", () => {
  includes(files.app, 'sendBackendPoll==="function"');
  includes(files.app, 'sendBackendEvent==="function"');
  includes(files.backend, 'bridge.sendBackendPoll=sendPoll');
  includes(files.backend, 'bridge.sendBackendEvent=sendEvent');
  includes(files.backend, 'bridge.voteBackendPoll=votePoll');
  includes(files.backend, 'bridge.respondBackendEvent=respondToEvent');
});
check("lock-screen calls do not dismiss the keyguard or auto-open the main app", () => {
  excludes(files.incomingActivity, "FLAG_DISMISS_KEYGUARD");
  excludes(files.incomingActivity, 'handler.postDelayed(fallbackRunnable, 60000)');
  includes(files.incomingActivity, 'launch.putExtra("waNativeIncomingCall", !"decline".equals(action))');
  includes(files.nativeActivity, '!"decline".equalsIgnoreCase(uri.getQueryParameter("waPushAction"))');
});
check("background push delivery failures do not show a caller-facing call error", () => {
  excludes(files.calls, "its background notification could not be confirmed");
  includes(files.calls, "continuing call setup:");
});
check("call-ended push dismisses matching Android and browser incoming-call UI", () => {
  includes(files.calls, 'action:"notify-call-ended"');
  includes(files.push, "async function notifyCallEnded(");
  includes(files.push, 'body.action === "notify-call-ended"');
  includes(files.sw, 'if (kind === "call-ended")');
  includes(files.nativeNotifications, '"call-ended".equals(kind)');
  includes(files.nativeNotifications, 'endIncomingCall(context, value(data, "callId", ""))');
});
check("native Accept actions reach the call controller after WebView startup", () => {
  includes(files.nativeActivity, "rememberPendingNativeCallAction(intent, url);");
  includes(files.nativeActivity, "dispatchPendingNativeCallAction");
  includes(files.nativeActivity, "api.handleNotificationAction({kind:'call',callId:");
  includes(files.calls, "window.WhatsAppCalls={");
  includes(files.calls, "if(pending&&pending.kind===\"call\"&&pending.callId)");
});
check("cold-start Accept restores the exact call before chat hydration", () => {
  includes(files.calls, "async function restorePendingNotificationAction()");
  includes(files.calls, 'eq("id",pending.callId).eq("callee_id",current.id).maybeSingle()');
  includes(files.calls, "await showIncomingCallRecord(row);");
  includes(files.calls, "incomingOffer=offers[0];phase=\"incoming\";acceptRequested=false;");
  includes(files.calls, "restorePendingNotificationAction,");
  includes(files.backend, "void window.WhatsAppCalls.restorePendingNotificationAction()");
  assert.ok(files.backend.indexOf("restorePendingNotificationAction()") < files.backend.indexOf("await loadData(false);"));
});
check("nonessential linked-device and FCM registration cannot block call startup", () => {
  includes(files.backend, "void registerCurrentDevice().catch");
  includes(files.backend, "void registerNativeAndroidPushToken(nativeToken");
  excludes(files.backend, "try{if(!(await registerCurrentDevice()))return;}");
});
check("service-worker activation does not reload the app during incoming call recovery", () => {
  excludes(files.html, 'navigator.serviceWorker.addEventListener("controllerchange"');
  excludes(files.html, "navigator.serviceWorker.addEventListener(\"controllerchange\"");
});
check("call action presence is exported for startup gating", () => {
  includes(files.calls, "hasPendingNotificationAction:()=>!!pendingNotificationAction");
  includes(files.backend, "hasPendingNotificationAction&&window.WhatsAppCalls.hasPendingNotificationAction()");
});
check("native Accept recovers exact call even when a stale call object exists", () => {
  includes(files.calls, "showIncomingCallRecord(target,{force:true})");
  includes(files.calls, "pendingRecoveryPromise");
  includes(files.calls, "if(activeCall&&String(activeCall.id)!==String(target.id))");
});
check("incoming call screen renders before caller profile lookup finishes", () => {
  const start=files.calls.indexOf("async function showIncomingCallRecord");
  const end=files.calls.indexOf("function mediaPermissionError",start);
  const source=files.calls.slice(start,end);
  assert.ok(source.indexOf("activeCall=Object.assign")<source.indexOf("client.from(\"aeroshell_profiles\")"));
  includes(source,"return activeCall;");
});
check("call Accept does not select a chat while call restoration is pending", () => {
  includes(files.backend,"callActionPending");
  includes(files.backend,"if(targetId&&!callActionPending)");
  includes(files.backend,"else if(targetId&&callActionPending)");
});
check("call-transition Edge Function parses one Bearer prefix", () => {
  includes(files.push,'authHeader.toLowerCase().startsWith("bearer ")');
  includes(files.push,'authHeader.slice(7).trim()');
});
check("auth bootstrap waits for the exact pending incoming call before showing Chats", () => {
  includes(files.backend, "hasPendingNotificationAction&&window.WhatsAppCalls.hasPendingNotificationAction()");
  includes(files.backend, "await withTimeout(window.WhatsAppCalls.subscribe(),6500");
  includes(files.calls, "async function recoverPendingNotificationCall(current,client)");
  includes(files.calls, "const restored=await recoverPendingNotificationCall(current,client);");
  includes(files.calls, 'target.status==="accepted"&&pending.action==="accept"');
});
check("native call actions force recovery during Android visibility transitions", () => {
  includes(files.calls, "pollIncomingCallState({force:true})");
  includes(files.calls, "(!options.force&&document.visibilityState===\"hidden\")");
  includes(files.calls, "hasPendingNotificationAction:()=>!!pendingNotificationAction");
});
check("call status Edge Function uses authenticated JWT for auth.uid trigger checks", () => {
  includes(files.push, "async function transitionCall(userId: string, body: any, authorization: string)");
  includes(files.push, 'global: { headers: { Authorization: "Bearer " + bearer } }');
  includes(files.push, 'userClient.from("aeroshell_calls")');
  includes(files.push, 'transitionCall(user.id, body, req.headers.get("Authorization") || "")');
});
check("pending native Accept survives URL cleanup and WebView/service-worker reloads", () => {
  includes(files.calls, 'const PENDING_CALL_ACTION_KEY="wa_pending_native_call_action_v1";');
  includes(files.calls, "localStorage.setItem(PENDING_CALL_ACTION_KEY");
  includes(files.calls, "pendingNotificationAction=readPendingNotificationAction()");
  includes(files.calls, "clearPendingNotificationAction();");
  includes(files.nativeActivity, "if (isCallLaunchIntent(intent, url) && pageLoaded)");
});
check("incoming call recovery resumes an already-accepted call after a WebView reload", () => {
  includes(files.calls, 'target.status==="accepted"&&pending.action==="accept"');
  includes(files.calls, 'row.status==="accepted"&&pendingMatches&&pending.action==="accept"');
  includes(files.calls, 'if(!activeCall||String(activeCall.id)!==String(target.id))await showIncomingCallRecord(target,{force:true});');
  includes(files.calls, "clearPendingNotificationAction();");
  includes(files.nativeActivity, "window.WhatsAppCalls&&window.WhatsAppCalls.resume");
});
check("accept, decline and hang-up use verified call-state transitions", () => {
  includes(files.calls, 'client.functions.invoke("whatsapp-push",{body:{action:"transition-call",callId:String(call.id),status:nextStatus}})');
  includes(files.calls, 'await transitionCallStatus(call,"accepted",client,current)');
  includes(files.calls, 'await transitionCallStatus(call,"rejected")');
  includes(files.calls, 'await transitionCallStatus(call,"ended")');
  includes(files.push, "async function transitionCall(userId: string, body: any, authorization: string)");
  includes(files.push, 'body.action === "transition-call"');
  includes(files.push, 'call.callee_id !== userId');
  includes(files.push, "await notifyCallEnded(userId, { callId })");
});
check("chat attachment menu has a dedicated audio picker using private storage", () => {
  includes(files.app, '{icon:"music",label:"Audio",action:"pick-audio"}');
  includes(files.app, 'if(action==="pick-audio")');
  includes(files.app, 'audio:"audio/*"');
  includes(files.backend, 'db.storage.from(ATTACHMENT_BUCKET).upload(path,uploadFile');
});
check("TURN relay config respects Metered account region and includes all four transport routes", () => {
  excludes(files.turn, 'endpoint.searchParams.set("region", "asia")');
  includes(files.turn, "const seenEndpoints = new Set<string>()");
  includes(files.turn, '"turn:" + hostname + ":80"');
  includes(files.turn, '"turn:" + hostname + ":80?transport=tcp"');
  includes(files.turn, '"turn:" + hostname + ":443"');
  includes(files.turn, '"turns:" + hostname + ":443?transport=tcp"');
  includes(files.turn, "seenEndpoints.add(urls)");
});
check("Android call session acquires a bounded CPU wake lock and releases it on cleanup", () => {
  includes(files.nativeManifest, 'android.permission.WAKE_LOCK');
  includes(files.nativeActivity, "PowerManager.PARTIAL_WAKE_LOCK");
  includes(files.nativeActivity, "callCpuWakeLock.acquire(3L * 60L * 60L * 1000L)");
  includes(files.nativeActivity, "releaseCallCpuWakeLock();");
});
check("people search result buttons stay aligned inside responsive contact cards", () => {
  includes(files.app, "friend-search-result-card");
  includes(files.app, "friend-search-result-copy");
  includes(files.app, "friend-search-result-action");
  includes(files.css, "grid-template-columns:46px minmax(0,1fr) auto");
  includes(files.css, ".friend-search-result-action>button");
  includes(files.app, "data-action='send-contact-request'");
});
check("New Group and New Community remain available from the overflow menu", () => {
  includes(files.app, 'label:"New group",action:"new-group"');
  includes(files.app, 'label:"New community",action:"new-community"');
  includes(files.app, 'if(action==="new-group"){createGroupDialog();return;}');
  includes(files.app, 'if(action==="new-community"){createCommunityDialog();return;}');
  includes(files.backend, "aeroshell_create_group");
  includes(files.backend, "async function createCommunity");
});
check("chat attachment menu exposes polls, events, sharing contacts and adding contacts", () => {
  for (const action of ["pick-file","pick-image","pick-audio","camera","share-contact","find-friends","create-poll","create-event"]) includes(files.app, 'action:"' + action + '" '.trimEnd());
  includes(files.app, 'label:"Share contact"');
  includes(files.app, 'label:"Add contact"');
  includes(files.app, 'label:"Create poll"');
  includes(files.app, 'label:"Create event"');
  includes(files.app, 'if(action==="find-friends"){createNewChatDialog();return;}');
});
check("Communities and Channels have visible plus creation controls", () => {
  includes(files.app, "wa-create-community-plus");
  includes(files.app, "wa-create-community-cta");
  includes(files.app, "wa-create-channel-plus");
  includes(files.app, "wa-create-channel-cta");
  includes(files.css, ".wa-create-community-plus");
  includes(files.css, ".wa-create-channel-plus");
  includes(files.app, "data-action=\'new-channel\'");
});
check("channel creation keeps the Supabase create-and-follow backend flow", () => {
  includes(files.app, "function createChannelDialog()");
  includes(files.app, "data-dialog-action=\'create-channel\'");
  includes(files.app, 'if(action==="new-channel"){createChannelDialog();return;}');
  includes(files.backend, 'action==="new-channel"');
  includes(files.backend, "async function createChannel()");
  includes(files.backend, 'db.from("whatsapp_channels").insert');
  includes(files.backend, 'db.from("whatsapp_channel_follows").insert');
  includes(files.app, 'if(action==="create-channel")');
});
check("Camera is forced through Android native capture with an in-app camera fallback", () => {
  includes(files.app, "openCameraPreviewFallback");
  includes(files.app, "navigator.mediaDevices.getUserMedia");
  includes(files.app, "wa-camera-preview");
  includes(files.app, "captureCameraPreviewPhoto");
  includes(files.app, "forceNextCameraCapture()");
  includes(files.nativeActivity, "forceCameraCaptureOnNextChooser");
  includes(files.nativeActivity, "createCaptureIntent(params, forceCamera)");
  includes(files.nativeActivity, "window.__waCameraCaptureFallback");
  includes(files.nativeManifest, 'android.hardware.camera" android:required="false"');
});
check("Custom chat lists support selected chats, editing, filtering and account sync", () => {
  includes(files.app, "function openCustomListDialog(existingList)");
  includes(files.app, "name='custom-list-chat'");
  includes(files.app, 'filter.startsWith("list:")');
  includes(files.app, 'filter="list:"+String(saved.id)');
  includes(files.app, "openManageCustomListsDialog");
  includes(files.html, 'id="custom-filter-chips"');
  includes(files.app, "customLists:[]");
  includes(files.featureGaps, "syncCustomLists");
  includes(files.featureGaps, "whatsapp_custom_chat_lists");
});
check("Contact requests exposes a prominent responsive Find people button", () => {
  includes(files.app, "request-find-people-button");
  includes(files.app, "data-action='find-friends'");
  includes(files.css, ".request-find-people-button{");
});
check("New voice and video call selectors search accepted one-to-one contacts", () => {
  includes(files.calls, 'filter(person=>person.type==="person")');
  includes(files.calls, "wa-call-picker-search");
  includes(files.calls, "data-wa-call-person");
  includes(files.calls, "No matching contacts found.");
});
check("Channels opens on Your channels with separate Discover and Create actions", () => {
  includes(files.app, "Your channels");
  includes(files.app, "wa-channel-discover-wide");
  includes(files.app, "wa-create-channel-cta");
  includes(files.app, 'settingRow("channels","Channels","Create a channel or discover channels to follow","nav-channels")');
  includes(files.backend, "async function createChannel()");
});
console.log("\n" + passed + " passed, " + failed + " failed.");
if (failed) process.exitCode = 1;
