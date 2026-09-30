// build-chunks on a tiny OSM fixture (Phase 4 track D): global street junctions across a chunk border, stairs out of the
// roads, quay flights on a river, deterministic output.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worldToLatLon } from '@race/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { props, stairs as ST } from '../client/src/config.ts';
import type { ChunkData, WaterData } from '../client/src/geo/chunkData.ts';
import { findJunctions } from '../client/src/world/StreetProps.ts';

const root = join(import.meta.dirname, '..');
let id = 0;
const nodes: object[] = [];
const node = (x: number, z: number) => {
  const { lat, lon } = worldToLatLon(x, z);
  nodes.push({ type: 'node', id: ++id, lat, lon });
  return id;
};
const way = (tags: Record<string, string>, ...pts: [number, number][]) => ({ type: 'way', id: ++id + 1000, tags, nodes: pts.map(([x, z]) => node(x, z)) });
const shared = (w: { nodes: number[] }, k: number) => w.nodes[k]!;

// Junction J at (2, 100), 2 m inside chunk 0_0: Rue Ouest ENDS there from chunk −1_0 (its only segment lies in the
// neighbour chunk), Rue Est starts there, Rue Nord-Sud runs through.
const west = way({ highway: 'residential', name: 'Rue Ouest' }, [-60, 100], [2, 100]);
const east = { type: 'way', id: ++id + 1000, tags: { highway: 'residential', name: 'Rue Est' }, nodes: [shared(west, 1), node(60, 100)] };
const ns = { type: 'way', id: ++id + 1000, tags: { highway: 'tertiary', name: 'Rue Nord-Sud' }, nodes: [node(2, 40), shared(west, 1), node(2, 160)] };
const steps = way({ highway: 'steps', step_count: '12' }, [120, 50], [120, 60]);
// A 1.2 km straight river (z 400 … 480), far from any bridge: synthetic quay flights on both banks.
const river = way({ natural: 'water', water: 'river', name: 'La Seine' }, [-600, 400], [600, 400], [600, 480], [-600, 480], [-600, 400]);
river.nodes[4] = river.nodes[0]!;

function build(cache: string, out: string) {
  execFileSync('npx', ['tsx', join(root, 'scripts/build-chunks.ts'), '--cache', cache, '--out', out], { cwd: root, stdio: 'pipe' });
}
const hashDir = (dir: string) => {
  const h = createHash('sha256');
  for (const f of readdirSync(join(dir, 'chunks')).sort()) h.update(readFileSync(join(dir, 'chunks', f)));
  return h.update(readFileSync(join(dir, 'water.json'))).digest('hex');
};

let dir = '';
const chunk = (key: string) => JSON.parse(readFileSync(join(dir, 'a/chunks', `${key}.json`), 'utf8')) as ChunkData;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'build-chunks-'));
  mkdirSync(join(dir, 'osm/tiles'), { recursive: true });
  writeFileSync(join(dir, 'osm/global.json'), JSON.stringify({ elements: [...nodes, river] }));
  writeFileSync(join(dir, 'osm/tiles/0_0.json'), JSON.stringify({ elements: [...nodes, west, east, ns, steps] }));
  build(join(dir, 'osm'), join(dir, 'a'));
  build(join(dir, 'osm'), join(dir, 'b'));
}, 120_000);

describe('build-chunks fixture', () => {
  it('is deterministic', () => {
    expect(hashDir(join(dir, 'a'))).toBe(hashDir(join(dir, 'b')));
  });

  it('a junction 2 m from the chunk border keeps the arm that lies in the neighbour chunk', () => {
    const c = chunk('0_0');
    const j = c.junctions!.find((r) => r.x === 2 && r.z === 100)!;
    expect(j.arms!.map((a) => a.name).sort()).toEqual(['Rue Est', 'Rue Nord-Sud', 'Rue Nord-Sud', 'Rue Ouest']);
    const [owned] = findJunctions(c, '0_0').owned;
    expect(owned!.arms).toHaveLength(4);
    // The neighbour gets the point only (lamp gap, props.lampJunctionGap), without arms.
    expect(props.lampJunctionGap).toBeGreaterThan(2);
    expect(chunk('-1_0').junctions).toContainEqual({ x: 2, z: 100 });
  });

  it('steps leave the roads for the stairs list (step_count kept)', () => {
    const c = chunk('0_0');
    expect(c.roads.some((r) => r.kind === 'steps')).toBe(false);
    expect(c.stairs).toContainEqual(expect.objectContaining({ steps: 12 }));
  });

  it('quay flights: ≥ 1 per quay.spacing m on each bank, inside the river, foot + parapet gap in water.json', () => {
    const w = JSON.parse(readFileSync(join(dir, 'a/water.json'), 'utf8')) as WaterData;
    const n = w.stairs!.length / 2;
    expect(n).toBeGreaterThanOrEqual(2 * Math.floor(1200 / ST.quay.spacing));
    expect(w.stairGaps).toHaveLength(2 * n);
    for (let k = 0; k < n; k++) {
      const [fx, fz, gx, gz] = [w.stairs![2 * k]!, w.stairs![2 * k + 1]!, w.stairGaps![2 * k]!, w.stairGaps![2 * k + 1]!];
      expect(fz > 400 && fz < 480 && Math.abs(fx) < 600).toBe(true); // foot in the river
      expect(Math.min(Math.abs(gz - 400), Math.abs(gz - 480), Math.abs(Math.abs(gx) - 600))).toBeLessThan(0.2); // gap on a wall
    }
  });
});
