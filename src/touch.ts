// Touch controls for phones and tablets: steer left / right under the left thumb, brake and
// boost under the right, and a pause button. They press the same controls as the keys
// (Input.setTouch), so steering eases in exactly as it does on a keyboard.

import type { Input, TouchControl } from './input';

const CSS = `
.tc { position: fixed; inset: 0; z-index: 12; pointer-events: none; user-select: none; -webkit-user-select: none; touch-action: none; }
.tc.hidden { display: none; }
.tc button { position: absolute; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent;
  border-radius: 50%; border: 1px solid rgba(168,116,58,0.7); background: rgba(18,15,13,0.42);
  box-shadow: inset 0 0 0 4px rgba(18,15,13,0.35), inset 0 0 0 5px rgba(168,116,58,0.25);
  color: #e9e0cc; font: 800 12px system-ui, sans-serif; letter-spacing: 0.14em; display: grid; place-items: center; padding: 0; }
.tc button.on { background: rgba(143,208,224,0.32); border-color: #8fd0e0; color: #fff; }
.tc button svg { width: 42%; height: 42%; fill: currentColor; }
.tc .left  { left: max(18px, env(safe-area-inset-left)); bottom: 22px; width: 92px; height: 92px; }
.tc .right { left: calc(max(18px, env(safe-area-inset-left)) + 106px); bottom: 22px; width: 92px; height: 92px; }
.tc .brake { right: calc(max(16px, env(safe-area-inset-right)) + 186px); bottom: 22px; width: 96px; height: 96px; }
.tc .boost { right: calc(max(16px, env(safe-area-inset-right)) + 186px); bottom: 132px; width: 76px; height: 76px; color: #c98b3e; }
.tc .boost.on { color: #fff; }
.tc .pause { left: 50%; top: 10px; transform: translateX(-50%); width: 44px; height: 44px; border-radius: 4px; }
@media (max-height: 420px) {
  .tc .left, .tc .right { width: 78px; height: 78px; bottom: 14px; }
  .tc .right { left: calc(max(14px, env(safe-area-inset-left)) + 90px); }
  .tc .brake { width: 82px; height: 82px; bottom: 14px; }
  .tc .boost { width: 64px; height: 64px; bottom: 108px; }
}
`;

const ARROW = (dir: 1 | -1) => `<svg viewBox="0 0 10 10"><path d="${dir < 0 ? 'M7 1 L2 5 L7 9 Z' : 'M3 1 L8 5 L3 9 Z'}"/></svg>`;

export class TouchControls {
  /** Whether this device has a touch screen (the controls only ever show on one). */
  readonly available = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  /** Set once the player has actually touched the screen, so a touch laptop played with keys stays clean. */
  private touched = false;
  private el: HTMLDivElement;
  private shown = false;
  get visible(): boolean { return this.shown; }

  constructor(private input: Input) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'tc hidden';
    this.el.innerHTML = `
      <button class="left" data-c="left" aria-label="Steer left">${ARROW(-1)}</button>
      <button class="right" data-c="right" aria-label="Steer right">${ARROW(1)}</button>
      <button class="boost" data-c="boost">GALE</button>
      <button class="brake" data-c="brake">BRAKE</button>
      <button class="pause" data-pause aria-label="Pause"><svg viewBox="0 0 10 10"><path d="M2 1h2v8H2zM6 1h2v8H6z"/></svg></button>`;
    document.body.append(this.el);
    addEventListener('touchstart', () => { this.touched = true; }, { passive: true, capture: true });

    this.el.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => {
      const c = b.dataset.c as TouchControl;
      const down = (e: PointerEvent) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ }
        b.classList.add('on');
        input.setTouch(c, true);
      };
      const up = () => { b.classList.remove('on'); input.setTouch(c, false); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    this.el.querySelector('[data-pause]')!.addEventListener('pointerdown', (e: Event) => {
      e.preventDefault();
      input.queuePause();
    });
  }

  /** Show the controls while racing on a touch screen; hide (and let go of everything) otherwise. */
  show(racing: boolean): void {
    const want = racing && this.available && this.touched;
    if (want === this.shown) return;
    this.shown = want;
    this.el.classList.toggle('hidden', !want);
    if (!want) {
      this.el.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
      for (const c of ['left', 'right', 'brake', 'boost'] as const) this.input.setTouch(c, false);
    }
  }
}
