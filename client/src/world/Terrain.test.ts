import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { Color, Mesh, Scene } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { terrain as T } from '../config.ts';
import { chunkBounds, type WaterData } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import { type HeightGrid, heightAt, parseHeightGrid } from '../geo/heightGrid.ts';
import { buildTerrain, carveRiver, createTerrainCollider, quayMesh, riverLevel } from './Terrain.ts';
import { createWater } from './Water.ts';

const flat = (): HeightGrid => ({ minX: 0, minZ: 0, cell: 5, cols: 61, rows: 61, h: new Float32Array(61 * 61) });
// River: x ∈ [100, 200] (nodes 20–40), whole height; an island hole x, z ∈ [130, 170] (nodes 26–34).
const square: WaterData = {
  v: 1,
  polygons: [{ river: true, outer: [100, 0, 200, 0, 200, 300, 100, 300], holes: [[130, 130, 170, 130, 170, 170, 130, 170]] }],
};
const at = (g: HeightGrid, c: number, r: number) => g.h[r * g.cols + c]!;

describe('carveRiver', () => {
  it('lowers river nodes and their neighbours, raises the quay band, falls off to the DEM, keeps the island', () => {
    const g = flat();
    carveRiver(g, square);
    const level = riverLevel(g, square);
    expect(level).toBe(0);
    const top = level + T.quayHeight;
    expect(at(g, 25, 10)).toBe(level - T.riverDepth); // in the river
    expect(at(g, 19, 10)).toBe(level - T.riverDepth); // 5 m west of the bank: bed too (the slope sits behind the wall)
    expect(at(g, 18, 10)).toBe(top); // 10 m west
    expect(at(g, 30, 30)).toBeCloseTo(top - T.quayGrade * (15 - T.quayBand), 4); // island centre, 15 m from the bed
    expect(at(g, 10, 10)).toBeCloseTo(top - T.quayGrade * (45 - T.quayBand), 4); // 45 m west of the bed
    expect(at(g, 0, 10)).toBeGreaterThan(0);
    expect(g.h.every(Number.isFinite)).toBe(true);
  });

  it('quayMesh: walls face the river, coping faces up, all finite', () => {
    // A pond widens the water extent in x, so only the river's ends (z = 0, 300) lie on it: clip edges, no quay there.
    const pond = { river: false, outer: [0, 150, 250, 150, 250, 155, 0, 155] };
    const m = quayMesh({ ...square, polygons: [...square.polygons, pond] }, 0);
    expect(m.vertices.every(Number.isFinite)).toBe(true);
    const v = (i: number) => [m.vertices[3 * i]!, m.vertices[3 * i + 1]!, m.vertices[3 * i + 2]!];
    const normal = (t: number) => {
      const [a, b, c] = [0, 1, 2].map((k) => v(m.indices[3 * t + k]!));
      const u = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
      const w = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
      return [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    };
    const quads = m.indices.length / 6;
    for (let q = 0; q < quads; q++) {
      const n = normal(2 * q);
      const [bx] = v(4 * q);
      const [ax] = v(4 * q + 1);
      if (q % 2) expect(n[1]).toBeGreaterThan(0); // coping
      else if (ax === bx) expect(Math.sign(n[0]!)).toBe({ 100: 1, 130: -1, 170: 1, 200: -1 }[ax!]); // walls look at the water
    }
    expect(quads).toBe(2 * 6); // 2 banks + 4 island edges, wall + coping each
  });

  it('warns and leaves the grid alone when no node is in a river', () => {
    const g = flat();
    carveRiver(g, { v: 1, polygons: [{ river: false, outer: square.polygons[0]!.outer }] });
    expect(g.h.every((y) => y === 0)).toBe(true);
  });
});

describe('buildTerrain', () => {
  it('builds a chunkRes² grid, park colour inside the fixture park, unit normals, no NaN', () => {
    const out = buildTerrain(fixture, { key: fixture.key, bounds: chunkBounds(fixture.key), height: (x, z) => 0.01 * x - 0.02 * z });
    const b = out.meshes[0]!;
    const n = T.chunkRes;
    expect(b.position.length).toBe(n * n * 3);
    expect(b.index.length).toBe((n - 1) * (n - 1) * 6);
    for (const a of [b.position, b.normal, b.color!]) expect(a.every(Number.isFinite)).toBe(true);
    for (let k = 0; k < n * n; k++) expect(Math.hypot(b.normal[3 * k]!, b.normal[3 * k + 1]!, b.normal[3 * k + 2]!)).toBeCloseTo(1, 5);
    const colourAt = (x: number, z: number) => {
      const k = (z / 5) * n + x / 5;
      return [b.color![3 * k], b.color![3 * k + 1], b.color![3 * k + 2]];
    };
    const c = (hex: string) => new Color(hex).toArray();
    expect(colourAt(150, 200)).toEqual(c(T.colours.park).map((v) => Math.fround(v)));
    expect(colourAt(5, 5)).toEqual(c(T.colours.pavement).map((v) => Math.fround(v)));
    expect(colourAt(190, 155)).toEqual(c(T.colours.pavement).map((v) => Math.fround(v))); // the pond hole
    // Normal tilts against the gradient: height rises to +x → normal points −x.
    expect(b.normal[0]).toBeLessThan(0);
    expect(b.normal[2]).toBeGreaterThan(0);
  });
});

const d = join(__dirname, '../../public/data/');
describe.skipIf(!['elevation.json', 'elevation.bin', 'water.json'].every((f) => existsSync(d + f)))('real data', () => {
  let grid: HeightGrid;
  let water: WaterData;
  beforeAll(() => {
    grid = parseHeightGrid(JSON.parse(readFileSync(d + 'elevation.json', 'utf8')), readFileSync(d + 'elevation.bin'));
    water = JSON.parse(readFileSync(d + 'water.json', 'utf8')) as WaterData;
    carveRiver(grid, water);
  });

  it('carved grid has no NaN and a Seine below its quays', () => {
    expect(grid.h.every(Number.isFinite)).toBe(true);
    const level = riverLevel(grid, water);
    expect(level).toBeLessThan(-3); // the Seine sits several metres below the Concorde (y = 0)
    expect(grid.h.reduce((a, b) => Math.min(a, b))).toBeCloseTo(level - T.riverDepth, 4);
  });

  it('Rapier heightfield matches heightAt within 2 cm', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    createTerrainCollider(world, grid);
    world.step();
    const ray = (x: number, z: number) => new RAPIER.Ray({ x, y: 500, z }, { x: 0, y: -1, z: 0 });
    const onlyHeightfield = (c: RAPIER.Collider) => c.shape.type === RAPIER.ShapeType.HeightField;
    expect(world.castRay(ray(-557, 203), 1000, true)).not.toBeNull(); // Seine at Pont Alexandre III: quays exist too
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const w = (grid.cols - 1) * grid.cell;
    const h = (grid.rows - 1) * grid.cell;
    const pts: [number, number][] = [
      [0.3, 0.2],
      [grid.minX + 1, grid.minZ + 1],
      [grid.minX + w - 1, grid.minZ + h - 1],
    ];
    // Points 1 mm off cell edges: there bilinear and Rapier's triangles agree to < 1 mm, so any layout error shows.
    // (Exactly ON an interior grid line a vertical Rapier ray can miss the heightfield: parry edge case.)
    for (let i = 0; i < 400; i++) {
      const c = Math.floor(rnd() * (grid.cols - 1));
      const r = Math.floor(rnd() * (grid.rows - 1));
      const f = rnd() * grid.cell;
      const e = 0.001;
      pts.push(i % 2 ? [grid.minX + c * grid.cell + f, grid.minZ + r * grid.cell + e] : [grid.minX + c * grid.cell + e, grid.minZ + r * grid.cell + f]);
    }
    for (const [x, z] of pts) {
      const hit = world.castRay(ray(x, z), 1000, true, undefined, undefined, undefined, undefined, onlyHeightfield);
      expect(hit, `no hit at ${x}, ${z}`).not.toBeNull();
      expect(Math.abs(500 - hit!.timeOfImpact - heightAt(grid, x, z)), `at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThan(0.02);
    }
    world.free();
  });

  it('createWater adds a Seine surface at the carved level and quay walls, all finite', () => {
    const scene = new Scene();
    const w = createWater(scene, water, grid);
    w.update(0.016);
    const meshes = scene.children.filter((o): o is Mesh => o instanceof Mesh);
    expect(meshes.map((m) => m.name)).toEqual(['water', 'quay-walls']);
    for (const m of meshes) expect((m.geometry.getAttribute('position').array as Float32Array).every(Number.isFinite)).toBe(true);
    const level = riverLevel(grid, water);
    const ys = meshes[0]!.geometry.getAttribute('position').array as Float32Array;
    expect(Array.from(ys).filter((_, i) => i % 3 === 1).some((y) => Math.abs(y - level) < 1e-4)).toBe(true);
  });
});
