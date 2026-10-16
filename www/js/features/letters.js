/* ============ 字卡传讯 · 信箱（参考 qcqzz/chat 的 envelope 接入） ============ */
/* 结构与规则照搬 chat：两个分页「寄出的 / 收到的」，
   写信后 30~60 分钟送达、10~24 小时回信，回信内容是随机拼 8~12 句字卡。

   与 chat 的两点差异（已确认）：
   1) chat 只有一个 partner，kismet 有多位梦角 —— 信箱按梦角各存一份，
      梦角主动来信也走 registerPartnerActivity，排期/冷却/概率按梦角完全独立。
   2) chat 写信时有个「同时发送到聊天」的勾选框，kismet 取消了这个功能。      */

// ---------- 数据 ----------
// { contactId: { outbox: [...], inbox: [...] } }
var envelopeData = {};
var _envSel = null;        // 当前查看的梦角
var _envTab = 'outbox';   // outbox | inbox
var _envComposing = null; // { contactId, refId, originalContent, isReply }
var _envViewing = null;   // { contactId, section, id }

function envelopeOf(contactId) {
  if (!contactId) return null;
  if (!envelopeData[contactId] || typeof envelopeData[contactId] !== 'object') {
    envelopeData[contactId] = { outbox: [], inbox: [] };
  }
  var d = envelopeData[contactId];
  if (!Array.isArray(d.outbox)) d.outbox = [];
  if (!Array.isArray(d.inbox)) d.inbox = [];
  return d;
}

// ---------- 存读 ----------
function saveEnvelopeData() {
  Storage.set('envelopeData', envelopeData);
}

// ---------- 文字生成（照搬 chat：8~12 句，标点随机） ----------
function generateEnvelopeText(contactId) {
  var pool = poolFor(contactId).filter(function (t) { return typeof t === 'string' && t.trim(); });
  if (!pool.length) return '';
  var n = 8 + Math.floor(Math.random() * 5);   // 8~12
  var out = '';
  for (var i = 0; i < n; i++) {
    var r = Math.random();
    var punct = r < 0.2 ? '！' : (r < 0.4 ? '…' : '。');
    out += pool[Math.floor(Math.random() * pool.length)] + punct;
  }
  return out;
}

function _envUid(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ---------- 寄信 ----------
// isReply=true 是回复梦角的来信；chat 里回复时只有 10% 概率会再收到回信
function sendEnvelope(contactId, text) {
  var c = envelopeOf(contactId);
  if (!c) return;
  text = (text || '').trim();
  if (!text) { toast('信件内容不能为空'); return; }

  var cm = _envComposing || {};
  var now = Date.now();
  var willReply = cm.isReply ? (Math.random() < 0.10) : true;

  c.outbox.push({
    id: _envUid('env'),
    content: text,
    sentTime: now,
    deliveredTime: now + randomBetween(30, 60) * 60 * 1000,   // 30~60 分钟送达
    replyTime: willReply ? now + randomBetween(10, 24) * 60 * 60 * 1000 : null,
    status: 'sent',
    willReply: willReply
  });
  saveEnvelopeData();
  _envComposing = null;
  renderLetters();
  toast('信件已寄出');
}

// ---------- 状态推进 + 到点回信 ----------
function checkEnvelopeStatus() {
  var now = Date.now();
  var changed = false;
  var fresh = [];

  Object.keys(envelopeData).forEach(function (cid) {
    var d = envelopeData[cid];
    if (!d || !Array.isArray(d.outbox)) return;
    d.outbox.forEach(function (letter) {
      if (letter.status === 'sent' && letter.deliveredTime && now >= letter.deliveredTime) {
        letter.status = 'received';      // 已送达
        changed = true;
      }
      if (letter.willReply && letter.status === 'received' && letter.replyTime && now >= letter.replyTime) {
        var content = generateEnvelopeText(cid);
        if (!content) return;             // 字卡池为空就跳过这次回信，等配好字卡自然补上
        letter.status = 'replied';        // 已收到回信
        var box = {
          id: _envUid('reply'),
          refId: letter.id,
          originalContent: letter.content,
          content: content,
          receivedTime: now,
          isNew: true,
          fromPartner: false
        };
        d.inbox.push(box);
        fresh.push({ contactId: cid, letter: box });
        changed = true;
      }
    });
  });

  if (changed) {
    saveEnvelopeData();
    fresh.forEach(function (f) {
      playSound('message');
      showEnvelopePopup(f.contactId, f.letter, false);
    });
    renderLetters();
    updateNavBadge();
  }
}
window.checkEnvelopeStatus = checkEnvelopeStatus;

// ---------- 梦角主动来信 ----------
// 走现有的概率活动登记表：每位梦角自己一份排期，到点按概率写信
function partnerWriteLetter(contactId) {
  var d = envelopeOf(contactId);
  if (!d) return;
  var content = generateEnvelopeText(contactId);
  if (!content) return;                   // 字卡池为空就不写
  var letter = {
    id: _envUid('partner'),
    refId: null,
    originalContent: null,
    content: content,
    receivedTime: Date.now(),
    isNew: true,
    fromPartner: true
  };
  d.inbox.push(letter);
  saveEnvelopeData();
  playSound('message');
  showEnvelopePopup(contactId, letter, true);
  renderLetters();
  updateNavBadge();
}

registerPartnerActivity({
  key: 'write-letter',
  nextAt: function () {
    // chat 是 24~72 小时冷却
    return Date.now() + randomBetween(24, 72) * 60 * 60 * 1000;
  },
  chance: function () { return 40; },     // chat 是 40% 概率
  run: function (c) { partnerWriteLetter(c.id); }
});

// ---------- 未读 ----------
function envelopeUnread(contactId) {
  var d = envelopeOf(contactId);
  if (!d) return 0;
  return d.inbox.filter(function (l) { return l.isNew; }).length;
}
function envelopeTotalUnread() {
  return contacts.reduce(function (sum, c) {
    return isGroupContact(c) ? sum : sum + envelopeUnread(c.id);
  }, 0);
}

function updateEnvelopeBadge() {
  var badge = document.getElementById('nav-badge-letters');
  if (!badge) return;
  var n = envelopeTotalUnread();
  if (n > 0) {
    badge.style.display = 'flex';
    badge.textContent = n > 99 ? '99+' : n;
  } else {
    badge.style.display = 'none';
  }
}

// ---------- 收到信件的浮层提示（照搬 chat） ----------
function showEnvelopePopup(contactId, letter, fromPartner) {
  var old = document.getElementById('envelope-popup');
  if (old) old.remove();
  var c = memberById(contactId);
  var who = c ? c.name : '对方';
  var mine = (homeProfile && homeProfile.name) || '我';

  var pop = document.createElement('div');
  pop.id = 'envelope-popup';
  pop.className = 'env-popup';
  pop.innerHTML =
    '<div class="env-popup-head">' +
      '<span class="env-popup-ico">💌</span>' +
      '<div>' +
        '<div class="env-popup-title">' +
          escapeHtml(fromPartner ? who + '给你写了一封信' : who + '回信了') + '</div>' +
        '<div class="env-popup-sub">' +
          escapeHtml(fromPartner ? '打开信箱查看吧' : 'Ta 给你写了回信，快去看看吧') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="env-popup-btns">' +
      '<button class="env-popup-btn" data-a="later">稍后查看</button>' +
      '<button class="env-popup-btn primary" data-a="read">立即阅读</button>' +
    '</div>';
  document.body.appendChild(pop);

  pop.addEventListener('click', function (e) {
    var b = e.target.closest('.env-popup-btn');
    if (!b) return;
    if (b.dataset.a === 'read') {
      pop.remove();
      _envSel = contactId;
      _envTab = 'inbox';
      showView('letters');
      renderLetters();
      openEnvelopeView(contactId, 'inbox', letter.id);
    } else {
      pop.remove();
    }
  });
  setTimeout(function () { if (pop.parentNode) pop.remove(); }, 8000);
}

// ---------- 界面 ----------
var _envSingles = function () {
  return contacts.filter(function (c) { return !isGroupContact(c); });
};

function renderLetters() {
  var view = document.getElementById('view-letters');
  if (!view) return;
  var body = view.querySelector('.letters-body');
  if (!body) return;

  var singles = _envSingles();
  if (!singles.length) {
    body.innerHTML = '<div class="empty-state" style="flex:1">' +
      '<div class="es-icon"><i class="fas fa-envelope"></i></div>' +
      '<div class="es-title">还没有梦角</div>' +
      '<div class="es-desc">先新建一位梦角，就可以给她写信了</div></div>';
    updateEnvelopeBadge();
    return;
  }
  if (!_envSel || !singles.some(function (c) { return c.id === _envSel; })) {
    _envSel = (getHomeContact() && !isGroupContact(getHomeContact())) ? getHomeContact().id : singles[0].id;
  }
  var cur = memberById(_envSel);
  var d = envelopeOf(_envSel) || { outbox: [], inbox: [] };

  var picker = '<div class="env-people">' + singles.map(function (c) {
    var n = envelopeUnread(c.id);
    return '<button class="env-person' + (c.id === _envSel ? ' active' : '') + '" data-pid="' + c.id + '">' +
      '<span class="env-person-ava">' + avatarHtml(c.avatar || ' ') + '</span>' +
      '<span class="env-person-name">' + escapeHtml(c.name) + '</span>' +
      (n ? '<span class="env-person-dot">' + (n > 99 ? '99+' : n) + '</span>' : '') +
    '</button>';
  }).join('') + '</div>';

  var pending = d.outbox.filter(function (l) { return l.status !== 'replied'; }).length;
  var fresh = d.inbox.filter(function (l) { return l.isNew; }).length;

  var compose = _envComposing && _envComposing.contactId === _envSel
    ? _envComposeHtml()
    : '';

  var list = compose
    ? compose
    : (function () {
        var arr = _envTab === 'outbox' ? d.outbox : d.inbox;
        if (!arr.length) {
          return '<div class="env-empty">' +
            '<i class="fas fa-envelope"></i>' +
            '<div class="env-empty-t">' + (_envTab === 'outbox' ? '还没有寄出任何信件' : '还没有收到回信') + '</div>' +
            '<div class="env-empty-s">' + (_envTab === 'outbox' ? '提笔写下心意，寄送给 Ta 吧' : '对方正在认真回复中，请稍候') + '</div>' +
          '</div>';
        }
        return arr.slice().reverse().map(function (l) { return _envItemHtml(_envSel, _envTab, l); }).join('');
      })();

  body.innerHTML =
    picker +
    '<div class="env-tabs">' +
      '<button class="env-tab' + (_envTab === 'outbox' ? ' active' : '') + '" data-tab="outbox">' +
        '寄出的' + (pending ? '<span class="env-tab-n">' + pending + '</span>' : '') + '</button>' +
      '<button class="env-tab' + (_envTab === 'inbox' ? ' active' : '') + '" data-tab="inbox">' +
        '收到的' + (fresh ? '<span class="env-tab-n">' + fresh + '</span>' : '') + '</button>' +
      '<button class="env-tab env-tab-write" data-tab="write"><i class="fas fa-pen"></i> 写一封信</button>' +
    '</div>' +
    '<div class="env-list" id="env-list">' + list + '</div>' +
    '<div class="env-foot">' + escapeHtml(cur ? cur.name : '') +
      ' 会在 10~24 小时内回信，梦角主动来信是每位各自排期的</div>';

  // 梦角切换
  body.querySelectorAll('.env-person').forEach(function (b) {
    b.addEventListener('click', function () {
      _envSel = b.dataset.pid;
      _envComposing = null;
      renderLetters();
    });
  });
  // 分页
  body.querySelectorAll('.env-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.dataset.tab;
      if (t === 'write') {
        _envComposing = { contactId: _envSel, isReply: false, refId: null, originalContent: null };
      } else {
        _envTab = t;
        _envComposing = null;
      }
      renderLetters();
    });
  });
  // 点信
  body.querySelectorAll('[data-letter]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target.closest('.env-del')) return;
      openEnvelopeView(_envSel, _envTab, el.dataset.letter);
    });
  });
  // 删除
  body.querySelectorAll('.env-del').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = b.dataset.del;
      var box = envelopeOf(_envSel);
      if (!box) return;
      confirmModal('删除信件', '删除后无法恢复，确定吗？', function () {
        box[_envTab] = box[_envTab].filter(function (l) { return l.id !== id; });
        saveEnvelopeData();
        renderLetters();
        updateNavBadge();
      }, { danger: true });
    });
  });
  // 写信表单
  if (compose) bindEnvCompose(body);

  updateEnvelopeBadge();
}

function _envItemHtml(cid, section, l) {
  var c = memberById(cid);
  var who = c ? c.name : '对方';
  var mine = (homeProfile && homeProfile.name) || '我';
  var isIn = section === 'inbox';
  var date = new Date(l.receivedTime || l.sentTime).toLocaleDateString('zh-CN',
    { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  var head = isIn
    ? (l.fromPartner ? who + '的来信' : '来自 ' + who + ' 的回信') + ' · ' + date
    : '寄出 · ' + date;
  var status = !isIn
    ? (l.status === 'replied' ? '已收到回信' : (l.status === 'received' ? '已送达' : '已寄出'))
    : '';
  var preview = l.content.length > 46 ? l.content.slice(0, 46) + '…' : l.content;
  var orig = (!isIn && l.originalContent)
    ? '<div class="env-orig">原信：' + escapeHtml(l.originalContent.slice(0, 30)) + '…</div>'
    : '';

  return '<div class="env-item' + (l.isNew ? ' is-new' : '') + '" data-letter="' + l.id + '">' +
      '<div class="env-item-head">' +
        '<span class="env-item-from">' + escapeHtml(head) + '</span>' +
        (l.isNew ? '<span class="env-item-new">新</span>' : '') +
        '<span class="env-stamp">✉</span>' +
      '</div>' +
      orig +
      '<div class="env-item-prev">' + escapeHtml(preview) + '</div>' +
      (status ? '<div class="env-item-status">' + escapeHtml(status) + '</div>' : '') +
      '<button class="env-del" data-del="' + l.id + '"><i class="fas fa-times"></i></button>' +
    '</div>';
}

function _envComposeHtml() {
  var m = _envComposing;
  var quote = m.originalContent
    ? '<div class="env-quote">' +
        '<div class="env-quote-lab">对方的来信</div>' +
        '<div class="env-quote-txt">' + escapeHtml(m.originalContent) + '</div>' +
      '</div>'
    : '';
  return '<div class="env-compose">' +
      '<div class="env-compose-t">' + (m.isReply ? '回复这封信' : '写一封信') + '</div>' +
      quote +
      '<textarea id="env-input" class="env-input" rows="8" placeholder="' +
        (m.isReply ? '写下你想说的话…' : '提笔写下心意…') + '"></textarea>' +
      '<div class="env-compose-hint">' +
        (m.isReply ? '回复后对方有 10% 概率再回你' : '对方将在 10~24 小时内回信') +
      '</div>' +
      '<div class="env-compose-btns">' +
        '<button class="env-cbtn" id="env-cancel">取消</button>' +
        '<button class="env-cbtn primary" id="env-send">寄出</button>' +
      '</div>' +
    '</div>';
}

function bindEnvCompose(body) {
  var cancel = body.querySelector('#env-cancel');
  if (cancel) cancel.addEventListener('click', function () {
    _envComposing = null;
    renderLetters();
  });
  var send = body.querySelector('#env-send');
  if (send) send.addEventListener('click', function () {
    var ta = body.querySelector('#env-input');
    sendEnvelope(_envSel, ta ? ta.value : '');
  });
}

// ---------- 看信弹窗 ----------
function openEnvelopeView(cid, section, id) {
  var d = envelopeOf(cid);
  if (!d) return;
  var arr = section === 'inbox' ? d.inbox : d.outbox;
  var l = arr.filter(function (x) { return x.id === id; })[0];
  if (!l) return;

  if (section === 'inbox' && l.isNew) { l.isNew = false; saveEnvelopeData(); renderLetters(); updateNavBadge(); }
  _envViewing = { contactId: cid, section: section, id: id };

  var c = memberById(cid);
  var who = c ? c.name : '对方';
  var mine = (homeProfile && homeProfile.name) || '我';
  var isIn = section === 'inbox';
  var now = new Date(l.receivedTime || l.sentTime);
  var y = now.getFullYear();
  var mo = ('0' + (now.getMonth() + 1)).slice(-2);
  var dd = ('0' + now.getDate()).slice(-2);
  var dateLine = y + '/' + mo + '/' + dd + ' 星期' + '日一二三四五六'[now.getDay()];

  var title, stampL, stampS;
  if (isIn) {
    title = l.fromPartner ? who + '的来信' : '收到的回信';
    stampL = '已收到'; stampS = 'RECEIVED';
  } else if (l.status === 'replied') { title = '已收到回信'; stampL = '已回信'; stampS = 'REPLIED'; }
  else if (l.status === 'received') { title = '已送达'; stampL = '已送达'; stampS = 'DELIVERED'; }
  else { title = '已寄出'; stampL = '已寄出'; stampS = 'SENT'; }

  var old = document.getElementById('envelope-view');
  if (old) old.remove();
  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'envelope-view';
  mask.innerHTML =
    '<div class="modal-box env-view-box">' +
      '<div class="env-view-top">' +
        '<div class="env-view-title">' + escapeHtml(title) + '</div>' +
        '<div class="env-stamp-big"><b>' + escapeHtml(stampL) + '</b><i>' + escapeHtml(stampS) + '</i><u>' + mo + '/' + dd + '</u></div>' +
      '</div>' +
      '<div class="env-view-date">' + escapeHtml(dateLine) + '</div>' +
      '<div class="env-view-to">' + escapeHtml('致 ' + (isIn ? mine : who) + '：') + '</div>' +
      '<div class="env-view-hello">' + escapeHtml(isIn ? '见字如面，一切皆好。' : '见字如面，望君安好。') + '</div>' +
      (isIn && l.originalContent
        ? '<div class="env-view-orig"><b>原信</b>' + escapeHtml(l.originalContent) + '</div>' : '') +
      '<div class="env-view-text" id="env-view-text">' + escapeHtml(l.content) + '</div>' +
      '<textarea id="env-view-edit" class="env-view-edit" hidden></textarea>' +
      '<div class="env-view-sign">' +
        '<span>' + escapeHtml(dateLine) + '</span>' +
        '<span>' + escapeHtml(isIn ? who : mine) + '</span>' +
      '</div>' +
      '<div class="env-view-btns">' +
        (isIn && l.fromPartner ? '<button class="env-cbtn" id="env-reply">回复这封信</button>' : '') +
        (!isIn ? '<button class="env-cbtn" id="env-edit-btn">编辑</button><button class="env-cbtn primary" id="env-save-btn" hidden>保存</button>' : '') +
        '<button class="env-cbtn primary" id="env-close">关闭</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mask);

  var editing = false;
  var ta = mask.querySelector('#env-view-edit');
  var txt = mask.querySelector('#env-view-text');
  var editBtn = mask.querySelector('#env-edit-btn');
  var saveBtn = mask.querySelector('#env-save-btn');

  if (editBtn) editBtn.addEventListener('click', function () {
    if (editing) {
      editing = false;
      txt.hidden = false; ta.hidden = true;
      editBtn.textContent = '编辑'; saveBtn.hidden = true;
    } else {
      editing = true;
      ta.value = l.content;
      txt.hidden = true; ta.hidden = false;
      editBtn.textContent = '取消'; saveBtn.hidden = false;
      ta.focus();
    }
  });
  if (saveBtn) saveBtn.addEventListener('click', function () {
    var v = (ta.value || '').trim();
    if (!v) { toast('内容不能为空'); return; }
    l.content = v;
    saveEnvelopeData();
    txt.textContent = v;
    toast('已保存修改');
    renderLetters();
  });
  var replyBtn = mask.querySelector('#env-reply');
  if (replyBtn) replyBtn.addEventListener('click', function () {
    mask.remove();
    _envTab = 'inbox';
    _envComposing = { contactId: cid, isReply: true, refId: l.id, originalContent: l.content };
    renderLetters();
  });
  mask.querySelector('#env-close').addEventListener('click', function () { mask.remove(); });
  mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
}

// 收到回信 / 主动来信的钩子：进 app 与开聊天时都检查一次
var _lastEnvCheck = 0;
function envelopeTick() {
  var now = Date.now();
  if (now - _lastEnvCheck < 5000) return;     // 防止同一批消息被反复处理
  _lastEnvCheck = now;
  checkEnvelopeStatus();
}
window.envelopeTick = envelopeTick;
