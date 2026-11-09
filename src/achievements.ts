// Achievements and the car skins they unlock. Progress is kept in the browser.
// Each achievement unlocks one skin; pick it with your dragon and it wears it everywhere,
// online included (other players see it too).

/** A skin's colours: hull, dark trim, bright accent stripes, and the glow of the thrusters and pads. */
/** A skin's colours, and the mythic livery pattern painted with them (src/liveries.ts). */
export interface SkinColors { body: string; trim: string; accent: string; glow: string; pattern?: string }

export interface Skin { id: string; name: string; colors: SkinColors | null }

/** 'stock' keeps the car's own livery. */
// Palettes in the game's look: marble, ivory, deep sea teal and gold, with neon as the accent.
export const SKINS: Skin[] = [
  { id: 'stock', name: 'STOCK LIVERY', colors: null },
  { id: 'lime', name: 'NJORD', colors: { body: '#6fd6b8', trim: '#12302c', accent: '#e8d9a8', glow: '#7dffd8', pattern: 'verdigris' } },
  { id: 'graphite', name: 'HEL', colors: { body: '#2a2d36', trim: '#121318', accent: '#c9a24a', glow: '#ffcf7a', pattern: 'obsidian' } },
  { id: 'gold', name: 'ANDVARI', colors: { body: '#e2b54a', trim: '#2a1f0c', accent: '#fff4d6', glow: '#ffe08a', pattern: 'aureus' } },
  { id: 'lightning', name: 'THOR', colors: { body: '#f2efe6', trim: '#1e3a6b', accent: '#4fc3ff', glow: '#9fe3ff', pattern: 'zeus' } },
  { id: 'ghost', name: 'FRIGG', colors: { body: '#f1eee8', trim: '#b9b2a6', accent: '#c9a24a', glow: '#fff3d6', pattern: 'marble' } },
  { id: 'sunset', name: 'SOL', colors: { body: '#ff7a45', trim: '#3a1424', accent: '#ffd27a', glow: '#ff9fd6', pattern: 'sunfire' } },
  { id: 'prism', name: 'FREYJA', colors: { body: '#c9b8ff', trim: '#2a2244', accent: '#7dffe0', glow: '#ffb3ec', pattern: 'opal' } },
  { id: 'chrome', name: 'HERMOD', colors: { body: '#d8dde6', trim: '#6a707c', accent: '#ffffff', glow: '#cfe8ff', pattern: 'platinum' } },
  { id: 'ice', name: 'AEGIR', colors: { body: '#1f6f78', trim: '#0b2a2e', accent: '#e2c27a', glow: '#5fffe6', pattern: 'atlantis' } },
  { id: 'royal', name: 'ODIN', colors: { body: '#3a1f6e', trim: '#140a2a', accent: '#e8c25a', glow: '#c9a6ff', pattern: 'imperial' } },
  { id: 'neonnet', name: 'VOLUND', colors: { body: '#16242a', trim: '#070d10', accent: '#3fffb0', glow: '#3fffd8', pattern: 'circuit' } },
  { id: 'carbon', name: 'NOTT', colors: { body: '#1c1d22', trim: '#0a0a0d', accent: '#ff2d55', glow: '#ff6a85', pattern: 'vanta' } },
  { id: 'valkyrie', name: 'VALKYRIE', colors: { body: '#eef3f8', trim: '#8fa6bd', accent: '#c9e6ff', glow: '#9ff7e6', pattern: 'valkyrie' } },
  { id: 'medusa', name: 'JORMUNGANDR', colors: { body: '#1f6b4a', trim: '#0c241a', accent: '#e3c26a', glow: '#7dffb8', pattern: 'medusa' } },
  { id: 'poseidon', name: 'RAN', colors: { body: '#123f73', trim: '#071a33', accent: '#e8c25a', glow: '#6fe8ff', pattern: 'poseidon' } },
  { id: 'vesta', name: 'LOGI', colors: { body: '#7a1424', trim: '#2a060c', accent: '#ffd27a', glow: '#ffb347', pattern: 'vesta' } },
  { id: 'anubis', name: 'VIDAR', colors: { body: '#121216', trim: '#060608', accent: '#e3b85a', glow: '#4f7dff', pattern: 'anubis' } },
];

export interface Achievement { id: string; name: string; desc: string; skin: string; goal?: number }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'graduate', name: 'FLEDGLING', desc: 'Finish the first flight (How to Play)', skin: 'lime' },
  { id: 'first-flag', name: 'FIRST FLIGHT', desc: 'Finish a race', skin: 'graphite' },
  { id: 'winner', name: 'VICTORY', desc: 'Win a race', skin: 'gold' },
  { id: 'perfect-launch', name: 'PERFECT LEAP', desc: 'Leap off the line at the perfect moment', skin: 'lightning' },
  { id: 'clean-sheet', name: 'UNSCATHED', desc: 'Finish a race of 3 laps or more without touching a wall', skin: 'ghost' },
  { id: 'drift-king', name: 'WINDRIDER', desc: 'Gather a full gale within a single lap', skin: 'sunset' },
  { id: 'grand-tour', name: 'WANDERER', desc: 'Finish a race in 8 different realms', skin: 'prism', goal: 8 },
  { id: 'grand-slam', name: 'CONQUEROR', desc: 'Win in 4 different realms', skin: 'chrome', goal: 4 },
  { id: 'record-breaker', name: 'RUNECARVER', desc: 'Carve a lap record into 3 realms', skin: 'ice', goal: 3 },
  { id: 'champion', name: 'SAGA HERO', desc: 'Win a saga', skin: 'royal' },
  { id: 'online-debut', name: 'FIRST MOOT', desc: 'Finish an online race', skin: 'neonnet' },
  { id: 'online-victor', name: 'MOOT VICTOR', desc: 'Win an online race', skin: 'carbon' },
  { id: 'sky-high', name: 'SKY HIGH', desc: 'Take every jump in a sprint', skin: 'valkyrie' },
  { id: 'untouchable', name: 'UNTOUCHABLE', desc: 'Finish a sprint without touching a wall', skin: 'medusa' },
  { id: 'five-realms', name: 'FIVE REALMS', desc: 'Win on all five sprints', skin: 'poseidon', goal: 5 },
  { id: 'devoted', name: 'DEVOTED', desc: 'Meet the daily challenge 7 days in a row', skin: 'vesta', goal: 7 },
  { id: 'phantom', name: 'PHANTOM', desc: 'Beat your Time Trial ghost by a full second', skin: 'anubis' },
];

/** Online race history, from this player's own point of view. */
export interface OnlineRecord { races: number; wins: number; podiums: number; best: number }

export interface Progress {
  unlocked: string[];
  equipped: string;
  tracksFinished: string[];
  tracksWon: string[];
  recordTracks: string[];
  online: OnlineRecord;
  /** Sprints won (for FIVE REALMS) and the longest daily streak (for DEVOTED). */
  sprintsWon: string[];
  bestStreak: number;
}

const KEY = 'skyfold-progress';

export function loadProgress(): Progress {
  const blank: Progress = { unlocked: [], equipped: 'stock', tracksFinished: [], tracksWon: [], recordTracks: [], online: { races: 0, wins: 0, podiums: 0, best: 0 }, sprintsWon: [], bestStreak: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return blank;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    const n = (v: unknown) => (typeof v === 'number' && v >= 0 ? Math.floor(v) : 0);
    const p: Progress = {
      unlocked: list(raw.unlocked), equipped: typeof raw.equipped === 'string' ? raw.equipped : 'stock',
      tracksFinished: list(raw.tracksFinished), tracksWon: list(raw.tracksWon), recordTracks: list(raw.recordTracks),
      online: { races: n(raw.online?.races), wins: n(raw.online?.wins), podiums: n(raw.online?.podiums), best: n(raw.online?.best) },
      sprintsWon: list(raw.sprintsWon), bestStreak: n(raw.bestStreak),
    };
    if (!skinUnlocked(p, p.equipped)) p.equipped = 'stock';
    return p;
  } catch { return blank; }
}

export function saveProgress(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not kept */ }
}

export function skinUnlocked(p: Progress, skinId: string): boolean {
  if (skinId === 'stock') return true;
  const a = ACHIEVEMENTS.find((x) => x.skin === skinId);
  return !!a && p.unlocked.includes(a.id);
}

export function skinColors(id: string | undefined): SkinColors | null {
  return SKINS.find((s) => s.id === id)?.colors ?? null;
}

/** How far along a counted achievement is (for the Garage's progress bars). */
export function progressOf(p: Progress, a: Achievement): number {
  if (p.unlocked.includes(a.id)) return a.goal ?? 1;
  if (a.id === 'grand-tour') return p.tracksFinished.length;
  if (a.id === 'grand-slam') return p.tracksWon.length;
  if (a.id === 'record-breaker') return p.recordTracks.length;
  if (a.id === 'five-realms') return p.sprintsWon.length;
  if (a.id === 'devoted') return Math.min(7, p.bestStreak);
  return 0;
}

/** What happened in a race the player just finished, for checking achievements. */
export interface RaceOutcome {
  track: string;
  place: number;          // 1-based
  racers: number;
  laps: number;
  online: boolean;
  tutorial: boolean;
  /** A Story mission or the tutorial: counts for most things, but not track wins or records. */
  special: boolean;
  touchedWall: boolean;
  driftCharge: number;    // most battery charged by drifting in any one lap (0..1)
  /** A sprint run, and how many of its jumps the player took (of how many). */
  sprint?: boolean;
  jumpsTaken?: number;
  jumps?: number;
}

/**
 * Tracks achievements. unlock() returns the achievement the first time it's earned (null after),
 * so the game can announce it.
 */
export class Achievements {
  p = loadProgress();
  /** Called with each newly earned achievement. */
  onUnlock: (a: Achievement) => void = () => {};

  unlock(id: string): void {
    if (this.p.unlocked.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.p.unlocked.push(id);
    saveProgress(this.p);
    this.onUnlock(a);
  }

  equip(skin: string): void {
    if (!skinUnlocked(this.p, skin)) return;
    this.p.equipped = skin;
    saveProgress(this.p);
  }

  get equipped(): string { return this.p.equipped; }

  raceFinished(o: RaceOutcome): void {
    if (o.tutorial) { this.unlock('graduate'); return; }
    this.unlock('first-flag');
    if (o.place === 1 && o.racers > 1) this.unlock('winner');
    if (!o.touchedWall && o.laps >= 3) this.unlock('clean-sheet');
    if (o.sprint) {
      if (!o.touchedWall) this.unlock('untouchable');
      if (o.jumps && (o.jumpsTaken ?? 0) >= o.jumps) this.unlock('sky-high');
      if (!o.special && o.place === 1 && o.racers > 1 && !this.p.sprintsWon.includes(o.track)) {
        this.p.sprintsWon.push(o.track);
        saveProgress(this.p);
        if (this.p.sprintsWon.length >= 5) this.unlock('five-realms');
      }
    }
    if (o.driftCharge >= 0.99) this.unlock('drift-king');
    if (!o.special) {
      if (!this.p.tracksFinished.includes(o.track)) this.p.tracksFinished.push(o.track);
      if (o.place === 1 && o.racers > 1 && !this.p.tracksWon.includes(o.track)) this.p.tracksWon.push(o.track);
      saveProgress(this.p);
      if (this.p.tracksFinished.length >= 8) this.unlock('grand-tour');
      if (this.p.tracksWon.length >= 4) this.unlock('grand-slam');
    }
    if (o.online) {
      this.unlock('online-debut');
      if (o.place === 1 && o.racers > 1) this.unlock('online-victor');
    }
  }

  /** A daily challenge met: the streak of days in a row so far. */
  dailyStreak(streak: number): void {
    if (streak > this.p.bestStreak) { this.p.bestStreak = streak; saveProgress(this.p); }
    if (streak >= 7) this.unlock('devoted');
  }

  /** The player's personal online record, updated after each online race. */
  onlineRace(place: number): void {
    const r = this.p.online;
    r.races++;
    if (place === 1) r.wins++;
    if (place <= 3) r.podiums++;
    r.best = r.best === 0 ? place : Math.min(r.best, place);
    saveProgress(this.p);
  }

  recordSet(track: string): void {
    if (!this.p.recordTracks.includes(track)) { this.p.recordTracks.push(track); saveProgress(this.p); }
    if (this.p.recordTracks.length >= 3) this.unlock('record-breaker');
  }
}
