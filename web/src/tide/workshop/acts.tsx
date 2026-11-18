import * as THREE from 'three';
import { smoothstep } from '../../tank/util';
import type { HeldItem, Kit } from '../crew/Person';
import { fromBody, type Poser } from '../crew/pose';
import { mugGeometry } from '../office/props';
import { blueprintGeometry, blueprintTexture, brushGeometry, hammerGeometry, pencilGeometry, plankGeometry, robotGeometry, rulerGeometry, sandingBlockGeometry, sawGeometry, shopMats, trainGeometry, wheelGeometry } from './props';

// What toymakers do at the bench (in the maker's own frame, cook metres; at
// a bench, the bench's frame):
//
//   working:  saw a plank (edit), hammer the toy together (run), read the
//             blueprint (read), rummage in the parts tray (web); anything
//             else, they keep busy: turn a toy over, sand, measure, in turn;
//   idle:     cocoa by the stove, a nap (shared acts);   helpers: paint toys.

export const BENCH_TOP = 0.92 / 2.2;
/** Bench things in the maker's frame. */
export const PLANK = new THREE.Vector3(-0.1, BENCH_TOP, 0.37);
export const CUT_X = PLANK.x - 0.12;
export const TOY = new THREE.Vector3(0.1, BENCH_TOP, 0.25);
export const TRAY = new THREE.Vector3(0.3, BENCH_TOP, 0.33);

/** Hammering: four blows, then a moment to set the next peg. */
export const HAMMER = { cycle: 2.9, every: 0.42, blows: 4 };
export function hammerAt(t: number, seed: number) {
  const u = (t + seed) % HAMMER.cycle;
  const striking = u < HAMMER.blows * HAMMER.every;
  const ph = (u % HAMMER.every) / HAMMER.every;
  // up slowly, down fast: the blow lands at ph = 0.85
  const lift = striking ? (ph < 0.7 ? smoothstep(0, 0.7, ph) : 1 - smoothstep(0.7, 0.85, ph)) : 0.2;
  return { u, striking, ph, lift, hit: striking && ph > 0.84 && ph < 0.95 };
}

const BUSY = ['tinker', 'sand', 'measure'] as const;
export const shopBusy = (t: number, seed: number) => BUSY[Math.floor((t + seed * 3.7) / 9) % BUSY.length];

export const shopPoser: Poser = (act, t, seed, _seat, p) => {
  switch (act) {
    case 'saw': {
      // long strokes across the plank's end, the other hand holding it down
      p.lean = 0.24;
      p.hx = 0.5;
      p.hy = -0.1;
      const s = Math.sin((t + seed) * 7.5);
      p.twist = -0.05 * s;
      p.R.set(CUT_X, PLANK.y + 0.1 - 0.015 * (s + 1), PLANK.z - 0.15 + 0.08 * s);
      p.aux.set(CUT_X, PLANK.y + 0.015, PLANK.z + 0.08 + 0.08 * s);
      p.L.set(PLANK.x + 0.08, PLANK.y + 0.04, PLANK.z - 0.01);
      return true;
    }
    case 'hammer': {
      p.lean = 0.2;
      p.hx = 0.48;
      const h = hammerAt(t, seed);
      p.R.set(TOY.x - 0.05, TOY.y + 0.09 + h.lift * 0.14, TOY.z - 0.11 - h.lift * 0.04);
      p.tilt = h.lift;
      p.bob = h.hit ? 0.004 : 0;
      p.L.set(TOY.x + 0.1, TOY.y + 0.045, TOY.z + 0.0);
      return true;
    }
    case 'blueprint': {
      // the big sheet held open with both hands
      p.lean = 0.06;
      p.hx = 0.42;
      p.hz = 0.06 * Math.sin(t * 0.6 + seed);
      fromBody(p, -0.13, 0.52, 0.21, p.R);
      fromBody(p, 0.13, 0.52, 0.21, p.L);
      fromBody(p, 0, 0.54, 0.225, p.aux);
      return true;
    }
    case 'rummage': {
      // digging in the parts tray, holding something up to look at it
      p.syaw = -0.35;
      p.lean = 0.2;
      const u = (t + seed) % 3.2;
      const up = smoothstep(0.8, 1.4, u) * (1 - smoothstep(2.3, 2.9, u));
      p.hx = 0.46 - 0.3 * up;
      p.R.set(TRAY.x - 0.03 - up * 0.17, TRAY.y + 0.03 + up * 0.22, TRAY.z - 0.02 - up * 0.08);
      p.L.set(TRAY.x + 0.02 + 0.015 * Math.cos(t * 6), TRAY.y + 0.025, TRAY.z + 0.01 * Math.sin(t * 6));
      p.tilt = up;
      return true;
    }
    case 'tinker': {
      // a finished toy turned over in both hands, looked at closely
      p.lean = 0.08;
      p.hx = 0.34;
      p.hz = 0.14 * Math.sin(t * 0.8 + seed);
      fromBody(p, -0.045, 0.53, 0.2, p.R);
      fromBody(p, 0.045, 0.53, 0.2, p.L);
      fromBody(p, 0, 0.53, 0.21, p.aux);
      p.tilt = t + seed;
      return true;
    }
    case 'sand': {
      p.lean = 0.24;
      p.hx = 0.5;
      const s = Math.sin((t + seed) * 6);
      p.R.set(PLANK.x - 0.04 + 0.07 * s, PLANK.y + 0.04, PLANK.z - 0.01);
      p.L.set(PLANK.x + 0.14, PLANK.y + 0.036, PLANK.z - 0.005);
      p.twist = -0.04 * s;
      return true;
    }
    case 'measure': {
      // a ruler laid on the plank, a pencil mark at each step
      p.lean = 0.24;
      p.hx = 0.52;
      const u = (t + seed) % 4;
      const k = Math.floor(u);
      p.L.set(PLANK.x + 0.08, PLANK.y + 0.034, PLANK.z + 0.012);
      p.R.set(PLANK.x - 0.1 + k * 0.05, PLANK.y + 0.036 + 0.012 * Math.max(0, Math.sin((u % 1) * Math.PI)), PLANK.z - 0.012);
      p.aux.set(PLANK.x, PLANK.y + 0.028, PLANK.z + 0.014);
      return true;
    }
    case 'lathe': {
      // at the lathe: both hands on the gouge on the tool rest, easing it along the turning wood
      p.lean = 0.2;
      p.hx = 0.45;
      const w = (t + seed) * 0.9;
      const along = 0.035 * Math.sin(w);
      p.R.set(-0.05 + along, 0.57, 0.31);
      p.L.set(0.06 + along, 0.6, 0.35);
      p.hy = 0.08 * Math.sin(w);
      p.aux.set(0.06 + along, 0.6, 0.47);
      return true;
    }
    case 'drill': {
      // at the drill press: the right hand brings the lever down, the left holds the piece
      p.lean = 0.12;
      p.hx = 0.4;
      const u = (t + seed) % 2.4;
      const pull = u < 1.2 ? smoothstep(0, 0.5, u) * (1 - smoothstep(0.9, 1.2, u)) : 0;
      p.R.set(-0.17, 0.74 - 0.12 * pull, 0.27);
      p.L.set(0.03, 0.47, 0.33);
      p.bob = 0.004 * pull;
      return true;
    }
    case 'browse': {
      // at the shelves: hands along a shelf, now and then up to the next one, head tilted to read the labels
      p.lean = 0.04;
      const u = (t + seed) % 5;
      const up = smoothstep(2.6, 3.2, u) * (1 - smoothstep(4.0, 4.6, u));
      const slide = Math.sin((t + seed) * 0.8);
      p.hx = 0.18 - 0.4 * up;
      p.hy = 0.25 * slide;
      p.R.set(-0.05 + 0.08 * slide, 0.5 + 0.34 * up, 0.24);
      p.L.set(0.12 + 0.05 * slide, 0.48, 0.22);
      p.tilt = up;
      return true;
    }
    case 'carrytoy': {
      // walking a finished toy over to the counter, held out in both hands
      p.lean = 0.03;
      p.hx = 0.2;
      fromBody(p, 0, 0.5, 0.21, p.aux);
      fromBody(p, -0.075, 0.51, 0.2, p.R);
      fromBody(p, 0.075, 0.51, 0.2, p.L);
      return true;
    }
    case 'settoy': {
      // at the counter: the toy set down behind the bell, hands back, a little nod
      const u = t % 1.6;
      const down = smoothstep(0.1, 0.8, u);
      const back = smoothstep(1.0, 1.4, u);
      p.lean = 0.2 * down * (1 - back) + 0.1 * back;
      p.hx = 0.25 + 0.25 * down;
      p.aux.set(-0.18 * down, 0.5 - 0.03 * down, 0.21 + 0.1 * down);
      p.R.set(p.aux.x - 0.075 + 0.0 * back, p.aux.y + 0.01 - 0.12 * back, p.aux.z - 0.01 - 0.12 * back);
      p.L.set(p.aux.x + 0.075, p.aux.y + 0.01 - 0.12 * back, p.aux.z - 0.01 - 0.12 * back);
      p.tilt = back;
      return true;
    }
    case 'paint': {
      // a helper painting a small toy
      p.lean = 0.1;
      p.hx = 0.4;
      fromBody(p, 0.04, 0.5, 0.2, p.L);
      fromBody(p, -0.015 + 0.01 * Math.sin(t * 7 + seed), 0.51 + 0.006 * Math.sin(t * 3), 0.215, p.R);
      fromBody(p, 0.04, 0.5, 0.215, p.aux);
      return true;
    }
  }
  return false;
};

const m = shopMats;
/** A gouge: a turned handle, a long steel shaft forward (+z). */
const gouge = (() => {
  const handle = new THREE.CylinderGeometry(0.008, 0.01, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0, -0.035);
  const shaft = new THREE.CylinderGeometry(0.0035, 0.0035, 0.09, 8).rotateX(Math.PI / 2).translate(0, 0, 0.045);
  return { handle, shaft };
})();
const UP = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3();
const IDENTITY = new THREE.Matrix4();

const held: HeldItem[] = [
  {
    acts: ['saw'],
    render: () => <mesh geometry={sawGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      // the blade runs from the grip toward the cut, teeth down
      o.position.copy(p.R);
      o.quaternion.setFromUnitVectors(UP, tmp.subVectors(p.aux, p.R).normalize());
    },
  },
  {
    acts: ['hammer'],
    render: () => <mesh geometry={hammerGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      // raised back as the hand lifts, square to the toy as it lands
      o.position.copy(p.R);
      o.rotation.set(0.12 - p.tilt * 1.15, 0.05, 0, 'YXZ');
    },
  },
  {
    acts: ['blueprint'],
    render: (seed) => (
      <mesh geometry={blueprintGeometry()}>
        <meshStandardMaterial map={blueprintTexture(Math.floor(seed * 5))} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
    ),
    place: (p, o) => {
      o.position.copy(p.aux);
      o.rotation.set(-0.5, Math.PI + p.syaw, 0, 'YXZ');
    },
  },
  {
    acts: ['rummage'],
    render: () => <mesh geometry={wheelGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      o.position.set(p.R.x, p.R.y + 0.012, p.R.z + 0.01);
      o.rotation.set(0, p.syaw + p.tilt * 0.8, 0);
      o.visible = p.tilt > 0.15;
    },
  },
  {
    acts: ['tinker'],
    render: () => <mesh geometry={robotGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      o.position.set(p.aux.x, p.aux.y - 0.03, p.aux.z + 0.01);
      o.rotation.set(0.3 * Math.sin(p.tilt * 0.7), Math.PI + 0.6 * Math.sin(p.tilt * 0.45), 0);
    },
  },
  {
    acts: ['sand'],
    render: () => <mesh geometry={sandingBlockGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      o.position.set(p.R.x, p.R.y - 0.032 + 0.02, p.R.z);
      o.rotation.set(0, 0, 0);
    },
  },
  {
    acts: ['measure'],
    render: () => <mesh geometry={rulerGeometry()} material={m().painted} />,
    place: (p, o) => {
      o.position.copy(p.aux);
    },
  },
  {
    acts: ['measure'],
    render: () => <mesh geometry={pencilGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.rotation.set(1.1, 0.4, 0, 'YXZ');
    },
  },
  {
    acts: ['paint'],
    render: () => <mesh geometry={brushGeometry()} material={m().painted} />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.rotation.set(0.9, 0.6, 0, 'YXZ');
    },
  },
  {
    acts: ['paint'],
    render: () => <mesh geometry={robotGeometry()} material={m().painted} scale={0.8} castShadow />,
    place: (p, o) => {
      o.position.set(p.aux.x, p.aux.y - 0.025, p.aux.z);
      o.rotation.set(0, Math.PI - 0.3, 0);
    },
  },
  {
    acts: ['lathe'],
    render: () => (
      <group>
        <mesh geometry={gouge.handle} material={m().wood} castShadow />
        <mesh geometry={gouge.shaft} material={m().steel} castShadow />
      </group>
    ),
    place: (p, o) => {
      o.position.copy(p.R);
      o.lookAt(tmp.copy(p.aux).applyMatrix4(o.parent ? o.parent.matrixWorld : IDENTITY));
    },
  },
  {
    acts: ['drill'],
    render: () => <mesh geometry={plankGeometry()} material={m().wood} scale={[0.25, 1.2, 0.7]} castShadow />,
    place: (p, o) => {
      o.position.set(p.L.x - 0.02, p.L.y - 0.025, p.L.z + 0.03);
      o.rotation.set(0, 0.3, 0);
    },
  },
  {
    acts: ['carrytoy', 'settoy'],
    render: (seed) => <mesh geometry={Math.floor(seed * 10) % 2 ? robotGeometry() : trainGeometry()} material={m().painted} castShadow />,
    place: (p, o) => {
      o.position.set(p.aux.x, p.aux.y - 0.035, p.aux.z);
      o.rotation.set(0, Math.PI / 2, 0);
      // let go once it's down
      o.visible = p.tilt < 0.5;
    },
  },
  {
    acts: ['mug'],
    render: (seed) => (
      <group>
        <mesh geometry={mugGeometry(Math.floor(seed * 3) + 1)} material={m().painted} castShadow />
        <mesh material={m().cocoa} position={[0, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.019, 18]} />
        </mesh>
      </group>
    ),
    place: (p, o) => {
      o.position.set(p.R.x + 0.012, p.R.y - 0.03, p.R.z + 0.006);
      o.rotation.set(-0.9 * p.tilt, -Math.PI / 2, 0, 'YXZ');
    },
  },
];

export const WORKSHOP_KIT: Kit = { poser: shopPoser, held };
