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
  var _bound = false;
  var _videoUrl = null;
  var _audioUrl = null;
  var _audio = null;
  var _audioSongId = null;
  var _lastPosSave = 0;

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
    var pills = document.getElementById('ent-pills');
    if (pills) {
      pills.innerHTML =
        '<div class="ent-pills">' +
          '<button class="ent-pill' + (_tab === 'cinema' ? ' on' : '') + '" data-act="tab" data-tab="cinema">电影院</button>' +
          '<button class="ent-pill' + (_tab === 'music' ? ' on' : '') + '" data-act="tab" data-tab="music">音乐厅</button>' +
        '</div>';
    }
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
    if (_tab === 'music') syncMusicUI();
  }

  // ---------- 电影院 ----------
  function cinemaHtml(c, ci) {
    var appt = ci.appt;
    var watching = !!(appt && appt.state === 'watching');
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
      html += '<div class="ent-toolbar">' +
        '<button class="app-btn primary" data-act="invite"><i class="fas fa-ticket-alt"></i> 发起观影邀请</button>' +
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
    var html = '<div class="ent-scroll" id="music-scroll">';

    html += '<div class="mh-card">' +
      '<div class="mh-vinyl' + (_audio && !_audio.paused && _audioSongId === (song && song.id) ? ' playing' : '') + '" id="mh-vinyl"></div>' +
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

    html += '<div class="ent-toolbar">' +
      '<button class="app-btn primary" data-act="addSong"><i class="fas fa-plus"></i> 添加歌曲</button>' +
      (m.invite.active
        ? '<button class="app-btn" data-act="endMusic"><i class="fas fa-stop"></i> 结束一起听</button>'
        : '<button class="app-btn" data-act="inviteMusic"' + (song ? '' : ' disabled style="opacity:.45"') + '><i class="fas fa-headphones"></i> 邀请一起听</button>') +
    '</div>';

    if (m.songs.length) {
      html += '<div class="app-card">' +
        '<div class="app-card-title"><span>歌单</span><span class="app-mini">' + m.songs.length + ' 首</span></div>' +
        m.songs.map(function (s) {
          return '<div class="ent-list-item">' +
            '<button class="app-btn sm" data-act="playSong" data-id="' + esc(s.id) + '" style="flex:0 0 auto"><i class="fas fa-play"></i></button>' +
            '<div class="ent-list-main">' +
              '<div class="ent-list-title">' + esc(s.name) + '</div>' +
              '<div class="ent-list-sub">' + esc(s.lyric || '本地音乐') + '</div>' +
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
    if (sub) sub.textContent = song ? (song.lyric || (m.invite.active ? '和 ' + c.name + ' 一起听' : '本地音乐')) : '先添加一首歌吧';
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
      _audio = null;
    }
    if (_audioUrl) { URL.revokeObjectURL(_audioUrl); _audioUrl = null; }
    _audioSongId = null;
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

    stopAudio();
    if (typeof Player !== 'undefined' && Player.stopAll) { try { Player.stopAll(); } catch (e) {} }
    MediaStore.get(song.audioId).then(function (blob) {
      if (!blob) { toastMsg('音频文件丢失，请重新添加'); return; }
      _audioUrl = URL.createObjectURL(blob);
      _audio = new Audio(_audioUrl);
      _audioSongId = song.id;
      m.currentId = song.id;
      save();
      _audio.play().catch(function () { toastMsg('播放失败'); });
      _audio.ontimeupdate = updateProgress;
      _audio.onended = function () { nextSong(1); };
      syncMusicUI();
      // 进度条拖动
      var prog = document.getElementById('mh-progress');
      if (prog && !prog.dataset.bound) {
        prog.dataset.bound = '1';
        prog.addEventListener('click', function (e) {
          if (!_audio || !_audio.duration) return;
          var r = prog.getBoundingClientRect();
          _audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * _audio.duration;
        });
      }
    }).catch(function () { toastMsg('读取音频失败'); });
  }

  function nextSong(dir) {
    var c = currentContact();
    if (!c) return;
    var m = stateFor(c.id).music;
    if (!m.songs.length) return;
    var idx = m.songs.findIndex(function (s) { return s.id === m.currentId; });
    if (idx < 0) idx = 0;
    var next = m.songs[(idx + (dir || 1) + m.songs.length) % m.songs.length];
    playSong(next.id);
  }

  function addSong() {
    var c = currentContact();
    if (!c) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var id = uid('s');
      MediaStore.put(id, file).then(function () {
        var m = stateFor(c.id).music;
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
      return '<div class="ent-msg ' + (isUser ? 'user' : '') + '">' +
        '<span class="ent-msg-av">' + (av ? '<img src="' + esc(av) + '" alt="">' : '') + '</span>' +
        '<div class="ent-msg-b">' + esc(m.text) + '</div>' +
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
    var d = new Date();
    var defDate = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    var html =
      '<div class="app-field"><div class="app-label">电影名字</div>' +
        '<input class="app-input" id="cinema-title" placeholder="看什么"></div>' +
      '<div class="app-row">' +
        '<div class="app-field"><div class="app-label">日期</div>' +
          '<input class="app-input" id="cinema-date" type="date" value="' + defDate + '"></div>' +
        '<div class="app-field"><div class="app-label">时间</div>' +
          '<input class="app-input" id="cinema-time" type="time" value="20:30"></div>' +
      '</div>' +
      '<div class="app-actions">' +
        '<button class="app-btn" data-act="closeSheet">取消</button>' +
        '<button class="app-btn primary" data-act="sendInvite">邀请</button>' +
      '</div>';
    openSheet('观影邀请', html, function (wrap) {
      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'closeSheet') { closeSheet(); return; }
        if (btn.dataset.act === 'sendInvite') {
          var title = (wrap.querySelector('#cinema-title').value || '').trim();
          if (!title) { toastMsg('先写电影名字'); return; }
          var date = wrap.querySelector('#cinema-date').value || defDate;
          var time = wrap.querySelector('#cinema-time').value || '20:30';
          var dt = parseYmdHm(date, time);
          var st = stateFor(c.id);
          st.cinema.appt = {
            title: title, date: date, time: time,
            ts: dt ? dt.getTime() : Date.now(),
            state: 'waiting', position: 0, mediaId: ''
          };
          pushMsg(st.cinema.messages, 'system', '已向 ' + c.name + ' 发出观影邀请：' + title);
          save();
          closeSheet();
          renderAll();
          addMainMsg(c.id, 'user', '［观影邀请］《' + title + '》' + date + ' ' + time + '，和我一起看电影吧');
          if (typeof settings === 'undefined' || settings.replyEnabled !== false) {
            setTimeout(function () {
              var st2 = stateFor(c.id);
              pushMsg(st2.cinema.messages, 'system', c.name + ' 答应了这次观影');
              pushMsg(st2.cinema.messages, 'partner', '好呀，我记下了，到点我们一起看～');
              save();
              addMainMsg(c.id, 'partner', '好呀，我记下了，到点我们一起看～');
              renderChat('cinema');
              scrollChat('cinema');
            }, 1400);
          }
        }
      });
    });
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
    st.music.invite = { active: true, since: Date.now() };
    pushMsg(st.music.messages, 'system', '邀请 ' + c.name + ' 一起听《' + song.name + '》');
    save();
    renderAll();
    addMainMsg(c.id, 'user', '［一起听］《' + song.name + '》，陪我听一会儿吧');
    if (typeof settings === 'undefined' || settings.replyEnabled !== false) {
      setTimeout(function () {
        var st2 = stateFor(c.id);
        pushMsg(st2.music.messages, 'partner', '好呀，我戴上耳机了～');
        save();
        addMainMsg(c.id, 'partner', '好呀，我戴上耳机了～');
        renderChat('music');
        scrollChat('music');
      }, 1400);
    }
    if (!_audio) playSong(song.id);
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
          var st = stateFor(_cid);
          _tab = (st.activeTab === 'music') ? 'music' : 'cinema';
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

    var topBtn = document.getElementById('ent-contact-btn');
    if (topBtn) topBtn.addEventListener('click', openContactPicker);

    // 事件委托挂在整页上：梦角切换条 / 影院音乐厅 pill / 面板内容都在这个范围里
    var view = document.getElementById('view-entertainment');
    if (!view) return;

    view.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;

      if (act === 'pickContact') openContactPicker();
      else if (act === 'tab') {
        var tab = el.dataset.tab;
        if (tab === _tab) return;
        _tab = tab;
        var c = currentContact();
        if (c) { stateFor(c.id).activeTab = tab; save(); }
        renderAll();
      }
      else if (act === 'invite') openInviteSheet();
      else if (act === 'pickVideo') pickVideo();
      else if (act === 'cancelAppt') {
        var c1 = currentContact();
        if (!c1) return;
        confirmModal('取消约定', '确定取消这次观影约定吗？', function () {
          var st = stateFor(c1.id);
          st.cinema.appt = null;
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
      if (c) {
        var st = stateFor(c.id);
        _tab = (st.activeTab === 'music') ? 'music' : 'cinema';
      }
      renderAll();
    },
    render: renderAll
  };
})();
