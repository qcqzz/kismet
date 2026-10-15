/* ============ 字卡传讯 · 红包 / 转账（对齐 chat） ============ */
/* 依赖：showModal / hideModal / addMessage / activeMessages / saveData / renderAllMessages */

function initTransfer() {
  var amountInput = document.getElementById('transfer-amount-input');
  var amountLabel = document.getElementById('transfer-amount-label');
  var hint = document.getElementById('transfer-amount-hint');
  var greetingEl = document.getElementById('rp-send-greeting');
  var confirmBtn = document.getElementById('transfer-confirm-btn');
  var cancelBtn = document.getElementById('transfer-cancel-btn');
  var presets = Array.prototype.slice.call(document.querySelectorAll('.transfer-preset'));

  if (amountInput) {
    amountInput.addEventListener('input', function () {
      _syncAmountLabel();
      _markPreset(null);
    });
  }
  if (greetingEl) {
    greetingEl.addEventListener('input', function () { _setTransferHint(''); });
    greetingEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doUserTransfer(); }
    });
  }
  presets.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!amountInput) return;
      amountInput.value = b.getAttribute('data-amt');
      _markPreset(b);
      _syncAmountLabel();
    });
  });
  if (confirmBtn) confirmBtn.addEventListener('click', doUserTransfer);
  if (cancelBtn) cancelBtn.addEventListener('click', function () {
    hideModal(document.getElementById('transfer-modal'));
  });

  // 拆红包小窗按钮
  var openClose = document.getElementById('rp-open-close');
  var openBtn = document.getElementById('rp-open-btn');
  if (openClose) openClose.addEventListener('click', closeOpen);
  if (openBtn) openBtn.addEventListener('click', openIt);

  // 红包记录弹窗
  var closeRecord = document.getElementById('close-rp-record');
  if (closeRecord) closeRecord.addEventListener('click', closeRecordModal);
  var tabPartner = document.getElementById('rp-record-tab-partner');
  var tabMe = document.getElementById('rp-record-tab-me');
  if (tabPartner) tabPartner.addEventListener('click', function () { switchRpRecordView('partner'); });
  if (tabMe) tabMe.addEventListener('click', function () { switchRpRecordView('me'); });
}

function _fmtRMB(amt) { return '¥' + Number(amt || 0).toFixed(2); }
function _rpPartnerName() {
  var c = getActiveContact();
  return (c && c.name) ? c.name : '对方';
}
function _rpMyName() { return (settings && settings.myName) ? settings.myName : '我'; }

function _findRpMsgById(id) {
  var arr = activeMessages();
  for (var i = arr.length - 1; i >= 0; i--) {
    if (String(arr[i].id) === String(id)) return arr[i];
  }
  return null;
}

// 推送一条红包消息
function _pushRedpacket(sender, greeting, amount) {
  return addMessage({
    id: newId(),
    contactId: activeContactId,
    sender: sender,
    text: greeting || '恭喜发财，大吉大利',
    amount: amount,
    opened: false,
    openedAt: null,
    timestamp: Date.now(),
    status: sender === 'user' ? 'sent' : 'read',
    favorited: false,
    recalled: false,
    replyTo: null,
    type: 'redpacket'
  });
}

// ── 发红包 ──────────────────────────────────────────────
function openTransfer() {
  var modal = document.getElementById('transfer-modal');
  if (!modal) return;
  var amountInput = document.getElementById('transfer-amount-input');
  if (amountInput) { amountInput.value = ''; amountInput.classList.remove('correct'); }
  showModal(modal);
  setTimeout(function () { if (amountInput) amountInput.focus(); }, 130);
}

function _parseAmount() {
  var amountInput = document.getElementById('transfer-amount-input');
  var v = parseFloat(amountInput.value);
  if (!isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

function _syncAmountLabel() {
  var amountLabel = document.getElementById('transfer-amount-label');
  if (!amountLabel) return;
  var amt = _parseAmount();
  amountLabel.textContent = amt != null ? _fmtRMB(amt) : '¥0.00';
}

function _setTransferHint(msg, isErr) {
  var hint = document.getElementById('transfer-amount-hint');
  if (!hint) return;
  hint.textContent = msg || '';
  hint.style.color = isErr ? '#ff5f6d' : 'var(--text-secondary)';
}

function _markPreset(el) {
  document.querySelectorAll('.transfer-preset').forEach(function (b) { b.classList.remove('active'); });
  if (el) el.classList.add('active');
}

function doUserTransfer() {
  var amt = _parseAmount();
  if (amt == null) { _setTransferHint('请输入大于 0 的金额', true); return; }

  hideModal(document.getElementById('transfer-modal'));

  var greetingEl = document.getElementById('rp-send-greeting');
  var greeting = (greetingEl && greetingEl.value.trim()) || '恭喜发财，大吉大利';

  var rp = _pushRedpacket('user', greeting, amt);
  var rpId = (rp && rp.id != null) ? rp.id : null;
  // 阶段1：对方已读；阶段2：80% 概率在 2~30 秒后领取
  setTimeout(function () { markRpRead(rpId); }, 1600);
  if (Math.random() < 0.8) {
    setTimeout(function () { pushClaimedNotice(rpId); }, 2000 + Math.random() * 28000);
  }
}
window.doUserTransfer = doUserTransfer;

function markRpRead(id) {
  var arr = activeMessages();
  for (var i = arr.length - 1; i >= 0; i--) {
    var m = arr[i];
    if (m && m.type === 'redpacket' && m.sender === 'user') {
      if (id != null) {
        if (String(m.id) === String(id)) { m.status = 'read'; break; }
      } else if (m.status !== 'read') {
        m.status = 'read'; break;
      }
    }
  }
  saveData();
  renderAllMessages();
  if (typeof updateReadMarksDOM === 'function') updateReadMarksDOM();
}

function pushClaimedNotice(id) {
  var arr = activeMessages();
  for (var i = arr.length - 1; i >= 0; i--) {
    var m = arr[i];
    if (m && m.type === 'redpacket' && m.sender === 'user') {
      if (id != null) {
        if (String(m.id) === String(id)) { m.opened = true; m.openedAt = Date.now(); break; }
      } else if (!m.opened) {
        m.opened = true; m.openedAt = Date.now(); break;
      }
    }
  }
  saveData();
  renderAllMessages();
  renderRpRecordList(rpRecordView);

  addMessage({
    id: newId(),
    contactId: activeContactId,
    sender: 'system',
    text: _rpPartnerName() + '领取了' + _rpMyName() + '的红包',
    timestamp: Date.now(),
    status: 'read',
    favorited: false,
    recalled: false,
    replyTo: null,
    type: 'system'
  });
}

// ── 拆红包小窗 ──────────────────────────────────────────
var _openMsg = null;

function openRedpacket(id) {
  var msg = _findRpMsgById(id);
  if (!msg) { toast('红包消息不存在'); return; }
  if (msg.sender === 'user') { toast('这是你发出的红包，不能拆开'); return; }
  _openMsg = msg;
  var modal = document.getElementById('redpacket-open-modal');
  if (!modal) return;
  _populateOpenModal();
  showModal(modal);
}

function _populateOpenModal() {
  var msg = _openMsg;
  if (!msg) return;
  var name = msg.sender === 'user' ? _rpMyName() : _rpPartnerName();
  var nameEl = document.getElementById('rp-open-name');
  if (nameEl) nameEl.textContent = name + '发来的红包';
  var greetingEl = document.getElementById('rp-open-greeting');
  if (greetingEl) greetingEl.textContent = msg.text || '恭喜发财，大吉大利';
  var amtEl = document.getElementById('rp-open-amount');
  if (amtEl) amtEl.textContent = _fmtRMB(msg.amount);
  var btn = document.getElementById('rp-open-btn');
  if (btn) btn.textContent = msg.opened ? '已领取' : '开';
}

function openIt() {
  var msg = _openMsg;
  if (!msg) return;
  if (!msg.opened) {
    msg.opened = true;
    msg.openedAt = Date.now();
    saveData();
    renderAllMessages();
  }
  _populateOpenModal();
}

function closeOpen() {
  hideModal(document.getElementById('redpacket-open-modal'));
  _openMsg = null;
}

// ── 红包记录 ────────────────────────────────────────────
var rpRecordView = 'partner';

function openRecord() {
  var modal = document.getElementById('rp-record-modal');
  if (!modal) return;
  _syncRecordTabNames();
  switchRpRecordView('partner');
  showModal(modal);
}
function closeRecordModal() {
  hideModal(document.getElementById('rp-record-modal'));
}
function _syncRecordTabNames() {
  var partnerBtn = document.getElementById('rp-record-tab-partner');
  var meBtn = document.getElementById('rp-record-tab-me');
  if (partnerBtn) partnerBtn.innerHTML = '<i class="fas fa-heart"></i> ' + escapeHtml(_rpPartnerName());
  if (meBtn) meBtn.innerHTML = '<i class="fas fa-user"></i> ' + escapeHtml(_rpMyName());
}
function switchRpRecordView(who) {
  rpRecordView = who;
  renderRpRecordList(who);
}
window.switchRpRecord = switchRpRecordView;

function _rpDate(ts) {
  var d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function renderRpRecordList(who) {
  var list = document.getElementById('rp-record-list');
  if (!list) return;
  var partnerBtn = document.getElementById('rp-record-tab-partner');
  var meBtn = document.getElementById('rp-record-tab-me');
  if (partnerBtn) partnerBtn.classList.toggle('active', who === 'partner');
  if (meBtn) meBtn.classList.toggle('active', who === 'me');

  var recs = activeMessages().filter(function (m) {
    if (!m || m.type !== 'redpacket') return false;
    var isUser = m.sender === 'user';
    if (who === 'me' && !isUser) return false;
    if (who === 'partner' && isUser) return false;
    return true;
  });
  if (!recs.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);font-size:13px;padding:32px 10px;">暂无红包记录</div>';
    return;
  }
  recs.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
  var partnerName = _rpPartnerName();
  var myName = _rpMyName();
  list.innerHTML = recs.map(function (m) {
    var senderName = (m.sender === 'user') ? myName : partnerName;
    var icon = m.sender === 'user' ? 'fa-paper-plane' : 'fa-gift';
    var st = m.opened
      ? '<span class="rp-rec-status done">已领取</span>'
      : '<span class="rp-rec-status wait">待领取</span>';
    return '<div class="rp-rec-item">'
      + '<div class="rp-rec-ico"><i class="fas ' + icon + '"></i></div>'
      + '<div class="rp-rec-mid">'
      +   '<div class="rp-rec-title">' + escapeHtml(senderName) + '的红包</div>'
      +   '<div class="rp-rec-sub">' + escapeHtml(m.text || '恭喜发财，大吉大利') + ' · ' + escapeHtml(_rpDate(m.timestamp)) + '</div>'
      + '</div>'
      + '<div class="rp-rec-side"><div class="rp-rec-amt">' + escapeHtml(_fmtRMB(m.amount)) + '</div>' + st + '</div>'
      + '</div>';
  }).join('');
}

window.TransferFeature = {
  open: openTransfer,
  openRecord: openRecord,
  closeRecord: closeRecordModal,
  switchRecord: switchRpRecordView,
  openRedpacket: openRedpacket,
  openIt: openIt,
  closeOpen: closeOpen,
  manualUserTransfer: doUserTransfer
};