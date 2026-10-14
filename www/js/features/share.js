/* ============ 字卡传讯 · 字卡分享图（canvas 渲染，黑白系） ============ */

function shareCardImage(msg) {
  var theme = CARD_THEMES.ink;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');

  var W = 720;
  var padding = 56;
  var maxTextW = W - padding * 2;

  var fontSize = 40;
  ctx.font = fontSize + 'px ' + theme.font;
  var lines = wrapText(ctx, msg.text || '[图片]', maxTextW);
  var lineH = fontSize * 1.6;
  var textH = lines.length * lineH;

  var H = padding * 2 + textH + 120;
  canvas.width = W;
  canvas.height = H;

  // 背景
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // 内边框
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 18, 18, W - 36, H - 36, 24);
  ctx.stroke();

  // 顶部装饰线
  var grad = ctx.createLinearGradient(padding, 0, W - padding, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, theme.accent);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(padding + 40, 52);
  ctx.lineTo(W - padding - 40, 52);
  ctx.stroke();

  // 正文
  ctx.fillStyle = theme.ink;
  ctx.font = fontSize + 'px ' + theme.font;
  ctx.textBaseline = 'top';
  var y = padding + 20;
  lines.forEach(function (line) {
    ctx.fillText(line, padding, y);
    y += lineH;
  });

  // 落款
  var contact = (typeof getActiveContact === 'function') ? getActiveContact() : null;
  ctx.fillStyle = theme.sub;
  ctx.font = '26px ' + theme.font;
  var sign = '—— ' + (contact ? contact.name : '字卡传讯');
  ctx.fillText(sign, padding, y + 24);

  // 时间
  var d = new Date(msg.timestamp);
  var timeStr = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' + formatTimeHM(msg.timestamp);
  ctx.textAlign = 'right';
  ctx.fillText(timeStr, W - padding, y + 24);
  ctx.textAlign = 'left';

  // 底部
  ctx.fillStyle = theme.accent;
  ctx.font = '20px ' + theme.font;
  ctx.fillText('✦ 字卡传讯', padding, H - padding + 14);

  canvas.toBlob(function (blob) {
    var file = new File([blob], 'zikka-' + msg.id + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: '字卡' }).catch(function () {});
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('字卡图片已保存');
  }, 'image/png');
}

function wrapText(ctx, text, maxWidth) {
  var lines = [];
  String(text).split('\n').forEach(function (raw) {
    var line = '';
    for (var i = 0; i < raw.length; i++) {
      var test = line + raw[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = raw[i];
      } else {
        line = test;
      }
    }
    lines.push(line);
  });
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
