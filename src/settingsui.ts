// The Settings screen: music and effects volume, graphics quality, fullscreen and key bindings.
// Every change applies at once and is saved; DONE just closes it.

import { ACTIONS, DEFAULT_KEYS, keyLabel, type Action, type Quality, type Settings } from './settings';
import { installDeco } from './deco';

const CSS = `
.st-set { width: min(560px, calc(100% - 32px)); margin: auto; text-align: left; }
.st-set-bg { background: radial-gradient(ellipse at center, rgba(6,22,26,0.94), rgba(4,8,14,0.98)) !important; }
.st-set { padding: 26px 32px 22px !important; }
.st-set .hr-h2 { margin-bottom: 0; font-size: 36px; }
.st-set h2 { text-align: center; }
.st-set h3 { margin: 16px 0 6px; color: #a8743a; font-size: 11px; letter-spacing: 0.24em; font-weight: 700; }
.st-set .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 0; border-top: 1px solid rgba(168,116,58,0.16); }
.st-set .row span { font-weight: 700; letter-spacing: 0.08em; font-size: 14px; }
.st-set input[type=range] { width: 220px; accent-color: #8fd0e0; }
.st-set .key { min-width: 150px; padding: 8px 14px; border-radius: 4px; border: 1px solid rgba(168,116,58,0.5); background: rgba(30,25,21,0.85);
  color: #e9e0cc; font: 800 13px system-ui, sans-serif; letter-spacing: 0.08em; cursor: pointer; }
.st-set .key:hover { border-color: #c98b3e; }
.st-set .key.wait { border-color: #8fd0e0; color: #8fd0e0; }
.st-set .hint { color: #a89d8a; font-size: 12px; margin-top: 8px; }
.st-set .hr-btns { margin-top: 16px; }
`;

export class SettingsUI {
  private el: HTMLDivElement;
  private s!: Settings;
  private changed: (s: Settings) => void = () => {};
  private closed: () => void = () => {};

  /** capture(fn): hand the next key press to fn (so the game doesn't also act on it). */
  constructor(private capture: (fn: ((code: string) => void) | null) => void) {
    installDeco();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay st-set-bg hidden';
    this.el.style.zIndex = '30';
    document.body.append(this.el);
  }

  get isOpen(): boolean { return !this.el.classList.contains('hidden'); }

  open(s: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
    this.s = { ...s, keys: { ...s.keys } };
    this.changed = onChange;
    this.closed = onClose;
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.capture(null);
    this.el.classList.add('hidden');
    this.closed();
  }

  private commit(): void { this.changed({ ...this.s, keys: { ...this.s.keys } }); }

  private render(): void {
    const s = this.s;
    const q = (v: Quality, label: string) => `<button data-q="${v}" class="${s.quality === v ? 'on' : ''}">${label}</button>`;
    const keyText = (a: Action) => s.keys[a].map(keyLabel).join(' / ');
    this.el.innerHTML = `
      <div class="hr-panel st-set deco-panel">
        <h2 class="hr-h2 deco-title">SETTINGS</h2>
        <div class="deco-rule"></div>
        <h3>SOUND</h3>
        <div class="row"><span>MUSIC</span><input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" data-vol="music"></div>
        <div class="row"><span>EFFECTS</span><input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" data-vol="sfx"></div>
        <h3>GRAPHICS</h3>
        <div class="row"><span>QUALITY</span><div class="hr-seg">${q('high', 'HIGH')}${q('medium', 'MEDIUM')}${q('low', 'LOW')}</div></div>
        <div class="row"><span>FULLSCREEN</span><button class="key" data-fs>${document.fullscreenElement ? 'ON' : 'OFF'}</button></div>
        <div class="hint">Lower quality draws fewer pixels and skips shadows and speed effects, for slower computers.</div>
        <h3>CONTROLS</h3>
        ${ACTIONS.map((a) => `<div class="row"><span>${a.label}</span><button class="key" data-key="${a.id}">${keyText(a.id)}</button></div>`).join('')}
        <div class="hint">Click a control, then press the key you want. Left click always brakes and right click always calls the gale.</div>
        <div class="hr-btns row" style="border:0">
          <button class="hr-btn" data-done>DONE</button>
          <button class="hr-btn secondary" data-defaults>RESET CONTROLS</button>
        </div>
      </div>`;

    this.el.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((r) => {
      r.addEventListener('input', () => {
        if (r.dataset.vol === 'music') this.s.music = Number(r.value) / 100;
        else this.s.sfx = Number(r.value) / 100;
        this.commit();
      });
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => {
      b.addEventListener('click', () => { this.s.quality = b.dataset.q as Quality; this.commit(); this.render(); });
    });
    this.el.querySelector<HTMLButtonElement>('[data-fs]')!.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { /* the browser refused */ }
      this.render();
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) => {
      b.addEventListener('click', () => {
        const action = b.dataset.key as Action;
        b.classList.add('wait');
        b.textContent = 'PRESS A KEY…';
        this.capture((code) => {
          if (code !== 'Escape') this.bind(action, code);
          this.render();
        });
      });
    });
    this.el.querySelector('[data-done]')!.addEventListener('click', () => this.close());
    this.el.querySelector('[data-defaults]')!.addEventListener('click', () => {
      this.s.keys = { ...DEFAULT_KEYS };
      this.commit();
      this.render();
    });
  }

  /** Put a key on an action (taking it off any other), keeping the arrow-key default as a second key. */
  private bind(action: Action, code: string): void {
    for (const a of ACTIONS) this.s.keys[a.id] = this.s.keys[a.id].filter((k) => k !== code);
    const arrow = DEFAULT_KEYS[action].find((k) => k.startsWith('Arrow'));
    const keys = [code];
    if (arrow && arrow !== code && !ACTIONS.some((a) => a.id !== action && this.s.keys[a.id].includes(arrow))) keys.push(arrow);
    this.s.keys[action] = keys;
    // An action left with no key at all gets its defaults back.
    for (const a of ACTIONS) if (!this.s.keys[a.id].length) this.s.keys[a.id] = DEFAULT_KEYS[a.id].filter((k) => k !== code);
    this.commit();
  }
}
