import * as THREE from 'three';
import type { V2 } from './plan';

// Where people can walk in a room, seen from above. Everything solid between
// ankle and chest height is in the way: the room is drawn once on the GPU from
// straight above, clipped to that band, into a small picture (a few cells per
// world unit), and the lit cells are what blocks. The walls bound it. Then the
// way from one point to another is found on that grid (A*), and straightened
// into a few corners.

/** The band people's bodies take up when they walk (world units). */
const LOW = 0.15;
const TOP = 1.5;

export class WalkMap {
  /** Cells per world unit. */
  readonly res: number;
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  /** Something stands there, widened by half a person: 1. */
  readonly blocked: Uint8Array;

  constructor(res: number, x0: number, z0: number, w: number, h: number, blocked: Uint8Array) {
    this.res = res;
    this.x0 = x0;
    this.z0 = z0;
    this.w = w;
    this.h = h;
    this.blocked = blocked;
  }

  private ix(x: number) {
    return Math.floor((x - this.x0) * this.res);
  }
  private iz(z: number) {
    return Math.floor((z - this.z0) * this.res);
  }
  private at(i: number, j: number) {
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? 1 : this.blocked[j * this.w + i];
  }
  private centre(i: number, j: number): V2 {
    return [this.x0 + (i + 0.5) / this.res, this.z0 + (j + 0.5) / this.res];
  }

  free(x: number, z: number) {
    return !this.at(this.ix(x), this.iz(z));
  }

  /** Is the straight line from a to b clear all the way? */
  clear(a: V2, b: V2) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d * this.res * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!this.free(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  }

  /** The free spot nearest to (x, z), no further than `max` away (null if there's none). */
  nearestFree(x: number, z: number, max: number): V2 | null {
    if (this.free(x, z)) return [x, z];
    const ci = this.ix(x);
    const cj = this.iz(z);
    const R = Math.ceil(max * this.res);
    let best: V2 | null = null;
    let bd = Infinity;
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) {
        if (this.at(ci + di, cj + dj)) continue;
        const [cx, cz] = this.centre(ci + di, cj + dj);
        const d = Math.hypot(cx - x, cz - z);
        if (d < bd && d <= max) {
          bd = d;
          best = [cx, cz];
        }
      }
    return best;
  }

  /** A way from a to b around everything in the way, as a few corners (b last), or null if there is none. */
  path(a: V2, b: V2): V2[] | null {
    const { w, h } = this;
    const si = this.ix(a[0]);
    const sj = this.iz(a[1]);
    const gi = this.ix(b[0]);
    const gj = this.iz(b[1]);
    if (this.at(si, sj) || this.at(gi, gj)) return null;
    const start = sj * w + si;
    const goal = gj * w + gi;
    const g = new Float32Array(w * h).fill(Infinity);
    const from = new Int32Array(w * h).fill(-1);
    const done = new Uint8Array(w * h);
    // a binary heap of [f, cell]
    const heap: number[] = [];
    const fOf = new Float32Array(w * h);
    const push = (c: number, f: number) => {
      fOf[c] = f;
      heap.push(c);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (fOf[heap[p]] <= fOf[heap[k]]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && fOf[heap[l]] < fOf[heap[m]]) m = l;
          if (r < heap.length && fOf[heap[r]] < fOf[heap[m]]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const hOf = (i: number, j: number) => {
      const dx = Math.abs(i - gi);
      const dy = Math.abs(j - gj);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    g[start] = 0;
    push(start, hOf(si, sj));
    while (heap.length) {
      const c = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === goal) break;
      const ci = c % w;
      const cj = (c - ci) / w;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (this.at(ni, nj)) continue;
          // no cutting corners past something in the way
          if (di && dj && (this.at(ci + di, cj) || this.at(ci, cj + dj))) continue;
          const n = nj * w + ni;
          if (done[n]) continue;
          const ng = g[c] + (di && dj ? Math.SQRT2 : 1);
          if (ng < g[n]) {
            g[n] = ng;
            from[n] = c;
            push(n, ng + hOf(ni, nj));
          }
        }
    }
    if (!done[goal]) return null;
    const cells: V2[] = [];
    for (let c = goal; c !== -1; c = from[c]) {
      const ci = c % w;
      cells.push(this.centre(ci, (c - ci) / w));
    }
    cells.reverse();
    cells[0] = a;
    cells[cells.length - 1] = b;
    // straighten: from each corner, on to the furthest point it can see
    const out: V2[] = [];
    let k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--)
        if (this.clear(cells[k], cells[m])) {
          far = m;
          break;
        }
      out.push(cells[far]);
      k = far;
    }
    return out;
  }
}

/** Is this object something people walk through or never bump into (people, weather, glows)? */
function passable(o: THREE.Object3D) {
  // people (crew/Person.tsx and crew/Bot.tsx name their figure "person:<outfit>") come and go
  if (o.userData?.walkIgnore || o.name.startsWith('person:')) return true;
  const m = o as THREE.Mesh;
  if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) return true;
  if (!m.isMesh) return false;
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material | undefined;
  // light pools, glows and glass: drawn without depth, or see-through
  return !!mat && (mat.transparent ? !mat.depthWrite || mat.opacity < 0.6 : false);
}

/**
 * Draws the room from above and returns where people can walk. `bounds` is the
 * floor (world x and z); `clearance` is half a person's width: nobody's centre
 * comes closer than that to anything, or to the walls.
 */
export function drawWalkMap(gl: THREE.WebGLRenderer, scene: THREE.Scene, bounds: { x0: number; x1: number; z0: number; z1: number }, res = 5, clearance = 0.45): WalkMap {
  const { x0, x1, z0, z1 } = bounds;
  const w = Math.max(4, Math.ceil((x1 - x0) * res));
  const h = Math.max(4, Math.ceil((z1 - z0) * res));
  const cam = new THREE.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, 0, TOP - LOW);
  cam.position.set((x0 + x1) / 2, TOP, (z0 + z1) / 2);
  // the picture's up is the back wall (-z), its right is +x
  cam.up.set(0, 0, -1);
  cam.lookAt((x0 + x1) / 2, 0, (z0 + z1) / 2);
  cam.updateMatrixWorld();
  const rt = new THREE.WebGLRenderTarget(w, h);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false });

  // hide what doesn't stand in anyone's way, draw, and put everything back
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o !== scene && o.visible && passable(o)) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const saved = {
    target: gl.getRenderTarget(),
    background: scene.background,
    fog: scene.fog,
    override: scene.overrideMaterial,
    shadows: gl.shadowMap.enabled,
    clear: gl.getClearColor(new THREE.Color()),
    alpha: gl.getClearAlpha(),
  };
  const px = new Uint8Array(w * h * 4);
  try {
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = white;
    gl.shadowMap.enabled = false;
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
  } finally {
    for (const o of hidden) o.visible = true;
    scene.background = saved.background;
    scene.fog = saved.fog;
    scene.overrideMaterial = saved.override;
    gl.shadowMap.enabled = saved.shadows;
    gl.setClearColor(saved.clear, saved.alpha);
    gl.setRenderTarget(saved.target);
    rt.dispose();
    white.dispose();
  }

  // pixel row 0 is the front (+z); the grid's row 0 is the back
  const raw = new Uint8Array(w * h);
  for (let py = 0; py < h; py++)
    for (let i = 0; i < w; i++) {
      const k = (py * w + i) * 4;
      if (px[k] > 24 || px[k + 1] > 24 || px[k + 2] > 24) raw[(h - 1 - py) * w + i] = 1;
    }
  // the walls: the edge of the floor
  for (let i = 0; i < w; i++) raw[i] = raw[(h - 1) * w + i] = 1;
  for (let j = 0; j < h; j++) raw[j * w] = raw[j * w + w - 1] = 1;
  // half a person's width around everything
  const r = Math.ceil(clearance * res);
  const blocked = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!raw[j * w + i]) continue;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (di * di + dj * dj > r * r) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni >= 0 && nj >= 0 && ni < w && nj < h) blocked[nj * w + ni] = 1;
        }
    }
  return new WalkMap(res, x0, z0, w, h, blocked);
}

/** The floor's extent: every mesh marked as floor, together (null if the room has none). */
export function floorBounds(scene: THREE.Scene): { x0: number; x1: number; z0: number; z1: number } | null {
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  let any = false;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData?.surface !== 'floor' || !m.visible) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    one.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    box.union(one);
    any = true;
  });
  return any ? { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z } : null;
}
