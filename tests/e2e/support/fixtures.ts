import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fixtures shared by every spec.
//
// The 3D rooms are generated in code the first time a theme opens in a
// browser profile (3 to 5 s, more on a busy machine) and saved to IndexedDB;
// later opens read them back (about 1 s). So each worker keeps one persistent
// Chrome profile, opens every theme once up front, and every test gets a new
// page in it with localStorage cleared (settings don't leak between tests;
// the saved scene in IndexedDB stays). Tests that need an empty profile make
// their own with `freshProfile()`.

/** The app under test: the running server, or another one (`AO_E2E_ORIGIN=http://localhost:5173`). */
export const ORIGIN = process.env.AO_E2E_ORIGIN ?? 'http://127.0.0.1:4777';
export const THEMES = ['office', 'kitchen', 'workshop'] as const;
export type Theme = (typeof THEMES)[number];
export const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

export interface Logged {
  kind: 'console' | 'pageerror';
  text: string;
  url: string;
}

/** Opens each theme once and waits until its scene is saved, so later opens are quick. */
async function warm(ctx: BrowserContext) {
  const page = await ctx.newPage();
  for (const t of THEMES) {
    await page.goto(`${ORIGIN}/?demo&test&world=${t}&weather=clear`);
    await page.waitForFunction(() => performance.getEntriesByName('ao:drawn').length > 0, null, { timeout: 120_000 });
    await page.waitForFunction(() => !(window as unknown as { __assets?: { busy: () => boolean } }).__assets?.busy(), null, { timeout: 120_000 });
  }
  await page.close();
}

export async function freshProfile(opts: { args?: string[]; viewport?: { width: number; height: number }; prefs?: object } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-e2e-fresh-'));
  if (opts.prefs) {
    fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify(opts.prefs));
  }
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: true,
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    args: opts.args ?? GPU_ARGS,
  });
  return {
    ctx,
    async close() {
      await ctx.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function watchErrors(page: Page, into: Logged[]) {
  page.on('console', (m) => {
    if (m.type() === 'error') into.push({ kind: 'console', text: m.text(), url: m.location().url || '' });
  });
  page.on('pageerror', (e) => into.push({ kind: 'pageerror', text: `${e.name}: ${e.message}`, url: '' }));
}

/**
 * The errors that matter: uncaught exceptions and console errors, minus the
 * browser's own note for an answer the test expected (a mocked 404/500, or a
 * demo session's detail, which has no transcript and is refused with 400).
 */
export function realErrors(list: Logged[], allow: RegExp[] = []) {
  return list.filter((e) => {
    if (e.kind === 'console' && /Failed to load resource/.test(e.text) && /\/api\/session\/|\/__seed\.txt/.test(e.url)) return false;
    return !allow.some((re) => re.test(e.text) || re.test(e.url));
  });
}

export function expectNoErrors(list: Logged[], allow: RegExp[] = []) {
  const bad = realErrors(list, allow);
  expect(bad.map((e) => `${e.kind}: ${e.text} ${e.url}`.trim()), 'errors on the page').toEqual([]);
}

interface WorkerFx {
  profile: BrowserContext;
}
interface TestFx {
  errors: Logged[];
}

export const test = base.extend<TestFx, WorkerFx>({
  profile: [
    async ({ launchOptions, channel, headless }, use) => {
      // AO_E2E_PROFILE=<dir> keeps the profile between runs (quicker warm-up while working on the tests);
      // otherwise the run's own profile (playwright.config.ts), which a worker restarted after a
      // failed test finds already warm
      const keep = process.env.AO_E2E_PROFILE || process.env.AO_E2E_RUN_PROFILE;
      const dir = keep ? path.resolve(keep) : fs.mkdtempSync(path.join(os.tmpdir(), 'ao-e2e-'));
      const ctx = await chromium.launchPersistentContext(dir, {
        ...launchOptions,
        channel,
        headless,
        viewport: { width: 1440, height: 900 },
      });
      // one blank page stays open for the worker's life, so closing a test's pages never ends the browser
      keepers.set(ctx, ctx.pages()[0] ?? (await ctx.newPage()));
      await warm(ctx);
      await use(ctx);
      await ctx.close();
      if (!keep) fs.rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker', timeout: 400_000 },
  ],

  context: async ({ profile }, use) => {
    await use(profile);
  },

  errors: async ({}, use) => {
    await use([]);
  },

  page: async ({ profile, viewport, errors }, use, testInfo) => {
    await profile.clearPermissions();
    const page = await profile.newPage();
    if (viewport) await page.setViewportSize(viewport);
    // settings start afresh (theme, weather, camera, layouts...); the saved scene stays
    const cdp = await profile.newCDPSession(page);
    await cdp.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'local_storage' });
    await cdp.detach();
    watchErrors(page, errors);
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
      const shot = await page.screenshot().catch(() => null);
      if (shot) await testInfo.attach('screenshot on failure', { body: shot, contentType: 'image/png' });
    }
    if (errors.length) await testInfo.attach('page errors', { body: errors.map((e) => `${e.kind}: ${e.text} ${e.url}`).join('\n'), contentType: 'text/plain' });
    // close everything this test opened (pop-out windows too)
    for (const p of profile.pages()) if (p !== keepers.get(profile) && !p.isClosed()) await p.close().catch(() => undefined);
  },
});

const keepers = new WeakMap<BrowserContext, Page>();

export { expect };
