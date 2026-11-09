// The TRAIN DRAGON screen: four trade-off sliders, presets, and stat bars that move as you tune.

import { installDeco } from './deco';
import { PRESETS, SLIDERS, STEPS, Setup, setupMods, statBars } from './setup';

const CSS = `
.tn-card { width: min(900px, calc(100% - 32px)); margin: auto; padding: 26px 28px; text-align: left; }
.tn-card h2 { margin: 0 0 4px; font-size: 32px; }
.tn-sub { color: #a8743a; font-weight: 700; letter-spacing: 0.22em; font-size: 11px; margin-bottom: 18px; }
.tn-cols { display: grid; grid-template-columns: 0.9fr 1.3fr; gap: 26px; }
@media (max-width: 760px) { .tn-cols { grid-template-columns: 1fr; } }
.tn-car { display: block; height: 150px; margin: 0 auto 14px; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.5)); }
.tn-stat { display: grid; grid-template-columns: 110px 1fr 56px; gap: 8px; align-items: center; margin-bottom: 7px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: #a89d8a; }
.tn-bar { height: 6px; border-radius: 1px; background: rgba(168,116,58,0.12); position: relative; overflow: hidden; }
.tn-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #4f8ea0, #8fd0e0); transition: width 120ms; }
.tn-bar::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: #a8743a; }
.tn-delta { text-align: right; font-variant-numeric: tabular-nums; }
.tn-up { color: #8fd0e0; } .tn-down { color: #e0907a; }
.tn-slider { margin-bottom: 16px; }
.tn-slider b { display: block; font-size: 12px; letter-spacing: 0.2em; margin-bottom: 6px; color: #e9e0cc; }
.tn-ends { display: flex; justify-content: space-between; color: #a89d8a; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; margin-top: 4px; }
.tn-slider input { width: 100%; accent-color: #a8743a; cursor: pointer; }
.tn-presets { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 18px; }
.tn-presets button { padding: 7px 12px; border-radius: 3px; border: 1px solid rgba(168,116,58,0.4); background: rgba(18,15,13,0.85); color: #e9e0cc;
  font: 700 11px system-ui, sans-serif; letter-spacing: 0.14em; cursor: pointer; }
.tn-presets button:hover { border-color: #c98b3e; }
.tn-presets button.on { border-color: #c98b3e; color: #140f0b; background: linear-gradient(180deg, #e3b26c, #a8743a); }
.tn-tip { color: #a89d8a; font-size: 12px; line-height: 1.4; margin-top: 4px; }
`;

export class TuneUI {
  private el: HTMLDivElement;
  private setup!: Setup;
  private carUrl = '';
  private changed: (s: Setup) => void = () => {};
  private closed: () => void = () => {};

  constructor() {
    installDeco();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay hidden';
    this.el.style.zIndex = '15';   // above the screen it was opened from
    document.body.append(this.el);
  }

  get visible(): boolean { return !this.el.classList.contains('hidden'); }

  /** Open with the current setup; onChange fires on every tweak, onClose when DONE is pressed. */
  open(setup: Setup, carUrl: string, onChange: (s: Setup) => void, onClose: () => void): void {
    this.setup = { ...setup };
    this.carUrl = carUrl;
    this.changed = onChange;
    this.closed = onClose;
    this.render();
    this.el.classList.remove('hidden');
  }

  private render(): void {
    const sliders = SLIDERS.map((sl) => `<div class="tn-slider"><b>${sl.name}</b>
      <input type="range" min="${-STEPS}" max="${STEPS}" step="1" value="${this.setup[sl.id]}" data-slider="${sl.id}">
      <div class="tn-ends"><span>◂ ${sl.low}</span><span>${sl.high} ▸</span></div></div>`).join('');
    const presets = PRESETS.map((p, i) => `<button data-preset="${i}">${p.name}</button>`).join('');
    this.el.innerHTML = `
      <div class="tn-card deco-panel">
        <h2 class="deco-title">TRAIN DRAGON</h2>
        <div class="tn-sub">EVERY GAIN COSTS SOMETHING · THE MIDDLE IS THE STANDARD CAR</div>
        <div class="tn-cols">
          <div><img class="tn-car" src="${this.carUrl}" alt=""><div data-stats></div>
            <div class="tn-tip">Fast, flowing realms reward long wingbeats and swept wings. Twisty ones reward a wide span that holds the arc. Cold frost blood helps if you hit walls. Sharp banking snaps through hairpins; gentle banking stays calm flat out.</div></div>
          <div><div class="tn-sub" style="margin-bottom:6px">PRESETS</div><div class="tn-presets">${presets}</div>${sliders}
            <div class="hr-btns row" style="justify-content:flex-start;margin-top:8px">
              <button class="hr-btn" data-done>DONE</button><button class="hr-btn secondary" data-reset>RESET</button></div></div>
        </div>
      </div>`;
    // Dragging a slider only updates the numbers around it, so the drag isn't interrupted.
    this.el.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((inp) => inp.addEventListener('input', () => {
      this.setup = { ...this.setup, [inp.dataset.slider!]: Number(inp.value) };
      this.changed(this.setup);
      this.refresh();
    }));
    // Presets and RESET move the sliders (assist is kept in the setup only so old saves still parse).
    const apply = (s: Setup) => {
      this.setup = { ...s, assist: this.setup.assist };
      this.el.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((inp) => { inp.value = String(this.setup[inp.dataset.slider as keyof Setup]); });
      this.changed(this.setup);
      this.refresh();
    };
    this.el.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.addEventListener('click', () => apply(PRESETS[Number(b.dataset.preset)].setup)));
    this.el.querySelector('[data-reset]')!.addEventListener('click', () => apply(PRESETS[0].setup));
    this.el.querySelector('[data-done]')!.addEventListener('click', () => {
      this.el.classList.add('hidden');
      this.closed();
    });
    // Arrow keys on the sliders shouldn't drive the menus behind.
    this.el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    this.refresh();
  }

  /** The stat bars and which preset (if any) the setup matches. */
  private refresh(): void {
    const stats = statBars(setupMods(this.setup)).map((b) => {
      const pct = Math.round(b.delta * 1000) / 10;
      const cls = pct > 0 ? 'tn-up' : pct < 0 ? 'tn-down' : '';
      return `<div class="tn-stat"><span>${b.name}</span><div class="tn-bar"><i style="width:${(b.value * 100).toFixed(1)}%"></i></div>
        <span class="tn-delta ${cls}">${pct > 0 ? '+' : ''}${pct ? pct + '%' : '—'}</span></div>`;
    }).join('');
    this.el.querySelector('[data-stats]')!.innerHTML = stats;
    const same = (a: Setup) => SLIDERS.every((sl) => a[sl.id] === this.setup[sl.id]);
    this.el.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.classList.toggle('on', same(PRESETS[Number(b.dataset.preset)].setup)));
  }
}
