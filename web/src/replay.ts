import type { Detail, Now, OfficeSession, OfficeSub, Seg, Status } from './api';
import { requestAt, requestsOf, rowsOf, segWords, stepsOf, type Request, type Row, type Step } from './panels/history-steps';

/** How quickly a replay goes: each request you made takes about this long to watch, however long it really took. */
export type Pace = 'slow' | 'normal' | 'fast';

export interface Replay {
  detail: Detail;
  t: number;
  playing: boolean;
  pace: Pace;
  /** shown in the room ("Watch in the room"), not only on its History page */
  watching: boolean;
}

export const PACES: Pace[] = ['slow', 'normal', 'fast'];
export const PACE_WORDS: Record<Pace, string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
const PACE_MS: Record<Pace, number> = { slow: 50_000, normal: 25_000, fast: 10_000 };

/** A past session told as a story: its steps, its lanes, the requests you made, and when anything happened. Worked out once per session. */
export interface Story {
  steps: Step[];
  rows: Row[];
  requests: Request[];
  times: number[];
}
const STORIES = new WeakMap<Detail, Story>();
export function storyOf(d: Detail): Story {
  let st = STORIES.get(d);
  if (!st) {
    const steps = stepsOf(d);
    const rows = rowsOf(d, steps);
    st = { steps, rows, requests: requestsOf(d, steps, rows), times: activityTimes(d) };
    STORIES.set(d, st);
  }
  return st;
}

/** How many times faster than real time to play at t: the request going on then takes about the pace's time. */
export function speedAt(d: Detail, t: number, pace: Pace): number {
  const { requests } = storyOf(d);
  const r = requests[requestAt(requests, t)];
  const ms = r && r.workMs > 0 ? r.workMs : Math.max(1, (r ? r.t1 - r.t0 : d.endedAt - d.startedAt) - (r?.waitMs || 0));
  return Math.min(3600, Math.max(1, ms / PACE_MS[pace]));
}

/** One step of the replay clock: on by dt of wall time, over the quiet stretches. */
export function advance(r: Replay, dt: number): Replay {
  const { times } = storyOf(r.detail);
  const t = Math.min(r.detail.endedAt, skipQuiet(times, r.t + dt * speedAt(r.detail, r.t, r.pace)));
  return { ...r, t, playing: t < r.detail.endedAt };
}

// Every moment something started (tool calls, prompts, notifications), sorted.
export function activityTimes(d: Detail): number[] {
  const out: number[] = [];
  for (const segs of Object.values(d.lanes)) for (const s of segs) out.push(s[0]);
  for (const ms of Object.values(d.marks)) for (const m of ms) out.push(m[0]);
  return out.sort((a, b) => a - b);
}

// During replay, jump over stretches where nothing happens (overnight, lunch).
export function skipQuiet(times: number[], t: number, gap = 120_000): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  const next = times[lo];
  if (next === undefined) return t;
  const prev = lo > 0 ? times[lo - 1] : -Infinity;
  return next - t > gap && t - prev > 15_000 ? next - 3_000 : t;
}

function segAt(segs: Seg[] | undefined, t: number): Seg | null {
  if (!segs) return null;
  for (const s of segs) if (s[0] <= t && t <= s[1]) return s;
  return null;
}

// A replayed step in plain words ("Sent a helper to write tests…"), so the tag
// over the person and the captions read like the replay bar does.
function nowOf(seg: Seg | null): Now | null {
  if (!seg) return null;
  const tool = seg[3].split(' ')[0];
  return { tool, short: segWords(seg[3]), cat: seg[2], target: '', desc: '', since: seg[0] };
}

export function contextAt(d: Detail, t: number): number {
  let v = 0;
  for (const [ct, n] of d.context) {
    if (ct <= t) v = n;
    else break;
  }
  return v;
}

// What the office would have looked like at time t of a past session.
export function replaySession(d: Detail, t: number): OfficeSession {
  const main = d.lanes.main || [];
  const seg = segAt(main, t);
  let prevEnd = d.startedAt;
  let next = Infinity;
  for (const s of main) {
    if (s[1] <= t) prevEnd = Math.max(prevEnd, s[1]);
    if (s[0] >= t) {
      next = Math.min(next, s[0]);
      break;
    }
  }
  let status: Status = 'idle';
  if (seg) status = seg[2] === 'ask' ? 'needs-you' : 'working';
  else if (t - prevEnd < 60_000 && next - t < 60_000) status = 'working';
  const subs: OfficeSub[] = [];
  for (const a of d.agents) {
    if (a.kind === 'main' || !a.startedAt || a.startedAt > t || Math.max(a.lastTs, a.startedAt + 2000) < t) continue;
    subs.push({
      id: a.id,
      kind: a.kind,
      type: a.type,
      name: a.name,
      desc: a.desc,
      status: 'running',
      now: nowOf(segAt(d.lanes[a.id], t)),
      runId: a.runId,
      phase: a.phase,
      color: a.color,
      startedAt: a.startedAt,
      toolCalls: a.toolCalls,
    });
  }
  if (subs.length && status === 'idle') status = 'working';
  const ctx = contextAt(d, t);
  const window = d.ctxWindow || 1_000_000;
  const tokens = d.tokens?.main || { in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0 };
  return {
    id: d.id,
    pid: null,
    name: d.project || 'session',
    nameSource: 'replay',
    title: d.title,
    cwd: d.cwd,
    project: d.project,
    branch: d.branch,
    model: d.model,
    status,
    rawStatus: 'replay',
    waitingFor: status === 'needs-you' ? 'asked you' : '',
    statusSince: seg ? seg[0] : prevEnd,
    startedAt: d.startedAt,
    lastActivity: t,
    now: nowOf(seg),
    lastPrompt: '',
    ctx: { tokens: ctx, window, pct: (ctx / window) * 100 },
    tokens,
    cost: d.cost?.main || 0,
    subCost: d.cost?.subs || 0,
    toolCalls: d.toolCalls || 0,
    subsRunning: subs.length,
    subsTotal: d.agents.length - 1,
    subs: subs.slice(0, 40),
    workflows: [],
    headless: false,
    rev: 0,
    version: '',
    replay: true,
  };
}
