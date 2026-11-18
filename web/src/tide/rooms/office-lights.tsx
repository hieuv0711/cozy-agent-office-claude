import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { BACK_DESK, CEIL, FLOOR_LAMP, PENDANTS, ROOM } from './office-dims';
import { C, Merger, mix, noise3, omat, once, paintLathe, smoothLathe, smoothstep, trs, V } from './office-kit';
import { officeLightLevels } from './office-outside';

// The office's one fixed set of lights (never added or removed at runtime, so
// no material ever recompiles): a warm hemisphere fill, a key light high over
// the front that casts soft shadows across the desks, three green enamel
// pendants over the front desk, two warm pools along the back desk where its
// lamps are, the light falling in through the back windows (cool at night,
// warm daylight on a sunny day), and the lounge's floor lamp. The reception's
// lamps are lit by the people's code when someone waits.

/** Where the floor lamp's shade is (its light comes from here). */
export const LAMP_SHADE: [number, number, number] = [FLOOR_LAMP[0], 2.62, FLOOR_LAMP[2]];

// ---------- the pendants ----------

/** A deep dome shade, enamelled green outside and white inside, as one closed profile (outside down, rim, inside up). */
const SHADE_PROFILE: [number, number][] = [
  [0.0, 0.17],
  [0.07, 0.165],
  [0.1, 0.14],
  [0.16, 0.08],
  [0.27, -0.02],
  [0.36, -0.12],
  [0.405, -0.19],
  [0.415, -0.215],
  [0.4, -0.222],
  [0.385, -0.2],
  [0.34, -0.13],
  [0.25, -0.04],
  [0.14, 0.05],
  [0.08, 0.11],
  [0.0, 0.125],
];

export function pendantGeometries() {
  return once('office:pendant', () => {
    const n = 60;
    const shade = smoothLathe(SHADE_PROFILE, n, 48);
    const green = C('#1f4a38');
    const white = C('#f2ece0');
    const rimAt = 7 / (SHADE_PROFILE.length - 1);
    paintLathe(shade, n, (x, y, z, along, out) => {
      if (along < rimAt + 0.02) {
        out.copy(green).multiplyScalar(0.9 + 0.12 * noise3(x * 20, y * 20, z * 20));
        // chipped enamel showing dark steel at the rim
        mix(out, out, C('#1a1816'), smoothstep(0.62, 0.8, noise3(x * 30, y * 30, z * 30)) * smoothstep(-0.16, -0.21, y));
      } else if (along < rimAt + 0.06) out.copy(C('#d8d0c0'));
      else out.copy(white).multiplyScalar(0.94 + 0.06 * noise3(x * 30, y * 30, z * 30));
    });
    const brass = new Merger();
    // the socket cup and the cord grip on top
    brass.add(
      smoothLathe(
        [
          [0, 0.31],
          [0.035, 0.31],
          [0.045, 0.28],
          [0.05, 0.2],
          [0.075, 0.17],
          [0.08, 0.15],
          [0, 0.15],
        ],
        20,
        28,
      ),
    );
    // the bulb: a big squirrel-cage filament bulb hanging just below the rim
    const bulb = smoothLathe(
      [
        [0, -0.31],
        [0.05, -0.3],
        [0.085, -0.25],
        [0.095, -0.17],
        [0.07, -0.08],
        [0.04, -0.03],
        [0.034, 0.03],
        [0, 0.03],
      ],
      24,
      28,
    );
    return { shade, brass: brass.build(), bulb };
  });
}

/** The cords up to the ceiling and their ceiling roses. */
function cordGeometry(y: number) {
  return once(`office:pendant-cord:${y}`, () => {
    const m = new Merger();
    m.add(tubeThrough([V(0, 0.3, 0), V(0, (CEIL - y) * 0.55, 0.004), V(0, CEIL - y - 0.02, 0)], () => 0.011, 10, 6).geometry);
    m.add(smoothLathe([[0, 0], [0.09, 0], [0.095, -0.02], [0.08, -0.05], [0, -0.055]], 10, 24), trs([0, CEIL - y, 0]));
    return m.build();
  });
}

export function pendantMats() {
  return {
    enamel: omat('pendant-enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide })),
    brass: omat('pendant-brass', () => new THREE.MeshStandardMaterial({ color: '#b8904a', metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide })),
    cord: omat('pendant-cord', () => new THREE.MeshStandardMaterial({ color: '#1a1714', roughness: 0.7 })),
    bulb: omat('pendant-bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd49a').multiplyScalar(2.4), toneMapped: false })),
    inner: omat('pendant-inner', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6c0').multiplyScalar(1.15), side: THREE.DoubleSide })),
  };
}

/** The three pendants over the front desk (meshes only; their light is in OfficeLights). */
export function Pendants() {
  const g = pendantGeometries();
  const m = pendantMats();
  const cord = cordGeometry(PENDANTS.y);
  // the lit inside of each shade: a cone just inside the white enamel, bright with the bulb's light
  const inner = useMemo(
    () =>
      once('office:pendant-glow', () =>
        smoothLathe(
          [
            [0.07, 0.105],
            [0.13, 0.04],
            [0.24, -0.05],
            [0.33, -0.13],
            [0.38, -0.2],
          ],
          16,
          40,
        ),
      ),
    [],
  );
  return (
    <group>
      {PENDANTS.xs.map((x) => (
        <group key={x} position={[x, PENDANTS.y, PENDANTS.z]}>
          <mesh geometry={g.shade} material={m.enamel} castShadow />
          <mesh geometry={inner} material={m.inner} />
          <mesh geometry={g.brass} material={m.brass} />
          <mesh geometry={g.bulb} material={m.bulb} />
          <mesh geometry={cord} material={m.cord} />
        </group>
      ))}
    </group>
  );
}

// ---------- the light set ----------

function KeyLight() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={[0, 0.4, -2.8]} />
      {/* a broad warm key from high over the front: it lights the desks and the people, casts the soft shadows, and falls away before the floor near the camera */}
      <spotLight
        position={[0.5, 13.5, 7.2]}
        target={target}
        intensity={26}
        distance={0}
        decay={1.35}
        angle={0.74}
        penumbra={0.8}
        color="#ffd6a6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-near={4}
        shadow-camera-far={32}
      />
    </>
  );
}

/** The window light's colour at night (moonlight) and on a sunny day (warm daylight). */
const WINDOW_NIGHT = new THREE.Color('#8aa6dc');
const WINDOW_DAY = new THREE.Color('#ffd3a0');

/** Light falling in through the back windows: cool moonlight (dimmer in rain, brighter off snow), warm daylight on a sunny day. */
function WindowLight() {
  const ref = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    l.intensity = 22 * officeLightLevels.window;
    l.color.copy(WINDOW_NIGHT).lerp(WINDOW_DAY, officeLightLevels.day);
  });
  return (
    <>
      <primitive object={target} position={[-1.0, 0, -4.6]} />
      {/* from high behind the back wall: it reaches the back desk, the backs of the people there, the aisle and the lounge, and fades before the front */}
      <spotLight ref={ref} position={[-1.0, 9.0, ROOM.back - 6.5]} target={target} color="#8aa6dc" intensity={22} distance={19} decay={1.1} angle={0.62} penumbra={1} />
    </>
  );
}

export function OfficeLights() {
  return (
    <group>
      <hemisphereLight args={['#a8866a', '#120a06', 0.3]} />
      <KeyLight />
      <WindowLight />
      {/* the pendants over the front desk */}
      {PENDANTS.xs.map((x) => (
        <pointLight key={x} position={[x, PENDANTS.y - 0.3, PENDANTS.z]} color="#ffb76a" intensity={9} distance={9} decay={1.8} />
      ))}
      {/* the back desk's lamps: warm pools on the desk and the brick under the windows */}
      {[-2.6, 2.6].map((x) => (
        <pointLight key={x} position={[x, 1.95, BACK_DESK.front - 0.35]} color="#ffb366" intensity={4.5} distance={7.5} decay={1.6} />
      ))}
      {/* the lounge's floor lamp */}
      <pointLight position={LAMP_SHADE} color="#ffb06a" intensity={7} distance={7.5} decay={1.6} />
    </group>
  );
}
