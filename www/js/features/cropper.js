/* ============ 图片裁剪器（头像 / 封面 / 背景 / 照片墙 共用） ============ */
/* 固定比例取景框 + 拖动 + 缩放滑块 + 双指缩放。
   表情包、聊天发图、朋友圈动态图不走这里（前者要保透明，后者本来就自由比例）。

   用途预设的比例与输出尺寸见 CROP_PRESETS。                            */

var CROP_PRESETS = {
  avatar: { ratio: 1,     w: 480,  h: 480,  label: '头像' },      // 1:1 方图
  photo:  { ratio: 1,     w: 400,  h: 400,  label: '照片墙' },    // 1:1 方图
  cover:  { ratio: 16 / 9, w: 1200, h: 675,  label: '封面' },     // 16:9
  bg:     { ratio: 16 / 9, w: 1200, h: 675,  label: '背景' }      // 16:9
};

// 打开裁剪器。file 选好的原图，kind 取 CROP_PRESETS 的键，
// onDone(dataUrl) 在用户点「完成」后回调（取消则不回调）。
function openCropper(file, kind, onDone) {
  var preset = CROP_PRESETS[kind] || CROP_PRESETS.cover;
  var old = document.getElementById('cropper');
  if (old) old.remove();

  var img = new Image();
  var url = URL.createObjectURL(file);
  img.onload = function () { start(); };
  img.onerror = function () { URL.revokeObjectURL(url); toast('图片读取失败'); };
  img.src = url;

  function start() {
    // 取景框：按预设比例，在可用空间里取尽量大的尺寸
    var maxW = Math.min(window.innerWidth - 40, 460);
    var maxH = Math.min(window.innerHeight - 260, 420);
    var FW, FH;
    if (preset.ratio >= 1) { FW = maxW; FH = Math.round(FW / preset.ratio); }
    else { FH = maxH; FW = Math.round(FH * preset.ratio); }

    var mask = document.createElement('div');
    mask.className = 'modal-mask cropper-mask';
    mask.id = 'cropper';
    mask.innerHTML =
      '<div class="cropper">' +
        '<div class="cropper-t">' + escapeHtml(preset.label) + ' · ' +
          (preset.ratio === 1 ? '1:1' : '16:9') + '</div>' +
        '<div class="cropper-stage" id="cr-stage" ' +
          'style="width:' + FW + 'px;height:' + FH + 'px">' +
          '<img class="cropper-img" id="cr-img" alt="">' +
          '<div class="cropper-frame" id="cr-frame" ' +
            'style="width:' + FW + 'px;height:' + FH + 'px"></div>' +
        '</div>' +
        '<div class="cropper-bar">' +
          '<i class="fas fa-search-minus"></i>' +
          '<input type="range" id="cr-zoom" min="0" max="100" value="0">' +
          '<i class="fas fa-search-plus"></i>' +
        '</div>' +
        '<div class="cropper-btns">' +
          '<button class="env-cbtn" id="cr-cancel">取消</button>' +
          '<button class="env-cbtn primary" id="cr-ok">完成</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);

    var stage = mask.querySelector('#cr-stage');
    var el = mask.querySelector('#cr-img');
    var zoom = mask.querySelector('#cr-zoom');
    el.src = url;

    // 状态：scale 是图片绘制缩放，dx/dy 是图片左上角相对取景框左上角的偏移
    var s0 = Math.max(FW / img.width, FH / img.height);   // 刚好铺满
    var z = 1;
    var s = s0;
    var dx = 0, dy = 0;

    function clamp() {
      var w = img.width * s, h = img.height * s;
      // 图片必须始终盖住取景框，否则会出现空白
      dx = Math.min(0, Math.max(FW - w, dx));
      dy = Math.min(0, Math.max(FH - h, dy));
      if (w <= FW) dx = (FW - w) / 2;
      if (h <= FH) dy = (FH - h) / 2;
    }
    function apply() {
      el.style.width = (img.width * s) + 'px';
      el.style.height = (img.height * s) + 'px';
      el.style.left = dx + 'px';
      el.style.top = dy + 'px';
      zoom.value = Math.round((z - 1) / 3 * 100);
    }
    function setZoom(nz, anchor) {
      z = Math.max(1, Math.min(4, nz));
      var ns = s0 * z;
      if (anchor) {
        // 有锚点（双指/滚轮）：让锚点处的图块保持不动
        dx -= (ns - s) * (anchor.x - dx) / s;
        dy -= (ns - s) * (anchor.y - dy) / s;
      } else {
        // 无锚点（滑块）：图片中心始终对准取景框中心，
        // 这样缩回最小倍率时会重新居中，而不是贴在某一侧
        dx = FW / 2 - (img.width * ns) / 2;
        dy = FH / 2 - (img.height * ns) / 2;
      }
      s = ns;
      clamp(); apply();
    }
    // 初始也居中
    s = s0;
    dx = FW / 2 - (img.width * s) / 2;
    dy = FH / 2 - (img.height * s) / 2;
    clamp(); apply();

    // ---- 拖动（鼠标 + 单指）----
    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    function onDown(e) {
      dragging = true;
      var p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY; ox = dx; oy = dy;
    }
    function onMove(e) {
      if (!dragging) return;
      var p = e.touches ? e.touches[0] : e;
      dx = ox + (p.clientX - sx);
      dy = oy + (p.clientY - sy);
      clamp(); apply();
      if (e.cancelable) e.preventDefault();
    }
    function onUp() { dragging = false; }
    stage.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    stage.addEventListener('touchstart', onDown, { passive: true });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onUp);

    // ---- 双指缩放 ----
    var pinch0 = 0, z0 = 1;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 2) return;
      pinch0 = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      ) || 1;
      z0 = z;
      dragging = false;
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2) return;
      var d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      ) || 1;
      var r = stage.getBoundingClientRect();
      var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left - FW / 2;
      var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top - FH / 2;
      setZoom(z0 * (d / pinch0), { x: cx, y: cy });
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    stage.addEventListener('touchend', function (e) {
      if (e.touches.length === 0) dragging = false;
    });

    // 滚轮缩放（桌面）
    stage.addEventListener('wheel', function (e) {
      var r = stage.getBoundingClientRect();
      setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), {
        x: e.clientX - r.left - FW / 2,
        y: e.clientY - r.top - FH / 2
      });
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    zoom.addEventListener('input', function () {
      setZoom(1 + Number(zoom.value) / 100 * 3);
    });

    // ---- 输出 ----
    function finish() {
      var out = document.createElement('canvas');
      out.width = preset.w; out.height = preset.h;
      var ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      // 取景框在原图上对应的源矩形
      var sx = -dx / s, sy = -dy / s, sw = FW / s, sh = FH / s;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, preset.w, preset.h);
      URL.revokeObjectURL(url);
      cleanup();
      onDone(out.toDataURL('image/jpeg', 0.85));
    }
    function cancel() { URL.revokeObjectURL(url); cleanup(); }
    function cleanup() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      mask.remove();
    }
    mask.querySelector('#cr-ok').addEventListener('click', finish);
    mask.querySelector('#cr-cancel').addEventListener('click', cancel);
    mask.addEventListener('click', function (e) { if (e.target === mask) cancel(); });
  }
}

// 便捷入口：选文件 → 裁剪 → 回调。files 可以是 File 数组（逐张裁剪）。
// 目前各调用点都自己处理了文件选择与队列，这里保留作为通用入口。
function pickAndCrop(files, kind, onEach) {
  var list = Array.prototype.slice.call(files || []);
  if (!list.length) return;
  var i = 0;
  (function next() {
    if (i >= list.length) return;
    var f = list[i++];
    if (typeof MAX_IMAGE_SIZE !== 'undefined' && f.size > MAX_IMAGE_SIZE) { toast('图片请小于 5MB'); return next(); }
    openCropper(f, kind, function (url) {
      onEach(url, f);
      next();
    });
  })();
}
window.pickAndCrop = pickAndCrop;
