import { useRef, useState, type KeyboardEvent } from 'react';
import { addDays, type History } from '../api';
import { counted, dateWords, humanDur, keyDate, todayKey } from './history-words';

// The last six weeks at a glance, above the diary: a column per day as tall as
// that day's agent time, a small coral dot under days where a step failed.
// Picking a day opens its page of the diary; picking it again shows every day.

const DAYS = 42;

export function ActivityStrip({ calendar, from, to, onPick }: { calendar: History['calendar'] | undefined; from: string; to: string; onPick: (from: string, to: string) => void }) {
  const today = todayKey();
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - DAYS + 1));
  // minutes of agent time; older servers only count sessions, so half an hour each stands in
  const minutes = (k: string) => calendar?.[k]?.active ?? (calendar?.[k]?.sessions || 0) * 30;
  const max = Math.max(60, ...days.map(minutes));
  const [focus, setFocus] = useState(DAYS - 1);
  const [tip, setTip] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const picked = (k: string) => from === k && to === k;
  const inRange = (k: string) => !!from && !!to && k >= from && k <= to;
  const words = (k: string) => {
    const c = calendar?.[k];
    if (!c || !c.sessions) return 'nothing happened';
    const parts = [c.active != null ? `${humanDur(c.active * 60_000)} of agent work` : counted(c.sessions, 'session'), c.active != null ? counted(c.sessions, 'session') : ''];
    if (c.problems) parts.push(`${counted(c.problems, 'session')} with failed steps`);
    return parts.filter(Boolean).join(', ');
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -DAYS : e.key === 'End' ? DAYS : 0;
    if (!step) return;
    e.preventDefault();
    const i = Math.min(DAYS - 1, Math.max(0, focus + step));
    setFocus(i);
    setTip(i);
    (strip.current?.children[i] as HTMLElement | undefined)?.focus();
  };
  const first = keyDate(days[0]);
  return (
    <div className="hx-strip">
      <div className="hx-strip-head">
        <span>The last six weeks</span>
        <span className="note">agent time per day · pick a day to read it</span>
      </div>
      <div className="hx-strip-plot" onMouseLeave={() => setTip(null)}>
        <div className="hx-strip-days" role="group" aria-label="Agent time per day over the last six weeks" ref={strip} onKeyDown={onKey}>
          {days.map((k, i) => {
            const m = minutes(k);
            const dow = keyDate(k).getDay();
            return (
              <button
                key={k}
                type="button"
                tabIndex={i === focus ? 0 : -1}
                className={`hx-day${inRange(k) ? ' on' : ''}${k === today ? ' today' : ''}${dow === 0 || dow === 6 ? ' weekend' : ''}${dow === 1 ? ' monday' : ''}`}
                aria-pressed={picked(k)}
                aria-label={`${dateWords(k)}: ${words(k)}`}
                onClick={() => (picked(k) ? onPick('', '') : onPick(k, k))}
                onMouseEnter={() => setTip(i)}
                onFocus={() => {
                  setFocus(i);
                  setTip(i);
                }}
                onBlur={() => setTip(null)}
              >
                <span className="hx-day-bar" style={{ height: m ? `max(2px, ${(m / max) * 100}%)` : 0 }} />
                {(calendar?.[k]?.problems || 0) > 0 && <span className="hx-day-fail" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {tip != null && (
          <div className="hx-strip-tip" role="presentation" style={{ left: `${((tip + 0.5) / DAYS) * 100}%` }}>
            <b>{dateWords(days[tip])}</b>
            <span>{words(days[tip])}</span>
          </div>
        )}
      </div>
      <div className="hx-strip-axis" aria-hidden="true">
        <span>{`${first.getDate()} ${dateWords(days[0], 'none').split(' ')[1]}`}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
