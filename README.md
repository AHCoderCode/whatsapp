# WhatsApp (independent web app)
This independent WhatsApp-inspired web app is a responsive, installable messaging app built on Supabase Auth, Postgres, Storage and Realtime. It also includes one-to-one WebRTC voice/video calling through the Supabase TURN-credential function and Metered TURN service.

**Live app:** https://whatsapp-for.vercel.app  
**Source:** https://github.com/AHCoderCode/whatsapp  
**Supabase project:** `windows-12-beta-chat` (`qoyqfmovzvtyvxutakym`)

## What is connected to the backend

- Username/password accounts using Supabase Auth. Usernames and custom IDs are unique. The `+990 xxx xxx xxx` value is an **in-app ID**, not a real telephone number.
- Profile display name, about text and compressed profile photo.
- People search by display name, username, or custom in-app number (with or without the `+990` prefix), with profile photos and direct contact-request actions. Real contact requests (send/accept/decline/cancel), accepted contacts, and persistent direct conversations.
- Persistent group text conversations, group descriptions, and adding accepted contacts to groups.
- Realtime text messages, read receipts, and message removal (own messages can be deleted for everyone; messages from others can be hidden from the local account).
- Private storage attachments and recorded voice notes. The current storage policy accepts files up to 15 MB except video files; voice notes are limited to two minutes.
- Database-backed polls and voting, event invitations and RSVPs, editable/deletable text status updates expiring after 24 hours, channel directory/follows/text posts, and community creation/membership.
- One-to-one audio/video WebRTC calls, including incoming-call controls, mute, camera toggle, hang-up, and relay-only networking. Actual calling requires valid Metered TURN settings and the receiving user to accept the call.
- Installable PWA shell with service worker, manifest icons, install button and browser menu fallback.

Some legacy settings and actions remain local preferences or previews (for example privacy visibility settings, disappearing messages, the in-app camera/status photo capture flow, and some message actions). Communities currently manage membership but do not yet bind subgroups or community announcements. Channels support text posts only; group calls are not included. The app is not connected to real WhatsApp accounts and does not implement WhatsApp's end-to-end encryption.

## Security boundaries

This app uses the Supabase project shared with the Windows 12 Master Chat, so the same account infrastructure is deliberately reused. Account deletion is disabled in this frontend to avoid accidentally deleting an identity used by both apps.

Never place a Supabase service-role/secret key or Metered account secret in HTML, browser JavaScript, GitHub or public Vercel environment variables. The browser contains only the Supabase publishable key and relies on RLS. **Do not disable RLS to make a rejected query work.**

The custom-ID lookup, lookup-rate-limit, group description, polls/events, status/channel/community and channel-post migrations have already been applied to the connected Supabase project. Do not copy-paste or rerun those migrations.

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
- Video file attachments, group calls, channel media posts, photo/video status capture and community subgroup binding are not implemented.
- WhatsApp is independent, cannot message accounts on other messaging services, and does not provide end-to-end encryption. Supabase stores message text/metadata under its existing RLS policies.
- Static syntax/build checks are not a substitute for the two-account/two-device test above. Verify actual audio/video on supported browsers before advertising the service as production-ready.


This is an independent project and is not affiliated with or connected to the official WhatsApp service.
