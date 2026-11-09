// The daily challenge: one race a day, the same for everyone, picked from the date. A track, a
// car, a field and a twist (start from the back, start hot, or a faster field), with a goal to
// meet. The best result of the day and the run of days in a row are kept in the browser.

import { installDeco } from './deco';

const KEY = 'skyfold-daily';

export type Twist = 'back' | 'hot' | 'fast';

export interface DailyDef {
  date: string;            // local YYYY-MM-DD
  track: number;           // index into TRACKS
  car: number;             // livery index
  laps: number;
  twist: Twist;
  /** Finish this place or better. */
  top: number;
  /** AI driving skills, in livery order (the player's slot is unused). */
  skills: number[];
  /** Extra AI pace for the 'fast' twist (0 otherwise). */
  aiPace: number;
}

interface DailySave { date: string; best: number; tries: number; streak: number; lastDone: string }

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A small seeded generator, so a date always gives the same challenge. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function dailyChallenge(tracks: number, cars: number, skillMin: number, skillMax: number, date = todayKey()): DailyDef {
  const r = rng(`skyfold/${date}`);
  const twist = (['back', 'hot', 'fast'] as Twist[])[Math.floor(r() * 3)];
  return {
    date,
    track: Math.floor(r() * tracks),
    car: Math.floor(r() * cars),
    laps: 3,
    twist,
    top: twist === 'back' ? 3 : twist === 'hot' ? 2 : 1,
    skills: Array.from({ length: cars }, () => skillMin + (skillMax - skillMin) * r()),
    aiPace: twist === 'fast' ? 0.03 : 0,
  };
}

export function twistText(d: DailyDef): string {
  if (d.twist === 'back') return 'Start from the back of the grid and finish on the podium.';
  if (d.twist === 'hot') return 'Start with the heat bar at 70% and finish in the top two. Mind the walls.';
  return 'The field is 3% faster today. Start on pole and win.';
}

function load(): DailySave {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s.date === 'string') return s;
  } catch { /* fresh */ }
  return { date: '', best: 0, tries: 0, streak: 0, lastDone: '' };
}
function store(s: DailySave): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not saved */ } }

/** Today's record: best race time with the goal met (0 = not yet), tries, and the streak of days. */
export function dailyStatus(date = todayKey()): { best: number; tries: number; streak: number; done: boolean } {
  const s = load();
  const today = s.date === date;
  const yesterday = todayKey(new Date(Date.now() - 864e5));
  const alive = s.lastDone === date || s.lastDone === yesterday;
  return { best: today ? s.best : 0, tries: today ? s.tries : 0, streak: alive ? s.streak : 0, done: s.lastDone === date };
}

/** Record a finished daily race. Returns whether it was a new best for today. */
export function recordDaily(date: string, met: boolean, time: number): boolean {
  const s = load();
  if (s.date !== date) { s.date = date; s.best = 0; s.tries = 0; }
  s.tries++;
  let better = false;
  if (met) {
    if (s.lastDone !== date) {
      const yesterday = todayKey(new Date(new Date(date + 'T12:00:00').getTime() - 864e5));
      s.streak = s.lastDone === yesterday ? s.streak + 1 : 1;
      s.lastDone = date;
    }
    if (s.best === 0 || time < s.best) { s.best = time; better = true; }
  }
  store(s);
  return better;
}

const CSS = `
.dy { width: min(520px, calc(100% - 32px)); margin: auto; padding: 28px 30px 24px; text-align: center; }
.dy h2 { margin: 0; font-size: 30px; }
.dy .date { margin-top: 4px; }
.dy .track { font: 800 22px system-ui, sans-serif; letter-spacing: 0.14em; color: #e9e0cc; margin: 6px 0 2px; }
.dy .car { display: block; height: 120px; margin: 6px auto 4px; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.5)); }
.dy .twist { color: #e9e0cc; font-size: 16px; line-height: 1.45; margin: 10px 0 16px; }
.dy .stats { display: flex; justify-content: center; gap: 28px; margin-bottom: 20px; }
.dy .stats b { display: block; font: 800 22px 'Cinzel', Georgia, serif; color: #e3b26c; }
.dy .stats small { color: #a89d8a; font-weight: 700; letter-spacing: 0.2em; font-size: 10px; }
.dy .done { color: #8fd0e0; font-weight: 800; letter-spacing: 0.2em; font-size: 12px; margin-bottom: 12px; }
.dy .btns { display: flex; gap: 10px; justify-content: center; }
`;

export class DailyUI {
  private el: HTMLDivElement;

  constructor() {
    installDeco();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay hidden';
    this.el.style.zIndex = '14';
    document.body.append(this.el);
  }

  get isOpen(): boolean { return !this.el.classList.contains('hidden'); }

  /** info: the line under the track name (laps or sprint distance, and the car). */
  open(d: DailyDef, trackName: string, info: string, carPic: string, fmt: (t: number) => string,
    on: { start(): void; back(): void; tune(): void }): void {
    const st = dailyStatus(d.date);
    const nice = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    this.el.innerHTML = `
      <div class="dy deco-panel">
        <h2 class="deco-title">DAILY CHALLENGE</h2>
        <div class="deco-label date">${nice.toUpperCase()}</div>
        <div class="deco-rule"></div>
        <div class="track">${trackName}</div>
        <div class="deco-muted">${info}</div>
        <img class="car" src="${carPic}" alt="">
        <div class="twist">${twistText(d)}</div>
        ${st.done ? '<div class="done">◆ COMPLETED TODAY ◆</div>' : ''}
        <div class="stats">
          <div><b>${st.best ? fmt(st.best) : '-'}</b><small>BEST TODAY</small></div>
          <div><b>${st.tries}</b><small>TRIES</small></div>
          <div><b>${st.streak}</b><small>DAY STREAK</small></div>
        </div>
        <div class="btns">
          <button class="hr-btn" data-go>${st.tries ? 'TRY AGAIN' : 'START'}</button>
          <button class="hr-btn secondary" data-tune>TRAIN DRAGON</button>
          <button class="hr-btn secondary" data-back>BACK</button>
        </div>
      </div>`;
    this.el.querySelector('[data-go]')!.addEventListener('click', () => { this.close(); on.start(); });
    this.el.querySelector('[data-tune]')!.addEventListener('click', () => on.tune());
    this.el.querySelector('[data-back]')!.addEventListener('click', () => { this.close(); on.back(); });
    this.el.classList.remove('hidden');
  }

  close(): void { this.el.classList.add('hidden'); }
}
