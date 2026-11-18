import * as THREE from 'three';

// A store of the scene's generated assets, kept in this browser between
// visits. The rooms paint their textures and build their geometry in code,
// which takes a second or more each time a theme opens; the first visit after
// an update builds them and saves them here, and later visits read them back
// in a fraction of that. Entries belong to the code that made them (a
// fingerprint of the modules that paint and build assets, worked out at build
// time in web/vite.config.ts: an update that changes that code starts afresh,
// any other update keeps them) and to the theme that was open when they were
// made (only that theme's are read when it opens). Development builds don't
// use it.

declare const __ASSETS__: string;
const VERSION = typeof __ASSETS__ === 'string' ? __ASSETS__ : 'dev';
const ENABLED = VERSION !== 'dev' && typeof indexedDB !== 'undefined';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

/** Test scripts get hooks into the scene in development, or with `?test` in the address. */
export const TEST_HOOKS = import.meta.env.DEV || params.has('test');

/**
 * `?cachecheck`: every saved piece that is used is also built afresh and the
 * two are compared (pictures pixel by pixel, geometry value by value); the
 * results are in window.__cacheCheck. Slower: for testing only.
 */
export const cacheCheck = { on: ENABLED && params.has('cachecheck'), geo: 0, pictures: 0, bad: [] as string[] };
if (cacheCheck.on && typeof window !== 'undefined') (window as unknown as { __cacheCheck?: unknown }).__cacheCheck = cacheCheck;
const DB_NAME = 'ao-assets';
const STORE = 'assets';

interface SerialAttr {
  array: ArrayLike<number> & { buffer: ArrayBufferLike; byteLength: number };
  itemSize: number;
  normalized: boolean;
}
interface SerialGeo {
  attrs: Record<string, SerialAttr>;
  index: SerialAttr | null;
  groups: { start: number; count: number; materialIndex?: number }[];
}
/** A tree of plain objects, arrays and plain values whose leaves may be geometry. */
type SerialTree = { g: SerialGeo } | { a: SerialTree[] } | { o: Record<string, SerialTree> } | { v: string | number | boolean | null };
type Rec = { kind: 'tex'; w: number; h: number; blob: Blob } | { kind: 'tree'; tree: SerialTree };

/** What the open theme has saved: decoded pictures and geometry, ready to take synchronously. */
const bitmaps = new Map<string, ImageBitmap>();
const geos = new Map<string, Rec>();
let theme = 'none';
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (!ENABLED) return Promise.resolve(null);
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

const prefix = (t: string) => `${VERSION}|${t}|`;

const preloads = new Map<string, Promise<void>>();

/** Read everything the theme saved before, decoding its pictures off the main thread (once per theme and visit). */
export function preloadAssets(t: string): Promise<void> {
  theme = t;
  let p = preloads.get(t);
  if (!p) {
    p = readTheme(t);
    preloads.set(t, p);
  }
  return p;
}

async function readTheme(t: string): Promise<void> {
  const d = await db();
  if (!d) return;
  const range = IDBKeyRange.bound(prefix(t), prefix(t) + '￿');
  const rows = await new Promise<{ key: string; value: Rec }[]>((resolve) => {
    const out: { key: string; value: Rec }[] = [];
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor(range);
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out.push({ key: String(c.key).slice(prefix(t).length), value: c.value as Rec });
        c.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
  await Promise.all(
    rows.map(async ({ key, value }) => {
      if (value.kind === 'tex') {
        try {
          bitmaps.set(key, await createImageBitmap(value.blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }));
        } catch {
          // a picture that doesn't decode is simply painted again
        }
      } else geos.set(key, value);
    }),
  );
  scheduleCleanup();
}

/** The theme that new entries belong to. */
export function setAssetTheme(t: string) {
  theme = t;
}

// ---------- geometry ----------

function serialAttr(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): SerialAttr | null {
  if (!(a as THREE.BufferAttribute).isBufferAttribute) return null;
  const b = a as THREE.BufferAttribute;
  return { array: (b.array as Float32Array).slice(), itemSize: b.itemSize, normalized: b.normalized };
}

function serialGeo(g: THREE.BufferGeometry): SerialGeo | null {
  const attrs: Record<string, SerialAttr> = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    const s = serialAttr(a);
    if (!s) return null;
    attrs[name] = s;
  }
  // morph targets and custom data aren't kept: geometry with them is built each time
  if (Object.keys(g.morphAttributes).length || Object.keys(g.userData).length) return null;
  const index = g.index ? serialAttr(g.index) : null;
  return { attrs, index, groups: g.groups.map((x) => ({ ...x })) };
}

function geoFrom(s: SerialGeo): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(s.attrs)) g.setAttribute(name, new THREE.BufferAttribute(a.array as unknown as Float32Array, a.itemSize, a.normalized));
  if (s.index) g.setIndex(new THREE.BufferAttribute(s.index.array as unknown as Uint32Array, 1));
  for (const gr of s.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const isGeo = (v: unknown): v is THREE.BufferGeometry => !!v && (v as THREE.BufferGeometry).isBufferGeometry === true;
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** A value as a tree (geometry, plain values, arrays and plain objects of them), or null if it holds anything else. */
function serialTree(v: unknown, depth = 0): SerialTree | null {
  if (depth > 6) return null;
  if (isGeo(v)) {
    const g = serialGeo(v);
    return g ? { g } : null;
  }
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return { v };
  if (Array.isArray(v)) {
    const a: SerialTree[] = [];
    for (const x of v) {
      const t = serialTree(x, depth + 1);
      if (!t) return null;
      a.push(t);
    }
    return { a };
  }
  if (isPlain(v)) {
    const o: Record<string, SerialTree> = {};
    for (const [k, x] of Object.entries(v)) {
      const t = serialTree(x, depth + 1);
      if (!t) return null;
      o[k] = t;
    }
    return { o };
  }
  return null;
}

function treeFrom(t: SerialTree): unknown {
  if ('g' in t) return geoFrom(t.g);
  if ('a' in t) return t.a.map(treeFrom);
  if ('o' in t) return Object.fromEntries(Object.entries(t.o).map(([k, x]) => [k, treeFrom(x)]));
  return t.v;
}

/** Saved geometry (or a plain structure holding geometry) for this key, if there is one. */
export function takeGeometry<T>(key: string): T | undefined {
  const r = geos.get(key);
  if (!r || r.kind !== 'tree') return undefined;
  geos.delete(key);
  return treeFrom(r.tree) as T;
}

// Builds nest (a room's merged furniture is made from toys and parts that are
// builds of their own). Only the outermost build that can be kept is saved:
// the parts inside it would be stored twice for nothing. A build that can't be
// kept (it holds a material, say) passes its parts' entries up instead.
const frames: [string, Rec][][] = [];

/** A build is starting (call before it, and endBuild after). */
export function beginBuild() {
  if (ENABLED) frames.push([]);
}

/** A build has finished: keep its geometry (or a plain structure of geometry and plain values) for next time, if it can be kept. */
export function endBuild(key: string, v: unknown) {
  if (!ENABLED) return;
  const inner = frames.pop() ?? [];
  const parent = frames[frames.length - 1];
  const tree = isGeo(v) || Array.isArray(v) || isPlain(v) ? serialTree(v) : null;
  const holdsGeometry = !!tree && JSON.stringify(tree, (_k, x) => (ArrayBuffer.isView(x) ? 0 : x)).includes('"g"');
  const mine: [string, Rec][] = holdsGeometry ? [[key, { kind: 'tree', tree: tree! }]] : inner;
  if (parent) parent.push(...mine);
  else for (const [k, r] of mine) queue(k, r);
}

/** In `?cachecheck`: compare a saved value with one built afresh. */
export function checkGeometry(key: string, saved: unknown, fresh: unknown) {
  if (!cacheCheck.on) return;
  cacheCheck.geo++;
  const why = sameTree(saved, fresh);
  if (why) cacheCheck.bad.push(`${key}: ${why}`);
}

function sameTree(a: unknown, b: unknown, path = ''): string | null {
  if (isGeo(a) || isGeo(b)) {
    if (!isGeo(a) || !isGeo(b)) return `${path} geometry vs not`;
    const ka = Object.keys(a.attributes).sort().join();
    const kb = Object.keys(b.attributes).sort().join();
    if (ka !== kb) return `${path} attributes ${ka} vs ${kb}`;
    for (const name of Object.keys(a.attributes)) {
      const x = (a.attributes[name] as THREE.BufferAttribute).array;
      const y = (b.attributes[name] as THREE.BufferAttribute).array;
      if (x.length !== y.length) return `${path}.${name} length ${x.length} vs ${y.length}`;
      let worst = 0;
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - y[i]));
      if (worst > 1e-6) return `${path}.${name} differs by up to ${worst}`;
    }
    const ia = a.index?.array;
    const ib = b.index?.array;
    if (!!ia !== !!ib || (ia && ib && (ia.length !== ib.length || ia.some((n, i) => n !== ib[i])))) return `${path} index differs`;
    if (JSON.stringify(a.groups) !== JSON.stringify(b.groups)) return `${path} groups differ`;
    return null;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${path} array shape`;
    for (let i = 0; i < a.length; i++) {
      const w = sameTree(a[i], b[i], `${path}[${i}]`);
      if (w) return w;
    }
    return null;
  }
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a).sort().join();
    if (ka !== Object.keys(b).sort().join()) return `${path} keys differ`;
    for (const k of Object.keys(a)) {
      const w = sameTree(a[k], b[k], `${path}.${k}`);
      if (w) return w;
    }
    return null;
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-9 ? `${path} ${a} vs ${b}` : null;
  return a === b ? null : `${path} ${String(a)} vs ${String(b)}`;
}

// ---------- pictures ----------

/** Draw the saved picture for this key into the canvas, if there is one (it is then let go). */
export function takePicture(key: string, c: HTMLCanvasElement): boolean {
  const b = bitmaps.get(key);
  if (!b) return false;
  bitmaps.delete(key);
  if (b.width !== c.width || b.height !== c.height) {
    b.close();
    return false;
  }
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.drawImage(b, 0, 0);
  b.close();
  return true;
}

/** In `?cachecheck`: compare a restored picture with one painted afresh (a pixel may be off by a step or two from the PNG round trip). */
export function checkPicture(key: string, saved: HTMLCanvasElement, fresh: HTMLCanvasElement) {
  if (!cacheCheck.on) return;
  cacheCheck.pictures++;
  const a = (saved.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, saved.width, saved.height).data;
  const b = (fresh.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, fresh.width, fresh.height).data;
  let off = 0;
  let worst = 0;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[i + c] - b[i + c]));
    worst = Math.max(worst, d);
    if (d > 3) off++;
  }
  const frac = off / (a.length / 4);
  if (frac > 0.001) cacheCheck.bad.push(`${key}: ${(frac * 100).toFixed(2)}% of pixels differ (up to ${worst})`);
}

// ---------- saving ----------

// Nothing is saved until the scene has drawn (saving competes with the first
// frames). Then, in the background: pictures are encoded one at a time, and
// everything is written in small transactions (a few MB each), so a page that
// closes half way keeps what was written; what's missing is built again next
// time.

/** Pictures waiting to be encoded. */
const toEncode: { key: string; c: HTMLCanvasElement; t: string }[] = [];
/** Entries waiting to be written. */
const toWrite: [string, Rec][] = [];
let drawn = false;
let saving = false;
/** Storage can't be opened (blocked site data, private mode): nothing is kept or retried. */
let unavailable = false;

/** Keep a painted canvas for next time (a copy: the original may be painted on later, a clock face). */
export function keepPicture(key: string, c: HTMLCanvasElement) {
  if (!ENABLED || unavailable || c.width * c.height > 4096 * 4096) return;
  const copy = document.createElement('canvas');
  copy.width = c.width;
  copy.height = c.height;
  (copy.getContext('2d') as CanvasRenderingContext2D).drawImage(c, 0, 0);
  toEncode.push({ key, c: copy, t: theme });
  kick();
}

function queue(key: string, rec: Rec, t = theme) {
  if (unavailable) return;
  toWrite.push([prefix(t) + key, rec]);
  kick();
}

/** The scene is up: saving may start. */
export function sceneDrawn() {
  if (!ENABLED) return;
  drawn = true;
  kick(1500);
}

function kick(delay = 400) {
  if (!drawn || saving || unavailable) return;
  saving = true;
  window.setTimeout(() => void save(), delay);
}

const CHUNK = 6e6;

function recBytes(r: Rec): number {
  if (r.kind === 'tex') return r.blob.size;
  const walk = (t: SerialTree): number => {
    if ('g' in t) return Object.values(t.g.attrs).reduce((n, a) => n + a.array.byteLength, 0) + (t.g.index ? t.g.index.array.byteLength : 0);
    if ('a' in t) return t.a.reduce((n, x) => n + walk(x), 0);
    if ('o' in t) return Object.values(t.o).reduce((n, x) => n + walk(x), 0);
    return 8;
  };
  return walk(r.tree);
}

const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function save() {
  const d = await db();
  if (!d) {
    // no storage: let go of what was waiting, and don't try again
    unavailable = true;
    toEncode.length = 0;
    toWrite.length = 0;
    saving = false;
    return;
  }
  try {
    while (d && (toEncode.length || toWrite.length)) {
      const job = toEncode.shift();
      if (job) {
        const blob = await new Promise<Blob | null>((r) => job.c.toBlob(r, 'image/png'));
        if (blob) toWrite.push([prefix(job.t) + job.key, { kind: 'tex', w: job.c.width, h: job.c.height, blob }]);
        job.c.width = job.c.height = 0;
      }
      // write once a chunk's worth is waiting, or when nothing is left to encode
      let bytes = 0;
      for (const [, r] of toWrite) bytes += recBytes(r);
      if (toWrite.length && (bytes >= CHUNK || !toEncode.length)) {
        const batch: [string, Rec][] = [];
        let n = 0;
        while (toWrite.length && (n < CHUNK || !batch.length)) {
          const e = toWrite.shift()!;
          n += recBytes(e[1]);
          batch.push(e);
        }
        await write(d, batch);
      }
      await pause(30);
    }
  } finally {
    saving = false;
    if (toEncode.length || toWrite.length) kick();
  }
}

function write(d: IDBDatabase, batch: [string, Rec][]): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      tx.oncomplete = tx.onabort = tx.onerror = () => resolve();
      const s = tx.objectStore(STORE);
      for (const [k, v] of batch) s.put(v, k);
    } catch {
      // out of space or a value that can't be stored: it is built again next time
      resolve();
    }
  });
}

let cleaned = false;
/** Entries from older builds are dropped by key range (without reading them), a little after the page has loaded. */
function scheduleCleanup() {
  if (cleaned) return;
  cleaned = true;
  window.setTimeout(async () => {
    const d = await db();
    if (!d) return;
    try {
      const s = d.transaction(STORE, 'readwrite').objectStore(STORE);
      s.delete(IDBKeyRange.upperBound(`${VERSION}|`, true));
      s.delete(IDBKeyRange.lowerBound(`${VERSION}|\uffff`, true));
    } catch {
      // nothing to clean
    }
  }, 5000);
}

// Test scripts can wait until the scene has been saved (`?test`).
if (TEST_HOOKS && typeof window !== 'undefined') {
  (window as unknown as { __assets?: unknown }).__assets = {
    enabled: ENABLED,
    /** True until the scene has drawn and everything new is written. */
    busy: () => ENABLED && !unavailable && (!drawn || saving || toEncode.length > 0 || toWrite.length > 0),
  };
}
