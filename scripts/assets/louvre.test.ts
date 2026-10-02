// Phase 8B track D: process-assets target `louvre` on SYNTHETIC fixtures (images / GLBs generated here; no real artwork).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LIMITS, processLouvre, shuffled, type LouvreManifest } from './louvre.ts';

const SECRET = 'SecretWorkName';
const WHO = 'SecretPhotographer';

/** A JPEG with EXIF carrying a "title" + copyright, bigger than 2048 on its long edge. */
const jpeg = (w = 2600, h = 1500) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 80, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: `${WHO} ${SECRET}`, ImageDescription: SECRET } })
    .toBuffer();

/** A GLB whose node / mesh / material / scene / extras / copyright carry the work's name, with a 2600 px texture. */
async function glb() {
  const doc = new Document();
  const buf = doc.createBuffer();
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buf);
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buf);
  const raw = Buffer.alloc(2600 * 1300 * 3, 0).map((_, i) => ((i / 3) % 2600 > 1300 ? (i * 7) % 251 : (i >> 6) % 256)); // not one flat colour: prune() drops solid-colour textures
  const png = await sharp(raw, { raw: { width: 2600, height: 1300, channels: 3 } }).png().toBuffer();
  const tex = doc.createTexture(`${SECRET}_tex`).setImage(new Uint8Array(png)).setMimeType('image/png');
  const mat = doc.createMaterial(`${SECRET}_mat`).setBaseColorTexture(tex).setExtras({ title: SECRET });
  const mesh = doc.createMesh(`${SECRET}_mesh`).addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('TEXCOORD_0', uv).setMaterial(mat));
  const node = doc.createNode(`${SECRET}_node`).setMesh(mesh).setExtras({ author: WHO });
  doc.createScene(`${SECRET}_scene`).addChild(node);
  doc.getRoot().setExtras({ title: SECRET });
  doc.getRoot().getAsset().copyright = `${WHO} ${SECRET}`;
  doc.getRoot().getAsset().generator = `${SECRET} exporter`;
  return Buffer.from(await new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc));
}

async function fixture(n = 4, seed: string | number = 'seed-1') {
  const dir = mkdtempSync(join(tmpdir(), 'louvre-'));
  mkdirSync(join(dir, 'raw'));
  mkdirSync(join(dir, 'sketchfab'));
  const items: LouvreManifest['items'] = [];
  for (let i = 0; i < n; i++) {
    const scan = i === n - 1;
    const file = scan ? `sketchfab/${SECRET}-${i}.glb` : `raw/${SECRET}-${i}.jpg`;
    writeFileSync(join(dir, file), scan ? await glb() : await jpeg());
    items.push({ file, kind: scan ? 'scan' : 'photo', title: `${SECRET} ${i}`, artist: `Artist ${i}`, photo: WHO, license: 'CC-BY', source: `https://example.org/${SECRET}-${i}`, real: i < 2 });
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ seed, items } satisfies LouvreManifest));
  return { dir, out: mkdtempSync(join(tmpdir(), 'louvre-out-')) };
}

const silent = () => {};

describe('process-assets louvre (synthetic fixtures)', () => {
  it('images → art-NN.webp: long edge ≤ 2048, size cap, and NO metadata (no exif / xmp / icc, no title bytes)', async () => {
    const { dir, out } = await fixture();
    const r = await processLouvre(dir, out, silent);
    const webps = r.files.filter((f) => f.file.endsWith('.webp'));
    expect(webps).toHaveLength(3);
    for (const f of webps) {
      const bytes = readFileSync(join(out, f.file));
      const m = await sharp(bytes).metadata();
      expect(m.format).toBe('webp');
      expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(LIMITS.longEdge);
      expect(m.exif).toBeUndefined();
      expect(m.xmp).toBeUndefined();
      expect(m.icc).toBeUndefined();
      expect(bytes.length).toBeLessThanOrEqual(LIMITS.webpBytes);
      expect(bytes.toString('latin1')).not.toContain(SECRET);
      expect(bytes.toString('latin1')).not.toContain(WHO);
    }
  });

  it('GLB → art-NN.glb: every name anonymised, extras / copyright gone, texture ≤ 2K, no manifest string in the bytes', async () => {
    const { dir, out } = await fixture();
    const r = await processLouvre(dir, out, silent);
    const g = r.files.find((f) => f.file.endsWith('.glb'))!;
    const bytes = readFileSync(join(out, g.file));
    expect(bytes.toString('latin1')).not.toContain(SECRET);
    expect(bytes.toString('latin1')).not.toContain(WHO);
    await MeshoptEncoder.ready;
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(new Uint8Array(bytes));
    const root = doc.getRoot();
    const names = [...root.listScenes(), ...root.listNodes(), ...root.listMeshes(), ...root.listMaterials(), ...root.listTextures()].map((x) => x.getName());
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(new Set(names)).toEqual(new Set([g.id]));
    expect(JSON.stringify(root.getExtras())).toBe('{}');
    expect(root.getAsset().copyright).toBeUndefined();
    const tex = root.listTextures()[0]!;
    const size = tex.getSize()!;
    expect(Math.max(...size)).toBeLessThanOrEqual(LIMITS.textureEdge);
    expect(bytes.length).toBeLessThanOrEqual(LIMITS.glbBytes);
  });

  it('the shuffle follows the manifest seed (same seed = same mapping, other seed = other order), nothing real in the file names', async () => {
    expect(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 'a')).toEqual(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 'a'));
    expect(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 'a')).not.toEqual(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 'b'));
    const a = await fixture(5, 'x');
    const r1 = await processLouvre(a.dir, a.out, silent);
    const r2 = await processLouvre(a.dir, a.out, silent); // a second run replaces the files (no stale art-NN left)
    expect(r2.files.map((f) => [f.id, f.from])).toEqual(r1.files.map((f) => [f.id, f.from]));
    expect(readdirSync(a.out).sort()).toEqual(r1.files.map((f) => f.file).sort());
    expect(readdirSync(a.out).every((n) => /^art-\d{2}\.(webp|glb)$/.test(n))).toBe(true);
    const b = await fixture(5, 'y');
    const r3 = await processLouvre(b.dir, b.out, silent);
    expect(r3.files.map((f) => f.from)).not.toEqual(r1.files.map((f) => f.from)); // seeds x / y: fixed, so this is deterministic
    expect(new Set(r3.files.map((f) => f.from))).toEqual(new Set(r1.files.map((f) => f.from)));
  });

  it('credits-snippet.json lands next to the manifest (outside the repo), in shuffle order, one entry per file; real items listed as answers', async () => {
    const { dir, out } = await fixture();
    const logs: string[] = [];
    const r = await processLouvre(dir, out, (s) => logs.push(s));
    const snippet = JSON.parse(readFileSync(join(dir, 'credits-snippet.json'), 'utf8')) as typeof r.snippet;
    expect(snippet.map((s) => s.image)).toEqual(r.files.map((f) => f.file));
    expect(snippet.find((s) => s.image.endsWith('.glb'))!.type).toBe('sculpture');
    expect(snippet[0]!.credit).toMatchObject({ license: 'CC-BY', photo: WHO });
    expect(r.answers).toHaveLength(2);
    expect(logs.join('\n')).toContain('tên gốc → art-NN');
    expect(readdirSync(out).includes('credits-snippet.json')).toBe(false); // never inside client/public/art
  });

  it('count other than 23 warns; a missing file / no seed throws', async () => {
    const { dir, out } = await fixture();
    expect((await processLouvre(dir, out, silent)).warnings[0]).toContain('cần 23');
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as LouvreManifest;
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...m, items: [{ ...m.items[0]!, file: 'raw/none.jpg' }] }));
    await expect(processLouvre(dir, out, silent)).rejects.toThrow(/missing raw\/none.jpg/);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ items: m.items }));
    await expect(processLouvre(dir, out, silent)).rejects.toThrow(/seed/);
  });
});
