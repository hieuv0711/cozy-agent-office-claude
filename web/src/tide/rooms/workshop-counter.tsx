import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { BELL, CEIL, COUNTER, DOORWAY, RIGHT_SHELVES, ROOM, WAIT_LAMPS } from './workshop-dims';
import { boxUV, C, fbm3, mapUV, Merger, mix, noise3, once, paint, paintFlat, paintLathe, plank, rand, shadeBy, smoothLathe, smoothstep, tex, trs, V, wmat, woodTex } from './workshop-kit';
import { BelowCeiling } from './workshop-shell';
import { duckGeometry, PAINT, toyMat, topGeometry, trainGeometry, twoSided } from './workshop-toys';

// The shop counter on the right, where a maker who needs you waits under a
// lamp and rings the bell: a walnut counter with a glazed display of small
// toys in its front, a brass service bell, an ornate brass till, parcels in
// brown paper and string and a few finished toys with their tags, waiting to
// be collected. Two green enamel lamps hang over it, dim until someone waits.
// Behind it, shelves of wrapped gifts on the right wall, and by the door a peg
// rail with the toymaker's leather apron and cap.

/** The two counter lamps' bulbs, one material each: dim until someone waits under that lamp (the makers' code turns them up). */
export const WAIT_BULBS = [0, 1].map((i) => wmat(`wait-bulb-${i}`, () => new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffc770', emissiveIntensity: 0.35, roughness: 0.3 })));

export function counterMats() {
  return {
    walnut: wmat('c:walnut', () => new THREE.MeshPhysicalMaterial({ map: woodTex('ws-walnut', { w: 1024, h: 256, light: '#7a4a2a', dark: '#24120a', planks: 1, rings: 11, seed: 19, joints: false, seams: 0, figure: 0.5 }), roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.25, vertexColors: true })),
    panel: wmat('c:panel', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-walnut-panel', { w: 512, h: 512, light: '#6a3e22', dark: '#1e0e06', planks: 2, rings: 9, seed: 23, joints: false, seams: 0.2, figure: 0.4 }), roughness: 0.45, vertexColors: true })),
    brass: wmat('c:brass', () => new THREE.MeshStandardMaterial({ color: '#c99a4c', metalness: 0.9, roughness: 0.28 })),
    ornate: wmat('c:ornate', () => new THREE.MeshStandardMaterial({ color: '#e8b45a', metalness: 0.45, roughness: 0.34, bumpMap: scrollTex(), bumpScale: 0.32, vertexColors: true })),
    felt: wmat('c:felt', () => new THREE.MeshStandardMaterial({ color: '#5a1a1a', roughness: 1 })),
    glass: wmat('c:glass', () => new THREE.MeshPhysicalMaterial({ color: '#dfe8ec', transparent: true, opacity: 0.12, roughness: 0.04, clearcoat: 1, depthWrite: false })),
    enamel: wmat('c:enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide })),
    cord: wmat('c:cord', () => new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.8 })),
    paper: wmat('c:paper', () => new THREE.MeshStandardMaterial({ map: kraftTex(), roughness: 0.85 })),
    vc: wmat('c:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })),
    gloss: wmat('c:gloss', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 })),
    leather: wmat('c:leather', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide })),
  };
}
type CMats = ReturnType<typeof counterMats>;

/** Scrollwork for the till's brass: curling acanthus-like flourishes as a bump map. */
function scrollTex() {
  return tex(
    'ws-scroll',
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, w, h);
      g.lineCap = 'round';
      const r = rand(12);
      const curl = (x: number, y: number, s: number, dir: number) => {
        g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const a = dir * t * Math.PI * 2.4;
          const rr = s * (1 - t * 0.8);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      };
      for (let k = 0; k < 2; k++) {
        g.strokeStyle = k ? '#e8e8e8' : '#303030';
        g.lineWidth = k ? 5 : 9;
        const off = k ? -2 : 2;
        for (let y = 32; y < h; y += 64)
          for (let x = 32; x < w; x += 64) {
            curl(x + off, y + off, 22, (x + y) % 128 ? 1 : -1);
            g.beginPath();
            g.moveTo(x - 30 + off, y + 30 + off);
            g.quadraticCurveTo(x + off, y + 10 + off, x + 30 + off, y + 30 + off);
            g.stroke();
          }
      }
      for (let i = 0; i < 400; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    },
    { data: true },
  );
}

/** Brown kraft paper, creased. */
function kraftTex() {
  return tex('ws-kraft', 256, 256, (g, w, h) => {
    g.fillStyle = '#b98f5e';
    g.fillRect(0, 0, w, h);
    const r = rand(8);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '90,60,30' : '230,200,150'},${0.06 + r() * 0.08})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
    }
    g.strokeStyle = 'rgba(80,52,26,0.25)';
    for (let i = 0; i < 12; i++) {
      g.lineWidth = 1 + r();
      g.beginPath();
      const x = r() * w;
      g.moveTo(x, 0);
      g.lineTo(x + (r() - 0.5) * 60, h);
      g.stroke();
    }
  });
}

// ---------- the counter ----------

const X0 = COUNTER.x0;
const X1 = COUNTER.x1;
const FZ = COUNTER.front;
const BZ = COUNTER.back;
const TOP = COUNTER.top;

function counterGeometries() {
  const frame = new Merger();
  const panels = new Merger();
  const brass = new Merger();
  const r = rand(5);
  const tone = () => new THREE.Color().setScalar(0.85 + r() * 0.25);
  const h = TOP - 0.06;
  const cx = (X0 + X1) / 2;
  // the top: a thick walnut slab with a rounded nose
  const top = plank(X1 - X0 + 0.14, 0.06, FZ - BZ + 0.1, 0.022, [1 / 2.6, 1 / 1.4], 3);
  shadeBy(top, (x, y, z) => 0.9 + 0.12 * fbm3(x * 1.4, y, z * 1.4));
  // the front: stiles, rails and a plinth framing two glazed display bays
  const stiles = [X0 + 0.06, cx, X1 - 0.06];
  for (const x of stiles) frame.add(plank(0.12, h, 0.08, 0.02, [1 / 1.4, 1 / 1.4], 2, [r(), r()], true), trs([x, h / 2, FZ - 0.04]), tone());
  frame.add(plank(X1 - X0, 0.14, 0.09, 0.02), trs([cx, 0.07, FZ - 0.035]), tone());
  frame.add(plank(X1 - X0, 0.1, 0.08, 0.02), trs([cx, h - 0.05, FZ - 0.04]), tone());
  frame.add(plank(X1 - X0, 0.06, 0.08, 0.015), trs([cx, 0.3, FZ - 0.04]), tone());
  // a moulding under the top's nose
  frame.add(tubeThrough([V(X0 - 0.02, h - 0.02, FZ + 0.01), V(X1 + 0.02, h - 0.02, FZ + 0.01)], () => 0.025, 2, 10).geometry);
  // the ends: framed and panelled
  for (const x of [X0 + 0.02, X1 - 0.02]) {
    frame.add(plank(0.04, h, FZ - BZ, 0.012, [1 / 1.4, 1 / 1.4], 2, [r(), r()]), trs([x, h / 2, (FZ + BZ) / 2]), tone());
    panels.add(plank(0.03, h - 0.4, FZ - BZ - 0.3, 0.012, [1 / 1.4, 1 / 1.4], 2, [r(), r()]), trs([x + (x < cx ? -0.02 : 0.02), h / 2 + 0.05, (FZ + BZ) / 2]), tone());
  }
  // the back: open shelves for the shopkeeper, behind the display
  const sd = 0.6;
  for (const sy of [0.14, 0.42, 0.68]) frame.add(plank(X1 - X0 - 0.08, 0.03, sd, 0.008), trs([cx, sy, BZ + sd / 2 + 0.02]), tone());
  // a panel under each display bay
  for (const [a, b] of [
    [X0 + 0.12, cx - 0.06],
    [cx + 0.06, X1 - 0.12],
  ])
    panels.add(plank(b - a, 0.14, 0.03, 0.01, [1 / 1.4, 1 / 1.4], 2, [r(), r()]), trs([(a + b) / 2, 0.205, FZ - 0.06]), tone());
  // brass corner caps and a kick plate
  for (const x of [X0 + 0.01, X1 - 0.01]) brass.add(plank(0.05, 0.12, 0.05, 0.01), trs([x, 0.08, FZ + 0.005]));
  brass.add(plank(X1 - X0 - 0.2, 0.05, 0.006, 0.002), trs([cx, 0.1, FZ + 0.012]));
  // the display: felt-lined floor and a stepped shelf behind the glass
  const felt = new Merger();
  felt.add(plank(X1 - X0 - 0.15, 0.02, 0.5, 0.005), trs([cx, 0.34, FZ - 0.32]));
  felt.add(plank(X1 - X0 - 0.15, 0.02, 0.25, 0.005), trs([cx, 0.55, FZ - 0.5]));
  felt.add(plank(X1 - X0 - 0.15, 0.22, 0.02, 0.005), trs([cx, 0.44, FZ - 0.37]));
  felt.add(plank(X1 - X0 - 0.15, 0.58, 0.02, 0.005), trs([cx, 0.62, FZ - 0.64]));
  const glass = new Merger();
  for (const [a, b] of [
    [X0 + 0.12, cx - 0.06],
    [cx + 0.06, X1 - 0.12],
  ])
    glass.add(new THREE.PlaneGeometry(b - a, h - 0.45), trs([(a + b) / 2, (0.33 + h - 0.1) / 2, FZ - 0.02]));
  return { top, frame: frame.build(), panels: panels.build(), brass: brass.build(), felt: felt.build(), glass: glass.build() };
}

/** Small toys on display behind the glass. */
function displayToys() {
  const m = new Merger();
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, s: number, ry = 0) => m.add(g, trs([x, y, z], [0, ry, 0], s));
  const zf = FZ - 0.22;
  const zb = FZ - 0.5;
  put(topGeometry(0, 1), 8.15, 0.35, zf, 0.9);
  put(topGeometry(2, 3), 8.45, 0.35, zf, 0.9);
  put(duckGeometry(0), 8.95, 0.35, zf, 0.7, 0.4);
  put(topGeometry(1, 0), 9.45, 0.35, zf, 0.9);
  put(trainGeometry(2), 10.45, 0.35, zf, 0.42);
  put(topGeometry(0, 2), 11.35, 0.35, zf, 0.9);
  put(duckGeometry(1), 11.0, 0.56, zb, 0.55, -0.4);
  put(topGeometry(2, 1), 9.1, 0.56, zb, 0.8);
  put(topGeometry(1, 3), 8.4, 0.56, zb, 0.8);
  put(trainGeometry(1), 10.0, 0.56, zb, 0.36);
  return m.build();
}

// ---------- the bell and the till ----------

/** A service bell: a brass dome on a dark turned base with its plunger. */
function bellGeometries() {
  return once('ws:bell', () => {
    const n = 16;
    const base = smoothLathe(
      [
        [0, 0],
        [0.11, 0],
        [0.116, 0.01],
        [0.11, 0.032],
        [0.06, 0.036],
        [0, 0.036],
      ],
      n,
      40,
    );
    paintLathe(base, n, (_x, _y, _z, _a, out) => out.set('#1e1614'));
    const dome = smoothLathe(
      [
        [0, 0.036],
        [0.1, 0.036],
        [0.102, 0.046],
        [0.09, 0.09],
        [0.058, 0.118],
        [0.014, 0.126],
        [0.011, 0.165],
        [0.024, 0.168],
        [0.026, 0.18],
        [0, 0.184],
      ],
      40,
      48,
    );
    return { base, dome };
  });
}

/** An ornate brass till: a cash drawer in walnut, a brass case with scrollwork, rows of keys on a slope, the sale flags' window and a crest, a crank. Built facing +z (the customer's side); its keys face -z. */
function tillGeometries() {
  return once('ws:till', () => {
    const brass = new Merger();
    const wood = new Merger();
    const keys = new Merger();
    const W = 0.62;
    // the cash drawer
    wood.add(plank(W + 0.04, 0.15, 0.56, 0.02, [2, 2]), trs([0, 0.075, 0]));
    wood.add(plank(W - 0.08, 0.1, 0.02, 0.01, [2, 2]), trs([0, 0.075, -0.285]));
    // the case: a side profile (customer side tall, a sloping keyboard toward the clerk) run across x
    const s = new THREE.Shape();
    s.moveTo(-0.26, 0);
    s.lineTo(0.26, 0);
    s.lineTo(0.26, 0.38);
    s.quadraticCurveTo(0.25, 0.42, 0.2, 0.42);
    s.lineTo(0.02, 0.42);
    s.lineTo(-0.24, 0.16);
    s.lineTo(-0.26, 0.12);
    s.closePath();
    const caseG = new THREE.ExtrudeGeometry(s, { depth: W - 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3, curveSegments: 8 });
    caseG.translate(0, 0, -(W - 0.04) / 2).rotateY(Math.PI / 2);
    boxUV(caseG, 5);
    brass.add(caseG, trs([0, 0.15, 0]));
    // raised mouldings framing the customer's face, an oval medallion in the middle, bun feet
    const face = 0.15 + 0.2;
    for (const [w, h, x, y] of [
      [W - 0.06, 0.025, 0, 0.15 + 0.4],
      [W - 0.06, 0.025, 0, 0.15 + 0.03],
      [0.025, 0.37, -W / 2 + 0.05, face],
      [0.025, 0.37, W / 2 - 0.05, face],
    ] as [number, number, number, number][])
      brass.add(plank(w, h, 0.03, 0.01, [3, 3]), trs([x, y, 0.27]));
    const medal = new THREE.CylinderGeometry(0.085, 0.085, 0.025, 32).rotateX(Math.PI / 2);
    brass.add(medal, trs([0, face, 0.275], [0, 0, 0], [1.35, 1, 1]));
    brass.add(new THREE.TorusGeometry(0.085, 0.01, 6, 32), trs([0, face, 0.29], [0, 0, 0], [1.35, 1, 1]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) brass.add(new THREE.SphereGeometry(0.03, 12, 8), trs([sx * (W / 2 - 0.02), 0.0, sz * 0.24], [0, 0, 0], [1, 0.6, 1]));
    // the sale flags' window box and the crest on top
    brass.add(plank(0.42, 0.16, 0.2, 0.02, [3, 3]), trs([0, 0.65, 0.06]));
    const crest = new THREE.Shape();
    crest.moveTo(-0.2, 0);
    crest.quadraticCurveTo(-0.22, 0.08, -0.12, 0.1);
    crest.quadraticCurveTo(-0.06, 0.18, 0, 0.2);
    crest.quadraticCurveTo(0.06, 0.18, 0.12, 0.1);
    crest.quadraticCurveTo(0.22, 0.08, 0.2, 0);
    crest.closePath();
    const crestG = new THREE.ExtrudeGeometry(crest, { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 10 });
    mapUV(crestG, (x, y) => [x * 3, y * 3]);
    brass.add(crestG, trs([0, 0.73, 0.1]));
    // the flags in the window: blank white tabs (no numbers)
    for (let k = 0; k < 4; k++) keys.add(plank(0.06, 0.07, 0.008, 0.004), trs([-0.12 + k * 0.08, 0.66, 0.165]), C('#f2ece0'));
    keys.add(plank(0.4, 0.12, 0.004, 0.002), trs([0, 0.66, 0.168]), C('#1a1612'));
    // keys: three rows on the slope, round white caps with dark rims
    const capG = smoothLathe(
      [
        [0, 0],
        [0.024, 0],
        [0.026, 0.008],
        [0.024, 0.014],
        [0, 0.016],
      ],
      8,
      18,
    );
    paintLathe(capG, 8, (x, _y, z, _a, out) => out.set(Math.hypot(x, z) > 0.019 ? '#2a2420' : '#f4efe4'));
    const slope = Math.atan2(0.26, 0.26);
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 6; k++) {
        const t = 0.2 + row * 0.27;
        const zz = -0.24 + t * 0.26;
        const yy = 0.15 + 0.16 + t * 0.26;
        keys.add(tubeThrough([V(0, 0, 0), V(0, 0.03, 0)], () => 0.005, 1, 6).geometry, trs([-0.23 + k * 0.092, yy, zz], [-slope, 0, 0]), C('#c8ccd0'));
        keys.add(capG, trs([-0.23 + k * 0.092, yy + 0.03 * Math.cos(slope), zz + 0.03 * Math.sin(slope)], [-slope, 0, 0]));
      }
    // the crank on the right side
    brass.add(tubeThrough([V(W / 2, 0.36, -0.02), V(W / 2 + 0.05, 0.36, -0.02)], () => 0.014, 2, 8).geometry);
    brass.add(tubeThrough([V(W / 2 + 0.05, 0.36, -0.02), V(W / 2 + 0.06, 0.25, -0.12)], () => 0.012, 2, 8).geometry);
    wood.add(
      smoothLathe(
        [
          [0, 0],
          [0.018, 0],
          [0.022, 0.03],
          [0.018, 0.08],
          [0, 0.085],
        ],
        10,
        14,
      ).rotateZ(-Math.PI / 2),
      trs([W / 2 + 0.06, 0.25, -0.12]),
    );
    const brassG = brass.build();
    // darker in the recesses (low on the case and under the mouldings), polished on the high spots
    shadeBy(brassG, (x, y, z) => (0.9 + 0.14 * noise3(x * 30, y * 30, z * 30)) * (0.82 + 0.18 * smoothstep(0.15, 0.6, y)));
    return { brass: brassG, wood: wood.build(), keys: keys.build() };
  });
}

// ---------- parcels ----------

/** A parcel in brown paper tied with red string both ways, a blank tag on a loop. Size w x h x d, standing on y = 0. */
function parcel(w: number, h: number, d: number, string: string, seed: number) {
  const paper = plank(w, h, d, 0.012, [3, 3], 2, [seed * 0.3, seed * 0.7]);
  const str = new Merger();
  const sc = C(string);
  for (const [a, b] of [
    [V(-w / 2 - 0.004, h + 0.003, 0), V(w / 2 + 0.004, h + 0.003, 0)],
    [V(0, h + 0.003, -d / 2 - 0.004), V(0, h + 0.003, d / 2 + 0.004)],
  ] as [THREE.Vector3, THREE.Vector3][])
    str.add(tubeThrough([a, b], () => 0.005, 2, 5).geometry, undefined, sc);
  for (const s of [-1, 1]) {
    str.add(tubeThrough([V(s * (w / 2 + 0.004), 0, 0), V(s * (w / 2 + 0.004), h, 0)], () => 0.005, 2, 5).geometry, undefined, sc);
    str.add(tubeThrough([V(0, 0, s * (d / 2 + 0.004)), V(0, h, s * (d / 2 + 0.004))], () => 0.005, 2, 5).geometry, undefined, sc);
  }
  // a bow on top and a blank cream tag
  for (const s of [-1, 1]) str.add(new THREE.TorusGeometry(0.025, 0.006, 6, 14), trs([s * 0.022, h + 0.012, 0], [Math.PI / 2, 0, s * 0.5], [1, 0.6, 1]), sc);
  str.add(plank(0.06, 0.004, 0.09, 0.002), trs([w * 0.25, h + 0.006, d * 0.25], [0, 0.6, 0]), C('#efe6cf'));
  return { paper: paper.translate(0, h / 2, 0), string: str.build() };
}

// ---------- the counter lamps ----------

function waitShadeGeometry() {
  return once('ws:wait-shade', () => {
    const n = 90;
    const g = smoothLathe(
      [
        [0.06, 0.0],
        [0.085, -0.04],
        [0.11, -0.11],
        [0.2, -0.2],
        [0.32, -0.28],
        [0.38, -0.34],
        [0.392, -0.36],
        [0.382, -0.37],
        [0.37, -0.35],
        [0.3, -0.29],
        [0.19, -0.21],
        [0.1, -0.12],
        [0.075, -0.05],
        [0.045, -0.04],
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
        mix(out, out, rim, smoothstep(-0.34, -0.37, y) * 0.8 + smoothstep(0.55, 0.8, noise3(x * 40, y * 40, z * 40)) * smoothstep(-0.3, -0.36, y) * 0.6);
      } else out.copy(inside);
    });
  });
}

function WaitLamp({ p, i, m }: { p: [number, number, number]; i: number; m: CMats }) {
  const shade = waitShadeGeometry();
  const parts = useMemo(
    () =>
      once(`ws:wait-lamp:${p[1]}`, () => {
        const cap = smoothLathe(
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
        );
        const bulb = smoothLathe(
          [
            [0, -0.33],
            [0.06, -0.32],
            [0.095, -0.27],
            [0.1, -0.21],
            [0.07, -0.14],
            [0.045, -0.1],
            [0, -0.098],
          ],
          24,
          28,
        );
        const canopy = smoothLathe(
          [
            [0, -0.08],
            [0.12, -0.08],
            [0.13, -0.06],
            [0.1, 0],
            [0, 0],
          ],
          16,
          32,
        );
        const cord = tubeThrough([V(0, 0.14, 0), V(0, (CEIL - p[1]) * 0.5, 0.004), V(0, CEIL - p[1], 0)], () => 0.013, 8, 6).geometry;
        return { cap, bulb, canopy, cord };
      }),
    [p],
  );
  return (
    <group position={p}>
      <mesh geometry={shade} material={m.enamel} castShadow />
      <mesh geometry={parts.cap} material={m.brass} castShadow />
      <mesh geometry={parts.bulb} material={WAIT_BULBS[i]} />
      <mesh geometry={parts.cord} material={m.cord} />
      <mesh geometry={parts.canopy} material={m.brass} position={[0, CEIL - p[1], 0]} />
    </group>
  );
}

// ---------- behind the counter ----------

/** Shelves on the right wall stacked with gifts in coloured papers and ribbons, a drum and rolled kites. */
function giftShelves() {
  const wood = new Merger();
  const gifts = new Merger();
  const iron = new Merger();
  const r = rand(14);
  const { z0, z1, ys, depth } = RIGHT_SHELVES;
  const xw = ROOM.x1;
  const papers = ['#b8322a', '#2c5d9c', '#3a8350', '#e6b02e', '#efe3c8', '#8a3a6a', '#2d8686'];
  const ribbons = ['#e6b02e', '#efe3c8', '#b8322a'];
  for (const y of ys) {
    wood.add(plank(depth, 0.045, z1 - z0, 0.012, [1 / 1.2, 1 / 2.4]), trs([xw - depth / 2, y - 0.022, (z0 + z1) / 2]));
    for (let z = z0 + 0.3; z < z1; z += 1.3) iron.add(tubeThrough([V(xw - 0.01, y - 0.04, z), V(xw - 0.01, y - 0.3, z), V(xw - 0.28, y - 0.05, z)], () => 0.012, 6, 6).geometry);
    let z = z0 + 0.12;
    while (z < z1 - 0.2) {
      const w = 0.2 + r() * 0.22;
      const h = 0.14 + r() * 0.22;
      const d = 0.2 + r() * 0.14;
      const p = papers[Math.floor(r() * papers.length)];
      const rb = C(ribbons[Math.floor(r() * ribbons.length)]);
      const box = plank(d, h, w, 0.01, [4, 4]);
      paintFlat(box, p);
      // a ribbon both ways and a bow
      const rib = new Merger();
      rib.add(plank(d + 0.006, h + 0.006, 0.03, 0.003), undefined, rb);
      rib.add(plank(0.03, h + 0.006, w + 0.006, 0.003), undefined, rb);
      for (const s of [-1, 1]) rib.add(new THREE.TorusGeometry(0.03, 0.008, 6, 14), trs([0, h / 2 + 0.015, s * 0.025], [0, Math.PI / 2, s * 0.4], [1, 0.7, 1]), rb);
      const g = new Merger().add(box).add(rib.build()).build();
      gifts.add(g, trs([xw - 0.06 - d / 2, y + h / 2, z + w / 2], [0, (r() - 0.5) * 0.15, 0]));
      // now and then a second, smaller one on top
      if (r() < 0.35) {
        const h2 = 0.08 + r() * 0.08;
        const b2 = plank(d * 0.7, h2, w * 0.7, 0.008, [4, 4]);
        paintFlat(b2, papers[Math.floor(r() * papers.length)]);
        gifts.add(b2, trs([xw - 0.06 - d / 2, y + h + h2 / 2, z + w / 2], [0, r() - 0.5, 0]));
      }
      z += w + 0.05 + r() * 0.08;
    }
  }
  // a toy drum on the top shelf's end, rolled kites leaning in the corner
  const drum = smoothLathe(
    [
      [0, 0],
      [0.15, 0],
      [0.16, 0.02],
      [0.16, 0.2],
      [0.15, 0.22],
      [0, 0.22],
    ],
    20,
    28,
  );
  paintLathe(drum, 20, (x, y, z, _a, out) => {
    out.set(y < 0.03 || y > 0.19 ? PAINT.blue : PAINT.red);
    const a = Math.atan2(z, x);
    if (y > 0.03 && y < 0.19 && Math.abs(((a * 6) / Math.PI + (y - 0.03) * 25) % 2) < 0.12) out.set(PAINT.gold);
    if (y > 0.215 && Math.hypot(x, z) < 0.14) out.set('#f2ead8');
  });
  gifts.add(drum, trs([xw - 0.22, ys[3], z1 - 0.3]));
  for (let k = 0; k < 3; k++) {
    const kite = tubeThrough([V(0, 0, 0), V(0, 1.4 + k * 0.1, 0)], () => 0.045 - k * 0.004, 2, 10).geometry;
    paintFlat(kite, [PAINT.red, PAINT.yellow, PAINT.blue][k]);
    gifts.add(kite, trs([xw - 0.15 - k * 0.07, 0, z0 - 0.3 + k * 0.1], [0.06 * k, 0, 0.1 + k * 0.05]));
  }
  return { wood: wood.build(), gifts: gifts.build(), iron: iron.build() };
}

/** A peg rail beside the door: the toymaker's leather apron and a flat cap hang on it. */
function pegRail() {
  const wood = new Merger();
  const leather = new Merger();
  const x0 = DOORWAY.x1 + 0.45;
  const x1 = ROOM.x1 - 0.3;
  const y = 3.2;
  const z = ROOM.back + 0.06;
  wood.add(plank(x1 - x0, 0.12, 0.04, 0.015), trs([(x0 + x1) / 2, y, z]));
  const pegs = [x0 + 0.25, x0 + 0.65, x0 + 1.05];
  for (const px of pegs)
    wood.add(
      smoothLathe(
        [
          [0, 0],
          [0.02, 0],
          [0.016, 0.08],
          [0.028, 0.11],
          [0.022, 0.13],
          [0, 0.13],
        ],
        12,
        14,
      ).rotateX(Math.PI / 2),
      trs([px, y, z + 0.02]),
    );
  // the apron: a curved leather bib and skirt, its neck strap over the first peg
  const ap = new THREE.Shape();
  ap.moveTo(-0.12, 0);
  ap.lineTo(0.12, 0);
  ap.quadraticCurveTo(0.14, -0.2, 0.26, -0.3);
  ap.lineTo(0.27, -1.1);
  ap.quadraticCurveTo(0, -1.16, -0.27, -1.1);
  ap.lineTo(-0.26, -0.3);
  ap.quadraticCurveTo(-0.14, -0.2, -0.12, 0);
  const apron = new THREE.ShapeGeometry(ap, 12);
  const pos = apron.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ax = pos.getX(i);
    const ay = pos.getY(i);
    pos.setZ(i, 0.05 + Math.cos(ax * 5) * 0.025 + ay * -0.02 + Math.sin(ay * 6 + ax * 3) * 0.012);
  }
  apron.computeVertexNormals();
  paint(apron, (ax, ay, _az, out) => {
    out.set('#7a4a2a').multiplyScalar(0.85 + 0.25 * noise3(ax * 8, ay * 8, 2));
    // a pocket across the front and darker wear
    if (ay < -0.55 && ay > -0.8 && Math.abs(ax) < 0.2) out.multiplyScalar(0.8);
    if (Math.abs(ay + 0.55) < 0.008 && Math.abs(ax) < 0.2) out.set('#e2c8a0');
  });
  leather.add(twoSided(apron), trs([pegs[0], y - 0.12, z + 0.05]));
  leather.add(tubeThrough([V(pegs[0] - 0.1, y - 0.12, z + 0.06), V(pegs[0], y + 0.03, z + 0.14), V(pegs[0] + 0.1, y - 0.12, z + 0.06)], () => 0.009, 12, 5).geometry, undefined, C('#5a3420'));
  // a flat cap on the third peg
  const cap = smoothLathe(
    [
      [0, 0],
      [0.16, 0],
      [0.17, 0.02],
      [0.15, 0.07],
      [0.08, 0.1],
      [0, 0.105],
    ],
    16,
    28,
  );
  paint(cap, (cx, cy, cz, out) => out.set('#4a4a3e').multiplyScalar(0.85 + 0.25 * noise3(cx * 30, cy * 30, cz * 30)));
  leather.add(cap, trs([pegs[2], y + 0.02, z + 0.13], [Math.PI / 2 - 0.25, 0, 0], [1, 1, 0.85]));
  const brim = new THREE.CylinderGeometry(0.1, 0.12, 0.012, 16, 1, false, 0, Math.PI);
  paintFlat(brim, '#3e3e34');
  leather.add(brim, trs([pegs[2], y - 0.11, z + 0.2], [0.4, 0, 0]));
  return { wood: wood.build(), leather: leather.build() };
}

// ---------- assembled ----------

export function ShopCounter() {
  const m = counterMats();
  const toy = toyMat();
  const geo = useMemo(
    () =>
      once('ws:counter', () => {
        const parcels = [parcel(0.42, 0.22, 0.32, '#b8322a', 1), parcel(0.3, 0.16, 0.26, '#2c5d9c', 2), parcel(0.24, 0.3, 0.22, '#b8322a', 3)];
        return { c: counterGeometries(), display: displayToys(), parcels, gifts: giftShelves(), rail: pegRail(), till: tillGeometries(), bell: bellGeometries() };
      }),
    [],
  );
  const cx = (X0 + X1) / 2;
  return (
    <group>
      <mesh geometry={geo.c.top} material={m.walnut} position={[cx, TOP - 0.03, (FZ + BZ) / 2]} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={geo.c.frame} material={m.walnut} castShadow receiveShadow />
      <mesh geometry={geo.c.panels} material={m.panel} receiveShadow />
      <mesh geometry={geo.c.brass} material={m.brass} />
      <mesh geometry={geo.c.felt} material={m.felt} receiveShadow />
      <mesh geometry={geo.display} material={toy} castShadow receiveShadow />
      <mesh geometry={geo.c.glass} material={m.glass} renderOrder={2} />
      {/* the bell, between the two lamps */}
      <group position={BELL}>
        <mesh geometry={geo.bell.base} material={m.gloss} castShadow />
        <mesh geometry={geo.bell.dome} material={m.brass} castShadow />
      </group>
      {/* the till at the right end, keys toward the shopkeeper */}
      <group position={[11.32, TOP, -0.42]} rotation={[0, -0.2, 0]}>
        <mesh geometry={geo.till.brass} material={m.ornate} castShadow receiveShadow />
        <mesh geometry={geo.till.wood} material={m.walnut} castShadow receiveShadow />
        <mesh geometry={geo.till.keys} material={m.gloss} castShadow />
      </group>
      {/* parcels at the left end, a duck and a train with their tags, waiting to be collected */}
      {(
        [
          [0, 8.12, -0.25, 0.2, 0],
          [1, 8.14, -0.27, -0.25, 0.22],
          [2, 8.5, 0.08, 0.5, 0],
        ] as [number, number, number, number, number][]
      ).map(([i, x, z, ry, y]) => (
        <group key={i} position={[x, TOP + y, z]} rotation={[0, ry, 0]}>
          <mesh geometry={geo.parcels[i].paper} material={m.paper} castShadow receiveShadow />
          <mesh geometry={geo.parcels[i].string} material={m.vc} castShadow />
        </group>
      ))}
      <mesh geometry={trainGeometry(0)} material={toy} position={[10.15, TOP, 0.14]} rotation={[0, -0.12, 0]} scale={0.48} castShadow receiveShadow />
      <mesh geometry={duckGeometry(0)} material={toy} position={[9.08, TOP, 0.1]} rotation={[0, 0.5, 0]} scale={0.85} castShadow receiveShadow />
      {/* the lamps hang from the ceiling: hidden with it in the top shot, so they never hide a waiting maker */}
      <BelowCeiling>
        {WAIT_LAMPS.map((p, i) => (
          <WaitLamp key={i} p={p} i={i} m={m} />
        ))}
      </BelowCeiling>
      <mesh geometry={geo.gifts.wood} material={m.walnut} castShadow receiveShadow userData={{ surface: 'shelf' }} />
      <mesh geometry={geo.gifts.gifts} material={m.gloss} castShadow receiveShadow />
      <mesh geometry={geo.gifts.iron} material={m.cord} />
      <mesh geometry={geo.rail.wood} material={m.walnut} castShadow />
      <mesh geometry={geo.rail.leather} material={m.leather} castShadow receiveShadow />
    </group>
  );
}
