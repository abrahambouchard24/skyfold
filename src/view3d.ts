// Chase camera: the same race drawn in 3D from behind the player's car, with three.js.
// Like render.ts it only reads game state. World (x, y) maps to three.js (x, z), with y up,
// so the circuits keep the layout they have from above.
//
// The cars are modelled from simple parts (hull, canopy, pods, wing, thrusters) in their livery
// colours; the track is built once per circuit from its sampled centerline.

import * as THREE from 'three';
import { CRAFT_LENGTH, type Camera, type Car, type Particle } from './render';
import { COOL_LANE, HALF_WIDTH, KERB_WIDTH, Track, WALL_DIST, WALL_THICKNESS } from './track';
import { groundCanvas, groundMoves, sceneryFor, type Prop } from './scenery';
import { DragonRig, FLY_HEIGHT } from './dragon';
import { drawPathIcon, type PathIcon } from './pathicons';
import { liveryMetal, liveryPainter, type Face, type Kind, type Painted } from './liveries';
import * as LIVERIES_MOD from './liveries';

const WALL_H = 24;            // barrier height
const KERB_CURVE = 1 / 900;   // corners tighter than this get kerbs (as in render.ts)
const ENERGY_FULL = 0.995;
// Tailwind shows as frost, fire (the old boost) as ember: Norse colours, not neon.
const DRS_GLOW = 0x8fd0e0, ERS_GLOW = 0xff8a3d;

/**
 * Each realm's atmosphere: time of day, sky, haze, light, the timber or stone of its barriers and
 * the mountains in the distance. Northern and weathered: cold skies, low suns, mist, with one
 * accent colour (the track theme's) for rune-light and fire.
 */
interface Atmos {
  sky: [string, string, string];   // zenith, mid, horizon
  sun: { color: string; elev: number; azim: number; size: number; light: number };
  stars: number;                   // how many (0 for daylight)
  fog: string; fogNear: number; fogFar: number;
  hemi: [string, string, number];  // sky light, ground light, intensity
  ground: string;                  // tint over the ground texture
  road: string;                    // racing deck
  wall: [string, string];          // barrier panel, top to foot
  skyline: 'towers' | 'city' | 'peaks' | 'dunes' | 'mesas' | 'clouds';
  skylineColor: string;
  windows: string;                 // the one colour building windows glow
  gates: number;                   // light gates arching over the track
  aurora?: boolean;                // northern lights rippling across the sky
  lightning?: boolean;             // a storm: bolts in the distance and flashes of light
}

const ATMOS: Record<string, Atmos> = {
  'MIDGARD': {          // a cold, bright evening over the fjord village
    sky: ['#24384c', '#6f8a98', '#e8c89a'], sun: { color: '#ffd8a0', elev: 0.1, azim: 2.4, size: 280, light: 1.6 }, stars: 0,
    fog: '#9aa8a8', fogNear: 2000, fogFar: 9000, hemi: ['#e6ece6', '#3a3a36', 1.6], ground: '#b8bca0',
    road: '#2e2c2a', wall: ['#8a6a4a', '#4a3a2a'], skyline: 'peaks', skylineColor: '#4a5a64', windows: '#ffb45a', gates: 2,
  },
  'ASGARD': {           // golden light over the halls of the gods
    sky: ['#2a3a5a', '#8aa0c0', '#ffe2a8'], sun: { color: '#fff0c0', elev: 0.22, azim: 1.9, size: 360, light: 2.0 }, stars: 0,
    fog: '#e8dcc0', fogNear: 2400, fogFar: 10000, hemi: ['#fff6e0', '#5a4a3a', 1.8], ground: '#e0d4b8',
    road: '#34302c', wall: ['#e8d6b0', '#a8743a'], skyline: 'peaks', skylineColor: '#a89a88', windows: '#ffd27a', gates: 3,
  },
  'JOTUNHEIM': {        // a grey, cold day among the giants' crags
    sky: ['#3a4450', '#7a8690', '#b8bcc0'], sun: { color: '#e8ecf0', elev: 0.3, azim: 2.8, size: 220, light: 1.3 }, stars: 0,
    fog: '#8a9096', fogNear: 1600, fogFar: 7500, hemi: ['#d8dce0', '#3a3c40', 1.5], ground: '#8a8c88',
    road: '#2a2c2e', wall: ['#8a8c90', '#4a4c50'], skyline: 'peaks', skylineColor: '#4a5058', windows: '#8fd0e0', gates: 2,
  },
  'NIFLHEIM': {         // polar night, moonlight on snow, the aurora overhead
    sky: ['#050a1a', '#14304a', '#3a6a7a'], sun: { color: '#cfe6ff', elev: 0.32, azim: 2.2, size: 160, light: 0.8 }, stars: 380,
    fog: '#1a3044', fogNear: 1400, fogFar: 7000, hemi: ['#a8c8e8', '#18202c', 1.2], ground: '#c8d6e6',
    road: '#2a3240', wall: ['#b8c8da', '#5a6a7a'], skyline: 'peaks', skylineColor: '#1a3044', windows: '#9fe8f0', gates: 2, aurora: true,
  },
  'VANAHEIM': {         // a grey-green sea at dusk among the islands
    sky: ['#1e3040', '#4a7078', '#d8c49a'], sun: { color: '#ffd8a0', elev: 0.08, azim: 2.6, size: 300, light: 1.4 }, stars: 0,
    fog: '#7a9088', fogNear: 1800, fogFar: 8500, hemi: ['#d8e6e0', '#2a3a3a', 1.5], ground: '#5a7a70',
    road: '#28302e', wall: ['#7a8a70', '#3a4a3a'], skyline: 'peaks', skylineColor: '#2a4044', windows: '#ffc070', gates: 2,
  },
  'SVARTALFHEIM': {     // under the mountain: a violet gloom lit by gems and forges, a storm above
    sky: ['#0c0814', '#2a1a3a', '#5a3a5a'], sun: { color: '#c8a8ff', elev: 0.25, azim: 2.0, size: 180, light: 0.9 }, stars: 120,
    fog: '#2a1a34', fogNear: 1400, fogFar: 6500, hemi: ['#b8a0d8', '#1a1420', 1.2], ground: '#3a3044',
    road: '#221e28', wall: ['#5a4a6a', '#2a2234'], skyline: 'peaks', skylineColor: '#1a1028', windows: '#c8a8ff', gates: 2, lightning: true,
  },
  'MUSPELHEIM': {       // the realm of fire: a red-black sky, ember haze
    sky: ['#1a0806', '#5a1a0e', '#d8582a'], sun: { color: '#ff8a40', elev: 0.12, azim: 2.3, size: 340, light: 1.3 }, stars: 0,
    fog: '#4a1a10', fogNear: 1400, fogFar: 6500, hemi: ['#ffb080', '#2a1410', 1.4], ground: '#3a2a26',
    road: '#2a2220', wall: ['#5a3a2a', '#2a1a14'], skyline: 'peaks', skylineColor: '#2a0e08', windows: '#ff8a40', gates: 2,
  },
  'IRONWOOD': {         // twilight in the iron forest, mist between the trees
    sky: ['#101a18', '#2a4038', '#7a9a80'], sun: { color: '#d8f0d0', elev: 0.15, azim: 2.4, size: 200, light: 1.0 }, stars: 60,
    fog: '#3a5048', fogNear: 1200, fogFar: 6000, hemi: ['#c8e0c8', '#1a2420', 1.3], ground: '#3a4a38',
    road: '#202826', wall: ['#5a5a4a', '#2a2a22'], skyline: 'peaks', skylineColor: '#1a2a24', windows: '#9fe8e0', gates: 2,
  },
  'JOMSBORG': {         // a grey sea morning over the fortress
    sky: ['#3a4a58', '#8a9aa8', '#d8d4c4'], sun: { color: '#f0ece0', elev: 0.25, azim: 1.8, size: 240, light: 1.5 }, stars: 0,
    fog: '#9aa4a8', fogNear: 1800, fogFar: 8500, hemi: ['#e8ecec', '#3a3a36', 1.6], ground: '#8a9a80',
    road: '#2c2e30', wall: ['#7a5a3a', '#3e2a1c'], skyline: 'peaks', skylineColor: '#5a6a74', windows: '#ffb45a', gates: 2,
  },
  'HELHEIM': {          // the misty road to Hel: blue-grey gloom, cold light
    sky: ['#0a0e14', '#1e2830', '#4a5660'], sun: { color: '#b8d0f0', elev: 0.2, azim: 2.5, size: 150, light: 0.8 }, stars: 200,
    fog: '#2a343c', fogNear: 1100, fogFar: 5500, hemi: ['#a8b8d0', '#14181c', 1.1], ground: '#3a4048',
    road: '#1e2226', wall: ['#4a5058', '#22262c'], skyline: 'peaks', skylineColor: '#141a20', windows: '#8fb8e0', gates: 2,
  },
  'BIFROST': {          // dusk above the clouds, the aurora overhead
    sky: ['#120e2a', '#4a3a7a', '#e8a8c8'], sun: { color: '#ffd0e8', elev: 0.08, azim: 2.4, size: 300, light: 1.3 }, stars: 160,
    fog: '#6a5a90', fogNear: 2200, fogFar: 9500, hemi: ['#e8d8ff', '#2a2440', 1.4], ground: '#e8e0f0',
    road: '#26223a', wall: ['#f6f0ff', '#c4b4e8'], skyline: 'clouds', skylineColor: '#f0e0ff', windows: '#e0d0ff', gates: 4, aurora: true,
  },
  'YGGDRASIL': {        // green-gold light falling through the World Tree
    sky: ['#1a2a1a', '#5a7a4a', '#e8d898'], sun: { color: '#fff0b0', elev: 0.3, azim: 2.0, size: 260, light: 1.6 }, stars: 0,
    fog: '#7a8a5a', fogNear: 1600, fogFar: 7500, hemi: ['#e8f0c8', '#2a3020', 1.6], ground: '#5a6a40',
    road: '#2a2a22', wall: ['#7a6a4a', '#3a3222'], skyline: 'peaks', skylineColor: '#3a4a30', windows: '#ffe08a', gates: 2,
  },
  'ALFHEIM': {          // a soft dawn in the light elves' groves
    sky: ['#2a3a58', '#a8b8d0', '#ffe8c8'], sun: { color: '#fff4dc', elev: 0.12, azim: 2.1, size: 280, light: 1.7 }, stars: 0,
    fog: '#d8dcd0', fogNear: 2000, fogFar: 9000, hemi: ['#f4f4e8', '#3a4034', 1.7], ground: '#a8c090',
    road: '#2e302c', wall: ['#d8ccb4', '#8a7a5a'], skyline: 'peaks', skylineColor: '#8a98a8', windows: '#fff0c8', gates: 2,
  },
};
const DEFAULT_ATMOS = ATMOS['MIDGARD'];

export interface ChaseScene {
  time: number; cam: Camera; player: Car; cars: Car[]; track: Track; particles: Particle[];
  /** Seconds until the start (negative once the race is on): lights the braziers on the start gate. */
  goIn?: number;
}

export class ChaseView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 4, 12000);
  private world: TrackWorld | null = null;
  private rigs = new Map<Car, DragonRig>();
  private camHeading = 0;
  private camFor: Car | null = null;
  private camPos = new THREE.Vector3();
  private lastNow = 0;
  private sparks: Sparks;
  private drafts = new Slipstreams();
  private hemi = new THREE.HemisphereLight(0xc8d8ff, 0x261c34, 1.5);
  private sun = new THREE.DirectionalLight(0xffffff, 1.7);
  /** Unit vector toward the sun (the shadow light follows the player from this direction). */
  private sunDir = new THREE.Vector3(-0.5, 1, 0.35).normalize();
  private quality: 'high' | 'medium' | 'low' = 'high';
  private speedLines = new SpeedLines();
  private boostK = 0;            // eases toward 1 while boosting: the camera lunge
  /** Dev only: orbit the player's car instead of chasing it (yaw relative to its heading). */
  debugCam: { yaw: number; dist: number; h: number } | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '0', display: 'none' });
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(this.hemi);
    this.sun.position.set(-0.5, 1, 0.35);
    this.scene.add(this.sun);
    // Cars cast real shadows from the track's sun. The shadow box is small and follows the player,
    // so it stays sharp and cheap.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -460; sc.right = 460; sc.top = 460; sc.bottom = -460; sc.near = 10; sc.far = 2400;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.5;
    this.scene.add(this.sun.target);
    this.camera.add(this.speedLines.lines);
    this.scene.add(this.camera);
    this.sparks = new Sparks();
    this.scene.add(this.sparks.points);
    this.scene.add(this.drafts.mesh);
  }

  /** Graphics quality from Settings: shadow sharpness, and on Low no shadows or speed lines. */
  setQuality(q: 'high' | 'medium' | 'low'): void {
    if (q === this.quality) return;
    this.quality = q;
    const shadows = q !== 'low';
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    }
  }

  set visible(on: boolean) { this.canvas.style.display = on ? 'block' : 'none'; }

  render(s: ChaseScene, pixelRatio: number): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;

    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== innerWidth || size.y !== innerHeight) this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;

    if (!this.world || this.world.track !== s.track) {
      if (this.world) { this.scene.remove(this.world.group); dispose(this.world.group); }
      this.world = buildWorld(s.track, this.renderer.capabilities.getMaxAnisotropy());
      this.scene.add(this.world.group);
      // The track's atmosphere: sky colour behind the dome, haze, and the light it's lit by.
      const a = this.world.atmos;
      this.scene.background = new THREE.Color(a.sky[2]);
      this.scene.fog = new THREE.Fog(a.fog, a.fogNear, a.fogFar);
      this.hemi.color.set(a.hemi[0]); this.hemi.groundColor.set(a.hemi[1]); this.hemi.intensity = a.hemi[2];
      this.sun.color.set(a.sun.color); this.sun.intensity = a.sun.light;
      // Shadows read best from a sun a little higher than the one painted in the sky.
      this.sunDir.set(Math.cos(a.sun.azim) * Math.cos(a.sun.elev), Math.max(0.45, Math.sin(a.sun.elev)), Math.sin(a.sun.azim) * Math.cos(a.sun.elev)).normalize();
    }
    this.world.animate(s.time, s.goIn);
    // A lightning flash lights everything up for a moment.
    this.hemi.intensity = this.world.atmos.hemi[2] * (1 + this.world.flash * 1.6);

    // Car rigs: one per car, built the first time it's seen.
    const seen = new Set<Car>();
    for (const car of s.cars) {
      let rig = this.rigs.get(car);
      if (!rig) {
        rig = new DragonRig(car);
        if (car.ghost) ghostly(rig.root);
        this.rigs.set(car, rig);
        this.scene.add(rig.root);
      }
      rig.isPlayer = car === s.player;
      rig.update(car, s.time, dt);
      seen.add(car);
    }
    for (const [car, rig] of this.rigs) {
      if (!seen.has(car)) { this.scene.remove(rig.root); dispose(rig.root); this.rigs.delete(car); }
    }
    this.sparks.update(s.particles);
    this.drafts.update(s.cars.filter((c) => !c.ghost), s.time);
    this.updateCamera(s, dt);
    for (const o of this.world.skyFollow) o.position.set(this.camera.position.x, 0, this.camera.position.z);
    const pc = s.player.craft;
    this.sun.target.position.set(pc.pos.x, 0, pc.pos.y);
    this.sun.position.set(pc.pos.x + this.sunDir.x * 1200, this.sunDir.y * 1200, pc.pos.y + this.sunDir.z * 1200);
    this.speedLines.update(this.quality === 'low' ? 0 : pc.speed, pc.deploying, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Behind and above the player's car, swinging round after it a little late so drifts show. */
  private updateCamera(s: ChaseScene, dt: number): void {
    const c = s.player.craft;
    const speedFrac = Math.min(1, c.speed / 880);
    const jumped = this.camFor !== s.player || Math.hypot(this.camPos.x - c.pos.x, this.camPos.z - c.pos.y) > 900;
    if (jumped) this.camHeading = c.heading;
    else this.camHeading += wrapAngle(c.heading - this.camHeading) * (1 - Math.exp(-5.5 * dt));
    this.camFor = s.player;
    // Boosting: the camera eases back and the view widens, a lunge you can feel.
    this.boostK += ((c.deploying ? 1 : 0) - this.boostK) * (1 - Math.exp(-6 * dt));
    const back = 175 + speedFrac * 45 + this.boostK * 24, up = 62 + FLY_HEIGHT + speedFrac * 8 - this.boostK * 4;
    const fx = Math.cos(this.camHeading), fy = Math.sin(this.camHeading);
    const shake = s.cam.shake * 0.5;
    // A smooth high-speed rumble from about 180 km/h (layered sines, not random jitter).
    const t = s.time, hum = this.quality === 'low' ? 0 : clamp((c.speed - 720) / 220, 0, 1) * 1.4;
    const rx = (Math.sin(t * 37) + Math.sin(t * 23.3) * 0.6) * hum, ry = (Math.sin(t * 41.7) + Math.sin(t * 29.1) * 0.5) * hum;
    this.camera.position.set(
      c.pos.x - fx * back + (Math.random() - 0.5) * shake - fy * rx,
      up + c.alt * 0.7 + (Math.random() - 0.5) * shake + ry,
      c.pos.y - fy * back + (Math.random() - 0.5) * shake + fx * rx);
    this.camPos.set(c.pos.x, 0, c.pos.y);
    this.camera.lookAt(c.pos.x + fx * 150, 14 + FLY_HEIGHT * 0.8 + c.alt * 0.8, c.pos.y + fy * 150);
    if (this.debugCam) {
      const a = c.heading + this.debugCam.yaw;
      this.camera.position.set(c.pos.x + Math.cos(a) * this.debugCam.dist, this.debugCam.h, c.pos.y + Math.sin(a) * this.debugCam.dist);
      this.camera.lookAt(c.pos.x, 10, c.pos.y);
    }
    this.camera.fov = 66 + speedFrac * 14 + this.boostK * 8;   // wider at speed, and more on boost, for the sense of pace
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Wind streaks: thin lines rushing past the camera, fading in from about 150 km/h and stronger
 * on boost. They live in camera space (the camera looks down -z), in a ring around the view centre
 * so they never cross the car.
 */
class SpeedLines {
  readonly lines: THREE.LineSegments;
  private n = 46;
  private pos: Float32Array;
  private seeds: { x: number; y: number; z: number }[] = [];
  private mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  constructor() {
    this.pos = new Float32Array(this.n * 6);
    for (let i = 0; i < this.n; i++) this.seeds.push(this.spawn(-60 - Math.random() * 900));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
  }

  private spawn(z: number) {
    const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 170;
    return { x: Math.cos(a) * r * 1.6, y: Math.sin(a) * r, z };
  }

  update(speed: number, boosting: boolean, dt: number): void {
    const k = clamp((speed - 600) / 300, 0, 1);
    this.mat.opacity = k * (boosting ? 0.2 : 0.1);
    this.lines.visible = k > 0;
    if (!k) return;
    const len = 16 + k * 50 + (boosting ? 30 : 0);
    for (let i = 0; i < this.n; i++) {
      const sd = this.seeds[i];
      sd.z += speed * 1.4 * dt;
      if (sd.z > -30) this.seeds[i] = this.spawn(-700 - Math.random() * 300);
      const q = this.seeds[i];
      this.pos.set([q.x, q.y, q.z, q.x, q.y, q.z - len], i * 6);
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

// --- the circuit ---------------------------------------------------------------------------------

interface TrackWorld {
  track: Track; group: THREE.Group; atmos: Atmos; animate(time: number, goIn?: number): void; flash: number;
  /** Sky effects that travel with the camera (always at the same distance, like the sky itself). */
  skyFollow: THREE.Object3D[];
}

function buildWorld(track: Track, aniso: number): TrackWorld {
  const group = new THREE.Group();
  const theme = track.theme;
  const atmos = ATMOS[track.name] ?? DEFAULT_ATMOS;
  const pts = track.pts, m = pts.length;
  // Distance along the centerline at each sample (the last entry closes the loop).
  const dist = [0];
  for (let i = 1; i <= m; i++) dist.push(dist[i - 1] + Math.hypot(pts[i % m].x - pts[i - 1].x, pts[i % m].y - pts[i - 1].y));

  /**
   * A strip along the track between two offsets from the centerline (left is +), at height y. An
   * offset can vary along the track (a function of the sample), for the wider road at splits.
   */
  type Off = number | ((i: number) => number);
  const ribbon = (from: number, to: number, dA: Off, dB: Off, yA: number, yB: number, vLen: number): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = from, k = 0; i <= to; i++, k++) {
      const p = pts[i % m];
      const a = typeof dA === 'number' ? dA : dA(i % m), b2 = typeof dB === 'number' ? dB : dB(i % m);
      pos.push(p.x + p.nx * a, yA, p.y + p.ny * a, p.x + p.nx * b2, yB, p.y + p.ny * b2);
      const v = (dist[i % (m + 1)] + (i > m ? dist[m] : 0)) / vLen;
      uv.push(0, v, 1, v);
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  const tex = (c: HTMLCanvasElement, repeat = true) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const basic = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, ...o });
  const additive = (o: THREE.MeshBasicMaterialParameters) =>
    basic({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, ...o });
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, order = 0) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = order;
    group.add(mesh);
    return mesh;
  };

  // Ground: the track's own ground tile, repeated (Harbor Lights' water drifts).
  const b = track.bounds, margin = 7000;
  const gw = b.maxX - b.minX + margin * 2, gh = b.maxY - b.minY + margin * 2;
  // A light, clean ground in the atmosphere's colour, with the track's own pattern laid faintly over it.
  const groundTex = tex(canvas2d(512, 512, (g) => {
    g.fillStyle = atmos.ground; g.fillRect(0, 0, 512, 512);
    g.globalAlpha = groundMoves(track) ? 0.5 : 0.22;   // water keeps more of its waves
    g.drawImage(groundCanvas(sceneryFor(track).ground), 0, 0, 512, 512);
  }));
  groundTex.repeat.set(gw / 512, gh / 512);
  const ground = new THREE.PlaneGeometry(gw, gh).rotateX(-Math.PI / 2);
  add(ground, basic({ map: groundTex })).position.set((b.minX + b.maxX) / 2, -1, (b.minY + b.maxY) / 2);

  // The road: worn flagstones laid in rows, each slab its own shade of the realm's stone, mossy
  // mortar between them, darker and rougher toward the edges where fewer feet have walked.
  const road = canvas2d(256, 256, (g) => {
    let seed = 7;
    const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const base = new THREE.Color(atmos.road);
    g.fillStyle = '#1a1916'; g.fillRect(0, 0, 256, 256);   // the mortar
    for (let y = 0; y < 256; y += 32) {
      let x = (y / 32) % 2 ? -24 : 0;
      while (x < 256) {
        const w = 34 + r() * 30, k = 0.85 + r() * 0.35;
        const c = base.clone().multiplyScalar(k).lerp(new THREE.Color('#6a6458'), 0.22 + r() * 0.12);
        g.fillStyle = `#${c.getHexString()}`;
        // A slab with slightly irregular corners.
        g.beginPath();
        g.moveTo(x + 2 + r() * 2, y + 2 + r() * 2);
        g.lineTo(x + w - 2 - r() * 2, y + 2 + r() * 2);
        g.lineTo(x + w - 2 - r() * 2, y + 30 - r() * 2);
        g.lineTo(x + 2 + r() * 2, y + 30 - r() * 2);
        g.closePath(); g.fill();
        // Wear: a lighter worn patch, and a few cracks.
        g.fillStyle = 'rgba(255,248,230,0.05)'; g.fillRect(x + w * 0.2, y + 8, w * 0.5, 14);
        if (r() < 0.3) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + r() * w, y + 3); g.lineTo(x + r() * w, y + 29); g.stroke(); }
        // Moss creeping into the joints.
        if (r() < 0.35) { g.fillStyle = 'rgba(90,110,60,0.45)'; g.fillRect(x + r() * w, y + 28, 6 + r() * 10, 4); }
        x += w;
      }
    }
    const across = g.createLinearGradient(0, 0, 256, 0);
    across.addColorStop(0, 'rgba(0,0,0,0.35)'); across.addColorStop(0.16, 'rgba(0,0,0,0.04)');
    across.addColorStop(0.84, 'rgba(0,0,0,0.04)'); across.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = across; g.fillRect(0, 0, 256, 256);
  });
  /**
   * Jumps (sprints): road-level strips rise over each ramp to its lip, and are left out over the gap
   * after it. Ribbons built over the whole track have two vertices per sample (2i, 2i+1).
   */
  /** Offsets that follow the road's width and the island at splits. */
  const OUT = (side: number, plus = 0) => (i: number) => side * (track.outer[i] + plus);
  const ISL = (side: number, plus = 0) => (i: number) => side * (track.island[i] + plus);
  /** Drop the triangles of a whole-track strip where `skip(sample)` (by the sample each segment starts at). */
  const cut = <G extends THREE.BufferGeometry>(g: G, skip: (seg: number) => boolean): G => {
    const idx = g.getIndex()!, keep: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b2 = idx.getX(t + 1), c = idx.getX(t + 2);
      if (!skip(Math.min(a, b2, c) >> 1)) keep.push(a, b2, c);
    }
    g.setIndex(keep);
    return g;
  };
  /** A whole-track strip with no road across the break of a point-to-point route. */
  const whole = <G extends THREE.BufferGeometry>(g: G): G => (track.open ? cut(g, (seg) => track.isBreak(seg)) : g);
  const rampLift = (i: number, j: { from: number; lip: number; height: number }) =>
    (j.height * (track.dist[i] - track.dist[j.from])) / (track.dist[j.lip] - track.dist[j.from]);
  /** One lane-side of a whole-track strip: it rises over that side's ramps and stops at their gaps. */
  const jumpify = <G extends THREE.BufferGeometry>(g: G, base: number, side: number): G => {
    const mine = track.jumps.filter((j) => j.side === side);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (const j of mine) for (let i = j.from; i <= j.lip; i++) {
      pos.setY(2 * i, base + rampLift(i, j)); pos.setY(2 * i + 1, base + rampLift(i, j));
    }
    return cut(g, (seg) => track.isBreak(seg) || mine.some((j) => seg >= j.lip && seg < j.land));
  };
  // The road in two halves (centre to edge), so a split's island sits between its two lanes.
  const roadMat = basic({ map: tex(road) });
  for (const side of [1, -1]) add(jumpify(ribbon(0, m, ISL(side), OUT(side), 0, 0, 128), 0, side), roadMat);
  if (track.jumps.length) {
    // Ramp sides and the face under the lip, glowing chevrons up the deck, and the gap: a dark drop
    // with an energy net across it.
    const sideMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(atmos.wall[1]).multiplyScalar(0.85), side: THREE.DoubleSide, flatShading: true });
    const netTex = tex(canvas2d(64, 64, (g) => {
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
      g.strokeRect(0, 0, 64, 64);
    }));
    const rampChev = tex(canvas2d(64, 64, (g) => {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(10, 46); g.lineTo(32, 20); g.lineTo(54, 46); g.stroke();
    }));
    for (const j of track.jumps) {
      const sd = j.side;
      for (const edge of [ISL(sd), OUT(sd)]) {
        const g = ribbon(j.from, j.lip, edge, edge, 0, 0, 1e9);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = j.from, k = 0; i <= j.lip; i++, k++) pos.setY(2 * k, rampLift(i, j));
        add(g, sideMat);
      }
      const p = pts[j.lip], li = sd * track.island[j.lip], lo = sd * track.outer[j.lip];
      const lipFace = new THREE.BufferGeometry();
      lipFace.setAttribute('position', new THREE.Float32BufferAttribute([
        p.x + p.nx * li, 0, p.y + p.ny * li, p.x + p.nx * lo, 0, p.y + p.ny * lo,
        p.x + p.nx * lo, j.height, p.y + p.ny * lo, p.x + p.nx * li, j.height, p.y + p.ny * li,
      ], 3));
      lipFace.setIndex([0, 1, 2, 0, 2, 3]);
      lipFace.computeVertexNormals();
      add(lipFace, sideMat);
      const chev = ribbon(j.from, j.lip, ISL(sd, 30), OUT(sd, -30), 0.6, 0.6, 70);
      const cp = chev.getAttribute('position') as THREE.BufferAttribute;
      for (let i = j.from, k = 0; i <= j.lip; i++, k++) { cp.setY(2 * k, rampLift(i, j) + 0.6); cp.setY(2 * k + 1, rampLift(i, j) + 0.6); }
      add(chev, basic({ map: rampChev, color: 0xb07a3e, transparent: true, opacity: 0.55, depthWrite: false }), 2);   // carved bronze arrows
      add(ribbon(j.lip, j.land, ISL(sd), OUT(sd, WALL_THICKNESS), -0.6, -0.6, 1e9), basic({ color: 0x0a0806, transparent: true, opacity: 0.9, depthWrite: false }), 1);
      void netTex;
    }
  }
  // Fork lanes: each effect strip glows in its own way (gold pads, flames, charging pulses, frost),
  // and a sign on the island's nose says what each lane offers.
  const stripTex: THREE.Texture[] = [];
  if (track.strips.length) {
    const STRIP_LOOK: Record<string, { color: string; draw: (g: CanvasRenderingContext2D) => void; v: number; speed: number }> = {
      boost: { color: '#ffd23f', v: 110, speed: 2.2, draw: (g) => { g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, 50); g.lineTo(32, 18); g.lineTo(56, 50); g.stroke(); } },
      fire: { color: '#ff6a2a', v: 90, speed: 3.2, draw: (g) => { g.fillStyle = '#fff'; for (const x of [10, 32, 54]) { g.beginPath(); g.moveTo(x - 8, 60); g.quadraticCurveTo(x - 6, 30, x, 6); g.quadraticCurveTo(x + 6, 30, x + 8, 60); g.fill(); } } },
      // The lane's symbol, squeezed across: a strip is about twice as wide as one repeat is long.
      charge: { color: '#b98cff', v: 90, speed: 1.6, draw: (g) => { g.translate(32, 32); g.scale(0.42, 1); drawPathIcon(g, 'charge', 0, 0, 44, 'rgba(255,255,255,0.8)'); } },
      cool: { color: '#7fe6ff', v: 90, speed: 0.9, draw: (g) => { g.translate(32, 32); g.scale(0.42, 1); drawPathIcon(g, 'cool', 0, 0, 44, 'rgba(255,255,255,0.8)'); } },
    };
    const looks = new Map<string, { mat: THREE.Material; tex: THREE.Texture; speed: number }>();
    for (const st of track.strips) {
      const look = STRIP_LOOK[st.kind];
      if (!looks.has(st.kind)) {
        const t2 = tex(canvas2d(64, 64, look.draw));
        stripTex.push(t2);
        (t2 as THREE.Texture & { speed?: number }).userData = { speed: look.speed };
        looks.set(st.kind, { mat: additive({ map: t2, color: look.color, opacity: 0.9 }), tex: t2, speed: look.speed });
      }
      const sd = st.side;
      add(ribbon(st.from, st.to, ISL(sd, 18), OUT(sd, -18), 0.5, 0.5, 1e9), basic({ color: look.color, transparent: true, opacity: 0.14, depthWrite: false }), 1);
      add(ribbon(st.from, st.to, ISL(sd, 30), OUT(sd, -30), 0.7, 0.7, look.v), looks.get(st.kind)!.mat, 2);
    }
  }
  if (track.forks.length) {
    const EFFECT: Record<string, PathIcon> = { jump: 'jump', boost: 'boost', charge: 'charge', cool: 'cool', fire: 'fire' };
    const TINT: Record<string, string> = { jump: '#e3b26c', boost: '#e3b26c', charge: '#c9a8ff', cool: '#a8e4f2', fire: '#ff9a5a' };
    for (const f of track.forks) {
      const bend: 1 | -1 = f.sign === -1 ? -1 : 1;
      const iconOf = (kind: string, side: number): [PathIcon, string] =>
        EFFECT[kind] ? [EFFECT[kind], TINT[kind]] : [f.curve ? (side === f.sign ? 'inside' : 'wide') : 'road', '#e8d9b8'];
      let i = f.from;
      while (i < f.to && track.island[i] < 70) i++;
      const p = pts[i], dir = track.direction(i);
      const [li, lc] = iconOf(f.left, 1), [ri, rc] = iconOf(f.right, -1);
      const sign = boardPlane(150, 50, (g, W, H) => {
        // Each half shows its lane's mark, with a small pointer to the side it leads.
        drawPathIcon(g, li, W * 0.3, H / 2, H * 0.6, lc, bend);
        drawPathIcon(g, ri, W * 0.7, H / 2, H * 0.6, rc, bend);
        g.fillStyle = '#e8d9b8';
        for (const [x, d] of [[W * 0.09, -1], [W * 0.91, 1]] as const) {
          g.beginPath(); g.moveTo(x + d * H * 0.1, H / 2); g.lineTo(x - d * H * 0.06, H * 0.36); g.lineTo(x - d * H * 0.06, H * 0.64); g.closePath(); g.fill();
        }
        g.fillStyle = '#2a2724'; g.fillRect(W / 2 - H * 0.04, H * 0.15, H * 0.08, H * 0.7);   // an iron strap between the halves
      });
      sign.geometry.rotateX(Math.PI / 2).rotateY(Math.PI / 2);
      const holder = new THREE.Group();
      holder.add(bothWays(sign));
      const post = new THREE.Mesh(new THREE.BoxGeometry(8, 64, 8), new THREE.MeshLambertMaterial({ color: 0x4a3322 }));
      post.position.y = -32;
      holder.add(post);
      holder.position.set(p.x, 104, p.y);
      holder.rotation.y = -dir;
      group.add(holder);
    }
  }
  {
    // The deck faces straight up (normals for lighting the two layers below).
    const up = (g: THREE.BufferGeometry) => {
      const n = new Float32Array(g.getAttribute('position').count * 3);
      for (let k = 1; k < n.length; k += 3) n[k] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      return g;
    };
    // Shadows of the cars, cast onto the road.
    const catchMat = new THREE.ShadowMaterial({ opacity: 0.38 });
    for (const side of [1, -1]) add(jumpify(up(ribbon(0, m, ISL(side), OUT(side), 0.15, 0.15, 128)), 0.15, side), catchMat, 1).receiveShadow = true;
    // A glossy sheen: only the sun's specular highlight, added on top, so the deck reads polished.
    const sheenMat = new THREE.MeshPhongMaterial({
      color: 0x000000, specular: new THREE.Color(atmos.sun.color).multiplyScalar(0.55), shininess: 26,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    void sheenMat;   // a stone road has no gloss
  }

  // Kerbs through the corners: lit and dark blocks in turn, slightly raised.
  {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    // Rough setts of the realm's stone through the corners: each block its own shade, no painted stripes.
    const sett = new THREE.Color(atmos.wall[1]).lerp(new THREE.Color('#6a645a'), 0.6);
    for (let i = 0; i < m; i++) {
      if (Math.abs(pts[i].curve) < KERB_CURVE) continue;
      const h = Math.sin(i * 12.9898) * 43758.5453, c = sett.clone().multiplyScalar(0.72 + 0.3 * (h - Math.floor(h)));
      for (const side of [1, -1]) {
        const base = pos.length / 3;
        if (track.isBreak(i)) continue;
        for (const [j, inset] of [[i, KERB_WIDTH], [i + 1, KERB_WIDTH], [i + 1, 0], [i, 0]] as const) {
          const p = pts[j % m], d = track.outer[j % m] - inset;
          pos.push(p.x + p.nx * d * side, 0.8, p.y + p.ny * d * side);
          col.push(c.r, c.g, c.b);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    add(g, basic({ vertexColors: true }));
  }

  // Barriers: a dark panel facing the track with a bright foot and a coloured top edge, the top,
  // the outer face, and a neon glow on the ground outside.
  // Barriers: a wall of upright timber planks, darker at the foot, bound by an iron band near the
  // top, with a thin line of the realm's colour on its cap.
  const face = canvas2d(4, 64, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, atmos.wall[0]); v.addColorStop(1, atmos.wall[1]);
    g.fillStyle = v; g.fillRect(0, 0, 4, 64);
    g.fillStyle = '#2a2622'; g.fillRect(0, 9, 4, 5);          // the iron band
    g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(0, 9, 4, 1);
    g.fillStyle = 'rgba(20,14,10,0.55)'; g.fillRect(0, 0, 4, 3);   // the cap's shadow
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 58, 4, 6);
  });
  const faceTex = tex(face, false);
  const plankMat = new THREE.MeshBasicMaterial({ map: tex(canvas2d(32, 8, (g) => { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 2, 8); }), true),
    transparent: true, depthWrite: false });
  const faceMat = basic({ map: faceTex });
  // The cap: a lit beam of timber, tinted a touch toward the realm's colour.
  const topMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(atmos.wall[1]).lerp(new THREE.Color(theme.wall), 0.18).multiplyScalar(0.9) });
  const outerMat = basic({ color: new THREE.Color(atmos.wall[1]).multiplyScalar(0.75) });
  const glow = canvas2d(64, 4, (g) => {
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(255,255,255,0.55)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h; g.fillRect(0, 0, 64, 4);
  });
  const glowMat = additive({ map: tex(glow, false), color: theme.wall });
  // The rail pulses streaming forward along the top of the wall.
  const pulse = canvas2d(8, 256, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 40);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.7, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, 8, 40);
  });
  const pulseTex = tex(pulse);
  const pulseMat = additive({ map: pulseTex });
  // Lights set into the top of the barriers.
  // Torch flames along the wall tops: a small warm glow every few paces.
  const lamp = canvas2d(16, 64, (g) => {
    const r = g.createRadialGradient(8, 32, 0, 8, 32, 8);
    r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.4, 'rgba(255,170,80,0.8)'); r.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, 16, 64);
  });
  const lampMat = additive({ map: tex(lamp), color: '#ffd8a0' });
  const torchMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const side of [1, -1]) {
    const inner = OUT(side), outer = OUT(side, WALL_THICKNESS);
    const faceG = whole(ribbon(0, m, inner, inner, WALL_H, 0, 1e9)); faceG.setAttribute('uv', wallUv(m)); add(faceG, faceMat);
    // Plank joints: thin dark lines up the wall every few paces.
    add(whole(ribbon(0, m, OUT(side, -0.4), OUT(side, -0.4), WALL_H, 0, 18)), plankMat, 1);
    add(whole(ribbon(0, m, inner, outer, WALL_H, WALL_H, 1e9)), topMat);
    add(whole(ribbon(0, m, outer, outer, WALL_H, 0, 1e9)), outerMat);
    void glowMat; void pulseMat;   // no neon ground glow or rail pulses on a timber wall
    void lampMat;
  }
  // Torches on posts along the wall tops, every few hundred px: a timber stake, an iron cup and a
  // flickering flame (all instanced: a few meshes for the whole map).
  {
    const spots: { x: number; z: number; y: number }[] = [];
    const every = 16;   // samples (about 320 px)
    for (const side of [1, -1]) {
      for (let i = side > 0 ? 0 : every / 2; i < m; i += every) {
        if (track.isBreak(i)) continue;
        const pp = pts[i], d = OUT(side, WALL_THICKNESS / 2)(i);
        spots.push({ x: pp.x + pp.nx * d, z: pp.y + pp.ny * d, y: WALL_H });
      }
    }
    if (track.island.some((v) => v > 1)) {
      for (let i = 0; i < m; i += 12) {
        if (track.isBreak(i) || track.island[i] < 60) continue;
        const pp = pts[i];
        spots.push({ x: pp.x, z: pp.y, y: 40 });
      }
    }
    const n = spots.length;
    const stake = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.6, 2.2, 22, 5).translate(0, 11, 0), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), n);
    const cup = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.5, 2.5, 5, 6).translate(0, 24, 0), new THREE.MeshLambertMaterial({ color: 0x2e2b28 }), n);
    const flame = new THREE.InstancedMesh(new THREE.ConeGeometry(3.6, 12, 5).translate(0, 32, 0), torchMat, n);
    const mtx = new THREE.Matrix4();
    spots.forEach((sp, k) => {
      mtx.makeTranslation(sp.x, sp.y, sp.z);
      stake.setMatrixAt(k, mtx); cup.setMatrixAt(k, mtx); flame.setMatrixAt(k, mtx);
    });
    for (const o of [stake, cup, flame]) { o.frustumCulled = false; group.add(o); }
  }
  if (track.island.some((v) => v > 1)) {
    // Islands: a raised block between the two lanes of a split, its walls in the barrier style and
    // its top in the track's colour, with a line of lights along each edge.
    const ISLAND_H = 40;
    const noIsland = (seg: number) => track.isBreak(seg) || (track.island[seg] < 1 && track.island[(seg + 1) % m] < 1);
    for (const side of [1, -1]) {
      const fg = cut(ribbon(0, m, ISL(side), ISL(side), ISLAND_H, 0, 1e9), noIsland); fg.setAttribute('uv', wallUv(m)); add(fg, faceMat);
    }
    add(cut(ribbon(0, m, ISL(1), ISL(-1), ISLAND_H, ISLAND_H, 1e9), noIsland), new THREE.MeshLambertMaterial({ color: new THREE.Color(atmos.wall[0]).lerp(new THREE.Color(theme.wall), 0.15).multiplyScalar(0.85) }));
  }

  // Cooling lane: a tinted band with chevrons flowing along it.
  const coolIn = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width), coolOut = COOL_LANE.side * HALF_WIDTH;
  add(ribbon(COOL_LANE.from, COOL_LANE.to, coolIn, coolOut, 0.5, 0.5, 1e9), basic({ color: 0xc4ecf5, transparent: true, opacity: 0.22, depthWrite: false }), 1);   // frost on the stones
  const chev = canvas2d(64, 64, (g) => {
    // The ice rune, Isa (a single stave), with a frost glint either side.
    g.strokeStyle = 'rgba(200,240,250,0.85)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 52); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(18, 26); g.lineTo(22, 30); g.moveTo(46, 34); g.lineTo(42, 38); g.stroke();
  });
  const chevTex = tex(chev);
  add(ribbon(COOL_LANE.from, COOL_LANE.to, coolIn, coolOut, 0.7, 0.7, 60), additive({ map: chevTex }), 2);
  {
    const s = pts[COOL_LANE.from + 2], d = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2),
      additive({ map: tex(canvas2d(64, 64, (g) => drawPathIcon(g, 'cool', 32, 32, 52, 'rgba(200,240,250,0.95)'))) }));
    label.position.set(s.x + s.nx * d, 0.9, s.y + s.ny * d);
    label.rotation.y = -track.direction(COOL_LANE.from + 2) - Math.PI / 2;
    group.add(label);
  }

  // DRS zones: a dashed green line across the track where each starts, fainter where it ends.
  // Tailwind zones: where one starts, a standing stone on each side of the road with the journey
  // rune (Raidho) glowing pale blue on its face. No marks on the road itself.
  {
    const rune = tex(canvas2d(32, 64, (g) => {
      g.fillStyle = '#5a5650'; g.fillRect(0, 0, 32, 64);
      g.strokeStyle = '#bfe8f2'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(10, 54); g.lineTo(10, 10); g.lineTo(23, 21); g.lineTo(10, 32); g.lineTo(24, 54); g.stroke();
    }));
    // The rune only on the face toward the road; the rest is plain weathered stone.
    const runeMat = new THREE.MeshLambertMaterial({ map: rune, emissive: 0x1a2a30, emissiveMap: rune });
    const plain = new THREE.MeshLambertMaterial({ color: 0x5a5650 });
    for (const z of track.drsZones) {
      const i = z.from, p = pts[i], d = track.direction(i);
      for (const side of [1, -1]) {
        const off = side * (track.outer[i] + WALL_THICKNESS + 18);
        // Box faces: +x, -x, +y, -y, +z, -z; the road is toward -z for a stone on the +z side.
        const faces = [plain, plain, plain, plain, side > 0 ? plain : runeMat, side > 0 ? runeMat : plain];
        const stone = new THREE.Mesh(new THREE.BoxGeometry(18, 46, 10).translate(0, 23, 0), faces);
        stone.position.set(p.x + p.nx * off, 0, p.y + p.ny * off);
        stone.rotation.y = -d;
        stone.rotation.z = side * 0.04;
        group.add(stone);
      }
    }
  }

  // The start braziers: three iron fire bowls on the start gate, lit one by one through the
  // count (3, 2, 1); on GO all three roar up tall, then burn on through the race.
  const braziers: { fire: THREE.Mesh; mat: THREE.MeshBasicMaterial; glow: THREE.Mesh }[] = [];
  const lightBraziers = (time: number, goIn?: number) => {
    const lit = goIn === undefined || goIn <= 0 ? 3 : goIn > 3 ? 0 : 3 - Math.ceil(goIn) + 1;
    const roar = goIn !== undefined && goIn <= 0 && goIn > -1.2 ? 1 + 1.6 * (1 + goIn / 1.2) : 1;
    braziers.forEach((b, k) => {
      const on = k < lit;
      b.fire.visible = b.glow.visible = on;
      if (!on) return;
      const fl = 1 + 0.12 * Math.sin(time * 17 + k * 2.1) + 0.08 * Math.sin(time * 41 + k);
      b.fire.scale.set(1, fl * roar, 1);
      b.mat.opacity = 0.85 + 0.15 * Math.sin(time * 29 + k);
      b.glow.scale.setScalar(0.9 + 0.1 * fl + 0.4 * (roar - 1));
    });
  };

  // Start line (and on a point-to-point route the finish line): a checkered band and a timber gate.
  const lineAt = (at: number, text: string) => {
    const p = pts[at], dir = track.direction(at);
    // A threshold of dark slate across the road, a row of runes cut into it and filled with bronze.
    const checker = canvas2d(32, 320, (g) => {
      g.fillStyle = '#2e2b28'; g.fillRect(0, 0, 32, 320);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, 2, 320); g.fillRect(30, 0, 2, 320);
      g.strokeStyle = '#b07a3e'; g.lineWidth = 2.2; g.lineCap = 'round';
      const glyphs = [
        [[16, 4, 16, 28], [16, 10, 24, 4], [16, 18, 24, 12]],
        [[10, 4, 10, 28], [10, 4, 22, 14], [22, 14, 22, 28]],
        [[16, 4, 16, 28], [16, 10, 24, 16], [24, 16, 16, 22]],
        [[10, 4, 22, 28], [22, 4, 10, 28]],
        [[10, 4, 10, 28], [22, 4, 22, 28], [10, 12, 22, 20]],
        [[16, 4, 16, 28], [8, 12, 16, 4], [24, 12, 16, 4]],
      ];
      for (let k = 0; k < 10; k++) {
        g.save(); g.translate(0, k * 32);
        for (const [x0, y0, x1, y1] of glyphs[k % glyphs.length]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
        g.restore();
      }
    });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(26, HALF_WIDTH * 2).rotateX(-Math.PI / 2), basic({ map: tex(checker, false) }));
    band.position.set(p.x, 0.9, p.y);
    band.rotation.y = -dir;
    group.add(band);
    const gantry = new THREE.Group();
    const lightCol = new THREE.Color(`rgb(${theme.lights})`);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5a3f2a });   // timber
    const span = WALL_DIST * 2 + 16;
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(10, 120, 10), postMat);
      post.position.set(0, 60, side * span / 2);
      gantry.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 14, span + 10), postMat);
    beam.position.y = 120;
    gantry.add(beam);
    // Crossed dragon-head finials on the posts, shields hung along the beam, a torch on each post.
    void lightCol;
    for (const side of [1, -1]) {
      const head = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 5), postMat);
      head.position.set(0, 132, side * (span / 2 + 6)); head.rotation.x = side * 0.5;
      gantry.add(head);
      const torch = new THREE.Mesh(new THREE.SphereGeometry(5, 6, 5), basic({ color: 0xffb45a }));
      torch.position.set(-8, 100, side * span / 2);
      gantry.add(torch);
    }
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 2, 12), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xa8342a : 0xd8ccb4 }));
      shield.rotation.z = Math.PI / 2;
      shield.position.set(-7, 108, k * span / 8);
      gantry.add(shield);
    }
    if (at === 0) {
      // Three fire bowls on the beam: the starting lights.
      const iron = new THREE.MeshLambertMaterial({ color: 0x2e2b28 });
      for (let k = -1; k <= 1; k++) {
        const bowl = new THREE.Group();
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(11, 6, 9, 8), iron);
        bowl.add(cup);
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 10, 5), iron);
        legs.position.y = -8; bowl.add(legs);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const fire = new THREE.Mesh(new THREE.ConeGeometry(9, 26, 6).translate(0, 13, 0), mat);
        fire.position.y = 3;
        const core = new THREE.Mesh(new THREE.ConeGeometry(5, 15, 5).translate(0, 7.5, 0), basic({ color: 0xffe2a0 }));
        fire.add(core);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.position.y = 12;
        bowl.add(fire, glow);
        bowl.position.set(0, 140, k * 44);
        gantry.add(bowl);
        braziers.push({ fire, mat, glow });
      }
    }
    const sign = textPlane(text, '#f1e6d0', 150, 22, '#5a3f2a');
    sign.geometry.rotateX(Math.PI / 2).rotateY(Math.PI / 2);   // stand it up, facing the oncoming dragons
    sign.position.set(-6.5, 120, 0);
    gantry.add(bothWays(sign));
    gantry.position.set(p.x, 0, p.y);
    gantry.rotation.y = -dir;
    group.add(gantry);
  };
  lineAt(0, track.open ? 'START' : 'SKYFOLD');
  if (track.open) lineAt(track.finishIndex, 'FINISH');

  // Scenery props: built from simple shapes, then turned into voxels (all of them in two instanced
  // meshes for the whole map); moving parts, signs and see-through effects stay as they are.
  const spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[] = [];
  const sc = sceneryFor(track);
  const voxels = MAP_STYLE === 'folded' ? new PropFolds() : new PropVoxels();
  for (const p of [...sc.props, ...sc.overlays]) {
    const obj = propObject(p, spinners, atmos, theme.wall);
    if (!obj) continue;
    voxels.absorb(obj, spinners.map((sp) => sp.obj));
    group.add(obj);
  }
  for (const mesh of voxels.build()) group.add(mesh);

  // Gates over the course: carved timber arches, a band of the realm's rune-light inside.
  {
    const gateMat = new THREE.MeshLambertMaterial({ color: 0x5a3f2a });
    const lineMat = additive({ color: theme.wall, opacity: 0.5 });
    const span = WALL_DIST + 10;
    const gates = track.open ? atmos.gates * 3 : atmos.gates;
    for (let k = 1; k <= gates; k++) {
      let i = Math.floor((k / (gates + 1)) * (track.open ? track.finishIndex : m));
      while (track.island[i] > 0 && i < m - 1) i++;
      const p = pts[i], dir = track.direction(i);
      const gate = new THREE.Group();
      gate.add(new THREE.Mesh(new THREE.TorusGeometry(span, 8, 5, 14, Math.PI), gateMat));   // few segments: hewn, not machined
      for (const side of [1, -1]) {
        const head = new THREE.Mesh(new THREE.ConeGeometry(7, 34, 5), gateMat);
        head.position.set(side * span, 14, 0); head.rotation.z = side * 0.6;
        gate.add(head);
      }
      gate.add(new THREE.Mesh(new THREE.TorusGeometry(span - 7, 1.6, 6, 48, Math.PI), lineMat));
      gate.position.set(p.x, 0, p.y);
      gate.rotation.y = -dir + Math.PI / 2;   // the arch stands across the road
      group.add(gate);
    }
  }

  // Sky: a smooth gradient dome (zenith to horizon), the sun low in it, and stars only where it's dark.
  const follow = track.open;
  const cx = follow ? 0 : (b.minX + b.maxX) / 2, cz = follow ? 0 : (b.minY + b.maxY) / 2;
  const skyParts: THREE.Object3D[] = [];
  const skyTex = canvas2d(4, 256, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 256);
    // The chase camera mostly sees the lowest part of the dome, so the middle colour sits low.
    v.addColorStop(0, atmos.sky[0]); v.addColorStop(0.8, atmos.sky[1]); v.addColorStop(1, atmos.sky[2]);
    g.fillStyle = v; g.fillRect(0, 0, 4, 256);
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex(skyTex, false), side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.position.set(cx, -40, cz);
  dome.renderOrder = -2;
  group.add(dome);
  skyParts.push(dome);
  {
    // The sun: a soft disc with a wide glow, sitting in the sky in the light's direction.
    const sunTex = canvas2d(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.16, 'rgba(255,255,255,0.95)');
      r.addColorStop(0.22, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(sunTex, false), color: atmos.sun.color, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const R = 9200, e = atmos.sun.elev, az = atmos.sun.azim;
    sun.position.set(cx + Math.cos(az) * Math.cos(e) * R, Math.sin(e) * R + 80, cz + Math.sin(az) * Math.cos(e) * R);
    sun.scale.setScalar(atmos.sun.size * 6);
    sun.renderOrder = -1;
    group.add(sun);
    skyParts.push(sun);
  }
  if (atmos.stars) {
    const star: number[] = [];
    for (let k = 0; k < atmos.stars; k++) {
      const a = Math.random() * Math.PI * 2, e = 0.35 + Math.random() * 1.1;
      star.push(cx + Math.cos(a) * Math.cos(e) * 9000, Math.sin(e) * 9000, cz + Math.sin(a) * Math.cos(e) * 9000);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(star, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe6ecff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    group.add(stars);
    skyParts.push(stars);
  }
  const ring = skyline(atmos, cx, cz, follow ? 7600 : Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + 4800);
  group.add(ring);
  skyParts.push(ring);
  // On a point-to-point map the sky moves as one piece with the camera.
  const skyGroup = new THREE.Group();
  if (follow) { for (const part of skyParts) { group.remove(part); skyGroup.add(part); } group.add(skyGroup); }
  const aurora = atmos.aurora ? auroraCurtains(0, 0) : null;
  if (aurora) group.add(aurora.group);
  const storm = atmos.lightning ? lightningStorm(0, 0) : null;
  if (storm) group.add(storm.group);

  const water = groundMoves(track);
  return {
    track, group, atmos, flash: 0,
    skyFollow: [aurora?.group, storm?.group, follow ? skyGroup : null].filter((o): o is THREE.Group => !!o),
    animate(time: number, goIn?: number) {
      aurora?.animate(time);
      lightBraziers(time, goIn);
      if (storm) this.flash = storm.animate(time);
      pulseTex.offset.y = -(time * 1100) / 376;
      lampMat.opacity = 0.72 + 0.16 * Math.sin(time * 9) + 0.12 * Math.sin(time * 23.7);   // torch flicker
      torchMat.opacity = 0.75 + 0.15 * Math.sin(time * 11) + 0.1 * Math.sin(time * 27.3);
      chevTex.offset.y = -time * 0.35 * 9;
      for (const t2 of stripTex) t2.offset.y = -time * (t2.userData.speed as number);
      if (water) groundTex.offset.set(-(time * 18) / 512, (time * 7) / 512);
      for (const s of spinners) s.obj.rotation[s.axis] = time * s.rate;
    },
  };
}

/**
 * Northern lights: three tall curtains in green, teal and violet, rippling slowly across the sky.
 * Each is a strip along an arc whose vertices sway every frame; the texture gives the rays.
 */
function auroraCurtains(cx: number, cz: number): { group: THREE.Group; animate(time: number): void } {
  const group = new THREE.Group();
  // Rays: broad vertical bands of varying strength over a glow that is brightest near the bottom edge.
  const rays = canvas2d(64, 128, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.35, 'rgba(255,255,255,0.3)'); v.addColorStop(0.82, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = v;
    for (let x = 0; x < 64; x += 4) { g.globalAlpha = 0.2 + Math.random() * 0.8; g.fillRect(x, 0, 4, 128); }
  });
  const tex = new THREE.CanvasTexture(rays);
  tex.wrapS = THREE.RepeatWrapping;
  const curtains: { geo: THREE.BufferGeometry; R: number; a0: number; k: number }[] = [];
  const N = 90;
  [['#5dffb0', 0, 4300], ['#4fe3ff', 1, 4900], ['#b98cff', 2, 5500]].forEach(([color, k, R]) => {
    const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      uv.set([i / N * 6, 0, i / N * 6, 1], i * 4);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    // (Colour pushed past 1 so the additive glow reads strongly against the night sky.)
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color as string).multiplyScalar(2.4), transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    group.add(mesh);
    curtains.push({ geo, R: R as number, a0: 0.4 + (k as number) * 2.1, k: k as number });
  });
  return {
    group,
    animate(time: number) {
      tex.offset.x = time * 0.015;
      for (const c of curtains) {
        const pos = c.geo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i <= N; i++) {
          const a = c.a0 + (i / N) * 1.9;
          const r = c.R + Math.sin(i * 0.17 + time * 0.35 + c.k * 2) * 420 + Math.sin(i * 0.05 - time * 0.2) * 300;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          const lift = Math.sin(i * 0.11 + time * 0.25 + c.k) * 220;
          pos.setXYZ(2 * i, x, 1200 + lift, z);
          pos.setXYZ(2 * i + 1, x, 3600 + lift * 1.6, z);
        }
        pos.needsUpdate = true;
      }
    },
  };
}

/**
 * A storm: every few seconds a jagged bolt strikes somewhere on the horizon with a double flicker;
 * animate() returns the flash strength (0..1) so the scene's light can jump with it.
 */
function lightningStorm(cx: number, cz: number): { group: THREE.Group; animate(time: number): number } {
  const group = new THREE.Group();
  const SEG = 14;
  const pos = new Float32Array(SEG * 2 * 3 * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xe8dcff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const bolt = new THREE.LineSegments(geo, mat);
  bolt.frustumCulled = false;
  group.add(bolt);
  let next = 2, struck = -10;
  const strike = () => {
    const a = Math.random() * Math.PI * 2, r = 5200 + Math.random() * 2000;
    let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = 3600;
    let n = 0;
    const push = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => { pos.set([x1, y1, z1, x2, y2, z2], n * 6); n++; };
    for (let k = 0; k < SEG; k++) {
      const nx = x + (Math.random() - 0.5) * 380, ny = y - 3600 / SEG, nz = z + (Math.random() - 0.5) * 380;
      push(x, y, z, nx, ny, nz);
      if (k % 4 === 2) push(nx, ny, nz, nx + (Math.random() - 0.5) * 600, ny - 300, nz + (Math.random() - 0.5) * 600);
      else push(nx, ny, nz, nx, ny, nz);
      x = nx; y = ny; z = nz;
    }
    geo.getAttribute('position').needsUpdate = true;
  };
  return {
    group,
    animate(time: number) {
      if (time < struck) { struck = -10; next = time + 2; }   // a new race restarted the clock
      if (time >= next) { strike(); struck = time; next = time + 2.5 + Math.random() * 5; }
      const t = time - struck;
      // Two quick pulses, then a fade.
      const flash = t < 0 || t > 1 ? 0 : Math.exp(-t * 7) * (t < 0.08 || (t > 0.16 && t < 0.3) ? 1 : 0.35);
      mat.opacity = Math.min(1, flash * 1.4);
      return flash;
    },
  };
}

/**
 * A quiet ring of silhouettes on the horizon: towers, a city, peaks, dunes, mesas or a cloud
 * bank. One instanced shape, flat colour, no fog, so it reads as distant and doesn't compete.
 */
function skyline(a: Atmos, cx: number, cz: number, radius: number): THREE.Object3D {
  const n = a.skyline === 'city' ? 150 : a.skyline === 'towers' ? 44 : a.skyline === 'clouds' ? 60 : 46;
  const geo = a.skyline === 'peaks' ? new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0)
    : a.skyline === 'dunes' || a.skyline === 'clouds' ? new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    : a.skyline === 'mesas' ? new THREE.CylinderGeometry(0.85, 1, 1, 9).translate(0, 0.5, 0)
    : new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Atmospheric perspective: the silhouettes take on some of the horizon's colour.
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(a.skylineColor).lerp(new THREE.Color(a.sky[2]), 0.3), fog: false });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + rand() * 0.04;
    const r = radius * (1 + rand() * 0.25);
    pos.set(cx + Math.cos(ang) * r, -20, cz + Math.sin(ang) * r);
    switch (a.skyline) {
      case 'towers': scl.set(60 + rand() * 70, 300 + rand() * (rand() < 0.3 ? 1300 : 600), 60 + rand() * 70); break;
      case 'city': scl.set(120 + rand() * 200, 150 + rand() * (rand() < 0.2 ? 900 : 380), 120 + rand() * 200); break;
      case 'peaks': scl.set(700 + rand() * 900, 600 + rand() * 1100, 700 + rand() * 900); break;
      case 'dunes': scl.set(900 + rand() * 900, 120 + rand() * 160, 600 + rand() * 600); break;
      case 'mesas': scl.set(400 + rand() * 600, 260 + rand() * 420, 400 + rand() * 600); break;
      case 'clouds': scl.set(900 + rand() * 900, 140 + rand() * 120, 700 + rand() * 700); pos.y = -60; break;
    }
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    m4.compose(pos, q, scl);
    inst.setMatrixAt(k, m4);
  }
  inst.renderOrder = -1;
  return inst;
}

/** Wall faces map the full texture height from top to bottom. */
function wallUv(m: number): THREE.Float32BufferAttribute {
  const uv: number[] = [];
  for (let i = 0; i <= m; i++) uv.push(0.5, 1, 0.5, 0);
  return new THREE.Float32BufferAttribute(uv, 2);
}

/** The ground glow fades from the wall outward. */
function glowUv(m: number): THREE.Float32BufferAttribute {
  const uv: number[] = [];
  for (let i = 0; i <= m; i++) uv.push(0, 0.5, 1, 0.5);
  return new THREE.Float32BufferAttribute(uv, 2);
}

// --- scenery ---------------------------------------------------------------------------------------

const MARBLE = 0xefe8da, MARBLE_SH = 0xd8cfbd, GOLD_C = 0xd9b25b, SEA_GLASS = 0x2a8f9a, SANDSTONE = 0xd8b07a, SANDSTONE_LT = 0xe6c690, PATINA = 0x5fa89a;

function propObject(p: Prop, spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[], atmos: Atmos, accent: string): THREE.Object3D | null {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.y);
  g.rotation.y = -(p.rot ?? 0);
  const phong = (color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000) => new THREE.MeshPhongMaterial({ color, emissive, flatShading: true });
  const glowing = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color });
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const w = p.w ?? p.r * 1.6, d = p.d ?? p.r * 1.6, h = Math.max(4, p.h);
  switch (p.kind) {
    case 'pine': case 'pine-snow': {
      put(new THREE.CylinderGeometry(3, 4, 14, 6), phong(0x4a3424), 0, 7);
      put(new THREE.ConeGeometry(p.r * 0.75, p.r * 2.4, 7), phong(0x1f5a3c), 0, 14 + p.r * 1.2);
      if (p.kind === 'pine-snow') put(new THREE.ConeGeometry(p.r * 0.4, p.r * 1.1, 7), phong(0xeef4ff), 0, 14 + p.r * 1.95);
      break;
    }
    case 'rock':
      put(new THREE.DodecahedronGeometry(p.r * 0.7, 0), phong(p.color ?? 0x5a5c6e), 0, p.r * 0.2).scale.set(1, 0.55, 1);
      break;
    case 'peak': {
      const col = p.color === 'violet' ? 0x5b3b8c : p.color === 'snow' ? 0xc8d6e6 : 0x4a4f66;
      put(new THREE.ConeGeometry(p.r, h * 2.2, 7), phong(col), 0, h * 1.1);
      put(new THREE.ConeGeometry(p.r * 0.34, h * 0.75, 7), phong(p.color === 'violet' ? 0xd7b8ff : 0xf2f6ff), 0, h * 1.85);
      break;
    }
    case 'pyramid':
      put(new THREE.ConeGeometry(p.r, h, 4), phong(0xc99a5b), 0, h / 2).rotation.y = Math.PI / 4;
      break;
    case 'crystal':
      put(new THREE.OctahedronGeometry(p.r * 0.5, 0), new THREE.MeshPhongMaterial({ color: p.color ?? 0xb48cff, emissive: p.color ?? 0x6a3cff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, flatShading: true }), 0, h * 0.6).scale.set(1, h / p.r * 1.4, 1);
      break;
    case 'floodlight': {
      put(new THREE.CylinderGeometry(2.5, 3.5, h, 6), phong(0x3a4060), 0, h / 2);
      put(new THREE.BoxGeometry(26, 8, 14), glowing(0xfff6d8), 0, h + 4);
      break;
    }
    case 'building': case 'skyscraper': case 'container': case 'grandstand': {
      const tall = p.kind === 'skyscraper' || p.kind === 'building';
      const body = put(new THREE.BoxGeometry(w, h, d), tall ? windowsMaterial(p.color ?? '#20253d', atmos.windows, w, h)
        : phong(p.color ?? (p.kind === 'grandstand' ? 0xdfe4ee : 0x8a3b3b)), 0, h / 2);
      if (p.kind === 'grandstand') {
        // Clean tiers with a single soft accent line along the front edge.
        for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(w * 0.98, 2, d * 0.22), phong(0xe9edf5), 0, h * (0.3 + k * 0.18), -d * 0.3 + k * d * 0.2);
        put(new THREE.BoxGeometry(w * 0.98, 1.6, 1.6), glowing(accent), 0, h * 0.3 + 1.5, -d * 0.3 - d * 0.11);
      }
      // One accent for the whole skyline: every roof trim in the track's colour.
      if (p.accent) put(new THREE.BoxGeometry(w + 2, 3, d + 2), glowing(accent), 0, h + 1.5);
      if (p.text) {
        const sign = textPlane(p.text, '#ffffff', Math.min(w * 0.8, 260), 34, p.accent ?? '#4fe3ff');
        sign.geometry.rotateX(Math.PI / 2);
        sign.position.set(0, h * 0.6, d / 2 + 1);
        g.add(sign);
      }
      void body;
      break;
    }
    case 'billboard': case 'scoreboard': {
      const pw = p.w ?? 240, ph = p.kind === 'scoreboard' ? 90 : 60;
      for (const s of [-1, 1]) put(new THREE.BoxGeometry(5, h, 5), phong(0x30365a), s * pw * 0.35, h / 2);
      const sign = textPlane(p.text ?? '', '#ffffff', pw, ph, p.accent ?? '#4fe3ff');
      sign.geometry.rotateX(Math.PI / 2);
      sign.position.set(0, h + ph / 2, 0);
      g.add(bothWays(sign));
      spinners.push({ obj: sign, axis: 'y', rate: p.kind === 'scoreboard' ? 0.25 : 0 });
      break;
    }
    case 'lighthouse': {
      const tower = new THREE.CylinderGeometry(p.r * 0.16, p.r * 0.26, h * 0.6, 14);
      put(tower, phong(0xf2f2f2), 0, h * 0.3);
      for (let k = 0; k < 3; k++) put(new THREE.CylinderGeometry(p.r * 0.2 - k * 2, p.r * 0.22 - k * 2, 18, 14), phong(0xd8364a), 0, h * (0.1 + k * 0.17));
      put(new THREE.SphereGeometry(p.r * 0.14, 12, 8), glowing(0xfff3b0), 0, h * 0.63);
      break;
    }
    case 'beam': {
      const beam = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(220, 1600, 24, 1, true).translate(0, -800, 0).rotateZ(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      beam.add(cone);
      beam.position.y = h * 0.63;
      g.add(beam);
      spinners.push({ obj: beam, axis: 'y', rate: 0.6 });
      break;
    }
    case 'blimp': {
      const orbit = new THREE.Group();
      const blimp = new THREE.Group();
      blimp.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12).scale(130, 40, 40), phong(0xe8ecff)));
      const sign = textPlane(p.text ?? 'APEX', '#ff3d6e', 150, 30);
      sign.geometry.rotateX(Math.PI / 2);
      sign.position.z = 41;
      blimp.add(sign);
      blimp.position.set(p.r * 0.6, 520, 0);
      orbit.add(blimp);
      g.add(orbit);
      spinners.push({ obj: orbit, axis: 'y', rate: 0.05 });
      break;
    }
    case 'turbine': {
      put(new THREE.CylinderGeometry(3, 6, h, 8), phong(0xe8e8f0), 0, h / 2);
      const rotor = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(4, 90, 2).translate(0, 45, 0), phong(0xf4f4fa));
        blade.rotation.z = (k / 3) * Math.PI * 2;
        rotor.add(blade);
      }
      rotor.position.set(0, h, 6);
      g.add(rotor);
      spinners.push({ obj: rotor, axis: 'z', rate: 1.2 + (p.seed % 1) });
      break;
    }
    case 'crane': {
      put(new THREE.BoxGeometry(14, h, 14), phong(0xf2b233), 0, h / 2);
      put(new THREE.BoxGeometry(220, 10, 10), phong(0xf2b233), 60, h);
      break;
    }
    case 'solar':
      put(new THREE.BoxGeometry(w, 3, d), phong(0x1b2c66, 0x0a1440), 0, 8).rotation.x = 0.35;
      break;
    case 'pier':
      put(new THREE.BoxGeometry(w, 4, d), phong(0x3a3f52), 0, 1);
      break;
    case 'helipad': {
      put(new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.8, 2, 32), phong(0x2a2f44), 0, 1);
      const hmark = textPlane('H', '#ffffff', 60, 60);
      hmark.position.y = 2.2;
      g.add(hmark);
      break;
    }
    case 'boat':
      put(new THREE.BoxGeometry(110, 14, 34), phong(0xe9edf6), 0, 6);
      put(new THREE.BoxGeometry(40, 12, 24), phong(p.accent ?? 0x3fd0ff), -10, 19);
      break;
    // --- arenas -------------------------------------------------------------------------------------
    case 'arena-stand': {
      // Marble tiers rising away from the track, a gold canopy on gold pillars, a neon edge.
      for (let k = 0; k < 4; k++) {
        const dd = d * (1 - k * 0.22);
        put(new THREE.BoxGeometry(w, h * 0.24, dd), phong(k % 2 ? MARBLE_SH : MARBLE), 0, h * 0.12 + k * h * 0.24, d / 2 - dd / 2);
      }
      for (const x of [-w * 0.42, w * 0.42]) put(new THREE.BoxGeometry(14, h * 1.25, 14), phong(GOLD_C), x, h * 0.62, d * 0.42);
      put(new THREE.BoxGeometry(w * 1.02, 8, d * 0.62), phong(GOLD_C), 0, h * 1.25, d * 0.18);
      put(new THREE.BoxGeometry(w, 6, 6), glowing(accent), 0, h * 0.24, -d / 2 - 2);
      break;
    }
    case 'pylon':
      put(new THREE.CylinderGeometry(8, 11, h, 6), phong(MARBLE), 0, h / 2);
      put(new THREE.CylinderGeometry(15, 15, 12, 6), glowing('#dff8ff'), 0, h + 6);
      put(new THREE.ConeGeometry(14, 30, 6), phong(GOLD_C), 0, h + 27);
      break;
    case 'pit-palace': {
      put(new THREE.BoxGeometry(w, h * 0.7, d), phong(MARBLE), 0, h * 0.35);
      for (let x = -w / 2 + 20; x <= w / 2 - 20; x += 40) put(new THREE.CylinderGeometry(9, 10, h * 0.62, 8), phong(MARBLE_SH), x, h * 0.31, -d / 2 - 14);
      put(new THREE.BoxGeometry(w + 20, 12, d + 36), phong(GOLD_C), 0, h * 0.7 + 6, -9);
      put(new THREE.SphereGeometry(d * 0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), phong(SEA_GLASS, 0x0c3a40), 0, h * 0.7 + 12);
      put(new THREE.ConeGeometry(10, 34, 8), phong(GOLD_C), 0, h * 0.7 + 12 + d * 0.42 + 14);
      put(new THREE.BoxGeometry(w, 6, 6), glowing(accent), 0, h * 0.68, -d / 2 - 22);
      break;
    }
    case 'holo': {
      const pw = p.w ?? 220, ph = 64;
      for (const sx of [-1, 1]) put(new THREE.BoxGeometry(12, h, 12), phong(GOLD_C), sx * pw * 0.42, h / 2);
      put(new THREE.BoxGeometry(pw + 16, ph + 16, 8), glowing(SEA_GLASS), 0, h + ph / 2);
      const sign = textPlane(p.text ?? '', '#ffffff', pw, ph, accent);
      sign.geometry.rotateX(Math.PI / 2);
      sign.position.set(0, h + ph / 2, 0);
      g.add(bothWays(sign));
      break;
    }
    case 'monument': {
      put(new THREE.BoxGeometry(150, 30, 150), phong(MARBLE_SH), 0, 15);
      put(new THREE.BoxGeometry(110, 30, 110), phong(MARBLE), 0, 45);
      put(new THREE.CylinderGeometry(20, 24, h * 0.62, 8), phong(MARBLE), 0, 60 + h * 0.31);
      put(new THREE.SphereGeometry(40, 16, 12), phong(GOLD_C, 0x3a2a08), 0, 60 + h * 0.62 + 34);
      for (const [x, z] of [[-48, -48], [48, -48], [-48, 48], [48, 48]]) {
        put(new THREE.CylinderGeometry(10, 12, h * 0.4, 8), phong(MARBLE), x, 60 + h * 0.2, z);
        put(new THREE.ConeGeometry(14, 24, 8), phong(GOLD_C), x, 60 + h * 0.4 + 12, z);
      }
      break;
    }
    case 'cypress':
      put(new THREE.CylinderGeometry(4, 5, 14, 6), phong(0x4a3424), 0, 7);
      put(new THREE.ConeGeometry(p.r * 0.9, h, 7), phong(0x2a5a38), 0, 12 + h / 2);
      break;
    case 'colosseum': {
      // An arcade three storeys high: chunky piers, arch lintels, a gold cornice on top.
      const tier = h / 3, depth = d;
      for (let t = 0; t < 3; t++) {
        const y0 = t * tier;
        for (let k = 0; k <= 4; k++) put(new THREE.BoxGeometry(20, tier - 12, depth), phong(t % 2 ? MARBLE_SH : MARBLE), -w / 2 + 10 + k * (w - 20) / 4, y0 + (tier - 12) / 2, 0);
        put(new THREE.BoxGeometry(w, 12, depth), phong(MARBLE), 0, y0 + tier - 6, 0);
      }
      put(new THREE.BoxGeometry(w + 6, 10, depth + 6), phong(GOLD_C), 0, h + 5, 0);
      break;
    }
    case 'obelisk': {
      const r = p.r;
      put(new THREE.BoxGeometry(r * 2.4, h * 0.05, r * 2.4), phong(MARBLE_SH), 0, h * 0.025);
      put(new THREE.CylinderGeometry(r * 0.62, r, h * 0.86, 4), phong(SANDSTONE), 0, h * 0.05 + h * 0.43).rotation.y = Math.PI / 4;
      put(new THREE.ConeGeometry(r * 0.88, h * 0.1, 4), phong(GOLD_C, 0x3a2a08), 0, h * 0.91 + h * 0.05).rotation.y = Math.PI / 4;
      for (const f of [0.3, 0.55]) {
        const rr = r * (1 - f * 0.38) + 1;
        put(new THREE.CylinderGeometry(rr, rr, h * 0.05, 4), glowing(p.accent ?? accent), 0, h * 0.05 + h * 0.86 * f).rotation.y = Math.PI / 4;
      }
      break;
    }
    case 'statue': {
      // A guardian on a pedestal: robed body, head under a gold headdress, a gold staff.
      put(new THREE.BoxGeometry(p.r * 1.8, h * 0.22, p.r * 1.8), phong(MARBLE_SH), 0, h * 0.11);
      const stone = p.color ?? MARBLE;
      put(new THREE.CylinderGeometry(p.r * 0.45, p.r * 0.75, h * 0.48, 8), phong(stone), 0, h * 0.22 + h * 0.24);
      put(new THREE.SphereGeometry(p.r * 0.32, 10, 8), phong(stone), 0, h * 0.7 + p.r * 0.28);
      put(new THREE.ConeGeometry(p.r * 0.46, h * 0.18, 6), phong(GOLD_C), 0, h * 0.7 + p.r * 0.55);
      put(new THREE.CylinderGeometry(5, 5, h * 0.7, 6), phong(GOLD_C), p.r * 0.6, h * 0.22 + h * 0.35);
      break;
    }
    // --- New York ----------------------------------------------------------------------------------
    case 'colossus': {
      const r = p.r;
      put(new THREE.BoxGeometry(r * 1.7, h * 0.22, r * 1.7), phong(MARBLE_SH), 0, h * 0.11);
      put(new THREE.BoxGeometry(r * 1.3, h * 0.06, r * 1.3), phong(GOLD_C), 0, h * 0.25);
      put(new THREE.ConeGeometry(r * 0.62, h * 0.5, 8), phong(PATINA), 0, h * 0.28 + h * 0.25);
      put(new THREE.SphereGeometry(r * 0.2, 12, 8), phong(PATINA), 0, h * 0.78 + r * 0.1);
      for (let k = 0; k < 5; k++) {
        const a = -0.9 + k * 0.45;
        put(new THREE.ConeGeometry(r * 0.07, r * 0.32, 4), phong(GOLD_C), Math.sin(a) * r * 0.22, h * 0.78 + r * 0.42, Math.cos(a) * r * 0.05).rotation.z = -a * 0.6;
      }
      const arm = put(new THREE.CylinderGeometry(r * 0.08, r * 0.1, h * 0.26, 6), phong(PATINA), r * 0.32, h * 0.82, 0);
      arm.rotation.z = -0.35;
      put(new THREE.CylinderGeometry(r * 0.12, r * 0.08, h * 0.06, 8), phong(GOLD_C), r * 0.4, h * 0.97, 0);
      put(new THREE.SphereGeometry(r * 0.14, 10, 8), glowing('#ffcf6a'), r * 0.4, h * 1.03, 0);
      break;
    }
    case 'deco-tower': {
      // Setback tiers lit in rows of gold windows, a gold crown and spire.
      const base = p.color ?? '#1c2a44';
      put(new THREE.BoxGeometry(w, h * 0.55, d), windowsMaterial(base, atmos.windows, w, h * 0.55), 0, h * 0.275);
      put(new THREE.BoxGeometry(w * 0.74, h * 0.24, d * 0.74), windowsMaterial(base, atmos.windows, w * 0.74, h * 0.24), 0, h * 0.55 + h * 0.12);
      put(new THREE.BoxGeometry(w * 0.5, h * 0.11, d * 0.5), windowsMaterial(base, atmos.windows, w * 0.5, h * 0.11), 0, h * 0.79 + h * 0.055);
      put(new THREE.ConeGeometry(w * 0.3, h * 0.1, 8), phong(GOLD_C, 0x3a2a08), 0, h * 0.9 + h * 0.05);
      put(new THREE.CylinderGeometry(6, 9, h * 0.12, 6), phong(GOLD_C), 0, h * 1.0 + h * 0.06);
      break;
    }
    case 'park': {
      put(new THREE.BoxGeometry(w, 8, d), phong(0x4f8a4a), 0, 4);
      put(new THREE.BoxGeometry(w + 10, 4, d + 10), phong(MARBLE_SH), 0, 2);
      for (let k = 0; k < 6; k++) {
        const x = (k % 3 - 1) * w * 0.3, z = (k < 3 ? -1 : 1) * d * 0.22;
        put(new THREE.ConeGeometry(22, 60, 7), phong(0x2f6a3c), x, 8 + 30, z);
      }
      break;
    }
    case 'rail': {
      const pw = p.w ?? 150;
      for (const sx of [-1, 1]) put(new THREE.BoxGeometry(18, h, 18), phong(MARBLE_SH), sx * pw * 0.32, h / 2);
      put(new THREE.BoxGeometry(pw, 18, 34), phong(0x3a3f4e), 0, h + 9);
      put(new THREE.BoxGeometry(pw, 5, 36), glowing(accent), 0, h + 1);
      break;
    }
    case 'steam':
      put(new THREE.CylinderGeometry(p.r * 1.6, p.r, h, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }), 0, h / 2);
      break;
    // --- Lappland ----------------------------------------------------------------------------------
    case 'birch':
      put(new THREE.CylinderGeometry(5, 6, h * 0.9, 6), phong(0xf2f0ea), 0, h * 0.45);
      put(new THREE.SphereGeometry(p.r * 0.8, 8, 6), phong(0xdde8e6), 0, h * 0.85);
      break;
    case 'ice':
      put(new THREE.OctahedronGeometry(p.r, 0), new THREE.MeshPhongMaterial({ color: 0xbfe8ff, emissive: 0x2a6a8a, transparent: true, opacity: 0.85, flatShading: true }), 0, h * 0.5)
        .scale.set(1, h / p.r * 0.55, 1);
      break;
    case 'lavvu': {
      put(new THREE.ConeGeometry(p.r, h, 8), phong(0xe8dcc6), 0, h / 2);
      put(new THREE.CylinderGeometry(p.r * 0.18, p.r * 0.24, h * 0.1, 8), phong(GOLD_C), 0, h * 0.9);
      put(new THREE.BoxGeometry(p.r * 0.5, h * 0.36, 10), glowing('#ffc070'), 0, h * 0.18, p.r * 0.6);
      break;
    }
    case 'reindeer': {
      const fur = phong(0x6b5240), pale = phong(0xd8c8a8);
      put(new THREE.BoxGeometry(36, 16, 14), fur, 0, 26);
      for (const [x, z] of [[-13, -5], [13, -5], [-13, 5], [13, 5]]) put(new THREE.BoxGeometry(6, 18, 6), fur, x, 9, z);
      put(new THREE.BoxGeometry(10, 18, 9), fur, 18, 38).rotation.z = -0.4;
      put(new THREE.BoxGeometry(16, 9, 9), pale, 26, 46);
      for (const z of [-6, 6]) put(new THREE.BoxGeometry(6, 16, 4), pale, 22, 58, z);
      break;
    }
    // --- New Atlantis --------------------------------------------------------------------------------
    case 'isle':
      put(new THREE.CylinderGeometry(p.r, p.r * 1.06, 12, 16), phong(MARBLE), 0, 6);
      put(new THREE.CylinderGeometry(p.r * 1.08, p.r * 1.12, 4, 16), phong(GOLD_C), 0, 2);
      break;
    case 'dome-temple': {
      const r = p.r;
      put(new THREE.CylinderGeometry(r, r * 1.05, 26, 12), phong(MARBLE_SH), 0, 12 + 13);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        put(new THREE.CylinderGeometry(r * 0.09, r * 0.1, 70, 8), phong(MARBLE), Math.cos(a) * r * 0.78, 38 + 35, Math.sin(a) * r * 0.78);
      }
      put(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 14, 12), phong(MARBLE), 0, 108 + 7);
      put(new THREE.SphereGeometry(r * 0.78, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), phong(SEA_GLASS, 0x0c3a40), 0, 122);
      put(new THREE.ConeGeometry(r * 0.12, 40, 8), phong(GOLD_C), 0, 122 + r * 0.78 + 14);
      break;
    }
    case 'sea-tower': {
      const r = p.r;
      put(new THREE.CylinderGeometry(r * 0.66, r, h, 8), phong(SEA_GLASS, 0x0a3a40), 0, 12 + h / 2);
      for (const f of [0.3, 0.6, 0.9]) put(new THREE.CylinderGeometry(r * (1 - f * 0.34) + 4, r * (1 - f * 0.34) + 4, h * 0.035, 8), phong(GOLD_C), 0, 12 + h * f);
      put(new THREE.ConeGeometry(r * 0.7, h * 0.16, 8), phong(GOLD_C, 0x3a2a08), 0, 12 + h + h * 0.08);
      put(new THREE.SphereGeometry(r * 0.22, 10, 8), glowing('#9ff0ff'), 0, 12 + h + h * 0.18);
      break;
    }
    case 'colonnade': {
      const cw = p.w ?? 240, depth = 46;
      put(new THREE.BoxGeometry(cw, 12, depth + 20), phong(MARBLE_SH), 0, 12 + 6);
      for (let x = -cw / 2 + 16; x <= cw / 2 - 16; x += (cw - 32) / 6) put(new THREE.CylinderGeometry(9, 10, h, 8), phong(MARBLE), x, 24 + h / 2, 0);
      put(new THREE.BoxGeometry(cw, 14, depth), phong(MARBLE), 0, 24 + h + 7);
      put(new THREE.BoxGeometry(cw + 4, 6, depth + 4), phong(GOLD_C), 0, 24 + h + 17);
      break;
    }
    case 'sea-glow':
      put(new THREE.SphereGeometry(p.r, 8, 6), glowing(p.seed % 1 < 0.5 ? '#5ff0e0' : '#7fb4ff'), 0, 2);
      break;
    case 'arch': {
      const aw = p.w ?? 150;
      for (const sx of [-1, 1]) put(new THREE.BoxGeometry(aw * 0.2, h, aw * 0.2), phong(MARBLE), sx * aw * 0.4, h / 2);
      put(new THREE.BoxGeometry(aw * 1.04, h * 0.18, aw * 0.22), phong(MARBLE_SH), 0, h + h * 0.09);
      put(new THREE.BoxGeometry(aw * 0.18, h * 0.12, aw * 0.24), phong(GOLD_C), 0, h - h * 0.02);
      break;
    }
    case 'spire': {
      // The lighthouse of New Atlantis: a slender ivory spire, gold bands, a crown of gold spikes.
      const r = p.r;
      put(new THREE.CylinderGeometry(r * 0.32, r * 0.42, h * 0.08, 12), phong(MARBLE_SH), 0, h * 0.04);
      put(new THREE.CylinderGeometry(r * 0.12, r * 0.24, h * 0.56, 10), phong(MARBLE), 0, h * 0.08 + h * 0.28);
      for (const f of [0.25, 0.45]) put(new THREE.CylinderGeometry(r * 0.24 - f * 0.12 * r + 3, r * 0.24 - f * 0.12 * r + 3, h * 0.025, 10), phong(GOLD_C), 0, h * 0.08 + h * 0.56 * f);
      put(new THREE.CylinderGeometry(r * 0.2, r * 0.13, h * 0.04, 10), phong(GOLD_C), 0, h * 0.62);
      put(new THREE.SphereGeometry(r * 0.13, 12, 8), glowing('#fff3b0'), 0, h * 0.67);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        put(new THREE.ConeGeometry(r * 0.04, h * 0.1, 4), phong(GOLD_C), Math.cos(a) * r * 0.17, h * 0.69, Math.sin(a) * r * 0.17);
      }
      break;
    }
    // --- Crystal Front -------------------------------------------------------------------------------
    case 'mech-wreck': {
      const metal = phong(0x4a4e5a), dark = phong(0x2a2c34), burn = glowing('#ff7a3a');
      const torso = put(new THREE.BoxGeometry(90, 70, 64), metal, 0, 34);
      torso.rotation.z = 0.45;
      put(new THREE.BoxGeometry(34, 30, 34), dark, 44, 70).rotation.z = 0.7;
      put(new THREE.BoxGeometry(120, 22, 22), metal, -50, 14, 46).rotation.y = 0.5;
      put(new THREE.BoxGeometry(26, 90, 26), dark, -30, 20, -50).rotation.z = 1.2;
      put(new THREE.BoxGeometry(14, 14, 66), burn, 6, 58);
      put(new THREE.BoxGeometry(10, 10, 10), burn, 40, 74, 18);
      break;
    }
    case 'dropship': {
      const hull = phong(0x5a6070), dark = phong(0x2c303c);
      const ship = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(x, y, z); ship.add(mm); return mm; };
      add(new THREE.BoxGeometry(240, 56, 100), hull, 0, 0, 0);
      add(new THREE.ConeGeometry(52, 100, 4), hull, 168, 0, 0).rotation.z = -Math.PI / 2;
      add(new THREE.BoxGeometry(110, 12, 300), dark, -30, -6, 0);
      for (const z of [-34, 34]) add(new THREE.CylinderGeometry(20, 24, 40, 8), dark, -134, 0, z).rotation.z = Math.PI / 2;
      for (const z of [-34, 34]) add(new THREE.CylinderGeometry(14, 14, 6, 8), glowing('#4fe3ff'), -156, 0, z).rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(60, 10, 40), glowing('#b98cff'), 60, 30, 0);
      ship.rotation.z = -0.22;
      ship.position.y = 30;
      g.add(ship);
      break;
    }
    case 'shield-dome': {
      put(new THREE.CylinderGeometry(p.r, p.r * 1.04, 10, 20), phong(0x3a3f4e), 0, 5);
      put(new THREE.SphereGeometry(p.r * 0.96, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 0, 10);
      put(new THREE.BoxGeometry(24, 60, 24), phong(0x2c303c), 0, 40);
      put(new THREE.SphereGeometry(14, 10, 8), glowing('#4fe3ff'), 0, 78);
      break;
    }
    case 'crater':
      put(new THREE.CylinderGeometry(p.r * 1.15, p.r * 1.2, 4, 14), phong(0x2a2432), 0, 2);
      put(new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.8, 6, 14), phong(0x0a080e), 0, 3);
      break;
    // --- Hieropolis ----------------------------------------------------------------------------------
    case 'ziggurat': {
      // A terraced pyramid arcology in sandstone and gold, a sea-glass apex glowing on top.
      const r = p.r, tiers = 5;
      for (let k = 0; k < tiers; k++) {
        const s2 = r * 2 * (1 - k * 0.17), th = h * 0.8 / tiers;
        put(new THREE.BoxGeometry(s2, th, s2), phong(k % 2 ? SANDSTONE : SANDSTONE_LT), 0, k * th + th / 2);
      }
      put(new THREE.BoxGeometry(r * 0.34, h * 0.8, r * 2 * 0.98), phong(GOLD_C), 0, h * 0.36);
      put(new THREE.OctahedronGeometry(r * 0.3, 0), phong(SEA_GLASS, 0x1a6a74), 0, h * 0.8 + r * 0.22);
      break;
    }
    case 'palm': {
      put(new THREE.CylinderGeometry(6, 9, h, 6), phong(0x8a6a44), 0, h / 2);
      for (let k = 0; k < 6; k++) {
        const frond = put(new THREE.BoxGeometry(56, 6, 16).translate(28, 0, 0), phong(0x3f8a4a), 0, h, 0);
        frond.rotation.set(0, (k / 6) * Math.PI * 2, -0.45);
      }
      break;
    }
    case 'pool':
      put(new THREE.BoxGeometry(w + 16, 3, d + 16), phong(GOLD_C), 0, 1.5);
      put(new THREE.BoxGeometry(w, 4, d), phong(0x3fb8c4, 0x0f4a52), 0, 2.5);
      break;
    // --- Hanging Gardens -----------------------------------------------------------------------------
    case 'terrace': {
      // Stepped ivory terraces, each topped and wrapped with green, a waterfall down the front.
      const tiers = 3;
      for (let k = 0; k < tiers; k++) {
        const tw = w * (1 - k * 0.26), td = d * (1 - k * 0.26), th = h / tiers, y0 = k * th;
        put(new THREE.BoxGeometry(tw, th * 0.62, td), phong(MARBLE), 0, y0 + th * 0.31);
        put(new THREE.BoxGeometry(tw * 1.02, th * 0.38, td * 1.02), phong(k % 2 ? 0x4f8a4a : 0x5f9a52), 0, y0 + th * 0.62 + th * 0.19);
        put(new THREE.BoxGeometry(tw * 0.16, th, 12), glowing('#8fe8ff'), 0, y0 + th * 0.5, td / 2 + 6);
      }
      put(new THREE.ConeGeometry(w * 0.1, h * 0.2, 7), phong(0x2a5a38), 0, h + h * 0.1);
      break;
    }
    case 'gold-tower': {
      const r = p.r;
      put(new THREE.CylinderGeometry(r * 0.6, r * 0.8, h * 0.82, 8), phong(MARBLE), 0, h * 0.41);
      for (const f of [0.3, 0.6]) put(new THREE.CylinderGeometry(r * 0.74 - f * 0.2 * r + 2, r * 0.74 - f * 0.2 * r + 2, h * 0.04, 8), phong(GOLD_C), 0, h * 0.82 * f);
      put(new THREE.SphereGeometry(r * 0.66, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), phong(GOLD_C, 0x3a2a08), 0, h * 0.82);
      put(new THREE.ConeGeometry(r * 0.14, h * 0.12, 6), phong(GOLD_C), 0, h * 0.82 + r * 0.66 + h * 0.05);
      break;
    }
    // --- Fae Forest ------------------------------------------------------------------------------------
    // --- The Nine Realms: Norse props ----------------------------------------------------------------
    case 'longhouse': case 'mead-hall': {
      // A long timber hall under a steep turf (or, for the mead hall, gold-shingled) roof, with
      // crossed dragon-head gables at each end and a warm glow in the doorway.
      const hall = p.kind === 'mead-hall';
      const L2 = p.w ?? p.r * 2.2, W2 = p.d ?? p.r * 0.9, wallH = h * 0.38;
      put(new THREE.BoxGeometry(L2, wallH, W2), phong(0x5a3f2a), 0, wallH / 2);
      for (let x = -L2 / 2 + 10; x < L2 / 2; x += 22) put(new THREE.BoxGeometry(3, wallH, W2 + 1), phong(0x3e2a1c), x, wallH / 2);
      const roof = new THREE.CylinderGeometry(W2 * 0.78, W2 * 0.78, L2 * 1.04, 3, 1);
      roof.rotateZ(Math.PI / 2);
      const r3 = put(roof, phong(hall ? GOLD_C : 0x4f6a3a), 0, wallH + W2 * 0.36);
      r3.scale.set(1, 1.15, 1);
      for (const end of [-1, 1]) {
        for (const side of [-1, 1]) {
          const horn = put(new THREE.ConeGeometry(5, h * 0.32, 5), phong(hall ? GOLD_C : 0x3e2a1c), end * L2 * 0.52, wallH + W2 * 0.9, side * 7);
          horn.rotation.z = -end * 0.5; horn.rotation.x = side * 0.35;
        }
      }
      put(new THREE.BoxGeometry(2, wallH * 0.62, W2 * 0.3), glowing('#ffb45a'), L2 / 2 + 1, wallH * 0.31);
      if (hall) put(new THREE.BoxGeometry(L2 * 1.02, 3, W2 + 4), phong(GOLD_C), 0, wallH);
      break;
    }
    case 'runestone': {
      // A tall carved stone, its serpent band and runes cut in and painted red ochre, as the old
      // stones were (no glow: paint on weathered granite).
      const sw = p.r * 0.9, st = p.r * 0.35;
      put(new THREE.BoxGeometry(sw, h * 0.85, st), phong(0x7d7a74), 0, h * 0.425);
      put(new THREE.CylinderGeometry(sw / 2, sw / 2, st, 10, 1, false, 0, Math.PI), phong(0x7d7a74), 0, h * 0.85).rotation.set(Math.PI / 2, 0, Math.PI / 2);
      const ochre = phong(0x8e3a24), ink = phong(0x2e2a26);
      // The serpent band round the face: up both edges and arching over the top.
      put(new THREE.BoxGeometry(2.5, h * 0.62, st + 0.8), ochre, -sw * 0.36, h * 0.46);
      put(new THREE.BoxGeometry(2.5, h * 0.62, st + 0.8), ochre, sw * 0.36, h * 0.46);
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (0.1 + k * 0.2);
        put(new THREE.BoxGeometry(sw * 0.2, 2.5, st + 0.8), ochre, Math.cos(a) * sw * 0.36, h * 0.77 + Math.sin(a) * sw * 0.32).rotation.z = a + Math.PI / 2;
      }
      // A column of short carved runes down the middle.
      for (let k = 0; k < 4; k++) {
        const y = h * (0.22 + k * 0.13);
        put(new THREE.BoxGeometry(1.6, h * 0.08, st + 0.6), ink, 0, y);
        put(new THREE.BoxGeometry(sw * 0.14, 1.4, st + 0.6), ink, sw * 0.05, y + h * 0.02).rotation.z = k % 2 ? 0.6 : -0.6;
      }
      break;
    }
    case 'longship': {
      // A dragon-prowed longship: a lapstrake hull, a striped square sail and a row of shields.
      const L2 = p.w ?? p.r * 2.4, B = L2 * 0.22;
      const hull = put(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), phong(0x5a3a22), 0, h * 0.18);
      hull.scale.set(L2 / 2, h * 0.22, B / 2);
      put(new THREE.BoxGeometry(L2 * 0.92, 3, B * 0.92), phong(0x7a5434), 0, h * 0.18);
      for (const end of [-1, 1]) {
        const post = put(new THREE.CylinderGeometry(2, 4, h * 0.5, 6), phong(0x5a3a22), end * L2 * 0.48, h * 0.38);
        post.rotation.z = -end * 0.45;
      }
      put(new THREE.ConeGeometry(6, 18, 5), phong(GOLD_C), L2 * 0.6, h * 0.62).rotation.z = -1.2;
      put(new THREE.CylinderGeometry(2.5, 3, h * 1.1, 6), phong(0x4a3424), 0, h * 0.7);
      const sailMat = new THREE.MeshPhongMaterial({ color: 0xe8dcc4, flatShading: true, side: THREE.DoubleSide });
      const sail = put(new THREE.BoxGeometry(4, h * 0.6, L2 * 0.42), sailMat, 0, h * 0.85);
      void sail;
      for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(5, h * 0.08, L2 * 0.42), phong(0xa8342a), 0, h * (0.62 + k * 0.18));
      for (let x = -L2 * 0.36; x <= L2 * 0.36; x += L2 * 0.12) {
        for (const side of [-1, 1]) {
          const sh = put(new THREE.CylinderGeometry(6, 6, 2, 10), phong(x % 2 ? 0xa8342a : 0xd8ccb4), x, h * 0.3, side * B * 0.5);
          sh.rotation.x = Math.PI / 2;
        }
      }
      g.rotation.y += Math.PI / 2;
      break;
    }
    case 'burial-mound': {
      const mound = put(new THREE.SphereGeometry(p.r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), phong(0x4f6a3a), 0, 0);
      mound.scale.set(1, h / p.r, 1);
      put(new THREE.BoxGeometry(18, h * 0.5, 30), phong(0x7d7a74), p.r * 0.9, h * 0.25);
      put(new THREE.BoxGeometry(4, h * 0.36, 16), phong(0x15120f), p.r * 0.95, h * 0.2);   // the dark doorway into the barrow
      break;
    }
    case 'watchtower': {
      // Four timber legs, a lookout platform, a pitched roof and a brazier burning on top.
      const r = p.r;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.CylinderGeometry(3, 4, h, 6), phong(0x4a3424), x * r * 0.4, h / 2, z * r * 0.4);
      put(new THREE.BoxGeometry(r * 1.1, 6, r * 1.1), phong(0x5a3f2a), 0, h * 0.8);
      for (const [x, z, rx] of [[0, -1, 0], [0, 1, 0]] as const) put(new THREE.BoxGeometry(r * 1.1, 10, 3), phong(0x3e2a1c), x, h * 0.84, z * r * 0.55).rotation.x = rx;
      put(new THREE.ConeGeometry(r * 0.85, h * 0.3, 4), phong(0x4f6a3a), 0, h + h * 0.15).rotation.y = Math.PI / 4;
      put(new THREE.SphereGeometry(6, 6, 5), glowing('#ffb45a'), 0, h * 0.86);
      break;
    }
    case 'palisade': {
      // A run of sharpened logs.
      const ww = p.w ?? 180;
      for (let x = -ww / 2; x <= ww / 2; x += 11) {
        const lh = h * (0.85 + ((x * 7.3) % 1 + 1) % 1 * 0.2);
        put(new THREE.CylinderGeometry(5, 5.5, lh, 6), phong(0x5a3f2a), x, lh / 2);
        put(new THREE.ConeGeometry(5, 10, 6), phong(0x6b4c32), x, lh + 5);
      }
      break;
    }
    case 'brazier': {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = put(new THREE.CylinderGeometry(1.6, 1.6, h, 5), phong(0x2a2a2e), Math.cos(a) * 8, h / 2, Math.sin(a) * 8);
        leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
      }
      put(new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.4, 10, 8), phong(0x3a3a40), 0, h);
      put(new THREE.ConeGeometry(p.r * 0.55, p.r * 1.4, 6), glowing(p.accent ?? '#ff9a3d'), 0, h + 5 + p.r * 0.7);
      break;
    }
    case 'lava-rock': {
      put(new THREE.DodecahedronGeometry(p.r * 0.7, 0), phong(0x2a2422), 0, p.r * 0.25).scale.set(1, 0.6, 1);
      put(new THREE.DodecahedronGeometry(p.r * 0.5, 0), glowing('#ff6a2a'), 0, p.r * 0.1).scale.set(1.1, 0.25, 1.1);
      break;
    }
    case 'world-tree': {
      // Yggdrasil: a vast ash, its trunk a twist of roots, its crown in several tiers, roots glowing.
      put(new THREE.CylinderGeometry(p.r * 0.18, p.r * 0.36, h * 0.65, 9), phong(0x5a4636), 0, h * 0.325);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const root = put(new THREE.CylinderGeometry(p.r * 0.05, p.r * 0.11, p.r * 0.9, 6), phong(0x5a4636), Math.cos(a) * p.r * 0.4, p.r * 0.12, Math.sin(a) * p.r * 0.4);
        root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        put(new THREE.BoxGeometry(p.r * 0.5, 2, 4), glowing('#9fe8c0'), Math.cos(a) * p.r * 0.7, 2, Math.sin(a) * p.r * 0.7).rotation.y = -a;
      }
      for (const [y, s2] of [[0.62, 0.9], [0.8, 0.7], [0.95, 0.45]]) put(new THREE.SphereGeometry(p.r * s2, 10, 7), phong(0x3f5a32), 0, h * y).scale.set(1, 0.55, 1);
      break;
    }
    case 'ancient-tree': {
      put(new THREE.CylinderGeometry(p.r * 0.22, p.r * 0.34, h * 0.6, 7), phong(0x4a3426), 0, h * 0.3);
      for (const [x, y, z, s2] of [[0, 0.68, 0, 0.75], [p.r * 0.4, 0.58, p.r * 0.2, 0.55], [-p.r * 0.35, 0.6, -p.r * 0.25, 0.55]]) {
        put(new THREE.SphereGeometry(p.r * s2, 9, 7), phong(0x1f4a32), x, h * y, z);
      }
      break;
    }
    case 'mushroom': {
      put(new THREE.CylinderGeometry(p.r * 0.22, p.r * 0.32, h * 0.72, 8), phong(MARBLE), 0, h * 0.36);
      put(new THREE.SphereGeometry(p.r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), phong(p.color ?? '#ff6bd8', new THREE.Color(p.color ?? '#ff6bd8').multiplyScalar(0.45)), 0, h * 0.68);
      put(new THREE.CylinderGeometry(p.r * 0.9, p.r * 0.9, 6, 12), glowing(p.color ?? '#ff6bd8'), 0, h * 0.68);
      break;
    }
    case 'wisp':
      put(new THREE.SphereGeometry(p.r, 8, 6), glowing(p.color ?? '#7dffb0'), 0, h);
      break;
    case 'stone-ring': {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const st = put(new THREE.BoxGeometry(26, h, 18), phong(0x8a8a90), Math.cos(a) * p.r * 0.8, h / 2, Math.sin(a) * p.r * 0.8);
        st.rotation.y = -a;
      }
      put(new THREE.CylinderGeometry(p.r * 0.35, p.r * 0.35, 4, 12), glowing('#7dffb0'), 0, 2);
      break;
    }
    // --- Nova Camelot ---------------------------------------------------------------------------------
    case 'castle-tower': {
      const r = p.r;
      put(new THREE.CylinderGeometry(r, r * 1.06, h, 10), phong(0xd8d2c4), 0, h / 2);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        put(new THREE.BoxGeometry(r * 0.42, r * 0.4, r * 0.42), phong(0xc8c2b4), Math.cos(a) * r * 0.92, h + r * 0.2, Math.sin(a) * r * 0.92);
      }
      put(new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.04, 10), phong(GOLD_C), 0, h * 0.82);
      put(new THREE.ConeGeometry(r * 1.05, h * 0.5, 10), phong(0x2a4a9a), 0, h + r * 0.4 + h * 0.25);
      put(new THREE.ConeGeometry(r * 0.16, h * 0.14, 6), phong(GOLD_C), 0, h + r * 0.4 + h * 0.5 + h * 0.06);
      break;
    }
    case 'castle-wall': {
      const ww = p.w ?? 180;
      put(new THREE.BoxGeometry(ww, h, 34), phong(0xd8d2c4), 0, h / 2);
      for (let x = -ww / 2 + 12; x <= ww / 2 - 12; x += 34) put(new THREE.BoxGeometry(18, 18, 34), phong(0xc8c2b4), x, h + 9);
      put(new THREE.BoxGeometry(ww, 6, 36), phong(GOLD_C), 0, h * 0.75);
      break;
    }
    case 'banner': {
      put(new THREE.CylinderGeometry(8, 9, h, 6), phong(GOLD_C), 0, h / 2);
      put(new THREE.BoxGeometry(10, h * 0.42, 54), phong(p.color ?? '#3d7bff'), 0, h * 0.72, 30);
      put(new THREE.BoxGeometry(12, 10, 56), phong(GOLD_C), 0, h * 0.95, 30);
      break;
    }
    case 'keep': {
      const r = p.r;
      put(new THREE.BoxGeometry(r * 1.3, h * 0.7, r * 1.3), phong(0xd8d2c4), 0, h * 0.35);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        put(new THREE.CylinderGeometry(r * 0.24, r * 0.26, h * 0.9, 10), phong(0xe0dacc), x * r * 0.65, h * 0.45, z * r * 0.65);
        put(new THREE.ConeGeometry(r * 0.27, h * 0.3, 10), phong(0x2a4a9a), x * r * 0.65, h * 0.9 + h * 0.15, z * r * 0.65);
      }
      put(new THREE.ConeGeometry(r * 0.5, h * 0.35, 4), phong(GOLD_C, 0x3a2a08), 0, h * 0.7 + h * 0.175).rotation.y = Math.PI / 4;
      break;
    }
    case 'sword-stone': {
      put(new THREE.DodecahedronGeometry(p.r * 0.6, 0), phong(0x8a8a90), 0, p.r * 0.35).scale.set(1.2, 0.7, 1);
      put(new THREE.BoxGeometry(16, h * 0.62, 10), phong(0xe6ecf4, 0x223040), 0, p.r * 0.5 + h * 0.31);
      put(new THREE.BoxGeometry(70, 12, 14), phong(GOLD_C), 0, p.r * 0.5 + h * 0.62);
      put(new THREE.BoxGeometry(12, h * 0.16, 12), phong(0x4a2a1a), 0, p.r * 0.5 + h * 0.62 + h * 0.08);
      put(new THREE.SphereGeometry(12, 8, 6), phong(GOLD_C, 0x3a2a08), 0, p.r * 0.5 + h * 0.62 + h * 0.18);
      break;
    }
    // --- Zoropersia -----------------------------------------------------------------------------------
    case 'lamassu': {
      put(new THREE.BoxGeometry(p.r * 2, 14, p.r * 1.1), phong(MARBLE_SH), 0, 7);
      put(new THREE.BoxGeometry(p.r * 1.5, h * 0.4, p.r * 0.7), phong(SANDSTONE), 0, 14 + h * 0.3);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.BoxGeometry(12, h * 0.22, 12), phong(SANDSTONE), x * p.r * 0.55, 14 + h * 0.11, z * p.r * 0.25);
      put(new THREE.BoxGeometry(p.r * 0.5, h * 0.36, p.r * 0.5), phong(SANDSTONE_LT), p.r * 0.85, 14 + h * 0.55);
      put(new THREE.BoxGeometry(p.r * 0.3, h * 0.12, p.r * 0.56), phong(GOLD_C), p.r * 0.85, 14 + h * 0.78);
      for (const z of [-1, 1]) {
        const wing = put(new THREE.BoxGeometry(p.r * 1.2, h * 0.36, 8), phong(GOLD_C), -p.r * 0.1, 14 + h * 0.62, z * p.r * 0.38);
        wing.rotation.z = 0.35;
      }
      break;
    }
    case 'fire-temple': {
      const r = p.r;
      for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(r * 2 * (1 - k * 0.22), h * 0.18, r * 2 * (1 - k * 0.22)), phong(k % 2 ? SANDSTONE_LT : SANDSTONE), 0, h * 0.09 + k * h * 0.18);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.CylinderGeometry(r * 0.08, r * 0.1, h * 0.5, 8), phong(MARBLE), x * r * 0.42, h * 0.54 + h * 0.25, z * r * 0.42);
      put(new THREE.CylinderGeometry(r * 0.3, r * 0.2, h * 0.1, 10), phong(GOLD_C), 0, h * 0.59);
      put(new THREE.ConeGeometry(r * 0.24, h * 0.36, 7), glowing('#ff8a2a'), 0, h * 0.64 + h * 0.18);
      put(new THREE.ConeGeometry(r * 0.12, h * 0.24, 7), glowing('#ffd86a'), 0, h * 0.64 + h * 0.2);
      break;
    }
    case 'columns': {
      for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) {
        const x = -p.r * 0.75 + i * p.r * 0.5, z = (k ? 1 : -1) * p.r * 0.4;
        put(new THREE.CylinderGeometry(12, 14, h, 8), phong(MARBLE), x, h / 2, z);
        put(new THREE.BoxGeometry(46, 22, 26), phong(GOLD_C), x, h + 11, z);
      }
      put(new THREE.BoxGeometry(p.r * 2, 16, p.r * 1.1), phong(MARBLE_SH), 0, 8);
      break;
    }
    case 'faravahar': {
      put(new THREE.BoxGeometry(p.r * 0.9, h * 0.25, p.r * 0.5), phong(MARBLE_SH), 0, h * 0.125);
      put(new THREE.CylinderGeometry(p.r * 0.32, p.r * 0.32, 24, 16), phong(GOLD_C, 0x3a2a08), 0, h * 0.6).rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const wing = put(new THREE.BoxGeometry(p.r * (0.9 - k * 0.18), 26, 20), phong(GOLD_C), sx * p.r * (0.5 + (0.9 - k * 0.18) / 2 - 0.1), h * 0.6 - k * 28, 0);
          wing.rotation.z = sx * 0.12;
        }
      }
      put(new THREE.CylinderGeometry(p.r * 0.14, p.r * 0.14, 30, 12), glowing('#ffb060'), 0, h * 0.6).rotation.x = Math.PI / 2;
      break;
    }
    // --- Bifrost --------------------------------------------------------------------------------------
    case 'float-isle': {
      // Floating at p.h: a grassy top, a rocky underside tapering to a point, a glowing crystal below.
      const y0 = p.h, r = p.r;
      put(new THREE.CylinderGeometry(r, r * 0.92, 18, 9), phong(0x7faa6a), 0, y0);
      put(new THREE.ConeGeometry(r * 0.95, r * 1.3, 7), phong(0x6a5a8a), 0, y0 - 9 - r * 0.65).rotation.x = Math.PI;
      put(new THREE.OctahedronGeometry(r * 0.18, 0), glowing('#b98cff'), 0, y0 - r * 1.35);
      put(new THREE.ConeGeometry(r * 0.25, r * 0.8, 7), phong(0x2a5a38), r * 0.3, y0 + 9 + r * 0.4);
      break;
    }
    case 'rainbow': {
      // A translucent glowing arch (left as a smooth mesh, not cubes).
      const bands = ['#ff4f6e', '#ff9a3c', '#ffe65c', '#5df08a', '#4fb8ff', '#9a6bff'];
      bands.forEach((c, b) => {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(p.r - b * 16, 8, 6, 40, Math.PI),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
        g.add(arc);
      });
      break;
    }
    // --- El Dorado ------------------------------------------------------------------------------------
    case 'jungle-tree': {
      put(new THREE.CylinderGeometry(p.r * 0.16, p.r * 0.24, h * 0.8, 7), phong(0x5a4a30), 0, h * 0.4);
      put(new THREE.CylinderGeometry(p.r, p.r * 0.75, h * 0.14, 9), phong(0x2a6a34), 0, h * 0.82);
      put(new THREE.CylinderGeometry(p.r * 0.6, p.r * 0.5, h * 0.12, 9), phong(0x3a7a3a), p.r * 0.2, h * 0.95);
      break;
    }
    case 'meso-temple': {
      const r = p.r, tiers = 5;
      for (let k = 0; k < tiers; k++) {
        const s2 = r * 2 * (1 - k * 0.16), th = h * 0.75 / tiers;
        put(new THREE.BoxGeometry(s2, th, s2), phong(k % 2 ? 0x9a8a6a : 0x8a7a5c), 0, k * th + th / 2);
      }
      put(new THREE.BoxGeometry(r * 0.3, h * 0.75, r * 2 * 0.95), phong(0xa89878), 0, h * 0.35, 0);
      put(new THREE.BoxGeometry(r * 0.5, h * 0.14, r * 0.5), phong(GOLD_C, 0x3a2a08), 0, h * 0.75 + h * 0.07);
      put(new THREE.ConeGeometry(r * 0.3, h * 0.14, 4), phong(GOLD_C), 0, h * 0.89 + h * 0.07).rotation.y = Math.PI / 4;
      break;
    }
    case 'waterfall': {
      const ww = p.w ?? 200;
      put(new THREE.BoxGeometry(ww, h, 70), phong(0x5a5a48), 0, h / 2);
      put(new THREE.BoxGeometry(ww * 0.36, h * 0.96, 14), glowing('#9fe8ff'), 0, h * 0.48, 42);
      put(new THREE.CylinderGeometry(ww * 0.4, ww * 0.45, 8, 12), phong(0x3fb8c4, 0x0f4a52), 0, 4, 90);
      break;
    }
    case 'ruin': {
      put(new THREE.CylinderGeometry(14, 16, h * 0.6, 8), phong(0x9a9480), 0, h * 0.3);
      put(new THREE.CylinderGeometry(14, 16, h * 0.7, 8), phong(0x8a8470), 40, 14).rotation.z = Math.PI / 2;
      put(new THREE.BoxGeometry(40, 16, 40), phong(0x4a7a3a), 0, h * 0.6 + 8);
      break;
    }
    default:
      if (p.layer === 0 && p.h === 0) return null;
      put(new THREE.BoxGeometry(w, h, d), phong(p.color ?? 0x2a2f48), 0, h / 2);
  }
  return g;
}

/** Building sides with a grid of lit windows. */
function windowsMaterial(base: string, lit: string, w: number, h: number): THREE.Material {
  // Clean floor bands: a glazed strip of light along each storey, a few dimmed, all one colour.
  const c = canvas2d(64, 128, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    for (let y = 8; y < 128; y += 16) {
      g.fillStyle = lit;
      g.globalAlpha = Math.random() < 0.18 ? 0.18 : 0.75;
      g.fillRect(0, y, 64, 4);
      g.globalAlpha = 0.12;
      g.fillRect(0, y - 3, 64, 3);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.08)';   // slim mullions
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 1, 128);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, w / 64), Math.max(1, h / 128));
  const mat = new THREE.MeshBasicMaterial({ map: t });
  mat.userData.windows = { base, lit };
  return mat;
}

// --- folded scenery --------------------------------------------------------------------------------

/** How map props are drawn: folded paper (now), or the earlier voxel cubes (kept). */
const MAP_STYLE: 'folded' | 'voxel' = 'folded';

/**
 * Folds props made of simple shapes into paper: each shape is rebuilt with few facets (spheres as
 * faceted balls, cylinders and cones as 6–7 sided paper tubes), every facet gets its own tone,
 * folds are drawn as fine crease lines, and building windows become rows of glowing paper-lantern
 * strips. Everything on the map ends up in three meshes (lit paper, glowing paper, creases).
 */
class PropFolds {
  private lit = { pos: [] as number[], col: [] as number[] };
  private glow = { pos: [] as number[], col: [] as number[] };
  private creases: number[] = [];
  private tri = 0;

  absorb(obj: THREE.Object3D, moving: THREE.Object3D[]): void {
    obj.updateMatrixWorld(true);
    const parts: THREE.Mesh[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !solidShape(m)) return;
      for (let a: THREE.Object3D | null = m; a; a = a.parent) if (moving.includes(a)) return;
      parts.push(m);
    });
    for (const m of parts) {
      const geo = foldedShape(m.geometry);
      geo.applyMatrix4(m.matrixWorld);
      const mat = m.material as THREE.MeshPhongMaterial;
      const win = mat.userData.windows as { base: string; lit: string } | undefined;
      const glowing = !win && mat.type === 'MeshBasicMaterial';
      const base = win ? new THREE.Color(win.base) : mat.color.clone();
      if (!glowing && !win && mat.emissive) base.add(mat.emissive.clone().multiplyScalar(0.6));
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const into = glowing ? this.glow : this.lit;
      for (let v = 0; v < pos.count; v++) {
        if (v % 3 === 0) this.tri++;
        const tone = glowing ? 1 : 0.84 + ((this.tri * 2654435761) >>> 0) % 1000 / 1000 * 0.22;
        into.pos.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        into.col.push(base.r * tone, base.g * tone, base.b * tone);
      }
      if (!glowing) {
        const edges = new THREE.EdgesGeometry(geo, 25);
        const ep = edges.getAttribute('position') as THREE.BufferAttribute;
        for (let v = 0; v < ep.count; v++) this.creases.push(ep.getX(v), ep.getY(v), ep.getZ(v));
        edges.dispose();
      }
      if (win) this.lanterns(m, new THREE.Color(win.lit));
      geo.dispose();
      m.removeFromParent();
    }
  }

  /** Rows of glowing strips around a windowed box, every storey. */
  private lanterns(m: THREE.Mesh, lit: THREE.Color): void {
    const pr = (m.geometry as THREE.BoxGeometry).parameters;
    const strip = new THREE.BoxGeometry(1, 1, 1);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
    for (let y = -pr.height / 2 + 14; y < pr.height / 2 - 8; y += 18) {
      for (const [x, z, w, d] of [[0, pr.depth / 2 + 0.6, pr.width * 0.84, 1], [0, -pr.depth / 2 - 0.6, pr.width * 0.84, 1],
        [pr.width / 2 + 0.6, 0, 1, pr.depth * 0.84], [-pr.width / 2 - 0.6, 0, 1, pr.depth * 0.84]]) {
        mtx.compose(at.set(x, y, z), q, sc.set(w, 5, d)).premultiply(m.matrixWorld);
        const g = strip.clone().applyMatrix4(mtx).toNonIndexed();
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) { this.glow.pos.push(pos.getX(v), pos.getY(v), pos.getZ(v)); this.glow.col.push(lit.r, lit.g, lit.b); }
        g.dispose();
      }
    }
    strip.dispose();
  }

  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const make = (src: { pos: number[]; col: number[] }, mat: THREE.Material) => {
      if (!src.pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(src.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(src.col, 3));
      g.computeVertexNormals();
      out.push(new THREE.Mesh(g, mat));
    };
    make(this.lit, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    make(this.glow, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    if (this.creases.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.creases, 3));
      out.push(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x14182a, transparent: true, opacity: 0.28 })));
    }
    return out;
  }
}

/** A shape rebuilt with few facets (paper-folded), non-indexed so each facet shades flat on its own. */
function foldedShape(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const pr = (src as THREE.BufferGeometry & { parameters: Record<string, number> }).parameters;
  let g: THREE.BufferGeometry;
  switch (src.type) {
    case 'SphereGeometry': {
      const half = (pr.thetaLength ?? Math.PI) < Math.PI - 0.01;
      g = half ? new THREE.SphereGeometry(pr.radius, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.IcosahedronGeometry(pr.radius, 1);
      break;
    }
    case 'CylinderGeometry':
      // Prisms (3 or 4 sides) stay prisms: a gabled roof is a 3-sided cylinder laid on its side.
      g = new THREE.CylinderGeometry(pr.radiusTop, pr.radiusBottom, pr.height, pr.radialSegments <= 4 ? pr.radialSegments : Math.min(7, Math.max(5, pr.radialSegments)), 1);
      break;
    case 'ConeGeometry':
      g = new THREE.ConeGeometry(pr.radius, pr.height, Math.min(7, Math.max(pr.radialSegments <= 4 ? pr.radialSegments : 4, pr.radialSegments)), 1);
      break;
    default:
      g = src.clone();
  }
  // A shape that was rotated or reshaped after it was built (its geometry no longer matches its
  // parameters) is kept as it is, so a roof laid along a hall doesn't stand back up.
  if (g.type !== src.type || src.type === 'SphereGeometry' || src.type === 'CylinderGeometry' || src.type === 'ConeGeometry') {
    src.computeBoundingBox(); g.computeBoundingBox();
    const a = src.boundingBox!.getSize(new THREE.Vector3()), b = g.boundingBox!.getSize(new THREE.Vector3());
    if (Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 || Math.abs(a.z - b.z) > 1) {
      if (src.type !== 'SphereGeometry') { g.dispose(); g = src.clone(); }
    }
  }
  // Keep any offset the original shape was built with.
  src.computeBoundingBox(); g.computeBoundingBox();
  const shift = src.boundingBox!.getCenter(new THREE.Vector3()).sub(g.boundingBox!.getCenter(new THREE.Vector3()));
  if (src.type !== 'BoxGeometry' && src.type !== 'OctahedronGeometry' && src.type !== 'DodecahedronGeometry') g.translate(shift.x, shift.y, shift.z);
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  return flat;
}

// --- voxel scenery ----------------------------------------------------------------------------------

/**
 * Turns props made of simple shapes (boxes, cylinders, cones, spheres, octahedra, dodecahedra)
 * into world-aligned cubes for the pixel-art look. Cube size follows the prop's size (small props
 * get fine cubes, mountains coarse ones), only cubes on the surface are kept, and every cube on the
 * map ends up in one of two instanced meshes (lit, or glowing), so it stays cheap to draw.
 */
const PROP_VOX_MIN = 5, PROP_VOX_MAX = 22, PROP_VOX_DIV = 16;
interface PropCube { x: number; y: number; z: number; size: number; color: THREE.Color; glow: boolean }

class PropVoxels {
  private cubes: PropCube[] = [];

  /** Convert the static solid parts of a prop to cubes and remove them from it. */
  absorb(obj: THREE.Object3D, moving: THREE.Object3D[]): void {
    obj.updateMatrixWorld(true);
    const parts: { mesh: THREE.Mesh; inv: THREE.Matrix4; centre: THREE.Vector3 }[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !solidShape(m)) return;
      for (let a: THREE.Object3D | null = m; a; a = a.parent) if (moving.includes(a)) return;
      m.geometry.computeBoundingBox();
      parts.push({ mesh: m, inv: m.matrixWorld.clone().invert(), centre: m.geometry.boundingBox!.getCenter(new THREE.Vector3()) });
    });
    if (!parts.length) return;
    const box = new THREE.Box3();
    for (const pt of parts) box.expandByObject(pt.mesh);
    const dims = box.getSize(new THREE.Vector3());
    const size = Math.max(PROP_VOX_MIN, Math.min(PROP_VOX_MAX, Math.round(Math.max(dims.x, dims.y, dims.z) / PROP_VOX_DIV)));

    // Sample the prop's box on its own grid: each cell takes the first part it falls inside.
    const i0 = Math.floor(box.min.x / size), i1 = Math.ceil(box.max.x / size);
    const j0 = Math.max(0, Math.floor(box.min.y / size)), j1 = Math.ceil(box.max.y / size);
    const k0 = Math.floor(box.min.z / size), k1 = Math.ceil(box.max.z / size);
    const cells = new Map<string, { color: THREE.Color; glow: boolean }>();
    const world = new THREE.Vector3(), local = new THREE.Vector3();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      world.set((i + 0.5) * size, (j + 0.5) * size, (k + 0.5) * size);
      for (const pt of parts) {
        local.copy(world).applyMatrix4(pt.inv).sub(pt.centre);
        if (!insideShape(pt.mesh.geometry, local)) continue;
        cells.set(`${i},${j},${k}`, cubeColour(pt.mesh, local, j));
        break;
      }
    }
    for (const [key, c] of cells) {
      const [i, j, k] = key.split(',').map(Number);
      const hidden = cells.has(`${i + 1},${j},${k}`) && cells.has(`${i - 1},${j},${k}`) && cells.has(`${i},${j + 1},${k}`)
        && (j === j0 || cells.has(`${i},${j - 1},${k}`)) && cells.has(`${i},${j},${k + 1}`) && cells.has(`${i},${j},${k - 1}`);
      if (!hidden) this.cubes.push({ x: (i + 0.5) * size, y: (j + 0.5) * size, z: (k + 0.5) * size, size, ...c });
    }
    for (const pt of parts) pt.mesh.removeFromParent();
  }

  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (const glow of [false, true]) {
      const list = this.cubes.filter((c) => c.glow === glow);
      if (!list.length) continue;
      const inst = new THREE.InstancedMesh(geo, glow ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial(), list.length);
      list.forEach((c, n) => {
        m4.compose(pos.set(c.x, c.y, c.z), q, scl.setScalar(c.size));
        inst.setMatrixAt(n, m4);
        inst.setColorAt(n, c.color);
      });
      out.push(inst);
    }
    return out;
  }

  get count(): number { return this.cubes.length; }
}

/** Shapes the voxelizer understands (solid, opaque or near enough, and not a textured sign). */
function solidShape(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.MeshBasicMaterial;
  if (Array.isArray(m.material) || mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < 0.5)) return false;
  if (mat.map && !mat.userData.windows) return false;
  return ['BoxGeometry', 'CylinderGeometry', 'ConeGeometry', 'SphereGeometry', 'OctahedronGeometry', 'DodecahedronGeometry'].includes(m.geometry.type);
}

/** Whether a point (in the shape's own space, centred) lies inside it. Low-poly round shapes keep their facets. */
function insideShape(geo: THREE.BufferGeometry, v: THREE.Vector3): boolean {
  const g = geo as THREE.BufferGeometry & { parameters: Record<string, number> };
  const pr = g.parameters;
  switch (geo.type) {
    case 'BoxGeometry':
      return Math.abs(v.x) <= pr.width / 2 && Math.abs(v.y) <= pr.height / 2 && Math.abs(v.z) <= pr.depth / 2;
    case 'CylinderGeometry': case 'ConeGeometry': {
      const h = pr.height;
      if (Math.abs(v.y) > h / 2) return false;
      const t = (v.y + h / 2) / h;
      const rTop = geo.type === 'ConeGeometry' ? 0 : pr.radiusTop, rBot = geo.type === 'ConeGeometry' ? pr.radius : pr.radiusBottom;
      const r = rBot + (rTop - rBot) * t;
      const n = pr.radialSegments;
      // Distance to the edge of the n-sided cross-section, measured the way three.js lays out its sides.
      const rel = ((Math.atan2(v.x, v.z) % (2 * Math.PI / n)) + 2 * Math.PI / n) % (2 * Math.PI / n) - Math.PI / n;
      const edge = n <= 12 ? (r * Math.cos(Math.PI / n)) / Math.cos(rel) : r;
      return Math.hypot(v.x, v.z) <= edge;
    }
    case 'SphereGeometry': {
      // (Centred on its bounding box: a half sphere spans -r/2..r/2 here.)
      const half = (pr.thetaLength ?? Math.PI) < Math.PI - 0.01;
      const y = half ? v.y + pr.radius / 2 : v.y;
      return (!half || y >= 0) && v.x * v.x + y * y + v.z * v.z <= pr.radius * pr.radius;
    }
    case 'OctahedronGeometry':
      return Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) <= pr.radius;
    case 'DodecahedronGeometry':
      return v.length() <= pr.radius * 0.88;
  }
  return false;
}

/** A cube's colour: the part's material, with lit window rows on building sides. */
function cubeColour(m: THREE.Mesh, local: THREE.Vector3, row: number): { color: THREE.Color; glow: boolean } {
  const mat = m.material as THREE.MeshPhongMaterial;
  const win = mat.userData.windows as { base: string; lit: string } | undefined;
  if (win) {
    const pr = (m.geometry as THREE.BoxGeometry).parameters;
    const onSide = Math.abs(local.y) < pr.height / 2 - 6;
    const hash = ((Math.round(local.x) * 73856093) ^ (row * 19349663) ^ (Math.round(local.z) * 83492791)) >>> 0;
    if (onSide && row % 2 === 1 && hash % 7 !== 0) return { color: new THREE.Color(win.lit), glow: true };
    return { color: new THREE.Color(win.base), glow: false };
  }
  const col = mat.color.clone();
  // Plain unlit materials are lights and neon trims: they keep glowing.
  if ((mat as THREE.Material).type === 'MeshBasicMaterial') return { color: col, glow: true };
  if (mat.emissive) col.add(mat.emissive.clone().multiplyScalar(0.6));
  // A little per-cube shade variation, so surfaces read as pixels.
  const hash = ((Math.round(local.x) * 73856093) ^ (row * 19349663) ^ (Math.round(local.z) * 83492791)) >>> 0;
  return { color: col.multiplyScalar(0.92 + (hash % 100) / 100 * 0.16), glow: false };
}

// --- the cars ------------------------------------------------------------------------------------

/**
 * The hovercraft, built from voxels (2 px cubes) for a detailed pixel-art look: about 86 long,
 * 50 wide and 30 tall, nose along +x. The shape is described in world px (`carVoxel`), sampled on
 * the voxel grid, and only cubes on the surface are kept. Each car is two instanced meshes (lit
 * cubes and glowing cubes) plus its rear wing.
 */
const VOX = 2;
type VoxKind = 'paint' | 'dark' | 'carbon' | 'metal' | 'glass' | 'shine' | 'white' | 'intake' | 'nozzle' | 'neon';
interface Voxel { x: number; y: number; z: number; kind: VoxKind }
const GLOWING: VoxKind[] = ['intake', 'nozzle', 'neon'];

/** Half-width of the hull at a point along the car (tapering to the nose and a little at the tail). */
function hullHalfWidth(x: number): number {
  if (x > 14) return Math.max(1.5, (13 * (40 - x)) / 26);
  if (x < -30) return 13 - (-30 - x) * 0.45;
  return 13;
}

/** Height of the hull deck (it slopes down toward the nose). */
function hullTop(x: number): number {
  return x > 18 ? 11 - (x - 18) * 0.25 : 11;
}

/** What the car is made of at a point (world px, y up from the bottom of the skirt), or null for air. */
function carVoxel(x: number, y: number, z: number): VoxKind | null {
  const az = Math.abs(z);
  const hw = hullHalfWidth(x), top = hullTop(x);
  // Twin thrusters: round pods with a metal rim around the glowing nozzle.
  for (const tz of [-7, 7]) {
    const r = Math.hypot(y - 7, z - tz);
    if (x >= -44 && x <= -30 && r <= 5.2) {
      if (x <= -41) return r <= 3 ? 'nozzle' : r <= 4.2 ? 'metal' : 'carbon';
      return 'carbon';
    }
  }
  // Front wing with livery endplates.
  if (x >= 31 && x <= 39 && y <= 4 && az <= 23) return az >= 21 ? 'paint' : 'carbon';
  if (x >= 29 && x <= 39 && az >= 21 && az <= 23 && y <= 10) return 'paint';
  // Side pods: rounded along their length, a livery stripe on top, glowing intakes at the front.
  const pr = Math.hypot(y - 7, az - 18);
  if (x >= -24 && x <= 20 && pr <= 4.8) {
    if (x >= 18) return pr <= 3 ? 'intake' : 'carbon';
    if (x <= -22) return 'carbon';
    return y >= 9 && pr >= 3.5 ? 'paint' : 'dark';
  }
  // Pod mounts tying the pods to the hull.
  if (x >= -12 && x <= 6 && y >= 5 && y <= 9 && az > hw && az < 15) return 'carbon';
  // Hover skirt, with a neon strip along its bottom edge.
  if (y < 3 && x >= -36 && x <= 34 && az <= hw + 3) return az > hw + 1 ? 'neon' : 'carbon';
  // Hull: rounded over the top, with a lower trim line, side pinstripes and a racing stripe.
  const round = Math.max(0, y - (top - 3)) * 1.3;
  if (x >= -40 && x <= 40 && y >= 3 && y <= top && az <= hw - round) {
    if (x > 37) return 'dark';
    if (y >= top - 2 && az <= 2.5 && x > -14) return 'white';
    if (y < 5) return 'dark';
    if (az >= hw - round - 2 && y >= 7 && y < 9 && x > -30 && x < 28) return 'white';
    return 'paint';
  }
  // Canopy: a glass bubble on a dark frame, with a glint.
  const cx = (x - 8) / 13, cy = (y - top) / 6.5, cz = z / 6.5;
  if (y > top && cx * cx + cy * cy + cz * cz <= 1) {
    if (y < top + 2.2 && cx * cx + cz * cz > 0.55) return 'dark';
    if (cx > 0.1 && cx < 0.6 && z < -1 && z > -5 && cy > 0.35) return 'shine';
    return 'glass';
  }
  // Airbox behind the cockpit, its intake facing forward.
  if (x >= -10 && x <= -2 && y > top && y <= top + 7 && az <= 3.5) {
    return x >= -3 && y >= top + 3 && az <= 2 ? 'glass' : 'dark';
  }
  // Engine cover with cooling vents.
  if (x >= -34 && x < -10 && y > top && y <= top + (x < -28 ? 2 : 4) && az <= 9) {
    if (y > top + 2 && x > -28 && az <= 6 && Math.floor((x + 40) / 4) % 2 === 0) return 'carbon';
    return 'dark';
  }
  // Rear wing struts.
  if (x >= -38 && x <= -34 && y > top && y <= 22 && Math.abs(az - 6) <= 1.2) return 'carbon';
  return null;
}

/** The rear wing, around its pivot (it tilts flat when DRS opens): a livery top, carbon underneath, endplates. */
function wingVoxel(x: number, y: number, z: number): VoxKind | null {
  const az = Math.abs(z);
  if (az >= 22 && az <= 25 && x >= -6 && x <= 6 && y >= -8 && y <= 4) return 'paint';
  if (x >= -6 && x <= 6 && y >= -1 && y <= 2 && az <= 23) return y >= 1 ? 'paint' : 'carbon';
  if (x <= -5 && y > 2 && y <= 4 && az <= 22) return 'carbon';   // gurney flap
  return null;
}

/** Sample a shape on the voxel grid, keeping only cubes with at least one open face. */
function sampleVoxels(shape: (x: number, y: number, z: number) => VoxKind | null,
  xr: [number, number], yr: [number, number], zr: [number, number]): Voxel[] {
  const kinds = new Map<string, VoxKind>();
  const at = (i: number, j: number, k: number) => kinds.get(`${i},${j},${k}`);
  for (let i = xr[0]; i <= xr[1]; i++) for (let j = yr[0]; j <= yr[1]; j++) for (let k = zr[0]; k <= zr[1]; k++) {
    const kind = shape((i + 0.5) * VOX, (j + 0.5) * VOX, k * VOX);
    if (kind) kinds.set(`${i},${j},${k}`, kind);
  }
  const out: Voxel[] = [];
  for (const [key, kind] of kinds) {
    const [i, j, k] = key.split(',').map(Number);
    const hidden = at(i + 1, j, k) && at(i - 1, j, k) && at(i, j + 1, k) && at(i, j - 1, k) && at(i, j, k + 1) && at(i, j, k - 1);
    if (!hidden) out.push({ x: (i + 0.5) * VOX, y: (j + 0.5) * VOX, z: k * VOX, kind });
  }
  return out;
}

/**
 * The craft the game uses: 'fighter' (a starfighter-style body flying with its wings closed) or
 * 'car' (the earlier F1-style hovercar, kept in the code).
 */
const CRAFT_MODEL: 'folded' | 'fighter' | 'car' = 'folded';

/**
 * The fighter: a long tapered nose with ivory bands, a framed glass canopy, a gold spine fairing,
 * two engine pods with gold intake rings and glowing nozzles, and on each side two stacked blade
 * wings (closed, in flying formation) that part a little when DRS opens. World px, nose along +x.
 */
const FY = 9;   // fuselage centreline height

/** Half-width and half-height of the fuselage along its length. */
function fuselageHalf(x: number): [number, number] {
  if (x < -12) return [7.5, 6.5];
  if (x < 14) { const t = (x + 12) / 26; return [7.5 - t * 1.5, 6.5 - t]; }
  const t = (x - 14) / 30;
  return [Math.max(1.4, 6 - t * 4.8), Math.max(1.4, 5.5 - t * 4.2)];
}

function fighterVoxel(x: number, y: number, z: number): VoxKind | null {
  const az = Math.abs(z), dy = y - FY;
  // Engine pods at the wing roots: gold intake ring in front, a glowing nozzle behind.
  for (const tz of [-12, 12]) {
    const r = Math.hypot(dy, z - tz);
    if (x >= -46 && x <= -18 && r <= 4.8) {
      if (x <= -44) return r <= 3 ? 'nozzle' : 'metal';
      if (x >= -20) return r <= 2.6 ? 'carbon' : 'metal';
      if (dy > 3) return 'paint';
      return 'dark';
    }
  }
  const [hw, hh] = fuselageHalf(x);
  if (x >= -42 && x <= 44 && az <= hw && Math.abs(dy) <= hh && az / hw + Math.abs(dy) / hh <= 1.55) {
    if (x > 40) return 'dark';                                         // nose tip
    if ((x >= 22 && x < 25) || (x >= 31 && x < 33)) return 'white';    // nose bands
    if (dy < -hh * 0.45) return 'dark';                                // dark belly
    if (x <= -40) return 'carbon';                                     // tail plate
    if (Math.abs(dy) < 1.6 && az > hw - 1.6 && x > -36 && x < 20) return 'white';   // side pinstripe
    return 'paint';
  }
  // A neon strip under the belly (the hover glow).
  if (dy >= -hh - 2 && dy < -hh && az <= 2 && x > -30 && x < 28) return 'neon';
  // Canopy: a long glass bubble with two dark frame struts and a glint.
  if (x >= -4 && x <= 18 && dy > hh) {
    const t = (x + 4) / 22, hc = 5.5 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const up = dy - hh;
    if (up <= hc && az <= 4.2 - up * 0.35) {
      if (Math.abs(x - 3) < 1 || Math.abs(x - 10) < 1) return 'dark';
      if (x > 11 && z < -0.5 && up > 2) return 'shine';
      return 'glass';
    }
  }
  // A gold fairing running back from the canopy.
  if (x >= -12 && x < -4 && az <= 1.6 && dy > hh && dy <= hh + 3) return 'metal';
  return null;
}

/** One wing plate, in its own space: root at z = 0 reaching out to z = 24, one cube thick. */
function plateVoxel(x: number, y: number, z: number): VoxKind | null {
  if (z < 0 || z > 24.5 || y < 0 || y > 2) return null;
  const le = 12 - z * 0.6, te = -14 + z * 0.3;   // swept leading edge, straight-ish trailing edge
  if (x > le || x < te) return null;
  if (z >= 22.5) return 'neon';                     // glowing tip
  if (x >= le - 2.5) return 'metal';                // gold leading edge
  if (x >= le - 6.5) return 'paint';                // livery stripe
  return 'white';
}

/**
 * The folded starfighter: folded paper instead of cubes. A diamond-section fuselage creased into
 * facets (gold nose tip, ivory nose bands, dark keel), a glass canopy folded like a tent, a gold
 * spine fin, hexagonal engine pods with gold intakes and glowing nozzles, and on each side two
 * stacked wing sheets (ivory panel, livery panel, gold leading edge, glowing tip) creased along
 * their length. Each facet gets its own tone, edges are drawn as fine creases, and a livery's
 * pattern prints onto the painted panels. World px, nose along +x.
 */
type V3 = [number, number, number];
class Fold {
  pos: number[] = [];
  kinds: VoxKind[] = [];
  tri(a: V3, b: V3, c: V3, kind: VoxKind): void { this.pos.push(...a, ...b, ...c); this.kinds.push(kind); }
  quad(a: V3, b: V3, c: V3, d: V3, kind: VoxKind): void { this.tri(a, b, c, kind); this.tri(a, c, d, kind); }
  /** A fan closing a ring of points around its centre. */
  cap(ring: V3[], kind: VoxKind): void {
    const c: V3 = [0, 0, 0];
    for (const q of ring) { c[0] += q[0] / ring.length; c[1] += q[1] / ring.length; c[2] += q[2] / ring.length; }
    ring.forEach((q, k) => this.tri(c, q, ring[(k + 1) % ring.length], kind));
  }
}

/** Fuselage cross-sections: x, half-width, height above and below the centreline. */
const FUSELAGE: [number, number, number, number][] = [
  [-44, 6, 5, 4], [-30, 7.5, 6.5, 5], [-10, 7.5, 6.5, 5], [6, 6.5, 8, 4.5], [22, 4.5, 4.8, 3.5], [34, 2.8, 3, 2.2],
];

function foldedHull(): Fold {
  const f = new Fold();
  const ring = ([x, hw, up, dn]: [number, number, number, number]): V3[] => [[x, FY + up, 0], [x, FY, hw], [x, FY - dn, 0], [x, FY, -hw]];
  for (let k = 0; k < FUSELAGE.length - 1; k++) {
    const a = ring(FUSELAGE[k]), b = ring(FUSELAGE[k + 1]);
    const band = FUSELAGE[k][0] >= 22;   // the ivory band toward the nose
    for (let e = 0; e < 4; e++) {
      const upper = e === 0 || e === 3;
      f.quad(a[e], b[e], b[(e + 1) % 4], a[(e + 1) % 4], upper ? (band ? 'white' : 'paint') : 'dark');
    }
  }
  // The nose: a gold point.
  const last = ring(FUSELAGE[FUSELAGE.length - 1]), tip: V3 = [47, FY - 0.4, 0];
  for (let e = 0; e < 4; e++) f.tri(last[e], tip, last[(e + 1) % 4], 'metal');
  // The tail: closed off in carbon.
  f.cap(ring(FUSELAGE[0]).reverse(), 'carbon');
  // Canopy: a tent of glass on the spine, with a bright pane catching the light.
  const r1: V3 = [-2, FY + 12, 0], r2: V3 = [13, FY + 9.4, 0];
  const b1l: V3 = [-6, FY + 6.8, -3.8], b1r: V3 = [-6, FY + 6.8, 3.8], b2l: V3 = [17, FY + 6.2, -3], b2r: V3 = [17, FY + 6.2, 3];
  f.quad(b1l, b2l, r2, r1, 'glass');
  f.quad(r1, r2, b2r, b1r, 'shine');
  f.tri(b1l, r1, b1r, 'glass');
  f.tri(b2r, r2, b2l, 'glass');
  // Spine fin behind the canopy.
  f.tri([-32, FY + 6.4, 0], [-10, FY + 6.6, 0], [-27, FY + 13, 0], 'metal');
  // Engine pods: hexagonal paper tubes with gold intakes and glowing nozzles.
  for (const zc of [-12, 12]) {
    const hex = (x: number, r: number): V3[] => Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      return [x, FY + Math.sin(a) * r, zc + Math.cos(a) * r] as V3;
    });
    const back = hex(-44, 4.6), front = hex(-21, 4.6), lip = hex(-17, 3.4);
    for (let k = 0; k < 6; k++) {
      const n = (k + 1) % 6, top = k === 1;
      f.quad(back[k], back[n], front[n], front[k], top ? 'paint' : 'dark');
      f.quad(front[k], front[n], lip[n], lip[k], 'metal');
    }
    f.cap(lip, 'carbon');
    f.cap([...back].reverse(), 'nozzle');
  }
  // A glowing seam along the keel (the hover glow).
  f.quad([-26, FY - 5.1, -1.6], [26, FY - 4, -1.2], [26, FY - 4, 1.2], [-26, FY - 5.1, 1.6], 'neon');
  return f;
}

/** One wing sheet, root at z = 0 out to z = 24, creased along its length. */
function foldedPlate(): Fold {
  const f = new Fold();
  const rootLE: V3 = [12, 0, 0], rootTE: V3 = [-14, 0, 0], tipTE: V3 = [-6.8, 0, 24], tipLE: V3 = [-2.4, 0, 24];
  const rootMid: V3 = [-1, 1.4, 0], tipMid: V3 = [-4.6, 0.8, 22];
  f.quad(rootLE, tipLE, tipMid, rootMid, 'white');
  f.quad(rootMid, tipMid, tipTE, rootTE, 'paint');
  // Gold leading edge, folded over the front.
  f.quad([12.5, 0.4, 0], [-1.9, 0.4, 24], tipLE, rootLE, 'metal');
  f.quad(rootLE, tipLE, [-1.9, -0.6, 24], [13, -0.6, 0], 'metal');
  // A glowing tip.
  f.tri(tipLE, [-1.6, 0.5, 26.5], tipTE, 'neon');
  return f;
}

/** Turn a fold into meshes: matte facets with per-facet tones, glowing parts, crease lines, a printed livery. */
function foldMeshes(f: Fold, colors: Record<VoxKind, THREE.Color>, pattern?: THREE.Texture | null): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const groups: { lit: boolean; printed: boolean }[] = [
    { lit: true, printed: false }, { lit: true, printed: true }, { lit: false, printed: false },
  ];
  for (const gdef of groups) {
    const pos: number[] = [], col: number[] = [], uv: number[] = [];
    f.kinds.forEach((kind, t) => {
      const glowing = GLOWING.includes(kind);
      if (glowing === gdef.lit) return;
      const printed = !!pattern && kind === 'paint';
      if (gdef.lit && printed !== gdef.printed) return;
      // Each facet a slightly different tone, as light catches a fold.
      const tone = glowing ? 1 : 0.86 + ((t * 2654435761) >>> 0) % 1000 / 1000 * 0.2;
      const c = printed ? new THREE.Color(1, 1, 1).multiplyScalar(tone) : colors[kind].clone().multiplyScalar(tone);
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        pos.push(f.pos[o], f.pos[o + 1], f.pos[o + 2]);
        col.push(c.r, c.g, c.b);
        uv.push((f.pos[o] + 48) / 96, (f.pos[o + 2] + 34) / 68);
      }
    });
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mat = gdef.lit
      ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, map: gdef.printed ? pattern ?? null : null })
      : new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    out.push(mesh);
  }
  // Crease lines along every fold.
  const all = new THREE.BufferGeometry();
  all.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
  const creases = new THREE.LineSegments(new THREE.EdgesGeometry(all, 18),
    new THREE.LineBasicMaterial({ color: 0x14182a, transparent: true, opacity: 0.4 }));
  all.dispose();
  out.push(creases);
  return out;
}

/** A livery's printed paper: liveries.ts's own pattern, or its painter sampled over the craft from above. */
function liveryPaper(pattern: string | undefined, base: THREE.Color): THREE.Texture | null {
  if (!pattern) return null;
  const mod = LIVERIES_MOD as { liveryPattern?: (p?: string) => HTMLCanvasElement | undefined };
  let c = mod.liveryPattern?.(pattern);
  if (!c) {
    const painter = liveryPainter(pattern);
    if (!painter) return null;
    c = canvas2d(192, 136, (g) => {
      g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 192, 136);
      for (let py = 0; py < 136; py++) for (let px = 0; px < 192; px++) {
        const r = painter(px / 2 - 48, FY + 7, py / 2 - 34, 'paint', 'top');
        if (!r) continue;
        g.fillStyle = '#' + new THREE.Color(r[0]).getHexString();
        g.fillRect(px, 136 - 1 - py, 1, 1);
      }
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let fighterCache: { hull: Voxel[]; plate: Voxel[] } | null = null;
function fighterVoxels() {
  return fighterCache ??= {
    hull: sampleVoxels(fighterVoxel, [-24, 23], [0, 11], [-9, 9]),
    plate: sampleVoxels(plateVoxel, [-8, 7], [0, 0], [0, 13]),
  };
}

let carVoxelCache: { hull: Voxel[]; wing: Voxel[] } | null = null;
function carVoxels() {
  return carVoxelCache ??= {
    hull: sampleVoxels(carVoxel, [-23, 21], [0, 13], [-13, 13]),
    wing: sampleVoxels(wingVoxel, [-4, 3], [-5, 2], [-13, 13]),
  };
}

let shared: { cube: THREE.BufferGeometry; flame: THREE.BufferGeometry; cone: THREE.BufferGeometry; aura: THREE.BufferGeometry; glow: THREE.Texture; shadow: THREE.Texture } | null = null;
const sharedRes = new Set<unknown>();

function carShared() {
  if (shared) return shared;
  const radial = (inner: string, outer: string) => {
    const t = new THREE.CanvasTexture(canvas2d(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, inner); r.addColorStop(1, outer);
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  shared = {
    cube: new THREE.BoxGeometry(VOX, VOX, VOX),
    // A block one unit long reaching back along -x from the nozzle (scaled to the flame length).
    flame: new THREE.BoxGeometry(1, 6, 6).translate(-0.5, 0, 0),
    // A hexagonal cone with its base at the origin and its tip one unit back along -x.
    cone: new THREE.ConeGeometry(3.6, 1, 6, 1, true).translate(0, 0.5, 0).rotateZ(Math.PI / 2),
    aura: new THREE.BoxGeometry(CRAFT_LENGTH + 12, 30, 52).translate(0, 12, 0),
    glow: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
    shadow: radial('rgba(0,0,0,0.7)', 'rgba(0,0,0,0)'),
  };
  for (const r of Object.values(shared)) sharedRes.add(r);
  return shared;
}

/**
 * Voxels as two instanced meshes: shaded cubes, and glowing ones that ignore the lighting. paint,
 * when given, colours each cube of the paintwork itself (a mythic livery, src/liveries.ts).
 */
function voxelMeshes(voxels: Voxel[], colors: Record<VoxKind, THREE.Color>, paint?: ((v: Voxel) => Painted) | null): THREE.Object3D[] {
  const s = carShared();
  const out: THREE.Object3D[] = [];
  const painted = voxels.map((v) => {
    if (paint && (v.kind === 'paint' || v.kind === 'dark' || v.kind === 'white')) {
      const p = paint(v);
      if (p) return { v, color: new THREE.Color(p[0]), glow: p[1] };
    }
    return { v, color: colors[v.kind], glow: GLOWING.includes(v.kind) };
  });
  for (const glowing of [false, true]) {
    const list = painted.filter((p) => p.glow === glowing);
    if (!list.length) continue;
    const mat = glowing ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(s.cube, mat, list.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    list.forEach(({ v, color }, i) => {
      m4.makeTranslation(v.x, v.y, v.z);
      inst.setMatrixAt(i, m4);
      // A little per-cube shade variation, so the surfaces read as pixels.
      const hash = ((Math.round(v.x + 99) * 73856093) ^ (Math.round(v.y + 99) * 19349663) ^ (Math.round(v.z + 99) * 83492791)) >>> 0;
      const jitter = glowing ? 1 : 0.93 + (hash % 100) / 100 * 0.14;
      inst.setColorAt(i, col.copy(color).multiplyScalar(jitter));
    });
    out.push(inst);
  }
  return out;
}

/** The craft's wings: fully open in an X (radians each sheet tilts) below WING_OPEN_BELOW px/s, closed by WING_CLOSED_AT. */
const WING_X = 0.42, WING_OPEN_BELOW = 120, WING_CLOSED_AT = 760;

/** Make a car a Time Trial ghost: a faint sea-teal hologram (its own copies of the materials), no shadow. */
const GHOST_TINT = new THREE.Color(0x7fe6da);
function ghostly(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.material) return;
    m.castShadow = false;
    m.receiveShadow = false;
    const im = m as unknown as THREE.InstancedMesh;
    if (im.isInstancedMesh) im.instanceColor = null;   // one colour for every cube
    const fade = (mat: THREE.Material) => {
      const c = mat.clone() as THREE.MeshBasicMaterial;
      c.transparent = true;
      c.opacity = Math.min(c.opacity, 0.3);
      c.depthWrite = false;
      c.blending = THREE.AdditiveBlending;
      c.vertexColors = false;
      if (c.color) c.color.copy(GHOST_TINT);
      c.needsUpdate = true;
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(fade) : fade(m.material);
  });
}

class CarRig {
  root = new THREE.Group();
  private body = new THREE.Group();
  private wing = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private aura: THREE.Mesh;
  private auraMat: THREE.MeshBasicMaterial;
  private lastHeading: number | null = null;
  private roll = 0;
  private pitch = 0;
  private wingTilt = 0;
  private shadow!: THREE.Mesh;
  private under!: THREE.Mesh;
  /** The fighter's four wing plates, each hinged at its root (sign: which way it opens). */
  private plates: { g: THREE.Group; sign: number }[] = [];

  constructor(car: Car) {
    const s = carShared();
    // A skin (unlocked colours) replaces the livery: body paint, trim, stripes and the neon glow.
    const sk = car.skin;
    const livery = new THREE.Color(sk?.body ?? car.color);
    const colors: Record<VoxKind, THREE.Color> = {
      paint: livery, dark: sk ? new THREE.Color(sk.trim) : livery.clone().multiplyScalar(0.5), carbon: new THREE.Color(0x1a1d2e),
      // Gold rims and ivory stripes, for the deco look; a skin's accent replaces the ivory.
      metal: new THREE.Color(liveryMetal(sk?.pattern) ?? 0xd9b25b), glass: new THREE.Color(0x0e3a44), shine: new THREE.Color(0x9ff0ff),
      white: new THREE.Color(sk?.accent ?? 0xf3ead2), intake: new THREE.Color(0xdff6ff), nozzle: new THREE.Color(0xbff4ff),
      neon: sk ? new THREE.Color(sk.glow) : livery.clone().lerp(new THREE.Color(0xffffff), 0.35),
    };
    const folded = CRAFT_MODEL === 'folded';
    const fighter = CRAFT_MODEL === 'fighter' || folded;
    const painter = liveryPainter(sk?.pattern);   // a mythic livery's own pattern, cube by cube
    if (folded) {
      const paper = liveryPaper(sk?.pattern, livery);
      for (const m of foldMeshes(foldedHull(), colors, paper)) this.body.add(m);
      const plate = foldedPlate(), left = new Fold();
      left.pos = plate.pos.map((v, k) => (k % 3 === 2 ? -v : v)); left.kinds = plate.kinds;
      for (const side of [1, -1]) {
        for (const upper of [true, false]) {
          const g = new THREE.Group();
          g.position.set(-16, upper ? FY + 0.6 : FY - 3.6, side * 6);
          for (const m of foldMeshes(side > 0 ? plate : left, colors, paper)) g.add(m);
          this.body.add(g);
          this.plates.push({ g, sign: (upper ? -1 : 1) * side });
        }
      }
    } else if (fighter) {
      const vox = fighterVoxels();
      const hullPaint = painter && ((v: Voxel) => {
        const [hw, hh] = fuselageHalf(v.x), dy = v.y - FY;
        const face: Face = dy > hh - 2 ? 'top' : Math.abs(v.z) > hw - 2 ? 'side' : 'other';
        return painter(v.x, v.y, v.z, v.kind as Kind, face);
      });
      for (const m of voxelMeshes(vox.hull, colors, hullPaint)) { m.castShadow = true; this.body.add(m); }
      // Two stacked plates a side (upper and lower), mirrored for the left.
      const left = vox.plate.map((v) => ({ ...v, z: -v.z }));
      for (const side of [1, -1]) {
        for (const upper of [true, false]) {
          const g = new THREE.Group();
          g.position.set(-16, upper ? FY + 1.2 - 1 : FY - 3.2 - 1, side * 6);
          // On the wings the ivory panel carries the livery's pattern and the stripe its accent.
          const platePaint = painter && ((v: Voxel) => painter(v.x + g.position.x, v.y + g.position.y, v.z + g.position.z,
            v.kind === 'white' ? 'paint' : v.kind === 'paint' ? 'white' : v.kind as Kind, 'top'));
          for (const m of voxelMeshes(side > 0 ? vox.plate : left, colors, platePaint)) { m.castShadow = true; g.add(m); }
          this.body.add(g);
          // Opening means the upper plate swings up and the lower one down, on both sides.
          this.plates.push({ g, sign: (upper ? -1 : 1) * side });
        }
      }
    } else {
      const vox = carVoxels();
      const carPaint = (dx: number, dy: number) => painter && ((v: Voxel) => {
        const x = v.x + dx, y = v.y + dy;
        const face: Face = y >= hullTop(x) - 1.6 ? 'top' : Math.abs(v.z) >= hullHalfWidth(x) - 2.6 ? 'side' : 'other';
        return painter(x, y, v.z, v.kind as Kind, face);
      });
      for (const m of voxelMeshes(vox.hull, colors, carPaint(0, 0))) { m.castShadow = true; this.body.add(m); }
      for (const m of voxelMeshes(vox.wing, colors, carPaint(-36, 23))) { m.castShadow = true; this.wing.add(m); }
      this.wing.position.set(-36, 23, 0);   // the wing's pivot, above the struts
      this.body.add(this.wing);
    }

    // The car number on the engine cover, in chunky pixels.
    const num = car.name.match(/^\d+/)?.[0];
    if (num && folded) {
      const decal = textPlane(num, '#14182a', 12, 8);
      decal.geometry.rotateY(-Math.PI / 2);
      decal.position.set(3, 1.6, 13);
      this.plates[0].g.add(decal);   // on the upper right wing sheet
    } else if (num) {
      const decal = textPlane(num, '#ffffff', 16, 10);
      const map = (decal.material as THREE.MeshBasicMaterial).map!;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      decal.geometry.rotateY(-Math.PI / 2);
      decal.position.set(fighter ? -28 : -20, fighter ? FY + 6.5 + 0.3 : hullTop(-20) + 4.3, 0);
      this.body.add(decal);
    }

    // Blocky flames out of the twin thrusters.
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const flameGeo = folded ? s.cone : s.flame;
    for (const z of fighter ? [-12, 12] : [-7, 7]) {
      const f = mesh(flameGeo, this.flameMat, this.body);
      f.position.set(fighter ? -46 : -44, fighter ? FY : 7, z);
      this.flames.push(f);
    }
    // A charge aura for a full ERS battery (purple) or an open DRS wing (green).
    this.auraMat = new THREE.MeshBasicMaterial({ color: ERS_GLOW, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    this.aura = mesh(s.aura, this.auraMat, this.body);
    this.body.position.y = 9;   // hover height
    this.root.add(this.body);

    // On the ground: a soft shadow and the livery-coloured underglow of the hover pads.
    const shadow = this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(CRAFT_LENGTH * 1.15, 54).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: s.shadow, transparent: true, depthWrite: false }));
    shadow.position.set(-4, 0.25, 4);
    shadow.renderOrder = 3;
    this.root.add(shadow);
    const under = this.under = new THREE.Mesh(new THREE.PlaneGeometry(CRAFT_LENGTH * 1.3, 70).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: s.glow, color: livery, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    under.position.y = 0.35;
    under.renderOrder = 4;
    this.root.add(under);
  }

  update(car: Car, time: number, dt: number): void {
    const c = car.craft;
    this.root.position.set(c.pos.x, 0, c.pos.y);
    this.root.rotation.y = -c.heading;
    const racing = car.race.lapStart >= 0;
    this.body.position.y = 9 + c.alt + (racing ? Math.sin(time * 5 + c.pos.x * 0.001) * 2 : 0);
    // Shadow and underglow lie on the road (or the ramp) and fade as the craft flies higher.
    const above = Math.max(0, c.alt - c.ground);
    const fade = 1 / (1 + above / 40);
    this.shadow.position.y = c.ground + 0.25;
    this.under.position.y = c.ground + 0.35;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = fade;
    (this.under.material as THREE.MeshBasicMaterial).opacity = 0.55 * fade;
    this.shadow.scale.setScalar(1 + above / 160);

    // Lean into turns and slides; dip the nose under braking, lift it a touch under power.
    const turn = this.lastHeading === null || dt <= 0 ? 0 : wrapAngle(c.heading - this.lastHeading) / dt;
    this.lastHeading = c.heading;
    const k = 1 - Math.exp(-8 * dt);
    this.roll += (clamp(turn * 0.11 + c.slip * 0.25, -0.38, 0.38) - this.roll) * k;
    // In the air the nose follows the flight: up off the lip, down toward the landing.
    const pitchTarget = c.airborne ? clamp(c.vAlt / 900, -0.28, 0.3) : c.braking ? -0.07 : c.thrust * 0.025;
    this.pitch += (pitchTarget - this.pitch) * k;
    this.body.rotation.set(this.roll, 0, this.pitch);

    const hue = c.deploying ? 280 : car.hue;
    const flame = 10 + c.thrust * 22 + (c.deploying ? 16 : 0) + Math.random() * 4;
    this.flameMat.color.setHSL(hue / 360, 1, 0.5);
    this.flameMat.opacity = 0.45 + c.thrust * 0.4;
    // Flames grow in whole voxel steps, keeping the pixel look.
    const len = Math.max(VOX, Math.round(flame / VOX) * VOX);
    for (const f of this.flames) f.scale.set(len, 1, 1);

    if (this.plates.length) {
      // The wings rest open in an X and fold together as speed builds: wide open when slow or
      // stopped, closed flat at top speed. So braking (or a big hit) opens them again on its own.
      const t = clamp((c.speed - WING_OPEN_BELOW) / (WING_CLOSED_AT - WING_OPEN_BELOW), 0, 1);
      const spread = 1 - t * t * (3 - 2 * t);   // smoothstep
      this.wingTilt += (spread * WING_X - this.wingTilt) * (1 - Math.exp(-6 * dt));
      for (const p of this.plates) p.g.rotation.x = p.sign * this.wingTilt;
    } else {
      this.wingTilt += ((c.drsOpen ? -0.45 : 0) - this.wingTilt) * (1 - Math.exp(-12 * dt));
      this.wing.rotation.z = this.wingTilt;
    }

    const full = c.energy >= ENERGY_FULL;
    this.aura.visible = full || c.drsOpen;
    if (this.aura.visible) {
      this.auraMat.color.setHex(c.drsOpen ? DRS_GLOW : ERS_GLOW);
      this.auraMat.opacity = 0.06 + Math.random() * 0.08;
    }
  }
}

// --- particles -------------------------------------------------------------------------------------

/** Sparks, drift trails and smoke from the 2D particle list, as glowing points. */
/**
 * Slipstream: glowing dashes streaming from a car's nose to the tail of the car it is drafting, in
 * three lanes that pinch in toward the leader (as in the top-down view), brighter the stronger the tow.
 */
const DRAFT_MAX = 720;
const DASH = 14, DASH_GAP = 12;
class Slipstreams {
  mesh: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  private col = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), DRAFT_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.col.setRGB(0, 0, 0));
  }

  update(cars: Car[], time: number): void {
    let n = 0;
    for (const car of cars) {
      const c = car.craft, lead = c.slipFrom;
      if (!lead || c.slipstream < 0.05) continue;
      const ax = c.pos.x + Math.cos(c.heading) * CRAFT_LENGTH * 0.45, ay = c.pos.y + Math.sin(c.heading) * CRAFT_LENGTH * 0.45;
      const bx = lead.pos.x - Math.cos(lead.heading) * CRAFT_LENGTH * 0.5, by = lead.pos.y - Math.sin(lead.heading) * CRAFT_LENGTH * 0.5;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 10) continue;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      this.q.setFromAxisAngle(this.up, -Math.atan2(uy, ux));
      const period = DASH + DASH_GAP;
      for (const lane of [-1, 0, 1]) {
        const strength = c.slipstream * (lane === 0 ? 0.9 : 0.6);
        // The dashes travel toward the car ahead.
        for (let d = (time * 160 + lane * 7) % period; d < len && n < DRAFT_MAX; d += period) {
          const t = d / len;
          const spread = lane * 16 * (1 - t * 0.75);
          const wave = Math.sin(t * len / 22 - time * 14 + lane) * 2.5 * (1 - t * 0.5);
          this.pos.set(ax + ux * d + px * (spread + wave), FLY_HEIGHT + 4 + t * 3, ay + uy * d + py * (spread + wave));   // up where the dragons fly, not on the road
          const thick = lane === 0 ? 1.2 : 0.8;
          this.scl.set(DASH, thick, thick);
          this.m4.compose(this.pos, this.q, this.scl);
          this.mesh.setMatrixAt(n, this.m4);
          // Fade in off our nose and out into the leader's wake.
          const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 4);
          this.col.setHSL(car.hue / 360, 0.25, 0.8).multiplyScalar(strength * fade * 0.55);   // faint wisps of wind
          this.mesh.setColorAt(n, this.col);
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

class Sparks {
  points: THREE.Points;
  private pos = new Float32Array(3 * 3000);
  private col = new Float32Array(3 * 3000);
  private geo = new THREE.BufferGeometry();
  private c = new THREE.Color();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const dot = new THREE.CanvasTexture(canvas2d(32, 32, (g) => {
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    }));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 5, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
  }

  update(list: Particle[]): void {
    const n = Math.min(list.length, 3000);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const fade = Math.max(0, p.life / p.max);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = 4 + (1 - fade) * 6; this.pos[i * 3 + 2] = p.y;
      this.c.setHSL(p.hue / 360, 0.45, 0.66).multiplyScalar(fade);   // muted, like sparks and mist, not neon
      this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// --- helpers ---------------------------------------------------------------------------------------

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  parent?.add(m);
  return m;
}

function canvas2d(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

/** A flat label lying on the ground (rotate its geometry to stand it up), width x height in world px. */
/** A board of dark timber: planks with grain, iron bands at each end and an iron rim. */
function timberBoard(g: CanvasRenderingContext2D, W: number, H: number, scale: number): void {
  g.fillStyle = '#3b2a1e'; g.fillRect(0, 0, W, H);
  const planks = Math.max(2, Math.round(H / scale / 10));
  for (let k = 0; k < planks; k++) {
    g.fillStyle = k % 2 ? '#43301f' : '#382719'; g.fillRect(0, (k * H) / planks, W, H / planks);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, ((k + 1) * H) / planks - scale * 0.6, W, scale * 0.6);
  }
  g.strokeStyle = 'rgba(20,12,8,0.35)'; g.lineWidth = scale * 0.5;
  for (let k = 0; k < W; k += scale * 9) { g.beginPath(); g.moveTo(k, 0); g.bezierCurveTo(k + 8 * scale, H * 0.3, k - 6 * scale, H * 0.7, k + 4 * scale, H); g.stroke(); }
  g.fillStyle = '#4a4642';
  g.fillRect(scale * 3, 0, scale * 4, H); g.fillRect(W - scale * 7, 0, scale * 4, H);
  g.strokeStyle = '#2a2724'; g.lineWidth = 2 * scale; g.strokeRect(scale, scale, W - 2 * scale, H - 2 * scale);
}

/** A timber board w x h world px (lying flat, like textPlane), with `draw` painting on it in canvas px. */
function boardPlane(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): THREE.Mesh {
  const scale = 4, W = Math.ceil(w * scale), H = Math.ceil(h * scale);
  const c = canvas2d(W, H, (g) => { timberBoard(g, W, H, scale); draw(g, W, H); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t }));
}

function textPlane(text: string, color: string, w: number, h: number, back?: string): THREE.Mesh {
  const scale = 4;
  const c = canvas2d(Math.ceil(w * scale), Math.ceil(h * scale), (g) => {
    if (back) timberBoard(g, w * scale, h * scale, scale);
    g.fillStyle = color;
    g.font = `${Math.floor(h * scale * 0.62)}px 'Uncial Antiqua', Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, (w * scale) / 2, (h * scale) / 2 + scale, w * scale * 0.92);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: t, transparent: !back, depthWrite: !!back }));
}

/** A standing sign seen from both sides: a second face turned round, so the text never reads mirrored. */
function bothWays(sign: THREE.Mesh): THREE.Mesh {
  const backFace = new THREE.Mesh(sign.geometry, sign.material);
  backFace.rotation.y = Math.PI;
  sign.add(backFace);
  return sign;
}

function dispose(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !sharedRes.has(m.geometry)) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map && !sharedRes.has(map)) map.dispose();
      mat.dispose();
    }
  });
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/**
 * Pictures of each car's 3D model at a three-quarter angle on a transparent background, for the
 * car selection cards. Rendered once with a small renderer of its own, which is then released.
 */
export function renderCarCards(cars: { color: string; name: string; hue: number; skin?: Car['skin'] }[], w = 360, h = 240): string[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1c3a44, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 1.6, 0.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ff0ff, 1.2);
  rim.position.set(-1.2, 0.6, -1);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, w / h, 1, 2000);
  camera.position.set(92, 120, 126);   // high enough to show the wings
  camera.lookAt(-6, FLY_HEIGHT, 0);
  const out: string[] = [];
  for (const c of cars) {
    const rig = new DragonRig({ color: c.color, name: c.name, hue: c.hue, skin: c.skin, craft: { pos: { x: 0, y: 0 }, heading: 0, speed: 0, alt: 0, thrust: 0, braking: false, deploying: false }, race: { lapStart: 0 } } as unknown as Car);
    rig.pose({ craft: { pos: { x: 0, y: 0 }, heading: 0, speed: 600, alt: 0, thrust: 0, braking: false, deploying: false }, race: { lapStart: 0 } } as unknown as Car);
    rig.root.rotation.y = 0.1;
    scene.add(rig.root);
    renderer.render(scene, camera);
    out.push(renderer.domElement.toDataURL('image/png'));
    scene.remove(rig.root);
    dispose(rig.root);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
