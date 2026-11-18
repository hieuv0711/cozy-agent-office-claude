import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Eye } from './Eye';
import { mergeParts, paintGeometry, tubeThrough } from './geo';
import { cached, cone, ellipsoid, meshSDF, mirrorX, type SDF, smin, sphere } from './sdf';
import { SleepZs } from './signs';
import { C, mix, noise3, smoothstep } from './util';
import { skin } from './water';

// The axolotl: wide smiling head, feathery gills, little legs, a long finned
// tail. Idle, it sleeps curled on a shell with its eyes shut.

export type AxolotlPalette = { base: string; back: string; belly: string; mouth: string; blush: string; gill: string; gillTip: string; iris: string };
export const AXOLOTL: AxolotlPalette = { base: '#f3a2b8', back: '#e98aa6', belly: '#fcd6e0', mouth: '#b34d69', blush: '#f2738f', gill: '#d63f6c', gillTip: '#ff96b6', iris: '#1d1418' };

function bodyGeometry(p: AxolotlPalette) {
  const base = C(p.base);
  const back = C(p.back);
  const belly = C(p.belly);
  const mouth = C(p.mouth);
  const blush = C(p.blush);
  const head = ellipsoid(0, 0.2, 0.32, 0.3, 0.17, 0.24);
  const jaw = ellipsoid(0, 0.15, 0.36, 0.27, 0.11, 0.2);
  const torso = cone(0, 0.17, 0.16, 0, 0.16, -0.34, 0.16, 0.13);
  const tailBase = ellipsoid(0, 0.17, -0.47, 0.085, 0.13, 0.22);
  const tailFin = ellipsoid(0, 0.18, -0.76, 0.035, 0.125, 0.3);
  const crest = ellipsoid(0, 0.3, -0.25, 0.022, 0.05, 0.32);
  const eyes = mirrorX(sphere(0.19, 0.27, 0.45, 0.05));
  const frontLeg = mirrorX(cone(0.16, 0.12, 0.17, 0.3, 0.025, 0.25, 0.05, 0.034));
  const frontFoot = mirrorX(ellipsoid(0.32, 0.018, 0.28, 0.055, 0.02, 0.05));
  const backLeg = mirrorX(cone(0.13, 0.12, -0.27, 0.27, 0.025, -0.31, 0.05, 0.034));
  const backFoot = mirrorX(ellipsoid(0.29, 0.018, -0.32, 0.055, 0.02, 0.05));
  const sdf = (x: number, y: number, z: number) => {
    let d = smin(head(x, y, z), jaw(x, y, z), 0.08);
    d = smin(d, torso(x, y, z), 0.12);
    d = smin(d, tailBase(x, y, z), 0.1);
    d = smin(d, tailFin(x, y, z), 0.12);
    d = smin(d, crest(x, y, z), 0.06);
    d = smin(d, eyes(x, y, z), 0.03);
    d = smin(d, Math.min(frontLeg(x, y, z), backLeg(x, y, z)), 0.05);
    return smin(d, Math.min(frontFoot(x, y, z), backFoot(x, y, z)), 0.03);
  };
  const skinMesh = meshSDF(sdf, {
    min: [-0.42, -0.02, -1.08],
    max: [0.42, 0.42, 0.58],
    cell: 0.011,
    paint: (x, y, z, _nx, ny, _nz, out) => {
      mix(out, base, back, smoothstep(0.24, 0.36, y) * smoothstep(0.3, 0.8, ny));
      mix(out, out, belly, smoothstep(0.12, 0.04, y));
      mix(out, out, back, smoothstep(0.35, 0.55, noise3(x * 26, y * 26, z * 26)) * 0.35);
      // rosy cheeks
      const bx = Math.abs(x) - 0.2;
      const by = y - 0.17;
      const bz = z - 0.43;
      mix(out, out, blush, smoothstep(0.07, 0.02, Math.sqrt(bx * bx + by * by + bz * bz)) * 0.55);
    },
  });
  return mergeParts([skinMesh, smileGeometry(sdf, mouth)], ['position', 'normal', 'color']);
}

// The smile is a thin tube laid on the face (a painted line would follow the
// mesh's cells and come out jagged): where the jaws meet, turning up at the ends.
function smileGeometry(sdf: SDF, color: THREE.Color) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const x = -0.19 + (i / 14) * 0.38;
    const y = 0.15 + 1.15 * x * x;
    let lo = 0.2;
    let hi = 0.8;
    if (sdf(x, y, lo) > 0 || sdf(x, y, hi) < 0) continue;
    for (let k = 0; k < 28; k++) {
      const m = (lo + hi) / 2;
      if (sdf(x, y, m) < 0) lo = m;
      else hi = m;
    }
    pts.push(new THREE.Vector3(x, y, hi + 0.0015));
  }
  const tube = tubeThrough(pts, (t) => 0.0062 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.5), 48, 6, (_t, _a, out) => out.copy(color));
  return tube.geometry;
}

// Three feathery gill stalks on one side, rooted at the origin.
function gillGeometry(side: number, p: AxolotlPalette) {
  const gill = C(p.gill);
  const tip = C(p.gillTip);
  const stalks = [
    [[0, 0, 0], [0.04, 0.1, -0.05], [0.07, 0.2, -0.13], [0.08, 0.27, -0.22]],
    [[0, 0, 0], [0.07, 0.03, -0.05], [0.15, 0.05, -0.12], [0.22, 0.05, -0.2]],
    [[0, 0, 0], [0.07, -0.04, -0.04], [0.14, -0.08, -0.1], [0.2, -0.12, -0.17]],
  ];
  const parts: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const s of stalks) {
    const pts = s.map(([x, y, z]) => new THREE.Vector3(x * side, y, z));
    const tube = tubeThrough(pts, (t) => 0.024 * (1 - t) + 0.009, 16, 6, (t, _a, out) => mix(out, gill, tip, t * 0.4));
    parts.push(tube.geometry);
    for (let k = 0; k < 12; k++) {
      const t = 0.18 + k * 0.066;
      const row = Math.round(t * 16);
      for (const w of [-1, 1]) {
        const len = 0.075 * (1 - 0.45 * t);
        const dir = v.copy(tube.B[row]).multiplyScalar(w * 0.85).addScaledVector(tube.N[row], 0.3).addScaledVector(tube.T[row], 0.5).normalize();
        const f = new THREE.ConeGeometry(0.009, len, 5).translate(0, len / 2, 0);
        q.setFromUnitVectors(up, dir);
        f.applyQuaternion(q).translate(tube.pts[row].x, tube.pts[row].y, tube.pts[row].z);
        paintGeometry(f, (_x, _y, _z, out) => mix(out, gill, tip, 0.5 + 0.5 * t));
        parts.push(f);
      }
    }
  }
  return mergeParts(parts, ['position', 'normal', 'color']);
}

export function Axolotl({ position, rotation = 0, palette = AXOLOTL, asleep = true }: { position: [number, number, number]; rotation?: number; palette?: AxolotlPalette; asleep?: boolean }) {
  const body = useMemo(() => cached(`axolotl:${palette.base}`, () => bodyGeometry(palette)), [palette]);
  const gills = useMemo(() => [cached(`axolotl-gill-l:${palette.gill}`, () => gillGeometry(1, palette)), cached(`axolotl-gill-r:${palette.gill}`, () => gillGeometry(-1, palette))], [palette]);
  const mat = useMemo(() => skin({ roughness: 0.42, sheen: 0.7, clearcoat: 0.45 }), []);
  const gillMat = useMemo(() => skin({ roughness: 0.55, sheen: 0.8, clearcoat: 0.1 }), []);
  const bodyRef = useRef<THREE.Group>(null);
  const gl = useRef<THREE.Mesh>(null);
  const gr = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const breath = Math.sin(t * (asleep ? 1.0 : 1.6));
    if (bodyRef.current) bodyRef.current.scale.set(1 + breath * 0.012, 1 + breath * 0.025, 1);
    const sway = Math.sin(t * (asleep ? 0.9 : 1.8)) * 0.12;
    if (gl.current) gl.current.rotation.set(sway * 0.5, sway, sway * 0.6);
    if (gr.current) gr.current.rotation.set(sway * 0.5, -sway, -sway * 0.6);
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={bodyRef}>
        <mesh geometry={body} material={mat} castShadow receiveShadow />
        <Eye position={[0.2, 0.28, 0.47]} r={0.05} rotation={[0, 0.5, 0]} lid={palette.base} iris={palette.iris} closed={asleep} />
        <Eye position={[-0.2, 0.28, 0.47]} r={0.05} rotation={[0, -0.5, 0]} lid={palette.base} iris={palette.iris} closed={asleep} />
        <mesh ref={gl} geometry={gills[0]} material={gillMat} position={[0.24, 0.25, 0.22]} />
        <mesh ref={gr} geometry={gills[1]} material={gillMat} position={[-0.24, 0.25, 0.22]} />
      </group>
      {asleep && <SleepZs position={[0.15, 0.55, 0.45]} />}
    </group>
  );
}
