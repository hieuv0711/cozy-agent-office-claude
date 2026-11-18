import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Precipitation, SunShine, viewValue, weatherView, type SunSurface, type SunWindow } from '../weather';
import { ARCH_RISE, BACK_DESK, BACK_OPENINGS, DESK, GLASS_IN, ROOM, SIDE_OPENING } from './office-dims';
import { once, rand, softDot } from './office-kit';

// The city at night outside the office's windows. Far off, a skyline of towers
// with lit floors, a stepped tower with a lit crown, a radio mast with a red
// beacon and a bridge strung with lights, under stars and the moon (or low
// cloud lit orange by the town). Nearer, a ring of rooftops with wooden water
// towers, chimney stacks and a roof garden under a string of lights. Across
// the street from the back windows, an old brick loft with lit windows and a
// fire escape, a low roof with its water tower; across the side street from
// the lounge window, another brick building. The far and rooftop layers wrap
// round behind both walls (one continuous city through every window); each
// painted layer has a clear night, a wet, a snowy and a sunny-day version that
// the weather crossfades between. Rain or snow falls between the glass and the
// buildings; on a sunny day the sun comes in through the windows (SunShine).

type Look = 'clear' | 'wet' | 'snow' | 'sun';
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const BZ = ROOM.back;
const BACK_GLASS_Z = BZ - GLASS_IN;
const SIDE_GLASS_X = ROOM.x0 - GLASS_IN;

/** Live levels the weather pushes, read every frame by the room's lights: how strong the light through the windows is, and how much of it is daylight (0 at night, 1 on a sunny day). */
export const officeLightLevels = { window: 1, day: 0 };

/** A canvas painted for one look: drawn at its design size, stored at `scale` of it (the views don't need more). */
function painted(w: number, h: number, draw: Draw, alpha: boolean, scale = 0.75) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(scale, scale);
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

const WARM = ['#ffc777', '#ffb860', '#ffd593', '#f7a654', '#ffe0a8'];
const COOL = ['#cfe0ff', '#b8ccf0', '#e6eeff'];

/** By day, window glass: the sky reflected (pale blue to grey), a few with a blind down. */
const GLASS = ['#a9c3da', '#93b0c9', '#bcd2e3', '#7e9bb6', '#c8dae8'];

/**
 * A grid of windows on a facade: some lit warm, a few cool, some dark; whole floors sometimes dark.
 * By day (the same random draws, so the windows stay where they are) the glass shows the sky.
 */
function windowGrid(g: CanvasRenderingContext2D, r: () => number, x0: number, x1: number, y0: number, y1: number, ww: number, wh: number, gx: number, gy: number, lit: number, look: Look, glowR = 0) {
  const day = look === 'sun';
  for (let y = y0; y + wh <= y1; y += wh + gy) {
    const floorLit = r() < 0.85 ? lit : lit * 0.15;
    for (let x = x0; x + ww <= x1; x += ww + gx) {
      const on = r() < floorLit;
      if (on) {
        const warm = r() < 0.8;
        const pick = r();
        const col = day ? GLASS[Math.floor(pick * GLASS.length)] : warm ? WARM[Math.floor(pick * WARM.length)] : COOL[Math.floor(pick * COOL.length)];
        if (glowR > 0 && !day) glow(g, x + ww / 2, y + wh / 2, glowR * (look === 'wet' ? 1.6 : 1), warm ? '255,190,110' : '190,210,255', look === 'wet' ? 0.22 : 0.14);
        g.fillStyle = col;
        g.globalAlpha = 0.65 + r() * 0.35;
        g.fillRect(x, y, ww, wh);
        g.globalAlpha = 1;
        // a blind or a curtain edge now and then
        if (r() < 0.3) {
          g.fillStyle = day ? 'rgba(236,226,206,0.7)' : 'rgba(60,30,14,0.45)';
          g.fillRect(x, y, ww, wh * (0.2 + r() * 0.5));
        }
      } else {
        const a = 0.5 + r() * 0.3;
        g.fillStyle = day ? `rgba(70,92,116,${a})` : `rgba(${look === 'snow' ? '60,64,80' : '18,20,30'},${a})`;
        g.fillRect(x, y, ww, wh);
      }
      if (day) {
        // the sky's sheen across the top of the pane
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x, y, ww, Math.max(1, wh * 0.28));
      }
    }
  }
}

/** A wooden water tower on a steel stand: a staved tank with hoops and a conical cap. (x, base y) in pixels, s = tank width. */
function waterTower(g: CanvasRenderingContext2D, x: number, base: number, s: number, tone: string, look: Look, r: () => number) {
  const legH = s * 0.95;
  const tankH = s * 0.95;
  const top = base - legH - tankH;
  g.strokeStyle = tone;
  g.lineWidth = Math.max(2, s * 0.06);
  // the stand: four legs, cross bracing
  for (const f of [0.08, 0.36, 0.64, 0.92]) {
    g.beginPath();
    g.moveTo(x - s / 2 + f * s, base);
    g.lineTo(x - s / 2 + (0.15 + f * 0.7) * s, base - legH);
    g.stroke();
  }
  g.lineWidth = Math.max(1, s * 0.025);
  for (let k = 0; k < 2; k++) {
    const ya = base - legH * (k * 0.5);
    const yb = base - legH * ((k + 1) * 0.5);
    g.beginPath();
    g.moveTo(x - s * 0.42 + k * s * 0.03, ya);
    g.lineTo(x + s * 0.39 - k * s * 0.03, yb);
    g.moveTo(x + s * 0.42 - k * s * 0.03, ya);
    g.lineTo(x - s * 0.39 + k * s * 0.03, yb);
    g.stroke();
  }
  // the tank: staves, slightly barrelled, with hoops
  const tw = s * 0.8;
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(x - tw / 2, base - legH);
  g.quadraticCurveTo(x - tw / 2 - s * 0.04, base - legH - tankH / 2, x - tw / 2, top);
  g.lineTo(x + tw / 2, top);
  g.quadraticCurveTo(x + tw / 2 + s * 0.04, base - legH - tankH / 2, x + tw / 2, base - legH);
  g.closePath();
  g.fill();
  for (let k = 0; k < 9; k++) {
    g.fillStyle = `rgba(${look === 'snow' ? '120,110,100' : look === 'sun' ? '160,118,80' : '90,64,44'},${0.18 + r() * 0.2})`;
    g.fillRect(x - tw / 2 + (k / 9) * tw, top, Math.max(1, tw / 18), tankH);
  }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let k = 1; k < 5; k++) g.fillRect(x - tw / 2 - 1, top + (k / 5) * tankH, tw + 2, Math.max(1.5, s * 0.02));
  if (look === 'sun') {
    // sun from the upper left: the left of the tank lit warm, the right in shade
    const sh = g.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
    sh.addColorStop(0, 'rgba(255,214,150,0.32)');
    sh.addColorStop(0.45, 'rgba(255,214,150,0)');
    sh.addColorStop(0.7, 'rgba(30,20,20,0)');
    sh.addColorStop(1, 'rgba(30,20,20,0.35)');
    g.fillStyle = sh;
    g.fillRect(x - tw / 2, top, tw, tankH);
  } else {
    // a faint warm rim light from the street below
    g.fillStyle = 'rgba(255,170,100,0.12)';
    g.fillRect(x - tw / 2, base - legH - tankH * 0.25, tw, tankH * 0.25);
  }
  // the conical cap and its finial
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(x - tw / 2 - s * 0.05, top + 1);
  g.lineTo(x, top - s * 0.42);
  g.lineTo(x + tw / 2 + s * 0.05, top + 1);
  g.closePath();
  g.fill();
  g.fillRect(x - 1.5, top - s * 0.55, 3, s * 0.15);
  if (look === 'snow') {
    g.fillStyle = 'rgba(228,232,242,0.95)';
    g.beginPath();
    g.moveTo(x - tw / 2 - s * 0.03, top - 1);
    g.lineTo(x, top - s * 0.4);
    g.lineTo(x + tw / 2 + s * 0.03, top - 1);
    g.lineTo(x + tw * 0.3, top + 2);
    g.lineTo(x - tw * 0.3, top + 2);
    g.closePath();
    g.fill();
  }
  if (look === 'wet') {
    g.fillStyle = 'rgba(150,170,200,0.14)';
    g.fillRect(x - tw / 2, top, tw * 0.3, tankH);
  }
}

/** Snow lying along a horizontal edge (a roof line, a ledge). */
function snowLine(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, thick: number, r: () => number) {
  g.fillStyle = 'rgba(226,230,240,0.95)';
  g.beginPath();
  g.moveTo(x0, y + 1);
  for (let x = x0; x <= x1; x += 8) g.lineTo(x, y - thick * (0.6 + r() * 0.6));
  g.lineTo(x1, y + 1);
  g.closePath();
  g.fill();
}

/**
 * Sunlight on a block seen from across the street: the sun is high and to the
 * left, so the left edge catches it and the right falls into shade.
 */
function sunSide(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 1) {
  const sh = g.createLinearGradient(x, 0, x + w, 0);
  sh.addColorStop(0, `rgba(255,220,160,${0.22 * k})`);
  sh.addColorStop(0.3, 'rgba(255,220,160,0)');
  sh.addColorStop(0.75, 'rgba(40,30,40,0)');
  sh.addColorStop(1, `rgba(40,30,40,${0.22 * k})`);
  g.fillStyle = sh;
  g.fillRect(x, y, w, h);
}

function skyGradient(g: CanvasRenderingContext2D, w: number, horizon: number, look: Look) {
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  if (look === 'sun') {
    // a clear warm afternoon: deep blue overhead, paling to a warm haze at the horizon
    sky.addColorStop(0, '#3f86d4');
    sky.addColorStop(0.45, '#71aee6');
    sky.addColorStop(0.8, '#b7d6ee');
    sky.addColorStop(1, '#f1dfc2');
  } else if (look === 'clear') {
    sky.addColorStop(0, '#04060f');
    sky.addColorStop(0.5, '#0b1230');
    sky.addColorStop(0.82, '#1e2148');
    sky.addColorStop(1, '#3d2c4a');
  } else if (look === 'wet') {
    sky.addColorStop(0, '#07080b');
    sky.addColorStop(0.55, '#15181e');
    sky.addColorStop(0.85, '#3a2c26');
    sky.addColorStop(1, '#6a4630');
  } else {
    sky.addColorStop(0, '#191b26');
    sky.addColorStop(0.55, '#363749');
    sky.addColorStop(0.85, '#5c5464');
    sky.addColorStop(1, '#7a6a72');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon + 2);
}

// ---------- the far panorama (sky and skyline) ----------

/** The far ring: arc length in world units across the texture, and the heights it spans. */
const FAR = { R: 27, y0: -8, y1: 26, theta0: 0.55 * Math.PI, theta: 1.0 * Math.PI };
/** Rooftops: an ellipse round the room (wider toward the side window). */
const MID = { rx: 19.5, rz: 12.5, y0: -3, y1: 11 };

/** Fair-weather clouds: soft white heaps, lit from above, greyer underneath (their own random stream). */
function dayClouds(g: CanvasRenderingContext2D, w: number, top: number, bottom: number, seed: number, n: number) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w;
    const cy = top + (bottom - top) * Math.pow(r(), 0.8);
    const s = 30 + r() * 70 * (0.4 + (cy - top) / (bottom - top));
    const puffs = 5 + Math.floor(r() * 6);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (k / puffs - 0.5) * s * 3.2 + (r() - 0.5) * s * 0.6;
      const py = cy - Math.sin((k / Math.max(1, puffs - 1)) * Math.PI) * s * 0.55 + (r() - 0.5) * s * 0.2;
      const rad = s * (0.45 + r() * 0.45);
      const b = g.createRadialGradient(px - rad * 0.2, py - rad * 0.35, rad * 0.1, px, py, rad);
      b.addColorStop(0, 'rgba(255,255,255,0.55)');
      b.addColorStop(0.55, 'rgba(244,246,250,0.32)');
      b.addColorStop(1, 'rgba(214,224,238,0)');
      g.fillStyle = b;
      g.beginPath();
      g.ellipse(px, py, rad, rad * 0.62, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function paintFar(look: Look): Draw {
  return (g, w, h) => {
    const r = rand(311);
    const py = (y: number) => ((FAR.y1 - y) / (FAR.y1 - FAR.y0)) * h;
    const day = look === 'sun';
    skyGradient(g, w, py(-1), look);
    if (day) {
      // the same random draws as the clear night's stars, so the skyline stands where it does at night
      for (let i = 0; i < 1400 * 3; i++) r();
      // the sun high on the left, out of sight above the windows: its warm glow over that side of the sky
      glow(g, w * 0.1, -h * 0.05, h * 0.9, '255,236,196', 0.55);
      dayClouds(g, w, py(14), py(3.5), 17, 22);
    } else if (look === 'clear') {
      for (let i = 0; i < 1400; i++) {
        const x = r() * w;
        const y = Math.pow(r(), 1.3) * py(2.4);
        const b = r();
        g.fillStyle = `rgba(${b > 0.6 ? '255,246,226' : '200,214,255'},${0.25 + b * 0.6})`;
        g.beginPath();
        g.arc(x, y, b > 0.97 ? 1.6 : b > 0.8 ? 1.05 : 0.65, 0, Math.PI * 2);
        g.fill();
      }
      // the moon, high over the right-hand window
      const mx = w * 0.64;
      const my = py(4.9);
      glow(g, mx, my, 150, '170,195,255', 0.3);
      const disc = g.createRadialGradient(mx - 5, my - 5, 2, mx, my, 21);
      disc.addColorStop(0, '#fffdf4');
      disc.addColorStop(1, '#dcd2bc');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(mx, my, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(150,140,130,0.25)';
      for (const [dx, dy, rr] of [
        [-6, -3, 6],
        [5, 4, 5],
        [-1, 8, 4],
      ] as [number, number, number][]) {
        g.beginPath();
        g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // low cloud, lit from below by the city
      for (let i = 0; i < 260; i++) {
        const x = r() * w;
        const y = py(-1) * (0.1 + r() * 0.9);
        const rad = 40 + r() * 130;
        const warm = (y / py(-1)) * (look === 'wet' ? 0.6 : 0.4);
        g.fillStyle = look === 'wet' ? `rgba(${70 + warm * 130},${62 + warm * 60},${64 + warm * 20},0.06)` : `rgba(${150 + warm * 60},${144 + warm * 40},${165},0.07)`;
        g.beginPath();
        g.ellipse(x, y, rad, rad * 0.32, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (look === 'snow') glow(g, w * 0.64, py(4.9), 200, '220,215,235', 0.16);
    }
    // a glow of the city along the horizon
    const hz = g.createLinearGradient(0, py(5), 0, py(-1));
    hz.addColorStop(0, 'rgba(255,150,90,0)');
    hz.addColorStop(1, day ? 'rgba(255,238,212,0.45)' : look === 'clear' ? 'rgba(255,150,90,0.16)' : look === 'wet' ? 'rgba(255,140,80,0.28)' : 'rgba(255,200,170,0.2)');
    g.fillStyle = hz;
    g.fillRect(0, 0, w, py(-1));
    // two ranks of towers: distant (pale, small windows) and nearer (darker, bigger)
    const ranks = [
      { lo: 1.2, hi: 6.6, tone: day ? '#a7b7c9' : look === 'snow' ? '#4a4a5c' : look === 'wet' ? '#24252c' : '#1d2340', lit: 0.3, win: [3, 4, 3, 4] },
      { lo: 0.4, hi: 4.8, tone: day ? '#8b9db2' : look === 'snow' ? '#2e2e3c' : look === 'wet' ? '#15161a' : '#11152a', lit: 0.36, win: [4, 5, 4, 5] },
    ];
    ranks.forEach((k, ri) => {
      let x = -20 + r() * 20;
      while (x < w + 20) {
        const bw = (60 + r() * 120) * (ri ? 1.2 : 0.9);
        const top = py(k.lo + Math.pow(r(), 1.6) * (k.hi - k.lo));
        const bottom = py(FAR.y0);
        g.fillStyle = k.tone;
        g.fillRect(x, top, bw, bottom - top);
        // a setback crown on some towers
        const style = r();
        if (style < 0.25) {
          g.fillRect(x + bw * 0.2, top - bw * 0.35, bw * 0.6, bw * 0.36);
          g.fillRect(x + bw * 0.35, top - bw * 0.6, bw * 0.3, bw * 0.26);
        } else if (style < 0.4) {
          // an antenna mast with a red beacon
          g.fillRect(x + bw / 2 - 1.5, top - bw * 0.9, 3, bw * 0.9);
          if (!day) glow(g, x + bw / 2, top - bw * 0.9, 14, '255,60,50', 0.8);
          g.fillStyle = day ? '#c0504a' : '#ff6a5a';
          g.fillRect(x + bw / 2 - 2, top - bw * 0.9 - 2, 4, 4);
        }
        g.save();
        g.beginPath();
        g.rect(x, top, bw, bottom - top);
        g.clip();
        const [ww, wh, gx, gy] = k.win;
        windowGrid(g, r, x + 4, x + bw - 4, top + 6, py(-2), ww, wh, gx, gy, k.lit * (0.6 + r() * 0.8), look, ri ? 6 : 0);
        if (look === 'snow') snowLine(g, x, x + bw, top + 2, 5, r);
        if (day) sunSide(g, x, top, bw, bottom - top, ri ? 1 : 0.6);
        g.restore();
        x += bw + 2 + r() * 26;
      }
    });
    // the stepped tower with a lit crown, left of centre (seen through the middle window)
    {
      const cx = w * 0.5;
      const tone = day ? '#7f92a8' : look === 'snow' ? '#2a2a38' : look === 'wet' ? '#121318' : '#0e1226';
      const steps: [number, number][] = [
        [110, 6.4],
        [84, 7.6],
        [60, 8.6],
        [36, 9.4],
      ];
      g.fillStyle = tone;
      for (const [hw, yy] of steps) g.fillRect(cx - hw / 2, py(yy), hw, py(FAR.y0) - py(yy));
      // the lit crown: warm bands on each setback, and a spire (by day, gilded trim catching the sun)
      for (const [hw, yy] of steps) {
        if (!day) glow(g, cx, py(yy) + 6, hw * 0.7, '255,200,120', look === 'wet' ? 0.3 : 0.2);
        g.fillStyle = day ? '#e6c88e' : '#ffd38a';
        g.fillRect(cx - hw / 2 + 4, py(yy) + 3, hw - 8, 3);
      }
      g.fillStyle = tone;
      g.beginPath();
      g.moveTo(cx - 8, py(9.4));
      g.lineTo(cx, py(11.6));
      g.lineTo(cx + 8, py(9.4));
      g.fill();
      g.save();
      g.beginPath();
      g.rect(cx - 55, py(6.4), 110, py(-2) - py(6.4));
      g.clip();
      windowGrid(g, r, cx - 50, cx + 50, py(6.2), py(-2), 4, 6, 4, 5, 0.42, look, 5);
      if (day) sunSide(g, cx - 55, py(6.4), 110, py(-2) - py(6.4));
      g.restore();
    }
    // a suspension bridge strung with lights, low on the right
    {
      const x0 = w * 0.74;
      const x1 = w * 0.98;
      const deck = py(1.1);
      const towerTop = py(3.4);
      const t0 = x0 + (x1 - x0) * 0.22;
      const t1 = x0 + (x1 - x0) * 0.78;
      g.fillStyle = day ? '#5e6a7c' : look === 'snow' ? '#3a3a48' : '#0c0d14';
      g.fillRect(x0, deck, x1 - x0, 4);
      for (const t of [t0, t1]) g.fillRect(t - 3, towerTop, 6, deck - towerTop + 30);
      g.strokeStyle = day ? 'rgba(80,90,106,0.85)' : look === 'snow' ? 'rgba(40,40,52,0.9)' : 'rgba(10,10,16,0.95)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x0 - 20, deck - 2);
      g.quadraticCurveTo((x0 + t0) / 2, deck - 10, t0, towerTop);
      g.quadraticCurveTo((t0 + t1) / 2, deck + 6, t1, towerTop);
      g.quadraticCurveTo((t1 + x1) / 2, deck - 10, x1 + 20, deck - 2);
      g.stroke();
      // the lights along the main cable and the deck (off by day)
      for (let i = 0; i <= 40 && !day; i++) {
        const t = i / 40;
        const x = t0 + (t1 - t0) * t;
        const yy = towerTop + (deck + 6 - towerTop) * 4 * t * (1 - t) * 0.92;
        g.fillStyle = 'rgba(255,230,180,0.9)';
        g.fillRect(x - 1, yy - 1, 2, 2);
        glow(g, x, yy, 6, '255,210,150', 0.25);
      }
      for (let x = x0; x < x1 && !day; x += 7) {
        g.fillStyle = 'rgba(255,214,150,0.9)';
        g.fillRect(x, deck - 1, 2, 2);
      }
      if (!day) {
        glow(g, t0, towerTop, 10, '255,60,50', 0.7);
        glow(g, t1, towerTop, 10, '255,60,50', 0.7);
      }
    }
    if (look === 'wet') {
      const mist = g.createLinearGradient(0, py(6), 0, py(0));
      mist.addColorStop(0, 'rgba(70,74,86,0)');
      mist.addColorStop(1, 'rgba(90,86,90,0.4)');
      g.fillStyle = mist;
      g.fillRect(0, 0, w, h);
    }
    if (look === 'snow') {
      const haze = g.createLinearGradient(0, 0, 0, h);
      haze.addColorStop(0, 'rgba(200,205,220,0.05)');
      haze.addColorStop(1, 'rgba(200,205,220,0.22)');
      g.fillStyle = haze;
      g.fillRect(0, 0, w, h);
    }
    if (day) {
      // a warm summer haze over the far city
      const haze = g.createLinearGradient(0, py(7), 0, py(-1));
      haze.addColorStop(0, 'rgba(250,236,214,0)');
      haze.addColorStop(1, 'rgba(250,236,214,0.32)');
      g.fillStyle = haze;
      g.fillRect(0, py(7), w, py(-1) - py(7));
    }
  };
}

// ---------- the rooftops (mid ring) ----------

function paintMid(look: Look): Draw {
  return (g, w, h) => {
    const r = rand(523);
    g.clearRect(0, 0, w, h);
    const py = (y: number) => ((MID.y1 - y) / (MID.y1 - MID.y0)) * h;
    const day = look === 'sun';
    // by day each block has its own brick or stone (a separate random stream: the layout stays the same)
    const shades = rand(5230);
    const DAY = ['#9a6a52', '#a77c62', '#8c5c48', '#b08f72', '#857060', '#a0705a', '#93806c'];
    const night = look === 'snow' ? '#2a2834' : look === 'wet' ? '#121216' : '#10121e';
    const tower = day ? '#6e4e36' : look === 'snow' ? '#3a3036' : look === 'wet' ? '#1c1714' : '#1a1512';
    let x = -30;
    let n = 0;
    while (x < w + 30) {
      const bw = 140 + r() * 260;
      const roof = py(2.4 + r() * 2.2);
      const tone = day ? DAY[Math.floor(shades() * DAY.length)] : night;
      g.fillStyle = tone;
      g.fillRect(x, roof, bw, h - roof);
      // a parapet with coping, a lit top floor or two
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, roof, bw, 5);
      if (day) {
        g.fillStyle = 'rgba(246,232,206,0.55)';
        g.fillRect(x, roof - 2, bw, 3);
      }
      g.save();
      g.beginPath();
      g.rect(x, roof, bw, h - roof);
      g.clip();
      windowGrid(g, r, x + 10, x + bw - 10, roof + 18, h, 11, 15, 12, 16, 0.38, look, 14);
      if (day) sunSide(g, x, roof, bw, h - roof, 1.1);
      g.restore();
      if (look === 'snow') snowLine(g, x - 2, x + bw + 2, roof, 7, r);
      // things on the roof: water towers, chimney stacks, vents, a roof garden under a string of lights
      const what = n % 4;
      if (what === 0 || what === 2) waterTower(g, x + bw * (0.25 + r() * 0.5), roof, 46 + r() * 30, tower, look, r);
      if (what === 1) {
        for (let k = 0; k < 3; k++) {
          const cx = x + bw * (0.2 + k * 0.25);
          const ch = 20 + r() * 34;
          g.fillStyle = tone;
          g.fillRect(cx, roof - ch, 14, ch);
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(cx - 2, roof - ch, 18, 4);
        }
      }
      if (what === 3) {
        // a roof garden: shrubs, a pergola, a sagging string of warm bulbs
        for (let k = 0; k < 6; k++) {
          const cx = x + bw * (0.1 + k * 0.15);
          const rx = 14 + r() * 8;
          const ry = 12 + r() * 6;
          g.fillStyle = day ? '#4f7a3a' : look === 'snow' ? '#3a3e48' : '#0e1612';
          g.beginPath();
          g.ellipse(cx, roof - 8, rx, ry, 0, 0, Math.PI * 2);
          g.fill();
          if (day) {
            // leaves catching the sun on top
            g.fillStyle = 'rgba(170,206,110,0.55)';
            g.beginPath();
            g.ellipse(cx - rx * 0.25, roof - 8 - ry * 0.35, rx * 0.6, ry * 0.45, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.strokeStyle = tone;
        g.lineWidth = 3;
        g.strokeRect(x + bw * 0.55, roof - 40, bw * 0.3, 40);
        g.strokeStyle = 'rgba(20,16,12,0.9)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + bw * 0.08, roof - 34);
        g.quadraticCurveTo(x + bw * 0.45, roof - 12, x + bw * 0.9, roof - 36);
        g.stroke();
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const bx = x + bw * (0.08 + 0.82 * t);
          const by = roof - 34 + (1 - (2 * t - 1) * (2 * t - 1)) * 18 - t * 2;
          if (!day) glow(g, bx, by, 9, '255,200,120', look === 'wet' ? 0.5 : 0.38);
          g.fillStyle = day ? 'rgba(236,230,214,0.85)' : '#ffd890';
          g.fillRect(bx - 1.5, by - 1.5, 3, 3);
        }
        if (look === 'snow') for (let k = 0; k < 6; k++) snowLine(g, x + bw * (0.1 + k * 0.15) - 14, x + bw * (0.1 + k * 0.15) + 14, roof - 16, 5, r);
      }
      x += bw + r() * 30;
      n++;
    }
    if (look === 'wet') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(80,86,100,0.22)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
  };
}

// ---------- across the street (back windows) ----------

/** A brick facade's fill: dark brick with faint courses. */
function brickFacade(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, base: string, look: Look, r: () => number) {
  g.fillStyle = base;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let y = y0; y < y1; y += 6) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.08})`;
    g.fillRect(x0, y, x1 - x0, 1);
  }
  for (let i = 0; i < ((x1 - x0) * (y1 - y0)) / 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '140,80,60'},${0.06 + r() * 0.06})`;
    g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 6 + r() * 10, 3);
  }
  if (look === 'wet') {
    g.fillStyle = 'rgba(110,130,160,0.08)';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  if (look === 'sun') {
    // full sun on the brick, a touch brighter toward the top
    const sun = g.createLinearGradient(0, y0, 0, y1);
    sun.addColorStop(0, 'rgba(255,214,160,0.18)');
    sun.addColorStop(1, 'rgba(255,214,160,0.04)');
    g.fillStyle = sun;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

/**
 * A tall arched window: lit (warm, with a plant, a lamp, curtains) or dark. By day, a stone
 * surround and a cream frame, the sky in the glass, and the same rooms behind it in shade.
 */
function archedWindow(g: CanvasRenderingContext2D, x: number, y: number, ww: number, wh: number, lit: boolean, look: Look, r: () => number) {
  const day = look === 'sun';
  g.fillStyle = day ? 'rgba(214,196,166,0.95)' : 'rgba(60,40,30,0.9)';
  g.beginPath();
  g.moveTo(x - 4, y + wh + 4);
  g.lineTo(x - 4, y + ww / 2);
  g.arc(x + ww / 2, y + ww / 2, ww / 2 + 4, Math.PI, 0);
  g.lineTo(x + ww + 4, y + wh + 4);
  g.fill();
  g.save();
  g.beginPath();
  g.moveTo(x, y + wh);
  g.lineTo(x, y + ww / 2);
  g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0);
  g.lineTo(x + ww, y + wh);
  g.closePath();
  g.clip();
  if (lit) {
    if (!day) glow(g, x + ww / 2, y + wh / 2, wh, '255,190,110', look === 'wet' ? 0.3 : 0.2);
    const grad = g.createLinearGradient(x, y, x, y + wh);
    grad.addColorStop(0, day ? '#9ab3c8' : '#ffd28a');
    grad.addColorStop(1, day ? '#4c5864' : '#e88f48');
    g.fillStyle = grad;
    g.fillRect(x, y, ww, wh);
    // inside: a hanging lamp, a shelf of books, a plant on the sill, curtains drawn back
    const k = r();
    g.fillStyle = 'rgba(70,36,16,0.55)';
    if (k < 0.33) {
      g.fillRect(x + ww * 0.1, y + wh * 0.45, ww * 0.8, 3);
      for (let i = 0; i < 7; i++) g.fillRect(x + ww * (0.12 + i * 0.1), y + wh * 0.45 - 10 - r() * 4, ww * 0.06, 10 + r() * 4);
    } else if (k < 0.66) {
      g.beginPath();
      g.moveTo(x + ww * 0.5, y);
      g.lineTo(x + ww * 0.5, y + wh * 0.3);
      g.stroke();
      g.fillStyle = 'rgba(40,20,10,0.7)';
      g.beginPath();
      g.arc(x + ww * 0.5, y + wh * 0.34, ww * 0.12, Math.PI, 0);
      g.fill();
      if (!day) glow(g, x + ww * 0.5, y + wh * 0.4, ww * 0.4, '255,240,200', 0.6);
    }
    g.fillStyle = day ? 'rgba(236,218,190,0.8)' : 'rgba(120,50,30,0.55)';
    g.fillRect(x, y, ww * 0.18, wh);
    g.fillRect(x + ww * 0.82, y, ww * 0.18, wh);
    if (r() < 0.6) {
      g.fillStyle = day ? 'rgba(70,118,60,0.95)' : 'rgba(20,34,18,0.85)';
      for (let i = 0; i < 10; i++) {
        g.beginPath();
        g.ellipse(x + ww * (0.35 + r() * 0.3), y + wh - 8 - r() * 16, 5 + r() * 4, 3 + r() * 3, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    if (day) {
      const sky = g.createLinearGradient(x, y, x + ww * 0.6, y + wh);
      sky.addColorStop(0, '#c2d6e8');
      sky.addColorStop(0.5, '#86a2bc');
      sky.addColorStop(1, '#53667a');
      g.fillStyle = sky;
    } else g.fillStyle = look === 'snow' ? '#2a2c38' : '#0c0d14';
    g.fillRect(x, y, ww, wh);
    g.fillStyle = day ? 'rgba(255,255,255,0.18)' : 'rgba(120,140,190,0.08)';
    g.fillRect(x, y, ww * 0.4, wh);
  }
  if (day) {
    // the head of the recess shades the top of the glass
    const sh = g.createLinearGradient(0, y, 0, y + wh * 0.35);
    sh.addColorStop(0, 'rgba(30,24,20,0.4)');
    sh.addColorStop(1, 'rgba(30,24,20,0)');
    g.fillStyle = sh;
    g.fillRect(x, y, ww, wh * 0.35);
  }
  // glazing bars
  g.strokeStyle = day ? 'rgba(238,232,218,0.95)' : 'rgba(20,12,8,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + ww / 2, y);
  g.lineTo(x + ww / 2, y + wh);
  for (let k = 1; k < 3; k++) {
    g.moveTo(x, y + ww / 2 + ((wh - ww / 2) * k) / 3);
    g.lineTo(x + ww, y + ww / 2 + ((wh - ww / 2) * k) / 3);
  }
  g.stroke();
  g.restore();
  // a stone sill
  g.fillStyle = look === 'snow' ? '#dfe4ee' : day ? '#ddcdb0' : '#5a4a40';
  g.fillRect(x - 6, y + wh + 2, ww + 12, look === 'snow' ? 6 : 4);
  if (day) {
    g.fillStyle = 'rgba(40,24,16,0.35)';
    g.fillRect(x - 4, y + wh + 6, ww + 12, 4);
  }
}

/** A black iron fire escape: landings with railings at each floor, ladders zig-zagging between. */
function fireEscape(g: CanvasRenderingContext2D, x0: number, x1: number, floors: number[], look: Look) {
  g.strokeStyle = look === 'snow' ? 'rgba(24,24,30,0.95)' : look === 'sun' ? 'rgba(34,32,36,0.95)' : 'rgba(8,8,10,0.95)';
  g.fillStyle = g.strokeStyle;
  floors.forEach((y, i) => {
    g.lineWidth = 3;
    g.fillRect(x0, y, x1 - x0, 4);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x0, y - 26);
    g.lineTo(x1, y - 26);
    g.moveTo(x0, y - 13);
    g.lineTo(x1, y - 13);
    g.stroke();
    for (let x = x0; x <= x1; x += 6) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 26);
      g.stroke();
    }
    if (look === 'snow') snowLine(g, x0, x1, y, 5, rand(i + 3));
    const next = floors[i + 1];
    if (next !== undefined) {
      // the stair down to the next landing
      const a = i % 2 ? x0 + 10 : x1 - 10;
      const b = i % 2 ? x1 - 30 : x0 + 30;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(a, y);
      g.lineTo(b, next);
      g.moveTo(a, y - 22);
      g.lineTo(b, next - 22);
      g.stroke();
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        g.beginPath();
        g.moveTo(a + (b - a) * t, y + (next - y) * t);
        g.lineTo(a + (b - a) * t, y + (next - y) * t - 4);
        g.stroke();
      }
    }
  });
}

/** Across the street from the back windows. The plane spans x from -NB.w/2 to NB.w/2 and y from NB.y0 to NB.y1. */
const NB = { w: 26, y0: -3, y1: 9 };

function paintBackNear(look: Look): Draw {
  return (g, w, h) => {
    const r = rand(77);
    g.clearRect(0, 0, w, h);
    const px = (x: number) => ((x + NB.w / 2) / NB.w) * w;
    const py = (y: number) => ((NB.y1 - y) / (NB.y1 - NB.y0)) * h;
    const day = look === 'sun';
    const brick = day ? '#a1573e' : look === 'snow' ? '#3a2a28' : look === 'wet' ? '#22160f' : '#2c1c14';
    // left: a tall old loft building, arched windows in rows, a cornice, a fire escape
    const L1 = px(-2.6);
    const roofL = py(6.7);
    brickFacade(g, 0, roofL, L1, h, brick, look, r);
    for (const [y0, y1] of [
      [2.5, 3.9],
      [4.55, 5.95],
      [0.4, 1.8],
    ] as [number, number][])
      for (let x = px(-12.6); x < L1 - 80; x += 112) archedWindow(g, x, py(y1), 62, py(y0) - py(y1), r() < 0.55, look, r);
    // the cornice: a heavy moulded band with brackets (sunlit stone by day, with its shadow under it)
    g.fillStyle = day ? '#d9c6a6' : look === 'snow' ? '#3e3438' : '#1a120e';
    g.fillRect(0, roofL - 14, L1 + 10, 18);
    g.fillRect(0, roofL + 4, L1 + 4, 6);
    for (let x = 6; x < L1; x += 30) g.fillRect(x, roofL + 10, 10, 12);
    if (day) {
      g.fillStyle = 'rgba(50,26,16,0.4)';
      g.fillRect(0, roofL + 22, L1 + 4, 10);
    }
    if (look === 'snow') snowLine(g, 0, L1 + 10, roofL - 14, 9, r);
    fireEscape(g, px(-6.0), px(-3.3), [py(4.45), py(2.4), py(0.3)], look);
    // middle: a lower building with a water tower on its roof
    const M0 = L1;
    const M1 = px(2.2);
    const roofM = py(2.6);
    brickFacade(g, M0, roofM, M1, h, day ? '#93533e' : look === 'snow' ? '#33282a' : '#1f1611', look, r);
    for (let x = M0 + 30; x < M1 - 70; x += 96) archedWindow(g, x, py(2.3), 56, py(1.1) - py(2.3), r() < 0.5, look, r);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(M0, roofM - 8, M1 - M0, 10);
    // roof railing
    g.strokeStyle = 'rgba(10,10,12,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(M0, roofM - 24);
    g.lineTo(M1, roofM - 24);
    g.stroke();
    for (let x = M0; x < M1; x += 40) {
      g.beginPath();
      g.moveTo(x, roofM - 8);
      g.lineTo(x, roofM - 24);
      g.stroke();
    }
    if (look === 'snow') snowLine(g, M0, M1, roofM - 8, 8, r);
    waterTower(g, px(-0.4), roofM - 8, 118, day ? '#6e4e36' : look === 'snow' ? '#3a2e2c' : '#1e1612', look, r);
    // a skylight glowing on the roof (by day, its glass shows the sky)
    if (!day) glow(g, px(1.4), roofM - 14, 50, '255,200,130', 0.25);
    g.fillStyle = day ? '#b9d0e4' : '#ffcf8a';
    g.fillRect(px(1.15), roofM - 22, px(1.65) - px(1.15), 12);
    // right: a mid-rise whose roof garden sits low in the right-hand window
    const R0 = M1;
    const roofR = py(2.35);
    brickFacade(g, R0, roofR, w, h, day ? '#8f5f4c' : look === 'snow' ? '#2e2630' : '#1a1418', look, r);
    for (let y = py(2.0); y < h - 40; y += 70) for (let x = R0 + 24; x < w - 40; x += 70) archedWindow(g, x, y, 40, 50, r() < 0.4, look, r);
    if (look === 'snow') snowLine(g, R0, w, roofR, 8, r);
    // a string of warm bulbs from a pole over the roof garden
    g.strokeStyle = 'rgba(12,10,8,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px(3.0), roofR);
    g.lineTo(px(3.0), py(3.8));
    g.moveTo(px(9.5), roofR);
    g.lineTo(px(9.5), py(3.6));
    g.stroke();
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(px(3.0), py(3.8));
    g.quadraticCurveTo(px(6.2), py(2.6), px(9.5), py(3.6));
    g.stroke();
    for (let k = 0; k <= 22; k++) {
      const t = k / 22;
      const bx = px(3.0) + (px(9.5) - px(3.0)) * t;
      const by = (1 - t) * (1 - t) * py(3.8) + 2 * t * (1 - t) * py(2.6) + t * t * py(3.6);
      if (!day) glow(g, bx, by + 4, 12, '255,200,120', look === 'wet' ? 0.55 : 0.4);
      g.fillStyle = day ? 'rgba(238,232,216,0.9)' : '#ffdc9a';
      g.beginPath();
      g.arc(bx, by + 4, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    // planters along the roof's edge
    for (let k = 0; k < 7; k++) {
      const cx = px(3.4 + k * 0.95);
      g.fillStyle = day ? '#9a5634' : '#2a1c14';
      g.fillRect(cx - 18, roofR - 14, 36, 14);
      g.fillStyle = day ? '#4a7838' : look === 'snow' ? '#3c4250' : '#0f1a12';
      g.beginPath();
      g.ellipse(cx, roofR - 20, 22, 14, 0, 0, Math.PI * 2);
      g.fill();
      if (day) {
        g.fillStyle = 'rgba(176,210,112,0.55)';
        g.beginPath();
        g.ellipse(cx - 6, roofR - 25, 13, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (look === 'snow') snowLine(g, cx - 18, cx + 18, roofR - 28, 5, r);
    }
    if (look === 'wet') {
      g.globalCompositeOperation = 'source-atop';
      const sheen = g.createLinearGradient(0, 0, 0, h);
      sheen.addColorStop(0, 'rgba(120,140,170,0.06)');
      sheen.addColorStop(1, 'rgba(60,70,90,0.2)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
  };
}

/**
 * Across the side street from the lounge window. The plane spans u (left to
 * right as seen from inside, i.e. from +z toward -z) and y from NS.y0 to
 * NS.y1. Seen from the room the window looks along the street toward the
 * back, so the building stands on the right (u > 14.6) with a street lamp on
 * a bracket off its corner, and the rooftops beyond show on the left.
 */
const NS = { w: 24, y0: -3, y1: 9 };

function paintSideNear(look: Look): Draw {
  return (g, w, h) => {
    const r = rand(91);
    g.clearRect(0, 0, w, h);
    const px = (u: number) => (u / NS.w) * w;
    const py = (y: number) => ((NS.y1 - y) / (NS.y1 - NS.y0)) * h;
    const day = look === 'sun';
    const x0 = px(14.6);
    const roof = py(6.3);
    brickFacade(g, x0, roof, w, h, day ? '#a65c41' : look === 'snow' ? '#3a2c2a' : look === 'wet' ? '#20150f' : '#2a1b13', look, r);
    for (const [y0, y1] of [
      [2.6, 3.9],
      [4.45, 5.75],
      [0.6, 1.9],
    ] as [number, number][])
      for (let x = x0 + 34; x < w - 60; x += 104) archedWindow(g, x, py(y1), 58, py(y0) - py(y1), r() < 0.6, look, r);
    // the cornice, and the dark quoins down the corner (pale stone by day)
    g.fillStyle = day ? '#d8c6a8' : look === 'snow' ? '#3a3036' : '#170f0b';
    g.fillRect(x0 - 8, roof - 12, w - x0 + 8, 16);
    for (let x = x0; x < w; x += 28) g.fillRect(x + 4, roof + 4, 9, 10);
    for (let y = roof + 20; y < h; y += 44) g.fillRect(x0, y, 16, 22);
    if (day) {
      g.fillStyle = 'rgba(50,26,16,0.35)';
      g.fillRect(x0 - 4, roof + 4, w - x0 + 4, 8);
    }
    if (look === 'snow') snowLine(g, x0 - 8, w, roof - 12, 9, r);
    // a painted ghost of an old wall advert high on the side, faded to blocks of colour (no words)
    g.fillStyle = day ? 'rgba(226,206,150,0.16)' : 'rgba(190,170,120,0.07)';
    g.fillRect(px(19.6), py(6.0), px(3.4), py(5.0) - py(6.0));
    // a street lamp on a curved bracket off the corner, its glow on the brick
    const lx = px(13.3);
    g.strokeStyle = 'rgba(8,8,10,0.95)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x0, py(4.6));
    g.quadraticCurveTo(x0 - 20, py(4.85), lx, py(4.5));
    g.stroke();
    if (!day) {
      glow(g, lx, py(4.2), look === 'wet' ? 150 : 110, '255,200,130', look === 'snow' ? 0.45 : 0.38);
      glow(g, x0 + 60, py(4.0), 160, '255,190,120', 0.12);
    }
    g.fillStyle = day ? '#e8e2d2' : '#ffe2a8';
    g.beginPath();
    g.ellipse(lx, py(4.32), 12, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(8,8,10,0.95)';
    g.fillRect(lx - 14, py(4.48), 28, 6);
    // wires from the corner off to the left, sagging across the street
    g.strokeStyle = 'rgba(8,8,10,0.9)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x0, py(5.7));
    g.quadraticCurveTo(px(9), py(4.8), 0, py(5.9));
    g.moveTo(x0, py(5.4));
    g.quadraticCurveTo(px(9), py(4.3), 0, py(5.5));
    g.stroke();
    if (look === 'wet') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(80,96,120,0.12)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
  };
}

// ---------- assembled ----------

function viewMaterial(key: string, size: [number, number], paint: (look: Look) => Draw, alpha: boolean, side: THREE.Side = THREE.FrontSide) {
  return once2(key, () => {
    const make = (look: Look) => () => painted(size[0], size[1], paint(look), alpha);
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: alpha, depthWrite: !alpha, side, color: new THREE.Color(0.92, 0.92, 0.92) });
    return weatherView(m, { clear: make('clear'), wet: make('wet'), snow: make('snow'), sun: make('sun') }, { mist: '#2a3440', mistAmount: alpha ? 0.12 : 0.22 });
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

/** An open vertical ring (or ellipse) segment seen from inside, its texture running left to right as seen from inside. */
function ringGeometry(rx: number, rz: number, y0: number, y1: number, cz: number) {
  const g = new THREE.CylinderGeometry(1, 1, y1 - y0, 96, 1, true, FAR.theta0, FAR.theta);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  g.scale(rx, 1, rz);
  g.translate(0, (y0 + y1) / 2, cz);
  return g;
}

/** Soft glows over the painted lights, so they bloom like real lamps (and swell in the rain). */
function LampGlows() {
  const m = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ffb070').multiplyScalar(1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = viewValue(1, 1.35, 1.15, 0); // the street lamps are off by day
    ref.current?.children.forEach((c) => c.scale.setScalar(k * (c.userData.s as number)));
  });
  const ns = (u: number, y: number) => new THREE.Vector3(NEAR_SIDE_X + 0.05, y, SIDE_CZ + NS.w / 2 - u);
  const spots: [THREE.Vector3, number, number][] = [
    // the street lamp across the side street
    [ns(13.3, 4.25), 1.5, Math.PI / 2],
  ];
  return (
    <group ref={ref}>
      {spots.map(([p, s, yaw], i) => (
        <mesh key={i} position={p} rotation={[0, yaw, 0]} material={m} userData={{ s }} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/** Keeps the room's window light in step with the weather (moonlight, rain, snow glow, daylight). */
function WeatherLevels() {
  useFrame(() => {
    officeLightLevels.window = viewValue(1, 0.62, 1.25, 1.8);
    officeLightLevels.day = viewValue(0, 0, 0, 1);
  });
  return null;
}

/** The sun on a sunny day: high behind the building and a little to the left, so it comes in through the back windows and the lounge window. */
const SUN_DIR: [number, number, number] = [0.32, -0.62, 0.72];
const SUN_WINDOWS: SunWindow[] = [
  ...BACK_OPENINGS.map((o): SunWindow => ({ c: [(o.u0 + o.u1) / 2, (o.y0 + o.y1) / 2, ROOM.back], w: o.u1 - o.u0, h: o.y1 - o.y0, yaw: 0, panes: [4, 5], arch: ARCH_RISE / (o.y1 - o.y0) })),
  { c: [ROOM.x0, (SIDE_OPENING.y0 + SIDE_OPENING.y1) / 2, -(SIDE_OPENING.u0 + SIDE_OPENING.u1) / 2], w: SIDE_OPENING.u1 - SIDE_OPENING.u0, h: SIDE_OPENING.y1 - SIDE_OPENING.y0, yaw: Math.PI / 2, panes: [4, 4], arch: ARCH_RISE / (SIDE_OPENING.y1 - SIDE_OPENING.y0) },
];
/** Where it lands: the floor, and the tops of the two desks. */
const SUN_SURFACES: SunSurface[] = [
  { y: 0, x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.back, z1: ROOM.front },
  { y: DESK.top, x0: DESK.x0, x1: DESK.x1, z0: DESK.back, z1: DESK.front },
  { y: BACK_DESK.top, x0: BACK_DESK.x0, x1: BACK_DESK.x1, z0: BACK_DESK.back, z1: BACK_DESK.front },
];

const NEAR_BACK_Z = BACK_GLASS_Z - 3.6;
const NEAR_SIDE_X = SIDE_GLASS_X - 3.3;
const SIDE_CZ = -7;
const RING_CZ = -2;

export function OutsideViews() {
  const geo = useMemo(
    () =>
      once('office:outside', () => ({
        far: ringGeometry(FAR.R, FAR.R, FAR.y0, FAR.y1, RING_CZ),
        mid: ringGeometry(MID.rx, MID.rz, MID.y0, MID.y1, RING_CZ),
        backNear: new THREE.PlaneGeometry(NB.w, NB.y1 - NB.y0).translate(0, (NB.y0 + NB.y1) / 2, 0),
        sideNear: new THREE.PlaneGeometry(NS.w, NS.y1 - NS.y0).translate(0, (NS.y0 + NS.y1) / 2, 0),
      })),
    [],
  );
  const far = viewMaterial('office-view:far', [4096, 1024], paintFar, false, THREE.BackSide);
  const mid = viewMaterial('office-view:mid', [4096, 1024], paintMid, true, THREE.BackSide);
  const backNear = viewMaterial('office-view:back-near', [2048, 1024], paintBackNear, true);
  const sideNear = viewMaterial('office-view:side-near', [2048, 1024], paintSideNear, true);
  const sz = (SIDE_OPENING.u0 + SIDE_OPENING.u1) / 2;
  return (
    <group>
      <mesh geometry={geo.far} material={far} renderOrder={0} />
      <mesh geometry={geo.mid} material={mid} renderOrder={1} />
      <mesh geometry={geo.backNear} material={backNear} position={[0, 0, NEAR_BACK_Z]} renderOrder={1} />
      <mesh geometry={geo.sideNear} material={sideNear} position={[NEAR_SIDE_X, 0, SIDE_CZ]} rotation={[0, Math.PI / 2, 0]} renderOrder={1} />
      <LampGlows />
      {/* rain and snow between the glass and the buildings across the street */}
      <Precipitation min={[-7.6, 0.6, NEAR_BACK_Z + 0.4]} max={[7.6, 8.2, BACK_GLASS_Z - 0.15]} glow={{ position: [6.2, 3.2, NEAR_BACK_Z + 0.6], radius: 3.2, color: '#ffc27a', strength: 0.5 }} />
      <Precipitation min={[NEAR_SIDE_X + 0.4, 0.6, -sz - 3.6]} max={[SIDE_GLASS_X - 0.15, 7.8, -sz + 3.6]} glow={{ position: [NEAR_SIDE_X + 0.6, 4.2, SIDE_CZ + NS.w / 2 - 13.3], radius: 3, color: '#ffcf8a', strength: 0.6 }} />
      <WeatherLevels />
      {/* on a sunny day: the sun's patches on the floor and desks, its beams and the dust in them */}
      <SunShine windows={SUN_WINDOWS} dir={SUN_DIR} surfaces={SUN_SURFACES} />
    </group>
  );
}
