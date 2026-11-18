import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { TABLE } from '../kitchen/plan';
import { CEIL, COUNTER, HOOD, LEDGE, ROOM } from './ramen-dims';
import { C, mat, Merger, mix, once, paintLathe, rand, smoothLathe, smoothstep, tex, trs, V } from './ramen-kit';

// The kitchen's one fixed set of lights (never added or removed at runtime, so
// no material ever recompiles): a soft warm fill, a key light that casts the
// shadows over the counter and the stations, four paper-globe pendants over the
// counter, the work light under the hood, the light from the windows (cool at
// night, warm daylight on a sunny day) and a red lantern over the staff table.
// The pass lamps' light is the cooks'.

/** The pendants over the counter: x positions, the height of the globes' centres, and z. */
export const PENDANTS = { xs: [-5.4, -1.8, 1.8, 5.4], y: 5.25, z: (COUNTER.front + LEDGE.front) / 2 - 0.25 };
/** Where the counter pendants' four lights sit (x): spread wider than the globes to reach the dining tables too. */
const PENDANT_LIGHTS_X = [-6.6, -2.2, 2.2, 6.6];
/** The red lantern over the staff table. */
export const TABLE_LANTERN: [number, number, number] = [TABLE.x, 3.7, TABLE.z];

/** Live levels the weather pushes, read every frame: how strong the window light is, and how much of it is daylight (0 at night, 1 on a sunny day). */
export const ramenLightLevels = { window: 1, day: 0 };

// ---------- paper globe pendants ----------

/** Washi paper with bamboo ribs: bright between the ribs, warmer and darker toward the caps. */
function paperTex() {
  return tex('globe-paper', 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#d9b98a');
    grad.addColorStop(0.18, '#fff1d6');
    grad.addColorStop(0.5, '#fff8ea');
    grad.addColorStop(0.82, '#fff1d6');
    grad.addColorStop(1, '#d9b98a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const r = rand(3);
    // fibres in the paper
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '200,160,110' : '255,255,255'},${0.08 + r() * 0.1})`;
      g.lineWidth = 0.6 + r();
      g.beginPath();
      const x = r() * w;
      const y = r() * h;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20, x + (r() - 0.5) * 30, y + (r() - 0.5) * 30);
      g.stroke();
    }
    // horizontal bamboo ribs (the hoops of the globe), seen as darker bands through the paper
    for (let k = 1; k < 14; k++) {
      const y = (k / 14) * h;
      g.fillStyle = 'rgba(120,80,40,0.35)';
      g.fillRect(0, y - 1.5, w, 3);
    }
  });
}

function globeGeometry(n: number) {
  return smoothLathe(
    [
      [0.1, -0.36],
      [0.24, -0.33],
      [0.36, -0.22],
      [0.41, -0.06],
      [0.41, 0.06],
      [0.36, 0.22],
      [0.24, 0.33],
      [0.1, 0.36],
    ],
    n,
    40,
  );
}

function capsGeometry() {
  // lacquered top and bottom rings
  const m = new Merger();
  const ring = (y: number, r0: number, r1: number) =>
    smoothLathe(
      [
        [r0, y - 0.03],
        [r1, y - 0.03],
        [r1 + 0.008, y],
        [r1, y + 0.03],
        [r0, y + 0.03],
      ],
      12,
      32,
    );
  m.add(ring(0.36, 0.06, 0.11));
  m.add(ring(-0.36, 0.06, 0.11));
  m.add(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 12), trs([0, 0.42, 0]));
  return m.build();
}

function PaperPendant({ x, z }: { x: number; z: number }) {
  const glow = mat('globe', () => {
    const m = new THREE.MeshStandardMaterial({ map: paperTex(), emissiveMap: paperTex(), emissive: new THREE.Color('#ffb15e'), emissiveIntensity: 1.55, roughness: 0.9, side: THREE.DoubleSide });
    return m;
  });
  const lacquer = mat('lacquer', () => new THREE.MeshPhysicalMaterial({ color: '#1a1412', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }));
  const cord = mat('pendant-cord', () => new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.75 }));
  const geo = useMemo(
    () =>
      once('ramen:globe', () => {
        const n = 40;
        const g = globeGeometry(n);
        // UVs: u around, v along the profile (so ribs run round the globe)
        const uv = g.attributes.uv;
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + 0.36) / 0.72);
        return { globe: g, caps: capsGeometry() };
      }),
    [],
  );
  const y = PENDANTS.y;
  const cordG = useMemo(() => once(`ramen:pendant-cord:${y}`, () => tubeThrough([V(0, 0.44, 0), V(0, (CEIL - y) * 0.6, 0.003), V(0, CEIL - y, 0)], () => 0.012, 8, 6).geometry), [y]);
  return (
    <group position={[x, y, z]}>
      <mesh geometry={geo.globe} material={glow} />
      <mesh geometry={geo.caps} material={lacquer} castShadow />
      <mesh geometry={cordG} material={cord} />
    </group>
  );
}

// ---------- the red lantern over the staff table ----------

function lanternTex() {
  return tex('table-lantern', 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#7a1410');
    grad.addColorStop(0.2, '#d8301e');
    grad.addColorStop(0.5, '#ef4a2a');
    grad.addColorStop(0.8, '#d8301e');
    grad.addColorStop(1, '#7a1410');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let k = 1; k < 12; k++) {
      g.fillStyle = 'rgba(60,8,4,0.4)';
      g.fillRect(0, (k / 12) * h - 1.5, w, 3);
    }
    // black lacquered bands top and bottom, and a loose painted wave round the middle (a pattern, not a word)
    g.fillStyle = 'rgba(20,6,4,0.85)';
    g.fillRect(0, 0, w, h * 0.09);
    g.fillRect(0, h * 0.91, w, h * 0.09);
    g.strokeStyle = 'rgba(30,8,4,0.7)';
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = h * 0.5 + Math.sin((x / w) * Math.PI * 6) * h * 0.09;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = h * 0.64 + Math.sin((x / w) * Math.PI * 6 + 0.9) * h * 0.06;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  });
}

function TableLantern() {
  const glow = mat('red-lantern', () => new THREE.MeshStandardMaterial({ map: lanternTex(), emissiveMap: lanternTex(), emissive: new THREE.Color('#ff6a3a'), emissiveIntensity: 1.25, roughness: 0.85, side: THREE.DoubleSide }));
  const lacquer = mat('lacquer', () => new THREE.MeshPhysicalMaterial({ color: '#1a1412', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }));
  const cord = mat('pendant-cord', () => new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.75 }));
  const geo = useMemo(
    () =>
      once('ramen:table-lantern', () => {
        const n = 40;
        const g = smoothLathe(
          [
            [0.12, -0.3],
            [0.22, -0.27],
            [0.29, -0.15],
            [0.31, 0],
            [0.29, 0.15],
            [0.22, 0.27],
            [0.12, 0.3],
          ],
          n,
          36,
        );
        const uv = g.attributes.uv;
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + 0.3) / 0.6);
        const caps = new Merger();
        for (const y of [0.3, -0.3])
          caps.add(
            smoothLathe(
              [
                [0.08, y - 0.035],
                [0.13, y - 0.035],
                [0.135, y],
                [0.13, y + 0.035],
                [0.08, y + 0.035],
              ],
              10,
              28,
            ),
          );
        // a short tassel cord under it
        caps.add(tubeThrough([V(0, -0.33, 0), V(0, -0.45, 0.005)], () => 0.008, 4, 5).geometry);
        return { globe: g, caps: caps.build() };
      }),
    [],
  );
  const [x, y, z] = TABLE_LANTERN;
  const cordG = useMemo(() => once('ramen:table-cord', () => tubeThrough([V(0, 0.33, 0), V(0, (CEIL - y) * 0.5, 0.003), V(0, CEIL - y, 0)], () => 0.011, 8, 6).geometry), [y]);
  return (
    <group position={[x, y, z]}>
      <mesh geometry={geo.globe} material={glow} />
      <mesh geometry={geo.caps} material={lacquer} />
      <mesh geometry={cordG} material={cord} />
    </group>
  );
}

// ---------- the ceiling fan ----------

export const FAN: [number, number, number] = [-2.6, CEIL, 6.2];

function fanGeometries() {
  return once('ramen:fan', () => {
    const n = 30;
    const body = smoothLathe(
      [
        [0, 0],
        [0.07, 0],
        [0.08, -0.04],
        [0.05, -0.55],
        [0.16, -0.6],
        [0.22, -0.68],
        [0.22, -0.76],
        [0.16, -0.82],
        [0.05, -0.85],
        [0, -0.86],
      ],
      n,
      32,
    );
    const brass = C('#b8894a');
    const dark = C('#3a2a1c');
    paintLathe(body, n, (_x, y, _z, _a, out) => mix(out, dark, brass, smoothstep(-0.6, -0.66, y) * smoothstep(-0.82, -0.78, y)));
    const blades = new Merger();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = new THREE.Shape();
      s.moveTo(0.2, -0.05);
      s.bezierCurveTo(0.6, -0.12, 1.3, -0.13, 1.42, -0.06);
      s.bezierCurveTo(1.46, 0, 1.46, 0.04, 1.42, 0.08);
      s.bezierCurveTo(1.3, 0.14, 0.6, 0.12, 0.2, 0.05);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      blades.add(g, trs([0, -0.72, 0], [0.12, a, 0], 1, 'YXZ'));
    }
    return { body, blades: blades.build() };
  });
}

function CeilingFan() {
  const g = fanGeometries();
  const wood = mat('fan-wood', () => new THREE.MeshStandardMaterial({ color: '#6a4426', roughness: 0.5 }));
  const body = mat('fan-body', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.4 }));
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.9;
  });
  return (
    <group position={FAN}>
      <mesh geometry={g.body} material={body} />
      <group ref={spin}>
        <mesh geometry={g.blades} material={wood} castShadow />
      </group>
    </group>
  );
}

// ---------- the light set ----------

/** The work light under the hood: a wide, soft spot washing the back line, its tiles and shelves (no shadows). */
function HoodStrip() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={[0, 0.9, ROOM.back + 0.6]} />
      <spotLight position={[0, HOOD.y0 - 0.1, (ROOM.back + HOOD.front) / 2 + 0.35]} target={target} color="#ffd29a" intensity={30} distance={0} decay={1.4} angle={1.25} penumbra={0.9} />
    </>
  );
}

function KeyLight() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={[0, 0.4, -3.2]} />
      {/* a broad warm key from high over the customers' side: it lights the kitchen and casts the soft shadows, and falls away before the dining floor near the camera */}
      <spotLight
        position={[0, 13, 6.5]}
        target={target}
        intensity={30}
        distance={0}
        decay={1.35}
        angle={0.7}
        penumbra={0.75}
        color="#ffd9aa"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-near={4}
        shadow-camera-far={30}
      />
    </>
  );
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
    l.intensity = 7 * ramenLightLevels.window;
    l.color.copy(WINDOW_NIGHT).lerp(WINDOW_DAY, ramenLightLevels.day);
  });
  return <pointLight ref={ref} position={[ROOM.x0 + 1.6, 4.4, ROOM.back + 1.8]} color="#7f9fe0" intensity={7} distance={12} decay={1.6} />;
}

export function RamenLights() {
  return (
    <group>
      <hemisphereLight args={['#b08262', '#140a06', 0.32]} />
      <KeyLight />
      {/* the work light under the hood: a long strip washing the back line, the tiles and the shelves */}
      <HoodStrip />
      <WindowLight />
    </group>
  );
}

/** Light fixtures hung from the ceiling: the paper globes over the counter and the red lantern over the staff table (meshes only). */
export function Pendants() {
  return (
    <group>
      {PENDANTS.xs.map((x) => (
        <PaperPendant key={x} x={x} z={PENDANTS.z} />
      ))}
      <TableLantern />
    </group>
  );
}

/** The light of the hanging fixtures: always on, even when the fixtures themselves are hidden in the top shot. */
export function PendantLights() {
  return (
    <group>
      {/* spread a little wider than the four globes, so the outer two also reach the dining tables in the front corners */}
      {PENDANT_LIGHTS_X.map((x) => (
        <pointLight key={x} position={[x, PENDANTS.y - 0.5, PENDANTS.z + 0.4]} color="#ffb060" intensity={14} distance={11} decay={1.9} />
      ))}
      <pointLight position={[TABLE_LANTERN[0], TABLE_LANTERN[1] - 0.25, TABLE_LANTERN[2]]} color="#ff8a54" intensity={5} distance={7} decay={1.7} />
    </group>
  );
}

export { CeilingFan };
