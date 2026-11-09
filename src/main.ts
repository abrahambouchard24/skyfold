import { Driver } from './ai';
import { Sound } from './audio';
import { Craft, LAUNCH_TIME, Mods, NO_MODS, STALL_TIME, bumpOff, clamp, collideCrafts, lerp, wrapAngle } from './craft';
import { Input } from './input';
import { Menus, RaceSetup, ResultRow, ResultsView, StandingRow, TrackChoice } from './menu';
import { Camera, Car, NOZZLE_BACK, NOZZLE_SIDE, Particle, RaceHud, Toast, drawFrame, formatTime, loadSprite } from './render';
import { ChaseView, renderCarCards, renderRiderPreview } from './view3d';
import { loadRecords, loadSettings, saveRecords, saveSettings, type Settings } from './settings';
import { SettingsUI } from './settingsui';
import { Tutorial } from './tutorial';
import { ACHIEVEMENTS, Achievements, SKINS, skinColors } from './achievements';
import { GarageUI } from './garageui';
import {
  MISSIONS, REPLAY_SHARE, Save, Speaker, loadSave, met, playerMods, rivalMods, writeSave,
} from './story';
import { StoryUI } from './storyui';
import { LobbyUI } from './lobbyui';
import { addMods, loadSetup, sanitize, saveSetup, setupMods } from './setup';
import { speciesMods } from './species';
import { loadRider, saveRider } from './rider';
import { TuneUI } from './tuneui';
import { TouchControls } from './touch';
import { dragonEvents, speciesFor } from './dragon';
import { DailyDef, DailyUI, dailyChallenge, dailyStatus, recordDaily } from './daily';
import { GhostLap, GhostRecorder, ghostPose, loadGhost, saveGhost, trackSig } from './ghost';
import { BoardRow, CarSnap, Controls, Guest, Host, LobbyState, NetEntrant, Snapshot } from './net';
import { FlockMode } from './flockmode';
import { OneSheepMode } from './onesheepmode';
import { RaceState, TRACKS, Track, WALL_DIST, collideWalls, inCoolingLane, lateral, placeOnGrid } from './track';

const STEP = 1 / 60;
const COUNTDOWN = 3;          // seconds of 3-2-1 before GO
// AI skill range: 1 = drives near the grip limit; lower brakes earlier and corners slower.
const AI_SKILL_MIN = 0.82;
const AI_SKILL_MAX = 0.97;
const RESULTS_DELAY = 2.5;    // seconds after the player finishes before the results screen
// Catch-up: +1% pace per place from 3rd back (the car right behind the leader gets nothing, so a
// clean leader can defend), capped at +3%.
const CATCH_UP_PER_PLACE = 0.01;
const CATCH_UP_MAX = 0.03;
// Turbo start: let go of the brake in this window around GO for a perfect launch; earlier is a jump start.
const LAUNCH_EARLY = 0.3;     // s before GO a press still counts as perfect
const LAUNCH_LATE = 0.15;     // s after GO a press still counts as perfect
// DRS: from this lap on, being within DRS_GAP seconds of the car ahead when entering a zone opens the wing.
const DRS_FROM_LAP = 1;       // laps completed, i.e. DRS is enabled from lap 2
const DRS_GAP = 1.0;          // s
/** Season points for 1st to 6th. */
const POINTS = [10, 8, 6, 4, 2, 1];

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
// The HUD canvas sits over the 3D view's canvas.
Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: '1' });

// --- view: the 3D chase camera. The original top-down view is kept in the code (render.ts) as a
// fallback when WebGL is missing, and V switches to it in dev builds only. -------------------------
type ViewMode = 'chase' | 'top';
let chase: ChaseView | null = null;
try { chase = new ChaseView(); } catch { chase = null; }   // no WebGL: top-down only
let view: ViewMode = chase ? 'chase' : 'top';
if (chase) chase.visible = view === 'chase';

function toggleView(): void {
  if (!chase) { showToast('3D VIEW NOT AVAILABLE', '#ff7a8a'); return; }
  view = view === 'chase' ? 'top' : 'chase';
  chase.visible = view === 'chase';
  try { localStorage.setItem('skyfold-view', view); } catch { /* not kept */ }
  showToast(view === 'chase' ? 'CHASE CAM' : 'TOP-DOWN VIEW', '#ffffff');
}

/**
 * Steering is keyboard only (A / D or the arrow keys), in either view: it eases toward full lock
 * over a moment so a tap is a small correction, and lets go a little faster. Called once per
 * physics step; the result is the world angle the physics turns toward.
 */
let keySteer = 0;
function steerAim(c: Craft, brake: boolean): number {
  const target = input.steer;
  const rate = target === 0 ? 12 : 6.5;
  keySteer += clamp(target - keySteer, -rate * STEP, rate * STEP);
  return c.heading + keySteer * c.maxTurn(STEP, brake);
}

const input = new Input(canvas);
const touch = new TouchControls(input);
const sound = new Sound();

/** Settings (volume, graphics, keys): applied at once on every change and saved. */
let settings: Settings = loadSettings();
sound.muted = settings.muted;
function applySettings(next: Settings): void {
  settings = next;
  saveSettings(settings);
  input.setBindings(settings.keys);
  sound.setVolumes(settings.music, settings.sfx);
  chase?.setQuality(settings.quality);
}
applySettings(settings);
const settingsUI = new SettingsUI((fn) => { input.capture = fn; });
function openSettings(): void {
  input.release();
  settingsUI.open(settings, applySettings, () => input.release());
}

/** Achievements and the skins they unlock; the Garage to equip them. */
const achievements = new Achievements();
const garageUI = new GarageUI();
achievements.onUnlock = (a) => { garageUI.notify(a); refreshSkinCards(); };
/** Per race: did the player touch a wall, and the most gale gathered in a lap. */
let touchedWall = false;
let driftCharge = 0;
/** Jumps the player has landed this race (a sprint: SKY HIGH needs every one). */
let jumpsTaken = 0;
/** Each car's skin id (sent to guests in the start message). */
const carSkin = new Map<Car, string>();
/** Each skin painted on the craft, for the skin cards and the Garage (each rendered once, when first needed). */
const skinPics: Record<string, string> = {};
function skinPictures(ids = SKINS.map((s) => s.id)): Record<string, string> {
  const missing = SKINS.filter((s) => ids.includes(s.id) && !(s.id in skinPics));
  if (!missing.length || !chase) return skinPics;
  try {
    const l = LIVERIES[0];
    const urls = renderCarCards(missing.map((s) => ({ color: l.color, name: l.name, hue: l.hue, skin: s.colors })), 300, 200);
    missing.forEach((s, k) => { skinPics[s.id] = urls[k]; });
  } catch { /* swatches then */ }
  return skinPics;
}

function openGarage(): void {
  input.release();
  const li = LIVERIES[playerLivery];
  garageUI.open(achievements.p, () => input.release(), skinPictures(), {
    look: loadRider(),
    preview: (look) => { try { return chase ? renderRiderPreview({ color: li.color, name: li.name, hue: li.hue, kind: playerLivery, skin: skinColors(achievements.equipped), rider: look }) : ''; } catch { return ''; } },
    save: (look) => { saveRider(look); if (player) player.rider = look; },
  });
}

/** Wear a skin, picked on a car selection screen ('stock' = the car's own colours). */
function equipSkin(skin: string): void {
  achievements.equip(skin);
  if (player) player.skin = skinColors(achievements.equipped);
  if (online?.role === 'guest') online.guest.send({ t: 'skin', skin: achievements.equipped });
  if (online?.role === 'host') broadcastLobby();
}

/** The unlocked skins as cards beside the cars, on the setup screen and in the lobby. */
function refreshSkinCards(): void {
  const owned = SKINS.filter((s) => s.colors && achievements.p.unlocked.some((a) => ACHIEVEMENTS.find((x) => x.id === a)?.skin === s.id));
  const pics = skinPictures(owned.map((s) => s.id));
  const list = owned.map((s) => ({ id: s.id, name: s.name, card: pics[s.id] ?? '' }));
  menus.setSkins(list, achievements.equipped);
  lobbyUI.setSkins(list, achievements.equipped);
}

/** The tutorial lap, while it's running. */
let tutorial: Tutorial | null = null;
function endTutorial(): void { tutorial?.remove(); tutorial = null; }

const tracks = TRACKS.map((def) => new Track(def));
let trackIndex = 0;
let track = tracks[0];
/** The field. The player picks one on the start screen; the rest are AI. hue = exhaust flame color. */
const LIVERIES = [
  { name: '01 FAFNIR', url: 'sprites/craft-red.png', color: '#b8452f', hue: 15 },
  { name: '02 NIDHOGG', url: 'sprites/craft-cyan.webp', color: '#6fa8c4', hue: 195 },
  { name: '03 JORMUN', url: 'sprites/craft-green.png', color: '#5f8a4a', hue: 100 },
  { name: '04 SURTR', url: 'sprites/craft-orange.png', color: '#d9822b', hue: 30 },
  { name: '05 HRAESVELG', url: 'sprites/craft-purple.png', color: '#86719e', hue: 270 },
  { name: '06 SKOLL', url: 'sprites/craft-blue.png', color: '#4a6f94', hue: 210 },
].map((l) => ({ ...l, sprite: loadSprite(l.url), card: undefined as string | undefined }));
// The selection cards show each car's 3D model (falling back to the top-down sprite without WebGL).
try { if (chase) renderCarCards(LIVERIES).forEach((url, i) => { LIVERIES[i].card = url; }); } catch { /* sprites it is */ }

/** A picture of one car for menus: its 3D model, in the player's equipped skin when asked. */
function carPicture(i: number, withSkin = false): string {
  const l = LIVERIES[i];
  const skin = withSkin ? skinColors(achievements.equipped) : null;
  if (skin && chase) {
    try { return renderCarCards([{ color: l.color, name: l.name, hue: l.hue, skin }])[0]; } catch { /* fall back */ }
  }
  return l.card ?? l.url;
}

/** menu = start screen; paused = pause menu; racing = the simulation runs; results = it keeps
 * running behind the results table while the rest of the field finishes. */
let mode: 'menu' | 'racing' | 'paused' | 'results' = 'menu';
let playerLivery = 0;
let pausedAt = 0;             // performance.now() when the pause menu opened
let raceLaps = 3;
/** Laps in this race: a sprint is one run, start to finish, whatever the laps setting. */
function laps(): number { return track.sprint ? 1 : raceLaps; }
/** A sprint's length in km, as the speedo counts it (km/h = px/s / 4). */
function sprintKm(t: Track): string { return (t.routeLength / 4 / 3600).toFixed(1); }
/** Seasons rotate through the lap circuits only (the sprints come after them in TRACKS). */
const CIRCUITS = TRACKS.filter((t) => !t.sprint).length;
/** Time Trial: alone on track, chasing the ghost of the best lap. */
let trial = false;
/** The daily challenge being raced (null otherwise), and how today's latest attempt went. */
let daily: DailyDef | null = null;
let dailyResult: { met: boolean; better: boolean } | null = null;
let ghostLap: GhostLap | null = null;     // the lap the ghost replays (Time Trial only)
let ghostCar: Car | null = null;
const ghostRec = new GhostRecorder();      // the player's lap in progress
const dailyUI = new DailyUI();
/** The daily challenge's briefing card, from the front menu. */
function openDaily(): void {
  const d = dailyChallenge(TRACKS.length, LIVERIES.length, AI_SKILL_MIN, AI_SKILL_MAX);
  menus.hide();
  const dt0 = tracks[d.track];
  dailyUI.open(d, TRACKS[d.track].name, dt0.sprint ? `SPRINT · ${sprintKm(dt0)} KM · ${LIVERIES[d.car].name}` : `${d.laps} LAPS · ${LIVERIES[d.car].name}`,
    carPicture(d.car, true), formatTime, {
    start() {
      endTutorial();
      mission = null;
      trial = false;
      season = null;
      menus.setSeason(false);
      daily = d;
      dailyResult = null;
      playerLivery = d.car;
      raceLaps = d.laps;
      startRound(d.track);
      showToast('DAILY CHALLENGE', '#e3b26c');
    },
    back() { menus.showFront(); },
    tune() { tuneUI.open(carSetup, carPicture(d.car, true), (s) => { carSetup = s; saveSetup(s); }, () => {}); },
  });
}

/** Lap time against the ghost for the lap just finished (null = no ghost to compare with). */
let ghostDelta: number | null = null;

/**
 * A season: a run of races rotating through the tracks from the opening one, scored by finishing
 * position. points holds the totals from completed races, keyed by car name.
 */
interface Season { races: number; round: number; openingTrack: number; points: Map<string, number> }
let season: Season | null = null;

/** Story mode: the saved progress, and the mission being raced (null outside a story race). */
let save: Save | null = loadSave();
let mission: number | null = null;
/** Which saga character rides which dragon, for goals like "finish ahead of Viggo". */
const whoDrives = new Map<Speaker, Car>();
let overheatedThisRace = false;
let raceBestLap = 0;          // the player's best lap in this race only (for lap-time goals)

/** One other car in a race: its livery, name, driving skill and performance mods. `peer` = an online player's car. */
interface Entry { livery: number; name: string; skill: number; mods: Mods; who?: Speaker; peer?: string; skin?: string }

// --- online state -------------------------------------------------------------------------------

const SNAP_RATE = 30;          // snapshots per second from the host
const INTERP_DELAY = 0.1;      // s guests render behind the newest snapshot, to smooth out jitter

type Online =
  | { role: 'host'; host: Host; code: string; lobby: LobbyState }
  | {
      role: 'guest'; guest: Guest; code: string; me: string; lobby: LobbyState | null;
      snaps: Snapshot[]; offset: number | null; finishedAt: number; inRace: boolean;
    };
let online: Online | null = null;
/** Host side: each guest's car, and an autopilot for it once it has finished. */
const remotes = new Map<string, Car>();
const remoteAuto = new Map<Car, Driver>();
/** Every car's livery, for telling guests what to draw. */
const carLivery = new Map<Car, number>();
/** Host side: each guest's turbo-start timing. */
const remoteLaunch = new Map<string, { prev: boolean; armed: boolean; released: number; judged: boolean }>();
let snapClock = 0;
let resultsSent = 0;
/** Host side: each guest's controls in use, and the seq of the last one applied. */
const lastControls = new Map<string, Controls>();

/**
 * Guest side: our own car runs here too, from our controls, so it responds instantly. Each host
 * snapshot carries the true state of our car and the last control applied to it; we reset to
 * that, replay the controls the host hasn't applied yet, and blend away any small difference.
 */
const pred = {
  ready: false,
  seq: 0,
  history: [] as { c: Controls; racing: boolean }[],
  race: new RaceState(),
  /** What's still to be blended out after a correction (drawn as an offset on our car). */
  errX: 0, errY: 0,
  acc: 0,
  /** Size of each correction (px), for testing. */
  corrections: [] as number[],
};
const SNAP_CORRECTION = 150;   // px: a correction bigger than this is applied at once, not blended
/**
 * Guest side: where the other cars are estimated to be right now. They're drawn INTERP_DELAY
 * behind, and the host is about another GHOST_LATENCY ahead of what reached us, so project each
 * forward along its velocity. Our predicted car bumps off these and feels their slipstream.
 */
const GHOST_LATENCY = 0.05;
let ghosts: Craft[] = [];
/** Guest: the latest results screen from the host. */
let hostResults: import('./menu').ResultsView | null = null;

/** Everything that differs between a quick race, a season round and a story mission. */
interface RaceConfig {
  field: Entry[];
  playerName: string;
  playerMods: Mods;
  grid: 'random' | 'back' | 'pole';
  startHeat: number;
}

/** The race about to start: a story mission's set-up, or the usual full field. */
function raceConfig(): RaceConfig {
  if (online?.role === 'host') {
    const lb = online.lobby;
    const taken = lb.players.map((p) => p.car);
    const aiLiveries = LIVERIES.map((_, i) => i).filter((i) => !taken.includes(i)).slice(0, Math.max(0, Math.min(lb.ai, 6 - lb.players.length)));
    return {
      field: [
        ...lb.players.slice(1).map((p) => ({ livery: p.car, name: p.name, skill: 1, mods: setupMods(sanitize(p.setup)), peer: p.id, skin: p.skin })),
        ...aiLiveries.map((li) => ({ livery: li, name: LIVERIES[li].name, skill: lerp(AI_SKILL_MIN, AI_SKILL_MAX, Math.random()), mods: { ...NO_MODS } })),
      ],
      playerName: lb.players[0].name, playerMods: setupMods(carSetup), grid: 'random', startHeat: 0,
    };
  }
  if (tutorial || trial) {
    return { field: [], playerName: LIVERIES[playerLivery].name, playerMods: setupMods(carSetup), grid: 'pole', startHeat: 0 };
  }
  if (mission !== null && save) {
    const m = MISSIONS[mission];
    return {
      field: m.rivals.map((e) => ({ livery: e.livery, name: e.name, skill: e.skill, mods: rivalMods(m, e, playerMods(save!)), who: e.who })),
      playerName: save.name, playerMods: addMods(playerMods(save), setupMods(carSetup)), grid: m.grid, startHeat: m.startHeat ?? 0,
    };
  }
  if (daily) {
    const d = daily;
    return {
      field: LIVERIES.map((_, i) => i).filter((i) => i !== d.car).map((li) => ({
        livery: li, name: LIVERIES[li].name, skill: d.skills[li], mods: { ...NO_MODS, top: d.aiPace, accel: d.aiPace },
      })),
      playerName: LIVERIES[d.car].name, playerMods: setupMods(carSetup),
      grid: d.twist === 'back' ? 'back' : d.twist === 'fast' ? 'pole' : 'random', startHeat: d.twist === 'hot' ? 0.7 : 0,
    };
  }
  return {
    field: LIVERIES.map((_, i) => i).filter((i) => i !== playerLivery).map((li) => ({
      livery: li, name: LIVERIES[li].name, skill: lerp(AI_SKILL_MIN, AI_SKILL_MAX, Math.random()), mods: { ...NO_MODS },
    })),
    playerName: LIVERIES[playerLivery].name, playerMods: setupMods(carSetup), grid: 'random', startHeat: 0,
  };
}

/** The player's car setup (TUNE CAR), kept in the browser. */
let carSetup = loadSetup();
const tuneUI = new TuneUI();

let player: Car;
let rivals: { car: Car; driver: Driver }[] = [];
let cars: Car[] = [];
const names = new Map<Car, string>();
/** The player's best lap per track (Quick Race and Season), saved in the browser. */
const records = loadRecords();
const bestLaps = TRACKS.map((d) => records[d.name] ?? 0);
const particles: Particle[] = [];
const cam: Camera = { x: 0, y: 0, zoom: 1, shake: 0 };
let toast: Toast | null = null;
let time = 0;
let goTime = 0;               // race time when the lights go out
let finishOrder: Car[] = [];
const finishTimes = new Map<Car, number>();   // race time from the lights going out
let autopilot: Driver | null = null;          // drives the player's car once it has finished
let resultsAt = 0;            // race time to show the results screen; 0 = not yet
let resultsRefresh = 0;
let lastCount = 0;            // countdown number last beeped
// Launch judging for the player, and whether the AI have rolled their starts.
let launchJudged = false;
let prevBrake = false;
let launchArmed = false;      // brake held during the countdown
let releasedAt = -1;          // race time the brake was let go (-1 = not yet)
let aiLaunched = false;
/** Per car: the DRS zone it's in (-1 = none) and whether it earned DRS on entering it. */
const drs = new Map<Car, { zone: number; earned: boolean }>();

function livery(i: number) {
  const { sprite, color, hue, name } = LIVERIES[i];
  return { sprite, color, hue, name, kind: i };
}

/** Line everyone up on the grid and start the countdown. */
function startRace(): void {
  carSkin.clear();
  if (tutorial) { tutorial.remove(); tutorial = new Tutorial(settings.keys); }   // a restart starts the lesson over
  const cfg = raceConfig();
  names.clear();
  whoDrives.clear();
  remotes.clear();
  remoteAuto.clear();
  remoteLaunch.clear();
  lastControls.clear();
  if (online?.role === 'host') online.host.clearInputs();
  carLivery.clear();
  rivals = cfg.field.filter((e) => !e.peer).map((e, k) => {
    const driver = new Driver(e.skill, k + 1);
    driver.craft.mods = addMods(e.mods, speciesMods(e.livery));   // its setup, plus how its species flies
    const car: Car = { craft: driver.craft, race: driver.race, ...livery(e.livery), name: e.name };
    names.set(car, e.name);
    carLivery.set(car, e.livery);
    if (e.who) whoDrives.set(e.who, car);
    return { car, driver };
  });
  const humans = cfg.field.filter((e) => e.peer).map((e) => {
    const car: Car = { craft: new Craft(), race: new RaceState(), ...livery(e.livery), name: e.name };
    car.craft.mods = addMods(e.mods, speciesMods(e.livery));   // that player's TUNE CAR setup and the species
    car.skin = skinColors(e.skin);
    if (e.skin) carSkin.set(car, e.skin);
    names.set(car, e.name);
    carLivery.set(car, e.livery);
    remotes.set(e.peer!, car);
    return car;
  });
  const pl = mission !== null ? 0 : playerLivery;   // in Story you drive Leopard GP's red 01
  player = { craft: new Craft(), race: new RaceState(), ...livery(pl), name: cfg.playerName };
  player.craft.mods = addMods(cfg.playerMods, speciesMods(pl));
  player.rider = loadRider();
  player.craft.heat = cfg.startHeat;
  player.skin = skinColors(achievements.equipped);
  carSkin.set(player, achievements.equipped);
  touchedWall = false;
  driftCharge = 0;
  jumpsTaken = 0;
  names.set(player, cfg.playerName);
  carLivery.set(player, pl);
  player.race.bestLap = mission !== null || online ? 0 : bestLaps[trackIndex];
  cars = [...rivals.map((r) => r.car), ...humans, player];
  overheatedThisRace = false;
  raceBestLap = 0;
  ghostRec.reset();
  ghostDelta = null;
  ghostLap = trial ? loadGhost(track.name, trackSig(track.pts)) : null;
  ghostCar = ghostLap ? makeGhostCar(ghostLap) : null;

  // Grid: shuffle the AI into the slots; the player goes on pole, at the back, or anywhere.
  const slots = cars.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const want = cfg.grid === 'back' ? cars.length - 1 : cfg.grid === 'pole' ? 0 : -1;
  if (want >= 0) {
    const pi = cars.indexOf(player), holder = slots.indexOf(want);
    [slots[pi], slots[holder]] = [slots[holder], slots[pi]];
  }
  cars.forEach((car, i) => { car.race.index = placeOnGrid(track, car.craft, slots[i]); });

  finishOrder = [];
  finishTimes.clear();
  autopilot = null;
  resultsAt = 0;
  lastCount = COUNTDOWN + 1;
  launchJudged = false;
  drs.clear();
  prevBrake = input.brake;
  launchArmed = false;
  releasedAt = -1;
  aiLaunched = false;
  particles.length = 0;
  goTime = time + COUNTDOWN;
  cam.x = player.craft.pos.x;
  cam.y = player.craft.pos.y;
  keySteer = 0;
}
startRace();   // lines up the grid behind the start screen

/** Track cards for the start screen: each outline scaled into a 120 x 80 box. */
const trackChoices: TrackChoice[] = tracks.map((t, i) => {
  const b = t.bounds, scale = Math.min(110 / (b.maxX - b.minX), 70 / (b.maxY - b.minY));
  const ox = 60 - ((b.minX + b.maxX) / 2) * scale, oy = 40 - ((b.minY + b.maxY) / 2) * scale;
  const outline = t.pts.filter((_, k) => k % 6 === 0)
    .map((p) => `${(p.x * scale + ox).toFixed(1)},${(p.y * scale + oy).toFixed(1)}`).join(' ');
  return { name: TRACKS[i].name, blurb: TRACKS[i].blurb, outline, color: t.theme.wall, sprint: t.sprint ? sprintKm(t) : undefined };
});

const menus = new Menus(LIVERIES, trackChoices, {
  settings: openSettings,
  garage: openGarage,
  equip: equipSkin,
  tutorial() {
    endTutorial();
    trial = false;
    daily = null;
    mission = null;
    season = null;
    menus.setSeason(false);
    raceLaps = 2;
    tutorial = new Tutorial(settings.keys);
    startRound(0);   // Apex Arena
  },
  tune(car) {
    tuneUI.open(carSetup, carPicture(car, true), (s) => { carSetup = s; saveSetup(s); }, () => {});
  },
  online() {
    endTutorial();
    trial = false;
    daily = null;
    menus.hide();
    lobbyUI.showMenu(playerName());
  },
  story() {
    endTutorial();
    trial = false;
    daily = null;
    menus.hide();
    storyUI.open(save);
  },
  start(setup: RaceSetup) {
    endTutorial();
    mission = null;
    playerLivery = setup.car;
    raceLaps = setup.laps;
    trial = setup.trial;
    daily = null;
    season = !trial && setup.races > 1 ? { races: setup.races, round: 0, openingTrack: setup.track, points: new Map() } : null;
    menus.setSeason(!!season);
    startRound(setup.track);
    if (trial) showToast(ghostLap ? `GHOST  ${formatTime(ghostLap.time)}` : 'SET A LAP TO RACE YOUR GHOST', '#e8c25a');
  },
  resume: play,
  restart() {
    if (online?.role === 'host') onlineStart();
    else if (!online) { startRace(); play(); }
  },
  action(act) {
    if (act === 'onesheep') {
      // One Sheep: a race with a single sheep; its own controller runs it through the chase view.
      endTutorial();
      menus.hide();
      oneSheep.open();
      return;
    }
    if (act === 'flock') {
      // Flock Raid: its own view and screens take over until it's left.
      endTutorial();
      menus.hide();
      if (chase) chase.visible = false;
      flock.open();
      return;
    }
    if (act === 'install') installApp();
    if (act === 'daily') openDaily();
    if (act === 'lobby') onlineToLobby();
    if (act === 'leave') leaveOnline();
    if (act === 'next' && season) {
      scoreRound(season);
      season.round++;
      if (online?.role === 'host') onlineRound((season.openingTrack + season.round) % CIRCUITS);
      else startRound((season.openingTrack + season.round) % CIRCUITS);
    }
    if (act === 'newseason' && season) {
      season = { ...season, round: 0, points: new Map() };
      if (online?.role === 'host') onlineRound(season.openingTrack);
      else startRound(season.openingTrack);
    }
  },
  changeCar() {
    if (online) {
      if (online.role === 'host') onlineToLobby();
      else leaveOnline();
      return;
    }
    if (mission !== null) {
      // Leaving a story race: back to the chapter map.
      mission = null;
      mode = 'menu';
      sound.menu();
      input.unlock();
      menus.hide();
      storyUI.open(save);
      return;
    }
    if (daily) {
      daily = null;
      mode = 'menu';
      sound.menu();
      input.unlock();
      menus.showFront();
      return;
    }
    season = null;
    endTutorial();
    menus.setSeason(false);
    mode = 'menu';
    sound.menu();
    input.unlock();
    menus.select(playerLivery);
    menus.selectTrack(trackIndex);
    menus.showStart();
  },
});

/** One Sheep (a race with a single sheep to carry): it runs its own frame while it's open. */

/**
 * A dragon for the sheep modes: every one flies with its species' feel; the player's also carries
 * their TRAIN DRAGON setup, worn skin and rider.
 */
function modeCar(i: number): Car {
  const mine = i === playerLivery;
  const car: Car = { craft: new Craft(), race: new RaceState(), ...livery(i), skin: mine ? skinColors(achievements.equipped) : null };
  car.craft.mods = addMods(mine ? setupMods(carSetup) : { ...NO_MODS }, speciesMods(i));
  if (mine) car.rider = loadRider();
  return car;
}

const oneSheep = new OneSheepMode({
  input, sound, chase, hud: canvas,
  tracks: tracks.filter((t) => !t.sprint),
  makeCar: modeCar,
  playerLivery: () => playerLivery,
  steer: steerAim,
  pixelRatio: () => renderScale,
  onExit: () => { if (chase) chase.visible = view === 'chase'; menus.showFront(); sound.menu(); },
});
/** Flock Raid (the sheep-catching mode): it runs its own frame while a raid is open. */
const flock = new FlockMode({
  input, sound, hud: canvas,
  makeCar: modeCar,
  playerLivery: () => playerLivery,
  steer: steerAim,
  pixelRatio: () => renderScale,
  onExit: () => { if (chase) chase.visible = view === 'chase'; menus.showFront(); sound.menu(); },
});
refreshRecords();

// --- installable app ------------------------------------------------------------------------------
// The service worker (public/sw.js) caches the game for offline play; production builds only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* no offline play */ }); });
}
/** The browser's install prompt, saved until the player presses INSTALL on the front menu. */
let installPrompt: (Event & { prompt(): Promise<void> }) | null = null;
const installBtn = () => document.querySelector<HTMLElement>('[data-act="install"]');
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as Event & { prompt(): Promise<void> };
  installBtn()?.classList.remove('hidden');
});
addEventListener('appinstalled', () => { installPrompt = null; installBtn()?.classList.add('hidden'); });
function installApp(): void {
  const p = installPrompt;
  installPrompt = null;
  installBtn()?.classList.add('hidden');
  p?.prompt().catch(() => { /* dismissed */ });
}

menus.setNewPlayer(!settings.tutorialDone);

/** Set a mission up: its track, laps and field. */
function loadMission(i: number): void {
  const m = MISSIONS[i];
  trial = false;
  daily = null;
  mission = i;
  season = null;
  raceLaps = m.laps;
  trackIndex = TRACKS.findIndex((t) => t.name === m.track);
  track = tracks[trackIndex];
  menus.setSeason(false);
  menus.setStory(true);
}

function storyRace(i: number): void {
  loadMission(i);
  startRound(trackIndex);
  showToast(MISSIONS[i].title, '#b8452f');
}

const storyUI = new StoryUI({
  preview(i) {
    loadMission(i);
    mode = 'menu';
    startRace();
  },
  race: storyRace,
  exit() {
    mode = 'menu';   // stop any finished race in the background from bringing up its results
    storyUI.hide();
    menus.showFront();
  },
  saved(s) {
    save = s;
    writeSave(s);
  },
  tune(back) {
    storyUI.hide();
    tuneUI.open(carSetup, carPicture(0, true), (s) => { carSetup = s; saveSetup(s); }, back);
  },
});

/** Judge a finished story race: goals, points and progress, then hand over to the story screens. */
function finishMission(): void {
  if (mission === null || !save) return;
  const m = MISSIONS[mission];
  const ranked = rankCars();
  const winnerCar = ranked[0];
  const winner = winnerCar === player ? 'player' as const
    : [...whoDrives.entries()].find(([, car]) => car === winnerCar)?.[0] ?? null;
  const outcome = {
    place: ranked.indexOf(player) + 1,
    winner,
    ahead: (who: Speaker) => {
      const car = whoDrives.get(who);
      return !car || ranked.indexOf(player) < ranked.indexOf(car);
    },
    bestLap: raceBestLap,
    overheated: overheatedThisRace,
  };
  const goal = met(m.goal, outcome);
  const beatViggoNow = whoDrives.has('viggo') && outcome.ahead('viggo');
  // The bonus is shown as met or not either way, but only pays out with the main goal.
  const bonus = !!m.bonus && met(m.bonus, outcome);
  const first = !save.done.includes(m.id);
  const share = first ? 1 : REPLAY_SHARE;
  const earned = goal ? Math.round((m.points + (bonus ? m.bonusPoints : 0)) * share) : 0;
  if (goal) {
    save.points += earned;
    if (!save.done.includes(m.id)) save.done.push(m.id);
    if (bonus && !save.bonus.includes(m.id)) save.bonus.push(m.id);
    writeSave(save);
  }
  const index = mission;
  mission = null;
  menus.setStory(false);
  storyUI.finish({ index, success: goal, goal, bonus, earned, first: goal && first, outcome }, save);
  if (beatViggoNow && !(save.flags ?? []).includes('beat-viggo')) {
    save.flags = [...(save.flags ?? []), 'beat-viggo'];
    writeSave(save);
  }
}

/** Load a track and start a race on it (in a season, announce which round it is). */
function startRound(index: number): void {
  trackIndex = index;
  track = tracks[trackIndex];
  startRace();
  play();
  if (season) showToast(`RACE ${season.round + 1} OF ${season.races}  ·  ${TRACKS[trackIndex].name}`, '#e3b26c');
}

function play(): void {
  mode = 'racing';
  sound.unlock();
  sound.race(track.sprint ? 'sprint' : 'race');
  menus.hide();
  input.release();
  input.takePause();   // drop keys pressed while in a menu
  input.clearReset();
  input.lock();
}

function pause(): void {
  if (mode !== 'racing') return;
  if (online) {
    // The race can't stop for one player: just let go of the mouse and show the menu over it.
    if (menus.pauseOpen) return;
    pausedAt = performance.now();
    input.release();
    input.unlock();
    menus.showPause();
    return;
  }
  mode = 'paused';
  pausedAt = performance.now();
  sound.pause();
  input.release();
  input.unlock();
  menus.showPause();
}

// Browsers only allow audio after a click or key press: start the menu music on the first one.
const startAudio = () => {
  sound.unlock();
  removeEventListener('pointerdown', startAudio);
  removeEventListener('keydown', startAudio);
};
addEventListener('pointerdown', startAudio);
addEventListener('keydown', startAudio);

// Losing the mouse lock mid-race (the browser eats the first Esc for this) pauses the game.
input.onUnlock = pause;

// Checked every frame: zoom and display changes alter devicePixelRatio without a resize event.
// The canvas renders at most about 1080p worth of pixels (the browser scales it up to fill bigger
// or high-DPI screens): beyond that the extra pixels cost far more frame time than they add.
const MAX_PIXELS = 2.2e6;
let renderScale = 1;
/**
 * Render resolution on top of that, lowered while racing if frames keep running slow (a weak GPU,
 * or the browser drawing without hardware acceleration). It only goes down; a resize resets it.
 */
const perf = { quality: 1, frames: 0, slow: 0, w: 0, h: 0 };
const QUALITY_MIN = 0.5;
function watchFrameRate(dt: number): void {
  if (innerWidth !== perf.w || innerHeight !== perf.h) { perf.w = innerWidth; perf.h = innerHeight; perf.quality = 1; perf.frames = perf.slow = 0; }
  if (mode !== 'racing' || dt > 0.25) return;   // menus, pauses and tab switches don't count
  perf.frames++;
  if (dt > 1 / 45) perf.slow++;
  if (perf.frames < 90) return;
  // Most of a second and a half under 45 fps: drop the resolution a step.
  if (perf.slow > 45 && perf.quality > QUALITY_MIN) perf.quality = Math.max(QUALITY_MIN, perf.quality * 0.85);
  perf.frames = perf.slow = 0;
}

function fitCanvas(): void {
  const maxPixels = settings.quality === 'low' ? 0.75e6 : settings.quality === 'medium' ? 1.3e6 : MAX_PIXELS;
  const dpr = Math.min(devicePixelRatio || 1, Math.sqrt(maxPixels / (innerWidth * innerHeight))) * perf.quality;
  renderScale = dpr;
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Dev-only handle for poking at game state from the console.
if (import.meta.env.DEV) {
  (window as unknown as { game: object }).game = {
    get player() { return player; }, get rivals() { return rivals; }, get track() { return track; }, get chase() { return chase; }, get flock() { return flock; }, get onesheep() { return oneSheep; },
    get mode() { return mode; },
    /** Let an AI drive the player's car (for testing whole races). */
    autodrive() {
      autopilot = new Driver(0.85, 7);
      autopilot.craft = player.craft;
      autopilot.race = player.race;
    },
    /** Step the simulation by hand (e.g. while the tab is hidden and animation frames are paused). */
    advance(seconds: number) {
      if (online?.role === 'guest') { for (let i = 0; i < Math.max(1, Math.round(seconds / STEP)); i++) guestFrame(STEP); }
      else for (let i = 0; i < Math.round(seconds / STEP) && (mode === 'racing' || mode === 'results'); i++) update(STEP);
      drawFrame(ctx, innerWidth, innerHeight, {
        time, cam, player, cars, track, hud: raceHud(),
        particles, cursor: input.cursor, toast, locked: input.locked,
      });
    },
    get time() { return time; }, get goTime() { return goTime; }, cam,
    get online() { return online; }, pred, get cars() { return cars; }, get hostResults() { return hostResults; }, get season() { return season; },
    get save() { return save; },
    /** Start a story mission directly (skipping its dialogue). */
    mission(i: number) { if (!save) save = { name: 'TEST', points: 0, upgrades: {}, done: [], bonus: [] }; storyUI.hide(); menus.hide(); storyRace(i); },
  };
}

function makeGhostCar(g: GhostLap): Car {
  const car: Car = { craft: new Craft(), race: new RaceState(), ...livery(LIVERIES[g.livery] ? g.livery : 0), name: 'GHOST', ghost: true, skin: skinColors(g.skin) };
  car.race.lapStart = 0;   // hovers like a car under way
  return car;
}

/**
 * Record the player's lap for the ghost. When a lap completes and beats the saved ghost (or there
 * isn't one), it becomes the new ghost; in Time Trial the ghost replays it from the next lap.
 */
function ghostLapStep(lap: 'lap' | 'best' | null): void {
  const pc = player.craft;
  if (lap) {
    const frames = ghostRec.take();
    const t = player.race.lastLap;
    const saved = loadGhost(track.name, trackSig(track.pts));
    ghostDelta = ghostLap ? t - ghostLap.time : null;
    if (trial && ghostDelta !== null && ghostDelta <= -1) achievements.unlock('phantom');
    // A standing-start first lap only becomes the ghost when there's nothing to chase yet.
    if ((player.race.lap > 1 || !saved) && (!saved || t < saved.time - 1e-6) && frames.length >= 6) {
      const g: GhostLap = { time: t, livery: carLivery.get(player) ?? 0, skin: achievements.equipped, frames, sig: trackSig(track.pts), stride: 4 };
      saveGhost(track.name, g);
      if (trial) { ghostLap = g; ghostCar = makeGhostCar(g); }
    }
  }
  ghostRec.step(pc.pos.x, pc.pos.y, pc.heading, pc.alt, 1 / STEP);
}

/** Put the ghost where it was this far into its lap (false before the start or once its lap is over). */
function placeGhost(drawTime: number): boolean {
  if (!ghostCar || !ghostLap || player.race.lapStart < 0 || drawTime < goTime) return false;
  const pose = ghostPose(ghostLap, drawTime - player.race.lapStart);
  if (!pose) return false;
  const c = ghostCar.craft;
  c.pos.x = pose.x; c.pos.y = pose.y; c.heading = pose.heading;
  c.vel.x = pose.vx; c.vel.y = pose.vy;
  c.alt = pose.alt;
  return true;
}

/** Online with CONTACT set to OFF in the lobby: cars pass through each other. */
function noContact(): boolean { return online?.lobby?.contact === false; }

/** DRS opens from lap 2 on a circuit, and after the first 10% of the route on a sprint. */
function drsAllowed(car: Car): boolean {
  if (!track.sprint) return car.race.lap >= DRS_FROM_LAP;
  return car.race.lapStart >= 0 && car.race.lap === 0 && track.fraction(car.race.index) > 0.1;
}

/** How far along a sprint each car is (0 before the start, 1 at the finish), for the HUD strip. */
function sprintDone(car: Car): number {
  if (car.race.lap >= 1) return 1;
  if (car.race.lapStart < 0) return 0;
  return track.fraction(car.race.index);   // 0 on the lead-in and at the start, 1 at the finish
}
function sprintHud(): NonNullable<RaceHud['sprint']> {
  return {
    km: Number(sprintKm(track)),
    cars: cars.map((c) => ({ f: sprintDone(c), color: c.color, me: c === player })),
  };
}

/** The sprint strip under the player (boost pads, charging, cooling, fire), for the HUD cue and its sound. */
let playerStrip: 'boost' | 'charge' | 'cool' | 'fire' | null = null;
let lastPad = 0;
function stripUnderPlayer(): void {
  const c = player.craft;
  const strip = track.strips.length && !finishOrder.includes(player)
    ? track.stripAt(player.race.index, lateral(track, c, player.race.index)) : null;
  playerStrip = strip ? strip.kind : c.pad > 0 ? 'boost' : null;
  if (c.pad > lastPad + 0.05) sound.padBoost();   // a fresh push from a pad
  lastPad = c.pad;
  sound.strip(strip && strip.kind !== 'boost' ? strip.kind : null);
}

/** A craft touching down after a jump: sparks for anyone, and a jolt and a thud for the player. */
function landing(car: Car): void {
  const hit = car.craft.landed;
  if (!hit) return;
  if (hit > 150) emitSparks(car.craft.pos.x, car.craft.pos.y, car.craft);
  if (car === player) {
    jumpsTaken++;
    cam.shake = Math.max(cam.shake, clamp((hit - 200) / 40, 1, 9));   // a normal landing (about 390) is a firm bump
    sound.land(hit);
  }
}

function showToast(text: string, color: string): void { toast = { text, color, t: 1.6 }; }

function ordinal(n: number): string { return ['1ST', '2ND', '3RD'][n - 1] ?? `${n}TH`; }

function update(dt: number): void {
  if (input.takePause()) {
    if (online) { if (menus.pauseOpen) { if (performance.now() - pausedAt > 300) play(); } else pause(); }
    else { pause(); return; }
  }
  time += dt;
  if (input.takeReset() && mode === 'racing' && !online) startRace();
  const racing = time >= goTime;
  if (tutorial) {
    const pc = player.craft;
    tutorial.update({ racing, speed: pc.speed, steer: input.steer, brake: input.brake, deploying: pc.deploying,
      energy: pc.energy, cooling: pc.cooling, lap: player.race.lap }, dt);
    if (tutorial.finished && !achievements.p.unlocked.includes('graduate')) {
      achievements.raceFinished({ track: track.name, place: 1, racers: 1, laps: laps(), online: false, tutorial: true, special: true, touchedWall, driftCharge });
    }
    if (tutorial.finished && !settings.tutorialDone) {
      applySettings({ ...settings, tutorialDone: true });
      menus.setNewPlayer(false);
    }
  }

  // Countdown beeps: 3, 2, 1, then a long one for GO.
  const count = Math.max(0, Math.ceil(goTime - time));
  if (count !== lastCount) {
    if (count <= COUNTDOWN) sound.beep(count === 0);
    lastCount = count;
  }
  judgeLaunches(racing);

  const crafts = cars.map((c) => c.craft);
  for (const c of crafts) c.feelWake(crafts, dt);
  // Rubber band: each place behind the leader is worth +1% pace (none before the start or once finished).
  const ranked = rankCars();
  ranked.forEach((car, place) => {
    car.craft.catchUp = racing && !finishOrder.includes(car) ? Math.min(CATCH_UP_MAX, Math.max(0, place - 1) * CATCH_UP_PER_PLACE) : 0;
  });
  updateDrs(ranked, racing);

  // Player: steered with the keys.
  const pc = player.craft;
  const aim = steerAim(pc, input.brake);
  if (autopilot && racing) {
    const c = autopilot.think(track, time, cars);
    pc.deploy = c.deploy;
    pc.step(dt, c.aim, c.throttle, c.brake);
  } else {
    pc.deploy = racing && input.deploy;
    // The throttle is always on; holding brake slows down (and the gearbox shifts down with it).
    pc.step(dt, racing ? aim : pc.heading, racing && !input.brake, racing && input.brake);
  }
  sound.engine(pc.gear, pc.rev, pc.thrust, clamp(pc.speed / 880, 0, 1));
  sound.gale(racing && pc.deploying);

  for (const { car, driver } of rivals) {
    const c = racing ? driver.think(track, time, cars) : { aim: car.craft.heading, throttle: false, brake: false, deploy: false };
    car.craft.deploy = c.deploy;
    car.craft.step(dt, c.aim, c.throttle, c.brake);
  }
  if (online?.role === 'host') driveRemotes(dt, racing);

  let scraping = 0;
  for (const car of cars) {
    const lap = car.race.update(track, car.craft, time, racing);
    if (lap) car.craft.harvested = 0;   // a fresh ERS harvest allowance each lap
    if (lap && car.race.lap === laps() && !finishOrder.includes(car)) {
      finishOrder.push(car);
      finishTimes.set(car, time - goTime);
      if (car === player) {
        showToast(`FINISHED ${ordinal(finishOrder.length)}`, '#e3b26c');
        sound.crowd(finishOrder.length === 1);
        sound.chime(true);
        if (!online && !tutorial) {
          achievements.raceFinished({ track: track.name, place: finishOrder.length, racers: cars.length, laps: laps(),
            online: false, tutorial: false, special: mission !== null || !!daily, touchedWall, driftCharge,
            sprint: track.sprint, jumpsTaken, jumps: track.jumps.length });
        }
        if (daily) {
          const met = finishOrder.length <= daily.top;
          dailyResult = { met, better: recordDaily(daily.date, met, time - goTime) };
          if (met) achievements.dailyStreak(dailyStatus(daily.date).streak);
        }
        // Hand the car to an AI driver for the cool-down lap.
        autopilot = new Driver(0.6, 9);
        autopilot.craft = player.craft;
        autopilot.race = player.race;
        resultsAt = time + RESULTS_DELAY;
      }
    }
    if (car === player && racing && (!finishOrder.includes(player) || finishTimes.get(player) === time - goTime) && !online && mission === null && !tutorial && !daily) ghostLapStep(lap);
    if (lap && car === player && car.race.lap <= laps() && (raceBestLap === 0 || player.race.lastLap < raceBestLap)) {
      raceBestLap = player.race.lastLap;
    }
    if (car === player && !finishOrder.includes(player) && car.craft.overheated) overheatedThisRace = true;
    if (lap && car === player && !autopilot && car.race.lap < laps()) {
      sound.chime(lap === 'best');
      const vsGhost = ghostDelta === null ? '' : `   ${ghostDelta <= 0 ? '−' : '+'}${Math.abs(ghostDelta).toFixed(2)}`;
      if (lap === 'best') showToast(`BEST LAP  ${formatTime(player.race.lastLap)}${vsGhost}`, '#c77dff');
      else showToast(`LAP  ${formatTime(player.race.lastLap)}${vsGhost}`, '#ffffff');
    }
    const contact = collideWalls(track, car.craft, car.race, dt);
    landing(car);
    if (car === player) stripUnderPlayer();
    if (contact) {
      emitSparks(contact.x, contact.y, car.craft);
      if (car === player) {
        touchedWall = true;
        scraping = clamp(car.craft.speed / 500, 0.25, 1);
        if (contact.impact > 80) cam.shake = Math.min(16, contact.impact / 25);
        if (contact.impact > 120) sound.thud(contact.impact);
      }
    }
  }
  sound.scrape(scraping);
  sound.air(player.craft.airborne && !finishOrder.includes(player) ? player.craft.alt / 90 : 0);
  // A new track record (not in Story, online or the tutorial, where the car or the race differ).
  if (!online && mission === null && !tutorial && !daily && player.race.bestLap > 0
      && (bestLaps[trackIndex] === 0 || player.race.bestLap < bestLaps[trackIndex] - 1e-6)) {
    bestLaps[trackIndex] = player.race.bestLap;
    records[track.name] = player.race.bestLap;
    saveRecords(records);
    refreshRecords();
    achievements.recordSet(track.name);
  }
  heardPasses(dt);
  // The most battery charged by drifting in any one lap (the per-lap harvest count resets each lap).
  driftCharge = Math.max(driftCharge, player.craft.harvested);

  for (let i = 0; i < cars.length && !noContact(); i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const hit = collideCrafts(cars[i].craft, cars[j].craft);
      if (hit > 80 && (cars[i] === player || cars[j] === player)) {
        cam.shake = Math.min(14, hit / 30);
        sound.thud(hit);
      }
    }
  }

  for (const car of cars) {
    car.craft.cooling = inCoolingLane(track, car.craft, car.race.index);
    emitTrail(car.craft, car.hue, speciesFor(car).span);
    emitHeat(car.craft);
  }
  celebrate(dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
  }

  // Camera: lead ahead of the velocity, pull back a little at speed.
  const lead = 0.35;
  const tx = pc.pos.x + pc.vel.x * lead, ty = pc.pos.y + pc.vel.y * lead;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-5 * dt));
  const targetZoom = lerp(1.15, 0.75, clamp(pc.speed / 880, 0, 1));
  cam.zoom = lerp(cam.zoom, targetZoom, 1 - Math.exp(-2 * dt));
  cam.shake = Math.max(0, cam.shake - 40 * dt);

  if (toast) toast.t -= dt;

  if (online?.role === 'host' && online.host.guests > 0) {
    snapClock += dt;
    if (snapClock >= 1 / SNAP_RATE) { snapClock = 0; online.host.send(snapshot()); }
    if (finishOrder.length && time >= resultsSent) {
      resultsSent = time + 0.5;
      online.host.send({ t: 'results', view: resultsView() });
    }
  }

  if (mode === 'racing' && resultsAt && time >= resultsAt) {
    mode = 'results';
    sound.menu();
    input.release();
    input.unlock();
    if (mission !== null) finishMission();
  }
  if (mode === 'results' && time >= resultsRefresh && !storyUI.visible) {
    resultsRefresh = time + 0.25;
    menus.showResults(resultsView());
  }
}

/** Points each car is on course to score in this race (final once everyone has finished). */
function racePoints(): Map<Car, number> {
  return new Map(rankCars().map((car, place) => [car, POINTS[place] ?? 0]));
}

/** Bank this race's points into the season totals. */
function scoreRound(s: Season): void {
  for (const [car, pts] of racePoints()) {
    const name = names.get(car) ?? '';
    s.points.set(name, (s.points.get(name) ?? 0) + pts);
  }
}

/** What the results screen shows: the race, plus the standings and next steps in a season. */
function resultsView(): ResultsView {
  if (season && season.round === season.races - 1 && finishOrder.length === cars.length) {
    const totals = new Map<string, number>();
    for (const [car, pts] of racePoints()) {
      const nm = names.get(car) ?? '';
      totals.set(nm, (season.points.get(nm) ?? 0) + pts);
    }
    const top = Math.max(...totals.values());
    if (totals.get(names.get(player) ?? '') === top) achievements.unlock('champion');
  }
  const rows = resultRows();
  const subtitle = `${TRACKS[trackIndex].name}  ·  ${track.sprint ? `SPRINT · ${sprintKm(track)} KM` : `${raceLaps} ${raceLaps === 1 ? 'LAP' : 'LAPS'}`}`;
  if (online && !season) {
    return {
      title: 'RESULTS', subtitle, rows,
      buttons: [{ act: 'restart', label: 'RACE AGAIN', primary: true }, { act: 'lobby', label: 'BACK TO LOBBY' }],
    };
  }
  if (daily) {
    const st = dailyStatus(daily.date);
    const verdict = !dailyResult ? '' : dailyResult.met ? (dailyResult.better ? 'GOAL MET · NEW BEST TODAY' : 'GOAL MET') : `GOAL MISSED · TOP ${daily.top} NEEDED`;
    return {
      title: 'DAILY CHALLENGE',
      subtitle: `${subtitle}  ·  ${verdict}${st.best ? `  ·  BEST ${formatTime(st.best)}` : ''}${st.streak ? `  ·  ${st.streak}-DAY STREAK` : ''}`,
      rows,
      buttons: [{ act: 'restart', label: 'TRY AGAIN', primary: true }, { act: 'change', label: 'MENU' }],
    };
  }
  if (trial) {
    const g = loadGhost(track.name, trackSig(track.pts));
    return {
      title: 'TIME TRIAL', subtitle: `${subtitle}  ·  BEST ${formatTime(raceBestLap)}${g ? `  ·  GHOST ${formatTime(g.time)}` : ''}`, rows,
      buttons: [{ act: 'restart', label: 'FLY AGAIN', primary: true }, { act: 'change', label: 'CHANGE DRAGON' }],
    };
  }
  if (!season) {
    return {
      title: 'RESULTS', subtitle, rows,
      buttons: [{ act: 'restart', label: 'RACE AGAIN', primary: true }, { act: 'change', label: 'CHANGE DRAGON' }],
    };
  }
  const gained = racePoints();
  for (const [i, car] of rankCars().entries()) rows[i].points = gained.get(car);
  // Standings include this race's points; ties go to whoever finished ahead today.
  const order = rankCars();
  const standings: StandingRow[] = order.map((car) => {
    const name = names.get(car) ?? '';
    return {
      name, color: car.color, player: car === player, gained: gained.get(car) ?? 0,
      points: (season!.points.get(name) ?? 0) + (gained.get(car) ?? 0),
    };
  }).sort((a, b) => b.points - a.points);
  const last = season.round === season.races - 1;
  const settled = finishOrder.length === cars.length;
  const champ = standings[0];
  const nextTrack = TRACKS[(season.openingTrack + season.round + 1) % tracks.length].name;
  return {
    title: last ? 'THE SAGA ENDS' : `RACE ${season.round + 1} OF ${season.races}`,
    subtitle, rows, standings,
    note: last && settled ? (champ.player ? 'YOU ARE THE CHAMPION!' : `${champ.name} WINS THE SEASON`) : undefined,
    buttons: last
      ? [{ act: 'newseason', label: 'NEW SAGA', primary: true }, { act: online ? 'lobby' : 'change', label: online ? 'BACK TO LOBBY' : 'MAIN MENU' }]
      : [{ act: 'next', label: `NEXT: ${nextTrack}`, primary: true }, { act: online ? 'lobby' : 'change', label: online ? 'BACK TO LOBBY' : 'QUIT SAGA' }],
  };
}

/** Race order: finished cars by finishing order, everyone else by distance covered. */
function rankCars(): Car[] {
  return [...cars].sort((a, b) => {
    const fa = finishOrder.indexOf(a), fb = finishOrder.indexOf(b);
    if (fa >= 0 || fb >= 0) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
    return b.race.progress(track) - a.race.progress(track);
  });
}

/** The results table: finish time and gap to the winner, or the lap a car is still on. */
function resultRows(): ResultRow[] {
  const winner = finishTimes.get(finishOrder[0]) ?? 0;
  return rankCars().map((car) => {
    const t = finishTimes.get(car);
    return {
      name: names.get(car) ?? '',
      color: car.color,
      time: t === undefined ? `LAP ${Math.min(car.race.lap + 1, laps())}/${laps()}` : formatTime(t),
      gap: t === undefined ? 'RUNNING' : t === winner ? '' : `+${(t - winner).toFixed(3)}`,
      best: car.race.bestLap ? formatTime(car.race.bestLap) : '-',
      player: car === player,
    };
  });
}

/**
 * DRS. On entering a zone, a car earns DRS if it's within DRS_GAP seconds of the car directly
 * ahead (from lap 2). The wing stays open to the end of the zone, or until it brakes.
 */
function updateDrs(ranked: Car[], racing: boolean): void {
  ranked.forEach((car, place) => {
    const st = drs.get(car) ?? { zone: -1, earned: false };
    const zone = racing ? track.drsZoneAt(car.race.index) : -1;
    if (zone !== st.zone) {
      const ahead = ranked[place - 1];
      const gap = ahead ? car.race.gapBehind(ahead.race, track, time) : NaN;
      st.earned = zone >= 0 && drsAllowed(car) && !finishOrder.includes(car) && gap < DRS_GAP;
      st.zone = zone;
      if (st.earned && car === player) showToast('TAILWIND', '#8fd0e0');
    }
    if (car.craft.braking) st.earned = false;
    car.craft.drsOpen = st.earned && zone >= 0;
    drs.set(car, st);
  });
}

/** Time gap from the player to the cars just ahead and behind, for the HUD. */
function gaps(ranked: Car[]): Pick<RaceHud, 'ahead' | 'behind'> {
  const i = ranked.indexOf(player);
  const tag = (car: Car | undefined, gap: number) =>
    car && Number.isFinite(gap) ? { name: car.name, color: car.color, gap } : null;
  const ahead = ranked[i - 1], behind = ranked[i + 1];
  return {
    ahead: tag(ahead, ahead ? player.race.gapBehind(ahead.race, track, time) : NaN),
    behind: tag(behind, behind ? behind.race.gapBehind(player.race, track, time) : NaN),
  };
}

/** The best lap on each track card. */
function refreshRecords(): void {
  menus.setRecords(TRACKS.map((_, i) => (bestLaps[i] ? formatTime(bestLaps[i]) : '')));
}

/**
 * Cars going past the player: when one changes from behind to ahead (or the other way) close by,
 * play a pass-by whoosh on that side. One per car per second at most.
 */
const passState = new Map<Car, { ahead: boolean; quietUntil: number }>();
function heardPasses(dt: number): void {
  void dt;
  if (time < goTime || finishOrder.includes(player)) { passState.clear(); return; }
  const pc = player.craft, mine = player.race.progress(track);
  const rx = -Math.sin(pc.heading), ry = Math.cos(pc.heading);   // the player's right-hand side
  for (const car of cars) {
    if (car === player) continue;
    const ahead = car.race.progress(track) > mine;
    const st = passState.get(car);
    passState.set(car, { ahead, quietUntil: st?.quietUntil ?? 0 });
    if (!st || st.ahead === ahead || time < st.quietUntil) continue;
    const dx = car.craft.pos.x - pc.pos.x, dy = car.craft.pos.y - pc.pos.y;
    if (Math.hypot(dx, dy) > 260) continue;
    const closing = Math.hypot(car.craft.vel.x - pc.vel.x, car.craft.vel.y - pc.vel.y);
    if (closing < 70) continue;   // just running side by side, not a real pass
    sound.passBy(closing, Math.sign(dx * rx + dy * ry) || 1);
    passState.set(car, { ahead, quietUntil: time + 1 });
  }
}

function raceHud(): RaceHud {
  const ranked = rankCars();
  const left = goTime - time;
  const countdown = mode === 'menu' ? null : left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'FLY!' : null;
  const launchHint = mode !== 'menu' && left > 0;
  const place = finishOrder.indexOf(player);
  const banner = place < 0 || mode === 'results' ? null : place === 0 ? 'YOU WIN!' : `FINISHED ${ordinal(place + 1)}`;
  return {
    position: ranked.indexOf(player) + 1, racers: cars.length, laps: laps(), countdown, banner,
    catchUp: player.craft.catchUp, launchHint,
    ...(mode === 'racing' || mode === 'paused' ? gaps(ranked) : { ahead: null, behind: null }),
    drsAvailable: drsAllowed(player),
    sprint: track.sprint ? sprintHud() : undefined,
    strip: mode === 'racing' ? playerStrip ?? undefined : undefined,
    restart: online || mode !== 'racing' ? 0 : input.resetProgress(),
  };
}

/**
 * Turbo start, clutch-style: hold the brake through the countdown and let go right on GO for a
 * perfect launch. Letting go too early is a jump start and stalls; never holding it is a normal
 * start. The AI roll their own starts at GO.
 */
function judgeLaunches(racing: boolean): void {
  const released = !input.brake && prevBrake;
  prevBrake = input.brake;
  if (!launchJudged) {
    if (!racing && input.brake) launchArmed = true;
    if (released) releasedAt = time;
    if (racing) {
      const sinceGo = time - goTime;
      let result: 'perfect' | 'stall' | 'normal' | null = null;
      if (!launchArmed) result = 'normal';
      else if (releasedAt >= 0 && releasedAt < goTime - LAUNCH_EARLY) result = 'stall';
      else if (releasedAt >= goTime - LAUNCH_EARLY && releasedAt <= goTime + LAUNCH_LATE) result = 'perfect';
      else if (sinceGo > LAUNCH_LATE) result = 'normal';
      if (result) {
        launchJudged = true;
        if (result === 'perfect') {
          player.craft.launch = LAUNCH_TIME;
          showToast('PERFECT LEAP!', '#e3b26c');
          achievements.unlock('perfect-launch');
        } else if (result === 'stall') {
          player.craft.stall = STALL_TIME;
          showToast('TOO EARLY - YOUR DRAGON BALKS', '#d9822b');
        }
      }
    }
  }
  if (racing && !aiLaunched) {
    aiLaunched = true;
    for (const { car, driver } of rivals) {
      const roll = driver.rollLaunch();
      if (roll === 'perfect') car.craft.launch = LAUNCH_TIME;
      if (roll === 'stall') car.craft.stall = STALL_TIME;
    }
  }
}

/** Smoke puffs off a craft running hot; thicker and redder as it nears overheating. */
function emitHeat(craft: Craft): void {
  if (craft.cooling && craft.heat > 0.02) {
    // Blue vapor boiling off while the lane pulls the heat out.
    particles.push({
      x: craft.pos.x + (Math.random() - 0.5) * 30,
      y: craft.pos.y + (Math.random() - 0.5) * 30,
      vx: -craft.vel.x * 0.25 + (Math.random() - 0.5) * 50,
      vy: -craft.vel.y * 0.25 + (Math.random() - 0.5) * 50,
      life: 0.6, max: 0.6, hue: 195, size: 5 + craft.heat * 5,
    });
    return;
  }
  if (craft.heat < 0.5 || Math.random() > craft.heat * 0.6) return;
  const hot = craft.overheated ? 1 : (craft.heat - 0.5) / 0.5;
  particles.push({
    x: craft.pos.x + (Math.random() - 0.5) * 20,
    y: craft.pos.y + (Math.random() - 0.5) * 20,
    vx: -craft.vel.x * 0.1 + (Math.random() - 0.5) * 40,
    vy: -craft.vel.y * 0.1 + (Math.random() - 0.5) * 40 - 30,
    life: 0.7, max: 0.7, hue: lerp(40, 5, hot), size: 6 + hot * 6,
  });
}

/** Fireworks go off from the last stretch of the final lap until the results screen. */
const FIREWORK_STRETCH = 0.85;   // fraction of the final lap after which they start
const FIREWORK_RATE = 2.5;       // bursts per second
let fireworkClock = 0;

function celebrate(dt: number): void {
  const r = player.race;
  const finished = finishOrder.includes(player);
  // Distance raced, in laps (the grid counts as just before 0, not the end of a lap).
  const lastStretch = track.open ? r.lap === 0 && track.fraction(r.index) > 0.93
    : r.progress(track) / track.length > laps() - 1 + FIREWORK_STRETCH;
  if (!(lastStretch || (finished && mode === 'racing'))) return;
  fireworkClock += dt;
  if (fireworkClock < 1 / FIREWORK_RATE) return;
  fireworkClock = 0;
  // Somewhere on screen, but off the track so the bursts never hide the racing line.
  const viewW = innerWidth / cam.zoom, viewH = innerHeight / cam.zoom;
  for (let tries = 0; tries < 8; tries++) {
    const x = cam.x + (Math.random() - 0.5) * viewW * 0.85;
    const y = cam.y + (Math.random() - 0.5) * viewH * 0.85;
    if (track.nearest({ x, y }, r.index).dist < WALL_DIST + 90) continue;
    burst(x, y);
    sound.pop();
    return;
  }
}

/** One firework: a ring of sparks in one or two colors, with a white flash at the heart. */
function burst(x: number, y: number): void {
  const hue = Math.random() * 360, hue2 = Math.random() < 0.5 ? hue : (hue + 120) % 360;
  const n = 64;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.1;
    const v = 520 + Math.random() * 320;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 1 + Math.random() * 0.5, max: 1.5, hue: k % 2 ? hue : hue2, size: 5 + Math.random() * 3,
    });
  }
  for (let k = 0; k < 8; k++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.4, max: 0.4, hue: 50, size: 30 });
  }
}

/** Orange sparks thrown back along the wall while a craft grinds against it. */
function emitSparks(x: number, y: number, craft: Craft): void {
  if (craft.speed < 40) return;
  for (let k = 0; k < 3; k++) {
    particles.push({
      x, y,
      vx: craft.vel.x * 0.35 + (Math.random() - 0.5) * 160,
      vy: craft.vel.y * 0.35 + (Math.random() - 0.5) * 160,
      life: 0.35, max: 0.35, hue: 30 + Math.random() * 25, size: 2 + Math.random() * 2,
    });
  }
}

/** Vapour streaming off a dragon's wingtips at speed: faint on a straight, stronger in a sliding turn. */
function emitTrail(craft: Craft, baseHue: number, span = 64): void {
  if (craft.speed < 320) return;
  const slip = Math.abs(craft.slip);
  if (Math.random() > 0.35 + clamp(slip / 0.5, 0, 0.65)) return;
  const fx = Math.cos(craft.heading), fy = Math.sin(craft.heading);
  const hue = lerp(baseHue, 40, 0.5);   // warm mist off the wingtips
  for (const side of [-span * 0.95, span * 0.95]) {
    const x = craft.pos.x - fx * 12 - fy * side;
    const y = craft.pos.y - fy * 12 + fx * side;
    particles.push({
      x, y,
      vx: -fx * 40 + (Math.random() - 0.5) * 16,
      vy: -fy * 40 + (Math.random() - 0.5) * 16,
      life: 0.45, max: 0.45, hue, size: 2.5 + slip * 6,
    });
  }
}
void NOZZLE_BACK; void NOZZLE_SIDE;
dragonEvents.playerBeat = (k) => { if (mode === 'racing') sound.wingbeat(k); };


// --- online play --------------------------------------------------------------------------------

/** The name to offer on the online screen: last one used, else the Story name. */
function playerName(): string {
  try { return localStorage.getItem('skyfold-name') ?? save?.name ?? 'RIDER'; } catch { return save?.name ?? 'RIDER'; }
}

const lobbyUI = new LobbyUI(LIVERIES, trackChoices, {
  garage: openGarage,
  equip: equipSkin,
  host: startHosting,
  join: startJoining,
  pickCar(car) {
    if (!online) return;
    if (online.role === 'host') {
      if (online.lobby.players.some((p, i) => i > 0 && p.car === car)) return;
      online.lobby.players[0].car = car;
      broadcastLobby();
    } else online.guest.send({ t: 'car', car });
  },
  setTrack(t) { if (online?.role === 'host') { online.lobby.track = t; broadcastLobby(); } },
  setLaps(n) { if (online?.role === 'host') { online.lobby.laps = n; broadcastLobby(); } },
  setAi(n) { if (online?.role === 'host') { online.lobby.ai = n; broadcastLobby(); } },
  setContact(on) { if (online?.role === 'host') { online.lobby.contact = on; broadcastLobby(); } },
  setRaces(n) { if (online?.role === 'host') { online.lobby.races = n; broadcastLobby(); } },
  start: onlineStart,
  leave: () => leaveOnline(),
  tune() {
    const o = online;
    const car = o?.role === 'host' ? o.lobby.players[0].car
      : o?.role === 'guest' ? o.lobby?.players.find((p) => p.id === o.me)?.car ?? playerLivery : playerLivery;
    tuneUI.open(carSetup, carPicture(car, true), (s) => {
      carSetup = s;
      saveSetup(s);
      if (online?.role === 'guest') online.guest.send({ t: 'setup', setup: s });
      else broadcastLobby();
    }, () => {});
  },
});

function rememberName(name: string): void {
  try { localStorage.setItem('skyfold-name', name); } catch { /* not kept */ }
}

/** The first car nobody in the lobby has. */
function freeCar(lb: LobbyState, want: number): number {
  const taken = new Set(lb.players.map((p) => p.car));
  if (!taken.has(want)) return want;
  return LIVERIES.findIndex((_, i) => !taken.has(i));
}

function startHosting(name: string): void {
  rememberName(name);
  const host = new Host();
  const lobby: LobbyState = { players: [{ id: 'host', name, car: playerLivery }], track: trackIndex, laps: 3, ai: 5, races: 1 };   // AI fill the grid to 6 cars by default
  online = { role: 'host', host, code: host.code, lobby };
  lobbyUI.showStatus('Calling the moot…');
  host.onReady = () => broadcastLobby();
  host.onError = (msg) => leaveOnline(msg);
  host.onSetup = (id, setup) => {
    if (online?.role !== 'host') return;
    const p = online.lobby.players.find((q) => q.id === id);
    if (p) p.setup = sanitize(setup);
    broadcastLobby();
  };
  host.onSkin = (id, skin) => {
    if (online?.role !== 'host') return;
    const p = online.lobby.players.find((q) => q.id === id);
    if (p) { p.skin = skin; broadcastLobby(); }
  };
  host.onJoin = (id, pname, car, setup, skin) => {
    if (online?.role !== 'host') return;
    online.lobby.players.push({ id, name: pname.slice(0, 12), car: freeCar(online.lobby, car), setup: sanitize(setup), skin });
    broadcastLobby();
    showToast(`${pname} JOINED`, '#7dffb0');
  };
  host.onCar = (id, car) => {
    if (online?.role !== 'host') return;
    const p = online.lobby.players.find((q) => q.id === id);
    if (p && !online.lobby.players.some((q) => q !== p && q.car === car)) { p.car = car; broadcastLobby(); }
  };
  host.onLeave = (id) => {
    if (online?.role !== 'host') return;
    const p = online.lobby.players.find((q) => q.id === id);
    online.lobby.players = online.lobby.players.filter((q) => q.id !== id);
    // Mid-race, an AI takes over their car.
    const car = remotes.get(id);
    if (car) {
      remotes.delete(id);
      const d = new Driver(0.85, 40);
      d.craft = car.craft;
      d.race = car.race;
      rivals.push({ car, driver: d });
    }
    if (p) showToast(`${p.name} LEFT`, '#ffb02e');
    broadcastLobby();
  };
}

/** Everyone gets the lobby (each told which player they are); the host sees it too if it's up. */
function broadcastLobby(): void {
  if (online?.role !== 'host') return;
  online.lobby.players[0].setup = carSetup;   // so everyone sees the host's handling too
  online.lobby.players[0].skin = achievements.equipped;
  checkMyBoard(online.lobby, online.lobby.players[0].name);
  for (const p of online.lobby.players.slice(1)) online.host.send({ t: 'lobby', lobby: online.lobby, you: p.id }, p.id);
  if (mode === 'menu') lobbyUI.showLobby(online.lobby, 'host', true, online.code);
}

function startJoining(code: string, name: string): void {
  rememberName(name);
  const guest = new Guest(code, name, playerLivery, carSetup, achievements.equipped);
  online = { role: 'guest', guest, code, me: '', lobby: null, snaps: [], offset: null, finishedAt: 0, inRace: false };
  lobbyUI.showStatus(`Joining moot ${code}…`);
  guest.onError = (msg) => leaveOnline(msg);
  guest.onClose = () => leaveOnline('The host ended the moot.');
  guest.onMessage = (m) => {
    if (online?.role !== 'guest') return;
    if (m.t === 'lobby') {
      online.lobby = m.lobby;
      online.me = m.you;
      checkMyBoard(m.lobby, m.lobby.players.find((p) => p.id === m.you)?.name ?? '');
      if (!online.inRace) lobbyUI.showLobby(m.lobby, m.you, false, online.code);
    } else if (m.t === 'start') {
      guestStart(m.track, m.laps, m.entrants);
      hostResults = null;
      if (m.title) showToast(m.title, '#e3b26c');
    } else if (m.t === 'snap') {
      const g = online;
      g.snaps.push(m);
      const mine = cars.indexOf(player);
      const own = m.own?.[g.me];
      if (own && mine >= 0 && !m.finish.includes(mine)) reconcile(own, m.cars[mine].idx);
      if (g.snaps.length > 30) g.snaps.shift();
      // Host clock = local clock + offset; follow it smoothly.
      const sample = m.time - performance.now() / 1000;
      g.offset = g.offset === null ? sample : g.offset + (sample - g.offset) * 0.1;
    } else if (m.t === 'results') {
      hostResults = {
        ...m.view,
        // In a season the guest sees the same standings, but only the host moves things on.
        rows: m.view.rows.map((r) => ({ ...r, player: r.name === player.name })),
        standings: m.view.standings?.map((s) => ({ ...s, player: s.name === player.name })),
        note: m.view.note ?? 'WAITING FOR THE HOST…',
        buttons: [{ act: 'leave', label: 'LEAVE' }],
      };
    } else if (m.t === 'toLobby') {
      online.inRace = false;
      mode = 'menu';
      sound.menu();
      input.unlock();
      menus.hide();
      if (online.lobby) lobbyUI.showLobby(online.lobby, online.me, false, online.code);
    }
  };
}

/** Host: start from the lobby: a single race, or round 1 of a season. */
/** Host: a race has run since the leaderboard was last updated. */
let sessionRaceOpen = false;

/**
 * Host: add the race just run to the session leaderboard (every human in it: races, wins,
 * podiums, points, best lap and this race's place). Called when moving on from a race.
 */
function recordSessionRace(): void {
  if (online?.role !== 'host' || !sessionRaceOpen) return;
  sessionRaceOpen = false;
  const ranked = rankCars();
  const board: BoardRow[] = online.lobby.board ?? (online.lobby.board = []);
  for (const car of [player, ...remotes.values()]) {
    const name = names.get(car) ?? '';
    if (!name) continue;
    let row = board.find((r) => r.name === name);
    if (!row) board.push(row = { name, races: 0, wins: 0, podiums: 0, points: 0, best: 0, last: 0 });
    const place = ranked.indexOf(car) + 1;
    row.races++;
    if (place === 1) row.wins++;
    if (place <= 3) row.podiums++;
    row.points += POINTS[place - 1] ?? 0;
    if (car.race.bestLap > 0 && (row.best === 0 || car.race.bestLap < row.best)) row.best = car.race.bestLap;
    row.last = place;
  }
  // Share it straight away (mid-season too), so every player's own online record stays exact.
  broadcastLobby();
}

/**
 * Everyone (host and guests): when my line on the leaderboard gains a race, that was a race I
 * finished online: update my own online record and check the online achievements.
 */
let myBoardRaces = -1;
function checkMyBoard(lobby: LobbyState, myName: string): void {
  const row = lobby.board?.find((r) => r.name === myName);
  const races = row?.races ?? 0;
  if (myBoardRaces < 0) { myBoardRaces = races; return; }   // first look at this lobby
  if (row && races > myBoardRaces) {
    achievements.onlineRace(row.last);
    achievements.raceFinished({ track: TRACKS[lobby.track].name, place: row.last, racers: Math.max(2, lobby.players.length), laps: lobby.laps,
      online: true, tutorial: false, special: true, touchedWall: true, driftCharge: 0 });
  }
  myBoardRaces = races;
}

function onlineStart(): void {
  if (online?.role !== 'host') return;
  recordSessionRace();
  const lb = online.lobby;
  season = lb.races > 1 ? { races: lb.races, round: 0, openingTrack: lb.track, points: new Map() } : null;
  onlineRound(lb.track);
}

/** Host: race on a track with everyone in the lobby (a season round, or a single race). */
function onlineRound(trackNo: number): void {
  if (online?.role !== 'host') return;
  recordSessionRace();
  const lb = online.lobby;
  mission = null;
  playerLivery = lb.players[0].car;
  trackIndex = trackNo;
  track = tracks[trackIndex];
  raceLaps = lb.laps;
  menus.setSeason(false);
  menus.setOnline('host');
  startRace();
  const title = season ? `RACE ${season.round + 1} OF ${season.races}  ·  ${TRACKS[trackIndex].name}` : undefined;
  const peerOf = new Map([...remotes].map(([id, car]) => [car, id]));
  const entrants: NetEntrant[] = cars.map((c) => ({
    name: names.get(c) ?? '', livery: carLivery.get(c) ?? 0, peer: c === player ? 'host' : peerOf.get(c) ?? null, skin: carSkin.get(c),
  }));
  sessionRaceOpen = true;
  online.host.send({ t: 'start', track: trackIndex, laps: laps(), entrants, title });
  lobbyUI.hide();
  play();
  if (title) showToast(title, '#e3b26c');
}

/** Host: everyone back to the lobby. */
function onlineToLobby(): void {
  if (online?.role !== 'host') return;
  recordSessionRace();
  season = null;
  online.host.send({ t: 'toLobby' });
  mode = 'menu';
  sound.menu();
  input.unlock();
  menus.hide();
  broadcastLobby();
}

function leaveOnline(message?: string): void {
  myBoardRaces = -1;
  if (!online) return;
  if (online.role === 'host') online.host.close(); else online.guest.close();
  online = null;
  remotes.clear();
  remoteAuto.clear();
  menus.setOnline(null);
  mode = 'menu';
  sound.menu();
  input.unlock();
  menus.hide();
  if (message) lobbyUI.showMenu(playerName(), message);
  else { lobbyUI.hide(); menus.showFront(); }
}

/** Host: steer each guest's car from the controls they sent (an AI brings it home after the flag). */

function driveRemotes(dt: number, racing: boolean): void {
  if (online?.role !== 'host') return;
  for (const [peer, car] of remotes) {
    const auto = remoteAuto.get(car) ?? (finishOrder.includes(car) ? newAuto(car) : null);
    if (auto && racing) {
      const c = auto.think(track, time, cars);
      car.craft.deploy = c.deploy;
      car.craft.step(dt, c.aim, c.throttle, c.brake);
      continue;
    }
    const next = online.host.nextInput(peer);
    if (next) lastControls.set(peer, next);
    const inp = lastControls.get(peer) ?? { seq: 0, aim: car.craft.heading, brake: false, deploy: false };
    judgeRemoteLaunch(peer, car, inp.brake, racing);
    car.craft.deploy = racing && inp.deploy;
    car.craft.step(dt, racing ? inp.aim : car.craft.heading, racing && !inp.brake, racing && inp.brake);
  }
}

function newAuto(car: Car): Driver {
  const d = new Driver(0.6, 77);
  d.craft = car.craft;
  d.race = car.race;
  remoteAuto.set(car, d);
  return d;
}

/** The same clutch-style turbo start as the host's own, judged from a guest's brake. */
function judgeRemoteLaunch(peer: string, car: Car, brake: boolean, racing: boolean): void {
  const st = remoteLaunch.get(peer) ?? { prev: brake, armed: false, released: -1, judged: false };
  remoteLaunch.set(peer, st);
  if (st.judged) return;
  if (!brake && st.prev) st.released = time;
  st.prev = brake;
  if (!racing && brake) st.armed = true;
  if (!racing) return;
  let r: 'perfect' | 'stall' | 'normal' | null = null;
  if (!st.armed) r = 'normal';
  else if (st.released >= 0 && st.released < goTime - LAUNCH_EARLY) r = 'stall';
  else if (st.released >= goTime - LAUNCH_EARLY && st.released <= goTime + LAUNCH_LATE) r = 'perfect';
  else if (time - goTime > LAUNCH_LATE) r = 'normal';
  if (!r) return;
  st.judged = true;
  if (r === 'perfect') car.craft.launch = LAUNCH_TIME;
  if (r === 'stall') car.craft.stall = STALL_TIME;
}

/** Host: every car's state, rounded to keep the message small. */
function snapshot(): Snapshot {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    t: 'snap', time: r3(time), goTime: r3(goTime),
    cars: cars.map((c): CarSnap => ({
      x: r1(c.craft.pos.x), y: r1(c.craft.pos.y), h: r3(c.craft.heading), vx: r1(c.craft.vel.x), vy: r1(c.craft.vel.y),
      gear: c.craft.gear, rev: 0, thrust: r3(c.craft.thrust), heat: r3(c.craft.heat), over: c.craft.overheated,
      energy: r3(c.craft.energy), dep: c.craft.deploying, slip: r3(c.craft.slipstream), drs: c.craft.drsOpen,
      cool: c.craft.cooling, carve: Math.round(c.craft.carving * 100) / 100, alt: r1(c.craft.alt),
      lap: c.race.lap, idx: c.race.index, next: c.race.nextSector, lapStart: r3(c.race.lapStart), last: r3(c.race.lastLap), best: r3(c.race.bestLap),
    })),
    finish: finishOrder.map((c) => cars.indexOf(c)),
    times: cars.map((c) => finishTimes.get(c) ?? -1),
    own: Object.fromEntries([...remotes].map(([peer, car]) => [peer, { seq: lastControls.get(peer)?.seq ?? 0, s: car.craft.getState() }])),
  };
}

/** Guest: the host started a race. Set up the cars to mirror (no physics runs here). */
function guestStart(trackNo: number, laps: number, entrants: NetEntrant[]): void {
  if (online?.role !== 'guest') return;
  mission = null;
  season = null;
  trackIndex = trackNo;
  track = tracks[trackIndex];
  raceLaps = laps;
  names.clear();
  carLivery.clear();
  rivals = [];
  cars = entrants.map((e) => {
    const car: Car = { craft: new Craft(), race: new RaceState(), ...livery(e.livery), name: e.name, skin: skinColors(e.skin) };
    names.set(car, e.name);
    carLivery.set(car, e.livery);
    return car;
  });
  player = cars[Math.max(0, entrants.findIndex((e) => e.peer === (online as { me: string }).me))];
  player.craft.mods = addMods(setupMods(carSetup), speciesMods(carLivery.get(player) ?? 0));
  player.rider = loadRider();
  finishOrder = [];
  finishTimes.clear();
  particles.length = 0;
  online.snaps = [];
  online.offset = null;
  online.finishedAt = 0;
  online.inRace = true;
  pred.ready = false;
  pred.seq = 0;
  pred.history = [];
  pred.race = new RaceState();
  pred.errX = pred.errY = 0;
  pred.acc = 0;
  lastCount = COUNTDOWN + 1;
  launchJudged = false;
  prevBrake = input.brake;
  launchArmed = false;
  releasedAt = -1;
  menus.setSeason(false);
  menus.setOnline('guest');
  lobbyUI.hide();
  play();
}

/** Guest: show the race as the host sees it, smoothed between snapshots; send our controls. */
function guestFrame(dt: number): void {
  if (online?.role !== 'guest' || !online.snaps.length || online.offset === null) return;
  const g = online;
  const renderT = performance.now() / 1000 + g.offset! - INTERP_DELAY;
  let s0 = g.snaps[0], s1 = g.snaps[g.snaps.length - 1];
  for (let i = 0; i < g.snaps.length - 1; i++) {
    if (g.snaps[i].time <= renderT && g.snaps[i + 1].time >= renderT) { s0 = g.snaps[i]; s1 = g.snaps[i + 1]; break; }
  }
  const span = s1.time - s0.time;
  const a = span > 0 ? clamp((renderT - s0.time) / span, 0, 1) : 1;
  time = lerp(s0.time, s1.time, a);
  goTime = s1.goTime;
  const mine = cars.indexOf(player);
  const done = s1.finish.includes(mine);
  if (done) pred.ready = false;   // the host's autopilot brings us home; just show it
  cars.forEach((car, i) => applySnap(car, s0.cars[i], s1.cars[i], a, car === player && pred.ready));
  finishOrder = s1.finish.map((i) => cars[i]).filter(Boolean);
  finishTimes.clear();
  s1.times.forEach((t, i) => { if (t >= 0) finishTimes.set(cars[i], t); });
  const ahead = INTERP_DELAY + GHOST_LATENCY;
  ghosts = cars.filter((c) => c !== player).map((c) => {
    const g = new Craft();
    g.pos = { x: c.craft.pos.x + c.craft.vel.x * ahead, y: c.craft.pos.y + c.craft.vel.y * ahead };
    g.vel = { x: c.craft.vel.x, y: c.craft.vel.y };
    g.heading = c.craft.heading;
    return g;
  });

  const racing = time >= goTime;
  const count = Math.max(0, Math.ceil(goTime - time));
  if (count !== lastCount) { if (count <= COUNTDOWN) sound.beep(count === 0); lastCount = count; }
  judgeLaunches(racing);   // just for the PERFECT START / JUMP START message; the host decides the real thing

  // Our controls at the physics rate; each one also moves our predicted car straight away.
  const pc = player.craft;
  const steering = mode === 'racing' && !menus.pauseOpen;
  // Racing by the host's clock as of now (not the smoothed, slightly older one the others are drawn at).
  const hostNow = performance.now() / 1000 + g.offset!;
  pred.acc += dt;
  while (pred.acc >= STEP) {
    pred.acc -= STEP;
    const c: Controls = { seq: ++pred.seq, aim: steering ? steerAim(pc, input.brake) : pc.heading, brake: steering && input.brake, deploy: steering && input.deploy };
    g.guest.send({ t: 'input', ...c });
    if (pred.ready) {
      const racingNow = hostNow >= goTime;
      pred.history.push({ c, racing: racingNow });
      if (pred.history.length > 120) pred.history.shift();
      predictStep(c, racingNow);
    }
  }
  const fade = Math.exp(-12 * dt);
  pred.errX *= fade;
  pred.errY *= fade;
  if (input.takePause()) { if (menus.pauseOpen) { if (performance.now() - pausedAt > 300) play(); } else pause(); }

  sound.engine(pc.gear, pc.rev, pc.thrust, clamp(pc.speed / 880, 0, 1));
  sound.gale(racing && pc.deploying);
  for (const car of cars) { emitTrail(car.craft, car.hue); emitHeat(car.craft); }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
  }
  const lead = 0.35;
  cam.x = lerp(cam.x, pc.pos.x + pc.vel.x * lead, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, pc.pos.y + pc.vel.y * lead, 1 - Math.exp(-5 * dt));
  cam.zoom = lerp(cam.zoom, lerp(1.15, 0.75, clamp(pc.speed / 880, 0, 1)), 1 - Math.exp(-2 * dt));
  if (toast) toast.t -= dt;

  // Our finish: the results table a moment later (kept up to date while the others finish).
  if (finishOrder.includes(player) && !g.finishedAt) {
    g.finishedAt = time;
    showToast(`FINISHED ${ordinal(finishOrder.indexOf(player) + 1)}`, '#e3b26c');
    sound.chime(true);
  }
  if (g.finishedAt && time >= g.finishedAt + RESULTS_DELAY) {
    if (mode === 'racing') { mode = 'results'; sound.menu(); input.release(); input.unlock(); }
    if (time >= resultsRefresh) { resultsRefresh = time + 0.25; if (hostResults) menus.showResults(hostResults); }
  }
}

/** One physics step of our own car, as the host will run it (walls included; other cars aren't). */
function predictStep(c: Controls, racing: boolean): void {
  const pc = player.craft;
  pc.feelWake([...ghosts, pc], STEP);
  pc.deploy = racing && c.deploy;
  pc.step(STEP, racing ? c.aim : pc.heading, racing && !c.brake, racing && c.brake);
  if (pred.race.update(track, pc, 0, racing)) pc.harvested = 0;
  collideWalls(track, pc, pred.race, STEP);
  if (!noContact()) for (const g of ghosts) bumpOff(pc, g);
  pc.cooling = inCoolingLane(track, pc, pred.race.index);
}

/** Guest: a snapshot arrived with the host's version of our car. Reset to it and replay what's newer. */
function reconcile(own: { seq: number; s: import('./craft').CraftState }, idx: number): void {
  const pc = player.craft;
  const shownX = pc.pos.x + pred.errX, shownY = pc.pos.y + pred.errY;
  pc.setState(own.s);
  pred.race.index = idx;
  if (!pred.ready) {
    pred.ready = true;
    pred.history = [];
    pred.errX = pred.errY = 0;
    return;
  }
  pred.history = pred.history.filter((h) => h.c.seq > own.seq);
  for (const h of pred.history) predictStep(h.c, h.racing);
  // Blend the difference in rather than jump, unless it's big (a crash we didn't see coming).
  const ex = shownX - pc.pos.x, ey = shownY - pc.pos.y;
  if (import.meta.env.DEV) { pred.corrections.push(Math.hypot(ex, ey)); if (pred.corrections.length > 2000) pred.corrections.shift(); }
  if (Math.hypot(ex, ey) > SNAP_CORRECTION) { pred.errX = pred.errY = 0; }
  else { pred.errX = ex; pred.errY = ey; }
}

function applySnap(car: Car, a: CarSnap, b: CarSnap, t: number, raceOnly = false): void {
  const c = car.craft, r = car.race;
  r.lap = b.lap; r.index = b.idx; r.nextSector = b.next; r.lapStart = b.lapStart; r.lastLap = b.last; r.bestLap = b.best;
  if (raceOnly) return;
  c.pos.x = lerp(a.x, b.x, t);
  c.pos.y = lerp(a.y, b.y, t);
  let dh = b.h - a.h;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  c.heading = a.h + dh * t;
  c.vel.x = lerp(a.vx, b.vx, t);
  c.vel.y = lerp(a.vy, b.vy, t);
  c.alt = lerp(a.alt ?? 0, b.alt ?? 0, t);
  c.gear = b.gear; c.thrust = b.thrust; c.heat = b.heat; c.overheated = b.over; c.energy = b.energy;
  c.deploying = b.dep; c.slipstream = b.slip; c.drsOpen = b.drs; c.cooling = b.cool; c.carving = b.carve ?? 0;
  r.lap = b.lap; r.index = b.idx; r.nextSector = b.next; r.lapStart = b.lapStart; r.lastLap = b.last; r.bestLap = b.best;
}

let last = performance.now();
let lastGuest = performance.now();
let acc = 0;
/**
 * Smooth drawing: the simulation runs in fixed 1/60 s steps, but screens refresh at their own
 * rate, so some frames get two steps and some none. Drawing each craft and the camera blended
 * between the state before the latest step and after it (by how far we are into the next step)
 * keeps motion even at any refresh rate.
 */
const before = new Map<Craft, { x: number; y: number; heading: number; alt: number }>();
const camBefore = { x: 0, y: 0, zoom: 1 };
function rememberBefore(): void {
  before.clear();
  for (const car of cars) before.set(car.craft, { x: car.craft.pos.x, y: car.craft.pos.y, heading: car.craft.heading, alt: car.craft.alt });
  camBefore.x = cam.x; camBefore.y = cam.y; camBefore.zoom = cam.zoom;
}

/** Move crafts and the camera to the blended state for drawing; returns how to put them back. */
function blendForDrawing(alpha: number): () => void {
  const saved: [Craft, number, number, number, number][] = [];
  for (const car of cars) {
    const c = car.craft, b = before.get(c);
    // Skip new crafts and teleports (a restart): just draw them where they are.
    if (!b || Math.hypot(c.pos.x - b.x, c.pos.y - b.y) > 200) continue;
    saved.push([c, c.pos.x, c.pos.y, c.heading, c.alt]);
    c.pos.x = b.x + (c.pos.x - b.x) * alpha;
    c.pos.y = b.y + (c.pos.y - b.y) * alpha;
    c.heading = b.heading + wrapAngle(c.heading - b.heading) * alpha;
    c.alt = b.alt + (c.alt - b.alt) * alpha;
  }
  const cx = cam.x, cy = cam.y, cz = cam.zoom;
  if (Math.hypot(cx - camBefore.x, cy - camBefore.y) < 400) {
    cam.x = lerp(camBefore.x, cx, alpha); cam.y = lerp(camBefore.y, cy, alpha); cam.zoom = lerp(camBefore.zoom, cz, alpha);
  }
  return () => {
    for (const [c, x, y, h, al] of saved) { c.pos.x = x; c.pos.y = y; c.heading = h; c.alt = al; }
    cam.x = cx; cam.y = cy; cam.zoom = cz;
  };
}

function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  watchFrameRate((now - last) / 1000);
  last = now;
  if (input.takeMute()) {
    const muted = sound.toggleMute();
    applySettings({ ...settings, muted });
    showToast(muted ? 'SOUND OFF' : 'SOUND ON', '#ffffff');
  }
  if (oneSheep.active) {
    oneSheep.frame(now);
    acc = 0;
    requestAnimationFrame(frame);
    return;
  }
  if (flock.active) {
    flock.frame(now);
    acc = 0;
    requestAnimationFrame(frame);
    return;
  }
  // Esc on the Settings screen closes it (rather than resuming the race underneath).
  if (settingsUI.isOpen && input.takePause()) settingsUI.close();
  if (input.takeView() && import.meta.env.DEV) toggleView();
  touch.show((mode === 'racing' || (online?.role === 'guest' && online.inRace && !online.finishedAt)) && !menus.pauseOpen && !settingsUI.isOpen);
  if (online?.role === 'guest') {
    acc = 0;
    if (online.inRace) guestFrame(Math.min(0.1, (now - lastGuest) / 1000));
    lastGuest = now;
  } else if (mode === 'racing' || mode === 'results') {
    while (acc >= STEP && (mode === 'racing' || mode === 'results')) { rememberBefore(); update(STEP); acc -= STEP; }
  } else {
    acc = 0;
    // Esc / P on the pause menu resumes.
    // (Ignored briefly after pausing: one Esc can both release the mouse lock and arrive as a key.)
    if (input.takePause() && mode === 'paused' && now - pausedAt > 300) play();
  }
  fitCanvas();
  const shift = online?.role === 'guest' && pred.ready;
  if (shift) { player.craft.pos.x += pred.errX; player.craft.pos.y += pred.errY; }
  const blended = online?.role !== 'guest' && (mode === 'racing' || mode === 'results');
  const restore = blended ? blendForDrawing(Math.min(1, acc / STEP)) : null;
  const chaseOn = view === 'chase' && chase !== null;
  const ghostOn = chaseOn && trial && (mode === 'racing' || mode === 'paused')
    && placeGhost(time - (blended ? STEP * (1 - Math.min(1, acc / STEP)) : 0));
  if (chaseOn) chase!.render({ time, cam, player, cars: ghostOn ? [...cars, ghostCar!] : cars, track, particles, goIn: mode === 'menu' ? undefined : goTime - time }, renderScale);
  drawFrame(ctx, innerWidth, innerHeight, {
    time, cam, player, cars, track, hud: raceHud(),
    particles, cursor: input.cursor, toast, locked: input.locked, chase: chaseOn, steer: keySteer, touch: touch.visible,
  });
  restore?.();
  if (shift) { player.craft.pos.x -= pred.errX; player.craft.pos.y -= pred.errY; }
  requestAnimationFrame(frame);
}
refreshSkinCards();   // the unlocked skins as cards on the car screens (after the lobby UI exists)
requestAnimationFrame(frame);
