/* ============ 字卡传讯 · 设置页（排版参照 mochi：搜索 + 分组标签 + 图标行 + 二级子页） ============ */
/* 通用 = 主页资料/天气/外观/数据 · 聊天 = 回复设置·音效设置·首页梦角展示 · 字卡 = 基础库/专属库/关键词/拍一拍/收藏 */

var _settingsSub = null;      // null=主设置 / 'reply' / 'sfx'
var _settingsTab = 'basic';   // basic / chat / cards
var _poolSelContact = null;   // 专属字卡库当前梦角 id

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
    '<span class="row-ico">' + (o.ico || '⚙️') + '</span>' +
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

// ---------- 主设置页 ----------
function renderSettings(focusSection) {
  _settingsSub = null;
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('设置');

  // focus 处理
  _settingsTab = 'basic';
  if (focusSection === 'favs' || focusSection === 'replies' || (focusSection || '').indexOf('pool:') === 0) {
    _settingsTab = 'cards';
  }
  if ((focusSection || '').indexOf('pool:') === 0) {
    _poolSelContact = focusSection.slice(5);
  }

  body.innerHTML =
    // 顶部搜索（mochi 同款：实时过滤设置行）
    '<div class="set-search"><input type="text" id="set-search-input" placeholder="搜索设置项（如 天气 / 字卡 / 音效）"></div>' +

    // 分组标签
    '<div class="set-tabs" id="set-tabs">' +
      '<div class="set-tab' + (_settingsTab === 'basic' ? ' active' : '') + '" data-tab="basic">通用</div>' +
      '<div class="set-tab' + (_settingsTab === 'chat' ? ' active' : '') + '" data-tab="chat">聊天</div>' +
      '<div class="set-tab' + (_settingsTab === 'cards' ? ' active' : '') + '" data-tab="cards">字卡</div>' +
    '</div>' +

    // —— 通用 ——
    '<div class="set-sec' + (_settingsTab === 'basic' ? ' active' : '') + '" data-sec="basic">' +
      sGroup('主页资料', [
        sRow({ ico: '✏️', label: '昵称', val: homeProfile.name || '我', act: 'pName' }),
        sRow({ ico: '🐧', label: '头像', val: homeProfile.avatar || '🐧', act: 'pAvatar' }),
        sRow({ ico: '💬', label: '个性签名', val: homeProfile.signature || '未填写', act: 'pSign' }),
        sRow({ ico: '📍', label: '位置', val: homeProfile.location || '未设置', act: 'pLoc' }),
        sRow({ ico: '😊', label: '状态表情', val: homeProfile.expression || '', act: 'pExpr' })
      ].join('')) +
      sGroup('天气', [
        '<div class="set-row"><span class="row-ico">☁️</span>' +
          '<span class="row-txt"><span class="row-label">天气城市</span>' +
          '<span class="row-sub">' + (settings.weatherCity ? '当前：' + escapeHtml(settings.weatherCity) : '填城市名自动查询，如：上海') + '</span></span>' +
          '<input type="text" class="row-input" id="weather-city-input" value="' + escapeHtml(settings.weatherCity || '') + '" placeholder="城市名">' +
        '</div>',
        '<div class="set-row"><span class="row-ico">🔄</span>' +
          '<span class="row-txt"><span class="row-label">天气刷新</span>' +
          '<span class="row-sub">' + (weatherNow ? escapeHtml(weatherNow.city + ' ' + weatherNow.temp + '° ' + weatherNow.desc) : '从未获取') + '</span></span>' +
          '<button class="row-btn" id="weather-refresh-btn">立即刷新</button>' +
        '</div>'
      ].join('')) +
      sGroup('外观', [
        sRow({ ico: '🎭', label: '纯黑白模式', sub: '关闭后用户气泡使用微信绿', toggle: settings.bubbleTheme === 'mono', key: 'mono' })
      ].join('')) +
      sGroup('数据', [
        sRow({ ico: '⬆️', label: '导出数据', sub: '字卡库、梦角、群聊与设置备份为 JSON', arrow: true, act: 'exportData' }),
        sRow({ ico: '⬇️', label: '导入数据', sub: '从 JSON 备份恢复', arrow: true, act: 'importData' }),
        sRow({ ico: '⚠️', label: '重置一切', sub: '恢复到出厂状态，不可恢复', arrow: true, act: 'resetAll' })
      ].join('')) +
    '</div>' +

    // —— 聊天 ——
    '<div class="set-sec' + (_settingsTab === 'chat' ? ' active' : '') + '" data-sec="chat">' +
      sGroup('聊天设置', [
        sRow({ ico: '🎛', label: '回复设置', sub: '功能与节奏：引用/已读/撤回/红包/速度/主动发送/拼接', arrow: true, act: 'openReply' }),
        sRow({ ico: '🔊', label: '音效设置', sub: '消息与拍一拍音效、音量、自定义音频', arrow: true, act: 'openSfx' }),
        sRow({ ico: '👤', label: '首页梦角展示', sub: '主页头像对与展示栏显示哪位梦角',
          val: homeContactDisplay(), act: 'homeDream' })
      ].join('')) +
    '</div>' +

    // —— 字卡 ——
    '<div class="set-sec' + (_settingsTab === 'cards' ? ' active' : '') + '" data-sec="cards">' +
      sGroup('基础字卡库 · 全员可用（' + replyPool.length + ' 条）',
        '<div class="kar-list" id="reply-list">' + replyListHtml() +
          '<div class="kar-add-row">' +
            '<input type="text" id="new-reply-input" placeholder="添加一条新字卡…">' +
            '<button id="add-reply-btn">添加</button>' +
          '</div>' +
          '<button class="pool-batch" id="reply-batch-btn">📄 批量导入（每行一条）</button>' +
        '</div>') +
      sGroup('专属字卡库 · 单人可用', poolSectionHtml()) +
      sGroup('关键词规则（' + keywordRules.length + ' 组）',
        '<div class="kar-list" id="kw-list">' + keywordListHtml() +
          '<div class="kw-form">' +
            '<input type="text" id="kw-keys-input" placeholder="关键词，用逗号分隔（如：早安,早上好）">' +
            '<input type="text" id="kw-replies-input" placeholder="对应回复，用逗号分隔">' +
            '<button id="add-kw-btn">+ 添加规则</button>' +
          '</div>' +
        '</div>') +
      sGroup('拍一拍动作（' + customPokes.length + ' 个）',
        '<div class="kar-list" id="poke-list">' + pokeListHtml() +
          '<div class="kar-add-row">' +
            '<input type="text" id="new-poke-input" placeholder="添加拍一拍动作…（对方拍你时随机用）">' +
            '<button id="add-poke-btn">添加</button>' +
          '</div>' +
        '</div>') +
      sGroup('收藏的字卡', '<div class="kar-list" id="fav-list">' + favListHtml() + '</div>') +
    '</div>';

  bindSettingsEvents();

  // 滚动定位
  if (focusSection) {
    var target = null;
    if (focusSection === 'favs') target = document.getElementById('fav-list');
    else if (focusSection === 'replies') target = document.getElementById('reply-list');
    else if ((focusSection || '').indexOf('pool:') === 0) target = document.getElementById('pool-list');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function homeContactDisplay() {
  var hc = getHomeContact();
  return hc ? hc.name : '暂无梦角';
}

function setSettingsHeader(title, backIsSub) {
  var titleEl = document.getElementById('settings-title');
  if (titleEl) titleEl.textContent = title;
}

// ---------- 列表辅助（基础库/关键词/拍一拍/收藏） ----------
function replyListHtml() {
  if (replyPool.length === 0) return '<div class="empty-hint">基础库为空，添加后全员可用</div>';
  return replyPool.map(function (r, i) {
    return '<div class="kar-item"><span class="kar-text">' + escapeHtml(r) + '</span>' +
      '<button class="kar-del" data-idx="' + i + '">✕</button></div>';
  }).join('');
}

function keywordListHtml() {
  if (keywordRules.length === 0) return '<div class="empty-hint">没有关键词规则</div>';
  return keywordRules.map(function (rule, i) {
    return '<div class="kw-item">' +
      '<div class="kw-info">' +
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

// ---------- 专属字卡库分区（梦角选择 + 列表） ----------
function poolSectionHtml() {
  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  if (!singles.length) return '<div class="empty-hint">先新建一位梦角，专属库分区会自动生成</div>';
  if (!_poolSelContact || !singles.some(function (c) { return c.id === _poolSelContact; })) {
    _poolSelContact = getHomeContact() && !isGroupContact(getHomeContact())
      ? getHomeContact().id : singles[0].id;
  }
  var sel = memberById(_poolSelContact);
  var pool = contactReplyPools[_poolSelContact] || [];
  return '' +
    '<div class="pool-picker" id="pool-picker">' +
      singles.map(function (c) {
        return '<button class="pool-chip' + (c.id === _poolSelContact ? ' active' : '') +
          '" data-pid="' + c.id + '">' + escapeHtml(c.avatar || ' ') + ' ' + escapeHtml(c.name) + '</button>';
      }).join('') +
    '</div>' +
    '<div class="pool-hint">「' + escapeHtml(sel ? sel.name : '') + '」专属 · ' + pool.length +
      ' 条（回复与首页个签只从这里 + 基础库抽取）</div>' +
    '<div class="kar-list" id="pool-list">' + (pool.length
      ? pool.map(function (r, i) {
          return '<div class="kar-item"><span class="kar-text">' + escapeHtml(r) + '</span>' +
            '<button class="kar-del" data-pidx="' + i + '">✕</button></div>';
        }).join('')
      : '<div class="empty-hint">专属库为空，由你自定义导入</div>') +
      '<div class="kar-add-row">' +
        '<input type="text" id="new-pool-input" placeholder="给这位梦角加一条字卡…">' +
        '<button id="add-pool-btn">添加</button>' +
      '</div>' +
      '<button class="pool-batch" id="pool-batch-btn">📄 批量导入到此分区</button>' +
    '</div>';
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
      sRow({ ico: '↩️', label: '引用回复', sub: '长按/点消息可引用回复', toggle: settings.quoteReplyEnabled, key: 'quoteReplyEnabled' }),
      sRow({ ico: '✔️', label: '已读回执', toggle: settings.readReceiptEnabled, key: 'readReceiptEnabled' }),
      '<div class="set-row sub-row"><span class="row-ico">🎨</span>' +
        '<span class="row-txt"><span class="row-label">已读样式</span></span>' +
        '<span class="seg">' +
          '<button class="seg-btn' + (settings.readReceiptStyle === 'icon' ? ' active' : '') + '" data-rr="icon">✓✓ 图形</button>' +
          '<button class="seg-btn' + (settings.readReceiptStyle === 'text' ? ' active' : '') + '" data-rr="text">文字</button>' +
        '</span></div>',
      sRow({ ico: '🙈', label: '已读不回', sub: '当前 ' + Math.round((settings.readNoReplyChance || 0) * 100) + '% 概率只已读不回复',
        rightHtml: '<input type="number" class="row-num" id="readNoReply-input" min="0" max="100" value="' +
          Math.round((settings.readNoReplyChance || 0) * 100) + '"><span class="row-unit">%</span>' }),
      sRow({ ico: '⌨️', label: '正在输入', sub: '回复前显示微信式「对方正在输入」', toggle: settings.typingIndicatorEnabled, key: 'typingIndicatorEnabled' }),
      sRow({ ico: '↩︎', label: '梦角撤回消息', sub: '偶尔撤回刚发的消息（3%）', toggle: settings.partnerRecallEnabled, key: 'partnerRecallEnabled' }),
      sRow({ ico: '👋', label: '拍一拍', sub: '偶尔触发拍一拍（3%）', toggle: settings.pokeEnabled, key: 'pokeEnabled' }),
      sRow({ ico: '🌙', label: '状态变化', sub: '梦角的状态偶尔自动变化（5%）', toggle: settings.statusChangeEnabled, key: 'statusChangeEnabled' }),
      sRow({ ico: '🧧', label: '梦角主动发红包', sub: '开启后偶尔给你发红包，点气泡拆开', toggle: settings.redPacketEnabled, key: 'redPacketEnabled' })
    ].join('')) +

    sGroup('拍一拍', [
      '<div class="set-row"><span class="row-ico">👋</span>' +
        '<span class="row-txt"><span class="row-label">我拍一拍的默认动作</span>' +
        '<span class="row-sub">预览：你 ' + escapeHtml(settings.myPokeText || '拍了拍') + ' 梦角</span></span>' +
        '<input type="text" class="row-input" id="myPokeText-input" value="' + escapeHtml(settings.myPokeText || '拍了拍') + '">' +
      '</div>'
    ].join('')) +

    sGroup('时间戳', '<div class="ts-grid">' + tsBtns + '</div>') +

    sGroup('回复速度', [
      '<div class="set-row slider-row"><span class="row-ico">⚡</span>' +
        '<span class="row-txt"><span class="row-label">最短等待</span></span>' +
        '<input type="range" min="1000" max="30000" step="500" value="' + settings.replyDelayMin + '" id="dly-min">' +
        '<span class="slider-val" id="dly-min-val">' + (settings.replyDelayMin / 1000).toFixed(1) + 's</span></div>',
      '<div class="set-row slider-row"><span class="row-ico">🐢</span>' +
        '<span class="row-txt"><span class="row-label">最长等待</span></span>' +
        '<input type="range" min="1000" max="60000" step="500" value="' + settings.replyDelayMax + '" id="dly-max">' +
        '<span class="slider-val" id="dly-max-val">' + (settings.replyDelayMax / 1000).toFixed(1) + 's</span></div>'
    ].join('')) +

    sGroup('主动发送', [
      sRow({ ico: '📨', label: '主动发消息给我', sub: '开启后梦角按间隔主动找你（页面打开时）', toggle: settings.autoSendEnabled, key: 'autoSendEnabled' }),
      '<div class="set-row slider-row" id="auto-send-row"' + (settings.autoSendEnabled ? '' : ' style="display:none"') + '>' +
        '<span class="row-ico">⏲</span>' +
        '<span class="row-txt"><span class="row-label">间隔</span></span>' +
        '<input type="range" min="1" max="180" step="1" value="' + settings.autoSendInterval + '" id="auto-send-slider">' +
        '<span class="slider-val" id="auto-send-val">' + settings.autoSendInterval + '分钟</span></div>'
    ].join('')) +

    sGroup('消息节奏', [
      sRow({ ico: '😀', label: '表情混入消息', sub: '开启后表情与文字同条发送', toggle: settings.emojiMixEnabled, key: 'emojiMixEnabled' }),
      sRow({ ico: '🃏', label: '回复拼接字卡', sub: '开启后单条消息有概率拼接多张字卡', toggle: settings.combineCardsEnabled, key: 'combineCardsEnabled' }),
      '<div class="set-row slider-row" id="combine-row"' + (settings.combineCardsEnabled ? '' : ' style="display:none"') + '>' +
        '<span class="row-ico">🔢</span>' +
        '<span class="row-txt"><span class="row-label">最多拼接</span></span>' +
        '<input type="range" min="2" max="5" step="1" value="' + settings.combineCardsMax + '" id="combine-slider">' +
        '<span class="slider-val" id="combine-val">' + settings.combineCardsMax + '句</span></div>'
    ].join('')) +

    sGroup('后台运行', [
      sRow({ ico: '🔔', label: '后台消息推送', sub: '页面在后台时收到消息弹系统通知（需授权）', toggle: settings.bgNotifyEnabled, key: 'bgNotifyEnabled' })
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
      '<div class="sfx-head"><span class="sfx-ico">🔊</span>' +
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
          '<button class="sfx-upload" data-sfxup="' + c.key + '" title="上传本地音频">⬆</button>' +
        '</div>' +
        (customUrl ? '<button class="sfx-clear" data-sfxclr="' + c.key + '">清除自定义音频</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +
    sGroup('消息音效', [
      sRow({ ico: '🔊', label: '开启音效', toggle: settings.soundEnabled, key: 'soundEnabled' }),
      '<div class="set-row slider-row"><span class="row-ico">🔉</span>' +
        '<span class="row-txt"><span class="row-label">音量</span></span>' +
        '<input type="range" min="0" max="100" step="5" value="' + Math.round((settings.soundVolume || 0) * 100) + '" id="sfx-volume">' +
        '<span class="slider-val" id="sfx-volume-val">' + Math.round((settings.soundVolume || 0) * 100) + '%</span></div>'
    ].join('')) +
    '<div class="sfx-list">' + cardsHtml + '</div>' +
    '<div class="set-note">预设为内置合成音；「kakaotalk」与自定义URL/上传的音频在下一次触发时生效。' +
    'iOS 需先点一下页面才能出声（浏览器自动播放限制）。</div>';

  bindSfxSettingsEvents();
}

// ---------- 事件 ----------
function bindSettingsEvents() {
  var body = DOMElements.settingsBody;

  // 分组标签切换
  var tabs = body.querySelector('#set-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var tab = e.target.closest('.set-tab');
      if (!tab) return;
      _settingsTab = tab.dataset.tab;
      tabs.querySelectorAll('.set-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.tab === _settingsTab);
      });
      body.querySelectorAll('.set-sec').forEach(function (s) {
        s.classList.toggle('active', s.dataset.sec === _settingsTab);
      });
      var si = body.querySelector('#set-search-input');
      if (si) { si.value = ''; filterSettingsRows(''); }
    });
  }

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
        promptModal('头像', '输入一个 emoji（如 🐧）', homeProfile.avatar, function (v) { homeProfile.avatar = v; saveData(); renderSettings(); renderHome(); });
      } else if (act === 'pSign') {
        confirmModal('个性签名', '一句话介绍自己（留空清空）', function (v) {
          homeProfile.signature = (v || '').trim(); saveData(); renderSettings(); renderHome();
        }, { input: homeProfile.signature || '' });
      } else if (act === 'pLoc') {
        promptModal('位置', '如：维多利亚港', homeProfile.location || '', function (v) { homeProfile.location = v; saveData(); renderSettings(); renderHome(); });
      } else if (act === 'pExpr') {
        promptModal('状态表情', '', homeProfile.expression || '', function (v) { homeProfile.expression = v; saveData(); renderSettings(); renderHome(); });
      } else if (act === 'openReply') {
        renderReplySettings();
      } else if (act === 'openSfx') {
        renderSfxSettings();
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

  // 通用 · 外观
  body.querySelectorAll('[data-set]').forEach(function (el) {
    var key = el.dataset.set;
    if (key === 'mono') {
      el.addEventListener('change', function () {
        settings.bubbleTheme = el.checked ? 'mono' : 'wechat';
        saveData();
        applyBubbleTheme();
      });
    }
  });

  bindPoolListEvents(body);

  // 语料增删（基础库）
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
  var replyBatchBtn = body.querySelector('#reply-batch-btn');
  if (replyBatchBtn) {
    replyBatchBtn.addEventListener('click', function () {
      batchImportModal('批量导入基础字卡库', '', function (lines) {
        lines.forEach(function (l) { replyPool.push(l); });
        saveData();
        renderSettings();
        toast('已导入 ' + lines.length + ' 条');
      });
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
}

// 专属库分区的事件（选择梦角 / 增删 / 批量导入）
function bindPoolListEvents(body) {
  var picker = body.querySelector('#pool-picker');
  if (picker) {
    picker.addEventListener('click', function (e) {
      var chip = e.target.closest('.pool-chip');
      if (!chip) return;
      _poolSelContact = chip.dataset.pid;
      renderSettings();
      var el = document.getElementById('pool-list');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  var addBtn = body.querySelector('#add-pool-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var input = body.querySelector('#new-pool-input');
      var val = input.value.trim();
      if (!val) return;
      if (!contactReplyPools[_poolSelContact]) contactReplyPools[_poolSelContact] = [];
      contactReplyPools[_poolSelContact].push(val);
      saveData();
      renderSettings();
      toast('已添加到专属库');
    });
  }
  var list = body.querySelector('#pool-list');
  if (list) {
    list.addEventListener('click', function (e) {
      var del = e.target.closest('.kar-del');
      if (!del) return;
      (contactReplyPools[_poolSelContact] || []).splice(Number(del.dataset.pidx), 1);
      saveData();
      renderSettings();
    });
  }
  var batchBtn = body.querySelector('#pool-batch-btn');
  if (batchBtn) {
    batchBtn.addEventListener('click', function () {
      var sel = memberById(_poolSelContact);
      batchImportModal('批量导入 · ' + (sel ? sel.name : '') + ' 的专属库', '', function (lines) {
        if (!contactReplyPools[_poolSelContact]) contactReplyPools[_poolSelContact] = [];
        lines.forEach(function (l) { contactReplyPools[_poolSelContact].push(l); });
        saveData();
        renderSettings();
        toast('已导入 ' + lines.length + ' 条');
      });
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
    return { label: (c.id === settings.homeContactId ? '✓ ' : '　') + (c.avatar || ' ') + ' ' + c.name, act: 'hc_' + c.id };
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
    sec.style.display = (lower || sec.dataset.sec === _settingsTab) && anyVisible ? 'block' : 'none';
    if (lower && anyVisible) sec.style.display = 'block';
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

  // 拍一拍默认动作
  var pokeInput = body.querySelector('#myPokeText-input');
  if (pokeInput) {
    pokeInput.addEventListener('change', function () {
      settings.myPokeText = pokeInput.value.trim() || '拍了拍';
      pokeInput.value = settings.myPokeText;
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

// 设置页返回（子页先回主设置）
function settingsBack() {
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
    keywordRules: keywordRules,
    customPokes: customPokes,
    customReplies: replyPool.filter(function (r) { return BUILTIN_REPLIES.indexOf(r) === -1; }),
    contactReplyPools: contactReplyPools,
    homeProfile: homeProfile,
    anniversaries: anniversaries,
    musicTracks: musicTracks,
    photoWall: photoWall,
    homeBoxBg: homeBoxBg,
    weatherNow: weatherNow
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
          contactReplyPools = (data.contactReplyPools && typeof data.contactReplyPools === 'object')
            ? data.contactReplyPools : {};
          homeProfile = Object.assign({}, DEFAULT_HOME, data.homeProfile || {});
          anniversaries = Array.isArray(data.anniversaries) ? data.anniversaries : [];
          musicTracks = Array.isArray(data.musicTracks) && data.musicTracks.length
            ? data.musicTracks : DEFAULT_TRACKS.map(function (t) { return Object.assign({}, t); });
          photoWall = Array.isArray(data.photoWall) && data.photoWall.length === 6
            ? data.photoWall : [null, null, null, null, null, null];
          homeBoxBg = data.homeBoxBg || null;
          weatherNow = data.weatherNow || null;
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
