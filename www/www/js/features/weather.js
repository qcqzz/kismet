/* ============ 字卡传讯 · 真实天气（Open-Meteo 免费接口，无需 Key） ============ */

var WEATHER_REFRESH_MS = 30 * 60 * 1000; // 30 分钟自动刷新一次

function initWeather() {
  if (!settings.weatherCity) return;
  var fresh = weatherNow && weatherNow.updatedAt &&
    (Date.now() - weatherNow.updatedAt < WEATHER_REFRESH_MS);
  if (!fresh) refreshWeather(false);
}

// force=true：用户手动点天气（即使缓存新鲜也刷新，并提示结果）
function refreshWeather(force) {
  var city = (settings.weatherCity || '').trim();
  if (!city) {
    if (force) promptWeatherCity();
    return;
  }
  if (!force && weatherNow && weatherNow.updatedAt &&
      (Date.now() - weatherNow.updatedAt < WEATHER_REFRESH_MS)) {
    return;
  }

  // 第一步：地理编码，城市名 → 经纬度
  var geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
    encodeURIComponent(city) + '&count=1&language=zh&format=json';

  fetch(geoUrl)
    .then(function (r) { return r.json(); })
    .then(function (geo) {
      if (!geo.results || !geo.results.length) throw new Error('找不到城市：' + city);
      var loc = geo.results[0];
      var fcUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude +
        '&longitude=' + loc.longitude + '&current=temperature_2m,weather_code';
      return fetch(fcUrl).then(function (r) { return r.json(); }).then(function (fc) {
        var code = fc.current.weather_code;
        weatherNow = {
          city: loc.name,
          temp: Math.round(fc.current.temperature_2m),
          code: code,
          desc: WEATHER_CODES[code] || '未知',
          icon: weatherIconFor(code),
          updatedAt: Date.now()
        };
        saveData();
        renderWeatherCell();
        if (force) toast(loc.name + ' ' + weatherNow.temp + '° ' + weatherNow.desc);
      });
    })
    .catch(function (e) {
      console.warn('天气获取失败:', e.message);
      if (force) toast(weatherNow ? '网络不好，显示上次天气' : '天气获取失败，检查网络或城市名');
      renderWeatherCell();
    });
}

function weatherIconFor(code) {
  if (code === 0 || code === 1) return WEATHER_ICONS.sunny;
  if (code === 2) return WEATHER_ICONS.cloudy;
  if (code === 3) return WEATHER_ICONS.overcast;
  if (code === 45 || code === 48) return WEATHER_ICONS.fog;
  if (code >= 51 && code <= 67) return WEATHER_ICONS.rain;
  if (code >= 71 && code <= 77) return WEATHER_ICONS.snow;
  if (code >= 80 && code <= 82) return WEATHER_ICONS.rain;
  if (code >= 85 && code <= 86) return WEATHER_ICONS.snow;
  if (code >= 95) return WEATHER_ICONS.storm;
  return WEATHER_ICONS.cloudy;
}

function promptWeatherCity() {
  promptModal('天气城市', '输入城市名（如：上海 / 东京 / Paris）', settings.weatherCity || '', function (v) {
    settings.weatherCity = v;
    saveData();
    refreshWeather(true);
  });
}

// 更新主页上的天气格（在 home.js 渲染后调用，DOM 不存在时静默跳过）
function renderWeatherCell() {
  var el = document.getElementById('pc-weather');
  if (!el) return;
  el.innerHTML = weatherCellHtml();
}

function weatherCellHtml() {
  if (!settings.weatherCity) {
    return '<span style="color:var(--ink-3)">未设置城市 ›</span>';
  }
  if (!weatherNow) {
    return escapeHtml(settings.weatherCity) + ' · 获取中…';
  }
  return '<b>' + weatherNow.temp + '°</b>' +
    escapeHtml(weatherNow.icon + ' ' + weatherNow.desc);
}
