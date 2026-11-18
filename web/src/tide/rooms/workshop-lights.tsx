import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { BENCH_LAMPS, CEIL, ROOM, STOVE } from './workshop-dims';
import { BEAMS_Z, hookGeometry } from './workshop-shell';
import { C, Merger, mix, noise3, once, paintLathe, smoothLathe, smoothstep, trs, V, wmat } from './workshop-kit';

// The workshop's one fixed set of lights (never added or removed at runtime,
// so no material ever recompiles): a soft warm fill, a key light that casts
// the soft shadows over the benches, four rise-and-fall enamel lamps over the
// front bench, a reflector lamp washing the tool wall, the wood stove's glow
// (a slow, calm flicker) and the light from the windows (cool at night, warm
// daylight on a sunny day). The counter's lamps are lit by the makers' code
// when someone waits there.

/** Live levels the weather pushes, read every frame: how strong the window light is, and how much of it is daylight (0 at night, 1 on a sunny day). */
export const workshopLightLevels = { window: 1, day: 0 };

/** The stove fire's brightness at time t: a slow, calm breathing with a little unrest (about 0.8..1.15). */
export function stoveFlicker(t: number) {
  return 1 + 0.07 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 2.9 + 1.1) + 0.04 * noise3(t * 0.9, 3.3, 0.5) + 0.025 * Math.sin(t * 7.3 + 0.4) * (0.5 + 0.5 * Math.sin(t * 0.37));
}

/** The beam the bench lamps hang from (its underside). */
const BEAM_Y = CEIL - 0.55;
/** The tool wall's reflector lamp, on the beam over the aisle. */
const REFLECTOR: [number, number, number] = [0, BEAM_Y - 0.95, BEAMS_Z[0] - 0.05];

// ---------- the bench lamps ----------

/** A wide factory shade in cream enamel with a green band at the rim, white inside. Hangs from y = 0 down. */
function benchShadeGeometry() {
  return once('ws:bench-shade', () => {
    const n = 90;
    const g = smoothLathe(
      [
        [0.06, 0.0],
        [0.075, -0.05],
        [0.08, -0.11],
        [0.13, -0.15],
        [0.28, -0.21],
        [0.42, -0.27],
        [0.5, -0.31],
        [0.515, -0.33],
        [0.505, -0.34],
        [0.485, -0.325],
        [0.4, -0.28],
        [0.26, -0.215],
        [0.12, -0.16],
        [0.07, -0.12],
        [0.05, -0.11],
      ],
      n,
      72,
    );
    const outside = C('#e8dfc8');
    const band = C('#2c4a3a');
    const inside = C('#fbf6ea');
    const chip = C('#1c1a18');
    return paintLathe(g, n, (x, y, z, along, out) => {
      if (along < 0.52) {
        out.copy(outside).multiplyScalar(0.92 + 0.1 * noise3(x * 18, y * 18, z * 18));
        // a green band near the rim and on the neck
        mix(out, out, band, smoothstep(-0.27, -0.29, y) + smoothstep(-0.05, -0.07, y) * smoothstep(-0.12, -0.1, y));
        // chips in the enamel at the rim, the iron showing through
        mix(out, out, chip, smoothstep(0.55, 0.8, noise3(x * 30, y * 30, z * 30)) * smoothstep(-0.26, -0.33, y) * 0.8);
      } else out.copy(inside);
    });
  });
}

/** The lampholder, the bulb and the porcelain counterweight. */
function lampPartGeometries() {
  return once('ws:bench-lamp-parts', () => {
    const holder = smoothLathe(
      [
        [0, 0.1],
        [0.03, 0.1],
        [0.045, 0.06],
        [0.05, -0.02],
        [0.062, -0.05],
        [0.062, -0.12],
        [0.05, -0.13],
        [0, -0.13],
      ],
      24,
      32,
    );
    const bulb = smoothLathe(
      [
        [0, -0.4],
        [0.07, -0.39],
        [0.115, -0.34],
        [0.125, -0.27],
        [0.1, -0.19],
        [0.06, -0.15],
        [0.04, -0.12],
        [0, -0.118],
      ],
      30,
      32,
    );
    const weight = smoothLathe(
      [
        [0, -0.16],
        [0.05, -0.15],
        [0.08, -0.11],
        [0.085, -0.04],
        [0.07, 0.02],
        [0.035, 0.05],
        [0.012, 0.06],
        [0.012, 0.08],
        [0, 0.08],
      ],
      28,
      32,
    );
    const pulley = new Merger();
    pulley.add(new THREE.TorusGeometry(0.06, 0.022, 10, 28).rotateY(Math.PI / 2));
    pulley.add(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 20).rotateZ(Math.PI / 2));
    return { holder, bulb, weight, pulley: pulley.build() };
  });
}

function BenchLamp({ x }: { x: number }) {
  const y = BENCH_LAMPS.y;
  const z = BENCH_LAMPS.z;
  const shade = benchShadeGeometry();
  const parts = lampPartGeometries();
  const hook = hookGeometry();
  const enamel = wmat('bench-enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide }));
  const brass = wmat('lamp-brass', () => new THREE.MeshStandardMaterial({ color: '#b98a46', metalness: 0.9, roughness: 0.35 }));
  const bakelite = wmat('bakelite', () => new THREE.MeshPhysicalMaterial({ color: '#2a1a12', roughness: 0.35, clearcoat: 0.6 }));
  const porcelain = wmat('porcelain', () => new THREE.MeshPhysicalMaterial({ color: '#f2eee4', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const cord = wmat('lamp-cord', () => new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.8 }));
  const bulb = wmat('bench-bulb', () => new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffc979'), emissiveIntensity: 2.4, roughness: 0.25 }));
  const cords = useMemo(
    () =>
      once(`ws:bench-cords:${y}`, () => {
        const top = BEAM_Y - 0.1 - y;
        const m = new Merger();
        // the lamp's flex over the pulley, and the loop down to the weight and back up to its hook
        m.add(tubeThrough([V(0, 0.1, 0), V(0, top * 0.5, 0.004), V(0, top - 0.08, 0)], () => 0.011, 10, 6).geometry);
        const wy = top - 0.95;
        m.add(tubeThrough([V(0.13, top - 0.08, 0), V(0.13, wy + 0.3, 0.004), V(0.15, wy + 0.1, 0)], () => 0.008, 8, 5).geometry);
        m.add(tubeThrough([V(0.15, wy + 0.1, 0), V(0.2, wy + 0.4, 0.003), V(0.26, top + 0.06, 0)], () => 0.008, 8, 5).geometry);
        return { geo: m.build(), top, wy };
      }),
    [y],
  );
  return (
    <group position={[x, y, z]}>
      <mesh geometry={shade} material={enamel} castShadow />
      <mesh geometry={parts.holder} material={bakelite} />
      <mesh geometry={parts.bulb} material={bulb} />
      <mesh geometry={cords.geo} material={cord} />
      <mesh geometry={parts.pulley} material={porcelain} position={[0.065, cords.top - 0.08, 0]} />
      <mesh geometry={parts.weight} material={porcelain} position={[0.15, cords.wy, 0]} castShadow />
      <mesh geometry={hook} material={brass} position={[0.065, cords.top + 0.02, 0]} />
      <mesh geometry={hook} material={brass} position={[0.26, cords.top + 0.1, 0]} />
    </group>
  );
}

// ---------- the reflector over the tool wall ----------

/** A long trough reflector in green enamel (white inside) with three bulbs, hung on two chains. Built open-side down; tipped toward the wall where it is used. */
function reflectorGeometries() {
  return once('ws:reflector', () => {
    const len = 2.6;
    // a half-pipe along x, its curve on the +y side, open downward
    const halfPipe = (r: number, h: number, closed: boolean) => new THREE.CylinderGeometry(r, r, h, 28, 1, !closed, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
    const shell = new Merger();
    const green = C('#2c4a3a');
    const white = C('#f4efe2');
    const outer = halfPipe(0.3, len, false);
    const inner = halfPipe(0.288, len - 0.01, false);
    shell.add(outer, undefined, green);
    shell.add(inner, undefined, white);
    for (const sx of [-1, 1]) shell.add(halfPipe(0.3, 0.02, true), trs([(sx * len) / 2, 0, 0]), green);
    // a rolled rim along both long edges
    for (const sz of [-1, 1]) shell.add(new THREE.CylinderGeometry(0.014, 0.014, len, 8).rotateZ(Math.PI / 2), trs([0, 0, sz * 0.294]), green);
    const bulbs = new Merger();
    for (const bx of [-0.85, 0, 0.85]) bulbs.add(new THREE.SphereGeometry(0.075, 20, 14), trs([bx, 0.13, 0]));
    // the chains rise from where the tipped shell's top ends up
    const chains = new Merger();
    for (const cx of [-1.0, 1.0])
      for (let k = 0; k < 8; k++) chains.add(new THREE.TorusGeometry(0.022, 0.006, 5, 10), trs([cx, 0.24 + k * 0.095, 0.2], [0, k % 2 ? Math.PI / 2 : 0, 0]));
    return { shell: shell.build(), bulbs: bulbs.build(), chains: chains.build(), len };
  });
}

function Reflector() {
  const g = reflectorGeometries();
  const enamel = wmat('bench-enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide }));
  const iron = wmat('strap-iron', () => new THREE.MeshStandardMaterial({ color: '#26211d', metalness: 0.55, roughness: 0.55 }));
  const bulb = wmat('reflector-bulb', () => new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffd08a'), emissiveIntensity: 2.0, roughness: 0.3 }));
  return (
    <group position={REFLECTOR}>
      <mesh geometry={g.chains} material={iron} />
      {/* tipped toward the tool wall */}
      <group rotation={[0.75, 0, 0]}>
        <mesh geometry={g.shell} material={enamel} castShadow />
        <mesh geometry={g.bulbs} material={bulb} />
      </group>
    </group>
  );
}

/** The light fixtures hung from the ceiling (meshes only; hidden in the top shot with the ceiling). */
export function HangingLamps() {
  return (
    <group>
      {BENCH_LAMPS.xs.map((x) => (
        <BenchLamp key={x} x={x} />
      ))}
      <Reflector />
    </group>
  );
}

// ---------- the light set ----------

function KeyLight() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={[0, 0.4, -3.2]} />
      {/* a broad warm key from high over the shop floor: it lights the workshop and casts the soft shadows, and falls away toward the camera */}
      <spotLight
        position={[0, 13, 6.5]}
        target={target}
        intensity={28}
        distance={0}
        decay={1.35}
        angle={0.86}
        penumbra={0.7}
        color="#ffd9aa"
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

/** The bench lamps' light: a pool under each shade, falling on the bench and the makers' faces. */
function BenchLights() {
  const targets = useMemo(
    () =>
      BENCH_LAMPS.xs.map((x) => {
        const o = new THREE.Object3D();
        o.position.set(x, 0, BENCH_LAMPS.z - 0.7);
        return o;
      }),
    [],
  );
  return (
    <>
      {targets.map((t, i) => (
        <primitive key={`t${i}`} object={t} />
      ))}
      {BENCH_LAMPS.xs.map((x, i) => (
        <spotLight key={x} position={[x, BENCH_LAMPS.y - 0.2, BENCH_LAMPS.z]} target={targets[i]} color="#ffc27a" intensity={16} distance={14} decay={1.55} angle={1.05} penumbra={0.65} />
      ))}
    </>
  );
}

/** The reflector's wash over the pegboards, the tool bench and the toy shelves. */
function ToolWallLight() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={[0, 2.4, ROOM.back]} />
      <spotLight position={[REFLECTOR[0], REFLECTOR[1] - 0.1, REFLECTOR[2] - 0.15]} target={target} color="#ffd6a0" intensity={24} distance={0} decay={1.35} angle={1.12} penumbra={0.85} />
    </>
  );
}

/** The fire's glow through the stove door, breathing slowly. */
function StoveLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = 7 * stoveFlicker(clock.elapsedTime);
  });
  return <pointLight ref={ref} position={[STOVE.x + 0.45, 0.62, STOVE.z + 0.62]} color="#ff7a32" intensity={7} distance={8} decay={1.6} />;
}

/** The window light's colour at night (moonlight) and on a sunny day (warm daylight). */
const WINDOW_NIGHT = new THREE.Color('#7f9fe0');
const WINDOW_DAY = new THREE.Color('#ffd3a0');

/** Light through the two windows: cool at night, warm daylight on a sunny day. */
function WindowLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    l.intensity = 7 * workshopLightLevels.window;
    l.color.copy(WINDOW_NIGHT).lerp(WINDOW_DAY, workshopLightLevels.day);
  });
  return <pointLight ref={ref} position={[ROOM.x0 + 1.5, 4.4, ROOM.back + 1.9]} color="#7f9fe0" intensity={7} distance={12} decay={1.6} />;
}

export function WorkshopLights() {
  return (
    <group>
      <hemisphereLight args={['#b08462', '#140a05', 0.3]} />
      <KeyLight />
      <BenchLights />
      <ToolWallLight />
      <StoveLight />
      <WindowLight />
    </group>
  );
}
