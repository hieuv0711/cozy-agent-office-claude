import { expect, expectNoErrors, freshProfile, ORIGIN, test, THEMES } from './support/fixtures';
import { chip, drawnCount, frameTimes, openScene, pickWeather, waitDrawn } from './support/app';

// 12. Speed. Frame times are measured in the page (requestAnimationFrame);
// "first frame" is the app's own `ao:drawn` mark (the third frame of a theme),
// measured from the start of the page load or from the theme change.
// The machine running the tests matters: other GPU or CPU work on it shows here.

/** The renderer's pixel ratio, every frame for a while: lowest, highest, how often it changed. */
async function pixelRatios(page: import('@playwright/test').Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ min: number; max: number; changes: number }>((resolve) => {
        const gl = (window as unknown as { __ao: { gl: { getPixelRatio: () => number } } }).__ao.gl;
        let last = gl.getPixelRatio();
        let min = last;
        let max = last;
        let changes = 0;
        const t0 = performance.now();
        const tick = () => {
          const d = gl.getPixelRatio();
          if (d !== last) changes++;
          last = d;
          min = Math.min(min, d);
          max = Math.max(max, d);
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve({ min, max, changes });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test.describe('at 2560×1344', () => {
  test.use({ viewport: { width: 2560, height: 1344 } });

  test('PF-01 smooth everywhere', async ({ page, errors }) => {
    test.setTimeout(480_000);
    await openScene(page, '?demo&test&weather=clear');
    const rows: string[] = [];
    const slow: string[] = [];
    for (const theme of THEMES) {
      if (theme !== 'office') {
        const n = await drawnCount(page);
        await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
        await waitDrawn(page, n);
      }
      for (const w of ['clear', 'sunny', 'rain', 'snow'] as const) {
        await pickWeather(page, w);
        await page.waitForTimeout(3000);
        const [f, dpr] = await Promise.all([frameTimes(page, 6000), pixelRatios(page, 6000)]);
        const line = `${theme} ${w}: ${f.fps} fps, median ${f.p50} ms, p95 ${f.p95} ms, worst ${f.max} ms, pixel ratio ${dpr.min.toFixed(2)}–${dpr.max.toFixed(2)} (${dpr.changes} changes)`;
        rows.push(line);
        if (f.p50 > 20) slow.push(line);
      }
    }
    await test.info().attach('frame times', { body: rows.join('\n'), contentType: 'text/plain' });
    test.info().annotations.push({ type: 'frame times', description: rows.join(' | ') });
    expect(slow, 'theme and weather with a median frame over 20 ms').toEqual([]);
    expectNoErrors(errors);
  });
});

test('PF-02 first open after an update', async ({ errors }) => {
  test.setTimeout(300_000);
  // an empty profile: nothing saved for this site
  const fp = await freshProfile();
  try {
    const page = await fp.ctx.newPage();
    page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: e.message, url: '' }));
    const rows: string[] = [];
    const late: string[] = [];
    for (const t of THEMES) {
      await page.goto(`${ORIGIN}/?demo&test&world=${t}`);
      await page.waitForFunction(() => performance.getEntriesByName('ao:drawn').length > 0, null, { timeout: 90_000 });
      const ms = await page.evaluate(() => Math.round(performance.getEntriesByName('ao:drawn')[0].startTime));
      rows.push(`${t}: first frame at ${ms} ms`);
      if (ms > 6000) late.push(`${t} ${ms} ms`);
      // let it save what it built before the next one (as after a look around)
      await page.waitForFunction(() => !(window as unknown as { __assets: { busy: () => boolean } }).__assets.busy(), null, { timeout: 90_000 });
    }
    test.info().annotations.push({ type: 'first opens', description: rows.join(', ') });
    expect(late, 'first frame later than 6 s').toEqual([]);
  } finally {
    await fp.close();
  }
  expectNoErrors(errors);
});

test('PF-03 later opens', async ({ page, errors }) => {
  // the worker's profile has opened (and saved) every theme before
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: number[] };
    w.__lt = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
  });
  const rows: string[] = [];
  for (const t of THEMES) {
    await page.goto(`/?demo&test&world=${t}`);
    await waitDrawn(page);
    await page.waitForTimeout(1000);
    const { drawn, longest } = await page.evaluate(() => ({
      drawn: Math.round(performance.getEntriesByName('ao:drawn')[0].startTime),
      longest: Math.max(0, ...(window as unknown as { __lt: number[] }).__lt),
    }));
    rows.push(`${t}: first frame ${drawn} ms, longest freeze ${longest} ms`);
    expect.soft(drawn, `${t}: first frame within 2 s`).toBeLessThanOrEqual(2000);
    expect.soft(longest, `${t}: no freeze longer than 1 s`).toBeLessThanOrEqual(1000);
  }
  test.info().annotations.push({ type: 'later opens', description: rows.join(', ') });
  expectNoErrors(errors);
});

test('PF-04 saved pieces equal fresh ones', async ({ page, errors }) => {
  test.setTimeout(180_000);
  const rows: string[] = [];
  for (const t of THEMES) {
    await page.goto(`/?demo&test&cachecheck&world=${t}`);
    await waitDrawn(page);
    await page.waitForTimeout(3000);
    const cc = await page.evaluate(() => {
      const c = (window as unknown as { __cacheCheck?: { geo: number; pictures: number; bad: string[] } }).__cacheCheck;
      return c ? { geo: c.geo, pictures: c.pictures, bad: [...c.bad] } : null;
    });
    expect(cc, `${t}: the check ran`).not.toBeNull();
    rows.push(`${t}: ${cc!.geo} models and ${cc!.pictures} pictures compared`);
    expect(cc!.geo + cc!.pictures, `${t}: saved pieces were used`).toBeGreaterThan(0);
    expect(cc!.bad, `${t}: saved pieces that differ from a fresh build`).toEqual([]);
  }
  test.info().annotations.push({ type: 'compared', description: rows.join(', ') });
  expectNoErrors(errors);
});

test('PF-05 switching themes', async ({ page, errors }) => {
  await openScene(page);
  const rows: string[] = [];
  for (const t of ['kitchen', 'workshop', 'office', 'kitchen', 'workshop', 'office'] as const) {
    await page.waitForTimeout(1500);
    const n = await drawnCount(page);
    const t0 = await page.evaluate(() => performance.now());
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(t);
    await waitDrawn(page, n);
    const ms = await page.evaluate((t0) => Math.round(performance.getEntriesByName('ao:drawn').at(-1)!.startTime - t0), t0);
    rows.push(`${t} ${ms} ms`);
    expect.soft(ms, `${t} draws within 1.5 s`).toBeLessThanOrEqual(1500);
  }
  test.info().annotations.push({ type: 'switches', description: rows.join(', ') });
  expectNoErrors(errors);
});

test('PF-06 a busy machine', async ({ page, errors }) => {
  await openScene(page);
  await page.waitForTimeout(1000);
  const dpr = () => page.evaluate(() => (window as unknown as { __ao: { gl: { getPixelRatio: () => number } } }).__ao.gl.getPixelRatio());
  const before = await dpr();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    const f = await frameTimes(page, 15_000);
    const after = await dpr();
    // clicks still answer
    const t0 = Date.now();
    await chip(page, 'notes-app-3f').click();
    await expect(page.locator('aside.panel[aria-label="Agent detail"]')).toBeVisible({ timeout: 5000 });
    const answer = Date.now() - t0;
    test.info().annotations.push({ type: 'CPU 4× slower', description: `${f.fps} fps, median ${f.p50} ms, p95 ${f.p95} ms; pixel ratio ${before.toFixed(2)} → ${after.toFixed(2)}; a click answered in ${answer} ms` });
    expect(f.p50, 'stays usable (median frame)').toBeLessThan(100);
    expect(answer, 'a click answers').toBeLessThan(3000);
    expect(after, 'the picture may soften, never sharpen').toBeLessThanOrEqual(before);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  expectNoErrors(errors);
});
