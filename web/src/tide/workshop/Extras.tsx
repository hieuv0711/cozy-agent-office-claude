import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import type { Placement } from '../crew/Crew';
import { finishedFor } from '../crew/signals';
import { COUNTER, K } from './plan';
import { robotGeometry, shopMats, trainGeometry } from './props';

// The workshop's own things, following the makers: the toys finished today
// wait on the shop counter, behind the bell, for whoever comes to collect
// them (the four newest; a new one pushes the row along).

const SLOTS: [number, number][] = [
  [9.38, -0.9],
  [9.02, -0.9],
  [8.66, -0.9],
  [8.3, -0.9],
];

export function WorkshopExtras(_: { placed: Placement[] }) {
  const toys = useRef<(THREE.Group | null)[]>([]);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.3) return;
    last.current = clock.elapsedTime;
    const done = finishedFor('workshop').colors;
    const n = done.length;
    toys.current.forEach((g, i) => {
      if (!g) return;
      g.visible = i < n;
      // each toy is the same one for as long as it sits there (by its number in the day)
      const k = n - 1 - i;
      g.children[0].visible = k % 2 === 0;
      g.children[1].visible = k % 2 === 1;
      g.rotation.y = Math.PI / 2 + ((k * 0.7) % 0.6) - 0.3;
    });
  });
  const m = shopMats();
  return (
    <>
      {SLOTS.map(([x, z], i) => (
        <group key={i} ref={(g) => void (toys.current[i] = g)} position={[x, COUNTER.top, z]} scale={K} visible={false}>
          <mesh geometry={robotGeometry()} material={m.painted} castShadow />
          <mesh geometry={trainGeometry()} material={m.painted} castShadow />
        </group>
      ))}
    </>
  );
}
