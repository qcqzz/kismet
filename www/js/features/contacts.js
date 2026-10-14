/* ============ 字卡传讯 · 梦角列表（仿微信会话列表，联系人统称"梦角"） ============ */

function groupAvatarHtml(c) {
  var ids = getGroupMemberIds(c);
  var cells = ids.slice(0, 4).map(function (id) {
    var m = memberById(id);
    return '<span>' + escapeHtml((m && m.avatar) || '🌷') + '</span>';
  }).join('');
  return '<div class="contact-avatar group-ava"><div class="ga-grid">' + cells + '</div></div>';
}

function renderContactList() {
  var list = DOMElements.contactList;
  if (!list) return;

  var keyword = (DOMElements.contactSearch && DOMElements.contactSearch.value || '').trim();
  var shown = contacts.filter(function (c) {
    return !keyword || c.name.indexOf(keyword) !== -1;
  });

  if (shown.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">💭</div><div class="es-title">' +
      (keyword ? '没有匹配的梦角' : '还没有梦角，点右上角＋新建') + '</div></div>';
    return;
  }

  // 按最近消息时间倒序
  shown.sort(function (a, b) { return (b.lastTime || 0) - (a.lastTime || 0); });

  list.innerHTML = '';
  shown.forEach(function (c) {
    var msgs = messagesByContact[c.id] || [];
    var last = msgs[msgs.length - 1];
    var group = isGroupContact(c);
    var preview = '还没有消息';
    if (last) {
      var who = '';
      if (group && last.sender === 'partner') {
        var m = last.senderId ? memberById(last.senderId) : null;
        who = (m ? m.name : '梦角') + ': ';
      }
      if (last.recalled) preview = (last.sender === 'user' ? '你' : '对方') + '撤回了一条消息';
      else if (last.type === 'system') preview = last.text;
      else if (last.type === 'redpacket') preview = who + '[红包]';
      else if (last.image) preview = who + '[图片]';
      else if (last.voice) preview = who + '[语音]';
      else preview = (last.sender === 'user' ? '我: ' : who) + last.text;
    }

    var row = document.createElement('div');
    row.className = 'contact-row';
    row.innerHTML =
      (group ? groupAvatarHtml(c) : '<div class="contact-avatar">' + escapeHtml(c.avatar || '🌷') + '</div>') +
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
  if (isGroupContact(contact)) {
    DOMElements.chatHeadStatus.textContent = getGroupMemberIds(contact).length + '位梦角';
  } else {
    DOMElements.chatHeadStatus.textContent = partnerStatus;
  }

  showView('chat');
  renderAllMessages();
  if (typeof hideAllPopups === 'function') hideAllPopups();
}

function initContacts() {
  // ＋ → 新建梦角 / 发起群聊
  document.getElementById('btn-add-contact').addEventListener('click', function () {
    showSheet('添加', [
      { label: '👤 新建梦角', act: 'new' },
      { label: '👥 发起群聊（邀请多位梦角）', act: 'group' },
      { label: '取消', act: 'cancel', cancel: true }
    ], function (act) {
      if (act === 'new') createNewContact();
      else if (act === 'group') openGroupCreateModal();
    });
  });

  DOMElements.contactSearch.addEventListener('input', renderContactList);

  document.getElementById('btn-chat-back').addEventListener('click', function () {
    hideTyping();
    showView('contacts');
    renderContactList();
    if (typeof updateNavBadge === 'function') updateNavBadge();
  });

  // 聊天页右上角 ⋯ → 梦角/群聊设置弹层
  document.getElementById('btn-chat-info').addEventListener('click', openChatInfoSheet);
}

function createNewContact() {
  promptModal('新建梦角', '给对方起个名字', '', function (name) {
    if (!name) return;
    promptModal('头像', '输入一个emoji作为头像（如 🌷）', '🌷', function (avatar) {
      var c = {
        id: 'c_' + Date.now(),
        type: 'dream',
        name: name,
        avatar: avatar || '🌷',
        signature: '',
        unread: 0,
        lastTime: 0
      };
      contacts.push(c);
      messagesByContact[c.id] = [];
      // 同步在字卡库生成该梦角的专属分区（初始为空，由用户自定义导入）
      contactReplyPools[c.id] = [];
      saveData();
      renderContactList();
      if (typeof _resetDreamSign === 'function') _resetDreamSign();
      toast('已创建梦角「' + name + '」，专属字卡库分区已生成');
    });
  });
}

// ---------- 发起群聊（多选梦角） ----------
function openGroupCreateModal() {
  var singles = contacts.filter(function (c) { return !isGroupContact(c); });
  if (!singles.length) { toast('先新建一位梦角，再发起群聊'); return; }

  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML =
    '<div class="modal-box gc-box">' +
      '<div class="m-title">发起群聊</div>' +
      '<input type="text" id="gc-name" placeholder="群聊名称（留空自动取名）">' +
      '<div class="gc-list">' +
        singles.map(function (c) {
          return '<label class="gc-item">' +
            '<input type="checkbox" value="' + c.id + '">' +
            '<span class="gc-ava">' + escapeHtml(c.avatar || '🌷') + '</span>' +
            '<span class="gc-nm">' + escapeHtml(c.name) + '</span>' +
          '</label>';
        }).join('') +
      '</div>' +
      '<div class="m-actions">' +
        '<button class="m-btn-cancel">取消</button>' +
        '<button class="m-btn-ok">创建群聊</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mask);
  mask.querySelector('.m-btn-cancel').onclick = function () { mask.remove(); };
  mask.querySelector('.m-btn-ok').onclick = function () {
    var picked = Array.prototype.slice.call(mask.querySelectorAll('input[type=checkbox]:checked'))
      .map(function (el) { return el.value; });
    if (picked.length < 1) { toast('至少选择一位梦角'); return; }
    var name = mask.querySelector('#gc-name').value.trim();
    if (!name) {
      name = picked.map(function (id) { var m = memberById(id); return m ? m.name : ''; })
        .filter(Boolean).slice(0, 3).join('、') + (picked.length > 3 ? ' 等' : '') + '的群';
    }
    var g = {
      id: 'g_' + Date.now(),
      type: 'group',
      name: name,
      members: picked,
      avatar: '',
      signature: '',
      unread: 0,
      lastTime: 0
    };
    contacts.push(g);
    messagesByContact[g.id] = [{ id: newId(), contactId: g.id, sender: null, type: 'system',
      text: '你创建了群聊「' + name + '」', timestamp: Date.now(), status: 'read',
      favorited: false, recalled: false, replyTo: null }];
    saveData();
    mask.remove();
    renderContactList();
    toast('群聊「' + name + '」已创建');
    openChat(g.id);
  };
}

function openChatInfoSheet() {
  var contact = getActiveContact();
  if (!contact) return;
  var msgs = activeMessages();
  var favCount = msgs.filter(function (m) { return m.favorited; }).length;
  var group = isGroupContact(contact);

  var items = [];
  if (group) {
    items.push({ label: '👥 群成员（' + getGroupMemberIds(contact).length + '）', act: 'members' });
    items.push({ label: '✏️ 修改群聊名称', act: 'rename' });
    items.push({ label: '🗂 收藏的字卡（' + favCount + '）', act: 'favs' });
    items.push({ label: '🧹 清空此聊天记录', act: 'clear', danger: true });
    items.push({ label: '解散群聊', act: 'del', danger: true });
  } else {
    items.push({ label: '🗂 收藏的字卡（' + favCount + '）', act: 'favs' });
    items.push({ label: '📚 专属字卡库', act: 'pool' });
    items.push({ label: '✏️ 修改昵称', act: 'rename' });
    items.push({ label: '🖼 更换头像', act: 'avatar' });
    items.push({ label: '🧹 清空此聊天记录', act: 'clear', danger: true });
    items.push({ label: '删除梦角', act: 'del', danger: true });
  }
  items.push({ label: '取消', act: 'cancel', cancel: true });

  showSheet(group ? ('群聊 · ' + contact.name) : ('与 ' + contact.name + ' 的聊天'), items, function (act) {
    if (act === 'favs') {
      showView('settings');
      renderSettings('favs');
    } else if (act === 'pool') {
      showView('settings');
      renderSettings('pool:' + contact.id);
    } else if (act === 'members') {
      var ids = getGroupMemberIds(contact);
      showSheet('群成员（' + ids.length + '）', ids.map(function (id, i) {
        var m = memberById(id);
        return { label: (m ? (m.avatar || ' ') + ' ' + m.name : '已删除'), act: 'm_' + id };
      }).concat([{ label: '取消', act: 'cancel', cancel: true }]), function (ma) {
        if (ma.indexOf('m_') === 0) openChat(ma.slice(2));
      });
    } else if (act === 'rename') {
      promptModal(group ? '修改群聊名称' : '修改昵称', '', contact.name, function (v) {
        if (!v) return;
        contact.name = v;
        saveData();
        DOMElements.chatHeadName.textContent = v;
        renderContactList();
        toast('已修改');
      });
    } else if (act === 'avatar') {
      promptModal('更换头像', '输入一个emoji', contact.avatar || '', function (v) {
        contact.avatar = v || contact.avatar;
        saveData();
        renderAllMessages();
        renderContactList();
        if (typeof _resetDreamSign === 'function') _resetDreamSign();
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
      confirmModal(group ? '解散群聊' : '删除梦角',
        group
          ? '将解散「' + contact.name + '」并删除群聊记录（各位梦角保留）'
          : '将删除「' + contact.name + '」、其全部聊天记录与专属字卡库，确定吗？',
        function () {
          contacts = contacts.filter(function (c) { return c.id !== contact.id; });
          delete messagesByContact[contact.id];
          delete contactReplyPools[contact.id];
          if (settings.homeContactId === contact.id) { settings.homeContactId = null; }
          saveData();
          activeContactId = null;
          showView('contacts');
          renderContactList();
          if (typeof _resetDreamSign === 'function') _resetDreamSign();
          if (typeof updateNavBadge === 'function') updateNavBadge();
          toast(group ? '已解散' : '已删除');
        }, { danger: true });
    }
  });
}
