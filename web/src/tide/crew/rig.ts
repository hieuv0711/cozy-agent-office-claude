import { useFrame } from '@react-three/fiber';
import { type MutableRefObject, useRef } from 'react';
import * as THREE from 'three';
import { smoothstep } from '../../tank/util';
import { RIG } from '../kitchen/cookParts';
import type { HeldItem, Kit, Motion } from './Person';
import { mixPose, newPose, type Pose, SEAT_DROP, sharedPoser, solveArm } from './pose';

// The rig both styles of person share (crew/Person.tsx draws the ink-toon
// people, crew/Bot.tsx the little robots): a stance, a
// body that bobs and sits, a torso that leans and turns, a head, two legs, and
// two arms whose hands go where the act's pose puts them (a two-bone solver
// bends each arm). Each frame it blends from the last act into the new one,
// adds the walk, and places what the hands hold.

export interface RigRefs {
  stance: MutableRefObject<THREE.Group>;
  body: MutableRefObject<THREE.Group>;
  torso: MutableRefObject<THREE.Group>;
  inner: MutableRefObject<THREE.Group>;
  head: MutableRefObject<THREE.Group>;
  legR: MutableRefObject<THREE.Group>;
  legL: MutableRefObject<THREE.Group>;
  armR: MutableRefObject<THREE.Group>;
  armL: MutableRefObject<THREE.Group>;
  elbowR: MutableRefObject<THREE.Group>;
  elbowL: MutableRefObject<THREE.Group>;
  /** The groups of what the hands hold, in the order of `held`. */
  held: MutableRefObject<(THREE.Group | null)[]>;
}

export function useRigRefs(): RigRefs {
  return {
    stance: useRef<THREE.Group>(null!),
    body: useRef<THREE.Group>(null!),
    torso: useRef<THREE.Group>(null!),
    inner: useRef<THREE.Group>(null!),
    head: useRef<THREE.Group>(null!),
    legR: useRef<THREE.Group>(null!),
    legL: useRef<THREE.Group>(null!),
    armR: useRef<THREE.Group>(null!),
    armL: useRef<THREE.Group>(null!),
    elbowR: useRef<THREE.Group>(null!),
    elbowL: useRef<THREE.Group>(null!),
    held: useRef<(THREE.Group | null)[]>([]),
  };
}

/** Where the rig is this frame, for the style's own touches (a mouth that talks, a face on a screen). */
export interface RigState {
  /** The act now, the one before, and since when (clock seconds). */
  cur: string;
  prev: string;
  since: number;
  prevSince: number;
  /** How far the blend from the last act has got (0 to 1). */
  k: number;
  /** The pose this frame. */
  P: Pose;
  /** 0 standing still, 1 walking. */
  walk: number;
}

function resetFor(p: Pose) {
  p.sx = p.sz = p.syaw = p.sit = p.lean = p.twist = p.hx = p.hy = p.hz = p.bob = p.tilt = p.talk = 0;
  p.aux.set(0, 0, 0);
}

/** Poses the person every frame; `forearm` is the elbow-to-palm length (cook metres). */
export function useRig(refs: RigRefs, act: string, motion: Motion, kit: Kit, seed: number, held: HeldItem[], forearm = 0.168): MutableRefObject<RigState> {
  const st = useRef({
    phase: 0,
    a: newPose(),
    b: newPose(),
    M: new THREE.Matrix4(),
    inv: new THREE.Matrix4(),
    tR: new THREE.Vector3(),
    tL: new THREE.Vector3(),
    S: new THREE.Vector3(),
    pole: new THREE.Vector3(),
  });
  const out = useRef<RigState>({ cur: act, prev: act, since: -10, prevSince: -10, k: 1, P: newPose(), walk: 0 });

  const poseOf = (a: string, t: number, p: Pose, age: number) => {
    resetFor(p);
    if (!kit.poser(a, t, seed, motion.seat, p, age)) {
      resetFor(p);
      sharedPoser(a, t, seed, motion.seat, p, age);
    }
  };

  useFrame(({ clock }, delta) => {
    const S = st.current;
    const R = out.current;
    const t = clock.elapsedTime;
    const dt = Math.min(0.1, delta);
    if (act !== R.cur) {
      R.prev = R.cur;
      R.prevSince = R.since;
      R.cur = act;
      R.since = t;
    }
    // walking: a stride phase driven by the distance covered
    const speed = motion.speed;
    R.walk += (smoothstep(0.05, 0.7, speed) - R.walk) * (1 - Math.exp(-dt * 10));
    S.phase += (speed / 0.72) * Math.PI * dt;
    const w = R.walk;

    const k = smoothstep(0, 0.45, t - R.since);
    R.k = k;
    poseOf(R.cur, t, S.b, t - R.since);
    if (k < 1) {
      poseOf(R.prev, t, S.a, t - R.prevSince);
      mixPose(R.P, S.a, S.b, k);
    } else mixPose(R.P, S.b, S.b, 1);
    const P = R.P;
    const sw = Math.sin(S.phase);
    if (w > 0.001) {
      P.R.z += -0.08 * sw * w;
      P.L.z += 0.08 * sw * w;
      P.R.y += 0.02 * Math.max(0, -sw) * w;
      P.L.y += 0.02 * Math.max(0, sw) * w;
      P.lean += 0.06 * w;
      P.bob += 0.014 * Math.abs(Math.cos(S.phase)) * w;
    }
    // body
    const { stance, body, torso, inner, head, legR, legL, armR, armL, elbowR, elbowL } = refs;
    stance.current.position.set(P.sx, 0, P.sz);
    stance.current.rotation.set(0, P.syaw, 0);
    const breathe = 1 + 0.012 * Math.sin(t * 1.9 + seed);
    body.current.position.set(0, P.bob + P.sit * (motion.seat - SEAT_DROP), 0);
    torso.current.rotation.set(P.lean, P.twist, 0);
    torso.current.scale.set(1, breathe, 1);
    head.current.rotation.set(P.hx - P.lean * 0.5, P.hy, P.hz);
    legR.current.rotation.set(-0.55 * sw * w * (1 - P.sit) - 1.32 * P.sit, 0, -0.1 * P.sit);
    legL.current.rotation.set(0.55 * sw * w * (1 - P.sit) - 1.32 * P.sit, 0, 0.1 * P.sit);

    // arms: hand targets into the frame the arms hang in
    stance.current.updateMatrix();
    body.current.updateMatrix();
    torso.current.updateMatrix();
    inner.current.updateMatrix();
    S.M.copy(stance.current.matrix).multiply(body.current.matrix).multiply(torso.current.matrix).multiply(inner.current.matrix);
    S.inv.copy(S.M).invert();
    S.tR.copy(P.R).applyMatrix4(S.inv);
    S.tL.copy(P.L).applyMatrix4(S.inv);
    S.S.set(-RIG.shoulderX, RIG.shoulderY, 0);
    S.pole.set(-0.5, 0.25, -0.45);
    solveArm(armR.current, elbowR.current, S.S, S.tR, S.pole, RIG.upperArm, forearm);
    S.S.set(RIG.shoulderX, RIG.shoulderY, 0);
    S.pole.set(0.5, 0.25, -0.45);
    solveArm(armL.current, elbowL.current, S.S, S.tL, S.pole, RIG.upperArm, forearm);

    // what the hands hold, placed where the hands are
    const using = (acts: string[]) => (acts.includes(R.cur) ? k > 0.5 : acts.includes(R.prev) && k <= 0.5);
    held.forEach((h, i) => {
      const node = refs.held.current[i];
      if (!node) return;
      node.visible = using(h.acts);
      if (node.visible) h.place(P, node, t, seed, h.acts.includes(R.cur) ? t - R.since : t - R.prevSince);
    });
  });
  return out;
}
