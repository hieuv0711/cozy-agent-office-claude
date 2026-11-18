import { useEffect, useRef, useState } from 'react';

export type Status = 'working' | 'needs-you' | 'idle';

export interface Tok {
  in: number;
  out: number;
  cr: number;
  cw5: number;
  cw1: number;
  ws: number;
}

export interface Now {
  tool: string;
  short: string;
  cat: string;
  target: string;
  desc: string;
  since: number;
  // median duration of this kind of call earlier in the session; 0 = unknown
  typicalMs?: number;
}

export interface WorkflowInfo {
  runId: string;
  name: string;
  status: string;
  total: number;
  running: number;
  done: number;
  failed: number;
  phases: Record<string, number>;
  startedAt: number;
  finishedAt: number;
  summary: string;
}

export interface OfficeSub {
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

export interface OfficeSession {
  num?: number; // stable session number (S-014)
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
  tokens: Tok;
  cost: number;
  subCost: number;
  toolCalls: number;
  subsRunning: number;
  subsTotal: number;
  // typical times in this session (median of past ones; 0 = none yet)
  thinkMs?: number;
  helperMs?: number;
  subs: OfficeSub[];
  workflows: WorkflowInfo[];
  headless: boolean;
  rev: number;
  version: string;
  replay?: boolean;
}

export interface Office {
  now: number;
  sessions: OfficeSession[];
  totals: { working: number; needsYou: number; idle: number; bots: number };
}

export interface AgentInfo {
  id: string;
  kind: 'main' | 'subagent' | 'teammate' | 'workflow';
  parent: string | null;
  type: string;
  name: string;
  desc: string;
  status: string | null;
  startedAt: number;
  lastTs: number;
  model: string;
  toolCalls: number;
  errors: number;
  tokens: Tok;
  cost: number;
  now: Now | null;
  result: string;
  resultChars?: number;
  task: string;
  runId: string;
  phase: string;
  color: string;
  ctx: number;
  top: [string, number][];
}

export interface Ev {
  t: number;
  a: string;
  k: string;
  id?: string;
  name?: string;
  short?: string;
  cat?: string;
  target?: string;
  desc?: string;
  end?: number;
  ok?: boolean;
  info?: string;
  text?: string;
  status?: string;
  sub?: string;
  run?: string;
  subType?: string;
  subDesc?: string;
  subName?: string;
  bg?: boolean;
  tail?: string;
  doneAt?: number;
  doneStatus?: string;
  reread?: number;
  result?: { tokens: number; tools: number; ms: number; text: string };
}

// [start, end, category, label, ok(1|0), merged count]
export type Seg = [number, number, string, string, number, number];

export interface FileStat {
  path: string;
  reads: number;
  edits: number;
  added: number;
  removed: number;
  isNew: boolean;
}

export interface Summary {
  num?: number; // stable session number (S-014)
  id: string;
  root?: string;
  file?: string;
  cwd: string;
  project: string;
  branch: string;
  version?: string;
  title: string;
  firstPrompt: string;
  lastPrompt: string;
  lastText?: string;
  startedAt: number;
  endedAt: number;
  model: string;
  models?: string[];
  tokens?: { main: Tok; subs: Tok };
  cost?: { main: number; subs: number; total: number; unknown: boolean };
  costState?: { usd: number } | null;
  toolCalls?: number;
  prompts?: number;
  errors?: number;
  /** the main agent's last finished step failed (older caches don't say) */
  endedFailed?: boolean;
  subagents?: number;
  workflowAgents?: number;
  workflows?: number;
  filesEdited?: number;
  linesAdded?: number;
  linesRemoved?: number;
  prs?: { number: number; url: string; repo: string }[];
  compactions?: number;
  indexed?: boolean;
  live?: boolean;
  archived?: boolean;
  size?: number;
  empty?: boolean;
  days?: Record<string, DayStat>;
  tools?: [string, number][];
  modelUsd?: Record<string, number>;
  // per day, model and agent (Recap's cost by model); the History list leaves it out
  usage?: UsageRow[];
  match?: { text: string; term: string } | null;
}

/** [day, model, agent ("main" or "kind:type"), messages, in, out, cacheRead, cacheWrite, $in, $out, $cacheRead, $cacheWrite, $webSearch] */
export type UsageRow = [string, string, string, number, number, number, number, number, number, number, number, number, number];

export interface DayStat {
  tok: number;
  usd: number;
  tools: number;
  prompts: number;
  edits: number;
  add: number;
  del: number;
  active: number;
}

export interface Detail extends Omit<Summary, 'workflows'> {
  live: boolean;
  agents: AgentInfo[];
  workflows: WorkflowInfo[];
  events: Ev[];
  totalEvents: number;
  window: [number, number];
  lanes: Record<string, Seg[]>;
  /** [time, kind] over the whole session; a prompt also carries its words (from servers since 17 Nov 2026) */
  marks: Record<string, [number, string, string?][]>;
  context: [number, number][];
  ctx: number;
  ctxWindow: number;
  tools: [string, number][];
  files: FileStat[];
  byModel: Record<string, { in: number; out: number; cr: number; cw: number; usd: number; messages: number }>;
  office?: OfficeSession | null;
}

export interface Facet {
  name: string;
  count: number;
}

export interface History {
  total: number;
  hiddenEmpty?: number;
  indexing: { running: boolean; done: number; total: number };
  // scoped: a date filter is on, so tokens and cost count only those days
  totals: { sessions: number; tokens: number; usd: number; scoped?: boolean };
  facets: { projects: Facet[]; models: Facet[]; status: Facet[] };
  // active: minutes of agent work that day; problems: sessions where a step failed
  calendar: Record<string, { sessions: number; usd: number; tok: number; active?: number; problems?: number }>;
  sessions: Summary[];
}

export interface HistoryFilter {
  q: string;
  from: string; // YYYY-MM-DD or ''
  to: string;
  projects: string[];
  models: string[];
  status: string[];
  sort: 'recent' | 'cost' | 'tokens' | 'duration' | 'tools';
  empty: boolean;
  /** only sessions where a step failed */
  problems?: boolean;
}

export const EMPTY_FILTER: HistoryFilter = { q: '', from: '', to: '', projects: [], models: [], status: [], sort: 'recent', empty: false };

export function filterToParams(f: HistoryFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.projects.length) p.set('projects', f.projects.join(','));
  if (f.models.length) p.set('models', f.models.join(','));
  if (f.status.length) p.set('status', f.status.join(','));
  if (f.sort !== 'recent') p.set('sort', f.sort);
  if (f.empty) p.set('empty', '1');
  if (f.problems) p.set('problems', '1');
  return p;
}

export function paramsToFilter(p: URLSearchParams): HistoryFilter {
  const list = (k: string) => (p.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
  const sort = p.get('sort') as HistoryFilter['sort'] | null;
  return {
    q: p.get('q') || '',
    from: /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '') ? (p.get('from') as string) : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '') ? (p.get('to') as string) : '',
    projects: list('projects'),
    models: list('models'),
    status: list('status'),
    sort: sort && ['recent', 'cost', 'tokens', 'duration', 'tools'].includes(sort) ? sort : 'recent',
    empty: p.get('empty') === '1',
    problems: p.get('problems') === '1',
  };
}

export interface Recap {
  from: number;
  to: number;
  sessions: number;
  projectOrder: string[];
  days: Record<string, DayStat & { sessions: number; projects: Record<string, { usd: number; tok: number }> }>;
  projects: Record<string, { usd: number; tok: number; sessions: number; active: number; add: number; del: number }>;
  tools: [string, number][];
  models: Record<string, number>;
  // sessions whose cost by model is counted whole (older caches without per-day rows)
  modelsWhole?: number;
}

/** What one model did in a period (Recap's cost by model, opened). */
export interface ModelRecap {
  model: string;
  from: number;
  to: number;
  messages: number;
  tokens: { in: number; out: number; cr: number; cw: number };
  cost: { in: number; out: number; cr: number; cw: number; ws: number; total: number };
  days: Record<string, { usd: number; tok: number; messages: number }>;
  sessions: { id: string; num?: number; title: string; project: string; startedAt: number; endedAt: number; live: boolean; archived: boolean; usd: number; tok: number; messages: number; helpersUsd: number }[];
  projects: { name: string; usd: number; tok: number; sessions: number }[];
  /** key: "main" or "kind:type"; kind: main | subagent | workflow | teammate */
  agents: { key: string; kind: string; type: string; usd: number; tok: number; messages: number; sessions: number }[];
  whole: number;
}

export function useModelRecap(model: string | null, from: string, to: string) {
  const [data, setData] = useState<ModelRecap | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!model) {
      setData(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setError('');
    getJson<ModelRecap>(`/api/recap/model?model=${encodeURIComponent(model)}&from=${from}&to=${to}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e.message || e)));
    return () => {
      cancelled = true;
    };
  }, [model, from, to]);
  return { data, error };
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

// Live office: server-sent events, with polling as a fallback.
export function useOffice() {
  const [office, setOffice] = useState<Office | null>(null);
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    let stopped = false;
    let poll = 0;
    const load = () =>
      getJson<Office>('/api/office')
        .then((d) => !stopped && setOffice(d))
        .catch(() => undefined);
    load();
    const es = new EventSource('/api/stream');
    es.addEventListener('office', (e) => {
      setConnected(true);
      setOffice(JSON.parse((e as MessageEvent).data));
    });
    es.onerror = () => {
      setConnected(false);
      if (!poll) poll = window.setInterval(load, 3000);
    };
    es.onopen = () => {
      setConnected(true);
      if (poll) {
        window.clearInterval(poll);
        poll = 0;
      }
    };
    return () => {
      stopped = true;
      es.close();
      if (poll) window.clearInterval(poll);
    };
  }, []);
  return { office, connected };
}

// Session detail; refetches (throttled) whenever the session's revision moves.
export function useDetail(id: string | null, rev: number | undefined, query = '') {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const last = useRef(0);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!id) {
      setDetail(null);
      shown.current = null;
      return;
    }
    // made-up sessions (?demo) have no transcript to read: nothing to ask the server for
    if (id.startsWith('demo-')) {
      setDetail(null);
      setError('');
      setLoading(false);
      shown.current = null;
      return;
    }
    let cancelled = false;
    const fresh = shown.current !== id;
    const wait = fresh ? 0 : Math.max(0, 1500 - (Date.now() - last.current));
    if (fresh) {
      setDetail(null);
      setError('');
    }
    const timer = window.setTimeout(() => {
      last.current = Date.now();
      setLoading(true);
      getJson<Detail>(`/api/session/${id}${query ? `?${query}` : ''}`)
        .then((d) => {
          if (cancelled) return;
          shown.current = id;
          setDetail(d);
          setError('');
        })
        .catch((e) => !cancelled && setError(String(e.message || e)))
        .finally(() => !cancelled && setLoading(false));
    }, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, rev, query]);
  return { detail, error, loading };
}

export function useHistory(filter: HistoryFilter) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState('');
  const qs = filterToParams(filter).toString();
  const q = filter.q;
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getJson<History>(`/api/history?limit=600${qs ? `&${qs}` : ''}`)
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError('');
          }
        })
        .catch((e) => !cancelled && setError(String(e.message || e)));
    const t = window.setTimeout(load, q ? 220 : 0);
    const iv = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [qs, q]);
  return { data, error };
}

export function useRecap(from: string, to: string) {
  const [data, setData] = useState<Recap | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getJson<Recap>(`/api/recap?from=${from}&to=${to}`)
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError('');
          }
        })
        .catch((e) => !cancelled && setError(String(e.message || e)));
    load();
    const iv = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [from, to]);
  return { data, error };
}

// Local calendar day helpers (YYYY-MM-DD in this computer's timezone).
export function dayKey(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

// Bring a live session's Terminal tab to the front (macOS). Resolves to '' on
// success, otherwise a sentence saying what went wrong.
export async function focusTerminal(pid: number): Promise<string> {
  try {
    const r = await fetch('/api/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }) });
    if (r.ok) return '';
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    return j?.error || `It did not work (${r.status}).`;
  } catch {
    return 'Agent Office is not reachable.';
  }
}
