import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roads as C } from '../config.ts';
import { type ChunkData, chunkBounds, type RoadRec } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import { buildBridges } from './BridgeBuilder.ts';
import type { BuildCtx, BuildOut, MeshBucket } from './buildTypes.ts';
import { buildRoads, roadWidth } from './RoadBuilder.ts';

const ctx = (height: (x: number, z: number) => number = () => 0, key = '0_0'): BuildCtx => ({ key, bounds: chunkBounds(key), height });
const chunk = (roads: RoadRec[], bridges: ChunkData['bridges'] = []): ChunkData => ({ v: 1, key: '0_0', buildings: [], roads, bridges, areas: [], points: [] });
const get = (out: BuildOut, m: string) => out.meshes.find((b) => b.material === m);
const pts = (b: MeshBucket) => Array.from({ length: b.position.length / 3 }, (_, k) => [...b.position.subarray(3 * k, 3 * k + 3)] as number[]);
const road = (r: Partial<RoadRec> & { pts: number[] }): RoadRec => ({ kind: 'secondary', oneway: false, roundabout: false, junctions: [], ...r });

function expectSane(out: BuildOut) {
  for (const b of out.meshes) {
    for (const a of [b.position, b.normal, b.uv, b.color ?? new Float32Array()]) expect(a.every(Number.isFinite)).toBe(true);
    const n = b.position.length / 3;
    expect(b.index.every((i) => i < n)).toBe(true);
    expect(b.color).toBeUndefined(); // no VERTEX_COLOR material here
  }
}

describe('roadWidth', () => {
  it('name → width → lanes → kind', () => {
    expect(roadWidth({ kind: 'primary', name: 'Place Charles de Gaulle', lanes: 12, oneway: true, roundabout: true })).toBe(36);
    expect(roadWidth({ kind: 'primary', name: 'Avenue des Champs-Élysées', lanes: 4, oneway: true })).toBe(4 * C.laneWidth); // oneway half
    expect(roadWidth({ kind: 'residential', width: 8, lanes: 3 })).toBe(8);
    expect(roadWidth({ kind: 'secondary', lanes: 2 })).toBe(6.5);
    expect(roadWidth({ kind: 'service' })).toBe(C.widthByKind.service);
    expect(roadWidth({ kind: 'nonsense' })).toBe(C.defaultWidth);
  });
});

describe('buildRoads', () => {
  it('carriageway and raised sidewalks have the right widths', () => {
    const out = buildRoads(chunk([road({ pts: [0, 100, 200, 100], lanes: 2 })]), ctx());
    const zs = (m: string) => pts(get(out, m)!).map((p) => p[2]!);
    expect(Math.min(...zs('asphalt'))).toBeCloseTo(100 - 3.25);
    expect(Math.max(...zs('asphalt'))).toBeCloseTo(100 + 3.25);
    expect(Math.min(...zs('sidewalk'))).toBeCloseTo(100 - 3.25 - C.sidewalkWidth);
    expect(Math.max(...zs('sidewalk'))).toBeCloseTo(100 + 3.25 + C.sidewalkWidth);
    expect(Math.max(...pts(get(out, 'sidewalk')!).map((p) => p[1]!))).toBeCloseTo(C.lift + C.curbHeight);
    expect(pts(get(out, 'asphalt')!).every((p) => Math.abs(p[1]! - C.surfaceLift.asphalt!) < 1e-6)).toBe(true);
    expect(get(out, 'marking')).toBeDefined(); // two-way, 2 lanes → centre line
  });

  it('footways: stone ribbon, no sidewalk, no markings; sett → pave', () => {
    const out = buildRoads(chunk([road({ pts: [0, 0, 50, 0], kind: 'footway' }), road({ pts: [0, 50, 50, 50], kind: 'living_street', surface: 'sett', oneway: true })]), ctx());
    expect(out.meshes.map((b) => b.material).sort()).toEqual(['pave', 'sidewalk']);
    const walk = pts(get(out, 'sidewalk')!);
    expect(walk.every((p) => Math.abs(p[2]!) <= 1.5 + 1e-6 && Math.abs(p[1]! - C.surfaceLift.sidewalk!) < 1e-6)).toBe(true); // flat 3 m ribbon
  });

  it('pieces split at a chunk border meet exactly (before/after miters)', () => {
    const A = road({ pts: [0, 0, 100, 0], after: [200, 60] });
    const B = road({ pts: [100, 0, 200, 60], before: [0, 0] });
    const near = (out: BuildOut, m: string) =>
      new Set(pts(get(out, m)!).filter((p) => Math.hypot(p[0]! - 100, p[2]!) < 12).map((p) => p.map((v) => v.toFixed(3)).join()));
    const a = buildRoads(chunk([A]), ctx());
    const b = buildRoads(chunk([B]), ctx());
    for (const m of ['asphalt', 'sidewalk']) {
      const [sa, sb] = [near(a, m), near(b, m)];
      const shared = [...sa].filter((k) => sb.has(k));
      expect(shared.length).toBeGreaterThanOrEqual(m === 'asphalt' ? 2 : 4); // both edges (+ curb/outer tops)
    }
    // the seam gets no sidewalk end caps: nothing faces ±travel at the join
    const caps = (out: BuildOut) => {
      const nr = get(out, 'sidewalk')!.normal;
      return Array.from({ length: nr.length / 3 }, (_, k) => nr[3 * k]!).filter((x) => Math.abs(x) > 0.99).length;
    };
    expect(caps(a)).toBe(8); // only the start (no `before`): 2 sidewalks × 1 cap × 4 vertices (road runs along +x)
  });

  it('a crossing road cuts the sidewalk on its side only; markings cut near the junction', () => {
    const out = buildRoads(fixture, ctx());
    expectSane(out);
    const side = pts(get(out, 'sidewalk')!).filter((p) => Math.abs(p[1]! - C.lift - C.curbHeight) < 1e-6);
    const inSouth = side.filter((p) => p[0]! > 125 - 2 && p[0]! < 125 + 2 && p[2]! > 103 && p[2]! < 107);
    const inNorth = side.filter((p) => p[0]! > 125 - 4 && p[0]! < 125 + 4 && p[2]! < 97 && p[2]! > 93);
    expect(inSouth).toHaveLength(0); // Rue Pavée leaves the junction southward
    expect(inNorth.length).toBeGreaterThan(0); // north sidewalk continues past the T
    const marks = pts(get(out, 'marking')!).filter((p) => Math.abs(p[2]! - 100) < 1);
    expect(marks.every((p) => Math.abs(p[0]! - 125) > C.centreLine.junctionCut)).toBe(true);
  });

  it('a real dense chunk builds without NaN', () => {
    const data = JSON.parse(readFileSync(new URL('../../public/data/chunks/-8_-4.json', import.meta.url), 'utf8')) as ChunkData;
    const out = buildRoads(data, ctx((x, z) => 0.01 * x + 0.02 * z, data.key));
    expectSane(out);
    expect(out.meshes.length).toBeLessThanOrEqual(4);
    expectSane(buildBridges(data, ctx(() => 0, data.key)));
  });
});

describe('buildBridges', () => {
  // Synthetic carved river: quays at y = 0 for |x| ≥ 40, channel at −8 m between.
  const carved = (x: number) => (Math.abs(x) < 40 ? -8 : 0);
  const bridge = (layer: number, kind = 'primary') => chunk([], [{ pts: [-50, 0, 0, 0, 50, 0], kind, layer, lanes: 2 }]);

  it('the deck stays at quay level above the carved channel, with a collider', () => {
    const out = buildBridges(bridge(1), ctx((x) => carved(x)));
    expectSane(out);
    const deck = pts(get(out, 'asphalt')!);
    expect(deck.every((p) => Math.abs(p[1]! - C.surfaceLift.asphalt!) < 1e-6)).toBe(true);
    const slab = pts(get(out, 'bridge')!);
    expect(Math.min(...slab.map((p) => p[1]!))).toBeCloseTo(-C.bridge.deckThickness);
    const rail = pts(get(out, 'railing')!);
    expect(Math.max(...rail.map((p) => p[1]!))).toBeCloseTo(C.bridge.railingHeight);
    expect(out.colliders).toHaveLength(1);
    expect(out.colliders[0]!.indices.length).toBe(out.meshes.reduce((s, b) => s + b.index.length, 0));
  });

  it('layer 2 sits railLayerStep higher; interpolates between different quay heights', () => {
    const out = buildBridges(bridge(2, 'subway'), ctx((x) => (Math.abs(x) < 40 ? -8 : x > 0 ? 2 : 0)));
    const mid = pts(get(out, 'bridge')!).filter((p) => Math.abs(p[0]!) < 1).map((p) => p[1]!);
    expect(Math.max(...mid)).toBeCloseTo(1 + C.bridge.railLayerStep); // midpoint of quays 0 → 2, + one layer
    expect(Math.min(...mid)).toBeCloseTo(1 + C.bridge.railLayerStep - C.bridge.deckThickness);
    expect(get(out, 'asphalt')).toBeUndefined(); // rail deck: no road surface
  });
});
