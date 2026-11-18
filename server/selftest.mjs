// npm run selftest
// Parses recent sessions and compares our numbers with Claude Code's own
// cost-state records (written by Claude Code itself, covering every agent in
// the process). Also shows what a per-line sum would have reported, and checks
// that the per-day, per-model usage rows behind Recap's "cost by model" add up
// to the same totals as everything else. Exits 1 when a check fails.
import { Session, addTok } from './model.mjs';
import { costOf, costParts } from './pricing.mjs';
import { dayStart, Store } from './store.mjs';

const LIMIT = Number(process.argv[2] || 12);
const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
};
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol + Math.abs(b) * 1e-6;

// ---------- pricing: the parts add up to the price ----------
{
  const models = ['claude-opus-5-5', 'claude-fable-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-1', 'claude-3-5-haiku-20241022', 'us.anthropic.claude-sonnet-4-5-v1:0', 'no-such-model'];
  const usages = [
    { in: 1200, out: 5400, cr: 820_000, cw5: 21_000, cw1: 0, ws: 0 },
    { in: 30_000, out: 900, cr: 60_000, cw5: 4_000, cw1: 12_000, ws: 2 },
    { in: 10, out: 10, cr: 10, cw5: 0, cw1: 0, ws: 0 },
  ];
  for (const m of models)
    for (const u of usages)
      for (const speed of ['standard', 'fast']) {
        const whole = costOf(m, u, speed);
        const parts = costParts(m, u, speed);
        check(near(parts.usd, whole.usd, 1e-9), `costParts(${m}, ${speed}) adds up to ${parts.usd}, costOf says ${whole.usd}`);
        check(near(parts.in + parts.out + parts.cr + parts.cw + parts.ws, parts.usd, 1e-9), `costParts(${m}) parts add up`);
        check(parts.known === whole.known, `costParts(${m}) agrees on knowing the model`);
      }
  // Haiku 5.5 bills prompts over 100K tokens at 5x, and fast mode doubles
  const big = { in: 90_000, out: 1000, cr: 20_000, cw5: 0, cw1: 0, ws: 0 };
  const small = { in: 50_000, out: 1000, cr: 20_000, cw5: 0, cw1: 0, ws: 0 };
  check(near(costParts('claude-haiku-5-5', big).in / big.in, 5 * (costParts('claude-haiku-5-5', small).in / small.in), 1e-12), 'Haiku 5.5 long prompts cost 5x');
  check(near(costParts('claude-opus-5-5', small, 'fast').usd, 2 * costParts('claude-opus-5-5', small).usd, 1e-9), 'fast mode costs 2x');
}

// ---------- recent sessions: Claude Code's own records, and the usage rows ----------
const store = new Store();
await store.scanFiles(true);
const files = [...store.files.values()].sort((a, b) => b.mtimeMs - a.mtimeMs).filter((f) => f.size < 400e6);

const rows = [];
const summaries = [];
let parsedBytes = 0;
const t0 = Date.now();
for (const f of files) {
  if (rows.length >= LIMIT && summaries.length >= LIMIT) break;
  const s = new Session({ id: f.id, file: f.file, root: f.root });
  await s.refresh({ final: true });
  parsedBytes += f.size;
  const sum = s.summary();
  summaries.push(sum);

  // the usage rows hold every message once: same tokens, same price, same days
  const rowTok = { in: 0, out: 0, cr: 0, cw: 0 };
  let rowUsd = 0;
  const perDay = {};
  for (const u of sum.usage) {
    rowTok.in += u[4];
    rowTok.out += u[5];
    rowTok.cr += u[6];
    rowTok.cw += u[7];
    const usd = u[8] + u[9] + u[10] + u[11] + u[12];
    rowUsd += usd;
    perDay[u[0]] = (perDay[u[0]] || 0) + usd;
  }
  const tok = { in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0 };
  addTok(tok, sum.tokens.main);
  addTok(tok, sum.tokens.subs);
  const id = f.id.slice(0, 8);
  check(rowTok.in === tok.in && rowTok.out === tok.out && rowTok.cr === tok.cr && rowTok.cw === tok.cw5 + tok.cw1, `${id}: usage rows hold the session's tokens`);
  check(near(rowUsd, sum.cost.total, 0.002 * Math.max(1, sum.usage.length)), `${id}: usage rows cost ${rowUsd.toFixed(4)}, the session ${sum.cost.total.toFixed(4)}`);
  for (const [d, g] of Object.entries(sum.days || {})) check(near(perDay[d] || 0, g.usd, 0.002 * Math.max(1, sum.usage.length)), `${id}: ${d} costs ${(perDay[d] || 0).toFixed(4)} in usage rows, ${g.usd} in days`);
  for (const u of sum.usage) check(u[2] === 'main' || /^(subagent|workflow|teammate):.+/.test(u[2]), `${id}: agent key ${u[2]}`);
  // ending on a failure needs a failed step, and it is the main agent's last finished one
  check(typeof sum.endedFailed === 'boolean', `${id}: endedFailed is a yes or no`);
  if (sum.endedFailed) check(sum.errors > 0, `${id}: ended on a failure without any failed step`);
  const lastMain = s.main.events.filter((e) => (e.k === 'tool' && e.end) || e.k === 'error').sort((a, b) => a.t - b.t).pop();
  check(sum.endedFailed === (!!lastMain && (lastMain.k === 'error' || lastMain.ok === false)), `${id}: endedFailed follows the main agent's last step`);

  if (!s.costState || rows.length >= LIMIT) continue;
  const naive = { in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0 };
  let naiveUsd = 0;
  for (const a of [s.main, ...s.subs.values()]) {
    addTok(naive, a.naive);
    naiveUsd += costOf(a.model || s.main.model, a.naive, 'standard').usd;
  }
  const dedupOut = sum.tokens.main.out + sum.tokens.subs.out;
  const continued = s.main.lastTs - (s.costState.at || 0) > 60_000;
  rows.push({
    session: id,
    title: s.title.slice(0, 34),
    agents: 1 + s.subs.size,
    'ours $': +sum.cost.total.toFixed(2),
    'claude $': +s.costState.usd.toFixed(2),
    'diff %': +(((sum.cost.total - s.costState.usd) / (s.costState.usd || 1)) * 100).toFixed(1),
    'per-line $': +naiveUsd.toFixed(2),
    'out tok x': +(naive.out / (dedupOut || 1)).toFixed(2),
    'kept going': continued ? 'yes' : '',
  });
}
console.table(rows);
console.log(`parsed ${(parsedBytes / 1e6).toFixed(0)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log("'kept going' = the transcript continued after Claude Code wrote its cost record, so ours should be higher.");
console.log("'per-line $' / 'out tok x' = what summing every usage line (no dedupe by message id) would report.");

// ---------- Recap: cost by model, and one model opened, agree ----------
{
  const fake = Object.create(Store.prototype);
  fake.allSummaries = async () => summaries;
  const days = [...new Set(summaries.flatMap((s) => Object.keys(s.days || {})))].sort();
  if (days.length) {
    const windows = [
      [days[0], days[days.length - 1]],
      [days[days.length - 1], days[days.length - 1]],
    ];
    for (const [a, b] of windows) {
      const from = dayStart(a);
      const to = dayStart(b) + 86_400_000 - 1;
      const recap = await fake.recap({ from, to });
      for (const [model, usd] of Object.entries(recap.models)) {
        const m = await fake.modelRecap({ model, from, to });
        check(near(m.cost.total, usd, 0.01), `${a}..${b} ${model}: opened ${m.cost.total}, listed ${usd}`);
        check(near(m.cost.in + m.cost.out + m.cost.cr + m.cost.cw + m.cost.ws, m.cost.total, 0.01), `${model}: its parts add up`);
        check(near(Object.values(m.days).reduce((n, d) => n + d.usd, 0), m.cost.total, 0.01), `${model}: its days add up`);
        check(near(m.agents.reduce((n, x) => n + x.usd, 0), m.cost.total, 0.01), `${model}: main agents and helpers add up`);
        check(near(m.projects.reduce((n, x) => n + x.usd, 0), m.cost.total, 0.01), `${model}: its projects add up`);
        check(m.sessions.every((s) => s.usd > 0 || s.messages > 0), `${model}: every session listed used it`);
        check(Object.keys(m.days).every((d) => d >= a && d <= b), `${model}: no day outside ${a}..${b}`);
      }
    }
    console.log(`checked cost by model for ${summaries.length} sessions over ${days.length} days`);
  }
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed:`);
  for (const f of failures.slice(0, 40)) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nall checks passed');
