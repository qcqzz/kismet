/* ============ 字卡传讯 · 配置与常量 ============ */

var APP_PREFIX = 'KISMET_ZK2_';
var MAX_IMAGE_SIZE = 5 * 1024 * 1024;
var VERSION = 2;

// 默认设置（对齐 chat：延迟回复 / 已读不回 / 撤回 / 拍一拍 / 状态）
var DEFAULT_SETTINGS = {
  replyEnabled: true,
  replyDelayMin: 1500,
  replyDelayMax: 6500,
  typingIndicatorEnabled: true,
  readNoReplyChance: 0.12,     // 已读不回概率
  readReceiptEnabled: true,    // 已读回执
  partnerRecallEnabled: true,  // 对方撤回（3% 概率）
  pokeEnabled: true,           // 拍一拍（3% 概率）
  statusChangeEnabled: true,   // 状态自动变化
  bubbleTheme: 'wechat'        // wechat=微信绿 / mono=纯黑白
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

// 内置字卡语料（chat 规则：自定义回复池）
var BUILTIN_REPLIES = [
  '今天的风也很温柔呢',
  '记得多喝热水，别熬夜',
  '我刚刚也在想这件事',
  '你这么说，我竟然无法反驳',
  '嗯嗯，然后呢？',
  '这句话我想抄在小本本上',
  '看到你发的消息，心情都变好了',
  '慢慢来，一切都来得及',
  '我在这里，一直都在',
  '给你一个大大的拥抱',
  '哈哈，你怎么这么可爱',
  '这句话我要收藏起来',
  '窗外的月亮很圆，替你看过了',
  '累了就休息，我又不会跑',
  '你今天也要开开心心的呀',
  '收到了，贴身收藏',
  '此卡已阅，批注：想你',
  '字字句句，都当真'
];

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
