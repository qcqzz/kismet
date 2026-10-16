/* ============ 字卡库 · 表情包 / 拍一拍 / 语音条 三个分页 ============ */
/* 基础字卡库：主字卡 / 表情包 / 拍一拍
   专属字卡库：主字卡 / 表情包 / 拍一拍 / 语音条

   contactId 为 null 表示基础库（全员可用），否则为某位梦角的专属库。
   表情包与拍一拍都是"基础 + 专属"两级合并，专属那份只对对应梦角生效。
   语音条只做专属。                                                  */

var _cardTab = '';   // 当前分页：main / sticker / poke / voice

// 四个分页的标签条
function cardTabBar(kind, active) {
  var tabs = kind === 'pool'
    ? [['main', '主字卡'], ['sticker', '表情包'], ['poke', '拍一拍'], ['voice', '语音条']]
    : [['main', '主字卡'], ['sticker', '表情包'], ['poke', '拍一拍']];
  return '<div class="card-tabs">' + tabs.map(function (t) {
    return '<button class="card-tab' + (t[0] === active ? ' active' : '') + '" data-tab="' + t[0] + '">' +
      t[1] + '</button>';
  }).join('') + '</div>';
}

// 拿到某个分页该显示什么；返回 null 表示该分页的内容由调用方拼
function cardTabContent(kind, tab, contactId) {
  if (tab === 'sticker') return stickerTabHtml(contactId);
  if (tab === 'poke') return pokeTabHtml(contactId);
  if (tab === 'voice') return voiceTabHtml(contactId);
  return null;   // main 交给 rules.js 原来的渲染
}

/* ---------- 表情包 ---------- */
function stickerPoolOf(contactId) {
  return contactId ? (contactStickers[contactId] || []) : stickerLibrary;
}
function setStickerPool(contactId, list) {
  if (contactId) contactStickers[contactId] = list;
  else stickerLibrary = list;
}

function stickerTabHtml(contactId) {
  var list = stickerPoolOf(contactId);
  var head = contactId ? '专属表情包' : '基础表情包';
  var grid;
  if (!list.length) {
    grid = '<div class="empty-hint">还没有表情包，点下面的按钮上传图片</div>';
  } else {
    grid = '<div class="stk-grid">' + list.map(function (s, i) {
      return '<div class="stk-cell" data-stk="' + i + '">' +
        '<img src="' + escapeHtml(s.url) + '" alt="">' +
        '<button class="stk-del" data-stkdel="' + i + '"><i class="fas fa-times"></i></button>' +
      '</div>';
    }).join('') + '</div>';
  }
  return sGroup(head + '（' + list.length + ' 张）',
    '<div class="kar-list" id="stk-list">' + grid +
      '<div class="kar-add-row">' +
        '<button class="kar-add-wide" id="stk-upload"><i class="fas fa-plus"></i> 上传表情包</button>' +
      '</div>' +
      '<input type="file" id="stk-file" accept="image/*" multiple hidden>' +
    '</div>') +
    '<div class="stk-note">' +
      (contactId
        ? '这里的表情包只有这位梦角会发。梦角回消息时 20% 概率附带一张。'
        : '这里的表情包所有梦角都能用。梦角回消息时 20% 概率附带一张。') +
    '</div>';
}

function bindStickerTab(body, contactId, rerender) {
  var upload = body.querySelector('#stk-upload');
  var file = body.querySelector('#stk-file');
  if (upload && file) {
    upload.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var files = Array.prototype.slice.call(file.files || []);
      if (!files.length) return;
      var list = stickerPoolOf(contactId).slice();
      var added = 0;
      files.forEach(function (f) {
        compressGallery(f).then(function (url) {
          list.push({ id: newId(), url: url });
          added++;
          if (added === files.length) {
            setStickerPool(contactId, list);
            saveData();
            rerender();
            toast('已添加 ' + files.length + ' 张表情包');
          }
        }).catch(function () { toast('有图片没能加上'); });
      });
      file.value = '';
    });
  }
  body.querySelectorAll('[data-stkdel]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var i = Number(b.getAttribute('data-stkdel'));
      var list = stickerPoolOf(contactId).slice();
      list.splice(i, 1);
      setStickerPool(contactId, list);
      saveData();
      rerender();
    });
  });
  // 点头像看大图
  body.querySelectorAll('.stk-cell img').forEach(function (img) {
    img.addEventListener('click', function () { openImageViewer(img.getAttribute('src')); });
  });
}

/* ---------- 拍一拍（分 TA的 / 我的的） ---------- */
function pokePoolOf(contactId, side) {
  if (!contactId) return side === 'mine' ? myPokes : partnerPokes;
  var rec = contactPokes[contactId] || (contactPokes[contactId] = { partner: [], mine: [] });
  if (!Array.isArray(rec[side])) rec[side] = [];
  return rec[side];
}

function pokeTabHtml(contactId) {
  var sides = [
    ['partner', 'TA的拍一拍', '梦角拍你'],
    ['mine', '我的拍一拍', '你拍梦角']
  ];
  var html = '';
  sides.forEach(function (s) {
    var list = pokePoolOf(contactId, s[0]);
    var items = list.length
      ? list.map(function (p, i) {
          return '<div class="kar-item"><span class="kar-text">' + escapeHtml(p) + '</span>' +
            '<button class="kar-del" data-pkdel="' + s[0] + '" data-idx="' + i + '">' +
              '<i class="fas fa-times"></i></button></div>';
        }).join('')
      : '<div class="empty-hint">还没有' + s[1] + '动作</div>';
    html += sGroup(s[1] + ' · ' + s[2] + '（' + list.length + '）',
      '<div class="kar-list" data-pklist="' + s[0] + '">' + items +
        '<div class="kar-add-row">' +
          '<input type="text" class="pk-input" data-pkinput="' + s[0] + '" placeholder="添加一个' + s[1] + '动作…">' +
          '<button class="pk-add" data-pkadd="' + s[0] + '">添加</button>' +
        '</div>' +
      '</div>');
  });
  html += '<div class="stk-note">' +
    (contactId ? '这里只对这位梦角生效。' : '这里对所有梦角生效。') +
    '双击梦角消息旁的头像发起你的拍一拍。</div>';
  return html;
}

function bindPokeTab(body, contactId, rerender) {
  body.querySelectorAll('[data-pkadd]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var side = btn.getAttribute('data-pkadd');
      var input = body.querySelector('[data-pkinput="' + side + '"]');
      var v = (input.value || '').trim();
      if (!v) { input.focus(); return; }
      var list = pokePoolOf(contactId, side).slice();
      if (list.indexOf(v) >= 0) { toast('已经有了'); return; }
      list.push(v);
      pokePoolOf(contactId, side).length = 0;
      pokePoolOf(contactId, side).push.apply(pokePoolOf(contactId, side), list);
      saveData();
      rerender();
    });
  });
  body.querySelectorAll('.pk-input').forEach(function (inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var btn = body.querySelector('[data-pkadd="' + inp.getAttribute('data-pkinput') + '"]');
        if (btn) btn.click();
      }
    });
  });
  body.querySelectorAll('[data-pkdel]').forEach(function (b) {
    b.addEventListener('click', function () {
      var side = b.getAttribute('data-pkdel');
      var i = Number(b.getAttribute('data-idx'));
      pokePoolOf(contactId, side).splice(i, 1);
      saveData();
      rerender();
    });
  });
}

/* ---------- 语音条（只做专属） ---------- */
function voiceTabHtml(contactId) {
  if (!contactId) return '<div class="empty-hint">语音条只放在专属字卡库里</div>';
  var list = voiceLibrary[contactId] || [];
  var items;
  if (!list.length) {
    items = '<div class="empty-hint">还没有语音条，点下面上传音频文件</div>';
  } else {
    items = list.map(function (v, i) {
      return '<div class="kar-item voice-item">' +
          '<button class="voice-item-play" data-vplay="' + i + '"><i class="fas fa-play"></i></button>' +
          '<span class="kar-text">' + escapeHtml(v.text || '（无文字）') +
            '<em class="voice-item-dur">' + (v.duration ? v.duration + '"' : '') + '</em></span>' +
          '<button class="kar-del" data-vdel="' + i + '"><i class="fas fa-times"></i></button>' +
        '</div>';
    }).join('');
  }
  return sGroup('语音条（' + list.length + ' 条）',
    '<div class="kar-list" id="voice-list">' +
      '<div class="voice-items">' + items + '</div>' +
      '<div class="kar-add-row">' +
        '<button class="kar-add-wide" id="voice-upload"><i class="fas fa-plus"></i> 上传语音条</button>' +
      '</div>' +
      '<input type="file" id="voice-file" accept="audio/*" hidden>' +
    '</div>') +
    '<div class="stk-note">梦角回消息时 35% 概率改发语音条（没配字卡时必发）。' +
      '语音条下方会显示你上传时填的文字。</div>';
}

function bindVoiceTab(body, contactId, rerender) {
  if (!contactId) return;
  var upload = body.querySelector('#voice-upload');
  var file = body.querySelector('#voice-file');
  if (upload && file) {
    upload.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = (file.files || [])[0];
      file.value = '';
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { toast('音频请小于 2MB'); return; }
      // 先读时长，再问文字，最后落库
      var url = URL.createObjectURL(f);
      var probe = new Audio(url);
      var done = function (duration) {
        URL.revokeObjectURL(url);
        promptModal('语音条', '上传时显示在语音条下方的文字（可留空）', '', function (v) {
          var audioId = 'v' + newId();
          AudioStore.put(audioId, f).then(function () {
            var list = (voiceLibrary[contactId] || []).slice();
            list.push({ id: newId(), text: (v || '').trim(), duration: duration, audioId: audioId });
            voiceLibrary[contactId] = list;
            saveData();
            rerender();
            toast('已添加语音条');
          }).catch(function () { toast('保存失败，存储空间可能不足'); });
        });
      };
      probe.addEventListener('loadedmetadata', function () { done(Math.round(probe.duration || 0)); });
      probe.addEventListener('error', function () { done(0); });
    });
  }
  body.querySelectorAll('[data-vdel]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = Number(b.getAttribute('data-vdel'));
      var list = (voiceLibrary[contactId] || []).slice();
      var gone = list[i];
      list.splice(i, 1);
      voiceLibrary[contactId] = list;
      if (gone && gone.audioId && typeof AudioStore !== 'undefined' && AudioStore.del) {
        try { AudioStore.del(gone.audioId); } catch (e) {}
      }
      saveData();
      rerender();
    });
  });
  body.querySelectorAll('[data-vplay]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = Number(b.getAttribute('data-vplay'));
      var v = (voiceLibrary[contactId] || [])[i];
      if (!v || !v.audioId) return;
      AudioStore.get(v.audioId).then(function (blob) {
        if (!blob) { toast('语音文件已丢失'); return; }
        var u = URL.createObjectURL(blob);
        var a = new Audio(u);
        a.play();
        a.addEventListener('ended', function () { URL.revokeObjectURL(u); });
      }).catch(function () { toast('读取失败'); });
    });
  });
}

// 分页点击统一切换
function bindCardTabs(body, kind, contactId, rerender) {
  body.querySelectorAll('.card-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      _cardTab = b.getAttribute('data-tab');
      rerender();
    });
  });
  var tab = _cardTab;
  if (tab === 'sticker') bindStickerTab(body, contactId, rerender);
  else if (tab === 'poke') bindPokeTab(body, contactId, rerender);
  else if (tab === 'voice') bindVoiceTab(body, contactId, rerender);
}
