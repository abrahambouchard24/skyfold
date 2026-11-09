// Dragons: each racer is a dragon folded from paper. Flat triangular planes, each a slightly
// different tone where the light catches its fold, matte paper (no gloss), no textures.
//
// Six species with their own build (body, neck, tail, wings, horns, fins), all animated in code:
// the wings beat while the dragon is pulling (faster as it works harder), then lock out and glide,
// banked, through turns and when it eases off; the neck looks into the turn, the tail trails it,
// and the whole body rises a little on each downstroke. Boost breathes fire.
//
// Model space (world px): nose along +x, y up, z to the dragon's left. A DragonRig is a drop-in
// replacement for the old craft rig: root, update(car, time, dt).

import * as THREE from 'three';
import { clamp, wrapAngle } from './craft';
import type { Car } from './render';

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
  { name: 'WYVERN', body: 34, girth: 9, neck: 22, neckSegs: 3, tail: 40, tailSegs: 5, span: 64, chord: 30, wing: 'bat', fingers: 3, horns: 'swept', tailFin: 'spade', crest: false, beat: 1 },
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
class Paper {
  pos: number[] = [];
  col: number[] = [];
  tri(a: V3, b: V3, c: V3, color: THREE.Color, k = tone()): void {
    this.pos.push(...a, ...b, ...c);
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

const IVORY = new THREE.Color('#f3ead2'), GOLD = new THREE.Color('#d9b25b'), INK = new THREE.Color('#1a2024');
/** How high a dragon flies above the road. */
export const FLY_HEIGHT = 22;

interface Seg { g: THREE.Group; len: number }
interface Wing { shoulder: THREE.Group; hand: THREE.Group; side: number }

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
  private fire: THREE.Mesh;
  private fireMat: THREE.MeshBasicMaterial;
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
    // Fire breath (boost): a folded flame cone from the mouth.
    const fp = new Paper();
    const fl = 26;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2, r = 4;
      fp.tri([0, 0, 0], [fl, Math.sin(a0) * r, Math.cos(a0) * r], [fl, Math.sin(a1) * r, Math.cos(a1) * r], k % 2 ? new THREE.Color('#ffb347') : new THREE.Color('#ffe7a0'), 1);
    }
    this.fireMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.fire = new THREE.Mesh((fp.mesh(true)).geometry, this.fireMat);
    this.fire.position.set(hw * 3.6, -0.5, 0);
    this.fire.visible = false;
    head.add(this.fire);
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
    const want = clamp((Math.abs(this.turnSmooth) - 0.25) / 0.9 + (c.braking ? 0.8 : 0), 0, 1);
    if (dt > 0) this.glide += (want - this.glide) * (1 - Math.exp(-(want > this.glide ? 8 : 3) * dt));
    const effort = racing ? 0.6 + c.thrust * 0.4 : 0.45;
    const flap = (1 - this.glide) * effort;
    const freq = (1.5 + c.thrust * 1.3 + speed / 1100 + (c.deploying ? 0.8 : 0)) * sp.beat;
    const before = Math.floor(this.phase / (Math.PI * 2));
    this.phase += dt * Math.PI * 2 * freq * (0.4 + flap * 0.6);
    if (this.isPlayer && racing && flap > 0.2 && Math.floor(this.phase / (Math.PI * 2)) !== before) dragonEvents.playerBeat?.(flap);
    const s = Math.sin(this.phase), s2 = Math.sin(this.phase - 0.9);

    // Wings: a big beat (shoulders), the hands following a beat behind and folding on the upstroke.
    // Gliding: locked out with a little dihedral, hands swept back, gently flexing in the air.
    for (const w of this.wings) {
      const beat = s * 0.85 * flap, flex = Math.sin(time * 2.1) * 0.03 * this.glide;
      w.shoulder.rotation.x = -w.side * (0.12 + beat + flex);
      w.hand.rotation.x = -w.side * (s2 * 0.6 * flap + 0.05 * this.glide);
      w.hand.rotation.y = -w.side * (0.25 * this.glide + Math.max(0, -s) * 0.3 * flap);   // sweep back
    }

    // Body: banks into the turn, lifts on the downstroke, noses up a touch when braking.
    const bank = clamp(this.turnSmooth * 0.45, -0.75, 0.75);
    this.roll += (bank - this.roll) * k;
    this.body.rotation.x = -this.roll;
    this.body.rotation.z = (c.braking ? 0.18 : 0) - flap * 0.04 * s;
    const hover = racing ? 0 : Math.sin(time * 2.2) * 1.5;
    this.body.position.y = FLY_HEIGHT + c.alt + hover + Math.max(0, -s) * 1.8 * flap;

    // Neck looks into the turn; tail trails out of it, rippling.
    this.neck.forEach((n, i) => {
      n.g.rotation.y = this.turnSmooth * 0.12 + Math.sin(time * 2 + i * 0.8) * 0.04;
      n.g.rotation.z = (i === 0 ? 0.18 : 0.06) + Math.sin(this.phase + i) * 0.03 * flap;
    });
    this.tail.forEach((t, i) => {
      t.g.rotation.y = -this.turnSmooth * 0.09 + Math.sin(time * 2.6 - i * 0.7) * 0.07 * (0.5 + this.glide);
      t.g.rotation.z = Math.sin(this.phase - i * 0.6) * 0.05 * flap;
    });

    // Boost: fire from the mouth, flickering.
    this.fire.visible = c.deploying;
    if (c.deploying) {
      this.fireMat.opacity = 0.6 + Math.random() * 0.35;
      this.fire.scale.set(0.8 + Math.random() * 0.5, 1, 1);
    }
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
