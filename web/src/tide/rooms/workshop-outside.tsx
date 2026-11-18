import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Precipitation, SunShine, viewValue, weatherView, type SunSurface, type SunWindow } from '../weather';
import { BACK_BENCH, TABLE } from '../workshop/plan';
import { REVEAL, ROOM, WIN_BACK, WIN_SIDE } from './workshop-dims';
import { rand, softDot } from './workshop-kit';
import { workshopLightLevels } from './workshop-lights';

// The night outside the two windows. The workshop stands at the top of a
// village on a hill: through the back window, the cobbled lane, a low stone
// wall and a gas lamp, and below them the village's roofs and chimneys, the
// church spire, the wooded hills and the sky; through the side window, the
// lane running down between gabled, half-timbered houses with lit windows.
// Each painted layer has a clear night, a wet, a snowy and a sunny-day version
// that the weather crossfades between (painted only when that weather comes):
// wet cobbles that mirror the lamps in rain, snow on every roof and ledge,
// stars and the moon on a clear night, and on a sunny day green hills, red
// roofs and the lane's painted plaster in the sun, with the lamps out and the
// sun coming in through both windows (SunShine). Rain or snow falls between
// the glass and the houses.

type Look = 'clear' | 'wet' | 'snow' | 'sun';

const BZ = ROOM.back;

/** A canvas painted for one look, as a texture (built on demand by the weather). */
function painted(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, alpha = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (alpha) t.premultiplyAlpha = false;
  return t;
}

// ---------- painting helpers ----------

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number) {
  const b = g.createRadialGradient(x, y, 0, x, y, r);
  b.addColorStop(0, `rgba(${col},${a})`);
  b.addColorStop(0.35, `rgba(${col},${a * 0.45})`);
  b.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = b;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Where a layer's world units land on its canvas. */
type Frame = { px: (x: number) => number; py: (y: number) => number; s: number };
function frameOf(w: number, h: number, x0: number, x1: number, y0: number, y1: number): Frame {
  return { px: (x) => ((x - x0) / (x1 - x0)) * w, py: (y) => ((y1 - y) / (y1 - y0)) * h, s: w / (x1 - x0) };
}

const SNOW = '#e6ebf3';
const SNOW_SHADE = '#b9c3d6';

/** A lit (or dark) window with mullions, a sill, maybe a candle or a plant on it, and shutters. */
function cottageWindow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: number, look: Look, r: () => number, o: { shutters?: string; box?: boolean; candle?: boolean } = {}) {
  const day = look === 'sun';
  if (lit > 0 && !day) glow(g, x + w / 2, y + h / 2, Math.max(w, h) * (look === 'wet' ? 1.7 : 1.3), '255,190,110', (look === 'wet' ? 0.34 : 0.26) * lit);
  const grad = g.createLinearGradient(x, y, x, y + h);
  if (day) {
    // by day the glass shows the sky, darker where the room behind shows through
    grad.addColorStop(0, '#bdd2e4');
    grad.addColorStop(1, lit > 0 ? '#5a6878' : '#6f8296');
  } else if (lit > 0) {
    grad.addColorStop(0, '#ffd99a');
    grad.addColorStop(1, '#e89a50');
  } else {
    grad.addColorStop(0, '#1c2030');
    grad.addColorStop(1, '#10121c');
  }
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  if (lit > 0) {
    // a curtain drawn to each side, a silhouette on the sill
    g.fillStyle = day ? 'rgba(206,84,60,0.85)' : 'rgba(160,60,40,0.55)';
    g.fillRect(x, y, w * 0.2, h);
    g.fillRect(x + w * 0.8, y, w * 0.2, h);
    if (o.candle) {
      g.fillStyle = day ? 'rgba(236,226,200,0.9)' : 'rgba(60,30,14,0.85)';
      g.fillRect(x + w * 0.47, y + h * 0.62, w * 0.06, h * 0.32);
      if (!day) glow(g, x + w * 0.5, y + h * 0.56, w * 0.18, '255,240,200', 0.9);
    } else {
      g.fillStyle = day ? 'rgba(64,104,52,0.9)' : 'rgba(50,30,18,0.75)';
      g.beginPath();
      g.ellipse(x + w * 0.5, y + h * 0.86, w * 0.13, h * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + w * 0.42, y + h * 0.88, w * 0.16, h * 0.12);
    }
  }
  if (day) {
    // the head of the opening shades the top of the glass
    const sh = g.createLinearGradient(0, y, 0, y + h * 0.35);
    sh.addColorStop(0, 'rgba(30,22,16,0.35)');
    sh.addColorStop(1, 'rgba(30,22,16,0)');
    g.fillStyle = sh;
    g.fillRect(x, y, w, h * 0.35);
  }
  // mullions and the frame (painted cream by day)
  g.strokeStyle = day ? 'rgba(238,232,216,0.95)' : 'rgba(40,26,16,0.95)';
  g.lineWidth = Math.max(2, w * 0.06);
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w / 2, y + h);
  g.moveTo(x, y + h * 0.45);
  g.lineTo(x + w, y + h * 0.45);
  g.stroke();
  g.lineWidth = Math.max(3, w * 0.09);
  g.strokeRect(x, y, w, h);
  if (o.shutters) {
    g.fillStyle = o.shutters;
    for (const sx of [x - w * 0.42, x + w + w * 0.04]) {
      g.fillRect(sx, y - h * 0.02, w * 0.38, h * 1.04);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) {
        g.beginPath();
        g.moveTo(sx + 2, y + (h * k) / 5);
        g.lineTo(sx + w * 0.38 - 2, y + (h * k) / 5);
        g.stroke();
      }
    }
  }
  // the sill, and a flower box with red geraniums
  g.fillStyle = day ? '#b39c80' : '#3a2a1e';
  g.fillRect(x - w * 0.08, y + h, w * 1.16, Math.max(3, h * 0.07));
  if (o.box) {
    g.fillStyle = day ? '#8a5a34' : '#5a3a22';
    g.fillRect(x - w * 0.05, y + h + h * 0.07, w * 1.1, h * 0.16);
    for (let i = 0; i < 14; i++) {
      const fx = x + r() * w;
      const fy = y + h + h * 0.04 - r() * h * 0.12;
      const c0 = r();
      const c1 = r();
      g.fillStyle = day ? `rgba(${70 + c0 * 30},${122 + c1 * 40},50,0.95)` : `rgba(${40 + c0 * 20},${70 + c1 * 30},${36},0.95)`;
      g.beginPath();
      g.arc(fx, fy, w * 0.05, 0, Math.PI * 2);
      g.fill();
      if (look !== 'snow' && r() < 0.6) {
        g.fillStyle = day ? '#ec4a30' : lit > 0 ? '#e0402c' : '#a8281c';
        g.beginPath();
        g.arc(fx + w * 0.02, fy - w * 0.03, w * 0.035, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  if (look === 'snow') {
    g.fillStyle = SNOW;
    g.beginPath();
    g.ellipse(x + w / 2, y + h + 1, w * 0.62, Math.max(3, h * 0.06), 0, Math.PI, 0);
    g.fill();
    if (o.box) {
      g.beginPath();
      g.ellipse(x + w / 2, y + h + h * 0.07, w * 0.6, Math.max(3, h * 0.08), 0, Math.PI, 0);
      g.fill();
    }
  }
}

/** Half-timbering over a plaster wall: posts, rails and braces in dark oak. */
function halfTimber(g: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, beam: number, r: () => number, tone = '#2a1a10') {
  g.fillStyle = tone;
  const w = x1 - x0;
  const posts = Math.max(2, Math.round(w / (beam * 9)));
  for (let i = 0; i <= posts; i++) {
    const x = x0 + (w * i) / posts;
    g.fillRect(x - beam / 2, y0, beam, y1 - y0);
  }
  for (const y of [y0, (y0 + y1) / 2, y1 - beam]) g.fillRect(x0, y - beam / 2, w, beam);
  g.strokeStyle = tone;
  g.lineWidth = beam * 0.8;
  for (let i = 0; i < posts; i++) {
    if (r() < 0.45) continue;
    const xa = x0 + (w * i) / posts;
    const xb = x0 + (w * (i + 1)) / posts;
    const ym = (y0 + y1) / 2;
    g.beginPath();
    if (r() < 0.5) {
      g.moveTo(xa, ym);
      g.lineTo(xb, y1 - beam);
    } else {
      g.moveTo(xa, y1 - beam);
      g.lineTo(xb, ym);
    }
    g.stroke();
  }
}

/** A steep roof seen from the front: a triangle (gable end) or a slope, tiled, with snow or a wet sheen. */
function gableRoof(g: CanvasRenderingContext2D, x0: number, x1: number, eave: number, ridge: number, tone: string, look: Look) {
  const cx = (x0 + x1) / 2;
  const over = (x1 - x0) * 0.06;
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(x0 - over, eave);
  g.lineTo(cx, ridge);
  g.lineTo(x1 + over, eave);
  g.closePath();
  g.fill();
  if (look === 'snow') {
    g.fillStyle = SNOW;
    g.beginPath();
    g.moveTo(x0 - over - 2, eave + 2);
    g.lineTo(cx, ridge - 3);
    g.lineTo(x1 + over + 2, eave + 2);
    g.lineTo(x1 + over - (x1 - x0) * 0.08, eave + 2);
    g.lineTo(cx, ridge + (eave - ridge) * 0.22);
    g.lineTo(x0 - over + (x1 - x0) * 0.08, eave + 2);
    g.closePath();
    g.fill();
  }
  if (look === 'sun') {
    // the sun from the upper left: the left slope lit, the right in shade
    g.fillStyle = 'rgba(255,226,180,0.22)';
    g.beginPath();
    g.moveTo(x0 - over, eave);
    g.lineTo(cx, ridge);
    g.lineTo(cx, eave);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(40,24,20,0.18)';
    g.beginPath();
    g.moveTo(cx, ridge);
    g.lineTo(x1 + over, eave);
    g.lineTo(cx, eave);
    g.closePath();
    g.fill();
  }
  // the barge boards
  g.strokeStyle = look === 'snow' ? SNOW : look === 'sun' ? '#5a3a24' : '#1a120c';
  g.lineWidth = Math.max(2, (x1 - x0) * 0.025);
  g.beginPath();
  g.moveTo(x0 - over, eave);
  g.lineTo(cx, ridge);
  g.lineTo(x1 + over, eave);
  g.stroke();
}

/** A roof seen from above and the side: a sloped plane of tiles (the village below), with its own snow or sheen. */
function roofSlope(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, skew: number, tone: string, look: Look, r: () => number) {
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(x0 + skew, top);
  g.lineTo(x1 + skew, top);
  g.lineTo(x1, bottom);
  g.lineTo(x0, bottom);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  if (look === 'snow') {
    const sg = g.createLinearGradient(0, top, 0, bottom);
    sg.addColorStop(0, '#eef2f8');
    sg.addColorStop(1, '#c4cede');
    g.fillStyle = sg;
    g.fillRect(x0 - 20, top - 2, x1 - x0 + 40 + Math.abs(skew), bottom - top + 4);
    g.fillStyle = 'rgba(150,165,190,0.35)';
    for (let x = x0; x < x1 + skew; x += 9 + r() * 6) g.fillRect(x, top, 1.2, bottom - top);
  } else {
    for (let y = top + 3; y < bottom; y += 4) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0 - 10, y, x1 - x0 + 20 + Math.abs(skew), 1.2);
    }
    if (look === 'wet') {
      const sg = g.createLinearGradient(0, top, 0, bottom);
      sg.addColorStop(0, 'rgba(150,170,205,0.05)');
      sg.addColorStop(1, 'rgba(150,170,205,0.22)');
      g.fillStyle = sg;
      g.fillRect(x0 - 10, top, x1 - x0 + 20 + Math.abs(skew), bottom - top);
    } else if (look === 'sun') {
      g.fillStyle = 'rgba(255,226,180,0.2)';
      g.fillRect(x0 - 10, top, x1 - x0 + 20 + Math.abs(skew), (bottom - top) * 0.45);
    } else {
      g.fillStyle = 'rgba(140,150,190,0.08)';
      g.fillRect(x0 - 10, top, x1 - x0 + 20 + Math.abs(skew), (bottom - top) * 0.3);
    }
  }
  g.restore();
}

/** A chimney with a pot and (often) a curl of smoke. */
function chimney(g: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, look: Look, smoke: boolean, r: () => number) {
  const day = look === 'sun';
  g.fillStyle = day ? '#8c4c38' : '#3a2620';
  g.fillRect(x - w / 2, base - h, w, h);
  g.fillStyle = day ? '#5c3424' : '#2a1a14';
  g.fillRect(x - w * 0.6, base - h - w * 0.2, w * 1.2, w * 0.22);
  if (look === 'snow') {
    g.fillStyle = SNOW;
    g.beginPath();
    g.ellipse(x, base - h - w * 0.2, w * 0.66, w * 0.18, 0, Math.PI, 0);
    g.fill();
  }
  if (smoke) {
    let sx = x;
    let sy = base - h - w * 0.4;
    for (let i = 0; i < 9; i++) {
      const rad = w * (0.5 + i * 0.32);
      g.fillStyle = `rgba(${look === 'snow' ? '210,210,222' : day ? '236,236,240' : '160,160,175'},${(day ? 0.16 : 0.12) - i * (day ? 0.016 : 0.011)})`;
      g.beginPath();
      g.ellipse(sx, sy, rad, rad * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      sx += w * (0.5 + r() * 0.4);
      sy -= w * (0.7 + r() * 0.3);
    }
  }
}

/** A fir tree: tiers of drooping boughs, snow on each tier in the snow. */
function fir(g: CanvasRenderingContext2D, x: number, base: number, h: number, look: Look, r: () => number, tone = '#13241c') {
  const tiers = 6;
  g.fillStyle = '#1a120c';
  g.fillRect(x - h * 0.025, base - h * 0.12, h * 0.05, h * 0.12);
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const yb = base - h * 0.1 - t0 * h * 0.82;
    const yt = yb - h * 0.3;
    const wd = h * 0.36 * (1 - t0 * 0.8);
    g.fillStyle = tone;
    g.beginPath();
    g.moveTo(x - wd, yb);
    g.quadraticCurveTo(x - wd * 0.4, yb - h * 0.04, x, yt);
    g.quadraticCurveTo(x + wd * 0.4, yb - h * 0.04, x + wd, yb);
    g.quadraticCurveTo(x, yb - h * 0.05, x - wd, yb);
    g.fill();
    if (look === 'sun') {
      // the boughs catching the sun on the left
      g.fillStyle = 'rgba(190,220,120,0.22)';
      g.beginPath();
      g.moveTo(x - wd, yb);
      g.quadraticCurveTo(x - wd * 0.4, yb - h * 0.04, x, yt);
      g.quadraticCurveTo(x - wd * 0.1, yb - h * 0.02, x - wd * 0.2, yb - h * 0.01);
      g.closePath();
      g.fill();
    }
    if (look === 'snow') {
      g.fillStyle = SNOW;
      g.beginPath();
      g.moveTo(x - wd * 0.9, yb - h * 0.015);
      g.quadraticCurveTo(x - wd * 0.35, yb - h * 0.06, x, yt + h * 0.02);
      g.quadraticCurveTo(x + wd * 0.35, yb - h * 0.06, x + wd * 0.9, yb - h * 0.015);
      g.quadraticCurveTo(x, yb - h * 0.08 - r() * h * 0.02, x - wd * 0.9, yb - h * 0.015);
      g.fill();
    }
  }
}

/** A gas lamp on a fluted post: the lantern glows, its light pools below. */
function lampPost(g: CanvasRenderingContext2D, x: number, base: number, top: number, s: number, look: Look) {
  const day = look === 'sun';
  const lit = '255,206,140';
  if (!day) glow(g, x, top + s * 0.25, s * (look === 'wet' ? 5.2 : 4), lit, look === 'snow' ? 0.5 : 0.42);
  g.fillStyle = day ? '#25302a' : '#121014';
  // the post: a base, a tapering column, a crossbar for a ladder
  g.fillRect(x - s * 0.22, base - s * 0.5, s * 0.44, s * 0.5);
  g.beginPath();
  g.moveTo(x - s * 0.12, base - s * 0.5);
  g.lineTo(x - s * 0.07, top + s * 0.75);
  g.lineTo(x + s * 0.07, top + s * 0.75);
  g.lineTo(x + s * 0.12, base - s * 0.5);
  g.fill();
  g.fillRect(x - s * 0.32, top + s * 0.8, s * 0.64, s * 0.06);
  // the lantern: a glowing glass box under a cap
  const lg = g.createLinearGradient(0, top, 0, top + s * 0.6);
  lg.addColorStop(0, day ? '#e4ebf0' : '#fff2cc');
  lg.addColorStop(1, day ? '#9aaab6' : '#ffc070');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(x - s * 0.22, top);
  g.lineTo(x + s * 0.22, top);
  g.lineTo(x + s * 0.16, top + s * 0.6);
  g.lineTo(x - s * 0.16, top + s * 0.6);
  g.closePath();
  g.fill();
  g.strokeStyle = day ? '#25302a' : '#121014';
  g.lineWidth = Math.max(1.5, s * 0.035);
  g.beginPath();
  g.moveTo(x, top);
  g.lineTo(x, top + s * 0.6);
  g.stroke();
  g.fillStyle = day ? '#25302a' : '#121014';
  g.beginPath();
  g.moveTo(x - s * 0.3, top + 1);
  g.lineTo(x, top - s * 0.28);
  g.lineTo(x + s * 0.3, top + 1);
  g.fill();
  g.fillRect(x - s * 0.05, top - s * 0.4, s * 0.1, s * 0.14);
  if (look === 'snow') {
    g.fillStyle = SNOW;
    g.beginPath();
    g.ellipse(x, top - s * 0.18, s * 0.3, s * 0.08, 0, Math.PI, 0);
    g.fill();
  }
}

/** Cobbles laid in rows that shrink toward the far side of the lane; wet, dry or under snow. */
function cobbles(g: CanvasRenderingContext2D, w: number, top: number, bottom: number, look: Look, lights: [number, string][], r: () => number) {
  if (look === 'snow') {
    const sg = g.createLinearGradient(0, top, 0, bottom);
    sg.addColorStop(0, '#aab3c6');
    sg.addColorStop(1, '#d6dce8');
    g.fillStyle = sg;
    g.fillRect(0, top, w, bottom - top);
    // a few cobbles showing through where the cart wheels ran, footprints, a sled's tracks
    for (const lane of [0.32, 0.38, 0.66, 0.72]) {
      g.strokeStyle = 'rgba(120,128,150,0.55)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(w * lane - 30, bottom);
      g.lineTo(w * lane + 10, top);
      g.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      g.fillStyle = 'rgba(120,130,155,0.5)';
      g.beginPath();
      g.ellipse(w * (0.5 + Math.sin(i * 0.9) * 0.04) + (i % 2 ? 8 : -8), bottom - (bottom - top) * t, 6 * (1 - t * 0.6), 3 * (1 - t * 0.6), 0, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, col] of lights) glow(g, x, top + (bottom - top) * 0.2, (bottom - top) * 0.8, col, 0.22);
    return;
  }
  const day = look === 'sun';
  g.fillStyle = look === 'wet' ? '#121318' : day ? '#857c70' : '#262320';
  g.fillRect(0, top, w, bottom - top);
  let y = bottom;
  let row = 0;
  while (y > top) {
    const t = (bottom - y) / (bottom - top);
    const rh = Math.max(2.5, (bottom - top) * 0.075 * (1 - t * 0.85));
    const sw = rh * 1.5;
    for (let x = (row % 2) * sw * 0.5 - sw; x < w + sw; x += sw * (0.9 + r() * 0.25)) {
      const tone = look === 'wet' ? 22 + r() * 16 : day ? 132 + r() * 44 : 40 + r() * 24;
      const grad = g.createRadialGradient(x, y - rh * 0.65, 1, x, y - rh * 0.5, sw * 0.6);
      grad.addColorStop(0, `rgb(${tone + 14},${tone + 14},${tone + (look === 'wet' ? 26 : 20)})`);
      grad.addColorStop(1, `rgb(${tone * 0.6},${tone * 0.58},${tone * 0.6 + (look === 'wet' ? 6 : 0)})`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y - rh * 0.5, sw * 0.44, rh * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    }
    y -= rh;
    row++;
  }
  if (look === 'wet') {
    // the lamps and windows doubled in the wet stones, streaked downward; puddles with the sky in them
    for (const [x, col] of lights) {
      for (let k = 0; k < 10; k++) {
        g.fillStyle = `rgba(${col},${0.13 - k * 0.011})`;
        g.fillRect(x - 9 - k * 2.5, top + k * ((bottom - top) / 11), 18 + k * 5, (bottom - top) / 11);
      }
      glow(g, x, top + (bottom - top) * 0.3, (bottom - top) * 0.6, col, 0.22);
    }
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(110,130,170,0.2)';
      g.beginPath();
      g.ellipse(r() * w, top + (bottom - top) * (0.25 + r() * 0.7), 26 + r() * 50, 5 + r() * 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (day) {
    // warm sun on the stones
    g.fillStyle = 'rgba(255,228,184,0.12)';
    g.fillRect(0, top, w, bottom - top);
  } else {
    // moonlight on the stones' tops, a little frost
    g.fillStyle = 'rgba(170,185,220,0.07)';
    g.fillRect(0, top, w, bottom - top);
    for (const [x, col] of lights) glow(g, x, top + (bottom - top) * 0.25, (bottom - top) * 0.6, col, 0.14);
  }
}

/** A dry-stone wall along the lane's far side: rounded stones, a coping, snow on top in the snow. */
function stoneWall(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, look: Look, r: () => number) {
  const day = look === 'sun';
  g.fillStyle = look === 'wet' ? '#1c1c20' : day ? '#8a8278' : '#2e2a28';
  g.fillRect(x0, top, x1 - x0, bottom - top);
  const rows = 5;
  const rh = (bottom - top) / rows;
  for (let j = 0; j < rows; j++) {
    for (let x = x0 - r() * 20; x < x1; x += rh * (1.3 + r() * 0.9)) {
      const tone = look === 'wet' ? 24 + r() * 16 : look === 'snow' ? 48 + r() * 24 : day ? 150 + r() * 44 : 36 + r() * 24;
      g.fillStyle = `rgb(${tone},${tone * 0.95},${tone * 0.9})`;
      g.beginPath();
      g.ellipse(x + rh * 0.6, top + rh * (j + 0.5), rh * (0.55 + r() * 0.2), rh * 0.42, (r() - 0.5) * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = look === 'snow' ? SNOW : day ? '#b2aa9e' : '#3a3634';
  g.beginPath();
  g.moveTo(x0, top + 3);
  for (let x = x0; x <= x1; x += 14) g.lineTo(x, top - (look === 'snow' ? 6 + r() * 5 : 2 + r() * 3));
  g.lineTo(x1, top + 4);
  g.closePath();
  g.fill();
}

/** Fair-weather clouds: soft white heaps, lit from above (their own random stream). */
function dayClouds(g: CanvasRenderingContext2D, w: number, top: number, bottom: number, seed: number, n: number) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w;
    const cy = top + (bottom - top) * Math.pow(r(), 0.8);
    const s = 26 + r() * 60 * (0.4 + (cy - top) / Math.max(1, bottom - top));
    const puffs = 5 + Math.floor(r() * 6);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (k / puffs - 0.5) * s * 3.2 + (r() - 0.5) * s * 0.6;
      const py = cy - Math.sin((k / Math.max(1, puffs - 1)) * Math.PI) * s * 0.55 + (r() - 0.5) * s * 0.2;
      const rad = s * (0.45 + r() * 0.45);
      const b = g.createRadialGradient(px - rad * 0.2, py - rad * 0.35, rad * 0.1, px, py, rad);
      b.addColorStop(0, 'rgba(255,255,255,0.6)');
      b.addColorStop(0.55, 'rgba(244,246,250,0.34)');
      b.addColorStop(1, 'rgba(214,224,238,0)');
      g.fillStyle = b;
      g.beginPath();
      g.ellipse(px, py, rad, rad * 0.62, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ---------- the far view: the village below, the hills, the sky ----------

/** The village falling away down the hill, its church, the hills and the sky. Plane spans x from X0 to X1 and y from -4 to 12. */
function paintFar(look: Look, seed: number, X0: number, X1: number, moonX: number) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = rand(seed);
    const f = frameOf(w, h, X0, X1, -4, 12);
    const { px, py, s } = f;
    // the sky, down to a low horizon (the village is below the windows)
    const day = look === 'sun';
    const sky = g.createLinearGradient(0, 0, 0, py(2.6));
    if (day) {
      sky.addColorStop(0, '#4a90da');
      sky.addColorStop(0.5, '#82bbea');
      sky.addColorStop(0.85, '#c6def0');
      sky.addColorStop(1, '#f2e6d0');
    } else if (look === 'clear') {
      sky.addColorStop(0, '#040714');
      sky.addColorStop(0.45, '#0c1632');
      sky.addColorStop(0.8, '#1e2a52');
      sky.addColorStop(1, '#3a3a5e');
    } else if (look === 'wet') {
      sky.addColorStop(0, '#07080c');
      sky.addColorStop(0.55, '#14181f');
      sky.addColorStop(0.85, '#2c2a2c');
      sky.addColorStop(1, '#4a3a30');
    } else {
      sky.addColorStop(0, '#1c1e2a');
      sky.addColorStop(0.5, '#363848');
      sky.addColorStop(0.85, '#565266');
      sky.addColorStop(1, '#6e6474');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const mx = px(moonX);
    const my = py(4.55);
    if (day) {
      // the same random draws as the night's stars, so the village stands where it does at night
      for (let i = 0; i < 700 * 3; i++) r();
      // the sun high on the left, out of sight: its warm glow over that side of the sky, and fair-weather clouds
      glow(g, w * 0.04, -h * 0.08, h * 0.9, '255,236,196', 0.5);
      dayClouds(g, w, py(11.4), py(5.2), seed + 700, 8);
    } else if (look === 'clear') {
      for (let i = 0; i < 700; i++) {
        const x = r() * w;
        const y = Math.pow(r(), 1.2) * py(3.5);
        const b = r();
        g.fillStyle = `rgba(${b > 0.6 ? '255,246,226' : '200,214,255'},${0.3 + b * 0.6})`;
        g.beginPath();
        g.arc(x, y, b > 0.97 ? 1.8 : b > 0.8 ? 1.15 : 0.7, 0, Math.PI * 2);
        g.fill();
      }
      // a full moon with a halo, and a long thin cloud across it
      glow(g, mx, my, s * 2.6, '170,195,255', 0.4);
      const disc = g.createRadialGradient(mx - s * 0.08, my - s * 0.08, s * 0.04, mx, my, s * 0.42);
      disc.addColorStop(0, '#fffdf2');
      disc.addColorStop(1, '#ddd2b6');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(mx, my, s * 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(150,140,128,0.22)';
      for (const [dx, dy, rr] of [
        [-0.12, -0.06, 0.12],
        [0.1, 0.08, 0.09],
        [-0.02, 0.17, 0.06],
        [0.15, -0.12, 0.05],
      ] as [number, number, number][]) {
        g.beginPath();
        g.arc(mx + dx * s, my + dy * s, rr * s, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(40,52,90,0.55)';
      g.beginPath();
      g.ellipse(mx + s * 0.6, my + s * 0.3, s * 1.6, s * 0.09, -0.05, 0, Math.PI * 2);
      g.fill();
    } else {
      // low cloud, lit from below by the village
      for (let i = 0; i < 170; i++) {
        const x = r() * w;
        const y = py(3.3) * (0.1 + r() * 0.9);
        const rad = s * (0.5 + r() * 1.6);
        const warm = (y / py(3.3)) * (look === 'wet' ? 0.5 : 0.35);
        g.fillStyle = look === 'wet' ? `rgba(${70 + warm * 120},${66 + warm * 60},${70 + warm * 20},0.07)` : `rgba(${150 + warm * 60},${140 + warm * 40},160,0.07)`;
        g.beginPath();
        g.ellipse(x, y, rad, rad * 0.32, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (look === 'snow') glow(g, mx, my, s * 3, '220,215,232', 0.22);
    }
    // the hills: two ranks of rolling silhouettes with firs along their tops
    const hills = [
      { base: 3.75, amp: 0.4, tone: day ? '#86a882' : look === 'snow' ? '#5a5e70' : look === 'wet' ? '#191c22' : '#141b2c', firTone: day ? '#4f7458' : look === 'snow' ? '#3e4456' : '#0e1420' },
      { base: 3.3, amp: 0.35, tone: day ? '#6b9462' : look === 'snow' ? '#7a8094' : look === 'wet' ? '#121418' : '#0d1322', firTone: day ? '#3a6444' : look === 'snow' ? '#2e3444' : '#0a0f1a' },
    ];
    hills.forEach((hl, hi) => {
      const ridge = (x: number) => py(hl.base + hl.amp * (Math.sin(x * 0.0021 * (2048 / w) * 1.3 + hi * 2 + seed) * 0.6 + Math.sin(x * 0.0057 * (2048 / w) + hi) * 0.4));
      g.fillStyle = hl.tone;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, ridge(x));
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      if (look === 'snow') {
        // snowy fields on the slopes, a little lighter toward the top
        const sg = g.createLinearGradient(0, py(hl.base + hl.amp), 0, py(hl.base - 1.0));
        sg.addColorStop(0, 'rgba(225,230,240,0.55)');
        sg.addColorStop(1, 'rgba(225,230,240,0.1)');
        g.save();
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, ridge(x));
        g.lineTo(w, h);
        g.clip();
        g.fillStyle = sg;
        g.fillRect(0, 0, w, h);
        g.restore();
      }
      for (let x = r() * 20; x < w; x += s * (0.12 + r() * 0.3)) {
        if (r() < 0.3) continue;
        fir(g, x, ridge(x) + s * 0.06, s * (0.22 + r() * 0.22) * (hi ? 1.2 : 0.8), look, r, hl.firTone);
      }
    });
    // the church: a nave and a tall spire with a lit belfry, below the hills (pale stone and slate by day)
    const cx = px(moonX + 2.6);
    const cb = py(1.6);
    g.fillStyle = day ? '#cfc6b6' : look === 'snow' ? '#2c2c38' : '#0e0f18';
    g.fillRect(cx - s * 0.3, py(3.55), s * 0.6, cb - py(3.55));
    g.beginPath();
    g.moveTo(cx - s * 0.36, py(3.55));
    g.lineTo(cx, py(5.05));
    g.lineTo(cx + s * 0.36, py(3.55));
    g.fill();
    g.fillRect(cx + s * 0.25, py(2.85), s * 1.3, cb - py(2.85));
    if (day) {
      // the spire's slate, and the stone in the sun on its left
      g.fillStyle = '#5c6470';
      g.beginPath();
      g.moveTo(cx - s * 0.36, py(3.55));
      g.lineTo(cx, py(5.05));
      g.lineTo(cx + s * 0.36, py(3.55));
      g.fill();
      g.fillStyle = 'rgba(255,230,190,0.25)';
      g.fillRect(cx - s * 0.3, py(3.55), s * 0.2, cb - py(3.55));
    }
    gableRoof(g, cx + s * 0.22, cx + s * 1.6, py(2.85), py(3.3), day ? '#5c6470' : look === 'snow' ? '#2c2c38' : '#0e0f18', look);
    if (!day) glow(g, cx, py(3.3), s * 0.45, '255,200,120', 0.45);
    g.fillStyle = day ? '#3a3a40' : '#ffcf80';
    g.beginPath();
    g.moveTo(cx - s * 0.08, py(3.15));
    g.lineTo(cx - s * 0.08, py(3.38));
    g.quadraticCurveTo(cx, py(3.5), cx + s * 0.08, py(3.38));
    g.lineTo(cx + s * 0.08, py(3.15));
    g.fill();
    for (const wx of [0.5, 0.85, 1.2]) {
      g.fillStyle = day ? 'rgba(80,96,116,0.85)' : 'rgba(255,190,110,0.85)';
      g.fillRect(cx + s * wx, py(2.5), s * 0.1, s * 0.24);
    }
    if (look === 'snow') {
      g.strokeStyle = SNOW;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - s * 0.36, py(3.55));
      g.lineTo(cx, py(5.05));
      g.stroke();
    }
    // the village below: ranks of roofs falling away, gable ends with lit windows, chimneys and smoke
    const ranks = [
      { top: 3.05, drop: 0.45, tone: day ? '#b0705a' : look === 'snow' ? '#3a3846' : look === 'wet' ? '#1a1a20' : '#191a28', wall: day ? '#e0d2b6' : look === 'snow' ? '#4a4450' : '#2a2430', lit: 0.45, scale: 0.75 },
      { top: 2.6, drop: 0.55, tone: day ? '#a85e46' : look === 'snow' ? '#2e2c38' : look === 'wet' ? '#121216' : '#11121e', wall: day ? '#d8c6a4' : look === 'snow' ? '#3e3844' : '#221c26', lit: 0.55, scale: 1.0 },
      { top: 2.05, drop: 0.7, tone: day ? '#9a4e38' : look === 'snow' ? '#24222c' : look === 'wet' ? '#0c0c10' : '#0b0c16', wall: day ? '#cdb894' : look === 'snow' ? '#34303a' : '#1a1520', lit: 0.6, scale: 1.3 },
    ];
    ranks.forEach((k) => {
      let x = -s * 0.5 + r() * s * 0.4;
      while (x < w + s) {
        const bw = s * k.scale * (0.9 + r() * 0.9);
        const top = py(k.top + (r() - 0.5) * 0.3);
        const bottom = top + s * k.drop * k.scale;
        const gable = r() < 0.5;
        if (gable) {
          // a gable end facing us: wall with a window or two, a pitched roof over it
          const eave = top + s * 0.28 * k.scale;
          g.fillStyle = k.wall;
          g.fillRect(x, eave, bw, py(-4) - eave);
          gableRoof(g, x, x + bw, eave, top - s * 0.2 * k.scale, k.tone, look);
          const n = bw > s * k.scale * 1.3 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            if (r() > k.lit) continue;
            const ww = s * 0.14 * k.scale;
            const wx = x + (bw * (i + 0.5)) / n - ww / 2;
            cottageWindow(g, wx, eave + s * 0.12 * k.scale, ww, ww * 1.25, 1, look, r);
          }
        } else {
          // a long roof slope seen from above, the eaves' wall below with a lit window
          roofSlope(g, x, x + bw, top, bottom, s * 0.12 * k.scale, k.tone, look, r);
          g.fillStyle = k.wall;
          g.fillRect(x, bottom, bw, py(-4) - bottom);
          const n = Math.max(1, Math.round(bw / (s * 0.45 * k.scale)));
          for (let i = 0; i < n; i++) {
            if (r() > k.lit) continue;
            const ww = s * 0.13 * k.scale;
            cottageWindow(g, x + (bw * (i + 0.5)) / n - ww / 2, bottom + s * 0.1 * k.scale, ww, ww * 1.2, 1, look, r);
          }
        }
        if (r() < 0.75) chimney(g, x + bw * (0.25 + r() * 0.5), top + s * 0.05, s * 0.09 * k.scale, s * 0.22 * k.scale, look, r() < 0.7, r);
        x += bw + s * 0.04 * k.scale;
      }
    });
    if (look === 'wet') {
      const mist = g.createLinearGradient(0, py(4.0), 0, py(1.0));
      mist.addColorStop(0, 'rgba(70,80,96,0)');
      mist.addColorStop(1, 'rgba(70,80,96,0.3)');
      g.fillStyle = mist;
      g.fillRect(0, 0, w, h);
    }
    if (look === 'snow') {
      const haze = g.createLinearGradient(0, 0, 0, h);
      haze.addColorStop(0, 'rgba(200,205,220,0.04)');
      haze.addColorStop(1, 'rgba(200,205,220,0.16)');
      g.fillStyle = haze;
      g.fillRect(0, 0, w, h);
    }
    if (day) {
      // a warm summer haze over the valley
      const haze = g.createLinearGradient(0, py(4.2), 0, py(1.6));
      haze.addColorStop(0, 'rgba(250,238,216,0)');
      haze.addColorStop(1, 'rgba(250,238,216,0.28)');
      g.fillStyle = haze;
      g.fillRect(0, py(4.2), w, py(1.6) - py(4.2));
    }
  };
}

// ---------- the near views ----------

/** Out of the back window: the lane, a dry-stone wall, a gas lamp and a snow-hung fir; the village drops away behind. Spans x X0..X1, y -1..8. */
function paintBackNear(look: Look, X0: number, X1: number) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = rand(42);
    const { px, py, s } = frameOf(w, h, X0, X1, -1, 8);
    g.clearRect(0, 0, w, h);
    const wallTop = py(2.88);
    const laneTop = py(2.5);
    const day = look === 'sun';
    // the fir at the left, over the wall
    fir(g, px(-13.7), py(2.8), s * 2.9, look, r, day ? '#2f5a3c' : undefined);
    stoneWall(g, 0, w, wallTop, laneTop + 2, look, r);
    // a wooden gate in the wall
    const gx0 = px(-10.0);
    const gx1 = px(-9.15);
    g.fillStyle = look === 'wet' ? '#1e1610' : day ? '#8a6440' : '#3a2818';
    g.fillRect(gx0, wallTop - s * 0.05, gx1 - gx0, laneTop - wallTop + s * 0.05);
    g.strokeStyle = day ? '#4a3420' : '#140e08';
    g.lineWidth = 2;
    for (let x = gx0 + 6; x < gx1; x += (gx1 - gx0) / 5) {
      g.beginPath();
      g.moveTo(x, wallTop - s * 0.05);
      g.lineTo(x, laneTop);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(gx0, laneTop - 4);
    g.lineTo(gx1, wallTop);
    g.stroke();
    if (look === 'snow') {
      g.fillStyle = SNOW;
      g.fillRect(gx0 - 2, wallTop - s * 0.09, gx1 - gx0 + 4, s * 0.05);
    }
    cobbles(
      g,
      w,
      laneTop,
      h,
      look,
      [
        [px(-8.3), '255,200,130'],
        [px(-11.6), '255,190,110'],
      ],
      r,
    );
    // the gas lamp on the near side of the lane
    lampPost(g, px(-8.3), py(0.2), py(4.4), s * 0.55, look);
    // its light on the wall and the stones (out by day)
    if (!day) glow(g, px(-8.3), py(2.8), s * 1.3, '255,200,130', look === 'wet' ? 0.25 : 0.16);
    if (look === 'snow') {
      // a snowman by the gate, and drifts against the wall's foot
      const sx = px(-10.9);
      const sb = py(2.05);
      for (const [dy, rr] of [
        [0, 0.26],
        [0.36, 0.19],
        [0.62, 0.13],
      ] as [number, number][]) {
        g.fillStyle = SNOW;
        g.beginPath();
        g.arc(sx, sb - dy * s, rr * s, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(150,165,195,0.35)';
        g.beginPath();
        g.arc(sx + rr * s * 0.35, sb - dy * s + rr * s * 0.2, rr * s * 0.8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#b8402a';
      g.fillRect(sx - s * 0.13, sb - 0.5 * s, s * 0.26, s * 0.05);
      g.fillStyle = '#1a1410';
      g.fillRect(sx - s * 0.1, sb - 0.82 * s, s * 0.2, s * 0.12);
      g.fillRect(sx - s * 0.15, sb - 0.71 * s, s * 0.3, s * 0.025);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = SNOW_SHADE;
        g.beginPath();
        g.ellipse(r() * w, laneTop + 4, s * (0.3 + r() * 0.5), s * 0.08, 0, Math.PI, 0);
        g.fill();
      }
    }
  };
}

/** Out of the side window: the lane running down between gabled, half-timbered houses. Spans u along the wall (0 at its near end) and y -1..8. */
function paintSideNear(look: Look) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = rand(77);
    const { px, py, s } = frameOf(w, h, 0, 12, -1, 8);
    g.clearRect(0, 0, w, h);
    // the houses down the right side of the lane, each a little lower and smaller than the last
    const houses = [
      { u0: 0.2, u1: 3.4, base: 2.45, eave: 6.0, ridge: 7.9, wall: '#d8c8a8', shut: '#4a6a58', lit: [1, 0, 1] },
      { u0: 3.6, u1: 5.9, base: 2.35, eave: 5.2, ridge: 6.7, wall: '#c99c84', shut: '#2e4a6a', lit: [1, 1, 0] },
      { u0: 6.05, u1: 7.95, base: 2.25, eave: 4.65, ridge: 5.9, wall: '#bfc2b0', shut: '#6a3a2a', lit: [0, 1, 1] },
      { u0: 8.1, u1: 9.65, base: 2.15, eave: 4.2, ridge: 5.25, wall: '#d8b878', shut: '#3a5a4a', lit: [1, 0, 1] },
      { u0: 9.75, u1: 11.1, base: 2.05, eave: 3.85, ridge: 4.75, wall: '#a8a0b0', shut: '#5a3a2a', lit: [1, 1, 0] },
    ];
    const day = look === 'sun';
    for (const hs of houses) {
      const x0 = px(hs.u0);
      const x1 = px(hs.u1);
      // by day each house shows its own plaster colour in full
      const wallTone = day ? shadeHex(hs.wall, 0.97) : look === 'wet' ? shadeHex(hs.wall, 0.42) : look === 'snow' ? shadeHex(hs.wall, 0.55) : shadeHex(hs.wall, 0.45);
      g.fillStyle = wallTone;
      g.fillRect(x0, py(hs.eave), x1 - x0, py(hs.base) - py(hs.eave));
      halfTimber(g, x0, x1, py(hs.eave), py(hs.base), Math.max(3, s * 0.08), r, day ? '#4e3220' : undefined);
      // ground floor: a door and a window; first floor: two windows
      const fw = x1 - x0;
      const unit = (hs.eave - hs.base) / 3.2;
      const ww = fw * 0.2;
      cottageWindow(g, x0 + fw * 0.12, py(hs.base + unit * 2.55), ww, (py(hs.base + unit * 1.85) - py(hs.base + unit * 2.55)), hs.lit[0], look, r, { shutters: hs.shut });
      cottageWindow(g, x0 + fw * 0.62, py(hs.base + unit * 2.55), ww, (py(hs.base + unit * 1.85) - py(hs.base + unit * 2.55)), hs.lit[1], look, r, { shutters: hs.shut, candle: true });
      cottageWindow(g, x0 + fw * 0.14, py(hs.base + unit * 1.25), ww * 1.15, (py(hs.base + unit * 0.45) - py(hs.base + unit * 1.25)), hs.lit[2], look, r, { box: true });
      // the door, with a lit fanlight
      const dx = x0 + fw * 0.6;
      const dw = fw * 0.2;
      g.fillStyle = hs.shut;
      g.fillRect(dx, py(hs.base + unit * 1.35), dw, py(hs.base) - py(hs.base + unit * 1.35));
      g.fillStyle = day ? '#c4d4e2' : '#ffcf8a';
      g.beginPath();
      g.arc(dx + dw / 2, py(hs.base + unit * 1.35), dw / 2, Math.PI, 0);
      g.fill();
      g.strokeStyle = 'rgba(30,20,12,0.9)';
      g.lineWidth = 2;
      g.stroke();
      if (day) {
        // the eave's shadow along the top of the wall
        const sh = g.createLinearGradient(0, py(hs.eave), 0, py(hs.eave) + s * 0.5);
        sh.addColorStop(0, 'rgba(40,26,18,0.4)');
        sh.addColorStop(1, 'rgba(40,26,18,0)');
        g.fillStyle = sh;
        g.fillRect(x0, py(hs.eave), x1 - x0, s * 0.5);
      }
      gableRoof(g, x0, x1, py(hs.eave), py(hs.ridge), day ? '#9a503a' : look === 'wet' ? '#121216' : '#1a1418', look);
      chimney(g, x0 + fw * 0.72, py(hs.eave + (hs.ridge - hs.eave) * 0.45), s * 0.16, s * 0.45, look, r() < 0.8, r);
      if (look === 'snow') {
        // snow along the first floor's jetty and on the door's hood
        g.fillStyle = SNOW;
        g.fillRect(x0 - 2, py(hs.base + unit * 1.62) - 3, fw + 4, 4);
      }
    }
    // the hanging sign of the bakery (a gilded pretzel on an iron bracket), between the first two houses
    const bx = px(5.95);
    const by = py(4.55);
    g.strokeStyle = day ? '#2e2a2c' : '#141014';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + s * 0.7, by);
    g.moveTo(bx, by + s * 0.25);
    g.quadraticCurveTo(bx + s * 0.3, by + s * 0.05, bx + s * 0.6, by);
    g.stroke();
    g.strokeStyle = look === 'snow' ? '#c8a050' : '#d4a64a';
    g.lineWidth = Math.max(3, s * 0.07);
    const pcx = bx + s * 0.5;
    const pcy = by + s * 0.42;
    const pr = s * 0.22;
    g.beginPath();
    g.moveTo(pcx - pr * 0.25, pcy - pr * 0.95);
    g.bezierCurveTo(pcx - pr * 1.6, pcy - pr * 1.1, pcx - pr * 1.3, pcy + pr * 1.0, pcx, pcy + pr * 0.25);
    g.bezierCurveTo(pcx + pr * 1.3, pcy + pr * 1.0, pcx + pr * 1.6, pcy - pr * 1.1, pcx + pr * 0.25, pcy - pr * 0.95);
    g.moveTo(pcx - pr * 0.25, pcy - pr * 0.95);
    g.lineTo(pcx + pr * 0.45, pcy + pr * 0.85);
    g.moveTo(pcx + pr * 0.25, pcy - pr * 0.95);
    g.lineTo(pcx - pr * 0.45, pcy + pr * 0.85);
    g.stroke();
    // a gas lamp at the near end of the lane, close by the window
    lampPost(g, px(3.45), py(0.4), py(4.4), s * 0.6, look);
    cobbles(
      g,
      w,
      py(2.2),
      h,
      look,
      [
        [px(3.45), '255,206,140'],
        [px(4.6), '255,190,110'],
        [px(8.6), '255,190,110'],
      ],
      r,
    );
    // the lane's far end, dropping out of sight: a low wall and the night beyond
    stoneWall(g, px(11.1), w, py(2.45), py(2.0), look, r);
  };
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${((n >> 16) & 255) * k},${((n >> 8) & 255) * k},${(n & 255) * k})`;
}

// ---------- assembled ----------

type Layer = { size: [number, number]; at: THREE.Vector3; yaw: number; tex: [number, number]; paint: (look: Look) => (g: CanvasRenderingContext2D, w: number, h: number) => void; alpha: boolean };

const cache = new Map<string, THREE.Material>();
function viewMaterial(key: string, l: Layer) {
  let m = cache.get(key);
  if (!m) {
    const make = (look: Look) => () => painted(l.tex[0], l.tex[1], l.paint(look), l.alpha);
    const mm = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: l.alpha, depthWrite: !l.alpha, color: new THREE.Color(0.92, 0.92, 0.92) });
    m = weatherView(mm, { clear: make('clear'), wet: make('wet'), snow: make('snow'), sun: make('sun') }, { mist: '#2a3440', mistAmount: l.alpha ? 0.12 : 0.22 });
    cache.set(key, m);
  }
  return m;
}

// The back window looks along -z; the side window along -x.
const BACK_GLASS_Z = BZ - REVEAL + 0.06;
const SIDE_GLASS_X = ROOM.x0 - REVEAL + 0.06;
const backCx = (WIN_BACK.x0 + WIN_BACK.x1) / 2;
const sideCz = (WIN_SIDE.z0 + WIN_SIDE.z1) / 2;

const BACK_NEAR = { cx: backCx - 0.4, w: 9.6 };
const BACK_FAR = { cx: backCx - 2.2, w: 22 };
const SIDE_NEAR = { cz: sideCz - 6.4, w: 12 };
const SIDE_FAR = { cz: sideCz - 20, w: 30 };

const LAYERS: Record<string, Layer> = {
  backNear: { size: [BACK_NEAR.w, 9], at: new THREE.Vector3(BACK_NEAR.cx, 3.5, BACK_GLASS_Z - 2.6), yaw: 0, tex: [1024, 960], paint: (look) => paintBackNear(look, BACK_NEAR.cx - BACK_NEAR.w / 2, BACK_NEAR.cx + BACK_NEAR.w / 2), alpha: true },
  backFar: { size: [BACK_FAR.w, 16], at: new THREE.Vector3(BACK_FAR.cx, 4, BACK_GLASS_Z - 8.8), yaw: 0, tex: [2048, 1488], paint: (look) => paintFar(look, 3, BACK_FAR.cx - BACK_FAR.w / 2, BACK_FAR.cx + BACK_FAR.w / 2, -12.6), alpha: false },
  sideNear: { size: [SIDE_NEAR.w, 9], at: new THREE.Vector3(SIDE_GLASS_X - 2.7, 3.5, SIDE_NEAR.cz), yaw: Math.PI / 2, tex: [1280, 960], paint: paintSideNear, alpha: true },
  sideFar: { size: [SIDE_FAR.w, 16], at: new THREE.Vector3(SIDE_GLASS_X - 9.5, 4, SIDE_FAR.cz), yaw: Math.PI / 2, tex: [2048, 1092], paint: (look) => paintFar(look, 9, -SIDE_FAR.w / 2, SIDE_FAR.w / 2, 4.2), alpha: false },
};

/** Soft glows over the painted lamps, so they bloom like real lamps (and swell in the rain). */
function LampGlows() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ffb070').multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = viewValue(1, 1.35, 1.15, 0); // the street lamps are off by day
    ref.current?.children.forEach((c) => c.scale.setScalar(k * (c.userData.s as number)));
  });
  const bn = LAYERS.backNear;
  const sn = LAYERS.sideNear;
  // the painted lamps' places (the side layer's u runs toward -z)
  const spots: [THREE.Vector3, number, number][] = [
    [new THREE.Vector3(-8.3, 4.42, bn.at.z + 0.05), 1.0, 0],
    [new THREE.Vector3(sn.at.x + 0.05, 4.6, sn.at.z + SIDE_NEAR.w / 2 - 3.45), 1.1, Math.PI / 2],
  ];
  return (
    <group ref={ref}>
      {spots.map(([p, sc, yaw], i) => (
        <mesh key={i} position={p} rotation={[0, yaw, 0]} material={mat} userData={{ s: sc }} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/** Keeps the room's window light in step with the weather (moonlight, rain, snow glow, daylight). */
function WeatherLevels() {
  useFrame(() => {
    workshopLightLevels.window = viewValue(1, 0.62, 1.25, 1.8);
    workshopLightLevels.day = viewValue(0, 0, 0, 1);
  });
  return null;
}

/**
 * The sun on a sunny day: high on the left and a little behind, so it pours in
 * through the side window onto the round table by the stove, and through the
 * back window onto the floor and the end of the tool bench.
 */
const SUN_DIR: [number, number, number] = [0.75, -1, 0.35];
const SUN_WINDOWS: SunWindow[] = [
  { c: [(WIN_BACK.x0 + WIN_BACK.x1) / 2, (WIN_BACK.y0 + WIN_BACK.y1) / 2, BZ], w: WIN_BACK.x1 - WIN_BACK.x0, h: WIN_BACK.y1 - WIN_BACK.y0, yaw: 0, panes: [4, 3] },
  { c: [ROOM.x0, (WIN_SIDE.y0 + WIN_SIDE.y1) / 2, (WIN_SIDE.z0 + WIN_SIDE.z1) / 2], w: WIN_SIDE.z1 - WIN_SIDE.z0, h: WIN_SIDE.y1 - WIN_SIDE.y0, yaw: Math.PI / 2, panes: [4, 3] },
];
const SUN_SURFACES: SunSurface[] = [
  { y: 0, x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.back, z1: ROOM.front },
  { y: TABLE.top, x0: TABLE.x - TABLE.r, x1: TABLE.x + TABLE.r, z0: TABLE.z - TABLE.r, z1: TABLE.z + TABLE.r, round: true },
  { y: BACK_BENCH.top, x0: BACK_BENCH.x0, x1: BACK_BENCH.x1, z0: BACK_BENCH.back, z1: BACK_BENCH.front },
];

export function OutsideViews() {
  return (
    <group>
      {Object.entries(LAYERS).map(([key, l]) => (
        <mesh key={key} position={l.at} rotation={[0, l.yaw, 0]} material={viewMaterial(`ws-view:${key}`, l)} renderOrder={l.alpha ? 1 : 0}>
          <planeGeometry args={l.size} />
        </mesh>
      ))}
      <LampGlows />
      {/* rain and snow between the glass and the houses, catching the lamps' light */}
      <Precipitation min={[WIN_BACK.x0 - 1.8, 0.6, BACK_GLASS_Z - 2.5]} max={[WIN_BACK.x1 + 1.6, 7.6, BACK_GLASS_Z - 0.15]} glow={{ position: [-8.3, 4.3, BACK_GLASS_Z - 2.2], radius: 2.6, color: '#ffc27a', strength: 0.6 }} />
      <Precipitation min={[SIDE_GLASS_X - 2.6, 0.6, WIN_SIDE.z0 - 4.5]} max={[SIDE_GLASS_X - 0.15, 7.6, WIN_SIDE.z1 + 1.0]} glow={{ position: [SIDE_GLASS_X - 2.3, 4.4, LAYERS.sideNear.at.z + SIDE_NEAR.w / 2 - 3.45], radius: 3, color: '#ffcf8a', strength: 0.6 }} />
      <WeatherLevels />
      {/* on a sunny day: the sun's patches on the floor, the table and the bench, its beams and the dust in them */}
      <SunShine windows={SUN_WINDOWS} dir={SUN_DIR} surfaces={SUN_SURFACES} />
    </group>
  );
}
