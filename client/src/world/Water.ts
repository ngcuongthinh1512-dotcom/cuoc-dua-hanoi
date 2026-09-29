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
  SRGBColorSpace,
  type Texture,
  Vector2,
} from 'three';
import { water as W } from '../config.ts';
import type { WaterData } from '../geo/chunkData.ts';
import { type HeightGrid, heightAt } from '../geo/heightGrid.ts';
import { triangulate } from './geom.ts';
import { quayMesh, riverLevel } from './Terrain.ts';

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

/** Equirect sky gradient; three converts it to a PMREM cube-UV map for the standard material on first use.
 *  Also the reflection of the landmark metals (gold / bronze / metal), which render black without one. */
export function skyEnvironment(w = 64, h = 32): Texture {
  const zenith = new Color(W.sky.zenith);
  const horizon = new Color(W.sky.horizon);
  const data = new Uint8Array(w * h * 4);
  const c = new Color();
  for (let j = 0; j < h; j++) {
    const elev = ((j + 0.5) / h - 0.5) * Math.PI; // row 0 = straight down (flipY false, v = 0)
    if (elev > 0) c.lerpColors(horizon, zenith, Math.sqrt(Math.sin(elev)));
    else c.copy(horizon).multiplyScalar(0.6);
    for (let i = 0; i < w; i++) data.set([c.r * 255, c.g * 255, c.b * 255, 255], 4 * (j * w + i)); // sRGB bytes
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

  const normalMap = rippleNormals();
  const surface = new BufferGeometry();
  surface.setAttribute('position', new Float32BufferAttribute(pos, 3));
  surface.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  surface.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  surface.setIndex(index);
  const waterMesh = new Mesh(
    surface,
    new MeshStandardMaterial({
      color: W.colour,
      roughness: W.roughness,
      metalness: 0,
      envMap: skyEnvironment(),
      normalMap,
      normalScale: new Vector2(W.normalScale, W.normalScale),
    }),
  );
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
      normalMap.offset.x = (normalMap.offset.x + W.normalScroll * dt) % 1;
      normalMap.offset.y = (normalMap.offset.y + W.normalScroll * 0.6 * dt) % 1;
    },
  };
}
