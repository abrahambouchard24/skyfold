// One Sheep's controller: sets a race up on the chosen realm (the player's dragon and five AI
// rivals), runs it at the fixed 60 Hz step with the player's keys, plays its sounds, draws it through
// the race's own 3D view (ChaseView, with the sheep added to its scene) and drives the screens.
// main.ts hands the frame loop to it while it's open (`active`).

import { Driver } from './ai';
import type { Sound } from './audio';
import { Craft, clamp } from './craft';
import { dragonEvents } from './dragon';
import { SheepRig, sheepMaterials } from './flockview';
import type { Input } from './input';
import { COUNTDOWN, LAPS, OneSheepGame } from './onesheep';
import { OneSheepRow, OneSheepUI } from './onesheepui';
import type { Camera, Car } from './render';
import type { Track } from './track';
import type { ChaseView } from './view3d';
import * as THREE from 'three';

const STEP = 1 / 60;
const SKILLS = [0.84, 0.88, 0.9, 0.93, 0.95];

export interface OneSheepDeps {
  input: Input;
  sound: Sound;
  chase: ChaseView | null;
  /** The race HUD canvas, hidden while One Sheep is on. */
  hud: HTMLCanvasElement;
  /** The circuits to race (not the sprints), and their names. */
  tracks: Track[];
  makeCar(i: number): Car;
  playerLivery(): number;
  steer(c: Craft, brake: boolean): number;
  pixelRatio(): number;
  onExit(): void;
}

export class OneSheepMode {
  active = false;
  private ui = new OneSheepUI();
  private game: OneSheepGame | null = null;
  private cars: Car[] = [];
  private player: Car | null = null;
  private realm = 0;
  private acc = 0;
  private last = 0;
  private paused = false;
  private finished = false;
  private beeped = 0;
  private cam: Camera = { x: 0, y: 0, zoom: 1, shake: 0 };
  private sheepRig: SheepRig | null = null;
  private savedBeat: typeof dragonEvents.playerBeat = null;
  private bleatWait = 2;

  constructor(private deps: OneSheepDeps) {}

  open(): void {
    if (!this.deps.chase) return;   // needs the 3D view
    this.active = true;
    this.deps.hud.style.visibility = 'hidden';
    this.ui.intro(this.deps.tracks.map((t) => t.name), this.realm, LAPS, (r) => { this.realm = r; this.start(); }, () => this.exit());
  }

  private start(): void {
    const chase = this.deps.chase!;
    const first = this.deps.playerLivery();
    const order = [first, ...[0, 1, 2, 3, 4, 5].filter((i) => i !== first)];
    this.cars = order.map((i) => this.deps.makeCar(i));
    this.player = this.cars[0];
    const riders = this.cars.map((car, k) => {
      if (k === 0) return { craft: car.craft, race: car.race, driver: null };
      const d = new Driver(SKILLS[k - 1], k + 1);
      d.craft = car.craft; d.race = car.race;
      return { craft: car.craft, race: car.race, driver: d };
    });
    const g = new OneSheepGame(this.deps.tracks[this.realm], riders);
    this.game = g;
    const s = this.deps.sound, name = (i: number) => this.cars[i].name.replace(/^\d+\s*/, '');
    g.events = {
      snatch: (d) => { s.snatch(); this.ui.flash(d === 0 ? 'YOU HAVE THE SHEEP!' : `${name(d)} HAS THE SHEEP`); },
      drop: (d, cause, by) => {
        if (d === 0) { s.thud(200); this.ui.flash(cause === 'tail' ? `${name(by)} SHOOK IT LOOSE!` : cause === 'bump' ? 'KNOCKED LOOSE!' : 'DROPPED IT!'); }
        else if (by === 0) { s.bleat(0, 1.1); this.ui.flash(`YOU SHOOK IT FROM ${name(d)}!`); }
        else s.bleat(0, 1);
      },
      point: (d) => { if (d === 0) s.chime(false); },
      wall: (d, impact) => { if (d === 0 && impact > 120) s.thud(impact); },
      lap: (d, lap) => { if (d === 0 && lap < LAPS) s.chime(true); },
    };
    if (!this.sheepRig) this.sheepRig = new SheepRig(sheepMaterials());
    chase.extras.add(this.sheepRig.root);
    chase.visible = true;
    this.finished = false; this.paused = false; this.beeped = 0; this.acc = 0;
    this.last = performance.now();
    this.ui.hideCard();
    this.savedBeat = dragonEvents.playerBeat;
    dragonEvents.playerBeat = (k) => { if (!this.paused && this.game?.started) s.wingbeat(k); };
    s.race('race');
  }

  frame(now: number): void {
    const { input, sound } = this.deps;
    const dtReal = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const g = this.game, player = this.player, chase = this.deps.chase;
    if (!g || !player || !chase) return;   // still on the briefing card
    if (input.takePause() && !this.finished) {
      this.paused = !this.paused;
      if (this.paused) { sound.pause(); this.ui.pause(() => this.resume(), () => this.exit()); }
      else this.resume();
    }
    if (!this.paused && !this.finished) {
      this.acc += dtReal;
      while (this.acc >= STEP) {
        const c = player.craft, brake = input.brake;
        g.step(STEP, { aim: this.deps.steer(c, brake), brake, deploy: input.deploy });
        this.acc -= STEP;
      }
      const toGo = COUNTDOWN - g.time, count = Math.ceil(toGo);
      if (toGo > 0 && count !== this.beeped && count <= 3) { this.beeped = count; sound.beep(false); }
      if (toGo <= 0 && this.beeped !== -1) { this.beeped = -1; sound.beep(true); }
      const pc = player.craft;
      sound.engine(0, 0, pc.thrust, clamp(pc.speed / 880, 0, 1));
      sound.gale(g.started && pc.deploying);
      this.bleats(dtReal);
      if (g.over) this.finish();
    }
    // The sheep: on the road, or in the carrier's claws.
    const rig = this.sheepRig!;
    if (g.carrier >= 0) {
      const anchor = (chase.rigOf(this.cars[g.carrier]) as unknown as { clawAnchor?: THREE.Object3D } | undefined)?.clawAnchor;
      const v = new THREE.Vector3();
      if (anchor) anchor.getWorldPosition(v);
      else { const c = this.cars[g.carrier].craft; v.set(c.pos.x, 19 + c.alt, c.pos.y); }
      rig.update(g.sheep, g.time, dtReal, v, 0);
    } else rig.update(g.sheep, g.time, dtReal);
    // HUD.
    const rows: OneSheepRow[] = this.cars.map((c, i) => ({ name: c.name.replace(/^\d+\s*/, ''), color: c.color, points: g.points[i], me: i === 0, has: g.carrier === i }));
    const pc = player.craft;
    const mine = g.carrier === 0;
    const status = mine ? 'YOU HAVE THE SHEEP' : g.carrier >= 0 ? `${rows[g.carrier].name} HAS THE SHEEP` : 'THE SHEEP IS LOOSE';
    // The arrow points at the sheep (or its carrier), relative to the way the dragon's heading.
    const arrow = mine ? null : Math.atan2(g.sheep.y - pc.pos.y, g.sheep.x - pc.pos.x) - pc.heading;
    const tl = g.tailing;
    const tail = g.carrier >= 0 && tl.k > 0 && (tl.by === 0 || mine) ? tl.k : null;
    const toGo = COUNTDOWN - g.time;
    const call = toGo > 0 ? String(Math.ceil(toGo)) : toGo > -0.8 ? 'FLY!' : null;
    if (!this.finished) this.ui.update(player.race.lap + 1, LAPS, rows, status, mine, arrow, tail, call);
    chase.render({ time: g.time, cam: this.cam, player, cars: this.cars, track: g.track, particles: [], goIn: COUNTDOWN - g.time }, this.deps.pixelRatio());
  }

  /** A bleat now and then when the sheep is near the player. */
  private bleats(dt: number): void {
    const g = this.game, pc = this.player?.craft;
    if (!g || !pc) return;
    this.bleatWait -= dt;
    if (this.bleatWait > 0) return;
    this.bleatWait = 1.5 + Math.random() * 2.5;
    const d = Math.hypot(g.sheep.x - pc.pos.x, g.sheep.y - pc.pos.y);
    if (d > 900) return;
    const rel = Math.atan2(g.sheep.y - pc.pos.y, g.sheep.x - pc.pos.x) - pc.heading;
    this.deps.sound.bleat(clamp(Math.sin(rel), -1, 1), 1);
  }

  /** Dev: step the race by hand (animation frames stop while the tab is hidden), then draw it. */
  advance(seconds: number): void {
    const end = performance.now() + seconds * 1000;
    this.last = performance.now() - seconds * 1000;
    this.acc = 0;
    const slice = Math.min(250, seconds * 1000);
    for (let t = this.last + slice; t <= end + 1; t += slice) this.frame(t);
  }

  private resume(): void {
    this.paused = false;
    this.ui.hideCard();
    this.last = performance.now();
    this.deps.sound.race('race');
  }

  private finish(): void {
    const g = this.game!;
    this.finished = true;
    const rank = g.ranking();
    const rows: OneSheepRow[] = rank.map((i) => ({ name: this.cars[i].name.replace(/^\d+\s*/, ''), color: this.cars[i].color, points: g.points[i], me: i === 0, has: false }));
    this.deps.sound.roundHorn(true);
    this.deps.sound.crowd(rank[0] === 0);
    this.deps.sound.gale(false);
    this.ui.results(rows, () => { this.cleanup(); this.start(); }, () => this.exit());
  }

  private cleanup(): void {
    if (this.sheepRig) this.deps.chase?.extras.remove(this.sheepRig.root);
    this.game = null;
    this.player = null;
    this.cars = [];
  }

  exit(): void {
    this.active = false;
    this.cleanup();
    this.ui.hide();
    if (this.savedBeat !== null) dragonEvents.playerBeat = this.savedBeat;
    this.deps.sound.gale(false);
    this.deps.hud.style.visibility = 'visible';
    this.deps.onExit();
  }
}
