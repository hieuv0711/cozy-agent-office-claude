import type { Page } from '@playwright/test';
import { openScene } from './support/app';
import { expect, expectNoErrors, test } from './support/fixtures';
import { MockOffice, session } from './support/mock';
import { until } from './support/people';

// 9. Furniture people use: FU-01 to FU-05. The things added to a room are used
// (crew/itemPlaces.ts): the idle take breaks at them, a stool is one more
// seat, a long stretch of one kind of work sends the worker to the thing for
// it; and the editor keeps the walkways clear. Each test sets the room's
// things itself (the saved layout, removed afterwards) and reads the people
// off window.__crew and the item places off window.__walkmap.

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LAYOUT_KEY = 'ao-tide-layouts-v1';
const VERSION_KEY = 'ao-tide-layout-versions';

/** A room with only these things in it (instead of the theme's own), from the first frame. */
async function furnish(page: Page, theme: string, items: { id: string; kind: string; p: [number, number, number]; r?: number }[]) {
  const layout = { [theme]: items.map((it) => ({ r: 0, s: 1, seed: 1, ...it })) };
  await page.addInitScript(
    ([key, vkey, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem(vkey, JSON.stringify({ kitchen: 3 }));
    },
    [LAYOUT_KEY, VERSION_KEY, JSON.stringify(layout)] as const,
  );
}

/** The item places worked out for the open room. */
async function itemPlaces(page: Page): Promise<W[]> {
  return page.evaluate(() => ((window as W).__walkmap?.list ?? []).map((p: W) => ({ id: p.id, kind: p.kind, act: p.act, x: p.x, z: p.z, seat: p.seat, idle: p.idle, work: p.work })));
}

test.afterEach(async ({ page }) => {
  // the saved layout is shared by the whole run: put the rooms back as they come
  await page.evaluate(([key]) => localStorage.removeItem(key), [LAYOUT_KEY]).catch(() => undefined);
});

test('FU-01 an idle person takes a break at a water cooler you added', async ({ page, errors }) => {
  test.setTimeout(150_000);
  await furnish(page, 'office', [{ id: 'cooler', kind: 'o-water-cooler', p: [-10.5, 0, 1.8] }]);
  await new MockOffice(page, [session({ name: 'f-idle', status: 'idle', since: 5 })]).install();
  await openScene(page, '?test&world=office&weather=clear');
  // the cooler becomes a place in the room, with a spot in front of it
  await expect.poll(async () => (await itemPlaces(page)).map((p) => p.id), { message: 'the cooler is a place people can use' }).toContain('item:cooler');
  // sitting first, then (within a minute or so) over to the cooler for a drink, and back
  await until(page, 'f-idle', (c) => /^seat:/.test(c.at), 'sits down first', 30_000);
  await until(page, 'f-idle', (c) => c.at === 'place:item:cooler' && c.act === 'drink', 'drinks at the cooler', 90_000);
  await until(page, 'f-idle', (c) => /^seat:/.test(c.at), 'goes back to a seat', 40_000);
  expectNoErrors(errors);
});

test('FU-02 a stool you added is one more seat for the idle', async ({ page, errors }) => {
  test.setTimeout(120_000);
  // by the front corner, round the counter's end from the aisle (the dining floor's middle is reached only from the street)
  await furnish(page, 'kitchen', [{ id: 'stool', kind: 'r-stool', p: [-10.5, 0, 0.0] }]);
  // five idle cooks and four seats at the staff table: the fifth takes the stool
  const names = ['s-1', 's-2', 's-3', 's-4', 's-5'];
  await new MockOffice(
    page,
    names.map((name, i) => session({ name, status: 'idle', since: 100 - i * 10 })),
  ).install();
  await openScene(page, '?test&world=kitchen&weather=clear&breaks=0');
  await expect.poll(async () => (await itemPlaces(page)).filter((p) => p.seat).map((p) => p.id), { message: 'the stool is a seat' }).toEqual(['item:stool']);
  await until(page, 's-5', (c) => c.at === 'place:item:stool' && c.act === 'mug', 'sits on the stool with a mug', 40_000);
  // and the first four have the staff table's seats
  for (const n of names.slice(0, 4)) await until(page, n, (c) => /^seat:[0-3]$/.test(c.at), 'sits at the staff table', 20_000);
  expectNoErrors(errors);
});

test('FU-03 a long stretch of reading sends the worker to the bookshelf', async ({ page, errors }) => {
  test.setTimeout(120_000);
  await furnish(page, 'office', [{ id: 'shelf', kind: 'o-bookshelf', p: [-5.5, 0, 3.2], r: Math.PI }]);
  const mock = await new MockOffice(page, [session({ name: 'f-reader', status: 'working', tool: ['Read', 'read', 'src/a.ts'] })]).install();
  await openScene(page, '?test&world=office&weather=clear');
  await until(page, 'f-reader', (c) => c.at === 'st:0', 'starts at their desk', 30_000);
  await expect.poll(async () => (await itemPlaces(page)).find((p) => p.id === 'item:shelf')?.work ?? [], { message: 'the bookshelf is for reading' }).toContain('read');
  // after a few seconds of reading: over to the bookshelf, browsing
  await until(page, 'f-reader', (c) => c.at === 'place:item:shelf' && c.act === 'browse', 'browses the bookshelf', 45_000);
  // a different kind of work: back to the desk
  await mock.set({ 'f-reader': { tool: ['Edit', 'edit', 'src/a.ts'] } });
  await until(page, 'f-reader', (c) => c.at === 'st:0', 'goes back to the desk', 40_000);
  expectNoErrors(errors);
});

test('FU-04 the walkways stay clear when you add furniture', async ({ page, errors }) => {
  test.setTimeout(120_000);
  await furnish(page, 'office', []);
  await new MockOffice(page, [session({ name: 'f-one', status: 'working', tool: ['Edit', 'edit', 'src/a.ts'] })]).install();
  await openScene(page, '?test&world=office&weather=clear');
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.locator('.customize').getByRole('button', { name: /Water cooler/ }).click();
  const at = (x: number, z: number) =>
    page.evaluate(
      ([x, z]) => {
        const { camera, gl } = (window as W).__ao;
        const v = new (camera.position.constructor as W)(x, 0, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      [x, z] as const,
    );
  // over the aisle between the desks: not here, and the panel says why
  let p = await at(0, -3.15);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await expect(page.locator('.cz-blocked')).toContainText('People walk here');
  await page.mouse.down();
  await page.mouse.up();
  expect(await page.evaluate(([k]) => localStorage.getItem(k) ?? '', [LAYOUT_KEY] as const)).not.toContain('o-water-cooler');
  // over the open floor in front of the desks (clear of the panel): it goes down
  p = await at(3.0, 2.4);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await expect(page.locator('.cz-blocked')).toHaveCount(0);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(([k]) => localStorage.getItem(k) ?? '', [LAYOUT_KEY] as const)).toContain('o-water-cooler');
  await page.getByRole('button', { name: 'Done' }).click();
  // and it's a place people can use, reached without walking through anything
  await expect.poll(async () => (await itemPlaces(page)).some((q) => q.kind === 'o-water-cooler'), { message: 'the new cooler is usable' }).toBe(true);
  expectNoErrors(errors);
});

test('FU-05 the ways to the things people use go round everything', async ({ page, errors }) => {
  test.setTimeout(90_000);
  await new MockOffice(page, [session({ name: 'f-one', status: 'idle', since: 5 })]).install();
  for (const world of ['office', 'kitchen', 'workshop']) {
    await openScene(page, `?test&world=${world}&weather=clear`);
    await expect.poll(() => page.evaluate(() => !!(window as W).__walkmap), { message: `${world}: the walk map is drawn` }).toBe(true);
    const aisleZ = world === 'office' ? -3.15 : -3.0;
    const bad = await page.evaluate((aisleZ) => {
      const { map, list } = (window as W).__walkmap;
      const out: string[] = [];
      for (const p of list) {
        // from the aisle, through every corner, to the spot: every stretch clear (a stool's last step is onto it)
        const pts = [[p.aisleX, aisleZ], ...p.via, [p.x, p.z]];
        for (let i = 1; i < pts.length; i++) if (!(p.seat && i === pts.length - 1) && !map.clear(pts[i - 1], pts[i])) out.push(`${p.id} ${i}`);
      }
      return { out, n: list.length };
    }, aisleZ);
    expect(bad.out, `${world}: blocked stretches`).toEqual([]);
    expect(bad.n, `${world}: things people use`).toBeGreaterThan(2);
  }
  expectNoErrors(errors);
});
