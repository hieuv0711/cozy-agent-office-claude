import type { Now, Office, OfficeSession, OfficeSub } from '../api';
import { hash } from '../theme';

// `?demo`: made-up sessions, one in every state, for trying the themes,
// screenshots and streams without showing real projects. Four of them go
// through a little working day on a loop (editing, a long command, a search,
// planning, thinking, then finishing the turn), so every theme's routines
// show within a minute or so.

const SPECIES = ['octopus', 'puffer', 'axolotl', 'seahorse', 'jelly'];
/** An id that makes the wanted species (the tank picks species from a hash of the id). */
function idFor(key: string, species: string) {
  for (let k = 0; k < 500; k++) {
    const id = `demo-${key}-${k}`;
    if (SPECIES[hash(id) % SPECIES.length] === species) return id;
  }
  return `demo-${key}`;
}

const T0 = Date.now();
const ago = (min: number) => T0 - min * 60_000;
const tok = { in: 1200, out: 5400, cr: 820000, cw5: 21000, cw1: 0, ws: 0 };

function now(tool: string, cat: string, target: string, sinceMin = 0.3): Now {
  return { tool, short: tool, cat, target, desc: '', since: ago(sinceMin), typicalMs: 9000 };
}

function sub(id: string, type: string, desc: string, n: Now | null, status = 'running'): OfficeSub {
  return { id, kind: 'subagent', type, name: '', desc, status, now: n, runId: '', phase: '', color: '', startedAt: ago(2), toolCalls: 6 };
}

interface Spec {
  key: string;
  species: string;
  name: string;
  project: string;
  title: string;
  status: OfficeSession['status'];
  now?: Now;
  waitingFor?: string;
  sinceMin: number;
  cost: number;
  subs?: OfficeSub[];
  team?: boolean;
}

const SPECS: Spec[] = [
  { key: 'sync', species: 'seahorse', name: 'notes-app-3f', project: 'notes-app', title: 'Fix sync conflict on reconnect', status: 'needs-you', waitingFor: 'permission prompt', now: now('Bash', 'run', 'git push --force-with-lease'), sinceMin: 1.5, cost: 3.2 },
  {
    key: 'orders',
    species: 'octopus',
    name: 'web-shop-81',
    project: 'web-shop',
    title: 'Add order history page',
    status: 'working',
    now: now('Edit', 'edit', 'src/orders/OrderList.tsx'),
    sinceMin: 4,
    cost: 7.9,
    subs: [sub('demo-sub-1', 'Explore', 'Find where orders are loaded', now('Grep', 'read', 'useOrders')), sub('demo-sub-2', 'Plan', 'Plan the order history page', null)],
  },
  { key: 'upload', species: 'puffer', name: 'photo-api-c2', project: 'photo-api', title: 'Rate limit the upload route', status: 'working', now: now('Bash', 'run', 'npm test -- upload'), sinceMin: 2, cost: 4.1 },
  { key: 'vite', species: 'jelly', name: 'docs-site-5a', project: 'docs-site', title: 'Upgrade to Vite 7', status: 'working', now: now('WebSearch', 'web', 'vite 7 migration guide'), sinceMin: 1, cost: 2.6, team: true },
  { key: 'schema', species: 'octopus', name: 'billing-07', project: 'billing', title: 'Explain the billing schema', status: 'working', now: now('Read', 'read', 'db/schema.sql'), sinceMin: 0.5, cost: 1.4 },
  { key: 'tests', species: 'axolotl', name: 'photo-api-9d', project: 'photo-api', title: 'Rate limit tests', status: 'idle', sinceMin: 12, cost: 2.2 },
  { key: 'settings', species: 'puffer', name: 'notes-app-e4', project: 'notes-app', title: 'Tidy the settings screen', status: 'idle', sinceMin: 41, cost: 0.9 },
];

function session(sp: Spec, i: number): OfficeSession {
  const id = idFor(sp.key, sp.species);
  const subs = sp.subs || [];
  return {
    num: 140 + i,
    id,
    pid: null,
    name: sp.name,
    nameSource: 'demo',
    title: sp.title,
    cwd: `~/code/${sp.project}`,
    project: sp.project,
    branch: 'main',
    model: 'claude-opus-5-5',
    status: sp.status,
    rawStatus: sp.status === 'needs-you' ? 'waiting' : sp.status === 'working' ? 'busy' : 'idle',
    waitingFor: sp.waitingFor || '',
    statusSince: ago(sp.sinceMin),
    startedAt: ago(sp.sinceMin + 30),
    lastActivity: ago(sp.status === 'idle' ? sp.sinceMin : 0.1),
    now: sp.now || null,
    lastPrompt: sp.title,
    ctx: { tokens: 84000, window: 200000, pct: 42 },
    tokens: tok,
    cost: sp.cost,
    subCost: 0,
    toolCalls: 40 + i * 7,
    subsRunning: subs.filter((s) => s.status === 'running').length,
    subsTotal: subs.length,
    thinkMs: 30000,
    helperMs: 60000,
    subs,
    workflows: sp.team
      ? [{ runId: 'demo-run', name: 'docs review', status: 'running', total: 5, running: 3, done: 2, failed: 0, phases: {}, startedAt: ago(3), finishedAt: 0, summary: '' }]
      : [],
    headless: false,
    rev: 1,
    version: 'demo',
  };
}

type Step = { sec: number; status: OfficeSession['status']; now?: [string, string, string] };
/** The loops, by session key: what they do, for how long; and where in the loop each starts (seconds). */
const LOOPS: Record<string, { offset: number; steps: Step[] }> = {
  orders: {
    offset: 0,
    steps: [
      { sec: 18, status: 'working', now: ['Edit', 'edit', 'src/orders/OrderList.tsx'] },
      { sec: 14, status: 'working', now: ['Bash', 'run', 'npm run build'] },
      { sec: 10, status: 'working' },
      { sec: 32, status: 'idle' },
    ],
  },
  upload: {
    offset: 9,
    steps: [
      { sec: 26, status: 'working', now: ['Bash', 'run', 'npm test -- upload'] },
      { sec: 10, status: 'working', now: ['Read', 'read', 'src/routes/upload.ts'] },
      { sec: 8, status: 'working' },
      { sec: 30, status: 'idle' },
    ],
  },
  vite: {
    offset: 17,
    steps: [
      { sec: 16, status: 'working', now: ['WebSearch', 'web', 'vite 7 migration guide'] },
      { sec: 8, status: 'working', now: ['TodoWrite', 'plan', '4 steps'] },
      { sec: 12, status: 'working' },
      { sec: 10, status: 'working', now: ['Edit', 'edit', 'vite.config.ts'] },
      { sec: 30, status: 'idle' },
    ],
  },
  schema: {
    offset: 25,
    steps: [
      { sec: 12, status: 'working', now: ['Read', 'read', 'db/schema.sql'] },
      { sec: 14, status: 'working', now: ['Edit', 'edit', 'docs/billing.md'] },
      { sec: 12, status: 'working', now: ['Bash', 'run', 'npm run lint'] },
      { sec: 34, status: 'idle' },
    ],
  },
};

/** Where each looping session is now: its step, and when that step began. */
function stepOf(key: string, t: number): { i: number; at: number } | null {
  const loop = LOOPS[key];
  if (!loop) return null;
  const total = loop.steps.reduce((a, st) => a + st.sec, 0);
  const u = (((t + loop.offset) % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < loop.steps.length; i++) {
    if (u < acc + loop.steps[i].sec) return { i, at: t - (u - acc) };
    acc += loop.steps[i].sec;
  }
  return { i: 0, at: t };
}

let cached: Office | null = null;
let cachedKey = '';

export function demoOffice(): Office {
  const t = (Date.now() - T0) / 1000;
  const steps = SPECS.map((sp) => stepOf(sp.key, t));
  const key = steps.map((st) => (st ? st.i : '-')).join(',');
  if (cached && key === cachedKey) return cached;
  cachedKey = key;
  const sessions = SPECS.map((sp, i) => {
    const st = steps[i];
    if (!st) return session(sp, i);
    const step = LOOPS[sp.key].steps[st.i];
    const startedMs = T0 + st.at * 1000;
    const n = step.now ? { ...now(step.now[0], step.now[1], step.now[2]), since: startedMs } : undefined;
    const base = session({ ...sp, status: step.status, now: step.status === 'working' ? n : undefined }, i);
    return { ...base, statusSince: startedMs, lastActivity: step.status === 'idle' ? startedMs : Date.now() };
  });
  cached = {
    now: T0,
    sessions,
    totals: {
      working: sessions.filter((s) => s.status === 'working').length,
      needsYou: sessions.filter((s) => s.status === 'needs-you').length,
      idle: sessions.filter((s) => s.status === 'idle').length,
      bots: sessions.reduce((n, s) => n + s.subsRunning, 0),
    },
  };
  return cached;
}
