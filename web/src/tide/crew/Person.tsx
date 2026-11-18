import { useFrame } from '@react-three/fiber';
import { memo, type ReactNode, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { rng, smoothstep } from '../../tank/util';
import { hash } from '../../theme';
import * as Parts from '../kitchen/cookParts';
import { type Weather, weatherUi } from '../weather/state';
import { beanieGeometry, bibApronGeometry, flatCapGeometry, headphonesGeometry, hoodGeometry, legFor, type LegKind, rolledCuffGeometry, scarfGeometry, shirtCollarGeometry, sunglassLensGeometry, sunHatBandGeometry, sunHatGeometry, torsoFor, type TorsoKind } from './outfits';
import { BotPerson } from './Bot';
import type { Pose, Poser } from './pose';
import { useRig, useRigRefs } from './rig';
import { peopleUi } from './style';

// A chibi person: sculpted (kitchen/cookParts.ts, crew/outfits.ts), dressed for
// their theme (a cook, an office worker, a toymaker, a customer) and for the
// weather (a rain jacket with its hood down in the rain, a knitted scarf
// and a beanie in snow; on a sunny day an iced drink on a break, and the
// customers in shirts, sunglasses and straw hats), and posed by hand targets: each act puts the hands
// somewhere (on the knife over the board, on a keyboard, round a mug) and a
// two-bone solver bends the arms to reach (crew/rig.ts). What the acts are, and
// what the hands hold, comes from the theme's kit; an umbrella and a hot drink
// are everyone's. Units are cook metres; the parent scales the person by the
// plan's K. How they're drawn is a setting (crew/style.ts): these sculpted
// people, cel-shaded with an ink outline (ink toon), or little bots
// (crew/Bot.tsx); both wear the same `wardrobe` and move on the same rig.

export type Outfit = 'chef' | 'office' | 'maker' | 'diner';

/** Acts every theme shares that make anyone smile: a warm drink, a tune, a toy. */
const HAPPY = new Set(['mug', 'cocoa', 'iced', 'drink', 'tune', 'rock', 'wind', 'pat']);

/** How a face looks for an act: eyes open, smiling, asleep, waiting for you, thinking. */
export type Mood = 'open' | 'happy' | 'sleep' | 'wait' | 'think';
export function faceMood(act: string, kit: Kit): Mood {
  if (kit.sleepy?.includes(act) || act === 'nap' || act === 'doze') return 'sleep';
  if (kit.happy?.includes(act) || HAPPY.has(act)) return 'happy';
  if (act === 'wave') return 'wait';
  if (act === 'think' || act === 'ponder') return 'think';
  return 'open';
}
export type Hat = 'toque' | 'short' | 'bandana' | 'cap' | 'flatcap' | 'beanie' | 'headphones' | 'none';

export interface Look {
  skin: string;
  hair: string;
  style: Parts.HairStyle;
  iris: string;
  glasses: boolean;
  moustache: boolean;
  outfit: Outfit;
  /** The garment in the session's colour: the apron (chef, maker), the sweater (office), the coat (diner). */
  main: string;
  /** A second colour: the maker's shirt, the diner's scarf, the beanie. */
  second: string;
  /** A coloured collar on a chef's jacket. */
  trim: string | null;
  hat: Hat;
  /** Their knitwear in snow: the scarf, and the beanie if they have no work hat. */
  knit: string;
}

/** What the weather has people wear. */
export type Wear = 'none' | 'rain' | 'snow' | 'sun';
export const wearFor = (w: Weather): Wear => (w === 'snow' ? 'snow' : w === 'rain' ? 'rain' : w === 'sunny' ? 'sun' : 'none');

/** What someone has on, for their look and the weather. Every style of person dresses by it. */
export interface Wardrobe {
  /** The garment on the body (rain: a rain jacket). */
  torso: TorsoKind;
  hood: boolean;
  apron: 'chef' | 'bib' | null;
  collar: 'chef' | 'shirt' | null;
  scarf: boolean;
  beanie: boolean;
  /** On the head: the work hats stay on in rain and snow; customers wear a straw hat in the sun. */
  hat: Exclude<Hat, 'none' | 'beanie'> | 'sunhat' | null;
  sunglasses: boolean;
  cuff: boolean;
}

export function wardrobe(look: Look, wear: Wear): Wardrobe {
  const o = look.outfit;
  const rain = wear === 'rain';
  const snow = wear === 'snow';
  // a sunny day: customers come in from the street in a shirt, sunglasses and a straw hat
  const sunny = wear === 'sun' && o === 'diner';
  return {
    torso: rain ? 'rain' : sunny ? 'shirt' : TORSO[o],
    hood: rain,
    apron: rain ? null : o === 'chef' ? 'chef' : o === 'maker' ? 'bib' : null,
    collar: rain ? null : o === 'chef' ? 'chef' : o === 'office' ? 'shirt' : null,
    scarf: snow,
    beanie: look.hat === 'beanie' || (snow && look.hat === 'none'),
    hat: sunny ? 'sunhat' : look.hat === 'none' || look.hat === 'beanie' ? null : look.hat,
    sunglasses: sunny,
    cuff: o === 'maker' && !rain,
  };
}

/** A rain jacket's colour: the session's, brightened (a customer's: a classic raincoat colour). */
export const rainColorOf = (look: Look): THREE.ColorRepresentation => (look.outfit === 'diner' ? RAINCOATS[hashOf(look) % RAINCOATS.length] : new THREE.Color(look.main).offsetHSL(0, 0.04, 0.05));

const SKINS = ['#f8dcc8', '#f1c6a6', '#e3ae87', '#cc9165', '#a86f47', '#7f5034'];
const HAIRS = ['#2a201c', '#3d2a20', '#6b4127', '#a8693a', '#d8ae66', '#1c1b20', '#8e8781', '#a3412f'];
const IRISES = ['#5a3a24', '#2f4a6b', '#3f5a3a', '#5b4a6b', '#4a3a30'];
const TRIMS = ['#c94f3d', '#2f4f7a', '#e0b04a', '#3f7a5a', '#7a3f6a'];
const COATS = ['#8a6a4a', '#2f3e5c', '#5a6b4a', '#7a3a3a', '#5e5e66', '#3f5f5f', '#b07a4a'];
const PLAIDS = ['#b0473b', '#3f6b4f', '#3e5a8a', '#8a6a3a', '#6a4a7a'];
const SCARVES = ['#c94f3d', '#e0b04a', '#3f7a5a', '#7a3f6a', '#d8d2c4', '#2f4f7a'];
/** Customers' raincoats: the classic colours. */
const RAINCOATS = ['#e3b23c', '#c8473a', '#2f4a6b', '#3f6b4f', '#2f6b6b', '#e07b39'];

/** The person a session (or a customer) gets: the same one every time for the same id. */
export function lookFor(id: string, color: string, outfit: Outfit, helper = false): Look {
  const r = rng(hash(id) ^ 0x5bd1e995);
  r();
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length) % a.length];
  const style = pick<Parts.HairStyle>(['short', 'bob', 'bun', 'ponytail']);
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const iris = pick(IRISES);
  const h = r();
  const extra = r();
  const glasses = !helper && r() < 0.28;
  const moustache = !helper && style === 'short' && r() < 0.35;
  const look: Look = { skin, hair, style, iris, glasses, moustache, outfit, main: color, second: '#ffffff', trim: null, hat: 'none', knit: color };
  if (outfit === 'chef') {
    look.hat = helper ? 'cap' : h < 0.45 ? 'toque' : h < 0.72 ? 'short' : 'bandana';
    look.trim = !helper && extra < 0.55 ? pick(TRIMS) : null;
  } else if (outfit === 'office') {
    look.hat = !helper && h < 0.22 ? 'headphones' : 'none';
    // a scarf that stands out from the sweater (drawn last: earlier picks stay as they were)
    look.knit = pick(SCARVES.filter((c) => c.toLowerCase() !== color.toLowerCase()));
  } else if (outfit === 'maker') {
    look.hat = helper ? 'bandana' : h < 0.5 ? 'flatcap' : h < 0.75 ? 'bandana' : 'none';
    look.second = pick(PLAIDS);
    look.knit = pick(SCARVES);
  } else if (outfit === 'diner') {
    look.main = pick(COATS);
    look.second = pick(SCARVES);
    // out on the street: a flat cap or bare-headed (a beanie when it snows)
    look.hat = h < 0.35 ? 'flatcap' : 'none';
    look.knit = look.second;
  }
  return look;
}

/** What the parent tells a person every frame (a shared object, no re-render). */
export interface Motion {
  /** Walking speed in world units per second (0 standing still). */
  speed: number;
  /** Seat height in cook metres, while sitting. */
  seat: number;
}

/** Something a person holds for some acts, placed where the pose says the hands are. */
export interface HeldItem {
  acts: string[];
  render: (seed: number) => ReactNode;
  /** Put the item where the hands are; `age` is how long the act has been going (it may hide the item). */
  place: (p: Pose, o: THREE.Object3D, t: number, seed: number, age: number) => void;
}

/** A theme's acts: how they pose, what the hands hold, which ones close the eyes or make them smile. */
export interface Kit {
  poser: Poser;
  held: HeldItem[];
  sleepy?: string[];
  happy?: string[];
}

// ---------- eyes ----------

// Glossy dark eyes, a little iris colour in the lower half, two catchlights;
// they blink now and then, close in sleep, and curve up into a smile.
const eyeBall = new Map<string, THREE.BufferGeometry>();
function eyeGeometry(iris: string) {
  let g = eyeBall.get(iris);
  if (g) return g;
  g = new THREE.SphereGeometry(1, 28, 20);
  const c = new THREE.Color(iris);
  const dark = new THREE.Color('#1a1210');
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.copy(dark).lerp(c, smoothstep(0.1, -0.75, p.getY(i)) * smoothstep(-0.2, 0.6, p.getZ(i)) * 0.85);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  eyeBall.set(iris, g);
  return g;
}
const EYE_MAT = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 });
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), toneMapped: false });
const LID_MAT = new THREE.MeshStandardMaterial({ color: '#2a1c1a', roughness: 0.6 });
const sparkGeo = new THREE.CircleGeometry(1, 18);
const arcGeo = (up: boolean) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const x = -0.03 + (i / 8) * 0.06;
    pts.push(new THREE.Vector3(x, (up ? -1 : 1) * (0.012 - 13 * x * x), 0.012));
  }
  return tubeThrough(pts, (t) => 0.0042 * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * t)), 0.4), 20, 6).geometry;
};
const ARC_SLEEP = arcGeo(false);
const ARC_HAPPY = arcGeo(true);

function Eye({ position, side, iris, mode, seed, near, big = 1 }: { position: [number, number, number]; side: number; iris: string; mode: 'open' | 'closed' | 'happy'; seed: number; near: boolean; big?: number }) {
  const ball = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const b = ball.current;
    if (!b) return;
    // a blink every few seconds, both eyes together
    const period = 3.6 + (seed % 1) * 2.4;
    const u = (clock.elapsedTime + seed * 3) % period;
    b.scale.y = u < 0.14 ? 0.12 + 0.88 * Math.abs(u / 0.07 - 1) : 1;
  });
  return (
    <group position={position} rotation={[0, side * 0.26, 0]} scale={big}>
      {mode === 'open' ? (
        <group ref={ball}>
          <mesh geometry={eyeGeometry(iris)} material={EYE_MAT} scale={[0.0365, 0.0485, 0.018]} />
          <mesh geometry={sparkGeo} material={SPARK_MAT} position={[-0.0122, 0.019, 0.0178]} scale={0.0102} />
          {/* the second, tiny catchlight only shows up close */}
          {near && <mesh geometry={sparkGeo} material={SPARK_MAT} position={[0.011, -0.013, 0.018]} scale={0.0052} />}
        </group>
      ) : (
        <mesh geometry={mode === 'happy' ? ARC_HAPPY : ARC_SLEEP} material={LID_MAT} position={[0, mode === 'happy' ? -0.004 : -0.008, -0.004]} />
      )}
    </group>
  );
}

// ---------- clothes ----------

const TORSO: Record<Outfit, TorsoKind> = { chef: 'chef', office: 'sweater', maker: 'plaid', diner: 'coat' };
const LEGS: Record<Outfit, LegKind> = { chef: 'chef', office: 'jeans', maker: 'work', diner: 'dark' };
const WHITE = '#e9e4d9';

/** Ink toon: three bands of light, and an ink line round the shapes (their back faces, pushed out a little). */
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
const INK = new THREE.MeshBasicMaterial({ color: '#1d1620', side: THREE.BackSide });
INK.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normal * 0.0135;');
};
INK.customProgramCacheKey = () => 'ink-outline';
/** A material as flat ink-toon colour: the light in bands, and no fabric pattern (the skin keeps its blush). */
function toToon(m: THREE.Material, keepPaint = false): THREE.Material {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return m;
  // a little light of its own, so the flat colours stay clean in a dim room
  return new THREE.MeshToonMaterial({ color: s.color, vertexColors: keepPaint && s.vertexColors, gradientMap: RAMP, side: s.side, emissive: s.color.clone().multiplyScalar(0.16) });
}

function useMaterials(look: Look) {
  return useMemo(() => {
    const rainColor = rainColorOf(look);
    const jacket = new THREE.MeshPhysicalMaterial({ color: rainColor, vertexColors: true, roughness: 0.34, clearcoat: 0.75, clearcoatRoughness: 0.22 });
    const knit = new THREE.MeshStandardMaterial({ color: look.knit, vertexColors: true, roughness: 0.96 });
    const garment = look.outfit === 'office' ? look.main : look.outfit === 'maker' ? look.second : look.outfit === 'diner' ? look.main : WHITE;
    const skin = new THREE.MeshPhysicalMaterial({ color: look.skin, vertexColors: true, roughness: 0.58, sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd8c4') });
    const hair = new THREE.MeshPhysicalMaterial({ color: look.hair, vertexColors: true, roughness: 0.42, sheen: 0.3, sheenColor: new THREE.Color(look.hair).lerp(new THREE.Color('#ffffff'), 0.5) });
    const cloth = new THREE.MeshStandardMaterial({ color: garment, vertexColors: true, roughness: look.outfit === 'diner' ? 0.95 : 0.9 });
    const hat = new THREE.MeshStandardMaterial({ color: '#efebe3', vertexColors: true, roughness: 0.93 });
    const apron = new THREE.MeshStandardMaterial({ color: look.main, vertexColors: true, roughness: 0.88 });
    const collar = look.trim ? new THREE.MeshStandardMaterial({ color: look.trim, vertexColors: true, roughness: 0.8 }) : cloth;
    const bandana = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.main).multiplyScalar(0.62), vertexColors: true, roughness: 0.85 });
    const second = new THREE.MeshStandardMaterial({ color: look.second, vertexColors: true, roughness: 0.9 });
    const tweed = new THREE.MeshStandardMaterial({ color: ['#6b5a46', '#4a4f5a', '#5a4a3a', '#3e4a3e'][hashOf(look) % 4], vertexColors: true, roughness: 0.95 });
    const phones = new THREE.MeshStandardMaterial({ color: '#2b2b31', metalness: 0.35, roughness: 0.4 });
    const legs = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.82 });
    const mouth = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.5 });
    const brows = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).multiplyScalar(0.7), roughness: 0.7 });
    const frames = new THREE.MeshStandardMaterial({ color: '#3a2b26', metalness: 0.3, roughness: 0.35 });
    const out = { skin, hair, cloth, hat, apron, collar, bandana, second, tweed, phones, legs, mouth, brows, frames, jacket, knit };
    for (const k of Object.keys(out) as (keyof typeof out)[]) if (k !== 'phones' && k !== 'frames' && k !== 'mouth') (out as Record<string, THREE.Material>)[k] = toToon(out[k], k === 'skin' || k === 'legs');
    return out;
  }, [look]);
}
const hashOf = (l: Look) => Math.abs(Math.round((parseInt(l.skin.slice(1), 16) + parseInt(l.hair.slice(1), 16)) / 7));

// ---------- the person ----------

interface PersonProps {
  look: Look;
  act: string;
  motion: Motion;
  kit: Kit;
  /** Varies the timing of idle motions and work cycles. */
  seed: number;
}

/** World distance from the camera at which a person switches to the lighter detail level (and back, a little closer). */
const FAR = 11;
const NEAR = 9;
/** The head, a little smaller than it was sculpted (it pivots at the neck, so the chin stays on the collar). */
const HEAD_SCALE = 0.9;

/** A person, in the style chosen in the top bar. */
export const Person = memo(function Person(props: PersonProps) {
  const style = peopleUi.use((s) => s.style);
  return style === 'bots' ? <BotPerson {...props} /> : <ToonPerson {...props} />;
});

const ToonPerson = memo(function ToonPerson({ look, act, motion, kit, seed }: PersonProps) {
  const M = useMaterials(look);
  const o = look.outfit;
  const wear = wearFor(weatherUi.use((w) => w.weather));
  const W = useMemo(() => wardrobe(look, wear), [look, wear]);
  const rain = W.torso === 'rain';
  const snow = wear === 'snow';
  const held = useMemo(() => [...kit.held, ...everyonesHeld(look)], [kit, look]);
  // the usual views show people about a hundred pixels tall: the lighter level
  // until the camera comes close (a close-up), then the detailed one
  const [lod, setLod] = useState<Parts.Lod>(1);
  const g = useMemo(
    () => ({
      head: Parts.headGeometry(lod),
      hair: Parts.hairGeometry(look.style, lod, (look.hat === 'none' || look.hat === 'headphones') && !snow),
      toque: W.hat === 'toque' || W.hat === 'short' || W.hat === 'cap' ? Parts.toqueGeometry(W.hat === 'toque', lod) : null,
      bandana: W.hat === 'bandana' ? Parts.bandanaGeometry(lod) : null,
      flatcap: W.hat === 'flatcap' ? flatCapGeometry(lod) : null,
      sunhat: W.hat === 'sunhat' ? sunHatGeometry() : null,
      sunband: W.hat === 'sunhat' ? sunHatBandGeometry() : null,
      lenses: W.sunglasses ? sunglassLensGeometry(Parts.faceAt) : null,
      beanie: W.beanie ? beanieGeometry(lod) : null,
      headphones: W.hat === 'headphones' ? headphonesGeometry() : null,
      torso: torsoFor(W.torso, lod),
      hood: W.hood ? hoodGeometry(lod) : null,
      apron: W.apron === 'chef' ? Parts.apronGeometry(lod) : W.apron === 'bib' ? bibApronGeometry(lod) : null,
      collar: W.collar === 'chef' ? Parts.collarGeometry(lod) : W.collar === 'shirt' ? shirtCollarGeometry() : null,
      scarf: W.scarf ? scarfGeometry(lod) : null,
      cuff: W.cuff ? rolledCuffGeometry() : null,
      leg: legFor(LEGS[o], lod),
      upper: Parts.upperArmGeometry(lod),
      sleeve: Parts.sleeveGeometry(lod),
      handR: Parts.handGeometry(true, lod),
      handL: Parts.handGeometry(false, lod),
      smile: Parts.mouthGeometry(false),
      open: Parts.mouthGeometry(true),
      brows: Parts.browGeometry(),
      glasses: look.glasses || W.sunglasses ? Parts.glassesGeometry() : null,
      moustache: look.moustache ? Parts.moustacheGeometry() : null,
    }),
    [look, o, lod, snow, W],
  );
  const eyes = useMemo(() => {
    const at = (x: number) => {
      const p = Parts.faceAt(x, -0.008, 0) ?? new THREE.Vector3(x, -0.008, 0.2);
      return [p.x, p.y, p.z - 0.0062] as [number, number, number];
    };
    return { r: at(-0.086), l: at(0.086) };
  }, []);

  const refs = useRigRefs();
  const rig = useRig(refs, act, motion, kit, seed, held);
  const smile = useRef<THREE.Mesh>(null);
  const open = useRef<THREE.Mesh>(null);
  const wp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    // detail by distance (with some slack, so it doesn't flicker at the edge)
    refs.stance.current.getWorldPosition(wp);
    const d = wp.distanceTo(camera.position);
    if (lod === 1 && d < NEAR) setLod(0);
    else if (lod === 0 && d > FAR) setLod(1);
    const talking = rig.current.P.talk > 0.5;
    if (smile.current) smile.current.visible = !talking;
    if (open.current) open.current.visible = talking;
  });

  const mood = faceMood(act, kit);
  const eyeMode = mood === 'sleep' ? 'closed' : mood === 'happy' ? 'happy' : 'open';
  // the ink line round a shape
  const ink = (geometry: THREE.BufferGeometry | null) => (geometry ? <mesh geometry={geometry} material={INK} /> : null);
  const hatY = Parts.RIG.headY + Parts.RIG.hatY + 0.028 - Parts.RIG.headY;

  return (
    <group name={`person:${o}`}>
      <group ref={refs.stance}>
        <group ref={refs.body}>
          <group ref={refs.legR} position={[-Parts.RIG.hipX, Parts.RIG.hipY, 0]}>
            <mesh geometry={g.leg} material={M.legs} castShadow />
            {ink(g.leg)}
          </group>
          <group ref={refs.legL} position={[Parts.RIG.hipX, Parts.RIG.hipY, 0]}>
            <mesh geometry={g.leg} material={M.legs} castShadow />
            {ink(g.leg)}
          </group>
          <group ref={refs.torso} position={[0, Parts.RIG.hipY, 0]}>
            <group ref={refs.inner} position={[0, -Parts.RIG.hipY, 0]}>
              <mesh name={`torso:${W.torso}`} geometry={g.torso} material={rain ? M.jacket : M.cloth} castShadow receiveShadow />
              {ink(g.torso)}
              {g.hood && <mesh name="hood" geometry={g.hood} material={M.jacket} castShadow />}
              {ink(g.hood)}
              {g.apron && <mesh geometry={g.apron} material={M.apron} />}
              {g.collar && <mesh geometry={g.collar} material={o === 'office' ? M.hat : M.collar} />}
              {g.scarf && <mesh name="scarf" geometry={g.scarf} material={o === 'diner' ? M.second : M.knit} castShadow />}
              <group ref={refs.head} position={[0, 0.655, 0]} scale={HEAD_SCALE}>
                <group position={[0, Parts.RIG.headY - 0.655, 0]}>
                  <mesh geometry={g.head} material={M.skin} castShadow receiveShadow />
                  {ink(g.head)}
                  <mesh geometry={g.hair} material={M.hair} castShadow />
                  {ink(g.hair)}
                  <mesh ref={smile} geometry={g.smile} material={M.mouth} />
                  <mesh ref={open} geometry={g.open} material={M.mouth} visible={false} />
                  <mesh geometry={g.brows} material={M.brows} />
                  {g.moustache && <mesh geometry={g.moustache} material={M.brows} />}
                  <Eye position={eyes.r} side={-1} iris={look.iris} mode={eyeMode} seed={seed} near={lod === 0} big={1.18} />
                  <Eye position={eyes.l} side={1} iris={look.iris} mode={eyeMode} seed={seed} near={lod === 0} big={1.18} />
                  {g.glasses && <mesh geometry={g.glasses} material={M.frames} />}
                  {g.lenses && <mesh name="sunglasses" geometry={g.lenses} material={LENS_MAT} />}
                  {g.sunhat && <mesh name="hat:sunhat" geometry={g.sunhat} material={STRAW_MAT} position={[0, 0.01, -0.012]} rotation={[-0.1, 0, 0]} castShadow />}
                  {g.sunband && <mesh geometry={g.sunband} material={M.second} position={[0, 0.01, -0.012]} rotation={[-0.1, 0, 0]} />}
                  {g.toque && (
                    <group position={[0, hatY, -0.01]} rotation={[-0.1, 0, 0]} scale={[1, W.hat === 'cap' ? 0.75 : 1, 1]}>
                      <mesh name={`hat:${W.hat}`} geometry={g.toque} material={W.hat === 'cap' ? M.apron : M.hat} castShadow />
                      {ink(g.toque)}
                    </group>
                  )}
                  {g.bandana && <mesh name="hat:bandana" geometry={g.bandana} material={M.bandana} castShadow />}
                  {g.flatcap && <mesh name="hat:flatcap" geometry={g.flatcap} material={M.tweed} castShadow />}
                  {ink(g.flatcap)}
                  {g.beanie && <mesh name="beanie" geometry={g.beanie} material={o === 'diner' ? M.second : M.knit} castShadow />}
                  {ink(g.beanie)}
                  {g.headphones && <mesh name="hat:headphones" geometry={g.headphones} material={M.phones} />}
                </group>
              </group>
              <group ref={refs.armR} position={[-Parts.RIG.shoulderX, Parts.RIG.shoulderY, 0]}>
                <mesh geometry={g.upper} material={rain ? M.jacket : M.cloth} />
                {ink(g.upper)}
                <group ref={refs.elbowR} position={[0, -Parts.RIG.upperArm, 0]}>
                  {g.cuff ? <mesh geometry={g.cuff} material={M.cloth} /> : <mesh geometry={g.sleeve} material={rain ? M.jacket : M.cloth} />}
                  {ink(g.cuff ?? g.sleeve)}
                  <mesh geometry={g.handR} material={M.skin} />
                  {ink(g.handR)}
                </group>
              </group>
              <group ref={refs.armL} position={[Parts.RIG.shoulderX, Parts.RIG.shoulderY, 0]}>
                <mesh geometry={g.upper} material={rain ? M.jacket : M.cloth} />
                {ink(g.upper)}
                <group ref={refs.elbowL} position={[0, -Parts.RIG.upperArm, 0]}>
                  {g.cuff ? <mesh geometry={g.cuff} material={M.cloth} /> : <mesh geometry={g.sleeve} material={rain ? M.jacket : M.cloth} />}
                  {ink(g.cuff ?? g.sleeve)}
                  <mesh geometry={g.handL} material={M.skin} />
                  {ink(g.handL)}
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

// ---------- what everyone can hold ----------

const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const UMBRELLA_LEN = 0.76;

/** An umbrella along +y from the hand: a J handle below, a ribbed canopy on top. Parts by material. */
const umbrellaParts = (() => {
  let made: { canopy: THREE.BufferGeometry; shaft: THREE.BufferGeometry; handle: THREE.BufferGeometry } | null = null;
  return () => {
    if (made) return made;
    const prof = [
      [0.0005, UMBRELLA_LEN + 0.03],
      [0.1, UMBRELLA_LEN + 0.02],
      [0.21, UMBRELLA_LEN - 0.01],
      [0.31, UMBRELLA_LEN - 0.06],
      [0.38, UMBRELLA_LEN - 0.12],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    // eight panels: the low segment count gives the canopy its ribs
    const canopy = new THREE.LatheGeometry(prof, 8);
    canopy.computeVertexNormals();
    const shaft = new THREE.CylinderGeometry(0.007, 0.007, UMBRELLA_LEN + 0.06, 6).translate(0, (UMBRELLA_LEN + 0.06) / 2 - 0.03, 0);
    const handle = new THREE.TorusGeometry(0.032, 0.009, 6, 12, Math.PI).rotateZ(Math.PI).translate(0.032, -0.03, 0);
    made = { canopy, shaft, handle };
    return made;
  };
})();
const SHAFT_MAT = new THREE.MeshStandardMaterial({ color: '#2a2726', metalness: 0.5, roughness: 0.4 });
const HANDLE_MAT = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.6 });
const MUG_MAT = new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.45 });
const STRAW_MAT = new THREE.MeshStandardMaterial({ color: '#dfc17e', roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });
const LENS_MAT = new THREE.MeshStandardMaterial({ color: '#15171d', roughness: 0.12, metalness: 0.35 });
// an iced drink: a tall glass, iced coffee, two cubes and a straw (origin at the glass's foot)
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: '#d8eef5', roughness: 0.08, transparent: true, opacity: 0.38, depthWrite: false });
const ICED_MAT = new THREE.MeshStandardMaterial({ color: '#a8673a', roughness: 0.3 });
const ICE_MAT = new THREE.MeshStandardMaterial({ color: '#eef8fb', roughness: 0.1, transparent: true, opacity: 0.85 });
const STRAW_TUBE_MAT = new THREE.MeshStandardMaterial({ color: '#e4574a', roughness: 0.5 });
const glassGeo = new THREE.CylinderGeometry(0.037, 0.031, 0.122, 18, 1, true).translate(0, 0.061, 0);
const icedGeo = new THREE.CylinderGeometry(0.034, 0.029, 0.092, 18).translate(0, 0.047, 0);
const iceGeo = new THREE.BoxGeometry(0.024, 0.022, 0.024);
const strawGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.17, 8).translate(0, 0.085, 0);
const COCOA_MAT = new THREE.MeshStandardMaterial({ color: '#5a3424', roughness: 0.35 });
const mugGeo = new THREE.CylinderGeometry(0.034, 0.03, 0.074, 16, 1, true).translate(0, 0.037, 0);
const mugBase = new THREE.CircleGeometry(0.03, 16).rotateX(-Math.PI / 2);
const mugTop = new THREE.CircleGeometry(0.031, 16).rotateX(-Math.PI / 2).translate(0, 0.062, 0);
const mugHandle = new THREE.TorusGeometry(0.018, 0.006, 6, 12, Math.PI).rotateZ(-Math.PI / 2).translate(0.036, 0.04, 0);

/** A few soft puffs rising from a hot drink. */
function Wisp() {
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const mats = useMemo(() => [0, 1, 2].map(() => new THREE.SpriteMaterial({ map: wispTexture(), color: '#f6f1ea', transparent: true, opacity: 0, depthWrite: false })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.45;
    sprites.current.forEach((sp, i) => {
      if (!sp) return;
      const ph = (t + i / 3) % 1;
      sp.position.set(Math.sin(t * 3 + i * 2) * 0.012, 0.075 + ph * 0.16, 0);
      sp.scale.setScalar(0.035 + ph * 0.05);
      sp.material.opacity = 0.32 * Math.sin(Math.PI * ph);
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <sprite key={i} ref={(s) => void (sprites.current[i] = s)} material={mats[i]} />
      ))}
    </>
  );
}
let wispTex: THREE.Texture | null = null;
function wispTexture() {
  if (wispTex) return wispTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  wispTex = new THREE.CanvasTexture(c);
  return wispTex;
}

/** The umbrella (in their own colour; a customer's in their raincoat's) and the hot drink. */
export function everyonesHeld(look: Look): HeldItem[] {
  const canopyColor = look.outfit === 'diner' ? RAINCOATS[(hashOf(look) + 2) % RAINCOATS.length] : look.main;
  const canopy = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.5, side: THREE.DoubleSide });
  return [
    {
      acts: ['umbrella'],
      render: () => {
        const u = umbrellaParts();
        return (
          <group>
            <mesh geometry={u.canopy} material={canopy} castShadow />
            <mesh geometry={u.shaft} material={SHAFT_MAT} />
            <mesh geometry={u.handle} material={HANDLE_MAT} />
          </group>
        );
      },
      place: (p, o) => {
        o.position.copy(p.R);
        dir.subVectors(p.aux, p.R).normalize();
        o.quaternion.setFromUnitVectors(UP, dir);
      },
    },
    {
      acts: ['cocoa', 'drink'],
      render: () => (
        <group>
          <mesh geometry={mugGeo} material={MUG_MAT} castShadow />
          <mesh geometry={mugBase} material={MUG_MAT} />
          <mesh geometry={mugTop} material={COCOA_MAT} />
          <mesh geometry={mugHandle} material={MUG_MAT} />
          <Wisp />
        </group>
      ),
      place: (p, o) => {
        o.position.copy(p.aux);
        o.rotation.set(-0.9 * p.tilt, p.syaw, 0, 'YXZ');
      },
    },
    {
      acts: ['iced'],
      render: () => (
        <group>
          <mesh geometry={icedGeo} material={ICED_MAT} />
          <mesh geometry={iceGeo} material={ICE_MAT} position={[0.008, 0.09, 0.006]} rotation={[0.3, 0.5, 0.1]} />
          <mesh geometry={iceGeo} material={ICE_MAT} position={[-0.01, 0.083, -0.008]} rotation={[0.6, 0.2, 0.4]} />
          <mesh geometry={strawGeo} material={STRAW_TUBE_MAT} position={[0.012, 0.03, -0.006]} rotation={[0.12, 0, -0.16]} />
          <mesh geometry={glassGeo} material={GLASS_MAT} renderOrder={2} />
        </group>
      ),
      place: (p, o) => {
        o.position.copy(p.aux);
        o.rotation.set(-0.9 * p.tilt, p.syaw, 0, 'YXZ');
      },
    },
  ];
}

