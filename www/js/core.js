/* ============ 字卡传讯 · 核心引擎 ============ */
/* 规则完全对齐 chat：延迟回复队列 / 已读回执 / 已读不回 / 对方撤回3% / 拍一拍3% / 斜杠指令 */

// ---------- 工具 ----------
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTimeHM(ts) {
  var d = new Date(ts);
  var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  var fmt = (typeof settings !== 'undefined' && settings.timestampFormat) || 'HH:mm';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  if (fmt === 'off') return '';
  if (fmt === 'HH:mm:ss') return pad(h) + ':' + pad(m) + ':' + pad(s);
  if (fmt === 'h:mm A' || fmt === 'h:mm:ss A') {
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad(m) + (fmt === 'h:mm:ss A' ? ':' + pad(s) : '') + ' ' + ap;
  }
  return pad(h) + ':' + pad(m);
}

function formatDayLabel(ts) {
  var d = new Date(ts), now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diff = (today - day) / 86400000;
  var hm = formatTimeHM(ts);
  if (diff === 0) return ('今天 ' + hm).trim();
  if (diff === 1) return ('昨天 ' + hm).trim();
  if (diff < 7) return (['周日','周一','周二','周三','周四','周五','周六'][d.getDay()] + ' ' + hm).trim();
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
}

function contactTimeLabel(ts) {
  if (!ts) return '';
  var d = new Date(ts), now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diff = (today - day) / 86400000;
  if (diff === 0) return formatTimeHM(ts);
  if (diff === 1) return '昨天';
  if (diff < 7) return ['日','一','二','三','四','五','六'][d.getDay()];
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function sameDay(a, b) {
  var da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function toast(text, ms) {
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, ms || 1800);
}

function randomBetween(min, max) { return min + Math.random() * (max - min); }

function getActiveContact() {
  return contacts.find(function (c) { return c.id === activeContactId; }) || contacts[0];
}

// ---------- 头像渲染 ----------
// 头像可以是 emoji，也可以是上传的图片（dataURL / http）；凡是输出 HTML 的地方都要走这里，
// 否则 dataURL 会被当成一串文字直接显示出来
function isImageSrc(v) {
  return typeof v === 'string' && /^(data:image\/|https?:|blob:)/.test(v);
}

function avatarHtml(v, fallback) {
  if (isImageSrc(v)) return '<img src="' + escapeHtml(v) + '" alt="">';
  return escapeHtml(v || fallback || '🌷');
}

// 纯文本场景（弹层条目等）没有 img 可用，图片用一个符号占位
function avatarText(v, fallback) {
  if (isImageSrc(v)) return '🖼';
  return v || fallback || '';
}

// ---------- 梦角的图库行为（头像 / 朋友圈背景） ----------
// 图库按梦角各自独立：'avatar' = 头像库，'cover' = 朋友圈背景库
function galleryFor(kind, contactId) {
  var lib = (kind === 'avatar' ? contactAvatars : contactCovers)[contactId];
  return Array.isArray(lib) ? lib : [];
}

// 把图库里的某张图应用给梦角
function applyGalleryImage(contact, kind, dataUrl) {
  if (!contact || !dataUrl) return;
  if (kind === 'avatar') {
    contact.avatar = dataUrl;
    if (typeof _resetDreamSign === 'function') _resetDreamSign();
  } else {
    momentsCovers[contact.id] = dataUrl;
  }
  saveData();
}

// 发推荐：梦角按 20%~80% 浮动概率同意；无论同意与否，这张图都留在图库里可以再发
function sendImageRecommend(contact, kind, dataUrl) {
  if (!contact || !dataUrl) return;
  var min = Number(settings.partnerRecAcceptMin) || 20;
  var max = Number(settings.partnerRecAcceptMax) || 80;
  var chance = randomBetween(min, max);
  var accepted = Math.random() * 100 < chance;
  var what = kind === 'avatar' ? '头像' : '朋友圈背景';

  if (accepted) {
    applyGalleryImage(contact, kind, dataUrl);
    toast(contact.name + ' 接受了你的推荐 · 换上了新' + what);
  } else {
    toast(contact.name + ' 婉拒了这次推荐 · 图还在图库里');
  }
  if (typeof renderContactList === 'function') renderContactList();
  if (typeof renderAllMessages === 'function') renderAllMessages();
  if (typeof renderMoments === 'function' && momentsFilterId === contact.id) renderMoments();
}

// 梦角自主更换头像 / 朋友圈背景：登记为两条独立活动，各自排期
// 间隔在 3~30 天之间随机（由用户设置），到点后按 0~100% 概率真正换
function _swapIntervalMs() {
  var min = Math.max(3, Math.min(30, Number(settings.partnerAutoSwapMinDays) || 3));
  var max = Math.max(min, Math.min(30, Number(settings.partnerAutoSwapMaxDays) || 30));
  return Math.round(randomBetween(min, max) * 86400000);
}
// ---------- 每位梦角各自独立的概率活动（登记表） ----------
// 原则：任何"梦角自发"的行为都走这里。每位梦角的排期、冷却、计数完全独立，
// 新增活动只需 registerPartnerActivity 注册一条，自动按梦角隔离，无需改别处。
var _partnerActivities = [];

function registerPartnerActivity(spec) {
  // key 唯一；重复注册视为覆盖（便于开发期热调）
  _partnerActivities = _partnerActivities.filter(function (a) { return a.key !== spec.key; });
  _partnerActivities.push(spec);
}

function partnerActivityState(contactId) {
  if (!partnerActivities[contactId]) partnerActivities[contactId] = {};
  return partnerActivities[contactId];
}

// 到期判定 + 概率 + 重新排期（无论是否触发都排下一轮，与 chat 一致）
function partnerActivityTick() {
  var now = Date.now();
  var fired = [];
  contacts.forEach(function (c) {
    if (isGroupContact(c)) return;                 // 群聊没有"梦角自发"行为
    var st = partnerActivityState(c.id);
    _partnerActivities.forEach(function (a) {
      if (a.enabled && !a.enabled(c)) return;
      if (!st[a.key]) { st[a.key] = a.nextAt(); saveData(); return; }
      if (now < st[a.key]) return;
      if (Math.random() * 100 < a.chance(c)) {
        try { a.run(c); fired.push(c.name + ':' + a.key); } catch (e) { console.warn('[activity]', a.key, e); }
      }
      st[a.key] = a.nextAt();
    });
  });
  if (fired.length) saveData();
  return fired;
}

// ---------- 梦角自主更换头像 / 朋友圈背景 ----------
// 登记为两条独立活动，各自排期；间隔在 3~30 天之间随机，到点后按 0~100% 概率真正换
function _swapIntervalMs() {
  var min = Math.max(3, Math.min(30, Number(settings.partnerAutoSwapMinDays) || 3));
  var max = Math.max(min, Math.min(30, Number(settings.partnerAutoSwapMaxDays) || 30));
  return Math.round(randomBetween(min, max) * 86400000);
}
function _swapChance() {
  return Math.max(0, Math.min(100, Number(settings.partnerAutoSwapChance) || 0));
}

registerPartnerActivity({
  key: 'autoswap-avatar',
  nextAt: function () { return Date.now() + _swapIntervalMs(); },
  chance: function () { return _swapChance(); },
  enabled: function () { return settings.partnerAutoSwapEnabled; },
  run: function (c) {
    var lib = galleryFor('avatar', c.id);
    if (lib.length < 2) return;                     // 少于 2 张没有"换"的意义
    applyGalleryImage(c, 'avatar', randomOf(lib));  // 完全随机，可能选回当前这张
  }
});

registerPartnerActivity({
  key: 'autoswap-cover',
  nextAt: function () { return Date.now() + _swapIntervalMs(); },
  chance: function () { return _swapChance(); },
  enabled: function () { return settings.partnerAutoSwapEnabled; },
  run: function (c) {
    var lib = galleryFor('cover', c.id);
    if (lib.length < 2) return;
    applyGalleryImage(c, 'cover', randomOf(lib));
  }
});

window.partnerActivityTick = partnerActivityTick;

function activeMessages() {
  return messagesByContact[activeContactId] || [];
}

function _myName() { return (settings && settings.myName) ? settings.myName : '我'; }
function _partnerName() {
  var c = getActiveContact();
  return (c && c.name) ? c.name : '对方';
}

// 通用模态（对齐 chat showModal / hideModal）
function showModal(el, focusEl) {
  if (!el) return;
  el.classList.add('open');
  if (focusEl) setTimeout(function () { try { focusEl.focus(); } catch (e) {} }, 60);
}
window.showModal = showModal;
function hideModal(el) {
  if (!el) return;
  el.classList.remove('open');
}
window.hideModal = hideModal;

// ---------- 群聊 / 梦角 ----------
function isGroupContact(c) { return !!(c && c.type === 'group'); }

function memberById(id) {
  return contacts.find(function (c) { return c.id === id; }) || null;
}

// 群聊中仍然存在的成员 id 列表（成员被删除梦角后自动剔除）
function getGroupMemberIds(group) {
  if (!isGroupContact(group)) return [];
  return (group.members || []).filter(function (id) { return !!memberById(id); });
}

// 双层字卡池：基础库（全员）+ 该梦角专属库，过滤掉被屏蔽的条目
function poolFor(contactId) {
  var pool = replyPool.concat(contactReplyPools[contactId] || []);
  var blocked = (Array.isArray(disabledReplies) ? disabledReplies : [])
    .concat((disabledPoolReplies && Array.isArray(disabledPoolReplies[contactId])) ? disabledPoolReplies[contactId] : []);
  if (!blocked.length) return pool;
  return pool.filter(function (t) { return blocked.indexOf(t) === -1; });
}

// 表情包池：基础（全员通用）+ 该梦角专属，与主字卡同样两级合并
function stickersFor(contactId) {
  return stickerLibrary.concat((contactStickers && contactStickers[contactId]) || []);
}

// 语音条池：只做专属，基础库没有语音条
function voiceFor(contactId) {
  return (voiceLibrary && Array.isArray(voiceLibrary[contactId])) ? voiceLibrary[contactId] : [];
}

// 拍一拍池：side = 'partner'（TA的拍一拍，梦角拍用户）| 'mine'（我的拍一拍，用户拍梦角）
// 同样两级合并；专属那份只对对应梦角生效。
function pokesFor(contactId, side) {
  var base = side === 'mine' ? myPokes : partnerPokes;
  var own = ((contactPokes && contactPokes[contactId]) || {})[side] || [];
  return (base || []).concat(own);
}

// 首页展示的梦角（设置里"首页梦角展示"，未选则第一个）
function getHomeContact() {
  if (settings.homeContactId) {
    var picked = memberById(settings.homeContactId);
    if (picked && !isGroupContact(picked)) return picked;
  }
  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  return singles[0] || contacts[0] || null;
}

// ---------- 消息 ----------
function newId() { return Date.now() * 100 + Math.floor(Math.random() * 100); }

function addMessage(msg, opts) {
  opts = opts || {};
  var cid = msg.contactId || activeContactId;
  if (!messagesByContact[cid]) messagesByContact[cid] = [];
  messagesByContact[cid].push(msg);

  // 更新会话列表元数据
  var contact = contacts.find(function (c) { return c.id === cid; });
  if (contact) {
    contact.lastTime = msg.timestamp;
    if (msg.sender === 'partner' && cid !== activeContactId && !opts.silent) {
      contact.unread = (contact.unread || 0) + 1;
      if (typeof renderContactList === 'function') renderContactList();
      if (typeof updateNavBadge === 'function') updateNavBadge();
    }
  }

  saveData();

  // 仅当消息属于当前聊天时渲染
  if (cid === activeContactId && typeof renderNewMessage === 'function') {
    renderNewMessage(msg);
    scrollToBottomIfNear();
  }

  return msg;
}

// ---------- 渲染（微信式） ----------
function _envelopeSVG() {
  return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7.5l9 6 9-6"/></svg>';
}

// 红包消息卡片
function _redpacketCardHTML(msg) {
  var greeting = (msg && msg.text) ? String(msg.text) : '恭喜发财，大吉大利';
  var amount = '¥' + Number((msg && msg.amount) || 0).toFixed(2);
  var time = formatTimeHM(msg && msg.timestamp);
  var opened = !!(msg && msg.opened);
  var status = opened
    ? '<span class="redpacket-card-check"><i class="fas fa-check"></i></span>已领取'
    : '<span class="redpacket-card-check empty"><i class="fas fa-clock"></i></span>待领取';
  return '<div class="redpacket-card" data-id="' + msg.id + '">'
    + '<div class="redpacket-card-main">'
    +   '<span class="redpacket-card-env">' + _envelopeSVG() + '</span>'
    +   '<span class="redpacket-card-title">红包</span>'
    +   '<div class="redpacket-card-amount">' + escapeHtml(amount) + '</div>'
    +   '<div class="redpacket-card-greeting">' + escapeHtml(greeting) + '</div>'
    + '</div>'
    + '<div class="redpacket-card-foot">'
    +   '<span class="redpacket-card-status">' + status + '</span>'
    +   '<span class="redpacket-card-time">' + escapeHtml(time) + '</span>'
    + '</div>'
    + '</div>';
}

// 问问你问题/回答卡片
function _questionCardHTML(msg) {
  var q = escapeHtml(msg.question || msg.text || '');
  var opts = Array.isArray(msg.options) ? msg.options : [];
  var answered = Array.isArray(msg.answer) && msg.answer.length > 0;
  var modeTag = (msg.choiceMode === 'multiple')
    ? '<span class="question-mode-tag">多选</span>'
    : '<span class="question-mode-tag">单选</span>';
  var icon = answered ? '<i class="fas fa-envelope-open-text"></i>' : '<i class="fas fa-seedling"></i>';
  var marks = ['A','B','C','D','E','F','G','H','I','J'];
  var isIdxAnswer = answered && msg.answer.every(function (a) {
    var n = (typeof a === 'number') ? a : (typeof a === 'string' && a.trim() !== '' ? Number(a) : NaN);
    return Number.isInteger(n) && n >= 0 && n < opts.length;
  });
  var optsHtml = '';
  for (var i = 0; i < opts.length; i++) {
    var label = marks[i] || (i + 1);
    var v = escapeHtml(opts[i]);
    var cls = 'question-option';
    var check = '';
    if (answered) {
      var chosen = isIdxAnswer ? (msg.answer.indexOf(i) > -1) : (msg.answer.indexOf(opts[i]) > -1);
      if (chosen) { cls += ' chosen'; check = '<span class="question-opt-check"><i class="fas fa-check"></i></span>'; }
    }
    optsHtml += '<div class="' + cls + '"><span class="question-opt-tag">' + label + '</span><span class="question-opt-text">' + v + '</span>' + check + '</div>';
  }
  var answerLine = '';
  if (answered) {
    var shown = isIdxAnswer
      ? msg.answer.map(function (idx) { return opts[idx] != null ? String(opts[idx]) : ''; }).join('、')
      : msg.answer.map(function (a) { return String(a); }).join('、');
    answerLine = '<div class="question-answer-line"><span class="question-answer-label">TA 的选择</span><span class="question-answer-val">' + escapeHtml(shown) + '</span></div>';
  }
  return '<div class="question-card' + (answered ? ' question-card-answer' : '') + '" data-id="' + msg.id + '">'
    + '<div class="question-card-q"><span class="question-card-icon">' + icon + '</span><span class="question-card-text">' + q + '</span>' + modeTag + '</div>'
    + '<div class="question-card-sep"></div>'
    + '<div class="question-card-options">' + optsHtml + '</div>'
    + answerLine
    + '</div>';
}

function buildMsgRow(msg) {
  var row = document.createElement('div');
  var contact = getActiveContact();

  if (msg.type === 'call') {
    var callRow = document.createElement('div');
    callRow.className = 'msg-row system call-row';
    callRow.dataset.id = msg.id;
    callRow.innerHTML = '<div class="call-chip">' +
      '<i class="fas ' + escapeHtml(msg.icon || 'fa-video') + '"></i>' +
      '<span>' + escapeHtml(msg.text || '') + '</span>' +
      (msg.detail ? '<em>' + escapeHtml(msg.detail) + '</em>' : '') +
      '</div>';
    return callRow;
  }

  if (msg.type === 'system') {
    row.className = 'msg-row system';
    row.innerHTML = '<div class="sys-text">' + escapeHtml(msg.text) + '</div>';
    return row;
  }

  var isUser = msg.sender === 'user';
  row.className = 'msg-row ' + (isUser ? 'user' : 'partner') + (msg.recalled ? ' recalled' : '')
    + (msg.type === 'redpacket' ? ' rp-row' : (msg.type === 'question' ? ' question-row' : ''));
  row.dataset.id = msg.id;

  // 群聊中伙伴消息带发送者（头像 + 昵称行，微信群样式）
  var senderContact = isUser ? null
    : (msg.senderId ? memberById(msg.senderId) : contact);
  if (!isUser && msg.senderId && !senderContact) senderContact = contact;

  // 头像展示：总开关 + 每条消息开关（关闭时仅首条显示，微信式）
  var showAvatar = settings.showChatAvatar !== false;
  if (showAvatar && !settings.showEveryAvatar) {
    var list = activeMessages();
    var idx = list.indexOf(msg);
    if (idx > 0) {
      var prev = list[idx - 1];
      if (prev && prev.sender === msg.sender && prev.senderId === msg.senderId) showAvatar = false;
    }
  }
  var avatarHtml_ = showAvatar
    ? (isUser
        ? '<div class="msg-avatar">🙂</div>'
        : '<div class="msg-avatar">' + avatarHtml((senderContact && senderContact.avatar) || '🌷') + '</div>')
    : '<div class="msg-avatar msg-avatar-hidden"></div>';

  var nameLine = (!isUser && (isGroupContact(contact) || settings.showPartnerName))
    ? '<div class="msg-name">' + escapeHtml((senderContact && senderContact.name) || '梦角') + '</div>'
    : '';

  var body;
  if (msg.recalled) {
    body = '<div class="bubble">' + (isUser ? '你撤回了一条消息' : '对方撤回了一条消息') + '</div>';
  } else {
    var inner = '';
    if (msg.replyTo) {
      inner += '<div class="quote-box">' + escapeHtml(msg.replyTo.text) + '</div>';
    }
    if (msg.type === 'redpacket') {
      inner += _redpacketCardHTML(msg);
    } else if (msg.type === 'question') {
      inner += _questionCardHTML(msg);
    } else if (msg.image) {
      inner += '<img class="chat-img" src="' + msg.image + '" alt="">';
    } else if (msg.voice) {
      inner += voiceHtml(msg);
    } else {
      inner += escapeHtml(msg.text);
    }
    var bubbleCls = 'bubble';
    if (msg.type === 'redpacket') bubbleCls += ' rp-card-bubble';
    else if (msg.type === 'question') bubbleCls += ' question-bubble';
    else {
      // 兼容别名：外面抄来的 / AI 生成的 CSS 常用 .message-sent / .message-received
      // 指代"我发的""对方发的"，而本项目的叫法是 .msg-row.user / .msg-row.partner。
      // 把别名挂在气泡元素上，那类 CSS 就能原样贴进「自定义 CSS」里用，
      // 连 ::before / ::after 装饰（.message-sent::after 之类）也能对上。
      // 只给文字气泡加——红包 / 问问你 是透明卡片容器，套上渐变边框会直接坏掉。
      bubbleCls += isUser ? ' message-sent' : ' message-received';
    }
    body = '<div class="' + bubbleCls + '">' + inner + '</div>';
  }

  var favMark = msg.favorited ? '<span class="fav-mark"><i class="fas fa-heart"></i></span>' : '';
  var readMark = '';
  if (isUser && settings.readReceiptEnabled) {
    if (settings.readReceiptStyle === 'text') {
      readMark = '<span class="read-mark">' + (msg.status === 'read' ? '已读' : '已发送') + '</span>';
    } else {
      readMark = '<span class="read-mark read-ico">' + (msg.status === 'read' ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>') + '</span>';
    }
  }

  row.innerHTML = avatarHtml_ +
    '<div class="bubble-wrap">' + nameLine + body +
      '<div class="msg-meta">' + favMark +
        '<span class="ts">' + formatTimeHM(msg.timestamp) + '</span>' + readMark +
      '</div>' +
    '</div>';

  // 点击气泡 → 操作菜单（红包点击拆开；问问你卡片进操作菜单便于删除）
  var bubble = row.querySelector('.bubble');
  if (bubble) {
    bubble.addEventListener('click', function (e) {
      if (msg.type === 'redpacket' && !msg.recalled) {
        e.stopPropagation();
        if (window.TransferFeature && typeof window.TransferFeature.openRedpacket === 'function') {
          window.TransferFeature.openRedpacket(msg.id);
        }
        return;
      }
      openActionSheet(msg);
    });
  }
  // 图片点击放大
  var img = row.querySelector('.chat-img');
  if (img) {
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      openImageViewer(msg.image);
    });
  }
  // 语音条点击播放
  var vbar = row.querySelector('.voice-bar');
  if (vbar) {
    vbar.addEventListener('click', function (e) {
      e.stopPropagation();
      playVoiceMsg(vbar);
    });
  }
  // 双击梦角头像 → 我的拍一拍（拍的是这条消息的发送者，群里即那一位成员）
  if (!isUser && msg.sender === 'partner') {
    var ava = row.querySelector('.msg-avatar');
    if (ava) ava.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      openMyPokePicker(msg.senderId || null);
    });
  }
  return row;
}

function renderNewMessage(msg) {
  var stream = DOMElements.chatStream;
  if (!stream) return;
  var list = activeMessages();
  var prev = list[list.length - 2];
  if (!prev || !sameDay(prev.timestamp, msg.timestamp)) {
    var divider = document.createElement('div');
    divider.className = 'day-divider';
    divider.innerHTML = '<span>' + escapeHtml(formatDayLabel(msg.timestamp)) + '</span>';
    stream.appendChild(divider);
  }
  // 移除空状态
  var empty = stream.querySelector('.empty-state');
  if (empty) empty.remove();
  stream.appendChild(buildMsgRow(msg));
}

function renderAllMessages() {
  var stream = DOMElements.chatStream;
  if (!stream) return;
  stream.innerHTML = '';
  var list = activeMessages();
  if (list.length === 0) {
    stream.innerHTML =
      '<div class="empty-state">' +
        '<div class="es-icon"><i class="fas fa-envelope"></i></div>' +
        '<div class="es-title">和对方还没有消息</div>' +
        '<div class="es-desc">发出第一张字卡吧</div>' +
      '</div>';
    return;
  }
  list.forEach(function (msg, i) {
    if (i === 0 || !sameDay(list[i - 1].timestamp, msg.timestamp)) {
      var divider = document.createElement('div');
      divider.className = 'day-divider';
      divider.innerHTML = '<span>' + escapeHtml(formatDayLabel(msg.timestamp)) + '</span>';
      stream.appendChild(divider);
    }
    stream.appendChild(buildMsgRow(msg));
  });
  scrollToBottomIfNear(true);
}

function scrollToBottomIfNear(force) {
  var stream = DOMElements.chatStream;
  if (!stream) return;
  var near = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 180;
  if (force || near) {
    requestAnimationFrame(function () { stream.scrollTop = stream.scrollHeight; });
  }
}

function updateReadMarksDOM() {
  var stream = DOMElements.chatStream;
  if (!stream) return;
  var rows = stream.querySelectorAll('.msg-row.user');
  rows.forEach(function (row) {
    var id = Number(row.dataset.id);
    var msg = activeMessages().find(function (m) { return m.id === id; });
    var el = row.querySelector('.read-mark');
    if (msg && el) {
      if (settings.readReceiptStyle === 'text') {
        el.classList.remove('read-ico');
        el.textContent = msg.status === 'read' ? '已读' : '已发送';
      } else {
        el.classList.add('read-ico');
        el.innerHTML = msg.status === 'read' ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>';
      }
    }
  });
}

// ---------- 发送（含斜杠指令，对齐 chat） ----------
function sendMessage(textOverride, type) {
  type = type || 'normal';
  var text = textOverride || DOMElements.messageInput.value.trim();
  if (!text && type === 'normal') return;

  // 斜杠指令（chat 同款）
  if (text && text.startsWith('/') && type === 'normal') {
    var cmd = text.replace(/\s+/g, '').toLowerCase();
    if (cmd === '/测试拍一拍' || cmd === '/testpoke') {
      DOMElements.messageInput.value = '';
      triggerPartnerPoke();
      return;
    }
    if (cmd === '/测试状态更新' || cmd === '/teststatus') {
      DOMElements.messageInput.value = '';
      changePartnerStatus();
      return;
    }
    if (cmd === '/测试撤回' || cmd === '/testrecall') {
      DOMElements.messageInput.value = '';
      triggerPartnerRecall();
      return;
    }
  }

  DOMElements.messageInput.value = '';
  DOMElements.messageInput.style.height = 'auto';

  // 表情混入消息：概率追加一个表情（与文字同条发送，chat 节奏同款）
  if (type === 'normal' && text && settings.emojiMixEnabled && Math.random() < 0.2) {
    text += ' ' + EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }

  var msg = {
    id: newId(),
    contactId: activeContactId,
    sender: type === 'system' ? null : 'user',
    text: text || '',
    image: null,
    voice: null,
    timestamp: Date.now(),
    status: 'sent',
    favorited: false,
    recalled: false,
    replyTo: (currentReplyTo && settings.quoteReplyEnabled !== false)
      ? { text: currentReplyTo.text, sender: currentReplyTo.sender } : null,
    type: type
  };

  currentReplyTo = null;
  if (typeof hideReplyPreview === 'function') hideReplyPreview();

  addMessage(msg);

  if (type === 'normal') {
    playSound('my_send');
    triggerDelayedReply(true);
    if (typeof toggleBatchMode === 'function' && isBatchMode) {
      // 批量模式下不清空逻辑已由 addToBatch 处理
    }
  }
}

// ---------- 延迟回复引擎（对齐 chat 的 _triggerDelayedReply / simulateReply） ----------
function triggerDelayedReply(isUserMessage) {
  if (!settings.replyEnabled) return false;

  // 已读回执：1.5~4s 后用户消息标为已读
  if (isUserMessage && settings.readReceiptEnabled) {
    setTimeout(function () {
      var changed = false;
      activeMessages().forEach(function (m) {
        if (m.sender === 'user' && m.status !== 'read') { m.status = 'read'; changed = true; }
      });
      if (changed) updateReadMarksDOM();
    }, randomBetween(1500, 4000));
  }

  // 已读不回
  if (isUserMessage && Math.random() < (Number(settings.readNoReplyChance) || 0)) return false;

  queueReply(function () { simulateReply(); });
  return true;
}
window._triggerDelayedReply = triggerDelayedReply;  // 保留 chat 同名接口

function queueReply(fn) {
  replyQueue.push(fn);
  if (!isReplying) drainReplyQueue();
}

function drainReplyQueue() {
  if (replyQueue.length === 0) { isReplying = false; return; }
  isReplying = true;
  var fn = replyQueue.shift();
  fn();
}

window.simulateReply = function () {
  // 防抖锁 2s（chat 同款）
  var now = Date.now();
  if (window._simulateReplyLockUntil && now < window._simulateReplyLockUntil) {
    drainReplyQueue(); return;
  }
  window._simulateReplyLockUntil = now + 2000;

  var contact = getActiveContact();
  var group = isGroupContact(contact) ? contact : null;
  var memberIds = group ? getGroupMemberIds(group) : [];

  // 候选池：单聊=当前梦角（基础+专属）；群聊=各位成员
  // 语音条也能撑起一次回复，所以"有没有内容"要把语音算进去，
  // 否则只配了语音条、没配字卡的梦角会被这里直接挡掉。
  var candidates = group ? memberIds : [activeContactId];
  var anyPool = candidates.some(function (id) {
    return poolFor(id).length > 0 || voiceFor(id).length > 0;
  });
  if (!anyPool) {
    toast('字卡库和语音条都是空的，请到设置中添加');
    drainReplyQueue(); return;
  }
  if (group && memberIds.length === 0) { drainReplyQueue(); return; }

  // 梦角撤回：3% 概率（chat 同款）
  if (settings.partnerRecallEnabled && Math.random() < 0.03) {
    triggerPartnerRecall();
    drainReplyQueue(); return;
  }
  // 拍一拍：3% 概率（群聊由随机成员拍）
  if (settings.pokeEnabled && (pokesFor(activeContactId, 'partner').length || partnerPokes.length) && Math.random() < 0.03) {
    triggerPartnerPoke();
    drainReplyQueue(); return;
  }
  // 状态变化：chat 的回复链里没有这一项（kismet 独有），保持默认关闭
  // 梦角主动发红包：chat 是"定时 20~50 分钟检查、8% 概率、每自然日上限 10 次"，
  // 不是"每次回复 2%"。这里改为定时调度，金额分布同样照抄 chat 的四档。
  var replyCount = Math.random() < 0.75 ? 1 : (Math.random() < 0.95 ? 2 : 3);

  var totalDelay = 0;
  for (var i = 0; i < replyCount; i++) {
    totalDelay += Math.round(randomBetween(settings.replyDelayMin, settings.replyDelayMax));
    var senderId = group ? randomOf(memberIds) : null;
    (function (index, delay, sId) {
      var target = sId || activeContactId;

      // 本条是否改发语音条（照搬 chat）：
      // 语音池非空，且（这条没有文字字卡可用 → 必发语音，或 35% 概率改发语音）
      var vPool = voiceFor(target);
      var textAvail = poolFor(target).length > 0;
      var slotIsVoice = vPool.length > 0 && (!textAvail || Math.random() < 0.35);
      var slotVoice = slotIsVoice ? randomOf(vPool) : null;

      // 表情包：20% 概率，作为独立一条消息跟在正文后面（照搬 chat）
      var sPool = stickersFor(target);
      var slotSticker = (sPool.length > 0 && Math.random() < 0.2) ? randomOf(sPool) : null;

      setTimeout(function () {
        // 微信式正在输入：每次回复前显示（群聊显示该成员头像）
        if (index === 0) showTyping(sId ? memberById(sId) : null);
        setTimeout(function () {
          hideTyping();
          if (slotVoice) {
            deliverPartnerVoice(slotVoice, sId);
          } else {
            var text = pickReply(target);
            if (text) deliverPartnerMsg(text, sId);
          }
          if (slotSticker) {
            // 400~1000ms 后补一条纯图片消息
            setTimeout(function () {
              deliverPartnerSticker(slotSticker, sId);
            }, Math.round(randomBetween(400, 1000)));
          }
          if (index === replyCount - 1) drainReplyQueue();
        }, Math.round(randomBetween(900, 2200)));
      }, delay);
    })(i, totalDelay, senderId);
  }
};

function randomOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 投递梦角消息（含音效 + 后台通知）
function deliverPartnerMsg(text, senderId, opts) {
  if (!text) return;
  opts = opts || {};
  var msg = {
    id: newId(),
    contactId: activeContactId,
    sender: 'partner',
    senderId: senderId || null,
    text: text,
    image: null,
    voice: null,
    timestamp: Date.now(),
    status: 'read',
    favorited: false,
    recalled: false,
    replyTo: null,
    type: opts.type || 'normal'
  };
  addMessage(msg);
  if (opts.type !== 'redpacket') playSound('partner_message');
  notifyBackground(msg);
}

// 投递语音条消息。消息里只存 audioId（指向 IndexedDB 里的音频），
// 不存音频本体，否则 localStorage 5MB 会被音频迅速撑爆。
function deliverPartnerVoice(vItem, senderId) {
  if (!vItem) return;
  var msg = {
    id: newId(),
    contactId: activeContactId,
    sender: 'partner',
    senderId: senderId || null,
    text: '',
    image: null,
    voice: {
      audioId: vItem.audioId || '',
      duration: Number(vItem.duration) || 0,
      text: vItem.text || ''
    },
    timestamp: Date.now(),
    status: 'read',
    favorited: false,
    recalled: false,
    replyTo: null,
    type: 'normal'
  };
  addMessage(msg);
  playSound('partner_message');
  notifyBackground({ sender: 'partner', text: '[语音]' });
}

// 投递表情包消息（就是一条普通图片消息）
function deliverPartnerSticker(sticker, senderId) {
  if (!sticker) return;
  var msg = {
    id: newId(),
    contactId: activeContactId,
    sender: 'partner',
    senderId: senderId || null,
    text: '',
    image: sticker.url || sticker.dataUrl || '',
    voice: null,
    timestamp: Date.now(),
    status: 'read',
    favorited: false,
    recalled: false,
    replyTo: null,
    type: 'normal'
  };
  addMessage(msg);
  playSound('message');
  notifyBackground({ sender: 'partner', text: '[表情]' });
}

// ---------- 语音条：渲染 + 播放 ----------
var _voiceAudio = null;      // 当前正在播放的 <audio>
var _voiceUrls = {};         // audioId -> objectURL 缓存

function voiceHtml(msg) {
  var v = msg.voice;
  // 旧消息：voice 就是个时长字符串，没有音频
  if (typeof v === 'string') {
    return '<span class="voice-dot"><i class="fas fa-microphone"></i></span><span>' + escapeHtml(v) + '"</span>';
  }
  if (!v) return '';
  return '<div class="voice-msg" data-voice-id="' + escapeHtml(v.audioId || '') + '">' +
      '<div class="voice-bar" role="button">' +
        '<i class="fas fa-volume-up"></i>' +
        '<span class="voice-dur">' + (v.duration ? escapeHtml(String(v.duration)) + '"' : '语音') + '</span>' +
        '<div class="voice-prog"></div>' +
      '</div>' +
      (v.text ? '<div class="voice-text">' + escapeHtml(v.text) + '</div>' : '') +
    '</div>';
}

function playVoiceMsg(el) {
  var wrap = el.closest ? el.closest('.voice-msg') : null;
  if (!wrap) return;
  var audioId = wrap.getAttribute('data-voice-id');
  if (!audioId || typeof AudioStore === 'undefined') { toast('这条语音没有音频文件'); return; }

  if (_voiceAudio) {
    var same = _voiceAudio.getAttribute('data-audio-id') === audioId;
    _voiceAudio.pause();
    if (same) { resetVoiceBars(); return; }
    _voiceAudio = null;
  }
  resetVoiceBars();

  function attach(blob) {
    if (!blob) { toast('语音文件已丢失'); return; }
    if (!_voiceUrls[audioId]) _voiceUrls[audioId] = URL.createObjectURL(blob);
    var a = new Audio(_voiceUrls[audioId]);
    a.setAttribute('data-audio-id', audioId);
    a.addEventListener('ended', function () { resetVoiceBars(); _voiceAudio = null; });
    a.addEventListener('timeupdate', function () {
      if (!a.duration) return;
      var bar = wrap.querySelector('.voice-bar');
      var prog = bar && bar.querySelector('.voice-prog');
      if (prog) prog.style.width = (a.currentTime / a.duration * 100) + '%';
    });
    a.play().then(function () {
      _voiceAudio = a;
      wrap.classList.add('playing');
    }).catch(function () { toast('播放失败'); });
  }
  if (_voiceUrls[audioId]) { attach(null); } else {
    AudioStore.get(audioId).then(attach).catch(function () { toast('读取语音失败'); });
  }
}

function resetVoiceBars() {
  var stream = DOMElements.chatStream;
  if (!stream) return;
  Array.prototype.forEach.call(stream.querySelectorAll('.voice-msg.playing'), function (n) {
    n.classList.remove('playing');
    var p = n.querySelector('.voice-prog');
    if (p) p.style.width = '0%';
  });
}

// 后台消息推送（Notification，chat 后台推送同用途）
function notifyBackground(msg) {
  if (!settings.bgNotifyEnabled) return;
  if (typeof document !== 'undefined' && !document.hidden) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    var c = contacts.find(function (x) { return x.id === msg.contactId; });
    new Notification(c ? c.name : '字卡传讯', {
      body: msg.type === 'redpacket' ? '🧧 收到一个红包' : (msg.text || '[图片]')
    });
  } catch (e) {}
}

// 选回复：从双层池（基础+专属）随机（chat 自定义回复逻辑）
// poolContactId：单聊=当前梦角 id；群聊=随机到的成员 id
function pickReply(poolContactId) {
  var cid = poolContactId || activeContactId;

  var pool = poolFor(cid);
  if (!pool.length) return '';
  var text = randomOf(pool);

  // 回复拼接字卡：概率把多张字卡拼成一条（最多"最多拼接"句）
  if (settings.combineCardsEnabled && pool.length && Math.random() < 0.35) {
    var max = Math.max(1, Math.min(5, Number(settings.combineCardsMax) || 3));
    var n = 2 + Math.floor(Math.random() * Math.max(1, max - 1)); // 2..max
    var parts = [text];
    for (var p = 1; p < n; p++) parts.push(randomOf(pool));
    text = parts.join(' ');
  }

  // 表情混入消息：概率与文字同条发送
  if (settings.emojiMixEnabled && text && Math.random() < 0.2) {
    text += ' ' + EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }
  return text;
}

// ---------- 梦角主动发红包（对齐 chat transfer.js 的调度规则） ----------
// chat：每 20~50 分钟检查一次 → 8% 概率触发 → 每自然日上限 10 次 → 金额四档随机
// 这里登记为"每位梦角各自独立"的活动：每位梦角有自己的排期和自己的每日计数。
var RP_LIMIT_PER_DAY = 10;
var _rpCounters = {};            // { contactId: { date: 'YYYY-M-D', count: n } }

function _rpToday() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function _rpCountToday(contactId) {
  var rec = _rpCounters[contactId];
  return (rec && rec.date === _rpToday()) ? rec.count : 0;
}
function _rpBumpToday(contactId) {
  var cur = _rpCountToday(contactId);
  _rpCounters[contactId] = { date: _rpToday(), count: cur + 1 };
}

// 金额四档（与 chat _randomAmount 完全一致）
function _rpRandomAmount() {
  var x = Math.random(), amt;
  if (x < 0.40) amt = 0.5 + Math.random() * 9.5;            // 0.50~9.99
  else if (x < 0.75) amt = 5 + Math.random() * 995;         // 5~1000
  else if (x < 0.91) amt = 50 + Math.random() * 1950;       // 50~2000
  else amt = 2000 + Math.random() * 18000;                  // 2000~20000
  return Math.round(amt * 100) / 100;
}

registerPartnerActivity({
  key: 'redpacket',
  nextAt: function () { return Date.now() + (20 + Math.random() * 30) * 60000; },  // 20~50 分钟
  chance: function () { return 8; },
  enabled: function () { return settings.redPacketEnabled; },
  run: function (c) {
    if (_rpCountToday(c.id) >= RP_LIMIT_PER_DAY) return;    // 该梦角今日已满
    _rpBumpToday(c.id);
    var amt = _rpRandomAmount();
    setTimeout(function () {
      addMessage({
        id: newId(), contactId: c.id, sender: 'partner', senderId: null,
        text: '恭喜发财，大吉大利', image: null, voice: null,
        timestamp: Date.now(), status: 'read', favorited: false,
        recalled: false, replyTo: null, type: 'redpacket', amount: amt
      });
      notifyBackground({ contactId: c.id, type: 'redpacket', text: '🧧 收到一个红包' });
    }, 900);                                                // chat 里也是延后 900ms 再投递
  }
});

// ---------- 对方拍一拍 / 撤回 / 状态（chat 同款事件） ----------
// TA的拍一拍：梦角拍用户。动作取「基础 + 该梦角专属」两级合并
function triggerPartnerPoke(pokeContactId) {
  var contact = getActiveContact();
  var group = isGroupContact(contact) ? contact : null;
  var member = group ? memberById(pokeContactId || randomOf(getGroupMemberIds(group))) : contact;
  if (!member) return;
  var pool = pokesFor(member.id, 'partner');
  if (!pool.length) return;
  var action = randomOf(pool);
  var msg = {
    id: newId(), contactId: activeContactId, sender: 'system',
    senderId: group ? member.id : null,
    text: member.name + ' ' + action,
    timestamp: Date.now(), status: 'read', favorited: false, recalled: false,
    replyTo: null, type: 'system'
  };
  addMessage(msg);
  playSound('partner_poke');
}

function triggerPartnerRecall() {
  var list = activeMessages();
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].sender === 'partner' && !list[i].recalled && list[i].type === 'normal') {
      list[i].recalled = true;
      saveData();
      if (activeContactId) renderAllMessages();
      return;
    }
  }
  // 没有可撤回的对方消息 → 改为撤回你最近一条
  for (var j = list.length - 1; j >= 0; j--) {
    if (list[j].sender === 'user' && !list[j].recalled) {
      list[j].recalled = true;
      saveData();
      if (activeContactId) renderAllMessages();
      return;
    }
  }
}

function changePartnerStatus() {
  var next = partnerStatus;
  while (next === partnerStatus) {
    next = PARTNER_STATUSES[Math.floor(Math.random() * PARTNER_STATUSES.length)];
  }
  partnerStatus = next;
  if (DOMElements.chatHeadStatus && activeContactId) {
    DOMElements.chatHeadStatus.textContent = next;
  }
}

// ---------- 正在输入（微信式：聊天页标题栏副标题显示，不插气泡） ----------
var _typingSavedStatus = null;   // 显示期间的副标题原文（null=未显示中）
function showTyping(memberContact) {
  if (!settings.typingIndicatorEnabled) return;
  if (_typingSavedStatus !== null) return;   // 已在显示中
  var el = DOMElements.chatHeadStatus;
  if (!el) return;
  _typingSavedStatus = el.textContent || '';
  el.textContent = settings.typingText || '对方正在输入…';
}

function hideTyping() {
  if (_typingSavedStatus === null) return;   // 没有保存值 → 保持不动
  var el = DOMElements.chatHeadStatus;
  if (el) el.textContent = _typingSavedStatus;
  _typingSavedStatus = null;
}

// ---------- 主动发送（chat 节奏：开启后梦角按间隔主动找你） ----------
var _autoSendTimer = null;

function startAutoSend() {
  if (_autoSendTimer) { clearInterval(_autoSendTimer); _autoSendTimer = null; }
  if (!settings.autoSendEnabled) return;
  var minutes = Math.max(1, Math.min(180, Number(settings.autoSendInterval) || 5));
  _autoSendTimer = setInterval(runAutoSend, minutes * 60000);
}
window.startAutoSend = startAutoSend;

function runAutoSend() {
  if (!settings.replyEnabled) return;
  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  if (!singles.length) return;
  var c = randomOf(singles);
  var pool = poolFor(c.id);
  if (!pool.length) return;

  var sendOne = function () {
    var text = randomOf(pool);
    if (settings.emojiMixEnabled && Math.random() < 0.25) {
      text += ' ' + EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    }
    var msg = {
      id: newId(),
      contactId: c.id,
      sender: 'partner',
      senderId: c.id,
      text: text,
      image: null,
      voice: null,
      timestamp: Date.now(),
      status: 'read',
      favorited: false,
      recalled: false,
      replyTo: null,
      type: 'normal'
    };
    // addMessage 自动处理：正在看该会话 → 渲染；否则 → 未读角标
    addMessage(msg);
    playSound('partner_message');
    notifyBackground(msg);
  };
  sendOne();
  // 15% 概率连发第二条（chat 主动发送的"发送条数"）
  if (Math.random() < 0.15) setTimeout(sendOne, randomBetween(1200, 3000));
}
