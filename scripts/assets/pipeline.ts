// Phase 8C foundation: shared steps of the graphics targets (scripts/assets/graphics8c.ts runs them). Output names:
// client/public/textures/<name>_{col,nrm,arm}.webp (+ _1k twins, client/src/world/textures.ts picks by quality),
// client/public/models/<name>.glb. Every output ≤ 25 MB (Cloudflare static asset limit).
// ponytail: WebP only, no KTX2 (needs the basis transcoder wasm in the client); add it if VRAM (renderer.info) > 512 MB
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { graphics8c } from '../../client/src/config.ts';
import type { Asset8c } from './manifest.ts';

export const MAX_BYTES = 25 * 2 ** 20;
const root = join(import.meta.dirname, '../..');
export const PUBLIC = join(root, 'client/public');

/** What every target gets. `file(rel)` = the checked path of an approved asset in <assets>/8c (manifest.ts assetPath). */
export interface Ctx { src: string; assets: readonly Asset8c[]; file(rel: string): string; log(s: string): void }
export type Target = (ctx: Ctx) => Promise<void>;

/** Writes `data` to client/public/<rel>, refusing anything > 25 MB; returns the byte count. */
export function writePublic(rel: string, data: Uint8Array, log: (s: string) => void = console.log): number {
  if (data.length > MAX_BYTES) throw new Error(`${rel}: ${(data.length / 2 ** 20).toFixed(1)} MB > 25 MB`);
  const path = join(PUBLIC, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  log(`${rel}: ${(data.length / 2 ** 20).toFixed(2)} MB`);
  return data.length;
}

/** An image (JPG / PNG / TGA via sharp) → WebP, long edge ≤ `size`, no metadata. */
export const toWebp = (input: Buffer | string, size: number, quality = 85) =>
  sharp(input).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();

/** One entry of a zip (ambientCG sets) via the system `unzip` (macOS / Linux). */
export const zipEntry = (zip: string, entry: string) => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 256 * 2 ** 20 });

/** A PBR set → textures/<name>_{col,nrm,arm}.webp at `size` (+ _1k twins when size > the low-quality size). `maps` = the
 *  source images (Poly Haven diff / nor_gl / arm; ambientCG: build arm from AO / Roughness / Metalness first). */
export async function pbrSet(name: string, maps: { col: Buffer | string; nrm: Buffer | string; arm: Buffer | string }, size = 2048, log?: (s: string) => void) {
  const low = graphics8c.quality.lowTexture;
  for (const [m, input] of Object.entries(maps)) {
    writePublic(`textures/${name}_${m}.webp`, await toWebp(input, size, m === 'col' ? 85 : 90), log);
    if (size > low) writePublic(`textures/${name}_${m}_1k.webp`, await toWebp(input, low, m === 'col' ? 85 : 90), log);
  }
}

export const glbIO = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
export const triangles = (doc: Document) =>
  doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3, 0), 0);

/** A downloaded GLB → game GLB: dedup + weld, simplified toward `maxTris`, textures WebP ≤ `textureSize`, every node /
 *  mesh / material named `name` + index, asset extras / copyright dropped (the credit lives in credits.json), Meshopt. */
export async function optimizeGlb(input: Uint8Array | Document, o: { name: string; maxTris: number; textureSize: number }): Promise<{ doc: Document; glb: Uint8Array }> {
  const io = glbIO();
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const doc = input instanceof Uint8Array ? await io.readBinary(input) : input;
  await doc.transform(dedup(), weld());
  const n = triangles(doc);
  if (n > o.maxTris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: o.maxTris / n, error: 0.01, lockBorder: false }));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [o.textureSize, o.textureSize], quality: 85 }));
  const r = doc.getRoot();
  for (const list of [r.listNodes(), r.listMeshes(), r.listMaterials(), r.listTextures()]) list.forEach((x, i) => x.setName(`${o.name}_${i}`));
  const asset = r.getAsset();
  asset.extras = {};
  asset.copyright = undefined;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  return { doc, glb: await io.writeBinary(doc) };
}
