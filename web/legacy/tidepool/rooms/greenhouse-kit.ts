import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { smoothLathe } from '../../tank/kitchenware';
import { C, fbm3, mix, noise3, rng, smoothstep, worley3 } from '../../tank/util';

// Shared pieces for the greenhouse: canvas-painted textures, materials, and
// geometry builders for leaves, terracotta pots, soil and planks. Everything
// heavy is built once and cached by key, so a plant placed twice costs nothing.

export { rng };

// ---------- caching ----------

const geoCache = new Map<string, unknown>();
/** Build something once per key (geometries, leaf sets, painted textures). */
export function once<T>(key: string, build: () => T): T {
  let v = geoCache.get(key) as T | undefined;
  if (v === undefined) {
    v = build();
    geoCache.set(key, v);
  }
  return v;
}

// ---------- merging many small parts into one geometry ----------

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

/** A matrix from a position, an euler rotation (x, y, z order) and a scale. */
export function trs(p: [number, number, number] | THREE.Vector3, r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1, order: THREE.EulerOrder = 'XYZ') {
  const pos = Array.isArray(p) ? new THREE.Vector3(...p) : p;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order));
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(pos, q, sc);
}

/** A matrix whose local +y points along `dir`, local +z as close to `face` as possible. */
export function aim(p: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, s: number | THREE.Vector3 = 1) {
  const Y = dir.clone().normalize();
  const X = new THREE.Vector3().crossVectors(Y, face);
  if (X.lengthSq() < 1e-8) X.set(1, 0, 0).cross(Y).cross(Y).negate();
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
  m.scale(sc);
  m.setPosition(p);
  return m;
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

export const paintFlat = (g: THREE.BufferGeometry, hex: string) => {
  const c = C(hex);
  return paint(g, (_x, _y, _z, out) => out.copy(c));
};

/** A rounded box with world-sized UVs (so a texture keeps its scale on any size). */
export function plank(w: number, h: number, d: number, r = 0.04, uvScale: number | [number, number] = 1, seg = 2, uvOffset: [number, number] = [0, 0]) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  boxUV(g, uvScale, uvOffset);
  return g;
}

/** Box-projected UVs from positions: the grain runs along x on every face. */
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

// ---------- leaves ----------

export interface LeafOpts {
  /** Length along +y and full width along x; the face looks toward +z. */
  len: number;
  width: number;
  /** Half width along the leaf (v from 0 at the stalk to 1 at the tip), as a fraction of width / 2. */
  outline?: (v: number) => number;
  /** Segments across each half, and along. */
  nu?: number;
  nv?: number;
  /** Total bend (radians) of the tip away from the face (toward -z), growing toward the tip. */
  arch?: number;
  /** Edges lift toward the face: a cupped leaf. */
  cup?: number;
  /** A crease along the midrib (edges lift linearly). */
  fold?: number;
  /** Twist (radians) at the tip. */
  twist?: number;
  /** A wavy edge. */
  ruffle?: number;
  ruffleFreq?: number;
  /** Colour by position: u from -1 to 1 across, v from 0 to 1 along. */
  paint?: (u: number, v: number, out: THREE.Color) => void;
}

/** A leaf blade as a grid that follows its outline, so it can bend smoothly. Base at the origin. */
export function leafGeometry(o: LeafOpts) {
  const nu = o.nu ?? 3;
  const nv = o.nv ?? 8;
  const outline = o.outline ?? ((v: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + v * 0.96)), 0.8));
  const cols = 2 * nu + 1;
  const rows = nv + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const col = new Float32Array(cols * rows * 3);
  const cy = new Float32Array(rows);
  const cz = new Float32Array(rows);
  const th = new Float32Array(rows);
  const arch = o.arch ?? 0;
  const step = o.len / nv;
  let y = 0;
  let z = 0;
  for (let r = 0; r < rows; r++) {
    const v = r / nv;
    cy[r] = y;
    cz[r] = z;
    th[r] = arch * v * v;
    const vm = (r + 0.5) / nv;
    const tm = arch * vm * vm;
    y += Math.cos(tm) * step;
    z -= Math.sin(tm) * step;
  }
  const tmp = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const v = r / nv;
    const hw = (o.width / 2) * outline(v);
    const tw = (o.twist ?? 0) * v;
    const ny = Math.sin(th[r]);
    const nz = Math.cos(th[r]);
    const ct = Math.cos(tw);
    const st = Math.sin(tw);
    for (let c = 0; c < cols; c++) {
      const u = (c - nu) / nu;
      const x = u * hw;
      let off = (o.cup ?? 0) * u * u * hw + (o.fold ?? 0) * Math.abs(u) * hw;
      if (o.ruffle) off += o.ruffle * Math.sin(v * (o.ruffleFreq ?? 14) + (u > 0 ? 0 : 1.7)) * u * u;
      const x2 = x * ct - off * st;
      const o2 = x * st + off * ct;
      const i = r * cols + c;
      pos[i * 3] = x2;
      pos[i * 3 + 1] = cy[r] + ny * o2;
      pos[i * 3 + 2] = cz[r] + nz * o2;
      uv[i * 2] = (u + 1) / 2;
      uv[i * 2 + 1] = v;
      tmp.setRGB(1, 1, 1);
      o.paint?.(u, v, tmp);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < nv; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Leaf colour: darker at the base, a pale midrib, faint side veins and a slightly darker edge. */
export function leafPaint(base: string, tip: string, o: { rib?: string; ribW?: number; veins?: number; edge?: number; veinK?: number } = {}) {
  const a = C(base);
  const b = C(tip);
  const rib = C(o.rib ?? tip).lerp(C('#e8f0c0'), 0.25);
  const ribW = o.ribW ?? 0.08;
  const veins = o.veins ?? 0;
  const edge = o.edge ?? 0.18;
  const veinK = o.veinK ?? 0.12;
  return (u: number, v: number, out: THREE.Color) => {
    mix(out, a, b, smoothstep(0, 0.9, v));
    const au = Math.abs(u);
    mix(out, out, rib, smoothstep(ribW, 0, au) * 0.55 * (1 - v * 0.6));
    if (veins > 0) {
      const f = (v - au * 0.45) * veins;
      const line = smoothstep(0.82, 1, 1 - Math.abs(f - Math.round(f)) * 2);
      mix(out, out, rib, line * veinK * smoothstep(0.05, 0.25, au));
    }
    out.multiplyScalar(1 - edge * smoothstep(0.7, 1, au));
  };
}

// ---------- plant materials ----------

/** Leaves: vertex coloured, both sides, with a paler underside (optionally a cut-out texture). */
export function leafMaterial(key: string, o: { roughness?: number; map?: THREE.Texture; alphaTest?: number } = {}) {
  return once(`mat:${key}`, () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: o.roughness ?? 0.55, metalness: 0, map: o.map ?? null, alphaTest: o.alphaTest ?? 0 });
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  if (!gl_FrontFacing) {
    float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(0.92, 1.08, 0.84), 0.3) * 1.18;
  }`,
      );
    };
    m.customProgramCacheKey = () => `gh-leaf${o.map ? '-map' : ''}`;
    return m;
  });
}

export function vcMaterial(key: string, o: THREE.MeshStandardMaterialParameters = {}) {
  return once(`mat:${key}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, ...o }));
}

export function vcPhysical(key: string, o: THREE.MeshPhysicalMaterialParameters = {}) {
  return once(`mat:${key}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, ...o }));
}

// ---------- painted textures ----------

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** A canvas texture drawn once and shared. */
export function canvasTexture(key: string, w: number, h: number, draw: Draw, o: { srgb?: boolean; wrap?: boolean; aniso?: number } = {}) {
  return once(`tex:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
    const t = new THREE.CanvasTexture(c);
    if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (o.wrap !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = o.aniso ?? 8;
    return t;
  });
}

/** A texture computed per pixel (fn writes 0..255 values into out). */
export function pixelTexture(key: string, w: number, h: number, fn: (x: number, y: number, out: Uint8ClampedArray, i: number) => void, o: { srgb?: boolean; wrap?: boolean } = {}) {
  return canvasTexture(
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
  return once(`rep:${key}`, () => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  });
}

/** Wood grain along u; tiles in u (planks are mapped with world-sized UVs). */
export function woodTexture(key: string, light: string, dark: string, seed = 1) {
  const L = C(light);
  const D = C(dark);
  const tmp = new THREE.Color();
  const W = 1024;
  const H = 128;
  const r = rng(seed * 31 + 7);
  const knots = Array.from({ length: 3 }, () => ({ u: r(), v: 0.15 + r() * 0.7, s: 0.6 + r() * 0.8 }));
  return pixelTexture(key, W, H, (x, y, out, i) => {
    const u = x / W;
    const v = y / H;
    // sample noise on a circle so the texture tiles along the grain
    const a = Math.PI * 2 * u;
    const cx = Math.cos(a) * 3.2;
    const sy = Math.sin(a) * 3.2;
    let warp = fbm3(cx * 0.35 + seed, sy * 0.35, v * 1.2) * 4.2;
    // small knots pull the growth lines into rings around them
    let core = 0;
    for (const k of knots) {
      let du = Math.abs(u - k.u);
      du = Math.min(du, 1 - du) * 8;
      const dv = (v - k.v) * 1.1;
      const d = Math.sqrt(du * du + dv * dv) / (0.05 * k.s);
      warp += 2.2 * Math.exp(-d * d * 0.5) * Math.sign(v - k.v + 1e-3);
      core = Math.max(core, smoothstep(1.0, 0.35, d));
    }
    const lines = v * 30 + warp;
    const f = lines - Math.floor(lines);
    const late = smoothstep(0, 0.06, f) * smoothstep(0.34, 0.08, f);
    const fiber = noise3(cx * 0.8, sy * 0.8, v * 140 + seed) * 0.5 + 0.5;
    const fiber2 = noise3(cx * 5, sy * 5, v * 36) * 0.5 + 0.5;
    const blot = fbm3(cx * 0.9, sy * 0.9, v * 2.5 + seed * 3) * 0.5 + 0.5;
    mix(tmp, L, D, Math.min(1, late * 0.4 + fiber * 0.2 + fiber2 * 0.08 + blot * 0.32 + core * 0.6));
    const lin = tmp;
    out[i] = Math.round(Math.pow(lin.r, 1 / 2.2) * 255);
    out[i + 1] = Math.round(Math.pow(lin.g, 1 / 2.2) * 255);
    out[i + 2] = Math.round(Math.pow(lin.b, 1 / 2.2) * 255);
    out[i + 3] = 255;
  });
}

/** Fine porous speckle, for terracotta and stone (used as a bump map). */
export function speckleTexture() {
  return pixelTexture(
    'speckle',
    256,
    256,
    (x, y, out, i) => {
      const a = (x / 256) * Math.PI * 2;
      const b = (y / 256) * Math.PI * 2;
      // periodic in both directions: sample noise on a torus
      const n = noise3(Math.cos(a) * 5 + Math.cos(b) * 1.3, Math.sin(a) * 5, Math.sin(b) * 5) * 0.5 + noise3(Math.cos(a) * 14, Math.sin(a) * 14 + Math.cos(b) * 14, Math.sin(b) * 14) * 0.5;
      const w = worley3(Math.cos(a) * 9 + 20, Math.sin(a) * 9, Math.cos(b) * 9 + Math.sin(b) * 3);
      const pit = smoothstep(0.18, 0.05, w);
      const val = Math.max(0, Math.min(255, 150 + n * 70 - pit * 90));
      out[i] = out[i + 1] = out[i + 2] = val;
      out[i + 3] = 255;
    },
    { srgb: false },
  );
}

/** Potting soil seen from above: dark crumbs, bits of bark and white perlite. */
export function soilTexture() {
  return canvasTexture('soil', 256, 256, (g, w, h) => {
    g.fillStyle = '#2b1d14';
    g.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 1400; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 1 + r() * 3.2;
      const k = r();
      g.fillStyle = k < 0.45 ? `rgba(18,11,7,${0.5 + r() * 0.5})` : k < 0.85 ? `rgba(${70 + r() * 30},${48 + r() * 20},${30 + r() * 12},${0.5 + r() * 0.5})` : `rgba(110,74,44,0.8)`;
      g.beginPath();
      g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // bark chips
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${96 + r() * 30},${58 + r() * 16},${32 + r() * 10},0.9)`;
      g.save();
      g.translate(r() * w, r() * h);
      g.rotate(r() * 3);
      g.fillRect(-4, -1.5, 6 + r() * 5, 2.5 + r() * 2);
      g.restore();
    }
    // perlite
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(236,232,220,${0.7 + r() * 0.3})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 0.8 + r() * 1.8, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ---------- terracotta ----------

export interface PotShape {
  /** Outer radius at the top of the body (under the rim band) and total height. */
  r: number;
  h: number;
  /** Bottom radius as a fraction of r. */
  base?: number;
  /** How far the rim band stands out, and its height (fraction of h). */
  rim?: number;
  rimH?: number;
  /** Wall thickness. */
  wall?: number;
  /** Soil level (fraction of h); the inside below it is never seen. */
  soil?: number;
}

/** The classic flower pot profile: tapered body, a rolled rim band and a rounded lip. */
export function potProfile(s: PotShape): [number, number][] {
  const { r, h } = s;
  const rb = r * (s.base ?? 0.74);
  const ro = s.rim ?? r * 0.075;
  const rh = h * (s.rimH ?? 0.19);
  const wall = s.wall ?? Math.max(0.035, r * 0.07);
  const soil = h * (s.soil ?? 0.86);
  const body = (t: number) => rb + (r - rb) * t;
  return [
    [0, 0],
    [rb - 0.05, 0],
    [rb - 0.008, 0.012],
    [body(0.02), 0.05],
    [body(0.35), (h - rh) * 0.35],
    [body(0.7), (h - rh) * 0.7],
    [r - 0.004, h - rh - 0.035],
    [r + ro * 0.35, h - rh + 0.004],
    [r + ro, h - rh + 0.04],
    [r + ro, h - 0.05],
    [r + ro - 0.01, h - 0.012],
    [r + ro - 0.04, h],
    [r - wall + 0.015, h - 0.008],
    [r - wall, h - 0.06],
    [body((soil - 0.08) / h) - wall, soil - 0.08],
    [0, soil - 0.08],
  ];
}

const terraBases = ['#b9643e', '#c2714a', '#a95a3b', '#c47e58', '#b46a49'];

/** A terracotta pot lathe, painted: mottled clay, a damp darker foot, white salt bloom near the rim. */
export function terracottaGeometry(s: PotShape, seed = 1, o: { aged?: number; n?: number; seg?: number } = {}) {
  const n = o.n ?? 90;
  const g = smoothLathe(potProfile(s), n, o.seg ?? 56);
  const base = C(terraBases[Math.abs(seed) % terraBases.length]);
  const dark = C('#6e3a26');
  const salt = C('#e2d6c4');
  const moss = C('#5b6a32');
  const inside = C('#5a3020');
  const aged = o.aged ?? 0.6;
  const H = s.h;
  const ph = seed * 3.7;
  return paint(g, (x, y, z, out, i) => {
    const along = (i % (n + 1)) / n;
    const inner = along > 0.8;
    const t = y / H;
    out.copy(base).multiplyScalar(0.9 + 0.2 * (fbm3(x * 1.8 + ph, y * 1.8, z * 1.8) + 0.5) * 0.9 + 0.05 * noise3(x * 9, y * 9 + ph, z * 9));
    // the damp foot
    const damp = smoothstep(0.42, 0.04, t + 0.12 * noise3(x * 2.6 + ph, 0.5, z * 2.6));
    mix(out, out, dark, damp * 0.45 * aged);
    // salt bloom under the rim and in runs down the side
    const runs = smoothstep(0.35, 0.75, fbm3(x * 4 + ph, y * 0.9, z * 4) + 0.3 * t);
    const band = smoothstep(0.62, 0.9, t);
    mix(out, out, salt, Math.min(1, runs * band * 0.85 + band * 0.12) * aged);
    // a little moss in the damp
    mix(out, out, moss, smoothstep(0.62, 0.9, noise3(x * 5 + ph, y * 5, z * 5) * 0.5 + 0.5) * damp * 0.7 * aged);
    // the rim band catches more light; the inside is darker
    if (t > 0.8 && !inner) out.multiplyScalar(1.06);
    if (inner) mix(out, out, inside, 0.55);
  });
}

let clayMat: THREE.MeshStandardMaterial | null = null;
/** Matte porous clay with a fine speckled bump. */
export function clayMaterial() {
  if (!clayMat) {
    const bump = repeated(speckleTexture(), 5, 3, 'clay-bump');
    clayMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, bumpMap: bump, bumpScale: 1.2 });
  }
  return clayMat;
}

/** The soil surface in a pot: a gently lumpy disc (radius r) with a painted soil map. */
export function soilGeometry(r: number, seed = 1) {
  return once(`soil:${r.toFixed(3)}:${seed}`, () => {
    // rings of interior vertices so the surface can be lumpy
    const ring = new THREE.RingGeometry(0.0001, r, 36, 5);
    ring.rotateX(-Math.PI / 2);
    const p = ring.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const d = Math.hypot(x, z) / r;
      p.setY(i, (noise3(x * 4 + seed, 0.3, z * 4) * 0.03 + 0.02 * (1 - d * d)) * Math.min(1, r * 2.2) - 0.01 * d);
    }
    // world-sized UVs so crumbs stay the same size on any pot
    const uv = ring.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.9 + seed * 0.37, p.getZ(i) * 0.9);
    ring.computeVertexNormals();
    return ring;
  });
}

let soilMat: THREE.MeshStandardMaterial | null = null;
export function soilMaterial() {
  if (!soilMat) soilMat = new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1, color: '#bba89a' });
  return soilMat;
}

// ---------- small helpers ----------

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Pick from a list by seed. */
export function pick<T>(list: T[], seed: number): T {
  return list[((seed % list.length) + list.length) % list.length];
}

export { C, mix, smoothstep, noise3, fbm3, worley3 };
