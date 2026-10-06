import { describe, expect, it } from 'vitest';
import { lighting as LT, props as P } from '../config.ts';
import { type ChunkData, chunkBounds, type RoadRec } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import type { BuildCtx } from './buildTypes.ts';
import { buildStreetProps, createPropMeshes, findJunctions, inBuilding, placeBenches, placeBouquinistes, placeAviation, placeLamps, placeLanterns, placeShelters, placeShopSigns, placeSigns, propColliders, signCell, splitName } from './StreetProps.ts';
import { roadWidth } from './RoadBuilder.ts';
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
    const d = signCell('Rue Royale', 4, measure); // Leg 2: the plaque line is the freguesia name (Paris: '8e Arrt')
    expect(d.h).toBe(P.signs.cellH + P.signs.districtLine);
    expect(d.lines[0]).toMatchObject({ text: 'Sé' });
    expect(d.lines[0]!.size).toBeLessThan(d.lines[2]!.size);
    expect(d.lines.slice(1).map((l) => l.y)).toEqual(old.lines.map((l) => l.y + P.signs.districtLine)); // shifted down
    expect(d.lines[2]!.y + d.lines[2]!.size / 2).toBeLessThan(d.h - 7.5); // name inside the inner frame line
    expect(signCell('Rue de Rivoli', 1, measure).lines[0]!.text).toBe('Nossa Senhora de Fátima');
    expect(signCell('Avenue des Champs-Élysées', 1, measure).w).toBeLessThanOrEqual(P.signs.cellW);
    expect(signCell('Rue Royale', 8, measure)).toEqual(old); // no such freguesia: no district line
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

  it(`procedural prop meshes stay within ${P.maxTriangles} triangles; the plane tree's levels within their budgets`, () => {
    const props = createPropMeshes();
    for (const [kind, prop] of Object.entries(props)) {
      if ('lods' in prop) continue;
      expect(prop.geometry.index!.count / 3).toBeLessThanOrEqual(P.maxTriangles);
      if (kind !== 'metroMask') expect(prop.geometry.getAttribute('color')).toBeDefined(); // the lid writes depth only
    }
    const tree = props.tree;
    if (!('lods' in tree)) return; // graphics8c.trees off: the Phase 7 tree above
    const tris = tree.lods.levels.map((l) => l.parts[0]!.geometry.index!.count / 3);
    expect(tris[0]).toBeLessThanOrEqual(700); // full crown (cards double-sided)
    expect(tris[1]).toBeLessThanOrEqual(150);
    expect(tris[2]).toBeLessThanOrEqual(12); // impostor
    expect(tree.lods.levels.at(-1)!.distance).toBe(Infinity);
  });

  it('8C street furniture: benches / cafés / shelters / bouquinistes off the carriageway and out of buildings', () => {
    // the fixture: a 20 m wide primary road along z = 100 with a building block north of it
    const road = { pts: [0, 100, 250, 100], kind: 'primary', name: 'Quai Voltaire', oneway: false, roundabout: false, junctions: [] };
    const house = { outer: [0, 80, 250, 80, 250, 60, 0, 60], kind: 'yes' };
    const chunk = { ...fixture, roads: [road], buildings: [house], points: [{ kind: 'bus_shelter' as const, x: 120, z: 112 }], bridges: [], junctions: [] };
    const hw = roadWidth(road) / 2;
    const benches = placeBenches(chunk, []);
    expect(benches.length).toBeGreaterThan(2);
    for (const b of benches) {
      expect(Math.abs(b.z - 100)).toBeCloseTo(hw + P.place8c.benchCurb, 5);
      expect(inBuilding(chunk, b.x, b.z)).toBe(false);
      expect(Math.cos(b.yaw) * Math.sign(b.z - 100)).toBeCloseTo(-1, 5); // front (+Z) to the road
    }
    const [shelter] = placeShelters(chunk);
    expect(shelter!.z).toBeCloseTo(100 + hw + P.place8c.shelterCurb, 5); // the stop's side (south of the road)
    expect(Math.cos(shelter!.yaw)).toBeCloseTo(-1, 5); // open side north, to the road
    // a quay: the ground drops 7 m to the river 4 m beyond the south curb → stalls on that side, front to the road
    const quay = (_x: number, z: number) => (z > 100 + hw + 4 ? -7 : 0);
    const stalls = placeBouquinistes(chunk, { ...ctx, height: quay });
    expect(stalls.length).toBeGreaterThan(10);
    for (const s of stalls) {
      expect(s.z).toBeGreaterThan(100 + hw);
      expect(s.z).toBeLessThan(100 + hw + 4.5);
      expect(Math.cos(s.yaw)).toBeCloseTo(-1, 5);
    }
    expect(placeBouquinistes({ ...chunk, roads: [{ ...road, name: 'Rue X' }] }, { ...ctx, height: quay })).toEqual([]);
  });
});

describe('Leg 2 night props (lanterns, shop signs, aviation lights)', () => {
  const pos = (m: number[]) => Array.from({ length: m.length / 16 }, (_, i) => [m[16 * i + 12]!, m[16 * i + 13]!, m[16 * i + 14]!] as const);
  it('lanterns only inside the zones, over the street, sagging under lanterns.height', () => {
    const [zx, zz] = LT.lanterns.zones[0]!;
    const road = { pts: [zx - 200, zz, zx + 200, zz], kind: 'residential', oneway: false, roundabout: false, junctions: [] };
    const l = pos(placeLanterns({ ...chunk([road]) }, () => 2));
    expect(l.length).toBeGreaterThan(0);
    for (const [x, y, z] of l) {
      expect(LT.lanterns.zones.some(([a, b, r]) => Math.hypot(x - a, zz - b) < r)).toBe(true);
      expect(Math.abs(z - zz)).toBeLessThanOrEqual(LT.lanterns.maxSpan / 2);
      expect(y).toBeLessThanOrEqual(2 + LT.lanterns.height);
      expect(y).toBeGreaterThanOrEqual(2 + LT.lanterns.height - LT.lanterns.sag);
    }
  });
  it('shop signs on the street face of a tall building, outside it; aviation lights on its roof', () => {
    const road = { pts: [0, 88, 250, 88], kind: 'residential', oneway: false, roundabout: false, junctions: [] };
    const tower = { outer: [0, 60, 250, 60, 250, 80, 0, 80], kind: 'yes', height: 120 }; // street side z = 80
    const c = { ...chunk([road]), buildings: [tower] };
    const signs = pos(placeShopSigns(c, () => 0));
    expect(signs.length).toBeGreaterThan(0);
    for (const [, y, z] of signs) {
      expect(z).toBeGreaterThan(80); // in front of the facade, toward the street
      expect(z).toBeLessThan(82);
      expect(y).toBeGreaterThan(LT.neon.y);
    }
    const air = pos(placeAviation(c, () => 0));
    expect(air.length).toBe(LT.aviation.corners);
    for (const [, y] of air) expect(y).toBeCloseTo(120 + LT.aviation.size / 2, 5);
    expect(placeAviation({ ...c, buildings: [{ ...tower, height: 40 }] }, () => 0)).toEqual([]);
  });
});
