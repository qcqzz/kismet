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
        '<div class="pc-avatar">' + avatarHtml(p.avatar || '🐧') + '</div>' +
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
  var faceA = avatarHtml(homeProfile.avatar || '🐧');
  var faceB = avatarHtml(contactAvatar(hc));

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
      '<div class="dt-ls-label">链接状态</div>' +
      '<div class="dt-ls-text" id="dt-ls-text">共鸣中</div>' +
      '<div class="dt-ls-hearts" id="dt-ls-hearts">' + hearts + '</div>' +
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
        '<div class="sc-avatar">' + avatarHtml(contactAvatar(hc)) + '</div>' +
        '<div class="sc-info">' +
          '<div class="sc-name">' + escapeHtml(hc.name) + '</div>' +
          '<div class="sc-sign">' + escapeHtml(_dreamSignCache || '专属字卡库空空的，导入字卡后这里随机换一条') + '</div>' +
        '</div>' +
      '</div>';
  }

  html +=
    '<div class="sc-bar sc-me" data-act="scMe">' +
      '<div class="sc-avatar">' + avatarHtml(homeProfile.avatar || '🐧') + '</div>' +
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
    '<div class="hb-face">' + avatarHtml(contactAvatar(hc)) + '</div>' +
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
    this.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); return; }
    openCropper(file, 'bg', function (dataUrl) {
      homeBoxBg = dataUrl;
      saveData();
      renderHome();
      toast('背景已更换');
    });
  };
  input.click();
}

// ---------- 桌面背景 + 组件透明度 ----------
// 设置页和首页资料弹层共用这一个弹窗，避免两处各写一套
function openHomeBgEditor() {
  var old = document.getElementById('home-bg-modal');
  if (old) old.remove();

  var cur = settings.homeBgImage || '';
  var alpha = Number(settings.homeCardAlpha);
  if (!(alpha > 0)) alpha = 0.76;

  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'home-bg-modal';
  mask.innerHTML =
    '<div class="modal-box home-bg-box">' +
      '<div class="m-title">桌面背景</div>' +
      '<div class="hbg-thumb">' +
        (cur ? '<img src="' + escapeHtml(cur) + '" alt="">' : '<i class="fas fa-image"></i>') +
      '</div>' +
      '<div class="hbg-btns">' +
        '<button class="row-btn" id="hbg-upload"><i class="fas fa-plus"></i> 上传图片</button>' +
        (cur ? '<button class="row-btn" id="hbg-clear">清除背景</button>' : '') +
      '</div>' +
      '<div class="hbg-alpha">' +
        '<div class="hbg-alpha-lab">组件透明度 <b id="hbg-alpha-val">' +
          Math.round(alpha * 100) + '%</b></div>' +
        '<input type="range" id="hbg-alpha" min="40" max="100" step="1" value="' +
          Math.round(alpha * 100) + '">' +
        '<div class="hbg-alpha-foot">数值越小卡片越透，桌面背景越明显</div>' +
      '</div>' +
      '<div class="m-actions"><button class="m-btn-ok">完成</button></div>' +
    '</div>';
  document.body.appendChild(mask);

  var thumb = mask.querySelector('.hbg-thumb');
  function apply() { applyAppearance(); renderHome(); }

  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function () {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); return; }
    openCropper(file, 'bg', function (dataUrl) {
      settings.homeBgImage = dataUrl;
      saveData();
      thumb.innerHTML = '<img src="' + escapeHtml(dataUrl) + '" alt="">';
      var clearBtn = mask.querySelector('#hbg-clear');
      if (clearBtn) clearBtn.remove();
      var b = mask.querySelector('.hbg-btns');
      if (b && !mask.querySelector('#hbg-clear')) {
        var nb = document.createElement('button');
        nb.className = 'row-btn'; nb.id = 'hbg-clear';
        nb.innerHTML = '清除背景';
        nb.onclick = clearBg;
        b.appendChild(nb);
      }
      apply();
      toast('桌面背景已更换');
    });
  };

  function clearBg() {
    settings.homeBgImage = '';
    saveData();
    thumb.innerHTML = '<i class="fas fa-image"></i>';
    var c = mask.querySelector('#hbg-clear');
    if (c) c.remove();
    apply();
    toast('已清除桌面背景');
  }

  mask.querySelector('#hbg-upload').onclick = function () { input.click(); };
  var clear0 = mask.querySelector('#hbg-clear');
  if (clear0) clear0.onclick = clearBg;

  var slider = mask.querySelector('#hbg-alpha');
  var valEl = mask.querySelector('#hbg-alpha-val');
  slider.addEventListener('input', function () {
    var v = Number(slider.value) / 100;
    valEl.textContent = slider.value + '%';
    // 先只刷 CSS 变量，拖动过程不重绘整个首页，避免卡
    document.documentElement.style.setProperty('--home-card-alpha', v);
  });
  slider.addEventListener('change', function () {
    settings.homeCardAlpha = Number(slider.value) / 100;
    saveData();
    applyAppearance();
  });

  mask.querySelector('.m-btn-ok').onclick = function () {
    settings.homeCardAlpha = Number(slider.value) / 100;
    saveData();
    applyAppearance();
    renderHome();
    mask.remove();
  };
  mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
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
    { label: '<i class="fas fa-user"></i> 改头像（上传图片）', act: 'avatar' },
    { label: '<i class="fas fa-comment"></i> 改个性签名', act: 'sign' },
    { label: '<i class="fas fa-location-dot"></i> 改位置', act: 'loc' },
    { label: '<i class="fas fa-smile"></i> 改状态', act: 'expr' },
    { label: '<i class="fas fa-image"></i> 桌面背景', act: 'homebg' },
    { label: '<i class="fas fa-cloud"></i> 设置天气城市', act: 'city' },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act === 'name') {
      promptModal('昵称', '', homeProfile.name, function (v) {
        homeProfile.name = v; saveData(); renderHome();
      });
    } else if (act === 'avatar') {
      pickMyAvatar(function () { renderHome(); });
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
      promptModal('状态', '如：(*^^*)  (｡♥‿♥｡)', homeProfile.expression || '', function (v) {
        homeProfile.expression = v; saveData(); renderHome();
      });
    } else if (act === 'homebg') {
      closeSheet();
      openHomeBgEditor();
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
  items.push({ label: '<i class="fas fa-plus"></i> 添加纪念日', act: 'addAnniv' });
  items.push({ label: '⏳ 添加倒数日', act: 'addCount' });
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
  openDateWheel(onOk, prefill);
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
    this.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); return; }
    // 拍立得是方的，裁成 1:1
    openCropper(file, 'photo', function (dataUrl) {
      photoWall[slot] = dataUrl;
      saveData();
      renderHome();
    });
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

// 我的头像：只支持上传图片（裁成正方形 480×480）
function pickMyAvatar(onDone) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function () {
    var file = input.files && input.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); return; }
    openCropper(file, 'avatar', function (dataUrl) {
      homeProfile.avatar = dataUrl;
      saveData();
      if (typeof renderMoments === 'function') renderMoments();
      if (onDone) onDone();
      toast('头像已更换');
    });
  };
  input.click();
}

// 表情包专用压缩：必须保住透明通道。
// 表情包基本都是透明 PNG，而 compressImage 一律转 JPEG —— JPEG 没有 alpha，
// 画布的透明区会被填成黑色，表情包看上去就"破损"了。
// 这里优先用 WebP（支持透明且体积小），浏览器不支持时退回 PNG。
function compressSticker(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function () {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var max = 480;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        var webp = canvas.toDataURL('image/webp', 0.82);
        // 不支持 WebP 时 toDataURL 会回落到 PNG，这里确认一下前缀
        if (webp.indexOf('data:image/webp') === 0) return resolve(webp);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 通用图片压缩
function compressImage(file, max, quality) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function () {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
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
  if (badge) {
    if (total > 0) {
      badge.style.display = 'flex';
      badge.textContent = total > 99 ? '99+' : total;
    } else {
      badge.style.display = 'none';
    }
  }
  // 信件格的红点由 letters.js 维护
  if (typeof updateEnvelopeBadge === 'function') updateEnvelopeBadge();
}
