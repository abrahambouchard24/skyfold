// Start screen (car, track, laps and season setup), pause menu and race results: plain DOM
// overlays on top of the canvas.
import { installDeco } from './deco';

/** An unlocked skin, offered as a card beside the cars. */
export interface SkinChoice { id: string; name: string; card: string }

/** The row of unlocked skins under the car cards (shared by the setup screen and the lobby). */
export function skinCards(skins: SkinChoice[], equipped: string): string {
  if (!skins.length) return '<p class="hr-skin-hint">Earn skins with achievements (see the Garage); they show up here to pick.</p>';
  return skins.map((s) => `<button class="hr-car hr-skincard ${equipped === s.id ? 'selected' : ''}" style="--c:#c98b3e" data-skin="${s.id}">
    ${cardFace({ name: `◆ ${s.name}`, card: s.card, url: '', color: '#c98b3e' })}</button>`).join('');
}

export interface CarChoice {
  /** A picture of the car's 3D model for the selection card (else the sprite at url). */
  card?: string; name: string; url: string; color: string }

/** A track card: outline is an SVG polygon's points in a 120 x 80 box. */
/** sprint: a sprint's length in km (one run, no laps); undefined for a lap circuit. */
export interface TrackChoice { name: string; blurb: string; outline: string; color: string; sprint?: string }

/** One line of the results table. points is only shown in a season. */
export interface ResultRow { name: string; color: string; time: string; gap: string; best: string; player: boolean; points?: number }

/** One line of the season standings. */
export interface StandingRow { name: string; color: string; points: number; gained: number; player: boolean }

/** Everything the results screen shows. Buttons carry the action they trigger. */
export interface ResultsView {
  title: string;
  subtitle: string;
  rows: ResultRow[];
  standings?: StandingRow[];
  /** Line under the standings, e.g. the champion. */
  note?: string;
  buttons: { act: string; label: string; primary?: boolean }[];
}

/** What the player set up on the start screen. races = 1 is a single race. */
export interface RaceSetup { car: number; track: number; laps: number; races: number; trial: boolean }

export interface MenuHandlers {
  start(setup: RaceSetup): void;
  /** Wear a skin ('stock' = each car in its own colours). */
  equip(skin: string): void;
  /** The Story window on the front menu. */
  story(): void;
  /** The Online window on the front menu. */
  online(): void;
  /** Open the TRAIN DRAGON screen for the selected car. */
  tune(car: number): void;
  /** The Settings screen (front menu and pause menu). */
  settings(): void;
  /** The tutorial lap (HOW TO PLAY on the front menu). */
  tutorial(): void;
  /** The Garage: skins and achievements. */
  garage(): void;
  resume(): void;
  restart(): void;
  changeCar(): void;
  /** Any other button: the results screen's own actions (next race, new season...). */
  action(act: string): void;
}

export const LAP_CHOICES = [1, 3, 5, 10];
export const SEASON_CHOICES = [2, 3, 4, 6, 8];

const CSS = `
.hr-overlay {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; overflow-y: auto;
  background: radial-gradient(ellipse at center, rgba(7,8,15,0.55), rgba(7,8,15,0.92));
  font-family: system-ui, sans-serif; color: #e8ecff; cursor: default; z-index: 10;
  backdrop-filter: blur(3px);
}
.hr-overlay.hidden { display: none; }
.hr-panel { text-align: center; padding: 16px; max-width: 980px; width: 100%; margin: auto; }
.hr-title {
  margin: 0; font-size: clamp(40px, 8vw, 76px); font-weight: 900; font-style: italic; letter-spacing: 0.04em;
  background: linear-gradient(90deg, #4fe3ff, #ff4fd8); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hr-sub { margin: 6px 0 14px; color: #8a93c0; font-weight: 600; letter-spacing: 0.2em; font-size: 13px; }
.hr-skins-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: -8px 0 22px; }
@media (max-width: 760px) { .hr-skins-row { grid-template-columns: repeat(3, 1fr); } }
.hr-skin-hint { grid-column: 1 / -1; margin: 0; color: #a89d8a; font-size: 12px; letter-spacing: 0.06em; }
.hr-cars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 22px; }
@media (max-width: 760px) { .hr-cars { grid-template-columns: repeat(3, 1fr); } }
.hr-car {
  position: relative; overflow: hidden; cursor: pointer; color: inherit; font: inherit; padding: 16px 6px 14px;
  border: 2px solid rgba(217,178,91,0.6); border-radius: 64px 64px 8px 8px;
  background:
    repeating-conic-gradient(from 0deg at 50% 46%, rgba(217,178,91,0.13) 0deg 3deg, transparent 3deg 15deg),
    radial-gradient(ellipse 85% 70% at 50% 44%, #1d6670, #0c3540 55%, #04141a);
  box-shadow: inset 0 0 0 4px rgba(4,20,26,0.85), inset 0 0 0 5px rgba(217,178,91,0.35);
  transition: transform 140ms, border-color 140ms, box-shadow 140ms;
}
.hr-car::after { content: ''; position: absolute; left: 20%; right: 20%; bottom: 7px; height: 2px; border-radius: 1px;
  background: var(--c); box-shadow: 0 0 8px var(--c); opacity: 0.7; }
.hr-car:hover { transform: translateY(-4px); border-color: #e3b878; }
.hr-car.selected { transform: translateY(-4px); border-color: #e3b878;
  box-shadow: inset 0 0 0 4px rgba(4,20,26,0.85), inset 0 0 0 5px var(--c), 0 0 28px -4px var(--c); }
.hr-car.selected::after { opacity: 1; }
.hr-car img { display: block; width: 100%; max-width: 150px; height: auto; margin: 0 auto 4px; filter: drop-shadow(0 8px 8px rgba(0,0,0,0.45)); }
.hr-car b { display: block; font: 800 20px 'Cinzel', 'Trajan Pro', Georgia, serif; color: #f0d58a; letter-spacing: 0.06em;
  text-shadow: 0 1px 0 #6b5220; line-height: 1; }
.hr-car span { display: block; margin-top: 3px; font: 600 11px 'Cinzel', 'Trajan Pro', Georgia, serif; letter-spacing: 0.22em; }
.hr-btns { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.hr-btn {
  min-width: 240px; padding: 14px 28px; border-radius: 12px; border: 0; cursor: pointer;
  font: 800 18px system-ui, sans-serif; letter-spacing: 0.12em; color: #07080f;
  background: linear-gradient(90deg, #4fe3ff, #7dffd8);
}
.hr-btn:hover { filter: brightness(1.12); }
.hr-btn.secondary { background: #1d2346; color: #e8ecff; }
.hr-keys { margin-top: 18px; color: #8a93c0; font-size: 13px; }
.hr-front-actions .hr-btn { min-width: 180px; padding: 11px 22px; font-size: 15px; }
.hr-front-actions .hr-btn.daily { color: #e3b26c; box-shadow: 0 0 0 1px rgba(168,116,58,0.75) inset; }
.hr-front-actions .hr-btn.daily:hover { color: #f1e6d0; box-shadow: 0 0 0 1px #c98b3e inset, 0 0 18px -6px #c98b3e; }
.hr-front-actions .hr-btn.fresh { background: linear-gradient(90deg, #4fe3ff, #7dffb0); color: #07080f; box-shadow: 0 0 24px -6px #4fe3ff; }
.hr-track .hr-rec { color: #ffd23f; font-weight: 800; letter-spacing: 0.06em; }
.hr-h2 { margin: 0 0 22px; font-size: 44px; font-weight: 900; letter-spacing: 0.1em; }
.hr-dist { font: 800 15px system-ui, sans-serif; letter-spacing: 0.12em; color: #c98b3e; padding: 9px 4px; }
.hr-tracks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
@media (max-width: 760px) { .hr-tracks { grid-template-columns: repeat(2, 1fr); } }
.hr-track {
  background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 14px; padding: 8px 10px 9px;
  cursor: pointer; color: inherit; font: inherit; text-align: left; transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
.hr-track:hover { transform: translateY(-3px); border-color: #4a5590; }
.hr-track.selected { border-color: var(--c); box-shadow: 0 0 22px -4px var(--c); transform: translateY(-3px); }
.hr-track svg { display: block; width: 100%; height: 46px; margin-bottom: 4px; }
.hr-track b { display: block; font-size: 13px; letter-spacing: 0.08em; }
.hr-track small { display: block; color: #8a93c0; font-size: 11px; margin-top: 2px; line-height: 1.25; }
.hr-options { display: flex; justify-content: center; gap: 28px; flex-wrap: wrap; margin-bottom: 22px; }
.hr-option { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.hr-option.hidden { visibility: hidden; }
.hr-btn.hidden { display: none; }
.hr-option label { color: #8a93c0; font-weight: 600; letter-spacing: 0.2em; font-size: 12px; }
.hr-seg { display: flex; background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 12px; padding: 3px; gap: 3px; }
.hr-seg button {
  border: 0; background: transparent; color: #8a93c0; font: 800 14px system-ui, sans-serif; letter-spacing: 0.08em;
  padding: 8px 14px; border-radius: 9px; cursor: pointer; min-width: 44px;
}
.hr-seg button:hover { color: #e8ecff; }
.hr-seg button.on { background: #4fe3ff; color: #07080f; }
.hr-results { width: 100%; max-width: 640px; margin: 0 auto 24px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.hr-results th { color: #8a93c0; font-size: 12px; letter-spacing: 0.14em; font-weight: 700; text-align: left; padding: 0 12px 8px; }
.hr-results td { padding: 9px 12px; font-weight: 700; font-size: 16px; text-align: left; border-top: 1px solid #1d2346; }
.hr-results th.num, .hr-results td.num { text-align: right; }
.hr-results tr.me td { background: rgba(79,227,255,0.1); }
.hr-results td.pos { font-size: 20px; font-weight: 900; width: 40px; }
.hr-results .dim { color: #8a93c0; }
.hr-results .pts { color: #ffd23f; }
.hr-results-track { margin: -12px 0 20px; color: #8a93c0; font-weight: 700; letter-spacing: 0.2em; font-size: 13px; }
.hr-standings-head { margin: 4px 0 10px; font-size: 20px; font-weight: 900; letter-spacing: 0.14em; }
.hr-note { margin: -10px 0 20px; font-size: 22px; font-weight: 900; letter-spacing: 0.1em; color: #ffd23f; }
.hr-btns.row { flex-direction: row; justify-content: center; flex-wrap: wrap; }

/* Front menu: three windows, each a little scene. Hovering one grows it. */
.hr-front { display: flex; gap: 16px; width: min(1200px, calc(100% - 32px)); height: min(440px, 62vh); margin: 0 auto 18px; }
@media (max-width: 760px) { .hr-front { flex-direction: column; height: auto; } .hr-window { min-height: 180px; } }
.hr-window { position: relative; flex: 1; overflow: hidden; border-radius: 20px; border: 2px solid #252b52; cursor: pointer;
  background: #0b0e1e; transition: flex 260ms ease, transform 260ms ease, border-color 200ms, box-shadow 260ms; color: inherit; font: inherit; padding: 0; text-align: left; }
.hr-window:hover, .hr-window:focus-visible { flex: 1.35; transform: translateY(-6px) scale(1.02); border-color: var(--c); box-shadow: 0 18px 50px -14px var(--c); outline: none; }
.hr-window .scene { position: absolute; inset: 0; }
.hr-window .label { position: absolute; left: 22px; right: 22px; bottom: 20px; z-index: 2; }
.hr-window .label b { display: block; font: 900 italic clamp(26px, 3.4vw, 40px) system-ui, sans-serif; letter-spacing: 0.04em; color: #fff;
  text-shadow: 0 4px 18px rgba(0,0,0,0.7); }
.hr-window .label small { display: block; margin-top: 4px; color: #d4daf5; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
.hr-window::after { content: ''; position: absolute; inset: 0; background: linear-gradient(transparent 45%, rgba(5,6,14,0.92)); z-index: 1; pointer-events: none; }

/* Story: dusk at the county speedway, two cars nose to nose. */
.sc-story { background: linear-gradient(180deg, #2a1240 0%, #a43a52 26%, #ff9a4a 39%, #1a1424 40%, #0d0b16 100%); }
.sc-story .sun { position: absolute; left: 50%; top: 30%; width: 150px; height: 150px; margin: -75px; border-radius: 50%;
  background: radial-gradient(circle, #ffd27a, #ff7a3d 60%, transparent 72%); filter: blur(1px); }
.sc-story .stand { position: absolute; left: -5%; right: -5%; top: 30%; height: 10%; background:
  radial-gradient(circle, rgba(255,214,140,0.9) 0 1.5px, transparent 2px) 0 4px / 11px 9px,
  radial-gradient(circle, rgba(79,227,255,0.8) 0 1.5px, transparent 2px) 5px 8px / 13px 9px,
  repeating-linear-gradient(90deg, #1b1528 0 14px, #251c36 14px 16px); }
/* An LED ribbon along the top of the stand, colour washing along it. */
.sc-story .stand::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; height: 4px;
  background: linear-gradient(90deg, #ff3d6e, #ffd23f, #4fe3ff, #b86bff, #ff3d6e) 0 0 / 50% 100%;
  box-shadow: 0 0 12px rgba(255,160,120,0.7); animation: hr-wash 3s linear infinite; }
/* The deck in front of the stand, where the cars sit: plates, a lit groove and a glowing energy rail with a pulse running along it. */
.sc-story .deck { position: absolute; left: 0; right: 0; top: 40%; bottom: 0;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 46px),
  linear-gradient(180deg, #2a2236, #17121f 70%); }
.sc-story .deck::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: #ff9a4a;
  box-shadow: 0 0 14px 2px rgba(255,154,74,0.7); }
.sc-story .deck::after { content: ''; position: absolute; top: -1px; height: 5px; width: 60px; border-radius: 3px; background: #fff;
  box-shadow: 0 0 14px 4px rgba(255,220,170,0.9); animation: hr-pulse-run 1.8s linear infinite; }
@keyframes hr-wash { to { background-position: 100% 0; } }
@keyframes hr-pulse-run { from { left: -20%; } to { left: 110%; } }
.sc-story img { position: absolute; top: 42%; width: 46%; height: auto; filter: drop-shadow(0 10px 8px rgba(0,0,0,0.6)); }
.sc-story .me { left: 2%; }
.sc-story .him { right: 2%; transform: scaleX(-1); }   /* mirrored: the two cars face each other */
.sc-story .vs { position: absolute; left: 50%; top: 49%; transform: translateX(-50%); font: 900 italic 30px system-ui; color: #ffd23f;
  text-shadow: 0 0 18px #ff7a3d; animation: hr-pulse 1.6s ease-in-out infinite; }
@keyframes hr-pulse { 50% { transform: translateX(-50%) scale(1.12); } }

/* Quick race: a red car flat out down a neon straight. */
.sc-quick { background: #0a0d1c; }
.sc-quick .road { position: absolute; left: -20%; right: -20%; top: 30%; height: 40%; transform: rotate(-8deg);
  background: linear-gradient(180deg, #181c2e, #262b44 30%, #2b3150 50%, #262b44 70%, #181c2e);
  box-shadow: 0 0 40px rgba(79,227,255,0.25); }
/* Deck plate seams and chevrons sliding past. */
.sc-quick .road::before { content: ''; position: absolute; inset: 0; animation: hr-scroll 0.45s linear infinite;
  background: repeating-linear-gradient(90deg, transparent 0 36px, rgba(0,0,0,0.35) 36px 38px); }
.sc-quick .chev { position: absolute; left: 0; right: 0; top: 50%; height: 26px; margin-top: -13px; opacity: 0.22; animation: hr-scroll 0.45s linear infinite;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='76' height='26'%3E%3Cpath d='M20 3 L34 13 L20 23' fill='none' stroke='%234fe3ff' stroke-width='4'/%3E%3C/svg%3E") repeat-x; }
/* Energy rails on both edges, with light pulses streaming along them. */
.sc-quick .rail { position: absolute; left: 0; right: 0; height: 3px; background: #4fe3ff; box-shadow: 0 0 10px 2px rgba(79,227,255,0.8); overflow: hidden; }
.sc-quick .rail.t { top: 6px; } .sc-quick .rail.b { bottom: 6px; }
.sc-quick .rail::after { content: ''; position: absolute; inset: 0; animation: hr-scroll-fast 0.35s linear infinite;
  background: repeating-linear-gradient(90deg, transparent 0 140px, #fff 140px 170px); }
/* Light-strip kerb along the top edge: lit and dark segments with a glow. */
.sc-quick .road::after { content: ''; position: absolute; left: 0; right: 0; top: -12px; height: 9px; animation: hr-scroll 0.45s linear infinite;
  background: repeating-linear-gradient(90deg, #ff2d75 0 38px, #0d0f1c 38px 76px); box-shadow: 0 0 12px rgba(255,45,117,0.6); }
@keyframes hr-scroll-fast { to { background-position: -340px 0; } }
.sc-quick img { position: absolute; left: 12%; top: 32%; width: 76%; height: auto; filter: drop-shadow(0 12px 10px rgba(0,0,0,0.6)); animation: hr-bob 1.1s ease-in-out infinite; }
.sc-quick .trail { position: absolute; left: -10%; width: 50%; top: 47%; height: 10px; border-radius: 6px; transform: rotate(-8deg);
  background: linear-gradient(90deg, transparent, rgba(79,227,255,0.85)); filter: blur(3px); }
@keyframes hr-scroll { to { background-position: -152px 0; } }
@keyframes hr-bob { 50% { transform: translateY(-4px); } }

/* Season: a trophy under spotlights, with the circuits behind it. */
.sc-season { background: radial-gradient(ellipse at 50% 35%, #2a2350, #0b0a18 70%); }
.sc-season svg.tracks { position: absolute; inset: 6% 4% 30% 4%; width: 92%; height: 64%; opacity: 0.35; }
.sc-season .cup { position: absolute; left: 50%; top: 18%; width: 120px; transform: translateX(-50%); filter: drop-shadow(0 0 26px rgba(255,210,63,0.6));
  animation: hr-float 3s ease-in-out infinite; }
.sc-season .beam { position: absolute; top: -10%; width: 120px; height: 90%; background: linear-gradient(rgba(255,240,190,0.25), transparent);
  clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%); }
.sc-season .beam.a { left: 20%; transform: rotate(-14deg); } .sc-season .beam.b { right: 20%; transform: rotate(14deg); }
.sc-season .spark { position: absolute; width: 6px; height: 6px; border-radius: 1px; animation: hr-fall linear infinite; }
@keyframes hr-float { 50% { transform: translateX(-50%) translateY(-8px); } }
@keyframes hr-fall { from { transform: translateY(-20px) rotate(0); opacity: 1; } to { transform: translateY(420px) rotate(540deg); opacity: 0; } }
/* Online: two cars side by side, a signal pulsing between them. */
.sc-online { background: radial-gradient(ellipse at 50% 40%, #0f2a3a, #070a16 70%); }
.sc-online .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(79,227,255,0.08) 1px, transparent 1px),
  linear-gradient(90deg, rgba(79,227,255,0.08) 1px, transparent 1px); background-size: 34px 34px; }
.sc-online img { position: absolute; top: 34%; width: 48%; height: auto; filter: drop-shadow(0 10px 8px rgba(0,0,0,0.6)); }
.sc-online .a { left: 0; } .sc-online .b { right: 0; transform: scaleX(-1); }
.sc-online .wave { position: absolute; left: 50%; top: 44%; width: 30px; height: 30px; margin: -15px; border-radius: 50%;
  border: 3px solid #4fe3ff; animation: hr-wave 1.8s ease-out infinite; }
.sc-online .wave:nth-child(3) { animation-delay: 0.6s; } .sc-online .wave:nth-child(4) { animation-delay: 1.2s; }
@keyframes hr-wave { from { transform: scale(0.3); opacity: 1; } to { transform: scale(4); opacity: 0; } }
.hr-back { position: absolute; top: 18px; left: 22px; min-width: 0; padding: 10px 18px; font-size: 14px; }
/* Narrow screens stack the windows: keep the cars a sensible size instead of a share of a wide card. */
@media (max-width: 760px) { .sc-story img, .sc-online img { width: auto !important; height: 72px !important; } .sc-quick img { width: auto !important; height: 96px !important; } }
/* Phones held sideways: the four windows stay side by side, short, with just their titles. */
@media (max-height: 500px) and (min-width: 600px) {
  .hr-front { flex-direction: row; height: 58vh; margin-bottom: 10px; }
  .hr-window { min-height: 0; border-radius: 14px; }
  .hr-window .label { left: 12px; right: 12px; bottom: 10px; }
  .hr-window .label b { font-size: 20px; }
  .hr-window .label small { display: none; }
  .sc-story img, .sc-online img { width: 46% !important; height: auto !important; }
  .sc-quick img { width: 76% !important; height: auto !important; }
  .hr-title { font-size: 34px; }
  .hr-sub { margin: 2px 0 8px; }
  .hr-keys { display: none; }
  .hr-front-actions .hr-btn { min-width: 0; padding: 8px 14px; font-size: 12px; }
}

/* ---------------------------------------------------------------------------------------------
 * (Earlier layer, kept under the Norse block at the end.) Clean type with wide tracking, glassy
 * sea-teal surfaces, gold only as fine hairlines and the primary action, teal light for what's
 * selected. Same layouts and scenes as above; these rules restyle them.
 * ------------------------------------------------------------------------------------------- */
.hr-overlay { font-family: 'Alegreya Sans', system-ui, sans-serif; color: #e9e0cc;
  background: radial-gradient(ellipse 90% 70% at 50% 30%, rgba(46,52,58,0.55), rgba(10,8,7,0.94)); }
.hr-title { font: 300 clamp(38px, 7vw, 72px) 'Alegreya Sans', system-ui, sans-serif; font-style: normal; letter-spacing: 0.34em; padding-left: 0.34em;
  background: linear-gradient(180deg, #f3ead8 10%, #e6c08a 55%, #a8743a); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 28px rgba(143,208,224,0.22)); }
.hr-title + .hr-sub { position: relative; display: inline-block; padding: 0 64px; }
.hr-title + .hr-sub::before, .hr-title + .hr-sub::after { content: ''; position: absolute; top: 50%; width: 48px; height: 1px;
  background: linear-gradient(90deg, transparent, #a8743a); }
.hr-title + .hr-sub::before { left: 0; } .hr-title + .hr-sub::after { right: 0; transform: scaleX(-1); }
.hr-sub { color: #a89d8a; font-weight: 500; letter-spacing: 0.34em; font-size: 11px; }
.hr-keys { color: #6f8a88; font-size: 12px; letter-spacing: 0.04em; }
.hr-h2 { font: 200 40px 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.42em; padding-left: 0.42em; color: #f3ead8; }

/* Buttons: a gold pill for the main action, glass pills for the rest. */
.hr-btn { border-radius: 999px; font: 600 14px 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.26em; padding: 14px 30px; color: #140f0b;
  background: linear-gradient(180deg, #e8c08a, #b57a3c 60%, #8a5a2b); box-shadow: 0 0 0 1px rgba(255,244,214,0.5) inset, 0 10px 30px -14px rgba(201,139,62,0.8);
  transition: transform 140ms, box-shadow 160ms, filter 160ms; }
.hr-btn:hover { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(255,244,214,0.7) inset, 0 12px 34px -12px rgba(201,139,62,0.9); }
.hr-btn.secondary { color: #e9e0cc; background: rgba(38,31,25,0.55); backdrop-filter: blur(6px);
  box-shadow: 0 0 0 1px rgba(168,116,58,0.45) inset; }
.hr-btn.secondary:hover { color: #f3ead8; box-shadow: 0 0 0 1px rgba(143,208,224,0.8) inset, 0 0 22px -6px rgba(143,208,224,0.7); }
.hr-front-actions .hr-btn { min-width: 0; padding: 11px 22px; font-size: 12px; }
.hr-front-actions .hr-btn.fresh { color: #120e0b; background: linear-gradient(180deg, #c4ecf5, #8fd0e0); box-shadow: 0 0 26px -6px #8fd0e0; }
.hr-front-actions .hr-btn.daily { color: #e6c08a; box-shadow: 0 0 0 1px rgba(201,139,62,0.85) inset; }
.hr-back { border-radius: 999px; }

/* Front windows: glass frames with a hairline that warms to gold on hover. */
.hr-window { border: 1px solid rgba(168,116,58,0.32); border-radius: 22px; background: #071016;
  box-shadow: 0 0 0 1px rgba(10,8,7,0.9) inset, 0 20px 50px -30px rgba(0,0,0,0.9); }
.hr-window:hover, .hr-window:focus-visible { border-color: rgba(201,139,62,0.9); box-shadow: 0 0 0 1px rgba(201,139,62,0.25) inset, 0 22px 60px -18px rgba(143,208,224,0.45); }
.hr-window .label b { font: 300 clamp(22px, 2.6vw, 32px) 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.24em; color: #f3ead8; }
.hr-window .label small { color: #c9d6d2; font-weight: 400; font-size: 12px; letter-spacing: 0.05em; }
.hr-window::after { background: linear-gradient(transparent 42%, rgba(3,10,14,0.94)); }
/* Scene accents moved to the palette: gold and teal light instead of pink and rainbow. */
.sc-story .stand::before { background: linear-gradient(90deg, #c98b3e, #8fd0e0, #f3ead8, #8fd0e0, #c98b3e) 0 0 / 50% 100%; box-shadow: 0 0 12px rgba(201,139,62,0.6); }
.sc-story .vs { font: 200 30px 'Alegreya Sans', system-ui; letter-spacing: 0.2em; color: #e6c08a; text-shadow: 0 0 18px rgba(201,139,62,0.8); }
.sc-quick .road::after { background: repeating-linear-gradient(90deg, #c98b3e 0 38px, #140f0b 38px 76px); box-shadow: 0 0 12px rgba(201,139,62,0.5); }
.sc-quick .rail { background: #8fd0e0; box-shadow: 0 0 10px 2px rgba(143,208,224,0.7); }
.sc-season { background: radial-gradient(ellipse at 50% 35%, #123c44, #050d12 70%); }

/* Setup screen: glass track cards, pill segments with a teal "on". */
.hr-track { background: rgba(36,30,24,0.62); border: 1px solid rgba(168,116,58,0.22); border-radius: 16px; backdrop-filter: blur(4px); }
.hr-track:hover { border-color: rgba(168,116,58,0.6); }
.hr-track.selected { border-color: #c98b3e; box-shadow: 0 0 0 1px rgba(201,139,62,0.35) inset, 0 0 26px -6px rgba(143,208,224,0.6); }
.hr-track b { font-weight: 600; letter-spacing: 0.16em; font-size: 12px; }
.hr-track small { color: #a89d8a; }
.hr-track .hr-rec { color: #c98b3e; font-weight: 600; letter-spacing: 0.12em; }
.hr-option label { color: #a89d8a; font-weight: 500; letter-spacing: 0.3em; font-size: 11px; }
.hr-seg { background: rgba(28,23,19,0.7); border: 1px solid rgba(168,116,58,0.35); border-radius: 999px; padding: 3px; }
.hr-seg button { border-radius: 999px; color: #a89d8a; font: 600 13px 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.14em; }
.hr-seg button:hover { color: #f3ead8; }
.hr-seg button.on { background: linear-gradient(180deg, #c4ecf5, #8fd0e0); color: #120e0b; box-shadow: 0 0 16px -4px #8fd0e0; }
.hr-dist { font: 600 14px 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.22em; }

/* Results: a clean ledger with hairline rows, the player's row lit teal, points in gold. */
.hr-results th { color: #a89d8a; font-weight: 500; letter-spacing: 0.26em; font-size: 10px; }
.hr-results td { font-weight: 500; font-size: 15px; border-top: 1px solid rgba(168,116,58,0.16); }
.hr-results td.pos { font-weight: 300; font-size: 22px; color: #e6c08a; }
.hr-results tr.me td { background: rgba(143,208,224,0.1); }
.hr-results tr.me td:first-child { box-shadow: 2px 0 0 #8fd0e0 inset; }
.hr-results .dim { color: #a89d8a; }
.hr-results .pts { color: #c98b3e; }
.hr-results-track { color: #a89d8a; font-weight: 500; letter-spacing: 0.28em; font-size: 11px; }
.hr-standings-head { font-weight: 300; letter-spacing: 0.3em; color: #f3ead8; }
.hr-note { font-weight: 300; letter-spacing: 0.24em; color: #e6c08a; }

/* Front windows as folded dioramas: the paper art fills the window, the craft sit on it. */
.hr-window .scene { background: #1c2228; }
.hr-window .scene svg.paper { position: absolute; inset: 0; width: 100%; height: 100%; }
.sc-story img { top: 50%; }
.sc-story .vs { top: 56%; }
.sc-quick svg .kerb, .sc-quick svg .chev { animation: hr-paper-run 1.1s linear infinite; }
@keyframes hr-paper-run { from { transform: translate(0, 0); } to { transform: translate(-68px, 32px); } }
.sc-quick img { top: 36%; }
.sc-online img { top: 42%; }
.sc-online .dart { position: absolute; left: 22%; top: 34%; width: 34px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.35));
  animation: hr-dart 2.6s ease-in-out infinite; }
.sc-online .dart:nth-of-type(2) { animation-delay: 0.85s; }
.sc-online .dart:nth-of-type(3) { animation-delay: 1.7s; }
@keyframes hr-dart {
  0% { transform: translate(0, 30px) rotate(-14deg); opacity: 0; }
  15% { opacity: 1; }
  50% { transform: translate(70px, -8px) rotate(0deg); }
  85% { opacity: 1; }
  100% { transform: translate(140px, 30px) rotate(14deg); opacity: 0; }
}
.sc-season svg .trophy { animation: hr-cup 3.2s ease-in-out infinite; }
@keyframes hr-cup { 50% { transform: translateY(-6px); } }
.sc-season .spark { width: 8px; height: 8px; border-radius: 0; clip-path: polygon(0 0, 100% 30%, 20% 100%); }

/* ---------------------------------------------------------------------------------------------
 * The Norse look (overrides everything above): weathered timber and iron, bronze fittings and
 * rivets, bone-white text, fjord-frost for what's selected, uncial lettering for titles and
 * runes as ornament. Rugged, hand-made, old.
 * ------------------------------------------------------------------------------------------- */
.hr-overlay { font-family: 'Alegreya Sans', system-ui, sans-serif; color: #e9e0cc;
  background: radial-gradient(ellipse 90% 70% at 50% 30%, rgba(46,52,58,0.55), rgba(10,9,8,0.94)); }
.hr-title { font: 400 clamp(40px, 7.4vw, 78px) 'Uncial Antiqua', Georgia, serif; letter-spacing: 0.08em; padding-left: 0.08em;
  background: linear-gradient(180deg, #f3e6c8 10%, #d6a462 55%, #8a5a2b); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 rgba(0,0,0,0.55)) drop-shadow(0 0 22px rgba(143,208,224,0.15)); }
.hr-title + .hr-sub::before, .hr-title + .hr-sub::after { content: 'ᛟ'; width: auto; height: auto; background: none; color: #a8743a;
  top: 50%; transform: translateY(-50%); font-size: 14px; letter-spacing: 0; }
.hr-title + .hr-sub::after { content: 'ᛟ'; transform: translateY(-50%); }
.hr-sub { font-family: 'Alegreya Sans SC', 'Alegreya Sans', system-ui, sans-serif; color: #a89d8a; letter-spacing: 0.28em; font-weight: 500; }
.hr-h2 { font: 400 42px 'Uncial Antiqua', Georgia, serif; letter-spacing: 0.1em; padding-left: 0.1em; color: #f1e6d0;
  text-shadow: 0 3px 0 rgba(0,0,0,0.5); }

/* Buttons: hammered bronze plates for the main action, iron-bound timber for the rest. */
.hr-btn { border-radius: 4px; font: 700 14px 'Alegreya Sans SC', 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.16em; color: #1a120b;
  background: linear-gradient(180deg, #e0a861, #b07a3e 55%, #7a4e24);
  box-shadow: 0 0 0 1px #3a2716, inset 0 1px 0 rgba(255,232,190,0.5), inset 0 -2px 0 rgba(0,0,0,0.25), 0 8px 20px -10px rgba(0,0,0,0.9); }
.hr-btn:hover { filter: brightness(1.08); }
.hr-btn.secondary { color: #e9e0cc; backdrop-filter: none;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0 3px, transparent 3px 9px), linear-gradient(180deg, #3a2f26, #251e19);
  box-shadow: 0 0 0 1px #6a5640, inset 0 0 0 3px rgba(0,0,0,0.35); }
.hr-btn.secondary:hover { color: #fff; box-shadow: 0 0 0 1px #c98b3e, inset 0 0 0 3px rgba(0,0,0,0.35), 0 0 16px -6px rgba(201,139,62,0.7); }
.hr-front-actions .hr-btn.fresh { color: #120e0b; background: linear-gradient(180deg, #c4ecf5, #8fd0e0); box-shadow: 0 0 0 1px #2c4a55, 0 0 22px -6px #8fd0e0; }
.hr-front-actions .hr-btn.daily { color: #e6c08a; box-shadow: 0 0 0 1px #c98b3e, inset 0 0 0 3px rgba(0,0,0,0.35); }

/* Front windows: timber frames bound in iron, with bronze studs. */
.hr-window { border: 2px solid #4a3c2e; border-radius: 8px; background: #14110e;
  box-shadow: inset 0 0 0 3px rgba(0,0,0,0.45), 0 18px 40px -26px rgba(0,0,0,0.95); }
.hr-window:hover, .hr-window:focus-visible { border-color: #c98b3e; box-shadow: inset 0 0 0 3px rgba(0,0,0,0.45), 0 22px 50px -18px rgba(201,139,62,0.45); }
.hr-window .label b { font: 400 clamp(22px, 2.6vw, 32px) 'Uncial Antiqua', Georgia, serif; letter-spacing: 0.06em; color: #f3ead8; text-shadow: 0 3px 0 rgba(0,0,0,0.6); }
.hr-window .label small { color: #d6ccb8; }
.hr-window::before { content: ''; position: absolute; inset: 7px; z-index: 3; pointer-events: none;
  background:
    radial-gradient(circle, #d19a55 0 2.5px, #5a3a1c 3px, transparent 3.6px) 0 0 / 100% 100% no-repeat,
    radial-gradient(circle at 0 0, #d19a55 0 2.5px, #5a3a1c 3px, transparent 3.6px) top left / 10px 10px no-repeat,
    radial-gradient(circle at 100% 0, #d19a55 0 2.5px, #5a3a1c 3px, transparent 3.6px) top right / 10px 10px no-repeat; }

/* Car (dragon) cards: a round shield-arch of dark timber with bronze rays. */
.hr-car { border: 2px solid #6a5640; border-radius: 60px 60px 6px 6px;
  background:
    repeating-conic-gradient(from 0deg at 50% 46%, rgba(201,139,62,0.12) 0deg 3deg, transparent 3deg 15deg),
    radial-gradient(ellipse 85% 70% at 50% 44%, #4a3d30, #2a221b 55%, #120f0c);
  box-shadow: inset 0 0 0 4px rgba(0,0,0,0.5), inset 0 0 0 5px rgba(201,139,62,0.35); }
.hr-car:hover, .hr-car.selected { border-color: #e3b878; }
.hr-car b { font-family: 'Uncial Antiqua', Georgia, serif; color: #e6c08a; text-shadow: 0 2px 0 #2a1a0c; }
.hr-car span { font-family: 'Alegreya Sans SC', 'Alegreya Sans', sans-serif; letter-spacing: 0.18em; }

/* Setup screen: timber track cards, iron segment bars, frost for the chosen one. */
.hr-track { background: repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 3px, transparent 3px 11px), linear-gradient(180deg, #2c241e, #1c1714);
  border: 1px solid #4a3c2e; border-radius: 6px; backdrop-filter: none; }
.hr-track:hover { border-color: #8a6a48; }
.hr-track.selected { border-color: #c98b3e; box-shadow: inset 0 0 0 1px rgba(201,139,62,0.4), 0 0 22px -6px rgba(143,208,224,0.5); }
.hr-track b { font-family: 'Alegreya Sans SC', 'Alegreya Sans', sans-serif; letter-spacing: 0.12em; font-size: 13px; }
.hr-seg { border-radius: 4px; background: #1a1512; border: 1px solid #5a4a3a; }
.hr-seg button { border-radius: 3px; font: 700 13px 'Alegreya Sans SC', 'Alegreya Sans', sans-serif; letter-spacing: 0.1em; }
.hr-seg button.on { background: linear-gradient(180deg, #c4ecf5, #8fd0e0); color: #120e0b; box-shadow: none; }
.hr-results td.pos { font-family: 'Uncial Antiqua', Georgia, serif; color: #e6c08a; }
.hr-standings-head, .hr-note { font-family: 'Uncial Antiqua', Georgia, serif; letter-spacing: 0.1em; }
`;



// --- the front menu's scenes, folded from paper -------------------------------------------------
// Each window is a little folded diorama: flat paper planes in SVG, each a slightly different tone
// where the light catches its fold, with crisp creases and no gloss. Sizes are in a 300 x 440 box,
// cropped to fit the window (preserveAspectRatio slice).

/** A seeded random, so the folds come out the same every time. */
function seeded(seed: number): () => number {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
const poly = (pts: number[][], fill: string, extra = '') =>
  `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c.join(',')})`;
};

/** A band of folded paper: a strip cut into triangles that alternate tone like a pleat. */
function pleatBand(y0: number, y1: number, color: string, folds: number, seed: number): string {
  const r = seeded(seed);
  const xs = Array.from({ length: folds + 1 }, (_, i) => (i / folds) * 320 - 10 + (i && i < folds ? (r() - 0.5) * 18 : 0));
  let out = '';
  for (let i = 0; i < folds; i++) {
    const a = xs[i], b = xs[i + 1], m = (a + b) / 2 + (r() - 0.5) * 12;
    out += poly([[a, y0], [b, y0], [m, y1]], shade(color, 0.92 + r() * 0.16));
    out += poly([[a, y0], [m, y1], [a - (b - a) / 2, y1]], shade(color, 0.8 + r() * 0.14));
  }
  out += poly([[xs[folds], y0], [330, y0], [330, y1], [xs[folds] - 10, y1]], shade(color, 0.86));
  return out;
}

/** A paper mountain or dune: two faces folded along the ridge, one in light and one in shade. */
const ridge = (x: number, w: number, h: number, base: number, color: string) =>
  poly([[x - w / 2, base], [x, base - h], [x + w * 0.08, base]], shade(color, 1.08)) +
  poly([[x + w * 0.08, base], [x, base - h], [x + w / 2, base]], shade(color, 0.72));

const SCENE_STORY = (() => {
  // Dusk: pleated sky bands from plum to amber, a fanned paper sun, folded hills and a dark deck.
  let svg = pleatBand(0, 70, '#1d2a3a', 9, 1) + pleatBand(70, 140, '#2f4a5e', 9, 2) + pleatBand(140, 196, '#6f8a8a', 9, 3);
  const cx = 150, cy = 200, R = 74;
  for (let k = 0; k < 10; k++) {
    const a0 = Math.PI + (k / 10) * Math.PI, a1 = Math.PI + ((k + 1) / 10) * Math.PI;
    svg += poly([[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]], k % 2 ? '#cfc4a8' : '#e6dcc4');
  }
  svg += ridge(40, 150, 62, 214, '#3a4650') + ridge(250, 170, 78, 214, '#2e3a44') + ridge(150, 120, 40, 214, '#46545c');
  svg += poly([[-10, 212], [310, 212], [310, 440], [-10, 440]], '#1c2228');
  svg += poly([[-10, 212], [310, 212], [150, 300]], '#232a30');
  svg += `<line x1="-10" y1="212" x2="310" y2="212" stroke="#c98b3e" stroke-width="2"/>`;
  return `<svg class="paper" viewBox="0 0 300 440" preserveAspectRatio="xMidYMid slice">${svg}</svg>`;
})();

const SCENE_QUICK = (() => {
  // Night teal paper, and a folded road strip racing up and across, its kerb in gold.
  let svg = pleatBand(0, 440, '#22303a', 6, 4);
  svg += poly([[-40, 330], [340, 150], [340, 250], [-40, 430]], '#26343c');
  svg += poly([[-40, 330], [340, 150], [340, 200], [-40, 380]], '#33454f');   // the crease down the road's middle
  svg += `<g class="kerb">${Array.from({ length: 14 }, (_, i) => {
    const x = -60 + i * 34, y = 340 - i * 16;
    return poly([[x, y], [x + 17, y - 8], [x + 17, y - 2], [x, y + 6]], i % 2 ? '#c98b3e' : '#fff4d6');
  }).join('')}</g>`;
  svg += `<g class="chev">${Array.from({ length: 6 }, (_, i) => {
    const x = 10 + i * 60, y = 300 - i * 28;
    return poly([[x, y], [x + 18, y - 4], [x, y + 8]], '#8fd0e0', 'opacity="0.7"');
  }).join('')}</g>`;
  return `<svg class="paper" viewBox="0 0 300 440" preserveAspectRatio="xMidYMid slice">${svg}</svg>`;
})();

/** A paper dart: the classic folded plane, two wings and a keel in three tones. */
const DART = `<svg class="dart" viewBox="0 0 60 30"><polygon points="0,15 60,12 18,0" fill="#fff8e8"/><polygon points="0,15 60,12 24,30" fill="#d8cdb6"/><polygon points="0,15 60,12 30,17" fill="#b9ab90"/></svg>`;

const SCENE_ONLINE = (() => {
  // Deep teal paper folded into a few big planes, a dotted gold flight path between the two craft.
  let svg = '';
  const r = seeded(9);
  const pts = [[-10, -10], [150, -10], [310, -10], [-10, 220], [130, 200], [310, 230], [-10, 450], [160, 450], [310, 450]];
  const tris = [[0, 1, 4], [1, 2, 4], [2, 5, 4], [0, 4, 3], [3, 4, 7], [4, 5, 7], [3, 7, 6], [5, 8, 7]];
  for (const [a, b, c] of tris) svg += poly([pts[a], pts[b], pts[c]], shade('#2c3a44', 0.75 + r() * 0.35));
  svg += `<path d="M60 205 Q150 110 240 205" fill="none" stroke="#c98b3e" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>`;
  return `<svg class="paper" viewBox="0 0 300 440" preserveAspectRatio="xMidYMid slice">${svg}</svg>`;
})();

const SCENE_SEASON = (() => {
  // A trophy folded from gold paper, under two paper spotlights, on a stepped paper podium.
  let svg = pleatBand(0, 440, '#2a2a2e', 5, 6);
  svg += poly([[95, -10], [125, -10], [175, 330], [40, 330]], 'rgba(255,248,225,0.07)');
  svg += poly([[175, -10], [205, -10], [260, 330], [125, 330]], 'rgba(255,248,225,0.06)');
  const G = ['#f0c890', '#d6a462', '#b07a3e', '#8a5a2b', '#6a421f'];
  // Cup: a faceted bowl (four planes a side), handles, stem and base.
  const cup = [
    poly([[110, 120], [150, 120], [150, 205]], G[1]), poly([[110, 120], [150, 205], [124, 186]], G[2]),
    poly([[190, 120], [150, 120], [150, 205]], G[0]), poly([[190, 120], [150, 205], [176, 186]], G[1]),
    poly([[110, 120], [124, 186], [112, 160]], G[3]), poly([[190, 120], [176, 186], [188, 160]], G[2]),
    poly([[110, 128], [90, 132], [96, 160], [112, 166], [112, 154], [102, 150], [100, 138], [110, 136]], G[2]),
    poly([[190, 128], [210, 132], [204, 160], [188, 166], [188, 154], [198, 150], [200, 138], [190, 136]], G[1]),
    poly([[143, 205], [157, 205], [160, 238], [140, 238]], G[2]), poly([[150, 205], [157, 205], [160, 238], [150, 238]], G[1]),
    poly([[124, 238], [176, 238], [184, 252], [116, 252]], G[1]), poly([[150, 238], [176, 238], [184, 252], [150, 252]], G[0]),
    poly([[108, 252], [192, 252], [192, 276], [108, 276]], '#2a2420'), `<line x1="108" y1="252" x2="192" y2="252" stroke="#c98b3e" stroke-width="2"/>`,
    poly([[140, 150], [160, 150], [150, 170]], '#8fd0e0'),
  ];
  svg += `<g class="trophy">${cup.join('')}</g>`;
  // Podium steps.
  svg += poly([[60, 330], [240, 330], [240, 440], [60, 440]], '#262220') + poly([[60, 330], [240, 330], [150, 360]], '#322c28');
  return `<svg class="paper" viewBox="0 0 300 440" preserveAspectRatio="xMidYMid slice">${svg}</svg>`;
})();

export class Menus {
  private front: HTMLDivElement;
  private start: HTMLDivElement;
  private pause: HTMLDivElement;
  private results: HTMLDivElement;
  private cards: HTMLButtonElement[] = [];
  private trackCards: HTMLButtonElement[] = [];
  selected = 0;
  selectedTrack = 0;
  laps = 3;
  /** 1 = single race; more = a season of that many races. */
  races = 1;
  private seasonRaces = 4;
  /** Each track's sprint length in km (undefined for lap circuits). */
  private sprintKm: (string | undefined)[] = [];
  /** Time Trial: alone on track against the ghost of your best lap. */
  trial = false;
  private resultsHtml = '';

  constructor(cars: CarChoice[], tracks: TrackChoice[], private on: MenuHandlers) {
    installDeco();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    // Front menu: Story, Quick Race and Season, each a window onto its own little scene.
    // Paper confetti: little folded triangles in gold, ivory and teal.
    const sparks = Array.from({ length: 16 }, (_, i) => `<i class="spark" style="left:${(i * 37) % 100}%;top:-10px;`
      + `background:${['#c98b3e', '#fff4d6', '#8fd0e0', '#c99e45'][i % 4]};animation-duration:${3.4 + (i % 5) * 0.7}s;animation-delay:${(i * 0.43) % 4}s"></i>`).join('');
    this.front = overlay(`
      <div class="hr-panel" style="max-width:1240px">
        <h1 class="hr-title">SKYFOLD</h1>
        <p class="hr-sub">DRAGON RACING</p>
        <div class="hr-front">
          <!-- Story mode: hidden until Skyfold has its own saga. -->
          <button class="hr-window" data-act="quick" style="--c:#4fe3ff">
            <div class="scene sc-quick">${SCENE_QUICK}<img src="${cars[0]?.card ?? cars[0]?.url ?? ''}" alt=""></div>
            <div class="label"><b>QUICK RACE</b><small>One race. Choose your dragon and your realm, and fly.</small></div>
          </button>
          <button class="hr-window" data-act="online" style="--c:#7dffb0">
            <div class="scene sc-online">${SCENE_ONLINE}<img class="a" src="${cars[0]?.card ?? cars[0]?.url ?? ''}" alt="">${DART}${DART}${DART}
              <img class="b" src="${cars[1]?.card ?? cars[1]?.url ?? ''}" alt=""></div>
            <div class="label"><b>ONLINE</b><small>Raise a hall, send the rune-code, and race your friends live.</small></div>
          </button>
          <button class="hr-window" data-act="season" style="--c:#ffd23f">
            <div class="scene sc-season">${SCENE_SEASON}${sparks}</div>
            <div class="label"><b>SAGA</b><small>A saga across the realms. Glory for every finish, a name in the sagas for the best.</small></div>
          </button>
        </div>
        <div class="hr-btns row hr-front-actions">
          <button class="hr-btn secondary" data-act="tutorial">HOW TO PLAY</button>
          <button class="hr-btn secondary" data-act="trial">TIME TRIAL</button>
          <button class="hr-btn secondary daily" data-act="daily">DAILY CHALLENGE</button>
          <button class="hr-btn secondary" data-act="garage">GARAGE</button>
          <button class="hr-btn secondary" data-act="settings">SETTINGS</button>
          <button class="hr-btn secondary hidden" data-act="install">INSTALL</button>
        </div>
        <p class="hr-keys">A / D or ← / →: steer &nbsp;·&nbsp; Flies on its own &nbsp;·&nbsp; S / ↓ / Space: brake &nbsp;·&nbsp; W / ↑ / Shift: call the gale &nbsp;·&nbsp; Esc: pause &nbsp;·&nbsp; M: mute</p>
      </div>`);

    this.start = overlay(`
      <button class="hr-btn secondary hr-back" data-act="front">◂ BACK</button>
      <div class="hr-panel">
        <h1 class="hr-title" data-setup-title>QUICK RACE</h1>
        <p class="hr-sub">CHOOSE YOUR DRAGON</p>
        <div class="hr-cars"></div>
        <p class="hr-sub">YOUR SKINS</p>
        <div class="hr-skins-row"></div>
        <p class="hr-sub" data-track-head>CHOOSE YOUR TRACK</p>
        <div class="hr-tracks"></div>
        <p class="hr-sub" data-sprint-head>SPRINTS · ONE RUN, NO LAPS, BIG JUMPS</p>
        <div class="hr-tracks hr-sprints"></div>
        <div class="hr-options">
          <div class="hr-option" style="display:none"><label>MODE</label><div class="hr-seg" data-seg="mode">
            <button data-v="single">SINGLE RACE</button><button data-v="season">SEASON</button></div></div>
          <div class="hr-option" data-opt="dist"><label>DISTANCE</label><div class="hr-dist"></div></div>
          <div class="hr-option" data-opt="laps"><label>LAPS</label><div class="hr-seg" data-seg="laps">
            ${LAP_CHOICES.map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
          <div class="hr-option" data-opt="races"><label>RACES</label><div class="hr-seg" data-seg="races">
            ${SEASON_CHOICES.map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
        </div>
        <div class="hr-btns row"><button class="hr-btn" data-act="start">START RACE</button><button class="hr-btn secondary" data-act="tune">TRAIN DRAGON</button></div>
        <p class="hr-keys">A / D or ← / →: steer &nbsp;·&nbsp; Flies on its own &nbsp;·&nbsp; S / ↓ / Space: brake &nbsp;·&nbsp; W / ↑ / Shift: call the gale &nbsp;·&nbsp; Esc: pause &nbsp;·&nbsp; M: mute</p>
      </div>`);
    const grid = this.start.querySelector('.hr-cars')!;
    cars.forEach((car, i) => {
      const b = document.createElement('button');
      b.className = 'hr-car';
      b.style.setProperty('--c', car.color);
      b.innerHTML = cardFace(car);
      b.addEventListener('click', () => { this.select(i); this.equipped = 'stock'; this.on.equip('stock'); this.markSkins(); });
      b.addEventListener('dblclick', () => this.on.start(this.setup()));
      grid.append(b);
      this.cards.push(b);
    });
    this.select(0);

    const trackGrid = this.start.querySelector('.hr-tracks')!, sprintGrid = this.start.querySelector('.hr-sprints')!;
    this.sprintKm = tracks.map((t) => t.sprint);
    tracks.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'hr-track';
      b.style.setProperty('--c', t.color);
      b.innerHTML = `<svg viewBox="0 0 120 80"><polygon points="${t.outline}" fill="none" stroke="${t.color}"
        stroke-width="3" stroke-linejoin="round"/></svg><b>${t.name}</b><small>${t.blurb}</small><small class="hr-rec"></small>`;
      b.addEventListener('click', () => this.selectTrack(i));
      b.addEventListener('dblclick', () => this.on.start(this.setup()));
      (t.sprint ? sprintGrid : trackGrid).append(b);
      this.trackCards.push(b);
    });
    this.selectTrack(0);

    this.start.querySelectorAll<HTMLElement>('.hr-seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const v = (e.target as HTMLElement).closest('button')?.getAttribute('data-v');
        if (!v) return;
        if (seg.dataset.seg === 'mode') this.races = v === 'season' ? this.seasonRaces : 1;
        if (seg.dataset.seg === 'laps') this.laps = Number(v);
        if (seg.dataset.seg === 'races') this.races = this.seasonRaces = Number(v);
        this.refreshOptions();
      });
    });
    this.refreshOptions();

    this.start.classList.add('hidden');

    this.pause = overlay(`
      <div class="hr-panel">
        <h2 class="hr-h2">PAUSED</h2>
        <div class="hr-btns">
          <button class="hr-btn" data-act="resume">RESUME</button>
          <button class="hr-btn secondary" data-act="restart">RESTART RACE</button>
          <button class="hr-btn secondary" data-act="change">CHANGE DRAGON</button>
          <button class="hr-btn secondary" data-act="settings">SETTINGS</button>
        </div>
      </div>`);
    this.pause.classList.add('hidden');

    this.results = overlay(`<div class="hr-panel"></div>`);
    this.results.classList.add('hidden');

    for (const el of [this.front, this.start, this.pause, this.results]) {
      el.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
        if (!act) return;
        if (act === 'story') this.on.story();
        else if (act === 'settings') this.on.settings();
        else if (act === 'tutorial') this.on.tutorial();
        else if (act === 'garage') this.on.garage();
        else if (act === 'online') this.on.online();
        else if (act === 'quick') this.showSetup('single');
        else if (act === 'trial') this.showSetup('trial');
        else if (act === 'season') this.showSetup('season');
        else if (act === 'front') this.showFront();
        else if (act === 'tune') this.on.tune(this.selected);
        else if (act === 'start') this.on.start(this.setup());
        else if (act === 'resume') this.on.resume();
        else if (act === 'restart') this.on.restart();
        else if (act === 'change') this.on.changeCar();
        else this.on.action(act);
      });
      document.body.append(el);
    }

    // Keyboard on the start screen: left/right pick a car, up/down pick a track, Enter starts.
    addEventListener('keydown', (e) => {
      if (this.start.classList.contains('hidden')) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.selected + 1) % cars.length);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.selected - 1 + cars.length) % cars.length);
      if (e.code === 'ArrowDown') this.selectTrack((this.selectedTrack + 1) % tracks.length);
      if (e.code === 'ArrowUp') this.selectTrack((this.selectedTrack - 1 + tracks.length) % tracks.length);
      if (e.code === 'Enter') this.on.start(this.setup());
    });
  }

  setup(): RaceSetup { return { car: this.selected, track: this.selectedTrack, laps: this.laps, races: this.races, trial: this.trial }; }

  private refreshOptions(): void {
    const mark = (seg: string, v: string) => this.start.querySelectorAll(`[data-seg="${seg}"] button`)
      .forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === v));
    mark('mode', this.races > 1 ? 'season' : 'single');
    mark('laps', String(this.laps));
    mark('races', String(this.seasonRaces));
    this.start.querySelector('[data-opt="races"]')!.classList.toggle('hidden', this.races === 1);
    // Sprints: not in seasons; a sprint shows its distance where the laps would be.
    const season = this.races > 1;
    if (season && this.sprintKm[this.selectedTrack]) { this.selectTrack(0); return; }
    this.start.querySelector<HTMLElement>('[data-sprint-head]')!.style.display = season ? 'none' : '';
    this.start.querySelector<HTMLElement>('.hr-sprints')!.style.display = season ? 'none' : '';
    const km = this.sprintKm[this.selectedTrack];
    this.start.querySelector<HTMLElement>('[data-opt="laps"]')!.style.display = km ? 'none' : '';
    this.start.querySelector<HTMLElement>('[data-opt="dist"]')!.style.display = km ? '' : 'none';
    this.start.querySelector('.hr-dist')!.textContent = km ? `${km} KM · ONE RUN` : '';
    this.start.querySelector('[data-track-head]')!.textContent = this.races > 1 ? 'CHOOSE THE OPENING TRACK' : 'CHOOSE YOUR TRACK';
    this.start.querySelector('[data-act="start"]')!.textContent = this.trial ? 'START TRIAL' : this.races > 1 ? 'START SAGA' : 'START RACE';
    this.start.querySelector('[data-setup-title]')!.textContent = this.trial ? 'TIME TRIAL' : this.races > 1 ? 'SAGA' : 'QUICK RACE';
  }

  /** Show the player's best lap on each track card ('' where there isn't one yet). */
  setRecords(text: string[]): void {
    this.trackCards.forEach((c, i) => { c.querySelector('.hr-rec')!.textContent = text[i] ? `BEST ${text[i]}` : ''; });
  }

  /** Make HOW TO PLAY stand out for someone who hasn't done the tutorial yet. */
  setNewPlayer(fresh: boolean): void {
    this.front.querySelector('[data-act="tutorial"]')!.classList.toggle('fresh', fresh);
  }

  selectTrack(i: number): void {
    this.selectedTrack = i;
    this.trackCards.forEach((c, k) => c.classList.toggle('selected', k === i));
    if (this.start) this.refreshOptions();
  }

  /** Online, the pause menu doesn't stop the race: guests can only leave; the host can restart or go back to the lobby. */
  setOnline(role: 'host' | 'guest' | null): void {
    const restart = this.pause.querySelector<HTMLElement>('[data-act="restart"]')!;
    restart.style.display = role === 'guest' ? 'none' : '';
    this.pause.querySelector('[data-act="change"]')!.textContent =
      role === 'host' ? 'BACK TO LOBBY' : role === 'guest' ? 'LEAVE RACE' : 'CHANGE DRAGON';
  }

  get pauseOpen(): boolean { return !this.pause.classList.contains('hidden'); }

  /** In a story race the pause menu's way out goes back to the chapter map. */
  setStory(on: boolean): void {
    if (on) this.pause.querySelector('[data-act="change"]')!.textContent = 'QUIT MISSION';
  }

  /** In a season the pause menu's way out quits the season rather than just changing car. */
  setSeason(on: boolean): void {
    this.pause.querySelector('[data-act="change"]')!.textContent = on ? 'QUIT SAGA' : 'CHANGE DRAGON';
  }

  /** Show the results screen, or refresh it while the rest of the field is still finishing. */
  showResults(v: ResultsView): void {
    const season = v.rows.some((r) => r.points !== undefined);
    const raceRows = v.rows.map((r, i) => `
      <tr class="${r.player ? 'me' : ''}">
        <td class="pos">${i + 1}</td>
        <td style="color:${r.color}">${r.name}${r.player ? ' &nbsp;<span class="dim">YOU</span>' : ''}</td>
        <td class="num">${r.time}</td>
        <td class="num dim">${r.gap}</td>
        <td class="num">${r.best}</td>
        ${season ? `<td class="num pts">${r.points ? `+${r.points}` : ''}</td>` : ''}
      </tr>`).join('');
    const standings = v.standings ? `
      <p class="hr-standings-head">THE SAGA SO FAR</p>
      <table class="hr-results">
        <thead><tr><th></th><th>DRAGON</th><th class="num">THIS RACE</th><th class="num">GLORY</th></tr></thead>
        <tbody>${v.standings.map((s, i) => `
          <tr class="${s.player ? 'me' : ''}">
            <td class="pos">${i + 1}</td>
            <td style="color:${s.color}">${s.name}${s.player ? ' &nbsp;<span class="dim">YOU</span>' : ''}</td>
            <td class="num pts">${s.gained ? `+${s.gained}` : ''}</td>
            <td class="num">${s.points}</td>
          </tr>`).join('')}</tbody>
      </table>` : '';
    const html = `
      <h2 class="hr-h2">${v.title}</h2>
      <p class="hr-results-track">${v.subtitle}</p>
      <table class="hr-results">
        <thead><tr><th></th><th>DRAGON</th><th class="num">TIME</th><th class="num">GAP</th><th class="num">BEST LAP</th>${season ? '<th class="num">GLORY</th>' : ''}</tr></thead>
        <tbody>${raceRows}</tbody>
      </table>
      ${standings}
      ${v.note ? `<p class="hr-note">${v.note}</p>` : ''}
      <div class="hr-btns row">${v.buttons.map((b) =>
        `<button class="hr-btn ${b.primary ? '' : 'secondary'}" data-act="${b.act}">${b.label}</button>`).join('')}</div>`;
    // Rebuilt a few times a second while cars finish: only touch the DOM when something changed,
    // so a button press isn't lost to the element under the cursor being replaced.
    if (html !== this.resultsHtml) {
      this.resultsHtml = html;
      this.results.querySelector('.hr-panel')!.innerHTML = html;
    }
    if (!this.results.classList.contains('hidden')) return;
    this.hide();
    this.results.classList.remove('hidden');
  }

  select(i: number): void {
    this.selected = i;
    this.markSkins();
  }

  /** The unlocked skins to offer as cards, and the one being worn ('stock' = none). */
  private equipped = 'stock';
  setSkins(skins: SkinChoice[], equipped: string): void {
    this.equipped = equipped;
    const row = this.start.querySelector<HTMLElement>('.hr-skins-row')!;
    row.innerHTML = skinCards(skins, equipped);
    row.querySelectorAll<HTMLElement>('[data-skin]').forEach((b) => {
      b.addEventListener('click', () => { this.equipped = b.dataset.skin!; this.on.equip(this.equipped); this.markSkins(); });
      b.addEventListener('dblclick', () => this.on.start(this.setup()));
    });
    this.markSkins();
  }

  /** Highlight the skin being worn, or (in stock colours) the chosen car. */
  private markSkins(): void {
    const stock = this.equipped === 'stock';
    this.cards.forEach((c, k) => c.classList.toggle('selected', stock && k === this.selected));
    this.start?.querySelectorAll<HTMLElement>('[data-skin]').forEach((b) => b.classList.toggle('selected', b.dataset.skin === this.equipped));
  }

  /** The setup screen for a quick race or a season (the front menu chose which). */
  showSetup(mode: 'single' | 'season' | 'trial'): void {
    this.trial = mode === 'trial';
    this.races = mode === 'season' ? this.seasonRaces : 1;
    this.refreshOptions();
    this.hide();
    this.start.classList.remove('hidden');
  }

  showStart(): void { this.hide(); this.start.classList.remove('hidden'); }
  showFront(): void { this.hide(); this.front.classList.remove('hidden'); }
  showPause(): void { this.hide(); this.pause.classList.remove('hidden'); }
  hide(): void { for (const el of [this.front, this.start, this.pause, this.results]) el.classList.add('hidden'); }
}

function overlay(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'hr-overlay';
  el.innerHTML = html;
  return el;
}

/** The inside of a car selection card: number, the car's 3D model and its name. */
export function cardFace(car: CarChoice): string {
  const [num, ...rest] = car.name.split(' ');
  return `<b>${num}</b><img src="${car.card ?? car.url}" alt=""><span style="color:${car.color}">${rest.join(' ') || num}</span>`;
}
