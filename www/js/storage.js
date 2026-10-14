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
  var savedRules = Storage.get('keywordRules');
  var savedPokes = Storage.get('customPokes');

  settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {});

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
  dailyCardIndex = Storage.get('dailyCardIndex') || 0;

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

  keywordRules = Array.isArray(savedRules) ? savedRules : BUILTIN_KEYWORD_RULES.slice();
  customPokes = Array.isArray(savedPokes) ? savedPokes : POKE_ACTIONS.slice();

  // 初始化各联系人消息数组 + 专属字卡库分区
  contacts.forEach(function (c) {
    if (!Array.isArray(messagesByContact[c.id])) messagesByContact[c.id] = [];
    if (!Array.isArray(contactReplyPools[c.id])) contactReplyPools[c.id] = [];
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
    Storage.set('keywordRules', keywordRules);
    Storage.set('customPokes', customPokes);
    var custom = replyPool.filter(function (r) { return BUILTIN_REPLIES.indexOf(r) === -1; });
    Storage.set('customReplies', custom);
    Storage.set('contactReplyPools', contactReplyPools);
    // 主页数据
    Storage.set('homeProfile', homeProfile);
    Storage.set('anniversaries', anniversaries);
    Storage.set('musicTracks', musicTracks);
    Storage.set('photoWall', photoWall);
    Storage.set('homeBoxBg', homeBoxBg);
    Storage.set('weatherNow', weatherNow);
    Storage.set('dailyCardIndex', dailyCardIndex);
  }, 300);
}
