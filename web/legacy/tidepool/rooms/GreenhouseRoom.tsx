import type { CatalogItem, Placed } from '../types';
import { SHELF_Y, SHELF_Z, TOP, WALL_Z } from './greenhouse-plan';
import { BostonFern, Geranium, HangingPlanter, LemonTree, Monstera, Orchid, SnakePlant, SucculentBowl } from './greenhouse-plants';
import { GreenhouseShell } from './greenhouse-shell';
import { Lantern, PotStack, SeedTray, Snail, TrowelAndGloves, WateringCan } from './greenhouse-things';

// The Greenhouse theme: the tank on an oak potting bench in a glasshouse at
// night, rain on the glass, the moonlit garden beyond, festoon lights along the
// beams, and pots and plants all around that can be moved, added or removed.

export function GreenhouseRoom() {
  return <GreenhouseShell />;
}

/** Things you can add around the tank in this theme. */
export const GREENHOUSE_ITEMS: CatalogItem[] = [
  { kind: 'gh-monstera', label: 'Monstera', group: 'Plants', surfaces: ['top', 'floor'], radius: 1.6, height: 4.5, Render: Monstera },
  { kind: 'gh-fern', label: 'Boston fern', group: 'Plants', surfaces: ['top', 'shelf', 'floor'], radius: 1.5, height: 2.2, Render: BostonFern },
  { kind: 'gh-snake-plant', label: 'Snake plant', group: 'Plants', surfaces: ['top', 'shelf', 'floor'], radius: 0.6, height: 3.5, Render: SnakePlant },
  { kind: 'gh-succulents', label: 'Succulent bowl', group: 'Plants', surfaces: ['top', 'shelf', 'sill'], radius: 0.8, height: 0.7, Render: SucculentBowl },
  { kind: 'gh-geranium', label: 'Geranium', group: 'Plants', surfaces: ['top', 'shelf', 'sill'], radius: 0.8, height: 2.1, Render: Geranium },
  { kind: 'gh-orchid', label: 'Moth orchid', group: 'Plants', surfaces: ['top', 'shelf', 'sill'], radius: 0.7, height: 2.9, Render: Orchid },
  { kind: 'gh-lemon-tree', label: 'Lemon tree', group: 'Plants', surfaces: ['top', 'floor'], radius: 1.4, height: 4.5, Render: LemonTree },
  { kind: 'gh-pot-stack', label: 'Clay pots', group: 'Pots', surfaces: ['top', 'shelf', 'floor'], radius: 1.0, height: 1.4, Render: PotStack },
  { kind: 'gh-watering-can', label: 'Watering can', group: 'Garden tools', surfaces: ['top', 'shelf', 'floor'], radius: 1.0, height: 1.5, Render: WateringCan },
  { kind: 'gh-seed-tray', label: 'Seed tray', group: 'Garden tools', surfaces: ['top', 'shelf'], radius: 1.0, height: 0.6, Render: SeedTray },
  { kind: 'gh-trowel', label: 'Trowel & gloves', group: 'Garden tools', surfaces: ['top', 'shelf'], radius: 0.7, height: 0.25, Render: TrowelAndGloves },
  { kind: 'gh-lantern', label: 'Candle lantern', group: 'Lighting', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.45, height: 1.9, Render: Lantern },
  { kind: 'gh-hanging-planter', label: 'Hanging basket', group: 'Hanging', surfaces: ['wall'], radius: 0.8, height: 3.2, Render: HangingPlanter },
  { kind: 'gh-snail', label: 'Snail', group: 'Decor', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.45, height: 0.6, Render: Snail },
];

const at = (id: string, kind: string, p: [number, number, number], r = 0, seed = 1, s = 1): Placed => ({ id, kind, p, r, s, seed });

/** Where they start out. */
export const GREENHOUSE_LAYOUT: Placed[] = [
  at('g1', 'gh-monstera', [-16, TOP, -2.0]),
  at('g2', 'gh-lemon-tree', [-12.2, TOP, -2.0]),
  at('g3', 'gh-snake-plant', [-8.8, TOP, -2.2]),
  at('g4', 'gh-watering-can', [-16.5, TOP, 1.8], 0.6),
  at('g5', 'gh-pot-stack', [-13.4, TOP, 1.7]),
  at('g6', 'gh-seed-tray', [-10.4, TOP, 1.7]),
  at('g7', 'gh-lantern', [-7.6, TOP, 1.8]),
  at('g8', 'gh-fern', [9.2, TOP, -2.0]),
  at('g9', 'gh-orchid', [12.4, TOP, -2.2]),
  at('g10', 'gh-geranium', [15.6, TOP, -2.2]),
  at('g11', 'gh-succulents', [8.0, TOP, 1.8]),
  at('g12', 'gh-trowel', [10.6, TOP, 1.8]),
  at('g13', 'gh-snail', [7.05, TOP, 2.95], -0.9),
  at('g14', 'gh-hanging-planter', [16.2, 4.6, WALL_Z]),
  at('g15', 'gh-orchid', [-11.4, SHELF_Y, SHELF_Z], 0, 2),
];
