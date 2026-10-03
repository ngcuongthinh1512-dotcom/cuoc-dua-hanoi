// Phase 8C track T2 (SPEC §17.20: the ONLY landmark upgraded): sketchfab/day_135_flame_of_liberty_-_1scanaday.glb (edemaistre,
// CC BY 4.0, 19 MB, 335k triangles, 4K texture) → client/public/models/lm-flamme.glb (≤ 1.5 MB): the scan centred on the
// column, the plaza level at y = 0, scaled so its paving disc matches the OSM outline (way/92316094, Ø ≈ 6 m: the scan comes
// out ≈ 1:1, total height ≈ 3.7 m), simplified, 2K WebP.
// Fix A (phase8c-review-visual #3): only the pedestal + flame are kept from the scan (above `cut`, within `keepRadius`, the
// loose bits < `minPart` triangles dropped) and get the whole triangle budget; the scanned steps / paving (baked shadows,
// flowers, cut debris at the disc edge) are replaced by plain granite steps from config.landmarks.g2.flamme (the same tiers
// as g2's far model and the colliders), raised by `sink` so their tops sit at the same height above the lowest ground.
// Placed by client/src/world/landmarks/models.ts (MODELS 'flamme' + g1.modelPose).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { graphics8c, landmarks } from '../../client/src/config.ts';
import type { ChunkData } from '../../client/src/geo/chunkData.ts';
import { footprintFrame } from '../../client/src/world/landmarks/kit.ts';
import { PUBLIC, type Target } from './pipeline.ts';
import { bounds, crop, move, readSoups, type Soup, writeGlb } from './props.ts';

/** Triangles of `soups` whose connected part (vertices welded at 1 mm) has ≥ `min` triangles. */
export function dropSmallParts(soups: Soup[], min: number): Soup[] {
  const id = new Map<string, number>();
  const vid = (p: number[], i: number) => {
    const k = `${Math.round(p[i]! * 1000)},${Math.round(p[i + 1]! * 1000)},${Math.round(p[i + 2]! * 1000)}`;
    if (!id.has(k)) id.set(k, id.size);
    return id.get(k)!;
  };
  const tris = soups.map((s) => Array.from({ length: s.pos.length / 9 }, (_, t) => [0, 3, 6].map((k) => vid(s.pos, 9 * t + k))));
  const par = Array.from({ length: id.size }, (_, i) => i);
  const root = (a: number): number => {
    while (par[a] !== a) a = par[a] = par[par[a]!]!;
    return a;
  };
  for (const ts of tris)
    for (const [a, b, c] of ts) {
      par[root(a!)] = root(b!);
      par[root(b!)] = root(c!);
    }
  const size = new Map<number, number>();
  for (const ts of tris) for (const [a] of ts) size.set(root(a!), (size.get(root(a!)) ?? 0) + 1);
  return soups
    .map((s, i) => {
      const o: Soup = { mat: s.mat, pos: [], nrm: [], uv: [] };
      tris[i]!.forEach(([a], t) => {
        if (size.get(root(a!))! < min) return;
        o.pos.push(...s.pos.slice(9 * t, 9 * t + 9));
        o.nrm.push(...s.nrm.slice(9 * t, 9 * t + 9));
        o.uv.push(...s.uv.slice(6 * t, 6 * t + 6));
      });
      return o;
    })
    .filter((s) => s.pos.length);
}

/** Round steps: one 48-gon drum per [radius, top] (sides from `bottom`, top cap), plain granite, +y up, centred on 0. */
export function steps(rings: [number, number][], bottom: number, color: number[]): Soup {
  const s: Soup = { mat: { color: [...color, 1], metal: 0, rough: 0.9, blend: false }, pos: [], nrm: [], uv: [] };
  const n = 48;
  const at = (r: number, k: number, y: number) => [r * Math.cos((2 * Math.PI * k) / n), y, -r * Math.sin((2 * Math.PI * k) / n)];
  const tri = (a: number[], b: number[], c: number[], nm: number[][]) => {
    s.pos.push(...a, ...b, ...c);
    s.nrm.push(...nm.flat());
    s.uv.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
  };
  for (const [r, top] of rings)
    for (let k = 0; k < n; k++) {
      // counter-clockwise seen from outside / above (angle grows toward −z = north, i.e. ccw seen from +y)
      const [a0, a1, b0, b1] = [at(r, k, bottom), at(r, k + 1, bottom), at(r, k, top), at(r, k + 1, top)];
      const [n0, n1] = [[a0[0]! / r, 0, a0[2]! / r], [a1[0]! / r, 0, a1[2]! / r]];
      tri(a0, a1, b1, [n0, n1, n1]);
      tri(a0, b1, b0, [n0, n1, n0]);
      tri([0, top, 0], b0, b1, [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    }
  return s;
}

/** sRGB hex → linear RGB (glTF base colour factor). */
const linear = (hex: string) => [0, 2, 4].map((i) => (parseInt(hex.slice(1 + i, 3 + i), 16) / 255) ** 2.2);

export const flamme: Target = async (ctx) => {
  const S = graphics8c.flamme.scan;
  const F = landmarks.g2.flamme;
  const soups = await readSoups(ctx.file('sketchfab/day_135_flame_of_liberty_-_1scanaday.glb'));
  const chunk = JSON.parse(readFileSync(join(PUBLIC, 'data/chunks', `${S.chunk}.json`), 'utf8')) as ChunkData;
  const rec = chunk.buildings.find((b) => b.landmark === 'flamme');
  if (!rec) throw new Error(`flamme: no outline in chunk ${S.chunk}`);
  const f = footprintFrame(rec.outer);
  const k = (f.a + f.b) / 2 / S.disc;
  const [cx, cz] = S.axis;
  const kept = crop(soups, (x, y, z) => y >= S.floor + S.cut && (y >= S.floor + S.flameFrom || Math.hypot(x - cx!, z - cz!) <= S.keepRadius));
  const scan = dropSmallParts(move(kept, { from: [cx!, S.floor, cz!], scale: [k, k, k] }), S.minPart);
  const b = bounds(scan);
  ctx.log(`  flamme: outline r ${((f.a + f.b) / 2).toFixed(2)} m → scale ${k.toFixed(3)}; pedestal + flame ${b.lo.map((v) => v.toFixed(2))} → ${b.hi.map((v) => v.toFixed(2))}`);
  const sink = graphics8c.flamme.sink;
  const stone = steps([F.paving, ...F.tiers].map(([r, top]) => [r, top + sink]), -0.3, linear(landmarks.g2.colours.granite));
  // two nodes: the steps are not simplified (the scan's budget is all for the pedestal + flame)
  await writeGlb('models/lm-flamme.glb', [{ name: 'flamme', soups: scan, maxTris: S.tris }, { name: 'flamme_steps', soups: [stone], maxTris: Infinity }], S.texture, ctx.log);
};
