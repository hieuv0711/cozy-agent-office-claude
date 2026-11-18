import * as THREE from 'three';
import { beginBuild, cacheCheck, checkGeometry, endBuild, takeGeometry } from '../lib/assetCache';

// Sculpting with signed distance functions: creatures are built from soft
// shapes blended together (like clay), then turned into a smooth mesh with
// surface nets. Normals come from the field itself, so the result is smooth.

export type SDF = (x: number, y: number, z: number) => number;
export type V3 = [number, number, number];
export type Paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number, out: THREE.Color) => void;

export function sphere(cx: number, cy: number, cz: number, r: number): SDF {
  return (x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  };
}

export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): SDF {
  return (x, y, z) => {
    const px = (x - cx) / rx;
    const py = (y - cy) / ry;
    const pz = (z - cz) / rz;
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / rx;
    const qy = py / ry;
    const qz = pz / rz;
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}

/** A capsule from a to b whose radius runs from ra to rb. */
export function cone(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number): SDF {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const bb = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - ax;
    const pay = y - ay;
    const paz = z - az;
    let h = (pax * bax + pay * bay + paz * baz) / bb;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = pax - bax * h;
    const dy = pay - bay * h;
    const dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  };
}

/** A ring around the z axis (lips, rims). */
export function torusZ(cx: number, cy: number, cz: number, R: number, r: number): SDF {
  return (x, y, z) => {
    const px = x - cx;
    const py = y - cy;
    const pz = z - cz;
    const q = Math.sqrt(px * px + py * py) - R;
    return Math.sqrt(q * q + pz * pz) - r;
  };
}

/** A chain of tapered capsules through points: tails, branches. */
export function chain(pts: V3[], r0: number, r1: number, k = 0.02): SDF {
  const parts: SDF[] = [];
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    parts.push(cone(a[0], a[1], a[2], b[0], b[1], b[2], r0 + ((r1 - r0) * i) / n, r0 + ((r1 - r0) * (i + 1)) / n));
  }
  // A bounding sphere gives a cheap answer far away (only values near the surface matter).
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of pts) {
    mx += p[0] / pts.length;
    my += p[1] / pts.length;
    mz += p[2] / pts.length;
  }
  let br = 0;
  for (const p of pts) br = Math.max(br, Math.hypot(p[0] - mx, p[1] - my, p[2] - mz));
  br += Math.max(r0, r1);
  return (x, y, z) => {
    const fx = x - mx;
    const fy = y - my;
    const fz = z - mz;
    const far = Math.sqrt(fx * fx + fy * fy + fz * fz) - br;
    if (far > 0.25) return far;
    let d = parts[0](x, y, z);
    for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), k);
    return d;
  };
}

/** A shape with a bounding sphere, so a union can skip it where it can't matter. */
export type Part = { f: SDF; c: V3; r: number };

/** A capsule part with its bounding sphere filled in. */
export function conePart(a: V3, b: V3, ra: number, rb: number): Part {
  const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const r = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(ra, rb);
  return { f: cone(a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), c, r };
}

/**
 * Smooth union of many parts. A part whose bounding sphere is further than the
 * blend width beyond the current distance can't change the result, so it's
 * skipped: branching corals with a hundred limbs stay quick to mesh.
 */
export function unionParts(parts: Part[], k: number): SDF {
  return (x, y, z) => {
    let d = Infinity;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const dx = x - p.c[0];
      const dy = y - p.c[1];
      const dz = z - p.c[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r > d + k) continue;
      const v = p.f(x, y, z);
      d = d === Infinity ? v : smin(d, v, k);
    }
    return d;
  };
}

export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smoothly carve b out of a. */
export function ssub(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a + b), 0) / k;
  return Math.max(a, -b) + h * h * k * 0.25;
}

/** Left and right halves from one: mirror across x = 0. */
export function mirrorX(f: SDF): SDF {
  return (x, y, z) => f(Math.abs(x), y, z);
}

/** Turn a shape about the x axis around a pivot (positive tips +y toward +z). */
export function rotX(f: SDF, py: number, pz: number, a: number): SDF {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y, z) => {
    const dy = y - py;
    const dz = z - pz;
    return f(x, py + dy * c + dz * s, pz - dy * s + dz * c);
  };
}

// The 12 cube edges as corner pairs; corner bits are x | y << 1 | z << 2.
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];

export type MeshOptions = {
  min: V3;
  max: V3;
  cell: number;
  paint?: Paint;
  refine?: number;
  /**
   * How much faster than 1 unit per unit the field may change (noise-displaced
   * shapes change faster). Sampling skips blocks that are this-safely far from
   * the surface, so a bigger number is slower but never misses thin parts.
   */
  lipschitz?: number;
};

/**
 * Sample the field on the grid, exactly only near the surface. Blocks of the
 * grid are tested at their centre: if the surface can't be within two cells of
 * any point in the block, the whole block takes that one value (only its sign
 * matters there). Otherwise the block is split, down to single cells.
 */
function sampleField(sdf: SDF, nx: number, ny: number, nz: number, ox: number, oy: number, oz: number, h: number, L: number) {
  const field = new Float32Array(nx * ny * nz);
  const fill = (i0: number, j0: number, k0: number, i1: number, j1: number, k1: number, v: number) => {
    for (let k = k0; k < k1; k++)
      for (let j = j0; j < j1; j++) {
        const row = nx * (j + ny * k);
        for (let i = i0; i < i1; i++) field[i + row] = v;
      }
  };
  const visit = (i0: number, j0: number, k0: number, s: number) => {
    const i1 = Math.min(i0 + s, nx);
    const j1 = Math.min(j0 + s, ny);
    const k1 = Math.min(k0 + s, nz);
    if (s <= 2) {
      for (let k = k0; k < k1; k++)
        for (let j = j0; j < j1; j++) {
          const row = nx * (j + ny * k);
          for (let i = i0; i < i1; i++) field[i + row] = sdf(ox + i * h, oy + j * h, oz + k * h);
        }
      return;
    }
    const cx = (i0 + i1 - 1) / 2;
    const cy = (j0 + j1 - 1) / 2;
    const cz = (k0 + k1 - 1) / 2;
    const d = sdf(ox + cx * h, oy + cy * h, oz + cz * h);
    const half = 0.5 * h * Math.hypot(i1 - 1 - i0, j1 - 1 - j0, k1 - 1 - k0);
    if (Math.abs(d) > (half + 2 * h) * L) {
      fill(i0, j0, k0, i1, j1, k1, d);
      return;
    }
    const hs = s / 2;
    for (let c = 0; c < 8; c++) {
      const a = i0 + (c & 1) * hs;
      const b = j0 + ((c >> 1) & 1) * hs;
      const e = k0 + ((c >> 2) & 1) * hs;
      if (a < nx && b < ny && e < nz) visit(a, b, e, hs);
    }
  };
  const S = 16;
  for (let k = 0; k < nz; k += S) for (let j = 0; j < ny; j += S) for (let i = 0; i < nx; i += S) visit(i, j, k, S);
  return field;
}

/** Polygonise a field with naive surface nets, then pull vertices onto the surface. */
export function meshSDF(sdf: SDF, o: MeshOptions): THREE.BufferGeometry {
  const h = o.cell;
  const ox = o.min[0] - h;
  const oy = o.min[1] - h;
  const oz = o.min[2] - h;
  const nx = Math.ceil((o.max[0] - o.min[0]) / h) + 3;
  const ny = Math.ceil((o.max[1] - o.min[1]) / h) + 3;
  const nz = Math.ceil((o.max[2] - o.min[2]) / h) + 3;
  const field = sampleField(sdf, nx, ny, nz, ox, oy, oz, h, o.lipschitz ?? 1.4);
  const at = (i: number, j: number, k: number) => field[i + nx * (j + ny * k)];

  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const vid = new Int32Array(cx * cy * cz).fill(-1);
  const P: number[] = [];
  const cv = new Float64Array(8);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e];
          const b = EDGES[e + 1];
          const va = cv[a];
          const vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ax = a & 1;
          const ay = (a >> 1) & 1;
          const az = (a >> 2) & 1;
          sx += ax + ((b & 1) - ax) * t;
          sy += ay + (((b >> 1) & 1) - ay) * t;
          sz += az + (((b >> 2) & 1) - az) * t;
          n++;
        }
        vid[i + cx * (j + cy * k)] = P.length / 3;
        P.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
      }

  const I: number[] = [];
  const cell = (i: number, j: number, k: number) => vid[i + cx * (j + cy * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (flip) I.push(a, c, b, a, d, c);
    else I.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        const a = cell(i, j, k);
        if (a < 0) continue;
        const inside = at(i, j, k) < 0;
        if (j > 0 && k > 0 && inside !== at(i + 1, j, k) < 0) quad(a, cell(i, j - 1, k), cell(i, j - 1, k - 1), cell(i, j, k - 1), !inside);
        if (i > 0 && k > 0 && inside !== at(i, j + 1, k) < 0) quad(a, cell(i, j, k - 1), cell(i - 1, j, k - 1), cell(i - 1, j, k), !inside);
        if (i > 0 && j > 0 && inside !== at(i, j, k + 1) < 0) quad(a, cell(i - 1, j, k), cell(i - 1, j - 1, k), cell(i, j - 1, k), !inside);
      }

  const count = P.length / 3;
  const pos = new Float32Array(P);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const e = h * 0.3;
  const e4 = 4 * e;
  const tmp = new THREE.Color();
  const refine = o.refine ?? 1;
  for (let v = 0; v < count; v++) {
    let x = pos[v * 3];
    let y = pos[v * 3 + 1];
    let z = pos[v * 3 + 2];
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let it = 0; it <= refine; it++) {
      // gradient from four samples at the corners of a tetrahedron
      const a = sdf(x + e, y - e, z - e);
      const b = sdf(x - e, y - e, z + e);
      const c = sdf(x - e, y + e, z - e);
      const d = sdf(x + e, y + e, z + e);
      gx = (a - b - c + d) / e4;
      gy = (-a - b + c + d) / e4;
      gz = (-a + b - c + d) / e4;
      if (it === refine) break;
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-10) break;
      let step = sdf(x, y, z) / g2;
      const lim = (h * 0.6) / Math.sqrt(g2);
      step = step > lim ? lim : step < -lim ? -lim : step;
      x -= gx * step;
      y -= gy * step;
      z -= gz * step;
    }
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
    nor[v * 3] = gx / gl;
    nor[v * 3 + 1] = gy / gl;
    nor[v * 3 + 2] = gz / gl;
    if (o.paint) {
      tmp.setRGB(1, 1, 1);
      o.paint(x, y, z, gx / gl, gy / gl, gz / gl, tmp);
      col[v * 3] = tmp.r;
      col[v * 3 + 1] = tmp.g;
      col[v * 3 + 2] = tmp.b;
    } else col.fill(1, v * 3, v * 3 + 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(count > 65535 ? new THREE.BufferAttribute(new Uint32Array(I), 1) : new THREE.BufferAttribute(new Uint16Array(I), 1));
  g.computeBoundingSphere();
  return g;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** Build a geometry once per key; creatures of one species share it. */
export function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    const t0 = performance.now();
    // built on an earlier visit (lib/assetCache), else built now and kept for the next
    const saved = takeGeometry<THREE.BufferGeometry>(`sdf:${key}`);
    if (saved) {
      g = saved;
      if (cacheCheck.on) checkGeometry(`sdf:${key}`, saved, build());
    } else {
      beginBuild();
      try {
        g = build();
      } finally {
        endBuild(`sdf:${key}`, g);
      }
    }
    cache.set(key, g as THREE.BufferGeometry);
    // Build cost shows up in the browser's performance timeline as "tank:<key>".
    performance.measure(`tank:${key}`, { start: t0, end: performance.now(), detail: { verts: g.attributes.position.count } });
  }
  return g;
}
