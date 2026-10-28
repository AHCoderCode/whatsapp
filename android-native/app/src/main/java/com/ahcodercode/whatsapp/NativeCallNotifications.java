package com.ahcodercode.whatsapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;

public final class NativeCallNotifications {
    public static final String CHANNEL_ID = "wa_incoming_calls_v1";
    private NativeCallNotifications() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Incoming WhatsApp voice and video call alerts.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 800});
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        channel.setSound(sound, attrs);
        manager.createNotificationChannel(channel);
    }

    public static void showIncomingCall(Context context, Map<String, String> data) {
        ensureChannel(context);
        if (!"call".equals(value(data, "kind", "call"))) return;
        String callId = value(data, "callId", "");
        boolean test = "true".equalsIgnoreCase(value(data, "test", "false"));
        String caller = value(data, "callerName", "Contact");
        String media = value(data, "mediaType", "audio");
        String title = value(data, "title", test ? "WhatsApp call alert test" : "Incoming call · " + caller);
        String body = value(data, "body", "video".equals(media) ? "Incoming video call" : "Incoming voice call");
        int id = callId.isEmpty() ? 83001 : (callId.hashCode() & 0x7fffffff);
        if (id == 0) id = 83001;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(title).setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(test || callId.isEmpty())
            .setOngoing(!test && !callId.isEmpty())
            .setOnlyAlertOnce(false)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
            .setVibrate(new long[]{0, 500, 250, 500, 250, 800})
            .setContentIntent(CallNotificationActionReceiver.pendingIntent(context, callId, "open", id))
            .setWhen(System.currentTimeMillis());
        if (!test && !callId.isEmpty()) {
            builder.addAction(new NotificationCompat.Action.Builder(android.R.drawable.sym_action_call, "Accept",
                CallNotificationActionReceiver.pendingIntent(context, callId, "accept", id)).build());
            builder.addAction(new NotificationCompat.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Decline",
                CallNotificationActionReceiver.pendingIntent(context, callId, "decline", id)).build());
        }
        try { NotificationManagerCompat.from(context).notify(id, builder.build()); } catch (SecurityException ignored) {}
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String raw = data == null ? null : data.get(key);
        return raw == null || raw.trim().isEmpty() ? fallback : raw.trim();
    }
}
