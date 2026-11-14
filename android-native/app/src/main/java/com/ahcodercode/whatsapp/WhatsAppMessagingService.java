package com.ahcodercode.whatsapp;

import android.content.Intent;
import android.content.SharedPreferences;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class WhatsAppMessagingService extends FirebaseMessagingService {
    public static final String ACTION_TOKEN_UPDATED = "com.ahcodercode.whatsapp.FCM_TOKEN_UPDATED";
    public static final String EXTRA_TOKEN = "fcmToken";
    private static final String RECEIPT_URL = "https://qoyqfmovzvtyvxutakym.supabase.co/functions/v1/whatsapp-push";
    private static final String PUBLISHABLE_KEY = "sb_publishable_w59xgI2zOLJe2Hmx_PC4MQ_zDQ8g9hp";

    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        String clean = token == null ? "" : token.trim();
        if (clean.isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences("whatsapp_native_push", MODE_PRIVATE);
        prefs.edit().putString("fcm_token", clean).apply();
        Intent update = new Intent(ACTION_TOKEN_UPDATED);
        update.setPackage(getPackageName());
        update.putExtra(EXTRA_TOKEN, clean);
        sendBroadcast(update);
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (message == null || message.getData() == null) return;
        Map<String, String> data = message.getData();
        NativeCallNotifications.showIncomingCall(this, data);
        if ("call".equals(data.get("kind"))) reportCallPushReceived(data);
    }

    private void reportCallPushReceived(Map<String, String> data) {
        String probeId = data.get("probeId");
        if (probeId == null || !probeId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) {
            probeId = data.get("callId");
        }
        if (probeId == null || !probeId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) return;
        HttpURLConnection connection = null;
        try {
            JSONObject body = new JSONObject();
            body.put("action", "push-receipt");
            body.put("probeId", probeId);
            body.put("stage", "received");
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection = (HttpURLConnection) new URL(RECEIPT_URL).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(2500);
            connection.setReadTimeout(2500);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", PUBLISHABLE_KEY);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
            connection.getResponseCode();
        } catch (Exception error) {
            android.util.Log.w("WhatsApp", "Could not acknowledge background call delivery", error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
