import { regionStats } from './support/png';
import { expect, expectNoErrors, test } from './support/fixtures';
import { chipCounts, clearStorage, crew, drawnTimes, expectDrawn, frameTimes, logCard, openScene, pickTheme, readCard, seedStorage, stagePixels, storage, topCounts, viewTab, waitDrawn, weatherPick } from './support/app';
import { MockOffice, session } from './support/mock';
import { figures } from './support/people';
import type { Page } from '@playwright/test';

// 1. App shell: the top bar, views, themes, address parameters, counts, alerts, pop out, title card.

const DEMO_NAMES = ['notes-app-3f', 'web-shop-81', 'photo-api-c2', 'docs-site-5a', 'billing-07', 'photo-api-9d', 'notes-app-e4'];

/** Everyone in the scene (their helpers too) is dressed as the theme's cast: cooks' whites, toymakers' aprons. */
async function expectCast(page: Page, outfit: 'office' | 'chef' | 'maker') {
  await expect
    .poll(
      async () => {
        const people = (await figures(page)).filter((f) => f.shown && f.outfit !== 'diner');
        const other = people.filter((f) => f.outfit !== outfit).map((f) => f.outfit);
        return people.length >= DEMO_NAMES.length && !other.length ? 'ok' : `${people.length} people; dressed otherwise: ${other.join(', ') || 'none'}`;
      },
      { message: `everyone dressed as the ${outfit} cast` },
    )
    .toBe('ok');
  expect(Object.keys(await crew(page)).sort()).toEqual([...DEMO_NAMES].sort());
}

test('SH-01 open the app', async ({ page, errors }) => {
  await logCard(page);
  await page.goto('/?demo&test');
  const bar = page.locator('header.topbar');
  await expect(bar.locator('.brand')).toHaveText('Agent Office');
  await expect(page.locator('nav.views button')).toHaveText(['Office', 'Team', 'History', 'Recap']);
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
  for (const name of ['Customize', 'Alerts off', 'Pop out']) await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();

  await waitDrawn(page);
  // the title card names the theme, and fades once the room has drawn
  await expect.poll(async () => (await readCard(page)).at(-1)?.state, { timeout: 10_000 }).toBe('none');
  const card = await readCard(page);
  const shown = card.filter((c) => c.state !== 'none');
  expect(shown.length, 'the title card showed').toBeGreaterThan(0);
  expect(shown[0].state).toContain('Loft office');
  expect(shown[0].state).toContain('Episode 1');
  const drawn = (await drawnTimes(page))[0];
  const gone = card.at(-1)!.t;
  expect(gone, 'the card stays until the room has drawn').toBeGreaterThan(drawn);
  expect(gone - drawn, 'and fades soon after').toBeLessThan(2500);

  // seven people, each with a name tag
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  await expect.poll(async () => Object.keys(await crew(page)).sort()).toEqual([...DEMO_NAMES].sort());
  const names = await page.locator('.labels .chip .chip-name').allTextContents();
  expect(names.sort()).toEqual([...DEMO_NAMES].sort());
  for (const c of await page.locator('.labels .chip').all()) await expect(c).toBeVisible();

  // the room is drawn
  const px = await stagePixels(page);
  expectDrawn(px, regionStats(px));
  expectNoErrors(errors);
});

test('SH-02 switch views with the tabs and the address', async ({ page, errors }) => {
  await openScene(page);
  await viewTab(page, 'Team').click();
  await expect(page).toHaveURL(/#team$/);
  await expect(page.getByRole('heading', { name: 'Team view' })).toBeVisible();
  await viewTab(page, 'History').click();
  await expect(page).toHaveURL(/#history/);
  await expect(page.locator('.hx')).toBeVisible();
  await viewTab(page, 'Recap').click();
  await expect(page).toHaveURL(/#recap$/);
  await expect(page.locator('.rc')).toBeVisible();
  await viewTab(page, 'Office').click();
  await expect(page).toHaveURL(/#office$/);
  // the scene is drawn again on the way back (the same room, kept while the other views were open)
  const frames = () => page.evaluate(() => (window as unknown as { __ao: { gl: { info: { render: { frame: number } } } } }).__ao.gl.info.render.frame);
  const f0 = await frames();
  await expect.poll(frames, { message: 'drawing again' }).toBeGreaterThan(f0 + 5);
  const px = await stagePixels(page);
  expectDrawn(px, regionStats(px), 'the scene after coming back');

  // the address opens a view directly
  await page.goto('/#history');
  await expect(page.locator('.hx')).toBeVisible();
  await expect(viewTab(page, 'History')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.stage')).toHaveCount(0);

  // the browser's Back button brings the previous view back
  await page.goBack();
  await expect(page).toHaveURL(/\?demo&test#office$/);
  await expect(viewTab(page, 'Office')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.stage canvas')).toBeVisible();
  await waitDrawn(page);
  await page.waitForTimeout(500);
  const px2 = await stagePixels(page);
  expectDrawn(px2, regionStats(px2), 'the scene after Back');
  expectNoErrors(errors);
});

test('SH-03 choose a theme', async ({ page, errors }) => {
  await openScene(page);
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'office');

  await pickTheme(page, 'kitchen');
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'kitchen');
  await expect(page.locator('.stage')).toHaveAttribute('aria-label', '3D place: Kitchen');
  await expect(page.locator('nav.views button').first()).toHaveText('Kitchen');
  await expectCast(page, 'chef');

  await pickTheme(page, 'workshop');
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'workshop');
  await expect(page.locator('nav.views button').first()).toHaveText('Workshop');
  await expectCast(page, 'maker');

  // reload without ?world: the last theme comes back, saved in the browser
  expect(await storage(page, 'ao-world')).toEqual({ id: 'workshop' });
  await openScene(page, '?demo&test');
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'workshop');
  await expect(page.locator('nav.views button').first()).toHaveText('Workshop');
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('workshop');
  expectNoErrors(errors);
});

test('SH-04 address parameters', async ({ page, request, errors }) => {
  // a saved theme and weather that differ from the address
  await seedStorage(page, { 'ao-world': { id: 'kitchen' }, 'ao-weather': { weather: 'rain' } });
  await page.goto('/?demo&world=workshop&weather=snow');
  await waitDrawn(page);
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'workshop');
  await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'snow');
  await expect(weatherPick(page)).toHaveValue('snow');

  // a theme that doesn't exist: the night office, no error
  await clearStorage(page);
  await page.goto('/?demo&test&world=nowhere');
  await waitDrawn(page);
  await expect(page.locator('.stage')).toHaveAttribute('data-world', 'office');
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  // (with a theme saved, an unknown one opens the saved theme instead)
  await seedStorage(page, { 'ao-world': { id: 'kitchen' } });
  await page.goto('/?demo&test&world=nowhere');
  await waitDrawn(page);
  const fallback = await page.locator('.stage').getAttribute('data-world');
  test.info().annotations.push({ type: 'note', description: `?world=nowhere with "kitchen" saved opens: ${fallback}` });

  // without ?demo: this Mac's sessions, or the empty sentence
  await page.goto('/?test');
  await waitDrawn(page);
  await expect
    .poll(
      async () => {
        const api = (await (await request.get('/api/office')).json()) as { sessions: unknown[] };
        if (!api.sessions.length) return (await page.locator('.empty-office').textContent()) || 'no empty sentence';
        return `${await page.locator('.labels .chip:not(.left)').count()} of ${api.sessions.length}`;
      },
      { timeout: 20_000 },
    )
    .toMatch(/^(No Claude Code session is running\..*|(\d+) of \2)$/);
  expectNoErrors(errors);
});

test('SH-05 counts and the tab title', async ({ page, errors }) => {
  await openScene(page);
  await expect(page).toHaveTitle('(1) needs you · Agent Office');
  const waiting = page.locator('.topbar .needs-btn');
  await expect(waiting).toHaveText(/^1\s*waiting for you$/);
  // highlighted yellow
  expect(await waiting.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 216, 74)');
  await expect(page.locator('.topbar .counts')).toContainText(/2\s*helpers/);

  const agree = async () => {
    const [c, t] = await Promise.all([topCounts(page), chipCounts(page)]);
    return c.working === t.working && c.waiting === t.waiting && c.idle === t.idle && c.working + c.waiting + c.idle === 7 ? `ok ${JSON.stringify(c)}` : `top ${JSON.stringify(c)} tags ${JSON.stringify(t)}`;
  };
  await expect.poll(agree).toMatch(/^ok /);
  const before = JSON.stringify(await topCounts(page));
  // a demo session changes state: the counts follow
  await expect.poll(async () => JSON.stringify(await topCounts(page)), { timeout: 45_000, intervals: [500] }).not.toBe(before);
  await expect.poll(agree, { timeout: 4000 }).toMatch(/^ok /);
  expectNoErrors(errors);
});

test('SH-06 alerts switch', async ({ page, errors }) => {
  // Headless Chrome shows no desktop notifications: the page's Notification is
  // replaced by a recorder (the permission prompt answers "granted").
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const notes: { title: string; body: string }[] = [];
    w.__notes = notes;
    w.__asked = Number(sessionStorage.getItem('__asked') || 0);
    class N {
      constructor(title: string, opts?: { body?: string }) {
        notes.push({ title, body: opts?.body || '' });
      }
      close() {}
      static get permission() {
        return localStorage.getItem('__perm') || 'default';
      }
      static async requestPermission() {
        w.__asked = (w.__asked as number) + 1;
        sessionStorage.setItem('__asked', String(w.__asked));
        localStorage.setItem('__perm', 'granted');
        return 'granted';
      }
    }
    w.Notification = N;
  });
  const mock = await new MockOffice(page, [
    session({ name: 'alpha', tool: ['Edit', 'edit', 'src/a.ts'] }),
    session({ name: 'bravo', status: 'idle', since: 60 }),
    session({ name: 'charlie', status: 'idle', since: 90 }),
  ]).install();
  const notes = () => page.evaluate(() => (window as unknown as { __notes: { title: string; body: string }[] }).__notes);
  await openScene(page, '?test&weather=clear');
  const btn = page.locator('.topbar').getByRole('button', { name: /^Alerts (on|off)$/ });
  await expect(btn).toHaveText('Alerts off');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveText('Alerts on');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked), 'permission was asked').toBe(1);

  await openScene(page, '?test&weather=clear');
  await expect(btn).toHaveText('Alerts on');

  // a session starts waiting: a notification names it and says why
  await mock.set({ alpha: { status: 'needs-you', waitingFor: 'permission prompt', tool: ['Bash', 'run', 'npm publish'] } });
  await expect.poll(notes).toEqual([expect.objectContaining({ title: 'alpha needs you', body: expect.stringMatching(/permission prompt: Bash npm publish/) })]);

  // a reload while alpha still waits: no second alert for the same wait (the recorder starts empty)
  await openScene(page, '?test&weather=clear');
  await expect(btn).toHaveText('Alerts on');
  await expect(page.locator('.topbar .needs-btn')).toHaveText(/^1\s*waiting/);
  await page.waitForTimeout(2500);
  expect(await notes(), 'no alert on load for a wait that was already there').toEqual([]);
  // a new wait does alert
  await mock.set({ bravo: { status: 'needs-you', waitingFor: 'question', tool: ['AskUserQuestion', 'other', ''] } });
  await expect.poll(notes).toEqual([expect.objectContaining({ title: 'bravo needs you' })]);

  // switched off: no more notifications
  await btn.click();
  await expect(btn).toHaveText('Alerts off');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await mock.set({ charlie: { status: 'needs-you', waitingFor: 'permission prompt', tool: ['Edit', 'edit', 'c.ts'] } });
  await expect(page.locator('.topbar .needs-btn')).toHaveText(/^3\s*waiting/);
  await page.waitForTimeout(2000);
  expect(await notes()).toHaveLength(1);
  expectNoErrors(errors);
});

test('SH-07 pop out', async ({ page, errors }) => {
  await openScene(page);
  const [pip] = await Promise.all([page.context().waitForEvent('page'), page.locator('.topbar').getByRole('button', { name: 'Pop out' }).click()]);
  // a small window listing everyone's status, waiting first
  await expect(pip.locator('.mini-row')).toHaveCount(7);
  await expect(pip.locator('.mini-head')).toContainText('7 sessions · 1 waiting for you');
  await expect(pip.locator('.mini-row').first()).toContainText('notes-app-3f');
  await expect(pip.locator('.mini-row').first()).toContainText('Permission prompt: Bash');
  expect(await pip.title()).toBe('(1) waiting · Agent Office');
  expect(await page.evaluate(() => (window as unknown as { documentPictureInPicture: { window: Window | null } }).documentPictureInPicture.window !== null)).toBe(true);

  // close it: the main page carries on
  await pip.close();
  await expect.poll(() => page.evaluate(() => (window as unknown as { documentPictureInPicture: { window: Window | null } }).documentPictureInPicture.window === null)).toBe(true);
  const f = await frameTimes(page, 1500);
  expect(f.n, 'the scene keeps drawing').toBeGreaterThan(30);
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  // and it opens again
  const [again] = await Promise.all([page.context().waitForEvent('page'), page.locator('.topbar').getByRole('button', { name: 'Pop out' }).click()]);
  await expect(again.locator('.mini-row')).toHaveCount(7);
  await again.close();
  expectNoErrors(errors);
});

test('SH-08 title card', async ({ page, errors }) => {
  await logCard(page);
  await openScene(page);
  await expect.poll(async () => (await readCard(page)).at(-1)?.state, { timeout: 10_000 }).toBe('none');
  const from = (await readCard(page)).length;
  const t0 = await page.evaluate(() => performance.now());
  await pickTheme(page, 'kitchen');
  await expect.poll(async () => (await readCard(page)).at(-1)?.state, { timeout: 10_000 }).toBe('none');
  const card = (await readCard(page)).slice(from);
  const shown = card.filter((c) => c.state !== 'none');
  expect(shown.length, 'a title card covered the change').toBeGreaterThan(0);
  expect(shown[0].state).toContain('Kitchen');
  expect(shown[0].state).toContain('Episode 2');
  expect(shown[0].t - t0, 'it came up at once').toBeLessThan(500);
  const drawn = (await drawnTimes(page)).at(-1)!;
  expect(shown[0].t, 'before the new room drew').toBeLessThanOrEqual(drawn);
  const gone = card.at(-1)!.t;
  expect(gone - drawn, 'it fades within about 2 s of the new room drawing').toBeLessThan(2500);
  expectNoErrors(errors);
});
