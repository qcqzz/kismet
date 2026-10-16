/* ============ 字卡传讯 · 朋友圈（对齐 chat 的情侣空间动态模块） ============ */
/* 规则完全对齐 chat_moments.js 的 _mPostText / _mPostContent / _mCmtContent /
   generatePartnerMoment / onUserPostCreated / onUserCommented / checkMomentsStatus / _checkAction */

// 自动发动态冷却 24~72 小时（对齐 chat _M_CD_MIN / _M_CD_MAX）
var _M_CD_MIN = 24 * 60 * 60 * 1000;
var _M_CD_MAX = 72 * 60 * 60 * 1000;

var _mPressTimer = null;      // 长按计时器
var _mLongPressed = false;    // 本次按压是否已触发长按
var _mComposeImages = [];     // 撰写弹窗中已选图片（dataURL）
var _momentsTimer = null;     // 每分钟检查定时器
var momentsFilterId = null;    // 只看某位梦角的动态（梦角资料页进入时设置）；null=全部
var momentsOnlyPartner = false;// true=只看该梦角发的（不含我发的）

// ---------- 小工具 ----------
function _mUid(prefix) {
  return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}
function _mToday() { return new Date().toISOString().slice(0, 10); }
// 延迟：5~20 分钟随机（对齐 chat _csSettings.dlyMin=5 / dlyMax=20 的默认值）
function _mDly() { return 5 * 60000 + Math.random() * (20 * 60000 - 5 * 60000); }

// 时间显示（对齐 chat 的 _fmtDate）：今天 →「今天」，今年 →「M月D日」，否则原样日期
function _fmtDate(d) {
  if (!d) return '';
  if (d === _mToday()) return '今天';
  var dt = new Date(d), now = new Date();
  return dt.getFullYear() === now.getFullYear()
    ? (dt.getMonth() + 1) + '月' + dt.getDate() + '日'
    : d;
}

function _mMeName() { return (homeProfile && homeProfile.name) || '我'; }
function _mContact(id) {
  return contacts.find(function (c) { return c.id === id; }) || null;
}
function _mCName(id) {
  var c = _mContact(id);
  return (c && c.name) ? c.name : '梦角';
}
function _mCAvatar(id) {
  var c = _mContact(id);
  return (c && c.avatar) ? c.avatar : '🌷';
}
// 当前可用的梦角：优先聊天中的对象，否则退回首页展示的梦角
function _mContactId() {
  if (activeContactId) return activeContactId;
  var hc = (typeof getHomeContact === 'function') ? getHomeContact() : null;
  return hc ? hc.id : null;
}

// 文本池 = 该梦角可用字卡（等价 chat 的 _customReplies）
function _mTextPool(contactId) {
  return (typeof poolFor === 'function') ? poolFor(contactId) : [];
}
// 贴纸池 = 我的表情库 src 数组（等价 chat 的 stickerLibrary）
function _mStickerPool() {
  var lib = (typeof myStickerLibrary !== 'undefined') ? myStickerLibrary : (window.myStickerLibrary || []);
  return (Array.isArray(lib) ? lib : []).map(function (s) { return s && s.src; }).filter(Boolean);
}

// ---------- 梦角内容规则（严格照抄 chat） ----------
// 拼句：随机取 3~5 句拼接，每句尾 20%→「！」、20%→「……」、否则「。」
function _mPostText(contactId) {
  var pool = _mTextPool(contactId);
  if (!pool.length) return null;
  var t = '', n = 3 + Math.floor(Math.random() * 3);
  for (var i = 0; i < n; i++) {
    var s = randomOf(pool);
    t += s + (Math.random() < 0.2 ? '！' : Math.random() < 0.2 ? '……' : '。');
  }
  return t;
}
// 随机 1~3 张贴纸（chat 的 randImgs）
function _mPickStickers() {
  var pool = _mStickerPool();
  if (!pool.length) return [];
  var n = 1 + Math.floor(Math.random() * 3);
  return pool.slice().sort(function () { return Math.random() - 0.5; }).slice(0, Math.min(n, pool.length));
}
// 梦角发动态内容：纯文字 40% / 纯贴纸 20% / 文字+贴纸 40%；两者皆空 → null
function _mPostContent(contactId) {
  var hasText = _mTextPool(contactId).length > 0;
  var hasSticker = _mStickerPool().length > 0;
  if (!hasText && !hasSticker) return null;
  if (!hasSticker) return { text: _mPostText(contactId), images: [] };
  if (!hasText) return { text: '', images: _mPickStickers() };
  var r = Math.random();
  if (r < 0.40) return { text: _mPostText(contactId), images: [] };
  if (r < 0.60) return { text: '', images: _mPickStickers() };
  return { text: _mPostText(contactId), images: _mPickStickers() };
}
// 梦角评论内容：纯文字 60% / 文字+贴纸 20% / 纯贴纸 20%；文字取随机 1 句
function _mCmtContent(contactId) {
  var textPool = _mTextPool(contactId);
  var stickerPool = _mStickerPool();
  var hasText = textPool.length > 0, hasSticker = stickerPool.length > 0;
  if (!hasText && !hasSticker) return null;
  if (!hasSticker) return { text: randomOf(textPool), image: null };
  if (!hasText) return { text: '', image: randomOf(stickerPool) };
  var r = Math.random();
  if (r < 0.60) return { text: randomOf(textPool), image: null };
  if (r < 0.80) return { text: randomOf(textPool), image: randomOf(stickerPool) };
  return { text: '', image: randomOf(stickerPool) };
}

// ---------- 生成 / 触发 ----------
function generatePartnerMoment() {
  var contactId = _mContactId();
  var c = _mPostContent(contactId);
  if (!c) return;
  var now = Date.now();
  var post = {
    id: _mUid('partner'), type: 'partner', contactId: contactId,
    text: c.text, images: c.images, date: _mToday(), timestamp: now,
    userLiked: false, partnerLiked: false, pendingLikeTime: null, pendingLikeSilent: false,
    comments: [], pendingPartnerComment: null
  };
  // 10% 稍后自己评论自己
  if (Math.random() < 0.10) {
    var cc = _mCmtContent(contactId);
    if (cc) post.pendingPartnerComment = { text: cc.text, image: cc.image, time: now + _mDly(), isSelfComment: true };
  }
  // 10% 稍后自己赞自己
  if (Math.random() < 0.10) {
    post.pendingLikeTime = now + _mDly();
    post.pendingLikeSilent = true;
  }
  momentsData.posts.unshift(post);
  saveData();
}

// 用户发新动态：梦角几分钟后来点赞
function onUserPostCreated(postId) {
  var p = momentsData.posts.find(function (x) { return x.id === postId; });
  if (!p || p.type !== 'user') return;
  p.pendingLikeTime = Date.now() + _mDly();
  p.pendingLikeSilent = false;
  saveData();
}

// 用户评论：梦角稍后回复（带 replyTo 用户昵称）
function onUserCommented(postId) {
  var p = momentsData.posts.find(function (x) { return x.id === postId; });
  if (!p) return;
  var c = _mCmtContent(p.contactId);
  if (!c) return;
  p.pendingPartnerComment = {
    text: c.text, image: c.image, time: Date.now() + _mDly(),
    replyTo: { authorName: _mMeName() }
  };
  saveData();
}

// 到点结算：补赞 + 落评论
function checkMomentsStatus() {
  var now = Date.now(), changed = false;
  momentsData.posts.forEach(function (p) {
    if (p.pendingLikeTime && !p.partnerLiked && now >= p.pendingLikeTime) {
      p.partnerLiked = true;
      p.pendingLikeTime = null;
      p.pendingLikeSilent = false;
      changed = true;
    }
    if (p.pendingPartnerComment && now >= p.pendingPartnerComment.time) {
      var ppc = p.pendingPartnerComment;
      p.comments.push({
        id: _mUid('c'), authorType: 'partner',
        text: ppc.text || '', image: ppc.image || null,
        timestamp: ppc.time, isNew: true,
        replyTo: ppc.replyTo || null
      });
      p.pendingPartnerComment = null;
      changed = true;
    }
  });
  if (changed) { saveData(); renderMoments(); }
  _checkAction();
}

// 自动发动态闸门：冷却到期 → 重掷 24~72h → 70% 概率生成一条梦角动态
function _checkAction() {
  var now = Date.now();
  if (momentsData.partnerNext && now < momentsData.partnerNext) return;
  momentsData.partnerNext = now + _M_CD_MIN + Math.random() * (_M_CD_MAX - _M_CD_MIN);
  saveData();
  if (Math.random() < 0.70) generatePartnerMoment();
}

// ---------- 渲染 ----------
// filter：undefined=沿用当前 / null=清除 / {contactId, onlyPartner}=按条件过滤
function renderMoments(filter) {
  var box = document.getElementById('moments-scroll');
  if (!box) return;
  if (filter === null) {
    momentsFilterId = null;
    momentsOnlyPartner = false;
  } else if (filter) {
    momentsFilterId = filter.contactId || null;
    momentsOnlyPartner = !!filter.onlyPartner;
  }

  var posts = momentsData.posts.filter(function (p) {
    if (momentsOnlyPartner && p.type !== 'partner') return false;
    return !momentsFilterId || p.contactId === momentsFilterId;
  }).slice().sort(function (a, b) {
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
  box.innerHTML = momentsCoverHtml() +
    '<div class="m-feed">' +
      (posts.length ? posts.map(momentPostHtml).join('')
        : '<div class="empty-hint">' + (momentsFilterId
            ? 'TA 还没有发过动态'
            : '<i class="fas fa-camera-retro"></i> 还没有动态，点右上角 ＋ 发一条吧') + '</div>') +
    '</div>';
  // 用户正在看这一页时，清除"对方评论未读"小圆点（下次渲染不再显示）
  if (document.getElementById('view-moments').classList.contains('active')) _clearPartnerCmtsNew();
}

// 当前朋友圈的"身份"：在某个梦角的朋友圈下查看 → 用该梦角的头像昵称；否则用我自己的
function _mIdentity() {
  if (momentsFilterId) {
    var c = _mContact(momentsFilterId);
    if (c) return { name: c.name || '梦角', avatar: c.avatar || '🌷', cover: momentsCovers[c.id] || null };
  }
  return { name: _mMeName(), avatar: (homeProfile && homeProfile.avatar) || '', cover: momentsCover };
}

// 写入封面：梦角的朋友圈写各自的，全局朋友圈写我自己的
function _mSetCover(dataUrl) {
  if (momentsFilterId) {
    if (dataUrl) momentsCovers[momentsFilterId] = dataUrl;
    else delete momentsCovers[momentsFilterId];
  } else {
    momentsCover = dataUrl || null;
  }
  saveData();
}

function momentsCoverHtml() {
  var me = _mIdentity();
  var viewingPartner = !!momentsFilterId;
  return '<div class="m-cover" data-act="cover">' +
    (me.cover
      ? '<img class="m-cover-img" src="' + escapeHtml(me.cover) + '" alt="">'
      : '<div class="m-cover-default"></div>') +
    '<div class="m-cover-shade"></div>' +
    '<button type="button" class="m-back" data-back-home><i class="fas fa-chevron-left"></i></button>' +
    // 看梦角的朋友圈时不显示 ＋：那里的动态都是 TA 发的，我发不出
    (viewingPartner ? '' : '<button type="button" class="m-post-btn" data-act="post"><i class="fas fa-plus"></i></button>') +
    '<div class="m-me-row">' +
      '<div class="m-me-avatar">' + (me.avatar ? avatarHtml(me.avatar) : '<i class="fas fa-user"></i>') + '</div>' +
      '<div class="m-me-name">' + escapeHtml(me.name) + '</div>' +
    '</div>' +
  '</div>';
}

function momentPostHtml(post) {
  var isPartner = post.type === 'partner';
  var name = isPartner ? _mCName(post.contactId) : _mMeName();
  var avatar = isPartner ? _mCAvatar(post.contactId) : ((homeProfile && homeProfile.avatar) || '');
  var likeOn = !!post.userLiked;
  var likeCount = (post.partnerLiked ? 1 : 0) + (post.userLiked ? 1 : 0);
  var isMine = post.type === 'user';

  var likers = [];
  if (post.partnerLiked) likers.push(_mCName(post.contactId));
  if (post.userLiked) likers.push(_mMeName());

  return '<div class="m-post" data-pid="' + escapeHtml(post.id) + '" data-type="' + post.type + '">' +
    '<div class="m-pav">' + (avatar ? avatarHtml(avatar) : '<i class="fas fa-user"></i>') + '</div>' +
    '<div class="m-pmain">' +
      '<div class="m-phead">' +
        '<div class="m-pname">' + escapeHtml(name) + '</div>' +
        (isMine ? '<button type="button" class="m-post-more" data-act="del-post" data-pid="' + escapeHtml(post.id) + '"><i class="fas fa-ellipsis-h"></i></button>' : '') +
      '</div>' +
      (post.text ? '<div class="m-ptext">' + escapeHtml(post.text) + '</div>' : '') +
      momentImgsHtml(post.images) +
      '<div class="m-prow">' +
        '<span class="m-ptime">' + escapeHtml(_fmtDate(post.date)) + '</span>' +
        '<button type="button" class="m-like-btn' + (likeOn ? ' on' : '') + '" data-act="like" data-pid="' + escapeHtml(post.id) + '">' +
          '<i class="' + (likeOn ? 'fas' : 'far') + ' fa-heart"></i>' + (likeCount > 0 ? '<span>' + likeCount + '</span>' : '') +
        '</button>' +
        '<button type="button" class="m-cmt-btn" data-act="cmt" data-pid="' + escapeHtml(post.id) + '"><i class="far fa-comment"></i></button>' +
      '</div>' +
      (likers.length
        ? '<div class="m-likers"><i class="fas fa-heart"></i><span>' + escapeHtml(likers.join('、')) + ' 赞了</span></div>'
        : '') +
      momentCmtsHtml(post) +
    '</div>' +
  '</div>';
}

function momentImgsHtml(images) {
  images = Array.isArray(images) ? images : [];
  if (!images.length) return '';
  if (images.length === 1) {
    var one = escapeHtml(images[0]);
    return '<div class="m-pimgs m-single"><img class="m-pimg" data-src="' + one + '" src="' + one + '" alt=""></div>';
  }
  var n = Math.min(images.length, 9);
  var cells = images.slice(0, n).map(function (src) {
    var s = escapeHtml(src);
    return '<img class="m-pimg" data-src="' + s + '" src="' + s + '" alt="">';
  }).join('');
  return '<div class="m-pimgs m-grid n' + n + '">' + cells + '</div>';
}

function momentCmtsHtml(post) {
  var list = post.comments || [];
  if (!list.length) return '';
  return '<div class="m-cmts">' + list.map(function (c) { return momentCmtHtml(post, c); }).join('') + '</div>';
}

function momentCmtHtml(post, c) {
  var isPartner = c.authorType === 'partner';
  var name = isPartner ? _mCName(post.contactId) : _mMeName();
  var mine = !isPartner;
  var html = '<div class="m-cmt' + (mine ? ' m-cmt-mine' : '') + '" data-cid="' + escapeHtml(c.id) + '"' +
    ' data-pid="' + escapeHtml(post.id) + '"' + (mine ? ' data-mine="1"' : '') + '>';
  html += '<span class="m-cmt-name">' + escapeHtml(name) + '</span>';
  if (c.replyTo && c.replyTo.authorName) {
    html += '<span class="m-cmt-reply"> 回复 </span><span class="m-cmt-name">' + escapeHtml(c.replyTo.authorName) + '</span>';
  }
  html += '<span class="m-cmt-sep">：</span>';
  if (c.image) {
    html += '<img class="m-cimg" data-src="' + escapeHtml(c.image) + '" src="' + escapeHtml(c.image) + '" alt="">';
  }
  if (c.text) {
    html += '<span class="m-cmt-text">' + escapeHtml(c.text) + '</span>';
  }
  if (isPartner && c.isNew) html += '<span class="m-cmt-dot"></span>';
  html += '</div>';
  return html;
}

// 清除"对方评论未读"标记（不重渲染，让圆点在当前这一屏保留一次）
function _clearPartnerCmtsNew() {
  var changed = false;
  momentsData.posts.forEach(function (p) {
    (p.comments || []).forEach(function (c) {
      if (c.authorType === 'partner' && c.isNew) { c.isNew = false; changed = true; }
    });
  });
  if (changed) saveData();
}

// ---------- 交互：背景 / 发布 / 点赞 / 评论 / 删除 ----------
function openCoverSheet() {
  var who = momentsFilterId ? (_mContact(momentsFilterId) || {}).name : _mMeName();
  showSheet(who + ' 的朋友圈背景', [
    { label: '<i class="fas fa-sync"></i> 更换背景', act: 'replace' },
    { label: '<i class="fas fa-undo"></i> 恢复默认', act: 'reset' },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act === 'replace') pickMomentsCover();
    else if (act === 'reset') { _mSetCover(null); renderMoments(); }
  });
}

function pickMomentsCover() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function () {
    var file = input.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); return; }
    openCropper(file, 'cover', function (dataUrl) {
      _mSetCover(dataUrl);
      renderMoments();
      toast('背景已更换');
    });
  };
  input.click();
}

// 多选选图（限数量），逐张 compressPhoto 压缩成 dataURL
function _pickMomentPhotos(max, cb) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = function () {
    var files = Array.prototype.slice.call(input.files || []).filter(function (f) {
      return f && f.type && f.type.indexOf('image') === 0;
    }).slice(0, Math.max(0, max));
    var out = [], i = 0;
    (function next() {
      if (i >= files.length) { cb(out); return; }
      compressPhoto(files[i++]).then(function (d) { out.push(d); next(); })
        .catch(function () { next(); });
    })();
  };
  input.click();
}

function toggleMomentLike(postId) {
  var p = momentsData.posts.find(function (x) { return x.id === postId; });
  if (!p) return;
  p.userLiked = !p.userLiked;
  saveData();
  renderMoments();
}

function openCommentInput(postId) {
  promptModal('评论', '写下你的评论', '', function (v) {
    var text = (v || '').trim();
    if (!text) return;
    var p = momentsData.posts.find(function (x) { return x.id === postId; });
    if (!p) return;
    p.comments.push({
      id: _mUid('c'), authorType: 'user', text: text, image: null,
      timestamp: Date.now(), isNew: false, replyTo: null
    });
    saveData();
    renderMoments();
    onUserCommented(postId);
  });
}

function openDeletePostSheet(postId) {
  showSheet('这条动态', [
    { label: '<i class="fas fa-trash-alt"></i> 删除这条动态', act: 'del', danger: true },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act !== 'del') return;
    confirmModal('删除动态', '确定删除这条动态吗？', function () {
      momentsData.posts = momentsData.posts.filter(function (p) { return p.id !== postId; });
      saveData();
      renderMoments();
    }, { danger: true });
  });
}

function openDeleteCmtSheet(postId, cmtId) {
  showSheet('这条评论', [
    { label: '<i class="fas fa-trash-alt"></i> 删除这条评论', act: 'del', danger: true },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act !== 'del') return;
    confirmModal('删除评论', '确定删除这条评论吗？', function () {
      var p = momentsData.posts.find(function (x) { return x.id === postId; });
      if (p) p.comments = (p.comments || []).filter(function (c) { return c.id !== cmtId; });
      saveData();
      renderMoments();
    }, { danger: true });
  });
}

// ---------- 撰写弹窗（动态构建 DOM，参考 stickers.js 的动态 modal 写法） ----------
function openPostComposer() {
  var old = document.getElementById('moments-compose-modal');
  if (old) old.remove();
  _mComposeImages = [];

  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'moments-compose-modal';
  modal.innerHTML =
    '<div class="modal-content m-compose">' +
      '<div class="modal-title"><i class="fas fa-camera-retro"></i><span>发布动态</span></div>' +
      '<textarea class="modal-textarea m-compose-text" id="m-compose-text" placeholder="这一刻的想法…"></textarea>' +
      '<div class="m-compose-imgs" id="m-compose-imgs"></div>' +
      '<div class="modal-buttons m-compose-btns">' +
        '<button type="button" class="modal-btn modal-btn-secondary" id="m-compose-cancel">取消</button>' +
        '<button type="button" class="modal-btn modal-btn-primary" id="m-compose-publish">发表</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closePostComposer(); });

  var imgsBox = modal.querySelector('#m-compose-imgs');
  imgsBox.addEventListener('click', function (e) {
    var del = e.target.closest('.m-compose-del');
    if (del) {
      _mComposeImages.splice(Number(del.dataset.idx), 1);
      _renderComposeImgs();
      return;
    }
    if (e.target.closest('.m-compose-add')) {
      _pickMomentPhotos(9 - _mComposeImages.length, function (urls) {
        _mComposeImages = _mComposeImages.concat(urls).slice(0, 9);
        _renderComposeImgs();
      });
    }
  });

  modal.querySelector('#m-compose-cancel').onclick = closePostComposer;
  modal.querySelector('#m-compose-publish').onclick = publishCompose;

  _renderComposeImgs();
  showModal(modal, modal.querySelector('#m-compose-text'));
}

function _renderComposeImgs() {
  var box = document.getElementById('m-compose-imgs');
  if (!box) return;
  var html = '';
  _mComposeImages.forEach(function (src, i) {
    html += '<div class="m-compose-thumb">' +
      '<img src="' + escapeHtml(src) + '" alt="">' +
      '<span class="m-compose-del" data-idx="' + i + '"><i class="fas fa-times"></i></span>' +
    '</div>';
  });
  if (_mComposeImages.length < 9) {
    html += '<div class="m-compose-add"><i class="fas fa-plus"></i></div>';
  }
  box.innerHTML = html;
}

function closePostComposer() {
  var modal = document.getElementById('moments-compose-modal');
  if (modal) { hideModal(modal); modal.remove(); }
  _mComposeImages = [];
}

function publishCompose() {
  var ta = document.getElementById('m-compose-text');
  var text = ta ? ta.value.trim() : '';
  if (!text && !_mComposeImages.length) { toast('说点什么吧'); return; }
  var post = {
    id: _mUid('user'), type: 'user', contactId: _mContactId(),
    text: text, images: _mComposeImages.slice(),
    date: _mToday(), timestamp: Date.now(),
    userLiked: false, partnerLiked: false, pendingLikeTime: null, pendingLikeSilent: false,
    comments: [], pendingPartnerComment: null
  };
  momentsData.posts.unshift(post);
  saveData();
  renderMoments();
  closePostComposer();
  onUserPostCreated(post.id);
}

// ---------- 初始化 ----------
function initMoments() {
  var box = document.getElementById('moments-scroll');
  if (box && !box.dataset.bound) {
    box.dataset.bound = '1';

    box.addEventListener('click', function (e) {
      if (_mLongPressed) { _mLongPressed = false; return; }

      if (e.target.closest('[data-back-home]')) {
        // 从梦角资料页带过滤进来的 → 回梦角资料页；否则回主页。
        // 需阻止冒泡，避免 app.js 的全局 [data-back-home] 委托再跳一次主页
        e.stopPropagation();
        if (momentsFilterId) {
          renderMoments(null);              // 连带清掉 onlyPartner，避免污染全局朋友圈
          if (typeof renderContactInfo === 'function') { renderContactInfo(); showView('contactinfo'); }
          return;
        }
        showView('home');
        renderHome();
        return;
      }

      var act = e.target.closest('[data-act]');
      if (act) {
        var a = act.dataset.act, pid = act.dataset.pid;
        if (a === 'post') { openPostComposer(); return; }
        if (a === 'cover') { openCoverSheet(); return; }
        if (a === 'like') { toggleMomentLike(pid); return; }
        if (a === 'cmt') { openCommentInput(pid); return; }
        if (a === 'del-post') { openDeletePostSheet(pid); return; }
      }

      var img = e.target.closest('.m-pimg, .m-cimg');
      if (img) { openImageViewer(img.dataset.src); return; }
    });

    // 长按：自己的动态 / 自己的评论 → 删除入口
    box.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.m-pimg, .m-cimg')) return;
      var cmt = e.target.closest('.m-cmt[data-mine="1"]');
      var post = e.target.closest('.m-post[data-type="user"]');
      if (!cmt && !post) return;
      _mLongPressed = false;
      clearTimeout(_mPressTimer);
      _mPressTimer = setTimeout(function () {
        _mLongPressed = true;
        if (cmt) openDeleteCmtSheet(cmt.dataset.pid, cmt.dataset.cid);
        else openDeletePostSheet(post.dataset.pid);
      }, 550);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(function (ev) {
      box.addEventListener(ev, function () { clearTimeout(_mPressTimer); });
    });
  }

  // 每分钟检查（补赞/落评论/自动发动态）；首次进入立刻跑一次
  if (_momentsTimer) clearInterval(_momentsTimer);
  _momentsTimer = setInterval(checkMomentsStatus, 60 * 1000);
  checkMomentsStatus();
}
