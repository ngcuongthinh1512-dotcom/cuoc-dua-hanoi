// Leg 3 Hà Nội: adds the surface railways (railway=rail, not tunnel / bridge / disused) of .cache/osm to the committed chunk files as
// `rails: [{ pts: [x, z, ...], main?: 1 }]` (world metres, 0.1 m), split by chunk (each piece starts at the previous piece's last point).
// Run AFTER build-chunks (which rewrites the chunk files without `rails`): `npm run build-rails`. Deterministic, output committed.
// Usage: npx tsx scripts/build-rails.ts [--cache .cache/osm] [--out client/public/data]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { CHUNK_SIZE, chunkKey, type ChunkData } from '../client/src/geo/chunkData.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1]! : d; };
const [cache, out] = [arg('--cache', '.cache/osm'), arg('--out', 'client/public/data')];
type El = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
const ways = new Map<number, El>();
for (const f of readdirSync(join(cache, 'tiles'))) {
  const d = JSON.parse(readFileSync(join(cache, 'tiles', f), 'utf8')) as { elements?: El[] } | El[];
  for (const e of Array.isArray(d) ? d : d.elements ?? []) {
    const t = e.tags ?? {};
    if (e.type !== 'way' || t.railway !== 'rail' || !e.geometry || e.geometry.length < 2) continue;
    if (['yes', 'building_passage', 'culvert'].includes(t.tunnel ?? '') || t.bridge || t.disused || t.abandoned) continue;
    ways.set(e.id, e);
  }
}
const perChunk = new Map<string, { pts: number[]; main?: 1 }[]>();
const key = (x: number, z: number) => chunkKey(x, z);
for (const [, e] of [...ways].sort((a, b) => a[0] - b[0])) {
  const main = e.tags?.service ? undefined : (1 as const); // sidings / yard tracks (service=*) are drawn too, flagged
  // densify to ≤ 20 m, then cut into runs by the chunk of each segment's midpoint
  const p = e.geometry!.map((g) => { const w = latLonToWorld(g.lat, g.lon); return [w.x, w.z] as const; });
  const dense: (readonly [number, number])[] = [p[0]!];
  for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1]!, p[i]!];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20));
    for (let k = 1; k <= n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  let run: number[] = [];
  let cur = '';
  const flush = () => { if (run.length >= 4) { const l = perChunk.get(cur) ?? []; l.push({ pts: run, ...(main && { main }) }); perChunk.set(cur, l); } };
  for (let i = 1; i < dense.length; i++) {
    const [a, b] = [dense[i - 1]!, dense[i]!];
    const k = key((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    if (k !== cur) { flush(); cur = k; run = [Math.round(a[0] * 10) / 10, Math.round(a[1] * 10) / 10]; }
    run.push(Math.round(b[0] * 10) / 10, Math.round(b[1] * 10) / 10);
  }
  flush();
}
let n = 0;
for (const f of readdirSync(join(out, 'chunks'))) {
  if (f === 'index.json') continue;
  const path = join(out, 'chunks', f);
  const c = JSON.parse(readFileSync(path, 'utf8')) as ChunkData & { rails?: unknown };
  const r = perChunk.get(f.replace('.json', ''));
  const had = 'rails' in c;
  if (r) c.rails = r; else delete c.rails;
  if (r || had) { writeFileSync(path, JSON.stringify(c)); n++; }
}
console.log(`${ways.size} railway ways → ${[...perChunk.values()].reduce((s, l) => s + l.length, 0)} pieces in ${perChunk.size} chunks (${n} files written)`);
console.assert(CHUNK_SIZE === 250 && existsSync(out));
