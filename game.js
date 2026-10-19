'use strict';

/*
 * Pixel War: a territory-conquest game for touch screens.
 *
 * The map is a grid of cells, either random islands or real countries
 * (World / Europe). Every faction's troops and gold grow over time. Troops
 * are spent to capture neighbouring cells (or shipped across water by boat).
 * Gold buys buildings: cities, gold mines, forts, artillery and nuclear
 * silos. The last faction standing wins.
 */
(() => {
  const WATER = -2;
  const NEUTRAL = -1;
  const TICK = 0.1;               // seconds of game time per simulation step
  const TARGET_CELLS = 16000;     // approximate number of cells on a random map
  const DEMO_CELLS = 9000;
  const SPAWN_RADIUS = 3;
  const COUNTRY_START_CELLS = 220; // land granted when starting in a country
  const START_TROOPS = 150;
  const START_GOLD = 150;
  const NEUTRAL_COST = 1.6;       // troops spent per unclaimed cell
  const NEUTRAL_RATE = 0.18;      // share of the frontier taken per tick
  const ENEMY_RATE = 0.1;
  const ATTACK_FOCUS = 14;        // cells either side of the aim that advance
  const SLOT = 10;                // stride for the attacker/target lookup table
  // Building stats by level (index 0 = level 1). Upgrades go up to level 3.
  const MAX_LEVEL = 3;
  const CITY_CAP = [1500, 3000, 5000];
  const CITY_TROOPS = [2, 4, 7];
  const CITY_GOLD = [1.5, 3, 5];
  const MINE_GOLD = [4, 7, 11];
  const FORT_RADIUS = [6, 8, 10];
  const FORT_MULT = [3, 4, 5];
  const RAD_MULT = 4;             // irradiated land is this much harder to take
  const RAD_TIME = 45;
  const ART_RANGE = [22, 28, 34];
  const ART_RELOAD = [3.5, 2.4, 1.5];
  const ART_BLAST = [1, 1, 2];
  const SHELL_TIME = 1.2;
  const NUKE_COST = 900;
  const NUKE_RADIUS = [7, 10, 13];
  const NUKE_TIME = 3;
  const NUKE_COOLDOWN = [30, 20, 12]; // seconds between launches per faction
  const BOAT_SPEED = 14;          // cells per second
  const MAX_BOATS = 3;
  const DEPOSIT_EVERY = 300;
  const TINY_ISLAND = 5;          // islands smaller than this many cells are removed      // land cells per gold deposit
  const MIN_SPACING = 2;          // free cells required around a building
  const LAND_ROUTE_LIMIT = 6000;  // search budget when deciding land vs sea

  const NEUTRAL_RGB = [196, 190, 168];
  const WATER_RGB = [22, 58, 104];
  const RAD_RGB = [120, 255, 70];

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

  // siloAggr: minimum aggression for an AI to build nukes (Infinity = never).
  const DIFFICULTY = {
    easy: { income: 0.8, aggr: -0.15, playerBias: 0.8, siloAggr: Infinity },
    normal: { income: 1.0, aggr: 0, playerBias: 1.0, siloAggr: 0.6 },
    hard: { income: 1.2, aggr: 0.15, playerBias: 1.3, siloAggr: 0.4 },
  };

  // stats(level) describes what a building does at a given level (1-3).
  const BUILDINGS = {
    city: {
      label: 'City', icon: '🏙️', cost: 250, step: 1.3, hp: 3,
      stats: (l) => `+${fmt(CITY_CAP[l - 1])} troop cap, +${CITY_TROOPS[l - 1]} troops/s, +${CITY_GOLD[l - 1]} gold/s`,
    },
    mine: {
      label: 'Gold mine', icon: '⛏️', cost: 120, step: 1.15, hp: 2,
      stats: (l) => `+${MINE_GOLD[l - 1]} gold/s (build on a gold deposit)`,
    },
    fort: {
      label: 'Fort', icon: '🛡️', cost: 180, step: 1.3, hp: 4,
      stats: (l) => `Land within ${FORT_RADIUS[l - 1]} cells is ${FORT_MULT[l - 1]}× harder to take`,
    },
    artillery: {
      label: 'Artillery', icon: '🎯', cost: 350, step: 1.35, hp: 2,
      stats: (l) => `Range ${ART_RANGE[l - 1]}, fires every ${ART_RELOAD[l - 1]}s${ART_BLAST[l - 1] > 1 ? ', bigger blast' : ''}`,
    },
    silo: {
      label: 'Nuclear silo', icon: '☢️', cost: 1200, step: 1.5, hp: 3,
      stats: (l) => `Nukes (${NUKE_COST}g): blast radius ${NUKE_RADIUS[l - 1]}, reload ${NUKE_COOLDOWN[l - 1]}s`,
    },
  };
  // Upgrading to level 2 costs 1.2× the base price, to level 3 2.4×.
  const UPGRADE_MULT = [0, 1.2, 2.4];
  const BUILD_ORDER = ['city', 'mine', 'fort', 'artillery', 'silo'];

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

  const settings = Object.assign({ opponents: 3, difficulty: 'normal', pct: 50, map: 'world' },
    store.get('settings', {}));
  const record = Object.assign({ wins: 0, losses: 0, fastest: null }, store.get('record', {}));

  // ---------- State ----------

  let G = null;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let hudTimer = 0;
  let pausedFrom = 'play';
  let myId = 0;                   // which faction this device controls

  // Multiplayer: the host simulates; clients send actions, receive snapshots.
  const net = {
    role: null,                   // null (single player), 'host' or 'client'
    peer: null,
    code: '',
    conns: new Map(),             // host: peer id -> { conn, name, fid }
    host: null,                   // client: connection to the host
    seq: 0,
    pending: new Map(),
    lastSend: 0,
    sentBver: -1,
  };
  const view = { dpr: 1, mapX: 0, mapY: 0, cell: 1, minCell: 1, area: null, zoomRel: 1 };
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
  const cx = (i) => i % G.gw;
  const cy = (i) => (i / G.gw) | 0;
  // East-west offset from cell b to cell a; the World map wraps round.
  function ddx(a, b) {
    let d = cx(a) - cx(b);
    if (G.wrap) {
      if (d > G.gw / 2) d -= G.gw;
      else if (d < -G.gw / 2) d += G.gw;
    }
    return d;
  }
  // Wrap an x coordinate on wrapping maps (others are bounds-checked later).
  const wx = (x) => (G.wrap ? ((x % G.gw) + G.gw) % G.gw : x);
  const cellDist = (a, b) => Math.hypot(ddx(a, b), cy(a) - cy(b));

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
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function forNeighbours(i, fn) {
    const x = i % G.gw;
    const y = (i / G.gw) | 0;
    if (x > 0) fn(i - 1);
    else if (G.wrap) fn(i + G.gw - 1);
    if (x < G.gw - 1) fn(i + 1);
    else if (G.wrap) fn(i - G.gw + 1);
    if (y > 0) fn(i - G.gw);
    if (y < G.gh - 1) fn(i + G.gw);
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
  }

  // Random maps keep one landmass so every faction can march to every other.
  function keepLargestIsland() {
    const { owner } = G;
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
        forNeighbours(i, (j) => {
          if (owner[j] === NEUTRAL && label[j] === -1) {
            label[j] = comp;
            stack[top++] = j;
          }
        });
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

  function decodeMap(rec) {
    const bin = atob(rec.data);
    const grid = new Uint8Array(rec.w * rec.h);
    let p = 0;
    let i = 0;
    while (i < bin.length) {
      const v = bin.charCodeAt(i++);
      let run = 0;
      let shift = 0;
      for (;;) {
        const b = bin.charCodeAt(i++);
        run |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) break;
      }
      grid.fill(v, p, p + run);
      p += run;
    }
    return grid;
  }

  function realTerrain(grid, rec) {
    const { owner, shade, rng } = G;
    G.country = new Int16Array(G.n);
    G.countryNames = rec.countries;
    G.countrySize = new Int32Array(rec.countries.length);
    for (let i = 0; i < G.n; i++) {
      const c = grid[i] - 1;
      G.country[i] = c;
      if (c < 0) {
        owner[i] = WATER;
        shade[i] = 0.9 + rng() * 0.06;
      } else {
        owner[i] = NEUTRAL;
        shade[i] = 0.95 + rng() * 0.07;
        G.countrySize[c]++;
      }
    }
    removeTinyIslands();
  }

  // Islands of a few cells are hard to see or tap, so sink them.
  function removeTinyIslands() {
    const seen = new Uint8Array(G.n);
    for (let s = 0; s < G.n; s++) {
      if (G.owner[s] !== NEUTRAL || seen[s]) continue;
      const island = [s];
      seen[s] = 1;
      for (let q = 0; q < island.length; q++) {
        forNeighbours(island[q], (j) => {
          if (G.owner[j] === NEUTRAL && !seen[j]) {
            seen[j] = 1;
            island.push(j);
          }
        });
      }
      if (island.length >= TINY_ISLAND) continue;
      for (const i of island) {
        G.countrySize[G.country[i]]--;
        G.country[i] = -1;
        G.owner[i] = WATER;
        G.shade[i] = 0.93;
      }
    }
  }

  function placeDeposits() {
    const want = Math.max(4, Math.round(G.landCells / DEPOSIT_EVERY));
    G.deposit = new Uint8Array(G.n);
    G.depositCells = [];
    for (let tries = 0; tries < want * 60 && G.depositCells.length < want; tries++) {
      const i = Math.floor(G.rng() * G.n);
      if (G.owner[i] === WATER) continue;
      if (G.depositCells.some((d) => cellDist(d, i) < 6)) continue;
      G.deposit[i] = 1;
      G.depositCells.push(i);
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

  // Terrain and deposits come only from (kind, seed, size), so a client can
  // rebuild exactly the host's map.
  function buildWorld(kind, seed, gw, gh, demo) {
    const rec = kind !== 'random' && window.PIXEL_WAR_MAPS ? window.PIXEL_WAR_MAPS[kind] : null;
    const rng = mulberry32(seed);
    const n = gw * gh;
    G = {
      demo, gw, gh, rng, n, kind, seed,
      diff: DIFFICULTY[settings.difficulty] || DIFFICULTY.normal,
      real: !!rec,
      wrap: kind === 'world' && !!rec,
      cosX: Float64Array.from({ length: gw }, (_, x) => Math.cos(2 * Math.PI * x / gw)),
      sinX: Float64Array.from({ length: gw }, (_, x) => Math.sin(2 * Math.PI * x / gw)),
      state: demo ? 'menu' : 'spawn',
      owner: new Int16Array(n),
      shade: new Float32Array(n),
      rad: new Float32Array(n),
      radList: [],
      bAt: new Int32Array(n).fill(-1),
      buildings: new Map(),
      nextBid: 1,
      bver: 0,
      country: null,
      factions: [],
      attacks: [],
      boats: [],
      shells: [],
      missiles: [],
      fx: [],
      mode: null,
      time: 0,
      landCells: 0,
      peakLand: 0,
      minSpawnDist: 0,
      winner: null,
      dirty: true,
      // Host-side change tracking for multiplayer snapshots.
      track: false,
      changed: [],
      changedMark: new Uint8Array(n),
      radEvents: [],
      fxEvents: [],
      events: [],
    };
    if (rec) realTerrain(decodeMap(rec), rec);
    else generateTerrain();
    for (let i = 0; i < n; i++) if (G.owner[i] === NEUTRAL) G.landCells++;
    placeDeposits();
    off.width = gw;
    off.height = gh;
    img = offCtx.createImageData(gw, gh);
  }

  function makeFaction(id, opts) {
    const c = FACTIONS[id].color;
    return Object.assign({
      id,
      isPlayer: false,
      player: null,
      name: FACTIONS[id].name,
      color: c,
      border: c.map((v) => v * 0.55),
      css: `rgb(${c.join(',')})`,
      persona: null,
      aggr: 0.55,
      income: 1,
      alive: true,
      troops: START_TROOPS,
      gold: START_GOLD,
      built: { city: 0, mine: 0, fort: 0, artillery: 0, silo: 0 },
      cells: 0,
      sx: 0,
      sy: 0,
      ca: 0,
      sa: 0,
      capital: -1,
      kills: 0,
      nextThink: 1 + Math.random() * 2,
      nextNuke: 0,
    }, opts);
  }

  // humans: names of the human players (single player: just 'You').
  function newGame(demo, humans) {
    $('over').classList.remove('show');
    closeBuildSheet();
    acc = 0;
    setState(demo ? 'menu' : 'spawn');
    humans = demo ? [] : humans || ['You'];
    const kind = demo ? 'random' : settings.map;
    const rec = kind !== 'random' && window.PIXEL_WAR_MAPS ? window.PIXEL_WAR_MAPS[kind] : null;
    let gw;
    let gh;
    if (rec) {
      gw = rec.w;
      gh = rec.h;
    } else {
      const area = mapArea(demo);
      const c = Math.sqrt((area.w * area.h) / (demo ? DEMO_CELLS : TARGET_CELLS));
      gw = Math.max(40, Math.round(area.w / c));
      gh = Math.max(40, Math.round(area.h / c));
    }
    buildWorld(kind, (Math.random() * 2 ** 32) >>> 0, gw, gh, demo);
    const { rng, diff } = G;
    G.mp = humans.length > 1;
    G.track = !demo && net.role === 'host';

    const ais = demo ? FACTIONS.length : Math.min(settings.opponents, FACTIONS.length - humans.length);
    const count = humans.length + ais;
    const personas = shuffle(CORE_PERSONAS.slice(), rng).concat(shuffle(EXTRA_PERSONAS.slice(), rng));
    for (let id = 0; id < count; id++) {
      if (id < humans.length) {
        G.factions.push(makeFaction(id, { isPlayer: true, player: humans[id], name: G.mp ? humans[id] : 'You' }));
      } else {
        const persona = personas[(id - humans.length) % personas.length];
        G.factions.push(makeFaction(id, {
          persona: persona.label,
          aggr: clamp(persona.aggr + diff.aggr, 0.05, 1),
          income: demo ? 1 : diff.income,
          nextThink: 1 + rng() * 2,
        }));
      }
    }

    G.minSpawnDist = Math.max(gw, gh) * (G.real ? 0.12 : count > 4 ? 0.22 : 0.28);
    const taken = [];
    for (const f of G.factions) {
      if (f.isPlayer) continue;
      const i = G.real ? pickCountrySpawn(taken) : pickSpawn(taken, G.minSpawnDist);
      claimStart(f, i);
      taken.push(i);
    }

    view.zoomRel = 0;
    view.cell = 0;
    resize();
    updateBanner();
    updateHud(true);
  }

  function landAround(i, r) {
    const x0 = cx(i);
    const y0 = cy(i);
    let land = 0;
    let total = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = wx(x0 + dx);
        const y = y0 + dy;
        total++;
        if (x >= 0 && y >= 0 && x < G.gw && y < G.gh && G.owner[y * G.gw + x] === NEUTRAL) land++;
      }
    }
    return land / total;
  }

  function distOk(i, taken, minDist) {
    return taken.every((t) => cellDist(t, i) >= minDist);
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

  // AI nations start in a reasonably sized country, spread across the map.
  function pickCountrySpawn(taken) {
    let d = G.minSpawnDist;
    for (let tries = 0; tries < 6000; tries++) {
      if (tries % 600 === 599) d *= 0.8;
      const i = Math.floor(G.rng() * G.n);
      if (G.owner[i] !== NEUTRAL) continue;
      if (G.countrySize[G.country[i]] < 60) continue;
      if (G.factions.some((f) => f.capital >= 0 && G.country[f.capital] === G.country[i])) continue;
      if (distOk(i, taken, d)) return i;
    }
    return pickSpawn(taken, 0);
  }

  function claimStart(f, i) {
    f.capital = i;
    if (G.real) {
      // Take the chosen country (or the part of it nearest the capital).
      const c = G.country[i];
      f.name = G.mp && f.player ? `${G.countryNames[c]} (${f.player})` : G.countryNames[c];
      const queue = [i];
      const seen = new Set(queue);
      for (let q = 0; q < queue.length && f.cells < COUNTRY_START_CELLS; q++) {
        const j = queue[q];
        if (G.owner[j] !== NEUTRAL) continue;
        setOwner(j, f.id);
        forNeighbours(j, (k) => {
          if (!seen.has(k) && G.country[k] === c && G.owner[k] === NEUTRAL) {
            seen.add(k);
            queue.push(k);
          }
        });
      }
      return;
    }
    const x0 = cx(i);
    const y0 = cy(i);
    for (let dy = -SPAWN_RADIUS; dy <= SPAWN_RADIUS; dy++) {
      for (let dx = -SPAWN_RADIUS; dx <= SPAWN_RADIUS; dx++) {
        if (dx * dx + dy * dy > SPAWN_RADIUS * SPAWN_RADIUS + 1) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const j = y * G.gw + x;
        if (G.owner[j] === NEUTRAL) setOwner(j, f.id);
      }
    }
  }

  // Called on this device once our capital exists: centre the view on it.
  function afterSpawn(cell) {
    if (G.spawnShown) return;
    G.spawnShown = true;
    centreOn(cell);
    try {
      history.pushState({ pixelwar: true }, '');
    } catch (e) {
      // History API unavailable: back button simply leaves the page.
    }
    updateBanner();
  }

  // ---------- Ownership and buildings ----------

  // Update ownership and the per-faction tallies (also used by clients).
  function assignCell(i, o) {
    const prev = G.owner[i];
    if (prev === o) return false;
    const x = i % G.gw;
    const y = (i / G.gw) | 0;
    if (prev >= 0) {
      const f = G.factions[prev];
      f.cells--;
      f.sx -= x;
      f.sy -= y;
      f.ca -= G.cosX[x];
      f.sa -= G.sinX[x];
    }
    if (o >= 0) {
      const f = G.factions[o];
      f.cells++;
      f.sx += x;
      f.sy += y;
      f.ca += G.cosX[x];
      f.sa += G.sinX[x];
    }
    G.owner[i] = o;
    G.dirty = true;
    if (G.track && !G.changedMark[i]) {
      G.changedMark[i] = 1;
      G.changed.push(i);
    }
    return true;
  }

  function setOwner(i, o) {
    if (!assignCell(i, o)) return;
    const bid = G.bAt[i];
    if (bid >= 0) {
      const b = G.buildings.get(bid);
      if (o >= 0) {
        // Captured buildings change hands intact.
        G.factions[b.owner].built[b.type]--;
        G.factions[o].built[b.type]++;
        b.owner = o;
        G.bver++;
      } else {
        destroyBuilding(b);
      }
    }
  }

  function costOf(f, type) {
    const b = BUILDINGS[type];
    return Math.round(b.cost * b.step ** f.built[type]);
  }

  function canPlace(f, type, i) {
    if (i < 0 || G.owner[i] !== f.id) return 'Build on your own land';
    if (G.rad[i] > 0) return 'That land is irradiated';
    if (type === 'mine' && !G.deposit[i]) return 'Gold mines go on a gold deposit';
    if (type !== 'mine' && G.deposit[i]) return 'Save gold deposits for mines';
    const x0 = cx(i);
    const y0 = cy(i);
    for (let dy = -MIN_SPACING; dy <= MIN_SPACING; dy++) {
      for (let dx = -MIN_SPACING; dx <= MIN_SPACING; dx++) {
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        if (G.bAt[y * G.gw + x] >= 0) return 'Too close to another building';
      }
    }
    return null;
  }

  function build(f, type, i) {
    const cost = costOf(f, type);
    if (f.gold < cost) return false;
    if (canPlace(f, type, i)) return false;
    f.gold -= cost;
    const b = { id: G.nextBid++, type, cell: i, owner: f.id, level: 1, hp: BUILDINGS[type].hp, reload: ART_RELOAD[0] };
    G.buildings.set(b.id, b);
    G.bAt[i] = b.id;
    f.built[type]++;
    G.bver++;
    return true;
  }

  const upgradeCost = (b) => Math.round(BUILDINGS[b.type].cost * UPGRADE_MULT[b.level]);

  function upgrade(f, b) {
    if (b.owner !== f.id || b.level >= MAX_LEVEL) return false;
    const cost = upgradeCost(b);
    if (f.gold < cost) return false;
    f.gold -= cost;
    b.level++;
    b.hp++;
    G.bver++;
    return true;
  }

  // Sum the economic bonuses of each faction's buildings (cheap: run per tick).
  function tallyBonuses() {
    for (const f of G.factions) {
      f.capBonus = 0;
      f.troopBonus = 0;
      f.goldBonus = 0;
      f.siloLevel = 0;
    }
    for (const b of G.buildings.values()) {
      const f = G.factions[b.owner];
      const l = b.level - 1;
      if (b.type === 'city') {
        f.capBonus += CITY_CAP[l];
        f.troopBonus += CITY_TROOPS[l];
        f.goldBonus += CITY_GOLD[l];
      } else if (b.type === 'mine') {
        f.goldBonus += MINE_GOLD[l];
      } else if (b.type === 'silo') {
        f.siloLevel = Math.max(f.siloLevel, b.level);
      }
    }
  }

  function destroyBuilding(b) {
    if (!G.buildings.has(b.id)) return;
    G.buildings.delete(b.id);
    G.bAt[b.cell] = -1;
    G.bver++;
    G.factions[b.owner].built[b.type]--;
    addFx(b.cell, 2.5, '255,170,60', 600);
  }

  // Strongest fort multiplier covering cell i for faction fid (1 if none).
  function fortMult(i, fid) {
    let m = 1;
    for (const b of G.buildings.values()) {
      if (b.type === 'fort' && b.owner === fid && cellDist(b.cell, i) <= FORT_RADIUS[b.level - 1]) {
        m = Math.max(m, FORT_MULT[b.level - 1]);
      }
    }
    return m;
  }

  // ---------- Simulation ----------

  const maxTroops = (f) => 100 + f.cells * 12 + (f.capBonus || 0);

  function grow(f) {
    f.gold += (1 + f.cells * 0.003 + f.goldBonus) * TICK * f.income;
    const max = maxTroops(f);
    if (f.troops > max) {
      f.troops -= (f.troops - max) * 0.02;
      return;
    }
    const interest = f.troops * 0.07 * (1 - f.troops / max);
    const base = 0.5 + f.cells * 0.04 + f.troopBonus;
    f.troops = Math.min(max, f.troops + (base + interest) * TICK * f.income);
  }

  function launch(from, to, troops, aimX, aimY) {
    const f = G.factions[from];
    troops = Math.min(troops, f.troops);
    if (troops < 1) return false;
    f.troops -= troops;
    addAttack(from, to, troops, aimX, aimY);
    return true;
  }

  function addAttack(from, to, troops, aimX, aimY) {
    const existing = G.attacks.find((a) => a.from === from && a.to === to && !a.done);
    if (existing) {
      existing.troops += troops;
      existing.aimX = aimX;
      existing.aimY = aimY;
    } else {
      G.attacks.push({ from, to, troops, aimX, aimY, done: false });
    }
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
    G.boats = G.boats.filter((b) => b.owner !== f.id);
    if (by >= 0) G.factions[by].kills++;
    announce({ k: 'elim', f: f.id, by });
  }

  // Game-wide news: shown here and, on a host, sent to every client.
  function announce(ev) {
    if (G.demo) return;
    if (G.track) G.events.push(ev);
    showEvent(ev);
  }

  function showEvent(ev) {
    const name = (id) => G.factions[id].name;
    if (ev.k === 'elim') {
      if (ev.f === myId) return; // Our own defeat gets the results screen.
      if (ev.by === myId) toast(`You crushed ${name(ev.f)}!`);
      else if (ev.by >= 0) toast(`${name(ev.f)} has fallen to ${name(ev.by)}`);
      else toast(`${name(ev.f)} has collapsed`);
    } else if (ev.k === 'nuke') {
      toast(ev.f === myId ? '☢ Nuke launched!' : `☢ ${name(ev.f)} has launched a nuke!`);
    } else if (ev.k === 'msg') {
      toast(ev.text);
    }
  }

  function captureCost(i, def, density) {
    let c = def ? 1.5 + density * 1.15 : NEUTRAL_COST;
    if (G.rad[i] > 0) c *= RAD_MULT;
    if (def && def.built.fort) c *= fortMult(i, def.id);
    return c;
  }

  // Take one cell for `atk`, paying from `pool` (an attack or a boat).
  // Returns false if the pool can't afford it.
  function capture(i, atk, pool) {
    const o = G.owner[i];
    const def = o >= 0 ? G.factions[o] : null;
    const density = def ? def.troops / Math.max(1, def.cells) : 0;
    const cost = captureCost(i, def, density);
    if (pool.troops < cost) return false;
    pool.troops -= cost;
    if (def) def.troops = Math.max(0, def.troops - density);
    setOwner(i, atk.id);
    if (def && def.cells === 0) eliminate(def, atk.id);
    return true;
  }

  // One pass over the grid collects, for every active attack, the target
  // cells that touch the attacker's land.
  function collectFrontiers() {
    const { gw, gh, owner, attacks, wrap } = G;
    const index = new Int16Array(SLOT * SLOT).fill(-1);
    const fronts = attacks.map(() => []);
    if (!attacks.length) return fronts;
    attacks.forEach((a, k) => {
      if (!a.done) index[a.from * SLOT + (a.to + 1)] = k;
    });
    const targeted = new Uint8Array(SLOT);
    for (const a of attacks) targeted[a.to + 1] = 1;
    let s0;
    let s1;
    let s2;
    const consider = (i, o, nb) => {
      if (nb < 0 || nb === o) return;
      const k = index[nb * SLOT + (o + 1)];
      if (k < 0 || k === s0 || k === s1 || k === s2) return;
      if (s0 < 0) s0 = k;
      else if (s1 < 0) s1 = k;
      else s2 = k;
      fronts[k].push(i);
    };
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = owner[i];
        if (o === WATER || !targeted[o + 1]) continue;
        s0 = s1 = s2 = -1;
        if (x > 0) consider(i, o, owner[i - 1]);
        else if (wrap) consider(i, o, owner[i + gw - 1]);
        if (x < gw - 1) consider(i, o, owner[i + 1]);
        else if (wrap) consider(i, o, owner[i - gw + 1]);
        if (y > 0) consider(i, o, owner[i - gw]);
        if (y < gh - 1) consider(i, o, owner[i + gw]);
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

  function aimDx(x, aimX) {
    let d = x - aimX;
    if (G.wrap) {
      if (d > G.gw / 2) d -= G.gw;
      else if (d < -G.gw / 2) d += G.gw;
    }
    return d;
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
      const scored = front.map((i) => ({
        i,
        d: Math.hypot(aimDx(i % gw, a.aimX), ((i / gw) | 0) - a.aimY) + rng() * 6,
      }));
      scored.sort((p, q) => p.d - q.d);
      // Only the stretch of border near the aim point advances, so a big
      // nation pushes where you tapped rather than all along its frontier.
      const reach = scored[0].d + ATTACK_FOCUS;
      let width = 0;
      while (width < scored.length && scored[width].d <= reach) width++;
      const cap = Math.ceil(width * (a.to >= 0 ? ENEMY_RATE : NEUTRAL_RATE)) + 1;
      for (let j = 0; j < Math.min(cap, scored.length); j++) {
        const i = scored[j].i;
        if (G.owner[i] !== a.to) continue;
        if (!capture(i, atk, a)) {
          // Not enough left to take another cell: the survivors come home.
          atk.troops += a.troops;
          a.done = true;
          return;
        }
        if (a.to >= 0 && !G.factions[a.to].alive) return;
      }
    });
    G.attacks = G.attacks.filter((a) => !a.done);
  }

  function neighbourScan(fid) {
    const { gw, gh, owner } = G;
    const counts = new Map();
    const samples = new Map();
    let coast = 0;
    const note = (nb, j) => {
      if (nb === fid) return;
      if (nb === WATER) {
        coast++;
        return;
      }
      const c = (counts.get(nb) || 0) + 1;
      counts.set(nb, c);
      if (Math.random() * c < 1) samples.set(nb, j);
    };
    for (let i = 0; i < G.n; i++) {
      if (owner[i] !== fid) continue;
      const x = i % gw;
      const y = (i / gw) | 0;
      if (x > 0) note(owner[i - 1], i - 1);
      else if (G.wrap) note(owner[i + gw - 1], i + gw - 1);
      if (x < gw - 1) note(owner[i + 1], i + 1);
      else if (G.wrap) note(owner[i - gw + 1], i - gw + 1);
      if (y > 0) note(owner[i - gw], i - gw);
      if (y < gh - 1) note(owner[i + gw], i + gw);
    }
    return { counts, samples, coast };
  }

  // Is there a land route from cell i to fid's territory within the budget?
  function landReachable(fid, i) {
    const seen = new Set([i]);
    const queue = [i];
    for (let q = 0; q < queue.length && q < LAND_ROUTE_LIMIT; q++) {
      const j = queue[q];
      if (G.owner[j] === fid) return true;
      let found = false;
      forNeighbours(j, (k) => {
        if (found || seen.has(k) || G.owner[k] === WATER) return;
        if (G.owner[k] === fid) found = true;
        seen.add(k);
        queue.push(k);
      });
      if (found) return true;
    }
    return false;
  }

  // ---------- Boats ----------

  // Nearest coastal cell of the same owner as `target`.
  function findLanding(target) {
    const o = G.owner[target];
    const seen = new Set([target]);
    const queue = [target];
    for (let q = 0; q < queue.length && q < 20000; q++) {
      const j = queue[q];
      let coastal = false;
      forNeighbours(j, (k) => {
        if (G.owner[k] === WATER) coastal = true;
      });
      if (coastal) return j;
      forNeighbours(j, (k) => {
        if (!seen.has(k) && G.owner[k] === o) {
          seen.add(k);
          queue.push(k);
        }
      });
    }
    return -1;
  }

  // Breadth-first search over water from the landing site back to fid's coast.
  function seaRoute(fid, landing) {
    const parent = new Int32Array(G.n).fill(-2);
    const queue = [];
    forNeighbours(landing, (k) => {
      if (G.owner[k] === WATER && parent[k] === -2) {
        parent[k] = -1;
        queue.push(k);
      }
    });
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q];
      let home = false;
      forNeighbours(j, (k) => {
        if (G.owner[k] === fid) home = true;
      });
      if (home) {
        const path = [];
        for (let p = j; p !== -1; p = parent[p]) path.push(p);
        path.push(landing);
        return path;
      }
      forNeighbours(j, (k) => {
        if (G.owner[k] === WATER && parent[k] === -2) {
          parent[k] = j;
          queue.push(k);
        }
      });
    }
    return null;
  }

  function launchBoat(fid, target, troops) {
    const f = G.factions[fid];
    if (G.boats.filter((b) => b.owner === fid).length >= MAX_BOATS) return 'Too many boats at sea';
    const landing = findLanding(target);
    if (landing < 0) return 'No coast to land on';
    const path = seaRoute(fid, landing);
    if (!path) return 'No sea route there';
    troops = Math.min(troops, f.troops);
    if (troops < 2) return 'Not enough troops yet';
    f.troops -= troops;
    G.boats.push({ owner: fid, path, pos: 0, troops, landing, aimX: cx(target), aimY: cy(target) });
    return null;
  }

  function advanceBoats() {
    for (const b of G.boats) {
      b.pos += BOAT_SPEED * TICK;
      if (b.pos < b.path.length - 1) continue;
      b.done = true;
      const f = G.factions[b.owner];
      const o = G.owner[b.landing];
      if (o === b.owner) {
        f.troops += b.troops;
        continue;
      }
      if (o === WATER || !capture(b.landing, f, b)) continue;
      if (b.troops >= 1 && (o < 0 || G.factions[o].alive)) addAttack(b.owner, o, b.troops, b.aimX, b.aimY);
      else f.troops += Math.max(0, b.troops);
    }
    G.boats = G.boats.filter((b) => !b.done);
  }

  // ---------- Artillery and nukes ----------

  function artilleryTarget(b) {
    let best = -1;
    let bestD = Infinity;
    for (const t of G.buildings.values()) {
      if (t.owner === b.owner) continue;
      const d = cellDist(t.cell, b.cell);
      if (d <= ART_RANGE[b.level - 1] && d < bestD) {
        bestD = d;
        best = t.cell;
      }
    }
    if (best >= 0) return best;
    const x0 = cx(b.cell);
    const y0 = cy(b.cell);
    for (let tries = 0; tries < 40; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * (ART_RANGE[b.level - 1] - 3);
      const x = wx(Math.round(x0 + Math.cos(ang) * r));
      const y = Math.round(y0 + Math.sin(ang) * r);
      if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
      const o = G.owner[y * G.gw + x];
      if (o >= 0 && o !== b.owner) return y * G.gw + x;
    }
    return -1;
  }

  function fireArtillery() {
    for (const b of G.buildings.values()) {
      if (b.type !== 'artillery') continue;
      b.reload -= TICK;
      if (b.reload > 0) continue;
      const t = artilleryTarget(b);
      if (t < 0) {
        b.reload = 1;
        continue;
      }
      b.reload = ART_RELOAD[b.level - 1];
      G.shells.push({ owner: b.owner, from: b.cell, to: t, t: 0, dur: SHELL_TIME, blast: ART_BLAST[b.level - 1] });
    }
  }

  function hitBuilding(i) {
    const bid = G.bAt[i];
    if (bid < 0) return false;
    const b = G.buildings.get(bid);
    b.hp--;
    G.bver++;
    if (b.hp <= 0) {
      destroyBuilding(b);
      return false;
    }
    return true;
  }

  function shellImpact(s) {
    const x0 = cx(s.to);
    const y0 = cy(s.to);
    const r = s.blast;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const i = y * G.gw + x;
        const o = G.owner[i];
        if (o < 0 || o === s.owner) continue;
        // A surviving building shrugs off the hit and keeps its cell.
        if (hitBuilding(i)) continue;
        const def = G.factions[o];
        def.troops = Math.max(0, def.troops - (def.troops / Math.max(1, def.cells)) * 1.5);
        setOwner(i, NEUTRAL);
      }
    }
    addFx(s.to, 1 + r, '255,200,90', 450);
  }

  function launchNuke(f, target) {
    if (!f.built.silo) return 'Build a nuclear silo first';
    if (f.gold < NUKE_COST) return `Nukes cost ${NUKE_COST} gold`;
    if (target < 0) return 'Tap a target on the map';
    if (G.time < f.nextNuke) return `Silo reloading: ${Math.ceil(f.nextNuke - G.time)}s`;
    // Fire from the best silo (highest level, then nearest).
    let silo = null;
    for (const b of G.buildings.values()) {
      if (b.type !== 'silo' || b.owner !== f.id) continue;
      if (!silo || b.level > silo.level
        || (b.level === silo.level && cellDist(b.cell, target) < cellDist(silo.cell, target))) silo = b;
    }
    f.gold -= NUKE_COST;
    f.nextNuke = G.time + NUKE_COOLDOWN[silo.level - 1];
    G.missiles.push({ owner: f.id, from: silo.cell, to: target, t: 0, dur: NUKE_TIME, radius: NUKE_RADIUS[silo.level - 1] });
    announce({ k: 'nuke', f: f.id });
    return null;
  }

  function nukeImpact(m) {
    const x0 = cx(m.to);
    const y0 = cy(m.to);
    const R = m.radius;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const i = y * G.gw + x;
        const o = G.owner[i];
        if (o === WATER) continue;
        if (o >= 0) {
          const def = G.factions[o];
          def.troops = Math.max(0, def.troops - def.troops / Math.max(1, def.cells) * 1.5);
        }
        setOwner(i, NEUTRAL);
        if (G.rad[i] <= 0) G.radList.push(i);
        G.rad[i] = RAD_TIME * (1 - Math.hypot(dx, dy) / (R + 1) * 0.5);
        if (G.track) G.radEvents.push(i, Math.round(G.rad[i] * 10) / 10);
      }
    }
    addFx(m.to, R * 2.2, '255,240,200', 1400);
    addFx(m.to, R * 1.2, '255,120,40', 1000);
  }

  function advanceProjectiles() {
    for (const s of G.shells) {
      s.t += TICK;
      if (s.t >= s.dur) {
        s.done = true;
        shellImpact(s);
      }
    }
    for (const m of G.missiles) {
      m.t += TICK;
      if (m.t >= m.dur) {
        m.done = true;
        nukeImpact(m);
      }
    }
    G.shells = G.shells.filter((s) => !s.done);
    G.missiles = G.missiles.filter((m) => !m.done);
  }

  function decayRadiation() {
    if (!G.radList.length) return;
    G.radList = G.radList.filter((i) => {
      G.rad[i] -= TICK;
      if (G.rad[i] > 0) return true;
      G.rad[i] = 0;
      return false;
    });
    G.dirty = true;
  }

  function addFx(cell, radius, rgb, dur) {
    if (G.track) G.fxEvents.push([cell, radius, rgb, dur]);
    G.fx.push({ x: cx(cell) + 0.5, y: cy(cell) + 0.5, radius, rgb, start: performance.now(), dur });
  }

  // ---------- AI ----------

  function ownCells(fid) {
    const out = [];
    for (let i = 0; i < G.n; i++) if (G.owner[i] === fid) out.push(i);
    return out;
  }

  function interiorCell(f, type) {
    const cells = ownCells(f.id);
    for (let tries = 0; tries < 200 && cells.length; tries++) {
      const i = cells[Math.floor(Math.random() * cells.length)];
      if (canPlace(f, type, i)) continue;
      if (landAroundOwner(i, 2, f.id)) return i;
    }
    return -1;
  }

  function landAroundOwner(i, r, fid) {
    const x0 = cx(i);
    const y0 = cy(i);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const o = G.owner[y * G.gw + x];
        if (o !== fid && o !== WATER) return false;
      }
    }
    return true;
  }

  function borderCell(f, type, near) {
    const x0 = cx(near);
    const y0 = cy(near);
    const options = [];
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < 2 || d > 5) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const i = y * G.gw + x;
        if (!canPlace(f, type, i)) options.push(i);
      }
    }
    return options.length ? options[Math.floor(Math.random() * options.length)] : -1;
  }

  function nukeTarget(f) {
    let best = null;
    let bestScore = 0;
    for (const e of G.factions) {
      if (!e.alive || e.id === f.id) continue;
      const score = e.cells * (e.isPlayer ? G.diff.playerBias : 1);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) return -1;
    const candidates = [];
    for (const b of G.buildings.values()) if (b.owner === best.id) candidates.push(b.cell);
    if (!candidates.length) {
      const cells = ownCells(best.id);
      for (let k = 0; k < 10 && cells.length; k++) candidates.push(cells[Math.floor(Math.random() * cells.length)]);
    }
    // Don't nuke your own land.
    const safe = candidates.filter((c) => {
      const x0 = cx(c);
      const y0 = cy(c);
      const R = NUKE_RADIUS[Math.max(0, f.siloLevel - 1)] + 1;
      for (let dy = -R; dy <= R; dy += 2) {
        for (let dx = -R; dx <= R; dx += 2) {
          const x = wx(x0 + dx);
          const y = y0 + dy;
          if (x >= 0 && y >= 0 && x < G.gw && y < G.gh && G.owner[y * G.gw + x] === f.id) return false;
        }
      }
      return true;
    });
    return safe.length ? safe[Math.floor(Math.random() * safe.length)] : -1;
  }

  function aiBuild(f, scan) {
    const aggr = f.aggr;
    if (f.built.silo && f.gold >= NUKE_COST && G.time >= f.nextNuke && Math.random() < 0.25 + aggr * 0.5) {
      const t = nukeTarget(f);
      if (t >= 0 && !launchNuke(f, t)) return;
    }
    let strongest = null;
    for (const o of scan.counts.keys()) {
      if (o >= 0 && (!strongest || G.factions[o].troops > strongest.troops)) strongest = G.factions[o];
    }
    const wants = [];
    const deposit = G.depositCells.find((d) => !canPlace(f, 'mine', d));
    if (deposit !== undefined) wants.push(['mine', deposit]);
    if (f.built.city < 1 + f.cells / 600) wants.push(['city', -1]);
    if (strongest && strongest.troops > f.troops * 0.8 && f.built.fort < 1 + f.cells / 900) wants.push(['fort', strongest.id]);
    if (strongest && aggr >= 0.35 && f.built.artillery < 1 + f.cells / 700) wants.push(['artillery', strongest.id]);
    if (f.cells > 900 && !f.built.silo && aggr >= G.diff.siloAggr) wants.push(['silo', -1]);
    for (const [type, arg] of wants) {
      if (f.gold < costOf(f, type)) {
        if (type === 'silo' && Math.random() < 0.6) return; // Saving up.
        continue;
      }
      // Sometimes improve an existing building instead of adding another.
      if (type !== 'mine' && Math.random() < 0.35 && aiUpgrade(f)) return;
      let at = -1;
      if (type === 'mine') at = arg;
      else if (type === 'city' || type === 'silo') at = interiorCell(f, type);
      else if (scan.samples.has(arg)) at = borderCell(f, type, scan.samples.get(arg));
      if (at >= 0 && build(f, type, at)) return;
    }
    if (f.gold > 300) aiUpgrade(f);
  }

  // Upgrade priorities: mines, silos and cities pay off best.
  function aiUpgrade(f) {
    const order = { mine: 0, silo: 1, city: 2, artillery: 3, fort: 4 };
    const options = [...G.buildings.values()]
      .filter((b) => b.owner === f.id && b.level < MAX_LEVEL && upgradeCost(b) <= f.gold)
      .sort((a, b) => order[a.type] - order[b.type] || a.level - b.level);
    return options.length ? upgrade(f, options[0]) : false;
  }

  function aiBoat(f) {
    for (let tries = 0; tries < 300; tries++) {
      const i = Math.floor(Math.random() * G.n);
      const o = G.owner[i];
      if (o === WATER || o === f.id) continue;
      if (o >= 0 && G.factions[o].troops > f.troops * 0.6) continue;
      if (!launchBoat(f.id, i, f.troops * (0.4 + 0.3 * f.aggr))) return true;
      return false;
    }
    return false;
  }

  function aiThink(f) {
    const aggr = f.aggr;
    f.nextThink = G.time + (2.8 - aggr * 1.8) * (0.6 + Math.random() * 0.8);
    const scan = neighbourScan(f.id);
    aiBuild(f, scan);
    if (G.attacks.filter((a) => a.from === f.id).length >= 2) return;
    const ratio = f.troops / maxTroops(f);

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
    if (target === null) {
      // Nothing worth taking by land: try an overseas landing.
      if (scan.coast && ratio > 0.5 && Math.random() < 0.3 + aggr * 0.4) aiBoat(f);
      return;
    }
    const s = scan.samples.get(target);
    launch(f.id, target, f.troops * pct, s % G.gw, (s / G.gw) | 0);
  }

  function tick() {
    G.time += TICK;
    tallyBonuses();
    for (const f of G.factions) if (f.alive) grow(f);
    cancelOpposing();
    advanceAttacks();
    advanceBoats();
    fireArtillery();
    advanceProjectiles();
    decayRadiation();
    for (const f of G.factions) {
      if (f.alive && f.cells === 0) eliminate(f, -1);
    }
    for (const f of G.factions) {
      if (f.alive && !f.isPlayer && G.time >= f.nextThink) aiThink(f);
    }

    if (G.demo) {
      const alive = G.factions.filter((f) => f.alive).length;
      if (alive <= 1 || G.time > 300) newGame(true);
      return;
    }
    G.peakLand = Math.max(G.peakLand, G.factions[myId].cells / G.landCells);
    checkEnd();
  }

  // Host only. The war ends when one nation is left, or no humans are.
  function checkEnd() {
    const alive = G.factions.filter((f) => f.alive);
    const humans = alive.filter((f) => f.isPlayer);
    if (alive.length === 1 || !humans.length) {
      const winner = alive.sort((a, b) => b.cells - a.cells)[0];
      endGame(winner ? winner.id : -1);
    } else if (!G.factions[myId].alive) {
      showResult(false);
    }
  }

  function endGame(winner) {
    G.winner = winner;
    setState('over');
    showResult(true);
  }

  // final: the war is over; otherwise we were knocked out and may watch on.
  function showResult(final) {
    const stage = final ? 2 : 1;
    if ((G.resultStage || 0) >= stage) return;
    G.resultStage = stage;
    G.mode = null;
    closeBuildSheet();
    updateBanner();
    const me = G.factions[myId];
    const won = final && G.winner === myId;
    if (!G.recorded) {
      G.recorded = true;
      if (won) {
        record.wins++;
        if (!G.mp && (record.fastest === null || G.time < record.fastest)) record.fastest = G.time;
      } else {
        record.losses++;
      }
      store.set('record', record);
    }
    updateHud(true);

    const title = $('over-title');
    title.textContent = won ? 'Victory!' : 'Defeated';
    title.className = won ? 'win' : 'lose';
    const winner = final && G.winner >= 0 ? G.factions[G.winner] : null;
    const leader = G.factions.filter((f) => f.alive && f.id !== myId).sort((a, b) => b.cells - a.cells)[0];
    let sub;
    if (won) sub = 'Every rival has fallen. The map is yours.';
    else if (me.alive && winner) sub = `${winner.name} has won the war.`;
    else sub = `Your last pixel fell${leader ? '. ' + leader.name + (leader.persona ? ` (${leader.persona})` : '') + ' leads the map' : ''}.`;
    $('over-sub').textContent = sub;
    const rows = [
      ['Time', fmtTime(G.time)],
      ['Peak territory', (G.peakLand * 100).toFixed(1) + '%'],
      ['Rivals you eliminated', String(me.kills)],
      ['Difficulty', settings.difficulty[0].toUpperCase() + settings.difficulty.slice(1)],
    ];
    $('over-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('btn-watch').classList.toggle('hidden', final);
    $('btn-again').classList.toggle('hidden', !!net.role);
    setTimeout(() => {
      if (G && (G.resultStage || 0) >= stage) $('over').classList.add('show');
    }, 900);
  }

  // ---------- Player actions ----------

  function targetName(o) {
    return o === NEUTRAL ? 'unclaimed land' : G.factions[o].name;
  }

  const fail = (msg) => ({ ok: false, msg });

  // Actions run on the host (or in single player) on behalf of any faction.
  // Each returns { ok, msg } so a remote player can be told the outcome.
  function actSpawn(fid, i) {
    const f = G.factions[fid];
    if (G.state !== 'spawn' || f.capital >= 0) return fail('');
    const taken = G.factions.filter((o) => o.capital >= 0).map((o) => o.capital);
    if (i < 0) {
      i = G.real ? pickCountrySpawn(taken) : pickSpawn(taken, G.minSpawnDist);
    } else {
      if (G.owner[i] === WATER) return fail('Pick a spot on land');
      if (G.owner[i] !== NEUTRAL) return fail(G.real ? `${G.factions[G.owner[i]].name} is already taken` : 'That land is taken');
      const rival = G.real && G.factions.find((o) => o.capital >= 0 && G.country[o.capital] === G.country[i]);
      if (rival) return fail(`${rival.name} is already taken`);
      if (!distOk(i, taken, G.minSpawnDist * (G.real ? 0.25 : 0.55))) return fail('Too close to a rival. Pick somewhere else');
    }
    claimStart(f, i);
    if (G.factions.every((o) => !o.isPlayer || o.capital >= 0)) setState('play');
    const msg = G.real ? `You lead ${G.countryNames[G.country[i]]}. Expand, build, conquer!`
      : 'Grab the grey land first, then strike!';
    return { ok: true, msg, cell: i };
  }

  function actAttack(fid, i, pct) {
    const me = G.factions[fid];
    if (i < 0) return fail('');
    const o = G.owner[i];
    if (o === WATER) return fail('Tap land to attack. Boats sail automatically');
    if (o === fid) return fail("That's already yours. Tap a neighbour");
    const amount = me.troops * clamp(Number(pct) || 50, 1, 100) / 100;
    if (amount < 2) return fail('Not enough troops yet');
    if (neighbourScan(fid).counts.has(o) && landReachable(fid, i)) {
      launch(fid, o, amount, cx(i), cy(i));
      return { ok: true, msg: '' };
    }
    const err = launchBoat(fid, i, amount);
    return err ? fail(err) : { ok: true, msg: `⛵ ${fmt(amount)} troops set sail for ${targetName(o)}` };
  }

  function actBuild(fid, type, i) {
    const me = G.factions[fid];
    if (!BUILDINGS[type]) return fail('');
    const err = i < 0 ? 'Tap your land' : canPlace(me, type, i);
    if (err) return fail(err);
    if (!build(me, type, i)) return fail(`Not enough gold (${costOf(me, type)} needed)`);
    return { ok: true, msg: `${BUILDINGS[type].icon} ${BUILDINGS[type].label} built` };
  }

  function actUpgrade(fid, id) {
    const b = G.buildings.get(id);
    if (!b || b.owner !== fid) return fail('');
    if (!upgrade(G.factions[fid], b)) return fail(b.level >= MAX_LEVEL ? 'Fully upgraded' : 'Not enough gold');
    return { ok: true, msg: `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].label} upgraded to level ${b.level}` };
  }

  function actNuke(fid, i) {
    if (i < 0 || G.owner[i] === WATER) return fail('Aim at land');
    if (G.owner[i] === fid) return fail("That's your own land! Pick an enemy target");
    const err = launchNuke(G.factions[fid], i);
    return err ? fail(err) : { ok: true, msg: '' };
  }

  function doAction(fid, act) {
    if (!G || G.demo || !act || !G.factions[fid]) return fail('');
    const cell = Number.isInteger(act.cell) && act.cell < G.n ? act.cell : -1;
    if (act.a === 'spawn') return actSpawn(fid, cell);
    if (G.state !== 'play' || !G.factions[fid].alive) return fail('');
    if (act.a === 'attack') return actAttack(fid, cell, act.pct);
    if (act.a === 'build') return actBuild(fid, act.building, cell);
    if (act.a === 'upgrade') return actUpgrade(fid, act.id);
    if (act.a === 'nuke') return actNuke(fid, cell);
    return fail('');
  }

  // Perform an action for this device's player: here, or on the host.
  function perform(act, after) {
    const done = (res) => {
      if (res.msg) toast(res.msg);
      if (res.ok) buzz();
      if (after) after(res);
    };
    if (net.role === 'client') netRequest(act, done);
    else done(doAction(myId, act));
  }

  function buzz() {
    if (!navigator.vibrate) return;
    try {
      navigator.vibrate(12);
    } catch (e) {
      // Vibration blocked: no matter.
    }
  }

  function handleTap(clientX, clientY) {
    if (!G || G.demo) return;
    const i = cellAt(clientX, clientY);
    if (G.state === 'spawn') {
      if (G.factions[myId].capital >= 0) {
        toast('Waiting for the other players to choose');
        return;
      }
      if (i >= 0) perform({ a: 'spawn', cell: i }, (res) => res.ok && afterSpawn(res.cell));
      return;
    }
    if (G.state !== 'play' || !G.factions[myId].alive) return;
    if (G.mode && G.mode.type === 'build') {
      perform({ a: 'build', building: G.mode.building, cell: i }, (res) => {
        if (!res.ok) return;
        G.mode = null;
        updateBanner();
      });
      return;
    }
    if (G.mode && G.mode.type === 'nuke') {
      perform({ a: 'nuke', cell: i });
      G.mode = null;
      updateBanner();
      return;
    }
    if (i >= 0 && G.owner[i] === myId && G.bAt[i] >= 0) {
      openUpgradeSheet(G.buildings.get(G.bAt[i]));
      return;
    }
    perform({ a: 'attack', cell: i, pct: settings.pct });
  }

  // ---------- Camera and touch input ----------

  function cellAt(clientX, clientY) {
    if (!G) return -1;
    const gx = Math.floor((clientX * view.dpr - view.mapX) / view.cell);
    const gy = Math.floor((clientY * view.dpr - view.mapY) / view.cell);
    const x = wx(gx);
    if (x < 0 || gy < 0 || x >= G.gw || gy >= G.gh) return -1;
    return gy * G.gw + x;
  }

  function clampView() {
    const a = view.area;
    const w = G.gw * view.cell;
    const h = G.gh * view.cell;
    if (G.wrap) {
      // Pan forever east or west: keep the origin within one map width.
      view.mapX = a.x - (((a.x - view.mapX) % w) + w) % w;
    } else {
      view.mapX = w <= a.w ? a.x + (a.w - w) / 2 : clamp(view.mapX, a.x + a.w - w, a.x);
    }
    view.mapY = h <= a.h ? a.y + (a.h - h) / 2 : clamp(view.mapY, a.y + a.h - h, a.y);
  }

  function zoomAt(px, py, newCell) {
    newCell = clamp(newCell, view.minCell, 48 * view.dpr);
    view.mapX = px - (px - view.mapX) * (newCell / view.cell);
    view.mapY = py - (py - view.mapY) * (newCell / view.cell);
    view.cell = newCell;
    view.zoomRel = newCell / view.minCell;
    clampView();
  }

  function centreOn(i) {
    const a = view.area;
    view.mapX = a.x + a.w / 2 - (cx(i) + 0.5) * view.cell;
    view.mapY = a.y + a.h / 2 - (cy(i) + 0.5) * view.cell;
    clampView();
  }

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * view.dpr);
    canvas.height = Math.round(window.innerHeight * view.dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (!G) return;
    const a = mapArea(G.demo);
    const d = view.dpr;
    view.area = { x: a.x * d, y: a.y * d, w: a.w * d, h: a.h * d };
    const contain = Math.min(view.area.w / G.gw, view.area.h / G.gh);
    const cover = Math.max(view.area.w / G.gw, view.area.h / G.gh);
    view.minCell = contain;
    // A fresh map starts zoomed to fill the screen; later resizes keep the zoom.
    if (!view.zoomRel) view.zoomRel = cover / contain;
    const centre = view.cell ? [
      (view.area.x + view.area.w / 2 - view.mapX) / view.cell,
      (view.area.y + view.area.h / 2 - view.mapY) / view.cell,
    ] : [G.gw / 2, G.gh / 2];
    view.cell = contain * view.zoomRel;
    view.mapX = view.area.x + view.area.w / 2 - centre[0] * view.cell;
    view.mapY = view.area.y + view.area.h / 2 - centre[1] * view.cell;
    clampView();
  }

  const pointers = new Map();
  let gesture = null;

  function pinchInfo() {
    const [p, q] = [...pointers.values()];
    return { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!G || G.demo) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Capture is a nicety only.
    }
    // A primary pointer starts a fresh gesture, so a lost release can't linger.
    if (e.isPrimary) pointers.clear();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gesture = { kind: 'tap', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY };
    } else if (pointers.size === 2) {
      const p = pinchInfo();
      gesture = { kind: 'pinch', d0: p.d, cell0: view.cell, mx: p.mx, my: p.my };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || !gesture) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const d = view.dpr;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const info = pinchInfo();
      view.mapX += (info.mx - gesture.mx) * d;
      view.mapY += (info.my - gesture.my) * d;
      gesture.mx = info.mx;
      gesture.my = info.my;
      zoomAt(info.mx * d, info.my * d, gesture.cell0 * info.d / Math.max(1, gesture.d0));
      return;
    }
    if (gesture.kind === 'tap' && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 10) {
      gesture.kind = 'pan';
    }
    if (gesture.kind === 'pan') {
      view.mapX += (e.clientX - gesture.lx) * d;
      view.mapY += (e.clientY - gesture.ly) * d;
      clampView();
    }
    gesture.lx = e.clientX;
    gesture.ly = e.clientY;
  });

  function pointerEnd(e, cancelled) {
    if (!pointers.has(e.pointerId)) return;
    const wasTap = gesture && gesture.kind === 'tap' && pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasTap && !cancelled) handleTap(e.clientX, e.clientY);
    if (pointers.size === 0) {
      gesture = null;
    } else if (pointers.size === 1) {
      // Lifting one finger of a pinch carries on as a pan, never a tap.
      const [p] = [...pointers.values()];
      gesture = { kind: 'pan', sx: p.x, sy: p.y, lx: p.x, ly: p.y };
    }
  }

  canvas.addEventListener('pointerup', (e) => pointerEnd(e, false));
  canvas.addEventListener('pointercancel', (e) => pointerEnd(e, true));

  canvas.addEventListener('wheel', (e) => {
    if (!G || G.demo) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomAt(e.clientX * view.dpr, e.clientY * view.dpr, view.cell * factor);
  }, { passive: false });

  // ---------- Rendering ----------

  function rebuildImage() {
    const { gw, gh, owner, shade, factions, rad, country, wrap } = G;
    const d = img.data;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = owner[i];
        // Left/right neighbours (-1 at a non-wrapping edge).
        const L = x > 0 ? i - 1 : wrap ? i + gw - 1 : -1;
        const R = x < gw - 1 ? i + 1 : wrap ? i - gw + 1 : -1;
        let s = shade[i];
        const p = i * 4;
        let c;
        if (o === WATER) {
          c = WATER_RGB;
        } else if (o === NEUTRAL) {
          c = NEUTRAL_RGB;
          // Faint country borders on unclaimed land.
          if (country && ((R >= 0 && owner[R] !== WATER && country[R] !== country[i])
            || (y < gh - 1 && owner[i + gw] !== WATER && country[i + gw] !== country[i]))) s *= 0.8;
        } else {
          const f = factions[o];
          const edge = (L >= 0 && owner[L] !== o && owner[L] !== WATER)
            || (R >= 0 && owner[R] !== o && owner[R] !== WATER)
            || (y > 0 && owner[i - gw] !== o && owner[i - gw] !== WATER)
            || (y < gh - 1 && owner[i + gw] !== o && owner[i + gw] !== WATER);
          c = edge ? f.border : f.color;
        }
        let r = c[0] * s;
        let g = c[1] * s;
        let b = c[2] * s;
        if (rad[i] > 0) {
          const k = 0.25 + 0.45 * Math.min(1, rad[i] / RAD_TIME);
          r += (RAD_RGB[0] - r) * k;
          g += (RAD_RGB[1] - g) * k;
          b += (RAD_RGB[2] - b) * k;
        }
        d[p] = r;
        d[p + 1] = g;
        d[p + 2] = b;
        d[p + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    G.dirty = false;
  }

  // Grid coordinates (cell units) to canvas pixels.
  const sx = (gx) => view.mapX + gx * view.cell;
  const sy = (gy) => view.mapY + gy * view.cell;
  // Screen x positions of every visible copy of something at x (World wraps).
  function copies(x, pad) {
    if (!G.wrap) return [x];
    const w = G.gw * view.cell;
    const out = [];
    for (let k = x - Math.ceil((x + pad) / w) * w; k < canvas.width + pad; k += w) out.push(k);
    return out;
  }

  let shiftX = 0;
  const onScreen = (x, y, pad) => onScreenRaw(x + shiftX, y, pad);
  const onScreenRaw = (x, y, pad) => x > -pad && y > -pad && x < canvas.width + pad && y < canvas.height + pad;

  function drawMap() {
    if (G.dirty) rebuildImage();
    ctx.imageSmoothingEnabled = false;
    const w = G.gw * view.cell;
    for (const x of copies(view.mapX, w)) ctx.drawImage(off, x, view.mapY, w, G.gh * view.cell);
  }

  function drawDeposits() {
    const r = clamp(view.cell * 1.1, 3 * view.dpr, 9 * view.dpr);
    ctx.lineWidth = Math.max(1, r * 0.3);
    for (const i of G.depositCells) {
      if (G.bAt[i] >= 0 || G.rad[i] > 0) continue;
      const y = sy(cy(i) + 0.5);
      const x = sx(cx(i) + 0.5);
      if (!onScreen(x, y, r)) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#6b4a00';
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawBuildings() {
    const size = clamp(view.cell * 2.6, 14 * view.dpr, 30 * view.dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of G.buildings.values()) {
      const x = sx(cx(b.cell) + 0.5);
      const y = sy(cy(b.cell) + 0.5);
      if (!onScreen(x, y, size)) continue;
      drawIcon(b.type, x, y, size, G.factions[b.owner].css);
      if (b.level > 1) drawLevel(b.level, x + size * 0.42, y - size * 0.42, size * 0.42);
      if (b.type === 'fort' && b.owner === myId && G.mode) {
        ctx.beginPath();
        ctx.arc(x, y, FORT_RADIUS[b.level - 1] * view.cell, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.stroke();
      }
    }
  }

  function drawLevel(level, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = level >= 3 ? '#f59e0b' : '#e5e7eb';
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = `900 ${r * 1.05}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), x, y + r * 0.05);
  }

  // Hand-drawn icons: emoji fonts vary too much between phones to rely on.
  function drawIcon(type, x, y, size, colour) {
    const h = size / 2;
    ctx.fillStyle = colour;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - h, y - h, size, size, size * 0.22) : ctx.rect(x - h, y - h, size, size);
    ctx.fill();
    ctx.stroke();
    const u = size / 10;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    if (type === 'city') {
      ctx.fillRect(x - 3.5 * u, y - 1 * u, 2 * u, 4.5 * u);
      ctx.fillRect(x - 1 * u, y - 3.5 * u, 2.2 * u, 7 * u);
      ctx.fillRect(x + 1.7 * u, y - 2 * u, 2 * u, 5.5 * u);
    } else if (type === 'mine') {
      ctx.beginPath();
      ctx.arc(x, y, 3.4 * u, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.fillStyle = '#6b4a00';
      ctx.font = `800 ${5 * u}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', x, y + 0.3 * u);
    } else if (type === 'fort') {
      ctx.beginPath();
      ctx.moveTo(x - 3.2 * u, y - 3.2 * u);
      ctx.lineTo(x + 3.2 * u, y - 3.2 * u);
      ctx.lineTo(x + 3.2 * u, y);
      ctx.quadraticCurveTo(x + 3 * u, y + 3 * u, x, y + 4 * u);
      ctx.quadraticCurveTo(x - 3 * u, y + 3 * u, x - 3.2 * u, y);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'artillery') {
      ctx.lineWidth = Math.max(1, 0.9 * u);
      ctx.beginPath();
      ctx.arc(x, y, 3 * u, 0, Math.PI * 2);
      ctx.moveTo(x - 4.2 * u, y);
      ctx.lineTo(x + 4.2 * u, y);
      ctx.moveTo(x, y - 4.2 * u);
      ctx.lineTo(x, y + 4.2 * u);
      ctx.stroke();
    } else if (type === 'silo') {
      ctx.beginPath();
      ctx.arc(x, y, 3.8 * u, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.fillStyle = '#111';
      for (let k = 0; k < 3; k++) {
        const a0 = -Math.PI / 2 + k * (Math.PI * 2 / 3) - 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, 3.3 * u, a0, a0 + 1.0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, 1.1 * u, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
    }
  }

  function centroid(f) {
    let gx = f.sx / f.cells;
    if (G.wrap) {
      // Circular mean, so a nation straddling the date line is labelled on it.
      const ang = Math.atan2(f.sa, f.ca);
      gx = ((ang / (2 * Math.PI)) * G.gw + G.gw) % G.gw;
    }
    return { x: sx(gx + 0.5), y: sy(f.sy / f.cells + 0.5) };
  }

  function drawLabels() {
    const dpr = view.dpr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of G.factions) {
      if (!f.alive || f.cells === 0) continue;
      const { x, y } = centroid(f);
      const size = clamp(Math.sqrt(f.cells) * view.cell * 0.16, 11 * dpr, 22 * dpr);
      if (!onScreen(x, y, size * 8)) continue;
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

  function drawBoats() {
    const size = clamp(view.cell * 2.4, 14 * view.dpr, 26 * view.dpr);
    for (const b of G.boats) {
      const p = Math.min(b.pos + acc * BOAT_SPEED, b.path.length - 1);
      const a = b.path[Math.floor(p)];
      const c = b.path[Math.min(b.path.length - 1, Math.floor(p) + 1)];
      const t = p - Math.floor(p);
      const x = sx(cx(a) + ddx(c, a) * t + 0.5);
      const y = sy(cy(a) + (cy(c) - cy(a)) * t + 0.5);
      if (!onScreen(x, y, size)) continue;
      const u = size / 10;
      ctx.fillStyle = G.factions[b.owner].css;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, u * 0.8);
      ctx.beginPath();
      ctx.moveTo(x - 5 * u, y + 0.5 * u);
      ctx.lineTo(x + 5 * u, y + 0.5 * u);
      ctx.lineTo(x + 3 * u, y + 3.5 * u);
      ctx.lineTo(x - 3 * u, y + 3.5 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 0.3 * u, y - 5 * u);
      ctx.lineTo(x - 0.3 * u, y);
      ctx.lineTo(x + 3.5 * u, y - 0.5 * u);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  function arcPoint(from, to, t, lift) {
    const x0 = cx(from) + 0.5;
    const y0 = cy(from) + 0.5;
    const x1 = x0 + ddx(to, from);
    const y1 = cy(to) + 0.5;
    const h = Math.hypot(x1 - x0, y1 - y0) * lift * Math.sin(Math.PI * t);
    return { x: sx(x0 + (x1 - x0) * t), y: sy(y0 + (y1 - y0) * t - h) };
  }

  function drawProjectiles() {
    const dpr = view.dpr;
    for (const s of G.shells) {
      const p = arcPoint(s.from, s.to, Math.min(1, (s.t + acc) / s.dur), 0.35);
      if (!onScreen(p.x, p.y, 10)) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#1f1f1f';
      ctx.fill();
    }
    for (const m of G.missiles) {
      const t = Math.min(1, (m.t + acc) / m.dur);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const q = arcPoint(m.from, m.to, t * k / 12, 0.45);
        if (k === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      const p = arcPoint(m.from, m.to, t, 0.45);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      // Target marker so everyone can see where it will land.
      const tx = sx(cx(m.from) + 0.5 + ddx(m.to, m.from));
      const ty = sy(cy(m.to) + 0.5);
      ctx.beginPath();
      ctx.arc(tx, ty, m.radius * view.cell, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.8)';
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawFx(now) {
    for (const f of G.fx) {
      const t = (now - f.start) / f.dur;
      const r = Math.max(4 * view.dpr, f.radius * view.cell * (0.3 + 0.7 * t));
      ctx.beginPath();
      ctx.arc(sx(f.x), sy(f.y), r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${f.rgb},${0.75 * (1 - t)})`;
      ctx.fill();
    }
  }

  function drawAttackMarkers(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    for (const a of G.attacks) {
      if (a.from !== myId) continue;
      const r = (6 + pulse * 4) * view.dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2 * view.dpr;
      ctx.beginPath();
      ctx.arc(sx(a.aimX + 0.5), sy(a.aimY + 0.5), r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function render(now) {
    ctx.fillStyle = '#07101d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!G) return;
    drawMap();
    G.fx = G.fx.filter((f) => now - f.start < f.dur);
    for (const origin of copies(view.mapX, G.gw * view.cell)) {
      shiftX = origin - view.mapX;
      ctx.save();
      ctx.translate(shiftX, 0);
      drawDeposits();
      drawBuildings();
      drawBoats();
      drawProjectiles();
      drawFx(now);
      if (!G.demo) {
        drawLabels();
        drawAttackMarkers(now);
      }
      ctx.restore();
    }
    shiftX = 0;
  }

  // ---------- HUD, banners and the build sheet ----------

  function updateBanner() {
    const banner = $('banner');
    const text = $('banner-text');
    const btn = $('btn-banner');
    if (!G || G.demo) return;
    if (G.state === 'spawn' && G.factions[myId].capital >= 0) {
      text.innerHTML = 'Waiting for the other players to choose…';
      btn.classList.add('hidden');
      banner.dataset.kind = 'spawn';
    } else if (G.state === 'spawn') {
      text.innerHTML = G.real ? '<strong>Tap a country</strong> to lead it' : '<strong>Tap the map</strong> to place your capital';
      btn.textContent = 'Random';
      btn.classList.remove('hidden');
      banner.dataset.kind = 'spawn';
    } else if (G.mode && G.mode.type === 'build') {
      const b = BUILDINGS[G.mode.building];
      text.innerHTML = `<strong>Tap your land</strong> to place ${b.icon} ${b.label}`;
      btn.textContent = 'Cancel';
      banner.dataset.kind = 'mode';
    } else if (G.mode && G.mode.type === 'nuke') {
      text.innerHTML = '<strong>Tap a target</strong> to nuke ☢';
      btn.textContent = 'Cancel';
      banner.dataset.kind = 'mode';
    } else {
      banner.dataset.kind = '';
    }
  }

  function updateHud(force) {
    if (!G || G.demo) return;
    const me = G.factions[myId];
    $('troops').textContent = fmt(me.troops);
    $('troops-max').textContent = '/ ' + fmt(maxTroops(me));
    $('gold').textContent = fmt(me.gold);
    $('land').textContent = (me.cells / G.landCells * 100).toFixed(1) + '%';
    $('clock').textContent = fmtTime(G.time);
    $('pct-label').textContent = `${settings.pct}% · ${fmt(me.troops * settings.pct / 100)}`;
    const nuke = $('btn-nuke');
    nuke.classList.toggle('hidden', !me.built.silo);
    const reload = Math.ceil(me.nextNuke - G.time);
    nuke.disabled = me.gold < NUKE_COST || reload > 0 || G.state !== 'play';
    nuke.textContent = reload > 0 ? `☢ ${reload}s` : `☢ ${NUKE_COST}g`;

    const mine = G.attacks.filter((a) => a.from === myId);
    const boats = G.boats.filter((b) => b.owner === myId);
    const incoming = G.attacks.filter((a) => a.to === myId);
    let hint = 'Tap land to attack · drag to pan · pinch to zoom';
    if (G.state === 'spawn') hint = G.real ? 'Choose the country you will lead' : 'Choose where your empire begins';
    else if (incoming.length) {
      hint = '⚠ Under attack by ' + incoming.map((a) => `${G.factions[a.from].name} (${fmt(a.troops)})`).join(', ');
    } else if (mine.length || boats.length) {
      hint = '⚔ ' + mine.map((a) => `${targetName(a.to)}: ${fmt(a.troops)}`)
        .concat(boats.map((b) => `⛵ ${fmt(b.troops)}`)).join(' · ');
    }
    $('hint').textContent = hint;

    if (force || G.time - hudTimer >= 0.5 || G.time < hudTimer) {
      hudTimer = G.time;
      const rows = G.factions
        .filter((f) => f.alive)
        .sort((a, b) => b.cells - a.cells)
        .slice(0, 6)
        .map((f) => {
          const pc = (f.cells / G.landCells * 100).toFixed(1);
          return `<li class="${f.id === myId ? 'me' : ''}"><span class="sw" style="background:${f.css}"></span>`
            + `${f.name}<span class="pc">${pc}%</span></li>`;
        });
      $('board').innerHTML = rows.join('');
      if ($('build-sheet').classList.contains('show')) renderBuildSheet();
    }
  }

  // The sheet shows either the build menu or one building's upgrade panel.
  let sheetBuilding = null;

  function renderBuildSheet() {
    const me = G.factions[myId];
    const b = sheetBuilding && G.buildings.get(sheetBuilding);
    if (sheetBuilding && (!b || b.owner !== myId)) {
      closeBuildSheet();
      return;
    }
    if (b) {
      const info = BUILDINGS[b.type];
      $('sheet-title').textContent = `${info.icon} ${info.label} · level ${b.level}`;
      let html = `<p class="now">${info.stats(b.level)}</p>`;
      if (b.level < MAX_LEVEL) {
        const cost = upgradeCost(b);
        html += `<button data-upgrade="${b.id}" ${me.gold < cost ? 'disabled' : ''}>`
          + `<span class="bi">⬆️</span><span class="bt"><b>Upgrade to level ${b.level + 1}</b>`
          + `<small>${info.stats(b.level + 1)}</small></span><span class="bc">${fmt(cost)}g</span></button>`;
      } else {
        html += '<p class="now">Fully upgraded.</p>';
      }
      $('build-list').innerHTML = html;
      return;
    }
    $('sheet-title').textContent = 'Build';
    $('build-list').innerHTML = BUILD_ORDER.map((type) => {
      const info = BUILDINGS[type];
      const cost = costOf(me, type);
      return `<button data-type="${type}" ${me.gold < cost ? 'disabled' : ''}>`
        + `<span class="bi">${info.icon}</span><span class="bt"><b>${info.label}</b><small>${info.stats(1)}</small></span>`
        + `<span class="bc">${fmt(cost)}g</span></button>`;
    }).join('') + '<p class="now">Tip: tap one of your buildings to upgrade it.</p>';
  }

  function openBuildSheet() {
    if (!G || G.state !== 'play') return;
    sheetBuilding = null;
    renderBuildSheet();
    $('build-sheet').classList.add('show');
  }

  function openUpgradeSheet(b) {
    if (!G || G.state !== 'play') return;
    sheetBuilding = b.id;
    renderBuildSheet();
    $('build-sheet').classList.add('show');
  }

  function closeBuildSheet() {
    sheetBuilding = null;
    $('build-sheet').classList.remove('show');
  }

  // ---------- Main loop ----------

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (G && net.role !== 'client' && ((G.demo && G.state === 'menu') || G.state === 'play')) {
      acc += dt * (G.demo ? 1.5 : speed);
      let steps = 0;
      while (acc >= TICK && steps < 40) {
        tick();
        acc -= TICK;
        steps++;
        if (!G || G.state === 'over') break;
      }
    }
    if (net.role === 'host' && now - net.lastSend > 100) {
      net.lastSend = now;
      netBroadcast();
    }
    render(now);
    updateHud(false);
    requestAnimationFrame(frame);
  }

  // ---------- Menus and controls ----------

  function syncMenu() {
    const segs = { 'seg-opp': String(settings.opponents), 'seg-diff': settings.difficulty, 'seg-map': settings.map };
    for (const [id, value] of Object.entries(segs)) {
      for (const b of document.querySelectorAll(`#${id} button`)) b.classList.toggle('on', b.dataset.v === value);
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

  function bindSeg(id, key, parse) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      settings[key] = parse(b.dataset.v);
      saveSettings();
      syncMenu();
    });
  }
  bindSeg('seg-opp', 'opponents', Number);
  bindSeg('seg-diff', 'difficulty', String);
  bindSeg('seg-map', 'map', String);

  $('pct').addEventListener('input', (e) => {
    settings.pct = Number(e.target.value);
    saveSettings();
    updateHud(false);
  });

  $('btn-play').addEventListener('click', () => newGame(false));
  $('btn-again').addEventListener('click', () => newGame(false));
  $('btn-restart').addEventListener('click', () => newGame(false));
  $('btn-watch').addEventListener('click', () => $('over').classList.remove('show'));

  function toMenu() {
    netLeave();
    $('over').classList.remove('show');
    syncMenu();
    newGame(true);
  }
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-quit').addEventListener('click', toMenu);

  $('btn-banner').addEventListener('click', () => {
    if (!G) return;
    if (G.state === 'spawn') {
      perform({ a: 'spawn', cell: -1 }, (res) => res.ok && afterSpawn(res.cell));
    } else {
      G.mode = null;
    }
    updateBanner();
  });

  $('btn-build').addEventListener('click', () => {
    if ($('build-sheet').classList.contains('show')) closeBuildSheet();
    else openBuildSheet();
  });
  $('btn-build-close').addEventListener('click', closeBuildSheet);
  $('build-list').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !G) return;
    if (b.dataset.upgrade) {
      perform({ a: 'upgrade', id: Number(b.dataset.upgrade) }, () => renderBuildSheet());
      return;
    }
    G.mode = { type: 'build', building: b.dataset.type };
    closeBuildSheet();
    updateBanner();
  });

  $('btn-nuke').addEventListener('click', () => {
    if (!G || G.state !== 'play') return;
    closeBuildSheet();
    G.mode = { type: 'nuke' };
    updateBanner();
  });

  function pause() {
    if (!G || G.demo || (G.state !== 'play' && G.state !== 'spawn')) return;
    if (net.role) {
      // Multiplayer never stops the clock: just show the menu.
      closeBuildSheet();
      document.body.dataset.state = 'paused';
      return;
    }
    pausedFrom = G.state;
    pointers.clear();
    gesture = null;
    closeBuildSheet();
    setState('paused');
  }

  $('btn-pause').addEventListener('click', pause);
  $('btn-resume').addEventListener('click', () => {
    if (net.role && G) document.body.dataset.state = G.state;
    else if (G && G.state === 'paused') setState(pausedFrom);
  });

  $('btn-speed').addEventListener('click', () => {
    speed = speed >= 3 ? 1 : speed + 1;
    $('btn-speed').textContent = speed + '×';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !net.role) pause();
  });

  // Android back button: cancel a build/nuke, else pause rather than leave.
  window.addEventListener('popstate', () => {
    if (G && !G.demo && (G.state === 'play' || G.state === 'spawn')) {
      if (G.mode || $('build-sheet').classList.contains('show')) {
        G.mode = null;
        closeBuildSheet();
        updateBanner();
      } else {
        pause();
      }
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

  // ---------- Multiplayer (WebRTC via PeerJS) ----------
  //
  // A free public PeerJS server introduces the devices; game traffic then
  // flows directly between them (over the LAN when they share a network).
  // The host runs the simulation and streams snapshots ~10 times a second;
  // clients only render and send their taps as actions.

  const PEER_PREFIX = 'pixelwar-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  function playerName() {
    const n = ($('mp-name').value || '').trim().replace(/[<>&"]/g, '').slice(0, 12);
    return n || 'Player';
  }

  const cleanName = (n) => String(n || 'Player').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'Player';

  function showLobby(status) {
    document.body.dataset.state = 'lobby';
    $('lobby-status').textContent = status || '';
    $('lobby-code').textContent = net.code || '····';
    $('btn-start').classList.toggle('hidden', net.role !== 'host');
    $('lobby-note').textContent = net.role === 'host'
      ? 'Friends open Pixel War on any device (browser, Android or Windows), tap Join and enter this code. '
        + 'The map, AI opponents and difficulty come from your menu settings.'
      : 'Waiting for the host to start the game…';
  }

  function renderLobby(players) {
    $('lobby-code').textContent = net.code;
    $('lobby-players').innerHTML = players.map((p, k) =>
      `<li><span class="sw" style="background:${FACTIONS[k].css || `rgb(${FACTIONS[k].color.join(',')})`}"></span>${p}${k === 0 ? ' (host)' : ''}</li>`).join('');
    $('btn-start').disabled = players.length < 2;
    $('lobby-status').textContent = `${players.length} player${players.length > 1 ? 's' : ''} in the room`;
  }

  function lobbyPlayers() {
    return [playerName()].concat([...net.conns.values()].map((p) => p.name));
  }

  function lobbyBroadcast() {
    const players = lobbyPlayers();
    renderLobby(players);
    for (const p of net.conns.values()) if (p.conn.open) p.conn.send({ t: 'lobby', code: net.code, players });
  }

  function hostGame() {
    if (!window.Peer) {
      toast('Multiplayer could not load. Check your connection');
      return;
    }
    netLeave();
    net.role = 'host';
    net.code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    document.body.classList.add('mp');
    showLobby('Creating a room…');
    const peer = new window.Peer(PEER_PREFIX + net.code);
    net.peer = peer;
    peer.on('open', () => {
      if (net.opened) return;
      net.opened = true;
      if (document.body.dataset.state === 'lobby') showLobby('');
      lobbyBroadcast();
    });
    keepAlive(peer);
    net.peer.on('connection', (conn) => {
      conn.on('data', (msg) => hostReceive(conn, msg));
      conn.on('close', () => hostDrop(conn));
      conn.on('error', () => hostDrop(conn));
    });
    peer.on('error', (e) => {
      console.warn('[net] host error:', e.type, e.message);
      if (net.peer !== peer) return;
      if (e.type === 'unavailable-id' && !net.opened) hostGame();
      else if (!net.opened && e.type !== 'peer-unavailable') netFail('Multiplayer connection failed. Check your internet connection');
    });
  }

  // Losing the matchmaking server (e.g. the app went into the background)
  // doesn't affect connected players, so quietly reconnect.
  function keepAlive(peer) {
    peer.on('disconnected', () => {
      console.warn('[net] signalling server lost; reconnecting');
      setTimeout(() => {
        if (net.peer === peer && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, 1500);
    });
  }

  function hostReceive(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      const started = G && !G.demo;
      if (started || net.conns.size >= FACTIONS.length - 1) {
        conn.send({ t: 'refused', why: started ? 'That game has already started' : 'That room is full' });
        setTimeout(() => conn.close(), 500);
        return;
      }
      net.conns.set(conn.peer, { conn, name: cleanName(msg.name), fid: -1 });
      lobbyBroadcast();
    } else if (msg.t === 'act') {
      const p = net.conns.get(conn.peer);
      if (!p || p.fid < 0) return;
      const res = doAction(p.fid, msg.act);
      conn.send(Object.assign({ t: 'res', seq: msg.seq }, res));
    }
  }

  function hostDrop(conn) {
    const p = net.conns.get(conn.peer);
    if (!p) return;
    net.conns.delete(conn.peer);
    if (p.fid >= 0 && G && !G.demo) {
      // An AI takes over the departed player's nation.
      const f = G.factions[p.fid];
      f.isPlayer = false;
      f.persona = 'Balanced';
      f.aggr = 0.55;
      f.nextThink = G.time + 1;
      if (G.state === 'spawn' && f.capital < 0) actSpawn(f.id, -1);
      if (G.state === 'spawn' && G.factions.every((o) => !o.isPlayer || o.capital >= 0)) setState('play');
      announce({ k: 'msg', text: `${p.name} left. An AI takes over ${f.name}` });
    } else {
      lobbyBroadcast();
    }
  }

  function startMultiplayer() {
    if (net.role !== 'host' || !net.conns.size) return;
    newGame(false, lobbyPlayers());
    let fid = 1;
    for (const p of net.conns.values()) {
      p.fid = fid++;
      p.conn.send({
        t: 'start',
        myId: p.fid,
        kind: G.kind,
        seed: G.seed,
        gw: G.gw,
        gh: G.gh,
        difficulty: settings.difficulty,
        factions: G.factions.map((f) => ({ name: f.name, player: f.player, isPlayer: f.isPlayer, persona: f.persona })),
        snap: snapshot(true),
      });
    }
    clearTracking();
    net.sentBver = G.bver;
  }

  function rle(arr) {
    const out = [];
    for (let i = 0; i < arr.length;) {
      let j = i + 1;
      while (j < arr.length && arr[j] === arr[i]) j++;
      out.push(arr[i], j - i);
      i = j;
    }
    return out;
  }

  function snapshot(full) {
    const cells = [];
    if (!full) for (const i of G.changed) cells.push(i, G.owner[i]);
    const rad = [];
    if (full) for (const i of G.radList) rad.push(i, G.rad[i]);
    return {
      t: 'snap',
      time: G.time,
      state: G.state,
      winner: G.winner,
      own: full ? rle(G.owner) : null,
      cells,
      rad: full ? rad : G.radEvents,
      f: G.factions.map((f) => [Math.round(f.troops), Math.round(f.gold), f.alive ? 1 : 0, f.capital,
        Math.max(0, f.nextNuke - G.time), f.kills, f.name, f.isPlayer ? 1 : 0]),
      b: full || G.bver !== net.sentBver
        ? [...G.buildings.values()].map((b) => [b.id, b.type, b.cell, b.owner, b.level, b.hp]) : null,
      boats: G.boats.map((b) => {
        const k = Math.floor(b.pos);
        return [b.owner, b.path[k], b.path[Math.min(b.path.length - 1, k + 1)], b.pos - k, Math.round(b.troops)];
      }),
      shells: G.shells.map((s) => [s.from, s.to, s.t, s.dur]),
      missiles: G.missiles.map((m) => [m.from, m.to, m.t, m.dur, m.radius]),
      attacks: G.attacks.map((a) => [a.from, a.to, Math.round(a.troops), a.aimX, a.aimY]),
      fx: G.fxEvents,
      ev: G.events,
    };
  }

  function clearTracking() {
    for (const i of G.changed) G.changedMark[i] = 0;
    G.changed = [];
    G.radEvents = [];
    G.fxEvents = [];
    G.events = [];
  }

  function netBroadcast() {
    if (!G || G.demo || !G.track) return;
    if (net.conns.size) {
      const snap = snapshot(false);
      for (const p of net.conns.values()) if (p.fid >= 0 && p.conn.open) p.conn.send(snap);
      net.sentBver = G.bver;
    }
    clearTracking();
  }

  function joinGame(code) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      toast('Room codes are 4 letters');
      return;
    }
    if (!window.Peer) {
      toast('Multiplayer could not load. Check your connection');
      return;
    }
    netLeave();
    net.role = 'client';
    net.code = code;
    document.body.classList.add('mp', 'mp-client');
    showLobby('Connecting…');
    $('lobby-players').innerHTML = '';
    const peer = new window.Peer();
    net.peer = peer;
    keepAlive(peer);
    peer.on('open', () => {
      if (net.host) return;
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      net.host = conn;
      conn.on('open', () => conn.send({ t: 'hello', name: playerName() }));
      conn.on('data', clientReceive);
      conn.on('close', () => {
        if (net.role === 'client') netFail('The host has left the game');
      });
    });
    peer.on('error', (e) => {
      console.warn('[net] client error:', e.type, e.message);
      if (net.peer !== peer) return;
      if (e.type === 'peer-unavailable') netFail(`No game found with code ${code}`);
      else if (!net.host || !net.host.open) netFail('Could not connect. Check your internet connection');
    });
  }

  function clientReceive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') {
      net.code = msg.code;
      renderLobby(msg.players);
    } else if (msg.t === 'refused') {
      netFail(msg.why);
    } else if (msg.t === 'start') {
      clientStart(msg);
    } else if (msg.t === 'snap') {
      if (G && !G.demo) applySnapshot(msg);
    } else if (msg.t === 'res') {
      const cb = net.pending.get(msg.seq);
      net.pending.delete(msg.seq);
      if (cb) cb(msg);
    }
  }

  function netRequest(act, cb) {
    if (!net.host || !net.host.open) {
      cb(fail('Not connected to the host'));
      return;
    }
    const seq = ++net.seq;
    net.pending.set(seq, cb);
    net.host.send({ t: 'act', seq, act });
  }

  function clientStart(msg) {
    $('over').classList.remove('show');
    settings.difficulty = DIFFICULTY[msg.difficulty] ? msg.difficulty : settings.difficulty;
    myId = msg.myId;
    buildWorld(msg.kind, msg.seed, msg.gw, msg.gh, false);
    G.mp = true;
    G.factions = msg.factions.map((f, id) => makeFaction(id, {
      name: f.name, player: f.player, isPlayer: f.isPlayer, persona: f.persona,
    }));
    setState('spawn');
    view.zoomRel = 0;
    view.cell = 0;
    resize();
    applySnapshot(msg.snap);
    updateBanner();
    updateHud(true);
  }

  function applySnapshot(s) {
    const dt = Math.max(0, s.time - G.time);
    G.time = s.time;
    if (s.own) {
      let p = 0;
      for (let k = 0; k < s.own.length; k += 2) {
        for (let r = 0; r < s.own[k + 1]; r++, p++) assignCell(p, s.own[k]);
      }
    }
    for (let k = 0; k < s.cells.length; k += 2) assignCell(s.cells[k], s.cells[k + 1]);
    // Fallout decays locally; the host only reports fresh contamination.
    if (dt && G.radList.length) {
      G.radList = G.radList.filter((i) => (G.rad[i] -= dt) > 0 || ((G.rad[i] = 0), false));
      G.dirty = true;
    }
    for (let k = 0; k < s.rad.length; k += 2) {
      if (G.rad[s.rad[k]] <= 0) G.radList.push(s.rad[k]);
      G.rad[s.rad[k]] = s.rad[k + 1];
      G.dirty = true;
    }
    s.f.forEach((v, id) => {
      const f = G.factions[id];
      [f.troops, f.gold] = [v[0], v[1]];
      f.alive = !!v[2];
      f.capital = v[3];
      f.nextNuke = G.time + v[4];
      f.kills = v[5];
      f.name = v[6];
      f.isPlayer = !!v[7];
    });
    if (s.b) {
      for (const b of G.buildings.values()) G.bAt[b.cell] = -1;
      G.buildings = new Map();
      for (const f of G.factions) for (const k of Object.keys(f.built)) f.built[k] = 0;
      for (const [id, type, cell, owner, level, hp] of s.b) {
        G.buildings.set(id, { id, type, cell, owner, level, hp });
        G.bAt[cell] = id;
        G.factions[owner].built[type]++;
      }
    }
    G.boats = s.boats.map(([owner, a, c, pos, troops]) => ({ owner, path: [a, c], pos, troops }));
    G.shells = s.shells.map(([from, to, t, dur]) => ({ from, to, t, dur }));
    G.missiles = s.missiles.map(([from, to, t, dur, radius]) => ({ from, to, t, dur, radius }));
    G.attacks = s.attacks.map(([from, to, troops, aimX, aimY]) => ({ from, to, troops, aimX, aimY }));
    for (const [cell, radius, rgb, dur] of s.fx) addFx(cell, radius, rgb, dur);
    for (const ev of s.ev) showEvent(ev);
    tallyBonuses();

    if (s.state !== G.state && G.state !== 'over') {
      setState(s.state);
      updateBanner();
    }
    const me = G.factions[myId];
    if (me.capital >= 0) afterSpawn(me.capital);
    G.peakLand = Math.max(G.peakLand, me.cells / G.landCells);
    G.winner = s.winner;
    if (s.state === 'over') showResult(true);
    else if (!me.alive && me.capital >= 0) showResult(false);
  }

  function netLeave() {
    const role = net.role;
    net.role = null;
    try {
      if (net.host) net.host.close();
      for (const p of net.conns.values()) p.conn.close();
      if (net.peer) net.peer.destroy();
    } catch (e) {
      // Already closed.
    }
    net.peer = null;
    net.host = null;
    net.conns.clear();
    net.pending.clear();
    net.code = '';
    net.opened = false;
    myId = 0;
    document.body.classList.remove('mp', 'mp-client');
    if (role && document.body.dataset.state === 'lobby') document.body.dataset.state = G ? G.state : 'menu';
  }

  function netFail(msg) {
    toast(msg);
    toMenu();
  }

  $('btn-host').addEventListener('click', () => {
    store.set('name', playerName());
    hostGame();
  });
  $('btn-join').addEventListener('click', () => {
    store.set('name', playerName());
    joinGame($('mp-code').value);
  });
  $('mp-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-join').click();
  });
  $('btn-start').addEventListener('click', startMultiplayer);
  $('btn-leave').addEventListener('click', toMenu);
  $('mp-name').value = store.get('name', '');

  // Exposed for debugging and automated play-testing.
  window.pixelWar = {
    get game() { return G; },
    get myId() { return myId; },
    net,
    doAction,
    view,
    // Client (CSS pixel) position of a cell's centre, for automated tests.
    clientPos: (i) => ({ x: (sx(cx(i) + 0.5)) / view.dpr, y: (sy(cy(i) + 0.5)) / view.dpr }),
    tick,
    newGame,
    build,
    launchNuke,
    launchBoat,
    upgrade,
  };

  syncMenu();
  newGame(true);
  requestAnimationFrame(frame);
})();
