import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ModelRecap } from '../api';
import { fmtUsd } from '../fmt';
import { helperKind } from '../lib/session';
import { useModelData } from './history-data';
import { cleanTitle, COST_NOTE, counted, dateWords, humanNum, keyDate, listWords } from './history-words';
import { tip } from './Tooltip';

// Recap's "cost by model", opened: what one model did in the chosen period.
// Its sessions and projects (each opens in History), the main agents against
// each kind of helper, its tokens and what each kind cost, and a small chart
// of the estimated cost per day. Everything here is figures, so it lives
// under Numbers; the first lines still say it in words.

const PARTS: { key: keyof ModelRecap['tokens']; label: string; cls: string }[] = [
  // the app's token mix order and colours (cache read, cache write, output, input)
  { key: 'cr', label: 'Cache read', cls: 'mix-cr' },
  { key: 'cw', label: 'Cache write', cls: 'mix-cw' },
  { key: 'out', label: 'Output', cls: 'mix-out' },
  { key: 'in', label: 'Input', cls: 'mix-in' },
];

const plural = (w: string) => (/s$/.test(w) ? w : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const kindOfAgent = (a: ModelRecap['agents'][number]) => helperKind(a.type === 'agent' ? undefined : a.type);

// Who used the model, in words: "Main agents", "Explorers", "Helpers" (Claude
// Code's all-round helper), a workflow by its name, teammates.
function agentLabel(a: ModelRecap['agents'][number]): string {
  if (a.kind === 'main') return 'Main agents';
  if (a.kind === 'workflow') return `${a.type} (workflow)`;
  const word = kindOfAgent(a).word;
  if (a.kind === 'teammate') return word === 'Helper' ? 'Teammates' : `${plural(word)} (teammates)`;
  return plural(word);
}

function agentHint(a: ModelRecap['agents'][number]): string | undefined {
  if (a.kind === 'main') return 'The agents you talk to in each session';
  if (a.kind === 'workflow') return 'The agents of this workflow';
  return kindOfAgent(a).hint;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%');

function Days({ m, days }: { m: ModelRecap; days: string[] }) {
  const vals = days.map((k) => m.days[k]?.usd || 0);
  const max = Math.max(...vals, 0.01);
  const dense = days.length > 10;
  const [tip, setTip] = useState<number | null>(null);
  return (
    <figure className="md-days" aria-labelledby="md-days-h">
      <figcaption className="nums-sub" id="md-days-h">
        Estimated cost per day
      </figcaption>
      <div className="md-plot" style={{ '--cols': days.length } as CSSProperties} onMouseLeave={() => setTip(null)}>
        {days.map((k, i) => {
          const v = vals[i];
          const d = keyDate(k);
          return (
            <div key={k} className="md-col" tabIndex={0} aria-label={`${dateWords(k)}: ${fmtUsd(v)}`} onMouseEnter={() => setTip(i)} onFocus={() => setTip(i)} onBlur={() => setTip(null)}>
              <span className="md-area">
                {!dense && v > 0 && <span className="md-val">{fmtUsd(v)}</span>}
                <span className="md-bar" style={{ height: v ? `max(2px, ${(v / max) * 100}%)` : 0 }} />
              </span>
              <span className="md-day">{dense ? (d.getDate() === 1 || i === 0 || i === days.length - 1 ? d.getDate() : '') : dateWords(k, 'short').split(' ')[0]}</span>
            </div>
          );
        })}
        {tip != null && (
          <div className="md-tip" role="presentation" style={{ left: `${((tip + 0.5) / days.length) * 100}%` }}>
            <b>{fmtUsd(vals[tip])}</b>
            <span>{dateWords(days[tip])}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

function Ranked({ rows, label, onPick }: { rows: { key: string; name: string; usd: number; sub?: string; hint?: string }[]; label: string; onPick?: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const max = rows[0]?.usd || 1;
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="md-rank" aria-label={label}>
      <h3 className="nums-sub">{label}</h3>
      <ol className="rc-plist md-list">
        {shown.map((r) => (
          <li key={r.key}>
            {onPick ? (
              <button type="button" className="rc-pname" onClick={() => onPick(r.key)} {...(r.sub ? tip(r.sub, r.name) : tip(r.name))}>
                {r.name}
              </button>
            ) : (
              <span className="md-name" {...(r.hint ? tip(r.hint, r.name) : tip(r.name))}>
                {r.name}
              </span>
            )}
            <span className="rc-pbar" aria-hidden="true">
              <i style={{ width: `${Math.max(1.5, (r.usd / max) * 100)}%` }} />
            </span>
            <span className="rc-pdur">{fmtUsd(r.usd)}</span>
          </li>
        ))}
      </ol>
      {rows.length > 6 && (
        <button type="button" className="linkish rc-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

export function ModelSheet({
  model,
  from,
  to,
  period,
  days,
  onClose,
  onOpenProject,
  onOpenSession,
}: {
  model: string;
  from: string;
  to: string;
  period: string;
  days: string[];
  onClose: () => void;
  onOpenProject: (name: string) => void;
  onOpenSession: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data: m, error } = useModelData(model, from, to);
  // (no close on cleanup: React's double mount in development would fire the
  // dialog's close event and shut it straight away; unmounting removes it anyway)
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) {
      dlg.showModal();
      // start on Close (the dialog would otherwise pick its scrolling body)
      dlg.querySelector<HTMLButtonElement>('.md-close')?.focus();
    }
  }, []);
  const total = m?.cost.total || 0;
  const mainUsd = m?.agents.filter((a) => a.kind === 'main').reduce((n, a) => n + a.usd, 0) || 0;
  const helperTypes = m?.agents.filter((a) => a.kind !== 'main') || [];
  const lead = () => {
    if (!m) return '';
    if (!m.sessions.length) return `${model} wasn't used ${period.toLowerCase() === 'today' ? 'today' : 'in this period'}.`;
    const bits = [`${model} worked in ${counted(m.sessions.length, 'session')} across ${counted(m.projects.length, 'project')}.`];
    if (helperTypes.length && mainUsd > 0) bits.push(`The main agents ran up ${pct(mainUsd, total)} of its cost; the rest went to helpers: ${listWords(helperTypes.slice(0, 3).map((a) => agentLabel(a).toLowerCase()))}.`);
    else if (helperTypes.length) bits.push(`Only helpers used it: ${listWords(helperTypes.slice(0, 3).map((a) => agentLabel(a).toLowerCase()))}.`);
    else bits.push('Only the main agents used it, no helpers.');
    return bits.join(' ');
  };
  return (
    <dialog ref={ref} className="md" aria-labelledby="md-title" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="md-in">
        <header className="md-head">
          <div>
            <h2 className="md-title" id="md-title">
              {model}
            </h2>
            <p className="rc-period">{period}</p>
          </div>
          <button type="button" className="btn md-close" onClick={() => ref.current?.close()}>
            Close
          </button>
        </header>
        {error && <p className="err">Couldn't read what {model} did: {error}</p>}
        {!m && !error && <p className="loading">Adding it up…</p>}
        {m && (
          <>
            <p className="md-lead">{lead()}</p>
            {m.sessions.length > 0 && (
              <>
                <div className="md-total">
                  <span className="md-total-v">{fmtUsd(total)}</span>
                  <span className="note">{COST_NOTE}</span>
                </div>
                <section className="md-mix" aria-labelledby="md-mix-h">
                  <h3 className="nums-sub" id="md-mix-h">
                    What the tokens were, and what each kind cost
                  </h3>
                  <div className="md-bar-mix" role="img" aria-label={PARTS.map((p) => `${p.label} ${pct(m.cost[p.key], total)}`).join(', ')}>
                    {PARTS.map((p) => (m.cost[p.key] > 0 ? <i key={p.key} className={p.cls} style={{ flexGrow: m.cost[p.key] }} /> : null))}
                  </div>
                  <table className="hx-models md-table">
                    <thead>
                      <tr>
                        <th scope="col">Kind</th>
                        <th scope="col">Tokens</th>
                        <th scope="col">Estimated cost</th>
                        <th scope="col">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PARTS.map((p) => (
                        <tr key={p.key}>
                          <th scope="row">
                            <i className={`rp-sw ${p.cls}`} aria-hidden="true" />
                            {p.label}
                          </th>
                          <td>{humanNum(m.tokens[p.key])}</td>
                          <td>{fmtUsd(m.cost[p.key])}</td>
                          <td>{pct(m.cost[p.key], total)}</td>
                        </tr>
                      ))}
                      {m.cost.ws > 0 && (
                        <tr>
                          <th scope="row">Web searches</th>
                          <td>—</td>
                          <td>{fmtUsd(m.cost.ws)}</td>
                          <td>{pct(m.cost.ws, total)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
                {days.length > 1 && <Days m={m} days={days} />}
                <div className="md-two">
                  <Ranked label="Main agents and helpers" rows={m.agents.map((a) => ({ key: a.key, name: agentLabel(a), usd: a.usd, sub: `${counted(a.sessions, 'session')}`, hint: agentHint(a) }))} />
                  <Ranked label="Projects" rows={m.projects.map((p) => ({ key: p.name, name: p.name, usd: p.usd, sub: counted(p.sessions, 'session') }))} onPick={onOpenProject} />
                </div>
                <section className="md-sessions" aria-labelledby="md-sessions-h">
                  <h3 className="nums-sub" id="md-sessions-h">
                    Sessions
                  </h3>
                  <ol className="md-slist">
                    {m.sessions.slice(0, 40).map((s) => (
                      <li key={s.id}>
                        <button type="button" className="md-session" onClick={() => onOpenSession(s.id)}>
                          <span className="md-s-title">{cleanTitle(s.title)}</span>
                          <span className="md-s-meta">
                            {s.project} · {dateWords(s.startedAt, 'short')}
                            {s.live ? ' · still running' : ''}
                            {s.helpersUsd > 0 ? ` · ${pct(s.helpersUsd, s.usd)} by helpers` : ''}
                          </span>
                          <span className="md-s-usd">{fmtUsd(s.usd)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  {m.sessions.length > 40 && <p className="note">…and {counted(m.sessions.length - 40, 'more session')}.</p>}
                </section>
                {m.whole > 0 && <p className="note">{counted(m.whole, 'older session')} that used {model} aren't broken down by day and are left out here.</p>}
              </>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
