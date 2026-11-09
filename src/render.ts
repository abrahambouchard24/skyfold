// Everything drawn to the canvas. Reads game state, never changes it.

import { Craft, GEARS, clamp } from './craft';
import { drawGround as drawSceneryGround, drawOverlays, drawProps, groundMoves, View } from './scenery';
import { COOL_LANE, HALF_WIDTH, KERB_WIDTH, RaceState, Track, WALL_DIST, WALL_THICKNESS } from './track';

export interface Camera { x: number; y: number; zoom: number; shake: number }

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number; size: number }

export interface Toast { text: string; color: string; t: number }

/** A craft art image, trimmed to its visible pixels once it loads. Nose points up in the file. */
export interface Sprite { canvas: HTMLCanvasElement | null; aspect: number }

export function loadSprite(url: string, height = 256): Sprite {
  const sprite: Sprite = { canvas: null, aspect: 0.6 };
  const img = new Image();
  img.onload = () => {
    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const pctx = probe.getContext('2d')!;
    pctx.drawImage(img, 0, 0);
    const data = pctx.getImageData(0, 0, img.width, img.height).data;
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (data[(y * img.width + x) * 4 + 3] > 24) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.height = height;
    out.width = Math.round((w / h) * height);
    const octx = out.getContext('2d')!;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, minX, minY, w, h, 0, 0, out.width, out.height);
    sprite.canvas = out;
    sprite.aspect = w / h;
  };
  img.src = url;
  return sprite;
}

/** One racer: physics, race progress, art, minimap color and exhaust flame hue. */
/** An unlockable colour scheme for a car (overrides its livery colours; null = stock livery). */
export interface CarSkin { body: string; trim: string; accent: string; glow: string; pattern?: string }
export interface Car { craft: Craft; race: RaceState; sprite: Sprite; color: string; hue: number; name: string; skin?: CarSkin | null;
  /** A Time Trial ghost: drawn see-through, never raced against. */
  ghost?: boolean }

export interface RaceHud {
  position: number; racers: number; laps: number; countdown: string | null; banner: string | null;
  /** The player's catch-up pace bonus as a fraction (0.03 = +3%). */
  catchUp: number;
  /** Show the turbo-start tip under the countdown. */
  launchHint: boolean;
  /** Time gaps to the cars just ahead of and behind the player (null when there isn't one). */
  ahead: { name: string; color: string; gap: number } | null;
  behind: { name: string; color: string; gap: number } | null;
  /** DRS is enabled for the player this lap (from lap 2). */
  drsAvailable: boolean;
  /** How far through holding R to restart, 0..1 (0 = not held). */
  restart?: number;
  /** A sprint (one run, no laps): its length, and how far along each car is (0..1). */
  sprint?: { km: number; cars: { f: number; color: string; me: boolean }[] };
  /** The sprint strip the player is on: a small cue under the progress strip. */
  strip?: 'boost' | 'charge' | 'cool' | 'fire';
}

export interface Scene {
  time: number; cam: Camera; player: Car; cars: Car[]; track: Track; hud: RaceHud;
  particles: Particle[]; cursor: { x: number; y: number }; toast: Toast | null; locked: boolean;
  /** The 3D chase view draws the world underneath; this canvas then only carries the HUD. */
  chase?: boolean;
  /** Steering (-1 full left .. 1 full right), shown on the steering bar. */
  steer?: number;
  /** On-screen touch controls are showing (no keyboard help line). */
  touch?: boolean;
}

/** Whether the chase view is on (changes the help line and the cursor). */
let chaseHud = false;

export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, s: Scene): void {
  const { cam } = s;
  const baseScale = ctx.getTransform().a;   // canvas pixels per CSS pixel
  chaseHud = !!s.chase;
  if (s.chase) {
    ctx.clearRect(0, 0, w, h);
    drawHudLayers(ctx, w, h, s);
    return;
  }
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, w, h);

  const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(w / 2 + sx, h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // The visible world rectangle, for culling scenery, and the camera centre its 2.5D lean is measured from.
  const viewW = w / cam.zoom, viewH = h / cam.zoom;
  const view: View = { x0: cam.x - viewW / 2, y0: cam.y - viewH / 2, x1: cam.x + viewW / 2, y1: cam.y + viewH / 2, cx: cam.x, cy: cam.y };
  // The ground and the track's static layers come from pre-rendered tiles; only the animated
  // parts (rail pulses, lights, cooling lane, start gantry) are drawn live.
  if (groundMoves(s.track)) drawSceneryGround(ctx, s.track, view, s.time);
  drawWorldTiles(ctx, s.track, view, baseScale * TILE_ZOOM);
  drawTrackLive(ctx, s.track, s.time);
  drawProps(ctx, s.track, view, s.time);
  drawParticles(ctx, s.particles);
  drawSlipstreams(ctx, s.cars, s.time);
  // Cars sit still on the grid; the hover bob starts with their race.
  for (const car of s.cars) drawCraft(ctx, car.craft, s.time, car.sprite, car.hue, car.race.lapStart >= 0, car.skin);
  drawOverlays(ctx, s.track, view, s.time);

  ctx.restore();
  drawHudLayers(ctx, w, h, s);
}

function drawHudLayers(ctx: CanvasRenderingContext2D, w: number, h: number, s: Scene): void {
  drawVignette(ctx, w, h);
  drawMinimap(ctx, w, h, s.track, s.cars, s.player);
  // The lap and gap panels shrink with the dash on phone-sized screens (and never grow).
  const small = Math.min(1, hudScale(w, h));
  ctx.save();
  ctx.scale(small, small);
  drawLapPanel(ctx, s.player.race, s.time, s.hud);
  drawGapPanel(ctx, s.hud);
  ctx.restore();
  drawHud(ctx, w, h, s.player.craft, s.toast, s.locked, s.hud, !!s.touch);
  if (s.hud.sprint) drawSprintStrip(ctx, w, s.hud.sprint, s.touch ? 62 : 24);
  if (s.hud.strip) drawStripCue(ctx, w, s.hud.strip, (s.touch ? 62 : 24) + 30, s.time);
  drawRaceBanners(ctx, w, h, s.hud);
  if (s.hud.restart) drawRestartHold(ctx, w, h, s.hud.restart);
  drawSteerBar(ctx, w, h, s.steer ?? 0);
}

/** How hard the car is steering, as a marker on a bar at the bottom of the screen. */
function drawSteerBar(ctx: CanvasRenderingContext2D, w: number, h: number, steer: number): void {
  const half = Math.min(260, w * 0.2), y = h - 46;
  const x = w / 2 + Math.max(-1, Math.min(1, steer)) * half;
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,24,0.45)';
  roundRect(ctx, w / 2 - half - 6, y - 5, half * 2 + 12, 10, 5);
  ctx.fill();
  const g = ctx.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
  g.addColorStop(0, 'rgba(79,227,255,0.6)'); g.addColorStop(0.5, 'rgba(79,227,255,0.05)'); g.addColorStop(1, 'rgba(79,227,255,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(Math.min(x, w / 2), y - 2, Math.abs(x - w / 2), 4);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(w / 2 - 1, y - 7, 2, 14);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - 9); ctx.lineTo(x + 6, y - 16); ctx.lineTo(x - 6, y - 16); ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 1.5, y - 7, 3, 14);
  ctx.restore();
}

/** Static track geometry as Path2Ds, built once per track. */
interface TrackPaths {
  center: Path2D; kerbRed: Path2D; kerbWhite: Path2D; kerbEdge: Path2D; seams: Path2D; lanes: Path2D; rails: Path2D;
  chevrons: Path2D; lights: Path2D; coolLane: Path2D; coolLine: Path2D;
}
const pathCache = new WeakMap<Track, TrackPaths>();

const KERB_CURVE = 1 / 900;   // corners tighter than this radius get kerbs

function trackPaths(track: Track): TrackPaths {
  const cached = pathCache.get(track);
  if (cached) return cached;
  const pts = track.pts, m = pts.length;
  const center = new Path2D();
  center.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) center.lineTo(p.x, p.y);
  center.closePath();

  const off = (i: number, d: number) => { const p = pts[i % m]; return [p.x + p.nx * d, p.y + p.ny * d]; };

  // Kerbs: light-strip segments along both edges through each corner (lit and dark in turn),
  // with a thin glowing line along their inner edge.
  const kerbRed = new Path2D(), kerbWhite = new Path2D(), kerbEdge = new Path2D();
  for (let i = 0; i < m; i++) {
    if (Math.abs(pts[i].curve) < KERB_CURVE) continue;
    const path = Math.floor(i / 2) % 2 ? kerbRed : kerbWhite;
    for (const side of [1, -1]) {
      const a = off(i, side * (HALF_WIDTH - KERB_WIDTH)), b = off(i + 1, side * (HALF_WIDTH - KERB_WIDTH));
      const c = off(i + 1, side * HALF_WIDTH), d = off(i, side * HALF_WIDTH);
      path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath();
      kerbEdge.moveTo(a[0], a[1]); kerbEdge.lineTo(b[0], b[1]);
    }
  }

  // Deck plates: fine seams across the surface every few samples.
  const seams = new Path2D();
  for (let i = 0; i < m; i += 4) {
    const a = off(i, HALF_WIDTH - 16), b = off(i, -(HALF_WIDTH - 16));
    seams.moveTo(a[0], a[1]); seams.lineTo(b[0], b[1]);
  }
  // Lane guides a third of the way in from each edge, and the energy rails along both edges.
  const polyline = (path: Path2D, d: number) => {
    for (let i = 0; i <= m; i++) { const [x, y] = off(i, d); if (i) path.lineTo(x, y); else path.moveTo(x, y); }
  };
  const lanes = new Path2D(), rails = new Path2D();
  polyline(lanes, HALF_WIDTH / 3); polyline(lanes, -HALF_WIDTH / 3);
  polyline(rails, HALF_WIDTH - 4); polyline(rails, -(HALF_WIDTH - 4));

  // Chevrons pointing the way down the straights.
  const chevrons = new Path2D();
  for (let i = 0; i < m; i += 30) {
    let straight = true;
    for (let k = -6; k <= 6; k++) if (Math.abs(pts[(i + k + m) % m].curve) > 1 / 2500) straight = false;
    if (!straight) continue;
    const p = pts[i], dir = track.direction(i), fx = Math.cos(dir), fy = Math.sin(dir);
    for (const lane of [-HALF_WIDTH / 1.5, 0, HALF_WIDTH / 1.5]) {
      const cx = p.x + p.nx * lane, cy = p.y + p.ny * lane;
      chevrons.moveTo(cx - fx * 12 + p.nx * 18, cy - fy * 12 + p.ny * 18);
      chevrons.lineTo(cx + fx * 8, cy + fy * 8);
      chevrons.lineTo(cx - fx * 12 - p.nx * 18, cy - fy * 12 - p.ny * 18);
    }
  }

  // Lights set into the top of both barriers.
  const lights = new Path2D();
  for (let i = 0; i < m; i += 6) {
    for (const side of [1, -1]) {
      const [x, y] = off(i, side * (HALF_WIDTH + WALL_THICKNESS / 2));
      lights.moveTo(x + 3.5, y);
      lights.arc(x, y, 3.5, 0, Math.PI * 2);
    }
  }

  // Cooling lane: a band along the outside edge of the straight, plus its center line for the chevrons.
  const coolLane = new Path2D(), coolLine = new Path2D();
  const inner = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width), outer = COOL_LANE.side * HALF_WIDTH;
  for (let i = COOL_LANE.from; i <= COOL_LANE.to; i++) {
    const [x, y] = off(i, inner);
    if (i === COOL_LANE.from) coolLane.moveTo(x, y); else coolLane.lineTo(x, y);
  }
  for (let i = COOL_LANE.to; i >= COOL_LANE.from; i--) { const [x, y] = off(i, outer); coolLane.lineTo(x, y); }
  coolLane.closePath();
  for (let i = COOL_LANE.from; i <= COOL_LANE.to; i++) {
    const [x, y] = off(i, COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2));
    if (i === COOL_LANE.from) coolLine.moveTo(x, y); else coolLine.lineTo(x, y);
  }

  const built = { center, kerbRed, kerbWhite, kerbEdge, seams, lanes, rails, chevrons, lights, coolLane, coolLine };
  pathCache.set(track, built);
  return built;
}

/** Everything about the track that never changes (drawn once into the world tiles). */
function drawTrackStatic(ctx: CanvasRenderingContext2D, track: Track): void {
  const p = trackPaths(track);
  const theme = track.theme;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Barriers: a soft glow, the shadow they cast outward, then the barrier band itself with a
  // bright rim on its outer edge. Each is a wide stroke along the centerline; the racing
  // surface is drawn over the middle afterwards, so only the outer edges remain visible.
  ctx.strokeStyle = theme.wall;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = WALL_DIST * 2 + 34;
  ctx.stroke(p.center);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = WALL_DIST * 2 + 16;
  ctx.stroke(p.center);
  ctx.strokeStyle = theme.wall;
  ctx.lineWidth = WALL_DIST * 2;
  ctx.stroke(p.center);
  ctx.strokeStyle = '#1d2a55';
  ctx.lineWidth = WALL_DIST * 2 - 6;
  ctx.stroke(p.center);
  // Bright inner face of the barrier, where you scrape.
  ctx.strokeStyle = theme.wallFace;
  ctx.lineWidth = HALF_WIDTH * 2 + 6;
  ctx.stroke(p.center);
  ctx.strokeStyle = theme.surface;
  ctx.lineWidth = HALF_WIDTH * 2;
  ctx.stroke(p.center);
  // A softly lit racing groove down the middle: darker toward the edges, brighter in the centre.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = HALF_WIDTH * 2;
  ctx.stroke(p.center);
  ctx.strokeStyle = theme.surface;
  ctx.lineWidth = HALF_WIDTH * 2 - 36;
  ctx.stroke(p.center);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
  ctx.lineWidth = HALF_WIDTH * 1.2;
  ctx.stroke(p.center);
  ctx.lineWidth = HALF_WIDTH * 0.6;
  ctx.stroke(p.center);

  // Deck plate seams and lane guides.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.lineWidth = 2;
  ctx.stroke(p.seams);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  ctx.translate(0, 1);
  ctx.stroke(p.seams);
  ctx.translate(0, -1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = theme.wall;
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 2;
  ctx.setLineDash([26, 34]);
  ctx.stroke(p.lanes);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.09;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'miter';
  ctx.stroke(p.chevrons);
  ctx.restore();

  // Kerbs: lit segments in the track's colour, dark ones between, and a glowing inner edge.
  ctx.fillStyle = theme.kerb;
  ctx.fill(p.kerbRed);
  ctx.fillStyle = '#0d0f1c';
  ctx.fill(p.kerbWhite);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = theme.kerb;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.stroke(p.kerbEdge);
  ctx.restore();

  // Energy rails along both edges, with pulses of light streaming forward along them.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = theme.wall;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 9;
  ctx.stroke(p.rails);
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2;
  ctx.stroke(p.rails);
  ctx.restore();

  drawDrsZones(ctx, track);
  ctx.restore();
}

/** The moving parts of the track, drawn every frame over the tiles. */
function drawTrackLive(ctx: CanvasRenderingContext2D, track: Track, time: number): void {
  const p = trackPaths(track);
  const theme = track.theme;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.setLineDash([46, 330]);
  ctx.lineDashOffset = -time * 1100;
  ctx.stroke(p.rails);
  ctx.restore();

  const pulse = 0.55 + 0.45 * Math.sin(time * 4);
  ctx.fillStyle = `rgba(${theme.lights}, ${pulse})`;
  ctx.fill(p.lights);

  drawCoolLane(ctx, track, p, time);
  drawStartLine(ctx, track, time);
  ctx.restore();
}

function drawCoolLane(ctx: CanvasRenderingContext2D, track: Track, p: TrackPaths, time: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(90, 210, 255, 0.16)';
  ctx.fill(p.coolLane);
  ctx.strokeStyle = 'rgba(150, 235, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke(p.coolLane);
  // Chevrons flowing down the lane.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(150, 235, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const span = COOL_LANE.to - COOL_LANE.from;
  for (let k = 0; k < 8; k++) {
    const t = ((k / 8 + time * 0.35) % 1);
    const i = COOL_LANE.from + Math.floor(t * span);
    const pt = track.pts[i];
    const mid = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2);
    const cx = pt.x + pt.nx * mid, cy = pt.y + pt.ny * mid;
    const dir = track.direction(i), fx = Math.cos(dir), fy = Math.sin(dir);
    const half = COOL_LANE.width * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - fx * 10 + pt.nx * half, cy - fy * 10 + pt.ny * half);
    ctx.lineTo(cx + fx * 6, cy + fy * 6);
    ctx.lineTo(cx - fx * 10 - pt.nx * half, cy - fy * 10 - pt.ny * half);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Label at the start of the lane.
  const s = track.pts[COOL_LANE.from + 2];
  const mid = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2);
  ctx.translate(s.x + s.nx * mid, s.y + s.ny * mid);
  ctx.rotate(track.direction(COOL_LANE.from + 2));
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(200, 245, 255, 0.9)';
  ctx.fillText('COOL', 0, 0);
  ctx.restore();
}

/** A dashed green line and "DRS" across the track where each zone starts, a fainter line where it ends. */
function drawDrsZones(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.save();
  for (const z of track.drsZones) {
    for (const [i, start] of [[z.from, true], [z.to, false]] as const) {
      const p = track.pts[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(track.direction(i));
      ctx.strokeStyle = start ? 'rgba(77, 255, 154, 0.85)' : 'rgba(77, 255, 154, 0.35)';
      ctx.lineWidth = start ? 4 : 2;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(0, -HALF_WIDTH + 6);
      ctx.lineTo(0, HALF_WIDTH - 6);
      ctx.stroke();
      if (start) {
        ctx.setLineDash([]);
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(77, 255, 154, 0.75)';
        ctx.rotate(Math.PI / 2);   // reads along the direction of travel
        ctx.fillText('WIND', 0, -26);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawStartLine(ctx: CanvasRenderingContext2D, track: Track, time: number): void {
  const p = track.pts[0];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(track.direction(0));
  // Checkered band across the track: x runs along the track, y across it.
  const sq = 13, cols = Math.floor((HALF_WIDTH * 2) / sq);
  const y0 = -(cols * sq) / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#0a0a12' : '#ffffff';
      ctx.fillRect(r * sq - sq, y0 + c * sq, sq, sq);
    }
  }
  // Holographic gantry: glowing beams either side of the line and emitter posts at each end.
  ctx.globalCompositeOperation = 'lighter';
  const flicker = 0.75 + 0.25 * Math.sin(time * 9) * Math.sin(time * 3.7);
  for (const bx of [-sq - 7, sq + 7]) {
    ctx.fillStyle = `rgba(${track.theme.lights}, ${0.18 * flicker})`;
    ctx.fillRect(bx - 6, -HALF_WIDTH, 12, HALF_WIDTH * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * flicker})`;
    ctx.fillRect(bx - 1, -HALF_WIDTH, 2, HALF_WIDTH * 2);
  }
  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgba(${track.theme.lights}, 0.9)`;
    ctx.beginPath(); ctx.arc(0, side * (HALF_WIDTH + WALL_THICKNESS / 2), 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, side * (HALF_WIDTH + WALL_THICKNESS / 2), 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * How much bigger the minimap and the dash draw, so they can be read at a glance at speed:
 * about 1.6x on a full-HD screen, 1.45x at 1280x720, normal size on small windows, and smaller on
 * phones (under 560 px tall), so it leaves room for the road and the touch controls.
 */
function hudScale(w: number, h: number): number {
  return clamp(Math.min(w / 1280, h / 720) * 1.45, Math.min(1, h / 560), 1.6);
}

/** A sprint's route for the minimap: the lead-in into the start, then start to the end, left open. */
const openRoutes = new WeakMap<Track, Path2D>();
function openRoute(track: Track): Path2D {
  let p = openRoutes.get(track);
  if (p) return p;
  p = new Path2D();
  const order = [...Array.from({ length: track.length - track.routeEnd - 1 }, (_, k) => track.routeEnd + 1 + k),
    ...Array.from({ length: track.routeEnd + 1 }, (_, k) => k)];
  order.forEach((i, n) => { const q = track.pts[i]; if (n === 0) p!.moveTo(q.x, q.y); else p!.lineTo(q.x, q.y); });
  openRoutes.set(track, p);
  return p;
}

function drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, track: Track, cars: Car[], player: Car): void {
  const b = track.bounds;
  const k = hudScale(w, h);
  const boxW = 220 * k, boxH = 160 * k, pad = 14 * k;
  const scale = Math.min((boxW - pad * 2) / (b.maxX - b.minX), (boxH - pad * 2) / (b.maxY - b.minY));
  const x = w - boxW - 24, y = 24;
  const center = track.open ? openRoute(track) : trackPaths(track).center;
  ctx.save();
  ctx.fillStyle = 'rgba(26,20,16,0.78)';
  roundRect(ctx, x, y, boxW, boxH, 12);
  ctx.fill();
  ctx.translate(x + boxW / 2, y + boxH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#5a4a3a';
  ctx.lineWidth = (9 * k) / scale;
  ctx.stroke(center);
  ctx.strokeStyle = '#a89d8a';
  ctx.lineWidth = (3 * k) / scale;
  ctx.stroke(center);
  const s = track.pts[0];
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s.x, s.y, (4 * k) / scale, 0, Math.PI * 2);
  ctx.fill();
  if (track.forks?.length) {
    // Forks: small teal ticks where the road splits into two lanes.
    ctx.fillStyle = '#8fd0e0';
    const r = (2.6 * k) / scale;
    for (const f of track.forks) {
      const q = track.pts[f.from];
      ctx.beginPath(); ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y); ctx.closePath();
      ctx.fill();
    }
  }
  if (track.open) {
    // A sprint's finish: a gold diamond.
    const f = track.pts[track.finishIndex], r = (7 * k) / scale;
    ctx.fillStyle = '#c98b3e';
    ctx.beginPath(); ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x + r, f.y); ctx.lineTo(f.x, f.y + r); ctx.lineTo(f.x - r, f.y); ctx.closePath();
    ctx.fill();
  }
  // Player drawn last so it sits on top.
  for (const car of [...cars.filter((c) => c !== player), player]) {
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.arc(car.craft.pos.x, car.craft.pos.y, ((car === player ? 6 : 5) * k) / scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Live time gaps to the cars just ahead (+) and behind (-), under the lap panel. */
function drawGapPanel(ctx: CanvasRenderingContext2D, hud: RaceHud): void {
  const rows = [
    hud.ahead && { label: 'AHEAD', ...hud.ahead, text: `+${hud.ahead.gap.toFixed(1)}` },
    hud.behind && { label: 'BEHIND', ...hud.behind, text: `-${hud.behind.gap.toFixed(1)}` },
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return;
  const x = 24, y = 152;
  ctx.save();
  ctx.fillStyle = 'rgba(26,20,16,0.78)';
  roundRect(ctx, x, y, 220, 16 + rows.length * 24, 12);
  ctx.fill();
  rows.forEach((r, i) => {
    const ry = y + 28 + i * 24;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#a89d8a';
    ctx.textAlign = 'left';
    ctx.fillText(r.label, x + 16, ry);
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillStyle = r.color;
    ctx.fillText(r.name, x + 70, ry);
    ctx.font = '700 15px ui-monospace, Consolas, monospace';
    // Within a second of the car ahead: green, you can get DRS on it.
    ctx.fillStyle = r.label === 'AHEAD' && r.gap < 1 ? '#4dff9a' : r.label === 'BEHIND' && r.gap < 1 ? '#ffb02e' : '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(r.text, x + 204, ry);
  });
  ctx.restore();
}

function drawLapPanel(ctx: CanvasRenderingContext2D, race: RaceState, now: number, hud: RaceHud): void {
  const x = 24, y = 24;
  ctx.save();
  ctx.fillStyle = 'rgba(26,20,16,0.78)';
  roundRect(ctx, x, y, 220, 120, 12);
  ctx.fill();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#a89d8a';
  const sprintMe = hud.sprint?.cars.find((c) => c.me);
  ctx.fillText(hud.sprint ? 'KM' : 'LAP', x + 16, y + 28);
  ctx.font = '800 24px "Alegreya Sans", system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(hud.sprint ? `${(hud.sprint.km * (sprintMe?.f ?? 0)).toFixed(1)}/${hud.sprint.km.toFixed(1)}` : `${Math.min(race.lap + 1, hud.laps)}/${hud.laps}`,
    x + (hud.sprint ? 46 : 50), y + 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = hud.position === 1 ? '#e3b26c' : '#fff';
  ctx.fillText(`P${hud.position}`, x + 204, y + 30);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#a89d8a';
  ctx.fillText(`/${hud.racers}`, x + 204, y + 46);
  if (hud.catchUp > 0) {
    ctx.fillStyle = '#4dff9a';
    ctx.fillText(`+${Math.round(hud.catchUp * 100)}% FURY`, x + 204, y + 110);
  }
  ctx.textAlign = 'left';
  ctx.font = '700 28px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(formatTime(race.current(now)), x + 16, y + 66);
  ctx.font = '600 14px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#a89d8a';
  if (hud.sprint) {
    // A sprint has no laps to compare: show the best run instead, and how far along this one is.
    ctx.fillText(`${Math.round((sprintMe?.f ?? 0) * 100)}% DONE`, x + 16, y + 90);
  } else {
    ctx.fillText(`LAST ${race.lastLap ? formatTime(race.lastLap) : '-:--.---'}`, x + 16, y + 90);
  }
  ctx.fillStyle = race.bestLap ? '#c77dff' : '#a89d8a';
  ctx.fillText(`BEST ${race.bestLap ? formatTime(race.bestLap) : '-:--.---'}`, x + 16, y + 110);
  ctx.restore();
}

const STRIP_CUE: Record<NonNullable<RaceHud['strip']>, [string, string]> = {
  boost: ['WIND GUST', '#c98b3e'], charge: ['CHARGING', '#c58bff'], cool: ['COOLING', '#7fdcff'], fire: ['FIRE', '#ff6a3d'],
};
/** A small pill under the progress strip naming the strip the player is on, pulsing gently. */
function drawStripCue(ctx: CanvasRenderingContext2D, w: number, kind: NonNullable<RaceHud['strip']>, y: number, time: number): void {
  const [text, color] = STRIP_CUE[kind];
  ctx.save();
  ctx.font = '700 12px "Alegreya Sans SC", system-ui, sans-serif';
  const tw = ctx.measureText(text).width + text.length * 2.4, pw = tw + 30;
  ctx.globalAlpha = 0.85 + Math.sin(time * 8) * 0.15;
  ctx.fillStyle = 'rgba(24,19,15,0.82)';
  roundRect(ctx, w / 2 - pw / 2, y - 11, pw, 22, 11);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2.4px';
  ctx.fillText(text, w / 2 + 1.2, y + 0.5);
  ctx.restore();
}

/** A sprint's progress strip across the top: the route from start to finish, with every car on it. */
function drawSprintStrip(ctx: CanvasRenderingContext2D, w: number, sp: NonNullable<RaceHud['sprint']>, y: number): void {
  const half = Math.min(260, w * 0.2), x0 = w / 2 - half, x1 = w / 2 + half;
  ctx.save();
  ctx.fillStyle = 'rgba(26,20,16,0.78)';
  roundRect(ctx, x0 - 14, y - 12, half * 2 + 28, 24, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(168,116,58,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  // Gold ticks every kilometre, and the finish as a diamond.
  ctx.fillStyle = 'rgba(168,116,58,0.8)';
  for (let k = 1; k < sp.km; k++) ctx.fillRect(x0 + (k / sp.km) * half * 2 - 1, y - 4, 2, 8);
  ctx.beginPath(); ctx.moveTo(x1, y - 6); ctx.lineTo(x1 + 6, y); ctx.lineTo(x1, y + 6); ctx.lineTo(x1 - 6, y); ctx.closePath();
  ctx.fillStyle = '#c98b3e'; ctx.fill();
  // Rivals first, the player on top.
  for (const c of [...sp.cars].sort((a, b) => Number(a.me) - Number(b.me))) {
    const cx = x0 + c.f * half * 2;
    ctx.beginPath();
    ctx.arc(cx, y, c.me ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
    if (c.me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  ctx.restore();
}

function drawRaceBanners(ctx: CanvasRenderingContext2D, w: number, h: number, hud: RaceHud): void {
  ctx.save();
  ctx.textAlign = 'center';
  if (hud.countdown) {
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillStyle = hud.countdown === 'GO' ? '#4dff9a' : '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.fillText(hud.countdown, w / 2, h * 0.38);
    if (hud.launchHint) {
      ctx.shadowBlur = 0;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = '#e0d6c2';
      ctx.fillText('Hold the brake (S / Space), let go right on GO to leap off the line', w / 2, h * 0.38 + 40);
    }
  }
  if (hud.banner) {
    ctx.fillStyle = 'rgba(26,20,16,0.85)';
    roundRect(ctx, w / 2 - 210, h * 0.3 - 50, 420, 96, 14);
    ctx.fill();
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillStyle = '#e3b26c';
    ctx.fillText(hud.banner, w / 2, h * 0.3 + 2);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = '#e0d6c2';
    ctx.fillText('R: race again   ·   Esc: menu', w / 2, h * 0.3 + 32);
  }
  ctx.restore();
}

/** Holding R: a slim bar that fills, so a stray tap never restarts the race. */
function drawRestartHold(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  const bw = 260, bh = 8, x = (w - bw) / 2, y = h * 0.34;
  ctx.save();
  ctx.fillStyle = 'rgba(26,20,16,0.8)';
  roundRect(ctx, x - 16, y - 34, bw + 32, bh + 50, 12);
  ctx.fill();
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecff';
  ctx.fillText(k >= 1 ? 'RESTARTING' : 'HOLD R TO RESTART', w / 2, y - 12);
  ctx.fillStyle = '#252b52';
  ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = '#e3b26c';
  ctx.fillRect(x, y, bw * k, bh);
  ctx.restore();
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = p.life / p.max;
    ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${a * 0.55})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Craft size and where the rear exhausts sit, in world px (heading along +x). */
export const CRAFT_LENGTH = 80;
export const NOZZLE_BACK = CRAFT_LENGTH / 2 - 4;
export const NOZZLE_SIDE = 5.5;

function drawCraft(ctx: CanvasRenderingContext2D, c: Craft, time: number, sprite: Sprite, hue: number, bobbing: boolean, skin?: CarSkin | null): void {
  // (hue is reassigned below while ERS is deploying)
  const bob = bobbing ? Math.sin(time * 5 + c.pos.x * 0.001) * 2.5 : 0;
  const hoverHeight = 10 + bob;
  const width = CRAFT_LENGTH * sprite.aspect;

  // Shadow on the ground: the sprite's silhouette, shifted and blurred by hover height.
  ctx.save();
  ctx.translate(c.pos.x + hoverHeight * 0.6, c.pos.y + hoverHeight);
  ctx.rotate(c.heading);
  ctx.globalAlpha = 0.5;
  if (sprite.canvas) {
    // A pre-blurred silhouette: blurring live with ctx.filter every frame is slow.
    const sh = shadowOf(sprite);
    const k = CRAFT_LENGTH / sprite.canvas.height, pad = SHADOW_PAD * k;
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(sh, -width / 2 - pad, -CRAFT_LENGTH / 2 - pad, width + pad * 2, CRAFT_LENGTH + pad * 2);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(-CRAFT_LENGTH / 2, -width / 2, CRAFT_LENGTH, width);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(c.pos.x, c.pos.y);
  ctx.rotate(c.heading);

  // Thruster flames out of the twin rear exhausts.
  const flame = 10 + c.thrust * 22 + (c.deploying ? 16 : 0) + Math.random() * 4;
  if (c.deploying) hue = 280;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-NOZZLE_SIDE, NOZZLE_SIDE]) {
    const g = ctx.createLinearGradient(-NOZZLE_BACK, 0, -NOZZLE_BACK - flame, 0);
    g.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.95)`);
    g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-NOZZLE_BACK, side - 4); ctx.lineTo(-NOZZLE_BACK - flame, side); ctx.lineTo(-NOZZLE_BACK, side + 4);
    ctx.fill();
  }
  ctx.restore();

  // Electric outlines: green while the DRS wing is open, purple while the ERS battery is full.
  if (sprite.canvas) {
    const full = c.energy >= ENERGY_FULL;
    // Both at once: the green charge crackles outside, the purple one hugs the hull.
    if (c.drsOpen) drawElectric(ctx, sprite, DRS_GLOW, full ? 4.5 : 2);
    if (full) drawElectric(ctx, sprite, ERS_GLOW, 2);
    drawSprite(ctx, sprite);
    if (skin) {
      // A skin recolours the art: its hue and saturation, the sprite's own shading.
      const width = CRAFT_LENGTH * sprite.aspect;
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.globalCompositeOperation = 'color';
      ctx.drawImage(silhouette(sprite, skin.body), -width / 2, -CRAFT_LENGTH / 2, width, CRAFT_LENGTH);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** A soft darkening toward the screen edges that draws the eye to the middle (cached per size). */
let vignette: { w: number; h: number; c: HTMLCanvasElement } | null = null;

// --- pre-rendered world tiles --------------------------------------------------------------------
// The ground and the static track are many full-screen layers (a dozen wide strokes of the whole
// circuit), far too much to paint 60 times a second. They're drawn once into 512 px tiles, kept
// around the camera, and each frame just copies the visible ones.

const TILE = 512;            // world px per tile
const TILE_ZOOM = 1.15;      // tiles are rendered for the closest camera zoom, so they stay sharp
const MAX_TILES = 60;
const TILE_BLEED = 1;        // tile px of neighbouring content around each tile, so no seams show
interface WorldTiles { track: Track; scale: number; tiles: Map<string, HTMLCanvasElement> }
let world: WorldTiles | null = null;

function drawWorldTiles(ctx: CanvasRenderingContext2D, track: Track, v: View, rawScale: number): void {
  // Quantized so a small zoom or window change doesn't throw the cache away.
  const scale = Math.max(0.5, Math.ceil(rawScale * 8) / 8);
  if (!world || world.track !== track || world.scale !== scale) world = { track, scale, tiles: new Map() };
  const tiles = world.tiles;
  const x0 = Math.floor(v.x0 / TILE), x1 = Math.floor(v.x1 / TILE), y0 = Math.floor(v.y0 / TILE), y1 = Math.floor(v.y1 / TILE);
  const pad = TILE_BLEED / scale;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const key = tx + ',' + ty;
      let c = tiles.get(key);
      if (c) tiles.delete(key);   // re-inserted below: the Map's order doubles as least-recently-used
      else c = renderTile(track, tx, ty, scale);
      tiles.set(key, c);
      ctx.drawImage(c, tx * TILE - pad, ty * TILE - pad, TILE + pad * 2, TILE + pad * 2);
    }
  }
  // Build one tile just outside the view each frame, so turning a corner rarely has to wait for one.
  outer: for (let ty = y0 - 1; ty <= y1 + 1; ty++) {
    for (let tx = x0 - 1; tx <= x1 + 1; tx++) {
      const key = tx + ',' + ty;
      if (!tiles.has(key)) { tiles.set(key, renderTile(track, tx, ty, scale)); break outer; }
    }
  }
  while (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value!);
}

function renderTile(track: Track, tx: number, ty: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(TILE * scale) + TILE_BLEED * 2;
  const g = c.getContext('2d')!;
  g.translate(TILE_BLEED, TILE_BLEED);
  g.scale(scale, scale);
  g.translate(-tx * TILE, -ty * TILE);
  const pad = TILE_BLEED / scale;
  const v: View = { x0: tx * TILE - pad, y0: ty * TILE - pad, x1: (tx + 1) * TILE + pad, y1: (ty + 1) * TILE + pad, cx: 0, cy: 0 };
  if (!groundMoves(track)) drawSceneryGround(g, track, v, 0);
  // Skip the strokes for tiles nowhere near the circuit.
  const b = track.bounds, m = 80;
  if (v.x1 > b.minX - m && v.x0 < b.maxX + m && v.y1 > b.minY - m && v.y0 < b.maxY + m) drawTrackStatic(g, track);
  return c;
}
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Painted once at an eighth of the size and stretched: a gradient this smooth looks the same,
  // and copying it is far cheaper than working out the gradient for every pixel each frame.
  if (!vignette || vignette.w !== w || vignette.h !== h) {
    const c = document.createElement('canvas');
    const k = 1 / 8;
    c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
    const g = c.getContext('2d')!;
    g.scale(k, k);
    const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    grd.addColorStop(0, 'rgba(4, 5, 12, 0)');
    grd.addColorStop(1, 'rgba(4, 5, 12, 0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    vignette = { w, h, c };
  }
  ctx.drawImage(vignette.c, 0, 0, w, h);
}

const DRS_GLOW = '#4dff9a';
const ERS_GLOW = '#b86bff';
/** The battery counts as full from here (it charges in small steps). */
const ENERGY_FULL = 0.995;

/** Each sprite's shadow: its silhouette in black, blurred once and padded so the blur isn't clipped. */
const SHADOW_PAD = 24;   // sprite px
const shadows = new Map<HTMLCanvasElement, HTMLCanvasElement>();
function shadowOf(sprite: Sprite): HTMLCanvasElement {
  const src = sprite.canvas!;
  let out = shadows.get(src);
  if (!out) {
    out = document.createElement('canvas');
    out.width = src.width + SHADOW_PAD * 2;
    out.height = src.height + SHADOW_PAD * 2;
    const octx = out.getContext('2d')!;
    // About the same softness as the old 2.5 px world-space blur, in sprite pixels.
    octx.filter = `blur(${Math.round(2.5 * src.height / CRAFT_LENGTH)}px)`;
    octx.drawImage(silhouette(sprite, '#000'), SHADOW_PAD, SHADOW_PAD);
    shadows.set(src, out);
  }
  return out;
}

/** One solid-color copy of each sprite per color, for outlines. */
const silhouettes = new Map<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

function silhouette(sprite: Sprite, color: string): HTMLCanvasElement {
  const src = sprite.canvas!;
  let byColor = silhouettes.get(src);
  if (!byColor) silhouettes.set(src, byColor = new Map());
  let out = byColor.get(color);
  if (!out) {
    out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const octx = out.getContext('2d')!;
    octx.drawImage(src, 0, 0);
    octx.globalCompositeOperation = 'source-in';
    octx.fillStyle = color;
    octx.fillRect(0, 0, out.width, out.height);
    byColor.set(color, out);
  }
  return out;
}

/**
 * An electric outline around the craft's own shape: a thin rim that jitters and flickers every
 * frame, a white-hot core, and short lightning arcs crackling off the hull.
 * Call in the craft's local frame (nose along +x).
 */
function drawElectric(ctx: CanvasRenderingContext2D, sprite: Sprite, color: string, thickness: number): void {
  const width = CRAFT_LENGTH * sprite.aspect;
  ctx.save();
  ctx.rotate(Math.PI / 2);
  // The rim: the silhouette nudged out in 8 directions, each by a slightly different random amount.
  const sil = silhouette(sprite, color);
  ctx.globalAlpha = 0.55 + Math.random() * 0.45;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, d = thickness * (0.6 + Math.random() * 0.8);
    ctx.drawImage(sil, -width / 2 + Math.cos(a) * d, -CRAFT_LENGTH / 2 + Math.sin(a) * d, width, CRAFT_LENGTH);
  }
  // White-hot core just outside the hull.
  const core = silhouette(sprite, '#ffffff');
  ctx.globalAlpha = 0.35 + Math.random() * 0.35;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.drawImage(core, -width / 2 + Math.cos(a), -CRAFT_LENGTH / 2 + Math.sin(a), width, CRAFT_LENGTH);
  }
  ctx.restore();

  // Lightning: a few jagged arcs that jump around the hull, redrawn somewhere new each frame.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'miter';
  const rx = CRAFT_LENGTH / 2 + thickness + 2, ry = width / 2 + thickness + 2;
  const arcs = 2 + Math.floor(Math.random() * 2);
  for (let n = 0; n < arcs; n++) {
    const start = Math.random() * Math.PI * 2, span = 0.5 + Math.random() * 0.6;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = start + (span * k) / 6;
      const out = k === 0 || k === 6 ? 0 : (Math.random() - 0.3) * 7;
      pts.push([Math.cos(t) * (rx + out), Math.sin(t) * (ry + out)]);
    }
    for (const [w, style] of [[3, color], [1, '#ffffff']] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = style;
      ctx.globalAlpha = w === 3 ? 0.7 : 0.9;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * The draft: while a car is towed, flowing wavy air lines run from its nose up to the tail of
 * the car it's following, in the follower's exhaust color, drifting forward as if sucked along.
 */
function drawSlipstreams(ctx: CanvasRenderingContext2D, cars: Car[], time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const car of cars) {
    const c = car.craft, lead = c.slipFrom;
    if (!lead || c.slipstream < 0.05) continue;
    const ax = c.pos.x + Math.cos(c.heading) * CRAFT_LENGTH * 0.45;
    const ay = c.pos.y + Math.sin(c.heading) * CRAFT_LENGTH * 0.45;
    const bx = lead.pos.x - Math.cos(lead.heading) * CRAFT_LENGTH * 0.5;
    const by = lead.pos.y - Math.sin(lead.heading) * CRAFT_LENGTH * 0.5;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 4) continue;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const steps = Math.max(6, Math.round(len / 8));
    for (const lane of [-1, 0, 1]) {
      ctx.strokeStyle = `hsla(${car.hue}, 100%, 72%, ${c.slipstream * (lane === 0 ? 0.55 : 0.35)})`;
      ctx.lineWidth = lane === 0 ? 2.5 : 1.5;
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -time * 160;     // dashes stream toward the car ahead
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        // Lanes start wide at our nose and pinch in to the leader's tail, with a travelling wave.
        const spread = lane * 16 * (1 - t * 0.75);
        const wave = Math.sin(t * len / 22 - time * 14 + lane) * 2.5 * (1 - t * 0.5);
        const x = ax + ux * len * t + px * (spread + wave);
        const y = ay + uy * len * t + py * (spread + wave);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draw the sprite centered on the origin, pointing along +x (the heading). */
function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite): void {
  const width = CRAFT_LENGTH * sprite.aspect;
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sprite.canvas!, -width / 2, -CRAFT_LENGTH / 2, width, CRAFT_LENGTH);
}

function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, c: Craft, toast: Toast | null, locked: boolean, hud: RaceHud, touch = false): void {
  ctx.save();
  // The dash is laid out at normal size, then scaled up from the bottom-right corner.
  ctx.save();
  ctx.translate(w - 24, h - 24);
  ctx.scale(hudScale(w, h), hudScale(w, h));
  const x = -236, y = -168;
  ctx.fillStyle = 'rgba(26,20,16,0.78)';
  roundRect(ctx, x, y, 236, 168, 12);
  ctx.fill();

  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#a89d8a';
  ctx.fillText('SPEED', x + 16, y + 26);

  // WIND badge (riding another dragon's tailwind): lit while it's carrying you, outlined once it can.
  if (c.drsOpen || hud.drsAvailable) {
    const bx0 = x + 98, by0 = y + 12;
    ctx.save();
    roundRect(ctx, bx0, by0, 46, 20, 5);
    if (c.drsOpen) {
      ctx.fillStyle = '#4dff9a';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(138, 147, 192, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.drsOpen ? '#07080f' : 'rgba(138, 147, 192, 0.8)';
    ctx.fillText('WIND', bx0 + 23, by0 + 14);
    ctx.restore();
  }

  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(String(Math.round(c.speed / 4)), x + 16, y + 68);
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#a89d8a';
  ctx.fillText('km/h', x + 100, y + 68);

  // Speed bar: how close the dragon is to its top speed.
  const bx = x + 16, by = y + 86, bw = 204, bh = 10, sf = Math.min(1, c.speed / 880);
  ctx.fillStyle = '#3a2e24';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = sf > 0.92 ? '#e3b26c' : '#8fd0e0';
  ctx.fillRect(bx, by, bw * sf, bh);

  // Heat meter: green while cool, orange once it's costing speed, flashing red when overheated.
  const heatColor = c.overheated ? '#ff3d3d' : c.heat > 0.6 ? '#ffb02e' : '#4dff9a';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillStyle = c.overheated ? heatColor : '#a89d8a';
  ctx.fillStyle = c.cooling ? '#8feaff' : ctx.fillStyle;
  ctx.fillText(c.cooling ? 'COOLING' : c.overheated ? 'OVERHEAT' : 'HEAT', bx, y + 116);
  ctx.fillStyle = '#3a2e24';
  ctx.fillRect(bx + 80, y + 108, bw - 80, 6);
  ctx.globalAlpha = c.overheated ? 0.55 + 0.45 * Math.sin(performance.now() / 90) : 1;
  ctx.fillStyle = heatColor;
  ctx.fillRect(bx + 80, y + 108, (bw - 80) * c.heat, 6);
  ctx.globalAlpha = 1;

  // ERS energy: violet, brighter while deploying.
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillStyle = c.deploying ? '#d9a6ff' : '#a89d8a';
  ctx.fillText(c.deploying ? 'BREATHING FIRE' : 'FIRE (W)', bx, y + 136);
  ctx.fillStyle = '#3a2e24';
  ctx.fillRect(bx + 80, y + 128, bw - 80, 6);
  ctx.fillStyle = c.deploying ? '#d9a6ff' : '#9d5cff';
  if (c.energy >= ENERGY_FULL) {
    // Full battery: the bar flickers with charge and a spark jumps along it.
    const flicker = Math.random();
    ctx.fillStyle = flicker > 0.8 ? '#ffffff' : `rgb(${Math.round(160 + flicker * 60)}, ${Math.round(95 + flicker * 70)}, 255)`;
    ctx.fillRect(bx + 80, y + 128, bw - 80, 6);
    const sx = bx + 80 + Math.random() * (bw - 80);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 6, y + 126); ctx.lineTo(sx - 1, y + 131); ctx.lineTo(sx + 2, y + 127); ctx.lineTo(sx + 7, y + 133);
    ctx.stroke();
  } else {
    ctx.fillRect(bx + 80, y + 128, (bw - 80) * c.energy, 6);
  }

  // Slipstream meter: only shown while towing.
  if (c.slipstream > 0.05) {
    ctx.globalAlpha = clamp(c.slipstream * 2, 0, 1);
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#dff4ff';
    ctx.fillText('IN THE WAKE', bx, y + 156);
    ctx.fillStyle = '#3a2e24';
    ctx.fillRect(bx + 80, y + 148, bw - 80, 6);
    ctx.fillStyle = '#dff4ff';
    ctx.fillRect(bx + 80, y + 148, (bw - 80) * c.slipstream, 6);
    ctx.globalAlpha = 1;
  }

  // Gear pips.
  for (let i = 0; i < GEARS.length; i++) {
    ctx.fillStyle = i <= c.gear ? '#8fd0e0' : '#2a3060';
    ctx.fillRect(x + 168 + i * 11, y + 34, 8, 4);
  }
  ctx.restore();

  if (toast && toast.t > 0) {
    ctx.globalAlpha = clamp(toast.t / 0.3, 0, 1);
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.text, w / 2, h * 0.22);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  ctx.font = '500 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(224,214,194,0.7)';
  const help = 'A / D or ← / →: steer   S / ↓ / Space: brake   W / ↑ / Shift: boost   Hold R: restart   Esc: pause';
  if (!touch) ctx.fillText(help, 16, h - 16);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
