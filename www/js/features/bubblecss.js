/* ============ 字卡传讯 · 聊天气泡 CSS 画廊（聊天信息 → 修改聊天气泡） ============ */
/* 预设与手写 CSS 是**二选一**，不是叠加：
     bubbleMode='preset' → 只注入所选预设，预设即最终样式
     bubbleMode='custom' → 只注入手写 CSS，完全不套用任何预设
   气泡样式只有这一套来源，不再由 body.bubble-* 类名控制。        */

// BUBBLE_U 是「自己发的」那一侧，注意它必须重新写一遍 .chat-stream，
// 不能拼在 BUBBLE_B 前面（BUBBLE_B 自带 .chat-stream，拼起来会变成
// .msg-row.user .chat-stream .bubble，永远匹配不到）。
// 选择器统一带上 :not(.rp-card-bubble):not(.question-bubble)，
// 这样红包 / 问问你的透明卡片不会被误伤。
// BUBBLE_B 只给预设用（特异性高，能压得住基础样式）；
// 手写 CSS 请直接写 .chat-stream .bubble，它比基础样式的 .bubble 特异性更高，一定生效。
var BUBBLE_B = '.chat-stream .bubble:not(.rp-card-bubble):not(.question-bubble)';
var BUBBLE_U = '.chat-stream .msg-row.user .bubble:not(.rp-card-bubble):not(.question-bubble)';
var BUBBLE_T = BUBBLE_B + '::before';

// 深色主题下的补丁前缀：预设自带，避免每款都去改 styles.css
var DK = 'html[data-theme="dark"] ';

var BUBBLE_CSS_PRESETS = [
  {
    // 「原生」= 不注入任何预设 CSS，完全交给手写 CSS 或基础样式
    v: 'none', name: '原生', desc: '不套用预设，完全自定义',
    css: ''
  },
  {
    v: 'classic', name: '经典尖角', desc: '默认微信式，带小三角',
    css: BUBBLE_B + '{ border-radius: 6px; }\n' +
         BUBBLE_T + '{ display: block; }'
  },
  {
    v: 'pill', name: '胶囊气泡', desc: '大圆角，像素游戏风',
    css: BUBBLE_B + '{ border-radius: 22px; padding: 12px 16px; }\n' +
         BUBBLE_T + '{ display: none; }'
  },
  {
    v: 'glass', name: '玻璃拟态', desc: '半透明 + 背景模糊，聊天背景能透出来',
    css: BUBBLE_B + '{ border-radius: 18px; background: var(--bub-glass); border: 1px solid var(--bub-glass-line); ' +
           'box-shadow: 0 6px 18px rgba(0,0,0,.08); -webkit-backdrop-filter: blur(12px) saturate(1.6); backdrop-filter: blur(12px) saturate(1.6); }\n' +
         BUBBLE_U + '{ background: rgba(var(--accent-color-rgb),.78); border-color: rgba(255,255,255,.22); color: var(--secondary-bg); }\n' +
         BUBBLE_T + '{ display: none; }'
  },
  {
    v: 'stack', name: '硬投影纸片', desc: '错位硬阴影，像叠起来的卡片',
    css: BUBBLE_B + '{ border-radius: 12px 12px 12px 4px; box-shadow: 4px 4px 0 -1px rgba(0,0,0,.14), 8px 8px 0 -3px rgba(0,0,0,.09); }\n' +
         BUBBLE_U + '{ border-radius: 12px 12px 4px 12px; }\n' +
         BUBBLE_T + '{ display: none; }\n' +
         DK + BUBBLE_B + '{ box-shadow: 4px 4px 0 -1px rgba(255,255,255,.16), 8px 8px 0 -3px rgba(255,255,255,.09); }'
  }
];

// 「我的气泡」可选颜色（取代原先写死在 :root 的微信绿）
var BUBBLE_USER_COLORS = [
  { v: '#95ec69', label: '微信绿' },
  { v: '#a7c7ff', label: '雾蓝' },
  { v: '#d9c2f0', label: '浅紫' },
  { v: '#f7c6d0', label: '樱粉' },
  { v: '#fde08a', label: '奶黄' },
  { v: '#b8e6d0', label: '薄荷' },
  { v: '#e8e8e8', label: '浅灰' },
  { v: '#111111', label: '纯黑' }
];

// 相对亮度（sRGB → WCAG），用来决定气泡上的文字该用黑还是白
function _bubbleLum(hex) {
  var h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return 1;
  var c = [0, 2, 4].map(function (i) {
    var v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function bubblePresetCss(v) {
  var p = BUBBLE_CSS_PRESETS.filter(function (x) { return x.v === v; })[0];
  // 找不到（含 v 为空/未知）就退回「原生」，而不是硬塞一个经典尖角
  return p ? p.css : '';
}

// 预设与手写 CSS 二选一：预设就是最终样式，不再垫在手写 CSS 底下
// （早前把预设当底层、用户 CSS 叠在上面，但因为预设选择器特异性更高，
//   用户写的永远不生效——已改为互斥）
function applyBubbleCss() {
  if (typeof settings === 'undefined' || !settings) return;
  var custom = settings.bubbleMode === 'custom';
  var css = custom ? (settings.bubbleCss || '') : bubblePresetCss(settings.bubblePreset);
  var el = document.getElementById('kc-bubble-css');
  if (!el) {
    el = document.createElement('style');
    el.id = 'kc-bubble-css';
    document.head.appendChild(el);
  }
  el.textContent = css;

  // 我的气泡颜色：没选就退回主题默认（清掉内联，深色主题才不会被盖掉）
  var root = document.documentElement;
  var col = settings.bubbleUserColor;
  if (col) {
    root.style.setProperty('--bubble-user', col);
    root.style.setProperty('--bubble-user-ink',
      _bubbleLum(col) > 0.45 ? '#111111' : '#ffffff');
  } else {
    root.style.removeProperty('--bubble-user');
    root.style.removeProperty('--bubble-user-ink');
  }
}
window.applyBubbleCss = applyBubbleCss;

// ---------- 三级页：修改聊天气泡 ----------
function renderCiBubbleCss() {
  var body = document.getElementById('contactinfo-body');
  var titleEl = document.getElementById('contactinfo-title');
  if (titleEl) titleEl.textContent = '修改聊天气泡';

  var cur = settings.bubblePreset || 'classic';

  var cards = BUBBLE_CSS_PRESETS.map(function (p) {
    return '<button class="bub-card' + (p.v === cur ? ' active' : '') + '" data-preset="' + p.v + '">' +
        '<span class="bub-prev bub-prev-' + p.v + '"><i></i><i></i></span>' +
        '<span class="bub-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="bub-desc">' + escapeHtml(p.desc) + '</span>' +
      '</button>';
  }).join('');

  var myCol = settings.bubbleUserColor || '';
  var swatches = BUBBLE_USER_COLORS.map(function (c) {
    return '<button class="bub-sw' + (myCol.toLowerCase() === c.v.toLowerCase() ? ' active' : '') +
      '" data-color="' + c.v + '" title="' + c.label + '" style="background:' + c.v + '"></button>';
  }).join('');

  var mode = settings.bubbleMode === 'custom' ? 'custom' : 'preset';
  var usePreset = mode === 'preset';

  var presetBlock = usePreset
    ? '<div class="set-group"><div class="sg-lab">气泡画廊</div>' +
        '<div class="bub-grid">' + cards + '</div>' +
      '</div>'
    : '';

  var customBlock = usePreset ? '' :
    '<div class="set-group"><div class="sg-lab">自定义气泡 CSS</div>' +
      '<div class="set-card">' +
        '<textarea id="bubble-css-input" class="modal-textarea bub-code" spellcheck="false" ' +
          'placeholder=".chat-stream .bubble{\n  border-radius: 20px;\n  background: #ffeef5;\n}">' +
          escapeHtml(settings.bubbleCss || '') + '</textarea>' +
        '<label class="bub-live"><input type="checkbox" id="bubble-css-live">实时应用</label>' +
        '<div class="bub-actions">' +
          '<button class="modal-btn modal-btn-secondary" id="bubble-css-reset">清空</button>' +
          '<button class="modal-btn modal-btn-primary" id="bubble-css-apply">应用 CSS</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  body.innerHTML =
    '<div class="set-group"><div class="sg-lab">气泡样式来源</div>' +
      '<div class="set-card"><div class="bub-mode">' +
        '<button class="bub-mode-btn' + (usePreset ? ' active' : '') + '" data-mode="preset">套用预设</button>' +
        '<button class="bub-mode-btn' + (!usePreset ? ' active' : '') + '" data-mode="custom">自定义 CSS</button>' +
      '</div></div>' +
    '</div>' +

    '<div class="set-group"><div class="sg-lab">我的气泡颜色</div>' +
      '<div class="set-card">' +
        '<div class="bub-sw-row">' + swatches +
          '<label class="bub-color-pick" title="自定义颜色">' +
            '<input type="color" id="bubble-user-color" value="' + escapeHtml(myCol || '#95ec69') + '">' +
            '<i class="fas fa-eye-dropper"></i></label>' +
        '</div>' +
        '<div class="bub-color-foot">' +
          '<span>' + (myCol ? '当前：<b>' + escapeHtml(myCol) + '</b>' : '当前：跟随主题（深色下为深灰）') + '</span>' +
          (myCol ? '<button class="row-btn" id="bubble-color-clear">恢复默认</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +

    presetBlock + customBlock +

    '<div class="set-note">' + (usePreset
      ? '当前套用预设。预设就是最终样式，不会再叠加自定义 CSS；想自己写样式请切到「自定义 CSS」。'
      : '当前完全自定义，不会套用任何预设。基础结构是 ' +
        '<code>.chat-stream &gt; .msg-row.user/.partner &gt; .bubble-wrap &gt; .bubble</code>。<br>' +
        '写 <code>.chat-stream .bubble{...}</code> 即可覆盖基础样式；' +
        '去掉对方/自己的小三角要写 <code>.chat-stream .bubble::before{display:none}</code>；' +
        '红包与「问问你」是透明卡片容器，如需一并改写请自行加 ' +
        '<code>:not(.rp-card-bubble):not(.question-bubble)</code>。') +
    '</div>';

  body.querySelectorAll('.bub-mode-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.bubbleMode = b.dataset.mode;
      saveData();
      applyBubbleCss();
      renderCiBubbleCss();
      if (activeContactId) renderAllMessages();
    });
  });

  body.querySelectorAll('.bub-sw').forEach(function (sw) {
    sw.addEventListener('click', function () {
      settings.bubbleUserColor = sw.dataset.color;
      saveData();
      applyBubbleCss();
      renderCiBubbleCss();
      if (activeContactId) renderAllMessages();
    });
  });

  var picker = body.querySelector('#bubble-user-color');
  if (picker) picker.addEventListener('input', function () {
    settings.bubbleUserColor = picker.value;
    saveData();
    applyBubbleCss();
  });
  var clr = body.querySelector('#bubble-color-clear');
  if (clr) clr.addEventListener('click', function () {
    settings.bubbleUserColor = '';
    saveData();
    applyBubbleCss();
    renderCiBubbleCss();
    if (activeContactId) renderAllMessages();
    toast('我的气泡颜色已恢复默认');
  });

  body.querySelectorAll('[data-preset]').forEach(function (el) {
    el.addEventListener('click', function () {
      settings.bubblePreset = el.dataset.preset;
      saveData();
      applyBubbleCss();
      renderCiBubbleCss();
      toast('已套用「' + presetName(settings.bubblePreset) + '」');
      if (activeContactId) renderAllMessages();
    });
  });

  var ta = body.querySelector('#bubble-css-input');
  var live = body.querySelector('#bubble-css-live');
  if (ta) {
    ta.addEventListener('input', function () {
      if (!live || !live.checked) return;
      settings.bubbleCss = ta.value;
      saveData();
      applyBubbleCss();
    });
  }
  var applyBtn = body.querySelector('#bubble-css-apply');
  if (applyBtn) applyBtn.addEventListener('click', function () {
    settings.bubbleCss = ta.value;
    saveData();
    applyBubbleCss();
    if (activeContactId) renderAllMessages();
    toast('气泡 CSS 已应用');
  });
  var resetBtn = body.querySelector('#bubble-css-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    ta.value = '';
    settings.bubbleCss = '';
    saveData();
    applyBubbleCss();
    toast('已清空自定义 CSS');
  });
}

function presetName(v) {
  var p = BUBBLE_CSS_PRESETS.filter(function (x) { return x.v === v; })[0];
  return p ? p.name : '原生';
}

// 主列表里「修改聊天气泡」那一行的副标题
function bubbleModeLabel() {
  if (settings.bubbleMode === 'custom') return '自定义 CSS';
  return '预设 · ' + presetName(settings.bubblePreset);
}
