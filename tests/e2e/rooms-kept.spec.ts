import { openScene, viewTab } from './support/app';
import { expect, expectNoErrors, test } from './support/fixtures';

// 12. Speed: PF-07. The room is built once: on Team, History or Recap it is
// kept as it is and stops drawing, and coming back shows it at once (the same
// canvas and renderer, no new first frames, no long frame).

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test('PF-07 back to the room at once', async ({ page, errors }) => {
  test.setTimeout(90_000);
  await openScene(page, '?demo&test&weather=clear');
  await page.waitForTimeout(2500);
  const drawn = await page.evaluate(() => performance.getEntriesByName('ao:drawn').length);
  await page.evaluate(() => {
    const w = window as W;
    w.__glKept = w.__ao.gl;
  });

  // another tab: the room stays, but doesn't draw (and its clock stands still)
  const clockBefore = await page.evaluate(() => (window as W).__ao.clock.elapsedTime as number);
  await viewTab(page, 'History').click();
  await page.waitForTimeout(600);
  const f1 = await page.evaluate(() => (window as W).__ao.gl.info.render.frame as number);
  const c1 = await page.evaluate(() => (window as W).__ao.clock.elapsedTime as number);
  await page.waitForTimeout(1500);
  const f2 = await page.evaluate(() => (window as W).__ao.gl.info.render.frame as number);
  const c2 = await page.evaluate(() => (window as W).__ao.clock.elapsedTime as number);
  expect(f2 - f1, 'no drawing while History is shown').toBe(0);
  expect(c2, 'the clock stands still while hidden').toBe(c1);
  expect(c1, 'and keeps the time it had').toBeGreaterThanOrEqual(clockBefore);
  await expect(page.locator('.stage')).toBeHidden();

  // back: the same room, at once and smoothly
  await page.evaluate(() => {
    const w = window as W;
    w.__gaps = [];
    let last = performance.now();
    const step = (t: number) => {
      w.__gaps.push(t - last);
      last = t;
      if (w.__gaps.length < 90) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await page.locator('nav.views button').first().click();
  await expect(page.locator('.stage canvas')).toBeVisible();
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const w = window as W;
    return {
      same: w.__ao.gl === w.__glKept && document.querySelector('.stage canvas') === w.__ao.gl.domElement,
      drawn: performance.getEntriesByName('ao:drawn').length,
      // the second slowest frame (one hiccup of a busy machine isn't the room being rebuilt)
      worst: Math.round([...(w.__gaps as number[]).slice(1)].sort((a, b) => b - a)[1] ?? 0),
      median: Math.round([...(w.__gaps as number[]).slice(1)].sort((a, b) => a - b)[Math.floor(((w.__gaps as number[]).length - 1) / 2)] ?? 0),
      drawing: w.__ao.gl.info.render.frame as number,
      clock: w.__ao.clock.elapsedTime as number,
    };
  });
  expect(r.same, 'the same canvas and renderer').toBe(true);
  expect(r.drawn, 'no new first frames (nothing was rebuilt)').toBe(drawn);
  expect(r.worst, 'no long frame on the way back').toBeLessThan(100);
  expect(r.median, 'smooth on the way back').toBeLessThan(40);
  expect(r.drawing, 'drawing again').toBeGreaterThan(f2);
  // the room's clock carries on from where it stopped (people's steps and poses count on it)
  expect(r.clock, 'the clock carries on, not from 0').toBeGreaterThan(clockBefore + 1);
  expectNoErrors(errors);
});
