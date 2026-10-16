/* ============ 日期滚轮选择器 ============ */
/* 三列（年 / 月 / 日），拖动滚动，松手吸附到中间。
   纪念日要选过去、倒数日要选未来，所以年份做成 1970~2070 双向。
   日列固定 31 格：切换到小月时把超出当月天数的格子置灰并自动夹回来，
   这样不会出现 2月30日，也不需要重建列。                          */

var WHEEL_Y_MIN = 1970;
var WHEEL_Y_MAX = 2070;

function daysInMonth(y, m) {   // m 是 1~12
  return new Date(y, m, 0).getDate();
}

// 解析 'YYYY-MM-DD'，解析不了就用今天
function parseYmd(s) {
  var t = new Date();
  var p = String(s || '').split('-');
  if (p.length !== 3) return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (!y || !m || !d) return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  m = Math.min(12, Math.max(1, m));
  d = Math.min(daysInMonth(y, m), Math.max(1, d));
  return { y: y, m: m, d: d };
}

function fmtYmd(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// ---------- 单列滚轮 ----------
function _wheelColumn(items, initialIndex, onChange, dimFn) {
  var wrap = document.createElement('div');
  wrap.className = 'dw-col';
  var list = document.createElement('div');
  list.className = 'dw-list';
  items.forEach(function (t) {
    var it = document.createElement('div');
    it.className = 'dw-item';
    it.textContent = t;
    list.appendChild(it);
  });
  wrap.appendChild(list);
  var maskEl = document.createElement('div');
  maskEl.className = 'dw-mask';
  wrap.appendChild(maskEl);

  var idx = Math.max(0, Math.min(items.length - 1, initialIndex));
  var itemH = 38;
  // .dw-wrap 高 190px，正好露 5 行，选中行是中间那行（索引 2）。
  // 用 (2 - idx) 偏移，选中项才会落在正中间、和 .dw-sel 那条高亮对齐。
  var MID = 2;

  function paint(t) {
    list.style.transform = 'translateY(' + t + 'px)';
  }

  function render() {
    paint((MID - idx) * itemH);
    Array.prototype.forEach.call(list.children, function (n, i) {
      var dist = Math.abs(i - idx);
      n.className = 'dw-item' + (dist === 0 ? ' on' : (dist === 1 ? ' near' : ''));
      // dimFn 返回 true 表示这格不可选
      var off = dimFn ? !!dimFn(i) : false;
      n.classList.toggle('off', off);
      if (dist === 0) n.classList.toggle('on-off', off);
    });
    if (onChange) onChange(items[idx], idx);
  }

  // 拖动：跟手移动，松手按速度吸附
  var startY = 0, startIdx = 0, moved = 0, lastY = 0, lastT = 0, vel = 0, dragging = false;
  function down(e) {
    var p = e.touches ? e.touches[0] : e;
    dragging = true; moved = 0;
    startY = lastY = p.clientY; startIdx = idx;
    lastT = Date.now(); vel = 0;
    list.classList.add('drag');
    if (e.cancelable) e.preventDefault();
  }
  function move(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    var dy = p.clientY - startY;
    moved = Math.max(moved, Math.abs(dy));
    var now = Date.now();
    if (now > lastT) vel = (p.clientY - lastY) / (now - lastT);   // px/ms
    lastY = p.clientY; lastT = now;
    list.style.transform = 'translateY(' + ((MID - startIdx) * itemH + dy) + 'px)';
    if (e.cancelable) e.preventDefault();
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    list.classList.remove('drag');
    var dy = lastY - startY;
    var shift = -dy / itemH;
    if (Math.abs(vel) > 0.45) shift += (vel > 0 ? 1 : -1) * 1.2;   // 快速甩动多滚几格
    var want = Math.max(0, Math.min(items.length - 1, Math.round(startIdx + shift)));
    if (dimFn && dimFn(want)) {                                     // 别停在不可选的那格
      var back = want > startIdx ? want - 1 : want + 1;
      want = Math.max(0, Math.min(items.length - 1, back));
    }
    idx = want;
    render();
  }
  wrap.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  wrap.addEventListener('touchstart', down, { passive: false });
  wrap.addEventListener('touchmove', move, { passive: false });
  wrap.addEventListener('touchend', up);

  // 点格子直接跳过去
  list.addEventListener('click', function (e) {
    var n = e.target.closest('.dw-item');
    if (!n || moved > 6) return;
    var i = Array.prototype.indexOf.call(list.children, n);
    if (dimFn && dimFn(i)) return;
    idx = i;
    render();
  });

  render();
  return {
    el: wrap,
    getIndex: function () { return idx; },
    setIndex: function (i, silent) {
      idx = Math.max(0, Math.min(items.length - 1, i));
      if (silent) {
        paint((MID - idx) * itemH);
        Array.prototype.forEach.call(list.children, function (n, i2) {
          var dist = Math.abs(i2 - idx);
          n.className = 'dw-item' + (dist === 0 ? ' on' : (dist === 1 ? ' near' : ''));
          var off = dimFn ? !!dimFn(i2) : false;
          n.classList.toggle('off', off);
          n.classList.toggle('on-off', off);
        });
      } else {
        render();
      }
    }
  };
}

// ---------- 三列日期选择 ----------
function openDateWheel(onOk, prefill) {
  var old = document.getElementById('date-wheel');
  if (old) old.remove();

  var cur = parseYmd(prefill);
  var years = [], months = [], days = [];
  for (var y = WHEEL_Y_MIN; y <= WHEEL_Y_MAX; y++) years.push(String(y));
  for (var m = 1; m <= 12; m++) months.push(m + '月');
  for (var d = 1; d <= 31; d++) days.push(String(d));

  function maxDay() { return daysInMonth(cur.y, cur.m); }
  // 日列里超过当月天数的格子置灰
  function dayOff(i) { return (i + 1) > maxDay(); }
  // 注意：年/月两列在构造时就会触发一次 onChange，那时 dCol 还没建好，
  // 所以这里要挡住；初始值由 dCol 自己的构造读 cur.d 接手。
  function clampDay() {
    var mx = maxDay();
    if (cur.d > mx) cur.d = mx;
    if (typeof dCol !== 'undefined' && dCol) dCol.setIndex(cur.d - 1, true);
  }

  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'date-wheel';
  mask.innerHTML =
    '<div class="modal-box dw-box">' +
      '<div class="m-title">选择日期</div>' +
      '<div class="dw-wrap">' +
        '<div class="dw-sel"></div>' +
        '<div class="dw-cols" id="dw-cols"></div>' +
      '</div>' +
      '<div class="dw-quick">' +
        '<button class="dw-q" data-q="today">今天</button>' +
        '<button class="dw-q" data-q="yesterday">昨天</button>' +
        '<button class="dw-q" data-q="tomorrow">明天</button>' +
      '</div>' +
      '<div class="m-actions">' +
        '<button class="m-btn-cancel">取消</button>' +
        '<button class="m-btn-ok">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mask);

  var colsBox = mask.querySelector('#dw-cols');
  var yCol = _wheelColumn(years, years.indexOf(String(cur.y)), function (v) {
    cur.y = Number(v);
    clampDay();          // 闰年等变化
  });
  var mCol = _wheelColumn(months, cur.m - 1, function (v) {
    cur.m = parseInt(v, 10);
    clampDay();          // 夹到当月最大天
  });
  var dCol = _wheelColumn(days, cur.d - 1, function (v) { cur.d = Number(v); }, dayOff);

  colsBox.appendChild(yCol.el);
  colsBox.appendChild(mCol.el);
  colsBox.appendChild(dCol.el);

  mask.querySelectorAll('.dw-q').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = new Date();
      if (b.dataset.q === 'yesterday') t.setDate(t.getDate() - 1);
      if (b.dataset.q === 'tomorrow') t.setDate(t.getDate() + 1);
      cur.y = t.getFullYear(); cur.m = t.getMonth() + 1; cur.d = t.getDate();
      yCol.setIndex(years.indexOf(String(cur.y)), true);
      mCol.setIndex(cur.m - 1, true);
      dCol.setIndex(cur.d - 1, true);
    });
  });

  mask.querySelector('.m-btn-cancel').addEventListener('click', function () { mask.remove(); });
  mask.querySelector('.m-btn-ok').addEventListener('click', function () {
    var out = fmtYmd(cur.y, cur.m, Math.min(cur.d, maxDay()));
    mask.remove();
    onOk(out);
  });
  mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
}
