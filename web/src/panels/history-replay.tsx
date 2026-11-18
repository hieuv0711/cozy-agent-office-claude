import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { dayKey, type Detail, type Seg } from '../api';
import { clockSec } from '../fmt';
import { PACE_WORDS, PACES, storyOf, type Pace, type Replay, type Story } from '../replay';
import { cap, clockOf, counted, dateWords, humanDur, numberWord } from './history-words';
import { axisOf, helperHint, helperName, KIND_WORDS, kindOf, requestAt, segWords, stepAt, tagOf, ticksOf, type Block, type Kind, type Request, type Row, type Step } from './history-steps';
import { tip } from './Tooltip';

// The replay, told the way you'd tell it: one request at a time. Every thing
// you asked is a card (when, how long it worked, what it mostly did, its
// helpers, its waits for you, what failed, what it answered), and a strip
// above them maps the whole session, a block per request, with a playhead.
// Open a card for that one request drawn as a timeline (the main agent and
// each of its helpers) and its steps in plain words. Play goes request by
// request, each taking about the same time to watch however long it took.

// ---------- small words ----------

/** A duration for a step or a request: seconds when it's short. */
const dur = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}\u00a0s` : humanDur(ms));

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${numberWord(n)} times`);

const DOING: Record<Kind | 'think', string> = {
  read: 'reading and searching',
  web: 'reading the web',
  other: 'using other tools',
  edit: 'editing files',
  run: 'running commands',
  agent: 'waiting on its helpers',
  ask: 'waiting for you',
  think: 'thinking',
};

const SPLIT_WORDS: Record<Kind | 'think', string> = { ...KIND_WORDS, read: 'Reading and searching', web: 'On the web', edit: 'Editing', run: 'Running commands', agent: 'Helpers at work', think: 'Thinking' };

/** How a request's time went, in a few words: "Mostly running commands, then editing files". */
export function splitWords(r: Request): string {
  const [a, b] = r.split;
  if (!a) return '';
  const all = r.workMs || 1;
  return a.ms / all >= 0.6 || !b || b.ms / all < 0.12 ? `Mostly ${DOING[a.kind]}` : `Mostly ${DOING[a.kind]}, then ${DOING[b.kind]}`;
}

/** When a request was made: the clock alone in a one-day session, else with its day. */
export function whenWords(t: number, days: boolean): string {
  if (!days) return clockOf(t);
  const k = dayKey(t);
  const day = k === dayKey(Date.now()) ? 'Today' : k === dayKey(Date.now() - 86_400_000) ? 'Yesterday' : dateWords(t, 'short');
  return `${day} ${clockOf(t)}`;
}

function outcome(r: Request): { word: string; cls: string } {
  if (r.open) return { word: 'Still working', cls: 'open' };
  if (r.stopped) return { word: 'You stopped it', cls: 'stopped' };
  return { word: 'Finished', cls: 'done' };
}

const clipWords = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

/** What you asked, for a tooltip or a line where the words are missing. */
export function askWords(r: Request, n = 400): string {
  if (r.ask) return `You asked “${clipWords(r.ask, n)}”`;
  return r.asked ? 'You asked something; its words are further back than this page loads' : 'Work before your first message';
}

/** The facts of a request: "worked 7 min", "2 helpers", "asked you once", "1 step failed". */
export function requestFacts(r: Request): string[] {
  const out = [`worked ${dur(r.workMs)}`];
  if (r.helpers.length) out.push(counted(r.helpers.length, 'helper'));
  if (r.asks) out.push(`asked you ${times(r.asks)}`);
  if (r.fails) out.push(`${counted(r.fails, 'step')} failed`);
  return out;
}

/** The gap before the next request, when there is one worth a line: "18 min later", "Sun 15 Nov, 15:38". */
function gapWords(r: Request, next: Request): string {
  const gap = next.t0 - r.t1;
  if (gap < 3 * 60_000) return '';
  if (dayKey(next.t0) !== dayKey(r.t1)) return whenWords(next.t0, true).replace(/ (\d\d:\d\d)$/, ', $1');
  return `${humanDur(gap)} later`;
}

// ---------- step words ----------

const STEP_TAG: Record<string, string> = { prompt: 'YOU', said: 'SAID', turn: 'DONE', compact: 'MEMORY', interrupt: 'STOP', command: 'CMD', notify: 'TASK', helper: 'HELPER', 'helper-end': 'HELPER', error: 'ERROR' };

export function stepTag(s: Step): { tag: string; cls: string } {
  if (s.kind === 'tool') {
    const k = kindOf(s.cat);
    return { tag: tagOf(k), cls: `k-${k}` };
  }
  if (s.ok === false) return { tag: s.kind === 'helper-end' ? 'FAILED' : STEP_TAG[s.kind] || 'ERROR', cls: 'k-fail' };
  return { tag: STEP_TAG[s.kind] || s.kind.toUpperCase(), cls: `s-${s.kind}` };
}

function took(s: Step): string {
  const ms = s.end ? s.end - s.t : 0;
  if (ms < 30_000) return '';
  return `took ${dur(ms)}`;
}

function helperLabel(d: Detail, id: string) {
  return helperName(d.agents.find((x) => x.id === id));
}

// ---------- measuring ----------

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Click to jump, drag to scrub; a click that didn't move goes where `pick` says (the start of what's under it). */
function useScrub(toT: (x: number) => number, onSeek: (t: number) => void, pick?: (x: number) => number | null) {
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const at = (e: PointerEvent<HTMLElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: at(e), moved: false };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const dr = drag.current;
      if (!dr) return;
      const x = at(e);
      if (Math.abs(x - dr.x) > 3) dr.moved = true;
      if (dr.moved) onSeek(toT(x));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const dr = drag.current;
      drag.current = null;
      if (!dr || dr.moved) return;
      const x = at(e);
      onSeek(pick?.(x) ?? toT(x));
    },
    onPointerCancel: () => void (drag.current = null),
  };
}

// ---------- the map: every request in one strip ----------

/**
 * The whole session in one strip: a block per request (its working time to
 * scale, quiet stretches squeezed out), the waits for you in yellow, a red
 * edge where something failed, and the playhead. Click a block to go to that
 * request, drag to scrub. It is the replay's slider: arrow keys go step by
 * step, Page Up and Page Down request by request, Space plays or pauses.
 */
export function RequestMap({
  d,
  story,
  t,
  head,
  sel = -1,
  compact = false,
  onSeek,
  onToggle,
}: {
  d: Detail;
  story: Story;
  t: number;
  head: boolean;
  sel?: number;
  compact?: boolean;
  onSeek: (t: number) => void;
  onToggle: () => void;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const W = Math.max(120, width);
  const { rows, steps, requests } = story;
  const end = Math.max(d.endedAt, d.startedAt + 1000);
  const axis = useMemo(() => axisOf(rows, steps, d.startedAt, end, W), [rows, steps, d.startedAt, end, W]);
  const days = dayKey(d.startedAt) !== dayKey(end);
  const cur = requestAt(requests, t);
  const mainSteps = useMemo(() => steps.filter((s) => s.agent === 'main' && (s.kind === 'tool' || s.kind === 'prompt' || s.kind === 'said')), [steps]);
  const waits = useMemo(() => (rows.find((r) => r.main)?.blocks || []).filter((b) => b.kind === 'ask'), [rows]);
  const blocks = useMemo(
    () =>
      requests.map((r) => {
        const x0 = axis.x(r.t0);
        return { x0, x1: Math.max(x0 + 3, axis.x(Math.max(r.t1, r.t0 + 1))) };
      }),
    [requests, axis],
  );
  // over the strip: the day where each new day starts, then clock times where there's room
  const labels = useMemo(() => {
    const out: { x: number; text: string; day: boolean; w: number }[] = [];
    let lastDay = '';
    requests.forEach((r, i) => {
      const x = blocks[i].x0;
      const k = dayKey(r.t0);
      const newDay = days && k !== lastDay;
      lastDay = k;
      const text = newDay ? whenWords(r.t0, true) : clockOf(r.t0);
      const w = text.length * 7.2 + 14;
      if (x + w > W + 6) return;
      const prev = out[out.length - 1];
      if (prev && x < prev.x + prev.w) {
        // a new day wins over a plain time, if it fits after the label before that
        const before = out[out.length - 2];
        if (newDay && !prev.day && (!before || x >= before.x + before.w)) out[out.length - 1] = { x, text, day: true, w };
        return;
      }
      out.push({ x, text, day: newDay, w });
    });
    return out;
  }, [requests, blocks, days, W]);
  const scrub = useScrub(axis.t, onSeek, (x) => {
    const i = blocks.findIndex((b) => x >= b.x0 - 2 && x <= b.x1 + 2);
    return i >= 0 && i !== cur ? requests[i].t0 : null;
  });
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      onToggle();
      return;
    }
    const i = stepAt(mainSteps, t);
    if (e.key === 'ArrowRight') next = mainSteps[Math.min(mainSteps.length - 1, i + 1)]?.t ?? null;
    else if (e.key === 'ArrowLeft') next = mainSteps[Math.max(0, i - (mainSteps[i]?.t === t ? 1 : 0))]?.t ?? null;
    else if (e.key === 'PageDown') next = requests[Math.min(requests.length - 1, cur + 1)]?.t0 ?? null;
    else if (e.key === 'PageUp') next = requests[requests[cur] && requests[cur].t0 < t - 1000 ? cur : Math.max(0, cur - 1)]?.t0 ?? null;
    else if (e.key === 'Home') next = d.startedAt;
    else if (e.key === 'End') next = d.endedAt;
    if (next == null) return;
    e.preventDefault();
    onSeek(Math.min(d.endedAt, Math.max(d.startedAt, next)));
  };
  const now = stepAt(mainSteps, t);
  return (
    <div className={`rq-map${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="rq-map-labels" aria-hidden="true">
          {labels.map((l) => (
            <span key={`${l.x}-${l.text}`} className={l.day ? 'is-day' : ''} style={{ left: l.x }}>
              {l.text}
            </span>
          ))}
        </div>
      )}
      <div
        className="rq-track"
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Replay position. Click a request to go to it. Arrow keys go step by step, Page Up and Page Down request by request, Space plays or pauses."
        aria-valuemin={d.startedAt}
        aria-valuemax={d.endedAt}
        aria-valuenow={t}
        aria-valuetext={`${requests.length ? `Request ${cur + 1} of ${requests.length}, ` : ''}${clockSec(t)}, ${now >= 0 ? mainSteps[now].text : 'the start'}`}
        onKeyDown={onKey}
        {...scrub}
      >
        {width > 0 &&
          requests.map((q, i) => {
            const { x0, x1 } = blocks[i];
            const w = x1 - x0;
            return (
              <div
                key={q.i}
                className={`rq-blk${i === sel ? ' sel' : ''}${head && i < cur ? ' past' : ''}${head && i === cur ? ' cur' : ''}${q.fails ? ' failed' : ''}`}
                style={{ left: x0, width: w }}
                {...tip(
                  [askWords(q, 150), cap(requestFacts(q).join(' · '))].join('\n'),
                  `Request ${i + 1} of ${requests.length} · ${whenWords(q.t0, days)}`,
                )}
              >
                {waits
                  .filter((b) => b.s < q.next && b.e > q.t0)
                  .map((b) => {
                    const a = Math.max(axis.x(b.s), x0);
                    const z = Math.min(axis.x(b.e), x1);
                    return z - a >= 1 ? <i key={b.s} className="rq-wait" style={{ left: a - x0, width: z - a }} /> : null;
                  })}
                {!compact && w >= (i >= 9 ? 18 : 13) && <span className="rq-blk-n">{i + 1}</span>}
              </div>
            );
          })}
        {width > 0 && head && <div className="rq-head" style={{ left: axis.x(t) }} />}
      </div>
    </div>
  );
}

// ---------- one request, drawn ----------

interface Lane {
  id: string;
  name: string;
  sub: string;
  hint: string;
  main: boolean;
  blocks: Block[];
  think: [number, number][];
}

const blocksOf = (segs: Seg[] | undefined, a: number, b: number): Block[] =>
  (segs || []).filter((s) => s[1] >= a && s[0] <= b).map((s) => ({ s: s[0], e: Math.max(s[1], s[0]), kind: kindOf(s[2]), label: s[3], ok: s[4] !== 0, count: s[5] || 1 }));

const MAX_LANES = 6;

/** The lanes of one request: the main agent's part, then each helper it sent (past a few, the rest folded into one). */
function lanesOf(d: Detail, story: Story, r: Request): { lanes: Lane[]; t0: number; t1: number } {
  const main = story.rows.find((x) => x.main);
  const helpers = r.helpers.map((id) => d.agents.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  // a helper can outlast the turn that sent it: the drawing runs to its end (but not into the next request)
  const t0 = r.t0;
  const t1 = Math.min(r.next, Math.max(r.t1, ...helpers.map((a) => Math.max(a.lastTs, a.startedAt))));
  const lanes: Lane[] = [
    {
      id: 'main',
      name: 'Main agent',
      sub: '',
      hint: 'The session itself: it works out what to do, does most of it, and sends helpers',
      main: true,
      blocks: (main?.blocks || []).filter((b) => b.e >= t0 && b.s <= t1),
      think: (main?.think || []).filter(([s, e]) => e >= t0 && s <= t1),
    },
  ];
  const shown = helpers.length > MAX_LANES ? helpers.slice(0, MAX_LANES - 1) : helpers;
  // a helper's lane goes by its task (a teammate's, by its name), with its kind under it, as its tag in the room does
  for (const a of shown) {
    const task = (a.desc || a.task || '').replace(/\s+/g, ' ').trim();
    const kind = helperName(a);
    lanes.push({ id: a.id, name: a.name ? a.name : task || kind, sub: a.name ? task : task ? kind : '', hint: helperHint(a), main: false, blocks: blocksOf(d.lanes[a.id], t0, t1), think: [] });
  }
  const rest = helpers.slice(shown.length);
  if (rest.length)
    lanes.push({
      id: 'rest',
      name: `${rest.length} more helpers`,
      sub: 'drawn together',
      hint: rest
        .slice(0, 12)
        .map((a) => `${helperName(a)}: ${clipWords((a.desc || a.task || '').replace(/\s+/g, ' '), 60)}`)
        .join('\n'),
      main: false,
      blocks: rest.flatMap((a) => blocksOf(d.lanes[a.id], t0, t1)).sort((x, y) => x.s - y.s),
      think: [],
    });
  return { lanes, t0, t1: Math.max(t1, t0 + 1000) };
}

function blockTip(b: Block, steps: Step[], lane: Lane) {
  const s = steps.find((st) => st.kind === 'tool' && Math.abs(st.t - b.s) < 1000 && (st.agent === lane.id || lane.id === 'rest'));
  const words = s?.text || segWords(b.label);
  const lines = [`${b.kind === 'ask' ? 'Waiting for you' : KIND_WORDS[b.kind]} · ${clockSec(b.s)}${b.e - b.s >= 1000 ? ` · took ${dur(b.e - b.s)}` : ''}`];
  if (!b.ok) lines.push(`Failed${s?.reason ? `: ${s.reason}` : ''}`);
  if (!lane.main) lines.push(lane.name);
  return tip(lines.join('\n'), b.kind === 'ask' ? `Waited ${dur(b.e - b.s)} for your answer` : b.count > 1 ? `${words} and ${b.count - 1} more like it` : words);
}

const RequestTimeline = memo(function RequestTimeline({ d, story, r, t, head, onSeek }: { d: Detail; story: Story; r: Request; t: number; head: boolean; onSeek: (t: number) => void }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const W = Math.max(160, width);
  const { lanes, t0, t1 } = useMemo(() => lanesOf(d, story, r), [d, story, r]);
  const steps = useMemo(() => story.steps.filter((s) => s.t >= t0 && s.t <= t1), [story.steps, t0, t1]);
  const axis = useMemo(() => {
    const rows: Row[] = lanes.map((l) => ({ id: l.id, label: l.name, sub: l.sub, main: l.main, blocks: l.blocks.map((b) => ({ ...b, s: Math.max(b.s, t0), e: Math.min(b.e, t1) })), think: l.think }));
    return axisOf(rows, steps, t0, t1, W);
  }, [lanes, steps, t0, t1, W]);
  const ticks = useMemo(() => ticksOf(axis, 72), [axis]);
  const scrub = useScrub(axis.t, onSeek);
  const kinds = useMemo(() => {
    const k = new Set<Kind>();
    for (const l of lanes) for (const b of l.blocks) k.add(b.kind);
    return (['read', 'web', 'other', 'edit', 'run', 'agent', 'ask'] as Kind[]).filter((x) => k.has(x));
  }, [lanes]);
  const thinks = lanes.some((l) => l.think.length);
  const failed = lanes.some((l) => l.blocks.some((b) => !b.ok));
  const x = (v: number) => axis.x(Math.min(t1, Math.max(t0, v)));
  return (
    <figure className="rq-tl">
      <div className="rq-tl-grid">
        <div className="rq-tl-names">
          {lanes.map((l) => (
            <div key={l.id} className={`rq-tl-name${l.main ? ' is-main' : ''}`} {...tip([l.hint, l.main ? '' : l.sub].filter(Boolean).join('\n'), l.name)}>
              <b>{l.name}</b>
              {l.sub && <span>{l.sub}</span>}
            </div>
          ))}
        </div>
        <div className="rq-tl-plot" ref={box} {...scrub}>
          {width > 0 &&
            axis.pieces
              .filter((p) => p.quiet)
              .map((p) => (
                <div
                  key={p.t0}
                  className={`rq-tl-break${p.waiting ? ' waiting' : ''}`}
                  style={{ left: p.x0, width: Math.max(2, p.x1 - p.x0) }}
                  {...tip(`${clockOf(p.t0)} to ${clockOf(p.t1)}, squeezed into this narrow gap. The replay skips it.`, p.waiting ? `Waited ${humanDur(p.t1 - p.t0)} for your answer` : `Quiet for ${humanDur(p.t1 - p.t0)}`)}
                />
              ))}
          {width > 0 &&
            lanes.map((l) => (
              <div key={l.id} className={`rq-tl-lane${l.main ? ' is-main' : ''}`}>
                {l.think.map(([s, e]) => (
                  <i key={`th${s}`} className="rq-think" style={{ left: x(s), width: Math.max(1, x(e) - x(s)) }} />
                ))}
                {l.blocks.map((b, i) => {
                  const a = x(b.s);
                  const w = Math.max(2, x(b.e) - a);
                  return (
                    <i key={`${b.s}-${i}`} className={`rq-b k-${b.kind}${b.ok ? '' : ' failed'}`} style={{ left: a, width: w }} {...blockTip(b, steps, l)}>
                      {b.kind === 'ask' && w >= 130 && <span>waited {dur(b.e - b.s)} for you</span>}
                    </i>
                  );
                })}
              </div>
            ))}
          {width > 0 && head && t >= t0 && t <= t1 && <div className="rq-head" style={{ left: axis.x(t) }} />}
          <div className="rq-tl-ticks" aria-hidden="true">
            {width > 0 &&
              ticks.map((k) => (
                <span key={k.t} style={{ left: k.x }}>
                  {clockOf(k.t)}
                </span>
              ))}
          </div>
        </div>
      </div>
      <figcaption className="rq-key">
        {kinds.map((k) => (
          <span key={k}>
            <i className={`rp-sw k-${k}`} aria-hidden="true" />
            {KIND_WORDS[k]}
          </span>
        ))}
        {thinks && (
          <span>
            <i className="rp-sw k-think" aria-hidden="true" />
            Thinking
          </span>
        )}
        {failed && (
          <span>
            <i className="rp-sw k-fail" aria-hidden="true" />
            Failed
          </span>
        )}
      </figcaption>
    </figure>
  );
});

// ---------- the steps in words ----------

// One row of the list. Memoised: while the replay plays only the rows whose
// state changes (the one now showing, the ones it just passed) draw again.
const StepItem = memo(function StepItem({ s, who, state, onSeek }: { s: Step; who: string; state: 'past' | 'now' | 'later'; onSeek: (t: number) => void }) {
  const { tag, cls } = stepTag(s);
  const long = took(s);
  return (
    <li className={`${state === 'past' ? 'past' : ''}${s.ok === false ? ' failed' : ''}`}>
      <button type="button" className="rp-step" aria-current={state === 'now' ? 'step' : undefined} onClick={() => onSeek(s.t)}>
        <span className="rp-st-time">{clockOf(s.t)}</span>
        <span className={`rp-st-tag ${cls}`}>{tag}</span>
        <span className="rp-st-body">
          <span className="rp-st-text">
            {who}
            {s.text}
            {long && <span className="rp-st-took"> · {long}</span>}
          </span>
          {s.quote && <span className="rp-st-quote">{s.quote}</span>}
          {s.ok === false && <span className="rp-st-fail">Failed{s.reason ? `: ${s.reason}` : ''}</span>}
        </span>
      </button>
    </li>
  );
});

function StepList({ d, steps, t, live, onSeek }: { d: Detail; steps: Step[]; t: number; live: boolean; onSeek: (t: number) => void }) {
  const [helpers, setHelpers] = useState(false);
  const shown = useMemo(() => steps.filter((s) => s.agent === 'main' || helpers || s.kind === 'helper' || s.kind === 'helper-end' || s.ok === false), [steps, helpers]);
  // the step showing is the last shown one at or before the playhead
  const at = live ? stepAt(shown, t) : -1;
  const list = useRef<HTMLOListElement>(null);
  const touched = useRef(0);
  useEffect(() => {
    const el = list.current;
    if (!el || at < 0 || Date.now() - touched.current < 2500) return;
    const item = el.children[at] as HTMLElement | undefined;
    if (!item) return;
    const top = item.offsetTop - el.offsetTop;
    if (top < el.scrollTop + 8 || top + item.offsetHeight > el.scrollTop + el.clientHeight - 8) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [at]);
  const helperSteps = steps.some((s) => s.agent !== 'main' && s.kind !== 'helper' && s.kind !== 'helper-end');
  return (
    <section className="rp-steps" aria-label="Its steps, in words">
      <div className="rp-steps-head">
        <h3 className="hx-h-sub">Its steps</h3>
        {helperSteps && (
          <label className="rp-check">
            <input type="checkbox" checked={helpers} onChange={(e) => setHelpers(e.target.checked)} />
            Include what the helpers did
          </label>
        )}
      </div>
      <ol className="rp-list" ref={list} onScroll={() => (touched.current = Date.now())} onWheel={() => (touched.current = Date.now())}>
        {shown.map((s, k) => (
          <StepItem
            key={`${s.t}-${s.agent}-${s.kind}-${k}`}
            s={s}
            who={s.agent !== 'main' && s.kind !== 'helper' && s.kind !== 'helper-end' ? `${helperLabel(d, s.agent)}: ` : ''}
            state={k < at ? 'past' : k === at ? 'now' : 'later'}
            onSeek={onSeek}
          />
        ))}
      </ol>
    </section>
  );
}

// ---------- a request's card ----------

function SplitBar({ r }: { r: Request }) {
  if (!r.split.length) return null;
  const all = r.workMs || 1;
  return (
    <span className="rq-bar" role="img" aria-label={`How the time went: ${r.split.map((x) => `${SPLIT_WORDS[x.kind].toLowerCase()} ${dur(x.ms)}`).join(', ')}`} {...tip(r.split.map((x) => `${SPLIT_WORDS[x.kind]}: ${dur(x.ms)}`).join('\n'), 'How the time went')}>
      {r.split.map((x) => (
        <i key={x.kind} className={`rp-sw k-${x.kind}`} style={{ width: `${(x.ms / all) * 100}%` }} />
      ))}
    </span>
  );
}

const RequestCard = memo(function RequestCard({
  d,
  story,
  r,
  total,
  days,
  open,
  state,
  t,
  head,
  onPick,
  onSeek,
}: {
  d: Detail;
  story: Story;
  r: Request;
  total: number;
  days: boolean;
  open: boolean;
  state: 'past' | 'now' | 'later' | '';
  t: number;
  head: boolean;
  onPick: (i: number) => void;
  onSeek: (t: number) => void;
}) {
  const o = outcome(r);
  const steps = useMemo(() => (open ? story.steps.filter((s) => s.t >= r.t0 && (s.t < r.next || r.i === total - 1)) : []), [open, story.steps, r, total]);
  return (
    <li className={`rq${open ? ' open' : ''}${state ? ` ${state}` : ''}`} id={`rq-${r.i + 1}`}>
      <button type="button" className="rq-top" aria-expanded={open} onClick={() => onPick(r.i)}>
        <span className="rq-n">
          <span className="sr">Request </span>
          {r.i + 1}
          <span className="sr"> of {total}</span>
        </span>
        <span className="rq-when">{whenWords(r.t0, days)}</span>
        <span className="rq-facts">
          <span>worked {dur(r.workMs)}</span>
          {r.helpers.length > 0 && <span className="rq-chip k-agent">{counted(r.helpers.length, 'helper')}</span>}
          {r.asks > 0 && <span className="rq-chip k-ask">asked you {times(r.asks)}</span>}
          {r.fails > 0 && <span className="rq-chip k-fail">{counted(r.fails, 'step')} failed</span>}
        </span>
        <span className={`rq-end ${o.cls}`}>{o.word}</span>
        <span className="rq-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      <p className="rq-ask">{r.ask ? <q>{r.ask}</q> : <span className="note">{askWords(r)}</span>}</p>
      {r.split.length > 0 && (
        <p className="rq-split">
          <SplitBar r={r} />
          <span>{splitWords(r)}</span>
        </p>
      )}
      {r.said && (
        <p className="rq-said">
          <span className="rq-said-k">It said</span> {r.said}
        </p>
      )}
      {open && (
        <div className="rq-body">
          <RequestTimeline d={d} story={story} r={r} t={t} head={head} onSeek={onSeek} />
          <StepList d={d} steps={steps} t={t} live={head} onSeek={onSeek} />
        </div>
      )}
    </li>
  );
});

// ---------- the section ----------

/** Long sessions keep the first few requests and the latest in view, the rest behind a button. */
const KEEP_FIRST = 3;
const KEEP_LAST = 6;

const PACE_TIP: Record<Pace, string> = {
  slow: 'About 50 seconds for each request, however long it really took.',
  normal: 'About 25 seconds for each request, however long it really took.',
  fast: 'About 10 seconds for each request, however long it really took.',
};

export const ReplaySection = forwardRef<HTMLElement, { d: Detail; replay: Replay | null; setReplay: (r: Replay | null) => void; onWatch: () => void }>(function ReplaySection({ d, replay, setReplay, onWatch }, ref) {
  const story = useMemo(() => storyOf(d), [d]);
  const { requests, steps } = story;
  const mine = replay && replay.detail.id === d.id ? replay : null;
  const t = mine ? mine.t : d.startedAt;
  const pace = mine?.pace || 'normal';
  const playing = !!mine?.playing;
  const done = !!mine && !playing && t >= d.endedAt;
  const set = (patch: Partial<Replay>) => setReplay({ detail: d, t, playing, pace, watching: mine?.watching ?? false, ...patch });
  const live = useRef({ set, d });
  live.current = { set, d };
  const seek = useCallback((nt: number) => live.current.set({ t: Math.min(live.current.d.endedAt, Math.max(live.current.d.startedAt, nt)) }), []);
  const cur = requestAt(requests, t);
  const [sel, setSel] = useState(() => (mine ? cur : 0));
  // the open card follows the replay as it moves from one request to the next
  const following = !!mine;
  useEffect(() => {
    if (following) setSel(cur);
  }, [cur, following]);
  const [all, setAll] = useState(false);
  const toggle = () => (playing ? set({ playing: false }) : set({ playing: true, t: t >= d.endedAt ? d.startedAt : mine ? t : (requests[sel]?.t0 ?? d.startedAt) }));
  const pick = useCallback((i: number) => {
    const { set: put, d: dd } = live.current;
    const q = storyOf(dd).requests[i];
    if (!q) return;
    setSel((v) => (v === i ? -1 : i));
    put({ t: q.t0 });
  }, []);
  const days = dayKey(d.startedAt) !== dayKey(Math.max(d.endedAt, d.startedAt));
  const curMain = stepAt(steps, t, (s) => s.agent === 'main');
  const now = mine && curMain >= 0 ? steps[curMain] : null;
  const tagged = now ? stepTag(now) : null;
  const N = requests.length;
  const shown = useMemo(() => {
    if (all || N <= KEEP_FIRST + KEEP_LAST + 2) return requests.map((q) => q.i);
    const keep = new Set<number>();
    for (let i = 0; i < KEEP_FIRST; i++) keep.add(i);
    for (let i = N - KEEP_LAST; i < N; i++) keep.add(i);
    if (sel >= 0) keep.add(sel);
    if (following) keep.add(cur);
    return [...keep].sort((a, b) => a - b);
  }, [all, N, requests, sel, following, cur]);
  return (
    <section className="hx-sec hx-replay rp" aria-labelledby="hx-replay-h" ref={ref}>
      <div className="rp-top">
        <div className="hx-replay-head">
          <h2 className="hx-h" id="hx-replay-h">
            Replay
          </h2>
          <p className="hx-replay-why">
            {N > 1 ? `The ${numberWord(N)} things you asked, one by one, and what the agents did about each.` : 'What you asked, and what the agents did about it.'} Open one to see its steps, or press Play to watch it go.
          </p>
        </div>
        <div className="hx-player">
          <button type="button" className="btn primary hx-play" onClick={toggle}>
            {playing ? 'Pause' : done ? 'Play again' : 'Play'}
          </button>
          <div className="seg" role="group" aria-label="Replay pace">
            {PACES.map((p) => (
              <button key={p} type="button" aria-pressed={pace === p} onClick={() => set({ pace: p })} {...tip(PACE_TIP[p], PACE_WORDS[p])}>
                {PACE_WORDS[p]}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={onWatch} {...tip('The room acts it out: the session as a person at work, with its helpers. "Back to live" returns to now.', 'Watch in the room')}>
            Watch in the room
          </button>
        </div>
      </div>
      {N > 0 ? (
        <>
          <p className="rp-now">
            {now && tagged ? (
              <>
                <span className="rp-now-where">
                  {N > 1 && <>{`${cur + 1} of ${N}`} · </>}
                  <span className="mono">{clockSec(t)}</span>
                </span>
                <span className={`rp-st-tag ${tagged.cls}`}>{tagged.tag}</span>
                <span className="rp-now-text">
                  {now.text}
                  {now.quote ? `: ${now.quote}` : ''}
                </span>
                {now.ok === false && <span className="rp-now-fail">Failed{now.reason ? `: ${now.reason}` : ''}</span>}
              </>
            ) : (
              <span className="note">{N > 1 ? 'Each block is one thing you asked, sized by how long it worked. Click one to go to it, or press Play.' : 'Press Play, or open the request to see its steps.'}</span>
            )}
          </p>
          <RequestMap d={d} story={story} t={t} head={!!mine} sel={sel} onSeek={seek} onToggle={toggle} />
          <ol className="rq-list">
            {shown.map((i, k) => {
              const r = requests[i];
              const prev = k > 0 ? shown[k - 1] : -1;
              const skipped = k > 0 && i > prev + 1 ? i - prev - 1 : 0;
              const gap = k > 0 && !skipped ? gapWords(requests[prev], r) : '';
              return (
                <RequestRow key={i} skipped={skipped} gap={gap} onAll={() => setAll(true)}>
                  <RequestCard d={d} story={story} r={r} total={N} days={days} open={sel === i} state={mine ? (i < cur ? 'past' : i === cur ? 'now' : 'later') : ''} t={t} head={!!mine} onPick={pick} onSeek={seek} />
                </RequestRow>
              );
            })}
          </ol>
          {all && N > KEEP_FIRST + KEEP_LAST + 2 && (
            <button type="button" className="linkish rq-fewer" onClick={() => setAll(false)}>
              Show fewer requests
            </button>
          )}
        </>
      ) : (
        <p className="note">Nothing was recorded for this session, so there is nothing to replay.</p>
      )}
    </section>
  );
});

/** A card, with what came between it and the one before: the time that passed, or the requests folded away. */
function RequestRow({ skipped, gap, onAll, children }: { skipped: number; gap: string; onAll: () => void; children: ReactNode }) {
  return (
    <>
      {skipped > 0 && (
        <li className="rq-fold">
          <button type="button" className="linkish" onClick={onAll}>
            Show the {counted(skipped, 'request')} in between
          </button>
        </li>
      )}
      {gap && (
        <li className="rq-gap">
          <span>{gap}</span>
        </li>
      )}
      {children}
    </>
  );
}
