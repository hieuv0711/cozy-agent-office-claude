import type { Page } from '@playwright/test';
import { openScene, waitDrawn } from './support/app';
import { expect, expectNoErrors, test } from './support/fixtures';
import { MockOffice, session } from './support/mock';
import { figures, until } from './support/people';

// 2. People: PE-15 and PE-16. How the people are drawn is a choice in the top
// bar (crew/style.ts): little bots (the default) or ink toon. Both dress by the
// same wardrobe and move on the same rig, so the named meshes the other tests
// read are there in each. The classic sculpted people are gone: a browser that
// had them saved gets the bots.

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** What kinds of people meshes are in the scene: bot parts, ink outlines. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    let screens = 0;
    let toon = 0;
    let people = 0;
    const ao = (window as W).__ao;
    if (!ao) return { screens: -1, toon: -1, people: 0 };
    ao.scene.traverse((o: W) => {
      if (o.name === 'bot:screen') screens++;
      if (typeof o.name === 'string' && o.name.startsWith('person:')) people++;
      if (o.material?.type === 'MeshToonMaterial') toon++;
    });
    return { screens, toon, people };
  });

test('PE-15 the People choice changes how everyone is drawn, and is kept', async ({ page, errors }) => {
  test.setTimeout(120_000);
  await new MockOffice(page, [session({ name: 'ps-work', status: 'working', tool: ['Edit', 'edit', 'src/a.ts'] }), session({ name: 'ps-idle', status: 'idle', since: 30 })]).install();
  await openScene(page, '?test&world=office&weather=clear&breaks=0');
  const pick = page.getByRole('combobox', { name: 'People' });
  await until(page, 'ps-work', (c) => c.at === 'st:0', 'at their desk');
  await expect(pick.locator('option')).toHaveText(['Little bots', 'Ink toon']);

  // little bots: a screen for a face
  await pick.selectOption('bots');
  await expect.poll(async () => (await drawn(page)).screens, { message: 'bots have screens' }).toBeGreaterThanOrEqual(2);
  // ink toon: no screens, cel-shaded
  await pick.selectOption('toon');
  await expect.poll(async () => drawn(page), { message: 'toon people' }).toMatchObject({ screens: 0 });
  expect((await drawn(page)).toon).toBeGreaterThan(10);

  // kept for next time
  await pick.selectOption('toon');
  await page.reload();
  await waitDrawn(page);
  await expect(page.getByRole('combobox', { name: 'People' })).toHaveValue('toon');
  await expect.poll(async () => (await drawn(page)).toon, { message: 'still toon after a reload' }).toBeGreaterThan(10);

  // the classic people, saved before they went away: the bots instead
  await page.evaluate(() => localStorage.setItem('ao-people-style', JSON.stringify({ style: 'classic' })));
  await page.reload();
  await waitDrawn(page);
  await expect(page.getByRole('combobox', { name: 'People' })).toHaveValue('bots');
  await expect.poll(async () => (await drawn(page)).screens, { message: 'bots after a saved classic' }).toBeGreaterThanOrEqual(2);
  expectNoErrors(errors);
});

test('PE-16 every style dresses for the weather and keeps the work hats', async ({ page, errors }) => {
  test.setTimeout(150_000);
  await new MockOffice(page, [session({ name: 'pw-a', status: 'working', tool: ['Edit', 'edit', 'src/a.ts'] }), session({ name: 'pw-b', status: 'idle', since: 30 })]).install();
  for (const style of ['bots', 'toon']) {
    for (const [weather, check] of [
      ['rain', (f: { torso: string; hood: boolean }) => f.torso === 'rain' && f.hood],
      ['snow', (f: { scarf: boolean }) => f.scarf],
    ] as const) {
      await openScene(page, `?test&world=kitchen&weather=${weather}&people=${style}&breaks=0`);
      await until(page, 'pw-a', (c) => c.at === 'st:0', 'at their station');
      const staff = (await figures(page)).filter((f) => f.outfit === 'chef');
      expect(staff.length, `${style} ${weather}: everyone`).toBeGreaterThanOrEqual(2);
      expect(
        staff.every((f) => (check as (f: unknown) => boolean)(f)),
        `${style} ${weather}: ${JSON.stringify(staff)}`,
      ).toBe(true);
    }
  }
  expectNoErrors(errors);
});
