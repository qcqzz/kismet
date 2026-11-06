package com.zikachuanxun.app;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 保活控制插件：前台服务 / 电池优化 / 精确闹钟 / 悬浮窗 / 厂商白名单引导。
 */
@CapacitorPlugin(name = "Foreground")
public class ForegroundPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String label = call.getString("label", "字卡传讯");
        // 用户重新开启保活：清掉"主动关闭"标记，允许自愈链路重新拉起服务。
        ForegroundService.setUserStopped(getContext(), false);
        // Android 12+（尤其国内厂商深度后台策略：MIUI/EMUI/ColorOS 等）在 App 处于后台时调用
        // startForegroundService() 会抛 ForegroundServiceStartNotAllowedException，不捕获会
        // 沿插件调用冒泡到主线程导致闪退。这里整体包住，失败仅记日志，保活由
        // KeepAliveReceiver 的定时闹钟自愈链路兜底。
        try {
            Intent serviceIntent = new Intent(getContext(), ForegroundService.class);
            serviceIntent.putExtra("label", label);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
        } catch (Throwable t) {
            android.util.Log.w("ForegroundPlugin", "启动前台服务受限(已交由定时唤醒兜底): " + t.getMessage());
        }

        try {
            KeepAliveReceiver.scheduleNext(getContext());
        } catch (Throwable t) {
            android.util.Log.w("ForegroundPlugin", "调度定时唤醒失败: " + t.getMessage());
        }

        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        // 先落"主动关闭"标记，再停服务：否则 onDestroy 里的自愈逻辑会
        // 立刻把服务重新拉起来，用户永远关不掉保活。
        ForegroundService.setUserStopped(getContext(), true);
        Intent serviceIntent = new Intent(getContext(), ForegroundService.class);
        getContext().stopService(serviceIntent);
        KeepAliveReceiver.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        String label = call.getString("label", "字卡传讯");
        try {
            Intent updateIntent = new Intent(getContext(), ForegroundService.class);
            updateIntent.setAction("UPDATE_NOTIFICATION");
            updateIntent.putExtra("label", label);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(updateIntent);
            } else {
                getContext().startService(updateIntent);
            }
        } catch (Throwable t) {
            android.util.Log.w("ForegroundPlugin", "更新前台通知受限(忽略): " + t.getMessage());
        }
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    /** 请求忽略电池优化（免除 Doze 限制）。 */
    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(PowerManager.class);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                JSObject ret = new JSObject();
                ret.put("alreadyGranted", true);
                ret.put("needAction", false);
                call.resolve(ret);
                return;
            }
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("alreadyGranted", false);
                ret.put("needAction", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("无法打开电池优化设置");
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("alreadyGranted", true);
            ret.put("needAction", false);
            call.resolve(ret);
        }
    }

    /** 精确闹钟（SCHEDULE_EXACT_ALARM）授权引导。 */
    @PluginMethod
    public void requestExactAlarm(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            JSObject ret = new JSObject();
            ret.put("alreadyGranted", true);
            ret.put("needAction", false);
            call.resolve(ret);
            return;
        }
        try {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am != null && am.canScheduleExactAlarms()) {
                JSObject ret = new JSObject();
                ret.put("alreadyGranted", true);
                ret.put("needAction", false);
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            // 查询失败按未授权处理，继续走引导
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("alreadyGranted", false);
            ret.put("needAction", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开精确闹钟设置");
        }
    }

    /** 精确闹钟是否已授权（设置页展示用，不跳转）。 */
    @PluginMethod
    public void isExactAlarmAllowed(PluginCall call) {
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
                allowed = (am != null && am.canScheduleExactAlarms());
            } catch (Exception e) {
                allowed = false;
            }
        }
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void isBatteryOptimized(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(PowerManager.class);
            if (pm != null) {
                JSObject ret = new JSObject();
                ret.put("ignored", pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
                call.resolve(ret);
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("ignored", true);
        call.resolve(ret);
    }

    /**
     * 是否已授予悬浮窗权限。Android 12+ 持有悬浮窗可豁免后台启动前台服务限制，
     * 能显著提升"进程被回收后重新拉起保活服务"的成功率。
     */
    @PluginMethod
    public void isOverlayEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlay(PluginCall call) {
        Context ctx = getContext();
        if (Settings.canDrawOverlays(ctx)) {
            JSObject ret = new JSObject();
            ret.put("alreadyGranted", true);
            ret.put("needAction", false);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("alreadyGranted", false);
            ret.put("needAction", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开悬浮窗权限设置");
        }
    }

    @PluginMethod
    public void getManufacturer(PluginCall call) {
        String brand = normalizeBrand(Build.MANUFACTURER);
        JSObject ret = new JSObject();
        ret.put("brand", brand);
        ret.put("model", Build.MODEL);
        call.resolve(ret);
    }

    /**
     * 打开当前厂商的"自启动 / 后台管理"白名单面板。
     * 各家入口不同且都可能不存在或被移除，逐个尝试；全部失败回退标准电池优化页。
     */
    @PluginMethod
    public void openBatterySaverGuide(PluginCall call) {
        Context ctx = getContext();
        String brand = normalizeBrand(Build.MANUFACTURER);
        for (String t : manufacturerTargets(brand)) {
            try {
                Intent intent = Intent.parseUri(t, Intent.URI_INTENT_SCHEME);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                ret.put("brand", brand);
                call.resolve(ret);
                return;
            } catch (ActivityNotFoundException e) {
                // 该组件不存在，尝试下一个
            } catch (Exception e) {
                // 某些厂商未导出或被系统拦截，继续尝试下一个
            }
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            ret.put("brand", brand);
            ret.put("fallbackToBattery", true);
            call.resolve(ret);
            return;
        } catch (Exception e) {
            // 忽略
        }
        JSObject ret = new JSObject();
        ret.put("opened", false);
        ret.put("brand", brand);
        call.resolve(ret);
    }

    private String normalizeBrand(String manufacturer) {
        if (manufacturer == null) return "unknown";
        String m = manufacturer.toLowerCase();
        if (m.contains("xiaomi") || m.contains("redmi") || m.contains("poco")) return "xiaomi";
        if (m.contains("huawei") || m.contains("honor")) return "huawei";
        if (m.contains("oppo") || m.contains("oneplus") || m.contains("realme")) return "oppo";
        if (m.contains("vivo") || m.contains("iqoo")) return "vivo";
        if (m.contains("meizu")) return "meizu";
        if (m.contains("samsung")) return "samsung";
        return "unknown";
    }

    private String[] manufacturerTargets(String brand) {
        switch (brand) {
            case "xiaomi":
                return new String[]{
                        "intent:#Intent;component=com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity;end",
                        "intent:#Intent;component=com.miui.securitycenter/com.miui.securitycenter.autostart.AutoStartManagementActivity;end",
                        "intent:#Intent;action=miui.intent.action.OP_AUTO_START;end"
                };
            case "huawei":
                return new String[]{
                        "intent:#Intent;component=com.huawei.systemmanager/com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity;end",
                        "intent:#Intent;component=com.huawei.systemmanager/com.huawei.systemmanager.optimize.process.ProtectActivity;end"
                };
            case "oppo":
                return new String[]{
                        "intent:#Intent;component=com.coloros.safecenter/com.coloros.safecenter.permission.startup.StartupAppListActivity;end",
                        "intent:#Intent;component=com.coloros.safecenter/com.coloros.safecenter.startupapp.StartupAppListActivity;end"
                };
            case "vivo":
                return new String[]{
                        "intent:#Intent;action=com.iqoo.secure.action.BG_START_MANAGER;end",
                        "intent:#Intent;component=com.vivo.permissionmanager/com.vivo.permissionmanager.activity.BgStartUpManagerActivity;end"
                };
            case "meizu":
                return new String[]{
                        "intent:#Intent;component=com.meizu.safe/com.meizu.safe.permission.SmartBGActivity;end"
                };
            case "samsung":
                return new String[]{
                        "intent:#Intent;component=com.samsung.android.lool/com.samsung.android.sm.ui.battery.BatteryActivity;end"
                };
            default:
                return new String[]{};
        }
    }
}
