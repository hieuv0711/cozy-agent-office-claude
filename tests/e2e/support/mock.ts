import type { Page, Route } from '@playwright/test';

// Made-up office data served to the page instead of this Mac's sessions.
//
// `/api/office` is answered by page.route. The live updates come over
// server-sent events, which page.route can't stream, so the page's
// EventSource is swapped (before any app code runs) for a stand-in the test
// drives: `push()` sends a new office, `fail()` and `recover()` play the
// server going away and coming back.

export type Status = 'working' | 'needs-you' | 'idle';

export interface Sub {
  id: string;
  kind: string;
  type: string;
  name: string;
  desc: string;
  status: string;
  now: Now | null;
  runId: string;
  phase: string;
  color: string;
  startedAt: number;
  toolCalls: number;
}

export interface Now {
  tool: string;
  short: string;
  cat: string;
  target: string;
  desc: string;
  since: number;
  typicalMs?: number;
}

export interface Session {
  num: number;
  id: string;
  pid: number | null;
  name: string;
  nameSource: string;
  title: string;
  cwd: string;
  project: string;
  branch: string;
  model: string;
  status: Status;
  rawStatus: string;
  waitingFor: string;
  statusSince: number;
  startedAt: number;
  lastActivity: number;
  now: Now | null;
  lastPrompt: string;
  ctx: { tokens: number; window: number; pct: number };
  tokens: { in: number; out: number; cr: number; cw5: number; cw1: number; ws: number };
  cost: number;
  subCost: number;
  toolCalls: number;
  subsRunning: number;
  subsTotal: number;
  thinkMs: number;
  helperMs: number;
  subs: Sub[];
  workflows: unknown[];
  headless: boolean;
  rev: number;
  version: string;
}

let counter = 0;
/** A session id shaped like Claude Code's (a UUID), unique within the run. */
export function uuid(): string {
  counter++;
  return `0e2e0000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

export function now(tool: string, cat: string, target = '', sinceSec = 0): Now {
  return { tool, short: tool, cat, target, desc: '', since: Date.now() - sinceSec * 1000, typicalMs: 9000 };
}

export function sub(type: string, status = 'running', n: Now | null = null): Sub {
  return { id: `sub-${uuid()}`, kind: 'subagent', type, name: type, desc: '', status, now: n, runId: '', phase: '', color: '', startedAt: Date.now() - 60_000, toolCalls: 3 };
}

export interface SessionOpts {
  name: string;
  status?: Status;
  /** [tool, category, target]; null or missing: no tool running. */
  tool?: [string, string, string] | null;
  /** Seconds the session has been in its status. */
  since?: number;
  /** Seconds the current tool has been running (default: the status's). */
  toolSince?: number;
  waitingFor?: string;
  subs?: Sub[];
  title?: string;
  project?: string;
  pid?: number | null;
  headless?: boolean;
  id?: string;
}

export function session(o: SessionOpts): Session {
  const status = o.status ?? 'working';
  const since = o.since ?? 20;
  const subs = o.subs ?? [];
  const t = Date.now();
  return {
    num: 900 + counter,
    id: o.id ?? uuid(),
    pid: o.pid ?? null,
    name: o.name,
    nameSource: 'test',
    title: o.title ?? `Task for ${o.name}`,
    cwd: `~/code/${o.project ?? 'test-project'}`,
    project: o.project ?? 'test-project',
    branch: 'main',
    model: 'claude-opus-5-5',
    status,
    rawStatus: status === 'needs-you' ? 'waiting' : status === 'working' ? 'busy' : 'idle',
    waitingFor: o.waitingFor ?? (status === 'needs-you' ? 'permission prompt' : ''),
    statusSince: t - since * 1000,
    startedAt: t - (since + 600) * 1000,
    lastActivity: status === 'idle' ? t - since * 1000 : t - 1000,
    now: o.tool ? now(o.tool[0], o.tool[1], o.tool[2], o.toolSince ?? since) : null,
    lastPrompt: o.title ?? `Task for ${o.name}`,
    ctx: { tokens: 50_000, window: 200_000, pct: 25 },
    tokens: { in: 1000, out: 4000, cr: 300_000, cw5: 9000, cw1: 0, ws: 0 },
    cost: 1.5,
    subCost: 0,
    toolCalls: 30,
    subsRunning: subs.filter((b) => b.status === 'running').length,
    subsTotal: subs.length,
    thinkMs: 30_000,
    helperMs: 60_000,
    subs,
    workflows: [],
    headless: o.headless ?? false,
    rev: 1,
    version: 'test',
  };
}

/** Change a session in place: a new status (from now), a new tool, new helpers. */
export function update(s: Session, patch: Partial<SessionOpts>): Session {
  const t = Date.now();
  const out: Session = { ...s, rev: s.rev + 1 };
  if (patch.status) {
    out.status = patch.status;
    out.rawStatus = patch.status === 'needs-you' ? 'waiting' : patch.status === 'working' ? 'busy' : 'idle';
    out.statusSince = t - (patch.since ?? 0) * 1000;
    out.lastActivity = patch.status === 'idle' ? out.statusSince : t;
    out.waitingFor = patch.waitingFor ?? (patch.status === 'needs-you' ? 'permission prompt' : '');
    if (patch.status === 'idle') out.now = null;
  }
  if (patch.tool !== undefined) out.now = patch.tool ? now(patch.tool[0], patch.tool[1], patch.tool[2], patch.toolSince ?? 0) : null;
  if (patch.subs) {
    out.subs = patch.subs;
    out.subsRunning = patch.subs.filter((b) => b.status === 'running').length;
    out.subsTotal = patch.subs.length;
  }
  if (patch.since !== undefined && !patch.status) {
    out.statusSince = t - patch.since * 1000;
    if (out.status === 'idle') out.lastActivity = out.statusSince;
  }
  return out;
}

export function office(sessions: Session[]) {
  return {
    now: Date.now(),
    sessions,
    totals: {
      working: sessions.filter((s) => s.status === 'working').length,
      needsYou: sessions.filter((s) => s.status === 'needs-you').length,
      idle: sessions.filter((s) => s.status === 'idle').length,
      bots: sessions.reduce((n, s) => n + s.subsRunning, 0),
    },
  };
}

/** Runs in the page before its own scripts: a stand-in EventSource driven by the test. */
function fakeEventSource() {
  const w = window as unknown as Record<string, unknown>;
  const all: FakeES[] = [];
  class FakeES {
    url: string;
    readyState = 0;
    onopen: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    private l: Record<string, ((e: Event) => void)[]> = {};
    constructor(url: string) {
      this.url = url;
      all.push(this);
      setTimeout(() => {
        if (this.readyState === 2) return;
        if (w.__esDown) {
          this.onerror?.(new Event('error'));
          return;
        }
        this.readyState = 1;
        this.onopen?.(new Event('open'));
      }, 20);
    }
    addEventListener(type: string, fn: (e: Event) => void) {
      (this.l[type] ||= []).push(fn);
    }
    removeEventListener(type: string, fn: (e: Event) => void) {
      this.l[type] = (this.l[type] || []).filter((f) => f !== fn);
    }
    emit(data: unknown) {
      const e = new MessageEvent('office', { data: JSON.stringify(data) });
      (this.l.office || []).forEach((f) => f(e));
    }
    close() {
      this.readyState = 2;
    }
  }
  w.EventSource = FakeES;
  w.__pushOffice = (o: unknown) => all.forEach((es) => es.readyState === 1 && es.emit(o));
  w.__esFail = () => {
    w.__esDown = true;
    all.forEach((es) => {
      if (es.readyState === 2) return;
      es.readyState = 0;
      es.onerror?.(new Event('error'));
    });
  };
  w.__esRecover = (o: unknown) => {
    w.__esDown = false;
    all.forEach((es) => {
      if (es.readyState === 2) return;
      es.readyState = 1;
      es.onopen?.(new Event('open'));
      if (o) es.emit(o);
    });
  };
}

/** Serves made-up sessions to one page and lets the test change them. */
export class MockOffice {
  sessions: Session[];
  /** While down, every /api/office request fails like an unreachable server. */
  down = false;
  constructor(
    private page: Page,
    sessions: Session[],
  ) {
    this.sessions = sessions;
  }

  async install() {
    await this.page.addInitScript(fakeEventSource);
    await this.page.route('**/api/office', (route: Route) => (this.down ? route.abort('connectionrefused') : route.fulfill({ json: office(this.sessions), headers: { 'Cache-Control': 'no-store' } })));
    // the made-up sessions have no transcript: their detail is "not found" (quietly)
    await this.page.route('**/api/session/**', (route: Route) => route.fulfill({ status: 404, body: 'session not found' }));
    return this;
  }

  get(name: string): Session {
    const s = this.sessions.find((x) => x.name === name);
    if (!s) throw new Error(`no mocked session ${name}`);
    return s;
  }

  /** Change sessions by name and send the new office to the page. */
  async set(changes: Record<string, Partial<SessionOpts>>) {
    this.sessions = this.sessions.map((s) => (changes[s.name] ? update(s, changes[s.name]) : s));
    await this.push();
  }

  async push(sessions?: Session[]) {
    if (sessions) this.sessions = sessions;
    await this.page.evaluate((o) => (window as unknown as { __pushOffice: (o: unknown) => void }).__pushOffice(o), office(this.sessions));
  }

  async fail() {
    this.down = true;
    await this.page.evaluate(() => (window as unknown as { __esFail: () => void }).__esFail());
  }

  async recover() {
    this.down = false;
    await this.page.evaluate((o) => (window as unknown as { __esRecover: (o: unknown) => void }).__esRecover(o), office(this.sessions));
  }
}
