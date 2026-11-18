import type { CatalogItem, Placed } from './types';

// Draws a theme's placed items. The editor wraps this with selection and
// dragging; on its own it is just the furniture.

export function ItemsLayer({ items, catalog }: { items: Placed[]; catalog: Map<string, CatalogItem> }) {
  return (
    <group>
      {items.map((it) => {
        const def = catalog.get(it.kind);
        if (!def) return null;
        const R = def.Render;
        return (
          <group key={it.id} position={it.p} rotation={[0, it.r, 0]} scale={it.s}>
            <R seed={it.seed} />
          </group>
        );
      })}
    </group>
  );
}
