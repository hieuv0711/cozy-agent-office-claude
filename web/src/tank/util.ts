import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

// Small maths and colour helpers shared by the tank's creatures and plants.

const perlin = new ImprovedNoise();

/** Perlin noise, roughly -1..1. */
export function noise3(x: number, y: number, z: number): number {
  return perlin.noise(x, y, z);
}

export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin.noise(x * freq, y * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

function hash3(i: number, j: number, k: number, salt: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Cellular (Worley) noise: distance to the nearest of one random point per
 * unit cell. Small values make clean round dots: freckles, pores, spots.
 */
export function worley3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const px = cx + hash3(cx, cy, cz, 1) - x;
        const py = cy + hash3(cx, cy, cz, 2) - y;
        const pz = cz + hash3(cx, cy, cz, 3) - z;
        const d = px * px + py * py + pz * pz;
        if (d < best) best = d;
      }
  return Math.sqrt(best);
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A colour in linear working space, from an sRGB hex string. */
export const C = (hex: string) => new THREE.Color(hex);

/** out = a + (b - a) * t, channel by channel (out may be a). */
export function mix(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}
