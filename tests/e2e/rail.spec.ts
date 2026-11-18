import type { Page } from '@playwright/test';
import { expect, expectNoErrors, test } from './support/fixtures';
import { camBtn, openScene, pickWeather, storage } from './support/app';
import { MockOffice, session } from './support/mock';

// 10. The caption rail under the scene (?demo unless said otherwise).

const DEMO_NAMES = ['notes-app-3f', 'web-shop-81', 'photo-api-c2', 'docs-site-5a', 'billing-07', 'photo-api-9d', 'notes-app-e4'];
const YELLOW = 'rgb(255, 216, 74)';

test('RA-01 live captions', async ({ page, errors }) => {
  await openScene(page);
  const caps = page.locator('.caps .cap');
  await expect(caps.first()).toBeVisible();
  // one caption per active session (three fit), waiting ones first, in yellow
  const first = caps.first();
  await expect(first).toHaveClass(/\bask\b/);
  await expect(first.locator('.who')).toHaveText('notes-app-3f');
  for (const part of ['.who', '.say .base', '.t']) expect(await first.locator(part).evaluate((e) => getComputedStyle(e).color), `${part} is yellow`).toBe(YELLOW);
  for (const c of await caps.all()) {
    await expect(c.locator('.who')).not.toHaveText('');
    await expect(c.locator('.say .base')).not.toHaveText('');
    await expect(c.locator('.t')).toHaveText(/^\d+:\d{2}$/);
  }
  // more than fit: "+N more speaking", N = the rest of the sessions that are working or waiting
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tags = [...document.querySelectorAll('.labels .chip')];
        const speaking = tags.filter((t) => t.classList.contains('working') || t.classList.contains('needs-you')).length;
        const shown = document.querySelectorAll('.caps .cap').length;
        const more = document.querySelector('.caps .more')?.textContent || '';
        const want = speaking > shown ? `+${speaking - shown} more speaking` : '';
        return shown <= 3 && more === want ? 'ok' : `${shown} shown of ${speaking}, "${more}"`;
      }),
    )
    .toBe('ok');
  expect(await caps.count()).toBeLessThanOrEqual(3);
  // "Now": every session listed
  const now = page.locator('.rail-label');
  await expect(now).toContainText('7 sessions');
  await now.click();
  await expect(now).toHaveAttribute('aria-pressed', 'true');
  const all = page.locator('aside.panel[aria-label="Summary"]');
  await expect(all).toBeVisible();
  await expect(all.locator('.hrow')).toHaveCount(7);
  const names = await all.locator('.hrow .t').allTextContents();
  expect(names.map((n) => n.trim()).sort()).toEqual([...DEMO_NAMES].sort());
  expectNoErrors(errors);
});

test('RA-02 go to a waiting session', async ({ page, errors }) => {
  // demo: no terminal to bring forward; the button says so and turns the camera to the session
  await openScene(page);
  const go = page.locator('.rail .answer');
  await expect(go).toHaveText('Go to notes-app-3f');
  await expect(go).toHaveAttribute('data-tip', 'notes-app-3f runs without a terminal; this turns the camera to it');
  await go.click();
  await expect(page.locator('aside.panel[aria-label="Agent detail"] h1')).toHaveText('Fix sync conflict on reconnect');
  await expect(camBtn(page, 'Close-up')).toHaveAttribute('aria-pressed', 'true');
  const note = await page.locator('.rail-note').count();
  test.info().annotations.push({ type: 'demo note', description: note ? 'a note shows after the click' : 'no note shows after the click; the reason is only in the button’s tooltip' });
  expectNoErrors(errors);
});

test.describe('a waiting session with a terminal (mocked)', () => {
  async function waiting(page: Page) {
    await new MockOffice(page, [session({ name: 'in-terminal', status: 'needs-you', waitingFor: 'permission prompt', tool: ['Bash', 'run', 'npm publish'], pid: 4242 })]).install();
    await openScene(page, '?test&weather=clear');
    return page.locator('.rail .answer');
  }

  test('RA-02 go to a waiting session: its terminal comes to the front', async ({ page, errors }) => {
    const asked: unknown[] = [];
    await page.route('**/api/focus', async (route) => {
      asked.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, tty: 'ttys004' } });
    });
    const go = await waiting(page);
    await expect(go).toHaveText('Answer in terminal · in-terminal');
    await go.click();
    await expect.poll(() => asked).toEqual([{ pid: 4242 }]);
    await page.waitForTimeout(500);
    await expect(page.locator('.rail-note')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('RA-02 go to a waiting session: says why when it cannot', async ({ page, errors }) => {
    await page.route('**/api/focus', (route) => route.fulfill({ status: 403, json: { error: 'macOS blocked it: allow Agent Office (node) to control Terminal' } }));
    const go = await waiting(page);
    await go.click();
    await expect(page.locator('.rail-note')).toHaveText('macOS blocked it: allow Agent Office (node) to control Terminal');
    expectNoErrors(errors, [/status of 403/]);
  });
});

test('RA-03 music', async ({ page, errors }) => {
  // what the player plays is measured on the music's own analyser (before the volume)
  await page.addInitScript(() => {
    const w = window as unknown as { __analysers: AnalyserNode[] };
    w.__analysers = [];
    const make = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function (this: AudioContext) {
      const a = make.call(this);
      w.__analysers.push(a);
      return a;
    };
  });
  const loud = (page: Page, ms: number) =>
    page.evaluate(async (ms) => {
      const a = (window as unknown as { __analysers: AnalyserNode[] }).__analysers[0];
      if (!a) return -1;
      const buf = new Float32Array(a.fftSize);
      let max = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        a.getFloatTimeDomainData(buf);
        max = Math.max(max, Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length));
        await new Promise((r) => setTimeout(r, 50));
      }
      return max;
    }, ms);
  await openScene(page);
  await page.locator('.rail').getByRole('button', { name: 'Start the music' }).click();
  // the player shows and plays
  await expect(page.locator('.music-row')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible();
  await expect(page.locator('.music-title b')).not.toHaveText('');
  expect(await loud(page, 4000), 'music is playing').toBeGreaterThan(0.002);
  // stop it: quiet
  await page.getByRole('button', { name: 'Pause music' }).click();
  await expect(page.getByRole('button', { name: 'Play music' })).toBeVisible();
  await page.waitForTimeout(4000);
  expect(await loud(page, 1500), 'quiet').toBeLessThan(0.0005);
  expectNoErrors(errors);
});

test('RA-04 focus timer', async ({ page, errors }) => {
  await openScene(page);
  await page.locator('.rail').getByRole('button', { name: 'Start a 25-minute focus' }).click();
  const timer = page.locator('.rail .pomo.on');
  await expect(timer).toHaveClass(/\bfocus\b/);
  await expect(timer.locator('b')).toHaveText('Focus');
  await expect(timer.locator('.mono')).toHaveText(/^2[45]:\d{2}$/);
  const t1 = await timer.locator('.mono').textContent();
  await expect.poll(() => timer.locator('.mono').textContent(), { message: 'counting down' }).not.toBe(t1);
  await expect(timer.getByRole('button', { name: 'Break now' })).toBeVisible();
  await expect(timer.getByRole('button', { name: 'Stop' })).toBeVisible();
  // Break now: a break starts
  await timer.getByRole('button', { name: 'Break now' }).click();
  await expect(timer).toHaveClass(/\bbreak\b/);
  await expect(timer.locator('b')).toHaveText('Break');
  await expect(timer.locator('.mono')).toHaveText(/^[45]:\d{2}$/);
  // Stop: the timer is gone
  await timer.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.rail .pomo.on')).toHaveCount(0);
  await expect(page.locator('.rail').getByRole('button', { name: /^Start a 25-minute focus/ })).toBeVisible();
  expectNoErrors(errors);
});

test('RA-05 focus length', async ({ page, errors }) => {
  await openScene(page);
  const rail = page.locator('.rail');
  const change = rail.getByRole('button', { name: 'Change length', exact: true });
  await change.click();
  const panel = page.getByRole('dialog', { name: 'Focus length' });
  await expect(panel).toBeVisible();
  const focus = panel.getByRole('group', { name: 'Focus minutes' });
  const brk = panel.getByRole('group', { name: 'Break minutes' });
  // the lengths on offer, today's pressed
  for (const m of [15, 25, 45, 60]) await expect(focus.getByRole('button', { name: `${m} min`, exact: true })).toHaveAttribute('aria-pressed', String(m === 25));
  for (const m of [5, 10, 15]) await expect(brk.getByRole('button', { name: `${m} min`, exact: true })).toHaveAttribute('aria-pressed', String(m === 5));
  // a preset: Start focus follows it, and it is saved
  await focus.getByRole('button', { name: '45 min', exact: true }).click();
  await expect(rail.getByRole('button', { name: /^Start a 45-minute focus/ })).toBeVisible();
  await expect.poll(async () => (await storage(page, 'ao-pomodoro'))?.focusMin).toBe(45);
  // any length from 1 to 180 minutes; anything else is refused with a word why
  const typed = panel.getByRole('spinbutton', { name: 'Focus minutes, 1 to 180' });
  await typed.fill('90');
  await expect(rail.getByRole('button', { name: /^Start a 90-minute focus/ })).toBeVisible();
  for (const bad of ['0', '181', '2.5']) {
    await typed.fill(bad);
    await expect(panel.getByRole('alert'), `${bad} is refused`).toHaveText('Use a whole number of minutes from 1 to 180.');
    await expect(rail.getByRole('button', { name: /^Start a 90-minute focus/ }), `${bad} leaves 90`).toBeVisible();
  }
  await typed.fill('90');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  // the box keeps the keyboard while the clock ticks
  await page.waitForTimeout(1500);
  await expect(typed).toBeFocused();
  // the break
  await brk.getByRole('button', { name: '10 min', exact: true }).click();
  await expect(brk.getByRole('button', { name: '10 min', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Escape closes it and gives the keyboard back to the button
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(change).toBeFocused();
  // saved for next time
  expect(await storage(page, 'ao-pomodoro')).toMatchObject({ focusMin: 90, breakMin: 10 });
  await openScene(page);
  await expect(rail.getByRole('button', { name: /^Start a 90-minute focus/ })).toBeVisible();
  // the running timer follows a new length
  await rail.getByRole('button', { name: /^Start a 90-minute focus/ }).click();
  const timer = rail.locator('.pomo.on');
  await expect(timer.locator('.mono')).toHaveText(/^(90:00|89:\d{2})$/);
  await rail.getByRole('button', { name: 'Length', exact: true }).click();
  await panel.getByRole('group', { name: 'Focus minutes' }).getByRole('button', { name: '15 min', exact: true }).click();
  await expect(timer.locator('.mono'), 'the round now ends at 15 minutes').toHaveText(/^1[45]:\d{2}$/);
  await page.keyboard.press('Escape');
  await timer.getByRole('button', { name: 'Stop' }).click();
  await expect(rail.getByRole('button', { name: /^Start a 15-minute focus/ })).toBeVisible();
  // back to the usual lengths for the tests after this one
  await rail.getByRole('button', { name: 'Change length', exact: true }).click();
  await panel.getByRole('group', { name: 'Focus minutes' }).getByRole('button', { name: '25 min', exact: true }).click();
  await panel.getByRole('group', { name: 'Break minutes' }).getByRole('button', { name: '5 min', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(rail.getByRole('button', { name: /^Start a 25-minute focus/ })).toBeVisible();
  expectNoErrors(errors);
});

test('RA-06 room sounds', async ({ page, errors }) => {
  test.setTimeout(150_000);
  // everything that reaches the speakers, tapped where it leaves the mixer
  await page.addInitScript(() => {
    // whatever is connected to the speakers goes through one analyser on its way there
    const w = window as unknown as { __tap?: AnalyserNode };
    const connect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    (AudioNode.prototype as unknown as { connect: (...a: unknown[]) => unknown }).connect = function (this: AudioNode, ...a: unknown[]) {
      if (!(a[0] instanceof AudioDestinationNode)) return connect.apply(this, a);
      const ctx = this.context as BaseAudioContext & { __tap?: AnalyserNode };
      if (!ctx.__tap) {
        ctx.__tap = ctx.createAnalyser();
        ctx.__tap.fftSize = 2048;
        connect.call(ctx.__tap, a[0]);
        w.__tap = ctx.__tap;
      }
      return connect.call(this, ctx.__tap);
    };
  });
  const loud = (ms: number) =>
    page.evaluate(async (ms) => {
      const a = (window as unknown as { __tap?: AnalyserNode }).__tap;
      if (!a) return -1;
      const buf = new Float32Array(a.fftSize);
      let max = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        a.getFloatTimeDomainData(buf);
        max = Math.max(max, Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length));
        await new Promise((r) => setTimeout(r, 50));
      }
      return max;
    }, ms);
  // one idle session (so nobody is typing), on a clear night in the toy workshop (no street outside): a quiet room
  const mock = await new MockOffice(page, [session({ name: 'asker', status: 'idle', since: 30 })]).install();
  await openScene(page, '?test&world=workshop&weather=clear');
  const toggle = camBtn(page, 'Room sounds');
  await expect(toggle, 'on by default').toHaveAttribute('aria-pressed', 'true');
  // sound starts with the music; pause it, so only the room is heard
  await page.locator('.rail').getByRole('button', { name: 'Start the music' }).click();
  await page.getByRole('button', { name: 'Pause music' }).click();
  await page.waitForTimeout(4000);
  const base = await loud(1500);
  // while room sounds are on, a new "needs you" chimes
  await mock.set({ asker: { status: 'needs-you' } });
  const chime = await loud(2000);
  await mock.set({ asker: { status: 'idle' } });
  // and the rain is heard
  await pickWeather(page, 'rain');
  await page.waitForTimeout(3500);
  const rain = await loud(2000);
  test.info().annotations.push({ type: 'levels', description: `quiet room ${base.toFixed(4)}, a chime ${chime.toFixed(4)}, rain ${rain.toFixed(4)}` });
  expect(chime, 'a chime when someone needs you').toBeGreaterThan(Math.max(0.004, base * 3));
  expect(rain, 'the rain is heard').toBeGreaterThan(Math.max(0.002, base * 3));
  // off: the rain fades out, and a new "needs you" makes no chime
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(4500);
  expect(await loud(1500), 'quiet').toBeLessThan(0.0005);
  await mock.set({ asker: { status: 'needs-you' } });
  expect(await loud(2500), 'no chime while room sounds are off').toBeLessThan(0.0005);
  // the music's own switch still plays music
  await page.getByRole('button', { name: 'Play music' }).click();
  await page.waitForTimeout(1500);
  expect(await loud(2000), 'the music plays').toBeGreaterThan(0.002);
  await page.getByRole('button', { name: 'Pause music' }).click();
  // one setting: the sound panel shows it, and turns it back on
  await page.getByRole('button', { name: 'Sound settings' }).click();
  const box = page.getByRole('checkbox', { name: 'Room sounds on' });
  await expect(box).not.toBeChecked();
  await expect(page.getByRole('slider', { name: 'Room sounds volume' })).toBeDisabled();
  await box.check();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(3500);
  expect(await loud(2000), 'the rain is back').toBeGreaterThan(0.002);
  // saved for next time
  await toggle.click();
  await expect.poll(async () => (await storage(page, 'ao-audio'))?.roomSounds).toBe(false);
  await openScene(page, '?test&world=workshop&weather=rain');
  await expect(camBtn(page, 'Room sounds')).toHaveAttribute('aria-pressed', 'false');
  // back on for the tests after this one
  await camBtn(page, 'Room sounds').click();
  await expect.poll(async () => (await storage(page, 'ao-audio'))?.roomSounds).toBe(true);
  expectNoErrors(errors);
});

test('RA-07 your own music: a YouTube or Spotify link', async ({ page, errors }) => {
  // the players are stood in for by blank pages: nothing goes to the internet
  await page.route(/^https:\/\/(www\.youtube-nocookie\.com|open\.spotify\.com)\//, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
  await openScene(page);
  const rail = page.locator('.rail');
  // offered before the music starts: "Your music" opens the settings at the link box
  await rail.getByRole('button', { name: 'Your music' }).click();
  const panel = page.getByRole('dialog', { name: 'Sound settings' });
  await expect(panel).toBeVisible();
  const field = panel.getByRole('textbox', { name: 'Music link' });
  await expect(field).toBeFocused();
  const source = panel.getByRole('group', { name: 'Music source' });
  await expect(source.getByRole('button')).toHaveText(['Made here', 'YouTube', 'Spotify', 'Off']);
  await expect(source.getByRole('button', { name: 'Spotify' })).toBeDisabled();

  // something that's neither
  await field.fill('https://example.com/song');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(panel.locator('.err')).toContainText('That isn’t a YouTube or Spotify link');

  // a Spotify playlist: its own player, which plays and skips with its own buttons
  await field.fill('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  const sp = page.locator('iframe[title="Spotify music player"]');
  await expect(sp).toHaveAttribute('src', 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0');
  await expect(source.getByRole('button', { name: 'Spotify' })).toHaveAttribute('aria-pressed', 'true');
  await expect(rail.locator('.music-title')).toContainText('Spotify');
  await expect(rail.getByRole('button', { name: /Play music|Pause music/ })).toBeDisabled();

  // a YouTube playlist: YouTube's player instead
  await field.fill('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(sp).toHaveCount(0);
  await expect(page.locator('iframe[title="YouTube music player"]')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/videoseries\?.*list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG/);
  // both are kept to pick again, and Spotify is back one click away
  await expect(panel.locator('.yt-links li')).toHaveCount(2);
  await source.getByRole('button', { name: 'Spotify' }).click();
  await expect(sp).toHaveCount(1);
  await expect.poll(async () => ((await storage(page, 'ao-yt-links')) as unknown[] | null)?.length).toBe(2);
  // back to the music made here, so nothing of this test stays in the browser profile
  await panel.getByRole('group', { name: 'Music source' }).getByRole('button', { name: 'Made here' }).click();
  // a server from before Spotify was allowed refuses its frame; that's the only note allowed
  expectNoErrors(errors, [/(Refused to frame|Framing) 'https:\/\/open\.spotify\.com\//]);
});
