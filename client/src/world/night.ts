// Leg 2 night mode (config timeOfDay + lighting). Main thread: main.ts calls initTimeOfDay() before the sky and the
// materials are made; ?time=day|night only offline (a real race always uses config.timeOfDay). The chunk worker never
// reads this (its builds stay the same day and night).
import { Color } from 'three';
import { lighting as L, timeOfDay as DEFAULT } from '../config.ts';

export type TimeOfDay = 'day' | 'night';

/** Pure: URL ?time= (offline only) > config. */
export function pickTime(url: string | null, online: boolean, fallback: TimeOfDay = DEFAULT): TimeOfDay {
  return !online && (url === 'day' || url === 'night') ? url : fallback;
}

let current: TimeOfDay = DEFAULT;
export function initTimeOfDay(query: URLSearchParams, online: boolean) {
  current = pickTime(query.get('time'), online);
}
export const isNight = () => current === 'night';

/** Emissive settings for a MeshStandardMaterial (Object.assign(material, nightGlow(c, k))): black by day, at night
 *  colour × intensity × lighting.emissiveScale. Building windows: nightGlow(lighting.windows.colour, lighting.windows.intensity). */
export function nightGlow(colour: string, intensity = 1) {
  return isNight() ? { emissive: new Color(colour), emissiveIntensity: intensity * L.emissiveScale } : { emissive: new Color(0), emissiveIntensity: 0 };
}

/** Seconds for the night shaders (TV flicker, neon, aviation lights, stars, water); Sky.update() advances it every frame.
 *  Shared uniform object: put it in shader.uniforms (onBeforeCompile) as is. */
export const nightTime = { value: 0 };

/** Pure: the share of a lit building's windows that glow at lighting.hour (0 = dusk … 1 = small hours). */
export const litShareAt = (hour: number) => L.windows.litShare * (1 - Math.min(1, Math.max(0, hour)) * (1 - L.windows.lateShare));

const vec3 = (hex: string, k = 1) => {
  const c = new Color(hex).multiplyScalar(k);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};
const f = (n: number) => n.toFixed(4);

/** Night glow GLSL for the facade materials (BuildingBuilder facadeMaterial), null by day (shader unchanged). `rx, ry` =
 *  map repeat (map uv / repeat = the raw uv: bays × floors, shop band: shops × band). Vertex: the `lit` attribute
 *  (MeshBucket.lit) → vLit. Fragment `glow` runs at <color_fragment> before the tint, while diffuseColor = map texel incl.
 *  its alpha (≤ 0.5 glass, 0.5–0.9 trim / signs), and adds to totalEmissiveRadiance. Facades: in a lit building
 *  (vLit > 0) litShareAt(lighting.hour) of the windows glow (each re-rolled every windows.switchSeconds: the city lives),
 *  palette colour, windows.tv.share of them a flickering blue TV, hash of (window, vLit), brighter towards the ceiling.
 *  `uniforms` (uNightTime) must go into shader.uniforms. Shops (vLit = seed):
 *  shops.openShare of the shops light their signboard (canvas v 0.74–0.96) in its own colour + the shop window. */
export function facadeNightGlsl(shop: boolean, rx: number, ry: number) {
  if (!isNight()) return null;
  const W = L.windows;
  const T = W.tv;
  const k = L.emissiveScale;
  const pick = W.palette.map(([c, w], i) => (i === W.palette.length - 1 ? vec3(c) : `h2 < ${f(w)} ? ${vec3(c)} : `)).join('');
  const body = shop
    ? `float fOpen = step(fHash(vec2(fCell.x, 3.0) + fSeed), ${f(L.shops.openShare)});
\tfloat fSign = smoothstep(0.45, 0.55, fA) * (1.0 - smoothstep(0.85, 0.95, fA)) * step(0.74, vMapUv.y) * step(vMapUv.y, 0.96);
\ttotalEmissiveRadiance += diffuseColor.rgb * (fOpen * (${f(L.shops.sign * k)} * fSign + ${f(L.shops.interior * k)} * fGlass));`
    : `float h0 = fHash(fCell + fSeed);
\tfloat h = fHash(fCell + fSeed + floor(uNightTime / ${f(W.switchSeconds)} + h0 * 61.0)); // re-rolled every switchSeconds, own phase
\tfloat h2 = fHash(fCell.yx + fSeed * 0.37 + 5.1);
\tfloat fOn = step(0.001, vLit) * step(h, ${f(litShareAt(L.hour))}) * fGlass;
\tfloat fTv = step(fract(h0 * 13.7), ${f(T.share)}); // TV: blue, flickering
\tvec3 fCol = mix((${pick}), ${vec3(T.colour)}, fTv) * (1.0 - fTv * ${f(T.depth)} * fHash(vec2(floor(uNightTime * ${f(T.rate)} + h0 * 91.0), h0 * 37.0)));
\ttotalEmissiveRadiance += fCol * (fOn * ${f(W.intensity * k)} * (0.6 + 0.6 * fract(h0 * 7.0)) * (0.7 + 0.45 * fract(vMapUv.y * ${f(1 / ry)})));`;
  return {
    vertexHead: 'attribute float lit;\nvarying float vLit;',
    vertex: 'vLit = lit;',
    uniforms: { uNightTime: nightTime },
    fragmentHead: `varying float vLit;
uniform float uNightTime;
float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`,
    glow: `float fA = diffuseColor.a;
\tvec2 fCell = floor(vMapUv * vec2(${f(1 / rx)}, ${f(1 / ry)}));
\tfloat fGlass = 1.0 - smoothstep(0.45, 0.55, fA);
\tfloat fSeed = floor(vLit * 997.0 + 0.5); // quantised: the interpolated varying jitters, the hash would sparkle
\t${body}`,
  };
}
