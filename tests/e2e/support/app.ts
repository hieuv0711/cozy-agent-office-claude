import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { decodePng, type Pixels } from './png';
import type { Theme } from './fixtures';

// Helpers that drive and read the app. Reading the 3D scene goes through the
// read-only test hooks (`?test`): window.__crew (what each person does and
// where), window.__ao (three.js scene, camera, renderer, camera controls).

/* eslint-disable @typescript-eslint/no-explicit-any */
type W = any;

export interface CrewEntry {
  act: string;
  at: string;
  x: number;
  z: number;
  /** What the weather has them wear: 'none', 'rain' or 'snow'. */
  wear?: string;
}
export type CrewMap = Record<string, CrewEntry>;
/** One sample of one person: [ms since page start, name, act, spot, x, z]. */
export type CrewRow = [number, string, string, string, number, number];

export const drawnCount = (page: Page) => page.evaluate(() => performance.getEntriesByName('ao:drawn').length);

/** Waits for the scene to draw (a theme's first frames), after `after` earlier draws. */
export async function waitDrawn(page: Page, after = 0, timeout = 60_000) {
  await page.waitForFunction((n) => performance.getEntriesByName('ao:drawn').length > n, after, { timeout });
}

export async function openScene(page: Page, query = '?demo&test') {
  await page.goto(`/${query}`);
  await waitDrawn(page);
}

export async function pickTheme(page: Page, id: Theme) {
  const n = await drawnCount(page);
  await page.getByRole('combobox', { name: 'Theme' }).selectOption(id);
  await waitDrawn(page, n);
}

export const viewTab = (page: Page, name: string) => page.locator('nav.views').getByRole('button', { name, exact: true });
export const camBtn = (page: Page, name: string) => page.locator('.camera-bar').getByRole('button', { name, exact: true });
/** The top bar's Weather choice. */
export const weatherPick = (page: Page) => page.locator('.topbar').getByRole('combobox', { name: 'Weather' });
/** Picks the weather in the top bar. */
export const pickWeather = (page: Page, w: 'clear' | 'sunny' | 'rain' | 'snow') => weatherPick(page).selectOption(w);
export const chip = (page: Page, name: string) => page.locator('.labels .chip', { has: page.locator('.chip-name', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });

export async function crew(page: Page): Promise<CrewMap> {
  return page.evaluate(() => Object.fromEntries([...((window as W).__crew || new Map())].map(([k, v]: [string, CrewEntry]) => [k, { ...v }])));
}

/** Starts sampling everyone (10 times a second) from the moment the page starts; read with readLog. */
export async function logCrew(page: Page) {
  await page.addInitScript(() => {
    const w = window as W;
    w.__log = [];
    w.__helperLog = [];
    setInterval(() => {
      const t = Math.round(performance.now());
      const c = w.__crew;
      if (c) for (const [n, v] of c) w.__log.push([t, n, v.act, v.at, v.x, v.z]);
      const sc = w.__ao?.scene;
      if (sc && w.__logHelpers) {
        // a helper: a group holding one group drawn at 0.72 of a person's size (K = 2.2)
        const hs = sc.children.filter((o: W) => o.type === 'Group' && o.children.length === 1 && o.children[0].type === 'Group' && o.children[0].scale.x > 0.2 && o.children[0].scale.x < 1.62 && o.position.lengthSq() > 0 && o.position.z < 0.5);
        w.__helperLog.push([t, hs.map((o: W) => [Math.round(o.position.x * 100) / 100, Math.round(o.position.z * 100) / 100, Math.round(o.children[0].scale.x * 100) / 100])]);
      }
    }, 100);
  });
}

/** Records the episode title card from the moment the page starts: when it shows, what it says, when it goes. */
export async function logCard(page: Page) {
  await page.addInitScript(() => {
    const w = window as W;
    w.__card = [];
    const note = () => {
      const el = document.querySelector('.episode');
      const state = el ? `${el.className}|${el.textContent}` : 'none';
      const last = w.__card[w.__card.length - 1];
      if (!last || last.state !== state) w.__card.push({ t: Math.round(performance.now()), state });
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
}

export async function readCard(page: Page): Promise<{ t: number; state: string }[]> {
  return page.evaluate(() => (window as W).__card || []);
}

export const drawnTimes = (page: Page) => page.evaluate(() => performance.getEntriesByName('ao:drawn').map((m) => Math.round(m.startTime)));

export async function readLog(page: Page, since = 0): Promise<CrewRow[]> {
  return page.evaluate((s) => ((window as W).__log || []).filter((r: CrewRow) => r[0] >= s), since);
}

export const pageNow = (page: Page) => page.evaluate(() => Math.round(performance.now()));

/** Rows for one person, optionally only those at a spot (arrived) or with an act. */
export function rowsOf(log: CrewRow[], name: string) {
  return log.filter((r) => r[1] === name);
}

/** The acts someone showed while settled at a spot whose key matches. */
export function actsAt(log: CrewRow[], name: string, spot: RegExp) {
  return new Set(rowsOf(log, name).filter((r) => spot.test(r[3])).map((r) => r[2]));
}

export async function camState(page: Page) {
  return page.evaluate(() => {
    const { camera, controls } = (window as W).__ao;
    const V = camera.position.constructor;
    const t = controls.getTarget(new V());
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return {
      pos: [r(camera.position.x), r(camera.position.y), r(camera.position.z)] as [number, number, number],
      target: [r(t.x), r(t.y), r(t.z)] as [number, number, number],
      az: r(controls.azimuthAngle),
      polar: r(controls.polarAngle),
      dist: r(controls.distance),
    };
  });
}

/** Where a world point is on the page (CSS pixels), through the live camera. */
export async function toScreen(page: Page, p: [number, number, number]) {
  return page.evaluate((p) => {
    const { camera } = (window as W).__ao;
    const canvas = document.querySelector('.stage canvas') as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    const v = new camera.position.constructor(p[0], p[1], p[2]).project(camera);
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, ndcX: v.x, ndcY: v.y, z: v.z };
  }, p);
}

/** The element that a click at this point would land on. */
export const hitAt = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y) as HTMLElement | null;
    return e ? `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : ''}` : '';
  }, [x, y]);

/** A screenshot of the 3D picture alone (name tags, title card and bars hidden). */
export async function stagePixels(page: Page): Promise<Pixels> {
  const box = await page.locator('.stage canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const png = await page.screenshot({
    clip: box,
    style: '.labels, .episode, .replay-bar, .empty-office, .customize, aside.panel, .loading { visibility: hidden !important; }',
  });
  return decodePng(png);
}

/** Sets localStorage entries before the app reads them (from a blank page on the same origin). */
export async function seedStorage(page: Page, items: Record<string, unknown>) {
  await page.route('**/__seed.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title><link rel="icon" href="data:,">' }));
  await page.goto('/__seed.html');
  await page.evaluate((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, items);
  await page.unroute('**/__seed.html');
}

/** Clears this site's localStorage (the saved scene in IndexedDB stays). */
export async function clearStorage(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:4777', storageTypes: 'local_storage' });
  await cdp.detach();
}

export const storage = (page: Page, key: string) => page.evaluate((k) => {
  const v = localStorage.getItem(k);
  try {
    return v === null ? null : JSON.parse(v);
  } catch {
    return v;
  }
}, key);

/** Top-bar counts. */
export async function topCounts(page: Page) {
  return page.evaluate(() => {
    const num = (re: RegExp) => {
      const el = [...document.querySelectorAll('.topbar .counts > *')].find((e) => re.test(e.textContent || ''));
      return el ? Number(el.querySelector('b')?.textContent ?? NaN) : 0;
    };
    return { working: num(/working$/), waiting: num(/waiting for you$/), idle: num(/idle$/), helpers: num(/helpers?$/) };
  });
}

/** Counts of name tags by the status they show. */
export async function chipCounts(page: Page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('.labels .chip')];
    return {
      working: all.filter((c) => c.classList.contains('working')).length,
      waiting: all.filter((c) => c.classList.contains('needs-you')).length,
      idle: all.filter((c) => c.classList.contains('idle')).length,
      total: all.length,
    };
  });
}

// ---------- reading the 3D scene ----------

/**
 * The room's sky lights (hemisphere and directional lights), every frame for a
 * while: how far any of them rose above its own lowest level. Steady weather
 * keeps them still; anything that flashes would make one jump.
 */
export async function sampleFlash(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ rise: number; lights: number; frames: number }>((resolve) => {
        const sc = (window as W).__ao.scene;
        const lights: { o: W; min: number; max: number }[] = [];
        sc.traverse((o: W) => {
          if (o.isHemisphereLight || o.isDirectionalLight) lights.push({ o, min: Infinity, max: -Infinity });
        });
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          for (const l of lights) {
            l.min = Math.min(l.min, l.o.intensity);
            l.max = Math.max(l.max, l.o.intensity);
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve({ rise: Math.max(0, ...lights.map((l) => l.max - l.min)), lights: lights.length, frames });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** The two waiting lamps: their light's intensity and colour. */
export async function waitLamps(page: Page) {
  return page.evaluate(() => {
    const out: { x: number; intensity: number; color: string }[] = [];
    (window as W).__ao.scene.traverse((o: W) => {
      if (o.isSpotLight && o.color.getHexString() === 'ffd84a') out.push({ x: Math.round(o.position.x * 100) / 100, intensity: Math.round(o.intensity * 10) / 10, color: o.color.getHexString() });
    });
    return out.sort((a, b) => a.x - b.x);
  });
}

/** What hangs on one person: the selection ring, the sleeping "z"s, the yellow "?". */
export async function personMarks(page: Page, name: string) {
  return page.evaluate((name) => {
    const w = window as W;
    const c = w.__crew.get(name);
    if (!c) return null;
    let root: W = null;
    w.__ao.scene.traverse((o: W) => {
      if (root || o.type !== 'Group' || o.position.y !== 0) return;
      if (Math.abs(o.position.x - c.x) > 0.08 || Math.abs(o.position.z - c.z) > 0.08) return;
      if (o.children.some((k: W) => k.isMesh && k.renderOrder === 5 && k.geometry?.type === 'RingGeometry')) root = o;
    });
    if (!root) return { found: false, ring: false, zs: false, ask: false, visible: false };
    const ring = root.children.find((k: W) => k.isMesh && k.renderOrder === 5);
    // the "z"s: a group (shown or hidden) around the three drifting sprites
    const zs = root.children.find((k: W) => k.type === 'Group' && k.children.length === 1 && k.children[0].type === 'Group' && Math.abs(k.children[0].position.y - 2.7) < 0.01 && k.children[0].children.length === 3);
    const ask = root.children.find((k: W) => k.isSprite && k.scale.x > 0.5);
    return { found: true, ring: !!ring?.visible, zs: !!zs?.visible, ask: !!ask?.visible, visible: root.visible };
  }, name);
}

/** How many people show a selection ring. */
export async function ringsShown(page: Page) {
  return page.evaluate(() => {
    let n = 0;
    (window as W).__ao.scene.traverse((o: W) => {
      if (o.isMesh && o.renderOrder === 5 && o.geometry?.type === 'RingGeometry' && o.visible && o.parent?.visible) n++;
    });
    return n;
  });
}

/** A real session's detail from this Mac's history (for cards that need one), or null if there is none. */
export async function realDetail(request: import('@playwright/test').APIRequestContext) {
  const h = (await (await request.get('/api/history?limit=60')).json()) as { sessions: { id: string; toolCalls?: number; live?: boolean; subagents?: number }[] };
  const pick = h.sessions.find((s) => (s.toolCalls ?? 0) > 10 && !s.live && (s.subagents ?? 0) > 0) || h.sessions.find((s) => (s.toolCalls ?? 0) > 5 && !s.live) || h.sessions[0];
  if (!pick) return null;
  const r = await request.get(`/api/session/${pick.id}`);
  return r.ok() ? ((await r.json()) as Record<string, unknown>) : null;
}

/** Answers every session-detail request with that detail, under the asked-for id. */
export async function serveDetail(page: Page, detail: Record<string, unknown>, patch: Record<string, unknown> = {}) {
  await page.route('**/api/session/**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ json: { ...detail, ...patch, id } });
  });
}

/** Helpers in the scene now (x, z and size). Only the working half of the room: the kitchen's diners and staff out front are not helpers. */
export async function helperFigures(page: Page): Promise<{ x: number; z: number; s: number }[]> {
  return page.evaluate(() =>
    (window as W).__ao.scene.children
      .filter((o: W) => o.type === 'Group' && o.children.length === 1 && o.children[0].type === 'Group' && o.children[0].scale.x > 0.2 && o.children[0].scale.x < 1.62 && o.position.lengthSq() > 0 && o.position.z < 0.5)
      .map((o: W) => ({ x: Math.round(o.position.x * 100) / 100, z: Math.round(o.position.z * 100) / 100, s: Math.round(o.children[0].scale.x * 100) / 100 })),
  );
}

/** The office task board: how many notes show in Doing, Waiting and Done. */
export async function boardNotes(page: Page) {
  return page.evaluate(() => {
    const g = (window as W).__ao.scene.children.find((o: W) => o.type === 'Group' && o.children.length === 38 && Math.abs(o.position.x - 12.488) < 0.05 && Math.abs(o.position.z + 3.8) < 0.05);
    if (!g) return null;
    const col = (c: number) => g.children.slice(2 + c * 12, 2 + (c + 1) * 12).filter((m: W) => m.visible).length;
    return { doing: col(0), waiting: col(1), done: col(2) };
  });
}

/** The office printer: is a page coming out, where is it, how many pages on the tray. */
export async function printer(page: Page) {
  return page.evaluate(() => {
    const g = (window as W).__ao.scene.children.find((o: W) => o.type === 'Group' && Math.abs(o.position.x - 8.15) < 0.01 && Math.abs(o.position.z + 6.06) < 0.01);
    if (!g) return null;
    const inner = g.children[1];
    const sheet = inner.children[2];
    const stack = inner.children[3];
    return { sheet: sheet.visible, z: Math.round(sheet.position.z * 1000) / 1000, pages: stack.children.filter((c: W) => c.visible).length };
  });
}

/** Samples the printer's page for a while: how many pages slid out (the sheet's travel restarting). */
export async function printerCycles(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ cycles: number; visibleFrames: number; frames: number; maxPages: number }>((resolve) => {
        const g = (window as W).__ao.scene.children.find((o: W) => o.type === 'Group' && Math.abs(o.position.x - 8.15) < 0.01 && Math.abs(o.position.z + 6.06) < 0.01);
        const sheet = g.children[1].children[2];
        const stack = g.children[1].children[3];
        let last = -1;
        let cycles = 0;
        let visibleFrames = 0;
        let frames = 0;
        let maxPages = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (sheet.visible) {
            visibleFrames++;
            const z = sheet.position.z;
            if (last >= 0 && z < last - 0.1) cycles++;
            last = z;
          }
          maxPages = Math.max(maxPages, stack.children.filter((c: W) => c.visible).length);
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve({ cycles, visibleFrames, frames, maxPages });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** The workpiece on the workshop lathe: how fast it turns (radians a second). */
export async function latheSpeed(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let mesh: W = null;
        (window as W).__ao.scene.traverse((o: W) => {
          if (!mesh && o.type === 'Group' && Math.abs(o.position.x + 7.42) < 0.02 && Math.abs(o.position.z + 5.78) < 0.02 && o.children.length === 1 && o.children[0].isMesh) mesh = o.children[0];
        });
        if (!mesh) return resolve(-1);
        const a0 = mesh.rotation.x;
        const t0 = performance.now();
        setTimeout(() => resolve((mesh.rotation.x - a0) / ((performance.now() - t0) / 1000)), 600);
      }),
  );
}

/** The workshop counter: how many of today's toys are on it. */
export async function counterToys(page: Page) {
  return page.evaluate(() => {
    const slots = [9.38, 9.02, 8.66, 8.3];
    let n = 0;
    (window as W).__ao.scene.traverse((o: W) => {
      if (o.type === 'Group' && Math.abs(o.position.z + 0.9) < 0.01 && Math.abs(o.scale.x - 2.2) < 0.01 && slots.some((x) => Math.abs(o.position.x - x) < 0.01) && o.visible) n++;
    });
    return n;
  });
}

/**
 * The weather drawn over the whole view: the falling rain and snow in front of the room, the glass we look through,
 * and on a sunny day the sun coming in through the windows (its patches on the floor and tops, and its beams).
 */
export async function weatherState(page: Page) {
  return page.evaluate(() => {
    const out: W = { rain: null, snow: null, glass: null, sun: { shown: false, level: 0, patches: 0, beams: 0 } };
    const shown = (o: W) => {
      for (let p = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    (window as W).__ao.scene.traverse((o: W) => {
      const u = o.material?.uniforms;
      if (!u) return;
      if (u.uClip || u.uInv) {
        // the sun's patches (clipped to a surface) and beams (a box worked out from its inverse)
        out.sun.level = u.uSun.value;
        if (shown(o)) {
          out.sun.shown = true;
          if (u.uClip) out.sun.patches++;
          else out.sun.beams++;
        }
        return;
      }
      if (o.renderOrder === 6 && u.uLen) out.rain = { visible: o.visible, show: u.uShow.value };
      else if (o.renderOrder === 6 && u.uSize && !u.uLen) out.snow = { visible: o.visible, show: u.uShow.value };
      else if (o.renderOrder === 50 && u.uWet) out.glass = { visible: o.visible, wet: u.uWet.value, frost: u.uFrost.value, clear: [u.uClear.value.x, u.uClear.value.y] };
    });
    // the glass on the view is drawn into a texture at half resolution: its state is on the mesh that shows it
    (window as W).__ao.scene.traverse((o: W) => {
      const g = o.userData?.glass;
      if (o.renderOrder === 50 && g) out.glass = { visible: o.visible, wet: g.wet, frost: g.frost, clear: g.clear };
    });
    return out as {
      rain: { visible: boolean; show: number } | null;
      snow: { visible: boolean; show: number } | null;
      glass: { visible: boolean; wet: number; frost: number; clear: [number, number] } | null;
      sun: { shown: boolean; level: number; patches: number; beams: number };
    };
  });
}

/** The colour grade over the picture: [place functions..., weather brightness, saturate, contrast, hue]. */
export async function grade(page: Page) {
  const f = await page.evaluate(() => getComputedStyle(document.querySelector('.stage canvas') as Element).filter);
  const fns = [...f.matchAll(/([a-z-]+)\(([-\d.]+)(deg)?\)/g)].map((m) => ({ fn: m[1], v: Number(m[2]) }));
  // the weather's part is the last four functions
  const w = fns.slice(-4);
  return { raw: f, brightness: w[0]?.v ?? NaN, saturate: w[1]?.v ?? NaN, contrast: w[2]?.v ?? NaN, hue: w[3]?.v ?? NaN };
}

/** Frame times over a span, measured in the page. */
export async function frameTimes(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ fps: number; p50: number; p95: number; max: number; n: number }>((resolve) => {
        const frames: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else {
            frames.sort((a, b) => a - b);
            const n = frames.length;
            const pct = (p: number) => Math.round(frames[Math.min(n - 1, Math.floor(n * p))] * 10) / 10;
            resolve({ fps: Math.round((n / (ms / 1000)) * 10) / 10, p50: pct(0.5), p95: pct(0.95), max: Math.round(frames[n - 1]), n });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** Rough check that the picture is not blank: some light and some contrast. */
export function expectDrawn(px: Pixels, stats: { mean: number; std: number }, label = 'the 3D picture') {
  expect(stats.mean, `${label}: some light`).toBeGreaterThan(4);
  expect(stats.std, `${label}: something drawn (contrast)`).toBeGreaterThan(6);
  return px;
}
