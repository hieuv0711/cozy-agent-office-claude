import * as THREE from 'three';
import { onWeatherTick, U, viewWanted } from './runtime';

// Painted views outside the windows, made weather-aware. A view material shows
// a blend of up to four painted variants (a clear night, wet for rain, snowy
// and a sunny day) that crossfades as the weather changes; rain can also wash
// a mist over it.

export interface ViewLook {
  /** A mist colour washed over the layer in the rain, and how much (0..1). */
  mist?: THREE.ColorRepresentation;
  mistAmount?: number;
}

export interface ViewMaps {
  /** Variant builders, called only when that weather is wanted (the clear one at once). */
  clear: () => THREE.Texture;
  wet?: () => THREE.Texture;
  snow?: () => THREE.Texture;
  sun?: () => THREE.Texture;
}

type Slot = { value: THREE.Texture | null };
type Entry = { maps: ViewMaps; slots: [Slot, Slot, Slot]; have: [boolean, boolean, boolean] };
const entries = new Set<Entry>();
const VARIANTS = ['wet', 'snow', 'sun'] as const;

// Build the variants lazily, the first time their weather is on its way, one
// painting per frame so a change of weather never stalls a frame for long (the
// crossfade has barely started by the time they are all in).
onWeatherTick(() => {
  for (const e of entries) {
    for (let i = 0; i < 3; i++) {
      const make = e.maps[VARIANTS[i]];
      if (e.have[i] || !make || !viewWanted((i + 1) as 1 | 2 | 3)) continue;
      e.slots[i].value = make();
      e.have[i] = true;
      return;
    }
  }
});

function lookUniforms(look: ViewLook) {
  return {
    uMistK: { value: look.mistAmount ?? 0 },
    uMist: { value: new THREE.Color(look.mist ?? '#26323a') },
  };
}

const LOOK_DECL = /* glsl */ `
uniform vec4 uView;
uniform float uMistK;
uniform vec3 uMist;`;

const LOOK_APPLY = /* glsl */ `
outgoingLight = mix(outgoingLight, uMist, uMistK * uView.y);
#include <opaque_fragment>`;

/**
 * Make a MeshBasicMaterial with a `map` show the weather: its map becomes the
 * clear variant and the shader blends in the wet, snowy and sunny ones (falling
 * back to the clear one where a variant is not given). Only the variants with
 * any weight are sampled. Returns the material.
 */
export function weatherView<M extends THREE.MeshBasicMaterial>(mat: M, maps: ViewMaps, look: ViewLook = {}): M {
  mat.map = mat.map ?? maps.clear();
  // until a variant is built its slot shows the clear map (its weight is still 0 then)
  const entry: Entry = { maps, slots: [{ value: mat.map }, { value: mat.map }, { value: mat.map }], have: [!maps.wet, !maps.snow, !maps.sun] };
  entries.add(entry);
  const lu = lookUniforms(look);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { mapWet: entry.slots[0], mapSnow: entry.slots[1], mapSun: entry.slots[2], uView: U.uView, ...lu });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D mapWet;\nuniform sampler2D mapSnow;\nuniform sampler2D mapSun;${LOOK_DECL}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#ifdef USE_MAP
  vec4 viewTex = vec4(0.0);
  if (uView.x > 0.001) viewTex += texture2D( map, vMapUv ) * uView.x;
  if (uView.y > 0.001) viewTex += texture2D( mapWet, vMapUv ) * uView.y;
  if (uView.z > 0.001) viewTex += texture2D( mapSnow, vMapUv ) * uView.z;
  if (uView.w > 0.001) viewTex += texture2D( mapSun, vMapUv ) * uView.w;
  diffuseColor *= viewTex;
#endif`,
      )
      .replace('#include <opaque_fragment>', LOOK_APPLY);
  };
  mat.customProgramCacheKey = () => 'weather-view-maps';
  mat.needsUpdate = true;
  return mat;
}

/**
 * The same for a vertex-coloured MeshBasicMaterial (a painted sky dome): the
 * geometry carries `color` (clear), `colorWet`, `colorSnow` and `colorSun`,
 * blended by the weather.
 */
export function weatherVertexColors<M extends THREE.MeshBasicMaterial>(mat: M, look: ViewLook = {}): M {
  mat.vertexColors = true;
  const lu = lookUniforms(look);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uView: U.uView, ...lu });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 colorWet;\nattribute vec3 colorSnow;\nattribute vec3 colorSun;\nuniform vec4 uView;')
      .replace('#include <color_vertex>', 'vColor = vec3(color * uView.x + colorWet * uView.y + colorSnow * uView.z + colorSun * uView.w);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>${LOOK_DECL}`).replace('#include <opaque_fragment>', LOOK_APPLY);
  };
  mat.customProgramCacheKey = () => 'weather-view-colors';
  mat.needsUpdate = true;
  return mat;
}

/** A colour for the current weather: the clear, wet, snowy and sunny values blended like the views. */
export function viewColor(out: THREE.Color, clear: THREE.Color, wet: THREE.Color, snow: THREE.Color, sun: THREE.Color): THREE.Color {
  const v = U.uView.value;
  return out.setRGB(
    clear.r * v.x + wet.r * v.y + snow.r * v.z + sun.r * v.w,
    clear.g * v.x + wet.g * v.y + snow.g * v.z + sun.g * v.w,
    clear.b * v.x + wet.b * v.y + snow.b * v.z + sun.b * v.w,
  );
}

/** A number for the current weather: the clear, wet, snowy and sunny values blended like the views. */
export function viewValue(clear: number, wet: number, snow: number, sun: number): number {
  const v = U.uView.value;
  return clear * v.x + wet * v.y + snow * v.z + sun * v.w;
}
