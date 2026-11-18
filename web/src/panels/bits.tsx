import { useState, type ReactNode } from 'react';
import type { Tok } from '../api';
import { fmtTok } from '../fmt';

export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="pill" style={{ color }}>
      {children}
    </span>
  );
}

export function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
      <div style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

const MIX: [keyof Parts, string, string][] = [
  ['cr', 'Cache read', '#3987E5'],
  ['cw', 'Cache write', '#D95926'],
  ['out', 'Output', '#199E70'],
  ['in', 'Input', '#9085E9'],
];
interface Parts {
  cr: number;
  cw: number;
  out: number;
  in: number;
}

export function TokenMix({ t }: { t: Tok }) {
  const parts: Parts = { cr: t.cr, cw: t.cw5 + t.cw1, out: t.out, in: t.in };
  const total = parts.cr + parts.cw + parts.out + parts.in || 1;
  return (
    <div>
      <div className="mix" role="img" aria-label={MIX.map(([k, l]) => `${l} ${fmtTok(parts[k])}`).join(', ')}>
        {MIX.map(([k, , c]) => (
          <div key={k} style={{ width: `${(parts[k] / total) * 100}%`, background: c }} />
        ))}
      </div>
      <div className="legend-rows">
        {MIX.map(([k, l, c]) => (
          <div className="kv" key={k}>
            <span>
              <i className="sw" style={{ background: c }} />
              {l}
            </span>
            <span>{fmtTok(parts[k])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          })
          .catch(() => undefined)
      }
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card note">{children}</div>;
}
