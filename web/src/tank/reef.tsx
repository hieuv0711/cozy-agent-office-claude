import { useMemo } from 'react';
import * as THREE from 'three';
import { cached, conePart, ellipsoid, meshSDF, type Part, smin, ssub, type SDF, unionParts, type V3 } from './sdf';
import { C, fbm3, mix, noise3, rng, smoothstep, worley3 } from './util';
import { underwater } from './water';

// The reef: rocks, corals, the axolotl's shell bed and rippled sand.

let reefMat: THREE.MeshStandardMaterial | null = null;
function reefMaterial() {
  if (!reefMat) reefMat = underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), { caustics: 0.75 });
  return reefMat;
}

function rockGeometry(seed: number, [rx, ry, rz]: V3) {
  const r = rng(seed * 7 + 3);
  const m = Math.max(rx, ry, rz);
  const parts = [
    ellipsoid(0, 0, 0, rx, ry, rz),
    ellipsoid((r() - 0.5) * rx * 0.9, ry * 0.25, (r() - 0.5) * rz * 0.8, rx * 0.62, ry * 0.75, rz * 0.6),
    ellipsoid((r() - 0.5) * rx * 0.9, -ry * 0.1, (r() - 0.5) * rz * 0.8, rx * 0.55, ry * 0.6, rz * 0.65),
  ];
  const s = seed * 3.1;
  const f = 2.2 / m;
  const field = (x: number, y: number, z: number) => fbm3(x * f + s, y * f, z * f, 3);
  const sdf = (x: number, y: number, z: number) => {
    let d = smin(smin(parts[0](x, y, z), parts[1](x, y, z), 0.25 * m), parts[2](x, y, z), 0.25 * m);
    d += m * (0.11 * field(x, y, z) + 0.018 * noise3(x * f * 5, y * f * 5, z * f * 5));
    return Math.max(d, -(y + ry * 0.45));
  };
  // Weathered grey stone: dark in the hollows, a little speckle, soft moss
  // where light falls, a few small crusts of pink coralline, sand at the foot.
  const base = C('#6f777b');
  const dark = C('#394046');
  const light = C('#959c9c');
  const moss = C('#6d7f47');
  const crust = C('#c48a8e');
  const dust = C('#a39476');
  return meshSDF(sdf, {
    min: [-rx * 1.5, -ry * 0.5, -rz * 1.5],
    max: [rx * 1.5, ry * 1.5, rz * 1.5],
    cell: m / 34,
    lipschitz: 2.2,
    paint: (x, y, z, _nx, ny, _nz, out) => {
      const v = field(x, y, z);
      mix(out, dark, base, smoothstep(-0.22, 0.18, v));
      mix(out, out, light, smoothstep(0.25, 0.6, noise3(x * f * 9, y * f * 9 + 2, z * f * 9)) * 0.3);
      mix(out, out, moss, smoothstep(0.5, 0.92, ny) * smoothstep(-0.05, 0.4, noise3(x * f * 4, y * f * 4 + 4, z * f * 4)) * 0.55);
      const w = worley3(x * f * 1.7 + seed * 3, y * f * 1.7, z * f * 1.7);
      mix(out, out, crust, smoothstep(0.24, 0.14, w) * smoothstep(-0.4, 0.3, ny) * 0.6);
      mix(out, out, dust, smoothstep(-ry * 0.2, -ry * 0.42, y) * 0.8);
    },
  });
}

export function Rock({ position, size, seed = 1, rotation = 0 }: { position: V3; size: V3; seed?: number; rotation?: number }) {
  const geo = useMemo(() => cached(`rock:${seed}:${size.join(',')}`, () => rockGeometry(seed, size)), [seed, size]);
  return <mesh geometry={geo} material={reefMaterial()} position={position} rotation={[0, rotation, 0]} castShadow receiveShadow />;
}

// A bushy staghorn-style coral: a few trunks that lean apart and fork three
// times into blunt, pale-tipped fingers dotted with polyps.
function branchCoralGeometry(seed: number, base: string, tip: string) {
  const r = rng(seed * 13 + 5);
  const parts: Part[] = [];
  const tips: V3[] = [];
  const grow = (p: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const q = p.clone().addScaledVector(dir, len);
    parts.push(conePart([p.x, p.y, p.z], [q.x, q.y, q.z], rad, rad * 0.86));
    if (depth === 0) {
      tips.push([q.x, q.y, q.z]);
      return;
    }
    const kids = 2 + (r() < 0.35 ? 1 : 0);
    const spin = r() * Math.PI * 2;
    for (let k = 0; k < kids; k++) {
      const a = spin + (k / kids) * Math.PI * 2;
      const axis = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).cross(dir).normalize();
      const d = dir.clone().applyAxisAngle(axis, 0.42 + r() * 0.3);
      d.y += 0.22;
      grow(q, d.normalize(), len * (0.74 + r() * 0.14), rad * 0.8, depth - 1);
    }
  };
  const trunks = 3;
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + r() * 0.8;
    const lean = 0.35 + r() * 0.2;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    grow(new THREE.Vector3(Math.cos(a) * 0.03, -0.04, Math.sin(a) * 0.03), dir, 0.2 + r() * 0.05, 0.058, 3);
  }
  const union = unionParts(parts, 0.03);
  const sdf = (x: number, y: number, z: number) => Math.max(union(x, y, z), -y - 0.02);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p.c[i] - p.r - 0.02);
      hi[i] = Math.max(hi[i], p.c[i] + p.r + 0.02);
    }
  lo[1] = Math.max(lo[1], -0.06);
  const cb = C(base);
  const ct = C(tip);
  const deep = C(base).multiplyScalar(0.62);
  return meshSDF(sdf, {
    min: lo as V3,
    max: hi as V3,
    cell: 0.0095,
    paint: (x, y, z, _nx, _ny, _nz, out) => {
      let near = Infinity;
      for (const t of tips) near = Math.min(near, (x - t[0]) ** 2 + (y - t[1]) ** 2 + (z - t[2]) ** 2);
      near = Math.sqrt(near);
      mix(out, deep, cb, smoothstep(0.0, 0.3, y));
      mix(out, out, ct, smoothstep(0.13, 0.02, near));
      // polyps: tiny pale dots all over
      mix(out, out, ct, smoothstep(0.2, 0.1, worley3(x * 38, y * 38, z * 38)) * 0.55);
    },
  });
}

export function BranchCoral({ position, seed = 1, base = '#d95f78', tip = '#ffe0d6', scale = 1, rotation = 0 }: { position: V3; seed?: number; base?: string; tip?: string; scale?: number; rotation?: number }) {
  const geo = useMemo(() => cached(`branch:${seed}:${base}:${tip}`, () => branchCoralGeometry(seed, base, tip)), [seed, base, tip]);
  return <mesh geometry={geo} material={reefMaterial()} position={position} scale={scale} rotation={[0, rotation, 0]} castShadow receiveShadow />;
}

function brainCoralGeometry(seed: number) {
  const dome = ellipsoid(0, 0, 0, 0.5, 0.34, 0.45);
  const s = seed * 5.3;
  const stripes = (x: number, y: number, z: number) => 0.5 + 0.5 * Math.sin(16 * fbm3(x * 2.2 + s, y * 2.2, z * 2.2, 3));
  const sdf: SDF = (x, y, z) => {
    let d = dome(x, y, z);
    d += 0.024 * smoothstep(0.3, 0.05, stripes(x, y, z));
    return Math.max(d, -y - 0.02);
  };
  const ridge = C('#cdbb7c');
  const valley = C('#6f6037');
  const rim = C('#9e8f5a');
  return meshSDF(sdf, {
    min: [-0.56, -0.05, -0.5],
    max: [0.56, 0.38, 0.5],
    cell: 0.01,
    lipschitz: 3,
    paint: (x, y, z, _nx, _ny, _nz, out) => {
      mix(out, valley, ridge, smoothstep(0.1, 0.45, stripes(x, y, z)));
      mix(out, out, rim, smoothstep(0.08, 0.0, y) * 0.6);
    },
  });
}

export function BrainCoral({ position, seed = 1, scale = 1 }: { position: V3; seed?: number; scale?: number }) {
  const geo = useMemo(() => cached(`brain:${seed}`, () => brainCoralGeometry(seed)), [seed]);
  return <mesh geometry={geo} material={reefMaterial()} position={position} scale={scale} castShadow receiveShadow />;
}

// A scallop shell, open like a bowl: ribs fan out from the hinge and ripple
// the rim; the outside is banded coral-peach, the inside smooth and pearly.
function shellGeometry() {
  const HZ = -0.6;
  const outer = ellipsoid(0, 0.1, 0, 0.84, 0.24, 0.68);
  const inner = ellipsoid(0, 0.23, 0.04, 0.75, 0.2, 0.58);
  const ears = [ellipsoid(-0.17, 0.09, HZ - 0.02, 0.16, 0.06, 0.09), ellipsoid(0.17, 0.09, HZ - 0.02, 0.16, 0.06, 0.09)];
  const ribs = (x: number, z: number) => 0.5 + 0.5 * Math.cos(Math.atan2(x, z - HZ) * 21);
  const sdf: SDF = (x, y, z) => {
    let d = ssub(outer(x, y, z), inner(x, y, z), 0.035);
    d = smin(d, Math.min(ears[0](x, y, z), ears[1](x, y, z)), 0.04);
    d -= 0.032 * ribs(x, z) * smoothstep(0.12, 0.45, Math.hypot(x, z - HZ));
    return Math.max(d, -y - 0.01);
  };
  const ridge = C('#ffd7c4');
  const groove = C('#e58a7a');
  const band = C('#d0705f');
  const pearl = C('#fde6e0');
  const blush = C('#f7b9b0');
  return meshSDF(sdf, {
    min: [-0.95, -0.05, -0.82],
    max: [0.95, 0.4, 0.78],
    cell: 0.012,
    lipschitz: 2,
    paint: (x, y, z, _nx, ny, _nz, out) => {
      const d = Math.hypot(x, z - HZ);
      mix(out, groove, ridge, ribs(x, z));
      mix(out, out, band, smoothstep(0.6, 0.95, 0.5 + 0.5 * Math.cos(d * 19)) * 0.45);
      // the inside of the bowl
      const inside = smoothstep(0.35, 0.8, ny) * smoothstep(0.1, 0.2, y);
      mix(out, out, pearl, inside * 0.85);
      mix(out, out, blush, inside * smoothstep(0.2, 0.7, d) * 0.35);
    },
  });
}

export function ShellBed({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  const geo = useMemo(() => cached('shell-bed', shellGeometry), []);
  const mat = useMemo(() => underwater(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.5, sheen: 0.4 }), { caustics: 0.6 }), []);
  return <mesh geometry={geo} material={mat} position={position} rotation={[0, rotation, 0]} castShadow receiveShadow />;
}

/** Height of the rippled sand above its base level (in the Sand's own frame). */
export function sandHeight(x: number, z: number) {
  const ripple = 0.03 * Math.sin(x * 5.5 + 2.2 * noise3(x * 0.6, 0.5, z * 0.6)) * (0.6 + 0.4 * noise3(x * 0.3, 1.5, z * 0.3));
  return ripple + 0.12 * fbm3(x * 0.25, 2.5, z * 0.25, 2);
}

// The sand's cut face against the front and side glass: settled layers, a
// little darker with depth, and gravel near the bottom.
function skirtGeometry(width: number, depth: number, skirt: number) {
  const hw = width / 2;
  const hd = depth / 2;
  const ROWS = 10;
  const edges: { n: number; at: (u: number) => [number, number]; normal: [number, number, number] }[] = [
    { n: 200, at: (u) => [-hw + u * width, hd], normal: [0, 0, 1] },
    { n: 80, at: (u) => [-hw, -hd + u * depth], normal: [-1, 0, 0] },
    { n: 80, at: (u) => [hw, hd - u * depth], normal: [1, 0, 0] },
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const top = C('#c3a982');
  const deep = C('#8e7656');
  const band = C('#b39b74');
  const grit = C('#6d6150');
  const pale = C('#ddd0b4');
  const tmp = new THREE.Color();
  for (const e of edges) {
    const base = pos.length / 3;
    for (let i = 0; i <= e.n; i++) {
      const [x, z] = e.at(i / e.n);
      const h = sandHeight(x, z);
      for (let r = 0; r <= ROWS; r++) {
        const f = r / ROWS;
        const y = h + (-skirt - h) * f;
        pos.push(x, y, z);
        nor.push(...e.normal);
        const along = x + z;
        mix(tmp, top, deep, smoothstep(0, 1, f));
        mix(tmp, tmp, band, smoothstep(0.55, 0.9, 0.5 + 0.5 * Math.sin(y * 70 + 3 * noise3(along * 1.5, y * 4, 0.7))) * 0.4);
        mix(tmp, tmp, grit, smoothstep(0.26, 0.12, worley3(along * 18, y * 18, 2.5)) * smoothstep(0.35, 0.8, f) * 0.8);
        mix(tmp, tmp, pale, smoothstep(0.2, 0.08, worley3(along * 30 + 7, y * 30, 9.1)) * 0.45);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < e.n; i++)
      for (let r = 0; r < ROWS; r++) {
        const a = base + i * (ROWS + 1) + r;
        const b = a + ROWS + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export function Sand({ width, depth, y = 0, segments = [160, 70], skirt = 0 }: { width: number; depth: number; y?: number; segments?: [number, number]; skirt?: number }) {
  const sides = useMemo(() => (skirt > 0 ? skirtGeometry(width, depth, skirt) : null), [width, depth, skirt]);
  const sideMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, depth, segments[0], segments[1]).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, sandHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const light = C('#cdb48c');
    const dark = C('#a48a63');
    const speck = C('#7f6f58');
    const tmp = new THREE.Color();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      mix(tmp, dark, light, smoothstep(-0.3, 0.3, noise3(x * 0.8, 3.3, z * 0.8)));
      mix(tmp, tmp, speck, smoothstep(0.35, 0.5, noise3(x * 9, 7.1, z * 9)) * 0.35);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [width, depth, segments]);
  const mat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { caustics: 1.2 }), []);
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={geo} material={mat} receiveShadow userData={{ surface: 'sand' }} />
      {sides && <mesh geometry={sides} material={sideMat} />}
    </group>
  );
}
