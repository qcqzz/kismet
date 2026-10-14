/* ============ 字卡传讯 · 配置与常量 ============ */

var APP_PREFIX = 'KISMET_ZK2_';
var MAX_IMAGE_SIZE = 5 * 1024 * 1024;
var VERSION = 2;

// 默认设置（对齐 chat：功能 + 节奏 + 音效，去除真实语音相关）
var DEFAULT_SETTINGS = {
  // —— 回复设置 · 消息交互（chat 的"功能"） ——
  replyEnabled: true,
  quoteReplyEnabled: true,     // 引用回复
  readReceiptEnabled: true,    // 已读回执
  readReceiptStyle: 'icon',    // 已读样式：icon=图形 ✓✓ / text=文字 已读
  readNoReplyChance: 0.12,     // 已读不回概率
  typingIndicatorEnabled: true,// 正在输入
  partnerRecallEnabled: true,  // 梦角撤回消息（3% 概率）
  pokeEnabled: true,           // 拍一拍（3% 概率）
  statusChangeEnabled: true,   // 状态自动变化
  redPacketEnabled: false,     // 梦角主动发红包
  myPokeText: '拍了拍',        // 我拍一拍的默认动作
  timestampFormat: 'HH:mm',    // 时间戳：HH:mm / HH:mm:ss / h:mm A / h:mm:ss A / off
  // —— 回复设置 · 消息节奏（chat 的"节奏"） ——
  replyDelayMin: 1500,
  replyDelayMax: 6500,
  autoSendEnabled: false,      // 梦角主动发消息给我
  autoSendInterval: 5,         // 主动发送间隔（分钟，1~180）
  emojiMixEnabled: true,       // 表情混入消息（与文字同条发送）
  combineCardsEnabled: false,  // 回复拼接字卡（单条消息拼接多张）
  combineCardsMax: 3,          // 最多拼接几句话
  bgNotifyEnabled: false,      // 后台消息推送（Notification）
  // —— 音效设置（chat 的"音效"） ——
  soundEnabled: true,
  soundVolume: 0.15,
  mySendSoundPreset: 'tone_low',
  partnerMessageSoundPreset: 'tone_low',
  myPokeSoundPreset: 'tone_low',
  partnerPokeSoundPreset: 'tone_low',
  mySendCustomSoundUrl: '',
  partnerMessageCustomSoundUrl: '',
  myPokeCustomSoundUrl: '',
  partnerPokeCustomSoundUrl: '',
  // —— 主页 ——
  bubbleTheme: 'wechat',       // wechat=微信绿 / mono=纯黑白
  weatherCity: '',             // 天气城市（Open-Meteo 自动查）
  homeContactId: null          // 首页梦角展示（梦角 id）
};

// 音效预设（同 chat：无 / kakaoTalk / 内置合成 6 种）
var SFX_PRESETS = [
  { v: 'mute', label: '无音效' },
  { v: 'kakaotalk', label: 'kakaotalk' },
  { v: 'tone_default', label: '内置：默认' },
  { v: 'tone_soft', label: '内置：柔和' },
  { v: 'tone_low', label: '内置：低沉' },
  { v: 'tone_warm', label: '内置：厚暖' },
  { v: 'tone_dark', label: '内置：暗夜' },
  { v: 'tone_haze', label: '内置：雾感' }
];

// 时间戳格式选项（chat 时间戳同款）
var TIMESTAMP_FORMATS = [
  { v: 'HH:mm', label: '14:05' },
  { v: 'HH:mm:ss', label: '14:05:30' },
  { v: 'h:mm A', label: '2:05 PM' },
  { v: 'h:mm:ss A', label: '2:05:30 PM' },
  { v: 'off', label: '关闭时间戳' }
];

// 主页个人信息卡默认值
var DEFAULT_HOME = {
  name: '我',
  avatar: '🐧',
  location: '',
  expression: '(*^^*)',
  signature: ''               // 个性签名（用户自己编辑）
};

// 默认音乐条（两条，仿参照图；音频文件存在 IndexedDB）
var DEFAULT_TRACKS = [
  { id: 'trk_1', name: '歌曲一', lyric: '点右侧 ⋯ 可改名、换歌词、上传音频', hasAudio: false },
  { id: 'trk_2', name: '歌曲二', lyric: '上传音频后点 ▶ 真实播放', hasAudio: false }
];

// WMO 天气代码 → 中文（Open-Meteo current.weather_code）
var WEATHER_CODES = {
  0: '晴', 1: '大部晴朗', 2: '多云', 3: '阴',
  45: '有雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '密毛毛雨', 56: '冻毛毛雨', 57: '强毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '小阵雨', 81: '阵雨', 82: '强阵雨', 85: '小阵雪', 86: '大阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷阵雨伴冰雹'
};

// 天气代码 → 表情图标
var WEATHER_ICONS = {
  sunny: '☀️', cloudy: '⛅', overcast: '☁️', fog: '🌫️',
  rain: '🌧️', snow: '🌨️', storm: '⛈️'
};

// 对方状态语（循环随机换，仿 chat 的 PARTNER_STATUSES）
var PARTNER_STATUSES = [
  '在线', '忙碌中', '潜水中', '今日宜想你',
  '摸鱼中', '充电中', '闪现中', '暗中观察'
];

// 拍一拍动作（自定义池，仿 chat POKE_ACTIONS）
var POKE_ACTIONS = [
  '拍了拍你', '揉了揉你的头', '戳了戳你的脸',
  '给了你一个拥抱', '拽了拽你的衣角', '敲了敲你的脑袋'
];

// 表情（点按直接发送）
var EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😜','🤔','😐',
  '😴','😭','😤','😱','🥳','😇','🥰','😒','🤌','👍',
  '👎','👏','🙏','💪','🤝','🌹','🌻','🍀','🌙','☀️',
  '☁️','🌧️','☃️','🔥','✨','💫','🎂','🎁','❤️','💔',
  '💯','🎉','🎊','📩','💌','🧋','☕','🍜','🍰','🍓'];

// 基础字卡库（全员可用）——预定内容待后续指令，暂为空（勿自行预置）
var BUILTIN_REPLIES = [];

// 内置关键词规则（命中 → 从对应回复抽一条；未命中随机池）
var BUILTIN_KEYWORD_RULES = [
  { id: 'kw-greet', keywords: ['早安', '早上好', '早呀', '起床'],
    replies: ['早安呀，今天也要元气满满', '早，梦里有没有我？', '早安，新的一天开始想你了'] },
  { id: 'kw-night', keywords: ['晚安', '睡了', '困了', '去睡', '好困'],
    replies: ['晚安，做个好梦', '快去睡吧，我帮你守着夜', '晚安，明天见'] },
  { id: 'kw-miss', keywords: ['想你', '好想', '想念', '你在吗', '在吗'],
    replies: ['我也在想你，心有灵犀', '在的在的，一直在', '想我就对了，因为我也在想你'] },
  { id: 'kw-sad', keywords: ['难过', '伤心', '不开心', '委屈', '哭了', '唉'],
    replies: ['抱抱你，我在呢', '把难过分我一半吧', '不开心就靠着我，我哪也不去'] },
  { id: 'kw-food', keywords: ['饿', '吃饭', '吃什么', '外卖', '好吃'],
    replies: ['要好好吃饭呀，不许饿着', '我也想和你一起吃', '先去吃点东西，回来再聊'] },
  { id: 'kw-work', keywords: ['加班', '好累', '上班', '工作', '压力'],
    replies: ['辛苦了，记得歇一歇', '再忙也要记得我想你', '下班后给自己买点好吃的犒劳一下'] }
];

// 默认联系人（对方人格）
var BUILTIN_CONTACTS = [
  { id: 'c_xy', name: '小语', avatar: '🌷', signature: '把日子写成诗' },
  { id: 'c_am', name: '阿墨', avatar: '🌙', signature: '晚安，好梦' }
];

// 分享图配色（黑白系）
var CARD_THEMES = {
  ink: { name: '墨白', bg: '#ffffff', ink: '#111111', sub: '#777777', border: '#d9d9d9', accent: '#111111', font: '"KaiTi", "STKaiti", serif' }
};
