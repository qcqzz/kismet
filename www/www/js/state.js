/* ============ 字卡传讯 · 全局状态 ============ */

var contacts = [];        // 联系人列表 [{id, name, avatar, signature, unread, lastTime}]
var messagesByContact = {};   // { contactId: [msg...] }
var activeContactId = null;   // 当前聊天对象

var settings = {};        // 合并自 DEFAULT_SETTINGS
var replyPool = [];       // 语料池（内置+自定义）
var keywordRules = [];    // 关键词规则
var customPokes = [];     // 拍一拍动作池
var partnerStatus = '在线';

var isReplying = false;
var replyQueue = [];

var currentReplyTo = null;    // 引用中的消息
var isBatchMode = false;
var batchMessages = [];

// 主页状态
var homeProfile = null;       // {name, avatar, location, expression}
var anniversaries = [];       // [{id, name, date}] 多个纪念日
var musicTracks = [];         // [{id, name, lyric, hasAudio}]
var photoWall = [];           // 6 个拍立得位（index 0-1 右上，2-5 底部），null 或 dataURL
var weatherNow = null;        // {city, temp, code, desc, icon, updatedAt}
var dailyCardIndex = 0;       // 每日字卡当前索引

var DOMElements = {};
