import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, type ChunkData, chunkBounds, type LandmarkId, ringArea, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut, MeshBucket } from '../buildTypes.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { at, bakeFlood, clipHalf, details, edgesOf, facing, grow, shape, simplify, slices, waveQuads } from './m1.ts';

const M = L.m1;
const rect = (x0: number, z0: number, x1: number, z1: number): XZ => [x0, z0, x1, z0, x1, z1, x0, z1];
/** The ring with ringArea > 0 (m1 works on those). */
const pos = (r: XZ): XZ => (ringArea(r) > 0 ? r : Array.from({ length: r.length / 2 }, (_, i) => [r[r.length - 2 - 2 * i]!, r[r.length - 1 - 2 * i]!]).flat());

// the real Macao records (committed chunk data): one ctx per record on a gentle slope
const chunks = join(import.meta.dirname, '../../../public/data/chunks');
const IDS: LandmarkId[] = ['leal-senado', 'largo-senado', 'santa-casa', 'teatro-dom-pedro', 'quartel-mouros', 'casa-mandarim', 'sao-domingos', 'se-catedral'];
const recs: { key: string; rec: BuildingRec }[] = [];
for (const key of ['0_0', '0_-1', '-1_0', '-3_2']) {
  const d = JSON.parse(readFileSync(join(chunks, `${key}.json`), 'utf8')) as ChunkData;
  for (const rec of d.buildings) if (rec.landmark && IDS.includes(rec.landmark)) recs.push({ key, rec });
}
const slope = (x: number, z: number) => 2 + 0.03 * x - 0.02 * z;
function ctxOf(key: string, rec: BuildingRec): LandmarkCtx {
  const ys = rec.outer.filter((_, i) => i % 2 === 0).map((x, i) => slope(x, rec.outer[2 * i + 1]!));
  return { key, bounds: chunkBounds(key), height: slope, def: LANDMARK_BY_ID.get(rec.landmark!)!, ground: Math.max(Math.min(...ys), Math.max(...ys) - 3), minGround: Math.min(...ys) };
}
function stats(o: BuildOut) {
  let [tris, nan] = [0, 0];
  const box = { x0: Infinity, x1: -Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const m of o.meshes) {
    tris += m.index.length / 3;
    for (let i = 0; i < m.position.length; i += 3) {
      const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
      if (!Number.isFinite(x + y + z) || !Number.isFinite(m.normal[i]! + m.normal[i + 1]! + m.normal[i + 2]!)) nan++;
      [box.x0, box.x1, box.y1, box.z0, box.z1] = [Math.min(box.x0, x), Math.max(box.x1, x), Math.max(box.y1, y), Math.min(box.z0, z), Math.max(box.z1, z)];
    }
    if (m.color) for (const c of m.color) if (!Number.isFinite(c) || c < 0) nan++;
  }
  return { tris, nan, box };
}

describe('m1 geometry helpers', () => {
  it('simplify drops a 0.5 m jog, keeps real corners', () => {
    const jog = [0, 0, 10, 0, 10.5, 0.4, 20, 0.5, 20, 10, 0, 10];
    expect(simplify(jog, 1).length / 2).toBe(4);
    expect(simplify(rect(0, 0, 10, 10), 1)).toEqual(rect(0, 0, 10, 10));
  });
  it('edges: outward normal (−uz, ux) points away from a ringArea > 0 ring; facing picks by azimuth', () => {
    const r = pos(rect(0, 0, 20, 10));
    expect(ringArea(r)).toBeGreaterThan(0);
    const es = edgesOf(r);
    for (const e of es) {
      const [x, z] = at(e, e.len / 2, 1);
      expect(x < 0 || x > 20 || z < 0 || z > 10).toBe(true);
    }
    const north = facing(es, 0); // north = −z: the z = 0 edge
    expect(at(north, north.len / 2, 0)[1]).toBeCloseTo(0, 6);
    const east = facing(es, 90);
    expect(at(east, east.len / 2, 0)[0]).toBeCloseTo(20, 6);
  });
  it('grow offsets out (d > 0) and in (d < 0)', () => {
    const r = pos(rect(0, 0, 10, 10));
    expect(Math.max(...grow(r, 1))).toBeCloseTo(11, 6);
    expect(Math.max(...grow(r, -1))).toBeCloseTo(9, 6);
  });
  it('opening shapes start at the sill corners and stay within w × h', () => {
    for (const k of ['rect', 'arch', 'pointed', 'round'] as const) {
      const p = shape(k, 2, 4);
      const xs = p.filter((_, i) => i % 2 === 0);
      const ys = p.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(Math.max(...xs)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.max(...ys)).toBeCloseTo(k === 'round' ? 3 : 4, 1);
      if (k !== 'round') expect(p.slice(0, 4)).toEqual([-1, 0, 1, 0]);
    }
  });
  it('clipHalf + slices cut the outline into consecutive pieces of the given shares', () => {
    const r = pos(rect(0, 0, 100, 20));
    expect(Math.abs(ringArea(clipHalf(r, 1, 0, 30, 1)))).toBeCloseTo(70 * 20, 6);
    const s = slices(r, [1, 1, 2]);
    expect(s.map((p) => Math.abs(ringArea(p.piece!)))).toEqual([500, 500, 1000].map((a) => expect.closeTo(a, 6)));
    expect(s.map((p) => p.hall)).toEqual([true, false, true]);
  });
  it('waveQuads stay inside the square and follow the configured period', () => {
    const r = pos(rect(0, 0, 60, 18));
    const q = waveQuads(r, M.largo);
    expect(q.length).toBeGreaterThan(100);
    for (const quad of q) for (const [x, z] of quad) expect(x >= 0 && x <= 60 && z >= 0 && z <= 18).toBe(true);
  });
  it('bakeFlood: walls brighter than roofs, unlit neon, non-coloured buckets untouched', () => {
    const m: MeshBucket = { material: 'masonry', position: new Float32Array([0, 0, 0, 0, 0, 0]), normal: new Float32Array([1, 0, 0, 0, 1, 0]), uv: new Float32Array(4), color: new Float32Array([1, 1, 1, 1, 1, 1]), index: new Uint32Array() };
    const b = bakeFlood(m, 0, 10);
    expect(b.material).toBe('neon');
    expect(b.color![0]!).toBeGreaterThan(b.color![3]!);
    const bronze: MeshBucket = { material: 'bronze', position: new Float32Array(3), normal: new Float32Array(3), uv: new Float32Array(2), index: new Uint32Array() };
    expect(bakeFlood(bronze, 0, 10)).toBe(bronze);
  });
});

describe('m1 details on the real outlines', () => {
  it('covers all 8 ids and every record', () => {
    expect(Object.keys(details).sort()).toEqual([...IDS].sort());
    expect(new Set(recs.map((r) => r.rec.landmark)).size).toBe(8);
  });
  for (const { key, rec } of recs) {
    it(`${rec.landmark} (${rec.kind}): finite, ≤ 15k triangles, near its outline, colliders`, () => {
      const ctx = ctxOf(key, rec);
      const out = details[rec.landmark!]!(rec, rec.parts ?? [], ctx, helpers);
      const s = stats(out);
      expect(s.nan).toBe(0);
      expect(s.tris).toBeGreaterThan(50);
      expect(s.tris).toBeLessThanOrEqual(15_000);
      const xs = rec.outer.filter((_, i) => i % 2 === 0);
      const zs = rec.outer.filter((_, i) => i % 2 === 1);
      const m = rec.landmark === 'se-catedral' ? 25 : 8; // stairs, portico, cornices; the Largo da Sé fountain (zone point) ≈ 19 m out
      expect(s.box.x0).toBeGreaterThan(Math.min(...xs) - m);
      expect(s.box.x1).toBeLessThan(Math.max(...xs) + m);
      expect(s.box.z0).toBeGreaterThan(Math.min(...zs) - m);
      expect(s.box.z1).toBeLessThan(Math.max(...zs) + m);
      expect(s.box.y1 - ctx.ground).toBeLessThan(40);
      if (rec.landmark !== 'largo-senado') expect(out.colliders.length).toBeGreaterThan(0);
      for (const c of out.colliders) expect([...c.vertices].every(Number.isFinite)).toBe(true);
    });
  }
  it('Leal Senado reaches its OSM height (16.8 m) at the pediment; the façade faces the square (NE)', () => {
    const { key, rec } = recs.find((r) => r.rec.landmark === 'leal-senado')!;
    const ctx = ctxOf(key, rec);
    const s = stats(details['leal-senado']!(rec, [], ctx, helpers));
    const ring = simplify(pos(rec.outer), M.leal.simplify);
    const front = facing(edgesOf(ring), M.leal.az);
    expect(front.len).toBeGreaterThan(35); // the 3 OSM pieces of the front merge into one ≈ 45 m edge
    const base = Math.min(...[0.3, front.len / 2, front.len - 0.3].map((sx) => slope(...at(front, sx, 0.6))));
    expect(s.box.y1 - base).toBeCloseTo(M.leal.height + 0.45, 0);
  });
  it('the largo fountain stands inside the square', () => {
    const { key, rec } = recs.find((r) => r.rec.landmark === 'largo-senado')!;
    const out = details['largo-senado']!(rec, [], ctxOf(key, rec), helpers);
    expect(out.meshes.some((m) => m.material === 'bronze')).toBe(true); // the armillary sphere
    expect(out.colliders.length).toBe(1); // the basin
  });
});
