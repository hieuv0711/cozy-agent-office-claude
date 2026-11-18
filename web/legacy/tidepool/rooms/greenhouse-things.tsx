import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { cone, ellipsoid, meshSDF, smin, sphere, type SDF } from '../../tank/sdf';
import {
  aim,
  C,
  canvasTexture,
  clayMaterial,
  leafGeometry,
  leafMaterial,
  leafPaint,
  Merger,
  mix,
  noise3,
  once,
  paint,
  plank,
  type PotShape,
  repeated,
  rng,
  smoothstep,
  soilTexture,
  terracottaGeometry,
  trs,
  V,
  vcMaterial,
  vcPhysical,
  woodTexture,
  worley3,
} from './greenhouse-kit';

// The potting-bench things: a watering can, a seed tray of seedlings, a stack
// of clay pots with a ball of twine, a candle lantern, a trowel with a pair of
// gloves, and a ceramic snail.

const variantOf = (seed: number, n: number) => ((Math.floor(seed) % n) + n) % n;

// ---------- watering can ----------

/** Hot-dip zinc: a patchwork of crystal spangles. */
function spangleTexture() {
  return canvasTexture('gh-spangle', 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const r = rng(12);
    const cells = 14;
    const pts: [number, number, number][] = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + r()) / cells, (j + r()) / cells, 0.82 + r() * 0.2]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        let best = 9;
        let tone = 1;
        for (const [px, py, t] of pts) {
          for (const ox of [-1, 0, 1])
            for (const oy of [-1, 0, 1]) {
              const dx = u - px - ox;
              const dy = v - py - oy;
              const d = dx * dx + dy * dy;
              if (d < best) {
                best = d;
                tone = t;
              }
            }
        }
        const val = Math.round(255 * Math.min(1, tone * (0.97 + 0.03 * Math.sin((u + v) * 200))));
        const i4 = (y * w + x) * 4;
        img.data[i4] = img.data[i4 + 1] = img.data[i4 + 2] = val;
        img.data[i4 + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  });
}

const CANS = [
  { body: '#a9b0ad', metal: 0.85, rough: 0.42, spangle: true },
  { body: '#6f8b6c', metal: 0.1, rough: 0.35, spangle: false },
  { body: '#b9744a', metal: 0.9, rough: 0.3, spangle: false },
];

function canGeometry() {
  return once('gh-can', () => {
    const body = new Merger();
    const n = 120;
    const lathe = smoothLathe(
      [
        [0, 0],
        [0.47, 0],
        [0.5, 0.02],
        [0.51, 0.06],
        [0.5, 0.1],
        [0.5, 0.5],
        [0.49, 0.78],
        [0.47, 0.84],
        [0.4, 0.92],
        [0.28, 0.98],
        [0.2, 1.0],
        [0.19, 1.07],
        [0.215, 1.08],
        [0.2, 1.1],
        [0.17, 1.07],
        [0.165, 0.99],
        [0, 0.96],
      ],
      n,
      64,
    );
    body.add(lathe);
    // rolled bands round the foot and the shoulder
    body.add(new THREE.TorusGeometry(0.505, 0.018, 8, 64), trs([0, 0.11, 0], [Math.PI / 2, 0, 0]));
    body.add(new THREE.TorusGeometry(0.49, 0.016, 8, 64), trs([0, 0.8, 0], [Math.PI / 2, 0, 0]));
    // the long spout, rising from low on the front
    const spout = tubeThrough([V(0, 0.2, 0.38), V(0, 0.32, 0.62), V(0, 0.68, 0.98), V(0, 1.06, 1.3), V(0, 1.18, 1.42)], (t) => 0.07 - t * 0.032, 40, 14).geometry;
    body.add(spout);
    // a brace from the spout back to the body
    body.add(tubeThrough([V(0, 0.62, 0.44), V(0, 0.66, 0.7), V(0, 0.72, 0.96)], () => 0.014, 12, 6).geometry);
    // handles: one arching over the top, one down the back
    body.add(tubeThrough([V(0, 1.06, -0.12), V(0, 1.42, -0.02), V(0, 1.44, 0.22), V(0, 1.22, 0.38), V(0, 0.9, 0.42)], () => 0.034, 50, 10).geometry);
    body.add(tubeThrough([V(0, 0.98, -0.27), V(0, 1.02, -0.62), V(0, 0.72, -0.72), V(0, 0.42, -0.5)], () => 0.032, 40, 10).geometry);
    const g = body.build();
    // UVs for the spangle: cylindrical
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, Math.atan2(p.getX(i), p.getZ(i)) / Math.PI + 1, p.getY(i) * 1.2);
    return g;
  });
}

function roseGeometry() {
  return once('gh-rose', () => {
    const g = smoothLathe(
      [
        [0.03, -0.1],
        [0.06, -0.06],
        [0.12, 0.0],
        [0.13, 0.02],
        [0.11, 0.04],
        [0.0, 0.05],
      ],
      30,
      28,
    );
    // the sprinkler holes
    return paint(g, (x, y, z, out) => {
      out.set('#c79b55');
      if (y > 0.03 && worley3(x * 60, z * 60, 1) < 0.22) out.set('#2a1d10');
    });
  });
}

export function WateringCan({ seed }: { seed: number }) {
  const v = variantOf(seed, CANS.length);
  const k = CANS[v];
  const geo = canGeometry();
  const rose = roseGeometry();
  const mat = useMemo(
    () =>
      once(`mat:can:${v}`, () =>
        k.spangle
          ? new THREE.MeshStandardMaterial({ color: k.body, metalness: k.metal, roughness: k.rough, map: repeated(spangleTexture(), 2, 2, 'spangle'), roughnessMap: null })
          : new THREE.MeshPhysicalMaterial({ color: k.body, metalness: k.metal, roughness: k.rough, clearcoat: k.metal < 0.5 ? 0.6 : 0, clearcoatRoughness: 0.25 }),
      ),
    [v, k],
  );
  const brass = useMemo(() => once('mat:brass-vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.35 })), []);
  const dir = V(0, 0.12, 0.12).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
  return (
    <group>
      <mesh geometry={geo} material={mat} castShadow receiveShadow />
      <mesh geometry={rose} material={brass} position={[0, 1.2, 1.44]} quaternion={q} castShadow />
    </group>
  );
}

// ---------- seed tray ----------

const LABELS = ['Basil', 'Tomato', 'Sweet pea', 'Chilli', 'Lettuce', 'Zinnia'];

function tagTexture(text: string) {
  return canvasTexture(
    `gh-tag-${text}`,
    64,
    256,
    (g, w, h) => {
      g.fillStyle = '#f3efe4';
      g.fillRect(0, 0, w, h);
      g.save();
      g.translate(w / 2 + 6, h * 0.42);
      g.rotate(-Math.PI / 2);
      g.fillStyle = '#2b3a5a';
      g.font = 'italic 30px "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 0, 0);
      g.restore();
      // the pointed end, pushed into the soil
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, h - 28);
      g.lineTo(w / 2, h);
      g.lineTo(w, h - 28);
      g.lineTo(w, h);
      g.fill();
    },
    { wrap: false },
  );
}

function trayGeometry(variant: number) {
  const r = rng(variant * 7 + 3);
  const W = 1.75;
  const D = 1.05;
  const H = 0.3;
  const t = 0.07;
  const wood = new Merger();
  const tone = () => new THREE.Color().setHSL(0.08, 0.22, 0.52 + (r() - 0.5) * 0.1).multiplyScalar(2);
  wood.add(plank(W, t, D, 0.015, [0.35, 0.8], 2, [r(), r()]), trs([0, t / 2, 0]), tone());
  for (const s of [-1, 1]) {
    wood.add(plank(W, H, t, 0.02, [0.35, 0.8], 2, [r(), r()]), trs([0, H / 2, s * (D / 2 - t / 2)]), tone());
    wood.add(plank(t, H, D - 2 * t, 0.02, [0.35, 0.8], 2, [r(), r()]), trs([s * (W / 2 - t / 2), H / 2, 0]), tone());
  }
  // soil, a little mounded, with world-sized UVs for the crumbs
  const soil = new THREE.PlaneGeometry(W - 2 * t, D - 2 * t, 24, 14).rotateX(-Math.PI / 2);
  const sp = soil.attributes.position;
  const suv = soil.attributes.uv;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    sp.setY(i, H - 0.06 + noise3(x * 6, 1, z * 6) * 0.018 + 0.02 * (1 - (x / (W / 2)) ** 2) * (1 - (z / (D / 2)) ** 2));
    suv.setXY(i, x * 0.9, z * 0.9);
  }
  soil.computeVertexNormals();
  // the seedlings: a stem, two seed leaves, and on the older ones a pair of true leaves
  const plants = new Merger();
  const coty = leafGeometry({ len: 0.09, width: 0.06, nu: 2, nv: 3, cup: 0.3, arch: 0.4, paint: leafPaint('#6aa64a', '#a8d77a') });
  const trueLeaf = leafGeometry({ len: 0.13, width: 0.08, nu: 2, nv: 4, fold: 0.2, arch: 0.5, ruffle: 0.006, ruffleFreq: 30, paint: leafPaint('#3f7c31', '#5f9a43', { veins: 4 }) });
  const rows = 4;
  const cols = 7;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      if (r() < 0.08) continue;
      const x = -W / 2 + t + ((j + 0.5) / cols) * (W - 2 * t) + (r() - 0.5) * 0.05;
      const z = -D / 2 + t + ((i + 0.5) / rows) * (D - 2 * t) + (r() - 0.5) * 0.05;
      const hgt = 0.1 + r() * 0.14 + (i === 1 ? 0.06 : 0);
      const lean = V((r() - 0.5) * 0.06, hgt, (r() - 0.5) * 0.06 + 0.02);
      const base = V(x, H - 0.06, z);
      const top = base.clone().add(lean);
      plants.add(tubeThrough([base, base.clone().add(V(lean.x * 0.2, hgt * 0.5, lean.z * 0.6)), top], () => 0.007, 8, 4, (tt, _a, o) => mix(o, C('#c8d6a0'), C('#7fae55'), tt)).geometry);
      const yaw = r() * Math.PI;
      const side = V(Math.cos(yaw), 0, Math.sin(yaw));
      for (const s of [-1, 1]) plants.add(coty, aim(top, side.clone().multiplyScalar(s).add(V(0, 0.5, 0)).normalize(), V(0, 1, 0), 0.9 + r() * 0.3));
      if (hgt > 0.18) {
        const side2 = V(-side.z, 0, side.x);
        for (const s of [-1, 1]) plants.add(trueLeaf, aim(top.clone().add(V(0, 0.015, 0)), side2.clone().multiplyScalar(s).add(V(0, 0.9, 0)).normalize(), V(0, 1, 0), 0.8 + r() * 0.4));
      }
    }
  return { wood: wood.build(), soil, plants: plants.build() };
}

export function SeedTray({ seed }: { seed: number }) {
  const v = variantOf(seed, 3);
  const g = useMemo(() => once(`tray:${v}`, () => trayGeometry(v)), [v]);
  const wood = useMemo(() => once('mat:tray-wood', () => new THREE.MeshStandardMaterial({ map: woodTexture('gh-pine', '#b48f68', '#6d5038', 9), vertexColors: true, roughness: 0.75 })), []);
  const soilMat = useMemo(() => once('mat:tray-soil', () => new THREE.MeshStandardMaterial({ map: repeated(soilTexture(), 1, 1, 'tray-soil'), roughness: 1, color: '#c2b0a2' })), []);
  const names = [LABELS[variantOf(seed, LABELS.length)], LABELS[variantOf(seed + 2, LABELS.length)]];
  return (
    <group>
      <mesh geometry={g.wood} material={wood} castShadow receiveShadow />
      <mesh geometry={g.soil} material={soilMat} receiveShadow />
      <mesh geometry={g.plants} material={leafMaterial('seedling', { roughness: 0.55 })} castShadow />
      {names.map((name, i) => (
        <mesh key={name + i} position={[i ? 0.55 : -0.62, 0.36, i ? 0.24 : -0.2]} rotation={[-0.12, i ? -0.3 : 0.25, i ? 0.08 : -0.1]} castShadow>
          <planeGeometry args={[0.07, 0.28]} />
          <meshStandardMaterial map={tagTexture(name)} transparent alphaTest={0.5} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- a stack of clay pots and a ball of twine ----------

const STACK_POT: PotShape = { r: 0.46, h: 0.74, soil: 0.1 };
const SIDE_POT: PotShape = { r: 0.33, h: 0.54, soil: 0.1 };
const LITTLE_POT: PotShape = { r: 0.25, h: 0.4, soil: 0.1 };

function twineGeometry() {
  return once('gh-twine', () => {
    const g = new Merger();
    const ball = new THREE.SphereGeometry(0.19, 28, 20);
    g.add(
      paint(ball, (x, y, z, out) => {
        // wraps of twine crossing at different angles
        const a = Math.sin((x * 0.8 + y * 0.6) * 70) * Math.sin((z * 0.7 - y * 0.5) * 64);
        mix(out, C('#8a6a3e'), C('#c9a66c'), smoothstep(-0.6, 0.6, a) * 0.8 + 0.1 * noise3(x * 30, y * 30, z * 30));
      }),
    );
    const end = tubeThrough([V(0.12, 0.1, 0.1), V(0.24, 0.0, 0.2), V(0.32, -0.15, 0.28), V(0.46, -0.18, 0.3)], () => 0.012, 20, 4, (_t, _a, o) => o.set('#b08d58')).geometry;
    g.add(end);
    return g.build();
  });
}

export function PotStack({ seed }: { seed: number }) {
  const v = variantOf(seed, 5);
  const big = useMemo(() => once(`pot-stack:${v}`, () => terracottaGeometry(STACK_POT, v + 1, { aged: 0.8 })), [v]);
  const big2 = useMemo(() => once(`pot-stack2:${v}`, () => terracottaGeometry(STACK_POT, v + 2, { aged: 0.5 })), [v]);
  const side = useMemo(() => once(`pot-side:${v}`, () => terracottaGeometry(SIDE_POT, v + 3, { aged: 0.7 })), [v]);
  const little = useMemo(() => once(`pot-little:${v}`, () => terracottaGeometry(LITTLE_POT, v + 4, { aged: 0.4 })), [v]);
  const clay = clayMaterial();
  return (
    <group>
      {/* four pots nested, each sitting a little askew in the one below */}
      <mesh geometry={big} material={clay} castShadow receiveShadow />
      <mesh geometry={big2} material={clay} position={[0.02, 0.2, 0.01]} rotation={[0.05, 0.6, -0.04]} castShadow receiveShadow />
      <mesh geometry={big} material={clay} position={[0.0, 0.4, 0.03]} rotation={[-0.06, 1.7, 0.05]} castShadow receiveShadow />
      <mesh geometry={big2} material={clay} position={[0.03, 0.6, 0.0]} rotation={[0.04, 2.6, 0.06]} castShadow receiveShadow />
      {/* one on its side, and a little one upside down */}
      <mesh geometry={side} material={clay} position={[0.76, SIDE_POT.r * 1.02, 0.38]} rotation={[0, -0.5, Math.PI / 2 - 0.12]} castShadow receiveShadow />
      <mesh geometry={little} material={clay} position={[-0.68, LITTLE_POT.h, 0.36]} rotation={[Math.PI, 0.3, 0]} castShadow receiveShadow />
      <mesh geometry={twineGeometry()} material={vcMaterial('twine', { roughness: 0.95 })} position={[-0.62, LITTLE_POT.h + 0.18, 0.36]} castShadow />
    </group>
  );
}

// ---------- candle lantern ----------

const LANTERNS = [
  { frame: '#1e1f1d', metal: 0.55, rough: 0.45 },
  { frame: '#a77d42', metal: 0.9, rough: 0.32 },
  { frame: '#3d4f45', metal: 0.4, rough: 0.5 },
];

function lanternGeometry() {
  return once('gh-lantern', () => {
    const m = new Merger();
    const S = 0.62;
    // ball feet, the plinth, corner posts and the top rim
    for (const x of [-1, 1]) for (const z of [-1, 1]) m.add(new THREE.SphereGeometry(0.045, 10, 8), trs([x * (S / 2 - 0.05), 0.045, z * (S / 2 - 0.05)]));
    m.add(plank(S + 0.06, 0.07, S + 0.06, 0.02), trs([0, 0.115, 0]));
    m.add(plank(S, 0.05, S, 0.015), trs([0, 0.17, 0]));
    for (const x of [-1, 1]) for (const z of [-1, 1]) m.add(plank(0.05, 1.02, 0.05, 0.012), trs([x * (S / 2 - 0.025), 0.69, z * (S / 2 - 0.025)]));
    m.add(plank(S + 0.04, 0.06, S + 0.04, 0.015), trs([0, 1.21, 0]));
    // a cross-bar half way up each side
    for (const s of [-1, 1]) {
      m.add(plank(S - 0.04, 0.025, 0.02, 0.008), trs([0, 0.5, s * (S / 2 - 0.02)]));
      m.add(plank(0.02, 0.025, S - 0.04, 0.008), trs([s * (S / 2 - 0.02), 0.5, 0]));
    }
    // the pyramid roof with a little vented cap, a finial and a ring
    m.add(new THREE.ConeGeometry(0.5, 0.34, 4, 1, true).rotateY(Math.PI / 4), trs([0, 1.41, 0]));
    m.add(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 16), trs([0, 1.6, 0]));
    m.add(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 16), trs([0, 1.65, 0]));
    m.add(new THREE.SphereGeometry(0.045, 12, 10), trs([0, 1.7, 0]));
    m.add(new THREE.TorusGeometry(0.11, 0.018, 8, 24), trs([0, 1.84, 0]));
    return m.build();
  });
}

function candleGeometry() {
  return once('gh-candle', () =>
    paint(
      smoothLathe(
        [
          [0, 0],
          [0.13, 0],
          [0.135, 0.02],
          [0.135, 0.36],
          [0.14, 0.4],
          [0.125, 0.405],
          [0.1, 0.38],
          [0.04, 0.37],
          [0, 0.372],
        ],
        40,
        28,
      ),
      (_x, y, _z, out) => mix(out, C('#efe3c8'), C('#fff6df'), smoothstep(0.1, 0.4, y)),
    ),
  );
}

function softDot() {
  return canvasTexture(
    'gh-dot',
    64,
    64,
    (g, w, h) => {
      const b = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      b.addColorStop(0, 'rgba(255,255,255,1)');
      b.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
    },
    { wrap: false },
  );
}

export function Lantern({ seed }: { seed: number }) {
  const v = variantOf(seed, LANTERNS.length);
  const k = LANTERNS[v];
  const frame = useMemo(() => once(`mat:lantern:${v}`, () => new THREE.MeshStandardMaterial({ color: k.frame, metalness: k.metal, roughness: k.rough })), [v, k]);
  const glass = useMemo(() => once('mat:lantern-glass', () => new THREE.MeshPhysicalMaterial({ color: '#fff3df', transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide })), []);
  const flameGeo = useMemo(
    () =>
      once('gh-flame', () =>
        smoothLathe(
          [
            [0, 0],
            [0.025, 0.02],
            [0.038, 0.06],
            [0.03, 0.11],
            [0.012, 0.16],
            [0, 0.19],
          ],
          20,
          14,
        ),
      ),
    [],
  );
  const flame = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const phase = useMemo(() => (seed * 1.37) % 10, [seed]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.0 + phase;
    const f = 0.88 + 0.08 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 23.7 + 1.3) + 0.04 * Math.sin(t * 3.3);
    if (flame.current) {
      flame.current.scale.set(1, f, 1);
      flame.current.rotation.z = 0.05 * Math.sin(t * 2.7);
    }
    if (halo.current) halo.current.scale.setScalar(0.42 * f);
    if (light.current) light.current.intensity = 3.2 * f;
  });
  const S = 0.62;
  const candleTop = 0.19 + 0.372;
  return (
    <group>
      <mesh geometry={lanternGeometry()} material={frame} castShadow receiveShadow />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} material={glass} position={[Math.sin((i * Math.PI) / 2) * (S / 2 - 0.03), 0.69, Math.cos((i * Math.PI) / 2) * (S / 2 - 0.03)]} rotation={[0, (i * Math.PI) / 2, 0]} renderOrder={3}>
          <planeGeometry args={[S - 0.08, 0.98]} />
        </mesh>
      ))}
      <mesh geometry={candleGeometry()} material={vcPhysical('wax', { roughness: 0.55, transmission: 0, sheen: 0.4 })} position={[0, 0.19, 0]} castShadow />
      <mesh position={[0, candleTop + 0.03, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.06, 5]} />
        <meshBasicMaterial color="#2a2018" />
      </mesh>
      <mesh ref={flame} geometry={flameGeo} position={[0, candleTop + 0.035, 0]}>
        <meshBasicMaterial color={new THREE.Color('#ffc46b').multiplyScalar(3.2)} toneMapped={false} />
      </mesh>
      <sprite ref={halo} position={[0, candleTop + 0.11, 0]}>
        <spriteMaterial map={softDot()} color={new THREE.Color('#ffae55').multiplyScalar(1.6)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight ref={light} position={[0, candleTop + 0.25, 0]} color="#ffa04a" intensity={3.2} distance={7} decay={2} />
    </group>
  );
}

// ---------- trowel and gloves ----------

function trowelGeometry() {
  return once('gh-trowel', () => {
    const steel = new Merger();
    const wood = new Merger();
    // the blade: pointed, scooped, a little dirt toward the tip
    const blade = leafGeometry({
      len: 0.62,
      width: 0.26,
      nu: 4,
      nv: 10,
      outline: (v) => (v < 0.12 ? 0.75 + v * 2 : 1) * Math.pow(Math.max(0, 1 - Math.pow(v, 2.2)), 0.6),
      cup: 0.35,
      paint: (u, v, out) => {
        out.set('#d4d6d6');
        mix(out, out, C('#4a3826'), smoothstep(0.55, 0.95, v + 0.15 * Math.sin(u * 7)) * 0.75);
      },
    });
    // lying face up: the blade's +y runs along +x, its face (+z) points up
    steel.add(blade, aim(V(0.0, 0.035, 0), V(1, 0, 0), V(0, 1, 0)));
    steel.add(paint(tubeThrough([V(0.02, 0.04, 0), V(-0.08, 0.06, 0), V(-0.16, 0.085, 0), V(-0.22, 0.09, 0)], () => 0.018, 12, 6).geometry, (_x, _y, _z, o) => o.set('#c9cccc')));
    const handle = smoothLathe(
      [
        [0, 0],
        [0.045, 0.0],
        [0.05, 0.03],
        [0.062, 0.12],
        [0.068, 0.3],
        [0.06, 0.4],
        [0.045, 0.43],
        [0, 0.435],
      ],
      30,
      18,
    );
    const ferrule = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 18).translate(0, 0.02, 0);
    const toX = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-0.2, 0.068, 0);
    wood.add(paint(handle, (_x, y, z, o) => mix(o, C('#a8743e'), C('#d29a5a'), smoothstep(-0.5, 0.5, Math.sin(y * 60 + z * 20)) * 0.4 + 0.3)), toX);
    wood.add(paint(ferrule, (_x, _y, _z, o) => o.set('#c39550')), toX);
    return { steel: steel.build(), wood: wood.build() };
  });
}

/** A gardening glove lying flat, palm down, fingers toward +z. */
function gloveSDF(mirror: boolean): SDF {
  const s = mirror ? -1 : 1;
  const palm = ellipsoid(0, 0.05, 0, 0.17, 0.045, 0.2);
  const cuff = ellipsoid(0, 0.045, -0.3, 0.17, 0.04, 0.15);
  const fingers = [
    cone(-0.11, 0.045, 0.14, -0.15, 0.04, 0.34, 0.033, 0.028),
    cone(-0.04, 0.045, 0.16, -0.05, 0.04, 0.42, 0.035, 0.03),
    cone(0.03, 0.045, 0.16, 0.04, 0.04, 0.41, 0.035, 0.03),
    cone(0.1, 0.045, 0.13, 0.13, 0.04, 0.33, 0.032, 0.027),
    cone(0.15, 0.045, -0.04, 0.29, 0.04, 0.12, 0.036, 0.03),
  ];
  return (x, y, z) => {
    const X = x * s;
    let d = smin(palm(X, y, z), cuff(X, y, z), 0.06);
    for (const f of fingers) d = smin(d, f(X, y, z), 0.035);
    // flat underneath where it rests on the bench
    return Math.max(d, -y + 0.005);
  };
}

const GLOVES = [
  { cloth: '#7d9a6c', cuff: '#d5c39a', tips: '#4b5a3c' },
  { cloth: '#c27c86', cuff: '#efe2cf', tips: '#7a3d48' },
  { cloth: '#40577a', cuff: '#d9c48c', tips: '#263449' },
];

function gloveGeometry(mirror: boolean, k: (typeof GLOVES)[number]) {
  return once(`glove:${mirror}:${k.cloth}`, () =>
    meshSDF(gloveSDF(mirror), {
      min: [-0.36, -0.01, -0.48],
      max: [0.36, 0.12, 0.5],
      cell: 0.011,
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        mix(out, C(k.cloth), C(k.cloth).multiplyScalar(0.8), smoothstep(-0.4, 0.4, noise3(x * 60, y * 60, z * 60)));
        mix(out, out, C(k.cuff), smoothstep(-0.2, -0.24, z));
        const tip = Math.max(smoothstep(0.3, 0.36, z), smoothstep(0.24, 0.3, x * (mirror ? -1 : 1)) * smoothstep(0.0, 0.08, z));
        mix(out, out, C(k.tips), tip * 0.85);
        // a little dried soil
        mix(out, out, C('#5a4632'), smoothstep(0.6, 0.85, noise3(x * 14, 2, z * 14)) * 0.6);
      },
    }),
  );
}

export function TrowelAndGloves({ seed }: { seed: number }) {
  const k = GLOVES[variantOf(seed, GLOVES.length)];
  const trowel = trowelGeometry();
  const left = useMemo(() => gloveGeometry(false, k), [k]);
  const right = useMemo(() => gloveGeometry(true, k), [k]);
  const steel = useMemo(() => once('mat:steel-vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.38 })), []);
  return (
    <group>
      <mesh geometry={left} material={vcMaterial('cloth', { roughness: 0.95 })} position={[-0.22, 0, -0.05]} rotation={[0, 0.35, 0]} castShadow receiveShadow />
      <mesh geometry={right} material={vcMaterial('cloth', { roughness: 0.95 })} position={[0.12, 0.06, 0.08]} rotation={[0.02, -0.5, 0.03]} castShadow receiveShadow />
      <group position={[0.05, 0, 0.5]} rotation={[0, 0.3, 0]}>
        <mesh geometry={trowel.steel} material={steel} castShadow receiveShadow />
        <mesh geometry={trowel.wood} material={vcPhysical('varnish', { roughness: 0.35, clearcoat: 0.6 })} castShadow />
      </group>
    </group>
  );
}

// ---------- ceramic snail ----------

const SNAILS = [
  { body: '#b9a78f', shell: '#8a5a34', band: '#f0dfc2', glaze: 0.8 },
  { body: '#6e927d', shell: '#4f7a68', band: '#a9c9b2', glaze: 0.4 },
  { body: '#d7cfc2', shell: '#c27a4a', band: '#f6eadb', glaze: 0.9 },
];

function snailGeometry(k: (typeof SNAILS)[number]) {
  return once(`snail:${k.shell}`, () => {
    // the soft body: a long foot, a neck rising to the head and two eye stalks
    const foot = ellipsoid(0, 0.07, 0, 0.13, 0.075, 0.45);
    const neck = cone(0, 0.08, 0.26, 0, 0.24, 0.44, 0.1, 0.075);
    const head = sphere(0, 0.25, 0.47, 0.075);
    const stalks = [cone(0.03, 0.29, 0.48, 0.09, 0.47, 0.56, 0.02, 0.014), cone(-0.03, 0.29, 0.48, -0.09, 0.47, 0.56, 0.02, 0.014)];
    const tips = [sphere(0.09, 0.47, 0.56, 0.026), sphere(-0.09, 0.47, 0.56, 0.026)];
    const tent = [cone(0.035, 0.2, 0.52, 0.06, 0.17, 0.6, 0.014, 0.01), cone(-0.035, 0.2, 0.52, -0.06, 0.17, 0.6, 0.014, 0.01)];
    const sdf: SDF = (x, y, z) => {
      let d = smin(foot(x, y, z), neck(x, y, z), 0.08);
      d = smin(d, head(x, y, z), 0.06);
      for (const f of [...stalks, ...tips, ...tent]) d = smin(d, f(x, y, z), 0.02);
      return Math.max(d, -y);
    };
    const bodyCol = C(k.body);
    const body = meshSDF(sdf, {
      min: [-0.2, -0.01, -0.5],
      max: [0.2, 0.55, 0.66],
      cell: 0.012,
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        out.copy(bodyCol).multiplyScalar(0.88 + 0.14 * noise3(x * 30, y * 30, z * 30));
        out.multiplyScalar(0.85 + 0.15 * smoothstep(0, 0.12, y));
        if (y > 0.45) out.copy(C('#2b2420'));
      },
    });
    // the shell: a tube coiled in a growing spiral, banded along the whorls
    const pts: THREE.Vector3[] = [];
    const turns = 2.6;
    const N = 90;
    const rad: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * turns * Math.PI * 2;
      // gentle growth: the last whorl ends about 0.19 out, so the shell sits on the
      // snail's back at a believable size
      const R = 0.022 * Math.exp(0.132 * a);
      rad.push(R * 0.62);
      pts.push(V(0.012 * a, Math.sin(a) * R, -Math.cos(a) * R));
    }
    const band = C(k.band);
    const shellCol = C(k.shell);
    const shell = tubeThrough(pts, (t) => rad[Math.round(t * N)], 180, 20, (t, ang, out) => {
      out.copy(shellCol);
      const growth = 0.5 + 0.5 * Math.sin(t * 260);
      mix(out, out, band, smoothstep(0.55, 0.9, Math.cos(ang * 2 + 0.6)) * 0.85);
      out.multiplyScalar(0.82 + 0.18 * growth);
    }).geometry;
    // stand the coil on the snail's back, its opening facing forward
    shell.applyMatrix4(trs([0.0, 0.27, -0.04], [0, Math.PI / 2, 0]));
    const m = new Merger();
    m.add(body);
    m.add(shell);
    return m.build();
  });
}

export function Snail({ seed }: { seed: number }) {
  const k = SNAILS[variantOf(seed, SNAILS.length)];
  const geo = snailGeometry(k);
  return <mesh geometry={geo} material={vcPhysical(`snail-${k.glaze}`, { roughness: 0.5 - k.glaze * 0.3, clearcoat: k.glaze, clearcoatRoughness: 0.15 })} castShadow receiveShadow />;
}

