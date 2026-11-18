import { useCallback, useEffect, useRef, useState } from 'react';
import { BREAK_PRESETS, FOCUS_MAX, FOCUS_MIN, FOCUS_PRESETS, pomodoro, progressOf, setBreakMinutes, setFocusMinutes, skipPhase, startFocus, stopPomodoro } from '../lib/pomodoro';
import { tip } from './Tooltip';

// The Pomodoro line in the lower rail. The timer itself ticks in App (once a
// second, on every view); this only shows it, offers the next action, and lets
// you choose how long a focus round and its break last.

/** How long a focus round and its break last: a few lengths in one click, or any focus length from 1 to 180 minutes. */
function LengthPanel({ onClose, opener }: { onClose: () => void; opener: React.RefObject<HTMLButtonElement | null> }) {
  const p = pomodoro.use((x) => x);
  const [custom, setCustom] = useState(() => (FOCUS_PRESETS.includes(p.focusMin) ? '' : String(p.focusMin)));
  const [bad, setBad] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // a typed length is used once typing pauses, on Enter, on leaving the box or when the panel closes, so a
  // running round is never re-timed to the "1" on the way to "15"
  const pending = useRef<number | null>(null);
  const wait = useRef(0);
  const commit = () => {
    window.clearTimeout(wait.current);
    if (pending.current !== null) setFocusMinutes(pending.current);
    pending.current = null;
  };
  const drop = () => {
    window.clearTimeout(wait.current);
    pending.current = null;
  };
  useEffect(() => {
    // start on the pressed choice, so the keyboard lands in the panel (once, when it opens)
    panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    return commit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const close = () => {
      onClose();
      opener.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || opener.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose, opener]);
  const typed = (v: string) => {
    setCustom(v);
    drop();
    if (v.trim() === '') {
      setBad(false);
      return;
    }
    const n = Number(v);
    const ok = Number.isInteger(n) && n >= FOCUS_MIN && n <= FOCUS_MAX;
    setBad(!ok);
    if (!ok) return;
    pending.current = n;
    wait.current = window.setTimeout(commit, 800);
  };
  return (
    <div ref={panel} className="pomo-panel" role="dialog" aria-label="Focus length">
      <div className="pomo-row">
        <span className="pomo-key">Focus</span>
        <div className="seg" role="group" aria-label="Focus minutes">
          {FOCUS_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={p.focusMin === m}
              onClick={() => {
                drop();
                setCustom('');
                setBad(false);
                setFocusMinutes(m);
              }}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>
      <label className="pomo-row">
        <span className="pomo-key">Or</span>
        <input
          className="pomo-custom"
          type="number"
          min={FOCUS_MIN}
          max={FOCUS_MAX}
          step={1}
          inputMode="numeric"
          placeholder={String(p.focusMin)}
          value={custom}
          aria-label={`Focus minutes, ${FOCUS_MIN} to ${FOCUS_MAX}`}
          aria-invalid={bad}
          onChange={(e) => typed(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <span>minutes</span>
      </label>
      {bad && (
        <p className="note err" role="alert">
          Use a whole number of minutes from {FOCUS_MIN} to {FOCUS_MAX}.
        </p>
      )}
      <div className="pomo-row">
        <span className="pomo-key">Break</span>
        <div className="seg" role="group" aria-label="Break minutes">
          {BREAK_PRESETS.map((m) => (
            <button key={m} type="button" aria-pressed={p.breakMin === m} onClick={() => setBreakMinutes(m)}>
              {m} min
            </button>
          ))}
        </div>
      </div>
      <p className="note">
        {p.phase === 'idle' ? 'Saved for next time.' : `Saved, and the ${p.phase === 'focus' ? 'focus round' : 'break'} that’s running now uses it too.`}
      </p>
    </div>
  );
}

export function PomodoroChip({ now }: { now: number }) {
  const p = pomodoro.use((x) => x);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  // the same function on every render (this re-renders each second with the clock)
  const close = useCallback(() => setOpen(false), []);
  const { left } = progressOf(p, now);
  const length = (
    <button
      ref={opener}
      type="button"
      className="linkish pomo-length"
      aria-expanded={open}
      aria-haspopup="dialog"
      {...tip('Choose how long a focus round and its break last', p.phase === 'idle' ? 'Change length' : 'Length')}
      onClick={() => setOpen(!open)}
    >
      {p.phase === 'idle' ? 'Change length' : 'Length'}
    </button>
  );
  const panel = open && <LengthPanel onClose={close} opener={opener} />;
  if (p.phase === 'idle') {
    return (
      <div className="pomo-wrap">
        <button
          type="button"
          className="pomo"
          onClick={startFocus}
          {...tip(`${p.focusMin} minutes of focus, then a ${p.breakMin}-minute break. A soft bell rings at each change, and the music goes quieter during the break.`, `Start a ${p.focusMin}-minute focus`)}
        >
          Start a {p.focusMin}-minute focus
          {p.rounds ? <span className="note"> · {p.rounds} today</span> : null}
        </button>
        {length}
        {panel}
      </div>
    );
  }
  return (
    <div className="pomo-wrap">
      <span className={`pomo on ${p.phase}`} role="timer" aria-label={`${p.phase === 'focus' ? 'Focus' : 'Break'}, ${left} left`}>
        <b>{p.phase === 'focus' ? 'Focus' : 'Break'}</b>
        <span className="mono">{left}</span>
        <button type="button" className="linkish" onClick={skipPhase} {...tip(p.phase === 'focus' ? 'Finish this round now and start the break' : 'End the break now; start another round when you are ready')}>
          {p.phase === 'focus' ? 'Break now' : 'End break'}
        </button>
        <button type="button" className="linkish" onClick={stopPomodoro} {...tip('Stop the timer. A finished round still counts for today.')}>
          Stop
        </button>
      </span>
      {length}
      {panel}
    </div>
  );
}
