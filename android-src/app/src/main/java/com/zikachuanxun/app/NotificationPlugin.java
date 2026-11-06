package com.zikachuanxun.app;

import android.Manifest;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * 系统通知插件（字卡传讯版）。
 *
 * 与 chat 版的区别：
 *   - 标题/正文/头像/分组全部由前端按"梦角"传入；
 *   - 头像支持 data:base64（本项目的头像都存在 localStorage 里，不是 http 地址）；
 *   - 每位梦角一个通知分组，同一位梦角的多条消息在通知栏叠在一起，不同梦角互不覆盖。
 */
@CapacitorPlugin(
    name = "NotificationPlugin",
    permissions = {
        @Permission(alias = "notification", strings = {Manifest.permission.POST_NOTIFICATIONS})
    }
)
public class NotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "partner-messages";
    private static final String CHANNEL_NAME = "消息通知";
    private static final String CHANNEL_DESC = "梦角发来消息、互动、来信时的系统通知";
    private static final String TAG = "NotificationPlugin";

    private static final String DEFAULT_GROUP = "kismet-partner";
    // 分组汇总通知的 id 区间，与普通消息 id（1e8+）和后台闹钟 id（8823481）完全错开
    private static final int SUMMARY_ID_BASE = 400000000;
    // 每组已有多少条（用于汇总通知的"N 条新消息"）
    private static final Map<String, Integer> GROUP_COUNTS = new HashMap<>();

    /** 创建/更新"消息通知"频道，供本插件与 MessageAlarmReceiver 复用。 */
    public static void ensureChannel(Context context, String channelId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel existing = manager.getNotificationChannel(channelId);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    channelId, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription(CHANNEL_DESC);
                channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                channel.enableVibration(true);
                channel.enableLights(true);
                channel.setBypassDnd(true);
                channel.setShowBadge(true);
                manager.createNotificationChannel(channel);
                Log.i(TAG, "Notification channel created: " + channelId);
            } else {
                if (existing.getImportance() < NotificationManager.IMPORTANCE_HIGH) {
                    existing.setImportance(NotificationManager.IMPORTANCE_HIGH);
                }
                existing.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                existing.enableVibration(true);
                existing.enableLights(true);
                existing.setBypassDnd(true);
                existing.setShowBadge(true);
                manager.createNotificationChannel(existing);
            }
        }
    }

    private void createChannel() {
        ensureChannel(getContext(), CHANNEL_ID);
    }

    /** 点击通知打开 App。 */
    private PendingIntent contentIntent(Context context, int id) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            intent = new Intent(context, MainActivity.class);
        }
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private NotificationCompat.Builder buildNotification(Context context, String group, String title, String body,
                                                         String sender, boolean urgent, Bitmap largeIcon,
                                                         PendingIntent pi) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(urgent ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(urgent ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(urgent ? new long[]{0, 500, 300, 500, 300} : new long[]{0, 300, 200, 300})
            .setGroup(group)
            .setGroupAlertBehavior(urgent
                ? NotificationCompat.GROUP_ALERT_ALL
                : NotificationCompat.GROUP_ALERT_SUMMARY)
            .setWhen(System.currentTimeMillis())
            .setOnlyAlertOnce(false)
            .setShowWhen(true);

        if (sender != null && !sender.isEmpty()) {
            b.setSubText(sender);      // 底部小字：发件人（梦角名）
            b.setContentInfo(sender);  // 右上角/紧凑时的发件人
        }
        if (largeIcon != null) b.setLargeIcon(largeIcon);

        // 长文本用 BigTextStyle 展开，避免在横幅里被截断
        if (body != null && body.length() > 80) {
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(body).setBigContentTitle(title));
        }

        if (urgent && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            b.setFullScreenIntent(pi, true);
            b.setTimeoutAfter(30_000L);
        }
        return b;
    }

    /** data:image/...;base64,... 直接解码；否则当 http(s) 拉取。失败返回 null。 */
    private Bitmap loadAvatar(String src) {
        if (src == null || src.isEmpty()) return null;
        if (src.startsWith("data:")) return decodeAvatarData(src);
        return loadBitmap(src);
    }

    /**
     * 只解 data:base64 头像（不联网）。原生闹钟在广播里用它给通知配大图标，
     * 所以必须是静态方法、不能依赖插件实例。
     */
    public static Bitmap decodeAvatarData(String src) {
        if (src == null || src.isEmpty()) return null;
        if (!src.startsWith("data:")) return null;
        try {
            int comma = src.indexOf(',');
            if (comma < 0) return null;
            String meta = src.substring(5, comma);
            if (meta.startsWith("image/svg")) return null;   // SVG 占位图不解码，交给 App 图标
            if (!meta.contains("base64")) return null;
            byte[] raw = Base64.decode(src.substring(comma + 1), Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(raw, 0, raw.length);
        } catch (Exception e) {
            Log.w(TAG, "decode data avatar failed: " + e.getMessage());
            return null;
        }
    }

    private Bitmap loadBitmap(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setInstanceFollowRedirects(true);
            conn.connect();
            if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                InputStream in = new BufferedInputStream(conn.getInputStream());
                Bitmap bmp = BitmapFactory.decodeStream(in);
                in.close();
                return bmp;
            }
        } catch (Exception e) {
            Log.w(TAG, "loadBitmap failed: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    /** 每组一条汇总通知：让同一位梦角的多条消息在通知栏叠成一摞并显示条数。 */
    private void postGroupSummary(Context context, String group, String title, int count, Bitmap largeIcon) {
        try {
            ensureChannel(context, CHANNEL_ID);
            int summaryId = SUMMARY_ID_BASE + ((group.hashCode() & 0x7FFFFFFF) % 1000000);
            NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title != null && !title.isEmpty() ? title : "字卡传讯")
                .setContentText(count > 1 ? (count + " 条新消息") : "1 条新消息")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(contentIntent(context, summaryId))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setGroup(group)
                .setGroupSummary(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true);
            if (largeIcon != null) b.setLargeIcon(largeIcon);
            NotificationManagerCompat.from(context).notify(summaryId, b.build());
        } catch (Exception e) {
            Log.w(TAG, "汇总通知失败(忽略): " + e.getMessage());
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String title = call.getString("title", "字卡传讯");
        String body = call.getString("body", "");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % Integer.MAX_VALUE));
        boolean urgent = call.getBoolean("urgent", false);
        String sender = call.getString("sender", null);
        String avatar = call.getString("avatar", null);
        String group = call.getString("group", DEFAULT_GROUP);
        if (group == null || group.isEmpty()) group = DEFAULT_GROUP;

        createChannel();

        // Android 13+ 必须持有 POST_NOTIFICATIONS，否则 notify() 会被系统静默丢弃
        // （不抛异常），前端会误以为发送成功。这里显式拦截并给出明确错误供前端重试。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "POST_NOTIFICATIONS 未授予，通知无法送达: id=" + id);
            call.reject("notifications_permission_denied");
            return;
        }

        Context context = getContext();
        PendingIntent pendingIntent = contentIntent(context, id);
        Bitmap icon = loadAvatar(avatar);

        // 先发一版（头像异步加载前），保证横幅第一时间弹出，绝不因加载头像而延迟
        NotificationCompat.Builder builder = buildNotification(
            context, group, title, body, sender, urgent, icon, pendingIntent);

        int count;
        synchronized (GROUP_COUNTS) {
            Integer c = GROUP_COUNTS.get(group);
            count = (c == null ? 0 : c) + 1;
            GROUP_COUNTS.put(group, count);
        }

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
            Log.i(TAG, "Notification sent: id=" + id + " group=" + group + " urgent=" + urgent + " title=" + title);
            postGroupSummary(context, group, sender != null ? sender : title, count, icon);
            call.resolve(new JSObject().put("success", true).put("id", id));
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied: " + e.getMessage());
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Failed to send notification: " + e.getMessage());
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
                call.resolve(new JSObject().put("granted", true));
            } else {
                requestPermissionForAlias("notification", call, "notificationPermissionCallback");
            }
        } else {
            call.resolve(new JSObject().put("granted", true));
        }
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        boolean granted = getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        Log.i(TAG, "通知权限回调 granted=" + granted);
        call.resolve(new JSObject().put("granted", granted));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int id = call.getInt("id", -1);
        if (id >= 0) {
            NotificationManagerCompat.from(getContext()).cancel(id);
            Log.i(TAG, "Notification cancelled: id=" + id);
        }
        call.resolve();
    }

    /**
     * 同步"未来几次梦角说话"的原生闹钟排期（整体替换）。
     * 让后台消息不再依赖 WebView 的 setInterval —— 切到别的应用、JS 被冻结、
     * 甚至进程被杀，AlarmManager 仍会准点弹通知。
     *
     * items: [{cid, name, atMs, intervalMs, texts:["...","..."]}]
     */
    @PluginMethod
    public void syncScheduled(PluginCall call) {
        try {
            com.getcapacitor.JSArray arr = call.getArray("items");
            String json = (arr == null) ? "[]" : arr.toString();
            MessageAlarmReceiver.sync(getContext(), json);
            Log.i(TAG, "syncScheduled: " + json);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            Log.e(TAG, "syncScheduled 失败: " + e.getMessage());
            call.reject("syncScheduled failed: " + e.getMessage());
        }
    }

    /** 清空所有排期（关掉通知 / 打开 App 由 JS 接管时调用）。 */
    @PluginMethod
    public void clearScheduled(PluginCall call) {
        MessageAlarmReceiver.cancelAll(getContext());
        call.resolve(new JSObject().put("ok", true));
    }

    /** 取出"到点弹过通知但还没进聊天"的消息，返回后原生即清空。 */
    @PluginMethod
    public void drainScheduled(PluginCall call) {
        try {
            String json = MessageAlarmReceiver.drainPending(getContext());
            org.json.JSONArray arr = new org.json.JSONArray(json == null ? "[]" : json);
            JSObject ret = new JSObject();
            ret.put("items", arr);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "drainScheduled 失败: " + e.getMessage());
            call.resolve(new JSObject().put("items", new org.json.JSONArray()));
        }
    }
}
