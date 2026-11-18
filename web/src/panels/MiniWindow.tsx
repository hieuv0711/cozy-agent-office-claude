import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusTerminal, type OfficeSession } from '../api';
import { actionText, clockOf } from '../lib/session';
import { sessionColor } from '../theme';

// A small always-on-top window (Chrome's Document Picture-in-Picture) with the
// live roster: waiting sessions first in yellow, then working, then idle.
// Clicking a session that has a terminal brings that Terminal tab forward.

interface DocPip {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

function pipApi(): DocPip | null {
  const api = (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture;
  return api && typeof api.requestWindow === 'function' ? api : null;
}

export function useMiniWindow() {
  const [win, setWin] = useState<Window | null>(null);
  const supported = !!pipApi();
  const open = useCallback(async () => {
    const api = pipApi();
    if (!api) return;
    if (api.window) {
      api.window.focus();
      return;
    }
    const w = await api.requestWindow({ width: 340, height: 460 });
    // carry the page's styles (bundled CSS and fonts) into the new window
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) w.document.head.appendChild(node.cloneNode(true));
    w.document.title = 'Agent Office';
    w.document.body.className = 'mini-body';
    w.addEventListener('pagehide', () => setWin(null), { once: true });
    setWin(w);
  }, []);
  useEffect(() => () => win?.close(), [win]);
  return { supported, open, win };
}

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function MiniRoster({ win, sessions }: { win: Window; sessions: OfficeSession[] }) {
  const [note, setNote] = useState('');
  const order = { 'needs-you': 0, working: 1, idle: 2 } as const;
  const list = [...sessions].sort((a, b) => order[a.status] - order[b.status] || a.statusSince - b.statusSince);
  const waiting = list.filter((s) => s.status === 'needs-you').length;
  useEffect(() => {
    win.document.title = waiting ? `(${waiting}) waiting · Agent Office` : 'Agent Office';
  }, [win, waiting]);
  return createPortal(
    <div className="mini">
      <header className="mini-head">
        <span className="title-card">Now</span>
        <span className="note">
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
          {waiting ? ` · ${waiting} waiting for you` : ''}
        </span>
      </header>
      <ul className="mini-list">
        {list.map((s) => {
          const ask = s.status === 'needs-you';
          const since = ask ? s.statusSince : s.now?.since || s.lastActivity;
          const canTerm = !!s.pid && !s.headless;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`mini-row ${s.status}`}
                disabled={!canTerm}
                title={canTerm ? `Bring ${s.name}'s Terminal tab to the front` : 'Runs without a terminal'}
                onClick={async () => {
                  if (!s.pid) return;
                  setNote(await focusTerminal(s.pid));
                }}
              >
                <span className="who" style={ask ? undefined : { color: sessionColor(s.id) }}>
                  {s.name}
                </span>
                <span className="say">{actionText(s)}</span>
                <span className="t">{s.status === 'idle' ? '' : mmss(clockOf(s) - since)}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="note">Nobody is here yet.</li>}
      </ul>
      {note && <p className="note warn">{note}</p>}
    </div>,
    win.document.body,
  );
}
