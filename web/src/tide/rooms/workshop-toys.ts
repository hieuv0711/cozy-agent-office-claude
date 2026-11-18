import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { tubeThrough } from '../../tank/geo';
import { cached, chain, cone, ellipsoid, meshSDF, type SDF, smin, sphere } from '../../tank/sdf';
import { boxUV, C, fbm3, mapUV, Merger, mix, noise3, once, paint, paintLathe, rand, smoothLathe, smoothstep, toyGrainTex, trs, V, wmat, worley3 } from './workshop-kit';

// The wooden toys the workshop makes, as geometry: a steam train, a robot, a
// rocking horse, spinning tops, peg dolls and toy soldiers, a biplane, a
// pull-along duck, a sailing boat, building blocks, a ball and a teddy bear.
// They stand on y = 0 with their best side toward +z, at the size a catalog
// item is drawn (about 1.6x real); the shelves use them scaled down. Painted
// and natural wood alike take one pale beech grain (toyMat) times their vertex
// colours, so the paint shows the grain under it.

export const PAINT = {
  red: '#c0392b',
  blue: '#2c5d9c',
  yellow: '#e6b02e',
  green: '#3a8350',
  cream: '#efe3c8',
  black: '#1d1a18',
  beech: '#e0bd8c',
  walnut: '#7a4a28',
  white: '#f3efe6',
  pink: '#e2899a',
  orange: '#dc6f2a',
  teal: '#2d8686',
  gold: '#d6a640',
  sky: '#7fb0d8',
  skin: '#f0caa6',
  grey: '#8a9096',
};

/** The painted-beech material every toy shares. */
export function toyMat() {
  return wmat('toy', () => new THREE.MeshPhysicalMaterial({ map: toyGrainTex(), vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
}

/** Teddy fur: soft, matte, a little fuzz in a bump map. */
export function furMat() {
  return wmat('toy-fur', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
}

// ---------- small builders ----------

const col = (hex: string) => C(hex);

/** A rounded box with world-sized UVs, flat-painted. */
function rbox(w: number, h: number, d: number, r: number, hex: string, seg = 3) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  boxUV(g, 2.5);
  return paint(g, (_x, _y, _z, out) => out.set(hex));
}

/** A lathe, painted by height (fn gets y and how far along the profile). */
function lathe(pts: [number, number][], n: number, seg: number, fn: (x: number, y: number, z: number, along: number, out: THREE.Color) => void) {
  return paintLathe(smoothLathe(pts, n, seg), n, fn);
}

/** A wheel: a disc with a rounded rim and a hub, axis along z. */
function wheel(r: number, t: number, rim: string, hub: string) {
  const n = 20;
  const g = smoothLathe(
    [
      [0, -t / 2],
      [r * 0.92, -t / 2],
      [r, -t * 0.3],
      [r, t * 0.3],
      [r * 0.92, t / 2],
      [r * 0.42, t / 2 + 0.002],
      [r * 0.3, t / 2 + t * 0.35],
      [0, t / 2 + t * 0.4],
    ],
    n,
    28,
  ).rotateX(Math.PI / 2);
  return paint(g, (x, y, z, out) => {
    const rr = Math.hypot(x, y);
    out.set(rr > r * 0.55 ? rim : hub);
    if (z > t / 2 - 0.001 && rr < r * 0.3) out.set(PAINT.black);
  });
}

/** A dowel between two points. */
function dowel(a: THREE.Vector3, b: THREE.Vector3, r: number, hex: string) {
  const g = tubeThrough([a, b], () => r, 2, 10).geometry;
  return paint(g, (_x, _y, _z, out) => out.set(hex));
}

const ball = (r: number, hex: string, w = 16, h = 12) => paint(new THREE.SphereGeometry(r, w, h), (_x, _y, _z, out) => out.set(hex));

/** A thin sheet seen from both sides with a one-sided material: the sheet plus a flipped copy. */
export function twoSided(g: THREE.BufferGeometry) {
  const back = g.clone();
  const idx = back.index as THREE.BufferAttribute;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = back.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return new Merger().add(g).add(back).build();
}

// ---------- the steam train ----------

const TRAIN_COLOURS: [string, string, string][] = [
  [PAINT.red, PAINT.green, PAINT.yellow],
  [PAINT.blue, PAINT.red, PAINT.yellow],
  [PAINT.green, PAINT.red, PAINT.cream],
];

/** A little steam train: engine, coal tender and an open wagon of blocks. About 1.3 long, running along x. */
export function trainGeometry(seed: number) {
  return once(`toy:train:${seed % 3}`, () => {
    const [body, cab, wheels] = TRAIN_COLOURS[seed % 3];
    const m = new Merger();
    const r = rand(seed + 4);
    // the engine
    const ex = 0.32;
    m.add(rbox(0.5, 0.07, 0.22, 0.02, PAINT.black), trs([ex, 0.11, 0]));
    const boiler = lathe(
      [
        [0, -0.17],
        [0.088, -0.17],
        [0.098, -0.15],
        [0.1, 0.14],
        [0.104, 0.15],
        [0.104, 0.17],
        [0.06, 0.185],
        [0, 0.19],
      ],
      30,
      28,
      (_x, y, _z, _a, out) => {
        out.set(body);
        // brass bands round the boiler, a dark smokebox at the front
        if (Math.abs(y + 0.06) < 0.012 || Math.abs(y - 0.06) < 0.012) out.set(PAINT.gold);
        if (y > 0.15) out.set(PAINT.black);
      },
    ).rotateZ(-Math.PI / 2);
    m.add(boiler, trs([ex + 0.06, 0.25, 0]));
    m.add(
      lathe(
        [
          [0, 0],
          [0.035, 0],
          [0.032, 0.08],
          [0.05, 0.13],
          [0.056, 0.15],
          [0.03, 0.152],
          [0, 0.148],
        ],
        20,
        20,
        (_x, y, _z, _a, out) => out.set(y > 0.12 ? PAINT.gold : PAINT.black),
      ),
      trs([ex + 0.18, 0.33, 0]),
    );
    m.add(ball(0.045, PAINT.gold, 16, 10), trs([ex + 0.03, 0.345, 0]), undefined);
    // the cab with a roof and windows
    m.add(rbox(0.2, 0.24, 0.23, 0.025, cab), trs([ex - 0.15, 0.27, 0]));
    m.add(rbox(0.26, 0.03, 0.28, 0.012, PAINT.black), trs([ex - 0.15, 0.405, 0]));
    for (const s of [-1, 1]) m.add(rbox(0.09, 0.08, 0.01, 0.008, '#2a2420'), trs([ex - 0.15, 0.31, s * 0.116]));
    // a cowcatcher and buffers
    const wedge = new THREE.Shape();
    wedge.moveTo(0, 0);
    wedge.lineTo(0.08, 0);
    wedge.lineTo(0, 0.085);
    wedge.closePath();
    const cow = new THREE.ExtrudeGeometry(wedge, { depth: 0.17, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }).translate(0, 0, -0.085);
    m.add(paint(cow, (_x, _y, _z, out) => out.set(PAINT.red)), trs([ex + 0.25, 0.05, 0]));
    for (const s of [-1, 1]) m.add(ball(0.02, PAINT.black, 10, 8), trs([ex + 0.26, 0.13, s * 0.08]));
    // wheels: two big drivers and a small leading pair each side, with a coupling rod
    for (const s of [-1, 1]) {
      for (const [wx, wr] of [
        [ex - 0.12, 0.075],
        [ex + 0.05, 0.075],
        [ex + 0.2, 0.05],
      ] as [number, number][])
        m.add(wheel(wr, 0.03, wheels, PAINT.black), trs([wx, wr + 0.005, s * 0.12]), undefined);
      m.add(rbox(0.19, 0.012, 0.01, 0.004, '#c8ccd0'), trs([ex - 0.035, 0.08, s * 0.142]));
    }
    // the tender: a box of coal
    const tx = -0.12;
    m.add(rbox(0.26, 0.07, 0.2, 0.02, PAINT.black), trs([tx, 0.1, 0]));
    m.add(rbox(0.26, 0.15, 0.22, 0.025, body), trs([tx, 0.205, 0]));
    for (let i = 0; i < 9; i++) m.add(ball(0.035 + r() * 0.015, '#151312', 8, 6), trs([tx + (r() - 0.5) * 0.18, 0.28 + r() * 0.015, (r() - 0.5) * 0.14]));
    for (const s of [-1, 1]) for (const wx of [tx - 0.07, tx + 0.07]) m.add(wheel(0.05, 0.03, wheels, PAINT.black), trs([wx, 0.055, s * 0.105]), undefined);
    // an open wagon of blocks
    const wx0 = -0.46;
    m.add(rbox(0.32, 0.05, 0.2, 0.015, PAINT.black), trs([wx0, 0.09, 0]));
    const sides = new Merger();
    sides.add(rbox(0.32, 0.12, 0.025, 0.01, cab), trs([0, 0, 0.09]));
    sides.add(rbox(0.32, 0.12, 0.025, 0.01, cab), trs([0, 0, -0.09]));
    sides.add(rbox(0.025, 0.12, 0.2, 0.01, cab), trs([0.15, 0, 0]));
    sides.add(rbox(0.025, 0.12, 0.2, 0.01, cab), trs([-0.15, 0, 0]));
    m.add(sides.build(), trs([wx0, 0.17, 0]));
    const blockCols = [PAINT.red, PAINT.blue, PAINT.yellow, PAINT.green, PAINT.cream];
    for (let i = 0; i < 5; i++) {
      const bs = 0.06 + r() * 0.02;
      if (i % 2) m.add(rbox(bs, bs, bs, 0.008, blockCols[i]), trs([wx0 - 0.09 + i * 0.045, 0.2 + (i % 2) * 0.05, (r() - 0.5) * 0.08], [0, r(), r() * 0.3]));
      else {
        const cy = new THREE.CylinderGeometry(bs * 0.5, bs * 0.5, bs * 1.2, 14);
        m.add(paint(cy, (_x, _y, _z, out) => out.set(blockCols[i])), trs([wx0 - 0.09 + i * 0.045, 0.21, (r() - 0.5) * 0.08], [r() * 0.4, 0, 0]));
      }
    }
    for (const s of [-1, 1]) for (const wx of [wx0 - 0.09, wx0 + 0.09]) m.add(wheel(0.05, 0.03, wheels, PAINT.black), trs([wx, 0.055, s * 0.105]), undefined);
    // couplings
    m.add(dowel(V(-0.3, 0.1, 0), V(-0.25, 0.1, 0), 0.01, PAINT.black));
    m.add(dowel(V(0.0, 0.1, 0), V(0.08, 0.1, 0), 0.01, PAINT.black));
    return m.build();
  });
}

// ---------- the robot ----------

const ROBOT_COLOURS: [string, string, string][] = [
  [PAINT.beech, PAINT.red, PAINT.teal],
  [PAINT.sky, PAINT.yellow, PAINT.red],
  [PAINT.cream, PAINT.blue, PAINT.orange],
];

/** A wooden robot with dowel arms, claw hands, a dial on its chest and a wind-up key. About 0.8 tall. */
export function robotGeometry(seed: number) {
  return once(`toy:robot:${seed % 3}`, () => {
    const [body, accent, trim] = ROBOT_COLOURS[seed % 3];
    const m = new Merger();
    // feet and legs
    for (const s of [-1, 1]) {
      m.add(rbox(0.11, 0.06, 0.15, 0.02, accent), trs([s * 0.07, 0.03, 0.01]));
      m.add(dowel(V(s * 0.07, 0.05, 0), V(s * 0.07, 0.24, 0), 0.032, body));
      m.add(ball(0.04, trim, 14, 10), trs([s * 0.07, 0.15, 0]));
    }
    // the torso, a chest panel with a dial and buttons
    m.add(rbox(0.3, 0.28, 0.2, 0.04, body), trs([0, 0.38, 0]));
    m.add(rbox(0.19, 0.15, 0.02, 0.015, trim), trs([0, 0.4, 0.1]));
    const dial = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 22).rotateX(Math.PI / 2);
    m.add(paint(dial, (x, y, z, out) => out.set(z > 0.004 && Math.abs(x) < 0.004 && y > 0 ? PAINT.black : PAINT.cream)), trs([-0.04, 0.42, 0.115]));
    for (const [bx, hex] of [
      [0.03, PAINT.red],
      [0.065, PAINT.yellow],
    ] as [number, string][])
      m.add(ball(0.014, hex, 10, 8), trs([bx, 0.43, 0.112]));
    for (let i = 0; i < 3; i++) m.add(rbox(0.1, 0.008, 0.006, 0.003, PAINT.black), trs([0.0, 0.36 - i * 0.018, 0.112]));
    // a belt line and the wind-up key on the back
    m.add(rbox(0.31, 0.03, 0.21, 0.012, accent), trs([0, 0.26, 0]));
    m.add(dowel(V(0, 0.4, -0.1), V(0, 0.4, -0.15), 0.01, PAINT.gold));
    const key = new THREE.TorusGeometry(0.03, 0.01, 8, 16);
    m.add(paint(key, (_x, _y, _z, out) => out.set(PAINT.gold)), trs([-0.032, 0.4, -0.16], [0, Math.PI / 2, 0]));
    m.add(paint(key.clone(), (_x, _y, _z, out) => out.set(PAINT.gold)), trs([0.032, 0.4, -0.16], [0, Math.PI / 2, 0]));
    // arms: shoulder balls, dowels bent at the elbow, claw hands
    for (const s of [-1, 1]) {
      m.add(ball(0.045, accent, 14, 10), trs([s * 0.18, 0.47, 0]));
      m.add(dowel(V(s * 0.19, 0.46, 0), V(s * 0.22, 0.34, 0.02), 0.026, body));
      m.add(ball(0.03, trim, 12, 8), trs([s * 0.22, 0.335, 0.02]));
      m.add(dowel(V(s * 0.22, 0.33, 0.02), V(s * 0.22, 0.25, 0.09), 0.024, body));
      const claw = new THREE.TorusGeometry(0.035, 0.012, 8, 16, Math.PI * 1.3);
      m.add(paint(claw, (_x, _y, _z, out) => out.set(accent)), trs([s * 0.22, 0.22, 0.11], [Math.PI / 2, 0, Math.PI * 0.85]));
    }
    // the neck and head: round eyes, a grille mouth, ear bolts, an antenna
    m.add(dowel(V(0, 0.52, 0), V(0, 0.57, 0), 0.035, trim));
    m.add(rbox(0.25, 0.2, 0.2, 0.05, body), trs([0, 0.66, 0]));
    for (const s of [-1, 1]) {
      const eye = new THREE.CylinderGeometry(0.036, 0.036, 0.02, 22).rotateX(Math.PI / 2);
      m.add(paint(eye, (x, y, z, out) => out.set(z > 0.004 && Math.hypot(x - s * 0.006, y + 0.004) < 0.016 ? PAINT.black : PAINT.white)), trs([s * 0.06, 0.685, 0.1]));
      m.add(dowel(V(s * 0.125, 0.66, 0), V(s * 0.155, 0.66, 0), 0.03, accent));
      m.add(ball(0.022, trim, 10, 8), trs([s * 0.16, 0.66, 0]));
    }
    for (let i = 0; i < 4; i++) m.add(rbox(0.008, 0.035, 0.01, 0.003, PAINT.black), trs([-0.03 + i * 0.02, 0.6, 0.1]));
    m.add(dowel(V(0, 0.76, 0), V(0, 0.84, 0), 0.008, PAINT.black));
    m.add(ball(0.022, PAINT.red, 12, 8), trs([0, 0.85, 0]));
    return m.build();
  });
}

// ---------- spinning tops ----------

const TOP_SHAPES: [number, number][][] = [
  // a classic pear top
  [
    [0, 0],
    [0.012, 0.004],
    [0.05, 0.04],
    [0.085, 0.085],
    [0.095, 0.11],
    [0.08, 0.13],
    [0.03, 0.142],
    [0.018, 0.15],
    [0.016, 0.2],
    [0.022, 0.21],
    [0, 0.214],
  ],
  // a wide disc top with a tall stem
  [
    [0, 0],
    [0.01, 0.005],
    [0.04, 0.025],
    [0.11, 0.06],
    [0.118, 0.075],
    [0.1, 0.085],
    [0.03, 0.095],
    [0.014, 0.1],
    [0.012, 0.18],
    [0.018, 0.19],
    [0, 0.193],
  ],
  // a tall peg top
  [
    [0, 0],
    [0.01, 0.01],
    [0.04, 0.06],
    [0.07, 0.13],
    [0.078, 0.17],
    [0.07, 0.19],
    [0.05, 0.2],
    [0.03, 0.22],
    [0, 0.226],
  ],
];
const TOP_STRIPES: string[][] = [
  [PAINT.red, PAINT.cream, PAINT.blue],
  [PAINT.yellow, PAINT.red, PAINT.green],
  [PAINT.teal, PAINT.cream, PAINT.orange],
  [PAINT.blue, PAINT.yellow, PAINT.red],
];

/** One spinning top: a shape and its painted bands. */
export function topGeometry(shape: number, stripes: number) {
  return once(`toy:top:${shape % 3}:${stripes % 4}`, () => {
    const n = 40;
    const cols = TOP_STRIPES[stripes % 4];
    return lathe(TOP_SHAPES[shape % 3], n, 36, (x, y, z, _a, out) => {
      const band = Math.floor(y * 38) % cols.length;
      out.set(cols[band]);
      // a natural wood tip and stem
      if (y < 0.02 || Math.hypot(x, z) < 0.024) out.set(PAINT.beech);
    });
  });
}

// ---------- peg dolls and soldiers ----------

const DOLLS = [
  { dress: PAINT.red, apron: PAINT.cream, hair: '#5a3218' },
  { dress: PAINT.blue, apron: PAINT.white, hair: '#e0b05a' },
  { dress: PAINT.green, apron: PAINT.yellow, hair: '#2a1a12' },
  { dress: PAINT.pink, apron: PAINT.cream, hair: '#8a4a22' },
];

/** A turned peg doll: a round head with painted hair and face, a dress with an apron. About 0.34 tall. */
export function dollGeometry(v: number) {
  return once(`toy:doll:${v % 4}`, () => {
    const d = DOLLS[v % 4];
    const n = 48;
    const body = lathe(
      [
        [0, 0],
        [0.075, 0],
        [0.082, 0.012],
        [0.078, 0.08],
        [0.064, 0.16],
        [0.05, 0.21],
        [0.045, 0.225],
        [0.06, 0.24],
        [0.075, 0.27],
        [0.078, 0.29],
        [0.07, 0.32],
        [0.045, 0.34],
        [0, 0.345],
      ],
      n,
      40,
      (x, y, z, _a, out) => {
        out.set(d.dress);
        // the apron at the front of the skirt
        if (z > 0.02 && y > 0.03 && y < 0.17 && Math.abs(x) < 0.05) out.set(d.apron);
        // the head: skin, with the hair round the back and top
        if (y > 0.228) {
          out.set(PAINT.skin);
          const hair = z < 0.01 || y > 0.305 + Math.abs(x) * 0.3;
          if (hair) out.set(d.hair);
        }
        if (y > 0.205 && y < 0.228) out.set(PAINT.white);
      },
    );
    const m = new Merger().add(body);
    // eyes, cheeks, a little mouth
    for (const s of [-1, 1]) {
      m.add(ball(0.007, PAINT.black, 8, 6), trs([s * 0.022, 0.284, 0.071]));
      m.add(ball(0.011, '#ee8a8a', 8, 6), trs([s * 0.04, 0.268, 0.064], [0, 0, 0], [1, 0.6, 0.4]));
    }
    m.add(ball(0.006, '#b0402a', 8, 6), trs([0, 0.262, 0.074], [0, 0, 0], [1.4, 0.6, 0.5]));
    return m.build();
  });
}

const SOLDIERS = [
  { coat: PAINT.red, trousers: PAINT.blue, hat: PAINT.black },
  { coat: PAINT.blue, trousers: PAINT.white, hat: PAINT.red },
  { coat: PAINT.green, trousers: PAINT.cream, hat: PAINT.black },
];

/** A toy soldier: a tall hat with a plume, a coat with gold buttons and a white cross-belt, boots. About 0.46 tall. */
export function soldierGeometry(v: number) {
  return once(`toy:soldier:${v % 3}`, () => {
    const s = SOLDIERS[v % 3];
    const n = 60;
    const body = lathe(
      [
        [0, 0],
        [0.07, 0],
        [0.075, 0.01],
        [0.07, 0.05],
        [0.062, 0.12],
        [0.068, 0.18],
        [0.07, 0.26],
        [0.06, 0.28],
        [0.045, 0.29],
        [0.05, 0.3],
        [0.058, 0.32],
        [0.06, 0.34],
        [0.056, 0.355],
        [0.06, 0.36],
        [0.062, 0.43],
        [0.055, 0.44],
        [0, 0.445],
      ],
      n,
      40,
      (x, y, z, _a, out) => {
        if (y < 0.05) out.set(PAINT.black);
        else if (y < 0.15) out.set(s.trousers);
        else if (y < 0.29) out.set(s.coat);
        else if (y < 0.355) out.set(PAINT.skin);
        else out.set(s.hat);
        // the belt and the cross-belt
        if (y > 0.15 && y < 0.17) out.set(PAINT.white);
        if (y > 0.17 && y < 0.285 && Math.abs(x - (y - 0.225) * 0.9) < 0.012 && z > 0) out.set(PAINT.white);
        // the hat's gold band
        if (y > 0.36 && y < 0.372) out.set(PAINT.gold);
      },
    );
    const m = new Merger().add(body);
    // gold buttons down the coat, a badge on the hat, eyes and rosy cheeks
    for (let i = 0; i < 3; i++) m.add(ball(0.007, PAINT.gold, 8, 6), trs([0, 0.2 + i * 0.03, 0.068 - i * 0.002]));
    m.add(ball(0.014, PAINT.gold, 10, 8), trs([0, 0.4, 0.06], [0, 0, 0], [1, 1, 0.5]));
    for (const sx of [-1, 1]) {
      m.add(ball(0.0065, PAINT.black, 8, 6), trs([sx * 0.02, 0.33, 0.054]));
      m.add(ball(0.01, '#ec8f86', 8, 6), trs([sx * 0.034, 0.316, 0.05], [0, 0, 0], [1, 0.7, 0.4]));
    }
    // arms at the sides and a plume on the hat
    for (const sx of [-1, 1]) m.add(dowel(V(sx * 0.075, 0.28, 0), V(sx * 0.08, 0.17, 0.01), 0.022, s.coat));
    m.add(ball(0.025, PAINT.white, 12, 8), trs([0, 0.46, 0.02], [0, 0, 0], [0.8, 1.2, 0.8]));
    m.add(dowel(V(0.08, 0.17, 0.02), V(0.08, 0.5, 0.0), 0.009, '#c0c4c8'));
    return m.build();
  });
}

// ---------- the biplane ----------

const PLANES = [
  { body: PAINT.red, wing: PAINT.yellow, trim: PAINT.blue },
  { body: PAINT.blue, wing: PAINT.cream, trim: PAINT.red },
  { body: PAINT.yellow, wing: PAINT.green, trim: PAINT.red },
];

/** A toy biplane with a turning propeller (separate), about 0.8 across the wings; the nose points +x. Returns the airframe and the propeller. */
export function planeGeometries(seed: number) {
  return once(`toy:plane:${seed % 3}`, () => {
    const p = PLANES[seed % 3];
    const m = new Merger();
    const n = 40;
    const body = lathe(
      [
        [0, -0.3],
        [0.025, -0.29],
        [0.05, -0.15],
        [0.07, 0.05],
        [0.078, 0.16],
        [0.07, 0.22],
        [0.05, 0.24],
        [0, 0.245],
      ],
      n,
      32,
      (_x, y, _z, _a, out) => {
        out.set(p.body);
        if (y > 0.2) out.set(p.trim);
        if (Math.abs(y + 0.05) < 0.015) out.set(PAINT.cream);
      },
    ).rotateZ(-Math.PI / 2);
    m.add(body, trs([0, 0.27, 0]));
    // the cockpit: a dark ring and the pilot's head in a leather cap
    m.add(new THREE.TorusGeometry(0.045, 0.012, 8, 20).rotateX(Math.PI / 2), trs([-0.05, 0.34, 0]), C(PAINT.black));
    m.add(ball(0.036, PAINT.skin, 14, 10), trs([-0.05, 0.37, 0]));
    m.add(new THREE.SphereGeometry(0.039, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), trs([-0.052, 0.375, 0]), C('#6a3a1e'));
    // wings, upper and lower, with rounded tips; four struts
    const wing = (w: number) => rbox(0.15, 0.022, w, 0.01, p.wing);
    m.add(wing(0.82), trs([0.06, 0.215, 0]));
    m.add(wing(0.9), trs([0.08, 0.43, 0]));
    for (const s of [-1, 1]) {
      // roundels on the upper wing: rings of colour
      const ring = new THREE.CylinderGeometry(0.045, 0.045, 0.004, 20);
      m.add(paint(ring, (x, _y, z, out) => out.set(Math.hypot(x, z) < 0.022 ? p.trim : PAINT.cream)), trs([0.08, 0.443, s * 0.32]));
      for (const zz of [0.22, 0.36]) m.add(dowel(V(0.08, 0.23, s * zz), V(0.1, 0.42, s * zz), 0.008, PAINT.beech));
    }
    // the tail: a stabiliser and a fin
    m.add(rbox(0.1, 0.016, 0.3, 0.008, p.wing), trs([-0.48, 0.28, 0]));
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.12, 0);
    fin.quadraticCurveTo(0.06, 0.06, 0.02, 0.13);
    fin.lineTo(-0.02, 0.13);
    fin.closePath();
    const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -0.007);
    m.add(paint(finG, (_x, y, _z, out) => out.set(y > 0.08 ? p.trim : p.body)), trs([-0.55, 0.29, 0]));
    // the undercarriage
    for (const s of [-1, 1]) {
      m.add(dowel(V(0.1, 0.21, s * 0.04), V(0.12, 0.07, s * 0.1), 0.009, PAINT.black));
      m.add(wheel(0.055, 0.03, PAINT.black, p.trim), trs([0.12, 0.055, s * 0.12]), undefined);
    }
    m.add(dowel(V(0.12, 0.055, -0.13), V(0.12, 0.055, 0.13), 0.007, PAINT.black));
    m.add(dowel(V(-0.5, 0.25, 0), V(-0.53, 0.2, 0), 0.008, PAINT.black));
    // the spinner; the propeller turns on its own
    m.add(
      lathe(
        [
          [0, 0],
          [0.035, 0],
          [0.03, 0.03],
          [0.012, 0.06],
          [0, 0.065],
        ],
        14,
        20,
        (_x, _y, _z, _a, out) => out.set(p.trim),
      ).rotateZ(-Math.PI / 2),
      trs([0.32, 0.27, 0]),
    );
    const prop = new Merger();
    for (const s of [-1, 1]) {
      const blade = new THREE.Shape();
      blade.moveTo(0, -0.012);
      blade.quadraticCurveTo(0.09, -0.028, 0.15, -0.015);
      blade.quadraticCurveTo(0.165, 0, 0.15, 0.015);
      blade.quadraticCurveTo(0.09, 0.028, 0, 0.012);
      blade.closePath();
      const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -0.004);
      bg.rotateX(s * 0.35);
      prop.add(paint(bg, (_x, _y, _z, out) => out.set(PAINT.walnut)), trs([0, 0, 0], [0, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2]));
    }
    // the propeller spins about x at the nose
    const propG = prop.build().rotateY(Math.PI / 2);
    return { body: m.build(), prop: propG, hub: [0.335, 0.27, 0] as [number, number, number] };
  });
}

// ---------- pull-along duck ----------

/** A yellow duck on a wheeled board with a pull string. About 0.42 long. */
export function duckGeometry(seed: number) {
  return once(`toy:duck:${seed % 2}`, () => {
    const body = seed % 2 ? '#f0f0ea' : PAINT.yellow;
    const sdf: SDF = (() => {
      const torso = ellipsoid(0, 0.15, 0, 0.13, 0.08, 0.09);
      const tail = cone(-0.1, 0.16, 0, -0.17, 0.22, 0, 0.05, 0.015);
      const neck = cone(0.07, 0.18, 0, 0.1, 0.25, 0, 0.05, 0.045);
      const head = sphere(0.105, 0.28, 0, 0.06);
      const bill = ellipsoid(0.17, 0.265, 0, 0.045, 0.014, 0.03);
      return (x, y, z) => {
        let d = smin(torso(x, y, z), tail(x, y, z), 0.04);
        d = smin(d, neck(x, y, z), 0.04);
        d = smin(d, head(x, y, z), 0.03);
        d = smin(d, bill(x, y, z), 0.012);
        return d;
      };
    })();
    const g = cached(`toy-duck-${seed % 2}`, () =>
      meshSDF(sdf, {
        min: [-0.2, 0.06, -0.11],
        max: [0.23, 0.35, 0.11],
        cell: 0.0055,
        paint: (x, y, z, _nx, _ny, _nz, out) => {
          out.set(body);
          if (x > 0.13 && y < 0.285 && y > 0.245) out.set(PAINT.orange);
          // the wing painted on each side
          if (Math.abs(z) > 0.06 && x < 0.04 && x > -0.09 && y > 0.12 && y < 0.2) mix(out, out, col(seed % 2 ? '#c8c8c0' : '#d89a20'), 0.6);
          if (Math.hypot(x - 0.125, y - 0.3, Math.abs(z) - 0.045) < 0.012) out.set(PAINT.black);
        },
      }),
    );
    mapUV(g, (x, y) => [x * 3, y * 3]);
    const m = new Merger().add(g);
    m.add(rbox(0.3, 0.03, 0.14, 0.012, PAINT.teal), trs([0, 0.065, 0]));
    for (const s of [-1, 1]) for (const wx of [-0.09, 0.09]) m.add(wheel(0.045, 0.025, PAINT.red, PAINT.beech), trs([wx, 0.045, s * 0.08]), undefined);
    // the pull string, ending in a red bead
    const str = tubeThrough([V(0.15, 0.065, 0), V(0.24, 0.03, 0.03), V(0.32, 0.006, 0.0), V(0.4, 0.005, -0.05)], () => 0.004, 16, 5).geometry;
    m.add(paint(str, (_x, _y, _z, out) => out.set('#d8c8a8')));
    m.add(ball(0.02, PAINT.red, 10, 8), trs([0.41, 0.02, -0.055]));
    return m.build();
  });
}

// ---------- sailing boat ----------

/** A little sailing boat on a stand: a painted hull, a mast and boom, a striped sail (a separate cloth). About 0.5 tall. */
export function boatGeometries(seed: number) {
  return once(`toy:boat:${seed % 3}`, () => {
    const hullCol = [PAINT.blue, PAINT.red, PAINT.green][seed % 3];
    const s = new THREE.Shape();
    s.moveTo(-0.2, 0.07);
    s.lineTo(0.17, 0.07);
    s.quadraticCurveTo(0.25, 0.07, 0.27, 0.1);
    s.quadraticCurveTo(0.2, 0.0, 0.08, -0.01);
    s.lineTo(-0.17, -0.005);
    s.quadraticCurveTo(-0.215, 0.0, -0.2, 0.07);
    const hull = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.025, bevelSegments: 4, curveSegments: 12 }).translate(0, 0, -0.035);
    const m = new Merger();
    m.add(paint(hull, (_x, y, _z, out) => out.set(y > 0.06 ? PAINT.cream : y > 0.035 ? PAINT.white : hullCol)), trs([0, 0.14, 0]));
    m.add(rbox(0.36, 0.012, 0.09, 0.005, PAINT.beech), trs([0.02, 0.215, 0]));
    m.add(dowel(V(0.02, 0.21, 0), V(0.02, 0.62, 0), 0.008, PAINT.beech));
    m.add(dowel(V(0.02, 0.27, 0), V(-0.2, 0.27, 0), 0.006, PAINT.beech));
    m.add(ball(0.012, PAINT.red, 8, 6), trs([0.02, 0.63, 0]));
    // a stand: a turned base and two forks
    m.add(
      lathe(
        [
          [0, 0],
          [0.07, 0],
          [0.075, 0.01],
          [0.06, 0.025],
          [0, 0.03],
        ],
        12,
        24,
        (_x, _y, _z, _a, out) => out.set(PAINT.walnut),
      ),
    );
    for (const sx of [-0.06, 0.06]) m.add(dowel(V(sx, 0.02, 0), V(sx, 0.14, 0), 0.008, PAINT.walnut));
    // the sail: a cloth triangle (double-sided material), striped
    const sail = new THREE.BufferGeometry();
    const pts: number[] = [];
    const uv: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const N = 8;
    const stripe = [C(PAINT.cream), C(seed % 3 === 1 ? PAINT.blue : PAINT.red)];
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const v = j / N;
        const x = 0.015 - u * 0.21 * (1 - v * 0.95);
        const y = 0.285 + v * 0.32;
        const bulge = Math.sin(u * Math.PI) * 0.025 * (1 - v);
        pts.push(x, y, bulge);
        uv.push(u, v);
        const c = stripe[Math.floor(v * 5) % 2];
        cols.push(c.r, c.g, c.b);
        if (i < N && j < N) {
          const a = j * (N + 1) + i;
          idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1);
        }
      }
    sail.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sail.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sail.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sail.setIndex(idx);
    sail.computeVertexNormals();
    return { body: m.build(), sail: twoSided(sail) };
  });
}

// ---------- blocks and a ball ----------

/** A small stack of building blocks with an inset square on each face. */
export function blocksGeometry(seed: number) {
  return once(`toy:blocks:${seed % 3}`, () => {
    const r = rand(seed + 11);
    const m = new Merger();
    const cols = [PAINT.red, PAINT.blue, PAINT.yellow, PAINT.green, PAINT.orange, PAINT.teal];
    const s = 0.11;
    const place: [number, number, number][] = [
      [-0.065, 0, 0],
      [0.065, 0, 0.01],
      [0.0, s, 0.005],
      [0.0, 2 * s, 0],
      [0.15, 0, -0.03],
    ];
    place.forEach(([x, y, z]) => {
      const c = cols[Math.floor(r() * cols.length)];
      const cube = new RoundedBoxGeometry(s - 0.004, s - 0.004, s - 0.004, 3, 0.012);
      boxUV(cube, 3);
      paint(cube, (px, py, pz, out) => {
        out.set(c);
        // a cream inset square on each face
        const ax = Math.abs(px);
        const ay = Math.abs(py);
        const az = Math.abs(pz);
        const m2 = Math.max(ax, ay, az);
        const a = m2 === ax ? Math.max(ay, az) : m2 === ay ? Math.max(ax, az) : Math.max(ax, ay);
        if (a < s * 0.3) out.set(PAINT.cream);
      });
      m.add(cube, trs([x, y + s / 2, z], [0, (r() - 0.5) * 0.4, 0]));
    });
    return m.build();
  });
}

/** A ball painted in six segments. */
export function ballGeometry(seed: number) {
  return once(`toy:ball:${seed % 2}`, () => {
    const a = seed % 2 ? PAINT.blue : PAINT.red;
    const b = PAINT.cream;
    const g = new THREE.SphereGeometry(0.11, 32, 20).translate(0, 0.11, 0);
    return paint(g, (x, y, z, out) => {
      const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6);
      out.set(seg % 2 ? a : b);
      if (Math.abs(y - 0.11) > 0.1) out.set(PAINT.yellow);
    });
  });
}

// ---------- the rocking horse ----------

const HORSES = [
  { coat: '#a8aeb4', spot: '#eceae4', mane: '#2a2622', saddle: '#a82a22', trim: PAINT.gold },
  { coat: '#8a4a26', spot: '#8a4a26', mane: '#2a1a10', saddle: '#2c4a7a', trim: PAINT.cream },
  { coat: '#e2bf8e', spot: '#e2bf8e', mane: '#5a3a20', saddle: '#2f6a46', trim: PAINT.red },
];

/**
 * A bow rocking horse: a sculpted horse in a flying gallop on two long bowed
 * rockers. Built facing +x (its profile toward +z), about 1.75 long and 1.4
 * tall at scale 1. `cell` sets the sculpting resolution (shelf ones are coarse).
 * Returns the horse (painted), its mane and tail, and the rockers.
 */
export function rockingHorseGeometries(seed: number, cell = 0.011) {
  const v = seed % 3;
  return once(`toy:horse:${v}:${cell}`, () => {
    const h = HORSES[v];
    const legs: SDF[] = [];
    for (const sz of [-1, 1]) {
      legs.push(chain([[0.24, 0.8, sz * 0.075], [0.4, 0.55, sz * 0.085], [0.56, 0.3, sz * 0.09], [0.6, 0.22, sz * 0.09]], 0.055, 0.032, 0.03));
      legs.push(chain([[-0.26, 0.8, sz * 0.075], [-0.42, 0.56, sz * 0.085], [-0.56, 0.32, sz * 0.09], [-0.6, 0.22, sz * 0.09]], 0.06, 0.032, 0.03));
    }
    const body = ellipsoid(0, 0.86, 0, 0.36, 0.165, 0.145);
    const chest = ellipsoid(0.24, 0.88, 0, 0.16, 0.16, 0.135);
    const rump = ellipsoid(-0.26, 0.9, 0, 0.17, 0.16, 0.145);
    const neck = cone(0.3, 0.95, 0, 0.48, 1.24, 0, 0.11, 0.075);
    const jaw = ellipsoid(0.51, 1.24, 0, 0.1, 0.085, 0.07);
    const muzzle = cone(0.52, 1.24, 0, 0.72, 1.12, 0, 0.07, 0.055);
    const ears = [cone(0.47, 1.31, 0.035, 0.44, 1.41, 0.04, 0.025, 0.008), cone(0.47, 1.31, -0.035, 0.44, 1.41, -0.04, 0.025, 0.008)];
    const sdf: SDF = (x, y, z) => {
      let d = smin(body(x, y, z), chest(x, y, z), 0.08);
      d = smin(d, rump(x, y, z), 0.08);
      d = smin(d, neck(x, y, z), 0.07);
      d = smin(d, jaw(x, y, z), 0.05);
      d = smin(d, muzzle(x, y, z), 0.04);
      for (const e of ears) d = smin(d, e(x, y, z), 0.02);
      for (const l of legs) d = smin(d, l(x, y, z), 0.05);
      return d;
    };
    const coat = C(h.coat);
    const spot = C(h.spot);
    const dark = C('#2a2624');
    const saddle = C(h.saddle);
    const trim = C(h.trim);
    const horse = cached(`toy-horse-${v}-${cell}`, () =>
      meshSDF(sdf, {
        min: [-0.68, 0.17, -0.2],
        max: [0.8, 1.45, 0.2],
        cell,
        paint: (x, y, z, _nx, ny, _nz, out) => {
          out.copy(coat);
          // dapples: pale rounds on the grey (or nothing on the plain coats)
          const dap = worley3(x * 12, y * 12, z * 12);
          mix(out, out, spot, smoothstep(0.42, 0.22, dap) * 0.85 * smoothstep(0.55, 0.7, y));
          // darker legs toward the hooves, black hooves, a darker muzzle
          mix(out, out, dark, smoothstep(0.6, 0.3, y) * 0.35);
          if (y < 0.27) out.copy(dark);
          if (x > 0.62) mix(out, out, dark, 0.6);
          // a white blaze down the chestnut's face
          if (v === 1 && x > 0.5 && Math.abs(z) < 0.02 && ny > 0.2) out.set('#f2ece0');
          // the saddle and its gold edge, the bridle
          const onBack = Math.abs(x + 0.02) < 0.15 && y > 0.94;
          if (onBack) out.copy(saddle);
          if (Math.abs(x + 0.02) < 0.165 && Math.abs(x + 0.02) > 0.145 && y > 0.92) out.copy(trim);
          if (Math.abs(x - 0.6 - (y - 1.18) * 0.4) < 0.014 && y > 1.1 && y < 1.3) out.copy(saddle);
          if (x > 0.5 && Math.abs(y - 1.16 - (x - 0.6) * -0.6) < 0.012) out.copy(saddle);
          // eyes and nostrils
          if (Math.hypot(x - 0.52, y - 1.29, Math.abs(z) - 0.06) < 0.02) out.set('#120e0c');
          if (Math.hypot(x - 0.72, y - 1.12, Math.abs(z) - 0.03) < 0.012) out.set('#3a1e18');
        },
      }),
    );
    mapUV(horse, (x, y, z) => [x * 2 + z, y * 2]);
    // the mane and tail: locks of real hair
    const r = rand(v + 31);
    const hair = new Merger();
    const maneCol = C(h.mane);
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const bx = 0.32 + t * 0.17;
      const by = 1.02 + t * 0.3;
      const side = i % 2 ? 1 : -1;
      const len = 0.16 + r() * 0.07 - t * 0.05;
      hair.add(tubeThrough([V(bx - 0.04, by + 0.03, 0), V(bx - 0.08, by - len * 0.3, side * 0.06), V(bx - 0.1, by - len, side * 0.09)], (s) => 0.02 * (1 - s * 0.7), 8, 6).geometry, undefined, maneCol);
    }
    hair.add(tubeThrough([V(0.47, 1.36, 0), V(0.55, 1.33, 0), V(0.6, 1.27, 0)], (s) => 0.025 * (1 - s * 0.6), 8, 6).geometry, undefined, maneCol);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sp = 0.03;
      hair.add(tubeThrough([V(-0.42, 0.98, Math.sin(a) * 0.01), V(-0.56, 0.93 + Math.cos(a) * sp, Math.sin(a) * sp), V(-0.66, 0.72 + Math.cos(a) * sp, Math.sin(a) * sp * 1.6), V(-0.69 - r() * 0.04, 0.5 + r() * 0.06, Math.sin(a) * sp * 2)], (s) => 0.022 * (1 - s * 0.55), 14, 6).geometry, undefined, maneCol);
    }
    // the reins, from the bit to the saddle, and stirrups
    const reins = new Merger();
    for (const sz of [-1, 1]) {
      reins.add(tubeThrough([V(0.66, 1.15, sz * 0.05), V(0.45, 1.06, sz * 0.12), V(0.2, 1.0, sz * 0.13), V(0.1, 1.02, sz * 0.12)], () => 0.008, 20, 5).geometry, undefined, saddle);
      reins.add(tubeThrough([V(-0.02, 1.0, sz * 0.15), V(-0.02, 0.84, sz * 0.165), V(-0.02, 0.76, sz * 0.165)], () => 0.007, 8, 5).geometry, undefined, saddle);
      reins.add(new THREE.TorusGeometry(0.03, 0.008, 6, 14), trs([-0.02, 0.73, sz * 0.165], [0, Math.PI / 2, 0]), C('#c8ccd0'));
      reins.add(ball(0.016, '#c8ccd0', 8, 6), trs([0.68, 1.15, sz * 0.055]));
    }
    // the bow rockers: two long arcs joined by stretchers, the hooves screwed on through little platforms
    const rock = new Merger();
    const R = 1.9;
    const arc = (sz: number) => {
      const s = new THREE.Shape();
      const a0 = -0.5;
      const a1 = 0.5;
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const a = a0 + (a1 - a0) * (i / N);
        const x = Math.sin(a) * R;
        const y = R - Math.cos(a) * R;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      for (let i = N; i >= 0; i--) {
        const a = a0 + (a1 - a0) * (i / N);
        s.lineTo(Math.sin(a) * (R - 0.075), R - Math.cos(a) * (R - 0.075));
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 4 });
      g.translate(0, 0.012, sz - 0.02);
      return g;
    };
    const wood = C(v === 2 ? PAINT.walnut : '#a8261e');
    for (const sz of [-0.13, 0.13]) rock.add(boxUV(arc(sz), 2), undefined, wood);
    for (const sx of [-0.62, 0, 0.62]) {
      const y = R - Math.sqrt(R * R - sx * sx) + 0.07;
      rock.add(boxUV(new RoundedBoxGeometry(0.06, 0.04, 0.3, 2, 0.012), 2), trs([sx, y + 0.012, 0]), C(v === 2 ? PAINT.beech : PAINT.cream));
    }
    for (const sx of [-0.6, 0.6])
      for (const sz of [-0.09, 0.09]) {
        const y = R - Math.sqrt(R * R - sx * sx) + 0.075;
        rock.add(boxUV(new RoundedBoxGeometry(0.12, 0.05, 0.08, 2, 0.015), 2), trs([sx, y + 0.03, sz]), wood);
      }
    return { horse, hair: hair.build(), reins: reins.build(), rockers: rock.build() };
  });
}

// ---------- the teddy bear ----------

const TEDDIES = [
  { fur: '#c8955a', pad: '#ecd6b0', bow: '#b8322a' },
  { fur: '#8a5a36', pad: '#d8b890', bow: '#2c5a8a' },
  { fur: '#e8dcc4', pad: '#f4e8d8', bow: '#3a7a4a' },
];

/** A jointed teddy bear sitting up, about 0.55 tall: fur, felt pads, a stitched nose, a ribbon bow. Returns the fur body and the shiny bits (eyes, nose). */
export function teddyGeometries(seed: number, cell = 0.007) {
  const v = seed % 3;
  return once(`toy:teddy:${v}:${cell}`, () => {
    const t = TEDDIES[v];
    const body = ellipsoid(0, 0.19, 0, 0.13, 0.16, 0.11);
    const belly = ellipsoid(0, 0.15, 0.04, 0.11, 0.11, 0.08);
    const head = sphere(0, 0.42, 0.01, 0.12);
    const snout = ellipsoid(0, 0.4, 0.11, 0.06, 0.045, 0.05);
    const ears = [sphere(-0.095, 0.52, -0.005, 0.045), sphere(0.095, 0.52, -0.005, 0.045)];
    const arms = [chain([[-0.12, 0.27, 0.0], [-0.17, 0.18, 0.05], [-0.15, 0.1, 0.1]], 0.045, 0.04, 0.02), chain([[0.12, 0.27, 0.0], [0.17, 0.18, 0.05], [0.15, 0.1, 0.1]], 0.045, 0.04, 0.02)];
    const legs = [chain([[-0.08, 0.07, 0.02], [-0.1, 0.05, 0.14], [-0.1, 0.06, 0.2]], 0.055, 0.05, 0.02), chain([[0.08, 0.07, 0.02], [0.1, 0.05, 0.14], [0.1, 0.06, 0.2]], 0.055, 0.05, 0.02)];
    const sdf: SDF = (x, y, z) => {
      let d = smin(body(x, y, z), belly(x, y, z), 0.05);
      d = smin(d, head(x, y, z), 0.04);
      d = smin(d, snout(x, y, z), 0.03);
      for (const e of ears) d = smin(d, e(x, y, z), 0.015);
      for (const a of arms) d = smin(d, a(x, y, z), 0.025);
      for (const l of legs) d = smin(d, l(x, y, z), 0.03);
      // a soft fuzz
      d += 0.0025 * noise3(x * 90, y * 90, z * 90);
      return Math.max(d, -y);
    };
    const fur = C(t.fur);
    const pad = C(t.pad);
    const g = cached(`toy-teddy-${v}-${cell}`, () =>
      meshSDF(sdf, {
        min: [-0.22, -0.01, -0.13],
        max: [0.22, 0.58, 0.27],
        cell,
        paint: (x, y, z, _nx, _ny, nz, out) => {
          out.copy(fur).multiplyScalar(0.88 + 0.22 * fbm3(x * 40, y * 40, z * 40));
          // felt pads on the soles and paws, a paler snout and inner ears
          const sole = z > 0.2 && nz > 0.5 && y < 0.12;
          const paw = Math.abs(x) > 0.12 && y < 0.13 && y > 0.06 && nz > 0.3 && z > 0.08;
          if (sole || paw) out.copy(pad);
          if (Math.hypot(x, y - 0.395, z - 0.12) < 0.05) mix(out, out, pad, 0.8);
          if (y > 0.5 && Math.abs(x) > 0.07 && nz > 0.3) mix(out, out, pad, 0.6);
        },
      }),
    );
    const shiny = new Merger();
    for (const s of [-1, 1]) shiny.add(ball(0.016, '#0e0a08', 12, 8), trs([s * 0.045, 0.45, 0.112]));
    shiny.add(ball(0.022, '#1c1210', 12, 8), trs([0, 0.42, 0.155], [0, 0, 0], [1.3, 0.9, 0.8]));
    shiny.add(dowel(V(0, 0.395, 0.155), V(0, 0.375, 0.152), 0.004, '#1c1210'));
    // the ribbon bow at the neck
    const bow = new Merger();
    bow.add(new THREE.TorusGeometry(0.105, 0.012, 6, 30).rotateX(Math.PI / 2), trs([0, 0.32, 0.02]), C(t.bow));
    for (const s of [-1, 1]) bow.add(ball(0.035, t.bow, 12, 8), trs([s * 0.035, 0.32, 0.115], [0, 0, s * 0.4], [1.2, 0.65, 0.4]));
    bow.add(ball(0.016, t.bow, 10, 8), trs([0, 0.32, 0.12]));
    return { fur: g, shiny: shiny.build(), bow: bow.build() };
  });
}
