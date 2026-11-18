import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { addDays, dayKey, EMPTY_FILTER, type Recap, type Summary } from '../api';
import { fmtUsd } from '../fmt';
import '../history.css';
import { useDiary, useRecapData } from './history-data';
import { ModelSheet } from './recap-model';
import {
  cap,
  COST_NOTE,
  counted,
  dateWords,
  dayTitle,
  Fig,
  historyMemory,
  humanDur,
  cleanTitle,
  humanNum,
  keyDate,
  Lines,
  listWords,
  Numbers,
  shortDur,
  todayKey,
  ToolList,
  weekdayOf,
  workedMs,
} from './history-words';
import { tip } from './Tooltip';

// Recap as a digest: a period, a paragraph in plain words, a few highlights
// with one number each, agent time per day, the projects that took the time,
// and the raw figures folded away under "Numbers".

type PeriodId = 'today' | 'yesterday' | 'week' | '7d' | 'month';
type Period = { id: PeriodId; label: string; from: string; to: string; cols: string[]; words: string; lead: string };

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 40; k = addDays(k, 1)) out.push(k);
  return out;
}

function periods(): Period[] {
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const d = keyDate(today);
  const monday = addDays(today, -((d.getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  const first = dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const week7 = addDays(today, -6);
  return [
    { id: 'today', label: 'Today', from: today, to: today, cols: [today], words: dateWords(today), lead: 'Today' },
    { id: 'yesterday', label: 'Yesterday', from: yesterday, to: yesterday, cols: [yesterday], words: dateWords(yesterday), lead: 'Yesterday' },
    { id: 'week', label: 'This week', from: monday, to: today, cols: dayList(monday, sunday), words: `Week of ${dateWords(monday)}`, lead: 'This week' },
    { id: '7d', label: 'Last 7 days', from: week7, to: today, cols: dayList(week7, today), words: `${dateWords(week7)} to ${dateWords(today)}`, lead: 'In the last 7 days' },
    { id: 'month', label: 'This month', from: first, to: today, cols: dayList(first, last), words: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, lead: 'This month' },
  ];
}

const QUIET: Record<PeriodId, string> = {
  today: 'Nothing yet today: no sessions so far.',
  yesterday: 'Yesterday was quiet: no sessions at all.',
  week: 'Nothing yet this week: no sessions so far.',
  '7d': 'The last 7 days were quiet: no sessions at all.',
  month: 'Nothing yet this month: no sessions so far.',
};

const min2ms = (m: number) => m * 60_000;

// A day named the way the period reads: weekdays inside a week, dates in a month.
function dayName(k: string, p: Period): string {
  const t = dayTitle(k);
  if (t === 'Today' || t === 'Yesterday') return t;
  return p.id === 'month' ? dateWords(k) : weekdayOf(k);
}

type ProjectRow = [string, Recap['projects'][string]];

function Digest({ r, p, projects, busiest, running }: { r: Recap; p: Period; projects: ProjectRow[]; busiest: string | null; running: number }) {
  const total = projects.reduce((n, [, v]) => n + v.active, 0);
  if (!r.sessions || !total) return <p className="rc-digest">{QUIET[p.id]}</p>;
  const today = todayKey();
  const B = (s: string) => <b>{s}</b>;
  const parts: ReactNode[] = [];
  const [a, b, c] = projects;
  const share = (x: ProjectRow) => x[1].active / total;
  if (projects.length === 1) parts.push(<>{p.lead} everything happened in {B(a[0])}.</>);
  else if (share(a) >= 0.6) parts.push(<>{p.lead} you mostly worked on {B(a[0])}.</>);
  else if (projects.length === 2 || share(a) + share(b) >= 0.6) parts.push(<>{p.lead} you mostly worked on {B(a[0])} and {B(b[0])}.</>);
  else
    parts.push(
      <>
        {p.lead} your time was spread over {counted(projects.length, 'project')}, most of all {B(a[0])}, {B(b[0])} and {B(c[0])}.
      </>,
    );
  if (p.cols.length > 1) {
    const past = p.cols.filter((k) => k >= p.from && k <= today);
    const worked = past.filter((k) => (r.days[k]?.active || 0) > 0);
    if (worked.length > 1 && busiest) parts.push(busiest === today ? <>{B('Today')} has been the busiest day.</> : <>{B(dayName(busiest, p))} was the busiest day.</>);
    // a day still going is never called quiet
    const quiet = past.filter((k) => k !== today && !(r.days[k]?.active || 0));
    if (!quiet.length && past.length >= 3) parts.push(<>Your agents worked every day.</>);
    else if (quiet.length === 1 || quiet.length === 2) parts.push(<>{listWords(quiet.map((k) => dayName(k, p)))} {quiet.length === 1 ? 'was' : 'were'} quiet.</>);
    else if (quiet.length > 2) parts.push(<>{cap(counted(quiet.length, 'day'))} were quiet.</>);
  }
  if (running > 0 && p.to === today) parts.push(<>{cap(counted(running, 'session'))} {running === 1 ? 'is' : 'are'} still running.</>);
  return (
    <p className="rc-digest">
      {parts.map((x, i) => (
        <Fragment key={i}>
          {i ? ' ' : ''}
          {x}
        </Fragment>
      ))}
    </p>
  );
}

function niceHours(h: number): number {
  for (const m of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 50, 60, 80, 100, 150, 200]) if (m >= h) return m;
  return Math.ceil(h / 100) * 100;
}

// Agent time per day as plain columns: each past day is a button that opens it
// in History; days still to come are drawn empty.
function DayChart({ r, p, busiest, onOpenDay }: { r: Recap; p: Period; busiest: string | null; onOpenDay: (k: string) => void }) {
  const today = todayKey();
  const mins = p.cols.map((k) => r.days[k]?.active || 0);
  const top = niceHours(Math.max(...mins, 30) / 60);
  const dense = p.cols.length > 14;
  const [tip, setTip] = useState<number | null>(null);
  const style = { '--cols': p.cols.length } as CSSProperties;
  return (
    <figure className={`rc-chart${dense ? ' dense' : ''}`} aria-labelledby="rc-chart-h">
      <figcaption className="rc-h" id="rc-chart-h">
        Agent time per day
      </figcaption>
      <div className="rc-plot" style={style} onMouseLeave={() => setTip(null)}>
        {dense && (
          <div className="rc-grid" aria-hidden="true">
            {[top, top / 2].map((h) => (
              <span key={h} data-h={`${h} h`} style={{ bottom: `${(h / top) * 100}%` }} />
            ))}
          </div>
        )}
        {p.cols.map((k, i) => {
          const m = mins[i];
          const future = k > today || k < p.from;
          const d = keyDate(k);
          const label = (
            <span className={`rc-day${k === today ? ' now' : ''}`}>
              {dense ? d.getDate() : weekdayOf(k, true)}
              {!dense && <small>{d.getDate()}</small>}
            </span>
          );
          const bar = (
            <span className="rc-area">
              {!dense && m > 0 && <span className="rc-val">{shortDur(min2ms(m))}</span>}
              <span className={`rc-bar${m ? '' : ' none'}`} style={{ height: m ? `max(3px, ${(m / 60 / top) * 100}%)` : undefined }} />
            </span>
          );
          if (future)
            return (
              <div key={k} className="rc-col later" aria-hidden="true">
                {bar}
                {label}
              </div>
            );
          return (
            <button
              key={k}
              type="button"
              className={`rc-col${k === busiest ? ' top' : ''}`}
              aria-label={`${dateWords(k)}: ${m ? `${humanDur(min2ms(m))} of agent work` : 'no work'}. Open this day in History.`}
              onClick={() => onOpenDay(k)}
              onMouseEnter={() => setTip(i)}
              onFocus={() => setTip(i)}
              onBlur={() => setTip(null)}
            >
              {bar}
              {label}
            </button>
          );
        })}
        {tip != null && (
          <div className="rc-tip" role="presentation" style={{ left: dense ? `calc(40px + (100% - 40px) * ${(tip + 0.5) / p.cols.length})` : `${((tip + 0.5) / p.cols.length) * 100}%` }}>
            <b>{dateWords(p.cols[tip])}</b>
            <span>{mins[tip] ? `${humanDur(min2ms(mins[tip]))} of agent work` : 'No work'}</span>
            <span className="note">Click to open this day in History</span>
          </div>
        )}
      </div>
      <p className="note rc-chart-note">Time adds up across sessions that ran side by side, so a busy day can hold more hours than the clock did.</p>
    </figure>
  );
}

function Projects({ projects, onOpen }: { projects: ProjectRow[]; onOpen: (p: string) => void }) {
  const [all, setAll] = useState(false);
  const max = projects[0]?.[1].active || 1;
  const shown = all ? projects : projects.slice(0, 6);
  return (
    <section className="rc-projects" aria-labelledby="rc-proj-h">
      <h2 className="rc-h" id="rc-proj-h">
        Top projects by time
      </h2>
      <ol className="rc-plist">
        {shown.map(([name, v]) => (
          <li key={name}>
            <button type="button" className="rc-pname" onClick={() => onOpen(name)} {...tip(`Open ${name} in History`)}>
              {name}
            </button>
            <span className="rc-pbar" aria-hidden="true">
              <i style={{ width: `${Math.max(1.5, (v.active / max) * 100)}%` }} />
            </span>
            <span className="rc-pdur">{humanDur(min2ms(v.active))}</span>
          </li>
        ))}
      </ol>
      {projects.length > 6 && (
        <button type="button" className="linkish rc-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show only the top six' : `Show all ${projects.length} projects`}
        </button>
      )}
    </section>
  );
}

function High({ label, value, sub, words, small }: { label: string; value: ReactNode; sub?: ReactNode; words?: boolean; small?: boolean }) {
  return (
    <div className="rc-high">
      <dt>{label}</dt>
      <dd className={words ? `rc-word${small ? ' small' : ''}` : 'rc-fig'}>{value}</dd>
      {sub ? <dd className="rc-sub">{sub}</dd> : null}
    </div>
  );
}

export function RecapView({ onOpenDay }: { onOpenDay: (from: string, to: string, project?: string) => void }) {
  // a day or a project opens on its diary page, not on a session left open earlier
  const openDiary = (from: string, to: string, project?: string) => {
    historyMemory.sid = null;
    onOpenDay(from, to, project);
  };
  const ps = periods();
  const [pid, setPid] = useState<PeriodId>('7d');
  const p = ps.find((x) => x.id === pid) || ps[3];
  const { data: loaded, error } = useRecapData(p.from, p.to);
  // the model whose cost is opened, if any
  const [model, setModel] = useState<string | null>(null);
  // right after switching periods the previous one is still loaded: wait for this one
  const r = loaded && loaded.from === keyDate(p.from).getTime() && loaded.to === keyDate(p.to).getTime() + 86_400_000 - 1 ? loaded : null;
  // the sessions of the period, for the longest one and the ones still running
  const hf = useMemo(() => ({ ...EMPTY_FILTER, from: p.from, to: p.to }), [p.from, p.to]);
  const { data: h } = useDiary(hf);

  const projects: ProjectRow[] = useMemo(
    () => (r ? Object.entries(r.projects).filter(([, v]) => v.active > 0).sort((a, b) => b[1].active - a[1].active) : []),
    [r],
  );
  const workedMin = r ? Object.values(r.days).reduce((n, d) => n + d.active, 0) : 0;
  const busiest = useMemo(() => {
    if (!r) return null;
    const ks = p.cols.filter((k) => k >= p.from && k <= p.to && (r.days[k]?.active || 0) > 0);
    return ks.sort((a, b) => r.days[b].active - r.days[a].active)[0] || null;
  }, [r, p.cols, p.from, p.to]);
  const longest = useMemo(() => {
    let best: { s: Summary; ms: number } | null = null;
    for (const s of h?.sessions || []) {
      const ms = workedMs(s, p.from, p.to);
      if (!best || ms > best.ms) best = { s, ms };
    }
    return best;
  }, [h, p.from, p.to]);
  const running = (h?.sessions || []).filter((s) => s.live).length;
  const multi = p.cols.length > 1;
  const workedDays = r ? p.cols.filter((k) => k >= p.from && k <= p.to && (r.days[k]?.active || 0) > 0).length : 0;
  // a busiest day only means something once two days had work
  const showBusiest = multi && !!busiest && workedDays > 1;
  const sums = useMemo(() => {
    const z = { tok: 0, usd: 0, add: 0, del: 0, prompts: 0, tools: 0 };
    for (const d of Object.values(r?.days || {})) {
      z.tok += d.tok;
      z.usd += d.usd;
      z.add += d.add;
      z.del += d.del;
      z.prompts += d.prompts;
      z.tools += d.tools;
    }
    return z;
  }, [r]);
  const models = r ? Object.entries(r.models).sort((a, b) => b[1] - a[1]) : [];
  const busy = !!r && r.sessions > 0 && workedMin > 0;

  return (
    <div className="rc">
      <div className="rc-col-wrap">
        <header className="rc-head">
          <div className="rc-titles">
            <h1 className="rc-title">Recap</h1>
            <p className="rc-period">{p.words}</p>
          </div>
          <div className="seg rc-seg" role="group" aria-label="Period">
            {ps.map((x) => (
              <button key={x.id} type="button" aria-pressed={pid === x.id} onClick={() => setPid(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        </header>

        {error && <p className="err">Couldn't add things up: {error}</p>}
        {!r && !error && <p className="loading">Adding things up…</p>}
        {r && (
          <>
            <Digest r={r} p={p} projects={projects} busiest={busiest} running={running} />
            {busy && (
              <dl className={`rc-highs${showBusiest ? '' : ' four'}`}>
                <High label="Your agents worked" value={humanDur(min2ms(workedMin))} sub="busy time, all sessions added up" />
                <High label="Sessions" value={humanNum(r.sessions)} sub={`in ${counted(projects.length, 'project')}`} />
                {showBusiest && busiest && (
                  <High
                    label="Busiest day"
                    words
                    value={dayName(busiest, p)}
                    sub={
                      <>
                        <span className="mono">{humanDur(min2ms(r.days[busiest]?.active || 0))}</span> of agent work
                      </>
                    }
                  />
                )}
                {projects[0] && (
                  <High
                    label="Most time on"
                    words
                    value={
                      <button type="button" className="rc-link" onClick={() => openDiary(p.from, p.to, projects[0][0])}>
                        {projects[0][0]}
                      </button>
                    }
                    sub={
                      <>
                        <span className="mono">{humanDur(min2ms(projects[0][1].active))}</span> of agent work
                      </>
                    }
                  />
                )}
                <High
                  label="Longest session"
                  words
                  small
                  value={
                    longest && longest.ms > 0 ? (
                      <button
                        type="button"
                        className="rc-link"
                        {...tip(cleanTitle(longest.s.title))}
                        onClick={() => {
                          historyMemory.sid = longest.s.id;
                          onOpenDay(p.from, p.to);
                        }}
                      >
                        <span className="rc-clamp">{cleanTitle(longest.s.title)}</span>
                      </button>
                    ) : (
                      <span className="rc-wait">…</span>
                    )
                  }
                  sub={
                    longest && longest.ms > 0 ? (
                      <>
                        <span className="mono">{humanDur(longest.ms)}</span> in <span className="rc-nb">{longest.s.project}</span>
                      </>
                    ) : undefined
                  }
                />
              </dl>
            )}
            {busy && (
              <div className={`rc-body${multi ? '' : ' single'}`}>
                {multi && <DayChart r={r} p={p} busiest={busiest} onOpenDay={(k) => openDiary(k, k)} />}
                <Projects projects={projects} onOpen={(name) => openDiary(p.from, p.to, name)} />
              </div>
            )}
            {busy && (
              <Numbers hint="tokens, estimated cost, lines changed, tools">
                <div className="rc-nums">
                  <dl className="figs">
                    <Fig k="Tokens" v={humanNum(sums.tok)} />
                    <Fig k="Estimated cost" v={fmtUsd(sums.usd)} note={COST_NOTE} />
                    <Fig k="Lines changed" v={<Lines add={sums.add} del={sums.del} />} />
                    <Fig k="Prompts you wrote" v={humanNum(sums.prompts)} />
                    <Fig k="Tool calls" v={humanNum(sums.tools)} />
                  </dl>
                  <div>
                    <h3 className="nums-sub">Most used tools</h3>
                    <ToolList tools={r.tools} max={10} />
                    {models.length > 0 && (
                      <>
                        <h3 className="nums-sub" id="rc-models-h">
                          Estimated cost by model
                        </h3>
                        <ul className="rc-models" aria-labelledby="rc-models-h">
                          {models.map(([m, usd]) => (
                            <li key={m}>
                              <button type="button" className="rc-model" onClick={() => setModel(m)} aria-haspopup="dialog">
                                <span className="rc-model-name">{m}</span>
                                <span className="rc-model-usd">{fmtUsd(usd)}</span>
                                <span className="rc-model-go">See what it did</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="note">
                      Tools count whole sessions that were active {p.id === 'today' || p.id === 'yesterday' ? 'that day' : 'in this period'}
                      {r.modelsWhole ? `; so does the cost of ${counted(r.modelsWhole, 'older session')}` : ''}.
                    </p>
                  </div>
                </div>
              </Numbers>
            )}
          </>
        )}
        {model && (
          <ModelSheet
            model={model}
            from={p.from}
            to={p.to}
            period={p.words}
            days={p.cols.filter((k) => k >= p.from && k <= p.to)}
            onClose={() => setModel(null)}
            onOpenProject={(name) => {
              setModel(null);
              openDiary(p.from, p.to, name);
            }}
            onOpenSession={(id) => {
              setModel(null);
              historyMemory.sid = id;
              onOpenDay(p.from, p.to);
            }}
          />
        )}
      </div>
    </div>
  );
}
