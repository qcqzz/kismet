/* ============ 字卡传讯 · 日程（月历 + 当日待办 + 提醒） ============ */
/*
 * 数据：scheduleTodos [{ id, text, time:'HH:MM', date:'YYYY-MM-DD',
 *   repeat:'none'|'weekly', weekdays:[0..6]（0=周日）, remind:'ontime'|'advance'|'none',
 *   advanceMinutes, contactId }]
 *
 * 提醒同样接入现有通知体系：前台横幅 / 后台系统通知，按梦角独立分组。
 */
(function () {
  if (window.__KismetScheduleLoaded) return;
  window.__KismetScheduleLoaded = true;

  var KEY_TODO = 'scheduleTodos';
  var KEY_FIRED = 'scheduleReminderFired';
  var WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  var _bound = false;
  var _curYear, _curMonth, _selDate;
  var _timer = null;

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
  function fmtYM(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function ymdToDate(s) {
    var p = String(s || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function parseHM(hhmm) {
    var m = String(hhmm || '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
  }
  function dayDiff(a, b) {
    var A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((A - B) / 86400000);
  }

  // ---------- 存取 ----------
  function getTodos() {
    var v = Storage.get(KEY_TODO);
    return Array.isArray(v) ? v : [];
  }
  function saveTodos(list) { Storage.set(KEY_TODO, list || []); }

  function weekdaySet(t) {
    var set = [];
    if (t.repeat === 'weekly' && Array.isArray(t.weekdays)) {
      t.weekdays.forEach(function (v) {
        v = parseInt(v, 10);
        if (v >= 0 && v <= 6) set.push(v);
      });
    }
    return set;
  }

  // 某天是否有这条待办
  function occursOn(t, d) {
    if (t.repeat === 'weekly') {
      var set = weekdaySet(t);
      return set.length > 0 && set.indexOf(d.getDay()) >= 0;
    }
    return t.date === fmtYM(d);
  }

  // 某天这条待办的发生时间
  function occurrenceOn(t, d) {
    if (!occursOn(t, d)) return null;
    var hm = parseHM(t.time) || { h: 9, m: 0 };
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm.h, hm.m, 0, 0);
  }

  // 下一次发生时间（用于「即将到来」）
  function nextOccurrence(t, now) {
    now = now || new Date();
    for (var i = 0; i <= 370; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var occ = occurrenceOn(t, d);
      if (occ && occ.getTime() > now.getTime()) return occ;
    }
    return null;
  }

  function dayTodos(d) {
    var res = getTodos().filter(function (t) { return occursOn(t, d); });
    res.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    return res;
  }

  function relLabel(ts) {
    var now = today0();
    var t = new Date(ts); t.setHours(0, 0, 0, 0);
    var diff = Math.round((t - now) / 86400000);
    var d = new Date(ts);
    var timeStr = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (diff === 0) return '今天 ' + timeStr;
    if (diff === 1) return '明天 ' + timeStr;
    if (diff === 2) return '后天 ' + timeStr;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + timeStr;
  }

  function upcoming(limit) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var arr = [];
    getTodos().forEach(function (t) {
      var d = nextOccurrence(t, now);
      // 今天已经到点、但还没结束的待办也要显示出来
      if (!d) d = occurrenceOn(t, today);
      if (!d) return;
      arr.push({ text: t.text, label: relLabel(d.getTime()), ts: d.getTime() });
    });
    arr.sort(function (a, b) { return a.ts - b.ts; });
    return arr.slice(0, limit == null ? 3 : limit);
  }

  // ---------- 弹层 ----------
  function closeSheet() {
    var w = document.getElementById('kismet-app-sheet');
    if (w) w.remove();
  }
  function openSheet(title, html, onMount) {
    closeSheet();
    var wrap = document.createElement('div');
    wrap.className = 'app-overlay open';
    wrap.id = 'kismet-app-sheet';
    wrap.innerHTML = '<div class="app-sheet"><div class="app-sheet-title">' + esc(title) + '</div>' + html + '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    if (onMount) onMount(wrap);
    return wrap;
  }

  // ---------- 页面 ----------
  function initDateState() {
    var now = new Date();
    _curYear = now.getFullYear();
    _curMonth = now.getMonth();
    _selDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function render() {
    var body = document.getElementById('schedule-body');
    if (!body) return;

    var html = '';

    // 即将到来
    var up = upcoming(3);
    html += '<div class="app-card">' +
      '<div class="app-card-title"><span>即将到来</span>' +
        '<button class="app-btn sm" data-act="add"><i class="fas fa-plus"></i> 新增</button></div>' +
      (up.length ? up.map(function (it) {
        return '<div class="sc-upcoming">' +
          '<span class="sc-up-dot"></span>' +
          '<span class="sc-up-text">' + esc(it.text) + '</span>' +
          '<span class="sc-up-time">' + esc(it.label) + '</span>' +
        '</div>';
      }).join('') : '<div class="app-empty"><i class="far fa-calendar"></i>暂无待办</div>') +
    '</div>';

    // 日历
    html += '<div class="app-card">' + calendarHtml() + '</div>';

    // 当日待办
    html += '<div class="app-card">' +
      '<div class="app-card-title"><span class="sc-day-label">' + dayLabel() + '</span>' +
        '<button class="app-btn sm" data-act="add"><i class="fas fa-plus"></i> 新增</button></div>' +
      dayListHtml() +
    '</div>';

    body.innerHTML = html;
  }

  function dayLabel() {
    var d = _selDate || today0();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function calendarHtml() {
    var today = new Date();
    var first = new Date(_curYear, _curMonth, 1);
    var lead = (first.getDay() + 6) % 7; // 周一起始
    var daysInMonth = new Date(_curYear, _curMonth + 1, 0).getDate();
    var html =
      '<div class="cal-head">' +
        '<button class="cal-nav" data-act="prevMonth" aria-label="上个月"><i class="fas fa-chevron-left"></i></button>' +
        '<div class="cal-title">' + _curYear + '年' + (_curMonth + 1) + '月</div>' +
        '<button class="cal-nav" data-act="nextMonth" aria-label="下个月"><i class="fas fa-chevron-right"></i></button>' +
      '</div>' +
      '<div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
      '<div class="cal-grid">';
    for (var i = 0; i < lead; i++) html += '<div class="cal-cell blank"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var dt = new Date(_curYear, _curMonth, d);
      var cls = 'cal-cell';
      if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()) cls += ' today';
      if (_selDate && fmtYM(dt) === fmtYM(_selDate)) cls += ' sel';
      var has = dayTodos(dt).length > 0;
      html += '<div class="' + cls + '" data-act="pickDay" data-date="' + fmtYM(dt) + '">' +
        '<span class="cal-num">' + d + '</span>' +
        (has ? '<span class="cal-dot"></span>' : '') + '</div>';
    }
    html += '</div>';
    return html;
  }

  function dayListHtml() {
    var d = _selDate || today0();
    var list = dayTodos(d);
    if (!list.length) return '<div class="sc-day-empty">当天暂无待办</div>';
    return list.map(function (t) {
      var hm = parseHM(t.time);
      var tags = [];
      if (t.repeat === 'weekly') tags.push('每周');
      if (t.remind === 'advance') tags.push('提前' + (t.advanceMinutes || 10) + '分钟');
      else if (t.remind === 'ontime') tags.push('到点提醒');
      return '<div class="sc-todo">' +
        '<div class="sc-time">' + (hm ? pad2(hm.h) + ':' + pad2(hm.m) : '') + '</div>' +
        '<div class="sc-main">' +
          '<div class="sc-text">' + esc(t.text) + '</div>' +
          (tags.length ? '<div class="sc-meta">' + tags.map(function (x) { return '<span class="sc-tag">' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
        '</div>' +
        '<button class="sc-del" data-act="del" data-id="' + esc(t.id) + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
      '</div>';
    }).join('');
  }

  // ---------- 新增待办 ----------
  function openAddSheet() {
    var d = _selDate || today0();
    var singles = contacts.filter(function (c) { return !isGroupContact(c); });
    var contactOpts = '<option value="">字卡传讯</option>' + singles.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join('');

    var html =
      '<div class="app-field"><div class="app-label">待办名称</div>' +
        '<input class="app-input" id="sc-text" placeholder="要做什么"></div>' +
      '<div class="app-field"><div class="app-label">时间</div>' +
        '<input class="app-input" id="sc-time" type="time" value="09:00"></div>' +
      '<div class="app-field"><div class="app-label">重复</div>' +
        '<div class="app-chips" id="sc-repeat">' +
          '<button type="button" class="app-chip on" data-v="none">不重复</button>' +
          '<button type="button" class="app-chip" data-v="weekly">每周</button>' +
        '</div></div>' +
      '<div class="app-field" id="sc-date-wrap"><div class="app-label">日期</div>' +
        '<input class="app-input" id="sc-date" type="date" value="' + fmtYM(d) + '"></div>' +
      '<div class="app-field" id="sc-week-wrap" style="display:none"><div class="app-label">星期</div>' +
        '<div class="app-chips" id="sc-weekdays">' +
          [1, 2, 3, 4, 5, 6, 0].map(function (w) {
            return '<button type="button" class="app-chip" data-v="' + w + '">周' + WEEK_LABELS[w] + '</button>';
          }).join('') +
        '</div></div>' +
      '<div class="app-field"><div class="app-label">提醒</div>' +
        '<div class="app-chips" id="sc-remind">' +
          '<button type="button" class="app-chip on" data-v="ontime">到点提醒</button>' +
          '<button type="button" class="app-chip" data-v="advance">提前提醒</button>' +
          '<button type="button" class="app-chip" data-v="none">不提醒</button>' +
        '</div></div>' +
      '<div class="app-field" id="sc-advance-wrap" style="display:none"><div class="app-label">提前分钟</div>' +
        '<input class="app-input" id="sc-advance" type="number" min="1" max="1440" value="10"></div>' +
      '<div class="app-field"><div class="app-label">谁来提醒</div>' +
        '<select class="app-select" id="sc-contact">' + contactOpts + '</select></div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-act="closeSheet">取消</button>' +
        '<button class="app-btn primary" data-act="save">保存</button>' +
      '</div>';

    openSheet('新增待办', html, function (wrap) {
      var repeat = 'none';
      var remind = 'ontime';
      var weekdays = [];

      function syncRepeat() {
        wrap.querySelector('#sc-date-wrap').style.display = repeat === 'weekly' ? 'none' : '';
        wrap.querySelector('#sc-week-wrap').style.display = repeat === 'weekly' ? '' : 'none';
      }
      function syncRemind() {
        wrap.querySelector('#sc-advance-wrap').style.display = remind === 'advance' ? '' : 'none';
      }

      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (btn) {
          if (btn.dataset.act === 'closeSheet') { closeSheet(); return; }
          if (btn.dataset.act === 'save') {
            var text = (wrap.querySelector('#sc-text').value || '').trim();
            if (!text) { if (typeof toast === 'function') toast('先写点要做什么'); return; }
            var time = wrap.querySelector('#sc-time').value || '09:00';
            var date = wrap.querySelector('#sc-date').value || fmtYM(today0());
            if (repeat === 'weekly' && !weekdays.length) { if (typeof toast === 'function') toast('选一个星期'); return; }
            var todo = {
              id: uid(),
              text: text,
              time: time,
              date: repeat === 'weekly' ? '' : date,
              repeat: repeat,
              weekdays: repeat === 'weekly' ? weekdays.slice() : [],
              remind: remind,
              advanceMinutes: remind === 'advance' ? Math.max(1, parseInt(wrap.querySelector('#sc-advance').value, 10) || 10) : 0,
              contactId: wrap.querySelector('#sc-contact').value || ''
            };
            var list = getTodos();
            list.push(todo);
            saveTodos(list);
            _selDate = repeat === 'weekly' ? (_selDate || today0()) : (ymdToDate(date) || today0());
            closeSheet();
            render();
            checkReminders();
            if (typeof toast === 'function') toast('已添加待办');
          }
          return;
        }

        var repeatChip = e.target.closest('#sc-repeat .app-chip');
        if (repeatChip) {
          wrap.querySelectorAll('#sc-repeat .app-chip').forEach(function (b) { b.classList.remove('on'); });
          repeatChip.classList.add('on');
          repeat = repeatChip.dataset.v;
          syncRepeat();
          return;
        }
        var wdChip = e.target.closest('#sc-weekdays .app-chip');
        if (wdChip) {
          var w = parseInt(wdChip.dataset.v, 10);
          var idx = weekdays.indexOf(w);
          if (idx >= 0) { weekdays.splice(idx, 1); wdChip.classList.remove('on'); }
          else { weekdays.push(w); wdChip.classList.add('on'); }
          return;
        }
        var remChip = e.target.closest('#sc-remind .app-chip');
        if (remChip) {
          wrap.querySelectorAll('#sc-remind .app-chip').forEach(function (b) { b.classList.remove('on'); });
          remChip.classList.add('on');
          remind = remChip.dataset.v;
          syncRemind();
        }
      });
    });
  }

  // ---------- 提醒 ----------
  function getFired() {
    var v = Storage.get(KEY_FIRED);
    return (v && typeof v === 'object') ? v : {};
  }
  function saveFired(o) {
    if (Object.keys(o).length > 800) o = {};
    Storage.set(KEY_FIRED, o);
  }

  function checkReminders() {
    var list = getTodos();
    if (!list.length) return;
    var now = new Date();
    var nowTs = now.getTime();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var fired = getFired();
    var changed = false;

    list.forEach(function (t) {
      if (t.remind === 'none') return;
      var occ = occurrenceOn(t, today);
      if (!occ) return;
      var remindAt = occ.getTime() - (t.remind === 'advance' ? Math.max(1, Number(t.advanceMinutes) || 10) * 60000 : 0);
      if (remindAt > nowTs || nowTs - remindAt >= 90000) return;
      var key = t.id + '#' + occ.getTime();
      if (fired[key]) return;
      fired[key] = 1;
      changed = true;
      fireReminder(t, occ, remindAt);
    });

    if (changed) saveFired(fired);
  }

  function fireReminder(t, occ, remindAt) {
    var cid = t.contactId || '';
    var c = cid ? memberById(cid) : null;
    var name = (c && c.name) ? c.name : '日程提醒';
    var body;
    if (t.remind === 'advance') {
      var mins = Math.max(1, Math.round((occ.getTime() - remindAt) / 60000));
      body = '还有 ' + mins + ' 分钟：' + t.text;
    } else {
      body = '待办：' + t.text;
    }
    try {
      if (typeof notifyDeliver === 'function') notifyDeliver(cid, name, body, 'schedule');
    } catch (e) { console.warn('[Schedule] 提醒失败:', e); }
  }

  function startTimer() {
    checkReminders();
    if (_timer) return;
    _timer = setInterval(checkReminders, 30000);
  }

  // ---------- 事件 ----------
  function bind() {
    if (_bound) return;
    _bound = true;

    var add = document.getElementById('schedule-add-btn');
    if (add) add.addEventListener('click', openAddSheet);

    var body = document.getElementById('schedule-body');
    if (body) {
      body.addEventListener('click', function (e) {
        var el = e.target.closest('[data-act]');
        if (!el) return;
        var act = el.dataset.act;
        if (act === 'prevMonth') {
          _curMonth--; if (_curMonth < 0) { _curMonth = 11; _curYear--; }
          render();
        } else if (act === 'nextMonth') {
          _curMonth++; if (_curMonth > 11) { _curMonth = 0; _curYear++; }
          render();
        } else if (act === 'pickDay') {
          _selDate = ymdToDate(el.dataset.date) || today0();
          render();
        } else if (act === 'add') {
          openAddSheet();
        } else if (act === 'del') {
          var id = el.dataset.id;
          var list = getTodos();
          var target = list.find(function (t) { return t.id === id; });
          confirmModal('删除待办', target ? '确定删除「' + target.text + '」吗？' : '确定删除这条待办吗？', function () {
            saveTodos(getTodos().filter(function (t) { return t.id !== id; }));
            render();
          }, { danger: true });
        }
      });
    }
  }

  window.ScheduleApp = {
    onShow: function () {
      bind();
      render();
      startTimer();
    },
    render: render,
    checkReminders: checkReminders,
    openAdd: openAddSheet
  };

  if (!_curYear) initDateState();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bind(); startTimer(); });
  } else {
    bind();
    startTimer();
  }
})();
