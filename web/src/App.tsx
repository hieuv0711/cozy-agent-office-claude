import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dayKey, EMPTY_FILTER, filterToParams, paramsToFilter, useDetail, useOffice, type Detail, type HistoryFilter } from './api';
import { cameraCmd, cameraUi, PRESETS } from './office/camera';
import { CaptionRail } from './panels/CaptionRail';
import { EpisodeCard } from './panels/EpisodeCard';
import { MiniRoster, useMiniWindow } from './panels/MiniWindow';
import { useOfficeEvents } from './audio/useOfficeEvents';
import { audio } from './audio';
import { tickPomodoro } from './lib/pomodoro';
import { setWorld, WORLD_ORDER, WORLD_WORDS, WORLDS, worldUi, type WorldId } from './office/world';
import { setWeather, useWeather, WEATHER_ORDER, type Weather } from './tide/weather/state';
import { WEATHER_PICK, WEATHER_TIP } from './panels/weather-words';
import { PEOPLE_LABEL, PEOPLE_STYLES, peopleUi, setPeopleStyle, type PeopleStyle } from './tide/crew/style';
import { demoOffice } from './tide/demo';
import { editor, setEditing } from './tide/editorState';
import { clockSec } from './fmt';
import { DetailPanel, type Tab } from './panels/DetailPanel';
import { HistoryView } from './panels/HistoryView';
import { RecapView } from './panels/RecapView';
import { TeamView } from './panels/TeamView';
import { advance, PACE_WORDS, PACES, replaySession, storyOf, type Replay } from './replay';
import { askWords, RequestMap, stepTag, whenWords } from './panels/history-replay';
import { requestAt, stepAt } from './panels/history-steps';
import { cleanTitle, clockOf, dateWords } from './panels/history-words';
import { tip, TooltipLayer } from './panels/Tooltip';

const TideWorld = lazy(() => import('./tide/TideWorld'));

type View = 'office' | 'team' | 'history' | 'recap';

/** What each view is, for the tabs' tooltips. */
const VIEW_TIP: Record<View, string> = {
  office: 'The room, live: every session is a person at work',
  team: 'One session at a time: its main agent and helpers side by side, and what each one did',
  history: 'Past sessions as a diary, each with a replay of how it went',
  recap: 'What got done today, this week or this month, in words first',
};

function readLS(key: string, def: string) {
  try {
    return localStorage.getItem(key) ?? def;
  } catch {
    return def;
  }
}
function writeLS(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // storage blocked: keep the in-memory value
  }
}

/**
 * Watching a past session in the room: which request it is and what you
 * asked, what it's doing this moment, and the requests as a strip to jump
 * between. "Back to live" returns the room to now (the History page keeps
 * its place).
 */
function ReplayBar({ replay, setReplay }: { replay: Replay; setReplay: (r: Replay | null) => void }) {
  const d = replay.detail;
  const story = storyOf(d);
  const { requests, steps } = story;
  const cur = requestAt(requests, replay.t);
  const r = requests[cur];
  const days = dayKey(d.startedAt) !== dayKey(Math.max(d.endedAt, d.startedAt));
  const set = (patch: Partial<Replay>) => setReplay({ ...replay, ...patch });
  const go = (i: number) => requests[i] && set({ t: requests[i].t0 });
  const toggle = () => set({ playing: !replay.playing, t: replay.t >= d.endedAt ? d.startedAt : replay.t });
  const at = stepAt(steps, replay.t, (x) => x.agent === 'main');
  const now = at >= 0 ? steps[at] : null;
  const tag = now ? stepTag(now) : null;
  const back = r && replay.t > r.t0 + 1500 ? cur : cur - 1;
  return (
    <div className="replay-bar rp" role="region" aria-label="Replay">
      <div className="rb-top">
        <span className="rb-badge">Replay</span>
        <span className="rb-title" {...tip(spanOf(d), cleanTitle(d.title))}>
          {cleanTitle(d.title)}
        </span>
        <button type="button" className="btn primary" onClick={() => setReplay({ ...replay, watching: false, playing: false })} {...tip('The room goes back to your sessions as they are now. History keeps the replay where you left it.')}>
          Back to live
        </button>
      </div>
      {r && (
        <p className="rb-ask">
          <span className="rb-n">
            {requests.length > 1 ? `Request ${cur + 1} of ${requests.length}` : 'The request'} · {whenWords(r.t0, days)}
          </span>
          {r.ask ? <q>{r.ask}</q> : <span className="note">{askWords(r)}</span>}
        </p>
      )}
      <p className="rb-now">
        <span className="rb-now-k">Now</span>
        {now && tag ? (
          <>
            <span className={`rp-st-tag ${tag.cls}`}>{tag.tag}</span>
            <span className="rb-now-text">{now.text}</span>
            {now.ok === false && <span className="rp-now-fail">Failed{now.reason ? `: ${now.reason}` : ''}</span>}
          </>
        ) : (
          <span className="rb-now-text">Starting</span>
        )}
        <span className="rb-clock mono">{clockSec(replay.t)}</span>
      </p>
      <div className="rb-controls">
        <button type="button" className="btn" onClick={() => go(Math.max(0, back))} disabled={back < 0} {...tip('To the start of this request, or of the one before', 'Previous request')}>
          ‹ Previous
        </button>
        <button type="button" className="btn rb-play" onClick={toggle}>
          {replay.playing ? 'Pause' : replay.t >= d.endedAt ? 'Play again' : 'Play'}
        </button>
        <button type="button" className="btn" onClick={() => go(cur + 1)} disabled={cur >= requests.length - 1} {...tip('To the start of the next thing you asked', 'Next request')}>
          Next ›
        </button>
        <RequestMap d={d} story={story} t={replay.t} head compact sel={cur} onSeek={(t) => set({ t })} onToggle={toggle} />
        <span className="seg rb-pace" role="group" aria-label="Replay pace">
          {PACES.map((p) => (
            <button key={p} type="button" aria-pressed={replay.pace === p} onClick={() => set({ pace: p })}>
              {PACE_WORDS[p]}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

/** "Tuesday 17 Nov, 08:36 to 09:20". */
function spanOf(d: Detail): string {
  const a = d.startedAt;
  const b = Math.max(d.endedAt, a);
  return dayKey(a) === dayKey(b) ? `${dateWords(a)}, ${clockOf(a)} to ${clockOf(b)}` : `${dateWords(a)}, ${clockOf(a)} to ${dateWords(b)}, ${clockOf(b)}`;
}

// `?bare` hides every overlay so only the 3D place shows (for screenshots).
const BARE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bare');
// `?embed=panel` / `?embed=tab`: shown by the VS Code / Cursor extension. Its bottom panel opens on the
// room alone with a small bar (a pane that size has no room for the rest); "More" brings the whole app.
const EMBED = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('embed') : null;
// `?demo` fills the tank with made-up sessions, one in every state (no real projects shown).
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export default function App() {
  const { office: liveOffice, connected } = useOffice();
  const office = DEMO ? demoOffice() : liveOffice;
  const [view, setView] = useState<View>(() => {
    const h = window.location.hash.slice(1).split('?')[0];
    return h === 'team' || h === 'history' || h === 'recap' ? h : 'office';
  });
  const [hfilter, setHFilter] = useState<HistoryFilter>(() => {
    const [h, qs] = window.location.hash.slice(1).split('?');
    return h === 'history' && qs ? paramsToFilter(new URLSearchParams(qs)) : EMPTY_FILTER;
  });
  // Follow hash edits and links (#history?q=…, #recap) on an open page too.
  useEffect(() => {
    const onHash = () => {
      const [h, qs] = window.location.hash.slice(1).split('?');
      const v: View = h === 'team' || h === 'history' || h === 'recap' ? h : 'office';
      setView(v);
      if (v === 'history') setHFilter(qs ? paramsToFilter(new URLSearchParams(qs)) : EMPTY_FILTER);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [sel, setSel] = useState<{ sid: string | null; agent: string | null }>({ sid: null, agent: null });
  const selRef = useRef<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const weather = useWeather();
  const [tick, setTick] = useState(0);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [notify, setNotify] = useState(() => readLS('ao-notify', '') === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted');

  useEffect(() => {
    const t = window.setInterval(() => {
      setTick((x) => x + 1);
      tickPomodoro();
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const qs = view === 'history' ? filterToParams(hfilter).toString() : '';
    window.history.replaceState(null, '', `#${view}${qs ? `?${qs}` : ''}`);
  }, [view, hfilter]);

  // Replay clock: 4 steps a second is plenty, the characters animate on their own.
  // Each request takes about the pace's time; quiet stretches (overnight, lunch) are skipped.
  useEffect(() => {
    if (!replay?.playing) return;
    let last = performance.now();
    const iv = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setReplay((r) => (r && r.playing ? advance(r, dt) : r));
    }, 250);
    return () => window.clearInterval(iv);
  }, [replay?.playing]);
  // a replay playing on its History page pauses when you go elsewhere (one shown in the room keeps going)
  useEffect(() => {
    if (view !== 'history') setReplay((r) => (r && r.playing && !r.watching ? { ...r, playing: false } : r));
  }, [view]);

  const live = office?.sessions || [];
  const watching = replay?.watching ? replay : null;
  const replaySess = useMemo(() => (watching ? replaySession(watching.detail, watching.t) : null), [watching]);
  const sessions = replaySess ? [replaySess] : live;
  const selSession = sessions.find((s) => s.id === sel.sid) || null;
  const { detail, loading, error } = useDetail(view === 'office' ? sel.sid : null, watching ? -1 : selSession?.rev);

  const [showAll, setShowAll] = useState(false);
  const select = useCallback((sid: string | null, agent: string | null = null) => {
    setSel({ sid, agent });
    if (!sid) setShowAll(false);
    if (agent) setTab('subagents');
    else if (sid !== selRef.current) setTab('overview');
    selRef.current = sid;
  }, []);

  // Stream mode: panels hide, the top bar fades until the mouse moves.
  const stream = cameraUi.use((s) => s.stream);
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    if (!stream) {
      setAwake(true);
      return;
    }
    let t = window.setTimeout(() => setAwake(false), 2500);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setAwake(false), 2500);
    };
    window.addEventListener('mousemove', wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousemove', wake);
    };
  }, [stream]);

  // Keyboard: + / - zoom, 0 reset, 1-5 presets, F follow, S stream, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || view !== 'office' || editor.get().editing) return;
      const k = e.key;
      if (k === '+' || k === '=') cameraCmd({ type: 'zoomBy', delta: 0.08 });
      else if (k === '-' || k === '_') cameraCmd({ type: 'zoomBy', delta: -0.08 });
      else if (k === '0') cameraCmd({ type: 'preset', preset: 'wide' });
      else if (/^[1-5]$/.test(k)) cameraCmd({ type: 'preset', preset: PRESETS[Number(k) - 1].id });
      else if (k === 'f' || k === 'F') cameraUi.set({ follow: !cameraUi.get().follow });
      else if (k === 's' || k === 'S') cameraUi.set({ stream: !cameraUi.get().stream });
      else if (k === 'Escape') {
        if (cameraUi.get().stream) cameraUi.set({ stream: false });
        else select(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, select]);

  // Tab title and desktop alerts when an agent starts waiting for you.
  // (whoever is already waiting when the page opens isn't news: only a new wait alerts)
  const prevNeeds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!office) return;
    const needs = office.sessions.filter((s) => s.status === 'needs-you');
    document.title = needs.length ? `(${needs.length}) needs you · Agent Office` : 'Agent Office';
    if (!prevNeeds.current) {
      prevNeeds.current = new Set(needs.map((s) => s.id));
      return;
    }
    if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const s of needs) {
        if (prevNeeds.current.has(s.id)) continue;
        const why = s.waitingFor || 'Waiting for your input';
        new Notification(`${s.name} needs you`, { body: `${why}${s.now ? `: ${s.now.short} ${s.now.target}` : ''}\n${s.title}`, tag: s.id });
      }
    }
    prevNeeds.current = new Set(needs.map((s) => s.id));
  }, [office, notify]);

  const toggleNotify = async () => {
    if (notify) {
      setNotify(false);
      writeLS('ao-notify', '');
      return;
    }
    if (typeof Notification === 'undefined') return;
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p === 'granted') {
      setNotify(true);
      writeLS('ao-notify', '1');
    }
  };

  const needList = live.filter((s) => s.status === 'needs-you').sort((a, b) => a.statusSince - b.statusSince);
  const cycleNeeds = () => {
    if (!needList.length) return;
    const i = needList.findIndex((s) => s.id === sel.sid);
    setReplay((r) => (r ? { ...r, watching: false, playing: false } : r));
    setView('office');
    select(needList[(i + 1) % needList.length].id);
  };

  // the room acts out a past session; no card opens (the replay bar tells the story)
  const watch = (d: Detail) => {
    setReplay((r) => ({ detail: d, t: r && r.detail.id === d.id && r.t < d.endedAt ? r.t : d.startedAt, playing: true, pace: r?.pace || 'normal', watching: true }));
    setSel({ sid: null, agent: null });
    selRef.current = null;
    setView('office');
  };

  const t = office?.totals || { working: 0, needsYou: 0, idle: 0, bots: 0 };
  // the room alone (the editor's bottom panel opens this way); only the room's view has it
  const [compact, setCompact] = useState(EMBED === 'panel');
  const roomOnly = compact && view === 'office' && !BARE;
  const world = worldUi.use((w) => w.id);
  const people = peopleUi.use((p) => p.style);
  // sounds for what happens in the office, and the room's ambience
  useOfficeEvents(watching ? null : office, true);
  useEffect(() => {
    audio.ambience.setWeather(weather);
    audio.ambience.setCity(world !== 'workshop');
  }, [weather, world]);
  const mini = useMiniWindow();
  const editing = editor.use((e) => e.editing);
  // The 3D room stays alive once it has opened: on Team, History or Recap it is
  // hidden and stops drawing, and coming back shows it at once instead of
  // building it all again.
  const [stageOn, setStageOn] = useState(view === 'office');
  useEffect(() => {
    if (view === 'office') setStageOn(true);
  }, [view]);
  // customising only makes sense on the live view
  useEffect(() => {
    if (view !== 'office' && editor.get().editing) setEditing(false);
  }, [view]);
  return (
    <div className={`app${stream && view === 'office' ? ' stream' : ''}${stream && !awake ? ' sleepy' : ''}${BARE ? ' bare' : ''}${roomOnly ? ' compact' : ''}`}>
      {!roomOnly && (
      <header className="topbar">
        <div className="brand title-card">Agent Office</div>
        <nav className="views" aria-label="Views">
          {(['office', 'team', 'history', 'recap'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} {...tip(VIEW_TIP[v])}>
              {v === 'team' ? 'Team' : v === 'office' ? WORLD_WORDS[world].view : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>
        <div className="counts">
          {!connected && <span className="conn">Reconnecting…</span>}
          {!office && connected && <span>Connecting…</span>}
          {watching && view === 'office' ? (
            <span className="count replaying" {...tip('The room is acting out a past session. "Back to live" in the replay bar returns to your sessions as they are now.', 'Watching a replay')}>
              Watching a replay
            </span>
          ) : (
          <span className="count" {...tip('Sessions using a tool or thinking right now', `${t.working} working`)}>
            <b>{t.working}</b>working
          </span>
          )}
          {t.needsYou > 0 && (
            <button type="button" className="needs-btn" onClick={cycleNeeds} {...tip('They wait for your answer or your OK. Click to go to the next one.', `${t.needsYou} waiting for you`)}>
              <b>{t.needsYou}</b>
              <span>
                waiting<span className="for-you"> for you</span>
              </span>
            </button>
          )}
          {!(watching && view === 'office') && (
          <span className="count" {...tip('Sessions with nothing to do right now. After a while with a mug, they nod off.', `${t.idle} idle`)}>
            <b>{t.idle}</b>idle
          </span>
          )}
          {t.bots > 0 && !(watching && view === 'office') && (
            <span
              className="count helpers"
              {...tip(
                'Helpers the sessions handed part of their work to (subagents and teammates), working right now. Their small tags in the room say what each one does.',
                `${t.bots} helper${t.bots === 1 ? '' : 's'}`,
              )}
            >
              <b>{t.bots}</b>helper{t.bots === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <select
          className="select place"
          aria-label="Theme"
          value={world}
          onChange={(e) => setWorld(e.target.value as WorldId)}
          {...tip(`Where everyone works: ${WORLDS[world].blurb.toLowerCase()} now. Each place keeps its own furniture and camera angle.`, 'Theme')}
        >
          {WORLD_ORDER.map((w) => (
            <option key={w} value={w}>
              {WORLDS[w].name}
            </option>
          ))}
        </select>
        <select
          className="select place weather"
          aria-label="Weather"
          value={weather}
          onChange={(e) => setWeather(e.target.value as Weather)}
          {...tip(`${WEATHER_TIP[weather]} The same weather in every theme; saved for next time.`, `Weather: ${WEATHER_PICK[weather].toLowerCase()}`)}
        >
          {WEATHER_ORDER.map((w) => (
            <option key={w} value={w}>
              {WEATHER_PICK[w]}
            </option>
          ))}
        </select>
        <select
          className="select place people"
          aria-label="People"
          value={people}
          onChange={(e) => setPeopleStyle(e.target.value as PeopleStyle)}
          {...tip('Little bots with screen faces, or Ink toon cartoons with an outline. Same moves and clothes in both; saved for next time.', 'How the people look')}
        >
          {PEOPLE_STYLES.map((p) => (
            <option key={p} value={p}>
              {PEOPLE_LABEL[p]}
            </option>
          ))}
        </select>
        {view === 'office' && (
          <button
            type="button"
            className="icon-btn"
            aria-pressed={editing}
            onClick={() => {
              if (!editing) select(null);
              setEditing(!editing);
            }}
            {...tip(editing ? 'Click Done in the panel, or here, when you are finished' : `${WORLD_WORDS[world].customize}. People use what you add.`, editing ? 'Customizing' : 'Customize')}
          >
            {editing ? 'Customizing' : 'Customize'}
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-pressed={notify}
          onClick={toggleNotify}
          {...tip(
            notify ? 'A desktop notification when a session starts waiting for you. Click to turn them off.' : 'Click for a desktop notification when a session starts waiting for you',
            notify ? 'Alerts are on' : 'Alerts are off',
          )}
        >
          {notify ? 'Alerts on' : 'Alerts off'}
        </button>
        {mini.supported && (
          <button type="button" className="icon-btn" onClick={mini.open} {...tip("A small window that stays on top of your other apps, with everyone's status", 'Pop out')}>
            Pop out
          </button>
        )}
        {EMBED && view === 'office' && (
          <button type="button" className="icon-btn" onClick={() => setCompact(true)} {...tip('Just the room and its name tags, for a small pane', 'Room only')}>
            Room only
          </button>
        )}
      </header>
      )}
      <main className="main">
        {stageOn && (
          <section
            className="stage"
            data-world={world}
            data-weather={weather}
            aria-label={`3D place: ${WORLDS[world].name}`}
            aria-hidden={view !== 'office' || undefined}
            style={view === 'office' ? undefined : { display: 'none' }}
          >
            <Suspense fallback={<div className="loading">{WORLD_WORDS[world].loading}</div>}>
              {office && (
                <TideWorld
                  sessions={sessions}
                  selected={sel.sid}
                  selectedAgent={sel.agent}
                  onSelect={select}
                  tick={tick}
                  replay={!!watching}
                  active={view === 'office'}
                  onBackground={() => select(null)}
                />
              )}
            </Suspense>
            {watching && <ReplayBar replay={watching} setReplay={setReplay} />}
            {roomOnly && (
              <div className="compact-bar" role="toolbar" aria-label="Agent Office">
                <span className="count" {...tip('Sessions using a tool or thinking right now', `${t.working} working`)}>
                  <b>{t.working}</b>working
                </span>
                {t.needsYou > 0 && (
                  <button type="button" className="needs-btn" onClick={cycleNeeds} {...tip('They wait for your answer or your OK. Click to go to the next one.', `${t.needsYou} waiting for you`)}>
                    <b>{t.needsYou}</b> waiting
                  </button>
                )}
                <span className="count" {...tip('Sessions with nothing to do right now', `${t.idle} idle`)}>
                  <b>{t.idle}</b>idle
                </span>
                <button type="button" className="icon-btn" onClick={() => setCompact(false)} {...tip('History, Recap, the theme, the weather, the music, the captions and the camera', 'The whole app')}>
                  More
                </button>
              </div>
            )}
            <EpisodeCard />
            {office && !sessions.length && <div className="empty-office">{WORLD_WORDS[world].empty}</div>}
          </section>
        )}
        {view === 'office' && (
          <>
            {!stream && !editing && !roomOnly && (sel.sid || showAll) && (
            <DetailPanel
              office={office}
              session={selSession}
              detail={detail}
              loading={loading}
              error={error}
              tab={tab}
              setTab={setTab}
              selectedAgent={sel.agent}
              onSelect={select}
              onOpenTeam={() => setView('team')}
              replay={!!watching}
            />
            )}
          </>
        )}
        {view === 'team' && <TeamView sessions={live} sid={sel.sid} onPick={(id) => select(id)} />}
        {view === 'history' && (
          <HistoryView
            filter={hfilter}
            setFilter={setHFilter}
            replay={replay}
            setReplay={setReplay}
            onWatch={watch}
            onTeam={(id) => {
              select(id);
              setView('team');
            }}
          />
        )}
        {view === 'recap' && (
          <RecapView
            onOpenDay={(from, to, project) => {
              setHFilter({ ...EMPTY_FILTER, from, to, projects: project ? [project] : [] });
              setView('history');
            }}
          />
        )}
      </main>
      {mini.win && <MiniRoster win={mini.win} sessions={live} />}
      {view === 'office' && office && !editing && !roomOnly && (
        <CaptionRail
          sessions={sessions}
          replaying={!!replaySess}
          selected={sel.sid}
          onSelect={(id) => {
            setShowAll(false);
            select(id);
          }}
          showAll={showAll}
          setShowAll={(v) => {
            setShowAll(v);
            if (v) select(null);
            if (v) setShowAll(true);
          }}
          onGoTo={(id) => {
            setShowAll(false);
            select(id);
            cameraCmd({ type: 'focus', sid: id });
          }}
        />
      )}
      <TooltipLayer />
    </div>
  );
}
