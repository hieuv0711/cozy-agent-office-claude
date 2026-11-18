import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { BACK } from '../kitchen/plan';
import { CEIL, HOOD, ROOM, SHELVES } from './ramen-dims';
import { brushedRough, brushedTex, brushMarks, C, fbm3, mat, Merger, mix, moulding, noise3, once, paint, paintFlat, paintLathe, plank, rand, repeated, smoothLathe, smoothstep, tex, trs, V, woodTex } from './ramen-kit';
import { Bottle, type BottleKind, bowlStackGeometry, Jar, type JarKind, propMats, Steam, tinGeometry } from './ramen-props';

// The back line against the back wall: a stainless counter with the two big
// broth pots simmering on low burners at its ends, open shelves of bowls,
// jars and bottles on the tiles between them, a long canopy hood over it all
// with its warm work lights, and the order tickets clipped along its edge.

const BZ = ROOM.back;

export function backMats() {
  return {
    steel: mat('b:steel', () => new THREE.MeshStandardMaterial({ map: repeated(brushedTex(), 1, 1, 'back-steel'), roughnessMap: brushedRough(), color: '#d4d7dc', metalness: 0.72, roughness: 0.42, vertexColors: true })),
    darkSteel: mat('b:dark-steel', () => new THREE.MeshStandardMaterial({ color: '#4a4d52', metalness: 0.7, roughness: 0.5 })),
    pot: mat('b:pot', () => new THREE.MeshStandardMaterial({ map: repeated(brushedTex(), 2, 1, 'pot-steel'), color: '#c8ccd2', metalness: 0.85, roughness: 0.34, vertexColors: true })),
    iron: mat('b:iron', () => new THREE.MeshStandardMaterial({ color: '#211d1a', metalness: 0.5, roughness: 0.62, vertexColors: true })),
    flame: mat('b:flame', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#4f8dff').multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.9 })),
    broth: mat('b:broth', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 })),
    shelf: mat('b:shelf', () => new THREE.MeshStandardMaterial({ map: woodTex('shelf', { w: 1024, h: 256, light: '#8a5a34', dark: '#33190b', planks: 1, rings: 8, seed: 51, joints: false, seams: 0 }), roughness: 0.55, vertexColors: true })),
    bracket: mat('b:bracket', () => new THREE.MeshStandardMaterial({ color: '#1e1b19', metalness: 0.55, roughness: 0.5 })),
    lens: mat('b:lens', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe0b0').multiplyScalar(2.2), toneMapped: false })),
    filter: mat('b:filter', () => new THREE.MeshStandardMaterial({ color: '#5b5d60', metalness: 0.8, roughness: 0.45 })),
    ticket: mat('b:ticket', () => new THREE.MeshStandardMaterial({ map: ticketTex(), roughness: 0.9, side: THREE.DoubleSide })),
    handle: mat('b:handle', () => new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6 })),
  };
}
type BMats = ReturnType<typeof backMats>;

// ---------- the counter ----------

function counterGeometry() {
  const body = new Merger();
  const top = new Merger();
  const x0 = BACK.x0;
  const x1 = BACK.x1;
  const z0 = BZ;
  const z1 = BACK.front;
  const w = x1 - x0;
  // the top: a sheet with a rolled front edge and an upstand against the tiles
  top.add(plank(w, 0.05, z1 - z0, 0.012, [1 / 1.6, 1 / 1.6]), trs([(x0 + x1) / 2, BACK.top - 0.025, (z0 + z1) / 2]));
  top.add(tubeThrough([V(x0, BACK.top - 0.035, z1), V(x1, BACK.top - 0.035, z1)], () => 0.035, 2, 14).geometry);
  top.add(plank(w, 0.14, 0.03, 0.01, [1 / 1.6, 1 / 1.6]), trs([(x0 + x1) / 2, BACK.top + 0.07, z0 + 0.02]));
  // the cabinet: doors with long bar pulls, a recessed black plinth
  const doors = 6;
  const dw = (w - 0.1) / doors;
  for (let i = 0; i < doors; i++) {
    const cx = x0 + 0.05 + dw * (i + 0.5);
    body.add(plank(dw - 0.03, BACK.top - 0.24, 0.04, 0.012, [1 / 1.6, 1 / 1.6]), trs([cx, 0.16 + (BACK.top - 0.24) / 2 - 0.01, z1 - 0.02]));
    const hx = cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.12);
    body.add(tubeThrough([V(hx, 0.34, z1 + 0.005), V(hx, 0.34, z1 + 0.05), V(hx, 0.7, z1 + 0.05), V(hx, 0.7, z1 + 0.005)], () => 0.014, 16, 8).geometry);
  }
  body.add(plank(w, BACK.top - 0.05, 0.04), trs([(x0 + x1) / 2, (BACK.top - 0.05) / 2, z1 - 0.06]));
  const plinth = plank(w - 0.04, 0.13, 0.04, 0.01);
  paintFlat(plinth, '#2a2a2c');
  body.add(plinth, trs([(x0 + x1) / 2, 0.065, z1 - 0.09]));
  // ends
  for (const x of [x0 + 0.015, x1 - 0.015]) body.add(plank(0.03, BACK.top - 0.05, z1 - z0, 0.01), trs([x, (BACK.top - 0.05) / 2, (z0 + z1) / 2]));
  const smudge = (g: THREE.BufferGeometry) => paint(g, (x, y, z, out) => out.setScalar(0.9 + 0.14 * fbm3(x * 2, y * 2, z * 2 + 4)));
  return { body: smudge(body.build()), top: smudge(top.build()) };
}

// ---------- broth pots ----------

const POT_R = 0.5;
const POT_H = 0.92;
const STAND_H = 0.2;
/** The broth pots stand at the free ends of the back line. */
export const POTS: [number, number][] = [
  [BACK.x0 + 1.2, (BZ + BACK.front) / 2],
  [BACK.x1 - 1.2, (BZ + BACK.front) / 2],
];

function potGeometries() {
  return once('ramen:broth-pot', () => {
    const n = 90;
    const body = smoothLathe(
      [
        [0, 0],
        [POT_R - 0.04, 0],
        [POT_R, 0.03],
        [POT_R + 0.005, 0.2],
        [POT_R + 0.005, POT_H - 0.04],
        [POT_R + 0.03, POT_H - 0.01],
        [POT_R + 0.02, POT_H + 0.008],
        [POT_R - 0.01, POT_H - 0.005],
        [POT_R - 0.015, 0.1],
        [0, 0.08],
      ],
      n,
      72,
    );
    // soot and heat colour low on the outside, a tide line of broth inside
    paintLathe(body, n, (x, y, z, along, out) => {
      out.setRGB(1, 1, 1);
      if (along < 0.6) {
        mix(out, out, C('#3a2e26'), smoothstep(0.3, 0.0, y) * 0.75);
        mix(out, out, C('#b88a58'), smoothstep(0.25, 0.08, y) * 0.2);
        mix(out, out, C('#8a7a62'), smoothstep(0.3, 0.8, fbm3(x * 3, y * 6, z * 3)) * 0.3);
        // dribbles down from the rim
        mix(out, out, C('#c9a46a'), smoothstep(0.55, 0.85, noise3(Math.atan2(z, x) * 6, y * 1.5, 1)) * smoothstep(POT_H - 0.4, POT_H - 0.05, y) * 0.5);
      } else out.multiplyScalar(0.7);
    });
    // two loop handles
    const handles = new Merger();
    for (const s of [-1, 1]) {
      const pts = [V(s * (POT_R - 0.01), POT_H - 0.22, -0.13), V(s * (POT_R + 0.1), POT_H - 0.2, -0.12), V(s * (POT_R + 0.13), POT_H - 0.18, 0), V(s * (POT_R + 0.1), POT_H - 0.2, 0.12), V(s * (POT_R - 0.01), POT_H - 0.22, 0.13)];
      handles.add(tubeThrough(pts, () => 0.022, 24, 8).geometry);
    }
    // a lid, pushed half off to let the steam out
    const lid = smoothLathe(
      [
        [0, 0.07],
        [0.06, 0.07],
        [0.07, 0.04],
        [0.2, 0.035],
        [POT_R - 0.05, 0.012],
        [POT_R + 0.025, 0.0],
        [POT_R + 0.03, -0.012],
        [0, -0.012],
      ],
      40,
      64,
    );
    paint(lid, (x, _y, z, out) => out.setScalar(0.85 + 0.15 * fbm3(x * 4, 2, z * 4)));
    // the broth: rich and cloudy, with fat beading on top and a few bones breaking the surface
    const broth = new THREE.RingGeometry(0.0001, POT_R - 0.02, 64, 10).rotateX(-Math.PI / 2);
    const base = C('#d8ad62');
    const fat = C('#f6dd92');
    paint(broth, (x, _y, z, out) => {
      out.copy(base).multiplyScalar(0.85 + 0.25 * fbm3(x * 4, 1, z * 4));
      mix(out, out, fat, smoothstep(0.14, 0.05, worleyLite(x * 22, z * 22)) * 0.7);
      mix(out, out, C('#9a6a34'), smoothstep(0.75, 1, Math.hypot(x, z) / (POT_R - 0.02)) * 0.4);
    });
    const bones = new Merger();
    const r = rand(5);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.12 + r() * 0.2;
      const g = new THREE.CapsuleGeometry(0.035, 0.18, 4, 10).rotateZ(Math.PI / 2 + (r() - 0.5) * 0.6).rotateY(r() * 3);
      paintFlat(g, '#efe2c4');
      bones.add(g, trs([Math.cos(a) * d, 0.005, Math.sin(a) * d]));
    }
    // the burner stand: a ring on three bowed legs, and its gas ring
    const stand = new Merger();
    stand.add(new THREE.TorusGeometry(0.36, 0.035, 10, 48), trs([0, STAND_H - 0.03, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const c = Math.cos(a);
      const s = Math.sin(a);
      stand.add(tubeThrough([V(c * 0.36, STAND_H - 0.03, s * 0.36), V(c * 0.42, STAND_H * 0.5, s * 0.42), V(c * 0.4, 0.01, s * 0.4)], () => 0.028, 12, 8).geometry);
      // pot supports: short fins on the ring
      stand.add(plank(0.16, 0.04, 0.03, 0.008), trs([c * 0.3, STAND_H, s * 0.3], [0, -a, 0]));
    }
    stand.add(new THREE.TorusGeometry(0.2, 0.03, 8, 40), trs([0, 0.06, 0], [Math.PI / 2, 0, 0]));
    stand.add(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 16), trs([0, 0.03, 0]));
    const standG = paint(stand.build(), (x, y, z, out) => out.setScalar(0.8 + 0.3 * noise3(x * 12, y * 12, z * 12)));
    // the flame: a ring of little blue tongues
    const flame = new Merger();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const g = new THREE.ConeGeometry(0.018, 0.06, 6).translate(0, 0.03, 0);
      flame.add(g, trs([Math.cos(a) * 0.2, 0.085, Math.sin(a) * 0.2], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
    }
    // a ladle resting in the pot, its handle on the rim
    const ladle = new Merger();
    const cup = smoothLathe(
      [
        [0, -0.1],
        [0.06, -0.095],
        [0.095, -0.06],
        [0.1, 0],
        [0.094, 0.004],
        [0.088, -0.055],
        [0.055, -0.085],
        [0, -0.09],
      ],
      30,
      32,
    );
    ladle.add(cup);
    ladle.add(tubeThrough([V(0.09, 0.0, 0), V(0.25, 0.2, 0), V(0.5, 0.62, 0), V(0.62, 0.86, 0), V(0.64, 0.92, 0)], () => 0.014, 30, 8).geometry);
    return { body, handles: handles.build(), lid, broth, bones: bones.build(), stand: standG, flame: flame.build(), ladle: ladle.build() };
  });
}

/** Cheap cellular noise in 2D for fat drops (no allocation). */
function worleyLite(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const h1 = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453;
      const h2 = Math.sin(cx * 269.5 + cy * 183.3) * 43758.5453;
      const dx = cx + (h1 - Math.floor(h1)) - x;
      const dy = cy + (h2 - Math.floor(h2)) - y;
      best = Math.min(best, dx * dx + dy * dy);
    }
  return Math.sqrt(best);
}

function BrothPot({ x, z, flip, m }: { x: number; z: number; flip: boolean; m: BMats }) {
  const g = potGeometries();
  const p = propMats();
  const surface = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    // a slow simmer: the surface breathes a little
    if (surface.current) surface.current.position.y = POT_H - 0.12 + Math.sin(clock.elapsedTime * 1.7 + x) * 0.004;
  });
  const y = BACK.top;
  return (
    <group position={[x, y, z]} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh geometry={g.stand} material={m.iron} castShadow />
      <mesh geometry={g.flame} material={m.flame} />
      <group position={[0, STAND_H + 0.01, 0]}>
        <mesh geometry={g.body} material={m.pot} castShadow receiveShadow />
        <mesh geometry={g.handles} material={m.pot} castShadow />
        <mesh ref={surface} geometry={g.broth} material={m.broth} position={[0, POT_H - 0.12, 0]} />
        <mesh geometry={g.bones} material={p.matte} position={[0, POT_H - 0.12, 0]} />
        {/* the lid leans on the rim, pushed back to let the steam out */}
        <mesh geometry={g.lid} material={m.pot} position={[0.05, POT_H + 0.06, -0.3]} rotation={[-0.42, 0, 0.05]} castShadow />
        <mesh geometry={g.ladle} material={m.pot} position={[-0.15, POT_H - 0.18, 0.12]} rotation={[0, 2.4, 0]} castShadow />
      </group>
      <Steam position={[0, STAND_H + POT_H, 0.05]} count={12} height={3.2} spread={0.7} size={0.75} opacity={0.15} speed={0.075} seed={Math.round(x * 10)} />
    </group>
  );
}

// ---------- shelves ----------

function shelvesGeometry() {
  const boards = new Merger();
  const brackets = new Merger();
  const r = rand(14);
  const L = SHELVES.x1 - SHELVES.x0;
  for (const y of SHELVES.y) {
    const g = plank(L, 0.07, SHELVES.depth, 0.025, [1 / 4.5, 1 / 1.1], 3, [r() * 3, r()]);
    // darker toward the back and where things stand
    paint(g, (x, _y, z, out) => out.setScalar(0.85 + 0.2 * smoothstep(-0.2, 0.2, z) * (0.8 + 0.2 * noise3(x, 1, 0))));
    boards.add(g, trs([(SHELVES.x0 + SHELVES.x1) / 2, y - 0.035, BZ + SHELVES.depth / 2 + 0.005]));
    // a plate rail along the front edge of the upper shelf
    if (y === SHELVES.y[1]) boards.add(plank(L, 0.03, 0.025, 0.01, [1 / 4.5, 1 / 1.1]), trs([(SHELVES.x0 + SHELVES.x1) / 2, y + 0.07, BZ + SHELVES.depth - 0.02]));
    for (const x of [SHELVES.x0 + 0.4, -1.75, 1.75, SHELVES.x1 - 0.4]) {
      // an L bracket with a curled brace
      brackets.add(plank(0.04, 0.42, 0.03, 0.01), trs([x, y - 0.28, BZ + 0.02]));
      brackets.add(plank(0.04, 0.03, SHELVES.depth - 0.06, 0.01), trs([x, y - 0.085, BZ + (SHELVES.depth - 0.06) / 2 + 0.02]));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(V(x, y - 0.45 + t * 0.36 + Math.sin(t * Math.PI) * 0.05, BZ + 0.03 + t * (SHELVES.depth - 0.12) - Math.sin(t * Math.PI) * 0.06));
      }
      brackets.add(tubeThrough(pts, () => 0.012, 14, 6).geometry);
    }
  }
  return { boards: boards.build(), brackets: brackets.build() };
}

type ShelfThing =
  | { kind: 'bowls'; x: number; variant: number; count: number }
  | { kind: 'bottle'; x: number; bottle: BottleKind; label: number }
  | { kind: 'jar'; x: number; jar: JarKind; h?: number }
  | { kind: 'tin'; x: number; colour: string; h?: number }
  | { kind: 'plates'; x: number; variant: number; count: number }
  | { kind: 'dishes'; x: number; variant: number; count: number };

// Left gaps on both shelves are free for things the user adds.
const LOWER: ShelfThing[] = [
  { kind: 'bowls', x: -4.75, variant: 0, count: 6 },
  { kind: 'bowls', x: -4.25, variant: 0, count: 4 },
  { kind: 'jar', x: -3.7, jar: 'ginger' },
  { kind: 'jar', x: -3.45, jar: 'garlic', h: 0.2 },
  { kind: 'tin', x: -2.6, colour: '#2f4a6a', h: 0.24 },
  { kind: 'tin', x: -2.38, colour: '#8a2a1e', h: 0.18 },
  { kind: 'plates', x: -1.85, variant: 0, count: 3 },
  { kind: 'dishes', x: -1.2, variant: 1, count: 6 },
  { kind: 'bowls', x: -0.6, variant: 2, count: 5 },
  { kind: 'bowls', x: -0.1, variant: 2, count: 3 },
  { kind: 'jar', x: 0.45, jar: 'egg', h: 0.28 },
  { kind: 'jar', x: 2.3, jar: 'chili', h: 0.2 },
  { kind: 'jar', x: 2.55, jar: 'sesame', h: 0.22 },
  { kind: 'bowls', x: 3.6, variant: 1, count: 5 },
  { kind: 'bowls', x: 4.15, variant: 4, count: 4 },
  { kind: 'tin', x: 4.75, colour: '#3f5a3a', h: 0.22 },
];
const UPPER: ShelfThing[] = [
  { kind: 'bottle', x: -4.85, bottle: 'sake', label: 0 },
  { kind: 'bottle', x: -4.55, bottle: 'sake', label: 3 },
  { kind: 'bottle', x: -4.22, bottle: 'mirin', label: 1 },
  { kind: 'bowls', x: -3.1, variant: 3, count: 4 },
  { kind: 'tin', x: -2.55, colour: '#c9a34a', h: 0.2 },
  { kind: 'jar', x: -2.25, jar: 'ginger', h: 0.3 },
  { kind: 'plates', x: -1.6, variant: 1, count: 4 },
  { kind: 'bottle', x: -0.75, bottle: 'soy', label: 2 },
  { kind: 'bottle', x: -0.5, bottle: 'soy', label: 2 },
  { kind: 'bottle', x: -0.2, bottle: 'vinegar', label: 4 },
  { kind: 'bowls', x: 1.1, variant: 0, count: 3 },
  { kind: 'bowls', x: 1.6, variant: 2, count: 4 },
  { kind: 'dishes', x: 2.05, variant: 0, count: 5 },
  { kind: 'bottle', x: 3.3, bottle: 'oil', label: 5 },
  { kind: 'bottle', x: 3.6, bottle: 'sake', label: 6 },
  { kind: 'tin', x: 4.05, colour: '#1f1f22', h: 0.26 },
  { kind: 'bottle', x: 4.6, bottle: 'mirin', label: 7 },
  { kind: 'bottle', x: 4.9, bottle: 'sake', label: 3 },
];

function ShelfRow({ y, things }: { y: number; things: ShelfThing[] }) {
  const p = propMats();
  const z = BZ + SHELVES.depth / 2 + 0.02;
  return (
    <group>
      {things.map((t, i) => {
        const key = `${t.kind}-${i}`;
        const jitter = ((i * 37) % 7) * 0.012 - 0.03;
        if (t.kind === 'bowls') return <mesh key={key} geometry={bowlStackGeometry(t.variant, t.count)} material={p.glaze} position={[t.x, y, z + jitter]} rotation={[0, i, 0]} castShadow receiveShadow />;
        if (t.kind === 'bottle')
          return (
            <group key={key} position={[t.x, y, z + jitter - 0.04]} rotation={[0, (i % 3) * 0.2 - 0.2, 0]}>
              <Bottle kind={t.bottle} label={t.label} />
            </group>
          );
        if (t.kind === 'jar')
          return (
            <group key={key} position={[t.x, y, z + jitter]}>
              <Jar kind={t.jar} h={t.h} />
            </group>
          );
        if (t.kind === 'plates') return <mesh key={key} geometry={platesGeometry(t.variant, t.count)} material={p.glaze} position={[t.x, y, BZ + 0.05]} castShadow receiveShadow />;
        if (t.kind === 'dishes') return <mesh key={key} geometry={dishesGeometry(t.variant, t.count)} material={p.glaze} position={[t.x, y, z + jitter]} castShadow receiveShadow />;
        return <mesh key={key} geometry={tinGeometry(t.colour, t.h)} material={p.glaze} position={[t.x, y, z + jitter - 0.03]} castShadow />;
      })}
    </group>
  );
}

/** Plates stood on edge, leaning back against the tiles, a little fanned (merged). */
function platesGeometry(variant: number, count: number) {
  return once(`ramen:plates:${variant}:${count}`, () => {
    const n = 40;
    const plate = smoothLathe(
      [
        [0, 0],
        [0.08, 0],
        [0.09, 0.008],
        [0.17, 0.022],
        [0.19, 0.036],
        [0.18, 0.04],
        [0.1, 0.02],
        [0, 0.016],
      ],
      n,
      48,
    );
    const glazes = [
      ['#f2ece0', '#24477c'],
      ['#e9e0cc', '#8a3020'],
    ];
    const [ground, ink] = glazes[variant % glazes.length].map((h) => C(h));
    paintLathe(plate, n, (x, _y, z, _a, out) => {
      const rr = Math.hypot(x, z);
      out.copy(ground);
      // a painted rim band and a flower in the well
      mix(out, out, ink, smoothstep(0.15, 0.155, rr) * smoothstep(0.182, 0.176, rr));
      const a = Math.atan2(z, x);
      const petal = Math.abs(Math.cos(a * 2.5)) * 0.055;
      mix(out, out, ink, smoothstep(petal + 0.004, petal - 0.004, rr) * smoothstep(0.012, 0.02, rr) * 0.85);
    });
    const m = new Merger();
    for (let i = 0; i < count; i++) m.add(plate, trs([(i - (count - 1) / 2) * 0.07, 0.19, 0.03 + i * 0.03], [-Math.PI / 2 + 0.22, 0, (i - (count - 1) / 2) * 0.05], 1, 'XYZ'));
    return m.build();
  });
}

/** A stack of small sauce dishes (merged). */
function dishesGeometry(variant: number, count: number) {
  return once(`ramen:dishes:${variant}:${count}`, () => {
    const n = 30;
    const dish = smoothLathe(
      [
        [0, 0],
        [0.05, 0],
        [0.055, 0.006],
        [0.1, 0.03],
        [0.108, 0.042],
        [0.1, 0.043],
        [0.06, 0.02],
        [0, 0.016],
      ],
      n,
      40,
    );
    const col = C(variant % 2 ? '#3a5a7a' : '#d8cfb8');
    paintLathe(dish, n, (x, y, z, _a, out) => {
      out.copy(col).multiplyScalar(0.92 + 0.12 * noise3(x * 40, y * 40, z * 40));
      if (y > 0.038) out.multiplyScalar(1.12);
    });
    const m = new Merger();
    for (let i = 0; i < count; i++) m.add(dish, trs([0, i * 0.024, 0], [0, i, 0]));
    return m.build();
  });
}

// ---------- utensils over the broth pots ----------

function utensilGeometries() {
  return once('ramen:utensils', () => {
    const steel = new Merger();
    const wood = new Merger();
    const L = 1.7;
    steel.add(tubeThrough([V(-L / 2, 0, 0.12), V(L / 2, 0, 0.12)], () => 0.016, 2, 10).geometry);
    for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) steel.add(tubeThrough([V(x, 0, 0.0), V(x, 0, 0.12)], () => 0.014, 2, 8).geometry);
    const hang = (x: number, len: number) => {
      // an S hook
      steel.add(tubeThrough([V(x, 0.02, 0.12), V(x + 0.03, -0.02, 0.15), V(x, -0.06, 0.13), V(x - 0.02, -0.1, 0.12)], () => 0.006, 12, 5).geometry);
      return V(x - 0.02, -0.1 - len, 0.12);
    };
    // a ladle
    const a = hang(-0.62, 0);
    steel.add(tubeThrough([V(a.x, a.y, a.z), V(a.x, a.y - 0.4, a.z + 0.01), V(a.x, a.y - 0.62, a.z + 0.03)], () => 0.012, 12, 6).geometry);
    steel.add(
      smoothLathe(
        [
          [0, -0.09],
          [0.06, -0.08],
          [0.085, -0.04],
          [0.09, 0],
          [0.08, 0.003],
          [0.075, -0.04],
          [0.05, -0.07],
          [0, -0.075],
        ],
        20,
        24,
      )
        .rotateX(-1.2)
        .translate(a.x, a.y - 0.68, a.z + 0.06),
    );
    // a noodle basket (tebo): a deep mesh cup on a long handle
    const b = hang(-0.15, 0);
    wood.add(tubeThrough([V(b.x, b.y, b.z), V(b.x, b.y - 0.5, b.z + 0.02)], () => 0.018, 4, 8).geometry);
    steel.add(tubeThrough([V(b.x, b.y - 0.5, b.z + 0.02), V(b.x, b.y - 0.62, b.z + 0.06)], () => 0.01, 4, 6).geometry);
    const basket = smoothLathe(
      [
        [0.07, 0],
        [0.075, -0.12],
        [0.06, -0.24],
        [0.03, -0.29],
        [0, -0.3],
      ],
      20,
      24,
    ).translate(b.x, b.y - 0.62, b.z + 0.14);
    steel.add(basket);
    steel.add(new THREE.TorusGeometry(0.072, 0.008, 6, 24).rotateX(Math.PI / 2).translate(b.x, b.y - 0.62, b.z + 0.14));
    // a spider skimmer
    const c = hang(0.35, 0);
    wood.add(tubeThrough([V(c.x, c.y, c.z), V(c.x, c.y - 0.42, c.z + 0.02)], () => 0.015, 4, 8).geometry);
    const web: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      web.push(V(c.x + Math.cos(t) * 0.11, c.y - 0.56 + Math.sin(t) * 0.11, c.z + 0.03));
    }
    steel.add(tubeThrough(web, () => 0.006, 48, 4).geometry);
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI;
      steel.add(tubeThrough([V(c.x + Math.cos(t) * 0.11, c.y - 0.56 + Math.sin(t) * 0.11, c.z + 0.03), V(c.x - Math.cos(t) * 0.11, c.y - 0.56 - Math.sin(t) * 0.11, c.z + 0.03)], () => 0.004, 4, 4).geometry);
    }
    steel.add(tubeThrough([V(c.x, c.y - 0.42, c.z + 0.02), V(c.x, c.y - 0.45, c.z + 0.03)], () => 0.008, 4, 6).geometry);
    // a strainer
    const d = hang(0.7, 0);
    steel.add(tubeThrough([V(d.x, d.y, d.z), V(d.x, d.y - 0.3, d.z + 0.02)], () => 0.012, 4, 6).geometry);
    steel.add(
      smoothLathe(
        [
          [0.13, 0],
          [0.12, -0.05],
          [0.07, -0.1],
          [0, -0.11],
        ],
        16,
        28,
      )
        .rotateX(-1.45)
        .translate(d.x, d.y - 0.42, d.z + 0.07),
    );
    return { steel: steel.build(), wood: paintFlat(wood.build(), '#7a5634') };
  });
}

function Utensils({ x, m }: { x: number; m: BMats }) {
  const g = utensilGeometries();
  const p = propMats();
  return (
    <group position={[x, 2.95, BZ]}>
      <mesh geometry={g.steel} material={m.pot} castShadow />
      <mesh geometry={g.wood} material={p.wood} castShadow />
    </group>
  );
}

// ---------- the hood ----------

function hoodGeometries() {
  const { x0, x1, y0, y1, front } = HOOD;
  const recess = y0 + 0.32;
  // the canopy's profile ([z, y]): a tall front skirt, a sloped top back to the wall, a recessed underside
  const profile: [number, number][] = [
    [BZ, recess],
    [front - 0.12, recess],
    [front - 0.12, y0],
    [front, y0],
    [front + 0.02, y0 + 0.03],
    [front + 0.02, y1 - 0.42],
    [front - 0.3, y1 - 0.1],
    [front - 0.62, y1],
    [BZ, y1],
  ];
  const shell = moulding(profile, x0, x1, 4);
  // world-sized UVs for the brushed steel (the extrusion runs along x)
  const p = shell.attributes.position;
  const nrm = shell.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    uv[i * 2] = ax > 0.5 ? p.getZ(i) / 1.6 : p.getX(i) / 1.6;
    uv[i * 2 + 1] = (p.getY(i) + p.getZ(i) * 0.3) / 1.6;
  }
  shell.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const grease = C('#8a6a3a');
  paint(shell, (x, y, z, out) => {
    out.setScalar(0.88 + 0.16 * fbm3(x * 1.2, y * 3, z * 3));
    // grease and heat tint, heavier over the broth pots and along the bottom edge
    const overPots = Math.max(smoothstep(1.4, 0.2, Math.abs(x - (BACK.x0 + 1.2))), smoothstep(1.4, 0.2, Math.abs(x - (BACK.x1 - 1.2))));
    mix(out, out, grease, smoothstep(y0 + 0.4, y0, y) * 0.35 + overPots * 0.25 * smoothstep(0.2, 0.7, noise3(x * 3, y * 5, 2)));
  });
  // panel seams, rivets along the skirt
  const seams = new Merger();
  const panels = 8;
  for (let i = 1; i < panels; i++) {
    const x = x0 + ((x1 - x0) * i) / panels;
    seams.add(plank(0.035, y1 - 0.42 - y0, 0.02, 0.008), trs([x, (y1 - 0.42 + y0) / 2, front + 0.03]));
  }
  const rivets = new Merger();
  const dome = new THREE.SphereGeometry(0.014, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  for (let x = x0 + 0.12; x < x1 - 0.05; x += 0.245) {
    rivets.add(dome, trs([x, y0 + 0.06, front + 0.022]));
    rivets.add(dome, trs([x, y1 - 0.48, front + 0.022]));
  }
  // under it: baffle filters in the recess and warm lamp lenses
  const filters = new Merger();
  for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.05) {
    filters.add(plank(0.95, 0.03, 0.62, 0.01), trs([x + 0.45, recess - 0.02, (BZ + front) / 2 + 0.1], [0.12, 0, 0]));
    for (let k = 0; k < 7; k++) filters.add(plank(0.012, 0.035, 0.6, 0.004), trs([x + 0.06 + k * 0.13, recess - 0.045, (BZ + front) / 2 + 0.1], [0.12, 0, 0]));
  }
  const lenses = new Merger();
  for (let x = x0 + 1.0; x < x1 - 0.5; x += 2.0) lenses.add(new THREE.PlaneGeometry(0.7, 0.16).rotateX(Math.PI / 2), trs([x, recess - 0.03, front - 0.35]));
  // the duct up to the ceiling
  const duct = new Merger().add(plank(1.5, CEIL - y1 + 0.05, 0.9, 0.02, [1 / 1.6, 1 / 1.6]), trs([0, (CEIL + y1) / 2, BZ + 0.47]));
  for (let y = y1 + 0.5; y < CEIL - 0.3; y += 0.7) duct.add(plank(1.54, 0.04, 0.94, 0.01), trs([0, y, BZ + 0.47]));
  return { shell, seams: seams.build(), rivets: rivets.build(), filters: filters.build(), lenses: lenses.build(), duct: duct.build() };
}

/** Paper order tickets: a strip of six, each with scribbled lines and a tick or two. */
function ticketTex() {
  return tex('tickets', 768, 256, (g, w, h) => {
    const r = rand(12);
    const tw = w / 6;
    for (let i = 0; i < 6; i++) {
      const x = i * tw;
      g.fillStyle = i % 3 === 2 ? '#f6e8a8' : '#f4efe2';
      g.fillRect(x, 0, tw, h);
      // a printed band at the top, torn bottom edge
      g.fillStyle = i % 2 ? 'rgba(180,50,40,0.75)' : 'rgba(40,60,110,0.7)';
      g.fillRect(x + 8, 10, tw - 16, 10);
      g.strokeStyle = 'rgba(40,30,30,0.85)';
      g.lineCap = 'round';
      for (let l = 0; l < 6; l++) {
        const y = 40 + l * 30;
        g.lineWidth = 2 + r() * 1.2;
        g.beginPath();
        let px = x + 12;
        g.moveTo(px, y);
        const end = x + 12 + (tw - 30) * (0.4 + r() * 0.55);
        while (px < end) {
          px += 4 + r() * 6;
          g.lineTo(px, y + (r() - 0.5) * 6);
        }
        g.stroke();
        if (r() < 0.35) {
          g.strokeStyle = 'rgba(190,40,30,0.9)';
          g.beginPath();
          g.moveTo(x + tw - 26, y - 4);
          g.lineTo(x + tw - 20, y + 3);
          g.lineTo(x + tw - 10, y - 9);
          g.stroke();
          g.strokeStyle = 'rgba(40,30,30,0.85)';
        }
      }
      brushMarks(g, r, x + tw * 0.62, h * 0.7, tw * 0.22, h * 0.22, 'rgba(40,30,30,0.8)', 2, true);
      // the ragged tear
      g.fillStyle = 'rgba(0,0,0,0)';
      g.clearRect(x, h - 6, tw, 6);
      for (let k = 0; k < tw; k += 4) {
        g.fillStyle = i % 3 === 2 ? '#f6e8a8' : '#f4efe2';
        g.fillRect(x + k, h - 6, 4, r() * 6);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + tw - 1, 0, 1, h);
    }
  });
}

function ticketsGeometry() {
  return once('ramen:tickets', () => {
    const m = new Merger();
    const r = rand(33);
    const xs = [-6.1, -5.55, -3.1, -2.6, -0.4, 0.75, 2.95, 5.2, 5.8];
    xs.forEach((x, i) => {
      const k = Math.floor(r() * 6);
      const g = new THREE.PlaneGeometry(0.2, 0.3, 1, 3);
      // map one ticket of the strip, curl the bottom a little
      const uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (k + uv.getX(j)) / 6);
      const p = g.attributes.position;
      for (let j = 0; j < p.count; j++) p.setZ(j, Math.pow(Math.max(0, -p.getY(j) + 0.05), 2) * 0.5);
      g.computeVertexNormals();
      m.add(g, trs([x + (r() - 0.5) * 0.08, HOOD.y0 + 0.12 - 0.15, HOOD.front + 0.06], [0.05, (r() - 0.5) * 0.25, (r() - 0.5) * 0.12]));
      void i;
    });
    return m.build();
  });
}

function Hood({ m }: { m: BMats }) {
  const g = useMemo(() => once('ramen:hood', hoodGeometries), []);
  const tickets = ticketsGeometry();
  const rail = useMemo(() => once('ramen:ticket-rail', () => tubeThrough([V(HOOD.x0 + 0.3, HOOD.y0 + 0.16, HOOD.front + 0.05), V(HOOD.x1 - 0.3, HOOD.y0 + 0.16, HOOD.front + 0.05)], () => 0.012, 2, 8).geometry), []);
  return (
    <group>
      <mesh geometry={g.shell} material={m.steel} castShadow receiveShadow />
      <mesh geometry={g.seams} material={m.steel} />
      <mesh geometry={g.rivets} material={m.darkSteel} />
      <mesh geometry={g.filters} material={m.filter} />
      <mesh geometry={g.lenses} material={m.lens} />
      <mesh geometry={g.duct} material={m.steel} castShadow />
      <mesh geometry={rail} material={m.darkSteel} />
      <mesh geometry={tickets} material={m.ticket} />
    </group>
  );
}

// ---------- assembled ----------

export function BackLine() {
  const m = backMats();
  const geo = useMemo(() => once('ramen:back-counter', counterGeometry), []);
  const shelves = useMemo(() => once('ramen:shelves', shelvesGeometry), []);
  return (
    <group>
      <mesh geometry={geo.top} material={m.steel} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={geo.body} material={m.steel} castShadow receiveShadow />
      {POTS.map(([x, z], i) => (
        <BrothPot key={i} x={x} z={z} flip={i === 1} m={m} />
      ))}
      {POTS.map(([x], i) => (
        <Utensils key={i} x={x + (i === 0 ? -0.1 : 0.1)} m={m} />
      ))}
      <mesh geometry={shelves.boards} material={m.shelf} castShadow receiveShadow userData={{ surface: 'shelf' }} />
      <mesh geometry={shelves.brackets} material={m.bracket} castShadow />
      <ShelfRow y={SHELVES.y[0]} things={LOWER} />
      <ShelfRow y={SHELVES.y[1]} things={UPPER} />
      <Hood m={m} />
    </group>
  );
}

