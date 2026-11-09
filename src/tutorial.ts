// The tutorial lap: a solo run on Apex Arena with one prompt at a time, each moving on once
// the player has actually done the thing (steered, braked, drifted, boosted...).

import { keyLabel, type Action } from './settings';

/** What the tutorial watches each physics step. */
export interface TutorialInfo {
  racing: boolean;       // past GO
  speed: number;         // px/s
  steer: number;         // -1..1 steering keys
  brake: boolean;
  deploying: boolean;
  energy: number;        // ERS battery 0..1
  cooling: boolean;      // on the cooling lane
  lap: number;           // laps completed
}

interface Step { text: (k: (a: Action) => string) => string; done: (i: TutorialInfo, t: StepState) => boolean }
interface StepState { time: number; left: number; right: number; brake: number; boost: number; energy0: number }

const STEPS: Step[] = [
  { text: (k) => `Get ready. Tip: hold <b>${k('brake')}</b> through the countdown and let go right on GO for a turbo start.`,
    done: (i) => i.racing },
  { text: (k) => `Steer with <b>${k('left')}</b> and <b>${k('right')}</b>. Tap for small corrections, hold to turn harder.`,
    done: (_, t) => t.left > 0.3 && t.right > 0.3 },
  { text: (k) => `Your dragon slides through the air, so slow down early: brake with <b>${k('brake')}</b> <i>before</i> a corner, then turn in.`,
    done: (_, t) => t.brake > 0.3 },
  { text: () => `Turn hard through a corner at speed to slide. Sliding charges your <b>BOOST</b> bar.`,
    done: (i, t) => i.energy - t.energy0 > 0.1 || (t.time > 14 && i.energy > 0.6) },
  { text: (k) => `On a straight, hold <b>${k('boost')}</b> to <b>BOOST</b>.`,
    done: (_, t) => t.boost > 0.6 },
  { text: () => `Walls add <b>HEAT</b>, and a hot dragon tires and slows. Fly over the frost-blue <b>COOL</b> lane on the main straight to cool off.`,
    done: (i, t) => i.cooling || t.time > 8 },
  { text: () => `From lap 2, <b>DRS</b> opens on the straights when you're within a second of the dragon ahead: ride its wind for +7% speed. Now finish the lap!`,
    done: (i) => i.lap >= 2 },
];

const CSS = `
.tut { position: fixed; left: 50%; top: 96px; transform: translateX(-50%); z-index: 15; width: min(560px, calc(100% - 32px));
  padding: 14px 20px 16px; border-radius: 4px; background: linear-gradient(160deg, rgba(40,32,26,0.93), rgba(18,15,13,0.95)); border: 1px solid #a8743a;
  box-shadow: inset 0 0 0 4px rgba(18,15,13,0.85), inset 0 0 0 5px rgba(168,116,58,0.22), 0 10px 40px -12px rgba(0,0,0,0.7);
  font-family: system-ui, sans-serif; color: #e9e0cc; pointer-events: none;
  transition: border-color 200ms, opacity 300ms; }
.tut.hidden { opacity: 0; }
.tut small { display: block; color: #a8743a; font-weight: 700; letter-spacing: 0.24em; font-size: 10px; margin-bottom: 6px; }
.tut p { margin: 0; font-size: 17px; line-height: 1.45; }
.tut b { color: #8fd0e0; }
.tut.ok { border-color: #e3b26c; box-shadow: inset 0 0 0 4px rgba(18,15,13,0.85), inset 0 0 0 5px rgba(241,210,122,0.5), 0 0 30px -8px rgba(241,210,122,0.6); }
.tut .dots { display: flex; gap: 6px; margin-top: 10px; }
.tut .dots i { width: 22px; height: 2px; background: rgba(168,116,58,0.25); }
.tut .dots i.on { background: #c98b3e; box-shadow: 0 0 6px #c98b3e; }
`;

export class Tutorial {
  private el: HTMLDivElement;
  private step = 0;
  private st: StepState = { time: 0, left: 0, right: 0, brake: 0, boost: 0, energy0: 0 };
  private doneFor = 0;           // seconds the current step has been showing as done
  finished = false;

  constructor(private keys: Record<Action, string[]>) {
    if (!document.getElementById('tut-css')) {
      const style = document.createElement('style');
      style.id = 'tut-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'tut';
    document.body.append(this.el);
    this.show();
  }

  private key = (a: Action) => this.keys[a].slice(0, 2).map(keyLabel).join(' / ');

  private show(final = false): void {
    const total = STEPS.length;
    this.el.classList.remove('ok');
    this.el.innerHTML = final
      ? `<small>TUTORIAL COMPLETE</small><p>That's everything. You're ready to race. Try a <b>Quick Race</b>, or start the <b>Story</b>.</p>`
      : `<small>HOW TO PLAY · ${this.step + 1} / ${total}</small><p>${STEPS[this.step].text(this.key)}</p>
         <div class="dots">${STEPS.map((_, i) => `<i class="${i <= this.step ? 'on' : ''}"></i>`).join('')}</div>`;
  }

  /** Called every physics step while the tutorial race runs. */
  update(i: TutorialInfo, dt: number): void {
    if (this.finished) return;
    const t = this.st;
    if (this.step >= STEPS.length) {
      this.doneFor += dt;
      if (this.doneFor > 6) { this.finished = true; this.el.classList.add('hidden'); }
      return;
    }
    if (this.doneFor > 0) {
      // Show the tick briefly, then move on.
      this.doneFor += dt;
      if (this.doneFor > 0.9) {
        this.step++;
        this.doneFor = 0;
        this.st = { time: 0, left: 0, right: 0, brake: 0, boost: 0, energy0: i.energy };
        this.show(this.step >= STEPS.length);
      }
      return;
    }
    t.time += dt;
    if (i.steer < -0.5) t.left += dt;
    if (i.steer > 0.5) t.right += dt;
    if (i.brake && i.speed > 250) t.brake += dt;
    if (i.deploying) t.boost += dt;
    if (STEPS[this.step].done(i, t)) {
      this.doneFor = dt;
      this.el.classList.add('ok');
    }
  }

  remove(): void { this.el.remove(); }
}
