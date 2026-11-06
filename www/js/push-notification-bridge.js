/**
 * push-notification-bridge.js — 统一通知桥接层（字卡传讯版）
 *
 * 自动检测运行环境，按优先级尝试：
 *   1. 自定义 NotificationPlugin（APK，直接调用 Android NotificationManager）
 *   2. Capacitor LocalNotifications 插件（APK 回退）
 *   3. Web Notification API（浏览器）
 *
 * 与 chat 版的区别：字卡传讯是"多位梦角"而不是单一对方，所以
 *   - 标题、头像、分组全部由调用方（features/notify.js）按梦角传入；
 *   - 通知分组 tag/group = kismet-<梦角id>，不同梦角互不顶掉；
 *   - 开关读 settings.notifyEnabled（走 Storage 前缀），不再用裸 localStorage。
 */
(function (global) {
    'use strict';

    var _initialized = false;
    var _capacitorReady = false;
    var _waitPromise = null;
    var _notifPlugin = null;   // 自定义 NotificationPlugin 引用
    var _lnPlugin = null;      // LocalNotifications 插件引用
    var _pluginChecked = false;
    var _permissionGranted = false;

    // 通知 id：单调递增 + 固定大基数，与后台闹钟固定 id(8823481) 完全错开，
    // 相邻多条消息也不会互相覆盖（用 Date.now() 取模连发会撞 id 把上一条顶掉）。
    var _NOTIF_ID_BASE = 100000000;
    var _notifSeq = 0;
    function _nextNotifId() {
        _notifSeq = (_notifSeq + 1) % _NOTIF_ID_BASE;
        return _NOTIF_ID_BASE + _notifSeq;
    }

    // 站点品牌图，用作通知角标（badge）兜底
    var BRAND_ICON = 'icons/icon-192.png';

    function notifEnabled() {
        try {
            if (typeof settings !== 'undefined' && settings && settings.notifyEnabled === false) return false;
        } catch (e) {}
        return true;
    }

    // ====== 等待 Capacitor 桥接就绪 ======
    function waitForCapacitor(timeoutMs) {
        timeoutMs = timeoutMs || 5000;
        if (_waitPromise) return _waitPromise;
        if (_capacitorReady) return Promise.resolve(true);

        _waitPromise = new Promise(function (resolve) {
            var start = Date.now();
            function check() {
                if (global.Capacitor && global.Capacitor.Plugins) {
                    _capacitorReady = true;
                    resolve(true);
                    return;
                }
                if (Date.now() - start > timeoutMs) {
                    console.log('[PushBridge] Capacitor 桥接超时，回退到浏览器模式');
                    _waitPromise = null;   // 不缓存超时结果：慢启动设备下次 send 会重新探测
                    resolve(false);
                    return;
                }
                setTimeout(check, 200);
            }
            check();
        });
        return _waitPromise;
    }

    // ====== 获取插件引用 ======
    function discoverPlugins() {
        if (_pluginChecked) return;
        _pluginChecked = true;
        if (!global.Capacitor || !global.Capacitor.Plugins) return;

        try {
            if (global.Capacitor.Plugins.NotificationPlugin) {
                _notifPlugin = global.Capacitor.Plugins.NotificationPlugin;
                console.log('[PushBridge] 自定义 NotificationPlugin 已就绪');
            }
        } catch (e) {}

        try {
            if (!_notifPlugin && global.Capacitor.Plugins.LocalNotifications) {
                _lnPlugin = global.Capacitor.Plugins.LocalNotifications;
                console.log('[PushBridge] LocalNotifications 插件已就绪');
            }
        } catch (e) {}

        if (!_notifPlugin && !_lnPlugin) {
            console.log('[PushBridge] 无原生通知插件，使用浏览器模式 | Plugins:',
                Object.keys(global.Capacitor.Plugins || {}).join(','));
        }
    }

    function _isNative() {
        return !!(global.Capacitor && global.Capacitor.Plugins);
    }

    // ====== 发送自定义通知插件 ======
    function _sendViaCustomPlugin(title, body, options) {
        if (!_notifPlugin) return Promise.resolve(false);
        options = options || {};
        var id = _nextNotifId();
        var payload = { title: title, body: body, id: id };
        // 通知里的发件人小字（梦角名），与左侧大图和标题呼应
        if (options.sender) payload.sender = options.sender;
        // 左侧大头像：data URL 或 http(s) 都支持（原生侧自己解码）
        if (options.avatar) payload.avatar = options.avatar;
        // 按梦角分组：同一位梦角的多条消息在通知栏叠在一起，不同梦角各自一组
        if (options.group) payload.group = options.group;
        if (options.urgent) payload.urgent = true;

        return _notifPlugin.send(payload).then(function (result) {
            console.log('[PushBridge] 原生通知已发送 #' + id + ':', title, body);
            return id;
        }).catch(function (e) {
            var msg = (e && e.message) ? String(e.message) : '';
            console.warn('[PushBridge] 原生通知失败:', msg);
            // Android 13+ 未授予 POST_NOTIFICATIONS 时原生侧会明确拒绝，
            // 这里主动请求权限，授权后重试一次，尽量不漏后台消息。
            if (msg.indexOf('permission') >= 0) {
                return _notifPlugin.requestPermission().then(function (r) {
                    if (r && r.granted === true) {
                        _permissionGranted = true;
                        return _notifPlugin.send(payload).then(function () { return id; })
                            .catch(function () { return null; });
                    }
                    return null;
                }).catch(function () { return null; });
            }
            return null;
        });
    }

    // ====== 发送 LocalNotifications 通知 ======
    function _sendViaLocalNotif(title, body, options) {
        if (!_lnPlugin) return Promise.resolve(false);
        options = options || {};
        var now = Date.now();
        var id = _nextNotifId();
        var notif = {
            title: title,
            body: body,
            id: id,
            schedule: { at: new Date(now + 50) },
            channelId: 'partner-messages',
            importance: 5,
            visibility: 1,
            iconColor: '#111111',
            group: options.group || 'kismet-partner',
            groupSummary: false
        };
        if (options.avatar) notif.largeIcon = options.avatar;
        return _lnPlugin.schedule({ notifications: [notif] }).then(function () {
            console.log('[PushBridge] LocalNotifications 通知已发送 #' + id + ':', title, body);
            return id;
        }).catch(function (e) {
            console.warn('[PushBridge] LocalNotifications 通知失败:', e.message || e);
            return null;
        });
    }

    // ====== 浏览器通知（Service Worker 优先，保证后台/失焦也能弹出） ======
    // 直接 new Notification() 在 Chrome 中仅当标签页活动/可见时才真正显示，
    // 后台或不聚焦时会静默丢弃；registration.showNotification() 不依赖可见性。
    function _sendViaServiceWorker(title, body, options) {
        try {
            var reg = (PushBridge.webKeepAlive && PushBridge.webKeepAlive._swReg) || null;
            if (!reg || !reg.showNotification) return false;
            options = options || {};
            var tag = options.tag || (options.urgent ? 'partner-invite' : 'partner-msg');
            reg.showNotification(title, {
                body: body,
                icon: options.avatar || BRAND_ICON,
                badge: BRAND_ICON,
                tag: tag,
                renotify: true,
                requireInteraction: !!options.urgent,
                vibrate: options.urgent ? [120, 80, 120] : [0, 200, 120, 200],
                data: { url: (location && location.href) || '/', contactId: options.contactId || null }
            }).then(function () {
                console.log('[PushBridge] Service Worker 浏览器通知:', title, body);
            }).catch(function () { /* 忽略 */ });
            return true;
        } catch (e) {
            return false;
        }
    }

    function _sendBrowserNotif(title, body, options) {
        options = options || {};
        if (!notifEnabled()) return false;
        if (!('Notification' in global)) return false;
        if (global.Notification.permission !== 'granted') return false;

        // 用户正专注查看本页：默认不弹系统通知（前台横幅已提示）；
        // 只有 settings.notifyForeground === true 时才"内外双达"。
        var focused = false;
        try { focused = document.visibilityState === 'visible' && (!document.hasFocus || document.hasFocus()); } catch (e) {}
        if (focused && options.inForeground !== true) return false;

        if (_sendViaServiceWorker(title, body, options)) return true;

        try {
            new global.Notification(title, {
                body: body,
                icon: options.avatar || BRAND_ICON,
                badge: BRAND_ICON,
                tag: options.tag || 'partner-msg',
                renotify: true,
                requireInteraction: !!options.urgent
            });
            console.log('[PushBridge] 浏览器通知:', title, body);
            return true;
        } catch (e) {
            console.warn('[PushBridge] 浏览器通知失败:', e);
            return false;
        }
    }

    // ====== 公开 API ======
    var PushBridge = {
        isNative: function () { return _isNative(); },

        isAvailable: function () {
            if (_isNative()) {
                discoverPlugins();
                if (_notifPlugin || _lnPlugin) return true;
            }
            return 'Notification' in global;
        },

        /**
         * 弹系统通知。
         * options：
         *   sender   发件人小字（梦角名）
         *   avatar   大图标（梦角头像，data URL 或 http）
         *   tag      浏览器通知的替换标记（按梦角区分）
         *   group    原生通知分组（按梦角区分）
         *   contactId 用于点击通知跳转
         *   urgent   紧急提醒（来电/邀请）：全屏弹窗 + 常驻
         */
        send: function (title, body, options) {
            options = options || {};
            title = title || '字卡传讯';
            body = body || '';

            if (_isNative()) {
                discoverPlugins();
                if (_notifPlugin) { _sendViaCustomPlugin(title, body, options); return; }
                if (_lnPlugin) { _sendViaLocalNotif(title, body, options); return; }

                console.log('[PushBridge] 插件未就绪，等待 Capacitor 桥接...');
                waitForCapacitor(3000).then(function (ready) {
                    if (!ready) return;
                    discoverPlugins();
                    if (_notifPlugin) _sendViaCustomPlugin(title, body, options);
                    else if (_lnPlugin) _sendViaLocalNotif(title, body, options);
                });
                return;
            }

            _sendBrowserNotif(title, body, options);
        },

        /** 原生闹钟排期：整体替换（浏览器下空转） */
        syncScheduledAlarms: function (items) {
            if (!_isNative()) return;
            discoverPlugins();
            if (!_notifPlugin || typeof _notifPlugin.syncScheduled !== 'function') return;
            try {
                _notifPlugin.syncScheduled({ items: items || [] }).catch(function () {});
            } catch (e) {}
        },

        clearScheduledAlarms: function () {
            if (!_isNative()) return;
            discoverPlugins();
            if (!_notifPlugin || typeof _notifPlugin.clearScheduled !== 'function') return;
            try { _notifPlugin.clearScheduled().catch(function () {}); } catch (e) {}
        },

        /** 取出"到点弹过通知、但还没进聊天"的消息（浏览器下恒为空） */
        drainScheduledAlarms: function () {
            if (!_isNative()) return Promise.resolve([]);
            discoverPlugins();
            if (!_notifPlugin || typeof _notifPlugin.drainScheduled !== 'function') {
                return Promise.resolve([]);
            }
            return _notifPlugin.drainScheduled().then(function (r) {
                return (r && r.items) ? r.items : [];
            }).catch(function () { return []; });
        },

        requestPermission: function () {
            if (_isNative()) {
                discoverPlugins();
                if (_notifPlugin) {
                    return _notifPlugin.requestPermission().then(function (result) {
                        _permissionGranted = (result && result.granted === true);
                        return _permissionGranted ? 'granted' : 'denied';
                    }).catch(function () { return 'denied'; });
                }
                if (_lnPlugin) {
                    return _lnPlugin.requestPermissions().then(function (result) {
                        _permissionGranted = (result && result.display === 'granted');
                        return _permissionGranted ? 'granted' : 'denied';
                    }).catch(function () { return 'denied'; });
                }
            }
            if (!('Notification' in global)) return Promise.resolve('unsupported');
            if (global.Notification.permission === 'granted') {
                _permissionGranted = true;
                return Promise.resolve('granted');
            }
            return global.Notification.requestPermission().then(function (perm) {
                _permissionGranted = (perm === 'granted');
                return perm;
            });
        },

        getStatus: function () {
            if (_isNative()) return _permissionGranted ? 'granted' : 'unknown';
            if (!('Notification' in global)) return 'unsupported';
            return global.Notification.permission;
        },

        /**
         * 网页端后台增强：注册 Service Worker 供「离线消息提醒」使用，
         * 并在页面转入后台时申请 Wake Lock，尽量减缓被系统冻结。
         */
        webKeepAlive: {
            _swReg: null,
            _wakeLock: null,

            init: function () {
                if (_isNative()) return;      // APK 走原生前台服务
                this._registerServiceWorker();
                this._wakeLockListeners();
            },

            _registerServiceWorker: function () {
                try {
                    if (!('serviceWorker' in global.navigator)) return;
                    var self = this;
                    global.navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
                        self._swReg = reg;
                        console.log('[PushBridge] 后台兜底 SW 已注册', reg.scope);
                    }).catch(function (e) {
                        console.warn('[PushBridge] SW 注册失败（后台兜底通知不可用）:', e.message || e);
                    });
                } catch (e) {}
            },

            _requestWakeLock: function () {
                try {
                    if (!('wakeLock' in global.navigator)) return;
                    var self = this;
                    global.navigator.wakeLock.request('screen').then(function (lock) {
                        self._wakeLock = lock;
                    }).catch(function () {});
                } catch (e) {}
            },

            _releaseWakeLock: function () {
                try {
                    if (this._wakeLock) { this._wakeLock.release(); this._wakeLock = null; }
                } catch (e) {}
            },

            _wakeLockListeners: function () {
                var self = this;
                try {
                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'hidden') self._requestWakeLock();
                        else self._releaseWakeLock();
                    });
                } catch (e) {}
            }
        },

        init: function () {
            if (_initialized) return;
            _initialized = true;

            console.log('[PushBridge] 初始化 | Capacitor:', !!global.Capacitor);

            try {
                if (!_isNative()) this.webKeepAlive.init();
            } catch (e) {}

            waitForCapacitor(5000).then(function (ready) {
                if (!ready) {
                    console.log('[PushBridge] 桥接超时，使用浏览器模式');
                    return;
                }
                discoverPlugins();
                console.log('[PushBridge] 桥接就绪 | 自定义插件:', !!_notifPlugin,
                    '| LocalNotifications:', !!_lnPlugin);
                if (_notifPlugin) {
                    _notifPlugin.requestPermission().then(function (result) {
                        _permissionGranted = (result && result.granted === true);
                    }).catch(function () {});
                } else if (_lnPlugin) {
                    _lnPlugin.requestPermissions().then(function (result) {
                        _permissionGranted = (result && result.display === 'granted');
                    }).catch(function () {});
                }
            });
        }
    };

    global.PushBridge = PushBridge;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { PushBridge.init(); });
    } else {
        PushBridge.init();
    }

})(window);

/* =========================================================================
 * 离线消息提醒（Periodic Background Sync，零后端）
 *
 * 与根目录 sw.js 配合：页面全部关闭后，Chromium 按自身策略定期唤醒 SW，
 * SW 读本模块写入的「可发文案」快照 → 随机抽一位梦角 + 一条文案 →
 * 以该梦角名义弹系统通知，同时把这条追加进待投递队列；
 * 用户回开应用后由本模块把队列补投递进对应梦角的聊天。
 *
 * 如实边界：仅 Chromium 系支持；需把站点“添加到主屏幕”并从主屏图标打开
 * （standalone）才可能被调度；频率由系统决定（约数小时一次）；
 * iPhone Safari 无此 API；进程被系统杀死后无法唤醒（那需要真推送服务端）。
 * ========================================================================= */
(function () {
    'use strict';

    var IS_NATIVE = !!(window.Capacitor && window.Capacitor.Plugins);

    var TAG = 'kismet-partner-msg';
    var SNAP_KEY = 'kismet:psync-snap';
    var QUEUE_KEY = 'kismet:psync-queue';
    var DB = 'kismet-offline-db';
    var STORE = 'kv';
    var TTL = 7 * 24 * 60 * 60 * 1000;

    var BUILTIN = [
        '刚看到一句话，想起你了。',
        '你在忙吗？我这边刚刚想到你。',
        '没什么事，就是想跟你说句话。',
        '今天也要好好吃饭呀。',
        '突然很想你，就说一声。',
        '记得喝水，别总忘了。',
        '晚安前跟你说一声，我在。',
        '有空的时候理理我呀。'
    ];

    // ---- IndexedDB（与根目录 sw.js 共用同一 DB/表）----
    function openDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB, 1);
            req.onupgradeneeded = function () {
                try {
                    if (!req.result.objectStoreNames.contains(STORE)) {
                        req.result.createObjectStore(STORE);
                    }
                } catch (e) {}
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('offline idb open fail')); };
        });
    }
    function idbGet(key) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try { tx = db.transaction(STORE, 'readonly'); } catch (e) { reject(e); return; }
                var rq = tx.objectStore(STORE).get(key);
                rq.onsuccess = function () { resolve(rq.result); };
                rq.onerror = function () { reject(rq.error); };
            });
        });
    }
    function idbSet(key, val) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try { tx = db.transaction(STORE, 'readwrite'); } catch (e) { reject(e); return; }
                tx.objectStore(STORE).put(val, key);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    // ---- 判定 ----
    function supported() {
        try { return 'serviceWorker' in navigator && 'PeriodicSyncManager' in window; } catch (e) { return false; }
    }
    function standalone() {
        try {
            return !!(window.matchMedia &&
                window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches);
        } catch (e) { return false; }
    }
    function enabledProp() {
        try {
            if (typeof settings !== 'undefined' && settings) {
                if (settings.notifyEnabled === false) return false;
                if (settings.offlineNotifyEnabled === false) return false;
                return true;
            }
        } catch (e) {}
        return true;
    }
    function periodicManager(reg) {
        try { if (navigator.periodicSync && navigator.periodicSync.register) return navigator.periodicSync; } catch (e) {}
        try { if (reg && reg.periodicSync) return reg.periodicSync; } catch (e) {}
        return null;
    }

    // ---- 文案：每位梦角的字卡池（只取纯文本短句）----
    function plain(t) {
        if (typeof t !== 'string') return false;
        var s = t.trim();
        if (!s || s.length > 60) return false;
        if (s.indexOf('|||') >= 0) return false;              // 语音卡
        if (s.indexOf('data:') === 0) return false;           // 图片/表情
        if (s.indexOf('http:') === 0 || s.indexOf('https:') === 0) return false;
        return true;
    }
    function shuffle(a) {
        var r = a.slice();
        for (var i = r.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = r[i]; r[i] = r[j]; r[j] = t;
        }
        return r;
    }

    var _snapCount = 0;
    function buildSnapshot() {
        var partners = [];
        try {
            var singles = contacts.filter(function (c) { return !isGroupContact(c); });
            singles.slice(0, 8).forEach(function (c) {
                var pool = [];
                try { pool = poolFor(c.id) || []; } catch (e) { pool = []; }
                var texts = shuffle(pool.filter(plain)).slice(0, 8).map(function (t) {
                    return { t: String(t).trim(), k: 'pool' };
                });
                if (!texts.length) {
                    texts = shuffle(BUILTIN).slice(0, 3).map(function (t) { return { t: t, k: 'bl' }; });
                }
                partners.push({
                    cid: c.id,
                    name: c.name || '对方',
                    avatar: contactAvatar(c) || '',
                    texts: texts
                });
            });
        } catch (e) { partners = []; }

        var snap = { v: 2, ts: Date.now(), partners: partners };
        _snapCount = 0;
        partners.forEach(function (p) { _snapCount += p.texts.length; });
        idbSet(SNAP_KEY, snap).catch(function () {});
        return Promise.resolve(snap);
    }

    // ---- 注册 / 注销 ----
    function apply() {
        if (IS_NATIVE) return Promise.resolve();
        if (!supported() || !enabledProp()) return Promise.resolve();
        return navigator.serviceWorker.ready.then(function (reg) {
            var pm = periodicManager(reg);
            if (!pm) return;
            return navigator.permissions.query({ name: 'periodic-background-sync' }).then(function (st) {
                if (st && st.state === 'denied') return;
                return pm.register(TAG, { minInterval: 4 * 60 * 60 * 1000 }).then(function () {
                    return buildSnapshot();
                });
            });
        }).catch(function () {});
    }
    function teardown() {
        if (IS_NATIVE) return Promise.resolve();
        if (!supported()) return Promise.resolve();
        return navigator.serviceWorker.ready.then(function (reg) {
            var pm = periodicManager(reg);
            if (!pm || !pm.getTags) return;
            return pm.getTags().then(function (tags) {
                if (tags.indexOf(TAG) >= 0) { try { return pm.unregister(TAG); } catch (e) {} }
            });
        }).catch(function () {});
    }

    // ---- 把队列补投递进对应梦角的聊天 ----
    function deliverIntoChat(cid, text) {
        try {
            var c = contacts.find(function (x) { return x.id === cid; });
            if (!c || typeof window.addMessage !== 'function') return false;
            window.addMessage({
                id: Date.now() * 100 + Math.floor(Math.random() * 100),
                contactId: cid,
                sender: 'partner',
                senderId: null,
                text: String(text),
                image: null,
                voice: null,
                timestamp: Date.now(),
                status: 'read',
                favorited: false,
                recalled: false,
                replyTo: null,
                type: 'normal'
            }, { fromOffline: true });
            return true;
        } catch (e) { return false; }
    }

    function drainQueue() {
        if (IS_NATIVE) return Promise.resolve(0);
        if (!supported()) return Promise.resolve(0);
        return idbGet(QUEUE_KEY).then(function (arr) {
            if (!Array.isArray(arr) || !arr.length) return 0;
            var now = Date.now();
            var remain = [];
            var delivered = 0;
            arr.forEach(function (it) {
                if (!it || typeof it.t !== 'string' || !it.t.trim()) return;
                if (!it.ts || now - it.ts > TTL) return;              // 过期丢弃
                var cid = it.cid || '';
                if (!cid) return;
                // 防重复：该会话最近 10 条里 30 分钟内有同文本视为已投递
                var dup = false;
                try {
                    var msgs = messagesByContact[cid] || [];
                    for (var j = Math.max(0, msgs.length - 10); j < msgs.length; j++) {
                        var m = msgs[j];
                        if (m && m.text === it.t && Math.abs((Number(m.timestamp) || 0) - it.ts) < 30 * 60000) {
                            dup = true; break;
                        }
                    }
                } catch (e) {}
                if (dup) return;
                if (deliverIntoChat(cid, it.t)) delivered++;
                else remain.push(it);
            });
            idbSet(QUEUE_KEY, remain).catch(function () {});
            return delivered;
        }).catch(function () { return 0; });
    }

    // ---- 点击离线通知：聚焦已开窗口（补投递由 drainQueue 在回前台时完成）----
    try {
        if (!IS_NATIVE && navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener('message', function (e) {
                if (!e || !e.data || e.data.type !== 'KISMET_NOTIFY_CLICK') return;
                try {
                    if (!document.hidden && window.focus) window.focus();
                    if (e.data.contactId) notifyBannerJump(e.data.contactId, 'chat');
                } catch (x) {}
            });
        }
    } catch (e) {}

    // ---- 生命周期 ----
    var _booted = false;
    function boot() {
        if (IS_NATIVE || _booted) return;
        _booted = true;
        setTimeout(function () { apply(); }, 8000);
        [12000, 27000, 47000].forEach(function (ms) {
            setTimeout(function () { try { drainQueue(); } catch (e) {} }, ms);
        });
        try {
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState !== 'visible') return;
                try { drainQueue(); } catch (e) {}
                try {
                    if (supported() && enabledProp() && standalone()) {
                        var last = window.__offlineSnapLastAt || 0;
                        if (Date.now() - last > 300000) { window.__offlineSnapLastAt = Date.now(); apply(); }
                    }
                } catch (e) {}
            });
        } catch (e) {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.OfflineReminder = {
        apply: apply,
        teardown: teardown,
        buildSnapshot: buildSnapshot,
        drain: drainQueue,
        supported: supported,
        isStandalone: standalone,
        isEnabled: enabledProp,
        snapshotCount: function () { return _snapCount; }
    };
})();
