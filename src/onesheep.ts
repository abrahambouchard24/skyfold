// One Sheep: a race on a realm circuit with a single sheep on the road. Whoever carries it scores a
// point for every sector of the lap they cover with it. It's lost by being tailed (a dragon holding
// close behind the carrier for a moment) or bumped hard, or by hitting a wall hard: the sheep drops
// onto the road where it was lost. Snatching it needs a slow pass, so at racing speed the pack flies
// on past a dropped sheep, and it's usually taken again the next time round, by whoever lifts for it.
// Carrying slows you, so the pack always comes back to the carrier. Most points when the first
// dragon finishes the laps wins.
// Pure game logic, like craft.ts: no DOM, no drawing.

import { Craft, clamp, collideCrafts } from './craft';
import { Driver } from './ai';
import { RaceState, SECTORS, Track, collideWalls, inCoolingLane, lateral, placeOnGrid } from './track';
import type { Sheep } from './flock';

export const LAPS = 4;
export const COUNTDOWN = 3;
const SNATCH_DIST = 50;           // px between a dragon and the sheep to snatch it
export const SNATCH_SPEED = 430;  // px/s: faster than this and the claws miss
const CARRY_SLOW = 0.08;          // top speed lost while carrying it...
const CARRY_GRIP = 0.12;          // ...and grip, so it's slower through the corners too: the pack always catches up
const TAIL_DIST = 80;             // px behind the carrier, on its line...
const TAIL_WIDTH = 42;            // ...within this far either side...
const TAIL_TIME = 0.45;           // ...for this long makes it drop the sheep
const KNOCK_LOOSE = 150;          // px/s of closing speed in a bump that knocks it loose
const WALL_DROP = 240;            // px/s into a wall that makes the carrier lose it
const HUNT_MAX = 0.08;            // most extra pace a dragon hunting the carrier gets
const NO_RETAKE = 1.5;            // seconds the dragon that lost it can't snatch it straight back

export interface OneSheepRider { craft: Craft; race: RaceState; driver: Driver | null }

export interface OneSheepEvents {
  snatch?(d: number): void;
  drop?(d: number, cause: 'tail' | 'bump' | 'wall', by: number): void;
  point?(d: number): void;
  wall?(d: number, impact: number): void;
  lap?(d: number, lap: number): void;
}

export class OneSheepGame {
  /** Seconds since the countdown began. */
  time = 0;
  over = false;
  /** The dragon carrying the sheep (index), or -1. */
  carrier = -1;
  points: number[];
  sheep: Sheep;
  events: OneSheepEvents = {};
  private lastSector: number[];
  private tailFor = 0;
  private tailBy = -1;
  private noRetake = { who: -1, until: 0 };
  /** The sheep's nearest track sample (kept up to date for the AI and the HUD). */
  sheepIndex = 0;

  /** Each dragon's own mods (species, setup), which carrying the sheep is taken off. */
  private baseMods: { top: number; grip: number }[];

  constructor(readonly track: Track, readonly riders: OneSheepRider[]) {
    this.baseMods = riders.map((r) => ({ top: r.craft.mods.top, grip: r.craft.mods.grip }));
    riders.forEach((r, i) => { r.race.index = placeOnGrid(track, r.craft, i); r.craft.energy = 0.5; });
    this.points = riders.map(() => 0);
    this.lastSector = riders.map(() => -1);
    // The sheep grazes on the road a quarter of a lap ahead of the grid.
    const i0 = Math.floor(track.length * 0.25), p = track.pts[i0];
    this.sheep = {
      id: 0, x: p.x, y: p.y, vx: 0, vy: 0, heading: track.direction(i0), alt: 0, vAlt: 0, state: 'graze', owner: -1,
      tx: p.x, ty: p.y, next: 1, fear: 0, follows: -1, homing: -1, scarer: -1, scaredAt: -99,
    };
    this.sheepIndex = i0;
  }

  get started(): boolean { return this.time >= COUNTDOWN; }
  /** Laps completed by the furthest dragon. */
  get leaderLap(): number { return Math.max(...this.riders.map((r) => r.race.lap)); }

  step(dt: number, player: { aim: number; brake: boolean; deploy: boolean }): void {
    if (this.over) return;
    this.time += dt;
    const racing = this.started, t = this.track;
    const crafts = this.riders.map((r) => r.craft);
    for (const c of crafts) c.feelWake(crafts, dt);
    // The hunt: every dragon behind the carrier gets a little extra pace, more the further back it
    // is, so the pack always closes on the sheep.
    this.riders.forEach((r, i) => {
      r.craft.catchUp = 0;
      if (this.carrier < 0 || i === this.carrier || !racing) return;
      const cr = this.riders[this.carrier];
      const gap = ((t.dist[cr.race.index] - t.dist[r.race.index]) % t.totalLength + t.totalLength) % t.totalLength;
      if (gap < t.totalLength * 0.7) r.craft.catchUp = Math.min(HUNT_MAX, (gap / 300) * 0.01);
    });
    this.setGoals();
    this.riders.forEach((r, i) => {
      const c = r.craft;
      c.mods.top = this.baseMods[i].top - (i === this.carrier ? CARRY_SLOW : 0);
      // Hunters corner a little harder too (the AI's corner speeds follow grip), the carrier less hard.
      c.mods.grip = this.baseMods[i].grip - (i === this.carrier ? CARRY_GRIP : 0) + c.catchUp * 1.5;
      if (!racing) { c.step(dt, c.heading, false, false); return; }
      if (r.driver) {
        const ctl = r.driver.think(t, this.time, this.riders.map((x) => ({ craft: x.craft, race: x.race })));
        c.deploy = ctl.deploy;
        c.step(dt, ctl.aim, ctl.throttle, ctl.brake);
      } else {
        c.deploy = player.deploy;
        c.step(dt, player.aim, !player.brake, player.brake);
      }
    });
    for (let a = 0; a < this.riders.length; a++) {
      for (let b = a + 1; b < this.riders.length; b++) {
        const hit = collideCrafts(crafts[a], crafts[b]);
        if (hit > KNOCK_LOOSE && (a === this.carrier || b === this.carrier)) this.drop('bump', a === this.carrier ? b : a);
      }
    }
    this.riders.forEach((r, i) => {
      const lap = r.race.update(t, r.craft, this.time, racing);
      if (lap) {
        r.craft.harvested = 0;
        this.events.lap?.(i, r.race.lap);
        if (r.race.lap >= LAPS) this.over = true;
      }
      const contact = collideWalls(t, r.craft, r.race, dt);
      if (contact) {
        this.events.wall?.(i, contact.impact);
        if (i === this.carrier && contact.impact > WALL_DROP) this.drop('wall', -1);
      }
      r.craft.cooling = inCoolingLane(t, r.craft, r.race.index);
    });
    if (racing) {
      this.tail(dt);
      this.snatch();
      this.score();
    }
    this.moveSheep(dt);
  }

  /** The AI's goals: make for the loose sheep (slow enough to grab it), or tail its carrier. */
  private setGoals(): void {
    const t = this.track;
    this.riders.forEach((r, i) => {
      const d = r.driver;
      if (!d) return;
      d.goal = null;
      if (i === this.carrier) return;
      if (this.carrier < 0 && this.sheep.state === 'graze') {
        if (this.noRetake.who === i && this.time < this.noRetake.until) return;
        d.goal = { index: this.sheepIndex, lat: lateral(t, { pos: { x: this.sheep.x, y: this.sheep.y } } as Craft, this.sheepIndex), speed: SNATCH_SPEED - 70, near: 90 };
      } else if (this.carrier >= 0) {
        const cr = this.riders[this.carrier];
        const gapPx = ((t.dist[cr.race.index] - t.dist[r.race.index]) % t.totalLength + t.totalLength) % t.totalLength;
        // Only dragons close behind the carrier go for its tail; the rest race on.
        const ahead = t.totalLength - gapPx;   // how far we are past the carrier, if we are
        if (gapPx < 2600 || ahead < 900) {
          const behind = t.shift(cr.race.index, -2);
          d.goal = { index: behind, lat: lateral(t, cr.craft, cr.race.index), speed: cr.craft.speed + (gapPx > 300 && gapPx < 2600 ? 200 : 30), near: 10, wait: 900 };
        }
      }
    });
  }

  /** Someone holding close behind the carrier for a moment makes it drop the sheep. */
  private tail(dt: number): void {
    if (this.carrier < 0) { this.tailFor = 0; return; }
    const vc = this.riders[this.carrier].craft;
    const fx = Math.cos(vc.heading), fy = Math.sin(vc.heading);
    let who = -1;
    this.riders.forEach((r, i) => {
      if (i === this.carrier) return;
      const dx = r.craft.pos.x - vc.pos.x, dy = r.craft.pos.y - vc.pos.y;
      const along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
      if (along < -10 && along > -TAIL_DIST && across < TAIL_WIDTH) who = i;
    });
    if (who >= 0 && who === this.tailBy) this.tailFor += dt;
    else { this.tailFor = who >= 0 ? dt : 0; this.tailBy = who; }
    if (this.tailFor >= TAIL_TIME) this.drop('tail', who);
  }

  /** How long the current tail has been held, 0..1 of what it takes (for the HUD). */
  get tailing(): { by: number; k: number } { return { by: this.tailBy, k: this.carrier >= 0 ? clamp(this.tailFor / TAIL_TIME, 0, 1) : 0 }; }

  /** The carrier loses the sheep: it tumbles onto the road where it was lost. */
  private drop(cause: 'tail' | 'bump' | 'wall', by: number): void {
    const d = this.carrier;
    if (d < 0) return;
    const c = this.riders[d].craft, s = this.sheep;
    this.carrier = -1;
    this.tailFor = 0; this.tailBy = -1;
    s.state = 'falling'; s.owner = -1;
    s.x = c.pos.x; s.y = c.pos.y; s.vx = c.vel.x * 0.25; s.vy = c.vel.y * 0.25;
    s.alt = 16 + c.alt; s.vAlt = 70;
    this.noRetake = { who: d, until: this.time + NO_RETAKE };
    this.events.drop?.(d, cause, by);
  }

  private snatch(): void {
    if (this.carrier >= 0 || this.sheep.state !== 'graze') return;
    const s = this.sheep;
    this.riders.forEach((r, i) => {
      if (this.carrier >= 0) return;
      if (this.noRetake.who === i && this.time < this.noRetake.until) return;
      const c = r.craft;
      if (c.speed > SNATCH_SPEED || c.alt > 30) return;
      if (Math.hypot(c.pos.x - s.x, c.pos.y - s.y) > SNATCH_DIST) return;
      this.carrier = i;
      s.state = 'carried'; s.owner = i;
      this.lastSector[i] = this.sector(r.race.index);
      this.events.snatch?.(i);
    });
  }

  private sector(index: number): number { return Math.floor((index / this.track.length) * SECTORS); }

  /** A point for each sector boundary the carrier crosses with the sheep. */
  private score(): void {
    this.riders.forEach((r, i) => {
      const sec = this.sector(r.race.index);
      const last = this.lastSector[i];
      if (i === this.carrier && last >= 0 && sec === (last + 1) % SECTORS) {
        this.points[i]++;
        this.events.point?.(i);
      }
      this.lastSector[i] = sec;
    });
  }

  private moveSheep(dt: number): void {
    const s = this.sheep, t = this.track;
    if (s.state === 'carried') {
      const c = this.riders[this.carrier].craft;
      s.x = c.pos.x; s.y = c.pos.y; s.heading = c.heading; s.alt = c.alt;
    } else if (s.state === 'falling') {
      s.vAlt -= 420 * dt;
      s.alt += s.vAlt * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.alt <= 0) { s.alt = 0; s.vx = s.vy = 0; s.state = 'graze'; s.next = 1; }
    } else {
      // Grazing on the road: a slow amble, startled sideways by dragons flashing past.
      let fx = 0, fy = 0, fear = 0;
      for (const r of this.riders) {
        const dx = s.x - r.craft.pos.x, dy = s.y - r.craft.pos.y, dist = Math.hypot(dx, dy);
        if (dist < 160 && dist > 1) { const k = 1 - dist / 160; fx += (dx / dist) * k; fy += (dy / dist) * k; fear = Math.max(fear, k); }
      }
      s.fear += (Math.min(1, fear) - s.fear) * Math.min(1, dt * 4);
      s.next -= dt;
      if (s.next <= 0) {
        s.tx = s.x + (Math.random() - 0.5) * 120; s.ty = s.y + (Math.random() - 0.5) * 120;
        s.next = 2 + Math.random() * 3;
      }
      const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy) || 1;
      const want = fear > 0.05 ? 0 : dist > 15 ? 22 : 0;
      s.vx += ((dx / dist) * want + fx * 120 - s.vx) * Math.min(1, dt * 3);
      s.vy += ((dy / dist) * want + fy * 120 - s.vy) * Math.min(1, dt * 3);
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (Math.hypot(s.vx, s.vy) > 5) s.heading = Math.atan2(s.vy, s.vx);
    }
    // Keep it on the road (it never leaves the track), and know where on the lap it is.
    this.sheepIndex = t.nearest({ x: s.x, y: s.y }, this.sheepIndex).index;
    if (s.state !== 'carried') {
      const p = t.pts[this.sheepIndex];
      const lat = (s.x - p.x) * p.nx + (s.y - p.y) * p.ny, lim = t.outer[this.sheepIndex] - 40;
      if (Math.abs(lat) > lim) {
        const k = Math.sign(lat) * lim - lat;
        s.x += p.nx * k; s.y += p.ny * k;
      }
    }
  }

  /** Standings: rider indices by points, then by how far round they are. */
  ranking(): number[] {
    return this.riders.map((_, i) => i).sort((a, b) =>
      this.points[b] - this.points[a] || this.riders[b].race.progress(this.track) - this.riders[a].race.progress(this.track));
  }
}
