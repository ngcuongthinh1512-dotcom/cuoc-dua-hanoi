// Phase 8B track D: the 23 artworks of the Louvre room → client/public/art/art-NN.{webp,glb} (docs/plans/phase8b.md §F, §M;
// SPEC §17.19). `npm run process-assets -- --assets <dir> louvre`.
//
// Input (OUTSIDE the repo, never committed): <dir>/louvre/{raw,sketchfab}/ + <dir>/louvre/manifest.json
//   { "seed": "<anything>", "items": [{ "file": "raw/x.jpg" | "sketchfab/y.glb", "kind": "photo" | "scan", "type"?: "painting" | "sculpture",
//     "title", "artist", "photo", "license", "source", "real"?: true }] }
// The manifest is the only place that links a real work to its art-NN: the item order is shuffled by `seed`, item k of the
// shuffle becomes art-(k+1). Output: art-NN.webp (long edge ≤ 2048, NO metadata: sharp keeps none unless asked) / art-NN.glb
// (every node / mesh / material / texture renamed art-NN, extras + copyright dropped, textures ≤ 2K, Meshopt) in client/public/art/,
// and <dir>/louvre/credits-snippet.json (NOT in the repo: pasted into the real leg's artworks[] by the organiser).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

export interface ManifestItem { file: string; kind: 'photo' | 'scan'; type?: 'painting' | 'sculpture'; title: string; artist?: string; photo?: string; license: string; source?: string; real?: boolean }
export interface LouvreManifest { seed: string | number; items: ManifestItem[] }
export interface SnippetItem { id: string; type: 'painting' | 'sculpture'; image: string; credit: { title: string; artist: string; photo: string; license: string; source: string } }
export interface LouvreResult { files: { id: string; file: string; bytes: number; from: string }[]; snippet: SnippetItem[]; answers: string[]; warnings: string[] }

/** Limits (shared/src/leg/schema.ts LOUVRE: leg:check warns above them) + the folder budget of plan §J. */
export const LIMITS = { webpBytes: 300 * 1024, glbBytes: 1024 * 1024, totalBytes: 8 * 2 ** 20, longEdge: 2048, textureEdge: 2048, count: 23 };

/** mulberry32 seeded by an FNV-1a hash of the seed text: the same manifest always gives the same order. */
function rng(seed: string | number) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

/** Fisher–Yates with the seeded generator. */
export function shuffled<T>(list: readonly T[], seed: string | number): T[] {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A photo → WebP: long edge ≤ 2048, quality / size lowered until ≤ webpBytes. No .withMetadata(): no EXIF / XMP / ICC. */
export async function photoToWebp(input: Buffer, maxBytes = LIMITS.webpBytes): Promise<Buffer> {
  let last: Buffer = Buffer.alloc(0);
  for (const edge of [LIMITS.longEdge, 1536, 1024]) {
    for (const quality of [82, 72, 62, 52]) {
      // rotate() applies the EXIF orientation to the pixels (the tag itself is dropped with the rest of the metadata)
      last = await sharp(input).rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
      if (last.length <= maxBytes) return last;
    }
  }
  return last; // ponytail: smallest try even if still over the cap (leg:check warns), a lower ladder if real photos need it
}

const ioFor = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

/** Every name in the document → `name`; extras, asset copyright / generator / extras and animation names dropped. */
export function anonymize(doc: Document, name: string) {
  const root = doc.getRoot();
  for (const list of [root.listScenes(), root.listNodes(), root.listMeshes(), root.listMaterials(), root.listTextures(), root.listSkins(), root.listAnimations(), root.listCameras(), root.listBuffers(), root.listAccessors()])
    for (const x of list) x.setName(name).setExtras({});
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setExtras({});
  root.setExtras({});
  const asset = root.getAsset();
  asset.copyright = undefined;
  asset.generator = undefined;
  asset.extras = {};
}

/** A scanned statue → GLB: textures ≤ edge (shrunk 2048 → 1024 → 512 until the file ≤ maxBytes), names anonymised, Meshopt. */
export async function scanToGlb(input: Buffer, name: string, maxBytes = LIMITS.glbBytes): Promise<Buffer> {
  const io = ioFor();
  await MeshoptEncoder.ready;
  let last: Buffer = Buffer.alloc(0);
  for (const edge of [LIMITS.textureEdge, 1024, 512]) {
    const doc = await io.readBinary(new Uint8Array(input));
    await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [edge, edge], quality: 80 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    anonymize(doc, name);
    last = Buffer.from(await io.writeBinary(doc));
    if (last.length <= maxBytes) return last;
  }
  return last;
}

/** Whole job. `dir` = the louvre input folder (…/louvre), `out` = client/public/art. Throws on a missing file / > 8 MB. */
export async function processLouvre(dir: string, out: string, log: (s: string) => void = console.log): Promise<LouvreResult> {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as LouvreManifest;
  const warnings: string[] = [];
  if (manifest.items.length !== LIMITS.count) warnings.push(`manifest có ${manifest.items.length} tác phẩm, SPEC §17.19 cần ${LIMITS.count}`);
  if (manifest.items.length > 99) throw new Error('process-assets louvre: more than 99 items (art-NN has 2 digits)');
  if (manifest.seed === undefined || manifest.seed === '') throw new Error('process-assets louvre: manifest.json needs a "seed" (the shuffle order)');
  const order = shuffled(manifest.items, manifest.seed);
  mkdirSync(out, { recursive: true });
  for (const n of readdirSync(out)) if (/^art-\d{2}\.(webp|glb)$/.test(n)) rmSync(join(out, n)); // a new seed must not leave stale files
  const files: LouvreResult['files'] = [];
  const snippet: SnippetItem[] = [];
  for (const [k, item] of order.entries()) {
    const id = `art-${String(k + 1).padStart(2, '0')}`;
    const from = join(dir, item.file);
    if (!existsSync(from)) throw new Error(`process-assets louvre: missing ${item.file}`);
    const bytes = readFileSync(from);
    const glb = item.kind === 'scan';
    const data = glb ? await scanToGlb(bytes, id) : await photoToWebp(bytes);
    const file = `${id}.${glb ? 'glb' : 'webp'}`;
    writeFileSync(join(out, file), data);
    const cap = glb ? LIMITS.glbBytes : LIMITS.webpBytes;
    if (data.length > cap) warnings.push(`${file} nặng ${Math.round(data.length / 1024)} KB, quá ${cap / 1024} KB`);
    files.push({ id, file, bytes: data.length, from: item.file });
    snippet.push({ id, type: item.type ?? (glb ? 'sculpture' : 'painting'), image: file, credit: { title: item.title, artist: item.artist ?? '', photo: item.photo ?? '', license: item.license, source: item.source ?? '' } });
  }
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > LIMITS.totalBytes) throw new Error(`process-assets louvre: client/public/art ${(total / 2 ** 20).toFixed(2)} MB > 8 MB`);
  writeFileSync(join(dir, 'credits-snippet.json'), `${JSON.stringify(snippet, null, 1)}\n`);
  const answers = order.flatMap((it, k) => (it.real ? [`art-${String(k + 1).padStart(2, '0')}`] : []));
  // console only (outside the repo): the real name ↔ art-NN table the organiser needs
  log('tên gốc → art-NN (KHÔNG commit, KHÔNG dán vào repo):');
  for (const f of files) log(`  ${f.from} → ${f.file} (${Math.round(f.bytes / 1024)} KB)`);
  log(`tổng ${(total / 2 ** 20).toFixed(2)} MB / ${files.length} tệp; credits-snippet.json: ${join(dir, 'credits-snippet.json')}`);
  if (answers.length) log(`mã các tác phẩm "real" trong manifest (dán vào "answers" của chặng thật): ${answers.join(', ')}`);
  for (const w of warnings) log(`CẢNH BÁO: ${w}`);
  return { files, snippet, answers, warnings };
}
