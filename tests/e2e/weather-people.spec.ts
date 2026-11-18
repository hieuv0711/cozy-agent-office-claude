import type { Page } from '@playwright/test';
import { crew, openScene, pickWeather } from './support/app';
import { expect, expectNoErrors, test, THEMES } from './support/fixtures';
import { MockOffice, session, sub } from './support/mock';
import { figures, until, type Figure } from './support/people';

// 3. Weather on the people: WX-04 (they dress for it) and WX-05 (they react to it).
// Read off the scene's named meshes (support/people.ts) and window.__crew's
// `wear`.

const STAFF = new Set(['chef', 'office', 'maker']);

async function room(page: Page, world: string, weather: string, extra = '') {
  const mock = await new MockOffice(page, [
    session({ name: 'p-work', status: 'working', tool: ['Edit', 'edit', 'src/a.ts'], subs: [sub('Explore')] }),
    session({ name: 'p-idle', status: 'idle', since: 30 }),
    session({ name: 'p-wait', status: 'needs-you' }),
  ]).install();
  await openScene(page, `?test&world=${world}&weather=${weather}${extra}`);
  await until(page, 'p-work', (c) => c.at === 'st:0', 'is at their station');
  return mock;
}

const staff = async (page: Page) => (await figures(page)).filter((f) => STAFF.has(f.outfit));
const all = (list: Figure[], ok: (f: Figure) => boolean) => list.length > 0 && list.every(ok);

for (const world of THEMES) {
  test(`WX-04 people dress for the weather (${world})`, async ({ page, errors }) => {
    test.setTimeout(150_000);
    await room(page, world, 'clear');
    // clear: their usual clothes
    let people = await staff(page);
    expect(people.length, 'three people and a helper').toBe(4);
    expect(all(people, (f) => f.torso !== 'rain' && !f.hood && !f.scarf), JSON.stringify(people)).toBe(true);
    expect(Object.values(await crew(page)).every((c) => c.wear === 'none')).toBe(true);
    const hats = Object.fromEntries(people.map((f, i) => [i, f.hat]));
    const usual = people.map((f) => `${f.torso} ${f.hat}`);

    // rain: a rain jacket, hood down, for everyone (helpers too); work hats stay on
    await pickWeather(page, 'rain');
    await expect.poll(async () => all(await staff(page), (f) => f.torso === 'rain' && f.hood), { message: 'everyone in a rain jacket' }).toBe(true);
    people = await staff(page);
    expect(Object.fromEntries(people.map((f, i) => [i, f.hat])), 'the same hats').toEqual(hats);
    // the crew's record is written on the next frame; the clothes can show first
    await expect.poll(async () => Object.values(await crew(page)).every((c) => c.wear === 'rain'), { message: 'everyone dressed for rain' }).toBe(true);

    // snow: a scarf for everyone, a beanie for those without a work hat
    await pickWeather(page, 'snow');
    await expect.poll(async () => all(await staff(page), (f) => f.scarf && !f.hood && f.torso !== 'rain'), { message: 'everyone in a scarf' }).toBe(true);
    people = await staff(page);
    for (const f of people) {
      if (f.hat === '' || f.hat === 'headphones') expect(f.beanie, `no work hat (${f.hat || 'bare'}): a beanie`).toBe(f.hat === '');
      else expect(f.beanie, `a ${f.hat} stays on, no beanie`).toBe(false);
    }
    // the crew's record is written on the next frame; the clothes can show first
    await expect.poll(async () => Object.values(await crew(page)).every((c) => c.wear === 'snow'), { message: 'everyone dressed for snow' }).toBe(true);

    // sunny: no rain jacket, scarf or beanie in the sunshine: their usual clothes and hats
    await pickWeather(page, 'sunny');
    await expect.poll(async () => all(await staff(page), (f) => !f.scarf && !f.hood && f.torso !== 'rain' && !f.beanie), { message: 'their usual clothes in the sun' }).toBe(true);
    expect((await staff(page)).map((f) => `${f.torso} ${f.hat}`), 'the same clothes as on a clear night').toEqual(usual);
    // the crew's record is written on the next frame; the clothes can show first
    await expect.poll(async () => Object.values(await crew(page)).every((c) => c.wear === 'sun'), { message: 'everyone dressed for sun' }).toBe(true);

    // clear again: back to their usual clothes, without a reload
    await pickWeather(page, 'clear');
    await expect.poll(async () => all(await staff(page), (f) => !f.scarf && !f.hood && f.torso !== 'rain' && !f.beanie), { message: 'back to their usual clothes' }).toBe(true);
    expectNoErrors(errors);
  });
}

test('WX-05 people react to the weather', async ({ page, errors }) => {
  test.setTimeout(180_000);
  // snow: the idle ones hold a hot drink in both hands (no breaks at the furniture, so they stay in their seats)
  await room(page, 'office', 'snow', '&breaks=0');
  await until(page, 'p-idle', (c) => /^seat:\d+$/.test(c.at) && c.act === 'cocoa', 'holds a hot drink', 15_000);
  // sunny: an iced drink instead
  await pickWeather(page, 'sunny');
  await until(page, 'p-idle', (c) => /^seat:\d+$/.test(c.at) && c.act === 'iced', 'holds an iced drink', 15_000);
  // and not in clear weather: the usual mug
  await pickWeather(page, 'clear');
  await until(page, 'p-idle', (c) => c.act === 'mug', 'goes back to the mug', 15_000);
  expectNoErrors(errors);
});
