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
  readNoReplyChance: 0.2,     // 已读不回概率（对齐 chat）
  typingIndicatorEnabled: true,// 正在输入
  partnerRecallEnabled: true,  // 梦角撤回消息（3% 概率）
  pokeEnabled: true,           // 拍一拍（3% 概率）
  statusChangeEnabled: true,   // 状态自动变化（chat 无此项，按要求保留）
  redPacketEnabled: true,     // 梦角主动发红包（定时 8% 概率 + 每日上限 10，对齐 chat）
  // 注：原先的 myPokeText（我拍一拍的默认动作）已移除。
  // 拍一拍动作改从字卡库的「我的拍一拍」池抽取，来源见 bubblecss 同级的 cardlib.js。
  timestampFormat: 'HH:mm',    // 时间戳：HH:mm / HH:mm:ss / h:mm A / h:mm:ss A / off
  // —— 回复设置 · 消息节奏（chat 的"节奏"） ——
  replyDelayMin: 3000,
  replyDelayMax: 7000,
  autoSendEnabled: false,      // 梦角主动发消息给我
  autoSendInterval: 5,         // 主动发送间隔（分钟，1~180）
  emojiMixEnabled: true,       // 表情混入消息（与文字同条发送，20% 概率，对齐 chat）
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
  homeContactId: null,         // 首页梦角展示（梦角 id）
  // —— 外观 ——
  theme: 'light',              // light=浅色 / dark=深色（html[data-theme]）
  chatBg: '',                  // 聊天流背景（dataURL 或 CSS 渐变）
  headerBg: '',                // 聊天页顶部栏背景
  redpacketCover: '',          // 红包封面（颜色 / 渐变 / dataURL）
  chatBgImage: '',             // 聊天背景图（dataURL，叠加遮罩保证气泡可读）
  bubblePreset: 'classic',     // 聊天气泡画廊预设 id（见 bubblecss.js）
  bubbleMode: 'preset',       // preset=套用预设（预设即最终样式） / custom=自定义 CSS（完全不套用预设）
  bubbleCss: '',              // 手写的气泡 CSS（仅 bubbleMode==='custom' 时生效）
  bubbleUserColor: '',        // 我的气泡颜色（留空=跟随主题，深色下为深灰）
  callBgImage: '',             // 通话背景图（dataURL，与聊天背景对称）
  fontScale: 1,                // 字体缩放（0.85~1.25）
  showMsgAvatar: true,         // 每条消息都显示头像（applyAppearance 同步 showEveryAvatar）
  avatarAlign: 'left',         // 头像对齐 left / right
  globalCss: '',               // 全局主题 CSS（<style id="kc-global-css">）
  // —— 正在输入（微信式） ——
  typingText: '正在输入…',     // 正在输入提示文案
  typingShowAvatar: true,      // 正在输入时显示对方头像
  // —— 梦角自主更换（头像 / 朋友圈背景） ——
  partnerAutoSwapEnabled: true,// 梦角隔一段时间自己换一张图
  partnerAutoSwapMinDays: 3,   // 间隔下限（天）
  partnerAutoSwapMaxDays: 30,  // 间隔上限（天）
  partnerAutoSwapChance: 30,   // 到点后真正更换的概率（0~100）
  partnerRecAcceptMin: 20,     // 收到推荐时同意的概率下限（%）
  partnerRecAcceptMax: 80      // 收到推荐时同意的概率上限（%）
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

// 气泡样式预设已迁到「聊天信息 → 修改聊天气泡」的画廊（见 bubblecss.js）

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

// 拍一拍动作不再有内置默认池：TA的拍一拍 / 我的拍一拍都由用户自己在
// 字卡库里添加（基础库 + 各梦角专属库，两级合并）。

// 表情（点按直接发送）
var EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😜','🤔','😐',
  '😴','😭','😤','😱','🥳','😇','🥰','😒','🤌','👍',
  '👎','👏','🙏','💪','🤝','🌹','🌻','🍀','🌙','☀️',
  '☁️','🌧️','☃️','🔥','✨','💫','🎂','🎁','❤️','💔',
  '💯','🎉','🎊','📩','💌','🧋','☕','🍜','🍰','🍓'];

// 基础字卡库（全员可用）——预定内容待后续指令，暂为空（勿自行预置）
var BUILTIN_REPLIES = [];

// 默认联系人（对方人格）
var BUILTIN_CONTACTS = [
  { id: 'c_xy', name: '小语', avatar: '🌷', signature: '把日子写成诗' },
  { id: 'c_am', name: '阿墨', avatar: '🌙', signature: '晚安，好梦' }
];

// 分享图配色（黑白系）
var CARD_THEMES = {
  ink: { name: '墨白', bg: '#ffffff', ink: '#111111', sub: '#777777', border: '#d9d9d9', accent: '#111111', font: '"KaiTi", "STKaiti", serif' }
};
