import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cached, cone, ellipsoid, meshSDF, rotX, smin } from './sdf';
import { C, mix, smoothstep } from './util';
import { underwater } from './water';

// A team (workflow): a school of small fish swimming together, tails wagging.

function fishGeometry() {
  const back = C('#2f6f6a');
  const belly = C('#e3eeee');
  const stripe = C('#73d6c4');
  const eye = C('#0f1214');
  const white = C('#ffffff');
  const body = ellipsoid(0, 0, 0.02, 0.032, 0.062, 0.15);
  const head = ellipsoid(0, 0.003, 0.09, 0.03, 0.052, 0.07);
  const tail = cone(0, 0, -0.1, 0, 0, -0.17, 0.026, 0.01);
  const finUp = rotX(ellipsoid(0, 0.035, -0.2, 0.006, 0.046, 0.03), 0.035, -0.2, 0.6);
  const finDown = rotX(ellipsoid(0, -0.035, -0.2, 0.006, 0.046, 0.03), -0.035, -0.2, -0.6);
  const dorsal = ellipsoid(0, 0.06, -0.01, 0.005, 0.03, 0.06);
  const sdf = (x: number, y: number, z: number) => {
    let d = smin(body(x, y, z), head(x, y, z), 0.03);
    d = smin(d, tail(x, y, z), 0.03);
    d = smin(d, Math.min(finUp(x, y, z), finDown(x, y, z)), 0.02);
    return smin(d, dorsal(x, y, z), 0.015);
  };
  return meshSDF(sdf, {
    min: [-0.045, -0.1, -0.25],
    max: [0.045, 0.1, 0.18],
    cell: 0.004,
    paint: (x, y, z, _nx, _ny, _nz, out) => {
      mix(out, belly, back, smoothstep(-0.005, 0.03, y));
      mix(out, out, stripe, smoothstep(0.012, 0.0, Math.abs(y - 0.004)) * smoothstep(0.12, 0.05, z) * 0.9);
      const ey = y - 0.012;
      const ez = z - 0.115;
      const de = Math.sqrt(ey * ey + ez * ez);
      if (Math.abs(x) > 0.012) {
        mix(out, out, white, smoothstep(0.016, 0.012, de));
        mix(out, out, eye, smoothstep(0.011, 0.008, de));
      }
    },
  });
}

export function School({ center, follow, count = 22, radius = [1.5, 0.35, 0.7], speed = 0.32, tint = '#ffffff' }: { center: [number, number, number]; /** a live point to circle instead of the fixed center */ follow?: THREE.Vector3; count?: number; radius?: [number, number, number]; speed?: number; tint?: string }) {
  const geo = useMemo(() => cached('school-fish', fishGeometry), []);
  const mat = useMemo(() => underwater(new THREE.MeshPhysicalMaterial({ vertexColors: true, color: tint, roughness: 0.3, metalness: 0.25, clearcoat: 0.6 }), { caustics: 0.4, wag: 0.012 }), [tint]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const fish = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        lag: (i / count) * 0.9 + Math.random() * 0.05,
        off: new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.35),
        s: 0.85 + Math.random() * 0.35,
      })),
    [count],
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), n: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), look: new THREE.Matrix4() }), []);
  const at = (u: number, out: THREE.Vector3) => {
    const cx = follow ? follow.x : center[0];
    const cy = follow ? follow.y : center[1];
    const cz = follow ? follow.z : center[2];
    return out.set(cx + Math.cos(u) * radius[0], cy + Math.sin(u * 2) * radius[1], cz + Math.sin(u) * radius[2]);
  };
  useFrame(({ clock }) => {
    const im = ref.current;
    if (!im) return;
    const t = clock.elapsedTime * speed;
    fish.forEach((f, i) => {
      const u = t - f.lag;
      at(u, tmp.p).add(f.off);
      at(u + 0.03, tmp.n).add(f.off);
      tmp.look.lookAt(tmp.n, tmp.p, tmp.up);
      tmp.q.setFromRotationMatrix(tmp.look);
      tmp.s.setScalar(f.s);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      im.setMatrixAt(i, tmp.m);
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} castShadow frustumCulled={false} />;
}
