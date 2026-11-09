// Player settings (volume, graphics, key bindings) and lap records, kept in the browser.

export type Action = 'left' | 'right' | 'brake' | 'boost';
export type Quality = 'high' | 'medium' | 'low';

export interface Settings {
  music: number;          // 0..1
  sfx: number;            // 0..1
  muted: boolean;
  quality: Quality;
  /** Up to two keys per action (KeyboardEvent.code). The mouse buttons always work too. */
  keys: Record<Action, string[]>;
  tutorialDone: boolean;
}

export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'left', label: 'STEER LEFT' },
  { id: 'right', label: 'STEER RIGHT' },
  { id: 'brake', label: 'BRAKE' },
  { id: 'boost', label: 'BOOST' },
];

export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['KeyS', 'ArrowDown', 'Space'],
  boost: ['KeyW', 'ArrowUp', 'ShiftLeft', 'ShiftRight', 'KeyE'],
};

const DEFAULTS: Settings = { music: 0.8, sfx: 0.9, muted: false, quality: 'high', keys: DEFAULT_KEYS, tutorialDone: false };
const SETTINGS_KEY = 'skyfold-settings';
const RECORDS_KEY = 'skyfold-records';

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const keys = { ...DEFAULT_KEYS };
      for (const a of ACTIONS) if (Array.isArray(raw.keys?.[a.id]) && raw.keys[a.id].length) keys[a.id] = raw.keys[a.id].map(String);
      return {
        music: num(raw.music, DEFAULTS.music), sfx: num(raw.sfx, DEFAULTS.sfx), muted: raw.muted === true,
        quality: raw.quality === 'medium' || raw.quality === 'low' ? raw.quality : 'high',
        keys, tutorialDone: raw.tutorialDone === true,
      };
    }
  } catch { /* fall through to defaults */ }
  return { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode: not kept */ }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback;
}

/** A key code as a short label for buttons: "KeyA" → "A", "ArrowLeft" → "←". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Enter: 'ENTER', Tab: 'TAB',
  };
  return named[code] ?? code.toUpperCase();
}

/** Best lap per track name (seconds), from Quick Race and Season races. */
export function loadRecords(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '{}');
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw ?? {})) if (typeof v === 'number' && v > 0) out[k] = v;
    return out;
  } catch { return {}; }
}

export function saveRecords(r: Record<string, number>): void {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch { /* not kept */ }
}
