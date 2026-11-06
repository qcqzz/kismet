package com.zikachuanxun.app;

import android.annotation.TargetApi;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.ServiceCompat;

/**
 * 前台保活服务。
 *
 * 前台服务类型策略：Android 15+（API 35）对 dataSync 这类后台型前台服务有 6 小时强制
 * 超时——超时后系统直接销毁服务并杀死进程，保活链无声断裂，即使从未被用户清除后台也会死。
 * 为满足"只要没被清除后台就能一直运行"，Android 14+（API 34）改用 specialUse 类型
 * （无超时、无需持续音频、侧载 App 无审核问题），低版本继续用 dataSync 兼容。
 */
public class ForegroundService extends Service {
    private static final String CHANNEL_ID = "foreground_service";
    private static final int NOTIFICATION_ID = 1001;
    public static final String PREFS_NAME = "kismet_prefs";
    private static final String KEY_LABEL = "label";
    /** 用户主动关掉保活后置 true，防止服务被自己的自愈链路重新拉起。 */
    public static final String KEY_USER_STOPPED = "keep_alive_user_stopped";

    /** 前台服务是否在跑。MainActivity 用它决定切后台后要不要保活 WebView 的 JS 定时器。 */
    public static volatile boolean sRunning = false;

    public static boolean isUserStopped(Context ctx) {
        try {
            return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(KEY_USER_STOPPED, false);
        } catch (Exception e) {
            return false;
        }
    }

    public static void setUserStopped(Context ctx, boolean stopped) {
        try {
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_USER_STOPPED, stopped).apply();
        } catch (Exception e) {
            // 忽略
        }
    }

    // 保活续锁周期：每 1 分钟检查一次 WakeLock，缩短"锁被系统回收后到重新抢回"的空窗。
    // 锁用较短的 10 分钟超时，由下方循环持续续期。
    private static final long WAKELOCK_RENEW_INTERVAL_MS = 1 * 60 * 1000L;
    private static final long WAKELOCK_TIMEOUT_MS = 10 * 60 * 1000L;

    private PowerManager.WakeLock wakeLock = null;
    private String label = "字卡传讯";
    private Handler keepAliveHandler;
    private final Runnable wakelockRenewRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (wakeLock == null || !wakeLock.isHeld()) {
                    acquireWakeLock();
                    Log.i("ForegroundService", "WakeLock 已续期");
                }
                if (keepAliveHandler != null) {
                    keepAliveHandler.postDelayed(this, WAKELOCK_RENEW_INTERVAL_MS);
                }
            } catch (Exception e) {
                Log.w("ForegroundService", "续锁失败: " + e.getMessage());
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        if (isUserStopped(this)) {
            sRunning = false;
            stopSelf();
            return;
        }
        sRunning = true;
        createNotificationChannel();
        // 从 SharedPreferences 恢复（防止服务被系统重启后丢失）
        label = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_LABEL, "字卡传讯");
        acquireWakeLock();
        startWakelockRenewLoop();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (isUserStopped(this)) {
            sRunning = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (wakeLock == null || !wakeLock.isHeld()) {
            acquireWakeLock();
        }

        if (intent != null && "UPDATE_NOTIFICATION".equals(intent.getAction())) {
            String name = intent.getStringExtra("label");
            updateNotification(name);
            return START_STICKY;
        }

        if (intent != null && intent.hasExtra("label")) {
            label = intent.getStringExtra("label");
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putString(KEY_LABEL, label).apply();
        }

        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = buildForegroundNotification(
                label == null || label.isEmpty() ? "字卡传讯" : label, pendingIntent);

        // Android 14+ 的 specialUse 类型在个别厂商/系统构建上解析或校验权限时可能抛异常；
        // 不捕获会从 onStartCommand 冒出导致进程闪退。失败时降级为普通 START_STICKY，
        // 由闹钟自愈链路兜底，保证不拖垮整个应用。
        try {
            startForegroundCompat(notification);
        } catch (Throwable t) {
            Log.w("ForegroundService", "提升前台失败(忽略，交由闹钟兜底): " + t.getMessage());
        }
        return START_STICKY;
    }

    /**
     * API 34+ 用 specialUse —— 免除 Android 15+ 对 dataSync 的 6 小时强杀；
     * 更早版本用 dataSync 兼容。
     */
    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                    this, NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            ServiceCompat.startForeground(
                    this, NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        }
    }

    /**
     * 常驻通知。setForegroundServiceBehavior 是 API 31 才有的方法，
     * 直接写进链式调用会在旧系统上 NoSuchMethodError 崩溃，必须按版本调。
     */
    private Notification buildForegroundNotification(String title, PendingIntent pi) {
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText("正在后台运行，新消息会及时提醒你")
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(Notification.PRIORITY_LOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return builder.build();
    }

    /** Android 15+ 非 specialUse 类型超时后回调；重排闹钟并拉起服务，尽量缩短保活空窗。 */
    @TargetApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    @Override
    public void onTimeout(int startId) {
        Log.w("ForegroundService", "前台服务触发 onTimeout(超时)，重排定时唤醒兜底恢复");
        if (isUserStopped(this)) {
            stopSelf();
            return;
        }
        try {
            KeepAliveReceiver.scheduleNext(this);
            Intent restart = new Intent(this, ForegroundService.class);
            startForegroundService(restart);
        } catch (Exception e) {
            Log.w("ForegroundService", "onTimeout 恢复失败: " + e.getMessage());
        }
    }

    /** 更新前台通知文字。 */
    public void updateNotification(String name) {
        label = (name != null && !name.isEmpty()) ? name : "字卡传讯";
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_LABEL, label).apply();

        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = buildForegroundNotification(label, pendingIntent);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    /** 获取 WakeLock 防止 CPU 休眠导致 WebView JavaScript 暂停。 */
    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                if (wakeLock == null) {
                    wakeLock = pm.newWakeLock(
                            PowerManager.PARTIAL_WAKE_LOCK,
                            "kismet::foreground_wakelock");
                }
                if (!wakeLock.isHeld()) {
                    wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
                }
            }
        } catch (Exception e) {
            // 忽略
        }
    }

    private void startWakelockRenewLoop() {
        if (keepAliveHandler != null) return;
        keepAliveHandler = new Handler(Looper.getMainLooper());
        keepAliveHandler.postDelayed(wakelockRenewRunnable, WAKELOCK_RENEW_INTERVAL_MS);
    }

    @Override
    public void onDestroy() {
        sRunning = false;
        if (keepAliveHandler != null) {
            keepAliveHandler.removeCallbacks(wakelockRenewRunnable);
            keepAliveHandler = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception e) {}
            wakeLock = null;
        }
        // 服务被系统杀死后重排定时唤醒，保证保活机制不被中断；
        // 用户主动关掉保活时不再自愈，否则永远关不掉。
        if (!isUserStopped(this)) {
            try {
                KeepAliveReceiver.scheduleNext(this);
                Log.i("ForegroundService", "服务销毁，已重排定时唤醒");
            } catch (Exception e) {
                Log.w("ForegroundService", "重排唤醒失败: " + e.getMessage());
            }
        }
        super.onDestroy();
    }

    /** 用户从最近任务里划掉 App：立即重启服务并重排闹钟，防止保活丢失。 */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (isUserStopped(this)) return;
        try {
            KeepAliveReceiver.scheduleNext(this);
            Intent restart = new Intent(this, ForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restart);
            } else {
                startService(restart);
            }
            Log.i("ForegroundService", "任务被划掉，已重启服务并重排定时唤醒");
            // 瞬时"前台身份"保活：任务被划掉后立刻启动无窗口的保活宿主，
            // 避免系统刚划掉就回收 WebView 渲染进程；宿主 ~1.5s 后自动 finish。
            KeepAliveActivity.start(this);
        } catch (Exception e) {
            Log.w("ForegroundService", "任务被划掉时重启服务受限(闹钟已重排): " + e.getMessage());
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "后台运行",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("字卡传讯后台保活通知");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
