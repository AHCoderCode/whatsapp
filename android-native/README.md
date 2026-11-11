# Native Android call-alert companion

The hosted PWA uses browser Web Push. This Android shell adds a native Firebase Cloud Messaging receiver so Android can post a call alert without waiting for the WebView to resume. Call notifications use direct Activity PendingIntents for Accept/Decline, an Android full-screen call intent, and lock-screen wake flags while the incoming-call screen is active. Android may still require the user to enable Full-screen notifications special access; manufacturer battery/network restrictions can also delay delivery.

This companion uses the existing hosted UI and Supabase account; it does not replace the call backend or TURN configuration. It is not enabled on the hosted website by itself: install the native app and complete Firebase setup first. Verify delivery on a real phone before relying on it.

## One-time Firebase setup

1. Open https://console.firebase.google.com/ and create a Firebase project for this app. Do not enable paid products just for push.
2. Add an Android app with package name exactly com.ahcodercode.whatsapp.
3. Download google-services.json and place it at android-native/app/google-services.json. The file is ignored by Git; do not commit it or paste it into chat.
4. In Firebase project settings, open Service accounts and download a private-key JSON only if you are authorized to administer the project. Keep it private.
5. Open Supabase Dashboard → Edge Functions → Secrets for project qoyqfmovzvtyvxutakym and add FIREBASE_SERVICE_ACCOUNT_JSON, with the entire service-account JSON as the value. Never put that private key in browser JavaScript, GitHub, or public Vercel variables.
6. Build and install this Android app, open it, allow notification permission, and sign in with the same WhatsApp app account. The app passes its native FCM token to the authenticated Supabase backend.
7. Confirm the receiving account has a row in public.whatsapp_android_push_tokens with calls_enabled = true. Call delivery logs should stop reporting firebase-not-configured and show Android FCM sending.
8. Test with the phone unlocked first, then from Facebook, then with the screen off while the phone remains powered on. Do not force-stop it for the first test. Review Android Settings → Apps → WhatsApp → Notifications → Incoming calls if the channel is silent or disabled. On Android 14+, open Settings → Apps → Special app access → Full-screen notifications and allow WhatsApp if that option is shown.

## Open and build

1. Install Android Studio and an Android SDK for API 36 plus Java 17.
2. Open the android-native folder as an existing Android project.
3. Add the local google-services.json before Gradle sync; otherwise the Google Services Gradle plugin intentionally fails the build.
4. Build with Build → Build APK(s) and install the debug APK on the Poco C75.
5. Sign in, ensure Calls is enabled in the web app settings, then test background calls.

## What's included

- Native high-importance Incoming calls channel with system ringtone and vibration.
- Accept, decline, and open actions route directly into the existing web call UI through Activity PendingIntents.
- Full-screen call intent and lock-screen wake flags for incoming-call UI, subject to Android special access and device policy.
- Native FCM token registration via the authenticated Supabase Edge Function; token unregisters at sign-out.
- WebView microphone/camera permission requests and file chooser support.

Native FCM depends on Google Play services, Android notification permission, network availability, and the phone's own background settings. It improves the architecture but is not a delivery guarantee until real-device tests pass.


## Signed release and in-app updates

Back up one permanent Android signing keystore. In GitHub repository Settings → Secrets and variables → Actions, configure `ANDROID_SIGNING_KEYSTORE_BASE64`, `ANDROID_SIGNING_KEYSTORE_PASSWORD`, `ANDROID_SIGNING_KEY_ALIAS`, and `ANDROID_SIGNING_KEY_PASSWORD`. Never commit the keystore or passwords. With all four secrets configured, the main-branch workflow publishes a versioned signed `whatsapp.apk` to GitHub Releases. The Android app checks for new versions on launch, verifies the checksum and signing certificate, and opens Android's package installer. User approval is still required. If the installed APK uses a temporary per-run debug key, a one-time switch may need uninstalling that old build.
