/* ============ 字卡传讯 · 本地存储层 ============ */

var Storage = {
  get: function (key) {
    try {
      var raw = localStorage.getItem(APP_PREFIX + key);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) { return null; }
  },
  set: function (key, value) {
    try { localStorage.setItem(APP_PREFIX + key, JSON.stringify(value)); }
    catch (e) { console.warn('存储失败:', key, e); }
  },
  remove: function (key) {
    try { localStorage.removeItem(APP_PREFIX + key); } catch (e) {}
  }
};

function loadAllData() {
  var savedSettings = Storage.get('settings');
  var savedContacts = Storage.get('contacts');
  var savedMsgs = Storage.get('messagesByContact');
  var savedReplyPool = Storage.get('replyPool');

  settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {});

  // 迁移：气泡 CSS 改成「预设 / 自定义二选一」之前的老存档里没有 bubbleMode，
  // 但很可能已经存了手写 CSS。那份 CSS 就是当时的意图，不能因为新字段默认值是
  // 'preset' 就被悄悄忽略——而且自定义模式下才渲染输入框，忽略之后用户在界面
  // 上根本看不到自己写的东西，只会觉得「运用不了」。所以有 CSS 就判为自定义模式。
  if (!savedSettings || typeof savedSettings.bubbleMode === 'undefined') {
    if (settings.bubbleCss) settings.bubbleMode = 'custom';
  }

  // 主页数据
  homeProfile = Object.assign({}, DEFAULT_HOME, Storage.get('homeProfile') || {});
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

  contacts = Array.isArray(savedContacts) && savedContacts.length
    ? savedContacts
    : BUILTIN_CONTACTS.map(function (c) { return Object.assign({ unread: 0, lastTime: 0 }, c); });

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
  });

  partnerStatus = PARTNER_STATUSES[Math.floor(Math.random() * PARTNER_STATUSES.length)];
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
