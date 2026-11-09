// The Garage: equip skins earned from achievements, see every achievement and your online record.
// Also the "achievement unlocked" pop-up shown during play.

import { ACHIEVEMENTS, Achievement, Progress, SKINS, progressOf, skinUnlocked } from './achievements';
import { installDeco } from './deco';

const CSS = `
.gr-card { width: min(980px, calc(100% - 32px)); margin: auto; padding: 26px 30px; text-align: left; }
.gr-card h2 { margin: 0; font-size: 36px; }
.gr-sub { margin: 16px 0 8px; }
.gr-skins { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
.gr-skin { padding: 10px; border-radius: 4px; border: 1px solid rgba(168,116,58,0.3); background: rgba(30,25,21,0.8); color: #e9e0cc; cursor: pointer;
  font: inherit; text-align: left; transition: transform 120ms, border-color 120ms; }
.gr-skin.on { border-color: #c98b3e; box-shadow: 0 0 0 1px #c98b3e inset, 0 0 22px -6px #c98b3e; }
.gr-skin { cursor: default; }
.gr-skin.locked { opacity: 0.85; }
.gr-sw { display: flex; height: 26px; border-radius: 2px; overflow: hidden; margin-bottom: 8px; box-shadow: 0 0 0 1px rgba(168,116,58,0.35); }
.gr-sw i { flex: 1; }
.gr-pic { display: block; width: 100%; aspect-ratio: 3 / 2; object-fit: contain; margin: -4px 0 4px; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.5)); }
.gr-skin.locked .gr-pic { filter: saturate(0.85) brightness(0.8) drop-shadow(0 6px 8px rgba(0,0,0,0.5)); }
.gr-skin b { display: block; font-size: 12px; letter-spacing: 0.08em; }
.gr-skin small { display: block; color: #a89d8a; font-size: 11px; margin-top: 3px; line-height: 1.3; }
.gr-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
.gr-a { display: flex; gap: 10px; align-items: center; padding: 9px 11px; border-radius: 4px; background: rgba(30,25,21,0.8); border: 1px solid rgba(168,116,58,0.2); }
.gr-a .ic { width: 22px; height: 22px; margin: 2px; transform: rotate(45deg); display: grid; place-items: center; font-weight: 900; border: 1px solid rgba(168,116,58,0.4); color: #5a7470; flex: none; }
.gr-a .ic span { transform: rotate(-45deg); }
.gr-a.got .ic { background: linear-gradient(180deg, #e3b26c, #b8892e); color: #140f0b; border-color: #e3b26c; }
.gr-a b { display: block; font-size: 12px; letter-spacing: 0.08em; }
.gr-a small { color: #a89d8a; font-size: 11px; }
.gr-a .bar { height: 2px; background: rgba(168,116,58,0.2); margin-top: 5px; }
.gr-a .bar i { display: block; height: 100%; background: #8fd0e0; box-shadow: 0 0 8px #8fd0e0; }
.gr-rec { display: flex; gap: 22px; flex-wrap: wrap; }
.gr-rec div b { display: block; font: 700 28px 'Cinzel', Georgia, serif; color: #f1e6d0; }
.gr-rec div small { color: #a8743a; font-weight: 700; letter-spacing: 0.14em; font-size: 11px; }
.gr-pop { position: fixed; right: 22px; top: 22px; z-index: 40; width: 300px; padding: 12px 16px; border-radius: 4px;
  background: linear-gradient(160deg, rgba(40,32,26,0.97), rgba(18,15,13,0.98)); border: 1px solid #a8743a;
  box-shadow: inset 0 0 0 4px rgba(18,15,13,0.9), inset 0 0 0 5px rgba(168,116,58,0.25), 0 10px 40px -10px rgba(201,139,62,0.55); font-family: system-ui, sans-serif; color: #e9e0cc;
  pointer-events: none; transition: opacity 400ms, transform 400ms; }
.gr-pop.out { opacity: 0; transform: translateY(-12px); }
.gr-pop small { display: block; color: #a8743a; font-weight: 700; letter-spacing: 0.24em; font-size: 10px; }
.gr-pop b { display: block; font: 700 18px 'Cinzel', Georgia, serif; letter-spacing: 0.1em; margin: 3px 0; color: #f1e6d0; }
.gr-pop span { color: #a89d8a; font-size: 13px; }
`;

export class GarageUI {
  private el: HTMLDivElement;

  constructor() {
    installDeco();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay hidden';
    this.el.style.zIndex = '30';
    this.el.style.background = 'radial-gradient(ellipse at center, rgba(6,22,26,0.94), rgba(4,8,14,0.98))';
    document.body.append(this.el);
  }

  get isOpen(): boolean { return !this.el.classList.contains('hidden'); }

  /**
   * The collection: every skin and how to earn it (they're picked on the car selection screens).
   * pictures: each skin's 3D picture by skin id (colour swatches are shown where there isn't one).
   */
  open(p: Progress, onClose: () => void, pictures: Record<string, string> = {}): void {
    const render = () => {
      const skins = SKINS.filter((s) => s.colors).map((s) => {
        const owned = skinUnlocked(p, s.id);
        const how = ACHIEVEMENTS.find((a) => a.skin === s.id);
        const sw = s.colors ? [s.colors.body, s.colors.trim, s.colors.accent, s.colors.glow] : ['#ff3d6e', '#3ff0ff', '#2fd16b', '#ff8a1f'];
        return `<div class="gr-skin ${p.equipped === s.id ? 'on' : ''} ${owned ? '' : 'locked'}">
          ${pictures[s.id] ? `<img class="gr-pic" src="${pictures[s.id]}" alt="">` : `<div class="gr-sw">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`}
          <b>${s.name}</b><small>${owned ? (p.equipped === s.id ? 'WEARING' : 'UNLOCKED') : `🔒 ${how ? how.name : ''}`}</small></div>`;
      }).join('');
      const got = ACHIEVEMENTS.filter((a) => p.unlocked.includes(a.id)).length;
      const achs = ACHIEVEMENTS.map((a) => {
        const done = p.unlocked.includes(a.id);
        const prog = a.goal && !done ? `<div class="bar"><i style="width:${Math.min(100, (progressOf(p, a) / a.goal) * 100)}%"></i></div>` : '';
        return `<div class="gr-a ${done ? 'got' : ''}"><div class="ic"><span>${done ? '✓' : ''}</span></div>
          <div style="flex:1"><b>${a.name}</b><small>${a.desc}${a.goal && !done ? ` (${progressOf(p, a)} / ${a.goal})` : ''}</small>${prog}</div></div>`;
      }).join('');
      const o = p.online;
      this.el.innerHTML = `
        <div class="gr-card deco-panel">
          <h2 class="deco-title">GARAGE</h2>
          <div class="deco-rule"></div>
          <div class="gr-sub deco-label">SKIN COLLECTION · EARN THEM WITH ACHIEVEMENTS, PICK THEM WITH YOUR CAR</div>
          <div class="gr-skins">${skins}</div>
          <div class="gr-sub deco-label">ACHIEVEMENTS · ${got} / ${ACHIEVEMENTS.length}</div>
          <div class="gr-ach">${achs}</div>
          <div class="gr-sub deco-label">YOUR ONLINE RECORD</div>
          <div class="gr-rec">
            <div><b>${o.races}</b><small>RACES</small></div><div><b>${o.wins}</b><small>WINS</small></div>
            <div><b>${o.podiums}</b><small>PODIUMS</small></div><div><b>${o.best ? ordinal(o.best) : '-'}</b><small>BEST FINISH</small></div>
          </div>
          <div class="hr-btns row" style="margin-top:20px"><button class="hr-btn" data-done>DONE</button></div>
        </div>`;
      this.el.querySelector('[data-done]')!.addEventListener('click', () => { this.el.classList.add('hidden'); onClose(); });
    };
    render();
    this.el.classList.remove('hidden');
  }

  close(): void { this.el.classList.add('hidden'); }

  /** A pop-up in the corner: achievement unlocked, and the skin it gives. */
  notify(a: Achievement): void {
    const skin = SKINS.find((s) => s.id === a.skin);
    const pop = document.createElement('div');
    pop.className = 'gr-pop out';
    pop.innerHTML = `<small>ACHIEVEMENT UNLOCKED</small><b>${a.name}</b><span>${a.desc}${skin ? ` · new skin: <b style="display:inline;font-size:13px;color:${skin.colors?.body ?? '#fff'}">${skin.name}</b>` : ''}</span>`;
    // Stack under any pop-ups already showing.
    const showing = document.querySelectorAll('.gr-pop').length;
    pop.style.top = `${22 + showing * 96}px`;
    document.body.append(pop);
    setTimeout(() => pop.classList.remove('out'), 20);
    setTimeout(() => { pop.classList.add('out'); setTimeout(() => pop.remove(), 450); }, 4500);
  }
}

function ordinal(n: number): string { return ['1ST', '2ND', '3RD'][n - 1] ?? `${n}TH`; }
