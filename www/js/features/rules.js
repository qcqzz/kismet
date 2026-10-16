/* ============ 字卡传讯 · 设置页（排版参照 mochi：搜索 + 分组标签 + 图标行 + 二级子页） ============ */
/* 通用 = 主页资料/天气/外观/数据 · 聊天 = 回复设置·音效设置·首页梦角展示 · 字卡 = 基础库/专属库/拍一拍/收藏 */

var _settingsSub = null;      // null=主设置 / 'reply' / 'sfx' / 'card-*' / 'appearance' / 'ap-*'
var _poolSelContact = null;   // 专属字卡库当前梦角 id

// 字卡库（基础库 / 专属库）工具条与列表的模块级状态（重渲染后保留）
var _rlGroupFilter = null;    // null=全部 / '__ungrouped'=未分组 / 分组 id
var _rlSearch = '';           // 搜索词（实时过滤，重渲染后回填）
var _rlBatchMode = false;     // 批量管理模式
var _rlBatchSelected = [];    // 批量选中条目文本数组
var _rlLastKind = null;       // 上一次渲染的字卡库种类（base/pool），用于切换库时重置筛选
var RL_GROUP_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#6b7280'];

// ---------- 行生成器（mochi .set-row：图标 + 标题/副标题 + 开关/值/箭头） ----------
function sRow(o) {
  var right = '';
  if (o.toggle !== undefined) {
    right = '<label class="switch"><input type="checkbox" data-set="' + o.key + '"' +
      (o.toggle ? ' checked' : '') + '><span class="knob"></span></label>';
  } else if (o.arrow) {
    right = '<span class="row-arrow">›</span>';
  } else if (o.val !== undefined) {
    right = '<span class="row-val">' + escapeHtml(String(o.val)) + '</span><span class="row-arrow">›</span>';
  } else if (o.rightHtml) {
    right = o.rightHtml;
  }
  return '<div class="set-row"' + (o.act ? ' data-act="' + o.act + '"' : '') +
    (o.id ? ' id="' + o.id + '"' : '') + (o.hide ? ' style="display:none"' : '') + '>' +
    '<span class="row-ico">' + (o.ico || '<i class="fas fa-cog"></i>') + '</span>' +
    '<span class="row-txt"><span class="row-label">' + o.label + '</span>' +
      (o.sub ? '<span class="row-sub">' + o.sub + '</span>' : '') + '</span>' +
    right +
  '</div>';
}

function sGroup(title, rowsHtml) {
  return '<div class="set-group">' +
    (title ? '<div class="sg-lab">' + title + '</div>' : '') +
    '<div class="set-card">' + rowsHtml + '</div></div>';
}

// ---------- 用户资料卡（设置页顶部） ----------
function profileAvatarHtml() {
  var v = (homeProfile && homeProfile.avatar) ? String(homeProfile.avatar) : '🐧';
  if (/^(data:|https?:|blob:)/.test(v)) return '<img src="' + escapeHtml(v) + '" alt="">';
  return escapeHtml(v);
}

// 设置页顶部的资料卡（注意：函数名不能与 home.js 的 profileCardHtml 重名，
// 否则会互相覆盖——rules.js 后加载，会把主页顶部栏的卡片替换掉）
function settingsProfileCardHtml() {
  return '<div class="set-profile-card" id="set-profile-card">' +
    '<div class="spc-avatar" data-act="pAvatar">' + profileAvatarHtml() + '</div>' +
    '<div class="spc-main" data-act="pName">' +
      '<div class="spc-name">' + escapeHtml((homeProfile && homeProfile.name) || '我') + '</div>' +
      ((homeProfile && homeProfile.signature) ? '<div class="spc-sign">' + escapeHtml(homeProfile.signature) + '</div>' : '') +
      '<div class="spc-hint">点击头像 / 昵称即可修改</div>' +
    '</div>' +
    '<span class="spc-arrow"><i class="fas fa-chevron-right"></i></span>' +
  '</div>';
}

// ---------- 主设置页（微信式：资料卡 → 字卡库（下钻） → 通用 → 聊天 → 外观） ----------
function renderSettings(focusSection) {
  _settingsSub = null;
  var body = DOMElements.settingsBody;
  if (!body) return;

  // 快捷入口：直接下钻到「收藏的字卡」/「某梦角专属字卡库」（来自聊天信息面板）
  if (focusSection === 'favs') { renderCardFav(); return; }
  if ((focusSection || '').indexOf('pool:') === 0) {
    _poolSelContact = focusSection.slice(5);
    renderCardPool();
    return;
  }

  setSettingsHeader('设置');

  var favCount = 0;
  Object.keys(messagesByContact).forEach(function (cid) {
    (messagesByContact[cid] || []).forEach(function (m) { if (m.favorited) favCount++; });
  });

  body.innerHTML =
    // 顶部搜索（实时过滤设置行）
    '<div class="set-search"><input type="text" id="set-search-input" placeholder="搜索设置项（如 天气 / 字卡 / 音效）"></div>' +

    // 1) 用户资料卡
    '<div class="set-sec active" data-sec="profile">' +
      '<div class="set-group">' + settingsProfileCardHtml() + '</div>' +
    '</div>' +

    // 2) 字卡库（3 行下钻入口；拍一拍已并入字卡库内的分页）
    '<div class="set-sec active" data-sec="cards">' +
      sGroup('字卡库', [
        sRow({ ico: '<i class="fas fa-comment-dots"></i>', label: '基础字卡库', sub: _cardLibSummary(null), arrow: true, act: 'cardReply' }),
        sRow({ ico: '<i class="fas fa-user-group"></i>', label: '专属字卡库', sub: _cardLibSummary('pool'), arrow: true, act: 'cardPool' }),
        sRow({ ico: '<i class="fas fa-star"></i>', label: '收藏的字卡', sub: favCount + ' 条', arrow: true, act: 'cardFav' })
      ].join('')) +
    '</div>' +

    // 3) 通用设置
    '<div class="set-sec active" data-sec="basic">' +
      sGroup('通用设置', [
        sRow({ ico: '<i class="fas fa-comment"></i>', label: '个性签名', val: homeProfile.signature || '未填写', act: 'pSign' }),
        sRow({ ico: '<i class="fas fa-location-dot"></i>', label: '位置', val: homeProfile.location || '未设置', act: 'pLoc' }),
        sRow({ ico: '<i class="fas fa-smile"></i>', label: '状态', val: homeProfile.expression || '', act: 'pExpr' }),
        '<div class="set-row"><span class="row-ico"><i class="fas fa-cloud"></i></span>' +
          '<span class="row-txt"><span class="row-label">天气城市</span>' +
          '<span class="row-sub">' + (settings.weatherCity ? '当前：' + escapeHtml(settings.weatherCity) : '填城市名自动查询，如：上海') + '</span></span>' +
          '<input type="text" class="row-input" id="weather-city-input" value="' + escapeHtml(settings.weatherCity || '') + '" placeholder="城市名">' +
        '</div>',
        '<div class="set-row"><span class="row-ico"><i class="fas fa-sync"></i></span>' +
          '<span class="row-txt"><span class="row-label">天气刷新</span>' +
          '<span class="row-sub">' + (weatherNow ? escapeHtml(weatherNow.city + ' ' + weatherNow.temp + '° ' + weatherNow.desc) : '从未获取') + '</span></span>' +
          '<button class="row-btn" id="weather-refresh-btn">立即刷新</button>' +
        '</div>',
        sRow({ ico: '<i class="fas fa-upload"></i>', label: '导出数据', sub: '字卡库、梦角、群聊与设置备份为 JSON', arrow: true, act: 'exportData' }),
        sRow({ ico: '<i class="fas fa-download"></i>', label: '导入数据', sub: '从 JSON 备份恢复', arrow: true, act: 'importData' }),
        sRow({ ico: '<i class="fas fa-exclamation-triangle"></i>', label: '重置一切', sub: '恢复到出厂状态，不可恢复', arrow: true, act: 'resetAll' })
      ].join('')) +
    '</div>' +

    // 4) 聊天设置
    '<div class="set-sec active" data-sec="chat">' +
      sGroup('聊天设置', [
        sRow({ ico: '<i class="fas fa-sliders"></i>', label: '回复设置', sub: '功能与节奏：引用/已读/撤回/红包/速度/主动发送/拼接', arrow: true, act: 'openReply' }),
        sRow({ ico: '<i class="fas fa-volume-up"></i>', label: '音效设置', sub: '消息与拍一拍音效、音量、自定义音频', arrow: true, act: 'openSfx' }),
        sRow({ ico: '<i class="fas fa-user"></i>', label: '首页梦角展示', sub: '主页头像对与展示栏显示哪位梦角',
          val: homeContactDisplay(), act: 'homeDream' })
      ].join('')) +
    '</div>';

  bindSettingsEvents();
}

// ---------- 二级子页：基础字卡库（主字卡 / 表情包 / 拍一拍） ----------
function renderCardReply() {
  _settingsSub = 'card-reply';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('基础字卡库');
  var ctx = _rlCtx();
  _cardTab = _cardTab || 'main';
  var tab = _cardTab;

  var mainHtml =
    sGroup('基础字卡库 · 全员可用（' + replyPool.length + ' 条）',
      '<div class="kar-list" id="reply-list">' +
        _rlToolbarHtml(ctx) +
        replyListHtml() +
        '<div class="kar-add-row">' +
          '<input type="text" id="new-reply-input" placeholder="添加一条新字卡…">' +
          '<button id="add-reply-btn">添加</button>' +
        '</div>' +
      '</div>');

  var other = cardTabContent('base', tab, null);
  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +
    cardTabBar('base', tab) +
    (other || mainHtml);

  // 分页条任何时候都要能点；只有主字卡那一页才需要绑列表事件
  bindCardTabs(body, 'base', null, renderCardReply);
  if (!other) bindCardListEvents(body, renderCardReply);
}

// ---------- 二级子页：专属字卡库（梦角列表，联系人式排布） ----------
function renderCardPoolList() {
  _settingsSub = 'card-pool-list';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('专属字卡库');

  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  var listHtml;
  if (!singles.length) {
    listHtml = '<div class="empty-hint">先新建一位梦角，专属库分区会自动生成</div>';
  } else {
    listHtml = singles.map(function (c) {
      var pool = contactReplyPools[c.id] || [];
      var groups = poolGroups[c.id] || [];
      var disabled = disabledPoolReplies[c.id] || [];
      var stk = (contactStickers[c.id] || []).length;
      var voi = (voiceLibrary[c.id] || []).length;
      var pk = contactPokes[c.id] || {};
      var pkN = (pk.partner || []).length + (pk.mine || []).length;
      return '<div class="contact-row" data-pid="' + c.id + '">' +
        '<div class="contact-avatar">' + avatarHtml(c.avatar || ' ') + '</div>' +
        '<div class="contact-mid">' +
          '<div class="contact-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="contact-last">' + pool.length + ' 条字卡 · 表情包 ' + stk +
            ' · 语音条 ' + voi + ' · 拍一拍 ' + pkN +
            (groups.length ? ' · ' + groups.length + ' 个分组' : '') +
            (disabled.length ? ' · ' + disabled.length + ' 条已屏蔽' : '') + '</div>' +
        '</div>' +
        '<span class="row-arrow">›</span>' +
      '</div>';
    }).join('');
  }

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +
    sGroup('专属字卡库 · 单人可用（' + singles.length + ' 位梦角）', listHtml) +
    '<div class="pool-hint">每位梦角的专属字卡只对该梦角生效</div>';

  bindCardListEvents(body, renderCardPoolList);
}

// ---------- 三级子页：某位梦角的专属字卡库（排版同基础字卡库） ----------
function renderCardPool() {
  var body = DOMElements.settingsBody;
  if (!body) return;
  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  if (!singles.length) { toast('先新建一位梦角'); renderCardPoolList(); return; }
  if (!_poolSelContact || !singles.some(function (c) { return c.id === _poolSelContact; })) {
    _poolSelContact = (getHomeContact() && !isGroupContact(getHomeContact()))
      ? getHomeContact().id : singles[0].id;
  }
  _settingsSub = 'card-pool';
  var sel = memberById(_poolSelContact);
  setSettingsHeader(sel ? sel.name : '专属字卡库');
  _cardTab = _cardTab || 'main';
  var tab = _cardTab;

  var ctx = _rlCtx();
  var mainHtml =
    sGroup('「' + escapeHtml(sel ? sel.name : '') + '」专属（' + ctx.pool.length + ' 条）',
      '<div class="kar-list" id="pool-list">' +
        _rlToolbarHtml(ctx) +
        _rlListHtml(ctx) +
        '<div class="kar-add-row">' +
          '<input type="text" id="new-pool-input" placeholder="给这位梦角加一条字卡…">' +
          '<button id="add-pool-btn">添加</button>' +
        '</div>' +
      '</div>');

  var other = cardTabContent('pool', tab, _poolSelContact);
  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回专属字卡库</div>' +
    cardTabBar('pool', tab) +
    (other || mainHtml);

  bindCardTabs(body, 'pool', _poolSelContact, renderCardPool);
  if (!other) bindCardListEvents(body, renderCardPool);
}

// ---------- 二级子页：收藏的字卡 ----------
function renderCardFav() {
  _settingsSub = 'card-fav';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('收藏的字卡');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +
    sGroup('收藏的字卡', '<div class="kar-list" id="fav-list">' + favListHtml() + '</div>');

  bindCardListEvents(body, renderCardFav);
}

// 字卡库入口的副标题：把四个分页的规模都报出来
function _cardLibSummary(kind) {
  if (kind === 'pool') {
    var singles = contacts.filter(function (c) { return !isGroupContact(c); });
    var stk = 0, voi = 0, pk = 0;
    singles.forEach(function (c) {
      stk += (contactStickers[c.id] || []).length;
      voi += (voiceLibrary[c.id] || []).length;
      var rec = contactPokes[c.id] || {};
      pk += (rec.partner || []).length + (rec.mine || []).length;
    });
    return singles.length + ' 位梦角 · 表情包 ' + stk + ' · 语音条 ' + voi + ' · 拍一拍 ' + pk;
  }
  return replyPool.length + ' 条字卡 · 表情包 ' + stickerLibrary.length +
    ' · 拍一拍 ' + partnerPokes.length + '/' + myPokes.length;
}

function homeContactDisplay() {
  var hc = getHomeContact();
  return hc ? hc.name : '暂无梦角';
}

function setSettingsHeader(title, backIsSub) {
  var titleEl = document.getElementById('settings-title');
  if (titleEl) titleEl.textContent = title;
}

// ---------- 列表辅助（拍一拍/收藏） ----------
// 基础字卡库列表 HTML（委托给共用渲染器，上下文=基础库）
function replyListHtml() {
  return _rlListHtml(_rlCtx());
}

function favListHtml() {
  var favs = [];
  Object.keys(messagesByContact).forEach(function (cid) {
    (messagesByContact[cid] || []).forEach(function (m) {
      if (m.favorited) favs.push({ cid: cid, m: m });
    });
  });
  if (favs.length === 0) return '<div class="empty-hint">还没有收藏的字卡，点击消息 → 收藏</div>';
  return favs.map(function (item) {
    var c = contacts.find(function (cc) { return cc.id === item.cid; });
    return '<div class="fav-item">' +
      '<div class="fav-meta">' + escapeHtml(c ? c.name : '已删除') + ' · ' +
        (new Date(item.m.timestamp)).toLocaleDateString() + '</div>' +
      '<div class="fav-text">' + escapeHtml(item.m.text || '[图片]') + '</div>' +
      '<button class="fav-unfav" data-cid="' + item.cid + '" data-id="' + item.m.id + '">取消收藏</button>' +
    '</div>';
  }).join('');
}

/* ============ 字卡库：工具条 / 列表 / 分组 / 屏蔽 / 导入导出 ============ */

// 当前字卡库上下文：{ kind, contactId, pool, groups, disabled }
function _rlCtx() {
  var ctx;
  if (_settingsSub === 'card-pool') {
    var cid = _poolSelContact;
    if (!contactReplyPools[cid]) contactReplyPools[cid] = [];
    if (!poolGroups[cid]) poolGroups[cid] = [];
    if (!disabledPoolReplies[cid]) disabledPoolReplies[cid] = [];
    ctx = { kind: 'pool', contactId: cid, pool: contactReplyPools[cid], groups: poolGroups[cid], disabled: disabledPoolReplies[cid] };
  } else {
    if (!Array.isArray(replyGroups)) replyGroups = [];
    if (!Array.isArray(disabledReplies)) disabledReplies = [];
    ctx = { kind: 'base', contactId: null, pool: replyPool, groups: replyGroups, disabled: disabledReplies };
  }
  // 基础库与专属库共用一套筛选/批量状态：切到另一种库时重置，避免带着上个库的筛选结果
  if (_rlLastKind !== ctx.kind) {
    _rlLastKind = ctx.kind;
    _rlSearch = '';
    _rlGroupFilter = null;
    _rlBatchMode = false;
    _rlBatchSelected = [];
  }
  // 分组筛选若指向了当前库里不存在的分组（例如切换梦角后），自动回落为「全部」
  if (_rlGroupFilter && _rlGroupFilter !== '__ungrouped' &&
      !ctx.groups.some(function (g) { return g.id === _rlGroupFilter; })) {
    _rlGroupFilter = null;
  }
  return ctx;
}

function _rlPoolName() {
  var c = memberById(_poolSelContact);
  return c ? c.name : '梦角';
}

// 某条目所属分组（一个条目最多属于一个分组，取第一个命中）
function _rlItemGroup(ctx, item) {
  return ctx.groups.filter(function (g) { return (g.items || []).indexOf(item) !== -1; })[0] || null;
}

// 搜索 + 分组筛选叠加后的条目列表
function _rlFiltered(ctx) {
  var q = _rlSearch.trim().toLowerCase();
  var f = _rlGroupFilter;
  return ctx.pool.filter(function (t) {
    if (q && String(t).toLowerCase().indexOf(q) === -1) return false;
    if (f === null) return true;
    if (f === '__ungrouped') return !_rlItemGroup(ctx, t);
    var g = ctx.groups.filter(function (gg) { return gg.id === f; })[0];
    return g ? (g.items || []).indexOf(t) !== -1 : false;
  });
}

// 顶部工具条（搜索 + 分组筛选 + 按钮 + 批量操作条）
function _rlToolbarHtml(ctx) {
  var chips =
    '<button class="rl-chip' + (_rlGroupFilter === null ? ' active' : '') + '" data-gfilter="__all">全部</button>' +
    '<button class="rl-chip' + (_rlGroupFilter === '__ungrouped' ? ' active' : '') + '" data-gfilter="__ungrouped">未分组</button>';
  ctx.groups.forEach(function (g) {
    var active = _rlGroupFilter === g.id;
    chips += '<button class="rl-chip' + (active ? ' active' : '') + '" data-gfilter="' + escapeHtml(g.id) + '"' +
      (active ? ' style="border-color:' + g.color + ';color:' + g.color + ';"' : '') + '>' +
      '<span class="rl-dot" style="background:' + g.color + ';"></span>' + escapeHtml(g.name) + '</button>';
  });

  var batchBar = _rlBatchMode
    ? '<div class="rl-batch-bar">' +
        '<span class="rl-batch-count">已选 ' + _rlBatchSelected.length + ' 条</span>' +
        '<button class="rl-tool-btn danger" data-batch="disable"><i class="fas fa-eye-slash"></i> 批量屏蔽</button>' +
        '<button class="rl-tool-btn danger" data-batch="delete"><i class="fas fa-trash-alt"></i> 批量删除</button>' +
        '<button class="rl-tool-btn" data-batch="cancel">取消</button>' +
      '</div>'
    : '';

  return '<div class="rl-toolbar">' +
      '<div class="rl-search-row">' +
        '<i class="fas fa-search rl-search-ico"></i>' +
        '<input id="rl-search-input" type="text" placeholder="搜索字卡…" value="' + escapeHtml(_rlSearch) + '">' +
      '</div>' +
      '<div class="rl-group-chips" id="rl-group-chips">' + chips + '</div>' +
      '<div class="rl-btn-row">' +
        '<button class="rl-tool-btn' + (_rlBatchMode ? ' active' : '') + '" id="tb-batch-btn"><i class="fas fa-check-square"></i> ' + (_rlBatchMode ? '退出批量' : '批量管理') + '</button>' +
        '<button class="rl-tool-btn" id="tb-groups-btn"><i class="fas fa-folder"></i> 分组管理</button>' +
        '<button class="rl-tool-btn" id="tb-batch-import-btn"><i class="fas fa-layer-group"></i> 批量导入</button>' +
        '<button class="rl-tool-btn" id="tb-import-btn"><i class="fas fa-upload"></i> 导入文件</button>' +
        '<button class="rl-tool-btn" id="tb-export-btn"><i class="fas fa-download"></i> 导出</button>' +
      '</div>' +
      batchBar +
    '</div>';
}

// 列表 HTML（基础库 / 专属库共用）；#rl-list 容器固定，内容可单独刷新
function _rlListHtml(ctx) {
  return '<div class="rl-list" id="rl-list">' + _rlListInnerHtml(ctx) + '</div>';
}

function _rlListInnerHtml(ctx) {
  var items = _rlFiltered(ctx);
  if (!items.length) {
    return '<div class="empty-hint">' +
      (_rlSearch.trim() ? '没有匹配「' + escapeHtml(_rlSearch.trim()) + '」的字卡' : '这里还没有字卡，添加后即可抽取') +
      '</div>';
  }
  return items.map(function (t) { return _rlCardHtml(ctx, t); }).join('');
}

function _rlCardHtml(ctx, t) {
  var isDisabled = ctx.disabled.indexOf(t) !== -1;
  var selected = _rlBatchSelected.indexOf(t) !== -1;
  var g = _rlItemGroup(ctx, t);
  var badge = g
    ? '<span class="rl-group-badge" style="background:' + g.color + '22;color:' + g.color + ';border-color:' + g.color + '55;">' +
        '<span class="rl-dot" style="background:' + g.color + ';"></span>' + escapeHtml(g.name) + '</span>'
    : '';
  var check = _rlBatchMode
    ? '<span class="rl-batch-check' + (selected ? ' checked' : '') + '">' + (selected ? '<i class="fas fa-check"></i>' : '') + '</span>'
    : '';
  var actions = _rlBatchMode ? '' :
    '<div class="rl-card-actions">' +
      '<button class="rl-act-btn' + (isDisabled ? ' active' : '') + '" data-action="disable" title="' + (isDisabled ? '启用' : '屏蔽') + '"><i class="fas fa-' + (isDisabled ? 'eye' : 'eye-slash') + '"></i></button>' +
      '<button class="rl-act-btn" data-action="tag" title="分组"><i class="fas fa-tag"></i></button>' +
      '<button class="rl-act-btn" data-action="edit" title="编辑"><i class="fas fa-pen"></i></button>' +
      '<button class="rl-act-btn danger" data-action="delete" title="删除"><i class="fas fa-trash-alt"></i></button>' +
    '</div>';
  return '<div class="rl-card' + (selected ? ' rl-selected' : '') + '" data-item="' + escapeHtml(t) + '">' +
      check +
      '<div class="rl-text' + (isDisabled ? ' disabled' : '') + '">' + escapeHtml(t) + badge + '</div>' +
      actions +
    '</div>';
}

// 只重渲染列表内容（搜索实时过滤时用，避免输入框失焦、保留 #rl-list 事件监听）
function _rlRenderListOnly(body, ctx) {
  var list = body.querySelector('#rl-list');
  if (!list) return;
  list.innerHTML = _rlListInnerHtml(ctx);
}

// ---- 单条操作 ----
function _rlToggleDisable(item, ctx, rerender) {
  var i = ctx.disabled.indexOf(item);
  if (i === -1) { ctx.disabled.push(item); toast('已屏蔽（不会再被抽取）'); }
  else { ctx.disabled.splice(i, 1); toast('已启用'); }
  saveData(); rerender();
}

// 从池 / 所有分组 / 屏蔽列表里移除一个条目（池内只移除一份，避免重复项被误删）
function _rlDeleteItem(item, ctx) {
  var idx = ctx.pool.indexOf(item);
  if (idx !== -1) ctx.pool.splice(idx, 1);
  ctx.groups.forEach(function (g) {
    if (g.items) {
      for (var i = g.items.length - 1; i >= 0; i--) { if (g.items[i] === item) g.items.splice(i, 1); }
    }
  });
  for (var j = ctx.disabled.length - 1; j >= 0; j--) { if (ctx.disabled[j] === item) ctx.disabled.splice(j, 1); }
}

function _rlEditItem(item, ctx, rerender) {
  promptModal('编辑字卡', '', item, function (val) {
    if (!val || val === item) return;
    var idx = ctx.pool.indexOf(item);
    if (idx !== -1) ctx.pool[idx] = val;
    ctx.groups.forEach(function (g) {
      if (g.items) g.items = g.items.map(function (t) { return t === item ? val : t; });
    });
    var di = ctx.disabled.indexOf(item);
    if (di !== -1) ctx.disabled[di] = val;
    saveData(); rerender();
  });
}

function _rlOpenItemGroupPicker(item, ctx, rerender) {
  if (!ctx.groups.length) {
    confirmModal('还没有分组', '是否立即创建一个分组？', function () { _rlShowGroupEditor(ctx, rerender); });
    return;
  }
  var current = _rlItemGroup(ctx, item);
  var items = [{ label: (current ? '　' : '✓ ') + '未分组', act: 'grp_none' }];
  ctx.groups.forEach(function (g) {
    items.push({ label: (current && current.id === g.id ? '✓ ' : '　') + escapeHtml(g.name), act: 'grp_' + g.id });
  });
  items.push({ label: '取消', act: 'cancel', cancel: true });
  showSheet('选择分组', items, function (act) {
    if (act === 'cancel') return;
    ctx.groups.forEach(function (g) {
      if (g.items) g.items = g.items.filter(function (t) { return t !== item; });
    });
    if (act !== 'grp_none' && act.indexOf('grp_') === 0) {
      var gid = act.slice(4);
      var g = ctx.groups.filter(function (gg) { return String(gg.id) === String(gid); })[0];
      if (g) { if (!g.items) g.items = []; g.items.push(item); }
    }
    saveData(); rerender();
    toast('已更新分组');
  });
}

// ---- 分组管理 ----
function _rlShowGroupManager(ctx, rerender) {
  var items = ctx.groups.map(function (g) {
    return {
      label: '<span class="rl-dot" style="background:' + g.color + ';"></span> ' + escapeHtml(g.name) +
        '（' + (g.items ? g.items.length : 0) + '）',
      act: 'g_' + ctx.groups.indexOf(g)
    };
  });
  if (!items.length) items.push({ label: '还没有分组', act: 'noop' });
  items.push({ label: '＋ 新建分组', act: 'g_add' });
  items.push({ label: '取消', act: 'cancel', cancel: true });
  showSheet('分组管理', items, function (act) {
    if (act === 'cancel' || act === 'noop') return;
    if (act === 'g_add') { _rlShowGroupEditor(ctx, rerender); return; }
    if (act.indexOf('g_') === 0) {
      var g = ctx.groups[parseInt(act.slice(2), 10)];
      if (g) _rlGroupEditorSheet(g, ctx, rerender);
    }
  });
}

function _rlGroupEditorSheet(group, ctx, rerender) {
  showSheet(group.name, [
    { label: '重命名', act: 'rename' },
    { label: '更改颜色', act: 'color' },
    { label: '删除分组', act: 'delete', danger: true },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act === 'rename') {
      promptModal('重命名分组', '', group.name, function (v) {
        group.name = v; saveData(); rerender(); toast('已重命名');
      });
    } else if (act === 'color') {
      _rlPickGroupColor(group, ctx, rerender);
    } else if (act === 'delete') {
      confirmModal('删除分组', '删除「' + group.name + '」？只会解散分组，不会删除字卡。', function () {
        var i = ctx.groups.indexOf(group);
        if (i !== -1) ctx.groups.splice(i, 1);
        if (_rlGroupFilter === group.id) _rlGroupFilter = null;
        saveData(); rerender(); toast('分组已删除');
      }, { danger: true });
    }
  });
}

function _rlPickGroupColor(group, ctx, rerender) {
  var items = RL_GROUP_COLORS.map(function (c) {
    return { label: (group.color === c ? '✓ ' : '　') + '<span class="rl-dot" style="background:' + c + ';"></span> ' + c, act: 'c_' + c.slice(1) };
  });
  items.push({ label: '取消', act: 'cancel', cancel: true });
  showSheet('选择颜色', items, function (act) {
    if (act === 'cancel') return;
    group.color = '#' + act.slice(2);
    saveData(); rerender(); toast('颜色已更新');
  });
}

function _rlShowGroupEditor(ctx, rerender) {
  promptModal('新建分组', '分组名', '', function (name) {
    var color = RL_GROUP_COLORS[Math.floor(Math.random() * RL_GROUP_COLORS.length)];
    ctx.groups.push({ id: 'rg-' + Date.now(), name: name, color: color, items: [] });
    saveData(); rerender(); toast('分组已创建');
  });
}

// ---- 文件导入 ----
function _rlImportJson(data, ctx) {
  var added = 0;
  var replies = Array.isArray(data) ? data
    : (data && typeof data === 'object' && Array.isArray(data.replies) ? data.replies : []);
  if (data && typeof data === 'object' && Array.isArray(data.groups)) {
    data.groups.forEach(function (g) {
      if (!g || typeof g !== 'object' || !g.name) return;
      var exist = ctx.groups.filter(function (gg) { return gg.name === g.name; })[0];
      if (!exist) {
        exist = { id: g.id || ('rg-' + Date.now() + '-' + Math.floor(Math.random() * 1000)), name: g.name, color: g.color || RL_GROUP_COLORS[0], items: [] };
        ctx.groups.push(exist);
      }
      (Array.isArray(g.items) ? g.items : []).forEach(function (it) {
        if (typeof it === 'string' && it.trim() && exist.items.indexOf(it) === -1) exist.items.push(it);
      });
    });
  }
  replies.forEach(function (r) {
    if (typeof r !== 'string') return;
    var t = r.trim();
    if (t) { ctx.pool.push(t); added++; }
  });
  // 分组里出现、但不在池中的字卡也补进池，保证可抽取
  ctx.groups.forEach(function (g) {
    (g.items || []).forEach(function (it) { if (ctx.pool.indexOf(it) === -1) { ctx.pool.push(it); added++; } });
  });
  return added;
}

function _rlImportFile(ctx, rerender) {
  var input = document.createElement('input');
  input.type = 'file';
  input.id = 'rl-file-input';
  input.accept = '.txt,.json,text/plain,application/json';
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    var isJson = /\.json$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var added = 0;
        if (isJson) {
          added = _rlImportJson(JSON.parse(reader.result), ctx);
        } else {
          String(reader.result || '').split(/\r?\n/).forEach(function (line) {
            var t = line.trim();
            if (t) { ctx.pool.push(t); added++; }
          });
        }
        saveData(); rerender();
        toast('已导入 ' + added + ' 条');
      } catch (e) {
        toast('文件解析失败');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ---- 导出 ----
function _rlExport(ctx) {
  var data = {
    app: 'zikka-chuanxun',
    version: VERSION,
    type: 'reply-library',
    exportedAt: new Date().toISOString(),
    replies: ctx.pool.slice(),
    groups: ctx.groups.map(function (g) {
      return { id: g.id, name: g.name, color: g.color, items: (g.items || []).slice() };
    })
  };
  var d = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var stamp = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  var fname = ctx.kind === 'pool'
    ? ('专属字卡库-' + _rlPoolName() + '-' + stamp + '.json')
    : ('字卡库-' + stamp + '.json');
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('已导出 ' + ctx.pool.length + ' 条');
}

// ---- 工具条 + 列表事件绑定（基础库 / 专属库共用） ----
function _rlBindListEvents(body, rerender, ctx) {
  ctx = ctx || _rlCtx();

  var search = body.querySelector('#rl-search-input');
  if (search) {
    search.addEventListener('input', function () {
      _rlSearch = search.value;
      _rlRenderListOnly(body, ctx);
    });
  }

  var chips = body.querySelector('#rl-group-chips');
  if (chips) {
    chips.addEventListener('click', function (e) {
      var chip = e.target.closest('.rl-chip');
      if (!chip) return;
      var f = chip.dataset.gfilter;
      _rlGroupFilter = f === '__all' ? null : f;
      rerender();
    });
  }

  var groupsBtn = body.querySelector('#tb-groups-btn');
  if (groupsBtn) groupsBtn.addEventListener('click', function () { _rlShowGroupManager(ctx, rerender); });

  var exportBtn = body.querySelector('#tb-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', function () { _rlExport(ctx); });

  var importBtn = body.querySelector('#tb-import-btn');
  if (importBtn) importBtn.addEventListener('click', function () { _rlImportFile(ctx, rerender); });

  var batchImportBtn = body.querySelector('#tb-batch-import-btn');
  if (batchImportBtn) {
    batchImportBtn.addEventListener('click', function () {
      var title = ctx.kind === 'pool' ? ('批量导入 · ' + _rlPoolName() + ' 的专属库') : '批量导入字卡库';
      batchImportModal(title, '', function (lines) {
        lines.forEach(function (l) { ctx.pool.push(l); });
        saveData(); rerender();
        toast('已导入 ' + lines.length + ' 条');
      });
    });
  }

  var batchBtn = body.querySelector('#tb-batch-btn');
  if (batchBtn) {
    batchBtn.addEventListener('click', function () {
      _rlBatchMode = !_rlBatchMode;
      _rlBatchSelected = [];
      rerender();
    });
  }

  body.querySelectorAll('[data-batch]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var act = btn.dataset.batch;
      if (act === 'cancel') { _rlBatchMode = false; _rlBatchSelected = []; rerender(); return; }
      if (!_rlBatchSelected.length) { toast('请先选择字卡'); return; }
      if (act === 'disable') {
        var allDisabled = _rlBatchSelected.every(function (t) { return ctx.disabled.indexOf(t) !== -1; });
        _rlBatchSelected.forEach(function (t) {
          var i = ctx.disabled.indexOf(t);
          if (allDisabled) { if (i !== -1) ctx.disabled.splice(i, 1); }
          else if (i === -1) ctx.disabled.push(t);
        });
        toast(allDisabled ? '已启用 ' + _rlBatchSelected.length + ' 条' : '已屏蔽 ' + _rlBatchSelected.length + ' 条');
        saveData(); rerender();
      } else if (act === 'delete') {
        confirmModal('批量删除', '确定删除选中的 ' + _rlBatchSelected.length + ' 条字卡？', function () {
          var sel = _rlBatchSelected.slice();
          sel.forEach(function (t) { _rlDeleteItem(t, ctx); });
          _rlBatchSelected = [];
          _rlBatchMode = false;
          saveData(); rerender();
        }, { danger: true });
      }
    });
  });

  var list = body.querySelector('#rl-list');
  if (list) {
    list.addEventListener('click', function (e) {
      var card = e.target.closest('.rl-card');
      if (!card) return;
      var item = card.dataset.item;
      if (_rlBatchMode) {
        var i = _rlBatchSelected.indexOf(item);
        if (i === -1) _rlBatchSelected.push(item); else _rlBatchSelected.splice(i, 1);
        rerender();
        return;
      }
      var btn = e.target.closest('.rl-act-btn');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'disable') _rlToggleDisable(item, ctx, rerender);
      else if (action === 'delete') { _rlDeleteItem(item, ctx); saveData(); rerender(); }
      else if (action === 'edit') _rlEditItem(item, ctx, rerender);
      else if (action === 'tag') _rlOpenItemGroupPicker(item, ctx, rerender);
    });
  }
}

// ---------- 二级子页：回复设置（chat 功能 + 节奏，去除真实语音） ----------
function renderReplySettings() {
  _settingsSub = 'reply';
  var body = DOMElements.settingsBody;
  setSettingsHeader('回复设置');

  var tsBtns = TIMESTAMP_FORMATS.map(function (f) {
    return '<button class="ts-btn' + (settings.timestampFormat === f.v ? ' active' : '') +
      '" data-fmt="' + f.v + '">' + f.label + '</button>';
  }).join('');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +

    sGroup('消息交互', [
      sRow({ ico: '<i class="fas fa-reply"></i>', label: '引用回复', sub: '长按/点消息可引用回复', toggle: settings.quoteReplyEnabled, key: 'quoteReplyEnabled' }),
      sRow({ ico: '<i class="fas fa-check"></i>', label: '已读回执', toggle: settings.readReceiptEnabled, key: 'readReceiptEnabled' }),
      '<div class="set-row sub-row"><span class="row-ico"><i class="fas fa-palette"></i></span>' +
        '<span class="row-txt"><span class="row-label">已读样式</span></span>' +
        '<span class="seg">' +
          '<button class="seg-btn' + (settings.readReceiptStyle === 'icon' ? ' active' : '') + '" data-rr="icon"><i class="fas fa-check-double"></i> 图形</button>' +
          '<button class="seg-btn' + (settings.readReceiptStyle === 'text' ? ' active' : '') + '" data-rr="text">文字</button>' +
        '</span></div>',
      sRow({ ico: '<i class="fas fa-eye-slash"></i>', label: '已读不回', sub: '当前 ' + Math.round((settings.readNoReplyChance || 0) * 100) + '% 概率只已读不回复',
        rightHtml: '<input type="number" class="row-num" id="readNoReply-input" min="0" max="100" value="' +
          Math.round((settings.readNoReplyChance || 0) * 100) + '"><span class="row-unit">%</span>' }),
      sRow({ ico: '<i class="fas fa-keyboard"></i>', label: '正在输入', sub: '回复前显示微信式「对方正在输入」', toggle: settings.typingIndicatorEnabled, key: 'typingIndicatorEnabled' }),
      sRow({ ico: '<i class="fas fa-reply"></i>', label: '梦角撤回消息', sub: '偶尔撤回刚发的消息', toggle: settings.partnerRecallEnabled, key: 'partnerRecallEnabled' }),
      sRow({ ico: '<i class="fas fa-hand-paper"></i>', label: '拍一拍', sub: '偶尔触发拍一拍', toggle: settings.pokeEnabled, key: 'pokeEnabled' }),
      sRow({ ico: '<i class="fas fa-moon"></i>', label: '状态变化', sub: '梦角的状态偶尔自动变化', toggle: settings.statusChangeEnabled, key: 'statusChangeEnabled' }),
      sRow({ ico: '<i class="fas fa-gift"></i>', label: '梦角主动发红包', sub: '开启后偶尔给你发红包，点气泡拆开', toggle: settings.redPacketEnabled, key: 'redPacketEnabled' })
    ].join('')) +

    sGroup('时间戳', '<div class="ts-grid">' + tsBtns + '</div>') +

    sGroup('回复速度', [
      '<div class="set-row slider-row"><span class="row-ico"><i class="fas fa-bolt"></i></span>' +
        '<span class="row-txt"><span class="row-label">最短等待</span></span>' +
        '<input type="range" min="1000" max="30000" step="500" value="' + settings.replyDelayMin + '" id="dly-min">' +
        '<span class="slider-val" id="dly-min-val">' + (settings.replyDelayMin / 1000).toFixed(1) + 's</span></div>',
      '<div class="set-row slider-row"><span class="row-ico"><i class="fas fa-tachometer-alt"></i></span>' +
        '<span class="row-txt"><span class="row-label">最长等待</span></span>' +
        '<input type="range" min="1000" max="60000" step="500" value="' + settings.replyDelayMax + '" id="dly-max">' +
        '<span class="slider-val" id="dly-max-val">' + (settings.replyDelayMax / 1000).toFixed(1) + 's</span></div>'
    ].join('')) +

    sGroup('主动发送', [
      sRow({ ico: '<i class="fas fa-envelope"></i>', label: '主动发消息给我', sub: '开启后梦角按间隔主动找你', toggle: settings.autoSendEnabled, key: 'autoSendEnabled' }),
      '<div class="set-row slider-row" id="auto-send-row"' + (settings.autoSendEnabled ? '' : ' style="display:none"') + '>' +
        '<span class="row-ico"><i class="fas fa-clock"></i></span>' +
        '<span class="row-txt"><span class="row-label">间隔</span></span>' +
        '<input type="range" min="1" max="180" step="1" value="' + settings.autoSendInterval + '" id="auto-send-slider">' +
        '<span class="slider-val" id="auto-send-val">' + settings.autoSendInterval + '分钟</span></div>'
    ].join('')) +

    sGroup('消息节奏', [
      sRow({ ico: '<i class="fas fa-smile"></i>', label: '表情混入消息', sub: '开启后表情与文字同条发送', toggle: settings.emojiMixEnabled, key: 'emojiMixEnabled' }),
      sRow({ ico: '<i class="fas fa-clone"></i>', label: '回复拼接字卡', sub: '开启后单条消息有概率拼接多张字卡', toggle: settings.combineCardsEnabled, key: 'combineCardsEnabled' }),
      '<div class="set-row slider-row" id="combine-row"' + (settings.combineCardsEnabled ? '' : ' style="display:none"') + '>' +
        '<span class="row-ico"><i class="fas fa-hashtag"></i></span>' +
        '<span class="row-txt"><span class="row-label">最多拼接</span></span>' +
        '<input type="range" min="2" max="5" step="1" value="' + settings.combineCardsMax + '" id="combine-slider">' +
        '<span class="slider-val" id="combine-val">' + settings.combineCardsMax + '句</span></div>'
    ].join('')) +

    sGroup('后台运行', [
      sRow({ ico: '<i class="fas fa-bell"></i>', label: '后台消息推送', sub: '页面在后台时收到消息弹系统通知', toggle: settings.bgNotifyEnabled, key: 'bgNotifyEnabled' })
    ].join(''));

  bindReplySettingsEvents();
}

// ---------- 二级子页：音效设置（chat 音效同款） ----------
function renderSfxSettings() {
  _settingsSub = 'sfx';
  var body = DOMElements.settingsBody;
  setSettingsHeader('音效设置');

  var cats = [
    { key: 'mySend', label: '我发出的消息音效', cat: 'my_send' },
    { key: 'partnerMessage', label: '梦角发来的消息音效', cat: 'partner_message' },
    { key: 'myPoke', label: '我拍一拍音效', cat: 'my_poke' },
    { key: 'partnerPoke', label: '梦角拍一拍音效', cat: 'partner_poke' }
  ];

  var cardsHtml = cats.map(function (c) {
    var preset = settings[c.key + 'SoundPreset'] || 'tone_low';
    var customUrl = settings[c.key + 'CustomSoundUrl'] || '';
    var opts = SFX_PRESETS.map(function (p) {
      return '<option value="' + p.v + '"' + (preset === p.v ? ' selected' : '') + '>' + p.label + '</option>';
    }).join('');
    var status = preset === 'mute' ? '已关闭' : (customUrl ? '自定义音频' : (preset === 'kakaotalk' ? 'kakaotalk' : '内置'));
    return '<div class="sfx-card">' +
      '<div class="sfx-head"><span class="sfx-ico"><i class="fas fa-volume-up"></i></span>' +
        '<span class="sfx-name">' + c.label + '</span>' +
        '<span class="sfx-status">' + status + '</span></div>' +
      '<div class="sfx-body">' +
        '<div class="sfx-row">' +
          '<select class="sfx-select" data-sfx="' + c.key + '">' + opts + '</select>' +
          '<button class="sfx-test" data-sfxt="' + c.cat + '">▶ 试听</button>' +
        '</div>' +
        '<div class="sfx-row">' +
          '<input type="text" class="sfx-url" data-sfxu="' + c.key + '" value="' + escapeHtml(customUrl) +
            '" placeholder="自定义URL（留空用内置预设）">' +
          '<button class="sfx-upload" data-sfxup="' + c.key + '" title="上传本地音频"><i class="fas fa-upload"></i></button>' +
        '</div>' +
        (customUrl ? '<button class="sfx-clear" data-sfxclr="' + c.key + '">清除自定义音频</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +
    sGroup('消息音效', [
      sRow({ ico: '<i class="fas fa-volume-up"></i>', label: '开启音效', toggle: settings.soundEnabled, key: 'soundEnabled' }),
      '<div class="set-row slider-row"><span class="row-ico"><i class="fas fa-volume-down"></i></span>' +
        '<span class="row-txt"><span class="row-label">音量</span></span>' +
        '<input type="range" min="0" max="100" step="5" value="' + Math.round((settings.soundVolume || 0) * 100) + '" id="sfx-volume">' +
        '<span class="slider-val" id="sfx-volume-val">' + Math.round((settings.soundVolume || 0) * 100) + '%</span></div>'
    ].join('')) +
    '<div class="sfx-list">' + cardsHtml + '</div>' +
    '<div class="set-note">预设为内置合成音；「kakaotalk」与自定义URL/上传的音频在下一次触发时生效。' +
    'iOS 需先点一下页面才能出声。</div>';

  bindSfxSettingsEvents();
}

// ---------- 事件 ----------
function bindSettingsEvents() {
  var body = DOMElements.settingsBody;

  // 搜索过滤（跨分组显示匹配行）
  var search = body.querySelector('#set-search-input');
  if (search) {
    search.addEventListener('input', function () { filterSettingsRows(search.value.trim()); });
  }

  // 通用 · 主页资料编辑
  body.querySelectorAll('[data-act]').forEach(function (el) {
    el.addEventListener('click', function () {
      var act = el.dataset.act;
      if (act === 'pName') {
        promptModal('昵称', '', homeProfile.name, function (v) { homeProfile.name = v; saveData(); renderSettings(); renderHome(); });
      } else if (act === 'pAvatar') {
        pickMyAvatar(function () { renderSettings(); renderHome(); });
      } else if (act === 'pSign') {
        confirmModal('个性签名', '一句话介绍自己（留空清空）', function (v) {
          homeProfile.signature = (v || '').trim(); saveData(); renderSettings(); renderHome();
        }, { input: homeProfile.signature || '' });
      } else if (act === 'pLoc') {
        promptModal('位置', '如：维多利亚港', homeProfile.location || '', function (v) { homeProfile.location = v; saveData(); renderSettings(); renderHome(); });
      } else if (act === 'pExpr') {
        promptModal('状态', '', homeProfile.expression || '', function (v) { homeProfile.expression = v; saveData(); renderSettings(); renderHome(); });
      } else if (act === 'openReply') {
        renderReplySettings();
      } else if (act === 'openSfx') {
        renderSfxSettings();
      } else if (act === 'cardReply') {
        _cardTab = 'main';
        renderCardReply();
      } else if (act === 'cardPool') {
        _cardTab = 'main';
        renderCardPoolList();
      } else if (act === 'cardFav') {
        renderCardFav();
      } else if (act === 'homeDream') {
        openHomeDreamPicker();
      } else if (act === 'exportData') exportData();
      else if (act === 'importData') importData();
      else if (act === 'resetAll') {
        confirmModal('重置一切', '将删除全部数据（梦角/群聊/消息/字卡/设置）。确定吗？', function () {
          Object.keys(localStorage).forEach(function (k) {
            if (k.indexOf(APP_PREFIX) === 0) localStorage.removeItem(k);
          });
          location.reload();
        }, { danger: true });
      }
    });
  });

  // 通用 · 天气
  var cityInput = body.querySelector('#weather-city-input');
  if (cityInput) {
    cityInput.addEventListener('change', function () {
      settings.weatherCity = cityInput.value.trim();
      saveData();
      if (settings.weatherCity) refreshWeather(true);
      renderHome();
    });
  }
  var wxBtn = body.querySelector('#weather-refresh-btn');
  if (wxBtn) wxBtn.addEventListener('click', function () { refreshWeather(true); });

  bindCardListEvents(body, renderSettings);
}

// 卡片列表类事件（基础库 / 专属库 / 拍一拍 / 收藏）；rerender 为「当前页重渲染」回调
function bindCardListEvents(body, rerender) {
  rerender = rerender || renderSettings;

  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { settingsBack(); });

  // 专属字卡库的梦角列表（联系人式排布）：点某位梦角进入其专属字卡库
  Array.prototype.forEach.call(body.querySelectorAll('.contact-row[data-pid]'), function (row) {
    row.addEventListener('click', function () {
      _poolSelContact = row.getAttribute('data-pid');
      renderCardPool();
    });
  });

  bindPoolListEvents(body, rerender);

  // 语料增删（基础库）
  var addReplyBtn = body.querySelector('#add-reply-btn');
  if (addReplyBtn) {
    addReplyBtn.addEventListener('click', function () {
      var input = body.querySelector('#new-reply-input');
      var val = input.value.trim();
      if (!val) return;
      replyPool.push(val);
      saveData();
      rerender();
      toast('已添加');
    });
  }
  // 字卡库工具条 + 列表（基础库 / 专属库共用）
  _rlBindListEvents(body, rerender);

  // 收藏取消
  var favList = body.querySelector('#fav-list');
  if (favList) {
    favList.addEventListener('click', function (e) {
      var btn = e.target.closest('.fav-unfav');
      if (!btn) return;
      var cid = btn.dataset.cid, mid = Number(btn.dataset.id);
      var msg = (messagesByContact[cid] || []).find(function (m) { return m.id === mid; });
      if (msg) { msg.favorited = false; saveData(); }
      rerender();
      if (activeContactId) renderAllMessages();
    });
  }
}

// 专属库手动添加一条的事件；rerender 为「当前页重渲染」回调
function bindPoolListEvents(body, rerender) {
  rerender = rerender || renderSettings;

  var addBtn = body.querySelector('#add-pool-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var input = body.querySelector('#new-pool-input');
      var val = input.value.trim();
      if (!val) return;
      if (!contactReplyPools[_poolSelContact]) contactReplyPools[_poolSelContact] = [];
      contactReplyPools[_poolSelContact].push(val);
      saveData();
      rerender();
      toast('已添加到专属库');
    });
  }
}

// 批量导入弹窗（每行一条）
function batchImportModal(title, prefill, onOk) {
  confirmModal(title, '每行一条字卡', function (v) {
    var lines = String(v || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) { toast('没有可导入的内容'); return; }
    onOk(lines);
  }, { textarea: prefill || '' });
}

// 首页梦角展示选择
function openHomeDreamPicker() {
  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  if (!singles.length) { toast('先新建一位梦角'); return; }
  var items = singles.map(function (c) {
    return { label: (c.id === settings.homeContactId ? '✓ ' : '　') + avatarText(c.avatar, ' ') + ' ' + c.name, act: 'hc_' + c.id };
  });
  items.push({ label: '取消', act: 'cancel', cancel: true });
  showSheet('首页梦角展示', items, function (act) {
    if (act.indexOf('hc_') !== 0) return;
    settings.homeContactId = act.slice(3);
    saveData();
    _resetDreamSign();
    renderSettings();
    renderHome();
    toast('已切换首页梦角');
  });
}

// 搜索过滤
function filterSettingsRows(kw) {
  var body = DOMElements.settingsBody;
  var lower = kw.toLowerCase();
  body.querySelectorAll('.set-sec').forEach(function (sec) {
    var anyVisible = false;
    sec.querySelectorAll('.set-group').forEach(function (grp) {
      var grpVisible = false;
      grp.querySelectorAll('.set-row').forEach(function (row) {
        var hit = !lower || row.textContent.toLowerCase().indexOf(lower) !== -1;
        row.style.display = hit ? '' : 'none';
        if (hit) grpVisible = true;
      });
      // 字卡列表类分组：标题命中即显示整组
      if (!grp.querySelectorAll('.set-row').length && lower) {
        var titleHit = (grp.textContent || '').toLowerCase().indexOf(lower) !== -1;
        grpVisible = titleHit;
      } else if (!lower) {
        grpVisible = true;
      }
      grp.style.display = grpVisible ? '' : 'none';
      if (grpVisible) anyVisible = true;
    });
    sec.style.display = anyVisible ? 'block' : 'none';
  });
}

// 子页与回复/音效的事件
function bindReplySettingsEvents() {
  var body = DOMElements.settingsBody;
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderSettings(); });

  body.querySelectorAll('[data-set]').forEach(function (el) {
    var key = el.dataset.set;
    el.addEventListener('change', function () {
      if (key === 'autoSendEnabled') {
        settings.autoSendEnabled = el.checked;
        var row = body.querySelector('#auto-send-row');
        if (row) row.style.display = el.checked ? '' : 'none';
        if (typeof startAutoSend === 'function') startAutoSend();
      } else if (key === 'combineCardsEnabled') {
        settings.combineCardsEnabled = el.checked;
        var crow = body.querySelector('#combine-row');
        if (crow) crow.style.display = el.checked ? '' : 'none';
      } else if (key === 'bgNotifyEnabled') {
        if (el.checked && 'Notification' in window && Notification.permission !== 'granted') {
          Notification.requestPermission().then(function (p) {
            if (p !== 'granted') {
              settings.bgNotifyEnabled = false;
              el.checked = false;
              toast('未获得通知权限');
            }
            saveData();
          });
        }
        settings.bgNotifyEnabled = el.checked;
      } else {
        settings[key] = el.checked;
      }
      saveData();
    });
  });

  // 已读样式
  body.querySelectorAll('[data-rr]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      settings.readReceiptStyle = btn.dataset.rr;
      saveData();
      body.querySelectorAll('[data-rr]').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      if (activeContactId) renderAllMessages();
    });
  });

  // 已读不回概率
  var nr = body.querySelector('#readNoReply-input');
  if (nr) {
    nr.addEventListener('change', function () {
      var v = Math.max(0, Math.min(100, Number(nr.value) || 0));
      nr.value = v;
      settings.readNoReplyChance = v / 100;
      saveData();
    });
  }

  // 时间戳格式
  body.querySelectorAll('.ts-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      settings.timestampFormat = btn.dataset.fmt;
      saveData();
      body.querySelectorAll('.ts-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      if (activeContactId) renderAllMessages();
    });
  });

  // 回复速度滑条
  var dMin = body.querySelector('#dly-min'), dMax = body.querySelector('#dly-max');
  if (dMin && dMax) {
    var syncDelay = function (changed) {
      var mn = Number(dMin.value), mx = Number(dMax.value);
      if (mn > mx) {
        if (changed === 'min') { mx = mn; dMax.value = mx; }
        else { mn = mx; dMin.value = mn; }
      }
      settings.replyDelayMin = mn;
      settings.replyDelayMax = mx;
      body.querySelector('#dly-min-val').textContent = (mn / 1000).toFixed(1) + 's';
      body.querySelector('#dly-max-val').textContent = (mx / 1000).toFixed(1) + 's';
      saveData();
    };
    dMin.addEventListener('input', function () { syncDelay('min'); });
    dMax.addEventListener('input', function () { syncDelay('max'); });
  }

  // 主动发送间隔
  var as = body.querySelector('#auto-send-slider');
  if (as) {
    as.addEventListener('input', function () {
      settings.autoSendInterval = Number(as.value);
      body.querySelector('#auto-send-val').textContent = as.value + '分钟';
      saveData();
      if (typeof startAutoSend === 'function') startAutoSend();
    });
  }

  // 拼接最多句数
  var cs = body.querySelector('#combine-slider');
  if (cs) {
    cs.addEventListener('input', function () {
      settings.combineCardsMax = Number(cs.value);
      body.querySelector('#combine-val').textContent = cs.value + '句';
      saveData();
    });
  }
}

function bindSfxSettingsEvents() {
  var body = DOMElements.settingsBody;
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderSettings(); });

  // 总开关
  body.querySelectorAll('[data-set]').forEach(function (el) {
    if (el.dataset.set !== 'soundEnabled') return;
    el.addEventListener('change', function () {
      settings.soundEnabled = el.checked;
      saveData();
      if (el.checked) playSound('partner_message', true);
    });
  });

  // 音量
  var vol = body.querySelector('#sfx-volume');
  if (vol) {
    vol.addEventListener('input', function () {
      settings.soundVolume = Number(vol.value) / 100;
      body.querySelector('#sfx-volume-val').textContent = vol.value + '%';
      saveData();
    });
    vol.addEventListener('change', function () { playSound('partner_message', true); });
  }

  // 每类：预设
  body.querySelectorAll('[data-sfx]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      settings[sel.dataset.sfx + 'SoundPreset'] = sel.value;
      saveData();
      renderSfxSettings();
      toast('已保存');
    });
  });

  // 试听（忽略总开关）
  body.querySelectorAll('[data-sfxt]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cat = btn.dataset.sfxt;
      var key = { my_send: 'mySend', partner_message: 'partnerMessage', my_poke: 'myPoke', partner_poke: 'partnerPoke' }[cat];
      previewSound(cat, settings[key + 'SoundPreset'], settings[key + 'CustomSoundUrl']);
    });
  });

  // 自定义 URL
  body.querySelectorAll('[data-sfxu]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      settings[inp.dataset.sfxu + 'CustomSoundUrl'] = inp.value.trim();
      saveData();
      renderSfxSettings();
    });
  });

  // 上传本地音频 → dataURL 存本地
  body.querySelectorAll('[data-sfxup]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.sfxup;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = function () {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) { toast('音频请小于 1MB（存本地会占空间）'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          settings[key + 'CustomSoundUrl'] = reader.result;
          settings[key + 'SoundPreset'] = 'tone_default'; // 让自定义音频优先生效
          saveData();
          renderSfxSettings();
          toast('已上传，点试听看看');
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });
  });

  // 清除自定义音频
  body.querySelectorAll('[data-sfxclr]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      settings[btn.dataset.sfxclr + 'CustomSoundUrl'] = '';
      saveData();
      renderSfxSettings();
    });
  });
}

// 设置页返回（分级返回：三级页 → 二级页 → 主设置 → 主页）
function settingsBack() {
  if (_settingsSub === 'card-pool') { renderCardPoolList(); return; }
  // 从梦角资料页跳进来的：再往上一级就直接回梦角资料页的「聊天设置」，
  // 不停在设置主页面，做到"从哪进从哪出"
  if (_settingsReturnView === 'contactinfo') {
    _settingsReturnView = null;
    if (typeof renderContactInfo === 'function') {
      renderContactInfo('settings');
      showView('contactinfo');
    }
    return;
  }
  if (_settingsSub) { renderSettings(); return; }
  showView('home');
  renderHome();
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
    stickerLibrary: stickerLibrary,
    contactStickers: contactStickers,
    voiceLibrary: voiceLibrary,
    partnerPokes: partnerPokes,
    myPokes: myPokes,
    contactPokes: contactPokes,
    customReplies: replyPool.filter(function (r) { return BUILTIN_REPLIES.indexOf(r) === -1; }),
    contactReplyPools: contactReplyPools,
    replyGroups: replyGroups,
    poolGroups: poolGroups,
    disabledReplies: disabledReplies,
    disabledPoolReplies: disabledPoolReplies,
    homeProfile: homeProfile,
    anniversaries: anniversaries,
    musicTracks: musicTracks,
    photoWall: photoWall,
    homeBoxBg: homeBoxBg,
    weatherNow: weatherNow,
    momentsData: momentsData,
    momentsCover: momentsCover
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
          stickerLibrary = Array.isArray(data.stickerLibrary) ? data.stickerLibrary : [];
          contactStickers = (data.contactStickers && typeof data.contactStickers === 'object')
            ? data.contactStickers : {};
          voiceLibrary = (data.voiceLibrary && typeof data.voiceLibrary === 'object')
            ? data.voiceLibrary : {};
          partnerPokes = Array.isArray(data.partnerPokes) ? data.partnerPokes : [];
          myPokes = Array.isArray(data.myPokes) ? data.myPokes : [];
          contactPokes = (data.contactPokes && typeof data.contactPokes === 'object')
            ? data.contactPokes : {};
          replyPool = BUILTIN_REPLIES.concat(data.customReplies || []);
          contactReplyPools = (data.contactReplyPools && typeof data.contactReplyPools === 'object')
            ? data.contactReplyPools : {};
          replyGroups = Array.isArray(data.replyGroups) ? data.replyGroups : [];
          poolGroups = (data.poolGroups && typeof data.poolGroups === 'object') ? data.poolGroups : {};
          disabledReplies = Array.isArray(data.disabledReplies) ? data.disabledReplies : [];
          disabledPoolReplies = (data.disabledPoolReplies && typeof data.disabledPoolReplies === 'object')
            ? data.disabledPoolReplies : {};
          homeProfile = Object.assign({}, DEFAULT_HOME, data.homeProfile || {});
          anniversaries = Array.isArray(data.anniversaries) ? data.anniversaries : [];
          musicTracks = Array.isArray(data.musicTracks) && data.musicTracks.length
            ? data.musicTracks : DEFAULT_TRACKS.map(function (t) { return Object.assign({}, t); });
          photoWall = Array.isArray(data.photoWall) && data.photoWall.length === 6
            ? data.photoWall : [null, null, null, null, null, null];
          homeBoxBg = data.homeBoxBg || null;
          weatherNow = data.weatherNow || null;
          momentsData = (data.momentsData && typeof data.momentsData === 'object') ? data.momentsData : {};
          if (!Array.isArray(momentsData.posts)) momentsData.posts = [];
          if (typeof momentsData.partnerNext === 'undefined') momentsData.partnerNext = null;
          momentsData.posts.forEach(function (p) {
            if (!p || typeof p !== 'object') return;
            if (!Array.isArray(p.comments)) p.comments = [];
            if (!Array.isArray(p.images)) p.images = [];
          });
          momentsCover = data.momentsCover || null;
          contacts.forEach(function (c) {
            if (!Array.isArray(messagesByContact[c.id])) messagesByContact[c.id] = [];
            if (!Array.isArray(contactReplyPools[c.id])) contactReplyPools[c.id] = [];
          });
          saveData();
          applyBubbleTheme();
          if (typeof startAutoSend === 'function') startAutoSend();
          _resetDreamSign();
          if (activeContactId) renderAllMessages();
          renderContactList();
          renderSettings();
          renderHome();
          if (typeof renderMoments === 'function') renderMoments();
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
