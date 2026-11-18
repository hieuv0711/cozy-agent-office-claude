import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { paint, paintFlat, plank, smoothLathe, V } from './workshop-kit';

// Hand tools for the pegboards, each built flat against the board (lying in
// the xy plane, +z out of the board) at prop size, in three parts by material
// (steel, wooden handles, painted handles), with the silhouette painted behind
// it on the shadow board. x runs along the tool from its hanging end.

export type ToolParts = { steel: THREE.BufferGeometry[]; wood: THREE.BufferGeometry[]; paint: THREE.BufferGeometry[] };
/** A silhouette primitive, in the tool's own frame: a rectangle (centre, size) or a circle. */
export type Sil = { r: [number, number, number, number] } | { c: [number, number, number] };
export type Tool = { parts: () => ToolParts; sil: Sil[]; pegs: [number, number][] };

const empty = (): ToolParts => ({ steel: [], wood: [], paint: [] });

/** A turned handle along +x from x0, length len, max radius rad. */
function handle(x0: number, len: number, rad: number) {
  return smoothLathe(
    [
      [0, 0],
      [rad * 0.7, 0],
      [rad * 0.9, len * 0.08],
      [rad, len * 0.5],
      [rad * 0.92, len * 0.85],
      [rad * 0.75, len],
      [0, len],
    ],
    20,
    16,
  )
    .rotateZ(-Math.PI / 2)
    .translate(x0, 0, rad);
}

/** A flat steel plate from a 2D outline, `t` thick, its back on the board. */
function plate(shape: THREE.Shape, t: number) {
  return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelSize: Math.min(0.004, t * 0.4), bevelThickness: Math.min(0.003, t * 0.3), bevelSegments: 1, curveSegments: 10 });
}

const rect = (x: number, y: number, w: number, h: number): Sil => ({ r: [x, y, w, h] });
const circ = (x: number, y: number, rr: number): Sil => ({ c: [x, y, rr] });

export const TOOLS: Record<string, Tool> = {
  /** A panel saw: a tapering blade and a closed wooden handle. Hangs by the handle, blade pointing along +x. */
  saw: {
    parts: () => {
      const p = empty();
      const s = new THREE.Shape();
      s.moveTo(0.16, -0.075);
      s.lineTo(0.78, -0.03);
      s.lineTo(0.78, 0.04);
      s.lineTo(0.16, 0.075);
      s.closePath();
      p.steel.push(plate(s, 0.004).translate(0, 0, 0.012));
      const h = new THREE.Shape();
      h.moveTo(0.0, -0.06);
      h.quadraticCurveTo(-0.02, 0.0, 0.02, 0.08);
      h.lineTo(0.12, 0.09);
      h.quadraticCurveTo(0.2, 0.09, 0.2, 0.0);
      h.lineTo(0.19, -0.08);
      h.closePath();
      const hole = new THREE.Path();
      hole.moveTo(0.05, -0.03);
      hole.quadraticCurveTo(0.04, 0.05, 0.08, 0.055);
      hole.lineTo(0.13, 0.05);
      hole.quadraticCurveTo(0.15, 0.0, 0.14, -0.035);
      hole.closePath();
      h.holes.push(hole);
      p.wood.push(plate(h, 0.03).translate(0, 0, 0.0));
      for (const [x, y] of [
        [0.17, 0.03],
        [0.17, -0.03],
      ])
        p.steel.push(new THREE.CylinderGeometry(0.01, 0.01, 0.04, 10).rotateX(Math.PI / 2).translate(x, y, 0.015));
      return p;
    },
    sil: [rect(0.1, 0, 0.21, 0.18), rect(0.47, 0, 0.64, 0.13)],
    pegs: [[0.09, 0.0]],
  },
  /** A claw hammer, head at the top. */
  hammer: {
    parts: () => {
      const p = empty();
      p.wood.push(handle(0, 0.42, 0.022));
      const head = new THREE.Shape();
      head.moveTo(-0.025, -0.05);
      head.lineTo(0.025, -0.05);
      head.lineTo(0.03, 0.07);
      head.quadraticCurveTo(0.0, 0.14, -0.04, 0.17);
      head.lineTo(-0.035, 0.12);
      head.quadraticCurveTo(-0.02, 0.09, -0.025, 0.06);
      head.closePath();
      p.steel.push(plate(head, 0.04).translate(0.43, -0.06, 0.002));
      return p;
    },
    sil: [rect(0.2, 0, 0.42, 0.05), rect(0.43, 0, 0.09, 0.25)],
    pegs: [[0.38, -0.05], [0.38, 0.05]],
  },
  /** A carver's mallet: a round beech head on a short handle. */
  mallet: {
    parts: () => {
      const p = empty();
      p.wood.push(handle(0, 0.3, 0.018));
      p.wood.push(
        smoothLathe(
          [
            [0, 0],
            [0.045, 0],
            [0.06, 0.03],
            [0.065, 0.1],
            [0.055, 0.14],
            [0, 0.145],
          ],
          16,
          18,
        )
          .rotateZ(-Math.PI / 2)
          .translate(0.29, 0, 0.065),
      );
      return p;
    },
    sil: [rect(0.15, 0, 0.3, 0.04), circ(0.36, 0, 0.07)],
    pegs: [[0.27, -0.04], [0.27, 0.04]],
  },
  /** A chisel, blade down. */
  chisel: {
    parts: () => {
      const p = empty();
      p.wood.push(handle(0, 0.17, 0.018));
      p.steel.push(new THREE.CylinderGeometry(0.019, 0.019, 0.025, 14).rotateZ(Math.PI / 2).translate(0.18, 0, 0.018));
      const b = new THREE.Shape();
      b.moveTo(0.19, -0.01);
      b.lineTo(0.33, -0.016);
      b.lineTo(0.35, -0.016);
      b.lineTo(0.35, 0.016);
      b.lineTo(0.33, 0.016);
      b.lineTo(0.19, 0.01);
      b.closePath();
      p.steel.push(plate(b, 0.006).translate(0, 0, 0.012));
      return p;
    },
    sil: [rect(0.18, 0, 0.36, 0.045)],
    pegs: [[0.2, 0.0]],
  },
  /** A screwdriver with a painted handle. */
  driver: {
    parts: () => {
      const p = empty();
      const h = handle(0, 0.15, 0.02);
      p.paint.push(h);
      p.steel.push(tubeThrough([V(0.15, 0, 0.02), V(0.33, 0, 0.02)], () => 0.0055, 2, 8).geometry);
      p.steel.push(new THREE.BoxGeometry(0.02, 0.012, 0.004).translate(0.34, 0, 0.02));
      return p;
    },
    sil: [rect(0.17, 0, 0.35, 0.04)],
    pegs: [[0.16, 0.0]],
  },
  /** Pliers, jaws down. */
  pliers: {
    parts: () => {
      const p = empty();
      for (const s of [-1, 1]) {
        p.paint.push(tubeThrough([V(0.0, s * 0.04, 0.012), V(0.1, s * 0.03, 0.012), V(0.17, s * 0.012, 0.012)], (t) => 0.012 - t * 0.004, 10, 8).geometry);
        p.steel.push(tubeThrough([V(0.17, s * 0.01, 0.01), V(0.22, -s * 0.004, 0.01), V(0.27, -s * 0.002, 0.01)], (t) => 0.01 - t * 0.005, 8, 6).geometry);
      }
      p.steel.push(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 14).rotateX(Math.PI / 2).translate(0.19, 0, 0.012));
      return p;
    },
    sil: [rect(0.13, 0, 0.27, 0.1)],
    pegs: [[0.17, -0.025], [0.17, 0.025]],
  },
  /** A try square: a steel blade set in a rosewood stock with brass rivets. */
  square: {
    parts: () => {
      const p = empty();
      p.wood.push(plank(0.26, 0.05, 0.03, 0.006).translate(0.13, 0, 0.015));
      p.steel.push(new THREE.BoxGeometry(0.035, 0.32, 0.004).translate(0.0175, -0.18, 0.015));
      for (const x of [0.05, 0.13, 0.21]) p.steel.push(new THREE.CylinderGeometry(0.007, 0.007, 0.034, 8).rotateX(Math.PI / 2).translate(x, 0, 0.015));
      return p;
    },
    sil: [rect(0.13, 0, 0.27, 0.06), rect(0.02, -0.18, 0.05, 0.34)],
    pegs: [[0.22, 0.04]],
  },
  /** A brace: a cranked steel bow with a wooden head and a turned grip. */
  brace: {
    parts: () => {
      const p = empty();
      const pts = [V(0, 0, 0.03), V(0.06, 0, 0.03), V(0.09, 0.06, 0.03), V(0.12, 0.13, 0.03), V(0.2, 0.15, 0.03), V(0.28, 0.13, 0.03), V(0.31, 0.06, 0.03), V(0.34, 0, 0.03), V(0.42, 0, 0.03)];
      p.steel.push(tubeThrough(pts, () => 0.009, 40, 8).geometry);
      p.wood.push(
        smoothLathe(
          [
            [0, 0],
            [0.045, 0.01],
            [0.05, 0.03],
            [0.02, 0.05],
            [0, 0.05],
          ],
          12,
          18,
        )
          .rotateZ(Math.PI / 2)
          .translate(0.0, 0, 0.03),
      );
      p.wood.push(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 12).rotateZ(Math.PI / 2).translate(0.2, 0.15, 0.03));
      p.steel.push(new THREE.CylinderGeometry(0.018, 0.012, 0.06, 12).rotateZ(Math.PI / 2).translate(0.45, 0, 0.03));
      return p;
    },
    sil: [rect(0.22, 0.06, 0.48, 0.16)],
    pegs: [[0.2, 0.19]],
  },
  /** A coping saw: a deep U frame, a thin blade and a handle. */
  coping: {
    parts: () => {
      const p = empty();
      p.steel.push(tubeThrough([V(0.12, 0, 0.012), V(0.12, 0.17, 0.012), V(0.16, 0.2, 0.012), V(0.36, 0.2, 0.012), V(0.4, 0.17, 0.012), V(0.4, 0.0, 0.012)], () => 0.007, 30, 6).geometry);
      p.steel.push(new THREE.BoxGeometry(0.28, 0.006, 0.002).translate(0.26, 0.0, 0.012));
      p.wood.push(handle(0, 0.12, 0.018));
      return p;
    },
    sil: [rect(0.2, 0.1, 0.42, 0.24)],
    pegs: [[0.26, 0.23]],
  },
  /** An open-ended spanner. */
  spanner: {
    parts: () => {
      const p = empty();
      const s = new THREE.Shape();
      s.moveTo(0.0, -0.015);
      s.lineTo(0.2, -0.012);
      s.quadraticCurveTo(0.24, -0.04, 0.27, -0.03);
      s.lineTo(0.255, -0.01);
      s.lineTo(0.255, 0.01);
      s.lineTo(0.27, 0.03);
      s.quadraticCurveTo(0.24, 0.04, 0.2, 0.012);
      s.lineTo(0.0, 0.015);
      s.closePath();
      p.steel.push(plate(s, 0.008).translate(0, 0, 0.004));
      return p;
    },
    sil: [rect(0.13, 0, 0.28, 0.07)],
    pegs: [[0.1, 0.02]],
  },
  /** A wooden rule with brass ends, folded in two. */
  rule: {
    parts: () => {
      const p = empty();
      const g = plank(0.4, 0.04, 0.012, 0.003);
      paint(g, (x, y, _z, out) => {
        out.set('#e8d6a8');
        // tick marks along one edge (no numbers)
        const t = (x + 0.2) / 0.4;
        if (y > 0.008 && Math.floor(t * 64) % 2 === 0 && y > 0.02 - (Math.floor(t * 64) % 8 === 0 ? 0.02 : 0.008)) out.set('#2a2420');
      });
      p.paint.push(g.translate(0.2, 0, 0.006));
      p.paint.push(paintFlat(plank(0.4, 0.04, 0.012, 0.003), '#e8d6a8').translate(0.2, 0, 0.019));
      p.steel.push(new THREE.BoxGeometry(0.02, 0.042, 0.028).translate(0.0, 0, 0.012));
      return p;
    },
    sil: [rect(0.2, 0, 0.41, 0.05)],
    pegs: [[0.2, 0.04]],
  },
};

/** The handle colours a painted part can take. */
export const HANDLE_PAINT = ['#b8322a', '#e2a82e', '#2c5a8a', '#2e6a40', '#1e1a18'];
