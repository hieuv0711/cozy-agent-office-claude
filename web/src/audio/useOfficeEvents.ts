import { useEffect, useRef } from 'react';
import type { Office } from '../api';
import { audio } from './engine';

// Turns changes between live office snapshots into small sounds:
// - a session starts waiting for you: a soft chime (music ducks), repeated
//   gently every 2 minutes while it keeps waiting
// - a session arrives or leaves: the door bell
// - a helper (subagent, teammate, workflow agent) appears: a pop
// - a helper finishes: a short success phrase, or a low tone if it failed
// - working sessions with a tool running set the pace of keyboard clicks
// Nothing plays until the user has started sound (the AudioContext unlock).

const REMIND_MS = 120_000;

export function useOfficeEvents(office: Office | null, enabled: boolean) {
  const prev = useRef<Office | null>(null);
  const lastChime = useRef(new Map<string, number>());
  useEffect(() => {
    if (!office) return;
    const before = prev.current;
    prev.current = office;
    if (!enabled || !audio.getState().unlocked || !before) return;
    const now = Date.now();
    const old = new Map(before.sessions.map((s) => [s.id, s]));
    const ids = new Set(office.sessions.map((s) => s.id));
    let chime = false;
    let door = false;
    let pop = false;
    let ok = false;
    let bad = false;
    for (const s of office.sessions) {
      const o = old.get(s.id);
      if (!o) {
        door = true;
        continue;
      }
      if (s.status === 'needs-you' && o.status !== 'needs-you') {
        chime = true;
        lastChime.current.set(s.id, now);
      } else if (s.status === 'needs-you' && now - (lastChime.current.get(s.id) || 0) > REMIND_MS) {
        chime = true;
        lastChime.current.set(s.id, now);
      }
      if (s.status !== 'needs-you') lastChime.current.delete(s.id);
      const subsBefore = new Map(o.subs.map((b) => [b.id, b.status]));
      for (const b of s.subs) {
        const was = subsBefore.get(b.id);
        if (was === undefined) pop = true;
        else if (was !== b.status) {
          if (b.status === 'done') ok = true;
          else if (b.status === 'failed') bad = true;
        }
      }
    }
    for (const s of before.sessions) if (!ids.has(s.id)) door = true;
    // needsYou() softens the music by itself while the chime plays
    if (chime) audio.sfx.needsYou();
    else if (bad) audio.sfx.fail();
    else if (ok) audio.sfx.success();
    if (door) audio.sfx.arrive();
    if (pop) audio.sfx.spawn();
    // keyboard clicks: about two keys a second per session with a tool running
    const typing = office.sessions.filter((s) => s.status === 'working' && s.now).length;
    audio.ambience.setTyping(Math.min(8, typing * 2));
  }, [office, enabled]);
}
