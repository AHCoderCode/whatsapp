package com.ahcodercode.whatsapp;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.provider.MediaStore;
import java.io.File;
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
    private AudioManager callAudioManager;
    private AudioFocusRequest callAudioFocusRequest;
    private int previousAudioMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerphoneOn;
    private boolean callAudioSessionActive;
    private final AudioManager.OnAudioFocusChangeListener callAudioFocusListener = focusChange -> {};
    private PermissionRequest pendingWebPermissionRequest;
    private String pendingUrl = HOME_URL, fcmToken = "";
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
                if (isTrustedAppUrl(Uri.parse(url))) { pageLoaded = true; publishFcmToken(); }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                if (params != null && params.isCaptureEnabled()) {
                    try {
                        Intent capture = createCaptureIntent(params);
                        if (capture != null) { startActivityForResult(capture, REQUEST_CAPTURE); return true; }
                    } catch (Exception ignored) { pendingCaptureUri = null; }
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
                    && uri.getQueryParameter("waCallId") != null;
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
        int notificationId = intent.getIntExtra("waNotificationId", -1);
        if (notificationId >= 0) NativeCallNotifications.cancel(this, notificationId);
        if (url != null && isTrustedAppUrl(Uri.parse(url))) {
            pendingUrl = url;
            if (webView != null) webView.loadUrl(url);
        }
    }
    private Intent createCaptureIntent(WebChromeClient.FileChooserParams params) throws java.io.IOException {
        if (params == null || !params.isCaptureEnabled()) return null;
        StringBuilder accepted = new StringBuilder();
        for (String type : params.getAcceptTypes()) if (type != null) accepted.append(type.toLowerCase(java.util.Locale.ROOT)).append(",");
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

    private synchronized void beginNativeCallAudio(boolean useSpeaker) {
        AudioManager manager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return;
        if (!callAudioSessionActive) {
            previousAudioMode = manager.getMode();
            previousSpeakerphoneOn = manager.isSpeakerphoneOn();
            callAudioManager = manager;
            callAudioSessionActive = true;
        }
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
        manager.setSpeakerphoneOn(useSpeaker);
    }

    private synchronized void setNativeCallSpeaker(boolean enabled) {
        if (callAudioManager != null && callAudioSessionActive) {
            try { callAudioManager.setSpeakerphoneOn(enabled); } catch (Exception ignored) {}
        }
    }

    private synchronized void endNativeCallAudio() {
        AudioManager manager = callAudioManager;
        if (manager == null || !callAudioSessionActive) return;
        try {
            if (Build.VERSION.SDK_INT >= 26 && callAudioFocusRequest != null) manager.abandonAudioFocusRequest(callAudioFocusRequest);
            else manager.abandonAudioFocus(callAudioFocusListener);
            manager.setSpeakerphoneOn(previousSpeakerphoneOn);
            manager.setMode(previousAudioMode);
        } catch (Exception ignored) {}
        callAudioSessionActive = false;
        callAudioManager = null;
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
                "if(window.waNativeAppResumed)window.waNativeAppResumed();", null
            ), 350);
        }
    }

    private final class NativeAppBridge {
        @JavascriptInterface public boolean isNativeApp() { return true; }
        @JavascriptInterface public void beginCallAudio() { try { beginNativeCallAudio(true); } catch (Exception error) { android.util.Log.w("WhatsApp", "Native audio focus failed", error); } }
        @JavascriptInterface public void setCallSpeaker(boolean enabled) { setNativeCallSpeaker(enabled); }
        @JavascriptInterface public void endCallAudio() { endNativeCallAudio(); }

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
