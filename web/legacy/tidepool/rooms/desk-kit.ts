import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { noise3 } from '../../tank/util';

// Shared pieces for the Night desk theme: seeded randomness, cached canvas
// textures and materials, and a few geometry helpers (rounded slabs, planar
// UVs). Textures and materials are cached per key so every copy of an item
// shares them.

/** A seeded random stream in [0, 1). Neighbouring seeds give unrelated streams. */
export function rand(seed: number) {
  // mix the seed well first, so neighbouring seeds start far apart
  let h = (seed | 0) ^ 0x2c1b3c6d;
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

// ---------- caches ----------

const textures = new Map<string, THREE.CanvasTexture>();

/** A canvas texture drawn once per key. `data` textures (bump, roughness) skip the sRGB conversion. */
export function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { repeat?: boolean; data?: boolean } = {}) {
  let t = textures.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textures.set(key, t);
  }
  return t;
}

const materials = new Map<string, THREE.Material>();

/** A material made once per key and shared. */
export function material<T extends THREE.Material>(key: string, make: () => T): T {
  let m = materials.get(key);
  if (!m) {
    m = make();
    materials.set(key, m);
  }
  return m as T;
}

const geometries = new Map<string, THREE.BufferGeometry>();

/** A geometry built once per key and shared. */
export function geometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g as T;
}

// ---------- colour ----------

/** sRGB bytes of a hex colour, for canvas pixel work. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const css = (c: [number, number, number], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function shade(hex: string, k: number, a = 1) {
  const c = rgb(hex);
  return css([Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)], a);
}

// ---------- geometry ----------

/** A box with rounded edges and corners. */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

/**
 * Planar UVs by face direction: tops get (x, z), fronts (x, y), sides (z, y),
 * so a grain drawn along the texture's u runs along x on tops and fronts.
 */
export function planarUV(g: THREE.BufferGeometry, scale: number | [number, number] = 1, offset: [number, number] = [0, 0]) {
  const [su, sv] = typeof scale === 'number' ? [scale, scale] : scale;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (az >= ax) {
      u = p.getX(i);
      v = p.getY(i);
    } else {
      u = p.getZ(i);
      v = p.getY(i);
    }
    uv[i * 2] = u * su + offset[0];
    uv[i * 2 + 1] = v * sv + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
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

/** A rounded rectangle path centred on the origin. */
export function roundRectShape(w: number, h: number, r: number, cx = 0, cy = 0) {
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

/** A flat bevelled slab from a shape, `depth` thick along +z (bevel included), centred on z = 0. */
export function slab(shape: THREE.Shape, depth: number, bevel: number, seg = 3, curve = 24) {
  const b = Math.min(bevel, depth / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - b * 2), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: seg, curveSegments: curve });
  g.translate(0, 0, -(depth - b * 2) / 2);
  return g;
}

/** Fill a geometry's vertex colours with one colour. */
export function solid(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------- textures ----------

/** Bilinear lookup in a (gw+1) x (gh+1) grid at u, v in [0, 1]. */
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

export type WoodOpts = { w?: number; h?: number; light: string; dark: string; planks?: number; rings?: number; seed?: number; joints?: boolean; seams?: number; pores?: number };

/**
 * Wood grain running along u (canvas x), in `planks` boards stacked along v.
 * Each board has its own tone and figure, a darker seam, and (optionally) an
 * end joint. Tiles in both directions.
 */
export function woodTexture(key: string, o: WoodOpts) {
  const { w = 1024, h = 512, planks = 4, rings = 6, seed = 1, joints = true, seams = 0.5, pores = 1 } = o;
  return canvasTexture(
    'wood:' + key,
    w,
    h,
    (g) => {
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
      // low-frequency warp of the grain and long colour streaks along it,
      // periodic in u (sampled round a cylinder)
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
      // fine fibres: one value per row, softened, with a slow drift along u
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
          // cathedral figure: near the board's heart the rings bow into long arches
          const du = Math.abs(u - centre[pl]);
          const arch = Math.min(du, 1 - du);
          const heart = Math.exp(-((vp - 0.5) * (vp - 0.5)) / 0.05);
          const ringPos = (vp - 0.5) * rings + wv * 0.5 + shift[pl] + heart * arch * arch * 9;
          const ri = Math.floor(ringPos);
          const fr = ringPos - ri;
          // thin latewood lines, each ring its own strength, on long soft streaks
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
      // pores: short dark dashes along the grain
      g.fillStyle = css(D, 0.22);
      const n = Math.floor((w * h) / 90) * pores;
      for (let i = 0; i < n; i++) {
        const x = r() * w;
        const y = r() * h;
        g.fillRect(x, y, 2 + r() * 7, 1);
      }
    },
    { repeat: true },
  );
}

/** Soft white dot (glows, steam, halos). */
export function softDot() {
  return canvasTexture('soft-dot', 64, 64, (g, w, h) => {
    const b = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    b.addColorStop(0, 'rgba(255,255,255,1)');
    b.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    b.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    b.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = b;
    g.fillRect(0, 0, w, h);
  });
}

/** A plain-weave fabric (linen, cloth): white-ish so a material colour tints it. */
export function weaveTexture(key: string, o: { base?: string; thread?: number; slub?: number; size?: number } = {}) {
  const size = o.size ?? 256;
  const step = o.thread ?? 4;
  return canvasTexture(
    'weave:' + key,
    size,
    size,
    (g, w, h) => {
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
      // slubs: thicker threads here and there
      const slub = o.slub ?? 60;
      for (let i = 0; i < slub; i++) {
        const y = Math.floor(r() * (h / step)) * step;
        const x = r() * w;
        g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.12)`;
        g.fillRect(x, y, 10 + r() * 40, step * 0.8);
      }
    },
    { repeat: true },
  );
}

/** Grey bump noise for paint, plaster, paper. */
export function grainBump(key: string, o: { size?: number; contrast?: number; scale?: number } = {}) {
  const size = o.size ?? 256;
  return canvasTexture(
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
          // tiles in both directions: blend the four wrapped copies
          const n = n2(u, v) * (1 - u) * (1 - v) + n2(u - 1, v) * u * (1 - v) + n2(u, v - 1) * (1 - u) * v + n2(u - 1, v - 1) * u * v;
          const val = 128 + n * 230 * c;
          const o4 = (y * w + x) * 4;
          d[o4] = d[o4 + 1] = d[o4 + 2] = val;
          d[o4 + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    { repeat: true, data: true },
  );
}

// ---------- more geometry ----------

/**
 * Colour a lathe made by smoothLathe(pts, n): fn gets the vertex position and
 * how far along the profile it lies (0 at the first control point, 1 at the last).
 */
export function paintLathe(g: THREE.BufferGeometry, n: number, fn: (x: number, y: number, z: number, along: number, out: THREE.Color) => void) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.setRGB(1, 1, 1);
    fn(p.getX(i), p.getY(i), p.getZ(i), (i % (n + 1)) / n, tmp);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const Y = new THREE.Vector3(0, 1, 0);

/** A cylinder from a to b. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** A quaternion turning +y onto a direction. */
export function aim(dir: THREE.Vector3) {
  return new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------- shared materials ----------

export function metals() {
  return {
    brass: material('m:brass', () => new THREE.MeshStandardMaterial({ color: '#c99a4c', metalness: 0.9, roughness: 0.3 })),
    gold: material('m:gold', () => new THREE.MeshStandardMaterial({ color: '#dcb35c', metalness: 0.95, roughness: 0.24 })),
    chrome: material('m:chrome', () => new THREE.MeshStandardMaterial({ color: '#d4d7dc', metalness: 1, roughness: 0.18 })),
    steel: material('m:steel', () => new THREE.MeshStandardMaterial({ color: '#9da2a8', metalness: 1, roughness: 0.35 })),
    iron: material('m:iron', () => new THREE.MeshStandardMaterial({ color: '#26221f', metalness: 0.6, roughness: 0.45 })),
    rubber: material('m:rubber', () => new THREE.MeshStandardMaterial({ color: '#1b1a1a', roughness: 0.75 })),
    glass: material('m:glass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false })),
    glaze: material('m:glaze', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 })),
    matte: material('m:matte', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })),
  };
}

/** Where the rim is along a smoothLathe(pts, n) profile (0..1): the highest point, so outside < split < inside. */
export function rimAlong(pts: [number, number][], n: number) {
  const prof = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n);
  let best = 0;
  for (let i = 1; i < prof.length; i++) if (prof[i].y > prof[best].y) best = i;
  return best / n;
}
