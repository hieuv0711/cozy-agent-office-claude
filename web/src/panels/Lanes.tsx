import type { Seg } from '../api';
import { clock } from '../fmt';
import { CAT, catOf } from '../theme';
import { tip } from './Tooltip';

/** The moments marked on a lane, in words. */
const MARK_WORDS: Record<string, string> = {
  prompt: 'Your prompt',
  command: 'You ran a command',
  interrupt: 'You stopped it',
  compact: 'Its context was compacted',
  error: 'An error',
  notify: 'A background task finished',
};

export interface LaneRow {
  id: string;
  label: string;
  sub: string;
  end: string;
}

export function Lanes({
  rows,
  lanes,
  marks,
  window,
  playhead,
  selected,
  onRow,
}: {
  rows: LaneRow[];
  lanes: Record<string, Seg[]>;
  marks: Record<string, [number, string, string?][]>;
  window: [number, number];
  playhead?: number | null;
  selected?: string | null;
  onRow?: (id: string) => void;
}) {
  const [start, end] = window;
  const span = Math.max(1, end - start);
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - start) / span) * 100))}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => start + f * span);
  return (
    <div className="lanes">
      <div className="lane-axis" aria-hidden="true">
        <span>Agent</span>
        <div className="axis-ticks">
          {ticks.map((t, i) => (
            <span key={i} style={{ left: x(t), transform: i === 0 ? 'none' : i === 4 ? 'translateX(-100%)' : undefined }}>
              {clock(t)}
            </span>
          ))}
        </div>
        <span style={{ textAlign: 'right' }}>So far</span>
      </div>
      {rows.map((r) => {
        const segs = lanes[r.id] || [];
        return (
          <button key={r.id} type="button" className="lane-row" aria-current={selected === r.id} onClick={() => onRow?.(r.id)}>
            <span className="lane-label">
              <b>{r.label}</b>
              <small>{r.sub}</small>
            </span>
            <span className="track" role="img" aria-label={`${r.label}: ${segs.length} tool calls in view`}>
              {segs.map((s, i) => {
                const w = ((Math.min(s[1], end) - Math.max(s[0], start)) / span) * 100;
                return (
                  <span
                    key={i}
                    className={`s ${s[4] ? '' : 'bad'}`}
                    {...tip(`${s[3]}${s[5] > 1 ? ` (and ${s[5] - 1} more)` : ''}`, clock(s[0]))}
                    style={{ left: x(s[0]), width: `${Math.max(0.15, w)}%`, background: catOf(s[2]).color }}
                  />
                );
              })}
              {(marks[r.id] || []).map(([t, k], i) => (
                <span key={`m${i}`} className={`m ${k}`} style={{ left: x(t) }} {...tip(MARK_WORDS[k] ?? k, clock(t))} />
              ))}
              {playhead != null && playhead >= start && playhead <= end && <span className="playhead" style={{ left: x(playhead) }} />}
            </span>
            <span className="lane-end">{r.end}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LaneLegend() {
  return (
    <div className="lane-legend">
      {['read', 'edit', 'run', 'agent', 'web', 'ask'].map((k) => (
        <span key={k}>
          <i className="sw" style={{ background: CAT[k].color }} />
          {CAT[k].label}
        </span>
      ))}
      <span>
        <i className="sw" style={{ background: 'var(--paper-2)' }} />
        Your prompt
      </span>
      <span>
        <i className="sw" style={{ background: 'var(--sage)' }} />
        Background task finished
      </span>
    </div>
  );
}
