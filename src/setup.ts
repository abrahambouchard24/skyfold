// Car tuning: four trade-off sliders, F1 style. Every step makes something better and something
// else worse, so a setup suits a track or a driving style rather than being better overall.
// The centre of every slider (all zeros) is the default, balanced car.

import { Mods, NO_MODS } from './craft';

export type SliderId = 'steering' | 'gearing' | 'wing' | 'cooling' | 'ers';
/** assist: 1 = ASSISTED handling (turning scrubs speed for you), 0 = PRO. */
export type Setup = Record<SliderId, number> & { assist: number };

export const STEPS = 3;   // each slider runs from -STEPS to +STEPS

export interface Slider {
  id: SliderId;
  name: string;
  /** What the low (-) and high (+) ends mean. */
  low: string;
  high: string;
  /** Change per step toward the high end (negative values improve toward the low end). */
  perStep: Partial<Mods>;
}

export const SLIDERS: Slider[] = [
  // Keyboard steering: a sharper rack swings the nose round faster but the car is twitchier and
  // slides more; a lazy one is calm and planted but slow to change direction.
  { id: 'steering', name: 'STEERING', low: 'LAZY · STABLE', high: 'SHARP · AGILE', perStep: { turn: 0.06, grip: -0.03 } },
  { id: 'gearing', name: 'WINGBEAT', low: 'QUICK STROKES · ACCELERATION', high: 'LONG STROKES · TOP SPEED', perStep: { top: 0.015, accel: -0.03 } },
  { id: 'wing', name: 'WINGSPAN', low: 'SWEPT · TOP SPEED', high: 'WIDE · GRIP', perStep: { grip: 0.05, top: -0.01 } },
  { id: 'cooling', name: 'FROST BLOOD', low: 'WARM · TOP SPEED', high: 'COLD · RUNS COOL', perStep: { heat: 0.08, top: -0.0075 } },
  { id: 'ers', name: 'FIRE BREATH', low: 'KINDLING · FAST CHARGE', high: 'INFERNO · STRONG FIRE', perStep: { ers: 0.08, harvest: -0.12 } },
];

export const BALANCED: Setup = { steering: 0, gearing: 0, wing: 0, cooling: 0, ers: 0, assist: 1 };

export const PRESETS: { name: string; setup: Setup }[] = [
  { name: 'BALANCED', setup: BALANCED },
  // Long straights: tall gearing and low wing, a calmer car that's easier to hold flat out.
  { name: 'SPEED', setup: { steering: -1, gearing: 2, wing: -2, cooling: -1, ers: 1, assist: 1 } },
  // Twisty tracks: sharp steering and lots of wing to carry the speed through corners.
  { name: 'GRIP', setup: { steering: 2, gearing: -1, wing: 3, cooling: 0, ers: 0, assist: 1 } },
  // Long races and wall-heavy tracks: runs cool, harvests boost fast from drifts.
  { name: 'ENDURANCE', setup: { steering: 0, gearing: 0, wing: 1, cooling: 3, ers: -2, assist: 1 } },
  // Drift style: sharp steering and fast harvest, so every slide pays back in boost.
  { name: 'DRIFT', setup: { steering: 2, gearing: 0, wing: -1, cooling: 1, ers: -2, assist: 1 } },
];

/** A setup's effect on the car. */
export function setupMods(s: Setup): Mods {
  const m: Mods = { ...NO_MODS };
  for (const sl of SLIDERS) {
    const step = clampStep(s[sl.id]);
    for (const k of Object.keys(sl.perStep) as (keyof Mods)[]) m[k] += (sl.perStep[k] ?? 0) * step;
  }
  m.assist = s.assist ? 1 : 0;
  return m;
}

/** Add two sets of mods (e.g. garage upgrades plus a setup). */
export function addMods(a: Mods, b: Mods): Mods {
  const m: Mods = { ...NO_MODS };
  for (const k of Object.keys(m) as (keyof Mods)[]) m[k] = a[k] + b[k];
  return m;
}

/** Stat bars for the tuning screen: each 0..1, with the balanced car at 0.5. */
export function statBars(m: Mods): { name: string; value: number; delta: number }[] {
  // Each bar is scaled so the slider ranges fill most of it.
  const bar = (name: string, delta: number, range: number) => ({ name, delta, value: Math.max(0.03, Math.min(1, 0.5 + delta / range / 2)) });
  return [
    bar('STEERING', m.turn, 0.36),
    bar('TOP SPEED', m.top, 0.12),
    bar('ACCELERATION', m.accel, 0.12),
    bar('GRIP', m.grip, 0.2),
    bar('COOLING', m.heat, 0.3),
    bar('FIRE POWER', m.ers, 0.3),
    bar('FIRE CHARGE', m.harvest, 0.45),
  ];
}

function clampStep(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(-STEPS, Math.min(STEPS, n));
}

/** A clean copy of a setup from anywhere (save data, the network). */
export function sanitize(s: Partial<Setup> | null | undefined): Setup {
  const out = { ...BALANCED };
  if (s) for (const sl of SLIDERS) out[sl.id] = clampStep(s[sl.id]);
  // Setups saved before handling existed start out ASSISTED.
  if (s && s.assist !== undefined) out.assist = s.assist ? 1 : 0;
  return out;
}

const KEY = 'skyfold-setup';

export function loadSetup(): Setup {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...BALANCED }; }
}

export function saveSetup(s: Setup): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not kept */ }
}
