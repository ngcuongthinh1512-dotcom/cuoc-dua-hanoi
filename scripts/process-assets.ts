// Downloaded landmark models (docs/plans/phase2b-assets.md §2, §5.8) → client/public/models/*.glb + client/public/credits.json.
// Run once after the downloads: npm run process-assets [-- --assets <dir with the originals>] (default .cache/assets).
// Each model is baked into its local frame in metres (x = long axis, y up from the ground, z = short axis), every mesh of
// one material merged into one primitive, meshopt-compressed; client/src/world/landmarks/models.ts places it on the OSM
// footprint. Deterministic for the same inputs.
// DOM lib: kit.ts → buildTypes.ts mentions ImageBitmap (type only).
/// <reference lib="dom" />
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Document, type Material, NodeIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
// ponytail: @gltf-transform/extensions and sharp are dependencies of the approved @gltf-transform/{functions,cli}
// (hoisted), not direct ones; add them to devDependencies if npm ever stops hoisting them.
import sharp from 'sharp';
import { landmarks } from '../client/src/config.ts';
import { footprintFrame } from '../client/src/world/landmarks/kit.ts';

const G = landmarks.g1;
const root = join(import.meta.dirname, '..');
const { values: opt } = parseArgs({ options: { assets: { type: 'string' } } });
const src = opt.assets ?? join(root, '.cache/assets');
const out = join(root, 'client/public/models');
const MAX_BYTES = 25 * 2 ** 20; // Cloudflare static asset limit (CLAUDE.md)

/** Triangles of one source material in world space (node transforms applied). */
interface Group { material: Material; pos: number[]; nrm: number[]; uv: number[] }

function collect(doc: Document): Group[] {
  const groups = new Map<Material | null, Group>();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (!mat) continue;
      const g = groups.get(mat) ?? { material: mat, pos: [], nrm: [], uv: [] };
      groups.set(mat, g);
      const [P, N, T, I] = [prim.getAttribute('POSITION')!, prim.getAttribute('NORMAL'), prim.getAttribute('TEXCOORD_0'), prim.getIndices()];
      const n = I ? I.getCount() : P.getCount();
      const [v, t] = [[0, 0, 0], [0, 0]];
      for (let k = 0; k < n; k++) {
        const i = I ? I.getScalar(det < 0 ? k - (k % 3) + [0, 2, 1][k % 3]! : k) : k; // mirrored node → flip winding
        P.getElement(i, v);
        g.pos.push(...[0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]!));
        if (N) N.getElement(i, v);
        else v.splice(0, 3, 0, 1, 0);
        const w = [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]!);
        const l = Math.hypot(...w) || 1;
        g.nrm.push(...w.map((c) => c / l));
        if (T) T.getElement(i, t);
        g.uv.push(t[0]!, t[1]!);
      }
    }
  }
  return [...groups.values()];
}

/** Applies (x, y, z) → f(x, y, z) to every vertex; normals follow the local scale (finite differences). */
function remap(g: Group, f: (x: number, y: number, z: number) => [number, number, number]) {
  for (let i = 0; i < g.pos.length; i += 3) {
    const [x, y, z] = [g.pos[i]!, g.pos[i + 1]!, g.pos[i + 2]!];
    const p = f(x, y, z);
    const e = 1e-3;
    // Inverse-transpose of the Jacobian on the normal ≈ n / scale per axis (the maps here are axis-separable).
    const s = [0, 1, 2].map((k) => {
      const q = [x, y, z];
      q[k]! += e;
      const r = f(q[0]!, q[1]!, q[2]!);
      return Math.hypot(r[0] - p[0], r[1] - p[1], r[2] - p[2]) / e || 1;
    });
    const [nx, ny, nz] = [g.nrm[i]! / s[0]!, g.nrm[i + 1]! / s[1]!, g.nrm[i + 2]! / s[2]!];
    g.pos.splice(i, 3, ...p);
    const l = Math.hypot(nx, ny, nz) || 1;
    g.nrm.splice(i, 3, nx / l, ny / l, nz / l);
  }
}

/** Rotation in the xz plane (keeps handedness): raw (x, z) → (x·ux + z·uz, −x·uz + z·ux), normals too. */
function rotate(g: Group, ux: number, uz: number) {
  for (const a of [g.pos, g.nrm]) {
    for (let i = 0; i < a.length; i += 3) {
      const [x, z] = [a[i]!, a[i + 2]!];
      a[i] = x * ux + z * uz;
      a[i + 2] = -x * uz + z * ux;
    }
  }
}

/** Drops triangles for which drop(a, b, c, normalY) holds. */
function filterTris(g: Group, drop: (ys: number[], ny: number) => boolean) {
  const keep: Group = { material: g.material, pos: [], nrm: [], uv: [] };
  for (let t = 0; t < g.pos.length; t += 9) {
    const ys = [g.pos[t + 1]!, g.pos[t + 4]!, g.pos[t + 7]!];
    if (drop(ys, (g.nrm[t + 1]! + g.nrm[t + 4]! + g.nrm[t + 7]!) / 3)) continue;
    keep.pos.push(...g.pos.slice(t, t + 9));
    keep.nrm.push(...g.nrm.slice(t, t + 9));
    keep.uv.push(...g.uv.slice((t / 3) * 2, (t / 3) * 2 + 6));
  }
  return keep;
}

const bounds = (gs: Group[]) => {
  const [lo, hi] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const g of gs) for (let i = 0; i < g.pos.length; i++) (lo[i % 3] = Math.min(lo[i % 3]!, g.pos[i]!)), (hi[i % 3] = Math.max(hi[i % 3]!, g.pos[i]!));
  return { lo, hi };
};

/** Convex hull (monotone chain) of xz points, as a flat ring. */
function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const half = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    return h.slice(0, -1);
  };
  return [...half(p), ...half(p.reverse())].flat();
}

/** New document: one mesh + node per group, lit metal/rough materials (source unlit/SketchUp extras dropped). */
function toDocument(gs: Group[], name: string, look: (m: Material) => { color?: number[]; roughness: number; metalness: number }) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const textures = new Map<Texture, Texture>();
  for (const g of gs) {
    if (!g.pos.length) continue;
    const srcTex = g.material.getBaseColorTexture();
    let tex: Texture | null = null;
    if (srcTex) {
      tex = textures.get(srcTex) ?? doc.createTexture(srcTex.getName()).setImage(srcTex.getImage()!).setMimeType(srcTex.getMimeType());
      textures.set(srcTex, tex);
    }
    const l = look(g.material);
    const mat = doc
      .createMaterial(g.material.getName())
      .setBaseColorFactor([...(l.color ?? g.material.getBaseColorFactor().slice(0, 3)), 1] as [number, number, number, number])
      .setRoughnessFactor(l.roughness)
      .setMetallicFactor(l.metalness)
      .setBaseColorTexture(tex);
    const acc = (type: 'VEC3' | 'VEC2', a: number[]) => doc.createAccessor().setType(type).setArray(new Float32Array(a)).setBuffer(buffer);
    const prim = doc
      .createPrimitive()
      .setMaterial(mat)
      .setAttribute('POSITION', acc('VEC3', g.pos))
      .setAttribute('NORMAL', acc('VEC3', g.nrm));
    if (tex) prim.setAttribute('TEXCOORD_0', acc('VEC2', g.uv));
    scene.addChild(doc.createNode(g.material.getName()).setMesh(doc.createMesh(g.material.getName()).addPrimitive(prim)));
  }
  return doc;
}

const tris = (doc: Document) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3, 0);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

// ── Eiffel: SketchUp export, y up, units ≈ cm. Uniform scale to 330 m, then heights remapped piecewise so the model's
// platforms (measured on its width profile at that scale: 74, 150, 296 m) land on the real 57.63 / 115.73 / 276.13 m,
// and the base square (lattice) to the real 124.9 m. Every material → the one lattice colour at runtime (models.ts).
async function eiffel() {
  const gs = collect(await io.read(join(src, 'eiffel_scott-marshall.glb')));
  const lattice = gs.find((g) => g.material.getName() === 'Metal_Steel_Textured')!;
  const b = bounds([lattice]);
  const s = G.eiffel.height / (b.hi[1]! - b.lo[1]!);
  const [cx, cz] = [(b.lo[0]! + b.hi[0]!) / 2, (b.lo[2]! + b.hi[2]!) / 2];
  const kxz = G.eiffel.halfBase / (((b.hi[0]! - b.lo[0]!) / 2) * s);
  /** Piecewise-linear table lookup, extrapolating the end segments. */
  const pw = (xs: readonly number[], ys: readonly number[], v: number) => {
    let k = 0;
    while (k < xs.length - 2 && v > xs[k + 1]!) k++;
    return ys[k]! + ((v - xs[k]!) * (ys[k + 1]! - ys[k]!)) / (xs[k + 1]! - xs[k]!);
  };
  const py = (y: number) => pw([0, 74, 150, 296, G.eiffel.height], [0, ...G.eiffel.platforms, G.eiffel.height], y);
  // The model's upper floors are too narrow: xz widened by height (config g1.eiffel.widen, [y, factor]).
  const [wy, wk] = [[0, ...G.eiffel.widen.map((w) => w[0]!)], [1, ...G.eiffel.widen.map((w) => w[1]!)]];
  const widen = (y: number) => (y >= wy.at(-1)! ? wk.at(-1)! : pw(wy, wk, y));
  // ponytail: normals follow only the per-axis scale (remap), not the slight shear of the widening; fine for 1.0–1.6.
  for (const g of gs) {
    remap(g, (x, y, z) => {
      const h = py((y - b.lo[1]!) * s);
      const k = s * kxz * widen(h);
      return [(x - cx) * k, h, (z - cz) * k];
    });
  }
  for (const g of gs) g.material.setBaseColorTexture(null); // dark 256² steel JPEGs; painted one colour at runtime
  return toDocument(gs, 'eiffel', () => ({ roughness: 0.8, metalness: 0 })); // paint, not bare metal
}

// ── Arc: photogrammetry (Sketchfab), y up, rotated ≈ 20° and ≈ 0.8 units/m. Its axes = the minimum-area rectangle of the
// body (hull of the vertices between 45 % and 55 % of the height: above the sculpture groups, below the cornice),
// x = the 45 m face, +z = the east face (Champs-Élysées side: "Le Départ de 1792" on the right pillar, checked on a
// render). Scaled per axis to the real 44.82 × 49.54 × 22.21 m; ground fringe cut; the open top (never photographed)
// patched with a flat terrace; decimated to ≤ 150k triangles, textures WebP ≤ 4K.
async function arc() {
  const doc0 = await io.read(join(src, 'arc-triomphe_hoanghiepvu.glb'));
  let gs = collect(doc0).filter((g) => g.material.getBaseColorTexture()); // untextured material_2 = hole-fill scraps
  const b = bounds(gs);
  const h = b.hi[1]! - b.lo[1]!;
  const mid: [number, number][] = [];
  for (const g of gs) {
    for (let i = 0; i < g.pos.length; i += 3 * 7) {
      const y = (g.pos[i + 1]! - b.lo[1]!) / h;
      if (y > 0.45 && y < 0.55) mid.push([g.pos[i]!, g.pos[i + 2]!]);
    }
  }
  const f = footprintFrame(hull(mid));
  const sign = f.ux >= 0 ? 1 : -1; // w = (−uz, ux) must point to raw +z (the east face)
  const [ux, uz] = [f.ux * sign, f.uz * sign];
  const [cu, cw] = [f.cx * ux + f.cz * uz, -f.cx * uz + f.cz * ux];
  for (const g of gs) rotate(g, ux, uz);
  const A = G.arc;
  for (const g of gs) remap(g, (x, y, z) => [((x - cu) * A.halfWidth) / f.a, ((y - b.lo[1]!) * A.height) / h, ((z - cw) * A.halfDepth) / f.b]);
  gs = gs.map((g) => filterTris(g, (ys, ny) => Math.max(...ys) < 0.3 && Math.abs(ny) > 0.7)); // ground patches
  const doc = toDocument(gs, 'arc', () => ({ roughness: 0.9, metalness: 0 }));
  const T = A.texture; // grey overcast photos → warm limestone
  for (const tex of doc.getRoot().listTextures()) {
    const img = sharp(tex.getImage()!).modulate({ brightness: T.brightness }).linear(T.gain, [0, 0, 0]);
    tex.setImage(new Uint8Array(await img.png().toBuffer())).setMimeType('image/png');
  }
  // Roof terrace + core: a stone box inset inside the attic, from above the main arch's crown to the terrace, which
  // also plugs the photogrammetry holes under the cornice.
  const [x, z, y0, y1] = [A.halfWidth - A.roofInset, A.halfDepth - A.roofInset, A.coreY0, A.roofY];
  const pos: number[] = [];
  const nrm: number[] = [];
  const face = (n: number[], ...q: number[][]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...q[k]!), nrm.push(...n);
  };
  face([0, 1, 0], [-x, y1, -z], [-x, y1, z], [x, y1, z], [x, y1, -z]);
  face([0, -1, 0], [-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z]);
  face([0, 0, 1], [-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z]);
  face([0, 0, -1], [x, y0, -z], [-x, y0, -z], [-x, y1, -z], [x, y1, -z]);
  face([1, 0, 0], [x, y0, z], [x, y0, -z], [x, y1, -z], [x, y1, z]);
  face([-1, 0, 0], [-x, y0, -z], [-x, y0, z], [-x, y1, z], [-x, y1, -z]);
  const roof = doc.createMaterial('roof').setBaseColorFactor([...A.roofColour, 1] as [number, number, number, number]).setRoughnessFactor(0.9).setMetallicFactor(0);
  const acc = (a: number[]) => doc.createAccessor().setType('VEC3').setArray(new Float32Array(a)).setBuffer(doc.getRoot().listBuffers()[0]!);
  const core = doc.createPrimitive().setMaterial(roof).setAttribute('POSITION', acc(pos)).setAttribute('NORMAL', acc(nrm));
  doc.getRoot().listScenes()[0]!.addChild(doc.createNode('roof').setMesh(doc.createMesh('roof').addPrimitive(core)));
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.002, lockBorder: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [4096, 4096], quality: 85 }),
  );
  return doc;
}

mkdirSync(out, { recursive: true });
for (const [name, build] of [['eiffel', eiffel], ['arc', arc]] as const) {
  const doc = await build();
  await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = join(out, `${name}.glb`);
  writeFileSync(file, await io.writeBinary(doc));
  const bytes = statSync(file).size;
  console.log(`${file}: ${tris(doc).toLocaleString()} tam giác, ${(bytes / 2 ** 20).toFixed(2)} MB`);
  if (bytes > MAX_BYTES) throw new Error(`${file} > 25 MB`);
}

// credits.json: every downloaded asset (manifest.json written by the download step) + the map data. Each line = a
// Vietnamese usage label + the manifest attribution (its own label prefix dropped); "(đã chỉnh sửa)" only on the files
// this script modifies (the others are not processed or used yet: Phase 3 / 4B re-run this with their files added).
type Entry = { name: string; pageUrl: string; licence: string; author: string; attribution: string; usedFor: string };
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8')) as Entry[];
const MODIFIED = new Set(['eiffel_scott-marshall.glb', 'arc-triomphe_hoanghiepvu.glb']); // read by eiffel() / arc() above
const LABELS: [RegExp, string][] = [
  [/^eiffel_/, 'Tháp Eiffel'],
  [/^arc-triomphe_/, 'Khải Hoàn Môn'],
  [/^car-sedan-(\d)_/, 'Xe NPC (sedan $1)'],
  [/^(free_low_poly_vehicles|suv|taxi|truck)/, 'Xe NPC'],
  [/^(scooter|motorcycle)_/, 'Xe máy NPC'],
  [/^bicycle_/, 'Xe đạp'],
  [/^ped-/, 'Người đi đường'],
  [/^universal_animation_library/, 'Người chơi (hoạt ảnh)'],
  [/^Universal Base Characters/, 'Người chơi (nhân vật)'],
];
const label = (name: string) => {
  const hit = LABELS.find(([re]) => re.test(name));
  if (!hit) throw new Error(`process-assets: no credits label for ${name}`);
  return name.match(hit[0])![0].replace(hit[0], hit[1]);
};
const credit = (e: Entry) => {
  const text = e.attribution.replace(/^[^"]*: (?=")/, '').replace(' (đã chỉnh sửa)', MODIFIED.has(e.name) ? ' (đã chỉnh sửa)' : '');
  return { title: `${label(e.name)}: ${/"([^"]+)"/.exec(text)?.[1] ?? e.name}`, text: `${label(e.name)}: ${text}`, licence: e.licence, url: e.pageUrl, author: e.author };
};
const credits = [
  { title: 'Bản đồ', text: 'Bản đồ: © OpenStreetMap contributors', licence: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
  {
    title: 'Độ cao địa hình',
    text: 'Độ cao địa hình: Terrain Tiles (Mapzen / AWS Open Data): EU-DEM (Copernicus), SRTM (NASA / USGS)',
    licence: 'xem trang nguồn',
    url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  },
  ...manifest.map(credit),
];
writeFileSync(join(root, 'client/public/credits.json'), `${JSON.stringify(credits, null, 1)}\n`);
console.log(`client/public/credits.json: ${credits.length} mục`);
