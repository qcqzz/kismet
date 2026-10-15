/* ============ 字卡传讯 · 外观设置（设置视图内的分级页面 + applyAppearance 核心） ============ */
/* 二级：外观设置（主题配色 / 背景 & 陪伴 / 字体 & 气泡 / 聊天头像）→ 三级：各面板 */

// ---------- 颜色工具 ----------
function _apHexToRgb(hex) {
  var h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function _apShade(hex, amt) {
  var rgb = _apHexToRgb(hex);
  if (!rgb) return hex;
  var f = function (v) { return Math.max(0, Math.min(255, v + amt)); };
  var toHex = function (v) { var s = v.toString(16); return s.length === 1 ? '0' + s : s; };
  return '#' + toHex(f(rgb.r)) + toHex(f(rgb.g)) + toHex(f(rgb.b));
}

// ---------- 核心：把 settings 外观项真正作用到 DOM ----------
function applyAppearance() {
  if (typeof settings === 'undefined' || !settings) return;
  var s = settings;
  var root = document.documentElement;
  var body = document.body;

  // 1) 深色 / 浅色主题
  root.dataset.theme = (s.theme === 'dark') ? 'dark' : 'light';

  // 2) 强调色 → --accent-color / --accent-color-rgb / --accent-color-dark
  var accent = s.appearanceAccent || '#111111';
  var rgb = _apHexToRgb(accent);
  if (rgb) {
    root.style.setProperty('--accent-color', accent);
    root.style.setProperty('--accent-color-rgb', rgb.r + ', ' + rgb.g + ', ' + rgb.b);
    root.style.setProperty('--accent-color-dark', _apShade(accent, -20));
  }

  // 3) 聊天背景图（叠加半透明遮罩，保证气泡可读）
  var overlay = (s.theme === 'dark') ? 'rgba(17,17,17,0.55)' : 'rgba(255,255,255,0.55)';
  var bg = s.chatBgImage
    ? 'linear-gradient(' + overlay + ',' + overlay + '), url("' + s.chatBgImage + '")'
    : 'none';
  root.style.setProperty('--chat-bg-image', bg);

  // 4) 字体缩放
  var fs = Number(s.fontScale) || 1;
  root.style.fontSize = (16 * fs) + 'px';
  root.style.setProperty('--font-scale', fs);
  root.style.setProperty('--chat-font-size', ((Number(s.chatFontSize) || 15) * fs) + 'px');

  // 5) 气泡样式 → body 类名
  body.classList.remove('bubble-standard', 'bubble-rounded', 'bubble-pill', 'bubble-square');
  var bmap = {
    standard: 'bubble-standard',
    rounded: 'bubble-rounded',
    'rounded-large': 'bubble-pill',
    square: 'bubble-square'
  };
  body.classList.add(bmap[s.bubbleStyle] || 'bubble-standard');

  // 6) 头像相关 → body 类名 + --avatar-size
  body.classList.toggle('no-chat-avatar', s.showChatAvatar === false);
  body.classList.toggle('avatar-square', s.avatarShape === 'square');
  body.classList.toggle('avatar-align-right', s.avatarAlign === 'right');
  body.classList.toggle('show-partner-name', !!s.showPartnerName);
  root.style.setProperty('--avatar-size', (Number(s.avatarSize) || 38) + 'px');
  // 同步核心渲染开关（core.js buildMsgRow 读 showEveryAvatar）
  settings.showEveryAvatar = (s.showMsgAvatar !== false);

  // 7) 全局主题 CSS
  _apInjectGlobalCss(s.globalCss || '');
}

// 注入 / 移除全局 CSS
function _apInjectGlobalCss(css) {
  var el = document.getElementById('kc-global-css');
  if (!css) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('style');
    el.id = 'kc-global-css';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// ---------- 二级：外观设置（4 行下钻入口） ----------
function renderAppearance() {
  _settingsSub = 'appearance';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('外观设置');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回设置</div>' +
    sGroup('外观设置', [
      sRow({ ico: '<i class="fas fa-paint-roller"></i>', label: '主题配色', sub: '快捷换肤 · 深色模式 · 全局主题 CSS', arrow: true, act: 'apTheme' }),
      sRow({ ico: '<i class="fas fa-image"></i>', label: '背景 & 陪伴', sub: '聊天背景图片', arrow: true, act: 'apBg' }),
      sRow({ ico: '<i class="fas fa-font"></i>', label: '字体 & 气泡', sub: '字号 · 气泡样式 · 纯黑白', arrow: true, act: 'apFont' }),
      sRow({ ico: '<i class="fas fa-user-circle"></i>', label: '聊天头像', sub: '显示 · 尺寸 · 形状 · 对齐', arrow: true, act: 'apAvatar' })
    ].join(''));

  bindAppearanceEvents(body);
}

function bindAppearanceEvents(body) {
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderSettings(); });

  body.querySelectorAll('[data-act]').forEach(function (el) {
    el.addEventListener('click', function () {
      var act = el.dataset.act;
      if (act === 'apTheme') renderAppearanceTheme();
      else if (act === 'apBg') renderAppearanceBg();
      else if (act === 'apFont') renderAppearanceFont();
      else if (act === 'apAvatar') renderAppearanceAvatar();
    });
  });
}

// ---------- 三级：主题配色 ----------
function renderAppearanceTheme() {
  _settingsSub = 'ap-theme';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('主题配色');

  var accent = (settings.appearanceAccent || '#111111').toLowerCase();
  var swatches = [
    ['#111111', '黑白'],
    ['#3b82f6', '蓝'],
    ['#8b5cf6', '紫'],
    ['#22c55e', '绿'],
    ['#ec4899', '粉']
  ].map(function (s) {
    return '<button class="ap-swatch' + (s[0].toLowerCase() === accent ? ' active' : '') +
      '" data-accent="' + s[0] + '" title="' + s[1] + '" style="background:' + s[0] + '"></button>';
  }).join('');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回外观设置</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title"><i class="fas fa-swatchbook"></i>快捷换肤</div>' +
      '<div class="ap-swatches">' + swatches + '</div>' +
    '</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-row">' +
        '<span class="ap-lab"><i class="fas fa-moon"></i> 深色模式</span>' +
        '<label class="switch"><input type="checkbox" id="ap-dark-toggle"' + (settings.theme === 'dark' ? ' checked' : '') + '><span class="knob"></span></label>' +
      '</div>' +
    '</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title"><i class="fas fa-paint-brush"></i>全局主题 CSS</div>' +
      '<div class="ap-desc">作用于整个页面的 CSS，可覆盖任意元素样式、CSS 变量等。</div>' +
      '<textarea id="custom-global-css" class="modal-textarea" style="font-family:monospace;font-size:12px;height:140px;white-space:pre;" placeholder=":root {&#10;  --accent-color: #ff6b9d;&#10;}">' +
        escapeHtml(settings.globalCss || '') + '</textarea>' +
      '<div class="ap-css-actions">' +
        '<label class="ap-live-label"><input type="checkbox" id="global-css-live-toggle"' + (settings.globalCssLive ? ' checked' : '') + '>实时应用</label>' +
        '<div class="ap-css-btns">' +
          '<button id="reset-global-css-btn" class="modal-btn modal-btn-secondary" style="padding:6px 12px;font-size:12px;">清空</button>' +
          '<button id="apply-global-css-btn" class="modal-btn modal-btn-primary" style="padding:6px 12px;font-size:12px;">应用 CSS</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  bindAppearanceThemeEvents(body);
}

function bindAppearanceThemeEvents(body) {
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderAppearance(); });

  // 快捷换肤色块
  body.querySelectorAll('.ap-swatch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      settings.appearanceAccent = sw.dataset.accent || '#111111';
      saveData();
      applyAppearance();
      renderAppearanceTheme();
    });
  });

  // 深色模式
  var dark = body.querySelector('#ap-dark-toggle');
  if (dark) dark.addEventListener('change', function () {
    settings.theme = dark.checked ? 'dark' : 'light';
    saveData();
    applyAppearance();
  });

  // 全局主题 CSS
  var ta = body.querySelector('#custom-global-css');
  var live = body.querySelector('#global-css-live-toggle');
  if (ta && live) {
    live.addEventListener('change', function () { settings.globalCssLive = live.checked; saveData(); });
    ta.addEventListener('input', function () {
      if (settings.globalCssLive) { settings.globalCss = ta.value; saveData(); _apInjectGlobalCss(ta.value); }
    });
  }
  var applyBtn = body.querySelector('#apply-global-css-btn');
  if (applyBtn && ta) applyBtn.addEventListener('click', function () {
    settings.globalCss = ta.value;
    saveData();
    _apInjectGlobalCss(settings.globalCss);
    toast('已应用 CSS');
  });
  var resetBtn = body.querySelector('#reset-global-css-btn');
  if (resetBtn && ta) resetBtn.addEventListener('click', function () {
    ta.value = '';
    settings.globalCss = '';
    saveData();
    _apInjectGlobalCss('');
    toast('已清空');
  });
}

// ---------- 三级：背景 & 陪伴 ----------
function renderAppearanceBg() {
  _settingsSub = 'ap-bg';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('背景 & 陪伴');

  var thumb = settings.chatBgImage
    ? '<img src="' + settings.chatBgImage + '" alt="">'
    : '<i class="fas fa-image"></i>';

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回外观设置</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title"><i class="fas fa-image"></i>聊天背景</div>' +
      '<div class="ap-desc">点击 ＋ 上传图片，自动应用到聊天页（叠加半透明遮罩保证气泡可读）。</div>' +
      '<input type="file" id="ap-bg-input" accept="image/*" style="display:none;">' +
      '<div class="ap-bg-row">' +
        '<div class="ap-bg-thumb" id="ap-bg-thumb">' + thumb + '</div>' +
        '<div class="ap-bg-actions">' +
          '<button id="ap-bg-upload-btn" class="modal-btn modal-btn-primary" style="padding:7px 14px;font-size:12px;"><i class="fas fa-plus"></i> 上传背景</button>' +
          '<button id="ap-bg-clear" class="modal-btn modal-btn-secondary" style="padding:7px 14px;font-size:12px;' + (settings.chatBgImage ? '' : 'display:none;') + '">清除背景</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  bindAppearanceBgEvents(body);
}

function bindAppearanceBgEvents(body) {
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderAppearance(); });

  var bgInput = body.querySelector('#ap-bg-input');
  var bgUpload = body.querySelector('#ap-bg-upload-btn');
  if (bgUpload && bgInput) bgUpload.addEventListener('click', function () { bgInput.click(); });
  if (bgInput) bgInput.addEventListener('change', function () {
    var file = bgInput.files && bgInput.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); bgInput.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      settings.chatBgImage = reader.result;
      saveData();
      applyAppearance();
      renderAppearanceBg();
      toast('背景已应用');
    };
    reader.readAsDataURL(file);
    bgInput.value = '';
  });
  var bgClear = body.querySelector('#ap-bg-clear');
  if (bgClear) bgClear.addEventListener('click', function () {
    settings.chatBgImage = '';
    saveData();
    applyAppearance();
    renderAppearanceBg();
    toast('已清除背景');
  });
}

// ---------- 三级：字体 & 气泡 ----------
function renderAppearanceFont() {
  _settingsSub = 'ap-font';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('字体 & 气泡');

  var fs = Number(settings.fontScale) || 1;
  var bubbleStyles = [
    ['standard', 'fa-comment', '标准尖角'],
    ['rounded', 'fa-comment-dots', '圆角'],
    ['rounded-large', 'fa-circle', '大圆角胶囊'],
    ['square', 'fa-square', '方形直角']
  ];
  var bubbleBtns = bubbleStyles.map(function (b) {
    return '<button class="ap-bubble-btn' + (settings.bubbleStyle === b[0] ? ' active' : '') +
      '" data-bubble-style="' + b[0] + '"><i class="fas ' + b[1] + '"></i><span>' + b[2] + '</span></button>';
  }).join('');

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回外观设置</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title"><i class="fas fa-font"></i>字体大小</div>' +
      '<div class="ap-slider-row">' +
        '<span class="ap-slider-label">大小</span>' +
        '<input type="range" min="0.85" max="1.25" step="0.05" value="' + fs + '" id="ap-font-slider">' +
        '<span class="ap-slider-val" id="ap-font-value">' + Math.round(fs * 100) + '%</span>' +
      '</div>' +
    '</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title"><i class="fas fa-comment"></i>气泡样式</div>' +
      '<div class="ap-bubble-grid">' + bubbleBtns + '</div>' +
    '</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-row">' +
        '<span class="ap-lab"><i class="fas fa-mask"></i> 纯黑白模式</span>' +
        '<label class="switch"><input type="checkbox" data-set="mono"' + (settings.bubbleTheme === 'mono' ? ' checked' : '') + '><span class="knob"></span></label>' +
      '</div>' +
      '<div class="ap-desc">关闭后用户气泡使用微信绿。</div>' +
    '</div>';

  bindAppearanceFontEvents(body);
}

function bindAppearanceFontEvents(body) {
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderAppearance(); });

  var fslider = body.querySelector('#ap-font-slider');
  if (fslider) fslider.addEventListener('input', function () {
    settings.fontScale = Number(fslider.value) || 1;
    saveData();
    applyAppearance();
    var v = body.querySelector('#ap-font-value');
    if (v) v.textContent = Math.round(settings.fontScale * 100) + '%';
  });

  body.querySelectorAll('.ap-bubble-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.bubbleStyle = b.dataset.bubbleStyle;
      saveData();
      applyAppearance();
      body.querySelectorAll('.ap-bubble-btn').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
    });
  });

  // 纯黑白模式
  var mono = body.querySelector('[data-set="mono"]');
  if (mono) mono.addEventListener('change', function () {
    settings.bubbleTheme = mono.checked ? 'mono' : 'wechat';
    saveData();
    applyBubbleTheme();
  });
}

// ---------- 三级：聊天头像 ----------
function renderAppearanceAvatar() {
  _settingsSub = 'ap-avatar';
  var body = DOMElements.settingsBody;
  if (!body) return;
  setSettingsHeader('聊天头像');

  var sz = Number(settings.avatarSize) || 38;

  body.innerHTML =
    '<div class="sub-back" id="sub-back">‹ 返回外观设置</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title"><i class="fas fa-user-circle"></i>聊天头像</div>' +
      '<div class="ap-row">' +
        '<span class="ap-lab"><i class="fas fa-user-circle"></i> 显示聊天头像</span>' +
        '<label class="switch"><input type="checkbox" id="ap-show-chat-avatar"' + (settings.showChatAvatar !== false ? ' checked' : '') + '><span class="knob"></span></label>' +
      '</div>' +
      '<div class="ap-row">' +
        '<span class="ap-lab"><i class="fas fa-users"></i> 每条消息显示头像</span>' +
        '<label class="switch"><input type="checkbox" id="ap-show-msg-avatar"' + (settings.showMsgAvatar !== false ? ' checked' : '') + '><span class="knob"></span></label>' +
      '</div>' +
      '<div class="ap-row">' +
        '<span class="ap-lab"><i class="fas fa-tag"></i> 消息旁显示对方名字</span>' +
        '<label class="switch"><input type="checkbox" id="ap-show-partner-name"' + (settings.showPartnerName ? ' checked' : '') + '><span class="knob"></span></label>' +
      '</div>' +
    '</div>' +

    '<div class="ap-sec">' +
      '<div class="ap-sec-title">头像形状 / 对齐</div>' +
      '<div class="ap-slider-row">' +
        '<span class="ap-slider-label">尺寸</span>' +
        '<input type="range" min="30" max="56" step="1" value="' + sz + '" id="ap-avatar-size-slider">' +
        '<span class="ap-slider-val" id="ap-avatar-size-value">' + sz + 'px</span>' +
      '</div>' +
      '<div class="ap-btn-row">' +
        '<button class="ap-shape-btn' + (settings.avatarShape === 'circle' ? ' active' : '') + '" data-shape="circle">● 圆形</button>' +
        '<button class="ap-shape-btn' + (settings.avatarShape === 'square' ? ' active' : '') + '" data-shape="square">■ 方形</button>' +
      '</div>' +
      '<div class="ap-btn-row">' +
        '<button class="ap-align-btn' + ((settings.avatarAlign || 'left') === 'left' ? ' active' : '') + '" data-align="left"><i class="fas fa-align-left"></i> 靠左</button>' +
        '<button class="ap-align-btn' + (settings.avatarAlign === 'right' ? ' active' : '') + '" data-align="right"><i class="fas fa-align-right"></i> 靠右</button>' +
      '</div>' +
    '</div>';

  bindAppearanceAvatarEvents(body);
}

function bindAppearanceAvatarEvents(body) {
  var back = body.querySelector('#sub-back');
  if (back) back.addEventListener('click', function () { renderAppearance(); });

  var bindToggle = function (id, key) {
    var el = body.querySelector('#' + id);
    if (!el) return;
    el.addEventListener('change', function () {
      settings[key] = el.checked;
      saveData();
      applyAppearance();
      if (typeof activeContactId !== 'undefined' && activeContactId) renderAllMessages();
    });
  };
  bindToggle('ap-show-chat-avatar', 'showChatAvatar');
  bindToggle('ap-show-msg-avatar', 'showMsgAvatar');
  bindToggle('ap-show-partner-name', 'showPartnerName');

  var aslider = body.querySelector('#ap-avatar-size-slider');
  if (aslider) aslider.addEventListener('input', function () {
    settings.avatarSize = Number(aslider.value) || 38;
    saveData();
    applyAppearance();
    var v = body.querySelector('#ap-avatar-size-value');
    if (v) v.textContent = settings.avatarSize + 'px';
  });

  body.querySelectorAll('.ap-shape-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.avatarShape = b.dataset.shape;
      saveData();
      applyAppearance();
      body.querySelectorAll('.ap-shape-btn').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
      if (typeof activeContactId !== 'undefined' && activeContactId) renderAllMessages();
    });
  });
  body.querySelectorAll('.ap-align-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.avatarAlign = b.dataset.align;
      saveData();
      applyAppearance();
      body.querySelectorAll('.ap-align-btn').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
      if (typeof activeContactId !== 'undefined' && activeContactId) renderAllMessages();
    });
  });
}

// 暴露到 window 供 rules.js / app.js 调用
window.applyAppearance = applyAppearance;
window.renderAppearance = renderAppearance;
window.renderAppearanceTheme = renderAppearanceTheme;
window.renderAppearanceBg = renderAppearanceBg;
window.renderAppearanceFont = renderAppearanceFont;
window.renderAppearanceAvatar = renderAppearanceAvatar;
