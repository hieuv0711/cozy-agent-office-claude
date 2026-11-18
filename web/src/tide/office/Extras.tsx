import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeParts, paintGeometry } from '../../tank/geo';
import { cached } from '../../tank/sdf';
import { noise3, smoothstep } from '../../tank/util';
import { sessionColor } from '../../theme';
import type { Placement } from '../crew/Crew';
import { finishedFor, placeUse } from '../crew/signals';

// The office's own working things, following the people:
//   the printer by the door, which prints while someone waits at it (a page
//   slides out every few seconds, its light blinks);
//   the task board on the right wall: a note for everyone working ("doing"),
//   a yellow one for everyone waiting on you, and a note in "done" for every
//   turn finished today (someone walks over and moves it when they finish).

/** Where the printer stands, and the board hangs (world units). */
export const PRINTER = { x: 8.15, z: -6.06 };
export const BOARD = { x: 12.5, y: 1.85, z: -3.8, w: 2.1, h: 1.5 };

function roundedBox(w: number, h: number, d: number, r: number) {
  const s = new THREE.Shape();
  const x = w / 2 - r;
  const z = d / 2 - r;
  s.moveTo(-x, -d / 2);
  s.lineTo(x, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -z);
  s.lineTo(w / 2, z);
  s.quadraticCurveTo(w / 2, d / 2, x, d / 2);
  s.lineTo(-x, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, z);
  s.lineTo(-w / 2, -z);
  s.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
  const bevel = Math.min(h * 0.3, r * 0.6);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  return g;
}

// ---------- the printer ----------

function printerGeometries() {
  return {
    cabinet: cached('office-printer-cabinet', () => {
      const body = roundedBox(0.95, 0.76, 0.6, 0.03);
      paintGeometry(body, (x, y, z, out) => {
        // walnut, two doors with a shadow line between them
        const grain = 0.5 + 0.5 * Math.sin(y * 70 + noise3(x * 8, y * 30, z * 8) * 3);
        out.setRGB(0.42, 0.27, 0.17).multiplyScalar(0.82 + 0.18 * grain);
        if (z > 0.28 && Math.abs(x) < 0.008 && y > 0.06) out.multiplyScalar(0.55);
        if (z > 0.28 && y < 0.05) out.multiplyScalar(0.7);
      });
      const knobs = [-1, 1].map((sx) => new THREE.SphereGeometry(0.018, 10, 8).translate(sx * 0.06, 0.5, 0.31));
      knobs.forEach((k) => paintGeometry(k, (_x, _y, _z, out) => out.setRGB(0.85, 0.66, 0.32)));
      return mergeParts([body, ...knobs], ['position', 'normal', 'color']);
    }),
    printer: cached('office-printer-body', () => {
      const base = roundedBox(0.72, 0.24, 0.5, 0.05).translate(0, 0.0, 0);
      paintGeometry(base, (_x, y, z, out) => {
        out.setRGB(0.86, 0.85, 0.82);
        // the paper drawer at the bottom front, the output slot near the top
        if (z > 0.22 && y < 0.08) out.multiplyScalar(0.88);
        if (z > 0.22 && y > 0.155 && y < 0.175) out.setRGB(0.12, 0.12, 0.13);
      });
      const lid = roundedBox(0.66, 0.06, 0.42, 0.04).translate(0, 0.24, -0.02);
      paintGeometry(lid, (_x, _y, _z, out) => out.setRGB(0.32, 0.33, 0.36));
      const panel = new THREE.BoxGeometry(0.16, 0.02, 0.08).rotateX(-0.5).translate(0.22, 0.25, 0.2);
      paintGeometry(panel, (_x, _y, _z, out) => out.setRGB(0.2, 0.21, 0.24));
      const tray = new THREE.BoxGeometry(0.44, 0.012, 0.22).rotateX(0.12).translate(0, 0.12, 0.33);
      paintGeometry(tray, (_x, _y, _z, out) => out.setRGB(0.3, 0.31, 0.34));
      return mergeParts([base, lid, panel, tray], ['position', 'normal', 'color']);
    }),
    sheet: cached('office-printer-sheet', () => {
      const g = new THREE.PlaneGeometry(0.3, 0.4, 2, 4).rotateX(-Math.PI / 2);
      paintGeometry(g, (x, _y, z, out) => {
        out.setRGB(0.97, 0.96, 0.93);
        // lines of print, nothing readable
        if (Math.abs(Math.sin(z * 90)) > 0.75 && Math.abs(x) < 0.11 && z > -0.16 && z < 0.15) out.setRGB(0.55, 0.57, 0.63);
      });
      return g;
    }),
  };
}

function Printer() {
  const g = useMemo(printerGeometries, []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), []);
  const plastic = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }), []);
  const paper = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), []);
  const light = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#6dff9a').multiplyScalar(1.6), toneMapped: false }), []);
  const sheet = useRef<THREE.Mesh>(null);
  const stack = useRef<THREE.Group>(null);
  const led = useRef<THREE.Mesh>(null);
  const st = useRef({ t: 0, pages: 0 });
  useFrame((_, delta) => {
    const u = placeUse.get('printer');
    const printing = !!u && u.act === 'printwait';
    const S = st.current;
    if (printing) S.t += Math.min(0.1, delta);
    // a page every 1.5 seconds: it slides out of the slot and drops on the tray
    const ph = (S.t % 1.5) / 1.5;
    if (sheet.current) {
      sheet.current.visible = printing;
      const out = smoothstep(0.0, 0.7, ph);
      sheet.current.position.set(0, 0.165 + 0.02 * (1 - out), 0.05 + out * 0.3);
      sheet.current.rotation.x = 0.15 * (1 - out);
    }
    if (printing && ph > 0.95) S.pages = Math.min(8, S.pages + 1 / 3);
    // taken away while nobody's printing
    if (!printing) S.pages = Math.max(0, S.pages - delta * 2);
    if (stack.current) {
      const n = Math.floor(S.pages);
      stack.current.children.forEach((c, i) => (c.visible = i < n));
    }
    if (led.current) (led.current.material as THREE.MeshBasicMaterial).color.setScalar(printing ? (Math.sin(S.t * 9) > 0 ? 1.6 : 0.4) : 0.5).multiply(new THREE.Color('#6dff9a'));
  });
  return (
    <group position={[PRINTER.x, 0, PRINTER.z]}>
      <mesh geometry={g.cabinet} material={wood} castShadow receiveShadow userData={{ surface: 'top' }} />
      <group position={[0, 0.76, 0.02]}>
        <mesh geometry={g.printer} material={plastic} castShadow receiveShadow />
        <mesh ref={led} material={light} position={[0.27, 0.262, 0.215]}>
          <sphereGeometry args={[0.012, 8, 6]} />
        </mesh>
        <mesh ref={sheet} geometry={g.sheet} material={paper} visible={false} />
        <group ref={stack} position={[0, 0.135, 0.33]} rotation={[0.12, 0, 0]}>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} geometry={g.sheet} material={paper} position={[(i % 2) * 0.006, 0.004 + i * 0.002, 0.08 + (i % 3) * 0.004]} visible={false} />
          ))}
        </group>
      </group>
    </group>
  );
}

// ---------- the task board ----------

const COLS = 3;
const PER_COL = 12;
const NOTE = 0.17;

function boardGeometries() {
  return {
    frame: cached('office-board-frame', () => {
      const parts: THREE.BufferGeometry[] = [];
      const { w, h } = BOARD;
      const t = 0.045;
      parts.push(new THREE.BoxGeometry(w + t * 2, t, 0.05).translate(0, h / 2 + t / 2, 0.025));
      parts.push(new THREE.BoxGeometry(w + t * 2, t, 0.05).translate(0, -h / 2 - t / 2, 0.025));
      parts.push(new THREE.BoxGeometry(t, h, 0.05).translate(w / 2 + t / 2, 0, 0.025));
      parts.push(new THREE.BoxGeometry(t, h, 0.05).translate(-w / 2 - t / 2, 0, 0.025));
      // the marker ledge
      parts.push(new THREE.BoxGeometry(w * 0.6, 0.03, 0.09).translate(0, -h / 2 - t - 0.012, 0.05));
      const g = mergeParts(parts, ['position', 'normal']);
      paintGeometry(g, (_x, _y, _z, out) => out.setRGB(0.72, 0.73, 0.76));
      return g;
    }),
    face: cached('office-board-face', () => {
      const g = new THREE.PlaneGeometry(BOARD.w, BOARD.h, 30, 16);
      paintGeometry(g, (x, y, _z, out) => {
        // white enamel, faint ghosts of old marker, the column lines, coloured headers
        out.setRGB(0.95, 0.95, 0.93).multiplyScalar(0.97 + 0.03 * noise3(x * 3, y * 3, 0.5));
        const col = (x + BOARD.w / 2) / (BOARD.w / COLS);
        const edge = Math.abs(col - Math.round(col));
        if (edge < 0.012 && Math.round(col) > 0 && Math.round(col) < COLS) out.setRGB(0.55, 0.57, 0.62);
        if (y > BOARD.h / 2 - 0.17) {
          const c = Math.floor(col);
          const hdr = [
            [0.36, 0.55, 0.85],
            [1.0, 0.84, 0.3],
            [0.42, 0.72, 0.48],
          ][Math.max(0, Math.min(2, c))];
          out.setRGB(hdr[0], hdr[1], hdr[2]);
        }
      });
      return g;
    }),
    note: cached('office-board-note', () => {
      const g = new THREE.PlaneGeometry(NOTE, NOTE, 2, 2);
      const p = g.attributes.position;
      // the bottom edge curls off the board a little
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setZ(i, 0.012);
      g.computeVertexNormals();
      return g;
    }),
  };
}

/** Note slots in a column: rows of three, top to bottom, slightly askew. */
function slot(col: number, i: number): [number, number, number] {
  const cw = BOARD.w / COLS;
  const x = -BOARD.w / 2 + cw * col + cw * (0.2 + (i % 3) * 0.3);
  const y = BOARD.h / 2 - 0.3 - Math.floor(i / 3) * 0.21;
  return [x, y, ((i * 37) % 7) / 7 - 0.5];
}

function TaskBoard({ placed }: { placed: Placement[] }) {
  const g = useMemo(boardGeometries, []);
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.5, roughness: 0.35 }), []);
  const face = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), []);
  const notes = useMemo(() => Array.from({ length: COLS * PER_COL }, () => new THREE.MeshStandardMaterial({ color: '#ffe27a', roughness: 0.85, side: THREE.DoubleSide })), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const live = useRef(placed);
  live.current = placed;
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.4) return;
    last.current = clock.elapsedTime;
    const p = live.current.filter((x) => !x.departing);
    const doing = p.filter((x) => x.s.status === 'working').map((x) => sessionColor(x.s.id));
    const waiting = p.filter((x) => x.s.status === 'needs-you').map(() => '#ffd84a');
    const done = finishedFor('office').colors.slice(-PER_COL);
    [doing, waiting, done].forEach((list, col) => {
      for (let i = 0; i < PER_COL; i++) {
        const m = refs.current[col * PER_COL + i];
        if (!m) continue;
        const c = list[i];
        m.visible = !!c;
        if (!c) continue;
        notes[col * PER_COL + i].color.set(c).lerp(new THREE.Color('#fff8e6'), 0.25);
      }
    });
  });
  return (
    <group position={[BOARD.x - 0.012, BOARD.y, BOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh geometry={g.frame} material={frame} castShadow />
      <mesh geometry={g.face} material={face} position={[0, 0, 0.012]} receiveShadow />
      {Array.from({ length: COLS * PER_COL }, (_, k) => {
        const col = Math.floor(k / PER_COL);
        const [x, y, r] = slot(col, k % PER_COL);
        return <mesh key={k} ref={(m) => void (refs.current[k] = m)} geometry={g.note} material={notes[k]} position={[x, y, 0.02]} rotation={[0, 0, r * 0.12]} visible={false} />;
      })}
    </group>
  );
}

export function OfficeExtras({ placed }: { placed: Placement[] }) {
  return (
    <>
      <Printer />
      <TaskBoard placed={placed} />
    </>
  );
}
