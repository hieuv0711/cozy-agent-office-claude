import { useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Eye } from './Eye';
import { Tube } from './geo';
import { cached, cone, ellipsoid, meshSDF, mirrorX, rotX, smin, sphere } from './sdf';
import { C, mix, smoothstep, worley3 } from './util';
import { skin, underwater } from './water';

// The octopus: a soft sculpted head and mantle, eight tapering arms that curl
// at the tips, suckers underneath. Two arms can work (lift and place pebbles).

export type OctopusPalette = { top: string; base: string; under: string; spot: string; sucker: string; iris: string };
export const OCTOPUS: OctopusPalette = { top: '#c24d3d', base: '#e3745d', under: '#f7b8a1', spot: '#ffc9b4', sucker: '#fadfcd', iris: '#5a3420' };

function bodyGeometry(p: OctopusPalette) {
  const top = C(p.top);
  const base = C(p.base);
  const under = C(p.under);
  const spot = C(p.spot);
  const head = ellipsoid(0, 0.42, 0.06, 0.36, 0.3, 0.33);
  const mantle = rotX(ellipsoid(0, 0.8, -0.18, 0.4, 0.48, 0.4), 0.8, -0.18, -0.4);
  const skirt = ellipsoid(0, 0.17, 0.02, 0.36, 0.14, 0.36);
  const eyes = mirrorX(sphere(0.21, 0.5, 0.24, 0.12));
  const siphon = cone(0.3, 0.32, -0.02, 0.43, 0.27, 0.06, 0.065, 0.045);
  const sdf = (x: number, y: number, z: number) => {
    let d = smin(head(x, y, z), mantle(x, y, z), 0.2);
    d = smin(d, skirt(x, y, z), 0.14);
    d = smin(d, eyes(x, y, z), 0.07);
    return smin(d, siphon(x, y, z), 0.04);
  };
  return meshSDF(sdf, {
    min: [-0.52, -0.02, -0.76],
    max: [0.52, 1.42, 0.46],
    cell: 0.014,
    paint: (x, y, z, _nx, _ny, _nz, out) => {
      mix(out, under, base, smoothstep(0.1, 0.4, y));
      mix(out, out, top, smoothstep(0.7, 1.25, y) * 0.75);
      // a sprinkle of pale freckles over the mantle
      mix(out, out, spot, smoothstep(0.3, 0.19, worley3(x * 7 + 11, y * 7, z * 7)) * smoothstep(0.6, 0.85, y) * 0.55);
      const ex = Math.abs(x) - 0.21;
      const ey = y - 0.5;
      const ez = z - 0.24;
      mix(out, out, under, smoothstep(0.17, 0.12, Math.sqrt(ex * ex + ey * ey + ez * ez)) * 0.45);
    },
  });
}

const SEG = 36;
const RAD = 10;
const SUCKERS = 11;
const armRadius = (s: number) => 0.085 * Math.pow(1 - s, 0.85) + 0.011;

function armPoint(i: number, time: number, s: number, work: boolean, out: THREE.Vector3) {
  const theta = ((i + 0.5) / 8) * Math.PI * 2;
  const len = 0.92 + (i % 3) * 0.08;
  let ang = theta + Math.sin(time * 1.1 + i * 1.7 + s * 3.5) * 0.16 * s;
  let reach = 0.22 + s * len;
  let y = 0.035 + 0.12 * (1 - smoothstep(0, 0.32, s));
  let curl = 2.3 + 0.7 * Math.sin(time * 0.8 + i * 2.1);
  if (work) {
    const lift = 0.5 + 0.5 * Math.sin(time * 1.2 + i * 1.3);
    y += (0.1 + 0.32 * lift) * smoothstep(0.15, 0.9, s);
    curl = 1.2 + 0.6 * lift;
    ang = theta + Math.sin(time * 0.9 + i) * 0.1 * s;
  }
  const c0 = 0.6;
  if (s > c0) {
    const arc = (1 - c0) * len;
    const R = arc / curl;
    const phi = ((s - c0) / (1 - c0)) * curl;
    reach += R * Math.sin(phi) - (s - c0) * len;
    y += R * (1 - Math.cos(phi));
  }
  out.set(Math.cos(ang) * reach, y, Math.sin(ang) * reach + 0.02);
}

export function Octopus({ position, rotation = 0, palette = OCTOPUS, working = false, asleep = false, look = [0, -0.1, 1] }: { position: [number, number, number]; rotation?: number; palette?: OctopusPalette; working?: boolean; asleep?: boolean; look?: [number, number, number] }) {
  const body = useMemo(() => cached(`octopus:${palette.base}`, () => bodyGeometry(palette)), [palette]);
  const mat = useMemo(() => skin({ roughness: 0.45, sheen: 0.55 }), []);
  const suckerMat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ color: palette.sucker, roughness: 0.45 }), { caustics: 0.3 }), [palette]);
  const arms = useMemo(() => {
    const under = C(palette.under);
    const base = C(palette.base);
    return Array.from({ length: 8 }, () => new Tube(SEG, RAD, armRadius, (s, a, out) => {
      mix(out, under, base, smoothstep(-0.35, 0.45, Math.cos(a)));
      mix(out, out, under, s * 0.25);
    }));
  }, [palette]);
  useEffect(() => () => arms.forEach((a) => a.geometry.dispose()), [arms]);
  const suckers = useRef<THREE.InstancedMesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const pebble = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), d: new THREE.Vector3() }), []);
  const workers = working ? [0, 1] : [];

  useFrame(({ clock }) => {
    // asleep, the arms barely drift
    const t = asleep ? clock.elapsedTime * 0.25 : clock.elapsedTime;
    arms.forEach((arm, i) => arm.update((s, out) => armPoint(i, t, s, workers.includes(i), out), i === 0 && Math.floor(t * 2) % 8 === 0));
    if (bodyRef.current) {
      const b = 1 + Math.sin(t * 1.3) * 0.015;
      bodyRef.current.scale.set(b, 1 + Math.sin(t * 1.3 + 0.6) * 0.02, b);
    }
    const im = suckers.current;
    if (im) {
      let n = 0;
      arms.forEach((arm) => {
        for (let k = 0; k < SUCKERS; k++) {
          const s = 0.14 + k * 0.072;
          const row = Math.round(s * SEG);
          const rad = armRadius(s);
          tmp.d.copy(arm.N[row]).negate();
          tmp.v.copy(arm.pts[row]).addScaledVector(tmp.d, rad * 0.8);
          tmp.q.setFromUnitVectors(tmp.up, tmp.d);
          tmp.s.set(rad * 0.55, rad * 0.28, rad * 0.55);
          tmp.m.compose(tmp.v, tmp.q, tmp.s);
          im.setMatrixAt(n++, tmp.m);
        }
      });
      im.instanceMatrix.needsUpdate = true;
    }
    if (pebble.current && working) {
      // held against the very tip of the arm, as if by its last suckers
      const arm = arms[1];
      pebble.current.position.copy(arm.pts[SEG]).addScaledVector(arm.T[SEG], 0.058);
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh ref={bodyRef} geometry={body} material={mat} castShadow receiveShadow />
      <Eye position={[0.25, 0.53, 0.29]} r={0.1} rotation={[0, 0.42, 0]} lid={palette.base} iris={palette.iris} look={look} closed={asleep} />
      <Eye position={[-0.25, 0.53, 0.29]} r={0.1} rotation={[0, -0.42, 0]} lid={palette.base} iris={palette.iris} look={look} closed={asleep} />
      {arms.map((a, i) => (
        <mesh key={i} geometry={a.geometry} material={mat} castShadow frustumCulled={false} />
      ))}
      <instancedMesh ref={suckers} args={[undefined, undefined, 8 * SUCKERS]} material={suckerMat} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
      </instancedMesh>
      {working && <PebbleWall pebble={pebble} />}
    </group>
  );
}

const STONES = ['#cfc6b2', '#a9b3b8', '#d8cdb6', '#bba892', '#9fa8a0'];

function PebbleWall({ pebble }: { pebble: RefObject<THREE.Mesh | null> }) {
  const mats = useMemo(() => STONES.map((c) => underwater(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }), { caustics: 0.6 })), []);
  const stones = useMemo(
    () => [
      [1.05, 0.08, 0.62, 0.13, 0.08, 0.11],
      [1.3, 0.08, 0.52, 0.12, 0.08, 0.12],
      [1.52, 0.07, 0.4, 0.11, 0.07, 0.1],
      [1.16, 0.22, 0.57, 0.11, 0.07, 0.1],
      [1.4, 0.21, 0.46, 0.1, 0.07, 0.1],
      [1.27, 0.33, 0.52, 0.09, 0.06, 0.09],
    ],
    [],
  );
  return (
    <group>
      {stones.map(([x, y, z, a, b, c], i) => (
        <mesh key={i} position={[x, y, z]} scale={[a, b, c]} rotation={[0, i * 0.7, 0]} material={mats[i % mats.length]} castShadow receiveShadow>
          <sphereGeometry args={[1, 20, 14]} />
        </mesh>
      ))}
      <mesh ref={pebble} scale={[0.085, 0.066, 0.078]} material={mats[1]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
      </mesh>
    </group>
  );
}
