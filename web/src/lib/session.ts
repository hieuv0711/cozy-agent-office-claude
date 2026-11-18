import type { OfficeSession, OfficeSub } from '../api';
import { fmtDur } from '../fmt';

// Plain words for what a session (or one of its helpers) is doing, shared by
// the captions, the detail panel, the mini window and the tank's labels.

function shortTarget(t: string) {
  if (!t) return '';
  if (/^[~./\w-]+\/[\w./-]+$/.test(t)) return t.split('/').pop() || t;
  return t.length > 34 ? t.slice(0, 33) + '…' : t;
}

// Live sessions run on the wall clock; a replayed one on its replay position.
export function clockOf(s: OfficeSession): number {
  return s.replay ? s.lastActivity : Date.now();
}

export function actionText(s: OfficeSession): string {
  if (s.status === 'needs-you') {
    const why = s.waitingFor ? s.waitingFor[0].toUpperCase() + s.waitingFor.slice(1) : 'Needs your input';
    return s.now ? `${why}: ${s.now.short}` : why;
  }
  if (s.status === 'working') {
    if (s.now) return `${s.now.short} ${shortTarget(s.now.target)}`.trim();
    if (s.subsRunning) return `${s.subsRunning} subagent${s.subsRunning > 1 ? 's' : ''} running`;
    return 'Thinking…';
  }
  return `Idle ${fmtDur(clockOf(s) - (s.statusSince || s.lastActivity))}`;
}

const MAX_HELPERS = 9;

// A helper's type, in words. Claude Code names its helper types in code
// ("general-purpose", "Explore"); a person reads them better as roles.
const HELPER_KINDS: Record<string, [string, string]> = {
  'general-purpose': ['Helper', "Claude Code's all-round helper: a session hands it a task when no specialist fits"],
  explore: ['Explorer', 'Searches and reads through the code, and reports what it found'],
  plan: ['Planner', 'Works out a plan before anything is changed'],
  'claude-code-guide': ['Guide', 'Answers questions about Claude Code itself'],
  'statusline-setup': ['Status line setup', "Sets up Claude Code's status line"],
  'web-fetch': ['Web reader', 'Reads web pages and reports back'],
  fork: ['Copy', 'A copy of the session working on a side task'],
};

/** A helper's kind in a word or two, and what that kind of helper does (for a tooltip). */
export function helperKind(type: string | undefined): { word: string; hint: string } {
  if (!type) return { word: 'Helper', hint: 'A helper this session started' };
  const known = HELPER_KINDS[type.toLowerCase()];
  if (known) return { word: known[0], hint: known[1] };
  // a plugin's helper ("plugin:coder"): its own name, in words
  const name = type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type;
  const words = name.replace(/[-_]+/g, ' ').trim();
  return { word: words ? words[0].toUpperCase() + words.slice(1) : 'Helper', hint: `A "${type}" helper` };
}

/** What a helper is called on its tag: a teammate's name, else its task, else its kind. */
export function helperTitle(b: OfficeSub): string {
  return (b.name || '').trim() || (b.desc || '').trim() || helperKind(b.type).word;
}

/** What a helper is to its session, ahead of the session's name: "Explorer for", "Teammate of". */
export function helperRel(b: OfficeSub): string {
  return b.kind === 'teammate' ? 'Teammate of' : `${helperKind(b.type).word} for`;
}

/** Whose helper it is, on its tag and atop its tooltip: "Explorer for web-shop-81", "Teammate of web-shop-81". */
export function helperOf(b: OfficeSub, owner: string): string {
  return `${helperRel(b)} ${owner}`;
}

/** A helper's tooltip: whose helper it is, its task, what it does now and for how long; and, quieter, what its kind does. */
export function helperTip(b: OfficeSub, owner: string, at = Date.now()): { title: string; text: string; note: string } {
  const kind = helperKind(b.type);
  const title = helperTitle(b);
  const task = (b.desc || '').trim();
  const done = b.status !== 'running' && b.status !== 'idle';
  const lines = [helperOf(b, owner)];
  if (task && task !== title) lines.push(`Task: ${task}`);
  if (done) lines.push(b.status === 'failed' ? 'Stopped on a failed step' : 'Finished its task');
  else if (b.now) lines.push(`Now: ${`${b.now.short} ${shortTarget(b.now.target)}`.trim()}`);
  else lines.push(b.status === 'idle' ? 'Waiting for its next task' : `Now: ${b.phase || 'thinking'}`);
  const counts: string[] = [];
  if (!done && b.startedAt) counts.push(`started ${fmtDur(at - b.startedAt)} ago`);
  if (b.toolCalls) counts.push(`${b.toolCalls} step${b.toolCalls === 1 ? '' : 's'} so far`);
  if (counts.length) lines.push(counts.join(', ').replace(/^./, (c) => c.toUpperCase()));
  return { title, text: lines.join('\n'), note: `${kind.hint}. Click for its steps in the card.` };
}

export function botLabel(b: OfficeSub): string {
  const done = b.status !== 'running' && b.status !== 'idle';
  return b.now ? b.now.short : done ? (b.status === 'failed' ? 'failed' : 'done') : b.phase || (b.status === 'idle' ? 'standing by' : 'thinking');
}

// Which helpers to show for a session: running ones first, then ones that
// finished in the last minute or so. Chips only when there are few of them.
export function botsFor(s: OfficeSession) {
  const list = s.subs.slice(0, MAX_HELPERS);
  const runningShown = list.filter((b) => b.status === 'running').length;
  return { list, extra: Math.max(0, s.subsRunning - runningShown), chip: list.length <= 4 };
}
