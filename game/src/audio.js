// Audio: fully synthesised WebAudio sounds for Sky Courier. No audio files, no network.
// Engine hum follows throttle and speed; ring chime, landing arpeggio and crash thud are
// short oscillator/noise envelopes built on first user gesture.
export function createAudio() {
  let ctx = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windSource = null;
  let muted = false;
  let started = false;

  function ensureContext() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    // Engine: two detuned saws through a low-pass filter.
    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 52;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 26;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc1.start();
    engineOsc2.start();
    // Wind: looped noise buffer through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSource.start();
    started = true;
    return true;
  }

  function unlock() {
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 900;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
  }

  function setEngine(throttle, speed, flying) {
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    const target = muted ? 0 : (flying ? 0.05 + throttle * 0.11 : 0.015);
    engineGain.gain.setTargetAtTime(target, t, 0.12);
    const base = 46 + throttle * 42 + speed * 0.35;
    engineOsc1.frequency.setTargetAtTime(base, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(base * 0.5 + 1.5, t, 0.1);
    engineFilter.frequency.setTargetAtTime(320 + throttle * 900 + speed * 6, t, 0.15);
    const windTarget = muted ? 0 : (flying ? Math.min(0.09, speed * 0.0011) : 0);
    windGain.gain.setTargetAtTime(windTarget, t, 0.2);
  }

  function ring() {
    tone(880, 0.35, 'sine', 0.22, 0);
    tone(1318, 0.5, 'sine', 0.18, 0.07);
  }

  function crash() {
    noiseBurst(0.7, 0.6, 700);
    tone(70, 0.8, 'sine', 0.4, 0);
    tone(48, 1.0, 'triangle', 0.3, 0.05);
  }

  function land() {
    tone(523, 0.3, 'triangle', 0.2, 0);
    tone(659, 0.3, 'triangle', 0.2, 0.12);
    tone(784, 0.45, 'triangle', 0.22, 0.24);
    tone(1046, 0.6, 'sine', 0.18, 0.36);
  }

  function click() { tone(660, 0.09, 'sine', 0.12, 0); }

  function setMuted(m) {
    muted = !!m;
    if (ctx && engineGain) {
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.06, ctx.currentTime, 0.05);
      windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
  }

  return {
    unlock, setEngine, ring, crash, land, click, setMuted,
    muted: () => muted,
  };
}
