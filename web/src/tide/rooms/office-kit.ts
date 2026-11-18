import * as THREE from 'three';
import { C, css, mix, noise3, once, pixels, rand, rgb, smoothstep, tex } from './ramen-kit';

// Shared pieces for the night office: its own reflections (a warm brick loft
// with three big night windows), a material helper that gives every lit
// material those reflections, and the generated textures that only the office
// uses (old red brick and its bump, herringbone oak, woven upholstery, velvet
// crush, cracked leather). The generic helpers (caches, merging, UVs, wood
// grain, lathes) come from the kitchen's kit.

export {
  boxUV,
  boxUVUpright,
  bumpTex,
  C,
  css,
  fbm3,
  mapUV,
  Merger,
  mix,
  noise3,
  once,
  paint,
  paintFlat,
  paintLathe,
  pick,
  pixels,
  plank,
  plasterBump,
  plasterTex,
  rand,
  repeated,
  rgb,
  roundRect,
  shade,
  slab,
  smoothLathe,
  smoothstep,
  softDot,
  tex,
  trs,
  V,
  variant,
  weaveTex,
  woodTex,
  worley3,
} from './ramen-kit';

/**
 * The office's reflections: a small painted panorama of a dim loft at night
 * (dark timber ceiling with a row of warm lamp glows, brick glowing amber at
 * the horizon, three tall cool windows on one side, a dark oak floor). Every
 * lit material made with omat() carries it, so the app's envMapIntensity (0.3
 * on room materials) is what counts, not the studio environment.
 */
export function officeEnv() {
  return once('office-env', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2a1d14');
    grad.addColorStop(0.3, '#5a3a26');
    grad.addColorStop(0.48, '#9a6440');
    grad.addColorStop(0.6, '#5e3a24');
    grad.addColorStop(1, '#1c120c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    const blob = (x: number, y: number, rx: number, ry: number, col: string) => {
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      const b = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      b.addColorStop(0, col);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = b;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    };
    // the windows: three tall cool panes on one side
    for (const x of [96, 128, 160]) {
      g.fillStyle = 'rgba(70,96,150,0.85)';
      g.fillRect(x - 11, 70, 22, 52);
      blob(x, 96, 30, 40, 'rgba(110,140,200,0.35)');
    }
    // warm lamps round the room, and the glow of the brick under them
    for (const x of [230, 280, 330, 380, 440, 20]) blob(x, 64, 22, 16, 'rgba(255,206,140,1)');
    blob(330, 118, 120, 30, 'rgba(255,170,100,0.35)');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

/** How much of its environment a room material catches (the app sets the same on the room's materials). */
export const ROOM_ENV = 0.3;

/** A material made once per key; lit materials get the office's own reflections. */
export const omat = <T extends THREE.Material>(key: string, make: () => T): T =>
  once('office-mat:' + key, () => {
    const m = make();
    const std = m as unknown as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial && !std.envMap) {
      std.envMap = officeEnv();
      std.envMapIntensity = ROOM_ENV;
    }
    return m;
  });

// ---------- brick ----------

/** One brick texture tile: 16 bricks across and 24 courses up, in world units. */
export const BRICK_TILE: [number, number] = [6.72, 3.36];

type BrickPass = 'colour' | 'bump';

/**
 * Old red brick in running bond, drawn twice from the same random stream: as
 * colour (each brick its own fired tone, darker burnt ends now and then, a
 * paler sandy face on some, chipped arrises, grit and pits, mortar raked back
 * and dusty), and as a bump map (mortar recessed, bricks pitted and chipped).
 * Tiles in both directions.
 */
function drawBricks(g: CanvasRenderingContext2D, w: number, h: number, pass: BrickPass, painted = false) {
  const r = rand(907);
  const cols = 16;
  const rows = 24;
  const bw = w / cols;
  const bh = h / rows;
  const gap = Math.max(3, Math.round(bh * 0.15));
  const bump = pass === 'bump';
  // the mortar: dusty grey-beige, gritty
  g.fillStyle = bump ? 'rgb(52,52,52)' : painted ? '#b8ad9c' : '#6f655a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 60; i++) {
    const v = r();
    g.fillStyle = bump ? `rgba(${v < 0.5 ? '20,20,20' : '90,90,90'},0.5)` : v < 0.5 ? `rgba(40,34,28,${0.18 + r() * 0.2})` : `rgba(190,180,160,${0.14 + r() * 0.2})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  const palette = painted ? ['#e2d8c6', '#dacfbc', '#e6ddcc', '#d4c8b4', '#ddd3c2'] : ['#8e3f26', '#9a4a2c', '#7d3820', '#a3532f', '#86412a', '#934634', '#6e3322', '#a8603a', '#8a4a32', '#7a3a2c'];
  const drawOne = (x: number, y: number, ww: number, hh: number, id: number) => {
    // separate streams per brick, so the colour and bump passes agree whatever their resolution
    const rc = rand(id);
    const rm = rand(id + 1);
    const rs = rand(id + 2);
    const rk = rand(id + 3);
    const base = C(palette[Math.floor(rc() * palette.length)]);
    base.multiplyScalar(0.82 + rc() * 0.32);
    base.offsetHSL((rc() - 0.5) * 0.02, (rc() - 0.5) * 0.12, 0);
    const kind = rc();
    const hex = '#' + base.getHexString();
    const rad = Math.min(ww, hh) * 0.16;
    if (bump) {
      const v = Math.round(150 + rc() * 40);
      g.fillStyle = `rgb(${v},${v},${v})`;
    } else {
      const grad = g.createLinearGradient(x, y, x, y + hh);
      grad.addColorStop(0, shadeHex(hex, 1.08));
      grad.addColorStop(0.5, hex);
      grad.addColorStop(1, shadeHex(hex, 0.86));
      g.fillStyle = grad;
    }
    g.beginPath();
    g.roundRect(x, y, ww, hh, rad);
    g.fill();
    g.save();
    g.beginPath();
    g.roundRect(x, y, ww, hh, rad);
    g.clip();
    if (!bump && painted) {
      // old paint: a soft wash of tone, now and then flaked off to the red brick beneath
      for (let k = 0; k < 4; k++) {
        const px = x + rm() * ww;
        const py = y + rm() * hh;
        const rr = hh * (0.4 + rm() * 1.2);
        const b = g.createRadialGradient(px, py, 0, px, py, rr);
        b.addColorStop(0, `rgba(${rm() < 0.5 ? '150,130,110' : '255,250,240'},${0.06 + rm() * 0.08})`);
        b.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = b;
        g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
      if (kind < 0.06) {
        const fx = x + rm() * ww;
        const fy = y + rm() * hh;
        g.fillStyle = 'rgba(176,122,92,0.55)';
        g.beginPath();
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          const rr = hh * (0.18 + rm() * 0.3);
          if (k) g.lineTo(fx + Math.cos(a) * rr * 1.6, fy + Math.sin(a) * rr);
          else g.moveTo(fx + Math.cos(a) * rr * 1.6, fy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(140,120,100,0.35)';
        g.lineWidth = 1;
        g.stroke();
      }
    } else if (!bump) {
      // fired unevenly: a burnt dark end, or a pale sandy face, or a dark core
      if (kind < 0.16) {
        const end = rm() < 0.5 ? x : x + ww;
        const b = g.createRadialGradient(end, y + hh / 2, 0, end, y + hh / 2, ww * 0.7);
        b.addColorStop(0, 'rgba(30,14,10,0.75)');
        b.addColorStop(1, 'rgba(30,14,10,0)');
        g.fillStyle = b;
        g.fillRect(x, y, ww, hh);
      } else if (kind < 0.3) {
        g.fillStyle = `rgba(214,160,112,${0.18 + rm() * 0.18})`;
        g.fillRect(x, y, ww, hh);
      } else if (kind < 0.36) {
        g.fillStyle = 'rgba(40,20,16,0.35)';
        g.fillRect(x, y, ww, hh);
      }
      // soft mottling across the face
      for (let k = 0; k < 7; k++) {
        const px = x + rm() * ww;
        const py = y + rm() * hh;
        const rr = hh * (0.3 + rm() * 0.9);
        const b = g.createRadialGradient(px, py, 0, px, py, rr);
        const tone = rm() < 0.5 ? '50,22,14' : '220,150,110';
        b.addColorStop(0, `rgba(${tone},${0.08 + rm() * 0.1})`);
        b.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = b;
        g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
    }
    // grit and pits (as many as the brick's area at this resolution)
    const n = Math.floor((ww * hh) / 16);
    for (let k = 0; k < n; k++) {
      const v = rs();
      if (bump) g.fillStyle = v < 0.6 ? `rgba(70,70,70,${0.3 + rs() * 0.4})` : `rgba(230,230,230,${0.2 + rs() * 0.3})`;
      else if (painted) g.fillStyle = v < 0.6 ? `rgba(120,100,80,${0.08 + rs() * 0.12})` : `rgba(255,252,245,${0.12 + rs() * 0.2})`;
      else g.fillStyle = v < 0.55 ? `rgba(35,16,10,${0.15 + rs() * 0.25})` : v < 0.9 ? `rgba(230,170,130,${0.1 + rs() * 0.18})` : `rgba(240,232,220,${0.25 + rs() * 0.3})`;
      const s = (1 + rs() * 2.2) * (w / 2048 + 0.5);
      g.fillRect(x + rs() * ww, y + rs() * hh, s, s);
    }
    g.restore();
    // chipped arrises: bites out of the edges showing the mortar bed
    const chips = Math.floor(rk() * 4);
    for (let k = 0; k < chips; k++) {
      const side = rk();
      const cx = side < 0.5 ? x + rk() * ww : rk() < 0.5 ? x : x + ww;
      const cy = side < 0.5 ? (rk() < 0.5 ? y : y + hh) : y + rk() * hh;
      const cr = gap * (painted ? 0.4 + rk() * 0.7 : 0.6 + rk() * 1.4);
      g.fillStyle = bump ? 'rgb(70,70,70)' : painted ? '#bcb1a0' : '#5e5248';
      g.beginPath();
      g.ellipse(cx, cy, cr * (1 + rk()), cr * 0.7, rk() * 3, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      // the same streams for a brick and its wrapped copy
      const id = (((col % cols) + cols) % cols) * 131 + row * 7919 + 17;
      const jitter = (rand(id + 4)() - 0.5) * bw * 0.012;
      const x = col * bw + off + gap / 2;
      const y = row * bh + gap / 2;
      const ww = bw - gap + jitter;
      const hh = bh - gap;
      for (const dx of [0, -w, w]) {
        if (x + dx > w || x + dx + ww < 0) continue;
        drawOne(x + dx, y, ww, hh, id);
      }
    }
  }
  if (!bump && !painted) {
    // a few streaks of old limewash caught in the joints and on brick faces
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = r() * h;
      const rr = 20 + r() * 60;
      const b = g.createRadialGradient(x, y, 0, x, y, rr);
      b.addColorStop(0, `rgba(226,214,196,${0.08 + r() * 0.1})`);
      b.addColorStop(1, 'rgba(226,214,196,0)');
      g.fillStyle = b;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
}

function shadeHex(hex: string, k: number) {
  const c = rgb(hex);
  return css([Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]);
}

export function brickTex() {
  return tex('o-brick', 2048, 1024, (g, w, h) => drawBricks(g, w, h, 'colour'), { aniso: 12 });
}
/** The same brick, painted over long ago in a warm off-white (it shares the bump map). */
export function paintedBrickTex() {
  return tex('o-brick-painted', 2048, 1024, (g, w, h) => drawBricks(g, w, h, 'colour', true), { aniso: 12 });
}
export function brickBump() {
  return tex('o-brick-bump', 1024, 512, (g, w, h) => drawBricks(g, w, h, 'bump'), { data: true });
}

// ---------- herringbone oak ----------

/** Slat width in world units; slats are four widths long. One texture tile is 16 slat-widths times root two. */
export const SLAT_W = 0.135;
export const HERRING_TILE = 16 * Math.SQRT2 * SLAT_W;

/**
 * Herringbone oak parquet at 45 degrees: every slat its own tone and figure,
 * grain running along it, a soft bevel on its long edges and dark hairline
 * gaps. The pattern's two periods divide the tile, so it repeats seamlessly
 * (a slat cut by the edge is finished by its twin on the far side).
 */
export function herringboneTex() {
  return tex(
    'o-herringbone',
    1024,
    1024,
    (g, w) => {
      const W = SLAT_W;
      const L = 4 * W;
      const S = HERRING_TILE;
      const px = w / S;
      const tones = ['#b57d48', '#a8703e', '#c08a52', '#9a6436', '#b8844e', '#a26a3c', '#c49058', '#8f5c32'];
      g.fillStyle = '#2a1a10';
      g.fillRect(0, 0, w, w);
      // slat frame -> texture: rotate 45 degrees (u = (x + y) / sqrt2, v = (y - x) / sqrt2), v downward
      const k = px / Math.SQRT2;
      g.setTransform(k, -k, k, k, 0, 0);
      const slat = (ox: number, oy: number, horiz: boolean, id: number) => {
        const r = rand(id);
        const ww = horiz ? L : W;
        const hh = horiz ? W : L;
        const base = C(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.88 + r() * 0.24);
        const hex = '#' + base.getHexString();
        g.fillStyle = hex;
        g.fillRect(ox, oy, ww, hh);
        g.save();
        g.beginPath();
        g.rect(ox, oy, ww, hh);
        g.clip();
        // grain: long wavy lines along the slat, some darker late-wood streaks
        const lines = 14;
        for (let i = 0; i < lines; i++) {
          const t = (i + r()) / lines;
          const dark = r() < 0.4;
          g.strokeStyle = dark ? `rgba(60,32,14,${0.12 + r() * 0.16})` : `rgba(230,190,140,${0.05 + r() * 0.08})`;
          g.lineWidth = (dark ? 0.6 + r() * 1.6 : 0.5 + r()) / px;
          g.beginPath();
          const steps = 10;
          for (let s = 0; s <= steps; s++) {
            const a = s / steps;
            const wob = Math.sin(a * 6 + r() * 0.5 + i) * 0.04 * W + (r() - 0.5) * 0.01 * W;
            const x = horiz ? ox + a * ww : ox + (t + wob / W) * ww;
            const y = horiz ? oy + (t + wob / W) * hh : oy + a * hh;
            if (s === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        // an occasional small knot
        if (r() < 0.12) {
          const kx = ox + (0.2 + r() * 0.6) * ww;
          const ky = oy + (0.3 + r() * 0.4) * hh;
          const kr = W * (0.06 + r() * 0.06);
          const b = g.createRadialGradient(kx, ky, 0, kx, ky, kr * 2.4);
          b.addColorStop(0, 'rgba(50,24,10,0.85)');
          b.addColorStop(0.4, 'rgba(70,36,16,0.4)');
          b.addColorStop(1, 'rgba(70,36,16,0)');
          g.fillStyle = b;
          g.fillRect(kx - kr * 3, ky - kr * 3, kr * 6, kr * 6);
        }
        // the finish: a soft highlight along one long edge, shadow along the other
        const e = W * 0.12;
        g.fillStyle = 'rgba(255,230,190,0.10)';
        if (horiz) g.fillRect(ox, oy, ww, e);
        else g.fillRect(ox, oy, e, hh);
        g.fillStyle = 'rgba(30,14,6,0.16)';
        if (horiz) g.fillRect(ox, oy + hh - e, ww, e);
        else g.fillRect(ox + ww - e, oy, e, hh);
        g.restore();
        // hairline gap round the slat
        g.strokeStyle = 'rgba(26,14,8,0.85)';
        g.lineWidth = 1.6 / px;
        g.strokeRect(ox, oy, ww, hh);
      };
      // H(n, m) at (nW + mL, nW - mL); V(n, m) at (nW + mL + L, nW - mL - L + W); periods: n mod 16, m mod 4
      for (let m = -4; m <= 8; m++)
        for (let n = -22; n <= 40; n++) {
          const nn = ((n % 16) + 16) % 16;
          const mm = ((m % 4) + 4) % 4;
          const hx = n * W + m * L;
          const hy = n * W - m * L;
          // cull slats far outside the tile (u = (x + y) / sqrt2 in 0..S, v = (y - x) / sqrt2 in 0..S)
          const u = (hx + hy) / Math.SQRT2;
          const v = (hy - hx) / Math.SQRT2;
          if (u < -L * 1.5 || u > S + L * 1.5 || v < -L * 1.5 || v > S + L * 1.5) continue;
          slat(hx, hy, true, nn * 97 + mm * 13 + 1);
          slat(hx + L, hy - L + W, false, nn * 97 + mm * 13 + 7);
        }
      g.setTransform(1, 0, 0, 1, 0, 0);
    },
    { aniso: 16 },
  );
}

// ---------- cloth, velvet, leather ----------

/** A coarse woven upholstery (white-ish, tinted by vertex or instance colour): a basket weave with slubs. */
export function upholsteryTex() {
  return tex('o-upholstery', 256, 256, (g, w, h) => {
    const r = rand(55);
    g.fillStyle = '#e6e0d6';
    g.fillRect(0, 0, w, h);
    const s = 4;
    for (let y = 0; y < h; y += s)
      for (let x = 0; x < w; x += s) {
        const over = (Math.floor(x / (s * 2)) + Math.floor(y / (s * 2))) % 2 === 0;
        g.fillStyle = over ? `rgba(255,255,255,${0.1 + r() * 0.12})` : `rgba(0,0,0,${0.1 + r() * 0.1})`;
        g.fillRect(x, y, s, s);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        if (over) g.fillRect(x, y + s - 1, s, 1);
        else g.fillRect(x + s - 1, y, 1, s);
      }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.1)`;
      g.fillRect(r() * w, Math.floor(r() * (h / s)) * s, 8 + r() * 30, s);
    }
  });
}

/** Velvet pile, crushed in soft swirls (grey; used as a bump and to modulate the colour). */
export function velvetTex() {
  return pixels('o-velvet', 256, 256, (x, y, out, i) => {
    const u = x / 256;
    const v = y / 256;
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    const n = noise3(Math.cos(a) * 1.5, Math.sin(a) * 1.5 + Math.cos(b) * 1.5, Math.sin(b) * 1.5) * 0.7 + noise3(Math.cos(a) * 5, Math.sin(a) * 5 + Math.cos(b) * 5, Math.sin(b) * 5 + 3) * 0.3;
    const val = 200 + n * 90;
    out[i] = out[i + 1] = out[i + 2] = val;
    out[i + 3] = 255;
  });
}

/** Aged leather: fine crackle and creases, darker in the cracks (grey: colour it with the material). */
export function leatherTex() {
  return pixels('o-leather', 512, 512, (x, y, out, i) => {
    const u = x / 512;
    const v = y / 512;
    const cell = worleyT(u * 22, v * 22);
    const crack = smoothstep(0.05, 0.0, cell.edge);
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    const blot = noise3(Math.cos(a) * 2, Math.sin(a) * 2 + Math.cos(b) * 2, Math.sin(b) * 2) * 0.5 + 0.5;
    const val = 210 - crack * 70 + (cell.tone - 0.5) * 24 - blot * 30;
    out[i] = out[i + 1] = out[i + 2] = val;
    out[i + 3] = 255;
  });
}

/** Distance to the edge between Voronoi cells (tileable on a 22-cell grid) and a tone per cell. */
function worleyT(x: number, y: number) {
  const N = 22;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let tone = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = ((cx % N) + N) % N;
      const wy = ((cy % N) + N) % N;
      const h1 = hash2(wx, wy, 1);
      const h2 = hash2(wx, wy, 2);
      const px = cx + h1 - x;
      const py = cy + h2 - y;
      const d = Math.sqrt(px * px + py * py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        tone = hash2(wx, wy, 3);
      } else if (d < d2) d2 = d;
    }
  return { edge: (d2 - d1) * 0.5, tone };
}

function hash2(i: number, j: number, s: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Brushed, slightly worn black steel (powder coat): a roughness map with scuffs. */
export function steelRough() {
  return tex(
    'o-steel-rough',
    256,
    256,
    (g, w, h) => {
      const r = rand(12);
      g.fillStyle = 'rgb(150,150,150)';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const v = 110 + r() * 80;
        g.fillStyle = `rgba(${v},${v},${v},0.3)`;
        g.fillRect(r() * w, r() * h, 10 + r() * 60, 1);
      }
      for (let i = 0; i < 20; i++) {
        const x = r() * w;
        const y = r() * h;
        const rr = 8 + r() * 26;
        const b = g.createRadialGradient(x, y, 0, x, y, rr);
        b.addColorStop(0, 'rgba(90,90,90,0.5)');
        b.addColorStop(1, 'rgba(90,90,90,0)');
        g.fillStyle = b;
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    },
    { data: true },
  );
}

/** Mix a vertex colour toward a tone by a noise field (for large-scale wear). */
export function wear(out: THREE.Color, x: number, y: number, z: number, tone: THREE.Color, amount: number, freq = 1, seed = 0) {
  const n = noise3(x * freq + seed, y * freq, z * freq - seed);
  mix(out, out, tone, smoothstep(-0.1, 0.5, n) * amount);
}
