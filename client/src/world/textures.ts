// Phase 8C foundation: PBR texture sets made by scripts/assets/pipeline.ts `pbrSet` →
// client/public/textures/<name>_{col,nrm,arm}.webp (+ <name>_<map>_1k.webp when the source is larger). Main thread only,
// inside create*Materials() (never at module top level: the chunk worker imports the builders' modules). Loads async: the
// material draws untextured for the first frames, then the maps pop in. arm = AO (r) · roughness (g) · metalness (b), the
// channel order three reads aoMap / roughnessMap / metalnessMap from, so one texture serves all three.
import * as THREE from 'three';
import { graphics8c } from '../config.ts';
import { graphics } from './graphics.ts';

export type PbrMap = 'col' | 'nrm' | 'arm';
const cache = new Map<string, THREE.Texture>();

/** One map of set `name`, RepeatWrapping (uv in metres → `material.map.repeat` per track), shared and cached.
 *  Anisotropy: graphics8c.quality.anisotropy (the renderer clamps it to the GPU's maximum). */
export function pbrTexture(name: string, map: PbrMap): THREE.Texture {
  const low = graphics().quality === 'low';
  const url = `textures/${name}_${map}${low ? '_1k' : ''}.webp`;
  let t = cache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url, undefined, undefined, () => console.warn(`${url} missing (scripts/assets: npm run process-assets)`));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = map === 'col' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = graphics8c.quality.anisotropy;
    cache.set(url, t);
  }
  return t;
}

/** MeshStandardMaterial parameters for set `name` (spread into the constructor / Object.assign). Low quality: the
 *  colour map only (no normal / ARM map: Phase 7 shading cost), the ARM map's mean AO / roughness from
 *  graphics8c.quality.lowArm. */
export function pbrMaps(name: string): THREE.MeshStandardMaterialParameters {
  if (graphics().quality === 'low') {
    const { ao, roughness } = graphics8c.quality.lowArm[name] ?? { ao: 1, roughness: 0.9 };
    return { map: pbrTexture(name, 'col'), color: new THREE.Color(ao, ao, ao), roughness, metalness: 0 };
  }
  const arm = pbrTexture(name, 'arm');
  return { map: pbrTexture(name, 'col'), normalMap: pbrTexture(name, 'nrm'), aoMap: arm, roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1 };
}
