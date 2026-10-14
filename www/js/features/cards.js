/* ============ 字卡传讯 · 消息操作弹层 & 通用弹窗 ============ */

function showSheet(title, items, onAct) {
  var mask = DOMElements.sheetMask;
  var sheet = DOMElements.actionSheet;
  sheet.innerHTML =
    '<div class="sheet-title">' + escapeHtml(title) + '</div>' +
    items.map(function (it) {
      return '<button class="sheet-item' + (it.danger ? ' danger' : '') + (it.cancel ? ' cancel' : '') +
        '" data-act="' + it.act + '">' + it.label + '</button>';
    }).join('');
  mask.style.display = 'block';
  sheet.style.display = 'block';
  sheet.onclick = function (e) {
    var btn = e.target.closest('.sheet-item');
    if (!btn) return;
    closeSheet();
    onAct(btn.dataset.act);
  };
  mask.onclick = closeSheet;
}

function closeSheet() {
  DOMElements.sheetMask.style.display = 'none';
  DOMElements.actionSheet.style.display = 'none';
}

// 消息长按/点击菜单
function openActionSheet(msg) {
  var items;
  if (msg.recalled) {
    items = [
      { label: '🗑 删除', act: 'delete', danger: true },
      { label: '取消', act: 'cancel', cancel: true }
    ];
  } else if (msg.type === 'system') {
    items = [
      { label: '⧉ 复制', act: 'copy' },
      { label: '🗑 删除', act: 'delete', danger: true },
      { label: '取消', act: 'cancel', cancel: true }
    ];
  } else {
    items = [
      { label: '↩ 引用回复', act: 'quote' },
      { label: (msg.favorited ? '取消收藏' : '♥ 收藏'), act: 'fav' },
      { label: '⧉ 复制', act: 'copy' },
      { label: '↗ 保存/分享图片', act: 'share' },
      { label: '撤回', act: 'recall' },
      { label: '🗑 删除', act: 'delete', danger: true },
      { label: '取消', act: 'cancel', cancel: true }
    ];
  }

  var preview = msg.recalled ? '（已撤回）' : (msg.text || '[图片]').slice(0, 24);
  showSheet(preview, items, function (act) {
    if (act === 'quote') {
      showReplyPreview(msg);
    } else if (act === 'fav') {
      msg.favorited = !msg.favorited;
      saveData();
      renderAllMessages();
      toast(msg.favorited ? '已收藏 ♥' : '已取消收藏');
    } else if (act === 'copy') {
      copyText(msg.text || '');
    } else if (act === 'share') {
      shareCardImage(msg);
    } else if (act === 'recall') {
      // 微信规则：只能撤回自己的消息，且发送超过 2 分钟不可撤回
      if (msg.sender !== 'user') { toast('只能撤回自己的消息'); return; }
      if (Date.now() - msg.timestamp > 2 * 60 * 1000) { toast('发送超过2分钟，无法撤回'); return; }
      msg.recalled = true;
      saveData();
      renderAllMessages();
      toast('已撤回');
    } else if (act === 'delete') {
      confirmModal('删除消息', '确定删除这条消息吗？', function () {
        var list = activeMessages();
        var idx = list.findIndex(function (m) { return m.id === msg.id; });
        if (idx !== -1) list.splice(idx, 1);
        saveData();
        renderAllMessages();
      }, { danger: true });
    }
  });
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast('已复制'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('已复制');
  }
}

// 通用确认/输入弹窗
function confirmModal(title, desc, onOk, opts) {
  opts = opts || {};
  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML =
    '<div class="modal-box">' +
      '<div class="m-title">' + escapeHtml(title) + '</div>' +
      '<div class="m-desc">' + escapeHtml(desc) + '</div>' +
      (opts.input !== undefined ? '<input type="text" id="modal-input" value="' + escapeHtml(opts.input) + '">' : '') +
      (opts.textarea !== undefined ? '<textarea id="modal-input" rows="3">' + escapeHtml(opts.textarea) + '</textarea>' : '') +
      '<div class="m-actions">' +
        '<button class="m-btn-cancel">取消</button>' +
        '<button class="' + (opts.danger ? 'm-btn-danger' : 'm-btn-ok') + '">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mask);
  mask.querySelector('.m-btn-cancel').onclick = function () { mask.remove(); };
  mask.querySelector('.m-btn-ok').onclick = function () {
    var inputEl = mask.querySelector('#modal-input');
    var val = inputEl ? inputEl.value.trim() : undefined;
    if (inputEl && opts.validate && !opts.validate(val)) return;
    mask.remove();
    if (onOk) onOk(val);
  };
}

function promptModal(title, desc, prefill, onOk) {
  confirmModal(title, desc || ' ', onOk, { input: prefill || '', validate: function (v) { return !!v; } });
}
