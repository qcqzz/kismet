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
      callBtn: document.getElementById('call-btn'),
      imageBtn: document.getElementById('image-btn'),
      imageInput: document.getElementById('image-input'),
      comboBtn: document.getElementById('combo-btn'),
      stickerPop: document.getElementById('sticker-pop'),
      popBody: document.getElementById('pop-body'),
      micBtn: document.getElementById('mic-btn'),
      voiceWrap: document.getElementById('voice-wrap'),
      voiceBtn: document.getElementById('voice-btn'),
      voiceHint: document.getElementById('voice-hint'),
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

    // 初始化各模块
    initHome();
    initContacts();
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
      } else if (tab === 'letters') {
        showView('letters');
      } else if (tab === 'settings') {
        showView('settings');
        renderSettings();
      }
    });
  }

  // ---------- 视图切换 ----------
  var NAV_FOR_VIEW = {
    home: null, contacts: 'chat', chat: 'chat',
    moments: 'moments', letters: 'letters', settings: 'settings'
  };

  window.showView = function (name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var view = document.getElementById('view-' + name);
    if (view) view.classList.add('active');

    // 悬浮导航：主页/列表/占位页/设置都显示，聊天对话页隐藏（沉浸式）
    document.body.classList.toggle('show-nav', name !== 'chat');

    // 高亮当前格（聊天页属于“聊天”格）
    var tab = NAV_FOR_VIEW[name];
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.nav === tab);
    });

    if (name !== 'chat') hideAllPopups();
  };
})();
