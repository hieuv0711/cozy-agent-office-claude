import type { Page } from '@playwright/test';
import { expect, expectNoErrors, test } from './support/fixtures';
import { camBtn, camState, chip, crew, hitAt, openScene, personMarks, realDetail, ringsShown, serveDetail, toScreen } from './support/app';
import { MockOffice, session, sub } from './support/mock';

// 5. Selecting someone (?demo).

const card = (page: Page) => page.locator('aside.panel[aria-label="Agent detail"]');

/** Where to click on a person's body (their middle), checked to be the 3D picture and not a tag. */
async function bodyPoint(page: Page, name: string) {
  const c = (await crew(page))[name];
  for (const y of [1.4, 1.1, 1.7]) {
    const p = await toScreen(page, [c.x, y, c.z]);
    if ((await hitAt(page, p.x, p.y)).startsWith('canvas')) return p;
  }
  return null;
}

/**
 * Someone who stays put (seated or waiting, not walking), whose body shows on
 * the picture, left of where the card opens (the right quarter of the stage).
 */
async function stillPerson(page: Page, prefer: string[]) {
  const box = (await page.locator('.stage canvas').boundingBox())!;
  for (const name of prefer) {
    const c = (await crew(page))[name];
    if (!c || c.at.startsWith('→')) continue;
    const p = await bodyPoint(page, name);
    if (p && p.x < box.x + box.width * 0.72) return { name, p, c };
  }
  throw new Error(`none of ${prefer.join(', ')} can be clicked`);
}

test('SE-01 select by name tag', async ({ page, errors }) => {
  await openScene(page);
  expect(await ringsShown(page)).toBe(0);
  await chip(page, 'web-shop-81').click();
  // a card with the session's title, a ring under the person
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('h1')).toHaveText('Add order history page');
  await expect.poll(async () => (await personMarks(page, 'web-shop-81'))?.ring).toBe(true);
  expect(await ringsShown(page), 'one ring').toBe(1);
  await expect(chip(page, 'web-shop-81')).toHaveClass(/\bsel\b/);
  // the session has helpers: their tags appear (in full; other helpers may keep a quiet tag)
  await expect(page.locator('.labels .bot-chip:not(.quiet)')).toHaveCount(2);
  for (const b of await page.locator('.labels .bot-chip:not(.quiet)').all()) await expect(b).toBeVisible();
  expectNoErrors(errors);
});

/** Clicks a tab of the card and checks what its section shows. */
function cardTabs(page: Page) {
  const tabs = card(page).getByRole('tablist', { name: 'Agent detail sections' });
  const body = card(page).locator('.panel-body');
  const tab = (name: string) => tabs.getByRole('tab', { name: new RegExp(`^${name}`) });
  return async (name: string, shows: RegExp | ((p: Page) => Promise<void>)) => {
    await tab(name).click();
    await expect(tab(name)).toHaveAttribute('aria-selected', 'true');
    for (const other of ['Overview', 'Timeline', 'Subagents', 'Tokens'].filter((t) => t !== name)) await expect(tab(other)).toHaveAttribute('aria-selected', 'false');
    await expect(body).not.toContainText('Reading the session…');
    await expect(body).not.toContainText('Could not load');
    if (shows instanceof RegExp) await expect(body).toContainText(shows);
    else await shows(page);
  };
}

test('SE-02 card tabs (demo: a made-up session says it has no history)', async ({ page, errors }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/session/')) asked.push(r.url());
  });
  await openScene(page);
  await chip(page, 'web-shop-81').click();
  const open = cardTabs(page);
  const made = /A made-up session \(demo\): it has no history to show here\./;
  await open('Timeline', made);
  await open('Subagents', made);
  await open('Tokens', made);
  await open('Overview', /Estimated cost/);
  await expect(card(page).locator('.panel-body')).not.toContainText(made);
  expect(asked, 'a demo session asks the server for nothing').toEqual([]);
  expectNoErrors(errors);
});

test('SE-02 card tabs, with a real session\'s history', async ({ page, request, errors }) => {
  // a session (made up, shaped like a real one) whose detail is a real session of this
  // Mac's history: what the card's sections show for a session with a transcript
  const detail = await realDetail(request);
  test.skip(!detail, 'no session in this Mac’s history');
  await new MockOffice(page, [session({ name: 'with-history', title: 'A session with a history', tool: ['Edit', 'edit', 'src/a.ts'], subs: [sub('Explore')] })]).install();
  await serveDetail(page, detail!, { live: true });
  await openScene(page, '?test&weather=clear');
  await chip(page, 'with-history').click();
  const open = cardTabs(page);
  await open('Timeline', async (p) => {
    await expect(p.getByRole('searchbox', { name: 'Find in this timeline' })).toBeVisible();
  });
  await open('Subagents', /Open the team view|has not started any subagents/);
  await open('Tokens', /Token mix, all agents/);
  await open('Overview', /Estimated cost/);
  expectNoErrors(errors);
});

test('SE-03 close the card', async ({ page, errors }) => {
  await openScene(page);
  await chip(page, 'notes-app-3f').click();
  await expect(card(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(chip(page, 'notes-app-3f')).not.toHaveClass(/\bsel\b/);

  await chip(page, 'notes-app-3f').click();
  await expect(card(page)).toBeVisible();
  // click empty floor (in front of the desks)
  let spot = null;
  for (const p of [[-3, 0.02, 2.4], [3, 0.02, 2.4], [0, 0.02, 3.4]] as [number, number, number][]) {
    const s = await toScreen(page, p);
    if ((await hitAt(page, s.x, s.y)).startsWith('canvas')) {
      spot = s;
      break;
    }
  }
  expect(spot, 'a bit of empty floor on screen').not.toBeNull();
  await page.mouse.click(spot!.x, spot!.y);
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => ringsShown(page)).toBe(0);
  expectNoErrors(errors);
});

test('SE-04 double-click to focus', async ({ page, errors }) => {
  await openScene(page);
  const d0 = (await camState(page)).dist;
  // someone in the lounge (napping): the card opens on the right and must not cover them
  const { name, p, c } = await stillPerson(page, ['photo-api-9d', 'notes-app-e4']);
  await page.mouse.dblclick(p.x, p.y);
  await expect(card(page)).toBeVisible();
  await expect(chip(page, name)).toHaveClass(/\bsel\b/);
  await expect(camBtn(page, 'Close-up')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => {
      const s = await camState(page);
      return s.dist < d0 - 8 && Math.abs(s.target[0] - c.x) < 0.3 && Math.abs(s.target[2] - c.z) < 0.3 ? 'ok' : JSON.stringify(s);
    }, { message: 'the camera moves in on them' })
    .toBe('ok');

  // (someone on the right of the room sits under where the card opens: the first click opens
  // the card over them and the second lands on the card, so the camera doesn't move)
  await page.keyboard.press('Escape');
  await camBtn(page, 'Wide').click();
  await page.waitForTimeout(1500);
  const r = await bodyPoint(page, 'notes-app-3f');
  if (r) {
    await page.mouse.dblclick(r.x, r.y);
    await page.waitForTimeout(1500);
    const pressed = await camBtn(page, 'Close-up').getAttribute('aria-pressed');
    test.info().annotations.push({ type: 'right side', description: `double-click on notes-app-3f (under the card): camera moved in = ${pressed}` });
  }
  expectNoErrors(errors);
});

test('SE-05 people cannot be picked while customizing', async ({ page, errors }) => {
  await openScene(page);
  await page.locator('.topbar').getByRole('button', { name: 'Customize' }).click();
  await expect(page.locator('aside.customize')).toBeVisible();
  await page.waitForTimeout(800);
  const { name, p } = await stillPerson(page, ['notes-app-3f', 'photo-api-9d', 'notes-app-e4', 'web-shop-81', 'docs-site-5a', 'billing-07', 'photo-api-c2']);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(600);
  expect((await personMarks(page, name))?.ring, 'no ring').toBe(false);
  await page.locator('aside.customize').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('aside.customize')).toHaveCount(0);
  await expect(card(page), 'nothing was selected').toHaveCount(0);
  await expect(camBtn(page, 'Close-up')).toBeDisabled();
  // (out of Customize, the same click does pick them)
  await page.waitForTimeout(800);
  const q = await bodyPoint(page, name);
  expect(q, `${name} on screen`).not.toBeNull();
  await page.mouse.click(q!.x, q!.y);
  await expect(card(page)).toBeVisible();
  expectNoErrors(errors);
});
