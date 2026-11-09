// AI drivers: look ahead along the centerline, steer for a point in front, brake for the
// tightest bend coming up. On top of that they race: commit to a side to overtake, cover the
// inside when someone is right behind into a corner, and now and then make a mistake.
// Pure logic, like craft.ts.

import { Craft, clamp } from './craft';
import { COOL_LANE, HALF_WIDTH, RaceState, Track, lateral } from './track';

export interface Controls { aim: number; throttle: boolean; brake: boolean; deploy: boolean }

/** What the AI can see of another car. */
export interface Rival { craft: Craft; race: RaceState }

type Mistake = { kind: 'late-brake' | 'run-wide'; left: number } | null;

const PASS_LOOK = 14;          // samples ahead (~260 px) to start setting up a pass
const PASS_COMMIT = 1.6;       // seconds to stick with a chosen passing side
const PASS_GAP = 62;           // px beside the other car's line when going round it
const DEFEND_LOOK = 8;         // samples behind (~150 px) that count as "someone's on my tail"
const MAX_OFFSET = HALF_WIDTH * 0.72;

export class Driver {
  craft = new Craft();
  race = new RaceState();
  cornerK = CORNER_K;
  insideBias = INSIDE_BIAS;
  /** How much of the slip angle the AI steers against (sign from testing; see CLAUDE.md). */
  slipCorrect = 0.5;
  /** Which side we're passing on (+1 = track-left, -1 = track-right), and for how long. */
  private passSide = 0;
  private passTimer = 0;
  private mistake: Mistake = null;
  private lastTime = 0;
  /** What the driver is doing right now, for debugging and tests. */
  state: 'racing' | 'passing' | 'defending' | 'cooling' | 'mistake' = 'racing';
  /** Sprints: the lane chosen for the split ahead (+1 / -1), or 0 when not in or near one. */
  private lane = 0;

  /** skill 1 = near the grip limit with no mistakes; lower = slower corners, more weave, more errors. */
  constructor(public skill = 0.92, private seed = 1) {}

  think(track: Track, time: number, others: Rival[] = []): Controls {
    const dt = clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    const m = track.length;
    const c = this.craft;
    const i = this.race.index;
    const speed = c.speed;
    const myProgress = this.race.progress(track);

    // The tightest bend in the braking zone, and which side its inside is on.
    let maxCurve = 0, cornerCurve = 0;
    const zone = 12 + Math.round(speed / 22);
    for (let k = 4; k < zone; k++) {
      const cv = track.pts[track.shift(i, k)].curve;
      if (Math.abs(cv) > maxCurve) { maxCurve = Math.abs(cv); cornerCurve = cv; }
    }
    const insideSign = cornerCurve * this.insideBias > 0 ? 1 : -1;
    const cornerComing = maxCurve > 1 / 700;

    // Base line: aim further ahead the faster we go, nudged toward the inside of the bend,
    // with a slow weave so the AI doesn't drive a robotic perfect line.
    const look = 10 + Math.round(speed / 45);
    const aheadIndex = track.shift(i, look);
    const ahead = track.pts[aheadIndex];
    let off = clamp(ahead.curve * this.insideBias, -1, 1) * HALF_WIDTH * 0.45;
    off += Math.sin(time * 0.7 + this.seed * 2.1) * HALF_WIDTH * 0.25 * (1.05 - this.skill);

    // Find the nearest car just ahead and just behind on track.
    let front: Rival | null = null, frontGap = Infinity, rearGap = Infinity;
    for (const o of others) {
      if (o.craft === c) continue;
      const gap = o.race.progress(track) - myProgress;
      if (gap > 0 && gap < PASS_LOOK && gap < frontGap) { front = o; frontGap = gap; }
      if (gap < 0 && -gap < DEFEND_LOOK) rearGap = Math.min(rearGap, -gap);
    }

    this.passTimer = Math.max(0, this.passTimer - dt);
    this.state = 'racing';

    if (front) {
      // Overtake: pick the side with more room (the inside of a coming corner if there's space)
      // and commit to it for a while, so we don't dither left-right behind them.
      const oLat = lateral(track, front.craft, front.race.index);
      if (this.passTimer === 0) {
        const roomLeft = HALF_WIDTH - oLat, roomRight = HALF_WIDTH + oLat;
        const insideRoom = insideSign > 0 ? roomLeft : roomRight;
        this.passSide = cornerComing && insideRoom > 90 ? insideSign : roomLeft >= roomRight ? 1 : -1;
        this.passTimer = PASS_COMMIT;
      }
      off = oLat + this.passSide * PASS_GAP;
      this.state = 'passing';
    } else if (rearGap < Infinity && cornerComing) {
      // Defend: someone's on our tail into a corner, so cover the inside line.
      off = insideSign * HALF_WIDTH * 0.55;
      this.state = 'defending';
    }

    // Running hot with the cooling lane coming up (or underneath us): move over onto it.
    const toLane = (COOL_LANE.from - i + m) % m;
    const onLaneStretch = i >= COOL_LANE.from && i <= COOL_LANE.to;
    const wantLane = c.heat > 0.45 && (onLaneStretch || toLane < 40);
    if (wantLane) this.state = 'cooling';

    // Mistakes: now and then brake too late or run wide for a moment.
    if (this.mistake) {
      this.mistake.left -= dt;
      if (this.mistake.left <= 0) this.mistake = null;
    } else if (cornerComing && speed > 300 && Math.random() < (1 - this.skill) * 0.25 * dt) {
      this.mistake = { kind: Math.random() < 0.5 ? 'late-brake' : 'run-wide', left: 1.1 };
    }
    if (this.mistake) {
      this.state = 'mistake';
      if (this.mistake.kind === 'run-wide') off = -insideSign * HALF_WIDTH * 0.7;
    }

    off = clamp(off, -MAX_OFFSET, MAX_OFFSET);
    // A split ahead (sprints): pick a lane once (the jump most of the time, the bypass now and
    // then, more often for weaker drivers) and drive down the middle of it until the road rejoins.
    const isl = Math.max(track.island[aheadIndex], track.island[i]);
    if (isl > 1) {
      if (this.lane === 0) {
        // Choose by what each lane offers and what the craft needs right now.
        const fork = track.forkAt(aheadIndex) ?? track.forkAt(i);
        if (fork) {
          const worth = (kind: string, side: number) => {
            let v = kind === 'jump' ? 1.0 + 0.3 * this.skill : kind === 'boost' ? 1.05
              : kind === 'charge' ? 0.5 + (1 - c.energy) * 1.1 : kind === 'cool' ? 0.35 + c.heat * 2.4
              : kind === 'fire' ? 1.1 - c.heat * 2 : 0.6;
            if (fork.curve && side === fork.sign) v += 0.5 * this.skill;   // the shorter inside line
            return v + (Math.random() - 0.5) * 0.5;
          };
          this.lane = worth(fork.left, 1) >= worth(fork.right, -1) ? 1 : -1;
        } else {
          this.lane = Math.random() < 0.5 ? 1 : -1;
        }
      }
      // Once the island has started, stay in the lane we're actually in (never cut across its nose).
      const myLat = lateral(track, c, i);
      if (track.island[i] > 12 && Math.sign(myLat) !== this.lane && myLat !== 0) this.lane = Math.sign(myLat);
      const islA = track.island[aheadIndex], outA = track.outer[aheadIndex];
      off = this.lane * (islA > 1 ? (islA + outA) / 2 : Math.max(HALF_WIDTH * 0.3, Math.abs(off)));
    } else {
      this.lane = 0;
    }
    // The lane hugs the wall, past the normal line limit: aim right along it.
    if (wantLane && this.state === 'cooling') off = COOL_LANE.side * (HALF_WIDTH - 16);
    // Steer for the chosen line at the look-ahead point.
    const tx = ahead.x + ahead.nx * off, ty = ahead.y + ahead.ny * off;
    // Steer so the car's actual travel (not just its nose) heads for the line: when sliding,
    // point further into the turn by the slip angle.
    const aim = Math.atan2(ty - c.pos.y, tx - c.pos.x) - c.slip * this.slipCorrect;

    // Corner speed from the tightest curvature ahead; a late-brake mistake carries too much in.
    const late = this.mistake?.kind === 'late-brake' ? 1.18 : 1;
    // More grip (wing, upgrades) lets the car carry more speed through a bend: about its square root.
    const gripGain = Math.sqrt(Math.max(0.5, 1 + c.mods.grip));
    const forkNow = this.lane !== 0 ? track.forkAt(i) : null;
    const insideLine = forkNow?.curve && this.lane === forkNow.sign ? 0.86 : 1;
    const safe = Math.min(1000, (this.cornerK * this.skill * late * gripGain * insideLine) / Math.sqrt(maxCurve + 1e-6));
    const brake = speed > safe * 1.04;
    const throttle = !brake && speed < safe;
    // ERS: spend energy on straights to attack or defend, or when the battery is nearly full.
    const straight = maxCurve < 1 / 1500;
    const deploy = throttle && straight && c.energy > 0.05
      && (front !== null || rearGap < Infinity || c.energy > 0.6);
    // Past the finish of a point-to-point sprint: ease to a stop before the end of the road.
    if (track.open && this.race.lap > 0) return { aim, throttle: false, brake: true, deploy: false };
    return { aim, throttle, brake, deploy };
  }

  /** Roll how this driver gets off the line at GO. */
  rollLaunch(): 'perfect' | 'stall' | 'normal' {
    const r = Math.random();
    if (r < 0.15 + 0.4 * (this.skill - 0.6)) return 'perfect';
    if (r > 1 - 0.25 * (1 - this.skill)) return 'stall';
    return 'normal';
  }
}

/** Tuned so a skill-1 driver takes corners near the grip limit (see lap simulation). */
export const CORNER_K = 56;
/** How hard the line cuts to the inside of bends (sign picks the side). */
export const INSIDE_BIAS = -500;
