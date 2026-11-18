import { useState } from 'react';
import { focusTerminal, type OfficeSession } from '../api';
import { actionText, clockOf } from '../lib/session';
import { sessionColor } from '../theme';
import { CameraBar } from './CameraBar';
import { MusicPlayer } from './MusicPlayer';
import { PomodoroChip } from './PomodoroChip';
import { tip } from './Tooltip';

// The lower letterbox rail: every busy session speaks what it is doing as a
// subtitle. Waiting sessions come first, in yellow. A working line fills like
// karaoke against how long that kind of work usually takes in this session
// (a rough default when there is no history yet), then rests fully lit; past
// one and a half times that, only its timer turns peach.

const MAX_LINES = 3;

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function lastPart(t: string) {
  if (!t) return '';
  if (/^[~./\w-]+\/[\w./-]+$/.test(t)) return t.split('/').pop() || t;
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

// What a waiting session is asking, in its own words where we can tell.
function askText(s: OfficeSession) {
  const tool = s.now?.tool || '';
  if (tool === 'AskUserQuestion') return 'Has a question for you';
  if (tool === 'ExitPlanMode') return 'Wants you to approve a plan';
  if (/permission/i.test(s.waitingFor) && s.now) {
    const target = lastPart(s.now.target);
    if (tool === 'Bash') return target ? `Can I run ${target}?` : 'Can I run a command?';
    if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') return target ? `Can I edit ${target}?` : 'Can I edit a file?';
    if (tool === 'WebFetch') return 'Can I open a web page?';
    return `Can I use ${s.now.short}?`;
  }
  return actionText(s);
}

interface Line {
  s: OfficeSession;
  ask: boolean;
  text: string;
  elapsed: number;
  unlit: number; // 0..1 of the caption not yet sung
  over: boolean; // past the typical time: a second sweep in peach
  typical: number;
  estimate: boolean; // no history yet: the typical time is a rough default
}

// Rough typical durations when a session has no history for this kind of work yet.
const ROUGH: Record<string, number> = { read: 3000, edit: 4000, run: 25_000, web: 10_000, agent: 90_000, mcp: 8000, plan: 20_000, other: 6000 };
const ROUGH_THINK = 12_000;
const ROUGH_HELPERS = 90_000;

function lineOf(s: OfficeSession): Line {
  const now = clockOf(s);
  if (s.status === 'needs-you') {
    return { s, ask: true, text: askText(s), elapsed: now - (s.statusSince || s.lastActivity), unlit: 0, over: false, typical: 0, estimate: false };
  }
  let since: number;
  let typical: number;
  let estimate = false;
  if (s.now) {
    // a tool is running: time on this call, against this kind of call's usual time
    since = s.now.since;
    typical = s.now.typicalMs ? Math.max(2000, s.now.typicalMs) : 0;
    if (!typical) {
      typical = ROUGH[s.now.cat] || ROUGH.other;
      estimate = true;
    }
  } else if (s.subsRunning) {
    // helpers out: since the earliest running helper started, against how long helpers usually take
    const running = s.subs.filter((b) => b.status === 'running').map((b) => b.startedAt).filter(Boolean);
    since = running.length ? Math.min(...running) : s.lastActivity || s.statusSince;
    typical = s.helperMs || 0;
    if (!typical) {
      typical = ROUGH_HELPERS;
      estimate = true;
    }
  } else {
    // thinking: since the last thing it did, against its usual thinking stretch
    since = s.lastActivity || s.statusSince;
    typical = s.thinkMs ? Math.max(20_000, s.thinkMs) : 0;
    if (!typical) {
      typical = ROUGH_THINK;
      estimate = true;
    }
  }
  const elapsed = Math.max(0, now - since);
  // the line fills once over the usual time and then rests, fully lit; only
  // the timer turns peach once it runs past one and a half times that
  const over = elapsed > typical * 1.5;
  return { s, ask: false, text: actionText(s), elapsed, typical, unlit: Math.max(0, 1 - elapsed / typical), over, estimate };
}

interface Props {
  sessions: OfficeSession[];
  selected: string | null;
  onSelect: (id: string) => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  onGoTo: (id: string) => void;
}

export function CaptionRail({ sessions, selected, onSelect, showAll, setShowAll, onGoTo }: Props) {
  const [note, setNote] = useState('');
  const waiting = sessions.filter((s) => s.status === 'needs-you').sort((a, b) => a.statusSince - b.statusSince);
  const working = sessions
    .filter((s) => s.status === 'working')
    .sort((a, b) => (b.now?.since || b.statusSince) - (a.now?.since || a.statusSince));
  const speakers = [...waiting, ...working];
  const lines = speakers.slice(0, MAX_LINES).map(lineOf);
  const rest = speakers.length - lines.length;
  const idle = sessions.filter((s) => s.status === 'idle').length;
  const helpers = sessions.reduce((n, s) => n + s.subsRunning, 0);
  // the yellow action works on the waiting session you are looking at, else the one waiting longest
  const target = waiting.find((s) => s.id === selected) || waiting[0];
  const canTerminal = !!target?.pid && !target.headless && !target.replay;
  const answer = async () => {
    if (!target) return;
    onGoTo(target.id);
    if (!canTerminal || !target.pid) return;
    setNote('');
    const err = await focusTerminal(target.pid);
    setNote(err);
  };
  return (
    <footer className="rail" aria-label="Live captions">
      <div className="rail-left">
        <button
          type="button"
          className="rail-label"
          aria-pressed={showAll}
          onClick={() => setShowAll(!showAll)}
          {...tip(showAll ? 'Back to the few who are speaking now' : 'List every session and what it is doing, not just the ones speaking now', showAll ? 'Every session' : 'Now')}
        >
          <span className="title-card">Now</span>
          <span>
            {sessions.length} session{sessions.length === 1 ? '' : 's'}
            {helpers ? ` · ${helpers} helper${helpers === 1 ? '' : 's'}` : ''}
            {idle ? ` · ${idle} idle` : ''}
          </span>
        </button>
        <MusicPlayer />
        <PomodoroChip now={Date.now()} />
      </div>
      <div className="caps" aria-live="polite">
        {lines.map((l) => (
          <button
            key={l.s.id}
            type="button"
            className={`cap${l.ask ? ' ask' : ''}${l.over ? ' over' : ''}`}
            aria-current={selected === l.s.id}
            onClick={() => onSelect(l.s.id)}
            {...tip(
              l.ask
                ? `${l.s.name} is waiting for you. Click to look at them; answer in their terminal.`
                : l.estimate
                  ? `The words light up as the step goes on. With no history for a step like this yet, they guess about ${mmss(l.typical)}. Click to look at ${l.s.name}.`
                  : `The words light up as the step goes on: one like this usually takes about ${mmss(l.typical)} in this session${l.over ? ', and this one is running long' : ''}. Click to look at ${l.s.name}.`,
              l.s.name,
            )}
          >
            <span className="who" style={l.ask ? undefined : { color: sessionColor(l.s.id) }}>
              {l.s.name}
            </span>
            <span className="say">
              <span className="base">{l.text}</span>
              <span
                className="lit"
                key={l.text}
                style={{ ['--unlit' as string]: `${Math.round(l.unlit * 100)}%` }}
                aria-hidden="true"
              >
                {l.text}
              </span>
            </span>
            <span className="t">{mmss(l.elapsed)}</span>
          </button>
        ))}
        {!lines.length && <div className="silence">{sessions.length ? `All quiet. ${idle} idle.` : 'Nobody is here yet.'}</div>}
        {rest > 0 && (
          <button type="button" className="more" onClick={() => setShowAll(true)} {...tip(`${rest} more session${rest === 1 ? ' is' : 's are'} doing something. Click to list everyone.`)}>
            +{rest} more speaking
          </button>
        )}
      </div>
      <div className="rail-tools">
        {target && (
          <button
            type="button"
            className="answer"
            onClick={answer}
            {...tip(canTerminal ? `Brings ${target.name}'s Terminal tab to the front, so you can answer there` : `${target.name} runs without a terminal; this turns the camera to it`)}
          >
            {canTerminal ? `Answer in terminal · ${target.name}` : `Go to ${target.name}`}
          </button>
        )}
        {note && (
          <span className="rail-note" role="status">
            {note}
          </span>
        )}
        <CameraBar hasSelection={!!selected} />
      </div>
    </footer>
  );
}
