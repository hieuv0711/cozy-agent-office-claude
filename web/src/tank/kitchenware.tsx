import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { paintGeometry, tubeThrough } from './geo';
import { cached } from './sdf';
import { C, mix, rng, smoothstep, worley3 } from './util';
import { underwater } from './water';

// Kitchenware that has sunk into the tank and become the creatures' homes:
// a teapot by the octopus, a teacup the axolotl sleeps in, and a ramen bowl
// that fills with gold coins as the money is spent.

/**
 * A smooth lathe from a few control points (radius, height). The profile runs
 * from the bottom centre outwards, up the outside, over the rim and back down
 * the inside, so every face points out of the solid.
 */
export function smoothLathe(pts: [number, number][], n = 120, segments = 72) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  const prof = curve.getSpacedPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  return new THREE.LatheGeometry(prof, segments);
}

/** Paint a lathe by profile position: fn gets the point's index along the profile (0..1). */
function paintLathe(g: THREE.LatheGeometry, n: number, fn: (x: number, y: number, z: number, along: number, out: THREE.Color) => void) {
  return paintGeometry(g, (x, y, z, out, i) => fn(x, y, z, (i % (n + 1)) / n, out));
}

let glazeMat: THREE.MeshPhysicalMaterial | null = null;
/** Glossy glazed ceramic, coloured per vertex. */
export function glaze() {
  if (!glazeMat) glazeMat = underwater(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 }), { caustics: 0.45 });
  return glazeMat;
}

// ---------- the teacup and saucer ----------

const CUP: [number, number][] = [
  [0, 0], [0.24, 0], [0.27, 0.012], [0.28, 0.04], [0.27, 0.07],
  [0.34, 0.1], [0.47, 0.2], [0.58, 0.34], [0.65, 0.5], [0.69, 0.64],
  [0.705, 0.695], [0.69, 0.716], [0.664, 0.7],
  [0.64, 0.62], [0.6, 0.48], [0.52, 0.32], [0.4, 0.19], [0.24, 0.115], [0, 0.1],
];
const SAUCER: [number, number][] = [
  [0, 0], [0.42, 0], [0.45, 0.015], [0.44, 0.04],
  [0.6, 0.05], [0.85, 0.09], [1.0, 0.14], [1.045, 0.168],
  [1.02, 0.184], [0.97, 0.168], [0.8, 0.112], [0.52, 0.076],
  [0.37, 0.086], [0.31, 0.077], [0, 0.072],
];

const blush = C('#f0bcc2');
const cream = C('#f4e9da');
const goldLine = C('#d6a24a');
const dot = C('#fff8f3');

function cupGeometry() {
  const n = 160;
  const g = smoothLathe(CUP, n, 80);
  paintLathe(g, n, (x, y, z, along, out) => {
    const outside = along < 0.52;
    const rim = y > 0.685;
    if (rim) out.copy(goldLine);
    else if (outside) {
      mix(out, blush, cream, smoothstep(0.12, 0.05, y));
      mix(out, out, dot, smoothstep(0.24, 0.15, worley3(x * 9, y * 9, z * 9)) * smoothstep(0.1, 0.16, y));
    } else out.copy(cream);
  });
  return g;
}

function saucerGeometry() {
  const n = 120;
  const g = smoothLathe(SAUCER, n, 80);
  paintLathe(g, n, (x, _y, z, _along, out) => {
    const r = Math.hypot(x, z);
    mix(out, cream, blush, smoothstep(0.78, 0.9, r));
    mix(out, out, goldLine, smoothstep(1.0, 1.035, r));
  });
  return g;
}

function handleGeometry() {
  const pts = [
    [0.6, 0.56, 0],
    [0.84, 0.62, 0],
    [0.96, 0.47, 0],
    [0.87, 0.29, 0],
    [0.47, 0.24, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const tube = tubeThrough(pts, () => 0.045, 40, 10, (_t, _a, out) => out.copy(blush));
  return tube.geometry;
}

/** A big teacup on its saucer, handle to the right (+x). Its rim is at y ≈ 0.79 (times scale). */
export function Teacup({ position, rotation = 0, scale = 1 }: { position: [number, number, number]; rotation?: number; scale?: number }) {
  const cup = useMemo(() => cached('kw-cup', cupGeometry), []);
  const saucer = useMemo(() => cached('kw-saucer', saucerGeometry), []);
  const handle = useMemo(() => cached('kw-cup-handle', handleGeometry), []);
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={saucer} material={glaze()} castShadow receiveShadow />
      <group position={[0, 0.072, 0]}>
        <mesh geometry={cup} material={glaze()} castShadow receiveShadow />
        <mesh geometry={handle} material={glaze()} castShadow />
      </group>
    </group>
  );
}

// ---------- the teapot ----------

const POT: [number, number][] = [
  [0, 0], [0.3, 0], [0.33, 0.015], [0.33, 0.045],
  [0.42, 0.08], [0.54, 0.17], [0.61, 0.32], [0.61, 0.48], [0.55, 0.62], [0.44, 0.72], [0.33, 0.78],
  [0.3, 0.8], [0.302, 0.825], [0.27, 0.832], [0.255, 0.8],
  [0.24, 0.76], [0, 0.75],
];
const LID: [number, number][] = [
  [0, 0.81], [0.22, 0.81], [0.26, 0.82], [0.305, 0.815], [0.312, 0.835],
  [0.28, 0.852], [0.2, 0.885], [0.1, 0.915], [0.05, 0.925], [0.066, 0.945], [0.07, 0.972], [0.045, 0.996], [0, 1.0],
];

const cobalt = C('#2b5aa4');
const deepCobalt = C('#1d3f78');
const porcelain = C('#f6f2ea');

function potPaint(x: number, y: number, z: number, out: THREE.Color) {
  mix(out, deepCobalt, cobalt, smoothstep(0.05, 0.4, y));
  // a pale band round the belly, scattered with little blue dots
  const band = smoothstep(0.34, 0.36, y) * smoothstep(0.52, 0.5, y);
  mix(out, out, porcelain, band);
  mix(out, out, cobalt, band * smoothstep(0.24, 0.14, worley3(x * 11, y * 11, z * 11)));
  // pale foot and rim
  mix(out, out, porcelain, smoothstep(0.035, 0.02, y) + smoothstep(0.79, 0.81, y));
}

function potGeometry() {
  const n = 160;
  const g = smoothLathe(POT, n, 80);
  return paintLathe(g, n, (x, y, z, _a, out) => potPaint(x, y, z, out));
}

function lidGeometry() {
  const n = 100;
  const g = smoothLathe(LID, n, 64);
  return paintLathe(g, n, (_x, y, _z, _a, out) => mix(out, cobalt, porcelain, smoothstep(0.915, 0.93, y)));
}

function spoutGeometry() {
  const pts = [
    [0, 0.26, 0.4],
    [0, 0.36, 0.66],
    [0, 0.5, 0.82],
    [0, 0.66, 0.93],
    [0, 0.73, 0.99],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const tube = tubeThrough(pts, (t) => 0.105 * (1 - t) + 0.042 + 0.014 * smoothstep(0.82, 1, t), 40, 14, (t, _a, out) => (t > 0.94 ? out.copy(porcelain) : out.copy(cobalt)));
  return tube.geometry;
}

function potHandleGeometry() {
  const pts = [
    [0, 0.62, -0.48],
    [0, 0.75, -0.7],
    [0, 0.67, -0.88],
    [0, 0.44, -0.9],
    [0, 0.26, -0.75],
    [0, 0.2, -0.52],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return tubeThrough(pts, () => 0.05, 48, 10, (_t, _a, out) => out.copy(cobalt)).geometry;
}

/** A blue-and-white teapot, spout toward +z. About 1 unit tall at scale 1. */
export function Teapot({ position, rotation = 0, scale = 1 }: { position: [number, number, number]; rotation?: number; scale?: number }) {
  const body = useMemo(() => cached('kw-pot', potGeometry), []);
  const lid = useMemo(() => cached('kw-pot-lid', lidGeometry), []);
  const spout = useMemo(() => cached('kw-pot-spout', spoutGeometry), []);
  const handle = useMemo(() => cached('kw-pot-handle', potHandleGeometry), []);
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={body} material={glaze()} castShadow receiveShadow />
      {/* the lid sits a little askew, nudged by whoever lives inside */}
      <mesh geometry={lid} material={glaze()} rotation={[0.07, 0, -0.05]} position={[0.01, 0.005, 0]} castShadow />
      <mesh geometry={spout} material={glaze()} castShadow />
      <mesh geometry={handle} material={glaze()} castShadow />
    </group>
  );
}

// ---------- the ramen bowl of coins ----------

const BOWL_OUT: [number, number][] = [
  [0, 0], [0.3, 0], [0.33, 0.012], [0.335, 0.05], [0.31, 0.07],
  [0.42, 0.1], [0.6, 0.2], [0.74, 0.34], [0.83, 0.48], [0.87, 0.6], [0.885, 0.64],
];
const BOWL_IN: [number, number][] = [
  [0.885, 0.64], [0.882, 0.662], [0.856, 0.656], [0.83, 0.56], [0.74, 0.4], [0.58, 0.25], [0.38, 0.15], [0, 0.12],
];
const BAND = [0.43, 0.6];

// The classic red band of square spirals round the outside of a ramen bowl.
let bandTex: THREE.CanvasTexture | null = null;
function bandTexture() {
  if (bandTex) return bandTex;
  const tiles = 10;
  const T = 112;
  const c = document.createElement('canvas');
  c.width = tiles * T;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#fbf6ee';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#c23a2c';
  g.fillRect(0, 8, c.width, 112);
  g.strokeStyle = '#fbf6ee';
  g.lineWidth = 10;
  g.lineCap = 'square';
  g.lineJoin = 'miter';
  for (let i = 0; i < tiles; i++) {
    const x = i * T;
    const y = 8;
    g.beginPath();
    g.moveTo(x + 14, y + 98);
    g.lineTo(x + 14, y + 14);
    g.lineTo(x + 98, y + 14);
    g.lineTo(x + 98, y + 98);
    g.lineTo(x + 38, y + 98);
    g.lineTo(x + 38, y + 38);
    g.lineTo(x + 74, y + 38);
    g.lineTo(x + 74, y + 74);
    g.lineTo(x + 56, y + 74);
    g.stroke();
  }
  bandTex = new THREE.CanvasTexture(c);
  bandTex.colorSpace = THREE.SRGBColorSpace;
  bandTex.anisotropy = 4;
  return bandTex;
}

function bowlOuterGeometry() {
  const g = smoothLathe(BOWL_OUT, 100, 96);
  // texture height follows the bowl's height, so the band sits where the red should be
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) - BAND[0]) / (BAND[1] - BAND[0]) * (112 / 128) + 8 / 128);
  return g;
}

function bowlInnerGeometry() {
  const n = 80;
  const white = C('#fbf6ee');
  return paintLathe(smoothLathe(BOWL_IN, n, 96), n, (_x, _y, _z, _a, out) => out.copy(white));
}

const coinGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.012, 20);

/** A ramen bowl heaped with gold coins (the money spent), chopsticks across the top. */
export function RamenBowl({ position, rotation = 0, scale = 1, coins = 110 }: { position: [number, number, number]; rotation?: number; scale?: number; coins?: number }) {
  const outer = useMemo(() => cached('kw-bowl-out', bowlOuterGeometry), []);
  const inner = useMemo(() => cached('kw-bowl-in', bowlInnerGeometry), []);
  const outerMat = useMemo(() => underwater(new THREE.MeshPhysicalMaterial({ map: bandTexture(), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 }), { caustics: 0.45 }), []);
  const coinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.7, roughness: 0.3, emissive: '#7a5200', emissiveIntensity: 0.5 }), []);
  const stickMat = useMemo(() => underwater(new THREE.MeshPhysicalMaterial({ color: '#7d2a22', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }), { caustics: 0.3 }), []);
  const tipMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9b25a', metalness: 0.6, roughness: 0.35 }), []);
  const stick = useMemo(() => new THREE.CylinderGeometry(0.017, 0.028, 1.75, 12).rotateZ(Math.PI / 2), []);
  const tip = useMemo(() => new THREE.CylinderGeometry(0.0285, 0.0285, 0.16, 12).rotateZ(Math.PI / 2), []);
  useEffect(
    () => () => {
      [stick, tip].forEach((g) => g.dispose());
      [outerMat, coinMat, stickMat, tipMat].forEach((m) => m.dispose());
    },
    [stick, tip, outerMat, coinMat, stickMat, tipMat],
  );
  const heap = useRef<THREE.InstancedMesh>(null);
  const spill = 8;
  useLayoutEffect(() => {
    const im = heap.current;
    if (!im) return;
    const r = rng(23);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < coins; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      const mound = 1 - d * d;
      p.set(Math.cos(a) * d * 0.72, 0.3 + 0.5 * mound * (0.55 + 0.45 * (i / coins)) + r() * 0.03, Math.sin(a) * d * 0.72);
      e.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
      im.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    for (let i = 0; i < spill; i++) {
      const a = -1 + r() * 2;
      const dist = 1.0 + r() * 0.35;
      p.set(Math.sin(a) * dist, 0.035 + (i % 3) * 0.011, Math.cos(a) * dist * 0.8);
      e.set((r() - 0.5) * 0.25, r() * Math.PI, (r() - 0.5) * 0.25);
      im.setMatrixAt(coins + i, m.compose(p, q.setFromEuler(e), s));
    }
    im.instanceMatrix.needsUpdate = true;
  }, [coins]);
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={outer} material={outerMat} castShadow receiveShadow />
      <mesh geometry={inner} material={glaze()} receiveShadow />
      <instancedMesh ref={heap} args={[coinGeo, coinMat, coins + spill]} castShadow />
      {/* chopsticks resting across the rim */}
      {[
        [0.06, -0.12, 0.08],
        [-0.07, -0.02, 0.2],
      ].map(([z, yaw, roll], i) => (
        <group key={i} position={[0.1, 0.69 + i * 0.03, z]} rotation={[roll, yaw, 0.02]}>
          <mesh geometry={stick} material={stickMat} castShadow />
          <mesh geometry={tip} material={tipMat} position={[0.78, 0, 0]} />
        </group>
      ))}
    </group>
  );
}
