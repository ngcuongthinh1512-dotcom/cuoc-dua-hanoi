// Night gameplay glows (agent N-A): no real lights, unlit HDR colours (bloom) + additive falloff textures. Main thread only.
import { AdditiveBlending, BackSide, Color, DataTexture, type ColorRepresentation, MeshBasicMaterial } from 'three';
import { graphics } from './graphics.ts';
import { glowScale } from './night.ts';

/** colour × k × glowScale() (lighting.emissiveScale, dimmer at dusk); k > 1 (HDR, bloom) only with post-processing, else capped at 1 (it would tone-map to white). */
export const nightHdr = (colour: ColorRepresentation, k: number) =>
  new Color(colour).multiplyScalar(glowScale() * (graphics().on('post') ? k : Math.min(k, 1)));

/** Pure: texel value 0…1 at (u, v) ∈ [0, 1]². round = (1 − r)² from the centre; cone = a beam from the bottom middle (v = 0)
 *  widening toward v = 1, fading with v and toward its edges. */
export function falloffAt(kind: 'round' | 'cone', u: number, v: number) {
  if (kind === 'round') {
    const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    return (1 - r) * (1 - r);
  }
  const half = 0.12 + 0.38 * v; // half width of the cone at v
  const side = Math.max(0, 1 - Math.abs(u - 0.5) / half);
  return side * side * (1 - v) * Math.min(1, v * 6);
}

const cache = new Map<string, DataTexture>();
export function falloff(kind: 'round' | 'cone') {
  let t = cache.get(kind);
  if (t) return t;
  const n = 64;
  const px = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = 255 * falloffAt(kind, (i + 0.5) / n, (j + 0.5) / n);
    px.set([g, g, g, 255], 4 * (j * n + i));
  }
  t = Object.assign(new DataTexture(px, n, n), { needsUpdate: true });
  cache.set(kind, t);
  return t;
}

/** Additive, no depth write, drawn over the ground (polygonOffset) and casting no shadow (shadowSide BackSide). */
export const additive = (kind: 'round' | 'cone', colour: Color) =>
  new MeshBasicMaterial({
    color: colour, map: falloff(kind), blending: AdditiveBlending, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, shadowSide: BackSide,
  });
