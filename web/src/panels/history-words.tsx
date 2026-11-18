import { useState, type ReactNode } from 'react';
import { addDays, dayKey, type Summary } from '../api';
import { plain } from '../fmt';

// Shared by History (the diary) and Recap (the digest): dates, durations and
// counts in plain words, and the collapsed "Numbers" section where the raw
// figures live.

// The session History shows when it opens. It outlives the view, so coming
// back from watching a replay in the place lands on the same page, and Recap
// can open a session by setting it before switching tabs.
export const historyMemory: { sid: string | null } = { sid: null };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function keyDate(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return dayKey(Date.now());
}

export function weekdayOf(k: string, short = false): string {
  const n = WEEKDAYS[keyDate(k).getDay()];
  return short ? n.slice(0, 3) : n;
}

// "Tuesday 16 Nov" (the year only when it is not this year).
export function dateWords(at: number | string, weekday: 'long' | 'short' | 'none' = 'long'): string {
  const d = typeof at === 'string' ? keyDate(at) : new Date(at);
  const wd = weekday === 'none' ? '' : weekday === 'short' ? `${WEEKDAYS[d.getDay()].slice(0, 3)} ` : `${WEEKDAYS[d.getDay()]} `;
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${wd}${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

// A diary page's title: Today, Yesterday, then "Saturday 14 Nov".
export function dayTitle(k: string): string {
  const today = todayKey();
  if (k === today) return 'Today';
  if (k === addDays(today, -1)) return 'Yesterday';
  return dateWords(k);
}

// The same inside a sentence: "today", "yesterday", "on Saturday 14 Nov".
export function dayPhrase(k: string): string {
  const t = dayTitle(k);
  return t === 'Today' || t === 'Yesterday' ? t.toLowerCase() : `on ${t}`;
}

// "Any time", "Tuesday 16 Nov", "10 – 16 Nov", "28 Oct – 3 Nov", "Since 10 Nov".
export function rangeWords(from: string, to: string): string {
  if (!from && !to) return 'Any time';
  if (from && !to) return `Since ${dateWords(from, 'none')}`;
  if (!from) return `Until ${dateWords(to, 'none')}`;
  if (from === to) return dayTitle(from);
  const a = keyDate(from);
  const b = keyDate(to);
  const year = b.getFullYear() !== new Date().getFullYear() ? ` ${b.getFullYear()}` : '';
  if (a.getFullYear() !== b.getFullYear()) return `${dateWords(from, 'none')} – ${dateWords(to, 'none')}`;
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}${year}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}${year}`;
}

export function clockOf(t: number): string {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Durations in plain words: "under a minute", "45 min", "2 h 10 min", "19 h".
// (No-break spaces, so a wrapped line never splits "5 h 35 min".)
export function humanDur(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return 'under a minute';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}\u00a0min`;
  if (m >= 600) return `${Math.round(m / 60)}\u00a0h`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}\u00a0h\u00a0${m % 60}\u00a0min` : `${h}\u00a0h`;
}

// Shorter still, for chart labels: "45 min", "3 h".
export function shortDur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${Math.max(m, 0)} min`;
  return `${Math.round(m / 60)} h`;
}

// Small counts read better as words inside a sentence: "two sessions".
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < SMALL.length ? SMALL[n] : n.toLocaleString('en');
}

export function counted(n: number, one: string, many = `${one}s`): string {
  return `${numberWord(n)} ${n === 1 ? one : many}`;
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// "a", "a and b", "a, b and c"
export function listWords(xs: string[]): string {
  if (xs.length < 2) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

// Big counts for people: 9,042 · 84k · 1.2M · 3.7B.
export function humanNum(n: number | undefined): string {
  const v = Math.round(n || 0);
  if (v < 10_000) return v.toLocaleString('en');
  if (v < 1e6) return `${Math.round(v / 1e3)}k`;
  if (v < 1e9) return `${(v / 1e6).toFixed(v < 1e7 ? 1 : 0)}M`;
  return `${(v / 1e9).toFixed(v < 1e10 ? 1 : 0)}B`;
}

// How long a session's agents were busy: the 5-minute slots with any activity,
// added up (only on days from..to when given). A whole session never counts
// more than it was open; sessions not read in full yet fall back to that span.
export function workedMs(s: Pick<Summary, 'startedAt' | 'endedAt' | 'days'>, from = '', to = ''): number {
  const open = Math.max(0, (s.endedAt || 0) - (s.startedAt || 0));
  const days = s.days ? Object.entries(s.days) : [];
  if (!days.length) return from || to ? 0 : open;
  let min = 0;
  for (const [k, g] of days) if ((!from || k >= from) && (!to || k <= to)) min += g.active || 0;
  return from || to ? min * 60_000 : Math.min(min * 60_000, open);
}

// The last day a session was active (within from..to when given).
export function lastDay(s: Summary, from = '', to = ''): string {
  const ks = s.days ? Object.keys(s.days).filter((k) => (!from || k >= from) && (!to || k <= to)) : [];
  if (ks.length) return ks.sort()[ks.length - 1];
  return dayKey(s.endedAt || s.startedAt || Date.now());
}

// Titles made from a first prompt can carry Markdown; show them as plain words.
export function cleanTitle(t: string | undefined): string {
  const s = (t || '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\s+#{1,6}\s+/g, ' · ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s || 'Untitled session';
}

export type Ending = 'running' | 'ended' | 'kept';

export function endingOf(s: { live?: boolean; archived?: boolean }): Ending {
  return s.live ? 'running' : s.archived ? 'kept' : 'ended';
}

export const KEPT_NOTE = 'Claude Code has since deleted the transcript; Agent Office kept this summary.';

// The opening of the agent's last message, as one or two plain sentences.
export function firstWords(md: string | undefined, max = 220): string {
  const text = plain(md)
    .split('\n')
    .map((l) => l.replace(/^•\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) || [text];
  let out = '';
  for (const s of sentences) {
    if (out.length >= 60) break;
    out += s;
  }
  out = out.trim();
  if (out.length > max) out = `${out.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return out;
}

// Highlight the first match of a search term.
export function highlight(text: string, term: string): ReactNode {
  if (!term) return text;
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

// ---------- the Numbers section ----------

export const COST_NOTE = 'Estimated at Anthropic API list prices. On a Pro or Max plan this is not what you pay.';

// Collapsed by default; whoever wants the figures opens it. It stays open while
// the view is up, also when another session is opened.
export function Numbers({ hint, children }: { hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="nums" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="nums-title">Numbers</span>
        <span className="nums-hint">{hint}</span>
      </summary>
      <div className="nums-body">{children}</div>
    </details>
  );
}

export function Fig({ k, v, note }: { k: string; v: ReactNode; note?: ReactNode }) {
  return (
    <div className="fig">
      <dt>{k}</dt>
      <dd>
        <span className="fig-v">{v}</span>
        {note ? <span className="fig-note">{note}</span> : null}
      </dd>
    </div>
  );
}

export function ToolList({ tools, max = 8 }: { tools: [string, number][]; max?: number }) {
  if (!tools.length) return <p className="note">No tools were used.</p>;
  const top = tools[0][1] || 1;
  return (
    <ol className="tool-list">
      {tools.slice(0, max).map(([n, c]) => (
        <li key={n}>
          <span className="tool-n">{n.replace(/^mcp__.+?__/, '')}</span>
          <span className="tool-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(2, (c / top) * 100)}%` }} />
          </span>
          <span className="tool-c">{humanNum(c)}</span>
        </li>
      ))}
    </ol>
  );
}

// Lines changed as "+84k −4,737" with the usual added/removed colours.
export function Lines({ add, del }: { add: number; del: number }) {
  return (
    <>
      <span className="plus">+{humanNum(add)}</span> <span className="minus">−{humanNum(del)}</span>
    </>
  );
}
