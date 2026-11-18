import { forwardRef, useMemo, useState, type Ref, type RefObject } from 'react';
import { dayKey, type Detail } from '../api';
import { fmtUsd, plain, sumTok, totalTok } from '../fmt';
import { storyOf, type Replay } from '../replay';
import { ReplaySection, stepTag } from './history-replay';
import { failuresOf, helperHint, helperName, tally, timeSplit, type Kind, type Step } from './history-steps';
import {
  cap,
  cleanTitle,
  clockOf,
  COST_NOTE,
  counted,
  dateWords,
  dayPhrase,
  endingOf,
  Fig,
  humanDur,
  humanNum,
  KEPT_NOTE,
  Lines,
  listWords,
  Numbers,
  numberWord,
  ToolList,
  workedMs,
} from './history-words';
import { tip } from './Tooltip';

// One session's page in the diary: what you asked and how it ended, the
// session in a few words, anything that went wrong (and why), the replay,
// its helpers and files. Token and cost figures wait under "Numbers".

// "Saturday 14 Nov, 01:07 to Monday 16 Nov, 10:39" or "Monday 16 Nov, 09:12 to 11:40".
function spanWords(d: Detail): string {
  const a = d.startedAt;
  const b = d.endedAt;
  if (!a) return '';
  if (dayKey(a) === dayKey(b)) return `${dateWords(a)}, ${clockOf(a)} to ${clockOf(b)}`;
  return `${dateWords(a)}, ${clockOf(a)} to ${dateWords(b)}, ${clockOf(b)}`;
}

function Quote({ text, cut = 420 }: { text: string; cut?: number }) {
  const [all, setAll] = useState(false);
  const long = text.length > cut + 80;
  return (
    <div className="hx-quote-wrap">
      <p className="hx-quote">{long && !all ? `${text.slice(0, cut).replace(/\s+\S*$/, '')}…` : text}</p>
      {long && (
        <button type="button" className="linkish" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : 'Show all of it'}
        </button>
      )}
    </div>
  );
}

const SPENT: Record<Kind | 'think', string> = {
  read: 'reading and searching the code',
  web: 'reading the web',
  other: 'other tools',
  edit: 'editing files',
  run: 'running commands',
  agent: 'waiting on its helpers',
  ask: 'waiting for you',
  think: 'thinking',
};
const SPLIT_WORDS: Record<Kind | 'think', string> = {
  read: 'Reading and searching',
  web: 'On the web',
  other: 'Other tools',
  edit: 'Editing',
  run: 'Running commands',
  agent: 'Helpers at work',
  ask: 'Waiting for you',
  think: 'Thinking',
};

/** The session in two or three sentences of plain words. */
function inShort(d: Detail, split: ReturnType<typeof timeSplit>, fails: Step[], waits: [number, number][]): string[] {
  const out: string[] = [];
  const top = split.slice().sort((a, b) => b.ms - a.ms);
  const total = top.reduce((n, x) => n + x.ms, 0);
  if (top.length && total > 0) {
    const [a, b] = top;
    if (a.ms / total >= 0.6 || !b) out.push(`Most of the time went to ${SPENT[a.kind]}.`);
    else out.push(`Most of the time went to ${SPENT[a.kind]}, then ${SPENT[b.kind]}.`);
  }
  const n = tally(d);
  const did: string[] = [];
  if (n.filesRead) did.push(`read ${counted(n.filesRead, 'file')}`);
  if (n.filesEdited) did.push(`changed ${counted(n.filesEdited, 'file')}`);
  if (n.commands) did.push(`ran ${counted(n.commands, 'command')}`);
  if (n.helpers) did.push(`sent ${counted(n.helpers, 'helper')}`);
  if (did.length) out.push(`It ${listWords(did)}.`);
  if (waits.length) {
    const ms = waits.reduce((s, [a, b]) => s + (b - a), 0);
    out.push(`It waited for your answer ${waits.length === 1 ? 'once' : waits.length === 2 ? 'twice' : `${numberWord(waits.length)} times`} (${humanDur(ms)} in all).`);
  }
  out.push(fails.length ? `${cap(counted(fails.length, 'step'))} failed.` : 'Nothing failed.');
  return out;
}

function TimeBars({ split }: { split: ReturnType<typeof timeSplit> }) {
  const rows = split.slice().sort((a, b) => b.ms - a.ms).slice(0, 6);
  const max = rows[0]?.ms || 1;
  if (!rows.length) return null;
  return (
    <figure className="hx-split">
      <figcaption className="hx-h-sub">Where the main agent's time went</figcaption>
      <ol className="rc-plist hx-split-list">
        {rows.map((r) => (
          <li key={r.kind}>
            <span className="hx-split-name">
              <i className={`rp-sw k-${r.kind}`} aria-hidden="true" />
              {SPLIT_WORDS[r.kind]}
            </span>
            <span className="rc-pbar" aria-hidden="true">
              <i style={{ width: `${Math.max(1.5, (r.ms / max) * 100)}%` }} />
            </span>
            <span className="rc-pdur">{humanDur(r.ms).replace('under a minute', `${Math.max(1, Math.round(r.ms / 1000))} s`)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Failures({ d, fails, onShow }: { d: Detail; fails: Step[]; onShow: (s: Step) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? fails : fails.slice(0, 6);
  return (
    <section className="hx-sec hx-fails" aria-labelledby="hx-fails-h" id="hx-fails">
      <h2 className="hx-h" id="hx-fails-h">
        What went wrong
      </h2>
      <p className="hx-fails-lead">
        {cap(counted(fails.length, 'step'))} failed. {fails.length === 1 ? 'Here it is,' : 'Here they are,'} with the reason each one gave.
      </p>
      <ol className="hx-fail-list">
        {shown.map((s, i) => {
          const { tag } = stepTag(s);
          const who = s.agent === 'main' ? '' : `${helperName(d.agents.find((a) => a.id === s.agent))}: `;
          return (
            <li key={`${s.t}-${i}`}>
              <span className="rp-st-time">{clockOf(s.t)}</span>
              <span className="rp-st-tag k-fail">{tag}</span>
              <span className="hx-fail-body">
                <span className="hx-fail-what">
                  {who}
                  {s.text}
                </span>
                <span className="hx-fail-why">{s.reason || 'It did not say why.'}</span>
              </span>
              <button type="button" className="linkish hx-fail-go" onClick={() => onShow(s)}>
                Show in the replay
              </button>
            </li>
          );
        })}
      </ol>
      {fails.length > 6 && (
        <button type="button" className="linkish" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${fails.length}`}
        </button>
      )}
    </section>
  );
}

function Helpers({ d, onShow }: { d: Detail; onShow: (t: number) => void }) {
  const helpers = d.agents.filter((a) => a.kind !== 'main').sort((a, b) => a.startedAt - b.startedAt);
  const [all, setAll] = useState(false);
  if (!helpers.length) return null;
  const shown = all ? helpers : helpers.slice(0, 6);
  const word = (st: string | null) => (st === 'done' ? 'finished' : st === 'failed' ? 'failed' : st === 'stopped' ? 'stopped' : st === 'running' ? 'still working' : 'ended');
  return (
    <section className="hx-sec" aria-labelledby="hx-helpers-h">
      <h2 className="hx-h" id="hx-helpers-h">
        Helpers it sent
      </h2>
      <ol className="hx-helpers">
        {shown.map((a) => (
          <li key={a.id} className={a.status === 'failed' ? 'failed' : ''}>
            <div className="hx-helper-head">
              <b {...tip(helperHint(a))}>{helperName(a)}</b>
              <span className="hx-helper-when">
                {clockOf(a.startedAt)} · {word(a.status)}
                {a.lastTs > a.startedAt ? ` after ${humanDur(a.lastTs - a.startedAt).replace('under a minute', 'less than a minute')}` : ''}
              </span>
              <button type="button" className="linkish" onClick={() => onShow(a.startedAt)}>
                Show in the replay
              </button>
            </div>
            {(a.desc || a.task) && <p className="hx-helper-task">{plain(a.desc || a.task).slice(0, 240)}</p>}
            {a.result && <p className="hx-helper-said">{plain(a.result).replace(/\s+/g, ' ').slice(0, 260)}</p>}
          </li>
        ))}
      </ol>
      {helpers.length > 6 && (
        <button type="button" className="linkish" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${helpers.length} helpers`}
        </button>
      )}
    </section>
  );
}

export const SessionPage = forwardRef<
  HTMLElement,
  {
    d: Detail;
    replay: Replay | null;
    setReplay: (r: Replay | null) => void;
    onWatch: () => void;
    onTeam: () => void;
    onBack?: () => void;
    headRef?: Ref<HTMLHeadingElement>;
    num?: number;
  }
>(function SessionPage({ d, replay, setReplay, onWatch, onTeam, onBack, headRef, num }, replayRef) {
  const n = d.num ?? num;
  const ending = endingOf(d);
  const worked = workedMs(d);
  const end = plain(d.lastText);
  const tok = totalTok(sumTok(d.tokens?.main, d.tokens?.subs));
  const helpers = d.agents.length - 1;
  const edited = d.files.filter((f) => f.edits);
  const read = d.files.filter((f) => f.reads && !f.edits).sort((a, b) => b.reads - a.reads);
  const { steps, rows } = useMemo(() => storyOf(d), [d]);
  const fails = useMemo(() => failuresOf(steps), [steps]);
  const split = useMemo(() => timeSplit(rows), [rows]);
  const waits = useMemo(() => (rows[0]?.blocks || []).filter((b) => b.kind === 'ask').map((b): [number, number] => [b.s, b.e]), [rows]);
  const short = useMemo(() => inShort(d, split, fails, waits), [d, split, fails, waits]);
  const status =
    ending === 'running'
      ? `Still running. Your agents have worked ${humanDur(worked)} so far.`
      : `Ended ${dayPhrase(dayKey(d.endedAt))} at ${clockOf(d.endedAt)}. Your agents worked ${humanDur(worked)}${dayKey(d.startedAt) !== dayKey(d.endedAt) ? ' in that time' : ''}.`;
  const toReplay = () => (replayRef as RefObject<HTMLElement | null> | null)?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const showAt = (t: number) => {
    const mine = replay && replay.detail.id === d.id ? replay : null;
    setReplay({ detail: d, t, playing: false, pace: mine?.pace || 'normal', watching: false });
    toReplay();
  };
  const models = Object.entries(d.byModel || {}).sort((a, b) => b[1].usd - a[1].usd);
  return (
    <article className="hx-read" aria-labelledby="hx-title">
      {onBack && (
        <button type="button" className="linkish hx-back" onClick={onBack}>
          ← Back to the diary
        </button>
      )}
      <header className="hx-head">
        <p className="hx-where">
          <span className={`hx-ending ${ending}`}>{ending === 'running' ? 'Still running' : ending === 'kept' ? 'Kept' : 'Ended'}</span>
          <span>{d.project}</span>
          {d.branch && <span>on {d.branch}</span>}
        </p>
        <h1 className="hx-title" id="hx-title" tabIndex={-1} ref={headRef}>
          {cleanTitle(d.title)}
        </h1>
        <p className="hx-when">{spanWords(d)}</p>
        <p className="hx-status">{status}</p>
        {fails.length > 0 && (
          <p className="hx-status-fail">
            <span aria-hidden="true">▲ </span>
            {cap(counted(fails.length, 'step'))} failed.{' '}
            <a href="#hx-fails" className="hx-fail-link" onClick={(e) => (e.preventDefault(), document.getElementById('hx-fails')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
              See what went wrong
            </a>
          </p>
        )}
        {ending === 'kept' && <p className="note">{KEPT_NOTE}</p>}
        <div className="hx-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const mine = replay && replay.detail.id === d.id ? replay : null;
              setReplay({ detail: d, t: mine && mine.t < d.endedAt ? mine.t : d.startedAt, playing: true, pace: mine?.pace || 'normal', watching: false });
              toReplay();
            }}
          >
            Replay
          </button>
          <button type="button" className="btn" onClick={onWatch}>
            Watch in the room
          </button>
          <button type="button" className="btn" onClick={onTeam}>
            Team view
          </button>
        </div>
      </header>

      <section className="hx-sec" aria-labelledby="hx-asked-h">
        <h2 className="hx-h" id="hx-asked-h">
          What you asked
        </h2>
        {d.firstPrompt ? <Quote key={`${d.id}-asked`} text={plain(d.firstPrompt)} /> : <p className="note">No prompt was recorded.</p>}
        {(d.prompts ?? 0) > 1 && <p className="note">The first of {counted(d.prompts ?? 0, 'prompt')} in this session.</p>}
      </section>

      <section className="hx-sec" aria-labelledby="hx-ended-h">
        <h2 className="hx-h" id="hx-ended-h">
          {ending === 'running' ? 'The latest from the agent' : 'How it ended'}
        </h2>
        {end ? <Quote key={`${d.id}-end`} text={end} /> : <p className="note">The agent didn't leave a closing message.</p>}
      </section>

      <section className="hx-sec" aria-labelledby="hx-short-h">
        <h2 className="hx-h" id="hx-short-h">
          In short
        </h2>
        <p className="hx-short">{short.join(' ')}</p>
        <TimeBars split={split} />
      </section>

      {fails.length > 0 && <Failures d={d} fails={fails} onShow={(s) => showAt(s.t)} />}

      <ReplaySection d={d} replay={replay} setReplay={setReplay} onWatch={onWatch} ref={replayRef} />

      <Helpers d={d} onShow={showAt} />

      <section className="hx-sec" aria-labelledby="hx-changed-h">
        <h2 className="hx-h" id="hx-changed-h">
          What it changed
        </h2>
        {!edited.length && !d.prs?.length && <p className="note">It didn't change any files.</p>}
        {edited.length > 0 && (
          <ul className="hx-files">
            {edited.slice(0, 8).map((f) => {
              const i = f.path.lastIndexOf('/');
              const dirs = f.path.slice(0, Math.max(0, i)).split('/').filter(Boolean);
              const dir = dirs.length > 3 ? `…/${dirs.slice(-3).join('/')}/` : i > 0 ? f.path.slice(0, i + 1) : '';
              return (
                <li key={f.path} {...tip(f.path)}>
                  <span className="hx-file">
                    <b>{f.path.slice(i + 1)}</b>
                    {dir && <span className="hx-dir">{`${dir}‎`}</span>}
                  </span>
                  {f.isNew && <span className="hx-file-what">new file</span>}
                </li>
              );
            })}
          </ul>
        )}
        {edited.length > 8 && <p className="note">…and {counted(edited.length - 8, 'more file')}.</p>}
        {read.length > 0 && (
          <p className="hx-read-most">
            It also read {counted(read.length, 'file')}
            {read.length > 1 ? `, most often ${listWords(read.slice(0, 3).map((f) => f.path.split('/').pop() || f.path))}` : `: ${read[0].path.split('/').pop()}`}.
          </p>
        )}
        {d.prs && d.prs.length > 0 && (
          <p className="hx-prs">
            {d.prs.length === 1 ? 'Pull request ' : 'Pull requests '}
            {d.prs.map((p, i) => (
              <span key={p.url || p.number}>
                {i > 0 ? ', ' : ''}
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    #{p.number}
                  </a>
                ) : (
                  `#${p.number}`
                )}
              </span>
            ))}
          </p>
        )}
      </section>

      <Numbers hint="tokens, estimated cost, tool calls, models">
        <dl className="figs">
          <Fig
            k="Tokens"
            v={humanNum(tok)}
            note={helpers > 0 ? `${humanNum(totalTok(d.tokens?.main))} by the main agent, ${humanNum(totalTok(d.tokens?.subs))} by helpers` : undefined}
          />
          <Fig
            k="Estimated cost"
            v={fmtUsd(d.cost?.total)}
            note={
              <>
                {COST_NOTE}
                {d.costState ? ` Claude Code's own record says ${fmtUsd(d.costState.usd)}.` : ''}
              </>
            }
          />
          <Fig k="Tool calls" v={humanNum(d.toolCalls)} note={d.errors ? `${humanNum(d.errors)} failed` : undefined} />
          <Fig k="Prompts" v={humanNum(d.prompts)} />
          {helpers > 0 && <Fig k="Helpers" v={humanNum(helpers)} note="subagents and workflow agents" />}
          <Fig k="Lines changed" v={<Lines add={d.linesAdded || 0} del={d.linesRemoved || 0} />} note={edited.length ? `in ${counted(edited.length, 'file')}` : undefined} />
          {(d.compactions || 0) > 0 && <Fig k="Context compactions" v={humanNum(d.compactions)} />}
          <Fig k="Session" v={n ? `S-${String(n).padStart(3, '0')}` : d.id.slice(0, 8)} />
        </dl>
        {models.length > 0 && (
          <>
            <h3 className="nums-sub">Cost by model</h3>
            <table className="hx-models">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Messages</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {models.map(([m, v]) => (
                  <tr key={m}>
                    <th scope="row">{m}</th>
                    <td>{humanNum(v.messages)}</td>
                    <td>{humanNum(v.in + v.out + v.cr + v.cw)}</td>
                    <td>{fmtUsd(v.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <h3 className="nums-sub">Most used tools</h3>
        <ToolList tools={d.tools} />
      </Numbers>
    </article>
  );
});
