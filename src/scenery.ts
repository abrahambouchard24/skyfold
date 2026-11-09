// Scenery: each track's ground texture and the props around it (a lighthouse on the harbor,
// grandstands on the GP circuit, crystals in the canyon...). Pure decoration: every prop is kept
// clear of the walls, so none of it affects driving.
//
// Tall props fake height by leaning away from the middle of the screen (the further a roof is
// from the camera, the more it leans), which reads as 2.5D as you drive past.

import { HALF_WIDTH, Track, WALL_DIST } from './track';

type GroundKind = 'tarmac' | 'stadium' | 'city' | 'rock' | 'water' | 'canyon' | 'sand' | 'citylights' | 'snow' | 'marble' | 'garden' | 'scorched';

export interface Prop {
  kind: string;
  x: number;
  y: number;
  /** Footprint radius, for spacing and culling. */
  r: number;
  /** Height in px, for the 2.5D lean (0 = flat on the ground). */
  h: number;
  w?: number;      // footprint size for boxy props
  d?: number;
  rot?: number;
  color?: string;
  accent?: string;
  text?: string;
  /** Draw order: flat ground pieces (0) go under everything else (1). */
  layer?: number;
  seed: number;
}

interface Scenery { ground: GroundKind; props: Prop[]; overlays: Prop[] }

export interface View { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }

const LEAN = 1 / 1500;   // roof lean per px of height per px from the camera

// --- building the scenery for a track ---------------------------------------------------------

const cache = new WeakMap<Track, Scenery>();

export function sceneryFor(track: Track): Scenery {
  let s = cache.get(track);
  if (!s) {
    s = build(track);
    cache.set(track, s);
  }
  return s;
}

/** A small deterministic random generator, seeded per track so its scenery is always the same. */
function rng(seedText: string): () => number {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function build(track: Track): Scenery {
  const rand = rng(track.name);
  const props: Prop[] = [];
  const overlays: Prop[] = [];
  const m = track.length;
  const b = track.bounds;
  const cx = track.pts.reduce((a, p) => a + p.x, 0) / m;
  const cy = track.pts.reduce((a, p) => a + p.y, 0) / m;

  // Distance from a point to the track's centerline (coarse scan, done once at load).
  // (Measured as if the road were its normal width: where it widens at a split, it counts as closer.)
  const clearance = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < m; i += 2) {
      const p = track.pts[i];
      const d = Math.hypot(p.x - x, p.y - y) - (track.outer[i] - HALF_WIDTH);
      if (d < best) best = d;
    }
    return best;
  };
  /** Add a prop if it's clear of the walls and of other props. */
  const place = (p: Omit<Prop, 'seed'>, gap = 30): boolean => {
    if (clearance(p.x, p.y) < WALL_DIST + p.r + gap) return false;
    for (const q of props) if (Math.hypot(q.x - p.x, q.y - p.y) < q.r + p.r + 12) return false;
    props.push({ ...p, seed: rand() });
    return true;
  };
  /** Try random spots inside the track's bounds (plus a margin) until n props fit. */
  const scatter = (n: number, make: (x: number, y: number) => Omit<Prop, 'seed'>, margin = 900, tries = n * 25) => {
    let placed = 0;
    for (let k = 0; k < tries && placed < n; k++) {
      const x = b.minX - margin + rand() * (b.maxX - b.minX + margin * 2);
      const y = b.minY - margin + rand() * (b.maxY - b.minY + margin * 2);
      if (place(make(x, y))) placed++;
    }
  };
  /** A point beside the track at sample i, `off` px out on one side (-1 = outside, +1 = infield). */
  const beside = (i: number, side: number, off: number) => {
    const p = track.pts[((i % m) + m) % m];
    return { x: p.x + p.nx * side * off, y: p.y + p.ny * side * off, rot: track.direction(((i % m) + m) % m) };
  };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (a: number, z: number) => a + rand() * (z - a);

  const trees = (n: number, snowy = false, margin = 900) =>
    scatter(n, (x, y) => ({ kind: snowy ? 'pine-snow' : 'pine', x, y, r: between(28, 46), h: 40 }), margin);
  const rocks = (n: number, color: string) =>
    scatter(n, (x, y) => ({ kind: 'rock', x, y, r: between(30, 70), h: 20, color }));

  /** Props in a row beside the track: every `step` samples, `off` px out (-1 outside, +1 infield). */
  const row = (from: number, to: number, step: number, side: number, off: number, make: (q: { x: number; y: number; rot: number }) => Omit<Prop, 'seed' | 'x' | 'y'>, gap = 0) => {
    for (let i = from; i <= to; i += step) { const q = beside(i, side, off); place({ ...make(q), x: q.x, y: q.y }, gap); }
  };
  /** Clusters of props around random centres. */
  const clumps = (n: number, per: number, spread: number, make: (x: number, y: number) => Omit<Prop, 'seed'>, margin = 900) => {
    for (let k = 0; k < n; k++) {
      const x0 = b.minX - margin + rand() * (b.maxX - b.minX + margin * 2), y0 = b.minY - margin + rand() * (b.maxY - b.minY + margin * 2);
      for (let j = 0; j < per; j++) place(make(x0 + (rand() - 0.5) * spread, y0 + (rand() - 0.5) * spread), 10);
    }
  };

  let ground: GroundKind = 'tarmac';
  // Long halls lined up beside the road, and villages of them around the realm.
  const halls = (n: number, margin = 900) => scatter(n, (x, y) => {
    const w = between(180, 260);
    return { kind: 'longhouse', x, y, r: w * 0.55, h: between(90, 120), w, d: w * 0.42, rot: rand() * Math.PI };
  }, margin);
  const runes = (n: number, accent = '#8fd0e0', margin = 700) =>
    scatter(n, (x, y) => ({ kind: 'runestone', x, y, r: 34, h: between(80, 130), accent, rot: rand() * Math.PI }), margin);

  switch (track.name) {
    case 'MIDGARD': {
      // The world of men: a fjord-side village of turf-roofed longhouses behind a palisade, rune
      // stones by the road, a great mead hall in the infield, pines on the hills.
      ground = 'garden';
      row(-44, 40, 9, -1, WALL_DIST + 80, () => ({ kind: 'palisade', r: 90, h: 70, w: 170 }));
      row(-50, 46, 24, -1, WALL_DIST + 200, (q) => ({ kind: 'watchtower', r: 40, h: 160, rot: q.rot }));
      place({ kind: 'mead-hall', x: cx, y: cy, r: 260, h: 190, w: 480, d: 190 }) || scatter(1, (x, y) => ({ kind: 'mead-hall', x, y, r: 260, h: 190, w: 480, d: 190 }), 500);
      clumps(5, 4, 520, (x, y) => { const w = between(180, 250); return { kind: 'longhouse', x, y, r: w * 0.55, h: 110, w, d: w * 0.42, rot: rand() * Math.PI }; });
      row(10, m - 1, 30, 1, WALL_DIST + 60, () => ({ kind: 'runestone', r: 32, h: 100 }));
      scatter(12, (x, y) => ({ kind: 'brazier', x, y, r: 16, h: 40 }), 400);
      trees(60);
      scatter(10, (x, y) => ({ kind: 'peak', x, y, r: between(320, 520), h: 300 }), 1500, 600);
      break;
    }
    case 'ASGARD': {
      // The home of the gods: gold-roofed halls all round the oval, Valhalla in the middle, the
      // rainbow bridge arching overhead, braziers burning.
      ground = 'marble';
      for (let i = 0; i < m; i += 11) {
        const q = beside(i, -1, WALL_DIST + 140);
        place({ kind: 'mead-hall', ...q, r: 120, h: 130, w: 230, d: 90 }, 0);
      }
      place({ kind: 'mead-hall', x: cx, y: cy, r: 330, h: 300, w: 620, d: 260 });
      scatter(4, (x, y) => ({ kind: 'rainbow', x, y, r: 300, h: 300, rot: rand() * Math.PI }), 700);
      scatter(10, (x, y) => ({ kind: 'gold-tower', x, y, r: 50, h: between(300, 480) }), 600);
      row(0, m - 1, 18, 1, WALL_DIST + 60, () => ({ kind: 'brazier', r: 18, h: 50, accent: '#ffd27a' }));
      break;
    }
    case 'JOTUNHEIM': {
      // Giants' country: crags and peaks, rune stones as tall as towers, boulders the giants threw.
      ground = 'rock';
      scatter(14, (x, y) => ({ kind: 'peak', x, y, r: between(300, 560), h: 340 }), 1400, 500);
      row(0, m - 1, 26, -1, WALL_DIST + 110, () => ({ kind: 'runestone', r: 70, h: between(260, 380), accent: '#8fd0e0' }));
      row(13, m - 1, 26, 1, WALL_DIST + 110, () => ({ kind: 'runestone', r: 60, h: between(220, 320), accent: '#8fd0e0' }));
      rocks(40, '#5a5c62');
      scatter(5, (x, y) => ({ kind: 'stone-ring', x, y, r: 220, h: 140 }), 600);
      trees(20, true);
      break;
    }
    case 'NIFLHEIM': {
      // Mist and ice under the aurora: snowfields, frozen pines and birch, ice spires, burial mounds
      // with frost-lit doors, and reindeer.
      ground = 'snow';
      scatter(12, (x, y) => ({ kind: 'peak', x, y, r: between(300, 560), h: 320, color: 'snow' }), 1400, 500);
      clumps(6, 10, 520, (x, y) => ({ kind: rand() < 0.5 ? 'birch' : 'pine-snow', x, y, r: between(22, 40), h: 60 }));
      scatter(30, (x, y) => ({ kind: rand() < 0.5 ? 'birch' : 'pine-snow', x, y, r: between(22, 40), h: 60 }), 900);
      scatter(12, (x, y) => ({ kind: 'ice', x, y, r: between(40, 70), h: between(140, 260) }), 800);
      scatter(6, (x, y) => ({ kind: 'burial-mound', x, y, r: between(90, 130), h: 60 }), 600);
      clumps(4, 5, 300, (x, y) => ({ kind: 'reindeer', x, y, r: 26, h: 40, rot: rand() * Math.PI * 2 }), 500);
      break;
    }
    case 'VANAHEIM': {
      // The green isles of the Vanir: islands with longhouses and watchtowers on a grey-green sea,
      // longships under sail between them.
      ground = 'water';
      let isles = 0;
      for (let k = 0; k < 1400 && isles < 15; k++) {
        const x = b.minX - 400 + rand() * (b.maxX - b.minX + 800), y = b.minY - 400 + rand() * (b.maxY - b.minY + 800);
        const r = between(200, 290);
        if (!place({ kind: 'isle', x, y, r, h: 8, layer: 0 })) continue;
        isles++;
        const what = isles % 3;
        if (what === 0) props.push({ kind: 'longhouse', x, y, r: r * 0.5, h: 110, w: r * 0.9, d: r * 0.38, rot: rand() * Math.PI, seed: rand() });
        else if (what === 1) props.push({ kind: 'watchtower', x, y, r: 40, h: 170, seed: rand() });
        else props.push({ kind: 'pine', x, y, r: 40, h: 40, seed: rand() });
      }
      scatter(10, (x, y) => ({ kind: 'longship', x, y, r: 110, h: 90, w: 220, rot: rand() * Math.PI }), 700);
      break;
    }
    case 'SVARTALFHEIM': {
      // The dwarves' halls: dark crags, great gem crystals, forge braziers and smoking lava rock.
      ground = 'scorched';
      scatter(10, (x, y) => ({ kind: 'peak', x, y, r: between(280, 480), h: 260, color: 'violet' }), 1300, 400);
      const gem = () => pick(['#a46bff', '#7fd0c0', '#c88bff', '#8fd0e0']);
      clumps(12, 5, 460, (x, y) => { const c = gem(); return { kind: 'crystal', x, y, r: between(70, 140), h: between(220, 480), color: c, accent: c }; });
      row(0, m - 1, 37, -1, WALL_DIST + 130, () => { const c = gem(); return { kind: 'crystal', r: between(80, 120), h: between(300, 520), color: c, accent: c }; });
      row(18, m - 1, 30, 1, WALL_DIST + 80, () => ({ kind: 'brazier', r: 18, h: 50, accent: '#ffb45a' }));
      scatter(14, (x, y) => ({ kind: 'lava-rock', x, y, r: between(50, 90), h: 20 }), 700);
      rocks(24, '#2a2234');
      break;
    }
    case 'MUSPELHEIM': {
      // The realm of fire: black rock, rivers of lava rock, fire pillars and burning braziers.
      ground = 'scorched';
      scatter(10, (x, y) => ({ kind: 'peak', x, y, r: between(300, 520), h: 300 }), 1400, 500);
      const flame = () => pick(['#ff6a2a', '#ff9a3d', '#ffc06a']);
      clumps(8, 4, 420, (x, y) => { const c = flame(); return { kind: 'crystal', x, y, r: between(60, 110), h: between(200, 380), color: c, accent: c }; });
      scatter(40, (x, y) => ({ kind: 'lava-rock', x, y, r: between(50, 110), h: 20 }), 800);
      row(0, m - 1, 22, -1, WALL_DIST + 70, () => ({ kind: 'brazier', r: 20, h: 60, accent: '#ff7a2a' }));
      rocks(20, '#2a2220');
      break;
    }
    // --- sprints: long routes, so landmarks line the way at intervals -------------------------------
    case 'IRONWOOD': {
      // The iron forest: dark ancient trees crowding the route, rune stones in the glades, wisps of
      // frost-light drifting, rings of standing stones.
      ground = 'garden';
      row(0, m - 1, 52, -1, WALL_DIST + 110, () => ({ kind: 'ancient-tree', r: between(80, 120), h: between(200, 300) }));
      row(26, m - 1, 52, 1, WALL_DIST + 110, () => ({ kind: 'ancient-tree', r: between(80, 120), h: between(200, 300) }));
      row(13, m - 1, 61, -1, WALL_DIST + 60, () => ({ kind: 'runestone', r: 32, h: 100 }));
      scatter(40, (x, y) => ({ kind: 'ancient-tree', x, y, r: between(90, 140), h: between(220, 340) }), 900, 1400);
      scatter(50, (x, y) => ({ kind: 'wisp', x, y, r: 9, h: between(30, 110), color: '#9fe8e0', accent: '#9fe8e0' }), 400);
      scatter(4, (x, y) => ({ kind: 'stone-ring', x, y, r: 150, h: 70 }), 500);
      break;
    }
    case 'JOMSBORG': {
      // The sea-fortress of the Jomsvikings: palisades and watchtowers along the route, longhouses,
      // longships drawn up, banners in the wind.
      ground = 'garden';
      for (let i = 0; i < m; i += 70) {
        const t = beside(i, -1, WALL_DIST + 140);
        place({ kind: 'watchtower', ...t, r: 45, h: between(170, 230) }, 0);
        const w = beside(i + 35, -1, WALL_DIST + 110);
        place({ kind: 'palisade', ...w, r: 95, h: 80, w: 180 }, 0);
      }
      row(20, m - 1, 45, 1, WALL_DIST + 60, () => ({ kind: 'banner', r: 26, h: 150, color: pick(['#a8342a', '#2f4a6a', '#d8ccb4']) }));
      halls(18, 1200);
      scatter(10, (x, y) => ({ kind: 'longship', x, y, r: 110, h: 90, w: 220, rot: rand() * Math.PI }), 900, 1400);
      trees(50);
      break;
    }
    case 'HELHEIM': {
      // The road to Hel: grey mist, dead pines, burial mounds and rune stones lit cold blue, ice, and
      // braziers burning with pale fire.
      ground = 'rock';
      scatter(30, (x, y) => ({ kind: 'burial-mound', x, y, r: between(80, 140), h: 60, accent: '#8fb8e0' }), 900, 1400);
      row(0, m - 1, 40, -1, WALL_DIST + 70, () => ({ kind: 'runestone', r: 34, h: 110, accent: '#8fb8e0' }));
      row(20, m - 1, 40, 1, WALL_DIST + 70, () => ({ kind: 'brazier', r: 18, h: 50, accent: '#8fd0ff' }));
      scatter(16, (x, y) => ({ kind: 'ice', x, y, r: between(40, 70), h: between(140, 240) }), 800);
      trees(50, true, 1200);
      rocks(30, '#3a3c42');
      break;
    }
    case 'BIFROST': {
      // The rainbow bridge: the road runs between floating islands under the aurora, with rainbow
      // arches and the gold spires of Asgard, above a sea of cloud.
      ground = 'snow';
      scatter(46, (x, y) => ({ kind: 'float-isle', x, y, r: between(90, 170), h: between(140, 520) }), 1200, 1600);
      scatter(10, (x, y) => ({ kind: 'rainbow', x, y, r: between(220, 320), h: 300, rot: rand() * Math.PI }), 900);
      scatter(16, (x, y) => ({ kind: 'gold-tower', x, y, r: 55, h: between(340, 560) }), 900);
      break;
    }
    case 'YGGDRASIL': {
      // Down the World Tree: the great ash itself at the heart, ancient trees, waterfalls off its
      // branches, rune stones and old ruins.
      ground = 'garden';
      place({ kind: 'world-tree', x: cx, y: cy, r: 520, h: 1100 }) || scatter(1, (x, y) => ({ kind: 'world-tree', x, y, r: 520, h: 1100 }), 1200, 600);
      row(0, m - 1, 48, -1, WALL_DIST + 100, () => ({ kind: 'ancient-tree', r: between(70, 110), h: between(200, 300) }));
      row(24, m - 1, 48, 1, WALL_DIST + 100, () => ({ kind: 'ancient-tree', r: between(70, 110), h: between(200, 300) }));
      scatter(8, (x, y) => ({ kind: 'waterfall', x, y, r: 120, h: 200, w: 200, rot: rand() * Math.PI }), 800);
      row(12, m - 1, 90, -1, WALL_DIST + 60, () => ({ kind: 'runestone', r: 34, h: 110, accent: '#9fe8c0' }));
      scatter(16, (x, y) => ({ kind: 'ruin', x, y, r: 60, h: 90, rot: rand() * Math.PI }), 700);
      break;
    }
    case 'ALFHEIM': {
      // The light elves' groves: birch and ancient trees, stone rings, still pools, drifting light.
      ground = 'garden';
      row(0, m - 1, 9, -1, WALL_DIST + 45, () => ({ kind: 'birch', r: 22, h: 70 }));
      row(4, m - 1, 9, 1, WALL_DIST + 45, () => ({ kind: 'birch', r: 22, h: 70 }));
      scatter(30, (x, y) => ({ kind: 'ancient-tree', x, y, r: between(90, 140), h: between(220, 340) }), 900, 1200);
      scatter(6, (x, y) => ({ kind: 'stone-ring', x, y, r: 160, h: 80 }), 600);
      scatter(6, (x, y) => ({ kind: 'pool', x, y, r: 120, h: 3, w: 200, d: 110, rot: rand() * Math.PI, layer: 0 }), 500);
      scatter(60, (x, y) => ({ kind: 'wisp', x, y, r: 9, h: between(30, 120), color: '#fff3c0', accent: '#fff3c0' }), 400);
      scatter(6, (x, y) => ({ kind: 'waterfall', x, y, r: 120, h: 220, w: 200, rot: rand() * Math.PI }), 800);
      break;
    }
  }
  // Sprints: landmarks stand on the island at every split, between the jump lane and the bypass.
  const ISLE_MARK: Record<string, (r: number) => Omit<Prop, 'seed' | 'x' | 'y'>> = {
    'IRONWOOD': (r) => ({ kind: 'ancient-tree', r, h: 260 }),
    'JOMSBORG': (r) => ({ kind: 'watchtower', r: r * 0.45, h: 220 }),
    'HELHEIM': (r) => ({ kind: 'burial-mound', r: r * 0.8, h: 70, accent: '#8fb8e0' }),
    'BIFROST': (r) => ({ kind: 'gold-tower', r: r * 0.5, h: 460 }),
    'YGGDRASIL': (r) => ({ kind: 'runestone', r: r * 0.5, h: 180, accent: '#9fe8c0' }),
  };
  const mark = ISLE_MARK[track.name];
  if (mark) {
    for (const j of track.jumps) {
      const mid = Math.round((j.from + j.land) / 2);
      for (const off of [-34, 0, 34]) {
        const i = mid + off, isl = track.island[i] ?? 0;
        if (isl < 120) continue;
        const p = track.pts[i];
        props.push({ ...mark(isl * 0.8), x: p.x, y: p.y, rot: track.direction(i), seed: rand() });
      }
    }
  }
  // Flat ground pieces first; then from the top of the world down, so nearer props overlap farther ones.
  props.sort((a, b2) => (a.layer ?? 1) - (b2.layer ?? 1) || a.y - b2.y);
  return { ground, props, overlays };
}

// --- ground -------------------------------------------------------------------------------------

const tiles = new Map<GroundKind, CanvasPattern>();

/** Fill the visible world with this track's ground texture. */
/** Whether the ground moves (Harbor Lights' water), so it can't be pre-rendered with the track. */
export function groundMoves(track: Track): boolean { return sceneryFor(track).ground === 'water'; }

export function drawGround(ctx: CanvasRenderingContext2D, track: Track, v: View, time: number): void {
  const s = sceneryFor(track);
  const pattern = groundPattern(ctx, s.ground);
  if (s.ground === 'water') pattern.setTransform(new DOMMatrix().translate((time * 18) % 512, (time * 7) % 512));
  ctx.fillStyle = pattern;
  ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
}

function groundPattern(ctx: CanvasRenderingContext2D, kind: GroundKind): CanvasPattern {
  let p = tiles.get(kind);
  if (p) return p;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = rng(kind);
  const blotches = (n: number, colors: string[], rMin: number, rMax: number) => {
    for (let k = 0; k < n; k++) {
      // Draw each blotch at all four wrap offsets so the tile repeats seamlessly.
      const x = r() * size, y = r() * size, rad = rMin + r() * (rMax - rMin), col = colors[Math.floor(r() * colors.length)];
      for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [size, size], [-size, 0], [0, -size], [-size, -size], [size, -size], [-size, size]]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, col);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  };
  const lines = (n: number, color: string, width: number, len: number, wave: number) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = r() * size, y = r() * size;
      g.beginPath();
      for (let t = 0; t <= 1; t += 0.1) g.lineTo(x + t * len, y + Math.sin(t * Math.PI * 2) * wave);
      g.stroke();
    }
  };
  switch (kind) {
    case 'tarmac':
      g.fillStyle = '#0d1018'; g.fillRect(0, 0, size, size);
      blotches(30, ['rgba(40,50,70,0.35)', 'rgba(0,0,0,0.4)'], 30, 90);
      g.strokeStyle = 'rgba(60,70,110,0.25)'; g.lineWidth = 2;
      for (let k = 0; k <= size; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, size); g.moveTo(0, k); g.lineTo(size, k); g.stroke(); }
      break;
    case 'stadium':
      g.fillStyle = '#0c0f16'; g.fillRect(0, 0, size, size);
      for (let k = 0; k < size; k += 32) { g.fillStyle = k % 64 ? 'rgba(30,60,40,0.25)' : 'rgba(40,80,55,0.25)'; g.fillRect(0, k, size, 32); }
      break;
    case 'city':
      g.fillStyle = '#0b0c16'; g.fillRect(0, 0, size, size);
      g.strokeStyle = 'rgba(70,75,110,0.35)'; g.lineWidth = 26;
      for (let k = 0; k <= size; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, size); g.moveTo(0, k); g.lineTo(size, k); g.stroke(); }
      g.strokeStyle = 'rgba(255,210,90,0.25)'; g.lineWidth = 2; g.setLineDash([14, 14]);
      for (let k = 0; k <= size; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, size); g.moveTo(0, k); g.lineTo(size, k); g.stroke(); }
      g.setLineDash([]);
      break;
    case 'rock':
      g.fillStyle = '#17181b'; g.fillRect(0, 0, size, size);
      blotches(40, ['rgba(95,97,104,0.35)', 'rgba(0,0,0,0.35)', 'rgba(215,220,228,0.09)'], 30, 110);
      lines(30, 'rgba(160,164,172,0.13)', 2, 90, 10);
      break;
    case 'water':
      g.fillStyle = '#061428'; g.fillRect(0, 0, size, size);
      blotches(16, ['rgba(20,70,120,0.35)', 'rgba(0,10,30,0.4)'], 60, 160);
      lines(70, 'rgba(120,200,255,0.18)', 2, 50, 4);
      for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(200,240,255,0.35)'; g.fillRect(r() * size, r() * size, 2, 2); }
      break;
    case 'canyon':
      g.fillStyle = '#140e20'; g.fillRect(0, 0, size, size);
      blotches(40, ['rgba(80,50,120,0.35)', 'rgba(0,0,0,0.4)', 'rgba(150,100,255,0.08)'], 30, 120);
      lines(25, 'rgba(180,140,255,0.12)', 2, 120, 18);
      break;
    case 'sand':
      g.fillStyle = '#2a1f16'; g.fillRect(0, 0, size, size);
      blotches(24, ['rgba(120,80,40,0.3)', 'rgba(0,0,0,0.25)'], 60, 160);
      lines(60, 'rgba(255,200,140,0.12)', 3, 140, 12);
      break;
    case 'citylights':
      g.fillStyle = '#05060c'; g.fillRect(0, 0, size, size);
      g.strokeStyle = 'rgba(80,90,140,0.25)'; g.lineWidth = 3;
      for (let k = 0; k <= size; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, size); g.moveTo(0, k); g.lineTo(size, k); g.stroke(); }
      for (let k = 0; k < 900; k++) {
        g.fillStyle = ['rgba(255,220,140,0.7)', 'rgba(140,220,255,0.6)', 'rgba(255,120,170,0.5)'][Math.floor(r() * 3)];
        const x = Math.floor(r() * 8) * 64 + 6 + r() * 52, y = Math.floor(r() * 8) * 64 + 6 + r() * 52;
        g.fillRect(x, y, 2, 2);
      }
      break;
    case 'snow':
      g.fillStyle = '#c9d6e6'; g.fillRect(0, 0, size, size);
      blotches(30, ['rgba(255,255,255,0.5)', 'rgba(150,175,205,0.35)'], 40, 140);
      lines(40, 'rgba(255,255,255,0.35)', 3, 120, 8);
      break;
    case 'marble':
      g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, size, size);
      lines(26, 'rgba(120,110,95,0.25)', 2, 180, 30);
      g.strokeStyle = 'rgba(160,130,70,0.45)'; g.lineWidth = 3;
      for (let k = 0; k <= size; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, size); g.moveTo(0, k); g.lineTo(size, k); g.stroke(); }
      break;
    case 'garden':
      g.fillStyle = '#5f8f4e'; g.fillRect(0, 0, size, size);
      blotches(36, ['rgba(120,170,90,0.4)', 'rgba(40,80,40,0.35)', 'rgba(255,220,150,0.12)'], 30, 110);
      g.strokeStyle = 'rgba(240,230,210,0.5)'; g.lineWidth = 10;
      for (let k = 0; k <= size; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, size); g.moveTo(0, k); g.lineTo(size, k); g.stroke(); }
      break;
    case 'scorched':
      g.fillStyle = '#1a1620'; g.fillRect(0, 0, size, size);
      blotches(40, ['rgba(0,0,0,0.5)', 'rgba(90,60,110,0.3)', 'rgba(255,120,60,0.08)'], 30, 120);
      lines(30, 'rgba(160,120,255,0.18)', 2, 140, 22);
      break;
  }
  p = ctx.createPattern(c, 'repeat')!;
  tiles.set(kind, p);
  tileCanvases.set(kind, c);
  return p;
}

const tileCanvases = new Map<GroundKind, HTMLCanvasElement>();

/** The ground tile itself (512 px, repeating), for the 3D view to use as a texture. */
export function groundCanvas(kind: GroundKind): HTMLCanvasElement {
  if (!tileCanvases.has(kind)) groundPattern(document.createElement('canvas').getContext('2d')!, kind);
  return tileCanvases.get(kind)!;
}

// --- props --------------------------------------------------------------------------------------

/** Props on the ground, under the cars. */
export function drawProps(ctx: CanvasRenderingContext2D, track: Track, v: View, time: number): void {
  for (const p of sceneryFor(track).props) {
    const reach = p.r + p.h * 0.6;
    if (p.x + reach < v.x0 || p.x - reach > v.x1 || p.y + reach < v.y0 || p.y - reach > v.y1) continue;
    DRAW[p.kind]?.(ctx, p, v, time);
  }
}

/** Things above the cars: the lighthouse beam, the blimp. */
export function drawOverlays(ctx: CanvasRenderingContext2D, track: Track, v: View, time: number): void {
  for (const p of sceneryFor(track).overlays) DRAW[p.kind]?.(ctx, p, v, time);
}

/** How far a point at height h leans away from the camera. */
function lean(p: { x: number; y: number }, h: number, v: View): [number, number] {
  return [(p.x - v.cx) * h * LEAN, (p.y - v.cy) * h * LEAN];
}

function shadow(ctx: CanvasRenderingContext2D, draw: () => void, h: number): void {
  ctx.save();
  ctx.translate(h * 0.18, h * 0.24);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  draw();
  ctx.restore();
}

/** A box seen from above with fake height: shadow, side walls, then the roof. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, v: View,
  roof: string, wall: string, rot = 0): { rx: number; ry: number } {
  const c = Math.cos(rot), s = Math.sin(rot);
  const corner = (u: number, t: number) => [x + u * c - t * s, y + u * s + t * c] as [number, number];
  const base = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
  const [lx, ly] = lean({ x, y }, h, v);
  const top = base.map(([px, py]) => [px + lx, py + ly] as [number, number]);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  base.forEach(([px, py], i) => (i ? ctx.lineTo(px + h * 0.2, py + h * 0.25) : ctx.moveTo(px + h * 0.2, py + h * 0.25)));
  ctx.closePath();
  ctx.fill();
  // Walls: each side as a quad from base edge to roof edge, shaded by which way it faces.
  for (let i = 0; i < 4; i++) {
    const a = base[i], b2 = base[(i + 1) % 4], ta = top[i], tb = top[(i + 1) % 4];
    ctx.fillStyle = wall;
    ctx.globalAlpha = 0.75 + 0.25 * ((i % 2) ? 1 : 0.6);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(tb[0], tb[1]); ctx.lineTo(ta[0], ta[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = roof;
  ctx.beginPath();
  top.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // A crisp lit rim round the roof edge.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return { rx: x + lx, ry: y + ly };
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** A rough polygon around a point (rocks, peaks), the same shape every frame for a given seed. */
function blob(seed: number, x: number, y: number, r: number, n = 9): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.7 + 0.3 * Math.abs(Math.sin(seed * 977 + i * 2.3));
    out.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
  }
  return out;
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

type Drawer = (ctx: CanvasRenderingContext2D, p: Prop, v: View, time: number) => void;

const DRAW: Record<string, Drawer> = {
  pier(ctx, p, v, time) {
    // A concrete pier slab with bollards and a painted safety edge.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot ?? 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-p.w! / 2 + 10, -p.d! / 2 + 14, p.w!, p.d!);
    ctx.fillStyle = '#3a414f';
    ctx.fillRect(-p.w! / 2, -p.d! / 2, p.w!, p.d!);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.strokeRect(-p.w! / 2 + 8, -p.d! / 2 + 8, p.w! - 16, p.d! - 16);
    ctx.setLineDash([]);
    ctx.fillStyle = '#1d222c';
    for (let u = -p.w! / 2 + 30; u < p.w! / 2; u += 70) {
      ctx.beginPath(); ctx.arc(u, -p.d! / 2 + 4, 6, 0, Math.PI * 2); ctx.arc(u, p.d! / 2 - 4, 6, 0, Math.PI * 2); ctx.fill();
    }
    // Light strips along the water edges, with running lights chasing along them.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(79, 227, 255, 0.25)';
    ctx.fillRect(-p.w! / 2, -p.d! / 2 - 6, p.w!, 11);
    ctx.fillRect(-p.w! / 2, p.d! / 2 - 5, p.w!, 11);
    ctx.fillStyle = 'rgba(79, 227, 255, 0.85)';
    ctx.fillRect(-p.w! / 2, -p.d! / 2 - 2, p.w!, 4);
    ctx.fillRect(-p.w! / 2, p.d! / 2 - 1, p.w!, 4);
    const run = (time * 220 + p.seed * 900) % 60;
    for (let u = -p.w! / 2 + run; u < p.w! / 2; u += 60) {
      ctx.fillStyle = 'rgba(200, 245, 255, 0.9)';
      ctx.fillRect(u - 5, -p.d! / 2 - 2, 10, 3);
      ctx.fillRect(-u - 5, p.d! / 2 - 1, 10, 3);
    }
    ctx.restore();
  },
  lighthouse(ctx, p, v, time) {
    // Rocky island, then a tapering tower in stacked rings that leans with height.
    const island = blob(p.seed, p.x, p.y, p.r);
    shadow(ctx, () => { poly(ctx, island); ctx.fill(); }, 30);
    ctx.fillStyle = '#2c3440';
    poly(ctx, island); ctx.fill();
    ctx.fillStyle = '#3d4756';
    poly(ctx, blob(p.seed + 1, p.x - 8, p.y - 8, p.r * 0.75)); ctx.fill();
    // Long shadow of the tower itself.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 46;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.h * 0.3, p.y + p.h * 0.4); ctx.stroke();
    const rings = 12;
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      const [lx, ly] = lean(p, p.h * t, v);
      const rad = 46 - t * 18;
      ctx.fillStyle = k % 3 === 2 ? '#4fe3ff' : t < 0.15 ? '#9aa6b8' : '#e8eef8';
      ctx.beginPath(); ctx.ellipse(p.x + lx, p.y + ly, rad, rad * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    }
    // The lantern: a pulsing core at the top.
    const [lx, ly] = lean(p, p.h, v);
    const pulse = 0.75 + 0.25 * Math.sin(time * 3);
    ctx.fillStyle = '#fff8d8';
    ctx.beginPath(); ctx.arc(p.x + lx, p.y + ly, 22, 0, Math.PI * 2); ctx.fill();
    glow(ctx, p.x + lx, p.y + ly, 120, 'rgba(255,230,140,0.9)', pulse);
  },
  beam(ctx, p, v, time) {
    // Two sweeping light cones from the lantern, drawn above the cars so they wash over the track.
    const [lx, ly] = lean(p, p.h, v);
    const ox = p.x + lx, oy = p.y + ly;
    const a0 = time * 0.7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of [a0, a0 + Math.PI]) {
      const g = ctx.createRadialGradient(ox, oy, 20, ox, oy, p.r);
      g.addColorStop(0, 'rgba(255,240,180,0.32)');
      g.addColorStop(0.5, 'rgba(255,230,150,0.10)');
      g.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, p.r, a - 0.13, a + 0.13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  container(ctx, p, v, time) {
    const { rx, ry } = box(ctx, p.x, p.y, p.w!, p.d!, p.h, v, p.color!, shade(p.color!, -0.35), p.rot);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(p.rot ?? 0);
    // Corrugated roof: ribs across the long side.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let u = -p.w! / 2 + 8; u < p.w! / 2 - 4; u += 9) { ctx.moveTo(u, -p.d! / 2 + 3); ctx.lineTo(u, p.d! / 2 - 3); }
    ctx.stroke();
    // A status light on one corner: mostly green, now and then blinking amber.
    const blink = Math.sin(time * 2 + p.seed * 50) > 0.85;
    ctx.fillStyle = blink ? '#ffb02e' : '#4dff9a';
    ctx.fillRect(p.w! / 2 - 9, -p.d! / 2 + 4, 4, 4);
    ctx.restore();
  },
  crane(ctx, p, v) {
    // Gantry crane: four legs leaning up to a boom.
    const c = Math.cos(p.rot!), s = Math.sin(p.rot!);
    const [lx, ly] = lean(p, p.h, v);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffb02e';
    for (const [u, t] of [[-80, -40], [80, -40], [-80, 40], [80, 40]]) {
      const bx = p.x + u * c - t * s, by = p.y + u * s + t * c;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + lx, by + ly); ctx.stroke();
    }
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(p.x - 140 * c + lx, p.y - 140 * s + ly);
    ctx.lineTo(p.x + 160 * c + lx, p.y + 160 * s + ly);
    ctx.stroke();
    // A light strip along the top of the boom.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    glow(ctx, p.x + 160 * c + lx, p.y + 160 * s + ly, 30, 'rgba(255,60,60,0.9)', 0.8);
  },
  boat(ctx, p, v, time) {
    // A hover-ship riding the swell, with a short glowing wake.
    const bob = Math.sin(time * 1.5 + p.seed * 10) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.rot!);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(10, 14, 85, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(150,220,255,0.15)';
    ctx.beginPath(); ctx.moveTo(-80, -18); ctx.lineTo(-180, -40); ctx.lineTo(-180, 40); ctx.lineTo(-80, 18); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#e8eef8';
    ctx.beginPath(); ctx.moveTo(85, 0); ctx.lineTo(40, -26); ctx.lineTo(-80, -22); ctx.lineTo(-80, 22); ctx.lineTo(40, 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#26324a';
    ctx.fillRect(-40, -14, 60, 28);
    ctx.fillStyle = p.accent!;
    ctx.fillRect(-80, -22, 160, 4);
    ctx.fillRect(-80, 18, 160, 4);
    // Glowing hull trim, a lit bridge window and running lights (white bow, red and green sides).
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-80, -23, 160, 6);
    ctx.fillRect(-80, 17, 160, 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(120, 220, 255, 0.7)';
    ctx.fillRect(14, -10, 5, 20);
    const flash = Math.sin(time * 4 + p.seed * 20) > 0 ? 1 : 0.35;
    for (const [x, y, col] of [[84, 0, '255,255,255'], [-78, -22, '255,60,60'], [-78, 22, '77,255,154']] as const) {
      ctx.fillStyle = `rgba(${col}, ${flash})`;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },
  grandstand(ctx, p, v, time) {
    // Seating banks facing the track, a crowd of coloured dots, and a translucent roof.
    const { rx, ry } = box(ctx, p.x, p.y, p.w!, p.d!, p.h, v, '#2a3048', '#1a1e30', p.rot);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(p.rot!);
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = row % 2 ? '#323a5a' : '#2a3150';
      ctx.fillRect(-p.w! / 2 + 6, -p.d! / 2 + 6 + row * 18, p.w! - 12, 14);
    }
    const cols = ['#ff3d6e', '#4fe3ff', '#ffd23f', '#ffffff', '#7dffb0'];
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 70; k++) {
      const u = (Math.sin(p.seed * 999 + k * 12.9) * 0.5 + 0.5) * (p.w! - 20) - p.w! / 2 + 10;
      const row = k % 4;
      const jump = Math.max(0, Math.sin(time * 6 + k)) * 2;
      ctx.fillStyle = cols[k % cols.length];
      ctx.fillRect(u, -p.d! / 2 + 9 + row * 18 - jump, 3, 3);
      // Each fan is a little point of light.
      ctx.globalAlpha = 0.25;
      ctx.fillRect(u - 2, -p.d! / 2 + 7 + row * 18 - jump, 7, 7);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(200,220,255,0.12)';
    ctx.fillRect(-p.w! / 2, -p.d! / 2 - 6, p.w!, 26);
    // An LED ribbon board along the front, with colour washing along it, and a glowing roof edge.
    const front = p.d! / 2 - 5;
    const shift = (time * 140 + p.seed * 500) % (p.w! * 2);
    const led = ctx.createLinearGradient(-p.w! / 2 - shift, 0, p.w! * 1.5 - shift, 0);
    for (let k = 0; k <= 6; k++) led.addColorStop(k / 6, ['#ff3d6e', '#ffd23f', '#4fe3ff', '#b86bff', '#ff3d6e', '#ffd23f', '#4fe3ff'][k]);
    ctx.fillStyle = led;
    ctx.fillRect(-p.w! / 2 + 4, front - 3, p.w! - 8, 5);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(79, 227, 255, 0.5)';
    ctx.fillRect(-p.w! / 2, -p.d! / 2 - 7, p.w!, 3);
    ctx.restore();
  },
  floodlight(ctx, p, v) {
    const [lx, ly] = lean(p, p.h, v);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.h * 0.2, p.y + p.h * 0.25); ctx.stroke();
    ctx.strokeStyle = '#8a93c0';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + lx, p.y + ly); ctx.stroke();
    ctx.fillStyle = '#e8ecff';
    ctx.fillRect(p.x + lx - 16, p.y + ly - 8, 32, 16);
    glow(ctx, p.x + lx, p.y + ly, 90, 'rgba(230,240,255,0.7)', 0.8);
  },
  billboard(ctx, p, v, time) { sign(ctx, p, v, time, 1); },
  scoreboard(ctx, p, v, time) { sign(ctx, p, v, time, 1.4); },
  building(ctx, p, v, time) {
    const { rx, ry } = box(ctx, p.x, p.y, p.w!, p.d!, p.h, v, p.color!, shade(p.color!, -0.4), p.rot);
    // Lit windows on the roof grid, and a neon strip round the edge.
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(p.rot ?? 0);
    const cols = Math.floor(p.w! / 34), rows = Math.floor(p.d! / 34);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const on = Math.sin(p.seed * 7919 + i * 31 + j * 17) > 0.2;
      if (!on) continue;
      ctx.fillStyle = (i + j) % 5 === 0 ? 'rgba(140,220,255,0.55)' : 'rgba(255,214,140,0.45)';
      ctx.fillRect(-p.w! / 2 + 10 + i * 34, -p.d! / 2 + 10 + j * 34, 14, 10);
    }
    if (p.accent) {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 4 + p.seed * 20);
      ctx.strokeRect(-p.w! / 2 + 3, -p.d! / 2 + 3, p.w! - 6, p.d! - 6);
      // The neon strip's glow, and a white-hot line through its middle.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.25;
      ctx.lineWidth = 12;
      ctx.strokeRect(-p.w! / 2 + 3, -p.d! / 2 + 3, p.w! - 6, p.d! - 6);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-p.w! / 2 + 3, -p.d! / 2 + 3, p.w! - 6, p.d! - 6);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (p.text) {
      ctx.globalAlpha = 1;
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.accent ?? '#fff';
      ctx.fillText(p.text, 0, 0);
    }
    ctx.restore();
  },
  skyscraper(ctx, p, v, time) {
    DRAW.building(ctx, p, v, time);
    // A slowly turning ring of light round the roof.
    const [rx, ry] = lean(p, p.h, v);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.accent ?? '#4fe3ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 22]);
    ctx.lineDashOffset = -time * 40 - p.seed * 100;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(p.x + rx, p.y + ry, Math.min(p.w!, p.d!) * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // A blinking red aircraft light on a roof antenna.
    const [lx, ly] = lean(p, p.h + 60, v);
    const [bx, by] = lean(p, p.h, v);
    ctx.strokeStyle = '#8a93c0';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x + bx, p.y + by); ctx.lineTo(p.x + lx, p.y + ly); ctx.stroke();
    if (Math.sin(time * 3 + p.seed * 40) > 0.3) glow(ctx, p.x + lx, p.y + ly, 26, 'rgba(255,40,60,1)');
  },
  pine(ctx, p) { pine(ctx, p, false); },
  'pine-snow'(ctx, p) { pine(ctx, p, true); },
  rock(ctx, p) {
    const pts = blob(p.seed, p.x, p.y, p.r, 7);
    shadow(ctx, () => { poly(ctx, pts); ctx.fill(); }, p.h);
    ctx.fillStyle = p.color!;
    poly(ctx, pts); ctx.fill();
    ctx.fillStyle = shade(p.color!, 0.25);
    poly(ctx, blob(p.seed + 3, p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.55, 6)); ctx.fill();
    // Rim light along the top-left edges, where the light comes from.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b2 = pts[(i + 1) % pts.length];
      const mid = Math.atan2((a[1] + b2[1]) / 2 - p.y, (a[0] + b2[0]) / 2 - p.x);
      if (Math.cos(mid + 2.3) > 0.3) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); }
    }
    ctx.stroke();
  },
  peak(ctx, p, v) {
    // A mountain: an outline whose summit leans with height, faces shaded light-to-dark.
    const pts = blob(p.seed, p.x, p.y, p.r, 10);
    const [lx, ly] = lean(p, p.h, v);
    const ax = p.x + lx * 0.6 - p.r * 0.1, ay = p.y + ly * 0.6 - p.r * 0.15;
    const violet = p.color === 'violet';
    shadow(ctx, () => { poly(ctx, pts); ctx.fill(); }, 120);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b2 = pts[(i + 1) % pts.length];
      const mid = Math.atan2((a[1] + b2[1]) / 2 - p.y, (a[0] + b2[0]) / 2 - p.x);
      const light = 0.5 + 0.5 * Math.cos(mid + 2.3);  // lit from the top-left
      ctx.fillStyle = violet
        ? `rgb(${40 + light * 50}, ${30 + light * 30}, ${60 + light * 70})`
        : `rgb(${52 + light * 88}, ${54 + light * 88}, ${60 + light * 88})`;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill();
    }
    // Ridge lines from the summit down each fold, lit on the sunny side.
    ctx.lineWidth = 1.5;
    for (let i = 0; i < pts.length; i++) {
      const mid = Math.atan2(pts[i][1] - p.y, pts[i][0] - p.x);
      const lit = 0.5 + 0.5 * Math.cos(mid + 2.3);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + lit * 0.2})`;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    // Snow (or crystal frost) on the top third.
    ctx.fillStyle = violet ? 'rgba(220,190,255,0.75)' : 'rgba(240,248,255,0.9)';
    poly(ctx, pts.map(([x, y]) => [ax + (x - p.x) * 0.3, ay + (y - p.y) * 0.3] as [number, number]));
    ctx.fill();
  },
  crystal(ctx, p, v, time) {
    // A cluster of glowing prisms fanning out from a centre, leaning up with height.
    const n = 4 + Math.floor(p.seed * 4);
    glow(ctx, p.x, p.y, p.r * 1.8, p.accent!, 0.25 + 0.15 * Math.sin(time * 2 + p.seed * 30));
    for (let i = 0; i < n; i++) {
      const a = p.seed * 20 + (i / n) * Math.PI * 2;
      const len = p.r * (0.8 + 0.6 * Math.abs(Math.sin(p.seed * 50 + i)));
      const [lx, ly] = lean(p, p.h * (0.5 + 0.5 * Math.abs(Math.cos(i * 3.1))), v);
      const tipX = p.x + Math.cos(a) * len + lx, tipY = p.y + Math.sin(a) * len + ly;
      const half = Math.max(14, p.r * 0.28);
      const px = -Math.sin(a) * half, py = Math.cos(a) * half;
      const g = ctx.createLinearGradient(p.x, p.y, tipX, tipY);
      g.addColorStop(0, shade(p.accent!, -0.5));
      g.addColorStop(1, p.accent!);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x + px, p.y + py); ctx.lineTo(tipX + px * 0.4, tipY + py * 0.4);
      ctx.lineTo(tipX + Math.cos(a) * 14, tipY + Math.sin(a) * 14);
      ctx.lineTo(tipX - px * 0.4, tipY - py * 0.4); ctx.lineTo(p.x - px, p.y - py);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    }
  },
  pyramid(ctx, p, v, time) {
    // Four faces meeting at an apex that leans with height; a glowing capstone.
    const r = p.r * 0.85;
    const base: [number, number][] = [[p.x - r, p.y - r], [p.x + r, p.y - r], [p.x + r, p.y + r], [p.x - r, p.y + r]];
    const [lx, ly] = lean(p, p.h, v);
    const ax = p.x + lx, ay = p.y + ly;
    shadow(ctx, () => { poly(ctx, base); ctx.fill(); }, 160);
    const faces = ['#c79a5e', '#a37a45', '#7d5a30', '#b88a50'];
    for (let i = 0; i < 4; i++) {
      const a = base[i], b2 = base[(i + 1) % 4];
      ctx.fillStyle = faces[i];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,200,120,0.35)';
    ctx.lineWidth = 2;
    for (const [bx, by] of base) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke(); }
    // Pulses of energy climbing each edge to the capstone.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 70]);
    ctx.lineDashOffset = -time * 120;
    for (const [bx, by] of base) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke(); }
    ctx.restore();
    glow(ctx, ax, ay, p.r * 0.5, 'rgba(255,190,80,0.9)', 0.6 + 0.3 * Math.sin(time * 2));
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2); ctx.fill();
  },
  solar(ctx, p, v, time) {
    // Rows of blue panels catching the light.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-p.w! / 2 + 6, -p.d! / 2 + 8, p.w!, p.d!);
    for (let row = 0; row < 4; row++) {
      const y = -p.d! / 2 + row * (p.d! / 4);
      const g = ctx.createLinearGradient(0, y, 0, y + p.d! / 4 - 8);
      g.addColorStop(0, '#2f5fd0');
      g.addColorStop(1, '#16285a');
      ctx.fillStyle = g;
      ctx.fillRect(-p.w! / 2, y, p.w!, p.d! / 4 - 8);
      ctx.strokeStyle = 'rgba(160,200,255,0.35)';
      ctx.lineWidth = 1;
      for (let x = -p.w! / 2; x < p.w! / 2; x += 26) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + p.d! / 4 - 8); ctx.stroke(); }
    }
    // A slow sheen sweeping across the panels.
    const sweep = ((time * 0.25 + p.seed) % 1.6 - 0.3) * p.w! - p.w! / 2;
    const sheen = ctx.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
    sheen.addColorStop(0, 'rgba(180, 220, 255, 0)');
    sheen.addColorStop(0.5, 'rgba(180, 220, 255, 0.22)');
    sheen.addColorStop(1, 'rgba(180, 220, 255, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sheen;
    ctx.fillRect(-p.w! / 2, -p.d! / 2, p.w!, p.d! - 8);
    ctx.restore();
  },
  turbine(ctx, p, v, time) {
    // Wind turbine from above: mast shadow, then three slowly turning blades at the hub.
    const [lx, ly] = lean(p, p.h, v);
    const hx = p.x + lx, hy = p.y + ly;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.h * 0.2, p.y + p.h * 0.25); ctx.stroke();
    ctx.strokeStyle = '#d9dde8';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(hx, hy); ctx.stroke();
    const spin = time * 1.6 + p.seed * 10;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * 110, hy + Math.sin(a) * 110); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2); ctx.fill();
    if (Math.sin(time * 2.5 + p.seed * 30) > 0.5) glow(ctx, hx, hy, 22, 'rgba(255,60,60,1)');
  },
  helipad(ctx, p, v, time) {
    ctx.fillStyle = '#1d2236';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8ecff';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.75, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '900 90px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8ecff';
    ctx.fillText('H', p.x, p.y + 4);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const on = Math.floor(time * 4) % 8 === k;
      glow(ctx, p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r, on ? 26 : 12, 'rgba(255,210,90,1)', on ? 1 : 0.5);
    }
  },
  blimp(ctx, p, v, time) {
    // Drifts slowly round the stadium, high above everything, with its shadow far below.
    const a = time * 0.05 + p.seed * 6;
    const x = p.x + Math.cos(a) * p.r, y = p.y + Math.sin(a) * p.r * 0.6;
    const heading = a + Math.PI / 2;
    ctx.save();
    ctx.translate(x + 260, y + 340);
    ctx.rotate(heading);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 0, 240, 80, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    const g = ctx.createLinearGradient(0, -80, 0, 80);
    g.addColorStop(0, '#f2f4ff');
    g.addColorStop(1, '#9aa3c8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, 240, 80, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8cde6';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-180, s * 40); ctx.lineTo(-250, s * 100); ctx.lineTo(-230, s * 30); ctx.fill(); }
    ctx.fillStyle = '#ff3d6e';
    ctx.fillRect(-160, -6, 320, 12);
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a1f3a';
    ctx.fillText(p.text ?? '', 0, -36);
    ctx.restore();
  },
};

function pine(ctx: CanvasRenderingContext2D, p: Prop, snow: boolean): void {
  // Top-down pine: layered star shapes, darkest at the bottom.
  shadow(ctx, () => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }, p.h);
  const layers: [number, string][] = [[1, '#16331f'], [0.72, '#1e4a2a'], [0.45, snow ? '#e8f0f4' : '#2a6136']];
  for (const [k, col] of layers) {
    ctx.fillStyle = col;
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + p.seed * 6;
      const rad = p.r * k * (i % 2 ? 0.6 : 1);
      const x = p.x + Math.cos(a) * rad - (1 - k) * 6, y = p.y + Math.sin(a) * rad - (1 - k) * 8;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** Billboard / scoreboard: a glowing panel on two posts. */
function sign(ctx: CanvasRenderingContext2D, p: Prop, v: View, time: number, scale: number): void {
  const w = p.w! * scale, hgt = 70 * scale;
  const [lx, ly] = lean(p, p.h, v);
  ctx.strokeStyle = '#4a5280';
  ctx.lineWidth = 8;
  for (const s of [-1, 1]) {
    const bx = p.x + s * w * 0.3, by = p.y;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + lx, by + ly); ctx.stroke();
  }
  const x = p.x + lx, y = p.y + ly;
  ctx.fillStyle = '#0d1022';
  ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
  // Holographic scanlines drifting down the panel.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  const drift = (time * 20) % 6;
  for (let sy = y - hgt / 2 + drift; sy < y + hgt / 2; sy += 6) ctx.fillRect(x - w / 2, sy, w, 2);
  ctx.strokeStyle = p.accent!;
  ctx.lineWidth = 4;
  ctx.strokeRect(x - w / 2, y - hgt / 2, w, hgt);
  ctx.font = `900 ${Math.round(36 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.accent!;
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 5);
  ctx.fillText(p.text ?? '', x, y + 2);
  ctx.globalAlpha = 1;
  glow(ctx, x, y, w * 0.6, p.accent!, 0.18);
}

/** Lighten (amount > 0) or darken (< 0) a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}
