// Saga character portraits, drawn in code and then folded into paper: each figure is a vector
// bust (in the game's palette: timber, iron, bronze and wool, with each character's own colour)
// which is cut into flat triangular planes like folded. Every plane takes the colour of the drawing
// under it and a tone from the angle of its fold, with crisp creases between planes and a matte
// paper grain. The backdrop is a wall of folded timber planks with iron straps, and a round
// shield behind the head: boards, a ring painted in the character's colour, an iron rim, rivets.

import { CHARACTERS, Speaker } from './story';

const GOLD = '#d9b25b', GOLD_HI = '#f6e3a1', INK = '#0b1a20', IVORY = '#efe6d2';

/** Size of the finished portrait, in pixels (shown at full resolution, no pixel grid). */
export const PORTRAIT_SIZE = 400;

interface Skin { base: string; shade: string }
const SKIN: Record<string, Skin> = {
  light: { base: '#f1c9a5', shade: '#d9a27c' },
  tan: { base: '#dca677', shade: '#b97f55' },
  warm: { base: '#c98d60', shade: '#a26b44' },
};

// --- shared pieces (a 200 x 200 canvas; the head sits around x 100, y 90) ---------------------------

/** Shoulders in a high-collared coat, with gold trim and a neon seam. */
function coat(main: string, dark: string, team: string, opts: { broad?: boolean; collar?: string; lapels?: boolean } = {}): string {
  const w = opts.broad ? 14 : 0;
  return `
  <path d="M${10 - w} 200 C${14 - w} 160 ${52 - w / 2} 146 84 140 L116 140 C${148 + w / 2} 146 ${186 + w} 160 ${190 + w} 200 Z" fill="${main}" stroke="${INK}" stroke-width="3"/>
  <path d="M${44 - w} 158 C${60 - w / 2} 150 72 147 86 146 L84 200 L${40 - w} 200 Z" fill="${dark}" opacity="0.55"/>
  <path d="M${156 + w} 158 C${140 + w / 2} 150 128 147 114 146 L116 200 L${160 + w} 200 Z" fill="${dark}" opacity="0.35"/>
  ${opts.lapels ? `<path d="M86 142 L100 176 L114 142" fill="none" stroke="url(#gold)" stroke-width="3"/>` : ''}
  <path d="M82 128 L80 150 L100 160 L120 150 L118 128" fill="${opts.collar ?? dark}" stroke="${INK}" stroke-width="3"/>
  <path d="M80 150 L100 160 L120 150" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <path d="M${30 - w} 176 C${54 - w / 2} 160 70 156 82 156" fill="none" stroke="${team}" stroke-width="2.4"/>
  <path d="M${170 + w} 176 C${146 + w / 2} 160 130 156 118 156" fill="none" stroke="${team}" stroke-width="2.4"/>
  <circle cx="${30 - w}" cy="176" r="2.6" fill="${team}"/><circle cx="${170 + w}" cy="176" r="2.6" fill="${team}"/>
  <path d="M${22 - w} 170 C${40 - w} 154 62 148 80 146" fill="none" stroke="url(#gold)" stroke-width="2.6"/>
  <path d="M${178 + w} 170 C${160 + w} 154 138 148 120 146" fill="none" stroke="url(#gold)" stroke-width="2.6"/>`;
}

/** Neck and head: jaw shape, ears and a shadow down the far side. */
function head(skin: Skin, jaw: 'soft' | 'square' | 'narrow' = 'soft'): string {
  const face = jaw === 'square'
    ? 'M70 70 C70 42 130 42 130 70 L130 96 C130 114 116 124 100 125 C84 124 70 114 70 96 Z'
    : jaw === 'narrow'
      ? 'M73 70 C73 44 127 44 127 70 L126 94 C124 112 110 124 100 125 C90 124 76 112 74 94 Z'
      : 'M72 70 C72 44 128 44 128 70 L128 94 C127 113 113 124 100 125 C87 124 73 113 72 94 Z';
  return `
  <path d="M88 112 L88 142 L112 142 L112 112 Z" fill="${skin.shade}" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="71" cy="90" rx="6" ry="9" fill="${skin.base}" stroke="${INK}" stroke-width="2.6"/>
  <ellipse cx="129" cy="90" rx="6" ry="9" fill="${skin.shade}" stroke="${INK}" stroke-width="2.6"/>
  <path d="${face}" fill="${skin.base}" stroke="${INK}" stroke-width="3"/>
  <path d="M116 60 C126 70 127 96 120 112 C114 120 108 123 104 124 C116 116 122 96 116 60 Z" fill="${skin.shade}" opacity="0.8"/>`;
}

/** Eyes (with a glint), brows at an angle, a nose and a mouth. */
function features(o: { iris: string; brow?: number; browColor?: string; mouth?: 'neutral' | 'smile' | 'smirk' | 'open' | 'firm'; glow?: boolean }): string {
  const brow = o.brow ?? 0, bc = o.browColor ?? INK;
  const eye = (x: number) => `
    <path d="M${x - 8} 88 Q${x} 81 ${x + 8} 88 Q${x} 93 ${x - 8} 88 Z" fill="#fbf7ef" stroke="${INK}" stroke-width="2"/>
    <circle cx="${x + 0.5}" cy="87.6" r="3.4" fill="${o.iris}"/>
    <circle cx="${x + 0.5}" cy="87.6" r="1.5" fill="${INK}"/>
    <circle cx="${x - 1}" cy="86.2" r="0.9" fill="#fff"/>
    ${o.glow ? `<circle cx="${x + 0.5}" cy="87.6" r="4.6" fill="none" stroke="${o.iris}" stroke-width="1" opacity="0.7"/>` : ''}`;
  const mouths: Record<string, string> = {
    neutral: '<path d="M92 109 L108 109" stroke="#7a3b2e" stroke-width="2.6" stroke-linecap="round"/>',
    smile: '<path d="M90 107 Q100 115 110 107" fill="none" stroke="#7a3b2e" stroke-width="2.6" stroke-linecap="round"/>',
    smirk: '<path d="M91 110 Q101 111 110 105" fill="none" stroke="#7a3b2e" stroke-width="2.6" stroke-linecap="round"/>',
    firm: '<path d="M90 109 L110 109" stroke="#6a3328" stroke-width="3.2" stroke-linecap="round"/>',
    open: '<path d="M89 105 Q100 103 111 105 Q108 120 100 120 Q92 120 89 105 Z" fill="#6e1f24" stroke="#4a1418" stroke-width="2"/><path d="M91 106 Q100 105 109 106 L108 109 Q100 108 92 109 Z" fill="#fbf7ef"/>',
  };
  return `
  ${eye(87)}${eye(113)}
  <path d="M78 ${78 - brow} L95 ${79 + brow}" stroke="${bc}" stroke-width="4" stroke-linecap="round"/>
  <path d="M105 ${79 + brow} L122 ${78 - brow}" stroke="${bc}" stroke-width="4" stroke-linecap="round"/>
  <path d="M101 92 L98 101 L103 102" fill="none" stroke="#8a5038" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  ${mouths[o.mouth ?? 'neutral']}`;
}

// --- the cast ---------------------------------------------------------------------------------------

/**
 * The figure framed head-and-shoulders (scaled up around the face), on a transparent ground; the
 * folded backdrop is drawn separately. The team colour rides along for the backdrop.
 */
function svg(team: string, figure: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" data-team="${team}">
    <defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GOLD_HI}"/><stop offset="1" stop-color="${GOLD}"/></linearGradient></defs>
    <g transform="translate(100 84) scale(1.32) translate(-100 -84)">${figure}</g></svg>`;
}

/** A fur mantle over the shoulders: overlapping tufts along the neckline. */
function fur(color: string, shade: string): string {
  let out = '';
  for (let k = 0; k <= 12; k++) {
    const x = 18 + k * 13.7, y = 168 - 22 * Math.sin((Math.PI * k) / 12);
    out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="13" ry="9" fill="${k % 2 ? color : shade}" stroke="${INK}" stroke-width="1.6"/>`;
  }
  return out;
}

/** A round bronze brooch pinning the cloak, its boss in the character's colour. */
function brooch(x: number, y: number, team: string): string {
  return `<circle cx="${x}" cy="${y}" r="9" fill="url(#gold)" stroke="${INK}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.6"/>
    <circle cx="${x}" cy="${y}" r="2.6" fill="${team}"/>`;
}

/** A long braid hanging from (x, y), plaited in alternating strands. */
function braid(x: number, y: number, len: number, hair: string, dark: string): string {
  let out = '';
  for (let k = 0; k < len; k += 9) out += `<ellipse cx="${x}" cy="${y + k}" rx="6" ry="6" fill="${(k / 9) % 2 ? hair : dark}" stroke="${INK}" stroke-width="1.6"/>`;
  return out + `<path d="M${x - 4} ${y + len} L${x} ${y + len + 10} L${x + 4} ${y + len}" fill="${hair}" stroke="${INK}" stroke-width="1.4"/>`;
}

const DRAW: Record<Speaker, () => string> = {
  // The player: a young rider in an iron cap with a bronze brow band and a nose guard, a red
  // riding cloak with a fur mantle, pinned with a dragon-eye brooch.
  player: () => {
    const t = CHARACTERS.player.color, skin = SKIN.light;
    return svg(t, `
      ${coat('#9c2f28', '#5a1a16', t, { collar: '#3a2a20' })}
      ${fur('#8a7258', '#6a5440')}
      ${brooch(124, 160, t)}
      ${head(skin, 'soft')}
      <path d="M66 76 C62 90 64 104 70 112 L74 92 Z M134 76 C138 90 136 104 130 112 L126 92 Z" fill="#6b4226" stroke="${INK}" stroke-width="2"/>
      ${features({ iris: '#3a5a6a', brow: 2, browColor: '#5a3a22', mouth: 'firm' })}
      <path d="M68 74 C66 46 82 30 100 30 C118 30 134 46 132 74 Z" fill="#7d858c" stroke="${INK}" stroke-width="3"/>
      <path d="M100 30 L100 72" stroke="#5a6168" stroke-width="3"/>
      <path d="M78 40 C88 34 96 33 98 34" fill="none" stroke="#c4cad0" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M66 70 C80 64 120 64 134 70 L134 78 C120 72 80 72 66 78 Z" fill="url(#gold)" stroke="${INK}" stroke-width="2.4"/>
      <path d="M97 74 L103 74 L102 100 L98 100 Z" fill="#7d858c" stroke="${INK}" stroke-width="2"/>`);
  },

  // Hilda: an old rider of the fjord. Silver braids, a patch over one eye and a scar beneath it,
  // a heavy fur mantle and a bronze torc.
  hilda: () => {
    const t = CHARACTERS.hilda.color, skin = SKIN.tan;
    return svg(t, `
      ${coat('#6a4a30', '#3a2818', t, { collar: '#2a1c12' })}
      ${fur('#b8b0a0', '#948c7c')}
      ${braid(66, 92, 60, '#d4d6da', '#a8acb4')}${braid(134, 92, 60, '#d4d6da', '#a8acb4')}
      ${head(skin, 'square')}
      <path d="M84 132 C92 138 108 138 116 132" fill="none" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>
      ${features({ iris: '#4a3a2a', brow: 1, browColor: '#c8ccd4', mouth: 'smile' })}
      <path d="M77 82 C80 78 96 78 98 82 L96 94 C90 97 82 96 78 92 Z" fill="#2a1e18" stroke="${INK}" stroke-width="2"/>
      <path d="M70 76 L132 70" stroke="#2a1e18" stroke-width="2.4"/>
      <path d="M84 98 L92 112" stroke="#9a5a44" stroke-width="2" stroke-linecap="round"/>
      <path d="M68 74 C66 48 82 34 100 34 C120 34 134 48 132 74 C126 60 116 52 100 52 C86 52 74 60 68 74 Z" fill="#d4d6da" stroke="${INK}" stroke-width="3"/>
      <path d="M100 36 L100 52 M86 40 C90 46 94 50 98 52 M114 40 C110 46 106 50 102 52" fill="none" stroke="#a8acb4" stroke-width="2"/>`);
  },

  // Brand, steward of the Raven Hall: a long auburn beard braided with gold rings, a high brow,
  // a dark green cloak and a raven brooch.
  brand: () => {
    const t = CHARACTERS.brand.color, skin = SKIN.light;
    return svg(t, `
      ${coat('#24402e', '#122018', t, { collar: '#0e1a12', lapels: true })}
      <path d="M128 156 L140 150 L148 156 L138 160 L134 170 Z" fill="#14161c" stroke="url(#gold)" stroke-width="2"/>
      ${head(skin, 'narrow')}
      ${features({ iris: '#2a3a2a', brow: 3, browColor: '#8a4a24', mouth: 'neutral' })}
      <path d="M74 100 C74 122 86 150 100 162 C114 150 126 122 126 100 C120 112 112 116 100 116 C88 116 80 112 74 100 Z" fill="#9a5226" stroke="${INK}" stroke-width="2.6"/>
      <path d="M90 108 Q100 104 110 108" fill="none" stroke="#7a3e1c" stroke-width="4" stroke-linecap="round"/>
      <path d="M95 136 L105 136 M96 146 L104 146" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>
      <path d="M72 70 C70 50 82 40 100 40 C118 40 130 50 128 70 C122 58 112 56 100 56 C88 56 78 58 72 70 Z" fill="#9a5226" stroke="${INK}" stroke-width="3"/>
      <path d="M66 74 C66 90 70 100 74 104 L76 84 Z M134 74 C134 90 130 100 126 104 L124 84 Z" fill="#9a5226" stroke="${INK}" stroke-width="2"/>`);
  },

  // Sigrun, the dragon-keeper: ash-blonde braids wound into a crown, frost-blue rune paint on one
  // cheek, bone beads, a frost-blue tunic under a leather apron strap.
  sigrun: () => {
    const t = CHARACTERS.sigrun.color, skin = SKIN.light;
    return svg(t, `
      ${coat('#4a7a88', '#22424c', t, { collar: '#e8e0cc' })}
      <path d="M60 200 L82 146 L92 148 L72 200 Z" fill="#6a4a30" stroke="${INK}" stroke-width="2"/>
      ${braid(132, 96, 54, '#e4d4a4', '#c8b47c')}
      ${head(skin, 'soft')}
      ${features({ iris: '#3a8aa0', brow: 0, browColor: '#a88a52', mouth: 'smile' })}
      <path d="M114 100 L120 96 L124 102 L118 106 Z" fill="none" stroke="${t}" stroke-width="1.8"/>
      <path d="M118 108 L124 110" stroke="${t}" stroke-width="1.8"/>
      <circle cx="71" cy="102" r="2.6" fill="#efe6d2" stroke="${INK}" stroke-width="1"/><circle cx="129" cy="102" r="2.6" fill="#efe6d2" stroke="${INK}" stroke-width="1"/>
      <path d="M70 76 C66 50 82 36 100 36 C120 36 136 50 132 76 C128 64 120 58 108 56 C100 62 86 62 76 60 C73 66 71 70 70 76 Z" fill="#e4d4a4" stroke="${INK}" stroke-width="3"/>
      <path d="M68 56 C80 40 122 38 134 54" fill="none" stroke="#c8b47c" stroke-width="9" stroke-linecap="round"/>
      <path d="M72 52 C84 40 118 38 130 50" fill="none" stroke="#e4d4a4" stroke-width="4" stroke-dasharray="6 4" stroke-linecap="round"/>`);
  },

  // Viggo of the Serpent Hall: long black hair over shaved sides, dark kohl round violet-lit eyes,
  // a short beard with a gold ring, a violet cloak and a coiled serpent brooch.
  viggo: () => {
    const t = CHARACTERS.viggo.color, skin = SKIN.tan;
    return svg(t, `
      ${coat('#2a2040', '#140e22', t, { collar: '#3e2e62' })}
      ${fur('#2a2a30', '#1a1a20')}
      <path d="M118 150 C134 144 140 160 128 164 C118 168 120 178 132 176" fill="none" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="133" cy="176" r="2.4" fill="${t}"/>
      ${head(skin, 'narrow')}
      ${features({ iris: t, brow: 5, mouth: 'smirk', glow: true })}
      <path d="M78 90 L96 90 M104 90 L122 90" stroke="#1a1420" stroke-width="2.4" opacity="0.8"/>
      <path d="M76 104 C78 120 90 128 100 128 C110 128 122 120 124 104 C118 114 110 118 100 118 C90 118 82 114 76 104 Z" fill="#141218" stroke="${INK}" stroke-width="2"/>
      <circle cx="100" cy="130" r="4" fill="none" stroke="url(#gold)" stroke-width="2.4"/>
      <path d="M72 70 C72 52 80 44 86 42 L86 64 C80 66 76 68 72 70 Z M128 70 C128 52 120 44 114 42 L114 64 C120 66 124 68 128 70 Z" fill="#3a3442" opacity="0.7"/>
      <path d="M86 64 C84 40 92 26 100 26 C112 26 118 40 114 64 C110 54 104 50 100 50 C94 50 90 54 86 64 Z" fill="#121018" stroke="${INK}" stroke-width="3"/>
      <path d="M100 28 C126 34 142 60 140 120 C136 100 128 80 116 66 Z" fill="#121018" stroke="${INK}" stroke-width="2.6"/>
      <path d="M94 32 L98 48 M106 32 L104 48" stroke="#3a3048" stroke-width="2" stroke-linecap="round"/>`);
  },

  // Aske, Viggo's shield-brother: a broad build, a shaven head with storm-blue knotwork, a russet
  // beard, mail on his shoulders.
  aske: () => {
    const t = CHARACTERS.aske.color, skin = SKIN.warm;
    let mail = '';
    for (let y = 150; y < 200; y += 7) for (let x = 8 + ((y / 7) % 2) * 3.5; x < 192; x += 7) {
      if (x > 62 && x < 138 && y < 172) continue;
      mail += `<circle cx="${x}" cy="${y}" r="2.6" fill="none" stroke="#9aa2aa" stroke-width="1.2"/>`;
    }
    return svg(t, `
      ${coat('#2c3442', '#161c26', t, { broad: true, collar: '#1d3a6a' })}
      ${mail}
      <path d="M86 112 L84 142 L116 142 L114 112 Z" fill="${skin.shade}" stroke="${INK}" stroke-width="3"/>
      ${head(skin, 'square')}
      ${features({ iris: '#2a1d14', brow: 2, browColor: '#7a3a1c', mouth: 'firm' })}
      <path d="M72 100 C74 122 88 134 100 134 C112 134 126 122 128 100 C122 114 112 118 100 118 C88 118 78 114 72 100 Z" fill="#8a4422" stroke="${INK}" stroke-width="2.4"/>
      <path d="M70 72 C70 46 84 36 100 36 C118 36 130 46 130 72" fill="${skin.base}" stroke="${INK}" stroke-width="3"/>
      <path d="M82 50 C90 42 110 42 118 50 M88 58 C94 52 106 52 112 58 M100 40 L100 60" fill="none" stroke="${t}" stroke-width="2.4" stroke-linecap="round"/>`);
  },

  // The skald: a grey-brown beard, a wool hood, mid-song, the neck of his lyre at his shoulder.
  skald: () => {
    const t = CHARACTERS.skald.color, skin = SKIN.light;
    return svg(t, `
      ${coat('#5a4a36', '#2e2418', '#c8d2c0', { collar: '#3a2e20' })}
      <path d="M150 200 L146 112 L162 108 L166 200 Z" fill="#8a5a2e" stroke="${INK}" stroke-width="2.4"/>
      <path d="M146 112 L162 108 L166 92 L150 96 Z" fill="#6a4220" stroke="${INK}" stroke-width="2"/>
      <path d="M150 116 L152 196 M155 114 L157 196 M160 112 L162 196" stroke="url(#gold)" stroke-width="1" opacity="0.9"/>
      ${head(skin, 'soft')}
      ${features({ iris: '#3a2a1a', brow: -3, browColor: '#6a5a44', mouth: 'open' })}
      <path d="M72 100 C74 128 88 146 100 150 C112 146 126 128 128 100 C124 116 114 122 110 120 L100 124 L90 120 C86 122 76 116 72 100 Z" fill="#8a7a62" stroke="${INK}" stroke-width="2.4"/>
      <path d="M62 96 C56 60 74 30 100 30 C126 30 144 60 138 96 C134 76 126 62 112 56 L100 54 L88 56 C74 62 66 76 62 96 Z" fill="#6a5a40" stroke="${INK}" stroke-width="3"/>
      <path d="M72 60 C84 44 116 44 128 60" fill="none" stroke="#8a7a5a" stroke-width="2.4"/>`);
  },
};

// --- folding into paper -----------------------------------------------------------------------------

type Pt = [number, number];

/** Delaunay triangulation (Bowyer-Watson): fine for the few hundred points of a portrait. */
function triangulate(pts: Pt[]): [number, number, number][] {
  const big = 1e5;
  const all: Pt[] = [...pts, [-big, -big], [big, -big], [0, big]];
  const n = pts.length;
  type Tri = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const circ = (a: number, b: number, c: number): Tri => {
    const [ax, ay] = all[a], [bx, by] = all[b], [cx, cy] = all[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-9;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris: Tri[] = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = all[i];
    const bad: Tri[] = [], keep: Tri[] = [];
    for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2 ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
      }
    }
    for (const [u, v] of edges.values()) keep.push(circ(u, v, i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

/** A seeded random, so each portrait folds the same way every time. */
function rng(seed: number): () => number {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

const LIGHT: [number, number, number] = (() => { const v = [-0.45, -0.6, 0.66]; const l = Math.hypot(...v); return v.map((x) => x / l) as [number, number, number]; })();

/** Fill and crease one flat paper plane: its colour, toned by how its fold faces the light. */
function plane(g: CanvasRenderingContext2D, a: Pt, b: Pt, c: Pt, rgb: [number, number, number], ha: number, hb: number, hc: number): void {
  // Treat brightness as height: the plane's tilt gives it a normal, and the light tones it.
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = hb - ha, vx = c[0] - a[0], vy = c[1] - a[1], vz = hc - ha;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const nl = Math.hypot(nx, ny, nz) || 1;
  const lit = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl;
  const k = 0.86 + lit * 0.2;
  const col = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath();
  g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
  g.strokeStyle = g.fillStyle;
  g.lineWidth = 0.8;
  g.fill();
  g.stroke();   // closes hairline seams between planes
}

/** Crisp crease lines: a pale highlight along each fold, faint enough to read as paper, not wire. */
function creases(g: CanvasRenderingContext2D, pts: Pt[], tris: [number, number, number][]): void {
  g.save();
  g.lineWidth = 0.9;
  g.strokeStyle = 'rgba(255,250,235,0.09)';
  g.beginPath();
  for (const [i, j, k] of tris) {
    g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.lineTo(pts[k][0], pts[k][1]); g.closePath();
  }
  g.stroke();
  g.restore();
}

/** The backdrop folded from paper: a sunburst of alternating teal planes under a faceted gold arch. */
function paperBackdrop(g: CanvasRenderingContext2D, S: number, team: string): void {
  const u = S / 200;
  /** A strip of timber folded down its middle: a lit half and a shaded half, with a dark seam. */
  const plank = (x0: number, x1: number, y0: number, y1: number, rgb: number[], clip?: () => void) => {
    const xm = (x0 + x1) / 2;
    g.save();
    if (clip) clip();
    for (const [a, b2, t] of [[x0, xm, 1.06], [xm, x1, 0.84]] as const) {
      g.fillStyle = `rgb(${rgb.map((v) => Math.round(v * t)).join(',')})`;
      g.fillRect(a * u, y0 * u, (b2 - a) * u + 0.5, (y1 - y0) * u);
    }
    // A knot or two and the grain lines, faint.
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.6 * u;
    for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo((x0 + (x1 - x0) * k / 3) * u, y0 * u); g.lineTo((x0 + (x1 - x0) * k / 3 + 1.5) * u, y1 * u); g.stroke(); }
    g.fillStyle = 'rgba(10,6,4,0.85)'; g.fillRect(x1 * u - 0.8 * u, y0 * u, 1.6 * u, (y1 - y0) * u);
    g.restore();
  };
  const rivet = (x: number, y: number, r = 2.6) => {
    g.fillStyle = '#5a3a1c'; g.beginPath(); g.arc(x * u, y * u, r * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c98b3e'; g.beginPath(); g.arc((x - 0.5) * u, (y - 0.5) * u, r * 0.72 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,230,180,0.6)'; g.beginPath(); g.arc((x - 0.9) * u, (y - 0.9) * u, r * 0.28 * u, 0, Math.PI * 2); g.fill();
  };
  // The wall: dark timber planks, each its own shade of old wood.
  const woods = [[58, 40, 28], [66, 46, 32], [52, 36, 25], [62, 44, 30], [55, 39, 27]];
  for (let k = 0, x = -4; x < 204; k++, x += 26) plank(x, x + 26, 0, 200, woods[k % woods.length]);
  // Iron straps across the wall, riveted.
  for (const y of [14, 186]) {
    g.fillStyle = '#2a2c30'; g.fillRect(0, (y - 5) * u, S, 10 * u);
    g.fillStyle = '#44484e'; g.fillRect(0, (y - 5) * u, S, 4 * u);
    for (let x = 13; x < 200; x += 26) rivet(x, y, 2);
  }
  // Darken toward the corners, like a hall lit by one fire.
  const v = g.createRadialGradient(100 * u, 86 * u, S * 0.18, 100 * u, 92 * u, S * 0.78);
  v.addColorStop(0, 'rgba(8,4,2,0)'); v.addColorStop(1, 'rgba(8,4,2,0.66)');
  g.fillStyle = v; g.fillRect(0, 0, S, S);
  // The round shield behind the head: lime-wood boards, a thin painted ring in the character's
  // colour, an iron rim folded into facets, and bronze rivets all round.
  const cx = 100, cy = 86, R = 80;
  const disc = () => { g.beginPath(); g.arc(cx * u, cy * u, (R - 6) * u, 0, Math.PI * 2); g.clip(); };
  const boards = [[150, 118, 82], [138, 108, 74], [160, 128, 90], [144, 112, 78]];
  for (let k = 0, x = cx - R; x < cx + R; k++, x += 20) plank(x, x + 20, cy - R, cy + R, boards[k % boards.length], disc);
  g.save();
  g.strokeStyle = team; g.globalAlpha = 0.9; g.lineWidth = 5 * u;
  g.beginPath(); g.arc(cx * u, cy * u, (R - 14) * u, 0, Math.PI * 2); g.stroke();
  g.restore();
  const facets = 24;
  for (let i = 0; i < facets; i++) {
    const a0 = (i / facets) * Math.PI * 2, a1 = ((i + 1) / facets) * Math.PI * 2;
    const light = Math.cos((a0 + a1) / 2 + 2.2);
    g.beginPath();
    g.arc(cx * u, cy * u, R * u, a0, a1);
    g.arc(cx * u, cy * u, (R - 7) * u, a1, a0, true);
    g.closePath();
    const t = 0.75 + light * 0.25;
    g.fillStyle = `rgb(${[70, 74, 80].map((c) => Math.round(c * t)).join(',')})`;
    g.fill();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rivet(cx + Math.cos(a) * (R - 3.5), cy + Math.sin(a) * (R - 3.5), 2.2);
  }
}

/** Matte paper: a fine grain over everything. */
function grain(g: CanvasRenderingContext2D, S: number, seed: number): void {
  const r = rng(seed ^ 0x9e37);
  for (let i = 0; i < S * S / 40; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,248,230,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(r() * S, r() * S, 1, 1);
  }
}

/** Fold a drawn figure (on a transparent canvas) into paper planes, drawn onto g. */
function foldFigure(g: CanvasRenderingContext2D, src: HTMLCanvasElement, seed: number): void {
  const S = src.width;
  const data = src.getContext('2d')!.getImageData(0, 0, S, S).data;
  const at = (x: number, y: number) => {
    const i = (Math.max(0, Math.min(S - 1, Math.round(y))) * S + Math.max(0, Math.min(S - 1, Math.round(x)))) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const lum = (x: number, y: number) => { const [r, gg, b, al] = at(x, y); return al < 128 ? -1 : (r * 0.3 + gg * 0.59 + b * 0.11) / 255; };
  // Where the drawing changes sharply (eyes, mouth, edges of hair and coat): more, smaller planes.
  const r = rng(seed);
  const pts: Pt[] = [];
  const near = (x: number, y: number, d: number) => pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < d * d);
  const cand: [number, number, number][] = [];
  for (let y = 2; y < S - 2; y += 2) {
    for (let x = 2; x < S - 2; x += 2) {
      const [, , , al] = at(x, y);
      const l = lum(x, y);
      const gx = lum(x + 2, y) - lum(x - 2, y), gy = lum(x, y + 2) - lum(x, y - 2);
      const edgeA = Math.abs(at(x + 2, y)[3] - at(x - 2, y)[3]) + Math.abs(at(x, y + 2)[3] - at(x, y - 2)[3]);
      const m = (al > 0 || edgeA > 0) ? Math.hypot(gx, gy) * (l < 0 ? 0 : 1) + edgeA / 255 : 0;
      if (m > 0.22) cand.push([x, y, m]);
    }
  }
  cand.sort((a, b) => b[2] - a[2]);
  const minEdge = S / 46;
  for (const [x, y] of cand) if (!near(x, y, minEdge)) pts.push([x + (r() - 0.5), y + (r() - 0.5)]);
  // A looser jittered grid fills the flat areas with broad planes.
  const step = S / 11;
  for (let y = 0; y <= S; y += step) {
    for (let x = 0; x <= S; x += step) {
      const px = Math.max(0, Math.min(S, x + (r() - 0.5) * step * 0.6)), py = Math.max(0, Math.min(S, y + (r() - 0.5) * step * 0.6));
      if (!near(px, py, minEdge * 1.6)) pts.push([px, py]);
    }
  }
  for (const c of [[0, 0], [S, 0], [0, S], [S, S]] as Pt[]) pts.push(c);
  const tris = triangulate(pts).filter(([i, j, k]) => {
    const cx = (pts[i][0] + pts[j][0] + pts[k][0]) / 3, cy = (pts[i][1] + pts[j][1] + pts[k][1]) / 3;
    return at(cx, cy)[3] > 140;
  });
  const height = (p: Pt) => { const l = lum(p[0], p[1]); return (l < 0 ? 0.3 : l) * S * 0.09; };
  for (const [i, j, k] of tris) {
    const a = pts[i], b = pts[j], c = pts[k];
    // The plane's colour: the drawing sampled at its centre and toward each corner.
    const sum = [0, 0, 0]; let n = 0;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    for (const [x, y] of [[cx, cy], [(cx * 2 + a[0]) / 3, (cy * 2 + a[1]) / 3], [(cx * 2 + b[0]) / 3, (cy * 2 + b[1]) / 3], [(cx * 2 + c[0]) / 3, (cy * 2 + c[1]) / 3]]) {
      const px = at(x, y);
      if (px[3] < 100) continue;
      sum[0] += px[0]; sum[1] += px[1]; sum[2] += px[2]; n++;
    }
    if (!n) continue;
    plane(g, a, b, c, [sum[0] / n, sum[1] / n, sum[2] / n], height(a), height(b), height(c));
  }
  creases(g, pts, tris);
}

const cache = new Map<Speaker, string>();
const pending = new Map<Speaker, Promise<string>>();

/** The portrait folded into paper, as a PNG data URL (PORTRAIT_SIZE square). */
export function portraitUrl(who: Speaker): Promise<string> {
  const done = cache.get(who);
  if (done) return Promise.resolve(done);
  let p = pending.get(who);
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const S = PORTRAIT_SIZE;
        const fig = document.createElement('canvas');
        fig.width = fig.height = S;
        const fg = fig.getContext('2d', { willReadFrequently: true })!;
        fg.drawImage(img, 0, 0, S, S);
        const out = document.createElement('canvas');
        out.width = out.height = S;
        const g = out.getContext('2d')!;
        const seed = [...who].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) >>> 0;
        paperBackdrop(g, S, CHARACTERS[who].color);
        foldFigure(g, fig, seed);
        grain(g, S, seed);
        const url = out.toDataURL('image/png');
        cache.set(who, url);
        resolve(url);
      };
      img.onerror = reject;
      // Paper has no ink outlines: the thin dark strokes go, so planes meet edge to edge (brows and features stay).
      const art = DRAW[who]().replace(/stroke="#0b1a20" stroke-width="(?:1\.2|1\.5|1\.6|2|2\.4|2\.6|3)"/g, 'stroke="none"');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(art);
    });
    pending.set(who, p);
  }
  return p;
}

/** A plain teal paper placeholder while a portrait is being folded (only ever shown for a moment). */
const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2" fill="#0c3540"/></svg>');

/** Synchronous version for markup: the folded portrait if it's ready, else a placeholder. */
export function portraitSrc(who: Speaker): string {
  if (!cache.has(who)) void portraitUrl(who).catch(() => {});
  return cache.get(who) ?? PLACEHOLDER;
}

/** Fold every portrait ahead of time so dialogue never waits on one. */
export function preloadPortraits(): void {
  for (const who of Object.keys(DRAW) as Speaker[]) void portraitUrl(who).catch(() => {});
}
