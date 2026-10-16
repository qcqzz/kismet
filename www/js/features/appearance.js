/* ============ 字卡传讯 · 外观应用引擎 ============ */
/* 外观设置页已移除；这里只保留"把 settings 真正作用到 DOM"的引擎部分，
   供 core / app 在启动时调用。气泡样式由 bubblecss.js 接管，不走 body.bubble-* 类名。 */

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

  // 5) 头像：统一圆形（不再有方形选项）
  body.classList.add('avatar-round');
  body.classList.toggle('no-chat-avatar', s.showChatAvatar === false);
  body.classList.toggle('avatar-align-right', s.avatarAlign === 'right');
  body.classList.toggle('show-partner-name', !!s.showPartnerName);
  root.style.setProperty('--avatar-size', (Number(s.avatarSize) || 38) + 'px');
  // 同步核心渲染开关（core.js buildMsgRow 读 showEveryAvatar）
  settings.showEveryAvatar = (s.showMsgAvatar !== false);

  // 6) 桌面（主页）背景图 + 各组件不透明度
  // 组件透明度用一个 CSS 变量下发，桌面上的卡片统一读它，所以滑块实时可调
  var homeOverlay = (s.theme === 'dark') ? 'rgba(17,17,17,0.6)' : 'rgba(255,255,255,0.5)';
  var homeBg = s.homeBgImage
    ? 'linear-gradient(' + homeOverlay + ',' + homeOverlay + '), url("' + s.homeBgImage + '")'
    : 'none';
  root.style.setProperty('--home-bg-image', homeBg);
  body.classList.toggle('home-has-bg', !!s.homeBgImage);
  var alpha = Number(s.homeCardAlpha);
  if (!(alpha > 0)) alpha = 0.76;
  if (alpha > 1) alpha = 1;
  root.style.setProperty('--home-card-alpha', alpha);

  // 7) 气泡 CSS（预设 + 手写）
  if (typeof applyBubbleCss === 'function') applyBubbleCss();
}

// 注入 / 移除全局主题 CSS
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

// 暴露到 window 供 core.js / app.js 调用
window.applyAppearance = applyAppearance;