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
var BUBBLE_P = '.chat-stream .msg-row.partner .bubble:not(.rp-card-bubble):not(.question-bubble)';
var BUBBLE_T = BUBBLE_B + '::before';
var BUBBLE_UT = BUBBLE_U + '::before';
var BUBBLE_PT = BUBBLE_P + '::before';

// 小三角的完整画法。以前它是 styles.css 里 .bubble::before 写死的，
// 等于不管选不选预设都在；现在整体搬进「经典尖角」预设，别的预设一概没有。
function triangleCss() {
  return BUBBLE_T + '{ content:""; position:absolute; top:12px; display:block;\n' +
         '  border:6px solid transparent; }\n' +
         BUBBLE_PT + '{ left:-6px; right:auto; border-left:0; border-right-color: var(--bubble-partner); }\n' +
         BUBBLE_UT + '{ left:auto; right:-6px; border-right:0; border-left-color: var(--bubble-user); }';
}

// 深色主题下的补丁前缀：预设自带，避免每款都去改 styles.css
var DK = 'html[data-theme="dark"] ';

var BUBBLE_CSS_PRESETS = [
  {
    // 「原生」= 不注入任何预设 CSS，完全交给手写 CSS 或基础样式
    v: 'none', name: '原生', desc: '不套用预设，完全自定义',
    css: ''
  },
  {
    v: 'classic', name: '经典尖角', desc: '微信式，带小三角',
    css: BUBBLE_B + '{ border-radius: 6px; box-shadow: var(--shadow); }\n' + triangleCss()
  },
  {
    v: 'pill', name: '胶囊气泡', desc: '大圆角，像素游戏风',
    css: BUBBLE_B + '{ border-radius: 22px; padding: 12px 16px; box-shadow: var(--shadow); }'
  },
  {
    v: 'glass', name: '玻璃拟态', desc: '半透明 + 背景模糊，聊天背景能透出来',
    css: BUBBLE_B + '{ border-radius: 18px; background: var(--bub-glass); border: 1px solid var(--bub-glass-line); ' +
           'box-shadow: 0 6px 18px rgba(0,0,0,.08); -webkit-backdrop-filter: blur(12px) saturate(1.6); backdrop-filter: blur(12px) saturate(1.6); }\n' +
         BUBBLE_U + '{ background: rgba(var(--accent-color-rgb),.78); border-color: rgba(255,255,255,.22); color: var(--secondary-bg); }'
  },
  {
    v: 'stack', name: '硬投影纸片', desc: '错位硬阴影，像叠起来的卡片',
    css: BUBBLE_B + '{ border-radius: 12px 12px 12px 4px; box-shadow: 4px 4px 0 -1px rgba(0,0,0,.14), 8px 8px 0 -3px rgba(0,0,0,.09); }\n' +
         BUBBLE_U + '{ border-radius: 12px 12px 4px 12px; }\n' +
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
// 预览用的 DOM 必须和聊天流里的结构完全一致（.chat-stream > .msg-row > .bubble-wrap > .bubble），
// 这样用户写的 .chat-stream .bubble{...} 可以原样作用在预览上，所见即所得。
// 别名类 message-sent / message-received 也要带上，好让从别处抄来的
// .message-sent::after 之类装饰 CSS 在预览里同样出效果。
function previewHtml() {
  return '<div class="chat-stream bub-pv">' +
      '<div class="msg-row partner">' +
        '<div class="msg-avatar">🐱</div>' +
        '<div class="bubble-wrap"><div class="bubble message-received">对方发来的消息</div></div>' +
      '</div>' +
      '<div class="msg-row user">' +
        '<div class="msg-avatar">🙂</div>' +
        '<div class="bubble-wrap"><div class="bubble message-sent">我回的一条</div></div>' +
      '</div>' +
    '</div>';
}

// 判断一段 CSS 到底有没有作用到气泡上。
// 光看"语法对不对"没用——用户最常踩的坑是选择器写错但语法完全合法，
// 结果什么都没发生却毫无提示。所以这里直接量预览气泡的实际渲染结果：
// 和「不注入任何 CSS」的基准比，一模一样就说明没匹配上。
var PV_KEYS = ['borderRadius', 'borderTopLeftRadius', 'backgroundColor', 'backgroundImage',
               'boxShadow', 'padding', 'paddingLeft', 'fontSize', 'fontWeight',
               'color', 'borderWidth', 'fontFamily', 'lineHeight', 'transform'];

function pvSignature(root) {
  if (!root) return '';
  var out = [];
  var els = root.querySelectorAll('.bubble');
  for (var i = 0; i < els.length; i++) {
    var cs = getComputedStyle(els[i]);
    for (var j = 0; j < PV_KEYS.length; j++) out.push(cs[PV_KEYS[j]]);
  }
  return out.join('|');
}

// 临时把某段 CSS 塞进 <style> 量一下效果，再恢复原样（同步执行，不会闪）
function measureWith(css, root) {
  var el = document.getElementById('kc-bubble-css');
  if (!el) return '';
  var old = el.textContent;
  el.textContent = css || '';
  var sig = pvSignature(root);
  el.textContent = old;
  return sig;
}

// 返回 '' 表示没问题；否则返回给用户看的一句话
function checkCssError(css, root) {
  if (!css || !css.trim()) return '';

  // 1) 语法：浏览器解析后剩下的规则数，比源文件里的顶层规则少，说明有规则被丢弃
  var probe = document.createElement('style');
  probe.textContent = css;
  document.head.appendChild(probe);
  var parsed = probe.sheet ? probe.sheet.cssRules.length : 0;
  probe.remove();
  var expected = 0, depth = 0, seen = false;
  for (var i = 0; i < css.length; i++) {
    var ch = css[i];
    if (ch === '{') { if (depth === 0) expected++; depth++; seen = true; }
    else if (ch === '}') { depth--; if (depth < 0) break; }
  }
  if (!seen) return '这段里没有 { }，不会生效';
  if (parsed < expected) {
    return '有 ' + (expected - parsed) + ' 段写错了（多半是少了分号或括号不配对），浏览器已经丢掉它们';
  }

  // 2) 有没有真的作用到气泡上
  if (root && measureWith('', root) === measureWith(css, root)) {
    return '语法没问题，但没有匹配到气泡。常见原因：类名写错（是 .bubble 不是 .msg-bubble / .chat-bubble）、' +
           '或者把选择器写成了后代但少了中间的 .chat-stream';
  }
  return '';
}

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
        '<div class="bub-live-row">' +
          '<label class="bub-live"><input type="checkbox" id="bubble-css-live" checked>边写边预览</label>' +
          '<button class="bub-err" id="bubble-css-err" hidden></button>' +
        '</div>' +
        '<div class="bub-actions">' +
          '<button class="modal-btn modal-btn-secondary" id="bubble-css-reset">清空</button>' +
          '<button class="modal-btn modal-btn-primary" id="bubble-css-apply">应用 CSS</button>' +
        '</div>' +
      '</div>' +
      '<div class="set-group"><div class="sg-lab">预览</div>' +
        '<div class="set-card">' + previewHtml() +
          '<div class="bub-prev-foot">预览用的是和你聊天里一模一样的结构，' +
          '选择器可以直接照抄。</div>' +
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
      : '当前完全自定义，不会套用任何预设，基础样式是<b>零装饰</b>的：没有圆角、没有小三角、没有投影，' +
        '只有必要的内边距和换行行为。<br>' +
        '结构是 <code>.chat-stream &gt; .msg-row.user/.partner &gt; .bubble-wrap &gt; .bubble</code>，' +
        '写 <code>.chat-stream .bubble{...}</code> 即可；想要小三角可以自己用 ' +
        '<code>.bubble::before</code> 加。<br>' +
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
  var errBox = body.querySelector('#bubble-css-err');

  function showErr(msg) {
    if (!errBox) return;
    if (msg) { errBox.textContent = msg; errBox.hidden = false; }
    else { errBox.hidden = true; }
  }

  var pv = body.querySelector('.bub-pv');

  // 预览和真实聊天共用同一份 <style>，所以这里 apply 一次两边同时变
  function push(alsoSave) {
    settings.bubbleCss = ta.value;
    if (alsoSave) saveData();
    applyBubbleCss();
    showErr(checkCssError(ta.value, pv));
    if (activeContactId) renderAllMessages();
  }

  if (ta) {
    ta.addEventListener('input', function () {
      if (!live || !live.checked) return;
      push(false);
    });
  }
  var applyBtn = body.querySelector('#bubble-css-apply');
  if (applyBtn) applyBtn.addEventListener('click', function () {
    push(true);
    toast(checkCssError(ta.value, pv) ? '有问题，见预览上方的红字' : '气泡 CSS 已应用，聊天里也生效了');
  });
  var resetBtn = body.querySelector('#bubble-css-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    ta.value = '';
    push(true);
    toast('已清空自定义 CSS');
  });

  if (live) {
    live.checked = true;
    showErr(checkCssError(ta ? ta.value : '', pv));
  }
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
