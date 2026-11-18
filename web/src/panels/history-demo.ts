import { dayKey, type AgentInfo, type DayStat, type Detail, type Ev, type FileStat, type History, type HistoryFilter, type ModelRecap, type Recap, type Seg, type Summary, type Tok, type UsageRow } from '../api';
import { demoOffice } from '../tide/demo';

// `?demo`: a made-up history for History and Recap, so they can be shown,
// screenshotted and tested without anyone's real projects. A few weeks of
// sessions across six small projects, with helpers, failed steps and the
// reasons, long waits for an answer, a memory compaction, and the seven
// sessions the scene shows still running today. Built once per page load,
// the same every time for a given day; prices follow the server's table.

// ---------- script ----------

/** [kind, target, seconds, why it failed] */
type Simple = ['read' | 'grep' | 'glob' | 'edit' | 'write' | 'bash' | 'web' | 'fetch' | 'todo' | 'skill' | 'mcp', string, number?, string?];
type Ask = ['ask', string, number];
type Helper = ['helper', { type: string; desc: string; model?: string; steps: Step[]; said: string; fail?: string }];
type Step = Simple | Ask | Helper;
interface Turn {
  ask: string;
  /** minutes since the previous turn ended */
  away?: number;
  steps: Step[];
  said: string;
  compact?: boolean;
  /** the session is still going: this turn has no answer yet */
  open?: boolean;
}
interface Spec {
  key: string;
  project: string;
  title: string;
  branch?: string;
  /** days before today, and the hour it started */
  day: number;
  at: number;
  turns: Turn[];
  model?: string;
  kept?: boolean;
  empty?: boolean;
  prs?: number[];
  /** a session from the scene: its id, name and start */
  live?: { id: string; startedAt: number; num?: number };
}

const R = (p: string, s = 2): Step => ['read', p, s];
const G = (p: string, s = 2): Step => ['grep', p, s];
const E = (p: string, s = 4, fail?: string): Step => ['edit', p, s, fail];
const W = (p: string, s = 4): Step => ['write', p, s];
const B = (cmd: string, s = 20, fail?: string): Step => ['bash', cmd, s, fail];
const S = (q: string, s = 9): Step => ['web', q, s];
const F = (url: string, s = 7): Step => ['fetch', url, s];
const T = (): Step => ['todo', '', 1];
const A = (q: string, min: number): Step => ['ask', q, min];
const H = (type: string, desc: string, steps: Step[], said: string, model = type === 'Explore' ? 'Haiku 5.5' : 'Sonnet 5.5', fail?: string): Step => ['helper', { type, desc, steps, said, model, fail }];

// A long one, over three days: two dozen requests, helpers sent out in
// batches, waits for you and failed steps. The replay has to make sense of
// sessions like this too.
const SYNC = { outbox: 'src/sync/outbox.ts', log: 'server/log/store.ts', merge: 'src/sync/merge.ts', clock: 'src/sync/clock.ts', db: 'src/db/notes.ts', badge: 'src/ui/SyncBadge.tsx', route: 'server/routes/sync.ts', tOut: 'test/sync/outbox.test.ts', tMerge: 'test/sync/merge.test.ts' };
const scout = (desc: string, files: string[], said: string) => H('Explore', desc, files.map((x) => R(x)), said);
const helper = (desc: string, steps: Step[], said: string, fail?: string) => H('general-purpose', desc, steps, said, 'Sonnet 5.5', fail);
const SYNC_TURNS: Turn[] = [
  { ask: 'Read the old sync code and tell me how a change gets from the editor to the server today.', steps: [T(), scout('Trace a note edit from the editor to the server', ['src/editor/Editor.tsx', 'src/sync/queue.ts', 'server/routes/notes.ts'], 'Edits go into an in-memory queue, flushed every 5 s with a PUT per note; the server keeps only the last write.'), R('src/sync/queue.ts', 3), R('server/routes/notes.ts', 2)], said: 'Today each edit sits in a memory queue and is sent as a whole note every five seconds; the server keeps the last write, so two devices can overwrite each other.' },
  { ask: 'Write up a plan for the new engine: an outbox per device and a versioned log on the server.', away: 6, steps: [H('Plan', 'Plan the outbox and the server log', [R('src/sync/queue.ts'), R('src/db/notes.ts'), R('server/routes/notes.ts')], 'Three parts: a device outbox in IndexedDB, a server log with versions, and a merge step for conflicts.'), W('docs/sync-v2.md', 8)], said: 'The plan is in docs/sync-v2.md: an outbox in IndexedDB on each device, an append-only log on the server, and a merge for edits that cross.' },
  { ask: 'Good. Start with the outbox.', away: 9, steps: [R(SYNC.db, 2), W(SYNC.outbox, 7), W(SYNC.tOut, 6), B('npm test -- outbox', 34, '1 test failed: "keeps order after a reload" got the second edit first'), E(SYNC.outbox, 5), B('npm test -- outbox', 31)], said: 'The outbox keeps pending edits in IndexedDB in order, and survives a reload. Its tests pass.' },
  { ask: 'Now the server side: the log, and a route to push and pull.', away: 14, steps: [W(SYNC.log, 9), W(SYNC.route, 7), helper('Write tests for the sync route', [R(SYNC.route), W('test/server/sync.test.ts', 6), B('npm test -- server/sync', 40)], 'Six tests for push, pull and versions; all pass.'), B('npm test -- server', 52)], said: 'The server keeps every change with a version number; devices push their outbox and pull what they missed.' },
  { ask: 'Wire the app to it behind a flag, and stop for tonight.', away: 21, steps: [E(SYNC.db, 4), E('src/flags.ts', 2), E('src/app.ts', 3), B('npm run build', 46), B('git commit -am "Sync v2: outbox, log and route behind a flag"', 4)], said: 'The new engine runs behind the syncV2 flag; with it off nothing changes. Committed on sync-v2.' },
  // the next morning
  { ask: 'Morning. Turn the flag on in dev and see what breaks.', away: 640, steps: [E('.env.development', 1), B('npm run dev -- --smoke', 70, 'The smoke run stopped: "TypeError: cannot read version of undefined" in src/sync/merge.ts'), R(SYNC.merge, 3), G('version', 2), E(SYNC.merge, 4), B('npm run dev -- --smoke', 64)], said: 'One crash on notes created before the change (no version yet); they start at version 0 now, and the smoke run passes.' },
  { ask: 'Two devices editing the same note at once: what happens?', away: 12, steps: [helper('Simulate two devices editing one note', [W('scripts/two-devices.mjs', 6), B('node scripts/two-devices.mjs', 45)], 'The second push is rejected with a version conflict and the device pulls, but the edit is lost.'), R(SYNC.merge, 2), A('Should the newer edit win, or should both edits be kept and merged line by line?', 22)], said: 'Right now the second edit is lost. You chose to keep both and merge them line by line; that comes next.' },
  { ask: 'Do the line-by-line merge.', away: 3, steps: [S('three-way merge text diff3 algorithm', 9), F('https://en.wikipedia.org/wiki/Diff3', 6), W(SYNC.merge, 9), W(SYNC.tMerge, 7), B('npm test -- merge', 38, '2 tests failed: a line changed on both sides came out twice'), E(SYNC.merge, 6), B('npm test -- merge', 35)], said: 'Edits on different lines now both survive; when the same line changed on both sides, the newer one wins and the other is kept in the note history.' },
  { ask: 'Send helpers to check the other places that write notes, so nothing skips the outbox.', away: 18, steps: [scout('Find every place that writes a note', ['src/editor/Editor.tsx', 'src/import/markdown.ts', 'src/share/receive.ts'], 'Three writers: the editor, the markdown import and shared-note receive.'), scout('Check the markdown import path', ['src/import/markdown.ts', SYNC.db], 'The import writes straight to the database and skips the outbox.'), scout('Check how shared notes are saved', ['src/share/receive.ts', SYNC.db], 'Shared notes skip the outbox too.'), scout('Check the trash and restore code', ['src/trash/restore.ts', SYNC.db], 'Restore goes through the editor save, so it is fine.'), E('src/import/markdown.ts', 4), E('src/share/receive.ts', 4), B('npm test', 88)], said: 'Two writers skipped the outbox (markdown import and shared notes); both go through it now. Restoring from the trash was already fine.' },
  { ask: 'Lunch. When I am back: the sync badge in the corner.', away: 9, steps: [R(SYNC.badge, 2), E(SYNC.badge, 5), B('npm run build', 44)], said: 'The badge shows "Saved", "Syncing" or "Offline, will sync" from the outbox length.' },
  { ask: 'The badge flickers between Syncing and Saved while typing. Fix it.', away: 78, steps: [R(SYNC.badge, 2), R(SYNC.outbox, 2), E(SYNC.badge, 4), B('npm test -- badge', 20)], said: 'It waits for the outbox to stay empty for a second before saying Saved, so it no longer flickers.' },
  { ask: 'Measure how long a push takes with 500 pending edits.', away: 16, steps: [W('bench/push.mjs', 5), B('node bench/push.mjs --edits 500', 95), E(SYNC.outbox, 5), B('node bench/push.mjs --edits 500', 61)], said: '500 edits took 4.1 s in one request each; batched by 50 they take 0.6 s. Pushes are batched now.' },
  { ask: 'Review the whole change: send helpers to check each part, then summarise what they find.', away: 24, steps: [helper('Review the outbox', [R(SYNC.outbox), R(SYNC.tOut)], 'The outbox is fine; one suggestion: cap it at 10,000 edits.'), helper('Review the server log', [R(SYNC.log), R(SYNC.route)], 'The log never shrinks; it needs a compaction job.'), helper('Review the merge', [R(SYNC.merge), R(SYNC.tMerge)], 'The merge handles the cases in the tests; it should also keep line endings.'), helper('Review the flag and the fallback', [R('src/flags.ts'), R('src/app.ts')], 'Turning the flag off mid-session drops pending edits.', 'Stopped: it ran out of time reading the app setup'), helper('Review the tests', [R(SYNC.tOut), R(SYNC.tMerge), R('test/server/sync.test.ts'), B('npm test -- sync', 44)], 'All 31 sync tests pass; nothing covers two devices offline at once.'), helper('Review the docs', [R('docs/sync-v2.md')], 'The plan doc is out of date on conflict handling.')], said: 'Five reviews came back (one ran out of time). To do: cap the outbox, compact the log, keep line endings in merges, a test for two offline devices, and update the doc.' },
  { ask: 'Do those five things.', away: 7, steps: [E(SYNC.outbox, 3), W('server/log/compact.ts', 7), E(SYNC.merge, 4), W('test/sync/offline.test.ts', 6), E('docs/sync-v2.md', 4), B('npm test', 96, '1 test failed: "two devices offline" timed out after 5000 ms'), E('test/sync/offline.test.ts', 3), B('npm test', 92)], said: 'All five are done, and the full test suite passes.' },
  { ask: 'Run it against a copy of production data.', away: 31, steps: [B('npm run db:copy-prod -- --anonymise', 140), B('npm run migrate:sync-v2 -- --dry-run', 120, 'The dry run stopped: 214 notes have no owner'), A('214 old notes have no owner. Give them to the workspace admin, or leave them out of sync?', 41), E('scripts/migrate-sync-v2.ts', 5), B('npm run migrate:sync-v2 -- --dry-run', 112)], said: 'The dry run passes: the 214 notes without an owner go to the workspace admin, as you said.' },
  { ask: 'Write the migration up for the team and stop here.', away: 12, steps: [W('docs/sync-v2-migration.md', 8), B('git add -A && git commit -m "Sync v2: merge, reviews, migration"', 5)], said: 'The migration notes are in docs/sync-v2-migration.md. Everything is committed on sync-v2.' },
  // the third day
  { ask: 'Open a pull request, and check that CI passes.', away: 1150, steps: [B('git push -u origin sync-v2', 8), B('gh pr create --fill', 9), B('gh pr checks --watch', 300, 'CI failed: the e2e job could not start the server (port 4000 in use)'), R('.github/workflows/ci.yml', 2), E('.github/workflows/ci.yml', 3), B('gh pr checks --watch', 280)], said: 'Pull request #212 is open and CI passes now (the e2e job picked a fixed port that another job also used).' },
  { ask: 'A reviewer asks why the log needs versions at all. Answer them in the PR.', away: 26, steps: [R('docs/sync-v2.md', 2), B('gh pr comment 212 --body-file reply.md', 6)], said: 'Replied on the pull request: versions let a device ask "what changed since 41" instead of downloading every note.' },
  { ask: 'Another reviewer wants the outbox cap configurable.', away: 33, steps: [E(SYNC.outbox, 3), E('src/settings/defaults.ts', 2), B('npm test -- outbox', 30), B('git commit -am "Make the outbox cap a setting" && git push', 7)], said: 'The cap is a setting now (10,000 by default), pushed to the pull request.' },
  { ask: 'Try the build on the old Android tablet profile.', away: 15, steps: [B('npm run test:device -- --profile android-9', 160, 'Failed on android-9: IndexedDB transaction aborted (quota)'), S('android 9 webview indexeddb quota', 9), E(SYNC.outbox, 5), B('npm run test:device -- --profile android-9', 150)], said: 'Old Android WebViews have a small storage quota; the outbox now stores edits as diffs, and the device test passes.' },
  { ask: 'Last check: send helpers to try the three apps (web, desktop, mobile) against the PR build.', away: 20, steps: [helper('Try the web app on the PR build', [B('npm run e2e -- --target web', 120)], 'Web: 48 of 48 checks pass.'), helper('Try the desktop app', [B('npm run e2e -- --target desktop', 140)], 'Desktop: 46 of 46 pass.'), helper('Try the mobile app', [B('npm run e2e -- --target mobile', 150, '2 of 41 failed: the share sheet test timed out')], 'Mobile: two share-sheet checks timed out.', 'Two checks failed'), E('src/share/receive.ts', 4), helper('Try the mobile app again', [B('npm run e2e -- --target mobile', 150)], 'Mobile: 41 of 41 pass.')], said: 'Web, desktop and mobile all pass on the PR build (the share sheet needed a longer wait on mobile).' },
  { ask: 'Merge it when CI is green.', away: 11, steps: [B('gh pr checks 212 --watch', 240), B('gh pr merge 212 --squash', 8)], said: 'Merged: pull request #212 is in main as one commit.' },
  { ask: 'Write the release note, two sentences.', away: 6, steps: [E('CHANGELOG.md', 3)], said: 'Notes now sync through a per-device outbox and a versioned server log, so edits from two devices are merged instead of lost. Old notes keep working, and nothing changes until the sync engine is switched on.' },
];

const SPECS: Spec[] = [
  // ---- today ----
  {
    key: 'csv',
    project: 'billing',
    title: 'Add CSV export to the billing reports',
    branch: 'csv-export',
    day: 0,
    at: 8.6,
    prs: [412],
    turns: [
      {
        ask: 'The finance team wants to download the monthly billing report as CSV. Add an export button to the report page, one row per invoice.',
        steps: [
          T(),
          H('Explore', 'Find how the billing report gets its rows', [G('useBillingRows'), R('src/reports/BillingReport.tsx'), R('src/reports/useBillingRows.ts'), G('formatMoney'), R('src/money/format.ts')], 'The report reads its rows from useBillingRows; amounts are formatted by formatMoney in src/money/format.ts.'),
          R('src/reports/BillingReport.tsx', 3),
          R('src/reports/useBillingRows.ts', 2),
          S('CSV escaping quotes commas newlines RFC 4180', 11),
          F('https://www.rfc-editor.org/rfc/rfc4180', 6),
          W('src/reports/csv.ts', 6),
          E('src/reports/BillingReport.tsx', 5),
          B('npm test -- reports', 48, '2 tests failed: "exports one row per invoice" expected 3 rows, got 2 (the header was counted as a row)'),
          R('test/reports.test.ts', 3),
          E('src/reports/csv.ts', 4),
          B('npm test -- reports', 41),
        ],
        said: 'The report page has an Export CSV button now. Each invoice is one row, with amounts as plain numbers and quotes escaped the way spreadsheets expect.',
      },
      {
        ask: 'Can it also include the customer tax id? And keep the column order the same as the table on screen.',
        away: 18,
        steps: [
          G('taxId', 2),
          R('src/customers/types.ts', 2),
          A('The tax id is missing for 14 older customers. Leave the cell empty, or write "none"?', 6),
          E('src/reports/csv.ts', 5),
          E('src/reports/useBillingRows.ts', 4, 'String to replace not found in src/reports/useBillingRows.ts: the file changed since it was read'),
          R('src/reports/useBillingRows.ts', 2),
          E('src/reports/useBillingRows.ts', 4),
          H('general-purpose', 'Write tests for the CSV export columns', [R('src/reports/csv.ts'), R('test/reports.test.ts'), E('test/reports.test.ts', 5), B('npm test -- reports', 39)], 'Added four tests: column order, empty tax ids, quotes in names and the totals row. All pass.'),
          B('npm run lint', 16),
          B('npm test', 95),
        ],
        said: 'Done: the tax id column sits right after the customer name, empty when we have none, and the columns follow the on-screen table. Lint and the full test suite pass.',
      },
      {
        ask: 'Open a pull request for it.',
        away: 9,
        compact: true,
        steps: [B('git status', 2), B('git add -A && git commit -m "Billing report: CSV export"', 4), B('git push -u origin csv-export', 7), B('gh pr create --fill', 9)],
        said: 'Pull request #412 is open with a short description and the test results.',
      },
    ],
  },
  {
    key: 'links',
    project: 'docs-site',
    title: 'Fix broken links in the getting-started guide',
    day: 0,
    at: 7.4,
    turns: [
      {
        ask: 'Someone reported broken links in the getting-started guide. Find and fix them.',
        steps: [
          B('node scripts/check-links.mjs docs/getting-started.md', 12, '3 broken links: /guides/instal, /api/v1/auth, #configure-vite'),
          R('docs/getting-started.md', 3),
          G('guides/install', 2),
          E('docs/getting-started.md', 4),
          E('docs/getting-started.md', 3),
          B('node scripts/check-links.mjs docs/getting-started.md', 11),
        ],
        said: 'Fixed the three links (a typo, an old API path and a renamed heading). The link checker passes for the guide.',
      },
    ],
  },
  // ---- yesterday ----
  {
    key: 'cart',
    project: 'web-shop',
    title: 'Make the cart total update without a reload',
    day: 1,
    at: 14.2,
    turns: [
      {
        ask: 'When you change a quantity in the cart, the total only updates after a reload. Fix it.',
        steps: [
          H('Explore', 'Find where the cart total is computed and stored', [G('cartTotal'), R('src/cart/cart.ts'), R('src/cart/CartTotal.tsx'), G('useCart')], 'The total is computed once in cart.ts and stored; CartTotal never recomputes it.'),
          R('src/cart/CartTotal.tsx', 2),
          R('src/cart/cart.ts', 3),
          E('src/cart/cart.ts', 5),
          E('src/cart/CartTotal.tsx', 4),
          B('npm test -- cart', 33),
        ],
        said: 'The total is now derived from the items each time the cart changes, so it updates as soon as you change a quantity.',
      },
      {
        ask: 'Add a test that changes the quantity twice.',
        away: 12,
        steps: [R('test/cart.test.ts', 2), E('test/cart.test.ts', 4), B('npm test -- cart', 31)],
        said: 'Added the test; it changes the quantity twice and checks the total after each change.',
      },
    ],
  },
  {
    key: 'plan-limits',
    project: 'photo-api',
    title: 'Plan rate limiting for uploads',
    day: 1,
    at: 10.1,
    turns: [
      {
        ask: 'We get bursts of uploads from a few clients. Plan how we could rate limit the upload route; don\'t change code yet.',
        steps: [
          R('src/routes/upload.ts', 3),
          G('express-rate-limit', 2),
          S('token bucket vs sliding window rate limiting express', 10),
          H('Plan', 'Compare ways to rate limit uploads per client', [R('src/routes/upload.ts'), R('src/middleware/auth.ts'), S('express rate limit redis store', 8)], 'A token bucket per API key, kept in Redis, fits best: bursts stay possible, sustained floods are cut.'),
          A('Should the limit be per API key or per IP address?', 34),
        ],
        said: 'Here is the plan: a token bucket per API key (10 uploads a minute, bursts of 20), stored in Redis, answering 429 with a Retry-After header.',
      },
    ],
  },
  {
    key: 'spacing',
    project: 'notes-app',
    title: 'Tidy the spacing on the settings screen',
    day: 1,
    at: 16.6,
    turns: [
      {
        ask: 'The settings screen looks cramped on phones. Give the rows more room.',
        steps: [R('src/settings/SettingsScreen.tsx', 3), R('src/theme.ts', 2), E('src/settings/SettingsScreen.tsx', 4), E('src/theme.ts', 3), B('npm run lint', 12)],
        said: 'Rows have 16 px of padding now and the section headers have more space above them.',
      },
    ],
  },
  { key: 'empty-1', project: 'notes-app', title: 'Untitled session', day: 1, at: 18.2, empty: true, turns: [] },
  // ---- two days ago: the busy one ----
  {
    key: 'rebuild',
    project: 'search-api',
    title: 'Speed up the search index rebuild',
    branch: 'faster-rebuild',
    day: 2,
    at: 9.3,
    turns: [
      {
        ask: 'Rebuilding the search index takes 40 minutes. Find out where the time goes and make it faster.',
        steps: [
          R('src/index/rebuild.ts', 4),
          B('npm run bench -- rebuild', 180),
          R('bench/rebuild.bench.ts', 2),
          H('Explore', 'Find every place the rebuild touches the database', [G('db.query', 2), R('src/index/rebuild.ts'), R('src/db/pool.ts'), G('for await', 2)], 'Rows are fetched one by one inside the loop: about 2 million queries per rebuild.'),
          S('postgres cursor batch fetch node pg', 9),
          E('src/index/rebuild.ts', 6),
          B('npm run bench -- rebuild', 150, 'Process ran out of memory (heap limit reached) while holding all rows at once'),
          E('src/index/rebuild.ts', 6),
          B('npm run bench -- rebuild', 120),
        ],
        said: 'Rows are now read in batches of 5,000 with a cursor. The rebuild benchmark went from 40 minutes to about 6, and memory stays flat.',
      },
      {
        ask: 'Nice. Can the tokenizing run in parallel too?',
        away: 25,
        steps: [
          R('src/index/tokenize.ts', 3),
          H('general-purpose', 'Try tokenizing the batches in worker threads', [R('src/index/tokenize.ts'), W('src/index/tokenizeWorker.ts', 5), E('src/index/rebuild.ts', 5), B('npm run bench -- rebuild', 95)], 'With four worker threads the rebuild takes 2 min 40 s.'),
          B('npm test', 70),
        ],
        said: 'Tokenizing now runs in four worker threads; the rebuild is down to under three minutes and the tests pass.',
      },
    ],
  },
  {
    key: 'rounding',
    project: 'billing',
    title: 'Explain why some invoices round differently',
    day: 2,
    at: 13.5,
    turns: [
      {
        ask: 'Some invoice totals are a cent off from the sum of their lines. Explain why, don\'t fix it yet.',
        steps: [R('src/invoices/round.ts', 3), R('src/invoices/total.ts', 3), G('Math.round', 2), R('db/schema.sql', 4), G('numeric(12, 2)', 2)],
        said: 'Lines are rounded one by one, then added, while the total is computed from the unrounded amounts and rounded once. With many lines the two can differ by a cent.',
      },
    ],
  },
  {
    key: 'orders-1',
    project: 'web-shop',
    title: 'First pass at the order history page',
    day: 2,
    at: 15.4,
    turns: [
      {
        ask: 'Start an order history page: a list of past orders with date, items and total.',
        steps: [G('orders', 2), R('src/api/orders.ts', 3), W('src/orders/OrderList.tsx', 6), W('src/orders/useOrders.ts', 5), E('src/routes.tsx', 3), B('npm run build', 46)],
        said: 'There is a first OrderList page at /orders, fed by a useOrders hook. It shows the date, the number of items and the total.',
      },
    ],
  },
  {
    key: 'vite-read',
    project: 'docs-site',
    title: 'Read up on the Vite 7 migration',
    day: 2,
    at: 11.1,
    turns: [
      {
        ask: 'What would it take to move the docs site to Vite 7?',
        steps: [R('package.json', 2), R('vite.config.ts', 2), S('vite 7 migration guide breaking changes', 9), F('https://vite.dev/guide/migration', 8), S('vite 7 node version requirement', 7)],
        said: 'Two things matter for us: Node 20.19 or newer, and the renamed build.cssCodeSplit option. The rest of our config works as is.',
      },
    ],
  },
  // ---- three days ago ----
  {
    key: 'sync-repro',
    project: 'notes-app',
    title: 'Reproduce the sync conflict on reconnect',
    day: 3,
    at: 10.2,
    turns: [
      {
        ask: 'Users lose edits when the app reconnects after being offline. Try to reproduce it with a test.',
        steps: [
          R('src/sync/reconnect.ts', 3),
          R('src/sync/queue.ts', 3),
          W('test/sync.reconnect.test.ts', 6),
          B('npm test -- sync.reconnect', 28, 'The test passed: no conflict happened, so it does not reproduce the bug yet'),
          E('test/sync.reconnect.test.ts', 5),
          B('npm test -- sync.reconnect', 27, '1 test failed: "keeps both edits" expected 2 notes, got 1 (the offline edit was dropped)'),
        ],
        said: 'Reproduced: when two edits to the same note queue up offline, the second replaces the first on reconnect. The failing test is in test/sync.reconnect.test.ts.',
      },
    ],
  },
  {
    key: 'resize',
    project: 'photo-api',
    title: 'Resize images in a background job',
    day: 3,
    at: 14.8,
    turns: [
      {
        ask: 'Uploads are slow because we resize images during the request. Move the resizing to a background job.',
        steps: [R('src/routes/upload.ts', 3), R('src/jobs/queue.ts', 3), W('src/jobs/resize.ts', 6), E('src/routes/upload.ts', 5), B('npm test -- upload', 36)],
        said: 'Uploads return right away now; a resize job makes the thumbnails a few seconds later.',
      },
    ],
  },
  // ---- five days ago ----
  {
    key: 'taxids',
    project: 'billing',
    title: 'Add tax ids to customer profiles',
    day: 5,
    at: 9.8,
    turns: [
      {
        ask: 'Customers need a tax id field on their profile, saved in the database.',
        steps: [R('db/schema.sql', 3), W('db/migrations/0042_tax_id.sql', 4), B('npm run migrate', 14), E('src/customers/types.ts', 3), E('src/customers/ProfileForm.tsx', 6), B('npm test -- customers', 40)],
        said: 'Profiles have a tax id field, stored in a new tax_id column; the migration ran and the tests pass.',
      },
    ],
  },
  {
    key: 'typos',
    project: 'search-api',
    title: 'Add typo tolerance to search',
    day: 5,
    at: 13.9,
    turns: [
      {
        ask: 'Searching "recieve" finds nothing. Make search forgive small typos.',
        steps: [R('src/search/query.ts', 3), S('trigram vs levenshtein fuzzy search postgres', 9), W('src/search/fuzzy.ts', 6), E('src/search/query.ts', 4), B('npm test -- search', 44, '1 test failed: "exact matches rank first" got the fuzzy match first'), E('src/search/fuzzy.ts', 4), B('npm test -- search', 42)],
        said: 'Search now matches words one or two letters off, and exact matches still rank first.',
      },
    ],
  },
  // ---- six days ago (weekend) ----
  {
    key: 'notes-24',
    project: 'docs-site',
    title: 'Write the release notes for 2.4',
    day: 6,
    at: 11.3,
    turns: [
      {
        ask: 'Write the release notes for 2.4 from the merged pull requests.',
        steps: [B('gh pr list --state merged --limit 30', 8), R('CHANGELOG.md', 2), E('CHANGELOG.md', 6)],
        said: 'Release notes for 2.4 are in CHANGELOG.md: four features, six fixes, one breaking change.',
      },
    ],
  },
  // ---- eight days ago ----
  {
    key: 'checkout',
    project: 'web-shop',
    title: 'Fix the checkout button on small screens',
    day: 8,
    at: 10.5,
    turns: [
      {
        ask: 'On phones the checkout button is hidden behind the cookie banner.',
        steps: [R('src/checkout/CheckoutButton.tsx', 2), R('src/layout/CookieBanner.tsx', 2), E('src/checkout/CheckoutButton.tsx', 4), B('npm run build', 44)],
        said: 'The checkout button now sits above the cookie banner and stays reachable on small screens.',
      },
    ],
  },
  {
    key: 'bucket',
    project: 'photo-api',
    title: 'Move uploads to the new storage bucket',
    day: 8,
    at: 14.1,
    turns: [
      {
        ask: 'Move new uploads to the new storage bucket and copy the old files over.',
        steps: [
          R('src/storage/bucket.ts', 3),
          E('src/storage/bucket.ts', 4),
          H('general-purpose', 'Copy the old files to the new bucket', [B('node scripts/copy-bucket.mjs --dry-run', 30), B('node scripts/copy-bucket.mjs', 240, 'Access denied (403) for 12 files under /archive: the new bucket has no write access for that prefix')], 'Copied 18,402 files; 12 files under /archive failed with access denied.', 'Sonnet 5.5', 'Copying stopped with access denied for 12 files'),
          B('npm test -- storage', 30),
        ],
        said: 'New uploads go to the new bucket. The copy is done except 12 files under /archive, which the new bucket refuses: it needs write access for that folder.',
      },
    ],
  },
  // ---- nine days ago ----
  {
    key: 'dark',
    project: 'notes-app',
    title: 'Add a dark mode toggle',
    day: 9,
    at: 9.6,
    turns: [
      {
        ask: 'Add a dark mode toggle to the settings.',
        steps: [R('src/theme.ts', 3), R('src/settings/SettingsScreen.tsx', 2), E('src/theme.ts', 5), E('src/settings/SettingsScreen.tsx', 4), B('npm test', 52)],
        said: 'Settings has a Dark mode switch; the choice is remembered and follows the system setting until you change it.',
      },
    ],
  },
  {
    key: 'nightly',
    project: 'billing',
    title: 'Find why the nightly report job failed',
    day: 9,
    at: 13.2,
    turns: [
      {
        ask: 'The nightly billing report job failed last night. Find out why.',
        steps: [B('kubectl logs job/nightly-report --tail=200', 9), R('src/jobs/nightlyReport.ts', 3), G('timeout', 2), B('npm run report -- --date 2026-11-06', 75, 'Timed out after 60 s waiting for the invoices query')],
        said: 'The job times out on the invoices query since the invoices table passed 4 million rows: the query has no index on issued_at.',
      },
    ],
  },
  // ---- earlier ----
  {
    key: 'setup',
    project: 'search-api',
    title: 'Set up the search API project',
    day: 11,
    at: 10.0,
    turns: [
      {
        ask: 'Set up a small TypeScript API for search: Express, tests, lint, and a /health route.',
        steps: [B('npm init -y', 3), B('npm install express zod', 28), B('npm install -D typescript vitest eslint', 35), W('tsconfig.json', 3), W('src/server.ts', 5), W('src/routes/health.ts', 3), W('test/health.test.ts', 4), B('npm test', 22)],
        said: 'The project is set up with Express and zod, vitest and eslint; GET /health answers 200 and its test passes.',
      },
    ],
  },
  {
    key: 'variants',
    project: 'web-shop',
    title: 'Rename the product variants table',
    day: 13,
    at: 15.0,
    turns: [
      {
        ask: 'Rename the variants table to product_variants everywhere.',
        steps: [G('variants', 3), W('db/migrations/0031_rename_variants.sql', 4), E('src/db/products.ts', 4), E('src/api/products.ts', 3), B('npm test', 58)],
        said: 'The table is product_variants now, with a migration, and every query uses the new name.',
      },
    ],
  },
  {
    key: 'generator',
    project: 'docs-site',
    title: 'Move the docs to the new site generator',
    day: 15,
    at: 9.0,
    turns: [
      {
        ask: 'Move the docs from the old generator to Vite-based pages.',
        steps: [
          R('package.json', 2),
          B('npm install -D vitepress', 30),
          W('docs/.vitepress/config.ts', 6),
          B('npm run docs:build', 40, 'Build failed: 7 pages use the old {{ include }} syntax'),
          E('docs/guides/install.md', 4),
          E('docs/getting-started.md', 4),
          B('npm run docs:build', 38, 'Build failed: 2 pages still use {{ include }}: docs/faq.md and docs/upgrade.md'),
          E('docs/faq.md', 3),
          E('docs/upgrade.md', 3),
          B('node scripts/check-links.mjs', 12, '1 broken link: /guides/old-install'),
          E('docs/guides/install.md', 3),
          B('npm run docs:build', 37),
        ],
        said: 'The docs build with VitePress now; nine pages needed their includes rewritten and one link pointed at an old page.',
      },
    ],
  },
  // ---- a long one, over three days ----
  {
    key: 'sync-v2',
    project: 'notes-app',
    title: 'Move the notes app to the new sync engine',
    branch: 'sync-v2',
    day: 22,
    at: 20.4,
    prs: [212],
    turns: SYNC_TURNS,
  },
  // ---- kept after Claude Code cleaned up ----
  {
    key: 'model',
    project: 'notes-app',
    title: 'Sketch the notes data model',
    day: 31,
    at: 10.0,
    kept: true,
    turns: [{ ask: 'Sketch a data model for notes with tags and folders.', steps: [W('docs/data-model.md', 6)], said: 'The data model is in docs/data-model.md: notes, tags, folders and a join table.' }],
  },
  {
    key: 'imagelibs',
    project: 'photo-api',
    title: 'Try three image libraries',
    day: 34,
    at: 14.0,
    kept: true,
    turns: [{ ask: 'Compare sharp, jimp and squoosh for resizing.', steps: [S('sharp vs jimp performance', 8), B('node bench/resize.mjs', 60)], said: 'sharp was about 8 times faster than jimp; squoosh is no longer maintained.' }],
  },
];

// What the seven sessions in the scene have been doing today (by project and title).
const LIVE_TURNS: Record<string, Turn[]> = {
  'Fix sync conflict on reconnect': [
    {
      ask: 'Fix the sync conflict from the failing reconnect test: keep both edits.',
      steps: [R('src/sync/queue.ts', 3), R('test/sync.reconnect.test.ts', 2), E('src/sync/queue.ts', 6), B('npm test -- sync', 30), B('git push --force-with-lease', 4)],
      said: '',
      open: true,
    },
  ],
  'Add order history page': [
    {
      ask: 'Finish the order history page: paging, and a details view per order.',
      steps: [H('Explore', 'Find how other lists page their results', [G('usePaged'), R('src/products/ProductList.tsx')], 'ProductList pages with usePaged(20).'), E('src/orders/OrderList.tsx', 5), B('npm run build', 40), E('src/orders/OrderList.tsx', 4)],
      said: '',
      open: true,
    },
  ],
  'Rate limit the upload route': [
    {
      ask: 'Go ahead with the plan: a token bucket per API key in Redis.',
      steps: [W('src/middleware/rateLimit.ts', 6), E('src/routes/upload.ts', 4), B('npm test -- upload', 38, '1 test failed: "allows bursts of 20" got 429 on the 11th upload'), E('src/middleware/rateLimit.ts', 4), B('npm test -- upload', 36)],
      said: '',
      open: true,
    },
  ],
  'Upgrade to Vite 7': [
    {
      ask: 'Do the Vite 7 upgrade we read about.',
      steps: [B('npm install -D vite@7', 30), E('vite.config.ts', 4), B('npm run build', 35), S('vite 7 migration guide', 9)],
      said: '',
      open: true,
    },
  ],
  'Explain the billing schema': [
    {
      ask: 'Write a short explanation of the billing schema for new people.',
      steps: [R('db/schema.sql', 4), R('src/invoices/total.ts', 2), W('docs/billing.md', 6), R('db/schema.sql', 2)],
      said: '',
      open: true,
    },
  ],
  'Rate limit tests': [
    {
      ask: 'Write load tests for the upload rate limit.',
      steps: [R('src/middleware/rateLimit.ts', 2), W('test/rateLimit.load.test.ts', 6), B('npm test -- rateLimit', 44)],
      said: 'The load test sends 50 uploads in two seconds and checks that 20 go through and the rest get 429 with Retry-After.',
    },
  ],
  'Tidy the settings screen': [
    {
      ask: 'Use the new spacing on the account settings too.',
      steps: [R('src/settings/AccountSettings.tsx', 2), E('src/settings/AccountSettings.tsx', 4)],
      said: 'Account settings use the same row spacing as the rest of the settings now.',
    },
  ],
};

// ---------- prices (USD per million tokens: input, output, cache read, cache write) ----------

const PRICE: Record<string, [number, number, number, number]> = {
  'Opus 5.5': [4, 20, 0.2, 5],
  'Sonnet 5.5': [2, 10, 0.1, 2.5],
  'Haiku 5.5': [0.1, 0.5, 0.01, 0.125],
};

// ---------- the simulation ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Msg {
  t: number;
  model: string;
  in: number;
  out: number;
  cr: number;
  cw: number;
}
interface Ag {
  id: string;
  kind: 'main' | 'subagent';
  type: string;
  name: string;
  desc: string;
  model: string;
  events: Ev[];
  msgs: Msg[];
  ctx: number;
  ctxSeries: [number, number][];
  toolCalls: number;
  errors: number;
  counts: Map<string, number>;
  status: string | null;
  result: string;
  task: string;
  startedAt: number;
  lastTs: number;
}

const NAME: Record<Simple[0], [string, string]> = {
  read: ['Read', 'read'],
  grep: ['Grep', 'read'],
  glob: ['Glob', 'read'],
  edit: ['Edit', 'edit'],
  write: ['Write', 'edit'],
  bash: ['Bash', 'run'],
  web: ['WebSearch', 'web'],
  fetch: ['WebFetch', 'web'],
  todo: ['TodoWrite', 'plan'],
  skill: ['Skill', 'read'],
  mcp: ['mcp__docs__search', 'mcp'],
};

const usd = (m: Msg) => {
  const p = PRICE[m.model] || PRICE['Opus 5.5'];
  return { in: (m.in * p[0]) / 1e6, out: (m.out * p[1]) / 1e6, cr: (m.cr * p[2]) / 1e6, cw: (m.cw * p[3]) / 1e6 };
};

interface Built {
  summary: Summary;
  detail: Detail;
  usage: UsageRow[];
  search: string;
}

function simulate(sp: Spec, num: number, todayStart: number, shift = 0): Built {
  const rand = rng(seedOf(sp.key));
  const between = (a: number, b: number) => a + rand() * (b - a);
  const model = sp.model || 'Opus 5.5';
  const id = sp.live?.id || `demo-h-${sp.key}`;
  // whole milliseconds, like a real transcript's
  const start = Math.round((sp.live?.startedAt ?? todayStart - sp.day * 86_400_000 + sp.at * 3_600_000) + shift);
  const files = new Map<string, FileStat>();
  const file = (p: string) => {
    let f = files.get(p);
    if (!f) files.set(p, (f = { path: p, reads: 0, edits: 0, added: 0, removed: 0, isNew: false }));
    return f;
  };
  let toolSeq = 0;
  const agents: Ag[] = [];
  const newAgent = (aid: string, kind: Ag['kind'], type: string, desc: string, m: string, t: number): Ag => {
    const a: Ag = { id: aid, kind, type, name: '', desc, model: m, events: [], msgs: [], ctx: kind === 'main' ? 18_000 : 9_000, ctxSeries: [], toolCalls: 0, errors: 0, counts: new Map(), status: kind === 'main' ? null : 'done', result: '', task: kind === 'main' ? '' : desc, startedAt: t, lastTs: t };
    agents.push(a);
    return a;
  };
  const main = newAgent('main', 'main', 'main', sp.title, model, start);
  const message = (a: Ag, t: number, out: number) => {
    const cw = Math.round(between(700, 4200));
    const m: Msg = { t, model: a.model, in: Math.round(between(3, 40)), out, cr: a.ctx, cw };
    a.msgs.push(m);
    a.ctx += cw + out;
    a.ctxSeries.push([t, a.ctx]);
    a.lastTs = Math.max(a.lastTs, t);
  };

  const run = (a: Ag, step: Step, t0: number): number => {
    let t = t0;
    message(a, t, Math.round(between(60, 520)));
    const tid = `toolu_demo_${sp.key}_${toolSeq++}`;
    if (step[0] === 'helper') {
      const h = step[1];
      const sub = newAgent(`demo-h-${sp.key}-${agents.length}`, 'subagent', h.type, h.desc, h.model || 'Sonnet 5.5', t + 1200);
      sub.events.push({ t: t + 1200, a: sub.id, k: 'task', text: h.desc });
      let ht = t + 1200 + Math.round(between(3000, 9000));
      for (const s of h.steps) ht = run(sub, s, ht);
      message(sub, ht, Math.round(between(200, 700)));
      sub.events.push({ t: ht, a: sub.id, k: 'text', text: h.said });
      sub.result = h.said;
      sub.lastTs = ht;
      if (h.fail) sub.status = 'failed';
      const ev: Ev = { t, a: a.id, k: 'tool', id: tid, name: 'Agent', short: 'Agent', cat: 'agent', target: `${h.type}: ${h.desc}`, end: ht + 1500, ok: !h.fail, subType: h.type, subDesc: h.desc, sub: sub.id, info: h.fail || `${sub.toolCalls} tool calls` };
      a.events.push(ev);
      a.toolCalls++;
      a.counts.set('Agent', (a.counts.get('Agent') || 0) + 1);
      if (h.fail) a.errors++;
      return ev.end! + Math.round(between(2500, 9000));
    }
    if (step[0] === 'ask') {
      const ev: Ev = { t, a: a.id, k: 'tool', id: tid, name: 'AskUserQuestion', short: 'AskUserQuestion', cat: 'ask', target: step[1], end: t + step[2] * 60_000, ok: true, info: 'answered' };
      a.events.push(ev);
      a.toolCalls++;
      a.counts.set('AskUserQuestion', (a.counts.get('AskUserQuestion') || 0) + 1);
      return ev.end! + Math.round(between(3000, 8000));
    }
    const [kind, target, secs = 3, fail] = step;
    const [name, cat] = NAME[kind];
    const dur = Math.round(secs * 1000 * between(0.8, 1.25));
    const ev: Ev = { t, a: a.id, k: 'tool', id: tid, name, short: name, cat, target, end: t + dur, ok: !fail };
    if (fail) {
      ev.info = fail;
      a.errors++;
    } else if (kind === 'edit' || kind === 'write') {
      const f = file(target);
      const add = Math.round(between(2, kind === 'write' ? 80 : 24));
      const del = kind === 'write' ? 0 : Math.round(between(0, 12));
      f.edits++;
      f.added += add;
      f.removed += del;
      if (kind === 'write' && f.edits === 1) f.isNew = true;
      ev.info = kind === 'write' && f.isNew ? `new file, +${add}` : `+${add} −${del}`;
    } else if (kind === 'read') {
      const f = file(target);
      f.reads++;
      ev.info = `${Math.round(between(40, 400))} lines`;
    } else if (kind === 'bash') ev.info = /test/.test(target) ? 'all tests passed' : 'done';
    if (kind === 'todo') ev.target = '4 steps';
    a.events.push(ev);
    a.toolCalls++;
    a.counts.set(name, (a.counts.get(name) || 0) + 1);
    a.lastTs = Math.max(a.lastTs, ev.end!);
    return ev.end! + Math.round(between(2500, 16000));
  };

  let t = start;
  const turns = sp.empty ? [] : sp.live ? LIVE_TURNS[sp.title] || [] : sp.turns;
  turns.forEach((turn, i) => {
    if (i > 0) t += Math.round((turn.away ?? between(5, 30)) * 60_000);
    main.events.push({ t, a: 'main', k: 'prompt', text: turn.ask });
    t += Math.round(between(4000, 15000));
    for (const s of turn.steps) t = run(main, s, t);
    if (!turn.open && turn.said) {
      message(main, t, Math.round(between(300, 1100)));
      main.events.push({ t, a: 'main', k: 'text', text: turn.said });
    }
    if (turn.compact) {
      t += 1500;
      main.events.push({ t, a: 'main', k: 'compact' });
      main.ctx = 32_000;
      main.ctxSeries.push([t, main.ctx]);
    }
  });
  const live = !!sp.live;
  const now = Date.now();
  // a running session's last step is still going on
  const endedAt = live ? now - 4000 : Math.max(start, ...agents.map((a) => a.lastTs), t);
  // a running session that hasn't answered yet is still on its last step
  if (live && turns[turns.length - 1]?.open) {
    const last = main.events.filter((e) => e.k === 'tool').pop();
    if (last) last.end = undefined;
  }

  // ---------- what the server would say about it ----------
  const zero = (): Tok => ({ in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0 });
  const tokOf = (a: Ag) => a.msgs.reduce((z, m) => ({ ...z, in: z.in + m.in, out: z.out + m.out, cr: z.cr + m.cr, cw5: z.cw5 + m.cw }), zero());
  const costOf = (a: Ag) => a.msgs.reduce((n, m) => {
    const c = usd(m);
    return n + c.in + c.out + c.cr + c.cw;
  }, 0);
  const subs = agents.filter((a) => a.kind !== 'main');
  const tMain = tokOf(main);
  const tSubs = subs.reduce((z, a) => {
    const x = tokOf(a);
    return { in: z.in + x.in, out: z.out + x.out, cr: z.cr + x.cr, cw5: z.cw5 + x.cw5, cw1: 0, ws: 0 };
  }, zero());
  const cMain = costOf(main);
  const cSubs = subs.reduce((n, a) => n + costOf(a), 0);
  const allEvents = agents.flatMap((a) => a.events);
  const toolCalls = agents.reduce((n, a) => n + a.toolCalls, 0);
  const errors = agents.reduce((n, a) => n + a.errors, 0);
  const counts = new Map<string, number>();
  for (const a of agents) for (const [k, v] of a.counts) counts.set(k, (counts.get(k) || 0) + v);
  const tools = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  const fileList = [...files.values()].sort((x, y) => y.edits - x.edits || y.added + y.removed - (x.added + x.removed) || y.reads - x.reads);
  const edited = fileList.filter((f) => f.edits);
  // per day, like the server: tokens, price, tools, prompts, edits, and 5-minute slots with anything going on
  const days: Record<string, DayStat & { b: Set<number> }> = {};
  const day = (ms: number) => (days[dayKey(ms)] ||= { tok: 0, usd: 0, tools: 0, prompts: 0, edits: 0, add: 0, del: 0, active: 0, b: new Set() });
  const usage = new Map<string, UsageRow>();
  for (const a of agents) {
    const who = a.kind === 'main' ? 'main' : `subagent:${a.type}`;
    for (const m of a.msgs) {
      const g = day(m.t);
      const c = usd(m);
      g.tok += m.in + m.out + m.cr + m.cw;
      g.usd += c.in + c.out + c.cr + c.cw;
      g.b.add(Math.floor(m.t / 300_000));
      const k = `${dayKey(m.t)}|${m.model}|${who}`;
      let u = usage.get(k);
      if (!u) usage.set(k, (u = [dayKey(m.t), m.model, who, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
      u[3]++;
      u[4] += m.in;
      u[5] += m.out;
      u[6] += m.cr;
      u[7] += m.cw;
      u[8] += c.in;
      u[9] += c.out;
      u[10] += c.cr;
      u[11] += c.cw;
    }
    for (const e of a.events) {
      const g = day(e.t);
      g.b.add(Math.floor(e.t / 300_000));
      if (e.k === 'tool') {
        g.tools++;
        if (e.cat === 'edit' && e.ok !== false) {
          g.edits++;
          const m = /\+(\d+)(?: −(\d+))?/.exec(e.info || '');
          g.add += Number(m?.[1] || 0);
          g.del += Number(m?.[2] || 0);
        }
      } else if (e.k === 'prompt' && a.kind === 'main') g.prompts++;
    }
  }
  const dayStats: Record<string, DayStat> = {};
  for (const [k, g] of Object.entries(days)) {
    const { b, ...rest } = g;
    dayStats[k] = { ...rest, usd: Math.round(rest.usd * 1000) / 1000, active: b.size * 5 };
  }
  const byModel: Detail['byModel'] = {};
  const modelUsd: Record<string, number> = {};
  for (const a of agents)
    for (const m of a.msgs) {
      const g = (byModel[m.model] ||= { in: 0, out: 0, cr: 0, cw: 0, usd: 0, messages: 0 });
      const c = usd(m);
      g.in += m.in;
      g.out += m.out;
      g.cr += m.cr;
      g.cw += m.cw;
      g.usd += c.in + c.out + c.cr + c.cw;
      g.messages++;
    }
  for (const [m, g] of Object.entries(byModel)) modelUsd[m] = Math.round(g.usd * 1000) / 1000;
  const prompts = main.events.filter((e) => e.k === 'prompt');
  const said = main.events.filter((e) => e.k === 'text');
  const lastStep = main.events.filter((e) => (e.k === 'tool' && e.end) || e.k === 'error').sort((x, y) => x.t - y.t).pop();
  const summary: Summary = {
    num,
    id,
    cwd: `~/code/${sp.project}`,
    project: sp.project,
    branch: sp.branch || 'main',
    title: sp.empty ? 'Untitled session' : sp.title,
    firstPrompt: prompts[0]?.text || '',
    lastPrompt: prompts[prompts.length - 1]?.text || '',
    lastText: said[said.length - 1]?.text || '',
    startedAt: start,
    endedAt,
    model,
    models: Object.keys(byModel),
    tokens: { main: tMain, subs: tSubs },
    cost: { main: cMain, subs: cSubs, total: cMain + cSubs, unknown: false },
    costState: null,
    toolCalls,
    prompts: prompts.length,
    errors,
    endedFailed: !!lastStep && (lastStep.k === 'error' || lastStep.ok === false),
    subagents: subs.length,
    workflowAgents: 0,
    workflows: 0,
    filesEdited: edited.length,
    linesAdded: edited.reduce((n, f) => n + f.added, 0),
    linesRemoved: edited.reduce((n, f) => n + f.removed, 0),
    prs: (sp.prs || []).map((n) => ({ number: n, url: '', repo: `example/${sp.project}` })),
    compactions: main.events.filter((e) => e.k === 'compact').length,
    indexed: true,
    live,
    archived: !!sp.kept,
    empty: !!sp.empty,
    days: dayStats,
    tools: tools.slice(0, 8),
    modelUsd,
    size: 0,
  };
  // lanes and marks, as the server draws them
  const lanes: Record<string, Seg[]> = {};
  const marks: Record<string, [number, string, string?][]> = {};
  for (const a of agents) {
    lanes[a.id] = a.events
      .filter((e) => e.k === 'tool')
      .map((e): Seg => [e.t, Math.max(e.end ?? endedAt, e.t + 400), e.cat || 'other', `${e.short || e.name} ${e.target || ''}`.trim().slice(0, 90), e.ok === false ? 0 : 1, 1])
      .sort((x, y) => x[0] - y[0]);
    marks[a.id] = a.events.filter((e) => ['prompt', 'compact', 'error', 'interrupt', 'notify', 'command'].includes(e.k)).map((e): [number, string, string?] => (e.k === 'prompt' ? [e.t, e.k, (e.text || '').slice(0, 240)] : [e.t, e.k]));
  }
  const info = (a: Ag): AgentInfo => ({
    id: a.id,
    kind: a.kind,
    parent: a.kind === 'main' ? null : 'main',
    type: a.type,
    name: a.name,
    desc: a.kind === 'main' ? sp.title : a.desc,
    status: a.kind === 'main' ? null : live && a.lastTs > now - 60_000 ? 'running' : a.status,
    startedAt: a.startedAt,
    lastTs: a.lastTs,
    model: a.model,
    toolCalls: a.toolCalls,
    errors: a.errors,
    tokens: tokOf(a),
    cost: costOf(a),
    now: null,
    result: a.result,
    task: a.task,
    runId: '',
    phase: '',
    color: '',
    ctx: a.ctx,
    top: [...a.counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3),
  });
  const events = allEvents.slice().sort((x, y) => y.t - x.t);
  const detail: Detail = {
    ...summary,
    live,
    agents: agents.map(info),
    workflows: [],
    events,
    totalEvents: events.length,
    window: [start, endedAt],
    lanes,
    marks,
    context: main.ctxSeries,
    ctx: main.ctx,
    ctxWindow: 1_000_000,
    tools,
    files: fileList,
    byModel,
  };
  const search = [sp.title, ...prompts.map((e) => e.text), ...allEvents.filter((e) => e.k === 'tool').map((e) => e.target), ...files.keys()].filter(Boolean).join('\n');
  return { summary, detail, usage: [...usage.values()].map((u) => u.map((v, i) => (i >= 8 ? Math.round((v as number) * 1e5) / 1e5 : v)) as unknown as UsageRow), search };
}

// ---------- the whole made-up history ----------

let built: Built[] | null = null;

function all(): Built[] {
  if (built) return built;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const office = demoOffice();
  const live: Spec[] = office.sessions.map((s) => ({ key: `live-${s.name}`, project: s.project, title: s.title, day: 0, at: 0, turns: [], live: { id: s.id, startedAt: s.startedAt, num: s.num } }));
  // older first, so the numbers grow with time (S-101, S-102, …)
  const order = [...SPECS, ...live].map((s) => ({ s, at: s.live ? s.live.startedAt : todayStart - s.day * 86_400_000 + s.at * 3_600_000 })).sort((a, b) => a.at - b.at);
  built = order.map(({ s }, i) => place(s, s.live?.num ?? 101 + i, todayStart));
  return built;
}

/**
 * Finished sessions end at least a quarter of an hour ago, whatever the time of
 * day (early in the morning, today's move back into the night); a running one
 * that hasn't answered yet is busy right up to now.
 */
function place(sp: Spec, num: number, todayStart: number): Built {
  const now = Date.now();
  const b = simulate(sp, num, todayStart);
  const lastStep = Math.max(...b.detail.events.map((e) => e.end ?? e.t));
  if (sp.live) {
    const open = (LIVE_TURNS[sp.title] || []).some((t) => t.open);
    return open ? simulate(sp, num, todayStart, now - 25_000 - lastStep) : b;
  }
  const latest = now - 15 * 60_000;
  return b.summary.endedAt > latest ? simulate(sp, num, todayStart, latest - b.summary.endedAt) : b;
}

// ---------- answers, shaped like the server's ----------

function terms(q: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q.toLowerCase()))) out.push((m[1] || m[2]).trim());
  return out.filter(Boolean);
}

function snippet(text: string, ts: string[]) {
  const lower = text.toLowerCase();
  for (const t of ts) {
    const i = lower.indexOf(t);
    if (i < 0) continue;
    const a = lower.lastIndexOf('\n', i) + 1;
    const b = lower.indexOf('\n', i);
    return { text: text.slice(a, b < 0 ? undefined : b).slice(0, 130), term: t };
  }
  return null;
}

const statusOf = (s: Summary) => (s.live ? 'live' : s.archived ? 'kept' : 'ended');
const dayStartOf = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export function demoHistory(f: HistoryFilter): History {
  const list = all();
  const pool = list.filter((b) => (f.empty || !b.summary.empty || b.summary.live) && (!f.problems || (b.summary.errors || 0) > 0));
  const ts = terms(f.q);
  const matched = ts.length ? pool.filter((b) => ts.every((t) => b.search.toLowerCase().includes(t) || b.summary.project.toLowerCase().includes(t))) : pool;
  const inRange = (s: Summary) => !f.from && !f.to ? true : Object.keys(s.days || {}).some((d) => (!f.from || d >= f.from) && (!f.to || d <= f.to));
  const okStatus = (s: Summary) => !f.status.length || f.status.includes(statusOf(s));
  const okProject = (s: Summary) => !f.projects.length || f.projects.includes(s.project);
  const okModel = (s: Summary) => !f.models.length || (s.models || []).some((m) => f.models.includes(m));
  const facet = (xs: Summary[], key: (s: Summary) => string[]) => {
    const m = new Map<string, number>();
    for (const s of xs) for (const k of key(s)) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  const sums = matched.map((b) => b.summary);
  const calendar: History['calendar'] = {};
  for (const s of sums) {
    if (!okStatus(s) || !okProject(s) || !okModel(s)) continue;
    for (const [d, g] of Object.entries(s.days || {})) {
      const c = (calendar[d] ||= { sessions: 0, usd: 0, tok: 0, active: 0, problems: 0 });
      c.sessions++;
      c.usd += g.usd;
      c.tok += g.tok;
      c.active = (c.active || 0) + g.active;
      if ((s.errors || 0) > 0) c.problems = (c.problems || 0) + 1;
    }
  }
  const final = matched.filter((b) => inRange(b.summary) && okStatus(b.summary) && okProject(b.summary) && okModel(b.summary)).sort((a, b) => b.summary.endedAt - a.summary.endedAt);
  return {
    total: list.length,
    hiddenEmpty: f.empty ? 0 : list.filter((b) => b.summary.empty && !b.summary.live).length,
    indexing: { running: false, done: list.length, total: list.length },
    totals: { sessions: final.length, tokens: 0, usd: 0, scoped: !!(f.from || f.to) },
    facets: {
      projects: facet(sums.filter((s) => inRange(s) && okStatus(s) && okModel(s)), (s) => [s.project]),
      models: facet(sums.filter((s) => inRange(s) && okStatus(s) && okProject(s)), (s) => s.models || []),
      status: facet(sums.filter((s) => inRange(s) && okProject(s) && okModel(s)), (s) => [statusOf(s)]),
    },
    calendar,
    sessions: final.map((b) => {
      const m = ts.length ? snippet(b.search, ts) : null;
      return m ? { ...b.summary, match: m } : b.summary;
    }),
  };
}

export function demoDetail(id: string): Detail | null {
  return all().find((b) => b.summary.id === id)?.detail || null;
}

export function demoRecap(from: string, to: string): Recap {
  const lo = dayStartOf(from);
  const hi = dayStartOf(to) + 86_400_000 - 1;
  const days: Recap['days'] = {};
  const projects: Recap['projects'] = {};
  const tools: Record<string, number> = {};
  const models: Record<string, number> = {};
  let sessions = 0;
  for (const b of all()) {
    const s = b.summary;
    let touched = false;
    for (const [d, g] of Object.entries(s.days || {})) {
      if (d < from || d > to) continue;
      touched = true;
      const D = (days[d] ||= { tok: 0, usd: 0, tools: 0, prompts: 0, edits: 0, add: 0, del: 0, active: 0, sessions: 0, projects: {} });
      D.tok += g.tok;
      D.usd += g.usd;
      D.tools += g.tools;
      D.prompts += g.prompts;
      D.edits += g.edits;
      D.add += g.add;
      D.del += g.del;
      D.active += g.active;
      D.sessions++;
      const dp = (D.projects[s.project] ||= { usd: 0, tok: 0 });
      dp.usd += g.usd;
      dp.tok += g.tok;
      const P = (projects[s.project] ||= { usd: 0, tok: 0, sessions: 0, active: 0, add: 0, del: 0 });
      P.usd += g.usd;
      P.tok += g.tok;
      P.active += g.active;
      P.add += g.add;
      P.del += g.del;
    }
    if (!touched) continue;
    sessions++;
    projects[s.project].sessions++;
    for (const [n, c] of s.tools || []) tools[n] = (tools[n] || 0) + c;
    for (const u of b.usage) if (u[0] >= from && u[0] <= to) models[u[1]] = (models[u[1]] || 0) + u[8] + u[9] + u[10] + u[11] + u[12];
  }
  return {
    from: lo,
    to: hi,
    sessions,
    projectOrder: Object.keys(projects),
    days,
    projects,
    tools: Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 10),
    models: Object.fromEntries(Object.entries(models).map(([m, v]) => [m, Math.round(v * 1000) / 1000])),
    modelsWhole: 0,
  };
}

export function demoModelRecap(model: string, from: string, to: string): ModelRecap {
  const out: ModelRecap = { model, from: dayStartOf(from), to: dayStartOf(to) + 86_400_000 - 1, messages: 0, tokens: { in: 0, out: 0, cr: 0, cw: 0 }, cost: { in: 0, out: 0, cr: 0, cw: 0, ws: 0, total: 0 }, days: {}, sessions: [], projects: [], agents: [], whole: 0 };
  const projects = new Map<string, ModelRecap['projects'][number]>();
  const agents = new Map<string, ModelRecap['agents'][number] & { ids: Set<string> }>();
  for (const b of all()) {
    const s = b.summary;
    let mine: ModelRecap['sessions'][number] | null = null;
    for (const u of b.usage) {
      if (u[1] !== model || u[0] < from || u[0] > to) continue;
      const cost = u[8] + u[9] + u[10] + u[11] + u[12];
      const tok = u[4] + u[5] + u[6] + u[7];
      mine ||= { id: s.id, num: s.num, title: s.title, project: s.project, startedAt: s.startedAt, endedAt: s.endedAt, live: !!s.live, archived: !!s.archived, usd: 0, tok: 0, messages: 0, helpersUsd: 0 };
      mine.usd += cost;
      mine.tok += tok;
      mine.messages += u[3];
      if (u[2] !== 'main') mine.helpersUsd += cost;
      out.messages += u[3];
      out.tokens.in += u[4];
      out.tokens.out += u[5];
      out.tokens.cr += u[6];
      out.tokens.cw += u[7];
      out.cost.in += u[8];
      out.cost.out += u[9];
      out.cost.cr += u[10];
      out.cost.cw += u[11];
      out.cost.ws += u[12];
      out.cost.total += cost;
      const d = (out.days[u[0]] ||= { usd: 0, tok: 0, messages: 0 });
      d.usd += cost;
      d.tok += tok;
      d.messages += u[3];
      let a = agents.get(u[2]);
      if (!a) agents.set(u[2], (a = { key: u[2], kind: u[2] === 'main' ? 'main' : u[2].split(':')[0], type: u[2] === 'main' ? 'main' : u[2].slice(u[2].indexOf(':') + 1), usd: 0, tok: 0, messages: 0, sessions: 0, ids: new Set() }));
      a.usd += cost;
      a.tok += tok;
      a.messages += u[3];
      a.ids.add(s.id);
    }
    if (!mine) continue;
    out.sessions.push(mine);
    let p = projects.get(s.project);
    if (!p) projects.set(s.project, (p = { name: s.project, usd: 0, tok: 0, sessions: 0 }));
    p.usd += mine.usd;
    p.tok += mine.tok;
    p.sessions++;
  }
  // rounded like the server's, so the opened total matches the listed one to the cent
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  for (const k of Object.keys(out.cost) as (keyof ModelRecap['cost'])[]) out.cost[k] = r3(out.cost[k]);
  for (const d of Object.values(out.days)) d.usd = r3(d.usd);
  out.sessions.sort((a, b) => b.usd - a.usd);
  out.projects = [...projects.values()].sort((a, b) => b.usd - a.usd);
  out.agents = [...agents.values()].map(({ ids, ...a }) => ({ ...a, sessions: ids.size })).sort((a, b) => b.usd - a.usd);
  return out;
}

