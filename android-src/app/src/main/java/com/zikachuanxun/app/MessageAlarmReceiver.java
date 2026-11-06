package com.zikachuanxun.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 到点弹消息通知的原生闹钟（多梦角版）。
 *
 * 为什么要它：梦角的"主动找你"原本只靠 WebView 里的 setInterval，一旦用户切到别的
 * 应用，WebView 的定时器会被系统降频甚至冻结，进程被回收后更是彻底不动——
 * 表现就是「别人在用的应用开着，我就不收消息了」。
 *
 * 本接收器把未来几次"梦角说话"作为 Android 精确闹钟原生预定：
 *   - 由 AlarmManager 负责准点到点，即使 JS 冻结 / 进程被杀也能送达；
 *   - 每位梦角一条通知，标题=梦角名，正文=提前挑好的字卡；
 *   - 到点后把这条消息记进"待投递"，用户打开 App 由 JS 补进聊天，
 *     做到「通知上看到什么，聊天里就有什么」；
 *   - 到点后自己往后顺延下一格（每格换一句），所以即使 App 长时间不被打开，
 *     消息也不会断。
 *
 * 页面端每次 tick 都会重新 sync 一次，把整条链换成最新的排期。
 */
public class MessageAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "MessageAlarmReceiver";
    public static final String ACTION = "com.zikachuanxun.app.MESSAGE_ALARM";

    private static final String PREFS = "kismet_scheduled_msg";
    private static final String KEY_ITEMS = "items";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_AVATAR_PREFIX = "avatar_";
    private static final int PENDING_MAX = 30;

    private static final int REQUEST_CODE_BASE = 900100;
    private static final int NOTIF_ID_BASE = 600000000;

    // ---------------- 排期 ----------------

    /**
     * 用最新的排期整体替换旧排期。
     * itemsJson: [{"cid":"c_xy","name":"小语","atMs":123,"intervalMs":300000,"texts":["a","b"]}]
     */
    public static void sync(Context context, String itemsJson) {
        try {
            cancelAll(context);
            if (itemsJson == null) return;
            JSONArray items = new JSONArray(itemsJson);
            SharedPreferences.Editor ed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            // 头像单独存一份（cid → data URL），再从排期项里摘掉：
            // Base64 头像动辄几百 KB，塞进 PendingIntent 的 extras 会撞上
            // Binder 1MB 事务上限，导致闹钟预定失败甚至进程崩溃。
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                String cid = it.optString("cid", "");
                String avatar = it.optString("avatar", "");
                if (!cid.isEmpty()) {
                    if (avatar.isEmpty()) ed.remove(KEY_AVATAR_PREFIX + cid);
                    else ed.putString(KEY_AVATAR_PREFIX + cid, avatar);
                }
                it.remove("avatar");
            }
            ed.putString(KEY_ITEMS, items.toString());
            ed.apply();
            int armed = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                if (arm(context, it, 0)) armed++;
            }
            Log.i(TAG, "排期同步完成，已预定 " + armed + " 条 / 共 " + items.length() + " 条");
        } catch (Exception e) {
            Log.e(TAG, "同步排期失败: " + e.getMessage());
        }
    }

    /** 按持久化的排期重建所有闹钟（开机 / 升级 / 服务重启后调用）。 */
    public static void rearm(Context context) {
        try {
            String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_ITEMS, null);
            if (json == null) return;
            JSONArray items = new JSONArray(json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                long at = it.optLong("atMs", 0L);
                if (at <= now) {
                    // 关机期间已过期的，顺延一个间隔，避免开机后一次也不弹
                    long iv = it.optLong("intervalMs", 30 * 60 * 1000L);
                    it.put("atMs", now + iv);
                }
                arm(context, it, it.optInt("next", 0));
            }
            Log.i(TAG, "已按持久化排期重建 " + items.length() + " 条");
        } catch (Exception e) {
            Log.e(TAG, "重建排期失败: " + e.getMessage());
        }
    }

    /** 取消全部排期（含持久化配置）。 */
    public static void cancelAll(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString(KEY_ITEMS, null);
                if (json != null) {
                    JSONArray items = new JSONArray(json);
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject it = items.optJSONObject(i);
                        if (it == null) continue;
                        try { am.cancel(pendingIntent(context, it, 0)); }
                        catch (Exception ignored) {}
                    }
                }
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().remove(KEY_ITEMS).apply();
        } catch (Exception e) {
            Log.e(TAG, "取消排期失败: " + e.getMessage());
        }
    }

    private static int requestCodeFor(String key) {
        int h = (key == null || key.isEmpty()) ? 1 : key.hashCode();
        return REQUEST_CODE_BASE + ((h & 0x7FFFFFFF) % 100000) * 8;
    }

    private static int notifIdFor(String cid) {
        int h = (cid == null || cid.isEmpty()) ? 1 : cid.hashCode();
        return NOTIF_ID_BASE + ((h & 0x7FFFFFFF) % 1000000);
    }

    private static String keyOf(JSONObject item) {
        String key = item.optString("key", "");
        if (key.isEmpty()) key = item.optString("cid", "");
        return key;
    }

    private static PendingIntent pendingIntent(Context context, JSONObject item, int index) {
        Intent intent = new Intent(context, MessageAlarmReceiver.class);
        intent.setAction(ACTION);
        intent.putExtra("item", item.toString());
        intent.putExtra("index", index);
        return PendingIntent.getBroadcast(
                context, requestCodeFor(keyOf(item)), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static boolean arm(Context context, JSONObject item, int index) {
        try {
            long at = item.optLong("atMs", 0L);
            if (at <= 0) return false;
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return false;
            PendingIntent pi = pendingIntent(context, item, index);

            boolean canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                    || am.canScheduleExactAlarms();
            if (canExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, at, pi);
            }
            return true;
        } catch (SecurityException e) {
            Log.w(TAG, "精确闹钟受限，已跳过: " + e.getMessage());
            return false;
        } catch (Exception e) {
            Log.e(TAG, "预定失败: " + e.getMessage());
            return false;
        }
    }

    // ---------------- 触发 ----------------

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String raw = intent != null ? intent.getStringExtra("item") : null;
            int index = intent != null ? intent.getIntExtra("index", 0) : 0;
            if (raw == null) return;
            JSONObject item = new JSONObject(raw);

            String cid = item.optString("cid", "");
            String name = item.optString("name", "对方");
            JSONArray texts = item.optJSONArray("texts");
            String text = (texts != null && texts.length() > 0)
                    ? texts.optString(index % texts.length(), "")
                    : "";

            if (!text.isEmpty()) {
                postNotification(context, cid, name, text);
                pushPending(context, cid, name, text);
            }

            // 自己往后顺延下一格：即使 App 再也不打开，下一条也会照常到点。
            // 文案按下标取模循环使用，所以不存在"话说完就停"——只有超过 24 小时
            // 的兜底窗口（horizon）才停，避免 App 长期不打开时无限刷通知。
            long at = item.optLong("atMs", 0L);
            long interval = item.optLong("intervalMs", 30 * 60 * 1000L);
            if (interval < 5 * 60 * 1000L) interval = 5 * 60 * 1000L;   // 最少 5 分钟，避免刷屏
            int nextIndex = index + 1;
            long now = System.currentTimeMillis();
            long nextAt = Math.max(at + interval, now + interval);

            long horizon = now + 24 * 60 * 60 * 1000L;
            if (nextAt <= horizon) {
                item.put("atMs", nextAt);
                item.put("next", nextIndex);
                arm(context, item, nextIndex);
                // 把新时刻写回持久化排期
                persistItem(context, item);
            } else {
                removeItem(context, keyOf(item));
            }
        } catch (Exception e) {
            Log.e(TAG, "处理闹钟失败: " + e.getMessage());
        }
    }

    private void persistItem(Context context, JSONObject item) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray items = new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
            String key = keyOf(item);
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.optJSONObject(i);
                if (o != null && key.equals(keyOf(o))) {
                    items.put(i, item);
                    break;
                }
            }
            prefs.edit().putString(KEY_ITEMS, items.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "写回排期失败: " + e.getMessage());
        }
    }

    private void removeItem(Context context, String key) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray items = new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
            JSONArray keep = new JSONArray();
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.optJSONObject(i);
                if (o == null) continue;
                if (!key.equals(keyOf(o))) keep.put(o);
            }
            prefs.edit().putString(KEY_ITEMS, keep.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "移除排期失败: " + e.getMessage());
        }
    }

    private void pushPending(Context context, String cid, String name, String text) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            JSONObject o = new JSONObject();
            o.put("cid", cid);
            o.put("name", name);
            o.put("text", text);
            o.put("ts", System.currentTimeMillis());
            arr.put(o);
            while (arr.length() > PENDING_MAX) arr.remove(0);
            prefs.edit().putString(KEY_PENDING, arr.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "记录待投递失败: " + e.getMessage());
        }
    }

    /** 取出并清空"到点已弹过通知、但还没进聊天"的消息。 */
    public static String drainPending(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String json = prefs.getString(KEY_PENDING, "[]");
            prefs.edit().remove(KEY_PENDING).apply();
            return json == null ? "[]" : json;
        } catch (Exception e) {
            return "[]";
        }
    }

    // ---------------- 通知 ----------------

    private void postNotification(Context context, String cid, String name, String text) {
        String channelId = "partner-messages";
        NotificationPlugin.ensureChannel(context, channelId);

        Intent appIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = null;
        if (appIntent != null) {
            appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            contentIntent = PendingIntent.getActivity(
                    context, notifIdFor(cid), appIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(name)
                .setContentText(text)
                .setSubText(name)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setVibrate(new long[]{0, 300, 200, 300})
                .setGroup("kismet-" + cid)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_ALL)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setOnlyAlertOnce(false);
        if (contentIntent != null) builder.setContentIntent(contentIntent);

        // 大图标 = 该梦角头像（图库为空时前端会传空串，这里回退到 App 图标）
        Bitmap icon = null;
        try {
            String avatar = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_AVATAR_PREFIX + cid, null);
            if (avatar != null && !avatar.isEmpty()) {
                icon = NotificationPlugin.decodeAvatarData(avatar);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取头像失败: " + e.getMessage());
        }
        if (icon != null) builder.setLargeIcon(icon);

        if (text.length() > 80) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(text).setBigContentTitle(name));
        }

        try {
            NotificationManagerCompat.from(context).notify(notifIdFor(cid), builder.build());
            Log.i(TAG, "到点通知: " + name + " / " + text);
        } catch (SecurityException e) {
            Log.w(TAG, "通知权限未授予: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "弹通知失败: " + e.getMessage());
        }
    }
}
