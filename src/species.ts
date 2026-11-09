// How each dragon flies. The six racers are six species (see SPECIES in dragon.ts, same order as
// the liveries), and each has a small, honest trade-off on top of the shared flight model, applied
// through Craft.mods for the player, the AI and online riders alike. Nothing here is more than a
// few percent: a better pilot still wins on any dragon, but each one feels its own.

import { Mods, NO_MODS } from './craft';

export interface SpeciesTraits {
  /** The species' name, as on the selection cards. */
  species: string;
  /** A few words on how it flies. */
  trait: string;
  /** Its trade-offs (added to the rider's own setup and upgrades). */
  mods: Partial<Mods>;
}

/** By livery index (01 FAFNIR = 0 ... 06 SKOLL = 5). */
export const TRAITS: SpeciesTraits[] = [
  // Lindworm: the measure the others are set against.
  { species: 'LINDWORM', trait: 'ALL-ROUNDER', mods: {} },
  // Sky serpent: light and quick to turn, holds a tight line, a touch slower flat out.
  { species: 'SKY SERPENT', trait: 'NIMBLE · TIGHT TURNS', mods: { turn: 0.1, grip: 0.06, top: -0.02 } },
  // Stone drake: heavy and hard to hurt, fastest in a straight line, slow to turn and to get going.
  { species: 'STONE DRAKE', trait: 'HEAVY · TOUGH · FAST', mods: { top: 0.035, heat: 0.25, accel: -0.05, grip: -0.05, turn: -0.06 } },
  // Emberwing: explosive off the line and out of corners, a strong gale, but it runs hot.
  { species: 'EMBERWING', trait: 'FIERCE PULL · RUNS HOT', mods: { accel: 0.05, ers: 0.08, heat: -0.2, top: -0.01 } },
  // Night wraith: sleek and fast, feeds on other dragons' wakes, a little loose in the turns.
  { species: 'NIGHT WRAITH', trait: 'SLEEK · FEEDS ON WAKES', mods: { top: 0.025, harvest: 0.12, grip: -0.015 } },
  // Stormcaller: gathers the gale fastest and rides it hardest, slower to pull away.
  { species: 'STORMCALLER', trait: 'STORM-BORN · GREAT GALE', mods: { harvest: 0.25, ers: 0.1, accel: -0.03, top: -0.01 } },
];

/** The species' trade-offs as a full Mods (zeros elsewhere). */
export function speciesMods(livery: number): Mods {
  const t = TRAITS[((livery % TRAITS.length) + TRAITS.length) % TRAITS.length];
  return { ...NO_MODS, ...t.mods };
}

/** Traits for a car named like '03 JORMUN' (its number picks the species). */
export function traitsForName(name: string): SpeciesTraits | null {
  const n = parseInt(name, 10);
  return Number.isFinite(n) && n > 0 ? TRAITS[(n - 1) % TRAITS.length] : null;
}
