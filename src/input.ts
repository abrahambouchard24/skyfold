// Mouse + keyboard. The mouse drives a virtual cursor so steering keeps working under pointer lock.

import { DEFAULT_KEYS, type Action } from './settings';

const THROTTLE_KEYS = new Set<string>();   // the throttle is always on
// The driving keys come from Settings (rebindable). Mouse buttons count as held keys too:
// left click brakes, right click deploys ERS.
const BRAKE_KEYS = new Set<string>();
const LEFT_KEYS = new Set<string>();
const RIGHT_KEYS = new Set<string>();
const DEPLOY_KEYS = new Set<string>();

/** How long R must be held to restart, so a stray tap doesn't wipe a race. */
export const RESTART_HOLD = 0.8;

/** The on-screen touch buttons (src/touch.ts). */
export type TouchControl = 'left' | 'right' | 'brake' | 'boost';

export class Input {
  /** Virtual cursor in canvas CSS pixels. */
  cursor = { x: 0, y: 0 };
  throttle = false;
  brake = false;
  /** Holding the ERS deploy key. */
  deploy = false;
  /** Steering keys: -1 left, +1 right, 0 none (or both). */
  steer = 0;
  locked = false;
  private resetSince = 0;       // performance.now() R went down (0 = not held)
  private resetFired = false;
  /** While set, the next key press is handed to it instead of driving (rebinding a control). */
  capture: ((code: string) => void) | null = null;
  private pauseQueued = false;
  private muteQueued = false;
  private viewQueued = false;
  /** Called when pointer lock is lost (e.g. the browser's own Esc handling). */
  onUnlock: (() => void) | null = null;
  private held = new Set<string>();
  private touch = new Set<TouchControl>();

  constructor(private canvas: HTMLCanvasElement) {
    this.setBindings(DEFAULT_KEYS);
    this.cursor.x = innerWidth / 2;
    this.cursor.y = innerHeight / 2 - 150;

    canvas.addEventListener('click', () => {
      if (!this.locked) this.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) this.onUnlock?.();
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.cursor.x = clampTo(this.cursor.x + e.movementX, 0, innerWidth);
        this.cursor.y = clampTo(this.cursor.y + e.movementY, 0, innerHeight);
      } else {
        this.cursor.x = e.clientX;
        this.cursor.y = e.clientY;
      }
    });
    addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        const take = this.capture;
        this.capture = null;
        take(e.code);
        return;
      }
      if (THROTTLE_KEYS.has(e.code) || BRAKE_KEYS.has(e.code) || DEPLOY_KEYS.has(e.code) || LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code)) {
        this.held.add(e.code);
        e.preventDefault();
      }
      if (e.code === 'KeyR' && !e.repeat && !this.resetSince) { this.resetSince = performance.now(); this.resetFired = false; }
      if (e.code === 'KeyM' && !e.repeat) this.muteQueued = true;
      if (e.code === 'KeyV' && !e.repeat) this.viewQueued = true;
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.pauseQueued = true;
      this.refresh();
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyR') this.resetSince = 0;
      this.held.delete(e.code);
      this.refresh();
    });
    // Mouse buttons on the game canvas (under pointer lock every click lands here).
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.held.add(`Mouse${e.button}`);
        this.refresh();
      }
    });
    addEventListener('mouseup', (e) => {
      this.held.delete(`Mouse${e.button}`);
      this.refresh();
    });
    // Right click is the boost, so no browser context menu over the game.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.held.clear(); this.refresh(); });
  }

  private refresh(): void {
    this.throttle = [...THROTTLE_KEYS].some((k) => this.held.has(k));
    this.brake = this.touch.has('brake') || [...BRAKE_KEYS].some((k) => this.held.has(k));
    this.deploy = this.touch.has('boost') || [...DEPLOY_KEYS].some((k) => this.held.has(k));
    const right = this.touch.has('right') || [...RIGHT_KEYS].some((k) => this.held.has(k));
    const left = this.touch.has('left') || [...LEFT_KEYS].some((k) => this.held.has(k));
    this.steer = (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** How far through the hold-R-to-restart the player is, 0..1 (0 when R isn't held). */
  resetProgress(): number {
    return this.resetSince ? Math.min(1, (performance.now() - this.resetSince) / 1000 / RESTART_HOLD) : 0;
  }
  /** True once per hold, when R has been held long enough. */
  takeReset(): boolean {
    if (this.resetFired || this.resetProgress() < 1) return false;
    this.resetFired = true;
    return true;
  }
  /** Forget any R press in progress (e.g. after a restart or leaving a menu). */
  clearReset(): void { this.resetSince = 0; this.resetFired = false; }

  /** Use these keys for the driving controls (the mouse buttons stay on brake and boost). */
  setBindings(keys: Record<Action, string[]>): void {
    const fill = (set: Set<string>, codes: string[], extra?: string) => {
      set.clear();
      for (const c of codes) set.add(c);
      if (extra) set.add(extra);
    };
    fill(LEFT_KEYS, keys.left);
    fill(RIGHT_KEYS, keys.right);
    fill(BRAKE_KEYS, keys.brake, 'Mouse0');
    fill(DEPLOY_KEYS, keys.boost, 'Mouse2');
    this.held.clear();
    this.refresh();
  }
  /** A touch button pressed or let go. */
  setTouch(c: TouchControl, down: boolean): void {
    if (down) this.touch.add(c); else this.touch.delete(c);
    this.refresh();
  }
  /** The touch pause button. */
  queuePause(): void { this.pauseQueued = true; }
  takePause(): boolean { const p = this.pauseQueued; this.pauseQueued = false; return p; }
  takeMute(): boolean { const m = this.muteQueued; this.muteQueued = false; return m; }
  takeView(): boolean { const v = this.viewQueued; this.viewQueued = false; return v; }

  /** Lock the mouse to the game. Must be called from a click or key handler. */
  lock(): void {
    if (this.locked) return;
    // Some embedded browsers refuse pointer lock; the game still plays with a free cursor.
    const result = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    result?.catch?.(() => {});
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Drop held keys so nothing stays pressed across a pause. */
  release(): void { this.held.clear(); this.refresh(); }
}

function clampTo(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
