import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ItemsLayer } from '../tide/ItemsLayer';
import { WORKSHOP_ITEMS, WORKSHOP_LAYOUT, WorkshopRoom } from '../tide/rooms/WorkshopRoom';
import { SceneWeather } from '../tide/weather';
import { SEATS, STATIONS, WAIT_SPOTS } from '../tide/workshop/plan';
import { useTankEnvironment } from '../tank/water';

// Preview of the toy workshop with its default items, under the app's look:
// /?proto=workshop-room  (add &cam=x,y,z&target=x,y,z&fov=n for close-ups; &makers=0 hides the stand-ins,
// &back=1 adds stand-ins at the three tool-bench stations; &all=1 puts one at every station, waiting spot and seat;
// &items=0 hides the default items;
// &catalog=1 lays out every catalog item for review; &weather=clear|sunny|rain|snow)
// The capsule "makers" are stand-ins for judging scale only: a head of radius
// 0.5 at y 2.0 (1.85 seated), at the front stations, the first waiting spot
// and two seats by the stove.

function StandIn({ x, z, yaw = 0, sit = 0, tint }: { x: number; z: number; yaw?: number; sit?: number; tint: string }) {
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }), [tint]);
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1d2b8', roughness: 0.55 }), []);
  const cap = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c0533f', roughness: 0.7 }), []);
  // seated stand-ins drop so the hips sit on the seat (hips ~0.66 when standing)
  const drop = sit ? sit - 0.66 : 0;
  return (
    <group position={[x, drop, z]} rotation={[0, yaw, 0]}>
      <mesh material={body} position={[0, 0.82, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
      </mesh>
      <mesh material={skin} position={[0, 2.0, 0]} castShadow>
        <sphereGeometry args={[0.5, 32, 20]} />
      </mesh>
      {[-0.17, 0.17].map((ex) => (
        <mesh key={ex} position={[ex, 2.02, 0.46]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshBasicMaterial color="#1c1714" />
        </mesh>
      ))}
      <mesh material={cap} position={[0, 2.42, -0.02]} castShadow>
        <sphereGeometry args={[0.46, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

/** &catalog=1: every catalog item with seeds 0..2, in rows on the shop floor (wall items on a board behind them). Preview only. */
function CatalogSheet() {
  const wallItems = WORKSHOP_ITEMS.filter((i) => i.surfaces.length === 1 && i.surfaces[0] === 'wall');
  const standing = WORKSHOP_ITEMS.filter((i) => !(i.surfaces.length === 1 && i.surfaces[0] === 'wall'));
  return (
    <group>
      <directionalLight position={[3, 8, 14]} intensity={1.6} color="#fff0dc" />
      <pointLight position={[0, 3, 9]} intensity={30} distance={20} decay={1.5} color="#ffe2c0" />
      <mesh position={[0, 3.2, 3.4]} receiveShadow>
        <boxGeometry args={[24, 6.4, 0.1]} />
        <meshStandardMaterial color="#8a7660" roughness={0.9} />
      </mesh>
      {wallItems.map((it, i) =>
        [0, 1, 2].map((seed) => {
          const R = it.Render;
          return (
            <group key={`${it.kind}-${seed}`} position={[-10.5 + i * 4.4 + seed * 1.45, 4.7 - (seed % 2) * 2.1, 3.46]}>
              <R seed={seed} />
            </group>
          );
        }),
      )}
      {standing.map((it, i) =>
        [0, 1, 2].map((seed) => {
          const R = it.Render;
          const col = i % 5;
          const row = Math.floor(i / 5);
          return (
            <group key={`${it.kind}-${seed}`} position={[-10 + col * 5 + seed * 1.4, 0, 5.2 + row * 1.7]}>
              <R seed={seed} />
            </group>
          );
        }),
      )}
    </group>
  );
}

const TINTS = ['#c0533f', '#3f7fa6', '#d7a33f', '#5f9a5a', '#8a5fa8', '#d07a9a', '#4c8f8a', '#b7743c', '#6b6f9a'];

export function WorkshopRoomPreview() {
  const q = new URLSearchParams(location.search);
  const makers = q.get('makers') !== '0';
  const items = q.get('items') !== '0';
  const sheet = q.get('catalog') === '1';
  const all = q.get('all') === '1';
  const back = q.get('back') === '1' || all;
  const catalog = useMemo(() => new Map(WORKSHOP_ITEMS.map((i) => [i.kind, i])), []);
  useTankEnvironment(0.45);
  // as in the app, room materials only catch a little of the studio reflections
  const room = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    room.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.3;
    });
  });
  return (
    <>
      <color attach="background" args={['#120e0b']} />
      <SceneWeather />
      <group ref={room}>
        <WorkshopRoom />
        {items && !sheet && <ItemsLayer items={WORKSHOP_LAYOUT} catalog={catalog} />}
        {sheet && <CatalogSheet />}
      </group>
      {makers && (
        <group>
          {STATIONS.slice(0, 6).map((s, i) => (
            <StandIn key={i} x={s.x} z={s.z} yaw={s.yaw} tint={TINTS[i]} />
          ))}
          {back &&
            STATIONS.slice(6).map((s, i) => (
              <StandIn key={`b${i}`} x={s.x} z={s.z} yaw={s.yaw} tint={TINTS[6 + i]} />
            ))}
          {WAIT_SPOTS.slice(0, all ? WAIT_SPOTS.length : 1).map(([x, z], i) => (
            <StandIn key={`w${i}`} x={x} z={z} tint="#e0c050" />
          ))}
          {SEATS.slice(0, all ? SEATS.length : 2).map((s, i) => (
            <StandIn key={`s${i}`} x={s.x} z={s.z} yaw={s.yaw} sit={s.y} tint={TINTS[(i + 3) % TINTS.length]} />
          ))}
        </group>
      )}
    </>
  );
}
