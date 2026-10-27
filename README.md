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

Some of the original WhatsApp-style screens (Updates, Channels, Communities, message actions, polls, events, attachments/voice-note controls and some settings) are still partially local or visual UI. Do not treat those controls as connected server features unless the action explicitly saves to Supabase. Group messaging is supported; multi-person group calls and true WhatsApp interoperability are not part of this standalone app.

## Important architecture and security notes

The site uses the shared Supabase project backing the Windows 12 Master Chat so both use the same account directory/contact infrastructure. Its existing row-level security and private profile-discovery functions are retained. A publishable key is intended for client use; **never add a Supabase service-role/secret key to HTML, JavaScript, GitHub, or Vercel public environment variables**. Do not disable RLS to work around a denied query.

The `whatsapp_custom_profile_identifiers` database migration has already been applied to the connected Supabase project by the maintainers. It adds profile display names and custom in-app IDs, and a restricted function to resolve a custom ID to a username. Do not apply the same SQL manually a second time.

## Exact Supabase setup checklist

1. Open the Supabase project named **windows-12-beta-chat** (project ref `qoyqfmovzvtyvxutakym`) and verify it is **Healthy**.
2. In **Authentication → Sign In / Providers → Email**, turn **Confirm email OFF** for this username-only prototype. Auth accounts use internal aliases of the form `username@aeroshell.invalid`; these are not mailboxes. If email confirmation stays enabled, signup will create an account without an active session and the UI will tell you why. For production, prefer a real email/phone verification flow instead of permanent confirmation bypass.
3. Open **SQL Editor** and verify the migration is installed. The profile table should contain `display_name`, `about`, and `custom_number`; the function `public.aeroshell_username_by_custom_number(text)` should exist. Do not drop or recreate the existing tables/functions.
4. In **Database → Publications / Realtime**, keep these existing tables in the `supabase_realtime` publication: `aeroshell_messages`, `aeroshell_friend_requests`, `aeroshell_calls`, and `aeroshell_call_signals`. The current shared project already publishes these tables. Keep RLS enabled.
5. In **Edge Functions → Secrets**, configure these secrets using the credentials from your Metered relay account:
   - `METERED_TURN_DOMAIN`
   - `METERED_TURN_API_KEY`

   These are server-side Edge Function secrets, **not** Vercel/browser variables. Never paste their values into this repository. The deployed function is `master-chat-turn-credentials`; its allowed origins include the messaging app's production and preview Vercel domains.
6. In **Authentication → URL Configuration**, set the Site URL to `https://whatsapp-vexel-ai.vercel.app` and add this URL to Redirect URLs: `https://whatsapp-vexel-ai.vercel.app/**`. Add `https://whatsapp-for.vercel.app/**` and `https://whatsapp-git-main-vexel-ai.vercel.app/**` if you use those aliases, and `http://localhost:8080/**` for local testing. The current username/password flow does not rely on OAuth redirects, but these settings prevent confusion when testing recovery or links.
7. In **Project Settings → API / Data API**, make sure the `public` schema is available to the Data API. This app uses only the publishable key and authenticated client calls; all user data is guarded by the existing table grants and RLS policies. Never make the profiles, messages or call signals publicly readable.
8. Open **Edge Functions → master-chat-turn-credentials → Logs** after attempting a call. If the app says the relay is not configured, recheck the two Metered secrets and make sure your Metered account/domain is active.
9. Open **Database → Advisors** and resolve any security warning that applies to these app tables without disabling RLS. Test with two independent users before sharing the app.

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
