/* ============ 字卡传讯 · 输入栏（布局与功能对齐 chat） ============ */
/* 左侧：＋更多 / 📹视频通话   中间：输入框（可切换按住说话）   右侧：😀表情 / 🎤语音 / ⋯继续说 */

function initInputBar() {
  var input = document.getElementById('message-input');
  var moreBtn = document.getElementById('more-btn');
  var morePanel = document.getElementById('more-panel');

  // ---- 发送：回车发送（Shift+回车换行）----
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  input.addEventListener('input', autoGrow);

  // ---- ＋更多面板 ----
  if (moreBtn) moreBtn.addEventListener('click', toggleMorePanel);

  if (morePanel) morePanel.addEventListener('click', function (e) {
    var item = e.target.closest('.more-item');
    if (!item) return;
    var act = item.dataset.more;
    closeMorePanel();
    if (act === 'transfer') {
      if (window.TransferFeature) window.TransferFeature.open();
    } else if (act === 'rp-record') {
      if (window.TransferFeature) window.TransferFeature.openRecord();
    } else if (act === 'ask') {
      if (window.openAskModal) window.openAskModal();
    } else if (act === 'image') {
      document.getElementById('image-input').click();
    }
  });

  // ---- 📹 视频通话（规则照搬 chat/features/call.js：35% 对方拒接等）----
  var videocallBtn = document.getElementById('videocall-btn');
  if (videocallBtn) videocallBtn.addEventListener('click', function () {
    if (window.CallFeature) window.CallFeature.start();
  });

  // ---- 🖼 发送图片（更多面板与隐藏的 attachment-btn 均触发）----
  var imageInput = document.getElementById('image-input');
  var attachmentBtn = document.getElementById('attachment-btn');
  if (attachmentBtn) attachmentBtn.addEventListener('click', function () { imageInput.click(); });
  imageInput.addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片不能超过5MB'); return; }
    optimizeImage(file).then(function (dataUrl) {
      sendImageMessage(dataUrl);
    }).catch(function () { toast('图片处理失败'); });
  });

  // ---- 😊 表情 & 我的表情面板 ----
  document.getElementById('combo-btn').addEventListener('click', toggleStickerPanel);

  // ---- 🎤 语音模式（按住说话）----
  document.getElementById('voice-mic-btn').addEventListener('click', toggleVoiceMode);
  initVoiceHold();

  // ---- ⋯ 让对方继续说 ----
  document.getElementById('continue-btn').addEventListener('click', triggerContinue);

  // ---- 图片查看器关闭 ----
  var viewer = document.getElementById('img-viewer');
  if (viewer) viewer.addEventListener('click', function () { this.style.display = 'none'; });
}

// ---------- 更多面板（＋） ----------
function toggleMorePanel() {
  var panel = document.getElementById('more-panel');
  var btn = document.getElementById('more-btn');
  if (!panel) return;
  var willOpen = !panel.classList.contains('open');
  // 打开更多面板时收起表情面板
  var sticker = document.getElementById('user-sticker-picker');
  if (sticker) sticker.classList.remove('active');
  panel.classList.toggle('open', willOpen);
  if (btn) btn.classList.toggle('open', willOpen);
}
function closeMorePanel() {
  var panel = document.getElementById('more-panel');
  var btn = document.getElementById('more-btn');
  if (panel) panel.classList.remove('open');
  if (btn) btn.classList.remove('open');
}
function dismissMorePanel() { closeMorePanel(); }
window.toggleMorePanel = toggleMorePanel;
window.closeMorePanel = closeMorePanel;
window.dismissMorePanel = dismissMorePanel;

// ---------- 我的表情面板（😀） ----------
function toggleStickerPanel() {
  var picker = document.getElementById('user-sticker-picker');
  if (!picker) return;
  var willOpen = !picker.classList.contains('active');
  closeMorePanel();
  picker.classList.toggle('active', willOpen);
  document.getElementById('combo-btn').classList.toggle('open', willOpen);
  if (willOpen && window.renderMyStickerPanel) window.renderMyStickerPanel();
}
window.toggleStickerPanel = toggleStickerPanel;

// 隐藏所有弹层（进入页面/切换时调用）
function hideAllPopups() {
  closeMorePanel();
  var sticker = document.getElementById('user-sticker-picker');
  if (sticker) sticker.classList.remove('active');
  var combo = document.getElementById('combo-btn');
  if (combo) combo.classList.remove('open');
}

// ---------- 发送图片消息 ----------
function sendImageMessage(dataUrl) {
  var msg = {
    id: newId(), contactId: activeContactId, sender: 'user',
    text: '', image: dataUrl, voice: null,
    timestamp: Date.now(), status: 'sent', favorited: false, recalled: false,
    replyTo: currentReplyTo ? { text: currentReplyTo.text, sender: currentReplyTo.sender } : null,
    type: 'normal'
  };
  currentReplyTo = null;
  hideReplyPreview();
  addMessage(msg);
  playSound('my_send');
  triggerDelayedReply(true);
}

// 我的拍一拍：用户拍梦角。入口是双击梦角消息旁的头像（见 core.js buildMsgRow）。
// targetId 传入具体梦角（群里即那条消息的发送者），专属拍一拍只对对应梦角生效。
function doMyPoke(action, targetId) {
  var cid = targetId || activeContactId;
  var pool = pokesFor(cid, 'mine');
  if (!pool.length) {
    toast('还没有「我的拍一拍」动作，去设置里添加');
    return;
  }
  var act = action || randomOf(pool);
  var member = targetId ? memberById(targetId) : getActiveContact();
  if (!member) member = getActiveContact();
  if (!member) return;
  var msg = {
    id: newId(), contactId: activeContactId, sender: 'system',
    senderId: targetId || null,
    text: '你 ' + act + ' ' + (member ? member.name : '对方'),
    timestamp: Date.now(), status: 'read', favorited: false, recalled: false,
    replyTo: null, type: 'system'
  };
  addMessage(msg);
  playSound('my_poke');
  if (Math.random() < 0.5) {
    setTimeout(function () { triggerPartnerPoke(targetId || null); }, randomBetween(800, 2000));
  }
}

// 让对方继续说：跳过已读不回，直接排队一条回复（群聊由随机成员接着说）
function triggerContinue() {
  if (!activeContactId) return;
  var contact = getActiveContact();
  var group = isGroupContact(contact) ? contact : null;
  var memberIds = group ? getGroupMemberIds(group) : [];
  if (group && !memberIds.length) { toast('群里没有可说话的梦角'); return; }
  var senderId = group ? randomOf(memberIds) : null;
  showTyping(senderId ? memberById(senderId) : null);
  setTimeout(function () {
    hideTyping();
    var text = pickReply(senderId || activeContactId);
    if (!text) { toast('字卡库为空，请到设置中添加'); return; }
    deliverPartnerMsg(text, senderId);
  }, randomBetween(1200, 3000));
}

// ---------- 语音模式 ----------
var voiceMode = false;
function toggleVoiceMode() {
  voiceMode = !voiceMode;
  var input = document.getElementById('message-input');
  var wrap = document.getElementById('voice-hold-wrap');
  var micBtn = document.getElementById('voice-mic-btn');
  if (voiceMode) {
    if (input) input.style.display = 'none';
    if (wrap) wrap.style.display = 'flex';
    if (micBtn) micBtn.classList.add('active');
  } else {
    if (input) input.style.display = '';
    if (wrap) wrap.style.display = 'none';
    if (micBtn) micBtn.classList.remove('active');
  }
}

var mediaRecorder = null, voiceChunks = [], recordStartTs = 0, cancelRecord = false;

function initVoiceHold() {
  var wrap = document.getElementById('voice-hold-wrap');
  var btn = document.getElementById('voice-hold-btn');
  var label = document.getElementById('voice-hold-label');
  if (!btn || !wrap) return;

  function start(e) {
    e.preventDefault();
    if (!activeContactId) return;
    cancelRecord = false;
    recordStartTs = Date.now();
    wrap.classList.add('recording');
    wrap.classList.remove('cancelling');
    if (label) label.textContent = '松开 发送';

    if (!navigator.mediaDevices || !window.MediaRecorder) { return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (cancelRecord) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      mediaRecorder = new MediaRecorder(stream);
      voiceChunks = [];
      mediaRecorder.ondataavailable = function (ev) { if (ev.data.size) voiceChunks.push(ev.data); };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (cancelRecord) return;
        var dur = Math.max(1, Math.round((Date.now() - recordStartTs) / 1000));
        var blob = new Blob(voiceChunks, { type: 'audio/webm' });
        var reader = new FileReader();
        reader.onload = function () {
          addMessage({
            id: newId(), contactId: activeContactId, sender: 'user',
            text: '', image: null, voice: String(dur), audio: reader.result,
            timestamp: Date.now(), status: 'sent', favorited: false, recalled: false,
            replyTo: null, type: 'normal'
          });
          triggerDelayedReply(true);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
    }).catch(function () {
      toast('未获得麦克风权限');
      resetVoiceBtn();
    });
  }

  function end() {
    if (!wrap.classList.contains('recording')) return;
    resetVoiceBtn();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder = null;
    } else if (Date.now() - recordStartTs < 800) {
      toast('说话时间太短');
    }
  }

  function cancel() {
    cancelRecord = true;
    wrap.classList.add('cancelling');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    setTimeout(resetVoiceBtn, 400);
  }

  function resetVoiceBtn() {
    wrap.classList.remove('recording');
    wrap.classList.remove('cancelling');
    if (label) label.textContent = '按住 说话';
  }

  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('touchmove', function (e) {
    var y = e.touches[0].clientY;
    if (btn.getBoundingClientRect().top - y > 70) cancel();
  }, { passive: true });
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', function () {
    if (wrap.classList.contains('recording')) end();
  });
}

// ---------- 输入框自适应高度 ----------
function autoGrow() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 96) + 'px';
}

// ---------- 引用预览 ----------
function showReplyPreview(msg) {
  currentReplyTo = msg;
  var box = document.getElementById('reply-preview');
  if (!box) return;
  box.style.display = 'flex';
  box.innerHTML =
    '<div class="rp-text"><span class="rp-label">引用 ' + (msg.sender === 'user' ? '我' : (getActiveContact().name || '对方')) + '</span>' +
    escapeHtml(msg.text || (msg.image ? '[图片]' : '[消息]')) + '</div>' +
    '<button id="rp-close"><i class="fas fa-times"></i></button>';
  var close = document.getElementById('rp-close');
  if (close) close.onclick = hideReplyPreview;
}

function hideReplyPreview() {
  currentReplyTo = null;
  var box = document.getElementById('reply-preview');
  if (box) box.style.display = 'none';
}

// ---------- 图片工具 ----------
function optimizeImage(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function () {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var max = 1080;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openImageViewer(src) {
  var viewer = document.getElementById('img-viewer');
  var img = document.getElementById('img-viewer-img');
  if (img) img.src = src;
  if (viewer) viewer.style.display = 'flex';
}