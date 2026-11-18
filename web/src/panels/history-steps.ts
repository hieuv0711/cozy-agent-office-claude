import type { AgentInfo, Detail, Ev, Seg } from '../api';
import { helperKind } from '../lib/session';

// How a session went, step by step: what each step was in plain words, the
// kinds of work drawn as lanes, the thinking in between, the turns, what
// failed and why, and a time axis that squeezes the quiet stretches.
// Pure functions: the replay chart, the step list and the session page read them.

// ---------- kinds of work ----------

/** Lane tracks: each kind of work keeps its own row, so the colours never have to be told apart alone. */
export type Track = 'look' | 'edit' | 'run';
export type Kind = 'read' | 'web' | 'other' | 'edit' | 'run' | 'agent' | 'ask';

export function kindOf(cat: string | undefined): Kind {
  switch (cat) {
    case 'read':
    case 'web':
    case 'edit':
    case 'run':
    case 'agent':
    case 'ask':
      return cat;
    default:
      return 'other';
  }
}

export function trackOf(k: Kind): Track | 'all' {
  if (k === 'ask') return 'all';
  if (k === 'edit') return 'edit';
  if (k === 'run' || k === 'agent') return 'run';
  return 'look';
}

export const KIND_WORDS: Record<Kind, string> = {
  read: 'Read and search',
  web: 'Web',
  other: 'Other tools',
  edit: 'Edits',
  run: 'Commands',
  agent: 'Helpers',
  ask: 'Waiting for you',
};

const TAGS: Record<Kind, string> = { read: 'READ', web: 'WEB', other: 'TOOL', edit: 'EDIT', run: 'RUN', agent: 'HELPER', ask: 'ASK' };
export const tagOf = (k: Kind) => TAGS[k];

// ---------- plain words ----------

const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
const clipText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** What a tool call did, as a short sentence: "Read upload.ts", "Ran npm test". */
export function toolWords(name: string, target = '', desc = '', info = ''): string {
  const t = target.trim();
  const short = name.replace(/^mcp__.+?__/, '');
  switch (name) {
    case 'Read':
    case 'NotebookRead':
      return t ? `Read ${base(t)}` : 'Read a file';
    case 'Grep':
      return t ? `Searched the code for ${clipText(t, 70)}` : 'Searched the code';
    case 'Glob':
      return t ? `Looked for files like ${clipText(t, 60)}` : 'Looked for files';
    case 'LS':
      return t ? `Listed ${base(t)}` : 'Listed a folder';
    case 'Edit':
    case 'MultiEdit':
      return t ? `Edited ${base(t)}` : 'Edited a file';
    case 'NotebookEdit':
      return t ? `Edited the notebook ${base(t)}` : 'Edited a notebook';
    case 'Write':
      return `${/^new file/.test(info) ? 'Created' : 'Wrote'} ${t ? base(t) : 'a file'}`;
    case 'Bash':
      return desc ? `Ran a command: ${clipText(desc, 80)}` : t ? `Ran ${clipText(t, 80)}` : 'Ran a command';
    case 'BashOutput':
    case 'TaskOutput':
      return 'Checked on a background command';
    case 'KillShell':
    case 'KillBash':
    case 'TaskStop':
      return 'Stopped a background command';
    case 'Monitor':
      return 'Watched a command run';
    case 'WebSearch':
      return t ? `Searched the web for “${clipText(t, 70)}”` : 'Searched the web';
    case 'WebFetch':
      return t ? `Read the page ${clipText(t.replace(/^https?:\/\//, ''), 70)}` : 'Read a web page';
    case 'Agent':
    case 'Task': {
      const [type, ...rest] = t.split(': ');
      const what = rest.join(': ');
      const kind = helperKind(type || undefined).word.toLowerCase();
      return `Sent ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}${what ? ` to ${clipText(what.charAt(0).toLowerCase() + what.slice(1), 80)}` : ''}`;
    }
    case 'Workflow':
      return t ? `Started the workflow ${clipText(t, 60)}` : 'Started a workflow';
    case 'SendMessage':
      return 'Sent a message to a helper';
    case 'TeamCreate':
      return 'Put together a team of helpers';
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':
      return 'Updated its to-do list';
    case 'AskUserQuestion':
      return 'Asked you a question';
    case 'ExitPlanMode':
      return 'Showed you its plan';
    case 'EnterPlanMode':
      return 'Started planning';
    case 'Skill':
      return t ? `Used the ${clipText(t, 40)} skill` : 'Used a skill';
    case 'ToolSearch':
      return 'Looked up which tools to use';
    default: {
      const server = /^mcp__(.+?)__/.exec(name)?.[1];
      if (server) return `Used ${short} (${server.replace(/[_-]+/g, ' ')})${t ? `: ${clipText(t, 60)}` : ''}`;
      return `${short}${t ? ` ${clipText(t, 70)}` : ''}`;
    }
  }
}

/** A lane segment's label is "Tool target"; turn it back into words. */
export function segWords(label: string): string {
  const i = label.indexOf(' ');
  return i < 0 ? toolWords(label) : toolWords(label.slice(0, i), label.slice(i + 1));
}

// ---------- steps ----------

export type StepKind = 'prompt' | 'tool' | 'said' | 'turn' | 'compact' | 'interrupt' | 'command' | 'notify' | 'helper' | 'helper-end' | 'error';

export interface Step {
  t: number;
  end?: number;
  agent: string;
  kind: StepKind;
  /** for tool steps */
  cat?: string;
  text: string;
  /** the words quoted after the sentence (what you asked, what it said) */
  quote?: string;
  ok?: boolean;
  /** why it failed, in the tool's own words */
  reason?: string;
}

const LOOKUP_KINDS = new Set(['prompt', 'text', 'compact', 'interrupt', 'command', 'notify', 'task', 'error', 'tool']);

/** The name a helper goes by in words: "Explore", "review-loop". */
/** A helper's own name when it has one, else its kind in words ("Explorer", "Helper"). */
export function helperName(a: AgentInfo | undefined): string {
  if (!a) return 'A helper';
  return a.name || helperKind(a.type === 'agent' ? undefined : a.type).word;
}

/** What that kind of helper does, for a tooltip. */
export function helperHint(a: AgentInfo | undefined): string {
  return helperKind(a && a.type !== 'agent' ? a.type : undefined).hint;
}

function oneLine(s: string | undefined, n = 220): string {
  return clipText(String(s || '').replace(/\s+/g, ' ').trim(), n);
}

/**
 * Every step of the session, oldest first. Events cover the newest few
 * thousand; anything older is filled in from the lanes (tool calls, merged)
 * and marks (prompts), which cover the whole session.
 */
export function stepsOf(d: Detail): Step[] {
  const agents = new Map(d.agents.map((a) => [a.id, a]));
  const evs = d.events.filter((e) => LOOKUP_KINDS.has(e.k)).slice().sort((a, b) => a.t - b.t);
  const oldest = evs.length && (d.totalEvents || 0) > d.events.length ? evs[0].t : -Infinity;
  const out: Step[] = [];
  // older than the events: from the lanes and marks
  if (oldest > -Infinity) {
    for (const [id, segs] of Object.entries(d.lanes || {})) {
      for (const s of segs) {
        if (s[0] >= oldest) break;
        out.push({ t: s[0], end: s[1], agent: id, kind: 'tool', cat: s[2], text: s[5] > 1 ? `${segWords(s[3])} and ${s[5] - 1} more like it` : segWords(s[3]), ok: s[4] !== 0 });
      }
    }
    for (const [t, k, words] of d.marks?.main || []) {
      if (t >= oldest) break;
      if (k === 'prompt') out.push(words ? { t, agent: 'main', kind: 'prompt', text: 'You asked', quote: oneLine(words, 280) } : { t, agent: 'main', kind: 'prompt', text: 'You asked something' });
      else if (k === 'compact') out.push({ t, agent: 'main', kind: 'compact', text: 'Its memory was compacted to make room' });
      else if (k === 'interrupt') out.push({ t, agent: 'main', kind: 'interrupt', text: 'You stopped it' });
    }
  }
  for (const e of evs) {
    const s = stepOfEvent(e, agents);
    if (s) out.push(s);
  }
  // helpers starting and finishing
  for (const a of d.agents) {
    if (a.kind === 'main' || !a.startedAt) continue;
    if (!out.some((s) => s.agent === a.id && s.kind === 'helper')) out.push({ t: a.startedAt, agent: a.id, kind: 'helper', text: `${helperName(a)} started`, quote: oneLine(a.desc || a.task, 160) || undefined });
    if (a.status === 'done' || a.status === 'failed' || a.status === 'stopped') {
      const done = a.status === 'done';
      out.push({
        t: Math.max(a.lastTs, a.startedAt),
        agent: a.id,
        kind: 'helper-end',
        text: `${helperName(a)} ${done ? 'finished' : a.status === 'failed' ? 'failed' : 'stopped'}`,
        quote: done ? oneLine(a.result, 180) || undefined : undefined,
        ok: a.status !== 'failed',
      });
    }
  }
  out.sort((a, b) => a.t - b.t || rank(a) - rank(b));
  return withTurnEnds(out, d);
}

const ORDER: Partial<Record<StepKind, number>> = { prompt: 0, helper: 1, tool: 2, said: 3, 'helper-end': 4, turn: 5 };
const rank = (s: Step) => ORDER[s.kind] ?? 2;

function stepOfEvent(e: Ev, agents: Map<string, AgentInfo>): Step | null {
  const a = e.a || 'main';
  switch (e.k) {
    case 'prompt':
      return a === 'main' ? { t: e.t, agent: a, kind: 'prompt', text: 'You asked', quote: oneLine(e.text, 280) } : { t: e.t, agent: a, kind: 'prompt', text: 'It was asked', quote: oneLine(e.text, 200) };
    case 'task':
      return { t: e.t, agent: a, kind: 'helper', text: `${helperName(agents.get(a))} started`, quote: oneLine(e.text, 160) };
    case 'text':
      return { t: e.t, agent: a, kind: 'said', text: 'Said', quote: oneLine(e.text, 240) };
    case 'compact':
      return { t: e.t, agent: a, kind: 'compact', text: 'Its memory was compacted to make room' };
    case 'interrupt':
      return { t: e.t, agent: a, kind: 'interrupt', text: 'You stopped it' };
    case 'command':
      return { t: e.t, agent: a, kind: 'command', text: 'You ran', quote: oneLine(e.text, 120) };
    case 'notify': {
      const st = (e.status || '').toLowerCase();
      const failed = /fail|error|kill/.test(st);
      return { t: e.t, agent: a, kind: 'notify', text: `A background task ${failed ? 'failed' : st ? `${st.replace(/_/g, ' ')}` : 'finished'}`, quote: oneLine(e.text, 180) || undefined, ok: !failed };
    }
    case 'error':
      return { t: e.t, agent: a, kind: 'error', text: 'Hit an error', reason: oneLine(e.text, 200) || undefined, ok: false };
    case 'tool': {
      const ok = e.ok !== false;
      return {
        t: e.t,
        end: e.end,
        agent: a,
        kind: 'tool',
        cat: e.cat,
        text: toolWords(e.name || e.short || '?', e.target || '', e.desc || '', e.info || ''),
        ok,
        reason: ok ? undefined : oneLine(e.info, 220) || 'It reported an error.',
      };
    }
    default:
      return null;
  }
}

/**
 * A turn ends when the agent stops and hands back to you: the last thing it
 * did before your next prompt (and, once the session is over, its last step).
 */
function withTurnEnds(steps: Step[], d: Detail): Step[] {
  const main = steps.filter((s) => s.agent === 'main');
  const out = steps.slice();
  const prompts = main.filter((s) => s.kind === 'prompt').map((s) => s.t);
  const cuts = [...prompts.slice(1), d.live ? null : Infinity];
  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    if (cut == null) continue;
    const from = prompts[i] ?? -Infinity;
    let last: Step | null = null;
    for (const s of main) if (s.t > from && s.t < cut && s.kind !== 'prompt') last = !last || (s.end ?? s.t) >= (last.end ?? last.t) ? s : last;
    if (!last) continue;
    const t = last.end ?? last.t;
    out.push({ t, agent: 'main', kind: 'turn', text: 'Finished its turn' });
  }
  return out.sort((a, b) => a.t - b.t || rank(a) - rank(b));
}

export const turnEnds = (steps: Step[]) => steps.filter((s) => s.kind === 'turn').map((s) => s.t);

/** Steps that went wrong: failed tool calls, errors, failed helpers and tasks. */
export function failuresOf(steps: Step[]): Step[] {
  return steps.filter((s) => s.ok === false);
}

// ---------- lanes, thinking, and the squeezed time axis ----------

export interface Row {
  id: string;
  label: string;
  sub: string;
  /** what this kind of helper does, for the label's tooltip */
  hint?: string;
  main: boolean;
  /** helpers folded into this row */
  folded?: number;
  blocks: Block[];
  think: [number, number][];
}

export interface Block {
  s: number;
  e: number;
  kind: Kind;
  label: string;
  ok: boolean;
  count: number;
}

const MAX_HELPER_ROWS = 9;
/** Within a turn, a pause up to this long between steps counts as thinking. */
const THINK_MAX = 5 * 60_000;

export function rowsOf(d: Detail, steps: Step[]): Row[] {
  const helpers = d.agents.filter((a) => a.kind !== 'main').sort((a, b) => a.startedAt - b.startedAt);
  const rows: Row[] = [];
  const blocksOf = (segs: Seg[] | undefined): Block[] => (segs || []).map((s) => ({ s: s[0], e: Math.max(s[1], s[0]), kind: kindOf(s[2]), label: s[3], ok: s[4] !== 0, count: s[5] || 1 }));
  rows.push({ id: 'main', label: 'Main agent', sub: d.project, main: true, blocks: blocksOf(d.lanes?.main), think: [] });
  const shown = helpers.length > MAX_HELPER_ROWS ? helpers.slice(0, MAX_HELPER_ROWS - 1) : helpers;
  // two helpers of one kind are told apart by number: "Explorer", "Explorer 2"
  const seen = new Map<string, number>();
  for (const a of shown) {
    const name = helperName(a);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    rows.push({ id: a.id, label: n > 1 ? `${name} ${n}` : name, sub: oneLine(a.desc || a.task, 60), hint: helperHint(a), main: false, blocks: blocksOf(d.lanes?.[a.id]), think: [] });
  }
  const rest = helpers.slice(shown.length);
  if (rest.length) {
    const blocks = rest.flatMap((a) => blocksOf(d.lanes?.[a.id])).sort((x, y) => x.s - y.s);
    rows.push({ id: 'rest', label: `${rest.length} more helpers`, sub: 'drawn together', main: false, folded: rest.length, blocks, think: [] });
  }
  // thinking: the pauses inside a turn, between one step and the next
  const turns = turnSpans(steps, d);
  for (const r of rows) {
    if (r.id === 'rest') continue;
    const mine = steps.filter((s) => s.agent === r.id && (s.kind === 'tool' || s.kind === 'said' || s.kind === 'prompt' || s.kind === 'helper'));
    const marks: [number, number][] = mine.map((s) => [s.t, s.end ?? s.t]);
    for (const b of r.blocks) marks.push([b.s, b.e]);
    marks.sort((x, y) => x[0] - y[0]);
    const spans = r.main ? turns : helperSpan(d.agents.find((a) => a.id === r.id));
    let cursor = -Infinity;
    for (const [s, e] of marks) {
      if (cursor > -Infinity && s > cursor && s - cursor <= THINK_MAX && inside(spans, cursor, s)) r.think.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
  }
  return rows;
}

function turnSpans(steps: Step[], d: Detail): [number, number][] {
  const prompts = steps.filter((s) => s.agent === 'main' && s.kind === 'prompt').map((s) => s.t);
  const ends = turnEnds(steps);
  const out: [number, number][] = [];
  for (let i = 0; i < prompts.length; i++) {
    const end = ends.find((t) => t >= prompts[i] && (i + 1 >= prompts.length || t <= prompts[i + 1]));
    out.push([prompts[i], end ?? (i + 1 < prompts.length ? prompts[i + 1] : d.endedAt)]);
  }
  return out;
}

function helperSpan(a: AgentInfo | undefined): [number, number][] {
  return a && a.startedAt ? [[a.startedAt, Math.max(a.lastTs, a.startedAt)]] : [];
}

const inside = (spans: [number, number][], a: number, b: number) => spans.some(([s, e]) => a >= s && b <= e + 1000);

/** A stretch of the axis: real time drawn to scale, or a quiet stretch drawn as a narrow break. */
export interface Piece {
  t0: number;
  t1: number;
  x0: number;
  x1: number;
  quiet: boolean;
  /** a quiet stretch where the agent was waiting for your answer */
  waiting?: boolean;
}

export interface Axis {
  pieces: Piece[];
  width: number;
  t0: number;
  t1: number;
  x: (t: number) => number;
  t: (x: number) => number;
}

/**
 * Lays the session out across `width` pixels. Stretches with nothing going on
 * for longer than a few minutes (overnight, lunch, a long wait for your answer)
 * become narrow breaks, so the work itself gets the room; the replay skips the
 * same stretches.
 */
export function axisOf(rows: Row[], steps: Step[], t0: number, t1: number, width: number): Axis {
  const span = Math.max(1000, t1 - t0);
  // what counts as activity: steps, blocks (a long wait for you counts only at its ends), thinking
  const iv: [number, number][] = [];
  const waits: [number, number][] = [];
  for (const s of steps) iv.push([s.t, Math.max(s.t, Math.min(s.end ?? s.t, s.t + 60_000))]);
  for (const r of rows) {
    for (const b of r.blocks) {
      if (b.kind === 'ask' && b.e - b.s > 3 * 60_000) {
        iv.push([b.s, b.s + 30_000], [b.e - 30_000, b.e]);
        waits.push([b.s, b.e]);
      } else iv.push([b.s, b.e]);
    }
    for (const th of r.think) iv.push(th);
  }
  iv.push([t0, t0], [t1, t1]);
  iv.sort((a, b) => a[0] - b[0]);
  const BREAK = Math.min(22, Math.max(12, width / 60));
  const maxBreaks = Math.max(2, Math.floor((width * 0.3) / BREAK));
  let gap = Math.max(3 * 60_000, span / 300);
  let busy: [number, number][] = [];
  for (let k = 0; k < 24; k++) {
    busy = [];
    for (const [s, e] of iv) {
      const last = busy[busy.length - 1];
      if (last && s - last[1] <= gap) last[1] = Math.max(last[1], e);
      else busy.push([s, e]);
    }
    if (busy.length - 1 <= maxBreaks) break;
    gap *= 1.6;
  }
  // a piece per busy stretch, with breaks between
  const busyMs = busy.reduce((n, [s, e]) => n + Math.max(0, e - s), 0) || 1;
  const breaks = busy.length - 1;
  const MIN = 6;
  const room = Math.max(40, width - breaks * BREAK);
  const raw = busy.map(([s, e]) => ((e - s) / busyMs) * room);
  const small = raw.filter((w) => w < MIN).length;
  const big = raw.filter((w) => w >= MIN).reduce((n, w) => n + w, 0);
  const scale = big > 0 && room > small * MIN ? (room - small * MIN) / big : 1;
  const pieces: Piece[] = [];
  let x = 0;
  busy.forEach(([s, e], i) => {
    const w = raw[i] < MIN ? MIN : raw[i] * scale;
    pieces.push({ t0: s, t1: e, x0: x, x1: x + w, quiet: false });
    x += w;
    if (i < busy.length - 1) {
      const n = busy[i + 1][0];
      const waiting = waits.some(([a, b]) => a <= e + 60_000 && b >= n - 60_000);
      pieces.push({ t0: e, t1: n, x0: x, x1: x + BREAK, quiet: true, waiting });
      x += BREAK;
    }
  });
  const total = x || 1;
  for (const p of pieces) {
    p.x0 = (p.x0 / total) * width;
    p.x1 = (p.x1 / total) * width;
  }
  const find = (t: number) => {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    return pieces[lo];
  };
  const tx = (t: number) => {
    if (!pieces.length) return 0;
    if (t <= pieces[0].t0) return pieces[0].x0;
    const last = pieces[pieces.length - 1];
    if (t >= last.t1) return last.x1;
    const p = find(t);
    const f = p.t1 > p.t0 ? (t - p.t0) / (p.t1 - p.t0) : 0;
    return p.x0 + Math.min(1, Math.max(0, f)) * (p.x1 - p.x0);
  };
  const xt = (px: number) => {
    if (!pieces.length) return t0;
    const xx = Math.min(width, Math.max(0, px));
    const p = pieces.find((q) => xx >= q.x0 && xx <= q.x1) || (xx < pieces[0].x0 ? pieces[0] : pieces[pieces.length - 1]);
    const f = p.x1 > p.x0 ? (xx - p.x0) / (p.x1 - p.x0) : 0;
    return Math.round(p.t0 + f * (p.t1 - p.t0));
  };
  return { pieces, width, t0: busy[0]?.[0] ?? t0, t1: busy[busy.length - 1]?.[1] ?? t1, x: tx, t: xt };
}

/** Clock ticks that fit: at the start of each stretch, then every so often inside long ones. */
export function ticksOf(axis: Axis, minGap = 64): { x: number; t: number }[] {
  const out: { x: number; t: number }[] = [];
  const STEPS = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000, 3_600_000, 2 * 3_600_000, 3 * 3_600_000, 6 * 3_600_000];
  const push = (t: number) => {
    const x = axis.x(t);
    if (out.length && x - out[out.length - 1].x < minGap) return;
    if (x > axis.width - 24) return;
    out.push({ x, t });
  };
  for (const p of axis.pieces) {
    if (p.quiet) continue;
    push(p.t0);
    const pxPerMs = (p.x1 - p.x0) / Math.max(1, p.t1 - p.t0);
    const step = STEPS.find((s) => s * pxPerMs >= minGap * 1.2);
    if (!step) continue;
    for (let t = Math.ceil((p.t0 + 1) / step) * step; t < p.t1; t += step) push(t);
  }
  return out;
}

/** The step showing at time t: the last one that began by then. */
export function stepAt(steps: Step[], t: number, who?: (s: Step) => boolean): number {
  let lo = 0;
  let hi = steps.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid].t <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (!who) return best;
  for (let i = best; i >= 0; i--) if (who(steps[i])) return i;
  return -1;
}

// ---------- requests ----------

/**
 * One thing you asked, and everything the agents did about it until they
 * handed back to you: the unit the replay is told in.
 */
export interface Request {
  /** 0-based, in order */
  i: number;
  /** when you asked (the session's start for work before your first message) */
  t0: number;
  /** when it handed back: its last step, else your next message or the session's end */
  t1: number;
  /** when the next request starts (or the session ends) */
  next: number;
  /** what you asked, in one line ('' when it wasn't recorded) */
  ask: string;
  /** it began with a message of yours (its words may still be missing: a long session's oldest) */
  asked: boolean;
  /** the last thing the main agent said in it */
  said: string;
  /** the main agent's working time by kind, longest first (thinking included, waits for you not) */
  split: TimeSplit[];
  workMs: number;
  /** waiting for your answer, and how many times it asked */
  waitMs: number;
  asks: number;
  /** helpers it sent */
  helpers: string[];
  /** steps that failed (its own and its helpers') */
  fails: number;
  /** you stopped it */
  stopped: boolean;
  /** still going (a live session's latest request, not handed back yet) */
  open: boolean;
}

const clip = (s: number, e: number, a: number, b: number) => Math.max(0, Math.min(e, b) - Math.max(s, a));

/** The session as the requests you made, oldest first. */
export function requestsOf(d: Detail, steps: Step[], rows: Row[]): Request[] {
  const main = steps.filter((s) => s.agent === 'main');
  const prompts = main.filter((s) => s.kind === 'prompt');
  const ends = turnEnds(steps);
  const firstWork = main.find((s) => s.kind !== 'prompt');
  const starts: { t: number; ask: string; asked: boolean }[] = prompts.map((s) => ({ t: s.t, ask: s.quote || '', asked: true }));
  // work before your first message (or a session with none recorded)
  if (!starts.length || (firstWork && firstWork.t < starts[0].t - 1000)) starts.unshift({ t: Math.min(d.startedAt || Infinity, firstWork?.t ?? Infinity, starts[0]?.t ?? Infinity), ask: '', asked: false });
  const end = Math.max(d.endedAt || 0, steps.length ? (steps[steps.length - 1].end ?? steps[steps.length - 1].t) : 0);
  const mainRow = rows.find((r) => r.main);
  const out: Request[] = [];
  starts.forEach((st, i) => {
    const t0 = st.t;
    const next = i + 1 < starts.length ? starts[i + 1].t : end;
    const fin = ends.find((t) => t >= t0 && t <= next);
    const t1 = fin ?? next;
    const acc = new Map<Kind | 'think', number>();
    let waitMs = 0;
    let asks = 0;
    for (const b of mainRow?.blocks || []) {
      const ms = clip(b.s, b.e, t0, next);
      if (!ms && !(b.s >= t0 && b.s < next)) continue;
      if (b.kind === 'ask') {
        waitMs += ms;
        if (b.s >= t0 && b.s < next) asks++;
      } else acc.set(b.kind, (acc.get(b.kind) || 0) + ms);
    }
    for (const [s, e] of mainRow?.think || []) acc.set('think', (acc.get('think') || 0) + clip(s, e, t0, next));
    const split = [...acc.entries()].map(([kind, ms]) => ({ kind, ms })).filter((x) => x.ms > 0).sort((a, b) => b.ms - a.ms);
    const within = (s: Step) => s.t >= t0 && s.t < (i + 1 < starts.length ? next : Infinity);
    let said = '';
    for (const s of main) if (s.kind === 'said' && within(s) && s.quote) said = s.quote;
    out.push({
      i,
      t0,
      t1,
      next,
      ask: st.ask,
      asked: st.asked,
      said,
      split,
      workMs: split.reduce((n, x) => n + x.ms, 0),
      waitMs,
      asks,
      helpers: d.agents.filter((a) => a.kind !== 'main' && a.startedAt >= t0 && (a.startedAt < next || i === starts.length - 1)).map((a) => a.id),
      fails: steps.filter((s) => s.ok === false && within(s)).length,
      stopped: main.some((s) => s.kind === 'interrupt' && within(s)),
      open: !!d.live && i === starts.length - 1 && fin === undefined,
    });
  });
  return out;
}

/** The request going on at time t (the one asked last by then). */
export function requestAt(reqs: Request[], t: number): number {
  let at = 0;
  for (let i = 0; i < reqs.length; i++) if (reqs[i].t0 <= t) at = i;
  return at;
}

// ---------- the session in a few words ----------

export interface TimeSplit {
  kind: Kind | 'think';
  ms: number;
}

/** Where the time went: tool time by kind (main agent), plus the thinking between. Waits for you are told apart, in words. */
export function timeSplit(rows: Row[]): TimeSplit[] {
  const main = rows.find((r) => r.main);
  if (!main) return [];
  const acc = new Map<Kind | 'think', number>();
  for (const b of main.blocks) if (b.kind !== 'ask') acc.set(b.kind, (acc.get(b.kind) || 0) + Math.max(0, b.e - b.s));
  acc.set('think', main.think.reduce((n, [s, e]) => n + (e - s), 0));
  return [...acc.entries()].map(([kind, ms]) => ({ kind, ms })).filter((x) => x.ms > 0);
}

/** Counts by kind of step (main agent and helpers), for the summary in words. */
export function tally(d: Detail) {
  const files = { read: new Set<string>(), edited: d.files.filter((f) => f.edits).length };
  for (const f of d.files) if (f.reads) files.read.add(f.path);
  let commands = 0;
  let web = 0;
  for (const [n, c] of d.tools) {
    if (n === 'Bash') commands += c;
    if (n === 'WebSearch' || n === 'WebFetch') web += c;
  }
  return { filesRead: files.read.size, filesEdited: files.edited, commands, web, helpers: d.agents.filter((a) => a.kind !== 'main').length };
}
