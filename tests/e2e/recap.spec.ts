import { expect, expectNoErrors, test } from './support/fixtures';
import { viewTab } from './support/app';

// 8. Recap, on the made-up history `?demo` brings (no real project shows); the
// empty and failing answers are made-up replies from the server's address.

const RECAP = /\/api\/recap(\?|$)/;
const PERIODS: [string, RegExp][] = [
  ['Today', /\S/],
  ['Yesterday', /\S/],
  ['This week', /^Week of /],
  ['Last 7 days', / to /],
  ['This month', /^[A-Z][a-z]+ \d{4}$/],
];

test('RE-01 periods', async ({ page, errors }) => {
  await page.goto('/?demo&test#recap');
  await expect(page.locator('.rc h1')).toHaveText('Recap');
  const group = page.getByRole('group', { name: 'Period' });
  const seenWords = new Set<string>();
  for (const [label, words] of PERIODS) {
    const b = group.getByRole('button', { name: label, exact: true });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.rc .loading')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.rc-period')).toHaveText(words);
    seenWords.add((await page.locator('.rc-period').textContent()) || '');
    // words first; figures folded away under Numbers, after them
    const digest = page.locator('.rc-digest');
    await expect(digest).toBeVisible();
    expect(await digest.textContent()).not.toMatch(/\$\s?\d/);
    const nums = page.locator('.rc details.nums');
    await expect(nums).toHaveCount(1);
    await expect(nums).not.toHaveAttribute('open', /.*/);
    await expect(nums.locator('.nums-body')).toBeHidden();
    const order = await page.locator('.rc').evaluate((el) => {
      const d = el.querySelector('.rc-digest');
      const n = el.querySelector('details.nums');
      return d && n ? d.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
    });
    expect(order, 'the words come before the figures').toBeTruthy();
  }
  expect(seenWords.size, 'each period has its own heading').toBe(PERIODS.length);
  // the made-up week: the running sessions, a busiest day, a quiet one
  await group.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  await expect(page.locator('.rc-digest')).toContainText('Seven sessions are still running.');
  await expect(page.locator('.rc-high')).toHaveCount(5);
  // Numbers: the figures, once opened
  const nums = page.locator('.rc details.nums');
  await nums.locator('summary').click();
  await expect(nums).toHaveAttribute('open', '');
  for (const k of ['Tokens', 'Estimated cost', 'Prompts you wrote', 'Tool calls']) await expect(nums.locator('.fig dt', { hasText: new RegExp(`^${k}$`) })).toBeVisible();
  await expect(nums.locator('.rc-model')).toHaveCount(3);
  expectNoErrors(errors);
});

test('RE-02 nothing yet', async ({ page, errors }) => {
  // an empty answer for whatever period is asked
  await page.route(RECAP, async (route) => {
    const u = new URL(route.request().url());
    const at = (k: string, end = false) => {
      const [y, m, d] = (u.searchParams.get(k) || '').split('-').map(Number);
      return new Date(y, m - 1, d).getTime() + (end ? 86_400_000 - 1 : 0);
    };
    await route.fulfill({ json: { from: at('from'), to: at('to', true), sessions: 0, projectOrder: [], days: {}, projects: {}, tools: [], models: {}, modelsWhole: 0 } });
  });
  await page.route(/\/api\/history(\?|$)/, (route) => route.fulfill({ json: { total: 0, hiddenEmpty: 0, indexing: { running: false, done: 0, total: 0 }, totals: { sessions: 0, tokens: 0, usd: 0 }, facets: { projects: [], models: [], status: [] }, calendar: {}, sessions: [] } }));
  await page.goto('/?test#recap');
  const group = page.getByRole('group', { name: 'Period' });
  for (const [label, words] of [
    ['Today', 'Nothing yet today: no sessions so far.'],
    ['Yesterday', 'Yesterday was quiet: no sessions at all.'],
    ['This week', 'Nothing yet this week: no sessions so far.'],
    ['Last 7 days', 'The last 7 days were quiet: no sessions at all.'],
    ['This month', 'Nothing yet this month: no sessions so far.'],
  ]) {
    await group.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.rc-digest'), label).toHaveText(words);
    await expect(page.locator('.rc details.nums')).toHaveCount(0);
  }
  expectNoErrors(errors);
});

test('RE-03 recap cannot be read', async ({ page, errors }) => {
  await page.route(RECAP, (route) => route.fulfill({ status: 500, body: 'internal error' }));
  await page.goto('/?test#recap');
  await expect(page.locator('.rc .err')).toHaveText(/^Couldn't add things up: 500/);
  // the app keeps working
  await viewTab(page, 'History').click();
  await expect(page.locator('.hx')).toBeVisible();
  expectNoErrors(errors, [/status of 500/]);
});

test('RE-04 cost by model, opened', async ({ page, errors }) => {
  await page.goto('/?demo&test#recap');
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Last 7 days', exact: true }).click();
  const nums = page.locator('.rc details.nums');
  await nums.locator('summary').click();
  const first = nums.locator('.rc-model').first();
  await expect(first.locator('.rc-model-name')).toHaveText('Opus 5.5');
  const listed = (await first.locator('.rc-model-usd').textContent()) || '';
  await first.click();
  const dlg = page.getByRole('dialog', { name: 'Opus 5.5' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Close' })).toBeFocused();
  // in words first, then the same total as the list, with the API-price note
  await expect(dlg.locator('.md-lead')).toContainText(/Opus 5\.5 worked in \d+ sessions across six projects\./);
  await expect(dlg.locator('.md-total-v')).toHaveText(listed);
  await expect(dlg.locator('.md-total .note')).toContainText('API list prices');
  // what the tokens were and what each kind cost
  await expect(dlg.locator('.md-table tbody th')).toHaveText(['Cache read', 'Cache write', 'Output', 'Input']);
  await expect(dlg.locator('.md-bar-mix i')).toHaveCount(4);
  // a column per day of the period, main agents against helpers, projects and sessions
  await expect(dlg.locator('.md-col')).toHaveCount(7);
  await expect(dlg.locator('.md-rank').first().locator('li').first()).toContainText('Main agents');
  expect(await dlg.locator('.md-rank').nth(1).locator('li').count()).toBe(6);
  expect(await dlg.locator('.md-session').count()).toBeGreaterThan(5);
  // a cheaper model's helpers are told apart
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await nums.locator('.rc-model', { hasText: 'Haiku 5.5' }).click();
  const haiku = page.getByRole('dialog', { name: 'Haiku 5.5' });
  await expect(haiku.locator('.md-lead')).toContainText('Only helpers used it: explorers.');
  await expect(haiku.locator('.md-rank').first().locator('.md-name')).toHaveText(['Explorers']);
  await expect(haiku.locator('.md-rank').first().locator('.md-name')).toHaveAttribute('data-tip', /Searches and reads through the code/);
  // helpers by kind in words, never their raw type
  await page.keyboard.press('Escape');
  await nums.locator('.rc-model', { hasText: 'Sonnet 5.5' }).click();
  const sonnet = page.getByRole('dialog', { name: 'Sonnet 5.5' });
  await expect(sonnet.locator('.md-rank').first().locator('.md-name')).toHaveCount(2);
  expect((await sonnet.locator('.md-rank').first().locator('.md-name').allTextContents()).sort()).toEqual(['Helpers', 'Planners']);
  expect(await sonnet.textContent()).not.toMatch(/general-purpose/i);
  await page.keyboard.press('Escape');
  await nums.locator('.rc-model', { hasText: 'Haiku 5.5' }).click();
  // a project opens in History for the period; a session opens itself
  await haiku.locator('.md-rank').nth(1).locator('.rc-pname').first().click();
  await expect(viewTab(page, 'History')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#history\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&projects=/);
  await viewTab(page, 'Recap').click();
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Last 7 days', exact: true }).click();
  await page.locator('.rc details.nums summary').click();
  await page.locator('.rc-model').first().click();
  const s = page.getByRole('dialog', { name: 'Opus 5.5' }).locator('.md-session').first();
  const title = ((await s.locator('.md-s-title').textContent()) || '').trim();
  await s.click();
  await expect(page.locator('.hx-read h1.hx-title')).toHaveText(title);
  expectNoErrors(errors);
});
