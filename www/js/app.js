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

    // 通知与后台保活
    initNotifyKeepAlive();

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

  // ---------- 通知与后台保活 ----------
  function initNotifyKeepAlive() {
    // APK：拉起前台服务（状态栏常驻通知 + WakeLock + 5 分钟定时唤醒）
    var native = !!(window.ForegroundBridge && ForegroundBridge.isSupported());
    if (native && settings.keepAliveEnabled !== false) {
      try { ForegroundBridge.start(); } catch (e) {}
    }

    // 原生闹钟排期：把"未来几次梦角说话"交给 AlarmManager。
    // 页面活着时每 60 秒重排一次（闹钟被不断推后，实际由 JS 投递，不会重复）；
    // 页面被冻结 / 进程被杀时 JS 停止重排，闹钟到点自己弹通知。
    try { notifyDrainNativeAlarms(); } catch (e) {}
    try { notifySyncNativeAlarms(); } catch (e) {}
    setInterval(function () {
      try { notifySyncNativeAlarms(); } catch (e) {}
    }, 60000);

    // 原生首次启动：依次引导三个权限，缺一个后台都可能漏消息。
    // 只引导一次，之后在设置页里可以手动再开。
    if (native && !Storage.get('keepAliveGuided')) {
      setTimeout(function () {
        try {
          ForegroundBridge.isBatteryOptimized(function (ignored) {
            if (ignored) return;
            toast('为后台不漏消息，请允许本应用忽略电池优化');
            ForegroundBridge.requestBatteryOptimization();
          });
        } catch (e) {}
      }, 2500);

      setTimeout(function () {
        try {
          ForegroundBridge.requestExactAlarm(function (r) {
            if (r && r.needAction) toast('请允许「闹钟和提醒」，后台提醒才准时');
          });
        } catch (e) {}
      }, 6000);

      setTimeout(function () {
        try {
          ForegroundBridge.getManufacturer(function (brand) {
            var domestic = brand === 'xiaomi' || brand === 'huawei'
              || brand === 'oppo' || brand === 'vivo' || brand === 'meizu';
            if (!domestic) return;
            toast('为后台不漏消息，请把本应用加入自启动/后台白名单');
            ForegroundBridge.openBatterySaverGuide();
          });
        } catch (e) {}
      }, 10000);

      Storage.set('keepAliveGuided', true);
    }

    // 切后台：再拉一次前台服务（被厂商清掉时能自愈），并把数据立即落盘
    // 回前台：补投递离线队列里积压的梦角消息
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        try { saveData(); } catch (e) {}
        // 切后台前把闹钟排期落定，之后 WebView 被冻结也不影响到点提醒
        try { notifySyncNativeAlarms(); } catch (e) {}
        try {
          if (native && settings.keepAliveEnabled !== false) ForegroundBridge.start();
        } catch (e) {}
        return;
      }
      // 回前台：先把"后台到点弹过通知"的消息补进聊天，再重排闹钟
      try { notifyDrainNativeAlarms(); } catch (e) {}
      try { notifySyncNativeAlarms(); } catch (e) {}
      try {
        if (window.OfflineReminder && typeof OfflineReminder.drain === 'function') OfflineReminder.drain();
      } catch (e) {}
      try { if (typeof renderContactList === 'function') renderContactList(); } catch (e) {}
      try { if (typeof updateNavBadge === 'function') updateNavBadge(); } catch (e) {}
    });
  }

  // ---------- 视图切换 ----------
  var NAV_FOR_VIEW = {
    home: null, contacts: 'chat', chat: 'chat', contactinfo: 'chat',
    moments: 'moments', letters: 'letters', settings: 'settings',
    entertainment: null, period: null, schedule: null
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

    // 主页是全屏固定布局：隐藏时量不到高度，显示出来必须重新适配一次
    if (name === 'home' && typeof fitHomeToScreen === 'function') fitHomeToScreen();

    // 次级页面各自按需重绘（经期 / 日程 / 娱乐）
    try {
      if (name === 'period' && window.PeriodApp) PeriodApp.onShow();
      else if (name === 'schedule' && window.ScheduleApp) ScheduleApp.onShow();
      else if (name === 'entertainment' && window.EntertainmentApp) EntertainmentApp.onShow();
    } catch (e) { console.warn('[showView] 页面初始化失败:', name, e); }
  };
})();
