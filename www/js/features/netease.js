/* ============ 字卡传讯 · 网易云账号（扫码登录） ============ */
/*
 * 只在 Capacitor APK 内可用：
 *   - 网易云的 weapi 接口不接受跨域请求，浏览器预览会被 CORS 拦；
 *   - 登录态是 HttpOnly Cookie，网页 JS 读不到。
 * APK 里通过 CapacitorHttp 原生请求绕过 CORS，并手动保存 MUSIC_U。
 *
 * 登录使用扫码，不接触账号密码。接口参数用网易云公开的 weapi 规则加密：
 * AES-128-CBC 两层 + RSA(no padding) 加密随机密钥。
 */
(function (global) {
  'use strict';

  var KEY_ACC = 'neteaseAccount';
  var KEY_COOKIE = 'neteaseCookie';

  var PRESET_KEY = '0CoJUm6Qyw8W8jud';
  var IV = '0102030405060708';
  var PUB_KEY = '010001';
  var MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

  var _acc = Storage.get(KEY_ACC) || null;
  var _cookies = {};
  (function () {
    var saved = Storage.get(KEY_COOKIE);
    if (saved && typeof saved === 'object') { _cookies = saved; return; }
    if (typeof saved === 'string' && saved) {
      try { _cookies = JSON.parse(saved) || {}; } catch (e) { _cookies = {}; }
    }
  })();

  function base() { return global.__NETEASE_BASE__ || 'https://music.163.com'; }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---------- 原生请求 ----------
  function nativeHttp() {
    try {
      if (global.CapacitorHttp && typeof global.CapacitorHttp.post === 'function') return global.CapacitorHttp;
      var p = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.CapacitorHttp;
      if (p && typeof p.post === 'function') return p;
    } catch (e) {}
    return null;
  }

  function available() { return !!nativeHttp(); }

  function headerGet(headers, name) {
    if (!headers) return '';
    var low = String(name).toLowerCase();
    for (var k in headers) {
      if (String(k).toLowerCase() === low) return headers[k];
    }
    return '';
  }

  // ---------- Cookie ----------
  function saveCookies() { Storage.set(KEY_COOKIE, _cookies); }

  function absorbCookies(raw) {
    var list = Array.isArray(raw) ? raw : [String(raw || '')];
    var changed = false;
    list.forEach(function (line) {
      // 一行里可能有多个 cookie，且各自带 Path / HttpOnly 等属性
      var chunks = String(line || '').split(/,(?=\s*[A-Za-z_][\w-]*=)/);
      chunks.forEach(function (chunk) {
        chunk.split(';').forEach(function (pair) {
          var m = /^\s*([A-Za-z_][\w-]*)=([^;]*)\s*$/.exec(pair);
          if (!m) return;
          var k = m[1], v = m[2];
          if (k !== 'MUSIC_U' && k !== '__csrf' && k !== 'NMTID') return;
          if (!v) return;
          if (_cookies[k] !== v) { _cookies[k] = v; changed = true; }
        });
      });
    });
    if (changed) saveCookies();
  }

  function cookieHeader() {
    var parts = [];
    ['MUSIC_U', '__csrf', 'NMTID'].forEach(function (k) {
      if (_cookies[k]) parts.push(k + '=' + _cookies[k]);
    });
    return parts.join('; ');
  }

  function cookieValue(name) { return _cookies[name] || ''; }

  // 只要拿到 MUSIC_U 就说明账号已经登上了，昵称头像属于「资料」，可以慢慢补
  function loggedIn() { return !!_cookies.MUSIC_U; }

  // ---------- 请求 ----------
  function httpRequest(method, path, body) {
    var b = base();
    var headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': b + '/',
      'Origin': b,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };
    var cookie = cookieHeader();
    if (cookie) headers['Cookie'] = cookie;

    var ch = nativeHttp();
    if (ch) {
      var opts = {
        url: b + path,
        headers: headers,
        connectTimeout: 15000,
        readTimeout: 15000
      };
      if (body != null) opts.data = body;
      var fn = method === 'GET' ? ch.get : ch.post;
      if (typeof fn !== 'function') { opts.method = method; fn = ch.request; }
      return Promise.resolve(fn.call(ch, opts)).then(function (res) {
        absorbCookies(headerGet(res && res.headers, 'set-cookie'));
        var data = res && res.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) { data = null; }
        }
        return data || {};
      });
    }

    // 浏览器预览：仅用于开发期验证协议，登录态拿不到
    if (!global.__NETEASE_ALLOW_WEB__) return Promise.reject(new Error('native only'));
    var init = { method: method, headers: headers, credentials: 'omit' };
    if (body != null) init.body = body;
    return fetch(b + path, init).then(function (r) { return r.json(); });
  }

  function httpPost(path, body) { return httpRequest('POST', path, body); }

  // ---------- weapi 加密 ----------
  var SECRET_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function randSecret() {
    var s = '';
    for (var i = 0; i < 16; i++) s += SECRET_CHARS.charAt(Math.floor(Math.random() * SECRET_CHARS.length));
    return s;
  }

  function bufToB64(buf) {
    var bytes = new Uint8Array(buf);
    var str = '';
    var step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      str += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(str);
  }

  function aesB64(text, key) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(key), { name: 'AES-CBC' }, false, ['encrypt'])
      .then(function (k) {
        return crypto.subtle.encrypt({ name: 'AES-CBC', iv: enc.encode(IV) }, k, enc.encode(text));
      })
      .then(bufToB64);
  }

  // RSA 无填充：把倒序密钥塞进 128 字节，再做模幂
  function rsaEncrypt(text) {
    var reversed = String(text).split('').reverse().join('');
    var hex = '';
    for (var i = 0; i < reversed.length; i++) {
      hex += ('00' + reversed.charCodeAt(i).toString(16)).slice(-2);
    }
    var m = BigInt('0x' + MODULUS);
    var e = BigInt('0x' + PUB_KEY);
    var x = BigInt('0x' + hex) % m;
    var r = BigInt(1);
    while (e > BigInt(0)) {
      if (e & BigInt(1)) r = (r * x) % m;
      x = (x * x) % m;
      e >>= BigInt(1);
    }
    var out = r.toString(16);
    while (out.length < 256) out = '0' + out;
    return out;
  }

  function weapiBody(obj) {
    var secret = randSecret();
    return aesB64(JSON.stringify(obj), PRESET_KEY).then(function (once) {
      return aesB64(once, secret);
    }).then(function (params) {
      return 'params=' + encodeURIComponent(params) + '&encSecKey=' + encodeURIComponent(rsaEncrypt(secret));
    });
  }

  function api(path, data) {
    var csrf = cookieValue('__csrf') || '';
    var payload = {};
    var src = data || {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) payload[k] = src[k];
    }
    // csrf_token 要放进加密后的 body，放 query 网易云读不到，会被当成没有校验令牌
    if (csrf) payload.csrf_token = csrf;
    return weapiBody(payload).then(function (body) {
      var sep = path.indexOf('?') >= 0 ? '&' : '?';
      return httpPost(path + sep + 'csrf_token=' + encodeURIComponent(csrf), body);
    });
  }

  // ---------- 登录 ----------
  function startQr() {
    return api('/weapi/login/qrcode/unikey', { type: 1 }).then(function (d) {
      if (!d || d.code !== 200 || !d.unikey) throw new Error('unikey failed');
      return {
        key: d.unikey,
        url: 'https://music.163.com/login?codekey=' + d.unikey
      };
    });
  }

  // 个别接口会把 cookie 一并塞进响应体
  function absorbCookieField(d) {
    if (!d || typeof d !== 'object') return;
    var raw = d.cookie || d.cookies || '';
    if (typeof raw === 'string' && raw) absorbCookies(raw);
    if (Array.isArray(raw)) absorbCookies(raw);
  }

  function pollQrOnce(key) {
    return api('/weapi/login/qrcode/client/login', { key: key, type: 1 }).then(function (d) {
      absorbCookieField(d);
      var code = d && d.code;
      if (code === 803) return 'ok';
      if (code === 802) return 'scanned';
      if (code === 800) return 'expired';
      return 'waiting';
    });
  }

  function pollQr(key) {
    return pollQrOnce(key).then(function (st) {
      // 803 之后再补一次，有的账号 MUSIC_U 会晚一拍才下发
      if (st === 'ok' && !loggedIn()) {
        return delay(600).then(function () {
          return pollQrOnce(key).then(function () { return 'ok'; }, function () { return 'ok'; });
        });
      }
      return st;
    });
  }

  // ---------- 账号资料 ----------
  function saveAcc(acc) {
    if (!acc) return null;
    // 昵称/头像拿不到时别把上一条可用资料冲掉
    if (!acc.nickname && _acc && _acc.nickname) acc.nickname = _acc.nickname;
    if (!acc.avatar && _acc && _acc.avatar) acc.avatar = _acc.avatar;
    if (!acc.userId && _acc && _acc.userId) acc.userId = _acc.userId;
    _acc = acc;
    Storage.set(KEY_ACC, _acc);
    return _acc;
  }

  function accFrom(d) {
    if (!d || typeof d !== 'object') return null;
    var p = d.profile || (d.account && d.account.profile) || null;
    if (!p) return null;
    return {
      nickname: p.nickname || '',
      avatar: p.avatarUrl || p.avatar || '',
      userId: p.userId || (d.account && d.account.id) || '',
      vipType: p.vipType || 0
    };
  }

  function userDetail(id) {
    if (!id) return Promise.resolve(null);
    return httpRequest('GET', '/api/v1/user/detail/' + encodeURIComponent(id)).then(function (d) {
      var p = d && d.profile;
      if (!p) return null;
      return saveAcc({
        nickname: p.nickname || '',
        avatar: p.avatarUrl || '',
        userId: p.userId || id,
        vipType: p.vipType || 0
      });
    }).catch(function () { return null; });
  }

  // 明文接口：不做 weapi 加密和 csrf 校验，作为加密接口的兜底
  function fetchProfilePlain() {
    return httpRequest('GET', '/api/nuser/account/get').then(function (d) {
      var acc = accFrom(d);
      if (acc && acc.nickname) return saveAcc(acc);
      var id = (acc && acc.userId) || (d && d.account && d.account.id);
      if (id) {
        return userDetail(id).then(function (full) { return full || (acc ? saveAcc(acc) : null); });
      }
      return acc ? saveAcc(acc) : null;
    }).catch(function () { return null; });
  }

  function fetchProfile() {
    return api('/weapi/w/nuser/account/get', {}).then(function (d) {
      var acc = accFrom(d);
      if (acc) return saveAcc(acc);
      return fetchProfilePlain();
    }).catch(function () { return fetchProfilePlain(); });
  }

  // 刚登录时资料接口偶尔要等一会儿才认这个 session，失败就隔一会儿再试
  var _syncing = null;
  var _profileStale = false;
  function syncProfile(tries) {
    if (_syncing) return _syncing;
    if (!loggedIn()) return Promise.resolve(null);
    var left = typeof tries === 'number' ? tries : 3;
    function attempt(n) {
      return fetchProfile().then(function (acc) {
        if (acc) return acc;
        if (n <= 1 || !loggedIn()) return null;
        return delay(1200).then(function () { return attempt(n - 1); });
      });
    }
    _syncing = attempt(left).then(function (acc) {
      _syncing = null;
      _profileStale = !acc && loggedIn();
      return acc;
    }, function () {
      _syncing = null;
      _profileStale = loggedIn();
      return null;
    });
    return _syncing;
  }

  function profileStale() { return _profileStale; }

  // 已经登录但还没昵称头像时，静默补一次资料
  function warmProfile() {
    if (!loggedIn()) return Promise.resolve(null);
    if (_acc && _acc.nickname) return Promise.resolve(_acc);
    return syncProfile(1);
  }

  function logout() {
    _acc = null;
    _cookies = {};
    Storage.remove(KEY_ACC);
    Storage.remove(KEY_COOKIE);
  }

  function pickUrl(d) {
    var item = d && d.data && d.data[0];
    return (item && item.url) || '';
  }

  function songUrl(id) {
    if (!id || !_cookies.MUSIC_U) return Promise.resolve('');
    return api('/weapi/song/enhance/player/url/v1', {
      ids: '[' + id + ']',
      level: 'exhigh',
      encodeType: 'flac'
    }).then(function (d) {
      var u = pickUrl(d);
      if (u) return u;
      // 没有无损/高音质时退回标准音质
      return api('/weapi/song/enhance/player/url/v1', {
        ids: '[' + id + ']',
        level: 'standard',
        encodeType: 'mp3'
      }).then(pickUrl).catch(function () { return ''; });
    }).catch(function () { return ''; });
  }

  // ---------- 二维码 ----------
  function qrSvg(text) {
    try {
      if (typeof global.qrcode !== 'function') return '';
      var qr = global.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag(5, 2);
    } catch (e) {
      return '';
    }
  }

  global.NeteaseAccount = {
    available: available,
    account: function () { return _acc; },
    loggedIn: loggedIn,
    cookie: function () { return cookieHeader(); },
    startQr: startQr,
    pollQr: pollQr,
    fetchProfile: fetchProfile,
    syncProfile: syncProfile,
    warmProfile: warmProfile,
    profileStale: profileStale,
    logout: logout,
    songUrl: songUrl,
    qrSvg: qrSvg
  };
})(window);
