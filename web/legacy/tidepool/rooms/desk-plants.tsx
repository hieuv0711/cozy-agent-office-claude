import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeParts, paintGeometry } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { noise3, smoothstep, worley3 } from '../../tank/util';
import { material, metals, paintLathe, pick, rand, rimAlong } from './desk-kit';

// Plants for the Night desk: a snake plant in a glazed planter, and a small
// echeveria rosette in a terracotta pot.

// ---------- pots and soil ----------

const PLANTER: [number, number][] = [
  [0, 0],
  [0.4, 0],
  [0.44, 0.02],
  [0.46, 0.07],
  [0.49, 0.55],
  [0.51, 0.64],
  [0.54, 0.7],
  [0.53, 0.76],
  [0.495, 0.765],
  [0.475, 0.7],
  [0.46, 0.12],
  [0, 0.1],
];

const POT_GLAZES = [
  ['#e6dccb', '#7a6a58'],
  ['#2e3a3f', '#8a9aa0'],
  ['#5f7d6a', '#2a3a30'],
  ['#b9603d', '#7a3a22'],
] as const;

function planterGeometry(glaze: string, fleck: string, scale = 1) {
  const n = 120;
  const pts = PLANTER.map(([r, y]) => [r * scale, y * scale] as [number, number]);
  const g = smoothLathe(pts, n, 72);
  const rim = rimAlong(pts, n);
  const G = new THREE.Color(glaze);
  const F = new THREE.Color(fleck);
  const inside = G.clone().multiplyScalar(0.5);
  return paintLathe(g, n, (x, y, z, along, out) => {
    out.copy(G);
    // speckles, and a band where the glaze breaks over the rim
    if (worley3(x * 26, y * 26, z * 26) < 0.11) out.lerp(F, 0.7);
    out.lerp(F, smoothstep(0.66 * scale, 0.74 * scale, y) * 0.25);
    if (y < 0.05 * scale) out.lerp(new THREE.Color('#8a7660'), 0.6);
    if (along > rim + 0.02) out.copy(inside);
  });
}

/** A disc of soil with some grit in it. */
function soilGeometry(r: number) {
  const g = new THREE.CircleGeometry(r, 40, 0, Math.PI * 2).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, noise3(p.getX(i) * 9, 0, p.getZ(i) * 9) * 0.012);
  g.computeVertexNormals();
  const dark = new THREE.Color('#2a1d14');
  const light = new THREE.Color('#5a4433');
  return paintGeometry(g, (x, _y, z, out) => out.copy(dark).lerp(light, smoothstep(0.1, 0.4, noise3(x * 30, 2, z * 30)) * 0.8 + (worley3(x * 40, 0, z * 40) < 0.15 ? 0.4 : 0)));
}

// ---------- the snake plant ----------

/** One sword leaf along +y: banded dark green, cupped across, twisting slightly; yellow edges if `edged`. */
function swordLeaf(len: number, wid: number, twist: number, edged: boolean, seed: number) {
  const S = 90;
  const A = 10;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const dark = new THREE.Color('#183421');
  const band = new THREE.Color('#7aa064');
  const edge = new THREE.Color('#d9c96c');
  const base = new THREE.Color('#c9c49c');
  const dry = new THREE.Color('#7a6240');
  const c = new THREE.Color();
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    // narrow at the soil, broadest a third of the way up, drawn out to a long point
    const w = wid * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * Math.pow(1 - Math.pow(t, 2.2), 0.8) + 0.004;
    const tw = twist * t;
    for (let a = 0; a <= A; a++) {
      const v = (a / A) * 2 - 1;
      const x0 = (v * w) / 2;
      const z0 = 0.42 * v * v * w;
      const x = x0 * Math.cos(tw) - z0 * Math.sin(tw);
      const z = x0 * Math.sin(tw) + z0 * Math.cos(tw);
      pos.push(x, t * len, z);
      // thin wavy cross bands of pale green on dark green
      const zig = Math.sin(t * len * 24 + Math.abs(v) * 3.2 + noise3(t * 9, v * 2, seed) * 2.6);
      c.copy(dark).lerp(band, smoothstep(0.62, 0.92, zig) * 0.7 + smoothstep(0.2, 0.9, noise3(t * 40, v * 3, seed + 4)) * 0.12);
      if (edged && Math.abs(v) > 0.8) c.copy(edge).lerp(dark, smoothstep(0.8, 0.72, Math.abs(v)));
      c.lerp(base, smoothstep(0.05, 0.0, t) * 0.8);
      c.lerp(dry, smoothstep(0.96, 1.0, t));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let s = 0; s < S; s++)
    for (let a = 0; a < A; a++) {
      const i = s * (A + 1) + a;
      idx.push(i, i + A + 1, i + 1, i + 1, i + A + 1, i + A + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A snake plant (Sansevieria): six to nine banded sword leaves in a speckled glazed planter. */
export function SnakePlant({ seed }: { seed: number }) {
  const r = rand(seed);
  const [glaze, fleck] = pick(r, POT_GLAZES);
  const edged = r() < 0.5;
  const geo = useMemo(() => {
    const rr = rand(seed * 3 + 1);
    const n = 10 + Math.floor(rr() * 4);
    const leaves: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const len = 2.3 + rr() * 1.3 - (i % 3 === 2 ? 0.7 : 0);
      const leaf = swordLeaf(len, 0.3 + rr() * 0.14, (rr() - 0.5) * 1.1, edged, seed + i);
      const a = (i / n) * Math.PI * 2 + rr() * 0.5;
      const rad = 0.03 + rr() * 0.17;
      const tilt = 0.05 + rr() * 0.16;
      // the cupped face (+z) turns toward the middle, the leaf leans outward
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2 + (rr() - 0.5) * 0.7);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad), q, new THREE.Vector3(1, 1, 1));
      leaves.push(leaf.applyMatrix4(m));
    }
    return { pot: planterGeometry(glaze, fleck), leaves: mergeParts(leaves, ['position', 'normal', 'color']), soil: soilGeometry(0.47) };
  }, [seed, glaze, fleck, edged]);
  const m = metals();
  const leafMat = material('plant:leaf', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, side: THREE.DoubleSide }));
  return (
    <group>
      <mesh geometry={geo.pot} material={m.glaze} castShadow receiveShadow />
      <mesh geometry={geo.soil} material={m.matte} position={[0, 0.66, 0]} receiveShadow />
      <mesh geometry={geo.leaves} material={leafMat} position={[0, 0.62, 0]} castShadow receiveShadow />
    </group>
  );
}

// ---------- the echeveria ----------

const TERRACOTTA: [number, number][] = [
  [0, 0],
  [0.3, 0],
  [0.33, 0.02],
  [0.34, 0.05],
  [0.4, 0.42],
  [0.45, 0.44],
  [0.46, 0.5],
  [0.45, 0.56],
  [0.41, 0.56],
  [0.4, 0.5],
  [0.38, 0.44],
  [0.3, 0.1],
  [0, 0.08],
];

function terracottaGeometry() {
  const n = 100;
  const g = smoothLathe(TERRACOTTA, n, 64);
  const rim = rimAlong(TERRACOTTA, n);
  const clay = new THREE.Color('#b8653f');
  const pale = new THREE.Color('#d9a17a');
  return paintLathe(g, n, (x, y, z, along, out) => {
    out.copy(clay).lerp(pale, smoothstep(0.1, 0.5, noise3(x * 7, y * 7, z * 7)) * 0.35);
    // a chalky bloom of salts near the rim
    out.lerp(new THREE.Color('#e8dccd'), smoothstep(0.42, 0.55, y) * 0.2 * (noise3(x * 20, y * 20, z * 20) * 0.5 + 0.5));
    if (along > rim + 0.03) out.multiplyScalar(0.55);
  });
}

/** A fleshy, pointed echeveria leaf along +y, cupped upward (+z), blushing at the tip. */
function fleshyLeaf() {
  const n = 40;
  const g = smoothLathe(
    [
      [0, 0],
      [0.05, 0.02],
      [0.1, 0.1],
      [0.125, 0.21],
      [0.115, 0.32],
      [0.07, 0.41],
      [0, 0.46],
    ],
    n,
    20,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const z = p.getZ(i) * 0.4;
    // cupped, and curving up at the tip (-z is the leaf's upper side once it is tipped outward)
    p.setZ(i, z - 0.35 * y * y - Math.abs(p.getX(i)) * 0.25);
  }
  g.computeVertexNormals();
  const base = new THREE.Color('#b9cfc2');
  const tip = new THREE.Color('#d9707f');
  return paintLathe(g, n, (_x, y, _z, _a, out) => out.copy(base).lerp(tip, smoothstep(0.32, 0.46, y)));
}

const ROSETTE_TINTS = ['#8fb8aa', '#b49ec0', '#97c08c'] as const;

/** A small echeveria rosette in a terracotta pot (tint by seed). */
export function Succulent({ seed }: { seed: number }) {
  const tint = pick(rand(seed), ROSETTE_TINTS);
  const geo = useMemo(() => ({ pot: terracottaGeometry(), leaf: fleshyLeaf(), soil: soilGeometry(0.39) }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 34;
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const r = rand(seed + 5);
    const mtx = new THREE.Matrix4();
    const qy = new THREE.Quaternion();
    const qx = new THREE.Quaternion();
    const c = new THREE.Color();
    const T = new THREE.Color(tint);
    for (let i = 0; i < count; i++) {
      const k = i / count;
      const a = i * 2.39996 + r() * 0.1;
      const rad = 0.02 + 0.2 * Math.sqrt(k);
      const tilt = 0.25 + 1.05 * k;
      qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
      qx.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
      const s = 0.42 + 0.75 * k;
      mtx.compose(new THREE.Vector3(Math.cos(a) * rad, 0.58 - k * 0.04, Math.sin(a) * rad), qy.multiply(qx), new THREE.Vector3(s, s, s));
      im.setMatrixAt(count - 1 - i, mtx);
      c.copy(T).multiplyScalar(0.92 + r() * 0.16);
      im.setColorAt(count - 1 - i, c);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }, [seed, tint]);
  const m = metals();
  const leafMat = material('succulent:leaf', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#e8f0ea'), sheenRoughness: 0.6 }));
  const clay = material('succulent:clay', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }));
  return (
    <group>
      <mesh geometry={geo.pot} material={clay} castShadow receiveShadow />
      <mesh geometry={geo.soil} material={m.matte} position={[0, 0.5, 0]} receiveShadow />
      <instancedMesh ref={ref} args={[geo.leaf, leafMat, count]} castShadow />
    </group>
  );
}
