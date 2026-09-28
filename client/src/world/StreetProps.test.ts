import { describe, expect, it } from 'vitest';
import { props as P } from '../config.ts';
import { type ChunkData, chunkBounds, type RoadRec } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import type { BuildCtx } from './buildTypes.ts';
import { buildStreetProps, createPropMeshes, findJunctions, placeLamps, placeSigns, splitName } from './StreetProps.ts';
import { buildVegetation } from './Vegetation.ts';

const ctx: BuildCtx = { key: '0_0', bounds: chunkBounds('0_0'), height: () => 0 };
const chunk = (roads: RoadRec[]): ChunkData => ({ v: 1, key: '0_0', buildings: [], roads, bridges: [], areas: [], points: [] });

/** n × n street grid over the chunk, every crossing a junction vertex; horizontal "Rue Hi", vertical "Avenue Vj". */
function grid(n: number, step: number): ChunkData {
  const at = Array.from({ length: n }, (_, i) => 5 + i * step);
  const road = (name: string, pts: number[]): RoadRec => ({
    pts, kind: 'residential', name, oneway: false, roundabout: false, junctions: at.map((_, i) => i),
  });
  return chunk([
    ...at.map((z, i) => road(`Rue H${i}`, at.flatMap((x) => [x, z]))),
    ...at.map((x, j) => road(`Avenue V${j}`, at.flatMap((z) => [x, z]))),
  ]);
}

const sameNameTooClose = (s: ReturnType<typeof placeSigns>) =>
  s.some((a, i) => s.some((b, k) => k > i && a.name === b.name && Math.hypot(a.x - b.x, a.z - b.z) < P.signs.dedupe));

describe('street props placement', () => {
  it('lamps: both sides every lampSpacing m along a straight car road, none near junctions', () => {
    const straight = chunk([{ pts: [0, 100, 250, 100], kind: 'primary', oneway: false, roundabout: false, junctions: [] }]);
    const lamps = placeLamps(straight, []);
    expect(lamps.length).toBe(2 * 8); // arc length 15, 45, …, 225
    const north = lamps.filter((l) => l.z < 100).map((l) => l.x);
    expect(north.slice(1).map((x, i) => x - north[i]!)).toEqual(Array(7).fill(P.lampSpacing));
    const gapped = placeLamps(straight, [{ x: 45, z: 100 }]); // a junction exactly where a lamp pair would stand
    expect(gapped.length).toBe(2 * 7);
    expect(gapped.every((l) => Math.abs(l.x - 45) >= P.lampJunctionGap)).toBe(true);
    const { points } = findJunctions(fixture, '0_0');
    for (const l of placeLamps(fixture, points)) {
      expect(Math.hypot(l.x - 125, l.z - 100)).toBeGreaterThanOrEqual(P.lampJunctionGap);
    }
    expect(placeLamps(chunk([{ ...straight.roads[0]!, kind: 'footway' }]), [])).toEqual([]);
  });

  it('signs: one per named street per junction, deduped within 15 m, deterministic', () => {
    const g = grid(10, 24);
    const { owned } = findJunctions(g, '0_0');
    expect(owned.length).toBe(100);
    const signs = placeSigns(owned);
    expect(signs.length).toBe(200);
    expect(sameNameTooClose(signs)).toBe(false);
    expect(placeSigns(findJunctions(g, '0_0').owned)).toEqual(signs);
    // Signs stand on a corner, off both carriageways (residential 7 m).
    const lines = Array.from({ length: 10 }, (_, i) => 5 + i * 24);
    for (const s of signs.filter((s) => s.x > 10 && s.x < 216 && s.z > 10 && s.z < 216)) { // interior: 4-arm crossings
      expect(Math.min(...lines.map((c) => Math.abs(s.x - c)))).toBeGreaterThan(3.5);
      expect(Math.min(...lines.map((c) => Math.abs(s.z - c)))).toBeGreaterThan(3.5);
    }
    const dense = placeSigns(findJunctions(grid(10, 10), '0_0').owned);
    expect(dense.length).toBeLessThan(200);
    expect(sameNameTooClose(dense)).toBe(false);
  });

  it('junction ownership: a crossing outside the chunk is not owned', () => {
    const g = grid(2, 300); // second line at 305 → only (5, 5) lies in chunk 0_0
    expect(findJunctions(g, '0_0').owned.map((j) => [j.x, j.z])).toEqual([[5, 5]]);
  });

  it('plaque text splits type + particles from the name', () => {
    expect(splitName('Avenue des Champs-Élysées')).toEqual(['AVENUE DES', 'CHAMPS-ÉLYSÉES']);
    expect(splitName("Quai d'Orsay")).toEqual(["QUAI D'", 'ORSAY']);
    expect(splitName('Rue de la Paix')).toEqual(['RUE DE LA', 'PAIX']);
    expect(splitName('Place Charles de Gaulle')).toEqual(['PLACE', 'CHARLES DE GAULLE']);
  });

  it('buildStreetProps: Morris ≈ 1 in morrisOneIn junctions, metro faces the nearest road, no NaN', () => {
    const out = buildStreetProps(grid(10, 24), ctx); // no OffscreenCanvas in Node → signs skipped (warned once)
    const morris = out.instances.find((s) => s.kind === 'morris')!.matrices.length / 16;
    expect(morris).toBeGreaterThan(100 / P.morrisOneIn / 2.5);
    expect(morris).toBeLessThan((100 / P.morrisOneIn) * 2.5);
    expect(buildStreetProps(grid(10, 24), ctx)).toEqual(out);
    const f = buildStreetProps(fixture, ctx);
    const metro = f.instances.find((s) => s.kind === 'metro')!.matrices;
    expect(metro.length).toBe(16);
    // Entrance at (100, 95), road at z = 100 → local +Z (column 2: m[8], m[10]) points south (+Z).
    expect(metro[8]).toBeCloseTo(0, 5);
    expect(metro[10]).toBeCloseTo(1, 5);
    for (const s of [...out.instances, ...f.instances]) expect(s.matrices.every(Number.isFinite)).toBe(true);
  });

  it('trees: one instance per tree point, scale in treeScale, deterministic', () => {
    const [set] = buildVegetation(fixture, ctx).instances;
    expect(set!.matrices.length / 16).toBe(5);
    for (let i = 0; i < 5; i++) {
      const s = Math.hypot(set!.matrices[16 * i]!, set!.matrices[16 * i + 2]!);
      expect(s).toBeGreaterThanOrEqual(P.treeScale[0]!);
      expect(s).toBeLessThanOrEqual(P.treeScale[1]!);
      expect(set!.matrices[16 * i + 5]).toBeCloseTo(s, 5);
    }
    expect(buildVegetation(fixture, ctx)).toEqual(buildVegetation(fixture, ctx));
  });

  it(`prop meshes stay within ${P.maxTriangles} triangles`, () => {
    for (const { geometry } of Object.values(createPropMeshes())) {
      expect(geometry.index!.count / 3).toBeLessThanOrEqual(P.maxTriangles);
      expect(geometry.getAttribute('color')).toBeDefined();
    }
  });
});
