# WhatsApp (independent web app)
This independent WhatsApp-inspired web app is a responsive, installable messaging app built on Supabase Auth, Postgres, Storage and Realtime. It includes one-to-one and group WebRTC voice/video calling through authenticated Supabase TURN-credential functions and the Metered TURN service.

**Live app:** https://whatsapp-for.vercel.app  
**Source:** https://github.com/AHCoderCode/whatsapp  
**Supabase project:** `windows-12-beta-chat` (`qoyqfmovzvtyvxutakym`)

### Call audio and chat call cards

Android calls start on the earpiece route; the Speaker control explicitly switches to the device loudspeaker. During the call, the app raises the Android voice-call stream to that device's available maximum, restores its previous level when the call ends, and applies a compressed software gain to remote call audio where Web Audio is supported. Actual loudness still depends on the phone's speaker, OS limits, and connected audio devices. Connected calls appear as dark call cards in the conversation; unanswered or declined calls appear as red missed-call cards.

## What is connected to the backend

- Username/password accounts using Supabase Auth. Usernames and custom IDs are unique. The `+990 xxx xxx xxx` value is an **in-app ID**, not a real telephone number.
- Profile display name, about text and compressed profile photo.
- People search by display name, username, or custom in-app number (with or without the `+990` prefix), with profile photos and direct contact-request actions. Real contact requests (send/accept/decline/cancel), accepted contacts, and persistent direct conversations.
- Persistent group text conversations, group descriptions, and adding accepted contacts to groups.
- Realtime text messages, read receipts, and message removal (own messages can be deleted for everyone; messages from others can be hidden from the local account).
- Private storage attachments for documents, photos, videos and audio files (up to 15 MB per file under the current storage policy), plus recorded voice notes limited to two minutes.
- Database-backed polls and voting, event invitations and RSVPs, editable text/image/video status updates expiring after 24 hours, channel directory/follows with text/photo/video posts, and communities with linked group subgroups.
- One-to-one audio/video WebRTC calls with relay-first and direct fallback behavior, plus mesh group audio/video calls for up to eight participants including the initiator. Group calls use relay-only peer connections, per-participant invitations, accept/decline/leave state and authenticated TURN credential quotas. Group calls require a valid Metered TURN configuration and supported WebRTC devices/networks. The group-call implementation is mesh-based, so bandwidth and CPU use increase as participants join.
- Installable PWA shell with service worker, manifest icons, install button and browser menu fallback.

Appearance, read-receipt, accessibility and notification preferences are saved in this browser; custom chat lists sync through Supabase, while contact display-name aliases remain device-local. Profile name/about/photo, messages, contact requests, groups, communities, community subgroups and channels use the connected Supabase backend. Direct-contact blocking is enforced for message reads and sends by server policies; report submissions are stored server-side. Disappearing-message settings are shared per conversation and new messages receive a server expiry timestamp; expired content is hidden immediately and a scheduled cleanup job removes expired rows and associated private media objects. Contact display-name aliases are device-local by design. Incoming voice notes play inline, message URLs are clickable, and outgoing messages display grey check marks until the recipient is recorded as having read them, then switch to blue. Incoming calls show a compact accept/decline banner, and audio calls include mute, speaker-volume and hang-up controls. Linked browser sessions register in a row-level-security-protected Supabase table and can be revoked; a revoked session signs out on its next active heartbeat. Device notifications use browser permission plus a Web Push service: the Supabase Edge Function creates and stores VAPID keys server-side on first use, stores per-device push subscriptions, and sends message/call alerts. Delivery still depends on the browser/device supporting Web Push, permission being granted, a valid saved subscription, and the caller's/ sender's app completing its trigger request. No web app can receive a call while the phone itself is powered off. The app is not connected to real WhatsApp accounts and does not implement WhatsApp's end-to-end encryption.

For Android devices where browser Web Push is delayed while backgrounded, the native FCM companion in android-native/README.md posts system-level message and call alerts. Incoming calls use direct Accept/Decline activity actions and a full-screen call intent when Android allows it. Accepting a call does not dismiss the Android keyguard; declining returns to the lock screen, and a call-ended push closes the matching incoming-call screen. It requires a Firebase Android app, a local google-services.json, and the server-only FIREBASE_SERVICE_ACCOUNT_JSON secret. On Android 14+, enable the app's Full-screen notifications special access when prompted; otherwise calls may remain in the notification shade rather than waking the full answer screen. Install the newly built native APK to get native lock-screen call behavior—installing the PWA alone cannot force Android to open a full-screen call screen.

### Device notifications and linked browser sessions

In Settings → Notifications, enable Messages, Groups and/or Calls and accept the browser's notification prompt. On supported browsers, the app registers a service-worker push subscription. The server signs Web Push requests with VAPID keys generated on first use and stored in the service-role-only `whatsapp_push_config` table. Subscriptions and linked-device records are scoped to the signed-in account using RLS. Device revocation is enforced on the target browser's next active sync; it is not an operating-system remote-wipe function.

## Security boundaries

This app uses the Supabase project shared with the Windows 12 Master Chat, so the same account infrastructure is deliberately reused. Account deletion is disabled in this frontend to avoid accidentally deleting an identity used by both apps.

Never place a Supabase service-role/secret key or Metered account secret in HTML, browser JavaScript, GitHub or public Vercel environment variables. The browser contains only the Supabase publishable key and relies on RLS. **Do not disable RLS to make a rejected query work.**

The custom-ID lookup, lookup-rate-limit, group description, polls/events, status/channel/community and channel-post migrations have already been applied to the connected Supabase project. Do not copy-paste or rerun those migrations.


### Lock-screen calls and microphone troubleshooting

The hosted web app can show actionable Web Push call notifications when the browser and operating system deliver push. For the strongest Android lock-screen experience, build and install the native companion and allow its **Incoming calls** notification channel. On Android 14 and newer, also allow **Full-screen notifications** for the app if Android presents that special-access setting. Test with the screen locked but the phone powered on; no software app can receive a call while the phone itself is powered off.

If a caller sees **Could not start the microphone audio source**, close other apps currently using the microphone, check Android Settings → Apps → WhatsApp → Permissions → Microphone, then retry. The latest web call code retries once with default audio constraints on selected Android/WebView media-source errors. If it still fails, verify the microphone works in the phone's recorder app and restart the phone; real microphone/OS faults cannot be corrected by web code alone.

## Exact relay setup (required for actual calls)

1. Open [Metered Dashboard](https://dashboard.metered.ca/) and sign in or create an account.
2. Open **TURN Server & SFU → Credentials**. If Metered asks you to choose a TURN plan, review its current price and terms with a parent/guardian before choosing anything paid.
3. Click **Create Credential**. The label, region and project options are optional. You can label it `messaging-web-production` to recognise it later. Use the default options unless you know you need a specific region.
4. Create it and wait up to **two minutes** for the credentials to propagate.
5. On that credential's row click **Get credential → Show API Key**. Copy the **credential API key** (the one for that credential). Do not copy the ICE username/password array, and do not confuse it with the account-wide Secret Key on Metered's Developers page. See the [Metered TURN Quickstart](https://www.metered.ca/docs/turn-server-service/quickstart/).
6. In Metered's left navigation open **Developers** and copy your assigned **Metered Domain**, which looks like `yourappname.metered.live`. Use the exact domain from your account; do not add `https://`, a path, or a trailing slash. The code expects a `.metered.live` domain.
7. Open [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/qoyqfmovzvtyvxutakym/functions/secrets). Add these two secrets using your own values:
   - **Key:** `METERED_TURN_DOMAIN` · **Value:** the domain copied in step 6, such as `yourappname.metered.live`.
   - **Key:** `METERED_TURN_API_KEY` · **Value:** the credential-specific API key copied in step 5.
8. Click **Save**. Supabase makes updated secrets available to Edge Functions without a redeploy. Do not send either value in chat or commit it to GitHub. Supabase's [Edge Function Secrets guide](https://supabase.com/docs/guides/functions/secrets) documents the same dashboard process.
9. In Supabase **Edge Functions**, confirm `master-chat-turn-credentials` and `whatsapp-lookup-identity` show **ACTIVE**. They are already deployed.
10. Open **Edge Functions → master-chat-turn-credentials → Logs** after a call attempt. If the app reports `private_relay_not_configured`, double-check both secret names and values. If Metered rejects the relay immediately after creating a credential, wait two minutes and test again.

## Exact Supabase account setup

1. Open the [Supabase project dashboard](https://supabase.com/dashboard/project/qoyqfmovzvtyvxutakym).
2. Go to **Authentication → Sign In / Providers → Email** and turn **Confirm email OFF** for this username-only prototype. The app uses internal aliases like `username@aeroshell.invalid`, not actual mailboxes. This is a prototype shortcut; a public production app should add genuine email/phone verification and recovery before signup is opened to everyone.
3. Under **Database → Publications / Realtime**, the connected project already publishes the message, request, call, call-signal, read-receipt, poll/event, status/channel and community tables used here. Do not change existing policies just to silence a failed request.
4. Under **Authentication → URL Configuration**, set Site URL to `https://whatsapp-for.vercel.app`. Add `https://whatsapp-for.vercel.app/**` as a Redirect URL. Only add another Vercel URL if you explicitly plan to use that hostname. Recovery/OAuth flows may need the localhost redirect `http://localhost:8080/**` for local testing.
5. Under **Authentication → Security and Protection**, enable leaked-password protection if available on your project plan. The Supabase Advisor previously reported this as disabled.
6. Review **Database → Advisors**. The lookup rate-limit tables intentionally have RLS enabled and no browser policies; don't make them publicly readable. Keep all RLS enabled.

## End-to-end test plan

Test with two separate accounts on two browser profiles or devices; using two tabs logged into the same account is not enough to test delivery or calls.

1. Account A: create a username, display name, unique nine digits after the `+990` prefix and password of at least 8 characters.
2. Account B: create a different username and different custom ID in another browser/device.
3. Account A searches Account B's username and sends a contact request.
4. Account B opens **Contact requests** and accepts it.
5. Send messages both directions. Refresh both devices and verify history persists and delivery/read status updates.
6. Send a private photo or document (up to 15 MB); open it on the other device. Record and send a short voice note; play it on the recipient.
7. In a conversation, create a poll, vote from the other account, create an event, and RSVP from the other account.
8. Publish a text status and confirm the accepted contact can see it. Create a channel, publish a text post, then open it from the other account. Create a community and join it from the other account.
9. Start a voice call. On the other device, allow microphone permission and press **Accept**; check two-way audio and hang up.
10. Repeat with video and allow camera + microphone on both devices. Test once on a different network if possible. Calls must not silently fall back to direct peer connections.

## Install on your devices

- **Windows / macOS — Chrome or Edge:** open the HTTPS app; click the install icon in the address bar if shown, or browser menu → **Install app**. The in-app **Install app** button invokes the native prompt when supported.
- **Android — Chrome:** open the HTTPS app → ⋮ menu → **Install app** or **Add to Home screen**.
- **iPhone / iPad — Safari:** open the HTTPS app → **Share → Add to Home Screen**.
- If an installed copy looks old after deployment, close the app, open the website in the browser and refresh; then reopen the installed app. The service worker cache is bumped for each app-shell update.

## Local development

Serve the repository root over HTTP instead of opening `index.html` using `file://`. With Python installed, run `python -m http.server 8080` from the repository folder and browse to `http://localhost:8080`. Camera/microphone requires HTTPS except localhost. The TURN function already allows this localhost origin.

## Known limits / release caveat

- `+990` is a custom app identifier only; it cannot receive SMS or use the telephone network.
- A valid Metered TURN plan/domain/API key is required before calls can actually connect.
- Group calls use peer-to-peer mesh topology through TURN relays and are limited to eight participants, including the initiator. The eight-person cap is enforced in Postgres as well as in the UI. Abandoned active group calls are ended by the scheduled cleanup after four hours. There is no SFU, server-side media recording, or native lock-screen Accept/Decline action for group calls; a group invitation opens the app so the user can join there.
- Statuses and channel posts currently support one photo or video attachment per post, up to 15 MB. Channel media is visible to signed-in users who can read the corresponding channel post; status media is restricted to the owner and accepted contacts.
- Report submissions are stored for review, but there is no staffed moderation dashboard, automated abuse triage, appeals workflow, or report-status UI yet. Blocking is enforced for direct-message reads/sends; messages in shared groups remain visible, and blocking does not remove either person from shared groups.
- Disappearing messages apply to new messages after the timer is set. Previously sent messages are not retroactively assigned an expiry time. The server hides expired records and the scheduled job sweeps them every five minutes; this is not a forensic secure-erasure guarantee for copies or cached files already downloaded by recipients.
- Custom chat lists sync to the signed-in account; contact display-name aliases remain device-local.
- The +990 identifier is app-only. There is no real phone-number verification, SMS delivery, telephone-network calling, or account recovery through a verified email/phone provider.
- This is an independent service: it cannot chat with ordinary WhatsApp users or accounts on other messaging platforms. It is not affiliated with Meta or the official WhatsApp service.
- The app does not provide end-to-end encryption. Supabase stores message text/metadata and private attachments under its access policies; the app should not be used for messages that require end-to-end confidentiality until a reviewed key-management and encryption design is implemented.
- Account deletion remains disabled in this frontend because the Supabase identity is shared with Windows 12 Master Chat; deleting the identity would affect access to that other app too.
- Static syntax/build checks are not a substitute for the two-account/two-device and multi-device group-call tests above. Verify actual media, notifications, lock-screen behavior and separate-network calls before advertising the service as production-ready.


This is an independent project and is not affiliated with or connected to the official WhatsApp service.


## Android APK updates

The native app checks the public GitHub Releases feed when the app opens and returns to the foreground. If a newer signed release exists, it displays **Update now**. The updater downloads only the `whatsapp.apk` asset from this repository's Releases, verifies the published SHA-256 checksum and APK signing certificate, then opens Android's installer. The user still has to approve installation.

**One-time setup is required before updateable releases can publish.** In GitHub → repository Settings → Secrets and variables → Actions, add:
- `ANDROID_SIGNING_KEYSTORE_BASE64`: Base64-encoded permanent Android release keystore.
- `ANDROID_SIGNING_KEYSTORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`

Keep the keystore and passwords private and backed up securely; never commit them to this public repository. Without these secrets, Actions continues to build the debug APK but deliberately does not publish an update-incompatible release. APKs signed by temporary GitHub runner debug keys are not suitable as a permanent update channel; switching such an installation may require a one-time uninstall/reinstall, which resets device-local data. Messages already in Supabase remain in your cloud account.

SHA-256 verifies that a downloaded file matches the release's declared checksum; it is not a malware scan or an absolute safety guarantee. Review code and ship only releases you trust.


### Custom chat lists

Create custom chat lists such as **Family**, **Work**, or **Wishlist**, choose which conversations appear in each list, and edit or remove a list later. Custom list names and selected conversation IDs sync through Supabase to the signed-in account. Contact display-name aliases remain local to each device.
