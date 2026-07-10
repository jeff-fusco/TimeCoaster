// Audio: fully procedural WebAudio — no asset files to ship, no licensing, works
// offline. SFX are short synth blips in the game's friendly register; music is a
// slow ambient pad that drifts through a warm chord. Everything is null-safe and
// silent until unlock() runs from a real user gesture (browsers require it), so
// calling play() before that (or in tests, where there is no AudioContext) is a
// harmless no-op.
//
// Volumes live in their own persisted settings blob, separate from the save.

const SETTINGS_KEY = 'tc3d_audio';
const DEFAULTS = { master: 0.8, music: 0.35, sfx: 0.7, muted: false };
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export function loadAudioSettings(storage) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      master: clamp01(parsed.master ?? DEFAULTS.master),
      music: clamp01(parsed.music ?? DEFAULTS.music),
      sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
      muted: !!parsed.muted,
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function saveAudioSettings(storage, settings) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}

// SFX recipes: [ { type, freq, freqEnd, dur, gain, attack } ] partials, mixed.
const A = 440;
const semis = n => A * Math.pow(2, n / 12);
const SFX = {
  ui:       [{ type: 'triangle', freq: semis(7), dur: 0.06, gain: 0.25 }],
  buy:      [{ type: 'triangle', freq: semis(4), dur: 0.09, gain: 0.3 }, { type: 'sine', freq: semis(11), freqEnd: semis(16), dur: 0.14, gain: 0.22 }],
  coin:     [{ type: 'square', freq: semis(12), dur: 0.05, gain: 0.16 }, { type: 'square', freq: semis(19), dur: 0.08, gain: 0.13 }],
  dispatch: [{ type: 'sine', freq: semis(0), freqEnd: semis(7), dur: 0.3, gain: 0.3 }, { type: 'triangle', freq: semis(7), dur: 0.34, gain: 0.2 }],
  research: [{ type: 'sine', freq: semis(4), dur: 0.5, gain: 0.28 }, { type: 'sine', freq: semis(9), dur: 0.5, gain: 0.24 }, { type: 'sine', freq: semis(16), dur: 0.55, gain: 0.2 }],
  land:     [{ type: 'triangle', freq: semis(-5), freqEnd: semis(2), dur: 0.28, gain: 0.32 }],
  place:    [{ type: 'sine', freq: semis(9), dur: 0.07, gain: 0.22 }],
  error:    [{ type: 'sawtooth', freq: semis(-2), freqEnd: semis(-6), dur: 0.16, gain: 0.18 }],
  fanfare:  [{ type: 'triangle', freq: semis(0), dur: 0.5, gain: 0.3 }, { type: 'triangle', freq: semis(7), dur: 0.5, gain: 0.26, delay: 0.12 }, { type: 'triangle', freq: semis(12), dur: 0.6, gain: 0.24, delay: 0.24 }],
};

// slow ambient pad: a lazy arpeggio over a warm major-9 chord
const MUSIC_CHORD = [semis(-12), semis(-5), semis(0), semis(4), semis(7), semis(11)];
const MUSIC_STEP = 3.4; // seconds between pad notes

export function createAudio(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let settings = loadAudioSettings(storage);
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let musicTimer = null;
  let musicIdx = 0;

  function applyGains() {
    if (!ctx) return;
    const m = settings.muted ? 0 : settings.master;
    masterGain.gain.setTargetAtTime(m, ctx.currentTime, 0.02);
    musicGain.gain.setTargetAtTime(settings.music, ctx.currentTime, 0.02);
    sfxGain.gain.setTargetAtTime(settings.sfx, ctx.currentTime, 0.02);
  }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      masterGain = ctx.createGain();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      applyGains();
    } catch (_) { ctx = null; }
  }

  function play(name) {
    if (!ctx || settings.muted || settings.master <= 0 || settings.sfx <= 0) return;
    const recipe = SFX[name];
    if (!recipe) return;
    const now = ctx.currentTime;
    for (const p of recipe) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = p.type;
      const t0 = now + (p.delay || 0);
      osc.frequency.setValueAtTime(p.freq, t0);
      if (p.freqEnd) osc.frequency.exponentialRampToValueAtTime(p.freqEnd, t0 + p.dur);
      const atk = p.attack ?? 0.005;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(p.gain, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(t0);
      osc.stop(t0 + p.dur + 0.02);
    }
  }

  function padNote() {
    if (!ctx || settings.muted || settings.music <= 0) return;
    const freq = MUSIC_CHORD[musicIdx % MUSIC_CHORD.length];
    musicIdx = (musicIdx + 1 + Math.floor(Math.random() * 2)) % MUSIC_CHORD.length;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    osc.type = 'sine';
    osc.frequency.value = freq;
    const dur = MUSIC_STEP * 1.6;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(filt);
    filt.connect(g);
    g.connect(musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    padNote();
    musicTimer = setInterval(padNote, MUSIC_STEP * 1000);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function set(key, value) {
    if (key === 'muted') settings.muted = !!value;
    else if (key in settings) settings[key] = clamp01(value);
    saveAudioSettings(storage, settings);
    applyGains();
    if (key === 'music' || key === 'muted') {
      if (settings.muted || settings.music <= 0) stopMusic();
      else if (ctx) startMusic();
    }
  }

  return {
    unlock,
    play,
    startMusic,
    stopMusic,
    set,
    get: () => ({ ...settings }),
    isMuted: () => settings.muted,
  };
}
