import * as THREE from 'three';
import type { SDF } from '../../tank/sdf';

// Small signed-distance pieces for sculpting the office's soft things
// (cushions, upholstered shells, leather, pillows) with ../../tank/sdf's
// mesher: rounded boxes, swelling cushions, capsules, a smooth union, an
// ambient-occlusion estimate for darkening creases, and box-projected UVs for
// the meshes it makes (which come without any).

/** Distance to a rounded box centred at the origin (half sizes, corner radius). */
export function sdRBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number) {
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  const qz = Math.abs(z) - hz + r;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** A rounded box: centre, half sizes, corner radius. */
export function rbox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number): SDF {
  return (x, y, z) => sdRBox(x - cx, y - cy, z - cz, hx, hy, hz, r);
}

/**
 * A cushion: a rounded box whose half height swells by `puff` toward its
 * middle, optionally tilted about x through its centre (positive leans the
 * top back, toward -z).
 */
export function cushion(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number, puff: number, tilt = 0): SDF {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return (x, y, z) => {
    const dy = y - cy;
    const dz = z - cz;
    const ly = dy * c - dz * s;
    const lz = dy * s + dz * c;
    const u = Math.min(1, Math.abs(x - cx) / hx);
    const v = Math.min(1, Math.abs(lz) / hz);
    const h = hy + puff * (1 - u * u) * (1 - v * v);
    return sdRBox(x - cx, ly, lz, hx, h, hz, Math.min(r, h - 0.002));
  };
}

/** A capsule along z at (x0, y0) from z0 to z1. */
export function capsuleZ(x0: number, y0: number, z0: number, z1: number, r: number): SDF {
  return (x, y, z) => {
    const cz = Math.max(z0, Math.min(z1, z));
    return Math.hypot(x - x0, y - y0, z - cz) - r;
  };
}

export function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Darker in the creases: how much open space there is a little way out along the normal (0 in a fold, 1 in the open). */
export function occlusion(f: SDF, x: number, y: number, z: number, nx: number, ny: number, nz: number, reach = 0.06) {
  return Math.max(0, Math.min(1, f(x + nx * reach, y + ny * reach, z + nz * reach) / reach));
}

/** Box-projected UVs for an organic mesh: each vertex takes the plane its normal faces most. */
export function boxProject(g: THREE.BufferGeometry, s: number) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : az >= ax ? [p.getX(i), p.getY(i)] : [p.getZ(i), p.getY(i)];
    uv[i * 2] = u * s;
    uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
