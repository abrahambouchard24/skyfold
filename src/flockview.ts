// Flock Raid's 3D view: a village green ringed by a timber fence and standing stones, a timber
// pen for each dragon at the edge with a banner in its colour, longhouses and birches beyond, and
// folded-paper sheep grazing, fleeing, dangling from claws and milling in the pens. The dragons are
// the race's own DragonRigs, and the camera chases the player's dragon like the race camera does.
// It has its own renderer and canvas, shown only while a raid is on.

import * as THREE from 'three';
import { clamp, wrapAngle } from './craft';
import { DragonRig, FLY_HEIGHT } from './dragon';
import { ARENA_R, FlockGame, PEN_R, Sheep } from './flock';
import type { Car } from './render';

const WOOL = 0xefe8d8, FACE = 0x2e2824, TIMBER = 0x6a4a30, TIMBER_DARK = 0x4a3220, STONE = 0x8c9296, TURF = 0x5f7a3c;

/** Sheep are small enough for a dragon to carry in its hind claws. */
const SHEEP_SCALE = 0.6;
/** Top of a (scaled) sheep's back above its feet. */
const SHEEP_TOP = 30 * SHEEP_SCALE;

const paper = (color: number, emissive = 0x000000) =>
  new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });

/** One sheep: a woolly body, a dark face and ears, four legs. */
class SheepRig {
  readonly root = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private head = new THREE.Group();
  private phase = Math.random() * 6;
  private bell: THREE.Group | null = null;
  /** Height of its back above its feet (world px). */
  readonly top: number;
  constructor(mats: { wool: THREE.Material; face: THREE.Material; dark: THREE.Material; horn: THREE.Material; bronze: THREE.Material; glow: THREE.Material }, ram = false) {
    const scale = ram ? 0.95 : SHEEP_SCALE;
    this.top = 30 * scale;
    this.root.scale.setScalar(scale);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(13, 0), ram ? mats.dark : mats.wool);
    body.scale.set(1.35, 1, 1);
    body.position.y = 17;
    body.castShadow = true;
    this.root.add(body);
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 0), ram ? mats.dark : mats.wool);
    tuft.position.set(-8, 25, 0);
    this.root.add(tuft);
    const face = new THREE.Mesh(new THREE.ConeGeometry(5.5, 13, 5), mats.face);
    face.rotation.z = -Math.PI / 2;
    face.position.set(6, 0, 0);
    this.head.add(face);
    for (const z of [-5, 5]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 6), mats.face);
      ear.position.set(1, 3, z);
      this.head.add(ear);
    }
    if (ram) {
      // The bellwether: curled horns, a bronze bell at its throat, a soft glow round its feet.
      for (const z of [-6, 6]) {
        const horn = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1.6, 5, 9, Math.PI * 1.6), mats.horn);
        horn.position.set(-1, 4, z);
        horn.rotation.y = z > 0 ? 0 : Math.PI;
        this.head.add(horn);
      }
      this.bell = new THREE.Group();
      const b = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6, 6, 1, true), mats.bronze);
      b.position.y = -3;
      this.bell.add(b);
      this.bell.position.set(14, 12, 0);
      this.root.add(this.bell);
      const ring = new THREE.Mesh(new THREE.RingGeometry(22, 30, 32).rotateX(-Math.PI / 2), mats.glow);
      ring.position.y = 0.6;
      ring.renderOrder = 2;
      this.root.add(ring);
    }
    this.head.position.set(17, 20, 0);
    this.root.add(this.head);
    for (const [x, z] of [[8, 5], [8, -5], [-8, 5], [-8, -5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 11, 3), mats.face);
      leg.geometry.translate(0, -5.5, 0);
      leg.position.set(x, 11, z);
      this.root.add(leg);
      this.legs.push(leg);
    }
  }

  /** `grip` is where a carrying dragon's claws hold it (world), and `slot` -1 / 0 / +1 its place there. */
  update(s: Sheep, t: number, dt: number, grip?: THREE.Vector3, slot = 0): void {
    const speed = Math.hypot(s.vx, s.vy);
    this.phase += dt * (2 + speed * 0.09);
    this.root.position.set(s.x, s.alt, s.y);
    this.root.rotation.set(0, -s.heading, 0);
    const swing = s.state === 'carried' ? 0.9 : Math.min(0.8, speed / 120);
    this.legs.forEach((l, k) => { l.rotation.z = Math.sin(this.phase * (s.state === 'carried' ? 2.2 : 1) + (k % 2 ? Math.PI : 0) + (k > 1 ? 0.5 : 0)) * swing; });
    // Grazing: head down now and then; running: head up and a bounce.
    const grazing = s.state === 'graze' && speed < 12 ? Math.max(0, Math.sin(t * 0.7 + s.id)) : 0;
    this.head.rotation.z = -grazing * 0.7;
    if (this.bell) this.bell.rotation.x = Math.sin(this.phase * 2) * Math.min(0.6, 0.15 + speed / 200);
    if (s.state === 'graze' || s.state === 'penned') this.root.position.y += Math.abs(Math.sin(this.phase * 1.5)) * Math.min(4, speed / 40);
    if (s.state === 'carried') {
      // Held under the dragon's belly in its hind claws (two side by side), legs kicking.
      const side = slot * 6;
      const gx = grip ? grip.x : s.x, gz = grip ? grip.z : s.y, gy = grip ? grip.y : FLY_HEIGHT - 3;
      this.root.position.set(gx - Math.sin(s.heading) * side, Math.max(0, gy - this.top + 1), gz + Math.cos(s.heading) * side);
      this.root.rotation.z = Math.sin(t * 5 + s.id) * 0.18;
    }
  }
}

export class FlockView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(66, 1, 4, 14000);
  private sun = new THREE.DirectionalLight(0xfff0d8, 1.9);
  private sunDir = new THREE.Vector3(-0.55, 0.8, 0.3).normalize();
  private world = new THREE.Group();
  private rigs = new Map<Car, DragonRig>();
  private sheep = new Map<number, SheepRig>();
  private sheepMats = {
    wool: paper(WOOL), face: paper(FACE), dark: paper(0x4e4034), horn: paper(0xd8ccb0), bronze: paper(0xc98b3e, 0x3a2208),
    glow: new THREE.MeshBasicMaterial({ color: 0xe6c08a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  private camHeading = 0;
  private lastNow = 0;
  private builtFor: FlockGame | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '0', display: 'none' });
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // A clear northern morning: pale sky, a little haze over the far hills.
    this.scene.background = new THREE.Color('#c8d8dc');
    this.scene.fog = new THREE.Fog('#c8d8dc', 2600, 9000);
    this.scene.add(new THREE.HemisphereLight(0xf0f4ec, 0x3a4030, 1.6));
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -700; sc.right = 700; sc.top = 700; sc.bottom = -700; sc.near = 10; sc.far = 3000;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target, this.world);
  }

  set visible(on: boolean) { this.canvas.style.display = on ? 'block' : 'none'; }

  /** Build the green, the fence, the stones, the pens and what lies beyond, once per raid. */
  private build(g: FlockGame): void {
    this.scene.remove(this.world);
    this.world.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow; m.receiveShadow = true;
      this.world.add(m);
      return m;
    };
    // The green: mown in rings, darker beyond the fence.
    const grass = document.createElement('canvas');
    grass.width = grass.height = 256;
    const gg = grass.getContext('2d')!;
    gg.fillStyle = '#6f8f44'; gg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      gg.fillStyle = Math.random() < 0.5 ? 'rgba(40,60,20,0.18)' : 'rgba(200,220,140,0.12)';
      gg.fillRect(Math.random() * 256, Math.random() * 256, 2, 4);
    }
    for (let i = 0; i < 30; i++) { gg.fillStyle = ['#f4ecd0', '#e8d060', '#c8a8d8'][i % 3]; gg.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    const tex = new THREE.CanvasTexture(grass);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    add(new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, color: 0x9aa880 }), 0, -1, 0, false);
    add(new THREE.CircleGeometry(ARENA_R, 96).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff }), 0, 0, 0, false);
    for (const r of [900, 1700]) {
      add(new THREE.RingGeometry(r - 30, r + 30, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x86a056, transparent: true, opacity: 0.35 }), 0, 0.3, 0, false);
    }
    // The fence round the green: timber posts and two rails, a standing stone every so often.
    const postMat = paper(TIMBER), railMat = paper(TIMBER_DARK), stoneMat = paper(STONE), runeMat = new THREE.MeshBasicMaterial({ color: 0x9ff0dc });
    const posts = 120;
    for (let k = 0; k < posts; k++) {
      const a = (k / posts) * Math.PI * 2, x = Math.cos(a) * ARENA_R, z = Math.sin(a) * ARENA_R;
      add(new THREE.BoxGeometry(10, 46, 10), postMat, x, 23, z);
      const a2 = ((k + 1) / posts) * Math.PI * 2, x2 = Math.cos(a2) * ARENA_R, z2 = Math.sin(a2) * ARENA_R;
      const len = Math.hypot(x2 - x, z2 - z);
      for (const y of [18, 36]) {
        const rail = add(new THREE.BoxGeometry(len, 5, 4), railMat, (x + x2) / 2, y, (z + z2) / 2);
        rail.rotation.y = -Math.atan2(z2 - z, x2 - x);
      }
      if (k % 10 === 5) {
        const st = add(new THREE.BoxGeometry(34, 120, 22), stoneMat, Math.cos(a) * (ARENA_R + 70), 60, Math.sin(a) * (ARENA_R + 70));
        st.rotation.set(0.04, -a, -0.05);
        const rune = add(new THREE.BoxGeometry(2, 50, 8), runeMat, Math.cos(a) * (ARENA_R + 58), 66, Math.sin(a) * (ARENA_R + 58), false);
        rune.rotation.y = -a;
      }
    }
    // The pens: a ring of hurdles with a gate toward the middle, hay inside, a banner in the
    // dragon's colour on a tall pole, and a ring painted on the grass to fly for.
    g.pens.forEach((p, i) => {
      const color = new THREE.Color(g.dragons[i].color);
      const gate = p.angle + Math.PI;
      const n = 18;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        if (Math.abs(wrapAngle(a - gate)) < 0.4) continue;   // the open gate
        const x = p.x + Math.cos(a) * PEN_R, z = p.y + Math.sin(a) * PEN_R;
        add(new THREE.BoxGeometry(8, 34, 8), postMat, x, 17, z);
        const a2 = ((k + 1) / n) * Math.PI * 2;
        if (Math.abs(wrapAngle(a2 - gate)) < 0.4) continue;
        const x2 = p.x + Math.cos(a2) * PEN_R, z2 = p.y + Math.sin(a2) * PEN_R, len = Math.hypot(x2 - x, z2 - z);
        for (const y of [12, 26]) {
          const rail = add(new THREE.BoxGeometry(len, 4, 3), railMat, (x + x2) / 2, y, (z + z2) / 2);
          rail.rotation.y = -Math.atan2(z2 - z, x2 - x);
        }
      }
      add(new THREE.RingGeometry(PEN_R - 14, PEN_R + 4, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }), p.x, 0.5, p.y, false);
      add(new THREE.CylinderGeometry(PEN_R - 20, PEN_R - 20, 1, 24), new THREE.MeshLambertMaterial({ color: 0xb8a060 }), p.x, 0.4, p.y, false);
      add(new THREE.ConeGeometry(36, 30, 7), paper(0xd8c070), p.x - Math.cos(p.angle) * 90, 15, p.y - Math.sin(p.angle) * 90).position.add(new THREE.Vector3(Math.cos(p.angle) * 160, 0, Math.sin(p.angle) * 160));
      const bx = p.x + Math.cos(p.angle) * (PEN_R + 40), bz = p.y + Math.sin(p.angle) * (PEN_R + 40);
      add(new THREE.CylinderGeometry(4, 5, 260, 6), postMat, bx, 130, bz);
      const cloth = add(new THREE.BoxGeometry(4, 90, 60), paper(color.getHex(), color.clone().multiplyScalar(0.25).getHex()), bx, 200, bz);
      cloth.rotation.y = -p.angle + Math.PI / 2;
      cloth.position.add(new THREE.Vector3(-Math.sin(p.angle) * 30, 0, Math.cos(p.angle) * 30));
    });
    // Longhouses on the green: plank walls up to the eaves and a turf roof whose ridge matches the
    // height the dragons ride over (FlockGame.groundAt), a doorway glowing at each gable.
    for (const h of g.houses) {
      const hall = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(h.length, h.eave, h.width - 8), paper(0x5a4030));
      walls.position.y = h.eave / 2; hall.add(walls);
      const roofH = h.ridge - h.eave;
      const shape = new THREE.Shape([new THREE.Vector2(-h.width / 2, 0), new THREE.Vector2(h.width / 2, 0), new THREE.Vector2(0, roofH)]);
      const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: h.length + 8, bevelEnabled: false });
      roofGeo.translate(0, 0, -(h.length + 8) / 2);
      roofGeo.rotateY(Math.PI / 2);
      const roof = new THREE.Mesh(roofGeo, paper(TURF));
      roof.position.y = h.eave; hall.add(roof);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(h.length + 10, 4, 6), paper(TIMBER_DARK));
      ridge.position.y = h.ridge + 1; hall.add(ridge);
      for (const end of [-1, 1]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(2, h.eave * 0.75, 22), new THREE.MeshBasicMaterial({ color: 0xffb45a }));
        door.position.set(end * (h.length / 2 + 1), h.eave * 0.38, 0); hall.add(door);
      }
      hall.position.set(h.x, 0, h.y);
      hall.rotation.y = -h.angle;
      hall.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
      this.world.add(hall);
    }
    // Beyond the fence: longhouses, birch clumps and hills.
    const turf = paper(TURF), wall = paper(0x5a4030), birch = paper(0xeeeae0), leaf = paper(0x7f9a52);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + 0.11, r = ARENA_R + 420 + (k % 3) * 160;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const hall = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(260, 60, 110), wall); body.position.y = 30; hall.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 280, 3, 1), turf); roof.rotation.z = Math.PI / 2; roof.rotation.y = 0; roof.position.y = 88; roof.scale.set(1, 1, 0.75); hall.add(roof);
      hall.position.set(x, 0, z);
      hall.rotation.y = -a + Math.PI / 2;
      hall.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
      this.world.add(hall);
    }
    for (let k = 0; k < 40; k++) {
      const a = k * 2.399, r = ARENA_R + 250 + ((k * 137) % 900);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      add(new THREE.CylinderGeometry(4, 6, 110, 5), birch, x, 55, z);
      add(new THREE.IcosahedronGeometry(40, 0), leaf, x, 120, z);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = 6200 + (k % 4) * 500;
      add(new THREE.ConeGeometry(900 + (k % 3) * 300, 700 + (k % 5) * 260, 6), paper(k % 2 ? 0x5a6a5a : 0x6a7a68), Math.cos(a) * r, 300, Math.sin(a) * r, false);
    }
    this.builtFor = g;
  }

  render(g: FlockGame, cars: Car[], player: Car, time: number, pixelRatio: number): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (this.builtFor !== g) {
      this.build(g);
      for (const r of this.sheep.values()) this.scene.remove(r.root);
      this.sheep.clear();
      for (const r of this.rigs.values()) this.scene.remove(r.root);
      this.rigs.clear();
      this.camHeading = player.craft.heading;
    }
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== innerWidth || size.y !== innerHeight) this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;

    for (const car of cars) {
      let rig = this.rigs.get(car);
      if (!rig) { rig = new DragonRig(car); this.rigs.set(car, rig); this.scene.add(rig.root); }
      rig.isPlayer = car === player;
      rig.update(car, time, dt);
    }
    // Where each carrying dragon's claws hold its sheep: the rig's claw anchor if it has one,
    // otherwise just under its body.
    const grips = new Map<number, THREE.Vector3>();
    g.dragons.forEach((d, i) => {
      if (!d.carrying.length) return;
      const rig = this.rigs.get(cars[i]);
      const anchor = (rig as unknown as { clawAnchor?: THREE.Object3D } | undefined)?.clawAnchor;
      const v = new THREE.Vector3();
      if (anchor) anchor.getWorldPosition(v);
      else v.set(d.craft.pos.x, FLY_HEIGHT - 3 + d.craft.alt, d.craft.pos.y);
      grips.set(i, v);
    });
    const alive = new Set<number>();
    for (const s of g.sheep) {
      let rig = this.sheep.get(s.id);
      if (!rig) { rig = new SheepRig(this.sheepMats, !!s.bell); this.sheep.set(s.id, rig); this.scene.add(rig.root); }
      if (s.state === 'carried') {
        const list = g.dragons[s.owner].carrying, k = list.indexOf(s.id);
        rig.update(s, time, dt, grips.get(s.owner), list.length > 1 ? (k === 0 ? -1 : 1) : 0);
      } else rig.update(s, time, dt);
      alive.add(s.id);
    }
    for (const [id, rig] of this.sheep) if (!alive.has(id)) { this.scene.remove(rig.root); this.sheep.delete(id); }

    // The chase camera: behind and above the player's dragon, swinging round after it.
    const c = player.craft;
    this.camHeading += wrapAngle(c.heading - this.camHeading) * (1 - Math.exp(-5 * dt));
    const speedFrac = clamp(c.speed / 880, 0, 1);
    const back = 190 + speedFrac * 50, up = 80 + FLY_HEIGHT + speedFrac * 10;
    const fx = Math.cos(this.camHeading), fy = Math.sin(this.camHeading);
    this.camera.position.set(c.pos.x - fx * back, up, c.pos.y - fy * back);
    this.camera.lookAt(c.pos.x + fx * 160, 10 + FLY_HEIGHT * 0.6, c.pos.y + fy * 160);
    this.camera.fov = 64 + speedFrac * 12;
    this.camera.updateProjectionMatrix();
    this.sun.target.position.set(c.pos.x, 0, c.pos.y);
    this.sun.position.set(c.pos.x + this.sunDir.x * 1400, this.sunDir.y * 1400, c.pos.y + this.sunDir.z * 1400);
    this.renderer.render(this.scene, this.camera);
  }

  /** Where the camera is looking from, as an angle on the ground (for the HUD's pen arrow). */
  get heading(): number { return this.camHeading; }
}
