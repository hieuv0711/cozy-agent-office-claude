import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { StationProps } from '../crew/Crew';
import { BENCH_TOP, CUT_X, hammerAt, PLANK, TOY, TRAY } from './acts';
import { blueprintRollGeometry, hammerGeometry, partsTrayGeometry, plankGeometry, robotGeometry, sawGeometry, shopMats, trainGeometry } from './props';
import { K } from './plan';

// A maker's things on the bench, in the bench's frame: a plank (sawdust falls
// while it's sawn), the toy engine being put together (it jumps a little at
// each blow), a parts tray, the blueprint rolled up, the saw and hammer put
// down when not in use, and a little wind-up robot that waddles along the
// bench while a workflow runs.

const DUST = 10;

export const Bench = memo(function Bench({ st, act, seed, rush }: StationProps) {
  const m = shopMats();
  const toy = useRef<THREE.Group>(null);
  const dust = useRef<(THREE.Mesh | null)[]>([]);
  const robot = useRef<THREE.Group>(null);
  const dustGeo = useMemo(() => new THREE.BoxGeometry(0.004, 0.004, 0.004), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (toy.current) toy.current.position.y = BENCH_TOP + (act === 'hammer' && hammerAt(t, seed).hit ? 0.004 : 0);
    // sawdust drifting down from the cut
    dust.current.forEach((d, i) => {
      if (!d) return;
      d.visible = act === 'saw';
      if (!d.visible) return;
      const ph = (t * 0.9 + i / DUST) % 1;
      d.position.set(CUT_X + Math.sin(i * 2.3) * 0.02, PLANK.y + 0.02 - ph * 0.02 * (i % 3), PLANK.z + 0.03 + Math.cos(i * 1.7) * 0.03 + ph * 0.02);
      d.position.y = BENCH_TOP + 0.002 + (1 - ph) * 0.03 * ((i % 4) / 4);
      d.rotation.set(i, ph * 4, i * 0.5);
    });
    // the wind-up robot waddles to and fro along the back of the bench
    if (robot.current) {
      robot.current.visible = rush;
      const u = Math.sin(t * 0.6 + seed);
      robot.current.position.set(0.14 * u, BENCH_TOP + 0.004 * Math.abs(Math.sin(t * 9)), 0.56);
      robot.current.rotation.set(0, Math.cos(t * 0.6 + seed) > 0 ? Math.PI / 2 : -Math.PI / 2, 0.08 * Math.sin(t * 9));
    }
  });
  return (
    <group position={[st.x, 0, st.z]} rotation={[0, st.yaw, 0]} scale={K}>
      <mesh geometry={plankGeometry()} material={m.wood} position={[PLANK.x, PLANK.y, PLANK.z]} castShadow receiveShadow />
      <group ref={toy} position={[TOY.x, TOY.y, TOY.z]} rotation={[0, 0.25, 0]}>
        <mesh geometry={trainGeometry()} material={m.painted} castShadow />
      </group>
      <mesh geometry={partsTrayGeometry()} material={m.wood} position={[TRAY.x, TRAY.y, TRAY.z]} rotation={[0, -0.3, 0]} castShadow receiveShadow />
      {act !== 'blueprint' && <mesh geometry={blueprintRollGeometry()} material={m.wood} position={[0.24, BENCH_TOP, 0.5]} rotation={[0, 0.15, 0]} castShadow />}
      {act !== 'saw' && <mesh geometry={sawGeometry()} material={m.painted} position={[-0.3, BENCH_TOP + 0.003, 0.5]} rotation={[0, -1.45, Math.PI / 2]} castShadow />}
      {act !== 'hammer' && <mesh geometry={hammerGeometry()} material={m.painted} position={[0.02, BENCH_TOP + 0.018, 0.5]} rotation={[0, 1.3, Math.PI / 2]} castShadow />}
      {Array.from({ length: DUST }, (_, i) => (
        <mesh key={i} ref={(d) => void (dust.current[i] = d)} geometry={dustGeo} material={m.dust} visible={false} />
      ))}
      <group ref={robot} visible={false}>
        <mesh geometry={robotGeometry()} material={m.painted} castShadow />
      </group>
    </group>
  );
});
