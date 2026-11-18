import type { FC } from 'react';

// Every Claude Code session is a person at work in a cozy room at night: an
// office, a ramen kitchen or a toy workshop. Each theme can be customised by
// adding, moving and removing things (furniture, lamps, plants, decor).

export type ThemeId = 'office' | 'kitchen' | 'workshop';

/**
 * Where an item can be put. `sand` is the tank floor. The room surfaces are
 * meshes tagged with `userData={{ surface: '<name>' }}`; the editor drops
 * items onto whatever tagged mesh is under the pointer.
 */
export type Surface = 'sand' | 'top' | 'shelf' | 'sill' | 'wall' | 'floor';

export interface CatalogItem {
  /** Unique id, e.g. 'desk-lamp'. Saved in layouts, so never rename one. */
  kind: string;
  /** Shown in the customise palette. */
  label: string;
  /** Palette section, e.g. 'Plants', 'Lighting', 'Decor'. */
  group: string;
  /** Surfaces it can stand on (or, for 'wall', hang on). */
  surfaces: Surface[];
  /** Rough footprint radius and height in world units (selection ring, spacing). */
  radius: number;
  height: number;
  /** Limits for resizing in the editor (default 0.5 to 1.8). */
  minScale?: number;
  maxScale?: number;
  /**
   * The item at the origin: standing on y = 0 and facing +z. A wall item has
   * its back on the wall at the origin and faces +z, out of the wall.
   */
  Render: FC<{ seed: number }>;
}

/** One item placed in a theme. Positions are world coordinates. */
export interface Placed {
  id: string;
  kind: string;
  p: [number, number, number];
  /** Turn about y, radians. */
  r: number;
  /** Uniform scale. */
  s: number;
  /** Varies seeded details (a plant's shape, a book's colour). */
  seed: number;
}
