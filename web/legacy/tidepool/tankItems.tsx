import { useMemo } from 'react';
import * as THREE from 'three';
import { Chest } from '../tank/Chest';
import { RamenBowl, smoothLathe, Teacup, Teapot } from '../tank/kitchenware';
import { Anemone, Kelp, SeaFan, Seagrass, TubeSponges } from '../tank/plants';
import { BrainCoral, BranchCoral, Rock, sandHeight, ShellBed } from '../tank/reef';
import { cached } from '../tank/sdf';
import { paintGeometry } from '../tank/geo';
import { C, mix, noise3, smoothstep } from '../tank/util';
import { underwater } from '../tank/water';
import { useCoins } from './live';
import { SAND_Y } from './space';
import type { CatalogItem, Placed, ThemeId } from './types';

// Everything that can go in the tank. Plants, corals and rocks sway and catch
// the caustic light; beds are where an idle creature naps; a treasure fills
// with coins as the money is spent.

// A terracotta flower pot lying on its side: a classic aquarium cave.
function flowerPotGeometry() {
  const n = 120;
  const g = smoothLathe(
    [
      [0, 0],
      [0.42, 0],
      [0.45, 0.03],
      [0.62, 0.9],
      [0.72, 0.93],
      [0.74, 1.1],
      [0.7, 1.13],
      [0.66, 1.1],
      [0.64, 0.95],
      [0.56, 0.93],
      [0.4, 0.1],
      [0, 0.08],
    ],
    n,
    64,
  );
  const clay = C('#b8613c');
  const dark = C('#8a4128');
  const algae = C('#6f8445');
  const crust = C('#e2d2bd');
  return paintGeometry(g, (x, y, z, out) => {
    mix(out, dark, clay, smoothstep(-0.3, 0.3, noise3(x * 6, y * 6, z * 6)));
    mix(out, out, crust, smoothstep(0.35, 0.6, noise3(x * 14 + 3, y * 14, z * 14)) * 0.35);
    // a little algae creeping up from where it touches the sand
    mix(out, out, algae, smoothstep(-0.25, -0.55, x) * smoothstep(0.1, 0.5, noise3(x * 5, y * 5 + 9, z * 5)) * 0.7);
  });
}

function FlowerPotCave() {
  const geo = useMemo(() => cached('flower-pot-cave', flowerPotGeometry), []);
  const mat = useMemo(() => underwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), { caustics: 0.55 }), []);
  // lying on its side, mouth toward +z; tipped a little so the wide rim and the
  // narrow base both touch the sand
  return <mesh geometry={geo} material={mat} rotation={[Math.PI / 2 - 0.25, 0, 0]} position={[0, 0.55, -0.55]} castShadow receiveShadow />;
}

function ChestItem() {
  return <Chest position={[0, 0, 0]} coins={useCoins()} />;
}
function BowlItem() {
  return <RamenBowl position={[0, 0, 0]} coins={useCoins(160)} />;
}

const ROCK_SIZE: [number, number, number] = [1.0, 0.65, 0.7];

export const TANK_ITEMS: CatalogItem[] = [
  {
    kind: 'kelp',
    label: 'Kelp',
    group: 'Plants',
    surfaces: ['sand'],
    radius: 0.55,
    height: 3.9,
    maxScale: 1.1,
    Render: ({ seed }) => <Kelp position={[0, -0.02, 0]} height={3.8} seed={(seed % 6) + 1} />,
  },
  {
    kind: 'seagrass',
    label: 'Seagrass',
    group: 'Plants',
    surfaces: ['sand'],
    radius: 0.55,
    height: 0.6,
    Render: ({ seed }) => <Seagrass center={[0, -0.02, 0]} area={[0.55, 0.35]} count={45} seed={(seed % 5) + 1} />,
  },
  {
    kind: 'sea-fan',
    label: 'Sea fan',
    group: 'Corals',
    surfaces: ['sand'],
    radius: 0.55,
    height: 1.1,
    Render: ({ seed }) => <SeaFan position={[0, -0.02, 0]} color={seed % 2 ? '#c4643c' : '#a24f96'} />,
  },
  {
    kind: 'anemone',
    label: 'Anemone',
    group: 'Corals',
    surfaces: ['sand'],
    radius: 0.3,
    height: 0.45,
    Render: ({ seed }) => (seed % 2 ? <Anemone position={[0, -0.02, 0]} color="#ff8f5e" tip="#fff1b8" /> : <Anemone position={[0, -0.02, 0]} />),
  },
  {
    kind: 'branch-coral',
    label: 'Branch coral',
    group: 'Corals',
    surfaces: ['sand'],
    radius: 0.5,
    height: 0.9,
    Render: ({ seed }) => (seed % 2 ? <BranchCoral position={[0, -0.02, 0]} seed={(seed % 5) + 1} base="#ee8a55" tip="#ffe3c2" /> : <BranchCoral position={[0, -0.02, 0]} seed={(seed % 5) + 1} />),
  },
  {
    kind: 'brain-coral',
    label: 'Brain coral',
    group: 'Corals',
    surfaces: ['sand'],
    radius: 0.5,
    height: 0.35,
    Render: ({ seed }) => <BrainCoral position={[0, -0.02, 0]} seed={(seed % 3) + 1} />,
  },
  {
    kind: 'sponges',
    label: 'Tube sponges',
    group: 'Corals',
    surfaces: ['sand'],
    radius: 0.35,
    height: 0.65,
    Render: ({ seed }) => (seed % 2 ? <TubeSponges position={[0, -0.02, 0]} body="#7d5bc4" lip="#d4b8ff" /> : <TubeSponges position={[0, -0.02, 0]} />),
  },
  {
    kind: 'rock',
    label: 'Rock',
    group: 'Rocks',
    surfaces: ['sand'],
    radius: 1.0,
    height: 0.7,
    Render: ({ seed }) => <Rock position={[0, ROCK_SIZE[1] * 0.3, 0]} size={ROCK_SIZE} seed={(seed % 3) + 1} />,
  },
  {
    kind: 'flower-pot',
    label: 'Flower-pot cave',
    group: 'Ornaments',
    surfaces: ['sand'],
    radius: 0.75,
    height: 0.75,
    Render: FlowerPotCave,
  },
  {
    kind: 'teapot',
    label: 'Teapot',
    group: 'Ornaments',
    surfaces: ['sand'],
    radius: 0.8,
    height: 1.25,
    Render: () => <Teapot position={[0, -0.03, 0]} scale={1.25} />,
  },
  {
    kind: 'shell-bed',
    label: 'Shell bed',
    group: 'Beds',
    surfaces: ['sand'],
    radius: 0.9,
    height: 0.4,
    Render: () => <ShellBed position={[0, -0.02, 0]} />,
  },
  {
    kind: 'teacup',
    label: 'Teacup bed',
    group: 'Beds',
    surfaces: ['sand'],
    radius: 1.15,
    height: 0.9,
    Render: () => <Teacup position={[0, -0.03, 0]} scale={1.1} />,
  },
  {
    kind: 'chest',
    label: 'Treasure chest',
    group: 'Treasure',
    surfaces: ['sand'],
    radius: 0.6,
    height: 0.75,
    Render: ChestItem,
  },
  {
    kind: 'ramen-bowl',
    label: 'Ramen bowl of coins',
    group: 'Treasure',
    surfaces: ['sand'],
    radius: 0.9,
    height: 0.75,
    Render: BowlItem,
  },
];

/** Where an idle creature lies in a bed, relative to the bed (before the bed's turn and scale). */
export const BEDS: Record<string, { y: number; scale: number }> = {
  'shell-bed': { y: 0.07, scale: 1 },
  teacup: { y: 0.6, scale: 0.72 },
};

/** A point on the tank's sand (world coordinates). */
export const onSand = (x: number, z: number): [number, number, number] => [x, SAND_Y + sandHeight(x, z), z];

let n = 0;
const put = (kind: string, x: number, z: number, r = 0, s = 1, seed = 1): Placed => ({ id: `t${++n}`, kind, p: onSand(x, z), r, s, seed });

// The reef every tank starts with: kelp along the back, rocks, corals and grass.
const reef = (): Placed[] => [
  put('kelp', -5.4, -2.0, 0, 1.05, 1),
  put('kelp', -4.6, -2.3, 0, 0.95, 4),
  put('kelp', -1.9, -2.2, 0, 1.05, 3),
  put('kelp', 0.6, -2.3, 0, 0.9, 6),
  put('kelp', 3.3, -2.2, 0, 1.02, 5),
  put('kelp', 5.4, -1.9, 0, 1.0, 2),
  put('rock', -4.4, -1.5, 0.3, 1.1, 1),
  put('rock', 4.6, -1.4, -0.2, 1.22, 2),
  put('rock', 1.4, -1.9, 0.5, 0.68, 3),
  put('branch-coral', -1.3, -1.0, 0, 1, 2),
  put('branch-coral', 3.6, -0.35, 0, 0.75, 5),
  put('brain-coral', 2.2, -1.2, 0, 0.75, 1),
  put('sea-fan', -2.7, -2.0, 0, 1.1, 2),
  put('sea-fan', 2.8, -2.25, 0.4, 0.85, 1),
  put('anemone', 0.9, 0.45, 0, 1, 2),
  put('anemone', -0.5, 1.15, 0, 0.8, 1),
  put('sponges', -0.3, -1.8, 0, 1, 2),
  put('sponges', 5.2, 0.05, 1.2, 0.75, 1),
  put('seagrass', 2.0, 1.8, 0, 1, 1),
  put('seagrass', -5.5, 0.35, 0, 0.85, 2),
  put('seagrass', 5.4, 1.9, 0, 0.9, 3),
];

/** Each theme's tank, as it comes. */
export function defaultTank(theme: ThemeId): Placed[] {
  if (theme === 'kitchen')
    return [...reef(), put('ramen-bowl', -5.0, 1.35, 0.35, 0.95), put('teapot', -4.75, -0.55, 0.75), put('teacup', 4.3, 1.0, -0.4)];
  if (theme === 'greenhouse') return [...reef(), put('chest', -5.0, 1.4, 0.5), put('flower-pot', -4.6, -0.5, 0.9), put('shell-bed', 4.25, 1.0, -0.5)];
  return [...reef(), put('chest', -5.0, 1.4, 0.5), put('shell-bed', 4.25, 1.0, -0.5)];
}
