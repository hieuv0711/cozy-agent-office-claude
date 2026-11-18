import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeParts, tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { smoothstep } from '../../tank/util';
import { FRONT_Z, TOP, WALL_Z } from '../space';
import type { CatalogItem, Placed } from '../types';
import { BookRow, BookStack } from './desk-books';
import { geometry, grainBump, mapUV, material, planarUV, rand, roundedBox, woodTexture } from './desk-kit';
import { DeskLamp, StringLights } from './desk-light';
import { SnakePlant, Succulent } from './desk-plants';
import { nightTexture, rugTexture, wallpaperTexture } from './desk-tex';
import { AlarmClock, Globe, Mug, Notebook, PencilCup, Radio } from './desk-things';
import { FramedPrint, WallClock } from './desk-wall';
import { getFlash, Precipitation, tickWeather, viewColor, weatherView, WindowWeather } from '../weather';

// The Night desk theme: the tank stands on a wide walnut pedestal desk in a
// study at night. Blue-slate botanical wallpaper, a sash window with mustard
// velvet curtains and the moon outside on the left, a floating walnut shelf
// on iron brackets on the right, oak boards and a worn rug underfoot. The
// movable things (lamp, books, plants, clocks, lights...) are the items.

const FLOOR = TOP - 9.75;
const HALF = 17; // the desk's half width
const SLAB = 0.42; // the desk top's thickness
/** The window opening in the back wall, and how deep its reveal is. */
const WIN = { x0: -12.0, x1: -8.0, y0: -1.3, y1: 5.3, depth: 0.55 };
/** The floating shelf on the right: its span, top surface and depth. */
const SHELF = { x0: 7.0, x1: 12.8, y: 3.95, depth: 1.6 };
/** The window sill's top surface and how far it stands out from the wall. */
const SILL_OUT = 0.6;

// ---------- materials ----------

function mats() {
  return {
    top: material('desk:top', () => new THREE.MeshPhysicalMaterial({ map: woodTexture('desk-top', { w: 2048, h: 512, light: '#93603a', dark: '#3a2213', planks: 5, rings: 9, seed: 3, joints: false }), roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3 })),
    body: material('desk:body', () => new THREE.MeshStandardMaterial({ map: woodTexture('desk-body', { w: 1024, h: 512, light: '#7d4e2c', dark: '#301b10', planks: 4, rings: 10, seed: 8, joints: false }), roughness: 0.5 })),
    inside: material('desk:inside', () => new THREE.MeshStandardMaterial({ color: '#21160f', roughness: 0.85 })),
    brass: material('desk:brass', () => new THREE.MeshStandardMaterial({ color: '#c99a4c', metalness: 0.9, roughness: 0.3 })),
    iron: material('desk:iron', () => new THREE.MeshStandardMaterial({ color: '#26221f', metalness: 0.6, roughness: 0.45 })),
    trim: material('desk:trim', () => new THREE.MeshStandardMaterial({ color: '#cfc4ad', roughness: 0.42, bumpMap: grainBump('paint', { scale: 2, contrast: 0.6 }), bumpScale: 0.15 })),
    floor: material('desk:floor', () => {
      const t = woodTexture('desk-floor', { w: 1024, h: 1024, light: '#8a6a4a', dark: '#3d2b1c', planks: 8, rings: 4, seed: 12 });
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 });
    }),
  };
}
type Mats = ReturnType<typeof mats>;

// ---------- the wall ----------

function wallGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-36, FLOOR);
  s.lineTo(36, FLOOR);
  s.lineTo(36, 24);
  s.lineTo(-36, 24);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(WIN.x0, WIN.y0);
  hole.lineTo(WIN.x0, WIN.y1);
  hole.lineTo(WIN.x1, WIN.y1);
  hole.lineTo(WIN.x1, WIN.y0);
  hole.closePath();
  s.holes.push(hole);
  const g = new THREE.ShapeGeometry(s);
  // one wallpaper tile per 3 units
  return mapUV(g, (x, y) => [x / 3, y / 3]);
}

/** A moulding profile (z out of the wall, y up) run along x from x0 to x1. */
function moulding(profile: [number, number][], x0: number, x1: number) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, curveSegments: 8 });
  // shape x -> world z, extrusion -> world x
  g.rotateY(-Math.PI / 2).translate(x1, 0, 0);
  return planarUV(g, 0.5);
}

function Wall({ m }: { m: Mats }) {
  const g = useMemo(() => geometry('desk:wall', wallGeometry), []);
  const paper = material('desk:paper', () => new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.82, bumpMap: grainBump('paper', { scale: 3, contrast: 0.5 }), bumpScale: 0.25 }));
  const skirting = useMemo(
    () =>
      geometry('desk:skirting', () =>
        moulding(
          [
            [0, 0],
            [0.17, 0],
            [0.17, 0.78],
            [0.13, 0.84],
            [0.13, 0.9],
            [0.07, 0.98],
            [0.05, 1.04],
            [0, 1.04],
          ],
          -36,
          36,
        ),
      ),
    [],
  );
  const rail = useMemo(
    () =>
      geometry('desk:rail', () =>
        moulding(
          [
            [0, 0],
            [0.06, 0.02],
            [0.12, 0.08],
            [0.13, 0.16],
            [0.1, 0.24],
            [0.05, 0.27],
            [0, 0.28],
          ],
          -36,
          36,
        ),
      ),
    [],
  );
  return (
    <group>
      <mesh geometry={g} material={paper} position={[0, 0, WALL_Z]} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={skirting} material={m.trim} position={[0, FLOOR, WALL_Z]} receiveShadow />
      <mesh geometry={rail} material={m.trim} position={[0, 10.2, WALL_Z]} />
    </group>
  );
}

// ---------- the desk ----------

function deskTopEdgeGeometry() {
  const zb = WALL_Z;
  const zf = FRONT_Z;
  const y0 = TOP - SLAB;
  const y1 = TOP - 0.002;
  const r = 0.17;
  const s = new THREE.Shape();
  s.moveTo(zb, y0);
  s.lineTo(zf - 0.07, y0);
  s.lineTo(zf - 0.07, y0 + 0.04);
  s.quadraticCurveTo(zf, y0 + 0.05, zf, y0 + 0.13);
  s.lineTo(zf, y1 - r);
  s.absarc(zf - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(zb, y1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: HALF * 2, bevelEnabled: false, curveSegments: 12 });
  g.rotateY(-Math.PI / 2).translate(HALF, 0, 0);
  return planarUV(g, [1 / (HALF * 2), 1 / (FRONT_Z - WALL_Z)], [0.5, 0.3]);
}

function pullGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.44, 0);
  s.bezierCurveTo(-0.44, 0.11, -0.27, 0.14, -0.16, 0.085);
  s.bezierCurveTo(-0.08, 0.125, 0.08, 0.125, 0.16, 0.085);
  s.bezierCurveTo(0.27, 0.14, 0.44, 0.11, 0.44, 0);
  s.bezierCurveTo(0.44, -0.11, 0.27, -0.14, 0.16, -0.085);
  s.bezierCurveTo(0.08, -0.125, -0.08, -0.125, -0.16, -0.085);
  s.bezierCurveTo(-0.27, -0.14, -0.44, -0.11, -0.44, 0);
  const plate = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.014, bevelSegments: 3, curveSegments: 16 });
  const parts: THREE.BufferGeometry[] = [plate];
  for (const x of [-0.31, 0.31])
    parts.push(
      smoothLathe(
        [
          [0, 0],
          [0.04, 0],
          [0.045, 0.03],
          [0.026, 0.06],
          [0.034, 0.085],
          [0.02, 0.1],
          [0, 0.102],
        ],
        24,
        16,
      )
        .rotateX(Math.PI / 2)
        .translate(x, 0, 0.02),
    );
  parts.push(
    tubeThrough(
      [
        [-0.31, 0.0, 0.1],
        [-0.29, -0.12, 0.115],
        [-0.15, -0.21, 0.12],
        [0, -0.225, 0.12],
        [0.15, -0.21, 0.12],
        [0.29, -0.12, 0.115],
        [0.31, 0.0, 0.1],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      () => 0.021,
      40,
      8,
    ).geometry,
  );
  return mergeParts(parts, ['position', 'normal']);
}

type Drawer = { x: number; y: number; w: number; h: number; panel?: boolean; key?: boolean };

function Desk({ m }: { m: Mats }) {
  const edge = useMemo(() => geometry('desk:edge', deskTopEdgeGeometry), []);
  const pull = useMemo(() => geometry('desk:pull', pullGeometry), []);
  const faceZ = FRONT_Z - 0.2; // the drawer fronts' face
  const yA = TOP - SLAB - 0.06; // top of the apron drawers
  const yB = TOP - 1.72; // bottom of the apron row
  const ped = 10.7; // inner x of the pedestals
  const plinth = FLOOR + 0.55;
  const drawers = useMemo<Drawer[]>(() => {
    const out: Drawer[] = [];
    const row = (x0: number, x1: number, y0: number, y1: number, panel = false, key = false) => out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, panel, key });
    const g = 0.09;
    row(-HALF + 0.25, -ped - g / 2, yB + g / 2, yA);
    row(-ped + g / 2, -5.2 - g / 2, yB + g / 2, yA);
    row(-5.2 + g / 2, 5.2 - g / 2, yB + g / 2, yA, false, true);
    row(5.2 + g / 2, ped - g / 2, yB + g / 2, yA);
    row(ped + g / 2, HALF - 0.25, yB + g / 2, yA);
    const mid = (yB + plinth) / 2;
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -HALF + 0.25 : ped + g / 2;
      const xb = s < 0 ? -ped - g / 2 : HALF - 0.25;
      row(xa, xb, mid + g / 2, yB - g / 2, true);
      row(xa, xb, plinth + 0.12, mid - g / 2, true);
    }
    return out;
  }, [faceZ, yA, yB, plinth]);
  const fronts = useMemo(() => {
    const r = rand(44);
    return drawers.map((d) => {
      const g = roundedBox(d.w, d.h, 0.12, 0.035, 3);
      planarUV(g, [1 / 8, 1 / 4], [r(), r()]);
      let inner: THREE.BufferGeometry | null = null;
      if (d.panel) {
        inner = roundedBox(d.w - 0.7, d.h - 0.7, 0.1, 0.05, 3);
        planarUV(inner, [1 / 8, 1 / 4], [r(), r()]);
      }
      return { d, g, inner };
    });
  }, [drawers]);
  const pulls = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = pulls.current;
    if (!im) return;
    const mtx = new THREE.Matrix4();
    drawers.forEach((d, i) => {
      const y = d.panel ? d.y + d.h / 2 - 0.75 : d.y + 0.08;
      mtx.makeTranslation(d.x, y, faceZ + 0.06);
      im.setMatrixAt(i, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
  }, [drawers, faceZ]);
  const keyPlate = useMemo(() => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, 0.1, 0.15, 0, Math.PI * 2, false, 0);
    const h = new THREE.Path();
    h.absarc(0, 0.03, 0.028, 0, Math.PI * 2, true);
    s.holes.push(h);
    const slot = new THREE.Path();
    slot.moveTo(-0.012, 0.01);
    slot.lineTo(-0.02, -0.08);
    slot.lineTo(0.02, -0.08);
    slot.lineTo(0.012, 0.01);
    slot.closePath();
    s.holes.push(slot);
    return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 20 });
  }, []);
  const D = FRONT_Z - WALL_Z;
  const top = useMemo(() => {
    const g = new THREE.PlaneGeometry(HALF * 2, D).rotateX(-Math.PI / 2);
    return mapUV(g, (x, _y, z) => [(x + HALF) / (HALF * 2), (z - WALL_Z) / D + 0.3]);
  }, [D]);
  return (
    <group>
      {/* the top: a tagged plane for the surface, over a slab with a moulded front edge */}
      <mesh geometry={top} material={m.top} position={[0, TOP, (WALL_Z + FRONT_Z) / 2]} receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={edge} material={m.top} castShadow receiveShadow />
      {/* the carcass: apron, two pedestals, the kneehole's back panel and the plinths */}
      <mesh material={m.body} position={[0, (yB + TOP - SLAB) / 2, (WALL_Z + faceZ - 0.1) / 2]} receiveShadow>
        <boxGeometry args={[HALF * 2 - 0.3, TOP - SLAB - yB + 0.1, faceZ - 0.1 - WALL_Z]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.body} position={[s * (HALF + ped) / 2, (plinth + yB) / 2, (WALL_Z + faceZ - 0.1) / 2]} castShadow receiveShadow>
          <boxGeometry args={[HALF - ped - 0.3, yB - plinth, faceZ - 0.1 - WALL_Z]} />
        </mesh>
      ))}
      <mesh material={m.inside} position={[0, (plinth + yB) / 2 + 0.6, -1.9]}>
        <boxGeometry args={[ped * 2, yB - plinth - 1.2, 0.12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.inside} position={[s * (HALF + ped) / 2, FLOOR + 0.275, (WALL_Z + faceZ) / 2 - 0.1]}>
          <boxGeometry args={[HALF - ped - 0.5, 0.55, faceZ - WALL_Z - 0.3]} />
        </mesh>
      ))}
      {/* drawer fronts, brass bail pulls and the centre drawer's keyhole */}
      {fronts.map(({ d, g, inner }, i) => (
        <group key={i} position={[d.x, d.y, faceZ]}>
          <mesh geometry={g} material={m.body} castShadow receiveShadow />
          {inner && <mesh geometry={inner} material={m.body} position={[0, 0, 0.03]} receiveShadow />}
        </group>
      ))}
      <instancedMesh ref={pulls} args={[pull, m.brass, drawers.length]} castShadow />
      <mesh geometry={keyPlate} material={m.brass} position={[0, yB + 0.32, faceZ + 0.06]} />
    </group>
  );
}

// ---------- the floor ----------

function Floor({ m }: { m: Mats }) {
  const floor = useMemo(() => {
    const g = new THREE.PlaneGeometry(90, 50).rotateX(-Math.PI / 2);
    // boards run toward the viewer: grain along z
    return mapUV(g, (x, _y, z) => [z / 9, x / 9]);
  }, []);
  const rug = useMemo(() => {
    const g = roundedBox(21, 0.08, 15, 0.035, 2);
    return g;
  }, []);
  const rugMat = material('desk:rug', () => new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }));
  return (
    <group>
      <mesh geometry={floor} material={m.floor} position={[0, FLOOR, 20.4]} receiveShadow userData={{ surface: 'floor' }} />
      <mesh geometry={rug} material={rugMat} position={[0, FLOOR + 0.04, 9.6]} receiveShadow userData={{ surface: 'floor' }} />
    </group>
  );
}

// ---------- the window ----------

/** The two sashes' glass: centre, size, the glazing bars' positions within it, and the sash's depth. */
function sashPanes() {
  const { x0, x1, y0, y1 } = WIN;
  const f = 0.13;
  const st = 0.13;
  const ix0 = x0 + f;
  const ix1 = x1 - f;
  const iy0 = y0 + f;
  const iy1 = y1 - f;
  const mid = (iy0 + iy1) / 2;
  const pane = (sy0: number, sy1: number, bottom: number, top: number, z: number) => {
    const gy0 = sy0 + bottom;
    const gy1 = sy1 - top;
    return { cx: (ix0 + ix1) / 2, cy: (gy0 + gy1) / 2, w: ix1 - ix0 - st * 2, h: gy1 - gy0, z };
  };
  return [pane(iy0, mid + 0.05, 0.2, 0.08, WALL_Z - 0.26), pane(mid - 0.05, iy1, 0.08, 0.13, WALL_Z - 0.38)];
}

function sashGeometry() {
  const { x0, x1, y0, y1, depth } = WIN;
  const parts: THREE.BufferGeometry[] = [];
  const bar = (cx: number, cy: number, w: number, h: number, z: number, d: number) => parts.push(roundedBox(w, h, d, Math.min(0.02, w / 2 - 0.001, h / 2 - 0.001), 2).translate(cx, cy, z));
  const f = 0.13; // the box frame inside the opening
  const zf = WALL_Z - depth + 0.08;
  bar((x0 + x1) / 2, y1 - f / 2, x1 - x0, f, zf + 0.12, 0.24);
  bar((x0 + x1) / 2, y0 + f / 2, x1 - x0, f, zf + 0.12, 0.24);
  bar(x0 + f / 2, (y0 + y1) / 2, f, y1 - y0, zf + 0.12, 0.24);
  bar(x1 - f / 2, (y0 + y1) / 2, f, y1 - y0, zf + 0.12, 0.24);
  const ix0 = x0 + f;
  const ix1 = x1 - f;
  const iy0 = y0 + f;
  const iy1 = y1 - f;
  const mid = (iy0 + iy1) / 2;
  const sash = (sy0: number, sy1: number, z: number, lower: boolean) => {
    const st = 0.13;
    const bottom = lower ? 0.2 : 0.08;
    const top = lower ? 0.08 : 0.13;
    bar((ix0 + ix1) / 2, sy0 + bottom / 2, ix1 - ix0, bottom, z, 0.1);
    bar((ix0 + ix1) / 2, sy1 - top / 2, ix1 - ix0, top, z, 0.1);
    bar(ix0 + st / 2, (sy0 + sy1) / 2, st, sy1 - sy0, z, 0.1);
    bar(ix1 - st / 2, (sy0 + sy1) / 2, st, sy1 - sy0, z, 0.1);
    // glazing bars: two over two
    bar((ix0 + ix1) / 2, (sy0 + bottom + sy1 - top) / 2, 0.045, sy1 - sy0 - bottom - top, z, 0.07);
    bar((ix0 + ix1) / 2, (sy0 + bottom + sy1 - top) / 2, ix1 - ix0 - st * 2, 0.045, z, 0.07);
  };
  sash(iy0, mid + 0.05, WALL_Z - 0.26, true);
  sash(mid - 0.05, iy1, WALL_Z - 0.38, false);
  return mergeParts(parts, ['position', 'normal']);
}

/** Velvet curtain: gathered on the rod, caught by a tie-back, its hem sweeping up toward the window. */
function curtainGeometry(side: 1 | -1, seed: number) {
  const cols = 72;
  const rows = 56;
  const width = 2.3;
  const drop = WIN.y1 - WIN.y0 + 1.6;
  const tieAt = 0.6;
  const tieW = 0.62;
  const hemW = 1.15;
  const folds = 7.5;
  const r = rand(seed);
  const ph = r() * 6;
  const g = new THREE.PlaneGeometry(1, 1, cols, rows);
  const p = g.attributes.position;
  const Wat = (v: number) => (v < tieAt ? width + (tieW - width) * Math.pow(smoothstep(0, tieAt, v), 1.6) : tieW + (hemW - tieW) * smoothstep(tieAt, 1, v));
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5; // 0 at the outer edge, 1 at the inner edge
    const v = 0.5 - p.getY(i); // 0 at the top, 1 at the hem
    const W = Wat(v);
    const gather = width / W;
    let y = -v * drop;
    y += smoothstep(tieAt, 1, v) * u * u * 0.55;
    const amp = 0.055 * Math.pow(gather, 0.75) * (1 - 0.35 * smoothstep(0.0, 0.08, v) * (1 - v));
    const z = amp * (1 - Math.cos(u * folds * Math.PI * 2 + ph + v * 0.8)) + u * 0.06 * (1 - v);
    p.setXYZ(i, side * u * W, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function Window({ m }: { m: Mats }) {
  const { x0, x1, y0, y1, depth } = WIN;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const W = x1 - x0;
  const H = y1 - y0;
  const sash = useMemo(() => geometry('desk:sash', sashGeometry), []);
  // the view outside crossfades between its clear, wet and snowy paintings; a storm darkens it and lightning lights its sky
  const night = material('desk:night', () =>
    weatherView(new THREE.MeshBasicMaterial({ toneMapped: false }), { clear: () => nightTexture('clear'), wet: () => nightTexture('wet'), snow: () => nightTexture('snow') }, { storm: 0.32, flashGain: 3.2, flashLift: 0.05 }),
  );
  const panes = useMemo(() => sashPanes(), []);
  const glass = material('desk:glass', () => new THREE.MeshPhysicalMaterial({ color: '#a9bde0', transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false }));
  const velvet = material(
    'desk:velvet',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#7a5418',
        roughness: 0.78,
        sheen: 1,
        sheenRoughness: 0.42,
        sheenColor: new THREE.Color('#e6b25a'),
        side: THREE.DoubleSide,
        bumpMap: grainBump('velvet', { scale: 6, contrast: 0.4 }),
        bumpScale: 0.2,
      }),
  );
  const curtains = useMemo(() => [geometry('desk:curtain-l', () => curtainGeometry(1, 3)), geometry('desk:curtain-r', () => curtainGeometry(-1, 7))], []);
  const finial = useMemo(
    () =>
      geometry('desk:finial', () =>
        smoothLathe(
          [
            [0, 0],
            [0.07, 0.0],
            [0.075, 0.04],
            [0.05, 0.07],
            [0.11, 0.16],
            [0.12, 0.24],
            [0.08, 0.32],
            [0.03, 0.38],
            [0.02, 0.46],
            [0, 0.5],
          ],
          48,
          24,
        ).rotateZ(-Math.PI / 2),
      ),
    [],
  );
  const tassel = useMemo(
    () =>
      geometry('desk:tassel', () =>
        smoothLathe(
          [
            [0, 0],
            [0.09, 0.02],
            [0.1, 0.12],
            [0.07, 0.3],
            [0.05, 0.36],
            [0.07, 0.4],
            [0.045, 0.46],
            [0, 0.48],
          ],
          40,
          20,
        ).translate(0, -0.48, 0),
      ),
    [],
  );
  const tieLoop = useMemo(() => geometry('desk:tie', () => new THREE.TorusGeometry(0.42, 0.045, 10, 40)), []);
  const rodY = y1 + 0.95;
  const rodZ = WALL_Z + 0.45;
  const rodX0 = x0 - 2.3;
  const rodX1 = x1 + 2.3;
  const curtainTop = rodY - 0.1;
  const tieY = curtainTop - (H + 1.6) * 0.6;
  return (
    <group>
      {/* outside: the night, behind the glass, and the rain or snow falling past the window */}
      <mesh material={night} position={[cx + 0.4, cy + 0.6, WALL_Z - 1.6]}>
        <planeGeometry args={[7.2, 10.8]} />
      </mesh>
      <Precipitation min={[x0 - 1.6, y0 - 2.5, WALL_Z - 1.5]} max={[x1 + 1.2, y1 + 3.5, WALL_Z - 0.5]} density={1.15} glow={{ position: [cx, cy - 0.6, WALL_Z - 0.4], radius: 2.6, strength: 0.18 }} />
      {/* the reveal */}
      <mesh material={m.trim} position={[x0 - 0.01, cy, WALL_Z - depth / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, H]} />
      </mesh>
      <mesh material={m.trim} position={[x1 + 0.01, cy, WALL_Z - depth / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, H]} />
      </mesh>
      <mesh material={m.trim} position={[cx, y1 + 0.01, WALL_Z - depth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, depth]} />
      </mesh>
      {/* frame, sashes and glass */}
      <mesh geometry={sash} material={m.trim} castShadow receiveShadow />
      <mesh material={glass} position={[cx, cy, WALL_Z - 0.3]} renderOrder={3}>
        <planeGeometry args={[W - 0.26, H - 0.26]} />
      </mesh>
      {/* the weather on the glass: one overlay per sash, its edges tucked under the frame */}
      {panes.map((p, i) => (
        <group key={i} position={[p.cx, p.cy, p.z]}>
          <WindowWeather width={p.w + 0.06} height={p.h + 0.06} bars={{ x: [0], y: [0] }} renderOrder={4} />
        </group>
      ))}
      {/* casing round the opening */}
      {[x0 - 0.23, x1 + 0.23].map((x) => (
        <mesh geometry={geometry('desk:casing-side', () => roundedBox(0.46, H + 0.1, 0.1, 0.03, 2))} key={x} material={m.trim} position={[x, (y0 + y1 + 0.1) / 2, WALL_Z + 0.05]} castShadow receiveShadow />
      ))}
      <mesh geometry={geometry('desk:casing-head', () => roundedBox(W + 1.1, 0.56, 0.12, 0.03, 2))} material={m.trim} position={[cx, y1 + 0.33, WALL_Z + 0.06]} castShadow receiveShadow />
      <mesh geometry={geometry('desk:casing-cap', () => roundedBox(W + 1.4, 0.1, 0.2, 0.035, 2))} material={m.trim} position={[cx, y1 + 0.66, WALL_Z + 0.1]} castShadow receiveShadow />
      {/* the sill (a tagged plane on a bullnosed board) and the apron below it */}
      <mesh geometry={geometry('desk:sill', () => roundedBox(W + 1.3, 0.15, SILL_OUT + depth, 0.05, 3))} material={m.trim} position={[cx, y0 - 0.075, WALL_Z + (SILL_OUT - depth) / 2]} castShadow receiveShadow />
      <mesh material={m.trim} position={[cx, y0 + 0.001, WALL_Z + (SILL_OUT - depth) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ surface: 'sill' }}>
        <planeGeometry args={[W + 1.2, SILL_OUT + depth - 0.08]} />
      </mesh>
      <mesh geometry={geometry('desk:apron', () => roundedBox(W + 0.8, 0.46, 0.08, 0.025, 2))} material={m.trim} position={[cx, y0 - 0.38, WALL_Z + 0.04]} receiveShadow />
      {/* the rod, its brackets and finials */}
      <mesh material={m.brass} position={[(rodX0 + rodX1) / 2, rodY, rodZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, rodX1 - rodX0, 16]} />
      </mesh>
      <mesh geometry={finial} material={m.brass} position={[rodX1, rodY, rodZ]} castShadow />
      <mesh geometry={finial} material={m.brass} position={[rodX0, rodY, rodZ]} rotation={[0, Math.PI, 0]} castShadow />
      {[rodX0 + 0.35, rodX1 - 0.35].map((x) => (
        <group key={x} position={[x, rodY, WALL_Z]}>
          <mesh material={m.brass} position={[0, 0, rodZ - WALL_Z - 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, rodZ - WALL_Z - 0.1, 10]} />
          </mesh>
          <mesh material={m.brass} position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.1, 0.04, 20]} />
          </mesh>
          <mesh material={m.brass} position={[0, -0.05, rodZ - WALL_Z]}>
            <torusGeometry args={[0.07, 0.016, 8, 20]} />
          </mesh>
        </group>
      ))}
      {/* the curtains with their rings and tie-backs */}
      {curtains.map((g, i) => {
        const side = i === 0 ? 1 : -1;
        const outer = i === 0 ? rodX0 + 0.25 : rodX1 - 0.25;
        return (
          <group key={i}>
            <mesh geometry={g} material={velvet} position={[outer, curtainTop, rodZ - 0.12]} castShadow receiveShadow />
            {Array.from({ length: 8 }, (_, k) => (
              <mesh key={k} material={m.brass} position={[outer + side * (0.12 + k * 0.29), rodY, rodZ]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[0.075, 0.014, 6, 18]} />
              </mesh>
            ))}
            <group position={[outer + side * 0.31, tieY, rodZ - 0.02]}>
              <mesh geometry={tieLoop} material={m.brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.85, 0.42, 1]} />
              <mesh geometry={tassel} material={m.brass} position={[side * 0.2, -0.03, 0.2]} castShadow />
            </group>
          </group>
        );
      })}
      {/* moonlight through the glass (dimmer under cloud, whiter off the snow, bright in a flash) */}
      <WindowLight position={[cx + 0.6, cy + 0.8, WALL_Z + 1.2]} />
    </group>
  );
}

const MOON = { clear: new THREE.Color('#86a2ff'), wet: new THREE.Color('#7f90bd'), snow: new THREE.Color('#aab8ee'), flash: new THREE.Color('#dfe8ff') };

/** The light through the window: its strength and colour follow the weather and the lightning. */
function WindowLight({ position }: { position: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const u = tickWeather();
    const v = u.uView.value;
    const f = getFlash();
    l.color.copy(viewColor(col, MOON.clear, MOON.wet, MOON.snow).lerp(MOON.flash, Math.min(1, f * 1.5)));
    l.intensity = 5 * v.x + 2.8 * v.y * (1 - 0.3 * u.uStorm.value) + 6.2 * v.z + f * 34;
  });
  return <pointLight ref={light} position={position} color="#86a2ff" intensity={5} distance={11} decay={2} />;
}

// ---------- the shelf ----------

/** A wrought-iron shelf bracket: a strap up the wall, an arm under the shelf `len` long, and a scroll between. */
function bracketGeometry(len: number) {
  const k = len / 0.86;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(roundedBox(0.09, 1.05, 0.05, 0.015, 2).translate(0, -0.6, 0.03));
  parts.push(roundedBox(0.09, 0.05, len, 0.015, 2).translate(0, -0.1, len / 2 + 0.02));
  const scroll = [
    [0, -0.12, 0.8],
    [0, -0.22, 0.66],
    [0, -0.42, 0.42],
    [0, -0.66, 0.2],
    [0, -0.84, 0.1],
    [0, -0.92, 0.16],
    [0, -0.86, 0.24],
    [0, -0.78, 0.2],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z * k));
  parts.push(tubeThrough(scroll, (t) => 0.024 - t * 0.008, 48, 8).geometry);
  const curl = [
    [0, -0.14, 0.62],
    [0, -0.24, 0.52],
    [0, -0.2, 0.42],
    [0, -0.12, 0.44],
    [0, -0.13, 0.5],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z * k));
  parts.push(tubeThrough(curl, () => 0.016, 30, 8).geometry);
  return mergeParts(parts, ['position', 'normal']);
}

function Shelf({ m }: { m: Mats }) {
  const { x0, x1, y, depth } = SHELF;
  const L = x1 - x0;
  const plank = useMemo(() => geometry('desk:shelf', () => planarUV(roundedBox(L, 0.2, depth, 0.05, 3), [1 / 8, 1 / 4], [0.3, 0.6])), [L, depth]);
  const bracket = useMemo(() => geometry('desk:bracket', () => bracketGeometry(depth - 0.3)), [depth]);
  return (
    <group>
      <mesh geometry={plank} material={m.body} position={[(x0 + x1) / 2, y - 0.1 - 0.002, WALL_Z + depth / 2]} castShadow receiveShadow />
      <mesh material={m.body} position={[(x0 + x1) / 2, y, WALL_Z + depth / 2 - 0.02]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ surface: 'shelf' }}>
        <planeGeometry args={[L - 0.1, depth - 0.1]} />
      </mesh>
      {[x0 + 0.75, x1 - 0.75].map((x) => (
        <mesh key={x} geometry={bracket} material={m.iron} position={[x, y - 0.2, WALL_Z]} castShadow />
      ))}
    </group>
  );
}

export function DeskRoom() {
  const m = mats();
  return (
    <group>
      <Wall m={m} />
      <Desk m={m} />
      <Floor m={m} />
      <Window m={m} />
      <Shelf m={m} />
    </group>
  );
}

/** Things you can add around the tank in this theme. */
export const DESK_ITEMS: CatalogItem[] = [
  { kind: 'desk-lamp', label: 'Desk lamp', group: 'Lighting', surfaces: ['top'], radius: 1.0, height: 4.4, Render: DeskLamp },
  { kind: 'string-lights', label: 'String lights', group: 'Lighting', surfaces: ['wall'], radius: 7.6, height: 1.0, Render: StringLights },
  { kind: 'snake-plant', label: 'Snake plant', group: 'Plants', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.6, height: 3.6, Render: SnakePlant },
  { kind: 'succulent', label: 'Echeveria', group: 'Plants', surfaces: ['top', 'shelf', 'sill'], radius: 0.5, height: 0.85, Render: Succulent },
  { kind: 'book-stack', label: 'Pile of books', group: 'Books', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 1.3, height: 1.3, Render: BookStack },
  { kind: 'book-row', label: 'Row of books', group: 'Books', surfaces: ['top', 'shelf'], radius: 1.7, height: 2.5, Render: BookRow },
  { kind: 'mug', label: 'Coffee mug', group: 'Desk things', surfaces: ['top', 'shelf', 'sill'], radius: 0.6, height: 1.0, Render: Mug },
  { kind: 'notebook', label: 'Notebook and pen', group: 'Desk things', surfaces: ['top'], radius: 1.5, height: 0.2, Render: Notebook },
  { kind: 'pencil-cup', label: 'Pencil cup', group: 'Desk things', surfaces: ['top', 'shelf'], radius: 0.5, height: 2.0, Render: PencilCup },
  { kind: 'alarm-clock', label: 'Alarm clock', group: 'Desk things', surfaces: ['top', 'shelf', 'sill'], radius: 0.7, height: 1.7, Render: AlarmClock },
  { kind: 'radio', label: 'Valve radio', group: 'Decor', surfaces: ['top', 'shelf'], radius: 1.1, height: 2.3, Render: Radio },
  { kind: 'globe', label: 'Globe', group: 'Decor', surfaces: ['top', 'shelf', 'floor'], radius: 0.8, height: 2.2, Render: Globe },
  { kind: 'framed-print', label: 'Framed print', group: 'Wall', surfaces: ['wall'], radius: 1.2, height: 2.7, Render: FramedPrint },
  { kind: 'wall-clock', label: 'Wall clock', group: 'Wall', surfaces: ['wall'], radius: 1.2, height: 2.4, Render: WallClock },
];

const ON_WALL = WALL_Z + 0.01;

/** Where they start out. */
export const DESK_LAYOUT: Placed[] = [
  // the right: the lamp leaning over the notebook and mug, books and a succulent on the shelf, a print below it
  { id: 'd-lamp', kind: 'desk-lamp', p: [10.2, TOP, -3.0], r: -0.55, s: 1, seed: 1 },
  { id: 'd-notebook', kind: 'notebook', p: [8.4, TOP, 0.3], r: -0.4, s: 1, seed: 2 },
  { id: 'd-mug', kind: 'mug', p: [7.3, TOP, 2.2], r: 2.3, s: 1, seed: 1 },
  { id: 'd-books', kind: 'book-row', p: [9.5, SHELF.y, WALL_Z + 0.9], r: 0, s: 1, seed: 4 },
  { id: 'd-succulent', kind: 'succulent', p: [12.0, SHELF.y, WALL_Z + 0.8], r: 0, s: 1, seed: 1 },
  { id: 'd-print', kind: 'framed-print', p: [11.0, 0.9, ON_WALL], r: 0, s: 1, seed: 1 },
  // above the tank
  { id: 'd-lights', kind: 'string-lights', p: [0, 6.0, ON_WALL], r: 0, s: 1, seed: 1 },
  // the left: a snake plant on the sill, the radio, a pile of books and the alarm clock
  { id: 'd-plant', kind: 'snake-plant', p: [-10.9, WIN.y0, WALL_Z + 0.05], r: 0, s: 1, seed: 3 },
  { id: 'd-radio', kind: 'radio', p: [-10.4, TOP, -3.3], r: 0.35, s: 1, seed: 1 },
  { id: 'd-pile', kind: 'book-stack', p: [-9.3, TOP, -0.9], r: 0.25, s: 1, seed: 6 },
  { id: 'd-clock', kind: 'alarm-clock', p: [-7.6, TOP, 1.6], r: 0.4, s: 1, seed: 1 },
];
