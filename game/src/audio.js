// Sound: synthesised with WebAudio only (no external files).
// The AudioContext is created lazily on the first user gesture so the
// browser allows it to start. All sounds are short and quiet by design.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function noise(dur, filterFreq, gain, type = 'bandpass') {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  const SHOTS = {
    p9: [900, 0.09, 0.5], vk47: [600, 0.12, 0.6], hornet: [1100, 0.07, 0.45],
    longshot: [300, 0.3, 0.8], breacher: [400, 0.22, 0.7],
  };

  return {
    unlock,
    shoot(id) {
      const s = SHOTS[id] || SHOTS.vk47;
      noise(s[1], s[0], s[2]);
      tone(120, 0.08, 0.25, 'sine', 50);
    },
    reload() { tone(500, 0.06, 0.15, 'square'); setTimeout(() => tone(700, 0.06, 0.15, 'square'), 120); },
    hit() { tone(1200, 0.05, 0.2, 'square'); },
    kill() { tone(900, 0.08, 0.25, 'square'); setTimeout(() => tone(1400, 0.1, 0.25, 'square'), 90); },
    hurt() { noise(0.15, 300, 0.4, 'lowpass'); tone(90, 0.15, 0.3, 'sine', 60); },
    plant() { tone(660, 0.1, 0.2, 'sine'); setTimeout(() => tone(880, 0.1, 0.2, 'sine'), 150); },
    defuse() { tone(880, 0.1, 0.2, 'sine'); setTimeout(() => tone(660, 0.1, 0.2, 'sine'), 150); },
    beep() { tone(1000, 0.07, 0.2, 'sine'); },
    explode() {
      noise(0.9, 200, 0.9, 'lowpass');
      tone(60, 0.8, 0.5, 'sine', 30);
    },
    roundWin() { tone(523, 0.15, 0.25); setTimeout(() => tone(659, 0.15, 0.25), 140); setTimeout(() => tone(784, 0.25, 0.25), 280); },
    roundLose() { tone(392, 0.2, 0.25); setTimeout(() => tone(311, 0.3, 0.25), 180); },
    buy() { tone(700, 0.05, 0.2, 'square'); setTimeout(() => tone(1000, 0.07, 0.2, 'square'), 70); },
    click() { tone(800, 0.04, 0.15, 'square'); },
    step() {},
  };
}
