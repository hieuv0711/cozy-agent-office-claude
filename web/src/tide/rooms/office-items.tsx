import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { meshSDF, type SDF } from '../../tank/sdf';
import type { CatalogItem, Placed } from '../types';
import { BACK_OPENINGS, ROOM, SIDEBOARD } from './office-dims';
import { anglepoiseGeometries, deskMats } from './office-desks';
import { C, Merger, mix, noise3, omat, once, paint, paintLathe, plank, rand, smoothLathe, smoothstep, tex, trs, V, variant, woodTex } from './office-kit';
import { Monstera, SnakePlant, TrailingPothos } from './office-plants';
import { bookRow, bookStack, mugGeometry, propMats, smallPlant } from './office-props';
import { occlusion, sdRBox, smin } from './office-sdf';
import { Corkboard, FramedArt, WallClock, Whiteboard } from './office-wall-items';

// The things you can add to the office (kinds prefixed o-), and how the room
// starts out. Each item stands on y = 0 facing +z (a wall item has its back
// on the wall at the origin), is drawn about 1.6x real size like the people's
// props, varies with its seed, and carries no light of its own (adding a
// light at runtime would recompile every material): lamps glow through bloom.
// No screens, no words.

function itemMats() {
  return {
    brass: omat('i:brass', () => new THREE.MeshStandardMaterial({ color: '#c09a54', metalness: 0.92, roughness: 0.28, side: THREE.DoubleSide })),
    chrome: omat('i:chrome', () => new THREE.MeshStandardMaterial({ color: '#e0e2e6', metalness: 1, roughness: 0.15 })),
    steel: omat('i:steel', () => new THREE.MeshStandardMaterial({ color: '#1c1b1a', metalness: 0.6, roughness: 0.45 })),
    oak: omat('i:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('o-item-oak', { w: 512, h: 256, light: '#d0a068', dark: '#7a4a26', planks: 1, rings: 8, seed: 181, joints: false, seams: 0 }), roughness: 0.5, vertexColors: true })),
    bentwood: omat('i:bentwood', () => new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.38, vertexColors: true })),
    glow: omat('i:opal', () => new THREE.MeshStandardMaterial({ color: '#fff6e8', emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 1.25, roughness: 0.35 })),
    bulb: omat('i:bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffdcaa').multiplyScalar(2), toneMapped: false })),
    water: omat('i:water', () => new THREE.MeshPhysicalMaterial({ color: '#7ab4e0', transparent: true, opacity: 0.4, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })),
    waterIn: omat('i:water-in', () => new THREE.MeshStandardMaterial({ color: '#3a7ab8', transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false })),
    cloth: omat('i:cloth', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
  };
}

// ---------- the globe floor lamp ----------

function globeLampGeometries() {
  return once('office:globe-lamp', () => {
    const base = smoothLathe(
      [
        [0, 0],
        [0.2, 0],
        [0.21, 0.015],
        [0.205, 0.045],
        [0.18, 0.055],
        [0, 0.055],
      ],
      14,
      48,
    );
    paint(base, (x, y, z, out) => {
      // white marble with grey veins
      const vein = Math.abs(noise3(x * 6 + noise3(x * 14, y * 14, z * 14) * 0.8, y * 6, z * 6));
      out.set('#ece6dc');
      mix(out, out, C('#7a7672'), smoothstep(0.08, 0.0, vein) * 0.6);
    });
    const brass = new Merger();
    brass.add(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 20), trs([0, 0.07, 0]));
    brass.add(new THREE.CylinderGeometry(0.013, 0.013, 1.86, 12), trs([0, 0.07 + 0.93, 0]));
    brass.add(new THREE.TorusGeometry(0.02, 0.006, 8, 16).rotateX(Math.PI / 2), trs([0, 1.0, 0]));
    brass.add(smoothLathe([[0, 0], [0.07, 0], [0.075, 0.02], [0.06, 0.04], [0, 0.045]], 8, 24), trs([0, 1.92, 0]));
    const globe = new THREE.SphereGeometry(0.2, 40, 24).translate(0, 2.13, 0);
    return { base, brass: brass.build(), globe };
  });
}

function GlobeFloorLamp({ seed }: { seed: number }) {
  const g = globeLampGeometries();
  const m = itemMats();
  const metal = [m.brass, m.steel, m.chrome][variant(seed, 3)];
  const p = propMats();
  return (
    <group>
      <mesh geometry={g.base} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={g.brass} material={metal} castShadow />
      <mesh geometry={g.globe} material={m.glow} />
    </group>
  );
}

// ---------- the anglepoise ----------

function Anglepoise({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const g = anglepoiseGeometries(v);
  const d = deskMats();
  return (
    <group>
      <mesh geometry={g.enamel} material={d.enamel} castShadow receiveShadow />
      <mesh geometry={g.steel} material={d.chairMetal} castShadow />
      <mesh geometry={g.bulb} material={d.bulb} />
    </group>
  );
}

// ---------- a freestanding bookshelf ----------

function bookshelfGeometries(v: number) {
  return once(`office:bookshelf:${v}`, () => {
    const W = 1.3;
    const D = 0.42;
    const H = 2.42;
    const ys = [0.08, 0.6, 1.12, 1.64, 2.16, H - 0.03];
    const steel = new Merger();
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) steel.add(plank(0.035, H, 0.035, 0.006, 1, 1), trs([sx * (W / 2 - 0.018), H / 2, sz * (D / 2 - 0.018)]));
    // a cross brace on the back and rails under each shelf's front and back
    const diag = Math.hypot(W, H * 0.4);
    for (const s of [-1, 1]) steel.add(plank(diag, 0.018, 0.008, 0.003, 1, 1), trs([0, H * 0.72, -D / 2 + 0.01], [0, 0, s * Math.atan2(H * 0.4, W)]));
    const wood = new Merger();
    const r = rand(v + 5);
    for (const y of ys) {
      wood.add(plank(W - 0.02, 0.035, D - 0.02, 0.008, [1 / 1.4, 1 / 1.4], 1, [r() * 3, r() * 3]), trs([0, y, 0]));
      for (const sz of [-1, 1]) steel.add(plank(W - 0.06, 0.02, 0.02, 0.004, 1, 1), trs([0, y - 0.03, sz * (D / 2 - 0.018)]));
    }
    const vc = new Merger();
    const glaze = new Merger();
    const leaf = new Merger();
    const top = (i: number) => ys[i] + 0.0175;
    vc.add(bookRow(0.85, 500 + v, { hMin: 0.32, hMax: 0.44, d: 0.3 }), trs([-0.6, top(0), -0.02]));
    vc.add(bookRow(0.6, 510 + v, { hMin: 0.28, hMax: 0.4, d: 0.28 }), trs([-0.6, top(1), -0.02]));
    vc.add(bookStack(3, 520 + v, 0.8), trs([0.35, top(1), 0]));
    vc.add(bookRow(1.15, 530 + v, { hMin: 0.3, hMax: 0.44, d: 0.3 }), trs([-0.6, top(2), -0.02]));
    const plant = smallPlant(v + 2);
    const pm = trs([-0.35, top(3), 0]);
    (plant.glazed ? glaze : vc).add(plant.pot, pm);
    vc.add(plant.soil, pm);
    leaf.add(plant.plant, pm);
    vc.add(bookRow(0.55, 540 + v, { hMin: 0.3, hMax: 0.4, d: 0.28 }), trs([0.0, top(3), -0.02]));
    glaze.add(mugGeometry(['#2e4a3e', '#c0603a', '#d8cdb4'][v % 3]), trs([0.42, top(4), 0.05], [0, 2.5, 0]));
    vc.add(bookStack(2, 550 + v, 0.75), trs([-0.3, top(4), 0]));
    // storage boxes on the bottom shelf's end
    const box = plank(0.32, 0.26, 0.3, 0.01, 1, 1);
    paint(box, (x, y, z, out) => {
      out.set(['#b89a6a', '#2e3a4a', '#8a3a2a'][v % 3]).multiplyScalar(0.9 + 0.1 * noise3(x * 10, y * 10, z * 10));
      if (z > 0.14 && Math.abs(x) < 0.07 && Math.abs(y) < 0.035) out.set('#ece4d2');
    });
    vc.add(box, trs([0.42, top(0) + 0.13, 0]));
    return { steel: steel.build(), wood: wood.build(), vc: vc.build(), glaze: glaze.build(), leaf: leaf.build() };
  });
}

function Bookshelf({ seed }: { seed: number }) {
  const g = bookshelfGeometries(variant(seed, 3));
  const m = itemMats();
  const p = propMats();
  return (
    <group>
      <mesh geometry={g.steel} material={m.steel} castShadow receiveShadow />
      <mesh geometry={g.wood} material={m.oak} castShadow receiveShadow />
      <mesh geometry={g.vc} material={p.vc} castShadow receiveShadow />
      <mesh geometry={g.glaze} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={g.leaf} material={p.leaf} castShadow />
    </group>
  );
}

// ---------- the espresso machine ----------

const MACHINE_COLOURS = ['#e8dcc4', '#9a2a22', '#3a5a4a'];

function espressoGeometries(v: number) {
  return once(`office:espresso:${v}`, () => {
    const body = new Merger();
    const chrome = new Merger();
    const black = new Merger();
    const col = C(MACHINE_COLOURS[v % MACHINE_COLOURS.length]);
    const W = 0.54;
    const D = 0.44;
    // the enamelled body over a chrome base, and a chrome top with the cup rail
    body.add(paint(plank(W, 0.42, D, 0.05, 1, 3), (x, y, z, out) => out.copy(col).multiplyScalar(0.92 + 0.08 * noise3(x * 10, y * 10, z * 10))), trs([0, 0.31, 0]));
    chrome.add(plank(W + 0.01, 0.06, D + 0.01, 0.02, 1, 2), trs([0, 0.07, 0]));
    chrome.add(plank(W + 0.01, 0.025, D + 0.01, 0.01, 1, 2), trs([0, 0.535, 0]));
    const rail: THREE.Vector3[] = [];
    for (const [x, z] of [
      [-0.24, -0.18],
      [0.24, -0.18],
      [0.24, 0.18],
      [-0.24, 0.18],
      [-0.24, -0.18],
    ] as [number, number][])
      rail.push(V(x, 0.6, z));
    chrome.add(tubeThrough(rail, () => 0.008, 40, 6).geometry);
    for (const [x, z] of [
      [-0.24, -0.18],
      [0.24, -0.18],
      [0.24, 0.18],
      [-0.24, 0.18],
    ] as [number, number][])
      chrome.add(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 6), trs([x, 0.57, z]));
    // the group head and the portafilter with its black handle
    chrome.add(smoothLathe([[0, 0], [0.07, 0], [0.075, 0.02], [0.06, 0.08], [0.05, 0.1], [0, 0.1]], 12, 28).rotateX(Math.PI).translate(0, 0.38, 0), trs([0, 0, D / 2 + 0.06]));
    chrome.add(plank(0.08, 0.06, 0.1, 0.02, 1, 2), trs([0, 0.4, D / 2 + 0.01]));
    chrome.add(smoothLathe([[0, 0], [0.06, 0], [0.065, 0.04], [0.06, 0.05], [0, 0.05]], 8, 24), trs([0, 0.23, D / 2 + 0.06]));
    black.add(tubeThrough([V(0, 0.26, D / 2 + 0.11), V(0.02, 0.255, D / 2 + 0.22), V(0.03, 0.25, D / 2 + 0.3)], (t) => 0.018 + t * 0.006, 10, 10).geometry);
    // the steam wand and its knob, the hot water knob
    chrome.add(tubeThrough([V(0.2, 0.42, D / 2), V(0.23, 0.38, D / 2 + 0.06), V(0.24, 0.2, D / 2 + 0.08), V(0.235, 0.14, D / 2 + 0.07)], () => 0.008, 16, 6).geometry);
    for (const x of [-0.2, 0.2]) black.add(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 16).rotateX(Math.PI / 2), trs([x, 0.47, D / 2 + 0.02]));
    // a pressure gauge (a plain dial) and the drip tray grate
    chrome.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24).rotateX(Math.PI / 2), trs([-0.12, 0.43, D / 2 + 0.005]));
    const dial = paint(new THREE.CircleGeometry(0.042, 24), (x, y, _z, out) => {
      out.set('#f4efe4');
      const a = Math.atan2(y, x);
      if (Math.hypot(x, y) > 0.03 && Math.sin(a * 12) > 0.6) out.set('#1a1a1a');
    });
    body.add(dial, trs([-0.12, 0.43, D / 2 + 0.016]));
    const grate = plank(W - 0.04, 0.012, 0.16, 0.004, 1, 1);
    paint(grate, (x, _y, _z, out) => out.setScalar(Math.sin(x * 160) > 0.3 ? 1 : 0.35));
    chrome.add(grate, trs([0, 0.105, D / 2 + 0.06]));
    chrome.add(plank(W - 0.02, 0.04, 0.18, 0.01, 1, 1), trs([0, 0.08, D / 2 + 0.06]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) black.add(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 12), trs([sx * 0.22, 0.02, sz * 0.16]));
    // cups: two upside down on top, one under the spout
    const cup = smoothLathe(
      [
        [0, 0],
        [0.03, 0],
        [0.04, 0.01],
        [0.045, 0.07],
        [0.047, 0.075],
        [0.04, 0.075],
        [0.038, 0.012],
        [0, 0.012],
      ],
      12,
      20,
    );
    paintLathe(cup, 12, (_x, _y, _z, _a, out) => out.set('#f0ebe0'));
    const cups = new Merger();
    cups.add(cup, trs([-0.1, 0.62, -0.05], [Math.PI, 0, 0]));
    cups.add(cup, trs([0.06, 0.62, 0.02], [Math.PI, 0, 0]));
    cups.add(cup, trs([0, 0.115, D / 2 + 0.06]));
    return { body: body.build(), chrome: chrome.build(), black: paint(black.build(), (_x, _y, _z, out) => out.set('#181818')), cups: cups.build() };
  });
}

function CoffeeMachine({ seed }: { seed: number }) {
  const g = espressoGeometries(variant(seed, 3));
  const m = itemMats();
  const p = propMats();
  return (
    <group>
      <mesh geometry={g.body} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={g.chrome} material={m.chrome} castShadow />
      <mesh geometry={g.black} material={p.vc} castShadow />
      <mesh geometry={g.cups} material={p.glaze} castShadow />
    </group>
  );
}

// ---------- the water cooler ----------

function coolerGeometries() {
  return once('office:cooler', () => {
    const W = 0.44;
    const H = 1.02;
    const body = new Merger();
    const shell = plank(W, H, W, 0.05, 1, 3);
    paint(shell, (x, y, z, out) => {
      out.set('#e8e4da').multiplyScalar(0.94 + 0.06 * noise3(x * 8, y * 8, z * 8));
      // the recessed niche for the taps, and vents low on the sides
      if (z > W / 2 - 0.01 && Math.abs(x) < 0.15 && y > 0.04 && y < 0.3) out.set('#3a3a3c');
      if (Math.abs(x) > W / 2 - 0.01 && y < -0.3 && Math.sin(y * 120) > 0.5) out.multiplyScalar(0.6);
    });
    body.add(shell, trs([0, H / 2, 0]));
    // the collar the bottle sits in
    body.add(paint(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 32), (_x, _y, _z, out) => out.set('#d8d4ca')), trs([0, H + 0.03, 0]));
    // taps (cold blue, hot red), a drip tray
    const taps = new Merger();
    for (const [x, c] of [
      [-0.07, '#2a6ac8'],
      [0.07, '#c83a2a'],
    ] as [number, string][]) {
      taps.add(paint(plank(0.06, 0.07, 0.06, 0.015, 1, 1), (_x, _y, _z, out) => out.set(c)), trs([x, H / 2 + 0.26, W / 2 + 0.02]));
      taps.add(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 10), (_x, _y, _z, out) => out.set('#d8d8d8')), trs([x, H / 2 + 0.21, W / 2 + 0.03]));
    }
    taps.add(paint(plank(0.3, 0.025, 0.1, 0.01, 1, 1), (x, _y, _z, out) => out.setScalar(Math.sin(x * 140) > 0.2 ? 0.75 : 0.3)), trs([0, H / 2 + 0.06, W / 2 + 0.03]));
    // a paper cup dispenser on the side, cups showing at its mouth
    taps.add(paint(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 20), (_x, _y, _z, out) => out.set('#d8d4ca')), trs([W / 2 + 0.05, H * 0.62, 0.05]));
    taps.add(paint(new THREE.CylinderGeometry(0.04, 0.03, 0.06, 20, 1, true), (_x, _y, _z, out) => out.set('#f6f4ee')), trs([W / 2 + 0.05, H * 0.62 - 0.19, 0.05]));
    // the bottle: a five-gallon jug standing on its neck, half full
    const n = 40;
    const jug = smoothLathe(
      [
        [0.05, 0.0],
        [0.06, 0.06],
        [0.1, 0.1],
        [0.165, 0.16],
        [0.17, 0.24],
        [0.163, 0.28],
        [0.17, 0.32],
        [0.17, 0.42],
        [0.16, 0.48],
        [0.1, 0.51],
        [0, 0.515],
      ],
      n,
      40,
    ).translate(0, H + 0.02, 0);
    const water = smoothLathe(
      [
        [0.04, 0.0],
        [0.05, 0.06],
        [0.09, 0.1],
        [0.155, 0.16],
        [0.16, 0.24],
        [0.155, 0.27],
        [0, 0.27],
      ],
      20,
      32,
    ).translate(0, H + 0.03, 0);
    return { body: body.build(), taps: taps.build(), jug, water };
  });
}

function WaterCooler(_: { seed: number }) {
  const g = coolerGeometries();
  const m = itemMats();
  const p = propMats();
  return (
    <group>
      <mesh geometry={g.body} material={p.vc} castShadow receiveShadow />
      <mesh geometry={g.taps} material={p.glaze} castShadow />
      <mesh geometry={g.water} material={m.waterIn} renderOrder={2} />
      <mesh geometry={g.jug} material={m.water} renderOrder={3} castShadow />
    </group>
  );
}

// ---------- a pile of books ----------

function BookPile({ seed }: { seed: number }) {
  const v = variant(seed, 4);
  const g = useMemo(() => once(`office:book-pile:${v}`, () => bookStack(3 + (v % 3), 600 + v * 7, 1)), [v]);
  const p = propMats();
  return (
    <group rotation={[0, v * 0.5, 0]}>
      <mesh geometry={g} material={p.vc} castShadow receiveShadow />
    </group>
  );
}

// ---------- the globe ----------

/** An old schoolroom globe: parchment seas, ochre and sage continents of no particular world, a grid of meridians. */
function globeTex() {
  return tex(
    'o-globe',
    1024,
    512,
    (g, w, h) => {
      const sea = g.createLinearGradient(0, 0, 0, h);
      sea.addColorStop(0, '#9ab8a8');
      sea.addColorStop(0.5, '#b8cdb4');
      sea.addColorStop(1, '#9ab8a8');
      g.fillStyle = sea;
      g.fillRect(0, 0, w, h);
      const img = g.getImageData(0, 0, w, h);
      const d = img.data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const lon = (x / w) * Math.PI * 2;
          const lat = (y / h - 0.5) * Math.PI;
          const px = Math.cos(lat) * Math.cos(lon);
          const py = Math.sin(lat);
          const pz = Math.cos(lat) * Math.sin(lon);
          const n = noise3(px * 1.8 + 3, py * 1.8, pz * 1.8) * 0.7 + noise3(px * 5, py * 5, pz * 5) * 0.3;
          const i = (y * w + x) * 4;
          if (n > 0.12) {
            const k = smoothstep(0.12, 0.4, n);
            d[i] = 200 - k * 40;
            d[i + 1] = 170 - k * 20;
            d[i + 2] = 110 - k * 20;
          } else if (n > 0.09) {
            d[i] = 120;
            d[i + 1] = 100;
            d[i + 2] = 70;
          }
        }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(80,60,40,0.3)';
      g.lineWidth = 1;
      for (let k = 1; k < 12; k++) {
        g.beginPath();
        g.moveTo((k / 12) * w, 0);
        g.lineTo((k / 12) * w, h);
        g.stroke();
      }
      for (let k = 1; k < 6; k++) {
        g.beginPath();
        g.moveTo(0, (k / 6) * h);
        g.lineTo(w, (k / 6) * h);
        g.stroke();
      }
      // age: a varnish yellowing
      g.fillStyle = 'rgba(180,140,60,0.12)';
      g.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );
}

function globeGeometries() {
  return once('office:globe', () => {
    const stand = smoothLathe(
      [
        [0, 0],
        [0.13, 0],
        [0.14, 0.02],
        [0.12, 0.045],
        [0.05, 0.06],
        [0.035, 0.1],
        [0.045, 0.14],
        [0.025, 0.2],
        [0, 0.2],
      ],
      20,
      32,
    );
    const R = 0.17;
    const cy = 0.2 + R + 0.03;
    // a half meridian ring holding the tilted globe
    const ring = new THREE.TorusGeometry(R + 0.02, 0.008, 8, 48, Math.PI).rotateZ(-Math.PI / 2).rotateZ(0.41).translate(0, cy, 0);
    const pins = new Merger();
    for (const s of [-1, 1]) pins.add(new THREE.SphereGeometry(0.012, 10, 8), trs([Math.sin(0.41) * (R + 0.02) * s, cy + Math.cos(0.41) * (R + 0.02) * s, 0]));
    const sphere = new THREE.SphereGeometry(R, 48, 32).rotateZ(-0.41).translate(0, cy, 0);
    return { stand, ring: new Merger().add(ring).add(pins.build()).build(), sphere };
  });
}

function Globe({ seed }: { seed: number }) {
  const g = globeGeometries();
  const m = itemMats();
  const face = omat('i:globe', () => new THREE.MeshPhysicalMaterial({ map: globeTex(), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  return (
    <group rotation={[0, seed * 1.3, 0]}>
      <mesh geometry={g.stand} material={m.oak} castShadow receiveShadow />
      <mesh geometry={g.ring} material={m.brass} castShadow />
      <mesh geometry={g.sphere} material={face} castShadow />
    </group>
  );
}

// ---------- a rug ----------

const RUGS = ['berber', 'kilim', 'indigo'] as const;

function rugTex(kind: (typeof RUGS)[number]) {
  return tex(
    `o-rug-${kind}`,
    1024,
    680,
    (g, w, h) => {
      const r = rand(kind.length * 31);
      if (kind === 'berber') {
        g.fillStyle = '#e6dcc6';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2a2420';
        g.lineWidth = 7;
        const s = 120;
        for (let x = -s; x < w + s; x += s)
          for (let y = -s; y < h + s; y += s * 0.8) {
            g.beginPath();
            g.moveTo(x, y + s * 0.4);
            g.lineTo(x + s / 2, y);
            g.lineTo(x + s, y + s * 0.4);
            g.lineTo(x + s / 2, y + s * 0.8);
            g.closePath();
            g.stroke();
          }
      } else if (kind === 'kilim') {
        const bands = ['#a8442a', '#2a3a5a', '#d8a040', '#e6d6b6', '#6a2a2a', '#3a5a4a'];
        let y = 0;
        while (y < h) {
          const bh = 20 + r() * 60;
          g.fillStyle = bands[Math.floor(r() * bands.length)];
          g.fillRect(0, y, w, bh);
          if (bh > 45) {
            g.fillStyle = bands[Math.floor(r() * bands.length)];
            for (let x = 0; x < w; x += 40) {
              g.beginPath();
              g.moveTo(x, y + bh / 2);
              g.lineTo(x + 20, y + 6);
              g.lineTo(x + 40, y + bh / 2);
              g.lineTo(x + 20, y + bh - 6);
              g.fill();
            }
          }
          y += bh;
        }
      } else {
        g.fillStyle = '#2a3a5a';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#d8ccb0';
        g.lineWidth = 16;
        g.strokeRect(40, 40, w - 80, h - 80);
        g.lineWidth = 5;
        g.strokeRect(80, 80, w - 160, h - 160);
        // a stepped lozenge medallion, small crosses scattered over the field
        for (const [k, c] of [
          [1, '#d8ccb0'],
          [0.78, '#a84a3a'],
          [0.56, '#2a3a5a'],
          [0.34, '#d8a040'],
        ] as [number, string][]) {
          const rx = w * 0.26 * k;
          const ry = h * 0.3 * k;
          const st = 6;
          g.fillStyle = c;
          g.beginPath();
          for (let i = 0; i <= st * 4; i++) {
            const q = Math.floor(i / st);
            const f = (i % st) / st;
            const corners = [
              [0, -ry],
              [rx, 0],
              [0, ry],
              [-rx, 0],
              [0, -ry],
            ];
            const [ax, ay] = corners[q];
            const [bx, by] = corners[Math.min(4, q + 1)];
            const px = ax + (bx - ax) * f;
            const py = ay + (by - ay) * f;
            const sx = Math.round(px / 14) * 14;
            const sy = Math.round(py / 14) * 14;
            if (i === 0) g.moveTo(w / 2 + sx, h / 2 + sy);
            else {
              g.lineTo(w / 2 + sx, h / 2 + py);
              g.lineTo(w / 2 + sx, h / 2 + sy);
            }
          }
          g.closePath();
          g.fill();
        }
        g.fillStyle = 'rgba(216,204,176,0.8)';
        for (let i = 0; i < 40; i++) {
          const x = 110 + r() * (w - 220);
          const y = 110 + r() * (h - 220);
          if (Math.abs(x - w / 2) / (w * 0.3) + Math.abs(y - h / 2) / (h * 0.34) < 1) continue;
          g.fillRect(x - 9, y - 2, 18, 4);
          g.fillRect(x - 2, y - 9, 4, 18);
        }
      }
      for (let y = 0; y < h; y += 3) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,245,230' : '0,0,0'},${0.03 + r() * 0.04})`;
        g.fillRect(0, y, w, 1.5);
      }
      for (let i = 0; i < 16000; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,245,230' : '20,10,10'},${0.05 + r() * 0.07})`;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    },
    { repeat: false },
  );
}

function Rug({ seed }: { seed: number }) {
  const kind = RUGS[variant(seed, RUGS.length)];
  const mat = omat(`i:rug-${kind}`, () => new THREE.MeshStandardMaterial({ map: rugTex(kind), roughness: 0.95 }));
  const p = propMats();
  const g = useMemo(
    () =>
      once('office:item-rug', () => {
        const W = 2.6;
        const D = 1.7;
        const plane = new THREE.PlaneGeometry(W, D, 24, 16).rotateX(-Math.PI / 2);
        const pos = plane.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const edge = Math.min(W / 2 - Math.abs(pos.getX(i)), D / 2 - Math.abs(pos.getZ(i)));
          pos.setY(i, 0.012 * smoothstep(0, 0.04, edge));
        }
        plane.computeVertexNormals();
        const fringe = new Merger();
        for (const s of [-1, 1]) for (let z = -D / 2 + 0.03; z < D / 2; z += 0.04) fringe.add(tubeThrough([V((s * W) / 2, 0.006, z), V(s * (W / 2 + 0.1), 0.003, z + 0.01)], () => 0.005, 2, 3).geometry);
        return { plane, fringe: paint(fringe.build(), (_x, _y, _z, out) => out.set('#d8c8a6')) };
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={g.plane} material={mat} receiveShadow />
      <mesh geometry={g.fringe} material={p.vc} />
    </group>
  );
}

// ---------- the coat rack ----------

/** A soft canvas tote, hanging flat (in its own frame, facing +z). */
function sdBag() {
  return once('office:tote', () => {
    const f: SDF = (x, y, z) => {
      const t = Math.min(1, Math.max(0, (0.2 - y) / 0.4));
      return sdRBox(x, y, z, 0.15 + 0.01 * t, 0.2, 0.02 + 0.03 * t, 0.018);
    };
    return meshSDF(f, { min: [-0.2, -0.24, -0.08], max: [0.2, 0.24, 0.08], cell: 0.016, lipschitz: 1.6 });
  });
}

function coatRackGeometries(v: number) {
  return once(`office:coat-rack:${v}`, () => {
    const H = 2.05;
    const wood = new Merger();
    wood.add(
      smoothLathe(
        [
          [0, 0.14],
          [0.03, 0.14],
          [0.026, 0.6],
          [0.032, 0.64],
          [0.025, 0.7],
          [0.024, H - 0.12],
          [0.034, H - 0.08],
          [0.03, H - 0.04],
          [0.04, H],
          [0, H + 0.04],
        ],
        30,
        16,
      ),
    );
    // three bentwood legs and six hooks curling out at the top
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      wood.add(tubeThrough([V(c * 0.02, 0.62, s * 0.02), V(c * 0.12, 0.35, s * 0.12), V(c * 0.3, 0.06, s * 0.3), V(c * 0.36, 0.0, s * 0.36)], () => 0.016, 20, 8).geometry);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const y = H - 0.2 - (i % 2) * 0.12;
      wood.add(tubeThrough([V(c * 0.02, y, s * 0.02), V(c * 0.14, y + 0.03, s * 0.14), V(c * 0.2, y + 0.12, s * 0.2), V(c * 0.17, y + 0.17, s * 0.17)], () => 0.012, 16, 6).geometry);
      wood.add(new THREE.SphereGeometry(0.018, 10, 8), trs([c * 0.17, y + 0.17, s * 0.17]));
    }
    // a coat on the hook toward the front: shoulders, a collar, sleeves hanging down its sides
    const coatCol = C(['#8a6a44', '#2e3a4e', '#5a4a3e'][v % 3]);
    const hookA = Math.PI / 3;
    const hookTop = H - 0.2 + 0.15;
    const top = hookTop - 0.08;
    const coatF: SDF = (x, y, z) => {
      const t = Math.min(1, Math.max(0, (top - y) / 1.0));
      const hw = 0.19 + 0.05 * t;
      const hd = 0.05 + 0.035 * t;
      const zz = z - 0.03 * t;
      const shoulder = top - Math.max(0, Math.abs(x) - 0.06) * 0.35;
      const dx = Math.abs(x) - hw;
      const dz = Math.abs(zz) - hd;
      const across = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - 0.025;
      const body = Math.max(across, Math.max(y - shoulder, top - 1.0 - y));
      const collar = sdRBox(x, y - top - 0.02, z, 0.11, 0.05, 0.06, 0.03);
      let sleeves = Infinity;
      for (const s of [-1, 1]) {
        const ax = s * 0.2;
        const bx = s * 0.235;
        const ay = top - 0.05;
        const by = top - 0.62;
        const tt = Math.max(0, Math.min(1, (ay - y) / (ay - by)));
        const px = ax + (bx - ax) * tt;
        const py = ay + (by - ay) * tt;
        sleeves = Math.min(sleeves, Math.hypot(x - px, y - py, z - 0.01) - (0.06 + 0.012 * tt));
      }
      return smin(body, Math.min(collar, sleeves), 0.03);
    };
    const coat = meshSDF(coatF, {
      min: [-0.34, top - 1.05, -0.16],
      max: [0.34, top + 0.1, 0.16],
      cell: 0.016,
      lipschitz: 1.8,
      paint: (x, y, z, nx, ny, nz, out) => {
        out.copy(coatCol).multiplyScalar(0.55 + 0.45 * occlusion(coatF, x, y, z, nx, ny, nz, 0.035));
        // soft vertical folds, the collar a shade darker, a belt
        out.multiplyScalar(0.93 + 0.07 * Math.sin(x * 38 + Math.sin(y * 3)));
        if (y > top - 0.02) out.multiplyScalar(0.82);
        if (Math.abs(y - (top - 0.5)) < 0.025 && Math.abs(x) < 0.22) out.multiplyScalar(0.7);
      },
    });
    // hang it from its hook: the coat's back toward the pole
    coat.applyMatrix4(trs([Math.cos(hookA) * 0.2, 0, Math.sin(hookA) * 0.2], [0, Math.PI / 2 - hookA, 0]));
    // a scarf over the hook on the far side, a canvas tote on another, the hat on a third
    const scarf = new Merger();
    const sa = (4 * Math.PI) / 3;
    const sc = Math.cos(sa);
    const ss = Math.sin(sa);
    const scarfCol = C(['#a8402a', '#d8a040', '#3a6a5a'][(v + 1) % 3]);
    const sy = H - 0.2 + 0.15;
    for (const k of [-1, 1]) {
      const pts = [V(sc * 0.17, sy, ss * 0.17), V(sc * 0.2 + k * 0.04 * ss, sy - 0.2, ss * 0.2 - k * 0.04 * sc), V(sc * 0.22 + k * 0.06 * ss, sy - 0.62 - (k + 1) * 0.06, ss * 0.22 - k * 0.06 * sc)];
      scarf.add(tubeThrough(pts, () => 0.03, 16, 8).geometry);
    }
    const scarfG = paint(scarf.build(), (x, y, _z, out) => out.copy(scarfCol).multiplyScalar(Math.sin(y * 30) > 0.6 ? 0.7 : 1 + 0.05 * noise3(x * 20, y * 20, 1)));
    const ta = (5 * Math.PI) / 3;
    const tote = new Merger();
    const toteY = H - 0.32 + 0.15;
    tote.add(paint(sdBag(), (_x, y, _z, out) => out.set('#d8cbb0').multiplyScalar(0.85 + 0.15 * Math.min(1, y + 1))), trs([Math.cos(ta) * 0.24, toteY - 0.42, Math.sin(ta) * 0.24], [0, Math.PI / 2 - ta, 0]));
    tote.add(paint(tubeThrough([V(Math.cos(ta) * 0.24 - 0.08, toteY - 0.26, Math.sin(ta) * 0.24), V(Math.cos(ta) * 0.18, toteY + 0.02, Math.sin(ta) * 0.18), V(Math.cos(ta) * 0.24 + 0.08, toteY - 0.26, Math.sin(ta) * 0.24)], () => 0.01, 12, 5).geometry, (_x, _y, _z, out) => out.set('#a89a80')));
    const hat = smoothLathe(
      [
        [0, 0],
        [0.2, 0.0],
        [0.21, 0.012],
        [0.15, 0.02],
        [0.11, 0.03],
        [0.105, 0.12],
        [0.08, 0.15],
        [0, 0.135],
      ],
      20,
      32,
    );
    paintLathe(hat, 20, (_x, y, _z, _a, out) => out.set(y > 0.025 && y < 0.05 ? '#1a1410' : '#4a3a2e'));
    const hA = Math.PI;
    hat.applyMatrix4(trs([Math.cos(hA) * 0.2, H - 0.32 + 0.12, Math.sin(hA) * 0.2], [0.2, 0, 0.5]));
    // an umbrella leaning at the foot
    const umb = smoothLathe(
      [
        [0, 0],
        [0.01, 0.02],
        [0.05, 0.25],
        [0.055, 0.6],
        [0.02, 0.75],
        [0.008, 0.85],
        [0, 0.86],
      ],
      20,
      16,
    );
    paintLathe(umb, 20, (_x, _y, _z, _a, out) => out.set('#1e2430'));
    const handle = tubeThrough([V(0, 0.86, 0), V(0, 0.95, 0), V(0.03, 1.0, 0), V(0.07, 0.98, 0), V(0.075, 0.94, 0)], () => 0.014, 12, 6).geometry;
    paint(handle, (_x, _y, _z, out) => out.set('#6a3a1a'));
    const umbrella = new Merger().add(umb).add(handle).build();
    return { wood: wood.build(), coat, scarf: new Merger().add(scarfG).add(tote.build()).build(), hat, umbrella };
  });
}

function CoatRack({ seed }: { seed: number }) {
  const g = coatRackGeometries(variant(seed, 3));
  const m = itemMats();
  return (
    <group>
      <mesh geometry={g.wood} material={m.bentwood} castShadow receiveShadow />
      <mesh geometry={g.coat} material={m.cloth} castShadow receiveShadow />
      <mesh geometry={g.scarf} material={m.cloth} castShadow />
      <mesh geometry={g.hat} material={m.cloth} castShadow />
      <mesh geometry={g.umbrella} material={m.cloth} position={[0.32, 0, 0.18]} rotation={[0.05, 0.6, -0.18]} castShadow />
    </group>
  );
}

// ---------- the catalog ----------

export const OFFICE_CATALOG: CatalogItem[] = [
  { kind: 'o-monstera', label: 'Monstera', group: 'Plants', surfaces: ['floor', 'top'], radius: 0.6, height: 1.6, Render: Monstera },
  { kind: 'o-snake-plant', label: 'Snake plant', group: 'Plants', surfaces: ['floor', 'top', 'shelf', 'sill'], radius: 0.3, height: 1.05, Render: SnakePlant },
  { kind: 'o-pothos', label: 'Trailing pothos', group: 'Plants', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.45, height: 0.5, Render: TrailingPothos },
  { kind: 'o-floor-lamp', label: 'Globe floor lamp', group: 'Lighting', surfaces: ['floor'], radius: 0.25, height: 2.35, Render: GlobeFloorLamp },
  { kind: 'o-desk-lamp', label: 'Desk lamp', group: 'Lighting', surfaces: ['top', 'shelf'], radius: 0.3, height: 0.95, Render: Anglepoise },
  { kind: 'o-bookshelf', label: 'Bookshelf', group: 'Furniture', surfaces: ['floor'], radius: 0.7, height: 2.45, Render: Bookshelf },
  { kind: 'o-rug', label: 'Rug', group: 'Furniture', surfaces: ['floor'], radius: 1.4, height: 0.03, minScale: 0.6, maxScale: 1.6, Render: Rug },
  { kind: 'o-coat-rack', label: 'Coat rack', group: 'Furniture', surfaces: ['floor'], radius: 0.4, height: 2.15, Render: CoatRack },
  { kind: 'o-water-cooler', label: 'Water cooler', group: 'Furniture', surfaces: ['floor'], radius: 0.35, height: 1.55, Render: WaterCooler },
  { kind: 'o-coffee', label: 'Espresso machine', group: 'Kitchen', surfaces: ['top', 'shelf'], radius: 0.36, height: 0.68, Render: CoffeeMachine },
  { kind: 'o-art', label: 'Framed print', group: 'Wall', surfaces: ['wall'], radius: 0.5, height: 1.0, Render: FramedArt },
  { kind: 'o-clock', label: 'Wall clock', group: 'Wall', surfaces: ['wall'], radius: 0.36, height: 0.75, Render: WallClock },
  { kind: 'o-whiteboard', label: 'Whiteboard', group: 'Wall', surfaces: ['wall'], radius: 0.9, height: 1.25, Render: Whiteboard },
  { kind: 'o-corkboard', label: 'Corkboard', group: 'Wall', surfaces: ['wall'], radius: 0.7, height: 1.0, Render: Corkboard },
  { kind: 'o-books', label: 'Stack of books', group: 'Decor', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.25, height: 0.4, Render: BookPile },
  { kind: 'o-globe', label: 'Globe', group: 'Decor', surfaces: ['top', 'shelf'], radius: 0.22, height: 0.62, Render: Globe },
];

// ---------- the default layout ----------

const BACK = ROOM.back + 0.01;
const SILL = BACK_OPENINGS[0].y0;
const SILL_Z = ROOM.back - 0.06;
const at = (id: string, kind: string, p: [number, number, number], r = 0, seed = 1, s = 1): Placed => ({ id, kind, p, r, s, seed });

/** Where things start out: every one in the wide shot, clear of the stations, the walkways and the lounge paths. */
export const OFFICE_DEFAULT: Placed[] = [
  // a monstera at the front left by the bookcase
  at('o1', 'o-monstera', [-9.25, 0, 0.55], 0.4, 0),
  // on the back wall: prints between the windows, a corkboard by the door, the clock over the door
  at('o3', 'o-art', [-2.0, 4.35, BACK], 0, 0),
  at('o4', 'o-art', [2.0, 4.35, BACK], 0, 3),
  at('o5', 'o-corkboard', [7.0, 2.5, BACK], 0, 0),
  at('o6', 'o-clock', [9.9, 5.35, BACK], 0, 0),
  // the window sills: a snake plant and a pile of books, silhouetted against the night
  at('o7', 'o-snake-plant', [-4.75, SILL, SILL_Z], 0.3, 1, 0.95),
  at('o8', 'o-books', [3.1, SILL, SILL_Z], 0.25, 2),
  // the back desk's ends: the globe on the left, a trailing pothos on the right
  at('o9', 'o-globe', [-6.55, 0.84, -5.72], 0.4, 0),
  at('o10', 'o-pothos', [6.45, 0.84, -5.85], 0, 0),
  // the coffee machine on the lounge sideboard
  at('o11', 'o-coffee', [(SIDEBOARD.x0 + SIDEBOARD.x1) / 2, SIDEBOARD.top, (SIDEBOARD.z0 + SIDEBOARD.z1) / 2], 0, 0),
  // by the door: a coat rack, the water cooler; on the right wall a whiteboard and a bookshelf behind the reception
  at('o12', 'o-coat-rack', [11.95, 0, 1.45], -0.5, 0),
  at('o13', 'o-water-cooler', [11.95, 0, -5.75], -0.6, 0),
  at('o15', 'o-bookshelf', [12.26, 0, -1.75], -Math.PI / 2, 1),
];

