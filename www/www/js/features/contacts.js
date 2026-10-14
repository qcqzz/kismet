/* ============ 字卡传讯 · 联系人列表（仿微信会话列表） ============ */

function renderContactList() {
  var list = DOMElements.contactList;
  if (!list) return;

  var keyword = (DOMElements.contactSearch && DOMElements.contactSearch.value || '').trim();
  var shown = contacts.filter(function (c) {
    return !keyword || c.name.indexOf(keyword) !== -1;
  });

  if (shown.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">💭</div><div class="es-title">没有联系人</div></div>';
    return;
  }

  // 按最近消息时间倒序
  shown.sort(function (a, b) { return (b.lastTime || 0) - (a.lastTime || 0); });

  list.innerHTML = '';
  shown.forEach(function (c) {
    var msgs = messagesByContact[c.id] || [];
    var last = msgs[msgs.length - 1];
    var preview = '还没有消息';
    if (last) {
      if (last.recalled) preview = (last.sender === 'user' ? '你' : '对方') + '撤回了一条消息';
      else if (last.type === 'system') preview = last.text;
      else if (last.image) preview = '[图片]';
      else if (last.voice) preview = '[语音]';
      else preview = (last.sender === 'user' ? '我: ' : '') + last.text;
    }

    var row = document.createElement('div');
    row.className = 'contact-row';
    row.innerHTML =
      '<div class="contact-avatar">' + (c.avatar || '🌷') + '</div>' +
      '<div class="contact-mid">' +
        '<div class="contact-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="contact-last">' + escapeHtml(preview) + '</div>' +
      '</div>' +
      '<div class="contact-right">' +
        '<span class="contact-time">' + contactTimeLabel(c.lastTime) + '</span>' +
        (c.unread ? '<span class="contact-unread">' + c.unread + '</span>' : '') +
      '</div>';
    row.addEventListener('click', function () { openChat(c.id); });
    list.appendChild(row);
  });
}

function openChat(contactId) {
  activeContactId = contactId;
  var contact = getActiveContact();

  // 清除未读
  contact.unread = 0;
  saveData();
  updateNavBadge();

  // 更新聊天头部
  DOMElements.chatHeadName.textContent = contact.name;
  DOMElements.chatHeadStatus.textContent = partnerStatus;

  showView('chat');
  renderAllMessages();
  if (typeof hideAllPopups === 'function') hideAllPopups();
}

function initContacts() {
  document.getElementById('btn-add-contact').addEventListener('click', function () {
    promptModal('新建联系人', '给对方起个名字', '', function (name) {
      if (!name) return;
      promptModal('头像', '输入一个emoji作为头像（如 🌷）', '🌷', function (avatar) {
        var c = {
          id: 'c_' + Date.now(),
          name: name,
          avatar: avatar || '🌷',
          signature: '',
          unread: 0,
          lastTime: 0
        };
        contacts.push(c);
        messagesByContact[c.id] = [];
        saveData();
        renderContactList();
        toast('已创建联系人「' + name + '」');
      });
    });
  });

  DOMElements.contactSearch.addEventListener('input', renderContactList);

  document.getElementById('btn-chat-back').addEventListener('click', function () {
    hideTyping();
    showView('contacts');
    renderContactList();
    if (typeof updateNavBadge === 'function') updateNavBadge();
  });

  // 聊天页右上角 ⋯ → 联系人/聊天设置弹层
  document.getElementById('btn-chat-info').addEventListener('click', openChatInfoSheet);
}

function openChatInfoSheet() {
  var contact = getActiveContact();
  if (!contact) return;
  var msgs = activeMessages();
  var favCount = msgs.filter(function (m) { return m.favorited; }).length;

  showSheet(
    '与 ' + contact.name + ' 的聊天',
    [
      { label: '🗂 收藏的字卡（' + favCount + '）', act: 'favs' },
      { label: '✏️ 修改昵称', act: 'rename' },
      { label: '🖼 更换头像', act: 'avatar' },
      { label: '🧹 清空此聊天记录', act: 'clear', danger: true },
      { label: '删除联系人', act: 'del', danger: true },
      { label: '取消', act: 'cancel', cancel: true }
    ],
    function (act) {
      if (act === 'favs') {
        showView('settings');
        renderSettings('favs');
      } else if (act === 'rename') {
        promptModal('修改昵称', '', contact.name, function (v) {
          if (!v) return;
          contact.name = v;
          saveData();
          DOMElements.chatHeadName.textContent = v;
          toast('已修改');
        });
      } else if (act === 'avatar') {
        promptModal('更换头像', '输入一个emoji', contact.avatar || '', function (v) {
          contact.avatar = v || contact.avatar;
          saveData();
          renderAllMessages();
          toast('已更换');
        });
      } else if (act === 'clear') {
        confirmModal('清空聊天记录', '将清空与「' + contact.name + '」的全部聊天记录，确定吗？', function () {
          messagesByContact[contact.id] = [];
          saveData();
          renderAllMessages();
          toast('已清空');
        }, { danger: true });
      } else if (act === 'del') {
        confirmModal('删除联系人', '将删除「' + contact.name + '」及其全部聊天记录，确定吗？', function () {
          contacts = contacts.filter(function (c) { return c.id !== contact.id; });
          delete messagesByContact[contact.id];
          saveData();
          activeContactId = null;
          showView('contacts');
          renderContactList();
          if (typeof updateNavBadge === 'function') updateNavBadge();
          toast('已删除');
        }, { danger: true });
      }
    }
  );
}
