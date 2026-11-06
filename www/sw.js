/**
 * sw.js — Service Worker（浏览器后台兜底）
 *
 * 字卡传讯是纯本地架构（零后端），所以后台提醒只做一件事：
 *
 *   离线消息提醒（Periodic Background Sync）
 *   页面全关后，Chromium 按自身策略定期唤醒本 SW：读页面端写入的
 *   「每位梦角的可发文案」快照 → 随机抽一位梦角 + 一条文案 →
 *   以该梦角名义弹系统通知，同时把这条追加进待投递队列；
 *   用户回开应用后由页面端把队列补投递进对应梦角的聊天，
 *   做到「通知上看到什么，聊天里就有什么」。
 *
 *   如实边界：仅 Chromium 系支持；需把站点「添加到主屏幕」并从主屏图标打开
 *   （standalone）才可能被调度；频率由系统决定（约数小时一次）；
 *   iPhone Safari 无此 API；进程被系统杀死后无法唤醒（那需要真推送服务端，
 *   本项目不引入）。想要真正的「切后台也不漏」，请用安卓 APK：那边是
 *   前台服务 + 精确闹钟 + 开机自启。
 *
 *   本 SW 不接管 fetch / 不做离线缓存，避免干扰站点既有加载流程。
 */

var PSYNC_DB = 'kismet-offline-db';
var PSYNC_STORE = 'kv';
var PSYNC_SNAP_KEY = 'kismet:psync-snap';
var PSYNC_QUEUE_KEY = 'kismet:psync-queue';
var PSYNC_TAG = 'kismet-partner-msg';
var PSYNC_TTL = 7 * 24 * 60 * 60 * 1000; // 快照 7 天未刷新（长期没开应用）不再打扰

var BRAND_ICON = 'icons/icon-192.png';

// ===== IndexedDB 读写（页面端与本 SW 共用同一 DB/表）=====
function psyncOpenDb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(PSYNC_DB, 1);
    req.onupgradeneeded = function () {
      try {
        if (!req.result.objectStoreNames.contains(PSYNC_STORE)) {
          req.result.createObjectStore(PSYNC_STORE);
        }
      } catch (e) {}
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('psync idb open fail')); };
  });
}
function psyncIdbGet(key) {
  return psyncOpenDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx;
      try { tx = db.transaction(PSYNC_STORE, 'readonly'); } catch (e) { reject(e); return; }
      var rq = tx.objectStore(PSYNC_STORE).get(key);
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
  });
}
function psyncIdbSet(key, val) {
  return psyncOpenDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx;
      try { tx = db.transaction(PSYNC_STORE, 'readwrite'); } catch (e) { reject(e); return; }
      tx.objectStore(PSYNC_STORE).put(val, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

async function psyncPush(text, cid, k) {
  var arr = [];
  try {
    var q = await psyncIdbGet(PSYNC_QUEUE_KEY);
    if (Array.isArray(q)) arr = q;
  } catch (e) {}
  arr.push({ t: text, cid: cid || '', ts: Date.now(), k: k || '' });
  while (arr.length > 20) arr.shift();
  try { await psyncIdbSet(PSYNC_QUEUE_KEY, arr); } catch (e) {}
}

async function psyncNotify(title, body, tag, icon, cid) {
  var opts = {
    body: body,
    tag: tag,
    renotify: true,
    badge: BRAND_ICON,
    data: { contactId: cid || null, url: '/' }
  };
  if (icon) opts.icon = icon;
  try {
    await self.registration.showNotification(title, opts);
  } catch (e) {
    // 无图标资源/图标格式不支持时降级为无图标通知，不阻断
    try {
      await self.registration.showNotification(title, {
        body: body, tag: tag, renotify: true,
        data: { contactId: cid || null, url: '/' }
      });
    } catch (e2) {}
  }
}

// ===== 离线消息提醒：periodicsync =====
self.addEventListener('periodicsync', function (e) {
  if (e.tag !== PSYNC_TAG) return;
  e.waitUntil((async function () {
    var snap = await psyncIdbGet(PSYNC_SNAP_KEY);
    if (!snap || !Array.isArray(snap.partners) || !snap.partners.length) return;
    if (!snap.ts || Date.now() - snap.ts > PSYNC_TTL) return;

    // 随机抽一位"还有文案可发"的梦角，再随机抽一条
    var pool = snap.partners.filter(function (p) {
      return p && Array.isArray(p.texts) && p.texts.length;
    });
    if (!pool.length) return;
    var partner = pool[Math.floor(Math.random() * pool.length)];
    var pick = partner.texts[Math.floor(Math.random() * partner.texts.length)];
    var text = pick && pick.t ? String(pick.t) : '';
    if (!text) return;

    await psyncPush(text, partner.cid || '', pick.k || '');
    await psyncNotify(partner.name || '对方', text,
      PSYNC_TAG + '-' + (partner.cid || 'any'), partner.avatar || '', partner.cid || '');
  })().catch(function () {}));
});

// ===== 通知点击：聚焦已有窗口 / 开新窗口，并通知页面端跳转 =====
self.addEventListener('notificationclick', function (e) {
  var notif = e.notification;
  var tag = (notif && notif.tag) || '';
  var data = (notif && notif.data) || {};
  var cid = data.contactId || '';
  try { notif.close(); } catch (x) {}

  e.waitUntil((function () {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      if (cs && cs.length) {
        var c = cs[0];
        try { c.focus(); } catch (x) {}
        try { c.postMessage({ type: 'KISMET_NOTIFY_CLICK', tag: tag, contactId: cid }); } catch (x) {}
        return;
      }
      return self.clients.openWindow('./').then(function (w) {
        if (!w || !w.postMessage) return;
        // 新开窗口页面脚本可能尚未注册 message 监听，重试几次
        var i = 0;
        var t = setInterval(function () {
          i++;
          try { w.postMessage({ type: 'KISMET_NOTIFY_CLICK', tag: tag, contactId: cid }); } catch (x) {}
          if (i >= 3) clearInterval(t);
        }, 800);
      }).catch(function () {});
    });
  })());
});
