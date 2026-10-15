/* ============ 字卡传讯 · 我的表情（对齐 chat：只显示我的表情，含上传/分组管理） ============ */

var myStickerLibrary = [];   // [{id, src, groupId, addedAt}]
var myStickerGroups = [];    // [{id, name}]
var _stickerFilter = null;   // 当前筛选分组 id；null = 全部
var _stickerLongPressed = false;

function initStickers() {
  myStickerLibrary = Array.isArray(Storage.get('myStickerLibrary')) ? Storage.get('myStickerLibrary') : [];
  myStickerGroups = Array.isArray(Storage.get('myStickerGroups')) ? Storage.get('myStickerGroups') : [];
  window.myStickerLibrary = myStickerLibrary;
  window.myStickerGroups = myStickerGroups;

  var picker = document.getElementById('user-sticker-picker');
  var upload = document.getElementById('my-sticker-quick-upload');
  if (!picker || !upload) return;

  if (upload) upload.addEventListener('change', function () {
    _addStickers(this.files);
    this.value = '';
  });

  // 点击分发（事件委托）
  picker.addEventListener('click', function (e) {
    if (_stickerLongPressed) { _stickerLongPressed = false; return; }

    var addGroup = e.target.closest('.sticker-group-add');
    if (addGroup) { _createGroup(); return; }

    var chip = e.target.closest('.sticker-group-chip');
    if (chip) { setStickerFilter(chip.getAttribute('data-group') || null); return; }

    var manageLink = e.target.closest('.my-sticker-manage-link');
    if (manageLink) { _openManage(); return; }

    var addBtn = e.target.closest('.sticker-grid-add');
    if (addBtn) { upload.click(); return; }

    var delBtn = e.target.closest('.sticker-delete-btn');
    if (delBtn) { e.stopPropagation(); _deleteSticker(delBtn.getAttribute('data-del')); return; }

    var item = e.target.closest('.sticker-grid-item');
    if (item) { _sendStickerById(item.getAttribute('data-id')); return; }
  });

  // 长按表情 → 移动到分组 / 删除
  var pressTimer = null, pressTarget = null;
  picker.addEventListener('pointerdown', function (e) {
    var item = e.target.closest('.sticker-grid-item');
    if (!item) return;
    pressTarget = item;
    pressTimer = setTimeout(function () {
      if (pressTarget) _showStickerActions(pressTarget.getAttribute('data-id'));
      pressTarget = null;
      pressTimer = null;
    }, 500);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
    picker.addEventListener(evt, function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      pressTarget = null;
    });
  });
}

function _saveStickers() {
  Storage.set('myStickerLibrary', myStickerLibrary);
  Storage.set('myStickerGroups', myStickerGroups);
  window.myStickerLibrary = myStickerLibrary;
  window.myStickerGroups = myStickerGroups;
}

// ── 渲染我的表情面板 ─────────────────────────────────────
function renderMyStickerPanel() {
  var groupSlot = document.getElementById('my-sticker-group-row-slot');
  var content = document.getElementById('combo-content-area');
  if (!content) return;

  if (groupSlot) {
    var chips = '<button class="sticker-group-chip' + (_stickerFilter == null ? ' active' : '') + '" data-group="">全部</button>';
    myStickerGroups.forEach(function (g) {
      chips += '<button class="sticker-group-chip' + (_stickerFilter === g.id ? ' active' : '') + '" data-group="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</button>';
    });
    chips += '<button class="sticker-group-add" title="新建分组"><i class="fas fa-plus"></i></button>';
    groupSlot.innerHTML = chips;
  }

  var list = (_stickerFilter == null)
    ? myStickerLibrary
    : myStickerLibrary.filter(function (s) { return s.groupId === _stickerFilter; });

  content.classList.remove('show-title');
  var html = '<div class="my-sticker-add-title-row">'
    + '<span class="my-sticker-add-title">添加表情</span>'
    + '<button class="my-sticker-manage-link" type="button">管理</button>'
    + '</div>'
    + '<div class="sticker-grid-view">'
    + '<div class="sticker-grid-add" title="添加表情"><i class="fas fa-plus"></i></div>';

  list.forEach(function (s) {
    html += '<div class="sticker-grid-item" data-id="' + escapeHtml(s.id) + '">'
      + '<img src="' + escapeHtml(s.src) + '" alt="">'
      + '<span class="sticker-delete-btn" data-del="' + escapeHtml(s.id) + '"><i class="fas fa-times"></i></span>'
      + '</div>';
  });
  html += '</div>';
  if (!list.length) {
    html += '<div class="empty-sticker-tip"><i class="fas fa-smile-wink"></i>还没有表情，点左上角 + 上传</div>';
  }
  content.innerHTML = html;
}
window.renderMyStickerPanel = renderMyStickerPanel;

function setStickerFilter(groupId) {
  _stickerFilter = groupId;
  renderMyStickerPanel();
}
window.setStickerFilter = setStickerFilter;

// ── 上传表情 ─────────────────────────────────────────────
function _addStickers(files) {
  var arr = Array.prototype.slice.call(files).filter(function (f) {
    return f && f.type && f.type.indexOf('image') === 0;
  });
  if (!arr.length) return;
  var targetGroup = _stickerFilter || null;
  var i = 0;
  (function next() {
    if (i >= arr.length) { _saveStickers(); renderMyStickerPanel(); return; }
    var file = arr[i++];
    if (file.size > MAX_IMAGE_SIZE) { next(); return; }
    optimizeImage(file).then(function (dataUrl) {
      myStickerLibrary.push({
        id: 'stk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        src: dataUrl,
        groupId: targetGroup,
        addedAt: Date.now()
      });
      next();
    }).catch(function () { next(); });
  })();
}

// ── 删除表情 ─────────────────────────────────────────────
function _deleteSticker(id) {
  confirmModal('删除表情', '确定删除这个表情吗？', function () {
    myStickerLibrary = myStickerLibrary.filter(function (s) { return s.id !== id; });
    _saveStickers();
    renderMyStickerPanel();
  }, { danger: true });
}

// ── 发送表情（作为图片消息） ─────────────────────────────
function _sendStickerById(id) {
  var s = myStickerLibrary.find(function (x) { return x.id === id; });
  if (!s) return;
  addMessage({
    id: newId(), contactId: activeContactId, sender: 'user',
    text: '', image: s.src, voice: null,
    timestamp: Date.now(), status: 'sent', favorited: false, recalled: false,
    replyTo: null, type: 'normal'
  });
  playSound('my_send');
  triggerDelayedReply(true);
  var picker = document.getElementById('user-sticker-picker');
  if (picker) picker.classList.remove('active');
  var combo = document.getElementById('combo-btn');
  if (combo) combo.classList.remove('open');
}

// ── 长按：移动到分组 / 删除 ─────────────────────────────
function _showStickerActions(id) {
  _stickerLongPressed = true;
  var entry = myStickerLibrary.find(function (s) { return s.id === id; });
  if (!entry) return;
  var items = [{ label: '未分组', act: 'g_null' }];
  myStickerGroups.forEach(function (g) { items.push({ label: g.name, act: 'g_' + g.id }); });
  items.push({ label: '删除表情', act: 'del', danger: true });
  items.push({ label: '取消', act: 'cancel', cancel: true });
  showSheet('移动表情到分组', items, function (act) {
    if (act === 'cancel') return;
    if (act === 'del') { _deleteSticker(id); return; }
    if (act === 'g_null') entry.groupId = null;
    else if (act.indexOf('g_') === 0) entry.groupId = act.slice(2);
    _saveStickers();
    renderMyStickerPanel();
  });
}

// ── 分组管理 ─────────────────────────────────────────────
function _createGroup(onDone) {
  promptModal('新建分组', '输入分组名称', '', function (name) {
    if (!name) return;
    myStickerGroups.push({ id: 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: name });
    _saveStickers();
    renderMyStickerPanel();
    if (onDone) onDone();
  });
}

function _openManage() {
  var modal = document.getElementById('my-sticker-manage-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'my-sticker-manage-modal';
    modal.innerHTML =
      '<div class="modal-content">'
      + '<div class="modal-title"><i class="fas fa-cog"></i><span>管理表情库</span></div>'
      + '<div class="my-sticker-manage-section-label">分组</div>'
      + '<div id="msm-group-list"></div>'
      + '<button class="modal-btn modal-btn-secondary" id="msm-new-group" style="width:100%;"><i class="fas fa-plus"></i> 新建分组</button>'
      + '<div class="modal-buttons" style="justify-content:flex-end;"><button class="modal-btn modal-btn-secondary" id="msm-close">关闭</button></div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) hideModal(modal); });
    modal.querySelector('#msm-close').onclick = function () { hideModal(modal); };
    modal.querySelector('#msm-new-group').onclick = function () {
      _createGroup(function () { _renderManageModal(); });
    };
  }
  _renderManageModal();
  showModal(modal);
}

function _renderManageModal() {
  var list = document.getElementById('msm-group-list');
  if (!list) return;
  if (!myStickerGroups.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);font-size:13px;padding:12px;">还没有分组</div>';
    return;
  }
  list.innerHTML = myStickerGroups.map(function (g) {
    return '<div class="my-sticker-manage-group-row">'
      + '<span class="my-sticker-manage-group-name">' + escapeHtml(g.name) + '</span>'
      + '<button class="my-sticker-manage-mini-btn" data-rename="' + escapeHtml(g.id) + '" title="重命名"><i class="fas fa-pen"></i></button>'
      + '<button class="my-sticker-manage-mini-btn danger" data-gdel="' + escapeHtml(g.id) + '" title="删除分组"><i class="fas fa-trash-alt"></i></button>'
      + '</div>';
  }).join('');

  list.querySelectorAll('[data-rename]').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-rename');
      var g = myStickerGroups.find(function (x) { return x.id === id; });
      if (!g) return;
      promptModal('重命名分组', '', g.name, function (v) {
        if (!v) return;
        g.name = v;
        _saveStickers();
        renderMyStickerPanel();
        _renderManageModal();
      });
    };
  });
  list.querySelectorAll('[data-gdel]').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-gdel');
      var g = myStickerGroups.find(function (x) { return x.id === id; });
      if (!g) return;
      confirmModal('删除分组', '删除分组「' + g.name + '」？分组内的表情将移至未分组。', function () {
        myStickerGroups = myStickerGroups.filter(function (x) { return x.id !== id; });
        myStickerLibrary.forEach(function (s) { if (s.groupId === id) s.groupId = null; });
        if (_stickerFilter === id) _stickerFilter = null;
        _saveStickers();
        renderMyStickerPanel();
        _renderManageModal();
      }, { danger: true });
    };
  });
}