/* ============ 字卡传讯 · 问问你（对齐 chat） ============ */
/* 我发问题卡片 → 梦角随机延迟(10s~60s)作答卡片 */

var _askChoiceMode = 'single';

function initAsk() {
  var addBtn = document.getElementById('ask-add-option');
  var singleBtn = document.getElementById('ask-mode-single');
  var multiBtn = document.getElementById('ask-mode-multiple');
  var cancelBtn = document.getElementById('ask-cancel-btn');
  var sendBtn = document.getElementById('ask-send-btn');

  if (addBtn) addBtn.addEventListener('click', function () { window.addAskOption(); });
  if (singleBtn) singleBtn.addEventListener('click', function () { setAskMode('single'); });
  if (multiBtn) multiBtn.addEventListener('click', function () { setAskMode('multiple'); });
  if (cancelBtn) cancelBtn.addEventListener('click', function () { hideModal(document.getElementById('ask-modal')); });
  if (sendBtn) sendBtn.addEventListener('click', function () { window.askQuestionSend(); });
}

function _askOptionValues() {
  var c = document.getElementById('ask-options-container');
  if (!c) return [];
  var vals = [];
  var rows = c.querySelectorAll('input.ask-option-input');
  for (var i = 0; i < rows.length; i++) {
    var v = rows[i].value.trim();
    if (v) vals.push(v);
  }
  return vals;
}

function _askRelabelOptions() {
  var c = document.getElementById('ask-options-container');
  if (!c) return;
  var labels = c.querySelectorAll('.ask-option-label');
  for (var i = 0; i < labels.length; i++) labels[i].textContent = String.fromCharCode(65 + i);
}

function setAskMode(mode) {
  _askChoiceMode = (mode === 'multiple') ? 'multiple' : 'single';
  var s = document.getElementById('ask-mode-single');
  var m = document.getElementById('ask-mode-multiple');
  if (s) s.classList.toggle('on', _askChoiceMode === 'single');
  if (m) m.classList.toggle('on', _askChoiceMode === 'multiple');
}
window.setAskMode = setAskMode;

function addAskOption() {
  var c = document.getElementById('ask-options-container');
  if (!c) return;
  var rows = c.querySelectorAll('.ask-option-row');
  if (rows.length >= 10) { toast('选项最多 10 个哦'); return; }
  var row = document.createElement('div');
  row.className = 'ask-option-row';
  var tag = document.createElement('span');
  tag.className = 'ask-option-label';
  tag.textContent = String.fromCharCode(65 + rows.length);
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'ask-option-input';
  inp.placeholder = '输入选项内容…';
  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'ask-option-del';
  del.title = '删除选项';
  del.innerHTML = '<i class="fas fa-times"></i>';
  del.onclick = function () {
    if (c.querySelectorAll('.ask-option-row').length <= 2) { toast('至少保留 2 个选项哦'); return; }
    row.remove();
    _askRelabelOptions();
  };
  row.appendChild(tag);
  row.appendChild(inp);
  row.appendChild(del);
  c.appendChild(row);
  setTimeout(function () { inp.focus(); }, 0);
}
window.addAskOption = addAskOption;

function openAskModal() {
  if (window.dismissMorePanel) window.dismissMorePanel();
  setAskMode('single');
  var c = document.getElementById('ask-options-container');
  if (c) {
    c.innerHTML = '';
    addAskOption();
    addAskOption();
  }
  var modal = document.getElementById('ask-modal');
  if (modal) showModal(modal);
  var inp = document.getElementById('ask-question-input');
  setTimeout(function () { if (inp) inp.focus(); }, 80);
}
window.openAskModal = openAskModal;

function askQuestionSend() {
  var inp = document.getElementById('ask-question-input');
  if (!inp) return;
  var t = inp.value.trim();
  if (!t) { toast('先输入你想问的问题呀'); return; }
  var opts = _askOptionValues();
  if (opts.length < 2) { toast('至少设置 2 个选项哦'); return; }
  hideModal(document.getElementById('ask-modal'));
  inp.value = '';
  var c = document.getElementById('ask-options-container');
  if (c) c.innerHTML = '';

  addMessage({
    id: newId(),
    contactId: activeContactId,
    sender: 'user',
    text: t,
    question: t,
    options: opts,
    choiceMode: _askChoiceMode,
    answer: null,
    timestamp: Date.now(),
    status: 'sent',
    favorited: false,
    recalled: false,
    replyTo: null,
    type: 'question'
  });
  playSound('my_send');
  var partner = _rpPartnerName_ask();
  toast('已发给' + partner + '，TA 正在思考…');
  _scheduleQuestionAnswer({ question: t, options: opts, choiceMode: _askChoiceMode });
}
window.askQuestionSend = askQuestionSend;

function _rpPartnerName_ask() {
  var c = getActiveContact();
  return (c && c.name) ? c.name : '对方';
}

function _scheduleQuestionAnswer(data) {
  var opts = Array.isArray(data.options) ? data.options.slice() : [];
  if (!opts.length) return;
  var mode = data.choiceMode === 'multiple' ? 'multiple' : 'single';
  var amin = Number(settings.askDelayMin) || 10000;
  var amax = Number(settings.askDelayMax) || 60000;
  if (amax < amin) amax = amin;
  var delay = amin + Math.random() * (amax - amin);
  setTimeout(function () {
    var idx = [];
    for (var i = 0; i < opts.length; i++) idx.push(i);
    for (var n = idx.length - 1; n > 0; n--) {
      var r = Math.floor(Math.random() * (n + 1));
      var tmp = idx[n]; idx[n] = idx[r]; idx[r] = tmp;
    }
    var plan;
    if (mode === 'multiple') {
      var cnt;
      if (opts.length <= 1) cnt = 1;
      else if (Math.random() < 0.3) cnt = 1;
      else cnt = 2 + Math.floor(Math.random() * (opts.length - 1));
      plan = idx.slice(0, cnt);
    } else {
      plan = [idx[0]];
    }
    var answer = plan.slice();

    addMessage({
      id: newId(),
      contactId: activeContactId,
      sender: 'partner',
      text: data.question,
      question: data.question,
      options: opts,
      choiceMode: mode,
      answer: answer,
      timestamp: Date.now(),
      status: 'received',
      favorited: false,
      recalled: false,
      replyTo: null,
      type: 'question'
    });
    playSound('partner_message');

    // 梦角作答后，把未读消息标记为已读
    var changed = false;
    activeMessages().forEach(function (m) {
      if (m && m.sender === 'user' && m.status !== 'read') { m.status = 'read'; changed = true; }
    });
    if (changed) updateReadMarksDOM();
  }, delay);
}
window._scheduleQuestionAnswer = _scheduleQuestionAnswer;