import { useMemo, useState } from 'react';
import { focusTerminal } from '../api';
import type { AgentInfo, Detail, Ev, Office, OfficeSession } from '../api';
import { clock, fmtDur, fmtTok, fmtUsd, pct, plain, sumTok, totalTok } from '../fmt';
import { actionText, clockOf, helperKind } from '../lib/session';
import { C, catOf, sessionColor, STATUS, SUB_STATUS } from '../theme';
import { Bar, CopyButton, Empty, Pill, TokenMix } from './bits';
import { tip } from './Tooltip';

export type Tab = 'overview' | 'timeline' | 'subagents' | 'tokens';

interface Props {
  office: Office | null;
  session: OfficeSession | null;
  detail: Detail | null;
  loading: boolean;
  error: string;
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedAgent: string | null;
  onSelect: (sid: string | null, agent?: string | null) => void;
  onOpenTeam: () => void;
  replay: boolean;
}

export function DetailPanel(p: Props) {
  const { session: s, detail: d } = p;
  if (!s && !d) return <OfficeSummary office={p.office} onSelect={(id) => p.onSelect(id)} loading={p.loading} />;
  const id = s?.id || d?.id || '';
  const color = sessionColor(id);
  const title = s?.title || d?.title || '';
  const where = [s?.project || d?.project, s?.branch || d?.branch].filter(Boolean).join(' · ');
  const status = s ? STATUS[s.status] : null;
  const started = s?.startedAt || d?.startedAt || 0;
  const tools = (s ? s.toolCalls : d?.toolCalls) || 0;
  const subCount = d ? d.agents.length - 1 : s?.subsTotal || 0;
  const num = s?.num || d?.num || 0;
  return (
    <aside className="panel" aria-label="Agent detail">
      <div className="panel-head">
        <div className="who">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="title-card">{title}</h1>
            <div className="where">
              {num ? <span className="num">S-{String(num).padStart(3, '0')}</span> : null}
              {s?.name && s.name !== title ? (
                <>
                  {' · '}
                  <span style={{ color }}>{s.name}</span>
                </>
              ) : null}
              {where ? ` · ${where}` : ''}
            </div>
          </div>
          <button type="button" className="icon-btn close" onClick={() => p.onSelect(null)} aria-label="Close detail">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
        <div className="pills">
          {status ? (
            <Pill color={status.color}>
              <span className={`dot ${s?.status}`} aria-hidden="true" />
              {status.label}
            </Pill>
          ) : (
            <Pill color={C.faint}>{p.replay ? 'Replay' : d?.live ? 'Live' : 'Ended'}</Pill>
          )}
          {(s?.model || d?.model) && <span>{s?.model || d?.model}</span>}
          {started > 0 && <span>{fmtDur((s ? (s.replay ? s.lastActivity : Date.now()) : d?.endedAt || Date.now()) - started)}</span>}
          <span>{tools} tool calls</span>
          {subCount > 0 && <span>{subCount} subagents</span>}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Agent detail sections">
        {(['overview', 'timeline', 'subagents', 'tokens'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={p.tab === t} onClick={() => p.setTab(t)}>
            {t === 'subagents' ? `Subagents${subCount ? ` ${subCount}` : ''}` : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {p.error && !d && <div className="card err">Could not load this session: {p.error}</div>}
        {!d && !p.error && p.tab !== 'overview' && id.startsWith('demo-') && <div className="loading">A made-up session (demo): it has no history to show here.</div>}
        {!d && !p.error && p.tab !== 'overview' && !id.startsWith('demo-') && <div className="loading">Reading the session…</div>}
        {p.tab === 'overview' && <Overview s={s} d={d} />}
        {p.tab === 'timeline' && d && <Timeline d={d} agent={p.selectedAgent} onAgent={(a) => p.onSelect(id, a)} live={!!s} />}
        {p.tab === 'subagents' && d && <Subagents d={d} selected={p.selectedAgent} onSelect={(a) => p.onSelect(id, a)} onOpenTeam={p.onOpenTeam} />}
        {p.tab === 'tokens' && d && <Tokens d={d} />}
      </div>
    </aside>
  );
}

function OfficeSummary({ office, onSelect, loading }: { office: Office | null; onSelect: (id: string) => void; loading: boolean }) {
  const sessions = office?.sessions || [];
  const groups: [string, OfficeSession[], string][] = [
    ['Needs you', sessions.filter((s) => s.status === 'needs-you'), C.need],
    ['Working', sessions.filter((s) => s.status === 'working'), C.work],
    ['Idle', sessions.filter((s) => s.status === 'idle'), C.idle],
  ];
  const tok = sessions.reduce((n, s) => n + totalTok(s.tokens), 0);
  const cost = sessions.reduce((n, s) => n + s.cost + s.subCost, 0);
  return (
    <aside className="panel" aria-label="Summary">
      <div className="panel-head">
        <div className="who">
          <div style={{ minWidth: 0 }}>
            <h1 className="title-card">Everyone here</h1>
            <div className="where">Click a name, a character or a helper to open its scene card.</div>
          </div>
        </div>
      </div>
      <div className="panel-body">
        {!office && <div className="loading">Connecting…</div>}
        {office && !sessions.length && <Empty>No Claude Code session is running. Start one in any terminal and it walks in through the door.</Empty>}
        {groups.map(([label, list, col]) =>
          list.length ? (
            <div className="card" key={label}>
              <h3 style={{ color: col }}>
                {label} · {list.length}
              </h3>
              <div className="sa" style={{ gap: 6 }}>
                {list.map((s) => (
                  <button key={s.id} type="button" className="hrow" style={{ minHeight: 44 }} onClick={() => onSelect(s.id)}>
                    <span style={{ minWidth: 0 }}>
                      <span className="t" style={{ WebkitLineClamp: 1 }}>
                        <span className="swatch" style={{ display: 'inline-block', width: 8, height: 12, marginRight: 8, background: sessionColor(s.id) }} />
                        {s.name}
                      </span>
                      <span className="w">{actionText(s)}</span>
                    </span>
                    <span className="r">
                      <span>{fmtUsd(s.cost + s.subCost)}</span>
                      {s.subsRunning > 0 && <span style={{ color: C.bot }}>+{s.subsRunning} bots</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
        {sessions.length > 0 && (
          <div className="card">
            <h3>Live sessions together</h3>
            <div className="kv">
              <span>Tokens so far</span>
              <span>{fmtTok(tok)}</span>
            </div>
            <div className="kv">
              <span>Estimated cost</span>
              <span>{fmtUsd(cost)}</span>
            </div>
            <div className="note" style={{ marginTop: 6 }}>
              API list prices. On a subscription plan this shows the size of the work, not a bill.
            </div>
          </div>
        )}
        {loading && <div className="loading">Loading…</div>}
      </div>
    </aside>
  );
}

function NowCard({ s, d }: { s: OfficeSession | null; d: Detail | null }) {
  if (!s) {
    return (
      <div className="card now-card idle">
        <h3>How it ended</h3>
        <div className="quote">{plain(d?.lastText) || 'No final message.'}</div>
      </div>
    );
  }
  const since = s.now?.since || s.statusSince;
  const now = clockOf(s);
  if (s.status === 'needs-you') {
    return (
      <div className="card now-card needs-you">
        <h3>Needs you</h3>
        <div className="now-line">
          <span className="now-tool">{s.waitingFor ? s.waitingFor[0].toUpperCase() + s.waitingFor.slice(1) : 'Waiting for your input'}</span>
        </div>
        {s.now && (
          <div className="now-target" style={{ marginTop: 4 }}>
            {s.now.short} {s.now.target}
          </div>
        )}
        <div className="sub-line">Waiting {fmtDur(now - s.statusSince)} · answer it in the terminal{s.pid ? ` (pid ${s.pid})` : ''}</div>
      </div>
    );
  }
  if (s.status === 'working') {
    return (
      <div className="card now-card">
        <h3>Now</h3>
        {s.now ? (
          <>
            <div className="now-line">
              <span className="now-tool">{s.now.short}</span>
              <span className="now-target">{s.now.target}</span>
            </div>
            {s.now.desc && <div className="sub-line">{s.now.desc}</div>}
            <div className="sub-line">Running for {fmtDur(now - since)}</div>
          </>
        ) : (
          <>
            <div className="now-tool">{s.subsRunning ? `${s.subsRunning} helper${s.subsRunning > 1 ? 's' : ''} out on tasks` : 'Thinking'}</div>
            <div className="sub-line">Working for {fmtDur(now - s.statusSince)}</div>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="card now-card idle">
      <h3>Idle</h3>
      <div className="now-tool">Done for now, ready for your next prompt</div>
      <div className="sub-line">Idle for {fmtDur(now - (s.statusSince || s.lastActivity))}</div>
    </div>
  );
}

function TerminalButton({ pid }: { pid: number }) {
  const [note, setNote] = useState('');
  return (
    <div className="btns" style={{ alignItems: 'center' }}>
      <button
        type="button"
        className="btn primary"
        onClick={async () => {
          setNote('');
          setNote(await focusTerminal(pid));
        }}
      >
        Open its terminal
      </button>
      {note && (
        <span className="note warn" role="status">
          {note}
        </span>
      )}
    </div>
  );
}

function Overview({ s, d }: { s: OfficeSession | null; d: Detail | null }) {
  const ctx = s ? s.ctx : d ? { tokens: d.ctx, window: d.ctxWindow, pct: d.ctxWindow ? (d.ctx / d.ctxWindow) * 100 : 0 } : null;
  const tok = s?.tokens || d?.tokens?.main;
  const subTok = d?.tokens?.subs;
  const costMain = s ? s.cost : d?.cost?.main || 0;
  const costSubs = s ? s.subCost : d?.cost?.subs || 0;
  const id = s?.id || d?.id || '';
  const hot = (ctx?.pct || 0) >= 60;
  return (
    <>
      <NowCard s={s} d={d} />
      {ctx && (
        <div className="card">
          <div className="row-between">
            <h3>Context window</h3>
            <span className="mono" style={{ fontSize: 12.5 }}>
              {pct(ctx.pct)} · {fmtTok(ctx.tokens)} of {fmtTok(ctx.window)}
            </span>
          </div>
          <Bar value={ctx.tokens} max={ctx.window} color={hot ? C.red : C.text} label="Context window used" />
        </div>
      )}
      {tok && (
        <div className="card">
          <h3>Tokens, main agent</h3>
          <div className="grid2">
            <div className="kv">
              <span>Input</span>
              <span>{fmtTok(tok.in)}</span>
            </div>
            <div className="kv">
              <span>Output</span>
              <span>{fmtTok(tok.out)}</span>
            </div>
            <div className="kv">
              <span>Cache read</span>
              <span>{fmtTok(tok.cr)}</span>
            </div>
            <div className="kv">
              <span>Cache write</span>
              <span>{fmtTok(tok.cw5 + tok.cw1)}</span>
            </div>
          </div>
          {subTok && totalTok(subTok) > 0 && <div className="sub-line">Subagents used another {fmtTok(totalTok(subTok))} tokens.</div>}
        </div>
      )}
      <div className="card">
        <div className="row-between">
          <h3>Estimated cost</h3>
          <span className="big">{fmtUsd(costMain + costSubs)}</span>
        </div>
        <div className="note">
          Main {fmtUsd(costMain)} · subagents {fmtUsd(costSubs)}. API list prices; on a subscription plan this is the size of the work, not a bill.
          {d?.costState ? ` Claude Code's own record for this session: ${fmtUsd(d.costState.usd)}.` : ''}
        </div>
      </div>
      <div className="card">
        <h3>{s ? 'Last prompt' : 'What you asked'}</h3>
        <div className="quote">{(s ? s.lastPrompt || d?.lastPrompt : d?.firstPrompt) || '—'}</div>
      </div>
      {d && d.files.some((f) => f.edits) && (
        <div className="card">
          <h3>Files changed</h3>
          {d.files
            .filter((f) => f.edits)
            .slice(0, 6)
            .map((f) => (
              <div className="file-row" key={f.path}>
                <span {...tip(f.path)}>{f.path}</span>
                <span>
                  {f.isNew ? 'new ' : ''}
                  <span className="plus">+{f.added}</span> <span className="minus">−{f.removed}</span>
                </span>
              </div>
            ))}
        </div>
      )}
      {s?.pid && !s.headless && !s.replay ? <TerminalButton pid={s.pid} /> : null}
      <div className="btns">
        <CopyButton text={`claude --resume ${id}`} label="Copy resume command" />
        {d?.file && <CopyButton text={d.file} label="Copy transcript path" />}
      </div>
    </>
  );
}

type Filter = 'all' | 'prompts' | 'tools' | 'agents' | 'errors';

function tagOf(e: Ev): { text: string; bg: string; fg: string } {
  switch (e.k) {
    // Fansub Night: subtitle-white text on tinted chips; yellow stays reserved
    case 'prompt':
      return { text: 'YOU', bg: C.text, fg: C.bg };
    case 'task':
      return { text: 'TASK', bg: 'rgba(169,184,240,0.24)', fg: C.text };
    case 'command':
      return { text: 'CMD', bg: 'rgba(246,241,228,0.12)', fg: C.text };
    case 'text':
      return { text: 'SAID', bg: 'rgba(246,241,228,0.07)', fg: C.text2 };
    case 'notify':
      return /fail|error|kill/i.test(e.status || '') ? { text: 'FAILED', bg: 'rgba(242,125,107,0.28)', fg: C.text } : { text: 'DONE', bg: 'rgba(143,209,158,0.24)', fg: C.text };
    case 'compact':
      return { text: 'COMPACT', bg: 'rgba(242,180,131,0.24)', fg: C.text };
    case 'error':
      return { text: 'ERROR', bg: 'rgba(242,125,107,0.28)', fg: C.text };
    case 'interrupt':
      return { text: 'STOP', bg: 'rgba(242,125,107,0.28)', fg: C.text };
    default: {
      const c = catOf(e.cat);
      // identity rides on the tinted chip; the text stays in subtitle white
      return e.ok === false ? { text: c.tag, bg: 'rgba(242,125,107,0.28)', fg: C.text } : { text: c.tag, bg: `${c.color}38`, fg: C.text };
    }
  }
}

function match(f: Filter, e: Ev) {
  if (f === 'all') return true;
  if (f === 'prompts') return e.k === 'prompt' || e.k === 'command' || e.k === 'task';
  if (f === 'tools') return e.k === 'tool';
  if (f === 'agents') return (e.k === 'tool' && e.cat === 'agent') || e.k === 'notify' || e.k === 'task';
  return e.k === 'error' || e.k === 'interrupt' || (e.k === 'tool' && e.ok === false) || !!e.reread;
}

function Timeline({ d, agent, onAgent, live }: { d: Detail; agent: string | null; onAgent: (a: string | null) => void; live: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const [limit, setLimit] = useState(150);
  const names = useMemo(() => new Map(d.agents.map((a) => [a.id, a.kind === 'main' ? 'main' : a.name || a.type])), [d.agents]);
  const needle = text.trim().toLowerCase();
  const evs = d.events.filter(
    (e) =>
      (!agent || e.a === agent) &&
      match(filter, e) &&
      (!needle || [e.target, e.text, e.info, e.short, e.desc].some((v) => String(v || '').toLowerCase().includes(needle))),
  );
  const shown = evs.slice(0, limit);
  return (
    <>
      <input className="search timeline-search" type="search" placeholder="Find in this timeline: file, command, text…" aria-label="Find in this timeline" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="filters" role="group" aria-label="Filter the timeline">
        {(['all', 'prompts', 'tools', 'agents', 'errors'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'agents' ? 'Subagents' : f === 'errors' ? 'Errors and loops' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        {agent && (
          <button type="button" aria-pressed="true" onClick={() => onAgent(null)}>
            Only {names.get(agent) || agent}
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" style={{ marginLeft: 6 }}>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        )}
      </div>
      <div className="note">
        Newest first. {d.totalEvents > d.events.length ? `Showing the latest ${d.events.length} of ${d.totalEvents} events.` : `${d.totalEvents} events.`}
      </div>
      <div className="tl">
        {shown.map((e, i) => {
          const tag = tagOf(e);
          const who = !agent && e.a !== 'main' ? names.get(e.a) : '';
          const dur = e.end ? e.end - e.t : 0;
          let meta = '';
          if (e.k === 'tool') {
            meta = e.end ? `${fmtDur(dur)}${e.info ? ' · ' + e.info : ''}` : live ? 'Running' : e.info || '';
          }
          const text =
            e.k === 'tool'
              ? `${e.short || e.name} ${e.target || ''}`
              : e.k === 'compact'
                ? 'Context compacted'
                : e.k === 'interrupt'
                  ? 'You interrupted the turn'
                  : plain(e.text);
          return (
            <div className="tl-row" key={`${e.t}-${i}`}>
              <span className="tl-time">{clock(e.t)}</span>
              <span className="tag" style={{ background: tag.bg, color: tag.fg }}>
                {tag.text}
              </span>
              <span className="tl-main">
                <span className={`tl-text ${e.k === 'tool' ? 'mono' : ''}`}>
                  {who && (
                    <button type="button" className="bot-chip" style={{ marginRight: 6, cursor: 'pointer' }} onClick={() => onAgent(e.a)}>
                      {who}
                    </button>
                  )}
                  {text}
                </span>
                {meta && <span className={`tl-meta ${e.ok === false ? 'err' : ''}`}>{meta}</span>}
                {e.reread && <span className="tl-meta warn">Read {e.reread} times this session: a possible loop</span>}
                {e.k === 'tool' && e.result?.text && (
                  <details>
                    <summary>What it returned · {fmtTok(e.result.tokens)} tokens</summary>
                    <div className="quote">{plain(e.result.text)}</div>
                  </details>
                )}
              </span>
            </div>
          );
        })}
        {!shown.length && <div className="note">Nothing here yet.</div>}
      </div>
      {evs.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit((n) => n + 200)}>
          Show more
        </button>
      )}
    </>
  );
}

function SubCard({ a, selected, onSelect }: { a: AgentInfo; selected: boolean; onSelect: () => void }) {
  const st = SUB_STATUS[a.status || 'running'] || SUB_STATUS.running;
  return (
    <div className={`card sa ${selected ? 'selected' : ''}`}>
      <div className="sa-head">
        <span className="sa-type">
          <span className="sw" style={{ background: a.kind === 'workflow' ? C.need : a.kind === 'teammate' ? C.pink : C.bot }} aria-hidden="true" />
          {a.name || (a.kind === 'subagent' ? <span {...tip(helperKind(a.type).hint)}>{helperKind(a.type).word}</span> : a.type)}
        </span>
        {a.name && (
          <span className="note" {...(a.kind === 'subagent' ? tip(helperKind(a.type).hint) : {})}>
            {a.kind === 'subagent' ? helperKind(a.type).word : a.type}
          </span>
        )}
        {a.phase && <span className="phase">{a.phase}</span>}
        <span className="sa-status" style={{ color: st.color }}>
          {st.label}
        </span>
      </div>
      {a.desc && <div className="sa-desc">{a.desc}</div>}
      {a.now && (
        <div className="sa-now">
          Now: {a.now.short} {a.now.target}
        </div>
      )}
      <div className="sa-stats">
        {a.toolCalls} tool calls · {fmtTok(totalTok(a.tokens))} tokens · {fmtUsd(a.cost)}
        {a.model ? ` · ${a.model}` : ''}
        {a.startedAt ? ` · started ${clock(a.startedAt)}` : ''}
      </div>
      <div className="btns" style={{ marginTop: 2 }}>
        <button type="button" className="btn" onClick={onSelect}>
          {selected ? 'Showing its timeline' : 'Its timeline'}
        </button>
      </div>
      {a.result && (
        <details>
          <summary>What it returned</summary>
          <div className="quote">{plain(a.result)}</div>
        </details>
      )}
      {!a.result && a.task && (
        <details>
          <summary>Its task</summary>
          <div className="quote">{a.task}</div>
        </details>
      )}
    </div>
  );
}

function Subagents({ d, selected, onSelect, onOpenTeam }: { d: Detail; selected: string | null; onSelect: (a: string | null) => void; onOpenTeam: () => void }) {
  const [openAll, setOpenAll] = useState<Record<string, boolean>>({});
  const subs = d.agents.filter((a) => a.kind !== 'main');
  if (!subs.length) return <Empty>This session has not started any subagents.</Empty>;
  const rank = (a: AgentInfo) => (a.status === 'running' ? 0 : a.status === 'idle' ? 1 : 2);
  const others = subs.filter((a) => a.kind !== 'workflow').sort((x, y) => rank(x) - rank(y) || y.startedAt - x.startedAt);
  const runs = d.workflows.slice().sort((x, y) => y.startedAt - x.startedAt);
  return (
    <>
      <div className="btns">
        <button type="button" className="btn primary" onClick={onOpenTeam}>
          Open the team view
        </button>
      </div>
      {runs.map((w) => {
        const members = subs.filter((a) => a.runId === w.runId).sort((x, y) => rank(x) - rank(y) || x.startedAt - y.startedAt);
        const all = openAll[w.runId];
        return (
          <div className="card" key={w.runId}>
            <div className="wf-head">
              <span className="sa-type">
                <span className="sw" style={{ background: C.need }} aria-hidden="true" />
                Workflow · {w.name}
              </span>
              <span className="sa-status" style={{ color: (SUB_STATUS[w.status] || SUB_STATUS.running).color }}>
                {(SUB_STATUS[w.status] || SUB_STATUS.running).label}
              </span>
            </div>
            <div className="sa-stats" style={{ margin: '4px 0 6px' }}>
              {w.total} agents · {w.running} running · {w.done} done{w.failed ? ` · ${w.failed} failed` : ''}
            </div>
            <div className="filters" style={{ marginBottom: 6 }}>
              {Object.entries(w.phases).map(([ph, n]) => (
                <span key={ph} className="phase">
                  {ph} {n}
                </span>
              ))}
            </div>
            {w.summary && (
              <details>
                <summary>What the run returned</summary>
                <div className="quote">{plain(w.summary)}</div>
              </details>
            )}
            <div className="sa" style={{ gap: 8, marginTop: 8 }}>
              {(all ? members : members.slice(0, 4)).map((a) => (
                <SubCard key={a.id} a={a} selected={selected === a.id} onSelect={() => onSelect(selected === a.id ? null : a.id)} />
              ))}
            </div>
            {members.length > 4 && (
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setOpenAll((o) => ({ ...o, [w.runId]: !all }))}>
                {all ? 'Show fewer' : `Show all ${members.length}`}
              </button>
            )}
          </div>
        );
      })}
      {others.map((a) => (
        <SubCard key={a.id} a={a} selected={selected === a.id} onSelect={() => onSelect(selected === a.id ? null : a.id)} />
      ))}
    </>
  );
}

function Tokens({ d }: { d: Detail }) {
  const all = sumTok(d.tokens?.main, d.tokens?.subs);
  const mainT = totalTok(d.tokens?.main);
  const subT = totalTok(d.tokens?.subs);
  const pts = d.context.slice(-40);
  const max = d.ctxWindow || Math.max(1, ...pts.map((p) => p[1]));
  const models = Object.entries(d.byModel).sort((a, b) => b[1].usd - a[1].usd);
  return (
    <>
      <div className="card">
        <h3>Token mix, all agents</h3>
        <TokenMix t={all} />
      </div>
      <div className="card">
        <h3>Context after each turn</h3>
        <div className="spark" role="img" aria-label="Context size after each of the latest turns">
          {pts.map(([t, v]) => (
            <span key={t} {...tip(`${fmtTok(v)} in context (${pct((v / max) * 100)}${d.ctxWindow ? ' of the window' : ' of the most'})`, clock(t))} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
          ))}
        </div>
        <div className="note" style={{ marginTop: 6 }}>
          Latest {pts.length} turns, scaled to the {fmtTok(max)} window. Now {pct((d.ctx / max) * 100)}.
        </div>
      </div>
      <div className="card">
        <h3>Main agent and subagents</h3>
        <div className="kv">
          <span>Main agent</span>
          <span>
            {fmtTok(mainT)} · {fmtUsd(d.cost?.main)}
          </span>
        </div>
        <Bar value={mainT} max={mainT + subT} color={C.text} label="Share of tokens in the main agent" />
        <div className="kv" style={{ marginTop: 6 }}>
          <span>Subagents</span>
          <span>
            {fmtTok(subT)} · {fmtUsd(d.cost?.subs)}
          </span>
        </div>
        <Bar value={subT} max={mainT + subT} color={C.bot} label="Share of tokens in subagents" />
      </div>
      <div className="card">
        <h3>Cost by model</h3>
        <table className="models">
          <thead>
            <tr>
              <th>Model</th>
              <th>Tokens</th>
              <th>Calls</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {models.map(([m, v]) => (
              <tr key={m}>
                <td>{m}</td>
                <td>{fmtTok(v.in + v.out + v.cr + v.cw)}</td>
                <td>{v.messages}</td>
                <td>{fmtUsd(v.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card note">
        How these numbers are counted: Claude Code writes one line per content block and repeats the message's usage on each, so every API message is
        counted once here. Adding up every line instead would report roughly 2 to 4 times too many tokens. Cost uses API list prices per model and cache
        type.
        {d.costState ? ` Claude Code's own cost record for this session says ${fmtUsd(d.costState.usd)}; ours is ${fmtUsd(d.cost?.total)}.` : ''}
      </div>
    </>
  );
}
