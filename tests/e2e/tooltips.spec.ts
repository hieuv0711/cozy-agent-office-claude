import { camBtn, chip, openScene, pickWeather, weatherPick } from './support/app';
import { expect, expectNoErrors, test } from './support/fixtures';
import { MockOffice, now, session, sub } from './support/mock';

// AX-03, PE-17 and PE-18. The controls explain themselves in one tooltip
// (panels/Tooltip.tsx): on hover after a short pause, at once on keyboard
// focus, gone on Escape, and the control is described by it while it shows.
// A helper's tag says what it is doing and whose helper it is, and its tooltip
// has the step it is on and for how long. A line joins it to its session's tag
// (PE-18): faint, and bright while either tag is pointed at or the session is
// selected.

test('AX-03 tooltips on the controls', async ({ page, errors }) => {
  await openScene(page);
  const tipEl = page.getByRole('tooltip');
  const close = camBtn(page, 'Close');

  // hover: the heading (with its key) and the sentence, above the button and on screen
  await close.hover();
  await expect(tipEl).toBeVisible({ timeout: 2000 });
  await expect(tipEl.locator('.tip-title')).toHaveText('Close2');
  await expect(tipEl.locator('kbd')).toHaveText('2');
  await expect(tipEl).toContainText('Closer in, on the people at work');
  await expect(close).toHaveAttribute('aria-describedby', /\bao-tip\b/);
  const t = (await tipEl.boundingBox())!;
  const b = (await close.boundingBox())!;
  expect(t.y + t.height, 'above the button').toBeLessThanOrEqual(b.y + 1);
  expect(t.x >= 0 && t.x + t.width <= 1440, 'on screen').toBe(true);

  // moving on to the next control shows its tip at once
  await camBtn(page, 'Room sounds').hover();
  await expect(tipEl.locator('.tip-title')).toHaveText(/^Room sounds are (on|off)$/, { timeout: 500 });
  // the corner one stays on screen, with its key
  await camBtn(page, 'Stream').hover();
  await expect(tipEl.locator('.tip-title')).toContainText('Stream mode');
  await expect(tipEl.locator('kbd')).toHaveText('S');
  const s = (await tipEl.boundingBox())!;
  expect(s.x + s.width, 'kept inside the window').toBeLessThanOrEqual(1440 - 4);

  // away: gone, and the button is no longer described by it
  await page.mouse.move(80, 28);
  await expect(tipEl).toHaveCount(0);
  await expect(close).not.toHaveAttribute('aria-describedby', /\bao-tip\b/);

  // a click hides it and it stays away while the pointer is still there
  await camBtn(page, 'Side').hover();
  await expect(tipEl.locator('.tip-title')).toHaveText('Side4');
  await camBtn(page, 'Side').click();
  await expect(tipEl).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(tipEl).toHaveCount(0);
  await camBtn(page, 'Wide').click();

  // the keyboard: the tip shows as focus arrives, and Escape puts it away
  await page.mouse.move(80, 28);
  await camBtn(page, 'Wide').focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await expect(tipEl.locator('.tip-title')).toHaveText('Close2', { timeout: 500 });
  await expect(close).toHaveAttribute('aria-describedby', /\bao-tip\b/);
  await page.keyboard.press('Escape');
  await expect(tipEl).toHaveCount(0);

  // the weather choice in the top bar says what the weather it shows does
  await pickWeather(page, 'rain');
  await page.mouse.move(80, 28);
  await weatherPick(page).hover();
  await expect(tipEl.locator('.tip-title')).toHaveText('Weather: rain');
  await expect(tipEl).toContainText('Rain jackets on');

  // the top bar's counts say what they count
  await page.locator('.topbar .counts .count', { hasText: 'idle' }).hover();
  await expect(tipEl).toContainText('nothing to do right now');
  expectNoErrors(errors);
});

test('PE-17 a helper says what it is doing', async ({ page, errors }) => {
  await openScene(page);
  const tipEl = page.getByRole('tooltip');
  // its tag is its task, not just the kind of helper it is
  const explorer = page.locator('.labels .bot-chip', { hasText: 'Find where orders are loaded' });
  const planner = page.locator('.labels .bot-chip', { hasText: 'Plan the order history page' });
  await expect(explorer).toBeVisible();
  await expect(planner).toBeVisible();
  await expect(page.locator('.labels .bot-chip', { hasText: /^(Helper|Explorer|Planner)$/ })).toHaveCount(0);

  // its tooltip: whose helper, the step it is on, how long, and what its kind does
  await explorer.hover();
  await expect(tipEl.locator('.tip-title')).toHaveText('Find where orders are loaded');
  await expect(tipEl).toContainText('Explorer for web-shop-81');
  await expect(tipEl).toContainText('Now: Grep useOrders');
  await expect(tipEl).toContainText(/Started \d+ min( \d+ s)? ago, 6 steps so far/);
  await expect(tipEl).toContainText('Searches and reads through the code');
  // one between steps is thinking
  await planner.hover();
  await expect(tipEl.locator('.tip-title')).toHaveText('Plan the order history page');
  await expect(tipEl).toContainText('Planner for web-shop-81');
  await expect(tipEl).toContainText('Now: thinking');
  // the "+2" on its session's tag says what it means
  await page.locator('.labels .chip .chip-bots').first().hover();
  await expect(tipEl).toContainText("helpers are working on parts of web-shop-81's task");
  expectNoErrors(errors);
});

test('PE-18 a helper says whose it is, and a line points to its session', async ({ page, errors }) => {
  // a session waiting on its helpers: it sits down, they work at the desks
  const helpers = [sub('Explore', 'running', now('Grep', 'search', 'useOrders')), sub('Plan')];
  await new MockOffice(page, [session({ name: 'lk-lead', status: 'idle', since: 30, subs: helpers }), session({ name: 'lk-solo', status: 'working', tool: ['Edit', 'edit', 'src/a.ts'] })]).install();
  await openScene(page, '?test&world=office&weather=clear&breaks=0');
  const lead = chip(page, 'lk-lead');
  const tags = page.locator('.labels .bot-chip');
  const lines = page.locator('.labels .links g');
  const lit = page.locator('.labels .links g.on');

  // each helper's tag says whose it is; one line each, none for a session without helpers
  await expect(tags.locator('.bot-for')).toHaveText(['Explorer for lk-lead', 'Planner for lk-lead']);
  await expect(lines).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<SVGGElement>('.labels .links g')].filter((g) => g.style.display !== 'none').length), { message: 'both lines drawn' }).toBe(2);
  await expect(lit).toHaveCount(0);

  // pointing at the session's tag: its lines light up, and each runs from a helper's tag to it
  await lead.hover();
  await expect(lit).toHaveCount(2);
  await expect(page.locator('.labels .bot-chip.linked')).toHaveCount(2);
  const joins = await page.evaluate(() => {
    const host = document.querySelector('.labels')!.getBoundingClientRect();
    const lead = [...document.querySelectorAll('.labels .chip')].find((c) => c.querySelector('.chip-name')?.textContent === 'lk-lead')!.getBoundingClientRect();
    const tags = [...document.querySelectorAll('.labels .bot-chip')].map((t) => t.getBoundingClientRect());
    const near = (x: number, y: number, r: DOMRect, m = 5) => x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
    return [...document.querySelectorAll('.labels .links g')].map((g) => {
      const [sx, sy] = (g.querySelector('path')?.getAttribute('d') || '').slice(1).split(/[ Q]/).map(Number);
      const c = g.querySelector('circle')!;
      const ex = Number(c.getAttribute('cx'));
      const ey = Number(c.getAttribute('cy'));
      return { fromHelper: tags.some((r) => near(host.left + sx, host.top + sy, r)), toSession: near(host.left + ex, host.top + ey, lead) };
    });
  });
  expect(joins).toEqual([
    { fromHelper: true, toSession: true },
    { fromHelper: true, toSession: true },
  ]);
  // its "+2" says what the lines are
  await lead.locator('.chip-bots').hover();
  await expect(page.getByRole('tooltip')).toContainText('The lines join them to this tag');

  // away: faint again
  await page.mouse.move(720, 640);
  await expect(lit).toHaveCount(0);
  // pointing at a helper's tag lights its line and its session's tag
  await tags.first().hover();
  await expect(lit).toHaveCount(2);
  await expect(lead).toHaveClass(/\blinked\b/);
  // and while the session is selected, its lines stay lit
  await lead.click();
  await page.mouse.move(720, 640);
  await expect(lit).toHaveCount(2);
  expectNoErrors(errors);
});
