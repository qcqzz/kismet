/* ============ 字卡传讯 · 本地存储层 ============ */

// ---------------- 图片附件库（IndexedDB） ----------------
// 头像、表情包、聊天图片、朋友圈配图、照片墙等都以 dataURL 形式保存在状态里。
// dataURL 体积约为原图的 1.3 倍，直接写 localStorage（约 5–10MB）很快就会写满；
// 写满后 setItem 抛异常，旧代码只是 console.warn，重开 App 就发现表情包 / 朋友圈 /
// 上传的图片全丢了。现在 localStorage 里只保存 "idbimg://<id>" 引用，
// 图片本体放进 IndexedDB（容量按磁盘计算），启动时再换回 dataURL，
// 渲染与备份导出逻辑完全不用改。
var IMG_REF_PREFIX = 'idbimg://';
var IMG_LOST_DATA_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
  '<rect width="240" height="240" fill="#f3f3f3"/>' +
  '<text x="120" y="125" font-size="18" fill="#9a9a9a" text-anchor="middle">图片已丢失</text></svg>'
);

var ImageStore = {
  db: null,
  open: function () {
    if (ImageStore.db) return Promise.resolve(ImageStore.db);
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return; }
      var req = indexedDB.open('kismet_images', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      };
      req.onsuccess = function () { ImageStore.db = req.result; resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('图片库打开失败')); };
    });
  },
  put: function (id, dataUrl) {
    return ImageStore.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').put(dataUrl, id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('图片写入失败')); };
        tx.onabort = function () { reject(tx.error || new Error('图片写入中止')); };
      });
    });
  },
  get: function (id) {
    return ImageStore.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('images').objectStore('images').get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  },
  getMany: function (ids) {
    return ImageStore.open().then(function (db) {
      return new Promise(function (resolve) {
        var out = {};
        if (!ids || !ids.length) { resolve(out); return; }
        var left = ids.length;
        var tx = db.transaction('images');
        var store = tx.objectStore('images');
        ids.forEach(function (id) {
          var req = store.get(id);
          req.onsuccess = function () {
            if (req.result) out[id] = req.result;
            if (--left === 0) resolve(out);
          };
          req.onerror = function () { if (--left === 0) resolve(out); };
        });
        tx.onabort = function () { resolve(out); };
      });
    });
  },
  keys: function () {
    return ImageStore.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('images').objectStore('images').getAllKeys();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  },
  del: function (id) {
    return ImageStore.open().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      });
    });
  }
};

// 53 位字符串哈希（cyrb53）：用来给图片内容生成稳定 id，同一张图只存一份
function _imgHash(str) {
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

var _imgIdByString = (typeof Map !== 'undefined') ? new Map() : null;
var _imgPersisted = (typeof Set !== 'undefined') ? new Set() : null;
// 本次启动后新写入的图片：GC 一律不删，避免和进行中的保存抢跑
var _sessionWritten = (typeof Set !== 'undefined') ? new Set() : null;

function _imageRefId(dataUrl) {
  var cached = _imgIdByString && _imgIdByString.get(dataUrl);
  if (cached) return cached;
  var id = 'i' + _imgHash(dataUrl) + '_' + dataUrl.length.toString(36);
  if (_imgIdByString) _imgIdByString.set(dataUrl, id);
  return id;
}

function _isExternalImage(s) {
  return typeof s === 'string' && s.length > 256 && s !== IMG_LOST_DATA_URL &&
    /^data:(image|video|audio)\//i.test(s);
}

function _isPlainObject(v) {
  return v && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]';
}

// 把值复制一份，长 dataURL 换成引用；图片本体收集到 pending 里等写 IndexedDB。
// 原对象保持不变——内存里继续用 dataURL，界面渲染不受影响。
function _externalizeValue(value) {
  var pending = [];
  var pendingIds = {};
  function walk(node) {
    if (typeof node === 'string') {
      if (_isExternalImage(node)) {
        var id = _imageRefId(node);
        if (!(_imgPersisted && _imgPersisted.has(id)) && !pendingIds[id]) {
          pendingIds[id] = true;
          pending.push({ id: id, data: node });
        }
        return IMG_REF_PREFIX + id;
      }
      return node;
    }
    if (Array.isArray(node)) {
      var arr = new Array(node.length);
      for (var i = 0; i < node.length; i++) arr[i] = walk(node[i]);
      return arr;
    }
    if (_isPlainObject(node)) {
      var out = {};
      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) out[k] = walk(node[k]);
      }
      return out;
    }
    return node;
  }
  return { value: walk(value), pending: pending };
}

function _hasInlineImage(node) {
  if (typeof node === 'string') return _isExternalImage(node);
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      if (_hasInlineImage(node[i])) return true;
    }
    return false;
  }
  if (_isPlainObject(node)) {
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k) && _hasInlineImage(node[k])) return true;
    }
  }
  return false;
}

function _collectImageRefs(node, set) {  if (typeof node === 'string') {
    if (node.indexOf(IMG_REF_PREFIX) === 0) set.add(node.slice(IMG_REF_PREFIX.length));
  } else if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) _collectImageRefs(node[i], set);
  } else if (_isPlainObject(node)) {
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) _collectImageRefs(node[k], set);
    }
  }
}

// 启动时把引用换回 dataURL。只改对象内部，不换引用——各模块在脚本加载阶段
// 从 Storage.get 拿到的数组 / 对象会一起变成完整图片。
function _hydrateImageRefs(node, map) {
  if (typeof node === 'string') {
    if (node.indexOf(IMG_REF_PREFIX) === 0) {
      var id = node.slice(IMG_REF_PREFIX.length);
      return map[id] || IMG_LOST_DATA_URL;
    }
    return node;
  }
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) node[i] = _hydrateImageRefs(node[i], map);
    return node;
  }
  if (_isPlainObject(node)) {
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) node[k] = _hydrateImageRefs(node[k], map);
    }
    return node;
  }
  return node;
}

function hydrateAllImages() {
  var keys = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(APP_PREFIX) === 0) keys.push(k.slice(APP_PREFIX.length));
    }
  } catch (e) {}
  var values = keys.map(function (key) { return Storage.get(key); });
  var refs = new Set();
  values.forEach(function (v) { _collectImageRefs(v, refs); });
  if (!refs.size) return Promise.resolve({ total: 0, missing: 0 });
  var ids = Array.from(refs);
  return ImageStore.getMany(ids).then(function (map) {
    var missing = 0;
    ids.forEach(function (id) {
      if (!map[id]) missing++;
      else if (_imgPersisted) _imgPersisted.add(id);   // 已在库里，重写时不必再写一遍
    });
    values.forEach(function (v) { _hydrateImageRefs(v, map); });
    return { total: ids.length, missing: missing };
  }).catch(function (e) {
    console.warn('[storage] 读取图片库失败:', e);
    // 读不到本体也要把引用换掉，否则界面会显示一串 idbimg:// 文本
    values.forEach(function (v) { _hydrateImageRefs(v, {}); });
    return { total: ids.length, missing: ids.length };
  });
}

// 清理不再被任何存档引用的图片（删除表情 / 消息 / 朋友圈后，图库不会无限膨胀）
function gcImageStore() {
  // 注意：要从 localStorage 的原始存档里找引用。内存里的值此时已经换回 dataURL，
  // 用内存值判断会把所有图片都当成“没人用”而误删。
  var refs = new Set();
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf(APP_PREFIX) !== 0) continue;
      try { _collectImageRefs(JSON.parse(localStorage.getItem(k)), refs); } catch (e) {}
    }
  } catch (e) {}
  return ImageStore.keys().then(function (ids) {
    var orphans = ids.filter(function (id) {
      return !refs.has(id) && !(_sessionWritten && _sessionWritten.has(id));
    });
    if (!orphans.length) return 0;
    return Promise.all(orphans.map(function (id) { return ImageStore.del(id); })).then(function () {
      console.log('[storage] 已清理 ' + orphans.length + ' 张未引用图片');
      return orphans.length;
    });
  }).catch(function () { return 0; });
}

var _quotaWarned = false;
function _storageWarn(key, e) {
  console.warn('[storage] 保存失败:', key, e);
  if (_quotaWarned) return;
  _quotaWarned = true;
  if (typeof toast === 'function') toast('本地存储空间不足，部分数据可能未能保存');
  setTimeout(function () { _quotaWarned = false; }, 6000);
}

var _storageSeq = {};

// 先确保图片写进 IndexedDB，再写 localStorage 的引用版；
// 图片没存成功就退回内联保存（旧做法），尽量不丢数据。
function _persistKey(key, value) {
  var seq = (_storageSeq[key] || 0) + 1;
  _storageSeq[key] = seq;
  var result;
  try {
    result = _externalizeValue(value);
  } catch (e) {
    _storageWarn(key, e);
    return;
  }
  var job = result.pending.length
    ? Promise.all(result.pending.map(function (item) {
        return ImageStore.put(item.id, item.data).then(function () {
          if (_imgPersisted) _imgPersisted.add(item.id);
          if (_sessionWritten) _sessionWritten.add(item.id);
        });
      }))
    : null;
  if (!job) {
    // 没有新图片要写：同步落盘，保持和旧版一样的行为（关 App 也不会丢最后一条）
    if (_storageSeq[key] !== seq) return;
    try {
      localStorage.setItem(APP_PREFIX + key, JSON.stringify(result.value));
    } catch (e) {
      _storageWarn(key, e);
    }
    return;
  }
  job.then(function () {
    if (_storageSeq[key] !== seq) return;   // 已有更新的写入，放弃这一份
    try {
      localStorage.setItem(APP_PREFIX + key, JSON.stringify(result.value));
    } catch (e) {
      _storageWarn(key, e);
    }
  }).catch(function (e) {
    // IndexedDB 写入失败：退回旧做法，把完整内容直接写 localStorage。
    // 能写进去就还能保住数据；实在写不进去（配额满）才提示用户。
    if (_storageSeq[key] !== seq) return;
    try {
      localStorage.setItem(APP_PREFIX + key, JSON.stringify(value));
      console.warn('[storage] 图片库写入失败，已回退到内联保存:', key, e);
    } catch (e2) {
      _storageWarn(key, e2);
    }
  });
}

var Storage = {
  _cache: {},
  get: function (key) {
    if (Object.prototype.hasOwnProperty.call(this._cache, key)) return this._cache[key];
    var val = null;
    try {
      var raw = localStorage.getItem(APP_PREFIX + key);
      val = raw === null ? null : JSON.parse(raw);
    } catch (e) { val = null; }
    this._cache[key] = val;
    return val;
  },
  set: function (key, value) {
    // 同一会话内的读写一律走内存，避免异步落盘期间读到旧值
    this._cache[key] = value;
    _persistKey(key, value);
  },
  remove: function (key) {
    delete this._cache[key];
    try { localStorage.removeItem(APP_PREFIX + key); } catch (e) {}
  },
  // 把 localStorage 里所有键重写一遍：历史版本直接塞在里面的 dataURL
  // 会在这时迁移到 IndexedDB，localStorage 占用随之大幅下降。
  repersistAll: function () {
    var self = this;
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(APP_PREFIX) === 0) keys.push(k.slice(APP_PREFIX.length));
      }
    } catch (e) {}
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(self._cache, key)) return;
      // 只重写还带着内联图片的键；已经全是引用的键不用无谓地再写一遍
      if (_hasInlineImage(self._cache[key])) self.set(key, self._cache[key]);
    });
  },
  gcImages: gcImageStore
};

function loadAllData() {
  var savedSettings = Storage.get('settings');
  var savedContacts = Storage.get('contacts');
  var savedMsgs = Storage.get('messagesByContact');
  var savedReplyPool = Storage.get('replyPool');

  settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {});

  // 迁移：老版本「正在输入…」不带主语，单聊现在仿微信显示在标题栏，补上「对方」
  if (settings.typingText === '正在输入…') settings.typingText = '对方正在输入…';
  // 迁移：气泡 CSS 改成「预设 / 自定义二选一」之前的老存档里没有 bubbleMode，
  // 但很可能已经存了手写 CSS。那份 CSS 就是当时的意图，不能因为新字段默认值是
  // 'preset' 就被悄悄忽略——而且自定义模式下才渲染输入框，忽略之后用户在界面
  // 上根本看不到自己写的东西，只会觉得「运用不了」。所以有 CSS 就判为自定义模式。
  if (!savedSettings || typeof savedSettings.bubbleMode === 'undefined') {
    if (settings.bubbleCss) settings.bubbleMode = 'custom';
  }

  // 主页数据
  homeProfile = Object.assign({}, DEFAULT_HOME, Storage.get('homeProfile') || {});
  // 用户头像和梦角同源：现在只认上传的图片。老存档里的默认 emoji 在这里清掉，
  // 渲染时 myAvatar() 自然落到灰色人形占位图。只改内存，随下次 saveData() 落盘。
  if (homeProfile.avatar && typeof isImageSrc === 'function' && !isImageSrc(homeProfile.avatar)) {
    homeProfile.avatar = '';
  }
  anniversaries = Array.isArray(Storage.get('anniversaries')) ? Storage.get('anniversaries') : [];
  musicTracks = Array.isArray(Storage.get('musicTracks')) && Storage.get('musicTracks').length
    ? Storage.get('musicTracks')
    : DEFAULT_TRACKS.map(function (t) { return Object.assign({}, t); });
  var savedPhotos = Storage.get('photoWall');
  photoWall = Array.isArray(savedPhotos) && savedPhotos.length === 6
    ? savedPhotos
    : [null, null, null, null, null, null];
  homeBoxBg = Storage.get('homeBoxBg') || null;
  weatherNow = Storage.get('weatherNow');

  // 朋友圈：动态流 + 自定义背景
  var savedMoments = Storage.get('momentsData');
  momentsData = (savedMoments && typeof savedMoments === 'object') ? savedMoments : {};
  if (!Array.isArray(momentsData.posts)) momentsData.posts = [];
  if (typeof momentsData.partnerNext === 'undefined') momentsData.partnerNext = null;
  momentsData.posts.forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    if (!Array.isArray(p.comments)) p.comments = [];
    if (!Array.isArray(p.images)) p.images = [];
    if (p.userLiked === undefined) p.userLiked = false;
    if (p.partnerLiked === undefined) p.partnerLiked = false;
  });
  momentsCover = Storage.get('momentsCover') || null;
  var savedCovers = Storage.get('momentsCovers');
  momentsCovers = (savedCovers && typeof savedCovers === 'object') ? savedCovers : {};

  // 头像 / 朋友圈背景图库（每个梦角独立）+ 自主更换的下次时间
  var savedAvas = Storage.get('contactAvatars');
  contactAvatars = (savedAvas && typeof savedAvas === 'object') ? savedAvas : {};
  var savedCGalleries = Storage.get('contactCovers');
  contactCovers = (savedCGalleries && typeof savedCGalleries === 'object') ? savedCGalleries : {};
  var savedBub = Storage.get('contactBubbles');
  contactBubbles = (savedBub && typeof savedBub === 'object') ? savedBub : {};
  var savedSwap = Storage.get('autoSwapNext');
  autoSwapNext = (savedSwap && typeof savedSwap === 'object') ? savedSwap : {};
  var savedActs = Storage.get('partnerActivities');
  partnerActivities = (savedActs && typeof savedActs === 'object') ? savedActs : {};

  contacts = Array.isArray(savedContacts) ? savedContacts : [];

  messagesByContact = (savedMsgs && typeof savedMsgs === 'object') ? savedMsgs : {};

  // 基础字卡库（全员可用）：基础 + 自定义（自定义单独存，便于增删）
  var customReplies = Storage.get('customReplies');
  replyPool = BUILTIN_REPLIES.concat(Array.isArray(customReplies) ? customReplies : []);

  // 专属字卡库分区 { contactId: [...] }——每个梦角建号时同步生成
  var savedPools = Storage.get('contactReplyPools');
  contactReplyPools = (savedPools && typeof savedPools === 'object') ? savedPools : {};

  // 字卡库分组 / 屏蔽（与 chat 一致：分组、屏蔽均为独立结构，条目本身仍是字符串）
  replyGroups = Array.isArray(Storage.get('replyGroups')) ? Storage.get('replyGroups') : [];
  var savedPoolGroups = Storage.get('poolGroups');
  poolGroups = (savedPoolGroups && typeof savedPoolGroups === 'object') ? savedPoolGroups : {};
  disabledReplies = Array.isArray(Storage.get('disabledReplies')) ? Storage.get('disabledReplies') : [];
  var savedDisabledPool = Storage.get('disabledPoolReplies');
  disabledPoolReplies = (savedDisabledPool && typeof savedDisabledPool === 'object') ? savedDisabledPool : {};

  // 表情包：基础（全员）+ 专属（只对对应梦角）
  var savedStk = Storage.get('stickerLibrary');
  stickerLibrary = Array.isArray(savedStk) ? savedStk : [];
  var savedCStk = Storage.get('contactStickers');
  contactStickers = (savedCStk && typeof savedCStk === 'object') ? savedCStk : {};

  // 语音条（只做专属；音频本体在 IndexedDB 的 AudioStore，这里只存元数据）
  var savedVoice = Storage.get('voiceLibrary');
  voiceLibrary = (savedVoice && typeof savedVoice === 'object') ? savedVoice : {};

  // 拍一拍：TA的 / 我的，基础 + 专属两级
  var savedPP = Storage.get('partnerPokes');
  partnerPokes = Array.isArray(savedPP) ? savedPP : [];
  var savedMP = Storage.get('myPokes');
  myPokes = Array.isArray(savedMP) ? savedMP : [];
  var savedCP = Storage.get('contactPokes');
  contactPokes = (savedCP && typeof savedCP === 'object') ? savedCP : {};

  // 状态字卡：基础 + 专属；当前状态按梦角独立保存
  var savedStatusLib = Storage.get('statusLibrary');
  statusLibrary = Array.isArray(savedStatusLib) ? savedStatusLib : [];
  var savedStatusPools = Storage.get('contactStatusPools');
  contactStatusPools = (savedStatusPools && typeof savedStatusPools === 'object') ? savedStatusPools : {};
  var savedStatus = Storage.get('contactStatus');
  contactStatus = (savedStatus && typeof savedStatus === 'object') ? savedStatus : {};

  // 信箱：每位梦角一份（见 letters.js）
  var savedEnv = Storage.get('envelopeData');
  envelopeData = (savedEnv && typeof savedEnv === 'object') ? savedEnv : {};
  contacts.forEach(function (c) {
    if (isGroupContact(c)) return;
    if (!envelopeData[c.id] || typeof envelopeData[c.id] !== 'object') {
      envelopeData[c.id] = { outbox: [], inbox: [] };
    }
    if (!Array.isArray(envelopeData[c.id].outbox)) envelopeData[c.id].outbox = [];
    if (!Array.isArray(envelopeData[c.id].inbox)) envelopeData[c.id].inbox = [];
  });

  // 通话记录（梦角资料页 → 历史通话）
  var savedCalls = Storage.get('callLogs');
  callLogs = (savedCalls && typeof savedCalls === 'object') ? savedCalls : {};

  // 初始化各联系人消息数组 + 专属字卡库分区
  contacts.forEach(function (c) {
    if (!Array.isArray(messagesByContact[c.id])) messagesByContact[c.id] = [];
    if (!Array.isArray(contactReplyPools[c.id])) contactReplyPools[c.id] = [];
    if (!Array.isArray(poolGroups[c.id])) poolGroups[c.id] = [];
    if (!Array.isArray(disabledPoolReplies[c.id])) disabledPoolReplies[c.id] = [];
    if (!Array.isArray(callLogs[c.id])) callLogs[c.id] = [];
    if (!Array.isArray(contactAvatars[c.id])) contactAvatars[c.id] = [];
    if (!Array.isArray(contactCovers[c.id])) contactCovers[c.id] = [];
    if (!Array.isArray(contactStickers[c.id])) contactStickers[c.id] = [];
    if (!Array.isArray(voiceLibrary[c.id])) voiceLibrary[c.id] = [];
    if (!contactPokes[c.id]) contactPokes[c.id] = { partner: [], mine: [] };
    if (!Array.isArray(contactPokes[c.id].partner)) contactPokes[c.id].partner = [];
    if (!Array.isArray(contactPokes[c.id].mine)) contactPokes[c.id].mine = [];
    if (!autoSwapNext[c.id]) autoSwapNext[c.id] = { avatar: 0, cover: 0 };
    if (!partnerActivities[c.id]) partnerActivities[c.id] = {};
    // 头像只认图库：老存档里的 emoji 头像在这里被清掉，图库为空就落到灰色占位图。
    // 这里只改内存，不存盘，等下次正常 saveData() 一起落盘。
    if (typeof syncAvatarToLibrary === 'function') syncAvatarToLibrary(c, false);
  });
}

var _saveTimer = null;
function saveData() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () {
    Storage.set('settings', settings);
    Storage.set('contacts', contacts);
    // 每个联系人最多保留最近 300 条
    var trimmed = {};
    Object.keys(messagesByContact).forEach(function (cid) {
      trimmed[cid] = messagesByContact[cid].slice(-300);
    });
    Storage.set('messagesByContact', trimmed);
    Storage.set('callLogs', callLogs);
    if (typeof saveEnvelopeData === 'function') saveEnvelopeData();
    var custom = replyPool.filter(function (r) { return BUILTIN_REPLIES.indexOf(r) === -1; });
    Storage.set('customReplies', custom);
    Storage.set('contactReplyPools', contactReplyPools);
    Storage.set('replyGroups', replyGroups);
    Storage.set('poolGroups', poolGroups);
    Storage.set('disabledReplies', disabledReplies);
    Storage.set('disabledPoolReplies', disabledPoolReplies);
    Storage.set('stickerLibrary', stickerLibrary);
    Storage.set('contactStickers', contactStickers);
    Storage.set('voiceLibrary', voiceLibrary);
    Storage.set('partnerPokes', partnerPokes);
    Storage.set('myPokes', myPokes);
    Storage.set('contactPokes', contactPokes);
    Storage.set('statusLibrary', statusLibrary);
    Storage.set('contactStatusPools', contactStatusPools);
    Storage.set('contactStatus', contactStatus);
    // 主页数据
    Storage.set('homeProfile', homeProfile);
    Storage.set('anniversaries', anniversaries);
    Storage.set('musicTracks', musicTracks);
    Storage.set('photoWall', photoWall);
    Storage.set('homeBoxBg', homeBoxBg);
    Storage.set('weatherNow', weatherNow);
    // 朋友圈
    Storage.set('momentsData', momentsData);
    Storage.set('momentsCover', momentsCover);
    Storage.set('momentsCovers', momentsCovers);
    Storage.set('contactAvatars', contactAvatars);
    Storage.set('contactCovers', contactCovers);
    Storage.set('contactBubbles', contactBubbles);
    Storage.set('autoSwapNext', autoSwapNext);
    Storage.set('partnerActivities', partnerActivities);
  }, 300);
}
