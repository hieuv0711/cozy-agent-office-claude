import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Static batching for a room. A room is built from a few hundred meshes, and
// every mesh is a draw call (twice, with its shadow): that, not the pixels, is
// what costs the processor most of each frame. Once a room has settled, the
// meshes that never move, never change shape and share a material are merged
// into one mesh per material, and the originals are moved to a layer nothing
// draws or hits. What stays apart: anything transparent, anything that moved
// or changed shape while we watched (clock hands, swaying cloth, a spinning
// lathe), sprites and instanced meshes. Groups that hide themselves (the
// ceiling's beams in the top view: `userData.visToggle`) keep their own
// merged meshes inside them, so they still hide.

/** Where the originals go: no camera, light or raycaster looks at this layer. */
const PARKED = 31;
/** The most vertices in one merged mesh. */
const MAX_VERTS = 1_500_000;

interface Watched {
  mesh: THREE.Mesh;
  matrix: THREE.Matrix4;
  posVersion: number;
  normVersion: number;
}

const attrSig = (g: THREE.BufferGeometry) =>
  Object.keys(g.attributes)
    .sort()
    .map((k) => {
      const a = g.attributes[k] as THREE.BufferAttribute;
      return `${k}:${a.itemSize}:${a.normalized ? 1 : 0}:${(a.array as unknown as { constructor: { name: string } }).constructor.name}`;
    })
    .join(',') + (g.index ? '|i' : '|n');

/** The nearest group that hides itself, else the root. */
function batchRootOf(o: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  let p = o.parent;
  while (p && p !== root) {
    if (p.userData?.visToggle) return p;
    p = p.parent;
  }
  return root;
}

function shownWithin(o: THREE.Object3D, root: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p && p !== root) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}

function candidates(root: THREE.Object3D): Watched[] {
  const out: Watched[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material) || !m.material || m.material.transparent || !m.material.visible) return;
    if (m.customDepthMaterial || m.customDistanceMaterial || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    const g = m.geometry;
    if (!g?.attributes.position || !g.attributes.normal || Object.keys(g.morphAttributes).length || g.groups.length > 1) return;
    if (!m.layers.isEnabled(0) || !shownWithin(m, root)) return;
    out.push({ mesh: m, matrix: m.matrixWorld.clone(), posVersion: (g.attributes.position as THREE.BufferAttribute).version, normVersion: (g.attributes.normal as THREE.BufferAttribute).version });
  });
  return out;
}

const still = (w: Watched) => {
  const g = w.mesh.geometry;
  if ((g.attributes.position as THREE.BufferAttribute).version !== w.posVersion) return false;
  if ((g.attributes.normal as THREE.BufferAttribute).version !== w.normVersion) return false;
  const a = w.mesh.matrixWorld.elements;
  const b = w.matrix.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
  return true;
};

export interface Batched {
  /** Put everything back as it was. */
  undo: () => void;
  /** Meshes before and after. */
  before: number;
  after: number;
}

/**
 * Watch the room for a moment, then merge what held still. Calls back with the
 * result (or null if it was cancelled first); the returned function cancels.
 */
export function batchStatic(root: THREE.Object3D, watchMs: number, done: (b: Batched | null) => void): () => void {
  let cancelled = false;
  const first = candidates(root);
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    root.updateMatrixWorld(true);
    const held = first.filter((w) => w.mesh.parent && shownWithin(w.mesh, root) && still(w));
    // one merged mesh per material, shadow flags, draw order, surface and parent group
    const groups = new Map<string, Watched[]>();
    for (const w of held) {
      const m = w.mesh;
      const broot = batchRootOf(m, root);
      const key = [(m.material as THREE.Material).uuid, m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0, m.renderOrder, String(m.userData?.surface ?? ''), broot.uuid, attrSig(m.geometry)].join('#');
      const list = groups.get(key);
      if (list) list.push(w);
      else groups.set(key, [w]);
    }
    const made: THREE.Mesh[] = [];
    const parked: THREE.Mesh[] = [];
    const inv = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const broot = batchRootOf(list[0].mesh, root);
      broot.updateMatrixWorld(true);
      inv.copy(broot.matrixWorld).invert();
      // split into chunks that stay under the vertex cap
      let chunk: THREE.BufferGeometry[] = [];
      let chunkMeshes: THREE.Mesh[] = [];
      let verts = 0;
      const flush = () => {
        if (chunk.length >= 2) {
          const merged = mergeGeometries(chunk, false);
          if (merged) {
            merged.computeBoundingSphere();
            merged.computeBoundingBox();
            const src = chunkMeshes[0];
            const mesh = new THREE.Mesh(merged, src.material);
            mesh.name = 'batch';
            mesh.castShadow = src.castShadow;
            mesh.receiveShadow = src.receiveShadow;
            mesh.renderOrder = src.renderOrder;
            if (src.userData?.surface) mesh.userData.surface = src.userData.surface;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            broot.add(mesh);
            made.push(mesh);
            for (const s of chunkMeshes) {
              s.layers.set(PARKED);
              parked.push(s);
            }
          }
        }
        for (const g of chunk) g.dispose();
        chunk = [];
        chunkMeshes = [];
        verts = 0;
      };
      for (const w of list) {
        const g = w.mesh.geometry;
        const n = g.attributes.position.count;
        if (verts + n > MAX_VERTS) flush();
        local.multiplyMatrices(inv, w.mesh.matrixWorld);
        const c = g.clone();
        c.clearGroups();
        c.applyMatrix4(local);
        chunk.push(c);
        chunkMeshes.push(w.mesh);
        verts += n;
      }
      flush();
    }
    const before = first.length;
    const after = before - parked.length + made.length;
    done({
      before,
      after,
      undo: () => {
        for (const m of made) {
          m.removeFromParent();
          m.geometry.dispose();
        }
        for (const s of parked) s.layers.set(0);
      },
    });
  }, watchMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
