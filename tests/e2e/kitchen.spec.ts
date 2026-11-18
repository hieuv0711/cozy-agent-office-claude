import type { Page } from '@playwright/test';
import { crew, logCrew, openScene, pageNow, pickWeather, readLog, rowsOf } from './support/app';
import { expect, expectNoErrors, test } from './support/fixtures';
import { MockOffice, session, sub } from './support/mock';
import { dining, figures, until } from './support/people';

// 2. People, the kitchen's own: PE-09 (the cook serves the customer who came in
// for the dish) and PE-10 (nobody but the cooks until a dish is ready, and
// customers who look like customers).
//
// Made-up sessions the test controls (support/mock.ts), read through the test
// hooks: window.__crew (each cook), window.__dining (customers and dishes to
// go) and the scene's named meshes (support/people.ts).

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function kitchen(page: Page, weather = 'clear') {
  const mock = await new MockOffice(page, [
    session({ name: 'cook-a', status: 'working', tool: ['Edit', 'edit', 'src/a.ts'] }),
    session({ name: 'cook-b', status: 'working', tool: ['Read', 'read', 'src/b.ts'], subs: [sub('Explore')] }),
    session({ name: 'cook-c', status: 'working', tool: ['Edit', 'edit', 'src/c.ts'] }),
  ]).install();
  // (breaks=0: nobody wanders off to the room's things, so where everyone is stays predictable)
  await openScene(page, `?test&world=kitchen&weather=${weather}&breaks=0`);
  await until(page, 'cook-a', (c) => c.at === 'st:0' && c.act === 'chop', 'chops at their station');
  return mock;
}

test('PE-09 kitchen end of turn: the cook serves a customer', async ({ page, errors }) => {
  test.setTimeout(180_000);
  // everyone is sampled ten times a second from the start, so the whole routine can be read back in order
  await logCrew(page);
  const mock = await kitchen(page);
  // nobody in the dining room yet
  expect(await dining(page)).toEqual({ customers: [], bowls: 0, hasWaiter: false });

  // a turn ends
  const t0 = await pageNow(page);
  await mock.set({ 'cook-a': { status: 'idle' } });
  // ...and in the end the cook, idle now, sits down with a mug
  await until(page, 'cook-a', (c) => /^seat:\d+$/.test(c.at) && c.act === 'mug', 'ends up sitting down with a mug', 60_000);

  // in between: plated at the station, carried the bowl round, served at the table, in that order
  const rows = rowsOf(await readLog(page, t0), 'cook-a');
  const first = (ok: (r: (typeof rows)[number]) => boolean) => rows.findIndex(ok);
  const plate = first((r) => r[2] === 'plate' && r[3] === 'st:0');
  const carry = first((r) => r[2] === 'carry');
  const serve = first((r) => r[2] === 'serve' && /^place:serve-\d+$/.test(r[3]));
  const sit = first((r) => r[2] === 'mug' && /^seat:/.test(r[3]));
  expect([plate, carry, serve, sit].every((i) => i >= 0), `plate ${plate}, carry ${carry}, serve ${serve}, sit ${sit}`).toBe(true);
  expect(plate < carry && carry < serve && serve < sit, 'plate, carry, serve, then sit').toBe(true);

  // the customer came in for that dish, was served, and eats for a minute or two
  const d = await dining(page);
  expect(d.customers).toHaveLength(1);
  expect(d.customers[0]).toMatchObject({ for: mock.get('cook-a').id, phase: 'eat', served: true });
  expect(d.customers[0].eatFor).toBeGreaterThanOrEqual(70);
  expect(d.customers[0].eatFor).toBeLessThanOrEqual(120);
  // the other cooks carried on working all along
  const now = await crew(page);
  expect(now['cook-b'].at).toBe('st:1');
  expect(now['cook-c'].at).toBe('st:2');
  expectNoErrors(errors);
});

test('PE-10 kitchen: only the cooks until a dish is ready', async ({ page, errors }) => {
  test.setTimeout(150_000);
  await kitchen(page);
  // only cooks and their apprentice: no waiter, no customer
  await expect.poll(async () => (await figures(page)).length, { message: 'three cooks and one apprentice' }).toBe(4);
  const people = await figures(page);
  expect(people.map((p) => p.outfit).sort()).toEqual(['chef', 'chef', 'chef', 'chef']);
  expect(await dining(page)).toEqual({ customers: [], bowls: 0, hasWaiter: false });

  // a customer (sent in the way a finished dish sends one): street clothes, not a cook's whites
  await page.evaluate(() => (window as W).__dining.order('dish-1', 0));
  await expect.poll(async () => (await figures(page)).filter((p) => p.outfit === 'diner').length, { message: 'a customer comes in' }).toBe(1);
  const diner = (await figures(page)).find((p) => p.outfit === 'diner')!;
  expect(diner.torso, 'a coat').toBe('coat');
  expect(diner.hat).not.toBe('toque');

  // in the rain: a raincoat, and an umbrella on the way in
  await pickWeather(page, 'rain');
  await page.evaluate(() => (window as W).__dining.order('dish-2', 1));
  await expect
    .poll(async () => (await figures(page)).some((p) => p.outfit === 'diner' && p.umbrella && p.torso === 'rain'), { message: 'the second customer walks in under an umbrella, in a raincoat', timeout: 8_000 })
    .toBe(true);

  // both seats taken: the next dish goes out to go, on the counter's ledge
  await page.evaluate(() => (window as W).__dining.order('dish-3', 2));
  const d = await dining(page);
  expect(d.customers.length, 'still two customers').toBe(2);
  expect(d.bowls, 'one dish to go').toBe(1);
  // it's collected after a while
  await expect.poll(async () => (await dining(page)).bowls, { message: 'the dish to go is collected', timeout: 30_000 }).toBe(0);
  expectNoErrors(errors);
});

test('PE-10 kitchen: on a sunny day customers come in in shirts, sunglasses and straw hats', async ({ page, errors }) => {
  test.setTimeout(120_000);
  await kitchen(page, 'sunny');
  await page.evaluate(() => (window as W).__dining.order('dish-sun', 0));
  await expect.poll(async () => (await figures(page)).filter((p) => p.outfit === 'diner').length, { message: 'a customer comes in' }).toBe(1);
  const diner = (await figures(page)).find((p) => p.outfit === 'diner')!;
  expect(diner.torso, 'a shirt, not a coat').toBe('shirt');
  expect(diner.hat, 'a straw hat').toBe('sunhat');
  // sunglasses on the customer, and on nobody in the kitchen's own crew
  const shades = await page.evaluate(() => {
    const out: string[] = [];
    (window as W).__ao.scene.traverse((o: W) => {
      if (typeof o.name !== 'string' || !o.name.startsWith('person:')) return;
      let has = false;
      o.traverse((c: W) => void (c.name === 'sunglasses' && (has = true)));
      if (has) out.push(o.name.slice(7));
    });
    return out;
  });
  expect(shades).toEqual(['diner']);
  expectNoErrors(errors);
});
