/**
 * foreground-bridge.js — 前台服务 + 电池优化 + 定时唤醒桥接层
 *
 * 控制 Android 前台服务，让 App 在后台保持运行，即使熄屏也能收到消息。
 * 前台服务在状态栏显示一条常驻通知（"正在后台运行"）。
 *
 * 浏览器里所有方法都安全地空转，所以可以直接无条件调用。
 */
(function (global) {
    'use strict';

    function getCapacitor() {
        if (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Foreground) {
            return global.Capacitor.Plugins.Foreground;
        }
        return null;
    }

    function label() {
        return '字卡传讯';
    }

    var ForegroundBridge = {
        /** 启动前台服务（状态栏常驻通知 + WakeLock + 定时唤醒） */
        start: function () {
            var fg = getCapacitor();
            if (!fg) return;
            try {
                fg.start({ label: label() }).then(function () {
                    console.log('[ForegroundBridge] 前台服务已启动');
                }).catch(function (e) {
                    console.warn('[ForegroundBridge] 启动失败:', e);
                });
            } catch (e) {}
        },

        stop: function () {
            var fg = getCapacitor();
            if (!fg) return;
            fg.stop().then(function () {
                console.log('[ForegroundBridge] 前台服务已停止');
            }).catch(function (e) {
                console.warn('[ForegroundBridge] 停止失败:', e);
            });
        },

        /** 更新前台通知文字（比如改了 App 昵称） */
        updateNotification: function () {
            var fg = getCapacitor();
            if (!fg) return;
            fg.updateNotification({ label: label() }).catch(function (e) {
                console.warn('[ForegroundBridge] 更新失败:', e);
            });
        },

        /** 请求忽略电池优化（免除 Doze 限制），未授权时打开系统设置页 */
        requestBatteryOptimization: function () {
            var fg = getCapacitor();
            if (!fg) return;
            fg.requestBatteryOptimization().then(function (result) {
                if (result && result.alreadyGranted) console.log('[ForegroundBridge] 电池优化已豁免');
                else if (result && result.needAction) console.log('[ForegroundBridge] 已打开电池优化设置页');
            }).catch(function (e) {
                console.warn('[ForegroundBridge] 电池优化请求失败:', e);
            });
        },

        /**
         * 精确闹钟（SCHEDULE_EXACT_ALARM）授权引导。
         * Android 12+ 未授权时后台定时唤醒会退化为非精确，Doze 下延迟数分钟到数小时。
         * callback({alreadyGranted, needAction})
         */
        requestExactAlarm: function (callback) {
            var fg = getCapacitor();
            if (!fg) {
                if (callback) callback({ alreadyGranted: true, needAction: false });
                return;
            }
            fg.requestExactAlarm().then(function (result) {
                if (callback) callback(result || {});
            }).catch(function () {
                if (callback) callback({ alreadyGranted: false, needAction: false });
            });
        },

        /** 检查是否已忽略电池优化 */
        isBatteryOptimized: function (callback) {
            var fg = getCapacitor();
            if (!fg) {
                if (callback) callback(true);
                return;
            }
            fg.isBatteryOptimized().then(function (result) {
                if (callback) callback(!!(result && result.ignored));
            }).catch(function () {
                if (callback) callback(false);
            });
        },

        /** 悬浮窗权限（豁免 Android 12+ 后台启动前台服务限制） */
        isOverlayEnabled: function (callback) {
            var fg = getCapacitor();
            if (!fg) {
                if (callback) callback(true);
                return;
            }
            fg.isOverlayEnabled().then(function (result) {
                if (callback) callback(!!(result && result.enabled));
            }).catch(function () {
                if (callback) callback(false);
            });
        },

        requestOverlay: function () {
            var fg = getCapacitor();
            if (!fg) return Promise.reject(new Error('not native'));
            return fg.requestOverlay();
        },

        /** 设备厂商（决定白名单引导文案/跳转面板） */
        getManufacturer: function (callback) {
            var fg = getCapacitor();
            if (!fg) {
                if (callback) callback('unknown', '');
                return;
            }
            fg.getManufacturer().then(function (result) {
                if (callback) callback((result && result.brand) || 'unknown', (result && result.model) || '');
            }).catch(function () {
                if (callback) callback('unknown', '');
            });
        },

        /** 打开厂商的「自启动 / 后台管理」白名单面板，找不到就回退电池优化页 */
        openBatterySaverGuide: function (callback) {
            var fg = getCapacitor();
            if (!fg) {
                if (callback) callback({ opened: false, brand: 'unknown' });
                return;
            }
            fg.openBatterySaverGuide().then(function (result) {
                if (callback) callback(result);
            }).catch(function () {
                if (callback) callback({ opened: false, brand: 'unknown' });
            });
        },

        /** 原生前台服务是否可用 */
        isSupported: function () {
            return !!getCapacitor();
        },

        /** 保活所需权限的汇总状态（设置页展示用） */
        status: function (callback) {
            if (!getCapacitor()) {
                if (callback) callback({ native: false });
                return;
            }
            var out = { native: true };
            var left = 4;
            function done() {
                left--;
                if (left <= 0 && callback) callback(out);
            }
            this.isBatteryOptimized(function (ignored) { out.batteryIgnored = ignored; done(); });
            this.isOverlayEnabled(function (enabled) { out.overlay = enabled; done(); });
            this.getManufacturer(function (brand, model) { out.brand = brand; out.model = model; done(); });
            try {
                getCapacitor().isExactAlarmAllowed().then(function (r) {
                    out.exactAlarm = !!(r && r.allowed);
                    done();
                }).catch(function () { out.exactAlarm = false; done(); });
            } catch (e) { out.exactAlarm = false; done(); }
        }
    };

    global.ForegroundBridge = ForegroundBridge;
})(window);
