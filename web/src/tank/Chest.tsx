import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cached, meshSDF, type SDF, ssub } from './sdf';
import { C, mix, noise3, rng, smoothstep, worley3 } from './util';
import { underwater } from './water';

// The treasure chest: the money spent, kept as treasure. Plank walls held by
// iron bands and rivets, a gold lock plate, a curved lid thrown open, and a
// heap of coins (more coins for more spend) with pearls on top and a few
// spilled on the sand.

/** A box with rounded edges. */
function roundBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number): SDF {
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r;
    const qy = Math.abs(y - cy) - hy + r;
    const qz = Math.abs(z - cz) - hz + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

const W = 0.4; // half width (x)
const H = 0.2; // half height of the box (y)
const D = 0.26; // half depth (z)
const BAND_X = 0.27;

const wood = C('#7b4a2b');
const woodDark = C('#5a321c');
const woodLight = C('#9a6238');
const iron = C('#3a3a40');
const rivet = C('#8c8c92');
const gold = C('#e2b146');

/** Planks, grain and iron bands, shared by the box and the lid. */
function paintWood(x: number, y: number, z: number, along: number, out: THREE.Color) {
  const plank = Math.floor(along * 6.5);
  const f = along * 6.5 - plank;
  const tone = noise3(plank * 3.1, 0.5, 0.5);
  mix(out, wood, tone > 0 ? woodLight : woodDark, Math.abs(tone) * 0.9);
  // grain runs along the planks
  mix(out, out, woodDark, smoothstep(0.1, 0.5, noise3(x * 3, along * 40, z * 3)) * 0.35);
  // dark seams between planks
  mix(out, out, woodDark, smoothstep(0.1, 0.0, Math.min(f, 1 - f)) * 0.85);
  // iron bands with rivets
  const band = smoothstep(0.05, 0.04, Math.abs(Math.abs(x) - BAND_X));
  mix(out, out, iron, band);
  mix(out, out, rivet, band * smoothstep(0.22, 0.12, worley3(x * 30, y * 30, z * 30)));
}

function boxGeometry() {
  const outer = roundBox(0, H, 0, W, H, D, 0.035);
  const inner = roundBox(0, H + 0.12, 0, W - 0.045, H, D - 0.045, 0.02);
  const sdf: SDF = (x, y, z) => {
    let d = ssub(outer(x, y, z), inner(x, y, z), 0.012);
    // the iron bands stand a little proud of the wood
    d -= 0.007 * smoothstep(0.05, 0.04, Math.abs(Math.abs(x) - BAND_X));
    return d;
  };
  return meshSDF(sdf, {
    min: [-W - 0.03, -0.02, -D - 0.03],
    max: [W + 0.03, 2 * H + 0.03, D + 0.03],
    cell: 0.0085,
    lipschitz: 1.6,
    paint: (x, y, z, _nx, _ny, nz, out) => {
      paintWood(x, y, z, y, out);
      // the lock plate on the front
      if (nz > 0.6) mix(out, out, gold, smoothstep(0.075, 0.065, Math.abs(x)) * smoothstep(0.24, 0.25, y) * smoothstep(0.39, 0.38, y));
    },
  });
}

// The lid in its own frame: the hinge is the x axis at the origin, and closed
// it would curve over the box from the hinge (back) to the front.
function lidGeometry() {
  const R = D + 0.01;
  const shell: SDF = (x, y, z) => {
    const cyl = Math.max(Math.hypot(y, z - D) - R, Math.abs(x) - W - 0.005);
    const hollow = Math.max(Math.hypot(y, z - D) - (R - 0.04), Math.abs(x) - W + 0.04);
    return Math.max(ssub(cyl, hollow, 0.01), -y);
  };
  const sdf: SDF = (x, y, z) => shell(x, y, z) - 0.007 * smoothstep(0.05, 0.04, Math.abs(Math.abs(x) - BAND_X));
  return meshSDF(sdf, {
    min: [-W - 0.03, -0.02, -0.04],
    max: [W + 0.03, R + 0.03, 2 * D + 0.04],
    cell: 0.0085,
    lipschitz: 1.6,
    paint: (x, y, z, _nx, _ny, _nz, out) => paintWood(x, y, z, Math.atan2(y, z - D) * 0.35, out),
  });
}

const coinGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.012, 20);
const pearlGeo = new THREE.SphereGeometry(1, 20, 14);

export function Chest({ position, rotation = 0, coins = 70 }: { position: [number, number, number]; rotation?: number; coins?: number }) {
  const body = useMemo(() => cached('chest-box', boxGeometry), []);
  const lid = useMemo(() => cached('chest-lid', lidGeometry), []);
  const woodMat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), { caustics: 0.5 }), []);
  const coinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.7, roughness: 0.3, emissive: '#7a5200', emissiveIntensity: 0.5 }), []);
  const pearlMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#eadfd2', roughness: 0.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 600], sheen: 1, sheenColor: new THREE.Color('#ffd9ec'), emissive: '#fff1de', emissiveIntensity: 0.06 }), []);
  const heap = useRef<THREE.InstancedMesh>(null);
  const spill = 9;

  // The heap: coins stacked into a mound inside the box, a few spilled in front.
  useLayoutEffect(() => {
    const im = heap.current;
    if (!im) return;
    const r = rng(41);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < coins; i++) {
      const u = (r() * 2 - 1) * 0.92;
      const v = (r() * 2 - 1) * 0.86;
      const mound = Math.max(0, 1 - u * u - v * v);
      p.set(u * (W - 0.07), 0.2 + 0.2 * mound * (0.6 + 0.4 * (i / coins)) + r() * 0.03, v * (D - 0.07));
      e.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
      im.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    for (let i = 0; i < spill; i++) {
      const a = -0.9 + r() * 1.8;
      const dist = 0.36 + r() * 0.35;
      p.set(Math.sin(a) * dist * 0.9, 0.035 + (i % 3) * 0.011, D + 0.04 + Math.cos(a) * dist * 0.45);
      e.set((r() - 0.5) * 0.25, r() * Math.PI, (r() - 0.5) * 0.25);
      im.setMatrixAt(coins + i, m.compose(p, q.setFromEuler(e), s));
    }
    im.instanceMatrix.needsUpdate = true;
  }, [coins]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={body} material={woodMat} castShadow receiveShadow />
      {/* thrown open, leaning back past upright */}
      <group position={[0, 2 * H, -D]} rotation={[-1.85, 0, 0]}>
        <mesh geometry={lid} material={woodMat} castShadow />
      </group>
      <instancedMesh ref={heap} args={[coinGeo, coinMat, coins + spill]} castShadow />
      {(
        [
          [-0.12, 0.43, 0.02, 0.05],
          [0.08, 0.42, -0.06, 0.045],
          [0.2, 0.37, 0.08, 0.04],
          [0.3, 0.04, D + 0.22, 0.038],
          [-0.26, 0.04, D + 0.3, 0.034],
        ] as [number, number, number, number][]
      ).map(([x, y, z, s], i) => (
        <mesh key={i} geometry={pearlGeo} material={pearlMat} position={[x, y + s * 0.5, z]} scale={s} castShadow />
      ))}
    </group>
  );
}
