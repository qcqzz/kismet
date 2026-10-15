/* ============ 字卡传讯 · 主页（头像交错 / 重要日轮换 / 方图 / 双展示栏 / 大方框） ============ */

var _selAnniv = 0;            // 当前展示的重要日下标
var _annivRotateTimer = null; // 10s 自动轮换
var _boxPressTimer = null;    // 方框长按计时器
var _boxLongPressed = false;  // 本次按压是否已触发长按

function initHome() {
  _resetDreamSign();
  renderHome();
  initWeather();

  var box = document.getElementById('home-scroll');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = '1';

  // 点击委托（重渲染后不用重复绑定）
  box.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;

    if (act === 'profile') openProfileSheet();
    else if (act === 'weather') refreshWeather(true);
    else if (act === 'anniv') openAnnivSheet();
    else if (act === 'annivNext') { _selAnniv = (_selAnniv + 1) % anniversaries.length; renderHome(); }
    else if (act === 'photo') openPhotoSheet(Number(el.dataset.idx));
    else if (act === 'scDream') {
      var hc = getHomeContact();
      if (hc) openChat(hc.id); else toast('先新建一位梦角吧');
    }
    else if (act === 'scMe') openProfileSheet();
    else if (act === 'box') {
      // 长按刚触发过 → 忽略这次 click
      if (_boxLongPressed) { _boxLongPressed = false; return; }
    }
  });

  // 方框长按 → 编辑背景图
  box.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.home-box');
    if (!el) return;
    _boxLongPressed = false;
    clearTimeout(_boxPressTimer);
    _boxPressTimer = setTimeout(function () {
      _boxLongPressed = true;
      openBoxBgSheet();
    }, 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(function (ev) {
    box.addEventListener(ev, function () { clearTimeout(_boxPressTimer); });
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
      linkStatusHtml() +
    '</div>' +
    showcaseHtml() +
    homeBoxHtml() +
    '<div class="photo-row">' +
      polaroidHtml(2) + polaroidHtml(3) + polaroidHtml(4) + polaroidHtml(5) +
    '</div>';

  refreshLinkStatus(false);
  startLinkStatusTimer();
  startAnnivRotation();
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
          '<div class="pc-loc">' + (p.location ? '<i class="fas fa-location-dot"></i> ' + escapeHtml(p.location) : '<i class="fas fa-location-dot"></i> 点这里设置位置') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pc-right">' +
        '<div class="pc-expr">' + escapeHtml(p.expression || '(*^^*)') + '</div>' +
        '<div class="pc-weather" id="pc-weather" data-act="weather">' + weatherCellHtml() + '</div>' +
      '</div>' +
    '</div>';
}

// ---------- 重要日（多个 10s 自动轮换，不显示 chips） ----------
function daysUntil(dateStr) {
  var p = String(dateStr).split('-');
  if (p.length !== 3) return 0;
  var target = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (isNaN(target.getTime())) return 0;
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

// 数字与单位：纪念日=正数天数；倒数日=倒计时（当天"就是今天"，过期转"N天前"）
function annivInfo(a) {
  if (!a) return { num: 0, unit: '天' };
  if ((a.type || 'anniversary') === 'countdown') {
    var d = daysUntil(a.date);
    if (d > 0) return { num: d, unit: '天后' };
    if (d === 0) return { num: 0, unit: '就是今天' };
    return { num: Math.abs(d), unit: '天前' };
  }
  return { num: daysSince(a.date), unit: '天' };
}

function annivHtml(animate) {
  var main = anniversaries[_selAnniv];
  var hc = getHomeContact();
  var faceA = escapeHtml(homeProfile.avatar || '🐧');
  var faceB = hc ? escapeHtml(hc.avatar || '🌷') : '🌷';

  var inner = '<div class="anniv-faces">' +
    '<span class="af-ava af-me">' + faceA + '</span>' +
    '<span class="af-ava af-dream">' + faceB + '</span>' +
    '</div>';
  if (!main) {
    inner +=
      '<div class="anniv-num">0</div>' +
      '<div class="anniv-unit">天</div>' +
      '<div class="anniv-name">点这里添加重要日</div>';
  } else {
    var info = annivInfo(main);
    inner +=
      '<div class="anniv-num">' + info.num + '</div>' +
      '<div class="anniv-unit">' + info.unit + '</div>' +
      '<div class="anniv-name">' + escapeHtml(main.name) +
        ((main.type || 'anniversary') === 'countdown' ? ' · 倒数日' : '') +
      '</div>';
  }
  return '<div class="anniv-block' + (animate ? ' rot-in' : '') + '" data-act="anniv">' + inner + '</div>';
}

// 10 秒轮换（多个重要日时），轮换到哪个显示哪个
function startAnnivRotation() {
  if (_annivRotateTimer) { clearInterval(_annivRotateTimer); _annivRotateTimer = null; }
  if (anniversaries.length < 2) return;
  _annivRotateTimer = setInterval(function () {
    if (!anniversaries.length) return;
    _selAnniv = (_selAnniv + 1) % anniversaries.length;
    var block = document.querySelector('.anniv-block');
    if (block) {
      block.classList.add('anniv-fade');
      setTimeout(function () {
        var holder = document.createElement('div');
        holder.innerHTML = annivHtml(true);
        var fresh = holder.firstChild;
        if (block.parentNode) block.parentNode.replaceChild(fresh, block);
      }, 260);
    }
  }, 10000);
}

// ---------- 链接状态小组件（UI 与内容规则均对齐 chat 桌面第二页） ----------
// chat 的规则：14 条文案随机取一条，各配 1~5 颗亮心；每 1~2 小时重新随机一次
// （重摇时尽量不与上次重复），按梦角隔离存储下次切换时间。
var LINK_STATUS_LIST = [
  { text: '灵魂共鸣', level: 5 },
  { text: '魂印相契', level: 5 },
  { text: '命定归栖', level: 5 },
  { text: '心律同频', level: 4 },
  { text: '命理相缠', level: 4 },
  { text: '星轨交叠', level: 4 },
  { text: '灵栖此处', level: 4 },
  { text: '命轨渐合', level: 3 },
  { text: '潮汐同流', level: 3 },
  { text: '风缕交织', level: 3 },
  { text: '心绪时隐', level: 2 },
  { text: '冥冥相引', level: 2 },
  { text: '昼夜错频', level: 1 },
  { text: '频段游离', level: 1 }
];
var LS_MIN = 60 * 60 * 1000;    // 最短间隔 1 小时
var LS_MAX = 2 * 60 * 60 * 1000; // 最长间隔 2 小时
var _lsTimer = null;

function _linkStatusKey() {
  var hc = getHomeContact();
  return 'linkStatus' + (hc ? '_' + hc.id : '');
}

function linkStatusHtml() {
  var hearts = '';
  for (var i = 0; i < 5; i++) hearts += '<i class="fas fa-heart"></i>';
  return '' +
    '<div class="dt-linkstatus" title="链接状态">' +
      '<div class="dt-ls-head">' +
        '<div class="dt-ls-icon"><i class="fas fa-heartbeat"></i></div>' +
        '<div class="dt-ls-label">链接状态</div>' +
      '</div>' +
      '<div class="dt-ls-body">' +
        '<div class="dt-ls-hearts" id="dt-ls-hearts">' + hearts + '</div>' +
        '<div class="dt-ls-text" id="dt-ls-text">共鸣中</div>' +
      '</div>' +
      '<svg class="dt-ls-line" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true">' +
        '<polyline class="ls-l-s" points="0,22 83,22 97,22 107,13 119,31 131,9 143,22 240,22"/>' +
        '<polyline class="ls-l-m" points="0,22 83,22 97,22 107,13 119,31 131,9 143,22 240,22"/>' +
      '</svg>' +
    '</div>';
}

function _paintLinkStatus(idx) {
  var item = LINK_STATUS_LIST[idx] || LINK_STATUS_LIST[0];
  var textEl = document.getElementById('dt-ls-text');
  var heartsEl = document.getElementById('dt-ls-hearts');
  if (textEl) textEl.textContent = item.text;
  if (heartsEl) {
    var hs = heartsEl.querySelectorAll('i');
    for (var i = 0; i < hs.length; i++) {
      hs[i].classList.toggle('on', i < item.level);
      hs[i].classList.toggle('pulse', i < item.level && item.level <= 2);
    }
  }
}

// 读取缓存的 idx；到期或没有则重摇，并把下次切换时间一并存下
function refreshLinkStatus(force) {
  var key = _linkStatusKey();
  var data = Storage.get(key);
  var idx;
  var needRoll = !data || typeof data.idx !== 'number' || force || !data.next || Date.now() >= data.next;
  if (needRoll) {
    var prev = data ? data.idx : -1;
    do { idx = Math.floor(Math.random() * LINK_STATUS_LIST.length); }
    while (idx === prev && LINK_STATUS_LIST.length > 1);
    Storage.set(key, { idx: idx, next: Date.now() + LS_MIN + Math.random() * (LS_MAX - LS_MIN) });
  } else {
    idx = data.idx;
  }
  _paintLinkStatus(idx);
}

// 每分钟检查一次是否该换了（页面隐藏时定时器会被浏览器节流，回前台会立刻补上）
function startLinkStatusTimer() {
  if (_lsTimer) return;
  _lsTimer = setInterval(function () { refreshLinkStatus(false); }, 60 * 1000);
}

// ---------- 双展示栏（第一排梦角，第二排用户） ----------
function _resetDreamSign() {
  _dreamSignCache = '';
  var hc = getHomeContact();
  if (!hc) return;
  var pool = poolFor(hc.id);
  if (pool.length) _dreamSignCache = randomOf(pool);
  else _dreamSignCache = hc.signature || '';
}

function showcaseHtml() {
  var hc = getHomeContact();
  var html = '<div class="showcase">';

  if (hc) {
    html +=
      '<div class="sc-bar sc-dream" data-act="scDream">' +
        '<div class="sc-avatar">' + escapeHtml(hc.avatar || '🌷') + '</div>' +
        '<div class="sc-info">' +
          '<div class="sc-name">' + escapeHtml(hc.name) + '</div>' +
          '<div class="sc-sign">' + escapeHtml(_dreamSignCache || '专属字卡库空空的，导入字卡后这里随机换一条') + '</div>' +
        '</div>' +
      '</div>';
  }

  html +=
    '<div class="sc-bar sc-me" data-act="scMe">' +
      '<div class="sc-avatar">' + escapeHtml(homeProfile.avatar || '🐧') + '</div>' +
      '<div class="sc-info">' +
        '<div class="sc-name">' + escapeHtml(homeProfile.name || '我') + '</div>' +
        '<div class="sc-sign">' + escapeHtml(homeProfile.signature || '点这里编辑个性签名') + '</div>' +
      '</div>' +
    '</div>';

  html += '</div>';
  return html;
}

// ---------- 大方框（中间梦角头像，长按换背景，无文字） ----------
function homeBoxHtml() {
  var hc = getHomeContact();
  var bgStyle = homeBoxBg ? ' style="background-image:url(' + homeBoxBg + ')"' : '';
  return '<div class="home-box' + (homeBoxBg ? ' has-bg' : '') + '" data-act="box"' + bgStyle + '>' +
    '<div class="hb-face">' + (hc ? escapeHtml(hc.avatar || '🌷') : '🌷') + '</div>' +
    '</div>';
}

function openBoxBgSheet() {
  var items = [];
  if (homeBoxBg) {
    items.push({ label: '<i class="fas fa-search"></i> 查看背景', act: 'view' });
    items.push({ label: '<i class="fas fa-sync"></i> 更换背景图', act: 'replace' });
    items.push({ label: '<i class="fas fa-trash-alt"></i> 删除背景', act: 'del', danger: true });
  } else {
    items.push({ label: '<i class="fas fa-image"></i> 设置方框背景图', act: 'replace' });
  }
  items.push({ label: '取消', act: 'cancel', cancel: true });
  showSheet('方框背景（长按编辑）', items, function (act) {
    if (act === 'view') openImageViewer(homeBoxBg);
    else if (act === 'replace') pickBoxBgFile();
    else if (act === 'del') { homeBoxBg = null; saveData(); renderHome(); }
  });
}

function pickBoxBgFile() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    compressPhoto(file).then(function (dataUrl) {
      homeBoxBg = dataUrl;
      saveData();
      renderHome();
      toast('背景已更换');
    }).catch(function () { toast('图片读取失败'); });
  };
  input.click();
}

// ---------- 底部拍立得照片墙 ----------
function polaroidHtml(slot, extraClass) {
  var src = photoWall[slot];
  return '<div class="polaroid ' + (extraClass || '') + '" data-act="photo" data-idx="' + slot + '">' +
    '<div class="po-img">' + (src ? '<img src="' + src + '" alt="">' : '<span class="po-empty">＋</span>') +
    '</div></div>';
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
    { label: '<i class="fas fa-pen"></i> 改昵称', act: 'name' },
    { label: '<i class="fas fa-user"></i> 改头像（emoji）', act: 'avatar' },
    { label: '<i class="fas fa-comment"></i> 改个性签名', act: 'sign' },
    { label: '<i class="fas fa-location-dot"></i> 改位置', act: 'loc' },
    { label: '<i class="fas fa-smile"></i> 改状态表情', act: 'expr' },
    { label: '<i class="fas fa-cloud"></i> 设置天气城市', act: 'city' },
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
    } else if (act === 'sign') {
      confirmModal('个性签名', '一句话介绍自己（留空清空）', function (v) {
        homeProfile.signature = (v || '').trim();
        saveData(); renderHome();
      }, { input: homeProfile.signature || '' });
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

// ---------- 重要日（纪念日 / 倒数日） ----------
function openAnnivSheet() {
  var main = anniversaries[_selAnniv];
  var isCount = main && (main.type || 'anniversary') === 'countdown';
  var items = [];

  if (main) {
    items.push({ label: '<i class="fas fa-sync"></i> 改类型（当前：' + (isCount ? '倒数日' : '纪念日') + '）', act: 'type' });
    items.push({ label: '<i class="fas fa-pen"></i> 改名字（' + main.name + '）', act: 'rename' });
    items.push({ label: '<i class="fas fa-calendar"></i> 改日期（' + main.date + '）', act: 'date' });
  }
  if (anniversaries.length > 1) {
    items.push({ label: '⏭ 换下一个（当前：' + (main ? main.name : '无') + '）', act: 'next' });
  }
  items.push({ label: '<i class="fas fa-plus"></i> 添加纪念日（正数天数）', act: 'addAnniv' });
  items.push({ label: '⏳ 添加倒数日（倒计时）', act: 'addCount' });
  if (main) items.push({ label: '<i class="fas fa-trash-alt"></i> 删除这个重要日', act: 'del', danger: true });
  items.push({ label: '取消', act: 'cancel', cancel: true });

  showSheet(main ? '重要日 · ' + main.name : '重要日', items, function (act) {
    if (act === 'addAnniv' || act === 'addCount') {
      var type = act === 'addCount' ? 'countdown' : 'anniversary';
      promptModal(type === 'countdown' ? '新倒数日' : '新纪念日',
        type === 'countdown' ? '起个名字（如：见面 / 生日 / 考试）' : '起个名字（如：在一起 / 认识）',
        '', function (name) {
        if (!name) return;
        askAnnivDate(function (date) {
          anniversaries.push({ id: 'a_' + Date.now(), name: name, date: date, type: type });
          _selAnniv = anniversaries.length - 1;
          saveData();
          renderHome();
          toast('已添加');
        });
      });
    } else if (act === 'type') {
      showSheet('重要日类型', [
        { label: '<i class="fas fa-calendar"></i> 纪念日 — 从那天起已经 N 天', act: 't_anniv' },
        { label: '⏳ 倒数日 — 距离那天还有 N 天', act: 't_count' },
        { label: '取消', act: 'cancel', cancel: true }
      ], function (t) {
        if (t === 't_anniv') main.type = 'anniversary';
        else if (t === 't_count') main.type = 'countdown';
        else return;
        saveData(); renderHome(); toast('已切换');
      });
    } else if (act === 'rename') {
      promptModal('改名字', '', main.name, function (v) {
        main.name = v; saveData(); renderHome();
      });
    } else if (act === 'date') {
      askAnnivDate(function (date) {
        main.date = date; saveData(); renderHome();
      }, main.date);
    } else if (act === 'next') {
      _selAnniv = (_selAnniv + 1) % anniversaries.length;
      renderHome();
    } else if (act === 'del') {
      confirmModal('删除重要日', '确定删除「' + main.name + '」吗？', function () {
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

// ---------- 照片（2-5 拍立得照片墙；纪念日旁已换为链接状态小组件） ----------
function openPhotoSheet(slot) {
  if (!photoWall[slot]) {
    pickPhotoFile(slot);
    return;
  }
  showSheet('照片', [
    { label: '<i class="fas fa-search"></i> 查看大图', act: 'view' },
    { label: '<i class="fas fa-sync"></i> 更换照片', act: 'replace' },
    { label: '<i class="fas fa-trash-alt"></i> 删除', act: 'del', danger: true },
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

// 照片专用压缩：720px / 0.75，控制 localStorage 体积
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

// ---------- 未读角标（导航"聊天"格） ----------
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
