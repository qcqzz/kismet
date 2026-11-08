/* ============ 字卡传讯 · 邀请中心（电影院 / 音乐厅 / 游戏室共用） ============ */
/*
 * 参考 chat 的邀请协商：
 *   用户邀请 —— 先发「等待中」卡，梦角 2~5 分钟后回复（70% / 90% / 100% 逐次同意），
 *              不同意就换时间（音乐换一首歌），卡片回到用户这边等回应。
 *   梦角主动邀请 —— 直接发一张「提议」卡，用户同意 / 拒绝 / 换时间（换片、换歌、换游戏）。
 *   卡片进主聊天，状态与定时器持久化，重开应用会接着走。
 *
 * 每位梦角、每个入口（cinema / music / game）各自一份协商，互不覆盖。
 */
(function (global) {
  'use strict';

  var KEY = 'inviteCenter';
  var _data = Storage.get(KEY);
  if (!_data || typeof _data !== 'object') _data = {};

  var _booted = false;
  var TICK_MS = 30000;
  var KINDS = ['cinema', 'music', 'game'];
  var GAME_NAMES = { gomoku: '五子棋', '2048': '2048', go: '围棋', guessnum: '猜数字对决' };
  var KIND_META = {
    cinema: { label: '看电影', icon: '🍿', banner: 'CINEMA', hasTime: true },
    music: { label: '一起听歌', icon: '🎧', banner: 'MUSIC', hasTime: false },
    game: { label: '一起玩', icon: '🎮', banner: 'GAME', hasTime: true }
  };

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
  function uid() { return 'inv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowMs() { return Date.now(); }
  function member(cid) {
    if (typeof memberById === 'function') {
      var c = memberById(cid);
      if (c) return c;
    }
    return (contacts || []).find(function (x) { return x.id === cid; }) || null;
  }
  function partnerNameOf(cid) {
    var c = member(cid);
    return (c && c.name) ? c.name : '梦角';
  }
  function toastMsg(t) { if (typeof toast === 'function') toast(t); }
  function save() { try { Storage.set(KEY, _data); } catch (e) { console.warn('[invite] 保存失败', e); } }

  function stateOf(cid) {
    if (!_data[cid] || typeof _data[cid] !== 'object') _data[cid] = {};
    var st = _data[cid];
    if (!st.negos || typeof st.negos !== 'object') st.negos = {};
    if (!st.missed || typeof st.missed !== 'object') st.missed = {};
    return st;
  }
  function nego(cid, kind) {
    var st = stateOf(cid);
    return (st.negos && st.negos[kind]) ? st.negos[kind] : null;
  }
  function setNego(cid, kind, n) {
    var st = stateOf(cid);
    if (n) st.negos[kind] = n;
    else delete st.negos[kind];
    save();
  }

  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function hm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function dateCn(ymdStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdStr || '');
    if (!m) return ymdStr || '';
    return (+m[1]) + '年' + (+m[2]) + '月' + (+m[3]) + '日';
  }
  function parseDT(dateStr, timeStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    var t = /^(\d{1,2}):(\d{2})$/.exec(timeStr || '');
    if (!m || !t) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  function roundHalf(d) {
    var minutes = d.getMinutes();
    if (minutes < 15) d.setMinutes(0, 0, 0);
    else if (minutes < 45) d.setMinutes(30, 0, 0);
    else { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); }
    return d;
  }

  // ---------- 卡片 ----------
  function cardData(n) {
    return {
      id: n.id, kind: n.kind, state: n.state, subject: n.subject || '',
      dateStr: n.date ? dateCn(n.date) : '', timeStr: n.time || '',
      game: (n.meta && n.meta.game) || '', ts: n.ts || 0
    };
  }
  function sendCard(cid, n) {
    if (typeof addMessage !== 'function') { console.warn('[invite] addMessage 不可用'); return; }
    var sender = (n.state === 'pending' || n.state === 'declined') ? 'user' : 'partner';
    addMessage({
      id: (typeof newId === 'function') ? newId() : Date.now() * 100 + Math.floor(Math.random() * 100),
      contactId: cid,
      sender: sender,
      type: 'invite',
      text: '',
      timestamp: new Date(),
      status: sender === 'user' ? 'sent' : 'received',
      inviteData: cardData(n)
    });
  }

  function renderCard(msg) {
    var d = (msg && msg.inviteData) || {};
    var kind = d.kind || 'cinema';
    var meta = KIND_META[kind] || KIND_META.cinema;
    var st = d.state || 'countered';
    var cid = msg && msg.contactId;
    var name = partnerNameOf(cid);
    var subject = d.subject || (kind === 'music' ? '一起听歌' : (kind === 'game' ? '小游戏' : '一起看电影'));
    var timeLine = '';
    if (meta.hasTime && d.dateStr) {
      timeLine = '<div class="invite-card-time">' + esc(d.dateStr + (d.timeStr ? '  ' + d.timeStr : '')) + '</div>';
    }
    var actions = '';
    if (st === 'pending') {
      actions = '<div class="invite-card-status">等待 ' + esc(name) + ' 回复中…</div>';
    } else if (st === 'accepted') {
      actions = '<div class="invite-card-status ok">🎉 约定成功</div>' +
        '<div class="invite-card-actions"><button class="invite-card-btn invite-card-btn--primary" data-invite-action="go">' +
        (kind === 'music' ? '现在听' : (kind === 'game' ? '去游戏室' : '去电影院')) + '</button></div>';
    } else if (st === 'expired') {
      actions = '<div class="invite-card-status expired">这次没约上呢…</div>';
    } else if (st === 'declined') {
      actions = '<div class="invite-card-status declined">下次吧…</div>';
    } else {
      var changeLabel = kind === 'music' ? '换一首' : (kind === 'game' ? '换游戏' : '换片');
      actions =
        '<div class="invite-card-actions">' +
          (meta.hasTime ? '<button class="invite-card-btn invite-card-btn--secondary" data-invite-action="reschedule">更换时间</button>' : '') +
          '<button class="invite-card-btn invite-card-btn--secondary" data-invite-action="change">' + changeLabel + '</button>' +
        '</div>' +
        '<div class="invite-card-actions" style="margin-top:8px;">' +
          '<button class="invite-card-btn invite-card-btn--decline" data-invite-action="decline">拒绝</button>' +
          '<button class="invite-card-btn invite-card-btn--primary" data-invite-action="accept">' +
          (kind === 'music' ? '现在听' : '同意') + '</button>' +
        '</div>';
    }
    var subLine = '';
    if (kind === 'music') {
      subLine = '<div class="invite-card-line">想和你一起听歌</div>';
    } else if (kind === 'game') {
      subLine = '<div class="invite-card-line">想和你一起玩</div>';
    } else {
      subLine = '<div class="invite-card-line">想约你一起看电影</div>';
    }
    return '<div class="invite-card invite-card--' + esc(kind) + '" data-invite-id="' + esc(d.id || '') +
      '" data-invite-kind="' + esc(kind) + '" data-invite-cid="' + esc(cid || '') + '">' +
        '<div class="invite-card-decor">' +
          '<span>'+meta.icon+'</span><span>'+(kind === 'music' ? '💿' : (kind === 'game' ? '🎲' : '⭐'))+'</span>' +
          '<span>'+(kind === 'music' ? '💫' : (kind === 'game' ? '✨' : '🥤'))+'</span><span>💕</span>' +
        '</div>' +
        '<div class="invite-card-banner">' + meta.banner + '</div>' +
        subLine +
        '<div class="invite-card-subject">' + esc(subject) + '</div>' +
        timeLine +
        '<div class="invite-card-divider"></div>' +
        actions +
      '</div>';
  }

  // ---------- 事件委托：卡片按钮 ----------
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-invite-action]');
    if (!btn) return;
    var card = btn.closest('.invite-card');
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    var cid = card.getAttribute('data-invite-cid');
    var kind = card.getAttribute('data-invite-kind');
    var id = card.getAttribute('data-invite-id');
    var action = btn.getAttribute('data-invite-action');
    // 「去电影院 / 去游戏室 / 现在听」是已达成约定的跳转，不依赖当前协商还在不在
    if (action === 'go') { openApp(kind, cid); return; }
    var n = nego(cid, kind);
    if (!n || n.id !== id) { toastMsg('这张邀请已经过期啦'); return; }
    if (action === 'accept') acceptNego(cid, kind);
    else if (action === 'decline') declineNego(cid, kind);
    else if (action === 'reschedule') openReschedule(cid, kind);
    else if (action === 'change') openChange(cid, kind);
  });

  function openApp(kind, cid) {
    if (kind === 'game') {
      if (global.GamesApp && GamesApp.openFor) GamesApp.openFor(cid);
      else {
        if (typeof showView === 'function') showView('games');
        if (global.GamesApp && GamesApp.onShow) GamesApp.onShow();
      }
      return;
    }
    if (kind === 'music' || kind === 'cinema') {
      var tab = kind === 'music' ? 'music' : 'cinema';
      if (global.EntertainmentApp && EntertainmentApp.openFor) EntertainmentApp.openFor(tab, cid);
      else if (global.EntertainmentApp && EntertainmentApp.open) EntertainmentApp.open(tab);
      else if (typeof showView === 'function') showView('entertainment');
    }
  }

  // ---------- 用户发起 ----------
  function startUserInvite(kind, cid, payload) {
    payload = payload || {};
    var st = stateOf(cid);
    if (st.negos[kind]) { toastMsg('已经有一个邀请在等回复啦'); return null; }
    var n = {
      id: uid(), kind: kind, state: 'pending', turn: 'partner', replyIndex: 1,
      subject: String(payload.subject || '').trim(),
      date: payload.date || '', time: payload.time || '', ts: payload.ts || 0,
      meta: payload.meta || {},
      createdAt: nowMs(),
      replyDueAt: nowMs() + (2 + Math.random() * 3) * 60000,  // 2~5 分钟后回复
      nextReminderAt: 0
    };
    if (!n.subject) n.subject = kind === 'music' ? '一起听歌' : (kind === 'game' ? '一起玩游戏' : '一起看电影');
    setNego(cid, kind, n);
    sendCard(cid, n);
    refreshApp(kind, cid);
    return n;
  }

  // ---------- 协商回复 ----------
  function acceptProbability(i) {
    if (i <= 1) return 0.7;
    if (i === 2) return 0.9;
    return 1;
  }
  function counterTime(date, time) {
    var base = parseDT(date, time);
    if (!base) base = new Date(nowMs() + 3600000);
    var d = new Date(base.getTime() + (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random()) * 3600000);
    roundHalf(d);
    if (d.getTime() <= nowMs() + 3 * 3600000) {
      d = roundHalf(new Date(nowMs() + 3 * 3600000));
    }
    return { date: ymd(d), time: hm(d), ts: d.getTime() };
  }
  function pickOtherSong(cid, cur) {
    var list = [];
    if (global.EntertainmentApp && EntertainmentApp.songNames) {
      try { list = EntertainmentApp.songNames(cid) || []; } catch (e) { list = []; }
    }
    list = list.filter(function (s) { return s && s !== cur; });
    if (!list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  function resolveReply(cid, kind) {
    var n = nego(cid, kind);
    if (!n || n.state !== 'pending') return;
    if (Math.random() < acceptProbability(n.replyIndex)) { acceptNego(cid, kind); return; }
    if (kind === 'music') {
      var alt = pickOtherSong(cid, n.subject);
      if (!alt) { acceptNego(cid, kind); return; }
      n.subject = alt;
      n.date = ''; n.time = ''; n.ts = 0;
    } else {
      var t = counterTime(n.date, n.time);
      n.date = t.date; n.time = t.time; n.ts = t.ts;
    }
    n.state = 'countered';
    n.turn = 'user';
    n.replyDueAt = 0;
    n.deadlineAt = nowMs() + (kind === 'music' ? 24 * 3600000 : Math.max(3600000, (n.ts || nowMs()) - 30 * 60000 - nowMs()));
    n.nextReminderAt = Math.min(n.deadlineAt, nowMs() + (3 + Math.random() * 5) * 3600000);
    setNego(cid, kind, n);
    sendCard(cid, n);
    refreshApp(kind, cid);
  }

  function acceptNego(cid, kind) {
    var n = nego(cid, kind);
    if (!n) return;
    var accepted = JSON.parse(JSON.stringify(n));
    accepted.state = 'accepted';
    accepted.turn = '';
    sendCard(cid, accepted);
    setNego(cid, kind, null);
    if (kind !== 'music' && n.ts) addApptReminder(cid, kind, n);
    applyAccept(kind, cid, n);
    refreshApp(kind, cid);
  }

  function declineNego(cid, kind) {
    var n = nego(cid, kind);
    if (!n) return;
    var declined = JSON.parse(JSON.stringify(n));
    declined.state = 'declined';
    declined.turn = '';
    sendCard(cid, declined);
    setNego(cid, kind, null);
    refreshApp(kind, cid);
  }

  function expireNego(cid, kind) {
    var n = nego(cid, kind);
    if (!n) return;
    var expired = JSON.parse(JSON.stringify(n));
    expired.state = 'expired';
    expired.turn = '';
    setNego(cid, kind, null);
    sendCard(cid, expired);
    refreshApp(kind, cid);
  }

  function applyAccept(kind, cid, n) {
    try {
      if (kind === 'game') {
        if (global.GamesApp && GamesApp.applyInviteAccept) GamesApp.applyInviteAccept(cid, n);
      } else if (global.EntertainmentApp && EntertainmentApp.applyInviteAccept) {
        EntertainmentApp.applyInviteAccept(kind, cid, n);
      }
    } catch (e) { console.warn('[invite] 应用约定失败', e); }
  }

  function refreshApp(kind, cid) {
    try {
      if (kind === 'game') {
        if (global.GamesApp) {
          if (GamesApp.refresh) GamesApp.refresh();
          else if (GamesApp.render) GamesApp.render();
        }
      } else if (global.EntertainmentApp && EntertainmentApp.render) {
        var v = document.getElementById('view-entertainment');
        if (v && v.classList.contains('active')) EntertainmentApp.render();
      }
    } catch (e) {}
  }

  // ---------- 提醒 ----------
  function addApptReminder(cid, kind, n) {
    var st = stateOf(cid);
    if (!Array.isArray(st.reminders)) st.reminders = [];
    st.reminders = st.reminders.filter(function (r) { return !(r.kind === kind && r.id === n.id); });
    var at = (n.ts || 0) - 2 * 60000;
    if (!n.ts) return;
    if (at < nowMs()) at = nowMs() + 5000;
    st.reminders.push({ id: n.id, kind: kind, subject: n.subject, ts: n.ts, at: at, game: (n.meta && n.meta.game) || '' });
    save();
  }
  function checkReminders() {
    var t = nowMs();
    var dirty = false;
    Object.keys(_data).forEach(function (cid) {
      var st = _data[cid];
      if (!st || !Array.isArray(st.reminders) || !st.reminders.length) return;
      var keep = [];
      st.reminders.forEach(function (r) {
        if (t < r.at) { keep.push(r); return; }
        if (typeof notifyDeliver === 'function') {
          var body = '';
          if (r.kind === 'cinema') body = '《' + (r.subject || '电影') + '》还有 2 分钟就开场啦';
          else if (r.kind === 'game') body = (GAME_NAMES[r.game] || '游戏') + '之约还有 2 分钟开始';
          else body = '一起听歌的时间到啦';
          notifyDeliver(cid, null, body, 'chat');
        }
        dirty = true;
      });
      st.reminders = keep;
    });
    if (dirty) save();
  }

  // ---------- 定时检查 ----------
  function tick() {
    if (!_booted) return;
    var t = nowMs();
    var list = Object.keys(_data);
    list.forEach(function (cid) {
      KINDS.forEach(function (kind) {
        var n = nego(cid, kind);
        if (!n) return;
        if (n.state === 'pending' && n.replyDueAt && t >= n.replyDueAt) {
          resolveReply(cid, kind);
        } else if (n.state === 'countered' && n.turn === 'user') {
          if (n.deadlineAt && t >= n.deadlineAt) {
            expireNego(cid, kind);
          } else if (n.nextReminderAt && t >= n.nextReminderAt) {
            sendCard(cid, n);
            n.nextReminderAt = Math.min(n.deadlineAt || (t + 6 * 3600000), t + (3 + Math.random() * 5) * 3600000);
            setNego(cid, kind, n);
          }
        }
      });
    });
    checkReminders();
  }

  // ---------- 梦角主动邀请 ----------
  function activityState(cid) {
    var st = stateOf(cid);
    if (!st.missed || typeof st.missed !== 'object') st.missed = {};
    return st.missed;
  }
  function hasAppt(kind, cid) {
    try {
      if (kind === 'cinema' && global.EntertainmentApp && EntertainmentApp.hasCinemaAppt) return EntertainmentApp.hasCinemaAppt(cid);
      if (kind === 'music' && global.EntertainmentApp && EntertainmentApp.hasMusicTogether) return EntertainmentApp.hasMusicTogether(cid);
      if (kind === 'game' && global.GamesApp && GamesApp.hasGameAppt) return GamesApp.hasGameAppt(cid);
    } catch (e) {}
    return false;
  }
  function pickPartnerTime(minHours, maxHours) {
    var d = new Date(nowMs() + (minHours + Math.random() * (maxHours - minHours)) * 3600000);
    roundHalf(d);
    if (d.getTime() <= nowMs() + 3600000) d = roundHalf(new Date(nowMs() + 2 * 3600000));
    return { date: ymd(d), time: hm(d), ts: d.getTime() };
  }
  function pickMovie(cid) {
    if (global.EntertainmentApp && EntertainmentApp.pickMovieTitle) {
      try {
        var v = EntertainmentApp.pickMovieTitle(cid);
        if (v) return v;
      } catch (e) {}
    }
    return '一起看电影';
  }
  function pickSong(cid) {
    if (global.EntertainmentApp && EntertainmentApp.songNames) {
      try {
        var list = EntertainmentApp.songNames(cid) || [];
        if (list.length && Math.random() < 0.75) return list[Math.floor(Math.random() * list.length)];
      } catch (e) {}
    }
    return '';
  }
  function pickGameId() {
    var ids = Object.keys(GAME_NAMES);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  function partnerInvite(kind, cid) {
    if (nego(cid, kind)) return false;
    if (hasAppt(kind, cid)) return false;
    var n = { id: uid(), kind: kind, state: 'countered', turn: 'user', replyIndex: 0, subject: '', date: '', time: '', ts: 0, meta: {}, createdAt: nowMs() };
    if (kind === 'cinema') {
      var t = pickPartnerTime(12, 72);
      n.subject = pickMovie(cid); n.date = t.date; n.time = t.time; n.ts = t.ts;
      n.deadlineAt = Math.max(nowMs() + 3600000, n.ts - 30 * 60000);
    } else if (kind === 'music') {
      n.subject = pickSong(cid) || '一起听歌';
      n.deadlineAt = nowMs() + 24 * 3600000;
    } else {
      var gt = pickPartnerTime(2, 24);
      n.meta.game = pickGameId();
      n.subject = GAME_NAMES[n.meta.game];
      n.date = gt.date; n.time = gt.time; n.ts = gt.ts;
      n.deadlineAt = Math.max(nowMs() + 3600000, n.ts - 30 * 60000);
    }
    n.nextReminderAt = Math.min(n.deadlineAt, nowMs() + (3 + Math.random() * 5) * 3600000);
    setNego(cid, kind, n);
    sendCard(cid, n);
    refreshApp(kind, cid);
    return true;
  }

  // 每档活动：到点后内部再走 70%（连续两次没发出去则下一次必发），与 chat 一致
  function registerActivities() {
    if (typeof registerPartnerActivity !== 'function') return;
    var specs = [
      { kind: 'cinema', daysMin: 5, daysMax: 7 },
      { kind: 'music', daysMin: 1, daysMax: 2 },
      { kind: 'game', daysMin: 2, daysMax: 4 }
    ];
    specs.forEach(function (spec) {
      registerPartnerActivity({
        key: 'invite-' + spec.kind,
        nextAt: function () { return nowMs() + (spec.daysMin + Math.random() * (spec.daysMax - spec.daysMin)) * 86400000; },
        chance: function () { return 100; },
        enabled: function () { return !settings || settings.replyEnabled !== false; },
        run: function (c) {
          var missed = activityState(c.id);
          var count = missed[spec.kind] || 0;
          var prob = count >= 2 ? 1 : 0.7;
          if (Math.random() < prob && partnerInvite(spec.kind, c.id)) {
            missed[spec.kind] = 0;
          } else {
            missed[spec.kind] = count + 1;
          }
          save();
        }
      });
    });
  }

  // ---------- 弹层：换时间 / 换内容 ----------
  function closeSheet() {
    var w = document.getElementById('kismet-invite-sheet');
    if (w) w.remove();
  }
  function openSheet(title, html, onMount) {
    closeSheet();
    var wrap = document.createElement('div');
    wrap.className = 'app-overlay open';
    wrap.id = 'kismet-invite-sheet';
    wrap.innerHTML = '<div class="app-sheet"><div class="app-sheet-title">' + esc(title) + '</div>' + html + '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    if (onMount) onMount(wrap);
    return wrap;
  }
  function nextRoundFrom(n, payload) {
    var cid = payload.cid;
    var kind = n.kind;
    var next = {
      id: uid(), kind: kind, state: 'pending', turn: 'partner',
      replyIndex: (n.replyIndex || 1) + 1,
      subject: payload.subject != null ? payload.subject : n.subject,
      date: payload.date != null ? payload.date : n.date,
      time: payload.time != null ? payload.time : n.time,
      ts: payload.ts != null ? payload.ts : n.ts,
      meta: payload.meta || n.meta || {},
      createdAt: nowMs(),
      replyDueAt: nowMs() + (2 + Math.random() * 3) * 60000,
      nextReminderAt: 0
    };
    setNego(cid, kind, next);
    sendCard(cid, next);
    refreshApp(kind, cid);
    return next;
  }
  function openReschedule(cid, kind) {
    var n = nego(cid, kind);
    if (!n) return;
    var base = parseDT(n.date, n.time) || new Date(nowMs() + 3600000);
    var defDate = ymd(base), defTime = hm(base);
    var html = '<div class="app-row">' +
      '<div class="app-field"><div class="app-label">日期</div><input class="app-input" id="inv-date" type="date" value="' + defDate + '"></div>' +
      '<div class="app-field"><div class="app-label">时间</div><input class="app-input" id="inv-time" type="time" value="' + defTime + '"></div>' +
      '</div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-inv="cancel">取消</button>' +
        '<button class="app-btn primary" data-inv="ok">发出新时间</button>' +
      '</div>';
    openSheet('更换时间', html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-inv]');
        if (!b) return;
        if (b.dataset.inv === 'cancel') { closeSheet(); return; }
        var date = wrap.querySelector('#inv-date').value;
        var time = wrap.querySelector('#inv-time').value;
        var dt = parseDT(date, time);
        if (!dt || dt.getTime() <= nowMs()) { toastMsg('约的时间不能早于现在'); return; }
        closeSheet();
        var cur = nego(cid, kind);
        if (!cur) return;
        nextRoundFrom(cur, { cid: cid, date: date, time: time, ts: dt.getTime() });
      });
    });
  }
  function openChange(cid, kind) {
    var n = nego(cid, kind);
    if (!n) return;
    var html = '';
    if (kind === 'cinema') {
      html = '<div class="app-field"><div class="app-label">片名</div>' +
        '<input class="app-input" id="inv-subject" maxlength="40" value="' + esc(n.subject || '') + '" placeholder="想看什么电影？"></div>';
    } else if (kind === 'music') {
      var songs = [];
      if (global.EntertainmentApp && EntertainmentApp.songNames) {
        try { songs = EntertainmentApp.songNames(cid) || []; } catch (e) {}
      }
      html = '<div class="app-field"><div class="app-label">换一首</div>' +
        (songs.length
          ? '<select class="app-select" id="inv-subject">' + songs.map(function (s) {
              return '<option value="' + esc(s) + '"' + (s === n.subject ? ' selected' : '') + '>' + esc(s) + '</option>';
            }).join('') + '</select>'
          : '<input class="app-input" id="inv-subject" maxlength="40" value="' + esc(n.subject || '') + '" placeholder="歌名">') +
        '</div>';
    } else {
      html = '<div class="app-field"><div class="app-label">换一个游戏</div>' +
        '<select class="app-select" id="inv-subject">' + Object.keys(GAME_NAMES).map(function (g) {
          return '<option value="' + esc(GAME_NAMES[g]) + '" data-g="' + esc(g) + '"' + (GAME_NAMES[g] === n.subject ? ' selected' : '') + '>' + esc(GAME_NAMES[g]) + '</option>';
        }).join('') + '</select></div>';
    }
    html += '<div class="app-actions">' +
      '<button class="app-btn" data-inv="cancel">取消</button>' +
      '<button class="app-btn primary" data-inv="ok">发出新的邀请</button></div>';
    openSheet(kind === 'music' ? '换一首歌' : (kind === 'game' ? '换一个游戏' : '换一部电影'), html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-inv]');
        if (!b) return;
        if (b.dataset.inv === 'cancel') { closeSheet(); return; }
        var el = wrap.querySelector('#inv-subject');
        var val = el ? String(el.value || '').trim() : '';
        if (!val) { toastMsg('内容不能是空的'); return; }
        closeSheet();
        var cur = nego(cid, kind);
        if (!cur) return;
        var payload = { cid: cid, subject: val };
        if (kind === 'game') {
          var opt = el.options[el.selectedIndex];
          payload.meta = { game: (opt && opt.getAttribute('data-g')) || cur.meta.game || 'gomoku' };
        }
        nextRoundFrom(cur, payload);
      });
    });
  }

  // ---------- 用户发起入口：选择时间 / 内容 ----------
  function openCompose(kind, cid, opts) {
    opts = opts || {};
    var n0 = nego(cid, kind);
    if (n0) {
      toastMsg(kind === 'music' ? '已经有一个一起听的邀请在等回复啦' : '已经有一个邀请在等回复啦');
      return;
    }
    var base = new Date(nowMs() + 3600000);
    roundHalf(base);
    var defDate = ymd(base), defTime = hm(base);
    var html = '';
    if (kind === 'cinema') {
      html = '<div class="app-field"><div class="app-label">电影名字</div>' +
        '<input class="app-input" id="inv-subject" maxlength="40" placeholder="看什么" value="' + esc(opts.subject || '') + '"></div>' +
        '<div class="app-row">' +
          '<div class="app-field"><div class="app-label">日期</div><input class="app-input" id="inv-date" type="date" value="' + defDate + '"></div>' +
          '<div class="app-field"><div class="app-label">时间</div><input class="app-input" id="inv-time" type="time" value="' + defTime + '"></div>' +
        '</div>';
    } else if (kind === 'music') {
      var songs = [];
      if (global.EntertainmentApp && EntertainmentApp.songNames) {
        try { songs = EntertainmentApp.songNames(cid) || []; } catch (e) {}
      }
      html = '<div class="app-field"><div class="app-label">一起听</div>' +
        (songs.length
          ? '<select class="app-select" id="inv-subject">' + songs.map(function (s) {
              return '<option value="' + esc(s) + '"' + (s === opts.subject ? ' selected' : '') + '>' + esc(s) + '</option>';
            }).join('') + '</select>'
          : '<input class="app-input" id="inv-subject" maxlength="40" placeholder="歌名" value="' + esc(opts.subject || '') + '">') +
        '</div>';
    } else {
      var games = [
        { id: 'gomoku', name: '五子棋' }, { id: '2048', name: '2048' },
        { id: 'go', name: '围棋' }, { id: 'guessnum', name: '猜数字对决' }
      ];
      html = '<div class="app-field"><div class="app-label">玩什么</div>' +
        '<select class="app-select" id="inv-subject">' + games.map(function (g) {
          return '<option value="' + esc(g.name) + '" data-g="' + esc(g.id) + '"' + (g.id === opts.game ? ' selected' : '') + '>' + esc(g.name) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="app-row">' +
          '<div class="app-field"><div class="app-label">日期</div><input class="app-input" id="inv-date" type="date" value="' + defDate + '"></div>' +
          '<div class="app-field"><div class="app-label">时间</div><input class="app-input" id="inv-time" type="time" value="' + defTime + '"></div>' +
        '</div>';
    }
    html += '<div class="app-actions">' +
      '<button class="app-btn" data-inv="cancel">取消</button>' +
      '<button class="app-btn primary" data-inv="ok">' + (kind === 'music' ? '邀请一起听' : '发出邀请') + '</button></div>';
    openSheet(kind === 'cinema' ? '邀请一起看电影' : (kind === 'music' ? '邀请一起听歌' : '邀请一起玩游戏'), html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-inv]');
        if (!b) return;
        if (b.dataset.inv === 'cancel') { closeSheet(); return; }
        var subjEl = wrap.querySelector('#inv-subject');
        var subject = subjEl ? String(subjEl.value || '').trim() : '';
        if (!subject && kind !== 'cinema') { toastMsg(kind === 'music' ? '先选一首歌' : '先选一个游戏'); return; }
        if (!subject) { toastMsg('先写电影名字'); return; }
        var payload = { subject: subject, meta: {} };
        if (kind === 'game') {
          var opt = subjEl.options[subjEl.selectedIndex];
          payload.meta.game = (opt && opt.getAttribute('data-g')) || 'gomoku';
        }
        if (kind !== 'music') {
          var date = wrap.querySelector('#inv-date').value;
          var time = wrap.querySelector('#inv-time').value;
          var dt = parseDT(date, time);
          if (!dt || dt.getTime() <= nowMs()) { toastMsg('约的时间不能早于现在'); return; }
          payload.date = date; payload.time = time; payload.ts = dt.getTime();
        }
        closeSheet();
        startUserInvite(kind, cid, payload);
        toastMsg('邀请已经发出，等 ' + partnerNameOf(cid) + ' 回复吧');
      });
    });
  }

  // ---------- 对外接口 ----------
  var api = {
    renderCard: renderCard,
    startUserInvite: startUserInvite,
    openCompose: openCompose,
    quickInviteMusic: function (cid, songName) {
      startUserInvite('music', cid, { subject: songName || '一起听歌' });
    },
    cancel: function (cid, kind) {
      var n = nego(cid, kind);
      if (n) setNego(cid, kind, null);
      refreshApp(kind, cid);
      return !!n;
    },
    cancelAll: function (cid) {
      KINDS.forEach(function (k) { if (nego(cid, k)) setNego(cid, k, null); });
      refreshApp('cinema', cid);
      refreshApp('game', cid);
    },
    // 约定已达成后，用户主动取消（或结束了活动）时清掉到点提醒
    cancelAppt: function (cid, kind) {
      var st = stateOf(cid);
      if (Array.isArray(st.reminders)) {
        st.reminders = st.reminders.filter(function (r) { return r.kind !== kind; });
        save();
      }
    },
    nego: nego,
    allNegos: function (cid) {
      var out = {};
      KINDS.forEach(function (k) { out[k] = nego(cid, k); });
      return out;
    },
    isActive: function (cid, kind) { return !!nego(cid, kind); },
    partnerInvite: partnerInvite,
    gameName: function (id) { return GAME_NAMES[id] || '游戏'; },
    boot: function () { if (!_booted && typeof Storage !== 'undefined') _booted = true; }
  };
  global.InviteCenter = api;

  registerActivities();

  function boot() {
    if (_booted) return;
    _booted = true;
    setTimeout(tick, 1500);
    setInterval(tick, TICK_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})(window);
