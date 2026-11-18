import { beginBuild, cacheCheck, checkGeometry, checkPicture, endBuild, keepPicture, takeGeometry, takePicture } from '../../lib/assetCache';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { smoothLathe } from '../../tank/kitchenware';
import { C, fbm3, mix, noise3, smoothstep, worley3 } from '../../tank/util';

// Shared pieces for the ramen kitchen: seeded randomness, things built once
// and cached by key (textures, materials, geometries), a merger that bakes many
// small parts into one mesh, UV helpers and the generated textures (wood,
// plaster, glazed tiles, quarry tiles, brushed steel, cloth).

export { C, fbm3, mix, noise3, smoothLathe, smoothstep, worley3 };

/** A seeded random stream in [0, 1). Neighbouring seeds give unrelated streams. */
export function rand(seed: number) {
  let h = (seed | 0) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];
export const variant = (seed: number, n: number) => ((Math.floor(seed) % n) + n) % n;

// ---------- caches ----------

const cache = new Map<string, unknown>();

/** Build something once per key and share it (geometries, materials, textures). */
export function once<T>(key: string, build: () => T): T {
  let v = cache.get(key) as T | undefined;
  if (v === undefined) {
    const t0 = performance.now();
    // geometry saved by an earlier visit (lib/assetCache), else built and saved for the next
    const saved = takeGeometry<T>(key);
    if (saved !== undefined) {
      v = saved;
      if (cacheCheck.on) checkGeometry(key, saved, build());
    } else {
      beginBuild();
      try {
        v = build();
      } finally {
        endBuild(key, v);
      }
    }
    cache.set(key, v as T);
    // the build cost shows in the browser's performance timeline as "kit:<key>"
    const t1 = performance.now();
    if (t1 - t0 > 1) performance.measure(`kit:${key}`, { start: t0, end: t1 });
  }
  return v;
}

/**
 * The kitchen's own reflections: a small painted panorama of a dim, warm room
 * (dark beams above, amber walls with a few lamp glows, a cool window, a dark
 * floor). three.js turns it into a PMREM on first use. Every lit material made
 * with mat() carries it, so its envMapIntensity is what counts: with only the
 * scene's studio environment, three r186 applies scene.environmentIntensity to
 * every material that has no envMap of its own, and the room would be lit flat.
 */
export function ramenEnv() {
  return once('ramen-env', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3a2818');
    grad.addColorStop(0.32, '#6a4a2c');
    grad.addColorStop(0.5, '#a8784a');
    grad.addColorStop(0.62, '#6a4a30');
    grad.addColorStop(1, '#24160e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    // warm lamp glows round the horizon, a cool window on one side
    const blob = (x: number, y: number, r: number, col: string) => {
      const b = g.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, col);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = b;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const x of [40, 110, 180, 300, 370, 440]) blob(x, 92, 30, 'rgba(255,214,150,1)');
    blob(256, 104, 90, 'rgba(255,200,130,0.5)');
    blob(470, 120, 40, 'rgba(120,150,210,0.45)');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

/** How much of its environment a room material catches (the app sets the same on the room's materials). */
export const ROOM_ENV = 0.3;

/** A material made once per key; lit materials get the kitchen's own environment. */
export const mat = <T extends THREE.Material>(key: string, make: () => T): T =>
  once('ramen-mat:' + key, () => {
    const m = make();
    const std = m as unknown as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial && !std.envMap) {
      std.envMap = ramenEnv();
      std.envMapIntensity = ROOM_ENV;
    }
    return m;
  });

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** A canvas texture drawn once per key. `data` textures (bump, roughness) skip the sRGB conversion. */
export function tex(key: string, w: number, h: number, draw: Draw, o: { data?: boolean; repeat?: boolean; aniso?: number } = {}) {
  return once('ramen-tex:' + key, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    // painted on an earlier visit (lib/assetCache), else painted now and kept for the next
    if (!takePicture(key, c)) {
      draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
      keepPicture(key, c);
    } else if (cacheCheck.on) {
      const fresh = document.createElement('canvas');
      fresh.width = w;
      fresh.height = h;
      draw(fresh.getContext('2d') as CanvasRenderingContext2D, w, h);
      checkPicture(key, c, fresh);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = o.aniso ?? 8;
    if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** A texture computed per pixel: fn writes 0..255 values into out at i. */
export function pixels(key: string, w: number, h: number, fn: (x: number, y: number, out: Uint8ClampedArray, i: number) => void, o: { data?: boolean; repeat?: boolean } = {}) {
  return tex(
    key,
    w,
    h,
    (g) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(x, y, img.data, (y * w + x) * 4);
      g.putImageData(img, 0, 0);
    },
    o,
  );
}

/** A clone of a shared texture with its own repeat (the image is shared). */
export function repeated(t: THREE.Texture, rx: number, ry: number, key: string) {
  return once('ramen-rep:' + key, () => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  });
}

// ---------- colour ----------

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const css = (c: [number, number, number], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** A colour hex string scaled by k (for canvas fills). */
export function shade(hex: string, k: number, a = 1) {
  const c = rgb(hex);
  return css([Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)], a);
}

// ---------- merging ----------

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

/** Collects transformed copies of small geometries into one mesh (one draw call). */
export class Merger {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  add(g: THREE.BufferGeometry, m?: THREE.Matrix4, tint?: THREE.Color | string) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    const t = g.attributes.uv;
    const base = this.pos.length / 3;
    if (m) _nm.getNormalMatrix(m);
    const tc = tint === undefined ? null : typeof tint === 'string' ? C(tint) : tint;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (m) _v.applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) {
        _n.fromBufferAttribute(n, i);
        if (m) _n.applyMatrix3(_nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      } else this.nor.push(0, 1, 0);
      if (c) _c.fromBufferAttribute(c, i);
      else _c.setRGB(1, 1, 1);
      if (tc) _c.multiply(tc);
      this.col.push(_c.r, _c.g, _c.b);
      if (t) this.uv.push(t.getX(i), t.getY(i));
      else this.uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  get empty() {
    return this.pos.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** A matrix from a position, an euler rotation and a scale. */
export function trs(p: [number, number, number] | THREE.Vector3, r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1, order: THREE.EulerOrder = 'XYZ') {
  const pos = Array.isArray(p) ? new THREE.Vector3(...p) : p;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order));
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(pos, q, sc);
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------- geometry helpers ----------

/** Box-projected UVs from positions: the grain runs along x on tops and fronts, along z on sides. */
export function boxUV(g: THREE.BufferGeometry, s: number | [number, number] = 1, offset: [number, number] = [0, 0]) {
  const [su, sv] = typeof s === 'number' ? [s, s] : s;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (az >= ax) {
      u = x;
      v = y;
    } else {
      u = z;
      v = y;
    }
    uv[i * 2] = u * su + offset[0];
    uv[i * 2 + 1] = v * sv + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Same as boxUV but the grain runs vertically on fronts and sides (for upright boards). */
export function boxUVUpright(g: THREE.BufferGeometry, s: number | [number, number] = 1, offset: [number, number] = [0, 0]) {
  const [su, sv] = typeof s === 'number' ? [s, s] : s;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = z;
      v = x;
    } else if (az >= ax) {
      u = y;
      v = x;
    } else {
      u = y;
      v = z;
    }
    uv[i * 2] = u * su + offset[0];
    uv[i * 2 + 1] = v * sv + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A rounded box with world-sized UVs. */
export function plank(w: number, h: number, d: number, r = 0.03, uvScale: number | [number, number] = 1, seg = 2, uvOffset: [number, number] = [0, 0], upright = false) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(0.0005, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
  return upright ? boxUVUpright(g, uvScale, uvOffset) : boxUV(g, uvScale, uvOffset);
}

/** UVs from a function of position. */
export function mapUV(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number]) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const [u, v] = fn(p.getX(i), p.getY(i), p.getZ(i));
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Paint every vertex by position (and index). */
export function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color, i: number) => void) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.setRGB(1, 1, 1);
    fn(p.getX(i), p.getY(i), p.getZ(i), tmp, i);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export const paintFlat = (g: THREE.BufferGeometry, hex: string | THREE.Color) => {
  const c = typeof hex === 'string' ? C(hex) : hex;
  return paint(g, (_x, _y, _z, out) => out.copy(c));
};

/** Paint a lathe made by smoothLathe(pts, n): fn also gets how far along the profile the vertex is (0..1). */
export function paintLathe(g: THREE.BufferGeometry, n: number, fn: (x: number, y: number, z: number, along: number, out: THREE.Color) => void) {
  return paint(g, (x, y, z, out, i) => fn(x, y, z, (i % (n + 1)) / n, out));
}

/** Where the rim is along a smoothLathe(pts, n) profile: the highest point (outside < rim < inside). */
export function rimAlong(pts: [number, number][], n: number) {
  const prof = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n);
  let best = 0;
  for (let i = 1; i < prof.length; i++) if (prof[i].y > prof[best].y) best = i;
  return best / n;
}

/** A rounded rectangle path centred on (cx, cy). */
export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** A flat bevelled slab from a shape, `depth` thick along +z, centred on z = 0. */
export function slab(shape: THREE.Shape, depth: number, bevel: number, seg = 3, curve = 24) {
  const b = Math.min(bevel, depth / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - b * 2), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: seg, curveSegments: curve });
  g.translate(0, 0, -(depth - b * 2) / 2);
  return g;
}

/** A profile (in the yz plane: [z, y] pairs, z out of the wall) run along x from x0 to x1. */
export function moulding(profile: [number, number][], x0: number, x1: number, curve = 8) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, curveSegments: curve });
  g.rotateY(-Math.PI / 2).translate(x1, 0, 0);
  return g;
}

/** A plane subdivided so vertex colours can carry large-scale grime. */
export function gridPlane(w: number, h: number, sx: number, sy: number) {
  return new THREE.PlaneGeometry(w, h, sx, sy);
}

// ---------- textures ----------

function grid(a: Float32Array, gw: number, gh: number, u: number, v: number) {
  const x = u * gw;
  const y = v * gh;
  const i = Math.min(gw - 1, Math.floor(x));
  const j = Math.min(gh - 1, Math.floor(y));
  const fx = x - i;
  const fy = y - j;
  const w = gw + 1;
  const a0 = a[j * w + i] + (a[j * w + i + 1] - a[j * w + i]) * fx;
  const a1 = a[(j + 1) * w + i] + (a[(j + 1) * w + i + 1] - a[(j + 1) * w + i]) * fx;
  return a0 + (a1 - a0) * fy;
}

export type WoodOpts = { w?: number; h?: number; light: string; dark: string; planks?: number; rings?: number; seed?: number; joints?: boolean; seams?: number; pores?: number; figure?: number; warp?: number };

/**
 * Wood grain running along u (canvas x), in `planks` boards stacked along v,
 * each with its own tone and figure, darker seams and (optionally) end joints.
 * Tiles in both directions.
 */
export function woodTex(key: string, o: WoodOpts) {
  const { w = 1024, h = 512, planks = 4, rings = 6, seed = 1, joints = true, seams = 0.5, pores = 1, figure = 1, warp: warpK = 1 } = o;
  return tex('wood:' + key, w, h, (g) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    const L = rgb(o.light);
    const D = rgb(o.dark);
    const r = rand(seed);
    const ph = h / planks;
    const tint = Array.from({ length: planks }, () => 0.84 + r() * 0.3);
    const shift = Array.from({ length: planks }, () => r() * 10);
    const centre = Array.from({ length: planks }, () => r());
    const joint = Array.from({ length: planks }, () => r());
    const GW = 128;
    const GH = 128;
    const warp = new Float32Array((GW + 1) * (GH + 1));
    const streak = new Float32Array((GW + 1) * (GH + 1));
    for (let j = 0; j <= GH; j++)
      for (let i = 0; i <= GW; i++) {
        const a = (i / GW) * Math.PI * 2;
        const v = (j / GH) * planks;
        warp[j * (GW + 1) + i] = noise3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, v * 1.7 + seed) * 1.4 + noise3(Math.cos(a) * 5, Math.sin(a) * 5, v * 5 + seed * 2) * 0.35;
        streak[j * (GW + 1) + i] = noise3(Math.cos(a) * 0.9 + 7, Math.sin(a) * 0.9, v * 9 + seed * 5) * 0.7 + noise3(Math.cos(a) * 2.5, Math.sin(a) * 2.5 + 3, v * 26 + seed) * 0.3;
      }
    const ringHash = (n: number) => {
      const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const fibre = new Float32Array(h);
    let f = 0;
    for (let y = 0; y < h; y++) {
      f = f * 0.7 + (r() - 0.5) * 0.6;
      fibre[y] = f;
    }
    for (let y = 0; y < h; y++) {
      const pl = Math.min(planks - 1, Math.floor(y / ph));
      const vp = (y - pl * ph) / ph;
      const seam = Math.min(vp, 1 - vp) * ph;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const wv = grid(warp, GW, GH, u, y / h);
        const du = Math.abs(u - centre[pl]);
        const arch = Math.min(du, 1 - du);
        const heart = Math.exp(-((vp - 0.5) * (vp - 0.5)) / 0.05);
        const ringPos = (vp - 0.5) * rings + wv * 0.5 * warpK + shift[pl] + heart * arch * arch * 9 * figure;
        const ri = Math.floor(ringPos);
        const fr = ringPos - ri;
        const strength = 0.25 + 0.75 * ringHash(ri + pl * 97);
        const late = fr > 0.74 ? Math.pow(Math.sin(((fr - 0.74) / 0.26) * Math.PI), 1.5) : 0;
        const st = grid(streak, GW, GH, u, y / h);
        let k = 0.3 + late * 0.3 * strength + fr * 0.06 + st * 0.22 + fibre[y] * 0.05 + wv * 0.03;
        if (seam < 1.6 && seams > 0) k += (1.6 - seam) * 0.32 * seams;
        if (joints && Math.abs(u - joint[pl]) * w < 1.2) k += 0.45;
        k = Math.max(0, Math.min(1, k));
        const t = tint[pl];
        const o4 = (y * w + x) * 4;
        d[o4] = (L[0] + (D[0] - L[0]) * k) * t;
        d[o4 + 1] = (L[1] + (D[1] - L[1]) * k) * t;
        d[o4 + 2] = (L[2] + (D[2] - L[2]) * k) * t;
        d[o4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = css(D, 0.22);
    const n = Math.floor((w * h) / 90) * pores;
    for (let i = 0; i < n; i++) g.fillRect(r() * w, r() * h, 2 + r() * 7, 1);
  });
}

/** Grey bump noise (paint, plaster, paper, cloth). Tiles in both directions. */
export function bumpTex(key: string, o: { size?: number; contrast?: number; scale?: number } = {}) {
  const size = o.size ?? 256;
  return tex(
    'bump:' + key,
    size,
    size,
    (g, w, h) => {
      const img = g.createImageData(w, h);
      const d = img.data;
      const sc = (o.scale ?? 1) * 8;
      const c = o.contrast ?? 1;
      const n2 = (u: number, v: number) => noise3(u * sc, v * sc, 0.5) * 0.6 + noise3(u * sc * 4, v * sc * 4, 3.5) * 0.4;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const n = n2(u, v) * (1 - u) * (1 - v) + n2(u - 1, v) * u * (1 - v) + n2(u, v - 1) * (1 - u) * v + n2(u - 1, v - 1) * u * v;
          const val = 128 + n * 230 * c;
          const o4 = (y * w + x) * 4;
          d[o4] = d[o4 + 1] = d[o4 + 2] = val;
          d[o4 + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    { data: true },
  );
}

/** Noise sampled on a torus, so a texture made from it tiles in both directions. */
function tnoise(u: number, v: number, f: number, z = 0) {
  const a = u * Math.PI * 2;
  const b = v * Math.PI * 2;
  return noise3(Math.cos(a) * f + Math.cos(b) * 0.37 * f, Math.sin(a) * f + z, Math.sin(b) * f + Math.cos(b) * 0.21);
}

/**
 * Old lime plaster: warm cream, trowel-mottled, with hairline cracks, a few
 * patched spots and fly-specks. One tile covers 4 x 4 units of wall.
 */
export function plasterTex() {
  return tex('plaster', 1024, 1024, (g, w, h) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    const base = C('#c9b28a');
    const warm = C('#b89a70');
    const pale = C('#d8c6a4');
    const tmp = new THREE.Color();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const big = tnoise(u, v, 2.2) * 0.6 + tnoise(u, v, 5.5, 3) * 0.3;
        const fine = tnoise(u, v, 24, 7) * 0.5 + tnoise(u, v, 60, 11) * 0.25;
        // trowel sweeps: long low ridges
        const sweep = Math.sin((u * 3 + v * 2 + big * 0.6) * Math.PI * 4) * 0.5 + 0.5;
        mix(tmp, base, warm, smoothstep(-0.3, 0.7, big) * 0.38);
        mix(tmp, tmp, pale, smoothstep(0.6, 1, sweep) * 0.08 + smoothstep(0.2, 0.6, fine) * 0.1);
        tmp.multiplyScalar(0.94 + fine * 0.06);
        const o4 = (y * w + x) * 4;
        d[o4] = Math.pow(tmp.r, 1 / 2.2) * 255;
        d[o4 + 1] = Math.pow(tmp.g, 1 / 2.2) * 255;
        d[o4 + 2] = Math.pow(tmp.b, 1 / 2.2) * 255;
        d[o4 + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const r = rand(31);
    // patched spots: slightly different tone with a soft edge
    for (let i = 0; i < 7; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 30 + r() * 70;
      const b = g.createRadialGradient(x, y, rad * 0.4, x, y, rad);
      const tone = r() < 0.5 ? '240,230,205' : '200,178,140';
      b.addColorStop(0, `rgba(${tone},0.22)`);
      b.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = b;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // hairline cracks: short wandering lines
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = r() * w;
      let y = r() * h;
      let a = r() * Math.PI * 2;
      g.strokeStyle = `rgba(90,70,48,${0.22 + r() * 0.18})`;
      g.lineWidth = 0.8 + r() * 0.7;
      g.beginPath();
      g.moveTo(x, y);
      const n = 8 + Math.floor(r() * 14);
      for (let k = 0; k < n; k++) {
        a += (r() - 0.5) * 1.1;
        x += Math.cos(a) * (6 + r() * 10);
        y += Math.sin(a) * (6 + r() * 10);
        g.lineTo(x, y);
        if (r() < 0.12) {
          // a short branch
          const bx = x + Math.cos(a + 1.2) * 14;
          const by = y + Math.sin(a + 1.2) * 14;
          g.lineTo(bx, by);
          g.moveTo(x, y);
        }
      }
      g.stroke();
    }
    // fly-specks and tiny pits
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = r() < 0.7 ? `rgba(110,88,60,${0.12 + r() * 0.2})` : `rgba(255,250,235,${0.2 + r() * 0.2})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  });
}

/** A bump map to go with the plaster. */
export function plasterBump() {
  return pixels(
    'plaster-bump',
    512,
    512,
    (x, y, out, i) => {
      const u = x / 512;
      const v = y / 512;
      const n = tnoise(u, v, 6) * 0.45 + tnoise(u, v, 22, 5) * 0.35 + tnoise(u, v, 70, 9) * 0.2;
      const pit = smoothstep(0.12, 0.04, worley3(u * 40, v * 40, 1.7)) * 0.5;
      const val = 128 + n * 110 - pit * 60;
      out[i] = out[i + 1] = out[i + 2] = val;
      out[i + 3] = 255;
    },
    { data: true },
  );
}

export type TileOpts = { cols: number; rows: number; base: string; vary?: number; grout?: string; bevel?: number; seed?: number; offset?: boolean; craze?: number; chips?: number };

/**
 * Glazed tiles with grout, each tile its own tone, a soft bevelled edge
 * highlight, fine crazing and an occasional chip. `cols` x `rows` tiles per texture.
 */
export function tileTex(key: string, o: TileOpts) {
  const size = 1024;
  return tex('tile:' + key, size, size, (g, w, h) => {
    const r = rand(o.seed ?? 3);
    const tw = w / o.cols;
    const th = h / o.rows;
    const gap = Math.max(3, Math.round(Math.min(tw, th) * 0.045));
    g.fillStyle = o.grout ?? '#8a8172';
    g.fillRect(0, 0, w, h);
    // grout grit
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(60,50,40,0.25)' : 'rgba(200,190,170,0.18)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    const base = C(o.base);
    const vary = o.vary ?? 0.08;
    for (let row = 0; row < o.rows; row++) {
      const off = o.offset && row % 2 ? tw / 2 : 0;
      for (let col = -1; col <= o.cols; col++) {
        const x = col * tw + off + gap / 2;
        const y = row * th + gap / 2;
        const ww = tw - gap;
        const hh = th - gap;
        const k = 1 - vary + r() * vary * 2;
        const c = base.clone().multiplyScalar(k);
        // a faint hue drift per tile
        c.offsetHSL((r() - 0.5) * 0.012, (r() - 0.5) * 0.05, 0);
        const hex = '#' + c.getHexString();
        const grad = g.createLinearGradient(x, y, x + ww * 0.4, y + hh);
        grad.addColorStop(0, shade(hex, 1.06));
        grad.addColorStop(0.5, hex);
        grad.addColorStop(1, shade(hex, 0.9));
        g.fillStyle = grad;
        g.beginPath();
        g.roundRect(x, y, ww, hh, Math.min(ww, hh) * 0.08);
        g.fill();
        // pooled glaze: a slightly darker rim just inside the edge
        g.strokeStyle = shade(hex, 0.86, 0.5);
        g.lineWidth = gap * 0.6;
        g.beginPath();
        g.roundRect(x + gap * 0.3, y + gap * 0.3, ww - gap * 0.6, hh - gap * 0.6, Math.min(ww, hh) * 0.07);
        g.stroke();
        // the bevel's highlight along the top edge
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x + ww * 0.08, y + hh * 0.06, ww * 0.84, Math.max(2, hh * 0.04));
        // crazing: a few fine dark lines in the glaze
        const craze = o.craze ?? 0.5;
        if (r() < craze) {
          g.strokeStyle = 'rgba(70,60,50,0.18)';
          g.lineWidth = 0.7;
          g.beginPath();
          let cx = x + r() * ww;
          let cy = y + r() * hh;
          g.moveTo(cx, cy);
          for (let k2 = 0; k2 < 6; k2++) {
            cx = Math.max(x, Math.min(x + ww, cx + (r() - 0.5) * ww * 0.5));
            cy = Math.max(y, Math.min(y + hh, cy + (r() - 0.5) * hh * 0.5));
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
        // a chipped corner now and then
        if (r() < (o.chips ?? 0.06)) {
          g.fillStyle = o.grout ?? '#8a8172';
          const cxp = r() < 0.5 ? x : x + ww;
          const cyp = r() < 0.5 ? y : y + hh;
          g.beginPath();
          g.arc(cxp, cyp, gap * (1.2 + r() * 1.6), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
}

/**
 * Unglazed quarry tiles for the kitchen floor: warm red-browns, worn paler
 * where people walk, grout darkened with years of mopping.
 */
export function quarryTex() {
  return tex('quarry', 1024, 1024, (g, w, h) => {
    const r = rand(71);
    const n = 4;
    const s = w / n;
    const gap = 7;
    g.fillStyle = '#2a211c';
    g.fillRect(0, 0, w, h);
    const tones = ['#8a4a33', '#7d4430', '#94573c', '#6f3d2c', '#87503a', '#7a4a37'];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i * s + gap / 2;
        const y = j * s + gap / 2;
        const c = C(pick(r, tones)).multiplyScalar(0.85 + r() * 0.3);
        const hex = '#' + c.getHexString();
        g.fillStyle = hex;
        g.beginPath();
        g.roundRect(x, y, s - gap, s - gap, 10);
        g.fill();
        // clay mottling inside the tile
        for (let k = 0; k < 90; k++) {
          const px = x + r() * (s - gap);
          const py = y + r() * (s - gap);
          const rad = 4 + r() * 26;
          const b = g.createRadialGradient(px, py, 0, px, py, rad);
          const tone = r() < 0.55 ? '40,18,10' : '210,140,100';
          b.addColorStop(0, `rgba(${tone},${0.06 + r() * 0.08})`);
          b.addColorStop(1, `rgba(${tone},0)`);
          g.fillStyle = b;
          g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        }
        // grit
        for (let k = 0; k < 220; k++) {
          g.fillStyle = r() < 0.6 ? 'rgba(30,15,8,0.35)' : 'rgba(230,180,140,0.3)';
          g.fillRect(x + r() * (s - gap), y + r() * (s - gap), 1 + r() * 2, 1 + r() * 2);
        }
        // a darker rim where the edges took the wax
        g.strokeStyle = 'rgba(30,14,8,0.28)';
        g.lineWidth = 6;
        g.beginPath();
        g.roundRect(x + 3, y + 3, s - gap - 6, s - gap - 6, 8);
        g.stroke();
      }
  });
}

/** Dark worn floorboards for the dining side (boards along u). */
export function boardsTex() {
  return woodTex('floorboards', { w: 1024, h: 1024, light: '#5e3e28', dark: '#1e110a', planks: 8, rings: 5, seed: 21, seams: 1.6, figure: 0.35, warp: 0.6 });
}

/** Brushed stainless: fine streaks along u, a few smudges and swirls. Used as a colour map (white-ish). */
export function brushedTex() {
  return tex('brushed', 512, 512, (g, w, h) => {
    const r = rand(5);
    g.fillStyle = '#c9ccd0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const y = r() * h;
      const x = r() * w;
      const len = 30 + r() * 220;
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.04 + r() * 0.08})` : `rgba(60,64,70,${0.04 + r() * 0.07})`;
      g.fillRect(x, y, len, 1);
      if (x + len > w) g.fillRect(x - w, y, len, 1);
    }
    // smudges and a few dull patches
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 10 + r() * 50;
      const b = g.createRadialGradient(x, y, 0, x, y, rad);
      b.addColorStop(0, `rgba(${r() < 0.5 ? '120,110,95' : '230,232,236'},${0.08 + r() * 0.1})`);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = b;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}

/** Roughness to go with brushed steel: streaky, with a few dull wiped patches. */
export function brushedRough() {
  return tex(
    'brushed-rough',
    256,
    256,
    (g, w, h) => {
      const r = rand(9);
      g.fillStyle = 'rgb(96,96,96)';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const y = r() * h;
        const x = r() * w;
        const len = 20 + r() * 120;
        const v = 70 + r() * 70;
        g.fillStyle = `rgba(${v},${v},${v},0.35)`;
        g.fillRect(x, y, len, 1);
        if (x + len > w) g.fillRect(x - w, y, len, 1);
      }
      for (let i = 0; i < 14; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 10 + r() * 30;
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, 'rgba(170,170,170,0.5)');
        b.addColorStop(1, 'rgba(170,170,170,0)');
        g.fillStyle = b;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    },
    { data: true },
  );
}

/** Soft white dot (glows, steam, halos). */
export function softDot() {
  return tex(
    'soft-dot',
    64,
    64,
    (g, w, h) => {
      const b = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      b.addColorStop(0, 'rgba(255,255,255,1)');
      b.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      b.addColorStop(0.6, 'rgba(255,255,255,0.14)');
      b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );
}

/** A soft, lumpy puff for steam (white, alpha in the canvas). */
export function puffTex() {
  return tex(
    'puff',
    128,
    128,
    (g, w, h) => {
      const r = rand(4);
      for (let i = 0; i < 9; i++) {
        const x = w / 2 + (r() - 0.5) * w * 0.35;
        const y = h / 2 + (r() - 0.5) * h * 0.35;
        const rad = w * (0.18 + r() * 0.16);
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, 'rgba(255,255,255,0.36)');
        b.addColorStop(0.6, 'rgba(255,255,255,0.12)');
        b.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = b;
        g.fillRect(0, 0, w, h);
      }
    },
    { repeat: false },
  );
}

/** Plain-weave cloth, white-ish so a material colour tints it. */
export function weaveTex(key: string, o: { base?: string; thread?: number; slub?: number; size?: number } = {}) {
  const size = o.size ?? 256;
  const step = o.thread ?? 4;
  return tex('weave:' + key, size, size, (g, w, h) => {
    const r = rand(17);
    g.fillStyle = o.base ?? '#e8e2d6';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += step)
      for (let x = 0; x < w; x += step) {
        const over = ((x + y) / step) % 2 === 0;
        const k = 0.86 + r() * 0.16;
        g.fillStyle = over ? `rgba(255,255,255,${0.16 * k})` : `rgba(0,0,0,${0.14 * k})`;
        g.fillRect(x, y, step, step);
      }
    const slub = o.slub ?? 60;
    for (let i = 0; i < slub; i++) {
      const y = Math.floor(r() * (h / step)) * step;
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.12)`;
      g.fillRect(r() * w, y, 10 + r() * 40, step * 0.8);
    }
  });
}

/**
 * Brush marks that read as hand-written calligraphy from a distance without
 * being writing: one continuous ribbon of ink wandering down (or across) the
 * box, swelling and thinning with the brush's pressure, lifting off now and
 * then, with a dot or two. No separate strokes, so no letters or characters.
 */
export function brushMarks(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, ink: string, strokes = 4, vertical = true) {
  g.save();
  g.fillStyle = ink;
  const along = vertical ? h : w;
  const across = vertical ? w : h;
  const cells = Math.max(1, Math.round(along / across));
  // the ribbon's path: a few loose turns per cell, sometimes doubling back into a loop
  const pts: [number, number][] = [];
  const per = 2 + Math.min(3, Math.max(1, strokes - 1));
  let t = 0.03;
  const end = 0.97;
  const step = (end - t) / (cells * per);
  while (t < end) {
    const side = (r() - 0.5) * 0.84;
    pts.push(vertical ? [x + w / 2 + side * across, y + t * h] : [x + t * w, y + h / 2 + side * across]);
    // mostly onward, now and then a little way back (a loop)
    t += r() < 0.22 ? -step * (0.3 + r() * 0.4) : step * (0.7 + r() * 0.9);
  }
  const curve = new THREE.SplineCurve(pts.map(([px, py]) => new THREE.Vector2(px, py)));
  const steps = 70 * cells;
  const base = across * 0.1;
  let lift = 0;
  for (let i = 0; i <= steps; i++) {
    const tt = i / steps;
    // lift the brush now and then, for a short gap
    if (lift <= 0 && r() < 0.012) lift = 3 + Math.floor(r() * 5);
    if (lift > 0) {
      lift--;
      continue;
    }
    const p = curve.getPoint(tt);
    const pressure = 0.5 + 0.5 * Math.sin(tt * cells * 4.3 + 1.3) * Math.sin(tt * cells * 1.7 + 0.4);
    const wv = base * (0.45 + pressure);
    g.globalAlpha = 0.88;
    g.beginPath();
    g.ellipse(p.x, p.y, wv * 0.6, wv * 0.5, tt * 6, 0, Math.PI * 2);
    g.fill();
  }
  // a couple of dots beside the ribbon
  for (let k = 0; k < cells; k++) {
    if (r() < 0.5) continue;
    const td = (k + 0.3 + r() * 0.4) / cells;
    const side = (r() < 0.5 ? -1 : 1) * 0.36;
    const px = vertical ? x + w / 2 + side * across : x + td * w;
    const py = vertical ? y + td * h : y + h / 2 + side * across;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.ellipse(px, py, base * 0.8, base * 0.6, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.restore();
}
