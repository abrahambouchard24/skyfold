// Dragon flight physics. Pure game logic: no rendering or DOM access in here.

export interface Vec { x: number; y: number }

/** One gear: the speed it tops out at (px/s) and how hard it pulls (px/s²). */
export interface Gear { top: number; accel: number }

export const GEARS: Gear[] = [
  { top: 240, accel: 290 },
  { top: 400, accel: 220 },
  { top: 560, accel: 170 },
  { top: 720, accel: 130 },
  { top: 880, accel: 100 },
];

const TURN_RATE = 3.6;        // rad/s at low speed
const TURN_RATE_FAST = 2.4;   // rad/s at top speed
const BRAKE_TURN_BONUS = 1.35;
const DRAG = 0.12;            // forward air drag (1/s)
const SCRAPE_FRICTION = 3.2;  // speed lost per second while grinding along a wall (1/s)
const WALL_HIT_LOSS = 1 / 1800; // extra share of speed lost per px/s of into-the-wall speed on a hit...
const WALL_HIT_LOSS_MAX = 0.3;  // ...capped, so a full-speed head-on costs at most 30% on top
const SCRAPE_BOUNCE = 0.12;   // how much of the into-the-wall speed comes back out
const BRAKE_DECEL = 700;      // px/s²
const BOG_FRACTION = 0.55;    // the rev band of a gear starts at this fraction of the previous gear's top
const UPSHIFT_AT = 0.96;      // auto upshift once forward speed reaches this fraction of the gear's top
const DOWNSHIFT_AT = 0.8;     // auto downshift once speed falls below this fraction of the lower gear's top
const SHIFT_COOLDOWN = 0.6;   // seconds between automatic shifts, so it never hunts between gears
const SHIFT_TIME = 0.12;      // seconds of reduced thrust while an upshift engages
const SHIFT_PULL = 0.65;      // thrust kept during that dip: a felt shift, not a stall
// Slipstream: tucked into the wake behind another car, a craft gets a few percent more pace.
const SLIPSTREAM_BONUS = 0.05;   // extra top speed and pull at full slipstream
const SLIPSTREAM_DRAG_CUT = 0.5; // fraction of air drag removed at full slipstream
const WAKE_LENGTH = 340;         // px behind a car that its wake reaches
const WAKE_HALF_WIDTH = 28;      // px either side of the wake's center line, right behind the car
const WAKE_SPREAD = 0.1;         // the wake widens by this many px per px behind the car
const WAKE_MIN_SPEED = 300;      // px/s: slower cars leave no usable wake
const WAKE_ALT = 60;              // px of height difference beyond which a wake doesn't reach
const CONTACT_ALT = 30;           // px of height difference beyond which dragons pass over each other
const WAKE_ALIGN = 0.85;         // both cars must be moving within ~30° of the same direction
// Heat: hitting walls and other cars heats the craft; a hot craft loses top speed until it cools.
const HEAT_PER_IMPACT = 1 / 350;  // heat per px/s of into-the-wall speed (a 10° hit at 200 km/h: about 0.44)
const HEAT_PER_SCRAPE = 0.85;     // heat per second of grinding along a wall
const HEAT_COOL = 0.05;           // heat shed per second (a full bar takes 20 s to clear)
const LANE_COOL = 0.35;           // heat shed per second on the cooling lane (7x faster)
// Boost pads (sprint fork lanes): a burst of pace while on them and for a moment after.
const PAD_TOP = 0.1;              // extra top speed
const PAD_PULL = 1.45;            // thrust multiplier
const HEAT_WARM = 0.5;            // above this, top speed starts to drop...
const HEAT_WARM_LOSS = 0.1;       // ...by up to this much just before overheating
const OVERHEAT_LOSS = 0.25;       // top speed lost while overheated
const OVERHEAT_CLEAR = 0.35;      // overheating ends once heat cools below this
// Turbo start: a perfectly timed launch pulls harder for a moment; a jump start stalls.
const LAUNCH_PULL = 1.9;          // thrust multiplier during a perfect launch
export const LAUNCH_TIME = 1.4;   // seconds a perfect launch lasts
export const STALL_TIME = 0.8;    // seconds of no thrust after a jump start
// Flight (Skyfold): dragons don't slide. Their velocity follows the heading through a banked turn,
// a turn can pull at most CARVE_G of sideways acceleration (so too much speed swings the dragon
// wide: it simply can't turn any tighter), and every turn costs speed in proportion to how hard it
// pulls (TURN_DRAG), like a bird hauling round a tight arc.
const CARVE_G = 1700;             // px/s² of sideways pull at the limit (more with grip mods)
const BRAKE_CARVE = 1.15;         // braking (wings spread wide) pulls a little tighter
const AIR_CARVE = 0.5;            // share of it left in the air off a jump
const FOLLOW = 0.85;              // share of each turn the velocity follows at once...
const SIDE_GRIP = 9;              // ...the rest of any sideways motion fades at this rate (1/s)
const TURN_DRAG = 0.2;            // speed lost per second, as a share of the sideways pull, at the limit
// The gale charges from carving (a hard bank at speed) and from riding another dragon's wake.
const CARVE_FROM = 0.45;          // share of the carving limit before a turn starts to charge
const CARVE_FULL = 0.9;           // share at which it charges at the full rate
const ERS_CARVE = 0.5;            // energy per second in a full, fast carve
const ERS_WAKE = 0.1;             // energy per second deep in another dragon's wake
// Jumps (sprint tracks): ramps lift the craft, it flies when the road drops away, and lands again.
const GRAVITY = 380;              // px/s² pulling the craft back down: low, so jumps are long glides
const AIR_GRIP = 0.12;            // share of grip left in the air (it keeps its sideways momentum)
const AIR_TURN = 0.5;             // share of steering left in the air
const ERS_AIR = 0.32;             // energy per second of airtime at speed (airtime charges the boost)
// Flight height (Skyfold): holding climb pitches the dragon up; let go and it swoops back down.
// Height is stored speed: climbing pays for it in speed, diving gives it back (and can push a dragon
// past its top speed while it's coming down). At the floor (alt 0) nothing changes.
export const ALT_MAX = 260;       // px above the floor a dragon can climb to
const CLIMB_RATE = 200;           // px/s of climb while holding climb
const CLIMB_EASE = 3;             // how quickly it pitches up (1/s)
const CLIMB_MIN_SPEED = 260;      // px/s: slower than this and it can't climb any more
const CLIMB_EFF = 0.85;           // share of the speed spent on height that's stored...
const DIVE_EFF = 0.95;            // ...and share of it given back on the way down
const DIVE_RATE = 160;            // px/s of descent as a swoop begins...
const DIVE_STEEPEN = 220;         // ...steepening this much per second of falling...
const DIVE_MAX = 420;             // ...up to this
const DIVE_EASE = 2.5;            // how quickly it noses over (1/s)
const DIVE_TOP = 0.12;            // extra top speed allowed at the steepest dive
const ALT_G = 380;                // px/s² that converts height into speed (as gravity would)
const LANDING_LOSS = 1 / 12000;   // speed lost per px/s of landing impact (capped at 8%)
export const HARVEST_PER_LAP = 1;  // most energy a craft can harvest in one lap (one full battery)
const ERS_DRAIN = 0.25;           // energy per second while deploying (4 s from full)
const ERS_PULL = 1.6875;          // thrust multiplier while deploying (+69%)
const ERS_TOP = 0.1125;           // extra top speed while deploying (+11.25%)
export const ERS_START = 0.5;     // charge at the start of a race
// DRS: an open wing on a DRS straight sheds drag for extra top speed.
const DRS_TOP = 0.07;
const SLIPSTREAM_RISE = 2.0;     // how fast the tow builds (1/s)
const SLIPSTREAM_FALL = 4.0;     // and how fast it fades after pulling out (1/s)

/**
 * Per-car performance tweaks, as fractions (0.03 = +3%): garage upgrades for the player in Story
 * mode, a fixed edge for a rival like Judah, or a pace bump for a whole AI field.
 */
export interface Mods {
  top: number;     // top speed
  accel: number;   // pull
  grip: number;    // cornering grip
  heat: number;    // heat resistance: this share less heat from hits and grinding
  ers: number;     // boost effectiveness
  harvest: number; // how fast carving and wakes charge the gale
  assist: number;  // no longer used (every craft handles the same); kept so old saves and messages parse
  turn: number;    // steering rate (how fast the nose comes round)
}
export const NO_MODS: Mods = { top: 0, accel: 0, grip: 0, heat: 0, ers: 0, harvest: 0, assist: 0, turn: 0 };

/** A car's complete physics state (see Craft.getState). */
export interface CraftState {
  x: number; y: number; vx: number; vy: number; h: number; gear: number;
  drifting: boolean; braking: boolean; thrust: number; shiftTimer: number; shiftPause: number;
  slipstream: number; catchUp: number; heat: number; overheated: boolean; launch: number;
  stall: number; energy: number; deploying: boolean; harvested: number; drsOpen: boolean; cooling: boolean;
  alt: number; vAlt: number; onGround: boolean; ground: number; pad?: number;
  climb?: boolean; flying?: boolean; fallTime?: number;
}

export class Craft {
  pos: Vec = { x: 0, y: 0 };
  vel: Vec = { x: 0, y: 0 };
  heading = -Math.PI / 2;     // pointing "up" the screen
  gear = 0;                   // index into GEARS
  /** Always false now: dragons don't slide (kept so effects and online messages still parse). */
  drifting = false;
  braking = false;
  /** 0..1 how hard the thrusters are working this frame (for effects). */
  thrust = 0;
  /** +1 / -1 on the step a gear change happened, else 0 (for HUD flashes). */
  shifted = 0;
  private shiftTimer = 0;
  /** Seconds left on the current upshift; thrust is cut while it engages. */
  shiftPause = 0;
  /** 0..1 how deep in another car's wake the craft is; set by feelWake each step. */
  slipstream = 0;
  /** The car whose wake is towing us (for the draft effect), or null. */
  slipFrom: Craft | null = null;
  /** Extra pace from running behind: 0.01 per place behind the leader, set by the race each step. */
  catchUp = 0;
  /** 0..1 how hot the craft is from contact. */
  heat = 0;
  /** True from the moment heat maxes out until it cools below OVERHEAT_CLEAR. */
  overheated = false;
  /** Seconds left on a perfect-launch boost / a jump-start stall. */
  launch = 0;
  stall = 0;
  /** ERS battery 0..1, whether the driver wants to deploy it, and whether it's deploying now. */
  energy = ERS_START;
  deploy = false;
  deploying = false;
  /** Energy harvested so far this lap (capped at HARVEST_PER_LAP; the race resets it each lap). */
  harvested = 0;
  /** 0..1 how hard the dragon is carving right now (a hard bank at speed charges the gale). */
  carving = 0;
  /** Signed turn rate of the flight path this step (rad/s, + = turning toward +heading). */
  turnRate = 0;
  /** Performance tweaks for this car (see Mods). */
  mods: Mods = { ...NO_MODS };
  /** DRS wing open (set by the race: in a zone, within a second of the car ahead, not braking). */
  drsOpen = false;
  /** True while over the cooling lane (set by the race each step). */
  cooling = false;
  /** Height above the base road (px), vertical speed, and whether it's riding the road surface. */
  alt = 0;
  vAlt = 0;
  onGround = true;
  /** Holding climb this step (set from the controls before step()). */
  climb = false;
  /** In free flight above the floor (from a climb until it touches down again). Ramp jumps aren't. */
  flying = false;
  /** 0..1 how hard it's diving (turning height into speed), for effects and the HUD. */
  dive = 0;
  /** Seconds since it last climbed while flying (the swoop steepens with it). */
  private fallTime = 0;
  /** Road height under the craft (ramps), set by collideWalls each step. */
  ground = 0;
  /** Seconds left of a boost pad's push (set by the track while on a pad). */
  pad = 0;
  /** Landing impact (px/s of vertical speed) on the step the craft touched down, else 0 (for effects). */
  landed = 0;

  /** Every field the physics reads or writes, so a car can be copied exactly (online prediction). */
  getState(): CraftState {
    return {
      x: this.pos.x, y: this.pos.y, vx: this.vel.x, vy: this.vel.y, h: this.heading, gear: this.gear,
      drifting: this.drifting, braking: this.braking, thrust: this.thrust, shiftTimer: this.shiftTimer, shiftPause: this.shiftPause,
      slipstream: this.slipstream, catchUp: this.catchUp, heat: this.heat, overheated: this.overheated, launch: this.launch,
      stall: this.stall, energy: this.energy, deploying: this.deploying, harvested: this.harvested, drsOpen: this.drsOpen, cooling: this.cooling,
      alt: this.alt, vAlt: this.vAlt, onGround: this.onGround, ground: this.ground, pad: this.pad,
      climb: this.climb, flying: this.flying, fallTime: this.fallTime,
    };
  }

  setState(s: CraftState): void {
    this.pos.x = s.x; this.pos.y = s.y; this.vel.x = s.vx; this.vel.y = s.vy; this.heading = s.h; this.gear = s.gear;
    this.drifting = s.drifting; this.braking = s.braking; this.thrust = s.thrust; this.shiftTimer = s.shiftTimer; this.shiftPause = s.shiftPause;
    this.slipstream = s.slipstream; this.catchUp = s.catchUp; this.heat = s.heat; this.overheated = s.overheated; this.launch = s.launch;
    this.stall = s.stall; this.energy = s.energy; this.deploying = s.deploying; this.harvested = s.harvested; this.drsOpen = s.drsOpen; this.cooling = s.cooling;
    this.pad = s.pad ?? 0;
    this.alt = s.alt ?? 0; this.vAlt = s.vAlt ?? 0; this.onGround = s.onGround ?? true; this.ground = s.ground ?? 0;
    this.climb = s.climb ?? false; this.flying = s.flying ?? false; this.fallTime = s.fallTime ?? 0;
  }

  /** In the air off a jump. */
  get airborne(): boolean { return !this.onGround; }

  get speed(): number { return Math.hypot(this.vel.x, this.vel.y); }

  /** Angle between where the craft points and where it is going, in radians (signed). */
  get slip(): number {
    if (this.speed < 30) return 0;
    const move = Math.atan2(this.vel.y, this.vel.x);
    return wrapAngle(move - this.heading);
  }

  /** How far through the current gear's speed band the craft is, 0..1 (drives the rev bar). */
  get rev(): number {
    const lo = this.gear === 0 ? 0 : GEARS[this.gear - 1].top * BOG_FRACTION;
    const hi = GEARS[this.gear].top;
    return clamp((this.speed - lo) / (hi - lo), 0, 1);
  }

  /** The most the craft can turn in one step of dt right now (for proportional steering). */
  maxTurn(dt: number, brake: boolean): number {
    const speedFrac = clamp(this.speed / GEARS[GEARS.length - 1].top, 0, 1);
    return lerp(TURN_RATE, TURN_RATE_FAST, speedFrac) * (1 + this.mods.turn) * (brake ? BRAKE_TURN_BONUS : 1) * dt;
  }

  /**
   * Advance one fixed step.
   * @param aimAngle world angle the player is steering toward
   * @param throttle whether the accelerate key is held
   * @param brake whether the brake key is held
   */
  step(dt: number, aimAngle: number, throttle: boolean, brake: boolean): void {
    this.braking = brake;
    const speed = this.speed;
    this.deploying = this.deploy && this.energy > 0 && throttle && !brake;
    if (this.deploying) this.energy = Math.max(0, this.energy - ERS_DRAIN * dt);
    const tow = 1 + SLIPSTREAM_BONUS * this.slipstream + this.catchUp - this.heatLoss + this.mods.top + (this.pad > 0 ? PAD_TOP : 0)
      + (this.deploying ? ERS_TOP * (1 + this.mods.ers) : 0) + (this.drsOpen ? DRS_TOP : 0);
    const gear = { top: GEARS[this.gear].top * tow, accel: GEARS[this.gear].accel * tow };

    // Steering: turn toward the aim at a capped rate, and never tighter than the dragon's wings can
    // pull at this speed (the limit: carry too much speed and the arc simply grows, it swings wide).
    const speedFrac = clamp(speed / GEARS[GEARS.length - 1].top, 0, 1);
    let turnRate = lerp(TURN_RATE, TURN_RATE_FAST, speedFrac) * (1 + this.mods.turn);
    if (brake) turnRate *= BRAKE_TURN_BONUS;
    const handles = this.onGround || this.flying;   // a dragon in free flight handles as it does low down
    if (!handles) turnRate *= AIR_TURN;
    const limit = CARVE_G * (1 + this.mods.grip) * (brake ? BRAKE_CARVE : 1) * (handles ? 1 : AIR_CARVE);
    if (speed > 1) turnRate = Math.min(turnRate, limit / speed);
    const diff = wrapAngle(aimAngle - this.heading);
    const maxTurn = turnRate * dt;
    const turned = clamp(diff, -maxTurn, maxTurn);
    this.heading = wrapAngle(this.heading + turned);
    this.turnRate = dt > 0 ? turned / dt : 0;
    // The flight path banks round with the heading (most of it at once, the rest catching up).
    const rot = turned * FOLLOW, cr = Math.cos(rot), sr = Math.sin(rot);
    const vx0 = this.vel.x;
    this.vel.x = vx0 * cr - this.vel.y * sr;
    this.vel.y = vx0 * sr + this.vel.y * cr;

    // Split velocity into the craft's forward and sideways axes.
    const fx = Math.cos(this.heading), fy = Math.sin(this.heading);
    let fwd = this.vel.x * fx + this.vel.y * fy;
    let side = this.vel.x * -fy + this.vel.y * fx;

    // Thrust while the throttle is held.
    // Skyfold: dragons have no gearbox. Pull follows one smooth curve through the same points the
    // old gears did (strong off the line, easing as speed builds, fading out at top speed), so the
    // pace is unchanged but there are no steps and no shift dips.
    this.thrust = 0;
    const accelerating = throttle && !brake;
    if (accelerating) {
      const v = Math.max(0, fwd) / tow, last = GEARS.length - 1;
      let accel = GEARS[0].accel;
      for (let i = 0; i < last; i++) {
        if (v > GEARS[i].top) {
          const t = clamp((v - GEARS[i].top) / (GEARS[i + 1].top - GEARS[i].top), 0, 1);
          accel = lerp(GEARS[i].accel, GEARS[i + 1].accel, t);
        }
      }
      // Fade smoothly to nothing over the last stretch before top speed (no sudden drop).
      const fadeFrom = GEARS[last - 2].top, topV = GEARS[last].top;
      const pull = v > fadeFrom ? Math.sqrt(clamp((topV - v) / (topV - fadeFrom), 0, 1)) : 1;
      const engaging = (this.stall > 0 ? 0 : this.launch > 0 ? LAUNCH_PULL : 1) * (this.pad > 0 ? PAD_PULL : 1)
        * (this.deploying ? 1 + (ERS_PULL - 1) * (1 + this.mods.ers) : 1) * (1 + this.mods.accel);
      this.thrust = pull * engaging;
      fwd += engaging * accel * tow * pull * dt;
    }
    void gear; void SHIFT_PULL;
    // Above top speed (e.g. after a downhill bump) it slowly settles back.
    const vmax = GEARS[GEARS.length - 1].top * tow * (1 + DIVE_TOP * this.dive);
    if (fwd > vmax) fwd -= (fwd - vmax) * 0.8 * dt;

    // Air drag only while coasting; under throttle the pull curve already sets the pace.
    if (!accelerating) fwd -= fwd * DRAG * (1 - SLIPSTREAM_DRAG_CUT * this.slipstream) * dt;
    if (brake) fwd = moveToward(fwd, 0, BRAKE_DECEL * dt);

    this.autoShift(dt, fwd, throttle && !brake, tow);

    // Turning costs speed: the harder the pull (as a share of the limit), the more it bleeds.
    const pullG = Math.abs(this.turnRate) * Math.max(0, fwd);
    const load = clamp(pullG / Math.max(1, CARVE_G * (1 + this.mods.grip)), 0, 1.2);
    if (fwd > 0) fwd = Math.max(0, fwd - TURN_DRAG * pullG * load * dt);

    // Any sideways motion left over (the small lag, or a knock from a wall or another dragon)
    // fades quickly into the flight path, without a slide.
    const sideBefore = side;
    side *= Math.exp(-SIDE_GRIP * (handles ? 1 : AIR_GRIP * 4) * dt);
    if (fwd > 0) fwd = Math.sqrt(fwd * fwd + (sideBefore * sideBefore - side * side) * 0.6);

    this.vel.x = fx * fwd - fy * side;
    this.vel.y = fy * fwd + fx * side;

    this.drifting = false;
    // The gale charges from carving: a hard bank at speed, faster the harder and faster.
    const fast = clamp((speed - 300) / 400, 0, 1);
    this.carving = handles ? clamp((load - CARVE_FROM) / (CARVE_FULL - CARVE_FROM), 0, 1) * fast : 0;
    if (this.carving > 0) {
      const gain = Math.min(ERS_CARVE * (1 + this.mods.harvest) * this.carving * dt, HARVEST_PER_LAP - this.harvested, 1 - this.energy);
      if (gain > 0) { this.energy += gain; this.harvested += gain; }
    }
    // ...and from riding in another dragon's wake.
    if (this.slipstream > 0.2) {
      const gain = Math.min(ERS_WAKE * (1 + this.mods.harvest) * this.slipstream * dt, HARVEST_PER_LAP - this.harvested, 1 - this.energy);
      if (gain > 0) { this.energy += gain; this.harvested += gain; }
    }
    // Airtime charges it too.
    if (!this.onGround && !this.flying && speed > 300) {
      const gain = Math.min(ERS_AIR * (1 + this.mods.harvest) * clamp(speed / 600, 0, 1.3) * dt, HARVEST_PER_LAP - this.harvested, 1 - this.energy);
      if (gain > 0) { this.energy += gain; this.harvested += gain; }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.fly(dt);

    this.launch = Math.max(0, this.launch - dt);
    this.pad = Math.max(0, this.pad - dt);
    this.stall = Math.max(0, this.stall - dt);
    this.heat = Math.max(0, this.heat - (this.cooling ? LANE_COOL : HEAT_COOL) * dt);
    if (this.overheated && this.heat < OVERHEAT_CLEAR) this.overheated = false;
  }

  /**
   * Height: on the road the craft follows it (a ramp gives it upward speed); when the road drops
   * away beneath it (a ramp's lip) it flies on that speed under gravity, and lands when it meets the
   * road again, losing a little speed on a hard landing.
   */
  private fly(dt: number): void {
    this.landed = 0;
    const g = this.ground;
    // Free flight: climb while the control is held, swoop back down when it's let go.
    if (this.onGround && this.climb && this.speed > CLIMB_MIN_SPEED) {
      this.onGround = false; this.flying = true; this.fallTime = 0;
    }
    if (this.flying) { this.freeFlight(dt, g); return; }
    this.dive = 0;
    if (this.onGround) {
      if (g >= this.alt - 1) {
        this.vAlt = Math.max(0, (g - this.alt) / dt);
        this.alt = g;
      } else {
        this.onGround = false;   // launched
      }
    }
    if (!this.onGround) {
      this.vAlt -= GRAVITY * dt;
      this.alt += this.vAlt * dt;
      if (this.alt <= g) {
        const impact = -this.vAlt;
        this.landed = Math.max(1, impact);
        const keep = 1 - Math.min(0.08, impact * LANDING_LOSS);
        this.vel.x *= keep; this.vel.y *= keep;
        this.alt = g; this.vAlt = 0; this.onGround = true;
      }
    }
  }

  /**
   * Free flight above the floor. Holding climb eases the dragon up toward CLIMB_RATE (while it has the
   * speed for it); letting go noses it over into a swoop that steepens as it falls. Height and speed
   * trade through energy (v² + 2·g·h), lossy on the way up, nearly free on the way down.
   */
  private freeFlight(dt: number, floor: number): void {
    const v0 = this.speed;
    const canClimb = this.climb && v0 > CLIMB_MIN_SPEED && this.alt < floor + ALT_MAX;
    if (canClimb) {
      this.fallTime = 0;
      this.vAlt += (CLIMB_RATE - this.vAlt) * (1 - Math.exp(-CLIMB_EASE * dt));
    } else {
      this.fallTime += dt;
      const target = -Math.min(DIVE_MAX, DIVE_RATE + this.fallTime * DIVE_STEEPEN);
      this.vAlt += (target - this.vAlt) * (1 - Math.exp(-DIVE_EASE * dt));
    }
    if (this.alt >= floor + ALT_MAX && this.vAlt > 0) this.vAlt = 0;
    const dh = this.vAlt * dt;
    this.alt += dh;
    // Pay for height in speed, or take it back.
    if (v0 > 1) {
      const v2 = Math.max(CLIMB_MIN_SPEED * CLIMB_MIN_SPEED * 0.8, v0 * v0 - 2 * ALT_G * dh * (dh > 0 ? 1 / CLIMB_EFF : DIVE_EFF));
      const k = Math.sqrt(v2) / v0;
      this.vel.x *= k; this.vel.y *= k;
    }
    this.dive = this.vAlt < 0 ? clamp(-this.vAlt / DIVE_MAX, 0, 1) : 0;
    // Back at the floor (or a ramp rose to meet it): a smooth touchdown, then it handles as before.
    if (this.alt <= floor) {
      this.landed = Math.max(1, -this.vAlt * 0.25);
      this.alt = floor; this.vAlt = 0; this.onGround = true; this.flying = false; this.dive = 0;
    }
  }

  /** Fraction of top speed currently lost to heat. */
  get heatLoss(): number {
    if (this.overheated) return OVERHEAT_LOSS;
    return this.heat > HEAT_WARM ? ((this.heat - HEAT_WARM) / (1 - HEAT_WARM)) * HEAT_WARM_LOSS : 0;
  }

  /** Add heat from a hit (closing speed in px/s) and/or seconds of grinding. */
  addHeat(impact: number, grindSeconds = 0): void {
    const resist = 1 - this.mods.heat;
    this.heat = Math.min(1, this.heat + (impact * HEAT_PER_IMPACT + grindSeconds * HEAT_PER_SCRAPE) * resist);
    if (this.heat >= 1) this.overheated = true;
  }

  /**
   * Build or fade the slipstream from the wakes of the other craft. A wake trails straight back
   * from a moving car along its direction of travel and is strongest right behind it.
   */
  feelWake(others: Craft[], dt: number): void {
    let target = 0;
    let from: Craft | null = null;
    const mySpeed = this.speed;
    if (mySpeed > WAKE_MIN_SPEED * 0.5) {
      for (const o of others) {
        if (o === this) continue;
        if (Math.abs(o.alt - this.alt) > WAKE_ALT) continue;   // a wake only helps at about its height
        const os = o.speed;
        if (os < WAKE_MIN_SPEED) continue;
        const dx = o.vel.x / os, dy = o.vel.y / os;
        if ((this.vel.x * dx + this.vel.y * dy) / mySpeed < WAKE_ALIGN) continue;
        const rx = this.pos.x - o.pos.x, ry = this.pos.y - o.pos.y;
        const behind = -(rx * dx + ry * dy);
        if (behind <= 0 || behind > WAKE_LENGTH) continue;
        const across = Math.abs(rx * -dy + ry * dx);
        if (across > WAKE_HALF_WIDTH + behind * WAKE_SPREAD) continue;
        const strength = 1 - 0.5 * (behind / WAKE_LENGTH);
        if (strength > target) { target = strength; from = o; }
      }
    }
    const rate = target > this.slipstream ? SLIPSTREAM_RISE : SLIPSTREAM_FALL;
    this.slipstream = moveToward(this.slipstream, target, rate * dt);
    if (from) this.slipFrom = from;
    else if (this.slipstream === 0) this.slipFrom = null;
  }

  /**
   * Grind along a wall. normal points away from the wall, into the track. The speed going into
   * the wall is soaked up (a head-on hit hurts), and sliding along it costs a little friction.
   * Returns the into-the-wall speed of this contact.
   */
  scrape(normal: Vec, dt: number): number {
    const vn = this.vel.x * normal.x + this.vel.y * normal.y;
    if (vn < 0) {
      this.vel.x -= (1 + SCRAPE_BOUNCE) * vn * normal.x;
      this.vel.y -= (1 + SCRAPE_BOUNCE) * vn * normal.y;
    }
    const keep = Math.exp(-SCRAPE_FRICTION * dt);
    this.vel.x *= keep;
    this.vel.y *= keep;
    const impact = Math.max(0, -vn);
    // A real hit (not just grinding) also knocks speed off along the wall.
    const knock = 1 - Math.min(WALL_HIT_LOSS_MAX, impact * WALL_HIT_LOSS);
    this.vel.x *= knock;
    this.vel.y *= knock;
    if (this.speed > 40) this.addHeat(impact, dt);
    return impact;
  }

  /** Automatic gearbox: up when the gear is nearly maxed under throttle, down when too slow for it. */
  private autoShift(dt: number, fwd: number, throttle: boolean, tow: number): void {
    this.shifted = 0;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.shiftPause = Math.max(0, this.shiftPause - dt);
    if (this.shiftTimer > 0) return;
    const speed = Math.max(fwd, 0);
    if (throttle && this.gear < GEARS.length - 1 && speed >= GEARS[this.gear].top * tow * UPSHIFT_AT) {
      this.gear++;
      this.shifted = 1;
    } else if (this.gear > 0 && speed < GEARS[this.gear - 1].top * tow * DOWNSHIFT_AT) {
      this.gear--;
      this.shifted = -1;
    }
    if (this.shifted) this.shiftTimer = SHIFT_COOLDOWN;
    if (this.shifted === 1) this.shiftPause = SHIFT_TIME;
  }

}

/** Bump two craft apart (circles). Returns the closing speed of the hit, 0 if none. */
export function collideCrafts(a: Craft, b: Craft, radius = 22): number {
  if (Math.abs(a.alt - b.alt) > CONTACT_ALT) return 0;   // one flying over the other
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
  const d = Math.hypot(dx, dy), min = radius * 2;
  if (d >= min || d === 0) return 0;
  const nx = dx / d, ny = dy / d, push = (min - d) / 2;
  a.pos.x -= nx * push; a.pos.y -= ny * push;
  b.pos.x += nx * push; b.pos.y += ny * push;
  const closing = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
  if (closing >= 0) return 0;
  const j = (-(1 + 0.5) * closing) / 2;
  a.vel.x -= j * nx; a.vel.y -= j * ny;
  b.vel.x += j * nx; b.vel.y += j * ny;
  return -closing;
}

/**
 * collideCrafts as seen by car a alone: a gets exactly the push and impulse it would get, and b
 * (an estimate of where another car is) is left untouched. Used to predict bumps online.
 */
export function bumpOff(a: Craft, b: { pos: Vec; vel: Vec; alt?: number }, radius = 22): number {
  if (Math.abs(a.alt - (b.alt ?? 0)) > CONTACT_ALT) return 0;
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
  const d = Math.hypot(dx, dy), min = radius * 2;
  if (d >= min || d === 0) return 0;
  const nx = dx / d, ny = dy / d, push = (min - d) / 2;
  a.pos.x -= nx * push; a.pos.y -= ny * push;
  const closing = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
  if (closing >= 0) return 0;
  const j = (-(1 + 0.5) * closing) / 2;
  a.vel.x -= j * nx; a.vel.y -= j * ny;
  return -closing;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function moveToward(v: number, target: number, step: number): number {
  return v > target ? Math.max(target, v - step) : Math.min(target, v + step);
}
