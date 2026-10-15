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
  var avatarHtml = showAvatar
    ? (isUser
        ? '<div class="msg-avatar">🙂</div>'
        : '<div class="msg-avatar">' + escapeHtml((senderContact && senderContact.avatar) || '🌷') + '</div>')
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
      inner += '<span class="voice-dot"><i class="fas fa-microphone"></i></span><span>' + msg.voice + '"</span>';
    } else {
      inner += escapeHtml(msg.text);
    }
    var bubbleCls = 'bubble';
    if (msg.type === 'redpacket') bubbleCls += ' rp-card-bubble';
    else if (msg.type === 'question') bubbleCls += ' question-bubble';
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

  row.innerHTML = avatarHtml +
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
  if (type === 'normal' && text && settings.emojiMixEnabled && Math.random() < 0.25) {
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
  var candidates = group ? memberIds : [activeContactId];
  var anyPool = candidates.some(function (id) { return poolFor(id).length > 0; });
  if (!anyPool) {
    toast('字卡库为空，请到设置中添加');
    drainReplyQueue(); return;
  }
  if (group && memberIds.length === 0) { drainReplyQueue(); return; }

  // 梦角撤回：3% 概率（chat 同款）
  if (settings.partnerRecallEnabled && Math.random() < 0.03) {
    triggerPartnerRecall();
    drainReplyQueue(); return;
  }
  // 拍一拍：3% 概率（群聊由随机成员拍）
  if (settings.pokeEnabled && customPokes.length && Math.random() < 0.03) {
    triggerPartnerPoke();
    drainReplyQueue(); return;
  }
  // 状态变化：5% 概率（chat 同款；群聊无状态，跳过）
  if (!group && settings.statusChangeEnabled && Math.random() < 0.05) {
    changePartnerStatus();
  }
  // 梦角主动发红包：2% 概率（功能开启时）
  if (settings.redPacketEnabled && Math.random() < 0.02) {
    deliverPartnerMsg('给你发了个红包', group ? randomOf(memberIds) : null, { type: 'redpacket' });
    drainReplyQueue(); return;
  }

  // 回复条数：75% 一条，22% 两条，3% 三条（chat 同款）
  var roll = Math.random();
  var replyCount = roll < 0.75 ? 1 : (roll < 0.97 ? 2 : 3);

  var totalDelay = 0;
  for (var i = 0; i < replyCount; i++) {
    totalDelay += Math.round(randomBetween(settings.replyDelayMin, settings.replyDelayMax));
    var senderId = group ? randomOf(memberIds) : null;
    (function (index, delay, sId) {
      setTimeout(function () {
        // 微信式正在输入：每次回复前显示（群聊显示该成员头像）
        if (index === 0) showTyping(sId ? memberById(sId) : null);
        setTimeout(function () {
          hideTyping();
          var text = pickReply(sId || activeContactId);
          if (text) deliverPartnerMsg(text, sId);
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
  if (settings.emojiMixEnabled && text && Math.random() < 0.25) {
    text += ' ' + EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }
  return text;
}

// ---------- 对方拍一拍 / 撤回 / 状态（chat 同款事件） ----------
function triggerPartnerPoke() {
  if (!customPokes.length) return;
  var action = customPokes[Math.floor(Math.random() * customPokes.length)];
  var contact = getActiveContact();
  var group = isGroupContact(contact) ? contact : null;
  var member = group ? memberById(randomOf(getGroupMemberIds(group))) : contact;
  if (!member) return;
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
