import { expect, expectNoErrors, test } from './support/fixtures';
import { logCard, openScene, pickTheme, readCard, sampleFlash } from './support/app';

// 13. Accessibility.

test('AX-01 reduced motion', async ({ page, errors }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await logCard(page);
  await openScene(page, '?demo&test&weather=sunny');
  await page.waitForTimeout(1500);
  // no title card, on opening or on a change of theme
  await pickTheme(page, 'kitchen');
  await page.waitForTimeout(1500);
  expect((await readCard(page)).filter((c) => c.state !== 'none'), 'no title card').toEqual([]);
  // the light holds steady: nothing flashes, in any weather (here a sunny day, the brightest)
  const f = await sampleFlash(page, 6000);
  expect(f.frames).toBeGreaterThan(30);
  expect(f.lights, 'sky lights in the scene').toBeGreaterThan(0);
  expect(f.rise, 'no flash').toBeLessThan(0.02);
  expectNoErrors(errors);
});

test('AX-02 keyboard and labels', async ({ page, errors }) => {
  await openScene(page);
  await page.waitForTimeout(500);
  // every control of the top bar and the camera bar
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll('header.topbar button, header.topbar select, header.topbar input, .camera-bar button, .camera-bar input, .camera-bar select')].map((e) => {
      const el = e as HTMLButtonElement;
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
      return { key: `${el.tagName}|${name}`, name, disabled: el.disabled, pressed: el.getAttribute('aria-pressed') };
    }),
  );
  // Tab through the page from the top
  const reached = new Set<string>();
  let first = '';
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press('Tab');
    const k = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return '';
      return `${el.tagName}|${(el.getAttribute('aria-label') || el.textContent || '').trim()}`;
    });
    if (!k) continue;
    if (k === first) break;
    first ||= k;
    reached.add(k);
  }
  const notReached = controls.filter((c) => !c.disabled && !reached.has(c.key)).map((c) => c.key);
  expect(notReached, 'every control can be reached with Tab').toEqual([]);
  // every control is named
  expect(controls.filter((c) => !c.name).map((c) => c.key), 'controls without a name').toEqual([]);
  // the toggles say whether they are pressed
  const toggles = ['Office', 'Team', 'History', 'Recap', 'Customize', 'Alerts off', 'Wide', 'Close', 'From above', 'Side', 'Close-up', 'Room sounds', 'Follow', 'Stream'];
  for (const t of toggles) {
    const c = controls.find((x) => x.name === t);
    expect(c, `${t} is there`).toBeTruthy();
    expect(['true', 'false'], `${t} reports pressed or not`).toContain(c!.pressed);
  }
  // the choices in the top bar are named: where, the weather, how the people look
  for (const n of ['Theme', 'Weather', 'People']) expect(controls.some((c) => c.key === `SELECT|${n}`), `the ${n} choice`).toBe(true);
  // the rail is a live region
  await expect(page.locator('.rail .caps')).toHaveAttribute('aria-live', 'polite');
  expectNoErrors(errors);
});
