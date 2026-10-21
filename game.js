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
  // Players must run the same version to share a game (keep in step with
  // package.json).
  const APP_VERSION = '1.9.4';
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
  const CITY_CAP = [3000, 6000, 10000];
  const CITY_TROOPS = [8, 16, 28];
  const CITY_GOLD = [3, 6, 10];
  const MINE_GOLD = [4, 7, 11];
  const FORT_RADIUS = [8, 11, 14];
  const FORT_MULT = [6, 10, 15];
  const FORT_SHIELD = 0.5;        // defenders inside fort range lose half as many troops
  const FORT_SLOW = [0.5, 0.65, 0.8];        // chance a fort line holds out each tick
  const FORT_SIEGE = [2, 4, 6];              // seconds a fort holds under attack before it falls
  const SIEGE_ODDS = [1.5, 2, 3];            // attackers needed, per defender, to besiege a fort or wall
  // Walls join two of your forts into one fortified line.
  const WALL_MAX = 40;            // furthest apart two walled forts can be (cells)
  const WALL_COST = 400;
  const WALLS_PER_FORT = 2;
  const FORT_ATTRITION = [0.003, 0.0045, 0.006]; // share of an attack lost per tick at a fort line
  // After a blast, the land's old owner can't retake it for a while, giving
  // the attacker the chance to move in.
  const NUKE_LOCK = 30;
  const TSAR_LOCK = 45;
  const BOMB_LOCK = 15;
  const SHELL_LOCK = 8;
  // Share of a nation's troops killed by each hit (besides those on the land).
  const NUKE_KILL = 0.1;
  const TSAR_KILL = 0.25;
  const BOMB_KILL = 0.015;
  const SHELL_KILL = 0.0025;
  const RAD_MULT = 4;             // irradiated land is this much harder to take
  const RAD_TIME = 45;
  const ART_RANGE = [22, 28, 34];
  const ART_RELOAD = [3.5, 2.4, 1.5];
  const ART_BLAST = [1, 1, 2];
  const SHELL_TIME = 1.2;
  // Coastal batteries shell enemy troop boats (and warships) offshore.
  const COAST_RANGE = [16, 20, 26];
  const COAST_RELOAD = [1.5, 1.1, 0.9];     // seconds between shells
  const COAST_SPLASH = 1.5;                  // boats this close to the one hit are hit too
  const COAST_KILL = [0.2, 0.25, 0.3];       // share of a boat's troops killed per hit
  const COAST_SINK = 0.35;                   // a boat sinks once fewer than this share of its troops are left
  const COAST_SHELL_TIME = 0.5;
  const NUKE_COST = 900;
  const NUKE_RADIUS = [7, 10, 13];
  const NUKE_TIME = 3;
  const NUKE_COOLDOWN = [30, 20, 12]; // seconds between launches per faction
  // Tsar Bomba: the super-nuke, launched from a level 3 silo.
  const TSAR_COST = 4000;
  const TSAR_RADIUS = 28;
  const TSAR_TIME = 5;
  const TSAR_RAD_TIME = 90;
  const TSAR_COOLDOWN = 120;
  // SAM sites shoot down enemy nukes passing within range.
  const SAM_RANGE = [16, 22, 28];
  const SAM_RELOAD = [20, 14, 9];
  const INTERCEPT_SPEED = 70;     // cells per second for a SAM's interceptor
  // Airfields drop paratroopers on land within range.
  const AIR_RANGE = [80, 120, 170];
  const AIR_RELOAD = [25, 18, 12];
  const PLANE_TIME = 2;
  // Air strikes: a bomber carpet-bombs the target area.
  const STRIKE_COST = 300;
  const STRIKE_BOMBS = 6;
  const STRIKE_SPREAD = 4;        // cells around the target the bombs fall in
  // Barracks make every attack cheaper (the best barracks counts).
  const BARRACKS_DISCOUNT = [0.15, 0.25, 0.35];
  // Warships, built at a shipyard. Speeds in cells per second; ranges in cells.
  const SHIPS = {
    battleship: { label: 'Battleship', icon: '⚓', cost: 400, hp: 5, speed: 6, range: 14, reload: 2.5 },
    carrier: { label: 'Aircraft carrier', icon: '🛩️', cost: 1500, hp: 10, speed: 4 },
  };
  const SHIPS_PER_YARD_LEVEL = 2;
  const MAX_SHIPS = 8;
  // Supply drops appear on unclaimed land.
  const CRATE_MAX = 4;
  const CRATE_GOLD = 600;
  const BOAT_SPEED = 10;          // cells per second
  const MAX_BOATS = 3;
  const DEPOSIT_EVERY = 300;      // land cells per gold deposit
  const TINY_ISLAND = 5;          // islands smaller than this many cells are removed
  // Gameplay distances and rates are tuned for these map widths; finer maps
  // scale them up so a game plays the same at any resolution.
  const BASE_WIDTH = { world: 420, europe: 260 };
  const MIN_SPACING = 2;          // free cells required around a building

  const NEUTRAL_RGB = [196, 190, 168];
  const WATER_RGB = [22, 58, 104];
  const RAD_RGB = [120, 255, 70];

  // Colours players can pick; AI nations take whatever is left. On random
  // maps an AI is named after its colour.
  const COLOURS = [
    { name: 'Blue', rgb: [59, 130, 246] },
    { name: 'Crimson', rgb: [220, 38, 38] },
    { name: 'Amber', rgb: [234, 150, 12] },
    { name: 'Jade', rgb: [16, 170, 110] },
    { name: 'Violet', rgb: [139, 92, 246] },
    { name: 'Rose', rgb: [226, 72, 153] },
    { name: 'Teal', rgb: [20, 184, 166] },
    { name: 'Lime', rgb: [132, 204, 22] },
    { name: 'White', rgb: [236, 238, 242] },
    { name: 'Bronze', rgb: [150, 98, 52] },
  ];
  const MAX_FACTIONS = 6;
  const colourCss = (k) => `rgb(${COLOURS[k].rgb.join(',')})`;

  // Give each human their chosen colour unless someone earlier has it, in
  // which case they get the next free one.
  function resolveColours(wanted) {
    const used = new Set();
    return wanted.map((w) => {
      let k = Number.isInteger(w) && COLOURS[w] ? w : 0;
      while (used.has(k)) k = (k + 1) % COLOURS.length;
      used.add(k);
      return k;
    });
  }

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
  // AI nations' troop and gold income, aggression and how keen they are to
  // pick on human players (eased by about 20% after play-testing).
  const DIFFICULTY = {
    // AI growth and how much they pick on players, all eased by 15%.
    easy: { income: 0.64 * 0.85, aggr: -0.25, playerBias: 0.65 * 0.85, siloAggr: Infinity },
    normal: { income: 0.8 * 0.85, aggr: -0.1, playerBias: 0.8 * 0.85, siloAggr: 0.65 },
    hard: { income: 0.96 * 0.85, aggr: 0.05, playerBias: 1.05 * 0.85, siloAggr: 0.45 },
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
      label: 'Fort', icon: '🛡️', cost: 180, step: 1.3, hp: 6,
      stats: (l) => `Land within ${FORT_RADIUS[l - 1]} cells is ${FORT_MULT[l - 1]}× harder to take, invaders advance `
        + `${Math.round(1 / (1 - FORT_SLOW[l - 1]))}× slower and keep losing troops, the fort holds out ${FORT_SIEGE[l - 1]}s under siege, `
        + 'and defenders there lose half as many troops',
    },
    artillery: {
      label: 'Artillery', icon: '🎯', cost: 350, step: 1.35, hp: 2,
      stats: (l) => `Range ${ART_RANGE[l - 1]}, fires every ${ART_RELOAD[l - 1]}s${ART_BLAST[l - 1] > 1 ? ', bigger blast' : ''}`,
    },
    silo: {
      label: 'Nuclear silo', icon: '☢️', cost: 1200, step: 1.5, hp: 3,
      stats: (l) => `Nukes (${NUKE_COST}g): blast radius ${NUKE_RADIUS[l - 1]}, reload ${NUKE_COOLDOWN[l - 1]}s. Each silo reloads separately`
        + (l === 3 ? `. Unlocks the Tsar Bomba (${fmt(TSAR_COST)}g)` : ''),
    },
    sam: {
      label: 'SAM site', icon: '📡', cost: 600, step: 1.4, hp: 4,
      stats: (l) => `Shoots down enemy nukes within ${SAM_RANGE[l - 1]} cells, once every ${SAM_RELOAD[l - 1]}s`,
    },
    airfield: {
      label: 'Airfield', icon: '✈️', cost: 500, step: 1.4, hp: 3,
      stats: (l) => `Paradrop troops up to ${AIR_RANGE[l - 1]} cells away, every ${AIR_RELOAD[l - 1]}s`,
    },
    shipyard: {
      label: 'Shipyard', icon: '🚢', cost: 450, step: 1.4, hp: 4,
      stats: (l) => `Builds warships (on the coast). Up to ${l * SHIPS_PER_YARD_LEVEL} ships from this yard`,
    },
    coastal: {
      label: 'Coastal battery', icon: '🌊', cost: 400, step: 1.35, hp: 3,
      stats: (l) => `Shells enemy troop boats within ${COAST_RANGE[l - 1]} cells, one every ${COAST_RELOAD[l - 1]}s, `
        + `killing ${Math.round(COAST_KILL[l - 1] * 100)}% of the troops aboard each boat caught in the blast (badly hit boats sink). `
        + 'Also hits warships. Build on the coast',
    },
    barracks: {
      label: 'Barracks', icon: '⚔️', cost: 300, step: 1.5, hp: 3,
      stats: (l) => `Your attacks cost ${Math.round(BARRACKS_DISCOUNT[l - 1] * 100)}% fewer troops`,
    },
  };
  // Upgrading to level 2 costs 1.2× the base price, to level 3 2.4×.
  const UPGRADE_MULT = [0, 1.2, 2.4];
  const BUILD_ORDER = ['city', 'mine', 'fort', 'barracks', 'artillery', 'coastal', 'sam', 'airfield', 'shipyard', 'silo'];

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

  const settings = Object.assign({ opponents: 3, allies: 0, difficulty: 'normal', pct: 50, map: 'world', colour: 0 },
    store.get('settings', {}));
  if (!(settings.opponents >= 1)) settings.opponents = 1;
  const record = Object.assign({ wins: 0, losses: 0, fastest: null }, store.get('record', {}));

  // ---------- State ----------

  let G = null;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let hudTimer = 0;
  let shakeUntil = 0;             // screen shake after a nuclear blast
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
    seats: new Map(),             // host: rejoin token -> { fid, name, colour }
    token: '',                    // client: our rejoin token for this game
    reconnectUntil: 0,            // client: reconnecting until this time (ms)
    rejoinAttempt: 0,
    peerOptions: null,
  };
  const view = { dpr: 1, mapX: 0, mapY: 0, cell: 1, zoom: 1, minCell: 1, area: null, zoomRel: 1 };
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
  const sfx = (name, opts) => window.PixelSound && window.PixelSound.play(name, opts);
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
  // Scale a distance (sc) or an area (sc2) to this map's resolution.
  const sc = (v) => v * G.scale;
  const sc2 = (v) => v * G.scale * G.scale;
  // Factions a and b (ids; -1 is unclaimed land) are friends: the same
  // faction, or both on the same team. Allies never attack each other.
  function allied(a, b) {
    if (a === b) return true;
    if (a < 0 || b < 0) return false;
    const ta = G.factions[a].team;
    return !!ta && ta === G.factions[b].team;
  }

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
      if (island.length >= sc2(TINY_ISLAND)) continue;
      for (const i of island) {
        G.countrySize[G.country[i]]--;
        G.country[i] = -1;
        G.owner[i] = WATER;
        G.shade[i] = 0.93;
      }
    }
  }

  function placeDeposits() {
    const want = Math.max(4, Math.round(G.landCells / sc2(DEPOSIT_EVERY)));
    G.deposit = new Uint8Array(G.n);
    G.depositCells = [];
    for (let tries = 0; tries < want * 60 && G.depositCells.length < want; tries++) {
      const i = Math.floor(G.rng() * G.n);
      if (G.owner[i] === WATER) continue;
      if (G.depositCells.some((d) => cellDist(d, i) < sc(6))) continue;
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
      scale: rec && BASE_WIDTH[kind] ? rec.w / BASE_WIDTH[kind] : 1,
      cosX: Float64Array.from({ length: gw }, (_, x) => Math.cos(2 * Math.PI * x / gw)),
      sinX: Float64Array.from({ length: gw }, (_, x) => Math.sin(2 * Math.PI * x / gw)),
      state: demo ? 'menu' : 'spawn',
      owner: new Int16Array(n),
      shade: new Float32Array(n),
      rad: new Float32Array(n),
      radList: [],
      lockBy: new Int16Array(n).fill(-1),
      lockUntil: new Float32Array(n),
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
      interceptors: [],
      fx: [],
      planes: [],
      ships: [],
      walls: [],
      nextWallId: 1,
      nextShipId: 1,
      crates: [],
      nextCrate: 25,
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
      nukeEvents: [],
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
    const colour = opts.colour;
    const c = COLOURS[colour].rgb;
    return Object.assign({
      id,
      isPlayer: false,
      player: null,
      name: COLOURS[colour].name,
      color: c,
      border: c.map((v) => v * 0.55),
      css: `rgb(${c.join(',')})`,
      persona: null,
      aggr: 0.55,
      income: 1,
      alive: true,
      troops: sc2(START_TROOPS),
      gold: START_GOLD,
      built: { city: 0, mine: 0, fort: 0, artillery: 0, silo: 0, sam: 0, airfield: 0, barracks: 0, shipyard: 0, coastal: 0 },
      nextTsar: 0,
      cells: 0,
      sx: 0,
      sy: 0,
      ca: 0,
      sa: 0,
      capital: -1,
      kills: 0,
      team: 0,
      nextThink: 1 + Math.random() * 2,
    }, opts);
  }

  // humans: [{ name, colour }] for the human players (single player: just you).
  // aiCount: number of AI nations (defaults to the menu's single-player
  // setting); teams: team number (0 = none) for each faction in order.
  function newGame(demo, humans, aiCount, teams) {
    $('over').classList.remove('show');
    closeBuildSheet();
    acc = 0;
    setState(demo ? 'menu' : 'spawn');
    if (!demo && !humans) {
      // Single player: you, plus any AI allies on your team, against the
      // opponents (who also fight each other). Six nations at most.
      const allies = clamp(settings.allies || 0, 0, MAX_FACTIONS - 2);
      const opponents = clamp(settings.opponents, 1, MAX_FACTIONS - 1 - allies);
      humans = [{ name: 'You', colour: settings.colour }];
      aiCount = allies + opponents;
      teams = allies ? [1].concat(new Array(allies).fill(1), new Array(opponents).fill(0)) : undefined;
      if (opponents < settings.opponents) {
        setTimeout(() => toast(`Six nations max: playing ${allies} all${allies === 1 ? 'y' : 'ies'} against ${opponents} opponent${opponents === 1 ? '' : 's'}`), 400);
      }
    }
    humans = demo ? [] : humans;
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

    const ais = demo ? MAX_FACTIONS
      : Math.min(aiCount === undefined ? settings.opponents : aiCount, MAX_FACTIONS - humans.length);
    const count = humans.length + ais;
    const humanColours = resolveColours(humans.map((h) => h.colour));
    const aiColours = COLOURS.map((_, k) => k).filter((k) => !humanColours.includes(k));
    const personas = shuffle(CORE_PERSONAS.slice(), rng).concat(shuffle(EXTRA_PERSONAS.slice(), rng));
    for (let id = 0; id < count; id++) {
      if (id < humans.length) {
        G.factions.push(makeFaction(id, {
          isPlayer: true, player: humans[id].name, name: G.mp ? humans[id].name : 'You', colour: humanColours[id],
          team: teams ? teams[id] || 0 : 0,
        }));
      } else {
        const persona = personas[(id - humans.length) % personas.length];
        G.factions.push(makeFaction(id, {
          colour: aiColours[id - humans.length],
          team: teams ? teams[id] || 0 : 0,
          persona: persona.label,
          aggr: clamp(persona.aggr + diff.aggr, 0.05, 1),
          baseAggr: persona.aggr,
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
      if (G.countrySize[G.country[i]] < sc2(60)) continue;
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
      for (let q = 0; q < queue.length && f.cells < sc2(COUNTRY_START_CELLS); q++) {
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
    const crate = o >= 0 && G.crates.length && G.crates.includes(i);
    if (!assignCell(i, o)) return;
    if (crate) openCrate(i, G.factions[o]);
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
    if (type === 'shipyard' && waterNear(i, 1) < 0) return 'Shipyards go on the coast';
    if (type === 'coastal' && waterNear(i, 1) < 0) return 'Coastal batteries go on the coast';
    if (type !== 'mine' && G.deposit[i]) return 'Save gold deposits for mines';
    const x0 = cx(i);
    const y0 = cy(i);
    const space = Math.round(sc(MIN_SPACING));
    for (let dy = -space; dy <= space; dy++) {
      for (let dx = -space; dx <= space; dx++) {
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
  function tallyShips() {
    for (const sh of G.ships) {
      const f = G.factions[sh.owner];
      f.ships++;
      if (sh.type === 'carrier') {
        const readyAt = sh.readyAt || 0;
        if (readyAt <= G.time) f.airReady++;
        f.nextAir = Math.min(f.nextAir, readyAt);
      }
    }
  }

  function tallyBonuses() {
    for (const f of G.factions) {
      f.capBonus = 0;
      f.troopBonus = 0;
      f.goldBonus = 0;
      f.siloLevel = 0;
      f.silosReady = 0;
      f.nextNuke = Infinity;
      f.attackDiscount = 0;
      f.airReady = 0;
      f.nextAir = Infinity;
      f.shipCap = 0;
      f.ships = 0;
    }
    tallyShips();
    for (const b of G.buildings.values()) {
      const f = G.factions[b.owner];
      const l = b.level - 1;
      if (b.type === 'city') {
        f.capBonus += sc2(CITY_CAP[l]);
        f.troopBonus += sc2(CITY_TROOPS[l]);
        f.goldBonus += CITY_GOLD[l];
      } else if (b.type === 'mine') {
        f.goldBonus += MINE_GOLD[l];
      } else if (b.type === 'silo') {
        f.siloLevel = Math.max(f.siloLevel, b.level);
        const readyAt = b.readyAt || 0;
        if (readyAt <= G.time) f.silosReady++;
        f.nextNuke = Math.min(f.nextNuke, readyAt);
      } else if (b.type === 'shipyard') {
        f.shipCap = Math.min(MAX_SHIPS, f.shipCap + b.level * SHIPS_PER_YARD_LEVEL);
      } else if (b.type === 'barracks') {
        f.attackDiscount = Math.max(f.attackDiscount, BARRACKS_DISCOUNT[l]);
      } else if (b.type === 'airfield') {
        const readyAt = b.readyAt || 0;
        if (readyAt <= G.time) f.airReady++;
        f.nextAir = Math.min(f.nextAir, readyAt);
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

  // Level of the strongest fort of faction fid covering cell i (0 if none).
  function fortLevel(i, fid) {
    let lvl = 0;
    for (const b of G.buildings.values()) {
      if (b.type === 'fort' && b.owner === fid && b.level > lvl && cellDist(b.cell, i) <= sc(FORT_RADIUS[b.level - 1])) {
        lvl = b.level;
      }
    }
    // Two walled forts act as one long fort: land along the wall, out to
    // the weaker fort's range, is defended like that fort's own land.
    for (const w of G.walls) {
      if (w.owner !== fid) continue;
      const wl = wallLevel(w);
      if (wl > lvl && pathDist(i, w.path) <= sc(FORT_RADIUS[wl - 1])) lvl = wl;
    }
    return lvl;
  }

  // Distance from cell i to a wall's route (a list of corner cells).
  function pathDist(i, path) {
    let d = Infinity;
    for (let k = 1; k < path.length; k++) d = Math.min(d, segDist(i, path[k - 1], path[k]));
    return d;
  }

  // A wall's route between two forts through the owner's own land. It hugs
  // the edge of that land (coast or border) wherever it can, so it never
  // crosses enemy or unclaimed land and follows the shoreline. Returns every
  // cell on it, or null if the forts aren't joined by our land within reach.
  function wallRoute(fid, from, to) {
    const limit = sc(WALL_MAX) * 2;
    const edge = (c) => {
      const x = cx(c);
      const y = cy(c);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = wx(x + dx);
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= G.gw || ny >= G.gh) return true;
          if (G.owner[ny * G.gw + nx] !== fid) return true;
        }
      }
      return false;
    };
    // Dijkstra with a small binary heap: edge cells cost 1, inland cells 4.
    const dist = new Map([[from, 0]]);
    const prev = new Map([[from, -1]]);
    const heap = [[0, from]];
    const push = (item) => {
      heap.push(item);
      for (let k = heap.length - 1; k > 0;) {
        const up = (k - 1) >> 1;
        if (heap[up][0] <= heap[k][0]) break;
        [heap[up], heap[k]] = [heap[k], heap[up]];
        k = up;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, c] = pop();
      if (d > dist.get(c)) continue;
      if (c === to) {
        const path = [];
        for (let k = to; k >= 0; k = prev.get(k)) path.push(k);
        path.reverse();
        return path.length <= limit ? path : null;
      }
      const x = cx(c);
      const y = cy(c);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = wx(x + dx);
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= G.gw || ny >= G.gh) continue;
          const j = ny * G.gw + nx;
          if (G.owner[j] !== fid && j !== to) continue;
          if (cellDist(j, from) > limit || cellDist(j, to) > limit) continue;
          const nd = d + (edge(j) || j === to ? 1 : 4) * (dx && dy ? 1.41 : 1);
          if (nd < (dist.has(j) ? dist.get(j) : Infinity)) {
            dist.set(j, nd);
            prev.set(j, c);
            push([nd, j]);
          }
        }
      }
    }
    return null;
  }

  // The corners of a route: drop cells that lie (nearly) on a straight
  // stretch, so the wall is drawn and measured as a few clean segments.
  function routeCorners(cells) {
    const keep = new Array(cells.length).fill(false);
    keep[0] = keep[cells.length - 1] = true;
    const split = (lo, hi) => {
      let worst = -1;
      let at = -1;
      for (let k = lo + 1; k < hi; k++) {
        const d = segDist(cells[k], cells[lo], cells[hi]);
        if (d > worst) {
          worst = d;
          at = k;
        }
      }
      if (worst > 0.75) {
        keep[at] = true;
        split(lo, at);
        split(at, hi);
      }
    };
    split(0, cells.length - 1);
    return cells.filter((_, k) => keep[k]);
  }

  // Distance from cell i to the line between cells a and b (wrap-aware).
  function segDist(i, a, b) {
    const bx = ddx(b, a);
    const by = cy(b) - cy(a);
    const px = ddx(i, a);
    const py = cy(i) - cy(a);
    const len2 = bx * bx + by * by || 1;
    const t = clamp((px * bx + py * by) / len2, 0, 1);
    return Math.hypot(px - bx * t, py - by * t);
  }

  // Walls come down when either fort is lost or destroyed, or when any of
  // the land under them is lost.
  function pruneWalls() {
    const before = G.walls.length;
    G.walls = G.walls.filter((w) => {
      const a = G.buildings.get(w.a);
      const b = G.buildings.get(w.b);
      return a && b && a.owner === w.owner && b.owner === w.owner;
    });
    if (G.walls.length !== before) G.bver++;
    for (const w of [...G.walls]) {
      const lost = w.cells && w.cells.find((c) => G.owner[c] !== w.owner);
      if (lost !== undefined) breachWall(w, G.owner[lost], lost);
    }
  }

  const wallsOf = (b) => G.walls.filter((w) => w.a === b.id || w.b === b.id);

  function wallLevel(w) {
    const a = G.buildings.get(w.a);
    const b = G.buildings.get(w.b);
    return a && b ? Math.min(a.level, b.level) : 1;
  }

  // A wall of faction fid running through cell i (on its route).
  function wallThrough(i, fid) {
    for (const w of G.walls) {
      if (w.owner !== fid || w.down) continue;
      if (w.cellSet ? w.cellSet.has(i) : pathDist(i, w.path) <= 1) return w;
    }
    return null;
  }

  // A wall that is overrun or blasted comes down.
  function breachWall(w, by, cell) {
    if (w.down) return;
    w.down = true;
    G.walls = G.walls.filter((x) => x !== w);
    G.bver++;
    addFx(cell, 4, '255,170,60', 700);
    announce({ k: 'wallDown', f: w.owner, by });
  }

  // Our other forts that this fort could be walled to, nearest first, with
  // the route each wall would take through our land.
  function wallTargets(b) {
    return [...G.buildings.values()]
      .filter((o) => o.type === 'fort' && o.owner === b.owner && o.id !== b.id
        && cellDist(o.cell, b.cell) <= sc(WALL_MAX)
        && !G.walls.some((w) => (w.a === b.id && w.b === o.id) || (w.a === o.id && w.b === b.id)))
      .sort((p, q) => cellDist(p.cell, b.cell) - cellDist(q.cell, b.cell))
      .map((o) => ({ fort: o, route: wallRoute(b.owner, b.cell, o.cell) }))
      .filter((t) => t.route);
  }

  function buildWall(f, fromId, toId) {
    const a = G.buildings.get(fromId);
    const b = G.buildings.get(toId);
    if (!a || !b || a.type !== 'fort' || b.type !== 'fort' || a.owner !== f.id || b.owner !== f.id || a === b) {
      return 'Walls join two of your forts';
    }
    if (cellDist(a.cell, b.cell) > sc(WALL_MAX)) return `Forts must be within ${Math.round(sc(WALL_MAX))} cells to wall`;
    if (G.walls.some((w) => (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id))) return 'Those forts are already walled';
    if (wallsOf(a).length >= WALLS_PER_FORT || wallsOf(b).length >= WALLS_PER_FORT) {
      return `A fort can have at most ${WALLS_PER_FORT} walls`;
    }
    if (f.gold < WALL_COST) return `A wall costs ${WALL_COST} gold`;
    const cells = wallRoute(f.id, a.cell, b.cell);
    if (!cells) return 'Your own land must join the two forts';
    f.gold -= WALL_COST;
    G.walls.push({
      id: G.nextWallId++, a: a.id, b: b.id, owner: f.id, cells, cellSet: new Set(cells), path: routeCorners(cells),
    });
    G.bver++;
    return null;
  }

  // Strongest fort multiplier covering cell i for faction fid (1 if none).
  function fortMult(i, fid) {
    const lvl = fortLevel(i, fid);
    return lvl ? FORT_MULT[lvl - 1] : 1;
  }

  // A fort under attack holds for a while before it can be taken. The siege
  // clock restarts if the attackers let up.
  const overwhelms = (a, level) => a.troops >= G.factions[a.to].troops * SIEGE_ODDS[level - 1];

  function besieged(b, level = b.level) {
    if (G.time - (b.siegeAt || -Infinity) > 1) b.siegeFrom = G.time;
    b.siegeAt = G.time;
    return G.time - b.siegeFrom >= FORT_SIEGE[level - 1];
  }

  // Blasted land: its old owner can't retake it until the lock runs out.
  function lockCell(i, fid, secs) {
    if (fid < 0) return;
    G.lockBy[i] = fid;
    G.lockUntil[i] = G.time + secs;
  }

  const lockedFor = (i, fid) => G.lockBy[i] === fid && G.time < G.lockUntil[i];

  // ---------- Simulation ----------

  const maxTroops = (f) => 100 + f.cells * 12 + (f.capBonus || 0);

  function grow(f) {
    f.gold += (1 + f.cells * 0.003 / sc2(1) + f.goldBonus) * TICK * f.income;
    const max = maxTroops(f);
    if (f.troops > max) {
      f.troops -= (f.troops - max) * 0.02;
      return;
    }
    const interest = f.troops * 0.07 * (1 - f.troops / max);
    // AI nations that haven't met an enemy yet grow at the full, un-eased
    // rate, so the opening land grab keeps its pace on every difficulty.
    const income = f.landGrab ? Math.max(1, f.income) : f.income;
    const base = 0.5 + f.cells * 0.04 + f.troopBonus;
    f.troops = Math.min(max, f.troops + (base + interest) * TICK * income);
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
    // Never fight a friend: return the troops instead.
    if (allied(from, to)) {
      G.factions[from].troops += troops;
      return;
    }
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
    G.ships = G.ships.filter((sh) => sh.owner !== f.id);
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
      sfx('fallen');
      if (ev.by === myId) toast(`You crushed ${name(ev.f)}!`);
      else if (ev.by >= 0) toast(`${name(ev.f)} has fallen to ${name(ev.by)}`);
      else toast(`${name(ev.f)} has collapsed`);
    } else if (ev.k === 'nuke') {
      sfx('siren');
      // Keep the music down from the klaxon until the missile lands.
      if (window.PixelMusic) window.PixelMusic.duck(NUKE_TIME, 0.15);
      toast(ev.f === myId ? '☢ Nuke launched!' : `☢ ${name(ev.f)} has launched a nuke!`);
    } else if (ev.k === 'tsar') {
      sfx('siren');
      setTimeout(() => sfx('siren'), 1400);
      if (window.PixelMusic) window.PixelMusic.duck(TSAR_TIME, 0.1);
      toast(ev.f === myId ? '☢☢ Tsar Bomba launched!' : `☢☢ ${name(ev.f)} has launched a TSAR BOMBA!`);
    } else if (ev.k === 'intercept') {
      const what = ev.tsar ? 'Tsar Bomba' : 'nuke';
      if (ev.by === myId) toast(`📡 Your SAM shot down ${name(ev.f)}'s ${what}!`);
      else if (ev.f === myId) toast(`📡 Your ${what} was shot down by ${name(ev.by)}`);
      else toast(`📡 ${name(ev.by)} shot down ${name(ev.f)}'s ${what}`);
    } else if (ev.k === 'wallDown') {
      if (ev.f === myId) toast(`🧱 Your wall has been breached${ev.by >= 0 ? ` by ${name(ev.by)}` : ''}!`);
      else if (ev.by === myId) toast(`🧱 You broke through ${name(ev.f)}'s wall!`);
    } else if (ev.k === 'planeHome') {
      if (ev.f === myId) toast(`✈ Your ${ev.kind === 'strike' ? 'bomber' : 'plane'} made it home: ready to fly again`);
    } else if (ev.k === 'planeDown') {
      const what = ev.kind === 'strike' ? 'bomber' : 'paratrooper plane';
      if (ev.f === myId) toast(`📡 Your ${what} was shot down by ${name(ev.by)}!`);
      else if (ev.by === myId) toast(`📡 Your SAM shot down ${name(ev.f)}'s ${what}`);
    } else if (ev.k === 'sunk') {
      const what = SHIPS[ev.type] ? SHIPS[ev.type].label.toLowerCase() : 'ship';
      if (ev.f === myId) toast(`⚓ Your ${what} was sunk${ev.by >= 0 ? ` by ${name(ev.by)}` : ''}!`);
      else if (ev.by === myId) toast(`⚓ You sank ${name(ev.f)}'s ${what}!`);
    } else if (ev.k === 'boatSunk') {
      if (ev.f === myId) toast(`⚓ ${name(ev.by)} sank one of your troop boats!`);
      else if (ev.by === myId) toast(`⚓ Your ${ev.air ? 'bomber' : ev.gun ? 'coastal battery' : 'battleship'} sank ${name(ev.f)}'s troop boat`);
    } else if (ev.k === 'crate') {
      if (ev.f !== myId) return;
      sfx('crate');
      toast(`📦 Supply drop: ${ev.what}`);
    } else if (ev.k === 'msg') {
      toast(ev.text);
    }
  }

  // The troops it costs to capture a cell, and whether a fort shields the
  // defenders there (they then lose fewer troops).
  function captureTerms(i, def, density) {
    const fort = def && def.built.fort ? fortMult(i, def.id) : 1;
    let c = def ? 1.5 + density * 1.15 : NEUTRAL_COST;
    if (G.rad[i] > 0) c *= RAD_MULT;
    return { cost: c * fort, shielded: fort > 1 };
  }

  // Take one cell for `atk`, paying from `pool` (an attack or a boat).
  // Returns false if the pool can't afford it.
  function capture(i, atk, pool) {
    if (lockedFor(i, atk.id)) return false;
    const o = G.owner[i];
    const def = o >= 0 ? G.factions[o] : null;
    const density = def ? def.troops / Math.max(1, def.cells) : 0;
    const terms = captureTerms(i, def, density);
    const cost = terms.cost * (1 - (atk.attackDiscount || 0));
    const { shielded } = terms;
    if (pool.troops < cost) return false;
    pool.troops -= cost;
    if (def) def.troops = Math.max(0, def.troops - density * (shielded ? FORT_SHIELD : 1));
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
      const reach = scored[0].d + sc(ATTACK_FOCUS);
      let width = 0;
      while (width < scored.length && scored[width].d <= reach) width++;
      // Finer maps take proportionally more cells per tick to keep the pace.
      const cap = Math.ceil(width * (a.to >= 0 ? ENEMY_RATE : NEUTRAL_RATE) * G.scale) + 1;
      const forts = a.to >= 0 && G.factions[a.to].built.fort > 0;
      let held = 0;
      let stalled = null;
      for (let j = 0; j < Math.min(cap, scored.length); j++) {
        const i = scored[j].i;
        let wall = null;
        if (G.owner[i] !== a.to || lockedFor(i, a.from)) continue;
        // Fort-covered land holds out: on most ticks the whole line there
        // stands firm, so invaders push in far more slowly.
        const lvl = forts ? fortLevel(i, a.to) : 0;
        if (lvl) {
          held = Math.max(held, lvl);
          // The fort itself, and the line of a wall, must be besieged
          // before they fall.
          // Only an overwhelming force keeps the siege going.
          const b = G.bAt[i] >= 0 ? G.buildings.get(G.bAt[i]) : null;
          if (b && b.type === 'fort' && !(overwhelms(a, b.level) && besieged(b))) continue;
          wall = wallThrough(i, a.to);
          if (wall && !(overwhelms(a, wallLevel(wall)) && besieged(wall, wallLevel(wall)))) continue;
          if (stalled === null) stalled = rng() < FORT_SLOW[lvl - 1];
          if (stalled) continue;
        }
        if (!capture(i, atk, a)) {
          // Not enough left to take another cell: the survivors come home.
          atk.troops += a.troops;
          a.done = true;
          return;
        }
        // Overwhelmed: taking a stretch of wall brings it down.
        if (wall) breachWall(wall, a.from, i);
        if (a.to >= 0 && !G.factions[a.to].alive) return;
      }
      // Attacking a fort line costs troops every tick it holds.
      if (held) a.troops *= 1 - FORT_ATTRITION[held - 1];
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

  // Should troops march to cell i, or sail? March only when the land route
  // from fid's territory isn't much longer than the straight-line distance:
  // otherwise tapping Morocco from Spain would walk round the Mediterranean.
  function landRouteIsShort(fid, i) {
    let direct = Infinity;
    for (let j = 0; j < G.n; j++) {
      if (G.owner[j] === fid) direct = Math.min(direct, cellDist(i, j));
    }
    const maxSteps = Math.ceil(direct * 1.6 + sc(8));
    const seen = new Uint8Array(G.n);
    seen[i] = 1;
    let layer = [i];
    for (let step = 0; step <= maxSteps && layer.length; step++) {
      const next = [];
      for (const j of layer) {
        if (G.owner[j] === fid) return true;
        forNeighbours(j, (k) => {
          if (seen[k] || G.owner[k] === WATER) return;
          seen[k] = 1;
          next.push(k);
        });
      }
      layer = next;
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

  // ---------- Voyages: smooth sailing along straight legs ----------
  //
  // Sea routes are found cell by cell, which gives staircase paths. A voyage
  // keeps only the turning points needed to stay on open water, then moves
  // continuously along those straight legs. Coordinates are in cells and
  // "unwrapped" (they may run past the map edge on the World map).

  const normX = (x) => (G.wrap ? ((x % G.gw) + G.gw) % G.gw : x);

  function cellAtXY(x, y) {
    const gx = Math.floor(normX(x));
    const gy = Math.floor(y);
    if (gx < 0 || gy < 0 || gx >= G.gw || gy >= G.gh) return -1;
    return gy * G.gw + gx;
  }

  // Is the straight line from a to b on water (ignoring the end cell, which
  // may be the beach a boat is landing on)?
  function clearLine(a, b, endCell) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let k = 1; k < steps; k++) {
      const c = cellAtXY(a.x + (b.x - a.x) * k / steps, a.y + (b.y - a.y) * k / steps);
      if (c !== endCell && (c < 0 || G.owner[c] !== WATER)) return false;
    }
    return true;
  }

  function makeVoyage(cells) {
    const raw = [{ x: cx(cells[0]) + 0.5, y: cy(cells[0]) + 0.5 }];
    for (let k = 1; k < cells.length; k++) {
      raw.push({ x: raw[k - 1].x + ddx(cells[k], cells[k - 1]), y: cy(cells[k]) + 0.5 });
    }
    const end = cells[cells.length - 1];
    const pts = [raw[0]];
    for (let i = 0; i < raw.length - 1;) {
      let j = i + 1;
      for (let k = i + 2; k < raw.length && k <= i + 90; k++) if (clearLine(raw[i], raw[k], end)) j = k;
      pts.push(raw[j]);
      i = j;
    }
    return { pts, seg: 0, t: 0, end };
  }

  // Move an object (with x, y, angle) along its voyage. Returns true on arrival.
  function sail(o, dist) {
    const v = o.voyage;
    while (dist > 0 && v.seg < v.pts.length - 1) {
      const a = v.pts[v.seg];
      const b = v.pts[v.seg + 1];
      const left = Math.hypot(b.x - a.x, b.y - a.y) - v.t;
      if (dist < left) {
        v.t += dist;
        dist = 0;
      } else {
        dist -= left;
        v.seg++;
        v.t = 0;
      }
    }
    const done = v.seg >= v.pts.length - 1;
    const a = v.pts[Math.min(v.seg, v.pts.length - 1)];
    const b = v.pts[Math.min(v.seg + 1, v.pts.length - 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    o.x = normX(a.x + (b.x - a.x) * v.t / len);
    o.y = a.y + (b.y - a.y) * v.t / len;
    if (!done) {
      // Turn towards the new heading rather than snapping round.
      const want = Math.atan2(b.y - a.y, b.x - a.x);
      let turn = want - (o.angle || 0);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      o.angle = (o.angle || 0) + turn * Math.min(1, TICK * 6);
    }
    o.cell = cellAtXY(o.x, o.y);
    return done;
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
    G.boats.push({
      id: G.nextBoatId = (G.nextBoatId || 0) + 1, owner: fid, troops, landing, aimX: cx(target), aimY: cy(target),
      voyage: makeVoyage(path), x: cx(path[0]) + 0.5, y: cy(path[0]) + 0.5, angle: 0, cell: path[0],
    });
    return null;
  }

  function advanceBoats() {
    for (const b of G.boats) {
      if (!sail(b, sc(BOAT_SPEED) * TICK)) continue;
      // Coastal shells already on their way still hit as it reaches the beach.
      for (const s of G.shells) {
        if (s.done || s.boat !== b.id) continue;
        s.done = true;
        coastalImpact(s);
      }
      if (b.done) continue; // Sunk on the way in.
      b.done = true;
      const f = G.factions[b.owner];
      const o = G.owner[b.landing];
      // An ally took the beach while we sailed: the troops go home.
      if (allied(o, b.owner) || lockedFor(b.landing, b.owner)) {
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

  function artilleryTarget(b, rangeOverride) {
    let best = -1;
    let bestD = Infinity;
    for (const t of G.buildings.values()) {
      if (allied(t.owner, b.owner)) continue;
      const d = cellDist(t.cell, b.cell);
      if (d <= (rangeOverride || sc(ART_RANGE[b.level - 1])) && d < bestD) {
        bestD = d;
        best = t.cell;
      }
    }
    if (best >= 0) return best;
    const x0 = cx(b.cell);
    const y0 = cy(b.cell);
    for (let tries = 0; tries < 40; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * ((rangeOverride || sc(ART_RANGE[b.level - 1])) - 3);
      const x = wx(Math.round(x0 + Math.cos(ang) * r));
      const y = Math.round(y0 + Math.sin(ang) * r);
      if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
      const o = G.owner[y * G.gw + x];
      if (o >= 0 && !allied(o, b.owner)) return y * G.gw + x;
    }
    return -1;
  }

  function fireArtillery() {
    for (const b of G.buildings.values()) {
      if (b.type !== 'artillery') continue;
      b.reload -= TICK;
      if (b.reload > 0) continue;
      // Enemy warships in range come first.
      const ship = G.ships.find((sh) => !sh.dead && !allied(sh.owner, b.owner)
        && cellDist(sh.cell, b.cell) <= sc(ART_RANGE[b.level - 1]));
      if (ship) {
        b.reload = ART_RELOAD[b.level - 1];
        addFx(b.cell, 1.2, '255,230,150', 220);
        damageShip(ship, b.owner);
        continue;
      }
      const t = artilleryTarget(b);
      if (t < 0) {
        b.reload = 1;
        continue;
      }
      b.reload = ART_RELOAD[b.level - 1];
      addFx(b.cell, 1.2, '255,230,150', 220); // muzzle flash (and the bang)
      G.shells.push({ owner: b.owner, from: b.cell, to: t, t: 0, dur: SHELL_TIME, blast: Math.round(sc(ART_BLAST[b.level - 1])) });
    }
  }

  // Coastal batteries fire one guided shell at a time at the nearest enemy
  // troop boat in range (one not already under fire first), or failing that
  // at a warship.
  function fireCoastal() {
    for (const b of G.buildings.values()) {
      if (b.type !== 'coastal') continue;
      if ((b.readyAt || 0) > G.time) continue;
      const range = sc(COAST_RANGE[b.level - 1]);
      // Boats not already under fire come first.
      const boats = G.boats
        .filter((x) => !x.done && !allied(x.owner, b.owner) && cellDist(x.cell, b.cell) <= range)
        .sort((p, q) => (p.marked > G.time) - (q.marked > G.time) || cellDist(p.cell, b.cell) - cellDist(q.cell, b.cell))
        .slice(0, 1);
      let targets = boats.map((boat) => ({ boat }));
      if (!targets.length) {
        const ship = G.ships
          .filter((x) => !x.dead && !allied(x.owner, b.owner) && cellDist(x.cell, b.cell) <= range)
          .sort((p, q) => cellDist(p.cell, b.cell) - cellDist(q.cell, b.cell))[0];
        if (ship) targets = [{ ship }];
      }
      if (!targets.length) continue;
      b.readyAt = G.time + COAST_RELOAD[b.level - 1];
      G.bver++;
      addFx(b.cell, 1.2, '255,230,150', 220);
      for (const t of targets) {
        const v = t.boat || t.ship;
        if (t.boat) t.boat.marked = G.time + COAST_SHELL_TIME;
        G.shells.push({
          owner: b.owner, from: b.cell, to: v.cell, t: 0, dur: COAST_SHELL_TIME, blast: 0,
          boat: t.boat ? t.boat.id : 0, ship: t.ship ? t.ship.id : 0, kill: COAST_KILL[b.level - 1],
        });
      }
    }
  }

  // A guided coastal shell landing: it follows its target, so it hits if
  // the target is still afloat.
  function coastalImpact(s) {
    const hitBoat = s.boat && G.boats.find((x) => x.id === s.boat && !x.done);
    if (hitBoat) {
      addFx(hitBoat.cell, 2, '255,200,90', 400);
      // The blast catches every enemy boat sailing close by (a convoy).
      for (const boat of G.boats) {
        if (boat.done || allied(boat.owner, s.owner) || cellDist(boat.cell, hitBoat.cell) > sc(COAST_SPLASH)) continue;
        boat.full = boat.full || boat.troops;
        boat.troops *= 1 - s.kill;
        if (boat.troops < boat.full * COAST_SINK || boat.troops < 2) {
          boat.done = true;
          addFx(boat.cell, 3, '255,170,60', 600);
          announce({ k: 'boatSunk', f: boat.owner, by: s.owner, gun: true });
        }
      }
      return;
    }
    const ship = s.ship && G.ships.find((x) => x.id === s.ship && !x.dead);
    if (ship) damageShip(ship, s.owner);
    else addFx(s.to, 1.5, '200,220,255', 300);
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
    const hit = new Set();
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const i = y * G.gw + x;
        const o = G.owner[i];
        if (o < 0 || allied(o, s.owner)) continue;
        hit.add(o);
        const wall = G.walls.length ? wallThrough(i, o) : null;
        if (wall) breachWall(wall, s.owner, i);
        // A surviving building shrugs off the hit and keeps its cell.
        if (hitBuilding(i)) continue;
        const def = G.factions[o];
        def.troops = Math.max(0, def.troops - (def.troops / Math.max(1, def.cells)) * 1.5);
        setOwner(i, NEUTRAL);
        lockCell(i, o, s.lock || SHELL_LOCK);
      }
    }
    // Each hit also costs the nation a share of all its troops.
    for (const fid of hit) G.factions[fid].troops *= 1 - (s.kill || SHELL_KILL);
    addFx(s.to, 1 + r, '255,200,90', 450);
  }

  function launchNuke(f, target) {
    if (!f.built.silo) return 'Build a nuclear silo first';
    if (f.gold < NUKE_COST) return `Nukes cost ${NUKE_COST} gold`;
    if (target < 0) return 'Tap a target on the map';
    // Each silo reloads on its own, so more silos means more frequent
    // launches. Fire from the best ready one: highest level, then nearest.
    let silo = null;
    let soonest = Infinity;
    for (const b of G.buildings.values()) {
      if (b.type !== 'silo' || b.owner !== f.id) continue;
      if ((b.readyAt || 0) > G.time) {
        soonest = Math.min(soonest, b.readyAt);
        continue;
      }
      if (!silo || b.level > silo.level
        || (b.level === silo.level && cellDist(b.cell, target) < cellDist(silo.cell, target))) silo = b;
    }
    if (!silo) return `${f.built.silo > 1 ? 'All silos' : 'Silo'} reloading: ${Math.ceil(soonest - G.time)}s`;
    f.gold -= NUKE_COST;
    silo.readyAt = G.time + NUKE_COOLDOWN[silo.level - 1];
    G.bver++;
    G.missiles.push({ owner: f.id, from: silo.cell, to: target, t: 0, dur: NUKE_TIME, radius: Math.round(sc(NUKE_RADIUS[silo.level - 1])) });
    announce({ k: 'nuke', f: f.id });
    return null;
  }

  // The Tsar Bomba: a huge, slow super-nuke from a level 3 silo.
  function launchTsar(f, target) {
    if (f.siloLevel < 3) return 'Upgrade a nuclear silo to level 3 first';
    if (f.gold < TSAR_COST) return `The Tsar Bomba costs ${fmt(TSAR_COST)} gold`;
    if (target < 0) return 'Tap a target on the map';
    if (G.time < f.nextTsar) return `Tsar Bomba reloading: ${Math.ceil(f.nextTsar - G.time)}s`;
    let silo = null;
    for (const b of G.buildings.values()) {
      if (b.type === 'silo' && b.owner === f.id && b.level === 3
        && (!silo || cellDist(b.cell, target) < cellDist(silo.cell, target))) silo = b;
    }
    f.gold -= TSAR_COST;
    f.nextTsar = G.time + TSAR_COOLDOWN;
    G.missiles.push({
      owner: f.id, from: silo.cell, to: target, t: 0, dur: TSAR_TIME,
      radius: Math.round(sc(TSAR_RADIUS)), tsar: true, hp: 2,
    });
    announce({ k: 'tsar', f: f.id });
    return null;
  }

  // Where a missile is now, as a cell (straight line from launch to target).
  function missileCell(m) {
    const k = Math.min(1, m.t / m.dur);
    const x = wx(Math.round(cx(m.from) + ddx(m.to, m.from) * k));
    const y = Math.round(cy(m.from) + (cy(m.to) - cy(m.from)) * k);
    return clamp(y, 0, G.gh - 1) * G.gw + clamp(x, 0, G.gw - 1);
  }

  // Ready SAM sites shoot at enemy missiles in range. A nuke takes one hit;
  // the Tsar Bomba takes two.
  // Ready SAM sites also shoot down enemy aircraft (bombers and paratrooper
  // planes) flying within range.
  // Rather than an instant hit, each SAM fires an interceptor that flies up
  // to meet its target where the target will be when it arrives, so the
  // shoot-down is visible. A target is not fired on by more SAMs than it
  // needs hits.
  function samAirDefence() {
    for (const p of G.planes) if (!p.done) samEngage(p, 'plane', (k) => planePoint(p, k));
  }

  function samDefence() {
    if (!G.missiles.length || !G.factions.some((f) => f.built.sam)) return;
    for (const m of G.missiles) if (!m.done) samEngage(m, 'missile', (k) => flightPoint(m, k, 0.45));
  }

  // `pos(k)` gives the target's drawn position at fraction k of its flight.
  function samEngage(target, kind, pos) {
    const left = target.dur - target.t;
    if (left <= TICK) return;
    const at = pointCell(pos(target.t / target.dur));
    for (const b of G.buildings.values()) {
      if ((target.hp || 1) - (target.inbound || 0) <= 0) return;
      if (b.type !== 'sam' || allied(b.owner, target.owner) || (b.readyAt || 0) > G.time) continue;
      if (cellDist(b.cell, at) > sc(SAM_RANGE[b.level - 1])) continue;
      b.readyAt = G.time + SAM_RELOAD[b.level - 1];
      G.bver++;
      target.inbound = (target.inbound || 0) + 1;
      const { dur, hit } = interceptCourse(b.cell, target, pos);
      addFx(b.cell, 1.5, '210,240,255', 350);
      G.interceptors.push({
        owner: b.owner, from: b.cell, hx: hit.x, hy: hit.y, t: 0, dur, target, kind,
      });
    }
  }

  // The earliest point where an interceptor fired from `cell` can meet the
  // target, in whole ticks, always before the target lands. Fast planes
  // are met out towards the edge of the SAM's range rather than overhead.
  function interceptCourse(cell, target, pos) {
    const x0 = cx(cell) + 0.5;
    const y0 = cy(cell) + 0.5;
    const speed = sc(INTERCEPT_SPEED);
    const last = Math.max(1, Math.floor((target.dur - target.t) / TICK + 1e-6) - 1);
    let hit = null;
    let n = 1;
    for (; n <= last; n++) {
      hit = pos((target.t + n * TICK) / target.dur);
      let dx = hit.x - x0;
      if (G.wrap) dx -= Math.round(dx / G.gw) * G.gw;
      if (Math.hypot(dx, hit.y - y0) <= speed * n * TICK) break;
    }
    n = Math.min(n, last);
    if (!hit || n === last) hit = pos((target.t + n * TICK) / target.dur);
    return { dur: n * TICK, hit };
  }

  // A missile's or plane's drawn position (in cells, including its arc) at
  // fraction k of its flight.
  function flightPoint(m, k, lift) {
    const x0 = cx(m.from) + 0.5;
    const y0 = cy(m.from) + 0.5;
    const x1 = x0 + ddx(m.to, m.from);
    const y1 = cy(m.to) + 0.5;
    const h = Math.hypot(x1 - x0, y1 - y0) * lift * Math.sin(Math.PI * k);
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k - h };
  }

  // A plane's drawn position (in cells). Outbound it flies a gentle arc to
  // the target; on the way home it carries on past the target, banks round
  // in a curve and then heads for its base.
  function planePoint(p, k) {
    if (!p.returning) return flightPoint(p, k, 0.15);
    const x0 = cx(p.from) + 0.5;
    const y0 = cy(p.from) + 0.5;
    const x3 = x0 + ddx(p.to, p.from);
    const y3 = cy(p.to) + 0.5;
    const len = Math.hypot(x3 - x0, y3 - y0) || 1;
    // Outbound heading (away from home), and its right-hand side.
    const ux = (x0 - x3) / len;
    const uy = (y0 - y3) / len;
    const nx = -uy;
    const ny = ux;
    const r = clamp(len * 0.3, sc(4), sc(14));
    const x1 = x0 + ux * r * 1.2 + nx * r * 0.6;
    const y1 = y0 + uy * r * 1.2 + ny * r * 0.6;
    const x2 = x0 + ux * r * 0.2 + nx * r * 1.8;
    const y2 = y0 + uy * r * 0.2 + ny * r * 1.8;
    const j = 1 - k;
    const a = j * j * j;
    const b = 3 * j * j * k;
    const c = 3 * j * k * k;
    const d = k * k * k;
    return { x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 };
  }

  function pointCell(pt) {
    const x = clamp(wx(Math.floor(pt.x)), 0, G.gw - 1);
    const y = clamp(Math.floor(pt.y), 0, G.gh - 1);
    return y * G.gw + x;
  }

  // Interceptors in flight: on arrival they hit their target, if it is still
  // in the air.
  function advanceInterceptors() {
    if (!G.interceptors.length) return;
    for (const i of G.interceptors) {
      i.t += TICK;
      if (i.t < i.dur - 1e-6) continue;
      i.done = true;
      const m = i.target;
      if (!m) continue;
      m.inbound = Math.max(0, (m.inbound || 0) - 1);
      if (m.done) continue;
      const at = pointCell({ x: i.hx, y: i.hy });
      const kill = i.kind === 'plane' || (m.hp || 1) <= 1;
      const size = m.tsar ? (kill ? 8 : 5) : i.kind === 'plane' ? 4 : 5;
      addFx(at, size, '180,220,255', kill ? 1400 : 1000, { x: i.hx, y: i.hy });
      if (i.kind === 'plane') {
        m.done = true;
        announce({ k: 'planeDown', f: m.owner, by: i.owner, kind: m.kind });
        continue;
      }
      m.hp = (m.hp || 1) - 1;
      if (m.hp <= 0) {
        m.done = true;
        announce({ k: 'intercept', f: m.owner, by: i.owner, tsar: !!m.tsar });
      }
    }
    G.interceptors = G.interceptors.filter((i) => !i.done);
  }

  // Paratroopers: fly from the nearest ready airfield in range, then land
  // and push inland like a boat landing.
  // The nearest ready airfield or carrier that can reach the target.
  // Returns { base } or { err }.
  function pickAirbase(f, target) {
    const carriers = G.ships.filter((sh) => sh.type === 'carrier' && sh.owner === f.id);
    if (!f.built.airfield && !carriers.length) return { err: 'Build an airfield (or a carrier) first' };
    let field = null;
    let soonest = Infinity;
    let inRange = false;
    for (const b of G.buildings.values()) {
      if (b.type !== 'airfield' || b.owner !== f.id) continue;
      if (cellDist(b.cell, target) > sc(AIR_RANGE[b.level - 1])) continue;
      inRange = true;
      if ((b.readyAt || 0) > G.time) {
        soonest = Math.min(soonest, b.readyAt);
        continue;
      }
      if (!field || cellDist(b.cell, target) < cellDist(field.cell, target)) field = b;
    }
    // Carriers launch like a level 2 airfield from wherever they are.
    for (const sh of carriers) {
      if (cellDist(sh.cell, target) > sc(AIR_RANGE[1])) continue;
      inRange = true;
      if ((sh.readyAt || 0) > G.time) {
        soonest = Math.min(soonest, sh.readyAt);
        continue;
      }
      if (!field || cellDist(sh.cell, target) < cellDist(field.cell, target)) field = { carrier: sh, cell: sh.cell, level: 2 };
    }
    if (!inRange) return { err: 'Out of range of your airfields and carriers' };
    if (!field) return { err: `Air bases reloading: ${Math.ceil(soonest - G.time)}s` };
    return { base: field };
  }

  // Launching uses the base's reload (shared by paradrops and air strikes).
  function useAirbase(field) {
    if (field.carrier) field.carrier.readyAt = G.time + AIR_RELOAD[1];
    else field.readyAt = G.time + AIR_RELOAD[field.level - 1];
    G.bver++;
    addFx(field.cell, 1.5, '200,200,255', 300);
  }

  const baseRef = (base) => (base.carrier ? { ship: base.carrier.id } : { id: base.id });

  // The airfield or carrier a plane flew from, if it is still its owner's.
  function homeBase(p) {
    if (!p.base) return null;
    if (p.base.ship) return G.ships.find((sh) => sh.id === p.base.ship && sh.owner === p.owner) || null;
    const b = G.buildings.get(p.base.id);
    return b && b.owner === p.owner ? b : null;
  }

  function launchPara(f, target, troops) {
    if (target < 0 || G.owner[target] === WATER) return 'Drop on land';
    if (allied(G.owner[target], f.id)) return "That's friendly land";
    const { base, err } = pickAirbase(f, target);
    if (err) return err;
    troops = Math.min(troops, f.troops);
    if (troops < 2) return 'Not enough troops yet';
    f.troops -= troops;
    useAirbase(base);
    G.planes.push({ owner: f.id, from: base.cell, to: target, t: 0, dur: PLANE_TIME, troops, kind: 'para', base: baseRef(base) });
    return null;
  }

  // The nearest enemy warship or troop boat within reach of a sea target.
  function shipTarget(f, cell) {
    const reach = sc(STRIKE_SPREAD) + 2;
    let best = null;
    for (const v of [...G.ships, ...G.boats]) {
      if (v.dead || v.done || allied(v.owner, f.id)) continue;
      const d = cellDist(v.cell, cell);
      if (d <= reach && (!best || d < best.d)) best = { v, d };
    }
    return best ? best.v : null;
  }

  function launchStrike(f, target) {
    if (target < 0) return 'Aim at land or an enemy ship';
    const atSea = G.owner[target] === WATER;
    const vessel = atSea ? shipTarget(f, target) : null;
    if (atSea && !vessel) return 'Aim at land or an enemy ship';
    if (!atSea && allied(G.owner[target], f.id)) return "That's friendly land";
    if (f.gold < STRIKE_COST) return `Air strikes cost ${STRIKE_COST} gold`;
    const { base, err } = pickAirbase(f, target);
    if (err) return err;
    f.gold -= STRIKE_COST;
    useAirbase(base);
    G.planes.push({
      owner: f.id, from: base.cell, to: vessel ? vessel.cell : target, t: 0, dur: PLANE_TIME, troops: 0, kind: 'strike',
      base: baseRef(base), vessel: vessel ? { ship: G.ships.includes(vessel) ? vessel.id : -1, boat: G.boats.includes(vessel) ? vessel.id : -1 } : null,
    });
    return null;
  }

  // ---------- Navy ----------

  // A water cell within r cells of i (i itself if it's water), or -1.
  function waterNear(i, r) {
    if (G.owner[i] === WATER) return i;
    let best = -1;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = wx(cx(i) + dx);
        const y = cy(i) + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const j = y * G.gw + x;
        const d = dx * dx + dy * dy;
        if (G.owner[j] === WATER && d < bestD) {
          bestD = d;
          best = j;
        }
      }
    }
    return best;
  }

  // Shortest route over water from one water cell to another (or null).
  function waterPath(from, to) {
    if (!G.pathParent || G.pathParent.length !== G.n) G.pathParent = new Int32Array(G.n);
    const parent = G.pathParent;
    parent.fill(-2);
    parent[from] = -1;
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q];
      if (j === to) {
        const path = [];
        for (let p = to; p !== -1; p = parent[p]) path.push(p);
        return path.reverse();
      }
      forNeighbours(j, (k) => {
        if (parent[k] === -2 && G.owner[k] === WATER) {
          parent[k] = j;
          queue.push(k);
        }
      });
    }
    return null;
  }

  function buildShip(f, yardId, kind) {
    const yard = G.buildings.get(yardId);
    const spec = SHIPS[kind];
    if (!yard || yard.type !== 'shipyard' || yard.owner !== f.id || !spec) return 'Tap one of your shipyards';
    if (f.ships >= f.shipCap) return `Fleet full (${f.shipCap} ships). Upgrade or add shipyards`;
    if (f.gold < spec.cost) return `A ${spec.label.toLowerCase()} costs ${fmt(spec.cost)} gold`;
    // Launch onto open water by the yard, not on top of another ship.
    let at = -1;
    for (let r = 2; r <= 5 && at < 0; r++) {
      for (let tries = 0; tries < 30 && at < 0; tries++) {
        const x = wx(cx(yard.cell) + Math.round((Math.random() * 2 - 1) * r));
        const y = cy(yard.cell) + Math.round((Math.random() * 2 - 1) * r);
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const j = y * G.gw + x;
        if (G.owner[j] === WATER && !G.ships.some((sh) => cellDist(sh.cell, j) < 2)) at = j;
      }
    }
    if (at < 0) at = waterNear(yard.cell, 2);
    if (at < 0) return 'No open water by this shipyard';
    f.gold -= spec.cost;
    f.ships++;
    G.ships.push({
      id: G.nextShipId++, owner: f.id, type: kind, cell: at, hp: spec.hp,
      x: cx(at) + 0.5, y: cy(at) + 0.5, angle: 0, voyage: null,
      reload: spec.reload || 0, readyAt: 0, orderAt: 0,
    });
    return null;
  }

  function moveShip(f, id, target) {
    const sh = G.ships.find((x) => x.id === id && x.owner === f.id);
    if (!sh) return 'That ship is gone';
    const to = target >= 0 ? waterNear(target, Math.round(sc(4))) : -1;
    if (to < 0) return 'Tap the sea (or close to a coast)';
    const path = waterPath(sh.cell, to);
    if (!path) return "Your ship can't sail there";
    sh.voyage = makeVoyage(path);
    return null;
  }

  function damageShip(sh, by) {
    sh.hp--;
    addFx(sh.cell, 2, '255,200,90', 400);
    if (sh.hp > 0) return;
    sh.dead = true;
    addFx(sh.cell, 4, '255,170,60', 700);
    announce({ k: 'sunk', f: sh.owner, by, type: sh.type });
  }

  // Sail along routes, then battleships fire at the nearest target in range:
  // enemy ships first, then troop boats, then buildings, then land.
  function advanceShips() {
    for (const sh of G.ships) {
      const spec = SHIPS[sh.type];
      if (sh.voyage && sail(sh, sc(spec.speed) * TICK)) sh.voyage = null;
      if (sh.type !== 'battleship') continue;
      sh.reload -= TICK;
      if (sh.reload > 0) continue;
      const range = sc(spec.range);
      let fired = false;
      let foe = null;
      for (const o of G.ships) {
        if (o.dead || allied(o.owner, sh.owner) || cellDist(o.cell, sh.cell) > range) continue;
        if (!foe || cellDist(o.cell, sh.cell) < cellDist(foe.cell, sh.cell)) foe = o;
      }
      if (foe) {
        damageShip(foe, sh.owner);
        fired = true;
      } else {
        const boat = G.boats.find((b) => !b.done && !allied(b.owner, sh.owner)
          && cellDist(b.cell, sh.cell) <= range);
        if (boat) {
          boat.done = true;
          addFx(boat.cell, 3, '255,170,60', 600);
          announce({ k: 'boatSunk', f: boat.owner, by: sh.owner });
          fired = true;
        } else {
          const t = artilleryTarget({ cell: sh.cell, owner: sh.owner, level: 1 }, range);
          if (t >= 0) {
            G.shells.push({ owner: sh.owner, from: sh.cell, to: t, t: 0, dur: SHELL_TIME, blast: Math.round(sc(1)) });
            fired = true;
          }
        }
      }
      if (fired) {
        sh.reload = spec.reload;
        addFx(sh.cell, 1.2, '255,230,150', 220);
      } else {
        sh.reload = 0.5;
      }
    }
    G.boats = G.boats.filter((b) => !b.done);
    G.ships = G.ships.filter((sh) => !sh.dead && G.factions[sh.owner].alive);
  }

  // Planes fly out, drop their bombs or paratroopers, then fly home along
  // the same route (SAMs can still catch them on the way back).
  function advancePlanes() {
    for (const p of G.planes) {
      if (p.done) continue;
      p.t += TICK;
      if (p.t < p.dur) continue;
      if (p.returning) {
        p.done = true;
        // Getting home safely readies the base to fly again straight away.
        const home = homeBase(p);
        if (home && (home.readyAt || 0) > G.time) {
          home.readyAt = G.time;
          G.bver++;
          announce({ k: 'planeHome', f: p.owner, kind: p.kind });
        }
        continue;
      }
      dropPayload(p);
      p.returning = true;
      p.troops = 0;
      // Head for where the base is now (a carrier may have sailed on).
      const home = homeBase(p);
      [p.from, p.to] = [p.to, home ? home.cell : p.from];
      p.t = 0;
    }
    G.planes = G.planes.filter((p) => !p.done);
  }

  // A bomb landing among ships: warships take a hit, troop boats sink.
  function bombShipping(cell, owner) {
    const r = sc(1.5);
    for (const sh of G.ships) {
      if (!sh.dead && !allied(sh.owner, owner) && cellDist(sh.cell, cell) <= r) damageShip(sh, owner);
    }
    for (const b of G.boats) {
      if (b.done || allied(b.owner, owner) || cellDist(b.cell, cell) > r) continue;
      b.done = true;
      addFx(b.cell, 3, '255,170,60', 600);
      announce({ k: 'boatSunk', f: b.owner, by: owner, air: true });
    }
  }

  function dropPayload(p) {
    const f = G.factions[p.owner];
    const o = G.owner[p.to];
    if (!f.alive) return;
    if (p.kind === 'strike') {
      // Carpet bombing: bombs scattered around the target. Against shipping
      // the bomber follows its target and drops in a tighter pattern.
      let at = p.to;
      let spread = sc(STRIKE_SPREAD);
      if (p.vessel) {
        const v = G.ships.find((sh) => sh.id === p.vessel.ship && !sh.dead)
          || G.boats.find((b) => b.id === p.vessel.boat && !b.done);
        if (v) at = v.cell;
        spread /= 2;
      }
      for (let k = 0; k < STRIKE_BOMBS; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = spread * Math.sqrt(Math.random());
        const x = wx(Math.round(cx(at) + Math.cos(ang) * r));
        const y = clamp(Math.round(cy(at) + Math.sin(ang) * r), 0, G.gh - 1);
        if (x < 0 || x >= G.gw) continue;
        const cell = y * G.gw + x;
        shellImpact({ to: cell, owner: p.owner, blast: Math.max(1, Math.round(sc(1))), kill: BOMB_KILL, lock: BOMB_LOCK });
        bombShipping(cell, p.owner);
      }
      return;
    }
    if (o === WATER || allied(o, p.owner) || !capture(p.to, f, p)) {
      f.troops += Math.max(0, p.troops);
      return;
    }
    addFx(p.to, 2, '230,230,255', 400);
    if (p.troops >= 1 && (o < 0 || G.factions[o].alive)) addAttack(p.owner, o, p.troops, cx(p.to), cy(p.to));
    else f.troops += Math.max(0, p.troops);
  }

  // Supply drops: crates appear on unclaimed land; whoever captures the
  // cell first gets the reward (see setOwner).
  function spawnCrates() {
    if (G.time < G.nextCrate) return;
    G.nextCrate = G.time + 30 + G.rng() * 20;
    if (G.crates.length >= CRATE_MAX) return;
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(G.rng() * G.n);
      if (G.owner[i] !== NEUTRAL || G.rad[i] > 0 || G.deposit[i] || G.crates.includes(i)) continue;
      G.crates.push(i);
      return;
    }
  }

  function openCrate(i, f) {
    G.crates = G.crates.filter((c) => c !== i);
    const roll = G.rng();
    let what;
    const upgradable = [...G.buildings.values()].filter((b) => b.owner === f.id && b.level < MAX_LEVEL);
    if (roll < 0.34 && upgradable.length) {
      const b = upgradable.sort((a, c) => a.level - c.level)[0];
      b.level++;
      b.hp++;
      G.bver++;
      what = `free upgrade: ${BUILDINGS[b.type].label} to level ${b.level}`;
    } else if (roll < 0.67) {
      const gain = maxTroops(f) * 0.25;
      f.troops += gain;
      what = `+${fmt(gain)} troops`;
    } else {
      f.gold += CRATE_GOLD;
      what = `+${CRATE_GOLD} gold`;
    }
    addFx(i, 2, '250,220,120', 500);
    announce({ k: 'crate', f: f.id, what });
  }

  // Flatten the land around a nuke's target and leave fallout. The host and
  // every joiner run this the same way, so multiplayer only has to send the
  // impact itself: listing every cell of a Tsar Bomba's blast made one
  // update about 100 KB, too big for phones' connections.
  function blastArea(to, R, tsar, hit) {
    const x0 = cx(to);
    const y0 = cy(to);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const i = y * G.gw + x;
        if (G.owner[i] === WATER) continue;
        hit(i);
        if (G.rad[i] <= 0) G.radList.push(i);
        G.rad[i] = (tsar ? TSAR_RAD_TIME : RAD_TIME) * (1 - Math.hypot(dx, dy) / (R + 1) * 0.5);
      }
    }
    G.dirty = true;
  }

  function nukeImpact(m) {
    const R = m.radius;
    const track = G.track;
    G.track = false;
    const hit = new Map();            // faction -> [cells lost, cells before]
    const breached = [];              // walls caught in the blast
    blastArea(m.to, R, m.tsar, (i) => {
      const o = G.owner[i];
      if (o >= 0) {
        const h = hit.get(o) || [0, G.factions[o].cells];
        h[0]++;
        hit.set(o, h);
        const wall = G.walls.length ? wallThrough(i, o) : null;
        if (wall && !breached.some(([w]) => w === wall)) breached.push([wall, i]);
        lockCell(i, o, m.tsar ? TSAR_LOCK : NUKE_LOCK);
      }
      setOwner(i, NEUTRAL);
    });
    G.track = track;
    for (const [wall, i] of breached) breachWall(wall, m.owner, i);
    // The blast kills a share of the whole nation's troops, more the more
    // of its land is destroyed.
    for (const [fid, [lost, before]] of hit) {
      const f = G.factions[fid];
      const loss = Math.min(0.85, (m.tsar ? TSAR_KILL : NUKE_KILL) + 3 * lost / Math.max(1, before));
      f.troops *= 1 - loss;
    }
    if (track) G.nukeEvents.push([m.to, R, m.tsar ? 1 : 0]);
    // The Tsar Bomba has its own colour code so it gets the bigger sound.
    addFx(m.to, R * 2.2, m.tsar ? '255,250,230' : '255,240,200', m.tsar ? 2200 : 1400);
    addFx(m.to, R * 1.2, '255,120,40', m.tsar ? 1600 : 1000);
  }

  function advanceProjectiles() {
    for (const s of G.shells) {
      s.t += TICK;
      // Guided coastal shells track their target.
      if (s.boat || s.ship) {
        const v = s.boat ? G.boats.find((x) => x.id === s.boat && !x.done) : G.ships.find((x) => x.id === s.ship && !x.dead);
        if (v) s.to = v.cell;
      }
      if (s.t >= s.dur) {
        s.done = true;
        if (s.boat || s.ship) coastalImpact(s);
        else shellImpact(s);
      }
    }
    for (const m of G.missiles) {
      if (m.done) continue;
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

  // `at` optionally places the effect at an exact map position (in cells)
  // rather than the middle of `cell`, e.g. an explosion high in the air.
  function addFx(cell, radius, rgb, dur, at) {
    if (G.track) G.fxEvents.push(at ? [cell, radius, rgb, dur, at.x, at.y] : [cell, radius, rgb, dur]);
    if (!G.demo) {
      if (rgb === '255,240,200' || rgb === '255,250,230') {
        // A nuke is a world event: always full volume. Only the screen shake
        // depends on how close it is (the Tsar Bomba shakes everything).
        const tsar = rgb === '255,250,230';
        sfx(tsar ? 'tsar' : 'nuke');
        const near = tsar ? 1 : hearing(cell).vol;
        if (near > 0.5) shakeUntil = performance.now() + (tsar ? 2000 : 1100 * near);
      } else if (rgb === '180,220,255') {
        worldSfx('intercept', cell);
      } else if (rgb === '210,240,255') {
        worldSfx('samLaunch', cell);
      } else if (rgb === '200,200,255') {
        worldSfx('plane', cell);
      } else if (rgb === '255,200,90') {
        worldSfx('shell', cell);
      } else if (rgb === '255,230,150') {
        worldSfx('cannon', cell);
      } else if (rgb === '255,170,60') {
        worldSfx('blast', cell);
      }
    }
    G.fx.push({
      x: at ? at.x : cx(cell) + 0.5, y: at ? at.y : cy(cell) + 0.5,
      radius, rgb, start: performance.now(), dur, seed: Math.random() * 1000,
    });
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
    const far = Math.round(sc(5));
    for (let dy = -far; dy <= far; dy++) {
      for (let dx = -far; dx <= far; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < sc(2) || d > far) continue;
        const x = wx(x0 + dx);
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
        const i = y * G.gw + x;
        if (!canPlace(f, type, i)) options.push(i);
      }
    }
    return options.length ? options[Math.floor(Math.random() * options.length)] : -1;
  }

  // radius: blast size to keep clear of our own and allies' land.
  function nukeTarget(f, radius) {
    let best = null;
    let bestScore = 0;
    for (const e of G.factions) {
      if (!e.alive || allied(e.id, f.id)) continue;
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
      const R = (radius || Math.round(sc(NUKE_RADIUS[Math.max(0, f.siloLevel - 1)]))) + 1;
      for (let dy = -R; dy <= R; dy += 2) {
        for (let dx = -R; dx <= R; dx += 2) {
          const x = wx(x0 + dx);
          const y = y0 + dy;
          if (x >= 0 && y >= 0 && x < G.gw && y < G.gh && allied(G.owner[y * G.gw + x], f.id)) return false;
        }
      }
      return true;
    });
    return safe.length ? safe[Math.floor(Math.random() * safe.length)] : -1;
  }

  function aiBuild(f, scan) {
    const aggr = f.aggr;
    // The Tsar Bomba is rare: a big, rich, aggressive nation's late-game move.
    if (f.siloLevel >= 3 && f.gold >= TSAR_COST && G.time >= f.nextTsar && Math.random() < 0.1 + aggr * 0.25) {
      const t = nukeTarget(f, Math.round(sc(TSAR_RADIUS)));
      if (t >= 0 && !launchTsar(f, t)) return;
    }
    if (f.built.silo && f.gold >= NUKE_COST && G.time >= f.nextNuke && Math.random() < 0.25 + aggr * 0.5) {
      const t = nukeTarget(f);
      if (t >= 0 && !launchNuke(f, t)) return;
    }
    let strongest = null;
    for (const o of scan.counts.keys()) {
      if (o >= 0 && !allied(o, f.id) && (!strongest || G.factions[o].troops > strongest.troops)) strongest = G.factions[o];
    }
    const wants = [];
    const deposit = G.depositCells.find((d) => !canPlace(f, 'mine', d));
    if (deposit !== undefined) wants.push(['mine', deposit]);
    if (f.built.city < 1 + f.cells / 600) wants.push(['city', -1]);
    if (strongest && strongest.troops > f.troops * 0.8 && f.built.fort < 1 + f.cells / 900) wants.push(['fort', strongest.id]);
    if (strongest && aggr >= 0.35 && f.built.artillery < 1 + f.cells / 700) wants.push(['artillery', strongest.id]);
    if (f.cells > 900 && !f.built.silo && aggr >= G.diff.siloAggr) wants.push(['silo', -1]);
    // A SAM site once any rival has nukes.
    const threatened = G.factions.some((e) => e.alive && e.built.silo && !allied(e.id, f.id));
    if (threatened && f.built.sam < 1 + Math.floor(f.cells / 2500)) wants.unshift(['sam', -1]);
    if (aggr >= 0.45 && !f.built.barracks && f.cells > 400) wants.push(['barracks', -1]);
    if (aggr >= 0.6 && !f.built.airfield && f.cells > 1200) wants.push(['airfield', -1]);
    if (scan.coast && aggr >= 0.35 && !f.built.shipyard && f.cells > 700) wants.push(['shipyard', -1]);
    // Coastal guns once someone is landing troops on our shores.
    const invaded = G.boats.some((b) => !allied(b.owner, f.id) && b.landing >= 0 && G.owner[b.landing] === f.id);
    if (scan.coast && (invaded || f.cells > 1500) && f.built.coastal < 1 + Math.floor(f.cells / 3000)) wants.push(['coastal', -1]);
    for (const [type, arg] of wants) {
      if (f.gold < costOf(f, type)) {
        if (type === 'silo' && Math.random() < 0.6) return; // Saving up.
        continue;
      }
      // Sometimes improve an existing building instead of adding another.
      if (type !== 'mine' && Math.random() < 0.35 && aiUpgrade(f)) return;
      let at = -1;
      if (type === 'mine') at = arg;
      else if (['city', 'silo', 'sam', 'barracks', 'airfield'].includes(type)) at = interiorCell(f, type);
      else if (type === 'shipyard' || type === 'coastal') at = coastalCell(f);
      else if (scan.samples.has(arg)) at = borderCell(f, type, scan.samples.get(arg));
      if (at >= 0 && build(f, type, at)) return;
    }
    if (aiShips(f)) return;
    if (f.gold > 300) aiUpgrade(f);
  }

  // A free coastal spot for a shipyard.
  function coastalCell(f) {
    const cells = ownCells(f.id);
    for (let tries = 0; tries < 300 && cells.length; tries++) {
      const i = cells[Math.floor(Math.random() * cells.length)];
      if (!canPlace(f, 'shipyard', i)) return i;
    }
    return -1;
  }

  // Launch warships while there's room in the fleet and gold to spare.
  function aiShips(f) {
    if (!f.built.shipyard || f.ships >= f.shipCap) return false;
    const yards = [...G.buildings.values()].filter((b) => b.type === 'shipyard' && b.owner === f.id);
    const yard = yards[Math.floor(Math.random() * yards.length)];
    const hasCarrier = G.ships.some((sh) => sh.owner === f.id && sh.type === 'carrier');
    if (!hasCarrier && f.aggr >= 0.6 && f.gold > 2500 && Math.random() < 0.2) return !buildShip(f, yard.id, 'carrier');
    if (f.gold > 700 && Math.random() < 0.4) return !buildShip(f, yard.id, 'battleship');
    return false;
  }

  // Idle warships head for the nearest enemy coast.
  function aiFleet(f) {
    for (const sh of G.ships) {
      if (sh.owner !== f.id || sh.voyage || G.time < (sh.orderAt || 0)) continue;
      sh.orderAt = G.time + 8 + Math.random() * 8;
      let best = -1;
      let bestD = Infinity;
      for (let tries = 0; tries < 200; tries++) {
        const i = Math.floor(Math.random() * G.n);
        const o = G.owner[i];
        if (o < 0 || allied(o, f.id) || waterNear(i, 1) < 0) continue;
        const d = cellDist(i, sh.cell);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) moveShip(f, sh.id, best);
    }
  }

  // Upgrade priorities: mines, silos and cities pay off best.
  function aiUpgrade(f) {
    const order = { mine: 0, silo: 1, sam: 2, city: 3, barracks: 4, artillery: 5, coastal: 5.5, airfield: 6, fort: 7 };
    const options = [...G.buildings.values()]
      .filter((b) => b.owner === f.id && b.level < MAX_LEVEL && upgradeCost(b) <= f.gold)
      .sort((a, b) => order[a.type] - order[b.type] || a.level - b.level);
    return options.length ? upgrade(f, options[0]) : false;
  }

  function aiPara(f) {
    if (!f.airReady) return false;
    const fields = [...G.buildings.values()].filter((b) => b.type === 'airfield' && b.owner === f.id && (b.readyAt || 0) <= G.time);
    if (!fields.length) return false;
    let best = -1;
    let bestScore = 0;
    for (let tries = 0; tries < 80; tries++) {
      // Sample a spot within range of one of our ready airfields.
      const b = fields[Math.floor(Math.random() * fields.length)];
      const r = sc(AIR_RANGE[b.level - 1]) * Math.sqrt(Math.random());
      const ang = Math.random() * Math.PI * 2;
      const x = wx(Math.round(cx(b.cell) + Math.cos(ang) * r));
      const y = Math.round(cy(b.cell) + Math.sin(ang) * r);
      if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
      const i = y * G.gw + x;
      const o = G.owner[i];
      if (o === WATER || allied(o, f.id)) continue;
      const e = o >= 0 ? G.factions[o] : null;
      const score = e ? (f.troops / Math.max(1, e.troops)) * (e.isPlayer ? G.diff.playerBias : 1) : 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best >= 0 && bestScore > 0.8 && !launchPara(f, best, f.troops * (0.25 + 0.3 * f.aggr));
  }

  // Bomb the most valuable enemy building within reach of a ready air base.
  function aiStrike(f) {
    const value = { silo: 5, city: 4, sam: 4, airfield: 3, artillery: 3, shipyard: 2, coastal: 2, barracks: 2, mine: 1, fort: 1 };
    let best = null;
    let bestScore = 0;
    for (const b of G.buildings.values()) {
      if (allied(b.owner, f.id)) continue;
      const score = (value[b.type] || 1) * (G.factions[b.owner].isPlayer ? G.diff.playerBias : 1) * b.level;
      if (score > bestScore && !pickAirbase(f, b.cell).err) {
        bestScore = score;
        best = b;
      }
    }
    return !!best && !launchStrike(f, best.cell);
  }

  function aiBoat(f) {
    for (let tries = 0; tries < 300; tries++) {
      const i = Math.floor(Math.random() * G.n);
      const o = G.owner[i];
      if (o === WATER || allied(o, f.id)) continue;
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
    aiFleet(f);
    // Still in the land grab: bordering empty land and no enemy yet.
    f.landGrab = scan.counts.has(NEUTRAL) && ![...scan.counts.keys()].some((o) => o >= 0 && !allied(o, f.id));
    aiBuild(f, scan);
    if (G.attacks.filter((a) => a.from === f.id).length >= 2) return;
    const ratio = f.troops / maxTroops(f);

    let best = null;
    let bestScore = 0;
    for (const [o, shared] of scan.counts) {
      if (o < 0 || allied(o, f.id)) continue;
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
    } else if (neutralOpen && ratio > 0.12 + 0.25 * (1 - (f.baseAggr ?? aggr))) {
      // Grabbing empty land uses the personality's own pace: difficulty only
      // changes how readily AIs fight.
      const grab = f.baseAggr ?? aggr;
      target = NEUTRAL;
      pct = 0.3 + 0.3 * grab;
    } else if (!neutralOpen && best !== null && ratio > 0.9 && bestScore > 0.5) {
      // Hemmed in and at full strength: use the troops rather than waste them.
      target = best;
      pct = 0.5;
    }
    if (f.airReady && f.gold > 800 && Math.random() < 0.1 + f.aggr * 0.25 && aiStrike(f)) return;
    if (f.built.airfield && ratio > 0.5 && Math.random() < 0.15 + f.aggr * 0.3 && aiPara(f)) return;
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
    if (G.planes.length && G.factions.some((f) => f.built.sam)) samAirDefence();
    samDefence();
    advanceInterceptors();
    advancePlanes();
    advanceShips();
    if (G.walls.length) pruneWalls();
    spawnCrates();
    fireArtillery();
    if (G.factions.some((f) => f.built.coastal)) fireCoastal();
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

  // Host only. The war ends when one side is left (a nation, or a team of
  // allies), or no humans are.
  function checkEnd() {
    const alive = G.factions.filter((f) => f.alive);
    const humans = alive.filter((f) => f.isPlayer);
    const sides = new Set(alive.map((f) => (f.team ? 't' + f.team : 'f' + f.id)));
    if (sides.size === 1 || !humans.length) {
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
    // On a team, your side winning counts even if you were knocked out.
    const won = final && G.winner >= 0 && allied(G.winner, myId);
    sfx(won ? 'victory' : 'defeat');
    if (window.PixelMusic) window.PixelMusic.stop(1);
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
    if (won && me.team && G.winner !== myId) sub = `Your team won! ${G.factions[G.winner].name} finished the job.`;
    else if (won && me.team) sub = 'Your team won! The map is yours.';
    else if (won) sub = 'Every rival has fallen. The map is yours.';
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
    if (allied(fid, o)) return fail(`${G.factions[o].name} is your ally`);
    if (lockedFor(i, fid)) return fail(`That land was just hit. You can retake it in ${Math.ceil(G.lockUntil[i] - G.time)}s`);
    const amount = me.troops * clamp(Number(pct) || 50, 1, 100) / 100;
    if (amount < 2) return fail('Not enough troops yet');
    if (neighbourScan(fid).counts.has(o) && landRouteIsShort(fid, i)) {
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
    if (allied(fid, G.owner[i])) return fail("That's your ally's land! Pick an enemy target");
    const err = launchNuke(G.factions[fid], i);
    return err ? fail(err) : { ok: true, msg: '' };
  }

  function actTsar(fid, i) {
    if (i < 0 || G.owner[i] === WATER) return fail('Aim at land');
    if (G.owner[i] === fid) return fail("That's your own land! Pick an enemy target");
    if (allied(fid, G.owner[i])) return fail("That's your ally's land! Pick an enemy target");
    const err = launchTsar(G.factions[fid], i);
    return err ? fail(err) : { ok: true, msg: '' };
  }

  function actPara(fid, i, pct) {
    const f = G.factions[fid];
    const err = launchPara(f, i, f.troops * clamp(Number(pct) || 50, 1, 100) / 100);
    return err ? fail(err) : { ok: true, msg: '✈ Paratroopers away!' };
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
    if (act.a === 'tsar') return actTsar(fid, cell);
    if (act.a === 'para') return actPara(fid, cell, act.pct);
    if (act.a === 'strike') {
      const err = launchStrike(G.factions[fid], cell);
      return err ? fail(err) : { ok: true, msg: '💣 Air strike inbound!' };
    }
    if (act.a === 'ship') {
      const err = buildShip(G.factions[fid], act.id, act.kind);
      return err ? fail(err) : { ok: true, msg: `${SHIPS[act.kind].icon} ${SHIPS[act.kind].label} launched` };
    }
    if (act.a === 'wall') {
      const err = buildWall(G.factions[fid], act.from, act.to);
      return err ? fail(err) : { ok: true, msg: '🧱 Wall built: the two forts now hold the line together' };
    }
    if (act.a === 'move') {
      const err = moveShip(G.factions[fid], act.id, cell);
      return err ? fail(err) : { ok: true, msg: '' };
    }
    return fail('');
  }

  // Perform an action for this device's player: here, or on the host.
  function perform(act, after) {
    const done = (res) => {
      if (res.msg) toast(res.msg);
      if (res.ok) buzz();
      if (res.ok) {
        const sounds = { attack: res.msg ? 'boat' : 'attack', build: 'build', upgrade: 'upgrade', spawn: 'spawn' };
        if (sounds[act.a]) sfx(sounds[act.a]);
      } else if (res.msg) {
        sfx('error');
      }
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
    if (G.mode && (G.mode.type === 'nuke' || G.mode.type === 'tsar')) {
      perform({ a: G.mode.type, cell: i });
      G.mode = null;
      updateBanner();
      return;
    }
    if (G.mode && (G.mode.type === 'para' || G.mode.type === 'strike')) {
      perform({ a: G.mode.type, cell: i, pct: settings.pct }, (res) => {
        if (!res.ok) return;
        G.mode = null;
        updateBanner();
      });
      return;
    }
    const ship = shipAtScreen(clientX, clientY);
    if (ship) {
      G.mode = { type: 'ship', id: ship.id };
      updateBanner();
      sfx('tap');
      return;
    }
    if (G.mode && G.mode.type === 'ship') {
      const id = G.mode.id;
      perform({ a: 'move', id, cell: i }, (res) => {
        if (!res.ok) return;
        G.mode = null;
        updateBanner();
      });
      return;
    }
    if (i >= 0 && G.owner[i] === myId && G.bAt[i] >= 0) {
      openUpgradeSheet(G.buildings.get(G.bAt[i]));
      return;
    }
    perform({ a: 'attack', cell: i, pct: settings.pct });
  }

  // One of our ships near this screen point (within a finger's width).
  function shipAtScreen(clientX, clientY) {
    const px = clientX * view.dpr;
    const py = clientY * view.dpr;
    const reach = 22 * view.dpr;
    let best = null;
    let bestD = reach;
    for (const sh of G.ships) {
      if (sh.owner !== myId) continue;
      const y = sy(cy(sh.cell) + 0.5);
      for (const x of copies(sx(cx(sh.cell) + 0.5), canvas.width)) {
        const d = Math.hypot(x - px, y - py);
        if (d < bestD) {
          bestD = d;
          best = sh;
        }
      }
    }
    return best;
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
    // Whole-pixel positions keep every cell the same size on screen.
    view.mapX = Math.round(view.mapX);
    view.mapY = Math.round(view.mapY);
  }

  // Cells are drawn a whole number of device pixels wide (once they're big
  // enough to see), otherwise some columns come out a pixel wider than
  // others and coastlines look ragged. Fully zoomed out rounds down so the
  // whole map still fits.
  function snapCell(z) {
    if (z < 2) return z;
    return z <= view.minCell * 1.02 ? Math.floor(z) : Math.round(z);
  }

  // zoom is the continuous zoom from gestures; cell is what gets drawn.
  function zoomAt(px, py, newZoom) {
    view.zoom = clamp(newZoom, view.minCell, 48 * view.dpr);
    const newCell = snapCell(view.zoom);
    view.mapX = px - (px - view.mapX) * (newCell / view.cell);
    view.mapY = py - (py - view.mapY) * (newCell / view.cell);
    view.cell = newCell;
    view.zoomRel = view.zoom / view.minCell;
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
    view.zoom = contain * view.zoomRel;
    view.cell = snapCell(view.zoom);
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
      gesture = { kind: 'pinch', d0: p.d, zoom0: view.zoom, mx: p.mx, my: p.my };
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
      zoomAt(info.mx * d, info.my * d, gesture.zoom0 * info.d / Math.max(1, gesture.d0));
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
    zoomAt(e.clientX * view.dpr, e.clientY * view.dpr, view.zoom * factor);
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
    // On wrapping maps each copy overlaps the next by a pixel so no seam shows.
    const extra = G.wrap ? 1 : 0;
    for (const x of copies(view.mapX, w)) ctx.drawImage(off, Math.floor(x), view.mapY, w + extra, G.gh * view.cell);
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

  // Walls: a stone line with battlements between two forts, in the owner's
  // colour.
  function drawWalls() {
    if (!G.walls.length) return;
    const w = Math.max(3 * view.dpr, view.cell * 1.2);
    for (const wall of G.walls) {
      const path = wall.path;
      if (!path || path.length < 2) continue;
      // Corner positions, kept continuous across the map's wrap.
      let x = cx(path[0]) + 0.5;
      const pts = [{ x: sx(x), y: sy(cy(path[0]) + 0.5) }];
      for (let k = 1; k < path.length; k++) {
        x += ddx(path[k], path[k - 1]);
        pts.push({ x: sx(x), y: sy(cy(path[k]) + 0.5) });
      }
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (!onScreen(midX, midY, span / 2 + w)) continue;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,20,24,0.85)';
      ctx.lineWidth = w + 2 * view.dpr;
      // A smooth curve: each corner is rounded off between the midpoints of
      // its two sides.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length - 1; k++) {
        ctx.quadraticCurveTo(pts[k].x, pts[k].y, (pts[k].x + pts[k + 1].x) / 2, (pts[k].y + pts[k + 1].y) / 2);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      ctx.strokeStyle = '#a8a29e';
      ctx.lineWidth = w;
      ctx.stroke();
      // Battlements in the owner's colour.
      ctx.lineCap = 'butt';
      ctx.strokeStyle = G.factions[wall.owner].css;
      ctx.lineWidth = w * 0.55;
      ctx.setLineDash([w * 0.7, w * 0.7]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineJoin = 'miter';
    }
  }

  function drawBuildings() {
    const size = clamp(view.cell * 2.6, 14 * view.dpr, 30 * view.dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of G.buildings.values()) {
      const x = sx(cx(b.cell) + 0.5);
      const y = sy(cy(b.cell) + 0.5);
      // In drop mode, show how far each of our airfields can reach (even
      // when the airfield itself is off screen).
      if (b.type === 'airfield' && b.owner === myId && G.mode && (G.mode.type === 'para' || G.mode.type === 'strike')) {
        ctx.beginPath();
        ctx.arc(x, y, sc(AIR_RANGE[b.level - 1]) * view.cell, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220,230,255,0.75)';
        ctx.lineWidth = 2 * view.dpr;
        ctx.setLineDash([8 * view.dpr, 6 * view.dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!onScreen(x, y, size)) continue;
      drawIcon(b.type, x, y, size, G.factions[b.owner].css);
      if (b.level > 1) drawLevel(b.level, x + size * 0.42, y - size * 0.42, size * 0.42);
      if (b.type === 'fort' && b.owner === myId && G.mode) {
        ctx.beginPath();
        ctx.arc(x, y, sc(FORT_RADIUS[b.level - 1]) * view.cell, 0, Math.PI * 2);
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
    } else if (type === 'sam') {
      // A missile on its launcher, pointing up.
      ctx.beginPath();
      ctx.moveTo(x, y - 4.2 * u);
      ctx.lineTo(x + 1.4 * u, y - 1.6 * u);
      ctx.lineTo(x + 1.4 * u, y + 2.2 * u);
      ctx.lineTo(x - 1.4 * u, y + 2.2 * u);
      ctx.lineTo(x - 1.4 * u, y - 1.6 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 3.6 * u, y + 2.6 * u, 7.2 * u, 1.2 * u);
    } else if (type === 'airfield') {
      planeShape(x, y, u, 0);
    } else if (type === 'coastal') {
      // A gun barrel angled out to sea, over a wave.
      ctx.save();
      ctx.translate(x - 0.6 * u, y - 0.4 * u);
      ctx.rotate(-0.55);
      ctx.fillRect(-0.8 * u, -1 * u, 5.2 * u, 2 * u);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x - 1.2 * u, y + 0.2 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, 0.9 * u);
      ctx.beginPath();
      ctx.moveTo(x - 4 * u, y + 3.4 * u);
      ctx.quadraticCurveTo(x - 2 * u, y + 1.8 * u, x, y + 3.4 * u);
      ctx.quadraticCurveTo(x + 2 * u, y + 5 * u, x + 4 * u, y + 3.4 * u);
      ctx.stroke();
    } else if (type === 'barracks') {
      // Two sergeant's chevrons.
      ctx.lineWidth = Math.max(1, 1.1 * u);
      ctx.lineJoin = 'miter';
      for (const off of [-1.4, 1.6]) {
        ctx.beginPath();
        ctx.moveTo(x - 3.4 * u, y + off * u - 1.2 * u);
        ctx.lineTo(x, y + off * u + 1.8 * u);
        ctx.lineTo(x + 3.4 * u, y + off * u - 1.2 * u);
        ctx.stroke();
      }
    }
  }

  // A little aeroplane, nose pointing along `angle` (0 = up), in the current
  // fill colour.
  function planeShape(x, y, u, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -4.2 * u);
    ctx.lineTo(0.8 * u, -2.6 * u);
    ctx.lineTo(0.8 * u, -0.8 * u);
    ctx.lineTo(4.2 * u, 0.8 * u);
    ctx.lineTo(4.2 * u, 1.8 * u);
    ctx.lineTo(0.8 * u, 1 * u);
    ctx.lineTo(0.6 * u, 3 * u);
    ctx.lineTo(1.8 * u, 4 * u);
    ctx.lineTo(-1.8 * u, 4 * u);
    ctx.lineTo(-0.6 * u, 3 * u);
    ctx.lineTo(-0.8 * u, 1 * u);
    ctx.lineTo(-4.2 * u, 1.8 * u);
    ctx.lineTo(-4.2 * u, 0.8 * u);
    ctx.lineTo(-0.8 * u, -0.8 * u);
    ctx.lineTo(-0.8 * u, -2.6 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Supply crates waiting on unclaimed land.
  function drawCrates() {
    const size = clamp(view.cell * 2.2, 11 * view.dpr, 22 * view.dpr);
    for (const i of G.crates) {
      const x = sx(cx(i) + 0.5);
      const y = sy(cy(i) + 0.5);
      if (!onScreen(x, y, size)) continue;
      const h = size / 2;
      ctx.fillStyle = '#b7791f';
      ctx.strokeStyle = '#3b2405';
      ctx.lineWidth = Math.max(1, size * 0.09);
      ctx.fillRect(x - h, y - h, size, size);
      ctx.strokeRect(x - h, y - h, size, size);
      ctx.beginPath();
      ctx.moveTo(x - h, y - h);
      ctx.lineTo(x + h, y + h);
      ctx.moveTo(x + h, y - h);
      ctx.lineTo(x - h, y + h);
      ctx.stroke();
    }
  }

  // Horizontal offset from x (in cells) to the centre of cell c, the short
  // way round on wrapping maps.
  function ddxXY(c, x) {
    let d = cx(c) + 0.5 - x;
    if (G.wrap) {
      if (d > G.gw / 2) d -= G.gw;
      else if (d < -G.gw / 2) d += G.gw;
    }
    return d;
  }

  // Ships and boats move ten times a second; between updates their drawn
  // position glides after the real one so movement looks smooth.
  let glideAt = 0;
  function glide(now) {
    const dt = Math.min(0.1, (now - glideAt) / 1000);
    glideAt = now;
    const k = 1 - Math.exp(-dt * 10);
    for (const o of [...G.ships, ...G.boats]) {
      if (o.dx === undefined || Math.abs(o.x - o.dx) > G.gw / 2) {
        o.dx = o.x;
        o.dy = o.y;
        o.da = o.angle || 0;
        continue;
      }
      o.dx += (o.x - o.dx) * k;
      o.dy += (o.y - o.dy) * k;
      const turn = Math.atan2(Math.sin((o.angle || 0) - o.da), Math.cos((o.angle || 0) - o.da));
      o.da += turn * k;
    }
  }

  // Warships: a hull in the owner's colour; carriers are longer with a flight
  // deck. The selected ship gets a ring and a dashed line to its destination.
  function drawShips() {
    const u = clamp(view.cell * 0.55, 1.8 * view.dpr, 3.4 * view.dpr);
    for (const sh of G.ships) {
      const gx = sh.dx ?? sh.x;
      const gy = sh.dy ?? sh.y;
      const angle = sh.da ?? sh.angle ?? 0;
      const x = sx(gx);
      const y = sy(gy);
      if (!onScreen(x, y, 30 * u)) continue;
      const selected = G.mode && G.mode.type === 'ship' && G.mode.id === sh.id;
      const end = sh.voyage ? sh.voyage.end : sh.endCell;
      if (selected && end >= 0 && end !== undefined) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(sx(gx + ddxXY(end, gx)), sy(cy(end) + 0.5));
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.setLineDash([5 * view.dpr, 5 * view.dpr]);
        ctx.lineWidth = 1.5 * view.dpr;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const len = sh.type === 'carrier' ? 7 : 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(len * u, 0);
      ctx.lineTo(len * u * 0.6, -1.7 * u);
      ctx.lineTo(-len * u, -1.7 * u);
      ctx.lineTo(-len * u, 1.7 * u);
      ctx.lineTo(len * u * 0.6, 1.7 * u);
      ctx.closePath();
      ctx.fillStyle = '#6b7280';
      ctx.fill();
      ctx.lineWidth = Math.max(1, 0.6 * u);
      ctx.strokeStyle = G.factions[sh.owner].css;
      ctx.stroke();
      ctx.fillStyle = G.factions[sh.owner].css;
      if (sh.type === 'carrier') {
        ctx.fillRect(-len * u * 0.85, -0.5 * u, len * u * 1.5, 1 * u);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(len * u * 0.2, -1.6 * u, 1.4 * u, 1.1 * u);
      } else {
        ctx.fillRect(-1.6 * u, -0.9 * u, 3.2 * u, 1.8 * u);
        ctx.fillStyle = '#d1d5db';
        ctx.fillRect(1.6 * u, -0.25 * u, 2.6 * u, 0.5 * u);
      }
      ctx.restore();
      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, (len + 2.5) * u, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * view.dpr;
        ctx.stroke();
      }
      const max = SHIPS[sh.type].hp;
      if (sh.hp < max) {
        const w = len * 2 * u;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - w / 2, y - 3.6 * u, w, 1.2 * u);
        ctx.fillStyle = sh.hp / max > 0.4 ? '#4ade80' : '#ef4444';
        ctx.fillRect(x - w / 2, y - 3.6 * u, w * sh.hp / max, 1.2 * u);
      }
    }
  }

  // Paratrooper planes in flight.
  function drawPlanes() {
    const u = clamp(view.cell * 0.5, 1.6 * view.dpr, 3 * view.dpr);
    for (const p of G.planes) {
      const t = Math.min(1, (p.t + acc) / p.dur);
      const pa = planePoint(p, t);
      const pb = planePoint(p, Math.min(1, t + 0.02));
      // Facing along the path (the last moment of a leg looks back a little).
      const pc = t + 0.02 > 1 ? planePoint(p, t - 0.02) : null;
      const a = { x: sx(pa.x), y: sy(pa.y) };
      const b = pc ? { x: 2 * a.x - sx(pc.x), y: 2 * a.y - sy(pc.y) } : { x: sx(pb.x), y: sy(pb.y) };
      if (!onScreen(a.x, a.y, 20 * u)) continue;
      // Bombers are bigger and dark, with the owner's colour as a trim.
      const bomber = p.kind === 'strike';
      ctx.fillStyle = bomber ? '#1f2937' : G.factions[p.owner].css;
      planeShape(a.x, a.y, bomber ? u * 1.4 : u, Math.atan2(b.x - a.x, a.y - b.y));
      if (bomber) {
        ctx.fillStyle = G.factions[p.owner].css;
        planeShape(a.x, a.y, u * 0.6, Math.atan2(b.x - a.x, a.y - b.y));
      }
    }
  }

  // Play a sound that happens somewhere on the map. Returns the volume used
  // (0 if too far away to hear).
  function worldSfx(name, cell) {
    const { vol, pan } = hearing(cell);
    if (vol < 0.04) return 0;
    sfx(name, { vol, pan });
    return vol;
  }

  // How loud a map event at this cell sounds, and from which side: full
  // volume on screen, fading with distance off screen, and quieter the
  // further the view is zoomed out (as if heard from high above).
  function hearing(cell) {
    if (!view.area || !view.cell) return { vol: 0, pan: 0 };
    const w = canvas.width;
    const h = canvas.height;
    const y = sy(cy(cell) + 0.5);
    // The nearest copy of the cell, on wrapping maps.
    let x = sx(cx(cell) + 0.5);
    for (const c of copies(x, w)) if (Math.abs(c - w / 2) < Math.abs(x - w / 2)) x = c;
    const dx = x - w / 2;
    const dy = y - h / 2;
    const outside = Math.hypot(Math.max(0, Math.abs(dx) - w / 2), Math.max(0, Math.abs(dy) - h / 2));
    const half = Math.min(w, h) / 2;
    const distance = 1 / (1 + outside / half) ** 2;
    // 25% fully zoomed out, rising smoothly to full volume once cells are
    // about 8 screen pixels wide (or 2.5× the zoomed-out size).
    const close = Math.max(8 * view.dpr, view.minCell * 2.5);
    const t = clamp(Math.log(view.cell / view.minCell) / Math.log(close / view.minCell), 0, 1);
    const zoom = 0.25 + 0.75 * t;
    return { vol: distance * zoom, pan: clamp(dx / (w / 2), -1, 1) * 0.7 };
  }

  // ---------- Nation name labels ----------
  //
  // Each name sits at the point deepest inside its nation's land (furthest
  // from any border), so it never floats over the sea or a neighbour. The
  // spot is worked out about once a second and only moves when the old one
  // is clearly no longer a good fit.

  const LABEL_EVERY = 1000;       // ms between placements
  let labelAt = -Infinity;
  let labelGame = null;
  const labels = new Map();       // faction id -> { cell, depth }

  // Chamfer distance (in cells) from every owned cell to its nation's edge.
  function borderDistances() {
    const { gw, gh, owner, n } = G;
    if (!G.labelDepth || G.labelDepth.length !== n) G.labelDepth = new Float32Array(n);
    const d = G.labelDepth;
    const D = 1.414;
    const at = (i, o) => (owner[i] === o ? d[i] : 0);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = owner[i];
        if (o < 0) {
          d[i] = 0;
          continue;
        }
        let v = 1e9;
        v = Math.min(v, (x > 0 ? at(i - 1, o) : 0) + 1);
        v = Math.min(v, (y > 0 ? at(i - gw, o) : 0) + 1);
        v = Math.min(v, (x > 0 && y > 0 ? at(i - gw - 1, o) : 0) + D);
        v = Math.min(v, (x < gw - 1 && y > 0 ? at(i - gw + 1, o) : 0) + D);
        d[i] = v;
      }
    }
    for (let y = gh - 1; y >= 0; y--) {
      for (let x = gw - 1; x >= 0; x--) {
        const i = y * gw + x;
        const o = owner[i];
        if (o < 0) continue;
        let v = d[i];
        v = Math.min(v, (x < gw - 1 ? at(i + 1, o) : 0) + 1);
        v = Math.min(v, (y < gh - 1 ? at(i + gw, o) : 0) + 1);
        v = Math.min(v, (x < gw - 1 && y < gh - 1 ? at(i + gw + 1, o) : 0) + D);
        v = Math.min(v, (x > 0 && y < gh - 1 ? at(i + gw - 1, o) : 0) + D);
        d[i] = v;
      }
    }
    return d;
  }

  function placeLabels(now) {
    if (labelGame !== G) {
      labelGame = G;
      labels.clear();
      labelAt = -Infinity;
    }
    if (now - labelAt < LABEL_EVERY) return;
    labelAt = now;
    const d = borderDistances();
    const best = new Map();
    for (let i = 0; i < G.n; i++) {
      const o = G.owner[i];
      if (o < 0) continue;
      const b = best.get(o);
      if (!b || d[i] > b.depth) best.set(o, { cell: i, depth: d[i] });
    }
    labels.clear();
    for (const [o, b] of best) {
      const prev = labelGame.prevLabels && labelGame.prevLabels.get(o);
      // Stay put while the old spot is still nearly as good.
      if (prev && G.owner[prev.cell] === o && d[prev.cell] >= b.depth * 0.8) {
        labels.set(o, { cell: prev.cell, depth: d[prev.cell] });
      } else {
        labels.set(o, b);
      }
    }
    labelGame.prevLabels = new Map(labels);
  }

  function drawLabels() {
    const dpr = view.dpr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Fade a little when zoomed right out, so names don't clutter the view.
    const zoomedIn = clamp(Math.log(view.cell / view.minCell) / Math.log(2), 0, 1);
    const alpha = 0.6 + 0.4 * zoomedIn;
    for (const f of G.factions) {
      const spot = labels.get(f.id);
      if (!f.alive || !spot) continue;
      const x = sx(cx(spot.cell) + 0.5);
      const y = sy(cy(spot.cell) + 0.5);
      // The name must fit inside the circle of land around the spot.
      const room = spot.depth * view.cell;
      ctx.font = '800 100px system-ui, sans-serif';
      const width100 = ctx.measureText(f.name).width;
      const size = Math.min(1.8 * room / width100 * 100, room * 0.9, 24 * dpr);
      if (size < 9 * dpr || !onScreen(x, y, size * 6)) continue;
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = size * 0.26;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(f.name, x, y);
      ctx.fillText(f.name, x, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBoats() {
    const size = clamp(view.cell * 2.4, 14 * view.dpr, 26 * view.dpr);
    for (const b of G.boats) {
      const x = sx(b.dx ?? b.x);
      const y = sy(b.dy ?? b.y);
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

  // A SAM interceptor: a bright head on a fading smoke trail, climbing
  // slightly as it speeds up towards the meeting point.
  function drawInterceptors() {
    const dpr = view.dpr;
    for (const i of G.interceptors) {
      const x0 = cx(i.from) + 0.5;
      const y0 = cy(i.from) + 0.5;
      let dx = i.hx - x0;
      if (G.wrap) dx -= Math.round(dx / G.gw) * G.gw;
      const dy = i.hy - y0;
      const at = (k) => {
        const e = k * k * (1.6 - 0.6 * k);     // slow off the rail, then fast
        const h = Math.hypot(dx, dy) * 0.12 * Math.sin(Math.PI * e);
        return { x: sx(x0 + dx * e), y: sy(y0 + dy * e - h) };
      };
      const t = Math.min(1, (i.t + acc) / i.dur);
      const p = at(t);
      if (!onScreen(p.x, p.y, 40 * dpr) && !onScreen(sx(x0), sy(y0), 40 * dpr)) continue;
      ctx.lineCap = 'round';
      const steps = 8;
      for (let k = 0; k < steps; k++) {
        const a = at(Math.max(0, t - (k + 1) * 0.06));
        const b = at(Math.max(0, t - k * 0.06));
        ctx.strokeStyle = `rgba(220,235,255,${0.7 * (1 - k / steps)})`;
        ctx.lineWidth = (3 - 2 * k / steps) * dpr;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
    }
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
      ctx.arc(p.x, p.y, (m.tsar ? 9 : 5) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = m.tsar ? '#fbbf24' : '#ef4444';
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

  // An interceptor hitting its target in mid-air: a white flash, an orange
  // fireball, a spreading smoke ring and sparks falling away.
  function drawAirBurst(f, t) {
    const dpr = view.dpr;
    const x = sx(f.x);
    const y = sy(f.y);
    const r = Math.max(16 * dpr, f.radius * view.cell);
    if (!onScreen(x, y, r * 2)) return;
    const grow = 1 - (1 - t) ** 3;
    // Smoke ring.
    ctx.beginPath();
    ctx.arc(x, y, r * (0.5 + 0.9 * grow), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120,120,130,${0.55 * (1 - t)})`;
    ctx.lineWidth = Math.max(1.5 * dpr, r * 0.25 * (1 - t));
    ctx.stroke();
    // Fireball.
    const fr = r * (0.35 + 0.55 * grow);
    const g = ctx.createRadialGradient(x, y, 0, x, y, fr);
    g.addColorStop(0, `rgba(255,250,220,${0.95 * (1 - t)})`);
    g.addColorStop(0.4, `rgba(255,190,70,${0.9 * (1 - t)})`);
    g.addColorStop(1, `rgba(220,60,20,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, fr, 0, Math.PI * 2);
    ctx.fill();
    // Sparks and debris, thrown out and falling.
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6 * dpr;
    for (let k = 0; k < 12; k++) {
      const a = (f.seed + k * 2.39996) % (Math.PI * 2);
      const v = r * (0.9 + ((f.seed * (k + 1)) % 1) * 0.8);
      const d0 = v * Math.max(0, grow - 0.15);
      const d1 = v * grow;
      const drop = r * 0.8 * t * t;
      ctx.strokeStyle = `rgba(255,${200 - k * 8},90,${1 - t})`;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0 + drop * 0.6);
      ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1 + drop);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // The initial flash.
    if (t < 0.25) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7 * (1 - t * 2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - t * 4)})`;
      ctx.fill();
    }
  }

  function drawFx(now) {
    for (const f of G.fx) {
      const t = (now - f.start) / f.dur;
      if (f.rgb === '180,220,255') {
        drawAirBurst(f, Math.min(1, Math.max(0, t)));
        continue;
      }
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07101d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!G) return;
    if (now < shakeUntil) {
      // The shake fades out over about a second.
      const k = Math.min(1.4, (shakeUntil - now) / 1100);
      const m = 14 * view.dpr * k * k;
      ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }
    drawMap();
    glide(now);
    G.fx = G.fx.filter((f) => now - f.start < f.dur);
    for (const origin of copies(view.mapX, G.gw * view.cell)) {
      shiftX = origin - view.mapX;
      ctx.save();
      ctx.translate(shiftX, 0);
      drawDeposits();
      drawCrates();
      drawWalls();
      drawBuildings();
      drawBoats();
      drawShips();
      drawPlanes();
      drawProjectiles();
      drawInterceptors();
      drawFx(now);
      if (!G.demo) {
        placeLabels(now);
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
    } else if (G.mode && G.mode.type === 'tsar') {
      text.innerHTML = '<strong>Tap a target</strong> for the Tsar Bomba ☢☢';
      btn.textContent = 'Cancel';
      banner.dataset.kind = 'mode';
    } else if (G.mode && G.mode.type === 'ship') {
      const sh = G.ships.find((x) => x.id === G.mode.id);
      text.innerHTML = `<strong>Tap the sea</strong> to send your ${sh ? SHIPS[sh.type].label.toLowerCase() : 'ship'}`;
      btn.textContent = 'Cancel';
      banner.dataset.kind = 'mode';
    } else if (G.mode && G.mode.type === 'strike') {
      text.innerHTML = `<strong>Tap a target</strong> for an air strike 💣 (${STRIKE_COST}g)`;
      btn.textContent = 'Cancel';
      banner.dataset.kind = 'mode';
    } else if (G.mode && G.mode.type === 'para') {
      text.innerHTML = `<strong>Tap land</strong> to drop ${settings.pct}% of your troops ✈`;
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
    const reload = me.silosReady ? 0 : Math.ceil(me.nextNuke - G.time);
    nuke.disabled = me.gold < NUKE_COST || reload > 0 || G.state !== 'play';
    nuke.textContent = reload > 0 ? `☢ ${reload}s`
      : `☢ ${NUKE_COST}g${me.silosReady > 1 ? ` ×${me.silosReady}` : ''}`;
    const tsar = $('btn-tsar');
    tsar.classList.toggle('hidden', (me.siloLevel || 0) < 3);
    const tsarWait = Math.ceil((me.nextTsar || 0) - G.time);
    tsar.disabled = me.gold < TSAR_COST || tsarWait > 0 || G.state !== 'play';
    tsar.textContent = tsarWait > 0 ? `☢☢ ${tsarWait}s` : `☢☢ ${fmt(TSAR_COST)}g`;
    const para = $('btn-para');
    para.classList.toggle('hidden', !me.built.airfield && !G.ships.some((sh) => sh.owner === myId && sh.type === 'carrier'));
    const airWait = me.airReady ? 0 : Math.ceil(me.nextAir - G.time);
    para.disabled = airWait > 0 || G.state !== 'play';
    para.textContent = airWait > 0 ? `✈ ${airWait}s` : '✈ Air';

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
          const tag = f.team ? `<span class="tm">T${f.team}</span>` : '';
          return `<li class="${f.id === myId ? 'me' : ''}"><span class="sw" style="background:${f.css}"></span>`
            + `${tag}<span class="bn">${f.name}</span><span class="pc">${pc}%</span>`
            + `<span class="tr">${fmt(f.troops)}</span></li>`;
        });
      $('board').innerHTML = rows.join('');
      if ($('build-sheet').classList.contains('show')) renderBuildSheet();
    }
  }

  // The sheet shows the build menu, one building's upgrade panel, or the
  // air menu (paradrop or air strike).
  let sheetBuilding = null;
  let sheetMode = 'build';

  function openAirSheet() {
    sheetBuilding = null;
    sheetMode = 'air';
    renderBuildSheet();
    $('build-sheet').classList.add('show');
  }

  function renderBuildSheet() {
    const me = G.factions[myId];
    const b = sheetBuilding && G.buildings.get(sheetBuilding);
    if (sheetBuilding && (!b || b.owner !== myId)) {
      closeBuildSheet();
      return;
    }
    if (sheetMode === 'air' && !b) {
      $('sheet-title').textContent = '✈ Air operations';
      $('build-list').innerHTML = `<button data-air="para"><span class="bi">🪂</span><span class="bt"><b>Paradrop</b>`
        + `<small>Drop ${settings.pct}% of your troops on land in range</small></span><span class="bc">Free</span></button>`
        + `<button data-air="strike" ${me.gold < STRIKE_COST ? 'disabled' : ''}><span class="bi">💣</span><span class="bt"><b>Air strike</b>`
        + `<small>Carpet-bomb an area or enemy ships: kills troops, wrecks buildings, sinks boats</small></span><span class="bc">${STRIKE_COST}g</span></button>`
        + '<p class="now">Both use a ready airfield or carrier in range. SAM sites can shoot planes down.</p>';
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
      if (b.type === 'fort') {
        const mine = wallsOf(b).length;
        html += `<p class="now">🧱 Walls: ${mine} of ${WALLS_PER_FORT}. A wall joins two forts up to `
          + `${Math.round(sc(WALL_MAX))} cells apart into one big fort: land along the wall, out to the weaker fort's range, is defended like a fort's. `
          + 'The wall holds out under siege like a fort, but comes down if it is overrun or blasted.</p>';
        if (mine < WALLS_PER_FORT) {
          const options = wallTargets(b).filter((t) => wallsOf(t.fort).length < WALLS_PER_FORT);
          if (!options.length) html += '<p class="now">Build another fort within reach (joined to this one by your land) to wall them together.</p>';
          for (const { fort: o, route } of options.slice(0, 4)) {
            html += `<button data-wall="${o.id}" data-from="${b.id}" ${me.gold < WALL_COST ? 'disabled' : ''}>`
              + `<span class="bi">🧱</span><span class="bt"><b>Wall to level ${o.level} fort</b>`
              + `<small>${compass(b.cell, o.cell)}, a ${route.length}-cell wall along your land</small></span>`
              + `<span class="bc">${WALL_COST}g</span></button>`;
          }
        }
      }
      if (b.type === 'shipyard') {
        html += `<p class="now">Fleet: ${me.ships || 0} of ${me.shipCap || 0} ships</p>`;
        for (const [kind, spec] of Object.entries(SHIPS)) {
          const desc = kind === 'battleship'
            ? `Shells enemy ships, boats and coasts within ${spec.range} cells. ${spec.hp} hits to sink`
            : `A mobile airfield for paradrops. ${spec.hp} hits to sink`;
          html += `<button data-ship="${kind}" data-yard="${b.id}" ${me.gold < spec.cost || me.ships >= me.shipCap ? 'disabled' : ''}>`
            + `<span class="bi">${spec.icon}</span><span class="bt"><b>Build ${spec.label.toLowerCase()}</b>`
            + `<small>${desc}</small></span><span class="bc">${fmt(spec.cost)}g</span></button>`;
        }
        html += '<p class="now">Tap one of your ships, then tap the sea to send it there.</p>';
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

  // Rough direction from one cell to another, for labels.
  function compass(from, to) {
    const dx = ddx(to, from);
    const dy = cy(to) - cy(from);
    const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    return names[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  }

  function openBuildSheet() {
    if (!G || G.state !== 'play') return;
    sheetBuilding = null;
    sheetMode = 'build';
    renderBuildSheet();
    $('build-sheet').classList.add('show');
  }

  function openUpgradeSheet(b) {
    if (!G || G.state !== 'play') return;
    sheetBuilding = b.id;
    sheetMode = 'build';
    renderBuildSheet();
    $('build-sheet').classList.add('show');
  }

  function closeBuildSheet() {
    sheetBuilding = null;
    $('build-sheet').classList.remove('show');
  }

  // ---------- Music ----------
  //
  // The music follows the war: calm on the menu and while expanding, then
  // bass and drums at war, and everything when you're under attack or a nuke
  // is in the air. A rise holds for a while so layers don't flicker.

  const MUSIC_HOLD = 8000;
  let musicAt = 0;
  let musicLevel = 0.12;
  let musicHoldUntil = 0;

  function musicTarget() {
    if (!G || G.demo || G.state === 'spawn') return 0.12;
    const me = G.factions[myId];
    if (!me.alive) return 0.12;
    let v = G.time > 40 ? 0.25 : 0.15;
    const atWar = G.attacks.some((a) => a.from === myId && a.to >= 0);
    const underFire = G.attacks.some((a) => a.to === myId)
      || G.shells.some((sh) => G.owner[sh.to] === myId)
      || G.boats.some((b) => !allied(b.owner, myId) && G.owner[b.landing] === myId);
    if (atWar) v = Math.max(v, 0.5);
    if (underFire) v = Math.max(v, 0.7);
    if (atWar && underFire) v = Math.max(v, 0.85);
    if (G.missiles.length) v = 1;
    return v;
  }

  function updateMusic(now) {
    const M = window.PixelMusic;
    if (!M || now - musicAt < 500) return;
    musicAt = now;
    // The music stops at the end of a game; the jingle plays on its own.
    if (G && (G.state === 'over' || (G.resultStage || 0) > 0)) return;
    if (!M.playing && !M.muted) M.play();
    const target = musicTarget();
    if (target > musicLevel) {
      musicLevel = target;
      musicHoldUntil = now + MUSIC_HOLD;
    } else if (now > musicHoldUntil) {
      musicLevel = target;
    }
    M.setIntensity(musicLevel);
  }

  // ---------- Main loop ----------

  // Advance the simulation (single player and host) and send the host's
  // updates. Normally run every frame; see backgroundBeat for when hidden.
  function step(now) {
    // In the background, steps can come a second or more apart.
    const dt = Math.max(0, Math.min(document.hidden ? 2 : 0.25, (now - last) / 1000));
    last = now;
    if (G && net.role !== 'client' && ((G.demo && G.state === 'menu') || G.state === 'play')) {
      acc += dt * (G.demo ? 1.5 : speed);
      let steps = 0;
      guard(() => {
        while (acc >= TICK && steps < 40) {
          // Count the step even if it fails, so a bad tick can't repeat forever.
          acc -= TICK;
          steps++;
          tick();
          if (!G || G.state === 'over') break;
        }
      });
    }
    if (net.role === 'host' && now - net.lastSend > 100) {
      net.lastSend = now;
      guard(netBroadcast);
    }
  }

  function frame(now) {
    // Ask for the next frame first, so one error can never stop the game
    // (for a host, that would freeze it for everyone).
    requestAnimationFrame(frame);
    guard(() => step(now));
    guard(() => {
      updateMusic(now);
      render(now);
      updateHud(false);
    });
  }

  let errorShownAt = -Infinity;
  function guard(fn) {
    try {
      fn();
    } catch (e) {
      console.error('[game]', e);
      if (performance.now() - errorShownAt > 10000) {
        errorShownAt = performance.now();
        toast(`Something went wrong (${e.message}). The game carries on`);
        if (net.role === 'client' && net.host && net.host.open) net.host.send({ t: 'error', msg: String(e.message).slice(0, 120) });
      }
    }
  }

  // The screen stops refreshing while the app is in the background (and
  // sometimes when it is merely covered, without the page being told),
  // which would freeze a multiplayer game for everyone if the host switched
  // away. During multiplayer a worker's timer (not slowed down like the
  // page's own timers) steps the game whenever frames have stalled.
  let beat = null;
  function backgroundBeat() {
    if (net.role && performance.now() - last > 150) guard(() => step(performance.now()));
  }
  function startBeat() {
    if (beat) return;
    try {
      const src = 'setInterval(() => postMessage(0), 100);';
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = backgroundBeat;
      beat = () => worker.terminate();
    } catch (e) {
      const id = setInterval(backgroundBeat, 100);
      beat = () => clearInterval(id);
    }
  }
  function stopBeat() {
    if (beat) {
      beat();
      beat = null;
    }
  }

  // ---------- Menus and controls ----------

  function syncMenu() {
    const segs = {
      'seg-opp': String(settings.opponents), 'seg-allies': String(settings.allies || 0),
      'seg-diff': settings.difficulty, 'seg-map': settings.map,
      'colour-pick': String(settings.colour),
    };
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
  bindSeg('seg-allies', 'allies', Number);
  $('colour-pick').innerHTML = COLOURS.map((c, k) =>
    `<button data-v="${k}" style="background:${colourCss(k)}" aria-label="${c.name}" title="${c.name}"></button>`).join('');
  bindSeg('colour-pick', 'colour', Number);
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
    if (b.dataset.air) {
      G.mode = { type: b.dataset.air };
      closeBuildSheet();
      updateBanner();
      return;
    }
    if (b.dataset.ship) {
      perform({ a: 'ship', id: Number(b.dataset.yard), kind: b.dataset.ship }, () => renderBuildSheet());
      return;
    }
    if (b.dataset.wall) {
      perform({ a: 'wall', from: Number(b.dataset.from), to: Number(b.dataset.wall) }, () => renderBuildSheet());
      return;
    }
    G.mode = { type: 'build', building: b.dataset.type };
    closeBuildSheet();
    updateBanner();
  });

  $('btn-para').addEventListener('click', () => {
    if (!G || G.state !== 'play') return;
    if ($('build-sheet').classList.contains('show') && sheetMode === 'air') closeBuildSheet();
    else openAirSheet();
  });
  for (const [id, type] of [['btn-nuke', 'nuke'], ['btn-tsar', 'tsar']]) {
    $(id).addEventListener('click', () => {
      if (!G || G.state !== 'play') return;
      closeBuildSheet();
      G.mode = { type };
      updateBanner();
    });
  }

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

  // The sound button cycles: music and effects → effects only → silent.
  const SOUND_MODES = [
    { icon: '🔊', label: 'Music and sound on', music: true, sfx: true },
    { icon: '🔉', label: 'Music off, sound effects on', music: false, sfx: true },
    { icon: '🔇', label: 'All sound off', music: false, sfx: false },
    // Only reachable from the menu switches; the button moves on to "all on".
    { icon: '🎵', label: 'Music only', music: true, sfx: false },
  ];

  function soundMode() {
    const sfxOn = !(window.PixelSound && window.PixelSound.muted);
    const musicOn = !(window.PixelMusic && window.PixelMusic.muted);
    if (sfxOn) return musicOn ? 0 : 1;
    return musicOn ? 3 : 2;
  }

  function syncSoundButton() {
    const mode = SOUND_MODES[soundMode()];
    $('btn-sound').textContent = mode.icon;
    $('btn-sound').setAttribute('aria-label', mode.label);
    // The menu's Music / Effects switches show the same settings.
    $('tg-music').checked = !(window.PixelMusic && window.PixelMusic.muted);
    $('tg-sfx').checked = !(window.PixelSound && window.PixelSound.muted);
  }

  $('tg-music').addEventListener('change', (e) => {
    if (window.PixelMusic) window.PixelMusic.setMuted(!e.target.checked);
    syncSoundButton();
  });
  $('tg-sfx').addEventListener('change', (e) => {
    if (window.PixelSound) window.PixelSound.setMuted(!e.target.checked);
    syncSoundButton();
    sfx('tap');
  });
  $('btn-sound').addEventListener('click', () => {
    if (!window.PixelSound) return;
    const now = soundMode();
    const mode = SOUND_MODES[now === 3 ? 0 : (now + 1) % 3];
    window.PixelSound.setMuted(!mode.sfx);
    if (window.PixelMusic) window.PixelMusic.setMuted(!mode.music);
    syncSoundButton();
    toast(mode.label);
    sfx('tap');
  });
  syncSoundButton();

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
  // STUN servers help devices behind home routers find a direct route.
  const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  // Relay (TURN) servers carry the game when no direct route exists, e.g.
  // on mobile data or strict work Wi-Fi. This is a Metered.ca "Get TURN
  // Credential" URL; its apiKey is designed to be public. Leave it empty to
  // play direct-only.
  const TURN_CREDENTIALS_URL = '';
  let iceServers = null;

  // Fetch relay credentials once per session (with a short timeout), then
  // use them alongside the STUN servers for every connection.
  async function peerOptions() {
    if (!iceServers) {
      iceServers = STUN_SERVERS.slice();
      if (TURN_CREDENTIALS_URL) {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 4000);
          const res = await fetch(TURN_CREDENTIALS_URL, { signal: ctl.signal });
          clearTimeout(timer);
          const relays = await res.json();
          if (Array.isArray(relays)) iceServers = iceServers.concat(relays);
        } catch (e) {
          console.warn('[net] relay credentials unavailable; direct connections only', e);
          iceServers = null; // Try again next time.
          return { config: { iceServers: STUN_SERVERS } };
        }
      }
    }
    return { config: { iceServers } };
  }
  const CONNECT_TIMEOUT = 15000;
  const CONNECT_FAIL = 'Couldn\'t connect to the host. A network between you is blocking direct connections '
    + '(common on mobile data and work or school Wi-Fi). Try both devices on the same Wi-Fi.';
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
    $('btn-ready').classList.toggle('hidden', net.role !== 'client');
    $('lobby-note').textContent = net.role === 'host'
      ? 'Friends open Pixel War on any device (browser, Android or Windows), tap Join and enter this code. '
        + 'Tap an AI slot to switch it on or off, and a team badge to put nations on the same side. '
        + 'The map and difficulty come from your menu settings.'
      : 'Pick a colour, then tap Ready. The host starts the game once everyone is ready.';
  }

  // The lobby shows all MAX_FACTIONS nation slots: the humans first, then
  // AI slots the host can switch on or off.
  // players: [{ name, colour, ready }]; you: this device's entry;
  // countdown: seconds until a forced start, or null; aiOn: per-slot flags.
  const teamLabel = (t) => (t ? `Team ${t}` : 'No team');

  // A team badge for a lobby row: a button for the host, a label otherwise.
  function teamBadge(slot, team, you) {
    const cls = `team-b t${team}`;
    return you === 0
      ? `<button class="${cls}" data-team-slot="${slot}" aria-label="Change team">${teamLabel(team)}</button>`
      : `<span class="${cls}">${teamLabel(team)}</span>`;
  }

  function renderLobby(players, you, countdown, force, aiOn, info, teams) {
    teams = teams || [];
    const lobbyForce = net.role === 'host' ? net.forceAllowed : force;
    net.lobby = players;
    net.you = you;
    $('lobby-code').textContent = net.code;
    $('lobby-info').textContent = info || '';
    const leftover = COLOURS.map((_, k) => k).filter((k) => !players.some((p) => p.colour === k));
    let nextAi = 0;
    const rows = [];
    for (let slot = 0; slot < MAX_FACTIONS; slot++) {
      const p = players[slot];
      if (p) {
        const status = slot === 0 ? 'Host' : p.ready ? '✓ Ready' : 'Not ready';
        rows.push(`<li class="${slot === you ? 'me' : ''}"><span class="sw" style="background:${colourCss(p.colour)}"></span>`
          + `<span class="pn">${p.name}</span>${teamBadge(slot, teams[slot] || 0, you)}`
          + `<span class="ps ${p.ready || slot === 0 ? 'ok' : ''}">${status}</span></li>`);
      } else if (aiOn[slot]) {
        const colour = leftover[nextAi++];
        rows.push(`<li class="ai ${you === 0 ? 'tog' : ''}" data-slot="${slot}"><span class="sw" style="background:${colourCss(colour)}"></span>`
          + `<span class="pn">AI nation</span>${teamBadge(slot, teams[slot] || 0, you)}`
          + `<span class="ps on">${you === 0 ? 'AI on' : 'AI'}</span></li>`);
      } else {
        rows.push(`<li class="off ${you === 0 ? 'tog' : ''}" data-slot="${slot}"><span class="sw empty"></span>`
          + `<span class="pn">Empty</span><span class="ps">${you === 0 ? 'AI off' : 'Empty'}</span></li>`);
      }
    }
    $('lobby-players').innerHTML = rows.join('');
    const taken = players.map((p, k) => (k === you ? -1 : p.colour));
    $('lobby-colours').innerHTML = COLOURS.map((c, k) => {
      const mine = players[you] && players[you].colour === k;
      return `<button data-v="${k}" class="${mine ? 'on' : ''}" style="background:${colourCss(k)}" `
        + `${taken.includes(k) ? 'disabled' : ''} aria-label="${c.name}" title="${c.name}"></button>`;
    }).join('');
    const joiners = players.slice(1);
    const allReady = joiners.length > 0 && joiners.every((p) => p.ready);
    $('btn-start').disabled = !joiners.length;
    const readyCount = `${joiners.filter((p) => p.ready).length}/${joiners.length} ready`;
    if (countdown != null) $('btn-start').textContent = `Waiting for players… ${countdown}s`;
    else if (allReady || !joiners.length) $('btn-start').textContent = 'Start game';
    else $('btn-start').textContent = net.forceAllowed ? 'Start anyway' : `Waiting for players (${readyCount})`;
    const meReady = players[you] && players[you].ready;
    $('btn-ready').textContent = meReady ? 'Not ready' : 'Ready';
    $('btn-ready').classList.toggle('primary', !meReady);
    $('btn-ready').classList.toggle('secondary', !!meReady);
    const ready = joiners.filter((p) => p.ready).length;
    if (countdown != null) {
      $('lobby-status').textContent = you === 0 ? `Giving everyone ${countdown}s to get ready (tap again to stop)`
        : `The host is waiting to start: ${countdown}s${meReady ? '' : '. Tap Ready!'}`;
    } else if (lobbyForce && !allReady) {
      $('lobby-status').textContent = you === 0 ? `${ready} of ${joiners.length} ready. You can start anyway`
        : `The host can start now${meReady ? '' : '. Tap Ready!'}`;
    } else if (you === 0 && joiners.length && !allReady) {
      $('lobby-status').textContent = 'Tap below to give everyone 20 seconds to get ready';
    } else {
      const ais = aiOn.slice(players.length).filter(Boolean).length;
      $('lobby-status').textContent = `${players.length} player${players.length > 1 ? 's' : ''} and ${ais} AI nation${ais === 1 ? '' : 's'}`;
    }
  }

  const MAP_NAMES = { world: 'World', europe: 'Europe', random: 'Random' };
  const lobbyInfo = () => `${MAP_NAMES[settings.map] || 'Random'} map · `
    + `${settings.difficulty[0].toUpperCase() + settings.difficulty.slice(1)} AI`;

  // Host taps a team badge to cycle No team → Team 1 → 2 → 3, or an AI or
  // empty slot to switch the AI on or off.
  $('lobby-players').addEventListener('click', (e) => {
    if (net.role !== 'host') return;
    const badge = e.target.closest('[data-team-slot]');
    if (badge) {
      const slot = Number(badge.dataset.teamSlot);
      net.teams[slot] = ((net.teams[slot] || 0) + 1) % 4;
      sfx('tap');
      lobbyBroadcast();
      return;
    }
    const li = e.target.closest('li[data-slot]');
    if (!li) return;
    const slot = Number(li.dataset.slot);
    net.aiOn[slot] = !net.aiOn[slot];
    sfx('tap');
    lobbyBroadcast();
  });

  function lobbyPlayers() {
    return [{ name: playerName(), colour: net.hostColour, ready: true }]
      .concat([...net.conns.values()].map((p) => ({ name: p.name, colour: p.colour, ready: !!p.ready })));
  }

  // Is colour k free for the player with this peer id (null = the host)?
  function colourFree(k, peerId) {
    if (!Number.isInteger(k) || !COLOURS[k]) return false;
    if (peerId !== null && net.hostColour === k) return false;
    for (const [id, p] of net.conns) if (id !== peerId && p.colour === k) return false;
    return true;
  }

  function lobbyBroadcast() {
    const players = lobbyPlayers();
    const countdown = net.countdownEnd ? Math.max(0, Math.ceil((net.countdownEnd - Date.now()) / 1000)) : null;
    const info = lobbyInfo();
    renderLobby(players, 0, countdown, net.forceAllowed, net.aiOn, info, net.teams);
    let k = 1;
    for (const p of net.conns.values()) {
      if (p.conn.open) {
        p.conn.send({
          t: 'lobby', code: net.code, players, you: k, countdown, force: !!net.forceAllowed, aiOn: net.aiOn, info, teams: net.teams,
        });
      }
      k++;
    }
    // Everyone readied up during a countdown: no need to wait.
    if (net.countdownEnd && net.conns.size && [...net.conns.values()].every((p) => p.ready)) {
      stopCountdown();
      startMultiplayer();
    }
  }

  // Host taps Start: go now if everyone is ready. Otherwise run a ready
  // check; once it runs out the host may start anyway, and anyone still not
  // ready joins the game with a random starting spot.
  const READY_TIMEOUT = 20;

  function hostStartPressed() {
    if (net.role !== 'host' || !net.conns.size) return;
    if (net.countdownEnd) {
      stopCountdown();
      lobbyBroadcast();
      return;
    }
    if (net.forceAllowed || [...net.conns.values()].every((p) => p.ready)) {
      startMultiplayer();
      return;
    }
    net.countdownEnd = Date.now() + READY_TIMEOUT * 1000;
    net.countdownTimer = setInterval(() => {
      if (net.role !== 'host' || !net.countdownEnd) return stopCountdown();
      if (Date.now() < net.countdownEnd) {
        lobbyBroadcast();
        return;
      }
      stopCountdown();
      net.forceAllowed = true;
      lobbyBroadcast();
    }, 1000);
    lobbyBroadcast();
  }

  function stopCountdown() {
    clearInterval(net.countdownTimer);
    net.countdownTimer = null;
    net.countdownEnd = null;
  }

  // Tapping a swatch in the lobby: the host changes directly, joiners ask.
  $('lobby-colours').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const k = Number(b.dataset.v);
    if (net.role === 'host' && colourFree(k, null)) {
      net.hostColour = k;
      lobbyBroadcast();
    } else if (net.role === 'client' && net.host && net.host.open) {
      net.host.send({ t: 'colour', k });
    }
    sfx('tap');
  });

  $('btn-ready').addEventListener('click', () => {
    if (net.role !== 'client' || !net.host || !net.host.open || !net.lobby) return;
    const me = net.lobby[net.you];
    net.host.send({ t: 'ready', on: !(me && me.ready) });
    sfx('tap');
  });

  async function hostGame() {
    if (!window.Peer) {
      toast('Multiplayer could not load. Check your connection');
      return;
    }
    netLeave();
    net.role = 'host';
    startBeat();
    net.hostColour = settings.colour;
    net.aiOn = new Array(MAX_FACTIONS).fill(true);
    net.teams = new Array(MAX_FACTIONS).fill(0);
    net.code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    document.body.classList.add('mp');
    showLobby('Creating a room…');
    const options = await peerOptions();
    if (net.role !== 'host') return; // Left while we were waiting.
    const peer = new window.Peer(PEER_PREFIX + net.code, options);
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
      // The matchmaker found us, but the direct link may still fail.
      if (G && G.demo) toast('Someone is joining…');
      setTimeout(() => {
        if (!conn.open && net.role === 'host') {
          toast('A player couldn\'t connect: a network blocked the direct link. Try the same Wi-Fi');
        }
      }, CONNECT_TIMEOUT);
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
      if (msg.v !== APP_VERSION) {
        conn.send({
          t: 'refused',
          why: `Version mismatch: the host has v${APP_VERSION}, you have ${msg.v ? 'v' + msg.v : 'an older version'}. `
            + 'Update Pixel War (reload the website or install the latest app) so you both match.',
        });
        setTimeout(() => conn.close(), 1500);
        return;
      }
      const started = G && !G.demo;
      if (started || net.conns.size >= MAX_FACTIONS - 1) {
        conn.send({ t: 'refused', why: started ? 'That game has already started' : 'That room is full' });
        setTimeout(() => conn.close(), 500);
        return;
      }
      const wanted = lobbyPlayers().map((p) => p.colour).concat(msg.colour);
      const colour = resolveColours(wanted).pop();
      net.conns.set(conn.peer, { conn, name: cleanName(msg.name), colour, fid: -1 });
      lobbyBroadcast();
    } else if (msg.t === 'rejoin') {
      hostRejoin(conn, msg);
    } else if (msg.t === 'loaded') {
      const p = net.conns.get(conn.peer);
      if (p) p.loaded = true;
    } else if (msg.t === 'ready' || msg.t === 'colour') {
      // Lobby changes from a joiner: only before the game starts.
      const p = net.conns.get(conn.peer);
      if (!p || (G && !G.demo)) return;
      if (msg.t === 'ready') p.ready = !!msg.on;
      else if (colourFree(msg.k, conn.peer)) p.colour = msg.k;
      lobbyBroadcast();
    } else if (msg.t === 'error') {
      const p = net.conns.get(conn.peer);
      toast(`${p ? p.name : 'A player'} hit a problem: ${String(msg.msg).slice(0, 120)}`);
    } else if (msg.t === 'act') {
      const p = net.conns.get(conn.peer);
      if (!p || p.fid < 0) return;
      const res = doAction(p.fid, msg.act);
      conn.send(Object.assign({ t: 'res', seq: msg.seq }, res));
    }
  }

  // A player whose connection dropped mid-game (e.g. their phone suspended
  // the app) comes back to their own nation, which an AI ran meanwhile.
  function hostRejoin(conn, msg) {
    const seat = net.seats.get(msg.token);
    const f = seat && G && !G.demo && G.state !== 'over' ? G.factions[seat.fid] : null;
    if (!f || !f.alive || msg.v !== APP_VERSION) {
      conn.send({ t: 'refused', why: f && !f.alive ? 'Your nation fell while you were away' : 'Couldn\'t rejoin that game' });
      setTimeout(() => conn.close(), 500);
      return;
    }
    // Forget the old link for this seat, if the host hasn't noticed it drop.
    // (Hang up on it only if it came from elsewhere: from the same device,
    // closing it could take the new link down with it.)
    for (const [id, old] of net.conns) {
      if (old.fid !== seat.fid) continue;
      net.conns.delete(id);
      if (old.conn !== conn && old.conn.peer !== conn.peer) {
        try {
          old.conn.close();
        } catch (e) {
          // Already closed.
        }
      }
    }
    const back = !f.isPlayer;
    f.isPlayer = true;
    const p = { conn, name: seat.name, colour: seat.colour, fid: seat.fid, token: msg.token };
    net.conns.set(conn.peer, p);
    sendGame(p, true);
    if (back) announce({ k: 'msg', text: `${seat.name} is back in control of ${f.name}` });
  }

  function hostDrop(conn) {
    const p = net.conns.get(conn.peer);
    // Ignore an old link closing after its player has already rejoined.
    if (!p || p.conn !== conn) return;
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
      announce({ k: 'msg', text: `${p.name} lost connection. An AI runs ${f.name} until they're back` });
    } else {
      lobbyBroadcast();
    }
  }

  // The map's ownership grid is sent in small pieces: large messages have to
  // be split up by PeerJS, which is the step most likely to fail on a phone.
  const OWN_PART = 1500;

  // Send a player the whole game as it stands: at the start, or when they
  // rejoin after losing their connection.
  function sendGame(p, rejoin) {
    const full = snapshot(true);
    const own = full.own;
    full.own = null;
    if (rejoin) {
      // Everyone else gets these in the next update; don't play them twice.
      full.fx = [];
      full.ev = [];
    }
    const parts = [];
    for (let k = 0; k < own.length; k += OWN_PART) parts.push(own.slice(k, k + OWN_PART));
    p.loaded = false;
    p.conn.send({
      t: 'start',
      myId: p.fid,
      token: p.token,
      rejoin,
      kind: G.kind,
      seed: G.seed,
      gw: G.gw,
      gh: G.gh,
      difficulty: settings.difficulty,
      version: APP_VERSION,
      factions: G.factions.map((f) => ({
        name: f.name, player: f.player, isPlayer: f.isPlayer, persona: f.persona, colour: f.colour, team: f.team,
      })),
      parts: parts.length,
    });
    parts.forEach((d, k) => p.conn.send({ t: 'own', k, d }));
    p.conn.send(full);
  }

  function startMultiplayer() {
    if (net.role !== 'host' || !net.conns.size) return;
    const unready = [...net.conns.values()].map((p) => !p.ready);
    const humans = lobbyPlayers();
    // Teams follow the lobby slots: humans first, then each AI slot left on.
    const aiSlots = [];
    for (let slot = humans.length; slot < MAX_FACTIONS; slot++) if (net.aiOn[slot]) aiSlots.push(slot);
    const teams = humans.map((_, k) => net.teams[k]).concat(aiSlots.map((slot) => net.teams[slot]));
    newGame(false, humans, aiSlots.length, teams);
    net.forceAllowed = false;
    // Players who weren't ready get a random start so nobody is held up.
    unready.forEach((away, k) => {
      if (away) actSpawn(k + 1, -1);
    });
    net.seats.clear();
    let fid = 1;
    for (const p of net.conns.values()) {
      p.fid = fid++;
      p.token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');
      net.seats.set(p.token, { fid: p.fid, name: p.name, colour: p.colour });
      sendGame(p, false);
    }
    clearTracking();
    net.sentBver = G.bver;
    setTimeout(() => {
      for (const p of net.conns.values()) {
        if (p.fid >= 0 && !p.loaded) toast(`${p.name} hasn't finished loading. Their connection may be struggling`);
      }
    }, 15000);
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
      nukes: full ? [] : G.nukeEvents,
      f: G.factions.map((f) => [Math.round(f.troops), Math.round(f.gold), f.alive ? 1 : 0, f.capital,
        Math.max(0, (f.nextTsar || 0) - G.time), f.kills, f.name, f.isPlayer ? 1 : 0]),
      b: full || G.bver !== net.sentBver
        ? [...G.buildings.values()].map((b) => [b.id, b.type, b.cell, b.owner, b.level, b.hp, b.readyAt || 0]) : null,
      walls: full || G.bver !== net.sentBver ? G.walls.map((w) => [w.id, w.a, w.b, w.owner, w.path]) : null,
      boats: G.boats.map((b) => [b.id, b.owner, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.troops)]),
      shells: G.shells.map((s) => [s.from, s.to, s.t, s.dur]),
      missiles: G.missiles.map((m) => [m.from, m.to, m.t, m.dur, m.radius, m.tsar ? 1 : 0]),
      planes: G.planes.map((p) => [p.owner, p.from, p.to, p.t, p.dur, p.kind === 'strike' ? 1 : 0, p.returning ? 1 : 0]),
      interceptors: G.interceptors.map((i) => [i.owner, i.from, Math.round(i.hx * 10) / 10, Math.round(i.hy * 10) / 10, i.t, i.dur]),
      ships: G.ships.map((sh) => [sh.id, sh.owner, sh.type, Math.round(sh.x * 10) / 10, Math.round(sh.y * 10) / 10,
        Math.round((sh.angle || 0) * 100) / 100, sh.hp, sh.readyAt || 0, sh.voyage ? sh.voyage.end : -1]),
      crates: G.crates,
      attacks: G.attacks.map((a) => [a.from, a.to, Math.round(a.troops), a.aimX, a.aimY]),
      fx: G.fxEvents,
      ev: G.events,
    };
  }

  function clearTracking() {
    for (const i of G.changed) G.changedMark[i] = 0;
    G.changed = [];
    G.radEvents = [];
    G.nukeEvents = [];
    G.fxEvents = [];
    G.events = [];
  }

  // Updates bigger than this are sent in pieces (as the map is at the start),
  // e.g. after a big land grab while the host's app was in the background.
  const CELL_PART = 3000;

  function netBroadcast() {
    if (!G || G.demo || !G.track) return;
    if (net.conns.size) {
      const snap = snapshot(false);
      const parts = [];
      while (snap.cells.length > CELL_PART) parts.push(snap.cells.splice(0, CELL_PART));
      for (const p of net.conns.values()) {
        if (p.fid < 0 || !p.conn.open) continue;
        for (const d of parts) p.conn.send({ t: 'cells', d });
        p.conn.send(snap);
      }
      net.sentBver = G.bver;
    }
    clearTracking();
  }

  async function joinGame(code) {
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
    showLobby('Connecting to the host…');
    $('lobby-players').innerHTML = '';
    // Until the host answers there is nothing to pick or ready up for.
    document.body.classList.add('mp-connecting');
    const options = await peerOptions();
    if (net.role !== 'client') return; // Left while we were waiting.
    net.peerOptions = options;
    const peer = new window.Peer(options);
    net.peer = peer;
    keepAlive(peer);
    peer.on('open', () => {
      // Also fires when the matchmaking server comes back mid-game.
      if (net.host || net.token) return;
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      net.host = conn;
      conn.on('open', () => conn.send({ t: 'hello', name: playerName(), colour: settings.colour, v: APP_VERSION }));
      wireHost(conn);
      setTimeout(() => {
        if (net.host === conn && !net.connected) netFail(CONNECT_FAIL);
      }, CONNECT_TIMEOUT);
    });
    peerErrors(peer);
  }

  function peerErrors(peer) {
    peer.on('error', (e) => {
      console.warn('[net] client error:', e.type, e.message);
      // While rejoining, failed attempts are simply retried.
      if (net.peer !== peer || net.reconnectUntil) return;
      if (e.type === 'peer-unavailable') netFail(`No game found with code ${net.code}`);
      else if (!net.host || !net.host.open) netFail('Could not connect. Check your internet connection');
    });
  }

  function wireHost(conn) {
    conn.on('data', (msg) => {
      if (net.host === conn) clientReceive(msg);
    });
    conn.on('close', () => hostLost(conn));
    conn.on('error', (e) => {
      console.warn('[net] connection error:', e && e.type, e && e.message);
      hostLost(conn);
    });
  }

  // How long a joiner keeps trying to get back into a game after losing
  // the connection to the host.
  const REJOIN_WINDOW = 90000;

  function hostLost(conn) {
    if (net.role !== 'client' || net.host !== conn) return;
    const inGame = net.token && G && !G.demo && G.state !== 'over';
    if (!inGame) {
      if (!net.connected || conn.open === false) netFail(net.connected ? 'The host has left the game' : CONNECT_FAIL);
      return;
    }
    net.host = null;
    if (!net.reconnectUntil) {
      net.reconnectUntil = Date.now() + REJOIN_WINDOW;
      toast('Lost the connection to the host. Reconnecting…');
    }
    setTimeout(attemptRejoin, 1000);
  }

  function attemptRejoin() {
    if (net.role !== 'client' || !net.reconnectUntil || net.host) return;
    if (Date.now() > net.reconnectUntil) {
      net.reconnectUntil = 0;
      netFail('Lost the connection to the host');
      return;
    }
    const attempt = ++net.rejoinAttempt;
    // Give up on this attempt and try again if nothing has happened.
    setTimeout(() => {
      if (net.rejoinAttempt !== attempt || !net.reconnectUntil) return;
      if (net.host) {
        try {
          net.host.close();
        } catch (e) {
          // Already closed.
        }
        net.host = null;
      }
      attemptRejoin();
    }, 8000);
    let peer = net.peer;
    if (!peer || peer.destroyed) {
      peer = new window.Peer(net.peerOptions || {});
      net.peer = peer;
      keepAlive(peer);
      peerErrors(peer);
    }
    const go = () => {
      if (net.rejoinAttempt !== attempt || net.role !== 'client') return;
      const conn = peer.connect(PEER_PREFIX + net.code, { reliable: true });
      net.host = conn;
      conn.on('open', () => conn.send({ t: 'rejoin', token: net.token, v: APP_VERSION }));
      wireHost(conn);
    };
    if (peer.open) {
      go();
    } else {
      peer.once('open', go);
      if (peer.disconnected && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch (e) {
          // Retried on the next attempt.
        }
      }
    }
  }

  function clientReceive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') {
      net.connected = true;
      document.body.classList.remove('mp-connecting');
      net.code = msg.code;
      renderLobby(msg.players, msg.you, msg.countdown, msg.force, msg.aiOn || [], msg.info, msg.teams);
    } else if (msg.t === 'refused') {
      net.reconnectUntil = 0;
      netFail(msg.why);
    } else if (msg.t === 'bye') {
      net.reconnectUntil = 0;
      netFail('The host has left the game');
    } else if (msg.t === 'start') {
      if (msg.version !== APP_VERSION) {
        netFail(`Version mismatch: the host has ${msg.version ? 'v' + msg.version : 'an older version'}, you have v${APP_VERSION}. Both players need the same version`);
        return;
      }
      net.token = msg.token || '';
      if (msg.rejoin) {
        net.reconnectUntil = 0;
        toast('Reconnected');
      }
      $('lobby-status').textContent = 'Loading the map…';
      clientGuard('Couldn\'t start the game', () => clientStart(msg));
    } else if (msg.t === 'own') {
      if (G && G.loading) clientGuard('Couldn\'t load the map', () => receivePart(msg));
    } else if (msg.t === 'cells') {
      if (G && !G.demo) {
        if (G.loading) G.pendingSnaps.push(msg);
        else clientGuard('Lost sync with the host', () => applyCells(msg.d));
      }
    } else if (msg.t === 'snap') {
      if (G && !G.demo) {
        if (G.loading) G.pendingSnaps.push(msg);
        else clientGuard('Lost sync with the host', () => applySnapshot(msg));
      }
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

  // Run fn; on failure tell the player and the host what went wrong.
  function clientGuard(what, fn) {
    try {
      fn();
    } catch (e) {
      console.error('[net]', what, e);
      if (net.host && net.host.open) net.host.send({ t: 'error', msg: `${what}: ${e.message}` });
      netFail(`${what}: ${e.message}`);
    }
  }

  function receivePart(msg) {
    G.ownParts[msg.k] = msg.d;
    const have = G.ownParts.filter(Boolean).length;
    $('lobby-status').textContent = `Loading the map… ${Math.round(have / G.ownParts.length * 100)}%`;
    if (have < G.ownParts.length) return;
    const own = [].concat(...G.ownParts);
    let p = 0;
    for (let k = 0; k < own.length; k += 2) {
      for (let r = 0; r < own[k + 1]; r++, p++) assignCell(p, own[k]);
    }
    if (p !== G.n) throw new Error(`map size mismatch (${p} of ${G.n} cells)`);
    G.loading = false;
    G.ownParts = null;
    setState('spawn');
    if (!G.keepView) {
      view.zoomRel = 0;
      view.cell = 0;
    }
    resize();
    for (const snap of G.pendingSnaps) {
      if (snap.t === 'cells') applyCells(snap.d);
      else applySnapshot(snap);
    }
    G.pendingSnaps = [];
    updateBanner();
    updateHud(true);
    net.host.send({ t: 'loaded' });
  }

  function clientStart(msg) {
    const rec = msg.kind !== 'random' && window.PIXEL_WAR_MAPS ? window.PIXEL_WAR_MAPS[msg.kind] : null;
    if (msg.kind !== 'random' && (!rec || rec.w !== msg.gw || rec.h !== msg.gh)) {
      throw new Error('this copy has a different map. Update Pixel War');
    }
    $('over').classList.remove('show');
    settings.difficulty = DIFFICULTY[msg.difficulty] ? msg.difficulty : settings.difficulty;
    myId = msg.myId;
    buildWorld(msg.kind, msg.seed, msg.gw, msg.gh, false);
    G.mp = true;
    G.factions = msg.factions.map((f, id) => makeFaction(id, {
      name: f.name, player: f.player, isPlayer: f.isPlayer, persona: f.persona, colour: COLOURS[f.colour] ? f.colour : 0,
      team: f.team || 0,
    }));
    // Stay on the lobby screen until every piece of the map has arrived
    // (or, when rejoining, keep showing the game as it was).
    G.keepView = !!msg.rejoin && view.cell > 0;
    G.loading = true;
    G.ownParts = new Array(msg.parts).fill(null);
    G.pendingSnaps = [];
  }

  function applyCells(cells) {
    for (let k = 0; k < cells.length; k += 2) assignCell(cells[k], cells[k + 1]);
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
    // Fallout decays locally; the host only reports fresh contamination.
    if (dt && G.radList.length) {
      G.radList = G.radList.filter((i) => (G.rad[i] -= dt) > 0 || ((G.rad[i] = 0), false));
      G.dirty = true;
    }
    // Nukes that landed since the last update, then any later changes.
    for (const [to, R, tsar] of s.nukes || []) blastArea(to, R, !!tsar, (i) => assignCell(i, NEUTRAL));
    applyCells(s.cells);
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
      f.nextTsar = G.time + v[4];
      f.kills = v[5];
      f.name = v[6];
      f.isPlayer = !!v[7];
    });
    if (s.b) {
      for (const b of G.buildings.values()) G.bAt[b.cell] = -1;
      G.buildings = new Map();
      for (const f of G.factions) for (const k of Object.keys(f.built)) f.built[k] = 0;
      for (const [id, type, cell, owner, level, hp, readyAt] of s.b) {
        G.buildings.set(id, { id, type, cell, owner, level, hp, readyAt });
        G.bAt[cell] = id;
        G.factions[owner].built[type]++;
      }
    }
    if (s.walls) G.walls = s.walls.map(([id, a, b, owner, path]) => ({ id, a, b, owner, path }));
    // Keep each boat's and ship's drawn position so it can glide to the new one.
    const oldBoats = new Map(G.boats.map((b) => [b.id, b]));
    G.boats = s.boats.map(([id, owner, x, y, troops]) => {
      const b = oldBoats.get(id) || { id };
      return Object.assign(b, { owner, x, y, troops, cell: cellAtXY(x, y) });
    });
    G.shells = s.shells.map(([from, to, t, dur]) => ({ from, to, t, dur }));
    G.missiles = s.missiles.map(([from, to, t, dur, radius, tsar]) => ({ from, to, t, dur, radius, tsar: !!tsar }));
    G.planes = (s.planes || []).map(([owner, from, to, t, dur, strike, returning]) => ({
      owner, from, to, t, dur, kind: strike ? 'strike' : 'para', returning: !!returning,
    }));
    G.interceptors = (s.interceptors || []).map(([owner, from, hx, hy, t, dur]) => ({ owner, from, hx, hy, t, dur }));
    // Joiners draw each ship heading for its next cell, with its destination.
    const oldShips = new Map(G.ships.map((sh) => [sh.id, sh]));
    G.ships = (s.ships || []).map(([id, owner, type, x, y, angle, hp, readyAt, end]) => {
      const sh = oldShips.get(id) || { id };
      return Object.assign(sh, { owner, type, x, y, angle, hp, readyAt, endCell: end, cell: cellAtXY(x, y) });
    });
    G.crates = s.crates || [];
    G.attacks = s.attacks.map(([from, to, troops, aimX, aimY]) => ({ from, to, troops, aimX, aimY }));
    for (const [cell, radius, rgb, dur, x, y] of s.fx) addFx(cell, radius, rgb, dur, x == null ? null : { x, y });
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
    stopBeat();
    try {
      if (net.host) net.host.close();
    } catch (e) {
      // Already closed.
    }
    // The host tells everyone it is leaving (so they don't wait to
    // reconnect), giving the message a moment to arrive before hanging up.
    const conns = [...net.conns.values()].map((p) => p.conn);
    const peer = net.peer;
    let said = false;
    for (const c of conns) {
      try {
        if (c.open) {
          c.send({ t: 'bye' });
          said = true;
        }
      } catch (e) {
        // Already closed.
      }
    }
    const hangUp = () => {
      try {
        for (const c of conns) c.close();
        if (peer) peer.destroy();
      } catch (e) {
        // Already closed.
      }
    };
    if (said) setTimeout(hangUp, 400);
    else hangUp();
    net.peer = null;
    net.host = null;
    net.conns.clear();
    net.pending.clear();
    net.seats.clear();
    net.token = '';
    net.reconnectUntil = 0;
    net.rejoinAttempt++;
    net.code = '';
    net.opened = false;
    net.forceAllowed = false;
    net.connected = false;
    document.body.classList.remove('mp-connecting');
    stopCountdown();
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
  $('btn-start').addEventListener('click', hostStartPressed);
  $('btn-leave').addEventListener('click', toMenu);
  $('mp-name').value = store.get('name', '');
  $('version').textContent = `v${APP_VERSION}`;

  // Exposed for debugging and automated play-testing.
  window.pixelWar = {
    get game() { return G; },
    get myId() { return myId; },
    net,
    doAction,
    hearing,
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
