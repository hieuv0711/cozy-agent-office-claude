import type { Page } from '@playwright/test';
import { expect, expectNoErrors, test } from './support/fixtures';
import { camBtn, camState, hitAt, openScene, pickTheme, storage, toScreen } from './support/app';

// 6. Customize. Items are placed with real mouse input at screen points
// projected from world points through the live camera; what was placed is
// read back from the saved layouts (localStorage 'ao-tide-layouts-v1').

interface Placed {
  id: string;
  kind: string;
  p: [number, number, number];
  r: number;
  s: number;
}

const FLOOR: [number, number, number] = [-3, 0.02, 2.4];
/** The back wall, on the brick between two windows, above the back desks. */
const WALL: [number, number, number] = [-2.0, 1.7, -6.4];
/** The front desk where the first person works (their own work area). */
const WORK_SPOT: [number, number, number] = [-1.2, 0.84, -0.6];

const panel = (page: Page) => page.locator('aside.customize');
const topBtn = (page: Page, name: string) => page.locator('.topbar').getByRole('button', { name, exact: true });

async function openCustomize(page: Page) {
  await topBtn(page, 'Customize').click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(600);
}

async function layout(page: Page, theme = 'office'): Promise<Placed[] | undefined> {
  return ((await storage(page, 'ao-tide-layouts-v1')) as Record<string, Placed[]> | null)?.[theme];
}
/** Items added by the test (the theme's own come with ids like "office-3"). */
const added = async (page: Page, theme = 'office') => ((await layout(page, theme)) || []).filter((i) => !i.id.startsWith(`${theme}-`));

async function pick(page: Page, label: string) {
  const tile = panel(page).locator('.cz-item').filter({ has: page.locator('.cz-label', { hasText: new RegExp(`^${label}$`) }) });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
}

/** Points the mouse at a world point and presses there (on the picture, clear of the panel). */
async function clickWorld(page: Page, p: [number, number, number]) {
  const s = await toScreen(page, p);
  const edge = (await panel(page).boundingBox())!;
  expect(s.x, 'the point is clear of the panel').toBeGreaterThan(edge.x + edge.width + 4);
  expect(await hitAt(page, s.x, s.y)).toMatch(/^canvas/);
  await page.mouse.move(s.x - 6, s.y - 2);
  await page.mouse.move(s.x, s.y, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function placeMonstera(page: Page) {
  await pick(page, 'Monstera');
  await clickWorld(page, FLOOR);
  await expect.poll(async () => (await added(page)).length).toBe(1);
  return (await added(page))[0];
}

test('CU-01 open and close', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  await expect(panel(page).locator('.cz-sec h3').first()).toHaveText('Around the office');
  await expect(topBtn(page, 'Customizing')).toHaveAttribute('aria-pressed', 'true');
  // picture tiles: every item shows a picture of itself
  const tiles = panel(page).locator('.cz-item');
  expect(await tiles.count()).toBeGreaterThan(10);
  await expect
    .poll(
      () =>
        panel(page)
          .locator('.cz-thumb img')
          .evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length),
      { timeout: 30_000 },
    )
    .toBe(await tiles.count());
  await panel(page).getByRole('button', { name: 'Done' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(topBtn(page, 'Customize')).toHaveAttribute('aria-pressed', 'false');
  expectNoErrors(errors);
});

test('CU-02 place on the floor', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  const it = await placeMonstera(page);
  expect(it.kind).toBe('o-monstera');
  // it stands where you clicked, on the floor
  expect(Math.abs(it.p[0] - FLOOR[0])).toBeLessThan(0.3);
  expect(Math.abs(it.p[2] - FLOOR[2])).toBeLessThan(0.3);
  expect(Math.abs(it.p[1])).toBeLessThan(0.05);
  // and it is selected
  await expect(panel(page)).toHaveAttribute('data-selected', it.id);
  await expect(panel(page).locator('.cz-sel-name')).toHaveText('Monstera');
  await expect(panel(page)).toHaveAttribute('data-placing', '');
  expectNoErrors(errors);
});

test('CU-03 where things may go', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  // a wall item on the floor: not placed
  await pick(page, 'Framed print');
  await clickWorld(page, FLOOR);
  await page.waitForTimeout(400);
  expect(await added(page), 'nothing placed on the floor').toEqual([]);
  await expect(panel(page)).toHaveAttribute('data-placing', 'o-art');
  // on a wall: placed flat on it
  await clickWorld(page, WALL);
  await expect.poll(async () => (await added(page)).length).toBe(1);
  const art = (await added(page))[0];
  expect(art.kind).toBe('o-art');
  expect(Math.abs(art.p[2] - WALL[2]), 'against the back wall').toBeLessThan(0.08);
  expect(Math.abs(art.r), 'turned to face the room, flat on the wall').toBeLessThan(0.01);
  expect(Math.abs(art.p[1] - WALL[1])).toBeLessThan(0.3);

  // a small item on someone's work spot: not placed
  await pick(page, 'Globe');
  await clickWorld(page, WORK_SPOT);
  await page.waitForTimeout(400);
  expect((await added(page)).filter((i) => i.kind === 'o-globe'), 'nothing on the work spot').toEqual([]);
  await expect(panel(page)).toHaveAttribute('data-placing', 'o-globe');
  // (on a free bit of the same desk it does go)
  await clickWorld(page, [0, 0.84, -0.55]);
  await expect.poll(async () => (await added(page)).filter((i) => i.kind === 'o-globe').length).toBe(1);
  expectNoErrors(errors);
});

test('CU-04 edit a placed item', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  const it = await placeMonstera(page);
  const now = async (id: string) => ((await layout(page)) || []).find((i) => i.id === id);
  const tool = (name: string) => panel(page).getByRole('button', { name, exact: true });
  const step = Math.PI / 12;

  await tool('Turn left').click();
  await expect.poll(async () => (await now(it.id))?.r).toBeCloseTo(it.r - step, 4);
  await tool('Turn right').click();
  await expect.poll(async () => (await now(it.id))?.r).toBeCloseTo(it.r, 4);
  await tool('Bigger').click();
  await expect.poll(async () => (await now(it.id))?.s).toBeCloseTo(1.1, 4);
  await tool('Smaller').click();
  await expect.poll(async () => (await now(it.id))?.s).toBeCloseTo(1.0, 4);

  await tool('Duplicate').click();
  await expect.poll(async () => (await added(page)).length).toBe(2);
  const copy = (await added(page)).find((i) => i.id !== it.id)!;
  expect(copy.kind).toBe('o-monstera');
  const gap = Math.hypot(copy.p[0] - it.p[0], copy.p[2] - it.p[2]);
  expect(gap, 'beside it').toBeGreaterThan(0.5);
  expect(gap).toBeLessThan(2);
  await expect(panel(page)).toHaveAttribute('data-selected', copy.id);

  await tool('Remove').click();
  await expect.poll(async () => (await added(page)).map((i) => i.id)).toEqual([it.id]);
  await expect(panel(page)).toHaveAttribute('data-selected', '');
  expectNoErrors(errors);
});

test('CU-05 reset the theme', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  await placeMonstera(page);
  const reset = panel(page).locator('.cz-foot button').first();
  await expect(reset).toHaveText('Reset theme');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(reset).toHaveText('Click again to reset');
  expect(await added(page), 'nothing changed yet').toHaveLength(1);
  await reset.click();
  // the theme's own layout is back
  await expect.poll(() => layout(page)).toBeUndefined();
  await expect(reset).toHaveText('Reset theme');
  await expect(reset).toBeDisabled();
  expectNoErrors(errors);
});

test('CU-06 saved per theme', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  const it = await placeMonstera(page);
  // reload: still there
  await openScene(page);
  expect((await added(page)).map((i) => i.id)).toEqual([it.id]);
  await openCustomize(page);
  await expect(panel(page).locator('.cz-foot button').first(), 'the office is customised').toBeEnabled();
  await panel(page).getByRole('button', { name: 'Done' }).click();
  // the kitchen doesn't have it
  await pickTheme(page, 'kitchen');
  expect(await layout(page, 'kitchen'), 'the kitchen keeps its own layout').toBeUndefined();
  await openCustomize(page);
  await expect(panel(page).locator('.cz-sec h3').first()).toHaveText('Around the kitchen');
  await expect(panel(page).locator('.cz-foot button').first(), 'the kitchen is not customised').toBeDisabled();
  expectNoErrors(errors);
});

test('CU-07 shortcut keys are off while customizing', async ({ page, errors }) => {
  await openScene(page);
  await openCustomize(page);
  const before = await camState(page);
  await page.keyboard.press('3');
  await page.keyboard.press('s');
  await page.waitForTimeout(1500);
  const after = await camState(page);
  expect(Math.hypot(after.pos[0] - before.pos[0], after.pos[1] - before.pos[1], after.pos[2] - before.pos[2]), 'the camera did not jump').toBeLessThan(0.05);
  await expect(page.locator('.app')).not.toHaveClass(/\bstream\b/);
  // (out of Customize, the same key moves it)
  await panel(page).getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('3');
  await expect(camBtn(page, 'From above')).toHaveAttribute('aria-pressed', 'true');
  expectNoErrors(errors);
});
