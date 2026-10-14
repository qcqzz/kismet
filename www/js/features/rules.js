/* ============ 字卡传讯 · 设置页（字卡库/规则对齐 chat） ============ */

function renderSettings(focusSection) {
  var body = DOMElements.settingsBody;
  if (!body) return;

  body.innerHTML =
    // 字卡语料（chat 的"自定义回复"）
    '<div class="settings-group" id="sec-replies"><div class="sg-title">字卡语料库（' + replyPool.length + ' 条）</div><div class="sg-card">' +
      '<div class="kar-list" id="reply-list">' + replyListHtml() +
        '<div class="kar-add-row">' +
          '<input type="text" id="new-reply-input" placeholder="添加一条新语料…">' +
          '<button id="add-reply-btn">添加</button>' +
        '</div>' +
      '</div>' +
    '</div></div>' +

    // 关键词规则
    '<div class="settings-group" id="sec-keywords"><div class="sg-title">关键词规则（' + keywordRules.length + ' 组）</div><div class="sg-card">' +
      '<div class="kar-list" id="kw-list">' + keywordListHtml() +
        '<div class="kw-form">' +
          '<input type="text" id="kw-keys-input" placeholder="关键词，用逗号分隔（如：早安,早上好）">' +
          '<input type="text" id="kw-replies-input" placeholder="对应回复，用逗号分隔">' +
          '<button id="add-kw-btn">+ 添加规则</button>' +
        '</div>' +
      '</div>' +
    '</div></div>' +

    // 拍一拍池
    '<div class="settings-group"><div class="sg-title">拍一拍动作（' + customPokes.length + ' 个）</div><div class="sg-card">' +
      '<div class="kar-list" id="poke-list">' + pokeListHtml() +
        '<div class="kar-add-row">' +
          '<input type="text" id="new-poke-input" placeholder="添加拍一拍动作…（对方拍你时随机用）">' +
          '<button id="add-poke-btn">添加</button>' +
        '</div>' +
      '</div>' +
    '</div></div>' +

    // 回复行为（chat 对齐）
    '<div class="settings-group"><div class="sg-title">回复行为（同 chat）</div><div class="sg-card">' +
      rowSwitch('replyEnabled', '自动回复', '关闭后对方不再回信', settings.replyEnabled) +
      rowSwitch('typingIndicatorEnabled', '正在输入', '回复前显示微信式「正在输入」气泡', settings.typingIndicatorEnabled) +
      rowSwitch('readReceiptEnabled', '已读回执', '显示 已读/已发送', settings.readReceiptEnabled) +
      rowNumber('readNoReplyChancePercent', '已读不回概率(%)', Math.round((settings.readNoReplyChance || 0) * 100)) +
      rowNumber('replyDelayMin', '回复延迟下限(ms)', settings.replyDelayMin) +
      rowNumber('replyDelayMax', '回复延迟上限(ms)', settings.replyDelayMax) +
      rowSwitch('partnerRecallEnabled', '对方撤回', '3% 概率撤回上一条消息', settings.partnerRecallEnabled) +
      rowSwitch('pokeEnabled', '拍一拍', '3% 概率触发对方拍一拍', settings.pokeEnabled) +
      rowSwitch('statusChangeEnabled', '状态变化', '对方状态偶尔自动变化', settings.statusChangeEnabled) +
    '</div></div>' +

    // 外观
    '<div class="settings-group"><div class="sg-title">外观</div><div class="sg-card">' +
      '<div class="sg-row"><div><div class="row-label">纯黑白模式</div><div class="row-sub">关闭后用户气泡使用微信绿</div></div>' +
      '<label class="switch"><input type="checkbox" id="mono-toggle"' + (settings.bubbleTheme === 'mono' ? ' checked' : '') + '><span class="knob"></span></label></div>' +
    '</div></div>' +

    // 收藏
    '<div class="settings-group" id="sec-favs"><div class="sg-title">收藏的字卡</div><div class="sg-card">' +
      '<div class="kar-list" id="fav-list">' + favListHtml() + '</div>' +
    '</div></div>' +

    // 数据
    '<div class="settings-group"><div class="sg-title">数据</div><div class="sg-card">' +
      rowLink('exportData', '导出数据', '全部字卡、联系人与设置导出为 JSON') +
      rowLink('importData', '导入数据', '从 JSON 备份恢复') +
      rowLink('resetAll', '重置一切', '恢复到出厂状态', true) +
    '</div></div>';

  bindSettingsEvents();

  // 从聊天页跳转过来时滚动到指定区块
  if (focusSection) {
    var sec = document.getElementById('sec-' + (focusSection === 'replies' ? 'replies' : 'favs'));
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---- 行生成器 ----
function rowNumber(key, label, val) {
  return '<div class="sg-row"><span class="row-label">' + label + '</span>' +
    '<input type="number" data-set="' + key + '" value="' + val + '"></div>';
}
function rowSwitch(key, label, sub, checked) {
  return '<div class="sg-row"><div><div class="row-label">' + label + '</div>' +
    (sub ? '<div class="row-sub">' + sub + '</div>' : '') + '</div>' +
    '<label class="switch"><input type="checkbox" data-set="' + key + '"' + (checked ? ' checked' : '') + '>' +
    '<span class="knob"></span></label></div>';
}
function rowLink(act, label, sub, danger) {
  return '<div class="sg-row clickable" data-act="' + act + '">' +
    '<div><div class="row-label"' + (danger ? ' style="color:var(--badge)"' : '') + '>' + label + '</div>' +
    (sub ? '<div class="row-sub">' + sub + '</div>' : '') + '</div>' +
    '<span style="color:var(--ink-3)">›</span></div>';
}

function replyListHtml() {
  if (replyPool.length === 0) return '<div class="empty-hint">语料为空，添加几条吧</div>';
  return replyPool.map(function (r, i) {
    var builtin = BUILTIN_REPLIES.indexOf(r) !== -1;
    return '<div class="kar-item"><span class="kar-text">' + escapeHtml(r) + '</span>' +
      (builtin ? '<span class="kar-tag">内置</span>' : '') +
      '<button class="kar-del" data-idx="' + i + '">✕</button></div>';
  }).join('');
}

function keywordListHtml() {
  if (keywordRules.length === 0) return '<div class="empty-hint">还没有关键词规则</div>';
  return keywordRules.map(function (rule, i) {
    return '<div class="kw-item"><div class="kw-info">' +
      '<div class="kw-keys">当包含：' + escapeHtml(rule.keywords.join(' / ')) + '</div>' +
      '<div class="kw-replies">回复：' + escapeHtml(rule.replies.join(' | ')) + '</div>' +
      '</div><button class="kw-del" data-idx="' + i + '">✕</button></div>';
  }).join('');
}

function pokeListHtml() {
  if (customPokes.length === 0) return '<div class="empty-hint">没有拍一拍动作</div>';
  return customPokes.map(function (p, i) {
    return '<div class="kar-item"><span class="kar-text">' + escapeHtml(p) + '</span>' +
      '<button class="kar-del" data-idx="' + i + '">✕</button></div>';
  }).join('');
}

function favListHtml() {
  var favs = [];
  Object.keys(messagesByContact).forEach(function (cid) {
    (messagesByContact[cid] || []).forEach(function (m) {
      if (m.favorited) favs.push({ cid: cid, m: m });
    });
  });
  if (favs.length === 0) return '<div class="empty-hint">还没有收藏的字卡，点击消息 → 收藏</div>';
  return favs.map(function (item, i) {
    var c = contacts.find(function (cc) { return cc.id === item.cid; });
    return '<div class="kar-item"><span class="kar-text">' + escapeHtml(item.m.text || '[图片]') +
      '<span style="color:var(--ink-3);font-size:11px"> — ' + escapeHtml(c ? c.name : '') + '</span></span>' +
      '<button class="fav-unfav" data-cid="' + item.cid + '" data-id="' + item.m.id + '">取消</button></div>';
  }).join('');
}

// ---- 事件 ----
function bindSettingsEvents() {
  var body = DOMElements.settingsBody;

  // 行为设置
  body.querySelectorAll('[data-set]').forEach(function (el) {
    var key = el.dataset.set;
    el.addEventListener('change', function () {
      if (key === 'readNoReplyChancePercent') {
        settings.readNoReplyChance = Math.max(0, Math.min(100, Number(el.value) || 0)) / 100;
      } else if (key === 'replyDelayMin' || key === 'replyDelayMax') {
        settings[key] = Math.max(200, Number(el.value) || DEFAULT_SETTINGS[key]);
        if (settings.replyDelayMin > settings.replyDelayMax) {
          if (key === 'replyDelayMin') settings.replyDelayMax = settings.replyDelayMin;
          else settings.replyDelayMin = settings.replyDelayMax;
        }
      } else if (el.type === 'checkbox') {
        settings[key] = el.checked;
      } else {
        settings[key] = el.value.trim();
      }
      saveData();
    });
  });

  // 纯黑白模式
  var mono = body.querySelector('#mono-toggle');
  if (mono) {
    mono.addEventListener('change', function () {
      settings.bubbleTheme = mono.checked ? 'mono' : 'wechat';
      saveData();
      applyBubbleTheme();
    });
  }

  // 语料增删
  var addReplyBtn = body.querySelector('#add-reply-btn');
  if (addReplyBtn) {
    addReplyBtn.addEventListener('click', function () {
      var input = body.querySelector('#new-reply-input');
      var val = input.value.trim();
      if (!val) return;
      replyPool.push(val);
      saveData();
      renderSettings();
      toast('已添加');
    });
  }
  var replyList = body.querySelector('#reply-list');
  if (replyList) {
    replyList.addEventListener('click', function (e) {
      var del = e.target.closest('.kar-del');
      if (!del) return;
      replyPool.splice(Number(del.dataset.idx), 1);
      saveData();
      renderSettings();
    });
  }

  // 关键词规则
  var addKwBtn = body.querySelector('#add-kw-btn');
  if (addKwBtn) {
    addKwBtn.addEventListener('click', function () {
      var keysVal = body.querySelector('#kw-keys-input').value.trim();
      var repsVal = body.querySelector('#kw-replies-input').value.trim();
      if (!keysVal || !repsVal) { toast('关键词和回复都要填'); return; }
      var keywords = keysVal.split(/[、,，\s]+/).filter(Boolean);
      var replies = repsVal.split(/[、,，|]+/).filter(Boolean);
      if (!keywords.length || !replies.length) { toast('格式不对哦'); return; }
      keywordRules.push({ id: 'kw-' + Date.now(), keywords: keywords, replies: replies });
      saveData();
      renderSettings();
      toast('规则已添加');
    });
  }
  var kwList = body.querySelector('#kw-list');
  if (kwList) {
    kwList.addEventListener('click', function (e) {
      var del = e.target.closest('.kw-del');
      if (!del) return;
      keywordRules.splice(Number(del.dataset.idx), 1);
      saveData();
      renderSettings();
    });
  }

  // 拍一拍池
  var addPokeBtn = body.querySelector('#add-poke-btn');
  if (addPokeBtn) {
    addPokeBtn.addEventListener('click', function () {
      var input = body.querySelector('#new-poke-input');
      var val = input.value.trim();
      if (!val) return;
      customPokes.push(val);
      saveData();
      renderSettings();
    });
  }
  var pokeList = body.querySelector('#poke-list');
  if (pokeList) {
    pokeList.addEventListener('click', function (e) {
      var del = e.target.closest('.kar-del');
      if (!del) return;
      customPokes.splice(Number(del.dataset.idx), 1);
      saveData();
      renderSettings();
    });
  }

  // 收藏取消
  var favList = body.querySelector('#fav-list');
  if (favList) {
    favList.addEventListener('click', function (e) {
      var btn = e.target.closest('.fav-unfav');
      if (!btn) return;
      var cid = btn.dataset.cid, mid = Number(btn.dataset.id);
      var msg = (messagesByContact[cid] || []).find(function (m) { return m.id === mid; });
      if (msg) { msg.favorited = false; saveData(); }
      renderSettings();
      if (activeContactId) renderAllMessages();
    });
  }

  // 数据
  body.querySelectorAll('[data-act]').forEach(function (el) {
    el.addEventListener('click', function () {
      var act = el.dataset.act;
      if (act === 'exportData') exportData();
      else if (act === 'importData') importData();
      else if (act === 'resetAll') {
        confirmModal('重置一切', '将删除全部数据（联系人/消息/语料/规则/设置）。确定吗？', function () {
          Object.keys(localStorage).forEach(function (k) {
            if (k.indexOf(APP_PREFIX) === 0) localStorage.removeItem(k);
          });
          location.reload();
        }, { danger: true });
      }
    });
  });
}

// ---- 外观 ----
function applyBubbleTheme() {
  document.body.dataset.theme = settings.bubbleTheme === 'mono' ? 'mono' : 'wechat';
}

// ---- 导出 / 导入 ----
function exportData() {
  var data = {
    app: 'zikka-chuanxun',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    contacts: contacts,
    messagesByContact: messagesByContact,
    settings: settings,
    keywordRules: keywordRules,
    customPokes: customPokes,
    customReplies: replyPool.filter(function (r) { return BUILTIN_REPLIES.indexOf(r) === -1; })
  };
  var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zikka-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出');
}

function importData() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data.app !== 'zikka-chuanxun') { toast('不是有效的字卡备份'); return; }
        confirmModal('导入数据', '将覆盖当前全部数据，确定吗？', function () {
          contacts = data.contacts || contacts.slice();
          messagesByContact = data.messagesByContact || {};
          settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
          keywordRules = data.keywordRules || BUILTIN_KEYWORD_RULES.slice();
          customPokes = data.customPokes || POKE_ACTIONS.slice();
          replyPool = BUILTIN_REPLIES.concat(data.customReplies || []);
          contacts.forEach(function (c) {
            if (!Array.isArray(messagesByContact[c.id])) messagesByContact[c.id] = [];
          });
          saveData();
          applyBubbleTheme();
          if (activeContactId) renderAllMessages();
          renderContactList();
          renderSettings();
          toast('导入成功');
        }, { danger: true });
      } catch (e) {
        toast('解析失败：' + e.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
