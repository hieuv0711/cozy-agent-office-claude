import { useMemo } from 'react';
import { useDetail, useHistory, useModelRecap, useRecap, type Detail, type History, type HistoryFilter, type ModelRecap, type Recap } from '../api';
import { demoDetail, demoHistory, demoModelRecap, demoRecap } from './history-demo';

// Where History and Recap get their data: this Mac's sessions from the server,
// or with `?demo` a made-up history (no real project ever shows). The choice
// is made once per page load, so each hook below is always the same hook.

export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

function useDemoHistory(filter: HistoryFilter): { data: History | null; error: string } {
  const key = JSON.stringify(filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => demoHistory(filter), [key]);
  return { data, error: '' };
}

function useDemoDetail(id: string | null): { detail: Detail | null; error: string; loading: boolean } {
  const detail = useMemo(() => (id ? demoDetail(id) : null), [id]);
  return { detail, error: id && !detail ? 'not found' : '', loading: false };
}

function useDemoRecap(from: string, to: string): { data: Recap | null; error: string } {
  const data = useMemo(() => demoRecap(from, to), [from, to]);
  return { data, error: '' };
}

function useDemoModelRecap(model: string | null, from: string, to: string): { data: ModelRecap | null; error: string } {
  const data = useMemo(() => (model ? demoModelRecap(model, from, to) : null), [model, from, to]);
  return { data, error: '' };
}

/** The diary's sessions for a filter. */
export const useDiary: (filter: HistoryFilter) => { data: History | null; error: string } = DEMO ? useDemoHistory : useHistory;

// The session page asks for every step it can get (finished sessions keep up to 3,000 in the cache).
const useRealSession = (id: string | null) => useDetail(id, undefined, 'events=3000');
/** One session in full: its steps, lanes and files. */
export const useSession: (id: string | null) => { detail: Detail | null; error: string; loading: boolean } = DEMO ? useDemoDetail : useRealSession;

/** Recap's totals for a period. */
export const useRecapData: (from: string, to: string) => { data: Recap | null; error: string } = DEMO ? useDemoRecap : useRecap;

/** What one model did in a period. */
export const useModelData: (model: string | null, from: string, to: string) => { data: ModelRecap | null; error: string } = DEMO ? useDemoModelRecap : useModelRecap;
