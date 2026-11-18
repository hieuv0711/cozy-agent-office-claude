import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tubeThrough } from '../../tank/geo';
import { RIG, toqueGeometry } from '../kitchen/cookParts';
import { weatherUi } from '../weather/state';
import { sunHatBandGeometry, sunHatGeometry } from './outfits';
import { everyonesHeld, faceMood, type Kit, type Look, type Motion, rainColorOf, wardrobe, wearFor } from './Person';
import { useRig, useRigRefs } from './rig';

// A little bot: one of the people drawn as a small robot. A glossy rounded
// shell, a head with a dark glass screen for a face, ball hands, short legs,
// and an antenna whose light shows how they are (green at work, yellow
// blinking when they need you, dim asleep). The face on the screen glows in
// their session's colour and shows what they're doing: eyes that blink, a
// smile when something is done or on a break, dots while thinking, a round
// "o" when they need you, closed lines asleep, a mouth that moves when they
// talk. They wear what the people wear (crew/Person.tsx `wardrobe`): the
// session's colour as an apron or a cardigan, the work hats, a rain poncho with
// a hood, a scarf and a beanie in snow, and the customers' coats, shirts,
// sunglasses and straw hats. Same rig, same acts, same things in their hands.

// ---------- shapes (cook metres; built once, shared by every bot) ----------

/** The body's outline from the hips up (radius, height), turned round the y axis. */
const BODY: [number, number][] = [
  [0, 0.27],
  [0.085, 0.273],
  [0.125, 0.29],
  [0.146, 0.33],
  [0.155, 0.4],
  [0.154, 0.48],
  [0.146, 0.55],
  [0.128, 0.6],
  [0.096, 0.632],
  [0.05, 0.648],
  [0, 0.652],
];
const DEPTH = 0.82;

/** The body's radius at a height (straight from the outline). */
function radiusAt(y: number) {
  for (let i = 1; i < BODY.length; i++) {
    const [r0, y0] = BODY[i - 1];
    const [r1, y1] = BODY[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return 0;
}

/** A piece of clothing over the body: the outline from y0 to y1, a little out from the shell, round part of the way (phi 0 is the front). */
function over(y0: number, y1: number, grow: number, phiStart = 0, phiLength = Math.PI * 2, flare = 0) {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    // below the body's base a coat or a poncho hangs straight down, flaring a little
    const r = y < 0.29 ? 0.152 + flare * (0.29 - y) : radiusAt(y);
    pts.push(new THREE.Vector2(r * grow + 0.004, y));
  }
  return new THREE.LatheGeometry(pts, 40, phiStart, phiLength).scale(1, 1, DEPTH);
}

/** Shapes joined into one (made alike first: some come with an index and some without). */
const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;

const shapes = (() => {
  let made: ReturnType<typeof build> | null = null;
  function build() {
    const body = new THREE.LatheGeometry(
      BODY.map(([r, y]) => new THREE.Vector2(r, y)),
      44,
    ).scale(1, 1, DEPTH);
    const seam = new THREE.TorusGeometry(1, 0.0045, 6, 48).rotateX(Math.PI / 2);
    // a panel line round the waist (scaled to the body there)
    const waist = seam.clone().scale(radiusAt(0.4) + 0.001, 1, (radiusAt(0.4) + 0.001) * DEPTH).translate(0, 0.4, 0);
    const neck = new THREE.CylinderGeometry(0.04, 0.05, 0.075, 16).translate(0, 0.68, 0);
    const head = new RoundedBoxGeometry(0.46, 0.38, 0.39, 5, 0.1);
    const screen = new RoundedBoxGeometry(0.315, 0.235, 0.03, 4, 0.06).translate(0, -0.005, 0.185);
    // a ring round the screen in the session's colour
    const bezel = new RoundedBoxGeometry(0.345, 0.265, 0.024, 4, 0.075).translate(0, -0.005, 0.182);
    const ear = new THREE.CylinderGeometry(0.046, 0.046, 0.05, 20).rotateZ(Math.PI / 2);
    const earR = ear.clone().translate(-0.24, 0, 0);
    const earL = ear.clone().translate(0.24, 0, 0);
    const ears = merge([earR, earL]);
    const stalk = new THREE.CylinderGeometry(0.009, 0.011, 0.1, 8).translate(0, 0.235, 0);
    const tip = new THREE.SphereGeometry(0.028, 16, 12).translate(0, 0.295, 0);
    // arms: a joint at the shoulder, the upper arm, the forearm and a ball hand
    const shoulder = new THREE.SphereGeometry(0.043, 16, 12);
    const upper = new THREE.CapsuleGeometry(0.035, 0.095, 4, 12).translate(0, -0.0775, 0);
    const fore = new THREE.CapsuleGeometry(0.033, 0.095, 4, 12).translate(0, -0.07, 0);
    const hand = new THREE.SphereGeometry(0.044, 18, 14).scale(1, 0.92, 0.86).translate(0, -0.165, 0);
    const leg = new THREE.CapsuleGeometry(0.046, 0.12, 4, 12).translate(0, -0.12, 0);
    const foot = new RoundedBoxGeometry(0.092, 0.06, 0.135, 2, 0.026).translate(0, -0.27, 0.022);
    // the face, glowing on the screen
    const z = 0.2015;
    const eye = new THREE.CapsuleGeometry(0.019, 0.032, 4, 12).scale(1, 1, 0.12);
    const bar = new THREE.CapsuleGeometry(0.0085, 0.034, 3, 8).rotateZ(Math.PI / 2).scale(1, 1, 0.12);
    const dot = new THREE.CircleGeometry(0.0135, 18);
    const ring = new THREE.RingGeometry(0.011, 0.02, 24);
    const round = new THREE.CircleGeometry(0.025, 24);
    const arc = (up: boolean, w: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const x = -w + (i / 10) * 2 * w;
        pts.push(new THREE.Vector3(x, (up ? 1 : -1) * (0.62 * w - (x * x) / (w * 1.6)), 0));
      }
      return tubeThrough(pts, () => 0.0075, 20, 6).geometry.scale(1, 1, 0.3);
    };
    // the work hats and the weather's things, made for a square-ish head
    // a head scarf over the top of the head, knotted at the back
    const band = new RoundedBoxGeometry(0.474, 0.13, 0.404, 5, 0.064).translate(0, 0.14, -0.002);
    const knot = new THREE.SphereGeometry(0.036, 12, 10).scale(1, 0.8, 0.7).translate(0.09, 0.13, -0.215);
    const capCrown = new RoundedBoxGeometry(0.47, 0.07, 0.405, 3, 0.03).translate(0, 0.2, -0.005);
    const brim = new THREE.CylinderGeometry(0.15, 0.15, 0.016, 24, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.75).translate(0, 0.185, 0.19);
    const phonesBand = new THREE.TorusGeometry(0.25, 0.014, 8, 28, Math.PI);
    const beanieDome = new THREE.SphereGeometry(0.248, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.86).translate(0, 0.14, 0);
    const beanieCuff = new RoundedBoxGeometry(0.49, 0.075, 0.42, 3, 0.03).translate(0, 0.14, 0);
    const pompom = new THREE.SphereGeometry(0.045, 14, 10).translate(0, 0.29, 0);
    const hood = new THREE.SphereGeometry(0.29, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.58).scale(1, 0.82, 0.92).rotateX(-0.42).translate(0, 0.02, -0.06);
    const scarf = new THREE.TorusGeometry(0.106, 0.034, 10, 30).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, 0.672, 0.005);
    const tail = new RoundedBoxGeometry(0.06, 0.14, 0.026, 2, 0.011).rotateZ(0.12).translate(0.05, 0.595, 0.118);
    const lens = new RoundedBoxGeometry(0.095, 0.058, 0.012, 2, 0.02);
    const lenses = merge([lens.clone().translate(-0.066, 0.014, z + 0.004), lens.clone().translate(0.066, 0.014, z + 0.004), new THREE.BoxGeometry(0.04, 0.008, 0.008).translate(0, 0.02, z + 0.004)]);
    return {
      body,
      waist,
      neck,
      head,
      screen,
      bezel,
      ears,
      stalk,
      tip,
      shoulder,
      upper,
      fore,
      hand,
      leg,
      foot,
      face: { z, eye, bar, dot, ring, round, happy: arc(true, 0.026), smile: arc(false, 0.03), sleep: arc(false, 0.024) },
      band: merge([band, knot]),
      flatcap: merge([capCrown, brim]),
      phonesBand,
      beanie: merge([beanieDome, beanieCuff, pompom]),
      hood,
      scarf: merge([scarf, tail]),
      lenses,
      // clothes over the body
      apron: over(0.285, 0.53, 1.035, -0.95, 1.9),
      bib: over(0.285, 0.6, 1.035, -0.85, 1.7),
      cardigan: over(0.3, 0.635, 1.04, 0.32, Math.PI * 2 - 0.64),
      coat: over(0.17, 0.635, 1.05, 0, Math.PI * 2, 0.12),
      shirt: over(0.3, 0.635, 1.03),
      poncho: over(0.15, 0.66, 1.09, 0, Math.PI * 2, 0.35),
      collar: new THREE.TorusGeometry(0.075, 0.018, 8, 26).rotateX(Math.PI / 2).translate(0, 0.645, 0),
    };
  }
  return () => (made ??= build());
})();

// ---------- looks ----------

const SHELLS = ['#f3efe8', '#e9ecef', '#f1e6d6', '#e1ebe8', '#ebe4ef', '#f2e2d8'];
const PHONES = '#2c2f3a';

function useBotMaterials(look: Look, rain: boolean) {
  return useMemo(() => {
    const h = Math.abs(parseInt(look.skin.slice(1, 5), 16) + parseInt(look.hair.slice(3, 7), 16));
    const shellColor = new THREE.Color(look.outfit === 'chef' ? '#f4f1ea' : SHELLS[h % SHELLS.length]);
    const jointColor = shellColor.clone().lerp(new THREE.Color('#8b8f99'), 0.42);
    const shell = new THREE.MeshPhysicalMaterial({ color: shellColor, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.22 });
    const joint = new THREE.MeshStandardMaterial({ color: jointColor, roughness: 0.45, metalness: 0.15 });
    // the face glows in the session's colour (a customer's in a warm white)
    const glowColor = new THREE.Color(look.outfit === 'diner' ? '#ffe2b8' : look.main).lerp(new THREE.Color('#ffffff'), 0.22).multiplyScalar(1.45);
    const glow = new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false });
    const garment = new THREE.MeshStandardMaterial({ color: look.main, roughness: 0.82, side: THREE.DoubleSide });
    const second = new THREE.MeshStandardMaterial({ color: look.second, roughness: 0.9, side: THREE.DoubleSide });
    const knit = new THREE.MeshStandardMaterial({ color: look.knit, roughness: 0.96 });
    const jacket = new THREE.MeshPhysicalMaterial({ color: rainColorOf(look), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
    const hat = new THREE.MeshStandardMaterial({ color: '#f1ede5', vertexColors: true, roughness: 0.9 });
    const cap = new THREE.MeshStandardMaterial({ color: look.main, vertexColors: true, roughness: 0.88 });
    const bandana = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.main).multiplyScalar(0.7), roughness: 0.85 });
    const tweed = new THREE.MeshStandardMaterial({ color: ['#6b5a46', '#4a4f5a', '#5a4a3a', '#3e4a3e'][h % 4], roughness: 0.95 });
    const trim = new THREE.MeshStandardMaterial({ color: look.trim ?? '#e6e0d4', roughness: 0.8 });
    // the antenna's light, set every frame
    const tip = new THREE.MeshBasicMaterial({ color: '#7bd389', toneMapped: false });
    // the arms wear the sleeves of whatever has sleeves
    const sleeved = rain || look.outfit === 'office' || look.outfit === 'diner';
    return { shell, joint, glow, garment, second, knit, jacket, hat, cap, bandana, tweed, trim, tip, sleeved };
  }, [look, rain]);
}

const SCREEN_MAT = new THREE.MeshPhysicalMaterial({ color: '#0c1117', roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
const PHONES_MAT = new THREE.MeshStandardMaterial({ color: PHONES, roughness: 0.4, metalness: 0.3 });
const LENS_MAT = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.1, metalness: 0.4 });
const STRAW_MAT = new THREE.MeshStandardMaterial({ color: '#dfc17e', roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });

const LIGHT = { work: new THREE.Color('#7bd389').multiplyScalar(1.6), wait: new THREE.Color('#ffd84a').multiplyScalar(1.8), off: new THREE.Color('#3a3d44') };

interface Props {
  look: Look;
  act: string;
  motion: Motion;
  kit: Kit;
  seed: number;
}

export const BotPerson = memo(function BotPerson({ look, act, motion, kit, seed }: Props) {
  const o = look.outfit;
  const wear = wearFor(weatherUi.use((w) => w.weather));
  const W = wardrobe(look, wear);
  const rain = W.torso === 'rain';
  const M = useBotMaterials(look, rain);
  const G = shapes();
  const held = useMemo(() => [...kit.held, ...everyonesHeld(look)], [kit, look]);
  const refs = useRigRefs();
  const rig = useRig(refs, act, motion, kit, seed, held, 0.165);
  const mood = faceMood(act, kit);

  // the face: blinking, the thinking dots, the talking mouth; the antenna's light
  const eyes = useRef<THREE.Group>(null);
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const mouth = useRef<THREE.Mesh>(null);
  const talk = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const e = eyes.current;
    if (e) {
      const period = 3.4 + (seed % 1) * 2.4;
      const u = (t + seed * 3) % period;
      e.scale.y = u < 0.14 ? 0.15 + 0.85 * Math.abs(u / 0.07 - 1) : 1;
      // a glance about now and then
      e.position.x = 0.012 * Math.sin(t * 0.37 + seed);
    }
    dots.current.forEach((d, i) => {
      if (d) (d.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 4 - i * 0.9));
    });
    const talking = rig.current.P.talk > 0.5;
    if (mouth.current) mouth.current.visible = !talking;
    if (talk.current) talk.current.visible = talking;
    const blink = Math.sin(t * 5) > 0;
    M.tip.color.copy(mood === 'sleep' ? LIGHT.off : mood === 'wait' ? (blink ? LIGHT.wait : LIGHT.off) : LIGHT.work);
  });
  const dotMats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: M.glow.color, toneMapped: false, transparent: true })), [M.glow]);

  const Fz = G.face.z;
  const hat = W.hat;
  // the antenna's light says how a session is: customers aren't sessions, so they have none
  const antenna = o !== 'diner' && (!hat || hat === 'headphones');
  return (
    <group name={`person:${o}`}>
      <group ref={refs.stance}>
        <group ref={refs.body}>
          <group ref={refs.legR} position={[-RIG.hipX, RIG.hipY, 0]}>
            <mesh geometry={G.leg} material={M.joint} castShadow />
            <mesh geometry={G.foot} material={o === 'diner' ? M.tweed : M.shell} castShadow />
          </group>
          <group ref={refs.legL} position={[RIG.hipX, RIG.hipY, 0]}>
            <mesh geometry={G.leg} material={M.joint} castShadow />
            <mesh geometry={G.foot} material={o === 'diner' ? M.tweed : M.shell} castShadow />
          </group>
          <group ref={refs.torso} position={[0, RIG.hipY, 0]}>
            <group ref={refs.inner} position={[0, -RIG.hipY, 0]}>
              <mesh name={`torso:${W.torso}`} geometry={G.body} material={M.shell} castShadow receiveShadow />
              <mesh geometry={G.waist} material={M.joint} />
              <mesh geometry={G.neck} material={M.joint} />
              {rain ? (
                <mesh geometry={G.poncho} material={M.jacket} castShadow />
              ) : W.torso === 'coat' ? (
                <mesh geometry={G.coat} material={M.garment} castShadow />
              ) : W.torso === 'shirt' ? (
                <mesh geometry={G.shirt} material={M.garment} />
              ) : o === 'office' ? (
                <mesh geometry={G.cardigan} material={M.garment} />
              ) : null}
              {W.apron === 'chef' && <mesh geometry={G.apron} material={M.garment} />}
              {W.apron === 'bib' && <mesh geometry={G.bib} material={M.garment} />}
              {W.collar && <mesh geometry={G.collar} material={W.collar === 'chef' ? M.trim : M.hat} />}
              {W.scarf && <mesh name="scarf" geometry={G.scarf} material={o === 'diner' ? M.second : M.knit} castShadow />}
              <group ref={refs.head} position={[0, 0.655, 0]} scale={0.9}>
                <group position={[0, RIG.headY - 0.655 - 0.03, 0]}>
                  <mesh name="bot:head" geometry={G.head} material={M.shell} castShadow receiveShadow />
                  <mesh name="bot:screen" geometry={G.screen} material={SCREEN_MAT} />
                  <mesh geometry={G.bezel} material={o === 'diner' ? M.second : M.garment} />
                  <mesh geometry={G.ears} material={hat === 'headphones' ? PHONES_MAT : M.joint} />
                  {antenna && (
                    <>
                      <mesh geometry={G.stalk} material={M.joint} />
                      <mesh name="bot:light" geometry={G.tip} material={M.tip} />
                    </>
                  )}
                  {/* the face */}
                  <group name={`bot:face:${mood}`}>
                    {mood === 'open' && (
                      <group ref={eyes}>
                        <mesh geometry={G.face.eye} material={M.glow} position={[-0.066, 0.016, Fz]} />
                        <mesh geometry={G.face.eye} material={M.glow} position={[0.066, 0.016, Fz]} />
                      </group>
                    )}
                    {mood === 'happy' && (
                      <>
                        <mesh geometry={G.face.happy} material={M.glow} position={[-0.066, 0.012, Fz]} />
                        <mesh geometry={G.face.happy} material={M.glow} position={[0.066, 0.012, Fz]} />
                      </>
                    )}
                    {mood === 'sleep' && (
                      <>
                        <mesh geometry={G.face.sleep} material={M.glow} position={[-0.066, 0.016, Fz]} />
                        <mesh geometry={G.face.sleep} material={M.glow} position={[0.066, 0.016, Fz]} />
                      </>
                    )}
                    {mood === 'wait' && (
                      <>
                        <mesh geometry={G.face.round} material={M.glow} position={[-0.066, 0.02, Fz]} />
                        <mesh geometry={G.face.round} material={M.glow} position={[0.066, 0.02, Fz]} />
                        <mesh geometry={G.face.ring} material={M.glow} position={[0, -0.058, Fz]} />
                      </>
                    )}
                    {mood === 'think' && (
                      <>
                        {[-0.05, 0, 0.05].map((x, i) => (
                          <mesh key={x} ref={(m) => void (dots.current[i] = m)} geometry={G.face.dot} material={dotMats[i]} position={[x, 0.012, Fz]} />
                        ))}
                      </>
                    )}
                    {mood !== 'think' && mood !== 'wait' && (
                      <>
                        <mesh ref={mouth} geometry={mood === 'happy' ? G.face.smile : G.face.bar} material={M.glow} position={[0, -0.056, Fz]} />
                        <mesh ref={talk} geometry={G.face.ring} material={M.glow} position={[0, -0.058, Fz]} visible={false} />
                      </>
                    )}
                  </group>
                  {W.sunglasses && <mesh name="sunglasses" geometry={G.lenses} material={LENS_MAT} />}
                  {(hat === 'toque' || hat === 'short' || hat === 'cap') && (
                    <mesh name={`hat:${hat}`} geometry={toqueGeometry(hat === 'toque', 1)} material={hat === 'cap' ? M.cap : M.hat} position={[0, 0.105, -0.005]} rotation={[-0.06, 0, 0]} scale={[1.08, hat === 'cap' ? 0.75 : 1, 0.98]} castShadow />
                  )}
                  {hat === 'bandana' && <mesh name="hat:bandana" geometry={G.band} material={M.bandana} castShadow />}
                  {hat === 'flatcap' && <mesh name="hat:flatcap" geometry={G.flatcap} material={M.tweed} castShadow />}
                  {hat === 'headphones' && <mesh name="hat:headphones" geometry={G.phonesBand} material={PHONES_MAT} />}
                  {hat === 'sunhat' && (
                    <>
                      <mesh name="hat:sunhat" geometry={sunHatGeometry()} material={STRAW_MAT} position={[0, 0.03, -0.01]} scale={1.12} castShadow />
                      <mesh geometry={sunHatBandGeometry()} material={M.second} position={[0, 0.03, -0.01]} scale={1.12} />
                    </>
                  )}
                  {W.beanie && <mesh name="beanie" geometry={G.beanie} material={o === 'diner' ? M.second : M.knit} castShadow />}
                  {W.hood && <mesh name="hood" geometry={G.hood} material={M.jacket} castShadow />}
                </group>
              </group>
              <group ref={refs.armR} position={[-RIG.shoulderX, RIG.shoulderY, 0]}>
                <mesh geometry={G.shoulder} material={M.joint} />
                <mesh geometry={G.upper} material={M.sleeved ? (rain ? M.jacket : M.garment) : M.shell} />
                <group ref={refs.elbowR} position={[0, -RIG.upperArm, 0]}>
                  <mesh geometry={G.fore} material={M.sleeved ? (rain ? M.jacket : M.garment) : M.shell} />
                  <mesh geometry={G.hand} material={M.joint} />
                </group>
              </group>
              <group ref={refs.armL} position={[RIG.shoulderX, RIG.shoulderY, 0]}>
                <mesh geometry={G.shoulder} material={M.joint} />
                <mesh geometry={G.upper} material={M.sleeved ? (rain ? M.jacket : M.garment) : M.shell} />
                <group ref={refs.elbowL} position={[0, -RIG.upperArm, 0]}>
                  <mesh geometry={G.fore} material={M.sleeved ? (rain ? M.jacket : M.garment) : M.shell} />
                  <mesh geometry={G.hand} material={M.joint} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
      {held.map((h, i) => (
        <group key={i} name={`held:${h.acts[0]}`} ref={(n) => void (refs.held.current[i] = n)} visible={false}>
          {h.render(seed)}
        </group>
      ))}
    </group>
  );
});
