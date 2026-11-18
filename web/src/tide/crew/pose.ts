import * as THREE from 'three';
import { smoothstep } from '../../tank/util';

// Poses for the chibi people, in "cook metres" (the person's own frame: feet on
// y = 0, facing +z). A pose is where the body leans and turns and, above all,
// where the two hands go; a two-bone solver bends the arms to reach. Each theme
// adds its own acts (kitchen/acts.ts, office/acts.ts, workshop/acts.ts); the
// ones every theme shares are here: standing, walking (in Person), waving,
// sitting with a mug, napping and dozing, and using the room's things (a cup
// of water, a shelf of books, a plant, the radio, a toy).

export interface Pose {
  /** Stance: a step and a turn at the spot (root frame). */
  sx: number;
  sz: number;
  syaw: number;
  /** 0 standing, 1 seated. */
  sit: number;
  lean: number;
  twist: number;
  /** Head: pitch (down +), yaw, roll. */
  hx: number;
  hy: number;
  hz: number;
  bob: number;
  /** Hand targets (palm centres), root frame. */
  R: THREE.Vector3;
  L: THREE.Vector3;
  /** Free values for what the hands hold: a tilt, and a point (where a ladle's bowl or a sheet of paper is). */
  tilt: number;
  aux: THREE.Vector3;
  /** Mouth open (talking, calling out), 0..1. */
  talk: number;
}

export const newPose = (): Pose => ({ sx: 0, sz: 0, syaw: 0, sit: 0, lean: 0, twist: 0, hx: 0, hy: 0, hz: 0, bob: 0, R: new THREE.Vector3(), L: new THREE.Vector3(), tilt: 0, aux: new THREE.Vector3(), talk: 0 });

export function resetPose(p: Pose) {
  p.sx = p.sz = p.syaw = p.sit = p.lean = p.twist = p.hx = p.hy = p.hz = p.bob = p.tilt = p.talk = 0;
  p.aux.set(0, 0, 0);
}

export function mixPose(out: Pose, a: Pose, b: Pose, k: number) {
  const m = (x: number, y: number) => x + (y - x) * k;
  out.sx = m(a.sx, b.sx);
  out.sz = m(a.sz, b.sz);
  out.syaw = m(a.syaw, b.syaw);
  out.sit = m(a.sit, b.sit);
  out.lean = m(a.lean, b.lean);
  out.twist = m(a.twist, b.twist);
  out.hx = m(a.hx, b.hx);
  out.hy = m(a.hy, b.hy);
  out.hz = m(a.hz, b.hz);
  out.bob = m(a.bob, b.bob);
  out.tilt = m(a.tilt, b.tilt);
  out.talk = m(a.talk, b.talk);
  out.R.lerpVectors(a.R, b.R, k);
  out.L.lerpVectors(a.L, b.L, k);
  out.aux.lerpVectors(a.aux, b.aux, k);
}

/** Body-relative point -> root frame, through the pose's own stance. */
export function fromBody(p: Pose, x: number, y: number, z: number, out: THREE.Vector3) {
  const c = Math.cos(p.syaw);
  const s = Math.sin(p.syaw);
  return out.set(p.sx + x * c + z * s, y, p.sz - x * s + z * c);
}

/** The torso's underside sits this far below the hip line (so a seated body rests on its seat). */
export const SEAT_DROP = 0.255;
/** The hip line when seated on a seat of this height (cook metres). */
export const hipLine = (seat: number) => seat - SEAT_DROP + 0.3;

/**
 * A pose for one act: fill in p, return false if the act isn't yours. `t` is
 * the clock, `age` how long the act has been going (for one-off acts), `seat`
 * the seat height in cook metres when seated.
 */
export type Poser = (act: string, t: number, seed: number, seat: number, p: Pose, age: number) => boolean;

export const idleLook = (p: Pose, t: number, seed: number, k: number) => {
  p.hy = k * (0.32 * Math.sin(t * 0.21 + seed) + 0.1 * Math.sin(t * 0.53 + seed * 2));
  p.hz = k * 0.05 * Math.sin(t * 0.31 + seed);
};

/** How often someone sips from a mug, and how long a sip lasts. */
export const SIP_EVERY = 8.5;
export const SIP_LEN = 2.2;

/** The acts every theme shares. */
export const sharedPoser: Poser = (act, t, seed, seat, p) => {
  switch (act) {
    case 'wave': {
      p.lean = -0.04;
      p.hx = -0.06;
      p.hz = 0.1 * Math.sin(t * 2.2);
      p.bob = 0.012 * Math.abs(Math.sin(t * 4.4));
      p.talk = 1;
      fromBody(p, -0.255 + 0.045 * Math.sin(t * 8.5), 0.885, 0.07, p.R);
      fromBody(p, 0.175, 0.37, -0.03, p.L);
      return true;
    }
    case 'mug': {
      // seated with a mug in both hands, a sip now and then
      p.sit = 1;
      p.lean = 0.05;
      idleLook(p, t, seed, 0.35);
      const u = (t + seed) % SIP_EVERY;
      const k = smoothstep(0, 0.6, u) * (1 - smoothstep(SIP_LEN - 0.6, SIP_LEN, u));
      const drop = hipLine(seat);
      p.hx = 0.12 - k * 0.3;
      fromBody(p, -0.03 + 0.025 * k, drop + 0.15 + k * 0.33, 0.2 - 0.025 * k, p.R);
      fromBody(p, 0.05 - 0.02 * k, drop + 0.13 + k * 0.05, 0.19 - k * 0.07, p.L);
      p.tilt = k;
      return true;
    }
    case 'nap': {
      // chin on the chest, a hand resting on each thigh (folded hands merged into one lump)
      p.sit = 1;
      p.lean = 0.15;
      p.hx = 0.5 + 0.06 * Math.sin(t * 0.8 + seed);
      p.hz = 0.12;
      const drop = hipLine(seat);
      fromBody(p, -0.07, drop + 0.085, 0.165, p.R);
      fromBody(p, 0.07, drop + 0.085, 0.175, p.L);
      return true;
    }
    case 'iced':
    case 'cocoa': {
      // snowed in: a hot drink held in both hands close to the chest, a sip now and then
      // (on a sunny day, the same with an iced drink)
      p.sit = 1;
      p.lean = 0.07;
      idleLook(p, t, seed, 0.25);
      const u = (t + seed) % SIP_EVERY;
      const k = smoothstep(0, 0.6, u) * (1 - smoothstep(SIP_LEN - 0.6, SIP_LEN, u));
      const drop = hipLine(seat);
      p.hx = 0.2 - k * 0.32;
      const y = drop + 0.21 + k * 0.25;
      const z = 0.175 - k * 0.04;
      fromBody(p, -0.04, y, z, p.R);
      fromBody(p, 0.04, y, z, p.L);
      fromBody(p, 0, y - 0.012, z + 0.018, p.aux);
      p.tilt = k;
      return true;
    }
    case 'umbrella': {
      // walking in or out in the rain, an umbrella up
      p.lean = 0.02;
      idleLook(p, t, seed, 0.3);
      fromBody(p, -0.06, 0.57, 0.12, p.R);
      fromBody(p, 0.185, 0.3, 0.05, p.L);
      fromBody(p, -0.03, 1.32, 0.05, p.aux);
      return true;
    }
    case 'doze': {
      // standing at the work spot, hands on the counter's edge, nodding off
      p.lean = 0.14;
      p.hx = 0.42 + 0.06 * Math.sin(t * 0.8 + seed);
      p.hz = -0.1;
      p.R.set(-0.11, 0.436, 0.2);
      p.L.set(0.11, 0.436, 0.2);
      return true;
    }
    // ---- using the room's things (crew/itemPlaces.ts) ----
    case 'drink': {
      // standing with a cup (water from the cooler), a sip now and then
      p.lean = 0.02;
      idleLook(p, t, seed, 0.4);
      const u = (t + seed) % 6.5;
      const k = smoothstep(0, 0.5, u) * (1 - smoothstep(1.7, 2.2, u));
      p.hx = 0.06 - k * 0.3;
      const y = 0.47 + k * 0.31;
      const z = 0.17 - k * 0.03;
      fromBody(p, -0.05, y, z, p.R);
      fromBody(p, 0.19, 0.3, 0.04, p.L);
      fromBody(p, -0.04, y - 0.012, z + 0.02, p.aux);
      p.tilt = k;
      return true;
    }
    case 'browse': {
      // along a shelf: an arm out to the books, running along the spines, the head following
      const u = Math.sin(t * 0.45 + seed);
      p.lean = 0.04;
      p.hx = -0.1 + 0.05 * Math.sin(t * 0.3 + seed);
      p.hy = 0.22 * u;
      fromBody(p, -0.13 + 0.1 * u, 0.6 + 0.05 * Math.sin(t * 0.9 + seed), 0.33, p.R);
      fromBody(p, 0.16, 0.36, 0.1, p.L);
      return true;
    }
    case 'look': {
      // looking at something on the wall: hands behind the back, head up, a slow sway
      p.lean = -0.04;
      p.hx = -0.2;
      p.hy = 0.12 * Math.sin(t * 0.25 + seed);
      p.twist = 0.05 * Math.sin(t * 0.3 + seed);
      fromBody(p, -0.07, 0.36, -0.13, p.R);
      fromBody(p, 0.07, 0.36, -0.13, p.L);
      return true;
    }
    case 'tend': {
      // tending a plant: leaning in, both hands among the leaves
      const w = Math.sin(t * 1.6 + seed);
      p.lean = 0.2;
      p.hx = 0.35;
      p.hy = 0.1 * Math.sin(t * 0.4 + seed);
      fromBody(p, -0.08 + 0.02 * w, 0.42, 0.27, p.R);
      fromBody(p, 0.09, 0.4 + 0.02 * Math.sin(t * 1.3 + seed), 0.25, p.L);
      return true;
    }
    case 'pat': {
      // patting something small (a lucky cat, a teddy, a globe given a spin)
      const k = Math.max(0, Math.sin(t * 3.2 + seed));
      p.lean = 0.08;
      p.hx = 0.25;
      fromBody(p, -0.05, 0.44 + 0.035 * k, 0.27, p.R);
      fromBody(p, 0.18, 0.31, 0.06, p.L);
      p.talk = 0.3 * k;
      return true;
    }
    case 'tune': {
      // a hand on the radio's dial, the head tilting to the music
      p.lean = 0.06;
      p.hx = 0.18;
      p.hz = 0.14 * Math.sin(t * 1.9 + seed);
      p.bob = 0.008 * Math.abs(Math.sin(t * 3.8 + seed));
      fromBody(p, -0.04 + 0.01 * Math.sin(t * 0.7 + seed), 0.45, 0.27, p.R);
      fromBody(p, 0.18, 0.31, 0.06, p.L);
      return true;
    }
    case 'rock': {
      // both hands on a rocking horse, rocking it
      const r = Math.sin(t * 2.2 + seed);
      p.lean = 0.12 + 0.05 * r;
      p.hx = 0.2;
      fromBody(p, -0.1, 0.46 + 0.03 * r, 0.3 + 0.04 * r, p.R);
      fromBody(p, 0.1, 0.46 + 0.03 * r, 0.3 + 0.04 * r, p.L);
      return true;
    }
    case 'wind': {
      // winding up a toy: hands together in front, one turning the key
      const a = t * 4 + seed;
      p.lean = 0.12;
      p.hx = 0.32;
      fromBody(p, -0.04 + 0.025 * Math.cos(a), 0.4 + 0.025 * Math.sin(a), 0.26, p.R);
      fromBody(p, 0.05, 0.39, 0.25, p.L);
      return true;
    }
    case 'fetch': {
      // bent over a crate or a sack on the floor, picking things out
      const w = Math.sin(t * 1.4 + seed);
      p.lean = 0.42;
      p.hx = 0.4;
      fromBody(p, -0.08, 0.22 + 0.03 * w, 0.3, p.R);
      fromBody(p, 0.08, 0.23 - 0.03 * w, 0.29, p.L);
      return true;
    }
    case 'stand':
    default: {
      p.lean = 0.02;
      p.twist = 0.04 * Math.sin(t * 0.37 + seed);
      p.hx = 0.04 + 0.04 * Math.sin(t * 0.5 + seed);
      idleLook(p, t, seed, 1);
      fromBody(p, -0.19, 0.292, 0.045, p.R);
      fromBody(p, 0.19, 0.292, 0.045, p.L);
      return act === 'stand';
    }
  }
};


// ---------- the arm solver ----------

const ik = {
  d: new THREE.Vector3(),
  n: new THREE.Vector3(),
  u: new THREE.Vector3(),
  f: new THREE.Vector3(),
  e: new THREE.Vector3(),
  X: new THREE.Vector3(),
  Y: new THREE.Vector3(),
  Z: new THREE.Vector3(),
  m: new THREE.Matrix4(),
};

/** Bend a two-bone arm (shoulder at S, both in the arm's parent frame) so the palm reaches T; the elbow leans toward the pole. */
export function solveArm(shoulder: THREE.Object3D, elbow: THREE.Object3D, S: THREE.Vector3, T: THREE.Vector3, pole: THREE.Vector3, a: number, b: number) {
  const { d, n, u, f, e, X, Y, Z, m } = ik;
  d.subVectors(T, S);
  let len = d.length();
  d.divideScalar(Math.max(len, 1e-6));
  len = Math.min(Math.max(len, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const A = Math.acos(Math.min(1, Math.max(-1, (a * a + len * len - b * b) / (2 * a * len))));
  n.subVectors(pole, S);
  n.addScaledVector(d, -n.dot(d));
  if (n.lengthSq() < 1e-9) n.set(0, 0, -1);
  n.normalize();
  u.copy(d).multiplyScalar(Math.cos(A)).addScaledVector(n, Math.sin(A));
  e.copy(S).addScaledVector(u, a);
  f.copy(S).addScaledVector(d, len).sub(e).normalize();
  Y.copy(u).negate();
  Z.copy(f).addScaledVector(u, -f.dot(u));
  if (Z.lengthSq() < 1e-8) Z.copy(n);
  Z.normalize();
  X.crossVectors(Y, Z);
  m.makeBasis(X, Y, Z);
  shoulder.quaternion.setFromRotationMatrix(m);
  elbow.rotation.set(-Math.acos(Math.min(1, Math.max(-1, u.dot(f)))), 0, 0);
}
