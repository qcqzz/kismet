/* ============ 字卡传讯 · 真音乐播放器（音频存 IndexedDB） ============ */

// ---- IndexedDB 小封装：存音频 Blob ----
var AudioStore = {
  db: null,
  open: function () {
    if (AudioStore.db) return Promise.resolve(AudioStore.db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('kismet_audio', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks');
      };
      req.onsuccess = function () { AudioStore.db = req.result; resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  },
  put: function (id, blob) {
    return AudioStore.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('tracks', 'readwrite');
        tx.objectStore('tracks').put(blob, id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  },
  get: function (id) {
    return AudioStore.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('tracks').objectStore('tracks').get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  },
  del: function (id) {
    return AudioStore.open().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('tracks', 'readwrite');
        tx.objectStore('tracks').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); }; // 删除失败不阻塞
      });
    });
  }
};

// ---- 播放器 ----
var Player = {
  audio: null,        // 单例 Audio，同一时刻只播一条
  url: null,          // 当前 objectURL
  playingId: null,    // 正在播放的 track id

  toggle: function (trackId) {
    if (Player.playingId === trackId && Player.audio && !Player.audio.paused) {
      Player.pause();
      return;
    }
    Player.play(trackId);
  },

  play: function (trackId) {
    var track = musicTracks.find(function (t) { return t.id === trackId; });
    if (!track) return;
    if (!track.hasAudio) {
      toast('这条还没有音频：点 ⋯ → 上传音频');
      return;
    }
    AudioStore.get(trackId).then(function (blob) {
      if (!blob) {
        track.hasAudio = false;
        saveData();
        renderHome();
        toast('音频文件丢失，请重新上传');
        return;
      }
      Player.stopInternal();
      Player.url = URL.createObjectURL(blob);
      Player.audio = new Audio(Player.url);
      Player.playingId = trackId;
      Player.audio.play().catch(function () { toast('播放失败'); });
      Player.audio.onended = function () { Player.stopInternal(); renderHome(); };
      renderHome();
    }).catch(function () { toast('读取音频失败'); });
  },

  pause: function () {
    if (Player.audio) Player.audio.pause();
    Player.playingId = null;
    renderHome();
  },

  stopInternal: function () {
    if (Player.audio) {
      Player.audio.pause();
      Player.audio.onended = null;
      Player.audio = null;
    }
    if (Player.url) { URL.revokeObjectURL(Player.url); Player.url = null; }
    Player.playingId = null;
  },

  stopAll: function () {   // 切走页面时不必停，但删除曲目时要调
    Player.stopInternal();
  }
};

// ---- 音乐条编辑 ----
function openTrackSheet(trackId) {
  var track = musicTracks.find(function (t) { return t.id === trackId; });
  if (!track) return;
  showSheet('♪ ' + track.name, [
    { label: '<i class="fas fa-pen"></i> 改名字', act: 'rename' },
    { label: '<i class="fas fa-comment"></i> 改歌词行', act: 'lyric' },
    { label: '<i class="fas fa-music"></i> 上传音频（' + (track.hasAudio ? '已上传，可替换' : '未上传') + '）', act: 'audio' },
    { label: '<i class="fas fa-trash-alt"></i> 删除这条', act: 'del', danger: true },
    { label: '取消', act: 'cancel', cancel: true }
  ], function (act) {
    if (act === 'rename') {
      promptModal('改名字', '给这条音乐起个名字', track.name, function (v) {
        track.name = v; saveData(); renderHome();
      });
    } else if (act === 'lyric') {
      confirmModal('歌词行', '显示在名字下方的一行字', function (v) {
        track.lyric = (v || '').trim(); saveData(); renderHome();
      }, { textarea: track.lyric || '' });
    } else if (act === 'audio') {
      uploadTrackAudio(track);
    } else if (act === 'del') {
      confirmModal('删除', '将删除「' + track.name + '」及其音频，确定吗？', function () {
        if (Player.playingId === track.id) Player.stopAll();
        AudioStore.del(track.id);
        musicTracks = musicTracks.filter(function (t) { return t.id !== track.id; });
        saveData();
        renderHome();
        toast('已删除');
      }, { danger: true });
    }
  });
}

function uploadTrackAudio(track) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    AudioStore.put(track.id, file).then(function () {
      track.hasAudio = true;
      saveData();
      renderHome();
      toast('已上传，点 ▶ 播放');
    }).catch(function () { toast('上传失败（存储空间不足？）'); });
  };
  input.click();
}

function addMusicTrack() {
  promptModal('添加音乐', '起个名字（如：daddy）', '', function (v) {
    if (!v) return;
    musicTracks.push({
      id: 'trk_' + Date.now(),
      name: v,
      lyric: '',
      hasAudio: false
    });
    saveData();
    renderHome();
    toast('已添加，点 ⋯ 上传音频');
  });
}
