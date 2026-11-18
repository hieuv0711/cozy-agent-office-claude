import type { Page } from '@playwright/test';
import { regionStats } from './support/png';
import { expect, expectNoErrors, freshProfile, ORIGIN, test } from './support/fixtures';
import { chip, crew, drawnCount, expectDrawn, frameTimes, logCrew, openScene, pickWeather, realDetail, stagePixels, storage, topCounts, waitDrawn, weatherPick } from './support/app';
import { MockOffice, session, type Session } from './support/mock';

// 14. Edge cases and errors, with made-up office data (support/mock.ts).

async function mocked(page: Page, sessions: Session[], extra = '') {
  await logCrew(page);
  const mock = await new MockOffice(page, sessions).install();
  await openScene(page, `?test&weather=clear${extra}`);
  return mock;
}

test('ED-01 no sessions', async ({ page, errors }) => {
  await mocked(page, []);
  await expect(page.locator('.empty-office')).toHaveText(/^No Claude Code session is running\. Start one in any terminal and /);
  await expect(page.locator('.labels .chip')).toHaveCount(0);
  expect(Object.keys(await crew(page))).toHaveLength(0);
  // the room still draws
  await page.waitForTimeout(800);
  const px = await stagePixels(page);
  expectDrawn(px, regionStats(px), 'the empty room');
  expect(await topCounts(page)).toEqual({ working: 0, waiting: 0, idle: 0, helpers: 0 });
  expectNoErrors(errors);
});

test('ED-02 more sessions than work spots', async ({ page, errors }) => {
  const twenty = Array.from({ length: 20 }, (_, i) =>
    session({
      name: `s-${String(i + 1).padStart(2, '0')}`,
      status: i === 5 || i === 12 ? 'needs-you' : i % 7 === 3 ? 'idle' : 'working',
      tool: ['Edit', 'edit', `f${i}.ts`],
      since: 30 + i,
    }),
  );
  await mocked(page, twenty, '&breaks=0');
  // everyone gets a person and a tag
  await expect(page.locator('.labels .chip')).toHaveCount(20);
  await expect.poll(async () => Object.keys(await crew(page)).length).toBe(20);
  // counts say 20
  const c = await topCounts(page);
  expect(c.working + c.waiting + c.idle).toBe(20);
  expect(c).toEqual({ working: 15, waiting: 2, idle: 3, helpers: 0 });
  await expect(page.locator('.rail-label')).toContainText('20 sessions');
  // the extras squeeze in beside the work spots; nobody on top of anybody
  await page.waitForTimeout(6000);
  const people = Object.entries(await crew(page));
  const settled = people.filter(([, v]) => !v.at.startsWith('→'));
  expect(settled.length, 'everyone has arrived somewhere').toBe(20);
  const clashes: string[] = [];
  for (let i = 0; i < settled.length; i++)
    for (let j = i + 1; j < settled.length; j++) {
      const [a, va] = settled[i];
      const [b, vb] = settled[j];
      if (Math.hypot(va.x - vb.x, va.z - vb.z) < 0.5) clashes.push(`${a} ${va.at} and ${b} ${vb.at}`);
    }
  expect(clashes).toEqual([]);
  const extra = settled.filter(([, v]) => /^st:(9|1\d)$/.test(v.at));
  expect(extra.length, 'some work beyond the nine spots').toBeGreaterThan(0);
  expectNoErrors(errors);
});

test('ED-03 server down, then back', async ({ page, errors }) => {
  const mock = await mocked(page, [session({ name: 'alpha', tool: ['Edit', 'edit', 'a.ts'] }), session({ name: 'bravo', status: 'idle', since: 40 })]);
  const note = page.locator('.topbar .conn');
  await expect(note).toHaveCount(0);
  // the server stops answering (its event stream breaks, and so does every /api/office)
  await mock.fail();
  await expect(note).toHaveText('Reconnecting…');
  // the scene keeps running
  const f = await frameTimes(page, 2000);
  expect(f.fps, 'still drawing').toBeGreaterThan(20);
  await expect(page.locator('.labels .chip')).toHaveCount(2);
  await page.waitForTimeout(3500);
  await expect(note, 'still reconnecting while it is down').toBeVisible();
  // it answers again, with news: the note goes, the people follow
  mock.sessions = mock.sessions.map((s) => (s.name === 'alpha' ? { ...s, status: 'needs-you', waitingFor: 'permission prompt', statusSince: Date.now(), rev: 2 } : s));
  await mock.recover();
  await expect(note).toHaveCount(0);
  await expect.poll(async () => (await crew(page)).alpha?.at, { timeout: 20_000 }).toBe('wait:0');
  await expect(chip(page, 'alpha')).toHaveClass(/needs-you/);
  expectNoErrors(errors, [/ERR_CONNECTION_REFUSED|Failed to load resource/]);
});

test('ED-04 a selected session ends', async ({ page, request, errors }) => {
  // the card's detail comes from a real session of this Mac when there is one
  const real = await realDetail(request);
  let live = true;
  const mock = await new MockOffice(page, [session({ name: 'ending', title: 'Ends while selected', tool: ['Edit', 'edit', 'a.ts'] }), session({ name: 'staying', tool: ['Read', 'read', 'b.md'] })]).install();
  if (real) {
    await page.route('**/api/session/**', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').pop();
      return route.fulfill({ json: { ...real, id, title: 'Ends while selected', live } });
    });
  }
  await logCrew(page);
  await openScene(page, '?test&weather=clear');
  await chip(page, 'ending').click();
  const card = page.locator('aside.panel[aria-label="Agent detail"]');
  await expect(card.locator('h1')).toHaveText('Ends while selected');
  // it ends
  live = false;
  await mock.push(mock.sessions.filter((s) => s.name !== 'ending'));
  await expect(chip(page, 'ending').locator('.chip-sub')).toHaveText('Went home');
  await expect.poll(async () => (await crew(page)).ending?.at, { message: 'walks out' }).toMatch(/door$/);
  // the card closes, or says it ended
  await expect
    .poll(async () => ((await card.count()) === 0 ? 'closed' : (await card.locator('.pills').textContent())?.includes('Ended') ? 'says ended' : (await card.textContent())?.slice(0, 120)), { timeout: 10_000 })
    .toMatch(/^(closed|says ended)$/);
  test.info().annotations.push({ type: 'card', description: (await card.count()) ? 'the card stays and says Ended' : 'the card closed' });
  expectNoErrors(errors);
});

test('ED-05 fast switching', async ({ page, errors }) => {
  await openScene(page);
  const select = page.getByRole('combobox', { name: 'Theme' });
  const themes = ['kitchen', 'workshop', 'office', 'kitchen', 'office', 'workshop', 'kitchen', 'office', 'kitchen', 'workshop'];
  const weathers = ['rain', 'sunny', 'snow', 'clear', 'rain', 'sunny', 'snow', 'clear', 'rain', 'sunny'] as const;
  const n = await drawnCount(page);
  for (let i = 0; i < 10; i++) {
    await select.selectOption(themes[i]);
    await pickWeather(page, weathers[i]);
    await page.waitForTimeout(120);
  }
  // it ends in the last choice
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'workshop');
  await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'sunny');
  await expect(select).toHaveValue('workshop');
  await expect(weatherPick(page)).toHaveValue('sunny');
  await waitDrawn(page, n);
  await expect.poll(async () => Object.keys(await crew(page)).length).toBe(7);
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  await page.waitForTimeout(1500);
  expect(await storage(page, 'ao-world')).toEqual({ id: 'workshop' });
  expect(await storage(page, 'ao-weather')).toEqual({ weather: 'sunny' });
  const px = await stagePixels(page);
  expectDrawn(px, regionStats(px));
  expectNoErrors(errors);
});

test('ED-06 browser storage unavailable', async ({ errors }) => {
  test.setTimeout(180_000);
  // Chrome set to block all site data: localStorage and IndexedDB both refuse
  const fp = await freshProfile({ prefs: { profile: { default_content_setting_values: { cookies: 2 } } } });
  try {
    const page = await fp.ctx.newPage();
    page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: e.message, url: '' }));
    page.on('console', (m) => m.type() === 'error' && errors.push({ kind: 'console', text: m.text(), url: m.location().url || '' }));
    // counts the scene saver's 400 ms re-tries (it has nowhere to save)
    await page.addInitScript(() => {
      const w = window as unknown as { __kicks: number };
      w.__kicks = 0;
      const st = window.setTimeout.bind(window);
      (window as unknown as { setTimeout: unknown }).setTimeout = (fn: TimerHandler, ms?: number, ...a: unknown[]) => {
        if (ms === 400) w.__kicks++;
        return st(fn, ms, ...a);
      };
    });
    await page.goto(`${ORIGIN}/?demo&test`);
    const blocked = await page.evaluate(async () => {
      let ls = 'ok';
      try {
        localStorage.setItem('probe', '1');
      } catch (e) {
        ls = (e as Error).name;
      }
      const idb = await new Promise<string>((res) => {
        try {
          const r = indexedDB.open('probe', 1);
          r.onsuccess = () => res('ok');
          r.onerror = () => res('refused');
        } catch {
          res('refused');
        }
      });
      return { ls, idb };
    });
    expect(blocked, 'site storage is blocked').toEqual({ ls: 'SecurityError', idb: 'refused' });
    // the scene still opens, built fresh
    await page.waitForFunction(() => performance.getEntriesByName('ao:drawn').length > 0, null, { timeout: 90_000 });
    await expect(page.locator('.labels .chip')).toHaveCount(7);
    const px = await stagePixels(page);
    expectDrawn(px, regionStats(px));
    // and keeps working (a theme change, a weather change) without saving anything
    await page.getByRole('combobox', { name: 'Theme' }).selectOption('kitchen');
    await page.waitForFunction(() => performance.getEntriesByName('ao:drawn').length > 1, null, { timeout: 90_000 });
    await pickWeather(page, 'snow');
    await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'snow');
    await page.waitForTimeout(4000);
    const k0 = await page.evaluate(() => (window as unknown as { __kicks: number }).__kicks);
    await page.waitForTimeout(4000);
    const k1 = await page.evaluate(() => (window as unknown as { __kicks: number }).__kicks);
    const busy = await page.evaluate(() => (window as unknown as { __assets: { busy: () => boolean } }).__assets.busy());
    test.info().annotations.push({ type: 'saving', description: `with storage blocked: __assets.busy() ${busy}; saver re-tries in the last 4 s: ${k1 - k0}` });
    // nothing to save to: the saver stops for good, instead of trying again and again
    expect(busy, 'the scene saver has stopped').toBe(false);
    expect(k1 - k0, 'no re-try timers').toBe(0);
  } finally {
    await fp.close();
  }
  expectNoErrors(errors);
});

test('ED-07 odd data', async ({ page, errors }) => {
  await mocked(page, [
    session({ name: 'no-tool', tool: null, subs: [] }),
    session({ name: 'odd-kind', tool: ['Frobnicate', 'zzz-unknown', 'thing'] }),
    session({ name: 'normal', tool: ['Edit', 'edit', 'a.ts'] }),
  ]);
  // shown thinking: the tag, and the person keeps busy at their desk
  await expect(chip(page, 'no-tool').locator('.chip-sub')).toHaveText('Thinking…');
  const busy = ['ponder', 'scribble', 'sip'];
  await expect.poll(async () => (await crew(page))['no-tool']?.act).toMatch(new RegExp(`^(${busy.join('|')})$`));
  await expect.poll(async () => (await crew(page))['odd-kind']?.act).toMatch(new RegExp(`^(${busy.join('|')})$`));
  await expect(chip(page, 'odd-kind').locator('.chip-sub')).toHaveText('Frobnicate thing');
  await expect(page.locator('.caps .cap')).toHaveCount(3);
  expectNoErrors(errors);
});
