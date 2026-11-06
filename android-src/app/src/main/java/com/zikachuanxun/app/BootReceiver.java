package com.zikachuanxun.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * 开机自启动接收器 — 设备重启 / App 升级后自动恢复前台服务和定时唤醒。
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        // 正常开机 / 厂商快速开机 / App 升级完成后，都恢复前台服务与定时唤醒
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        Log.i(TAG, "收到恢复事件(" + action + ")，恢复前台服务和定时唤醒");

        if (!ForegroundService.isUserStopped(context)) {
            try {
                Intent serviceIntent = new Intent(context, ForegroundService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.w(TAG, "启动前台服务受限(仅续闹钟): " + e.getMessage());
            }

            try {
                KeepAliveReceiver.scheduleNext(context);
            } catch (Exception e) {
                Log.e(TAG, "续调闹钟失败: " + e.getMessage());
            }
        }

        // 恢复"未来几次梦角说话"的原生闹钟：关机期间过期的会顺延一个间隔，
        // 避免开机后一次也不弹。
        try {
            MessageAlarmReceiver.rearm(context);
        } catch (Exception e) {
            Log.e(TAG, "恢复消息通知闹钟失败: " + e.getMessage());
        }
    }
}
