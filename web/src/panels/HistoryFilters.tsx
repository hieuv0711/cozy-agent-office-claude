import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, EMPTY_FILTER, type History, type HistoryFilter } from '../api';
import { counted, listWords, numberWord, rangeWords, todayKey } from './history-words';

type Range = { id: string; label: string; range: () => [string, string] };

function ranges(): Range[] {
  const today = todayKey();
  return [
    { id: 'all', label: 'Any time', range: () => ['', ''] },
    { id: 'today', label: 'Today', range: () => [today, today] },
    { id: 'yesterday', label: 'Yesterday', range: () => [addDays(today, -1), addDays(today, -1)] },
    { id: '7d', label: 'Last 7 days', range: () => [addDays(today, -6), today] },
    { id: '30d', label: 'Last 30 days', range: () => [addDays(today, -29), today] },
  ];
}

// "Show": which sessions, as one choice. Each maps to the filter's status list
// or its problems flag; anything else a link carries is named below the pickers.
type Show = 'all' | 'running' | 'problems' | 'kept';
const SHOWS: [Show, string][] = [
  ['all', 'Every session'],
  ['running', 'Still running'],
  ['problems', 'With failed steps'],
  ['kept', 'Kept after cleanup'],
];

function showOf(f: HistoryFilter): Show | null {
  const st = f.status.join(',');
  if (f.problems) return st ? null : 'problems';
  if (!st) return 'all';
  if (st === 'live') return 'running';
  if (st === 'kept') return 'kept';
  return null;
}

function withShow(f: HistoryFilter, s: Show): HistoryFilter {
  return { ...f, problems: s === 'problems', status: s === 'running' ? ['live'] : s === 'kept' ? ['kept'] : [] };
}

const STATUS_WORDS: Record<string, string> = { live: 'are still running', ended: 'have ended', kept: 'Agent Office kept after their transcript was deleted' };

// Search, when, which project, and which sessions. A model filter is no longer
// offered; when a link still carries one it is named, with a way out.
export function HistoryFilters({ filter, onChange, data }: { filter: HistoryFilter; onChange: (f: HistoryFilter) => void; data: History | null }) {
  const [q, setQ] = useState(filter.q);
  useEffect(() => setQ(filter.q), [filter.q]);
  useEffect(() => {
    if (q === filter.q) return;
    const t = window.setTimeout(() => onChange({ ...filter, q }), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // "/" jumps to the search, as on most sites
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rs = ranges();
  const preset = rs.find((r) => {
    const [a, b] = r.range();
    return a === filter.from && b === filter.to;
  });
  const [picking, setPicking] = useState(false);
  const custom = !preset;
  const showDates = custom || picking;
  const show = showOf(filter);

  // Projects with sessions under the other filters, A to Z; a chosen one stays listed.
  const projects = useMemo(() => {
    const names = new Set((data?.facets.projects || []).map((p) => p.name));
    for (const p of filter.projects) names.add(p);
    return [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  }, [data, filter.projects]);
  const projectValue = filter.projects.length === 1 ? filter.projects[0] : filter.projects.length ? '__several' : '';

  const hidden: string[] = [];
  if (filter.models.length) hidden.push(`used ${listWords(filter.models)}`);
  if (!show && filter.status.length) hidden.push(filter.status.map((s) => STATUS_WORDS[s] || s).join(' or '));
  if (!show && filter.problems) hidden.push('had a step fail');
  const active = !!(filter.q || filter.from || filter.to || filter.projects.length || filter.problems || filter.status.length || hidden.length);

  return (
    <div className="hx-filters" role="search" aria-label="Find sessions">
      <input
        ref={search}
        className="search"
        type="search"
        placeholder="Search what you asked, files, commands…"
        aria-label="Search sessions"
        aria-describedby={q ? 'hx-search-hint' : undefined}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && q) {
            e.stopPropagation();
            setQ('');
          }
        }}
      />
      {q && (
        <p className="hx-hint" id="hx-search-hint">
          Looking in titles, prompts, files, commands and what the helpers were asked. Every word has to match; put a phrase in quotes to keep it together.
        </p>
      )}
      <div className="hx-pickers">
        <label className="hx-pick">
          <span>When</span>
          <select
            className="select"
            value={showDates ? 'custom' : preset?.id}
            onChange={(e) => {
              const r = rs.find((x) => x.id === e.target.value);
              if (!r) {
                setPicking(true);
                return;
              }
              setPicking(false);
              const [from, to] = r.range();
              onChange({ ...filter, from, to });
            }}
          >
            {rs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
            <option value="custom">{custom ? rangeWords(filter.from, filter.to) : 'Pick dates…'}</option>
          </select>
        </label>
        <label className="hx-pick">
          <span>Project</span>
          <select
            className="select"
            value={projectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__several') return;
              onChange({ ...filter, projects: v ? [v] : [] });
            }}
          >
            <option value="">All projects</option>
            {filter.projects.length > 1 && <option value="__several">{counted(filter.projects.length, 'project')}</option>}
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="hx-pick">
          <span>Show</span>
          <select className="select" value={show || 'custom'} onChange={(e) => e.target.value !== 'custom' && onChange(withShow(filter, e.target.value as Show))}>
            {SHOWS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            {!show && <option value="custom">Some of them</option>}
          </select>
        </label>
      </div>
      {showDates && (
        <div className="hx-dates">
          <label>
            <span>From</span>
            <input type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => onChange({ ...filter, from: e.target.value })} />
          </label>
          <label>
            <span>to</span>
            <input type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => onChange({ ...filter, to: e.target.value })} />
          </label>
        </div>
      )}
      {hidden.length > 0 && (
        <p className="hx-also">
          Showing only sessions that {listWords(hidden)}.{' '}
          <button type="button" className="linkish" onClick={() => onChange({ ...filter, models: [], status: [], problems: false, sort: 'recent' })}>
            Show all
          </button>
        </p>
      )}
      <div className="hx-count" aria-live="polite">
        <span>
          {data ? (data.totals.sessions === 1 ? '1 session' : `${data.totals.sessions.toLocaleString('en')} sessions`) : 'Opening the diary…'}
          {data?.indexing?.running ? ` · still reading older ones (${numberWord(data.indexing.done)} of ${numberWord(data.indexing.total)})` : ''}
        </span>
        {active && (
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setPicking(false);
              setQ('');
              onChange({ ...EMPTY_FILTER, empty: filter.empty });
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
