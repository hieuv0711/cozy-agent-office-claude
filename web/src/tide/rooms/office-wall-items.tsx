import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Merger, omat, once, paint, plank, rand, roundRect, slab, smoothLathe, tex, trs, variant, woodTex } from './office-kit';

// Things that hang on the office's walls: framed prints, an industrial wall
// clock that keeps real time, a whiteboard of diagrams and a corkboard of
// pinned notes. Each hangs with its back on the wall at the origin, facing +z.
// Nothing on them is readable: marks, shapes and scribbles only.

function wallMats() {
  return {
    black: omat('w:black', () => new THREE.MeshStandardMaterial({ color: '#1c1b1a', roughness: 0.45, metalness: 0.3 })),
    oak: omat('w:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('o-frame-oak', { w: 512, h: 128, light: '#c8955c', dark: '#7a4a26', planks: 1, rings: 8, seed: 171, joints: false, seams: 0 }), roughness: 0.5 })),
    walnut: omat('w:walnut', () => new THREE.MeshStandardMaterial({ map: woodTex('o-frame-walnut', { w: 512, h: 128, light: '#7a4e30', dark: '#2a160c', planks: 1, rings: 8, seed: 173, joints: false, seams: 0 }), roughness: 0.45 })),
    brass: omat('w:brass', () => new THREE.MeshStandardMaterial({ color: '#c09a54', metalness: 0.92, roughness: 0.3, side: THREE.DoubleSide })),
    alu: omat('w:alu', () => new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.85, roughness: 0.35 })),
    steel: omat('w:steel', () => new THREE.MeshStandardMaterial({ color: '#3a3c3e', metalness: 0.7, roughness: 0.4 })),
    glass: omat('w:glass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, roughness: 0.06, clearcoat: 1, depthWrite: false })),
    vc: omat('w:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })),
    mat: omat('w:mat', () => new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.9 })),
  };
}

// ---------- framed prints ----------

const PRINTS = ['arches', 'dusk', 'leaf', 'blocks'] as const;

function paper(g: CanvasRenderingContext2D, w: number, h: number, tone: string, seed: number) {
  g.fillStyle = tone;
  g.fillRect(0, 0, w, h);
  const r = rand(seed);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '120,100,70' : '255,255,250'},${0.03 + r() * 0.05})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Screen-printed look: flat shapes with a slight mis-registration and paper grain over them. */
function printTex(kind: (typeof PRINTS)[number]) {
  return tex(
    `o-print-${kind}`,
    512,
    640,
    (g, w, h) => {
      const r = rand(kind.length * 13);
      if (kind === 'arches') {
        paper(g, w, h, '#efe3cc', 3);
        const cols = ['#c0603a', '#d8a040', '#3e6a6a', '#e6c8a8', '#7a3a2a'];
        for (let i = 0; i < 5; i++) {
          const R = w * (0.42 - i * 0.075);
          g.fillStyle = cols[i];
          g.beginPath();
          g.arc(w / 2 + (i % 2) * 3, h * 0.72, R, Math.PI, 0);
          g.lineTo(w / 2 + R, h * 0.72);
          g.fill();
        }
        g.fillStyle = '#d8a040';
        g.beginPath();
        g.arc(w * 0.72, h * 0.22, w * 0.09, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3a2a22';
        g.fillRect(w * 0.08, h * 0.72, w * 0.84, 6);
      } else if (kind === 'dusk') {
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#2a3a5a');
        sky.addColorStop(0.5, '#c87a5a');
        sky.addColorStop(0.7, '#f0c890');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffe2b0';
        g.beginPath();
        g.arc(w * 0.62, h * 0.52, w * 0.1, 0, Math.PI * 2);
        g.fill();
        const layers = ['#6a4a5a', '#4a3a4e', '#2e2a3a', '#1c1a26'];
        layers.forEach((c, i) => {
          g.fillStyle = c;
          g.beginPath();
          g.moveTo(0, h);
          let y = h * (0.55 + i * 0.09);
          g.lineTo(0, y);
          for (let x = 0; x <= w; x += 16) {
            y += (r() - 0.5) * 30;
            y = Math.max(h * (0.45 + i * 0.08), Math.min(h * (0.75 + i * 0.06), y));
            g.lineTo(x, y);
          }
          g.lineTo(w, h);
          g.fill();
        });
        for (let i = 0; i < 2500; i++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,220'},${0.03 + r() * 0.04})`;
          g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
        }
      } else if (kind === 'leaf') {
        paper(g, w, h, '#ece4d0', 5);
        g.fillStyle = '#2f5a3a';
        g.beginPath();
        g.moveTo(w / 2, h * 0.9);
        g.bezierCurveTo(w * 0.05, h * 0.75, w * 0.08, h * 0.2, w / 2, h * 0.08);
        g.bezierCurveTo(w * 0.92, h * 0.2, w * 0.95, h * 0.75, w / 2, h * 0.9);
        g.fill();
        g.strokeStyle = '#ece4d0';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(w / 2, h * 0.92);
        g.lineTo(w / 2, h * 0.12);
        g.stroke();
        g.lineWidth = 3;
        for (let i = 0; i < 7; i++) {
          const y = h * (0.75 - i * 0.085);
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(w / 2, y);
            g.quadraticCurveTo(w / 2 + s * w * 0.15, y - h * 0.03, w / 2 + s * w * 0.3, y - h * 0.09);
            g.stroke();
          }
        }
        g.fillStyle = '#c0603a';
        g.beginPath();
        g.arc(w * 0.78, h * 0.85, w * 0.05, 0, Math.PI * 2);
        g.fill();
      } else {
        paper(g, w, h, '#f0e6d2', 7);
        g.fillStyle = '#c84a2e';
        g.beginPath();
        g.arc(w * 0.38, h * 0.36, w * 0.22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2a4a7a';
        g.fillRect(w * 0.5, h * 0.42, w * 0.34, h * 0.36);
        g.fillStyle = '#e0b040';
        g.beginPath();
        g.moveTo(w * 0.12, h * 0.88);
        g.lineTo(w * 0.42, h * 0.56);
        g.lineTo(w * 0.62, h * 0.88);
        g.fill();
        g.strokeStyle = '#1c1a1a';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(w * 0.08, h * 0.16);
        g.lineTo(w * 0.92, h * 0.16);
        g.stroke();
        g.lineWidth = 3;
        g.beginPath();
        g.arc(w * 0.72, h * 0.25, w * 0.08, 0, Math.PI * 2);
        g.stroke();
      }
    },
    { repeat: false },
  );
}

function frameGeometry(ow: number, oh: number, border: number, depth: number) {
  return once(`office:frame:${ow}:${oh}:${border}:${depth}`, () => {
    const outer = roundRect(ow, oh, 0.012);
    const hole = roundRect(ow - border * 2, oh - border * 2, 0.004);
    outer.holes.push(new THREE.Path(hole.getPoints(8).reverse()));
    const g = slab(outer, depth, 0.008, 2, 8).translate(0, 0, depth / 2);
    // UVs along the moulding
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const horiz = Math.abs(y) > oh / 2 - border - 0.001;
      uv[i * 2] = (horiz ? x : y) * 2;
      uv[i * 2 + 1] = (horiz ? y : x) * 2;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
}

export function FramedArt({ seed }: { seed: number }) {
  const v = variant(seed, PRINTS.length);
  const m = wallMats();
  const kind = PRINTS[v];
  const frame = [m.black, m.oak, m.walnut, m.brass][variant(seed + 1, 4)];
  const W = 0.78;
  const H = 1.0;
  const g = frameGeometry(W, H, 0.05, 0.045);
  const art = omat(`w:print-${kind}`, () => new THREE.MeshStandardMaterial({ map: printTex(kind), roughness: 0.85 }));
  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={g} material={frame} castShadow receiveShadow />
      <mesh material={m.mat} position={[0, 0, 0.012]}>
        <planeGeometry args={[W - 0.1, H - 0.1]} />
      </mesh>
      <mesh material={art} position={[0, 0.01, 0.014]}>
        <planeGeometry args={[W - 0.24, H - 0.26]} />
      </mesh>
      <mesh material={m.glass} position={[0, 0, 0.03]} renderOrder={2}>
        <planeGeometry args={[W - 0.1, H - 0.1]} />
      </mesh>
    </group>
  );
}

// ---------- the clock ----------

function clockFaceTex() {
  return tex('o-clock-face', 512, 512, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.45, h * 0.4, 20, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#f8f2e4');
    grad.addColorStop(1, '#e6dcc4');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    for (let i = 0; i < 60; i++) {
      const big = i % 5 === 0;
      g.save();
      g.rotate((i / 60) * Math.PI * 2);
      g.fillStyle = '#1c1a18';
      if (big) g.fillRect(-9, -w * 0.45, 18, i % 15 === 0 ? 70 : 52);
      else g.fillRect(-2.2, -w * 0.45, 4.4, 18);
      g.restore();
    }
    // a small red dot at the centre ring, and age
    g.fillStyle = 'rgba(160,40,30,0.85)';
    g.beginPath();
    g.arc(0, w * 0.2, 6, 0, Math.PI * 2);
    g.fill();
    const r = rand(5);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(140,110,60,${0.03 + r() * 0.04})`;
      g.beginPath();
      g.arc((r() - 0.5) * w, (r() - 0.5) * h, 3 + r() * 10, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function clockGeometries() {
  return once('office:clock', () => {
    const R = 0.31;
    const n = 24;
    const caseG = smoothLathe(
      [
        [0, 0],
        [R + 0.02, 0],
        [R + 0.04, 0.02],
        [R + 0.045, 0.06],
        [R + 0.035, 0.085],
        [R + 0.01, 0.09],
        [R, 0.075],
        [0, 0.075],
      ],
      n,
      64,
    ).rotateX(Math.PI / 2);
    const hand = (len: number, wd: number, tail: number) => {
      const s = new THREE.Shape();
      s.moveTo(-wd / 2, -tail);
      s.lineTo(wd / 2, -tail);
      s.lineTo(wd * 0.35, len);
      s.lineTo(-wd * 0.35, len);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: false });
    };
    const dome = smoothLathe(
      [
        [R, 0],
        [R * 0.6, 0.03],
        [0, 0.04],
      ],
      12,
      48,
    ).rotateX(Math.PI / 2);
    // a hanging lug and a short bracket arm to the wall
    const lug = new Merger().add(new THREE.TorusGeometry(0.03, 0.008, 8, 20), trs([0, R + 0.06, 0.03])).build();
    return { caseG, hour: hand(0.17, 0.035, 0.04), minute: hand(0.25, 0.026, 0.05), second: hand(0.26, 0.008, 0.08), dome, lug, R };
  });
}

/** A factory clock: a pressed steel case, a cream dial with bold batons (no numerals), black hands, a red sweep second hand. Real time. */
export function WallClock({ seed }: { seed: number }) {
  const g = clockGeometries();
  const m = wallMats();
  const caseM = [m.black, m.steel, omat('w:clock-green', () => new THREE.MeshStandardMaterial({ color: '#2a4a3a', metalness: 0.5, roughness: 0.4 }))][variant(seed, 3)];
  const face = omat('w:clock-face', () => new THREE.MeshStandardMaterial({ map: clockFaceTex(), roughness: 0.6 }));
  const ink = omat('w:clock-ink', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 }));
  const red = omat('w:clock-red', () => new THREE.MeshStandardMaterial({ color: '#b8281e', roughness: 0.4 }));
  const hour = useRef<THREE.Mesh>(null);
  const minute = useRef<THREE.Mesh>(null);
  const second = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const mm = d.getMinutes() + s / 60;
    const hh = (d.getHours() % 12) + mm / 60;
    if (second.current) second.current.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(mm / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(hh / 12) * Math.PI * 2;
  });
  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={g.caseG} material={caseM} castShadow receiveShadow />
      <mesh material={face} position={[0, 0, 0.076]}>
        <circleGeometry args={[g.R, 64]} />
      </mesh>
      <mesh ref={hour} geometry={g.hour} material={ink} position={[0, 0, 0.08]} />
      <mesh ref={minute} geometry={g.minute} material={ink} position={[0, 0, 0.086]} />
      <mesh ref={second} geometry={g.second} material={red} position={[0, 0, 0.092]} />
      <mesh material={red} position={[0, 0, 0.098]}>
        <cylinderGeometry args={[0.014, 0.014, 0.01, 16]} />
      </mesh>
      <mesh geometry={g.dome} material={m.glass} position={[0, 0, 0.08]} renderOrder={2} />
      <mesh geometry={g.lug} material={caseM} />
    </group>
  );
}

// ---------- whiteboard ----------

/** Marker drawings: boxes joined by arrows, a hand-drawn graph, bullet dashes, a few sticky notes. No letters. */
function whiteboardTex(v: number) {
  return tex(
    `o-whiteboard-${v}`,
    1024,
    640,
    (g, w, h) => {
      const r = rand(v * 7 + 2);
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#f6f7f6');
      grad.addColorStop(1, '#e6e9ea');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // ghosts of old drawings rubbed out
      for (let i = 0; i < 18; i++) {
        g.strokeStyle = `rgba(120,130,150,${0.05 + r() * 0.05})`;
        g.lineWidth = 6 + r() * 10;
        g.beginPath();
        const x = r() * w;
        const y = r() * h;
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (r() - 0.5) * 200, y + (r() - 0.5) * 80, x + (r() - 0.5) * 300, y + (r() - 0.5) * 60);
        g.stroke();
      }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const wobble = (pts: [number, number][]) => {
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x + (r() - 0.5) * 2, y + (r() - 0.5) * 2) : g.moveTo(x, y)));
        g.stroke();
      };
      const pens = ['#1e2a5a', '#1a1a1a', '#b02a24', '#2a6a3a'];
      // a flow of boxes and arrows
      const boxes: [number, number, number, number][] = [
        [70, 80, 150, 80],
        [300, 60, 160, 90],
        [300, 230, 160, 80],
        [540, 140, 150, 90],
      ];
      g.lineWidth = 5;
      boxes.forEach(([x, y, bw, bh], i) => {
        g.strokeStyle = pens[i % 2];
        wobble([
          [x, y],
          [x + bw, y + 2],
          [x + bw - 2, y + bh],
          [x + 2, y + bh - 1],
          [x, y],
        ]);
        // squiggle lines inside (not words)
        g.lineWidth = 3;
        for (let k = 0; k < 2; k++) {
          const yy = y + bh * (0.38 + k * 0.28);
          g.beginPath();
          g.moveTo(x + 18, yy);
          for (let xx = x + 18; xx < x + bw - 22; xx += 10) g.lineTo(xx + 5, yy - 5 + r() * 10);
          g.stroke();
        }
        g.lineWidth = 5;
      });
      g.strokeStyle = pens[2];
      const arrow = (x0: number, y0: number, x1: number, y1: number) => {
        wobble([
          [x0, y0],
          [(x0 + x1) / 2, (y0 + y1) / 2 + (r() - 0.5) * 16],
          [x1, y1],
        ]);
        const a = Math.atan2(y1 - y0, x1 - x0);
        wobble([
          [x1 - Math.cos(a - 0.5) * 22, y1 - Math.sin(a - 0.5) * 22],
          [x1, y1],
          [x1 - Math.cos(a + 0.5) * 22, y1 - Math.sin(a + 0.5) * 22],
        ]);
      };
      arrow(222, 120, 296, 108);
      arrow(222, 140, 296, 262);
      arrow(462, 108, 536, 172);
      arrow(462, 270, 536, 206);
      // a hand-drawn graph, rising
      const gx = 120;
      const gy = 560;
      g.strokeStyle = pens[1];
      wobble([
        [gx, gy - 190],
        [gx, gy],
        [gx + 330, gy],
      ]);
      g.strokeStyle = pens[3];
      g.lineWidth = 6;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 10; i++) pts.push([gx + 10 + i * 31, gy - 20 - i * 14 - Math.sin(i * 1.3) * 18]);
      wobble(pts);
      // dashes like a list on the right
      g.strokeStyle = pens[0];
      g.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        const y = 340 + i * 44;
        g.beginPath();
        g.arc(560, y, 4, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(580, y);
        for (let xx = 580; xx < 640 + r() * 120; xx += 12) g.lineTo(xx + 6, y - 4 + r() * 8);
        g.stroke();
      }
      // sticky notes, each with a couple of scribbles
      const notes = ['#f6d94a', '#f6a6b4', '#9ad6e6', '#b8e08a'];
      for (let i = 0; i < 6; i++) {
        const x = 760 + (i % 2) * 120 + r() * 10;
        const y = 70 + Math.floor(i / 2) * 140 + r() * 14;
        g.save();
        g.translate(x, y);
        g.rotate((r() - 0.5) * 0.15);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(4, 5, 100, 100);
        g.fillStyle = notes[(i + v) % notes.length];
        g.fillRect(0, 0, 100, 100);
        g.strokeStyle = 'rgba(30,30,40,0.7)';
        g.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(12, 28 + k * 24);
          for (let xx = 12; xx < 30 + r() * 55; xx += 9) g.lineTo(xx + 5, 24 + k * 24 + r() * 8);
          g.stroke();
        }
        g.restore();
      }
    },
    { repeat: false },
  );
}

function whiteboardGeometries() {
  return once('office:whiteboard', () => {
    const W = 1.7;
    const H = 1.1;
    const frame = new Merger();
    for (const s of [-1, 1]) {
      frame.add(plank(W + 0.06, 0.04, 0.04, 0.012, 1, 1), trs([0, s * (H / 2 + 0.01), 0.02]));
      frame.add(plank(0.04, H + 0.06, 0.04, 0.012, 1, 1), trs([s * (W / 2 + 0.01), 0, 0.02]));
    }
    // the marker tray along the bottom
    frame.add(plank(W * 0.5, 0.025, 0.09, 0.008, 1, 1), trs([0, -H / 2 - 0.04, 0.06]));
    frame.add(plank(W * 0.5, 0.04, 0.012, 0.004, 1, 1), trs([0, -H / 2 - 0.03, 0.1]));
    const things = new Merger();
    const cols = ['#1e2a5a', '#b02a24', '#2a6a3a'];
    cols.forEach((c, i) => {
      const body = new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12).rotateZ(Math.PI / 2);
      paint(body, (x, _y, _z, out) => out.set(x > 0.05 ? c : '#e8e8e8'));
      things.add(body, trs([-0.25 + i * 0.07, -H / 2 - 0.01, 0.06], [0, 0.1 * i, 0]));
    });
    const eraser = plank(0.16, 0.05, 0.06, 0.012, 1, 1);
    paint(eraser, (_x, y, _z, out) => out.set(y < -0.01 ? '#5a5a5a' : '#2a3a6a'));
    things.add(eraser, trs([0.22, -H / 2 + 0.003, 0.06]));
    return { frame: frame.build(), things: things.build(), W, H };
  });
}

export function Whiteboard({ seed }: { seed: number }) {
  const v = variant(seed, 2);
  const g = whiteboardGeometries();
  const m = wallMats();
  const board = omat(`w:whiteboard-${v}`, () => new THREE.MeshPhysicalMaterial({ map: whiteboardTex(v), roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  return (
    <group position={[0, 0, 0]}>
      <mesh material={m.vc} position={[0, 0, 0.01]}>
        <boxGeometry args={[g.W, g.H, 0.02]} />
      </mesh>
      <mesh material={board} position={[0, 0, 0.021]}>
        <planeGeometry args={[g.W, g.H]} />
      </mesh>
      <mesh geometry={g.frame} material={m.alu} castShadow receiveShadow />
      <mesh geometry={g.things} material={m.vc} castShadow />
    </group>
  );
}

// ---------- corkboard ----------

function corkTex(v: number) {
  return tex(
    `o-cork-${v}`,
    768,
    560,
    (g, w, h) => {
      const r = rand(v * 11 + 4);
      g.fillStyle = '#b88a58';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) {
        const t = r();
        g.fillStyle = t < 0.4 ? `rgba(110,70,36,${0.25 + r() * 0.3})` : t < 0.8 ? `rgba(220,180,130,${0.2 + r() * 0.3})` : `rgba(70,40,20,${0.3 + r() * 0.3})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
      }
      const shadowed = (x: number, y: number, ww: number, hh: number, rot: number, draw: () => void) => {
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.fillStyle = 'rgba(40,24,10,0.3)';
        g.fillRect(-ww / 2 + 4, -hh / 2 + 6, ww, hh);
        draw();
        g.restore();
      };
      const pins: [number, number, string][] = [];
      const pinCols = ['#c83a2a', '#2a5ac8', '#e8c030', '#2a8a4a', '#f0f0f0'];
      // index cards with ruled lines and scribbles
      for (let i = 0; i < 3; i++) {
        const x = 110 + i * 190 + r() * 20;
        const y = 120 + (i % 2) * 40;
        const rot = (r() - 0.5) * 0.12;
        shadowed(x, y, 150, 100, rot, () => {
          g.fillStyle = '#f6f2e6';
          g.fillRect(-75, -50, 150, 100);
          g.strokeStyle = 'rgba(180,60,60,0.5)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(-75, -32);
          g.lineTo(75, -32);
          g.stroke();
          g.strokeStyle = 'rgba(120,150,190,0.5)';
          for (let k = 0; k < 4; k++) {
            g.beginPath();
            g.moveTo(-75, -14 + k * 16);
            g.lineTo(75, -14 + k * 16);
            g.stroke();
          }
          g.strokeStyle = 'rgba(30,30,60,0.75)';
          g.lineWidth = 2.5;
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.moveTo(-60, -20 + k * 16);
            for (let xx = -60; xx < -10 + r() * 70; xx += 8) g.lineTo(xx + 4, -24 + k * 16 + r() * 6);
            g.stroke();
          }
        });
        pins.push([x, y - 42, pinCols[i % pinCols.length]]);
      }
      // instant photos of colour and shape (a sunset, a sea, a hill)
      const scenes = [
        ['#e8905a', '#4a3a5a', '#2a2430'],
        ['#7ab0d0', '#3a6a8a', '#e8e0c8'],
        ['#a8c870', '#5a8a4a', '#f0e8c0'],
      ];
      for (let i = 0; i < 3; i++) {
        const x = 150 + i * 220 + r() * 20;
        const y = 360 + r() * 30;
        const [a, b, c] = scenes[(i + v) % scenes.length];
        shadowed(x, y, 130, 150, (r() - 0.5) * 0.2, () => {
          g.fillStyle = '#f8f6f0';
          g.fillRect(-65, -75, 130, 150);
          const grad = g.createLinearGradient(0, -65, 0, 45);
          grad.addColorStop(0, a);
          grad.addColorStop(1, b);
          g.fillStyle = grad;
          g.fillRect(-56, -66, 112, 108);
          g.fillStyle = c;
          g.beginPath();
          g.moveTo(-56, 42);
          g.quadraticCurveTo(0, -10, 56, 30);
          g.lineTo(56, 42);
          g.fill();
        });
        pins.push([x, y - 66, pinCols[(i + 2) % pinCols.length]]);
      }
      // sticky notes
      for (let i = 0; i < 4; i++) {
        const x = 640 + (i % 2) * 70;
        const y = 250 + Math.floor(i / 2) * 80 + r() * 10;
        shadowed(x, y, 64, 64, (r() - 0.5) * 0.3, () => {
          g.fillStyle = ['#f6d94a', '#f6a6b4', '#9ad6e6', '#b8e08a'][i];
          g.fillRect(-32, -32, 64, 64);
          g.strokeStyle = 'rgba(30,30,40,0.6)';
          g.lineWidth = 2;
          for (let k = 0; k < 2; k++) {
            g.beginPath();
            g.moveTo(-22, -10 + k * 16);
            for (let xx = -22; xx < 0 + r() * 20; xx += 7) g.lineTo(xx + 4, -13 + k * 16 + r() * 6);
            g.stroke();
          }
        });
      }
      // a red string between two of the pins
      g.strokeStyle = 'rgba(190,30,30,0.85)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(pins[0][0], pins[0][1]);
      g.quadraticCurveTo((pins[0][0] + pins[4][0]) / 2, (pins[0][1] + pins[4][1]) / 2 + 30, pins[4][0], pins[4][1]);
      g.stroke();
      for (const [x, y, c] of pins) {
        g.fillStyle = 'rgba(30,20,10,0.4)';
        g.beginPath();
        g.arc(x + 3, y + 4, 9, 0, Math.PI * 2);
        g.fill();
        const pg = g.createRadialGradient(x - 3, y - 3, 1, x, y, 9);
        pg.addColorStop(0, '#ffffff');
        pg.addColorStop(0.35, c);
        pg.addColorStop(1, c);
        g.fillStyle = pg;
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
      }
    },
    { repeat: false },
  );
}

export function Corkboard({ seed }: { seed: number }) {
  const v = variant(seed, 2);
  const m = wallMats();
  const W = 1.3;
  const H = 0.95;
  const frame = frameGeometry(W, H, 0.05, 0.05);
  const cork = omat(`w:cork-${v}`, () => new THREE.MeshStandardMaterial({ map: corkTex(v), roughness: 0.95 }));
  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={frame} material={[m.oak, m.walnut][variant(seed + 1, 2)]} castShadow receiveShadow />
      <mesh material={cork} position={[0, 0, 0.02]}>
        <planeGeometry args={[W - 0.1, H - 0.1]} />
      </mesh>
    </group>
  );
}

