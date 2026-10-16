/* ============ 字卡传讯 · 全局状态 ============ */

var contacts = [];        // 联系人列表 [{id, name, avatar, signature, unread, lastTime}]
var messagesByContact = {};   // { contactId: [msg...] }
var activeContactId = null;   // 当前聊天对象

var settings = {};        // 合并自 DEFAULT_SETTINGS
var replyPool = [];       // 基础字卡库（全员可用，基础+自定义）
var contactReplyPools = {}; // 专属字卡库分区 { contactId: [str...] }（单人可用，新建梦角时生成）
var replyGroups = [];       // 基础字卡库分组 [{id,name,color,items:[str...]}]（条目靠字符串归属，最多属一个组）
var poolGroups = {};        // 专属库分组 { contactId: [{id,name,color,items:[]}] }
var disabledReplies = [];   // 基础库被屏蔽文本 [str...]（屏蔽后 poolFor 不再抽取）
var disabledPoolReplies = {}; // 专属库被屏蔽 { contactId: [str...] }

// ---- 表情包（两级合并：基础全员通用 + 专属只给对应梦角）----
// 表情包本身就是普通图片消息（image 字段），不需要新的消息类型
var stickerLibrary = [];    // 基础表情包 [{id, url}]
var contactStickers = {};   // 专属表情包 { contactId: [{id, url}] }

// ---- 语音条（只做专属；音频文件本体存 IndexedDB，这里只存元数据 + audioId）----
var voiceLibrary = {};      // 专属语音条 { contactId: [{id, text, duration, audioId}] }

// ---- 拍一拍（分 TA的 / 我的；基础 + 专属两级合并，专属只对对应梦角生效）----
// partner = TA的拍一拍（梦角拍用户）/ mine = 我的拍一拍（用户拍梦角）
var partnerPokes = [];      // 基础「TA的拍一拍」[str...]
var myPokes = [];           // 基础「我的拍一拍」[str...]
var contactPokes = {};      // 专属拍一拍 { contactId: { partner: [str], mine: [str] } }
var partnerStatus = '在线';
var callLogs = {};             // 通话记录 { contactId: [{id, kind, ts, duration, missed}] }（历史通话）

var isReplying = false;
var replyQueue = [];

var currentReplyTo = null;    // 引用中的消息
var isBatchMode = false;
var batchMessages = [];

// 主页状态
var homeProfile = null;       // {name, avatar, location, expression, signature}
var anniversaries = [];       // [{id, name, date, type}] type: anniversary=纪念日 / countdown=倒数日
var musicTracks = [];         // [{id, name, lyric, hasAudio}]（音乐功能待定，数据保留）
var photoWall = [];           // 6 个照片位（2-5 为底部拍立得，0-1 保留待用），null 或 dataURL
var homeBoxBg = null;         // 首页大方框背景图（dataURL）
var weatherNow = null;        // {city, temp, code, desc, icon, updatedAt}
var _dreamSignCache = null;   // 梦角展示栏个签（本次打开抽取一次）
var _annivRotateTimer = null; // 重要日 10s 轮换定时器

// 朋友圈状态
var momentsData = { posts: [], partnerNext: null }; // 动态流数据（对齐 chat 的 momentsData）
var momentsCover = null;      // 朋友圈自定义背景图（dataURL，我自己的）
var momentsCovers = {};       // 各梦角的朋友圈封面 { contactId: dataURL }（在梦角朋友圈下查看/设置）
var contactAvatars = {};      // 头像图库（每个梦角独立）{ contactId: [dataURL...] }
var contactCovers = {};       // 朋友圈背景图库（每个梦角独立）{ contactId: [dataURL...] }
// 聊天气泡样式（每个梦角独立）{ contactId: { mode, preset, css, userColor } }
// 该梦角没有条目时回落到全局 settings.bubble* ；一旦在这个页面上动过就写成独立条目
var contactBubbles = {};
var autoSwapNext = {};        // 梦角下次自主更换的时间 { contactId: { avatar: ts, cover: ts } }
// 每位梦角各自独立的概率活动排期 { contactId: { 活动key: 下次触发时间戳 } }
// key 统一由 registerPartnerActivity 登记，新增活动只需注册，自动按梦角隔离
var partnerActivities = {};
var _settingsReturnView = null; // 从梦角资料页跳进设置时的返回目标（'contactinfo'），走完返回要回原处

var DOMElements = {};
