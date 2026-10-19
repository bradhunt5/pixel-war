'use strict';

/*
 * Pixel War: a territory-conquest game for touch screens.
 *
 * The map is a grid of cells. Every faction's troop pool grows over time
 * (faster with more land) and troops are spent to capture neighbouring
 * cells. An attack eats into the border shared with its target, nearest to
 * the point the attacker aimed at first. The last faction standing wins.
 */
(() => {
  const WATER = -2;
  const NEUTRAL = -1;
  const TICK = 0.1;             // seconds of game time per simulation step
  const TARGET_CELLS = 16000;   // approximate number of cells on a new map
  const DEMO_CELLS = 9000;
  const SPAWN_RADIUS = 3;
  const START_TROOPS = 150;
  const NEUTRAL_COST = 1.6;     // troops spent per unclaimed cell
  const NEUTRAL_RATE = 0.18;    // share of the frontier taken per tick
  const ENEMY_RATE = 0.1;
  const MAX_SLOTS = 8;

  const NEUTRAL_RGB = [196, 190, 168];
  const WATER_RGB = [22, 58, 104];

  const FACTIONS = [
    { name: 'You', color: [59, 130, 246] },
    { name: 'Crimson', color: [220, 38, 38] },
    { name: 'Amber', color: [234, 150, 12] },
    { name: 'Jade', color: [16, 170, 110] },
    { name: 'Violet', color: [139, 92, 246] },
    { name: 'Rose', color: [226, 72, 153] },
  ];

  // The first three personalities are always in play, so even a two- or
  // three-opponent game has a spread of aggression.
  const CORE_PERSONAS = [
    { label: 'Warlord', aggr: 0.9 },
    { label: 'Balanced', aggr: 0.55 },
    { label: 'Turtle', aggr: 0.2 },
  ];
  const EXTRA_PERSONAS = [
    { label: 'Raider', aggr: 0.75 },
    { label: 'Settler', aggr: 0.4 },
  ];

  const DIFFICULTY = {
    easy: { income: 0.8, aggr: -0.15, playerBias: 0.8 },
    normal: { income: 1.0, aggr: 0, playerBias: 1.0 },
    hard: { income: 1.2, aggr: 0.15, playerBias: 1.3 },
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $('map');
  const ctx = canvas.getContext('2d');

  // ---------- Persistence (best effort; the game works without it) ----------

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('pixelwar.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('pixelwar.' + key, JSON.stringify(value));
      } catch (e) {
        // Storage unavailable (private mode etc.): ignore.
      }
    },
  };

  const settings = Object.assign({ opponents: 3, difficulty: 'normal', pct: 50 },
    store.get('settings', {}));
  const record = Object.assign({ wins: 0, losses: 0, fastest: null }, store.get('record', {}));

  // ---------- State ----------

  let G = null;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let hudTimer = 0;
  let pointer = null;
  let pausedFrom = 'play';
  const view = { dpr: 1, mapX: 0, mapY: 0, cell: 1 };
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');
  let img = null;

  // ---------- Utilities ----------

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function fmt(n) {
    n = Math.max(0, n);
    if (n < 1000) return String(Math.floor(n));
    if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
    return (n / 1e6).toFixed(1) + 'M';
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  // ---------- Map generation ----------

  function valueNoise(rng, gw, gh, scale) {
    const lw = Math.ceil(gw / scale) + 2;
    const lh = Math.ceil(gh / scale) + 2;
    const lat = new Float32Array(lw * lh);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    return (x, y) => {
      const fx = x / scale;
      const fy = y / scale;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = lat[iy * lw + ix];
      const b = lat[iy * lw + ix + 1];
      const c = lat[(iy + 1) * lw + ix];
      const d = lat[(iy + 1) * lw + ix + 1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }

  function generateTerrain() {
    const { gw, gh, rng, owner, shade } = G;
    const big = Math.max(gw, gh);
    const n1 = valueNoise(rng, gw, gh, big / 3.5);
    const n2 = valueNoise(rng, gw, gh, big / 9);
    const n3 = valueNoise(rng, gw, gh, big / 22);
    const vals = new Float32Array(G.n);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let v = n1(x, y) * 0.55 + n2(x, y) * 0.3 + n3(x, y) * 0.15;
        const edge = Math.min(x / gw, 1 - x / gw, y / gh, 1 - y / gh);
        if (edge < 0.1) v -= (0.1 - edge) * 3;
        vals[y * gw + x] = v;
      }
    }
    const sorted = Array.from(vals).sort((a, b) => a - b);
    const sea = sorted[Math.floor(G.n * 0.27)];
    for (let i = 0; i < G.n; i++) {
      if (vals[i] > sea) {
        owner[i] = NEUTRAL;
        shade[i] = 0.95 + rng() * 0.07;
      } else {
        owner[i] = WATER;
        shade[i] = 0.62 + clamp((vals[i] - sea + 0.35) / 0.35, 0, 1) * 0.45;
      }
    }
    keepLargestIsland();
    let land = 0;
    for (let i = 0; i < G.n; i++) if (owner[i] === NEUTRAL) land++;
    G.landCells = land;
  }

  // Every faction must be able to reach every other, so drop stray islands.
  function keepLargestIsland() {
    const { gw, gh, owner } = G;
    const label = new Int32Array(G.n).fill(-1);
    const stack = new Int32Array(G.n);
    let best = -1;
    let bestSize = 0;
    let comp = 0;
    for (let s = 0; s < G.n; s++) {
      if (owner[s] !== NEUTRAL || label[s] !== -1) continue;
      let top = 0;
      let size = 0;
      stack[top++] = s;
      label[s] = comp;
      while (top) {
        const i = stack[--top];
        size++;
        const x = i % gw;
        const y = (i / gw) | 0;
        const nbs = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1];
        for (const j of nbs) {
          if (j >= 0 && owner[j] === NEUTRAL && label[j] === -1) {
            label[j] = comp;
            stack[top++] = j;
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = comp;
      }
      comp++;
    }
    for (let i = 0; i < G.n; i++) {
      if (owner[i] === NEUTRAL && label[i] !== best) {
        owner[i] = WATER;
        G.shade[i] = 0.95;
      }
    }
  }

  // ---------- Game setup ----------

  function mapArea(demo) {
    // Some WebViews report a zero-sized window for a moment while loading.
    const w = Math.max(240, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    if (demo) return { x: 0, y: 0, w, h };
    const top = $('hud-top').getBoundingClientRect().bottom;
    const bottom = $('hud-bottom').getBoundingClientRect().top;
    return { x: 0, y: top, w, h: Math.max(160, Math.min(h, bottom) - top) };
  }

  function setState(s) {
    if (G) G.state = s;
    document.body.dataset.state = s;
  }

  function newGame(demo) {
    $('over').classList.remove('show');
    pointer = null;
    acc = 0;
    setState(demo ? 'menu' : 'spawn');
    const area = mapArea(demo);
    const target = demo ? DEMO_CELLS : TARGET_CELLS;
    const c = Math.sqrt((area.w * area.h) / target);
    const gw = Math.max(40, Math.round(area.w / c));
    const gh = Math.max(40, Math.round(area.h / c));
    const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    const diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;

    G = {
      demo, gw, gh, rng, diff,
      n: gw * gh,
      state: demo ? 'menu' : 'spawn',
      owner: new Int16Array(gw * gh),
      shade: new Float32Array(gw * gh),
      factions: [],
      attacks: [],
      time: 0,
      landCells: 0,
      peakLand: 0,
      killedByPlayer: 0,
      minSpawnDist: 0,
    };
    generateTerrain();

    const count = demo ? FACTIONS.length : settings.opponents + 1;
    const personas = shuffle(CORE_PERSONAS.slice(), rng).concat(shuffle(EXTRA_PERSONAS.slice(), rng));
    for (let id = 0; id < count; id++) {
      const isPlayer = !demo && id === 0;
      const persona = personas[(id + (demo ? 0 : -1) + personas.length) % personas.length];
      G.factions.push({
        id,
        isPlayer,
        name: FACTIONS[id].name,
        color: FACTIONS[id].color,
        border: FACTIONS[id].color.map((v) => v * 0.55),
        persona: isPlayer ? null : persona.label,
        aggr: isPlayer ? 0 : clamp(persona.aggr + diff.aggr, 0.05, 1),
        income: isPlayer || demo ? 1 : diff.income,
        alive: true,
        troops: START_TROOPS,
        cells: 0,
        sx: 0,
        sy: 0,
        capital: -1,
        nextThink: 1 + rng() * 2,
      });
    }

    G.minSpawnDist = Math.max(gw, gh) * (count > 4 ? 0.22 : 0.28);
    const taken = [];
    for (const f of G.factions) {
      if (f.isPlayer) continue;
      const i = pickSpawn(taken, G.minSpawnDist);
      claimCapital(f, i);
      taken.push(i);
    }

    off.width = gw;
    off.height = gh;
    img = offCtx.createImageData(gw, gh);
    resize();
    updateHud(true);
  }

  function landAround(i, r) {
    const { gw, gh, owner } = G;
    const x0 = i % gw;
    const y0 = (i / gw) | 0;
    let land = 0;
    let total = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        total++;
        if (x >= 0 && y >= 0 && x < gw && y < gh && owner[y * gw + x] === NEUTRAL) land++;
      }
    }
    return land / total;
  }

  function distOk(i, taken, minDist) {
    const { gw } = G;
    const x = i % gw;
    const y = (i / gw) | 0;
    return taken.every((t) => Math.hypot(t % gw - x, ((t / gw) | 0) - y) >= minDist);
  }

  function pickSpawn(taken, minDist) {
    let d = minDist;
    for (let tries = 0; tries < 4000; tries++) {
      if (tries % 500 === 499) d *= 0.85;
      const i = Math.floor(G.rng() * G.n);
      if (G.owner[i] !== NEUTRAL) continue;
      if (landAround(i, SPAWN_RADIUS + 2) < 0.9) continue;
      if (distOk(i, taken, d)) return i;
    }
    for (let i = 0; i < G.n; i++) if (G.owner[i] === NEUTRAL) return i;
    return 0;
  }

  function claimCapital(f, i) {
    const { gw, gh, owner } = G;
    const x0 = i % gw;
    const y0 = (i / gw) | 0;
    f.capital = i;
    for (let dy = -SPAWN_RADIUS; dy <= SPAWN_RADIUS; dy++) {
      for (let dx = -SPAWN_RADIUS; dx <= SPAWN_RADIUS; dx++) {
        if (dx * dx + dy * dy > SPAWN_RADIUS * SPAWN_RADIUS + 1) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const j = y * gw + x;
        if (owner[j] === NEUTRAL) setOwner(j, f.id);
      }
    }
  }

  function chooseSpawn(i) {
    if (!G || G.state !== 'spawn' || i < 0) return;
    if (G.owner[i] === WATER) {
      toast('Pick a spot on land');
      return;
    }
    if (G.owner[i] !== NEUTRAL) {
      toast('That land is taken');
      return;
    }
    const taken = G.factions.filter((f) => !f.isPlayer).map((f) => f.capital);
    if (!distOk(i, taken, G.minSpawnDist * 0.55)) {
      toast('Too close to a rival. Pick somewhere else');
      return;
    }
    startWithCapital(i);
  }

  function startWithCapital(i) {
    claimCapital(G.factions[0], i);
    setState('play');
    try {
      history.pushState({ pixelwar: true }, '');
    } catch (e) {
      // History API unavailable: back button simply leaves the page.
    }
    toast('Grab the grey land first, then strike!');
  }

  // ---------- Simulation ----------

  function setOwner(i, o) {
    const prev = G.owner[i];
    const x = i % G.gw;
    const y = (i / G.gw) | 0;
    if (prev >= 0) {
      const f = G.factions[prev];
      f.cells--;
      f.sx -= x;
      f.sy -= y;
    }
    if (o >= 0) {
      const f = G.factions[o];
      f.cells++;
      f.sx += x;
      f.sy += y;
    }
    G.owner[i] = o;
  }

  const maxTroops = (f) => 100 + f.cells * 12;

  function grow(f) {
    const max = maxTroops(f);
    if (f.troops > max) {
      f.troops -= (f.troops - max) * 0.02;
      return;
    }
    const interest = f.troops * 0.07 * (1 - f.troops / max);
    f.troops = Math.min(max, f.troops + (0.5 + f.cells * 0.04 + interest) * TICK * f.income);
  }

  function launch(from, to, troops, aimX, aimY) {
    const f = G.factions[from];
    troops = Math.min(troops, f.troops);
    if (troops < 1) return false;
    f.troops -= troops;
    const existing = G.attacks.find((a) => a.from === from && a.to === to && !a.done);
    if (existing) {
      existing.troops += troops;
      existing.aimX = aimX;
      existing.aimY = aimY;
    } else {
      G.attacks.push({ from, to, troops, aimX, aimY, done: false, born: G.time });
    }
    return true;
  }

  function eliminate(f, by) {
    if (!f.alive) return;
    f.alive = false;
    f.troops = 0;
    for (const a of G.attacks) {
      if (a.done) continue;
      if (a.from === f.id) {
        a.done = true;
      } else if (a.to === f.id) {
        G.factions[a.from].troops += a.troops;
        a.done = true;
      }
    }
    if (G.demo) return;
    if (f.isPlayer) return;
    if (by === 0) G.killedByPlayer++;
    if (by === 0) toast(`You crushed ${f.name}!`);
    else if (by > 0) toast(`${f.name} has fallen to ${G.factions[by].name}`);
    else toast(`${f.name} has collapsed`);
  }

  // One pass over the grid collects, for every active attack, the target
  // cells that touch the attacker's land.
  function collectFrontiers() {
    const { gw, gh, owner, attacks } = G;
    const index = new Int16Array(MAX_SLOTS * MAX_SLOTS).fill(-1);
    const fronts = attacks.map(() => []);
    attacks.forEach((a, k) => {
      if (!a.done) index[a.from * MAX_SLOTS + (a.to + 1)] = k;
    });
    const seen = [-1, -1, -1, -1];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = owner[i];
        if (o === WATER) continue;
        seen[0] = seen[1] = seen[2] = seen[3] = -1;
        let s = 0;
        const consider = (nb) => {
          if (nb < 0 || nb === o) return;
          const k = index[nb * MAX_SLOTS + (o + 1)];
          if (k < 0 || seen.includes(k)) return;
          seen[s++] = k;
          fronts[k].push(i);
        };
        if (x > 0) consider(owner[i - 1]);
        if (x < gw - 1) consider(owner[i + 1]);
        if (y > 0) consider(owner[i - gw]);
        if (y < gh - 1) consider(owner[i + gw]);
      }
    }
    return fronts;
  }

  function cancelOpposing() {
    const list = G.attacks;
    for (let a = 0; a < list.length; a++) {
      const A = list[a];
      if (A.done || A.to < 0) continue;
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b];
        if (B.done || B.from !== A.to || B.to !== A.from) continue;
        const m = Math.min(A.troops, B.troops);
        A.troops -= m;
        B.troops -= m;
      }
    }
  }

  function advanceAttacks() {
    const { gw, rng } = G;
    const fronts = collectFrontiers();
    G.attacks.forEach((a, k) => {
      if (a.done) return;
      const front = fronts[k];
      const atk = G.factions[a.from];
      if (!front.length || a.troops < 1) {
        atk.troops += Math.max(0, a.troops);
        a.done = true;
        return;
      }
      const def = a.to >= 0 ? G.factions[a.to] : null;
      const density = def ? def.troops / Math.max(1, def.cells) : 0;
      const cost = def ? 1.5 + density * 1.15 : NEUTRAL_COST;
      const scored = front.map((i) => ({
        i,
        d: Math.hypot(i % gw - a.aimX, ((i / gw) | 0) - a.aimY) + rng() * 6,
      }));
      scored.sort((p, q) => p.d - q.d);
      const cap = Math.ceil(front.length * (def ? ENEMY_RATE : NEUTRAL_RATE)) + 1;
      for (let j = 0; j < Math.min(cap, scored.length); j++) {
        if (a.troops < cost) {
          // Not enough left to take another cell: the survivors come home.
          atk.troops += a.troops;
          a.done = true;
          return;
        }
        const i = scored[j].i;
        if (G.owner[i] !== a.to) continue;
        a.troops -= cost;
        if (def) def.troops = Math.max(0, def.troops - density);
        setOwner(i, a.from);
        if (def && def.cells === 0) {
          eliminate(def, a.from);
          return;
        }
      }
    });
    G.attacks = G.attacks.filter((a) => !a.done);
  }

  function neighbourScan(fid) {
    const { gw, gh, owner } = G;
    const counts = new Map();
    const samples = new Map();
    const note = (nb, j) => {
      if (nb === WATER || nb === fid) return;
      const c = (counts.get(nb) || 0) + 1;
      counts.set(nb, c);
      if (Math.random() * c < 1) samples.set(nb, j);
    };
    for (let i = 0; i < G.n; i++) {
      if (owner[i] !== fid) continue;
      const x = i % gw;
      const y = (i / gw) | 0;
      if (x > 0) note(owner[i - 1], i - 1);
      if (x < gw - 1) note(owner[i + 1], i + 1);
      if (y > 0) note(owner[i - gw], i - gw);
      if (y < gh - 1) note(owner[i + gw], i + gw);
    }
    return { counts, samples };
  }

  function aiThink(f) {
    const aggr = f.isPlayer ? 0.55 : f.aggr;
    f.nextThink = G.time + (2.8 - aggr * 1.8) * (0.6 + Math.random() * 0.8);
    if (G.attacks.filter((a) => a.from === f.id).length >= 2) return;
    const ratio = f.troops / maxTroops(f);
    const scan = neighbourScan(f.id);
    if (!scan.counts.size) return;

    let best = null;
    let bestScore = 0;
    for (const [o, shared] of scan.counts) {
      if (o < 0) continue;
      const e = G.factions[o];
      const power = f.troops * (0.4 + 0.5 * aggr);
      const need = e.troops * (1.4 - aggr * 0.6) + 1.5 * Math.min(e.cells, shared * 3) + 1;
      let score = power / need;
      if (e.isPlayer) score *= G.diff.playerBias;
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }

    const neutralOpen = scan.counts.has(NEUTRAL);
    const readyForWar = ratio > 0.45 - aggr * 0.3;
    let target = null;
    let pct = 0;
    if (best !== null && readyForWar && bestScore > (neutralOpen ? 1.6 - aggr * 0.6 : 1.0)) {
      target = best;
      pct = 0.4 + 0.5 * aggr;
    } else if (neutralOpen && ratio > 0.12 + 0.25 * (1 - aggr)) {
      target = NEUTRAL;
      pct = 0.3 + 0.3 * aggr;
    } else if (!neutralOpen && best !== null && ratio > 0.9 && bestScore > 0.5) {
      // Hemmed in and at full strength: use the troops rather than waste them.
      target = best;
      pct = 0.5;
    }
    if (target === null) return;
    const s = scan.samples.get(target);
    launch(f.id, target, f.troops * pct, s % G.gw, (s / G.gw) | 0);
  }

  function tick() {
    G.time += TICK;
    for (const f of G.factions) if (f.alive) grow(f);
    cancelOpposing();
    advanceAttacks();
    for (const f of G.factions) {
      if (f.alive && f.cells === 0) eliminate(f, -1);
    }
    for (const f of G.factions) {
      if (f.alive && (!f.isPlayer) && G.time >= f.nextThink) aiThink(f);
    }

    if (G.demo) {
      const alive = G.factions.filter((f) => f.alive).length;
      if (alive <= 1 || G.time > 300) newGame(true);
      return;
    }
    const me = G.factions[0];
    G.peakLand = Math.max(G.peakLand, me.cells / G.landCells);
    if (!me.alive) endGame(false);
    else if (G.factions.every((f) => f.isPlayer || !f.alive)) endGame(true);
  }

  function endGame(won) {
    setState('over');
    pointer = null;
    if (won) {
      record.wins++;
      if (record.fastest === null || G.time < record.fastest) record.fastest = G.time;
    } else {
      record.losses++;
    }
    store.set('record', record);
    updateHud(true);

    const title = $('over-title');
    title.textContent = won ? 'Victory!' : 'Defeated';
    title.className = won ? 'win' : 'lose';
    const killer = G.factions.find((f) => f.alive && !f.isPlayer);
    $('over-sub').textContent = won
      ? 'Every rival has fallen. The map is yours.'
      : `Your last pixel fell${killer ? '. ' + killer.name + ' (' + killer.persona + ') leads the map' : ''}.`;
    const rows = [
      ['Time', fmtTime(G.time)],
      ['Peak territory', (G.peakLand * 100).toFixed(1) + '%'],
      ['Rivals you eliminated', String(G.killedByPlayer)],
      ['Difficulty', settings.difficulty[0].toUpperCase() + settings.difficulty.slice(1)],
    ];
    $('over-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    setTimeout(() => {
      if (G && G.state === 'over') $('over').classList.add('show');
    }, 900);
  }

  // ---------- Player input ----------

  function cellAt(clientX, clientY) {
    if (!G) return -1;
    const gx = Math.floor((clientX * view.dpr - view.mapX) / view.cell);
    const gy = Math.floor((clientY * view.dpr - view.mapY) / view.cell);
    if (gx < 0 || gy < 0 || gx >= G.gw || gy >= G.gh) return -1;
    return gy * G.gw + gx;
  }

  function targetName(o) {
    return o === NEUTRAL ? 'unclaimed land' : G.factions[o].name;
  }

  function playerAttack(i) {
    if (i < 0) return;
    const me = G.factions[0];
    const o = G.owner[i];
    if (o === WATER) {
      toast("Troops can't cross water");
      return;
    }
    if (o === 0) {
      toast("That's already yours. Tap a neighbour");
      return;
    }
    if (!neighbourScan(0).counts.has(o)) {
      toast(`No border with ${targetName(o)} yet`);
      return;
    }
    const amount = me.troops * settings.pct / 100;
    if (amount < 2) {
      toast('Not enough troops yet');
      return;
    }
    launch(0, o, amount, i % G.gw, (i / G.gw) | 0);
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (e) {
        // Vibration blocked: no matter.
      }
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!G || G.demo) return;
    if (G.state === 'spawn') {
      chooseSpawn(cellAt(e.clientX, e.clientY));
      return;
    }
    // A new touch replaces any earlier one whose release was never seen.
    if (G.state !== 'play') return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Capture is a nicety only.
    }
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointer && e.pointerId === pointer.id) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const i = cellAt(pointer.x, pointer.y);
    pointer = null;
    if (G && G.state === 'play') playerAttack(i);
  });

  canvas.addEventListener('pointercancel', () => {
    pointer = null;
  });

  // ---------- Rendering ----------

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * view.dpr);
    canvas.height = Math.round(window.innerHeight * view.dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (!G) return;
    const a = mapArea(G.demo);
    const fit = G.demo ? Math.max : Math.min;
    let cell = fit(a.w / G.gw, a.h / G.gh) * view.dpr;
    // Whole device pixels per cell keep the grid crisp once cells are big
    // enough that rounding down doesn't waste much screen.
    if (cell >= 8) cell = Math.floor(cell);
    view.cell = cell;
    view.mapX = Math.round(a.x * view.dpr + (a.w * view.dpr - G.gw * cell) / 2);
    view.mapY = Math.round(a.y * view.dpr + (a.h * view.dpr - G.gh * cell) / 2);
  }

  function drawMap() {
    const { gw, gh, owner, shade, factions } = G;
    const d = img.data;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = owner[i];
        const s = shade[i];
        const p = i * 4;
        let c;
        if (o === WATER) {
          c = WATER_RGB;
        } else if (o === NEUTRAL) {
          c = NEUTRAL_RGB;
        } else {
          const f = factions[o];
          const edge = (x > 0 && owner[i - 1] !== o && owner[i - 1] !== WATER)
            || (x < gw - 1 && owner[i + 1] !== o && owner[i + 1] !== WATER)
            || (y > 0 && owner[i - gw] !== o && owner[i - gw] !== WATER)
            || (y < gh - 1 && owner[i + gw] !== o && owner[i + gw] !== WATER);
          c = edge ? f.border : f.color;
          if (i === f.capital && f.alive) c = [255, 255, 255];
        }
        d[p] = c[0] * s;
        d[p + 1] = c[1] * s;
        d[p + 2] = c[2] * s;
        d[p + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, view.mapX, view.mapY, gw * view.cell, gh * view.cell);
  }

  function centroid(f) {
    return {
      x: view.mapX + (f.sx / f.cells + 0.5) * view.cell,
      y: view.mapY + (f.sy / f.cells + 0.5) * view.cell,
    };
  }

  function drawLabels() {
    const dpr = view.dpr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of G.factions) {
      if (!f.alive || f.cells === 0) continue;
      const { x, y } = centroid(f);
      const size = clamp(Math.sqrt(f.cells) * view.cell * 0.16, 11 * dpr, 20 * dpr);
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = size * 0.28;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(f.name, x, y - size * 0.55);
      ctx.fillText(f.name, x, y - size * 0.55);
      ctx.font = `700 ${size * 0.85}px system-ui, sans-serif`;
      ctx.strokeText(fmt(f.troops), x, y + size * 0.5);
      ctx.fillText(fmt(f.troops), x, y + size * 0.5);
    }
  }

  function drawAttackMarkers(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    for (const a of G.attacks) {
      if (a.from !== 0) continue;
      const x = view.mapX + (a.aimX + 0.5) * view.cell;
      const y = view.mapY + (a.aimY + 0.5) * view.cell;
      const r = (6 + pulse * 4) * view.dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2 * view.dpr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawDrag() {
    if (!pointer || G.state !== 'play') return;
    const me = G.factions[0];
    if (!me.cells) return;
    const dpr = view.dpr;
    const from = centroid(me);
    const tx = pointer.x * dpr;
    const ty = pointer.y * dpr;
    const i = cellAt(pointer.x, pointer.y);
    const o = i >= 0 ? G.owner[i] : WATER;
    const valid = o !== WATER && o !== 0;
    ctx.setLineDash([8 * dpr, 6 * dpr]);
    ctx.strokeStyle = valid ? 'rgba(255,255,255,0.9)' : 'rgba(255,120,120,0.8)';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tx, ty, 14 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    if (valid) {
      const label = `${fmt(me.troops * settings.pct / 100)} → ${targetName(o)}`;
      const size = 14 * dpr;
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = size * 0.3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.fillStyle = '#fff';
      // Sits above the finger so it isn't hidden by it.
      ctx.strokeText(label, tx, ty - 40 * dpr);
      ctx.fillText(label, tx, ty - 40 * dpr);
    }
  }

  function render(now) {
    ctx.fillStyle = '#07101d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!G) return;
    drawMap();
    if (G.demo) return;
    drawLabels();
    drawAttackMarkers(now);
    drawDrag();
  }

  // ---------- HUD ----------

  function updateHud(force) {
    if (!G || G.demo) return;
    const me = G.factions[0];
    $('troops').textContent = fmt(me.troops);
    $('troops-max').textContent = '/ ' + fmt(maxTroops(me));
    $('land').textContent = (me.cells / G.landCells * 100).toFixed(1) + '%';
    $('clock').textContent = fmtTime(G.time);
    $('pct-label').textContent = `${settings.pct}% · ${fmt(me.troops * settings.pct / 100)}`;

    const mine = G.attacks.filter((a) => a.from === 0);
    const incoming = G.attacks.filter((a) => a.to === 0);
    let hint = 'Tap or drag onto a neighbour to attack';
    if (G.state === 'spawn') hint = 'Choose where your empire begins';
    else if (incoming.length) {
      hint = '⚠ Under attack by ' + incoming.map((a) => `${G.factions[a.from].name} (${fmt(a.troops)})`).join(', ');
    } else if (mine.length) {
      hint = '⚔ ' + mine.map((a) => `${targetName(a.to)}: ${fmt(a.troops)}`).join(' · ');
    }
    $('hint').textContent = hint;

    if (force || G.time - hudTimer >= 0.5 || G.time < hudTimer) {
      hudTimer = G.time;
      const rows = G.factions
        .filter((f) => f.alive)
        .sort((a, b) => b.cells - a.cells)
        .map((f) => {
          const c = `rgb(${f.color.join(',')})`;
          const pc = (f.cells / G.landCells * 100).toFixed(1);
          return `<li class="${f.isPlayer ? 'me' : ''}"><span class="sw" style="background:${c}"></span>`
            + `${f.name}<span class="pc">${pc}%</span></li>`;
        });
      $('board').innerHTML = rows.join('');
    }
  }

  // ---------- Main loop ----------

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (G && ((G.demo && G.state === 'menu') || G.state === 'play')) {
      acc += dt * (G.demo ? 1.5 : speed);
      let steps = 0;
      while (acc >= TICK && steps < 40) {
        tick();
        acc -= TICK;
        steps++;
        if (!G || G.state === 'over') break;
      }
    }
    render(now);
    updateHud(false);
    requestAnimationFrame(frame);
  }

  // ---------- Menus and controls ----------

  function syncMenu() {
    for (const b of document.querySelectorAll('#seg-opp button')) {
      b.classList.toggle('on', Number(b.dataset.v) === settings.opponents);
    }
    for (const b of document.querySelectorAll('#seg-diff button')) {
      b.classList.toggle('on', b.dataset.v === settings.difficulty);
    }
    const parts = [];
    if (record.wins || record.losses) parts.push(`Wins ${record.wins} · Losses ${record.losses}`);
    if (record.fastest !== null) parts.push(`Fastest win ${fmtTime(record.fastest)}`);
    $('record').textContent = parts.join(' · ');
    $('pct').value = settings.pct;
  }

  function saveSettings() {
    store.set('settings', settings);
  }

  $('seg-opp').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.opponents = Number(b.dataset.v);
    saveSettings();
    syncMenu();
  });

  $('seg-diff').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.difficulty = b.dataset.v;
    saveSettings();
    syncMenu();
  });

  $('pct').addEventListener('input', (e) => {
    settings.pct = Number(e.target.value);
    saveSettings();
    updateHud(false);
  });

  $('btn-play').addEventListener('click', () => newGame(false));
  $('btn-again').addEventListener('click', () => newGame(false));
  $('btn-restart').addEventListener('click', () => newGame(false));

  function toMenu() {
    $('over').classList.remove('show');
    syncMenu();
    newGame(true);
  }
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-quit').addEventListener('click', toMenu);

  $('btn-random').addEventListener('click', () => {
    if (!G || G.state !== 'spawn') return;
    const taken = G.factions.filter((f) => !f.isPlayer).map((f) => f.capital);
    startWithCapital(pickSpawn(taken, G.minSpawnDist));
  });

  function pause() {
    if (!G || G.demo || (G.state !== 'play' && G.state !== 'spawn')) return;
    pausedFrom = G.state;
    pointer = null;
    setState('paused');
  }

  $('btn-pause').addEventListener('click', pause);
  $('btn-resume').addEventListener('click', () => {
    if (G && G.state === 'paused') setState(pausedFrom);
  });

  $('btn-speed').addEventListener('click', () => {
    speed = speed >= 3 ? 1 : speed + 1;
    $('btn-speed').textContent = speed + '×';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  // Android back button: pause rather than leave mid-game.
  window.addEventListener('popstate', () => {
    if (G && !G.demo && G.state === 'play') {
      pause();
      try {
        history.pushState({ pixelwar: true }, '');
      } catch (e) {
        // Ignore.
      }
    }
  });

  window.addEventListener('resize', resize);

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('btn-install').classList.remove('hidden');
  });
  $('btn-install').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch (e) {
      // Dismissed.
    }
    installPrompt = null;
    $('btn-install').classList.add('hidden');
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Exposed for debugging and automated play-testing.
  window.pixelWar = {
    get game() { return G; },
    tick,
    newGame,
  };

  syncMenu();
  newGame(true);
  requestAnimationFrame(frame);
})();
