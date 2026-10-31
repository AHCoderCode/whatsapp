package com.ahcodercode.whatsapp;

import android.os.PowerManager;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.pm.Signature;
import android.net.Uri;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.AudioDeviceInfo;
import android.provider.MediaStore;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import android.provider.Settings;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    public static final String HOME_URL = "https://whatsapp-for.vercel.app/";
    private static final int REQUEST_NOTIFICATIONS = 8001, REQUEST_MEDIA = 8002, REQUEST_FILE = 8003, REQUEST_CAPTURE = 8004;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private Uri pendingCaptureUri;
    private volatile boolean forceCameraCaptureOnNextChooser;
    private AudioManager callAudioManager;
    private PowerManager.WakeLock callCpuWakeLock;
    private AudioFocusRequest callAudioFocusRequest;
    private int previousAudioMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerphoneOn;
    private int previousCommunicationDeviceId = -1;
    private boolean callAudioSessionActive;
    private final AudioManager.OnAudioFocusChangeListener callAudioFocusListener = focusChange -> {};
    private PermissionRequest pendingWebPermissionRequest;
    private String pendingUrl = HOME_URL, fcmToken = "";
    private String pendingNativeCallId = "", pendingNativeCallAction = "";
    private int pendingNativeCallDispatchAttempts;
    private boolean pendingNativeCallDispatching;
    private boolean pageLoaded;

    private final BroadcastReceiver tokenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String token = intent.getStringExtra(WhatsAppMessagingService.EXTRA_TOKEN);
            if (token != null && !token.trim().isEmpty()) { fcmToken = token.trim(); publishFcmToken(); }
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        NativeCallNotifications.ensureChannel(this);
        NativeCallNotifications.ensureMessageChannel(this);
        IntentFilter filter = new IntentFilter(WhatsAppMessagingService.ACTION_TOKEN_UPDATED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(tokenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(tokenReceiver, filter);

        webView = new WebView(this);
        webView.addJavascriptInterface(new NativeAppBridge(), "WhatsAppNativeAndroid");
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeUrl(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeUrl(Uri.parse(url));
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isTrustedAppUrl(Uri.parse(url))) {
                    pageLoaded = true;
                    publishFcmToken();
                    if (!pendingNativeCallId.isEmpty()) webView.postDelayed(MainActivity.this::dispatchPendingNativeCallAction, 250);
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                boolean forceCamera = forceCameraCaptureOnNextChooser;
                forceCameraCaptureOnNextChooser = false;
                if (forceCamera || (params != null && params.isCaptureEnabled())) {
                    try {
                        Intent capture = createCaptureIntent(params, forceCamera);
                        if (capture != null) {
                            startActivityForResult(capture, REQUEST_CAPTURE);
                            return true;
                        }
                    } catch (Exception captureError) {
                        android.util.Log.w("WhatsApp", "No native camera activity could handle the capture request; opening the in-app camera.", captureError);
                        pendingCaptureUri = null;
                    }
                    if (forceCamera) {
                        fileChooserCallback = null;
                        pendingCaptureUri = null;
                        callback.onReceiveValue(null);
                        view.post(() -> view.evaluateJavascript(
                            "if(window.__waCameraCaptureFallback)window.__waCameraCaptureFallback();", null
                        ));
                        return true;
                    }
                }
                try {
                    Intent picker = null;
                    try { if (params != null) picker = params.createIntent(); } catch (Exception ignored) {}
                    if (picker == null) {
                        picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        picker.addCategory(Intent.CATEGORY_OPENABLE);
                        picker.setType("*/*");
                    }
                    startActivityForResult(Intent.createChooser(picker, "Choose a photo, video, or file"), REQUEST_FILE);
                    return true;
                } catch (Exception firstError) {
                    try {
                        Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                        fallback.addCategory(Intent.CATEGORY_OPENABLE);
                        fallback.setType("*/*");
                        startActivityForResult(Intent.createChooser(fallback, "Choose a file"), REQUEST_FILE);
                        return true;
                    } catch (Exception secondError) {
                        fileChooserCallback = null;
                        pendingCaptureUri = null;
                        callback.onReceiveValue(null);
                        return false;
                    }
                }
            }
        });
        setContentView(webView);
        handleLaunchIntent(getIntent());
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
        refreshFcmToken();
    }

    private boolean isTrustedAppUrl(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
            && "whatsapp-for.vercel.app".equalsIgnoreCase(uri.getHost());
    }
    private boolean routeUrl(Uri uri) {
        if (isTrustedAppUrl(uri)) return false;
        String scheme = uri.getScheme();
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
        }
        return true;
    }
    private void applyIncomingCallWindowFlags(Intent intent) {
        boolean incomingCall = intent != null && intent.getBooleanExtra("waNativeIncomingCall", false);
        if (intent != null && !incomingCall) {
            String launchUrl = intent.getStringExtra("waNativeLaunchUrl");
            if (launchUrl != null) {
                Uri uri = Uri.parse(launchUrl);
                incomingCall = "call".equals(uri.getQueryParameter("waPushKind"))
                    && uri.getQueryParameter("waCallId") != null
                    && !"decline".equalsIgnoreCase(uri.getQueryParameter("waPushAction"));
            }
        }
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(incomingCall);
            setTurnScreenOn(incomingCall);
        } else {
            int flags = android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (incomingCall) getWindow().addFlags(flags);
            else getWindow().clearFlags(flags);
        }
        if (incomingCall) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private void handleLaunchIntent(Intent intent) {
        if (intent == null) return;
        applyIncomingCallWindowFlags(intent);
        String url = intent.getStringExtra("waNativeLaunchUrl");
        rememberPendingNativeCallAction(intent, url);
        int notificationId = intent.getIntExtra("waNotificationId", -1);
        if (notificationId >= 0) NativeCallNotifications.cancel(this, notificationId);
        if (url != null && isTrustedAppUrl(Uri.parse(url))) pendingUrl = url;
        if (webView != null) webView.loadUrl(pendingUrl);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIncomingCallWindowFlags(intent);
        String url = intent.getStringExtra("waNativeLaunchUrl");
        rememberPendingNativeCallAction(intent, url);
        int notificationId = intent.getIntExtra("waNotificationId", -1);
        if (notificationId >= 0) NativeCallNotifications.cancel(this, notificationId);
        if (url != null && isTrustedAppUrl(Uri.parse(url))) {
            pendingUrl = url;
            if (webView != null) {
                if (isCallLaunchIntent(intent, url) && pageLoaded) {
                    // Keep the authenticated WebView alive. Reloading here would
                    // briefly show the session boot screen and can race the call action.
                    webView.postDelayed(MainActivity.this::dispatchPendingNativeCallAction, 100);
                } else {
                    webView.loadUrl(url);
                }
            }
        }
    }

    private boolean isCallLaunchIntent(Intent intent, String launchUrl) {
        try {
            Uri uri = launchUrl != null && !launchUrl.trim().isEmpty()
                ? Uri.parse(launchUrl) : (intent != null ? intent.getData() : null);
            return uri != null && "call".equals(uri.getQueryParameter("waPushKind"))
                && uri.getQueryParameter("waCallId") != null;
        } catch (Exception ignored) { return false; }
    }

    private void rememberPendingNativeCallAction(Intent intent, String launchUrl) {
        Uri uri = null;
        try {
            if (launchUrl != null && !launchUrl.trim().isEmpty()) uri = Uri.parse(launchUrl);
            else if (intent != null && intent.getData() != null) uri = intent.getData();
        } catch (Exception ignored) {}
        if (uri == null || !"call".equals(uri.getQueryParameter("waPushKind"))) return;
        String callId = uri.getQueryParameter("waCallId");
        if (callId == null || callId.trim().isEmpty()) return;
        String action = uri.getQueryParameter("waPushAction");
        if (!"accept".equals(action) && !"decline".equals(action) && !"open".equals(action)) action = "open";
        pendingNativeCallId = callId.trim();
        pendingNativeCallAction = action;
        pendingNativeCallDispatchAttempts = 0;
        pendingNativeCallDispatching = false;
    }

    private void dispatchPendingNativeCallAction() {
        if (webView == null || pendingNativeCallId.isEmpty() || pendingNativeCallDispatching) return;
        pendingNativeCallDispatching = true;
        int attempt = ++pendingNativeCallDispatchAttempts;
        String script = "(function(){var api=window.WhatsAppCalls;"
            + "if(!api||typeof api.handleNotificationAction!=='function')return false;"
            + "api.handleNotificationAction({kind:'call',callId:" + JSONObject.quote(pendingNativeCallId)
            + ",action:" + JSONObject.quote(pendingNativeCallAction) + "});return true;})()";
        webView.evaluateJavascript(script, value -> {
            pendingNativeCallDispatching = false;
            if ("true".equals(value)) {
                pendingNativeCallId = "";
                pendingNativeCallAction = "";
                pendingNativeCallDispatchAttempts = 0;
            } else if (pendingNativeCallDispatchAttempts < 12 && webView != null) {
                webView.postDelayed(MainActivity.this::dispatchPendingNativeCallAction, 300);
            } else {
                android.util.Log.w("WhatsApp", "Native call action could not be forwarded to the call controller after WebView startup.");
                pendingNativeCallId = "";
                pendingNativeCallAction = "";
                pendingNativeCallDispatchAttempts = 0;
            }
        });
    }
    private Intent createCaptureIntent(WebChromeClient.FileChooserParams params, boolean forceCapture) throws java.io.IOException {
        if (!forceCapture && (params == null || !params.isCaptureEnabled())) return null;
        StringBuilder accepted = new StringBuilder();
        if (params != null) for (String type : params.getAcceptTypes()) if (type != null) accepted.append(type.toLowerCase(java.util.Locale.ROOT)).append(",");
        boolean video = accepted.toString().contains("video/") && !accepted.toString().contains("image/");
        File directory = new File(getCacheDir(), "capture");
        if (!directory.exists() && !directory.mkdirs()) throw new java.io.IOException("Could not prepare camera capture.");
        File output = File.createTempFile(video ? "wa-video-" : "wa-photo-", video ? ".mp4" : ".jpg", directory);
        pendingCaptureUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", output);
        Intent intent = new Intent(video ? MediaStore.ACTION_VIDEO_CAPTURE : MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCaptureUri);
        intent.setClipData(ClipData.newRawUri("WhatsApp camera capture", pendingCaptureUri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return intent;
    }

    private synchronized void acquireCallCpuWakeLock() {
        PowerManager manager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (manager == null) return;
        if (callCpuWakeLock != null && callCpuWakeLock.isHeld()) return;
        callCpuWakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,
            getPackageName() + ":WhatsAppCall");
        callCpuWakeLock.setReferenceCounted(false);
        // Bounded timeout prevents a leaked wake lock holding the CPU indefinitely.
        callCpuWakeLock.acquire(3L * 60L * 60L * 1000L);
    }

    private synchronized void releaseCallCpuWakeLock() {
        PowerManager.WakeLock wakeLock = callCpuWakeLock;
        callCpuWakeLock = null;
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (RuntimeException ignored) {}
        }
    }

    private AudioDeviceInfo findCommunicationDevice(AudioManager manager, int deviceType) {
        if (Build.VERSION.SDK_INT < 31) return null;
        for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
            if (device.getType() == deviceType) return device;
        }
        return null;
    }

    private boolean routeNativeCallAudio(AudioManager manager, boolean useSpeaker) {
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo target = null;
            if (useSpeaker) {
                target = findCommunicationDevice(manager, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
            } else {
                int[] preferredTypes = new int[] {
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                    AudioDeviceInfo.TYPE_BLE_HEADSET,
                    AudioDeviceInfo.TYPE_WIRED_HEADSET,
                    AudioDeviceInfo.TYPE_USB_HEADSET,
                    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
                    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                };
                for (int type : preferredTypes) {
                    target = findCommunicationDevice(manager, type);
                    if (target != null) break;
                }
            }
            if (target != null && manager.setCommunicationDevice(target)) return true;
        }
        // Legacy routing fallback for Android 11 and devices without a modern route.
        manager.setSpeakerphoneOn(useSpeaker);
        return true;
    }

    private void restoreNativeCallAudioRoute(AudioManager manager) {
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo previous = null;
            if (previousCommunicationDeviceId >= 0) {
                for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                    if (device.getId() == previousCommunicationDeviceId) {
                        previous = device;
                        break;
                    }
                }
            }
            if (previous != null) manager.setCommunicationDevice(previous);
            else manager.clearCommunicationDevice();
        } else {
            manager.setSpeakerphoneOn(previousSpeakerphoneOn);
        }
    }

    private synchronized boolean beginNativeCallAudio(boolean useSpeaker) {
        AudioManager manager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return false;
        boolean hadActiveSession = callAudioSessionActive;
        if (!hadActiveSession) {
            previousAudioMode = manager.getMode();
            previousSpeakerphoneOn = manager.isSpeakerphoneOn();
            previousCommunicationDeviceId = -1;
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo previousDevice = manager.getCommunicationDevice();
                if (previousDevice != null) previousCommunicationDeviceId = previousDevice.getId();
            }
            callAudioManager = manager;
        }
        try {
            // Prepare Android's communication route before WebView/WebRTC opens
            // AudioRecord through getUserMedia().
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 26) {
                if (callAudioFocusRequest == null) {
                    callAudioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        .setOnAudioFocusChangeListener(callAudioFocusListener).build();
                }
                manager.requestAudioFocus(callAudioFocusRequest);
            } else {
                manager.requestAudioFocus(callAudioFocusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
            routeNativeCallAudio(manager, useSpeaker);
            acquireCallCpuWakeLock();
            callAudioSessionActive = true;
            return true;
        } catch (RuntimeException error) {
            android.util.Log.e("WhatsApp", "Native call audio setup failed", error);
            releaseCallCpuWakeLock();
            if (!hadActiveSession) {
                try {
                    restoreNativeCallAudioRoute(manager);
                    manager.setMode(previousAudioMode);
                } catch (Exception restoreError) {
                    android.util.Log.w("WhatsApp", "Could not restore audio after call setup failed", restoreError);
                }
                callAudioManager = null;
                callAudioSessionActive = false;
            }
            return false;
        }
    }

    private synchronized void setNativeCallSpeaker(boolean enabled) {
        if (callAudioManager != null && callAudioSessionActive) {
            try { routeNativeCallAudio(callAudioManager, enabled); } catch (Exception ignored) {}
        }
    }

    private synchronized void endNativeCallAudio() {
        AudioManager manager = callAudioManager;
        if (manager == null || !callAudioSessionActive) {
            releaseCallCpuWakeLock();
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= 26 && callAudioFocusRequest != null) manager.abandonAudioFocusRequest(callAudioFocusRequest);
            else manager.abandonAudioFocus(callAudioFocusListener);
            restoreNativeCallAudioRoute(manager);
            manager.setMode(previousAudioMode);
        } catch (Exception ignored) {}
        callAudioSessionActive = false;
        callAudioManager = null;
        previousCommunicationDeviceId = -1;
        releaseCallCpuWakeLock();
    }


    private static final String UPDATE_API_URL = "https://api.github.com/repos/AHCoderCode/whatsapp/releases/latest";
    private static final String RELEASE_APK_PREFIX = "https://github.com/AHCoderCode/whatsapp/releases/download/";

    private void notifyUpdateJavascript(String functionName, String jsonArgument) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String js = "try{if(typeof window." + functionName + "==='function')window." + functionName + "(" + jsonArgument + ");}catch(e){}";
            webView.evaluateJavascript(js, null);
        });
    }

    private static String readLimited(InputStream stream, int maxBytes) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read, total = 0;
        while ((read = stream.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) throw new IOException("GitHub response exceeded the expected size.");
            output.write(buffer, 0, read);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    private static String releaseLine(String body, String label) {
        if (body == null) return "";
        for (String line : body.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith(label)) return trimmed.substring(label.length()).trim();
        }
        return "";
    }

    private void checkForUpdates() {
        new Thread(() -> {
            JSONObject result = new JSONObject();
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(UPDATE_API_URL).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(10000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "WhatsApp-Android-Updater");
                int status = connection.getResponseCode();
                if (status == 404) {
                    result.put("updateAvailable", false);
                    result.put("noReleasePublished", true);
                    notifyUpdateJavascript("waOnNativeUpdateCheck", result.toString());
                    return;
                }
                if (status != HttpURLConnection.HTTP_OK) throw new IOException("GitHub returned HTTP " + status + ".");
                JSONObject release = new JSONObject(readLimited(connection.getInputStream(), 2 * 1024 * 1024));
                String body = release.optString("body", "");
                String versionCodeText = releaseLine(body, "Version code:");
                String versionName = releaseLine(body, "Version:");
                String checksum = releaseLine(body, "APK SHA-256:").toLowerCase(Locale.ROOT);
                int versionCode;
                try { versionCode = Integer.parseInt(versionCodeText); }
                catch (NumberFormatException error) { throw new IOException("The latest release has no valid Android version code."); }
                if (!checksum.matches("[a-f0-9]{64}")) throw new IOException("The release checksum is missing or invalid.");
                String apkUrl = "";
                org.json.JSONArray assets = release.optJSONArray("assets");
                if (assets != null) for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.optJSONObject(i);
                    if (asset != null && "whatsapp.apk".equals(asset.optString("name"))) {
                        apkUrl = asset.optString("browser_download_url", "");
                        break;
                    }
                }
                if (!apkUrl.startsWith(RELEASE_APK_PREFIX)) throw new IOException("The latest release does not contain a trusted WhatsApp APK asset.");
                result.put("updateAvailable", versionCode > BuildConfig.VERSION_CODE);
                result.put("versionCode", versionCode);
                result.put("versionName", versionName.isEmpty() ? release.optString("tag_name", "latest") : versionName);
                result.put("apkUrl", apkUrl);
                result.put("sha256", checksum);
                result.put("installedVersionCode", BuildConfig.VERSION_CODE);
                result.put("installedVersionName", BuildConfig.VERSION_NAME);
                result.put("releaseUrl", release.optString("html_url", "https://github.com/AHCoderCode/whatsapp/releases"));
            } catch (Exception error) {
                try {
                    result.put("updateAvailable", false);
                    result.put("checkFailed", true);
                    result.put("message", "Could not check for updates: " + String.valueOf(error.getMessage()));
                } catch (Exception ignored) {}
            } finally {
                if (connection != null) connection.disconnect();
            }
            notifyUpdateJavascript("waOnNativeUpdateCheck", result.toString());
        }, "wa-update-check").start();
    }

    private void downloadAndInstallUpdate(String apkUrl, String expectedSha256) {
        new Thread(() -> {
            try {
                if (apkUrl == null || !apkUrl.startsWith(RELEASE_APK_PREFIX))
                    throw new IOException("Only APKs published by the WhatsApp GitHub Releases page can be installed.");
                String expected = expectedSha256 == null ? "" : expectedSha256.toLowerCase(Locale.ROOT).trim();
                if (!expected.matches("[a-f0-9]{64}")) throw new IOException("The release checksum is invalid.");
                File folder = new File(getCacheDir(), "updates");
                if (!folder.exists() && !folder.mkdirs()) throw new IOException("Could not prepare update storage.");
                File apk = new File(folder, "whatsapp-update.apk");
                if (!apk.isFile() || !expected.equals(sha256File(apk))) {
                    File partial = new File(folder, "whatsapp-update.part");
                    if (partial.exists()) partial.delete();
                    HttpURLConnection connection = (HttpURLConnection) new URL(apkUrl).openConnection();
                    try {
                        connection.setRequestMethod("GET");
                        connection.setConnectTimeout(12000);
                        connection.setReadTimeout(20000);
                        connection.setInstanceFollowRedirects(true);
                        connection.setRequestProperty("User-Agent", "WhatsApp-Android-Updater");
                        int status = connection.getResponseCode();
                        if (status != HttpURLConnection.HTTP_OK) throw new IOException("APK download returned HTTP " + status + ".");
                        if (connection.getContentLengthLong() > 100L * 1024L * 1024L) throw new IOException("The APK exceeds the 100 MB safety limit.");
                        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                            byte[] buffer = new byte[16384];
                            int read; long total = 0;
                            while ((read = input.read(buffer)) != -1) {
                                total += read;
                                if (total > 100L * 1024L * 1024L) throw new IOException("The APK exceeded the 100 MB safety limit.");
                                output.write(buffer, 0, read);
                            }
                            output.flush();
                        }
                    } finally { connection.disconnect(); }
                    if (!expected.equals(sha256File(partial))) {
                        partial.delete();
                        throw new IOException("The downloaded APK failed its SHA-256 integrity check. Nothing was installed.");
                    }
                    if (apk.exists()) apk.delete();
                    if (!partial.renameTo(apk)) throw new IOException("Could not finalize the downloaded APK.");
                }
                int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
                PackageInfo candidate = getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), flags);
                if (candidate == null || candidate.applicationInfo == null || !getPackageName().equals(candidate.applicationInfo.packageName))
                    throw new IOException("The downloaded file is not the WhatsApp Android package.");
                if (!hasSameSigningCertificate(apk))
                    throw new IOException("The APK signing key differs from the installed app. A one-time switch to the permanent signed release may be necessary; device-only settings may reset if the old app must be uninstalled, while Supabase cloud chats remain in your account.");
                if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                    runOnUiThread(() -> {
                        notifyUpdateJavascript("waNativeUpdateInstallFailed", JSONObject.quote("Allow WhatsApp to install unknown apps in Android Settings, return to the app, then tap Update now again."));
                        try {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                            startActivity(settings);
                        } catch (Exception ignored) {}
                    });
                    return;
                }
                Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
                runOnUiThread(() -> {
                    try {
                        Intent installer = new Intent(Intent.ACTION_VIEW);
                        installer.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(installer);
                    } catch (Exception error) {
                        notifyUpdateJavascript("waNativeUpdateInstallFailed", JSONObject.quote("Android could not open the installer: " + String.valueOf(error.getMessage())));
                    }
                });
            } catch (Exception error) {
                String detail = String.valueOf(error.getMessage() == null ? "The update could not be installed." : error.getMessage());
                notifyUpdateJavascript("waNativeUpdateInstallFailed", JSONObject.quote(detail));
            }
        }, "wa-update-install").start();
    }

    private static String sha256File(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    private boolean hasSameSigningCertificate(File apk) throws Exception {
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = getPackageManager().getPackageInfo(getPackageName(), flags);
        PackageInfo candidate = getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (candidate == null) return false;
        Signature[] installedSignatures;
        Signature[] candidateSignatures;
        if (Build.VERSION.SDK_INT >= 28) {
            if (installed.signingInfo == null || candidate.signingInfo == null) return false;
            installedSignatures = installed.signingInfo.getApkContentsSigners();
            candidateSignatures = candidate.signingInfo.getApkContentsSigners();
        } else {
            installedSignatures = installed.signatures;
            candidateSignatures = candidate.signatures;
        }
        return installedSignatures != null && candidateSignatures != null && Arrays.equals(installedSignatures, candidateSignatures);
    }

    private void refreshFcmToken() {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    fcmToken = task.getResult().trim();
                    if (!fcmToken.isEmpty()) {
                        getSharedPreferences("whatsapp_native_push", MODE_PRIVATE)
                            .edit().putString("fcm_token", fcmToken).apply();
                    }
                    publishFcmToken();
                }
            });
        } catch (Exception ignored) {}
    }
    private void publishFcmToken() {
        if (!pageLoaded || webView == null || fcmToken == null || fcmToken.isEmpty()) return;
        String js = "window.onWhatsAppNativePushToken && window.onWhatsAppNativePushToken(" + JSONObject.quote(fcmToken) + ");";
        runOnUiThread(() -> { if (webView != null) webView.evaluateJavascript(js, null); });
    }
    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }
    private void handleWebPermissionRequest(PermissionRequest request) {
        List<String> missing = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && !hasPermission(Manifest.permission.RECORD_AUDIO))
                missing.add(Manifest.permission.RECORD_AUDIO);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && !hasPermission(Manifest.permission.CAMERA))
                missing.add(Manifest.permission.CAMERA);
        }
        if (missing.isEmpty()) { grantAvailableResources(request); return; }
        if (pendingWebPermissionRequest != null) pendingWebPermissionRequest.deny();
        pendingWebPermissionRequest = request;
        requestPermissions(missing.stream().distinct().toArray(String[]::new), REQUEST_MEDIA);
    }
    private void grantAvailableResources(PermissionRequest request) {
        List<String> allowed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && hasPermission(Manifest.permission.RECORD_AUDIO)) allowed.add(resource);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && hasPermission(Manifest.permission.CAMERA)) allowed.add(resource);
        }
        if (allowed.isEmpty()) request.deny(); else request.grant(allowed.toArray(new String[0]));
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == REQUEST_MEDIA && pendingWebPermissionRequest != null) {
            PermissionRequest request = pendingWebPermissionRequest;
            pendingWebPermissionRequest = null;
            grantAvailableResources(request);
        }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if ((code == REQUEST_FILE || code == REQUEST_CAPTURE) && fileChooserCallback != null) {
            ValueCallback<Uri[]> callback = fileChooserCallback;
            fileChooserCallback = null;
            Uri captureUri = pendingCaptureUri;
            pendingCaptureUri = null;
            if (code == REQUEST_CAPTURE) callback.onReceiveValue(result == RESULT_OK && captureUri != null ? new Uri[]{captureUri} : null);
            else callback.onReceiveValue(result == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(result, data) : null);
        }
    }
    @Override protected void onResume() {
        super.onResume();
        refreshFcmToken();
        publishFcmToken();
        if (webView != null) {
            webView.postDelayed(() -> webView.evaluateJavascript(
                "if(window.waNativeAppResumed)window.waNativeAppResumed();"
                    + "if(window.WhatsAppCalls&&window.WhatsAppCalls.resume)window.WhatsAppCalls.resume();", null
            ), 350);
        }
    }

    private final class NativeAppBridge {
        @JavascriptInterface public boolean isNativeApp() { return true; }
        @JavascriptInterface public int getVersionCode() { return BuildConfig.VERSION_CODE; }
        @JavascriptInterface public String getVersionName() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void checkForUpdates() { MainActivity.this.checkForUpdates(); }
        @JavascriptInterface public void downloadAndInstallUpdate(String url, String sha256) { MainActivity.this.downloadAndInstallUpdate(url, sha256); }
        @JavascriptInterface public boolean beginCallAudio() {
            try { return beginNativeCallAudio(false); }
            catch (Exception error) { android.util.Log.e("WhatsApp", "Native audio focus failed", error); return false; }
        }
        @JavascriptInterface public void setCallSpeaker(boolean enabled) { setNativeCallSpeaker(enabled); }
        @JavascriptInterface public void endCallAudio() { endNativeCallAudio(); }
        @JavascriptInterface public void forceNextCameraCapture() { forceCameraCaptureOnNextChooser = true; }

        @JavascriptInterface public String getFcmToken() {
            if (fcmToken != null && !fcmToken.trim().isEmpty()) return fcmToken.trim();
            return getSharedPreferences("whatsapp_native_push", MODE_PRIVATE)
                .getString("fcm_token", "");
        }

        @JavascriptInterface public boolean notificationsEnabled() {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) return false;
            return NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled();
        }

        @JavascriptInterface public boolean notificationChannelEnabled(String channelId) {
            if (channelId == null || channelId.trim().isEmpty()) return false;
            return NativeCallNotifications.isChannelEnabled(MainActivity.this, channelId.trim());
        }

        @JavascriptInterface public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(intent);
                } catch (Exception ignored) {
                    try {
                        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName()));
                        startActivity(fallback);
                    } catch (Exception ignoredAgain) {}
                }
            });
        }

        @JavascriptInterface public boolean canUseFullScreenIntent() {
            if (Build.VERSION.SDK_INT < 34) return true;
            try {
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                return manager != null && manager.canUseFullScreenIntent();
            } catch (Exception ignored) { return false; }
        }

        @JavascriptInterface public void openFullScreenIntentSettings() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= 34) {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } else {
                        openNotificationSettings();
                    }
                } catch (Exception ignored) { openNotificationSettings(); }
            });
        }

        @JavascriptInterface public void finishIncomingCallUi() {
            try { Intent close = new Intent(IncomingCallActivity.ACTION_FINISH); close.setPackage(getPackageName()); sendBroadcast(close); } catch (Exception ignored) {}
            runOnUiThread(() -> applyIncomingCallWindowFlags(null));
        }

        @JavascriptInterface public void refreshFcmToken() {
            runOnUiThread(MainActivity.this::refreshFcmToken);
        }
    }
    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        try { unregisterReceiver(tokenReceiver); } catch (Exception ignored) {}
        if (pendingWebPermissionRequest != null) pendingWebPermissionRequest.deny();
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        endNativeCallAudio();
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
