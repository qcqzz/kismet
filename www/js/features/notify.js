/* ============ 字卡传讯 · 通知调度（系统通知 + 前台横幅） ============ */
/*
 * 一处收口：所有"梦角主动惊动用户"的事件都走这里，再由这里决定
 *   - 前台（页面可见且获焦）→ 只弹应用内顶部横幅，绝不弹系统通知（微信同款）
 *   - 后台 / 失焦 / 锁屏 → 走 PushBridge 弹系统通知（APK 原生通知 / 浏览器通知）
 *
 * 每位梦角独立一条通知：标题=梦角名、大图标=该梦角头像、tag/group 按梦角区分，
 * 所以小语的提醒不会顶掉阿墨的提醒。
 */

var _nbTimer = null;

// ---------- 基础取值 ----------
function _nbContact(cid) {
  if (!cid) return null;
  return contacts.find(function (c) { return c.id === cid; }) || null;
}
function _nbTitle(c) { return (c && c.name) ? c.name : '字卡传讯'; }
function _nbAvatar(c) {
  if (!c) return '';
  var v = '';
  try {
    if (isGroupContact(c)) {
      // 群聊没有自己的头像，用第一位成员的头像顶上
      var ids = getGroupMemberIds(c);
      var m = ids.length && typeof memberById === 'function' ? memberById(ids[0]) : null;
      v = m ? (contactAvatar(m) || '') : '';
    } else {
      v = contactAvatar(c) || '';
    }
  } catch (e) { return ''; }
  // 图库为空时是内联 SVG 占位图：原生解码器与通知图标都不吃 SVG，
  // 直接留空，让系统回退到 App 图标 / 品牌角标。
  if (typeof v === 'string' && v.indexOf('data:image/svg') === 0) return '';
  return v;
}

// 分类开关（总开关 + 分项开关）
function _nbKindOn(kind) {
  if (!settings) return false;
  if (settings.notifyEnabled === false) return false;
  if (kind === 'poke') return settings.notifyPoke !== false;
  if (kind === 'letter') return settings.notifyLetters !== false;
  if (kind === 'period') return settings.notifyChat !== false;
  if (kind === 'schedule') return settings.notifyChat !== false;
  if (String(kind).indexOf('moment') === 0) return settings.notifyMoments !== false;
  return settings.notifyChat !== false;
}

// 页面可见且真正拿到焦点（切到别的窗口/别的 App 都算没焦点）
function _nbFocused() {
  try {
    if (document.visibilityState !== 'visible') return false;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
    return true;
  } catch (e) { return false; }
}

// 用户正盯着这个会话看：消息直接出现在聊天里，任何提醒都是多余的
function _nbWatchingChat(cid) {
  if (!cid || !_nbFocused()) return false;
  var v = document.getElementById('view-chat');
  return !!(v && v.classList.contains('active') && cid === activeContactId);
}

// ---------- 顶部横幅 ----------
function _nbIco(kind) {
  if (kind === 'letter') return '<i class="fas fa-envelope"></i>';
  if (kind === 'period') return '<i class="fas fa-heartbeat"></i>';
  if (kind === 'schedule') return '<i class="fas fa-calendar-check"></i>';
  if (String(kind).indexOf('moment') === 0) return '<i class="fas fa-images"></i>';
  if (kind === 'poke') return '<i class="fas fa-hand-pointer"></i>';
  return '<i class="fas fa-comment-dots"></i>';
}

function notifyBanner(cid, title, body, kind) {
  var box = document.getElementById('notify-banner');
  if (!box) {
    box = document.createElement('div');
    box.id = 'notify-banner';
    box.className = 'notify-banner';
    document.body.appendChild(box);
  }
  var c = _nbContact(cid);
  box.innerHTML =
    '<div class="nb-avatar">' + avatarHtml(_nbAvatar(c)) + '</div>' +
    '<div class="nb-mid">' +
      '<div class="nb-title">' + escapeHtml(title) + '</div>' +
      '<div class="nb-body">' + escapeHtml(body) + '</div>' +
    '</div>' +
    '<div class="nb-ico">' + _nbIco(kind) + '</div>';
  box.dataset.cid = cid || '';
  box.dataset.kind = kind || '';
  // 先撤掉再触发动画，连发两条时也有"重新滑下来"的反馈
  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');
  clearTimeout(_nbTimer);
  _nbTimer = setTimeout(function () { box.classList.remove('show'); }, 4500);
}

function notifyBannerJump(cid, kind) {
  var box = document.getElementById('notify-banner');
  if (box) box.classList.remove('show');
  if (kind === 'period') {
    showView('period');
    if (window.PeriodApp) PeriodApp.onShow();
    return;
  }
  if (kind === 'schedule') {
    showView('schedule');
    if (window.ScheduleApp) ScheduleApp.onShow();
    return;
  }
  if (String(kind).indexOf('moment') === 0) {
    showView('moments');
    if (typeof renderMoments === 'function') renderMoments(null);
    return;
  }
  if (kind === 'letter') {
    showView('letters');
    if (typeof envelopeTick === 'function') envelopeTick();
    if (typeof renderLetters === 'function') renderLetters();
    return;
  }
  if (cid && typeof openChat === 'function') openChat(cid);
}

document.addEventListener('click', function (e) {
  var box = e.target && e.target.closest && e.target.closest('#notify-banner');
  if (!box) return;
  notifyBannerJump(box.dataset.cid, box.dataset.kind);
});

// ---------- 统一投递 ----------
function notifyDeliver(cid, title, body, kind) {
  body = String(body || '').trim();
  if (!body) return;
  if (!_nbKindOn(kind)) return;

  var c = _nbContact(cid);
  title = title || _nbTitle(c);

  if (_nbWatchingChat(cid)) return;      // 正在看这段 conversation

  if (_nbFocused() && settings.notifyForeground !== true) {
    notifyBanner(cid, title, body, kind);
    return;                               // 前台只走横幅
  }

  // 后台：系统通知（按梦角独立分组）
  try {
    if (window.PushBridge && typeof PushBridge.send === 'function') {
      PushBridge.send(title, body, {
        sender: title,
        avatar: _nbAvatar(c),
        tag: 'kismet-' + (cid || 'app'),
        group: 'kismet-' + (cid || 'app'),
        contactId: cid
      });
    }
  } catch (e) { console.warn('[Notify] 系统通知失败:', e); }

  // 若用户其实还在前台（只是关掉了"前台不弹"的开关），横幅也一起给
  if (_nbFocused()) notifyBanner(cid, title, body, kind);
}

// ---------- 各类事件 ----------
// 聊天消息：文本 / 图片 / 表情包 / 语音条 / 红包
function _nbMsgBody(msg, cid) {
  var t = '';
  if (msg.type === 'redpacket') t = '🧧 收到一个红包';
  else if (msg.voice) t = '[语音]' + (msg.voice.text ? ' ' + msg.voice.text : '');
  else if (msg.image && !msg.text) t = '[表情]';
  else if (msg.image) t = '[图片] ' + (msg.text || '');
  else t = msg.text || '';

  // 群聊：前面补上具体是谁
  if (msg.senderId && msg.senderId !== cid) {
    var m = (typeof memberById === 'function') ? memberById(msg.senderId) : null;
    if (m && m.name && t.indexOf(m.name + '：') !== 0) t = m.name + '：' + t;
  }
  return t;
}

function notifyChatMessage(msg) {
  if (!msg || msg.sender !== 'partner') return;
  if (msg.type === 'system') return;                 // 拍一走 notifyPoke
  if (msg.recalled) return;
  var cid = msg.contactId || activeContactId;
  notifyDeliver(cid, null, _nbMsgBody(msg, cid), 'chat');
}

// 拍一拍：标题=梦角名，正文=动作（不含名字前缀，名字已经在标题里了）
function notifyPoke(contactId, memberName, action) {
  var name = memberName || '';
  var act = String(action || '').trim();
  if (name && act.indexOf(name) === 0) act = act.slice(name.length).trim();
  notifyDeliver(contactId, name || null, act || '拍了拍你', 'poke');
}

// 信件：新来信 / 回信
function notifyLetter(contactId, isReply, preview) {
  var body = isReply ? '回信了，快去信箱看看吧' : '给你写了一封信，快去信箱看看吧';
  if (preview) body = (isReply ? '回信了：' : '来信：') + preview;
  notifyDeliver(contactId, null, body, 'letter');
}

// 朋友圈：发动态 / 赞 / 评论 / 回复评论
function notifyMoment(contactId, kind, payload) {
  payload = payload || {};
  var text = String(payload.text || '').trim();
  var short = text.length > 40 ? text.slice(0, 40) + '…' : text;
  var body;
  if (kind === 'post') body = short ? '发了新动态：' + short : '发了新动态';
  else if (kind === 'like') body = '赞了你的动态';
  else if (kind === 'comment') body = short ? '评论了你的动态：' + short : '评论了你的动态';
  else if (kind === 'reply') body = short ? '回复了你的评论：' + short : '回复了你的评论';
  else body = '有新互动';
  notifyDeliver(contactId, null, body, 'moment' + kind.charAt(0).toUpperCase() + kind.slice(1));
}

// ---------- 权限 ----------
function notifyPermissionState() {
  try {
    if (window.PushBridge && typeof PushBridge.getStatus === 'function') return PushBridge.getStatus();
  } catch (e) {}
  return 'unknown';
}

function notifyRequestPermission() {
  return new Promise(function (resolve) {
    try {
      if (window.PushBridge && typeof PushBridge.requestPermission === 'function') {
        PushBridge.requestPermission().then(resolve).catch(function () { resolve('denied'); });
        return;
      }
    } catch (e) {}
    if (!('Notification' in window)) return resolve('unsupported');
    if (Notification.permission === 'granted') return resolve('granted');
    Notification.requestPermission().then(resolve).catch(function () { resolve('denied'); });
  });
}

// 自测：立刻发一条通知，方便用户在系统里确认到底通不通
function notifyTest() {
  var c = contacts.filter(function (x) { return !isGroupContact(x); })[0] || null;
  var cid = c ? c.id : null;
  var c2 = _nbContact(cid);
  try {
    if (window.PushBridge && typeof PushBridge.send === 'function') {
      PushBridge.send(_nbTitle(c2), '这是一条测试通知', {
        sender: _nbTitle(c2),
        avatar: _nbAvatar(c2),
        tag: 'kismet-' + (cid || 'app'),
        group: 'kismet-' + (cid || 'app'),
        contactId: cid
      });
    }
  } catch (e) {}
  notifyBanner(cid, _nbTitle(c2), '这是一条测试通知', 'chat');
}

window.notifyDeliver = notifyDeliver;
window.notifyChatMessage = notifyChatMessage;
window.notifyPoke = notifyPoke;
window.notifyLetter = notifyLetter;
window.notifyMoment = notifyMoment;
window.notifyBanner = notifyBanner;
window.notifyBannerJump = notifyBannerJump;
window.notifyRequestPermission = notifyRequestPermission;
window.notifyPermissionState = notifyPermissionState;
window.notifyTest = notifyTest;

/* =========================================================================
 * 原生闹钟排期（APK）——让消息不依赖 WebView 的定时器
 *
 * 背景：梦角"主动找我"原本靠页面里的 setInterval。用户切到别的应用后，
 * WebView 的定时器会被系统降频，进程被回收后更是彻底停摆——表现就是
 * 「别人在用的应用开着，我就不收消息了」。
 *
 * 做法：把未来几次"梦角说话"提前交给 Android 的精确闹钟（AlarmManager）。
 *   - 页面活着时：每 60 秒重新 sync 一次，闹钟不断被推后，实际由 JS 投递（不重复）；
 *   - 页面被冻结 / 进程被杀：JS 停止 sync，闹钟到点自己弹通知，
 *     并把这句话记进"待投递"，用户打开应用后由 drain 补进聊天。
 *
 * 所以通知上看到什么，聊天里就有什么；而且应用多久没打开都不会断。
 * ========================================================================= */

var NATIVE_ALARM_SLOTS = 3;      // 同时预定几格
var NATIVE_ALARM_TEXTS = 6;      // 每格自带几句，供原生到点后继续顺延
var NATIVE_FALLBACK_TEXTS = [
  '在忙吗？我这边刚刚想到你。',
  '没什么事，就是想跟你说句话。',
  '今天也要好好吃饭呀。',
  '突然很想你，就说一声。',
  '记得喝水，别总忘了。',
  '有空的时候理理我呀。'
];

function _naPlain(t) {
  if (typeof t !== 'string') return false;
  var s = t.trim();
  if (!s || s.length > 60) return false;
  if (s.indexOf('|||') >= 0) return false;            // 语音卡
  if (s.indexOf('data:') === 0) return false;         // 图片 / 表情
  if (s.indexOf('http:') === 0 || s.indexOf('https:') === 0) return false;
  return true;
}

function _naShuffle(a) {
  var r = a.slice();
  for (var i = r.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = r[i]; r[i] = r[j]; r[j] = t;
  }
  return r;
}

// 从该梦角的字卡池里挑 n 句；池子不够就用内置兜底
function _naPickTexts(cid, n) {
  var pool = [];
  try { pool = (poolFor(cid) || []).filter(_naPlain); } catch (e) { pool = []; }
  pool = _naShuffle(pool);
  var out = [];
  for (var i = 0; i < n; i++) {
    if (pool.length) out.push(pool[i % pool.length].trim());
    else out.push(NATIVE_FALLBACK_TEXTS[i % NATIVE_FALLBACK_TEXTS.length]);
  }
  return out;
}

function _naNative() {
  return !!(window.PushBridge && typeof PushBridge.isNative === 'function' && PushBridge.isNative());
}

// 组装排期：按「主动发消息」的间隔，往后铺几格，每格换一位梦角
function buildNativeAlarmItems() {
  var items = [];
  if (!settings || settings.autoSendEnabled !== true) return items;
  if (settings.replyEnabled === false) return items;   // 自动回复关掉时不会有主动消息
  if (!_nbKindOn('chat')) return items;   // 通知总开关 / 聊天通知关掉时不排期

  var minutes = Math.max(1, Math.min(180, Number(settings.autoSendInterval) || 5));
  var intervalMs = Math.round(minutes * 60000);

  var singles = [];
  try {
    singles = contacts.filter(function (c) { return !isGroupContact(c); });
  } catch (e) { singles = []; }
  if (!singles.length) return items;
  singles = _naShuffle(singles);       // 打散，让几格尽量分给不同梦角

  var now = Date.now();
  for (var i = 0; i < NATIVE_ALARM_SLOTS; i++) {
    var c = singles[i % singles.length];
    items.push({
      // key 必须每位梦角每一格都唯一：原生侧用它区分 PendingIntent，
      // 否则同一梦角的多格会互相覆盖，只剩最后一格生效。
      key: c.id + '#' + i,
      cid: c.id,
      name: c.name || '对方',
      // 大图标 = 该梦角头像。原生侧会把它从 Intent 里摘出来单独存，
      // 避免 Base64 头像撑爆 Binder 的 1MB 事务上限。
      avatar: _nbAvatar(c),
      atMs: now + intervalMs * (i + 1),
      intervalMs: intervalMs,
      texts: _naPickTexts(c.id, NATIVE_ALARM_TEXTS)
    });
  }
  return items;
}

// 把排期交给原生。页面每次 tick / 切后台都会调一次（整体替换，不叠加）
function notifySyncNativeAlarms() {
  if (!_naNative()) return;
  try {
    var items = buildNativeAlarmItems();
    if (!items.length) {
      PushBridge.clearScheduledAlarms();
      return;
    }
    PushBridge.syncScheduledAlarms(items);
  } catch (e) {}
}

// 把"到点弹过通知、但还没进聊天"的消息补进对应会话
function notifyDrainNativeAlarms() {
  if (!_naNative()) return;
  try {
    PushBridge.drainScheduledAlarms().then(function (items) {
      items = items || [];

      // 先给每个会话拍个快照（补投递之前的梦角消息）。后面判断"这条页面自己
      // 是不是已经发过了"只跟快照比，避免刚补进去的消息把同一批里的下一条顶掉。
      var snapshot = {};
      items.forEach(function (it) {
        if (!it || !it.cid || snapshot[it.cid]) return;
        snapshot[it.cid] = (messagesByContact[it.cid] || []).map(function (m) {
          return {
            sender: m && m.sender,
            ts: Number(m && m.timestamp) || 0
          };
        });
      });

      var seen = {};
      items.forEach(function (it) {
        if (!it || !it.cid || !it.text) return;
        var c = _nbContact(it.cid);
        if (!c) return;
        var at = Number(it.ts) || 0;

        // 十分钟内该会话已经有梦角消息 → 页面当时自己投递过，不再补
        var list = snapshot[it.cid] || [];
        for (var i = Math.max(0, list.length - 12); i < list.length; i++) {
          var m = list[i];
          if (m && m.sender === 'partner' && at && Math.abs(m.ts - at) < 10 * 60000) {
            return;
          }
        }

        // 同一批补投递里的同一条消息只补一次
        var sig = it.cid + '|' + it.text + '|' + Math.floor(at / 60000);
        if (seen[sig]) return;
        seen[sig] = 1;

        addMessage({
          id: Date.now() * 100 + Math.floor(Math.random() * 100),
          contactId: it.cid,
          sender: 'partner',
          senderId: null,
          text: String(it.text),
          image: null,
          voice: null,
          timestamp: Date.now(),
          status: 'read',
          favorited: false,
          recalled: false,
          replyTo: null,
          type: 'normal'
        }, { fromOffline: true });
      });
      // 网页端的离线队列一起清
      if (window.OfflineReminder && typeof OfflineReminder.drain === 'function') {
        try { OfflineReminder.drain(); } catch (e) {}
      }
    }).catch(function () {});
  } catch (e) {}
}

window.notifySyncNativeAlarms = notifySyncNativeAlarms;
window.notifyDrainNativeAlarms = notifyDrainNativeAlarms;

