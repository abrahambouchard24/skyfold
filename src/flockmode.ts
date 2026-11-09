// Flock Raid's controller: sets a raid up (the player's dragon and five rivals), runs it at the
// game's fixed 60 Hz step with the player's keys, plays its sounds, and drives the view and the
// screens. main.ts hands the frame loop to it while a raid is open (`active`).

import { Craft, clamp } from './craft';
import type { Sound } from './audio';
import { dragonEvents } from './dragon';
import { COUNTDOWN, FlockGame, LULL, ROUNDS } from './flock';
import { FlockUI, TallyRow } from './flockui';
import { FlockView } from './flockview';
import type { Input } from './input';
import type { Car } from './render';

const STEP = 1 / 60;

export interface FlockDeps {
  input: Input;
  sound: Sound;
  /** The race HUD canvas, hidden while a raid is on. */
  hud: HTMLCanvasElement;
  /** A car (dragon) in livery i, with a fresh Craft. */
  makeCar(i: number): Car;
  /** The livery the player picked last (their dragon). */
  playerLivery(): number;
  /** The player's steering: the aim angle for this step (eases like in a race). */
  steer(c: Craft, brake: boolean): number;
  pixelRatio(): number;
  /** Back to the front menu (and the race view). */
  onExit(): void;
}

export class FlockMode {
  active = false;
  private view: FlockView | null = null;
  private ui = new FlockUI();
  private game: FlockGame | null = null;
  private cars: Car[] = [];
  private player: Car | null = null;
  private acc = 0;
  private last = 0;
  private paused = false;
  private finished = false;
  private beeped = 0;
  private savedBeat: typeof dragonEvents.playerBeat = null;
  private bleatWait = 1;

  constructor(private deps: FlockDeps) {}

  /** Open the briefing card. */
  open(): void {
    try { this.view ??= new FlockView(); } catch { this.view = null; }
    this.active = true;
    this.deps.hud.style.visibility = 'hidden';
    this.ui.intro(() => this.start(), () => this.exit());
  }

  private start(): void {
    const first = this.deps.playerLivery();
    const order = [first, ...[0, 1, 2, 3, 4, 5].filter((i) => i !== first)];
    this.cars = order.map((i) => this.deps.makeCar(i));
    this.player = this.cars[0];
    const skills = [0.84, 0.88, 0.9, 0.93, 0.96];
    this.game = new FlockGame(this.cars.map((c, i) => ({
      craft: c.craft, name: c.name.replace(/^\d+\s*/, ''), color: c.color, skill: i === 0 ? null : skills[i - 1],
    })), Math.floor(Math.random() * 1e6));
    for (const c of this.cars) c.race.lapStart = -1;
    const s = this.deps.sound;
    this.game.events = {
      snatch: (d, roof) => { if (d === 0) { s.snatch(); this.ui.flash(roof ? 'OFF THE ROOF!' : 'SNATCHED!'); } },
      steal: (t, v) => {
        if (t === 0) { s.snatch(); this.ui.flash(`STOLEN FROM ${this.game!.dragons[v].name}!`); }
        else if (v === 0) { s.thud(160); this.ui.flash(`${this.game!.dragons[t].name} STOLE ONE!`); }
      },
      roundOver: (round, final) => { if (!final) { s.roundHorn(false); this.ui.flash(`ROUND ${round} DONE`); } },
      bellwether: () => { s.bleat(0, 0.7); this.ui.flash('THE BELLWETHER IS OUT!'); },
      deliver: (d, n) => { if (d === 0) { s.chime(n > 1); this.ui.flash(`+${n} PENNED`); } },
      herded: (d) => { if (d === 0) { s.chime(false); this.ui.flash('+1 DRIVEN IN'); } },
      knock: (d) => { if (d === 0) { s.thud(220); this.ui.flash('SHAKEN LOOSE!'); } },
      wall: (d, impact) => { if (d === 0) s.thud(impact); },
    };
    this.finished = false;
    this.paused = false;
    this.beeped = 0;
    this.acc = 0;
    this.last = performance.now();
    this.ui.hideCard();
    if (this.view) this.view.visible = true;
    this.savedBeat = dragonEvents.playerBeat;
    dragonEvents.playerBeat = (k) => { if (!this.paused && this.game?.started) s.wingbeat(k); };
    s.race('race');
  }

  /** One animation frame while a raid is open. */
  frame(now: number): void {
    const { input, sound } = this.deps;
    const dtReal = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const g = this.game, player = this.player;
    if (!g || !player) return;   // still on the briefing card
    if (input.takePause() && !this.finished) {
      this.paused = !this.paused;
      if (this.paused) { sound.pause(); this.ui.pause(() => this.resume(), () => this.exit()); }
      else this.resume();
    }
    if (!this.paused && !this.finished) {
      this.acc += dtReal;
      while (this.acc >= STEP) {
        const c = player.craft;
        const brake = input.brake;
        g.step(STEP, { aim: this.deps.steer(c, brake), brake, deploy: input.deploy });
        for (const car of this.cars) car.race.lapStart = g.started ? 0 : -1;
        this.acc -= STEP;
      }
      // The countdown: a war drum on each count, the horn to fly.
      const toGo = COUNTDOWN - g.time;
      const count = Math.ceil(toGo);
      if (toGo > 0 && count !== this.beeped && count <= 3) { this.beeped = count; sound.beep(false); }
      if (toGo <= 0 && this.beeped !== -1) { this.beeped = -1; sound.beep(true); }
      const pc = player.craft;
      sound.engine(0, 0, pc.thrust, clamp(pc.speed / 880, 0, 1));
      sound.gale(g.started && pc.deploying);
      this.bleats(dtReal);
      if (g.over) this.finish();
    }
    // HUD.
    const rows: TallyRow[] = g.dragons.map((d, i) => ({ name: d.name, color: d.color, score: d.score, me: i === 0 }));
    const pen = g.pen, pc = player.craft;
    const toPen = Math.atan2(pen.y - pc.pos.y, pen.x - pc.pos.x);
    const camH = this.view?.heading ?? pc.heading;
    const toGo = COUNTDOWN - g.time;
    const call = toGo > 0 ? String(Math.ceil(toGo))
      : toGo > -0.8 ? 'FLY!'
      : g.lull > 0 ? (g.lull > LULL - 1.6 ? 'HORN!' : `ROUND ${g.round + 1}${g.round + 1 === ROUNDS ? ': THE BELLWETHER' : ''}`)
      : null;
    const claws = g.dragons[0].carrying.filter((id) => id >= 0).map((id) => (g.byId(id)?.bell ? 'ram' as const : 'sheep' as const));
    const ram = g.ram;
    const ramAngle = ram && !g.dragons[0].carrying.includes(ram.id) ? Math.atan2(ram.y - pc.pos.y, ram.x - pc.pos.x) - camH : null;
    if (!this.finished) this.ui.update(g.round, ROUNDS, g.lull > 0 ? 0 : g.roundLeft, rows, claws, toPen - camH, ramAngle, call);
    this.view?.render(g, this.cars, player, g.time, this.deps.pixelRatio());
  }

  /**
   * Now and then a sheep near the player bleats, panned to where it is and pitched its own way;
   * frightened ones bleat more often. Never more than a few a second.
   */
  private bleats(dt: number): void {
    const g = this.game, pc = this.player?.craft;
    if (!g || !pc) return;
    this.bleatWait -= dt;
    if (this.bleatWait > 0) return;
    const near = g.sheep.filter((s) => s.state !== 'penned' && Math.hypot(s.x - pc.pos.x, s.y - pc.pos.y) < 900);
    if (!near.length) { this.bleatWait = 0.6; return; }
    const s = near[Math.floor(Math.random() * near.length)];
    const camH = this.view?.heading ?? pc.heading;
    // Pan: where the sheep is relative to the way the camera looks (right of it = +).
    const rel = Math.atan2(s.y - pc.pos.y, s.x - pc.pos.x) - camH;
    const pan = clamp(Math.sin(rel), -1, 1);
    const pitch = 0.85 + ((s.id * 0.37) % 0.35);
    this.deps.sound.bleat(pan, pitch);
    const frightened = near.some((o) => o.fear > 0.4);
    this.bleatWait = frightened ? 0.35 + Math.random() * 0.4 : 1.2 + Math.random() * 2.2;
  }

  /** Dev: step the raid by hand (animation frames stop while the tab is hidden), then draw it. */
  advance(seconds: number): void {
    const end = performance.now() + seconds * 1000;
    this.last = performance.now() - seconds * 1000;
    this.acc = 0;
    // frame() caps one call at 0.25 s, so feed it in slices.
    for (let t = this.last + 250; t <= end + 1; t += 250) this.frame(t);
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
    const rows: TallyRow[] = rank.map((i) => ({ name: g.dragons[i].name, color: g.dragons[i].color, score: g.dragons[i].score, me: i === 0 }));
    const won = g.dragons[rank[0]].score === g.dragons[0].score;
    this.deps.sound.roundHorn(true);
    this.deps.sound.crowd(won);
    this.deps.sound.gale(false);
    this.ui.results(rows, () => this.start(), () => this.exit());
  }

  /** Leave the raid for the front menu. */
  exit(): void {
    this.active = false;
    this.game = null;
    this.player = null;
    this.cars = [];
    if (this.view) this.view.visible = false;
    this.ui.hide();
    if (this.savedBeat !== null) dragonEvents.playerBeat = this.savedBeat;
    this.deps.sound.gale(false);
    this.deps.hud.style.visibility = 'visible';
    this.deps.onExit();
  }
}
