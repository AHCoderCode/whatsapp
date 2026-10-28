package com.ahcodercode.whatsapp;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

public final class CallNotificationActionReceiver extends BroadcastReceiver {
    private static final String CALL_ID = "waCallId", PUSH_ACTION = "waPushAction", NOTIFICATION_ID = "waNotificationId";
    public static PendingIntent pendingIntent(Context context, String callId, String action, int notificationId) {
        Intent intent = new Intent(context, CallNotificationActionReceiver.class);
        intent.setAction("com.ahcodercode.whatsapp.CALL_" + action.toUpperCase());
        intent.putExtra(CALL_ID, callId == null ? "" : callId);
        intent.putExtra(PUSH_ACTION, action);
        intent.putExtra(NOTIFICATION_ID, notificationId);
        int code = (String.valueOf(callId) + "|" + action + "|" + notificationId).hashCode();
        return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    @Override public void onReceive(Context context, Intent intent) {
        String callId = intent.getStringExtra(CALL_ID), action = intent.getStringExtra(PUSH_ACTION);
        int notificationId = intent.getIntExtra(NOTIFICATION_ID, 83001);
        if (callId == null) callId = "";
        if (action == null) action = "open";
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(notificationId);
        Uri.Builder target = Uri.parse(MainActivity.HOME_URL).buildUpon().appendQueryParameter("waPushKind", "call");
        if (!callId.isEmpty()) target.appendQueryParameter("waCallId", callId);
        target.appendQueryParameter("waPushAction", action);
        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra("waNativeLaunchUrl", target.build().toString());
        context.startActivity(launch);
    }
}
