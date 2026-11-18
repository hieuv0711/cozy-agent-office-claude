import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayKey, type Detail, type History, type HistoryFilter, type Summary } from '../api';
import type { Replay } from '../replay';
import '../history.css';
import { HistoryFilters } from './HistoryFilters';
import { useDiary, useSession } from './history-data';
import { SessionPage } from './history-session';
import { ActivityStrip } from './history-strip';
import {
  clockOf,
  counted,
  dateWords,
  dayPhrase,
  dayTitle,
  endingOf,
  firstWords,
  highlight,
  historyMemory,
  humanDur,
  cleanTitle,
  KEPT_NOTE,
  keyDate,
  lastDay,
  numberWord,
  weekdayOf,
  workedMs,
} from './history-words';
import { tip } from './Tooltip';

// History as a diary: a page per day (Today, Yesterday, then dates), a short
// card per session in words, and the open session beside it (or on its own
// page in a narrow window). No token or cost figures until "Numbers".

function useWide(query = '(min-width: 1100px)') {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return wide;
}

type Page = { key: string; sessions: Summary[] };

// A session goes on the page of the last day it was active (inside the chosen
// range), newest first.
function diaryPages(list: Summary[], from: string, to: string): Page[] {
  const m = new Map<string, Summary[]>();
  for (const s of list) {
    const k = lastDay(s, from, to);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(s);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, ss]) => ({ key, sessions: ss.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)) }));
}

// "since Saturday" for a session that began earlier in the week, "since 3 Nov" before that.
function since(start: string, page: string): string {
  if (start >= page) return '';
  const days = Math.round((keyDate(page).getTime() - keyDate(start).getTime()) / 86_400_000);
  return days <= 6 ? ` since ${weekdayOf(start)}` : ` since ${dateWords(start, 'none')}`;
}

function endWords(s: Summary, page: string): string {
  const ms = workedMs(s);
  const worked = humanDur(ms);
  const from = since(dayKey(s.startedAt || s.endedAt), page);
  if (s.live) return `${worked} of work${from}`;
  const k = dayKey(s.endedAt);
  const at = k === page ? `at ${clockOf(s.endedAt)}` : `${dayPhrase(k)} at ${clockOf(s.endedAt)}`;
  const ended = `${s.archived ? 'ended' : 'Ended'} ${at}`;
  return ms < 60_000 ? `${ended}, within a minute` : `${ended} after ${worked} of work${from}`;
}

// A failed step is worth a note on the card when the session ended on one.
// (Most sessions have commands that exit with an error along the way; their
// page lists every one.) Asked for sessions with failed steps, every card
// says how many.
function failNote(s: Summary, counting: boolean): string {
  const n = s.errors || 0;
  if (counting && n > 0) return `${counted(n, 'step')} failed${s.endedFailed ? ', the last one too' : ''}`;
  if (s.endedFailed) return n > 1 ? `ended on a failed step, ${numberWord(n)} in all` : 'ended on a failed step';
  return '';
}

function Card({ s, page, on, counting, onOpen, onReplay }: { s: Summary; page: string; on: boolean; counting: boolean; onOpen: (id: string) => void; onReplay: (id: string) => void }) {
  const ending = endingOf(s);
  const note = failNote(s, counting);
  const term = s.match?.term || '';
  const title = cleanTitle(s.title);
  const snippet = s.match && !title.toLowerCase().includes(s.match.term.toLowerCase()) ? s.match : null;
  const said = snippet ? '' : firstWords(s.lastText);
  return (
    <li className={`dy-card${on ? ' on' : ''}`} data-sid={s.id} data-failed={s.errors || undefined}>
      <h3 className="dy-title">
        <button type="button" className="dy-open" aria-current={on ? 'true' : undefined} onClick={() => onOpen(s.id)}>
          <span className="dy-clamp">{highlight(title, term)}</span>
        </button>
      </h3>
      <p className="dy-meta">
        <span className="dy-proj">{s.project}</span>
        <span className="dy-sep" aria-hidden="true">
          ·
        </span>
        {ending !== 'ended' && (
          <>
            <span className={`dy-ending ${ending}`} {...(ending === 'kept' ? tip(KEPT_NOTE) : {})}>
              {ending === 'running' ? 'Still running' : 'Kept'}
            </span>
            <span className="dy-sep" aria-hidden="true">
              ·
            </span>
          </>
        )}
        <span>{endWords(s, page)}</span>
        {note && (
          <>
            <span className="dy-sep" aria-hidden="true">
              ·
            </span>
            <span className="dy-fail">
              <span aria-hidden="true">▲ </span>
              {note}
            </span>
          </>
        )}
      </p>
      {snippet && <p className="dy-match">{highlight(snippet.text, snippet.term)}</p>}
      {said && <p className="dy-said">{said}</p>}
      <button type="button" className="dy-replay" aria-label={`Replay ${title}`} onClick={() => onReplay(s.id)}>
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
          <path d="M1 1 L9 6 L1 11 Z" fill="currentColor" />
        </svg>
        Replay
      </button>
    </li>
  );
}

const Diary = memo(function Diary({
  data,
  error,
  pages,
  shown,
  filter,
  setFilter,
  onOpen,
  onReplay,
}: {
  data: History | null;
  error: string;
  pages: Page[];
  shown: string | null;
  filter: HistoryFilter;
  setFilter: (f: HistoryFilter) => void;
  onOpen: (id: string) => void;
  onReplay: (id: string) => void;
}) {
  const hiddenEmpty = data?.hiddenEmpty || 0;
  return (
    <section className="hx-diary" aria-label="Diary">
      <div className="hx-diary-head">
        <HistoryFilters filter={filter} onChange={setFilter} data={data} />
        <ActivityStrip calendar={data?.calendar} from={filter.from} to={filter.to} onPick={(from, to) => setFilter({ ...filter, from, to })} />
      </div>
      <div className="hx-pages">
        {error && <p className="err hx-msg">Couldn't read the history: {error}</p>}
        {!data && !error && (
          <>
            <p className="loading hx-msg">Opening the diary…</p>
            <div className="dy-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="dy-ghost">
                  <i style={{ width: `${72 - i * 9}%` }} />
                  <i style={{ width: `${46 + i * 6}%` }} />
                </div>
              ))}
            </div>
          </>
        )}
        {data && !pages.length && (
          <div className="hx-msg hx-none">
            <p>{filter.q ? `Nothing in the diary mentions “${filter.q}”.` : filter.problems ? 'No session had a step fail here.' : 'No sessions here.'}</p>
            <p className="note">
              {filter.q ? 'Try fewer words, or another time or project.' : 'Try another time, project or kind of session.'}
              {data.hiddenEmpty && !filter.empty ? ` Empty sessions are hidden too.` : ''}
            </p>
          </div>
        )}
        {pages.map((p) => {
          const title = dayTitle(p.key);
          return (
            <section key={p.key} className="dy-page" aria-labelledby={`dy-${p.key}`}>
              <header className="dy-page-head">
                <h2 className="dy-day" id={`dy-${p.key}`}>
                  {title}
                </h2>
                {(title === 'Today' || title === 'Yesterday') && <span className="dy-date">{dateWords(p.key)}</span>}
                <span className="dy-count">{p.sessions.length === 1 ? '1 session' : `${p.sessions.length} sessions`}</span>
              </header>
              <ol className="dy-cards">
                {p.sessions.map((s) => (
                  <Card key={s.id} s={s} page={p.key} on={s.id === shown} counting={!!filter.problems} onOpen={onOpen} onReplay={onReplay} />
                ))}
              </ol>
            </section>
          );
        })}
        {data && (hiddenEmpty > 0 || filter.empty) && (
          <p className="hx-foot">
            {filter.empty ? 'Empty sessions are shown too. ' : `${counted(hiddenEmpty, 'empty session')} ${hiddenEmpty === 1 ? 'is' : 'are'} hidden (nothing was asked or done). `}
            <button type="button" className="linkish" onClick={() => setFilter({ ...filter, empty: !filter.empty })}>
              {filter.empty ? 'Hide them' : 'Show them'}
            </button>
          </p>
        )}
      </div>
    </section>
  );
});

export function HistoryView({
  replay,
  setReplay,
  onWatch,
  onTeam,
  filter,
  setFilter,
}: {
  replay: Replay | null;
  setReplay: (r: Replay | null) => void;
  onWatch: (d: Detail) => void;
  onTeam: (id: string) => void;
  filter: HistoryFilter;
  setFilter: (f: HistoryFilter) => void;
}) {
  const { data, error } = useDiary(filter);
  const wide = useWide();
  const [sid, setSid] = useState<string | null>(() => historyMemory.sid);
  const pages = useMemo(() => diaryPages(data?.sessions || [], filter.from, filter.to), [data, filter.from, filter.to]);
  // The open session: the one picked, while it is in the list; side by side,
  // the newest finished one until something is picked.
  const listed = !data || data.sessions.some((s) => s.id === sid);
  const first = pages[0]?.sessions.find((s) => !s.live) || pages[0]?.sessions[0] || null;
  const shown = sid && listed ? sid : wide ? first?.id || null : null;
  const reading = !wide && !!shown;
  const { detail: d, error: dErr } = useSession(shown);

  const rootRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const replayRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const diaryTop = useRef(0);
  const opened = useRef<string | null>(null);
  const playNext = useRef<string | null>(null);
  const replayNow = useRef(replay);
  replayNow.current = replay;
  const dNow = useRef(d);
  dNow.current = d;

  const play = useCallback(
    (det: Detail) => {
      const r = replayNow.current;
      const mine = r && r.detail.id === det.id ? r : null;
      setReplay({ detail: det, t: mine && mine.t < det.endedAt ? mine.t : det.startedAt, playing: true, pace: mine?.pace || 'normal', watching: false });
      window.requestAnimationFrame(() => replayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    },
    [setReplay],
  );
  const onOpen = useCallback(
    (id: string) => {
      if (rootRef.current && !window.matchMedia('(min-width: 1100px)').matches) diaryTop.current = rootRef.current.scrollTop;
      opened.current = id;
      historyMemory.sid = id;
      setSid(id);
    },
    [],
  );
  const onReplay = useCallback(
    (id: string) => {
      onOpen(id);
      if (dNow.current?.id === id) play(dNow.current);
      else playNext.current = id;
    },
    [onOpen, play],
  );
  const back = useCallback(() => {
    historyMemory.sid = null;
    setSid(null);
  }, []);

  // arriving with a session already open (from Recap, or back from the place):
  // bring its card into view once the diary is there
  const arrive = useRef(sid);
  useEffect(() => {
    if (!arrive.current || !data || !wide) return;
    const el = rootRef.current?.querySelector(`[data-sid="${CSS.escape(arrive.current)}"]`);
    arrive.current = null;
    el?.scrollIntoView({ block: 'center' });
  }, [data, wide]);

  // a Replay pressed on a card starts once its session has loaded
  useEffect(() => {
    if (d && playNext.current === d.id) {
      playNext.current = null;
      play(d);
    }
  }, [d, play]);

  // side by side: a newly opened session starts at its top
  useEffect(() => {
    if (wide && paneRef.current && !playNext.current) paneRef.current.scrollTop = 0;
  }, [shown, wide]);

  // narrow: the session replaces the diary; coming back restores the place and focus
  const wasReading = useRef(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const was = wasReading.current;
    wasReading.current = reading;
    if (!root || wide) return;
    if (reading) root.scrollTop = 0;
    else if (was) {
      root.scrollTop = diaryTop.current;
      const id = opened.current;
      if (id) (root.querySelector(`[data-sid="${CSS.escape(id)}"] .dy-open`) as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }, [reading, wide]);
  useEffect(() => {
    if (reading && d) headRef.current?.focus({ preventScroll: true });
  }, [reading, d]);
  useEffect(() => {
    if (!reading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading, back]);

  return (
    <div className={`hx${reading ? ' reading' : ''}`} ref={rootRef}>
      {!reading && <Diary data={data} error={error} pages={pages} shown={shown} filter={filter} setFilter={setFilter} onOpen={onOpen} onReplay={onReplay} />}
      {(wide || reading) && (
        <section className="hx-pane" aria-label="Session" ref={paneRef}>
          {!shown && data && pages.length > 0 && <p className="hx-msg">Pick a session in the diary to read it here.</p>}
          {shown && !d && !dErr && <p className="loading hx-msg">Opening the session…</p>}
          {shown && dErr && !d && <p className="err hx-msg">Couldn't open this session: {dErr}</p>}
          {d && (
            <SessionPage
              d={d}
              replay={replay}
              setReplay={setReplay}
              onWatch={() => {
                historyMemory.sid = d.id;
                onWatch(d);
              }}
              onTeam={() => {
                historyMemory.sid = d.id;
                onTeam(d.id);
              }}
              onBack={reading ? back : undefined}
              headRef={headRef}
              num={data?.sessions.find((s) => s.id === d.id)?.num}
              ref={replayRef}
            />
          )}
        </section>
      )}
    </div>
  );
}
