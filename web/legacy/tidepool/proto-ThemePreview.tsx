import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ItemsLayer } from '../tide/ItemsLayer';
import { DESK_ITEMS, DESK_LAYOUT, DeskRoom } from '../tide/rooms/DeskRoom';
import { GREENHOUSE_ITEMS, GREENHOUSE_LAYOUT, GreenhouseRoom } from '../tide/rooms/GreenhouseRoom';
import { SceneWeather, useWeather, weatherLight } from '../tide/weather';
import { useTankEnvironment, WaterClock } from '../tank/water';
import { Aquarium, Tank } from './Tidepool';

// Preview of a theme's room around the tank with its default items:
// /?proto=theme&theme=desk | greenhouse  (add &cam=x,y,z&target=x,y,z&fov=n for close-ups)
// &weather=clear | rain | storm | snow picks the weather; &flash=0..1 holds the lightning at that
// brightness (for stills); in development `__weatherStrike()` fires a strike from the console.

const ROOMS = {
  desk: { Room: DeskRoom, items: DESK_ITEMS, layout: DESK_LAYOUT },
  greenhouse: { Room: GreenhouseRoom, items: GREENHOUSE_ITEMS, layout: GREENHOUSE_LAYOUT },
};

/** The tank scene's lights (as in TankShell's TankLight), at the weather's room levels. */
function WeatherTankLight() {
  const target = useMemo(() => new THREE.Object3D(), []);
  const room = weatherLight(useWeather());
  return (
    <>
      <ambientLight intensity={room.amb} color="#cfe6f0" />
      <hemisphereLight args={['#a9dcff', '#4a3a2a']} intensity={room.hemi} />
      <directionalLight position={[-14, 6, 8]} intensity={room.fill} color="#ffb57d" />
      <primitive object={target} position={[0, -1.2, 0]} />
      <spotLight position={[2, 9, 3]} target={target} angle={0.66} penumbra={0.3} intensity={2.3} decay={0} color="#e3f8ff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-near={2} shadow-camera-far={30} />
      <pointLight position={[0, 1.5, 1.5]} intensity={3} color="#8fe0ec" distance={12} decay={2} />
      <pointLight position={[0, -1.7, 4.2]} intensity={4} color="#5fd2e8" distance={8} decay={2} />
    </>
  );
}

export function ThemePreview() {
  const id = new URLSearchParams(location.search).get('theme') as keyof typeof ROOMS;
  const theme = ROOMS[id] || ROOMS.desk;
  const catalog = useMemo(() => new Map(theme.items.map((i) => [i.kind, i])), [theme]);
  useTankEnvironment(0.45);
  // Room materials only catch a little of the studio reflections, so the room
  // stays dark around the glowing tank (the tank's own materials are untouched).
  const room = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    room.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.3;
    });
  });
  const { Room } = theme;
  return (
    <>
      <WaterClock />
      <color attach="background" args={['#14110f']} />
      <WeatherTankLight />
      <SceneWeather />
      <group ref={room}>
        <Room />
        <ItemsLayer items={theme.layout} catalog={catalog} />
      </group>
      <Tank />
      <Aquarium place="desk" />
    </>
  );
}
