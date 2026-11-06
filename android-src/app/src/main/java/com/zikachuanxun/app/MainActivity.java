package com.zikachuanxun.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // registerPlugin 必须在 super.onCreate() 之前调用（Capacitor 8 要求）
        registerPlugin(ForegroundPlugin.class);
        registerPlugin(NotificationPlugin.class);
        super.onCreate(savedInstanceState);

        // 覆盖 WebChromeClient，直接放行 WebView 的麦克风权限请求。
        // Capacitor 默认用异步权限 launcher，系统权限已授予时仍可能拒绝 getUserMedia，
        // 导致语音"按住说话"一直提示权限被拒绝。这里在已持有权限时同步 grant，
        // 尚未授权时回退到 Capacitor 默认的运行时授权弹窗。
        try {
            Bridge bridge = getBridge();
            if (bridge != null && bridge.getWebView() != null) {
                // 保护 WebView 渲染进程：声明"重要"优先级且后台不豁免，
                // 配合前台服务避免系统在后台/内存紧张时回收渲染进程——
                // 渲染进程一旦被杀，页面 JS 冻结，后台保活与通知全部失效。
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        bridge.getWebView().setRendererPriorityPolicy(
                                android.webkit.WebView.RENDERER_PRIORITY_IMPORTANT, false);
                    } catch (Exception rpE) {
                        android.util.Log.w("MainActivity", "设置渲染进程优先级失败: " + rpE.getMessage());
                    }
                }
                // 混合内容放行：本地页面（https scheme）里若引用 http 资源会被 WebView 拦截
                bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

                bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        for (String resource : request.getResources()) {
                            if ("android.webkit.resource.AUDIO_CAPTURE".equals(resource)) {
                                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                    super.onPermissionRequest(request);
                                    return;
                                }
                            }
                        }
                        request.grant(request.getResources());
                    }
                });
            }
        } catch (Exception ignored) {
            // 若桥尚未就绪，回退到默认行为，不阻塞启动
        }

        // 启动前台服务保活。
        // 注意：startForegroundService() 后必须在 5 秒内调用 startForeground()，
        // 否则系统抛 ForegroundServiceDidNotStartInTimeException 崩溃。此处整体包一层防御，
        // 个别厂商或深度后台限制前台服务启动时，后台保活会退化为由 KeepAliveReceiver 的
        // 定时唤醒兜底，绝不因启动失败拖垮整个 App。
        try {
            if (ForegroundService.isUserStopped(this)) return;
            Intent serviceIntent = new Intent(this, ForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "启动前台服务受限: " + e.getMessage());
        }
    }

    /**
     * 切到后台时不冻结 JS 定时器。
     *
     * Capacitor 的 super.onPause() 会挂起 WebView，页面里的 setInterval / setTimeout
     * 随之停摆——用户切到别的应用后，梦角的"主动发消息"就再也不触发。
     * 这里在 super.onPause() 之后立刻 resumeTimers()，让 JS 继续跑；
     * 再配合前台服务 + WakeLock，即使别的应用在前台，消息也能按时到点弹出。
     *
     * 只有"后台保活"开着（前台服务在跑）时才这么做：用户关掉保活就恢复系统默认省电行为。
     */
    @Override
    public void onPause() {
        super.onPause();
        try {
            if (!ForegroundService.sRunning) return;
            Bridge bridge = getBridge();
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().resumeTimers();
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "恢复 WebView 定时器失败: " + e.getMessage());
        }
    }
}
