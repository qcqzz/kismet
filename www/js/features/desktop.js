/* ============ 字卡传讯 · 桌面（启动页） ============ */

function initDesktop() {
  // 日期
  var el = document.getElementById('desk-date');
  var d = new Date();
  var week = ['日','一','二','三','四','五','六'][d.getDay()];
  el.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 · 星期' + week;

  // 模块点击
  document.querySelectorAll('.desk-tile').forEach(function (tile) {
    tile.addEventListener('click', function () {
      var mod = tile.dataset.module;
      if (mod === 'chat') {
        showView('contacts');
        renderContactList();
      } else {
        toast('「' + tile.querySelector('.tile-name').textContent + '」模块 敬请期待');
      }
    });
  });

  // 设置入口
  document.getElementById('btn-open-settings').addEventListener('click', function () {
    showView('settings');
    renderSettings();
  });

  updateDeskBadge();
}

function updateDeskBadge() {
  var total = contacts.reduce(function (sum, c) { return sum + (c.unread || 0); }, 0);
  var badge = document.getElementById('desk-badge-chat');
  if (!badge) return;
  if (total > 0) {
    badge.style.display = 'flex';
    badge.textContent = total > 99 ? '99+' : total;
  } else {
    badge.style.display = 'none';
  }
}
