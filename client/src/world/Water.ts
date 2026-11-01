// Package D: the global water mesh (Seine + other water bodies) and the stone quays (docs/plans/phase2.md "D").
// Module top level must not touch the DOM (textures are DataTextures built inside createWater).
import {
  BackSide,
  CanvasTexture,
  InstancedMesh,
  MeshBasicMaterial,
  Matrix4,
  SphereGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  type Scene,
  ShaderChunk,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  Vector4,
} from 'three';
import { graphics8c, lighting, water as W } from '../config.ts';
import type { WaterData } from '../geo/chunkData.ts';
import type { HeightGrid } from '../geo/heightGrid.ts';
import { triangulate } from './geom.ts';
import { graphics } from './graphics.ts';
import { hash01 } from './geom.ts';
import { isNight, nightTime } from './night.ts';
import { lakeKerbMesh, quayMesh, riverLevel, waterLevelOf } from './Terrain.ts';

const GW = graphics8c.water;

/** Tileable ripple normal map: a few integer-frequency sine waves, analytic derivatives. */
function rippleNormals(size = 128): Texture {
  const waves = [
    [3, 1, 0.3, 0.0],
    [-2, 4, 0.25, 1.3],
    [5, -3, 0.15, 2.1],
    [1, 7, 0.1, 4.2],
    [-8, -5, 0.06, 0.7],
  ] as const; // kx, ky, amplitude, phase
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let du = 0;
      let dv = 0;
      for (const [kx, ky, a, p] of waves) {
        const c = a * Math.cos(2 * Math.PI * ((kx * i + ky * j) / size) + p);
        du += c * kx;
        dv += c * ky;
      }
      const l = Math.hypot(du, dv, 4);
      const k = 4 * (j * size + i);
      data.set([((-du / l) * 0.5 + 0.5) * 255, ((-dv / l) * 0.5 + 0.5) * 255, ((4 / l) * 0.5 + 0.5) * 255, 255], k);
    }
  }
  const t = new DataTexture(data, size, size);
  Object.assign(t, { wrapS: RepeatWrapping, wrapT: RepeatWrapping, magFilter: LinearFilter, minFilter: LinearMipmapLinearFilter, generateMipmaps: true, needsUpdate: true });
  return t;
}

/** Phase 8C T1: world/Sky.ts sets scene.environment (the HDRI image-based light on every standard material); off on low
 *  quality unless graphics8c.sky.lowEnvironment (SwiftShader bench: −35 % FPS). Off → materials that need a reflection
 *  (landmark metals, the river) keep their own skyEnvironment(). */
export const sceneEnvironmentOn = () => graphics().on('sky') && (graphics().quality === 'high' || graphics8c.sky.lowEnvironment);

/** Equirect sky gradient; three converts it to a PMREM cube-UV map for the standard material on first use.
 *  Also the reflection of the landmark metals (gold / bronze / metal), which render black without one. */
export function skyEnvironment(w = 64, h = 32): Texture {
  const sky = isNight() ? lighting.water : W.sky;
  const zenith = new Color(sky.zenith);
  const horizon = new Color(sky.horizon);
  const data = new Uint8Array(w * h * 4);
  const c = new Color();
  const o = { r: 0, g: 0, b: 0 };
  for (let j = 0; j < h; j++) {
    const elev = ((j + 0.5) / h - 0.5) * Math.PI; // row 0 = straight down (flipY false, v = 0)
    if (elev > 0) c.lerpColors(horizon, zenith, Math.sqrt(Math.sin(elev)));
    else c.copy(horizon).multiplyScalar(0.6);
    c.getRGB(o, SRGBColorSpace); // Color holds linear; the texture is tagged sRGB, so encode once here
    for (let i = 0; i < w; i++) data.set([o.r * 255, o.g * 255, o.b * 255, 255], 4 * (j * w + i));
  }
  const t = new DataTexture(data, w, h);
  Object.assign(t, { mapping: EquirectangularReflectionMapping, colorSpace: SRGBColorSpace, magFilter: LinearFilter, needsUpdate: true });
  return t;
}

type Poly = WaterData['polygons'][number];

/** Pure: distance from (x, z) to the nearest edge of the ring. */
function ringDistance(r: readonly number[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [x0, z0, x1, z1] = [r[j]!, r[j + 1]!, r[i]!, r[i + 1]!];
    const l2 = (x1 - x0) ** 2 + (z1 - z0) ** 2;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / l2)) : 0;
    best = Math.min(best, Math.hypot(x0 + t * (x1 - x0) - x, z0 + t * (z1 - z0) - z));
  }
  return best;
}
function inRing(o: readonly number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = o.length - 2; i < o.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [o[i]!, o[i + 1]!, o[j]!, o[j + 1]!];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Pure (lighting.waterLights): the shoreline lights of the sea polygons (every shoreStep m, shoreShare of them, colour
 *  hashed; edges on the polygon's bounding box = the map border, skipped), the boats (≥ boats.minShore m out, inside the
 *  sea, not in a hole) and the casino glints → [x, z, radius m, colour] spots. */
export function waterLightSpots(seas: Poly[]) {
  const C = lighting.waterLights;
  const shore: [number, number, number, string][] = [];
  const boats: [number, number, string][] = [];
  for (const p of seas) {
    const o = p.outer;
    let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < o.length; i += 2) [minX, maxX, minZ, maxZ] = [Math.min(minX, o[i]!), Math.max(maxX, o[i]!), Math.min(minZ, o[i + 1]!), Math.max(maxZ, o[i + 1]!)];
    const border = (x: number, z: number) => Math.min(x - minX, maxX - x, z - minZ, maxZ - z) < 2;
    for (const r of [o, ...(p.holes ?? [])]) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const [x0, z0, x1, z1] = [r[j]!, r[j + 1]!, r[i]!, r[i + 1]!];
        if (border(x0, z0) && border(x1, z1)) continue;
        const len = Math.hypot(x1 - x0, z1 - z0);
        for (let s = hash01(x0, z0, 71) * C.shoreStep; s < len; s += C.shoreStep) {
          const [x, z] = [x0 + ((x1 - x0) * s) / len, z0 + ((z1 - z0) * s) / len];
          if (hash01(x, z, 72) < C.shoreShare) shore.push([x, z, C.dot, C.colours[Math.floor(hash01(x, z, 73) * C.colours.length)]!]);
        }
      }
    }
    const B = C.boats;
    for (let k = 0; boats.length < B.count * (seas.indexOf(p) + 1) && k < B.count * 40; k++) {
      const [x, z] = [minX + hash01(k, seas.indexOf(p), 74) * (maxX - minX), minZ + hash01(k, seas.indexOf(p), 75) * (maxZ - minZ)];
      if (!inRing(o, x, z) || (p.holes ?? []).some((h) => inRing(h, x, z))) continue;
      if ([o, ...(p.holes ?? [])].some((r) => ringDistance(r, x, z) < B.minShore)) continue;
      boats.push([x, z, B.colours[Math.floor(hash01(x, z, 76) * B.colours.length)]!]);
    }
  }
  return { shore, boats };
}

/** Night: the light map canvas (world rect `rect` = [x0, z0, size x, size z]) of the shore lights, boats and glints. */
function lightMap(spots: [number, number, number, string][], rect: number[]) {
  const C = lighting.waterLights;
  const c = document.createElement('canvas');
  c.width = c.height = C.mapSize;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, C.mapSize, C.mapSize);
  g.globalCompositeOperation = 'lighter';
  const [x0, z0, w, h] = rect as [number, number, number, number];
  for (const [x, z, r, colour] of spots) {
    const [px, py, rx, ry] = [((x - x0) / w) * C.mapSize, ((z - z0) / h) * C.mapSize, (r / w) * C.mapSize, (r / h) * C.mapSize];
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(Math.max(rx, 1), 0, 0, Math.max(ry, 1), px, py);
    g.fillStyle = grad;
    g.fillRect(-1, -1, 2, 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.flipY = false; // v = 0 = canvas top = z0
  return t;
}

/** Adds the water to the scene (after carveRiver); call update(dt) every frame (scrolling normal map).
 *  Seine polygons: flat at riverLevel, plus the stone quays of Terrain.quayMesh (walls from the carved bed, coping).
 *  Other water (lakes, fountains, ponds): flat at its rim height + otherLift (Terrain.waterLevelOf; carveRiver sank the
 *  ground under it). */
export function createWater(scene: Scene, water: WaterData, grid: HeightGrid): { update(dt: number): void } {
  const level = riverLevel(grid, water);
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const [pi, p] of water.polygons.entries()) {
    const holes = p.holes ?? [];
    const pts = [p.outer, ...holes].flat();
    const y = waterLevelOf(grid, water, pi);
    const base = pos.length / 3;
    for (let i = 0; i < pts.length; i += 2) pos.push(pts[i]!, y, pts[i + 1]!), uv.push(pts[i]! / W.normalTile, pts[i + 1]! / W.normalTile);
    for (const k of triangulate(p.outer, holes)) index.push(base + k);
  }

  // Phase 8C T1 (graphics8c.water): three's waternormals.jpg in two layers drifting apart (no visible tiling), the sky
  // environment (scene.environment once graphics8c.sky is on) for the reflection. Node tests: the ripple DataTexture.
  // Low quality: the first layer only (one normal sample, three's own normal map path; fix B, review F1).
  const hd = graphics().on('water') && typeof document !== 'undefined';
  const two = hd && graphics().quality === 'high';
  const normalMap = hd ? new TextureLoader().load(GW.normalMap) : rippleNormals();
  normalMap.wrapS = normalMap.wrapT = RepeatWrapping;
  if (hd && !two) normalMap.repeat.setScalar(W.normalTile / GW.layers[0].tile);
  const layers = new Vector4(); // xy, zw = uv offsets of the two layers
  const material = new MeshStandardMaterial({
    color: hd ? GW.colour : W.colour,
    roughness: hd ? GW.roughness : W.roughness,
    metalness: 0,
    envMap: sceneEnvironmentOn() ? null : skyEnvironment(),
    envMapIntensity: hd ? GW.envMapIntensity : 1,
    normalMap,
    normalScale: new Vector2().setScalar(hd ? GW.normalScale : W.normalScale),
  });
  if (two) {
    const [a, b] = GW.layers;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.waterLayers = { value: layers };
      shader.fragmentShader = `uniform vec4 waterLayers;\n${shader.fragmentShader}`.replace(
        '#include <normal_fragment_maps>',
        ShaderChunk.normal_fragment_maps.replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          `vec3 mapN = texture2D( normalMap, vNormalMapUv * ${(W.normalTile / a.tile).toFixed(4)} + waterLayers.xy ).xyz` +
            ` + texture2D( normalMap, vNormalMapUv * ${(W.normalTile / b.tile).toFixed(4)} + waterLayers.zw ).xyz - 1.0;`,
        ),
      );
    };
  }
  // Leg 2 night (lighting.waterLights): the city's lights on the sea. The reflected view ray (ripple normal) meets the
  // plane y = level + height where the light map lies: the ripples stretch the shore lights into streaks toward the viewer.
  // ponytail: a 2D map at one height (no occlusion, no real reflection of the buildings); a Reflector if FPS ever allows.
  const C = lighting.waterLights;
  let boats: InstancedMesh | undefined;
  if (isNight()) {
    const base = new Color(C.base);
    const seas = water.polygons.filter((p) => p.river);
    const { shore, boats: boatSpots } = waterLightSpots(seas);
    const pts = seas.flatMap((p) => p.outer);
    const xs = pts.filter((_, i) => i % 2 === 0);
    const zs = pts.filter((_, i) => i % 2 === 1);
    const rect = xs.length ? [Math.min(...xs), Math.min(...zs), Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)] : [0, 0, 1, 1];
    const map = typeof document !== 'undefined' ? lightMap([...shore, ...boatSpots.map(([x, z, c]): [number, number, number, string] => [x, z, C.dot * 0.6, c]), ...C.glints], rect) : undefined;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (sh, r) => {
      prev.call(material, sh, r);
      sh.uniforms.uLightMap = { value: map ?? null };
      sh.uniforms.uNightTime = nightTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWaterWorld;\nuniform sampler2D uLightMap;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
\ttotalEmissiveRadiance += vec3(${base.r.toFixed(4)}, ${base.g.toFixed(4)}, ${base.b.toFixed(4)});
${map ? `\t{
\t\tvec3 wN = inverseTransformDirection(normal, viewMatrix);
\t\tvec3 wV = normalize(vWaterWorld - cameraPosition);
\t\tvec3 wR = reflect(wV, normalize(vec3(wN.x * 2.5, wN.y, wN.z * 2.5))); // ripples × 2.5: longer streaks
\t\tif (wR.y > 0.002) {
\t\t\tvec2 q = vWaterWorld.xz + wR.xz * (${C.height.toFixed(2)} / wR.y);
\t\t\tvec2 uv = (q - vec2(${rect[0]!.toFixed(1)}, ${rect[1]!.toFixed(1)})) / vec2(${rect[2]!.toFixed(1)}, ${rect[3]!.toFixed(1)});
\t\t\tfloat fres = 0.35 + 0.65 * pow(1.0 - clamp(dot(-wV, wN), 0.0, 1.0), 3.0);
\t\t\ttotalEmissiveRadiance += textureLod(uLightMap, uv, 1.0).rgb * ${C.strength.toFixed(3)} * fres;
\t\t}
\t}` : ''}`);
    };
    material.customProgramCacheKey = () => `water-night${two ? '2' : ''}${map ? 'm' : ''}`;
    if (boatSpots.length) {
      const B = C.boats;
      const k = graphics().on('post') ? B.intensity : 1;
      boats = new InstancedMesh(new SphereGeometry(B.size / 2, 8, 6), new MeshBasicMaterial(), boatSpots.length);
      const m = new Matrix4();
      boatSpots.forEach(([x, z, c], i) => {
        boats!.setMatrixAt(i, m.makeTranslation(x, level + 0.8 + 1.2 * hash01(x, z, 77), z));
        boats!.setColorAt(i, new Color(c).multiplyScalar(k));
      });
      boats.computeBoundingSphere();
      boats.name = 'boat lights';
    }
  }

  const surface = new BufferGeometry();
  surface.setAttribute('position', new Float32BufferAttribute(pos, 3));
  surface.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  surface.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  surface.setIndex(index);
  const waterMesh = new Mesh(surface, material);
  waterMesh.receiveShadow = true;
  waterMesh.name = 'water';

  const quays = quayMesh(water, level);
  const walls = new BufferGeometry();
  walls.setAttribute('position', new Float32BufferAttribute(quays.vertices, 3));
  walls.setIndex(new BufferAttribute(quays.indices, 1));
  walls.computeVertexNormals(); // 4 unshared vertices per quad → flat
  const wallMesh = new Mesh(walls, new MeshStandardMaterial({ color: W.wallColour, roughness: 0.9, side: DoubleSide, shadowSide: BackSide }));
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  wallMesh.name = 'quay-walls';
  const kerbs = lakeKerbMesh(grid, water); // Leg 3: stone kerb round every swim lake
  const kerb = new BufferGeometry();
  kerb.setAttribute('position', new Float32BufferAttribute(kerbs.vertices, 3));
  kerb.setIndex(new BufferAttribute(kerbs.indices, 1));
  kerb.computeVertexNormals();
  const kerbMesh = new Mesh(kerb, new MeshStandardMaterial({ color: W.kerb.colour, roughness: 0.9, side: DoubleSide, shadowSide: BackSide }));
  kerbMesh.castShadow = kerbMesh.receiveShadow = true;
  kerbMesh.name = 'lake-kerbs';
  if (boats) waterMesh.add(boats); // world coordinates (the water mesh sits at the origin)
  scene.add(waterMesh, wallMesh, kerbMesh);

  return {
    update(dt: number) {
      const [a, b] = GW.layers;
      const step = (o: number, d: number, tile: number) => (o + (d / tile) * dt) % 1;
      if (two) {
        layers.set(step(layers.x, a.drift[0], a.tile), step(layers.y, a.drift[1], a.tile), step(layers.z, b.drift[0], b.tile), step(layers.w, b.drift[1], b.tile));
        return;
      }
      if (hd) return void normalMap.offset.set(step(normalMap.offset.x, a.drift[0], a.tile), step(normalMap.offset.y, a.drift[1], a.tile));
      normalMap.offset.x = (normalMap.offset.x + W.normalScroll * dt) % 1;
      normalMap.offset.y = (normalMap.offset.y + W.normalScroll * 0.6 * dt) % 1;
    },
  };
}
