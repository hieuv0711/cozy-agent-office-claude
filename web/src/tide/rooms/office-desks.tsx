import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { CHAIR_SEAT, inStationZone, STATIONS } from '../office/plan';
import { BACK_DESK, DESK, DESK_T, PANEL } from './office-dims';
import { meshSDF, type SDF } from '../../tank/sdf';
import { C, Merger, mix, noise3, omat, once, paint, paintLathe, plank, rand, smoothLathe, smoothstep, softDot, steelRough, trs, upholsteryTex, V, woodTex } from './office-kit';
import { boxProject, cushion, occlusion, sdRBox } from './office-sdf';
import { binderGeometry, bookend, bookRow, bookStack, penCup, propMats, smallPlant, stickyPad } from './office-props';

// The two rows of desks. At the front, one long oak bench desk on black steel
// trestles, a slatted oak modesty panel along its camera side (it hides the
// sitters' legs), a brass banker's lamp with a green glass shade between each
// pair of places. Along the back wall under the windows, a built-in oak desk
// on drawer pedestals with an anglepoise lamp at each place. An office chair
// at every station (seat at the station, its back away from the desk). The
// station zones on the desk tops are left clear: the people's laptops, phones,
// papers and mugs go there; the room's things sit between and behind them.

export function deskMats() {
  return {
    oak: omat('d:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('o-desk-oak', { w: 2048, h: 512, light: '#e0b47a', dark: '#6e4020', planks: 3, rings: 9, seed: 113, joints: false, seams: 0.9, figure: 1.1, pores: 1.4 }), roughness: 0.4, vertexColors: true })),
    slat: omat('d:slat', () => new THREE.MeshStandardMaterial({ map: woodTex('o-slat', { w: 256, h: 1024, light: '#c8955c', dark: '#7a4a26', planks: 1, rings: 9, seed: 117, joints: false, seams: 0 }), roughness: 0.55, vertexColors: true })),
    pedestal: omat('d:pedestal', () => new THREE.MeshStandardMaterial({ map: woodTex('o-pedestal', { w: 512, h: 256, light: '#cf9c62', dark: '#7e4c28', planks: 1, rings: 8, seed: 119, joints: false, seams: 0, figure: 0.35, warp: 0.5 }), roughness: 0.5, vertexColors: true })),
    steel: omat('d:steel', () => new THREE.MeshStandardMaterial({ color: '#1c1b1a', roughnessMap: steelRough(), roughness: 0.6, metalness: 0.55, vertexColors: true })),
    backing: omat('d:backing', () => new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.9 })),
    brass: omat('d:brass', () => new THREE.MeshStandardMaterial({ color: '#c09a54', metalness: 0.92, roughness: 0.28 })),
    upholstery: omat('d:upholstery', () => new THREE.MeshStandardMaterial({ map: upholsteryTex(), vertexColors: true, roughness: 0.86 })),
    chairMetal: omat('d:chair-metal', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.34 })),
    bankerGlass: omat('d:banker-glass', () => new THREE.MeshPhysicalMaterial({ color: '#1a5a30', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color('#1f6a36'), emissiveIntensity: 0.35, side: THREE.DoubleSide })),
    glowInside: omat('d:glow-inside', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9c4').multiplyScalar(1.2), side: THREE.DoubleSide })),
    bulb: omat('d:bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffdcaa').multiplyScalar(2.2), toneMapped: false })),
    enamel: omat('d:enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide })),
    pool: omat('d:pool', () => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ffb060').multiplyScalar(0.32), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
  };
}
export type DeskMats = ReturnType<typeof deskMats>;

// ---------- the front desk ----------

/** Where the trestles stand under the front desk (between places). */
const TRESTLES = [-7.08, -2.4, 2.4, 7.08];

function frontDeskGeometries() {
  const len = DESK.x1 - DESK.x0;
  const d = DESK.front - DESK.back;
  const cx = (DESK.x0 + DESK.x1) / 2;
  const cz = (DESK.back + DESK.front) / 2;
  const top = plank(len, DESK_T, d, 0.028, [1 / 4.2, 1 / d], 4, [0.13, 0.0]);
  paint(top, (x, _y, z, out) => {
    out.setScalar(0.94 + 0.08 * noise3(x * 0.7, 2, z * 2));
    // the edge where the sitters' arms rest is a little worn and darker with use
    mix(out, out, C('#7a5030'), smoothstep(-0.25, -0.5, z) * 0.12);
  });
  // the modesty panel: close vertical oak slats on a dark backing, in a black steel frame
  const slats = new Merger();
  const r = rand(5);
  const sw = 0.072;
  const n = Math.floor((len - 0.16) / (sw + 0.016));
  const span = n * (sw + 0.016);
  const h = PANEL.y1 - PANEL.y0 - 0.05;
  for (let i = 0; i < n; i++) {
    const x = cx - span / 2 + (i + 0.5) * (sw + 0.016);
    const g = plank(sw, h, 0.03, 0.009, [1 / 1.2, 1 / 2.4], 1, [r() * 3, r() * 3], true);
    const tone = 0.84 + r() * 0.3;
    paint(g, (_x, y, _z, out) => out.setScalar(tone * (1 - smoothstep(-h / 2 + 0.2, -h / 2, y) * 0.12)));
    slats.add(g, trs([x, PANEL.y0 + 0.03 + h / 2, PANEL.z + 0.02]));
  }
  const backing = new Merger().add(plank(len - 0.12, PANEL.y1 - PANEL.y0, 0.02, 0.005, 1, 1), trs([cx, (PANEL.y0 + PANEL.y1) / 2, PANEL.z - 0.012])).build();
  const steel = new Merger();
  // the panel's frame: a bottom rail and end posts
  steel.add(plank(len - 0.06, 0.035, 0.05, 0.008, 1, 1), trs([cx, PANEL.y0 + 0.0175, PANEL.z + 0.01]));
  // trestles between the places: two posts, a foot and a top rail each (nothing runs along under the desk, so the sitters' knees have room)
  for (const x of TRESTLES) {
    for (const z of [DESK.back + 0.12, DESK.front - 0.15]) steel.add(plank(0.055, DESK.top - DESK_T, 0.055, 0.01, 1, 1), trs([x, (DESK.top - DESK_T) / 2, z]));
    steel.add(plank(0.06, 0.035, d - 0.12, 0.01, 1, 1), trs([x, DESK.top - DESK_T - 0.0175, cz]));
    steel.add(plank(0.07, 0.04, d - 0.08, 0.012, 1, 1), trs([x, 0.02, cz]));
    // levelling feet
    for (const z of [DESK.back + 0.1, DESK.front - 0.13]) steel.add(new THREE.CylinderGeometry(0.03, 0.035, 0.015, 12), trs([x, 0.0075, z]));
  }
  const steelG = paint(steel.build(), (x, y, z, out) => out.setScalar(0.9 + 0.12 * noise3(x * 4, y * 4, z * 4)));
  return { top, slats: slats.build(), backing, steel: steelG, at: [cx, DESK.top - DESK_T / 2, cz] as [number, number, number] };
}

// ---------- the back desk ----------

const PEDESTALS = [-6.42, -2.0, 2.0, 6.42];

function backDeskGeometries() {
  const len = BACK_DESK.x1 - BACK_DESK.x0;
  const d = BACK_DESK.front - BACK_DESK.back;
  const cx = (BACK_DESK.x0 + BACK_DESK.x1) / 2;
  const cz = (BACK_DESK.back + BACK_DESK.front) / 2;
  const top = plank(len, DESK_T, d, 0.028, [1 / 4.2, 1 / d], 4, [0.61, 0.0]);
  paint(top, (x, _y, z, out) => {
    out.setScalar(0.92 + 0.1 * noise3(x * 0.6, 7, z * 2));
    // darker against the wall where the light doesn't reach
    out.multiplyScalar(1 - smoothstep(-5.9, -6.35, z) * 0.15);
  });
  const wood = new Merger();
  const brass = new Merger();
  const r = rand(9);
  const ph = BACK_DESK.top - DESK_T;
  for (const x of PEDESTALS) {
    const pw = 0.56;
    const pd = d - 0.08;
    const pz = BACK_DESK.back + pd / 2;
    // the carcass, and three drawer fronts proud of it
    const carcass = plank(pw, ph - 0.06, pd, 0.012, [1 / 1.2, 1 / 1.2], 1, [r(), r()], true);
    wood.add(paint(carcass, (_x, _y, _z, out) => out.setScalar(0.72)), trs([x, 0.06 + (ph - 0.06) / 2, pz]));
    const fronts = [0.2, 0.2, 0.28];
    let y = 0.075;
    for (let k = fronts.length - 1; k >= 0; k--) {
      const fh = fronts[k] - 0.012;
      const f = plank(pw - 0.03, fh, 0.03, 0.01, [1 / 1.2, 1 / 1.2], 2, [r() * 4, r() * 4]);
      const tone = 0.88 + r() * 0.22;
      wood.add(
        paint(f, (_x, _y, _z, out) => out.setScalar(tone)),
        trs([x, y + fh / 2, BACK_DESK.back + pd + 0.015]),
      );
      // a brass cup pull
      const pull = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI);
      brass.add(pull, trs([x, y + fh * 0.62, BACK_DESK.back + pd + 0.035]));
      y += fronts[k];
    }
    // a black plinth
    wood.add(paint(plank(pw - 0.04, 0.06, pd - 0.04, 0.008, 1, 1), (_x, _y, _z, out) => out.setScalar(0.18)), trs([x, 0.03, pz - 0.02]));
  }
  return { top, wood: wood.build(), brass: brass.build(), at: [cx, BACK_DESK.top - DESK_T / 2, cz] as [number, number, number] };
}

export function Desks() {
  const m = deskMats();
  const front = useMemo(() => once('office:front-desk', frontDeskGeometries), []);
  const back = useMemo(() => once('office:back-desk', backDeskGeometries), []);
  return (
    <group>
      <mesh geometry={front.top} material={m.oak} position={front.at} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={front.slats} material={m.slat} castShadow receiveShadow />
      <mesh geometry={front.backing} material={m.backing} receiveShadow />
      <mesh geometry={front.steel} material={m.steel} castShadow receiveShadow />
      <mesh geometry={back.top} material={m.oak} position={back.at} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={back.wood} material={m.pedestal} castShadow receiveShadow />
      <mesh geometry={back.brass} material={m.brass} />
      <Chairs m={m} />
      <DeskLamps m={m} />
      <DeskThings />
    </group>
  );
}

// ---------- office chairs ----------

/** Upholstery colours, one per station (the instance colour tints the woven cloth). */
const CHAIR_COLOURS = ['#c8922e', '#2f6f73', '#a8502e', '#6f7a3a', '#33456e', '#7a3a5a', '#2e5a3e', '#b5653f', '#4a5560'];

/**
 * A mid-century task chair, seat centre at the origin, the sitter facing +z:
 * a five-star base on twin-wheel casters, a gas lift, a plush seat with a
 * waterfall front, a curved upholstered back on a steel spine. Two parts:
 * the metal (black and chrome by vertex colour) and the cushions.
 */
export function chairGeometries() {
  return once('office:chair', () => {
    const metal = new Merger();
    const cush = new Merger();
    const black = C('#1e1d1c');
    const chrome = C('#d8dade');
    const seatTop = CHAIR_SEAT;
    // the star base: five tapered legs from a hub to the casters
    const hub = smoothLathe(
      [
        [0, 0.1],
        [0.075, 0.1],
        [0.085, 0.13],
        [0.06, 0.165],
        [0, 0.17],
      ],
      12,
      24,
    );
    metal.add(paintFlat(hub, black));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
      const leg = tubeThrough([V(0, 0.13, 0), V(Math.cos(a) * 0.18, 0.115, Math.sin(a) * 0.18), V(Math.cos(a) * 0.34, 0.085, Math.sin(a) * 0.34)], (t) => 0.026 - t * 0.008, 8, 8).geometry;
      metal.add(paintFlat(leg, chrome));
      // the caster: a socket, a hood and twin wheels
      const cx = Math.cos(a) * 0.35;
      const cz = Math.sin(a) * 0.35;
      metal.add(paintFlat(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 10), black), trs([cx, 0.075, cz]));
      metal.add(paintFlat(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), black), trs([cx, 0.046, cz], [0, -a, 0]));
      for (const s of [-1, 1]) {
        const wheel = new THREE.CylinderGeometry(0.034, 0.034, 0.018, 16).rotateZ(Math.PI / 2);
        metal.add(paintFlat(wheel, C('#2a2826')), trs([cx + Math.cos(a + Math.PI / 2) * 0.016 * s, 0.035, cz + Math.sin(a + Math.PI / 2) * 0.016 * s], [0, -a + Math.PI / 2, 0]));
      }
    }
    // the gas lift: a black shroud and the chrome column above it
    metal.add(paintFlat(new THREE.CylinderGeometry(0.038, 0.042, 0.16, 20), black), trs([0, 0.24, 0]));
    metal.add(paintFlat(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 16), chrome), trs([0, 0.38, 0]));
    // the seat plate and its mechanism box
    metal.add(paintFlat(plank(0.28, 0.05, 0.26, 0.012, 1, 1), black), trs([0, seatTop - 0.135, -0.02]));
    metal.add(paintFlat(plank(0.56, 0.02, 0.5, 0.01, 1, 1), black), trs([0, seatTop - 0.1, 0]));
    // a paddle under the seat
    metal.add(paintFlat(plank(0.12, 0.012, 0.025, 0.005, 1, 1), black), trs([0.2, seatTop - 0.13, 0.05], [0, -0.3, 0]));
    // the spine: from behind the seat plate, round and up to the back's shell
    const spine = tubeThrough([V(0, seatTop - 0.12, -0.16), V(0, seatTop - 0.11, -0.36), V(0, seatTop + 0.06, -0.49), V(0, seatTop + 0.3, -0.52)], () => 0.022, 16, 10).geometry;
    metal.add(paintFlat(spine, chrome));
    metal.add(paintFlat(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20).rotateX(Math.PI / 2), black), trs([0, seatTop + 0.36, -0.5], [-0.12, 0, 0]));
    // the seat: a plush cushion, crowned, its front edge rolled down
    const seatF = cushion(0, seatTop - 0.075, 0, 0.31, 0.05, 0.29, 0.045, 0.026);
    const seatSDF: SDF = (x, y, z) => seatF(x, y + Math.max(0, z - 0.18) * Math.max(0, z - 0.18) * 0.9, z);
    const seat = meshSDF(seatSDF, {
      min: [-0.33, seatTop - 0.15, -0.31],
      max: [0.33, seatTop + 0.03, 0.31],
      cell: 0.014,
      lipschitz: 1.6,
      paint: (x, y, z, nx, ny, nz, out) => {
        out.setScalar(0.92 + 0.1 * noise3(x * 8, y * 8, z * 8));
        // the welt round the edge, and the middle a touch paler with wear
        if (Math.abs(ny) < 0.35) out.multiplyScalar(0.8);
        out.multiplyScalar(1 + smoothstep(0.2, 0.0, Math.hypot(x, z)) * 0.06);
        out.multiplyScalar(0.7 + 0.3 * occlusion(seatSDF, x, y, z, nx, ny, nz, 0.03));
      },
    });
    cush.add(boxProject(seat, 2));
    // the back: an upholstered shell curved round the sitter, tufted with two buttons, piped round its edge
    const by = seatTop + 0.42;
    const bz = -0.43;
    const tilt = 0.12;
    const backSDF: SDF = (x, y, z) => {
      // into the back's own frame: tilted back, then bent round a vertical axis
      const dy = y - by;
      const dz = z - bz;
      const ly = dy * Math.cos(tilt) - dz * Math.sin(tilt);
      let lz = dy * Math.sin(tilt) + dz * Math.cos(tilt);
      lz -= x * x * 0.6;
      const u = Math.min(1, Math.abs(x) / 0.3);
      const v = Math.min(1, Math.abs(ly) / 0.23);
      const puff = lz > 0 ? 0.016 * (1 - u * u) * (1 - v * v) : 0;
      let d = sdRBox(x, ly, lz, 0.3, 0.23, 0.032 + puff, 0.028);
      for (const bx of [-0.12, 0.12]) d += 0.012 * Math.exp(-((x - bx) * (x - bx) + ly * ly) / 0.0006);
      return d;
    };
    const back = meshSDF(backSDF, {
      min: [-0.33, by - 0.28, bz - 0.08],
      max: [0.33, by + 0.28, bz + 0.16],
      cell: 0.012,
      lipschitz: 1.8,
      paint: (x, y, z, nx, ny, nz, out) => {
        out.setScalar(0.94 + 0.08 * noise3(x * 8, y * 8, z * 8));
        // the back face of the shell is darker, the piping darker still
        const facing = nx * 0 + ny * Math.sin(tilt) * -1 + nz;
        if (facing < -0.3) out.multiplyScalar(0.6);
        else if (facing < 0.45) out.multiplyScalar(0.72);
        out.multiplyScalar(0.72 + 0.28 * occlusion(backSDF, x, y, z, nx, ny, nz, 0.025));
      },
    });
    cush.add(boxProject(back, 2));
    return { metal: metal.build(), cushions: cush.build() };
  });
}

function paintFlat(g: THREE.BufferGeometry, c: THREE.Color) {
  return paint(g, (_x, _y, _z, out) => out.copy(c));
}

function Chairs({ m }: { m: DeskMats }) {
  const g = chairGeometries();
  const metal = useRef<THREE.InstancedMesh>(null);
  const cush = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    STATIONS.forEach((s, i) => {
      // each chair turned a touch off square, as people leave them
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw + ((i * 37) % 7) * 0.025 - 0.07);
      mtx.compose(new THREE.Vector3(s.x, 0, s.z), q, one);
      metal.current?.setMatrixAt(i, mtx);
      cush.current?.setMatrixAt(i, mtx);
      cush.current?.setColorAt(i, col.set(CHAIR_COLOURS[i % CHAIR_COLOURS.length]));
    });
    if (metal.current) metal.current.instanceMatrix.needsUpdate = true;
    if (cush.current) {
      cush.current.instanceMatrix.needsUpdate = true;
      if (cush.current.instanceColor) cush.current.instanceColor.needsUpdate = true;
    }
  }, []);
  return (
    <group>
      <instancedMesh ref={metal} args={[g.metal, m.chairMetal, STATIONS.length]} castShadow receiveShadow />
      <instancedMesh ref={cush} args={[g.cushions, m.upholstery, STATIONS.length]} castShadow receiveShadow />
    </group>
  );
}

// ---------- desk lamps ----------

/**
 * A banker's lamp, its base at the origin and its shade lying along x: a
 * stepped brass base, a stem with a curved arm, a green cased-glass shade
 * (white and lit inside) with a brass collar, a pull chain.
 */
export function bankerGeometries() {
  return once('office:banker', () => {
    const brass = new Merger();
    brass.add(
      smoothLathe(
        [
          [0, 0],
          [0.13, 0],
          [0.136, 0.01],
          [0.128, 0.026],
          [0.1, 0.034],
          [0.07, 0.05],
          [0.03, 0.06],
          [0.02, 0.07],
          [0, 0.07],
        ],
        20,
        36,
      ).scale(1.25, 1, 0.85),
    );
    // the stem straight up into the shade's middle, a yoke cradling it
    brass.add(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 14), trs([0, 0.21, 0]));
    brass.add(smoothLathe([[0, 0], [0.028, 0], [0.03, 0.012], [0.02, 0.03], [0, 0.032]], 8, 16), trs([0, 0.055, 0]));
    brass.add(plank(0.07, 0.022, 0.18, 0.008, 1, 1), trs([0, 0.365, 0]));
    // the pull chain with its bead
    brass.add(tubeThrough([V(0.12, 0.31, 0.03), V(0.12, 0.2, 0.035)], () => 0.004, 4, 4).geometry);
    brass.add(new THREE.SphereGeometry(0.014, 10, 8), trs([0.12, 0.195, 0.035]));
    // the shade: a long half-round of cased glass, closed at both ends
    const outer = new THREE.Shape();
    const R = 0.15;
    const Rin = 0.138;
    outer.moveTo(-R, 0);
    outer.absarc(0, 0, R, Math.PI, 0, true);
    outer.lineTo(Rin, 0);
    outer.absarc(0, 0, Rin, 0, Math.PI, false);
    outer.closePath();
    const L = 0.5;
    const shade = new THREE.ExtrudeGeometry(outer, { depth: L, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 20 });
    shade.translate(0, 0, -L / 2).rotateY(Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.37, 0);
    // end caps (the shade's ends are closed half-discs)
    const cap = new THREE.CircleGeometry(R, 20, 0, Math.PI).scale(1, 0.62, 1);
    const caps = new Merger();
    for (const s of [-1, 1]) caps.add(cap.clone(), trs([(s * L) / 2, 0.37, 0], [0, (s * Math.PI) / 2, 0]));
    // the lit underside: a half-cylinder just inside the shade
    const inner = new THREE.CylinderGeometry(Rin - 0.004, Rin - 0.004, L - 0.02, 20, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.37, 0);
    // two tubular bulbs either side of the stem
    const bulb = new Merger()
      .add(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 12).rotateZ(Math.PI / 2), trs([-0.12, 0.335, 0]))
      .add(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 12).rotateZ(Math.PI / 2), trs([0.12, 0.335, 0]))
      .build();
    return { brass: brass.build(), shade: new Merger().add(shade).add(caps.build()).build(), inner, bulb };
  });
}

const ANGLE_COLOURS = ['#e8dcc4', '#8a2a22', '#2e4660'];

/**
 * An anglepoise lamp, its base at the origin, reaching toward +z: a heavy
 * stepped base, two parallel lower arms with their springs, an upper arm, a
 * conical enamel head looking down at the desk, the bulb in its mouth.
 */
export function anglepoiseGeometries(v: number, reach = 1) {
  return once(`office:anglepoise:${v}:${reach}`, () => {
    const enamel = new Merger();
    const steel = new Merger();
    const col = C(ANGLE_COLOURS[v % ANGLE_COLOURS.length]);
    const dark = C('#1c1b1a');
    const base = smoothLathe(
      [
        [0, 0],
        [0.15, 0],
        [0.155, 0.012],
        [0.14, 0.04],
        [0.11, 0.05],
        [0.09, 0.075],
        [0.05, 0.085],
        [0, 0.088],
      ],
      18,
      36,
    );
    enamel.add(paint(base, (x, y, z, out) => out.copy(col).multiplyScalar(0.9 + 0.1 * noise3(x * 30, y * 30, z * 30))));
    const pivot = V(0, 0.11, 0);
    const elbow = V(0, 0.68, 0.16 * reach);
    const head = V(0, 0.8, 0.5 * reach);
    for (const s of [-1, 1]) {
      steel.add(tubeThrough([pivot.clone().add(V(s * 0.025, 0, 0)), elbow.clone().add(V(s * 0.025, 0, 0))], () => 0.009, 2, 8).geometry);
      // the springs: tight coils beside the lower arm
      const pts: THREE.Vector3[] = [];
      const a0 = V(s * 0.06, 0.16, 0.0);
      const a1 = V(s * 0.06, 0.42, 0.08 * reach);
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const p = a0.clone().lerp(a1, t);
        const ang = t * Math.PI * 2 * 22;
        p.x += Math.cos(ang) * 0.012;
        p.z += Math.sin(ang) * 0.012;
        pts.push(p);
      }
      steel.add(tubeThrough(pts, () => 0.003, 240, 4).geometry);
    }
    steel.add(tubeThrough([elbow, head], () => 0.01, 2, 8).geometry);
    steel.add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 14).rotateZ(Math.PI / 2), trs([elbow.x, elbow.y, elbow.z]));
    steel.add(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 14).rotateZ(Math.PI / 2), trs([0, pivot.y, 0]));
    // the head: a cone opening downward and forward
    const shade = smoothLathe(
      [
        [0.0, 0.11],
        [0.04, 0.11],
        [0.05, 0.08],
        [0.06, 0.03],
        [0.1, -0.06],
        [0.13, -0.12],
        [0.134, -0.13],
        [0.124, -0.128],
        [0.092, -0.06],
        [0.05, 0.02],
        [0.0, 0.05],
      ],
      30,
      32,
    );
    const n = 30;
    paintLathe(shade, n, (x, y, z, along, out) => {
      if (along < 0.62) out.copy(col).multiplyScalar(0.92 + 0.1 * noise3(x * 30, y * 30, z * 30));
      else out.set('#f4efe4');
    });
    const tilt = 2.3;
    const headM = trs([head.x, head.y, head.z], [tilt, 0, 0]);
    enamel.add(shade, headM);
    steel.add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12).rotateZ(Math.PI / 2), trs([head.x, head.y, head.z]));
    const bulb = new THREE.SphereGeometry(0.045, 16, 10).applyMatrix4(new THREE.Matrix4().multiplyMatrices(headM, trs([0, -0.06, 0])));
    return { enamel: enamel.build(), steel: paint(steel.build(), (_x, _y, _z, out) => out.copy(dark)), bulb, mouth: new THREE.Vector3(0, -0.13, 0).applyMatrix4(headM) };
  });
}

/** The front desk's banker's lamps sit in the gaps between places; the back desk's anglepoises stand against the wall. */
const BANKERS = [-7.08, -4.8, -2.4, 2.4, 4.8, 7.08];
const BANKER_Z = -0.62;
const ANGLES = STATIONS.filter((s) => s.yaw !== 0).map((s, i) => ({ x: s.x - 0.8, z: BACK_DESK.back + 0.22, yaw: 0.55, v: i }));

function DeskLamps({ m }: { m: DeskMats }) {
  const banker = bankerGeometries();
  const geo = useMemo(
    () =>
      once('office:desk-lamps', () => {
        const brass = new Merger();
        const glass = new Merger();
        const inner = new Merger();
        const bulbs = new Merger();
        for (const x of BANKERS) {
          const mtx = trs([x, DESK.top, BANKER_Z], [0, (x * 13) % 0.2, 0]);
          brass.add(banker.brass, mtx);
          glass.add(banker.shade, mtx);
          inner.add(banker.inner, mtx);
          bulbs.add(banker.bulb, mtx);
        }
        const enamel = new Merger();
        const steel = new Merger();
        for (const a of ANGLES) {
          const g = anglepoiseGeometries(a.v);
          const mtx = trs([a.x, BACK_DESK.top, a.z], [0, a.yaw, 0]);
          enamel.add(g.enamel, mtx);
          steel.add(g.steel, mtx);
          bulbs.add(g.bulb, mtx);
        }
        return { brass: brass.build(), glass: glass.build(), inner: inner.build(), bulbs: bulbs.build(), enamel: enamel.build(), steel: steel.build() };
      }),
    [banker],
  );
  return (
    <group>
      <mesh geometry={geo.brass} material={m.brass} castShadow />
      <mesh geometry={geo.glass} material={m.bankerGlass} castShadow />
      <mesh geometry={geo.inner} material={m.glowInside} />
      <mesh geometry={geo.bulbs} material={m.bulb} />
      <mesh geometry={geo.enamel} material={m.enamel} castShadow />
      <mesh geometry={geo.steel} material={m.chairMetal} castShadow />
      {/* the lamps' warm pools on the desk tops */}
      {BANKERS.map((x) => (
        <mesh key={x} material={m.pool} position={[x, DESK.top + 0.002, BANKER_Z + 0.05]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.5, 1.05, 1]} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      {ANGLES.map((a) => (
        <mesh key={a.x} material={m.pool} position={[a.x + Math.sin(a.yaw) * 0.55, BACK_DESK.top + 0.002, a.z + Math.cos(a.yaw) * 0.55]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1.4, 1]} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- things on the desks (outside the station zones) ----------

type Thing = { kind: 'plant' | 'pens' | 'sticky' | 'stack' | 'row' | 'binders' | 'bookend'; x: number; y: number; z: number; r: number; seed: number; len?: number; colour?: string };

const FT = DESK.top;
const BT = BACK_DESK.top;
/** The back desk's strip against the wall, behind the zones. */
const WALL_Z = BACK_DESK.back + 0.18;

const THINGS: Thing[] = [
  // the front desk: a succulent in the middle gap, little things along the front edge
  { kind: 'plant', x: 0, y: FT, z: -0.66, r: 0.3, seed: 0 },
  { kind: 'stack', x: -5.05, y: FT, z: -0.16, r: 0.25, seed: 3 },
  { kind: 'sticky', x: -2.05, y: FT, z: -0.13, r: -0.2, seed: 1, colour: '#f2d24a' },
  { kind: 'pens', x: 2.0, y: FT, z: -0.15, r: 0.4, seed: 1 },
  { kind: 'plant', x: 5.1, y: FT, z: -0.16, r: 0.9, seed: 1 },
  { kind: 'sticky', x: 3.05, y: FT, z: -0.12, r: 0.35, seed: 2, colour: '#f29aa0' },
  // the back desk: books between bookends, binders, a pen cup, plants, pads, behind and between the places
  { kind: 'bookend', x: -6.75, y: BT, z: WALL_Z, r: 0, seed: 0 },
  { kind: 'row', x: -6.68, y: BT, z: WALL_Z - 0.02, r: 0, seed: 21, len: 1.05 },
  { kind: 'bookend', x: -5.55, y: BT, z: WALL_Z, r: Math.PI, seed: 0 },
  { kind: 'plant', x: -2.6, y: BT, z: -5.72, r: 0.2, seed: 2 },
  { kind: 'pens', x: -1.55, y: BT, z: -5.55, r: 0.1, seed: 2 },
  { kind: 'sticky', x: -2.05, y: BT, z: -5.45, r: 0.5, seed: 3, colour: '#9ad0e0' },
  { kind: 'binders', x: 1.35, y: BT, z: WALL_Z, r: 0, seed: 0 },
  { kind: 'stack', x: 2.55, y: BT, z: -5.6, r: -0.4, seed: 7 },
  { kind: 'plant', x: 0.55, y: BT, z: WALL_Z - 0.02, r: 1.2, seed: 3 },
  { kind: 'row', x: 4.3, y: BT, z: WALL_Z - 0.02, r: 0, seed: 33, len: 0.7 },
];

function DeskThings() {
  const p = propMats();
  const geo = useMemo(
    () =>
      once('office:desk-things', () => {
        const vc = new Merger();
        const glaze = new Merger();
        const leaf = new Merger();
        const metal = new Merger();
        const paper = new Merger();
        for (const t of THINGS) {
          const mtx = trs([t.x, t.y, t.z], [0, t.r, 0]);
          if (import.meta.env.DEV && inStationZone(t.x, t.z, 0.05)) console.warn('office: desk thing in a station zone', t);
          if (t.kind === 'plant') {
            const g = smallPlant(t.seed);
            (g.glazed ? glaze : vc).add(g.pot, mtx);
            vc.add(g.soil, mtx);
            leaf.add(g.plant, mtx);
          } else if (t.kind === 'pens') {
            const g = penCup(t.seed);
            glaze.add(g.cup, mtx);
            vc.add(g.sticks, mtx);
          } else if (t.kind === 'sticky') paper.add(stickyPad(t.colour ?? '#f2d24a', t.seed), mtx);
          else if (t.kind === 'stack') vc.add(bookStack(2 + (t.seed % 2), t.seed, 0.8), mtx);
          else if (t.kind === 'row') vc.add(bookRow(t.len ?? 1, t.seed, { hMin: 0.3, hMax: 0.42, d: 0.26 }), mtx);
          else if (t.kind === 'bookend') metal.add(bookend(), mtx);
          else if (t.kind === 'binders') {
            ['#2a4a6a', '#7a2a22', '#2a2a2e', '#c8a040'].forEach((c, i) => vc.add(binderGeometry(c, 0.48), new THREE.Matrix4().multiplyMatrices(mtx, trs([i * 0.105, 0, 0], [0, 0, i === 3 ? -0.12 : 0]))));
          }
        }
        return { vc: vc.build(), glaze: glaze.build(), leaf: leaf.build(), metal: metal.build(), paper: paper.build() };
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={geo.vc} material={p.vc} castShadow receiveShadow />
      <mesh geometry={geo.glaze} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={geo.leaf} material={p.leaf} castShadow />
      <mesh geometry={geo.metal} material={p.metal} castShadow />
      <mesh geometry={geo.paper} material={p.paper} castShadow receiveShadow />
    </group>
  );
}
