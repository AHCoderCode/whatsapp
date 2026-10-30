# WhatsApp app status and audit record

**Audit date:** 2026-10-30  
**Repository:** `AHCoderCode/whatsapp`  
**Production site:** https://whatsapp-for.vercel.app

## Current maintenance scope

The contact information screen has dedicated responsive components for contact details and its **More options** actions. On narrow screens, the profile fills the available app width, scrolls vertically inside its own content pane, and lays out each action as icon / flexible text / chevron. The entire row is a real button with a single delegated action, rather than separate text fragments.

The shell asset version is advanced whenever client assets are changed so the service worker can retire its previous cache and request the current CSS and JavaScript.

## Automated source audit

The GitHub Actions smoke suite checks JavaScript parsing, inline HTML script parsing, manifest JSON validity, CSS brace balance, and cross-file PWA asset versions. It also includes regression assertions for responsive account settings, responsive Calls history, contact profile action rows, and the relay-first call setup path.

The existing suite additionally covers selected source-level workflows for:

- Supabase account/profile wiring, contact requests, linked-device session revocation, and row-level security migrations.
- Message editing, deletion/clearing, reactions, read receipts, polls, events, and private attachment handling.
- Notification registration, push delivery handlers, call alerts, native Android Accept/Decline actions, and cold-start call recovery.
- WebRTC relay configuration, direct-fallback signaling, microphone acquisition, Android audio routing, call controls, ringtone persistence, and update checking.
- Responsive navigation, landscape conversation layout, touch interactions, keyboard focus, and mobile Calls history.

A passing source test proves only that the asserted code structure and static conditions are present. It does not prove that every backend configuration, remote network, browser permission, device OEM setting, or real-time service works on every device.

## Device and browser verification status

The automated repository workflow can build and sign an Android APK. This audit does **not** represent physical testing on every Android phone, iPhone, tablet, desktop, browser, network, or OS version.

The following manual matrix remains required for a complete device sign-off:

| Target | Manual checks still required |
|---|---|
| Android phone, narrow width (320–380 px) | Contact info scroll, every More options row, tap targets, bottom safe area, keyboard and back navigation |
| Android phone, standard width (390–480 px) | Contact info, media tiles, Calls tab, incoming/outgoing audio and video calls |
| Android landscape | Conversation, contact info, call overlay and controls |
| Android WebView / installed APK | Microphone/camera permission, notification actions, lock-screen calls, update over existing installation |
| Android Chrome PWA | Install, refresh/cache update, push permissions and background behavior |
| iPhone Safari / installed web app | Responsive profile, browser permission behavior, call and media compatibility |
| Tablet and desktop | Sidebar/main-pane layout, contact profile width, keyboard navigation, call-window layout |

## Known product limitations

The project README documents the following known limitations; this UI audit does not remove them:

- The custom `+990` identifier is not a telephone number and cannot receive SMS.
- Real calls require valid Metered TURN configuration, and WebRTC behavior depends on the network and device.
- Group calling, channel media posts, photo/video status capture, and community subgroup binding are not implemented.
- The app is independent of official WhatsApp and does not provide end-to-end encryption.
- Some report/block and disappearing-message controls are frontend preview/local behavior, not a complete server-enforced moderation or disappearing-message system.

## Sign-off rule

Do not label the app “works on every device” based only on a successful build or source smoke suite. Mark a device/browser as verified only after testing that specific environment with two signed-in accounts and recording the result.


## Call reliability and Find People follow-up

The October 30 follow-up hardens the Metered ICE server configuration. The Edge Function no longer overrides the workspace/credential region with a fixed Asia value; it derives the relay hostname returned by Metered and supplies all four documented transport variants (UDP and TCP on port 80, UDP on port 443, and TLS/TCP on port 443). The Android shell now holds a bounded partial CPU wake lock for an active native call and releases it with native call-audio cleanup. This is intended to reduce WebRTC/Realtime interruption while the screen is locked; it cannot override carrier restrictions, OEM background policies, disabled notification channels, or networks that block every TURN route.

Find People result cards now keep their contact action inside a dedicated responsive row with a full-size labelled button. New Group and New Community remain available from the overflow menu and continue to call their existing Supabase create flows.

The automated suite adds source assertions for TURN transport coverage, native wake-lock acquisition/release, responsive contact actions, and the group/community entry points. It does not simulate a TURN allocation or prove a completed call. A real two-account call over separate Wi-Fi/mobile networks, followed by screen-lock and accept/decline tests on physical Android devices, remains required for sign-off.
