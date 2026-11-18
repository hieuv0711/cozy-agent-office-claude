import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TEST_HOOKS } from '../../lib/assetCache';
import { Actor } from '../crew/Crew';
import { lookFor, type Motion } from '../crew/Person';
import type { Place, V2 } from '../crew/plan';
import { weatherUi } from '../weather/state';
import { KITCHEN_KIT, MEAL } from './acts';
import { propMats, ramenGeometry } from './cookProps';
import { Steam } from './Station';
import { COUNTER, CUSTOMER_SEATS, K, STATIONS, STREET } from './plan';

// The dining floor. Nobody sits there until a dish is ready: every time a cook
// finishes a turn (their session answers, or stops to ask you something), they
// plate the dish, a customer comes in from the street for it and sits at the
// little table by the counter's left end, and the cook carries the bowl round
// and sets it down in front of them. The customer eats and, in a minute or
// two, goes home. Customers dress for the street and the weather (a coat, a
// raincoat and an umbrella, a scarf and a beanie), never like the cooks. If
// both seats are taken, the dish goes out to go: it waits on the counter's
// ledge for a while, then it's collected.

const WALK = 1.6;
const EAT_S = [70, 120];
/** How long a dish to go waits on the ledge. */
const TO_GO_S = 20;

/**
 * The seats customers use: the left table's (the one by the counter's end,
 * where they hide no cook), facing the camera first. Each has a spot beside
 * it where the cook stands to serve, reached from the aisle round the
 * counter's left end.
 */
const SEATS = CUSTOMER_SEATS.map((q, i) => ({ q, i })).filter(({ q }) => q.x < 0 && q.x > -10);
const SERVE_SPOTS: Record<number, { x: number; z: number; yaw: number }> = {};
for (const { q, i } of SEATS) {
  // a step behind the seat, on the counter's side, turned to the customer's place at the table
  const bowlX = q.x + Math.sin(q.yaw) * MEAL.z * K;
  const bowlZ = q.z + Math.cos(q.yaw) * MEAL.z * K;
  const x = q.yaw === 0 ? q.x + 0.72 : q.x + 0.5;
  const z = q.yaw === 0 ? q.z - 0.55 : q.z - 0.78;
  SERVE_SPOTS[i] = { x, z, yaw: Math.atan2(bowlX - x, bowlZ - z) };
}
/** Round the counter's left end, from the aisle. */
const SERVE_AISLE_X = -8.3;
const SERVE_VIA: V2[] = [[SERVE_AISLE_X, 0.6]];

/** The ways customers and serving cooks walk on the dining floor (kept clear of furniture by the editor). */
export function diningWalkways(aisleZ: number): V2[][] {
  const out: V2[][] = [];
  for (const { q, i } of SEATS) {
    out.push([STREET[0], ...(q.via ?? []), [q.x, q.z]]);
    const sp = SERVE_SPOTS[i];
    out.push([[SERVE_AISLE_X, aisleZ], ...SERVE_VIA, [sp.x, sp.z]]);
  }
  return out;
}

interface Bowl {
  id: number;
  x: number;
  born: number;
}

type CPhase = 'in' | 'menu' | 'eat' | 'out';
interface Customer {
  id: number;
  seat: number;
  phase: CPhase;
  /** When they sat down (menu) or the meal arrived (eat). */
  since: number;
  eatFor: number;
  path: V2[];
  x: number;
  z: number;
  yaw: number;
  /** The session whose dish they came for. */
  for: string;
  /** The cook has set the bowl down. */
  served: boolean;
}

const LEDGE_Z = COUNTER.front + 0.3;

/** The kitchen's dining floor, shared between the cooks (who plate and serve) and the scene. */
class DiningFloor {
  bowls: Bowl[] = [];
  customers: Customer[] = [];
  version = 0;
  private next = 1;
  private listeners = new Set<() => void>();
  private now = 0;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private freeSeats() {
    const used = new Set(this.customers.map((c) => c.seat));
    return SEATS.map((x) => x.i).filter((i) => !used.has(i));
  }

  /** A cook has plated a dish: a customer comes in for it (true), or it goes out to go (false). */
  order(sid: string, station: number): boolean {
    if (this.customers.some((c) => c.for === sid && !c.served && c.phase !== 'out')) return true;
    const free = this.freeSeats();
    if (!free.length) {
      const st = STATIONS[station];
      this.bowls.push({ id: this.next++, x: st && st.yaw === 0 ? st.x - 0.05 : -6.6, born: this.now });
      this.changed();
      return false;
    }
    const seat = free[0];
    const q = CUSTOMER_SEATS[seat];
    const street = STREET[0];
    this.customers.push({
      id: this.next++,
      seat,
      phase: 'in',
      since: this.now,
      eatFor: EAT_S[0] + Math.random() * (EAT_S[1] - EAT_S[0]),
      path: [...(q.via ?? []), [q.x, q.z]],
      x: street[0],
      z: street[1],
      yaw: Math.PI,
      for: sid,
      served: false,
    });
    this.changed();
    return true;
  }

  /** Where the cook stands to serve the customer waiting for this session's dish (null: nobody is). */
  servePlace(sid: string): Place | null {
    const c = this.customers.find((x) => x.for === sid && !x.served && x.phase !== 'out');
    if (!c) return null;
    const s = SERVE_SPOTS[c.seat];
    return { id: `serve-${c.seat}`, x: s.x, z: s.z, yaw: s.yaw, act: 'serve', aisleX: SERVE_AISLE_X, via: SERVE_VIA };
  }

  /** The cook has set the bowl down: the customer eats (as soon as they're seated). */
  served(sid: string) {
    const c = this.customers.find((x) => x.for === sid && !x.served && x.phase !== 'out');
    if (!c) return;
    c.served = true;
    if (c.phase === 'menu') {
      c.phase = 'eat';
      c.since = this.now;
    }
    this.changed();
  }

  tick(now: number) {
    this.now = now;
    let dirty = false;
    for (const c of this.customers) {
      if (c.phase === 'in' && !c.path.length) {
        c.phase = c.served ? 'eat' : 'menu';
        c.since = now;
        dirty = true;
      } else if (c.phase === 'eat' && now - c.since > c.eatFor) {
        const q = CUSTOMER_SEATS[c.seat];
        c.phase = 'out';
        c.path = [...[...(q.via ?? [])].reverse(), STREET[0]];
        dirty = true;
      }
    }
    const before = this.customers.length + this.bowls.length;
    this.customers = this.customers.filter((c) => !(c.phase === 'out' && !c.path.length));
    this.bowls = this.bowls.filter((b) => now - b.born < TO_GO_S);
    if (this.customers.length + this.bowls.length !== before) dirty = true;
    if (dirty) this.changed();
  }
}

export const dining = new DiningFloor();
// test scripts (development, or `?test`) can look at the dining floor: __dining.customers, __dining.bowls
if (TEST_HOOKS && typeof window !== 'undefined') (window as unknown as { __dining?: DiningFloor }).__dining = dining;

function stepAlong(o: { x: number; z: number; yaw: number; path: V2[] }, dt: number, speed: number) {
  if (!o.path.length) return 0;
  const [tx, tz] = o.path[0];
  const dx = tx - o.x;
  const dz = tz - o.z;
  const d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= step) {
    o.x = tx;
    o.z = tz;
    o.path.shift();
  } else {
    o.x += (dx / d) * step;
    o.z += (dz / d) * step;
    let a = Math.atan2(dx, dz) - o.yaw;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    o.yaw += a * (1 - Math.exp(-dt * 9));
  }
  return speed;
}

function turnTo(o: { yaw: number }, yaw: number, dt: number) {
  let a = yaw - o.yaw;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  o.yaw += a * (1 - Math.exp(-dt * 5));
}

function CustomerNode({ c }: { c: Customer }) {
  const look = useMemo(() => lookFor(`customer-${c.id}`, '#888888', 'diner'), [c.id]);
  const motion = useMemo<Motion>(() => ({ speed: 0, seat: 0.53 / K }), []);
  const g = useRef<THREE.Group>(null!);
  const bowl = useRef<THREE.Group>(null!);
  const actRef = useRef('stand');
  const fade = useRef(0);
  const steam = useRef(0.5);
  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.1, delta);
    const q = CUSTOMER_SEATS[c.seat];
    const moving = stepAlong(c, dt, WALK);
    motion.speed = moving;
    if (!moving && c.phase !== 'out') turnTo(c, q.yaw, dt);
    const seated = !moving && (c.phase === 'menu' || c.phase === 'eat');
    const w = weatherUi.get().weather;
    // under an umbrella in the rain until they sit down, and again on the way out
    actRef.current = seated ? (c.phase === 'eat' ? 'eat' : 'menu') : moving && w === 'rain' ? 'umbrella' : 'stand';
    // fade in from the street, out into it
    const target = c.phase === 'out' && c.path.length <= 1 ? 0 : 1;
    fade.current += (target - fade.current) * (1 - Math.exp(-dt * 3));
    g.current.position.set(c.x, 0, c.z);
    g.current.rotation.set(0, c.yaw, 0);
    g.current.scale.setScalar(K * Math.max(0.001, fade.current));
    // their bowl on the table, once the cook has set it down
    bowl.current.visible = c.phase === 'eat';
    bowl.current.position.set(q.x + Math.sin(q.yaw) * MEAL.z * K, MEAL.y * K, q.z + Math.cos(q.yaw) * MEAL.z * K);
    steam.current = 0.4 * Math.max(0, 1 - (clock.elapsedTime - c.since) / 50);
  });
  return (
    <>
      <group ref={g}>
        <Actor look={look} actRef={actRef} motion={motion} seed={c.id * 0.37} kit={KITCHEN_KIT} />
      </group>
      <group ref={bowl} visible={false} scale={K}>
        <mesh geometry={ramenGeometry()} material={propMats().ceramic} castShadow />
        <Steam origin={[0, 0.07, 0]} strength={steam} count={4} height={0.26} size={0.04} />
      </group>
    </>
  );
}

/** A dish to go: on the counter's ledge in front of its station until it's collected. */
function ToGoBowl({ b }: { b: Bowl }) {
  const g = useRef<THREE.Group>(null!);
  const steam = useRef(0.6);
  useFrame(({ clock }) => {
    const age = clock.elapsedTime - b.born;
    const k = Math.min(1, age / 0.6) * Math.min(1, Math.max(0, (TO_GO_S - age) / 1.2));
    g.current.position.set(b.x, COUNTER.top + 0.24, LEDGE_Z);
    g.current.scale.setScalar(K * Math.max(0.001, k));
  });
  return (
    <group ref={g}>
      <mesh geometry={ramenGeometry()} material={propMats().ceramic} castShadow />
      <Steam origin={[0, 0.07, 0]} strength={steam} count={4} height={0.28} size={0.045} />
    </group>
  );
}

/** The dining floor in the scene: customers, and dishes to go. */
export function Dining() {
  const [, setV] = useState(0);
  useEffect(() => dining.subscribe(() => setV(dining.version)), []);
  useFrame(({ clock }) => dining.tick(clock.elapsedTime));
  return (
    <>
      {dining.bowls.map((b) => (
        <ToGoBowl key={b.id} b={b} />
      ))}
      {dining.customers.map((c) => (
        <CustomerNode key={c.id} c={c} />
      ))}
    </>
  );
}
