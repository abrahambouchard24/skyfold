// Dragons: each racer is a dragon folded from paper. Flat triangular planes, each a slightly
// different tone where the light catches its fold, matte paper (no gloss), no textures.
//
// Six species with their own build (body, neck, tail, wings, horns, fins), all animated in code:
// the wings beat while the dragon is pulling (faster as it works harder), then lock out and glide,
// banked, through turns and when it eases off; the neck looks into the turn, the tail trails it,
// and the whole body rises a little on each downstroke. Calling the gale (the boost) tucks the
// wings back into a streamlined dive inside a sheath of rushing wind.
//
// Model space (world px): nose along +x, y up, z to the dragon's right. A DragonRig is a drop-in
// replacement for the old craft rig: root, update(car, time, dt).

import * as THREE from 'three';
import { clamp, wrapAngle } from './craft';
import type { Car } from './render';
import { liveryPainter, type Face, type Kind, type Painter } from './liveries';

type V3 = [number, number, number];

// --- species ----------------------------------------------------------------------------------------

export interface Species {
  name: string;
  /** Torso length and girth, neck and tail length (segments), wing span and chord. */
  body: number; girth: number; neck: number; neckSegs: number; tail: number; tailSegs: number;
  span: number; chord: number;
  /** 'bat' membrane between finger spars, or 'feather' stepped feather planes. */
  wing: 'bat' | 'feather';
  /** Number of fingers (bat) or feathers (feather) along the hand. */
  fingers: number;
  horns: 'swept' | 'ram' | 'spikes' | 'antler';
  tailFin: 'spade' | 'fan' | 'flame' | 'none';
  /** A paper crest along the spine. */
  crest: boolean;
  /** Beat rate scale (big wings beat slower). */
  beat: number;
}

/** One species per racer livery (01-06), in livery order. */
export const SPECIES: Species[] = [
  { name: 'LINDWORM', body: 34, girth: 9, neck: 22, neckSegs: 3, tail: 40, tailSegs: 5, span: 64, chord: 30, wing: 'bat', fingers: 3, horns: 'swept', tailFin: 'spade', crest: false, beat: 1 },
  { name: 'SKY SERPENT', body: 40, girth: 6.5, neck: 26, neckSegs: 4, tail: 62, tailSegs: 7, span: 46, chord: 22, wing: 'feather', fingers: 5, horns: 'antler', tailFin: 'fan', crest: true, beat: 1.25 },
  { name: 'STONE DRAKE', body: 30, girth: 12, neck: 16, neckSegs: 2, tail: 32, tailSegs: 4, span: 56, chord: 34, wing: 'bat', fingers: 3, horns: 'ram', tailFin: 'none', crest: true, beat: 0.9 },
  { name: 'EMBERWING', body: 32, girth: 8, neck: 20, neckSegs: 3, tail: 44, tailSegs: 5, span: 68, chord: 26, wing: 'feather', fingers: 6, horns: 'spikes', tailFin: 'flame', crest: false, beat: 1.1 },
  { name: 'NIGHT WRAITH', body: 36, girth: 7.5, neck: 30, neckSegs: 4, tail: 50, tailSegs: 6, span: 72, chord: 28, wing: 'bat', fingers: 4, horns: 'swept', tailFin: 'spade', crest: true, beat: 0.95 },
  { name: 'STORMCALLER', body: 36, girth: 9.5, neck: 24, neckSegs: 3, tail: 46, tailSegs: 5, span: 80, chord: 32, wing: 'feather', fingers: 5, horns: 'antler', tailFin: 'fan', crest: true, beat: 0.8 },
];

/** The species for a racer: by its number (01-06), else by name. */
export function speciesFor(car: { name: string }): Species {
  const n = parseInt(car.name, 10);
  return SPECIES[(Number.isFinite(n) && n > 0 ? n - 1 : 0) % SPECIES.length];
}

// --- paper geometry ----------------------------------------------------------------------------------

let toneSeed = 1;
const tone = () => { toneSeed = (toneSeed * 1664525 + 1013904223) >>> 0; return 0.9 + (toneSeed / 4294967296) * 0.18; };

/** Triangles as one flat-shaded paper mesh; every triangle gets its own slight tone. */
/**
 * A skin's pattern, printed on the dragon while its rig is being built: each facet of the hide,
 * belly and wings takes the pattern's colour at its centre (horns, claws and eyes keep theirs).
 * `kinds` says which of the rig's colours are paintwork, and as what.
 */
let printing: { painter: Painter; kinds: Map<THREE.Color, Kind>; wings: boolean } | null = null;

class Paper {
  pos: number[] = [];
  col: number[] = [];
  tri(a: V3, b: V3, c: V3, color: THREE.Color, k = tone(), depth = 0): void {
    const kind = printing?.kinds.get(color);
    if (printing && kind && depth < 2) {
      // Patterned paintwork: fold the facet into four (twice, so sixteen) so the print has the
      // resolution to show veins, cracks and bands, each smaller facet keeping the paper tone.
      const m = (p: V3, q: V3): V3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const ab = m(a, b), bc = m(b, c), ca = m(c, a);
      this.tri(a, ab, ca, color, k, depth + 1); this.tri(ab, b, bc, color, k, depth + 1);
      this.tri(ca, bc, c, color, k, depth + 1); this.tri(ab, bc, ca, color, k, depth + 1);
      return;
    }
    this.pos.push(...a, ...b, ...c);
    if (printing && kind) {
      // The pattern is laid out for a craft about 90 px long; dragons are longer, so squeeze x.
      const cx = (a[0] + b[0] + c[0]) / 3 * 0.6, cy = (a[1] + b[1] + c[1]) / 3 + 9, cz = (a[2] + b[2] + c[2]) / 3;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const face: Face = printing.wings || Math.abs(ny) > 0.6 * Math.hypot(nx, ny, nz) ? 'top' : 'side';
      const painted = printing.painter(cx, cy, cz, kind, face);
      if (painted) color = new THREE.Color(painted[0]);
    }
    for (let i = 0; i < 3; i++) this.col.push(color.r * k, color.g * k, color.b * k);
  }
  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.tri(a, b, c, color); this.tri(a, c, d, color);
  }
  mesh(glow = false): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    const m = glow
      ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = !glow;
    return mesh;
  }
}

/**
 * A faceted body: diamond cross-sections (top, side, bottom, side) along x, joined by planes.
 * Each section: x, half-width w, half-height h, centre height y. Back planes take `top`, belly `belly`.
 */
function loft(p: Paper, secs: { x: number; w: number; h: number; y: number }[], top: THREE.Color, belly: THREE.Color): void {
  const ring = (s: { x: number; w: number; h: number; y: number }): V3[] => [
    [s.x, s.y + s.h, 0], [s.x, s.y, s.w], [s.x, s.y - s.h * 0.8, 0], [s.x, s.y, -s.w],
  ];
  for (let i = 0; i < secs.length - 1; i++) {
    const a = ring(secs[i]), b = ring(secs[i + 1]);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      p.quad(a[k], b[k], b[k2], a[k2], k === 1 || k === 2 ? belly : top);
    }
  }
  // Close the ends with little pyramids.
  const cap = (s: { x: number; w: number; h: number; y: number }, dx: number) => {
    const r = ring(s), tip: V3 = [s.x + dx, s.y, 0];
    for (let k = 0; k < 4; k++) p.tri(r[k], r[(k + 1) % 4], tip, k === 1 || k === 2 ? belly : top);
  };
  cap(secs[0], 1.5);
  cap(secs[secs.length - 1], -1.5);
}

// --- the rig -------------------------------------------------------------------------------------------

// Bone for membranes and horns, weathered bronze for spars and claws.
const IVORY = new THREE.Color('#e6dcc4'), GOLD = new THREE.Color('#a8743a'), INK = new THREE.Color('#1a2024');
/** How high a dragon flies above the road. */
export const FLY_HEIGHT = 22;

interface Seg { g: THREE.Group; len: number }
interface Wing { shoulder: THREE.Group; hand: THREE.Group; side: number }

/**
 * One wingbeat as a position (+1 wings up, -1 down) and its direction of travel (-1 moving down at
 * full speed, +1 moving up), for a phase in radians: the downstroke takes 58% of the beat and the
 * recovery the rest, eased at both ends. A beat starts at the top, so each new cycle is a downstroke.
 */
function stroke(phase: number): { pos: number; vel: number } {
  const DOWN = 0.58;
  const u = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  if (u < DOWN) { const t = u / DOWN; return { pos: Math.cos(Math.PI * t), vel: -Math.sin(Math.PI * t) }; }
  const t = (u - DOWN) / (1 - DOWN);
  return { pos: -Math.cos(Math.PI * t), vel: Math.sin(Math.PI * t) };
}

/** Called on each downstroke of the player's dragon (strength 0..1), for the wingbeat sound. */
export const dragonEvents: { playerBeat: ((strength: number) => void) | null } = { playerBeat: null };

export class DragonRig {
  root = new THREE.Group();
  /** This rig is the player's dragon (set by the view each frame). */
  isPlayer = false;
  private body = new THREE.Group();     // everything that banks and bobs
  private neck: Seg[] = [];
  private tail: Seg[] = [];
  private wings: Wing[] = [];
  /** The gale: a sheath of pale rushing wind around the body while the boost is on. */
  private gale: THREE.Mesh;
  private galeMat: THREE.MeshBasicMaterial;
  private tuck = 0;
  private shadow: THREE.Mesh;
  private sp: Species;
  private phase = Math.random() * 6;
  private glide = 0;
  private roll = 0;
  private turnSmooth = 0;
  private lastHeading: number | null = null;

  constructor(car: Car) {
    const sp = this.sp = speciesFor(car);
    const sk = car.skin;
    const main = new THREE.Color(sk?.body ?? car.color);
    const dark = sk ? new THREE.Color(sk.trim) : main.clone().multiplyScalar(0.55);
    const membrane = sk ? new THREE.Color(sk.accent) : main.clone().lerp(IVORY, 0.55);
    const belly = main.clone().lerp(IVORY, 0.7);
    const glow = new THREE.Color(sk?.glow ?? '#fff3c0');
    toneSeed = [...car.name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 11) >>> 0;
    // A patterned skin prints itself onto the hide, belly and wing membranes as the dragon is folded.
    const painter = liveryPainter(sk?.pattern);
    printing = painter ? { painter, kinds: new Map<THREE.Color, Kind>([[main, 'paint'], [belly, 'paint'], [membrane, 'paint'], [dark, 'dark']]), wings: false } : null;
    this.root.add(this.body);

    // Torso: deep at the chest, tapering to the hips.
    const L = sp.body, G = sp.girth;
    const torso = new Paper();
    loft(torso, [
      { x: L * 0.5, w: G * 0.55, h: G * 0.55, y: 1 },
      { x: L * 0.25, w: G, h: G * 0.95, y: 0 },
      { x: -L * 0.1, w: G * 0.9, h: G * 0.85, y: 0 },
      { x: -L * 0.5, w: G * 0.5, h: G * 0.5, y: 0.5 },
    ], main, belly);
    // A paper crest down the spine: a row of folded fins.
    if (sp.crest) {
      for (let i = 0; i < 5; i++) {
        const x = L * 0.4 - i * L * 0.2, h = G * (0.95 - i * 0.08);
        torso.tri([x, h, 0], [x - L * 0.16, h, 0], [x - L * 0.05, h + G * 0.7, 0], dark);
      }
    }
    // Tucked legs: a folded claw under the chest and hips.
    for (const side of [1, -1]) {
      for (const [x, s] of [[L * 0.22, 1], [-L * 0.3, 1.2]]) {
        torso.tri([x + 3, -G * 0.6, side * G * 0.5], [x - 3, -G * 0.6, side * G * 0.6], [x - 5 * s, -G * 1.3, side * G * 0.55], dark);
        torso.tri([x - 5 * s, -G * 1.3, side * G * 0.55], [x - 3, -G * 0.6, side * G * 0.6], [x - 7 * s, -G * 1.2, side * G * 0.5], GOLD);
      }
    }
    this.body.add(torso.mesh());

    // Neck: a chain of segments from the chest, each a faceted tube, the head on the last.
    let parent: THREE.Object3D = this.body;
    let at = new THREE.Vector3(L * 0.45, G * 0.35, 0);
    const nl = sp.neck / sp.neckSegs;
    for (let i = 0; i < sp.neckSegs; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      const w0 = G * (0.55 - i * 0.07), w1 = G * (0.48 - i * 0.07);
      const p = new Paper();
      loft(p, [{ x: 0, w: w0, h: w0, y: 0 }, { x: nl, w: w1, h: w1, y: nl * 0.25 }], main, belly);
      g.add(p.mesh());
      g.rotation.z = 0.18;   // the neck rises gently
      parent.add(g);
      this.neck.push({ g, len: nl });
      parent = g;
      at = new THREE.Vector3(nl, nl * 0.25, 0);
    }
    const head = new THREE.Group();
    head.position.copy(at);
    head.rotation.z = -0.5;   // level the head off
    const hp = new Paper(), hw = G * 0.5;
    loft(hp, [
      { x: -1, w: hw * 0.9, h: hw * 0.9, y: 0 },
      { x: hw * 1.6, w: hw, h: hw * 0.8, y: 0.5 },
      { x: hw * 3.6, w: hw * 0.45, h: hw * 0.35, y: -0.5 },
    ], main, belly);
    // Jaw line and horns.
    hp.tri([hw * 3.4, -0.8, hw * 0.4], [hw * 0.5, -hw * 0.9, hw * 0.6], [hw * 0.5, -hw * 0.9, -hw * 0.6], dark);
    for (const side of [1, -1]) {
      const base: V3 = [hw * 0.6, hw * 0.7, side * hw * 0.55];
      if (sp.horns === 'swept') { hp.tri(base, [base[0] + 2, base[1], side * hw * 0.2], [-hw * 2.2, hw * 1.9, side * hw * 1.1], IVORY); }
      if (sp.horns === 'ram') { hp.tri(base, [-hw, hw * 1.6, side * hw * 1.6], [hw * 0.2, hw * 0.1, side * hw * 1.9], IVORY); hp.tri(base, [hw * 0.2, hw * 0.1, side * hw * 1.9], [hw * 1.1, hw * 0.4, side * hw * 1.0], GOLD); }
      if (sp.horns === 'spikes') for (let k = 0; k < 3; k++) hp.tri([hw * (0.9 - k * 0.6), hw * 0.75, side * hw * 0.5], [hw * (0.5 - k * 0.6), hw * 0.75, side * hw * 0.5], [hw * (0.2 - k * 0.7), hw * (1.8 - k * 0.25), side * hw * 0.9], IVORY);
      if (sp.horns === 'antler') { hp.tri(base, [hw * 0.2, hw * 0.7, side * hw * 0.4], [-hw * 1.4, hw * 2.4, side * hw * 1.2], GOLD); hp.tri([-hw * 0.6, hw * 1.6, side * hw * 0.85], [-hw * 0.9, hw * 1.5, side * hw * 0.9], [-hw * 0.3, hw * 2.5, side * hw * 1.6], GOLD); }
    }
    head.add(hp.mesh());
    // Glowing eyes.
    const eyes = new Paper();
    for (const side of [1, -1]) eyes.tri([hw * 2.2, hw * 0.55, side * hw * 0.62], [hw * 1.6, hw * 0.7, side * hw * 0.78], [hw * 1.7, hw * 0.35, side * hw * 0.8], glow, 1);
    head.add(eyes.mesh(true));
    parent.add(head);

    // Tail: a tapering chain from the hips, finishing in its fin.
    parent = this.body;
    at = new THREE.Vector3(-L * 0.48, G * 0.2, 0);
    const tl = sp.tail / sp.tailSegs;
    for (let i = 0; i < sp.tailSegs; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      const f0 = 1 - i / sp.tailSegs, f1 = 1 - (i + 1) / sp.tailSegs;
      const p = new Paper();
      loft(p, [{ x: 0, w: G * 0.5 * f0 + 0.6, h: G * 0.45 * f0 + 0.6, y: 0 }, { x: -tl, w: G * 0.5 * f1 + 0.5, h: G * 0.45 * f1 + 0.5, y: 0 }], main, belly);
      if (sp.crest && i < sp.tailSegs - 1) p.tri([0, G * 0.45 * f0, 0], [-tl * 0.8, G * 0.45 * f1, 0], [-tl * 0.4, G * 0.45 * f0 + G * 0.5 * f0, 0], dark);
      if (i === sp.tailSegs - 1) {
        const e = -tl;
        if (sp.tailFin === 'spade') { p.tri([e, 0, 0], [e - 8, 0, 5], [e - 13, 0, 0], dark); p.tri([e, 0, 0], [e - 13, 0, 0], [e - 8, 0, -5], dark); }
        if (sp.tailFin === 'fan') for (let k = -2; k <= 2; k++) p.tri([e, 0, 0], [e - 14, 0, k * 3.4 - 1.5], [e - 14, 0, k * 3.4 + 1.5], k % 2 ? membrane : dark);
        if (sp.tailFin === 'flame') { p.tri([e, 0.5, 0], [e - 16, 6, 0], [e - 6, 0, 0], new THREE.Color('#ffb347')); p.tri([e, 0, 0], [e - 12, -3, 0], [e - 5, 0, 0], new THREE.Color('#ff7a2a')); }
      }
      g.add(p.mesh());
      parent.add(g);
      this.tail.push({ g, len: tl });
      parent = g;
      at = new THREE.Vector3(-tl, 0, 0);
    }

    // Wings: shoulder (arm panel) and hand (outer panel) on each side, hinged so they can beat
    // and fold. The fold line between the panels reads as a crease in the paper.
    const S = sp.span, C = sp.chord, arm = S * 0.42, hand = S - arm;
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(L * 0.18, G * 0.55, side * G * 0.55);
      const ap = new Paper();
      const z = (v: number) => side * v;
      // Arm: leading-edge spar in gold, membrane back to the body.
      ap.tri([3, 0.6, 0], [arm * 0.1, 0.6, z(arm)], [-1, -0.4, 0], GOLD);
      ap.tri([0, 0, 0], [arm * 0.1, 0, z(arm)], [-C * 0.9, 0, z(arm * 0.15)], membrane);
      ap.tri([arm * 0.1, 0, z(arm)], [-C * 0.55, 0, z(arm * 0.95)], [-C * 0.9, 0, z(arm * 0.15)], membrane);
      shoulder.add(ap.mesh());
      const handG = new THREE.Group();
      handG.position.set(arm * 0.1, 0, z(arm));
      const hpp = new Paper();
      if (sp.wing === 'bat') {
        // Finger spars fanning back from the wrist, scalloped membrane between them.
        const tips: V3[] = [];
        for (let k = 0; k < sp.fingers; k++) {
          const t = k / Math.max(1, sp.fingers - 1);
          tips.push([-t * C * 1.05 + 4, 0, z(hand * (1 - t * 0.45))]);
        }
        tips.forEach((tip) => hpp.tri([1.2, 0.5, 0], [-1, -0.3, 0], tip, GOLD));
        const root: V3 = [-C * 0.55, 0, z(0)];
        for (let k = 0; k < tips.length; k++) {
          const a = tips[k], b = k + 1 < tips.length ? tips[k + 1] : root;
          const notch: V3 = [(a[0] + b[0]) / 2 + 3, 0, (a[2] + b[2]) / 2 * 0.86];
          hpp.tri([0, 0, 0], a, notch, membrane);
          hpp.tri([0, 0, 0], notch, b, membrane);
        }
      } else {
        // Feathers: overlapping folded blades fanning back, longest at the tip.
        hpp.tri([2, 0.5, 0], [hand * 0.12, 0.5, z(hand)], [-1, -0.3, 0], GOLD);
        for (let k = 0; k < sp.fingers; k++) {
          const t = k / (sp.fingers - 1);
          const base: V3 = [-1 - t * 2, 0, z(hand * (0.98 - t * 0.85))];
          const len = C * (0.7 + (1 - t) * 0.55);
          const ang = 0.15 + t * 0.9;
          const tip: V3 = [base[0] - Math.cos(ang) * len, 0, base[2] + z(Math.sin(ang) * len * 0.25)];
          const w = C * 0.16;
          hpp.tri(base, [base[0] - 2, 0, base[2] - z(w)], tip, k % 2 ? membrane : membrane.clone().lerp(main, 0.35));
          hpp.tri(base, tip, [base[0] + 1, 0, base[2] + z(w * 0.6)], k % 2 ? membrane.clone().lerp(main, 0.2) : membrane);
        }
      }
      handG.add(hpp.mesh());
      shoulder.add(handG);
      this.body.add(shoulder);
      this.wings.push({ shoulder, hand: handG, side });
    }

    // The gale: a long faceted sheath of pale wind from just ahead of the chest, trailing well past
    // the tail, folded from a few long planes so it reads as streaks of air.
    const gp = new Paper();
    const g0 = L * 0.7, g1 = -L * 0.6 - sp.tail * 1.1, r0 = G * 1.2, r1 = G * 2.4;
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      const col = k % 2 ? new THREE.Color('#c4ecf5') : new THREE.Color('#e6f4f8');
      gp.tri([g0, Math.sin(a0) * r0, Math.cos(a0) * r0], [g1, Math.sin(a0) * r1, Math.cos(a0) * r1], [g1, Math.sin(a1) * r1, Math.cos(a1) * r1], col, 1);
    }
    this.galeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.gale = new THREE.Mesh(gp.mesh(true).geometry, this.galeMat);
    this.gale.visible = false;
    this.body.add(this.gale);

    printing = null;   // the gale sheath and shadow are never patterned

    // A soft shadow on the road below.
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.55 }));
    this.shadow.scale.set(L + sp.tail * 0.6, 1, S * 1.5);
    this.shadow.position.y = 0.6;
    this.root.add(this.shadow);
    this.body.position.y = FLY_HEIGHT;
  }

  /** A still pose for pictures: wings spread in a glide, body level. */
  pose(car: Car): void {
    this.glide = 1;
    this.phase = -Math.PI / 2;
    this.update(car, 0.4, 0);
  }

  update(car: Car, time: number, dt: number): void {
    const c = car.craft, sp = this.sp;
    this.root.position.set(c.pos.x, 0, c.pos.y);
    this.root.rotation.y = -c.heading;
    const turn = this.lastHeading === null || dt <= 0 ? 0 : wrapAngle(c.heading - this.lastHeading) / dt;
    this.lastHeading = c.heading;
    const k = 1 - Math.exp(-6 * dt);
    this.turnSmooth += (turn - this.turnSmooth) * k;
    const racing = car.race.lapStart >= 0;
    const speed = c.speed;

    // Glide through turns and under braking; the rest of the time the wings keep beating.
    // Only real turns (and braking) lock the wings out, and the change is gradual both ways, so
    // small steering corrections don't make the wings stutter between beating and gliding.
    const want = clamp((Math.abs(this.turnSmooth) - 0.5) / 0.8 + (c.braking ? 0.8 : 0), 0, 1);
    if (dt > 0) this.glide += (want - this.glide) * (1 - Math.exp(-(want > this.glide ? 4 : 2) * dt));
    const effort = racing ? 0.6 + c.thrust * 0.4 : 0.45;
    if (dt > 0) this.tuck += ((c.deploying ? 1 : 0) - this.tuck) * (1 - Math.exp(-7 * dt));
    const flap = (1 - this.glide) * effort * (1 - 0.75 * this.tuck);
    // A little slower than before, and the dragons' speed is unaffected (this only paces the art).
    // Big, slow wingbeats (about 1.2-1.8 a second at racing speed), not a flutter.
    const freq = (0.95 + c.thrust * 0.5 + speed / 2600) * sp.beat;
    const before = Math.floor(this.phase / (Math.PI * 2));
    this.phase += dt * Math.PI * 2 * freq * (0.4 + flap * 0.6);
    if (this.isPlayer && racing && flap > 0.2 && Math.floor(this.phase / (Math.PI * 2)) !== before) dragonEvents.playerBeat?.(flap);
    const st = stroke(this.phase), lag = stroke(this.phase - 0.75);
    const s = st.pos;

    // Wings: a strong, unhurried downstroke and a quicker recovery (shoulders), the hands trailing
    // the arms and folding back on the way up, as a big flier's do. Gliding: locked out with a
    // little dihedral, hands swept back, gently flexing in the air.
    for (const w of this.wings) {
      const beat = st.pos * 0.62 * flap, flex = Math.sin(time * 2.1) * 0.03 * this.glide;
      w.shoulder.rotation.x = -w.side * (0.12 + beat + flex - 0.08 * this.tuck);
      w.shoulder.rotation.y = -w.side * 0.55 * this.tuck;   // the gale: wings swept back into a dive
      w.hand.rotation.x = -w.side * (lag.pos * 0.42 * flap + 0.05 * this.glide);
      w.hand.rotation.y = -w.side * (0.25 * this.glide + Math.max(0, st.vel) * 0.3 * flap + 0.35 * this.tuck);   // sweep back on the upstroke
    }

    // Body: banks into the turn, lifts on the downstroke, noses up a touch when braking.
    const bank = clamp(this.turnSmooth * 0.45, -0.75, 0.75);
    this.roll += (bank - this.roll) * k;
    this.body.rotation.x = this.roll;   // lean into the turn: a right turn drops the right wing
    this.body.rotation.z = (c.braking ? 0.18 : 0) - flap * 0.03 * s;
    const hover = racing ? 0 : Math.sin(time * 2.2) * 1.5;
    // Each downstroke lifts the body and it settles a little on the recovery: smooth, no kinks.
    this.body.position.y = FLY_HEIGHT + c.alt + hover - st.vel * 1.4 * flap;

    // Neck looks into the turn; tail trails out of it, rippling.
    this.neck.forEach((n, i) => {
      n.g.rotation.y = -this.turnSmooth * 0.12 + Math.sin(time * 2 + i * 0.8) * 0.04;   // look into the turn
      n.g.rotation.z = (i === 0 ? 0.18 : 0.06) + Math.sin(this.phase + i) * 0.03 * flap;
    });
    this.tail.forEach((t, i) => {
      t.g.rotation.y = -this.turnSmooth * 0.09 + Math.sin(time * 2.6 - i * 0.7) * 0.07 * (0.5 + this.glide);
      t.g.rotation.z = Math.sin(this.phase - i * 0.6) * 0.05 * flap;
    });

    // The gale: the wind sheath shimmers around the dragon while it's riding it.
    this.gale.visible = this.tuck > 0.05;
    if (this.gale.visible) {
      this.galeMat.opacity = this.tuck * (0.22 + Math.sin(time * 31) * 0.06 + Math.random() * 0.05);
      this.gale.scale.set(0.95 + Math.random() * 0.1, 1, 1);
    }
    this.body.rotation.z -= 0.08 * this.tuck;   // nose down a touch into the dive
    // The shadow fades and spreads with height.
    const up = c.alt;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.5 - up / 300, 0.12, 0.5);
  }
}

let shadowTexCache: THREE.Texture | null = null;
function shadowTex(): THREE.Texture {
  if (shadowTexCache) return shadowTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.7)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  shadowTexCache = new THREE.CanvasTexture(c);
  return shadowTexCache;
}
void INK;
