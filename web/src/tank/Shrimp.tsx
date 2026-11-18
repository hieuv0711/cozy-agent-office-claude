import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fanFin, finMaterial, mergeParts, tubeThrough } from './geo';
import { cached, cone, ellipsoid, meshSDF, mirrorX, smin, type SDF } from './sdf';
import { C, mix, smoothstep } from './util';
import { skin, underwater } from './water';

// A helper: a little shrimp carrying a pearl (its result) back home.

export type ShrimpPalette = { base: string; band: string; belly: string; fin: string };
export const SHRIMP: ShrimpPalette = { base: '#ef7c5c', band: '#fff1e6', belly: '#ffc2a6', fin: '#ffb08f' };

const SEGS = 6;
const segZ = (s: number) => 0.1 - s * 0.062;
const segY = (s: number) => 0.012 * s - 0.0065 * s * s;

function bodyGeometry(p: ShrimpPalette) {
  const base = C(p.base);
  const band = C(p.band);
  const belly = C(p.belly);
  const parts: SDF[] = [];
  for (let s = 0; s < SEGS; s++) parts.push(ellipsoid(0, segY(s), segZ(s), 0.05 - s * 0.005, 0.054 - s * 0.006, 0.045));
  const shell = ellipsoid(0, 0.03, 0.15, 0.056, 0.058, 0.1);
  const horn = cone(0, 0.06, 0.22, 0, 0.085, 0.33, 0.013, 0.003);
  const stalks = mirrorX(cone(0.028, 0.05, 0.2, 0.048, 0.07, 0.23, 0.009, 0.008));
  const sdf = (x: number, y: number, z: number) => {
    let d = shell(x, y, z);
    for (const f of parts) d = smin(d, f(x, y, z), 0.022);
    d = smin(d, horn(x, y, z), 0.015);
    return smin(d, stalks(x, y, z), 0.01);
  };
  return meshSDF(sdf, {
    min: [-0.08, -0.14, -0.3],
    max: [0.08, 0.13, 0.36],
    cell: 0.0055,
    paint: (_x, y, z, _nx, ny, _nz, out) => {
      mix(out, base, belly, smoothstep(0.0, -0.7, ny) * 0.7);
      const f = ((0.1 - z) / 0.062) % 1;
      mix(out, out, band, z < 0.08 ? smoothstep(0.82, 0.95, f) * 0.85 : 0);
      mix(out, out, band, smoothstep(0.045, 0.06, y) * smoothstep(0.1, 0.2, z) * 0.25);
    },
  });
}

function limbsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(
      tubeThrough(
        [new THREE.Vector3(side * 0.02, 0.06, 0.24), new THREE.Vector3(side * 0.06, 0.13, 0.15), new THREE.Vector3(side * 0.09, 0.15, -0.05), new THREE.Vector3(side * 0.11, 0.1, -0.35)],
        (t) => 0.0045 * (1 - t) + 0.0015,
        24,
        4,
      ).geometry,
    );
    for (let k = 0; k < 5; k++) {
      const z = 0.16 - k * 0.055;
      parts.push(tubeThrough([new THREE.Vector3(side * 0.02, -0.02, z), new THREE.Vector3(side * 0.05, -0.06, z + 0.01), new THREE.Vector3(side * 0.06, -0.1, z + 0.03)], () => 0.005, 6, 4).geometry);
    }
  }
  return mergeParts(parts, ['position', 'normal']);
}

const eyeGeo = new THREE.SphereGeometry(1, 14, 10);

export function Shrimp({ path, palette = SHRIMP }: { path: (t: number, out: THREE.Vector3) => void; palette?: ShrimpPalette }) {
  const body = useMemo(() => cached(`shrimp:${palette.base}`, () => bodyGeometry(palette)), [palette]);
  const limbs = useMemo(() => cached('shrimp-limbs', limbsGeometry), []);
  const mat = useMemo(() => skin({ roughness: 0.35, sheen: 0.4, clearcoat: 0.7 }), []);
  const limbMat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ color: palette.base, roughness: 0.5 }), { caustics: 0.3 }), [palette]);
  const eyeMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#120c10', roughness: 0.15, clearcoat: 1 }), []);
  const pearlMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#f7f0e6', roughness: 0.12, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, emissive: '#fff3e0', emissiveIntensity: 0.18 }), []);
  const fin = useMemo(() => finMaterial(palette.fin, 0.85), [palette]);
  const fan = useMemo(() => fanFin(0.07, -0.7, 0.7, 5), []);
  const g = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!g.current) return;
    path(t, tmp.a);
    path(t + 0.05, tmp.b);
    g.current.position.copy(tmp.a);
    g.current.lookAt(tmp.b);
    g.current.rotation.z += Math.sin(t * 7) * 0.05;
  });
  return (
    <group ref={g}>
      <mesh geometry={body} material={mat} castShadow />
      <mesh geometry={limbs} material={limbMat} />
      <mesh geometry={eyeGeo} material={eyeMat} position={[0.05, 0.072, 0.234]} scale={0.017} />
      <mesh geometry={eyeGeo} material={eyeMat} position={[-0.05, 0.072, 0.234]} scale={0.017} />
      {[-0.55, 0, 0.55].map((a) => (
        <mesh key={a} geometry={fan} material={fin} position={[0, segY(SEGS - 1) - 0.01, segZ(SEGS - 1) - 0.035]} rotation={[Math.PI / 2, 0, -Math.PI / 2 + a]} />
      ))}
      <mesh geometry={eyeGeo} material={pearlMat} position={[0, -0.09, 0.2]} scale={0.055} />
    </group>
  );
}
