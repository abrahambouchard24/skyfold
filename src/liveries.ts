// Mythic liveries: each unlockable skin paints the voxel car with its own pattern, not just new
// colours. A painter is asked for every cube of the car's paintwork (body paint, stripes and trim)
// with its position in car space and which way it faces, and returns that cube's colour (and
// whether it glows), or null to keep the plain skin colour.
//
// Car space (world px): x runs tail (-44) to nose (+40), y up from the skirt (the deck is at about
// y 11), z across the car (the hull is 13 either side, the pods out to 23).

export type Face = 'top' | 'side' | 'other';
export type Kind = 'paint' | 'dark' | 'white';
/** A cube's colour (0xRRGGBB) and whether it glows; null keeps the plain skin colour. */
export type Painted = [number, boolean] | null;
export type Painter = (x: number, y: number, z: number, kind: Kind, face: Face) => Painted;

// --- small helpers ---------------------------------------------------------------------------------

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Value noise in 3D, 0..1. */
function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
}
function fbm(x: number, y: number, z: number): number {
  return noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}
function mix(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
function hsl(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return (f(h + 1 / 3) << 16) | (f(h) << 8) | f(h - 1 / 3);
}

const GOLD = 0xe3b85a, GOLD_DARK = 0x8a6420, IVORY = 0xf3ead2;

// --- the liveries ----------------------------------------------------------------------------------

const PAINTERS: Record<string, Painter> = {
  /** VERDIGRIS: an ancient bronze, gone sea-green with patina in the hollows. */
  verdigris(x, y, z, kind) {
    const n = fbm(x * 0.06 + 3, y * 0.09, z * 0.06);
    const bronze = mix(0x6e4a22, 0xb08850, noise(x * 0.4, y * 0.4, z * 0.4) * 0.6 + 0.2);
    if (kind === 'white') return [0xd9b56a, false];
    if (kind === 'dark') return [mix(0x2a1d10, 0x2f6a5a, n), false];
    return [n > 0.5 ? mix(bronze, 0x5fc2a2, (n - 0.5) * 3.2) : bronze, false];
  },

  /** OBSIDIAN: black volcanic glass, mended with gold along its cracks (kintsugi). */
  obsidian(x, y, z, kind) {
    if (kind === 'white') return [GOLD, false];
    const crack = Math.abs(fbm(x * 0.045, y * 0.06 + 7, z * 0.045) - 0.5);
    if (crack < 0.028) return [mix(GOLD, 0xffe6a0, hash3(x, y, z)), false];
    const glass = mix(0x0c0c11, 0x23232c, noise(x * 0.2, y * 0.2, z * 0.2));
    return [kind === 'dark' ? 0x08080b : glass, false];
  },

  /** AUREUS: solid gold, engraved all over with dragon scales. */
  aureus(x, y, z, kind, face) {
    if (kind === 'dark') return [0x3a2a0e, false];
    if (kind === 'white') return [0xfff1c8, false];
    const u = x, w = face === 'side' ? y * 1.4 : z;
    const row = Math.floor(w / 6), off = row % 2 ? 4 : 0;
    const cx = Math.floor((u + off) / 8) * 8 + 4 - off, cy = row * 6;
    const d = Math.hypot((u - cx) * 0.75, w - cy);
    const base = mix(0xc8962e, 0xf0cc6a, noise(x * 0.3, y * 0.3, z * 0.3));
    return [d > 4.2 && d < 5.6 ? GOLD_DARK : base, false];
  },

  /** ZEUS: storm ivory over a deep sky-blue skirt, a lightning bolt crackling down each flank. */
  zeus(x, y, z, kind, face) {
    if (kind === 'white') return [GOLD, false];
    if (kind === 'dark') return [0x13284f, false];
    if (face === 'side' && x > -36 && x < 32) {
      // The bolt: a jagged line along the flank, dropping as it runs back.
      const seg = Math.floor((x + 36) / 9), t = ((x + 36) % 9) / 9;
      const yb = 9.5 - seg * 0.35 + (seg % 2 ? -2.6 : 2.6) * (t < 0.5 ? t * 2 : 2 - t * 2) - (seg % 2 ? -1.3 : 1.3);
      if (Math.abs(y - yb) < 1.3) return [0xaee8ff, true];
      if (Math.abs(y - yb) < 2.4) return [0x2a6fd0, false];
      if (y < 6) return [0x1e3a6b, false];
    }
    if (face === 'top' && Math.abs(z) > 9) return [0xdfe6f2, false];
    return [0xf4f1e8, false];
  },

  /** MARBLE: white Carrara, veined in grey with the odd thread of gold. */
  marble(x, y, z, kind) {
    if (kind === 'white') return [GOLD, false];
    const warp = fbm(x * 0.05, y * 0.07, z * 0.05) * 4.2;
    const v = Math.abs(Math.sin((x * 0.06 + z * 0.045 + y * 0.03 + warp) * Math.PI));
    const base = kind === 'dark' ? 0xd2ccc0 : mix(0xf6f3ec, 0xe6e1d6, noise(x * 0.15, y * 0.15, z * 0.15));
    if (v < 0.06) return [hash3(x, y, z) > 0.75 ? GOLD : 0x8f887c, false];
    if (v < 0.14) return [mix(base, 0xa8a196, 0.55), false];
    return [base, false];
  },

  /** HELIOS (SUNFIRE): dawn red at the tail burning to gold at the nose, a sunburst across the deck. */
  sunfire(x, y, z, kind, face) {
    if (kind === 'dark') return [0x3a1020, false];
    if (kind === 'white') return [0xffe7a8, false];
    const t = (x + 44) / 84;
    const base = t < 0.5 ? mix(0x8e1a2e, 0xff6a2a, t * 2) : mix(0xff6a2a, 0xffc85a, (t - 0.5) * 2);
    if (face === 'top') {
      const a = Math.atan2(z, x - 6);
      if (Math.floor((a / Math.PI) * 14 + 14) % 2 === 0) return [mix(base, 0xfff0b0, 0.35), false];
    }
    return [base, false];
  },

  /** OPAL: milky stone with a play of colour that shifts along the car, and glinting flecks. */
  opal(x, y, z, kind) {
    if (kind === 'dark') return [0x2a2244, false];
    const n = fbm(x * 0.05, y * 0.08, z * 0.05);
    if (hash3(x * 3, y * 3, z * 3) > 0.985) return [hsl(n * 2.3, 0.9, 0.82), true];
    const h = 0.5 + Math.sin(x * 0.045 + n * 5) * 0.22 + z * 0.004;
    return [kind === 'white' ? 0xffffff : hsl(h, 0.5, 0.78 + n * 0.08), false];
  },

  /** PLATINUM: brushed metal with art-deco chevrons racing forward over the deck. */
  platinum(x, y, z, kind, face) {
    if (kind === 'dark') return [0x5a606c, false];
    const brushed = mix(0xc4cad4, 0xe9edf3, hash3(Math.floor(x / 2), 0, Math.floor(z / 6)) * 0.7 + noise(0, y * 0.5, z * 0.5) * 0.3);
    if (kind === 'white') return [0xffffff, false];
    if (face === 'top') {
      const c = ((x - Math.abs(z) * 1.1) % 14 + 14) % 14;
      if (c < 2.5) return [0x3b414c, false];
      if (c < 4) return [0xffffff, false];
    }
    return [brushed, false];
  },

  /** ATLANTIS: deep sea teal, a gold Greek-key meander along each flank and gold-capped waves. */
  atlantis(x, y, z, kind, face) {
    if (kind === 'white') return [0xe2c27a, false];
    if (kind === 'dark') return [0x0b2a2e, false];
    if (face === 'side' && x > -32 && x < 28) {
      // A meander: a 6 x 5 cube motif repeating down the side, between y 4 and 12.
      const KEY = ['#####.', '....#.', '.##.#.', '.#..#.', '.####.'];
      const i = ((Math.floor((x + 32) / 2) % 6) + 6) % 6, r = 4 - Math.floor((y - 3) / 2);
      if (r >= 0 && r < 5 && KEY[r][i] === '#') return [GOLD, false];
    }
    if (face === 'top') {
      const wave = Math.sin(x * 0.35) * 1.6;
      if (Math.abs(Math.abs(z) - 9.5 - wave) < 1) return [0xe2c27a, false];
    }
    return [mix(0x0f4a52, 0x1f7f88, fbm(x * 0.05, y * 0.1, z * 0.05)), false];
  },

  /** IMPERIAL: Tyrian purple with gold eagle-wing chevrons at the nose, pinstripes and a scatter of gold fleurons. */
  imperial(x, y, z, kind, face) {
    if (kind === 'white') return [GOLD, false];
    if (kind === 'dark') return [0x140a2a, false];
    if (face === 'top' && x > 12) {
      const c = ((x + Math.abs(z) * 1.3) % 9 + 9) % 9;
      if (c < 2) return [GOLD, false];
    }
    if (face === 'side' && (Math.abs(y - 5) < 0.9 || Math.abs(y - 10) < 0.9)) return [GOLD, false];
    const gx = Math.round(x / 8) * 8, gz = Math.round((face === 'side' ? y * 2 : z) / 8) * 8;
    if (Math.abs(x - gx) + Math.abs((face === 'side' ? y * 2 : z) - gz) < 1.6 && (gx / 8 + gz / 8) % 2 === 0) return [0xd9b25b, false];
    return [mix(0x2e1659, 0x47267f, noise(x * 0.1, y * 0.1, z * 0.1)), false];
  },

  /** CIRCUIT: a dark slab of the old machine city, its traces still glowing. */
  circuit(x, y, z, kind, face) {
    if (kind === 'dark') return [0x070d10, false];
    const i = Math.floor(x / 2), k = Math.floor((face === 'side' ? y * 1.5 : z) / 2);
    const run = k % 3 === 0 && hash3(Math.floor(i / 5), k, 1) > 0.35;
    const jog = i % 5 === 0 && hash3(i, Math.floor(k / 3), 2) > 0.55;
    if (kind === 'white' || run || jog) return [(run && jog) ? 0xd8fff0 : 0x3fffb0, true];
    return [mix(0x10191d, 0x1d2c33, noise(x * 0.2, y * 0.2, z * 0.2)), false];
  },

  /** VANTA: the black that swallows light, cut by one blood-red line nose to tail. */
  vanta(x, y, z, kind, face) {
    if (kind === 'white') return [0xff2d55, true];
    if (face === 'side' && Math.abs(y - 8) < 0.9 && x > -36 && x < 30) return [0xff2d55, true];
    return [kind === 'dark' ? 0x050506 : 0x101013, false];
  },

  /** VALKYRIE: pearl-white plumage in swept feather rows, the tail feathers lit by the aurora. */
  valkyrie(x, y, z, kind, face) {
    if (kind === 'dark') return [0x8fa6bd, false];
    if (kind === 'white') return [0xc9e6ff, false];
    const w = face === 'side' ? y * 1.6 : Math.abs(z);
    const row = Math.floor(w / 4), u = ((x + row * 3.5) % 8 + 8) % 8;
    const edge = Math.abs(u - (4 - Math.abs((w % 4) - 2) * 1.6)) < 0.9;
    if (x < -30 && edge) return [mix(0x9ff7e6, 0xc9b8ff, noise(x * 0.2, y * 0.2, z * 0.2)), true];
    if (edge) return [0xb9cbe0, false];
    return [mix(0xf6f9fc, 0xe2eaf3, noise(x * 0.15, y * 0.15, z * 0.15)), false];
  },

  /** MEDUSA: emerald serpent scales, a dark diamond chain down the spine, and eyes that glow. */
  medusa(x, y, z, kind, face) {
    if (kind === 'dark') return [0x0c241a, false];
    if (kind === 'white') return [0xe3c26a, false];
    if (face === 'side' && x > 26 && x < 31 && Math.abs(y - 11) < 1.6) return [0xd8ff6a, true];   // the eyes
    if (face === 'top' && Math.abs(z) < 4) {
      const d = Math.abs(((x % 8) + 8) % 8 - 4) + Math.abs(z);
      if (d < 3.4) return [d < 2 ? 0x07140e : 0xd9b85a, false];
    }
    const w = face === 'side' ? y * 1.5 : z;
    const u = (x + w) * 0.7071, v = (x - w) * 0.7071;
    const fu = ((u % 4) + 4) % 4, fv = ((v % 4) + 4) % 4;
    if (fu < 0.8 || fv < 0.8) return [0x123f2b, false];
    return [mix(0x1f7a4f, 0x3fae6e, noise(x * 0.12, y * 0.12, z * 0.12)), false];
  },

  /** POSEIDON: ocean blue from the deep to the shallows, foam-capped waves along the flanks, a gold trident on the spine. */
  poseidon(x, y, z, kind, face) {
    if (kind === 'dark') return [0x071a33, false];
    if (kind === 'white') return [GOLD, false];
    if (face === 'top') {
      const az = Math.abs(z);
      if (az < 0.9 && x > -36 && x < 30) return [GOLD, false];                       // the shaft
      if (x > 20 && x < 30 && Math.abs(az - 3) < 0.9) return [GOLD, false];           // the prongs
      if (x > 19 && x < 21 && az < 4) return [GOLD, false];                           // the crossbar
    }
    if (face === 'side') {
      const crest = 6.5 + Math.sin(x * 0.42) * 1.6 + Math.sin(x * 0.13) * 0.8;
      if (Math.abs(y - crest) < 0.9) return [0xeef9ff, false];
      if (y < crest) return [mix(0x0a2a55, 0x123f73, y / 8), false];
    }
    return [mix(0x123f73, 0x2a7fb8, Math.max(0, (y - 6) / 10) * 0.8 + noise(x * 0.1, y * 0.1, z * 0.1) * 0.2), false];
  },

  /** VESTA: the hearth that never goes out: deep crimson, flames licking up from the tail, embers rising. */
  vesta(x, y, z, kind) {
    if (kind === 'dark') return [0x2a060c, false];
    if (kind === 'white') return [0xffd27a, false];
    if (hash3(x * 2, y * 2, z * 2) > 0.975 && x > -30) return [mix(0xffb347, 0xffe7a0, hash3(x, z, y)), true];   // embers
    const reach = -18 + (fbm(x * 0.05, z * 0.15 + y * 0.15, 3) - 0.5) * 30;   // how far forward the flames lick
    if (x < reach) {
      const t = Math.max(0, Math.min(1, (reach - x) / 18));
      return [t > 0.6 ? 0xffd27a : t > 0.3 ? 0xff8a2a : 0xd2381e, false];
    }
    return [mix(0x5e0f1c, 0x8e1a2e, noise(x * 0.1, y * 0.1, z * 0.1)), false];
  },

  /** ANUBIS: night-black, banded down the flanks in gold and lapis like a royal headdress. */
  anubis(x, y, z, kind, face) {
    if (kind === 'dark') return [0x060608, false];
    if (kind === 'white') return [GOLD, false];
    if (face === 'side' && x > -34 && x < 22) {
      const band = Math.floor((y - 2) / 2);
      if (band >= 0 && band <= 5) return [band % 2 ? 0x2a4fbf : 0xd9b25b, false];
    }
    if (face === 'top' && Math.abs(Math.abs(z) - 4.5) < 0.8 && x > -36 && x < 26) return [GOLD, false];
    return [mix(0x0d0d11, 0x1b1b22, noise(x * 0.15, y * 0.15, z * 0.15)), false];
  },
};

/** Liveries whose trim metal isn't the usual gold (wing leading edges, intake rings, fairings). */
const METAL: Record<string, number> = { platinum: 0xe9eef5, vanta: 0x2a2a31, circuit: 0x2a3a42, obsidian: 0xe3b85a, valkyrie: 0xdfe8f2 };

/** The trim metal for a skin's pattern (undefined = the usual gold). */
export function liveryMetal(pattern?: string): number | undefined {
  return pattern ? METAL[pattern] : undefined;
}

/** The painter for a skin's pattern (undefined = plain colours). */
export function liveryPainter(pattern?: string): Painter | undefined {
  return pattern ? PAINTERS[pattern] : undefined;
}

// --- printed paper ------------------------------------------------------------------------------------
// For the folded-paper craft: each livery as a seamless square of printed washi paper, drawn on the
// skin's body colour. u runs along the craft (tail to nose), v across the span. Everything here
// repeats exactly at the tile's edges (periodic noise and patterns whose periods divide the size).

const TILE = 256;

/** Value noise that wraps every `cells` lattice cells across the tile, so it repeats seamlessly. */
function tnoise(u: number, v: number, cells: number, seed: number): number {
  const x = (u / TILE) * cells, y = (v / TILE) * cells;
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const h = (i: number, j: number) => hash3(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
function tfbm(u: number, v: number, seed: number): number {
  return tnoise(u, v, 4, seed) * 0.55 + tnoise(u, v, 8, seed + 1) * 0.3 + tnoise(u, v, 16, seed + 2) * 0.15;
}
const TAU = Math.PI * 2;
/** A wave with a whole number of cycles across the tile. */
const per = (u: number, cycles: number) => Math.sin((u / TILE) * TAU * cycles);
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Each livery's print: the colour of one pixel of the tile. */
const PRINTS: Record<string, (u: number, v: number) => number> = {
  verdigris(u, v) {
    const n = tfbm(u, v, 11), bronze = mix(0x6e4a22, 0xb08850, tnoise(u, v, 32, 12));
    return n > 0.52 ? mix(bronze, 0x5fc2a2, (n - 0.52) * 3.4) : bronze;
  },
  obsidian(u, v) {
    const crack = Math.abs(tfbm(u, v, 21) - 0.5);
    if (crack < 0.018) return mix(GOLD, 0xffe6a0, tnoise(u, v, 64, 22));
    return mix(0x0c0c11, 0x26262f, tnoise(u, v, 8, 23));
  },
  aureus(u, v) {
    const row = Math.floor(v / 16), off = row % 2 ? 16 : 0;
    const cx = Math.floor((u + off) / 32) * 32 + 16 - off, cy = row * 16;
    const d = Math.hypot((u - cx) * 0.55, v - cy);
    return d > 12.5 && d < 15 ? GOLD_DARK : mix(0xc8962e, 0xf0cc6a, tnoise(u, v, 16, 31));
  },
  zeus(u, v) {
    // Two bolts along the craft, zig-zagging (8 kinks per tile), a pale electric core with blue edges.
    for (const base of [64, 192]) {
      const t = mod(u, 32) / 32, dir = Math.floor(u / 32) % 2 ? 1 : -1;
      const y = base + dir * (t * 2 - 1) * 14;
      const d = Math.abs(v - y);
      if (d < 3) return 0xe8f8ff;
      if (d < 6) return 0x3f8fe0;
      if (d < 7.5) return GOLD;
    }
    return mix(0xf4f1e8, 0xe4e2da, tnoise(u, v, 16, 41));
  },
  marble(u, v) {
    const warp = tfbm(u, v, 51) * 5;
    const vein = Math.abs(Math.sin(((u + v) / TILE) * TAU * 2 + warp));
    const base = mix(0xf6f3ec, 0xe6e1d6, tnoise(u, v, 8, 52));
    if (vein < 0.04) return tnoise(u, v, 32, 53) > 0.7 ? GOLD : 0x8f887c;
    if (vein < 0.12) return mix(base, 0xa8a196, 0.5);
    return base;
  },
  sunfire(u, v) {
    // Dawn red at the span's edges to gold along the middle, with sunburst rays fanning across it.
    const t = 1 - Math.abs(v / TILE - 0.5) * 2;
    const base = t < 0.5 ? mix(0x8e1a2e, 0xff6a2a, t * 2) : mix(0xff6a2a, 0xffc85a, (t - 0.5) * 2);
    const ray = Math.floor(Math.atan2(v - TILE / 2, mod(u, 128) - 64) / Math.PI * 12);
    return ray % 2 ? base : mix(base, 0xfff0b0, 0.22);
  },
  opal(u, v) {
    const n = tfbm(u, v, 61);
    if (hash3(u, v, 62) > 0.995) return hsl(n * 2.3, 0.9, 0.85);
    return hsl(0.5 + per(u, 2) * 0.2 + n * 0.3, 0.5, 0.77 + n * 0.08);
  },
  platinum(u, v) {
    const brushed = mix(0xc4cad4, 0xe9edf3, hash3(Math.floor(u / 2), 0, 71) * 0.6 + tnoise(u, v, 16, 72) * 0.4);
    const c = mod(u - Math.abs(v - TILE / 2) * 0.9, 32);
    if (c < 4) return 0x3b414c;
    if (c < 6) return 0xffffff;
    return brushed;
  },
  atlantis(u, v) {
    // A gold Greek key along both edges of the span, waves between.
    const KEY = ['######', '#.....', '#.###.', '#.#.#.', '#...#.', '#####.'];
    for (const top of [8, TILE - 32]) {
      if (v >= top && v < top + 24) {
        const i = Math.floor(mod(u, 24) / 4), r = Math.floor((v - top) / 4);
        return KEY[r][i] === '#' ? GOLD : 0x0b2a2e;
      }
    }
    const wave = Math.abs(v - TILE / 2 - per(u, 8) * 10);
    if (wave < 2) return 0xe2c27a;
    return mix(0x0f4a52, 0x1f7f88, tfbm(u, v, 81));
  },
  imperial(u, v) {
    const c = mod(u + Math.abs(v - TILE / 2) * 1.1, 32);
    if (c < 4) return GOLD;
    const gu = mod(u, 32) - 16, gv = mod(v, 32) - 16;
    if (Math.abs(gu) + Math.abs(gv) < 4) return 0xd9b25b;
    return mix(0x2e1659, 0x47267f, tnoise(u, v, 8, 91));
  },
  circuit(u, v) {
    const i = Math.floor(u / 8), k = Math.floor(v / 8);
    const run = k % 3 === 0 && mod(v, 8) < 3 && hash3(Math.floor(i / 4) % 8, k, 101) > 0.35;
    const jog = i % 4 === 0 && mod(u, 8) < 3 && hash3(i, Math.floor(k / 3) % 11, 102) > 0.5;
    if (run && jog) return 0xd8fff0;
    if (run || jog) return 0x3fffb0;
    return mix(0x10191d, 0x1d2c33, tnoise(u, v, 16, 103));
  },
  vanta(u, v) {
    if (Math.abs(v - TILE / 2) < 3) return 0xff2d55;
    return mix(0x0d0d10, 0x17171b, tnoise(u, v, 16, 111));
  },
  valkyrie(u, v) {
    const row = Math.floor(v / 16), uu = mod(u + row * 14, 32);
    const edge = Math.abs(uu - (16 - Math.abs(mod(v, 16) - 8) * 1.4)) < 1.6;
    if (edge) return 0xb9cbe0;
    return mix(0xf6f9fc, 0xe2eaf3, tnoise(u, v, 16, 121));
  },
  medusa(u, v) {
    if (Math.abs(v - TILE / 2) < 12) {
      const d = Math.abs(mod(u, 32) - 16) + Math.abs(v - TILE / 2);
      if (d < 12) return d < 7 ? 0x07140e : 0xd9b85a;
    }
    const a = (u + v) * 0.7071, b = (u - v) * 0.7071;
    if (mod(a, 11.3) < 1.6 || mod(b, 11.3) < 1.6) return 0x123f2b;
    return mix(0x1f7a4f, 0x3fae6e, tnoise(u, v, 16, 131));
  },
  poseidon(u, v) {
    if (Math.abs(v - TILE / 2) < 2) return GOLD;
    const crest = (v2: number) => Math.abs(mod(v2, 64) - 32 - per(u, 8) * 9);
    if (crest(v) < 2) return 0xeef9ff;
    return mix(0x0a2a55, 0x2a7fb8, 0.3 + tfbm(u, v, 141) * 0.5);
  },
  vesta(u, v) {
    if (hash3(u, v, 151) > 0.993) return mix(0xffb347, 0xffe7a0, hash3(v, u, 152));
    const lick = mod(v, 64) / 64, tongue = (per(u, 8) * 0.5 + 0.5) * 0.6 + tfbm(u, v, 153) * 0.4;
    if (lick < tongue * 0.5) return lick < tongue * 0.18 ? 0xffd27a : lick < tongue * 0.34 ? 0xff8a2a : 0xd2381e;
    return mix(0x5e0f1c, 0x8e1a2e, tnoise(u, v, 8, 154));
  },
  anubis(u, v) {
    const band = Math.floor(v / 16);
    if (band % 4 === 1) return GOLD;
    if (band % 4 === 3) return 0x2a4fbf;
    return mix(0x0d0d11, 0x1b1b22, tnoise(u, v, 16, 161));
  },
};

const prints = new Map<string, HTMLCanvasElement>();

/**
 * A livery as a seamless TILE x TILE square of printed paper (u along the craft, v across the span),
 * with a soft paper fibre over the print. undefined for a plain skin.
 */
export function liveryPattern(pattern?: string): HTMLCanvasElement | undefined {
  if (!pattern || !PRINTS[pattern]) return undefined;
  const done = prints.get(pattern);
  if (done) return done;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(TILE, TILE);
  const f = PRINTS[pattern];
  for (let v = 0; v < TILE; v++) {
    for (let u = 0; u < TILE; u++) {
      const col = f(u, v);
      // Paper fibre: a faint, tileable mottling over the ink.
      const fibre = 0.95 + tnoise(u, v, 64, 7) * 0.07 + (hash3(u, v, 8) - 0.5) * 0.03;
      const i = (v * TILE + u) * 4;
      img.data[i] = Math.min(255, ((col >> 16) & 255) * fibre);
      img.data[i + 1] = Math.min(255, ((col >> 8) & 255) * fibre);
      img.data[i + 2] = Math.min(255, (col & 255) * fibre);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  prints.set(pattern, c);
  return c;
}

