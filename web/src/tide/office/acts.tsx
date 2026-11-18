import * as THREE from 'three';
import { smoothstep } from '../../tank/util';
import type { HeldItem, Kit } from '../crew/Person';
import { fromBody, hipLine, type Poser } from '../crew/pose';
import { clipboardGeometry, handsetGeometry, mugGeometry, officeMats, paperStackGeometry, penGeometry, sheetGeometry, sheetTexture } from './props';

// What office people do, seated at their desks (in the person's own frame,
// cook metres; at a desk, the desk's frame):
//
//   working:  type (edit), lean back and watch a command run (run), read a
//             printout (read), on the phone (web); anything else, they keep
//             busy: chin on hand, jot notes, a sip of coffee, in turn;
//   idle:     coffee on the lounge sofa, a nap (shared acts); with no seat
//             free, a doze at the desk;   helpers (interns): a clipboard.

/** Desk things in the sitter's frame: the desk top, the laptop's keyboard, the phone, the notepad, the mug. */
export const DESK_TOP = 0.84 / 2.2;
export const LAPTOP = new THREE.Vector3(0, DESK_TOP, 0.24);
export const KEYS = new THREE.Vector3(0, DESK_TOP + 0.023, 0.255);
export const PHONE = new THREE.Vector3(0.2, DESK_TOP, 0.25);
export const NOTEPAD = new THREE.Vector3(-0.19, DESK_TOP, 0.25);
export const DESK_MUG = new THREE.Vector3(-0.26, DESK_TOP, 0.2);

/** While a session thinks, its person keeps busy: a different small thing every few seconds. */
const BUSY = ['ponder', 'scribble', 'sip'] as const;
export const officeBusy = (t: number, seed: number) => BUSY[Math.floor((t + seed * 4.1) / 10) % BUSY.length];

const va = new THREE.Vector3();
const vb = new THREE.Vector3();

export const officePoser: Poser = (act, t, seed, seat, p) => {
  const drop = hipLine(seat);
  switch (act) {
    case 'type': {
      // both hands on the keys, quick little hops, eyes on the screen
      p.sit = 1;
      p.lean = 0.16;
      p.hx = 0.26 + 0.03 * Math.sin(t * 0.9 + seed);
      p.hy = 0.05 * Math.sin(t * 0.4 + seed);
      const burst = (t + seed) % 5 < 4.2 ? 1 : 0.2;
      const hop = (o: number) => 0.012 * Math.max(0, Math.sin(t * 17 + o)) * burst;
      p.R.set(KEYS.x - 0.045, KEYS.y + 0.012 + hop(0), KEYS.z);
      p.L.set(KEYS.x + 0.045, KEYS.y + 0.012 + hop(2.1), KEYS.z);
      return true;
    }
    case 'watch': {
      // leaning back, arms folded, watching it run; now and then a tap on a key
      p.sit = 1;
      const u = (t + seed) % 7;
      const tap = smoothstep(5.4, 5.8, u) * (1 - smoothstep(6.4, 6.9, u));
      p.lean = -0.08 + 0.24 * tap;
      p.hx = 0.14 + 0.1 * tap;
      p.hz = 0.05 * Math.sin(t * 0.5 + seed);
      fromBody(p, 0.05, drop + 0.12, 0.16, va);
      p.R.copy(va).lerp(vb.set(KEYS.x - 0.03, KEYS.y + 0.014, KEYS.z), tap);
      fromBody(p, -0.05, drop + 0.14, 0.15, p.L);
      return true;
    }
    case 'paper': {
      // a printout held up to read; a page turned now and then
      p.sit = 1;
      p.lean = 0.02;
      p.hx = 0.36;
      p.hz = 0.06 * Math.sin(t * 0.7 + seed);
      const k = Math.sin(smoothstep(4.6, 5.6, (t + seed) % 6) * Math.PI);
      fromBody(p, -0.066, drop + 0.25 + 0.02 * k, 0.2, p.R);
      fromBody(p, 0.066, drop + 0.25, 0.2, p.L);
      fromBody(p, 0, drop + 0.27, 0.21, p.aux);
      p.tilt = k;
      return true;
    }
    case 'phone': {
      // the handset at the left ear, talking, the right hand jotting notes
      p.sit = 1;
      p.lean = 0.08;
      p.hx = 0.18;
      p.hz = -0.15;
      p.talk = Math.sin(t * 5.2 + seed) > 0.2 && (t + seed) % 6 < 4 ? 1 : 0;
      // beside the ear (a chibi head is wide: the hand goes just outside it)
      fromBody(p, 0.262, drop + 0.55, 0.03, p.L);
      p.R.set(NOTEPAD.x + 0.015 * Math.sin(t * 9), NOTEPAD.y + 0.016 + 0.004 * Math.abs(Math.sin(t * 18)), NOTEPAD.z + 0.01 * Math.sin(t * 2.3));
      return true;
    }
    case 'ponder': {
      // chin on hand, a gaze at the ceiling, a pen tapping, a slow swivel
      p.sit = 1;
      p.lean = 0.12;
      p.hx = -0.12;
      p.hz = 0.1;
      p.syaw = 0.1 * Math.sin(t * 0.6 + seed);
      fromBody(p, -0.03, drop + 0.49, 0.18, p.R);
      p.L.set(0.1, DESK_TOP + 0.016 + 0.012 * Math.max(0, Math.sin(t * 7)), 0.22);
      return true;
    }
    case 'scribble': {
      p.sit = 1;
      p.lean = 0.22;
      p.hx = 0.52;
      p.R.set(NOTEPAD.x + 0.014 * Math.sin(t * 8), NOTEPAD.y + 0.016 + 0.003 * Math.abs(Math.sin(t * 20)), NOTEPAD.z + 0.008 * Math.sin(t * 1.7));
      p.L.set(NOTEPAD.x + 0.09, NOTEPAD.y + 0.012, NOTEPAD.z - 0.01);
      return true;
    }
    case 'sip': {
      // a sip of coffee from the mug on the desk
      p.sit = 1;
      const u = (t + seed) % 6;
      const up = smoothstep(0.6, 1.5, u) * (1 - smoothstep(3.2, 4.1, u));
      p.lean = 0.1 - 0.12 * up;
      p.hx = 0.2 - 0.32 * up;
      va.set(DESK_MUG.x + 0.01, DESK_MUG.y + 0.03, DESK_MUG.z);
      fromBody(p, -0.015, drop + 0.47, 0.19, vb);
      p.R.lerpVectors(va, vb, up);
      p.L.set(0.08, DESK_TOP + 0.016, 0.2);
      p.tilt = up;
      return true;
    }
    case 'deskdoze': {
      // head down on folded arms
      p.sit = 1;
      p.lean = 0.32;
      p.hx = 0.62 + 0.04 * Math.sin(t * 0.8 + seed);
      p.hz = 0.15;
      p.R.set(-0.05, DESK_TOP + 0.02, 0.2);
      p.L.set(0.05, DESK_TOP + 0.02, 0.2);
      return true;
    }
    case 'printwait': {
      // standing at the printer, arms folded, then a reach for the pages as they come
      p.lean = 0.02;
      p.hx = 0.25;
      const u = (t + seed) % 6;
      const reach = smoothstep(3.6, 4.4, u) * (1 - smoothstep(5.0, 5.8, u));
      p.lean += 0.16 * reach;
      p.hx += 0.25 * reach;
      fromBody(p, 0.05, 0.43, 0.15, va);
      vb.set(-0.02, 0.46, 0.36);
      p.R.copy(va).lerp(vb, reach);
      fromBody(p, -0.05, 0.45, 0.14, p.L);
      p.tilt = smoothstep(4.6, 4.9, u) * (1 - smoothstep(5.6, 5.9, u));
      p.hy = 0.12 * Math.sin(t * 0.4 + seed) * (1 - reach);
      return true;
    }
    case 'coffee': {
      // at the espresso machine: a press of the button, then a sip while it runs
      const u = (t + seed) % 8;
      const press = u < 3;
      p.lean = press ? 0.12 : 0.02;
      p.hx = press ? 0.35 : 0.1;
      if (press) {
        p.R.set(0.02, 0.6 + 0.02 * Math.max(0, Math.sin(u * 4)), 0.27);
        p.L.set(0.12, 0.47, 0.24);
        p.tilt = 0;
      } else {
        const up = smoothstep(3.4, 4.2, u) * (1 - smoothstep(6.4, 7.2, u));
        fromBody(p, 0.02, 0.44 + 0.31 * up, 0.2 - 0.02 * up, p.L);
        fromBody(p, -0.06, 0.42 + 0.02 * up, 0.16, p.R);
        p.hx = 0.1 - 0.3 * up;
        p.tilt = up;
      }
      return true;
    }
    case 'sketch': {
      // writing on the board: the marker moves along in little loops
      p.lean = 0.04;
      p.hx = -0.1;
      const w = (t + seed) * 2.2;
      p.R.set(-0.06 + 0.07 * Math.sin(w * 0.35), 0.8 + 0.035 * Math.sin(w * 1.7), 0.23);
      p.hy = 0.1 * Math.sin(w * 0.35);
      fromBody(p, 0.15, 0.38, 0.06, p.L);
      return true;
    }
    case 'note': {
      // the end of a turn: their note lifted off the board and stuck in the "done" column
      const u = t % 2.6;
      const lift = smoothstep(0.2, 0.7, u);
      const across = smoothstep(0.7, 1.9, u);
      p.lean = 0.03;
      p.hx = -0.12;
      // from "doing" (their left, facing the board) to "done" (their right)
      p.hy = 0.25 - 0.5 * across;
      p.R.set(0.17 - 0.32 * across, 0.8 + 0.06 * lift - 0.03 * across, 0.23);
      fromBody(p, 0.16, 0.38, 0.05, p.L);
      p.tilt = 1;
      return true;
    }
    case 'clipboard': {
      // an intern, standing, notes on a clipboard
      p.lean = 0.06;
      p.hx = 0.36;
      fromBody(p, 0.04, 0.5, 0.2, p.L);
      fromBody(p, -0.02 + 0.012 * Math.sin(t * 8 + seed), 0.49 + 0.004 * Math.abs(Math.sin(t * 16)), 0.22, p.R);
      fromBody(p, 0.03, 0.5, 0.215, p.aux);
      return true;
    }
  }
  return false;
};

const m = officeMats;

const held: HeldItem[] = [
  {
    acts: ['phone'],
    render: () => <mesh geometry={handsetGeometry()} material={m().plastic} castShadow />,
    place: (p, o) => {
      // the earpiece at the ear, the mouthpiece toward the chin
      o.position.set(p.L.x - 0.012, p.L.y + 0.01, p.L.z + 0.012);
      o.rotation.set(0.35, 0.2 + p.syaw, 0.3, 'YXZ');
    },
  },
  {
    acts: ['phone', 'scribble', 'clipboard'],
    render: () => <mesh geometry={penGeometry()} material={m().plastic} />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.rotation.set(0.9, 0.5, 0, 'YXZ');
    },
  },
  {
    acts: ['paper'],
    render: (seed) => (
      <mesh geometry={sheetGeometry()}>
        <meshStandardMaterial map={sheetTexture(Math.floor(seed * 7))} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    ),
    place: (p, o) => {
      o.position.copy(p.aux);
      o.rotation.set(-0.45, Math.PI + p.syaw, 0.08 * p.tilt, 'YXZ');
    },
  },
  {
    acts: ['sip', 'mug'],
    render: (seed) => (
      <group>
        <mesh geometry={mugGeometry(Math.floor(seed * 3))} material={m().ceramic} castShadow />
        <mesh material={m().coffee} position={[0, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.019, 18]} />
        </mesh>
      </group>
    ),
    place: (p, o) => {
      o.position.set(p.R.x + 0.012, p.R.y - 0.03, p.R.z + 0.006);
      o.rotation.set(-0.9 * p.tilt, -Math.PI / 2, 0, 'YXZ');
    },
  },
  {
    acts: ['printwait'],
    render: () => <mesh geometry={paperStackGeometry(4)} material={m().paper} castShadow />,
    place: (p, o) => {
      o.position.set(p.R.x, p.R.y - 0.01, p.R.z + 0.02);
      o.rotation.set(-0.3, 0, 0);
      o.visible = p.tilt > 0.4;
    },
  },
  {
    acts: ['coffee'],
    render: () => (
      <group>
        <mesh geometry={mugGeometry(4)} material={m().ceramic} castShadow />
        <mesh material={m().coffee} position={[0, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.019, 18]} />
        </mesh>
      </group>
    ),
    place: (p, o) => {
      o.position.set(p.L.x - 0.012, p.L.y - 0.03, p.L.z + 0.006);
      o.rotation.set(-0.9 * p.tilt, Math.PI / 2, 0, 'YXZ');
    },
  },
  {
    acts: ['sketch'],
    render: () => <mesh geometry={penGeometry()} material={m().plastic} />,
    place: (p, o) => {
      o.position.copy(p.R);
      o.rotation.set(-0.2, 0, 0);
    },
  },
  {
    acts: ['note'],
    render: () => (
      <mesh>
        <boxGeometry args={[0.05, 0.05, 0.004]} />
        <meshStandardMaterial color="#ffe27a" roughness={0.8} />
      </mesh>
    ),
    place: (p, o) => {
      o.position.set(p.R.x, p.R.y + 0.01, p.R.z + 0.012);
      o.rotation.set(0, 0, 0.1);
    },
  },
  {
    acts: ['clipboard'],
    render: () => <mesh geometry={clipboardGeometry()} material={m().wood} castShadow />,
    place: (p, o) => {
      o.position.copy(p.aux);
      o.rotation.set(-0.7, Math.PI + p.syaw, 0, 'YXZ');
    },
  },
];

export const OFFICE_KIT: Kit = { poser: officePoser, held, sleepy: ['deskdoze'] };
