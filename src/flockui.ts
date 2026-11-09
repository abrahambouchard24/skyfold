// Flock Raid's screens: the briefing card, the HUD while raiding (time left, the tally of every
// dragon's pen, the sheep in your claws, an arrow to your pen, call-outs), the pause card and the
// results. Plain DOM in the Norse style (timber, iron, bronze, Uncial titles).

const CSS = `
.fl-layer { position: fixed; inset: 0; z-index: 30; pointer-events: none; font-family: 'Alegreya Sans', system-ui, sans-serif; color: #efe6d2; }
.fl-layer.hidden, .fl-card.hidden, .fl-hud.hidden { display: none; }
.fl-card { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: radial-gradient(ellipse at center, rgba(30,20,12,0.7), rgba(8,5,3,0.9)); }
.fl-box { width: min(620px, calc(100% - 32px)); padding: 26px 30px; border: 4px solid #3a3d42; outline: 1px solid #6b6f76; outline-offset: -9px;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 118px, rgba(0,0,0,0.4) 118px 120px), linear-gradient(180deg, #3e2b1d, #2a1d14);
  box-shadow: 0 16px 40px -10px rgba(0,0,0,0.9); }
.fl-box h2 { margin: 0 0 4px; font: 400 clamp(34px, 6vw, 52px) 'Uncial Antiqua', Georgia, serif; color: #e6c08a; text-shadow: 0 2px 0 rgba(0,0,0,0.6); }
.fl-box .sub { color: #c98b3e; letter-spacing: 0.2em; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 14px; }
.fl-box ul { margin: 0 0 18px; padding-left: 18px; line-height: 1.5; font-size: 17px; }
.fl-box li { margin: 4px 0; }
.fl-box li b { color: #8fd0e0; font-weight: 700; }
.fl-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.fl-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 4px; border-top: 1px solid #4a3828; font-size: 18px; }
.fl-row .who { display: flex; gap: 10px; align-items: center; }
.fl-row i { width: 14px; height: 14px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 2px #1c140e; }
.fl-row.me { background: rgba(143,208,224,0.1); }
.fl-row b { font: 400 22px 'Uncial Antiqua', Georgia, serif; color: #e6c08a; }
.fl-hud { position: fixed; inset: 0; pointer-events: none; }
.fl-timer { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); padding: 6px 22px; text-align: center;
  background: rgba(28,20,14,0.85); border: 3px solid #3a3d42; font: 400 34px 'Uncial Antiqua', Georgia, serif; color: #efe6d2; }
.fl-timer small { display: block; font: 700 11px 'Alegreya Sans', system-ui; letter-spacing: 0.24em; color: #c98b3e; }
.fl-timer.low { color: #e8865a; }
.fl-claws { position: absolute; top: 96px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; align-items: center;
  font-weight: 700; letter-spacing: 0.18em; font-size: 12px; color: #c98b3e; }
.fl-claws span { width: 30px; height: 22px; border-radius: 50%; border: 2px dashed rgba(239,230,210,0.35); }
.fl-claws span.full { border: 2px solid #1c140e; background: radial-gradient(circle at 40% 35%, #fffaf0, #e4dccb 60%, #b8ad98); }
.fl-arrow { position: absolute; top: 132px; left: 50%; width: 44px; height: 44px; margin-left: -22px; transition: opacity 200ms; }
.fl-arrow svg { width: 100%; height: 100%; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
.fl-tally { position: absolute; top: 14px; right: 14px; min-width: 200px; padding: 8px 12px; background: rgba(28,20,14,0.85); border: 3px solid #3a3d42; }
.fl-tally .fl-row { font-size: 15px; padding: 4px 2px; border-top-color: #3a2c20; }
.fl-tally .fl-row:first-child { border-top: 0; }
.fl-tally .fl-row b { font-size: 18px; }
.fl-call { position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%); font: 400 clamp(40px, 7vw, 76px) 'Uncial Antiqua', Georgia, serif;
  color: #e6c08a; text-shadow: 0 3px 0 rgba(0,0,0,0.7), 0 0 30px rgba(0,0,0,0.5); opacity: 0; transition: opacity 250ms; white-space: nowrap; }
.fl-call.on { opacity: 1; }
.fl-note { position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%); font: 700 22px 'Alegreya Sans', system-ui; letter-spacing: 0.12em;
  color: #efe6d2; text-shadow: 0 2px 0 rgba(0,0,0,0.8); opacity: 0; transition: opacity 200ms; }
.fl-note.on { opacity: 1; }
.fl-help { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 13px; color: rgba(239,230,210,0.7); white-space: nowrap; }
`;

export interface TallyRow { name: string; color: string; score: number; me: boolean }

export class FlockUI {
  private layer: HTMLDivElement;
  private card: HTMLDivElement;
  private hud: HTMLDivElement;
  private timer: HTMLDivElement;
  private claws: HTMLDivElement;
  private arrow: HTMLDivElement;
  private tally: HTMLDivElement;
  private call: HTMLDivElement;
  private note: HTMLDivElement;
  private noteTimer: number | null = null;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.layer = document.createElement('div');
    this.layer.className = 'fl-layer hidden';
    this.layer.innerHTML = `
      <div class="fl-hud hidden">
        <div class="fl-timer"><small>TIME LEFT</small><span>2:00</span></div>
        <div class="fl-claws"></div>
        <div class="fl-arrow"><svg viewBox="0 0 44 44"><path d="M22 3 L37 34 L22 26 L7 34 Z" fill="#e6c08a" stroke="#1c140e" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
        <div class="fl-tally"></div>
        <div class="fl-call"></div>
        <div class="fl-note"></div>
        <div class="fl-help">A / D: steer · S / Space: slow down (to snatch) · W / Shift: call the gale · Esc: pause</div>
      </div>
      <div class="fl-card hidden"></div>`;
    document.body.append(this.layer);
    const q = (s: string) => this.layer.querySelector(s) as HTMLDivElement;
    this.hud = q('.fl-hud'); this.card = q('.fl-card'); this.timer = q('.fl-timer');
    this.claws = q('.fl-claws'); this.arrow = q('.fl-arrow'); this.tally = q('.fl-tally');
    this.call = q('.fl-call'); this.note = q('.fl-note');
  }

  private showCard(html: string, actions: Record<string, () => void>): void {
    this.layer.classList.remove('hidden');
    this.card.innerHTML = `<div class="fl-box">${html}</div>`;
    this.card.classList.remove('hidden');
    for (const [key, fn] of Object.entries(actions)) {
      this.card.querySelector<HTMLButtonElement>(`[data-${key}]`)?.addEventListener('click', () => fn());
    }
    this.card.querySelector<HTMLButtonElement>('[data-default]')?.focus();
  }

  hideCard(): void { this.card.classList.add('hidden'); }

  /** The briefing: what Flock Raid is and how to play it. */
  intro(onFly: () => void, onBack: () => void): void {
    this.hud.classList.add('hidden');
    this.showCard(`
      <h2>Flock Raid</h2>
      <div class="sub">Two minutes · six dragons · one village green</div>
      <ul>
        <li>Sheep graze on the green. <b>Snatch</b> one by flying low and slow over it: brake as you reach it. Your claws hold two.</li>
        <li>Fly them to <b>your pen</b>, the one under your own banner. The arrow at the top points the way.</li>
        <li>Sheep scatter from a dragon flying close: sweep behind a flock to <b>herd</b> it through any pen's gate, and it counts for that pen.</li>
        <li>A hard bump shakes a carried sheep loose. Carrying slows you down.</li>
        <li>Most sheep penned when the horn sounds wins.</li>
      </ul>
      <div class="fl-actions">
        <button class="hr-btn" data-fly data-default>FLY</button>
        <button class="hr-btn secondary" data-back>BACK</button>
      </div>`, { fly: onFly, back: onBack });
  }

  pause(onResume: () => void, onLeave: () => void): void {
    this.showCard(`<h2>Paused</h2><div class="sub">The sheep will wait</div>
      <div class="fl-actions"><button class="hr-btn" data-resume data-default>RESUME</button><button class="hr-btn secondary" data-leave>LEAVE THE GREEN</button></div>`,
    { resume: onResume, leave: onLeave });
  }

  results(rows: TallyRow[], onAgain: () => void, onMenu: () => void): void {
    const me = rows.findIndex((r) => r.me);
    const top = rows[0].score, shared = rows.filter((r) => r.score === top).length > 1;
    const title = me === 0 || rows[me].score === top ? (shared ? 'A shared win' : 'The flock is yours') : `${ordinal(me + 1)} place`;
    const table = rows.map((r, i) => `<div class="fl-row ${r.me ? 'me' : ''}"><span class="who">${ordinal(i + 1)} <i style="background:${r.color}"></i> ${r.name}</span><b>${r.score}</b></div>`).join('');
    this.hud.classList.add('hidden');
    this.showCard(`<h2>${title}</h2><div class="sub">Sheep penned</div>${table}
      <div class="fl-actions" style="margin-top:18px"><button class="hr-btn" data-again data-default>RAID AGAIN</button><button class="hr-btn secondary" data-menu>MAIN MENU</button></div>`,
    { again: onAgain, menu: onMenu });
  }

  /** Update the HUD: time left (s), the tally, the sheep in your claws, the pen arrow's angle. */
  update(left: number, rows: TallyRow[], carrying: number, penAngle: number, call: string | null): void {
    this.layer.classList.remove('hidden');
    this.hud.classList.remove('hidden');
    const s = Math.ceil(left);
    this.timer.querySelector('span')!.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('low', left < 15);
    this.claws.innerHTML = `CLAWS <span class="${carrying > 0 ? 'full' : ''}"></span><span class="${carrying > 1 ? 'full' : ''}"></span>`;
    this.arrow.style.transform = `rotate(${penAngle}rad)`;
    this.arrow.style.opacity = carrying > 0 ? '1' : '0.45';
    this.tally.innerHTML = [...rows].sort((a, b) => b.score - a.score)
      .map((r) => `<div class="fl-row ${r.me ? 'me' : ''}"><span class="who"><i style="background:${r.color}"></i> ${r.name}</span><b>${r.score}</b></div>`).join('');
    this.call.textContent = call ?? '';
    this.call.classList.toggle('on', !!call);
  }

  /** A short call-out at the bottom of the screen (SNATCHED!, +2 PENNED...). */
  flash(text: string): void {
    this.note.textContent = text;
    this.note.classList.add('on');
    if (this.noteTimer !== null) clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => this.note.classList.remove('on'), 1100);
  }

  hide(): void {
    this.layer.classList.add('hidden');
    this.card.classList.add('hidden');
    this.hud.classList.add('hidden');
  }
}

function ordinal(n: number): string {
  const t = n % 100, u = n % 10;
  return `${n}${t >= 11 && t <= 13 ? 'TH' : u === 1 ? 'ST' : u === 2 ? 'ND' : u === 3 ? 'RD' : 'TH'}`;
}
