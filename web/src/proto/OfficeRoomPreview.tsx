import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CHAIR_SEAT, SEATS, STATIONS, WAIT_SPOTS } from '../tide/office/plan';
import { ItemsLayer } from '../tide/ItemsLayer';
import { OFFICE_ITEMS, OFFICE_LAYOUT, OfficeRoom } from '../tide/rooms/OfficeRoom';
import { useTankEnvironment } from '../tank/water';
import { SceneWeather } from '../tide/weather';

// Preview of the night office with its default items, under the app's look:
// /?proto=office-room  (add &cam=x,y,z&target=x,y,z&fov=n for close-ups; &people=0 hides the stand-ins;
// &items=0 hides the default items; &catalog=1 lays out every catalog item for review;
// &sit=1 seats the lounge stand-ins; &weather=clear|sunny|rain|snow)
// The capsule "people" are stand-ins for judging scale and sightlines only: a
// head of radius 0.5 at y 1.85 seated at the stations, 2.0 standing at the
// first waiting spot and at the first two lounge seats.

function StandIn({ x, z, yaw = 0, seat = 0, tint }: { x: number; z: number; yaw?: number; seat?: number; tint: string }) {
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }), [tint]);
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1d2b8', roughness: 0.55 }), []);
  // seated: hips on the seat, head centre at 1.85 (on a 0.53 chair); standing: head centre at 2.0
  const headY = seat ? seat + 1.32 : 2.0;
  const bodyY = seat ? seat + 0.45 : 0.82;
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <mesh material={body} position={[0, bodyY, 0]} castShadow>
        <capsuleGeometry args={[0.4, seat ? 0.5 : 0.8, 8, 16]} />
      </mesh>
      <mesh material={skin} position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[0.5, 32, 20]} />
      </mesh>
      {/* seated: thighs forward about 0.64 under the desk, shins down to the floor (for judging knee room) */}
      {seat > 0 &&
        [-0.16, 0.16].map((lx) => (
          <group key={lx}>
            <mesh material={body} position={[lx, seat + 0.07, 0.27]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.11, 0.5, 6, 12]} />
            </mesh>
            <mesh material={body} position={[lx, (seat + 0.07) / 2, 0.58]} castShadow>
              <capsuleGeometry args={[0.09, seat - 0.12, 6, 12]} />
            </mesh>
          </group>
        ))}
      {/* eyes, so you can see which way it faces */}
      {[-0.17, 0.17].map((ex) => (
        <mesh key={ex} position={[ex, headY + 0.02, 0.46]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshBasicMaterial color="#1c1714" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * &catalog=1: every catalog item with seeds 0..2, in rows on the floor in
 * front of the desks (wall items on a board behind them), for close-up review.
 */
function CatalogSheet() {
  const wallItems = OFFICE_ITEMS.filter((i) => i.surfaces.length === 1 && i.surfaces[0] === 'wall');
  // tallest at the back, so nothing hides behind anything else
  const standing = OFFICE_ITEMS.filter((i) => !(i.surfaces.length === 1 && i.surfaces[0] === 'wall')).sort((a, b) => b.height - a.height);
  return (
    <group>
      <directionalLight position={[3, 8, 14]} intensity={1.6} color="#fff0dc" />
      <pointLight position={[0, 3, 9]} intensity={30} distance={20} decay={1.5} color="#ffe2c0" />
      <mesh position={[0, 3.2, 3.4]} receiveShadow>
        <boxGeometry args={[34, 6.4, 0.1]} />
        <meshStandardMaterial color="#8a7660" roughness={0.9} />
      </mesh>
      {wallItems.map((it, i) =>
        [0, 1, 2].map((seed) => {
          const R = it.Render;
          return (
            <group key={`${it.kind}-${seed}`} position={[-10.5 + i * 6.0 + seed * 1.9, 4.8 - (seed % 2) * 2.0, 3.46]}>
              <R seed={seed} />
            </group>
          );
        }),
      )}
      {standing.map((it, i) =>
        [0, 1, 2].map((seed) => {
          const R = it.Render;
          const col = i % 4;
          const row = Math.floor(i / 4);
          return (
            <group key={`${it.kind}-${seed}`} position={[-11 + col * 5.6 + seed * 1.6, 0, 5.0 + row * 2.8]}>
              <R seed={seed} />
            </group>
          );
        }),
      )}
    </group>
  );
}

const TINTS = ['#c0533f', '#3f7fa6', '#d7a33f', '#5f9a5a', '#8a5fa8', '#d07a9a', '#4c8f8a', '#b7743c', '#6b6f9a'];

export function OfficeRoomPreview() {
  const q = new URLSearchParams(location.search);
  const people = q.get('people') !== '0';
  const items = q.get('items') !== '0';
  const sheet = q.get('catalog') === '1';
  const sit = q.get('sit') === '1';
  const catalog = useMemo(() => new Map(OFFICE_ITEMS.map((i) => [i.kind, i])), []);
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
      <color attach="background" args={['#120e0c']} />
      {/* the weather's clock and light (the app mounts this once per scene) */}
      <SceneWeather />
      <group ref={room}>
        <OfficeRoom />
        {items && !sheet && <ItemsLayer items={OFFICE_LAYOUT} catalog={catalog} />}
        {sheet && <CatalogSheet />}
      </group>
      {people && (
        <group>
          {STATIONS.map((s, i) => (
            <StandIn key={i} x={s.x} z={s.z} yaw={s.yaw} seat={CHAIR_SEAT} tint={TINTS[i]} />
          ))}
          <StandIn x={WAIT_SPOTS[0][0]} z={WAIT_SPOTS[0][1]} tint="#e0c050" />
          {SEATS.slice(0, 2).map((s, i) => (
            <StandIn key={`s${i}`} x={s.x} z={s.z} yaw={s.yaw} seat={sit ? s.y : 0} tint={TINTS[(i + 3) % TINTS.length]} />
          ))}
        </group>
      )}
    </>
  );
}
