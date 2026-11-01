import { describe, expect, it } from 'vitest';
import { buildings as B } from '../config.ts';
import { chunkBounds, type ChunkData, ringArea } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import { buildBuildings, buildingHeight, insetRing } from './BuildingBuilder.ts';
import type { BuildCtx, MeshBucket } from './buildTypes.ts';

const ctx: BuildCtx = { key: '0_0', bounds: chunkBounds('0_0'), height: (x) => x * 0.01 };
const build = (c: ChunkData = fixture) => buildBuildings(c, ctx);
const bucket = (out: ReturnType<typeof build>, m: string) => out.meshes.find((b) => b.material === m) as MeshBucket;

// Leg 2 (Macao): config buildings.haussmannHeight = [0, 0] switches the Haussmann style off (windowed boxes, flat roofs: only the
// wall + roof buckets). The style code stays for Leg 1, so this file builds the fixture with the Paris range [12, 35] and has one
// test for the Macao setting.
const MACAO_STYLE = [...B.haussmannHeight];
B.haussmannHeight = [12, 35];

describe('BuildingBuilder', () => {
  const out = build();

  it('Leg 2 setting (haussmannHeight [0, 0]): Macao styles, no balconies, a per-building lit flag on window buckets only', () => {
    B.haussmannHeight = MACAO_STYLE;
    try {
      const macao = build();
      const mats = macao.meshes.map((b) => b.material);
      expect(mats).not.toContain('balcony');
      expect(mats).toContain('roof');
      expect(macao.colliders).toHaveLength(1);
      for (const b of macao.meshes) {
        expect(b.lit !== undefined).toBe(['wall', 'tenement', 'curtain', 'shopfront'].includes(b.material));
        if (b.lit) expect(b.lit.length).toBe(b.position.length / 3);
      }
      // style by height: a 60 m block is a tower (curtain or tenement grid), a 6 m block colonial (wall), each one facade bucket
      const sq = (x: number, h: number) => ({ outer: [x, 20, x + 20, 20, x + 20, 0, x, 0], kind: 'yes', height: h });
      // (the wall bucket also carries every flat roof cap, so a tower has it next to its own facade bucket)
      const faceOf = (h: number) => build({ ...fixture, buildings: [sq(0, h)] }).meshes.map((b) => b.material).filter((m) => m !== 'roof' && m !== 'shopfront');
      expect(faceOf(6)).toEqual(['wall']);
      expect(['tenement', 'curtain']).toContain(faceOf(60).find((m) => m !== 'wall'));
      // lit: constant per building, ≈ litShare of many buildings lit
      const many = build({ ...fixture, buildings: Array.from({ length: 400 }, (_, i) => sq(i * 30, 6)) });
      const lit = bucket(many, 'wall').lit!;
      const perBuilding = new Map<number, Set<number>>();
      const pos = bucket(many, 'wall').position;
      for (let i = 0; i < lit.length; i++) {
        const k = Math.floor((pos[3 * i]! + 5) / 30);
        perBuilding.set(k, (perBuilding.get(k) ?? new Set()).add(lit[i]!));
      }
      expect([...perBuilding.values()].every((s) => s.size === 1)).toBe(true);
      const share = [...perBuilding.values()].filter((s) => [...s][0]! > 0).length / perBuilding.size;
      expect(Math.abs(share - B.macao.litShare)).toBeLessThan(0.08);
    } finally {
      B.haussmannHeight = [12, 35];
    }
  });

  it('emits the 4 buckets with the vertex-colour rule, and one collider', () => {
    expect(out.meshes.map((b) => b.material).sort()).toEqual(['balcony', 'roof', 'shopfront', 'wall']);
    for (const b of out.meshes) expect(b.color !== undefined).toBe(b.material !== 'balcony');
    expect(out.colliders).toHaveLength(1);
    expect(out.colliders[0]!.indices.length % 3).toBe(0);
  });

  it('has no NaN anywhere', () => {
    for (const b of out.meshes) {
      for (const a of [b.position, b.normal, b.uv, b.color ?? new Float32Array()]) expect(a.every(Number.isFinite)).toBe(true);
    }
    expect(out.colliders[0]!.vertices.every(Number.isFinite)).toBe(true);
  });

  it('outer walls face out, courtyard walls face into the courtyard', () => {
    const w = bucket(out, 'wall');
    let inward = 0;
    let outward = 0;
    for (let i = 0; i < w.position.length; i += 3) {
      const [x, y, z] = [w.position[i]!, w.position[i + 1]!, w.position[i + 2]!];
      const [nx, nz] = [w.normal[i]!, w.normal[i + 2]!];
      if (y > 14 || x < 10 || x > 50 || z < 10 || z > 50) continue; // courtyard block, below the mansard
      const dot = nx * (30 - x) + nz * (30 - z); // toward the courtyard centre
      if (x > 24 && x < 36 && z > 24 && z < 36) {
        expect(dot).toBeGreaterThan(0);
        inward++;
      } else if (Math.abs(nx) + Math.abs(nz) > 0.5) {
        expect(dot).toBeLessThan(0);
        outward++;
      }
    }
    expect(inward).toBeGreaterThan(0);
    expect(outward).toBeGreaterThan(0);
  });

  it('balcony slabs face up', () => {
    const b = bucket(out, 'balcony');
    const ys = [...b.normal].filter((_, i) => i % 3 === 1);
    expect(ys.some((y) => y > 0.99)).toBe(true);
    expect(ys.every((y) => y > 0.99 || Math.abs(y) < 1e-6)).toBe(true);
  });

  it('insets a square: smaller, same orientation, clamped to half the shortest edge', () => {
    const sq = fixture.buildings[0]!.outer;
    const q = insetRing(sq, [1.2, 1.2, 1.2, 1.2]);
    expect(ringArea(q)).toBeGreaterThan(0);
    expect(ringArea(q)).toBeCloseTo((40 - 2.4) ** 2, 3);
    const deep = ringArea(insetRing(sq, [30, 30, 30, 30])); // clamped to half the 40 m edge along the miter: never flips
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeCloseTo((40 - 40 / Math.SQRT2) ** 2, 3);
    const hole = fixture.buildings[0]!.holes![0]!; // CW: inset grows it into the solid
    expect(-ringArea(insetRing(hole, [1, 1, 1, 1]))).toBeCloseTo(12 * 12, 3);
    const one = insetRing(sq, [1.2, 0, 0, 0]); // only the first edge moves
    expect(Math.abs(ringArea(one))).toBeCloseTo(40 * 38.8, 3);
  });

  it('height fallback chain: height → levels × 3.2 → canopy / default', () => {
    expect(buildingHeight({ outer: [], kind: 'yes', height: 24, levels: 2 })).toBe(24);
    expect(buildingHeight({ outer: [], kind: 'yes', levels: 6 })).toBeCloseTo(6 * B.levelHeight);
    expect(buildingHeight(fixture.buildings[2]!)).toBe(B.defaultHeight);
    expect(buildingHeight({ outer: [], kind: 'roof' })).toBe(B.canopyHeight);
    expect(buildingHeight({ outer: [0, 5, 5, 5, 5, 0, 0, 0], kind: 'yes' })).toBe(B.smallHeight); // 25 m² kiosk
    const top = Math.max(...bucket(out, 'roof').position.filter((_, i) => i % 3 === 1));
    expect(top).toBeCloseTo(0.1 + 24, 1); // tallest fixture block: ground = min terrain (x = 10 → 0.1) + height
  });

  it('skips degenerate rings without throwing, keeps the rest', () => {
    const c: ChunkData = {
      ...fixture,
      buildings: [
        { outer: [0, 0, 1, 0], kind: 'yes' },
        { outer: [5, 5, 5, 5, 5, 5], kind: 'yes' },
        { outer: [0, 0, 10, 0, 20, 0], kind: 'yes' }, // collinear
        { outer: [0, 0, NaN, 3, 4, 4], kind: 'yes' },
        fixture.buildings[2]!,
      ],
    };
    const o = build(c);
    expect(bucket(o, 'wall').index.length).toBeGreaterThan(0);
  });

  it('skips landmark recs', () => {
    const o = build({ ...fixture, buildings: fixture.buildings.filter((b) => b.landmark) });
    expect(o.meshes).toHaveLength(0);
    expect(o.colliders).toHaveLength(0);
  });

  it('builds only the part of a party wall above the neighbour', () => {
    const a = { outer: [0, 10, 10, 10, 10, 0, 0, 0], kind: 'yes', height: 20 };
    const b = { outer: [10, 10, 20, 10, 20, 0, 10, 0], kind: 'yes', height: 30 };
    const w = bucket(build({ ...fixture, buildings: [a, b] }), 'wall');
    let lowest = Infinity;
    for (let i = 0; i < w.position.length; i += 3) if (Math.abs(w.position[i]! - 10) < 1e-4 && Math.abs(w.normal[i]!) > 0.9) lowest = Math.min(lowest, w.position[i + 1]!);
    expect(lowest).toBeGreaterThan(19); // b's wall on x = 10 starts at a's top (20 m); only chimneys sit lower (top − 0.3)
  });
});
