import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeParts, paintGeometry, tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { noise3, smoothstep, worley3 } from '../../tank/util';
import { clockFaceTexture, dialTexture, globeTexture, grilleTexture, pageEdgeTexture, pageTexture } from './desk-art';
import { grainBump, mapUV, material, metals, paintLathe, pick, planarUV, rand, rimAlong, roundedBox, roundRectShape, slab, softDot, solid, v3, woodTexture } from './desk-kit';

// Things on the desk: a mug of coffee, an open notebook with a fountain pen,
// a pencil cup, a twin-bell alarm clock, a valve radio and a globe.

// ---------- the mug ----------

const GLAZES = ['#b4512d', '#2f4f7f', '#6f8f73', '#e7dcc6', '#c8962e', '#3d4248'] as const;

const MUG: [number, number][] = [
  [0, 0],
  [0.33, 0],
  [0.36, 0.012],
  [0.37, 0.04],
  [0.355, 0.066],
  [0.385, 0.095],
  [0.41, 0.2],
  [0.42, 0.45],
  [0.416, 0.7],
  [0.406, 0.86],
  [0.4, 0.93],
  [0.392, 0.955],
  [0.376, 0.958],
  [0.366, 0.935],
  [0.37, 0.8],
  [0.37, 0.5],
  [0.356, 0.22],
  [0.3, 0.13],
  [0, 0.115],
];

function mugGeometry(glaze: string) {
  const n = 160;
  const g = smoothLathe(MUG, n, 72);
  const rim = rimAlong(MUG, n);
  const G = new THREE.Color(glaze);
  const pool = G.clone().multiplyScalar(0.62);
  const clay = new THREE.Color('#a8865f');
  const speck = new THREE.Color('#4a3622');
  const inside = new THREE.Color('#efe6d2');
  return paintLathe(g, n, (x, y, z, along, out) => {
    const a = Math.atan2(z, x);
    const drip = 0.24 + 0.035 * noise3(Math.cos(a) * 2, Math.sin(a) * 2, 1.7) + 0.09 * Math.pow(Math.max(0, Math.sin(a * 5 + 1.3)), 10);
    if (along < rim) {
      if (y < drip) {
        out.copy(clay);
        if (worley3(x * 34, y * 34, z * 34) < 0.13) out.copy(speck);
      } else {
        out.copy(G).lerp(pool, smoothstep(drip + 0.07, drip, y) * 0.85);
        out.lerp(inside, smoothstep(0.9, 0.955, y) * 0.3);
        if (worley3(x * 22, y * 22, z * 22) < 0.07) out.multiplyScalar(0.85);
      }
    } else {
      out.copy(inside);
      if (y > 0.935) out.copy(G).lerp(inside, 0.35);
    }
  });
}

function mugHandle(glaze: string) {
  const pts = [
    [0.39, 0.8, 0],
    [0.58, 0.84, 0],
    [0.7, 0.66, 0],
    [0.66, 0.42, 0],
    [0.52, 0.3, 0],
    [0.4, 0.28, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return tubeThrough(pts, (t) => 0.05 - 0.008 * Math.sin(Math.PI * t), 40, 12, (_t, _a, out) => out.set(glaze)).geometry;
}

function Steam({ y }: { y: number }) {
  const ref = useRef<THREE.Group>(null);
  const seeds = useMemo(() => {
    const r = rand(5);
    return Array.from({ length: 7 }, (_, i) => ({ ph: i / 7, x: (r() - 0.5) * 0.3, z: (r() - 0.5) * 0.3 }));
  }, []);
  const tex = softDot();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current?.children.forEach((c, i) => {
      const s = seeds[i];
      const k = (t * 0.16 + s.ph) % 1;
      c.position.set(s.x * (0.5 + k) + Math.sin(t * 0.8 + i) * 0.12 * k, k * 1.5, s.z + Math.cos(t * 0.6 + i) * 0.08 * k);
      c.scale.setScalar(0.22 + k * 0.6);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.16 * Math.sin(Math.PI * k);
    });
  });
  return (
    <group ref={ref} position={[0, y, 0]}>
      {seeds.map((_, i) => (
        <sprite key={i}>
          <spriteMaterial map={tex} color="#fff3e4" transparent depthWrite={false} opacity={0} />
        </sprite>
      ))}
    </group>
  );
}

/** A stoneware mug of coffee, half-dipped in glaze (colour by seed), steaming a little. Handle to +x. */
export function Mug({ seed }: { seed: number }) {
  const glaze = pick(rand(seed), GLAZES);
  const m = metals();
  const geo = useMemo(() => {
    const coffee = new THREE.CircleGeometry(0.369, 48).rotateX(-Math.PI / 2);
    const crema = new THREE.Color('#7a4a24');
    const dark = new THREE.Color('#24120a');
    paintGeometry(coffee, (x, _y, z, out) => out.copy(dark).lerp(crema, smoothstep(0.26, 0.37, Math.hypot(x, z))));
    return { body: mugGeometry(glaze), handle: mugHandle(glaze), coffee };
  }, [glaze]);
  const coffeeMat = material('mug:coffee', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
  return (
    <group>
      <mesh geometry={geo.body} material={m.glaze} castShadow receiveShadow />
      <mesh geometry={geo.handle} material={m.glaze} castShadow />
      <mesh geometry={geo.coffee} material={coffeeMat} position={[0, 0.79, 0]} />
      <Steam y={0.85} />
    </group>
  );
}

// ---------- pens and pencils ----------

const RESINS = ['#5a1a24', '#16181c', '#1d3a2c', '#1f2c4f'] as const;

/** A capped fountain pen along +y, tail at y = 0: resin body, gold rings and clip. */
function penGeometry(resin: string) {
  const n = 120;
  const body = smoothLathe(
    [
      [0, 0],
      [0.026, 0.003],
      [0.04, 0.022],
      [0.046, 0.06],
      [0.047, 0.5],
      [0.046, 0.6],
      [0.05, 0.64],
      [0.054, 0.7],
      [0.055, 1.02],
      [0.05, 1.1],
      [0.035, 1.15],
      [0, 1.16],
    ],
    n,
    28,
  );
  solid(body, resin);
  const rings = [0.035, 0.64, 1.085].map((y) => new THREE.CylinderGeometry(0.0565, 0.0565, 0.03, 28).translate(0, y, 0));
  rings[0] = new THREE.CylinderGeometry(0.044, 0.046, 0.025, 28).translate(0, 0.04, 0);
  const clip = tubeThrough(
    [
      [0, 1.1, 0.046],
      [0, 1.085, 0.066],
      [0, 0.95, 0.07],
      [0, 0.82, 0.066],
      [0, 0.79, 0.058],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    () => 0.011,
    24,
    6,
  ).geometry;
  const ball = new THREE.SphereGeometry(0.016, 10, 8).translate(0, 0.79, 0.062);
  return { body, gold: mergeParts([...rings, clip, ball], ['position', 'normal']) };
}

const PENCILS = ['#e6b52e', '#2e6b45', '#b23a2e', '#2d4f8a', '#2a2a2e'] as const;

/** A sharpened hexagonal pencil along +y, eraser at y = 0, point at y = len. */
function pencilGeometry(colour: string, len: number) {
  const bodyLen = len - 0.36;
  const hex = (g: THREE.BufferGeometry) => {
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  };
  const parts = [
    solid(smoothLathe([[0, 0], [0.03, 0.002], [0.036, 0.02], [0.036, 0.07], [0, 0.071]], 16, 16), '#e39a95'),
    solid(new THREE.CylinderGeometry(0.039, 0.039, 0.08, 16).translate(0, 0.105, 0), '#c8c2b0'),
    solid(hex(new THREE.CylinderGeometry(0.037, 0.037, bodyLen, 6).translate(0, 0.145 + bodyLen / 2, 0)), colour),
    solid(hex(new THREE.CylinderGeometry(0.012, 0.037, 0.17, 6).translate(0, 0.145 + bodyLen + 0.085, 0)), '#dcb98c'),
    solid(new THREE.CylinderGeometry(0.0, 0.012, 0.045, 8).translate(0, 0.145 + bodyLen + 0.17 + 0.0225, 0), '#3a3836'),
  ];
  return mergeParts(parts, ['position', 'normal', 'color']);
}

const CUP: [number, number][] = [
  [0, 0],
  [0.29, 0],
  [0.32, 0.015],
  [0.33, 0.06],
  [0.335, 0.5],
  [0.345, 0.92],
  [0.352, 0.975],
  [0.34, 1.0],
  [0.322, 0.99],
  [0.315, 0.92],
  [0.305, 0.14],
  [0, 0.12],
];

function cupGeometry(glaze: string) {
  const n = 120;
  const g = smoothLathe(CUP, n, 96);
  const rim = rimAlong(CUP, n);
  // fluted outside: shallow vertical ribs
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const along = (i % (n + 1)) / n;
    const y = p.getY(i);
    if (along > 0.08 && along < rim - 0.03 && y > 0.07 && y < 0.93) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.035 * Math.abs(Math.cos(a * 9));
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
  }
  g.computeVertexNormals();
  const G = new THREE.Color(glaze);
  const lip = G.clone().lerp(new THREE.Color('#f3ead8'), 0.45);
  return paintLathe(g, n, (x, y, z, along, out) => {
    out.copy(G);
    const a = Math.atan2(z, x);
    out.lerp(lip, Math.pow(Math.abs(Math.cos(a * 9)), 6) * 0.35 * (along < rim ? 1 : 0));
    if (y > 0.95) out.lerp(lip, 0.6);
    if (along > rim + 0.02) out.multiplyScalar(0.55);
  });
}

/** A fluted ceramic cup of pencils and a fountain pen (colours and lean by seed). */
export function PencilCup({ seed }: { seed: number }) {
  const r = rand(seed);
  const glaze = pick(r, ['#7f9a86', '#e4d9c3', '#2f4a6e', '#a8643c'] as const);
  const resin = pick(r, RESINS);
  const m = metals();
  const geo = useMemo(() => {
    const rr = rand(seed + 3);
    const sticks: { g: THREE.BufferGeometry; a: number; tip: boolean; len: number }[] = [];
    const n = 4 + Math.floor(rr() * 2);
    for (let i = 0; i < n; i++) {
      const len = 1.55 + rr() * 0.4;
      sticks.push({ g: pencilGeometry(PENCILS[Math.floor(rr() * PENCILS.length)], len), a: (i / n) * Math.PI * 2 + rr() * 0.6, tip: rr() < 0.8, len });
    }
    return { cup: cupGeometry(glaze), sticks, pen: penGeometry(resin), penA: rr() * Math.PI * 2 };
  }, [seed, glaze, resin]);
  const pencilMat = material('pencil', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
  const resinMat = material('pen:resin', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const lean = (a: number, k: number): [number, number, number] => [Math.sin(a) * k, 0, -Math.cos(a) * k];
  return (
    <group>
      <mesh geometry={geo.cup} material={m.glaze} castShadow receiveShadow />
      {geo.sticks.map((s, i) => (
        <group key={i} position={[Math.cos(s.a) * 0.07, 0.13, Math.sin(s.a) * 0.07]}>
          <group rotation={[Math.sin(s.a) * 0.27, 0, -Math.cos(s.a) * 0.27]}>
            <mesh geometry={s.g} material={pencilMat} castShadow position={s.tip ? [0, 0, 0] : [0, s.len, 0]} rotation={s.tip ? [0, 0, 0] : [Math.PI, 0, 0]} />
          </group>
        </group>
      ))}
      <group position={[Math.cos(geo.penA) * 0.06, 0.13, Math.sin(geo.penA) * 0.06]} rotation={lean(geo.penA + 1.2, 0.2)}>
        <mesh geometry={geo.pen.body} material={resinMat} castShadow />
        <mesh geometry={geo.pen.gold} material={m.gold} />
      </group>
    </group>
  );
}

// ---------- the notebook ----------

const NB = { w: 1.2, d: 1.68, cover: 0.034 };
const LEATHERS = ['#3b2618', '#1f2024', '#5a1e22', '#29402f'] as const;

/** The height of the open pages, a from the gutter: they rise out of the fold and settle flat. */
const pageTop = (a: number) => NB.cover + 0.012 + 0.058 * (1 - Math.exp(-a * 10)) + 0.012 * Math.sin((a / NB.w) * Math.PI);

function pageBlock(side: 1 | -1) {
  const s = new THREE.Shape();
  const N = 40;
  s.moveTo(side * 0.008, NB.cover);
  s.lineTo(side * NB.w, NB.cover);
  for (let i = N; i >= 0; i--) {
    const a = 0.008 + (i / N) * (NB.w - 0.008);
    s.lineTo(side * a, pageTop(a));
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: NB.d, bevelEnabled: false });
  g.translate(0, 0, -NB.d / 2);
  return mapUV(g, (x, y, z) => [x + z, y * 1.1]);
}

function pageSheet(side: 1 | -1) {
  const w = NB.w - 0.02;
  const g = new THREE.PlaneGeometry(w, NB.d - 0.02, 48, 1).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + side * (0.01 + w / 2);
    p.setX(i, x);
    p.setY(i, pageTop(Math.abs(x)) + 0.0015);
  }
  g.computeVertexNormals();
  return g;
}

/** A flat ribbon strip along a path. */
function ribbon(pts: THREE.Vector3[], width: number) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const N = 40;
  const pos: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(width / 2);
    if (side.lengthSq() < 1e-8) side.set(width / 2, 0, 0);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** An open notebook: leather cover, ruled pages written on, a ribbon marker, and a fountain pen across it. */
export function Notebook({ seed }: { seed: number }) {
  const r = rand(seed);
  const leather = pick(r, LEATHERS);
  const resin = pick(r, RESINS);
  const m = metals();
  const geo = useMemo(
    () => ({
      cover: planarUV(roundedBox(NB.w * 2 + 0.08, NB.cover, NB.d + 0.08, 0.014, 3).translate(0, NB.cover / 2, 0), 3),
      blockL: pageBlock(-1),
      blockR: pageBlock(1),
      sheetL: pageSheet(-1),
      sheetR: pageSheet(1),
      ribbon: ribbon([v3(0.01, pageTop(0.01) + 0.004, -0.5), v3(0.012, pageTop(0.01) + 0.004, 0.6), v3(0.02, pageTop(0.01) - 0.004, 0.84), v3(0.05, 0.03, 0.92), v3(0.11, 0.004, 1.02), v3(0.2, 0.004, 1.14)], 0.045),
      pen: penGeometry(resin),
    }),
    [resin],
  );
  const leatherMat = material('nb:leather:' + leather, () => new THREE.MeshStandardMaterial({ color: leather, roughness: 0.62, bumpMap: grainBump('leather', { scale: 10, contrast: 0.9 }), bumpScale: 0.35 }));
  const edgeMat = material('nb:edges', () => new THREE.MeshStandardMaterial({ map: pageEdgeTexture(), roughness: 0.9 }));
  const pageL = material('nb:page:' + seed + 'l', () => new THREE.MeshStandardMaterial({ map: pageTexture(seed, 'left'), roughness: 0.92 }));
  const pageR = material('nb:page:' + seed + 'r', () => new THREE.MeshStandardMaterial({ map: pageTexture(seed, 'right'), roughness: 0.92 }));
  const ribbonMat = material('nb:ribbon', () => new THREE.MeshStandardMaterial({ color: '#8a1f2a', roughness: 0.38, side: THREE.DoubleSide }));
  const resinMat = material('pen:resin', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
  return (
    <group>
      <mesh geometry={geo.cover} material={leatherMat} castShadow receiveShadow />
      <mesh geometry={geo.blockL} material={edgeMat} receiveShadow />
      <mesh geometry={geo.blockR} material={edgeMat} receiveShadow />
      <mesh geometry={geo.sheetL} material={pageL} receiveShadow />
      <mesh geometry={geo.sheetR} material={pageR} receiveShadow />
      <mesh geometry={geo.ribbon} material={ribbonMat} receiveShadow />
      <group position={[0.62, pageTop(0.62) + 0.057, 0.12]} rotation={[0, 0.55, 0]}>
        <group rotation={[0, 0, -Math.PI / 2]} position={[-0.58, 0, 0]}>
          <mesh geometry={geo.pen.body} material={resinMat} castShadow />
          <mesh geometry={geo.pen.gold} material={m.gold} castShadow />
        </group>
      </group>
    </group>
  );
}

// ---------- the alarm clock ----------

const CLOCK_ENAMELS = ['#a8332b', '#86b39c', '#e4d6b8', '#25282c'] as const;

function handShape(len: number, wid: number, tail: number) {
  const s = new THREE.Shape();
  s.moveTo(-wid * 0.45, -tail);
  s.lineTo(-wid * 0.3, len * 0.62);
  s.quadraticCurveTo(-wid * 1.25, len * 0.74, 0, len);
  s.quadraticCurveTo(wid * 1.25, len * 0.74, wid * 0.3, len * 0.62);
  s.lineTo(wid * 0.45, -tail);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 10 });
}

/** Clock hands that keep the real time. */
function Hands({ hour, minute, second, z, scale = 1 }: { hour: THREE.BufferGeometry; minute: THREE.BufferGeometry; second: THREE.BufferGeometry; z: number; scale?: number }) {
  const h = useRef<THREE.Mesh>(null);
  const mi = useRef<THREE.Mesh>(null);
  const s = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const d = new Date();
    const sec = d.getSeconds();
    const min = d.getMinutes() + sec / 60;
    const hr = (d.getHours() % 12) + min / 60;
    if (h.current) h.current.rotation.z = -(hr / 12) * Math.PI * 2;
    if (mi.current) mi.current.rotation.z = -(min / 60) * Math.PI * 2;
    if (s.current) s.current.rotation.z = -(sec / 60) * Math.PI * 2;
  });
  const ink = material('clock:ink', () => new THREE.MeshStandardMaterial({ color: '#1c1a18', roughness: 0.4, metalness: 0.3 }));
  const red = material('clock:red', () => new THREE.MeshStandardMaterial({ color: '#b02a22', roughness: 0.4 }));
  return (
    <group position={[0, 0, z]} scale={scale}>
      <mesh ref={h} geometry={hour} material={ink} />
      <mesh ref={mi} geometry={minute} material={ink} position={[0, 0, 0.008]} />
      <mesh ref={s} geometry={second} material={red} position={[0, 0, 0.016]} />
      <mesh material={ink} position={[0, 0, 0.022]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.02, 16]} />
      </mesh>
    </group>
  );
}

export function clockHands(len: number) {
  const second = mergeParts([new THREE.BoxGeometry(0.008, len * 1.05, 0.004).translate(0, len * 0.38, 0), new THREE.CylinderGeometry(0.035, 0.035, 0.004, 16).rotateX(Math.PI / 2).translate(0, -len * 0.1, 0)], ['position', 'normal']);
  return { hour: handShape(len * 0.58, 0.05, len * 0.1), minute: handShape(len * 0.86, 0.036, len * 0.12), second };
}

export { Hands };

function bellGeometry() {
  return smoothLathe(
    [
      [0, 0.0],
      [0.27, 0.0],
      [0.285, 0.02],
      [0.27, 0.1],
      [0.21, 0.2],
      [0.12, 0.25],
      [0, 0.27],
    ],
    50,
    40,
  );
}

/** A twin-bell alarm clock (enamel colour by seed) that keeps the real time. */
export function AlarmClock({ seed }: { seed: number }) {
  const enamelColour = pick(rand(seed), CLOCK_ENAMELS);
  const m = metals();
  const geo = useMemo(() => {
    const drum = smoothLathe(
      [
        [0, 0],
        [0.4, 0],
        [0.5, 0.03],
        [0.55, 0.1],
        [0.56, 0.2],
        [0.56, 0.3],
        [0.55, 0.32],
        [0, 0.32],
      ],
      60,
      72,
    ).rotateX(Math.PI / 2);
    const bezel = smoothLathe(
      [
        [0.5, 0.3],
        [0.58, 0.3],
        [0.6, 0.34],
        [0.585, 0.385],
        [0.55, 0.395],
        [0.52, 0.37],
        [0.5, 0.35],
      ],
      40,
      72,
    ).rotateX(Math.PI / 2);
    const dome = smoothLathe(
      [
        [0.52, 0.36],
        [0.46, 0.39],
        [0.3, 0.42],
        [0, 0.43],
      ],
      30,
      48,
    ).rotateX(Math.PI / 2);
    const handle = tubeThrough(
      [
        [-0.44, 0.4, -0.18],
        [-0.4, 0.78, -0.18],
        [0, 0.98, -0.18],
        [0.4, 0.78, -0.18],
        [0.44, 0.4, -0.18],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      () => 0.026,
      40,
      10,
    ).geometry;
    const leg = tubeThrough(
      [
        [0, 0, 0],
        [0, -0.12, 0.02],
        [0, -0.22, 0.06],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      () => 0.03,
      12,
      8,
    ).geometry;
    const foot = smoothLathe(
      [
        [0, 0],
        [0.06, 0.005],
        [0.075, 0.03],
        [0.05, 0.06],
        [0, 0.065],
      ],
      20,
      16,
    );
    const face = new THREE.CircleGeometry(0.5, 64);
    return { drum, bezel, dome, handle, leg, foot, bell: bellGeometry(), face, hands: clockHands(0.42) };
  }, []);
  const enamel = material('alarm:' + enamelColour, () => new THREE.MeshPhysicalMaterial({ color: enamelColour, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, metalness: 0.1 }));
  const faceMat = material('alarm:face', () => new THREE.MeshStandardMaterial({ map: clockFaceTexture('alarm'), roughness: 0.6 }));
  // the clock stands on its feet; the drum's centre is up at y = cy
  const cy = 0.68;
  return (
    <group>
      <group position={[0, cy, -0.16]}>
        <mesh geometry={geo.drum} material={enamel} castShadow receiveShadow />
        <mesh geometry={geo.bezel} material={m.chrome} castShadow />
        <mesh geometry={geo.face} material={faceMat} position={[0, 0, 0.322]} />
        <Hands hour={geo.hands.hour} minute={geo.hands.minute} second={geo.hands.second} z={0.33} />
        <mesh geometry={geo.dome} material={m.glass} renderOrder={2} />
        {/* bells, the hammer between them, and the carrying handle */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.43, 0.55, -0.02]} rotation={[0, 0, -s * 0.66]}>
            <mesh geometry={geo.bell} material={m.chrome} castShadow />
            <mesh material={m.chrome} position={[0, -0.06, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
            </mesh>
            <mesh material={m.chrome} position={[0, 0.29, 0]}>
              <sphereGeometry args={[0.035, 12, 8]} />
            </mesh>
          </group>
        ))}
        <mesh material={m.chrome} position={[0, 0.58, 0.02]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
        </mesh>
        <mesh material={m.chrome} position={[0, 0.67, 0.02]}>
          <sphereGeometry args={[0.04, 12, 8]} />
        </mesh>
        <mesh geometry={geo.handle} material={m.chrome} castShadow />
        {/* splayed legs */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.36, -0.42, 0.04]} rotation={[0, 0, s * 0.55]}>
            <mesh geometry={geo.leg} material={m.chrome} castShadow />
            <mesh geometry={geo.foot} material={m.chrome} position={[0, -0.305, 0.06]} />
          </group>
        ))}
        {/* winding keys on the back */}
        {[-0.18, 0.18].map((x) => (
          <group key={x} position={[x, 0, -0.04]}>
            <mesh material={m.brass} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.1, 8]} />
            </mesh>
            <mesh material={m.brass} position={[0, 0, -0.07]}>
              <boxGeometry args={[0.14, 0.05, 0.015]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------- the radio ----------

function tombstone(w: number, h: number, side: number, y0 = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, y0);
  s.lineTo(w / 2, y0);
  s.lineTo(w / 2, y0 + side);
  s.bezierCurveTo(w / 2, y0 + side + (h - side) * 0.78, w * 0.3, y0 + h, 0, y0 + h);
  s.bezierCurveTo(-w * 0.3, y0 + h, -w / 2, y0 + side + (h - side) * 0.78, -w / 2, y0 + side);
  s.closePath();
  return s;
}

function knobGeometry() {
  const n = 40;
  const g = smoothLathe(
    [
      [0, 0],
      [0.12, 0],
      [0.13, 0.03],
      [0.128, 0.1],
      [0.105, 0.14],
      [0.06, 0.16],
      [0, 0.165],
    ],
    n,
    60,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (Math.hypot(x, z) > 0.11 && p.getY(i) < 0.12) {
      const k = 1 + 0.05 * Math.max(0, Math.cos(Math.atan2(z, x) * 20));
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  return g.rotateX(Math.PI / 2);
}

/** A walnut tombstone valve radio: arched grille with fretwork, a warm glowing dial and bakelite knobs. */
export function Radio({ seed }: { seed: number }) {
  const r = rand(seed);
  const tone = pick(r, [
    ['#a86a38', '#3f2412'],
    ['#7e4a26', '#2a170b'],
    ['#b48250', '#4a2e16'],
  ] as const);
  const m = metals();
  const D = 0.95;
  const geo = useMemo(() => {
    const body = slab(tombstone(1.9, 2.05, 1.2), D, 0.07, 4, 32);
    // veneer grain runs up the front
    planarUV(body, 0.3);
    const uv = body.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setX(i, uv.getY(i));
      uv.setY(i, u);
    }
    const grille = mapUV(new THREE.ShapeGeometry(tombstone(1.3, 1.12, 0.55), 24), (x, y) => [x * 2.2, y * 2.2]);
    const frameShape = tombstone(1.46, 1.22, 0.6);
    frameShape.holes.push(tombstone(1.3, 1.12, 0.55, 0.04));
    const frame = planarUV(slab(frameShape, 0.07, 0.025, 2, 24), 0.3);
    const slats = [-0.3, 0, 0.3].map((x) => {
      const top = 0.55 + 0.57 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / 0.68, 2.2)));
      return planarUV(roundedBox(0.07, top - 0.02, 0.05, 0.02, 2).translate(x, top / 2 + 0.03, 0), 0.3);
    });
    const bezelShape = roundRectShape(1.06, 0.36, 0.1);
    bezelShape.holes.push(roundRectShape(0.94, 0.25, 0.06));
    const bezel = slab(bezelShape, 0.05, 0.018, 2, 16);
    const dial = mapUV(new THREE.ShapeGeometry(roundRectShape(0.94, 0.25, 0.06), 12), (x, y) => [x / 0.94 + 0.5, y / 0.25 + 0.5]);
    const plinth = planarUV(roundedBox(2.06, 0.14, D + 0.12, 0.05, 3), 0.3);
    return { body, grille, frame, slats, bezel, dial, plinth, knob: knobGeometry() };
  }, []);
  const wood = material('radio:wood:' + tone[0], () => new THREE.MeshPhysicalMaterial({ map: woodTexture('radio:' + tone[0], { w: 512, h: 512, light: tone[0], dark: tone[1], planks: 2, rings: 14, seed: 23, joints: false, seams: 0.2 }), roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
  const dark = material('radio:dark', () => new THREE.MeshPhysicalMaterial({ map: woodTexture('radio:dark', { w: 256, h: 256, light: '#5a3418', dark: '#1e0f06', planks: 1, rings: 10, seed: 3, joints: false, seams: 0 }), roughness: 0.4, clearcoat: 0.6 }));
  const cloth = material('radio:cloth', () => new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.95 }));
  const dial = material('radio:dial', () => new THREE.MeshBasicMaterial({ map: dialTexture(), color: new THREE.Color(1.25, 1.15, 1.0), toneMapped: false }));
  const bakelite = material('radio:knob', () => new THREE.MeshPhysicalMaterial({ color: '#efe3c8', roughness: 0.25, clearcoat: 1 }));
  const front = D / 2;
  return (
    <group>
      <mesh geometry={geo.plinth} material={dark} position={[0, 0.07, 0]} castShadow receiveShadow />
      <group position={[0, 0.14, 0]}>
        <mesh geometry={geo.body} material={wood} castShadow receiveShadow />
        <group position={[0, 0.78, front]}>
          <mesh geometry={geo.grille} material={cloth} position={[0, 0.04, 0.002]} />
          <mesh geometry={geo.frame} material={dark} position={[0, 0, 0.03]} castShadow />
          {geo.slats.map((g, i) => (
            <mesh key={i} geometry={g} material={dark} position={[0, 0.04, 0.03]} castShadow />
          ))}
        </group>
        <group position={[0, 0.46, front]}>
          <mesh geometry={geo.dial} material={dial} position={[0, 0, 0.004]} />
          <mesh geometry={geo.bezel} material={m.brass} position={[0, 0, 0.02]} />
          <mesh material={m.glass} position={[0, 0, 0.035]} renderOrder={2}>
            <planeGeometry args={[0.96, 0.27]} />
          </mesh>
        </group>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} geometry={geo.knob} material={bakelite} position={[x, 0.46, front - 0.01]} castShadow />
        ))}
        <mesh geometry={geo.knob} material={bakelite} position={[0, 0.2, front - 0.01]} scale={0.6} />
      </group>
    </group>
  );
}

// ---------- the globe ----------

/** A desk globe on a turned walnut stand, tilted on a brass half-meridian. Turns very slowly. */
export function Globe({ seed }: { seed: number }) {
  const m = metals();
  const R = 0.72;
  const spin = useRef<THREE.Mesh>(null);
  const start = useMemo(() => rand(seed)() * Math.PI * 2, [seed]);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.05;
  });
  const geo = useMemo(() => {
    const base = smoothLathe(
      [
        [0, 0],
        [0.56, 0],
        [0.59, 0.03],
        [0.57, 0.08],
        [0.47, 0.12],
        [0.42, 0.17],
        [0.31, 0.21],
        [0.16, 0.25],
        [0.12, 0.3],
        [0, 0.31],
      ],
      80,
      64,
    );
    const stem = smoothLathe(
      [
        [0, 0.28],
        [0.07, 0.28],
        [0.09, 0.33],
        [0.05, 0.4],
        [0.04, 0.5],
        [0.07, 0.56],
        [0.04, 0.6],
        [0, 0.61],
      ],
      40,
      24,
    );
    const meridian = new THREE.TorusGeometry(R + 0.06, 0.022, 10, 80, Math.PI).rotateZ(Math.PI / 2);
    return { base, stem, meridian, ball: new THREE.SphereGeometry(R, 72, 48) };
  }, []);
  const wood = material('globe:wood', () => new THREE.MeshPhysicalMaterial({ map: woodTexture('globe-base', { w: 512, h: 256, light: '#7a4a28', dark: '#2a160a', planks: 1, rings: 12, seed: 6, joints: false, seams: 0 }), roughness: 0.35, clearcoat: 0.7 }));
  const map = material('globe:map', () => new THREE.MeshPhysicalMaterial({ map: globeTexture(), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  return (
    <group>
      <mesh geometry={geo.base} material={wood} castShadow receiveShadow />
      <mesh geometry={geo.stem} material={m.brass} castShadow />
      <group position={[0, 0.62, 0]} rotation={[0, 0.5, -0.41]}>
        <group position={[0, R + 0.06, 0]}>
          <mesh ref={spin} geometry={geo.ball} material={map} rotation={[0, start, 0]} castShadow receiveShadow />
          <mesh geometry={geo.meridian} material={m.brass} castShadow />
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.brass} position={[0, s * (R + 0.03), 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.08, 10]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
