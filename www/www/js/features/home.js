/* ============ 字卡传讯 · 主页（情侣主页式排版，参照用户图片） ============ */

var _selAnniv = 0;  // 当前展示的纪念日下标

function initHome() {
  renderHome();
  initWeather();

  // 整个主页用事件委托，重渲染后不用重复绑定
  document.getElementById('home-scroll').addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;

    if (act === 'profile') openProfileSheet();
    else if (act === 'weather') refreshWeather(true);
    else if (act === 'anniv') openAnnivSheet();
    else if (act === 'annivChip') { _selAnniv = Number(el.dataset.idx); renderHome(); }
    else if (act === 'photo') openPhotoSheet(Number(el.dataset.idx));
    else if (act === 'play') Player.toggle(el.dataset.id);
    else if (act === 'trackMore') openTrackSheet(el.dataset.id);
    else if (act === 'addTrack') addMusicTrack();
    else if (act === 'dailyRefresh') shuffleDailyCard();
  });
}

// ---------- 渲染 ----------
function renderHome() {
  var box = document.getElementById('home-scroll');
  if (!box) return;

  if (_selAnniv >= anniversaries.length) _selAnniv = 0;

  box.innerHTML =
    profileCardHtml() +
    '<div class="home-mid">' +
      annivHtml() +
      '<div class="polaroid-top">' + polaroidHtml(0, 'p1') + polaroidHtml(1, 'p2') + '</div>' +
    '</div>' +
    playerRowsHtml() +
    dailyCardHtml() +
    '<div class="photo-row">' +
      polaroidHtml(2) + polaroidHtml(3) + polaroidHtml(4) + polaroidHtml(5) +
    '</div>';

  updateNavBadge();
}

function profileCardHtml() {
  var p = homeProfile;
  return '' +
    '<div class="profile-card" data-act="profile">' +
      '<div class="pc-left">' +
        '<div class="pc-avatar">' + escapeHtml(p.avatar || '🐧') + '</div>' +
        '<div>' +
          '<div class="pc-name">' + escapeHtml(p.name || '我') + '</div>' +
          '<div class="pc-loc">' + (p.location ? '📍 ' + escapeHtml(p.location) : '📍 点这里设置位置') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pc-right">' +
        '<div class="pc-expr">' + escapeHtml(p.expression || '(*^^*)') + '</div>' +
        '<div class="pc-weather" id="pc-weather" data-act="weather">' + weatherCellHtml() + '</div>' +
      '</div>' +
    '</div>';
}

function annivHtml() {
  var main = anniversaries[_selAnniv];
  var faceA = escapeHtml(homeProfile.avatar || '🐧');
  var faceB = contacts.length ? escapeHtml(contacts[0].avatar || '🌷') : '🌷';

  var inner;
  if (!main) {
    inner =
      '<div class="anniv-faces">' + faceA + faceB + '</div>' +
      '<div class="anniv-num">0</div>' +
      '<div class="anniv-unit">天</div>' +
      '<div class="anniv-name">点这里添加纪念日</div>';
  } else {
    inner =
      '<div class="anniv-faces">' + faceA + faceB + '</div>' +
      '<div class="anniv-num">' + daysSince(main.date) + '</div>' +
      '<div class="anniv-unit">天</div>' +
      '<div class="anniv-name">' + escapeHtml(main.name) + '</div>';
    if (anniversaries.length > 1) {
      inner += '<div class="anniv-chips">' + anniversaries.map(function (a, i) {
        return '<button class="anniv-chip' + (i === _selAnniv ? ' active' : '') +
          '" data-act="annivChip" data-idx="' + i + '">' + escapeHtml(a.name) + ' ' + daysSince(a.date) + '天</button>';
      }).join('') + '</div>';
    }
  }
  return '<div class="anniv-block" data-act="anniv">' + inner + '</div>';
}

function polaroidHtml(slot, extraClass) {
  var src = photoWall[slot];
  return '<div class="polaroid ' + (extraClass || '') + '" data-act="photo" data-idx="' + slot + '">' +
    '<div class="po-img">' + (src ? '<img src="' + src + '" alt="">' : '<span class="po-empty">＋</span>') +
    '</div></div>';
}

function playerRowsHtml() {
  var rows = musicTracks.map(function (t) {
    var playing = Player.playingId === t.id && Player.audio && !Player.audio.paused;
    return '<div class="player-row' + (playing ? ' playing' : '') + '">' +
      '<div class="pr-cover">' + (playing ? '♫' : '🎵') + '</div>' +
      '<div class="pr-mid">' +
        '<div class="pr-name">' + escapeHtml(t.name) + '</div>' +
        '<div class="pr-lyric">' + escapeHtml(t.lyric || (t.hasAudio ? '♪' : '未上传音频 · 点 ⋯ 设置')) + '</div>' +
      '</div>' +
      '<button class="pr-play" data-act="play" data-id="' + t.id + '">' + (playing ? '⏸' : '▶') + '</button>' +
      '<button class="pr-more" data-act="trackMore" data-id="' + t.id + '">⋯</button>' +
    '</div>';
  }).join('');
  return '<div class="player-rows">' + rows +
    '<div class="player-add" data-act="addTrack">＋ 添加一条音乐</div></div>';
}

function dailyCardHtml() {
  if (!replyPool.length) return '';
  if (dailyCardIndex >= replyPool.length) dailyCardIndex = 0;
  var text = replyPool[dailyCardIndex];
  var c = contacts[0];
  var ava = c ? escapeHtml(c.avatar || '🌷') : '🌷';
  var cname = c ? escapeHtml(c.name) : '';
  var today = (new Date().getMonth() + 1) + '月' + new Date().getDate() + '日';

  return '<div class="word-card">' +
    '<button class="wc-refresh" data-act="dailyRefresh" title="换一张">↻</button>' +
    '<div class="wc-quote">' + escapeHtml(text) + '</div>' +
    '<div class="wc-sign">' +
      '<span class="wc-ava">' + ava + '</span>' +
      '<span>' + cname + '的字卡 · ' + today + '</span>' +
    '</div>' +
  '</div>';
}

// ---------- 天数 ----------
function daysSince(dateStr) {
  var p = String(dateStr).split('-');
  if (p.length !== 3) return 0;
  var start = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (isNaN(start.getTime())) return 0;
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - start) / 86400000));
}

// ---------- 个人资料卡 ----------
function openProfileSheet() {
  showSheet('个人资料', [
    { label: '✏️ 改昵称', act: 'name' },
    { label: '🐧 改头像（emoji）', act: 'avatar' },
    { label: '📍 改位置', act: 'loc' },
    { label: '😊 改状态表情', act: 'expr' },
    { label: '☁️ 设置天气城市', act: 'city' },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act === 'name') {
      promptModal('昵称', '', homeProfile.name, function (v) {
        homeProfile.name = v; saveData(); renderHome();
      });
    } else if (act === 'avatar') {
      promptModal('头像', '输入一个 emoji（如 🐧 🌷 🌙）', homeProfile.avatar, function (v) {
        homeProfile.avatar = v; saveData(); renderHome();
      });
    } else if (act === 'loc') {
      promptModal('位置', '如：维多利亚港', homeProfile.location || '', function (v) {
        homeProfile.location = v; saveData(); renderHome();
      });
    } else if (act === 'expr') {
      promptModal('状态表情', '如：(*^^*)  (｡♥‿♥｡)', homeProfile.expression || '', function (v) {
        homeProfile.expression = v; saveData(); renderHome();
      });
    } else if (act === 'city') {
      promptWeatherCity();
    }
  });
}

// ---------- 纪念日 ----------
function openAnnivSheet() {
  var main = anniversaries[_selAnniv];
  var items = [];
  if (main) {
    items.push({ label: '✏️ 改名字（' + main.name + '）', act: 'rename' });
    items.push({ label: '📅 改日期（' + main.date + '）', act: 'date' });
    items.push({ label: '🗑 删除这个纪念日', act: 'del', danger: true });
  }
  items.push({ label: '➕ 添加纪念日', act: 'add' });
  items.push({ label: '取消', act: 'cancel', cancel: true });

  showSheet(main ? '纪念日 · ' + main.name : '纪念日', items, function (act) {
    if (act === 'add') {
      promptModal('新纪念日', '起个名字（如：在一起 / 认识 / 生日）', '', function (name) {
        if (!name) return;
        askAnnivDate(function (date) {
          anniversaries.push({ id: 'a_' + Date.now(), name: name, date: date });
          _selAnniv = anniversaries.length - 1;
          saveData();
          renderHome();
          toast('已添加');
        });
      });
    } else if (act === 'rename') {
      promptModal('改名字', '', main.name, function (v) {
        main.name = v; saveData(); renderHome();
      });
    } else if (act === 'date') {
      askAnnivDate(function (date) {
        main.date = date; saveData(); renderHome();
      }, main.date);
    } else if (act === 'del') {
      confirmModal('删除纪念日', '确定删除「' + main.name + '」吗？', function () {
        anniversaries.splice(_selAnniv, 1);
        _selAnniv = 0;
        saveData();
        renderHome();
        toast('已删除');
      }, { danger: true });
    }
  });
}

function askAnnivDate(onOk, prefill) {
  var today = new Date();
  var def = prefill || (today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0'));
  confirmModal('日期', '格式 2026-01-01（也可以写 2026/1/1）', function (v) {
    var d = new Date(v.replace(/\//g, '-'));
    var norm = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    onOk(norm);
  }, {
    input: def,
    validate: function (v) { return !isNaN(new Date(v.replace(/\//g, '-')).getTime()); }
  });
}

// ---------- 拍立得照片 ----------
function openPhotoSheet(slot) {
  if (!photoWall[slot]) {
    pickPhotoFile(slot);
    return;
  }
  showSheet('照片', [
    { label: '🔍 查看大图', act: 'view' },
    { label: '🔄 更换照片', act: 'replace' },
    { label: '🗑 删除', act: 'del', danger: true },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act === 'view') openImageViewer(photoWall[slot]);
    else if (act === 'replace') pickPhotoFile(slot);
    else if (act === 'del') {
      photoWall[slot] = null;
      saveData();
      renderHome();
    }
  });
}

function pickPhotoFile(slot) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    compressPhoto(file).then(function (dataUrl) {
      photoWall[slot] = dataUrl;
      saveData();
      renderHome();
    }).catch(function () { toast('图片读取失败'); });
  };
  input.click();
}

// 拍立得专用压缩：720px / 0.75，控制 localStorage 体积
function compressPhoto(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function () {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var max = 720;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- 每日字卡 ----------
function shuffleDailyCard() {
  if (replyPool.length < 2) return;
  var next = dailyCardIndex;
  while (next === dailyCardIndex) {
    next = Math.floor(Math.random() * replyPool.length);
  }
  dailyCardIndex = next;
  saveData();
  renderHome();
}

// ---------- 未读角标（导航“聊天”格） ----------
function updateNavBadge() {
  var total = contacts.reduce(function (sum, c) { return sum + (c.unread || 0); }, 0);
  var badge = document.getElementById('nav-badge-chat');
  if (!badge) return;
  if (total > 0) {
    badge.style.display = 'flex';
    badge.textContent = total > 99 ? '99+' : total;
  } else {
    badge.style.display = 'none';
  }
}
