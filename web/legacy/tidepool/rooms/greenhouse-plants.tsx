import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import {
  aim,
  C,
  canvasTexture,
  clayMaterial,
  fbm3,
  leafGeometry,
  leafMaterial,
  leafPaint,
  Merger,
  mix,
  noise3,
  once,
  paint,
  type PotShape,
  repeated,
  rng,
  smoothstep,
  soilGeometry,
  soilMaterial,
  speckleTexture,
  terracottaGeometry,
  trs,
  V,
  vcMaterial,
  vcPhysical,
} from './greenhouse-kit';

// The greenhouse plants: each is built once per seed variant into a few merged
// meshes (leaves, stems, pot), so a bench full of them stays cheap to draw.

const UP = new THREE.Vector3(0, 1, 0);
const variantOf = (seed: number, n: number) => ((Math.floor(seed) % n) + n) % n;

// ---------- pots ----------

export const soilRadius = (s: PotShape) => s.r - Math.max(0.035, s.r * 0.07) - 0.012;
export const soilLevel = (s: PotShape) => s.h * (s.soil ?? 0.86);

/** A terracotta pot, painted per seed, with potting soil if it is planted. */
export function Pot({ shape, seed, soil = true }: { shape: PotShape; seed: number; soil?: boolean }) {
  const v = variantOf(seed, 5);
  const key = [shape.r, shape.h, shape.base, shape.rim, shape.rimH, shape.soil].join(':');
  const geo = useMemo(() => once(`pot:${key}:${v}`, () => terracottaGeometry(shape, v + 1)), [key, v, shape]);
  return (
    <group>
      <mesh geometry={geo} material={clayMaterial()} castShadow receiveShadow />
      {soil && <mesh geometry={soilGeometry(soilRadius(shape), v)} material={soilMaterial()} position={[0, soilLevel(shape) - 0.025, 0]} receiveShadow />}
    </group>
  );
}

const GLAZES = ['#e8e0cc', '#7f9b86', '#2e4c6e', '#b8613f', '#3b3d3a'];

/** A glazed stoneware pot: straight sides, a rolled lip, glaze pooling dark at the foot, a bare clay foot ring. */
export function glazedPotGeometry(r: number, h: number, glaze: string, soil = 0.88) {
  return once(`glazed:${r}:${h}:${glaze}`, () => {
    const n = 90;
    const g = smoothLathe(
      [
        [0, 0],
        [r * 0.78, 0],
        [r * 0.84, 0.02],
        [r * 0.86, 0.07],
        [r * 0.9, h * 0.3],
        [r * 0.97, h * 0.75],
        [r, h * 0.94],
        [r * 0.99, h - 0.01],
        [r * 0.95, h],
        [r * 0.9, h - 0.03],
        [r * 0.89, h * 0.9],
        [r * 0.86, h * soil - 0.08],
        [0, h * soil - 0.08],
      ],
      n,
      56,
    );
    const gc = C(glaze);
    const deep = gc.clone().multiplyScalar(0.55);
    const pale = gc.clone().lerp(C('#ffffff'), 0.25);
    const foot = C('#b9926c');
    return paint(g, (x, y, z, out, i) => {
      const along = (i % (n + 1)) / n;
      const t = y / h;
      out.copy(gc).multiplyScalar(0.94 + 0.08 * noise3(x * 5, y * 5, z * 5));
      // glaze runs thin over the lip and pools toward the foot
      mix(out, out, pale, smoothstep(0.9, 1, t) * 0.6);
      mix(out, out, deep, smoothstep(0.35, 0.08, t) * 0.55);
      if (y < 0.06 && along < 0.2) out.copy(foot).multiplyScalar(0.9 + 0.2 * noise3(x * 9, 0, z * 9));
      if (along > 0.75) out.multiplyScalar(0.7);
    });
  });
}

export function glazeMaterial() {
  return vcPhysical('glaze', { roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.12 });
}

// ---------- shared plant pieces ----------

/** A round leaf on a polar grid (attached at its centre), so it can cup and carry colour zones. */
export function polarLeaf(o: { R: number; edge: (a: number) => number; rings?: number; seg?: number; cup?: number; droop?: number; paint?: (rho: number, a: number, out: THREE.Color) => void }) {
  const rings = o.rings ?? 5;
  const seg = o.seg ?? 36;
  const pos: number[] = [0, 0, 0];
  const col: number[] = [];
  const tmp = new THREE.Color();
  const put = (rho: number, a: number) => {
    tmp.setRGB(1, 1, 1);
    o.paint?.(rho, a, tmp);
    col.push(tmp.r, tmp.g, tmp.b);
  };
  put(0, 0);
  for (let k = 1; k <= rings; k++) {
    const rho = k / rings;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const rr = o.R * rho * o.edge(a);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      // cupped, and drooping away from the face toward the tip (+y)
      const z = (o.cup ?? 0) * rho * rho * o.R - (o.droop ?? 0) * Math.max(0, y / o.R) ** 2 * o.R;
      pos.push(x, y, z);
      put(rho, a);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < seg; s++) idx.push(0, 1 + s, 1 + ((s + 1) % seg));
  for (let k = 1; k < rings; k++)
    for (let s = 0; s < seg; s++) {
      const a = 1 + (k - 1) * seg + s;
      const b = 1 + (k - 1) * seg + ((s + 1) % seg);
      const c = 1 + k * seg + s;
      const d = 1 + k * seg + ((s + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A small five-petalled flower facing +z (petals cupped forward), centred at the origin. */
function blossom(petal: string, heart: string, size = 1, petals = 5) {
  const m = new Merger();
  const p = leafGeometry({
    len: 0.5 * size,
    width: 0.42 * size,
    nu: 2,
    nv: 4,
    outline: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + v * 0.95)), 0.5),
    cup: 0.25,
    arch: -0.5,
    paint: (u, v, out) => mix(out, C(petal).multiplyScalar(0.8), C(petal), smoothstep(0, 0.5, v) * (1 - Math.abs(u) * 0.1)),
  });
  for (let i = 0; i < petals; i++) m.add(p, trs([0, 0, 0], [0, 0, (i / petals) * Math.PI * 2]));
  const c = new THREE.SphereGeometry(0.09 * size, 8, 6);
  m.add(paint(c, (_x, _y, _z, out) => out.set(heart)), trs([0, 0, 0.03 * size]));
  return m.build();
}

const stemPaint = (a: string, b: string) => (t: number, _a: number, out: THREE.Color) => mix(out, C(a), C(b), t);

// ---------- monstera ----------

const MONSTERA_POT: PotShape = { r: 0.62, h: 1.02 };

/** Three monstera leaves side by side (young, mature, very split): veins painted, slits and holes cut out. */
function monsteraAtlas() {
  return canvasTexture(
    'gh-monstera',
    1536,
    512,
    (g, w, h) => {
      const W = w / 3;
      for (let k = 0; k < 3; k++) {
        const r = rng(k * 13 + 5);
        const X = (u: number) => k * W + u * W;
        const Y = (v: number) => (1 - v) * h;
        const base = g.createLinearGradient(X(0), 0, X(1), 0);
        base.addColorStop(0, '#2b5c29');
        base.addColorStop(0.5, '#367034');
        base.addColorStop(1, '#2b5c29');
        g.fillStyle = base;
        g.fillRect(X(0), 0, W, h);
        // soft mottling
        for (let i = 0; i < 260; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(20,50,20,0.06)' : 'rgba(120,170,90,0.05)';
          g.beginPath();
          g.ellipse(X(r()), Y(r()), 6 + r() * 18, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
        const attach = 0.13;
        const nV = 9;
        const vein = (i: number) => attach + 0.04 + i * (0.8 / nV);
        // side veins curving out toward the edge, rising toward the tip
        for (let i = 0; i < nV; i++)
          for (const s of [-1, 1]) {
            const v0 = vein(i);
            g.strokeStyle = 'rgba(165,205,125,0.42)';
            g.lineWidth = 3.2;
            g.beginPath();
            g.moveTo(X(0.5), Y(v0));
            g.quadraticCurveTo(X(0.5 + s * 0.24), Y(v0 + 0.035), X(0.5 + s * 0.52), Y(v0 + 0.1));
            g.stroke();
          }
        // the midrib, tapering
        for (let i = 0; i < 20; i++) {
          const v0 = attach + (i / 20) * (1 - attach);
          g.strokeStyle = 'rgba(190,222,150,0.75)';
          g.lineWidth = 8 * (1 - i / 22);
          g.beginPath();
          g.moveTo(X(0.5), Y(v0));
          g.lineTo(X(0.5), Y(v0 + (1 - attach) / 20 + 0.004));
          g.stroke();
        }
        // cut-outs
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        // the sinus where the stalk joins, between the two basal lobes
        g.beginPath();
        g.moveTo(X(0.42), Y(-0.01));
        g.quadraticCurveTo(X(0.48), Y(attach * 0.5), X(0.5), Y(attach));
        g.quadraticCurveTo(X(0.52), Y(attach * 0.5), X(0.58), Y(-0.01));
        g.fill();
        // slits from the edge, between the veins
        const slits = k === 0 ? 2 : k === 1 ? 5 : 7;
        for (const s of [-1, 1])
          for (let i = 0; i < nV - 1; i++) {
            const order = [3, 4, 2, 5, 6, 1, 7];
            if (order.indexOf(i) < 0 || order.indexOf(i) >= slits) continue;
            const vm = (vein(i) + vein(i + 1)) / 2;
            const depth = 0.3 + r() * 0.12;
            const wEdge = 0.022 + r() * 0.014;
            g.beginPath();
            g.moveTo(X(0.5 + s * (0.5 - depth)), Y(vm + 0.012));
            g.quadraticCurveTo(X(0.5 + s * (0.52 - depth * 0.45)), Y(vm + 0.045 - wEdge * 0.4), X(0.5 + s * 0.56), Y(vm + 0.085 - wEdge));
            g.lineTo(X(0.5 + s * 0.56), Y(vm + 0.085 + wEdge));
            g.quadraticCurveTo(X(0.5 + s * (0.52 - depth * 0.45)), Y(vm + 0.045 + wEdge * 0.6), X(0.5 + s * (0.5 - depth)), Y(vm + 0.012));
            g.fill();
          }
        // a row of holes near the midrib
        const holes = k === 0 ? 3 : 6;
        for (let i = 0; i < holes; i++)
          for (const s of [-1, 1]) {
            if (r() < 0.35) continue;
            const vi = 1 + Math.floor(r() * (nV - 3));
            const vm = (vein(vi) + vein(vi + 1)) / 2;
            g.save();
            g.translate(X(0.5 + s * (0.13 + r() * 0.08)), Y(vm + 0.012));
            g.rotate(-s * 0.35);
            g.beginPath();
            g.ellipse(0, 0, W * (0.035 + r() * 0.02), h * (0.012 + r() * 0.007), 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
        g.restore();
      }
    },
    { wrap: false },
  );
}

/** Heart-shaped: rounded basal lobes, widest a third of the way up, a pointed tip. */
const monsteraOutline = (v: number) => {
  if (v < 0.32) return 0.45 + 0.55 * Math.sin((v / 0.32) * (Math.PI / 2));
  const t = (v - 0.32) / 0.68;
  return Math.pow(Math.cos(t * (Math.PI / 2)), 0.85) * (1 - 0.08 * t);
};

function monsteraGeometry(variant: number) {
  const r = rng(variant * 97 + 13);
  const soilY = soilLevel(MONSTERA_POT);
  const leaves = new Merger();
  const stems = new Merger();
  const n = 9 + variant;
  for (let i = 0; i < n; i++) {
    const young = i >= n - 2;
    // spread round the pot, fullest toward the front
    const az = ((i + 0.5) / n - 0.5) * Math.PI * 2 * 0.92 + (r() - 0.5) * 0.4 + variant;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const reach = young ? 0.3 + r() * 0.3 : 0.65 + r() * 0.75;
    const height = young ? 2.7 + r() * 0.6 : 1.2 + r() * 1.7;
    const P = V(out.x * reach, soilY + height, out.z * reach);
    const base = V(out.x * 0.1, soilY - 0.05, out.z * 0.1);
    const pts = [base, base.clone().add(V(0, height * 0.5, 0)).addScaledVector(out, reach * 0.1), P.clone().addScaledVector(out, -reach * 0.22).add(V(0, -0.04, 0)), P];
    stems.add(tubeThrough(pts, (t) => 0.042 - t * 0.018, 30, 6, stemPaint('#9fa85a', '#4c7a33')).geometry);
    const L = young ? 0.85 + r() * 0.3 : 1.2 + r() * 0.55;
    const pitch = young ? 0.55 + r() * 0.35 : 0.05 + r() * 0.45;
    const dir = out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch)).normalize();
    const face = UP.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(out, -Math.sin(pitch)).normalize();
    face.applyAxisAngle(dir, (r() - 0.5) * 0.7);
    const kind = young ? 0 : r() < 0.55 ? 1 : 2;
    const leaf = leafGeometry({ len: L, width: L * 0.88, nu: 8, nv: 16, outline: monsteraOutline, arch: 0.45 + r() * 0.45, cup: -0.07, fold: 0.08 });
    const uv = leaf.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setX(j, (kind + uv.getX(j)) / 3);
    leaf.translate(0, -0.13 * L, 0);
    const tint = young ? C('#cfe9a0') : C('#ffffff').lerp(C('#c9dcae'), r() * 0.5).multiplyScalar(0.9 + r() * 0.2);
    leaves.add(leaf, aim(P, dir, face), tint);
  }
  // a coir pole up the middle, and an aerial root or two
  const pole = paint(new THREE.CylinderGeometry(0.075, 0.085, 2.5, 10, 14).translate(0, soilY + 1.2, -0.12), (x, y, z, out) => {
    mix(out, C('#5a3e27'), C('#8a6a45'), smoothstep(-0.4, 0.6, noise3(x * 30, y * 6, z * 30)));
    mix(out, out, C('#4d6a2c'), smoothstep(0.3, 0.7, noise3(x * 8, y * 3, z * 8)) * 0.5);
  });
  stems.add(pole);
  for (let k = 0; k < 2; k++) {
    const a = r() * Math.PI * 2;
    const o = V(Math.sin(a), 0, Math.cos(a));
    const top = V(o.x * 0.2, soilY + 1.1 + r() * 0.6, o.z * 0.2 - 0.12);
    stems.add(tubeThrough([top, top.clone().addScaledVector(o, 0.3).add(V(0, -0.2, 0)), V(o.x * 0.62, soilY + 0.05, o.z * 0.62)], (t) => 0.016 - t * 0.006, 20, 5, stemPaint('#6b5136', '#9a8460')).geometry);
  }
  return { leaves: leaves.build(), stems: stems.build() };
}

export function Monstera({ seed }: { seed: number }) {
  const v = variantOf(seed, 3);
  const g = useMemo(() => once(`monstera:${v}`, () => monsteraGeometry(v)), [v]);
  const mat = leafMaterial('monstera', { map: monsteraAtlas(), alphaTest: 0.5, roughness: 0.38 });
  return (
    <group>
      <Pot shape={MONSTERA_POT} seed={seed} />
      <mesh geometry={g.stems} material={vcMaterial('stem', { roughness: 0.6 })} castShadow />
      <mesh geometry={g.leaves} material={mat} castShadow receiveShadow />
    </group>
  );
}

// ---------- Boston fern ----------

const FERN_POT: PotShape = { r: 0.56, h: 0.92 };

function fernGeometry(variant: number) {
  const r = rng(variant * 31 + 3);
  const soilY = soilLevel(FERN_POT);
  const pinna = leafGeometry({
    len: 1,
    width: 0.3,
    nu: 1,
    nv: 3,
    outline: (v) => Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * v)), 0.55) * (1 - 0.3 * v),
    fold: 0.25,
    arch: 0.35,
    paint: leafPaint('#2c6427', '#7cba4c', { ribW: 0.25, edge: 0.08 }),
  });
  const fronds = new Merger();
  const stalks = new Merger();
  const N = 30 + variant * 4;
  const tint = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const az = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const inner = r();
    const L = 1.5 + r() * 1.0;
    const rise = 0.6 + inner * 0.75;
    const droop = 0.35 + (1 - inner) * 0.9;
    const P0 = V(out.x * 0.08, soilY, out.z * 0.08);
    const P1 = P0.clone().addScaledVector(out, L * 0.32 * Math.cos(rise)).addScaledVector(UP, L * 0.45 * Math.sin(rise));
    const P2 = P0.clone().addScaledVector(out, L * 0.66).addScaledVector(UP, L * (0.44 * Math.sin(rise) - 0.12 * droop));
    const P3 = P0.clone().addScaledVector(out, L * 0.9).addScaledVector(UP, L * (0.3 * Math.sin(rise) - 0.45 * droop));
    const curve = new THREE.CatmullRomCurve3([P0, P1, P2, P3]);
    stalks.add(tubeThrough(curve.getPoints(14), (t) => 0.014 * (1 - t * 0.7), 22, 4, stemPaint('#56703a', '#6f9a45')).geometry);
    const side = V(0, 0, 0).crossVectors(out, UP).normalize();
    // older outer fronds are darker and a touch yellower
    tint.setRGB(1, 1, 1).lerp(C('#a9b878'), (1 - inner) * 0.35 * r()).multiplyScalar(0.82 + r() * 0.3);
    const n = 26;
    for (let k = 0; k < n; k++) {
      const t = 0.07 + (k / n) * 0.91;
      const p = curve.getPointAt(t);
      const T = curve.getTangentAt(t);
      const Nf = V(0, 0, 0).crossVectors(side, T).normalize();
      const size = 0.28 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.6) * (1.05 - 0.55 * t) * (L / 2);
      for (const s of [-1, 1]) {
        const dir = side.clone().multiplyScalar(s).addScaledVector(T, 0.45).normalize();
        fronds.add(pinna, aim(p, dir, Nf, size), tint);
      }
    }
  }
  return { fronds: fronds.build(), stalks: stalks.build() };
}

export function BostonFern({ seed }: { seed: number }) {
  const v = variantOf(seed, 3);
  const g = useMemo(() => once(`fern:${v}`, () => fernGeometry(v)), [v]);
  return (
    <group>
      <Pot shape={FERN_POT} seed={seed + 2} />
      <mesh geometry={g.stalks} material={vcMaterial('stem', { roughness: 0.6 })} />
      <mesh geometry={g.fronds} material={leafMaterial('fern', { roughness: 0.6 })} castShadow receiveShadow />
    </group>
  );
}

// ---------- snake plant ----------

function snakeTexture(gold: boolean) {
  return canvasTexture(
    `gh-snake-${gold}`,
    128,
    512,
    (g, w, h) => {
      const r = rng(gold ? 7 : 8);
      g.fillStyle = '#243f27';
      g.fillRect(0, 0, w, h);
      // wavy pale cross-bands
      for (let y = 0; y < h; y += 7 + r() * 9) {
        g.strokeStyle = `rgba(${120 + r() * 30},${150 + r() * 30},${110 + r() * 20},${0.35 + r() * 0.35})`;
        g.lineWidth = 1.5 + r() * 3;
        g.beginPath();
        const ph = r() * 6;
        const amp = 2 + r() * 4;
        for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x * 0.08 + ph) * amp + Math.sin(x * 0.23 + ph * 2) * 1.5);
        g.stroke();
      }
      // dark flecks
      for (let i = 0; i < 160; i++) {
        g.fillStyle = 'rgba(14,30,16,0.35)';
        g.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 2);
      }
      if (gold) {
        for (const x0 of [0, w - 12]) {
          const m = g.createLinearGradient(x0, 0, x0 + 12, 0);
          m.addColorStop(x0 === 0 ? 0 : 1, 'rgba(214,206,104,1)');
          m.addColorStop(x0 === 0 ? 1 : 0, 'rgba(214,206,104,0.2)');
          g.fillStyle = m;
          g.fillRect(x0, 0, 12, h);
        }
      }
    },
    { wrap: false },
  );
}

function snakeGeometry(variant: number) {
  const r = rng(variant * 41 + 9);
  const m = new Merger();
  const n = 11 + variant * 3;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const inner = i % 3 === 0;
    const len = inner ? 2.6 + r() * 0.7 : 1.8 + r() * 0.85;
    const lean = inner ? 0.03 + r() * 0.08 : 0.1 + r() * 0.18;
    const dir = UP.clone().multiplyScalar(Math.cos(lean)).addScaledVector(out, Math.sin(lean)).normalize();
    const face = out.clone().applyAxisAngle(UP, (r() - 0.5) * 1.6);
    const leaf = leafGeometry({
      len,
      width: 0.34 + r() * 0.13,
      nu: 3,
      nv: 14,
      outline: (v) => (v < 0.12 ? 0.55 + v * 3.75 : 1) * Math.pow(Math.max(0, 1 - v), 0.5) * (1 + 0.15 * Math.sin(v * Math.PI)),
      fold: 0.32,
      twist: (r() - 0.5) * 0.9,
      arch: 0.08 + r() * 0.12,
    });
    const off = inner ? 0.04 + r() * 0.06 : 0.1 + r() * 0.12;
    m.add(leaf, aim(V(out.x * off, 0, out.z * off), dir, face), C('#ffffff').multiplyScalar(0.85 + r() * 0.3));
  }
  return m.build();
}

export function SnakePlant({ seed }: { seed: number }) {
  const v = variantOf(seed, 2);
  const glaze = GLAZES[variantOf(seed, GLAZES.length)];
  const pot = glazedPotGeometry(0.42, 0.78, glaze);
  const leaves = useMemo(() => once(`snake:${v}`, () => snakeGeometry(v)), [v]);
  const gold = v === 0;
  const mat = leafMaterial(`snake-${gold}`, { map: snakeTexture(gold), roughness: 0.42 });
  const soilY = 0.78 * 0.88 - 0.03;
  return (
    <group>
      <mesh geometry={pot} material={glazeMaterial()} castShadow receiveShadow />
      <mesh geometry={soilGeometry(0.36, 1)} material={soilMaterial()} position={[0, soilY, 0]} />
      <mesh geometry={leaves} material={mat} position={[0, soilY, 0]} castShadow receiveShadow />
    </group>
  );
}

// ---------- succulent bowl ----------

/** A plump echeveria leaf: a flattened, pointed spoon with a rounded belly, curling up at the tip. */
function plumpPetal() {
  return once('gh-petal', () => {
    const g = new THREE.SphereGeometry(0.5, 12, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const t = y + 0.5;
      const ring = Math.sqrt(Math.max(1e-6, 0.25 - y * y)) * 2;
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.96)), 0.5) * (0.45 + 0.65 * t) * (t > 0.82 ? 1 - (t - 0.82) * 2.6 : 1);
      const k = ring > 1e-3 ? prof / ring : 0;
      p.setXYZ(i, x * k * 0.5, t, z * k * 0.36 * (z > 0 ? 0.5 : 1) + 0.16 * t * t);
    }
    g.computeVertexNormals();
    return g;
  });
}

const ROSETTES: [string, string, string][] = [
  ['#9cb7a6', '#7d9f97', '#d98b98'],
  ['#b9c98a', '#8fae6c', '#c95a4a'],
  ['#a99ab4', '#8c8aa8', '#d7a0b6'],
  ['#9fc0b6', '#6f9a8e', '#e7c9a8'],
];

function rosette(m: Merger, at: THREE.Vector3, R: number, colors: [string, string, string], r: () => number) {
  const petal = plumpPetal();
  const [base, body, tip] = colors.map(C);
  const N = 22;
  const painted = paint(petal.clone(), (_x, y, _z, out) => {
    mix(out, base, body, smoothstep(0, 0.45, y));
    mix(out, out, tip, smoothstep(0.7, 1, y));
  });
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const a = i * 2.39996 + r() * 0.1;
    const out = V(Math.sin(a), 0, Math.cos(a));
    const size = R * (1.05 - 0.62 * f);
    const pitch = 0.18 + f * 1.15;
    const dir = out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch));
    const face = UP.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(out, -Math.sin(pitch));
    const p = at.clone().addScaledVector(out, R * 0.12 * (1 - f)).add(V(0, f * R * 0.3, 0));
    m.add(painted, aim(p, dir, face, V(size * 0.85, size, size * 0.85)), C('#ffffff').multiplyScalar(0.9 + r() * 0.2));
  }
}

function succulentGeometry(variant: number) {
  const r = rng(variant * 53 + 1);
  const plants = new Merger();
  const spots: [number, number, number][] = [
    [-0.22, 0.1, 0.32],
    [0.3, -0.06, 0.25],
    [0.06, 0.38, 0.18],
    [0.36, 0.33, 0.13],
    [-0.12, -0.36, 0.16],
  ];
  spots.forEach(([x, z, R], i) => rosette(plants, V(x, 0.3, z), R, ROSETTES[(i + variant) % ROSETTES.length], r));
  // gravel dressing: little stones of grey, cream and rust
  const gravel = new Merger();
  const stone = new THREE.IcosahedronGeometry(0.035, 1);
  const tones = ['#b9b2a6', '#8e8a84', '#d8cfc0', '#a07a5c', '#6f6a66'];
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.6;
    const s = 0.6 + r() * 0.8;
    gravel.add(stone, trs([Math.cos(a) * d, 0.27 + r() * 0.02, Math.sin(a) * d], [r() * 3, r() * 3, r() * 3], [s, s * 0.6, s]), C(tones[Math.floor(r() * tones.length)]));
  }
  const bowl = smoothLathe(
    [
      [0, 0],
      [0.42, 0],
      [0.47, 0.03],
      [0.62, 0.14],
      [0.73, 0.27],
      [0.77, 0.33],
      [0.75, 0.36],
      [0.7, 0.33],
      [0.64, 0.26],
      [0, 0.25],
    ],
    80,
    56,
  );
  return { plants: plants.build(), gravel: gravel.build(), bowl };
}

export function SucculentBowl({ seed }: { seed: number }) {
  const v = variantOf(seed, 4);
  const g = useMemo(() => once(`succulents:${v}`, () => succulentGeometry(v)), [v]);
  const glaze = ['#5d7d8c', '#d9d0bd', '#8a5a44', '#4e6b52'][v];
  const bowl = useMemo(
    () =>
      once(`succulent-bowl:${v}`, () => {
        const b = g.bowl.clone();
        const gc = C(glaze);
        return paint(b, (x, y, z, out) => {
          out.copy(gc).multiplyScalar(0.92 + 0.1 * noise3(x * 6, y * 6, z * 6));
          mix(out, out, C('#c49a72'), smoothstep(0.035, 0.0, y));
          mix(out, out, gc.clone().lerp(C('#ffffff'), 0.3), smoothstep(0.32, 0.36, y) * 0.6);
        });
      }),
    [g, v, glaze],
  );
  return (
    <group>
      <mesh geometry={bowl} material={glazeMaterial()} castShadow receiveShadow />
      <mesh geometry={g.gravel} material={vcMaterial('gravel', { roughness: 0.8 })} receiveShadow />
      <mesh geometry={g.plants} material={vcMaterial('succulent', { roughness: 0.62 })} castShadow receiveShadow />
    </group>
  );
}

// ---------- zonal geranium ----------

const GERANIUM_POT: PotShape = { r: 0.46, h: 0.78 };
const BLOOMS = ['#d8262f', '#f0644e', '#e0427c', '#f19582', '#f3ece4'];

function geraniumGeometry(variant: number, bloom: string) {
  const r = rng(variant * 71 + 5);
  const soilY = soilLevel(GERANIUM_POT);
  const leafA = C('#3f7a33');
  const leafB = C('#6aa04a');
  const zone = C('#4a3f22');
  const leaf = polarLeaf({
    R: 0.3,
    edge: (a) => {
      let d = a - Math.PI * 1.5;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return (1 + 0.05 * Math.cos(a * 11)) * (1 - 0.42 * Math.exp(-(d * d) / 0.02));
    },
    rings: 5,
    seg: 44,
    cup: 0.32,
    paint: (rho, a, out) => {
      mix(out, leafA, leafB, rho * 0.6);
      const band = smoothstep(0.38, 0.48, rho) * smoothstep(0.7, 0.6, rho);
      mix(out, out, zone, band * 0.55 * (0.8 + 0.2 * Math.sin(a * 5)));
      out.multiplyScalar(1 - 0.12 * smoothstep(0.8, 1, rho));
    },
  });
  const leaves = new Merger();
  const stems = new Merger();
  const flowers = new Merger();
  const n = 16 + variant * 2;
  for (let i = 0; i < n; i++) {
    const az = r() * Math.PI * 2;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const reach = 0.2 + r() * 0.45;
    const hgt = 0.25 + r() * 0.55;
    const P = V(out.x * reach, soilY + hgt, out.z * reach);
    stems.add(tubeThrough([V(out.x * 0.05, soilY, out.z * 0.05), V(out.x * reach * 0.4, soilY + hgt * 0.75, out.z * reach * 0.4), P], () => 0.012, 14, 4, stemPaint('#6e8a45', '#7fa055')).geometry);
    const tilt = 0.25 + r() * 0.5;
    const face = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt)).normalize();
    const dir = out.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(UP, -Math.sin(tilt)).normalize();
    leaves.add(leaf, aim(P, dir, face, 0.85 + r() * 0.45), C('#ffffff').multiplyScalar(0.85 + r() * 0.25));
  }
  // flower heads on long stalks above the leaves
  const floret = blossom(bloom, '#f5e6a0', 0.17);
  const bud = paint(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1.4, 1), (_x, _y, _z, out) => out.set(bloom).multiplyScalar(0.75));
  const heads = 3 + (variant % 2);
  for (let k = 0; k < heads; k++) {
    const az = (k / heads) * Math.PI * 2 + r() * 0.8;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const top = V(out.x * (0.15 + r() * 0.2), soilY + 1.05 + r() * 0.35, out.z * (0.15 + r() * 0.2));
    stems.add(tubeThrough([V(out.x * 0.04, soilY, out.z * 0.04), V(out.x * 0.08, soilY + 0.6, out.z * 0.08), top], () => 0.014, 18, 5, stemPaint('#5f7c3c', '#7a9a50')).geometry);
    const count = 13;
    for (let f = 0; f < count; f++) {
      // florets on short pedicels round a ball
      const a = f * 2.39996;
      const e = Math.acos(1 - (f / count) * 1.4);
      const d = V(Math.sin(e) * Math.sin(a), Math.cos(e), Math.sin(e) * Math.cos(a));
      const p = top.clone().addScaledVector(d, 0.16);
      flowers.add(f < 2 ? bud : floret, aim(p, d.clone().cross(V(0.3, 0.1, 1)).normalize(), d, 1), C('#ffffff').multiplyScalar(0.9 + r() * 0.15));
    }
  }
  return { leaves: leaves.build(), stems: stems.build(), flowers: flowers.build() };
}

export function Geranium({ seed }: { seed: number }) {
  const v = variantOf(seed, 3);
  const bloom = BLOOMS[variantOf(seed, BLOOMS.length)];
  const g = useMemo(() => once(`geranium:${v}:${bloom}`, () => geraniumGeometry(v, bloom)), [v, bloom]);
  return (
    <group>
      <Pot shape={GERANIUM_POT} seed={seed + 1} />
      <mesh geometry={g.stems} material={vcMaterial('stem', { roughness: 0.6 })} />
      <mesh geometry={g.leaves} material={leafMaterial('geranium', { roughness: 0.75 })} castShadow receiveShadow />
      <mesh geometry={g.flowers} material={leafMaterial('petals', { roughness: 0.6 })} castShadow />
    </group>
  );
}

// ---------- moth orchid ----------

const ORCHIDS: { petal: string; vein: string; lip: string }[] = [
  { petal: '#f7f1f3', vein: '#e3a6c3', lip: '#c2366e' },
  { petal: '#e989b6', vein: '#b9407d', lip: '#8e1f52' },
  { petal: '#f6e7a8', vein: '#d79a63', lip: '#b8402c' },
];

function orchidFlower(c: (typeof ORCHIDS)[number]) {
  const m = new Merger();
  const petal = C(c.petal);
  const vein = C(c.vein);
  const part = (len: number, width: number, cup: number, outline?: (v: number) => number) =>
    leafGeometry({
      len,
      width,
      nu: 3,
      nv: 5,
      cup,
      arch: -0.25,
      outline: outline ?? ((v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + v * 0.92)), 0.6)),
      paint: (u, v, out) => {
        out.copy(petal);
        mix(out, out, vein, smoothstep(0.35, 0.0, v) * 0.6 + (Math.abs(Math.sin(u * 9)) < 0.25 ? 0.12 : 0) * (1 - v));
      },
    });
  const sepal = part(0.2, 0.11, 0.15);
  const side = part(0.21, 0.24, 0.2, (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + v * 0.95)), 0.42));
  m.add(sepal, trs([0, 0, 0], [0, 0, 0]));
  m.add(sepal, trs([0, 0, -0.005], [0, 0, 2.4]));
  m.add(sepal, trs([0, 0, -0.005], [0, 0, -2.4]));
  m.add(side, trs([0, 0, 0.005], [0, 0, 1.25]));
  m.add(side, trs([0, 0, 0.005], [0, 0, -1.25]));
  const lip = leafGeometry({
    len: 0.12,
    width: 0.11,
    nu: 3,
    nv: 4,
    cup: 0.5,
    paint: (u, v, out) => mix(out, C('#f2c64a'), C(c.lip), smoothstep(0.1, 0.6, v) * (1 - Math.abs(u) * 0.3)),
  });
  m.add(lip, trs([0, -0.02, 0.03], [0.5, 0, Math.PI]));
  m.add(paint(new THREE.SphereGeometry(0.022, 8, 6).scale(1, 1.4, 1), (_x, _y, _z, out) => out.set('#fbf6ee')), trs([0, 0.02, 0.03]));
  return m.build();
}

function orchidGeometry(variant: number, colors: (typeof ORCHIDS)[number]) {
  const r = rng(variant * 19 + 7);
  const soilY = 0.6 * 0.88 - 0.04;
  const leaves = new Merger();
  const stems = new Merger();
  const flowers = new Merger();
  // broad leathery leaves, alternating left and right
  const leaf = (len: number) =>
    leafGeometry({
      len,
      width: len * 0.36,
      nu: 4,
      nv: 9,
      outline: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + v * 0.86)), 0.45),
      fold: 0.18,
      arch: 0.9,
      paint: leafPaint('#2d5a2a', '#4f8a3c', { ribW: 0.1, edge: 0.12 }),
    });
  const nl = 4 + (variant % 2);
  for (let i = 0; i < nl; i++) {
    const az = (i % 2 ? Math.PI : 0) + (r() - 0.5) * 0.7 + Math.PI / 2 + i * 0.25;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const pitch = 0.75 - i * 0.08;
    const dir = out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch));
    const face = UP.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(out, -Math.sin(pitch));
    leaves.add(leaf(0.85 + r() * 0.35), aim(V(0, soilY + 0.04 + i * 0.03, 0), dir, face), C('#ffffff').multiplyScalar(0.9 + r() * 0.2));
  }
  // silvery aerial roots wandering over the rim
  for (let k = 0; k < 3; k++) {
    const a = r() * Math.PI * 2;
    const o = V(Math.sin(a), 0, Math.cos(a));
    stems.add(tubeThrough([V(o.x * 0.05, soilY + 0.05, o.z * 0.05), V(o.x * 0.3, soilY + 0.12, o.z * 0.3), V(o.x * 0.44, soilY - 0.05, o.z * 0.44), V(o.x * 0.5, soilY - 0.3, o.z * 0.5)], (t) => 0.024 - t * 0.008, 20, 6, stemPaint('#b9c7b0', '#8faa82')).geometry);
  }
  // the flower spike, tied to a cane, arching forward at the top
  const spike = [V(0.02, soilY, 0.02), V(0.06, soilY + 0.9, 0.0), V(0.08, soilY + 1.7, 0.02), V(0.12, soilY + 2.15, 0.25), V(0.18, soilY + 2.2, 0.62), V(0.24, soilY + 2.05, 0.92)];
  const curve = new THREE.CatmullRomCurve3(spike);
  stems.add(tubeThrough(curve.getPoints(30), (t) => 0.018 - t * 0.007, 60, 6, stemPaint('#476a35', '#5e7f43')).geometry);
  stems.add(paint(new THREE.CylinderGeometry(0.014, 0.016, 1.9, 6).translate(0.11, soilY + 0.9, -0.03), (_x, y, _z, out) => mix(out, C('#c9a96e'), C('#a8834e'), (y % 0.3) / 0.3)));
  stems.add(paint(new THREE.TorusGeometry(0.035, 0.012, 6, 12).rotateX(Math.PI / 2).translate(0.09, soilY + 1.55, -0.01), (_x, _y, _z, out) => out.set('#2f6a3a')));
  const flower = orchidFlower(colors);
  const nf = 6 + variant;
  for (let i = 0; i < nf; i++) {
    const t = 0.56 + (i / nf) * 0.42;
    const p = curve.getPointAt(Math.min(0.99, t));
    const side = i % 2 ? 1 : -1;
    const face = V(side * 0.35, -0.05, 1).normalize();
    const hang = V(0, -0.11, 0);
    const scale = i > nf - 3 ? 0.65 + (nf - i) * 0.1 : 1;
    if (i === nf - 1) {
      flowers.add(paint(new THREE.SphereGeometry(0.05, 10, 8).scale(1, 0.8, 1.3), (_x, _y, _z, out) => out.set(colors.petal).lerp(C('#9fbf7a'), 0.5)), trs(p.clone().add(V(0, -0.06, 0.02))));
      continue;
    }
    flowers.add(flower, aim(p.clone().add(hang).addScaledVector(face, 0.05), V(0, 1, 0).addScaledVector(face, -0.15), face, scale));
  }
  return { leaves: leaves.build(), stems: stems.build(), flowers: flowers.build() };
}

export function Orchid({ seed }: { seed: number }) {
  const v = variantOf(seed, 2);
  const colors = ORCHIDS[variantOf(seed, ORCHIDS.length)];
  const g = useMemo(() => once(`orchid:${v}:${colors.petal}`, () => orchidGeometry(v, colors)), [v, colors]);
  const glaze = ['#f1ece2', '#9fb7b0', '#2c4a6c', '#3a3d3a'][variantOf(seed + 1, 4)];
  const pot = glazedPotGeometry(0.36, 0.6, glaze);
  const bark = useMemo(
    () =>
      once('orchid-bark', () => {
        const r = rng(3);
        const m = new Merger();
        const chip = new THREE.BoxGeometry(0.09, 0.03, 0.06);
        for (let i = 0; i < 70; i++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * 0.28;
          m.add(chip, trs([Math.cos(a) * d, 0.6 * 0.88 - 0.05 + r() * 0.03, Math.sin(a) * d], [r() * 0.6, r() * 3, r() * 0.6], 0.7 + r() * 0.6), C(r() < 0.5 ? '#7a5034' : '#5a3a26'));
        }
        return m.build();
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={pot} material={glazeMaterial()} castShadow receiveShadow />
      <mesh geometry={bark} material={vcMaterial('bark', { roughness: 0.9 })} />
      <mesh geometry={g.stems} material={vcMaterial('stem', { roughness: 0.6 })} castShadow />
      <mesh geometry={g.leaves} material={leafMaterial('orchid-leaf', { roughness: 0.32 })} castShadow receiveShadow />
      <mesh geometry={g.flowers} material={leafMaterial('petals', { roughness: 0.6 })} castShadow />
    </group>
  );
}

// ---------- lemon tree ----------

const CITRUS_POT: PotShape = { r: 0.6, h: 1.0 };

function lemonGeometry() {
  return once('gh-lemon', () =>
    smoothLathe(
      [
        [0, -0.17],
        [0.03, -0.165],
        [0.05, -0.145],
        [0.1, -0.11],
        [0.13, -0.04],
        [0.135, 0.03],
        [0.12, 0.09],
        [0.08, 0.135],
        [0.04, 0.155],
        [0.025, 0.175],
        [0, 0.18],
      ],
      30,
      20,
    ),
  );
}

function citrusGeometry(variant: number) {
  const r = rng(variant * 23 + 11);
  const soilY = soilLevel(CITRUS_POT);
  const bark = new Merger();
  const leaves = new Merger();
  const fruit = new Merger();
  const barkPaint = (t: number, _a: number, out: THREE.Color) => mix(out, C('#5e4a38'), C('#7a6650'), t * 0.6 + 0.2 * Math.sin(t * 30));
  // a trunk forking into a rounded crown
  const trunkTop = V(0.05, soilY + 1.6, 0.02);
  bark.add(tubeThrough([V(0, soilY - 0.05, 0), V(0.04, soilY + 0.6, -0.02), V(-0.02, soilY + 1.1, 0.03), trunkTop], (t) => 0.075 - t * 0.03, 24, 8, barkPaint).geometry);
  const crownC = V(0, soilY + 2.35, 0);
  const tips: THREE.Vector3[] = [];
  const nb = 6;
  for (let b = 0; b < nb; b++) {
    const az = (b / nb) * Math.PI * 2 + r() * 0.5;
    const out = V(Math.sin(az), 0, Math.cos(az));
    const end = crownC.clone().addScaledVector(out, 0.65 + r() * 0.3).add(V(0, (r() - 0.3) * 0.7, 0));
    const mid = trunkTop.clone().lerp(end, 0.5).add(V(0, 0.15, 0));
    bark.add(tubeThrough([trunkTop, mid, end], (t) => 0.045 - t * 0.03, 16, 6, barkPaint).geometry);
    tips.push(end);
    for (let s = 0; s < 2; s++) {
      const e2 = end.clone().add(V((r() - 0.5) * 0.7, (r() - 0.2) * 0.5, (r() - 0.5) * 0.7));
      bark.add(tubeThrough([mid, end.clone().lerp(mid, 0.4), e2], (t) => 0.025 - t * 0.015, 12, 5, barkPaint).geometry);
      tips.push(e2);
    }
  }
  // glossy leaves clustered round the crown, densest toward the outside
  const leaf = leafGeometry({ len: 0.34, width: 0.15, nu: 2, nv: 5, fold: 0.22, arch: 0.35, paint: leafPaint('#24501f', '#3f7a2e', { ribW: 0.12, edge: 0.1 }) });
  const petiole = paint(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4).translate(0, -0.03, 0), (_x, _y, _z, out) => out.set('#4c6a2a'));
  for (let i = 0; i < 300; i++) {
    const d = V(r() - 0.5, r() - 0.4, r() - 0.5).normalize();
    const rad = 0.55 + Math.pow(r(), 0.5) * 0.6;
    const p = crownC.clone().add(V(d.x * rad * 1.1, d.y * rad * 0.85, d.z * rad * 1.1));
    const dir = d.clone().add(V((r() - 0.5) * 0.9, 0.35 + r() * 0.3, (r() - 0.5) * 0.9)).normalize();
    const face = UP.clone().addScaledVector(d, 0.6).normalize();
    leaves.add(leaf, aim(p, dir, face, 0.8 + r() * 0.45), C('#ffffff').multiplyScalar(0.75 + r() * 0.4).lerp(C('#b8d070'), r() < 0.12 ? 0.4 : 0));
    if (i % 4 === 0) leaves.add(petiole, aim(p, dir, face));
  }
  // lemons hanging under the outer leaves, a few still green
  const lemon = lemonGeometry();
  const ripe = C('#f0cf3a');
  const green = C('#a9b844');
  const nfruit = 8 + variant * 2;
  for (let i = 0; i < nfruit; i++) {
    const a = (i / nfruit) * Math.PI * 2 + r() * 0.6;
    const p = crownC.clone().add(V(Math.sin(a) * (0.75 + r() * 0.35), -0.35 - r() * 0.45, Math.cos(a) * (0.75 + r() * 0.35)));
    const col = ripe.clone().lerp(green, r() < 0.25 ? 0.85 : r() * 0.15);
    const lemonPainted = paint(lemon.clone(), (x, y, z, out) => {
      out.copy(col).multiplyScalar(0.92 + 0.1 * noise3(x * 40, y * 40, z * 40));
      if (y > 0.15) out.lerp(C('#7a8a3a'), 0.6);
    });
    fruit.add(lemonPainted, trs(p, [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5 + Math.PI]));
  }
  // and a few white blossoms
  const flower = blossom('#fbf7ee', '#e9d27a', 0.13);
  for (let i = 0; i < 9; i++) {
    const d = V(r() - 0.5, r() * 0.6, r() - 0.5).normalize();
    const p = crownC.clone().add(V(d.x * 1.05, d.y * 0.9, d.z * 1.05));
    leaves.add(flower, aim(p, V(0, 1, 0).cross(d).normalize().add(V(0.01, 0, 0)), d));
  }
  return { bark: bark.build(), leaves: leaves.build(), fruit: fruit.build() };
}

export function LemonTree({ seed }: { seed: number }) {
  const v = variantOf(seed, 2);
  const g = useMemo(() => once(`citrus:${v}`, () => citrusGeometry(v)), [v]);
  const peel = useMemo(() => once('mat:peel', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, bumpMap: repeated(speckleTexture(), 3, 3, 'peel-bump'), bumpScale: 1.6 })), []);
  return (
    <group>
      <Pot shape={CITRUS_POT} seed={seed + 3} />
      <mesh geometry={g.bark} material={vcMaterial('bark', { roughness: 0.9 })} castShadow />
      <mesh geometry={g.leaves} material={leafMaterial('citrus', { roughness: 0.3 })} castShadow receiveShadow />
      <mesh geometry={g.fruit} material={peel} castShadow />
    </group>
  );
}

// ---------- hanging planter (wall) ----------

/** Ivy: five pointed lobes on a polar grid, cream at the margins on variegated plants. */
function ivyLeaf(variegated: boolean) {
  return once(`ivy:${variegated}`, () =>
    polarLeaf({
      R: 0.12,
      edge: (a) => {
        const lobes = Math.pow(Math.abs(Math.cos((a - Math.PI / 2) * 2.5)), 3);
        let d = a - Math.PI * 1.5;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        return (0.62 + 0.45 * lobes) * (1 - 0.35 * Math.exp(-(d * d) / 0.05));
      },
      rings: 4,
      seg: 40,
      cup: -0.12,
      paint: (rho, a, out) => {
        mix(out, C('#24461f'), C('#3b6a2c'), rho);
        if (Math.abs(Math.sin(a * 2.5)) < 0.12 && rho < 0.8) mix(out, out, C('#a9c58c'), 0.4);
        if (variegated) mix(out, out, C('#e7e2c2'), smoothstep(0.62, 0.85, rho + 0.15 * Math.sin(a * 7)));
      },
    }),
  );
}

function hangingGeometry(variant: number) {
  const r = rng(variant * 61 + 2);
  const iron = new Merger();
  const basket = new Merger();
  const leaves = new Merger();
  const vines = new Merger();
  // a forged wall bracket: back plate, arm, scrolled brace and a hook at the end
  iron.add(new THREE.BoxGeometry(0.14, 0.62, 0.05), trs([0, -0.2, 0.025]));
  iron.add(new THREE.BoxGeometry(0.06, 0.06, 1.0), trs([0, 0, 0.5]));
  const brace: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    brace.push(V(0, -0.46 + t * 0.43 + Math.sin(t * Math.PI) * 0.1, 0.05 + t * 0.7 - Math.sin(t * Math.PI) * 0.12));
  }
  iron.add(tubeThrough(brace, () => 0.024, 30, 6).geometry);
  const curl: THREE.Vector3[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 1.7;
    const rr = 0.14 * (1 - i / 26);
    curl.push(V(0, -0.25 + Math.sin(a) * rr, 0.36 - Math.cos(a) * rr));
  }
  iron.add(tubeThrough(curl, () => 0.02, 30, 6).geometry);
  iron.add(new THREE.TorusGeometry(0.06, 0.016, 6, 16), trs([0, -0.07, 0.94], [0, Math.PI / 2, 0]));
  // three chains from the hook to the basket rim
  const link = new THREE.TorusGeometry(0.032, 0.008, 5, 10).scale(1, 1.5, 1);
  const hook = V(0, -0.13, 0.94);
  const rimY = -1.25;
  const rimR = 0.5;
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI * 2 + 0.5;
    const end = V(Math.cos(a) * rimR * 0.96, rimY + 0.04, 0.94 + Math.sin(a) * rimR * 0.96);
    const steps = 14;
    for (let k = 0; k < steps; k++) {
      const p = hook.clone().lerp(end, (k + 0.5) / steps);
      iron.add(link, aim(p, end.clone().sub(hook), V(k % 2 ? 1 : 0, 0, k % 2 ? 0 : 1)));
    }
  }
  // the wire basket: hoops and ribs round a coir liner
  const centre = V(0, rimY, 0.94);
  const bowl = (a: number, rr = rimR) => V(Math.sin(a) * rr, -Math.cos(a) * rr * 0.9, 0);
  for (const e of [0.9, 1.25, 1.5707]) {
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const p = bowl(e, rimR + 0.02);
      ring.push(centre.clone().add(V(Math.cos(t) * p.x, p.y, Math.sin(t) * p.x)));
    }
    iron.add(tubeThrough(ring, () => 0.011, 60, 4).geometry);
  }
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    const rib: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const p = bowl((i / 10) * (Math.PI / 2), rimR + 0.025);
      rib.push(centre.clone().add(V(Math.cos(t) * p.x, p.y, Math.sin(t) * p.x)));
    }
    iron.add(tubeThrough(rib, () => 0.01, 16, 4).geometry);
  }
  const liner = smoothLathe(
    [
      [0, -rimR * 0.9],
      [rimR * 0.5, -rimR * 0.78],
      [rimR * 0.85, -rimR * 0.45],
      [rimR, -0.02],
      [rimR * 1.02, 0.03],
      [rimR * 0.92, 0.0],
      [0, -0.05],
    ],
    40,
    32,
  );
  basket.add(
    paint(liner, (x, y, z, out) => {
      mix(out, C('#5b4128'), C('#8b6b45'), smoothstep(-0.5, 0.5, noise3(x * 25, y * 25, z * 25)));
      mix(out, out, C('#56702e'), smoothstep(0.2, 0.6, fbm3(x * 5, y * 5, z * 5)) * 0.65);
    }),
    trs(centre),
  );
  // trailing plants: variegated ivy, or string of pearls
  const pearls = variant === 1;
  const pearl = paint(new THREE.SphereGeometry(0.035, 8, 6), (x, y, _z, out) => mix(out, C('#5f9a48'), C('#9ccf72'), smoothstep(-0.03, 0.03, y + x * 0.3)));
  const ivy = ivyLeaf(variant === 0);
  const nv = 9;
  for (let k = 0; k < nv; k++) {
    const a = (k / nv) * Math.PI * 2 + r() * 0.4;
    const o = V(Math.cos(a), 0, Math.sin(a));
    const start = centre.clone().addScaledVector(o, rimR * 0.6).add(V(0, 0.02, 0));
    const over = centre.clone().addScaledVector(o, rimR * 1.08).add(V(0, 0.04, 0));
    const drop = 0.7 + r() * 1.3;
    const pts = [start, over, over.clone().addScaledVector(o, 0.12).add(V(0, -0.3, 0)), over.clone().addScaledVector(o, 0.16 + r() * 0.1).add(V((r() - 0.5) * 0.2, -drop, (r() - 0.5) * 0.2))];
    const curve = new THREE.CatmullRomCurve3(pts);
    vines.add(tubeThrough(curve.getPoints(16), () => 0.008, 24, 4, stemPaint('#5a6e32', '#6f8640')).geometry);
    const nl = Math.round(drop * (pearls ? 16 : 7));
    for (let i = 0; i < nl; i++) {
      const t = 0.1 + (i / nl) * 0.9;
      const p = curve.getPointAt(t);
      if (pearls) {
        leaves.add(pearl, trs(p.clone().add(V((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.05)), [0, 0, 0], 0.8 + r() * 0.4));
      } else {
        const dir = o.clone().add(V((r() - 0.5) * 0.8, -0.4, (r() - 0.5) * 0.8)).normalize();
        leaves.add(ivy, aim(p, dir, o.clone().add(V(0, 0.4, 0)).normalize().add(V(0, 0, 0.4)).normalize(), 0.75 + r() * 0.5), C('#ffffff').multiplyScalar(0.85 + r() * 0.3));
      }
    }
  }
  // a crown of leaves on top
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * rimR * 0.85;
    const p = centre.clone().add(V(Math.cos(a) * d, 0.05 + r() * 0.12, Math.sin(a) * d));
    if (pearls) leaves.add(pearl, trs(p, [0, 0, 0], 0.9 + r() * 0.3));
    else leaves.add(ivy, aim(p, V(Math.cos(a), 0.6, Math.sin(a)).normalize(), V(0, 1, 0.3).normalize(), 0.8 + r() * 0.4));
  }
  const soil = soilGeometry(rimR * 0.9, 2).clone().translate(centre.x, centre.y - 0.02, centre.z);
  return { iron: iron.build(), basket: basket.build(), leaves: leaves.build(), vines: vines.build(), soil };
}

/** A wire basket of trailing ivy (or string of pearls) hung from a forged bracket. Origin: where the bracket meets the wall. */
export function HangingPlanter({ seed }: { seed: number }) {
  const v = variantOf(seed, 3);
  const g = useMemo(() => once(`hanging:${v}`, () => hangingGeometry(v)), [v]);
  const iron = useMemo(() => once('mat:iron', () => new THREE.MeshStandardMaterial({ color: '#1f201e', roughness: 0.5, metalness: 0.6 })), []);
  return (
    <group>
      <mesh geometry={g.iron} material={iron} castShadow />
      <mesh geometry={g.basket} material={vcMaterial('coir', { roughness: 0.95 })} castShadow receiveShadow />
      <mesh geometry={g.soil} material={soilMaterial()} />
      <mesh geometry={g.vines} material={vcMaterial('stem', { roughness: 0.6 })} />
      <mesh geometry={g.leaves} material={leafMaterial(v === 1 ? 'pearls' : 'ivy', { roughness: v === 1 ? 0.3 : 0.45 })} castShadow />
    </group>
  );
}
