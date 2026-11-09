// The player's rider: helm, beard (and its colour), cloak and shield, chosen in the Hoard and worn
// on the player's dragon. A few pieces are earned with deeds. Rivals get a look picked from their
// name, so the field is varied but stays the same from race to race.

import type { Progress } from './achievements';

export type Helm = 'cone' | 'spectacle' | 'hood' | 'bare';
export type Beard = 'none' | 'short' | 'long' | 'braided';
export type Cloak = 'plain' | 'bordered' | 'striped';
export type Shield = 'boards' | 'halves' | 'quartered' | 'spiral' | 'raven';

export interface RiderLook {
  helm: Helm;
  beard: Beard;
  /** Index into HAIR_COLORS (beard, and hair under a bare head). */
  hair: number;
  cloak: Cloak;
  shield: Shield;
}

export const HAIR_COLORS = ['#c26a2e', '#d9b26a', '#5a3a22', '#9a948a', '#e8d8a0', '#2a2420'];
export const HAIR_NAMES = ['RED', 'GOLDEN', 'BROWN', 'GREY', 'FLAXEN', 'BLACK'];

interface Choice { id: string; name: string; /** An achievement id that unlocks it (free if none). */ unlock?: string }
export interface RiderPart { key: keyof RiderLook; label: string; choices: Choice[] }

export const RIDER_PARTS: RiderPart[] = [
  { key: 'helm', label: 'HELM', choices: [
    { id: 'cone', name: 'IRON HELM' },
    { id: 'hood', name: 'FUR HOOD' },
    { id: 'bare', name: 'BRAIDS' },
    { id: 'spectacle', name: 'MASKED HELM', unlock: 'winner' },
  ] },
  { key: 'beard', label: 'BEARD', choices: [
    { id: 'none', name: 'NONE' },
    { id: 'short', name: 'SHORT' },
    { id: 'long', name: 'LONG' },
    { id: 'braided', name: 'BRAIDED', unlock: 'clean-sheet' },
  ] },
  { key: 'hair', label: 'HAIR', choices: HAIR_NAMES.map((n, i) => ({ id: String(i), name: n })) },
  { key: 'cloak', label: 'CLOAK', choices: [
    { id: 'plain', name: 'PLAIN' },
    { id: 'bordered', name: 'GOLD HEM' },
    { id: 'striped', name: 'STRIPED', unlock: 'grand-tour' },
  ] },
  { key: 'shield', label: 'SHIELD', choices: [
    { id: 'boards', name: 'BOARDS' },
    { id: 'halves', name: 'HALVES' },
    { id: 'quartered', name: 'QUARTERED' },
    { id: 'spiral', name: 'SPIRAL', unlock: 'record-breaker' },
    { id: 'raven', name: 'RAVEN', unlock: 'champion' },
  ] },
];

export const DEFAULT_RIDER: RiderLook = { helm: 'cone', beard: 'long', hair: 0, cloak: 'plain', shield: 'boards' };

/** Is this choice open to the player? */
export function choiceUnlocked(p: Progress | null, c: Choice): boolean {
  return !c.unlock || !!p?.unlocked.includes(c.unlock);
}

const KEY = 'skyfold-rider';

/** A saved look, checked piece by piece (anything unknown falls back to the default). */
export function loadRider(): RiderLook {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RiderLook> | null;
    return sanitizeRider(raw);
  } catch { return { ...DEFAULT_RIDER }; }
}

export function saveRider(look: RiderLook): void {
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* private mode: it lasts this visit */ }
}

export function sanitizeRider(raw: Partial<RiderLook> | null | undefined): RiderLook {
  const out = { ...DEFAULT_RIDER };
  if (!raw) return out;
  for (const part of RIDER_PARTS) {
    const v = raw[part.key];
    if (part.key === 'hair') { if (typeof v === 'number' && v >= 0 && v < HAIR_COLORS.length) out.hair = Math.floor(v); continue; }
    if (part.choices.some((c) => c.id === v)) (out as unknown as Record<string, unknown>)[part.key] = v;
  }
  return out;
}

/** A rival's look, picked from its name so it never changes. */
export function riderFromName(name: string): RiderLook {
  let h = [...name].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, 5);
  const pick = <T,>(arr: readonly T[]): T => { const v = arr[h % arr.length]; h = (h * 1103515245 + 12345) >>> 0; return v; };
  return {
    helm: pick(['cone', 'cone', 'hood', 'bare', 'spectacle'] as const),
    beard: pick(['short', 'long', 'long', 'braided', 'none'] as const),
    hair: pick([0, 1, 2, 3, 4, 5]),
    cloak: pick(['plain', 'bordered', 'striped'] as const),
    shield: pick(['boards', 'halves', 'quartered', 'spiral', 'raven'] as const),
  };
}
