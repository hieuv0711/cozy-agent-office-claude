import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Eye } from './Eye';
import { fanFin, finMaterial } from './geo';
import { cached, cone, ellipsoid, meshSDF, mirrorX, smin, sphere, ssub, torusZ } from './sdf';
import { Bubbles } from './signs';
import { C, mix, noise3, smoothstep } from './util';
import { skin, underwater } from './water';

// The pufferfish: round body with a spotted back, pouty lips, spines that lie
// flat and stand up when it puffs, little fins buzzing. Running a command, it
// blows a stream of bubbles.

export type PufferPalette = { top: string; belly: string; spot: string; lip: string; fin: string; spine: string; iris: string };
export const PUFFER: PufferPalette = { top: '#e8c25f', belly: '#f8f1e2', spot: '#6d4f27', lip: '#f2b58c', fin: '#f6dfa6', spine: '#d6b07a', iris: '#2f4a33' };

const R: [number, number, number] = [0.42, 0.39, 0.47];

function bodyGeometry(p: PufferPalette) {
  const top = C(p.top);
  const belly = C(p.belly);
  const spot = C(p.spot);
  const lip = C(p.lip);
  const body = ellipsoid(0, 0, 0, R[0], R[1], R[2]);
  const brow = ellipsoid(0, 0.07, 0.17, 0.35, 0.33, 0.33);
  const lips = torusZ(0, -0.07, 0.475, 0.05, 0.028);
  const hole = sphere(0, -0.07, 0.515, 0.03);
  const tail = cone(0, 0.01, -0.36, 0, 0.03, -0.62, 0.17, 0.065);
  const eyes = mirrorX(sphere(0.24, 0.15, 0.31, 0.105));
  const sdf = (x: number, y: number, z: number) => {
    let d = smin(body(x, y, z), brow(x, y, z), 0.12);
    d = smin(d, tail(x, y, z), 0.12);
    d = smin(d, eyes(x, y, z), 0.05);
    d = smin(d, lips(x, y, z), 0.04);
    return ssub(d, hole(x, y, z), 0.02);
  };
  return meshSDF(sdf, {
    min: [-0.5, -0.47, -0.7],
    max: [0.5, 0.47, 0.56],
    cell: 0.013,
    paint: (x, y, z, _nx, _ny, _nz, out) => {
      mix(out, top, belly, smoothstep(0.02, -0.24, y));
      mix(out, out, spot, smoothstep(0.22, 0.34, noise3(x * 9 + 3, y * 9, z * 9)) * smoothstep(-0.12, 0.05, y) * 0.85);
      const ly = y + 0.07;
      const lz = z - 0.48;
      mix(out, out, lip, smoothstep(0.11, 0.06, Math.sqrt(x * x + ly * ly + lz * lz)));
    },
  });
}

type Spine = { p: THREE.Vector3; n: THREE.Vector3; back: THREE.Vector3 };

function spineLayout(): Spine[] {
  const out: Spine[] = [];
  const N = 130;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (d.z > 0.4 && Math.abs(d.y) < 0.6 && Math.abs(d.x) < 0.8) continue;
    if (d.z < -0.8) continue;
    const k = 1 / Math.sqrt((d.x / R[0]) ** 2 + (d.y / R[1]) ** 2 + (d.z / R[2]) ** 2);
    const p = d.clone().multiplyScalar(k);
    const n = new THREE.Vector3(p.x / R[0] ** 2, p.y / R[1] ** 2, p.z / R[2] ** 2).normalize();
    const back = new THREE.Vector3(0, 0, -1).addScaledVector(n, n.z);
    if (back.lengthSq() < 1e-4) back.set(0, -1, 0);
    out.push({ p, n, back: back.normalize() });
  }
  return out;
}

const spineGeo = new THREE.ConeGeometry(0.013, 1, 6).translate(0, 0.5, 0);

export function Puffer({ position, rotation = 0, palette = PUFFER, running = false, asleep = false }: { position: [number, number, number]; rotation?: number; palette?: PufferPalette; running?: boolean; asleep?: boolean }) {
  const body = useMemo(() => cached(`puffer:${palette.top}`, () => bodyGeometry(palette)), [palette]);
  const mat = useMemo(() => skin({ roughness: 0.5, sheen: 0.5 }), []);
  const spineMat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ color: palette.spine, roughness: 0.5 }), { caustics: 0.3 }), [palette]);
  const fin = useMemo(() => finMaterial(palette.fin, 0.82), [palette]);
  const tailGeo = useMemo(() => fanFin(0.24, -0.95, 0.95, 9), []);
  const pecGeo = useMemo(() => fanFin(0.13, -1.0, 1.0, 7), []);
  const dorsalGeo = useMemo(() => fanFin(0.13, 0.2, 1.5, 6), []);
  const analGeo = useMemo(() => fanFin(0.12, -1.5, -0.2, 6), []);
  const spines = useMemo(spineLayout, []);
  const g = useRef<THREE.Group>(null);
  const puff = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const pecL = useRef<THREE.Mesh>(null);
  const pecR = useRef<THREE.Mesh>(null);
  const spineRef = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = running ? smoothstep(0.55, 0.95, 0.5 + 0.5 * Math.sin(t * 0.9)) : 0;
    if (g.current) {
      g.current.position.set(0, Math.sin(t * 1.1) * 0.06, 0);
      g.current.rotation.y = Math.sin(t * 0.45) * 0.15;
    }
    if (puff.current) puff.current.scale.setScalar(1 + k * 0.16);
    if (tail.current) tail.current.rotation.y = Math.PI / 2 + Math.sin(t * 3.4) * 0.3;
    const flap = Math.sin(t * (asleep ? 3 : 13)) * (asleep ? 0.15 : 0.4);
    if (pecL.current) pecL.current.rotation.y = 0.5 + flap;
    if (pecR.current) pecR.current.rotation.y = Math.PI - 0.5 - flap;
    const im = spineRef.current;
    if (im) {
      spines.forEach((sp, i) => {
        tmp.d.copy(sp.back).multiplyScalar(0.85).addScaledVector(sp.n, 0.2).normalize().lerp(sp.n, k).normalize();
        tmp.q.setFromUnitVectors(tmp.up, tmp.d);
        tmp.v.copy(sp.p).addScaledVector(sp.n, -0.006);
        tmp.s.set(1, 0.055 + 0.05 * k, 1);
        tmp.m.compose(tmp.v, tmp.q, tmp.s);
        im.setMatrixAt(i, tmp.m);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={g}>
        <group ref={puff}>
          <mesh geometry={body} material={mat} castShadow receiveShadow />
          <Eye position={[0.255, 0.16, 0.335]} r={0.1} rotation={[0, 0.55, 0]} lid={palette.top} iris={palette.iris} look={[-0.45, -0.05, 1]} closed={asleep} />
          <Eye position={[-0.255, 0.16, 0.335]} r={0.1} rotation={[0, -0.55, 0]} lid={palette.top} iris={palette.iris} look={[0.45, -0.05, 1]} closed={asleep} />
          <instancedMesh ref={spineRef} args={[spineGeo, spineMat, spines.length]} castShadow frustumCulled={false} />
          <mesh ref={tail} geometry={tailGeo} material={fin} position={[0, 0.03, -0.6]} rotation={[0, Math.PI / 2, 0]} />
          <mesh ref={pecL} geometry={pecGeo} material={fin} position={[0.35, -0.04, 0.02]} />
          <mesh ref={pecR} geometry={pecGeo} material={fin} position={[-0.35, -0.04, 0.02]} />
          <mesh geometry={dorsalGeo} material={fin} position={[0, 0.27, -0.33]} rotation={[0, Math.PI / 2, 0]} />
          <mesh geometry={analGeo} material={fin} position={[0, -0.26, -0.33]} rotation={[0, Math.PI / 2, 0]} />
        </group>
        {running && <Bubbles origin={[0, -0.06, 0.6]} dir={[0, 0.3, 0.95]} count={22} speed={1.5} spread={0.08} size={0.05} rise={2.6} />}
      </group>
    </group>
  );
}
