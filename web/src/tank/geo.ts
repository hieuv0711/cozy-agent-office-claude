import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Geometry builders: tapered tubes (arms, stalks, tentacles), fins and blades.

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A tube whose radius tapers along its length. Frames are carried along by
 * parallel transport so the tube never twists; ring angle 0 stays on the
 * "up" side, which lets arms keep a darker top and a lighter underside.
 */
export class Tube {
  readonly geometry = new THREE.BufferGeometry();
  readonly pts: THREE.Vector3[];
  readonly T: THREE.Vector3[];
  readonly N: THREE.Vector3[];
  readonly B: THREE.Vector3[];
  private pos: Float32Array;
  private nor: Float32Array;

  constructor(
    readonly segments: number,
    readonly radial: number,
    readonly radius: (t: number) => number,
    paint?: (t: number, angle: number, out: THREE.Color) => void,
  ) {
    const rows = segments + 1;
    const cols = radial + 1;
    this.pos = new Float32Array(rows * cols * 3);
    this.nor = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const col = new Float32Array(rows * cols * 3);
    const tmp = new THREE.Color();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        uv[i * 2] = c / radial;
        uv[i * 2 + 1] = r / segments;
        tmp.setRGB(1, 1, 1);
        paint?.(r / segments, (c / radial) * Math.PI * 2, tmp);
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
    const idx: number[] = [];
    for (let r = 0; r < segments; r++)
      for (let c = 0; c < radial; c++) {
        const a = r * cols + c;
        const b = (r + 1) * cols + c;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geometry.setIndex(idx);
    this.pts = Array.from({ length: rows }, () => new THREE.Vector3());
    this.T = Array.from({ length: rows }, () => new THREE.Vector3());
    this.N = Array.from({ length: rows }, () => new THREE.Vector3());
    this.B = Array.from({ length: rows }, () => new THREE.Vector3());
  }

  /** Re-shape the tube from a path function t (0..1) -> point. */
  update(path: (t: number, out: THREE.Vector3) => void, bounds = false) {
    const { segments, radial, pts, T, N, B, pos, nor } = this;
    const rows = segments + 1;
    for (let r = 0; r < rows; r++) path(r / segments, pts[r]);
    for (let r = 0; r < rows; r++) T[r].subVectors(pts[Math.min(rows - 1, r + 1)], pts[Math.max(0, r - 1)]).normalize();
    N[0].copy(UP).addScaledVector(T[0], -UP.dot(T[0]));
    if (N[0].lengthSq() < 1e-6) N[0].set(0, 0, 1).addScaledVector(T[0], -T[0].z);
    N[0].normalize();
    B[0].crossVectors(T[0], N[0]);
    for (let r = 1; r < rows; r++) {
      N[r].copy(N[r - 1]).addScaledVector(T[r], -N[r - 1].dot(T[r])).normalize();
      B[r].crossVectors(T[r], N[r]);
    }
    const cols = radial + 1;
    for (let r = 0; r < rows; r++) {
      const rad = this.radius(r / segments);
      const p = pts[r];
      for (let c = 0; c < cols; c++) {
        const a = (c / radial) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = N[r].x * ca + B[r].x * sa;
        const ny = N[r].y * ca + B[r].y * sa;
        const nz = N[r].z * ca + B[r].z * sa;
        const i = (r * cols + c) * 3;
        pos[i] = p.x + nx * rad;
        pos[i + 1] = p.y + ny * rad;
        pos[i + 2] = p.z + nz * rad;
        nor[i] = nx;
        nor[i + 1] = ny;
        nor[i + 2] = nz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    if (bounds) this.geometry.computeBoundingSphere();
  }
}

/** A fixed tapered tube through points (Catmull-Rom smoothed). */
export function tubeThrough(points: THREE.Vector3[], radius: (t: number) => number, segments = 24, radial = 8, paint?: (t: number, angle: number, out: THREE.Color) => void): Tube {
  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new Tube(segments, radial, radius, paint);
  tube.update((t, out) => curve.getPointAt(t, out), true);
  return tube;
}

let finTex: THREE.CanvasTexture | null = null;

/** Fin membrane: soft rays fanning from the root, more see-through at the edge. */
export function finTexture(): THREE.Texture {
  if (finTex) return finTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)');
  rg.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineCap = 'round';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 10, 128 + Math.sin(a) * 10);
    g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
    g.stroke();
  }
  finTex = new THREE.CanvasTexture(c);
  finTex.colorSpace = THREE.SRGBColorSpace;
  return finTex;
}

/** A fan fin rooted at the origin in the xy plane, from angle a0 to a1, with a scalloped edge. */
export function fanFin(radius: number, a0: number, a1: number, rays = 8): THREE.BufferGeometry {
  const segs = 48;
  const g = new THREE.CircleGeometry(radius, segs, a0, a1 - a0);
  const p = g.attributes.position;
  for (let i = 1; i < p.count; i++) {
    const f = (i - 1) / segs;
    const k = 1 - 0.09 * (1 - Math.abs(Math.cos(f * rays * Math.PI)));
    p.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  return g;
}

/** Membrane material for fins: tinted, translucent, both sides. */
export function finMaterial(color: string, opacity = 0.85) {
  return new THREE.MeshStandardMaterial({
    color,
    map: finTexture(),
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    roughness: 0.35,
    depthWrite: false,
  });
}

/**
 * A long leaf (kelp blade, seagrass) growing along +y in the xy plane, with a
 * ruffled edge. aFlutter is 0 on the midrib and 1 at the edges and tip.
 */
export function blade(len: number, width: number, o: { segs?: number; across?: number; ruffle?: number; curl?: number; tip?: number; freq?: number; phase?: number } = {}): THREE.BufferGeometry {
  const S = o.segs ?? 12;
  const A = o.across ?? 4;
  const ruffle = o.ruffle ?? 0.02;
  const curl = o.curl ?? 0.08;
  const freq = o.freq ?? 26;
  const phase = o.phase ?? 0;
  const pos: number[] = [];
  const uv: number[] = [];
  const fl: number[] = [];
  for (let s = 0; s <= S; s++) {
    const u = s / S;
    const w = width * Math.pow(Math.sin(Math.PI * (0.05 + 0.95 * u * (o.tip ?? 0.97))), 0.7) * (1 - 0.25 * u);
    for (let a = 0; a <= A; a++) {
      const v = (a / A) * 2 - 1;
      const edge = Math.pow(Math.abs(v), 1.6);
      // the two edges ripple out of step, like a lasagna noodle
      pos.push(v * w, u * len, ruffle * Math.sin(u * freq * len + phase + (v > 0 ? 0 : 1.9)) * edge + curl * u * u);
      uv.push(a / A, u);
      fl.push(Math.max(edge, u * u) * u);
    }
  }
  const idx: number[] = [];
  const cols = A + 1;
  for (let s = 0; s < S; s++)
    for (let a = 0; a < A; a++) {
      const i = s * cols + a;
      idx.push(i, i + 1, i + cols, i + cols, i + 1, i + cols + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlutter', new THREE.Float32BufferAttribute(fl, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Give every vertex a colour from its position and normal. */
export function paintGeometry(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color, i: number) => void) {
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

/** Set (or add) a per-vertex float attribute. */
export function setAttr(g: THREE.BufferGeometry, name: string, fn: (x: number, y: number, z: number, i: number) => number) {
  const p = g.attributes.position;
  const a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = fn(p.getX(i), p.getY(i), p.getZ(i), i);
  g.setAttribute(name, new THREE.BufferAttribute(a, 1));
  return g;
}

/** Merge parts that may have different attribute sets (missing ones are filled with defaults). */
export function mergeParts(parts: THREE.BufferGeometry[], names = ['position', 'normal', 'color', 'aSway', 'aFlutter']): THREE.BufferGeometry {
  const ready = parts.map((src) => {
    const g = src.clone();
    for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    const count = g.attributes.position.count;
    for (const n of names) {
      if (g.attributes[n]) continue;
      const size = n === 'color' || n === 'normal' ? 3 : 1;
      const fill = n === 'color' ? 1 : 0;
      g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(count * size).fill(fill), size));
    }
    if (!g.index) {
      const idx = Array.from({ length: count }, (_, i) => i);
      g.setIndex(idx);
    }
    return g;
  });
  const out = mergeGeometries(ready, false);
  if (!out) throw new Error('mergeParts: geometries do not match');
  out.computeBoundingSphere();
  return out;
}
