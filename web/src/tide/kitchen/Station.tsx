import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BOARD, BROTH_Y, CARROT_TOP, CHOP, carrotFace, chopAt, POT, POT_BASE } from './acts';
import { boardGeometry, bookGeometry, brothGeometry, burnerGeometry, carrotGeometry, carrotTopGeometry, coinGeometry, flameGeometry, knifeGeometry, ladleGeometry, potGeometry, propMats, ramenGeometry } from './cookProps';
import { COUNTER, K, type Station } from './plan';

// A cook's work spot on the counter, in the cook's frame at work: the board
// with a carrot being sliced, the knife resting on it when not in use, a pot of
// broth on a little burner with its ladle, and the recipe book when the cook
// looks something up. It follows its cook: the burner is lit while they stir,
// the slices pile up in time with the knife.

let steamTex: THREE.CanvasTexture | null = null;
function steamTexture() {
  if (steamTex) return steamTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  steamTex = new THREE.CanvasTexture(c);
  return steamTex;
}

/** Soft puffs rising from the broth: a wisp while it simmers, plenty while stirred. */
export function Steam({ origin, strength, seed = 0, count = 7, height = 0.5, size = 0.07 }: { origin: [number, number, number]; strength: React.MutableRefObject<number>; seed?: number; count?: number; height?: number; size?: number }) {
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: count }, () => new THREE.SpriteMaterial({ map: steamTexture(), color: '#f6f1ea', transparent: true, opacity: 0, depthWrite: false })), [count]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.32 + seed;
    const k = strength.current;
    sprites.current.forEach((sp, i) => {
      if (!sp) return;
      const ph = (t + i / count) % 1;
      const drift = Math.sin(t * 3 + i * 2.1) * 0.03 * ph;
      sp.position.set(origin[0] + drift + Math.sin(i * 1.7) * 0.03, origin[1] + ph * height, origin[2] + Math.cos(i * 2.3) * 0.03);
      const s = size * (0.6 + ph * 1.6);
      sp.scale.set(s, s, s);
      mats[i].opacity = k * 0.42 * Math.sin(Math.min(1, ph * 1.4) * Math.PI) * (1 - ph * 0.5);
      sp.visible = k > 0.02;
    });
  });
  return (
    <group>
      {mats.map((m, i) => (
        <sprite key={i} ref={(s) => void (sprites.current[i] = s)} material={m} />
      ))}
    </group>
  );
}

const coinSpots = Array.from({ length: CHOP.cuts }, (_, k) => {
  const row = Math.floor(k / 4);
  return {
    x: BOARD.x - 0.105 - (k % 4) * 0.004 - row * 0.008 + Math.sin(k * 7.3) * 0.012,
    y: BOARD.y + 0.0235 + row * 0.006 + (k % 2) * 0.002,
    z: BOARD.z - 0.03 + Math.sin(k * 3.1) * 0.035,
    rx: Math.sin(k * 5.7) * 0.25,
    rz: Math.cos(k * 4.3) * 0.25,
  };
});

// A workflow running for this cook: an order of three bowls goes out on the
// counter's front ledge, one after another, steaming.
function OrderUp({ z }: { z: number }) {
  const pm = propMats();
  const bowls = useRef<(THREE.Mesh | null)[]>([]);
  const born = useRef(-1);
  const steam = useRef(0.7);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (born.current < 0) born.current = t;
    bowls.current.forEach((b, i) => {
      if (!b) return;
      const k = Math.min(1, Math.max(0, (t - born.current - i * 0.7) / 0.35));
      b.scale.setScalar(k < 1 ? k * (1.2 - 0.2 * k) : 1);
    });
  });
  return (
    <group>
      {[-0.27, 0, 0.27].map((x, i) => (
        <group key={i} position={[x, BOARD.y, z]}>
          <mesh ref={(m) => void (bowls.current[i] = m)} geometry={ramenGeometry()} material={pm.ceramic} rotation={[0, i * 1.9, 0]} scale={0} castShadow />
          {i === 1 && <Steam origin={[0, 0.07, 0]} strength={steam} seed={i} count={5} height={0.3} size={0.05} />}
        </group>
      ))}
    </group>
  );
}

export const StationProps = memo(function StationProps({ st, act, seed, busy, rush = false }: { st: Station; act: string | null; seed: number; busy: boolean; rush?: boolean }) {
  const pm = propMats();
  const carrot = useRef<THREE.Group>(null);
  const coins = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const steam = useRef(0);
  const target = useRef(0);
  const cooking = act === 'stir' || act === 'strain' || act === 'taste';
  target.current = cooking ? 1 : busy ? 0.25 : 0;
  const chopping = act === 'chop';
  const book = act === 'book';
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    steam.current += (target.current - steam.current) * (1 - Math.exp(-Math.min(0.1, dt) * 1.5));
    if (flame.current) {
      flame.current.visible = cooking;
      flame.current.scale.set(1, 0.85 + 0.25 * Math.sin(t * 23 + seed) * Math.sin(t * 9.1), 1);
    }
    const c = carrot.current;
    const p = coins.current;
    if (!c || !p) return;
    if (!chopping) {
      // a whole carrot waits on the board
      c.position.set(carrotFace(0), BOARD.y + 0.0225, BOARD.z - 0.008);
      c.children[0].scale.set(CARROT_TOP - carrotFace(0), 1, 1);
      p.visible = false;
      return;
    }
    const s = chopAt(t, seed);
    const face = carrotFace(s.done);
    c.position.set(face, BOARD.y + 0.0225, BOARD.z - 0.008);
    c.children[0].scale.set(Math.max(0.02, CARROT_TOP - face), 1, 1);
    p.visible = true;
    // slices pile up as they are cut, and are swept away in the pause
    const sweep = s.cutting ? 0 : Math.min(1, (s.u - CHOP.cuts * CHOP.every) / (CHOP.cycle - CHOP.cuts * CHOP.every - 0.15));
    p.children.forEach((m, k) => {
      m.visible = k < s.done;
      const q = coinSpots[k];
      m.position.set(q.x - sweep * 0.08, q.y, q.z);
      m.scale.setScalar(1 - sweep);
    });
  });

  return (
    <group position={[st.x, 0, st.z]} rotation={[0, st.yaw, 0]} scale={K}>
      <mesh geometry={boardGeometry()} material={pm.wood} position={[BOARD.x, BOARD.y, BOARD.z]} castShadow receiveShadow />
      {!chopping && !book && <mesh geometry={knifeGeometry()} material={pm.blade} position={[BOARD.x + 0.02, BOARD.y + 0.0225, BOARD.z + 0.07]} rotation={[0, -Math.PI / 2 + 0.15, Math.PI / 2]} castShadow />}
      <group ref={carrot} visible={!book}>
        <mesh geometry={carrotGeometry()} material={pm.veg} castShadow />
        <mesh geometry={carrotTopGeometry()} material={pm.veg} position={[CARROT_TOP - carrotFace(0), 0, 0]} />
      </group>
      <group ref={coins}>
        {coinSpots.map((q, k) => (
          <mesh key={k} geometry={coinGeometry()} material={pm.veg} rotation={[q.rx, 0, q.rz]} castShadow />
        ))}
      </group>
      {book && <mesh geometry={bookGeometry()} material={pm.wood} position={[BOARD.x, BOARD.y + 0.02, BOARD.z]} castShadow />}
      <mesh geometry={burnerGeometry()} material={pm.iron} position={[POT.x, POT.y, POT.z]} castShadow receiveShadow />
      <mesh ref={flame} geometry={flameGeometry()} material={pm.flame} position={[POT.x, POT.y, POT.z]} visible={false} />
      <group position={[POT.x, POT_BASE, POT.z]}>
        <mesh geometry={potGeometry()} material={pm.steel} castShadow receiveShadow />
        <mesh geometry={brothGeometry()} material={pm.broth} />
      </group>
      {act !== 'stir' && act !== 'strain' && <mesh geometry={ladleGeometry()} material={pm.steel} position={[POT.x - 0.085, BROTH_Y + 0.11, POT.z - 0.03]} rotation={[0.25, 0, 0.45]} castShadow />}
      <Steam origin={[POT.x, BROTH_Y + 0.02, POT.z]} strength={steam} seed={seed} />
      {rush && st.yaw === 0 && <OrderUp z={(COUNTER.front - 0.27 - st.z) / K} />}
    </group>
  );
});
