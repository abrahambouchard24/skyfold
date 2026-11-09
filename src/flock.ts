// Flock Raid: a free-flight game on a village green. Each dragon has a timber pen at the edge of
// the green; sheep graze in the middle. A dragon snatches a sheep by flying low and slow over it
// (it can carry two, and carrying slows it), or herds sheep by sweeping past them (they scatter
// away from a dragon), and scores every sheep that ends up in its own pen. A hard bump knocks a
// carried sheep loose. Most sheep penned when the horn blows wins.
// Pure game logic, like craft.ts: no DOM, no drawing.

import { Craft, clamp, collideCrafts, wrapAngle } from './craft';

export const ARENA_R = 2600;          // the green's fence (px from the centre)
export const PEN_RING = 2150;         // pens sit on this circle
export const PEN_R = 200;             // a pen's radius: a sheep inside it is penned
export const ROUND_TIME = 120;        // seconds of raiding
export const COUNTDOWN = 3;           // seconds before the start
const SNATCH_DIST = 46;               // px between a dragon and a sheep to snatch it
const SNATCH_SPEED = 560;             // px/s: faster than this and the claws miss
const CARRY_MAX = 2;
const CARRY_SLOW = 0.06;              // top speed lost per sheep carried
const KNOCK_LOOSE = 160;              // px/s of closing speed in a bump that shakes a sheep loose
const FLEE_R = 220;                   // sheep scatter from a dragon this close
const FLEE_SPEED = 170;               // px/s at their most frightened
const GRAZE_SPEED = 26;
const FIELD_SHEEP = 18;               // sheep grazing at the start
const FIELD_MIN = 13;                 // more wander in while fewer than this are loose...
const NO_NEW_AFTER = ROUND_TIME - 15; // ...until the last 15 seconds
const HARVEST_EVERY = 30;             // the gale's harvest allowance refreshes this often (s)

export type SheepState = 'graze' | 'carried' | 'falling' | 'penned';

export interface Sheep {
  id: number;
  x: number; y: number; vx: number; vy: number;
  heading: number;
  alt: number; vAlt: number;
  state: SheepState;
  /** Who's carrying it, or whose pen it's in (index into the dragons). */
  owner: number;
  /** Where it's ambling to while grazing, and when it next picks somewhere. */
  tx: number; ty: number; next: number;
  /** 0..1 how frightened it is (for the run animation). */
  fear: number;
}

export interface Pen { x: number; y: number; angle: number }

export interface FlockDragon {
  craft: Craft;
  name: string;
  color: string;
  /** Sheep in its claws (ids). */
  carrying: number[];
  score: number;
  ai: FlockAI | null;
}

export interface FlockEvents {
  snatch?(d: number): void;
  deliver?(d: number, n: number): void;
  herded?(d: number): void;
  knock?(d: number): void;
  wall?(d: number, impact: number): void;
}

/** A small seeded generator so a round's sheep are laid out the same way each time it's set up. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export class FlockGame {
  dragons: FlockDragon[] = [];
  sheep: Sheep[] = [];
  pens: Pen[] = [];
  /** Seconds since the countdown began; the raid runs from COUNTDOWN to COUNTDOWN + ROUND_TIME. */
  time = 0;
  over = false;
  events: FlockEvents = {};
  private nextId = 0;
  private rand: () => number;
  private lastHarvest = 0;

  constructor(entrants: { craft: Craft; name: string; color: string; skill: number | null }[], seed = 7) {
    this.rand = rng(seed);
    const n = entrants.length;
    entrants.forEach((e, i) => {
      // Pens evenly round the green, the player's (entrant 0) nearest the camera's first view.
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      const pen = { x: Math.cos(a) * PEN_RING, y: Math.sin(a) * PEN_RING, angle: a };
      this.pens.push(pen);
      // Each dragon starts just inside its pen, facing the middle.
      const c = e.craft;
      c.pos = { x: Math.cos(a) * (PEN_RING - 320), y: Math.sin(a) * (PEN_RING - 320) };
      c.vel = { x: 0, y: 0 };
      c.heading = a + Math.PI;
      c.energy = 0.5;
      this.dragons.push({ craft: c, name: e.name, color: e.color, carrying: [], score: 0, ai: e.skill === null ? null : new FlockAI(e.skill, i) });
    });
    // The flock starts in loose clumps across the middle of the green.
    for (let k = 0; k < FIELD_SHEEP; k++) {
      const clump = Math.floor(k / 3), ca = clump * 2.1 + 0.4, cr = 300 + (clump % 3) * 420;
      this.spawn(Math.cos(ca) * cr + (this.rand() - 0.5) * 160, Math.sin(ca) * cr + (this.rand() - 0.5) * 160);
    }
  }

  get started(): boolean { return this.time >= COUNTDOWN; }
  /** Seconds of raiding left. */
  get left(): number { return clamp(COUNTDOWN + ROUND_TIME - this.time, 0, ROUND_TIME); }
  /** Sheep loose on the green (not carried or penned). */
  get loose(): number { return this.sheep.filter((s) => s.state === 'graze' || s.state === 'falling').length; }

  private spawn(x: number, y: number): Sheep {
    const s: Sheep = { id: this.nextId++, x, y, vx: 0, vy: 0, heading: this.rand() * Math.PI * 2, alt: 0, vAlt: 0,
      state: 'graze', owner: -1, tx: x, ty: y, next: this.rand() * 3, fear: 0 };
    this.sheep.push(s);
    return s;
  }

  /**
   * One fixed step. `player` is the player's controls (aim angle, brake, gale); AI dragons
   * decide their own.
   */
  step(dt: number, player: { aim: number; brake: boolean; deploy: boolean }): void {
    if (this.over) return;
    this.time += dt;
    const racing = this.started;
    if (racing && this.time - this.lastHarvest > HARVEST_EVERY) {
      this.lastHarvest = this.time;
      for (const d of this.dragons) d.craft.harvested = 0;
    }
    // Dragons.
    this.dragons.forEach((d, i) => {
      const c = d.craft;
      c.mods.top = -CARRY_SLOW * d.carrying.length;
      let aim = c.heading, brake = !racing, deploy = false;
      if (racing) {
        if (d.ai) ({ aim, brake, deploy } = d.ai.think(this, i));
        else ({ aim, brake, deploy } = player);
      }
      c.deploy = deploy;
      c.step(dt, aim, racing, brake);
      // The green's fence: scrape round it like a wall.
      const r = Math.hypot(c.pos.x, c.pos.y), lim = ARENA_R - 22;
      if (r > lim) {
        const nx = -c.pos.x / r, ny = -c.pos.y / r;
        c.pos.x = -nx * lim; c.pos.y = -ny * lim;
        const impact = c.scrape({ x: nx, y: ny }, dt);
        if (impact > 40) this.events.wall?.(i, impact);
      }
    });
    c2c: for (let a = 0; a < this.dragons.length; a++) {
      for (let b = a + 1; b < this.dragons.length; b++) {
        const hit = collideCrafts(this.dragons[a].craft, this.dragons[b].craft);
        if (hit > KNOCK_LOOSE) { this.shake(a); this.shake(b); }
        if (this.over) break c2c;
      }
    }
    // Snatching and delivering.
    this.dragons.forEach((d, i) => {
      const c = d.craft;
      if (!racing) return;
      if (d.carrying.length < CARRY_MAX && c.speed < SNATCH_SPEED) {
        for (const s of this.sheep) {
          if (s.state !== 'graze' || d.carrying.length >= CARRY_MAX) continue;
          if (Math.hypot(s.x - c.pos.x, s.y - c.pos.y) > SNATCH_DIST) continue;
          s.state = 'carried'; s.owner = i;
          d.carrying.push(s.id);
          this.events.snatch?.(i);
        }
      }
      const pen = this.pens[i];
      if (d.carrying.length && Math.hypot(pen.x - c.pos.x, pen.y - c.pos.y) < PEN_R + 30) {
        const n = d.carrying.length;
        for (const id of d.carrying) this.penIn(this.byId(id)!, i);
        d.carrying = [];
        this.events.deliver?.(i, n);
      }
    });
    // Sheep.
    for (const s of this.sheep) this.moveSheep(s, dt);
    // New sheep wander in from the middle while the green runs low.
    if (racing && this.time - COUNTDOWN < NO_NEW_AFTER && this.loose < FIELD_MIN && this.rand() < dt * 1.5) {
      const a = this.rand() * Math.PI * 2, r = this.rand() * 500;
      this.spawn(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (const d of this.dragons) d.score = this.sheep.filter((s) => s.state === 'penned' && s.owner === this.dragons.indexOf(d)).length;
    if (this.left <= 0) this.over = true;
  }

  byId(id: number): Sheep | undefined { return this.sheep.find((s) => s.id === id); }

  /** A hard bump: a carried sheep slips out of the claws and tumbles down. */
  private shake(i: number): void {
    const d = this.dragons[i];
    const id = d.carrying.pop();
    if (id === undefined) return;
    const s = this.byId(id)!;
    s.state = 'falling'; s.owner = -1;
    s.x = d.craft.pos.x; s.y = d.craft.pos.y;
    s.vx = d.craft.vel.x * 0.35; s.vy = d.craft.vel.y * 0.35;
    s.alt = 18; s.vAlt = 60;
    this.events.knock?.(i);
  }

  private penIn(s: Sheep, owner: number): void {
    const pen = this.pens[owner];
    s.state = 'penned'; s.owner = owner;
    // Somewhere inside the pen.
    const a = this.rand() * Math.PI * 2, r = this.rand() * (PEN_R - 50);
    s.x = pen.x + Math.cos(a) * r; s.y = pen.y + Math.sin(a) * r;
    s.tx = s.x; s.ty = s.y; s.alt = 0; s.vx = s.vy = 0; s.fear = 0;
  }

  private moveSheep(s: Sheep, dt: number): void {
    if (s.state === 'carried') {
      const d = this.dragons[s.owner];
      s.x = d.craft.pos.x; s.y = d.craft.pos.y; s.heading = d.craft.heading;
      return;
    }
    if (s.state === 'falling') {
      s.vAlt -= 420 * dt;
      s.alt += s.vAlt * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.alt <= 0) {
        s.alt = 0; s.vx *= 0.3; s.vy *= 0.3;
        s.state = 'graze';
        const pen = this.penAt(s.x, s.y);
        if (pen >= 0) this.penIn(s, pen);
      }
      return;
    }
    if (s.state === 'penned') {
      // Mill about inside the pen.
      const pen = this.pens[s.owner];
      s.next -= dt;
      if (s.next <= 0) {
        const a = this.rand() * Math.PI * 2, r = this.rand() * (PEN_R - 50);
        s.tx = pen.x + Math.cos(a) * r; s.ty = pen.y + Math.sin(a) * r; s.next = 2 + this.rand() * 4;
      }
      this.amble(s, s.tx, s.ty, GRAZE_SPEED * 0.6, dt);
      return;
    }
    // Grazing: amble between spots, drawn a little toward the other sheep; scatter from dragons.
    let fx = 0, fy = 0, fear = 0;
    for (const d of this.dragons) {
      const dx = s.x - d.craft.pos.x, dy = s.y - d.craft.pos.y, dist = Math.hypot(dx, dy);
      if (dist < FLEE_R && dist > 1) {
        const k = (1 - dist / FLEE_R) * clamp(d.craft.speed / 300, 0.3, 1.4);
        fx += (dx / dist) * k; fy += (dy / dist) * k; fear = Math.max(fear, k);
      }
    }
    s.fear += (Math.min(1, fear) - s.fear) * Math.min(1, dt * 4);
    if (fear > 0.05) {
      const l = Math.hypot(fx, fy) || 1;
      const sp = FLEE_SPEED * Math.min(1, fear);
      s.vx += ((fx / l) * sp - s.vx) * Math.min(1, dt * 6);
      s.vy += ((fy / l) * sp - s.vy) * Math.min(1, dt * 6);
      s.next = 0.5;
    } else {
      s.next -= dt;
      if (s.next <= 0) {
        // Pick a new spot nearby, nudged toward the flock's middle and away from the fence.
        let cx = 0, cy = 0, n = 0;
        for (const o of this.sheep) if (o !== s && o.state === 'graze' && Math.hypot(o.x - s.x, o.y - s.y) < 500) { cx += o.x; cy += o.y; n++; }
        const pull = n ? 0.35 : 0;
        const tx = s.x + (this.rand() - 0.5) * 300, ty = s.y + (this.rand() - 0.5) * 300;
        s.tx = n ? tx + (cx / n - tx) * pull : tx; s.ty = n ? ty + (cy / n - ty) * pull : ty;
        s.next = 2 + this.rand() * 5;
      }
      const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy);
      const want = dist > 20 ? GRAZE_SPEED : 0;
      s.vx += (((dx / (dist || 1)) * want) - s.vx) * Math.min(1, dt * 2);
      s.vy += (((dy / (dist || 1)) * want) - s.vy) * Math.min(1, dt * 2);
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (Math.hypot(s.vx, s.vy) > 5) s.heading = Math.atan2(s.vy, s.vx);
    // The fence keeps them on the green.
    const r = Math.hypot(s.x, s.y), lim = ARENA_R - 60;
    if (r > lim) { s.x *= lim / r; s.y *= lim / r; }
    // Herded into a pen: it belongs to that pen's dragon now.
    const pen = this.penAt(s.x, s.y);
    if (pen >= 0) { this.penIn(s, pen); this.events.herded?.(pen); }
  }

  private amble(s: Sheep, tx: number, ty: number, speed: number, dt: number): void {
    const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy);
    const want = dist > 10 ? speed : 0;
    s.vx += (((dx / (dist || 1)) * want) - s.vx) * Math.min(1, dt * 2);
    s.vy += (((dy / (dist || 1)) * want) - s.vy) * Math.min(1, dt * 2);
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (Math.hypot(s.vx, s.vy) > 4) s.heading = Math.atan2(s.vy, s.vx);
  }

  /** The pen a point is in, or -1. */
  penAt(x: number, y: number): number {
    return this.pens.findIndex((p) => Math.hypot(p.x - x, p.y - y) < PEN_R);
  }

  /** Standings: dragon indices from most sheep penned to least. */
  ranking(): number[] {
    return this.dragons.map((_, i) => i).sort((a, b) => this.dragons[b].score - this.dragons[a].score);
  }
}

/**
 * An AI raider: picks the loose sheep that's quickest to reach (a little put off by ones another
 * dragon is already after), slows as it closes so its claws can grab, carries two home (or one if
 * nothing else is near), and spends the gale on the run home.
 */
export class FlockAI {
  target = -1;
  private retarget = 0;
  constructor(public skill: number, private seed: number) {}

  think(g: FlockGame, me: number): { aim: number; brake: boolean; deploy: boolean } {
    const d = g.dragons[me], c = d.craft, pen = g.pens[me];
    const speed = c.speed;
    this.retarget -= 1 / 60;
    const loose = g.sheep.filter((s) => s.state === 'graze');
    let tx: number, ty: number, slowAt = 0, home = false;
    const nearest = loose.reduce((m, s) => Math.min(m, Math.hypot(s.x - c.pos.x, s.y - c.pos.y)), Infinity);
    if (d.carrying.length >= 2 || (d.carrying.length === 1 && nearest > 700) || (d.carrying.length && g.left < 12)) {
      tx = pen.x; ty = pen.y; home = true;
    } else {
      let s = g.byId(this.target);
      if (!s || s.state !== 'graze' || this.retarget <= 0) {
        // Score each loose sheep by the time to reach it, counting the turn it takes.
        let best = Infinity;
        for (const o of loose) {
          const dx = o.x - c.pos.x, dy = o.y - c.pos.y, dist = Math.hypot(dx, dy);
          const turn = Math.abs(wrapAngle(Math.atan2(dy, dx) - c.heading));
          const rivals = g.dragons.filter((x, k) => k !== me && x.ai && (x.ai as FlockAI).target === o.id).length;
          // Sheep nearer our own pen are worth a little more (a shorter run home).
          const homeRun = Math.hypot(o.x - pen.x, o.y - pen.y) * 0.25;
          const cost = dist + turn * 260 + rivals * 500 + homeRun + Math.sin(o.id * 7.3 + this.seed) * 60;
          if (cost < best) { best = cost; this.target = o.id; }
        }
        this.retarget = 1.2;
        s = g.byId(this.target);
      }
      if (s) { tx = s.x + s.vx * 0.3; ty = s.y + s.vy * 0.3; slowAt = 1; } else { tx = 0; ty = 0; }
    }
    const dx = tx - c.pos.x, dy = ty - c.pos.y, dist = Math.hypot(dx, dy);
    let aim = Math.atan2(dy, dx);
    const err = wrapAngle(aim - c.heading);
    // Keep off the fence: if heading outward near it, turn back in.
    const r = Math.hypot(c.pos.x, c.pos.y);
    if (r > 2350 && !home) aim = Math.atan2(-c.pos.y, -c.pos.x);
    // Speed: slow enough at the sheep for the claws to catch; brake to tighten a turn that's too wide.
    const want = slowAt ? 470 * (0.9 + 0.1 * this.skill) + Math.max(0, dist - 60) * 1.1 : Infinity;
    const tooWide = Math.abs(err) > 1.1 && dist < 520;
    const brake = speed > want || (tooWide && speed > 260);
    const deploy = home && Math.abs(err) < 0.35 && dist > 900 && c.energy > 0.25;
    return { aim, brake, deploy };
  }
}
