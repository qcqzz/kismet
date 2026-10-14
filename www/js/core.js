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
  var h = d.getHours(), m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function formatDayLabel(ts) {
  var d = new Date(ts), now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diff = (today - day) / 86400000;
  if (diff === 0) return '今天 ' + formatTimeHM(ts);
  if (diff === 1) return '昨天 ' + formatTimeHM(ts);
  if (diff < 7) return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()] + ' ' + formatTimeHM(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + formatTimeHM(ts);
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
      if (typeof updateDeskBadge === 'function') updateDeskBadge();
    }
  }

  saveData();

  // 仅当消息属于当前聊天时渲染
  if (cid === activeContactId && typeof renderNewMessage === 'function') {
    renderNewMessage(msg);
    scrollToBottomIfNear();
  }
}

// ---------- 渲染（微信式） ----------
function buildMsgRow(msg) {
  var row = document.createElement('div');
  var contact = getActiveContact();

  if (msg.type === 'system') {
    row.className = 'msg-row system';
    row.innerHTML = '<div class="sys-text">' + escapeHtml(msg.text) + '</div>';
    return row;
  }

  var isUser = msg.sender === 'user';
  row.className = 'msg-row ' + (isUser ? 'user' : 'partner') + (msg.recalled ? ' recalled' : '');
  row.dataset.id = msg.id;

  var avatarHtml = isUser
    ? '<div class="msg-avatar">🙂</div>'
    : '<div class="msg-avatar">' + (contact.avatar || '🌷') + '</div>';

  var body;
  if (msg.recalled) {
    body = '<div class="bubble">' + (isUser ? '你撤回了一条消息' : '对方撤回了一条消息') + '</div>';
  } else {
    var inner = '';
    if (msg.replyTo) {
      inner += '<div class="quote-box">' + escapeHtml(msg.replyTo.text) + '</div>';
    }
    if (msg.image) {
      inner += '<img class="chat-img" src="' + msg.image + '" alt="">';
    } else if (msg.voice) {
      inner += '<span class="voice-dot">🎙</span><span>' + msg.voice + '"</span>';
    } else {
      inner += escapeHtml(msg.text);
    }
    body = '<div class="bubble">' + inner + '</div>';
  }

  var favMark = msg.favorited ? '<span class="fav-mark">♥</span>' : '';
  var readMark = (isUser && settings.readReceiptEnabled)
    ? '<span>' + (msg.status === 'read' ? '已读' : '已发送') + '</span>' : '';

  row.innerHTML = avatarHtml +
    '<div class="bubble-wrap">' + body +
      '<div class="msg-meta">' + favMark +
        '<span>' + formatTimeHM(msg.timestamp) + '</span>' + readMark +
      '</div>' +
    '</div>';

  // 点击气泡 → 操作菜单（撤回的消息只提供删除）
  var bubble = row.querySelector('.bubble');
  if (bubble) {
    bubble.addEventListener('click', function () {
      if (msg.recalled) { openActionSheet(msg); return; }
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
        '<div class="es-icon">✉️</div>' +
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
    var spans = row.querySelectorAll('.msg-meta span');
    if (msg && spans.length) {
      var last = spans[spans.length - 1];
      if (last.textContent === '已读' || last.textContent === '已发送') {
        last.textContent = msg.status === 'read' ? '已读' : '已发送';
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
    replyTo: currentReplyTo ? { text: currentReplyTo.text, sender: currentReplyTo.sender } : null,
    type: type
  };

  currentReplyTo = null;
  if (typeof hideReplyPreview === 'function') hideReplyPreview();

  addMessage(msg);

  if (type === 'normal') {
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

  if (replyPool.length === 0) {
    toast('字卡库为空，请到设置中添加');
    drainReplyQueue(); return;
  }

  // 对方撤回：3% 概率（chat 同款）
  if (settings.partnerRecallEnabled && Math.random() < 0.03) {
    triggerPartnerRecall();
    drainReplyQueue(); return;
  }
  // 拍一拍：3% 概率（chat 同款）
  if (settings.pokeEnabled && Math.random() < 0.03) {
    triggerPartnerPoke();
    drainReplyQueue(); return;
  }
  // 状态变化：5% 概率（chat 同款）
  if (settings.statusChangeEnabled && Math.random() < 0.05) {
    changePartnerStatus();
  }

  // 回复条数：75% 一条，22% 两条，3% 三条（chat 同款）
  var roll = Math.random();
  var replyCount = roll < 0.75 ? 1 : (roll < 0.97 ? 2 : 3);

  var totalDelay = 0;
  for (var i = 0; i < replyCount; i++) {
    totalDelay += Math.round(randomBetween(settings.replyDelayMin, settings.replyDelayMax));
    (function (index, delay) {
      setTimeout(function () {
        // 微信式正在输入：每次回复前显示
        if (index === 0) showTyping();
        setTimeout(function () {
          hideTyping();
          var msg = {
            id: newId(),
            contactId: activeContactId,
            sender: 'partner',
            text: pickReply(),
            image: null,
            voice: null,
            timestamp: Date.now(),
            status: 'read',
            favorited: false,
            recalled: false,
            replyTo: null,
            type: 'normal'
          };
          addMessage(msg);
          if (index === replyCount - 1) drainReplyQueue();
        }, Math.round(randomBetween(900, 2200)));
      }, delay);
    })(i, totalDelay);
    totalDelay += 0;
  }
};

// 选回复：30% 命中关键词规则，否则随机池（chat 的自定义回复逻辑）
function pickReply() {
  var lastUserMsg = '';
  var list = activeMessages();
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].sender === 'user' && !list[i].recalled) { lastUserMsg = list[i].text || ''; break; }
  }
  if (Math.random() < 0.3 && lastUserMsg) {
    for (var j = 0; j < keywordRules.length; j++) {
      var rule = keywordRules[j];
      for (var k = 0; k < rule.keywords.length; k++) {
        if (lastUserMsg.indexOf(rule.keywords[k]) !== -1) {
          return rule.replies[Math.floor(Math.random() * rule.replies.length)];
        }
      }
    }
  }
  return replyPool[Math.floor(Math.random() * replyPool.length)];
}

// ---------- 对方拍一拍 / 撤回 / 状态（chat 同款事件） ----------
function triggerPartnerPoke() {
  var action = customPokes[Math.floor(Math.random() * customPokes.length)];
  var contact = getActiveContact();
  var msg = {
    id: newId(), contactId: activeContactId, sender: 'system',
    text: contact.name + ' ' + action,
    timestamp: Date.now(), status: 'read', favorited: false, recalled: false,
    replyTo: null, type: 'system'
  };
  addMessage(msg);
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

// ---------- 正在输入（微信式：流内气泡三黑点） ----------
function showTyping() {
  if (!settings.typingIndicatorEnabled) return;
  var stream = DOMElements.chatStream;
  if (!stream) return;
  if (stream.querySelector('.typing-row')) return;  // 已存在
  var contact = getActiveContact();
  var row = document.createElement('div');
  row.className = 'typing-row';
  row.id = 'typing-row';
  row.innerHTML =
    '<div class="msg-avatar">' + (contact.avatar || '🌷') + '</div>' +
    '<div class="typing-bubble"><i></i><i></i><i></i></div>';
  stream.appendChild(row);
  scrollToBottomIfNear(true);
}

function hideTyping() {
  var row = document.getElementById('typing-row');
  if (row) row.remove();
}
