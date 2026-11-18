import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Precipitation, SunShine, viewValue, weatherView, type SunSurface, type SunWindow } from '../weather';
import { BACK, TABLE } from '../kitchen/plan';
import { REVEAL, ROOM, WIN_BACK, WIN_SIDE } from './ramen-dims';
import { brushMarks, rand, softDot } from './ramen-kit';
import { ramenLightLevels } from './ramen-lights';

// The street outside the two windows: a narrow back street. Through the back
// window, the neighbour's house across the alley (a lit window behind a bamboo
// blind, a red lantern under the eave, crates and potted plants); through the
// side window, the lane with a closed shop under a paper lantern, a street lamp
// on a wooden pole and wires overhead. Behind both, the town's tiled roofs, a
// bathhouse chimney and the sky. Each painted layer has a clear night, a wet,
// a snowy and a sunny-day version that the weather crossfades between (painted
// only when that weather comes); by day the lamps and lanterns are out and the
// sun comes in through both windows (SunShine). Rain or snow falls between the
// glass and the houses.

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

/** A sagging wire between two points. */
function wire(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number, col: string, wdt = 2) {
  g.strokeStyle = col;
  g.lineWidth = wdt;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1);
  g.stroke();
}

/** A Japanese tiled roof seen from the front: a slope with tile rows, curved-up eave ends and a ridge cap. */
function tiledRoof(g: CanvasRenderingContext2D, x0: number, x1: number, eaveY: number, ridgeY: number, base: string, look: Look, lit = 1) {
  const lift = (eaveY - ridgeY) * 0.12;
  g.fillStyle = base;
  g.beginPath();
  g.moveTo(x0 - 6, eaveY - lift);
  g.quadraticCurveTo(x0 + (x1 - x0) * 0.2, eaveY + 2, (x0 + x1) / 2, eaveY + 3);
  g.quadraticCurveTo(x0 + (x1 - x0) * 0.8, eaveY + 2, x1 + 6, eaveY - lift);
  g.lineTo(x1 - (eaveY - ridgeY) * 0.5, ridgeY);
  g.lineTo(x0 + (eaveY - ridgeY) * 0.5, ridgeY);
  g.closePath();
  g.fill();
  // tile courses: lighter ribs running up the slope
  g.save();
  g.clip();
  const step = Math.max(4, (x1 - x0) / 46);
  for (let x = x0 - 10; x < x1 + 10; x += step) {
    g.strokeStyle = look === 'wet' ? `rgba(150,170,200,${0.16 * lit})` : look === 'sun' ? `rgba(206,212,220,${0.2 * lit})` : `rgba(120,110,100,${0.14 * lit})`;
    g.lineWidth = step * 0.35;
    g.beginPath();
    g.moveTo(x, eaveY + 4);
    g.lineTo(x + (x - (x0 + x1) / 2) * 0.05, ridgeY);
    g.stroke();
  }
  for (let y = ridgeY + 6; y < eaveY; y += Math.max(4, (eaveY - ridgeY) / 7)) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x0 - 10, y, x1 - x0 + 20, 1.5);
  }
  if (look === 'snow') {
    // snow lying on the slope, thinning toward the eave
    const sg = g.createLinearGradient(0, ridgeY, 0, eaveY);
    sg.addColorStop(0, 'rgba(225,230,240,0.95)');
    sg.addColorStop(0.75, 'rgba(205,212,228,0.85)');
    sg.addColorStop(1, 'rgba(190,198,215,0.55)');
    g.fillStyle = sg;
    g.fillRect(x0 - 10, ridgeY, x1 - x0 + 20, eaveY - ridgeY + 6);
  }
  if (look === 'wet') {
    // a cold sheen sliding down the wet tiles
    const sg = g.createLinearGradient(0, ridgeY, 0, eaveY);
    sg.addColorStop(0, 'rgba(160,180,210,0.0)');
    sg.addColorStop(1, 'rgba(160,180,210,0.22)');
    g.fillStyle = sg;
    g.fillRect(x0 - 10, ridgeY, x1 - x0 + 20, eaveY - ridgeY + 6);
  }
  if (look === 'sun') {
    // the sun on the glazed tiles, brightest toward the ridge on the left
    const sg = g.createLinearGradient(x0, ridgeY, x1, eaveY);
    sg.addColorStop(0, 'rgba(255,236,200,0.3)');
    sg.addColorStop(1, 'rgba(255,236,200,0.04)');
    g.fillStyle = sg;
    g.fillRect(x0 - 10, ridgeY, x1 - x0 + 20, eaveY - ridgeY + 6);
  }
  g.restore();
  // ridge cap and the eave's tile ends
  g.fillStyle = look === 'snow' ? '#dfe4ee' : look === 'sun' ? 'rgba(52,56,64,0.95)' : 'rgba(10,10,14,0.9)';
  g.fillRect(x0 + (eaveY - ridgeY) * 0.5 - 4, ridgeY - 5, x1 - x0 - (eaveY - ridgeY) + 8, 7);
  g.strokeStyle = look === 'snow' ? 'rgba(235,240,248,0.95)' : look === 'wet' ? 'rgba(170,190,220,0.5)' : look === 'sun' ? 'rgba(60,64,72,0.95)' : 'rgba(30,30,36,0.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x0 - 6, eaveY - lift);
  g.quadraticCurveTo(x0 + (x1 - x0) * 0.2, eaveY + 2, (x0 + x1) / 2, eaveY + 3);
  g.quadraticCurveTo(x0 + (x1 - x0) * 0.8, eaveY + 2, x1 + 6, eaveY - lift);
  g.stroke();
}

/** A lit window: warm glow, a frame and (optionally) a bamboo blind or a lattice. By day, glass or paper in daylight. */
function litWindow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, warmth: number, kind: 'blind' | 'lattice' | 'curtain', look: Look) {
  const day = look === 'sun';
  const col = warmth > 0.5 ? '255,196,120' : '205,220,255';
  if (!day) glow(g, x + w / 2, y + h / 2, Math.max(w, h) * (look === 'wet' ? 1.6 : 1.2), col, look === 'wet' ? 0.35 : 0.25);
  const grad = g.createLinearGradient(x, y, x, y + h);
  if (day) {
    // a lattice is paper (shoji, pale in the sun); the rest is glass with the sky in it
    grad.addColorStop(0, kind === 'lattice' ? '#f1e8d2' : '#b9cde0');
    grad.addColorStop(1, kind === 'lattice' ? '#d9ccae' : '#6f8296');
  } else {
    grad.addColorStop(0, warmth > 0.5 ? '#ffd796' : '#d6e2ff');
    grad.addColorStop(1, warmth > 0.5 ? '#f2a256' : '#9fb4e0');
  }
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.strokeStyle = day ? 'rgba(70,48,30,0.85)' : 'rgba(40,24,14,0.85)';
  if (kind === 'blind') {
    g.lineWidth = 1.2;
    for (let yy = y + 3; yy < y + h; yy += 4) {
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x + w, yy);
      g.stroke();
    }
    g.fillStyle = day ? 'rgba(150,110,60,0.45)' : 'rgba(60,30,14,0.5)';
    g.fillRect(x, y, w, 6);
  } else if (kind === 'lattice') {
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(x + (w * i) / 4, y);
      g.lineTo(x + (w * i) / 4, y + h);
      g.stroke();
    }
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(x, y + (h * i) / 3);
      g.lineTo(x + w, y + (h * i) / 3);
      g.stroke();
    }
  } else {
    // curtains drawn halfway, a silhouette of a pot plant on the sill
    g.fillStyle = day ? 'rgba(196,96,70,0.9)' : 'rgba(150,70,50,0.75)';
    g.fillRect(x, y, w * 0.28, h);
    g.fillRect(x + w * 0.72, y, w * 0.28, h);
    g.fillStyle = day ? 'rgba(60,96,48,0.9)' : 'rgba(30,20,14,0.8)';
    g.beginPath();
    g.ellipse(x + w * 0.5, y + h * 0.8, w * 0.12, h * 0.12, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (day) {
    // the eave above shades the top of the window
    const sh = g.createLinearGradient(0, y, 0, y + h * 0.4);
    sh.addColorStop(0, 'rgba(30,22,16,0.35)');
    sh.addColorStop(1, 'rgba(30,22,16,0)');
    g.fillStyle = sh;
    g.fillRect(x, y, w, h * 0.4);
  }
  g.strokeStyle = day ? '#4a3220' : '#1a120c';
  g.lineWidth = 5;
  g.strokeRect(x, y, w, h);
  if (look === 'snow') {
    g.fillStyle = '#e4e8f0';
    g.beginPath();
    g.ellipse(x + w / 2, y + h + 2, w * 0.56, 5, 0, Math.PI, 0);
    g.fill();
  }
}

/** A red (or white) paper lantern hanging from a short cord, glowing. */
function paperLantern(g: CanvasRenderingContext2D, x: number, y: number, r: number, red: boolean, look: Look) {
  const day = look === 'sun';
  if (!day) glow(g, x, y, r * (look === 'wet' ? 6 : 4.5), red ? '255,120,70' : '255,220,170', look === 'snow' ? 0.4 : 0.32);
  g.strokeStyle = '#120c08';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y - r * 2.2);
  g.lineTo(x, y - r * 1.15);
  g.stroke();
  const grad = g.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r * 1.1);
  // by day unlit: the paper's own colour, sunlit on the left
  grad.addColorStop(0, day ? (red ? '#e2604a' : '#fbf3e2') : red ? '#ffb27a' : '#fff6e0');
  grad.addColorStop(0.6, day ? (red ? '#b8301e' : '#e8d8b6') : red ? '#e8462a' : '#f6d9a8');
  grad.addColorStop(1, day ? (red ? '#6e160c' : '#b39668') : red ? '#9a1e10' : '#c99a5a');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(x, y, r * 0.82, r, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = red ? 'rgba(90,16,8,0.6)' : 'rgba(150,100,50,0.5)';
  g.lineWidth = 1;
  for (let k = -3; k <= 3; k++) {
    g.beginPath();
    g.ellipse(x, y, r * 0.82 * Math.sqrt(1 - (k / 4) ** 2), 1, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(x - r * 0.82 * Math.sqrt(1 - (k / 4) ** 2), y + (k * r) / 4);
    g.lineTo(x + r * 0.82 * Math.sqrt(1 - (k / 4) ** 2), y + (k * r) / 4);
    g.stroke();
  }
  // a brushed mark (not a word) down the middle
  brushMarks(g, rand(Math.round(x + y)), x - r * 0.28, y - r * 0.6, r * 0.56, r * 1.2, red ? 'rgba(40,8,4,0.8)' : 'rgba(40,24,12,0.75)', 2, true);
  g.fillStyle = '#140c08';
  g.fillRect(x - r * 0.45, y - r * 1.12, r * 0.9, r * 0.16);
  g.fillRect(x - r * 0.45, y + r * 0.96, r * 0.9, r * 0.16);
  if (look === 'snow') {
    g.fillStyle = '#eef1f6';
    g.beginPath();
    g.ellipse(x, y - r * 1.13, r * 0.5, r * 0.12, 0, Math.PI, 0);
    g.fill();
  }
}

/** A potted plant: a clay pot and a round bush of leaves. */
function pottedPlant(g: CanvasRenderingContext2D, x: number, baseY: number, s: number, look: Look, r: () => number) {
  g.fillStyle = look === 'sun' ? '#a5543a' : '#5a2e1c';
  g.beginPath();
  g.moveTo(x - s * 0.5, baseY - s * 0.8);
  g.lineTo(x + s * 0.5, baseY - s * 0.8);
  g.lineTo(x + s * 0.38, baseY);
  g.lineTo(x - s * 0.38, baseY);
  g.closePath();
  g.fill();
  const day = look === 'sun';
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI;
    const d = r() * s * 0.9;
    const c0 = r();
    const c1 = r();
    const c2 = r();
    g.fillStyle = day ? `rgba(${62 + c0 * 50},${112 + c1 * 60},${46 + c2 * 26},0.95)` : `rgba(${30 + c0 * 30},${55 + c1 * 40},${30 + c2 * 20},0.95)`;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * d * 1.1, baseY - s * 0.8 - Math.sin(a) * d, s * 0.22, s * 0.14, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  if (look === 'snow') {
    g.fillStyle = 'rgba(230,236,244,0.95)';
    g.beginPath();
    g.ellipse(x, baseY - s * 1.55, s * 0.75, s * 0.25, 0, Math.PI, 0);
    g.fill();
  }
}

/** The ground: stone pavers, wet with reflections, or under snow. `refl` are light sources to mirror. */
function ground(g: CanvasRenderingContext2D, w: number, top: number, h: number, look: Look, refl: [number, number, string][], r: () => number) {
  if (look === 'snow') {
    const sg = g.createLinearGradient(0, top, 0, h);
    sg.addColorStop(0, '#9aa3b8');
    sg.addColorStop(1, '#c8cedb');
    g.fillStyle = sg;
    g.fillRect(0, top, w, h - top);
    // footprints and a cart's tracks
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(110,120,145,0.45)';
      g.beginPath();
      g.ellipse(w * 0.2 + i * (w * 0.035), top + (h - top) * (0.45 + (i % 2) * 0.12), 6, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, , col] of refl) glow(g, x, top + (h - top) * 0.3, (h - top) * 0.9, col, 0.25);
    return;
  }
  const base = look === 'wet' ? '#151619' : look === 'sun' ? '#8c8478' : '#2a2622';
  g.fillStyle = base;
  g.fillRect(0, top, w, h - top);
  // pavers
  const rows = 4;
  for (let j = 0; j < rows; j++) {
    const y0 = top + ((h - top) * j) / rows;
    const ph = (h - top) / rows;
    for (let x = (j % 2) * 30 - 60; x < w; x += 60 + r() * 30) {
      g.fillStyle = look === 'wet' ? `rgba(60,66,78,${0.3 + r() * 0.2})` : look === 'sun' ? `rgba(196,186,168,${0.35 + r() * 0.25})` : `rgba(90,80,70,${0.35 + r() * 0.25})`;
      g.fillRect(x + 2, y0 + 2, 56, ph - 4);
    }
  }
  if (look === 'wet') {
    // the lights doubled in the wet stones, smeared downward
    for (const [x, , col] of refl) {
      for (let k = 0; k < 8; k++) {
        g.fillStyle = `rgba(${col},${0.12 - k * 0.012})`;
        g.fillRect(x - 10 - k * 2, top + k * ((h - top) / 9), 20 + k * 4, (h - top) / 9);
      }
      glow(g, x, top + (h - top) * 0.25, (h - top) * 0.7, col, 0.25);
    }
    // puddles with a sky sheen
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(110,130,170,0.18)';
      g.beginPath();
      g.ellipse(r() * w, top + (h - top) * (0.3 + r() * 0.6), 30 + r() * 60, 6 + r() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
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

// ---------- the far town (shared look, two crops) ----------

/** Sky, stars or clouds, the moon, the town's roofs and a bathhouse chimney. Plane spans u from x0 to x1 world units, v from y0 to y1. */
function paintFar(look: Look, seed: number) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = rand(seed);
    const Y0 = -4;
    const Y1 = 12;
    const py = (y: number) => ((Y1 - y) / (Y1 - Y0)) * h;
    const day = look === 'sun';
    const sky = g.createLinearGradient(0, 0, 0, py(3));
    if (day) {
      sky.addColorStop(0, '#4a8fd8');
      sky.addColorStop(0.5, '#80b8e8');
      sky.addColorStop(0.85, '#c3dcef');
      sky.addColorStop(1, '#f2e4cc');
    } else if (look === 'clear') {
      sky.addColorStop(0, '#050816');
      sky.addColorStop(0.55, '#101836');
      sky.addColorStop(0.85, '#27264a');
      sky.addColorStop(1, '#4a3346');
    } else if (look === 'wet') {
      sky.addColorStop(0, '#07090d');
      sky.addColorStop(0.6, '#161a22');
      sky.addColorStop(0.9, '#3a2e2a');
      sky.addColorStop(1, '#5a3e2e');
    } else {
      sky.addColorStop(0, '#1a1c28');
      sky.addColorStop(0.6, '#3a3a4c');
      sky.addColorStop(0.9, '#5e5464');
      sky.addColorStop(1, '#76626a');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    if (day) {
      // the same random draws as the night's stars, so the town stands where it does at night
      for (let i = 0; i < 520 * 3; i++) r();
      // the sun high to the left, out of sight: its warm glow over that side of the sky, and fair-weather clouds
      glow(g, w * 0.05, -h * 0.1, h * 0.95, '255,236,196', 0.5);
      dayClouds(g, w, py(11.5), py(6), seed + 900, 9);
    } else if (look === 'clear') {
      for (let i = 0; i < 520; i++) {
        const x = r() * w;
        const y = Math.pow(r(), 1.4) * py(5);
        const b = r();
        g.fillStyle = `rgba(${b > 0.6 ? '255,246,226' : '200,214,255'},${0.3 + b * 0.6})`;
        g.beginPath();
        g.arc(x, y, b > 0.97 ? 1.7 : b > 0.8 ? 1.1 : 0.7, 0, Math.PI * 2);
        g.fill();
      }
      const mx = w * 0.62;
      const my = py(9.2);
      glow(g, mx, my, 220, '170,195,255', 0.35);
      const disc = g.createRadialGradient(mx - 8, my - 8, 4, mx, my, 34);
      disc.addColorStop(0, '#fffdf4');
      disc.addColorStop(1, '#ddd3bc');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(mx, my, 32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(150,140,130,0.25)';
      for (const [dx, dy, rr] of [[-9, -5, 10], [8, 6, 8], [-2, 13, 6]] as [number, number, number][]) {
        g.beginPath();
        g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // low cloud lit from below by the town
      for (let i = 0; i < 140; i++) {
        const x = r() * w;
        const y = py(5) * (0.15 + r() * 0.85);
        const rad = 40 + r() * 120;
        const warm = (y / py(5)) * (look === 'wet' ? 0.5 : 0.35);
        g.fillStyle = look === 'wet' ? `rgba(${70 + warm * 120},${66 + warm * 60},${70 + warm * 20},0.06)` : `rgba(${150 + warm * 60},${140 + warm * 40},${160},0.07)`;
        g.beginPath();
        g.ellipse(x, y, rad, rad * 0.35, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (look === 'snow') glow(g, w * 0.62, py(9.2), 260, '220,215,230', 0.18);
    }
    // three ranks of roofs: far (pale), middle, near (dark), each with lit windows
    const ranks = [
      { top: 5.6, bottom: 2.8, tone: day ? '#a3abb8' : look === 'snow' ? '#3e3c4a' : look === 'wet' ? '#1e1e26' : '#1c1d30', lit: 0.25 },
      { top: 4.6, bottom: 1.2, tone: day ? '#8a8f9a' : look === 'snow' ? '#2c2a36' : look === 'wet' ? '#141418' : '#121322', lit: 0.4 },
      { top: 3.4, bottom: Y0, tone: day ? '#6e6a66' : look === 'snow' ? '#1e1c26' : look === 'wet' ? '#0c0c10' : '#0a0b16', lit: 0.5 },
    ];
    ranks.forEach((k, ri) => {
      let x = -40 + r() * 30;
      while (x < w + 40) {
        const bw = 80 + r() * 140;
        const eave = py(k.top - r() * 1.2);
        const ridge = eave - (24 + r() * 40);
        g.fillStyle = k.tone;
        g.fillRect(x, eave, bw, py(k.bottom) - eave + 2);
        tiledRoof(g, x, x + bw, eave, ridge, k.tone, look, 1 - ri * 0.2);
        // windows: some lit warm, a few cool
        const cols = Math.floor(bw / 34);
        for (let j = 0; j < 3; j++)
          for (let c = 0; c < cols; c++) {
            if (r() > k.lit) continue;
            const wx = x + 10 + c * 34 + r() * 6;
            const wy = eave + 14 + j * 40;
            if (wy > py(k.bottom) - 20) continue;
            const warm = r() < 0.82;
            if (!day) glow(g, wx + 6, wy + 8, 22, warm ? '255,190,110' : '170,200,255', look === 'wet' ? 0.3 : 0.22);
            // by day the same windows: paper screens (pale) or glass with the sky in it
            g.fillStyle = day ? (warm ? '#efe5cc' : '#a8c0d8') : warm ? '#ffc271' : '#bcd0ff';
            g.fillRect(wx, wy, 13, 16);
            g.fillStyle = day ? 'rgba(90,64,40,0.6)' : 'rgba(40,20,10,0.6)';
            g.fillRect(wx + 6, wy, 1.5, 16);
          }
        x += bw + 6 + r() * 20;
      }
      // a bathhouse chimney rising from the middle rank, a water tank on stilts in the far one
      if (ri === 1) {
        const cx = w * 0.3;
        g.fillStyle = k.tone;
        g.fillRect(cx - 9, py(10.5), 18, py(k.top) - py(10.5));
        g.fillStyle = look === 'snow' ? '#5a5866' : day ? '#6c6874' : '#2a2630';
        for (let y = py(10.2); y < py(k.top); y += 26) g.fillRect(cx - 10, y, 20, 3);
        if (!day) glow(g, cx, py(10.6), 14, '255,80,60', 0.8);
        g.fillStyle = day ? '#c4483a' : '#ff6a50';
        g.beginPath();
        g.arc(cx, py(10.6), 3, 0, Math.PI * 2);
        g.fill();
      }
      if (ri === 0) {
        const tx = w * 0.78;
        g.fillStyle = k.tone;
        g.fillRect(tx - 26, py(7.6), 52, 38);
        for (const dx of [-22, -6, 10, 22]) g.fillRect(tx + dx - 2, py(7.6) + 36, 4, py(k.top) - py(7.6) - 36);
        if (look === 'snow') {
          g.fillStyle = '#d8dce8';
          g.fillRect(tx - 28, py(7.6) - 6, 56, 8);
        }
      }
    });
    // utility poles and wires against the sky
    const poles = [w * 0.12, w * 0.5, w * 0.88];
    for (const x of poles) {
      g.fillStyle = day ? '#4a4038' : '#07070b';
      g.fillRect(x - 4, py(8.4), 8, py(Y0) - py(8.4));
      g.fillRect(x - 30, py(8.0), 60, 5);
      g.fillRect(x - 22, py(7.4), 44, 4);
      g.fillStyle = day ? '#5a5a60' : '#0c0c12';
      g.fillRect(x + 6, py(7.1), 16, 24);
    }
    for (let i = 0; i < poles.length - 1; i++)
      for (const [dy, sag] of [
        [8.0, 30],
        [7.95, 46],
        [7.4, 38],
        [7.38, 54],
      ] as [number, number][]) {
        const off = dy === 8.0 || dy === 7.95 ? (dy === 8.0 ? -26 : 24) : dy === 7.4 ? -18 : 18;
        wire(g, poles[i] + off, py(dy), poles[i + 1] + off, py(dy), sag, look === 'snow' ? 'rgba(20,20,26,0.9)' : day ? 'rgba(40,40,46,0.85)' : 'rgba(6,6,10,0.95)', 1.8);
      }
    if (look === 'wet') {
      // mist hanging over the roofs
      const mist = g.createLinearGradient(0, py(6), 0, py(1));
      mist.addColorStop(0, 'rgba(70,80,96,0)');
      mist.addColorStop(1, 'rgba(70,80,96,0.35)');
      g.fillStyle = mist;
      g.fillRect(0, 0, w, h);
    }
    if (look === 'snow') {
      const haze = g.createLinearGradient(0, 0, 0, h);
      haze.addColorStop(0, 'rgba(200,205,220,0.05)');
      haze.addColorStop(1, 'rgba(200,205,220,0.18)');
      g.fillStyle = haze;
      g.fillRect(0, 0, w, h);
    }
    if (day) {
      // a warm summer haze over the far roofs
      const haze = g.createLinearGradient(0, py(6.5), 0, py(1));
      haze.addColorStop(0, 'rgba(250,236,214,0)');
      haze.addColorStop(1, 'rgba(250,236,214,0.3)');
      g.fillStyle = haze;
      g.fillRect(0, py(6.5), w, py(1) - py(6.5));
    }
  };
}

// ---------- the near houses ----------

/** Across the alley from the back window. The plane spans x from X0 to X1 and y from -1 to 8 (world units). */
function paintBackNear(look: Look) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = rand(42);
    const Y0 = -1;
    const Y1 = 8;
    const py = (y: number) => ((Y1 - y) / (Y1 - Y0)) * h;
    g.clearRect(0, 0, w, h);
    const eave = py(4.45);
    const day = look === 'sun';
    // the house wall: dark vertical board siding over a stone plinth (warm cedar in the sun)
    const wall = day ? '#7c5638' : look === 'snow' ? '#2e2620' : look === 'wet' ? '#1c1612' : '#2a1f17';
    g.fillStyle = wall;
    g.fillRect(0, eave, w, py(0) - eave);
    for (let x = 0; x < w; x += 18) {
      g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.2})`;
      g.fillRect(x, eave, 2, py(0) - eave);
      g.fillStyle = `rgba(120,90,60,${0.05 + r() * 0.06})`;
      g.fillRect(x + 4, eave, 8, py(0) - eave);
    }
    if (look === 'wet') {
      g.fillStyle = 'rgba(120,140,170,0.08)';
      g.fillRect(0, eave, w, py(0) - eave);
    }
    g.fillStyle = look === 'wet' ? '#24262a' : day ? '#8e8984' : '#3a3632';
    g.fillRect(0, py(0.45), w, py(0) - py(0.45));
    for (let x = 0; x < w; x += 46) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, py(0.45), 2, py(0) - py(0.45));
    }
    // the warm window behind a bamboo blind, and the lantern by the door
    const wx0 = w * 0.3;
    const ww = w * 0.2;
    litWindow(g, wx0, py(3.5), ww, py(1.7) - py(3.5), 1, 'blind', look);
    // a sliding door with a frosted lattice, dimly lit
    const dx0 = w * 0.72;
    g.fillStyle = '#3a2a1c';
    g.fillRect(dx0 - 6, py(2.9), w * 0.15 + 12, py(0.45) - py(2.9));
    const dg = g.createLinearGradient(0, py(2.8), 0, py(0.5));
    dg.addColorStop(0, day ? '#efe3c8' : '#b9894e');
    dg.addColorStop(1, day ? '#cbb892' : '#6a4a2a');
    g.fillStyle = dg;
    g.fillRect(dx0, py(2.8), w * 0.15, py(0.5) - py(2.8));
    g.strokeStyle = '#2a1a0e';
    g.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(dx0, py(2.8) + ((py(0.5) - py(2.8)) * i) / 4);
      g.lineTo(dx0 + w * 0.15, py(2.8) + ((py(0.5) - py(2.8)) * i) / 4);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(dx0 + w * 0.075, py(2.8));
    g.lineTo(dx0 + w * 0.075, py(0.5));
    g.stroke();
    // a drainpipe, a meter box, wooden crates, potted plants by the door
    g.fillStyle = day ? '#4a4440' : '#16120f';
    g.fillRect(w * 0.12, eave, 9, py(0.1) - eave);
    g.fillRect(w * 0.12 - 4, py(0.25), 17, 8);
    g.fillStyle = day ? '#8a8a84' : '#4a4a46';
    g.fillRect(w * 0.18, py(2.4), 30, 38);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(w * 0.185, py(2.35), 12, 10);
    for (let k = 0; k < 3; k++) {
      const cx = w * 0.05 + k * 4;
      const cy = py(0.45 + k * 0.42);
      g.fillStyle = k % 2 ? '#5a4028' : '#6a4a2e';
      g.fillRect(cx, cy - 34, 74, 34);
      g.strokeStyle = 'rgba(20,12,6,0.8)';
      g.lineWidth = 2;
      g.strokeRect(cx, cy - 34, 74, 34);
      g.beginPath();
      g.moveTo(cx, cy - 17);
      g.lineTo(cx + 74, cy - 17);
      g.stroke();
      if (look === 'snow' && k === 2) {
        g.fillStyle = '#e6eaf2';
        g.fillRect(cx - 2, cy - 40, 78, 7);
      }
    }
    pottedPlant(g, w * 0.66, py(0.45), 40, look, r);
    pottedPlant(g, w * 0.92, py(0.45), 32, look, r);
    // the eave: rafter ends under the tiled roof, the roof rising behind
    tiledRoof(g, -20, w + 20, eave, py(5.5), day ? '#5d6572' : look === 'snow' ? '#2a2830' : '#131214', look, 1);
    g.fillStyle = day ? '#3a2a20' : '#100c0a';
    g.fillRect(0, eave, w, 10);
    for (let x = 6; x < w; x += 28) g.fillRect(x, eave + 8, 10, 8);
    if (day) {
      // the eave's shadow on the wall below it
      const sh = g.createLinearGradient(0, eave + 10, 0, eave + 70);
      sh.addColorStop(0, 'rgba(30,20,14,0.45)');
      sh.addColorStop(1, 'rgba(30,20,14,0)');
      g.fillStyle = sh;
      g.fillRect(0, eave + 10, w, 60);
    }
    // the red lantern under the eave by the door
    paperLantern(g, w * 0.88, py(3.55), 26, true, look);
    // wires from the eave out across the alley
    wire(g, w * 0.02, py(5.2), w * 0.98, py(6.4), 50, day ? 'rgba(40,36,36,0.9)' : 'rgba(8,8,10,0.95)', 2.2);
    wire(g, w * 0.02, py(5.6), w * 0.98, py(6.8), 60, day ? 'rgba(40,36,36,0.9)' : 'rgba(8,8,10,0.95)', 1.6);
    if (look === 'snow') {
      // snow on the eave's lip and the window sill
      g.fillStyle = '#e8ecf3';
      g.beginPath();
      g.moveTo(-10, eave - 2);
      for (let x = -10; x < w + 10; x += 20) g.lineTo(x, eave - 6 - r() * 6);
      g.lineTo(w + 10, eave + 4);
      g.lineTo(-10, eave + 4);
      g.fill();
    }
    ground(
      g,
      w,
      py(0.02),
      h,
      look,
      [
        [w * 0.4, 0, '255,190,110'],
        [w * 0.88, 0, '255,110,70'],
      ],
      r,
    );
  };
}

/** Across the lane from the side window: a closed shop under a paper lantern, a street lamp, a bench. */
function paintSideNear(look: Look) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = rand(77);
    const Y0 = -1;
    const Y1 = 8;
    const py = (y: number) => ((Y1 - y) / (Y1 - Y0)) * h;
    g.clearRect(0, 0, w, h);
    const eave = py(4.9);
    const day = look === 'sun';
    // a two-storey shop house: plaster upper floor, wooden lower front
    const plaster = day ? '#d6c8ae' : look === 'snow' ? '#3a3640' : look === 'wet' ? '#24222a' : '#2e2a30';
    g.fillStyle = plaster;
    g.fillRect(w * 0.05, py(7.2), w * 0.75, py(0) - py(7.2));
    // upper floor: a lit window with a curtain and a little balcony rail
    litWindow(g, w * 0.22, py(6.6), w * 0.18, py(5.5) - py(6.6), 1, 'curtain', look);
    litWindow(g, w * 0.52, py(6.6), w * 0.14, py(5.5) - py(6.6), 0.2, 'lattice', look);
    g.strokeStyle = day ? '#3a3034' : '#141014';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w * 0.18, py(5.35));
    g.lineTo(w * 0.7, py(5.35));
    g.stroke();
    for (let x = w * 0.19; x < w * 0.7; x += 14) {
      g.beginPath();
      g.moveTo(x, py(5.35));
      g.lineTo(x, py(5.05));
      g.stroke();
    }
    // the shop's eave and the closed roller shutter below it
    tiledRoof(g, w * 0.02, w * 0.83, eave, py(5.25), day ? '#5d6572' : look === 'snow' ? '#2c2a32' : '#121114', look, 1);
    const sx0 = w * 0.12;
    const sx1 = w * 0.62;
    const sg = g.createLinearGradient(0, py(4.5), 0, py(0.2));
    sg.addColorStop(0, look === 'wet' ? '#3a3e46' : day ? '#a2a4a8' : '#4a4c52');
    sg.addColorStop(1, look === 'wet' ? '#24262c' : day ? '#7c7e84' : '#34363a');
    g.fillStyle = sg;
    g.fillRect(sx0, py(4.5), sx1 - sx0, py(0.2) - py(4.5));
    for (let y = py(4.5); y < py(0.2); y += 7) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(sx0, y, sx1 - sx0, 2);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(sx0, y + 2, sx1 - sx0, 1);
    }
    // a wooden signboard over the shutter with brush marks (no words)
    g.fillStyle = '#5a3a20';
    g.fillRect(sx0 + 20, py(4.85), sx1 - sx0 - 40, py(4.5) - py(4.85));
    brushMarks(g, rand(5), sx0 + 40, py(4.82), sx1 - sx0 - 80, py(4.52) - py(4.82), 'rgba(200,180,140,0.45)', 3, false);
    // a side door with a lit transom, a bench with a potted pine
    g.fillStyle = day ? '#5a3c26' : '#2a1c12';
    g.fillRect(w * 0.66, py(3.2), w * 0.11, py(0.2) - py(3.2));
    g.fillStyle = day ? '#c8d6e2' : '#e8b06a';
    g.fillRect(w * 0.67, py(3.1), w * 0.09, 16);
    g.fillStyle = '#3a2818';
    g.fillRect(w * 0.15, py(0.85), w * 0.2, 10);
    g.fillRect(w * 0.16, py(0.85), 8, py(0.2) - py(0.85));
    g.fillRect(w * 0.33, py(0.85), 8, py(0.2) - py(0.85));
    pottedPlant(g, w * 0.21, py(0.85), 30, look, r);
    pottedPlant(g, w * 0.29, py(0.85), 24, look, r);
    // the white paper lantern by the door
    paperLantern(g, w * 0.715, py(3.7), 24, false, look);
    // a wooden utility pole with a street lamp on a curved arm, and its wires
    const px = w * 0.88;
    g.fillStyle = day ? '#5a4634' : '#16100c';
    g.fillRect(px - 9, py(8), 18, py(0) - py(8));
    for (let y = py(7.6); y < py(1.5); y += 42) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(px - 9, y, 18, 3);
    }
    g.strokeStyle = day ? '#4a3a2c' : '#16100c';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(px, py(5.6));
    g.quadraticCurveTo(px - 30, py(6.2), px - 70, py(6.0));
    g.stroke();
    if (!day) glow(g, px - 72, py(5.75), look === 'wet' ? 190 : 140, '255,200,130', look === 'snow' ? 0.5 : 0.42);
    g.fillStyle = day ? '#ece6d6' : '#ffe2a8';
    g.beginPath();
    g.ellipse(px - 72, py(5.85), 16, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = day ? '#3a3a3e' : '#16100c';
    g.fillRect(px - 92, py(6.05), 40, 8);
    // the lamp's pool of light on the street (off by day)
    if (!day) glow(g, px - 72, py(0.1), 210, '255,200,130', look === 'wet' ? 0.3 : 0.18);
    const wireCol = day ? 'rgba(40,36,36,0.9)' : 'rgba(8,8,10,0.95)';
    wire(g, 0, py(7.4), px, py(7.3), 40, wireCol, 2);
    wire(g, 0, py(7.0), px, py(6.9), 56, wireCol, 1.6);
    wire(g, px, py(7.3), w, py(7.1), 20, wireCol, 2);
    if (day) {
      // the eave's shadow across the plaster
      const sh = g.createLinearGradient(0, eave + 4, 0, eave + 60);
      sh.addColorStop(0, 'rgba(40,28,20,0.4)');
      sh.addColorStop(1, 'rgba(40,28,20,0)');
      g.fillStyle = sh;
      g.fillRect(w * 0.05, eave + 4, w * 0.75, 56);
    }
    if (look === 'snow') {
      g.fillStyle = '#e8ecf3';
      g.fillRect(w * 0.15, py(0.85) - 6, w * 0.2, 7);
      g.fillRect(px - 92, py(6.05) - 5, 40, 6);
      g.fillRect(w * 0.18, py(5.35) - 4, w * 0.52, 5);
      g.fillRect(sx0 + 20, py(4.85) - 6, sx1 - sx0 - 40, 7);
    }
    ground(
      g,
      w,
      py(0.02),
      h,
      look,
      [
        [px - 72, 0, '255,200,130'],
        [w * 0.715, 0, '255,220,170'],
      ],
      r,
    );
  };
}

// ---------- assembled ----------

type Layer = { size: [number, number]; at: THREE.Vector3; yaw: number; tex: [number, number]; paint: (look: Look) => (g: CanvasRenderingContext2D, w: number, h: number) => void; alpha: boolean };

function viewMaterial(key: string, l: Layer) {
  return once2(key, () => {
    const make = (look: Look) => () => painted(l.tex[0], l.tex[1], l.paint(look), l.alpha);
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: l.alpha, depthWrite: !l.alpha, color: new THREE.Color(0.92, 0.92, 0.92) });
    return weatherView(m, { clear: make('clear'), wet: make('wet'), snow: make('snow'), sun: make('sun') }, { mist: '#2a3440', mistAmount: l.alpha ? 0.12 : 0.22 });
  });
}

const cache2 = new Map<string, THREE.Material>();
function once2<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache2.get(key) as T | undefined;
  if (!m) {
    m = make();
    cache2.set(key, m);
  }
  return m;
}

// The back window looks along -z; the side window along -x.
const BACK_GLASS_Z = BZ - REVEAL + 0.06;
const SIDE_GLASS_X = ROOM.x0 - REVEAL + 0.06;
const backCx = (WIN_BACK.x0 + WIN_BACK.x1) / 2;
const sideCz = (WIN_SIDE.z0 + WIN_SIDE.z1) / 2;

const LAYERS: Record<string, Layer> = {
  backNear: { size: [9, 9], at: new THREE.Vector3(backCx - 0.2, 3.5, BACK_GLASS_Z - 2.5), yaw: 0, tex: [1024, 1024], paint: paintBackNear, alpha: true },
  backFar: { size: [22, 16], at: new THREE.Vector3(backCx - 3, 4, BACK_GLASS_Z - 8.5), yaw: 0, tex: [1536, 1024], paint: (look) => paintFar(look, 3), alpha: false },
  sideNear: { size: [10, 9], at: new THREE.Vector3(SIDE_GLASS_X - 2.6, 3.5, sideCz - 1.5), yaw: Math.PI / 2, tex: [1024, 1024], paint: paintSideNear, alpha: true },
  sideFar: { size: [26, 16], at: new THREE.Vector3(SIDE_GLASS_X - 8.5, 4, sideCz - 5), yaw: Math.PI / 2, tex: [1536, 1024], paint: (look) => paintFar(look, 9), alpha: false },
};

/** Soft glows over the painted lights, so they bloom like real lamps (and swell in the rain). */
function LampGlows() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ffb070').multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    // rain haze makes the lamps bloom wider
    const k = viewValue(1, 1.35, 1.15, 0); // the street lamps are off by day
    ref.current?.children.forEach((c) => c.scale.setScalar(k * (c.userData.s as number)));
  });
  const n = LAYERS.backNear;
  const s = LAYERS.sideNear;
  // positions of the painted lamps, from their place on the paintings
  const backAt = (u: number, y: number) => new THREE.Vector3(n.at.x - n.size[0] / 2 + u * n.size[0], y, n.at.z + 0.05);
  const sideAt = (u: number, y: number) => new THREE.Vector3(s.at.x + 0.05, y, s.at.z + s.size[0] / 2 - u * s.size[0]);
  const spots: [THREE.Vector3, number, number][] = [
    [backAt(0.88, 3.55), 0.9, Math.PI * 0],
    [backAt(0.4, 2.6), 1.1, 0],
    [sideAt(0.88 - 72 / 1024, 5.85), 1.4, Math.PI / 2],
    [sideAt(0.715, 3.7), 0.8, Math.PI / 2],
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
    ramenLightLevels.window = viewValue(1, 0.62, 1.25, 1.8);
    ramenLightLevels.day = viewValue(0, 0, 0, 1);
  });
  return null;
}

/**
 * The sun on a sunny day: high on the left and a little behind, so it pours in
 * through the side window onto the staff table, and through the back window
 * onto the floor and the end of the back counter.
 */
const SUN_DIR: [number, number, number] = [0.75, -1, 0.35];
const SUN_WINDOWS: SunWindow[] = [
  { c: [(WIN_BACK.x0 + WIN_BACK.x1) / 2, (WIN_BACK.y0 + WIN_BACK.y1) / 2, BZ], w: WIN_BACK.x1 - WIN_BACK.x0, h: WIN_BACK.y1 - WIN_BACK.y0, yaw: 0, panes: [4, 3] },
  { c: [ROOM.x0, (WIN_SIDE.y0 + WIN_SIDE.y1) / 2, (WIN_SIDE.z0 + WIN_SIDE.z1) / 2], w: WIN_SIDE.z1 - WIN_SIDE.z0, h: WIN_SIDE.y1 - WIN_SIDE.y0, yaw: Math.PI / 2, panes: [4, 3] },
];
const SUN_SURFACES: SunSurface[] = [
  { y: 0, x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.back, z1: ROOM.front },
  { y: TABLE.top, x0: TABLE.x - TABLE.r, x1: TABLE.x + TABLE.r, z0: TABLE.z - TABLE.r, z1: TABLE.z + TABLE.r, round: true },
  { y: BACK.top, x0: BACK.x0, x1: BACK.x1, z0: BACK.back, z1: BACK.front },
];

export function OutsideViews() {
  return (
    <group>
      {Object.entries(LAYERS).map(([key, l]) => (
        <mesh key={key} position={l.at} rotation={[0, l.yaw, 0]} material={viewMaterial(`ramen-view:${key}`, l)} renderOrder={l.alpha ? 1 : 0}>
          <planeGeometry args={l.size} />
        </mesh>
      ))}
      <LampGlows />
      {/* rain and snow between the glass and the houses, catching the lanterns' light */}
      <Precipitation min={[WIN_BACK.x0 - 1.6, 0.6, BACK_GLASS_Z - 2.4]} max={[WIN_BACK.x1 + 1.6, 7.6, BACK_GLASS_Z - 0.15]} glow={{ position: [LAYERS.backNear.at.x + 3.4, 3.4, LAYERS.backNear.at.z + 0.4], radius: 2.6, color: '#ff9a6a', strength: 0.6 }} />
      <Precipitation min={[SIDE_GLASS_X - 2.5, 0.6, WIN_SIDE.z0 - 1.8]} max={[SIDE_GLASS_X - 0.15, 7.6, WIN_SIDE.z1 + 1.8]} glow={{ position: [LAYERS.sideNear.at.x + 0.4, 5.6, LAYERS.sideNear.at.z + 5 - 0.81 * 10], radius: 3, color: '#ffcf8a', strength: 0.6 }} />
      <WeatherLevels />
      {/* on a sunny day: the sun's patches on the floor, the table and the counter, its beams and the dust in them */}
      <SunShine windows={SUN_WINDOWS} dir={SUN_DIR} surfaces={SUN_SURFACES} />
    </group>
  );
}
