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
    initDesktop();
    initContacts();
    initInputBar();

    // 设置页返回按钮
    document.getElementById('btn-settings-back').addEventListener('click', function () {
      if (activeContactId) {
        showView('chat');
        renderAllMessages();
      } else {
        showView('contacts');
        renderContactList();
      }
    });

    // 全局：ESC/点击遮罩关闭弹层
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSheet(); hideAllPopups(); }
    });

    // 默认进入桌面
    showView('desktop');
  });

  // 简单视图切换
  window.showView = function (name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var view = document.getElementById('view-' + name);
    if (view) view.classList.add('active');
    if (name !== 'chat') hideAllPopups();
  };
})();
