import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { type FC, memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OfficeSession, OfficeSub } from '../../api';
import { AskSign, SleepZs } from '../../tank/signs';
import { smoothstep } from '../../tank/util';
import { hash, sessionColor } from '../../theme';
import { type Kit, lookFor, type Motion, type Outfit, Person } from './Person';
import type { CrewPlan, Place, Trip, V2, WorkSpot } from './plan';
import { TEST_HOOKS } from '../../lib/assetCache';
import { weatherUi } from '../weather/state';
import { wearFor } from './Person';
import { placeUse } from './signals';
import { type ItemPlace, itemPlacesUi } from './itemPlaces';

// The cast of a people theme. Every session is a person with a work spot of
// their own, in the theme's floor plan (crew/plan.ts):
//   working:   at their spot, doing what the tool does; when a tool keeps them
//              busy for a while, they walk to the theme's place for it (the
//              printer, the lathe, the big broth pots) and back after;
//   finishing: at the end of a turn, the theme's closing steps (the kitchen
//              plates the dish and carries it to the customer who came in for
//              it, the office moves its note to "done", the workshop carries
//              the toy to the counter);
//   waiting:   at the waiting spots under a yellow lamp, with a "?";
//   idle:      a seat in the idle corner with a mug (a hot drink in both hands
//              when it snows, an iced one on a sunny day), a nap after a while; with every seat taken, a
//              stool you added, else a doze at the work spot; now and then,
//              before the nap, a break at something you added to the room (a
//              coffee, the bookshelf, a plant, the radio, a toy: itemPlaces.ts);
//   helpers:   small assistants at the theme's helper spots, else at free
//              work spots;
//   arriving:  in through the door; leaving: out the same way (with an
//              umbrella up near the door when it rains).

/** A session's place in the cast: its work spot, its turn in the waiting line, coming or going. */
export interface Placement {
  s: OfficeSession;
  home: number;
  front: number;
  departing: boolean;
  arriving: boolean;
}

export interface StationProps {
  st: WorkSpot;
  act: string | null;
  seed: number;
  /** Somebody has this spot (even if they're away from it). */
  busy: boolean;
  /** A workflow is running for its person. */
  rush: boolean;
}

/** One step of a theme's end-of-turn routine. */
export interface FinishStep {
  act: string;
  seconds: number;
  /**
   * Where: at the work spot (left out), the first free of these places, or a
   * place chosen when the step starts (null: there's nowhere to do it, so it
   * counts as done at once).
   */
  place?: string[] | ((sid: string, station: number) => Place | null);
  /** What they do while walking there (carrying something), default 'stand'. */
  carry?: string;
  /** Called when the step is done (or cut short). */
  done?: (station: number, sid: string, color: string) => void;
}

export interface CrewTheme {
  /** The theme's id (for what it keeps per day). */
  id: string;
  plan: CrewPlan;
  kit: Kit;
  outfit: Outfit;
  helperOutfit: Outfit;
  /** What someone does at their spot for the session's current tool. */
  workAct: (s: OfficeSession) => string;
  /** Turns a plain work act into what is shown right now (to keep busy while thinking). */
  busy?: (act: string, t: number, seed: number) => string;
  /** Idle: with a mug, or napping. */
  idleAct: (napping: boolean) => string;
  /** Idle with no seat free: dozing at the work spot (standing or seated). */
  dozeAct: string;
  /** How someone waits for you (default: waving). */
  waitAct?: string;
  /** Places to walk to for a while, and which one a working session wants now. */
  places?: Place[];
  tripFor?: (s: OfficeSession, st: WorkSpot) => Trip | null;
  /** The end of a turn (working, then idle): closing steps, at the work spot or at places. */
  finish?: { steps: FinishStep[] };
  /** Helpers' own spots, in order; after them, any free work spot. */
  helperSpots?: Place[];
  /** What a helper does at a free work spot. */
  helperAct: (running: boolean) => string;
  Station: FC<StationProps>;
  /** Things that follow the cast (the kitchen's dining floor, the office board). */
  Extras?: FC<{ placed: Placement[] }>;
  /** The waiting lamps' bulb materials, brightened over whoever waits there. */
  bulbs?: THREE.MeshStandardMaterial[];
  /** Under the name of a session that just ended. */
  leftText: string;
  /** Ways people walk that aren't in the plan (the kitchen's customers): kept clear of furniture. */
  walkways?: V2[][];
}

const LEAVE_MS = 16_000;
const WALK = 2.15; // world units per second
/** How long someone has a mug before nodding off. */
const NAP_AFTER_MS = 150_000;
/** Most helpers shown per session. */
const HELPERS_EACH = 3;

/** Gives every session a work spot (front row first), keeps leavers long enough to walk out. */
export function useCrewPlacement(sessions: OfficeSession[], tick: number): Placement[] {
  const mem = useRef({
    home: new Map<string, number>(),
    seen: new Map<string, OfficeSession>(),
    gone: new Map<string, { s: OfficeSession; at: number }>(),
    initial: new Set<string>(),
    first: true,
  });
  return useMemo(() => {
    const m = mem.current;
    const now = Date.now();
    const ids = new Set(sessions.map((s) => s.id));
    if (m.first) {
      for (const s of sessions) m.initial.add(s.id);
      m.first = false;
    }
    for (const [id, s] of m.seen) if (!ids.has(id) && !m.gone.has(id)) m.gone.set(id, { s, at: now });
    for (const [id, g] of m.gone) if (ids.has(id) || now - g.at > LEAVE_MS) m.gone.delete(id);
    for (const id of [...m.home.keys()]) if (!ids.has(id) && !m.gone.has(id)) m.home.delete(id);
    for (const s of sessions) {
      if (m.home.has(s.id)) continue;
      const used = new Set(m.home.values());
      let i = 0;
      while (used.has(i)) i++;
      m.home.set(s.id, i);
    }
    const waiting = sessions.filter((s) => s.status === 'needs-you').sort((a, b) => (a.statusSince || 0) - (b.statusSince || 0));
    const out: Placement[] = sessions.map((s) => ({ s, home: m.home.get(s.id) ?? 0, front: Math.max(0, waiting.indexOf(s)), departing: false, arriving: !m.initial.has(s.id) }));
    for (const [, g] of m.gone) out.push({ s: g.s, home: m.home.get(g.s.id) ?? 0, front: 0, departing: true, arriving: false });
    m.seen = new Map(sessions.map((s) => [s.id, s]));
    return out;
  }, [sessions, tick]);
}

/** A spot beyond the plan's list (more people than spots): squeeze in beside one. */
function stationOf(plan: CrewPlan, i: number): WorkSpot {
  const st = plan.stations[i % plan.stations.length];
  const lap = Math.floor(i / plan.stations.length);
  return lap ? { ...st, x: st.x + (lap % 2 ? 0.95 : -0.95) * Math.ceil(lap / 2) } : st;
}

// ---------- spots and routes ----------

/** Somewhere a person can be: where they stand, which way they face, and the way in from the aisle. */
interface Spot {
  key: string;
  x: number;
  z: number;
  yaw: number;
  /** Seat height (world units) if they sit there. */
  sitAt?: number;
  /** From a point on the aisle to the spot (both included). */
  approach: V2[];
}

const stationSpot = (plan: CrewPlan, i: number): Spot => {
  const st = stationOf(plan, i);
  return { key: `st:${i}`, x: st.x, z: st.z, yaw: st.yaw, sitAt: st.seat, approach: [[st.x, plan.aisleZ], [st.x, st.z]] };
};
const seatSpot = (plan: CrewPlan, i: number): Spot => {
  const q = plan.seats[i];
  return { key: `seat:${i}`, x: q.x, z: q.z, yaw: q.yaw, sitAt: q.y, approach: [[plan.cornerX, plan.aisleZ], ...(q.via ?? []), [q.x, q.z]] };
};
const waitSpot = (plan: CrewPlan, i: number): Spot => {
  const n = plan.waitSpots.length;
  const [bx, bz] = plan.waitSpots[i % n];
  // more waiting than spots: squeeze in beside one (a little to the side, a little behind)
  const lap = Math.floor(i / n);
  const x = bx + (lap ? (lap % 2 ? 0.75 : -0.75) * Math.ceil(lap / 2) : 0);
  const z = bz - 0.35 * lap;
  return { key: `wait:${i}`, x, z, yaw: 0, approach: [[x, plan.aisleZ], [x, z]] };
};
const placeSpot = (plan: CrewPlan, p: Place): Spot => ({ key: `place:${p.id}`, x: p.x, z: p.z, yaw: p.yaw, sitAt: p.sitAt, approach: [[p.aisleX ?? p.x, plan.aisleZ], ...(p.via ?? []), [p.x, p.z]] });
const doorSpot = (plan: CrewPlan): Spot => ({ key: 'door', x: plan.door.outside[0], z: plan.door.outside[1], yaw: Math.PI, approach: [[plan.door.x, plan.aisleZ], plan.door.inside, plan.door.outside] });

/** The way from one spot (where someone is) to another: back out to the aisle, along it, and in. */
function route(from: Spot | null, x: number, z: number, aisleZ: number, to: Spot): V2[] {
  const pts: V2[] = [];
  if (from) pts.push(...[...from.approach].reverse().slice(1));
  else if (Math.abs(z - aisleZ) > 0.25) pts.push([x, aisleZ]);
  pts.push(...to.approach);
  const out: V2[] = [];
  let px = x;
  let pz = z;
  for (const p of pts) {
    if (Math.hypot(p[0] - px, p[1] - pz) < 0.05) continue;
    out.push(p);
    px = p[0];
    pz = p[1];
  }
  return out;
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** One step along a path; returns whether they moved. */
function walk(c: { x: number; z: number; yaw: number; path: V2[] }, dt: number, speed: number): boolean {
  if (!c.path.length) return false;
  const [tx, tz] = c.path[0];
  const dx = tx - c.x;
  const dz = tz - c.z;
  const d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= step) {
    c.x = tx;
    c.z = tz;
    c.path.shift();
  } else {
    c.x += (dx / d) * step;
    c.z += (dz / d) * step;
    c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 9));
  }
  return true;
}

const ringGeo = new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f6f1e4').multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });

/** Who is working at each station right now, and at what (stations nobody works at are absent). */
type AtStation = Map<number, { act: string; seed: number; sid: string; rush: boolean }>;

const SLEEPY = new Set(['nap', 'doze', 'deskdoze']);
const NO_ITEMS: ItemPlace[] = [];
/** `?breaks=0`: nobody goes off to the room's things (no breaks, no work visits): test scripts that time where people are. */
const BREAKS = typeof location === 'undefined' || new URLSearchParams(location.search).get('breaks') !== '0';

/** For test scripts (development, or `?test`): what everyone is doing (window.__crew). */
const debug = new Map<string, { act: string; at: string; x: number; z: number; wear: string }>();
if (TEST_HOOKS && typeof window !== 'undefined') (window as unknown as { __crew?: unknown }).__crew = debug;

interface ResidentProps {
  theme: CrewTheme;
  pl: Placement;
  seat: number | null;
  napping: boolean;
  selected: boolean;
  interactive: boolean;
  onSelect: (sid: string) => void;
  onFocus: (sid: string) => void;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
  at: AtStation;
  /** The things in the room people can use, and the stools among them (seats after the plan's). */
  items: ItemPlace[];
  itemSeats: ItemPlace[];
}

interface Doing {
  spot: Spot;
  act: string;
  /** What they do while walking there. */
  carry: string;
  /** The station whose things they use there (null away from it). */
  station: number | null;
}

const Resident = memo(function Resident({ theme, pl, seat, napping, selected, interactive, onSelect, onFocus, anchors, labelPos, at, items, itemSeats }: ResidentProps) {
  const { plan } = theme;
  const K = plan.K;
  const s = pl.s;
  const seed = (hash(s.id) % 1000) / 97;
  const color = sessionColor(s.id);
  const look = useMemo(() => lookFor(s.id, color, theme.outfit), [s.id, color, theme.outfit]);
  const motion = useMemo<Motion>(() => ({ speed: 0, seat: 0.53 / K }), [K]);
  const places = useMemo(() => new Map<string, Place>([...(theme.places ?? []), ...items.filter((p) => !p.seat)].map((p) => [p.id, p])), [theme.places, items]);
  const home = useMemo(() => stationSpot(plan, pl.home), [plan, pl.home]);
  const door = useMemo(() => doorSpot(plan), [plan]);
  // the latest of everything the frame loop decides from (it changes without re-rendering the loop)
  const live = useRef({ pl, seat, napping, s, items, itemSeats });
  live.current = { pl, seat, napping, s, items, itemSeats };

  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null);
  const actRef = useRef<string>('stand');
  const S = useRef({
    x: pl.arriving ? door.x : home.x,
    z: pl.arriving ? door.z : home.z,
    yaw: pl.arriving ? Math.PI : home.yaw,
    path: [] as V2[],
    /** Where they are (once arrived) or were last. */
    at: (pl.arriving ? door : home) as Spot | null,
    target: null as Spot | null,
    arrived: !pl.arriving,
    /** A new destination to take once they reach somewhere they can turn (off the aisle mid-way). */
    pending: null as Spot | null,
    fade: pl.arriving ? 0 : 1,
    doing: null as Doing | null,
    // walking off to a place for a while
    trip: null as Place | null,
    tripSince: 0,
    wantKey: '',
    wantSince: 0,
    // the closing steps at the end of a turn: which one, where, until when
    fin: null as null | { i: number; spot: Spot; place: Place | null; station: number; until: number },
    // a break at something in the room: where, and until when (counted once they're there)
    visit: null as null | { place: ItemPlace; spot: Spot; until: number; stay: number },
    nextVisit: -1,
    lastVisit: '',
    // after a visit to something in the room during work: not again before this
    itemRest: 0,
    wasWorking: s.status === 'working',
    first: true,
  });

  const release = (id: string | undefined) => {
    if (!id) return;
    const u = placeUse.get(id);
    if (u && u.sid === s.id) placeUse.delete(id);
  };
  const claim = (p: Place, act: string, now: number) => placeUse.set(p.id, { act, sid: s.id, color, since: now });
  const free = (id: string) => {
    const u = placeUse.get(id);
    return !u || u.sid === s.id;
  };

  useEffect(
    () => () => {
      anchors.delete(s.id);
      labelPos.delete(s.id);
      for (const [k, v] of at) if (v.sid === s.id) at.delete(k);
      for (const [k, v] of placeUse) if (v.sid === s.id) placeUse.delete(k);
      debug.delete(s.name);
    },
    [anchors, labelPos, at, s.id, s.name],
  );

  /** Start the closing step i (or the next one that can happen). */
  const startStep = (i: number, now: number, station: number) => {
    const steps = theme.finish?.steps ?? [];
    const C = S.current;
    for (; i < steps.length; i++) {
      const st = steps[i];
      if (!st.place) {
        C.fin = { i, spot: home, place: null, station, until: -1 };
        return;
      }
      const place = typeof st.place === 'function' ? st.place(s.id, station) : (st.place.map((id) => places.get(id)).find((q): q is Place => !!q && free(q.id)) ?? null);
      if (place) {
        claim(place, 'coming', now);
        C.fin = { i, spot: placeSpot(plan, place), place, station, until: -1 };
        return;
      }
      // nowhere to do it: it counts as done
      st.done?.(station, s.id, color);
    }
    C.fin = null;
  };
  /** Cut short (back to work, asked to wait, leaving): what's left of the routine is done at once. */
  const finishAll = () => {
    const C = S.current;
    if (!C.fin) return;
    const f = C.fin;
    C.fin = null;
    release(f.place?.id);
    const steps = theme.finish?.steps ?? [];
    for (let i = f.i; i < steps.length; i++) steps[i].done?.(f.station, s.id, color);
  };

  /**
   * A long stretch of one kind of work, and something in the room for it (the
   * bookshelf while reading, the crate of vegetables while chopping): a short
   * visit (12 to 18 s), then back to their own spot for a while before the next.
   */
  const itemTrip = (ss: OfficeSession, now: number): Trip | null => {
    const C = S.current;
    if (!BREAKS || now < C.itemRest) return null;
    const kind = ss.now?.cat ?? 'think';
    const ids = live.current.items.filter((q) => !q.seat && q.work.includes(kind)).map((q) => q.id);
    return ids.length ? { places: ids, after: 6000 } : null;
  };

  /** A seat: the plan's own first, then the stools added to the room. */
  const seatAt = (i: number): Spot | null => {
    const n = plan.seats.length;
    if (i < n) return seatSpot(plan, i);
    const q = live.current.itemSeats[i - n];
    return q ? placeSpot(plan, q) : null;
  };

  /** Idle: now and then (not once they've nodded off), a break at something in the room, then back. */
  const breakAt = (now: number, nap: boolean) => {
    const C = S.current;
    const V = C.visit;
    if (V) {
      const gone = !live.current.items.some((q) => q.id === V.place.id);
      if (gone || (V.until > 0 && now >= V.until)) {
        release(V.place.id);
        C.lastVisit = V.place.id;
        C.visit = null;
        C.nextVisit = now + 45 + ((seed * 3.7 + now * 0.013) % 1) * 50;
      } else return V;
    }
    if (C.nextVisit < 0) C.nextVisit = now + 12 + ((seed * 7.3) % 1) * 24;
    if (!BREAKS || nap || now < C.nextVisit) return null;
    const options = live.current.items.filter((q) => q.idle && !q.seat && free(q.id) && q.id !== C.lastVisit);
    if (!options.length) {
      C.nextVisit = now + 15;
      return null;
    }
    const place = options[Math.floor(((seed * 13.1 + now * 0.37) % 1) * options.length) % options.length];
    claim(place, 'coming', now);
    C.visit = { place, spot: placeSpot(plan, place), until: -1, stay: 8 + ((seed * 5.9) % 1) * 7 };
    return C.visit;
  };

  /** What they should be doing now (and where). */
  const decide = (now: number): Doing => {
    const { pl: p, seat: st, napping: nap, s: ss } = live.current;
    const C = S.current;
    const working = ss.status === 'working' && !p.departing;
    // a turn just ended (working, then idle): the closing steps first
    if (C.wasWorking && !working && ss.status === 'idle' && !p.departing && theme.finish && !C.fin) {
      if (C.trip) {
        release(C.trip.id);
        C.trip = null;
      }
      startStep(0, now, p.home);
    }
    if (C.fin && (working || p.departing || ss.status === 'needs-you')) finishAll();
    C.wasWorking = working;
    // no longer working: whatever place they went off to is free again
    if (!working && C.trip) {
      release(C.trip.id);
      C.trip = null;
      C.wantKey = '';
    }
    // no longer idle: a break is over
    if (ss.status !== 'idle' || p.departing) {
      if (C.visit) release(C.visit.place.id);
      C.visit = null;
      C.nextVisit = -1;
    }
    if (p.departing) return { spot: door, act: 'stand', carry: 'stand', station: null };
    if (C.fin) {
      const step = theme.finish!.steps[C.fin.i];
      return { spot: C.fin.spot, act: step.act, carry: step.carry ?? 'stand', station: C.fin.place ? null : C.fin.station };
    }
    if (ss.status === 'needs-you') return { spot: waitSpot(plan, p.front), act: theme.waitAct ?? 'wave', carry: 'stand', station: null };
    if (ss.status === 'idle') {
      const sky = weatherUi.get().weather;
      const V = breakAt(now, nap);
      if (V) return { spot: V.spot, act: V.place.act, carry: 'stand', station: null };
      const seatSpotNow = st !== null ? seatAt(st) : null;
      if (seatSpotNow) return { spot: seatSpotNow, act: nap ? theme.idleAct(true) : sky === 'snow' ? 'cocoa' : sky === 'sunny' ? 'iced' : theme.idleAct(false), carry: 'stand', station: null };
      return { spot: home, act: theme.dozeAct, carry: 'stand', station: p.home };
    }
    // working: at the station, or off to a place for a while (the theme's own,
    // else something in the room that fits a long stretch of one kind of work)
    const want = theme.tripFor?.(ss, stationOf(plan, p.home)) ?? itemTrip(ss, now);
    // a visit to something in the room is short: back to their spot, and a rest before the next
    if (C.trip?.id.startsWith('item:') && now - C.tripSince > 12 + ((seed * 2.3) % 1) * 6) {
      release(C.trip.id);
      C.trip = null;
      C.itemRest = now + 70 + ((seed * 4.1) % 1) * 40;
      C.wantKey = '';
    }
    const key = want ? want.places.join(',') : '';
    if (key !== C.wantKey) {
      C.wantKey = key;
      C.wantSince = now;
    }
    if (C.trip) {
      const keep = !!want && want.places.includes(C.trip.id);
      if (!keep && now - C.wantSince > 3 && now - C.tripSince > 6) {
        release(C.trip.id);
        C.trip = null;
      }
    }
    if (!C.trip && want && now - C.wantSince >= want.after / 1000) {
      const place = want.places.map((id) => places.get(id)).find((q): q is Place => !!q && free(q.id));
      if (place) {
        C.trip = place;
        C.tripSince = now;
        claim(place, 'coming', now);
      }
    }
    if (C.trip) return { spot: placeSpot(plan, C.trip), act: C.trip.act, carry: want?.carry ?? 'stand', station: null };
    return { spot: home, act: theme.workAct(ss), carry: 'stand', station: p.home };
  };

  const zs = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const C = S.current;
    const dt = Math.min(0.1, delta);
    const now = clock.elapsedTime;
    const d = decide(now);
    C.doing = d;
    // a new destination: plan the way there (now, or once they can turn)
    if (!C.target || C.target.key !== d.spot.key) {
      const onAisle = Math.abs(C.z - plan.aisleZ) < 0.3;
      if (C.first && !pl.arriving) {
        // already here when the page opened
        C.x = d.spot.x;
        C.z = d.spot.z;
        C.yaw = d.spot.yaw;
        C.at = d.spot;
        C.arrived = true;
        C.path = [];
      } else if (C.arrived || !C.path.length) {
        C.path = route(C.at, C.x, C.z, plan.aisleZ, d.spot);
        C.arrived = C.path.length === 0;
        if (C.arrived) C.at = d.spot;
      } else if (onAisle) {
        C.path = route(null, C.x, C.z, plan.aisleZ, d.spot);
      } else C.pending = d.spot;
      if (!C.pending || onAisle || C.arrived) C.target = d.spot;
    } else if (C.pending) C.pending = null; // changed their mind back: carry on where they were going
    C.first = false;
    const moving = walk(C, dt, WALK);
    if (!moving && !C.arrived) {
      // reached the end of the way
      C.arrived = true;
      C.at = C.pending ? null : C.target;
      if (C.pending) {
        const next = C.pending;
        C.pending = null;
        C.path = route(C.target, C.x, C.z, plan.aisleZ, next);
        C.arrived = C.path.length === 0;
        C.at = C.arrived ? next : C.target;
        C.target = next;
      }
    }
    if (!moving && C.arrived && C.target) C.yaw = lerpAngle(C.yaw, C.target.yaw, 1 - Math.exp(-dt * 5));
    const here = C.arrived && C.target?.key === d.spot.key;
    motion.speed = moving ? WALK : 0;
    motion.seat = (here && d.spot.sitAt ? d.spot.sitAt : 0.53) / K;
    // a break's clock starts once they're there
    if (C.visit && here && d.spot.key === C.visit.spot.key && C.visit.until < 0) C.visit.until = now + C.visit.stay;
    // a closing step's clock starts once they're there; then on to the next
    const steps = theme.finish?.steps ?? [];
    if (C.fin && here && C.fin.until < 0) C.fin.until = now + (steps[C.fin.i]?.seconds ?? 1);
    if (C.fin && C.fin.until > 0 && now >= C.fin.until) {
      const f = C.fin;
      C.fin = null;
      release(f.place?.id);
      steps[f.i]?.done?.(f.station, s.id, color);
      startStep(f.i + 1, now, f.station);
    }
    // fading in and out through the doorway
    const doorK = smoothstep(plan.door.outside[1] + 0.1, plan.door.inside[1] - 0.45, C.z);
    C.fade += ((Math.abs(C.x - plan.door.x) < 1.2 ? doorK : 1) - C.fade) * (1 - Math.exp(-dt * 8));
    root.current.position.set(C.x, 0, C.z);
    root.current.visible = C.fade > 0.02;
    body.current.rotation.set(0, C.yaw, 0);
    body.current.scale.setScalar(K * Math.max(0.001, C.fade));
    const weather = weatherUi.get().weather;
    const nearDoor = Math.abs(C.x - plan.door.x) < 2.6 && C.z < plan.door.inside[1] + 2.4;
    const plain = here ? d.act : moving ? (d.carry === 'stand' && nearDoor && weather === 'rain' ? 'umbrella' : d.carry) : 'stand';
    const shown = theme.busy && here && d.act === theme.workAct(s) && d.station !== null && s.status === 'working' ? theme.busy(plain, now, seed) : plain;
    actRef.current = shown;
    // what the room shows: who's at which place, who's at which station
    const placeId = d.spot.key.startsWith('place:') ? d.spot.key.slice(6) : null;
    if (placeId) {
      const u = placeUse.get(placeId);
      if (u && u.sid === s.id) u.act = here ? shown : 'coming';
    }
    if (d.station !== null && here && !pl.departing) {
      const v = at.get(d.station);
      const rush = s.workflows.some((w) => w.running > 0);
      if (!v || v.sid !== s.id || v.act !== shown || v.rush !== rush) at.set(d.station, { act: shown, seed, sid: s.id, rush });
    } else for (const [k, v] of at) if (v.sid === s.id) at.delete(k);

    const sitting = here && !!d.spot.sitAt;
    let a = anchors.get(s.id);
    if (!a) anchors.set(s.id, (a = new THREE.Vector3()));
    a.set(C.x, sitting ? 1.35 : 1.5, C.z);
    let lp = labelPos.get(s.id);
    if (!lp) labelPos.set(s.id, (lp = new THREE.Vector3()));
    lp.set(C.x, (sitting ? 3.1 : 3.35) * Math.max(0.6, C.fade), C.z);
    if (ring.current) ring.current.visible = selected;
    if (zs.current) zs.current.visible = here && SLEEPY.has(shown);
    if (TEST_HOOKS) debug.set(s.name, { act: shown, at: here ? d.spot.key : `→${d.spot.key}`, x: Math.round(C.x * 10) / 10, z: Math.round(C.z * 10) / 10, wear: wearFor(weather) });
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(s.id);
  };

  return (
    <group ref={root}>
      <group ref={body}>
        <Actor look={look} actRef={actRef} motion={motion} seed={seed} kit={theme.kit} />
      </group>
      {s.status === 'needs-you' && !pl.departing && <AskSign position={[0.85, 3.25, 0.25]} size={0.62} />}
      <group ref={zs} visible={false}>
        <SleepZs position={[0.5, 2.7, 0.2]} />
      </group>
      <mesh ref={ring} geometry={ringGeo} material={ringMat} position={[0, 0.03, 0]} scale={1.05} visible={false} renderOrder={5} />
      {interactive && !pl.departing && (
        <mesh
          position={[0, 1.5, 0]}
          onClick={click}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onFocus(s.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        >
          <capsuleGeometry args={[0.62, 1.6, 4, 10]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
});

/** Re-renders a person only when what they do changes (a walk, a new task), not every frame. */
export function Actor({ look, actRef, motion, seed, kit }: { look: ReturnType<typeof lookFor>; actRef: React.MutableRefObject<string>; motion: Motion; seed: number; kit: Kit }) {
  const [act, setAct] = useState(actRef.current);
  useFrame(() => {
    if (actRef.current !== act) setAct(actRef.current);
  });
  return <Person look={look} act={act} motion={motion} seed={seed} kit={kit} />;
}

// ---------- helpers ----------

interface HelperJob {
  b: OfficeSub;
  sid: string;
  /** Where they work, what they do there, and the station they use (if any). */
  spot: Spot;
  act: string;
  station: number | null;
}

/** Running helpers get spots: the theme's own helper spots first, then free work spots; the rest wait off stage. */
function helperJobs(theme: CrewTheme, placed: Placement[]): HelperJob[] {
  const { plan } = theme;
  const live = placed.filter((p) => !p.departing).sort((a, b) => a.home - b.home);
  const used = new Set(live.map((p) => p.home));
  const spots: { spot: Spot; act: string; station: number | null }[] = [
    ...(theme.helperSpots ?? []).map((p) => ({ spot: placeSpot(plan, p), act: p.act, station: null })),
    ...plan.stations.map((_, i) => i).filter((i) => !used.has(i)).map((i) => ({ spot: stationSpot(plan, i), act: theme.helperAct(true), station: i as number | null })),
  ];
  const jobs: HelperJob[] = [];
  for (const p of live) {
    const running = p.s.subs.filter((b) => b.status === 'running').slice(0, HELPERS_EACH);
    for (const b of running) {
      const next = spots.shift();
      if (!next) return jobs;
      jobs.push({ b, sid: p.s.id, ...next });
    }
  }
  return jobs;
}

function Helper({ theme, job, anchors, labelPos, at }: { theme: CrewTheme; job: HelperJob; anchors: Map<string, THREE.Vector3>; labelPos: Map<string, THREE.Vector3>; at: AtStation }) {
  const { plan } = theme;
  const { b, sid, spot, act, station } = job;
  const look = useMemo(() => lookFor(b.id, sessionColor(sid), theme.helperOutfit, true), [b.id, sid, theme.helperOutfit]);
  const motion = useMemo<Motion>(() => ({ speed: 0, seat: 0.53 / plan.K }), [plan.K]);
  const g = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const actRef = useRef('stand');
  const seed = (hash(b.id) % 1000) / 131;
  const S = useRef({ x: 0, z: 0, yaw: 0, path: [] as V2[], at: null as Spot | null, target: null as Spot | null, init: false, fade: 0 });
  const key = `bot:${b.id}`;
  useEffect(
    () => () => {
      labelPos.delete(key);
      for (const [k, v] of at) if (v.sid === b.id) at.delete(k);
    },
    [labelPos, key, at, b.id],
  );
  useFrame((_, delta) => {
    const c = S.current;
    const dt = Math.min(0.1, delta);
    if (!c.init) {
      // they come from their person, and walk to their spot
      const a = anchors.get(sid);
      c.x = a ? a.x : spot.x;
      c.z = a ? a.z : spot.z;
      c.yaw = Math.PI;
      c.init = true;
    }
    if (!c.target || c.target.key !== spot.key) {
      c.path = route(c.at, c.x, c.z, plan.aisleZ, spot);
      c.target = spot;
      c.at = null;
    }
    const moving = walk(c, dt, WALK * 1.1);
    if (!moving && !c.at) c.at = c.target;
    if (!moving) c.yaw = lerpAngle(c.yaw, spot.yaw, 1 - Math.exp(-dt * 6));
    const here = !moving && c.at?.key === spot.key;
    motion.speed = moving ? WALK : 0;
    motion.seat = (here && spot.sitAt ? spot.sitAt : 0.53) / (plan.K * 0.72);
    c.fade += (1 - c.fade) * (1 - Math.exp(-dt * 4));
    g.current.position.set(c.x, 0, c.z);
    g.current.rotation.set(0, c.yaw, 0);
    inner.current.scale.setScalar(plan.K * 0.72 * Math.max(0.001, c.fade));
    actRef.current = here ? act : 'stand';
    if (station !== null && here) {
      const v = at.get(station);
      if (!v || v.sid !== b.id || v.act !== act) at.set(station, { act, seed, sid: b.id, rush: false });
    } else for (const [k, v] of at) if (v.sid === b.id) at.delete(k);
    let lp = labelPos.get(key);
    if (!lp) labelPos.set(key, (lp = new THREE.Vector3()));
    lp.set(c.x, here && spot.sitAt ? 2.3 : 2.55, c.z);
  });
  return (
    <group ref={g}>
      <group ref={inner}>
        <Actor look={look} actRef={actRef} motion={motion} seed={seed} kit={theme.kit} />
      </group>
    </group>
  );
}

// ---------- the waiting lamps ----------

// Two yellow lamps over the waiting spots, always there (adding lights
// recompiles every material), lit over whoever waits under them: the light,
// and the bulb in the room's lamp shade.
const LAMP = 48;
const BULB_DIM = new THREE.Color('#ffc770');
const BULB_LIT = new THREE.Color('#ffd84a');

function WaitLights({ plan, bulbs, lit }: { plan: CrewPlan; bulbs?: THREE.MeshStandardMaterial[]; lit: React.MutableRefObject<[number, number]> }) {
  const lights = useRef<(THREE.SpotLight | null)[]>([]);
  const targets = useMemo(
    () =>
      plan.waitSpots.slice(0, 2).map(([x, z]) => {
        const o = new THREE.Object3D();
        o.position.set(x, 1.2, z);
        return o;
      }),
    [plan],
  );
  useEffect(
    () => () =>
      bulbs?.forEach((m) => {
        m.emissiveIntensity = 0.35;
        m.emissive.copy(BULB_DIM);
      }),
    [bulbs],
  );
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-Math.min(0.1, delta) * 4);
    lights.current.forEach((l, i) => {
      if (!l) return;
      l.intensity += ((lit.current[i] ? LAMP : 0) - l.intensity) * k;
      const on = l.intensity / LAMP;
      const bulb = bulbs?.[i];
      if (bulb) {
        bulb.emissiveIntensity = 0.35 + on * 3.4;
        bulb.emissive.copy(BULB_DIM).lerp(BULB_LIT, on);
      }
    });
  });
  return (
    <>
      {targets.map((t, i) => (
        <primitive key={`t${i}`} object={t} />
      ))}
      {plan.waitLamps.slice(0, 2).map((p, i) => (
        <spotLight key={i} ref={(l) => void (lights.current[i] = l)} position={p} target={targets[i]} angle={0.46} penumbra={0.55} color="#ffd84a" distance={10} decay={1.2} intensity={0} castShadow={false} />
      ))}
    </>
  );
}

// ---------- the cast ----------

export function Crew({
  theme,
  placed,
  selected,
  interactive,
  onSelect,
  onFocus,
  anchors,
  labelPos,
}: {
  theme: CrewTheme;
  placed: Placement[];
  selected: string | null;
  interactive: boolean;
  onSelect: (sid: string) => void;
  onFocus: (sid: string) => void;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
}) {
  const { plan } = theme;
  // the things added to the room that people use (worked out from the room's walk map)
  const items = itemPlacesUi.use((st) => (st.theme === theme.id ? st.list : NO_ITEMS));
  const itemSeats = useMemo(() => items.filter((q) => q.seat), [items]);
  // seats go to whoever went idle first (the plan's, then stools); after a while with a mug, a nap
  const now = Date.now();
  const idle = placed.filter((p) => !p.departing && p.s.status === 'idle').sort((a, b) => (a.s.statusSince || 0) - (b.s.statusSince || 0));
  const seatOf = new Map(idle.slice(0, plan.seats.length + itemSeats.length).map((p, i) => [p.s.id, i]));
  const at = useMemo<AtStation>(() => new Map(), []);
  const lit = useRef<[number, number]>([0, 0]);
  const used = new Set(placed.filter((p) => !p.departing).map((p) => p.home));
  const jobs = helperJobs(theme, placed);
  // a new theme starts with every place free
  useEffect(() => {
    placeUse.clear();
    return () => placeUse.clear();
  }, [theme]);

  // the waiting lamps light over the first two who wait, once they're there
  useFrame(() => {
    lit.current = [0, 0];
    for (const p of placed) {
      if (p.departing || p.s.status !== 'needs-you' || p.front > 1) continue;
      const a = anchors.get(p.s.id);
      const [x, z] = plan.waitSpots[p.front];
      if (a && Math.hypot(a.x - x, a.z - z) < 0.4) lit.current[p.front] = 1;
    }
  });

  const Extras = theme.Extras;
  return (
    <>
      {plan.stations.map((st, i) => (
        <StationSlot key={i} i={i} st={st} at={at} busy={used.has(i) || jobs.some((j) => j.station === i)} Station={theme.Station} />
      ))}
      {placed.map((pl) => (
        <Resident
          key={pl.s.id}
          theme={theme}
          pl={pl}
          seat={seatOf.get(pl.s.id) ?? null}
          napping={now - (pl.s.statusSince || now) > NAP_AFTER_MS}
          selected={selected === pl.s.id}
          interactive={interactive}
          onSelect={onSelect}
          onFocus={onFocus}
          anchors={anchors}
          labelPos={labelPos}
          at={at}
          items={items}
          itemSeats={itemSeats}
        />
      ))}
      {jobs.map((j) => (
        <Helper key={j.b.id} theme={theme} job={j} anchors={anchors} labelPos={labelPos} at={at} />
      ))}
      {Extras && <Extras placed={placed} />}
      <WaitLights plan={plan} bulbs={theme.bulbs} lit={lit} />
    </>
  );
}

/** One station's things, following whoever works there (polled each frame, re-rendered on change). */
function StationSlot({ i, st, at, busy, Station }: { i: number; st: WorkSpot; at: AtStation; busy: boolean; Station: FC<StationProps> }) {
  const [cur, setCur] = useState<{ act: string; seed: number; rush: boolean } | null>(null);
  useFrame(() => {
    const v = at.get(i) ?? null;
    if (v?.act !== cur?.act || v?.seed !== cur?.seed || v?.rush !== cur?.rush) setCur(v ? { act: v.act, seed: v.seed, rush: v.rush } : null);
  });
  return <Station st={st} act={cur?.act ?? null} seed={cur?.seed ?? 0} busy={busy} rush={cur?.rush ?? false} />;
}
