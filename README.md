# WhatsApp-style messaging app

Responsive, installable messaging web app with Supabase authentication, persistent contact requests, direct and group chats, Realtime message updates, and one-to-one WebRTC voice/video calling.

**Live app:** https://whatsapp-vexel-ai.vercel.app  
**Repository:** https://github.com/AHCoderCode/whatsapp

## What is connected

- Username/password accounts using Supabase Auth; the custom `+990 xxx xxx xxx` identifier is an **in-app ID only**, not a real phone number. It cannot receive SMS or dial the phone network.
- Display name, username, custom ID and profile photo (photo is size-compressed before saving).
- Search registered usernames or look up a custom ID, then send an actual friend/contact request. The recipient accepts or declines; chat access follows the accepted friend relationship.
- Direct and group text messages are stored in Supabase and streamed to signed-in users using Realtime.
- One-to-one audio and video calls use WebRTC and the existing relay-only Supabase Edge Function. Calls require a working Metered TURN account and browser permissions; direct peer connections are intentionally not used.
- PWA installation with an app manifest, service worker, install button and browser-menu fallback.

The number resolver endpoint is a convenience lookup rather than an authentication factor; the password is still checked by Supabase Auth. Persistent throttling is in place, but add CAPTCHA and operational monitoring before exposing the signup/search flow broadly.\n\nSome of the original WhatsApp-style screens (Updates, Channels, Communities, message actions, polls, events, attachments/voice-note controls and some settings) are still partially local or visual UI. Do not treat those controls as connected server features unless the action explicitly saves to Supabase. Group messaging is supported; multi-person group calls and true WhatsApp interoperability are not part of this standalone app.

## Important architecture and security notes

The site uses the shared Supabase project backing the Windows 12 Master Chat so both use the same account directory/contact infrastructure. Its existing row-level security and private profile-discovery functions are retained. A publishable key is intended for client use; **never add a Supabase service-role/secret key to HTML, JavaScript, GitHub, or Vercel public environment variables**. Do not disable RLS to work around a denied query.

The `whatsapp_custom_profile_identifiers` database migration has already been applied to the connected Supabase project by the maintainers. It adds profile display names and custom in-app IDs, and a restricted function to resolve a custom ID to a username. Do not apply the same SQL manually a second time.

## Exact Supabase setup checklist

1. Open Supabase project **windows-12-beta-chat** (project ref `qoyqfmovzvtyvxutakym`) and confirm it is healthy.
2. Go to **Authentication → Sign In / Providers → Email**. Turn **Confirm email OFF** for this username-only prototype. Accounts use internal aliases like `username@aeroshell.invalid`, not real mailboxes. If confirmation remains enabled, signup may create the account without starting a session. For production, prefer real email/phone verification instead of leaving confirmation bypassed.
3. In **SQL Editor**, verify that `public.aeroshell_profiles` has `display_name`, `about`, and `custom_number`; the `aeroshell_username_by_custom_number(text)` function exists; and the custom-number unique index exists. The migration `whatsapp_custom_profile_identifiers` has already been applied. Do not run the migration again.
4. Under **Database → Publications / Realtime**, keep `aeroshell_messages`, `aeroshell_friend_requests`, `aeroshell_calls`, and `aeroshell_call_signals` in `supabase_realtime`. They are already included in this project. Keep row-level security (RLS) enabled.
5. Under **Edge Functions → Secrets**, set the Metered relay secrets using the values from your Metered dashboard:
   - `METERED_TURN_DOMAIN`
   - `METERED_TURN_API_KEY`

   These are server-side Edge Function secrets. Do **not** put the values into GitHub, HTML/JavaScript, or public Vercel variables.
6. Under **Edge Functions**, confirm both `master-chat-turn-credentials` and `whatsapp-lookup-identity` show **ACTIVE**. The custom-ID lookup function uses the platform-provided server-side `SUPABASE_SERVICE_ROLE_KEY`, applies both per-instance throttling and persistent database-backed limits (24 lookups/minute per IP hash and 3/minute per IP/ID pair), and returns only a matching username. IP and target values are SHA-256 hashed with the server-only service key before being stored; raw IP addresses are not stored in the rate-limit tables. Direct anonymous execution of both lookup/rate-limit SQL functions is revoked, and the rate-limit tables have RLS enabled with no client policies.
7. Under **Authentication → URL Configuration**, set Site URL to `https://whatsapp-vexel-ai.vercel.app` and add `https://whatsapp-vexel-ai.vercel.app/**` to Redirect URLs. Add `https://whatsapp-for.vercel.app/**`, `https://whatsapp-git-main-vexel-ai.vercel.app/**`, and `http://localhost:8080/**` only if you use those URLs. Username/password sign-in does not require OAuth redirects, but recovery links may.
8. Under **Project Settings → API / Data API**, ensure the `public` schema is exposed to the Data API. The browser uses only the publishable key and authenticated client calls; table grants/RLS continue to protect records. Do not make profiles, messages or signaling publicly readable.
9. Under **Authentication → Security and Protection**, enable leaked-password protection if available in your project plan. The Supabase Advisor currently reports it disabled.
10. Open **Edge Functions → master-chat-turn-credentials → Logs** after attempting a call. If the app says the relay is not configured or unavailable, recheck the Metered secrets and domain.
11. Open **Database → Advisors** and review security/performance findings. The current security checks no longer report the custom-number SQL function as publicly executable; one private-schema informational finding and disabled leaked-password protection may remain. Do not disable RLS to silence an advisor.
12. Test with two independent accounts/devices before sharing the app.

## Exact end-to-end test

1. Open the live app in a private/incognito window and create **Account A** with a unique username, display name, nine digits after the `+990` prefix, and a password of at least eight characters.
2. Open the app in a second browser profile/device and create **Account B** using a different username and custom ID.
3. From Account A, use **New chat / Find people**, search Account B's username, and send a contact request.
4. In Account B, open **Contact requests** and press **Accept**. Decline and cancel actions should also update the server rather than just removing a local card.
5. Open the new conversation and send a message both ways. Confirm the other device receives it, then reload each browser and confirm history persists.
6. Start a voice call. On the receiving device, allow microphone permission and press **Accept**; confirm two-way audio, then mute and hang up.
7. Repeat with a video call and allow camera + microphone permissions on both devices. Use the browser's site-permission controls if the permission prompt was previously denied.
8. Try another network if relay connectivity fails. A call must never silently fall back to a direct peer connection.

## Install on each device

- **Windows / macOS, Chrome or Edge:** open the live HTTPS URL; use the install icon in the address bar when shown, or browser menu → **Install app**. The page's Install app button invokes the native prompt when the browser exposes it and otherwise explains the browser-menu path.
- **Android:** open the HTTPS URL in Chrome → ⋮ menu → **Install app** or **Add to Home screen**.
- **iPhone / iPad:** open the HTTPS URL in Safari → Share → **Add to Home Screen**.
- If the old version opens after an update, close the installed app, reopen the site, refresh once and then reopen it. The service worker cache version is bumped whenever the app shell changes.

## Local development

Serve the repository root over HTTP (not by opening `index.html` as a `file://` URL). For example, from this directory run `python -m http.server 8080`, then visit `http://localhost:8080`. The site is a static app; no Node build is needed for the frontend. Browser microphone/camera APIs need HTTPS, except localhost, and the Supabase Edge Function must allow the local origin if you want to test calls locally.

## Known limitations

- The custom `+990` number is only a unique app identifier—no SMS, cellular phone calls or access to real WhatsApp accounts.
- One-to-one voice/video calls are real WebRTC calls, but relay credentials are required; no call can connect until the Metered TURN secrets are configured correctly.
- This is not end-to-end-encrypted WhatsApp and is not endorsed by or interoperable with WhatsApp. Supabase stores messages and metadata according to its configured database/storage policies.
- Some legacy UI screens and actions still need separate persistence/QA. Test the specific features you intend to expose before calling this a production-ready public service.
