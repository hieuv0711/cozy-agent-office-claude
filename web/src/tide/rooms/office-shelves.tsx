import { useMemo } from 'react';
import * as THREE from 'three';
import { SHELVES } from './office-dims';
import { C, Merger, noise3, omat, once, paint, plank, rand, smoothLathe, trs, woodTex } from './office-kit';
import { bookend, bookRow, bookStack, mugGeometry, propMats, smallPlant } from './office-props';

// A built-in bookcase along the left wall, between the lounge and the front of
// the room: dark-stained uprights and shelves under a moulded cornice, rows of
// cloth-bound books (some leaning, some lying in stacks), a few plants, a
// vase, mugs and storage boxes. The shelves are tagged for the editor.

const BAYS = 4;
const SHELF_YS = [0.1, 0.72, 1.36, 2.0, 2.62, 3.24];

function bookcaseGeometries() {
  return once('office:bookcase', () => {
    const { z0, z1, depth, top } = SHELVES;
    const x = SHELVES.x + depth / 2;
    const len = z1 - z0;
    const bay = len / BAYS;
    const frame = new Merger();
    const shelves = new Merger();
    const r = rand(61);
    // each part shaded on its own: a tone, and a little mottling
    const part = (g: THREE.BufferGeometry, k: number) => paint(g, (px, y, z, out) => out.setScalar(k * (0.92 + 0.1 * noise3(px * 3, y * 3, z * 3))));
    // uprights, a back board, the cornice and a plinth
    for (let i = 0; i <= BAYS; i++) {
      const z = z0 + i * bay;
      frame.add(part(plank(depth, top, 0.05, 0.012, [1 / 1.6, 1 / 1.6], 1, [r(), r()], true), 1), trs([x, top / 2, z]));
    }
    frame.add(part(plank(0.02, top - 0.1, len, 0.004, 1, 1), 0.45), trs([SHELVES.x + 0.012, top / 2, (z0 + z1) / 2]));
    frame.add(part(plank(depth + 0.08, 0.1, len + 0.12, 0.02, [1 / 1.6, 1 / 1.6]), 1), trs([x + 0.04, top + 0.05, (z0 + z1) / 2]));
    frame.add(part(plank(depth + 0.12, 0.05, len + 0.18, 0.02, [1 / 1.6, 1 / 1.6]), 0.9), trs([x + 0.06, top + 0.125, (z0 + z1) / 2]));
    frame.add(part(plank(depth - 0.04, 0.1, len, 0.01, 1, 1), 0.4), trs([x - 0.02, 0.05, (z0 + z1) / 2]));
    for (const y of SHELF_YS) {
      const g = part(plank(depth - 0.02, 0.04, len - 0.04, 0.01, [1 / 1.6, 1 / 1.6], 1, [r() * 3, r() * 3]), 1);
      shelves.add(g, trs([x, y + 0.02, (z0 + z1) / 2]));
    }
    return { frame: frame.build(), shelves: shelves.build() };
  });
}

type Fill = { bay: number; shelf: number; kind: 'row' | 'stack' | 'plant' | 'mug' | 'vase' | 'box' | 'bookend'; at?: number; len?: number; seed: number };

/** What stands on each shelf: mostly books, broken up by plants, boxes and things. */
const FILL: Fill[] = [
  { bay: 0, shelf: 0, kind: 'box', at: 0.05, seed: 0 },
  { bay: 0, shelf: 0, kind: 'box', at: 0.55, seed: 1 },
  { bay: 1, shelf: 0, kind: 'stack', at: 0.25, seed: 2 },
  { bay: 1, shelf: 0, kind: 'row', at: 0.5, len: 0.5, seed: 3 },
  { bay: 2, shelf: 0, kind: 'row', at: 0.03, len: 0.95, seed: 4 },
  { bay: 3, shelf: 0, kind: 'box', at: 0.1, seed: 2 },
  { bay: 3, shelf: 0, kind: 'box', at: 0.6, seed: 3 },
  { bay: 0, shelf: 1, kind: 'row', at: 0.03, len: 0.7, seed: 5 },
  { bay: 0, shelf: 1, kind: 'plant', at: 0.88, seed: 0 },
  { bay: 1, shelf: 1, kind: 'row', at: 0.03, len: 1.0, seed: 6 },
  { bay: 2, shelf: 1, kind: 'vase', at: 0.22, seed: 0 },
  { bay: 2, shelf: 1, kind: 'row', at: 0.45, len: 0.58, seed: 7 },
  { bay: 3, shelf: 1, kind: 'row', at: 0.03, len: 0.6, seed: 8 },
  { bay: 3, shelf: 1, kind: 'stack', at: 0.85, seed: 9 },
  { bay: 0, shelf: 2, kind: 'stack', at: 0.2, seed: 10 },
  { bay: 0, shelf: 2, kind: 'mug', at: 0.55, seed: 0 },
  { bay: 0, shelf: 2, kind: 'mug', at: 0.72, seed: 1 },
  { bay: 1, shelf: 2, kind: 'row', at: 0.03, len: 0.62, seed: 11 },
  { bay: 1, shelf: 2, kind: 'plant', at: 0.85, seed: 1 },
  { bay: 2, shelf: 2, kind: 'row', at: 0.03, len: 1.0, seed: 12 },
  { bay: 3, shelf: 2, kind: 'row', at: 0.15, len: 0.85, seed: 13 },
  { bay: 0, shelf: 3, kind: 'row', at: 0.03, len: 1.0, seed: 14 },
  { bay: 1, shelf: 3, kind: 'vase', at: 0.3, seed: 1 },
  { bay: 1, shelf: 3, kind: 'stack', at: 0.75, seed: 15 },
  { bay: 2, shelf: 3, kind: 'bookend', at: 0.06, seed: 0 },
  { bay: 2, shelf: 3, kind: 'row', at: 0.1, len: 0.55, seed: 16 },
  { bay: 2, shelf: 3, kind: 'plant', at: 0.85, seed: 2 },
  { bay: 3, shelf: 3, kind: 'row', at: 0.03, len: 1.0, seed: 17 },
  { bay: 0, shelf: 4, kind: 'plant', at: 0.2, seed: 3 },
  { bay: 0, shelf: 4, kind: 'row', at: 0.42, len: 0.6, seed: 18 },
  { bay: 1, shelf: 4, kind: 'row', at: 0.03, len: 1.0, seed: 19 },
  { bay: 2, shelf: 4, kind: 'box', at: 0.12, seed: 4 },
  { bay: 2, shelf: 4, kind: 'box', at: 0.6, seed: 5 },
  { bay: 3, shelf: 4, kind: 'stack', at: 0.3, seed: 20 },
  { bay: 3, shelf: 4, kind: 'vase', at: 0.75, seed: 2 },
  { bay: 0, shelf: 5, kind: 'box', at: 0.15, seed: 6 },
  { bay: 1, shelf: 5, kind: 'row', at: 0.1, len: 0.8, seed: 21 },
  { bay: 2, shelf: 5, kind: 'plant', at: 0.5, seed: 5 },
  { bay: 3, shelf: 5, kind: 'row', at: 0.03, len: 0.7, seed: 22 },
];

const BOX_COLOURS = ['#b89a6a', '#2e3a4a', '#8a3a2a', '#d8cdb4', '#3e5a46', '#6a4a30', '#c8b896'];

function fillGeometries() {
  return once('office:bookcase-fill', () => {
    const { z0, z1, depth } = SHELVES;
    const bay = (z1 - z0) / BAYS;
    const x = SHELVES.x + depth / 2 + 0.02;
    const vc = new Merger();
    const glaze = new Merger();
    const leaf = new Merger();
    const metal = new Merger();
    for (const f of FILL) {
      // along the shelf toward the back of the room is -z; spines face the room (+x)
      const zStart = z1 - f.bay * bay - 0.03;
      const along = (f.at ?? 0) * (bay - 0.06);
      const y = SHELF_YS[f.shelf] + 0.04;
      const place = (dz: number, yaw = 0) => trs([x, y, zStart - along - dz], [0, Math.PI / 2 + yaw, 0]);
      if (f.kind === 'row') vc.add(bookRow(f.len ?? 0.6, f.seed + 300, { hMin: 0.3, hMax: 0.46, d: 0.3 }), place(0));
      else if (f.kind === 'stack') vc.add(bookStack(3, f.seed + 400, 0.8), trs([x, y, zStart - along - 0.15], [0, Math.PI / 2 + 0.1, 0]));
      else if (f.kind === 'bookend') metal.add(bookend(), trs([x, y, zStart - along], [0, -Math.PI / 2, 0]));
      else if (f.kind === 'plant') {
        const g = smallPlant(f.seed + 1);
        const m = trs([x - 0.02, y, zStart - along - 0.1], [0, f.seed, 0]);
        (g.glazed ? glaze : vc).add(g.pot, m);
        vc.add(g.soil, m);
        leaf.add(g.plant, m);
      } else if (f.kind === 'mug') glaze.add(mugGeometry(['#2e4a3e', '#d8cdb4'][f.seed % 2]), trs([x - 0.04, y, zStart - along - 0.06], [0, 2.2 + f.seed, 0]));
      else if (f.kind === 'vase') {
        const n = 30;
        const v = smoothLathe(
          [
            [0, 0],
            [0.06, 0],
            [0.1, 0.06],
            [0.11, 0.14],
            [0.07, 0.24],
            [0.045, 0.3],
            [0.055, 0.34],
            [0.05, 0.345],
            [0.04, 0.3],
            [0, 0.29],
          ],
          n,
          32,
        );
        const col = C(['#2e4a5a', '#c8b48a', '#7a3a2a'][f.seed % 3]);
        paint(v, (px, py, pz, out) => out.copy(col).multiplyScalar(0.85 + 0.2 * noise3(px * 20, py * 20, pz * 20)));
        glaze.add(v, trs([x - 0.03, y, zStart - along - 0.1]));
      } else if (f.kind === 'box') {
        const c = C(BOX_COLOURS[f.seed % BOX_COLOURS.length]);
        const g = plank(0.36, 0.26, 0.3, 0.01, 1, 1);
        paint(g, (px, py, pz, out) => {
          out.copy(c).multiplyScalar(0.9 + 0.1 * noise3(px * 10, py * 10, pz * 10));
          // a lid line and a pale blank label
          if (py > 0.1 && py < 0.11) out.multiplyScalar(0.6);
          if (pz > 0.14 && Math.abs(px) < 0.07 && Math.abs(py) < 0.035) out.set('#ece4d2');
        });
        vc.add(g, trs([x - 0.04, y + 0.13, zStart - along - 0.2], [0, Math.PI / 2, 0]));
      }
    }
    return { vc: vc.build(), glaze: glaze.build(), leaf: leaf.build(), metal: metal.build() };
  });
}

export function Bookcase() {
  const wood = omat('bookcase', () => new THREE.MeshStandardMaterial({ map: woodTex('o-bookcase', { w: 512, h: 512, light: '#6a4228', dark: '#26140a', planks: 1, rings: 8, seed: 151, joints: false, seams: 0 }), roughness: 0.5, vertexColors: true }));
  const p = propMats();
  const g = bookcaseGeometries();
  const fill = useMemo(fillGeometries, []);
  return (
    <group>
      <mesh geometry={g.frame} material={wood} castShadow receiveShadow />
      <mesh geometry={g.shelves} material={wood} castShadow receiveShadow userData={{ surface: 'shelf' }} />
      <mesh geometry={fill.vc} material={p.vc} castShadow receiveShadow />
      <mesh geometry={fill.glaze} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={fill.leaf} material={p.leaf} castShadow />
      <mesh geometry={fill.metal} material={p.metal} castShadow />
    </group>
  );
}

