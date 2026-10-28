package com.ahcodercode.whatsapp;

import android.content.Intent;
import android.content.SharedPreferences;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class WhatsAppMessagingService extends FirebaseMessagingService {
    public static final String ACTION_TOKEN_UPDATED = "com.ahcodercode.whatsapp.FCM_TOKEN_UPDATED";
    public static final String EXTRA_TOKEN = "fcmToken";
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
        if (message != null && message.getData() != null) NativeCallNotifications.showIncomingCall(this, message.getData());
    }
}
