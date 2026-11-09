// Flock Raid: a free-flight game on a village green with one big fold in the middle that every
// dragon fills; each sheep is credited to the dragon that brought it in. Sheep graze out toward the
// fence and stand on the ridges of the longhouses dotted about the green.
// A dragon snatches a sheep by flying over it slowly (its claws hold two, and carrying slows it),
// rides up over a longhouse roof to lift the ones standing there, herds sheep by sweeping past them
// (they scatter away; one that runs into the fold counts for the dragon that last scared it), and
// scores every sheep it brings into the fold. Thieves: a hard bump shakes a carried sheep loose, and a
// dragon that tails a carrier closely for a moment plucks one of its sheep away.
// Three rounds, each closed by a horn and a short lull. In the last round the bellwether comes out:
// a big belled ram leading a flock. Fold the bellwether and its whole flock streams in after it,
// every one of them credited to you.
// Pure game logic, like craft.ts: no DOM, no drawing.

import { Craft, clamp, collideCrafts, wrapAngle } from './craft';

export const ARENA_R = 2600;          // the green's fence (px from the centre)
export const START_RING = 2150;       // dragons start round this circle, facing the fold
export const PEN_R = 280;             // the fold's radius (it sits in the middle of the green)
export const ROUNDS = 3;
export const ROUND_TIME = 50;         // seconds of raiding per round
export const LULL = 4;                // seconds between rounds (after the horn)
export const COUNTDOWN = 3;           // seconds before the first round
const SNATCH_DIST = 46;               // px between a dragon and a sheep to snatch it
const SNATCH_SPEED = 560;             // px/s: faster than this and the claws miss
const ROOF_SNATCH_SPEED = 430;        // ...and a sheep on a roof needs a slower pass
const CARRY_MAX = 2;
const CARRY_SLOW = 0.06;              // top speed lost per sheep carried
const KNOCK_LOOSE = 150;              // px/s of closing speed in a bump that shakes a sheep loose
const TAIL_DIST = 70;                 // px behind a carrier to pluck a sheep from it...
const TAIL_WIDTH = 34;                // ...within this far either side of its line...
const TAIL_TIME = 0.5;                // ...held for this long
const FLEE_R = 220;                   // sheep scatter from a dragon this close
const FLEE_SPEED = 170;               // px/s at their most frightened
const GRAZE_SPEED = 26;
const FIELD_SHEEP = 14;               // sheep grazing at the start of each round
const FIELD_MIN = 11;                 // more wander in while fewer than this are loose
const BELL_FLOCK = 9;                 // sheep following the bellwether
const HARVEST_EVERY = 30;             // the gale's harvest allowance refreshes this often (s)

/** Longhouses on the green: a gabled roof the dragons ride up over, sheep standing on its ridge. */
export interface House { x: number; y: number; angle: number; length: number; width: number; eave: number; ridge: number }
export const HOUSE = { length: 260, width: 120, eave: 26, ridge: 62 };

export type SheepState = 'graze' | 'roof' | 'carried' | 'falling' | 'penned';

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
  /** 0..1 how frightened it is (for the run animation and the bleats). */
  fear: number;
  /** The bellwether itself. */
  bell?: boolean;
  /** Following the bellwether (its id), or -1. */
  follows: number;
  /** A follower streaming into the fold after its bellwether: the dragon it's credited to, or -1. */
  homing: number;
  /** The dragon that last scared it, and when (for crediting a sheep herded into the fold). */
  scarer: number; scaredAt: number;
}

export interface Pen { x: number; y: number; angle: number }

export interface FlockDragon {
  craft: Craft;
  name: string;
  color: string;
  /** Sheep in its claws (ids; -1 marks the second claw taken by the bellwether). */
  carrying: number[];
  score: number;
  ai: FlockAI | null;
}

export interface FlockEvents {
  snatch?(d: number, roof: boolean): void;
  deliver?(d: number, n: number): void;
  /** A sheep ran into the fold; `d` is the dragon credited (-1 for nobody). */
  herded?(d: number): void;
  knock?(d: number): void;
  steal?(thief: number, victim: number): void;
  wall?(d: number, impact: number): void;
  roundOver?(round: number, final: boolean): void;
  roundStart?(round: number): void;
  bellwether?(): void;
}

/** A small seeded generator so a round's sheep are laid out the same way each time it's set up. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export class FlockGame {
  dragons: FlockDragon[] = [];
  sheep: Sheep[] = [];
  /** The fold everyone fills, in the middle of the green. */
  readonly pen: Pen = { x: 0, y: 0, angle: 0 };
  houses: House[] = [];
  /** Seconds since the countdown began. */
  time = 0;
  /** The round being raided (1..ROUNDS), and seconds left of the lull after a horn (0 = raiding). */
  round = 1;
  lull = 0;
  /** Seconds of raiding left in this round. */
  roundLeft = ROUND_TIME;
  over = false;
  /** The bellwether's id once it's out (last round), else -1. */
  bellwether = -1;
  events: FlockEvents = {};
  private nextId = 0;
  private rand: () => number;
  private lastHarvest = 0;
  /** How long each dragon has been tailing each carrier (thief * n + victim). */
  private tails = new Map<number, number>();
  /** Each dragon's own top-speed mod (its species and setup), which carrying is taken off. */
  private baseTop: number[] = [];

  constructor(entrants: { craft: Craft; name: string; color: string; skill: number | null }[], seed = 7) {
    this.rand = rng(seed);
    const n = entrants.length;
    this.baseTop = entrants.map((e) => e.craft.mods.top);
    entrants.forEach((e, i) => {
      // Dragons start evenly round the green, facing the fold (the player, entrant 0, first).
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      const c = e.craft;
      c.pos = { x: Math.cos(a) * START_RING, y: Math.sin(a) * START_RING };
      c.vel = { x: 0, y: 0 };
      c.heading = a + Math.PI;
      c.energy = 0.5;
      this.dragons.push({ craft: c, name: e.name, color: e.color, carrying: [], score: 0, ai: e.skill === null ? null : new FlockAI(e.skill, i) });
    });
    // Longhouses on the green, between the dragons' starting runs, each turned its own way.
    for (let k = 0; k < n; k++) {
      const a = Math.PI / 2 + ((k + 0.5) / n) * Math.PI * 2, r = 1250 + (k % 2) * 250;
      this.houses.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, angle: a + Math.PI / 2 + (k % 2 ? 0.5 : -0.4), ...HOUSE });
    }
    this.layOut();
  }

  get started(): boolean { return this.time >= COUNTDOWN; }
  /** Seconds of raiding left in the whole raid. */
  get left(): number { return this.roundLeft + (ROUNDS - this.round) * ROUND_TIME; }
  /** Raiding now (not in the countdown or a lull, not over). */
  get live(): boolean { return this.started && this.lull <= 0 && !this.over; }
  /** Sheep loose on the green or the roofs (not carried or penned). */
  get loose(): number { return this.sheep.filter((s) => s.state === 'graze' || s.state === 'falling' || s.state === 'roof').length; }

  /** A round's flock: loose clumps on the green, and a sheep or two on each roof. */
  private layOut(): void {
    const field = this.sheep.filter((s) => s.state === 'graze' && s.follows < 0 && !s.bell).length;
    for (let k = field; k < FIELD_SHEEP; k++) {
      const clump = Math.floor(k / 3), ca = clump * 2.1 + 0.4 + this.round, cr = 950 + (clump % 3) * 450;
      this.spawn(Math.cos(ca) * cr + (this.rand() - 0.5) * 160, Math.sin(ca) * cr + (this.rand() - 0.5) * 160);
    }
    for (const h of this.houses) {
      const on = this.sheep.filter((s) => s.state === 'roof' && Math.hypot(s.x - h.x, s.y - h.y) < h.length).length;
      const want = 1 + (this.rand() < 0.5 ? 1 : 0);
      for (let k = on; k < want; k++) {
        const along = (k === 0 ? -0.22 : 0.22) * h.length;
        const s = this.spawn(h.x + Math.cos(h.angle) * along, h.y + Math.sin(h.angle) * along);
        s.state = 'roof'; s.alt = h.ridge; s.heading = h.angle + (this.rand() < 0.5 ? 0 : Math.PI);
      }
    }
  }

  private spawn(x: number, y: number): Sheep {
    const s: Sheep = { id: this.nextId++, x, y, vx: 0, vy: 0, heading: this.rand() * Math.PI * 2, alt: 0, vAlt: 0,
      state: 'graze', owner: -1, tx: x, ty: y, next: this.rand() * 3, fear: 0, follows: -1, homing: -1, scarer: -1, scaredAt: -99 };
    this.sheep.push(s);
    return s;
  }

  /** The bellwether walks out onto the green with its flock behind it. */
  private releaseBellwether(): void {
    const a = this.rand() * Math.PI * 2;
    const ram = this.spawn(Math.cos(a) * 1800, Math.sin(a) * 1800);
    ram.bell = true;
    this.bellwether = ram.id;
    for (let k = 0; k < BELL_FLOCK; k++) {
      const b = (k / BELL_FLOCK) * Math.PI * 2;
      const s = this.spawn(ram.x + Math.cos(b) * (60 + (k % 3) * 30), ram.y + Math.sin(b) * (60 + (k % 3) * 30));
      s.follows = ram.id;
    }
    this.events.bellwether?.();
  }

  /** How high the ground is at a point: the longhouse roofs, gabled along their ridges. */
  groundAt(x: number, y: number): number {
    for (const h of this.houses) {
      const dx = x - h.x, dy = y - h.y;
      const along = dx * Math.cos(h.angle) + dy * Math.sin(h.angle);
      const across = -dx * Math.sin(h.angle) + dy * Math.cos(h.angle);
      if (Math.abs(along) > h.length / 2 || Math.abs(across) > h.width / 2) continue;
      return h.eave + (h.ridge - h.eave) * (1 - Math.abs(across) / (h.width / 2));
    }
    return 0;
  }

  /**
   * One fixed step. `player` is the player's controls (aim angle, brake, gale); AI dragons
   * decide their own.
   */
  step(dt: number, player: { aim: number; brake: boolean; deploy: boolean }): void {
    if (this.over) return;
    this.time += dt;
    const started = this.started;
    // The clock: raiding, then a horn and a lull, then the next round.
    if (started) {
      if (this.lull > 0) {
        this.lull -= dt;
        if (this.lull <= 0) {
          this.lull = 0;
          this.round++;
          this.roundLeft = ROUND_TIME;
          this.layOut();
          if (this.round === ROUNDS) this.releaseBellwether();
          this.events.roundStart?.(this.round);
        }
      } else {
        this.roundLeft = Math.max(0, this.roundLeft - dt);
        if (this.roundLeft <= 0) {
          const final = this.round === ROUNDS;
          this.events.roundOver?.(this.round, final);
          if (final) this.over = true;
          else this.lull = LULL;
        }
      }
    }
    const live = this.live;
    if (live && this.time - this.lastHarvest > HARVEST_EVERY) {
      this.lastHarvest = this.time;
      for (const d of this.dragons) d.craft.harvested = 0;
    }
    // Dragons.
    this.dragons.forEach((d, i) => {
      const c = d.craft;
      c.mods.top = this.baseTop[i] - CARRY_SLOW * d.carrying.length;
      let aim = c.heading, brake = !started, deploy = false;
      if (started) {
        if (d.ai) ({ aim, brake, deploy } = d.ai.think(this, i));
        else ({ aim, brake, deploy } = player);
      }
      c.deploy = deploy;
      c.ground = this.groundAt(c.pos.x, c.pos.y);
      c.step(dt, aim, started, brake);
      // The green's fence: scrape round it like a wall.
      const r = Math.hypot(c.pos.x, c.pos.y), lim = ARENA_R - 22;
      if (r > lim) {
        const nx = -c.pos.x / r, ny = -c.pos.y / r;
        c.pos.x = -nx * lim; c.pos.y = -ny * lim;
        const impact = c.scrape({ x: nx, y: ny }, dt);
        if (impact > 40) this.events.wall?.(i, impact);
      }
    });
    for (let a = 0; a < this.dragons.length; a++) {
      for (let b = a + 1; b < this.dragons.length; b++) {
        const hit = collideCrafts(this.dragons[a].craft, this.dragons[b].craft);
        if (hit > KNOCK_LOOSE && live) { this.shake(a); this.shake(b); }
      }
    }
    if (live) {
      this.snatchAndDeliver();
      this.tailSteal(dt);
    }
    // Sheep.
    for (const s of this.sheep) this.moveSheep(s, dt);
    // New sheep wander in at the fence while the green runs low (not in the last 10 s of a round).
    if (live && this.roundLeft > 10 && this.loose < FIELD_MIN && this.rand() < dt * 1.5) {
      const a = this.rand() * Math.PI * 2, r = ARENA_R - 200 - this.rand() * 300;
      this.spawn(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.dragons.forEach((d, i) => { d.score = this.sheep.filter((s) => s.state === 'penned' && s.owner === i).length; });
  }

  private snatchAndDeliver(): void {
    this.dragons.forEach((d, i) => {
      const c = d.craft;
      if (d.carrying.length < CARRY_MAX) {
        for (const s of this.sheep) {
          if (d.carrying.length >= CARRY_MAX) break;
          const roof = s.state === 'roof';
          if (s.state !== 'graze' && !roof) continue;
          if (c.speed > (roof ? ROOF_SNATCH_SPEED : SNATCH_SPEED)) continue;
          if (Math.abs(c.alt - s.alt) > 34) continue;
          if (Math.hypot(s.x - c.pos.x, s.y - c.pos.y) > SNATCH_DIST) continue;
          // The bellwether is a big ram: it takes both claws.
          if (s.bell && d.carrying.length > 0) continue;
          s.state = 'carried'; s.owner = i;
          d.carrying.push(s.id);
          if (s.bell) d.carrying.push(-1);   // a placeholder: the ram fills the second claw
          this.events.snatch?.(i, roof);
        }
      }
      const pen = this.pen;
      if (d.carrying.length && Math.hypot(pen.x - c.pos.x, pen.y - c.pos.y) < PEN_R + 30) {
        const ids = d.carrying.filter((id) => id >= 0);
        for (const id of ids) this.penIn(this.byId(id)!, i);
        d.carrying = [];
        this.events.deliver?.(i, ids.length);
      }
    });
  }

  /** A dragon that holds station just behind a carrier for a moment plucks one of its sheep. */
  private tailSteal(dt: number): void {
    const n = this.dragons.length;
    for (let t = 0; t < n; t++) {
      const thief = this.dragons[t];
      for (let v = 0; v < n; v++) {
        if (v === t) continue;
        const victim = this.dragons[v], key = t * n + v;
        const free = CARRY_MAX - thief.carrying.length;
        const top = victim.carrying[victim.carrying.length - 1];
        const ram = top !== undefined && (top < 0 || !!this.byId(top)?.bell);
        const can = victim.carrying.length > 0 && free >= (ram ? 2 : 1);
        let behind = false;
        if (can) {
          const vc = victim.craft, tc = thief.craft;
          const fx = Math.cos(vc.heading), fy = Math.sin(vc.heading);
          const dx = tc.pos.x - vc.pos.x, dy = tc.pos.y - vc.pos.y;
          const along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
          behind = along < -10 && along > -TAIL_DIST - 20 && across < TAIL_WIDTH;
        }
        const held = behind ? (this.tails.get(key) ?? 0) + dt : 0;
        this.tails.set(key, held);
        if (held >= TAIL_TIME) {
          this.tails.set(key, 0);
          // Take the last sheep the victim picked up (the whole ram if it's the ram).
          let id = victim.carrying.pop()!;
          if (id < 0) id = victim.carrying.pop()!;
          const s = this.byId(id)!;
          s.owner = t;
          thief.carrying.push(id);
          if (s.bell) thief.carrying.push(-1);
          this.events.steal?.(t, v);
        }
      }
    }
  }

  byId(id: number): Sheep | undefined { return this.sheep.find((s) => s.id === id); }

  /** A hard bump: a carried sheep slips out of the claws and tumbles down. */
  private shake(i: number): void {
    const d = this.dragons[i];
    let id = d.carrying.pop();
    if (id === undefined) return;
    if (id < 0) id = d.carrying.pop()!;   // the ram: both claws let go
    const s = this.byId(id)!;
    s.state = 'falling'; s.owner = -1; s.scarer = -1;
    s.x = d.craft.pos.x; s.y = d.craft.pos.y;
    s.vx = d.craft.vel.x * 0.35; s.vy = d.craft.vel.y * 0.35;
    s.alt = 18 + d.craft.alt; s.vAlt = 60;
    this.events.knock?.(i);
  }

  /** Into the fold, credited to `owner` (-1: nobody brought it in). */
  private penIn(s: Sheep, owner: number): void {
    const pen = this.pen;
    s.state = 'penned'; s.owner = owner; s.homing = -1;
    const a = this.rand() * Math.PI * 2, r = this.rand() * (PEN_R - 50);
    s.x = pen.x + Math.cos(a) * r; s.y = pen.y + Math.sin(a) * r;
    s.tx = s.x; s.ty = s.y; s.alt = 0; s.vx = s.vy = 0; s.fear = 0;
    // A penned bellwether calls its flock: every follower still loose streams to that pen.
    if (s.bell) {
      for (const f of this.sheep) {
        if (f.follows !== s.id) continue;
        if (f.state === 'graze' || f.state === 'falling') f.homing = owner;
        f.follows = -1;
      }
    }
  }

  private moveSheep(s: Sheep, dt: number): void {
    if (s.state === 'carried') {
      const d = this.dragons[s.owner];
      s.x = d.craft.pos.x; s.y = d.craft.pos.y; s.heading = d.craft.heading; s.alt = d.craft.alt;
      return;
    }
    if (s.state === 'roof') return;   // standing on a ridge, waiting to be lifted
    if (s.state === 'falling') {
      s.vAlt -= 420 * dt;
      s.alt += s.vAlt * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const floor = this.groundAt(s.x, s.y);
      if (s.alt <= floor) {
        s.vx *= 0.3; s.vy *= 0.3;
        s.state = floor > 0 ? 'roof' : 'graze';
        s.alt = floor;
        if (this.inFold(s.x, s.y)) this.penIn(s, this.credit(s));
      }
      return;
    }
    if (s.state === 'penned') {
      // Mill about inside the fold.
      const pen = this.pen;
      s.next -= dt;
      if (s.next <= 0) {
        const a = this.rand() * Math.PI * 2, r = this.rand() * (PEN_R - 50);
        s.tx = pen.x + Math.cos(a) * r; s.ty = pen.y + Math.sin(a) * r; s.next = 2 + this.rand() * 4;
      }
      this.amble(s, s.tx, s.ty, GRAZE_SPEED * 0.6, dt);
      return;
    }
    // A follower whose bellwether was penned trots straight to that pen.
    if (s.homing >= 0) {
      const pen = this.pen;
      this.amble(s, pen.x, pen.y, 150, dt);
      if (Math.hypot(pen.x - s.x, pen.y - s.y) < PEN_R - 30) this.penIn(s, s.homing);
      return;
    }
    // Grazing: amble between spots, drawn a little toward the other sheep (followers keep close to
    // their bellwether, wherever it is); scatter from dragons.
    let fx = 0, fy = 0, fear = 0;
    this.dragons.forEach((d, i) => {
      const dx = s.x - d.craft.pos.x, dy = s.y - d.craft.pos.y, dist = Math.hypot(dx, dy);
      if (dist < FLEE_R && dist > 1) {
        const k = (1 - dist / FLEE_R) * clamp(d.craft.speed / 300, 0.3, 1.4) * (s.bell ? 0.6 : 1);
        fx += (dx / dist) * k; fy += (dy / dist) * k;
        if (k > fear) { fear = k; s.scarer = i; s.scaredAt = this.time; }
      }
    });
    s.fear += (Math.min(1, fear) - s.fear) * Math.min(1, dt * 4);
    const leader = s.follows >= 0 ? this.byId(s.follows) : undefined;
    if (fear > 0.05) {
      const l = Math.hypot(fx, fy) || 1;
      const sp = FLEE_SPEED * Math.min(1, fear);
      s.vx += ((fx / l) * sp - s.vx) * Math.min(1, dt * 6);
      s.vy += ((fy / l) * sp - s.vy) * Math.min(1, dt * 6);
      s.next = 0.5;
    } else if (leader) {
      // Keep near the bellwether: trot to catch up if it's far (or being carried off).
      const dx = leader.x - s.x, dy = leader.y - s.y, dist = Math.hypot(dx, dy);
      const want = dist > 120 ? Math.min(140, (dist - 120) * 0.8 + 30) : 0;
      s.vx += (((dx / (dist || 1)) * want) - s.vx) * Math.min(1, dt * 3);
      s.vy += (((dy / (dist || 1)) * want) - s.vy) * Math.min(1, dt * 3);
    } else {
      s.next -= dt;
      if (s.next <= 0) {
        // Pick a new spot nearby, nudged toward the flock's middle.
        let cx = 0, cy = 0, n = 0;
        for (const o of this.sheep) if (o !== s && o.state === 'graze' && Math.hypot(o.x - s.x, o.y - s.y) < 500) { cx += o.x; cy += o.y; n++; }
        const pull = n ? 0.35 : 0;
        const tx = s.x + (this.rand() - 0.5) * 300, ty = s.y + (this.rand() - 0.5) * 300;
        s.tx = n ? tx + (cx / n - tx) * pull : tx; s.ty = n ? ty + (cy / n - ty) * pull : ty;
        s.next = 2 + this.rand() * 5;
      }
      const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy);
      const want = dist > 20 ? GRAZE_SPEED * (s.bell ? 1.4 : 1) : 0;
      s.vx += (((dx / (dist || 1)) * want) - s.vx) * Math.min(1, dt * 2);
      s.vy += (((dy / (dist || 1)) * want) - s.vy) * Math.min(1, dt * 2);
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (Math.hypot(s.vx, s.vy) > 5) s.heading = Math.atan2(s.vy, s.vx);
    // The fence keeps them on the green, and they walk round the longhouses.
    const r = Math.hypot(s.x, s.y), lim = ARENA_R - 60;
    if (r > lim) { s.x *= lim / r; s.y *= lim / r; }
    for (const h of this.houses) {
      const dx = s.x - h.x, dy = s.y - h.y;
      const along = dx * Math.cos(h.angle) + dy * Math.sin(h.angle);
      const across = -dx * Math.sin(h.angle) + dy * Math.cos(h.angle);
      const ha = h.length / 2 + 12, hc = h.width / 2 + 12;
      if (Math.abs(along) < ha && Math.abs(across) < hc) {
        // Step out the nearest side.
        let a2 = along, c2 = across;
        if (ha - Math.abs(along) < hc - Math.abs(across)) a2 = Math.sign(along || 1) * ha;
        else c2 = Math.sign(across || 1) * hc;
        s.x = h.x + Math.cos(h.angle) * a2 - Math.sin(h.angle) * c2;
        s.y = h.y + Math.sin(h.angle) * a2 + Math.cos(h.angle) * c2;
      }
    }
    // Herded into the fold: credited to the dragon that drove it there (a bellwether brings its flock).
    if (this.inFold(s.x, s.y)) {
      const who = this.credit(s);
      this.penIn(s, who);
      this.events.herded?.(who);
    }
  }

  private amble(s: Sheep, tx: number, ty: number, speed: number, dt: number): void {
    const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy);
    const want = dist > 10 ? speed : 0;
    s.vx += (((dx / (dist || 1)) * want) - s.vx) * Math.min(1, dt * 2);
    s.vy += (((dy / (dist || 1)) * want) - s.vy) * Math.min(1, dt * 2);
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (Math.hypot(s.vx, s.vy) > 4) s.heading = Math.atan2(s.vy, s.vx);
  }

  /** Whether a point is inside the fold. */
  inFold(x: number, y: number): boolean { return Math.hypot(this.pen.x - x, this.pen.y - y) < PEN_R; }

  /** Who gets a sheep that ran (or fell) into the fold: the dragon that scared it in the last 3 s. */
  private credit(s: Sheep): number { return s.scarer >= 0 && this.time - s.scaredAt < 3 ? s.scarer : -1; }

  /** The bellwether while it's out and not yet penned, else null. */
  get ram(): Sheep | null {
    const s = this.bellwether >= 0 ? this.byId(this.bellwether) : undefined;
    return s && s.state !== 'penned' ? s : null;
  }

  /** Standings: dragon indices from most sheep penned to least. */
  ranking(): number[] {
    return this.dragons.map((_, i) => i).sort((a, b) => this.dragons[b].score - this.dragons[a].score);
  }
}

/**
 * An AI raider: goes for the loose sheep that's quickest to reach (a little put off by ones another
 * dragon is already after; roof sheep are worth a detour), slows as it closes so its claws can
 * grab, carries two home (or one if nothing else is near, or the round is ending), tails a carrier
 * close by to steal when the chance is there, and in the last round everyone hunts the bellwether.
 */
export class FlockAI {
  target = -1;
  private retarget = 0;
  /** A carrier being tailed (dragon index), or -1. */
  private stalking = -1;
  constructor(public skill: number, private seed: number) {}

  think(g: FlockGame, me: number): { aim: number; brake: boolean; deploy: boolean } {
    const d = g.dragons[me], c = d.craft, pen = g.pen;
    const speed = c.speed;
    if (!g.live) {
      // The lull: circle easily, no hurry.
      return { aim: c.heading + 0.4, brake: speed > 450, deploy: false };
    }
    this.retarget -= 1 / 60;
    const free = 2 - d.carrying.length;
    const loose = g.sheep.filter((s) => s.state === 'graze' || s.state === 'roof');
    const ram = g.ram;
    let tx = 0, ty = 0, slowAt = 0, home = false, tail = false;
    const nearest = loose.reduce((m, s) => Math.min(m, Math.hypot(s.x - c.pos.x, s.y - c.pos.y)), Infinity);
    const carryingRam = d.carrying.some((id) => id >= 0 && !!g.byId(id)?.bell);
    // A carrier worth robbing: close, and we have room (the ram's carrier above all).
    let victim = -1, best = Infinity;
    if (free > 0) {
      const top = Math.max(...g.dragons.map((x) => x.score));
      g.dragons.forEach((o, k) => {
        if (k === me || !o.carrying.length) return;
        const hasRam = o.carrying.some((id) => id >= 0 && !!g.byId(id)?.bell);
        if (hasRam && free < 2) return;
        const dist = Math.hypot(o.craft.pos.x - c.pos.x, o.craft.pos.y - c.pos.y);
        const leader = o.score >= top && o.carrying.length >= 2;
        const reach = hasRam ? 1400 : leader ? 600 : 300 * this.skill;
        const cost = dist - (hasRam ? 800 : 0);
        if (dist < reach && cost < best) { best = cost; victim = k; }
      });
    }
    if (carryingRam || d.carrying.length >= 2 || (d.carrying.length === 1 && nearest > 700) || (d.carrying.length && g.roundLeft < 8)) {
      tx = pen.x; ty = pen.y; home = true;
      this.stalking = -1;
    } else if (ram && ram.state !== 'carried' && free >= 2) {
      // The bellwether's loose: everyone after it.
      tx = ram.x + ram.vx * 0.3; ty = ram.y + ram.vy * 0.3; slowAt = ram.state === 'roof' ? 2 : 1;
      this.stalking = -1;
    } else if (victim >= 0 && (this.stalking === victim || Math.random() < 0.02 + 0.03 * this.skill)) {
      // Tail the carrier: sit just behind it, on its line.
      this.stalking = victim;
      const vc = g.dragons[victim].craft;
      tx = vc.pos.x - Math.cos(vc.heading) * 45; ty = vc.pos.y - Math.sin(vc.heading) * 45;
      tail = true;
    } else {
      this.stalking = -1;
      let s = g.byId(this.target);
      if (!s || (s.state !== 'graze' && s.state !== 'roof') || this.retarget <= 0) {
        // Score each loose sheep by the time to reach it, counting the turn it takes.
        let bestCost = Infinity;
        for (const o of loose) {
          if (o.bell && free < 2) continue;
          const dx = o.x - c.pos.x, dy = o.y - c.pos.y, dist = Math.hypot(dx, dy);
          const turn = Math.abs(wrapAngle(Math.atan2(dy, dx) - c.heading));
          const rivals = g.dragons.filter((x, k) => k !== me && x.ai && x.ai.target === o.id).length;
          const homeRun = Math.hypot(o.x - pen.x, o.y - pen.y) * 0.25;
          // Roof sheep stand still and nobody herds them off: a little more inviting.
          const roof = o.state === 'roof' ? -120 : 0;
          const cost = dist + turn * 260 + rivals * 500 + homeRun + roof + Math.sin(o.id * 7.3 + this.seed) * 60;
          if (cost < bestCost) { bestCost = cost; this.target = o.id; }
        }
        this.retarget = 1.2;
        s = g.byId(this.target);
      }
      if (s) {
        tx = s.x + s.vx * 0.3; ty = s.y + s.vy * 0.3;
        slowAt = s.state === 'roof' ? 2 : 1;
      }
    }
    const dx = tx - c.pos.x, dy = ty - c.pos.y, dist = Math.hypot(dx, dy);
    let aim = Math.atan2(dy, dx);
    const err = wrapAngle(aim - c.heading);
    // Keep off the fence: if heading outward near it, turn back in.
    const r = Math.hypot(c.pos.x, c.pos.y);
    if (r > 2350 && !home) aim = Math.atan2(-c.pos.y, -c.pos.x);
    // Speed: slow enough at the sheep for the claws to catch (slower still for a roof); when
    // tailing, match the carrier's speed; brake to tighten a turn that's too wide.
    const catchSpeed = slowAt === 2 ? 370 : 470 * (0.9 + 0.1 * this.skill);
    let want = slowAt ? catchSpeed + Math.max(0, dist - 60) * 1.1 : Infinity;
    if (tail) want = g.dragons[this.stalking].craft.speed + clamp((dist - 10) * 2, -120, 160);
    const tooWide = Math.abs(err) > 1.1 && dist < 520;
    const brake = speed > want || (tooWide && speed > 260);
    const deploy = (home || (ram !== null && !tail)) && Math.abs(err) < 0.35 && dist > 900 && c.energy > 0.25;
    return { aim, brake, deploy };
  }
}
