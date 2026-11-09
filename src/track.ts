// A circuit: a closed Catmull-Rom spline through hand-placed control points, sampled into a
// centerline polyline. Everything else (edges, kerbs, walls, laps) is measured from that line.

import type { Craft, Vec } from './craft';

/** Colors a track is drawn in: the barrier neon, its pulsing lights and the kerb stripe. */
export interface TrackTheme { wall: string; wallFace: string; lights: string; kerb: string; surface: string }

/** A circuit: control points of a closed spline, driven in order. Screen coords: +y is down. */
export interface TrackDef {
  name: string;
  blurb: string;
  /** The first point is the start/finish line; the last few should lie on the straight before it (the grid). */
  control: [number, number][];
  theme: TrackTheme;
  /** Layout scale: tracks with tight bends are spread out so the wide road still fits through them. */
  scale?: number;
  /**
   * Sprint: a point-to-point route raced once, start to finish (control points run from the start
   * line to the end of the run-off past the finish). At every jump the road splits into two lanes
   * around an island: one lane has the jump, the other is a ground bypass. Sprints set how many
   * samples each control segment gets and how many jumps (splits) to place.
   */
  sprint?: boolean;
  samples?: number;
  jumps?: number;
  /**
   * Sprints: what the two lanes offer at each fork on a straight, taken in turn ([left, right] lanes
   * alternate sides), and at each fork on a sweeping turn ([inside, outside]).
   */
  forks?: [LaneKind, LaneKind][];
  curveForks?: [LaneKind, LaneKind][];
}

/**
 * What a fork lane offers: a jump (a glide that charges the boost), boost pads, a charging strip
 * (refills the battery while you're on it), a cooling strip, a fire lane (boost pads that heat you
 * up), or a plain road (at a turn, the inside line is shorter but tighter).
 */
export type LaneKind = 'jump' | 'boost' | 'charge' | 'cool' | 'fire' | 'plain';
/** A fork: the road splits around an island from `from` to `to`; `left` / `right` lanes (side +1 / -1). */
export interface Fork { from: number; to: number; curve: boolean; left: LaneKind; right: LaneKind; sign: number }
/** A strip of lane surface with an effect, on one side of a fork. */
export interface Strip { side: number; kind: 'boost' | 'charge' | 'cool' | 'fire'; from: number; to: number }
const CHARGE_RATE = 0.45;         // battery per second on a charging strip
const FIRE_HEAT = 0.4;            // seconds of wall-grind heat per second on a fire lane
const PAD_HOLD = 0.9;             // seconds a pad's push lasts after leaving it

/**
 * A jump: a ramp from `from` rising to `height` at `lip`, a gap to `land` (sample indices), in the
 * lane on `side` (+1 = left of the centerline, -1 = right) of a split.
 */
export interface Jump { from: number; lip: number; land: number; height: number; side: number }
export const RAMP_LENGTH = 260;   // px of ramp
export const RAMP_HEIGHT = 70;    // px high at the lip
export const JUMP_GAP = 600;      // px of open air after the lip
// Splits: the road widens into two lanes around an island; each lane is a bit narrower than the road.
export const ISLAND_HALF = 150;   // island half-width at full split
export const LANE_WIDTH = 280;    // each lane at full split
const SPLIT_EASE = 900;           // px over which the road splits apart (and joins again)
const SPLIT_BEFORE = 320;         // full split this far before the ramp
const SPLIT_AFTER = 1100;         // ... and this far after the gap (the landing run)
const LEAD_IN = 70;               // samples of straight before the start line (the grid)
const RUNOFF = 1600;              // px of road past the finish line

/** Kerb width at the track edge through corners. */
export const KERB_WIDTH = 21;

const NEON: TrackTheme = { wall: '#3fe0d0', wallFace: '#f3ead2', lights: '255, 214, 140', kerb: '#e8c25a', surface: '#1f262b' };   // Apex Arena: marble, teal and gold

export const TRACKS: TrackDef[] = [
  {
    name: 'APEX ARENA',
    blurb: 'Futurist arena: chicane, hairpin, esses',
    scale: 1.27,
    theme: NEON,
    control: [
      [0, 1200],      // start/finish line, halfway down the main straight heading east
      [1800, 1200],
      [2450, 950],    // T1: long left-hander
      [2600, 350],
      [2250, -50],
      [1650, -50],    // T3-T4: chicane
      [1350, 200],
      [950, 200],
      [600, -150],
      [700, -850],    // T5: fast sweeper
      [1250, -1250],
      [1350, -1800],  // T7: hairpin
      [950, -2150],
      [450, -1900],
      [-100, -1350],  // back straight, diving south-west
      [-800, -1250],
      [-1500, -1550],
      [-2250, -1350],
      [-2550, -650],  // T11-T12: esses
      [-2150, -100],
      [-2550, 500],
      [-2500, 1050],  // final corner onto the straight
      [-1800, 1200],  // main straight: the grid lines up here
    ],
  },
  {
    name: 'VELOCITY COLOSSEUM',
    blurb: 'Marble colosseum oval: flat out, slipstream battles',
    theme: { wall: '#e8c25a', wallFace: '#f6efe0', lights: '255, 226, 170', kerb: '#c9a24a', surface: '#2a2826' },
    control: [
      [0, 1400],
      [2000, 1400],
      [3300, 1200],   // T1-T2: one long sweep round the east end
      [3900, 500],
      [3800, -400],
      [3100, -950],
      [1900, -1100],  // back straight with a gentle kink
      [700, -900],
      [-600, -1100],
      [-1900, -1100],
      [-3100, -800],  // T3-T4
      [-3800, -100],
      [-3600, 800],
      [-2600, 1350],
      [-1500, 1400],
    ],
  },
  {
    name: 'NEW YORK',
    blurb: 'Deco skyline streets: square corners, short straights',
    scale: 1.51,
    theme: { wall: '#f2b84b', wallFace: '#f1e3c4', lights: '255, 196, 110', kerb: '#3fe0d0', surface: '#22232a' },
    control: [
      [0, 1000],
      [1300, 1000],
      [1650, 850],    // T1: right-angle left, heading north
      [1700, 450],
      [1550, 150],    // T2: left, heading west
      [1050, 100],
      [750, -100],    // T3: right, heading north
      [700, -600],
      [900, -880],    // T4: right, heading east
      [1400, -900],
      [1720, -1150],  // T5: left, heading north
      [1760, -1450],
      [1450, -1780],  // T6: left, the long run west
      [-200, -1780],
      [-560, -1600],  // T7: left, heading south
      [-640, -1280],
      [-600, -1000],
      [-300, -700],   // T8-T9: chicane
      [-250, -400],
      [-550, -200],
      [-1150, -200],
      [-1500, 50],    // T10: left, heading south
      [-1500, 650],
      [-1250, 980],   // T11: left onto the straight
      [-700, 1000],
    ],
  },
  {
    name: 'LAPPLAND',
    blurb: 'Arctic night under the aurora: long sweepers',
    theme: { wall: '#7dffd0', wallFace: '#eef6ff', lights: '200, 235, 255', kerb: '#9fb6d6', surface: '#20252c' },
    control: [
      [0, 1500],
      [1800, 1500],
      [3000, 1100],   // the long climb: one sweeper after another
      [3600, 200],
      [3300, -800],
      [2300, -1300],
      [1450, -1330],  // eased: the esses' first flick was a wall magnet
      [800, -1700],   // esses over the ridge
      [600, -2450],
      [-200, -3000],
      [-1300, -2700],
      [-1800, -1900], // the descent
      [-1650, -1000], // eased with the S-bend below (wall hits in AI races: 38 a race before, about 14 after)
      [-2200, -290],  // eased: the descent S-bend
      [-3000, 200],
      [-3300, 1100],
      [-2600, 1500],
      [-1500, 1500],
    ],
  },
  {
    name: 'NEW ATLANTIS',
    blurb: 'Marble city on the sea: fast sweepers, one big hairpin',
    theme: { wall: '#5fe6d6', wallFace: '#f0f7f4', lights: '255, 214, 120', kerb: '#e8c25a', surface: '#1c2a30' },
    control: [
      [0, 1400],      // start/finish on the quay
      [1600, 1400],
      [2600, 1300],   // T1: a long fast left
      [3200, 800],
      [3300, 0],
      [2900, -500],   // T2: tightens heading west
      [2200, -550],
      [1700, -250],   // T3-T4: a quick right-left kink
      [1100, -300],
      [600, -800],
      [650, -1500],   // T5: the lighthouse hairpin
      [200, -2000],
      [-500, -1900],
      [-700, -1300],
      [-1300, -900],  // T7: back along the docks
      [-2200, -1100],
      [-2900, -700],  // T8-T9: the long sweep home
      [-3000, 200],
      [-2500, 900],
      [-1600, 1300],
      [-800, 1400],
    ],
  },
  {
    name: 'CRYSTAL FRONT',
    blurb: 'Crystal war zone: tight switchbacks, few straights',
    theme: { wall: '#b98cff', wallFace: '#e6dcff', lights: '160, 220, 255', kerb: '#5fd8ff', surface: '#1f1d2c' },
    control: [
      [0, 1200],
      [1400, 1200],
      [2000, 900],    // T1-T2: left into the canyon
      [1950, 400],
      [1400, 200],
      [900, 400],     // T3: right, dropping back
      [450, 150],
      [450, -350],    // T4: left, climbing
      [950, -750],
      [1700, -850],
      [2300, -1250],  // T6: up the far wall
      [2200, -1950],
      [1500, -2250],  // T7: across the top
      [700, -2050],
      [200, -1550],   // T8-T9: the crystal switchbacks
      [-400, -1650],
      [-1000, -2150],
      [-1750, -2050],
      [-2050, -1350], // T10: down the west wall
      [-1650, -750],
      [-1950, -100],
      [-2450, 450],
      [-2250, 1050],  // T13: onto the straight
      [-1300, 1200],
      [-600, 1200],
    ],
  },
  {
    name: 'HIEROPOLIS',
    blurb: 'Sacred city of the sun: long straights, heavy braking',
    scale: 1.49,
    theme: { wall: '#f0b24a', wallFace: '#f3dfb8', lights: '255, 190, 110', kerb: '#c85a2a', surface: '#2c2620' },
    control: [
      [0, 1500],
      [2500, 1500],
      [3200, 1350],   // T1: hairpin at the end of the main straight
      [3350, 850],
      [2900, 600],
      [1000, 550],    // the long run back west
      [250, 350],     // T2: up and right
      [100, -200],
      [500, -700],
      [2500, -800],   // the second long straight
      [3200, -1100],  // T4: hairpin at the far end
      [3200, -1700],
      [2600, -1950],
      [400, -1950],   // the back straight
      [-900, -1850],  // T6: down the west side
      [-1700, -1350],
      [-1700, -600],  // T7-T8: chicane
      [-2100, -100],
      [-1800, 400],
      [-2050, 950],   // T9: the long sweep onto the main straight
      [-1950, 1350],
      [-1550, 1500],
      [-900, 1500],
    ],
  },
  {
    name: 'HANGING GARDENS',
    blurb: 'Terraced sky gardens with a long, sweeping carousel',
    scale: 1.44,
    theme: { wall: '#6fe0a0', wallFace: '#efe6cf', lights: '255, 230, 160', kerb: '#e8c25a', surface: '#232a24' },
    control: [
      [0, 1300],
      [1700, 1300],
      [2500, 1000],   // T1
      [2700, 300],
      [2400, -300],   // T2: left, heading west
      [1800, -500],
      [1400, -200],   // T3-T4: the rooftop dip
      [1000, -400],
      [600, -1000],
      [700, -1700],   // T5: into the carousel
      [300, -2300],
      [-500, -2500],  // the carousel: one long, steady left
      [-1300, -2300],
      [-1800, -1700],
      [-1900, -1000],
      [-1600, -400],
      [-1000, -200],  // out of the carousel, heading east
      [-550, 150],    // T8: a wide right, dropping south
      [-850, 600],
      [-1500, 650],
      [-1950, 520],   // T9-T10: a wide loop back onto the straight
      [-2400, 460],
      [-2697, 583],
      [-2820, 880],
      [-2697, 1177],
      [-2400, 1300],
      [-1600, 1300],
    ],
  },
  // --- sprints: one long route each, no laps, with jumps ---------------------------------------
  {
    name: 'FAE FOREST',
    blurb: 'Enchanted forest sprint: flowing sweepers and glade jumps',
    sprint: true, samples: 26, jumps: 20,
    forks: [['jump', 'charge'], ['plain', 'cool'], ['jump', 'plain'], ['charge', 'cool']],
    curveForks: [['plain', 'charge'], ['plain', 'cool']],
    theme: { wall: '#9dffb8', wallFace: '#eaf7e6', lights: '210, 255, 190', kerb: '#c8a0ff', surface: '#1e2622' },
    // Generated route: rows across the world joined by sweeping U-turns, start to finish.
    control: [
      [0, 0], [520, 0], [1040, 0], [1560, 0], [2100, 0], [2620, 0], [3140, 0], [3660, 0],
      [4220, 0], [4740, 0], [5260, 0], [5780, 0], [6300, 0], [6835, -83], [7353, -179], [7872, -8],
      [8402, -1], [8922, -1], [9442, -1], [9962, -1], [10482, -1], [11002, -1], [11522, -1], [12042, -1],
      [12562, -15], [13042, -209], [13388, -593], [13530, -1091], [13441, -1600], [13136, -2019], [12680, -2262], [12153, -2301],
      [11622, -2301], [11102, -2301], [10582, -2301], [10062, -2301], [9542, -2301], [9022, -2301], [8502, -2301], [7982, -2301],
      [7462, -2301], [6935, -2463], [6412, -2422], [5880, -2302], [5360, -2302], [4840, -2302], [4320, -2302], [3800, -2302],
      [3280, -2302], [2760, -2302], [2240, -2302], [1720, -2302], [1206, -2364], [767, -2639], [493, -3077], [438, -3592],
      [615, -4078], [988, -4438], [1480, -4597], [2017, -4602], [2540, -4602], [3060, -4602], [3580, -4602], [4140, -4602],
      [4660, -4602], [5180, -4602], [5700, -4602], [6220, -4602], [6755, -4651], [7271, -4789], [7787, -4626], [8322, -4603],
      [8842, -4603], [9362, -4603], [9882, -4603], [10402, -4603], [10922, -4603], [11442, -4603], [11962, -4603], [12482, -4607],
      [12974, -4767], [13346, -5126], [13523, -5612], [13469, -6127], [13195, -6566], [12756, -6840], [12237, -6903], [11702, -6903],
      [11182, -6903], [10662, -6903], [10142, -6903], [9622, -6903], [9102, -6903], [8582, -6903], [8062, -6903], [7542, -6903],
      [7013, -7039], [6489, -7053], [5960, -6904], [5440, -6904], [4920, -6904], [4400, -6904], [3880, -6904], [3360, -6904],
      [2840, -6904], [2320, -6904], [1800, -6904], [1282, -6943], [825, -7186], [521, -7604], [431, -8114], [574, -8611],
      [920, -8996], [1400, -9189], [1933, -9203], [2460, -9203], [2980, -9203], [3500, -9203], [4020, -9203], [4540, -9203],
      [5060, -9203], [5580, -9203], [6100, -9203], [6629, -9217], [7148, -9387], [7663, -9270], [8202, -9204], [8722, -9204],
      [9242, -9204], [9762, -9204], [10282, -9204], [10802, -9204], [11322, -9204], [11842, -9204], [12362, -9204], [12882, -9204],
      [13402, -9204], [13922, -9204], [14442, -9204], [14962, -9204], [15002, -9204],
    ],
  },
  {
    name: 'NOVA CAMELOT',
    blurb: 'Castle-city sprint: long straights and tight castle ramps',
    sprint: true, samples: 26, jumps: 20,
    forks: [['jump', 'plain'], ['plain', 'charge'], ['jump', 'cool']],
    curveForks: [['plain', 'cool'], ['plain', 'charge']],
    theme: { wall: '#e8c25a', wallFace: '#ece6da', lights: '255, 230, 170', kerb: '#3d6fd8', surface: '#262a33' },
    // Generated route: rows across the world joined by sweeping U-turns, start to finish.
    control: [
      [0, 0], [520, 0], [1040, 0], [1560, 0], [2094, 0], [2620, 0], [3140, 0], [3660, 0],
      [4180, 0], [4700, 0], [5220, 0], [5740, 0], [6260, 0], [6781, -7], [7278, -180], [7783, -65],
      [8300, 0], [8820, 0], [9340, 0], [9860, 0], [10380, 0], [10900, 0], [11420, 0], [11940, 0],
      [12460, 0], [12967, -99], [13391, -395], [13659, -837], [13726, -1350], [13578, -1846], [13243, -2240], [12777, -2464],
      [12254, -2500], [11720, -2500], [11200, -2500], [10680, -2500], [10160, -2500], [9640, -2500], [9120, -2500], [8600, -2500],
      [8080, -2500], [7560, -2500], [7048, -2583], [6539, -2673], [6041, -2502], [5520, -2500], [5000, -2500], [4480, -2500],
      [3960, -2500], [3440, -2500], [2920, -2500], [2400, -2500], [1880, -2500], [1361, -2519], [881, -2713], [522, -3085],
      [343, -3570], [376, -4086], [615, -4545], [1020, -4867], [1520, -4998], [2053, -5000], [2580, -5000], [3100, -5000],
      [3620, -5000], [4140, -5000], [4660, -5000], [5180, -5000], [5700, -5000], [6220, -5000], [6741, -5002], [7238, -5173],
      [7747, -5083], [8260, -5000], [8780, -5000], [9300, -5000], [9820, -5000], [10340, -5000], [10860, -5000], [11380, -5000],
      [11900, -5000], [12420, -5000], [12930, -5083], [13363, -5366], [13646, -5799], [13728, -6310], [13597, -6810], [13275, -7214],
      [12816, -7453], [12295, -7499], [11760, -7499], [11240, -7499], [10720, -7499], [10200, -7499], [9680, -7499], [9160, -7499],
      [8640, -7499], [8120, -7499], [7600, -7499], [7084, -7565], [6579, -7680], [6082, -7506], [5560, -7499], [5040, -7499],
      [4520, -7499], [4000, -7499], [3480, -7499], [2960, -7499], [2440, -7499], [1920, -7499], [1400, -7512], [915, -7691],
      [543, -8051], [349, -8530], [366, -9047], [590, -9513], [984, -9848], [1480, -9995], [2012, -9999], [2540, -9999],
      [3060, -9999], [3580, -9999], [4100, -9999], [4620, -9999], [5140, -9999], [5660, -9999], [6180, -9999], [6700, -9999],
      [7198, -10163], [7712, -10103], [8220, -9999], [8740, -9999], [9260, -9999], [9780, -9999], [10300, -9999], [10820, -9999],
      [11340, -9999], [11860, -9999], [12380, -9999], [12900, -9999], [13420, -9999], [13940, -9999], [14460, -9999], [14980, -9999],
      [15100, -9999],
    ],
  },
  {
    name: 'ZOROPERSIA',
    blurb: 'Persian fire-temple sprint: long straights and big jumps',
    sprint: true, samples: 26, jumps: 20,
    forks: [['plain', 'cool'], ['jump', 'charge'], ['charge', 'cool']],
    curveForks: [['plain', 'charge'], ['plain', 'cool']],
    theme: { wall: '#ff9a3d', wallFace: '#f6e2c4', lights: '255, 180, 90', kerb: '#2fb5a8', surface: '#2c2420' },
    // Generated route: rows across the world joined by sweeping U-turns, start to finish.
    control: [
      [0, 0], [520, 0], [1040, 0], [1560, 0], [2080, 0], [2600, 0], [3120, 0], [3640, 0],
      [4160, 0], [4680, 0], [5200, 0], [5720, 0], [6240, 0], [6769, -18], [7288, -145], [7803, -39],
      [8338, -1], [8858, -1], [9378, -1], [9898, -1], [10418, -1], [10938, -1], [11458, -1], [11978, -1],
      [12498, -1], [13026, -127], [13545, -95], [14076, -2], [14596, -2], [15116, -2], [15636, -2], [16156, -2],
      [16716, -2], [17236, -2], [17756, -2], [18276, -2], [18790, -69], [19237, -327], [19549, -740], [19675, -1242],
      [19596, -1752], [19324, -2192], [18902, -2491], [18396, -2601], [17876, -2601], [17356, -2601], [16836, -2601], [16316, -2601],
      [15796, -2601], [15276, -2601], [14756, -2601], [14236, -2601], [13716, -2601], [13187, -2620], [12668, -2747], [12153, -2640],
      [11618, -2602], [11098, -2602], [10578, -2602], [10058, -2602], [9538, -2602], [9018, -2602], [8498, -2602], [7978, -2602],
      [7458, -2602], [6930, -2728], [6412, -2697], [5880, -2603], [5360, -2603], [4840, -2603], [4320, -2603], [3800, -2603],
      [3280, -2603], [2760, -2603], [2240, -2603], [1720, -2603], [1205, -2658], [749, -2903], [425, -3306], [284, -3803],
      [347, -4316], [606, -4764], [1018, -5076], [1520, -5202], [2040, -5203], [2560, -5203], [3080, -5203], [3600, -5203],
      [4120, -5203], [4640, -5203], [5160, -5203], [5680, -5203], [6200, -5203], [6727, -5214], [7248, -5346], [7762, -5254],
      [8298, -5204], [8818, -5204], [9338, -5204], [9858, -5204], [10378, -5204], [10898, -5204], [11418, -5204], [11938, -5204],
      [12458, -5204], [12987, -5321], [13506, -5310], [14036, -5205], [14556, -5205], [15076, -5205], [15596, -5205], [16116, -5205],
      [16636, -5205], [17156, -5205], [17676, -5205], [18196, -5205], [18713, -5249], [19176, -5479], [19512, -5872], [19669, -6365],
      [19621, -6880], [19377, -7335], [18974, -7659], [18476, -7801], [17956, -7804], [17436, -7804], [16916, -7804], [16396, -7804],
      [15876, -7804], [15356, -7804], [14836, -7804], [14316, -7804], [13796, -7804], [13271, -7810], [12749, -7943], [12234, -7870],
      [11698, -7805], [11178, -7805], [10658, -7805], [10138, -7805], [9618, -7805], [9098, -7805], [8578, -7805], [8058, -7805],
      [7538, -7805], [7009, -7912], [6489, -7922], [5960, -7806], [5440, -7806], [4920, -7806], [4400, -7806], [3880, -7806],
      [3360, -7806], [2840, -7806], [2320, -7806], [1800, -7806], [1280, -7806], [760, -7806], [240, -7806], [-280, -7806],
      [-800, -7806], [-1040, -7806],
    ],
  },
  {
    name: 'BIFROST',
    blurb: 'Rainbow bridge between floating islands: jump after jump',
    sprint: true, samples: 26, jumps: 20,
    forks: [['jump', 'plain'], ['jump', 'charge'], ['cool', 'charge'], ['jump', 'cool']],
    curveForks: [['plain', 'charge']],
    theme: { wall: '#c9a6ff', wallFace: '#f3eaff', lights: '230, 210, 255', kerb: '#7fe8ff', surface: '#232036' },
    // Generated route: rows across the world joined by sweeping U-turns, start to finish.
    control: [
      [0, 0], [520, 0], [1040, 0], [1560, 0], [2080, 0], [2600, 0], [3120, 0], [3640, 0],
      [4160, 0], [4680, 0], [5200, 0], [5720, 0], [6241, -39], [6748, -182], [7257, -51], [7778, 0],
      [8298, 0], [8818, 0], [9338, 0], [9858, 0], [10378, 0], [10898, 0], [11418, 0], [11938, 0],
      [12446, -131], [12969, -154], [13474, -2], [13996, 0], [14516, 0], [15036, 0], [15556, 0], [16076, 0],
      [16596, 0], [17116, 0], [17636, 0], [18155, -19], [18634, -213], [18994, -585], [19173, -1070], [19140, -1586],
      [18900, -2045], [18496, -2367], [17996, -2499], [17476, -2500], [16956, -2500], [16436, -2500], [15916, -2500], [15396, -2500],
      [14876, -2500], [14356, -2500], [13836, -2500], [13304, -2530], [12799, -2727], [12278, -2667], [11759, -2501], [11236, -2501],
      [10716, -2501], [10196, -2501], [9676, -2501], [9156, -2501], [8636, -2501], [8116, -2501], [7596, -2501], [7077, -2528],
      [6605, -2737], [6257, -3120], [6094, -3611], [6143, -4125], [6397, -4576], [6812, -4885], [7316, -5001], [7836, -5001],
      [8356, -5001], [8876, -5001], [9396, -5001], [9916, -5001], [10436, -5001], [10956, -5001], [11476, -5001], [11997, -5039],
      [12504, -5183], [13013, -5052], [13534, -5001], [14054, -5001], [14574, -5001], [15094, -5001], [15614, -5001], [16134, -5001],
      [16694, -5001], [17214, -5001], [17734, -5001], [18241, -5144], [18764, -5144], [19271, -5001], [19792, -5001], [20312, -5001],
      [20832, -5001], [21352, -5001], [21872, -5001], [22392, -5001], [22912, -5001], [23432, -5001], [23950, -5027], [24423, -5237],
      [24771, -5620], [24934, -6110], [24884, -6625], [24630, -7076], [24216, -7385], [23712, -7500], [23192, -7500], [22672, -7500],
      [22152, -7500], [21632, -7500], [21112, -7500], [20592, -7500], [20072, -7500], [19552, -7500], [19019, -7543], [18515, -7734],
      [17997, -7650], [17472, -7501], [16952, -7501], [16432, -7501], [15912, -7501], [15392, -7501], [14872, -7501], [14352, -7501],
      [13832, -7501], [13312, -7501], [12794, -7537], [12328, -7761], [11993, -8155], [11846, -8651], [11912, -9164], [12180, -9606],
      [12604, -9902], [13112, -10001], [13632, -10001], [14152, -10001], [14672, -10001], [15192, -10001], [15712, -10001], [16232, -10001],
      [16752, -10001], [17272, -10001], [17792, -10052], [18301, -10183], [18808, -10040], [19330, -10001], [19850, -10001], [20370, -10001],
      [20890, -10001], [21410, -10001], [21930, -10001], [22450, -10001], [22970, -10001], [23490, -10001], [23997, -10145], [24520, -10145],
      [25027, -10001], [25548, -10001], [26068, -10001], [26588, -10001], [27108, -10001], [27628, -10001], [28148, -10001], [28668, -10001],
      [29188, -10001], [29708, -10001], [30228, -10001], [30748, -10001], [31268, -10001], [31788, -10001], [32068, -10001],
    ],
  },
  {
    name: 'EL DORADO',
    blurb: 'Golden jungle city: tight switchbacks and waterfall jumps',
    sprint: true, samples: 26, jumps: 20,
    forks: [['cool', 'charge'], ['jump', 'plain'], ['plain', 'cool'], ['jump', 'charge']],
    curveForks: [['plain', 'cool'], ['plain', 'charge']],
    theme: { wall: '#f2c24a', wallFace: '#f4e6c0', lights: '255, 220, 140', kerb: '#2fae6b', surface: '#24271e' },
    // Generated route: rows across the world joined by sweeping U-turns, start to finish.
    control: [
      [0, 0], [520, 0], [1040, 0], [1560, 0], [2080, 0], [2600, 0], [3120, 0], [3640, 0],
      [4160, 0], [4680, 0], [5200, 0], [5720, 0], [6240, 0], [6758, -111], [7241, -298], [7723, -113],
      [8249, 14], [8727, 255], [9240, 240], [9720, 8], [10247, 0], [10767, 0], [11287, 0], [11807, 0],
      [12327, 0], [12847, 0], [13367, 0], [13887, 0], [14407, -14], [14886, -208], [15232, -592], [15375, -1090],
      [15285, -1599], [14981, -2018], [14524, -2261], [14007, -2300], [13487, -2300], [12967, -2300], [12447, -2300], [11927, -2300],
      [11407, -2300], [10887, -2300], [10367, -2300], [9847, -2300], [9323, -2307], [8840, -2541], [8328, -2556], [7851, -2316],
      [7325, -2189], [6842, -2003], [6360, -2188], [5840, -2300], [5320, -2300], [4800, -2300], [4280, -2300], [3760, -2300],
      [3240, -2300], [2720, -2300], [2200, -2300], [1680, -2300], [1168, -2376], [739, -2665], [480, -3113], [444, -3630],
      [638, -4109], [1022, -4456], [1520, -4598], [2040, -4600], [2560, -4600], [3080, -4600], [3600, -4600], [4120, -4600],
      [4640, -4600], [5160, -4600], [5680, -4600], [6200, -4600], [6722, -4689], [7201, -4896], [7688, -4736], [8207, -4593],
      [8690, -4359], [9202, -4345], [9679, -4584], [10207, -4600], [10727, -4600], [11247, -4600], [11767, -4600], [12287, -4600],
      [12807, -4600], [13327, -4600], [13847, -4600], [14367, -4608], [14853, -4785], [15212, -5157], [15372, -5649], [15300, -6162],
      [15011, -6591], [14563, -6849], [14047, -6899], [13527, -6899], [13007, -6899], [12487, -6899], [11967, -6899], [11447, -6899],
      [10927, -6899], [10407, -6899], [9887, -6899], [9364, -6902], [8877, -7124], [8366, -7168], [7892, -6926], [7361, -6811],
      [6882, -6604], [6395, -6764], [5880, -6899], [5360, -6899], [4840, -6899], [4320, -6899], [3800, -6899], [3280, -6899],
      [2760, -6899], [2240, -6899], [1720, -6899], [1206, -6962], [767, -7236], [493, -7675], [438, -8189], [615, -8676],
      [988, -9035], [1480, -9195], [2000, -9199], [2520, -9199], [3040, -9199], [3560, -9199], [4080, -9199], [4600, -9199],
      [5120, -9199], [5640, -9199], [6160, -9199], [6685, -9269], [7161, -9492], [7656, -9360], [8165, -9198], [8653, -8976],
      [9164, -8932], [9638, -9174], [10167, -9199], [10687, -9199], [11207, -9199], [11727, -9199], [12247, -9199], [12767, -9199],
      [13287, -9199], [13807, -9199], [14327, -9199], [14847, -9199], [15367, -9199], [15887, -9199], [16447, -9199], [16847, -9199],
    ],
  },
];

export const HALF_WIDTH = 195;     // half the racing surface width, px
export const WALL_THICKNESS = 14;  // barrier band drawn just outside the racing surface, px
export const WALL_DIST = HALF_WIDTH + WALL_THICKNESS;  // centerline to the outside of the barrier
const SAMPLES_PER_SEGMENT = 40;
const CRAFT_HALF_WIDTH = 22;      // how close the craft's center gets to a wall face
export const SECTORS = 10;         // checkpoints per lap; all must be passed in order

/**
 * Cooling lane: a strip along the outside edge of the main straight (right-hand side heading
 * down it, away from the infield). Driving over it sheds heat fast.
 */
export const COOL_LANE = { from: 6, to: 32, side: -1, width: 78 };

export interface TrackPoint { x: number; y: number; nx: number; ny: number; curve: number }

const DRS_STRAIGHT_CURVE = 1 / 2500; // gentler than this counts as straight
const DRS_MIN_SAMPLES = 36;          // a straight must be at least this long (~650 px) to get a zone
const DRS_TRIM = 4;                  // zone starts/ends this many samples inside the straight

export class Track {
  name: string;
  theme: TrackTheme;
  /** Centerline samples with unit left-normals and signed curvature. Index 0 is the start line. */
  pts: TrackPoint[] = [];
  bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** DRS zones: sample ranges on the long straights (from may be > to when a zone wraps the line). */
  drsZones: { from: number; to: number }[] = [];
  /** Sprint: raced once, start to finish (see TrackDef.sprint). */
  sprint = false;
  jumps: Jump[] = [];
  /** Distance along the centerline to each sample (px), and the full length. */
  dist: number[] = [];
  totalLength = 0;
  /** Which jump's ramp a sample is on (-1 for none), for groundAt. */
  private rampAt: Int16Array = new Int16Array(0);
  /** Point-to-point (sprints): route samples run 0..routeEnd, then the lead-in to the start line. */
  open = false;
  routeEnd = 0;
  finishIndex = 0;
  /** Forks on a sprint, and the effect strips on their lanes. */
  forks: Fork[] = [];
  strips: Strip[] = [];
  /** Half-width of the drivable road at each sample, and of the island in its middle (0 = none). */
  outer: Float32Array = new Float32Array(0);
  island: Float32Array = new Float32Array(0);

  constructor(def: TrackDef = TRACKS[0]) {
    this.name = def.name;
    this.theme = def.theme;
    const k = def.scale ?? 1;
    const CONTROL = def.control.map(([x, y]) => [x * k, y * k] as [number, number]);
    const n = CONTROL.length;
    const raw: Vec[] = [];
    const per = def.samples ?? SAMPLES_PER_SEGMENT;
    this.open = !!def.sprint;
    if (this.open) {
      // The route from the start line to the end of the run-off, as an open spline...
      const at = (i: number) => CONTROL[Math.max(0, Math.min(n - 1, i))];
      for (let i = 0; i < n - 1; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        for (let s2 = 0; s2 < per; s2++) {
          const t = s2 / per;
          raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) });
        }
      }
      raw.push({ x: CONTROL[n - 1][0], y: CONTROL[n - 1][1] });
      this.routeEnd = raw.length - 1;
      // ...then a straight lead-in to the start line, where the grid lines up.
      const dx = raw[1].x - raw[0].x, dy = raw[1].y - raw[0].y, len = Math.hypot(dx, dy) || 1;
      for (let j = LEAD_IN; j >= 1; j--) raw.push({ x: raw[0].x - (dx / len) * len * j, y: raw[0].y - (dy / len) * len * j });
    } else {
      for (let i = 0; i < n; i++) {
        const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
        for (let s2 = 0; s2 < per; s2++) {
          const t = s2 / per;
          raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) });
        }
      }
    }
    const m = raw.length;
    for (let i = 0; i < m; i++) {
      const a2 = raw[this.shift(i, -1, m)], b2 = raw[this.shift(i, 1, m)];
      const dx = b2.x - a2.x, dy = b2.y - a2.y, len = Math.hypot(dx, dy) || 1;
      this.pts.push({ x: raw[i].x, y: raw[i].y, nx: dy / len, ny: -dx / len, curve: 0 });
    }
    // Curvature: change in direction per px, smoothed so kerbs cover whole corners.
    const turn = this.pts.map((_, i) => {
      const a2 = this.pts[this.shift(i, -1, m)], b2 = this.pts[this.shift(i, 1, m)];
      const cross = a2.nx * b2.ny - a2.ny * b2.nx;
      const ds = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1;
      return cross / ds;
    });
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k2 = -6; k2 <= 6; k2++) sum += turn[this.shift(i, k2, m)];
      this.pts[i].curve = sum / 13;
    }
    this.outer = new Float32Array(m).fill(HALF_WIDTH);
    this.island = new Float32Array(m);

    this.bounds = {
      minX: Math.min(...this.pts.map((p) => p.x)) - WALL_DIST, maxX: Math.max(...this.pts.map((p) => p.x)) + WALL_DIST,
      minY: Math.min(...this.pts.map((p) => p.y)) - WALL_DIST, maxY: Math.max(...this.pts.map((p) => p.y)) + WALL_DIST,
    };
    this.findDrsZones();
    this.dist = [0];
    for (let i = 1; i < m; i++) this.dist.push(this.dist[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y));
    this.totalLength = this.open ? this.dist[this.routeEnd]
      : this.dist[m - 1] + Math.hypot(this.pts[0].x - this.pts[m - 1].x, this.pts[0].y - this.pts[m - 1].y);
    this.sprint = !!def.sprint;
    if (this.open) {
      let f = this.routeEnd;
      while (f > 0 && this.dist[this.routeEnd] - this.dist[f] < RUNOFF) f--;
      this.finishIndex = f;
    }
    this.rampAt = new Int16Array(m).fill(-1);
    if (def.jumps) this.placeJumps(def.jumps, def.forks);
    if (def.curveForks) this.placeCurveForks(def.curveForks);
    // Splits make the road wider: grow the bounds to match.
    const extra = Math.max(...this.outer) - HALF_WIDTH;
    this.bounds.minX -= extra; this.bounds.minY -= extra; this.bounds.maxX += extra; this.bounds.maxY += extra;
  }

  get length(): number { return this.pts.length; }

  /** Whether a sample lies in a DRS zone; returns the zone's index or -1. */
  drsZoneAt(i: number): number {
    return this.drsZones.findIndex((z) => (z.from <= z.to ? i >= z.from && i <= z.to : i >= z.from || i <= z.to));
  }

  /** Mark every long straight as a DRS zone. Runs that wrap past index 0 are joined up. */
  private findDrsZones(): void {
    const m = this.pts.length;
    const straight = this.pts.map((p, i) => Math.abs(p.curve) < DRS_STRAIGHT_CURVE && !(this.open && (i >= this.routeEnd - 2 && i <= this.routeEnd + 1)));
    // Start scanning just after a curved sample so a straight that wraps the line isn't split.
    const start = straight.findIndex((s) => !s);
    if (start < 0) return;
    let runStart = -1;
    for (let k = 1; k <= m; k++) {
      const i = (start + k) % m;
      if (straight[i] && runStart < 0) runStart = k;
      if ((!straight[i] || k === m) && runStart >= 0) {
        const len = k - runStart;
        if (len >= DRS_MIN_SAMPLES) {
          this.drsZones.push({ from: (start + runStart + DRS_TRIM) % m, to: (start + k - 1 - DRS_TRIM) % m });
        }
        runStart = -1;
      }
    }
  }

  /**
   * Sample `d` steps from `i` along the road. Loops wrap; a point-to-point route runs lead-in, then
   * route, and stops at either end instead of jumping across the break.
   */
  shift(i: number, d: number, m = this.pts.length): number {
    if (!this.open) return (((i + d) % m) + m) % m;
    const lead = m - 1 - this.routeEnd;
    const lin = i <= this.routeEnd ? i + lead : i - this.routeEnd - 1;
    const t = Math.max(0, Math.min(m - 1, lin + d));
    return t >= lead ? t - lead : this.routeEnd + 1 + t;
  }

  /** Whether the road between sample i and the next is missing (the break after a route's end). */
  isBreak(i: number): boolean { return this.open && i === this.routeEnd; }

  /** How far along the race a sample is, 0 at the start line to 1 at the finish (sprints). */
  fraction(i: number): number {
    if (!this.open) return i / this.pts.length;
    if (i > this.routeEnd) return 0;
    return Math.min(1, this.dist[i] / this.dist[this.finishIndex]);
  }

  /** Start line to finish line, in px. */
  get routeLength(): number { return this.open ? this.dist[this.finishIndex] : this.totalLength; }

  /**
   * Splits with jumps along the route, spread out (none near the start or the finish). Each needs
   * a long, nearly straight stretch: the road eases apart into two lanes around an island, one lane
   * gets a ramp and a gap, and the lanes ease back together after the landing run.
   */
  private placeJumps(count: number, recipe?: [LaneKind, LaneKind][]): void {
    const m = this.pts.length, end = this.open ? this.routeEnd : m - 1;
    const need = SPLIT_EASE * 2 + SPLIT_BEFORE + RAMP_LENGTH + JUMP_GAP + SPLIT_AFTER;
    const spots: number[] = [];
    let run = -1;
    for (let i = 0; i <= end + 1; i++) {
      const ok = i <= end && Math.abs(this.pts[i].curve) < 1 / 1500;
      if (ok && run < 0) run = i;
      if ((!ok || i === end + 1) && run >= 0) {
        // Every stretch long enough gets a split, centred on it.
        const len = this.dist[Math.min(i, end)] - this.dist[run];
        if (len >= need) {
          const mid = this.dist[run] + (len - need) / 2 + SPLIT_EASE + SPLIT_BEFORE;
          let j = run; while (j < end && this.dist[j] < mid) j++;
          spots.push(j);
        }
        run = -1;
      }
    }
    const L = this.open ? this.dist[this.finishIndex] : this.totalLength;
    const usable = spots.filter((i) => this.dist[i] > L * 0.06 && this.dist[i] < L * 0.92);
    const pickN = Math.min(count, usable.length);
    for (let k = 0; k < pickN; k++) {
      const from = usable[Math.floor(((k + 0.5) / pickN) * usable.length)];
      const at = (d: number) => {
        let j = from;
        if (d < 0) { while (j > 0 && this.dist[from] - this.dist[j] < -d) j--; return j; }
        while (j < end && this.dist[j] - this.dist[from] < d) j++;
        return j;
      };
      const lip = at(RAMP_LENGTH), land = at(RAMP_LENGTH + JUMP_GAP);
      // What each lane offers (the recipe in turn; sides alternate so it isn't always the same way).
      const pair = recipe?.[k % recipe.length] ?? ['jump', 'plain'];
      const flip = k % 2 === 1;
      const left = flip ? pair[1] : pair[0], right = flip ? pair[0] : pair[1];
      const d0 = this.dist[from] - SPLIT_BEFORE, d1 = this.dist[land] + SPLIT_AFTER;
      const s0 = at(-SPLIT_BEFORE - SPLIT_EASE * 0.5), s1 = at(RAMP_LENGTH + JUMP_GAP + SPLIT_AFTER + SPLIT_EASE * 0.5);
      this.forks.push({ from: s0, to: s1, curve: false, left, right, sign: 0 });
      for (const [side, kind] of [[1, left], [-1, right]] as const) {
        if (kind === 'jump') {
          this.jumps.push({ from, lip, land, height: RAMP_HEIGHT, side });
          for (let j = from; j <= lip; j++) this.rampAt[j] = this.jumps.length - 1;
        } else if (kind !== 'plain') {
          this.strips.push({ side, kind, from: at(-SPLIT_BEFORE * 0.6), to: at(RAMP_LENGTH + JUMP_GAP + SPLIT_AFTER * 0.8) });
        }
      }
      // The split around it.
      for (let i = 0; i <= end; i++) {
        const d = this.dist[i];
        if (d < d0 - SPLIT_EASE || d > d1 + SPLIT_EASE) continue;
        const e = d < d0 ? (d - (d0 - SPLIT_EASE)) / SPLIT_EASE : d > d1 ? (d1 + SPLIT_EASE - d) / SPLIT_EASE : 1;
        const t = e * e * (3 - 2 * e);
        this.island[i] = Math.max(this.island[i], ISLAND_HALF * t);
        this.outer[i] = Math.max(this.outer[i], HALF_WIDTH + (ISLAND_HALF + LANE_WIDTH - HALF_WIDTH) * t);
      }
    }
  }

  /**
   * Forks on the long sweeping turns (the U-turns between rows): the road splits around an island
   * that follows the bend, so the inside lane is shorter but tighter and the outside lane longer but
   * faster; the recipe says what each lane offers ([inside, outside]).
   */
  private placeCurveForks(recipe: [LaneKind, LaneKind][]): void {
    if (!this.open) return;
    const end = this.routeEnd, L = this.dist[this.finishIndex];
    let run = -1, k = 0;
    for (let i = 0; i <= end + 1; i++) {
      const bend = i <= end && Math.abs(this.pts[i].curve) > 1 / 1800;
      if (bend && run < 0) run = i;
      if ((!bend || i === end + 1) && run >= 0) {
        const len = this.dist[Math.min(i, end)] - this.dist[run];
        const mid = Math.floor((run + i) / 2);
        if (len >= 2400 && this.dist[mid] > L * 0.05 && this.dist[mid] < L * 0.95 && this.island[mid] === 0) {
          const pair = recipe[k++ % recipe.length];
          const inside = Math.sign(this.pts[mid].curve) || 1;
          const d0 = this.dist[run] + 300, d1 = this.dist[Math.min(i, end)] - 300, ease = 500;
          let a = run, b = Math.min(i, end);
          for (let j = run; j <= b; j++) {
            const d = this.dist[j];
            if (d < d0 || d > d1) continue;
            const e = Math.min(1, (d - d0) / ease, (d1 - d) / ease);
            const t = e * e * (3 - 2 * e);
            const isl = 120 * t;
            this.island[j] = Math.max(this.island[j], isl);
            this.outer[j] = Math.max(this.outer[j], HALF_WIDTH + (120 + 250 - HALF_WIDTH) * t);
          }
          while (a < b && this.island[a] < 1) a++;
          while (b > a && this.island[b] < 1) b--;
          const left = inside > 0 ? pair[0] : pair[1], right = inside > 0 ? pair[1] : pair[0];
          this.forks.push({ from: a, to: b, curve: true, left, right, sign: inside });
          for (const [side, kind] of [[1, left], [-1, right]] as const) {
            if (kind !== 'plain' && kind !== 'jump') this.strips.push({ side, kind, from: a + 10, to: b - 10 });
          }
        }
        run = -1;
      }
    }
  }

  /** The fork whose split covers sample i, or null. */
  forkAt(i: number): Fork | null { return this.forks.find((f) => i >= f.from && i <= f.to) ?? null; }

  /** The effect strip under a point on sample i, or null. */
  stripAt(i: number, lat: number): Strip | null {
    if (!this.strips.length || this.island[i] < 1) return null;
    const side = lat >= 0 ? 1 : -1;
    return this.strips.find((st) => st.side === side && i >= st.from && i <= st.to) ?? null;
  }

  /** Road height at a point (ramps rise toward their lip, in their own lane; everywhere else 0). */
  groundAt(pos: Vec, index: number): number {
    const id = this.rampAt[index] ?? -1;
    if (id < 0) return 0;
    const j = this.jumps[id], p = this.pts[index];
    const lat = (pos.x - p.x) * p.nx + (pos.y - p.y) * p.ny;
    if (lat * j.side <= 0) return 0;
    // How far along the ramp, from the sample plus the point's offset along the track.
    const along = this.dist[index] + (pos.x - p.x) * -p.ny + (pos.y - p.y) * p.nx;
    const t = (along - this.dist[j.from]) / (this.dist[j.lip] - this.dist[j.from]);
    return t <= 0 ? 0 : t >= 1.02 ? 0 : j.height * Math.min(1, t);
  }

  /** Whether a sample is over a jump's gap, and on which side (for drawing): the jump, or null. */
  gapAt(i: number): Jump | null { return this.jumps.find((j) => i >= j.lip && i < j.land) ?? null; }

  /** Heading (radians) of the track at a sample. */
  direction(i: number): number {
    const p = this.pts[i];
    return Math.atan2(p.nx, -p.ny);
  }

  /** Nearest centerline sample to a point, searching near a hint index first (cheap per frame). */
  nearest(pos: Vec, hint: number): { index: number; dist: number } {
    const m = this.pts.length;
    let best = -1, bestD = Infinity;
    const scan = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const i = ((k % m) + m) % m;
        const p = this.pts[i];
        const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    scan(hint - 60, hint + 60);
    // Far from the hint (e.g. after a reset): fall back to a full search.
    if (Math.sqrt(bestD) > WALL_DIST * 1.5) scan(0, m - 1);
    return { index: best, dist: Math.sqrt(bestD) };
  }
}

/** Signed distance from the centerline at a sample (+ = track-left, toward the normal). */
export function lateral(track: Track, craft: Craft, index: number): number {
  const p = track.pts[index];
  return (craft.pos.x - p.x) * p.nx + (craft.pos.y - p.y) * p.ny;
}

/** Whether a craft is over the cooling lane right now. */
export function inCoolingLane(track: Track, craft: Craft, index: number): boolean {
  if (track.strips.length && track.stripAt(index, lateral(track, craft, index))?.kind === 'cool') return true;
  if (index < COOL_LANE.from || index > COOL_LANE.to) return false;
  return lateral(track, craft, index) * COOL_LANE.side >= HALF_WIDTH - COOL_LANE.width;
}

/** Per-craft race state: where it is on the track, sectors passed, lap times. */
export class RaceState {
  index = 0;
  /** Race time this car last passed each track sample (NaN = not yet), for time gaps. */
  passTimes: number[] = [];
  nextSector = 1;
  lap = 0;               // laps completed
  lapStart = -1;         // race time the current lap started; -1 = timer not started
  lastLap = 0;
  bestLap = 0;

  /** Returns 'lap' or 'best' when a lap is completed this step. */
  update(track: Track, craft: Craft, now: number, started: boolean): 'lap' | 'best' | null {
    if (started && this.lapStart < 0) this.lapStart = now;
    if (this.passTimes.length !== track.length) this.passTimes = new Array(track.length).fill(NaN);
    const before = this.index;
    const near = track.nearest(craft.pos, this.index);
    this.index = near.index;
    // Stamp every sample crossed going forward (at speed a step can skip one or two).
    const moved = (this.index - before + track.length) % track.length;
    if (started && moved > 0 && moved < 40) {
      for (let k = 1; k <= moved; k++) this.passTimes[(before + k) % track.length] = now;
    }

    if (track.open) return this.updateOpen(track, craft, now);
    const sector = Math.floor((this.index / track.length) * SECTORS);
    if (sector === this.nextSector % SECTORS) {
      if (this.nextSector === SECTORS) {
        // Back across the start line with every checkpoint passed.
        this.nextSector = 1;
        if (this.lapStart >= 0) {
          this.lastLap = now - this.lapStart;
          const best = this.bestLap === 0 || this.lastLap < this.bestLap;
          if (best) this.bestLap = this.lastLap;
          this.lap++;
          this.lapStart = now;
          return best ? 'best' : 'lap';
        }
      } else {
        this.nextSector++;
        if (track.sprint && (this.nextSector - 1) % 3 === 0) craft.harvested = 0;
      }
    }
    return null;
  }

  /** Point-to-point: sectors by distance; the run ends at the finish line (counted as lap 1). */
  private updateOpen(track: Track, craft: Craft, now: number): 'lap' | 'best' | null {
    if (this.lap > 0 || this.lapStart < 0) return null;
    const f = track.fraction(this.index);
    const sector = Math.min(SECTORS - 1, Math.floor(f * SECTORS));
    // Sectors only count in order (no cutting ahead).
    if (sector === this.nextSector % SECTORS && sector > 0) {
      this.nextSector++;
      if ((this.nextSector - 1) % 3 === 0) craft.harvested = 0;
    }
    if (f >= 1 && this.nextSector >= SECTORS) {
      this.lastLap = now - this.lapStart;
      const best = this.bestLap === 0 || this.lastLap < this.bestLap;
      if (best) this.bestLap = this.lastLap;
      this.lap = 1;
      return best ? 'best' : 'lap';
    }
    return null;
  }

  current(now: number): number { return this.lapStart < 0 ? 0 : now - this.lapStart; }

  /**
   * Seconds this car is behind `ahead`: how long ago `ahead` passed the spot we're at now.
   * NaN if `ahead` isn't actually ahead (within a lap) or hasn't passed here yet.
   */
  gapBehind(ahead: RaceState, track: Track, now: number): number {
    const d = ahead.progress(track) - this.progress(track);
    if (d <= 0 || d >= track.length) return NaN;
    return now - ahead.passTimes[this.index];
  }

  /** Distance into the race in track samples (laps done + way into this lap), for positions. */
  progress(track: Track): number {
    if (track.open) return this.lap * track.length + (this.index > track.routeEnd ? this.index - track.length : this.index);
    const behindLine = this.nextSector === 1 && this.index > track.length / 2;
    return this.lap * track.length + (behindLine ? this.index - track.length : this.index);
  }
}

export interface WallContact { impact: number; x: number; y: number }

/** Keep the craft between the walls, scraping along them. Returns the contact, or null if clear. */
export function collideWalls(track: Track, craft: Craft, race: RaceState, dt: number): WallContact | null {
  const i = race.index, p = track.pts[i];
  craft.ground = track.groundAt(craft.pos, i);
  if (track.strips.length && craft.onGround) {
    const st = track.stripAt(i, (craft.pos.x - p.x) * p.nx + (craft.pos.y - p.y) * p.ny);
    if (st?.kind === 'boost' || st?.kind === 'fire') craft.pad = PAD_HOLD;
    if (st?.kind === 'fire') craft.addHeat(0, FIRE_HEAT * dt);
    if (st?.kind === 'charge') craft.energy = Math.min(1, craft.energy + CHARGE_RATE * dt);
  }
  const ox = craft.pos.x - p.x, oy = craft.pos.y - p.y;
  const lat = ox * p.nx + oy * p.ny, along = ox * -p.ny + oy * p.nx;
  const sign = lat >= 0 ? 1 : -1;
  const outer = track.outer[i] - CRAFT_HALF_WIDTH, isl = track.island[i];
  let target = lat, nx = 0, ny = 0;
  if (Math.abs(lat) > outer) {
    // The outside wall: push back in.
    target = sign * outer; nx = -sign * p.nx; ny = -sign * p.ny;
  } else if (isl > 1 && Math.abs(lat) < isl + CRAFT_HALF_WIDTH) {
    // The island between two lanes: push out to whichever side we're on.
    target = sign * (isl + CRAFT_HALF_WIDTH); nx = sign * p.nx; ny = sign * p.ny;
  }
  let hit = target !== lat;
  if (hit) {
    craft.pos.x += (target - lat) * p.nx;
    craft.pos.y += (target - lat) * p.ny;
  }
  // The end of a point-to-point road.
  if (track.open && i >= track.routeEnd - 1 && i <= track.routeEnd && along > 0) {
    craft.pos.x -= along * -p.ny; craft.pos.y -= along * p.nx;
    nx = p.ny; ny = -p.nx; hit = true;
  }
  if (!hit) return null;
  const impact = craft.scrape({ x: nx, y: ny }, dt);
  const wallLat = Math.abs(lat) > outer ? sign * track.outer[i] : sign * isl;
  return { impact, x: p.x + p.nx * wallLat, y: p.y + p.ny * wallLat };
}

/**
 * Place a craft in a grid slot behind the start line, pointing down the straight.
 * Slot 0 is pole; slots stagger left/right like an F1 grid. Returns the sample index used.
 */
export function placeOnGrid(track: Track, craft: Craft, slot = 0): number {
  const back = track.length - 8 - slot * 9;
  const p = track.pts[back];
  const side = slot % 2 === 0 ? 55 : -55;
  craft.pos = { x: p.x + p.nx * side, y: p.y + p.ny * side };
  craft.vel = { x: 0, y: 0 };
  craft.heading = track.direction(back);
  return back;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
