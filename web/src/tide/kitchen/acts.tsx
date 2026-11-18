import * as THREE from 'three';
import { smoothstep } from '../../tank/util';
import type { HeldItem, Kit } from '../crew/Person';
import { fromBody, hipLine, type Pose, type Poser } from '../crew/pose';
import { chopsticksGeometry, clothGeometry, cupGeometry, knifeGeometry, ladleGeometry, menuTexture, propMats, ramenGeometry, smallBowlGeometry, strainerGeometry, ticketGeometry, ticketTexture, whiskGeometry } from './cookProps';

// What cooks (and the kitchen's customers and waiter) do, as poses in the
// person's own frame (cook metres; at a station, the station's frame).
//
//   working:   chop (edit), stir (command), read a ticket (read), the recipe
//              book (web); anything else, they keep busy: taste the broth,
//              shake out noodles, wipe the counter, in turn;
//   finishing: plate the dish (a bowl set down for the waiter to take out);
//   helpers:   whisk;   waiter: carry, serve;   customers: menu, eat.

/** Station things in the cook's frame at work: the board's and the pot's centres on the counter. */
export const BOARD = new THREE.Vector3(-0.1, 0.418, 0.295);
export const POT = new THREE.Vector3(0.285, 0.418, 0.318);
/** The pot stands on a burner: its base, and the broth's surface. */
export const POT_BASE = POT.y + 0.036;
export const BROTH_Y = POT_BASE + 0.105;

/** Chopping: ten quick cuts walking along a carrot, then a pause to sweep the slices aside. */
export const CHOP = { cycle: 4.8, every: 0.34, cuts: 10, step: 0.0105 };
export function chopAt(t: number, seed: number) {
  const u = (t + seed) % CHOP.cycle;
  const cutting = u < CHOP.cuts * CHOP.every;
  const n = Math.min(CHOP.cuts - 1, Math.floor(u / CHOP.every));
  const ph = (u % CHOP.every) / CHOP.every;
  /** Slices cut so far in this round. */
  const done = cutting ? n + (ph > 0.5 ? 1 : 0) : CHOP.cuts;
  return { u, n, ph, cutting, done };
}
/** Where the carrot's cut face is after `done` slices (cook frame, along x). */
export const carrotFace = (done: number) => BOARD.x - 0.07 + done * CHOP.step;
export const CARROT_TOP = BOARD.x + 0.13;

/** While a session thinks, its cook keeps busy: a different small job every few seconds. */
const BUSY = ['taste', 'strain', 'wipe'] as const;
export const busyAct = (t: number, seed: number) => BUSY[Math.floor((t + seed * 5.3) / 9) % BUSY.length];

/** How long plating takes (the bowl leaves the hands at the end). */
export const PLATE_S = 2.2;
/** Customers' tables in their own frame: the table top, and where their bowl sits. */
const TABLE_TOP = 0.84 / 2.2;
export const MEAL = new THREE.Vector3(0.0, TABLE_TOP, 0.27);

const va = new THREE.Vector3();
const vb = new THREE.Vector3();

const potSide = (p: Pose) => {
  // turned toward the pot, a small step that way
  p.syaw = 0.5;
  p.sx = 0.03;
};

export const kitchenPoser: Poser = (act, t, seed, seat, p, age) => {
  switch (act) {
    case 'chop': {
      p.lean = 0.2;
      p.hx = 0.5;
      p.hy = -0.06;
      const c = chopAt(t, seed);
      if (c.cutting) {
        const lift = 1 - Math.pow(Math.sin(c.ph * Math.PI), 0.6);
        p.R.set(carrotFace(c.n) + CHOP.step * 0.9, BOARD.y + 0.044 + lift * 0.06, BOARD.z - 0.05);
        p.tilt = 0.08 + (1 - lift) * 0.26;
        p.bob = 0.004 * (1 - lift);
      } else {
        // the pause: the flat of the knife sweeps the slices to the side
        const k = smoothstep(CHOP.cuts * CHOP.every, CHOP.cycle - 0.3, c.u);
        p.R.set(carrotFace(CHOP.cuts) - Math.sin(k * Math.PI) * 0.09, BOARD.y + 0.05, BOARD.z - 0.04);
        p.tilt = 0.1;
      }
      p.L.set(carrotFace(c.done) + 0.075, BOARD.y + 0.04, BOARD.z - 0.008);
      return true;
    }
    case 'stir': {
      potSide(p);
      p.lean = 0.16;
      p.hx = 0.42;
      p.hy = 0.06;
      const w = (t + seed) * 4.4;
      p.twist = 0.06 * Math.sin(w);
      // the ladle's bowl circles in the broth; the hand follows above it
      p.aux.set(POT.x + Math.cos(w) * 0.075, BROTH_Y - 0.035, POT.z + Math.sin(w) * 0.06);
      p.R.set(POT.x - 0.07 + Math.cos(w) * 0.045, BROTH_Y + 0.085, POT.z - 0.06 + Math.sin(w) * 0.035);
      fromBody(p, 0.17, 0.36, -0.035, p.L);
      return true;
    }
    case 'read': {
      p.lean = 0.08;
      p.hx = 0.46;
      p.hz = 0.07 * Math.sin(t * 0.7 + seed);
      // now and then the ticket comes closer, to check a line
      const k = smoothstep(0.0, 0.6, ((t + seed) % 6.0) - 3.6) * (1 - smoothstep(1.4, 2.0, ((t + seed) % 6.0) - 3.6));
      fromBody(p, -0.068, 0.5 + 0.03 * k, 0.235 - 0.025 * k, p.R);
      fromBody(p, 0.068, 0.5 + 0.03 * k, 0.235 - 0.025 * k, p.L);
      fromBody(p, 0, 0.52 + 0.03 * k, 0.245 - 0.025 * k, p.aux);
      return true;
    }
    case 'book': {
      p.lean = 0.24;
      p.hx = 0.56;
      p.hy = 0.04 * Math.sin(t * 0.9 + seed);
      // turn a page every few seconds: the right hand sweeps across in an arc
      const u = ((t + seed) % 5.0) / 5.0;
      const k = smoothstep(0.62, 0.86, u);
      const arc = Math.sin(k * Math.PI);
      p.R.set(BOARD.x - 0.075 + k * 0.13, BOARD.y + 0.045 + arc * 0.05, BOARD.z - 0.03 + arc * 0.01);
      p.L.set(BOARD.x + 0.115, BOARD.y + 0.036, BOARD.z - 0.02);
      return true;
    }
    case 'taste': {
      // a spoonful from the pot up to the lips, a thoughtful moment, back down
      potSide(p);
      p.lean = 0.1;
      const u = (t + seed) % 4.8;
      const up = smoothstep(1.0, 2.0, u) * (1 - smoothstep(3.1, 4.1, u));
      va.set(POT.x - 0.04, BROTH_Y + 0.06 - 0.03 * Math.sin(Math.min(1, u) * Math.PI), POT.z - 0.03);
      fromBody(p, -0.012, 0.79, 0.2, vb);
      p.R.lerpVectors(va, vb, up);
      fromBody(p, 0.17, 0.36, -0.035, p.L);
      p.hx = 0.42 - 0.58 * up;
      p.hz = 0.1 * up * Math.sin(t * 3);
      p.tilt = up;
      return true;
    }
    case 'strain': {
      // the noodle strainer over the pot: three sharp shakes, a rest
      potSide(p);
      p.lean = 0.14;
      p.hx = 0.4;
      const u = (t + seed) % 2.4;
      const shake = u < 1.1 ? Math.abs(Math.sin((u / 1.1) * Math.PI * 3)) : 0;
      p.R.set(POT.x - 0.06, BROTH_Y + 0.2 + shake * 0.06, POT.z - 0.05);
      p.aux.set(POT.x + 0.02, BROTH_Y + 0.02 + shake * 0.05, POT.z - 0.01);
      p.L.set(POT.x - 0.2, BOARD.y + 0.02, POT.z - 0.13);
      p.bob = 0.006 * shake;
      return true;
    }
    case 'wipe': {
      p.lean = 0.2;
      p.hx = 0.48;
      const w = (t + seed) * 3.2;
      p.R.set(0.07 + 0.05 * Math.cos(w), BOARD.y + 0.012, 0.21 + 0.03 * Math.sin(w));
      p.L.set(0.15, BOARD.y + 0.018, 0.19);
      p.twist = 0.05 * Math.cos(w);
      return true;
    }
    case 'plate': {
      // lift a finished bowl from the board and set it forward for the waiter
      p.lean = 0.2;
      p.hx = 0.45;
      const lift = smoothstep(0.5, 1.2, age);
      const fwd = smoothstep(1.0, 1.7, age);
      const down = smoothstep(1.6, 2.0, age);
      p.aux.set(0, BOARD.y + 0.02 + lift * 0.08 - down * 0.06, 0.27 + fwd * 0.17);
      p.R.set(p.aux.x - 0.095, p.aux.y + 0.04, p.aux.z - 0.01);
      p.L.set(p.aux.x + 0.095, p.aux.y + 0.04, p.aux.z - 0.01);
      return true;
    }
    case 'ladle': {
      // at a big broth pot on the back line: up on the rim, a long ladle in big slow circles
      p.lean = -0.04;
      p.hx = -0.05;
      const w = (t + seed) * 1.6;
      p.twist = 0.08 * Math.sin(w);
      p.aux.set(0.02 + Math.cos(w) * 0.07, 0.8, 0.46 + Math.sin(w) * 0.06);
      p.R.set(-0.06 + Math.cos(w) * 0.03, 0.87, 0.22 + Math.sin(w) * 0.02);
      p.L.set(0.08 + Math.cos(w) * 0.03, 0.85, 0.24 + Math.sin(w) * 0.02);
      return true;
    }
    case 'whisk': {
      p.lean = 0.12;
      p.hx = 0.4;
      const w = (t + seed) * 13;
      fromBody(p, 0.035, 0.43, 0.19, p.L);
      fromBody(p, -0.02 + Math.cos(w) * 0.018, 0.5, 0.2 + Math.sin(w) * 0.014, p.R);
      fromBody(p, 0.02, 0.43, 0.2, p.aux);
      return true;
    }
    case 'carry': {
      // the waiter, a bowl held out in both hands
      p.lean = 0.03;
      p.hx = 0.18;
      fromBody(p, 0, 0.48, 0.22, p.aux);
      fromBody(p, -0.09, 0.5, 0.2, p.R);
      fromBody(p, 0.09, 0.5, 0.2, p.L);
      return true;
    }
    case 'serve': {
      // set the bowl down on the table in front, then a little bow
      const down = smoothstep(0.1, 0.8, age);
      const bow = Math.sin(smoothstep(0.9, 1.6, age) * Math.PI);
      p.lean = 0.12 * down + 0.22 * bow;
      p.hx = 0.3 + 0.2 * down;
      fromBody(p, 0, 0.48 - down * 0.06, 0.22 + down * 0.14, p.aux);
      fromBody(p, -0.09, p.aux.y + 0.02, p.aux.z - 0.02, p.R);
      fromBody(p, 0.09, p.aux.y + 0.02, p.aux.z - 0.02, p.L);
      p.tilt = age > 0.9 ? 1 : 0;
      return true;
    }
    case 'menu': {
      // a customer, seated, reading the menu card; now and then a look up at the kitchen
      p.sit = 1;
      const drop = hipLine(seat);
      const look = smoothstep(0, 0.5, ((t + seed) % 7) - 5) * (1 - smoothstep(1.3, 1.8, ((t + seed) % 7) - 5));
      p.lean = 0.06;
      p.hx = 0.32 - 0.38 * look;
      fromBody(p, -0.055, drop + 0.2 + look * 0.03, 0.2, p.R);
      fromBody(p, 0.055, drop + 0.2 + look * 0.03, 0.2, p.L);
      fromBody(p, 0, drop + 0.22 + look * 0.03, 0.21, p.aux);
      return true;
    }
    case 'eat': {
      // noodles from the bowl to the mouth with chopsticks, a happy slurp
      p.sit = 1;
      const drop = hipLine(seat);
      const u = (t + seed) % 3.4;
      const up = smoothstep(0.5, 1.3, u) * (1 - smoothstep(2.1, 2.9, u));
      p.lean = 0.16 - 0.08 * up;
      p.hx = 0.36 - 0.26 * up;
      va.set(MEAL.x - 0.01, MEAL.y + 0.08, MEAL.z - 0.02);
      fromBody(p, -0.015, drop + 0.4, 0.19, vb);
      p.R.lerpVectors(va, vb, up);
      p.L.set(MEAL.x + 0.1, MEAL.y + 0.05, MEAL.z - 0.03);
      p.tilt = up;
      return true;
    }
  }
  return false;
};

const pm = propMats;
const UP = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();

const held: HeldItem[] = [
  {
    acts: ['chop'],
    render: () => <mesh geometry={knifeGeometry()} material={pm().blade} castShadow />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.rotation.set(p.tilt, 0.12, 0, 'YXZ');
    },
  },
  {
    acts: ['stir'],
    render: () => <mesh geometry={ladleGeometry()} material={pm().steel} castShadow />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.quaternion.setFromUnitVectors(UP, tmp.subVectors(p.aux, p.R).normalize());
    },
  },
  {
    acts: ['ladle'],
    render: () => <mesh geometry={ladleGeometry()} material={pm().steel} scale={2.1} castShadow />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.quaternion.setFromUnitVectors(UP, tmp.subVectors(p.aux, p.R).normalize());
    },
  },
  {
    acts: ['taste'],
    render: () => <mesh geometry={ladleGeometry()} material={pm().steel} scale={0.62} castShadow />,
    place: (p, o) => {
      // the spoon hangs bowl-down from the hand, tipping toward the lips at the top
      o.position.copy(p.R);
      o.rotation.set(-0.3 - 1.0 * p.tilt, 0.5, 0, 'YXZ');
    },
  },
  {
    acts: ['strain'],
    render: () => <mesh geometry={strainerGeometry()} material={pm().veg} castShadow />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.quaternion.setFromUnitVectors(UP, tmp.subVectors(p.aux, p.R).normalize());
    },
  },
  {
    acts: ['wipe'],
    render: () => <mesh geometry={clothGeometry()} material={pm().veg} castShadow />,
    place: (p, o) => {
      o.position.set(p.R.x, p.R.y - 0.012, p.R.z);
      o.rotation.set(0, 0.3, 0);
    },
  },
  {
    acts: ['read'],
    render: (seed) => (
      <mesh geometry={ticketGeometry()}>
        <meshStandardMaterial map={ticketTexture(Math.floor(seed * 7))} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    ),
    place: (p, o) => {
      o.position.copy(p.aux);
      o.rotation.set(-0.5, Math.PI + p.syaw, 0, 'YXZ');
    },
  },
  {
    acts: ['plate', 'carry', 'serve'],
    render: () => <mesh geometry={ramenGeometry()} material={pm().ceramic} castShadow />,
    place: (p, o, _t, _s, age) => {
      o.position.set(p.aux.x, p.aux.y - 0.035, p.aux.z);
      o.rotation.set(0, 0, 0);
      // the bowl leaves the hands once it's set down
      o.visible = !(p.tilt > 0.5) && !(age > PLATE_S - 0.25 && p.R.z > 0.4);
    },
  },
  {
    acts: ['mug'],
    render: () => (
      <group>
        <mesh geometry={cupGeometry()} material={pm().ceramic} castShadow />
        <mesh material={pm().tea} position={[0, 0.066, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.033, 20]} />
        </mesh>
      </group>
    ),
    place: (p, o) => {
      o.position.set(p.R.x + 0.016, p.R.y - 0.038, p.R.z + 0.008);
      o.rotation.set(-0.9 * p.tilt, 0, 0);
    },
  },
  {
    acts: ['whisk'],
    render: () => <mesh geometry={whiskGeometry()} material={pm().steel} />,
    place: (p, o) => {
      o.position.copy(p.R);
    },
  },
  {
    acts: ['whisk'],
    render: () => <mesh geometry={smallBowlGeometry()} material={pm().ceramic} castShadow />,
    place: (p, o) => {
      o.position.copy(p.aux);
    },
  },
  {
    acts: ['menu'],
    render: (seed) => (
      <mesh>
        <planeGeometry args={[0.1, 0.13]} />
        <meshStandardMaterial map={menuTexture(Math.floor(seed * 3))} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    ),
    place: (p, o) => {
      o.position.copy(p.aux);
      o.rotation.set(-0.55, Math.PI + p.syaw, 0, 'YXZ');
    },
  },
  {
    acts: ['eat'],
    render: () => <mesh geometry={chopsticksGeometry()} material={pm().wood} castShadow />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.rotation.set(0.9 - 1.4 * p.tilt, 0.25, 0, 'YXZ');
    },
  },
];

export const KITCHEN_KIT: Kit = { poser: kitchenPoser, held, happy: ['eat'] };
