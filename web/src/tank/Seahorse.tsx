import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Eye } from './Eye';
import { fanFin, finMaterial } from './geo';
import { cached, chain, cone, ellipsoid, meshSDF, mirrorX, rotX, smin, sphere, type V3 } from './sdf';
import { AskSign } from './signs';
import { C, mix, smoothstep, worley3 } from './util';
import { skin } from './water';

// The seahorse: snout, crown, bony rings and a curled tail, with a fluttering
// back fin. When it needs you it taps on the front glass under a yellow light.

export type SeahorsePalette = { base: string; back: string; belly: string; dot: string; fin: string; iris: string };
export const SEAHORSE: SeahorsePalette = { base: '#6fa9e0', back: '#3f73b6', belly: '#d3e8f8', dot: '#f2f9ff', fin: '#cfe9fb', iris: '#26406a' };

function tailPoints(): V3[] {
  const ctrl = [
    [0, 0.42, -0.09],
    [0, 0.28, -0.15],
    [0, 0.15, -0.16],
    [0, 0.05, -0.11],
    [0, 0.0, -0.03],
    [0, 0.02, 0.06],
    [0, 0.09, 0.1],
    [0, 0.15, 0.07],
    [0, 0.16, 0.01],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrl);
  return Array.from({ length: 18 }, (_, i) => {
    const p = curve.getPointAt(i / 17);
    return [p.x, p.y, p.z] as V3;
  });
}

function bodyGeometry(p: SeahorsePalette) {
  const base = C(p.base);
  const back = C(p.back);
  const belly = C(p.belly);
  const dot = C(p.dot);
  const head = ellipsoid(0, 1.02, 0.02, 0.15, 0.17, 0.19);
  const snout = cone(0, 0.99, 0.13, 0, 0.94, 0.39, 0.075, 0.052);
  const mouth = ellipsoid(0, 0.935, 0.41, 0.058, 0.05, 0.035);
  const crown = cone(0, 1.12, -0.03, 0, 1.235, -0.085, 0.078, 0.045);
  const neck = cone(0, 0.98, -0.07, 0, 0.74, -0.08, 0.115, 0.15);
  const tummy = rotX(ellipsoid(0, 0.58, 0, 0.165, 0.26, 0.22), 0.58, 0, -0.18);
  const eyes = mirrorX(sphere(0.115, 1.055, 0.06, 0.066));
  const tail = chain(tailPoints(), 0.12, 0.026, 0.03);
  const bumps = ([
    [0, 1.2, -0.12],
    [0, 1.06, -0.17],
    [0, 0.92, -0.2],
    [0, 0.78, -0.225],
    [0, 0.64, -0.23],
    [0, 0.5, -0.2],
  ] as V3[]).map(([x, y, z]) => sphere(x, y, z, 0.032));
  const sdf = (x: number, y: number, z: number) => {
    let d = smin(head(x, y, z), snout(x, y, z), 0.06);
    d = smin(d, mouth(x, y, z), 0.03);
    d = smin(d, crown(x, y, z), 0.05);
    d = smin(d, neck(x, y, z), 0.08);
    d = smin(d, tummy(x, y, z), 0.1);
    d = smin(d, eyes(x, y, z), 0.03);
    d = smin(d, tail(x, y, z), 0.06);
    let b = bumps[0](x, y, z);
    for (let i = 1; i < bumps.length; i++) b = Math.min(b, bumps[i](x, y, z));
    d = smin(d, b, 0.025);
    return d - 0.007 * (0.5 + 0.5 * Math.sin(y * 62)) * smoothstep(0.3, 0.4, y) * smoothstep(0.98, 0.88, y);
  };
  return meshSDF(sdf, {
    min: [-0.22, -0.06, -0.32],
    max: [0.22, 1.42, 0.53],
    cell: 0.0115,
    paint: (x, y, z, _nx, _ny, nz, out) => {
      mix(out, base, back, smoothstep(0.0, -0.8, nz) * 0.7);
      mix(out, out, belly, smoothstep(0.3, 0.9, nz) * smoothstep(0.3, 0.45, y) * smoothstep(0.92, 0.8, y));
      // neat pale dots, mostly on the back and head
      mix(out, out, dot, smoothstep(0.3, 0.2, worley3(x * 12 + 4, y * 12, z * 12)) * smoothstep(0.6, -0.2, nz) * 0.85);
      mix(out, out, back, smoothstep(0.32, 0.43, z) * smoothstep(1.05, 0.9, y) * 0.5);
      mix(out, out, back, smoothstep(0.75, 0.95, 0.5 + 0.5 * Math.sin(y * 62)) * smoothstep(0.3, 0.4, y) * smoothstep(0.98, 0.88, y) * 0.25);
    },
  });
}

export function Seahorse({ position, rotation = 0, palette = SEAHORSE, waiting = false, asleep = false, signal = true }: { position: [number, number, number]; rotation?: number; palette?: SeahorsePalette; waiting?: boolean; asleep?: boolean; /** draw its own "?" and yellow light when waiting */ signal?: boolean }) {
  const body = useMemo(() => cached(`seahorse:${palette.base}`, () => bodyGeometry(palette)), [palette]);
  const mat = useMemo(() => skin({ roughness: 0.4, sheen: 0.5, clearcoat: 0.5 }), []);
  const fin = useMemo(() => finMaterial(palette.fin, 0.8), [palette]);
  const dorsalGeo = useMemo(() => fanFin(0.2, -0.95, 0.95, 10), []);
  const pecGeo = useMemo(() => fanFin(0.085, -1.1, 1.1, 6), []);
  // the waiting light aims at the seahorse itself (a spotlight's default target is the world origin)
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const g = useRef<THREE.Group>(null);
  const dorsal = useRef<THREE.Mesh>(null);
  const pecL = useRef<THREE.Mesh>(null);
  const pecR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      let tap = 0;
      if (waiting) {
        const k = t % 1.8;
        tap = k < 0.6 ? Math.max(0, Math.sin((k / 0.6) * Math.PI * 2)) : 0;
      }
      g.current.position.set(0, Math.sin(t * 1.2) * 0.04, tap * 0.07);
      g.current.rotation.x = tap * 0.12 + Math.sin(t * 0.9) * 0.03;
    }
    if (dorsal.current) dorsal.current.scale.set(1 + Math.sin(t * 16) * 0.08, 1, 1);
    const flap = Math.sin(t * 14) * 0.35;
    if (pecL.current) pecL.current.rotation.y = 0.6 + flap;
    if (pecR.current) pecR.current.rotation.y = Math.PI - 0.6 - flap;
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={g}>
        <mesh geometry={body} material={mat} castShadow receiveShadow />
        <Eye position={[0.13, 1.065, 0.088]} r={0.07} rotation={[0, 0.55, 0]} lid={palette.base} iris={palette.iris} watch={waiting} look={[-0.4, 0, 1]} closed={asleep} />
        <Eye position={[-0.13, 1.065, 0.088]} r={0.07} rotation={[0, -0.55, 0]} lid={palette.base} iris={palette.iris} watch={waiting} look={[0.4, 0, 1]} closed={asleep} />
        <mesh ref={dorsal} geometry={dorsalGeo} material={fin} position={[0, 0.62, -0.17]} rotation={[0, Math.PI / 2, 0]} />
        <mesh ref={pecL} geometry={pecGeo} material={fin} position={[0.13, 0.97, -0.04]} />
        <mesh ref={pecR} geometry={pecGeo} material={fin} position={[-0.13, 0.97, -0.04]} />
      </group>
      {waiting && signal && (
        <>
          <AskSign position={[0.34, 1.68, 0.1]} />
          <primitive object={lightTarget} position={[0, 0.75, 0.12]} />
          <spotLight position={[0, 2.9, 0.9]} target={lightTarget} angle={0.36} penumbra={0.85} intensity={11} color="#ffd84a" distance={5} decay={2} />
        </>
      )}
    </group>
  );
}
