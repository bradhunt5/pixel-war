'use strict';

/*
 * Adaptive background music for Pixel War, generated live with the Web
 * Audio API (no audio files). Music is built from layers that fade in as
 * the game's intensity rises:
 *   0 pad    - sustained chords, always on
 *   1 motion - arpeggio / ostinato, always on
 *   2 bass   - from intensity 0.3
 *   3 drums  - from intensity 0.55
 *   4 lead   - from intensity 0.8 (a semi-random melody)
 * Chords follow minor-key progressions that change every eight bars, and
 * the motion and lead parts are partly random, so it never loops exactly.
 */
(() => {
  const LAYER_ON = [0, 0, 0.3, 0.55, 0.8];
  const LAYER_VOL = [0.55, 0.5, 0.75, 0.8, 0.5];

  // Chord progressions in A minor, as MIDI root notes and chord tones.
  const PROGRESSIONS = [
    [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],   // Am F C G
    [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]],   // Am G F E
    [[50, 53, 57], [57, 60, 64], [52, 56, 59], [57, 60, 64]],   // Dm Am E Am
    [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],   // Am F Dm E
  ];
  const SCALE = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76];

  const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

  let ctx = null;
  let out = null;
  let duckGain = null;
  let layers = [];
  let style = 'chiptune';
  let intensity = 0.15;
  let playing = false;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let bar = 0;
  let progression = PROGRESSIONS[0];
  let leadNote = 64;
  let muted = false;
  let wanted = false;             // the game would like music playing

  try {
    muted = localStorage.getItem('pixelwar.musicMuted') === '1';
  } catch (e) {
    // Storage unavailable: music stays on.
  }

  // ---------- Instruments ----------

  // A note: oscillator(s) through an optional low-pass filter and envelope.
  function note(layer, { type = 'square', midi, at, dur, vol, attack = 0.005, release = 0.08,
    cutoff = 0, detune = 0, vibrato = 0 }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.setValueAtTime(vol, at + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let dest = g;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      f.connect(g);
      dest = f;
    }
    g.connect(layers[layer]);
    const voices = detune ? [-detune, detune] : [0];
    for (const cents of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiHz(midi);
      o.detune.value = cents;
      if (vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.value = vibrato;
        lfo.connect(depth).connect(o.detune);
        lfo.start(at);
        lfo.stop(at + dur + 0.05);
      }
      o.connect(dest);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  let noiseBuffer = null;
  function noise(layer, { at, dur, vol, cutoff = 8000, highpass = 0 }) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    let node = lp;
    if (highpass) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = highpass;
      lp.connect(hp);
      node = hp;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(lp);
    node.connect(g).connect(layers[layer]);
    src.start(at, Math.random() * 0.5, dur + 0.05);
  }

  function kick(layer, at, vol, from = 150, to = 45, dur = 0.25) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.8);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(layers[layer]);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // Pick the lead's next note: a small step through the scale, landing on a
  // chord tone on strong beats.
  function nextLead(chord, strong) {
    if (strong) {
      const tones = chord.map((m) => (m < 60 ? m + 12 : m));
      leadNote = tones.reduce((a, b) => (Math.abs(b - leadNote) < Math.abs(a - leadNote) ? b : a));
      return leadNote;
    }
    let k = SCALE.indexOf(leadNote);
    if (k < 0) k = 4;
    k = Math.max(0, Math.min(SCALE.length - 1, k + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    leadNote = SCALE[k];
    return leadNote;
  }

  // ---------- Styles ----------
  // Each style plays one sixteenth-note step: s is the step in the bar
  // (0-15), t its start time, q the length of a step, chord the bar's chord.

  const STYLES = {
    // Square-wave 8-bit: quick arpeggios and punchy noise drums.
    chiptune: {
      bpm: 116,
      step(s, t, q, chord) {
        if (s === 0) for (const m of chord) note(0, { type: 'triangle', midi: m, at: t, dur: q * 16, vol: 0.06, attack: 0.05, release: 0.4 });
        if (s % 2 === 0 && Math.random() > 0.12) {
          const m = chord[(s / 2) % 3] + 12 + (s % 8 === 6 ? 12 : 0);
          note(1, { type: 'square', midi: m, at: t, dur: q * 1.6, vol: 0.035 });
        }
        if ([0, 6, 8, 14].includes(s)) note(2, { type: 'triangle', midi: chord[0] - 12 + (s === 8 ? 12 : 0), at: t, dur: q * 2.2, vol: 0.2 });
        if (s % 8 === 0 || (s === 10 && intensity > 0.85)) kick(3, t, 0.5);
        if (s === 4 || s === 12) noise(3, { at: t, dur: 0.12, vol: 0.18, cutoff: 6000, highpass: 1500 });
        if (s % 2 === 1) noise(3, { at: t, dur: 0.035, vol: 0.06, cutoff: 12000, highpass: 7000 });
        if (s % 2 === 0 && Math.random() < 0.55) {
          note(4, { type: 'square', midi: nextLead(chord, s % 4 === 0), at: t, dur: q * 1.8, vol: 0.04, vibrato: 12 });
        }
      },
    },

    // Strategy-game tension: drones, string ostinato, timpani and brass.
    warroom: {
      bpm: 84,
      step(s, t, q, chord) {
        if (s === 0) {
          for (const m of chord) note(0, { type: 'sawtooth', midi: m - 12, at: t, dur: q * 16, vol: 0.035, attack: 0.6, release: 0.6, cutoff: 700, detune: 6 });
        }
        if (s % 2 === 0) {
          const m = (s % 4 === 0 ? chord[0] : chord[2]) - 12;
          note(1, { type: 'sawtooth', midi: m, at: t, dur: q * 1.7, vol: 0.05, attack: 0.02, cutoff: 1100 });
        }
        if (s === 0 || s === 8) note(2, { type: 'sine', midi: chord[0] - 24, at: t, dur: q * 7, vol: 0.3, attack: 0.03, release: 0.5 });
        if (s === 0 || s === 8 || (s === 14 && intensity > 0.7)) {
          kick(3, t, 0.7, 110, 55, 0.6);
          noise(3, { at: t, dur: 0.25, vol: 0.12, cutoff: 900 });
        }
        if (intensity > 0.85 && s >= 12) noise(3, { at: t, dur: 0.09, vol: 0.12, cutoff: 5000, highpass: 1200 });
        if (s % 8 === 0 && Math.random() < 0.8) {
          note(4, { type: 'sawtooth', midi: nextLead(chord, true), at: t, dur: q * 7, vol: 0.05, attack: 0.25, release: 0.4, cutoff: 1800, detune: 8, vibrato: 10 });
        }
      },
    },

    // Retro synth: detuned pads, pulsing bass and a four-on-the-floor beat.
    synthwave: {
      bpm: 100,
      step(s, t, q, chord) {
        if (s === 0) {
          for (const m of chord) note(0, { type: 'sawtooth', midi: m, at: t, dur: q * 16, vol: 0.03, attack: 0.4, release: 0.5, cutoff: 1800, detune: 12 });
        }
        if (Math.random() > 0.1) {
          const m = chord[s % 3] + 12;
          note(1, { type: 'square', midi: m, at: t, dur: q * 0.8, vol: 0.025, cutoff: 2600 });
        }
        if (s % 2 === 0) note(2, { type: 'sawtooth', midi: chord[0] - 12 + (s % 4 === 2 ? 12 : 0), at: t, dur: q * 1.6, vol: 0.09, cutoff: 900 });
        if (s % 4 === 0) kick(3, t, 0.55);
        if (s === 4 || s === 12) noise(3, { at: t, dur: 0.22, vol: 0.2, cutoff: 7000, highpass: 900 });
        if (s % 4 === 2) noise(3, { at: t, dur: 0.05, vol: 0.07, cutoff: 12000, highpass: 7000 });
        if (s % 4 === 0 && Math.random() < 0.7) {
          note(4, { type: 'sawtooth', midi: nextLead(chord, s % 8 === 0), at: t, dur: q * 3.5, vol: 0.035, attack: 0.03, cutoff: 3000, vibrato: 15 });
        }
      },
    },
  };

  // ---------- Scheduler ----------

  function setLayerLevels(smooth) {
    if (!ctx) return;
    layers.forEach((g, k) => {
      const target = intensity >= LAYER_ON[k] ? LAYER_VOL[k] : 0.0001;
      if (smooth) g.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
      else g.gain.setValueAtTime(target, ctx.currentTime);
    });
  }

  function schedule() {
    const def = STYLES[style];
    const q = 60 / def.bpm / 4;
    while (nextTime < ctx.currentTime + 0.2) {
      if (step === 0) {
        if (bar % 8 === 0 && bar > 0 && Math.random() < 0.6) {
          progression = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
        }
      }
      const chord = progression[bar % 4];
      try {
        def.step(step, nextTime, q, chord);
      } catch (e) {
        // A bad note must never stop the music or the game.
      }
      nextTime += q;
      step = (step + 1) % 16;
      if (step === 0) bar++;
    }
  }

  function begin(fade) {
    if (!ctx || playing || muted) return;
    playing = true;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fade);
    setLayerLevels(false);
    nextTime = ctx.currentTime + 0.1;
    step = 0;
    bar = 0;
    clearInterval(timer);
    timer = setInterval(schedule, 40);
  }

  function end(fade) {
    if (!ctx || !playing) return;
    playing = false;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
    setTimeout(() => {
      if (!playing) clearInterval(timer);
    }, fade * 1000 + 200);
  }

  window.PixelSound && window.PixelSound.whenReady((c, bus) => {
    ctx = c;
    out = ctx.createGain();
    out.gain.value = 0.0001;
    duckGain = ctx.createGain();
    out.connect(duckGain).connect(bus);
    layers = LAYER_ON.map(() => {
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(out);
      return g;
    });
    if (wanted) begin(2);
  });

  window.PixelMusic = {
    STYLES: Object.keys(STYLES),
    // Start (or keep) playing; fades in over a couple of seconds.
    play() {
      wanted = true;
      begin(2);
    },
    stop(fade = 1.5) {
      wanted = false;
      end(fade);
    },
    get playing() {
      return playing;
    },
    setStyle(name) {
      if (STYLES[name]) style = name;
    },
    get style() {
      return style;
    },
    // 0 (calm) to 1 (all-out war): layers fade in and out to match.
    setIntensity(v) {
      const next = Math.max(0, Math.min(1, v));
      if (Math.abs(next - intensity) < 0.01) return;
      intensity = next;
      setLayerLevels(true);
    },
    get intensity() {
      return intensity;
    },
    // Briefly drop the music under a big sound, such as a nuke.
    duck(seconds = 2.5, level = 0.25) {
      if (!ctx) return;
      const t = ctx.currentTime;
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setTargetAtTime(level, t, 0.05);
      duckGain.gain.setTargetAtTime(1, t + seconds, 0.15);
    },
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = !!value;
      try {
        localStorage.setItem('pixelwar.musicMuted', muted ? '1' : '0');
      } catch (e) {
        // Ignore.
      }
      if (muted) end(0.6);
      else if (wanted) begin(1.5);
    },
  };
})();
