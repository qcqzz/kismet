/* ============ 字卡传讯 · 音效（功能与规则对齐 chat 的"音效"） ============ */
/* 内置预设 = WebAudio 双振荡器合成；kakaotalk = 固定外链；自定义 = 用户 URL/上传的 dataURL */

var SFX_KAKAO_URL = 'https://image.uglycat.cc/jl5xf9.mp3';

var _sfxAudio = null;
var _sfxAudioCtx = null;

function stopCurrentSound() {
  try {
    if (_sfxAudio) {
      _sfxAudio.pause();
      _sfxAudio.currentTime = 0;
      _sfxAudio = null;
    }
    if (_sfxAudioCtx) {
      _sfxAudioCtx.close();
      _sfxAudioCtx = null;
    }
  } catch (e) {}
}
window.stopCurrentSound = stopCurrentSound;

/* type: my_send / partner_message / my_poke / partner_poke（兼容旧调用 send/message/poke）
   preview=true 时忽略"总开关"（供设置页试听） */
function playSound(type, preview) {
  try {
    if (!preview && !settings.soundEnabled) return;
    stopCurrentSound();

    var category = null;
    if (type === 'my_send' || type === 'send') category = 'my_send';
    else if (type === 'partner_message' || type === 'message') category = 'partner_message';
    else if (type === 'my_poke' || type === 'poke') category = 'my_poke';
    else if (type === 'partner_poke') category = 'partner_poke';
    if (!category) return;

    var presetKey = {
      my_send: 'mySendSoundPreset',
      partner_message: 'partnerMessageSoundPreset',
      my_poke: 'myPokeSoundPreset',
      partner_poke: 'partnerPokeSoundPreset'
    }[category];
    var customKey = {
      my_send: 'mySendCustomSoundUrl',
      partner_message: 'partnerMessageCustomSoundUrl',
      my_poke: 'myPokeCustomSoundUrl',
      partner_poke: 'partnerPokeCustomSoundUrl'
    }[category];

    var presetId = settings[presetKey] || 'tone_low';
    if (presetId === 'mute') return;

    var customUrl = String(settings[customKey] || '').trim();
    var url = (presetId === 'kakaotalk') ? SFX_KAKAO_URL : customUrl;

    // 有 URL（kakao / 自定义 / 上传）→ 直接播放音频文件
    if (url) {
      var audio = new Audio(url);
      audio.volume = Math.min(1, Math.max(0, settings.soundVolume || 0.15));
      _sfxAudio = audio;
      audio.play().catch(function () {});
      audio.addEventListener('ended', function () { _sfxAudio = null; });
      return;
    }

    // 内置合成（同 chat：两方基础音色 × 预设效果）
    var CATEGORY_BASE = {
      my_send: { osc1Type: 'triangle', osc2Type: 'sine', freq: 520, dur: 0.18, up: 1.06, down: 0.72 },
      partner_message: { osc1Type: 'triangle', osc2Type: 'sine', freq: 460, dur: 0.2, up: 1.04, down: 0.74 },
      my_poke: { osc1Type: 'sawtooth', osc2Type: 'triangle', freq: 400, dur: 0.16, up: 1.08, down: 0.76 },
      partner_poke: { osc1Type: 'sawtooth', osc2Type: 'triangle', freq: 380, dur: 0.16, up: 1.08, down: 0.76 }
    };
    var PRESET_EFFECTS = {
      tone_default: { osc1Type: 'triangle', osc2Type: 'sine', fMul: 0.92, durMul: 1.08, upMul: 1.0, downMul: 0.95 },
      tone_soft: { osc1Type: 'sine', osc2Type: 'triangle', fMul: 0.88, durMul: 1.15, upMul: 0.98, downMul: 0.92 },
      tone_low: { osc1Type: 'sawtooth', osc2Type: 'triangle', fMul: 0.78, durMul: 1.2, upMul: 0.96, downMul: 0.88 },
      tone_warm: { osc1Type: 'triangle', osc2Type: 'triangle', fMul: 0.84, durMul: 1.1, upMul: 0.98, downMul: 0.9 },
      tone_dark: { osc1Type: 'square', osc2Type: 'triangle', fMul: 0.72, durMul: 1.25, upMul: 0.95, downMul: 0.85 },
      tone_haze: { osc1Type: 'sine', osc2Type: 'square', fMul: 0.8, durMul: 1.18, upMul: 0.97, downMul: 0.9 }
    };

    var base = CATEGORY_BASE[category];
    var fx = PRESET_EFFECTS[presetId] || PRESET_EFFECTS.tone_default;
    var cfg = {
      osc1Type: fx.osc1Type || base.osc1Type,
      osc2Type: fx.osc2Type || base.osc2Type,
      freq: base.freq * (fx.fMul || 1),
      dur: base.dur * (fx.durMul || 1),
      up: base.up * (fx.upMul || 1),
      down: base.down * (fx.downMul || 1)
    };

    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var audioContext = new AC();
    _sfxAudioCtx = audioContext;
    var gainNode = audioContext.createGain();
    var vol = Math.min(0.55, Math.max(0.01, settings.soundVolume || 0.15));

    var osc1 = audioContext.createOscillator();
    var osc2 = audioContext.createOscillator();
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    var now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(vol, now);

    var jitter = (Math.random() - 0.5) * 0.02;
    var f1 = cfg.freq * (1 + jitter);
    var f2 = f1 * 2;

    osc1.type = cfg.osc1Type;
    osc2.type = cfg.osc2Type;
    osc1.frequency.setValueAtTime(f1, now);
    osc2.frequency.setValueAtTime(f2, now);
    osc1.frequency.exponentialRampToValueAtTime(f1 * cfg.up, now + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(f2 * (cfg.up - 0.03), now + 0.04);
    osc1.frequency.exponentialRampToValueAtTime(f1 * cfg.down, now + cfg.dur);
    osc2.frequency.exponentialRampToValueAtTime(f2 * cfg.down, now + cfg.dur);

    var end = now + cfg.dur;
    osc1.start(now);
    osc2.start(now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
    osc1.stop(end);
    osc2.stop(end);
    audioContext.addEventListener('statechange', function () {
      if (audioContext.state === 'closed') _sfxAudioCtx = null;
    });
  } catch (e) {
    console.warn('音效播放失败:', e);
  }
}
window.playSound = playSound;

/* 试听：把某类音效的当前配置（或指定预设）播一次，供设置页"试听"按钮 */
function previewSound(category, presetOverride, customUrlOverride) {
  var presetKey = {
    my_send: 'mySendSoundPreset',
    partner_message: 'partnerMessageSoundPreset',
    my_poke: 'myPokeSoundPreset',
    partner_poke: 'partnerPokeSoundPreset'
  }[category];
  if (!presetKey) return;
  var savedPreset = settings[presetKey];
  var savedCustom = settings[{
    my_send: 'mySendCustomSoundUrl',
    partner_message: 'partnerMessageCustomSoundUrl',
    my_poke: 'myPokeCustomSoundUrl',
    partner_poke: 'partnerPokeCustomSoundUrl'
  }[category]];
  if (presetOverride !== undefined) settings[presetKey] = presetOverride;
  if (customUrlOverride !== undefined) {
    settings[{
      my_send: 'mySendCustomSoundUrl',
      partner_message: 'partnerMessageCustomSoundUrl',
      my_poke: 'myPokeCustomSoundUrl',
      partner_poke: 'partnerPokeCustomSoundUrl'
    }[category]] = customUrlOverride;
  }
  playSound(category, true);   // 同步读取 settings，播完立即还原（不落盘）
  settings[presetKey] = savedPreset;
  settings[{
    my_send: 'mySendCustomSoundUrl',
    partner_message: 'partnerMessageCustomSoundUrl',
    my_poke: 'myPokeCustomSoundUrl',
    partner_poke: 'partnerPokeCustomSoundUrl'
  }[category]] = savedCustom;
}
window.previewSound = previewSound;
