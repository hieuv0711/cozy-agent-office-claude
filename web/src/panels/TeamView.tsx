import { useMemo, useState } from 'react';
import { useDetail, type AgentInfo, type Detail, type OfficeSession } from '../api';
import { clock, fmtDur, fmtTok, fmtUsd, plain, totalTok } from '../fmt';
import { helperKind } from '../lib/session';
import { C, sessionColor, STATUS, SUB_STATUS } from '../theme';
import { Empty, Pill } from './bits';
import { LaneLegend, Lanes, type LaneRow } from './Lanes';
import { tip } from './Tooltip';

const SPANS: [string, number][] = [
  ['15 min', 15 * 60_000],
  ['1 hour', 60 * 60_000],
  ['4 hours', 4 * 60 * 60_000],
  ['All', 0],
];

function rowsOf(d: Detail, focus: string | null, showAll: boolean): LaneRow[] {
  const rank = (a: AgentInfo) => (a.kind === 'main' ? -1 : a.status === 'running' ? 0 : a.status === 'idle' ? 1 : 2);
  const list = d.agents.slice().sort((x, y) => rank(x) - rank(y) || y.startedAt - x.startedAt);
  const cut = showAll ? list : list.slice(0, 24);
  if (focus && !cut.some((a) => a.id === focus)) {
    const f = list.find((a) => a.id === focus);
    if (f) cut.push(f);
  }
  return cut.map((a) => ({
    id: a.id,
    label: a.kind === 'main' ? d.project || 'main agent' : a.name || (a.kind === 'subagent' ? helperKind(a.type).word : a.type),
    sub: a.kind === 'main' ? 'main agent' : `${a.phase ? a.phase + ' · ' : ''}${a.desc || (a.kind === 'subagent' ? helperKind(a.type).word : a.type)}`,
    end: a.kind === 'main' ? `${a.toolCalls} calls · ${fmtTok(totalTok(a.tokens))}` : `${(SUB_STATUS[a.status || ''] || SUB_STATUS.running).label} · ${fmtTok(totalTok(a.tokens))}`,
  }));
}

export function TeamView({ sessions, sid, onPick }: { sessions: OfficeSession[]; sid: string | null; onPick: (id: string) => void }) {
  const live = sessions.find((s) => s.id === sid) || null;
  const [span, setSpan] = useState<number>(30 * 60_000);
  const [focus, setFocus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // live sessions: ask the server for the chosen window at full detail
  const bucket = Math.floor(Date.now() / 10_000);
  const query = live && span ? `from=${bucket * 10_000 - span}&events=600` : 'events=600';
  const { detail: d, error } = useDetail(sid, live ? (live.rev ?? 0) + bucket : undefined, live ? query : 'events=600');
  const window = useMemo<[number, number]>(() => {
    if (!d) return [0, 1];
    if (live) return [span ? Date.now() - span : d.startedAt, Date.now()];
    if (span) return [Math.max(d.startedAt, d.endedAt - span), d.endedAt];
    return [d.startedAt, d.endedAt];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, span, live]);

  if (!sid) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Team view</h1>
          <span className="note">Pick a session to see its main agent and subagents side by side over time.</span>
        </div>
        <div className="glass">
          {sessions.length ? (
            <div className="sa">
              {sessions.map((s) => (
                <button key={s.id} type="button" className="hrow" onClick={() => onPick(s.id)}>
                  <span>
                    <span className="t">{s.title}</span>
                    <span className="w">
                      {s.name} · {s.subsTotal} subagents
                    </span>
                  </span>
                  <span className="r" style={{ color: STATUS[s.status].color }}>
                    {STATUS[s.status].label}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty>No live sessions. Open one from History to see its team.</Empty>
          )}
        </div>
      </div>
    );
  }

  const running = d ? d.agents.filter((a) => a.status === 'running' || (a.kind === 'main' && live?.status === 'working')) : [];
  const finished = d ? d.agents.filter((a) => a.kind !== 'main' && a.status === 'done' && a.result).sort((x, y) => y.lastTs - x.lastTs) : [];
  const ret = finished[0];
  const focusAgent = d && focus ? d.agents.find((a) => a.id === focus) : null;
  const subTok = d ? totalTok(d.tokens?.subs) : 0;
  const allTok = d ? subTok + totalTok(d.tokens?.main) : 0;
  const lastOut = (agentId: string) => d?.events.find((e) => e.a === agentId && e.k === 'tool' && e.tail);

  return (
    <div className="page">
      <div className="page-head">
        <div className="avatar" style={{ background: sessionColor(sid) }} aria-hidden="true" />
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          <h1>{d?.title || live?.title || 'Loading…'}</h1>
          <div className="where">{[d?.project, d?.branch, d?.model].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="pills">
          {live ? <Pill color={STATUS[live.status].color}>{STATUS[live.status].label}</Pill> : <Pill color={C.faint}>Ended</Pill>}
          {d && (
            <span>
              1 main agent, {d.agents.length - 1} subagent{d.agents.length === 2 ? '' : 's'}
            </span>
          )}
          {d && <span>{fmtDur((live ? Date.now() : d.endedAt) - d.startedAt)}</span>}
          {d && (
            <span>
              {fmtTok(allTok)} tokens, {fmtTok(subTok)} of them in subagents
            </span>
          )}
        </div>
        <select className="select" value={sid} onChange={(e) => onPick(e.target.value)} aria-label="Session">
          {!live && <option value={sid}>{d?.title || sid}</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.title}
            </option>
          ))}
        </select>
      </div>
      {error && !d && <div className="glass err">Could not load: {error}</div>}
      {!d && !error && <div className="loading">Reading the session…</div>}
      {d && (
        <div className="page-grid">
          <section className="glass" aria-label="Who did what, and when">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <h3 className="label" style={{ margin: 0 }}>
                Who did what, and when
              </h3>
              <div className="seg" role="group" aria-label="Time window">
                {SPANS.map(([l, v]) => (
                  <button key={l} type="button" aria-pressed={span === v} onClick={() => setSpan(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <Lanes rows={rowsOf(d, focus, showAll)} lanes={d.lanes} marks={d.marks} window={window} selected={focus} onRow={(id) => setFocus(focus === id ? null : id)} />
            {d.agents.length > 25 && (
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer rows' : `Show all ${d.agents.length} agents`}
              </button>
            )}
            <LaneLegend />
          </section>
          <div className="sa" style={{ gap: 14 }}>
            {focusAgent && (
              <section className="glass" aria-label="Selected agent">
                <h3 className="label">{focusAgent.kind === 'main' ? 'Main agent' : focusAgent.name || (focusAgent.kind === 'subagent' ? helperKind(focusAgent.type).word : focusAgent.type)}</h3>
                {focusAgent.desc && <div className="sa-desc">{focusAgent.desc}</div>}
                <div className="sa-stats" style={{ marginTop: 6 }}>
                  {focusAgent.toolCalls} tool calls · {fmtTok(totalTok(focusAgent.tokens))} tokens · {fmtUsd(focusAgent.cost)}
                  {focusAgent.model ? ` · ${focusAgent.model}` : ''}
                </div>
                {focusAgent.top.length > 0 && <div className="sa-stats">Mostly: {focusAgent.top.map(([n, c]) => `${n} ×${c}`).join(', ')}</div>}
                {focusAgent.result && (
                  <details open>
                    <summary>What it returned</summary>
                    <div className="quote">{plain(focusAgent.result)}</div>
                  </details>
                )}
              </section>
            )}
            <section className="glass" aria-label="Running now">
              <h3 className="label">Running now</h3>
              {!running.length && <div className="note">Nothing is running{live ? '' : ': this session has ended'}.</div>}
              {running.slice(0, 6).map((a) => {
                const now = a.kind === 'main' ? live?.now : a.now;
                const out = lastOut(a.id);
                return (
                  <div key={a.id} className="sa" style={{ marginBottom: 12 }}>
                    <div className="sa-head">
                      <span className="sa-type" {...(a.kind === 'subagent' ? tip(helperKind(a.type).hint) : {})}>{a.kind === 'main' ? 'main agent' : a.name || (a.kind === 'subagent' ? helperKind(a.type).word : a.type)}</span>
                      {now && <span className="note">{fmtDur(Date.now() - now.since)}</span>}
                    </div>
                    {now ? (
                      <div className="term">
                        <b>{now.short}</b> {now.target}
                      </div>
                    ) : (
                      <div className="note">Thinking</div>
                    )}
                    {out?.tail && (
                      <div className="note" style={{ marginTop: 4 }}>
                        Last output ({clock(out.end || out.t)}):
                        <div className="term" style={{ marginTop: 4 }}>
                          {out.tail}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
            <section className="glass" aria-label="Returned to the main agent">
              <h3 className="label">Returned to the main agent</h3>
              {ret ? (
                <>
                  <div className="sa-head" style={{ marginBottom: 6 }}>
                    <span className="sa-type">{ret.name || (ret.kind === 'subagent' ? helperKind(ret.type).word : ret.type)}</span>
                    <span className="note">done {clock(ret.lastTs)}</span>
                  </div>
                  <div className="quote">{plain(ret.result)}</div>
                  <div className="kv" style={{ marginTop: 8 }}>
                    <span>Spent in the subagent</span>
                    <span>
                      {fmtTok(totalTok(ret.tokens))} tokens · {fmtUsd(ret.cost)}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Handed back to the main agent</span>
                    <span>≈ {fmtTok(Math.round((ret.resultChars || ret.result.length) / 4))} tokens</span>
                  </div>
                </>
              ) : (
                <div className="note">No subagent has finished yet.</div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
