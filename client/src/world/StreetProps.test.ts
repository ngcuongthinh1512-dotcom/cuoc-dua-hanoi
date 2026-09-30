import { describe, expect, it } from 'vitest';
import { props as P } from '../config.ts';
import { type ChunkData, chunkBounds, type RoadRec } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import type { BuildCtx } from './buildTypes.ts';
import { buildStreetProps, createPropMeshes, findJunctions, placeLamps, placeSigns, propColliders, signCell, splitName } from './StreetProps.ts';
import { buildVegetation } from './Vegetation.ts';

const ctx: BuildCtx = { key: '0_0', bounds: chunkBounds('0_0'), height: () => 0 };
const chunk = (roads: RoadRec[]): ChunkData => ({ v: 2, key: '0_0', buildings: [], roads, bridges: [], areas: [], points: [] });

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

  it('plaque cell: district line on top makes the cell taller, smaller than the name; none → the old layout', () => {
    const measure = (text: string, px: number) => text.length * px * 0.55; // stand-in for canvas measureText
    const old = signCell('Rue Royale', 0, measure);
    expect(old).toEqual({ lines: [{ text: 'RUE', size: 13, y: 19 }, { text: 'ROYALE', size: 26, y: 41 }], w: 110, h: P.signs.cellH });
    expect(signCell('Pyramides', 0, measure).lines).toEqual([{ text: 'PYRAMIDES', size: 26, y: 33 }]);
    const d = signCell('Rue Royale', 8, measure);
    expect(d.h).toBe(P.signs.cellH + P.signs.districtLine);
    expect(d.lines[0]).toMatchObject({ text: '8e Arrt' });
    expect(d.lines[0]!.size).toBeLessThan(d.lines[2]!.size);
    expect(d.lines.slice(1).map((l) => l.y)).toEqual(old.lines.map((l) => l.y + P.signs.districtLine)); // shifted down
    expect(d.lines[2]!.y + d.lines[2]!.size / 2).toBeLessThan(d.h - 7.5); // name inside the inner frame line
    expect(signCell('Rue de Rivoli', 1, measure).lines[0]!.text).toBe('1er Arrt');
    expect(signCell('Avenue des Champs-Élysées', 8, measure).w).toBeLessThanOrEqual(P.signs.cellW);
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

  it('prop colliders: a hexagonal prism per lamp / Morris column, a box per metro entrance, in the chunk trimesh', () => {
    const out = buildStreetProps(fixture, ctx);
    const n = (k: string) => (out.instances.find((s) => s.kind === k)?.matrices.length ?? 0) / 16;
    const [col] = out.colliders;
    expect(n('lamp') + n('metro')).toBeGreaterThan(0);
    // lamp / Morris: 6 sides × 2 + 4 cap triangles, 12 vertices; metro: 4 × 2 + 2, 8 vertices
    expect(col!.indices.length / 3).toBe(16 * (n('lamp') + n('morris')) + 10 * n('metro'));
    expect(col!.vertices.length / 3).toBe(12 * (n('lamp') + n('morris')) + 8 * n('metro'));
    expect(col!.vertices.every(Number.isFinite)).toBe(true);
    // One metro entrance at (100, 95) facing +Z: its box spans x ± halfWidth, z from 95 − length to 95 + front.
    const m = propColliders([{ kind: 'metro', matrices: out.instances.find((s) => s.kind === 'metro')!.matrices }]);
    const xs = m.vertices.filter((_, i) => i % 3 === 0);
    const zs = m.vertices.filter((_, i) => i % 3 === 2);
    const C = P.colliders.metro;
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([expect.closeTo(100 - C.halfWidth, 4), expect.closeTo(100 + C.halfWidth, 4)]);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([expect.closeTo(95 - C.length, 4), expect.closeTo(95 + C.front, 4)]);
    expect(Math.max(...m.vertices.filter((_, i) => i % 3 === 1))).toBeCloseTo(C.height, 4);
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
    for (const [kind, { geometry }] of Object.entries(createPropMeshes())) {
      expect(geometry.index!.count / 3).toBeLessThanOrEqual(P.maxTriangles);
      if (kind !== 'metroMask') expect(geometry.getAttribute('color')).toBeDefined(); // the lid writes depth only
    }
  });
});
