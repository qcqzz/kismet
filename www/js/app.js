/* ============ 字卡传讯 · 应用入口 ============ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    // 缓存 DOM
    DOMElements = {
      chatStream: document.getElementById('chat-stream'),
      chatHeadName: document.getElementById('chat-head-name'),
      chatHeadStatus: document.getElementById('chat-head-status'),
      messageInput: document.getElementById('message-input'),
      sendBtn: document.getElementById('send-btn'),
      moreBtn: document.getElementById('more-btn'),
      morePanel: document.getElementById('more-panel'),
      videocallBtn: document.getElementById('videocall-btn'),
      attachmentBtn: document.getElementById('attachment-btn'),
      imageInput: document.getElementById('image-input'),
      comboBtn: document.getElementById('combo-btn'),
      stickerPop: document.getElementById('user-sticker-picker'),
      popBody: document.getElementById('combo-content-area'),
      voiceMicBtn: document.getElementById('voice-mic-btn'),
      voiceWrap: document.getElementById('voice-hold-wrap'),
      voiceBtn: document.getElementById('voice-hold-btn'),
      voiceHint: document.getElementById('voice-rec-hint'),
      continueBtn: document.getElementById('continue-btn'),
      batchBtn: document.getElementById('batch-btn'),
      batchPreview: document.getElementById('batch-preview'),
      replyPreview: document.getElementById('reply-preview'),
      contactList: document.getElementById('contact-list'),
      contactSearch: document.getElementById('contact-search'),
      settingsBody: document.getElementById('settings-body'),
      sheetMask: document.getElementById('sheet-mask'),
      actionSheet: document.getElementById('action-sheet'),
      imgViewer: document.getElementById('img-viewer'),
      imgViewerImg: document.getElementById('img-viewer-img')
    };

    // 加载数据 + 主题
    loadAllData();
    applyBubbleTheme();
    if (typeof applyAppearance === 'function') applyAppearance();
    if (typeof partnerActivityTick === 'function') partnerActivityTick();

    // 初始化各模块
    initHome();
    initContacts();
    initContactInfo();
    initStickers();
    initMoments();
    initTransfer();
    initAsk();
    initInputBar();

    // 主动发送定时器（设置里开启时生效）
    if (typeof startAutoSend === 'function') startAutoSend();

    // 设置页返回：子页先回主设置，否则回主页
    document.getElementById('btn-settings-back').addEventListener('click', function () {
      if (typeof settingsBack === 'function') settingsBack();
      else { showView('home'); renderHome(); }
    });

    // 联系人列表返回按钮：回主页
    document.getElementById('btn-contacts-back').addEventListener('click', function () {
      showView('home');
      renderHome();
    });

    // 返回主页按钮（含朋友圈等动态渲染出来的返回键）：统一用事件委托，避免动态插入的按钮漏绑
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-back-home]');
      if (!btn) return;
      showView('home');
      renderHome();
    });

    // 底部四格导航
    bindBottomNav();

    // 全局：ESC/点击遮罩关闭弹层
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSheet(); hideAllPopups(); }
    });

    // 默认进主页
    showView('home');
  });

  // ---------- 四格导航 ----------
  function bindBottomNav() {
    var nav = document.getElementById('bottom-nav');
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.nav-item');
      if (!btn) return;
      var tab = btn.dataset.nav;

      // 点当前已激活的格 → 返回主页
      var alreadyActive = btn.classList.contains('active');
      if (alreadyActive) {
        showView('home');
        renderHome();
        return;
      }

      if (tab === 'chat') {
        showView('contacts');
        renderContactList();
      } else if (tab === 'moments') {
        showView('moments');
        renderMoments(null);      // 从导航进入：清除梦角资料页带来的按人过滤
      } else if (tab === 'letters') {
        showView('letters');
        if (typeof envelopeTick === 'function') envelopeTick();
        if (typeof renderLetters === 'function') renderLetters();
      } else if (tab === 'settings') {
        _settingsReturnView = null;   // 从导航直接进设置：没有来路可回
        showView('settings');
        renderSettings();
      }
    });
  }

  // ---------- 视图切换 ----------
  var NAV_FOR_VIEW = {
    home: null, contacts: 'chat', chat: 'chat', contactinfo: 'chat',
    moments: 'moments', letters: 'letters', settings: 'settings'
  };

  window.showView = function (name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var view = document.getElementById('view-' + name);
    if (view) view.classList.add('active');

    // 悬浮导航：只在主页显示；由导航键进入的界面一律隐藏导航键，靠页内返回键返回
    document.body.classList.toggle('show-nav', name === 'home');

    // 高亮当前格（聊天页属于“聊天”格）
    var tab = NAV_FOR_VIEW[name];
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.nav === tab);
    });

    if (name !== 'chat') hideAllPopups();
  };
})();
