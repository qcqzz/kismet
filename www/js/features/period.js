/* ============ 字卡传讯 · 经期（状态 / 日历 / 统计 / 记录 / 提醒） ============ */
/*
 * 数据全部走本地存储（Storage 已带 APP_PREFIX）：
 *   periodSettings  { lastStart:'YYYY-MM-DD', cycleDays, periodDays, lutealDays }
 *   periodLogs      { 'YYYY-MM-DD': { flow:[], symptoms:[], mood:[], note } }
 *   periodReminder  { enabled, advanceDays:[1], time:'09:00', quotes:[], contactId }
 *   periodCycles    [{ start, end, days }]
 *   periodCurrent   { start }
 *
 * 提醒接入现有通知体系：前台顶部横幅、后台系统通知（按梦角独立分组）。
 */
(function () {
  if (window.__KismetPeriodLoaded) return;
  window.__KismetPeriodLoaded = true;

  var KEY_SET = 'periodSettings';
  var KEY_LOG = 'periodLogs';
  var KEY_REM = 'periodReminder';
  var KEY_CYCLE = 'periodCycles';
  var KEY_CUR = 'periodCurrent';
  var KEY_FIRED = 'periodReminderFired';

  var FLOW_OPTIONS = ['很少', '较少', '正常', '较多', '很多'];
  var SYMPTOM_OPTIONS = ['痛经', '腰酸', '头痛', '腹胀', '胸胀', '疲惫', '恶心', '腹泻', '无'];
  var MOOD_OPTIONS = ['开心', '平静', '易怒', '焦虑', '低落', '烦躁'];

  var _bound = false;
  var _curYear, _curMonth, _selDate;
  var _remTimer = null;

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
  function fmtYM(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function ymdToDate(s) {
    var p = String(s || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dayDiff(a, b) {
    var A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((A - B) / 86400000);
  }
  function g(v, dflt) { var n = parseInt(v, 10); return isNaN(n) ? dflt : n; }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  // ---------- 存取 ----------
  function getSettings() {
    var v = Storage.get(KEY_SET);
    return (v && typeof v === 'object') ? v : null;
  }
  function saveSettings(s) { Storage.set(KEY_SET, s || null); }

  function getLogs() {
    var v = Storage.get(KEY_LOG);
    return (v && typeof v === 'object') ? v : {};
  }
  function saveLogs(o) { Storage.set(KEY_LOG, o || {}); }

  function getReminder() {
    var v = Storage.get(KEY_REM);
    return (v && typeof v === 'object') ? v : {};
  }
  function saveReminder(r) { Storage.set(KEY_REM, r || {}); }
  function defaultReminder() {
    return { enabled: true, advanceDays: [1], time: '09:00', quotes: [], contactId: '' };
  }

  function getCycles() {
    var v = Storage.get(KEY_CYCLE);
    return Array.isArray(v) ? v : [];
  }
  function saveCycles(list) { Storage.set(KEY_CYCLE, list || []); }
  function getCurrent() {
    var v = Storage.get(KEY_CUR);
    return (v && v.start) ? v : null;
  }
  function saveCurrent(c) { Storage.set(KEY_CUR, c || null); }

  // ---------- 周期计算 ----------
  function periodStartFor(d, s) {
    var first = ymdToDate(s.lastStart);
    if (!first) return null;
    var cycle = g(s.cycleDays, 28) || 28;
    var diff = dayDiff(d, first);
    var k = Math.floor(diff / cycle);
    return addDays(first, k * cycle);
  }

  function computeStatus(s, today) {
    if (!s || !s.lastStart) return null;
    var first = ymdToDate(s.lastStart);
    if (!first) return null;
    var cycle = g(s.cycleDays, 28), pDays = g(s.periodDays, 5), luteal = g(s.lutealDays, 14);
    if (cycle <= 0 || pDays <= 0 || luteal <= 0) return null;
    today = today || today0();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var P = periodStartFor(today, s);
    var periodEnd = addDays(P, pDays - 1);
    var nextP = addDays(P, cycle);
    var ovuDay = addDays(nextP, -luteal);
    var ovuStart = addDays(ovuDay, -5);
    var ovuEnd = addDays(ovuDay, 4);
    var inPeriod = dayDiff(today, P) >= 0 && dayDiff(today, P) < pDays;
    if (inPeriod) {
      return { main: '经期第' + (dayDiff(today, P) + 1) + '天', sub: '预计 ' + fmtMD(periodEnd) + ' 结束' };
    }
    if (dayDiff(today, ovuStart) < 0) {
      return { main: '距离排卵期' + dayDiff(ovuStart, today) + '天', sub: '预计 ' + fmtMD(ovuDay) + ' 排卵' };
    }
    if (dayDiff(today, ovuEnd) <= 0) {
      if (dayDiff(today, ovuDay) === 0) return { main: '排卵日', sub: '今天状态棒棒哒' };
      return {
        main: '排卵期第' + (dayDiff(today, ovuStart) + 1) + '天',
        sub: dayDiff(today, ovuDay) < 0 ? '即将到排卵日' : '刚过排卵日'
      };
    }
    return { main: '距离预测经期' + dayDiff(nextP, today) + '天', sub: '预计 ' + fmtMD(nextP) + ' 开始' };
  }

  function classifyDay(d, s) {
    var res = { kind: null };
    if (!s || !s.lastStart) return res;
    var first = ymdToDate(s.lastStart);
    if (!first) return res;
    var cycle = g(s.cycleDays, 28), pDays = g(s.periodDays, 5), luteal = g(s.lutealDays, 14);
    if (cycle <= 0 || pDays <= 0 || luteal <= 0) return res;
    var P = periodStartFor(d, s);
    var inPeriod = dayDiff(d, P) >= 0 && dayDiff(d, P) < pDays;
    if (inPeriod) {
      res.kind = (P <= today0()) ? 'period' : 'predicted';
      return res;
    }
    var nextP = addDays(P, cycle);
    var ovuDay = addDays(nextP, -luteal);
    var ovuStart = addDays(ovuDay, -5);
    var ovuEnd = addDays(ovuDay, 4);
    if (dayDiff(d, ovuStart) >= 0 && dayDiff(d, ovuEnd) <= 0) {
      res.kind = (dayDiff(d, ovuDay) === 0) ? 'ovuday' : 'ovu';
    }
    return res;
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
  window._periodCloseSheet = closeSheet;

  // ---------- 页面 ----------
  function initDateState() {
    var now = new Date();
    _curYear = now.getFullYear();
    _curMonth = now.getMonth();
    _selDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function render() {
    var body = document.getElementById('period-body');
    if (!body) return;
    var s = getSettings();
    var st = computeStatus(s);
    var rem = getReminder();
    var remOn = rem.enabled !== false;

    var html = '';

    // 状态
    html += '<div class="pd-status"><div class="pd-status-label"><i class="fas fa-heartbeat"></i> 今日</div>';
    if (!s || !s.lastStart) {
      html += '<div class="pd-status-empty">还没有经期信息<br>点右上角设置，填上最近一次经期开始日</div>';
    } else if (!st) {
      html += '<div class="pd-status-empty">经期信息有误<br>请重新设置</div>';
    } else {
      html += '<div class="pd-status-main">' + esc(st.main) + '</div>' +
        '<div class="pd-status-sub">' + esc(st.sub) + '</div>';
    }
    html += '</div>';

    // 打卡条
    var cur = getCurrent();
    if (cur && cur.start) {
      var stDate = ymdToDate(cur.start);
      var dayN = stDate ? (dayDiff(today0(), stDate) + 1) : 1;
      html += '<div class="pd-cycle-bar">' +
        '<span class="pd-tag on">经期第 ' + dayN + ' 天</span>' +
        '<span class="pd-bar-msg">' + (stDate ? esc(fmtMD(stDate)) : '') + ' 开始</span>' +
        '<button class="pd-bar-btn" data-act="end">标记结束</button>' +
      '</div>';
    } else {
      var msg = (s && s.lastStart) ? (computeStatus(s) || {}).main || '' : '尚未记录经期';
      if (msg && !/^经期第/.test(msg)) msg = msg + '，点右侧按钮开始记录';
      html += '<div class="pd-cycle-bar">' +
        '<span class="pd-tag">今天</span>' +
        '<span class="pd-bar-msg">' + esc(msg) + '</span>' +
        '<button class="pd-bar-btn" data-act="start">标记今天开始</button>' +
      '</div>';
    }

    // 日历
    html += '<div class="app-card">' + calendarHtml(s) + '</div>';

    // 统计
    var stats = calcStats(s);
    html += '<div class="pd-stats">' +
      '<div class="pd-stat"><b>' + stats.cycle + '</b><span>平均周期（天）</span></div>' +
      '<div class="pd-stat"><b>' + stats.period + '</b><span>平均经期（天）</span></div>' +
      '<div class="pd-stat"><b>' + stats.count + '</b><span>记录次数</span></div>' +
    '</div>';

    // 历史记录
    html += '<div class="app-card">' +
      '<div class="app-card-title"><span>经期记录</span>' +
        '<button class="app-btn sm" data-act="reminder">' + (remOn ? '<i class="fas fa-bell"></i> 提醒已开' : '<i class="far fa-bell"></i> 提醒已关') + '</button>' +
      '</div>' + cyclesHtml() +
    '</div>';

    body.innerHTML = html;
  }

  function calendarHtml(s) {
    var title = _curYear + '年' + (_curMonth + 1) + '月';
    var today = new Date();
    var first = new Date(_curYear, _curMonth, 1);
    var lead = (first.getDay() + 6) % 7; // 周一起始
    var daysInMonth = new Date(_curYear, _curMonth + 1, 0).getDate();
    var html =
      '<div class="cal-head">' +
        '<button class="cal-nav" data-act="prevMonth" aria-label="上个月"><i class="fas fa-chevron-left"></i></button>' +
        '<div class="cal-title">' + title + '</div>' +
        '<button class="cal-nav" data-act="nextMonth" aria-label="下个月"><i class="fas fa-chevron-right"></i></button>' +
      '</div>' +
      '<div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
      '<div class="cal-grid" id="period-cal-grid">';
    for (var i = 0; i < lead; i++) html += '<div class="cal-cell blank"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var dt = new Date(_curYear, _curMonth, d);
      var cls = 'cal-cell pd-cal-cell';
      if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()) cls += ' today';
      if (_selDate && fmtYM(dt) === fmtYM(_selDate)) cls += ' sel';
      var info = classifyDay(dt, s);
      if (info.kind) cls += ' ' + info.kind;
      var logs = getLogs();
      var hasLog = !!logs[fmtYM(dt)];
      html += '<div class="' + cls + '" data-act="openDay" data-date="' + fmtYM(dt) + '">' +
        '<span class="cal-num">' + d + '</span>' +
        (hasLog ? '<span class="cal-dot"></span>' : '') + '</div>';
    }
    html += '</div>' +
      '<div class="cal-legend">' +
        '<span><i class="pd-lg-period"></i>经期</span>' +
        '<span><i class="pd-lg-predicted"></i>预测经期</span>' +
        '<span><i class="pd-lg-ovu"></i>排卵期</span>' +
        '<span><i class="pd-lg-ovuday"></i>排卵日</span>' +
      '</div>';
    return html;
  }

  function calcStats(s) {
    var list = getCycles().slice().sort(function (a, b) {
      return dayDiff(ymdToDate(a.start) || today0(), ymdToDate(b.start) || today0());
    });
    var avgCycle = 0, avgPeriod = 0;
    if (list.length >= 2) {
      var sum = 0, n = 0;
      for (var i = 1; i < list.length; i++) {
        var a = ymdToDate(list[i - 1].start), b = ymdToDate(list[i].start);
        if (a && b) { sum += dayDiff(b, a); n++; }
      }
      if (n) avgCycle = Math.round(sum / n);
    }
    if (list.length) {
      var ps = 0;
      for (var j = 0; j < list.length; j++) ps += g(list[j].days, 0);
      avgPeriod = Math.round(ps / list.length);
    }
    return {
      cycle: avgCycle || (s ? g(s.cycleDays, 28) : 28),
      period: avgPeriod || (s ? g(s.periodDays, 5) : 5),
      count: list.length
    };
  }

  function cyclesHtml() {
    var list = getCycles();
    if (!list.length) return '<div class="pd-records-empty">暂无经期记录，点日历上的日期可以补记</div>';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var cy = list[i];
      html += '<div class="pd-rec">' +
        '<div class="pd-rec-top">' +
          '<i class="fas fa-calendar-check"></i>' +
          '<span>' + esc(cy.start) + ' ~ ' + esc(cy.end) + '</span>' +
          '<span class="pd-rec-days">' + cy.days + ' 天</span>' +
          '<button class="pd-quote-btn" data-act="delCycle" data-i="' + i + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
        '</div>' +
        '<div class="pd-rec-sum">本次经期于 ' + esc(cy.start) + ' 开始，持续 ' + cy.days + ' 天，至 ' + esc(cy.end) + ' 结束。</div>' +
      '</div>';
    }
    return html;
  }

  // ---------- 打卡 ----------
  // 补记：某天是否落在已有记录里
  function cycleForDate(dateStr) {
    var d = ymdToDate(dateStr);
    if (!d) return null;
    var list = getCycles();
    for (var i = 0; i < list.length; i++) {
      var a = ymdToDate(list[i].start), b = ymdToDate(list[i].end);
      if (a && b && dayDiff(d, a) >= 0 && dayDiff(d, b) <= 0) return list[i];
    }
    return null;
  }
  function hasCycleStart(startStr) {
    return getCycles().some(function (c) { return c.start === startStr; });
  }
  // 写入一条完整记录（开始日 ~ 结束日），重复的不再追加
  function recordCycle(startStr, endStr) {
    var st = ymdToDate(startStr), en = ymdToDate(endStr);
    if (!st || !en || dayDiff(en, st) < 0) return null;
    var days = dayDiff(en, st) + 1;
    var list = getCycles();
    var has = list.some(function (c) { return c.start === startStr && c.end === endStr; });
    if (!has) {
      list.push({ start: startStr, end: endStr, days: days });
      list.sort(function (a, b) { return dayDiff(ymdToDate(b.start) || today0(), ymdToDate(a.start) || today0()); });
      saveCycles(list);
    }
    return { start: startStr, end: endStr, days: days };
  }

  // 把选中的日期记为这次经期的开始日
  function markStartAt(dateStr) {
    var d = ymdToDate(dateStr);
    if (!d) return;
    if (dayDiff(d, today0()) > 0) { if (typeof toast === 'function') toast('未来的日期还不能标记'); return; }
    var cur = getCurrent();
    var apply = function () {
      var s = getSettings() || {};
      if (!g(s.cycleDays, 0)) s.cycleDays = 28;
      if (!g(s.periodDays, 0)) s.periodDays = 5;
      if (!g(s.lutealDays, 0)) s.lutealDays = 14;
      // lastStart 跟着最新一次经期走：比所有已有记录都新才更新；补记旧周期时保持原来的预测基准
      var latestTs = 0;
      getCycles().forEach(function (c) {
        var cd = ymdToDate(c.start);
        if (cd && cd.getTime() > latestTs) latestTs = cd.getTime();
      });
      if (!latestTs || d.getTime() >= latestTs) s.lastStart = dateStr;
      saveSettings(s);
      saveCurrent({ start: dateStr });
      closeSheet();
      render();
      if (typeof toast === 'function') toast('已记录：' + fmtMD(d) + ' 开始');
    };
    if (cur && cur.start && cur.start !== dateStr) {
      // 弹层在 confirm 之上，先收起再问
      closeSheet();
      confirmModal('修改开始日', '这次经期现在从 ' + cur.start + ' 开始，改成 ' + dateStr + ' 吗？', apply);
    } else {
      apply();
    }
  }

  // 把选中的日期记为这次经期的结束日，并生成一条记录
  function markEndAt(dateStr) {
    var d = ymdToDate(dateStr);
    if (!d) return;
    if (dayDiff(d, today0()) > 0) { if (typeof toast === 'function') toast('未来的日期还不能标记'); return; }
    var cur = getCurrent();
    var s = getSettings() || {};
    var startStr = (cur && cur.start) ? cur.start : (s.lastStart || '');
    var st = startStr ? ymdToDate(startStr) : null;
    if (!st) { if (typeof toast === 'function') toast('先标记开始日'); return; }
    if (dayDiff(d, st) < 0) { if (typeof toast === 'function') toast('结束日不能早于开始日'); return; }
    var rec = recordCycle(startStr, dateStr);
    saveCurrent(null);
    closeSheet();
    render();
    if (rec && typeof toast === 'function') toast('本次经期已记录：' + rec.days + ' 天');
  }

  function startPeriod() {
    var today = fmtYM(today0());
    var s = getSettings() || {};
    s.lastStart = today;
    if (!g(s.cycleDays, 0)) s.cycleDays = 28;
    if (!g(s.periodDays, 0)) s.periodDays = 5;
    if (!g(s.lutealDays, 0)) s.lutealDays = 14;
    saveSettings(s);
    saveCurrent({ start: today });
    render();
    if (typeof toast === 'function') toast('已记录：经期第 1 天');
  }

  function endPeriod() {
    var cur = getCurrent();
    if (!cur || !cur.start) return;
    var start = ymdToDate(cur.start);
    if (!start) { saveCurrent(null); render(); return; }
    var end = today0();
    if (dayDiff(end, start) < 0) start = end;
    var rec = recordCycle(fmtYM(start), fmtYM(end));
    saveCurrent(null);
    render();
    if (rec && typeof toast === 'function') toast('本次经期已记录：' + rec.days + ' 天');
  }

  // ---------- 设置 ----------
  function openSettings() {
    var s = getSettings() || {};
    var html =
      '<div class="app-field"><div class="app-label">最近一次经期开始日</div>' +
        '<input class="app-input" id="pd-set-start" type="date" value="' + esc(s.lastStart || fmtYM(today0())) + '"></div>' +
      '<div class="app-row">' +
        '<div class="app-field"><div class="app-label">周期长度</div>' +
          '<input class="app-input" id="pd-set-cycle" type="number" min="15" max="90" value="' + (g(s.cycleDays, 28) || 28) + '"></div>' +
        '<div class="app-field"><div class="app-label">经期天数</div>' +
          '<input class="app-input" id="pd-set-period" type="number" min="1" max="20" value="' + (g(s.periodDays, 5) || 5) + '"></div>' +
        '<div class="app-field"><div class="app-label">黄体期</div>' +
          '<input class="app-input" id="pd-set-luteal" type="number" min="1" max="30" value="' + (g(s.lutealDays, 14) || 14) + '"></div>' +
      '</div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-act="closeSheet">取消</button>' +
        '<button class="app-btn primary" data-act="saveSettings">保存</button>' +
      '</div>';

    openSheet('经期设置', html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'closeSheet') { closeSheet(); return; }
        if (btn.dataset.act === 'saveSettings') {
          var start = (wrap.querySelector('#pd-set-start').value || '').trim();
          if (!start) { if (typeof toast === 'function') toast('请选择最近一次经期开始日'); return; }
          var cycle = g(wrap.querySelector('#pd-set-cycle').value, 28) || 28;
          var pDays = g(wrap.querySelector('#pd-set-period').value, 5) || 5;
          var luteal = g(wrap.querySelector('#pd-set-luteal').value, 14) || 14;
          saveSettings({ lastStart: start, cycleDays: cycle, periodDays: pDays, lutealDays: luteal });
          closeSheet();
          render();
          checkReminders();
        }
      });
    });
  }

  function openLogSheet(dateStr) {
    var d = ymdToDate(dateStr);
    var logs = getLogs();
    var rec = logs[dateStr] || {};
    var title = (d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : dateStr) + ' · 当日记录';

    // 补记经期：和当前这次经期配对；还没开始时用设置里的最近开始日
    var cur = getCurrent();
    var cfg = getSettings() || {};
    var pairStart = (cur && cur.start) ? cur.start : (cfg.lastStart || '');
    var inRecord = d ? cycleForDate(dateStr) : null;
    var future = d ? dayDiff(d, today0()) > 0 : false;
    var canStart = !!d && !future && !inRecord;
    var canEnd = false;
    var hint = '';
    if (future) hint = '未来的日期还不能标记';
    else if (inRecord) hint = '这天已在记录里：' + inRecord.start + ' ~ ' + inRecord.end;
    else if (canStart && pairStart) {
      var ps = ymdToDate(pairStart);
      if (ps && dayDiff(d, ps) < 0) hint = '这天早于本次经期开始日 ' + pairStart;
      else if (hasCycleStart(pairStart)) hint = '这次经期已经记录过了';
      else canEnd = true;
    }
    var periodHtml = '';
    if (canStart || canEnd) {
      periodHtml =
        '<div class="app-field"><div class="app-label">经期</div>' +
          '<div class="pd-day-acts">' +
            (canStart ? '<button class="app-btn" data-act="dayStart">这天开始</button>' : '') +
            (canEnd ? '<button class="app-btn" data-act="dayEnd">这天结束</button>' : '') +
          '</div>' +
          (hint ? '<div class="pd-day-hint">' + esc(hint) + '</div>' : '') +
        '</div>';
    } else if (hint) {
      periodHtml = '<div class="app-field"><div class="app-label">经期</div>' +
        '<div class="pd-day-hint">' + esc(hint) + '</div></div>';
    }

    var html = periodHtml +
      '<div class="app-field"><div class="app-label">出血量</div>' +
        '<div class="app-chips" data-multi="0" id="pd-flow">' + capsHtml(FLOW_OPTIONS, rec.flow) + '</div></div>' +
      '<div class="app-field"><div class="app-label">症状</div>' +
        '<div class="app-chips" data-multi="1" id="pd-symptoms">' + capsHtml(SYMPTOM_OPTIONS, rec.symptoms) + '</div></div>' +
      '<div class="app-field"><div class="app-label">心情</div>' +
        '<div class="app-chips" data-multi="1" id="pd-mood">' + capsHtml(MOOD_OPTIONS, rec.mood) + '</div></div>' +
      '<div class="app-field"><div class="app-label">碎碎念</div>' +
        '<textarea class="app-textarea" id="pd-note">' + esc(rec.note || '') + '</textarea></div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-act="closeSheet">取消</button>' +
        '<button class="app-btn primary" data-act="saveLog">保存</button>' +
      '</div>';

    openSheet(title, html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var cap = e.target.closest('.app-chip');
        if (cap) {
          var box = cap.parentNode;
          var multi = box.getAttribute('data-multi') === '1';
          if (multi) cap.classList.toggle('on');
          else {
            var was = cap.classList.contains('on');
            box.querySelectorAll('.app-chip').forEach(function (b) { b.classList.remove('on'); });
            if (!was) cap.classList.add('on');
          }
          return;
        }
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'closeSheet') { closeSheet(); return; }
        if (btn.dataset.act === 'dayStart') { markStartAt(dateStr); return; }
        if (btn.dataset.act === 'dayEnd') { markEndAt(dateStr); return; }
        if (btn.dataset.act === 'saveLog') {
          var out = {
            flow: selected(wrap, '#pd-flow'),
            symptoms: selected(wrap, '#pd-symptoms'),
            mood: selected(wrap, '#pd-mood'),
            note: (wrap.querySelector('#pd-note').value || '').trim()
          };
          var all = getLogs();
          var empty = !out.flow.length && !out.symptoms.length && !out.mood.length && !out.note;
          if (empty) delete all[dateStr]; else all[dateStr] = out;
          saveLogs(all);
          closeSheet();
          render();
        }
      });
    });
  }
  function capsHtml(options, selected) {
    var sel = Array.isArray(selected) ? selected : [];
    return options.map(function (v) {
      return '<button type="button" class="app-chip' + (sel.indexOf(v) >= 0 ? ' on' : '') + '">' + esc(v) + '</button>';
    }).join('');
  }
  function selected(wrap, sel) {
    var out = [];
    wrap.querySelectorAll(sel + ' .app-chip.on').forEach(function (b) { out.push(b.textContent); });
    return out;
  }

  function openReminderSheet() {
    var r = Object.assign(defaultReminder(), getReminder());
    var adv = Array.isArray(r.advanceDays) ? r.advanceDays.map(Number) : [1];
    var singles = contacts.filter(function (c) { return !isGroupContact(c); });
    var contactOpts = '<option value="">字卡传讯</option>' + singles.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (r.contactId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var html =
      '<div class="app-field"><div class="app-label">提醒开关</div>' +
        '<div class="app-chips" id="pd-rem-enabled">' +
          '<button type="button" class="app-chip' + (r.enabled !== false ? ' on' : '') + '" data-v="1">开启</button>' +
          '<button type="button" class="app-chip' + (r.enabled === false ? ' on' : '') + '" data-v="0">关闭</button>' +
        '</div></div>' +
      '<div class="app-field"><div class="app-label">提前提醒</div>' +
        '<div class="app-chips" id="pd-rem-adv">' +
          [0, 1, 2, 3, 5, 7].map(function (n) {
            return '<button type="button" class="app-chip' + (adv.indexOf(n) >= 0 ? ' on' : '') + '" data-v="' + n + '">' + (n === 0 ? '当天' : '提前' + n + '天') + '</button>';
          }).join('') +
        '</div></div>' +
      '<div class="app-field"><div class="app-label">提醒时间</div>' +
        '<input class="app-input" id="pd-rem-time" type="time" value="' + esc(r.time || '09:00') + '"></div>' +
      '<div class="app-field"><div class="app-label">谁来提醒</div>' +
        '<select class="app-select" id="pd-rem-contact">' + contactOpts + '</select></div>' +
      '<div class="app-field"><div class="app-label">提醒语</div>' +
        '<div id="pd-quote-list">' + quotesHtml(r.quotes) + '</div>' +
        '<div class="app-row" style="margin-top:8px">' +
          '<input class="app-input" id="pd-quote-input" placeholder="写一句提醒语">' +
          '<button class="app-btn sm" data-act="addQuote" style="flex:0 0 auto">添加</button>' +
        '</div></div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-act="closeSheet">取消</button>' +
        '<button class="app-btn primary" data-act="saveReminder">保存</button>' +
      '</div>';

    openSheet('经期提醒', html, function (wrap) {
      var advSel = adv.slice();
      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (btn) {
          if (btn.dataset.act === 'closeSheet') { closeSheet(); return; }
          if (btn.dataset.act === 'addQuote') {
            var input = wrap.querySelector('#pd-quote-input');
            var v = (input.value || '').trim();
            if (!v) return;
            var list = wrap.querySelector('#pd-quote-list');
            list.insertAdjacentHTML('beforeend', quoteItemHtml({ text: v, enabled: true }, list.children.length));
            input.value = '';
            return;
          }
          if (btn.dataset.act === 'delQuote') {
            btn.closest('.pd-quote-item').remove();
            return;
          }
          if (btn.dataset.act === 'toggleQuote') {
            btn.closest('.pd-quote-item').classList.toggle('off');
            return;
          }
          if (btn.dataset.act === 'saveReminder') {
            var enabledOn = wrap.querySelector('#pd-rem-enabled .app-chip.on');
            var enabled = !enabledOn || enabledOn.dataset.v === '1';
            var qs = [];
            wrap.querySelectorAll('.pd-quote-item').forEach(function (item) {
              var txt = item.querySelector('.pd-quote-text').textContent;
              if (txt) qs.push({ text: txt, enabled: !item.classList.contains('off') });
            });
            saveReminder({
              enabled: enabled,
              advanceDays: advSel.slice(),
              time: wrap.querySelector('#pd-rem-time').value || '09:00',
              contactId: wrap.querySelector('#pd-rem-contact').value || '',
              quotes: qs
            });
            closeSheet();
            render();
            checkReminders();
            if (typeof toast === 'function') toast(enabled ? '经期提醒已开启' : '经期提醒已关闭');
          }
          return;
        }

        var chip = e.target.closest('#pd-rem-enabled .app-chip');
        if (chip) {
          wrap.querySelectorAll('#pd-rem-enabled .app-chip').forEach(function (b) { b.classList.remove('on'); });
          chip.classList.add('on');
          return;
        }
        var advChip = e.target.closest('#pd-rem-adv .app-chip');
        if (advChip) {
          var n = parseInt(advChip.dataset.v, 10);
          var idx = advSel.indexOf(n);
          if (idx >= 0) { advSel.splice(idx, 1); advChip.classList.remove('on'); }
          else { advSel.push(n); advChip.classList.add('on'); }
        }
      });
    });
  }

  function quoteItemHtml(q, i) {
    var text = (q && typeof q === 'object') ? String(q.text || '') : String(q || '');
    var on = (q && typeof q === 'object') ? (q.enabled !== false) : true;
    return '<div class="pd-quote-item' + (on ? '' : ' off') + '">' +
      '<span class="pd-quote-text">' + esc(text) + '</span>' +
      '<button type="button" class="pd-quote-btn" data-act="toggleQuote"><i class="fas fa-eye' + (on ? '' : '-slash') + '"></i></button>' +
      '<button type="button" class="pd-quote-btn" data-act="delQuote"><i class="fas fa-trash-alt"></i></button>' +
    '</div>';
  }
  function quotesHtml(quotes) {
    var list = Array.isArray(quotes) && quotes.length ? quotes : [{ text: '经期时间到啦，注意休息哦', enabled: true }];
    return list.map(function (q, i) { return quoteItemHtml(q, i); }).join('');
  }

  // ---------- 提醒调度 ----------
  function parseHM(hhmm) {
    var m = String(hhmm || '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
  }
  function predictedStarts(s, now, count) {
    var first = ymdToDate(s.lastStart);
    if (!first) return [];
    var cycle = g(s.cycleDays, 28) || 28;
    if (cycle <= 0) cycle = 28;
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = dayDiff(t, first);
    var k = Math.floor(diff / cycle);
    if (k < 0) k = 0;
    var P = addDays(first, k * cycle);
    var guard = 0;
    while (dayDiff(P, t) < 0 && guard++ < 500) P = addDays(P, cycle);
    var res = [];
    for (var i = 0; i < count + 4 && res.length < count; i++) {
      res.push(addDays(P, i * cycle));
    }
    return res;
  }
  function reminderMoments(s, r, now, horizonDays) {
    var out = [];
    if (!r || r.enabled === false || !s || !s.lastStart) return out;
    var adv = Array.isArray(r.advanceDays) ? r.advanceDays : [];
    if (!adv.length) return out;
    var hm = parseHM(r.time) || { h: 9, m: 0 };
    var starts = predictedStarts(s, now, 12);
    var limit = now.getTime() + (horizonDays || 90) * 86400000;
    for (var i = 0; i < starts.length; i++) {
      for (var j = 0; j < adv.length; j++) {
        var day = addDays(starts[i], -parseInt(adv[j], 10));
        var dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm.h, hm.m, 0, 0);
        if (dt.getTime() > now.getTime() - 90000 && dt.getTime() <= limit) out.push(dt.getTime());
      }
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }
  function fireReminder(text) {
    var r = getReminder();
    var cid = r.contactId || '';
    var c = cid ? memberById(cid) : null;
    var name = (c && c.name) ? c.name : '经期提醒';
    try {
      if (typeof notifyDeliver === 'function') notifyDeliver(cid, name, text, 'period');
    } catch (e) { console.warn('[Period] 提醒失败:', e); }
  }
  function getFired() {
    var v = Storage.get(KEY_FIRED);
    return (v && typeof v === 'object') ? v : {};
  }
  function saveFired(o) {
    var keys = Object.keys(o);
    if (keys.length > 500) o = {};
    Storage.set(KEY_FIRED, o);
  }
  function checkReminders() {
    var s = getSettings();
    var r = getReminder();
    if (!s || !s.lastStart || !r || r.enabled === false) return;
    var now = Date.now();
    var moments = reminderMoments(s, r, new Date(now), 90);
    var quotes = [];
    (Array.isArray(r.quotes) ? r.quotes : []).forEach(function (q) {
      var txt = (q && typeof q === 'object') ? String(q.text || '') : String(q || '');
      var on = (q && typeof q === 'object') ? (q.enabled !== false) : true;
      if (txt && on) quotes.push(txt);
    });
    if (!quotes.length) quotes = ['经期时间到啦，注意休息哦'];
    var fired = getFired();
    var changed = false;
    moments.forEach(function (ts) {
      if (ts <= now && (now - ts) < 90000) {
        if (fired[ts]) return;
        fired[ts] = 1;
        changed = true;
        fireReminder(quotes[Math.floor(Math.random() * quotes.length)]);
      }
    });
    if (changed) saveFired(fired);
  }
  function startReminderTimer() {
    checkReminders();
    if (_remTimer) return;
    _remTimer = setInterval(checkReminders, 30000);
  }

  // ---------- 事件 ----------
  function bind() {
    if (_bound) return;
    _bound = true;

    var btn = document.getElementById('period-settings-btn');
    if (btn) btn.addEventListener('click', openSettings);

    var body = document.getElementById('period-body');
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
        } else if (act === 'openDay') {
          _selDate = ymdToDate(el.dataset.date);
          openLogSheet(el.dataset.date);
          render();
        } else if (act === 'start') {
          if (getCurrent()) { if (typeof toast === 'function') toast('本次经期还没结束'); return; }
          startPeriod();
        } else if (act === 'end') {
          endPeriod();
        } else if (act === 'reminder') {
          openReminderSheet();
        } else if (act === 'delCycle') {
          var i = parseInt(el.dataset.i, 10);
          confirmModal('删除记录', '确定删除这条经期记录吗？', function () {
            var list = getCycles();
            list.splice(i, 1);
            saveCycles(list);
            render();
          }, { danger: true });
        }
      });
    }
  }

  // ---------- 对外 ----------
  window.PeriodApp = {
    onShow: function () {
      bind();
      render();
      startReminderTimer();
    },
    render: render,
    computeStatus: computeStatus,
    startPeriod: startPeriod,
    endPeriod: endPeriod,
    checkReminders: checkReminders
  };

  if (!_curYear) initDateState();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bind(); startReminderTimer(); });
  } else {
    bind();
    startReminderTimer();
  }
})();
