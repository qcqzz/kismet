/* ============ 字卡传讯 · 梦角资料页（聊天页右上角 ⋯ 进入的次级页） ============ */
/* 排版照参考图：顶部资料区（大头像 + 昵称 + 编辑笔 + 个签徽标）
   → 图标行列表（图标 + 标题 + 宽字距副标题 + 箭头）
   聊天设置单独一栏，展开为三级页存放原 ⋯ ActionSheet 的全部操作            */

var _ciSub = null;        // null=主列表 / 'settings' / 'history' / 'calls' / 'chatbg' / 'callbg'
var _ciQuery = '';        // 历史聊天页的搜索词

// ---------- 入口 ----------
function openContactInfo() {
  if (!getActiveContact()) { toast('还没有梦角'); return; }
  _ciSub = null;
  _ciQuery = '';
  renderContactInfo();
  showView('contactinfo');
}

// 返回：三级页先回二级页，否则回聊天页
function contactInfoBack() {
  if (_ciSub) { renderContactInfo(null); return; }   // 显式传 null 才会退回主列表
  showView('chat');
}

function setCiTitle(t) {
  var el = document.getElementById('contactinfo-title');
  if (el) el.textContent = t;
}

// 传 sub 才切换页面；不传则按当前 _ciSub 重绘（供改名/清空后刷新用）
function renderContactInfo(sub) {
  if (sub !== undefined) _ciSub = sub || null;
  var body = document.getElementById('contactinfo-body');
  if (!body) return;

  var c = getActiveContact();
  if (!c) {
    setCiTitle('聊天信息');
    body.innerHTML = '<div class="empty-state"><div class="es-icon"><i class="fas fa-user-slash"></i></div>' +
      '<div class="es-title">梦角已不存在</div></div>';
    return;
  }

  if (_ciSub === 'settings') return renderCiSettings();
  if (_ciSub === 'bubble')   return renderCiBubbleCss();
  if (_ciSub === 'avatarlib') return renderCiGallery('avatar');
  if (_ciSub === 'coverlib') return renderCiGallery('cover');
  if (_ciSub === 'history')  return renderCiHistory();
  if (_ciSub === 'calls')    return renderCiCalls();
  if (_ciSub === 'chatbg')   return renderCiBg('chat');
  if (_ciSub === 'callbg')   return renderCiBg('call');
  renderCiMain();
}

// ---------- 二级主列表 ----------
function renderCiMain() {
  var body = document.getElementById('contactinfo-body');
  var c = getActiveContact();
  setCiTitle(isGroupContact(c) ? '群聊信息' : '聊天信息');

  var msgs = messagesByContact[c.id] || [];
  var calls = callLogs[c.id] || [];

  var mainRows = [
    sRow({ ico: '<i class="fas fa-user-circle"></i>', label: '修改头像', sub: '上传图库 · 梦角会自己换', arrow: true, act: 'ci-avatarlib' }),
    sRow({ ico: '<i class="fas fa-images"></i>', label: '朋友圈', sub: c.name + ' 分享过的瞬间', arrow: true, act: 'ci-moments' }),
    sRow({ ico: '<i class="fas fa-image-portrait"></i>', label: '修改朋友圈背景', sub: _mIdentityCoverHint(c), arrow: true, act: 'ci-coverlib' }),
    sRow({ ico: '<i class="fas fa-comment-dots"></i>', label: '修改聊天气泡', sub: presetName(settings.bubblePreset) + ' · 可写自定义 CSS', arrow: true, act: 'ci-bubble' }),
    sRow({ ico: '<i class="fas fa-clock-rotate-left"></i>', label: '历史聊天', sub: msgs.length + ' 条记录 · 可搜索', arrow: true, act: 'ci-history' }),
    sRow({ ico: '<i class="fas fa-phone"></i>', label: '历史通话', sub: calls.length ? calls.length + ' 条记录' : '暂无通话记录', arrow: true, act: 'ci-calls' }),
    sRow({ ico: '<i class="fas fa-image"></i>', label: '修改通话背景', sub: settings.callBgImage ? '已自定义 · 点击更换' : '默认背景 · 点击自定义', arrow: true, act: 'ci-callbg' }),
    sRow({ ico: '<i class="fas fa-palette"></i>', label: '修改聊天背景', sub: settings.chatBgImage ? '已自定义 · 点击更换' : '默认背景 · 点击自定义', arrow: true, act: 'ci-chatbg' }),
    sRow({ ico: '<i class="fas fa-sliders-h"></i>', label: '聊天设置', sub: '昵称 · 字卡库 · 记录', arrow: true, act: 'ci-settings' })
  ];

  body.innerHTML = ciProfileHtml(c) + '<div class="ci-card">' + mainRows.join('') + '</div>';

  bindCiActs(body);
}

function _mIdentityCoverHint(c) {
  var lib = galleryFor('cover', c.id);
  return (momentsCovers[c.id] ? '已自定义' : '默认背景') + ' · 图库 ' + lib.length + ' 张';
}

// 顶部资料区（参考图：大头像 + 昵称 + 编辑笔 + 个签徽标）
function ciProfileHtml(c) {
  var ava = /^(data:|https?:|blob:)/.test(String(c.avatar || ''))
    ? '<img src="' + escapeHtml(c.avatar) + '" alt="">'
    : escapeHtml(c.avatar || '🌷');
  var sign = c.signature
    ? '<div class="ci-profile-sign"><span class="ci-sign-dot"></span>' + escapeHtml(c.signature) + '</div>'
    : '';
  return '<div class="ci-profile">' +
      '<div class="ci-profile-avatar" data-act="' + (isGroupContact(c) ? 'none' : 'ci-avatar') + '">' + ava + '</div>' +
      '<div class="ci-profile-main">' +
        '<div class="ci-profile-name" data-act="ci-rename">' + escapeHtml(c.name) +
          '<span class="ci-profile-edit"><i class="fas fa-pen"></i></span>' +
        '</div>' +
        sign +
      '</div>' +
    '</div>';
}

// ---------- 三级：聊天设置（原 ⋯ 弹层的全部内容） ----------
function renderCiSettings() {
  var body = document.getElementById('contactinfo-body');
  var c = getActiveContact();
  setCiTitle('聊天设置');

  var msgs = messagesByContact[c.id] || [];
  var favCount = msgs.filter(function (m) { return m.favorited; }).length;
  var rows = [];

  if (isGroupContact(c)) {
    rows.push(sRow({ ico: '<i class="fas fa-users"></i>', label: '群成员', sub: getGroupMemberIds(c).length + ' 位梦角', arrow: true, act: 'ci-members' }));
    rows.push(sRow({ ico: '<i class="fas fa-pen"></i>', label: '修改群聊名称', val: c.name, act: 'ci-rename' }));
  } else {
    rows.push(sRow({ ico: '<i class="fas fa-book"></i>', label: '专属字卡库', sub: (contactReplyPools[c.id] || []).length + ' 条专属字卡', arrow: true, act: 'ci-pool' }));
    rows.push(sRow({ ico: '<i class="fas fa-pen"></i>', label: '修改昵称', val: c.name, act: 'ci-rename' }));
  }
  rows.push(sRow({ ico: '<i class="fas fa-folder"></i>', label: '收藏的字卡', sub: favCount + ' 条', arrow: true, act: 'ci-favs' }));
  rows.push(sRow({ ico: '<i class="fas fa-broom"></i>', label: '清空此聊天记录', sub: '共 ' + msgs.length + ' 条', arrow: true, act: 'ci-clear' }));
  rows.push(sRow({ ico: '<i class="fas fa-trash-alt"></i>', label: isGroupContact(c) ? '解散群聊' : '删除梦角', arrow: true, act: 'ci-del' }));

  body.innerHTML = '<div class="ci-card">' + rows.join('') + '</div>';

  bindCiActs(body);
}

function bindCiActs(body) {
  body.querySelectorAll('[data-act]').forEach(function (el) {
    if (el.dataset.act === 'none') return;
    el.addEventListener('click', function () { handleCiAct(el.dataset.act); });
  });
}

function handleCiAct(act) {
  switch (act) {
    case 'ci-moments':
      // 朋友圈：只展示该梦角自己发的动态
      renderMoments({ contactId: getActiveContact().id, onlyPartner: true });
      showView('moments');
      break;
    case 'ci-settings':  renderContactInfo('settings'); break;
    case 'ci-bubble':    renderContactInfo('bubble'); break;
    case 'ci-avatarlib': renderContactInfo('avatarlib'); break;
    case 'ci-coverlib':  renderContactInfo('coverlib'); break;
    case 'ci-history':   renderContactInfo('history'); break;
    case 'ci-calls':     renderContactInfo('calls'); break;
    case 'ci-chatbg':    renderContactInfo('chatbg'); break;
    case 'ci-callbg':    renderContactInfo('callbg'); break;
    // 以下沿用原 ⋯ 弹层的动作
    case 'ci-members': chatInfoAction('members'); break;
    case 'ci-rename':  chatInfoAction('rename'); break;
    case 'ci-avatar':  chatInfoAction('avatar'); break;
    case 'ci-pool':    chatInfoAction('pool'); break;
    case 'ci-favs':    chatInfoAction('favs'); break;
    case 'ci-clear':   chatInfoAction('clear'); break;
    case 'ci-del':     chatInfoAction('del'); break;
  }
}

// ---------- 三级：头像图库 / 朋友圈背景图库 ----------
// kind: 'avatar' 头像库 | 'cover' 朋友圈背景库（每个梦角各自独立）
function renderCiGallery(kind) {
  var body = document.getElementById('contactinfo-body');
  var c = getActiveContact();
  var isAva = kind === 'avatar';
  setCiTitle(isAva ? '修改头像' : '修改朋友圈背景');

  var store = isAva ? contactAvatars : contactCovers;
  if (!Array.isArray(store[c.id])) store[c.id] = [];
  var lib = store[c.id];
  var current = isAva ? c.avatar : (momentsCovers[c.id] || null);
  var what = isAva ? '头像' : '朋友圈背景';

  var cells = lib.map(function (src, i) {
    var inUse = current === src;
    return '<div class="ci-gal-cell' + (inUse ? ' on' : '') + '" data-i="' + i + '">' +
        '<img src="' + escapeHtml(src) + '" alt="">' +
        '<span class="ci-gal-del" data-del="' + i + '"><i class="fas fa-times"></i></span>' +
        (inUse ? '<span class="ci-gal-badge">使用中</span>' : '') +
      '</div>';
  }).join('');

  body.innerHTML =
    '<div class="ci-cur">' +
      '<div class="ci-cur-box">' + avatarHtml(current, isAva ? '🌷' : '') + '</div>' +
      '<div class="ci-cur-txt"><div class="ci-cur-name">' + escapeHtml(c.name) + ' 现在的' + what + '</div>' +
        '<div class="ci-cur-sub">' + (lib.length ? '图库 ' + lib.length + ' 张' : '还没有上传过图片') + '</div></div>' +
    '</div>' +

    '<div class="ci-gal">' + cells +
      '<button class="ci-gal-add" id="ci-gal-upload"><i class="fas fa-plus"></i><span>上传图片</span></button>' +
    '</div>' +
    '<input type="file" id="ci-gal-input" accept="image/*" multiple style="display:none;">' +

    '<div class="set-note">' + (lib.length
      ? '点图库里的任意一张 = 发送给 ' + escapeHtml(c.name) + ' 推荐（对方 ' +
        settings.partnerRecAcceptMin + '%~' + settings.partnerRecAcceptMax + '% 会同意）；右上角 × 删除这张。'
      : '上传 2 张及以上后，' + escapeHtml(c.name) + ' 会隔一段时间自己随机换一张。') + '</div>' +

    ciAutoSwapGroupHtml();

  // 上传
  var input = body.querySelector('#ci-gal-input');
  body.querySelector('#ci-gal-upload').addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call(input.files || []).filter(function (f) {
      return f && f.type && f.type.indexOf('image') === 0;
    });
    input.value = '';
    if (!files.length) return;
    if (lib.length + files.length > 12) { toast('图库最多 12 张'); return; }
    var added = 0;
    (function next() {
      if (added >= files.length) {
        saveData();
        renderContactInfo(kind === 'avatar' ? 'avatarlib' : 'coverlib');
        toast('已加入图库 · 可以点图推荐给 ' + c.name);
        return;
      }
      compressGallery(files[added++]).then(function (url) {
        lib.push(url); next();
      }).catch(function () { next(); });
    })();
  });

  // 点图 = 推荐；点 × = 删除
  body.querySelectorAll('.ci-gal-cell').forEach(function (cell) {
    cell.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        var i = Number(del.dataset.del);
        lib.splice(i, 1);
        saveData();
        renderContactInfo(kind === 'avatar' ? 'avatarlib' : 'coverlib');
        return;
      }
      var src = lib[Number(cell.dataset.i)];
      if (!src) return;
      confirmModal('推荐给 ' + c.name,
        '确定把这张' + what + '推荐给 ' + c.name + ' 吗？',
        function () { sendImageRecommend(c, kind, src); renderContactInfo(kind === 'avatar' ? 'avatarlib' : 'coverlib'); },
        { danger: false });
    });
  });

  bindAutoSwapEvents(body, kind);
}

// 「梦角自主更换」设置组（两个图库页共用同一套开关）
function ciAutoSwapGroupHtml() {
  var min = Math.max(3, Math.min(30, Number(settings.partnerAutoSwapMinDays) || 3));
  var max = Math.max(min, Math.min(30, Number(settings.partnerAutoSwapMaxDays) || 30));
  var chance = Math.max(0, Math.min(100, Number(settings.partnerAutoSwapChance) || 0));
  return '<div class="set-group ci-swap-group"><div class="sg-lab">梦角自主更换</div>' +
      '<div class="set-card">' +
        '<div class="set-row"><span class="row-ico"><i class="fas fa-random"></i></span>' +
          '<span class="row-txt"><span class="row-label">让梦角自己换</span>' +
          '<span class="row-sub">图库 ≥2 张时，到点后随机挑一张换上</span></span>' +
          '<label class="switch"><input type="checkbox" id="ci-swap-on"' +
            (settings.partnerAutoSwapEnabled ? ' checked' : '') + '><span class="knob"></span></label>' +
        '</div>' +
        '<div class="set-row"><span class="row-ico"><i class="fas fa-hourglass-half"></i></span>' +
          '<span class="row-txt"><span class="row-label">更换间隔</span>' +
          '<span class="row-sub">每隔多久给梦角一次换的机会</span></span>' +
          '<input type="range" class="ci-swap-range" id="ci-swap-min" min="3" max="30" step="1" value="' + min + '">' +
          '<span class="ci-swap-val" id="ci-swap-min-v">' + min + ' 天</span>' +
        '</div>' +
        '<div class="set-row"><span class="row-ico"><i class="fas fa-dice"></i></span>' +
          '<span class="row-txt"><span class="row-label">更换概率</span>' +
          '<span class="row-sub">到点后真正换一张的概率</span></span>' +
          '<input type="range" class="ci-swap-range" id="ci-swap-chance" min="0" max="100" step="5" value="' + chance + '">' +
          '<span class="ci-swap-val" id="ci-swap-chance-v">' + chance + '%</span>' +
        '</div>' +
      '</div></div>';
}

function bindAutoSwapEvents(body, kind) {
  var sub = kind === 'avatar' ? 'avatarlib' : 'coverlib';
  var on = body.querySelector('#ci-swap-on');
  if (on) on.addEventListener('change', function () {
    settings.partnerAutoSwapEnabled = on.checked;
    saveData();
    toast(on.checked ? '梦角会自己换图了' : '已关闭自主更换');
  });

  // 间隔：拖动时始终维持 min ≤ max
  var minEl = body.querySelector('#ci-swap-min');
  var minVal = body.querySelector('#ci-swap-min-v');
  if (minEl) minEl.addEventListener('input', function () {
    var v = Math.max(3, Math.min(30, Number(minEl.value) || 3));
    minEl.value = v;
    settings.partnerAutoSwapMinDays = v;
    if (settings.partnerAutoSwapMaxDays < v) settings.partnerAutoSwapMaxDays = v;
    saveData();
    if (minVal) minVal.textContent = v + ' 天';
  });
  if (minEl) minEl.addEventListener('change', function () { renderContactInfo(sub); });

  var chEl = body.querySelector('#ci-swap-chance');
  var chVal = body.querySelector('#ci-swap-chance-v');
  if (chEl) chEl.addEventListener('input', function () {
    var v = Math.max(0, Math.min(100, Number(chEl.value) || 0));
    settings.partnerAutoSwapChance = v;
    saveData();
    if (chVal) chVal.textContent = v + '%';
  });
}

// ---------- 三级：历史聊天（微信式「聊天记录」搜索页，非对话回放） ----------
function renderCiHistory() {
  var body = document.getElementById('contactinfo-body');
  setCiTitle('历史聊天');

  body.innerHTML =
    '<div class="wx-search ci-search">' +
      '<input type="text" id="ci-history-search" placeholder="搜索聊天记录" value="' + escapeHtml(_ciQuery) + '">' +
    '</div>' +
    '<div class="ci-history-list" id="ci-history-list"></div>';

  var input = document.getElementById('ci-history-search');
  input.addEventListener('input', function () {
    _ciQuery = input.value.trim();
    renderCiHistoryList();
  });

  renderCiHistoryList();
  if (_ciQuery) input.focus();
}

function renderCiHistoryList() {
  var box = document.getElementById('ci-history-list');
  if (!box) return;
  var c = getActiveContact();
  var msgs = messagesByContact[c.id] || [];

  if (!msgs.length) {
    box.innerHTML = ciEmpty('fa-comment-slash', '还没有聊天记录', '发第一条字卡就会出现在这里');
    return;
  }

  var q = _ciQuery.toLowerCase();
  var hit = msgs.filter(function (m) { return !q || ciMsgText(m).toLowerCase().indexOf(q) !== -1; });
  hit = hit.slice().reverse();   // 最新的在最上

  if (!hit.length) {
    box.innerHTML = ciEmpty('fa-magnifying-glass', '没有找到相关记录', '换个词再试试，或清空搜索框查看全部');
    return;
  }

  var html = '<div class="ci-count">' +
    (_ciQuery ? '找到 <b>' + hit.length + '</b> 条相关记录' : '共 ' + hit.length + ' 条记录') + '</div>';

  var prevTs = 0;
  hit.forEach(function (m) {
    if (!sameDay(prevTs, m.timestamp)) {
      html += '<div class="ci-day"><span>' + escapeHtml(formatDayLabel(m.timestamp)) + '</span></div>';
      prevTs = m.timestamp;
    }
    html += ciHitHtml(m, c, _ciQuery);
  });
  box.innerHTML = html;
}

// 一条结果：头像 + 发言人 + 内容摘要（命中词高亮），不做左右对话气泡
function ciHitHtml(m, c, q) {
  var mine = m.sender === 'user';
  var who = mine ? ((homeProfile && homeProfile.name) || '我')
                 : (isGroupContact(c) && m.senderId
                    ? ((memberById(m.senderId) || {}).name || '梦角')
                    : c.name);
  var ava = mine ? ((homeProfile && homeProfile.avatar) || '🙂') : (c.avatar || '🌷');
  if (/^(data:|https?:|blob:)/.test(String(ava))) {
    ava = '<img src="' + escapeHtml(ava) + '" alt="">';
  } else {
    ava = escapeHtml(ava);
  }

  return '<div class="ci-hit">' +
      '<div class="ci-hit-avatar">' + ava + '</div>' +
      '<div class="ci-hit-main">' +
        '<div class="ci-hit-head"><span class="ci-hit-who">' + escapeHtml(who) + '</span>' +
          '<span class="ci-hit-ts">' + escapeHtml(formatTimeHM(m.timestamp)) + '</span></div>' +
        '<div class="ci-hit-text">' + _ciHighlight(ciMsgText(m), q) + '</div>' +
        (m.image ? '<img class="ci-msg-img" data-src="' + escapeHtml(m.image) + '" src="' + escapeHtml(m.image) + '" alt="">' : '') +
      '</div>' +
    '</div>';
}

// 消息的可搜索文本（图片/语音/红包等折叠成占位词）
function ciMsgText(m) {
  if (m.recalled) return (m.sender === 'user' ? '你' : '对方') + '撤回了一条消息';
  if (m.type === 'redpacket') return '红包 ' + (m.text || '');
  if (m.type === 'question') return '问问你 ' + (m.question || m.text || '');
  if (m.image) return '[图片]';
  if (m.voice) return '[语音] ' + m.voice + '"';
  return m.text || '';
}

// 命中词高亮（文本与关键词同走一次转义，长度对齐不会出现错位）
function _ciHighlight(text, q) {
  var safe = escapeHtml(text);
  if (!q) return safe;
  var needle = escapeHtml(q);
  var idx = safe.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return safe;
  return safe.slice(0, idx) + '<mark>' + safe.slice(idx, idx + needle.length) + '</mark>' + safe.slice(idx + needle.length);
}

// ---------- 三级：历史通话 ----------
function renderCiCalls() {
  var body = document.getElementById('contactinfo-body');
  var c = getActiveContact();
  setCiTitle('历史通话');

  var calls = (callLogs[c.id] || []).slice().sort(function (a, b) { return b.ts - a.ts; });
  if (!calls.length) {
    body.innerHTML = ciEmpty('fa-phone-slash', '暂无通话记录', '点击聊天页的 📹 视频通话后会记录在这里');
    return;
  }

  body.innerHTML = '<div class="ci-card">' + calls.map(function (call) {
    var isVideo = call.kind === 'video';
    var label = isVideo ? '视频通话' : '语音通话';
    var detail = call.missed
      ? '未接通'
      : (call.duration > 0 ? ciDuration(call.duration) : '已接通');
    return '<div class="set-row">' +
        '<span class="row-ico">' + (isVideo
          ? '<i class="fas fa-video"></i>'
          : '<i class="fas fa-phone"></i>') + '</span>' +
        '<span class="row-txt">' +
          '<span class="row-label">' + label + (call.missed ? ' · 未接通' : '') + '</span>' +
          '<span class="row-sub">' + escapeHtml(detail) + ' · ' + escapeHtml(formatDayLabel(call.ts)) + '</span>' +
        '</span>' +
        '<span class="row-val">' + escapeHtml(formatTimeHM(call.ts)) + '</span>' +
      '</div>';
  }).join('') + '</div>';

  var clearBtn = document.createElement('div');
  clearBtn.className = 'ci-danger-btn';
  clearBtn.textContent = '清空通话记录';
  clearBtn.addEventListener('click', function () {
    confirmModal('清空通话记录', '将删除与「' + c.name + '」的全部通话记录，确定吗？', function () {
      callLogs[c.id] = [];
      saveData();
      renderContactInfo('calls');
      toast('已清空');
    }, { danger: true });
  });
  body.appendChild(clearBtn);
}

function ciDuration(sec) {
  var m = Math.floor(sec / 60), s = sec % 60;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return m > 0 ? (m + ' 分 ' + pad(s) + ' 秒') : (s + ' 秒');
}

// ---------- 三级：修改聊天背景 / 通话背景 ----------
function renderCiBg(kind) {
  var body = document.getElementById('contactinfo-body');
  var isChat = kind === 'chat';
  var key = isChat ? 'chatBgImage' : 'callBgImage';
  setCiTitle(isChat ? '修改聊天背景' : '修改通话背景');

  var cur = settings[key] || '';
  var thumb = cur
    ? '<img src="' + escapeHtml(cur) + '" alt="">'
    : '<i class="fas fa-image"></i>';

  body.innerHTML =
    '<div class="ci-card">' +
      '<div class="ci-bg-row">' +
        '<div class="ci-bg-thumb">' + thumb + '</div>' +
        '<div class="ci-bg-actions">' +
          '<button class="row-btn ci-bg-btn" id="ci-bg-upload"><i class="fas fa-plus"></i> 上传图片</button>' +
          (cur ? '<button class="row-btn ci-bg-btn" id="ci-bg-clear">清除背景</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="set-note">' +
      (isChat
        ? '聊天背景会应用到聊天页，叠加半透明遮罩以保证气泡可读。与「设置 → 外观 → 背景 &amp; 陪伴」是同一个背景。'
        : '通话背景会在通话界面中作为底图；通话界面尚未开放，先把图存下来。') +
    '</div>' +
    '<input type="file" id="ci-bg-input" accept="image/*" style="display:none;">';

  var input = body.querySelector('#ci-bg-input');
  var upload = body.querySelector('#ci-bg-upload');
  if (upload && input) upload.addEventListener('click', function () { input.click(); });
  if (input) input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); input.value = ''; return; }
    compressPhoto(file).then(function (dataUrl) {
      settings[key] = dataUrl;
      saveData();
      if (isChat) applyAppearance();          // 聊天背景立刻生效
      renderContactInfo(kind);
      toast(isChat ? '聊天背景已更换' : '通话背景已更换');
    }).catch(function () { toast('图片读取失败'); });
  });

  var clear = body.querySelector('#ci-bg-clear');
  if (clear) clear.addEventListener('click', function () {
    settings[key] = '';
    saveData();
    if (isChat) applyAppearance();
    renderContactInfo(kind);
    toast('已清除背景');
  });
}

// ---------- 通话记录（供 inputbar 的 📹 按钮调用） ----------
function recordCall(contactId, kind, opts) {
  opts = opts || {};
  if (!contactId) return;
  if (!Array.isArray(callLogs[contactId])) callLogs[contactId] = [];
  callLogs[contactId].unshift({
    id: newId(),
    kind: kind || 'video',
    ts: Date.now(),
    duration: Number(opts.duration) || 0,
    missed: !!opts.missed
  });
  if (callLogs[contactId].length > 100) callLogs[contactId].length = 100;
  saveData();
}

// ---------- 空状态 ----------
function ciEmpty(ico, title, desc) {
  return '<div class="empty-state">' +
      '<div class="es-icon"><i class="fas ' + ico + '"></i></div>' +
      '<div class="es-title">' + escapeHtml(title) + '</div>' +
      (desc ? '<div class="es-desc">' + escapeHtml(desc) + '</div>' : '') +
    '</div>';
}

// ---------- 初始化 ----------
function initContactInfo() {
  var back = document.getElementById('btn-contactinfo-back');
  if (back) back.addEventListener('click', contactInfoBack);
}