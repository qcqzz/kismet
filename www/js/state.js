/* ============ 字卡传讯 · 全局状态 ============ */

var contacts = [];        // 联系人列表 [{id, name, avatar, signature, unread, lastTime}]
var messagesByContact = {};   // { contactId: [msg...] }
var activeContactId = null;   // 当前聊天对象

var settings = {};        // 合并自 DEFAULT_SETTINGS
var replyPool = [];       // 基础字卡库（全员可用，基础+自定义）
var contactReplyPools = {}; // 专属字卡库分区 { contactId: [str...] }（单人可用，新建梦角时生成）
var keywordRules = [];    // 关键词规则
var customPokes = [];     // 拍一拍动作池
var partnerStatus = '在线';

var isReplying = false;
var replyQueue = [];

var currentReplyTo = null;    // 引用中的消息
var isBatchMode = false;
var batchMessages = [];

// 主页状态
var homeProfile = null;       // {name, avatar, location, expression, signature}
var anniversaries = [];       // [{id, name, date, type}] type: anniversary=纪念日 / countdown=倒数日
var musicTracks = [];         // [{id, name, lyric, hasAudio}]（音乐功能待定，数据保留）
var photoWall = [];           // 6 个照片位（0-1 右上交错方图，2-5 底部拍立得），null 或 dataURL
var homeBoxBg = null;         // 首页大方框背景图（dataURL）
var weatherNow = null;        // {city, temp, code, desc, icon, updatedAt}
var _dreamSignCache = null;   // 梦角展示栏个签（本次打开抽取一次）
var _annivRotateTimer = null; // 重要日 10s 轮换定时器

var DOMElements = {};
