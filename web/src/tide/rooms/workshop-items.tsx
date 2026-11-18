import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { cached } from '../../tank/sdf';
import { boxUV, C, fbm3, Merger, mix, noise3, once, paint, paintFlat, paintLathe, paperGround, plank, rand, slab, smoothLathe, smoothstep, softDot, tex, trs, V, variant, wmat, woodTex } from './workshop-kit';
import { furMat, planeGeometries, robotGeometry, rockingHorseGeometries, teddyGeometries, topGeometry, toyMat, trainGeometry, twoSided } from './workshop-toys';

// The things you can add to the toy workshop. Each stands on y = 0 facing +z
// (a wall item has its back on the wall at the origin and faces out of it),
// drawn about 1.6x real size like the rest of the workshop's props, and varies
// with its seed. None of them carries a light (adding a light at runtime would
// recompile every material); the lantern glows through bloom instead.

function itemMats() {
  return {
    oak: wmat('i:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-item-oak', { w: 512, h: 256, light: '#a8784a', dark: '#4a2a12', planks: 1, rings: 8, seed: 31, joints: false, seams: 0, figure: 0.3 }), roughness: 0.52, vertexColors: true })),
    pine: wmat('i:pine', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-item-pine', { w: 512, h: 256, light: '#e2c08e', dark: '#9a7044', planks: 2, rings: 6, seed: 32, joints: false, seams: 0.4 }), roughness: 0.6, vertexColors: true })),
    vc: wmat('i:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })),
    gloss: wmat('i:gloss', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 })),
    brass: wmat('i:brass', () => new THREE.MeshStandardMaterial({ color: '#c99a4c', metalness: 0.85, roughness: 0.3 })),
    tin: wmat('i:tin', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.4 })),
    iron: wmat('i:iron', () => new THREE.MeshStandardMaterial({ color: '#25211e', metalness: 0.55, roughness: 0.5 })),
    leaf: wmat('i:leaf', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide })),
    glass: wmat('i:glass', () => new THREE.MeshPhysicalMaterial({ color: '#fff2dc', transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1, depthWrite: false })),
    cloth: wmat('i:cloth', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })),
  };
}

// ---------- rocking horse ----------

/** A bow rocking horse, dapple grey, chestnut or natural wood by seed. */
export function RockingHorseItem({ seed }: { seed: number }) {
  const h = rockingHorseGeometries(variant(seed, 3));
  const toy = toyMat();
  return (
    <group scale={0.85}>
      <mesh geometry={h.horse} material={toy} castShadow receiveShadow />
      <mesh geometry={h.hair} material={toy} castShadow />
      <mesh geometry={h.reins} material={toy} castShadow />
      <mesh geometry={h.rockers} material={toy} castShadow receiveShadow />
    </group>
  );
}

// ---------- train, robot, teddy, tops ----------

export function TrainItem({ seed }: { seed: number }) {
  return <mesh geometry={trainGeometry(variant(seed, 3))} material={toyMat()} scale={0.7} castShadow receiveShadow />;
}

export function RobotItem({ seed }: { seed: number }) {
  return <mesh geometry={robotGeometry(variant(seed, 3))} material={toyMat()} scale={0.8} castShadow receiveShadow />;
}

export function TeddyItem({ seed }: { seed: number }) {
  const t = teddyGeometries(variant(seed, 3));
  return (
    <group>
      <mesh geometry={t.fur} material={furMat()} castShadow receiveShadow />
      <mesh geometry={t.shiny} material={toyMat()} />
      <mesh geometry={t.bow} material={toyMat()} castShadow />
    </group>
  );
}

/** Three spinning tops: two standing, one tipped over on its side. */
export function TopsItem({ seed }: { seed: number }) {
  const v = variant(seed, 4);
  const geo = useMemo(
    () =>
      once(`i:tops:${v}`, () => {
        const m = new Merger();
        m.add(topGeometry(0, v), trs([-0.09, 0, 0.02], [0, 0, 0], 1.15));
        m.add(topGeometry(2, v + 1), trs([0.1, 0, -0.04], [0, 0, 0], 1.1));
        // the third has fallen over: tipped onto its side, resting on its rim and stem
        const lying = topGeometry(0, v + 2).clone().scale(1.1, 1.1, 1.1).rotateZ(Math.PI / 2 - 0.32).rotateY(0.7);
        lying.computeBoundingBox();
        m.add(lying, trs([0.0, -(lying.boundingBox as THREE.Box3).min.y, 0.14]));
        return m.build();
      }),
    [v],
  );
  return <mesh geometry={geo} material={toyMat()} castShadow receiveShadow />;
}

// ---------- the biplane on its stand ----------

/** A toy biplane on a turned stand; its propeller turns lazily. */
export function PlaneItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const p = planeGeometries(v);
  const m = itemMats();
  const prop = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (prop.current) prop.current.rotation.x += dt * 1.4;
  });
  const stand = useMemo(
    () =>
      once('i:plane-stand', () => {
        const s = new Merger();
        s.add(
          smoothLathe(
            [
              [0, 0],
              [0.13, 0],
              [0.135, 0.015],
              [0.11, 0.035],
              [0.03, 0.045],
              [0, 0.045],
            ],
            14,
            32,
          ),
        );
        s.add(tubeThrough([V(0, 0.04, 0), V(0, 0.3, 0)], () => 0.012, 2, 10).geometry);
        return paint(s.build(), (_x, _y, _z, out) => out.set('#5a3418'));
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={stand} material={m.gloss} castShadow receiveShadow />
      <group position={[0, 0.06, 0]} rotation={[0, -0.35, 0.08]} scale={0.85}>
        <mesh geometry={p.body} material={toyMat()} castShadow />
        <group ref={prop} position={p.hub}>
          <mesh geometry={p.prop} material={toyMat()} castShadow />
        </group>
      </group>
    </group>
  );
}

// ---------- the kite ----------

const KITES = [
  ['#c0392b', '#e6b02e', '#c0392b', '#e6b02e'],
  ['#2c5d9c', '#efe3c8', '#2c5d9c', '#efe3c8'],
  ['#3a8350', '#e2899a', '#e6b02e', '#2d8686'],
];

/** A diamond kite hung on the wall, its sail in four panels, a tail of paper bows and a little reel of string. */
export function KiteItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const geo = useMemo(
    () =>
      once(`i:kite:${v}`, () => {
        const cols = KITES[v].map((c) => C(c));
        const sail = new Merger();
        const W = 0.42;
        const T = 0.32;
        const B = 0.62;
        // four triangles, a slight billow out of the wall
        const quads: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
          [V(0, 0, 0.06), V(0, T, 0.03), V(-W, 0, 0.03)],
          [V(0, 0, 0.06), V(W, 0, 0.03), V(0, T, 0.03)],
          [V(0, 0, 0.06), V(-W, 0, 0.03), V(0, -B, 0.03)],
          [V(0, 0, 0.06), V(0, -B, 0.03), V(W, 0, 0.03)],
        ];
        quads.forEach(([a, b, c], i) => {
          const g = new THREE.BufferGeometry().setFromPoints([a, b, c]);
          g.computeVertexNormals();
          sail.add(twoSided(paintFlat(g.setIndex([0, 1, 2]), '#ffffff')), undefined, cols[i]);
        });
        const frame = new Merger();
        frame.add(tubeThrough([V(0, T, 0.035), V(0, -B, 0.035)], () => 0.008, 2, 6).geometry);
        frame.add(tubeThrough([V(-W, 0, 0.035), V(W, 0, 0.035)], () => 0.008, 2, 6).geometry);
        // the tail: a string with paper bows
        const tail: THREE.Vector3[] = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          tail.push(V(Math.sin(t * 5.5) * 0.1 + t * 0.08, -B - t * 0.6, 0.035 - t * 0.02));
        }
        frame.add(tubeThrough(tail, () => 0.003, 40, 4).geometry);
        const bows = new Merger();
        const bowCols = [KITES[v][1], KITES[v][0], KITES[v][2]];
        for (let i = 1; i < 6; i++) {
          const p = tail[i * 2];
          for (const s of [-1, 1]) {
            const g = new THREE.CircleGeometry(0.035, 3);
            g.rotateZ(s > 0 ? 0 : Math.PI).scale(1.2, 0.8, 1);
            bows.add(twoSided(paintFlat(g, bowCols[i % 3])), trs([p.x + s * 0.03, p.y, p.z + 0.004]));
          }
        }
        // a reel of string tied to the cross-stick
        const reel = smoothLathe(
          [
            [0.01, -0.06],
            [0.05, -0.06],
            [0.05, -0.05],
            [0.03, -0.045],
            [0.035, 0.045],
            [0.05, 0.05],
            [0.05, 0.06],
            [0.01, 0.06],
          ],
          14,
          18,
        ).rotateZ(Math.PI / 2);
        paintLathe(reel, 14, (_x, _y, _z, along, out) => out.set(along > 0.3 && along < 0.7 ? '#e8dcc0' : '#7a4a28'));
        bows.add(reel, trs([W * 0.6, -0.42, 0.06]));
        bows.add(tubeThrough([V(W * 0.35, 0, 0.04), V(W * 0.5, -0.25, 0.05), V(W * 0.6, -0.36, 0.06)], () => 0.002, 10, 4).geometry, undefined, C('#e8dcc0'));
        return { sail: sail.build(), frame: frame.build(), bows: bows.build() };
      }),
    [v],
  );
  return (
    <group scale={1.3} rotation={[0, 0, 0.12]}>
      <mesh geometry={geo.sail} material={m.cloth} castShadow />
      <mesh geometry={geo.frame} material={m.oak} castShadow />
      <mesh geometry={geo.bows} material={m.cloth} castShadow />
    </group>
  );
}

// ---------- the cuckoo clock ----------

function dialTex() {
  return tex('ws-cuckoo-dial', 256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.45, h * 0.4, 10, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#f4ead2');
    grad.addColorStop(1, '#dccaa0');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    // dots for the hours (no numerals), bigger at the quarters, a ring
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillStyle = '#2a1c12';
      g.beginPath();
      g.arc(Math.sin(a) * w * 0.38, -Math.cos(a) * h * 0.38, i % 3 === 0 ? 9 : 5, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(60,40,24,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, w * 0.46, 0, Math.PI * 2);
    g.stroke();
    // a painted flower at the centre
    g.fillStyle = '#b8423a';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.beginPath();
      g.ellipse(Math.cos(a) * 14, Math.sin(a) * 14, 9, 5, a, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** A carved chalet cuckoo clock: a steep shingled roof, leaves and a bird carved on the front, real time, a swinging leaf pendulum and two pine-cone weights. The cuckoo comes out on the hour and the half hour. */
export function CuckooClockItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const woods = [
    ['#7a4a26', '#2a1206'],
    ['#4a2c16', '#140904'],
    ['#a87a46', '#4a2a12'],
  ][v];
  const wood = wmat(`i:cuckoo:${v}`, () => new THREE.MeshPhysicalMaterial({ map: woodTex(`ws-cuckoo-${v}`, { w: 512, h: 256, light: woods[0], dark: woods[1], planks: 1, rings: 12, seed: 80 + v, joints: false, seams: 0 }), roughness: 0.42, clearcoat: 0.3, vertexColors: true }));
  const face = wmat('i:cuckoo-face', () => new THREE.MeshStandardMaterial({ map: dialTex(), roughness: 0.6 }));
  const geo = useMemo(
    () =>
      once('i:cuckoo', () => {
        const body = new Merger();
        // the case, the roof's two slopes with shingle courses, a ridge
        body.add(boxUV(new THREE.BoxGeometry(0.36, 0.4, 0.16), 3), trs([0, 0, 0.08]));
        for (const s of [-1, 1]) {
          const roof = plank(0.28, 0.025, 0.24, 0.008, [3, 3]);
          paint(roof, (x, _y, z, out) => out.setScalar(0.75 + 0.35 * (Math.floor((x + 0.14) * 30) % 2) + 0.1 * noise3(x * 40, 1, z * 40)));
          body.add(roof, trs([s * 0.11, 0.27, 0.1], [0, 0, -s * 0.72]));
        }
        body.add(plank(0.03, 0.03, 0.26, 0.008), trs([0, 0.355, 0.1]));
        // carved leaves on the front, round the dial and the bird's door
        const leaf = new THREE.Shape();
        leaf.moveTo(0, 0);
        leaf.quadraticCurveTo(0.03, 0.03, 0.0, 0.09);
        leaf.quadraticCurveTo(-0.03, 0.03, 0, 0);
        const leafG = new THREE.ExtrudeGeometry(leaf, { depth: 0.012, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 8 });
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          body.add(leafG, trs([Math.sin(a) * 0.15, -0.04 + Math.cos(a) * 0.15, 0.165], [0, 0, -a + (k % 2 ? 0.4 : -0.4)]));
        }
        // the bird carved on the roof's peak
        const bird = new THREE.SphereGeometry(0.035, 12, 8);
        body.add(bird, trs([0, 0.4, 0.14], [0, 0, 0], [1.5, 1, 0.8]));
        body.add(new THREE.ConeGeometry(0.012, 0.04, 8).rotateZ(-Math.PI / 2), trs([0.065, 0.405, 0.14]));
        body.add(new THREE.ConeGeometry(0.02, 0.06, 8).rotateZ(Math.PI / 2 + 0.4), trs([-0.06, 0.42, 0.14]));
        // the cuckoo's little door frame over the dial
        body.add(plank(0.1, 0.09, 0.02, 0.006), trs([0, 0.13, 0.165]));
        // the pendulum and the weights on their chains
        const hang = new Merger();
        const pend = new THREE.Shape();
        pend.moveTo(0, 0);
        pend.quadraticCurveTo(0.06, -0.06, 0, -0.14);
        pend.quadraticCurveTo(-0.06, -0.06, 0, 0);
        hang.add(new THREE.ExtrudeGeometry(pend, { depth: 0.01, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 8 }), trs([0, -0.35, 0]));
        hang.add(plank(0.008, 0.36, 0.006, 0.002), trs([0, -0.17, 0.005]));
        const cones = new Merger();
        const cone = smoothLathe(
          [
            [0, -0.16],
            [0.025, -0.15],
            [0.04, -0.1],
            [0.042, -0.03],
            [0.03, 0.0],
            [0.008, 0.01],
            [0, 0.012],
          ],
          16,
          16,
        );
        paintLathe(cone, 16, (x, y, z, _a, out) => out.set('#3a2a1e').multiplyScalar(0.75 + 0.4 * Math.abs(Math.sin(Math.atan2(z, x) * 5 + y * 60))));
        for (const s of [-1, 1]) {
          cones.add(cone, trs([s * 0.07, -0.78 + (s > 0 ? 0.15 : 0), 0.08]));
          for (let k = 0; k < 14; k++) cones.add(new THREE.TorusGeometry(0.008, 0.002, 4, 8), trs([s * 0.07, -0.2 - k * 0.032 * (s > 0 ? 0.7 : 1), 0.08], [0, k % 2 ? Math.PI / 2 : 0, 0]), C('#b8964a'));
        }
        const cuckoo = new Merger();
        cuckoo.add(new THREE.SphereGeometry(0.028, 12, 8), trs([0, 0, 0], [0, 0, 0], [1, 1, 1.4]), C('#5a3a22'));
        cuckoo.add(new THREE.ConeGeometry(0.008, 0.025, 8).rotateX(Math.PI / 2), trs([0, 0.004, 0.045]), C('#e6b02e'));
        return { body: body.build(), hang: hang.build(), cones: cones.build(), cuckoo: cuckoo.build() };
      }),
    [],
  );
  const hour = useRef<THREE.Mesh>(null);
  const minute = useRef<THREE.Mesh>(null);
  const pendulum = useRef<THREE.Group>(null);
  const bird = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const mm = d.getMinutes() + s / 60;
    const hh = (d.getHours() % 12) + mm / 60;
    if (minute.current) minute.current.rotation.z = -(mm / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(hh / 12) * Math.PI * 2;
    if (pendulum.current) pendulum.current.rotation.z = Math.sin(clock.elapsedTime * Math.PI * 0.9) * 0.14;
    if (bird.current) {
      // out for a few seconds at the hour and the half hour
      const out = (d.getMinutes() === 0 || d.getMinutes() === 30) && s < 5 ? Math.sin((s / 5) * Math.PI) : 0;
      bird.current.position.z = 0.13 + Math.min(1, out * 2) * 0.07;
    }
  });
  const hand = (len: number, wd: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-wd / 2, -0.015);
    sh.lineTo(wd / 2, -0.015);
    sh.lineTo(wd * 0.3, len * 0.7);
    sh.quadraticCurveTo(wd * 1.2, len * 0.82, 0, len);
    sh.quadraticCurveTo(-wd * 1.2, len * 0.82, -wd * 0.3, len * 0.7);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false });
  };
  const hands = useMemo(() => once('i:cuckoo-hands', () => ({ hour: hand(0.065, 0.016), minute: hand(0.095, 0.012) })), []);
  return (
    <group scale={1.6} position={[0, 0, 0]}>
      <mesh geometry={geo.body} material={wood} castShadow receiveShadow />
      <mesh material={face} position={[0, -0.04, 0.163]}>
        <circleGeometry args={[0.095, 40]} />
      </mesh>
      <mesh ref={hour} geometry={hands.hour} material={m.iron} position={[0, -0.04, 0.166]} />
      <mesh ref={minute} geometry={hands.minute} material={m.iron} position={[0, -0.04, 0.17]} />
      <group ref={bird} position={[0, 0.13, 0.13]}>
        <mesh geometry={geo.cuckoo} material={m.gloss} />
      </group>
      <group ref={pendulum} position={[0, -0.2, 0.06]}>
        <mesh geometry={geo.hang} material={wood} castShadow />
      </group>
      <mesh geometry={geo.cones} material={m.gloss} castShadow />
    </group>
  );
}

// ---------- sawhorse ----------

/** A sawhorse: a beam on splayed A-legs; with a plank and a saw on it, or a dust sheet over it, by seed. */
export function SawhorseItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const geo = useMemo(
    () =>
      once(`i:sawhorse:${v}`, () => {
        const wood = new Merger();
        const r = rand(v + 3);
        const L = 1.1;
        const H = 0.78;
        wood.add(plank(L, 0.1, 0.12, 0.012, [1 / 1.4, 1 / 1.4]), trs([0, H - 0.05, 0]));
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) wood.add(plank(0.07, H, 0.06, 0.01, [1 / 1.4, 1 / 1.4], 1, [r(), r()], true), trs([sx * (L / 2 - 0.12), H / 2 - 0.03, sz * 0.13], [sz * -0.3, 0, sx * 0.08]));
        for (const sx of [-1, 1]) wood.add(plank(0.035, 0.12, 0.4, 0.008), trs([sx * (L / 2 - 0.12), 0.35, 0]));
        const extra = new Merger();
        if (v === 1) {
          const board = plank(1.6, 0.04, 0.26, 0.006, [1 / 1.4, 1 / 1.4]);
          paint(board, (x, _y, _z, out) => {
            out.set('#e2c08e');
            // a pencil line across where it's to be cut
            if (Math.abs(x - 0.35) < 0.004) out.set('#3a3a3a');
          });
          extra.add(board, trs([0.1, H + 0.02, 0.0], [0, 0.1, 0]));
          extra.add(paintFlat(plank(0.55, 0.11, 0.006, 0.002), '#a8aeb4'), trs([0.2, H + 0.05, 0.12], [Math.PI / 2, 0.15, 0]));
          extra.add(paintFlat(plank(0.16, 0.04, 0.12, 0.012), '#7a4a28'), trs([-0.12, H + 0.05, 0.15], [0, 0.15, 0]));
        } else if (v === 2) {
          // a dust sheet thrown over it: flat along the beam, hanging down both sides in soft folds, drooping past the ends
          const sheet = new THREE.PlaneGeometry(1.36, 1.2, 34, 30);
          const p = sheet.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const u = p.getX(i);
            const v = p.getY(i);
            const av = Math.abs(v);
            const over = Math.max(0, av - 0.07);
            const end = smoothstep(0.5, 0.68, Math.abs(u));
            const fold = Math.sin(u * 11 + v * 2.5) * 0.022 * smoothstep(0.08, 0.4, av);
            const y = H + 0.012 - over * 1.05 - end * (0.12 + over * 0.4);
            const z = Math.sign(v) * (Math.min(av, 0.07) + over * 0.22 + end * 0.03) + fold;
            p.setXYZ(i, u * (1 - end * 0.06), Math.max(0.02, y), z);
          }
          sheet.computeVertexNormals();
          extra.add(twoSided(paint(sheet, (x, y, z, out) => out.set('#cfc6b2').multiplyScalar(0.84 + 0.14 * noise3(x * 5, y * 5, z * 5) - smoothstep(0.4, 0.05, y) * 0.08))));
        }
        return { wood: wood.build(), extra: extra.empty ? null : extra.build() };
      }),
    [v],
  );
  return (
    <group>
      <mesh geometry={geo.wood} material={m.pine} castShadow receiveShadow />
      {geo.extra && <mesh geometry={geo.extra} material={v === 2 ? m.cloth : m.gloss} castShadow receiveShadow />}
    </group>
  );
}

// ---------- tool chest ----------

const CHESTS = ['#6a3e22', '#3e5a4a', '#8a2e22'];

/** A joiner's tool chest: a lid with brass corners and a handle, three rows of drawers with brass pulls, rope handles. */
export function ToolChestItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const geo = useMemo(
    () =>
      once(`i:chest:${v}`, () => {
        const body = new Merger();
        const brass = new Merger();
        const col = C(CHESTS[v]);
        const W = 0.9;
        const D = 0.48;
        const H = 0.62;
        body.add(plank(W, H, D, 0.02, [2, 2]), trs([0, H / 2, 0]), col);
        body.add(plank(W + 0.04, 0.08, D + 0.04, 0.025, [2, 2]), trs([0, H + 0.04, 0]), col);
        // drawer fronts in natural wood, three rows
        for (let row = 0; row < 3; row++) {
          const n = row === 2 ? 1 : 2;
          for (let k = 0; k < n; k++) {
            const dw = (W - 0.08) / n - 0.02;
            const x = -W / 2 + 0.04 + (dw + 0.02) * (k + 0.5) + 0.01;
            const y = 0.1 + row * 0.17 + (row === 2 ? 0.02 : 0);
            body.add(plank(dw, 0.14, 0.02, 0.006, [2, 2]), trs([x, y + 0.04, D / 2 + 0.005]), C('#c49060'));
            brass.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), trs([x, y + 0.04, D / 2 + 0.025]));
          }
        }
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            brass.add(plank(0.07, 0.07, 0.07, 0.006), trs([sx * (W / 2 - 0.015), H + 0.06, sz * (D / 2 - 0.015)]));
            brass.add(plank(0.06, 0.06, 0.06, 0.006), trs([sx * (W / 2 - 0.01), 0.03, sz * (D / 2 - 0.01)]));
          }
        brass.add(tubeThrough([V(-0.12, H + 0.08, 0), V(-0.1, H + 0.13, 0), V(0.1, H + 0.13, 0), V(0.12, H + 0.08, 0)], () => 0.012, 12, 8).geometry);
        const rope = new Merger();
        for (const sx of [-1, 1]) rope.add(tubeThrough([V(sx * (W / 2 + 0.005), H * 0.72, -0.1), V(sx * (W / 2 + 0.06), H * 0.62, 0), V(sx * (W / 2 + 0.005), H * 0.72, 0.1)], () => 0.016, 12, 8).geometry, undefined, C('#c8a878'));
        return { body: body.build(), brass: brass.build(), rope: rope.build() };
      }),
    [v],
  );
  return (
    <group>
      <mesh geometry={geo.body} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.brass} material={m.brass} castShadow />
      <mesh geometry={geo.rope} material={m.vc} castShadow />
    </group>
  );
}

// ---------- crate of offcuts ----------

/** A slatted crate heaped with offcuts: blocks, rounds, triangles, dowel ends and curls. */
export function OffcutsItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const geo = useMemo(
    () =>
      once(`i:offcuts:${v}`, () => {
        const crate = new Merger();
        const bits = new Merger();
        const r = rand(v + 50);
        const W = 0.62;
        const D = 0.44;
        const H = 0.34;
        for (let k = 0; k < 3; k++) {
          const y = 0.06 + k * 0.11;
          for (const s of [-1, 1]) {
            crate.add(plank(W, 0.08, 0.02, 0.006, [2, 2], 1, [r(), r()]), trs([0, y, s * (D / 2)]));
            crate.add(plank(0.02, 0.08, D, 0.006, [2, 2], 1, [r(), r()]), trs([s * (W / 2), y, 0]));
          }
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) crate.add(plank(0.04, H, 0.04, 0.006), trs([sx * (W / 2 - 0.02), H / 2, sz * (D / 2 - 0.02)]));
        crate.add(plank(W, 0.02, D, 0.004), trs([0, 0.02, 0]));
        const tones = ['#e2c294', '#c89a64', '#a8703e', '#e8d2a8', '#7a4a28', '#d8b878'];
        for (let i = 0; i < 26; i++) {
          const c = tones[Math.floor(r() * tones.length)];
          const kind = Math.floor(r() * 4);
          let g: THREE.BufferGeometry;
          if (kind === 0) g = plank(0.06 + r() * 0.14, 0.03 + r() * 0.05, 0.05 + r() * 0.08, 0.006, [6, 6], 1, [r(), r()]);
          else if (kind === 1) g = new THREE.CylinderGeometry(0.03 + r() * 0.03, 0.03 + r() * 0.03, 0.03 + r() * 0.04, 14);
          else if (kind === 2) g = new THREE.CylinderGeometry(0.012, 0.012, 0.15 + r() * 0.2, 8);
          else g = new THREE.CylinderGeometry(0.0001, 0.07, 0.03, 3);
          paintFlat(g, c);
          bits.add(g, trs([(r() - 0.5) * (W - 0.12), H - 0.05 + r() * 0.12, (r() - 0.5) * (D - 0.1)], [r() * 3, r() * 3, r() * 3]));
        }
        return { crate: crate.build(), bits: bits.build() };
      }),
    [v],
  );
  return (
    <group>
      <mesh geometry={geo.crate} material={m.pine} castShadow receiveShadow />
      <mesh geometry={geo.bits} material={toyMat()} castShadow receiveShadow />
    </group>
  );
}

// ---------- potted plants ----------

/** A terracotta pot (with a saucer) and soil. */
function potGeometry() {
  return once('i:pot', () => {
    const n = 30;
    const pot = smoothLathe(
      [
        [0, 0.02],
        [0.11, 0.02],
        [0.12, 0.035],
        [0.15, 0.24],
        [0.168, 0.25],
        [0.17, 0.29],
        [0.155, 0.295],
        [0.152, 0.26],
        [0.135, 0.06],
        [0, 0.055],
      ],
      n,
      36,
    );
    paintLathe(pot, n, (x, y, z, along, out) => {
      out.set('#b8643a').multiplyScalar(0.85 + 0.2 * noise3(x * 20, y * 20, z * 20));
      mix(out, out, C('#e8dcc8'), smoothstep(0.6, 0.85, fbm3(x * 8, y * 8, z * 8)) * 0.35);
      if (along > 0.7) out.set('#3a2618');
    });
    const saucer = smoothLathe(
      [
        [0, 0],
        [0.15, 0],
        [0.18, 0.02],
        [0.185, 0.035],
        [0.17, 0.03],
        [0.15, 0.012],
        [0, 0.012],
      ],
      12,
      36,
    );
    paintLathe(saucer, 12, (_x, _y, _z, _a, out) => out.set('#a8582e'));
    const soil = new THREE.CircleGeometry(0.15, 24).rotateX(-Math.PI / 2).translate(0, 0.255, 0);
    paint(soil, (x, _y, z, out) => out.set('#2e1e14').multiplyScalar(0.8 + 0.3 * noise3(x * 40, 0, z * 40)));
    return new Merger().add(pot).add(saucer).add(soil).build();
  });
}

/** A jade plant: a thick trunk branching into fleshy oval leaves, in opposite pairs along the branches and in rosettes at the tips. */
function jadeGeometry() {
  return cached('ws-jade', () => {
    const m = new Merger();
    const r = rand(5);
    const green = C('#4e7a3e');
    const dark = C('#2e5a2a');
    const rim = C('#a83a2a');
    const bark = C('#7a6a4a');
    const leafAt = (p: THREE.Vector3, yaw: number, tilt: number, s: number) => {
      const leaf = new THREE.SphereGeometry(0.03, 12, 8);
      paint(leaf, (x, y, z, out) => {
        mix(out, green, dark, 0.5 + 0.5 * noise3(x * 50, y * 50, z * 50));
        if (Math.abs(x) > 0.024) mix(out, out, rim, 0.55);
      });
      // the pad's long axis points out from the stem
      m.add(leaf, trs([p.x, p.y, p.z], [0, yaw, tilt], [1.7 * s, 0.5 * s, 1.0 * s]), undefined);
    };
    const branch = (p: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
      const end = p.clone().addScaledVector(dir, len);
      const mid = p.clone().lerp(end, 0.5).add(V((r() - 0.5) * 0.015, 0.01, (r() - 0.5) * 0.015));
      m.add(tubeThrough([p, mid, end], (t) => rad * (1 - t * 0.3), 8, 8).geometry, undefined, bark);
      const yaw = Math.atan2(-dir.z, dir.x);
      if (depth === 0) {
        // leaf pairs along the twig, a rosette at its tip
        for (const t of [0.45, 0.8]) {
          const q = p.clone().lerp(end, t);
          for (const sd of [-1, 1]) leafAt(q.clone().add(V(Math.sin(yaw) * 0.03 * sd, 0.005, Math.cos(yaw) * 0.03 * sd)), yaw + (sd * Math.PI) / 2, 0.3, 0.85);
        }
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + r();
          leafAt(end.clone().add(V(Math.cos(a) * 0.03, 0.012, Math.sin(a) * 0.03)), -a, 0.5 + r() * 0.3, 1.0);
        }
        return;
      }
      const n = depth === 2 ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.8 + depth;
        const spread = depth === 2 ? 0.95 : 0.6;
        const nd = V(Math.cos(a) * spread, 1, Math.sin(a) * spread).normalize();
        branch(end, nd, len * (depth === 2 ? 0.85 : 0.75), rad * 0.62, depth - 1);
      }
    };
    branch(V(0, 0.25, 0), V(0.05, 1, 0).normalize(), 0.1, 0.03, 2);
    return m.build();
  });
}

/** A red geranium: round scalloped leaves with a darker zone, and clusters of red flowers on stalks. */
function geraniumGeometry(v: number) {
  return once(`ws-geranium-${v}`, () => {
    const m = new Merger();
    const r = rand(9 + v);
    const flower = C(['#d8342a', '#e8708a', '#f2ece0'][v % 3]);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + r() * 0.4;
      const reach = 0.05 + r() * 0.12;
      const stemTop = V(Math.cos(a) * reach, 0.3 + r() * 0.1, Math.sin(a) * reach);
      m.add(tubeThrough([V(0, 0.25, 0), stemTop], () => 0.006, 4, 5).geometry, undefined, C('#5a7a3a'));
      const leaf = new THREE.CircleGeometry(0.07, 18);
      const p = leaf.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const ang = Math.atan2(y, x);
        const scal = 1 + 0.08 * Math.sin(ang * 7);
        p.setXYZ(i, x * scal, y * scal, -Math.hypot(x, y) * 0.35);
      }
      leaf.computeVertexNormals();
      paint(leaf, (x, y, _z, out) => {
        const d = Math.hypot(x, y);
        out.set('#4a7a36');
        if (d > 0.03 && d < 0.045) out.set('#3a4a22');
        out.multiplyScalar(0.85 + 0.2 * noise3(x * 40, y * 40, 2));
      });
      m.add(twoSided(leaf), trs([stemTop.x, stemTop.y, stemTop.z], [-Math.PI / 2 + 0.3, a, 0]));
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.5;
      const top = V(Math.cos(a) * 0.08, 0.5 + r() * 0.08, Math.sin(a) * 0.08);
      m.add(tubeThrough([V(0, 0.28, 0), V(top.x * 0.5, 0.42, top.z * 0.5), top], () => 0.005, 8, 5).geometry, undefined, C('#5a7a3a'));
      for (let f = 0; f < 9; f++) {
        const fa = r() * Math.PI * 2;
        const fr = r() * 0.035;
        const petal = new THREE.SphereGeometry(0.018, 8, 6);
        paintFlat(petal, '#ffffff');
        m.add(petal, trs([top.x + Math.cos(fa) * fr, top.y + 0.01 + r() * 0.02, top.z + Math.sin(fa) * fr], [0, 0, 0], [1, 0.6, 1]), flower);
      }
    }
    return m.build();
  });
}

/** A jade plant or a geranium (red, pink or white) in a terracotta pot. */
export function PlantItem({ seed }: { seed: number }) {
  const v = variant(seed, 4);
  const m = itemMats();
  const pot = potGeometry();
  const plant = v === 0 ? jadeGeometry() : geraniumGeometry(v - 1);
  return (
    <group scale={1.15}>
      <mesh geometry={pot} material={m.vc} castShadow receiveShadow />
      <mesh geometry={plant} material={m.leaf} castShadow receiveShadow />
    </group>
  );
}

// ---------- hurricane lantern ----------

const LANTERNS = ['#a8302a', '#2e5a3e', '#2a2624'];

/** A hurricane lantern: a painted tin fount, a wire guard round the glass globe, a vented cap and a bail handle. The flame glows; it lights nothing. */
export function LanternItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const geo = useMemo(
    () =>
      once(`i:lantern:${v}`, () => {
        const tin = new Merger();
        const col = C(LANTERNS[v]);
        tin.add(
          smoothLathe(
            [
              [0, 0],
              [0.1, 0],
              [0.11, 0.01],
              [0.112, 0.06],
              [0.095, 0.09],
              [0.06, 0.1],
              [0.06, 0.11],
              [0, 0.11],
            ],
            16,
            28,
          ),
          undefined,
          col,
        );
        tin.add(
          smoothLathe(
            [
              [0.03, 0.31],
              [0.075, 0.31],
              [0.08, 0.33],
              [0.06, 0.37],
              [0.035, 0.39],
              [0.035, 0.41],
              [0, 0.41],
            ],
            12,
            24,
          ),
          undefined,
          col,
        );
        const wire = new Merger();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          wire.add(tubeThrough([V(Math.cos(a) * 0.065, 0.1, Math.sin(a) * 0.065), V(Math.cos(a) * 0.085, 0.2, Math.sin(a) * 0.085), V(Math.cos(a) * 0.07, 0.31, Math.sin(a) * 0.07)], () => 0.0035, 10, 4).geometry);
        }
        wire.add(new THREE.TorusGeometry(0.084, 0.0035, 4, 24).rotateX(Math.PI / 2), trs([0, 0.2, 0]));
        wire.add(tubeThrough([V(-0.085, 0.3, 0), V(-0.09, 0.45, 0), V(0, 0.52, 0), V(0.09, 0.45, 0), V(0.085, 0.3, 0)], () => 0.004, 24, 5).geometry);
        const globe = smoothLathe(
          [
            [0.045, 0.1],
            [0.07, 0.13],
            [0.08, 0.2],
            [0.07, 0.27],
            [0.04, 0.31],
          ],
          16,
          28,
        );
        return { tin: tin.build(), wire: wire.build(), globe };
      }),
    [v],
  );
  const flame = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ffb860').multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const glow = useRef<THREE.Mesh>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime + seed * 3;
    const g = glow.current;
    if (!g) return;
    g.scale.set(0.09, 0.13 * (1 + 0.06 * Math.sin(t * 4.7) + 0.04 * Math.sin(t * 7.9)), 1);
    // turn the flame's glow to face the camera
    g.parent?.getWorldQuaternion(q);
    g.quaternion.copy(q.invert().multiply(camera.quaternion));
  });
  return (
    <group scale={1.3}>
      <mesh geometry={geo.tin} material={m.tin} castShadow receiveShadow />
      <mesh geometry={geo.wire} material={m.iron} castShadow />
      <mesh ref={glow} material={flame} position={[0, 0.19, 0]} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh geometry={geo.globe} material={m.glass} renderOrder={2} />
    </group>
  );
}

// ---------- framed drawing of a toy design ----------

/** A design drawing, no words or numbers: front and side views of a toy with dimension lines and arrows, centre lines, a little detail circle. */
function drawingTex(v: number) {
  return tex(`ws-drawing:${v}`, 512, 384, (g, w, h) => {
    const blue = v !== 1;
    if (blue) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#24508a');
      grad.addColorStop(1, '#1c4278');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rand(v + 3);
      for (let i = 0; i < 800; i++) {
        g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
      }
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += 16) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    } else paperGround(g, w, h, '#efe4c8', '#e2d2ae', 7);
    const ink = blue ? 'rgba(240,246,255,0.92)' : 'rgba(70,56,44,0.85)';
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // a border and a blank title box
    g.strokeRect(14, 14, w - 28, h - 28);
    g.strokeRect(w - 150, h - 60, 136, 46);
    g.beginPath();
    g.moveTo(w - 150, h - 37);
    g.lineTo(w - 14, h - 37);
    g.stroke();
    const dim = (x0: number, y0: number, x1: number, y1: number) => {
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      for (const [px, py, aa] of [
        [x0, y0, a],
        [x1, y1, a + Math.PI],
      ] as [number, number, number][]) {
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(aa + 0.35) * 9, py + Math.sin(aa + 0.35) * 9);
        g.lineTo(px + Math.cos(aa - 0.35) * 9, py + Math.sin(aa - 0.35) * 9);
        g.closePath();
        g.fill();
      }
      g.lineWidth = 2.2;
    };
    const centre = (x0: number, y0: number, x1: number, y1: number) => {
      g.setLineDash([10, 4, 2, 4]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 2.2;
    };
    if (v % 3 === 0) {
      // a robot: front view and side view
      for (const [ox, sw] of [
        [130, 1],
        [330, 0.6],
      ] as [number, number][]) {
        g.strokeRect(ox - 50 * sw, 70, 100 * sw, 70);
        g.strokeRect(ox - 60 * sw, 150, 120 * sw, 100);
        g.strokeRect(ox - 40 * sw, 255, 30 * sw, 60);
        g.strokeRect(ox + 10 * sw, 255, 30 * sw, 60);
        if (sw === 1) {
          for (const ex of [-22, 22]) {
            g.beginPath();
            g.arc(ox + ex, 100, 12, 0, Math.PI * 2);
            g.stroke();
          }
          g.beginPath();
          g.arc(ox, 195, 18, 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.moveTo(ox, 70);
          g.lineTo(ox, 45);
          g.stroke();
          g.beginPath();
          g.arc(ox, 40, 6, 0, Math.PI * 2);
          g.stroke();
        }
        centre(ox, 30, ox, 330);
      }
      dim(60, 70, 60, 315);
      dim(70, 335, 190, 335);
    } else if (v % 3 === 1) {
      // a rocking horse in pencil: the bow rocker and the horse's outline, a detail of the hoof joint
      g.beginPath();
      g.moveTo(40, 290);
      g.quadraticCurveTo(220, 350, 400, 290);
      g.moveTo(44, 275);
      g.quadraticCurveTo(220, 335, 396, 275);
      g.stroke();
      g.beginPath();
      g.moveTo(120, 300);
      g.lineTo(150, 200);
      g.lineTo(140, 150);
      g.quadraticCurveTo(200, 130, 280, 150);
      g.lineTo(310, 100);
      g.quadraticCurveTo(330, 70, 360, 90);
      g.lineTo(345, 120);
      g.lineTo(300, 180);
      g.lineTo(300, 200);
      g.lineTo(330, 300);
      g.moveTo(150, 200);
      g.quadraticCurveTo(110, 190, 90, 230);
      g.stroke();
      g.beginPath();
      g.arc(430, 120, 40, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(330, 290);
      g.lineTo(395, 150);
      g.stroke();
      dim(40, 360, 400, 360);
      dim(470, 300, 470, 70);
      for (let i = 0; i < 10; i++) {
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(170 + i * 10, 160);
        g.lineTo(160 + i * 10, 190);
        g.stroke();
      }
    } else {
      // a little engine: side elevation with wheels, and an end view
      g.strokeRect(60, 150, 220, 70);
      g.strokeRect(220, 90, 70, 130);
      g.strokeRect(90, 105, 20, 45);
      for (const x of [100, 170, 240]) {
        g.beginPath();
        g.arc(x, 235, 26, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(x, 235, 5, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeRect(360, 120, 80, 100);
      g.beginPath();
      g.arc(400, 160, 26, 0, Math.PI * 2);
      g.stroke();
      centre(30, 235, 300, 235);
      dim(60, 290, 290, 290);
      dim(320, 90, 320, 262);
    }
  });
}

/** A design drawing in a plain oak frame with a cream mat. */
export function DrawingItem({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const m = itemMats();
  const paper = wmat(`i:drawing:${v}`, () => new THREE.MeshStandardMaterial({ map: drawingTex(v), roughness: 0.8 }));
  const geo = useMemo(
    () =>
      once('i:drawing-frame', () => {
        const ow = 0.86;
        const oh = 0.66;
        const s = new THREE.Shape();
        s.moveTo(-ow / 2, -oh / 2);
        s.lineTo(ow / 2, -oh / 2);
        s.lineTo(ow / 2, oh / 2);
        s.lineTo(-ow / 2, oh / 2);
        s.closePath();
        const hole = new THREE.Path();
        hole.moveTo(-ow / 2 + 0.06, -oh / 2 + 0.06);
        hole.lineTo(-ow / 2 + 0.06, oh / 2 - 0.06);
        hole.lineTo(ow / 2 - 0.06, oh / 2 - 0.06);
        hole.lineTo(ow / 2 - 0.06, -oh / 2 + 0.06);
        hole.closePath();
        s.holes.push(hole);
        const frame = boxUV(slab(s, 0.05, 0.012, 2, 4).translate(0, 0, 0.025), 2);
        const mat = new THREE.PlaneGeometry(ow - 0.12, oh - 0.12).translate(0, 0, 0.012);
        paintFlat(mat, '#efe6d0');
        return { frame: paintFlat(frame, '#ffffff'), mat };
      }),
    [],
  );
  return (
    <group scale={1.2}>
      <mesh geometry={geo.frame} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.mat} material={m.vc} />
      <mesh material={paper} position={[0, 0, 0.014]}>
        <planeGeometry args={[0.62, 0.465]} />
      </mesh>
    </group>
  );
}

