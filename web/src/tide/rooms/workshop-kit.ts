import * as THREE from 'three';
import { C, mix, noise3, once, rand, rgb, smoothstep, tex, woodTex, worley3 } from './ramen-kit';

// Shared pieces for the toy workshop. The generic helpers (seeded randomness,
// build-once caches, the merger, UV and paint helpers, wood grain) come from
// the kitchen's kit; this adds the workshop's own reflections, its material
// cache and its textures: honey floorboards with sawdust, sage-painted boards,
// warm limewash, old brick, a painted pegboard and the toys' pale beech.

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
  moulding,
  noise3,
  once,
  paint,
  paintFlat,
  paintLathe,
  pick,
  pixels,
  plank,
  puffTex,
  rand,
  repeated,
  rgb,
  rimAlong,
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
 * The workshop's own reflections: a small painted panorama of a warm wooden
 * room at night (dark beams above, honey walls with lamp glows, the stove's
 * orange glow low on one side, two cool windows, a dark floor). Every lit
 * material made with wmat() carries it: in three r186 envMapIntensity only
 * applies to a material with its own envMap, and the app sets 0.3 on the
 * room's materials.
 */
export function workshopEnv() {
  return once('ws-env', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2e1f14');
    grad.addColorStop(0.3, '#5e4128');
    grad.addColorStop(0.5, '#a67848');
    grad.addColorStop(0.64, '#5e3f26');
    grad.addColorStop(1, '#22140a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    const blob = (x: number, y: number, r: number, col: string) => {
      const b = g.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, col);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = b;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const x of [70, 150, 230, 330, 410]) blob(x, 88, 26, 'rgba(255,212,150,1)');
    blob(256, 110, 100, 'rgba(255,196,128,0.45)');
    // the stove, low and orange; the windows, cool
    blob(470, 150, 46, 'rgba(255,128,50,0.75)');
    blob(20, 104, 36, 'rgba(120,150,210,0.45)');
    blob(500, 96, 30, 'rgba(120,150,210,0.4)');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

/** How much of its environment a room material catches (the app sets the same on the room's materials). */
export const ROOM_ENV = 0.3;

/** A material made once per key; lit materials get the workshop's own environment. */
export const wmat = <T extends THREE.Material>(key: string, make: () => T): T =>
  once('ws-mat:' + key, () => {
    const m = make();
    const std = m as unknown as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial && !std.envMap) {
      std.envMap = workshopEnv();
      std.envMapIntensity = ROOM_ENV;
    }
    return m;
  });

/** Multiply a geometry's existing vertex colours (white if it has none) by fn's factor. */
export function shadeBy(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number) {
  const p = g.attributes.position;
  let c = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!c) {
    c = new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3);
    g.setAttribute('color', c);
  }
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
  return g;
}

/** Noise sampled on a torus, so a texture made from it tiles in both directions. */
export function tnoise(u: number, v: number, f: number, z = 0) {
  const a = u * Math.PI * 2;
  const b = v * Math.PI * 2;
  return noise3(Math.cos(a) * f + Math.cos(b) * 0.37 * f, Math.sin(a) * f + z, Math.sin(b) * f + Math.cos(b) * 0.21);
}

/** Paint the image of an existing texture's canvas into g (to build on a grain). */
function under(g: CanvasRenderingContext2D, t: THREE.Texture, w: number, h: number) {
  g.drawImage(t.image as CanvasImageSource, 0, 0, w, h);
}

// ---------- wood ----------

/** Wide honey-pine floorboards: six boards along v, joints, nail pairs, a few old paint drips. */
export function floorTex() {
  return tex('ws-floor', 1024, 1024, (g, w, h) => {
    under(g, woodTex('ws-floor-grain', { w: 1024, h: 1024, light: '#c39058', dark: '#5e3a1c', planks: 6, rings: 6, seed: 12, seams: 1.5, figure: 0.55, warp: 0.8 }), w, h);
    const r = rand(5);
    const ph = h / 6;
    // nail pairs either side of each board's joint, and along the board where it crosses a joist
    for (let p = 0; p < 6; p++) {
      const ys = [p * ph + ph * 0.24, p * ph + ph * 0.76];
      for (const u of [r(), r(), r()]) {
        for (const y of ys) {
          const x = u * w;
          g.fillStyle = 'rgba(20,12,6,0.75)';
          g.beginPath();
          g.arc(x, y, 3.2, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,230,190,0.18)';
          g.beginPath();
          g.arc(x - 0.8, y - 0.8, 1.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // a few drips and dabs of old paint, trodden flat
    const paints = ['178,40,32', '40,80,150', '220,170,40', '60,120,70', '240,236,220'];
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = r() * h;
      const col = paints[Math.floor(r() * paints.length)];
      const rad = 2 + r() * 6;
      g.fillStyle = `rgba(${col},${0.35 + r() * 0.3})`;
      g.beginPath();
      g.ellipse(x, y, rad, rad * (0.6 + r() * 0.5), r() * 3, 0, Math.PI * 2);
      g.fill();
      if (r() < 0.4)
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, 0.8 + r() * 1.8, 0, Math.PI * 2);
          g.fill();
        }
    }
    // dull scuffs
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${r() < 0.6 ? '30,18,8' : '240,210,170'},${0.05 + r() * 0.06})`;
      g.lineWidth = 1 + r() * 2;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 20 + r() * 60, y + (r() - 0.5) * 6);
      g.stroke();
    }
  });
}

/** Rough-sawn dark oak for posts and beams: deep grain, checks (splits) along the grain. */
export function beamTex() {
  return tex('ws-beam', 1024, 256, (g, w, h) => {
    under(g, woodTex('ws-beam-grain', { w: 1024, h: 256, light: '#6e4a2c', dark: '#1c0f06', planks: 1, rings: 10, seed: 44, joints: false, seams: 0, figure: 0.4, warp: 1.2 }), w, h);
    const r = rand(9);
    // drying checks: thin dark splits running along the grain
    for (let i = 0; i < 14; i++) {
      let x = r() * w;
      let y = 20 + r() * (h - 40);
      const len = 80 + r() * 300;
      g.strokeStyle = `rgba(8,4,2,${0.45 + r() * 0.3})`;
      g.lineWidth = 0.8 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < len; s += 12) {
        x += 12;
        y += (r() - 0.5) * 2.2;
        g.lineTo(x % w, y);
      }
      g.stroke();
    }
    // adze marks: faint broad scallops across the face
    for (let x = 0; x < w; x += 22 + r() * 18) {
      const b = g.createLinearGradient(x, 0, x + 18, 0);
      b.addColorStop(0, 'rgba(255,220,180,0)');
      b.addColorStop(0.5, 'rgba(255,220,180,0.05)');
      b.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = b;
      g.fillRect(x, 0, 18, h);
    }
  });
}

/** Laminated maple strips for the bench tops: pale, with glue lines between strips. */
export function mapleTex() {
  return woodTex('ws-maple', { w: 1024, h: 512, light: '#e8d2aa', dark: '#ae8a5c', planks: 9, rings: 4, seed: 63, joints: true, seams: 0.9, figure: 0.25, warp: 0.6 });
}

/** Fine pale beech, nearly white, for the toys: their paint and natural wood both take its grain. */
export function toyGrainTex() {
  return tex('ws-toy-grain', 512, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const warp = tnoise(u, v, 1.5) * 0.6;
        const ring = Math.sin((v * 22 + warp * 3) * Math.PI);
        const fine = tnoise(u, v, 40, 3) * 0.5 + 0.5;
        const k = 1 - 0.07 * smoothstep(0.5, 1, ring) - 0.035 * (1 - fine);
        const o4 = (y * w + x) * 4;
        d[o4] = 255 * Math.min(1, k * 1.0);
        d[o4 + 1] = 255 * Math.min(1, k * 0.975);
        d[o4 + 2] = 255 * Math.min(1, k * 0.95);
        d[o4 + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  });
}

// ---------- painted boards and plaster ----------

/**
 * Tongue-and-groove boards painted a worn colour: brush strokes along the
 * boards, the paint chipped away to the wood at the edges and in blotches,
 * grooves between boards. Like woodTex, the grain runs along u and the 8
 * boards are stacked along v: map u up the wall to stand them upright.
 */
export function paintedBoardsTex(key: string, paintHex: string, seed: number, grooves = true, wear = 1) {
  return tex('ws-painted:' + key, 1024, 1024, (g, w, h) => {
    under(g, woodTex('ws-painted-grain:' + key, { w: 1024, h: 1024, light: '#a87c50', dark: '#4a2c16', planks: 8, rings: 7, seed, seams: 1.4, figure: 0.4 }), w, h);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const P = rgb(paintHex);
    const bh = h / 8;
    for (let y = 0; y < h; y++) {
      const inB = (y % bh) / bh;
      const edge = Math.min(inB, 1 - inB);
      // the groove between boards
      const groove = !grooves ? 1 : edge < 0.014 ? 0.42 : edge < 0.03 ? 0.8 : 1;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        // where the paint has worn through: board edges, and blotches
        const worn = tnoise(u, v, 9, seed) * 0.6 + tnoise(u, v, 30, seed + 2) * 0.4;
        const chip = smoothstep(0.36, 0.48, worn * wear + (grooves ? smoothstep(0.07, 0.0, edge) * 0.45 : 0));
        // brush strokes along the board
        const brush = 0.95 + 0.05 * Math.sin((v * 110 + tnoise(u, v, 4, 5) * 6) * Math.PI);
        const k = (1 - chip) * brush;
        const o4 = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) d[o4 + c] = (d[o4 + c] * chip + P[c] * k * (0.92 + 0.1 * tnoise(u, v, 3, c + seed))) * groove;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/**
 * Warm limewash over old plaster: honey-cream, cloudy, with trowel sweeps,
 * hairline cracks and specks. One tile covers 4 x 4 units of wall.
 */
export function limeTex() {
  return tex('ws-lime', 1024, 1024, (g, w, h) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    const base = C('#d6bf96');
    const warm = C('#c09c6c');
    const pale = C('#e6d6b6');
    const tmp = new THREE.Color();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const big = tnoise(u, v, 2.4) * 0.6 + tnoise(u, v, 6, 3) * 0.3;
        const fine = tnoise(u, v, 26, 7) * 0.5 + tnoise(u, v, 64, 11) * 0.25;
        const sweep = Math.sin((u * 2 + v * 3 + big * 0.7) * Math.PI * 5) * 0.5 + 0.5;
        mix(tmp, base, warm, smoothstep(-0.3, 0.7, big) * 0.42);
        mix(tmp, tmp, pale, smoothstep(0.65, 1, sweep) * 0.1 + smoothstep(0.2, 0.6, fine) * 0.12);
        tmp.multiplyScalar(0.93 + fine * 0.07);
        const o4 = (y * w + x) * 4;
        d[o4] = Math.pow(tmp.r, 1 / 2.2) * 255;
        d[o4 + 1] = Math.pow(tmp.g, 1 / 2.2) * 255;
        d[o4 + 2] = Math.pow(tmp.b, 1 / 2.2) * 255;
        d[o4 + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const r = rand(77);
    g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      let x = r() * w;
      let y = r() * h;
      let a = r() * Math.PI * 2;
      g.strokeStyle = `rgba(96,72,46,${0.2 + r() * 0.16})`;
      g.lineWidth = 0.8 + r() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      const n = 8 + Math.floor(r() * 12);
      for (let k = 0; k < n; k++) {
        a += (r() - 0.5) * 1.1;
        x += Math.cos(a) * (6 + r() * 10);
        y += Math.sin(a) * (6 + r() * 10);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.7 ? `rgba(110,84,56,${0.1 + r() * 0.18})` : `rgba(255,248,230,${0.2 + r() * 0.2})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  });
}

/** A bump map for the limewash. */
export function limeBump() {
  return tex(
    'ws-lime-bump',
    512,
    512,
    (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const n = tnoise(u, v, 6) * 0.45 + tnoise(u, v, 22, 5) * 0.35 + tnoise(u, v, 70, 9) * 0.2;
          const pit = smoothstep(0.12, 0.04, worley3(u * 40, v * 40, 1.7)) * 0.5;
          const val = 128 + n * 110 - pit * 60;
          const o4 = (y * w + x) * 4;
          img.data[o4] = img.data[o4 + 1] = img.data[o4 + 2] = val;
          img.data[o4 + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    { data: true },
  );
}

/** Old soft red brick in a running bond, sooty and uneven, with sandy mortar. 6 courses x 3 bricks per tile. */
export function brickTex() {
  return tex('ws-brick', 1024, 1024, (g, w, h) => {
    const r = rand(23);
    g.fillStyle = '#8c7a62';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(60,48,36,0.3)' : 'rgba(200,184,150,0.25)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    const rows = 12;
    const cols = 4;
    const bh = h / rows;
    const bw = w / cols;
    const gap = 10;
    const tones = ['#9a4a32', '#8a3e2a', '#a45838', '#7a3626', '#9c5236', '#86422e', '#b0603e'];
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? bw / 2 : 0;
      for (let i = -1; i <= cols; i++) {
        const x = i * bw + off + gap / 2;
        const y = j * bh + gap / 2;
        const c = C(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.8 + r() * 0.35);
        g.fillStyle = '#' + c.getHexString();
        g.beginPath();
        g.roundRect(x, y, bw - gap, bh - gap, 6);
        g.fill();
        // the brick's face: mottled, a darker fired end, pits
        for (let k = 0; k < 40; k++) {
          const px = x + r() * (bw - gap);
          const py = y + r() * (bh - gap);
          const rad = 3 + r() * 16;
          const b = g.createRadialGradient(px, py, 0, px, py, rad);
          const tone = r() < 0.6 ? '30,10,4' : '230,150,110';
          b.addColorStop(0, `rgba(${tone},${0.06 + r() * 0.1})`);
          b.addColorStop(1, `rgba(${tone},0)`);
          g.fillStyle = b;
          g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        }
        if (r() < 0.4) {
          const b = g.createLinearGradient(x, 0, x + bw * 0.4, 0);
          b.addColorStop(0, 'rgba(30,12,6,0.35)');
          b.addColorStop(1, 'rgba(30,12,6,0)');
          g.fillStyle = b;
          g.fillRect(x, y, bw * 0.4, bh - gap);
        }
        for (let k = 0; k < 30; k++) {
          g.fillStyle = 'rgba(30,14,8,0.45)';
          g.fillRect(x + r() * (bw - gap), y + r() * (bh - gap), 1 + r() * 2, 1 + r() * 2);
        }
        // a lighter top edge
        g.fillStyle = 'rgba(255,220,190,0.12)';
        g.fillRect(x + 4, y + 2, bw - gap - 8, 3);
      }
    }
  });
}

// ---------- the pegboard ----------

export type Outline = (g: CanvasRenderingContext2D) => void;

/**
 * A painted pegboard panel `w` x `h` units: hardboard painted pale blue-green,
 * a grid of holes every `step`, a darker painted silhouette behind each tool
 * (a shadow board, so you can see where things go back), worn paint, a few
 * pencil marks. `outlines` draw in the panel's own units (x right, y up, origin
 * at the bottom left).
 */
export function pegboardTex(key: string, w: number, h: number, step: number, outlines: Outline[], seed: number) {
  const pxPer = 1024 / w;
  const H = Math.round(h * pxPer);
  return tex(
    'ws-peg:' + key,
    1024,
    H,
    (g, W) => {
      const img = g.createImageData(W, H);
      const d = img.data;
      const base = rgb('#9fb3a6');
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const u = x / W;
          const v = y / H;
          const n = noise3(u * 9 + seed, v * 9 * (h / w), 3.1) * 0.5 + noise3(u * 60, v * 60 * (h / w), seed) * 0.25;
          const k = 0.94 + n * 0.08;
          const o4 = (y * W + x) * 4;
          d[o4] = base[0] * k;
          d[o4 + 1] = base[1] * k;
          d[o4 + 2] = base[2] * k;
          d[o4 + 3] = 255;
        }
      g.putImageData(img, 0, 0);
      g.save();
      // panel units: x right, y up from the bottom left
      g.translate(0, H);
      g.scale(pxPer, -pxPer);
      g.fillStyle = 'rgba(52,74,70,0.55)';
      g.strokeStyle = 'rgba(40,58,54,0.7)';
      g.lineWidth = 0.012;
      for (const o of outlines) o(g);
      g.restore();
      // the holes, each with a dark core and a lit lower lip
      const s = step * pxPer;
      const rad = s * 0.17;
      for (let y = s / 2; y < H; y += s)
        for (let x = s / 2; x < W; x += s) {
          g.fillStyle = 'rgba(16,14,12,0.92)';
          g.beginPath();
          g.arc(x, y, rad, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.22)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(x, y, rad + 0.8, 0.2, Math.PI - 0.2);
          g.stroke();
        }
      // grime where hands reach, a few pencil ticks
      const r = rand(seed);
      for (let i = 0; i < 18; i++) {
        const x = r() * W;
        const y = H * (0.3 + r() * 0.6);
        const rr = 20 + r() * 60;
        const b = g.createRadialGradient(x, y, 0, x, y, rr);
        b.addColorStop(0, 'rgba(60,50,40,0.1)');
        b.addColorStop(1, 'rgba(60,50,40,0)');
        g.fillStyle = b;
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      g.strokeStyle = 'rgba(50,46,44,0.55)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const x = r() * W;
        const y = r() * H;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() < 0.5 ? 14 : 0), y + (r() < 0.5 ? 0 : 14));
        g.stroke();
      }
      // a painted frame line round the edge
      g.strokeStyle = 'rgba(40,54,50,0.5)';
      g.lineWidth = 6;
      g.strokeRect(10, 10, W - 20, H - 20);
    },
    { repeat: false },
  );
}

// ---------- cloth and paper ----------

/** A knitted fabric (rows of V stitches), white-ish so vertex colours or a material colour tint it. */
export function knitTex() {
  return tex('ws-knit', 256, 256, (g, w, h) => {
    g.fillStyle = '#cfc8bc';
    g.fillRect(0, 0, w, h);
    const sx = 16;
    const sy = 12;
    for (let y = 0; y < h; y += sy)
      for (let x = 0; x < w; x += sx) {
        for (const s of [-1, 1]) {
          const grad = g.createLinearGradient(x + sx / 2, y, x + sx / 2 + s * sx * 0.4, y + sy);
          grad.addColorStop(0, '#f6f2ea');
          grad.addColorStop(1, '#bdb4a6');
          g.fillStyle = grad;
          g.beginPath();
          g.ellipse(x + sx / 2 + s * sx * 0.22, y + sy * 0.55, sx * 0.24, sy * 0.62, s * 0.55, 0, Math.PI * 2);
          g.fill();
        }
      }
  });
}

/** Aged cream drawing paper with fibres and foxing. */
export function paperGround(g: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string, seed: number) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const r = rand(seed);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '120,96,60' : '255,250,235'},${0.04 + r() * 0.06})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 3 + r() * 12;
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, 'rgba(150,104,50,0.12)');
    b.addColorStop(1, 'rgba(150,104,50,0)');
    g.fillStyle = b;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // a darker, slightly yellowed edge
  const e = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  e.addColorStop(0, 'rgba(120,90,40,0)');
  e.addColorStop(1, 'rgba(120,90,40,0.22)');
  g.fillStyle = e;
  g.fillRect(0, 0, w, h);
}

/** Sawdust: fine pale specks and soft drifts, white-ish on transparent (a decal). */
export function sawdustTex() {
  return tex(
    'ws-sawdust',
    512,
    512,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = rand(31);
      // soft drifts, then the grains themselves
      for (let i = 0; i < 26; i++) {
        const x = w * (0.2 + r() * 0.6);
        const y = h * (0.2 + r() * 0.6);
        const rad = 30 + r() * 90;
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, 'rgba(255,236,196,0.22)');
        b.addColorStop(1, 'rgba(255,236,196,0)');
        g.fillStyle = b;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 9000; i++) {
        const a = r() * Math.PI * 2;
        const rr = Math.pow(r(), 0.7) * w * 0.48;
        const x = w / 2 + Math.cos(a) * rr * (0.8 + r() * 0.3);
        const y = h / 2 + Math.sin(a) * rr * (0.8 + r() * 0.3);
        const fade = 1 - rr / (w * 0.5);
        g.fillStyle = `rgba(${235 + r() * 20},${205 + r() * 30},${150 + r() * 40},${(0.25 + r() * 0.5) * fade})`;
        g.fillRect(x, y, 1 + r() * 2.2, 1 + r() * 1.6);
      }
    },
    { repeat: false },
  );
}

