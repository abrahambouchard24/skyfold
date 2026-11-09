// Story mode screens: the name prompt, the chapter map, mission briefings, dialogue, the garage
// and the mission result. Plain DOM overlays, styled to match menu.ts.

import { portraitSrc, preloadPortraits } from './portraits';
import {
  CHAPTERS, CHAPTER_TAGLINES, CHARACTERS, Goal, Line, MAX_LEVEL, MISSIONS, Outcome, REPLAY_SHARE, Save, Speaker,
  UPGRADES, UpgradeId, describe, linesFor, say, upgradeCost,
} from './story';

export interface StoryHandlers {
  /** Line up a mission's grid behind its intro dialogue (frozen until the race starts). */
  preview(index: number): void;
  /** Start the race for a mission (after its intro dialogue). */
  race(index: number): void;
  /** Back to the main menu. */
  exit(): void;
  /** The save changed (upgrade bought, name set, progress reset). */
  saved(save: Save): void;
  /** Open the TRAIN DRAGON screen (it returns to the story screen when done). */
  tune(back: () => void): void;
}

/** What the result screen reports after a story race. */
export interface StoryResult {
  index: number;
  success: boolean;
  goal: boolean;
  bonus: boolean;
  earned: number;
  /** First completion of this mission (shows its unlock note). */
  first: boolean;
  /** How the race went, so the post-race dialogue matches it. */
  outcome: Outcome;
}

const CSS = `
.st-wrap { width: 100%; max-width: 1040px; margin: auto; padding: 18px; text-align: left; }
.st-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.st-title { margin: 0; font-size: clamp(32px, 6vw, 54px); font-weight: 900; font-style: italic; letter-spacing: 0.04em;
  background: linear-gradient(90deg, #ff3d6e, #ffd23f); -webkit-background-clip: text; background-clip: text; color: transparent; }
.st-who { color: #8a93c0; font-weight: 700; letter-spacing: 0.16em; font-size: 13px; }
.st-points { font: 900 26px system-ui, sans-serif; color: #ffd23f; letter-spacing: 0.06em; }
.st-points small { display: block; font-size: 11px; color: #8a93c0; letter-spacing: 0.2em; text-align: right; }
.st-chapters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
@media (max-width: 860px) { .st-chapters { grid-template-columns: repeat(2, 1fr); } }
.st-chapter h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.2em; color: #8a93c0; }
.st-chapter h3 b { display: block; color: #e8ecff; font-size: 16px; letter-spacing: 0.1em; margin-top: 2px; }
.st-mission { display: block; width: 100%; text-align: left; margin-bottom: 10px; padding: 12px 12px 11px; border-radius: 12px;
  background: rgba(20,24,48,0.88); border: 2px solid #252b52; color: inherit; font: inherit; cursor: pointer;
  transition: transform 120ms, border-color 120ms, box-shadow 120ms; }
.st-mission:hover:not(:disabled) { transform: translateY(-3px); border-color: #ff3d6e; box-shadow: 0 0 22px -6px #ff3d6e; }
.st-mission:disabled { opacity: 0.4; cursor: default; }
.st-mission b { display: block; font-size: 14px; letter-spacing: 0.08em; }
.st-mission small { display: block; color: #8a93c0; font-size: 11px; margin-top: 3px; line-height: 1.3; }
.st-mission .st-badges { float: right; font-size: 13px; letter-spacing: 0.1em; }
.st-done { color: #4dff9a; } .st-star { color: #ffd23f; } .st-lock { color: #8a93c0; }
.hr-btn:disabled { filter: grayscale(1) brightness(0.55); cursor: default; }
.st-actions { display: flex; gap: 10px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
.st-link { background: none; border: 0; color: #8a93c0; font: 600 12px system-ui, sans-serif; letter-spacing: 0.12em; cursor: pointer; margin-top: 14px; }
.st-link:hover { color: #e8ecff; }
.st-card { max-width: 560px; margin: auto; padding: 26px 28px; border-radius: 18px; background: rgba(14,17,36,0.94);
  border: 2px solid #252b52; text-align: left; }
.st-card h2 { margin: 0 0 4px; font-size: 34px; font-weight: 900; letter-spacing: 0.06em; }
.st-card .st-sub { color: #8a93c0; font-weight: 700; letter-spacing: 0.16em; font-size: 12px; margin-bottom: 16px; }
.st-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid #1d2346; font-weight: 700; }
.st-row span:first-child { color: #8a93c0; font-size: 12px; letter-spacing: 0.14em; padding-top: 2px; }
.st-ok { color: #4dff9a; } .st-no { color: #ff5e7a; }
.st-input { width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 12px; border: 2px solid #252b52;
  background: #0b0e1e; color: #e8ecff; font: 800 22px system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; margin: 6px 0 18px; }
.st-input:focus { outline: none; border-color: #ff3d6e; }
.st-up { display: grid; grid-template-columns: 1fr auto; gap: 6px 14px; align-items: center; padding: 12px 0; border-top: 1px solid #1d2346; }
.st-up b { font-size: 14px; letter-spacing: 0.1em; }
.st-up small { grid-column: 1; color: #8a93c0; font-size: 12px; }
.st-pips { grid-column: 1; display: flex; gap: 4px; }
.st-pips i { width: 18px; height: 6px; border-radius: 3px; background: #252b52; }
.st-pips i.on { background: #4fe3ff; box-shadow: 0 0 8px #4fe3ff; }
.st-up .hr-btn { grid-row: 1 / span 3; grid-column: 2; min-width: 120px; padding: 10px 14px; font-size: 14px; }
.st-up .hr-btn:disabled { filter: grayscale(1) brightness(0.6); cursor: default; }

/* Dialogue: a bar across the bottom of the screen with the speaker's portrait, in deep-sea glass
   with a gold double frame, deco corners and an arched portrait frame lit in the speaker's colour. */
.st-talk { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center;
  background: linear-gradient(transparent 40%, rgba(4,16,20,0.88)); font-family: system-ui, sans-serif; color: #efe6d2; cursor: pointer; }
.st-talk.hidden { display: none; }
.st-box { position: relative; display: flex; gap: 22px; align-items: flex-start; width: min(960px, calc(100% - 32px)); margin-bottom: 28px;
  padding: 22px 28px 24px; border-radius: 6px;
  background: linear-gradient(160deg, rgba(16,58,66,0.96), rgba(6,22,28,0.97) 60%);
  border: 2px solid #b98040; outline: 1px solid rgba(217,178,91,0.45); outline-offset: 4px;
  box-shadow: 0 0 46px -14px var(--c), inset 0 0 0 1px rgba(246,227,161,0.15); }
.st-box::before, .st-box::after { content: ''; position: absolute; width: 22px; height: 22px; border: 2px solid #e3b878; pointer-events: none; }
.st-box::before { top: 7px; left: 7px; border-right: 0; border-bottom: 0; }
.st-box::after { bottom: 7px; right: 7px; border-left: 0; border-top: 0; }
.st-face { flex: none; width: 128px; height: 128px; border-radius: 64px 64px 4px 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: #0c3540; border: 3px solid #b98040; box-shadow: 0 0 0 2px var(--c), 0 0 22px -2px var(--c);
  font: 900 44px system-ui, sans-serif; color: #fff; }
.st-face img { width: 100%; height: 100%; object-fit: cover; }
.st-speaker { font: 700 20px 'Cinzel', 'Trajan Pro', Georgia, serif; letter-spacing: 0.16em; color: var(--c); text-shadow: 0 0 12px var(--c); }
.st-role { color: #b98040; font-size: 11px; letter-spacing: 0.22em; font-weight: 700; margin: 3px 0 10px; text-transform: uppercase; }
.st-text { font-size: 19px; line-height: 1.5; min-height: 56px; color: #f3ecdc; }
.st-next { position: absolute; right: 22px; bottom: 10px; color: #b98040; font-size: 11px; letter-spacing: 0.22em; font-weight: 700; }
.st-skip { position: fixed; top: 18px; right: 22px; z-index: 21; }

/* The way forward: one big card for the next mission. Nothing past it is shown. */
.st-continue { display: flex; align-items: center; justify-content: space-between; gap: 18px; width: 100%; padding: 22px 26px; margin-bottom: 22px;
  border-radius: 18px; border: 2px solid #ff3d6e; cursor: pointer; color: inherit; font: inherit; text-align: left;
  background: linear-gradient(110deg, rgba(255,61,110,0.22), rgba(255,210,63,0.08) 60%, rgba(14,17,36,0.9));
  box-shadow: 0 0 40px -14px #ff3d6e; transition: transform 160ms, box-shadow 160ms; }
.st-continue:hover { transform: translateY(-3px); box-shadow: 0 10px 50px -12px #ff3d6e; }
.st-continue small { display: block; color: #ffb3c4; font-weight: 800; letter-spacing: 0.2em; font-size: 12px; }
.st-continue b { display: block; font: 900 italic clamp(26px, 4vw, 38px) system-ui, sans-serif; letter-spacing: 0.04em; margin-top: 4px; }
.st-continue .st-go { flex: none; font: 900 18px system-ui, sans-serif; letter-spacing: 0.14em; color: #07080f; background: linear-gradient(90deg, #ff3d6e, #ffd23f);
  padding: 14px 22px; border-radius: 12px; }
.st-continue.champ { border-color: #ffd23f; background: linear-gradient(110deg, rgba(255,210,63,0.25), rgba(14,17,36,0.9)); box-shadow: 0 0 40px -12px #ffd23f; cursor: default; }
.st-journal-head { color: #8a93c0; font-weight: 800; letter-spacing: 0.2em; font-size: 12px; margin: 0 0 10px; }
.st-journal { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.st-journal .st-chapter h3 { margin-bottom: 6px; }

/* Chapter title card: full screen, fades in, click or wait to carry on. */
.st-chaptercard { position: fixed; inset: 0; z-index: 22; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(40,10,30,0.92), rgba(5,6,14,0.98)); cursor: pointer; text-align: center; padding: 20px;
  font-family: system-ui, sans-serif; color: #e8ecff; animation: st-fade 700ms ease both; }
.st-chaptercard.hidden { display: none; }
.st-chaptercard small { font-weight: 800; letter-spacing: 0.5em; color: #ff8aa6; font-size: 14px; animation: st-rise 900ms 150ms ease both; }
.st-chaptercard b { display: block; margin: 10px 0 14px; font: 900 italic clamp(44px, 9vw, 96px) system-ui, sans-serif; letter-spacing: 0.04em;
  background: linear-gradient(90deg, #ff3d6e, #ffd23f); -webkit-background-clip: text; background-clip: text; color: transparent; animation: st-rise 900ms 300ms ease both; }
.st-chaptercard p { margin: 0; color: #c8d2ff; font-size: 18px; letter-spacing: 0.04em; animation: st-rise 900ms 500ms ease both; }
@keyframes st-fade { from { opacity: 0; } }
@keyframes st-rise { from { opacity: 0; transform: translateY(14px); } }
.st-note { margin: 14px 0 0; padding: 10px 14px; border-radius: 10px; background: rgba(77,255,154,0.1); color: #4dff9a; font-weight: 800; font-size: 13px; letter-spacing: 0.06em; }
`;

export class StoryUI {
  private screen: HTMLDivElement;
  private talk: HTMLDivElement;
  private save!: Save;
  private lines: Line[] = [];
  private lineAt = 0;
  private typed = 0;
  private typing: number | null = null;
  private afterTalk: (() => void) | null = null;
  /** Finishing place in the race the current dialogue is about (for {place}). */
  private place = 0;
  private chapterCard: HTMLDivElement;
  private afterCard: (() => void) | null = null;
  private cardTimer: number | null = null;

  constructor(private on: StoryHandlers) {
    preloadPortraits();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    this.screen = document.createElement('div');
    this.screen.className = 'hr-overlay hidden';
    document.body.append(this.screen);

    this.talk = document.createElement('div');
    this.talk.className = 'st-talk hidden';
    this.talk.innerHTML = `<button class="hr-btn secondary st-skip" data-skip>SKIP</button>
      <div class="st-box"><div class="st-face"></div><div style="flex:1">
      <div class="st-speaker"></div><div class="st-role"></div><div class="st-text"></div></div>
      <div class="st-next">CLICK / SPACE ▸</div></div>`;
    document.body.append(this.talk);
    this.chapterCard = document.createElement('div');
    this.chapterCard.className = 'st-chaptercard hidden';
    document.body.append(this.chapterCard);
    this.chapterCard.addEventListener('click', () => this.endCard());

    this.talk.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-skip]')) this.endTalk();
      else this.advance();
    });
    addEventListener('keydown', (e) => {
      if (!this.chapterCard.classList.contains('hidden')) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); this.endCard(); }
        return;
      }
      if (this.talk.classList.contains('hidden')) {
        if (e.code === 'Enter' && !this.screen.classList.contains('hidden')) {
          this.screen.querySelector<HTMLElement>('[data-default]:not(:disabled)')?.click();
        }
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.advance(); }
      if (e.code === 'Escape') this.endTalk();
    });
  }

  get visible(): boolean {
    return !this.screen.classList.contains('hidden') || !this.talk.classList.contains('hidden') || !this.chapterCard.classList.contains('hidden');
  }

  hide(): void {
    this.screen.classList.add('hidden');
    this.talk.classList.add('hidden');
    this.chapterCard.classList.add('hidden');
  }

  /** Entry point: ask for a name if there's no save yet, otherwise show the chapter map. */
  open(save: Save | null): void {
    if (save) { this.save = save; this.showHub(); return; }
    this.render(`
      <div class="st-card">
        <h2>ROOKIE SEASON</h2>
        <div class="st-sub">A COUNTY SPEEDWAY. A LEGEND. ONE SHOT.</div>
        <div class="st-row" style="border:0"><span>WHAT'S YOUR NAME?</span></div>
        <input class="st-input" maxlength="14" placeholder="YOUR NAME" autofocus>
        <div class="st-actions" style="justify-content:flex-start">
          <button class="hr-btn" data-go data-default>START</button>
          <button class="hr-btn secondary" data-exit>BACK</button>
        </div>
      </div>`);
    const input = this.screen.querySelector<HTMLInputElement>('.st-input')!;
    const go = () => {
      const name = input.value.trim().toUpperCase().replace(/[^A-Z0-9 .'-]/g, '') || 'ROOKIE';
      this.save = { name, points: 0, upgrades: {}, done: [], bonus: [] };
      this.on.saved(this.save);
      this.showHub();
    };
    this.screen.querySelector('[data-go]')!.addEventListener('click', go);
    this.screen.querySelector('[data-exit]')!.addEventListener('click', () => this.on.exit());
    input.addEventListener('keydown', (e) => { if (e.code === 'Enter') go(); e.stopPropagation(); });
    setTimeout(() => input.focus(), 0);
  }

  /**
   * The story so far: a big card for the next mission, and below it every mission already
   * finished (to replay), grouped by chapter. Nothing beyond the next mission is shown.
   */
  showHub(): void {
    const s = this.save;
    const next = MISSIONS.findIndex((m) => !s.done.includes(m.id));
    const complete = next < 0;
    const reached = complete ? CHAPTERS.length - 1 : MISSIONS[next].chapter;
    const nm = complete ? null : MISSIONS[next];
    const forward = nm
      ? `<button class="st-continue" data-continue data-default>
          <div><small>CHAPTER ${nm.chapter + 1} · ${CHAPTERS[nm.chapter]}</small><b>${nm.title}</b></div>
          <span class="st-go">${s.done.length ? 'CONTINUE' : 'BEGIN'} ▸</span></button>`
      : `<div class="st-continue champ"><div><small>ROOKIE SEASON COMPLETE</small><b>${s.name} · CHAMPION</b></div></div>`;
    const journal = CHAPTERS.slice(0, reached + 1).map((ch, c) => {
      const finished = MISSIONS.map((m, i) => ({ m, i })).filter(({ m }) => m.chapter === c && s.done.includes(m.id));
      if (!finished.length) return '';
      const cards = finished.map(({ m, i }) => {
        const star = m.bonus ? (s.bonus.includes(m.id) ? ' <span class="st-star">★</span>' : ' <span class="st-lock">☆</span>') : '';
        return `<button class="st-mission" data-mission="${i}"><span class="st-badges"><span class="st-done">✓</span>${star}</span>
          <b>${m.title}</b><small>${m.track} · REPLAY</small></button>`;
      }).join('');
      return `<div class="st-chapter"><h3>CHAPTER ${c + 1}<b>${ch}</b></h3>${cards}</div>`;
    }).join('');
    this.render(`
      <div class="st-wrap">
        <div class="st-head">
          <div><h1 class="st-title">ROOKIE SEASON</h1>
            <div class="st-who">${s.name} · LEOPARD GP${complete ? ' · CHAMPION' : ''}</div></div>
          <div class="st-points">${s.points}<small>TEAM POINTS</small></div>
        </div>
        ${forward}
        ${journal ? `<p class="st-journal-head">THE STORY SO FAR</p><div class="st-journal">${journal}</div>` : ''}
        <div class="st-actions">
          ${s.done.includes('tryout') ? '<button class="hr-btn" data-garage>GARAGE</button>' : ''}
          <button class="hr-btn secondary" data-tune>TRAIN DRAGON</button>
          <button class="hr-btn secondary" data-exit>MAIN MENU</button>
        </div>
        <div style="text-align:center"><button class="st-link" data-reset>RESET STORY PROGRESS</button></div>
      </div>`);
    this.screen.querySelector('[data-continue]')?.addEventListener('click', () => this.showBriefing(next));
    this.screen.querySelectorAll<HTMLElement>('[data-mission]').forEach((b) =>
      b.addEventListener('click', () => this.showBriefing(Number(b.dataset.mission))));
    this.screen.querySelector('[data-garage]')?.addEventListener('click', () => this.showGarage());
    this.screen.querySelector('[data-tune]')?.addEventListener('click', () => this.on.tune(() => this.showHub()));
    this.screen.querySelector('[data-exit]')!.addEventListener('click', () => this.on.exit());
    this.screen.querySelector('[data-reset]')!.addEventListener('click', () => {
      if (!confirm('Reset all story progress, points and upgrades? This can\'t be undone.')) return;
      this.save = { name: this.save.name, points: 0, upgrades: {}, done: [], bonus: [] };
      this.on.saved(this.save);
      this.showHub();
    });
  }

  /** Into a mission: its chapter's title card the first time a chapter starts, then the intro. */
  private begin(i: number): void {
    const m = MISSIONS[i];
    this.screen.classList.add('hidden');
    this.on.preview(i);
    const newChapter = !this.save.done.includes(m.id) && (i === 0 || MISSIONS[i - 1].chapter !== m.chapter);
    const intro = () => this.dialogue(linesFor(m.intro, null, this.save.flags ?? []), () => this.on.race(i));
    if (newChapter) this.chapterTitle(m.chapter, intro);
    else intro();
  }

  private chapterTitle(c: number, done: () => void): void {
    this.chapterCard.innerHTML = `<small>CHAPTER ${c + 1}</small><b>${CHAPTERS[c]}</b><p>${CHAPTER_TAGLINES[c]}</p>`;
    // Restart the fade-in animations.
    this.chapterCard.classList.add('hidden');
    void this.chapterCard.offsetWidth;
    this.chapterCard.classList.remove('hidden');
    this.afterCard = done;
    this.cardTimer = window.setTimeout(() => this.endCard(), 3800);
  }

  private endCard(): void {
    if (this.cardTimer !== null) { clearTimeout(this.cardTimer); this.cardTimer = null; }
    if (this.chapterCard.classList.contains('hidden')) return;
    this.chapterCard.classList.add('hidden');
    const done = this.afterCard;
    this.afterCard = null;
    done?.();
  }

  private showBriefing(i: number): void {
    const m = MISSIONS[i], s = this.save;
    const replay = s.done.includes(m.id);
    const pts = (n: number) => replay ? Math.round(n * REPLAY_SHARE) : n;
    const grid = { back: 'Back of the grid', pole: 'Pole position', random: 'Random' }[m.grid];
    const field = m.rivals.length ? m.rivals.map((r) => r.name).join(', ') : 'Nobody: just you and the clock';
    this.render(`
      <div class="st-card">
        <div class="st-sub">CHAPTER ${m.chapter + 1} · MISSION ${i + 1}</div>
        <h2>${m.title}</h2>
        <div class="st-sub">${m.track} · ${m.laps} ${m.laps === 1 ? 'LAP' : 'LAPS'}</div>
        <div class="st-row"><span>GOAL</span><span>${describe(m.goal)}</span></div>
        ${m.bonus ? `<div class="st-row"><span>BONUS</span><span>${describe(m.bonus)}</span></div>` : ''}
        <div class="st-row"><span>START</span><span>${grid}${m.startHeat ? ' · engine running hot' : ''}</span></div>
        <div class="st-row"><span>FIELD</span><span style="text-align:right">${field}</span></div>
        <div class="st-row"><span>REWARD</span><span class="st-star">${pts(m.points)} PTS${m.bonus ? ` + ${pts(m.bonusPoints)} BONUS` : ''}${replay ? ' (REPLAY)' : ''}</span></div>
        <div class="st-actions" style="justify-content:flex-start">
          <button class="hr-btn" data-go data-default>RACE</button>
          <button class="hr-btn secondary" data-back>BACK</button>
        </div>
      </div>`);
    this.screen.querySelector('[data-go]')!.addEventListener('click', () => this.begin(i));
    this.screen.querySelector('[data-back]')!.addEventListener('click', () => this.showHub());
  }

  /** After a story race: the matching dialogue, then the result card. */
  finish(r: StoryResult, save: Save): void {
    this.save = save;
    const m = MISSIONS[r.index];
    this.place = r.outcome.place;
    this.dialogue(linesFor(r.success ? m.win : m.lose, r.outcome, this.save.flags ?? []), () => this.showResult(r));
  }

  private showResult(r: StoryResult): void {
    const m = MISSIONS[r.index];
    const mark = (ok: boolean) => ok ? '<span class="st-ok">✓</span>' : '<span class="st-no">✗</span>';
    const goalRow = (label: string, g: Goal, ok: boolean) => `<div class="st-row"><span>${label}</span><span>${describe(g)} ${mark(ok)}</span></div>`;
    const next = MISSIONS[r.index + 1];
    this.render(`
      <div class="st-card">
        <div class="st-sub">${m.title}</div>
        <h2 class="${r.success ? 'st-ok' : 'st-no'}">${r.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</h2>
        <div class="st-sub">${m.track}</div>
        ${goalRow('GOAL', m.goal, r.goal)}
        ${m.bonus ? goalRow('BONUS', m.bonus, r.bonus) : ''}
        <div class="st-row"><span>EARNED</span><span class="st-star">+${r.earned} PTS</span></div>
        <div class="st-row"><span>TEAM POINTS</span><span>${this.save.points}</span></div>
        ${r.success && r.first && m.unlocks ? `<p class="st-note">${m.unlocks}</p>` : ''}
        <div class="st-actions" style="justify-content:flex-start">
          ${r.success && next && r.first ? '<button class="hr-btn" data-next data-default>CONTINUE ▸</button>' : ''}
          ${!r.success ? '<button class="hr-btn" data-retry data-default>RETRY</button>' : ''}
          ${r.success && (!next || !r.first) ? '<button class="hr-btn" data-retry>RACE AGAIN</button>' : ''}
          <button class="hr-btn secondary" data-hub ${r.success && !(next && r.first) ? 'data-default' : ''}>STORY MENU</button>
        </div>
      </div>`);
    this.screen.querySelector('[data-next]')?.addEventListener('click', () => this.showBriefing(r.index + 1));
    // Retry skips the briefing and the intro: straight back onto the grid.
    this.screen.querySelector('[data-retry]')?.addEventListener('click', () => {
      this.screen.classList.add('hidden');
      this.on.preview(r.index);
      this.on.race(r.index);
    });
    this.screen.querySelector('[data-hub]')!.addEventListener('click', () => this.showHub());
  }

  private showGarage(): void {
    const s = this.save;
    const rows = UPGRADES.map((u) => {
      const lvl = s.upgrades[u.id] ?? 0, cost = upgradeCost(lvl), maxed = lvl >= MAX_LEVEL;
      return `<div class="st-up"><b>${u.name} <span class="st-who">LV ${lvl}</span></b>
        <button class="hr-btn" data-buy="${u.id}" ${maxed || s.points < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `${cost} PTS`}</button>
        <small>${u.blurb}</small>
        <div class="st-pips">${Array.from({ length: MAX_LEVEL }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
    }).join('');
    this.render(`
      <div class="st-card" style="max-width:620px">
        <div class="st-head" style="margin-bottom:6px"><div><h2>GARAGE</h2><div class="st-sub" style="margin:0">LEOPARD GP · RED 01</div></div>
          <div class="st-points">${s.points}<small>TEAM POINTS</small></div></div>
        <div class="st-row" style="border:0"><span style="color:${CHARACTERS.sophi.color}">SOPHI</span>
          <span style="font-weight:600;color:#c8d2ff">"Small gains, ${s.name}. That's all a car ever gives you. Pick what you need."</span></div>
        ${rows}
        <div class="st-actions" style="justify-content:flex-start"><button class="hr-btn secondary" data-back>BACK</button></div>
      </div>`);
    this.screen.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.buy as UpgradeId;
      const lvl = s.upgrades[id] ?? 0, cost = upgradeCost(lvl);
      if (lvl >= MAX_LEVEL || s.points < cost) return;
      s.points -= cost;
      s.upgrades[id] = lvl + 1;
      this.on.saved(s);
      this.showGarage();
    }));
    this.screen.querySelector('[data-back]')!.addEventListener('click', () => this.showHub());
  }

  // --- dialogue ---------------------------------------------------------------------------------

  /** Play lines one at a time with a typewriter effect, then call done. */
  dialogue(lines: Line[], done: () => void): void {
    this.lines = lines;
    this.lineAt = 0;
    this.afterTalk = done;
    this.screen.classList.add('hidden');
    this.talk.classList.remove('hidden');
    this.showLine();
  }

  private showLine(): void {
    const line = this.lines[this.lineAt];
    if (!line) { this.endTalk(); return; }
    const c = CHARACTERS[line.who];
    const name = line.who === 'player' ? this.save.name : c.name;
    const box = this.talk.querySelector<HTMLElement>('.st-box')!;
    box.style.setProperty('--c', c.color);
    this.talk.querySelector('.st-speaker')!.textContent = name;
    this.talk.querySelector('.st-role')!.textContent = c.role.toUpperCase();
    this.talk.querySelector('.st-face')!.innerHTML = portrait(line.who, name);
    const full = say(line.text, this.save, this.place);
    const text = this.talk.querySelector('.st-text')!;
    this.typed = 0;
    if (this.typing !== null) clearInterval(this.typing);
    this.typing = window.setInterval(() => {
      this.typed += 2;
      text.textContent = full.slice(0, this.typed);
      if (this.typed >= full.length && this.typing !== null) { clearInterval(this.typing); this.typing = null; }
    }, 22);
  }

  private advance(): void {
    const line = this.lines[this.lineAt];
    if (this.typing !== null && line) {
      // First press finishes the line; the next one moves on.
      clearInterval(this.typing);
      this.typing = null;
      this.talk.querySelector('.st-text')!.textContent = say(line.text, this.save, this.place);
      return;
    }
    this.lineAt++;
    this.showLine();
  }

  private endTalk(): void {
    if (this.typing !== null) { clearInterval(this.typing); this.typing = null; }
    this.talk.classList.add('hidden');
    const done = this.afterTalk;
    this.afterTalk = null;
    done?.();
  }

  private render(html: string): void {
    this.screen.innerHTML = html;
    this.screen.classList.remove('hidden');
  }
}

/**
 * A character's portrait, drawn in code and folded into paper (src/portraits.ts). The old pictures in
 * public/portraits/ are no longer used but kept.
 */
function portrait(who: Speaker, _name: string): string {
  return `<img src="${portraitSrc(who)}" alt="">`;
}
