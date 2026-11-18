import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { blade, mergeParts, paintGeometry, setAttr, tubeThrough } from './geo';
import { cached, cone, meshSDF, smin, ssub, type SDF, type V3 } from './sdf';
import { C, mix, noise3, rng, smoothstep, worley3 } from './util';
import { underwater } from './water';

// Living plants: kelp with ruffled blades and floats, a seagrass meadow,
// anemones with glowing bubble tips, a lacy sea fan and tube sponges. They all
// sway in the same slow current (see water.ts).

const V = THREE.Vector3;

// Giant kelp: a slender stipe with long ruffled blades on alternate sides, each
// hung from a little gas float, all trailing the same way in the current.
// Blades are olive at the root and golden toward the tip, and let light through.
function kelpGeometry(seed: number, height: number) {
  const r = rng(seed * 17 + 2);
  const stemA = C('#3c4719');
  const stemB = C('#6b7429');
  const leafA = C('#4c6820');
  const leafB = C('#b9ad44');
  const edge = C('#dccf72');
  const rib = C('#3b4f17');
  const float = C('#8d9535');
  const ph = seed * 1.7;
  const SEG = 72;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const f = i / 9;
    return new V(Math.sin(f * 2.4 + ph) * 0.16 * f + 0.1 * f * f, f * height, Math.cos(f * 1.9 + ph * 2) * 0.1 * f);
  });
  const stem = tubeThrough(pts, (t) => 0.024 * (1 - t) + 0.009, SEG, 6, (t, _a, out) => mix(out, stemA, stemB, t));
  const parts: THREE.BufferGeometry[] = [setAttr(stem.geometry, 'aSway', (_x, y) => y / height)];
  // the holdfast: a knot of little roots gripping the sand
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r();
    const reach = 0.13 + r() * 0.08;
    const root = tubeThrough(
      [new V(0, 0.1, 0), new V(Math.cos(a) * reach * 0.45, 0.05, Math.sin(a) * reach * 0.45), new V(Math.cos(a) * reach, -0.015, Math.sin(a) * reach)],
      (t) => 0.018 * (1 - t) + 0.007,
      10,
      5,
      (_t, _a, out) => out.copy(stemA),
    );
    parts.push(setAttr(root.geometry, 'aSway', () => 0));
  }
  const n = Math.round(height * 7);
  const up = new V(0, 1, 0);
  const current = new V(1, 0, 0.25).normalize();
  const side = new V();
  const out = new V();
  const X = new V();
  const Z = new V();
  const dir = new V();
  const m = new THREE.Matrix4();
  for (let b = 0; b < n; b++) {
    const t = 0.06 + (b / n) * 0.9 + (r() - 0.5) * 0.012;
    const row = Math.round(t * SEG);
    const P = stem.pts[row];
    const T = stem.T[row];
    side.crossVectors(T, Math.abs(T.y) < 0.95 ? up : new V(1, 0, 0)).normalize();
    // alternate sides, with a slow twist up the stipe
    out.copy(side).applyAxisAngle(T, (b % 2) * Math.PI + b * 0.35 + (r() - 0.5) * 0.5);
    dir.copy(T).multiplyScalar(0.9).addScaledVector(out, 0.42).addScaledVector(current, 0.28).normalize();
    X.crossVectors(dir, out).normalize();
    Z.crossVectors(X, dir).normalize();
    const big = 0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const len = (0.62 + r() * 0.34) * big;
    const leaf = blade(len, (0.12 + r() * 0.05) * big, { segs: 18, across: 6, ruffle: 0.032, curl: 0.12, freq: 34, phase: r() * 6 });
    const uv = leaf.attributes.uv;
    paintGeometry(leaf, (_x, _y, _z, c, i) => {
      const u = uv.getY(i);
      const v = Math.abs(uv.getX(i) - 0.5) * 2;
      mix(c, leafA, leafB, Math.pow(u, 0.8));
      mix(c, c, edge, Math.pow(v, 3) * 0.4 * smoothstep(0.1, 0.4, u));
      mix(c, c, rib, smoothstep(0.2, 0, v) * 0.5 * (1 - u));
    });
    m.makeBasis(X, dir, Z).setPosition(P.clone().addScaledVector(out, 0.045));
    leaf.applyMatrix4(m);
    parts.push(setAttr(leaf, 'aSway', (_x, y) => y / height));
    const bladder = new THREE.SphereGeometry(0.03, 12, 9).scale(1, 1.35, 1).applyMatrix4(m);
    paintGeometry(bladder, (_x, _y, _z, c) => c.copy(float));
    parts.push(setAttr(bladder, 'aSway', (_x, y) => y / height));
  }
  // a crown of young blades at the top
  const top = stem.pts[SEG];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + r();
    out.set(Math.cos(a), 0, Math.sin(a));
    dir.set(0, 1, 0).addScaledVector(out, 0.35).addScaledVector(current, 0.3).normalize();
    X.crossVectors(dir, out).normalize();
    Z.crossVectors(X, dir).normalize();
    const leaf = blade(0.38 + r() * 0.14, 0.08, { segs: 12, across: 4, ruffle: 0.02, curl: 0.1, freq: 34, phase: r() * 6 });
    const uv = leaf.attributes.uv;
    paintGeometry(leaf, (_x, _y, _z, c, i) => mix(c, leafA, edge, 0.3 + uv.getY(i) * 0.6));
    m.makeBasis(X, dir, Z).setPosition(top);
    leaf.applyMatrix4(m);
    parts.push(setAttr(leaf, 'aSway', (_x, y) => y / height));
  }
  return mergeParts(parts);
}

let kelpMat: THREE.MeshStandardMaterial | null = null;

export function Kelp({ position, height = 4, seed = 1 }: { position: V3; height?: number; seed?: number }) {
  const geo = useMemo(() => cached(`kelp:${seed}:${height}`, () => kelpGeometry(seed, height)), [seed, height]);
  if (!kelpMat) kelpMat = underwater(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55 }), { sway: 0.26, flutter: 0.035, caustics: 0.5, translucent: 0.32 });
  return <mesh geometry={geo} material={kelpMat} position={position} castShadow />;
}

function grassBlade() {
  const g = blade(1, 0.034, { segs: 8, across: 1, ruffle: 0.004, curl: 0.14, tip: 0.99 });
  setAttr(g, 'aSway', (_x, y) => y);
  const a = C('#2d5a29');
  const b = C('#a9c95e');
  return paintGeometry(g, (_x, y, _z, c) => mix(c, a, b, y));
}

export function Seagrass({ center, area = [1.2, 0.6], count = 90, seed = 1, tall = 0.55 }: { center: V3; area?: [number, number]; count?: number; seed?: number; tall?: number }) {
  const geo = useMemo(() => cached('seagrass', grassBlade), []);
  const mat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), { sway: 0.1, flutter: 0.012, caustics: 0.35 }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const r = rng(seed * 31 + 7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new V();
    const s = new V();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      p.set(center[0] + Math.cos(a) * d * area[0], center[1], center[2] + Math.sin(a) * d * area[1]);
      e.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
      q.setFromEuler(e);
      s.set(1, tall * (0.45 + r() * 0.75) * (1 - d * 0.35), 1);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
      c.setScalar(0.8 + r() * 0.4);
      im.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [center, area, count, seed, tall]);
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}

function tentacleGeometry(col: string, tip: string) {
  const a = C(col);
  const b = C(tip);
  const tube = tubeThrough([new V(0, 0, 0), new V(0, 0.12, 0.02), new V(0, 0.22, 0.07), new V(0, 0.3, 0.13)], (t) => 0.017 * (1 - t * 0.4), 12, 6, (t, _a, out) => mix(out, a, b, smoothstep(0.5, 1, t) * 0.6));
  const bulb = new THREE.SphereGeometry(0.025, 10, 8).translate(0, 0.3, 0.13);
  paintGeometry(bulb, (_x, _y, _z, c) => c.copy(b));
  const g = mergeParts([tube.geometry, bulb]);
  return setAttr(g, 'aSway', (_x, y) => Math.max(0, y) / 0.32);
}

function columnGeometry(col: string) {
  const profile = [
    [0.0, 0],
    [0.17, 0],
    [0.15, 0.08],
    [0.14, 0.2],
    [0.17, 0.28],
    [0.2, 0.31],
    [0.0, 0.31],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(profile, 28);
  const a = C(col);
  const b = C('#f1d6c4');
  return paintGeometry(g, (_x, y, _z, c) => mix(c, a, b, smoothstep(0.2, 0.31, y) * 0.6));
}

export function Anemone({ position, color = '#b65bd0', tip = '#ffd0f6', column = '#c4977a', scale = 1 }: { position: V3; color?: string; tip?: string; column?: string; scale?: number }) {
  const tent = useMemo(() => cached(`anemone-t:${color}:${tip}`, () => tentacleGeometry(color, tip)), [color, tip]);
  const col = useMemo(() => cached(`anemone-c:${column}`, () => columnGeometry(column)), [column]);
  const tentMat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), { sway: 0.06, glow: 1.1, caustics: 0.3 }), []);
  const colMat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { caustics: 0.5 }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const rings: [number, number][] = [
    [0.05, 9],
    [0.11, 18],
    [0.165, 28],
  ];
  const total = rings.reduce((n, [, k]) => n + k, 0);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new V();
    const s = new V();
    let n = 0;
    rings.forEach(([rad, k], ri) => {
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + ri * 0.4;
        p.set(Math.cos(a) * rad, 0.3, Math.sin(a) * rad);
        e.set(0.15 + ri * 0.25, Math.PI / 2 - a, 0, 'YXZ');
        q.setFromEuler(e);
        s.setScalar(0.85 + ri * 0.12);
        m.compose(p, q, s);
        im.setMatrixAt(n++, m);
      }
    });
    im.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <group position={position} scale={scale}>
      <mesh geometry={col} material={colMat} castShadow receiveShadow />
      <instancedMesh ref={ref} args={[tent, tentMat, total]} frustumCulled={false} />
    </group>
  );
}

let fanTex: THREE.CanvasTexture | null = null;
function seaFanTexture() {
  if (fanTex) return fanTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  const r = rng(77);
  const ends: [number, number][] = [];
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * len * 0.3, (y + y2) / 2, x2, y2);
    g.stroke();
    ends.push([x2, y2]);
    if (depth === 0) return;
    branch(x2, y2, a - 0.25 - r() * 0.3, len * 0.8, w * 0.72, depth - 1);
    branch(x2, y2, a + 0.25 + r() * 0.3, len * 0.8, w * 0.72, depth - 1);
  };
  branch(256, 506, -Math.PI / 2, 90, 14, 6);
  g.lineWidth = 2;
  for (let i = 0; i < 260; i++) {
    const a = ends[Math.floor(r() * ends.length)];
    const b = ends[Math.floor(r() * ends.length)];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 46) continue;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  fanTex = new THREE.CanvasTexture(c);
  fanTex.colorSpace = THREE.SRGBColorSpace;
  return fanTex;
}

export function SeaFan({ position, color = '#a24f96', size = 1, rotation = 0 }: { position: V3; color?: string; size?: number; rotation?: number }) {
  const geo = useMemo(
    () =>
      cached('sea-fan', () => {
        const g = new THREE.PlaneGeometry(1.1, 1.1, 16, 16).translate(0, 0.55, 0);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, 0.1 * Math.sin(p.getX(i) * 2.6) + 0.05 * p.getY(i));
        g.computeVertexNormals();
        return setAttr(g, 'aSway', (_x, y) => y / 1.1);
      }),
    [],
  );
  const mat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ map: seaFanTexture(), color, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6 }), { sway: 0.06, caustics: 0.5 }), [color]);
  return <mesh geometry={geo} material={mat} position={position} scale={size} rotation={[0, rotation, 0]} castShadow />;
}

// Tube sponges: a cluster of hollow, slightly leaning vases with soft rolled
// lips, a lumpy skin dotted with pores, and a dark throat.
function spongeGeometry(body: string, lip: string) {
  const a = C(body);
  const b = C(lip);
  const throat = C(body).multiplyScalar(0.3);
  const pore = C(body).multiplyScalar(0.55);
  const tubes: [number, number, number, number, number, number][] = [
    // x, z, height, radius, lean x, lean z
    [0, 0, 0.6, 0.085, 0.02, -0.03],
    [0.16, 0.06, 0.45, 0.072, 0.07, 0.02],
    [-0.13, 0.11, 0.36, 0.066, -0.07, 0.04],
    [0.05, -0.15, 0.27, 0.058, 0.02, -0.06],
  ];
  const shapes: SDF[] = tubes.map(([x, z, h, rad, lx, lz]) => {
    const outer = cone(x, -0.05, z, x + lx, h, z + lz, rad * 0.88, rad * 1.1);
    const inner = cone(x + lx * 0.1, 0.08, z + lz * 0.1, x + lx * 1.1, h + 0.12, z + lz * 1.1, rad * 0.58, rad * 0.8);
    return (px, py, pz) => ssub(outer(px, py, pz), inner(px, py, pz), 0.025);
  });
  const sdf: SDF = (x, y, z) => {
    let d = shapes[0](x, y, z);
    for (let i = 1; i < shapes.length; i++) d = smin(d, shapes[i](x, y, z), 0.05);
    d += 0.006 * noise3(x * 22, y * 22, z * 22);
    return Math.max(d, -y - 0.01);
  };
  // how deep inside a tube's mouth a point is: 1 down in the throat, 0 outside
  const depthIn = (x: number, y: number, z: number) => {
    let best = 0;
    for (const [tx, tz, h, rad, lx, lz] of tubes) {
      const k = Math.min(1, Math.max(0, y / h));
      const cx = tx + lx * k;
      const cz = tz + lz * k;
      const radial = Math.hypot(x - cx, z - cz);
      best = Math.max(best, smoothstep(rad * 0.85, rad * 0.62, radial) * smoothstep(h + 0.02, h - 0.12, y));
    }
    return best;
  };
  return meshSDF(sdf, {
    min: [-0.32, -0.04, -0.3],
    max: [0.36, 0.68, 0.3],
    cell: 0.0075,
    paint: (x, y, z, _nx, _ny, _nz, out) => {
      mix(out, a, b, smoothstep(0.05, 0.6, y) * 0.55);
      mix(out, out, pore, smoothstep(0.17, 0.08, worley3(x * 34, y * 34, z * 34)) * 0.75);
      mix(out, out, throat, depthIn(x, y, z));
    },
  });
}

export function TubeSponges({ position, scale = 1, rotation = 0, body = '#e27a3a', lip = '#ffcf7a' }: { position: V3; scale?: number; rotation?: number; body?: string; lip?: string }) {
  const geo = useMemo(() => cached(`sponges:${body}:${lip}`, () => spongeGeometry(body, lip)), [body, lip]);
  const mat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { caustics: 0.6 }), []);
  return <mesh geometry={geo} material={mat} position={position} scale={scale} rotation={[0, rotation, 0]} castShadow receiveShadow />;
}
