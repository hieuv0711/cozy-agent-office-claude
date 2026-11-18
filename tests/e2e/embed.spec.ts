import { openScene } from './support/app';
import { expect, expectNoErrors, test } from './support/fixtures';

// SH-10: the page as the VS Code / Cursor extension shows it. Its bottom panel
// (`?embed=panel`) opens on the room alone with a small bar, since a pane that
// short has no room for the rest; "More" brings the whole app, and "Room only"
// goes back. An editor tab (`?embed=tab`) opens on the whole app.

test('SH-10 the editor panel: the room alone, and the whole app one click away', async ({ page, errors }) => {
  await page.setViewportSize({ width: 1100, height: 320 });
  await openScene(page, '?demo&test&embed=panel');
  const bar = page.getByRole('toolbar', { name: 'Agent Office' });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/\d+working/);
  await expect(bar.getByRole('button', { name: /waiting/ })).toBeVisible();
  // the room fills the pane: no top bar, no captions, the name tags are there
  await expect(page.locator('header.topbar')).toHaveCount(0);
  await expect(page.locator('.rail')).toHaveCount(0);
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  const stage = (await page.locator('.stage').boundingBox())!;
  expect(stage.height, 'the room takes the whole pane').toBeGreaterThanOrEqual(318);
  // a person's card stays closed here, so it can't cover the room
  await page.locator('.labels .chip').first().click();
  await expect(page.locator('aside.panel')).toHaveCount(0);

  // the whole app, in place
  await bar.getByRole('button', { name: 'More' }).click();
  await expect(page.locator('header.topbar')).toBeVisible();
  await expect(page.locator('.rail')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Weather' })).toBeVisible();
  // and back
  await page.locator('header.topbar').getByRole('button', { name: 'Room only' }).click();
  await expect(page.locator('header.topbar')).toHaveCount(0);
  await expect(bar).toBeVisible();
  expectNoErrors(errors);
});

test('SH-10 an editor tab opens on the whole app, with Room only to hand', async ({ page, errors }) => {
  await openScene(page, '?demo&test&embed=tab');
  await expect(page.locator('header.topbar')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Agent Office' })).toHaveCount(0);
  await expect(page.locator('header.topbar').getByRole('button', { name: 'Room only' })).toBeVisible();
  // in the browser, without the extension, there is no such button
  await openScene(page, '?demo&test');
  await expect(page.locator('header.topbar').getByRole('button', { name: 'Room only' })).toHaveCount(0);
  expectNoErrors(errors);
});
