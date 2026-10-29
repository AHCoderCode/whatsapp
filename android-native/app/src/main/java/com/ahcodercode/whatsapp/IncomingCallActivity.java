package com.ahcodercode.whatsapp;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class IncomingCallActivity extends Activity {
    public static final String ACTION_FINISH = "com.ahcodercode.whatsapp.FINISH_INCOMING_CALL_UI";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String callId = "";
    private String callerName = "Contact";
    private String mediaType = "audio";
    private int notificationId = -1;
    private boolean actionTaken;
    private Ringtone incomingRingtone;

    private final Runnable fallbackRunnable = () -> {
        if (!isFinishing() && !actionTaken) launchMainActivity("open");
    };
    private final BroadcastReceiver finishReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent != null && ACTION_FINISH.equals(intent.getAction())) { stopRinging(); finish(); }
        }
    };

    public static PendingIntent pendingIntent(Context context, String callId, String callerName, String mediaType, int notificationId) {
        Intent intent = new Intent(context, IncomingCallActivity.class);
        intent.setData(Uri.parse("whatsapp-call://incoming/" + Uri.encode(callId == null ? "" : callId) + "/" + notificationId));
        intent.putExtra("waCallId", callId == null ? "" : callId);
        intent.putExtra("waCallerName", callerName == null ? "Contact" : callerName);
        intent.putExtra("waMediaType", mediaType == null ? "audio" : mediaType);
        intent.putExtra("waNotificationId", notificationId);
        int code = (String.valueOf(callId) + "|fullscreen|" + notificationId).hashCode();
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        configureLockScreen();
        readIntent(getIntent());
        IntentFilter filter = new IntentFilter(ACTION_FINISH);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(finishReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(finishReceiver, filter);
        renderScreen();
        startRinging();
        handler.postDelayed(fallbackRunnable, 60000);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
        renderScreen();
        startRinging();
    }

    private void configureLockScreen() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        window.setStatusBarColor(Color.rgb(7, 94, 84));
        window.setNavigationBarColor(Color.rgb(7, 94, 84));
    }

    private void readIntent(Intent intent) {
        if (intent == null) return;
        String value = intent.getStringExtra("waCallId");
        callId = value == null ? "" : value;
        value = intent.getStringExtra("waCallerName");
        callerName = value == null || value.trim().isEmpty() ? "Contact" : value;
        mediaType = "video".equals(intent.getStringExtra("waMediaType")) ? "video" : "audio";
        notificationId = intent.getIntExtra("waNotificationId", -1);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void renderScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(42), dp(28), dp(26));
        root.setBackgroundColor(Color.rgb(7, 94, 84));

        TextView brand = new TextView(this);
        brand.setText("WhatsApp");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(19);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        brand.setGravity(Gravity.CENTER);
        root.addView(brand, new LinearLayout.LayoutParams(-1, dp(42)));

        TextView avatar = new TextView(this);
        avatar.setText(callerName.substring(0, 1).toUpperCase());
        avatar.setTextColor(Color.rgb(7, 94, 84));
        avatar.setTextSize(38);
        avatar.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackgroundColor(Color.rgb(217, 253, 211));
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        avatarParams.topMargin = dp(82);
        root.addView(avatar, avatarParams);

        TextView name = new TextView(this);
        name.setText(callerName);
        name.setTextColor(Color.WHITE);
        name.setTextSize(28);
        name.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        name.setGravity(Gravity.CENTER);
        name.setPadding(0, dp(22), 0, dp(8));
        root.addView(name, new LinearLayout.LayoutParams(-1, -2));

        TextView type = new TextView(this);
        type.setText("Incoming " + ("video".equals(mediaType) ? "video" : "voice") + " call");
        type.setTextColor(Color.rgb(211, 232, 226));
        type.setTextSize(16);
        type.setGravity(Gravity.CENTER);
        root.addView(type, new LinearLayout.LayoutParams(-1, -2));

        ViewSpacer spacer = new ViewSpacer(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        Button accept = new Button(this);
        accept.setText("Accept");
        accept.setAllCaps(false);
        accept.setTextColor(Color.WHITE);
        accept.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(37, 211, 102)));
        LinearLayout.LayoutParams acceptParams = new LinearLayout.LayoutParams(-1, dp(58));
        acceptParams.bottomMargin = dp(12);
        root.addView(accept, acceptParams);
        accept.setOnClickListener(view -> launchMainActivity("accept"));

        Button decline = new Button(this);
        decline.setText("Decline");
        decline.setAllCaps(false);
        decline.setTextColor(Color.WHITE);
        decline.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(220, 53, 69)));
        root.addView(decline, new LinearLayout.LayoutParams(-1, dp(58)));
        decline.setOnClickListener(view -> launchMainActivity("decline"));
        setContentView(root);
    }

    private void startRinging() {
        if (actionTaken) return;
        try {
            if (incomingRingtone != null && incomingRingtone.isPlaying()) return;
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            incomingRingtone = RingtoneManager.getRingtone(this, sound);
            if (incomingRingtone == null) return;
            if (Build.VERSION.SDK_INT >= 21) incomingRingtone.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            if (Build.VERSION.SDK_INT >= 28) incomingRingtone.setLooping(true);
            incomingRingtone.play();
        } catch (Exception error) { android.util.Log.w("WhatsApp", "Native incoming ringtone could not start", error); }
    }

    private void stopRinging() {
        try { if (incomingRingtone != null && incomingRingtone.isPlaying()) incomingRingtone.stop(); } catch (Exception ignored) {}
        incomingRingtone = null;
    }

    private void launchMainActivity(String action) {
        if (actionTaken || callId.isEmpty()) { if (callId.isEmpty()) finish(); return; }
        actionTaken = true;
        stopRinging();
        handler.removeCallbacks(fallbackRunnable);
        if (notificationId >= 0) NativeCallNotifications.cancel(this, notificationId);
        Uri target = Uri.parse(MainActivity.HOME_URL).buildUpon()
            .appendQueryParameter("waPushKind", "call")
            .appendQueryParameter("waCallId", callId)
            .appendQueryParameter("waPushAction", action).build();
        Intent launch = new Intent(this, MainActivity.class);
        launch.setData(target);
        launch.putExtra("waNativeLaunchUrl", target.toString());
        launch.putExtra("waNativeIncomingCall", true);
        launch.putExtra("waNotificationId", notificationId);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(launch);
        finish();
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(fallbackRunnable);
        stopRinging();
        try { unregisterReceiver(finishReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }

    private static final class ViewSpacer extends android.view.View {
        ViewSpacer(Context context) { super(context); }
    }
}
