// Leg 2 landmark audit (dev tool, like ride-check.ts): builds every landmark record of the real chunk data and lists, per
// landmark, what looks wrong in PLAN before anyone looks at a screenshot:
//   spill      vertices of the landmark's meshes (≥ 2.5 m above the terrain) that are OUTSIDE all of its own outlines by > 1.5 m
//              (an axis-aligned ellipse fitted by eye spilled 10 m over the houses of the Wharf)
//   intrusion  vertices INSIDE another building's footprint and below that building's roof (the two volumes interpenetrate);
//              the neighbour is any other OSM building (not another record of the same landmark, not an artwork / roof / bridge)
//   floating   outline corners whose lowest mesh vertex within 2.5 m is > 1 m above the terrain (a gap under a wall)
//   heavy      triangles / meshes per landmark (perf)
// Overhangs (crowns, signs, neon strips) show as small spill: judge by the numbers, then look. `npm run landmark-audit`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BuildingRec, type ChunkData, type ChunkIndex, chunkBounds, type WaterData } from '../client/src/geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../client/src/geo/heightGrid.ts';
import { buildingHeight } from '../client/src/world/BuildingBuilder.ts';
import { buildLandmarks } from '../client/src/world/landmarks/index.ts';
import { carveRiver } from '../client/src/world/Terrain.ts';

const data = join(import.meta.dirname, '../client/public/data');
const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
const h = (x: number, z: number) => heightAt(grid, x, z);
const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
const chunks = index.keys.map((k) => JSON.parse(readFileSync(join(data, `chunks/${k}.json`), 'utf8')) as ChunkData);

type XZ = number[];
const inRing = (x: number, z: number, p: XZ) => {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if (p[i + 1]! > z !== p[j + 1]! > z && x < ((p[j]! - p[i]!) * (z - p[i + 1]!)) / (p[j + 1]! - p[i + 1]!) + p[i]!) inside = !inside;
  }
  return inside;
};
const edgeDist = (x: number, z: number, p: XZ) => {
  let d = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const [ax, az, bx, bz] = [p[j]!, p[j + 1]!, p[i]!, p[i + 1]!];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
  }
  return d;
};
const inBuilding = (x: number, z: number, b: BuildingRec) => inRing(x, z, b.outer) && !(b.holes ?? []).some((hole) => inRing(x, z, hole as XZ));

// every building, in a 40 m cell hash of bounding boxes
interface Item { rec: BuildingRec; key: string; x0: number; x1: number; z0: number; z1: number; top: number }
const CELL = 40;
const cells = new Map<string, Item[]>();
const all: Item[] = [];
for (const c of chunks) {
  for (const rec of c.buildings) {
    const xs = rec.outer.filter((_, i) => i % 2 === 0), zs = rec.outer.filter((_, i) => i % 2 === 1);
    const it: Item = { rec, key: c.key, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), top: rec.height ?? buildingHeight(rec) };
    all.push(it);
    for (let i = Math.floor(it.x0 / CELL); i <= Math.floor(it.x1 / CELL); i++) for (let j = Math.floor(it.z0 / CELL); j <= Math.floor(it.z1 / CELL); j++) (cells.get(`${i}_${j}`) ?? cells.set(`${i}_${j}`, []).get(`${i}_${j}`)!).push(it);
  }
}
const near = (x: number, z: number) => cells.get(`${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`) ?? [];

interface Row { id: string; key: string; kind: string; spillMax: number; spillN: number; spillAbove3: number; intrudeMax: number; intrudeN: number; intrudeWith: string; floatMax: number; tris: number; meshes: number; verts: number }
const rows: Row[] = [];
for (const it of all) {
  const rec = it.rec;
  if (!rec.landmark) continue;
  const c = chunks.find((q) => q.key === it.key)!;
  const out = buildLandmarks({ ...c, buildings: [rec] }, { key: c.key, bounds: chunkBounds(c.key), height: h, district: () => 0 });
  const mates = all.filter((q) => q.rec.landmark === rec.landmark);
  const own: XZ[] = mates.flatMap((q) => [q.rec.outer, ...(q.rec.parts ?? []).map((p) => (p as { outer: XZ }).outer).filter(Boolean)]);
  let [spillMax, spillN, spillAbove3, intrudeMax, intrudeN, intrudeWith, verts, tris] = [0, 0, 0, 0, 0, '', 0, 0];
  let lowest: { x: number; z: number; y: number }[] = [];
  const corners: XZ = rec.outer;
  const lowAt: number[] = new Array(corners.length / 2).fill(Infinity);
  for (const m of out.meshes) {
    tris += m.index.length / 3;
    for (let i = 0; i < m.position.length; i += 3) {
      const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
      verts++;
      for (let k = 0; k < lowAt.length; k++) if (Math.hypot(x - corners[2 * k]!, z - corners[2 * k + 1]!) < 2.5) lowAt[k] = Math.min(lowAt[k]!, y);
      const g = h(x, z);
      if (y < g + 2.5) continue;
      const inOwn = own.some((p) => inRing(x, z, p));
      if (!inOwn) {
        const d = Math.min(...own.map((p) => edgeDist(x, z, p)));
        if (d > 1.5) { spillN++; spillMax = Math.max(spillMax, d); if (d > 3) spillAbove3++; }
      }
      for (const nb of near(x, z)) {
        if (nb.rec === rec || nb.rec.landmark === rec.landmark || ['artwork', 'bridge', 'fountain', 'roof'].includes(String(nb.rec.kind)) || x < nb.x0 || x > nb.x1 || z < nb.z0 || z > nb.z1) continue;
        if (!inBuilding(x, z, nb.rec) || inOwn && inBuilding(x, z, rec)) continue; // overlapping DATA is not the builder's doing
        if (y > h(x, z) + nb.top) continue; // above its roof: overhang, fine
        const depth = edgeDist(x, z, nb.rec.outer);
        if (depth > 0.8) { intrudeN++; if (depth > intrudeMax) [intrudeMax, intrudeWith] = [depth, `${nb.rec.landmark ?? nb.rec.kind} h${nb.top.toFixed(0)} @${Math.round((nb.x0 + nb.x1) / 2)},${Math.round((nb.z0 + nb.z1) / 2)}`]; }
      }
    }
  }
  void lowest;
  let floatMax = 0;
  for (let k = 0; k < lowAt.length; k++) if (Number.isFinite(lowAt[k]!)) floatMax = Math.max(floatMax, lowAt[k]! - h(corners[2 * k]!, corners[2 * k + 1]!));
  rows.push({ id: rec.landmark, key: it.key, kind: String(rec.kind), spillMax, spillN, spillAbove3, intrudeMax, intrudeN, intrudeWith, floatMax, tris, meshes: out.meshes.length, verts });
}
const f = (v: number) => (v ? v.toFixed(1) : '-').padStart(6);
console.log('landmark                       kind        spill(max n >3m)    intrude(max n  with)                          float  tris');
for (const r of rows.sort((a, b) => b.intrudeMax * 3 + b.spillMax - (a.intrudeMax * 3 + a.spillMax))) {
  console.log(`${r.id.padEnd(30)} ${r.kind.padEnd(11)} ${f(r.spillMax)} ${String(r.spillN).padStart(5)} ${String(r.spillAbove3).padStart(4)}   ${f(r.intrudeMax)} ${String(r.intrudeN).padStart(5)}  ${r.intrudeWith.padEnd(30)} ${f(r.floatMax)} ${String(r.tris).padStart(6)}`);
}
const heavy = [...rows].sort((a, b) => b.tris - a.tris).slice(0, 5).map((r) => `${r.id} ${r.tris}`);
console.log(`\nheaviest: ${heavy.join(' · ')}`);
if (!existsSync(join(data, 'chunks/index.json'))) process.exit(1);
