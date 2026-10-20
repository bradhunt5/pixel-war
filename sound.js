'use strict';

/*
 * Sound effects for Pixel War, synthesised with the Web Audio API so there
 * are no audio files to download. Browsers only allow sound after the
 * player has touched the page, so the audio context starts on first input.
 */
(() => {
  let ctx = null;
  let master = null;
  let musicBus = null;            // music has its own volume, under the effects
  const unlockWaiters = [];
  // The bus the sound being played right now goes through (volume and pan).
  let bus = null;
  let muted = false;
  const lastPlayed = {};

  try {
    muted = localStorage.getItem('pixelwar.muted') === '1';
  } catch (e) {
    // Storage unavailable: sound stays on.
  }

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // A compressor lets the big explosions be loud without harsh clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(comp);
    for (const fn of unlockWaiters.splice(0)) fn(ctx, musicBus);
  }
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true });

  // A pitched note: oscillator shape, start/end frequency, length, volume,
  // optional delay and output node (defaults to the master bus).
  function tone(type, f0, f1, dur, vol, delay = 0, out = bus) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered white noise for explosions and splashes.
  function noise(dur, vol, cutoff, delay = 0, out = bus) {
    const t = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff / 8), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  }

  // Soft-clipping distortion, for a gritty, overdriven boom.
  function distortion(amount) {
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount);
    }
    shaper.curve = curve;
    shaper.connect(bus);
    setTimeout(() => shaper.disconnect(), 5000);
    return shaper;
  }

  // A decaying echo, so the blast rolls around like it's off the hills.
  function echoBus(delayTime, feedback) {
    const input = ctx.createGain();
    const delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    delay.delayTime.value = delayTime;
    fb.gain.value = feedback;
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    input.connect(bus);
    input.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(bus);
    // Tear the loop down once the echoes have died away.
    setTimeout(() => [input, delay, fb, lp].forEach((n) => n.disconnect()), 8000);
    return input;
  }

  // One blast of a military klaxon: two clashing horn tones with a fast
  // buzz, pitched in the range small phone and laptop speakers play well.
  function klaxon(at, dur) {
    const t = ctx.currentTime + at;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
    out.gain.setValueAtTime(0.32, t + dur - 0.06);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 1100;
    tone.Q.value = 0.6;
    out.connect(tone).connect(bus);

    // The buzz: a fast wobble on the volume, like a horn's vibrating reed.
    const buzz = ctx.createOscillator();
    const buzzDepth = ctx.createGain();
    buzz.type = 'square';
    buzz.frequency.value = 34;
    buzzDepth.gain.value = 0.35;
    buzz.connect(buzzDepth).connect(out.gain);
    buzz.start(t);
    buzz.stop(t + dur);

    for (const [f, type] of [[466, 'sawtooth'], [554, 'square'], [233, 'sawtooth']]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      // A slight upward bend at the start, as the horn spins up.
      osc.frequency.setValueAtTime(f * 0.86, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const g = ctx.createGain();
      g.gain.value = type === 'square' ? 0.25 : 0.4;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    setTimeout(() => [out, tone, buzzDepth].forEach((n) => n.disconnect()), (at + dur + 0.3) * 1000);
  }

  const SOUNDS = {
    tap: () => tone('square', 660, 880, 0.06, 0.08),
    // Sending troops happens constantly, so it's just a soft, short tick.
    attack: () => tone('sine', 520, 430, 0.035, 0.035),
    error: () => tone('sine', 240, 190, 0.07, 0.04),
    boat: () => {
      tone('sawtooth', 150, 140, 0.45, 0.09);
      tone('sawtooth', 190, 180, 0.45, 0.06);
    },
    build: () => {
      tone('triangle', 523, 523, 0.1, 0.18);
      tone('triangle', 784, 784, 0.16, 0.18, 0.08);
    },
    upgrade: () => [523, 659, 784, 1047].forEach((f, k) => tone('triangle', f, f, 0.12, 0.16, k * 0.07)),
    spawn: () => [392, 523, 659].forEach((f, k) => tone('triangle', f, f, 0.18, 0.15, k * 0.1)),
    // Artillery: the gun firing, and the shell landing.
    cannon: () => {
      noise(0.07, 0.6, 7000);                       // the crack of the charge
      tone('sine', 140, 38, 0.45, 0.75);            // the deep thump
      noise(0.5, 0.45, 900, 0.02);                  // the roar of the muzzle blast
    },
    shell: () => {
      const dirt = distortion(2.5);
      noise(0.09, 0.7, 6000);                       // the hit
      tone('sine', 110, 30, 0.55, 0.8, 0, dirt);    // the thud, overdriven
      noise(0.8, 0.6, 1600, 0.02);                  // the blast
      noise(1.0, 0.25, 300, 0.25);                  // earth falling back
    },
    blast: () => {
      noise(0.5, 0.4, 1400);
      tone('sine', 120, 40, 0.4, 0.3);
    },
    // DEFCON 1: two short klaxon blasts.
    siren: () => {
      klaxon(0, 0.5);
      klaxon(0.7, 0.5);
    },
    nuke: () => {
      const echo = echoBus(0.28, 0.42);
      const dirt = distortion(4);
      noise(0.18, 1.0, 9000, 0, echo);             // the crack
      tone('sine', 85, 18, 2.6, 0.9, 0, dirt);     // the boom, overdriven
      tone('triangle', 55, 22, 3.2, 0.6, 0.02);    // sub-bass weight
      noise(3.6, 0.85, 1400, 0.05, echo);          // the rolling rumble
      noise(1.4, 0.6, 500, 0.4, echo);             // the shockwave arriving
      noise(2.5, 0.35, 250, 1.2);                  // debris settling
    },
    // The Tsar Bomba: a longer, deeper, heavier nuke with a second shockwave.
    tsar: () => {
      const echo = echoBus(0.4, 0.5);
      const dirt = distortion(6);
      noise(0.25, 1.0, 9000, 0, echo);
      tone('sine', 70, 14, 4, 1.0, 0, dirt);
      tone('triangle', 45, 18, 4.5, 0.7, 0.03);
      noise(5.5, 0.9, 1200, 0.05, echo);
      noise(2, 0.75, 450, 0.9, echo);              // the second shockwave
      noise(4, 0.4, 220, 2);
    },
    // A SAM interceptor blowing up its target in mid-air: a deep, echoing
    // boom (a smaller cousin of the nuke).
    intercept: () => {
      const echo = echoBus(0.22, 0.35);
      const dirt = distortion(3);
      noise(0.1, 0.75, 6000, 0, echo);             // the crack of the warhead
      tone('sine', 110, 26, 1.1, 0.9, 0, dirt);    // the boom, overdriven
      tone('triangle', 60, 24, 1.3, 0.45, 0.02);   // sub-bass weight
      noise(1.6, 0.6, 1000, 0.03, echo);           // the rolling rumble
      noise(1.2, 0.3, 300, 0.35);                  // debris falling away
    },
    // A SAM firing its interceptor: a rising rocket whoosh.
    samLaunch: () => {
      noise(0.08, 0.5, 5000);
      tone('sawtooth', 260, 1500, 0.5, 0.06);
      noise(0.7, 0.45, 3200, 0.02);
    },
    // An aircraft passing overhead.
    plane: () => {
      noise(1.6, 0.3, 700);
      tone('sawtooth', 110, 95, 1.6, 0.05);
    },
    // Picking up a supply crate: a bright, happy arpeggio.
    crate: () => [659, 784, 988, 1319].forEach((f, k) => tone('square', f, f, 0.09, 0.07, k * 0.06)),
    fallen: () => [659, 523, 392].forEach((f, k) => tone('triangle', f, f, 0.16, 0.14, k * 0.11)),
    victory: () => [523, 659, 784, 1047, 784, 1047].forEach((f, k) =>
      tone('square', f, f, k === 5 ? 0.5 : 0.14, 0.1, k * 0.13)),
    defeat: () => [392, 349, 311, 262].forEach((f, k) => tone('triangle', f, f, k === 3 ? 0.6 : 0.22, 0.16, k * 0.22)),
  };

  // Shortest gap between repeats, so a barrage doesn't become a roar.
  const MIN_GAP = { cannon: 0.08, shell: 0.1, blast: 0.15, tap: 0.04 };

  window.PixelSound = {
    // opts.vol (0-1) and opts.pan (-1 left to 1 right) place the sound in
    // the world: the game passes them for things happening on the map.
    play(name, opts = {}) {
      if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
      const now = ctx.currentTime;
      if (now - (lastPlayed[name] || -1) < (MIN_GAP[name] || 0.03)) return;
      lastPlayed[name] = now;
      try {
        const vol = opts.vol === undefined ? 1 : opts.vol;
        const gain = ctx.createGain();
        gain.gain.value = vol;
        let out = gain;
        if (opts.pan && ctx.createStereoPanner) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
          gain.connect(panner);
          out = panner;
        }
        out.connect(master);
        bus = gain;
        SOUNDS[name]();
        bus = master;
        // Let the per-sound bus go once its longest tail (the nuke) is done.
        setTimeout(() => out.disconnect(), 9000);
      } catch (e) {
        // A failed sound must never break the game.
      }
    },
    get muted() {
      return muted;
    },
    // For the music engine: call fn(ctx, musicBus) once audio is unlocked.
    whenReady(fn) {
      if (ctx) fn(ctx, musicBus);
      else unlockWaiters.push(fn);
    },
    setMuted(value) {
      muted = !!value;
      try {
        localStorage.setItem('pixelwar.muted', muted ? '1' : '0');
      } catch (e) {
        // Ignore.
      }
    },
  };
})();
