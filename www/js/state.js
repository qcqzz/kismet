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

var DOMElements = {};
