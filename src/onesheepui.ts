// One Sheep's screens: the briefing (with the realm to race), the HUD (lap, points, who has the
// sheep, an arrow to it, a tail meter while someone's on the carrier's tail, call-outs), the pause
// card and the results. Plain DOM in the Norse style (timber, iron, bronze, Uncial titles).

const CSS = `
.os-layer { position: fixed; inset: 0; z-index: 30; pointer-events: none; font-family: 'Alegreya Sans', system-ui, sans-serif; color: #efe6d2; }
.os-layer.hidden, .os-card.hidden, .os-hud.hidden { display: none; }
.os-card { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: radial-gradient(ellipse at center, rgba(30,20,12,0.7), rgba(8,5,3,0.9)); }
.os-box { width: min(620px, calc(100% - 32px)); padding: 26px 30px; border: 4px solid #3a3d42; outline: 1px solid #6b6f76; outline-offset: -9px;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 118px, rgba(0,0,0,0.4) 118px 120px), linear-gradient(180deg, #3e2b1d, #2a1d14);
  box-shadow: 0 16px 40px -10px rgba(0,0,0,0.9); }
.os-box h2 { margin: 0 0 4px; font: 400 clamp(34px, 6vw, 52px) 'Uncial Antiqua', Georgia, serif; color: #e6c08a; text-shadow: 0 2px 0 rgba(0,0,0,0.6); }
.os-box .sub { color: #c98b3e; letter-spacing: 0.2em; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 14px; }
.os-box ul { margin: 0 0 16px; padding-left: 18px; line-height: 1.5; font-size: 17px; }
.os-box li { margin: 4px 0; }
.os-box li b { color: #8fd0e0; font-weight: 700; }
.os-realm { display: flex; align-items: center; gap: 12px; margin: 0 0 18px; }
.os-realm b { flex: 1; text-align: center; font: 400 26px 'Uncial Antiqua', Georgia, serif; color: #efe6d2; }
.os-realm button { min-width: 48px; }
.os-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.os-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 4px; border-top: 1px solid #4a3828; font-size: 18px; }
.os-row .who { display: flex; gap: 10px; align-items: center; }
.os-row i { width: 14px; height: 14px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 2px #1c140e; }
.os-row.me { background: rgba(143,208,224,0.1); }
.os-row.has b::before { content: '◆ '; color: #f4ecd8; font-size: 13px; vertical-align: middle; }
.os-row b { font: 400 22px 'Uncial Antiqua', Georgia, serif; color: #e6c08a; }
.os-hud { position: fixed; inset: 0; pointer-events: none; }
.os-lap { position: absolute; top: 14px; left: 14px; padding: 6px 18px; background: rgba(28,20,14,0.85); border: 3px solid #3a3d42;
  font: 400 30px 'Uncial Antiqua', Georgia, serif; }
.os-lap small { display: block; font: 700 11px 'Alegreya Sans', system-ui; letter-spacing: 0.24em; color: #c98b3e; }
.os-status { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 20px; text-align: center;
  background: rgba(28,20,14,0.85); border: 3px solid #3a3d42; font-weight: 700; letter-spacing: 0.14em; font-size: 15px; white-space: nowrap; }
.os-status.mine { border-color: #c98b3e; color: #f4ecd8; box-shadow: 0 0 18px -4px rgba(230,192,138,0.7); }
.os-tailbar { position: absolute; top: 62px; left: 50%; width: 200px; height: 8px; margin-left: -100px; background: rgba(28,20,14,0.85); border: 2px solid #3a3d42; }
.os-tailbar i { display: block; height: 100%; width: 0; background: #e8865a; }
.os-tailbar.hidden { display: none; }
.os-arrow { position: absolute; top: 80px; left: 50%; width: 44px; height: 44px; margin-left: -22px; }
.os-arrow svg { width: 100%; height: 100%; filter: drop-shadow(0 0 5px rgba(244,236,216,0.7)); }
.os-arrow.hidden { display: none; }
.os-tally { position: absolute; top: 14px; right: 14px; min-width: 200px; padding: 8px 12px; background: rgba(28,20,14,0.85); border: 3px solid #3a3d42; }
.os-tally .os-row { font-size: 15px; padding: 4px 2px; border-top-color: #3a2c20; }
.os-tally .os-row:first-child { border-top: 0; }
.os-tally .os-row b { font-size: 18px; }
.os-call { position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%); font: 400 clamp(40px, 7vw, 76px) 'Uncial Antiqua', Georgia, serif;
  color: #e6c08a; text-shadow: 0 3px 0 rgba(0,0,0,0.7); opacity: 0; transition: opacity 250ms; white-space: nowrap; }
.os-call.on { opacity: 1; }
.os-note { position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%); font: 700 22px 'Alegreya Sans', system-ui; letter-spacing: 0.12em;
  color: #efe6d2; text-shadow: 0 2px 0 rgba(0,0,0,0.8); opacity: 0; transition: opacity 200ms; white-space: nowrap; }
.os-note.on { opacity: 1; }
.os-help { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 13px; color: rgba(239,230,210,0.7); white-space: nowrap; }
`;

export interface OneSheepRow { name: string; color: string; points: number; me: boolean; has: boolean }

export class OneSheepUI {
  private layer: HTMLDivElement;
  private card: HTMLDivElement;
  private hud: HTMLDivElement;
  private noteTimer: number | null = null;
  private q = (s: string) => this.layer.querySelector(s) as HTMLDivElement;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.layer = document.createElement('div');
    this.layer.className = 'os-layer hidden';
    this.layer.innerHTML = `
      <div class="os-hud hidden">
        <div class="os-lap"><small>LAP</small><span>1 / 4</span></div>
        <div class="os-status"></div>
        <div class="os-tailbar hidden"><i></i></div>
        <div class="os-arrow hidden"><svg viewBox="0 0 44 44"><path d="M22 3 L37 34 L22 26 L7 34 Z" fill="#f4ecd8" stroke="#1c140e" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
        <div class="os-tally"></div>
        <div class="os-call"></div>
        <div class="os-note"></div>
        <div class="os-help">A / D: steer · S / Space: slow down (to snatch) · W / Shift: call the gale · Esc: pause</div>
      </div>
      <div class="os-card hidden"></div>`;
    document.body.append(this.layer);
    this.card = this.q('.os-card');
    this.hud = this.q('.os-hud');
  }

  private showCard(html: string, actions: Record<string, () => void>): void {
    this.layer.classList.remove('hidden');
    this.card.innerHTML = `<div class="os-box">${html}</div>`;
    this.card.classList.remove('hidden');
    for (const [key, fn] of Object.entries(actions)) this.card.querySelector<HTMLButtonElement>(`[data-${key}]`)?.addEventListener('click', () => fn());
    this.card.querySelector<HTMLButtonElement>('[data-default]')?.focus();
  }

  hideCard(): void { this.card.classList.add('hidden'); }

  /** The briefing, with the realm to race (◂ ▸ to change it). */
  intro(realms: string[], start: number, laps: number, onFly: (realm: number) => void, onBack: () => void): void {
    this.hud.classList.add('hidden');
    let realm = start;
    const render = () => {
      this.showCard(`
        <h2>One Sheep</h2>
        <div class="sub">${laps} laps · six dragons · a single sheep</div>
        <ul>
          <li>One sheep grazes on the road. <b>Snatch</b> it by flying over it slowly: brake hard as you reach it.</li>
          <li>Carry it to <b>score</b>: a point for every stretch of the lap you cover with it in your claws.</li>
          <li>It slows you down. Dragons <b>tailing</b> you closely, or a hard <b>bump</b> or wall hit, make you drop it on the road.</li>
          <li>At racing speed nobody can grab a dropped sheep, so it's usually taken the next time round, by whoever slows for it.</li>
          <li>Most points when the first dragon finishes wins.</li>
        </ul>
        <div class="os-realm"><button class="hr-btn secondary" data-prev>◂</button><b>${realms[realm]}</b><button class="hr-btn secondary" data-next>▸</button></div>
        <div class="os-actions"><button class="hr-btn" data-fly data-default>FLY</button><button class="hr-btn secondary" data-back>BACK</button></div>`,
      {
        prev: () => { realm = (realm + realms.length - 1) % realms.length; render(); },
        next: () => { realm = (realm + 1) % realms.length; render(); },
        fly: () => onFly(realm), back: onBack,
      });
    };
    render();
  }

  pause(onResume: () => void, onLeave: () => void): void {
    this.showCard(`<h2>Paused</h2><div class="sub">The sheep will wait</div>
      <div class="os-actions"><button class="hr-btn" data-resume data-default>RESUME</button><button class="hr-btn secondary" data-leave>LEAVE</button></div>`,
    { resume: onResume, leave: onLeave });
  }

  results(rows: OneSheepRow[], onAgain: () => void, onMenu: () => void): void {
    const me = rows.findIndex((r) => r.me);
    const title = me === 0 ? 'The sheep is yours' : `${ordinal(me + 1)} place`;
    const table = rows.map((r, i) => `<div class="os-row ${r.me ? 'me' : ''}"><span class="who">${ordinal(i + 1)} <i style="background:${r.color}"></i> ${r.name}</span><b>${r.points}</b></div>`).join('');
    this.hud.classList.add('hidden');
    this.showCard(`<h2>${title}</h2><div class="sub">Points carried</div>${table}
      <div class="os-actions" style="margin-top:18px"><button class="hr-btn" data-again data-default>RACE AGAIN</button><button class="hr-btn secondary" data-menu>MAIN MENU</button></div>`,
    { again: onAgain, menu: onMenu });
  }

  /**
   * The HUD: lap, the tally, who has the sheep (`status`, `mine` when it's you), the arrow to the
   * sheep (null to hide it), the tail meter (0..1, null to hide), and a big call-out.
   */
  update(lap: number, laps: number, rows: OneSheepRow[], status: string, mine: boolean, arrow: number | null, tail: number | null, call: string | null): void {
    this.layer.classList.remove('hidden');
    this.hud.classList.remove('hidden');
    this.q('.os-lap span').textContent = `${Math.min(lap, laps)} / ${laps}`;
    const st = this.q('.os-status');
    st.textContent = status;
    st.classList.toggle('mine', mine);
    const ar = this.q('.os-arrow');
    ar.classList.toggle('hidden', arrow === null);
    if (arrow !== null) ar.style.transform = `rotate(${arrow}rad)`;
    const tb = this.q('.os-tailbar');
    tb.classList.toggle('hidden', tail === null);
    if (tail !== null) (tb.firstElementChild as HTMLElement).style.width = `${Math.round(tail * 100)}%`;
    this.q('.os-tally').innerHTML = [...rows].sort((a, b) => b.points - a.points)
      .map((r) => `<div class="os-row ${r.me ? 'me' : ''} ${r.has ? 'has' : ''}"><span class="who"><i style="background:${r.color}"></i> ${r.name}</span><b>${r.points}</b></div>`).join('');
    const c = this.q('.os-call');
    c.textContent = call ?? '';
    c.classList.toggle('on', !!call);
  }

  flash(text: string): void {
    const n = this.q('.os-note');
    n.textContent = text;
    n.classList.add('on');
    if (this.noteTimer !== null) clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => n.classList.remove('on'), 1200);
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
