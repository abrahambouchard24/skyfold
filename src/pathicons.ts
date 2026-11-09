/**
 * Symbols for a sprint's fork lanes, drawn with plain strokes like marks carved or painted on wood:
 * the same pictures go on the island signs (view3d.ts) and on the HUD pill (render.ts), so no
 * lane is ever named in words.
 *
 *   jump    a leaping arc over a gap
 *   charge  the storm: a jagged bolt (the gale gathers on this lane)
 *   cool    frost: a six-armed ice star
 *   boost   a gust: three streaming wind lines
 *   fire    a flame
 *   inside  a tight hooked arrow (the short, tight line through a bend)
 *   wide    a long sweeping arrow (the longer, faster line round the outside)
 *   road    a straight arrow (a plain lane)
 */
export type PathIcon = 'jump' | 'charge' | 'cool' | 'boost' | 'fire' | 'inside' | 'wide' | 'road';

/**
 * Draws `icon` centred on (cx, cy), about `size` px across, in `color`.
 * `bend` mirrors the curved arrows: 1 bends left, -1 bends right.
 */
export function drawPathIcon(g: CanvasRenderingContext2D, icon: PathIcon, cx: number, cy: number, size: number, color: string, bend: 1 | -1 = 1): void {
  const s = size / 2;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = Math.max(1.5, size * 0.11);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const head = (x: number, y: number, ang: number, len = s * 0.42) => {
    g.beginPath();
    g.moveTo(x + Math.cos(ang + 2.5) * len, y + Math.sin(ang + 2.5) * len);
    g.lineTo(x, y);
    g.lineTo(x + Math.cos(ang - 2.5) * len, y + Math.sin(ang - 2.5) * len);
    g.stroke();
  };
  switch (icon) {
    case 'jump': {
      // The gap below, and an arc leaping over it.
      g.beginPath(); g.moveTo(-s, s * 0.75); g.lineTo(-s * 0.45, s * 0.75); g.moveTo(s * 0.45, s * 0.75); g.lineTo(s, s * 0.75); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.85, s * 0.45); g.quadraticCurveTo(0, -s * 1.25, s * 0.8, s * 0.35); g.stroke();
      head(s * 0.8, s * 0.35, Math.atan2(s * 0.8, s * 0.8));
      break;
    }
    case 'charge': {
      g.beginPath();
      g.moveTo(s * 0.25, -s); g.lineTo(-s * 0.4, s * 0.05); g.lineTo(s * 0.35, s * 0.05); g.lineTo(-s * 0.25, s);
      g.stroke();
      break;
    }
    case 'cool': {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * s, sa * s); g.stroke();
        const bx = ca * s * 0.58, by = sa * s * 0.58, b = s * 0.3;
        g.beginPath();
        g.moveTo(bx + Math.cos(a + 0.8) * b, by + Math.sin(a + 0.8) * b); g.lineTo(bx, by); g.lineTo(bx + Math.cos(a - 0.8) * b, by + Math.sin(a - 0.8) * b);
        g.stroke();
      }
      break;
    }
    case 'boost': {
      for (const [y, x0, x1] of [[-s * 0.55, -s, s * 0.6], [0, -s * 0.6, s], [s * 0.55, -s, s * 0.4]] as const) {
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x1 - s * 0.25, y);
        g.arc(x1 - s * 0.25, y - s * 0.2, s * 0.2, Math.PI / 2, -Math.PI * 0.6, true);
        g.stroke();
      }
      break;
    }
    case 'fire': {
      g.beginPath();
      g.moveTo(0, -s); g.quadraticCurveTo(s * 0.9, -s * 0.1, s * 0.55, s * 0.6); g.quadraticCurveTo(0, s * 1.1, -s * 0.55, s * 0.6);
      g.quadraticCurveTo(-s * 0.9, -s * 0.1, 0, -s); g.stroke();
      break;
    }
    case 'inside': {
      // Tight hook: up a short way, then a sharp turn.
      g.scale(-bend, 1);
      g.beginPath(); g.moveTo(-s * 0.35, s); g.lineTo(-s * 0.35, -s * 0.05); g.arc(s * 0.1, -s * 0.05, s * 0.45, Math.PI, Math.PI * 1.5); g.lineTo(s * 0.75, -s * 0.5); g.stroke();
      head(s * 0.85, -s * 0.5, 0);
      break;
    }
    case 'wide': {
      // A long sweep out and round.
      g.scale(-bend, 1);
      g.beginPath(); g.moveTo(-s * 0.7, s); g.bezierCurveTo(-s * 1.05, -s * 0.2, -s * 0.4, -s * 0.95, s * 0.65, -s * 0.8); g.stroke();
      head(s * 0.75, -s * 0.8, -0.1);
      break;
    }
    case 'road': {
      g.beginPath(); g.moveTo(0, s); g.lineTo(0, -s * 0.85); g.stroke();
      head(0, -s * 0.9, -Math.PI / 2);
      break;
    }
  }
  g.restore();
}
