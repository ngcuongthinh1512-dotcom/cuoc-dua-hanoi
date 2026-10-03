// Package D: the global water mesh (Seine + other water bodies) and the stone quays (docs/plans/phase2.md "D").
// Module top level must not touch the DOM (textures are DataTextures built inside createWater).
import {
  BackSide,
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
import { graphics8c, water as W } from '../config.ts';
import type { WaterData } from '../geo/chunkData.ts';
import { type HeightGrid, heightAt } from '../geo/heightGrid.ts';
import { triangulate } from './geom.ts';
import { graphics } from './graphics.ts';
import { quayMesh, riverLevel } from './Terrain.ts';

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
  const zenith = new Color(W.sky.zenith);
  const horizon = new Color(W.sky.horizon);
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

/** Adds the water to the scene (after carveRiver); call update(dt) every frame (scrolling normal map).
 *  Seine polygons: flat at riverLevel, plus the stone quays of Terrain.quayMesh (walls from the carved bed, coping).
 *  Other water (fountains, ponds): flat at the mean terrain height of the ring + otherLift, not carved. */
export function createWater(scene: Scene, water: WaterData, grid: HeightGrid): { update(dt: number): void } {
  const level = riverLevel(grid, water);
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const p of water.polygons) {
    const holes = p.holes ?? [];
    const pts = [p.outer, ...holes].flat();
    let y = level;
    if (!p.river) {
      let sum = 0;
      for (let i = 0; i < p.outer.length; i += 2) sum += heightAt(grid, p.outer[i]!, p.outer[i + 1]!);
      y = sum / (p.outer.length / 2) + W.otherLift;
    }
    const base = pos.length / 3;
    for (let i = 0; i < pts.length; i += 2) pos.push(pts[i]!, y, pts[i + 1]!), uv.push(pts[i]! / W.normalTile, pts[i + 1]! / W.normalTile);
    for (const k of triangulate(p.outer, holes)) index.push(base + k);
  }

  // Phase 8C T1 (graphics8c.water): three's waternormals.jpg in two layers drifting apart (no visible tiling), the sky
  // environment (scene.environment once graphics8c.sky is on) for the reflection. Node tests: the ripple DataTexture.
  const hd = graphics().on('water') && typeof document !== 'undefined';
  const normalMap = hd ? new TextureLoader().load(GW.normalMap) : rippleNormals();
  normalMap.wrapS = normalMap.wrapT = RepeatWrapping;
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
  if (hd) {
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
  scene.add(waterMesh, wallMesh);

  return {
    update(dt: number) {
      if (hd) {
        const [a, b] = GW.layers;
        const step = (o: number, d: number, tile: number) => (o + (d / tile) * dt) % 1;
        layers.set(step(layers.x, a.drift[0], a.tile), step(layers.y, a.drift[1], a.tile), step(layers.z, b.drift[0], b.tile), step(layers.w, b.drift[1], b.tile));
        return;
      }
      normalMap.offset.x = (normalMap.offset.x + W.normalScroll * dt) % 1;
      normalMap.offset.y = (normalMap.offset.y + W.normalScroll * 0.6 * dt) % 1;
    },
  };
}
