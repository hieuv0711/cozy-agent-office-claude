import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { COUNTER, PASS, PASS_LAMPS } from '../kitchen/plan';
import { BAR_STOOLS, CEIL, FACE_Z, LEDGE, PASS_FACE_Z, ROOM } from './ramen-dims';
import { brushedRough, brushedTex, C, fbm3, mat, Merger, mix, noise3, once, paint, paintFlat, paintLathe, plank, rand, repeated, smoothLathe, smoothstep, trs, V, woodTex } from './ramen-kit';
import { bowlStackGeometry, propMats } from './ramen-props';

// The front counter the cooks work at, seen from the customers' side: a pale
// hinoki worktop, a raised polished bar top (the ledge) with bar stools in
// front, a slatted front on a dark frame with a brass foot rail; and at its
// right end the pass, a stainless shelf under two hanging lamps where the
// finished bowls wait with a service bell.

export function counterMats() {
  return {
    worktop: mat('c:worktop', () => new THREE.MeshStandardMaterial({ map: woodTex('hinoki', { w: 1024, h: 512, light: '#e2c294', dark: '#a67a4c', planks: 4, rings: 5, seed: 61, joints: false, seams: 0.35 }), roughness: 0.55, vertexColors: true })),
    ledge: mat('c:ledge', () => new THREE.MeshPhysicalMaterial({ map: woodTex('keyaki', { w: 1024, h: 256, light: '#b8743e', dark: '#4a220e', planks: 1, rings: 11, seed: 19, joints: false, seams: 0 }), roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22, vertexColors: true })),
    front: mat('c:front', () => new THREE.MeshStandardMaterial({ map: woodTex('front', { w: 512, h: 512, light: '#7a4a2a', dark: '#2a160a', planks: 1, rings: 8, seed: 23, joints: false, seams: 0, figure: 0.25, warp: 0.6 }), roughness: 0.5, vertexColors: true })),
    backing: mat('c:backing', () => new THREE.MeshStandardMaterial({ color: '#140c08', roughness: 0.9 })),
    steel: mat('c:steel', () => new THREE.MeshStandardMaterial({ map: repeated(brushedTex(), 1, 1, 'pass-steel'), roughnessMap: brushedRough(), color: '#d6d9de', metalness: 0.78, roughness: 0.4, vertexColors: true })),
    brass: mat('c:brass', () => new THREE.MeshStandardMaterial({ color: '#c6964a', metalness: 0.9, roughness: 0.32 })),
    vinyl: mat('c:vinyl', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9a8a') })),
    chrome: mat('c:chrome', () => new THREE.MeshStandardMaterial({ color: '#dfe2e6', metalness: 1, roughness: 0.16 })),
    iron: mat('c:iron', () => new THREE.MeshStandardMaterial({ color: '#221e1b', metalness: 0.5, roughness: 0.55 })),
    enamel: mat('c:enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide })),
    cord: mat('c:cord', () => new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.75 })),
  };
}
type CMats = ReturnType<typeof counterMats>;

/**
 * The bulbs in the two pass lamps: dim when nobody waits. Raise its
 * emissiveIntensity (it is shared by both bulbs) when a cook waits at the pass.
 */
/** The two pass lamps' bulbs, one material each: dim until someone waits under that lamp (the cooks' code turns it up). */
export const PASS_BULBS = [0, 1].map((i) => mat(`pass-bulb-${i}`, () => new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffc770', emissiveIntensity: 0.35, roughness: 0.3 })));

const X0 = LEDGE.x0;
const X1 = LEDGE.x1;
/** Stiles on the counter front: at the ends and between the stools' bays. */
const STILES = [X0 + 0.07, -4.8, -2.4, 0, 2.4, 4.8, X1 - 0.07];

// ---------- the counter ----------

function worktopGeometry() {
  const w = COUNTER.x1 - COUNTER.x0 + 0.04;
  const d = COUNTER.front - COUNTER.back;
  const g = plank(w, 0.075, d, 0.012, [1 / 3.2, 1 / 1.6], 3, [0.2, 0.1]);
  // knife scars, darker damp near the back edge, a paler scrubbed middle
  return paint(g, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    const n = fbm3(x * 1.4, 2.2, z * 3);
    out.multiplyScalar(0.92 + 0.1 * n);
    mix(out, out, C('#8a6a48'), smoothstep(-0.2, -0.75, z) * 0.18);
    out.multiplyScalar(1 - smoothstep(0.6, 0.9, noise3(x * 9, 1.5, z * 9) * 0.5 + 0.5) * 0.08);
  });
}

function ledgeGeometry() {
  // a thick bar top with a rounded nose, laid on a riser at its back edge
  const w = X1 - X0;
  const d = LEDGE.front - LEDGE.back;
  const m = new Merger();
  const top = plank(w, LEDGE.thick, d, 0.04, [1 / 4.5, 1 / 1.2], 4, [0.3, 0.2]);
  paint(top, (x, _y, z, out) => {
    // the customers' side is worn paler where elbows and bowls rest
    out.setRGB(1, 1, 1).multiplyScalar(0.92 + 0.12 * fbm3(x * 0.8, 3.3, z * 2));
    out.multiplyScalar(1 + smoothstep(0.0, 0.25, z) * 0.06);
  });
  m.add(top, trs([(X0 + X1) / 2, LEDGE.top - LEDGE.thick / 2, (LEDGE.back + LEDGE.front) / 2]));
  // the riser under the back edge, seen from the kitchen side
  const riser = plank(w - 0.08, LEDGE.top - LEDGE.thick - COUNTER.top + 0.02, 0.07, 0.01, [1 / 4.5, 1 / 1.2]);
  paint(riser, (_x, _y, _z, out) => out.setScalar(0.7));
  m.add(riser, trs([(X0 + X1) / 2, (LEDGE.top - LEDGE.thick + COUNTER.top) / 2, LEDGE.back + 0.04]));
  return m.build();
}

/** The counter front: a dark frame of stiles and rails, close vertical slats in each bay, a kick plate. */
function frontGeometry() {
  const frame = new Merger();
  const r = rand(17);
  const yTop = LEDGE.top - LEDGE.thick;
  const yBot = 0.13;
  const tint = new THREE.Color();
  const tone = (k = 0.12) => tint.setRGB(1, 1, 1).multiplyScalar(1 - k + r() * k * 2).clone();
  // stiles (full height), top and bottom rails
  for (const x of STILES) frame.add(plank(0.15, yTop - yBot, 0.1, 0.02, [1 / 1.5, 1 / 1.5], 2, [r() * 3, r() * 3], true), trs([x, (yTop + yBot) / 2, FACE_Z]), tone());
  frame.add(plank(X1 - X0, 0.11, 0.1, 0.02, [1 / 2.5, 1 / 2.5], 2, [r() * 3, 0]), trs([(X0 + X1) / 2, yTop - 0.055, FACE_Z + 0.005]), tone(0.05));
  frame.add(plank(X1 - X0, 0.12, 0.1, 0.02, [1 / 2.5, 1 / 2.5], 2, [r() * 3, 0]), trs([(X0 + X1) / 2, yBot + 0.06, FACE_Z + 0.005]), tone(0.05));
  // a thin bead under the top rail
  frame.add(plank(X1 - X0 - 0.1, 0.03, 0.04, 0.012, [1 / 2.5, 1 / 2.5]), trs([(X0 + X1) / 2, yTop - 0.125, FACE_Z + 0.04]), tone(0.05));
  // the slats
  const slats = new Merger();
  for (let b = 0; b < STILES.length - 1; b++) {
    const a = STILES[b] + 0.075;
    const c = STILES[b + 1] - 0.075;
    const sw = 0.078;
    const gap = 0.048;
    const n = Math.floor((c - a + gap) / (sw + gap));
    const used = n * sw + (n - 1) * gap;
    const start = a + (c - a - used) / 2 + sw / 2;
    for (let i = 0; i < n; i++) {
      const g = plank(sw, yTop - 0.11 - (yBot + 0.12), 0.045, 0.012, [1 / 1.2, 1 / 1.2], 1, [r() * 4, r() * 4], true);
      // scuffs low down where knees and shoes knock
      paint(g, (_x, y, _z, out) => out.setScalar(1 - smoothstep(-0.15, -0.35, y) * 0.12));
      slats.add(g, trs([start + i * (sw + gap), (yTop - 0.11 + yBot + 0.12) / 2, FACE_Z - 0.01]), tone(0.1));
    }
  }
  // the ends of the counter: a framed panel each side
  for (const s of [-1, 1]) {
    const x = s < 0 ? X0 : X1;
    const d = FACE_Z - COUNTER.back;
    frame.add(plank(0.08, yTop - 0.02, d, 0.02, [1 / 1.5, 1 / 1.5], 2, [r(), r()], true), trs([x - s * 0.04, (yTop - 0.02) / 2 + 0.01, (FACE_Z + COUNTER.back) / 2]), tone());
  }
  return { frame: frame.build(), slats: slats.build() };
}

function footRailGeometry() {
  const y = 0.3;
  const z = FACE_Z + 0.2;
  const m = new Merger();
  m.add(tubeThrough([V(X0 + 0.25, y, z), V(X1 - 0.25, y, z)], () => 0.028, 4, 16).geometry);
  // rounded returns into the counter at both ends
  for (const s of [-1, 1]) {
    const x = s < 0 ? X0 + 0.25 : X1 - 0.25;
    m.add(tubeThrough([V(x, y, z), V(x - s * 0.06, y, z - 0.03), V(x - s * 0.1, y, z - 0.12), V(x - s * 0.1, y, FACE_Z + 0.04)], () => 0.028, 16, 16).geometry);
  }
  for (const x of STILES.slice(1, -1)) {
    m.add(tubeThrough([V(x, y, FACE_Z + 0.04), V(x, y, z)], () => 0.018, 2, 10).geometry);
    m.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20).rotateX(Math.PI / 2), trs([x, y, FACE_Z + 0.055]));
  }
  return m.build();
}

function kickGeometry() {
  return new Merger().add(plank(X1 - X0 - 0.1, 0.13, 0.06, 0.01), trs([(X0 + X1) / 2, 0.065, FACE_Z - 0.08])).add(plank(X1 - X0 - 0.2, 0.86, 0.04), trs([(X0 + X1) / 2, 0.55, FACE_Z - 0.09])).add(plank(X1 - X0, 0.84, 0.05), trs([(X0 + X1) / 2, 0.44, COUNTER.back + 0.025])).build();
}

// ---------- bar stools ----------

/** A diner stool: cast base, chrome column and foot ring, a red vinyl cushion with piping. Parts by material. */
export function stoolGeometries() {
  return once('ramen:stool', () => {
    const base = smoothLathe(
      [
        [0, 0],
        [0.27, 0],
        [0.285, 0.012],
        [0.27, 0.032],
        [0.16, 0.05],
        [0.08, 0.075],
        [0.06, 0.1],
        [0, 0.1],
      ],
      30,
      40,
    );
    const chrome = new Merger();
    chrome.add(new THREE.CylinderGeometry(0.042, 0.048, 0.6, 20, 1, true), trs([0, 0.38, 0]));
    chrome.add(new THREE.TorusGeometry(0.2, 0.017, 10, 48), trs([0, 0.3, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      chrome.add(tubeThrough([V(0, 0.3, 0), V(Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2)], () => 0.012, 2, 8).geometry);
    }
    // the seat pan under the cushion
    chrome.add(
      smoothLathe(
        [
          [0, 0.66],
          [0.06, 0.66],
          [0.2, 0.69],
          [0.27, 0.7],
          [0.27, 0.715],
          [0, 0.715],
        ],
        20,
        40,
      ),
    );
    const n = 50;
    const cushion = smoothLathe(
      [
        [0, 0.71],
        [0.27, 0.71],
        [0.3, 0.725],
        [0.305, 0.76],
        [0.29, 0.805],
        [0.24, 0.825],
        [0.12, 0.832],
        [0.03, 0.826],
        [0, 0.824],
      ],
      n,
      48,
    );
    const red = C('#a8261e');
    paintLathe(cushion, n, (x, y, z, _a, out) => {
      out.copy(red);
      // creases where the vinyl is pulled round, a little shine worn on top
      out.multiplyScalar(0.9 + 0.12 * noise3(x * 30, y * 30, z * 30));
      if (y > 0.82) out.multiplyScalar(1.08);
    });
    const piping = new THREE.TorusGeometry(0.302, 0.012, 8, 64).rotateX(Math.PI / 2).translate(0, 0.77, 0);
    paintFlat(piping, '#7e1a14');
    const cushionAll = new Merger().add(cushion).add(piping).build();
    return { base, chrome: chrome.build(), cushion: cushionAll };
  });
}

/** Tint a stool cushion (vertex colours are red; a material colour shifts it). */
export const STOOL_COLOURS = ['#ffffff', '#5a8ad0', '#3c3c3c', '#7fa860'];

function BarStools({ m }: { m: CMats }) {
  const geo = stoolGeometries();
  const n = BAR_STOOLS.length;
  const refs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  useLayoutEffect(() => {
    const mtx = new THREE.Matrix4();
    BAR_STOOLS.forEach((s, i) => {
      mtx.compose(V(s.x + (i % 2 ? 0.04 : -0.03), 0, s.z - (i % 3) * 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 0.7, 0)), V(1, 1, 1));
      for (const r of refs) r.current?.setMatrixAt(i, mtx);
    });
    for (const r of refs) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  });
  return (
    <group>
      <instancedMesh ref={refs[0]} args={[geo.base, m.iron, n]} castShadow receiveShadow />
      <instancedMesh ref={refs[1]} args={[geo.chrome, m.chrome, n]} castShadow />
      <instancedMesh ref={refs[2]} args={[geo.cushion, m.vinyl, n]} castShadow receiveShadow />
    </group>
  );
}

// ---------- the pass ----------

const PX0 = COUNTER.x1 + 0.12; // where the pass's body starts (the ledge's end)
const PX1 = ROOM.x1;

function passBodyGeometry() {
  const frame = new Merger();
  const r = rand(29);
  const h = PASS.top - 0.05;
  const d = PASS_FACE_Z - COUNTER.back;
  // the carcass front: two sliding doors with sunk panels and finger pulls, between stiles
  const doorW = (PASS.x1 - PX0 - 0.3) / 2;
  for (let i = 0; i < 2; i++) {
    const cx = PX0 + 0.15 + doorW * (i + 0.5);
    const z = PASS_FACE_Z - (i === 0 ? 0.02 : 0.06);
    frame.add(plank(doorW + 0.04, h - 0.26, 0.05, 0.015, [1 / 1.5, 1 / 1.5], 2, [r() * 3, r()], true), trs([cx, 0.15 + (h - 0.26) / 2, z]));
    // the sunk panel's raised frame
    for (const [w, hh, x, y] of [
      [doorW - 0.1, 0.06, cx, 0.24],
      [doorW - 0.1, 0.06, cx, h - 0.16],
      [0.06, h - 0.46, cx - doorW / 2 + 0.08, 0.15 + (h - 0.26) / 2],
      [0.06, h - 0.46, cx + doorW / 2 - 0.08, 0.15 + (h - 0.26) / 2],
    ] as [number, number, number, number][])
      frame.add(plank(w, hh, 0.035, 0.01, [1 / 1.5, 1 / 1.5], 1, [r(), r()], true), trs([x, y, z + 0.035]));
  }
  for (const x of [PX0 + 0.07, PASS.x1 + 0.02]) frame.add(plank(0.14, h, 0.1, 0.02, [1 / 1.5, 1 / 1.5], 2, [r() * 3, r()], true), trs([x, h / 2, PASS_FACE_Z]));
  // the end cupboard to the wall
  frame.add(plank(PX1 - PASS.x1 - 0.09, h - 0.15, 0.06, 0.015, [1 / 1.5, 1 / 1.5], 2, [r(), r()], true), trs([(PASS.x1 + 0.09 + PX1) / 2, 0.15 + (h - 0.15) / 2, PASS_FACE_Z]));
  frame.add(plank(PX1 - PX0, 0.13, 0.08, 0.015), trs([(PX0 + PX1) / 2, 0.065, PASS_FACE_Z - 0.03]));
  // a back panel on the kitchen side
  frame.add(plank(PX1 - PX0, h, 0.05), trs([(PX0 + PX1) / 2, h / 2, COUNTER.back + 0.025]));
  // a wooden top over the end cupboard
  frame.add(plank(PX1 - PASS.x1 - 0.05, 0.07, d + 0.06, 0.02, [1 / 1.5, 1 / 1.5]), trs([(PASS.x1 + 0.05 + PX1) / 2, PASS.top - 0.035, (PASS_FACE_Z + COUNTER.back) / 2 + 0.03]));
  return frame.build();
}

function passTopGeometry() {
  const m = new Merger();
  const x0 = PX0 - 0.02;
  const x1 = PASS.x1 + 0.05;
  const z0 = COUNTER.back;
  const z1 = PASS_FACE_Z + 0.03;
  const w = x1 - x0;
  const top = plank(w, 0.04, z1 - z0, 0.01, [1 / 1.6, 1 / 1.6]);
  m.add(top, trs([(x0 + x1) / 2, PASS.top - 0.02, (z0 + z1) / 2]));
  // a rolled front edge and a low upstand to the customers' side
  m.add(tubeThrough([V(x0, PASS.top - 0.03, z1), V(x1, PASS.top - 0.03, z1)], () => 0.03, 2, 14).geometry);
  m.add(plank(w, 0.075, 0.03, 0.012, [1 / 1.6, 1 / 1.6]), trs([(x0 + x1) / 2, PASS.top + 0.035, z1 - 0.06]));
  const g = m.build();
  // a few dull heat marks and fingerprints
  return paint(g, (x, _y, z, out) => out.setScalar(0.92 + 0.12 * fbm3(x * 2.5, 9, z * 2.5)));
}

/** An enamel pendant shade (green outside, white inside) with a brass gallery. Hangs from y = 0 down. */
function lampShadeGeometry() {
  return once('ramen:pass-shade', () => {
    const n = 90;
    const g = smoothLathe(
      [
        [0.07, 0.0],
        [0.1, -0.03],
        [0.13, -0.1],
        [0.22, -0.2],
        [0.36, -0.3],
        [0.44, -0.37],
        [0.455, -0.395],
        [0.445, -0.405],
        [0.43, -0.385],
        [0.35, -0.315],
        [0.21, -0.215],
        [0.12, -0.12],
        [0.085, -0.04],
        [0.05, -0.03],
      ],
      n,
      64,
    );
    const outside = C('#2c4a3a');
    const inside = C('#f3eee2');
    const rim = C('#1c1a18');
    return paintLathe(g, n, (x, y, z, along, out) => {
      if (along < 0.53) {
        out.copy(outside).multiplyScalar(0.92 + 0.12 * noise3(x * 20, y * 20, z * 20));
        // chipped enamel at the rim
        mix(out, out, rim, smoothstep(-0.36, -0.4, y) * 0.8 + smoothstep(0.55, 0.8, noise3(x * 40, y * 40, z * 40)) * smoothstep(-0.3, -0.39, y) * 0.6);
      } else out.copy(inside);
    });
  });
}

function PassLamp({ p, i, m }: { p: [number, number, number]; i: number; m: CMats }) {
  const shade = lampShadeGeometry();
  const cord = useMemo(() => tubeThrough([V(0, 0, 0), V(0, (CEIL - p[1]) * 0.5, 0.004), V(0, CEIL - p[1], 0)], () => 0.014, 8, 6).geometry, [p]);
  const cap = useMemo(
    () =>
      once('ramen:pass-cap', () =>
        smoothLathe(
          [
            [0, 0.14],
            [0.03, 0.14],
            [0.045, 0.1],
            [0.05, 0.02],
            [0.085, 0.0],
            [0.09, -0.025],
            [0, -0.025],
          ],
          24,
          32,
        ),
      ),
    [],
  );
  const bulb = useMemo(
    () =>
      once('ramen:pass-bulb', () =>
        smoothLathe(
          [
            [0, -0.32],
            [0.06, -0.31],
            [0.095, -0.26],
            [0.1, -0.2],
            [0.07, -0.13],
            [0.045, -0.09],
            [0, -0.088],
          ],
          24,
          28,
        ),
      ),
    [],
  );
  const canopy = useMemo(
    () =>
      once('ramen:canopy', () =>
        smoothLathe(
          [
            [0, -0.08],
            [0.12, -0.08],
            [0.13, -0.06],
            [0.1, 0],
            [0, 0],
          ],
          16,
          32,
        ),
      ),
    [],
  );
  return (
    <group position={p}>
      <mesh geometry={shade} material={m.enamel} castShadow />
      <mesh geometry={cap} material={m.brass} castShadow />
      <mesh geometry={bulb} material={PASS_BULBS[i]} />
      <mesh geometry={cord} material={m.cord} />
      <mesh geometry={canopy} material={m.brass} position={[0, CEIL - p[1], 0]} />
    </group>
  );
}

/** A counter bell: a chrome dome on a black base with its plunger. */
function bellGeometry() {
  return once('ramen:bell', () => {
    const base = smoothLathe(
      [
        [0, 0],
        [0.1, 0],
        [0.106, 0.008],
        [0.1, 0.028],
        [0, 0.03],
      ],
      16,
      40,
    );
    paintFlat(base, '#1a1716');
    const dome = smoothLathe(
      [
        [0, 0.03],
        [0.09, 0.03],
        [0.092, 0.04],
        [0.08, 0.08],
        [0.05, 0.105],
        [0.012, 0.112],
        [0.01, 0.15],
        [0.022, 0.152],
        [0.024, 0.162],
        [0, 0.165],
      ],
      40,
      40,
    );
    paintFlat(dome, '#e8eaee');
    return { base, dome };
  });
}

/**
 * What stays on the pass: the service bell at the right end of the steel and
 * clean bowls stacked on the wooden end top. The pass itself (PASS_SLOTS, and
 * the strip in front of them where the waiter picks up) is kept clear for the
 * bowls the cooks set down.
 */
function PassThings({ m }: { m: CMats }) {
  const p = propMats();
  const bell = bellGeometry();
  const stack = bowlStackGeometry(0, 5);
  const y = PASS.top;
  const endX = (PASS.x1 + 0.05 + ROOM.x1) / 2;
  return (
    <group>
      <group position={[PASS.x1 - 0.18, y, 0.26]} rotation={[0, 0.4, 0]}>
        <mesh geometry={bell.base} material={p.glaze} castShadow />
        <mesh geometry={bell.dome} material={m.chrome} castShadow />
      </group>
      <mesh geometry={stack} material={p.glaze} position={[endX, y, -0.72]} castShadow receiveShadow />
      <mesh geometry={stack} material={p.glaze} position={[endX, y, -0.12]} rotation={[0, 1, 0]} scale={[1, 0.62, 1]} castShadow receiveShadow />
    </group>
  );
}

/** A rounded black lacquer serving tray with a raised lip, about 0.56 x 0.5 (vertex coloured, deep red inside): for the waiter, if wanted. */
export function trayGeometry() {
  return once('ramen:tray', () => {
    const s = new THREE.Shape();
    const w = 0.56;
    const d = 0.5;
    const r = 0.06;
    s.moveTo(-w / 2 + r, -d / 2);
    s.lineTo(w / 2 - r, -d / 2);
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r);
    s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + r, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    s.lineTo(-w / 2, -d / 2 + r);
    s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 8 }).rotateX(-Math.PI / 2).translate(0, -0.008, 0);
    const lip = new Merger();
    lip.add(g);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const cx = Math.cos(t);
      const sz = Math.sin(t);
      // a squircle path just inside the edge
      const px = Math.sign(cx) * Math.pow(Math.abs(cx), 0.3) * (w / 2 - 0.012);
      const pz = Math.sign(sz) * Math.pow(Math.abs(sz), 0.3) * (d / 2 - 0.012);
      pts.push(V(px, 0.016, pz));
    }
    lip.add(tubeThrough(pts, () => 0.01, 64, 6).geometry);
    const out = lip.build();
    return paint(out, (_x, y, _z, o) => (y > 0.004 && y < 0.012 ? o.set('#5a1410') : o.set('#151212')));
  });
}

// ---------- assembled ----------

export function FrontCounter() {
  const m = counterMats();
  const geo = useMemo(
    () =>
      once('ramen:counter', () => ({
        worktop: worktopGeometry(),
        ledge: ledgeGeometry(),
        front: frontGeometry(),
        rail: footRailGeometry(),
        kick: kickGeometry(),
        passBody: passBodyGeometry(),
        passTop: passTopGeometry(),
      })),
    [],
  );
  return (
    <group>
      <mesh geometry={geo.worktop} material={m.worktop} position={[(COUNTER.x0 + COUNTER.x1) / 2, COUNTER.top - 0.0375, (COUNTER.back + COUNTER.front) / 2]} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={geo.ledge} material={m.ledge} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={geo.front.frame} material={m.front} castShadow receiveShadow />
      <mesh geometry={geo.front.slats} material={m.front} castShadow receiveShadow />
      <mesh geometry={geo.kick} material={m.backing} receiveShadow />
      <mesh geometry={geo.rail} material={m.brass} castShadow />
      <BarStools m={m} />
      {/* the pass */}
      <mesh geometry={geo.passBody} material={m.front} castShadow receiveShadow />
      <mesh geometry={geo.passTop} material={m.steel} castShadow receiveShadow userData={{ surface: 'top' }} />
      {PASS_LAMPS.map((p, i) => (
        <PassLamp key={i} p={p} i={i} m={m} />
      ))}
      <PassThings m={m} />
    </group>
  );
}

export type { CMats };
