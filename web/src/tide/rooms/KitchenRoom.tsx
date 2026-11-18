import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCanvasTexture } from '../../proto/kit';
import { paintGeometry, tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { C, mix, noise3, rng, smoothstep } from '../../tank/util';
import { FRONT_Z, TOP, WALL_Z } from '../space';
import type { CatalogItem, Placed } from '../types';

// The Kitchen theme: the tank on a counter in a kitchen late at night. The
// room's shell (tiled wall, rainy window, counter over teal drawers, a shelf,
// the stove under its hood, a pendant lamp) stays put; everything on the
// counter, shelf, sill and wall is an item you can move, add or remove.

// ---------- textures ----------

function useWoodTexture(base = '#a66b38', strips = 18) {
  return useCanvasTexture(
    (g, w, h) => {
      const r = rng(5);
      const c = new THREE.Color(base);
      const sh = h / strips;
      for (let i = 0; i < strips; i++) {
        const k = 0.78 + r() * 0.4;
        g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
        g.fillRect(0, i * sh, w, sh + 1);
        // grain: thin wavy darker lines along the strip
        g.strokeStyle = `rgba(60,30,10,${0.12 + r() * 0.12})`;
        g.lineWidth = 1;
        for (let l = 0; l < 6; l++) {
          const y0 = i * sh + r() * sh;
          const amp = 1 + r() * 3;
          const ph = r() * 6;
          g.beginPath();
          for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.02 + ph) * amp);
          g.stroke();
        }
        // seam between strips
        g.fillStyle = 'rgba(40,20,8,0.35)';
        g.fillRect(0, i * sh, w, 1.5);
      }
    },
    512,
    512,
  );
}

function useTileTexture() {
  return useCanvasTexture(
    (g, w, h) => {
      const r = rng(9);
      g.fillStyle = '#b3a692';
      g.fillRect(0, 0, w, h);
      const tw = 128;
      const th = 64;
      const gap = 5;
      for (let row = 0; row < h / th; row++) {
        const off = row % 2 ? tw / 2 : 0;
        for (let col = -1; col <= w / tw; col++) {
          const x = col * tw + off + gap / 2;
          const y = row * th + gap / 2;
          const k = 0.93 + r() * 0.1;
          const base = new THREE.Color('#ece2d1').multiplyScalar(k);
          const grad = g.createLinearGradient(x, y, x + tw, y + th);
          grad.addColorStop(0, `#${base.clone().multiplyScalar(1.05).getHexString()}`);
          grad.addColorStop(1, `#${base.clone().multiplyScalar(0.9).getHexString()}`);
          g.fillStyle = grad;
          g.beginPath();
          g.roundRect(x, y, tw - gap, th - gap, 6);
          g.fill();
          // a soft glaze highlight along the top edge
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.fillRect(x + 6, y + 4, tw - gap - 12, 5);
        }
      }
    },
    512,
    512,
  );
}

function useNightTexture() {
  return useCanvasTexture(
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0f1426');
      grad.addColorStop(0.6, '#1d1a33');
      grad.addColorStop(1, '#2c2236');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(8);
      // far windows and street lights, out of focus through the rain
      for (let i = 0; i < 70; i++) {
        const x = r() * w;
        const y = h * 0.35 + r() * h * 0.65;
        const rad = 3 + r() * 10;
        const c = r() < 0.7 ? '255,196,120' : '150,195,255';
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, `rgba(${c},0.85)`);
        b.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = b;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // rain on the glass
      g.strokeStyle = 'rgba(200,220,255,0.22)';
      g.lineWidth = 1;
      for (let i = 0; i < 140; i++) {
        const x = r() * w;
        const y = r() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 2, y + 10 + r() * 8);
        g.stroke();
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(220,235,255,0.35)';
        g.beginPath();
        g.arc(r() * w, r() * h, 1 + r() * 2, 0, Math.PI * 2);
        g.fill();
      }
    },
    256,
    320,
  );
}

function useSoftDot() {
  return useCanvasTexture(
    (g, w, h) => {
      const b = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      b.addColorStop(0, 'rgba(255,255,255,0.9)');
      b.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
    },
    64,
    64,
  );
}

// ---------- shared materials ----------

let matsCache: ReturnType<typeof makeMaterials> | null = null;
function makeMaterials() {
  return {
      brass: new THREE.MeshStandardMaterial({ color: '#c99a4c', metalness: 0.85, roughness: 0.3 }),
      steel: new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.26 }),
      iron: new THREE.MeshStandardMaterial({ color: '#232326', metalness: 0.5, roughness: 0.6 }),
      teal: new THREE.MeshStandardMaterial({ color: '#2d5457', roughness: 0.55 }),
      terracotta: new THREE.MeshStandardMaterial({ color: '#b5603c', roughness: 0.85 }),
      leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }),
      ceramic: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      wood: new THREE.MeshStandardMaterial({ color: '#b07a45', roughness: 0.6 }),
      darkWood: new THREE.MeshStandardMaterial({ color: '#3a271c', roughness: 0.6 }),
  };
}
/** The kitchen's shared materials, made once. */
function useMaterials() {
  if (!matsCache) matsCache = makeMaterials();
  return matsCache;
}
type Mats = ReturnType<typeof makeMaterials>;

const paintAll = (g: THREE.BufferGeometry, hex: string) => paintGeometry(g, (_x, _y, _z, out) => out.set(hex));

// ---------- the room ----------

function Walls() {
  const tiles = useTileTexture();
  useLayoutEffect(() => {
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    tiles.repeat.set(40 / 6, 6.15 / 6);
    tiles.needsUpdate = true;
  }, [tiles]);
  return (
    <group>
      <mesh position={[0, TOP + 3.075, WALL_Z]} receiveShadow userData={{ surface: 'wall' }}>
        <planeGeometry args={[40, 6.15]} />
        <meshStandardMaterial map={tiles} roughness={0.38} />
      </mesh>
      <mesh position={[0, 18, WALL_Z]} userData={{ surface: 'wall' }}>
        <planeGeometry args={[60, 30]} />
        <meshStandardMaterial color="#2a2320" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Window({ m }: { m: Mats }) {
  const night = useNightTexture();
  const x0 = -12.6;
  const x1 = -7.6;
  const y0 = -1.4;
  const y1 = 3.4;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const fw = 0.28;
  return (
    <group position={[0, 0, WALL_Z + 0.02]}>
      <mesh position={[cx, cy, 0.005]}>
        <planeGeometry args={[x1 - x0, y1 - y0]} />
        <meshBasicMaterial map={night} toneMapped={false} />
      </mesh>
      {/* frame and glazing bars */}
      {(
        [
          [cx, y1 + fw / 2, x1 - x0 + fw * 2, fw],
          [x0 - fw / 2, cy, fw, y1 - y0],
          [x1 + fw / 2, cy, fw, y1 - y0],
          [cx, cy, x1 - x0, 0.09],
          [cx, cy + 0.02, 0.09, y1 - y0],
        ] as [number, number, number, number][]
      ).map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.06]} material={m.darkWood} castShadow>
          <boxGeometry args={[w, h, 0.16]} />
        </mesh>
      ))}
      {/* the sill */}
      <mesh position={[cx, y0 - 0.1, 0.3]} material={m.darkWood} castShadow receiveShadow userData={{ surface: 'sill' }}>
        <boxGeometry args={[x1 - x0 + 0.9, 0.2, 0.75]} />
      </mesh>
      <pointLight position={[cx, cy, 0.8]} color="#7f9cff" intensity={1.6} distance={7} decay={2} />
    </group>
  );
}

function Counter({ m }: { m: Mats }) {
  const wood = useWoodTexture('#a8703a', 22);
  const floor = useWoodTexture('#8a6646', 14);
  useLayoutEffect(() => {
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(4, 1.2);
    wood.needsUpdate = true;
    floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
    floor.repeat.set(6, 4);
    floor.needsUpdate = true;
  }, [wood, floor]);
  const drawers = useMemo(() => {
    const out: number[] = [];
    for (let x = -15.4; x <= 15.5; x += 4.4) out.push(x);
    return out;
  }, []);
  const pull = useMemo(() => new THREE.CylinderGeometry(0.035, 0.035, 1.1, 10).rotateZ(Math.PI / 2), []);
  const post = useMemo(() => new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8).rotateX(Math.PI / 2), []);
  return (
    <group>
      <mesh position={[0, TOP - 0.175, (WALL_Z + FRONT_Z) / 2]} castShadow receiveShadow userData={{ surface: 'top' }}>
        <boxGeometry args={[40, 0.35, FRONT_Z - WALL_Z]} />
        <meshStandardMaterial map={wood} roughness={0.55} />
      </mesh>
      {/* the cabinet body, a row of drawers over full-height doors, the toe-kick and the floor */}
      <mesh position={[0, TOP - 5.0, (WALL_Z + FRONT_Z - 0.3) / 2]} material={m.teal}>
        <boxGeometry args={[40, 9.3, FRONT_Z - 0.3 - WALL_Z]} />
      </mesh>
      <mesh position={[0, TOP - 9.3, FRONT_Z - 0.75]}>
        <boxGeometry args={[40, 0.9, 0.2]} />
        <meshStandardMaterial color="#141516" roughness={0.8} />
      </mesh>
      <mesh position={[0, TOP - 9.75, 18]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ surface: 'floor' }}>
        <planeGeometry args={[80, 45]} />
        <meshStandardMaterial map={floor} color="#6b5442" roughness={0.75} />
      </mesh>
      {drawers.map((x) => (
        <group key={x} position={[x, TOP - 1.35, FRONT_Z - 0.3]}>
          <mesh material={m.teal} castShadow receiveShadow>
            <boxGeometry args={[4.24, 1.8, 0.16]} />
          </mesh>
          <mesh material={m.teal} position={[0, -4.3, 0]}>
            <boxGeometry args={[4.24, 6.6, 0.16]} />
          </mesh>
          <mesh geometry={pull} material={m.brass} position={[0, -1.6, 0.22]} />
          <mesh geometry={post} material={m.brass} position={[-0.45, -1.6, 0.13]} />
          <mesh geometry={post} material={m.brass} position={[0.45, -1.6, 0.13]} />
          <mesh geometry={pull} material={m.brass} position={[0, 0.35, 0.22]} />
          <mesh geometry={post} material={m.brass} position={[-0.45, 0.35, 0.13]} />
          <mesh geometry={post} material={m.brass} position={[0.45, 0.35, 0.13]} />
        </group>
      ))}
    </group>
  );
}

// ---------- the shelf ----------

const JARS: { h: number; fill: number; contents: string; speck: string; lid: string }[] = [
  { h: 1.25, fill: 0.78, contents: '#efe8d8', speck: '#c9bfa8', lid: '#c39a6a' }, // rice
  { h: 1.0, fill: 0.7, contents: '#e7b250', speck: '#b77c25', lid: '#c39a6a' }, // pasta
  { h: 0.85, fill: 0.62, contents: '#7c3426', speck: '#3f1a12', lid: '#cfd3d8' }, // beans
  { h: 0.9, fill: 0.55, contents: '#5f7232', speck: '#33401a', lid: '#cfd3d8' }, // tea
  { h: 1.15, fill: 0.8, contents: '#f4efe6', speck: '#e0d6c5', lid: '#c39a6a' }, // sugar
];

function jarGlass(h: number) {
  return smoothLathe(
    [
      [0, 0],
      [0.36, 0],
      [0.4, 0.04],
      [0.41, h * 0.8],
      [0.34, h * 0.93],
      [0.32, h],
    ],
    60,
    40,
  );
}

function Jar({ seed }: { seed: number }) {
  const { h, fill, contents, speck, lid } = JARS[seed % JARS.length];
  const glass = useMemo(() => jarGlass(h), [h]);
  const stuff = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.37, 0.37, h * fill, 32, 12).translate(0, (h * fill) / 2 + 0.03, 0);
    const a = C(contents);
    const b = C(speck);
    return paintGeometry(g, (px, py, pz, out) => mix(out, a, b, smoothstep(0.1, 0.45, noise3(px * 18, py * 18, pz * 18))));
  }, [h, fill, contents, speck]);
  const lidGeo = useMemo(() => {
    const g = smoothLathe(
      [
        [0, h - 0.02],
        [0.33, h - 0.02],
        [0.36, h + 0.02],
        [0.36, h + 0.13],
        [0.3, h + 0.16],
        [0, h + 0.165],
      ],
      40,
      40,
    );
    return paintAll(g, lid);
  }, [h, lid]);
  return (
    <group>
      <mesh geometry={stuff}>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      <mesh geometry={lidGeo}>
        <meshStandardMaterial vertexColors roughness={0.6} metalness={lid === '#cfd3d8' ? 0.8 : 0} />
      </mesh>
      <mesh geometry={glass} renderOrder={2}>
        <meshPhysicalMaterial color="#e8f4f0" transparent opacity={0.22} roughness={0.04} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function BowlStack({ position = [0, 0, 0], m }: { position?: [number, number, number]; m: Mats }) {
  const bowl = useMemo(() => {
    const n = 60;
    const g = smoothLathe(
      [
        [0, 0],
        [0.22, 0],
        [0.24, 0.04],
        [0.45, 0.2],
        [0.56, 0.36],
        [0.55, 0.38],
        [0.5, 0.33],
        [0.3, 0.14],
        [0, 0.09],
      ],
      n,
      48,
    );
    return paintGeometry(g, (_x, y, _z, out) => mix(out, C('#f3eee6'), C('#3a62a0'), smoothstep(0.24, 0.27, y) * smoothstep(0.33, 0.3, y)));
  }, []);
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={bowl} material={m.ceramic} position={[0, i * 0.12, 0]} castShadow />
      ))}
    </group>
  );
}

function heartLeaf() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.08, 0.07, 0.21, 0.02, 0.17, -0.13);
  s.bezierCurveTo(0.14, -0.24, 0.05, -0.31, 0, -0.37);
  s.bezierCurveTo(-0.05, -0.31, -0.14, -0.24, -0.17, -0.13);
  s.bezierCurveTo(-0.21, 0.02, -0.08, 0.07, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -0.06 * Math.abs(p.getX(i)) / 0.2);
  g.computeVertexNormals();
  return g;
}

// A pothos in a terracotta pot, its vines trailing down over the shelf edge.
function Pothos({ position = [0, 0, 0], m }: { position?: [number, number, number]; m: Mats }) {
  const pot = useMemo(
    () =>
      smoothLathe(
        [
          [0, 0],
          [0.32, 0],
          [0.36, 0.05],
          [0.44, 0.55],
          [0.5, 0.58],
          [0.5, 0.7],
          [0.44, 0.7],
          [0.4, 0.6],
          [0, 0.55],
        ],
        60,
        40,
      ),
    [],
  );
  const vines = useMemo(() => {
    const r = rng(12);
    return [
      [0.1, 0.62, 0.15, 0.3, 1.0, 0.45],
      [-0.2, 0.62, 0.1, -0.5, 1.6, 0.35],
      [0.25, 0.62, -0.05, 0.9, 2.4, 0.55],
      [-0.05, 0.62, 0.2, 0.45, 3.0, 0.7],
      [0.3, 0.62, 0.1, 1.2, 1.8, 0.4],
    ].map(([x, y, z, drift, drop, out], i) => {
      const pts = [
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x + drift * 0.2, y + 0.1, z + out * 0.6 + 0.3),
        new THREE.Vector3(x + drift * 0.5, y - drop * 0.35, z + out + 0.45),
        new THREE.Vector3(x + drift * 0.8, y - drop * 0.75, z + out + 0.4),
        new THREE.Vector3(x + drift, y - drop, z + out + 0.3 + r() * 0.1),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      return { curve, tube: tubeThrough(pts, () => 0.016, 40, 5, (_t, _a, o) => o.set('#5d7d36')), seed: i };
    });
  }, []);
  const leafGeo = useMemo(heartLeaf, []);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const count = vines.length * 9 + 10;
  useLayoutEffect(() => {
    const im = leaves.current;
    if (!im) return;
    const r = rng(31);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    let n = 0;
    const put = (pos: THREE.Vector3, yaw: number, pitch: number, roll: number, size: number) => {
      e.set(pitch, yaw, roll);
      s.setScalar(size);
      im.setMatrixAt(n, mtx.compose(pos, q.setFromEuler(e), s));
      c.set('#4b8a37').lerp(new THREE.Color('#9ccf6a'), r() * 0.55);
      im.setColorAt(n, c);
      n++;
    };
    vines.forEach(({ curve }) => {
      for (let k = 0; k < 9; k++) {
        const t = 0.12 + k * 0.1;
        curve.getPointAt(Math.min(1, t), p);
        const side = k % 2 ? 1 : -1;
        put(p.clone().add(new THREE.Vector3(side * 0.05, 0, 0.04)), side * 0.5 + (r() - 0.5) * 0.4, -0.25 + r() * 0.3, side * (0.6 + r() * 0.5), 0.75 + r() * 0.5);
      }
    });
    // a crown of leaves in the pot
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      put(new THREE.Vector3(Math.cos(a) * 0.22, 0.75 + r() * 0.15, Math.sin(a) * 0.22), -a + Math.PI / 2, -1.1 + r() * 0.4, (r() - 0.5) * 0.6, 0.9 + r() * 0.4);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [vines]);
  return (
    <group position={position}>
      <mesh geometry={pot} material={m.terracotta} castShadow />
      <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.43, 24]} />
        <meshStandardMaterial color="#3a2a1e" roughness={1} />
      </mesh>
      {vines.map((v) => (
        <mesh key={v.seed} geometry={v.tube.geometry} material={m.leaf} />
      ))}
      <instancedMesh ref={leaves} args={[leafGeo, undefined, count]} castShadow>
        <meshStandardMaterial roughness={0.5} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

function Basil({ position = [0, 0, 0], m }: { position?: [number, number, number]; m: Mats }) {
  const pot = useMemo(
    () =>
      smoothLathe(
        [
          [0, 0],
          [0.26, 0],
          [0.3, 0.04],
          [0.36, 0.48],
          [0.4, 0.5],
          [0.4, 0.6],
          [0.35, 0.6],
          [0.32, 0.52],
          [0, 0.48],
        ],
        60,
        36,
      ),
    [],
  );
  const leafGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.09, 0.05, 0.1, 0.18, 0, 0.26);
    s.bezierCurveTo(-0.1, 0.18, -0.09, 0.05, 0, 0);
    const g = new THREE.ShapeGeometry(s, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.05 * Math.abs(p.getX(i)) / 0.1 + 0.03 * p.getY(i));
    g.computeVertexNormals();
    return g;
  }, []);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const count = 34;
  useLayoutEffect(() => {
    const im = leaves.current;
    if (!im) return;
    const r = rng(77);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const stem = i % 3;
      const k = Math.floor(i / 3);
      const sx = (stem - 1) * 0.12;
      const y = 0.6 + k * 0.09;
      const a = k * 1.9 + stem;
      e.set(-0.9 + k * 0.03, a, 0);
      s.setScalar(1 - k * 0.04);
      im.setMatrixAt(i, mtx.compose(new THREE.Vector3(sx + Math.cos(a) * 0.04, y, Math.sin(a) * 0.04), q.setFromEuler(e), s));
      c.set('#3e8a3a').lerp(new THREE.Color('#7fc25c'), r() * 0.5 + k * 0.03);
      im.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, []);
  return (
    <group position={position}>
      <mesh geometry={pot} material={m.terracotta} castShadow />
      {[-0.12, 0, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.85, 0]}>
          <cylinderGeometry args={[0.012, 0.016, 0.7, 6]} />
          <meshStandardMaterial color="#4f7a2e" />
        </mesh>
      ))}
      <instancedMesh ref={leaves} args={[leafGeo, undefined, count]}>
        <meshStandardMaterial roughness={0.5} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

function Shelf({ m }: { m: Mats }) {
  const y = 4.05;
  return (
    <group>
      <mesh position={[0, y - 0.11, WALL_Z + 0.55]} material={m.wood} castShadow receiveShadow userData={{ surface: 'shelf' }}>
        <boxGeometry args={[13.6, 0.22, 1.1]} />
      </mesh>
      {[-5.6, 5.6].map((x) => (
        <group key={x} position={[x, y - 0.22, WALL_Z + 0.05]}>
          <mesh material={m.brass} position={[0, -0.35, 0.03]}>
            <boxGeometry args={[0.08, 0.7, 0.06]} />
          </mesh>
          <mesh material={m.brass} position={[0, -0.03, 0.45]}>
            <boxGeometry args={[0.08, 0.06, 0.9]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- the stove ----------

function stockpotGeometry() {
  const g = smoothLathe(
    [
      [0, 0],
      [1.02, 0],
      [1.08, 0.05],
      [1.1, 0.2],
      [1.1, 1.32],
      [1.12, 1.36],
      [1.09, 1.38],
      [1.07, 1.3],
      [1.06, 0.12],
      [0, 0.1],
    ],
    90,
    64,
  );
  return g;
}

function potLidGeometry() {
  return smoothLathe(
    [
      [0, 1.36],
      [1.06, 1.36],
      [1.13, 1.39],
      [1.0, 1.47],
      [0.6, 1.55],
      [0.2, 1.58],
      [0, 1.585],
    ],
    60,
    64,
  );
}

function kettleGeometry() {
  return paintAll(
    smoothLathe(
      [
        [0, 0],
        [0.7, 0],
        [0.76, 0.04],
        [0.77, 0.3],
        [0.66, 0.62],
        [0.44, 0.82],
        [0.27, 0.9],
        [0.25, 0.95],
        [0.16, 0.98],
        [0.06, 1.05],
        [0.07, 1.1],
        [0, 1.12],
      ],
      90,
      56,
    ),
    '#c9503d',
  );
}

function Steam({ origin }: { origin: [number, number, number] }) {
  const tex = useSoftDot();
  const ref = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ ph: i / 9, x: (Math.random() - 0.5) * 0.9, z: (Math.random() - 0.5) * 0.6 })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current?.children.forEach((c, i) => {
      const s = seeds[i];
      const k = (t * 0.12 + s.ph) % 1;
      c.position.set(s.x * (0.6 + k) + Math.sin(t * 0.7 + i) * 0.15 * k, k * 2.6, s.z + Math.cos(t * 0.5 + i) * 0.1 * k);
      c.scale.setScalar(0.5 + k * 1.6);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.2 * Math.sin(Math.PI * k);
    });
  });
  return (
    <group ref={ref} position={origin}>
      {seeds.map((_, i) => (
        <sprite key={i}>
          <spriteMaterial map={tex} color="#fff2e2" transparent depthWrite={false} opacity={0} />
        </sprite>
      ))}
    </group>
  );
}

function Burner({ position, m, lit = false }: { position: [number, number, number]; m: Mats; lit?: boolean }) {
  return (
    <group position={position}>
      <mesh material={m.iron} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <torusGeometry args={[0.85, 0.05, 8, 40]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} material={m.iron} rotation={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]} position={[0, 0.08, 0]}>
          <boxGeometry args={[0.08, 0.08, 1.9]} />
        </mesh>
      ))}
      {lit && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
            <torusGeometry args={[0.38, 0.04, 8, 32]} />
            <meshBasicMaterial color={new THREE.Color('#5cb0ff').multiplyScalar(2.2)} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0.25, 0]} color="#79b8ff" intensity={1.2} distance={2.5} decay={2} />
        </>
      )}
    </group>
  );
}

function Utensils({ m }: { m: Mats }) {
  const ladle = useMemo(() => {
    const bowl = new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -1.75, 0.0);
    const handle = tubeThrough(
      [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, -0.6, 0.02), new THREE.Vector3(0, -1.3, 0.06), new THREE.Vector3(0.02, -1.68, 0.06)],
      () => 0.035,
      30,
      8,
    ).geometry;
    return [bowl, handle];
  }, []);
  const whisk = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts = [
        [0.04 * ca, -0.7, 0.04 * sa],
        [0.18 * ca, -1.05, 0.18 * sa],
        [0.2 * ca, -1.35, 0.2 * sa],
        [0, -1.52, 0],
        [-0.2 * ca, -1.35, -0.2 * sa],
        [-0.18 * ca, -1.05, -0.18 * sa],
        [-0.04 * ca, -0.7, -0.04 * sa],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      parts.push(tubeThrough(pts, () => 0.012, 40, 4).geometry);
    }
    return parts;
  }, []);
  return (
    <group position={[9.1, 1.25, WALL_Z + 0.22]}>
      <mesh material={m.brass} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 4.4, 12]} />
      </mesh>
      {[-2.2, 2.2].map((x) => (
        <mesh key={x} material={m.brass} position={[x, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.22, 10]} />
        </mesh>
      ))}
      <group position={[-1.3, 0, 0.04]}>
        {ladle.map((g, i) => (
          <mesh key={i} geometry={g} material={m.steel} castShadow />
        ))}
      </group>
      <group position={[0, 0, 0.05]}>
        <mesh material={m.darkWood} position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.75, 12]} />
        </mesh>
        {whisk.map((g, i) => (
          <mesh key={i} geometry={g} material={m.steel} />
        ))}
      </group>
      <group position={[1.3, 0, 0.04]}>
        <mesh material={m.darkWood} position={[0, -0.55, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.1, 10]} />
        </mesh>
        <mesh material={m.steel} position={[0, -1.35, 0]}>
          <boxGeometry args={[0.42, 0.55, 0.025]} />
        </mesh>
      </group>
    </group>
  );
}

function Stove({ m }: { m: Mats }) {
  const pot = useMemo(stockpotGeometry, []);
  const lid = useMemo(potLidGeometry, []);
  const kettle = useMemo(kettleGeometry, []);
  const kettleHandle = useMemo(
    () => tubeThrough([new THREE.Vector3(-0.45, 0.78, 0), new THREE.Vector3(-0.32, 1.35, 0), new THREE.Vector3(0.32, 1.35, 0), new THREE.Vector3(0.45, 0.78, 0)], () => 0.05, 40, 10).geometry,
    [],
  );
  const kettleSpout = useMemo(
    () => tubeThrough([new THREE.Vector3(0, 0.35, 0.55), new THREE.Vector3(0, 0.62, 0.86), new THREE.Vector3(0, 0.9, 1.05)], (t) => 0.13 * (1 - t) + 0.06, 30, 12, (_t, _a, o) => o.set('#c9503d')).geometry,
    [],
  );
  const enamel = useMemo(() => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }), []);
  const hood = useMemo(() => new THREE.CylinderGeometry(1.0, 3.1, 1.3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.62), []);
  // a spotlight aims at its target object, which must be in the scene
  const hoodTarget = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      {/* the cooktop set into the counter */}
      <mesh position={[9.4, TOP + 0.01, -2.15]}>
        <boxGeometry args={[5.0, 0.04, 3.9]} />
        <meshPhysicalMaterial color="#121316" roughness={0.18} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      <Burner position={[8.3, TOP, -1.25]} m={m} />
      <Burner position={[10.6, TOP, -3.05]} m={m} />
      {/* the stockpot, simmering */}
      <group position={[8.3, TOP + 0.13, -1.25]}>
        <mesh geometry={pot} material={m.steel} castShadow receiveShadow />
        <mesh geometry={lid} material={m.steel} position={[0.04, 0.02, 0]} rotation={[0, 0, 0.03]} castShadow />
        <mesh material={m.iron} position={[0, 1.65, 0]}>
          <sphereGeometry args={[0.12, 16, 10]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.steel} position={[s * 1.12, 1.05, 0]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <torusGeometry args={[0.2, 0.045, 8, 20, Math.PI]} />
          </mesh>
        ))}
        <Steam origin={[0.6, 1.45, 0]} />
      </group>
      {/* the kettle on the back burner */}
      <group position={[10.6, TOP + 0.13, -3.05]} rotation={[0, -0.6, 0]}>
        <mesh geometry={kettle} material={enamel} castShadow />
        <mesh geometry={kettleSpout} material={enamel} castShadow />
        <mesh geometry={kettleHandle} material={m.iron} castShadow />
      </group>
      {/* the range hood, its warm light falling on the pot */}
      <mesh geometry={hood} material={m.steel} position={[9.4, 5.0, -3.2]} castShadow />
      <mesh material={m.steel} position={[9.4, 8.4, -3.9]}>
        <boxGeometry args={[1.5, 5.6, 1.1]} />
      </mesh>
      <mesh position={[9.4, 4.34, -3.0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 0.5]} />
        <meshBasicMaterial color={new THREE.Color('#ffd9a8').multiplyScalar(1.8)} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={hoodTarget} position={[8.6, TOP, -1.5]} />
      <spotLight position={[9.4, 4.2, -2.9]} target={hoodTarget} angle={0.75} penumbra={0.7} intensity={26} color="#ffc98e" distance={10} decay={2} />
      <Utensils m={m} />
    </group>
  );
}

// ---------- things on the counter ----------

function boardGeometry() {
  const s = new THREE.Shape();
  const w = 1.7;
  const h = 1.05;
  const r = 0.18;
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  const hole = new THREE.Path();
  hole.absarc(w - 0.38, 0, 0.13, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 24 }).rotateX(-Math.PI / 2);
}

function scallionGeometries() {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(4);
  for (let i = 0; i < 5; i++) {
    const z = -0.35 + i * 0.16;
    const bend = (r() - 0.5) * 0.15;
    const pts = [new THREE.Vector3(-1.2, 0.04, z), new THREE.Vector3(-0.4, 0.05, z + bend * 0.5), new THREE.Vector3(0.4, 0.06, z + bend), new THREE.Vector3(1.05, 0.05, z + bend * 1.6)];
    parts.push(
      tubeThrough(pts, (t) => 0.035 * (1 - t * 0.35), 40, 8, (t, _a, out) => {
        mix(out, C('#f1f0df'), C('#9fd36a'), smoothstep(0.08, 0.3, t));
        mix(out, out, C('#3f8a2f'), smoothstep(0.35, 0.8, t));
      }).geometry,
    );
  }
  return parts;
}

function knifeGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(1.25, 0);
  s.quadraticCurveTo(1.5, 0.02, 1.62, 0.18);
  s.lineTo(1.2, 0.28);
  s.lineTo(0, 0.3);
  s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

/** A cutting board with scallions and a knife. */
function CuttingBoard() {
  const m = useMaterials();
  const board = useMemo(boardGeometry, []);
  const scallions = useMemo(scallionGeometries, []);
  const knife = useMemo(knifeGeometry, []);
  const boardWood = useWoodTexture('#c08a52', 10);
  useLayoutEffect(() => {
    boardWood.wrapS = boardWood.wrapT = THREE.RepeatWrapping;
    boardWood.repeat.set(0.35, 0.35);
    boardWood.needsUpdate = true;
  }, [boardWood]);
  return (
    <group position={[0, 0.03, 0]}>
      <mesh geometry={board} castShadow receiveShadow>
        <meshStandardMaterial map={boardWood} roughness={0.6} />
      </mesh>
      <group position={[0, 0.13, 0]}>
        {scallions.map((g, i) => (
          <mesh key={i} geometry={g} castShadow>
            <meshStandardMaterial vertexColors roughness={0.5} />
          </mesh>
        ))}
        <group position={[-0.9, 0.0, 0.55]} rotation={[0, -0.25, 0]}>
          <mesh geometry={knife} material={m.steel} />
          <mesh material={m.darkWood} position={[-0.42, 0.04, -0.14]}>
            <boxGeometry args={[0.85, 0.09, 0.2]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** A crock of wooden spoons. */
function Crock() {
  const m = useMaterials();
  const crock = useMemo(
    () =>
      paintAll(
        smoothLathe(
          [
            [0, 0],
            [0.42, 0],
            [0.46, 0.05],
            [0.5, 0.6],
            [0.52, 0.95],
            [0.55, 1.0],
            [0.5, 1.02],
            [0.46, 0.95],
            [0, 0.9],
          ],
          70,
          48,
        ),
        '#3d5f8a',
      ),
    [],
  );
  return (
    <group>
      <mesh geometry={crock} material={m.ceramic} castShadow />
      {[-0.5, -0.15, 0.2, 0.55].map((a, i) => (
        <group key={i} position={[0, 0.9, 0]} rotation={[0.18 * Math.cos(i), 0, a * 0.5]}>
          <mesh material={m.wood} position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.035, 0.045, 1.5, 10]} />
          </mesh>
          <mesh material={m.wood} position={[0, 1.45, 0]} scale={[0.17, 0.26, 0.07]}>
            <sphereGeometry args={[1, 16, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A wooden bowl of oranges and a lemon. */
function FruitBowl() {
  const m = useMaterials();
  const bowl = useMemo(
    () =>
      smoothLathe(
        [
          [0, 0],
          [0.35, 0],
          [0.38, 0.05],
          [0.75, 0.28],
          [0.95, 0.5],
          [0.93, 0.53],
          [0.72, 0.33],
          [0.35, 0.12],
          [0, 0.1],
        ],
        60,
        48,
      ),
    [],
  );
  return (
    <group>
      <mesh geometry={bowl} material={m.wood} castShadow receiveShadow />
      {(
        [
          [-0.3, 0.42, 0.05, '#f08a24', 1],
          [0.28, 0.42, -0.1, '#f08a24', 1],
          [0.0, 0.42, 0.32, '#ee9a2e', 1],
          [0.02, 0.78, -0.02, '#f2d548', 1.25],
        ] as [number, number, number, string, number][]
      ).map(([x, y, z, c, s], i) => (
        <mesh key={i} position={[x, y, z]} scale={[0.3 * s, 0.3, 0.3]} rotation={[0, i, 0.3]} castShadow>
          <sphereGeometry args={[1, 28, 20]} />
          <meshStandardMaterial color={c} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- the lamp ----------

function Pendant() {
  const shade = useMemo(
    () =>
      smoothLathe(
        [
          [0.12, 0.92],
          [0.3, 0.86],
          [0.75, 0.55],
          [1.05, 0.12],
          [1.1, 0],
          [1.05, 0.02],
          [1.0, 0.13],
          [0.7, 0.55],
          [0.28, 0.82],
          [0.1, 0.88],
        ],
        80,
        56,
      ),
    [],
  );
  return (
    <group position={[-6.9, 4.3, 0.9]}>
      <mesh position={[0, 5.5, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 10, 6]} />
        <meshStandardMaterial color="#141414" />
      </mesh>
      <mesh geometry={shade}>
        <meshStandardMaterial color="#2f4a3c" roughness={0.45} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.24, 20, 14]} />
        <meshBasicMaterial color={new THREE.Color('#ffd8a0').multiplyScalar(2.4)} toneMapped={false} />
      </mesh>
      <pointLight position={[0, -0.2, 0]} color="#ffb76a" intensity={34} distance={16} decay={2} />
    </group>
  );
}

export function KitchenRoom() {
  const m = useMaterials();
  const room = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    room.current?.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 0.3;
    });
  });
  return (
    <group ref={room}>
      <Walls />
      <Window m={m} />
      <Counter m={m} />
      <Shelf m={m} />
      <Stove m={m} />
      <Pendant />
    </group>
  );
}

// ---------- more things to add ----------

const GLAZES = ['#c9503d', '#3d5f8a', '#5f8a4f', '#d9a441', '#8a5fa8'];

/** A glazed mug of coffee, dipped in one of a few colours. */
function Mug({ seed }: { seed: number }) {
  const m = useMaterials();
  const body = useMemo(() => {
    const n = 90;
    const glaze = C(GLAZES[seed % GLAZES.length]);
    const cream = C('#efe6d6');
    const g = smoothLathe(
      [
        [0, 0],
        [0.28, 0],
        [0.31, 0.025],
        [0.32, 0.3],
        [0.335, 0.66],
        [0.33, 0.7],
        [0.305, 0.69],
        [0.29, 0.62],
        [0.28, 0.1],
        [0, 0.08],
      ],
      n,
      48,
    );
    return paintGeometry(g, (x, y, z, out, i) => {
      const inside = i % (n + 1) > n * 0.62;
      if (inside) out.copy(cream);
      else mix(out, cream, glaze, smoothstep(0.38, 0.42, y + 0.02 * noise3(x * 9, y * 9, z * 9)));
    });
  }, [seed]);
  const handle = useMemo(() => {
    const pts = [
      [0.29, 0.56, 0],
      [0.47, 0.57, 0],
      [0.53, 0.38, 0],
      [0.45, 0.2, 0],
      [0.29, 0.19, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const glaze = GLAZES[seed % GLAZES.length];
    return tubeThrough(pts, () => 0.036, 32, 8, (_t, _a, o) => o.set(glaze)).geometry;
  }, [seed]);
  return (
    <group>
      <mesh geometry={body} material={m.ceramic} castShadow />
      <mesh geometry={handle} material={m.ceramic} castShadow />
      <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.285, 32]} />
        <meshStandardMaterial color="#3b2416" roughness={0.25} />
      </mesh>
    </group>
  );
}

/** A round wall clock that keeps the real time. */
function WallClock() {
  const m = useMaterials();
  const face = useCanvasTexture(
    (g, w, h) => {
      g.fillStyle = '#f3ecdc';
      g.fillRect(0, 0, w, h);
      g.translate(w / 2, h / 2);
      for (let i = 0; i < 60; i++) {
        const big = i % 5 === 0;
        g.save();
        g.rotate((i / 60) * Math.PI * 2);
        g.fillStyle = big ? '#2a2420' : '#8a8070';
        g.fillRect(big ? -4 : -1.5, -w * 0.46, big ? 8 : 3, big ? 26 : 12);
        g.restore();
      }
      g.fillStyle = '#c9503d';
      g.font = '700 26px "M PLUS Rounded 1c", system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('kitchen', 0, w * 0.18);
    },
    256,
    256,
  );
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  useFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const mm = d.getMinutes() + s / 60;
    const hh = (d.getHours() % 12) + mm / 60;
    if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(mm / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(hh / 12) * Math.PI * 2;
  });
  return (
    <group>
      <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} material={m.darkWood} castShadow>
        <cylinderGeometry args={[0.78, 0.8, 0.12, 48]} />
      </mesh>
      <mesh position={[0, 0, 0.13]} material={m.brass}>
        <torusGeometry args={[0.76, 0.05, 12, 64]} />
      </mesh>
      <mesh position={[0, 0, 0.125]}>
        <circleGeometry args={[0.73, 64]} />
        <meshStandardMaterial map={face} roughness={0.6} />
      </mesh>
      <group position={[0, 0, 0.15]}>
        <group ref={hour}>
          <mesh position={[0, 0.17, 0]}>
            <boxGeometry args={[0.05, 0.4, 0.015]} />
            <meshStandardMaterial color="#1e1a17" />
          </mesh>
        </group>
        <group ref={minute} position={[0, 0, 0.012]}>
          <mesh position={[0, 0.26, 0]}>
            <boxGeometry args={[0.032, 0.58, 0.012]} />
            <meshStandardMaterial color="#1e1a17" />
          </mesh>
        </group>
        <group ref={second} position={[0, 0, 0.024]}>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.012, 0.62, 0.008]} />
            <meshStandardMaterial color="#c9503d" />
          </mesh>
        </group>
        <mesh position={[0, 0, 0.03]} material={m.brass}>
          <sphereGeometry args={[0.04, 12, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// Three prints to choose from (by seed): a wave at night, a fish, a lemon branch.
function drawPrint(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const kind = seed % 3;
  g.fillStyle = kind === 2 ? '#efe6d2' : '#1d3a46';
  g.fillRect(0, 0, w, h);
  if (kind === 0) {
    g.fillStyle = '#f2d58a';
    g.beginPath();
    g.arc(w * 0.68, h * 0.28, w * 0.12, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 4; i++) {
      g.fillStyle = ['#2f6f7a', '#3f8a8f', '#6fb3ae', '#d9ece4'][i];
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.58 + i * 0.1) + Math.sin(x * 0.035 + i * 1.7) * 10);
      g.lineTo(w, h);
      g.fill();
    }
  } else if (kind === 1) {
    g.fillStyle = '#ef8a6e';
    g.beginPath();
    g.ellipse(w * 0.48, h * 0.5, w * 0.27, h * 0.14, -0.15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(w * 0.72, h * 0.46);
    g.lineTo(w * 0.88, h * 0.36);
    g.lineTo(w * 0.86, h * 0.58);
    g.fill();
    g.fillStyle = '#1d3a46';
    g.beginPath();
    g.arc(w * 0.3, h * 0.48, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(w * (0.4 + i * 0.07), h * 0.5, 16, -0.9, 0.9);
      g.stroke();
    }
  } else {
    g.strokeStyle = '#6a5a3a';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w * 0.15, h * 0.85);
    g.quadraticCurveTo(w * 0.45, h * 0.55, w * 0.8, h * 0.18);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const t = 0.2 + i * 0.12;
      const x = w * (0.15 + 0.65 * t);
      const y = h * (0.85 - 0.67 * t);
      g.fillStyle = '#5f8a4f';
      g.beginPath();
      g.ellipse(x + (i % 2 ? 22 : -22), y, 24, 10, i % 2 ? 0.6 : -0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f2d548';
    g.beginPath();
    g.ellipse(w * 0.55, h * 0.62, 30, 22, 0.3, 0, Math.PI * 2);
    g.fill();
  }
}

/** A framed print with a pale mat. */
function FramedPrint({ seed }: { seed: number }) {
  const m = useMaterials();
  const art = useCanvasTexture((g, w, h) => drawPrint(g, w, h, seed), 256, 320, [seed]);
  const frame = useMemo(() => {
    const W = 0.8;
    const H = 1.02;
    const t = 0.11;
    const s = new THREE.Shape();
    s.moveTo(-W, -H);
    s.lineTo(W, -H);
    s.lineTo(W, H);
    s.lineTo(-W, H);
    s.lineTo(-W, -H);
    const hole = new THREE.Path();
    hole.moveTo(-W + t, -H + t);
    hole.lineTo(-W + t, H - t);
    hole.lineTo(W - t, H - t);
    hole.lineTo(W - t, -H + t);
    hole.lineTo(-W + t, -H + t);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  }, []);
  return (
    <group position={[0, 0, 0.005]}>
      <mesh geometry={frame} material={m.darkWood} castShadow />
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.38, 1.82]} />
        <meshStandardMaterial color="#f1ebdd" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.02, 0.035]}>
        <planeGeometry args={[1.0, 1.25]} />
        <meshStandardMaterial map={art} roughness={0.8} />
      </mesh>
    </group>
  );
}

function BowlsItem() {
  return <BowlStack m={useMaterials()} />;
}
function PothosItem() {
  return <Pothos m={useMaterials()} />;
}
function BasilItem() {
  return <Basil m={useMaterials()} />;
}

/** Things you can add around the tank in the kitchen. */
export const KITCHEN_ITEMS: CatalogItem[] = [
  { kind: 'k-jar', label: 'Storage jar', group: 'Pantry', surfaces: ['shelf', 'top', 'sill'], radius: 0.45, height: 1.4, Render: Jar },
  { kind: 'k-bowls', label: 'Stack of bowls', group: 'Pantry', surfaces: ['shelf', 'top'], radius: 0.6, height: 0.62, Render: BowlsItem },
  { kind: 'k-mug', label: 'Mug of coffee', group: 'Pantry', surfaces: ['top', 'shelf', 'sill'], radius: 0.45, height: 0.72, Render: Mug },
  { kind: 'k-board', label: 'Cutting board', group: 'Cooking', surfaces: ['top'], radius: 1.8, height: 0.3, Render: CuttingBoard },
  { kind: 'k-crock', label: 'Spoon crock', group: 'Cooking', surfaces: ['top'], radius: 0.6, height: 2.5, Render: Crock },
  { kind: 'k-fruit', label: 'Fruit bowl', group: 'Cooking', surfaces: ['top', 'shelf'], radius: 1.0, height: 1.1, Render: FruitBowl },
  { kind: 'k-pothos', label: 'Trailing pothos', group: 'Plants', surfaces: ['shelf', 'top', 'sill'], radius: 0.6, height: 1.0, Render: PothosItem },
  { kind: 'k-basil', label: 'Basil pot', group: 'Plants', surfaces: ['sill', 'top', 'shelf'], radius: 0.45, height: 1.3, Render: BasilItem },
  { kind: 'k-clock', label: 'Wall clock', group: 'Wall', surfaces: ['wall'], radius: 0.85, height: 1.6, Render: WallClock },
  { kind: 'k-print', label: 'Framed print', group: 'Wall', surfaces: ['wall'], radius: 0.9, height: 2.1, Render: FramedPrint },
];

const SHELF_Y = 4.05;
const SHELF_Z = WALL_Z + 0.55;
let n = 0;
const put = (kind: string, p: [number, number, number], r = 0, seed = 1, s = 1): Placed => ({ id: `k${++n}`, kind, p, r, s, seed });

/** The kitchen as it comes: the pantry on the shelf, basil on the sill, the prep corner and a mug. */
export const KITCHEN_LAYOUT: Placed[] = [
  put('k-jar', [-5.9, SHELF_Y, SHELF_Z], 0, 0),
  put('k-jar', [-4.9, SHELF_Y, SHELF_Z], 0, 1),
  put('k-jar', [-4.0, SHELF_Y, SHELF_Z], 0, 2),
  put('k-bowls', [-2.3, SHELF_Y, SHELF_Z]),
  put('k-jar', [3.1, SHELF_Y, SHELF_Z], 0, 3),
  put('k-jar', [3.95, SHELF_Y, SHELF_Z], 0, 4),
  put('k-pothos', [6.25, SHELF_Y, WALL_Z + 0.5]),
  put('k-basil', [-8.8, -1.4, WALL_Z + 0.34]),
  put('k-crock', [-11.4, TOP, -3.2]),
  put('k-board', [-9.6, TOP, 0.9], 0.12),
  put('k-fruit', [-7.6, TOP, 2.2]),
  put('k-mug', [7.6, TOP, 2.3], -0.5, 0),
];
