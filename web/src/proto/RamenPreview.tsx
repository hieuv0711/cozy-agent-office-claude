import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CUSTOMER_SEATS, DINING_TABLES, PASS_SLOTS, PASS_SPOTS, SEATS, STATIONS } from '../tide/kitchen/plan';
import { ItemsLayer } from '../tide/ItemsLayer';
import { RAMEN_ITEMS, RAMEN_LAYOUT, RamenKitchen } from '../tide/rooms/RamenKitchen';
import { RamenBowl } from '../tide/rooms/ramen-props';
import { useTankEnvironment } from '../tank/water';
import { SceneWeather } from '../tide/weather';

// Preview of the ramen kitchen with its default items, under the app's look:
// /?proto=ramen  (add &cam=x,y,z&target=x,y,z&fov=n for close-ups; &cooks=0 hides the stand-ins,
// &back=1 adds stand-ins at the three back-line stations; &diners=0 hides the customers, waiter and their bowls;
// &items=0 hides the default items;
// &catalog=1 lays out every catalog item for review; &weather=clear|sunny|rain|snow)
// The capsule "cooks" are stand-ins for judging scale only: 3.1 tall, a head
// of radius 0.5 at y 2.0, at the stations, the first pass spot and two seats.

function StandIn({ x, z, yaw = 0, sit = 0, tint }: { x: number; z: number; yaw?: number; sit?: number; tint: string }) {
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }), [tint]);
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1d2b8', roughness: 0.55 }), []);
  const hat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 0.7 }), []);
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
      {/* eyes, so you can see which way it faces */}
      {[-0.17, 0.17].map((ex) => (
        <mesh key={ex} position={[ex, 2.02, 0.46]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshBasicMaterial color="#1c1714" />
        </mesh>
      ))}
      <mesh material={hat} position={[0, 2.78, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.36, 0.64, 24]} />
      </mesh>
    </group>
  );
}

/**
 * &catalog=1: every catalog item with seeds 0..2, in rows on the dining floor
 * (wall items on a board behind them), for close-up review. Preview only.
 */
function CatalogSheet() {
  const wallItems = RAMEN_ITEMS.filter((i) => i.surfaces.length === 1 && i.surfaces[0] === 'wall');
  const standing = RAMEN_ITEMS.filter((i) => !(i.surfaces.length === 1 && i.surfaces[0] === 'wall'));
  return (
    <group>
      {/* review lights, only in this sheet */}
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
            <group key={`${it.kind}-${seed}`} position={[-10 + col * 5 + seed * 1.3, 0, 5.2 + row * 1.6]}>
              <R seed={seed} />
            </group>
          );
        }),
      )}
    </group>
  );
}

const TINTS = ['#c0533f', '#3f7fa6', '#d7a33f', '#5f9a5a', '#8a5fa8', '#d07a9a', '#4c8f8a', '#b7743c', '#6b6f9a'];

export function RamenPreview() {
  const q = new URLSearchParams(location.search);
  const cooks = q.get('cooks') !== '0';
  const items = q.get('items') !== '0';
  const sheet = q.get('catalog') === '1';
  const back = q.get('back') === '1';
  const diners = q.get('diners') !== '0';
  const catalog = useMemo(() => new Map(RAMEN_ITEMS.map((i) => [i.kind, i])), []);
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
      <color attach="background" args={['#15110e']} />
      {/* the weather's clock and light (the app mounts this once per scene) */}
      <SceneWeather />
      <group ref={room}>
        <RamenKitchen />
        {items && !sheet && <ItemsLayer items={RAMEN_LAYOUT} catalog={catalog} />}
        {sheet && <CatalogSheet />}
      </group>
      {cooks && (
        <group>
          {STATIONS.slice(0, 6).map((s, i) => (
            <StandIn key={i} x={s.x} z={s.z} yaw={s.yaw} tint={TINTS[i]} />
          ))}
          {back &&
            STATIONS.slice(6).map((s, i) => (
              <StandIn key={`b${i}`} x={s.x} z={s.z} yaw={s.yaw} tint={TINTS[6 + i]} />
            ))}
          <StandIn x={PASS_SPOTS[0][0]} z={PASS_SPOTS[0][1]} tint="#e0c050" />
          {SEATS.slice(0, 2).map((s, i) => (
            <StandIn key={`s${i}`} x={s.x} z={s.z} yaw={s.yaw} sit={s.y} tint={TINTS[(i + 3) % TINTS.length]} />
          ))}
          {diners && (
            <group>
              {/* customers at the dining tables with a bowl in front of each, a waiter by the pass, bowls on the pass slots */}
              {CUSTOMER_SEATS.map((s, i) => {
                const t = DINING_TABLES[Math.floor(i / 3)];
                const dx = s.x - t.x;
                const dz = s.z - t.z;
                const l = Math.hypot(dx, dz);
                return (
                  <group key={`c${i}`}>
                    <StandIn x={s.x} z={s.z} yaw={s.yaw} sit={s.y} tint={['#7a6a9a', '#9a7a5a', '#5a8a9a'][i % 3]} />
                    <group position={[t.x + (dx / l) * 0.38, t.top, t.z + (dz / l) * 0.38]}>
                      <RamenBowl seed={i + 1} glaze={i % 5} broth={i} />
                    </group>
                  </group>
                );
              })}
              {PASS_SLOTS.slice(0, 3).map(([x, z], i) => (
                <group key={`ps${i}`} position={[x, 0.92, z]}>
                  <RamenBowl seed={i + 2} glaze={(i + 2) % 5} broth={i + 1} />
                </group>
              ))}
            </group>
          )}
        </group>
      )}
    </>
  );
}
