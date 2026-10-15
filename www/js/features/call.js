/* ============ 字卡传讯 · 视频通话（UI 与规则照搬 chat/js/features/call.js） ============ */
/* 结构：来电全屏毛玻璃卡片 272px / 通话悬浮可拖拽可缩放窗口（4 档尺寸）/ 最小化药丸
   尺寸预设：迷你 160×240 · 小 220×350 · 标准 280×440（默认）· 大 360×560
   规则：见文件末尾 RULES 注释                                                          */

(function () {
  var KEY_POS = 'callWindowPos', KEY_SIZE = 'callWindowSize', KEY_PILL_POS = 'callPillPos';

  var S = {
    active: false, isPartnerCall: false, startTime: null, elapsed: 0,
    connectingTimer: null, incomingTimer: null, partnerHangupTimer: null,
    partnerHangupScheduled: false, rafId: null, minimized: false, contactId: null,
    immersive: false, size: null, pos: null, pillPos: null,
    dragOff: null, resizeInit: null, pillDragOff: null
  };

  var MY_NAME = '我';
  var SVG_HU = '<svg viewBox="0 0 24 24" fill="none" style="display:block;width:100%;height:100%;">'
    + '<path d="M6.6 10.8c1.4 2.8 3.7 5.1 6.5 6.5l2.2-2.2c.28-.27.68-.36 1.03-.24 1.1.37 2.3.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.56 21 3 13.44 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.28.2 2.5.57 3.57.11.35.03.74-.24 1.02L6.6 10.8z" fill="white"/>'
    + '<line x1="21" y1="3" x2="3" y2="21" stroke="white" stroke-width="2.4" stroke-linecap="round"/>'
    + '</svg>';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function fmt(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h > 0
      ? h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
      : String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function theContact() { return memberById(S.contactId) || getActiveContact(); }
  function theName() { var c = theContact(); return (c && c.name) || '对方'; }
  function myName() { return settings.myName ? settings.myName : MY_NAME; }

  // ---------- DOM ----------
  function inject() {
    if (document.getElementById('call-feature-root')) return;
    var root = document.createElement('div');
    root.id = 'call-feature-root';
    root.innerHTML =
      '<div id="call-incoming-overlay">' +
        '<img id="call-inc-bg-img" class="call-inc-bg" src="" alt="">' +
        '<div class="call-inc-card">' +
          '<div class="call-inc-ring">' +
            '<div class="call-inc-avatar" id="call-inc-avatar"><i class="fas fa-user"></i></div>' +
          '</div>' +
          '<div class="call-inc-name" id="call-inc-name">对方</div>' +
          '<div class="call-inc-sub"><span class="call-inc-sub-dot"></span><span>邀请您进行视频通话</span></div>' +
          '<div class="call-inc-actions">' +
            '<button class="call-inc-btn call-inc-reject" id="call-inc-reject">' +
              '<span class="call-inc-circle">' + SVG_HU + '</span><span class="call-inc-lbl">拒绝</span></button>' +
            '<button class="call-inc-btn call-inc-accept" id="call-inc-accept">' +
              '<span class="call-inc-circle"><svg viewBox="0 0 24 24" fill="none" style="display:block;width:100%;height:100%;">' +
              '<path d="M6.6 10.8c1.4 2.8 3.7 5.1 6.5 6.5l2.2-2.2c.28-.27.68-.36 1.03-.24 1.1.37 2.3.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.56 21 3 13.44 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.28.2 2.5.57 3.57.11.35.03.74-.24 1.02L6.6 10.8z" fill="white"/>' +
              '</svg></span><span class="call-inc-lbl">接听</span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div id="call-window">' +
        '<div id="call-window-inner">' +
          '<div id="call-window-bg">' +
            '<div class="call-bg-grad"></div>' +
            '<div class="call-orb call-orb-1"></div>' +
            '<div class="call-orb call-orb-2"></div>' +
            '<div class="call-orb call-orb-3"></div>' +
            '<img id="call-bg-img" src="" alt="">' +
          '</div>' +
          '<div class="call-overlay"></div>' +
          '<div id="call-window-header">' +
            '<div class="call-badge"><span class="call-rec-dot"></span>' +
              '<span class="call-timer-txt" id="call-timer-display">00:00</span></div>' +
            '<div class="call-top-btns">' +
              '<button class="call-top-btn" id="call-size-preset-toggle" title="调整大小"><i class="fas fa-expand-alt"></i></button>' +
              '<button class="call-top-btn" id="call-minimize-btn" title="最小化"><i class="fas fa-minus"></i></button>' +
            '</div>' +
          '</div>' +
          '<div id="call-connecting-state">' +
            '<div class="call-av-wrap"><div class="call-av-pulse"></div><div class="call-av-pulse2"></div>' +
              '<div class="call-avatar" id="call-conn-avatar"><i class="fas fa-user"></i></div></div>' +
            '<div class="call-name" id="call-conn-name">对方</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.4);display:flex;align-items:center;gap:5px;">' +
              '<i class="fas fa-video" style="font-size:9px;"></i> 正在连接</div>' +
            '<div class="call-conn-dots"><span></span><span></span><span></span></div>' +
          '</div>' +
          '<div id="call-window-body">' +
            '<div class="call-av-wrap"><div class="call-av-pulse"></div><div class="call-av-pulse2"></div>' +
              '<div class="call-avatar" id="call-win-avatar"><i class="fas fa-user"></i></div></div>' +
            '<div class="call-name" id="call-win-name">通话中</div>' +
            '<div class="call-wave"><span></span><span></span><span></span><span></span><span></span></div>' +
          '</div>' +
          '<button class="call-util-btn" id="call-immersive-btn" title="沉浸模式"><i class="fas fa-eye-slash"></i></button>' +
          '<button class="call-util-btn" id="call-bg-btn" title="更换背景"><i class="fas fa-image"></i></button>' +
          '<input type="file" id="call-bg-file-input" accept="image/*,.gif">' +
          '<div id="call-window-controls">' +
            '<button class="call-hangup-btn" id="call-hangup-btn">' + SVG_HU + '</button></div>' +
        '</div>' +
        '<div id="call-resize-handle"></div>' +
      '</div>' +

      '<div id="call-size-presets">' +
        '<button class="call-size-btn" data-w="160" data-h="240"><i class="fas fa-compress-alt"></i>迷你</button>' +
        '<button class="call-size-btn" data-w="220" data-h="350"><i class="fas fa-minus-square"></i>小</button>' +
        '<button class="call-size-btn" data-w="280" data-h="440"><i class="fas fa-square"></i>标准</button>' +
        '<button class="call-size-btn" data-w="360" data-h="560"><i class="fas fa-expand"></i>大</button>' +
      '</div>' +

      '<div id="call-mini-pill">' +
        '<div class="call-mini-av" id="call-mini-av"><i class="fas fa-user"></i></div>' +
        '<div class="call-mini-info">' +
          '<div class="call-mini-name" id="call-mini-name">通话中</div>' +
          '<div class="call-mini-time" id="call-mini-timer">00:00</div></div>' +
        '<span class="call-mini-dot"></span>' +
        '<button class="call-mini-hangup" id="call-mini-hangup">' + SVG_HU + '</button>' +
      '</div>';
    document.body.appendChild(root);

    document.getElementById('call-inc-accept').addEventListener('click', function () {
      var ov = document.getElementById('call-incoming-overlay');
      if (ov) ov.classList.remove('visible');
      if (S.incomingTimer) { clearTimeout(S.incomingTimer); S.incomingTimer = null; }
      // 沿用来电者（S.contactId），不要退回"当前聊天对象"
      startCall(true, S.contactId);
    });
    document.getElementById('call-inc-reject').addEventListener('click', function () {
      var ov = document.getElementById('call-incoming-overlay');
      if (ov) ov.classList.remove('visible');
      if (S.incomingTimer) { clearTimeout(S.incomingTimer); S.incomingTimer = null; }
      callEvent('fa-phone-slash', myName() + '拒绝了 ' + theName() + ' 的通话', null, 0, true);
    });
    document.getElementById('call-hangup-btn').addEventListener('click', endCall);
    document.getElementById('call-mini-hangup').addEventListener('click', function (e) { e.stopPropagation(); endCall(); });
    document.getElementById('call-minimize-btn').addEventListener('click', minimizeWindow);
    document.getElementById('call-mini-pill').addEventListener('click', function (e) {
      if (e.target.closest('.call-mini-hangup')) return;
      restoreWindow();
    });
    document.getElementById('call-immersive-btn').addEventListener('click', toggleImmersive);
    document.getElementById('call-size-preset-toggle').addEventListener('click', function (e) {
      e.stopPropagation();
      var p = document.getElementById('call-size-presets');
      var r = document.getElementById('call-window').getBoundingClientRect();
      p.style.left = Math.max(8, r.right - 150) + 'px';
      p.style.top = (r.bottom + 6) + 'px';
      p.classList.toggle('open');
    });
    document.querySelectorAll('.call-size-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        S.size = { w: Number(b.dataset.w), h: Number(b.dataset.h) };
        Storage.set(KEY_SIZE, S.size);
        document.getElementById('call-size-presets').classList.remove('open');
        positionWindow();
      });
    });
    document.getElementById('call-bg-btn').addEventListener('click', function () {
      document.getElementById('call-bg-file-input').click();
    });
    document.getElementById('call-bg-file-input').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      compressGallery(f).then(function (url) {
        settings.callBgImage = url;
        saveData();
        applyBg();
      }).catch(function () { toast('图片处理失败'); });
    });
    document.addEventListener('click', function (e) {
      var p = document.getElementById('call-size-presets');
      if (p.classList.contains('open') && !e.target.closest('#call-size-presets') && !e.target.closest('#call-size-preset-toggle')) {
        p.classList.remove('open');
      }
    });

    bindDrag();
    bindResize();
    bindPillDrag();
  }

  function fillAv(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = avatarHtml((theContact() || {}).avatar || '🌷');
  }
  function fillNm(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = theName();
  }

  function applyBg() {
    var img = document.getElementById('call-bg-img');
    if (img) {
      var src = settings.callBgImage || '';
      if (src) { img.src = src; img.style.display = 'block'; }
      else { img.removeAttribute('src'); img.style.display = 'none'; }
    }
    var inc = document.getElementById('call-inc-bg-img');
    if (inc) {
      var s2 = settings.callBgImage || '';
      if (s2) { inc.src = s2; inc.style.display = 'block'; }
      else { inc.removeAttribute('src'); inc.style.display = 'none'; }
    }
  }

  function positionWindow() {
    var win = document.getElementById('call-window');
    if (!win) return;
    if (!S.size || typeof S.size.w !== 'number' || typeof S.size.h !== 'number') {
      S.size = { w: 280, h: 440 };
      Storage.set(KEY_SIZE, S.size);
    }
    win.style.width = S.size.w + 'px';
    win.style.height = S.size.h + 'px';
    if (S.pos) {
      win.style.left = clamp(S.pos.x, 0, window.innerWidth - S.size.w) + 'px';
      win.style.top = clamp(S.pos.y, 0, window.innerHeight - S.size.h) + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto';
    } else {
      win.style.right = '16px'; win.style.top = '72px';
      win.style.left = 'auto'; win.style.bottom = 'auto';
    }
  }
  function positionPill() {
    var pill = document.getElementById('call-mini-pill');
    if (!pill) return;
    if (S.pillPos) {
      pill.style.left = clamp(S.pillPos.x, 0, window.innerWidth - (pill.offsetWidth || 180)) + 'px';
      pill.style.top = clamp(S.pillPos.y, 0, window.innerHeight - (pill.offsetHeight || 50)) + 'px';
      pill.style.right = 'auto'; pill.style.bottom = 'auto';
    }
  }

  // ---------- 拖拽 / 缩放（chat 用 _bindDrag，这里用 pointer 事件等价实现） ----------
  function bindDrag() {
    var win = document.getElementById('call-window');
    var head = document.getElementById('call-window-header');
    if (!win || !head) return;
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.call-top-btn')) return;
      head.setPointerCapture(e.pointerId);
      S.dragOff = { x: e.clientX, y: e.clientY };
      head.style.cursor = 'grabbing';
    });
    head.addEventListener('pointermove', function (e) {
      if (!S.dragOff) return;
      win.style.left = clamp(S.pos ? S.pos.x + (e.clientX - S.dragOff.x) : e.clientX - S.dragOff.x, 0, window.innerWidth - win.offsetWidth) + 'px';
      win.style.top = clamp(S.pos ? S.pos.y + (e.clientY - S.dragOff.y) : e.clientY - S.dragOff.y, 0, window.innerHeight - win.offsetHeight) + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto';
    });
    function end(e) {
      if (!S.dragOff) return;
      S.dragOff = null;
      head.style.cursor = '';
      var r = win.getBoundingClientRect();
      S.pos = { x: r.left, y: r.top };
      Storage.set(KEY_POS, S.pos);
    }
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  function bindResize() {
    var h = document.getElementById('call-resize-handle');
    var win = document.getElementById('call-window');
    if (!h || !win) return;
    h.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      h.setPointerCapture(e.pointerId);
      var r = win.getBoundingClientRect();
      S.resizeInit = { ex: e.clientX, ey: e.clientY, w: r.width, h: r.height };
    });
    h.addEventListener('pointermove', function (e) {
      if (!S.resizeInit) return;
      S.size.w = clamp(S.resizeInit.w + (e.clientX - S.resizeInit.ex), 160, 600);
      S.size.h = clamp(S.resizeInit.h + (e.clientY - S.resizeInit.ey), 240, 720);
      win.style.width = S.size.w + 'px';
      win.style.height = S.size.h + 'px';
    });
    function end() {
      if (!S.resizeInit) return;
      S.resizeInit = null;
      Storage.set(KEY_SIZE, S.size);
    }
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  }

  function bindPillDrag() {
    var pill = document.getElementById('call-mini-pill');
    if (!pill) return;
    pill.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.call-mini-hangup')) return;
      pill.setPointerCapture(e.pointerId);
      var r = pill.getBoundingClientRect();
      S.pillDragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    pill.addEventListener('pointermove', function (e) {
      if (!S.pillDragOff) return;
      pill.style.left = clamp(e.clientX - S.pillDragOff.x, 0, window.innerWidth - pill.offsetWidth) + 'px';
      pill.style.top = clamp(e.clientY - S.pillDragOff.y, 0, window.innerHeight - pill.offsetHeight) + 'px';
      pill.style.right = 'auto'; pill.style.bottom = 'auto';
    });
    function end() {
      if (!S.pillDragOff) return;
      S.pillDragOff = null;
      var r = pill.getBoundingClientRect();
      S.pillPos = { x: r.left, y: r.top };
      Storage.set(KEY_PILL_POS, S.pillPos);
    }
    pill.addEventListener('pointerup', end);
    pill.addEventListener('pointercancel', end);
  }

  // ---------- 通话记录 ----------
  function callEvent(icon, label, detail, durSec, missed) {
    var cid = S.contactId || activeContactId;
    if (!cid) return;
    if (typeof recordCall === 'function') recordCall(cid, 'video', { duration: durSec || 0, missed: !!missed });
    addMessage({
      id: newId(), contactId: cid, sender: null, text: label,
      image: null, voice: null, timestamp: Date.now(), status: 'read',
      favorited: false, recalled: false, replyTo: null, type: 'call',
      icon: icon || 'fa-video', detail: detail || null
    }, { silent: true });
  }

  // ---------- 计时 ----------
  function tick() {
    if (!S.active || !S.startTime) return;
    S.elapsed = Date.now() - S.startTime;
    var t = fmt(S.elapsed);
    var a = document.getElementById('call-timer-display');
    var b = document.getElementById('call-mini-timer');
    if (a) a.textContent = t;
    if (b) b.textContent = t;

    // 对方"动摇时刻"整通电话只评估一次
    if (!S.partnerHangupScheduled) {
      S.partnerHangupScheduled = true;
      var lo = 2 * 60 * 1000, hi = 4 * 60 * 60 * 1000;
      S.partnerHangupTimer = setTimeout(partnerHangupCheck, lo + Math.random() * (hi - lo));
    }
    S.rafId = requestAnimationFrame(tick);
  }

  function partnerHangupCheck() {
    if (!S.active || !S.startTime) return;
    var dur = Date.now() - S.startTime;
    if (dur < 2 * 60 * 1000) return;
    var bucket = dur < 3600000 ? 1 : (dur < 10800000 ? 2 : 3);
    var prob = bucket === 1 ? 0.15 : (bucket === 2 ? 0.35 : 0.45);
    if (Math.random() < prob) {
      if (!tearDown()) return;
      callEvent('fa-phone-slash', theName() + ' 挂断了通话', fmt(S.elapsed || 0), Math.floor((S.elapsed || 0) / 1000), false);
    }
  }

  function tearDown() {
    if (!S.active) return false;
    S.active = false;
    S.startTime = null;
    if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = null; }
    [S.connectingTimer, S.incomingTimer, S.partnerHangupTimer].forEach(function (t) { if (t) clearTimeout(t); });
    S.connectingTimer = S.incomingTimer = S.partnerHangupTimer = null;
    ['call-window', 'call-mini-pill', 'call-incoming-overlay'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('visible');
    });
    var sp = document.getElementById('call-size-presets');
    if (sp) sp.classList.remove('open');
    var win = document.getElementById('call-window');
    if (win) win.classList.remove('immersive');
    S.immersive = false;
    var ib = document.getElementById('call-immersive-btn');
    if (ib) { ib.classList.remove('active'); ib.querySelector('i').className = 'fas fa-eye-slash'; }
    return true;
  }

  function endCall() {
    if (!tearDown()) return;
    var dur = S.elapsed;
    if (dur < 2000) return;
    callEvent('fa-video', '视频通话已结束', fmt(dur), Math.floor(dur / 1000), false);
  }

  // ---------- 发起 / 接听 ----------
  function startCall(isPartner, contactId) {
    inject();
    var c = (contactId && memberById(contactId)) || getActiveContact();
    if (!c || isGroupContact(c)) { toast('还没有梦角'); return; }
    // 已在通话中再点 📹 → 唤回窗口；接听来电时（isPartner=true）要继续往下走
    if (S.active && !isPartner) { restoreWindow(); return; }

    S.active = true;
    S.startTime = null;
    S.elapsed = 0;
    S.isPartnerCall = !!isPartner;
    S.partnerHangupScheduled = false;
    S.minimized = false;
    S.contactId = c.id;

    var win = document.getElementById('call-window');
    var conn = document.getElementById('call-connecting-state');
    var body = document.getElementById('call-window-body');
    if (win) win.classList.add('visible');
    if (conn) conn.classList.add('visible');
    if (body) body.style.display = 'none';
    win && win.classList.remove('immersive');
    S.immersive = false;

    ['call-conn-avatar', 'call-win-avatar', 'call-mini-av'].forEach(fillAv);
    ['call-conn-name', 'call-win-name', 'call-mini-name'].forEach(fillNm);
    applyBg();
    positionWindow();

    var t = document.getElementById('call-timer-display');
    if (t) t.textContent = '00:00';

    if (S.connectingTimer) clearTimeout(S.connectingTimer);

    if (!isPartner && Math.random() < 0.35) {
      var rejectDelay = 4000 + Math.random() * 8000;
      S.connectingTimer = setTimeout(function () {
        if (!S.active) return;
        S.active = false;
        if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = null; }
        var w = document.getElementById('call-window');
        if (w) w.classList.remove('visible');
        var cn = document.getElementById('call-connecting-state');
        if (cn) cn.classList.remove('visible');
        var bd = document.getElementById('call-window-body');
        if (bd) bd.style.display = '';
        var labels = [
          theName() + ' 未接听',
          theName() + ' 正在忙，无法接听',
          theName() + ' 拒绝了通话',
          theName() + ' 暂时无法接听'
        ];
        callEvent('fa-phone-slash', labels[Math.floor(Math.random() * labels.length)], null, 0, true);
      }, rejectDelay);
    } else {
      S.connectingTimer = setTimeout(function () {
        if (!S.active) return;
        S.startTime = Date.now();
        if (conn) conn.classList.remove('visible');
        if (body) body.style.display = '';
        tick();
      }, 1400 + Math.random() * 1400);
    }
  }

  // ---------- 梦角来电 ----------
  function showIncomingCall(contactId) {
    inject();
    var c = (contactId && memberById(contactId)) || getActiveContact();
    if (!c || isGroupContact(c) || S.active) return;
    S.active = true;
    S.startTime = null;
    S.elapsed = 0;
    S.isPartnerCall = true;
    S.partnerHangupScheduled = false;
    S.minimized = false;
    S.contactId = c.id;

    var ov = document.getElementById('call-incoming-overlay');
    if (!ov) return;
    fillAv('call-inc-avatar'); fillNm('call-inc-name');
    ov.classList.add('visible');
    applyBg();
    if (S.incomingTimer) clearTimeout(S.incomingTimer);

    var autoRejectChance = 0.30;
    if (Math.random() < autoRejectChance) {
      var rejectDelay = 4000 + Math.random() * 6000;
      S.incomingTimer = setTimeout(function () {
        if (!ov.classList.contains('visible')) return;
        ov.classList.remove('visible');
        S.active = false;
        var labels = [
          theName() + ' 的来电，' + myName() + '未接听',
          myName() + '拒绝了 ' + theName() + ' 的通话',
          '错过了 ' + theName() + ' 的来电',
          myName() + '暂时无法接听 ' + theName() + ' 的通话'
        ];
        callEvent('fa-phone-slash', labels[Math.floor(Math.random() * labels.length)], null, 0, true);
      }, rejectDelay);
    } else {
      S.incomingTimer = setTimeout(function () {
        if (!ov.classList.contains('visible')) return;
        ov.classList.remove('visible');
        S.active = false;
        callEvent('fa-phone-slash', myName() + '未接听 ' + theName() + ' 的来电', null, 0, true);
      }, 60000);
    }
  }

  function minimizeWindow() {
    S.minimized = true;
    var w = document.getElementById('call-window');
    if (w) w.classList.remove('visible');
    var p = document.getElementById('call-mini-pill');
    if (p) { p.classList.add('visible'); positionPill(); }
  }
  function restoreWindow() {
    S.minimized = false;
    var p = document.getElementById('call-mini-pill');
    if (p) p.classList.remove('visible');
    var w = document.getElementById('call-window');
    if (w) { positionWindow(); w.classList.add('visible'); }
  }
  function toggleImmersive() {
    S.immersive = !S.immersive;
    var w = document.getElementById('call-window');
    if (w) w.classList.toggle('immersive', S.immersive);
    var b = document.getElementById('call-immersive-btn');
    if (b) {
      b.classList.toggle('active', S.immersive);
      b.querySelector('i').className = S.immersive ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
  }

  // ---------- 随机来电：登记为"每位梦角各自独立"的活动 ----------
  // chat companion.js scheduleRandomInvite 的数字：每 15~60 分钟检查一次 → 25% 概率发起。
  // 原实现是单个全局定时器 + 取当前梦角，等于只有"正在聊天的那位"会打来；
  // 现在每位梦角各自排期、各自掷骰子，A 的来电不会占用 B 的排期。
  // 注：chat 里这一步之后还有 50% 概率改走陪伴邀请；本项目没有 companion 模块，
  //     所以触发即视为视频通话。
  registerPartnerActivity({
    key: 'incoming-call',
    nextAt: function () { return Date.now() + (15 + Math.random() * 45) * 60000; },
    chance: function () { return 25; },
    enabled: function (c) { return settings.callFeatureEnabled !== false; },
    run: function (c) { showIncomingCall(c.id); }
  });

  window.CallFeature = {
    start: function () { startCall(false); },
    showIncomingCall: showIncomingCall,
    startCall: startCall,
    end: endCall,
    restoreWindow: restoreWindow,
    isActive: function () { return S.active; }
  };
})();