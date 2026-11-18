import { audio } from '../audio';
import { createStore, loadJSON, saveJSON } from './store';

// A Pomodoro timer that lives on the wall clock. A focus round (25 minutes
// unless you choose another length, from 1 to 180), then a break (5, 10 or 15
// minutes: music softens, lights warm, a soft bell), then it waits for you. The
// state and both lengths are saved, so reloading the page keeps the timer
// running.

export type Phase = 'idle' | 'focus' | 'break';

export interface Pomodoro {
  phase: Phase;
  startedAt: number; // when the current phase started (ms)
  endsAt: number; // when it ends (ms); 0 when idle
  focusMin: number;
  breakMin: number;
  rounds: number; // focus rounds finished today
  day: string; // local day the round count belongs to
}

const KEY = 'ao-pomodoro';
const today = () => new Date().toDateString();

/** Focus lengths offered as one click; any whole number of minutes from FOCUS_MIN to FOCUS_MAX can be typed in. */
export const FOCUS_PRESETS = [15, 25, 45, 60];
export const FOCUS_MIN = 1;
export const FOCUS_MAX = 180;
/** Break lengths offered. */
export const BREAK_PRESETS = [5, 10, 15];
const BREAK_MAX = 30;

/** A focus length in whole minutes, kept to 1..180 (25 when it isn't a number). */
export function focusMinutes(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, n)) : 25;
}
const breakMinutes = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(BREAK_MAX, Math.max(1, n)) : 5;
};

const saved = loadJSON<Partial<Pomodoro>>(KEY, {});
export const pomodoro = createStore<Pomodoro>({
  phase: saved.phase === 'focus' || saved.phase === 'break' ? saved.phase : 'idle',
  startedAt: Number(saved.startedAt) || 0,
  endsAt: Number(saved.endsAt) || 0,
  focusMin: focusMinutes(saved.focusMin),
  breakMin: breakMinutes(saved.breakMin),
  rounds: saved.day === today() ? Number(saved.rounds) || 0 : 0,
  day: today(),
});
pomodoro.subscribe(() => saveJSON(KEY, pomodoro.get()));
// a reload in the middle of a break keeps the music soft
if (pomodoro.get().phase === 'break') audio.setBreak(true);

function begin(phase: Exclude<Phase, 'idle'>) {
  const p = pomodoro.get();
  const now = Date.now();
  const min = phase === 'focus' ? p.focusMin : p.breakMin;
  pomodoro.set({ phase, startedAt: now, endsAt: now + min * 60_000 });
  audio.setBreak(phase === 'break');
}

export function startFocus() {
  begin('focus');
}

/**
 * Choose how long a focus round lasts (whole minutes, 1..180). A round that is
 * running now is re-timed from when it started (if that time has passed, its
 * break starts at the next tick).
 */
export function setFocusMinutes(min: number) {
  const m = focusMinutes(min);
  const p = pomodoro.get();
  if (m === p.focusMin) return;
  pomodoro.set(p.phase === 'focus' ? { focusMin: m, endsAt: p.startedAt + m * 60_000 } : { focusMin: m });
}

/** Choose how long a break lasts (whole minutes); a break running now is re-timed the same way. */
export function setBreakMinutes(min: number) {
  const m = breakMinutes(min);
  const p = pomodoro.get();
  if (m === p.breakMin) return;
  pomodoro.set(p.phase === 'break' ? { breakMin: m, endsAt: p.startedAt + m * 60_000 } : { breakMin: m });
}

export function stopPomodoro() {
  pomodoro.set({ phase: 'idle', startedAt: 0, endsAt: 0 });
  audio.setBreak(false);
}

export function skipPhase() {
  const p = pomodoro.get();
  if (p.phase === 'focus') finish();
  else if (p.phase === 'break') stopPomodoro();
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, tag: 'ao-pomodoro' });
  } catch {
    // notifications blocked: the bell is enough
  }
}

// Focus done: count the round, ring, start the break.
function finish() {
  const p = pomodoro.get();
  const rounds = (p.day === today() ? p.rounds : 0) + 1;
  pomodoro.set({ rounds, day: today() });
  audio.sfx.bell();
  notify('Time for a break', `${p.breakMin} minutes. Round ${rounds} done today.`);
  begin('break');
}

// Called about once a second by whoever shows the timer.
export function tickPomodoro(now = Date.now()) {
  const p = pomodoro.get();
  if (p.phase === 'idle' || !p.endsAt || now < p.endsAt) return;
  if (p.phase === 'focus') finish();
  else {
    audio.sfx.bell();
    notify('Break is over', 'Start another focus round when you are ready.');
    stopPomodoro();
  }
}

// 0..1 through the current phase, and the time left as m:ss.
export function progressOf(p: Pomodoro, now = Date.now()) {
  if (p.phase === 'idle' || !p.endsAt) return { done: 0, left: '' };
  const total = Math.max(1, p.endsAt - p.startedAt);
  const leftMs = Math.max(0, p.endsAt - now);
  const s = Math.ceil(leftMs / 1000);
  return { done: Math.min(1, 1 - leftMs / total), left: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
}
