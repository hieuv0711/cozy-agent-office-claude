import { expect, expectNoErrors, test } from './support/fixtures';
import { MockOffice } from './support/mock';

// 9. Team view. TE-01 uses the sessions running on this Mac (checks don't
// depend on what they are); TE-02 a mocked empty office.

test('TE-01 team view', async ({ page, request, errors }) => {
  const live = ((await (await request.get('/api/office')).json()) as { sessions: { id: string; subsTotal: number }[] }).sessions;
  test.skip(!live.length, 'no Claude Code session is running on this Mac');
  await page.goto('/?test#team');
  await expect(page.getByRole('heading', { name: 'Team view' })).toBeVisible();
  // a session picker: the live sessions
  const rows = page.locator('.page .hrow');
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  const withHelpers = rows.filter({ hasText: /[1-9]\d* subagents/ });
  const pick = (await withHelpers.count()) ? withHelpers.first() : rows.first();
  await pick.click();
  const picker = page.getByRole('combobox', { name: 'Session' });
  await expect(picker).toBeVisible();
  const sections = ['Who did what, and when', 'Running now', 'Returned to the main agent'];
  const shown = async () => {
    await expect(page.locator('.page .loading')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.page .err')).toHaveCount(0);
    for (const name of sections) await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  };
  await shown();
  // change the time window: the sections follow
  const windows = page.getByRole('group', { name: 'Time window' });
  for (const w of ['1 hour', '4 hours', 'All', '15 min']) {
    const b = windows.getByRole('button', { name: w, exact: true });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await shown();
  }
  // pick another session from the picker
  const options = await picker.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const current = await picker.inputValue();
  const other = options.find((v) => v !== current);
  if (other) {
    await picker.selectOption(other);
    await expect(picker).toHaveValue(other);
    await shown();
  }
  expectNoErrors(errors);
});

test('TE-02 no live sessions', async ({ page, errors }) => {
  await new MockOffice(page, []).install();
  await page.goto('/?test#team');
  await expect(page.getByRole('heading', { name: 'Team view' })).toBeVisible();
  await expect(page.locator('.page')).toContainText('No live sessions. Open one from History to see its team.');
  expectNoErrors(errors);
});
