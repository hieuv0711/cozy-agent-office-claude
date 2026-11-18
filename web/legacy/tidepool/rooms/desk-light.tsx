import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeParts, tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { aim, material, metals, paintLathe, pick, rand, rod, softDot, v3 } from './desk-kit';

// Lighting for the Night desk: an articulated desk lamp that carries its own
// warm spotlight, and a string of fairy lights hung in swags on the wall.

// ---------- the desk lamp ----------

const LAMP_COLOURS = ['#22402f', '#e6dac2', '#7a2a24', '#22262a'] as const;

// The lamp's pose: base pivot, elbow and head pivot (it faces +z).
const J0 = v3(0, 0.62, -0.05);
const J1 = v3(0, 3.0, -0.78);
const J2 = v3(0, 3.42, 1.55);
/** Where the shade points. */
const AIM = v3(0, -0.86, 0.5).normalize();

function lampBase() {
  return smoothLathe(
    [
      [0, 0],
      [0.7, 0],
      [0.745, 0.025],
      [0.755, 0.085],
      [0.72, 0.135],
      [0.6, 0.165],
      [0.42, 0.2],
      [0.3, 0.255],
      [0.25, 0.33],
      [0.24, 0.42],
      [0.2, 0.5],
      [0, 0.51],
    ],
    90,
    64,
  );
}

/** Two parallel bars from a to b, offset sideways (x). */
function bars(a: THREE.Vector3, b: THREE.Vector3, gap: number, r: number) {
  return [rod(v3(a.x - gap, a.y, a.z), v3(b.x - gap, b.y, b.z), r, 10), rod(v3(a.x + gap, a.y, a.z), v3(b.x + gap, b.y, b.z), r, 10)];
}

/** A coil spring from a to b. */
function spring(a: THREE.Vector3, b: THREE.Vector3, coil: number, turns: number) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const q = aim(d);
  const pts: THREE.Vector3[] = [];
  const n = turns * 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a2 = t * turns * Math.PI * 2;
    pts.push(v3(Math.cos(a2) * coil, t * len, Math.sin(a2) * coil).applyQuaternion(q).add(a));
  }
  return tubeThrough(pts, () => 0.011, n * 2, 5).geometry;
}

function armsGeometry() {
  const parts: THREE.BufferGeometry[] = [...bars(J0, J1, 0.075, 0.032), ...bars(J1, J2, 0.065, 0.028)];
  return mergeParts(parts, ['position', 'normal']);
}

function springsGeometry() {
  const dir = new THREE.Vector3().subVectors(J1, J0);
  const a = J0.clone().addScaledVector(dir, 0.12);
  const b = J0.clone().addScaledVector(dir, 0.55);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.17, 0.17]) {
    parts.push(spring(v3(x, a.y, a.z - 0.06), v3(x, b.y, b.z - 0.06), 0.045, 22));
    // hooks to the arm
    parts.push(rod(v3(x, b.y, b.z - 0.06), v3(x * 0.45, b.y + 0.1, b.z), 0.009, 6));
    parts.push(rod(v3(x, a.y, a.z - 0.06), v3(x * 0.6, J0.y + 0.05, J0.z - 0.05), 0.009, 6));
  }
  return mergeParts(parts, ['position', 'normal']);
}

/** The knurled knob on each joint, along x. */
function knobGeometry() {
  const n = 40;
  const g = smoothLathe(
    [
      [0, 0],
      [0.07, 0],
      [0.09, 0.02],
      [0.09, 0.07],
      [0.07, 0.09],
      [0, 0.095],
    ],
    n,
    36,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr > 0.06) {
      const a = Math.atan2(z, x);
      const k = 1 + 0.06 * Math.max(0, Math.cos(a * 18));
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  return g.rotateZ(-Math.PI / 2);
}

function shadeOuterGeometry(n: number) {
  return smoothLathe(
    [
      [0.69, 0],
      [0.7, 0.03],
      [0.66, 0.2],
      [0.5, 0.44],
      [0.3, 0.63],
      [0.17, 0.76],
      [0.14, 0.86],
      [0.1, 0.93],
      [0, 0.95],
    ],
    n,
    72,
  );
}

function shadeInnerGeometry() {
  return smoothLathe(
    [
      [0, 0.87],
      [0.1, 0.84],
      [0.15, 0.76],
      [0.28, 0.62],
      [0.48, 0.43],
      [0.63, 0.2],
      [0.665, 0.02],
      [0.69, 0],
    ],
    60,
    72,
  );
}

function bulbGeometry() {
  const n = 40;
  const g = smoothLathe(
    [
      [0, 0],
      [0.1, 0.02],
      [0.17, 0.1],
      [0.18, 0.2],
      [0.12, 0.3],
      [0.08, 0.36],
      [0.08, 0.42],
      [0, 0.43],
    ],
    n,
    32,
  );
  const hot = new THREE.Color('#fff4dc').multiplyScalar(4);
  const warm = new THREE.Color('#ffc070').multiplyScalar(2.2);
  return paintLathe(g, n, (_x, y, _z, _a, out) => out.copy(warm).lerp(hot, Math.max(0, 1 - Math.abs(y - 0.14) * 6)));
}

/**
 * An articulated desk lamp: weighted base, sprung parallel arms, knurled
 * brass joints and an enamel shade with a glowing bulb. It carries a warm
 * spotlight (with shadows) aimed at the desk in front of it.
 */
export function DeskLamp({ seed }: { seed: number }) {
  const colour = pick(rand(seed), LAMP_COLOURS);
  const m = metals();
  const enamel = material('lamp:' + colour, () => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.34, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
  const liner = material('lamp:liner', () => new THREE.MeshStandardMaterial({ color: '#f4e6c6', emissive: '#ffc983', emissiveIntensity: 0.85, roughness: 0.6 }));
  const glow = material('lamp:bulb', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const cord = material('lamp:cord', () => new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 }));
  const geo = useMemo(() => {
    const shadeN = 80;
    return {
      base: lampBase(),
      arms: armsGeometry(),
      springs: springsGeometry(),
      knob: knobGeometry(),
      outer: shadeOuterGeometry(shadeN),
      inner: shadeInnerGeometry(),
      bulb: bulbGeometry(),
      cord: tubeThrough([v3(0, 0.18, -0.55), v3(0, 0.08, -0.95), v3(0.1, 0.03, -1.35), v3(0.45, 0.03, -1.9), v3(0.6, 0.03, -2.6)], () => 0.03, 40, 8).geometry,
      yoke: mergeParts([rod(v3(-0.12, 0.45, -0.05), v3(-0.12, 0.72, -0.05), 0.035, 10), rod(v3(0.12, 0.45, -0.05), v3(0.12, 0.72, -0.05), 0.035, 10)], ['position', 'normal']),
      neck: smoothLathe(
        [
          [0, 0],
          [0.09, 0],
          [0.1, 0.05],
          [0.07, 0.12],
          [0.075, 0.2],
          [0, 0.21],
        ],
        30,
        24,
      ),
    };
  }, []);
  const [target] = useState(() => new THREE.Object3D());
  const shadeQ = useMemo(() => aim(AIM.clone().negate()), []);
  const bulbAt = useMemo(() => J2.clone().addScaledVector(AIM, 0.62), []);
  const aimAt = useMemo(() => J2.clone().addScaledVector(AIM, 6), []);
  return (
    <group>
      <mesh geometry={geo.base} material={enamel} castShadow receiveShadow />
      <mesh geometry={geo.yoke} material={enamel} />
      <mesh geometry={geo.arms} material={enamel} />
      <mesh geometry={geo.springs} material={m.steel} />
      {[J0, J1, J2].map((j, i) => (
        <group key={i} position={j}>
          <mesh geometry={geo.knob} material={m.brass} position={[0.1, 0, 0]} />
          <mesh geometry={geo.knob} material={m.brass} position={[-0.1, 0, 0]} rotation={[0, Math.PI, 0]} />
          <mesh material={m.steel} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.22, 10]} />
          </mesh>
        </group>
      ))}
      <mesh geometry={geo.cord} material={cord} receiveShadow />
      {/* the head: a neck, the shade and its lining, and the bulb */}
      <group position={J2} quaternion={shadeQ}>
        <mesh geometry={geo.neck} material={enamel} position={[0, -0.21, 0]} />
        <group position={[0, -1.12, 0]}>
          <mesh geometry={geo.outer} material={enamel} />
          <mesh geometry={geo.inner} material={liner} />
          <mesh geometry={geo.bulb} material={glow} position={[0, 0.32, 0]} />
        </group>
        <mesh material={m.brass} position={[0, -0.02, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.04, 0.1, 14]} />
        </mesh>
      </group>
      <primitive object={target} position={aimAt} />
      <spotLight
        position={bulbAt}
        target={target}
        color="#ffbf78"
        intensity={42}
        distance={18}
        decay={2}
        angle={0.72}
        penumbra={0.75}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={0.3}
        shadow-camera-far={16}
      />
    </group>
  );
}

// ---------- string lights ----------

const NAILS = [-7.5, -2.5, 2.5, 7.5];
const SAG = 0.8;

/** The wire's path: three swags between four nails. */
function wirePoint(t: number, out: THREE.Vector3) {
  const swags = NAILS.length - 1;
  const k = Math.min(swags - 1e-6, t * swags);
  const i = Math.floor(k);
  const f = k - i;
  const x = NAILS[i] + (NAILS[i + 1] - NAILS[i]) * f;
  const dip = 4 * f * (1 - f);
  return out.set(x, -SAG * dip * (0.92 + 0.08 * Math.sin(i * 2.1)), 0.05 + 0.07 * dip);
}

function fairyBulbGeometry() {
  const n = 36;
  const g = smoothLathe(
    [
      [0, 0],
      [0.05, 0.01],
      [0.075, 0.05],
      [0.078, 0.1],
      [0.05, 0.15],
      [0.03, 0.17],
      [0, 0.175],
    ],
    n,
    20,
  );
  const hot = new THREE.Color('#fff0d0').multiplyScalar(3.2);
  const warm = new THREE.Color('#ffb658').multiplyScalar(1.6);
  paintLathe(g, n, (_x, y, _z, _a, out) => out.copy(warm).lerp(hot, Math.max(0, 1 - Math.abs(y - 0.08) * 9)));
  // it hangs below its socket
  return g.rotateX(Math.PI).translate(0, -0.035, 0);
}

/**
 * A string of warm fairy lights hung in three swags on the wall, each bulb in
 * a little socket with a soft glow on the wallpaper behind it. One gentle
 * point light warms the wall around them. Hangs from its nails at y = 0.
 */
export function StringLights({ seed }: { seed: number }) {
  const m = metals();
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 180; i++) pts.push(wirePoint(i / 180, new THREE.Vector3()));
    return {
      wire: tubeThrough(pts, () => 0.011, 360, 5).geometry,
      bulb: fairyBulbGeometry(),
      socket: new THREE.CylinderGeometry(0.026, 0.032, 0.07, 10).translate(0, -0.01, 0),
      halo: new THREE.PlaneGeometry(1, 1),
    };
  }, []);
  const wireMat = material('lights:wire', () => new THREE.MeshStandardMaterial({ color: '#1e2a20', roughness: 0.6 }));
  const bulbMat = material('lights:bulb', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const haloMat = material('lights:halo', () => new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffb35a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const spots = useMemo(() => {
    const r = rand(seed + 11);
    const out: { p: THREE.Vector3; ph: number; sp: number }[] = [];
    const n = 33;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push({ p: wirePoint(t, new THREE.Vector3()), ph: r() * Math.PI * 2, sp: 0.6 + r() * 1.4 });
    }
    return out;
  }, [seed]);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const sockets = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const white = new THREE.Color(1, 1, 1);
    spots.forEach(({ p }, i) => {
      const tilt = new THREE.Euler(0.15, 0, (i % 3) * 0.12 - 0.12);
      q.setFromEuler(tilt);
      mtx.compose(p, q, s);
      bulbs.current?.setMatrixAt(i, mtx);
      bulbs.current?.setColorAt(i, white);
      sockets.current?.setMatrixAt(i, mtx);
      mtx.compose(new THREE.Vector3(p.x, p.y - 0.1, 0.012), new THREE.Quaternion(), new THREE.Vector3(0.95, 0.95, 1));
      halos.current?.setMatrixAt(i, mtx);
      halos.current?.setColorAt(i, white);
    });
    for (const im of [bulbs.current, sockets.current, halos.current]) {
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }, [spots]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const b = bulbs.current;
    const h = halos.current;
    if (!b || !h) return;
    spots.forEach(({ ph, sp }, i) => {
      const k = 0.82 + 0.18 * Math.sin(t * sp + ph) * Math.sin(t * sp * 0.37 + ph * 2);
      tmp.setScalar(k);
      b.setColorAt(i, tmp);
      tmp.setScalar(k * k);
      h.setColorAt(i, tmp);
    });
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <mesh geometry={geo.wire} material={wireMat} castShadow />
      <instancedMesh ref={sockets} args={[geo.socket, wireMat, spots.length]} />
      <instancedMesh ref={bulbs} args={[geo.bulb, bulbMat, spots.length]} />
      <instancedMesh ref={halos} args={[geo.halo, haloMat, spots.length]} renderOrder={2} />
      {NAILS.map((x) => (
        <group key={x} position={[x, 0.02, 0]}>
          <mesh material={m.brass} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
          </mesh>
          <mesh material={m.brass} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.035, 0.035, 0.015, 12]} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, -0.6, 0.9]} color="#ffb766" intensity={3.2} distance={11} decay={2} />
    </group>
  );
}
