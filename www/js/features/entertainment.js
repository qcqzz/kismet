/* ============ 字卡传讯 · 娱乐（电影院 + 音乐厅） ============ */
/*
 * 娱乐页内可切换梦角：影院约定、心愿单、影评、一起听、娱乐聊天都按梦角分开存。
 *   Storage key: entertainmentState { [contactId]: { activeTab, cinema, music } }
 *   Storage key: entContactId      上次选中的梦角
 *
 * 影片 / 音频 Blob 存 IndexedDB（避免 localStorage 装不下）。
 * 观影聊天与一起听聊天会同步一份到主聊天，主聊天里也能看到。
 */
(function () {
  if (window.__KismetEntLoaded) return;
  window.__KismetEntLoaded = true;

  var KEY_STATE = 'entertainmentState';
  var KEY_CID = 'entContactId';
  var _ents = Storage.get(KEY_STATE);
  if (!_ents || typeof _ents !== 'object') _ents = {};
  var _cid = Storage.get(KEY_CID) || '';
  var _tab = 'cinema';
  var _entryTab = null;   // 从主页入口进入时要强制打开的标签
  var _bound = false;
  var _videoUrl = null;
  var _audioUrl = null;
  var _audio = null;
  var _audioSongId = null;
  var _lastPosSave = 0;
  var _vinylUrl = null;
  var _playSeq = 0;

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
  function uid(prefix) { return (prefix || 'e') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowHM() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtMD(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function parseYmdHm(date, time) {
    if (!date) return null;
    var p = String(date).split('-'), hm = String(time || '20:30').split(':');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10),
      parseInt(hm[0], 10) || 0, parseInt(hm[1], 10) || 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  function todayYmd() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function singles() { return contacts.filter(function (c) { return !isGroupContact(c); }); }

  // ---------- IndexedDB：影片 / 音频 ----------
  var MediaStore = {
    db: null,
    open: function () {
      if (MediaStore.db) return Promise.resolve(MediaStore.db);
      return new Promise(function (resolve, reject) {
        var req = indexedDB.open('kismet_ent_media', 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        req.onsuccess = function () { MediaStore.db = req.result; resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    },
    put: function (id, blob) {
      return MediaStore.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put(blob, id);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    },
    get: function (id) {
      return MediaStore.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var req = db.transaction('files').objectStore('files').get(id);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { reject(req.error); };
        });
      });
    },
    del: function (id) {
      return MediaStore.open().then(function (db) {
        return new Promise(function (resolve) {
          var tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').delete(id);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        });
      });
    }
  };

  // ---------- 数据 ----------
  function defCinema() {
    return { appt: null, watchlist: [], history: [], messages: [] };
  }
  function defMusic() {
    return { songs: [], currentId: null, invite: { active: false, since: 0 }, messages: [] };
  }
  function stateFor(cid) {
    if (!_ents[cid]) _ents[cid] = { activeTab: 'cinema', cinema: defCinema(), music: defMusic() };
    var st = _ents[cid];
    if (!st.cinema) st.cinema = defCinema();
    if (!st.music) st.music = defMusic();
    if (!Array.isArray(st.cinema.watchlist)) st.cinema.watchlist = [];
    if (!Array.isArray(st.cinema.history)) st.cinema.history = [];
    if (!Array.isArray(st.cinema.messages)) st.cinema.messages = [];
    if (!Array.isArray(st.music.songs)) st.music.songs = [];
    if (!Array.isArray(st.music.messages)) st.music.messages = [];
    if (!st.music.invite) st.music.invite = { active: false, since: 0 };
    return st;
  }
  function save() { Storage.set(KEY_STATE, _ents); }

  // ---------- 音乐厅播放器自定义 ----------
  var MP_SWATCHES = ['#ff9f9d', '#ffb36b', '#a8e6cf', '#7fc8f8', '#c5b8e6', '#f9c6d0', '#8ed1c0', '#f6c177', '#b39ddb'];
  var MP_VAR = { hb: '--mh-hb-c', prog: '--mh-prog-c', ctrl: '--mh-ctrl-c' };
  var HB_PATH = 'M0,82 L16,82 L18,82 L26,40 L34,124 L42,48 L50,84 L58,82 L98,82 L104,40 L110,124 L116,44 L124,84 L132,82 L170,82 L176,38 L182,124 L190,40 L198,84 L206,82 L246,82 L252,38 L258,124 L264,48 L272,84 L280,82 L320,82 L326,40 L332,124 L338,50 L346,84 L354,82 L372,82';

  function playerConf(cid) {
    var m = stateFor(cid).music;
    if (!m.playerConf || typeof m.playerConf !== 'object') m.playerConf = {};
    var pc = m.playerConf;
    if (pc.mode !== 'single' && pc.mode !== 'shuffle') pc.mode = 'list';
    if (!pc.hbColor) pc.hbColor = '#ff9f9d';
    if (!pc.progColor) pc.progColor = '#c5a47e';
    if (!pc.ctrlColor) pc.ctrlColor = '#7a9cc6';
    if (['standard', 'rounded', 'rounded-large', 'square'].indexOf(pc.bubbleStyle) < 0) pc.bubbleStyle = 'standard';
    if (typeof pc.customCss !== 'string') pc.customCss = '';
    return pc;
  }

  function mountVinylArt(cid) {
    var art = document.getElementById('mh-vinyl-art');
    if (!art) return;
    var pc = playerConf(cid);
    if (!pc.vinylId) {
      art.style.backgroundImage = '';
      if (_vinylUrl) { URL.revokeObjectURL(_vinylUrl); _vinylUrl = null; }
      return;
    }
    MediaStore.get(pc.vinylId).then(function (blob) {
      if (!blob) return;
      if (_vinylUrl) URL.revokeObjectURL(_vinylUrl);
      _vinylUrl = URL.createObjectURL(blob);
      var a = document.getElementById('mh-vinyl-art');
      if (a) a.style.backgroundImage = 'url("' + _vinylUrl + '")';
    }).catch(function () {});
  }

  function applyMusicCustomCss(css) {
    var old = document.getElementById('ent-mh-user-css');
    if (old) old.remove();
    css = String(css || '').trim();
    if (!css) return;
    var el = document.createElement('style');
    el.id = 'ent-mh-user-css';
    el.setAttribute('type', 'text/css');
    el.textContent = '@scope (#ent-panel-music) {\n' + css + '\n}';
    document.head.appendChild(el);
  }

  function currentContact() {
    var c = _cid ? memberById(_cid) : null;
    if (c && !isGroupContact(c)) return c;
    var hc = (typeof getHomeContact === 'function') ? getHomeContact() : null;
    if (hc && !isGroupContact(hc)) { _cid = hc.id; return hc; }
    var s = singles();
    if (s.length) { _cid = s[0].id; return s[0]; }
    return null;
  }

  // ---------- 主聊天同步 ----------
  function addMainMsg(cid, sender, text) {
    if (!cid || typeof addMessage !== 'function') return;
    try {
      addMessage({
        id: (typeof newId === 'function') ? newId() : Date.now(),
        contactId: cid,
        sender: sender,
        type: 'normal',
        text: text,
        timestamp: new Date(),
        status: sender === 'user' ? 'sent' : 'received'
      });
    } catch (e) { console.warn('[Ent] 主聊天同步失败:', e); }
  }

  function pushMsg(box, sender, text) {
    box.push({ sender: sender, text: String(text || ''), ts: Date.now() });
    if (box.length > 100) box.splice(0, box.length - 100);
  }

  // 梦角回一句：优先用字卡库，空了给个兜底
  function partnerReply(cid) {
    var text = '';
    try { if (typeof pickReply === 'function') text = pickReply(cid); } catch (e) {}
    if (!text) {
      var fallback = ['嗯嗯，我在呢', '好呀', '你说了算', '我记下了', '陪你一起'];
      text = fallback[Math.floor(Math.random() * fallback.length)];
    }
    return text;
  }

  function sendEntChat(cid, kind, text) {
    var st = stateFor(cid);
    var box = kind === 'music' ? st.music.messages : st.cinema.messages;
    text = String(text || '').trim();
    if (!text) return;
    pushMsg(box, 'user', text);
    save();
    addMainMsg(cid, 'user', text);
    renderChat(kind);
    scrollChat(kind);

    if (typeof settings !== 'undefined' && settings.replyEnabled === false) return;
    setTimeout(function () {
      var st2 = stateFor(cid);
      var box2 = kind === 'music' ? st2.music.messages : st2.cinema.messages;
      var reply = partnerReply(cid);
      pushMsg(box2, 'partner', reply);
      save();
      addMainMsg(cid, 'partner', reply);
      renderChat(kind);
      scrollChat(kind);
    }, 1200 + Math.random() * 1600);
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
  function toastMsg(t) { if (typeof toast === 'function') toast(t); }

  function invNego(kind, cid) {
    try {
      return (window.InviteCenter && InviteCenter.nego) ? InviteCenter.nego(cid, kind) : null;
    } catch (e) { return null; }
  }

  function inviteStatusHtml(c, kind, n) {
    var isPending = n.state === 'pending';
    var line = isPending
      ? '已向 ' + c.name + ' 发出邀请，等 TA 回复'
      : c.name + ' 提议' + (n.subject ? '《' + n.subject + '》' : '') +
        (n.date ? ' ' + n.date + ' ' + (n.time || '') : '');
    return '<div class="app-card ent-invite-status">' +
      '<div class="app-card-title"><span>' + (isPending ? '等待回复' : 'TA 有新提议') + '</span></div>' +
      '<div class="app-mini" style="line-height:1.6">' + esc(line) + '</div>' +
      '<div class="ent-toolbar" style="margin-top:10px">' +
        '<button class="app-btn sm" data-act="gotoChat">去聊天回复</button>' +
        '<button class="app-btn sm danger" data-act="cancelInvite" data-kind="' + esc(kind) + '">取消邀请</button>' +
      '</div>' +
    '</div>';
  }

  // ---------- 顶部：梦角切换 / 标签 ----------
  function renderTop() {
    var c = currentContact();
    var sw = document.getElementById('ent-switch');
    if (sw) {
      if (!c) {
        sw.innerHTML = '<div class="ent-switch-name">还没有梦角</div>';
      } else {
        sw.innerHTML =
          '<span class="ent-switch-av">' + avatarImg(c) + '</span>' +
          '<span class="ent-switch-name">' + esc(c.name) + '</span>' +
          '<button class="ent-switch-btn" data-act="pickContact">切换</button>';
      }
    }
    var title = document.getElementById('ent-title');
    if (title) title.textContent = (_tab === 'music') ? '音乐厅' : '电影院';
  }

  function avatarImg(c) {
    var src = (typeof contactAvatar === 'function') ? contactAvatar(c) : DREAM_AVATAR_PLACEHOLDER;
    if (!src) return '<i class="fas fa-user"></i>';
    return '<img src="' + esc(src) + '" alt="">';
  }

  // ---------- 渲染入口 ----------
  function renderAll() {
    renderTop();
    var body = document.getElementById('entertainment-body');
    if (!body) return;
    var c = currentContact();
    if (!c) {
      body.innerHTML = '<div class="app-empty" style="padding-top:60px"><i class="fas fa-user-plus"></i>先去「消息」里新建一位梦角</div>';
      return;
    }
    var st = stateFor(c.id);
    st.activeTab = _tab;
    save();
    body.innerHTML =
      '<div class="ent-panel' + (_tab === 'cinema' ? ' on' : '') + '" id="ent-panel-cinema">' + cinemaHtml(c, st.cinema) + '</div>' +
      '<div class="ent-panel' + (_tab === 'music' ? ' on' : '') + '" id="ent-panel-music">' + musicHtml(c, st.music) + '</div>';

    if (_tab === 'cinema') mountCinemaVideo(c, st.cinema);
    else {
      // 切到音乐厅时别让影院里的视频继续在后台响
      var v = document.getElementById('cinema-video');
      if (v) { try { v.pause(); } catch (e) {} }
    }
    if (_tab === 'music') {
      syncMusicUI();
      mountVinylArt(c.id);
      applyMusicCustomCss(playerConf(c.id).customCss);
    }
  }

  // ---------- 电影院 ----------
  function cinemaHtml(c, ci) {
    var appt = ci.appt;
    var watching = !!(appt && appt.state === 'watching');
    var ing = invNego('cinema', c.id);
    var html = '<div class="ent-scroll" id="cinema-scroll">';

    // 银幕
    html += '<div class="cinema-stage" id="cinema-stage">';
    if (watching) {
      html += '<video id="cinema-video" playsinline controls></video>';
    } else if (appt) {
      html += '<div class="cinema-stage-empty"><i class="fas fa-film"></i>' +
        esc(appt.title || '电影') + '<br>约定时间 ' + esc(appt.date || '') + ' ' + esc(appt.time || '') + '</div>';
    } else {
      html += '<div class="cinema-stage-empty"><i class="fas fa-video"></i>还没有观影约定</div>';
    }
    html += '</div>';

    // 倒计时
    if (appt && !watching) {
      html += '<div class="cinema-countdown" id="cinema-countdown">' + countdownText(appt) + '</div>';
      html += '<div class="cinema-info">' +
        '<div class="cinema-info-title">' + esc(appt.title || '电影') + '</div>' +
        '<div class="cinema-info-meta">' + esc(appt.date || '') + ' ' + esc(appt.time || '') + ' · 和 ' + esc(c.name) + ' 一起看</div>' +
      '</div>';
      html += '<div class="ent-toolbar">' +
        '<button class="app-btn primary" data-act="pickVideo"><i class="fas fa-play"></i> 选片开始观看</button>' +
        '<button class="app-btn" data-act="cancelAppt">取消约定</button>' +
      '</div>';
    } else if (!appt) {
      if (ing) {
        html += inviteStatusHtml(c, 'cinema', ing);
      } else {
        html += '<div class="ent-toolbar">' +
          '<button class="app-btn primary" data-act="invite"><i class="fas fa-ticket-alt"></i> 发起观影邀请</button>' +
        '</div>';
      }
      html += '<div class="ent-toolbar">' +
        '<button class="app-btn" data-act="archive" data-tab="watchlist"><i class="fas fa-bookmark"></i> 心愿单</button>' +
        '<button class="app-btn" data-act="archive" data-tab="history"><i class="fas fa-pen-nib"></i> 影评</button>' +
      '</div>';
    }

    // 观影中工具栏
    if (watching) {
      html += '<div class="cinema-info">' +
        '<div class="cinema-info-title">' + esc(appt.title || '电影') + '</div>' +
        '<div class="cinema-info-meta">正在和 ' + esc(c.name) + ' 一起看</div>' +
      '</div>';
      html += '<div class="ent-toolbar">' +
        '<button class="app-btn" data-act="endWatch"><i class="fas fa-stop"></i> 结束观影</button>' +
        '<button class="app-btn" data-act="archive" data-tab="watchlist"><i class="fas fa-bookmark"></i> 心愿单</button>' +
        '<button class="app-btn" data-act="archive" data-tab="history"><i class="fas fa-pen-nib"></i> 影评</button>' +
      '</div>';
    }

    // 近期影评 / 心愿单预览
    if (ci.history.length) {
      html += '<div class="app-card" style="margin-top:4px">' +
        '<div class="app-card-title"><span>最近影评</span></div>' +
        ci.history.slice(0, 3).map(function (h) {
          return '<div class="ent-list-item"><div class="ent-list-main">' +
            '<div class="ent-list-title">' + esc(h.title) + '</div>' +
            '<div class="ent-list-sub">' + esc(h.date || '') + (h.review ? ' · ' + esc(h.review) : '') + '</div>' +
          '</div></div>';
        }).join('') +
      '</div>';
    }
    html += '</div>';

    // 观影聊天
    if (watching) html += chatHtml('cinema');

    return html;
  }

  function countdownText(appt) {
    var t = appt.ts;
    if (!t) {
      var dt = parseYmdHm(appt.date, appt.time);
      t = dt ? dt.getTime() : 0;
    }
    if (!t) return '等待开场';
    var diff = t - Date.now();
    if (diff <= 0) return '约定时间已到，可以开始观看了';
    var mins = Math.ceil(diff / 60000);
    if (mins < 60) return '距离观影还有 ' + mins + ' 分钟';
    var h = Math.floor(mins / 60), m = mins % 60;
    return '距离观影还有 ' + h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
  }

  function mountCinemaVideo(c, ci) {
    var v = document.getElementById('cinema-video');
    if (!v || !ci.appt || !ci.appt.mediaId) return;
    var appt = ci.appt;
    MediaStore.get(appt.mediaId).then(function (blob) {
      if (!blob) { toastMsg('影片文件丢失，请重新选片'); return; }
      if (_videoUrl) { URL.revokeObjectURL(_videoUrl); _videoUrl = null; }
      _videoUrl = URL.createObjectURL(blob);
      v.src = _videoUrl;
      v.currentTime = Number(appt.position) || 0;
      v.play().catch(function () {});
      v.addEventListener('timeupdate', function () {
        appt.position = v.currentTime;
        var now = Date.now();
        if (now - _lastPosSave > 8000) { _lastPosSave = now; save(); }
      });
    }).catch(function () { toastMsg('读取影片失败'); });
  }

  // ---------- 音乐厅 ----------
  function musicHtml(c, m) {
    var song = currentSong(m);
    var pc = playerConf(c.id);
    var ing = invNego('music', c.id);
    var html = '<div class="ent-scroll" id="music-scroll">';

    html += '<div class="mh-card" id="mh-card" style="--mh-hb-c:' + esc(pc.hbColor) + ';--mh-prog-c:' + esc(pc.progColor) + ';--mh-ctrl-c:' + esc(pc.ctrlColor) + '">' +
      '<button class="mh-set-btn" data-act="musicSettings" title="播放器自定义"><i class="fas fa-sliders-h"></i></button>' +
      '<div class="mh-vinyl' + (_audio && !_audio.paused && _audioSongId === (song && song.id) ? ' playing' : '') + '" id="mh-vinyl">' +
        '<div class="mh-vinyl-art" id="mh-vinyl-art"></div>' +
      '</div>' +
      '<div class="mh-hb"><svg viewBox="0 0 372 165" preserveAspectRatio="none"><path d="' + HB_PATH + '"/></svg></div>' +
      '<div class="mh-title" id="mh-title">' + (song ? esc(song.name) : '还没有歌曲') + '</div>' +
      '<div class="mh-sub" id="mh-sub">' + (song ? esc(song.lyric || (m.invite.active ? '和 ' + c.name + ' 一起听' : '本地音乐')) : '先添加一首歌吧') + '</div>' +
      '<div class="mh-progress" id="mh-progress"><i id="mh-progress-bar"></i></div>' +
      '<div class="mh-times"><span id="mh-time-cur">0:00</span><span id="mh-time-all">0:00</span></div>' +
      '<div class="mh-ctrl">' +
        '<button data-act="prevSong" aria-label="上一首"><i class="fas fa-step-backward"></i></button>' +
        '<button class="mh-play" data-act="togglePlay" aria-label="播放"><i class="fas ' + (_audio && !_audio.paused ? 'fa-pause' : 'fa-play') + '"></i></button>' +
        '<button data-act="nextSong" aria-label="下一首"><i class="fas fa-step-forward"></i></button>' +
      '</div>' +
    '</div>';

    if (ing) html += inviteStatusHtml(c, 'music', ing);

    html += '<div class="ent-toolbar">' +
      '<button class="app-btn primary" data-act="addSong"><i class="fas fa-plus"></i> 添加歌曲</button>' +
      (m.invite.active
        ? '<button class="app-btn" data-act="endMusic"><i class="fas fa-stop"></i> 结束一起听</button>'
        : (ing
          ? ''
          : '<button class="app-btn" data-act="inviteMusic"><i class="fas fa-headphones"></i> 邀请一起听</button>')) +
    '</div>';

    if (m.songs.length) {
      html += '<div class="app-card">' +
        '<div class="app-card-title"><span>歌单</span><span class="app-mini">' + m.songs.length + ' 首</span></div>' +
        m.songs.map(function (s) {
          return '<div class="ent-list-item">' +
            '<button class="app-btn sm" data-act="playSong" data-id="' + esc(s.id) + '" style="flex:0 0 auto"><i class="fas fa-play"></i></button>' +
            '<div class="ent-list-main">' +
              '<div class="ent-list-title">' + esc(s.name) + '</div>' +
              '<div class="ent-list-sub">' + esc(s.lyric || ((s.url || s.neteaseId) ? '网易云音乐' : '本地音乐')) + '</div>' +
            '</div>' +
            '<button class="sc-del" data-act="delSong" data-id="' + esc(s.id) + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
          '</div>';
        }).join('') +
      '</div>';
    } else {
      html += '<div class="mh-empty">歌单还是空的</div>';
    }

    html += '</div>';
    if (m.invite.active) html += chatHtml('music');
    return html;
  }

  function currentSong(m) {
    if (!m.songs.length) return null;
    var s = m.songs.find(function (x) { return x.id === m.currentId; });
    return s || m.songs[0];
  }

  function syncMusicUI() {
    var body = document.getElementById('entertainment-body');
    if (!body || _tab !== 'music') return;
    var c = currentContact();
    if (!c) return;
    var m = stateFor(c.id).music;
    var song = currentSong(m);
    var vinyl = document.getElementById('mh-vinyl');
    var title = document.getElementById('mh-title');
    var sub = document.getElementById('mh-sub');
    var playBtn = body.querySelector('[data-act="togglePlay"] i');
    if (title) title.textContent = song ? song.name : '还没有歌曲';
    if (sub) sub.textContent = song ? (song.lyric || (m.invite.active ? '和 ' + c.name + ' 一起听' : ((song.url || song.neteaseId) ? '网易云音乐' : '本地音乐'))) : '先添加一首歌吧';
    if (vinyl) vinyl.classList.toggle('playing', !!(_audio && !_audio.paused && song && _audioSongId === song.id));
    if (playBtn) playBtn.className = 'fas ' + (_audio && !_audio.paused ? 'fa-pause' : 'fa-play');
    updateProgress();
  }

  function fmtSec(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + pad2(s % 60);
  }
  function updateProgress() {
    var bar = document.getElementById('mh-progress-bar');
    var cur = document.getElementById('mh-time-cur');
    var all = document.getElementById('mh-time-all');
    if (!bar) return;
    var d = _audio ? _audio.duration : 0;
    var t = _audio ? _audio.currentTime : 0;
    if (!d || !isFinite(d)) d = 0;
    bar.style.width = d ? ((t / d) * 100) + '%' : '0%';
    if (cur) cur.textContent = fmtSec(t);
    if (all) all.textContent = d ? fmtSec(d) : '0:00';
  }

  function stopAudio() {
    if (_audio) {
      _audio.pause();
      _audio.onended = null;
      _audio.ontimeupdate = null;
      _audio.onerror = null;
      _audio = null;
    }
    if (_audioUrl) { URL.revokeObjectURL(_audioUrl); _audioUrl = null; }
    _audioSongId = null;
  }

  function bindProgressBar() {
    var prog = document.getElementById('mh-progress');
    if (!prog || prog.dataset.bound) return;
    prog.dataset.bound = '1';
    prog.addEventListener('click', function (e) {
      if (!_audio || !_audio.duration) return;
      var r = prog.getBoundingClientRect();
      _audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * _audio.duration;
    });
  }

  function startAudio(src, song, blobUrl, onFail) {
    _audioUrl = blobUrl || null;
    _audio = new Audio(src);
    _audioSongId = song.id;
    var c = currentContact();
    if (c) { stateFor(c.id).music.currentId = song.id; save(); }
    _audio.play().catch(function () { if (onFail) onFail(); });
    _audio.ontimeupdate = updateProgress;
    _audio.onended = function () { onTrackEnded(); };
    if (onFail) _audio.onerror = function () { onFail(); };
    bindProgressBar();
    syncMusicUI();
  }

  // 网易云歌曲：先向解析接口要一条新鲜的直链，失败再依次试镜像端点
  function nmMirrorUrls(song) {
    var id = song.neteaseId;
    if (!id) return song.url ? [song.url] : [];
    return NM_URL_APIS.map(function (base) { return base + encodeURIComponent(id); });
  }

  var _nmCache = {};

  function nmResolveDirect(song) {
    if (!song.neteaseId) return Promise.resolve(song.url || '');
    var id = song.neteaseId;
    var hit = _nmCache[id];
    if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return Promise.resolve(hit.url);
    function ask(round) {
      var url = 'https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' +
        encodeURIComponent(id) + '&br=320&r=' + Math.random();
      return nmJson(url).then(function (d) {
        var u = (d && typeof d.url === 'string' && /^https?:/i.test(d.url)) ? d.url : '';
        if (u) _nmCache[id] = { url: u, ts: Date.now() };
        return u;
      }).catch(function () {
        return round > 0 ? ask(round - 1) : '';
      });
    }
    return ask(1);
  }

  function playSourceAt(song, list, idx, seq) {
    if (seq !== _playSeq) return;
    if (idx >= list.length) { toastMsg('这首歌暂时播不了，可能需要会员'); return; }
    stopAudio();
    var advanced = false;
    var next = function () {
      if (advanced || seq !== _playSeq) return;
      advanced = true;
      playSourceAt(song, list, idx + 1, seq);
    };
    startAudio(list[idx], song, null, next);
  }

  function playRemote(song, seq) {
    nmResolveDirect(song).then(function (direct) {
      if (seq !== _playSeq) return;
      var list = direct ? [direct].concat(nmMirrorUrls(song)) : nmMirrorUrls(song);
      playSourceAt(song, list, 0, seq);
    });
  }

  function playSong(id) {
    var c = currentContact();
    if (!c) return;
    var st = stateFor(c.id);
    var m = st.music;
    var song = m.songs.find(function (s) { return s.id === id; }) || currentSong(m);
    if (!song) { toastMsg('先添加一首歌'); return; }
    if (_audio && _audioSongId === song.id && !_audio.paused) { _audio.pause(); syncMusicUI(); return; }
    if (_audio && _audioSongId === song.id && _audio.paused) { _audio.play().catch(function () {}); syncMusicUI(); return; }

    var seq = ++_playSeq;
    stopAudio();
    if (typeof Player !== 'undefined' && Player.stopAll) { try { Player.stopAll(); } catch (e) {} }
    if (song.neteaseId) { playRemote(song, seq); return; }
    if (song.url) { playSourceAt(song, [song.url], 0, seq); return; }
    MediaStore.get(song.audioId).then(function (blob) {
      if (seq !== _playSeq) return;
      if (!blob) { toastMsg('音频文件丢失，请重新添加'); return; }
      var url = URL.createObjectURL(blob);
      startAudio(url, song, url, function () { toastMsg('播放失败'); });
    }).catch(function () { toastMsg('读取音频失败'); });
  }

  function nextSong(dir) {
    var c = currentContact();
    if (!c) return;
    var m = stateFor(c.id).music;
    if (!m.songs.length) return;
    var pc = playerConf(c.id);
    if (pc.mode === 'shuffle' && (dir || 1) > 0) {
      if (m.songs.length === 1) { playSong(m.songs[0].id); return; }
      var pool = m.songs.filter(function (s) { return s.id !== m.currentId; });
      var pick = pool[Math.floor(Math.random() * pool.length)] || m.songs[0];
      playSong(pick.id);
      return;
    }
    var idx = m.songs.findIndex(function (s) { return s.id === m.currentId; });
    if (idx < 0) idx = 0;
    var next = m.songs[(idx + (dir || 1) + m.songs.length) % m.songs.length];
    playSong(next.id);
  }

  function onTrackEnded() {
    var c = currentContact();
    if (!c) return;
    var pc = playerConf(c.id);
    if (pc.mode === 'single') {
      if (_audio) { _audio.currentTime = 0; _audio.play().catch(function () {}); }
      return;
    }
    nextSong(1);
  }

  // ---------- 添加歌曲（本地文件 / 网易云链接） ----------
  var NM_URL_APIS = [
    'https://api.injahow.cn/meting/?server=netease&type=url&id=',
    'https://music.3e0.cn/?server=netease&type=url&id=',
    'https://meting.jmstrand.cn/?type=url&id='
  ];

  function nmParse(input) {
    var s = String(input || '').trim();
    if (!s) return null;
    var type = /playlist|toplist|discover/i.test(s) ? 'playlist' : 'song';
    var m = /[?&#]id=(\d+)/.exec(s) || /\/(?:song|playlist)\/(\d+)/.exec(s);
    var id = m ? m[1] : (/^\d+$/.test(s) ? s : '');
    if (!id) return null;
    return { type: type, id: id };
  }

  // 163cn.tv 短链先跟随跳转拿到完整链接
  function nmResolve(input) {
    var s = String(input || '').trim();
    if (!/^https?:\/\/(?:163cn\.tv|y\.music\.163\.com)/i.test(s) || /[?&#]id=\d+/.test(s)) {
      return Promise.resolve(s);
    }
    return fetch(s, { redirect: 'follow', credentials: 'omit' }).then(function (r) {
      return (r && r.url) ? r.url : s;
    }).catch(function () { return s; });
  }

  function nmJson(url) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.timeout = 12000;
      x.onload = function () { try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(e); } };
      x.onerror = x.ontimeout = function () { reject(new Error('fetch failed')); };
      x.send();
    });
  }

  function nmJsonp(url) {
    return new Promise(function (resolve, reject) {
      var cb = 'cb_nm_' + Date.now();
      var s = document.createElement('script');
      var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 12000);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
      }
      window[cb] = function (data) { cleanup(); resolve(data); };
      s.onerror = function () { cleanup(); reject(new Error('script error')); };
      s.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }

  // 兼容镜像与官方接口的几种返回结构
  function nmNormalize(data) {
    var items = [];
    function push(t) {
      if (!t || typeof t !== 'object') return;
      var name = String(t.name || t.title || '').trim();
      var artist = '';
      if (t.artist) artist = String(t.artist);
      else if (t.author) artist = String(t.author);
      else if (Array.isArray(t.artists)) {
        artist = t.artists.map(function (a) { return a && a.name; }).filter(Boolean).join('/');
      }
      var netId = t.id != null ? String(t.id) : '';
      if (!netId) {
        var m = /[?&]id=(\d+)/.exec(String(t.url || ''));
        if (m) netId = m[1];
      }
      if (!name || !netId) return;
      items.push({ name: name, artist: artist, netId: netId });
    }
    if (Array.isArray(data)) data.forEach(push);
    else if (data && Array.isArray(data.songs)) data.songs.forEach(push);
    else if (data && Array.isArray(data.result && data.result.songs)) data.result.songs.forEach(push);
    else if (data && Array.isArray(data.tracks)) data.tracks.forEach(push);
    else if (data && Array.isArray(data.result && data.result.tracks)) data.result.tracks.forEach(push);
    else if (data && Array.isArray(data.playlist && data.playlist.tracks)) data.playlist.tracks.forEach(push);
    return items;
  }

  function nmFetch(type, id) {
    var apis = [
      function () { return nmJson('https://api.injahow.cn/meting/?server=netease&type=' + type + '&id=' + encodeURIComponent(id) + '&r=' + Math.random()); },
      function () { return nmJson('https://music.3e0.cn/?server=netease&type=' + type + '&id=' + encodeURIComponent(id) + '&r=' + Math.random()); },
      type === 'playlist'
        ? function () { return nmJsonp('https://music.163.com/api/playlist/detail?id=' + encodeURIComponent(id)); }
        : function () { return nmJsonp('https://music.163.com/api/song/detail?ids=[' + encodeURIComponent(id) + ']'); }
    ];
    return new Promise(function (resolve, reject) {
      var i = 0;
      function next() {
        if (i >= apis.length) { reject(new Error('fail')); return; }
        var fn = apis[i++];
        Promise.resolve().then(fn).then(function (data) {
          var items = nmNormalize(data);
          if (items.length) resolve(items); else next();
        }).catch(next);
      }
      next();
    });
  }

  function nmAddSongs(cid, items) {
    var m = stateFor(cid).music;
    var seen = {};
    m.songs.forEach(function (s) { seen[String(s.neteaseId || ('name:' + s.name))] = 1; });
    var added = 0;
    items.forEach(function (it) {
      if (added >= 300) return;
      var key = String(it.netId);
      if (seen[key]) return;
      seen[key] = 1;
      m.songs.push({
        id: uid('song'),
        name: it.name,
        lyric: it.artist || '网易云音乐',
        url: '',
        neteaseId: it.netId
      });
      added++;
    });
    if (added) {
      if (!m.currentId && m.songs.length) m.currentId = m.songs[0].id;
      save();
    }
    return added;
  }

  function addLocalSong(cid) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var id = uid('s');
      MediaStore.put(id, file).then(function () {
        var m = stateFor(cid).music;
        m.songs.push({
          id: uid('song'),
          name: file.name.replace(/\.[^.]+$/, '') || '未命名',
          lyric: '',
          audioId: id
        });
        save();
        renderAll();
        toastMsg('已添加歌曲');
      }).catch(function () { toastMsg('添加失败（存储空间不足？）'); });
    };
    input.click();
  }

  function addSong() {
    var c = currentContact();
    if (!c) return;
    var html =
      '<div class="app-field">' +
        '<div class="app-label">网易云链接或 ID</div>' +
        '<input class="app-input" id="nm-link" placeholder="歌曲、歌单链接或歌曲 ID">' +
      '</div>' +
      '<div class="nm-hint">支持单曲、歌单与分享短链，纯数字按歌曲 ID 处理</div>' +
      '<div class="nm-status" id="nm-status"></div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-nm="local"><i class="fas fa-folder-open"></i> 本地文件</button>' +
        '<button class="app-btn primary" data-nm="import"><i class="fas fa-cloud-arrow-down"></i> 导入网易云</button>' +
      '</div>';
    openSheet('添加歌曲', html, function (wrap) {
      var input = wrap.querySelector('#nm-link');
      var status = wrap.querySelector('#nm-status');

      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-nm]');
        if (!b) return;
        if (b.getAttribute('data-nm') === 'local') { closeSheet(); addLocalSong(c.id); return; }

        var raw = (input && input.value || '').trim();
        if (!raw) { toastMsg('先粘贴网易云链接'); return; }
        b.disabled = true;
        if (status) { status.className = 'nm-status'; status.textContent = '正在获取歌曲…'; }

        nmResolve(raw).then(function (url) {
          var p = nmParse(url);
          if (!p) {
            if (/163cn\.tv/i.test(url)) throw new Error('short');
            throw new Error('bad');
          }
          return nmFetch(p.type, p.id).catch(function () {
            // 纯数字 ID 也可能是歌单，单曲没取到就按歌单再试一次
            if (p.type !== 'song') throw new Error('fail');
            return nmFetch('playlist', p.id);
          });
        }).then(function (items) {
          var added = nmAddSongs(c.id, items);
          if (!added) {
            if (status) { status.className = 'nm-status'; status.textContent = '这些歌已经在歌单里了'; }
            toastMsg('这些歌已经在歌单里了');
            b.disabled = false;
            return;
          }
          if (status) { status.className = 'nm-status ok'; status.textContent = '已导入 ' + added + ' 首'; }
          if (input) input.value = '';
          toastMsg('已导入 ' + added + ' 首');
          renderAll();
          b.disabled = false;
        }).catch(function (err) {
          var msg = (err && err.message === 'short')
            ? '短链解析失败，请粘贴完整链接'
            : '导入失败，检查链接或网络';
          if (status) { status.className = 'nm-status err'; status.textContent = msg; }
          toastMsg(msg);
          b.disabled = false;
        });
      });

      if (input) input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var go = wrap.querySelector('[data-nm="import"]');
        if (go) go.click();
      });
    });
  }

  // ---------- 娱乐聊天 ----------
  function chatHtml(kind) {
    return '<div class="ent-chat" id="ent-chat-' + kind + '">' +
      '<div class="ent-chat-list" id="ent-chat-list-' + kind + '"></div>' +
      '<div class="ent-chat-bar">' +
        '<input class="ent-chat-input" id="ent-chat-input-' + kind + '" data-chat="' + kind + '" placeholder="说点什么">' +
        '<button class="ent-send" data-act="sendChat" data-chat="' + kind + '"><i class="fas fa-paper-plane"></i></button>' +
      '</div>' +
    '</div>';
  }

  function renderChat(kind) {
    var c = currentContact();
    if (!c) return;
    var st = stateFor(c.id);
    var box = kind === 'music' ? st.music.messages : st.cinema.messages;
    var list = document.getElementById('ent-chat-list-' + kind);
    if (!list) return;
    if (!box.length) {
      list.innerHTML = '<div class="ent-msg-sys">' + (kind === 'music' ? '一起听的时候说点什么吧' : '看电影的时候说点什么吧') + '</div>';
      return;
    }
    list.innerHTML = box.map(function (m) {
      if (m.sender === 'system') return '<div class="ent-msg-sys">' + esc(m.text) + '</div>';
      var isUser = m.sender === 'user';
      var av = isUser ? myAvatar() : contactAvatar(c);
      var bs = (kind === 'music') ? playerConf(c.id).bubbleStyle : 'standard';
      return '<div class="ent-msg ' + (isUser ? 'user' : '') + '">' +
        '<span class="ent-msg-av">' + (av ? '<img src="' + esc(av) + '" alt="">' : '') + '</span>' +
        '<div class="ent-msg-b bubble-' + esc(bs) + '">' + esc(m.text) + '</div>' +
      '</div>';
    }).join('');
  }
  function scrollChat(kind) {
    var list = document.getElementById('ent-chat-list-' + kind);
    if (list) list.scrollTop = list.scrollHeight;
  }

  // ---------- 邀请 / 约定 ----------
  function openInviteSheet() {
    var c = currentContact();
    if (!c) return;
    if (window.InviteCenter && InviteCenter.openCompose) {
      var st0 = stateFor(c.id);
      var first = st0.cinema.watchlist[0];
      InviteCenter.openCompose('cinema', c.id, { subject: first ? first.title : '' });
      return;
    }
  }

  function pickVideo() {
    var c = currentContact();
    if (!c) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var id = uid('v');
      MediaStore.put(id, file).then(function () {
        var st = stateFor(c.id);
        if (!st.cinema.appt) return;
        st.cinema.appt.mediaId = id;
        st.cinema.appt.state = 'watching';
        st.cinema.appt.startedAt = Date.now();
        st.cinema.appt.position = 0;
        pushMsg(st.cinema.messages, 'system', '观影开始：《' + (st.cinema.appt.title || '电影') + '》');
        save();
        renderAll();
      }).catch(function () { toastMsg('影片保存失败（文件太大？）'); });
    };
    input.click();
  }

  function endWatch() {
    var c = currentContact();
    if (!c) return;
    var st = stateFor(c.id);
    var appt = st.cinema.appt;
    if (!appt) return;
    var v = document.getElementById('cinema-video');
    var pos = v ? v.currentTime : (appt.position || 0);
    confirmModal('结束观影', '要和 ' + c.name + ' 结束这次观影吗？', function () {
      var mins = Math.max(1, Math.round(((Date.now() - (appt.startedAt || Date.now())) / 60000) || (pos / 60)));
      st.cinema.history.unshift({
        id: uid('h'),
        title: appt.title || '电影',
        date: fmtMD(Date.now()),
        review: '',
        minutes: mins,
        ts: Date.now()
      });
      st.cinema.history = st.cinema.history.slice(0, 30);
      st.cinema.appt = null;
      pushMsg(st.cinema.messages, 'system', '结束了《' + (appt.title || '电影') + '》的观影');
      save();
      renderAll();
      promptReview(st.cinema.history[0]);
    });
  }

  function promptReview(item) {
    if (!item) return;
    confirmModal('写点影评', '《' + item.title + '》看完了，留一句话吧', function (v) {
      if (v) { item.review = String(v).trim(); save(); renderAll(); }
    }, { textarea: '' });
  }

  // ---------- 档案：影评 / 心愿单 ----------
  function openArchive(tab) {
    var c = currentContact();
    if (!c) return;
    tab = tab || 'history';
    var st = stateFor(c.id);
    var ci = st.cinema;
    function bodyHtml() {
      if (tab === 'watchlist') {
        return (ci.watchlist.length ? ci.watchlist.map(function (w) {
          return '<div class="ent-list-item">' +
            '<div class="ent-list-main"><div class="ent-list-title">' + esc(w.title) + '</div>' +
            '<div class="ent-list-sub">' + esc(w.date || '') + '</div></div>' +
            '<button class="sc-del" data-act="delWatch" data-id="' + esc(w.id) + '"><i class="fas fa-trash-alt"></i></button>' +
          '</div>';
        }).join('') : '<div class="app-empty"><i class="far fa-bookmark"></i>心愿单还是空的</div>') +
        '<div class="app-actions"><button class="app-btn" data-act="addWatch"><i class="fas fa-plus"></i> 添加想看的电影</button></div>';
      }
      return (ci.history.length ? ci.history.map(function (h) {
        return '<div class="ent-list-item"><div class="ent-list-main">' +
          '<div class="ent-list-title">' + esc(h.title) + '</div>' +
          '<div class="ent-list-sub">' + esc(h.date || '') + (h.minutes ? ' · ' + h.minutes + ' 分钟' : '') + (h.review ? ' · ' + esc(h.review) : '') + '</div>' +
        '</div></div>';
      }).join('') : '<div class="app-empty"><i class="far fa-file-alt"></i>还没有影评</div>');
    }
    function shell() {
      return '<div class="app-chips" id="archive-tabs">' +
          '<button class="app-chip' + (tab === 'history' ? ' on' : '') + '" data-act="archiveTab" data-tab="history">影评</button>' +
          '<button class="app-chip' + (tab === 'watchlist' ? ' on' : '') + '" data-act="archiveTab" data-tab="watchlist">心愿单</button>' +
        '</div>' +
        '<div style="margin-top:12px" id="archive-body">' + bodyHtml() + '</div>';
    }
    openSheet('观影档案', shell(), function (wrap) {
      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'archiveTab') {
          tab = btn.dataset.tab;
          var title = wrap.querySelector('.app-sheet-title');
          // 重新渲染整个弹层内容
          var newWrap = wrap;
          newWrap.querySelector('.app-sheet').innerHTML =
            '<div class="app-sheet-title">观影档案</div>' + shell();
          return;
        }
        if (btn.dataset.act === 'addWatch') {
          promptModal('添加心愿', '想看哪部电影？', '', function (v) {
            if (!v) return;
            ci.watchlist.unshift({ id: uid('w'), title: v, date: fmtMD(Date.now()), ts: Date.now() });
            save();
            closeSheet();
            renderAll();
            openArchive('watchlist');
          });
          return;
        }
        if (btn.dataset.act === 'delWatch') {
          var id = btn.dataset.id;
          ci.watchlist = ci.watchlist.filter(function (w) { return w.id !== id; });
          save();
          closeSheet();
          renderAll();
          openArchive('watchlist');
        }
      });
    });
  }

  // ---------- 一起听 ----------
  function inviteMusic() {
    var c = currentContact();
    if (!c) return;
    var st = stateFor(c.id);
    var song = currentSong(st.music);
    if (!song) { toastMsg('先添加一首歌'); return; }
    if (window.InviteCenter && InviteCenter.openCompose) {
      InviteCenter.openCompose('music', c.id, { subject: song.name });
    }
  }

  function endMusic() {
    var c = currentContact();
    if (!c) return;
    var st = stateFor(c.id);
    st.music.invite = { active: false, since: 0 };
    pushMsg(st.music.messages, 'system', '结束了这次一起听');
    save();
    renderAll();
  }

  // ---------- 播放器自定义 ----------
  function mpSwatches(key, cur) {
    var known = MP_SWATCHES.indexOf(cur) >= 0;
    return '<div class="mp-swatches">' +
      MP_SWATCHES.map(function (col) {
        return '<button class="mp-swatch' + (col === cur ? ' on' : '') + '" data-mp="color" data-key="' + key +
          '" data-color="' + col + '" style="background:' + col + '"></button>';
      }).join('') +
      '<button class="mp-swatch mp-swatch--custom' + (known ? '' : ' on') + '" data-mp="wheel" data-key="' + key + '" title="自定义颜色"></button>' +
      '<input type="color" id="mp-wheel-' + key + '" value="' + esc(cur) + '" style="display:none">' +
    '</div>';
  }

  function openMusicSettings() {
    var c = currentContact();
    if (!c) return;
    var pc = playerConf(c.id);
    var modeOpts = [
      { v: 'list', name: '歌单循环' },
      { v: 'single', name: '单曲循环' },
      { v: 'shuffle', name: '随机播放' }
    ];
    var bubbleOpts = [
      { v: 'standard', name: '标准尖角' },
      { v: 'rounded', name: '圆角' },
      { v: 'rounded-large', name: '大圆角胶囊' },
      { v: 'square', name: '方形直角' }
    ];
    var html =
      '<div class="mp-section"><div class="mp-section-title">播放模式</div><div class="mp-mode-row">' +
        modeOpts.map(function (o) {
          return '<button class="mp-chip' + (pc.mode === o.v ? ' on' : '') + '" data-mp="mode" data-mode="' + o.v + '">' + o.name + '</button>';
        }).join('') +
      '</div></div>' +

      '<div class="mp-section"><div class="mp-section-title">自定义唱片</div>' +
        '<div class="mp-vinyl-preview" id="mp-vinyl-preview"></div>' +
        '<div class="mp-css-actions">' +
          '<button class="app-btn sm" data-mp="uploadVinyl">上传唱片图</button>' +
          '<button class="app-btn sm" data-mp="resetVinyl">恢复默认</button>' +
        '</div>' +
        '<input type="file" id="mp-vinyl-file" accept="image/*" style="display:none">' +
      '</div>' +

      '<div class="mp-section"><div class="mp-section-title">心跳线颜色</div>' + mpSwatches('hb', pc.hbColor) + '</div>' +
      '<div class="mp-section"><div class="mp-section-title">播放进度线颜色</div>' + mpSwatches('prog', pc.progColor) + '</div>' +
      '<div class="mp-section"><div class="mp-section-title">控制按钮颜色</div>' + mpSwatches('ctrl', pc.ctrlColor) + '</div>' +

      '<div class="mp-section"><div class="mp-section-title">气泡样式</div><div class="mp-mode-row">' +
        bubbleOpts.map(function (o) {
          return '<button class="mp-chip' + (pc.bubbleStyle === o.v ? ' on' : '') + '" data-mp="bubble" data-bubble="' + o.v + '">' + o.name + '</button>';
        }).join('') +
      '</div></div>' +

      '<div class="mp-section"><div class="mp-section-title">自定义 CSS</div>' +
        '<textarea class="mp-css-area" id="mp-css" spellcheck="false" placeholder=".ent-msg-b { border-radius: 18px; }">' + esc(pc.customCss) + '</textarea>' +
        '<div class="mp-css-actions">' +
          '<button class="app-btn sm" data-mp="applyCss">应用</button>' +
          '<button class="app-btn sm" data-mp="clearCss">清空</button>' +
        '</div>' +
      '</div>' +

      '<div class="app-actions"><button class="app-btn primary" data-mp="close">完成</button></div>';

    openSheet('播放器自定义', html, function (wrap) {
      var prev = wrap.querySelector('#mp-vinyl-preview');
      function setPreview(url) {
        if (!prev) return;
        prev.style.backgroundImage = url ? 'url("' + url + '")' : '';
      }
      if (pc.vinylId) {
        MediaStore.get(pc.vinylId).then(function (blob) {
          if (!blob) return;
          var u = URL.createObjectURL(blob);
          setPreview(u);
          setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
        }).catch(function () {});
      }

      var fileInput = wrap.querySelector('#mp-vinyl-file');
      if (fileInput) fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var id = uid('vinyl');
        MediaStore.put(id, f).then(function () {
          pc.vinylId = id;
          save();
          mountVinylArt(c.id);
          var u = URL.createObjectURL(f);
          setPreview(u);
          setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
          toastMsg('唱片图已更换');
        }).catch(function () { toastMsg('保存失败（图片太大？）'); });
        fileInput.value = '';
      });

      function setColor(key, color) {
        pc[key === 'hb' ? 'hbColor' : (key === 'prog' ? 'progColor' : 'ctrlColor')] = color;
        save();
        var card = document.getElementById('mh-card');
        if (card) card.style.setProperty(MP_VAR[key], color);
        wrap.querySelectorAll('.mp-swatch[data-key="' + key + '"][data-color]').forEach(function (s) {
          s.classList.toggle('on', s.getAttribute('data-color') === color);
        });
        var custom = wrap.querySelector('.mp-swatch[data-key="' + key + '"][data-mp="wheel"]');
        if (custom) custom.classList.toggle('on', MP_SWATCHES.indexOf(color) < 0);
      }

      ['hb', 'prog', 'ctrl'].forEach(function (key) {
        var wheel = wrap.querySelector('#mp-wheel-' + key);
        if (wheel) wheel.addEventListener('input', function () { setColor(key, wheel.value); });
      });

      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mp]');
        if (!b) return;
        var mp = b.getAttribute('data-mp');
        if (mp === 'close') { closeSheet(); return; }
        if (mp === 'uploadVinyl') { if (fileInput) fileInput.click(); return; }
        if (mp === 'resetVinyl') {
          pc.vinylId = '';
          save();
          mountVinylArt(c.id);
          setPreview('');
          toastMsg('已恢复默认唱片');
          return;
        }
        if (mp === 'color') { setColor(b.getAttribute('data-key'), b.getAttribute('data-color')); return; }
        if (mp === 'wheel') {
          var key = b.getAttribute('data-key');
          var wheel = wrap.querySelector('#mp-wheel-' + key);
          if (wheel) wheel.click();
          return;
        }
        if (mp === 'mode') {
          pc.mode = b.getAttribute('data-mode') || 'list';
          save();
          wrap.querySelectorAll('[data-mp="mode"]').forEach(function (x) {
            x.classList.toggle('on', x.getAttribute('data-mode') === pc.mode);
          });
          return;
        }
        if (mp === 'bubble') {
          pc.bubbleStyle = b.getAttribute('data-bubble') || 'standard';
          save();
          wrap.querySelectorAll('[data-mp="bubble"]').forEach(function (x) {
            x.classList.toggle('on', x.getAttribute('data-bubble') === pc.bubbleStyle);
          });
          renderChat('music');
          return;
        }
        if (mp === 'applyCss' || mp === 'clearCss') {
          var ta = wrap.querySelector('#mp-css');
          var css = mp === 'clearCss' ? '' : (ta ? ta.value : '');
          if (ta && mp === 'clearCss') ta.value = '';
          pc.customCss = css;
          save();
          applyMusicCustomCss(css);
          toastMsg(css ? '自定义 CSS 已应用' : '已清空自定义 CSS');
        }
      });
    });
  }

  // ---------- 梦角切换 ----------
  function openContactPicker() {
    var list = singles();
    if (!list.length) { toastMsg('还没有梦角'); return; }
    var html = list.map(function (c) {
      return '<button class="ent-list-item" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);cursor:pointer;text-align:left" data-act="pickContact" data-id="' + esc(c.id) + '">' +
        '<span class="ent-switch-av" style="width:38px;height:38px">' + avatarImg(c) + '</span>' +
        '<span class="ent-list-main"><span class="ent-list-title">' + esc(c.name) + '</span></span>' +
        (c.id === _cid ? '<i class="fas fa-check" style="color:var(--ink-3)"></i>' : '') +
      '</button>';
    }).join('');
    openSheet('选择梦角', html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act="pickContact"]');
        if (!btn) return;
        var id = btn.dataset.id;
        if (id && id !== _cid) {
          stopAudio();
          _cid = id;
          Storage.set(KEY_CID, _cid);
          // 保持当前所在入口（电影院 / 音乐厅），不跟梦角上次的标签跳走
        }
        closeSheet();
        renderAll();
      });
    });
  }

  // ---------- 事件 ----------
  function bind() {
    if (_bound) return;
    _bound = true;

    // 事件委托挂在整页上：梦角切换条 / 影院音乐厅钉 / 面板内容都在这个范围里
    var view = document.getElementById('view-entertainment');
    if (!view) return;

    view.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;

      if (act === 'pickContact') openContactPicker();
      else if (act === 'invite') openInviteSheet();
      else if (act === 'musicSettings') openMusicSettings();
      else if (act === 'gotoChat') {
        var cg = currentContact();
        if (cg && typeof openChat === 'function') openChat(cg.id);
      }
      else if (act === 'cancelInvite') {
        var ci = currentContact();
        if (ci && window.InviteCenter && InviteCenter.cancel) {
          InviteCenter.cancel(ci.id, el.dataset.kind === 'music' ? 'music' : 'cinema');
        }
      }
      else if (act === 'pickVideo') pickVideo();
      else if (act === 'cancelAppt') {
        var c1 = currentContact();
        if (!c1) return;
        confirmModal('取消约定', '确定取消这次观影约定吗？', function () {
          var st = stateFor(c1.id);
          st.cinema.appt = null;
          if (window.InviteCenter && InviteCenter.cancelAppt) InviteCenter.cancelAppt(c1.id, 'cinema');
          save();
          renderAll();
        }, { danger: true });
      }
      else if (act === 'endWatch') endWatch();
      else if (act === 'archive') openArchive(el.dataset.tab);
      else if (act === 'addSong') addSong();
      else if (act === 'playSong') playSong(el.dataset.id);
      else if (act === 'togglePlay') {
        var cm = currentContact();
        if (!cm) return;
        var song = currentSong(stateFor(cm.id).music);
        if (!song) { toastMsg('先添加一首歌'); return; }
        if (_audio && _audioSongId === song.id) {
          if (_audio.paused) _audio.play().catch(function () {}); else _audio.pause();
          syncMusicUI();
        } else playSong(song.id);
      }
      else if (act === 'prevSong') nextSong(-1);
      else if (act === 'nextSong') nextSong(1);
      else if (act === 'delSong') {
        var cd = currentContact();
        if (!cd) return;
        var id = el.dataset.id;
        confirmModal('删除歌曲', '确定从歌单里删掉这首歌吗？', function () {
          var m = stateFor(cd.id).music;
          var s = m.songs.find(function (x) { return x.id === id; });
          if (s && s.audioId) MediaStore.del(s.audioId);
          if (_audioSongId === id) stopAudio();
          m.songs = m.songs.filter(function (x) { return x.id !== id; });
          if (m.currentId === id) m.currentId = m.songs.length ? m.songs[0].id : null;
          save();
          renderAll();
        }, { danger: true });
      }
      else if (act === 'inviteMusic') inviteMusic();
      else if (act === 'endMusic') endMusic();
      else if (act === 'sendChat') {
        var cc = currentContact();
        if (!cc) return;
        var kind = el.dataset.chat;
        var input = document.getElementById('ent-chat-input-' + kind);
        if (input) { sendEntChat(cc.id, kind, input.value); input.value = ''; }
      }
    });

    view.addEventListener('keydown', function (e) {
      var input = e.target.closest('.ent-chat-input');
      if (!input) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var c = currentContact();
      if (!c) return;
      sendEntChat(c.id, input.dataset.chat, input.value);
      input.value = '';
    });

    view.addEventListener('click', function (e) {
      var prog = e.target.closest('#mh-progress');
      if (!prog || !_audio || !_audio.duration) return;
      var r = prog.getBoundingClientRect();
      _audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * _audio.duration;
    });
  }

  // 倒计时每分钟刷新一次
  setInterval(function () {
    var el = document.getElementById('cinema-countdown');
    if (!el) return;
    var c = currentContact();
    if (!c) return;
    var appt = stateFor(c.id).cinema.appt;
    if (appt && appt.state !== 'watching') el.textContent = countdownText(appt);
  }, 30000);

  window.EntertainmentApp = {
    onShow: function () {
      bind();
      var c = currentContact();
      if (_entryTab) {
        _tab = _entryTab;
        _entryTab = null;
      } else if (c) {
        var st = stateFor(c.id);
        _tab = (st.activeTab === 'music') ? 'music' : 'cinema';
      }
      renderAll();
    },
    // 主页入口：电影院 / 音乐厅
    open: function (tab) {
      _entryTab = (tab === 'music') ? 'music' : 'cinema';
      showView('entertainment');
    },
    // 邀请卡跳转：指定梦角打开对应入口
    openFor: function (tab, cid) {
      if (cid) {
        var c = (typeof memberById === 'function') ? memberById(cid) : null;
        if (c && !isGroupContact(c)) {
          stopAudio();
          _cid = cid;
          Storage.set(KEY_CID, cid);
        }
      }
      this.open(tab);
    },
    render: renderAll,

    // ---------- 邀请中心对接 ----------
    applyInviteAccept: function (kind, cid, n) {
      var st = stateFor(cid);
      var c = (typeof memberById === 'function') ? memberById(cid) : null;
      var name = (c && c.name) ? c.name : '梦角';
      if (kind === 'cinema') {
        st.cinema.appt = {
          title: n.subject || '电影',
          date: n.date || '',
          time: n.time || '',
          ts: n.ts || 0,
          state: 'waiting',
          position: 0,
          mediaId: ''
        };
        if (Array.isArray(st.cinema.messages)) {
          pushMsg(st.cinema.messages, 'system', '和 ' + name + ' 约好一起看《' + (n.subject || '电影') + '》' + (n.date ? ' ' + n.date + ' ' + (n.time || '') : ''));
        }
        save();
      } else if (kind === 'music') {
        st.music.invite = { active: true, since: Date.now() };
        var song = null;
        if (n.subject) {
          song = st.music.songs.find(function (s) { return s.name === n.subject; });
          if (song) st.music.currentId = song.id;
        }
        if (Array.isArray(st.music.messages)) {
          pushMsg(st.music.messages, 'system', name + ' 答应了一起听' + (n.subject ? '《' + n.subject + '》' : ''));
        }
        save();
        if (song && _cid === cid) {
          var v = document.getElementById('cinema-video');
          if (v) { try { v.pause(); } catch (e) {} }
          playSong(song.id);
        }
      }
      if (_cid === cid) renderAll();
    },
    hasCinemaAppt: function (cid) { return !!stateFor(cid).cinema.appt; },
    hasMusicTogether: function (cid) { return !!stateFor(cid).music.invite.active; },
    songNames: function (cid) {
      return (stateFor(cid).music.songs || []).map(function (s) { return s.name; });
    },
    pickMovieTitle: function (cid) {
      var ci = stateFor(cid).cinema;
      var pool = [];
      (ci.watchlist || []).forEach(function (w) { if (w && w.title) pool.push(w.title); });
      (ci.history || []).forEach(function (h) { if (h && h.title) pool.push(h.title); });
      if (!pool.length) {
        pool = ['爱在黎明破晓前', '千与千寻', '爱乐之城', '你的名字', '星际穿越', '海蒂和爷爷', '魔女宅急便'];
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }
  };
})();
