/* ============ 字卡传讯 · 输入栏（布局与功能对齐 chat） ============ */
/* 左侧：＋更多 / 📹通话 / 🖼图片 / 😊表情拍一拍  中间：输入框（可切换按住说话）  右侧：🎤语音 / ⏭继续说 / 📚批量 / ➤发送 */

function initInputBar() {
  var input = DOMElements.messageInput;

  // ---- 发送 ----
  DOMElements.sendBtn.addEventListener('click', function () {
    if (isBatchMode) { addToBatch(); return; }
    sendMessage();
  });

  // 回车发送（Shift+回车换行），输入为空时回车=换语音模式（chat 同款逻辑简化）
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!input.value.trim() && false) { toggleVoiceMode(); return; }  // 保留扩展点
      if (isBatchMode) { addToBatch(); return; }
      sendMessage();
    }
  });

  input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  // ---- ＋更多面板 ----
  DOMElements.moreBtn.addEventListener('click', function () {
    var panel = DOMElements.morePanel;
    var showing = panel.style.display !== 'none';
    hideAllPopups();
    panel.style.display = showing ? 'none' : 'block';
    DOMElements.moreBtn.classList.toggle('active', !showing);
  });

  DOMElements.morePanel.addEventListener('click', function (e) {
    var item = e.target.closest('.more-item');
    if (!item) return;
    var act = item.dataset.more;
    hideAllPopups();
    if (act === 'image') DOMElements.imageInput.click();
    else if (act === 'poke') doMyPoke();
    else if (act === 'continue') triggerContinue();
    else if (act === 'batch') toggleBatchMode();
    else if (act === 'cards') { showView('settings'); renderSettings('replies'); }
  });

  // ---- 📹 通话（占位） ----
  DOMElements.callBtn.addEventListener('click', function () {
    toast('语音通话 · 敬请期待');
  });

  // ---- 🖼 图片 ----
  DOMElements.imageBtn.addEventListener('click', function () { DOMElements.imageInput.click(); });
  DOMElements.imageInput.addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片不能超过5MB'); return; }
    optimizeImage(file).then(function (dataUrl) {
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
    }).catch(function () { toast('图片处理失败'); });
  });

  // ---- 😊 表情 & 拍一拍弹层 ----
  DOMElements.comboBtn.addEventListener('click', function () {
    var pop = DOMElements.stickerPop;
    var showing = pop.style.display !== 'none';
    hideAllPopups();
    if (!showing) {
      pop.style.display = 'block';
      DOMElements.comboBtn.classList.add('active');
      renderPopTab('emoji');
    }
  });

  DOMElements.stickerPop.querySelector('.pop-tabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.pop-tab');
    if (tab) renderPopTab(tab.dataset.tab);
  });

  DOMElements.popBody.addEventListener('click', function (e) {
    var btn = e.target.closest('.pop-emoji, .pop-poke-item');
    if (!btn) return;
    if (btn.classList.contains('pop-emoji')) {
      // 表情直接追加进输入框
      input.value += btn.textContent;
      input.dispatchEvent(new Event('input'));
    } else {
      hideAllPopups();
      doMyPoke(btn.dataset.action);
    }
  });

  // ---- 🎤 语音模式（按住说话，MediaRecorder） ----
  DOMElements.micBtn.addEventListener('click', toggleVoiceMode);
  initVoiceHold();

  // ---- ⏭ 让对方继续说 ----
  DOMElements.continueBtn.addEventListener('click', triggerContinue);

  // ---- 📚 批量发送 ----
  DOMElements.batchBtn.addEventListener('click', toggleBatchMode);

  // ---- 图片查看器关闭 ----
  DOMElements.imgViewer.addEventListener('click', function () {
    this.style.display = 'none';
  });
}

// 隐藏所有弹层（进入页面/切换时调用）
function hideAllPopups() {
  DOMElements.morePanel.style.display = 'none';
  DOMElements.stickerPop.style.display = 'none';
  DOMElements.moreBtn.classList.remove('active');
  DOMElements.comboBtn.classList.remove('active');
}

// ---------- 表情/拍一拍弹层 ----------
function renderPopTab(tab) {
  DOMElements.stickerPop.querySelectorAll('.pop-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  var body = DOMElements.popBody;
  if (tab === 'emoji') {
    body.innerHTML = EMOJIS.map(function (e) {
      return '<button class="pop-emoji">' + e + '</button>';
    }).join('');
  } else {
    body.innerHTML = customPokes.map(function (p) {
      return '<button class="pop-poke-item" data-action="' + escapeHtml(p) + '">' + escapeHtml(p) + '</button>';
    }).join('');
  }
}

// 我拍一拍对方 → 系统消息
function doMyPoke(action) {
  var act = action || settings.myPokeText || customPokes[Math.floor(Math.random() * customPokes.length)];
  var contact = getActiveContact();
  var msg = {
    id: newId(), contactId: activeContactId, sender: 'system',
    text: '你 ' + act + ' ' + contact.name,
    timestamp: Date.now(), status: 'read', favorited: false, recalled: false,
    replyTo: null, type: 'system'
  };
  addMessage(msg);
  playSound('my_poke');
  // 50% 概率对方回拍（群聊随机成员）
  if (Math.random() < 0.5) setTimeout(triggerPartnerPoke, randomBetween(800, 2000));
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
  var input = DOMElements.messageInput;
  var wrap = DOMElements.voiceWrap;
  var micBtn = DOMElements.micBtn;
  if (voiceMode) {
    input.style.display = 'none';
    wrap.style.display = 'flex';
    micBtn.classList.add('active');
  } else {
    input.style.display = '';
    wrap.style.display = 'none';
    micBtn.classList.remove('active');
  }
}

var mediaRecorder = null, voiceChunks = [], recordStartTs = 0, cancelRecord = false;

function initVoiceHold() {
  var btn = DOMElements.voiceBtn;
  var hint = DOMElements.voiceHint;

  function start(e) {
    e.preventDefault();
    if (!activeContactId) return;
    cancelRecord = false;
    recordStartTs = Date.now();
    btn.classList.add('recording');
    btn.textContent = '松开 发送';
    hint.classList.add('show');
    hint.textContent = '松开 发送，上滑 取消';

    if (!navigator.mediaDevices || !window.MediaRecorder) { return; }  // 无麦克风权限时仅显示按压态
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

  function end(e) {
    e.preventDefault();
    if (!btn.classList.contains('recording')) return;
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
    hint.textContent = '已取消';
    setTimeout(resetVoiceBtn, 400);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
  }

  function resetVoiceBtn() {
    btn.classList.remove('recording');
    btn.textContent = '按住 说话';
    hint.classList.remove('show');
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
    if (btn.classList.contains('recording')) end(new Event('mouseleave'));
  });

  // 点击播放语音
  DOMElements.chatStream.addEventListener('click', function (e) {
    var bubble = e.target.closest('.voice-bubble');
    if (!bubble) return;
    var row = bubble.closest('.msg-row');
    var msg = activeMessages().find(function (m) { return m.id === Number(row.dataset.id); });
    if (msg && msg.audio) {
      var audio = new Audio(msg.audio);
      audio.play().catch(function () { toast('播放失败'); });
    }
  });
}

// ---------- 批量发送（chat 同款） ----------
function toggleBatchMode() {
  isBatchMode = !isBatchMode;
  DOMElements.batchBtn.classList.toggle('active', isBatchMode);
  var preview = DOMElements.batchPreview;
  if (isBatchMode) {
    batchMessages = [];
    preview.style.display = 'block';
    updateBatchPreview();
    toast('批量模式：输入内容后点发送逐条加入');
  } else {
    preview.style.display = 'none';
  }
}

function addToBatch() {
  var text = DOMElements.messageInput.value.trim();
  if (!text) return;
  batchMessages.push({ id: Date.now() + batchMessages.length, text: text });
  DOMElements.messageInput.value = '';
  DOMElements.messageInput.style.height = 'auto';
  updateBatchPreview();
}

function updateBatchPreview() {
  var box = DOMElements.batchPreview;
  var items = batchMessages.map(function (m, i) {
    return '<div class="bp-item"><span class="bp-text">' + escapeHtml(m.text) + '</span>' +
      '<button data-rm="' + i + '">✕</button></div>';
  }).join('');
  box.innerHTML =
    '<div class="bp-title">批量待发（' + batchMessages.length + '）</div>' +
    (items || '<div style="font-size:12px;color:var(--ink-3);">输入内容后点发送加入列表</div>') +
    '<div class="bp-actions">' +
      '<button class="bp-cancel">取消</button>' +
      '<button class="bp-send"' + (batchMessages.length ? '' : ' disabled style="opacity:.4"') + '>发送全部</button>' +
    '</div>';

  box.querySelector('.bp-cancel').onclick = function () { toggleBatchMode(); };
  var sendAll = box.querySelector('.bp-send');
  if (sendAll) sendAll.onclick = function () { sendBatchAll(); };
  box.querySelectorAll('[data-rm]').forEach(function (btn) {
    btn.onclick = function () {
      batchMessages.splice(Number(btn.dataset.rm), 1);
      updateBatchPreview();
    };
  });
}

function sendBatchAll() {
  if (!batchMessages.length) return;
  var queue = batchMessages.slice();
  batchMessages = [];
  updateBatchPreview();
  var i = 0;
  (function next() {
    if (i >= queue.length) {
      toggleBatchMode();
      return;
    }
    var m = queue[i++];
    var msg = {
      id: newId(), contactId: activeContactId, sender: 'user',
      text: m.text, image: null, voice: null,
      timestamp: Date.now(), status: 'sent', favorited: false, recalled: false,
      replyTo: null, type: 'normal'
    };
    addMessage(msg);
    playSound('my_send');
    setTimeout(next, randomBetween(400, 1200));
  })();
  // 批量发完后触发一次回复链
  setTimeout(function () { triggerDelayedReply(true); }, queue.length * 800);
}

// ---------- 引用预览 ----------
function showReplyPreview(msg) {
  currentReplyTo = msg;
  var box = DOMElements.replyPreview;
  box.style.display = 'flex';
  box.innerHTML =
    '<div class="rp-text"><span class="rp-label">引用 ' + (msg.sender === 'user' ? '我' : (getActiveContact().name || '对方')) + '</span>' +
    escapeHtml(msg.text || '[图片]') + '</div>' +
    '<button id="rp-close">✕</button>';
  document.getElementById('rp-close').onclick = hideReplyPreview;
}

function hideReplyPreview() {
  currentReplyTo = null;
  DOMElements.replyPreview.style.display = 'none';
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
  DOMElements.imgViewerImg.src = src;
  DOMElements.imgViewer.style.display = 'flex';
}
