import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Precipitation } from './Precipitation';
import { tickWeather, U } from './runtime';
import { WindowWeather } from './WindowWeather';

/**
 * Mount once inside a scene's Canvas. It advances the weather every frame and
 * puts it over the whole picture, not only in the windows:
 *
 *   the room's light: rain brings a cool, grey fill (the stage's colour grade
 *   dims it too, see extras.css), snow a brighter, cooler one (snow light), and
 *   a sunny day a warm daylight that lifts the whole room, with a warm bounce
 *   from the floor (the sun's own patches and beams come in through each
 *   room's windows, see SunShine);
 *   in front of the room, rain or snow falls (we look in from the street);
 *   and on the glass we look through, drops run down (rain), or frost creeps
 *   in from the corners (snow); its middle stays clear.
 *
 * The light is always mounted and changes only its intensity and colour:
 * adding or removing a light would recompile every material in the scene.
 */
// diagnostic switches for measuring: ?glass=0 (no drops or frost on the view), ?front=0 (no rain or snow in front)
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

const SKY = {
  rain: new THREE.Color('#8ea6c8'),
  snow: new THREE.Color('#e4ecf8'),
  sun: new THREE.Color('#ffefd8'),
  night: new THREE.Color('#2b3140'),
  floor: new THREE.Color('#9a6a40'),
};

export function SceneWeather({ front = Q.get('front') !== '0', glass = Q.get('glass') !== '0' }: { front?: boolean; glass?: boolean }) {
  // one light only (each light costs every pixel, even at zero): a sky light
  // that tints the room for the weather
  const sky = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    tickWeather();
    const l = sky.current;
    if (!l) return;
    const rain = U.uRain.value;
    const snow = U.uSnow.value;
    const sun = U.uSun.value;
    const sum = Math.max(0.001, rain + snow + sun);
    l.intensity = 0.13 * rain + 0.34 * snow + 2.4 * sun;
    l.color.setRGB(
      (SKY.rain.r * rain + SKY.snow.r * snow + SKY.sun.r * sun) / sum,
      (SKY.rain.g * rain + SKY.snow.g * snow + SKY.sun.g * sun) / sum,
      (SKY.rain.b * rain + SKY.snow.b * snow + SKY.sun.b * sun) / sum,
    );
    l.groundColor.copy(SKY.night).lerp(SKY.floor, sun / sum);
  });
  return (
    <>
      <hemisphereLight ref={sky} name="weather-sky" args={['#d7e3ff', '#2b3140', 0]} />
      {front && <Precipitation min={[-16, 0.2, 5.0]} max={[16, 10, 8.2]} density={0.75} glow={{ position: [0, 2.4, 2.5], radius: 15, color: '#ffcf94', strength: 0.32 }} renderOrder={6} />}
      {glass && <ScreenGlass />}
    </>
  );
}

/** A virtual pane in front of the camera, the size of the view (its own scale, in metres, sets the drops' size). */
const PANE: [number, number] = [4.8, 2.7];
const AT = 0.5;
/** The glass is drawn at this fraction of the picture's resolution (drops are soft: nobody sees the difference). */
const GLASS_RES = 0.5;

/**
 * The glass we look through, on the camera: drops or frost round the edges of
 * the picture. Its shader is heavy and it covers most of the view, so it is
 * drawn into a texture at half the resolution (a quarter of the work), only
 * while the glass is wet or frosted, and that texture is laid over the view.
 */
function ScreenGlass() {
  const g = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const glass = useMemo(() => {
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-PANE[0] / 2, PANE[0] / 2, PANE[1] / 2, -PANE[1] / 2, 0.1, 10);
    cam.position.set(0, 0, 5);
    const target = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: false, stencilBuffer: false });
    const show = new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, toneMapped: false });
    return { scene, cam, target, show };
  }, []);
  useEffect(() => {
    glass.target.setSize(Math.max(16, Math.round(size.width * dpr * GLASS_RES)), Math.max(16, Math.round(size.height * dpr * GLASS_RES)));
  }, [glass, size.width, size.height, dpr]);
  useEffect(
    () => () => {
      glass.target.dispose();
      glass.show.dispose();
    },
    [glass],
  );
  const shown = useRef<THREE.Mesh>(null);
  // drawn before the frame (useFrame's callbacks run in order of priority)
  useFrame(() => {
    const wet = U.uWet.value > 0.003 || U.uFrost.value > 0.003;
    if (shown.current) {
      shown.current.visible = wet;
      // for test scripts: what the glass shows
      shown.current.userData.glass = { wet: U.uWet.value, frost: U.uFrost.value, clear: [0.66, 1.24] };
    }
    if (!wet) return;
    const prev = gl.getRenderTarget();
    const clear = gl.getClearAlpha();
    gl.setRenderTarget(glass.target);
    gl.setClearAlpha(0);
    gl.clear(true, false, false);
    gl.render(glass.scene, glass.cam);
    gl.setRenderTarget(prev);
    gl.setClearAlpha(clear);
  }, -1);
  useFrame(() => {
    const grp = g.current;
    if (!grp || !camera.isPerspectiveCamera) return;
    // the view's full size at this distance (with a view offset, the whole virtual view)
    const h = (2 * AT * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / camera.zoom;
    const w = h * camera.aspect;
    grp.position.copy(camera.position);
    grp.quaternion.copy(camera.quaternion);
    grp.translateZ(-AT);
    grp.scale.set(w / PANE[0], h / PANE[1], 1);
  });
  return (
    <>
      {createPortal(<WindowWeather width={PANE[0]} height={PANE[1]} clearCenter={[0.66, 1.24]} opacity={0.8} seed={7} renderOrder={0} />, glass.scene)}
      <group ref={g}>
        <mesh ref={shown} material={glass.show} renderOrder={50} visible={false}>
          <planeGeometry args={PANE} />
        </mesh>
      </group>
    </>
  );
}
