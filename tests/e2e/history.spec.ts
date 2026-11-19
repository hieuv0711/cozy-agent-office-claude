import type { Locator, Page } from '@playwright/test';
import { expect, expectNoErrors, test } from './support/fixtures';
import { viewTab, waitDrawn } from './support/app';

// 7. History, on the made-up history `?demo` brings (web/src/panels/history-demo.ts):
// a few weeks of sessions in six projects, with helpers, failed steps and their
// reasons, waits for an answer, and the seven sessions the scene shows still
// running. No real project ever shows. The loading and failing cases answer
// with small made-up replies instead. Screenshots stay in test-results/.

const HISTORY = /\/api\/history(\?|$)/;
const CSV = 'Add CSV export to the billing reports';

async function openDiary(page: Page, hash = '#history') {
  await page.goto(`/?demo&test${hash}`);
  await expect(page.locator('.dy-card').first()).toBeVisible({ timeout: 30_000 });
}

const countLine = async (page: Page) => Number(((await page.locator('.hx-count span').first().textContent()) || '').match(/([\d,]+) sessions?/)?.[1].replace(/,/g, '') ?? NaN);
const card = (page: Page, title: string) => page.locator('.dy-card', { has: page.locator('.dy-clamp', { hasText: title }) });

/** Opens a session's page from its card. */
async function openSession(page: Page, title: string) {
  const open = card(page, title).locator('.dy-open');
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await expect(page.locator('.hx-read h1.hx-title')).toHaveText(title, { timeout: 20_000 });
}

const slider = (page: Page) => page.getByRole('slider', { name: /Replay position/ });
const position = async (s: Locator) => Number(await s.getAttribute('aria-valuenow'));

test('HI-01 the diary opens', async ({ page, errors }) => {
  // a slow server, so the "opening" line shows; a made-up answer, so nothing real does
  const t = Date.now() - 3_600_000;
  const one = { id: '0e2e0000-0000-4000-8000-0000000000a1', project: 'made-up', cwd: '~/made-up', branch: 'main', title: 'A made-up session', firstPrompt: 'Do the thing', lastPrompt: 'Do the thing', lastText: 'Done.', startedAt: t, endedAt: t + 600_000, model: 'Opus 5.5', days: { [new Date(t).toISOString().slice(0, 10)]: { tok: 0, usd: 0, tools: 2, prompts: 1, edits: 0, add: 0, del: 0, active: 10 } } };
  await page.route(HISTORY, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ json: { total: 1, hiddenEmpty: 0, indexing: { running: false, done: 1, total: 1 }, totals: { sessions: 1, tokens: 0, usd: 0 }, facets: { projects: [{ name: 'made-up', count: 1 }], models: [], status: [] }, calendar: {}, sessions: [one] } });
  });
  await page.route(/\/api\/session\//, (route) => route.fulfill({ status: 404, body: 'not here' }));
  await page.goto('/?test#history');
  await expect(page.locator('.hx-pages .loading')).toHaveText('Opening the diary…');
  await expect(page.locator('.dy-skeleton')).toBeVisible();
  await expect(card(page, 'A made-up session')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.dy-skeleton')).toHaveCount(0);

  // the made-up history: a page per day, newest first, in plain words
  await openDiary(page);
  const days = await page.locator('.dy-page h2.dy-day').allTextContents();
  expect(days[0]).toBe('Today');
  expect(new Set(days).size, 'one page per day').toBe(days.length);
  for (const pg of (await page.locator('.dy-page').all()).slice(0, 4)) {
    const n = await pg.locator('.dy-card').count();
    await expect(pg.locator('.dy-count')).toHaveText(n === 1 ? '1 session' : `${n} sessions`);
  }
  const text = (await page.locator('.dy-page-head, .dy-meta').allInnerTexts()).join('\n');
  expect(text).toMatch(/Still running/);
  expect(text).toMatch(/Ended at \d\d:\d\d after/);
  expect(text, 'no money on the cards').not.toMatch(/\$\s?\d/);
  expect(text, 'no token counts on the cards').not.toMatch(/\d\s*(k|K|M)?\s*tokens?\b/);
  expect(await countLine(page)).toBe(await page.locator('.dy-card').count());
  expectNoErrors(errors, [/status of 404/]);
});

test('HI-02 search', async ({ page, errors }) => {
  await openDiary(page);
  const before = await page.locator('.dy-card').count();
  const search = page.getByRole('searchbox', { name: 'Search sessions' });
  // "/" jumps to it
  await page.locator('body').press('/');
  await expect(search).toBeFocused();
  await search.fill('rate limit');
  await expect(page).toHaveURL(/[?&]q=rate\+limit|[?&]q=rate%20limit/);
  await expect(page.locator('.hx-hint')).toContainText('Every word has to match');
  await expect.poll(() => page.locator('.dy-card').count(), { message: 'only matching sessions stay' }).toBeLessThan(before);
  for (const c of await page.locator('.dy-card').all()) {
    const shows = (await c.locator('mark').count()) > 0 || /rate|limit/i.test((await c.textContent()) || '');
    expect(shows, 'a card shows where it matched').toBe(true);
  }
  // a file name only found inside the session's steps
  await search.fill('useBillingRows');
  await expect(card(page, CSV)).toBeVisible();
  await expect(card(page, CSV).locator('.dy-match mark')).toHaveText('usebillingrows', { ignoreCase: true });
  // nonsense, then Escape clears it
  await search.fill('zqxvjk nothing like this');
  await expect(page.locator('.hx-none')).toContainText('Nothing in the diary mentions “zqxvjk nothing like this”.');
  await expect(page.locator('.hx-none .note')).toContainText('Try fewer words');
  await expect(page.locator('.dy-card')).toHaveCount(0);
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect.poll(() => page.locator('.dy-card').count()).toBe(before);
  expectNoErrors(errors);
});

test('HI-03 filters', async ({ page, errors }) => {
  await openDiary(page);
  const when = page.locator('.hx-pick', { hasText: 'When' }).locator('select');
  const project = page.locator('.hx-pick', { hasText: 'Project' }).locator('select');
  const show = page.locator('.hx-pick', { hasText: 'Show' }).locator('select');
  const all = await countLine(page);

  // today only
  await when.selectOption('today');
  await expect(page).toHaveURL(/[?&]from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  await expect.poll(async () => [...new Set(await page.locator('.dy-page h2.dy-day').allTextContents())]).toEqual(['Today']);
  const today = await countLine(page);
  await when.selectOption('30d');
  await expect.poll(() => countLine(page)).toBeGreaterThanOrEqual(today);
  expect(await countLine(page)).toBeLessThanOrEqual(all);

  // one project, A to Z in the list
  await when.selectOption('all');
  const names = (await project.locator('option').allTextContents()).filter((n) => n !== 'All projects');
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  await project.selectOption({ label: 'billing' });
  await expect(page).toHaveURL(/[?&]projects=billing/);
  await expect.poll(async () => [...new Set(await page.locator('.dy-card .dy-proj').allTextContents())]).toEqual(['billing']);
  await project.selectOption({ label: 'All projects' });

  // which sessions: still running, with failed steps, kept
  await show.selectOption({ label: 'Still running' });
  await expect.poll(() => page.locator('.dy-card').count()).toBe(7);
  for (const m of await page.locator('.dy-card .dy-meta').allTextContents()) expect(m).toContain('Still running');
  await show.selectOption({ label: 'With failed steps' });
  await expect(page).toHaveURL(/[?&]problems=1/);
  await expect.poll(() => page.locator('.dy-card').count()).toBeGreaterThan(3);
  for (const c of await page.locator('.dy-card').all()) {
    expect(Number(await c.getAttribute('data-failed')), 'a step failed in each').toBeGreaterThan(0);
    await expect(c.locator('.dy-fail'), 'each says how many').toHaveText(/^▲ (one step|\w+ steps) failed(, the last one too)?$/);
  }
  await show.selectOption({ label: 'Kept after cleanup' });
  await expect.poll(() => page.locator('.dy-card').count()).toBe(2);
  await show.selectOption({ label: 'Every session' });
  await expect.poll(() => countLine(page)).toBe(all);

  // pick dates
  await when.selectOption('custom');
  const dates = page.locator('.hx-dates input[type=date]');
  await expect(dates).toHaveCount(2);
  const day = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  await dates.nth(0).fill(day(10));
  await dates.nth(1).fill(day(3));
  await expect(page).toHaveURL(new RegExp(`from=${day(10)}&to=${day(3)}`));
  await expect(when.locator('option[value=custom]')).not.toHaveText('Pick dates…');
  await expect.poll(() => countLine(page)).toBeLessThan(all);
  // and all of it gone at once
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect.poll(() => countLine(page)).toBe(all);
  expectNoErrors(errors);
});

test('HI-04 read one session', async ({ page, errors }) => {
  await openDiary(page);
  await openSession(page, CSV);
  const read = page.locator('.hx-read');
  for (const h of ['What you asked', 'How it ended', 'In short', 'What went wrong', 'Replay', 'Helpers it sent', 'What it changed']) await expect(read.getByRole('heading', { name: h, exact: true })).toBeVisible();
  await expect(read.locator('.hx-status')).toContainText(/^Ended .* at \d\d:\d\d\. Your agents worked/);
  // the session in a few words, and where the time went
  await expect(read.locator('.hx-short')).toContainText(/Most of the time went to/);
  await expect(read.locator('.hx-short')).toContainText('sent two helpers');
  await expect(read.locator('.hx-short')).toContainText('It waited for your answer once');
  await expect(read.locator('.hx-split li').first()).toBeVisible();
  // the helpers, in words
  await expect(read.locator('.hx-helpers li')).toHaveCount(2);
  await expect(read.locator('.hx-helpers li b')).toHaveText(['Explorer', 'Helper']);
  await expect(read.locator('.hx-helpers li b').first()).toHaveAttribute('data-tip', /Searches and reads through the code/);
  // shown in the page's own tooltip when pointed at
  await read.locator('.hx-helpers li b').first().hover();
  await expect(page.getByRole('tooltip')).toContainText('Searches and reads through the code');
  expect(await read.textContent(), 'helper types only in words').not.toMatch(/general-purpose/i);
  await expect(read.locator('.hx-prs')).toHaveText('Pull request #412');
  // Numbers: folded away until opened, with the cost by model inside
  const nums = read.locator('details.nums');
  await expect(nums).not.toHaveAttribute('open', /.*/);
  const outside = await read.evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelector('details.nums')?.remove();
    return c.textContent || '';
  });
  expect(outside, 'no costs outside Numbers').not.toMatch(/\$\s?\d/);
  await nums.locator('summary').click();
  await expect(nums).toHaveAttribute('open', '');
  for (const k of ['Tokens', 'Estimated cost', 'Tool calls']) await expect(nums.locator('.fig dt', { hasText: new RegExp(`^${k}$`) })).toBeVisible();
  await expect(nums.locator('table.hx-models tbody tr')).toHaveCount(3);
  await expect(nums.locator('table.hx-models')).toContainText('Opus 5.5');
  expectNoErrors(errors);
});

test('HI-05 the replay, one request at a time', async ({ page, errors }) => {
  await openDiary(page);
  await openSession(page, CSV);
  const rp = page.locator('.rp');
  await rp.scrollIntoViewIfNeeded();
  await expect(rp.locator('.hx-replay-why')).toContainText('The three things you asked, one by one');
  // the map: a block per request, the wait for you in yellow, a mark where a step failed
  const blocks = rp.locator('.rq-blk');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(1)).toHaveAttribute('data-tip-title', /^Request 2 of 3 · \d\d:\d\d$/);
  await expect(blocks.nth(1)).toHaveAttribute('data-tip', /You asked “Can it also include the customer tax id\?/);
  await expect(blocks.nth(1)).toHaveAttribute('data-tip', /Worked \d+\u00a0min · one helper · asked you once · one step failed/);
  await expect(blocks.nth(1).locator('.rq-wait')).toHaveCount(1);
  for (const [i, failed] of [[0, true], [1, true], [2, false]] as const) await expect(blocks.nth(i)).toHaveClass(failed ? /\bfailed\b/ : /^(?!.*\bfailed\b)/);
  // a card per request: when, how long, its helpers, waits and failures, what you asked and what it said
  const cards = rp.locator('.rq');
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.rq-end')).toHaveText(['Finished', 'Finished', 'Finished']);
  await expect(cards.nth(0).locator('.rq-ask')).toContainText('The finance team wants to download the monthly billing report as CSV');
  await expect(cards.nth(0).locator('.rq-chip')).toHaveText(['one helper', 'one step failed']);
  await expect(cards.nth(1).locator('.rq-chip')).toHaveText(['one helper', 'asked you once', 'one step failed']);
  await expect(cards.nth(0).locator('.rq-split')).toContainText(/^Mostly [a-z ,]+$/);
  await expect(cards.nth(0).locator('.rq-said')).toContainText('It said The report page has an Export CSV button now');
  await expect(rp.locator('.rq-gap')).toHaveText([/^\d+\u00a0min later$/, /^\d+\u00a0min later$/]);
  // the first is open: its own timeline (the main agent, and the helper it sent, by its task) and its steps
  await expect(cards.nth(0).locator('.rq-top')).toHaveAttribute('aria-expanded', 'true');
  await expect(cards.nth(1).locator('.rq-top')).toHaveAttribute('aria-expanded', 'false');
  const open = rp.locator('.rq.open');
  await expect(open.locator('.rq-tl-name b')).toHaveText(['Main agent', 'Find how the billing report gets its rows']);
  await expect(open.locator('.rq-tl-name span')).toHaveText(['Explorer']);
  await expect(open.locator('.rq-key')).toContainText('Commands');
  await expect(open.locator('.rq-key')).toContainText('Failed');
  // pointing at a block: the step, when, how long, and why it failed
  await open.locator('.rq-tl-lane.is-main .rq-b.failed').first().hover();
  const tipEl = page.getByRole('tooltip');
  await expect(tipEl.locator('.tip-title')).toHaveText('Ran npm test -- reports');
  await expect(tipEl).toContainText(/Commands · \d\d:\d\d:\d\d · took \d+\u00a0s/);
  await expect(tipEl).toContainText('Failed: 2 tests failed');
  // the old every-step chart is gone
  await expect(rp.locator('svg.rp-svg')).toHaveCount(0);
  expectNoErrors(errors);
});

test('HI-06 replay controls', async ({ page, errors }) => {
  await openDiary(page);
  await openSession(page, CSV);
  const play = page.locator('.hx-play');
  const s = slider(page);
  const min = Number(await s.getAttribute('aria-valuemin'));
  const max = Number(await s.getAttribute('aria-valuemax'));
  await page.locator('.hx-actions').getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(play).toHaveText('Pause');
  const v0 = await position(s);
  await expect.poll(() => position(s), { message: 'the playhead moves' }).toBeGreaterThan(v0);
  await expect(page.locator('.rp-now .rp-st-tag')).toBeVisible();
  await expect(page.locator('.rp-now-where')).toContainText(/^1 of 3 · \d\d:\d\d:\d\d$/);

  await play.click();
  await expect(play).toHaveText(/^Play/);
  const v1 = await position(s);
  await page.waitForTimeout(1200);
  expect(await position(s), 'stopped').toBe(v1);
  // the pace, in words
  for (const p of ['Slow', 'Normal', 'Fast']) {
    const b = page.getByRole('group', { name: 'Replay pace' }).getByRole('button', { name: p, exact: true });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(play).toHaveText(/^Play/);
  }
  expect(await position(s), 'still stopped').toBe(v1);

  // click a request on the map: it goes to its start, and its card opens
  await page.locator('.rq-blk').nth(2).click();
  await expect.poll(() => position(s)).toBeGreaterThan(v1);
  await expect(page.locator('.rq').nth(2).locator('.rq-top')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rp-now-where')).toContainText(/^3 of 3/);
  // a card's header does the same
  await page.locator('.rq').nth(1).locator('.rq-top').click();
  await expect(page.locator('.rq').nth(1).locator('.rq-top')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rp-now-where')).toContainText(/^2 of 3/);
  // drag back toward the start
  const box = (await s.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.05, box.y + 10, { steps: 8 });
  await page.mouse.up();
  expect(await position(s)).toBeLessThan(min + (max - min) * 0.5);
  // keys: Home, step by step, Page Down to the next request, End
  await s.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => position(s)).toBe(min);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => position(s)).toBeGreaterThan(min);
  const after = await position(s);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => position(s)).toBeGreaterThan(after);
  await page.keyboard.press('PageDown');
  await expect(s).toHaveAttribute('aria-valuetext', /^Request 2 of 3, \d\d:\d\d:\d\d, /);
  await page.keyboard.press('End');
  await expect.poll(() => position(s)).toBe(max);
  // Space plays from the keyboard too
  await page.keyboard.press('Home');
  await page.keyboard.press('Space');
  await expect(play).toHaveText('Pause');
  await page.keyboard.press('Space');
  await expect(play).toHaveText(/^Play/);
  expectNoErrors(errors);
});

test('HI-07 step by step', async ({ page, errors }) => {
  await openDiary(page);
  await openSession(page, CSV);
  const list = page.locator('.rq.open .rp-list');
  await expect(list.locator('.rp-step').first()).toContainText('You asked');
  // the list follows the playhead
  await page.locator('.rp-step', { hasText: 'Created csv.ts' }).click();
  await expect(list.locator('[aria-current=step]')).toContainText('Created csv.ts');
  await expect(page.locator('.rp-now')).toContainText('Created csv.ts');
  await page.locator('.hx-play').click();
  await expect.poll(async () => (await list.locator('[aria-current=step]').textContent()) || '').not.toContain('Created csv.ts');
  await page.locator('.hx-play').click();
  // the helpers' own steps, when asked for (back in the first request, where the explorer went)
  await page.locator('.rq-blk').first().click();
  await expect(page.locator('.rq').first().locator('.rq-top')).toHaveAttribute('aria-expanded', 'true');
  const without = await list.locator('.rp-step').count();
  await page.locator('.rq.open').getByLabel('Include what the helpers did').check();
  await expect.poll(() => list.locator('.rp-step').count()).toBeGreaterThan(without);
  await expect(list).toContainText('Explorer: Read BillingReport.tsx');
  await expect(list).toContainText('Sent an explorer to find how the billing report gets its rows');
  expect(await list.textContent()).not.toMatch(/general-purpose/i);
  expectNoErrors(errors);
});

test('HI-13 a long session over three days', async ({ page, errors }) => {
  await openDiary(page);
  await openSession(page, 'Move the notes app to the new sync engine');
  const rp = page.locator('.rp');
  await rp.scrollIntoViewIfNeeded();
  await expect(rp.locator('.rq-blk')).toHaveCount(23);
  // the map names each day where it starts
  await expect(rp.locator('.rq-map-labels .is-day')).toHaveCount(3);
  await expect(rp.locator('.rq-map-labels .is-day').first()).toHaveText(/^\w{3} \d{1,2} \w{3} \d\d:\d\d$/);
  // the first three and the latest six, the rest folded away
  await expect(rp.locator('.rq')).toHaveCount(9);
  await expect(rp.locator('.rq-fold button')).toHaveText('Show the 14 requests in between');
  // a request from the middle opens from the map, with its six helpers each in a lane
  await rp.locator('.rq-blk').nth(12).click();
  const open = rp.locator('.rq.open');
  await expect(open.locator('.rq-n')).toContainText('13');
  await expect(open.locator('.rq-chip')).toHaveText(['six helpers', 'two steps failed']);
  await expect(open.locator('.rq-tl-name b')).toHaveText(['Main agent', 'Review the outbox', 'Review the server log', 'Review the merge', 'Review the flag and the fallback', 'Review the tests', 'Review the docs']);
  // all of them
  await rp.locator('.rq-fold button').first().click();
  await expect(rp.locator('.rq')).toHaveCount(23);
  await expect(rp.locator('.rq-gap', { hasText: /^\w{3} \d{1,2} \w{3}, \d\d:\d\d$/ })).toHaveCount(2);
  expectNoErrors(errors);
});

test('HI-08 what went wrong', async ({ page, errors }) => {
  await openDiary(page);
  // on the diary, a note only on sessions that ended on a failed step
  await expect(card(page, 'Find why the nightly report job failed').locator('.dy-fail')).toHaveText('▲ ended on a failed step');
  await expect(card(page, 'Reproduce the sync conflict on reconnect').locator('.dy-fail')).toHaveText('▲ ended on a failed step, two in all');
  // steps that failed along the way, and a good ending: no note on the card
  await expect(card(page, 'Move the docs to the new site generator')).toHaveAttribute('data-failed', '3');
  await expect(card(page, 'Move the docs to the new site generator').locator('.dy-fail')).toHaveCount(0);
  await expect(card(page, CSV)).toHaveAttribute('data-failed', '2');
  await expect(card(page, CSV).locator('.dy-fail')).toHaveCount(0);
  expect(await page.locator('.dy-card .dy-fail').count(), 'only the two that ended on a failure').toBe(2);
  // asked for sessions with failed steps: every card says how many
  await page.locator('.hx-pick', { hasText: 'Show' }).locator('select').selectOption({ label: 'With failed steps' });
  await expect(card(page, CSV).locator('.dy-fail')).toHaveText('▲ two steps failed');
  await expect(card(page, 'Move the docs to the new site generator').locator('.dy-fail')).toHaveText('▲ three steps failed');
  await expect(card(page, 'Find why the nightly report job failed').locator('.dy-fail')).toHaveText('▲ one step failed, the last one too');
  await openSession(page, CSV);
  // ...at the top of the page...
  await expect(page.locator('.hx-status-fail')).toContainText('Two steps failed.');
  await page.locator('.hx-fail-link').click();
  const fails = page.locator('.hx-fails');
  await expect(fails).toBeInViewport();
  // ...and listed with the reason each step gave
  await expect(fails.locator('.hx-fail-list li')).toHaveCount(2);
  await expect(fails.locator('.hx-fail-what').first()).toHaveText('Ran npm test -- reports');
  await expect(fails.locator('.hx-fail-why').first()).toContainText('2 tests failed');
  await expect(fails.locator('.hx-fail-why').nth(1)).toContainText('String to replace not found');
  // "Show in the replay" moves the playhead there
  await fails.locator('.hx-fail-go').nth(1).click();
  await expect(page.locator('.rp-list [aria-current=step]')).toContainText('Edited useBillingRows.ts');
  await expect(page.locator('.rp-now-fail')).toContainText('String to replace not found');
  expectNoErrors(errors);
});

test('HI-09 watch it in the room, then back', async ({ page, errors }) => {
  await openDiary(page);
  await openSession(page, CSV);
  await page.locator('.hx-actions').getByRole('button', { name: 'Watch in the room' }).click();
  await waitDrawn(page);
  const bar = page.locator('.replay-bar');
  await expect(bar).toBeVisible();
  await expect(viewTab(page, 'Office')).toHaveAttribute('aria-pressed', 'true');
  // which request, what you asked, what it's doing now
  await expect(bar.locator('.rb-title')).toHaveText(CSV);
  await expect(bar.locator('.rb-ask')).toContainText(/^Request 1 of 3 · \d\d:\d\d/);
  await expect(bar.locator('.rb-ask q')).toContainText('The finance team wants to download');
  await expect(bar.locator('.rb-now')).toContainText(/^Now/);
  // the room is the replay: one person, no card, and the top bar says so
  await expect(page.locator('.labels .chip:not(.left) .chip-name')).toHaveText(['billing'], { timeout: 20_000 });
  await expect(page.locator('aside.panel')).toHaveCount(0);
  await expect(page.locator('.topbar .count.replaying')).toHaveText('Watching a replay');
  // the rail speaks for the replay, not for now
  await expect(page.locator('.rail-label .title-card')).toHaveText('Replay');
  // request by request
  await bar.getByRole('button', { name: 'Pause' }).click();
  await bar.getByRole('button', { name: /Next/ }).click();
  await expect(bar.locator('.rb-ask')).toContainText('Request 2 of 3');
  await expect(bar.locator('.rb-ask q')).toContainText('customer tax id');
  await bar.getByRole('button', { name: /Previous/ }).click();
  await expect(bar.locator('.rb-ask')).toContainText('Request 1 of 3');
  await bar.getByRole('button', { name: /Next/ }).click();
  await expect(bar.getByRole('group', { name: 'Replay pace' }).getByRole('button')).toHaveText(['Slow', 'Normal', 'Fast']);
  // back to live: everyone again, and the counts
  await bar.getByRole('button', { name: 'Back to live' }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.labels .chip:not(.left)')).toHaveCount(7);
  await expect(page.locator('.topbar .count.replaying')).toHaveCount(0);
  await expect(page.locator('.rail-label .title-card')).toHaveText('Now');
  // History opens on the same session, its replay where you left it
  await viewTab(page, 'History').click();
  await expect(page.locator('.hx-read h1.hx-title')).toHaveText(CSV);
  await expect(page.locator('.rp-now-where')).toContainText(/^2 of 3/);
  expectNoErrors(errors);
});

test('HI-10 the last six weeks', async ({ page, errors }) => {
  await openDiary(page);
  const days = page.getByRole('group', { name: 'Agent time per day over the last six weeks' }).getByRole('button');
  await expect(days).toHaveCount(42);
  const today = days.last();
  await expect(today).toHaveAttribute('aria-label', /: .*of agent work/);
  // pick today: its diary page alone; pick it again: every day
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => [...new Set(await page.locator('.dy-page h2.dy-day').allTextContents())]).toEqual(['Today']);
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await page.locator('.dy-page h2.dy-day').allTextContents()).length).toBeGreaterThan(1);
  // days with failed steps carry a mark; arrow keys move along the days
  expect(await page.locator('.hx-day .hx-day-fail').count()).toBeGreaterThan(2);
  await today.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(days.nth(40)).toBeFocused();
  await expect(page.locator('.hx-strip-tip')).toBeVisible();
  expectNoErrors(errors);
});

test('HI-11 empty sessions', async ({ page, errors }) => {
  await openDiary(page);
  const foot = page.locator('.hx-foot');
  await expect(foot).toContainText('one empty session is hidden (nothing was asked or done)');
  const n0 = await countLine(page);
  await foot.getByRole('button', { name: 'Show them' }).click();
  await expect(foot).toContainText('Empty sessions are shown too.');
  await expect(page).toHaveURL(/[?&]empty=1/);
  await expect.poll(() => countLine(page)).toBe(n0 + 1);
  await foot.getByRole('button', { name: 'Hide them' }).click();
  await expect.poll(() => countLine(page)).toBe(n0);
  expectNoErrors(errors);
});

test('HI-12 history cannot be read', async ({ page, errors }) => {
  await page.route(HISTORY, (route) => route.fulfill({ status: 500, body: 'internal error' }));
  await page.goto('/?test#history');
  await expect(page.locator('.hx-pages .err')).toHaveText(/^Couldn't read the history: 500/);
  await expect(page.locator('.dy-skeleton')).toHaveCount(0);
  // the rest of the app works
  await viewTab(page, 'Recap').click();
  await expect(page.locator('.rc h1')).toHaveText('Recap');
  expectNoErrors(errors, [/status of 500/]);
});
