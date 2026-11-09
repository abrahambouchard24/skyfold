// Ghost laps for Time Trial: the player's best lap on each track, recorded as positions and
// headings 30 times a second, saved in the browser, and replayed as a see-through car.

const KEY = 'skyfold-ghosts';
export const GHOST_RATE = 30;   // frames per second

/**
 * One recorded lap. frames is flat [x, y, heading, alt, x, y, heading, alt, ...] from the lap's start
 * (stride 4; ghosts saved before sprint jumps have no alt, stride 3).
 */
export interface GhostLap { time: number; livery: number; skin?: string; frames: number[]; sig?: string; stride?: number }

function loadAll(): Record<string, GhostLap> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

/** The saved ghost for a track; sig is the track's shape, so a ghost from an older layout is ignored. */
export function loadGhost(track: string, sig: string): GhostLap | null {
  const g = loadAll()[track];
  return g && Array.isArray(g.frames) && g.frames.length >= 6 && (g.sig ?? '') === sig ? g : null;
}

/** A fingerprint of a track's shape (its samples), stored with each ghost. */
export function trackSig(pts: { x: number; y: number }[]): string {
  let h = 0;
  for (let i = 0; i < pts.length; i += 7) h = (h * 31 + Math.round(pts[i].x) * 7 + Math.round(pts[i].y)) | 0;
  return `${pts.length}:${h >>> 0}`;
}

export function saveGhost(track: string, g: GhostLap): void {
  const all = loadAll();
  all[track] = g;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full: keep it for this session only */ }
}

/** Records the lap in progress: call reset() as a lap starts and step() every physics step. */
export class GhostRecorder {
  private frames: number[] = [];
  private steps = 0;
  reset(): void { this.frames = []; this.steps = 0; }
  /** stepRate = physics steps per second (60); keeps every (stepRate / GHOST_RATE)th step. */
  step(x: number, y: number, heading: number, alt: number, stepRate: number): void {
    if (this.steps++ % Math.round(stepRate / GHOST_RATE) === 0) {
      this.frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(heading * 1000) / 1000, Math.round(alt * 10) / 10);
    }
  }
  take(): number[] { const f = this.frames; this.reset(); return f; }
}

/** Where the ghost is t seconds into its lap (null once the lap is over). */
export function ghostPose(g: GhostLap, t: number): { x: number; y: number; heading: number; vx: number; vy: number; alt: number } | null {
  const st = g.stride ?? 3;
  const n = g.frames.length / st;
  const f = t * GHOST_RATE;
  if (f < 0 || f >= n - 1) return null;
  const i = Math.floor(f), k = f - i, a = i * st, b = a + st, fr = g.frames;
  let dh = fr[b + 2] - fr[a + 2];
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  return {
    x: fr[a] + (fr[b] - fr[a]) * k,
    y: fr[a + 1] + (fr[b + 1] - fr[a + 1]) * k,
    heading: fr[a + 2] + dh * k,
    vx: (fr[b] - fr[a]) * GHOST_RATE,
    vy: (fr[b + 1] - fr[a + 1]) * GHOST_RATE,
    alt: st >= 4 ? fr[a + 3] + (fr[b + 3] - fr[a + 3]) * k : 0,
  };
}
