// Story character portraits, drawn in code and then folded into paper: each figure is a vector
// bust (in the game's palette: deep sea teal, ivory and gold, neon in the character's team colour)
// which is cut into flat triangular planes like folded. Every plane takes the colour of the drawing
// under it and a tone from the angle of its fold, with crisp creases between planes and a matte
// paper grain. The backdrop is a folded paper sunburst under a faceted gold arch.

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

const DRAW: Record<Speaker, () => string> = {
  // The player: a crested racing helmet (an Atlantean helm crest in gold) with a dark visor.
  player: () => {
    const t = CHARACTERS.player.color;
    return svg(t, `
      ${coat('#c8243f', '#7a1528', t, { collar: IVORY })}
      <path d="M100 148 L94 158 L100 170 L106 158 Z" fill="url(#gold)" stroke="${INK}" stroke-width="2"/>
      <path d="M64 92 C62 52 82 34 102 34 C126 34 140 54 138 92 C137 112 126 128 108 132 L84 132 C72 126 65 110 64 92 Z" fill="#d42c49" stroke="${INK}" stroke-width="3"/>
      <path d="M78 46 C92 38 116 38 128 50 L126 58 C114 48 92 46 80 54 Z" fill="${IVORY}" opacity="0.9"/>
      <path d="M100 18 C114 24 122 34 124 44 L102 40 Z" fill="url(#gold)" stroke="${INK}" stroke-width="2.4"/>
      <path d="M100 18 C90 26 86 34 86 42 L102 40 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
      <path d="M70 80 C72 70 132 68 136 80 L134 100 C120 106 82 106 70 100 Z" fill="#0d2a33" stroke="url(#gold)" stroke-width="3.2"/>
      <path d="M80 84 L118 78" stroke="${t}" stroke-width="3" opacity="0.9" stroke-linecap="round"/>
      <path d="M86 92 L104 89" stroke="#6fd8ff" stroke-width="2" opacity="0.6" stroke-linecap="round"/>
      <path d="M88 116 L112 116 M90 122 L110 122" stroke="#7a1528" stroke-width="2.6" stroke-linecap="round"/>`);
  },

  // Charlie: silver hair and a trimmed beard; an ember-orange coat with a gold trident brooch.
  charlie: () => {
    const t = CHARACTERS.charlie.color, skin = SKIN.tan;
    return svg(t, `
      ${coat('#e2741c', '#3a2416', t, { collar: '#2a1c14', lapels: true })}
      <path d="M128 162 L128 180 M122 166 L122 160 M134 166 L134 160 M122 166 L134 166" stroke="url(#gold)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      ${head(skin, 'square')}
      <path d="M72 96 C74 116 88 128 100 128 C112 128 126 116 128 96 C124 108 116 114 100 114 C84 114 76 108 72 96 Z" fill="#b9bcc4" stroke="${INK}" stroke-width="2.4"/>
      <path d="M90 108 Q100 104 110 108" fill="none" stroke="#9a9ea8" stroke-width="4" stroke-linecap="round"/>
      ${features({ iris: '#3b2a1e', brow: 1, browColor: '#c8ccd4', mouth: 'smile' })}
      <path d="M68 74 C66 50 80 36 100 36 C122 36 134 50 132 74 C128 62 120 54 110 52 C104 60 88 62 76 60 C72 64 70 68 68 74 Z" fill="#c9ccd4" stroke="${INK}" stroke-width="3"/>
      <path d="M80 48 C90 42 104 42 114 46" fill="none" stroke="#eef0f4" stroke-width="2.4" stroke-linecap="round"/>`);
  },

  // Mr. Lupis: slicked hair, gold-rimmed shades, a black court coat with gold epaulettes and pin.
  lupis: () => {
    const t = CHARACTERS.lupis.color, skin = SKIN.light;
    return svg(t, `
      ${coat('#15181f', '#05070a', t, { collar: IVORY, lapels: true })}
      <path d="M26 160 L58 150 L60 158 L28 170 Z M174 160 L142 150 L140 158 L172 170 Z" fill="url(#gold)" stroke="${INK}" stroke-width="2"/>
      <circle cx="132" cy="172" r="5" fill="url(#gold)" stroke="${INK}" stroke-width="2"/><circle cx="132" cy="172" r="2" fill="${t}"/>
      ${head(skin, 'narrow')}
      ${features({ iris: '#22313a', brow: 3, mouth: 'neutral' })}
      <path d="M76 82 L98 82 L96 94 L80 94 Z M102 82 L124 82 L120 94 L104 94 Z" fill="#0c2027" stroke="url(#gold)" stroke-width="2.6"/>
      <path d="M98 85 L102 85" stroke="url(#gold)" stroke-width="2.6"/>
      <path d="M80 86 L90 85 M106 86 L116 85" stroke="${t}" stroke-width="1.6" opacity="0.8"/>
      <path d="M70 72 C68 46 84 34 102 34 C122 34 134 48 131 72 C126 58 116 52 104 50 L100 56 C92 52 82 54 74 62 C72 66 71 69 70 72 Z" fill="#14161c" stroke="${INK}" stroke-width="3"/>
      <path d="M84 44 C94 38 112 38 122 46" fill="none" stroke="#3a4250" stroke-width="2.4" stroke-linecap="round"/>`);
  },

  // Sophi: a blonde ponytail, brass goggles with cyan lenses on her brow, a glowing circuit on her cheek.
  sophi: () => {
    const t = CHARACTERS.sophi.color, skin = SKIN.light;
    return svg(t, `
      <path d="M62 64 C44 70 38 96 46 118 C50 128 60 132 66 126 C58 112 60 88 70 74 Z" fill="#e8b93c" stroke="${INK}" stroke-width="3"/>
      ${coat('#1f8a94', '#0f4a52', t, { collar: IVORY })}
      <path d="M52 178 L60 170 L66 176 L58 184 Z" fill="url(#gold)" stroke="${INK}" stroke-width="2"/>
      ${head(skin, 'soft')}
      ${features({ iris: '#1aa6b3', brow: 0, browColor: '#a8742a', mouth: 'smile', glow: true })}
      <path d="M116 100 L122 100 L124 96 M120 104 L126 104" stroke="${t}" stroke-width="1.8" fill="none" opacity="0.95"/>
      <path d="M70 76 C66 48 82 34 102 34 C124 34 136 50 132 76 C128 66 122 60 112 58 C106 66 92 70 78 66 C74 70 72 72 70 76 Z" fill="#f0c447" stroke="${INK}" stroke-width="3"/>
      <path d="M84 44 C96 38 110 38 120 44" fill="none" stroke="#fff0b0" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M68 62 L134 56" stroke="#2a2420" stroke-width="7" stroke-linecap="round"/>
      <circle cx="88" cy="58" r="10" fill="#5ad8e6" stroke="url(#gold)" stroke-width="4"/>
      <circle cx="114" cy="56" r="10" fill="#5ad8e6" stroke="url(#gold)" stroke-width="4"/>
      <path d="M84 54 L90 52 M110 52 L116 50" stroke="#ffffff" stroke-width="2" opacity="0.8" stroke-linecap="round"/>`);
  },

  // Judah: swept-back black hair under a gold laurel circlet, a champion's smirk, violet-lit eyes.
  judah: () => {
    const t = CHARACTERS.judah.color, skin = SKIN.tan;
    let leaves = '';
    for (let k = 0; k < 5; k++) {
      for (const side of [-1, 1]) {
        const x = 100 + side * (12 + k * 6.5), y = 52 + k * 1.8;
        leaves += `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.4" transform="rotate(${side * (20 + k * 6)} ${x} ${y})" fill="url(#gold)" stroke="${INK}" stroke-width="1.2"/>`;
      }
    }
    return svg(t, `
      ${coat('#1a1428', '#0a0712', t, { collar: '#5b3a9c' })}
      <path d="M60 200 L70 160 L84 150 M140 200 L130 160 L116 150" fill="none" stroke="${t}" stroke-width="3"/>
      ${head(skin, 'narrow')}
      ${features({ iris: t, brow: 5, mouth: 'smirk', glow: true })}
      <path d="M68 76 C60 56 70 30 96 28 C112 26 120 22 132 24 C126 30 138 36 134 52 L136 72 C130 60 122 52 112 50 C100 52 86 50 78 60 C74 64 70 70 68 76 Z" fill="#121018" stroke="${INK}" stroke-width="3"/>
      <path d="M74 50 C86 36 108 34 126 40 M80 42 L60 46 M128 30 L144 26" fill="none" stroke="#3a3048" stroke-width="2.4" stroke-linecap="round"/>
      ${leaves}
      <circle cx="100" cy="51" r="3" fill="${t}" stroke="url(#gold)" stroke-width="1.5"/>`);
  },

  // Rook: a close crop, a broad build and a square jaw; armoured shoulders in Vanta blue.
  rook: () => {
    const t = CHARACTERS.rook.color, skin = SKIN.warm;
    return svg(t, `
      ${coat('#141a2c', '#080b14', t, { broad: true, collar: '#1d3f8a' })}
      <path d="M8 166 C14 146 40 138 62 142 L66 156 C44 154 24 160 12 176 Z M192 166 C186 146 160 138 138 142 L134 156 C156 154 176 160 188 176 Z" fill="#26407e" stroke="url(#gold)" stroke-width="2.6"/>
      <path d="M86 112 L84 142 L116 142 L114 112 Z" fill="${skin.shade}" stroke="${INK}" stroke-width="3"/>
      ${head(skin, 'square')}
      ${features({ iris: '#2a1d14', brow: 2, mouth: 'firm' })}
      <path d="M70 68 C70 44 84 36 100 36 C118 36 130 44 130 68 C126 58 118 52 100 52 C84 52 74 58 70 68 Z" fill="#4a3424" stroke="${INK}" stroke-width="3"/>
      <path d="M70 68 L70 80 M130 68 L130 80" stroke="#4a3424" stroke-width="5"/>
      <path d="M76 70 L124 70" stroke="${t}" stroke-width="2" opacity="0.7"/>`);
  },

  // The announcer: a gold-rimmed headset with a neon mic, mid-call, in a navy blazer.
  announcer: () => {
    const t = CHARACTERS.announcer.color, skin = SKIN.light;
    return svg(t, `
      ${coat('#1c2c5c', '#0d1630', '#7fd6ff', { collar: IVORY, lapels: true })}
      <path d="M96 150 L100 176 L104 150 Z" fill="url(#gold)" stroke="${INK}" stroke-width="1.6"/>
      ${head(skin, 'soft')}
      ${features({ iris: '#3a2416', brow: -3, browColor: '#6b3f1e', mouth: 'open' })}
      <path d="M68 78 C62 58 66 42 76 36 L74 24 L88 32 L92 16 L102 30 L112 14 L116 30 L130 22 L128 38 C136 46 136 62 131 78 C127 64 118 56 106 54 L100 46 L94 56 C84 56 74 64 68 78 Z" fill="#7a4a24" stroke="${INK}" stroke-width="3"/>
      <path d="M66 86 C62 54 80 32 100 32 C122 32 140 52 136 86" fill="none" stroke="#1d2533" stroke-width="5"/>
      <rect x="58" y="78" width="14" height="22" rx="6" fill="#1d2533" stroke="url(#gold)" stroke-width="2.6"/>
      <path d="M64 98 C66 114 76 120 88 118" fill="none" stroke="#1d2533" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="90" cy="118" r="4" fill="#7fd6ff" stroke="${INK}" stroke-width="1.6"/>`);
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
  const u = S / 200, cx = 100 * u, cy = 92 * u, R = 210 * u, rays = 24;
  for (let k = 0; k < rays; k++) {
    const a0 = (k / rays) * Math.PI * 2, a1 = ((k + 1) / rays) * Math.PI * 2, am = (a0 + a1) / 2;
    // Each ray is a valley fold: two planes meeting along its centre line, one catching the light.
    const p0: Pt = [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], p1: Pt = [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R];
    const pm: Pt = [cx + Math.cos(am) * R * 0.98, cy + Math.sin(am) * R * 0.98];
    const facing = Math.cos(am - (-2.2));
    const base = k % 2 ? [16, 70, 78] : [12, 54, 62];
    for (const [q, lift] of [[p0, 0.1], [p1, -0.1]] as [Pt, number][]) {
      const t = 0.82 + (facing + lift) * 0.14;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(q[0], q[1]); g.lineTo(pm[0], pm[1]); g.closePath();
      g.fillStyle = `rgb(${base.map((v) => Math.round(v * t)).join(',')})`;
      g.strokeStyle = g.fillStyle; g.lineWidth = 0.8;
      g.fill(); g.stroke();
    }
  }
  // Darken toward the corners, like paper in shadow.
  const v = g.createRadialGradient(cx, cy * 0.9, S * 0.15, cx, cy, S * 0.75);
  v.addColorStop(0, 'rgba(4,16,22,0)'); v.addColorStop(1, 'rgba(4,16,22,0.62)');
  g.fillStyle = v; g.fillRect(0, 0, S, S);
  // The arch: a gold paper band folded into facets, an inner neon line in the team colour.
  const band = (r0: number, r1: number, segs: number, colA: string, colB: string) => {
    const ax = 100 * u, ay = 86 * u;
    const pts: [Pt, Pt][] = [];
    pts.push([[ax - r1 * u, 200 * u], [ax - r0 * u, 200 * u]]);
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI + (i / segs) * Math.PI;
      pts.push([[ax + Math.cos(a) * r1 * u, ay + Math.sin(a) * r1 * u], [ax + Math.cos(a) * r0 * u, ay + Math.sin(a) * r0 * u]]);
    }
    pts.push([[ax + r1 * u, 200 * u], [ax + r0 * u, 200 * u]]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [o0, i0] = pts[i], [o1, i1] = pts[i + 1];
      // Outer half and inner half of the band: a ridge fold along its middle.
      const m0: Pt = [(o0[0] + i0[0]) / 2, (o0[1] + i0[1]) / 2], m1: Pt = [(o1[0] + i1[0]) / 2, (o1[1] + i1[1]) / 2];
      for (const [q, col] of [[[o0, o1, m1, m0], i % 2 ? colA : colB], [[m0, m1, i1, i0], i % 2 ? colB : colA]] as [Pt[], string][]) {
        g.beginPath(); q.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.8; g.fill(); g.stroke();
      }
    }
  };
  band(68, 78, 14, '#f3dc96', '#c99e45');
  g.save();
  g.strokeStyle = team; g.lineWidth = 2.2 * u; g.shadowColor = team; g.shadowBlur = 8 * u;
  g.beginPath(); g.moveTo(36 * u, 200 * u); g.lineTo(36 * u, 88 * u); g.arc(100 * u, 88 * u, 64 * u, Math.PI, 0); g.lineTo(164 * u, 200 * u); g.stroke();
  g.restore();
  // The keystone: a folded gold diamond with the team colour at its heart.
  const kx = 100 * u, ky = 16 * u, kr = 11 * u;
  const facets: [Pt, Pt, string][] = [
    [[kx, ky - kr], [kx - kr, ky], '#f6e3a1'], [[kx, ky - kr], [kx + kr, ky], '#d9b25b'],
    [[kx, ky + kr], [kx - kr, ky], '#c99e45'], [[kx, ky + kr], [kx + kr, ky], '#a8802e'],
  ];
  for (const [a, b, col] of facets) { g.beginPath(); g.moveTo(kx, ky); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath(); g.fillStyle = col; g.fill(); }
  g.fillStyle = team; g.beginPath(); g.arc(kx, ky, 3.6 * u, 0, Math.PI * 2); g.fill();
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
