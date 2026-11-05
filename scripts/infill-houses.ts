// Leg 3 Hà Nội: procedural nhà ống infill where OSM has no building footprints (e.g. around Hồ Ba Mẫu, Ô Đồng Lầm, Kim Hoa).
// Post-process of build-chunks (run it AFTER build-chunks / build-graph): `npx tsx scripts/infill-houses.ts [--dry]`.
// Region = corridor CORRIDOR m either side of the shortest road-graph path Vincom Phạm Ngọc Thạch → Tượng đài Bác Hồ – Bác Tôn,
// plus the Hồ Ba Mẫu box. For every street edge in the region plots (3–5 m wide, 6–14 m deep) are laid along both sides
// (front edge = kerb of the sidewalk), kept only where the 40 m cell around is < COVER built and the plot touches no OSM
// building / road / water / park / landmark / other infill (1.5 m back-yard gap). Written as ordinary BuildingRec
// {kind, levels, gen: 1} into the affected chunk JSONs (idempotent: earlier `gen` buildings are removed first).
// ponytail: plots follow the local segment tangent, no per-block face analysis; upgrade: polygonise the road graph faces.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latLonToWorld } from '@race/shared';
import { RoadGraph, type RoadGraphFile, pathPolyline, segPoint, shortestPath } from '@race/shared/graph';
import { type ChunkData, chunkKey, ringArea } from '../client/src/geo/chunkData.ts';
import { r1 } from '../client/src/geo/clip.ts';
import { roadWidth, sidewalkWidth } from '../client/src/world/RoadBuilder.ts';
import { hash01 } from '../client/src/world/geom.ts';
import { loadDistrictMask } from './district-mask.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'client/public/data');
const CORRIDOR = 120; // m each side of the path
const LAKE_BOX = { minX: -1560, maxX: -1100, minZ: 1900, maxZ: 2560 }; // Hồ Ba Mẫu + the blocks round it (screenshot area)
const START = { id: 'way/136161117 Vincom Center Phạm Ngọc Thạch' };
const MONUMENT = latLonToWorld(21.0111944, 105.8424821); // node/9907239892 "Bác Hồ - Bác Tôn" (tượng, Công viên Thống Nhất)
const COVER = 0.35, CELL = 40, BUDGET = 1500, REAR_GAP = 1.5, SIDE_GAP = 0.4;
const FRONT_KINDS = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']);
const dry = process.argv.includes('--dry');

type Pt = [number, number];
type Poly = { pts: Pt[]; box: [number, number, number, number] };
const toPoly = (r: number[]): Poly => {
  const pts: Pt[] = [];
  for (let i = 0; i < r.length; i += 2) pts.push([r[i]!, r[i + 1]!]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { pts, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
};
const inPoly = (x: number, z: number, p: Pt[]) => {
  let o = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (p[i]![1] > z !== p[j]![1] > z && x < ((p[j]![0] - p[i]![0]) * (z - p[i]![1])) / (p[j]![1] - p[i]![1]) + p[i]![0]) o = !o;
  return o;
};
const orient = (a: Pt, b: Pt, c: Pt) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const segX = (a: Pt, b: Pt, c: Pt, d: Pt) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
const polyHit = (a: Pt[], b: Pt[]) => {
  if (inPoly(a[0]![0], a[0]![1], b) || inPoly(b[0]![0], b[0]![1], a)) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segX(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
  return false;
};
const segDist = (p: Pt, a: Pt, b: Pt) => segPoint(p[0], p[1], a[0], a[1], b[0], b[1])[1];
/** Distance from the segment a–b to the convex quad q (0 when they touch). */
const segQuad = (a: Pt, b: Pt, q: Pt[]) => {
  if (inPoly(a[0], a[1], q) || inPoly(b[0], b[1], q)) return 0;
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    const c = q[i]!, e = q[(i + 1) % 4]!;
    if (segX(a, b, c, e)) return 0;
    d = Math.min(d, segDist(a, c, e), segDist(b, c, e), segDist(c, a, b));
  }
  return d;
};

// --- load chunks ---
const files = readdirSync(join(DATA, 'chunks')).filter((f) => f.endsWith('.json') && f !== 'index.json' && !/ \d\./.test(f));
const chunks = new Map<string, ChunkData>(files.map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(DATA, 'chunks', f), 'utf8')) as ChunkData]));
let removed = 0;
const touched = new Set<string>();
for (const c of chunks.values()) { const n = c.buildings.length; c.buildings = c.buildings.filter((b) => !b.gen); removed += n - c.buildings.length; if (n !== c.buildings.length) touched.add(c.key); }

// --- route ---
const g = RoadGraph.decode(JSON.parse(readFileSync(join(ROOT, 'shared/data/roadgraph.json'), 'utf8')) as RoadGraphFile);
const nearCar = (x: number, z: number) => {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.nodeCount; i++) {
    const d = Math.hypot(g.x[i]! - x, g.z[i]! - z);
    if (d >= bd || g.component[i] !== g.main) continue;
    for (let k = g.adjStart[i]!; k < g.adjStart[i + 1]!; k++) { const e = g.adjEdge[k]!; if (g.allows(e, 'car', true) || g.allows(e, 'car', false)) { best = i; bd = d; break; } }
  }
  return best;
};
let vin: Pt | undefined;
for (const c of chunks.values()) for (const b of c.buildings) if (b.landmark === 'vincom-pham-ngoc-thach') { const p = toPoly(b.outer).pts; vin = [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]; }
if (!vin) throw new Error('Vincom Phạm Ngọc Thạch outline not found');
const path = shortestPath(g, nearCar(vin[0], vin[1]), nearCar(MONUMENT.x, MONUMENT.z), 'car');
if (!path) throw new Error('no car path');
const route = pathPolyline(g, path);
console.log(`${START.id} (${vin.map(Math.round)}) → monument (${MONUMENT.x.toFixed(0)}, ${MONUMENT.z.toFixed(0)}): ${path.length.toFixed(0)} m, ${path.nodes.length} nodes`);
const inRegion = (x: number, z: number) =>
  (x >= LAKE_BOX.minX && x <= LAKE_BOX.maxX && z >= LAKE_BOX.minZ && z <= LAKE_BOX.maxZ) ||
  (() => { for (let i = 0; i + 3 < route.length; i += 2) if (segDist([x, z], [route[i]!, route[i + 1]!], [route[i + 2]!, route[i + 3]!]) <= CORRIDOR) return true; return false; })();
const mask = loadDistrictMask(join(ROOT, '.cache/osm'));

// --- obstacles (grid of 25 m cells) ---
const G = 25;
const cellKeys = (b: [number, number, number, number]) => { const o: string[] = []; for (let i = Math.floor(b[0] / G); i <= Math.floor(b[2] / G); i++) for (let j = Math.floor(b[1] / G); j <= Math.floor(b[3] / G); j++) o.push(`${i},${j}`); return o; };
const polys = new Map<string, Poly[]>(), segs = new Map<string, { a: Pt; b: Pt; buf: number }[]>();
const inflate = (b: [number, number, number, number], d: number): [number, number, number, number] => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const addPoly = (r: number[], map = polys) => { const p = toPoly(r); if (inflate(p.box, 0)[2] - p.box[0] > 3000) return; for (const k of cellKeys(p.box)) (map.get(k) ?? map.set(k, []).get(k)!).push(p); };
const bbox: [number, number, number, number] = [LAKE_BOX.minX - 300, Math.min(vin[1], LAKE_BOX.minZ) - 300, Math.max(MONUMENT.x, vin[0]) + 400, LAKE_BOX.maxZ + 300];
const overlapsBox = (b: number[]) => b[0]! < bbox[2] && b[2]! > bbox[0] && b[1]! < bbox[3] && b[3]! > bbox[1];
const cover = new Map<string, number>();
const frontRoads: { pts: Pt[]; half: number; kind: string }[] = [];
for (const c of chunks.values()) {
  for (const b of c.buildings) { const p = toPoly(b.outer); if (!overlapsBox(p.box)) continue; addPoly(b.outer); const m = p.pts[0]!; const k = `${Math.floor(m[0] / CELL)},${Math.floor(m[1] / CELL)}`; if (!b.landmark) cover.set(k, (cover.get(k) ?? 0) + Math.abs(ringArea(b.outer))); }
  for (const a of c.areas) if (a.kind === 'park' || Math.abs(ringArea(a.outer)) > 400) addPoly(a.outer);
  for (const r of c.roads) {
    const half = roadWidth(r) / 2 + sidewalkWidth(r);
    const pts: Pt[] = []; for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i]!, r.pts[i + 1]!]);
    if (!pts.some((p) => p[0] > bbox[0] && p[0] < bbox[2] && p[1] > bbox[1] && p[1] < bbox[3])) continue;
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i]!, b = pts[i + 1]!; for (const k of cellKeys([Math.min(a[0], b[0]) - 8, Math.min(a[1], b[1]) - 8, Math.max(a[0], b[0]) + 8, Math.max(a[1], b[1]) + 8])) (segs.get(k) ?? segs.set(k, []).get(k)!).push({ a, b, buf: Math.max(half - 0.05, 1.2) }); }
    if (FRONT_KINDS.has(r.kind) || (r.kind === 'service' && !/(parking|drive)/.test(r.name ?? '') && (r.width ?? 4) <= 6)) frontRoads.push({ pts, half, kind: r.kind });
  }
  for (const b of c.bridges) { const pts: Pt[] = []; for (let i = 0; i < b.pts.length; i += 2) pts.push([b.pts[i]!, b.pts[i + 1]!]); for (let i = 0; i + 1 < pts.length; i++) for (const k of cellKeys([Math.min(pts[i]![0], pts[i + 1]![0]) - 8, Math.min(pts[i]![1], pts[i + 1]![1]) - 8, Math.max(pts[i]![0], pts[i + 1]![0]) + 8, Math.max(pts[i]![1], pts[i + 1]![1]) + 8])) (segs.get(k) ?? segs.set(k, []).get(k)!).push({ a: pts[i]!, b: pts[i + 1]!, buf: 8 }); }
}
for (const w of (JSON.parse(readFileSync(join(DATA, 'water.json'), 'utf8')) as { polygons: { outer: number[] }[] }).polygons) { const p = toPoly(w.outer); if (overlapsBox(p.box)) addPoly(w.outer); }
const placed = new Map<string, Pt[][]>();

const clear = (q: Pt[], ext: Pt[], inf: Pt[]) => {
  const b: [number, number, number, number] = [Math.min(...ext.map((p) => p[0])), Math.min(...ext.map((p) => p[1])), Math.max(...ext.map((p) => p[0])), Math.max(...ext.map((p) => p[1]))];
  for (const k of cellKeys(inflate(b, 8))) {
    for (const s of segs.get(k) ?? []) if (segQuad(s.a, s.b, q) < s.buf) return false;
    for (const p of polys.get(k) ?? []) if (p.box[0] < b[2] && p.box[2] > b[0] && p.box[1] < b[3] && p.box[3] > b[1] && polyHit(ext, p.pts)) return false;
    for (const p of placed.get(k) ?? []) if (polyHit(inf, p)) return false;
  }
  return true;
};

// --- plots ---
type Plot = { quad: Pt[]; kind: string; levels: number; key: number };
const plots: Plot[] = [];
for (const r of frontRoads) {
  for (const side of [1, -1]) {
    let s = 0, lenAcc = 0;
    const total = r.pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - r.pts[i]![0], p[1] - r.pts[i]![1]), 0);
    const at = (d: number) => { let a = 0; for (let i = 0; i + 1 < r.pts.length; i++) { const A = r.pts[i]!, B = r.pts[i + 1]!, l = Math.hypot(B[0] - A[0], B[1] - A[1]); if (d <= a + l || i + 2 === r.pts.length) { const t = Math.min(1, Math.max(0, (d - a) / (l || 1))); return { x: A[0] + (B[0] - A[0]) * t, z: A[1] + (B[1] - A[1]) * t, tx: (B[0] - A[0]) / (l || 1), tz: (B[1] - A[1]) / (l || 1) }; } a += l; } return undefined; };
    void lenAcc;
    while (s < total - 2) {
      const h0 = hash01(r.pts[0]![0] + s, r.pts[0]![1] * side, 71);
      const w = 3 + 2 * h0;
      const mid = at(s + w / 2);
      if (!mid) break;
      const nx = -mid.tz * side, nz = mid.tx * side;
      const cx = mid.x + nx * (r.half + 0.1), cz = mid.z + nz * (r.half + 0.1);
      const ck = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
      if (!inRegion(cx, cz) || !mask.contains(cx, cz) || (cover.get(ck) ?? 0) / (CELL * CELL) >= COVER) { s += 6; continue; }
      let ok: Plot | undefined;
      for (const depth of [14, 12, 10, 8, 6]) {
        const d = depth * (0.85 + 0.15 * hash01(cx, cz, 72));
        const mk = (sw: number, front: number, rear: number): Pt[] => [
          [mid.x + nx * (r.half + 0.1 - front) - mid.tx * sw, mid.z + nz * (r.half + 0.1 - front) - mid.tz * sw],
          [mid.x + nx * (r.half + 0.1 - front) + mid.tx * sw, mid.z + nz * (r.half + 0.1 - front) + mid.tz * sw],
          [mid.x + nx * (r.half + 0.1 + d + rear) + mid.tx * sw, mid.z + nz * (r.half + 0.1 + d + rear) + mid.tz * sw],
          [mid.x + nx * (r.half + 0.1 + d + rear) - mid.tx * sw, mid.z + nz * (r.half + 0.1 + d + rear) - mid.tz * sw],
        ];
        const quad = mk(w / 2, 0, 0);
        if (clear(quad, mk(w / 2 + SIDE_GAP, 0, REAR_GAP), mk(w / 2 - 0.1, 0, REAR_GAP))) {
          const h = hash01(cx, cz, 73), lv = 2 + Math.floor(h * 3.99); // 2–5 floors
          const kind = r.kind !== 'residential' && h > 0.55 ? 'commercial' : lv >= 4 && hash01(cx, cz, 74) < 0.3 ? 'apartments' : 'house';
          ok = { quad, kind, levels: lv, key: hash01(cx, cz, 75) };
          break;
        }
      }
      if (ok) {
        plots.push(ok);
        const b: [number, number, number, number] = [Math.min(...ok.quad.map((p) => p[0])), Math.min(...ok.quad.map((p) => p[1])), Math.max(...ok.quad.map((p) => p[0])), Math.max(...ok.quad.map((p) => p[1]))];
        for (const k of cellKeys(b)) (placed.get(k) ?? placed.set(k, []).get(k)!).push(ok.quad);
        s += w + (hash01(cx, cz, 76) < 0.06 ? 3 : 0);
      } else s += 2;
    }
  }
}
let chosen = plots;
if (plots.length > BUDGET) chosen = [...plots].sort((a, b) => a.key - b.key).slice(0, BUDGET); // ponytail: random thinning leaves gaps, fine for a budget cap
console.log(`candidates ${plots.length}, kept ${chosen.length}, removed old gen ${removed}`);
for (const p of chosen) {
  const q = p.quad.map(([x, z]) => [r1(x), r1(z)] as Pt);
  const outer = q.flat();
  const [cx, cz] = [(q[0]![0] + q[2]![0]) / 2, (q[0]![1] + q[2]![1]) / 2];
  const c = chunks.get(chunkKey(cx, cz));
  if (!c) continue;
  c.buildings.push({ outer: ringArea(outer) > 0 ? outer : q.reverse().flat(), kind: p.kind, levels: p.levels, gen: 1 });
  touched.add(c.key);
}
if (!dry) {
  for (const k of touched) writeFileSync(join(DATA, 'chunks', `${k}.json`), JSON.stringify(chunks.get(k)));
}
console.log(`${dry ? 'dry: ' : ''}wrote ${touched.size} chunks: ${[...touched].sort().join(' ')}`);
