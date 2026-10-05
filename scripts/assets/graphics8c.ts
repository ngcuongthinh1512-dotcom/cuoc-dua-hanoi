// Phase 8C foundation: the graphics targets of `npm run process-assets` (one import line in scripts/process-assets.ts,
// docs/plans/phase8c-graphics.md §5). Input <assets>/8c (manifest.ts), output client/public/{textures,models} + the 8C
// lines of client/public/credits.json. `npm run process-assets -- [--assets <dir>] textures trees` = only those (and the
// old targets named); no name = every target. Each track owns its target file; this registry is the foundation's.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { hdri } from './hdri.ts';
import { assetPath, type Credit, credits8c, mergeCredits, readManifest8c } from './manifest.ts';
import { type Ctx, PUBLIC, type Target } from './pipeline.ts';
import { props } from './props.ts';
import { textures } from './textures.ts';
import { trees } from './trees.ts';

export const TARGETS: Record<string, Target> = {
  hdri, // [T1] sky HDRI (+ water normals)
  textures, // [T3] facade / road / terrain PBR sets
  trees, // [T2] plane trees (bark + leaf cards, LODs)
  props, // [T2] Paris street furniture
};

const { values: opt, positionals } = parseArgs({ args: process.argv.slice(2), options: { assets: { type: 'string' } }, allowPositionals: true, strict: false });
const src = join(typeof opt.assets === 'string' ? opt.assets : join(import.meta.dirname, '../../.cache/assets'), '8c');
const asked = positionals.filter((p) => p in TARGETS);
const run = positionals.length ? asked : Object.keys(TARGETS);

if (run.length && !existsSync(join(src, 'manifest.json'))) throw new Error(`process-assets 8c: ${src}/manifest.json missing (docs/reports/phase8c-download.md)`);
if (existsSync(join(src, 'manifest.json'))) {
  const assets = readManifest8c(src); // licence check of every file, even when no 8C target runs
  const ctx: Ctx = { src, assets, file: (rel) => assetPath(src, assets, rel), log: console.log };
  for (const name of run) {
    console.log(`8c ${name}…`);
    await TARGETS[name]!(ctx);
  }
  // process-assets writes credits.json at its very end (after this module ran): the 8C lines are merged in on exit
  const lines = credits8c(assets);
  process.on('exit', (code) => {
    const file = join(PUBLIC, 'credits.json');
    if (code !== 0 || !existsSync(file)) return;
    const merged = mergeCredits(JSON.parse(readFileSync(file, 'utf8')) as Credit[], lines);
    writeFileSync(file, `${JSON.stringify(merged, null, 1)}\n`);
    console.log(`client/public/credits.json: + ${lines.length} mục đồ họa 8C`);
  });
}
