// Downloaded landmark models (docs/plans/phase2b-assets.md §2, §5.8) → client/public/models/*.glb + client/public/credits.json.
// Run once after the downloads: npm run process-assets [-- --assets <dir with the originals>] [eiffel arc player player-anims]
// (default .cache/assets, every model).
// Each model is baked into its local frame in metres (x = long axis, y up from the ground, z = short axis), every mesh of
// one material merged into one primitive, meshopt-compressed; client/src/world/landmarks/models.ts places it on the OSM
// footprint. Deterministic for the same inputs.
// DOM lib: kit.ts → buildTypes.ts mentions ImageBitmap (type only).
/// <reference lib="dom" />
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Accessor, Document, type GLTF, type Material, type Mesh, NodeIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, dedup, meshopt, prune, resample, simplify, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
// ponytail: @gltf-transform/extensions and sharp are dependencies of the approved @gltf-transform/{functions,cli}
// (hoisted), not direct ones; add them to devDependencies if npm ever stops hoisting them.
import sharp from 'sharp';
import { bikeModel, landmarks, npc, npcAssets } from '../client/src/config.ts';
import { UAL_CLIPS } from '../client/src/player/Animation.ts';
import { footprintFrame } from '../client/src/world/landmarks/kit.ts';
import { inChrome, readFbxAvatar, readFbxClip, type RawAvatar, type RawClip, readFbxSoup, unb64 } from './fbx.ts';

const G = landmarks.g1;
const root = join(import.meta.dirname, '..');
const { values: opt, positionals: only } = parseArgs({ options: { assets: { type: 'string' } }, allowPositionals: true }); // [names]: only those
const src = opt.assets ?? join(root, '.cache/assets');
const out = join(root, 'client/public/models');
const MAX_BYTES = 25 * 2 ** 20; // Cloudflare static asset limit (CLAUDE.md)

/** Triangles of one source material in world space (node transforms applied). */
interface Group { material: Material; pos: number[]; nrm: number[]; uv: number[] }

function collect(doc: Document, nodes = doc.getRoot().listNodes()): Group[] {
  const groups = new Map<Material | null, Group>();
  for (const node of nodes) {
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

// ── Player (docs/plans/phase3.md §2): UBC Superhero_Male + Hair_SimpleParted on one skin, and 15 UAL clips renamed to
// its UE bone names (same tree and bone axes: no retargeting, only the pelvis translation scaled to the UBC hips).
const UBC = join(src, 'Universal Base Characters[Standard]/Universal Base Characters[Standard]');
const UAL = join(src, 'universal_animation_librarystandard/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb');
const PLAYER_CLIPS = [...new Set([...Object.values(UAL_CLIPS), 'Death01'])]; // Death01: second half of the crash

/** The body glTF, its two broken normal-map uris (`*_png.png`, not shipped) pointed at the real files. */
async function readBody() {
  const dir = join(UBC, 'Base Characters/Godot - UE');
  const json = JSON.parse(readFileSync(join(dir, 'Superhero_Male_FullBody.gltf'), 'utf8')) as GLTF.IGLTF & { buffers: { uri: string }[]; images: { uri: string }[] };
  for (const img of json.images) if (!existsSync(join(dir, img.uri))) img.uri = img.uri.replace(/_png\.png$/, '.png');
  const resources = Object.fromEntries([...json.buffers, ...json.images].map(({ uri }) => [uri, new Uint8Array(readFileSync(join(dir, uri)))]));
  return io.readJSON({ json, resources });
}

async function player() {
  const doc = await readBody();
  const r = doc.getRoot();
  const skin = r.listSkins()[0]!;
  const armature = r.listNodes().find((n) => n.getName() === 'Armature')!;
  const hairMat = r.listMaterials().find((m) => m.getName() === 'MI_Hair_1')!; // the eyebrows' material = the hair's
  const hairDoc = await io.read(join(UBC, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf'));
  const hairSkin = hairDoc.getRoot().listSkins()[0]!;
  const hairNode = hairDoc.getRoot().listNodes().find((n) => n.getMesh())!;
  // Same joint list; the hair skin is the generic one of every body, so only the joints it weights (Head) must bind alike.
  const [hj, bj] = [hairSkin.listJoints(), skin.listJoints()];
  const [hi, bi] = [hairSkin.getInverseBindMatrices()!.getArray()!, skin.getInverseBindMatrices()!.getArray()!];
  const used = new Set<number>();
  for (const p of hairNode.getMesh()!.listPrimitives()) {
    const [J, W] = [p.getAttribute('JOINTS_0')!, p.getAttribute('WEIGHTS_0')!];
    for (let i = 0; i < J.getCount(); i++) W.getElement(i, [0, 0, 0, 0]).forEach((w, c) => w > 0 && used.add(J.getElement(i, [0, 0, 0, 0])[c]!));
  }
  const bad = [...used].filter((j) => hj[j]!.getName() !== bj[j]?.getName() || [...Array(16).keys()].some((k) => Math.abs(hi[j * 16 + k]! - bi[j * 16 + k]!) > 1e-4));
  if (bad.length) throw new Error(`player: hair joints ${bad.map((j) => hj[j]!.getName())} differ from the body skin`);
  const hair = copyToDocument(doc, hairDoc, [hairNode.getMesh()!]).get(hairNode.getMesh()!) as Mesh;
  for (const p of hair.listPrimitives()) p.setMaterial(hairMat);
  armature.addChild(doc.createNode('Hair').setMesh(hair).setSkin(skin));
  for (const p of r.listMeshes().flatMap((m) => m.listPrimitives())) {
    for (const s of p.listSemantics()) if (/^COLOR_|^TEXCOORD_[1-9]/.test(s)) p.setAttribute(s, null); // white / unused
  }
  const body = r.listMaterials().find((m) => m.getName() === 'MI_Superhero_Male')!;
  const rough = await sharp(body.getMetallicRoughnessTexture()!.getImage()!).stats();
  body.setMetallicRoughnessTexture(null).setRoughnessFactor(rough.channels[1]!.mean / 255).setDoubleSided(false); // closed mesh
  await doc.transform(
    unpartition(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 85, pattern: /Eye/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85, pattern: /^(?!.*Eye)/ }),
  );
  return doc;
}

async function playerAnims() {
  const ubcSkin = (await readBody()).getRoot().listSkins()[0]!;
  const ubc = ubcSkin.listJoints().filter((j) => !j.getName().includes('_leaf'));
  const doc = await io.read(UAL);
  const r = doc.getRoot();
  const ual = r.listSkins()[0]!.listJoints();
  if (ual.length !== ubc.length) throw new Error(`playerAnims: ${ual.length} UAL joints vs ${ubc.length} UBC`);
  const name = new Map(ual.map((j, i) => [j, ubc[i]!.getName()]));
  ual.forEach((j, i) => {
    const [a, b] = [j.getParentNode(), ubc[i]!.getParentNode()];
    if (i > 0 && name.get(a!) !== b?.getName()) throw new Error(`playerAnims: ${j.getName()} parent ${a?.getName()} ≠ ${b?.getName()}`);
  });
  const [root, hips] = [ual[0]!, ual[1]!];
  const k = ubc[1]!.getTranslation()[2] / hips.getTranslation()[2]; // hip height at rest (root frame is z-up): legs longer
  for (const n of r.listNodes()) if (n.getMesh()) n.dispose();
  r.listSkins()[0]!.dispose();
  for (const [j, n] of name) j.setName(n);
  const scaled = new Set<Accessor>();
  for (const a of r.listAnimations()) {
    if (!PLAYER_CLIPS.includes(a.getName())) {
      for (const s of a.listSamplers()) s.dispose(); // orphan samplers would keep their accessors from prune()
      a.dispose();
      continue;
    }
    for (const ch of a.listChannels()) {
      const [node, path, s] = [ch.getTargetNode(), ch.getTargetPath(), ch.getSampler()!];
      if (node === hips && path === 'translation') {
        const o = s.getOutput()!;
        if (!scaled.has(o)) o.setArray(Float32Array.from(o.getArray()!, (v) => v * k));
        scaled.add(o);
      } else if (path !== 'rotation' || node === root) {
        ch.dispose();
        s.dispose();
      }
    }
  }
  const clips = r.listAnimations().map((a) => a.getName());
  if (clips.length !== PLAYER_CLIPS.length) throw new Error(`playerAnims: clips ${clips} ≠ ${PLAYER_CLIPS}`);
  if (r.listNodes().some((n) => n.getName().startsWith('DEF-'))) throw new Error('playerAnims: DEF- bone left');
  console.log(`player-anims: ${clips.length} clip, hông × ${k.toFixed(4)}`);
  await doc.transform(resample());
  return doc;
}

// ── Bike (docs/plans/phase4.md §2.1, track A): Poly "Bicycle", one mesh of 6 materials, faces +Z, raw units. Split by
// connected component into rigid parts, re-coloured Vélib'-style (vertex colours), scaled to a 26" wheel, pivot = ground
// under the bottom bracket, + a code-built front basket and kickstand. One skinned primitive (1 draw call): the parts are
// joints (frame > fork > wheelF, frame > wheelR / crank > pedalL, pedalR / stand), weights 1. Rider targets (saddle,
// grips) and the steering axis / folded-stand rotation ride in the joints' extras (BikeModel reads them).
const BIKE_RAW = {
  ground: -237, // rear tyre bottom (the front tyre / rim / mudguard / fork sit 6.5 higher than its own spokes: dropped)
  frontDrop: 6.5,
  tyre: 154, // outer radius
  rear: [-83, -248.5], // axle y, z (spokes' centre; tyre / rim / hub recentred on it)
  front: [-83, 295.5], // after the drop
  bb: [-119, -43], // bottom bracket y, z
  steerTop: [214.5, 150], // head-tube top centre (after the drop): steering axis = through it and the front axle
  pedal: { l: [26, -86.5, -90.5], r: [-22.5, -145.5, 2] }, // pedal centres (x > 0 = rider's left)
  saddleTop: 256,
  sitZ: -125, // rear half of the saddle (-185 … -41)
  stem: [205, 253], // stem y span: its foot stays on the head tube, its top follows the moved bar
};
const JOINTS = ['frame', 'fork', 'wheelF', 'wheelR', 'crank', 'pedalL', 'pedalR', 'stand'] as const;
type Part = (typeof JOINTS)[number];

const linear = (hex: string) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Box along a → b with a square cross-section of half-size r (12 triangles, flat normals). */
function bar(a: number[], b: number[], r: number) {
  const d = [0, 1, 2].map((k) => b[k]! - a[k]!);
  const l = Math.hypot(...d);
  const w = d.map((c) => c / l);
  const t = Math.abs(w[1]!) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (p: number[], q: number[]) => [p[1]! * q[2]! - p[2]! * q[1]!, p[2]! * q[0]! - p[0]! * q[2]!, p[0]! * q[1]! - p[1]! * q[0]!];
  const u0 = cr(w, t);
  const u = u0.map((c) => (c / Math.hypot(...u0)) * r);
  const v = cr(w, u);
  const corner = (e: number, i: number, j: number) => [0, 1, 2].map((k) => (e ? b : a)[k]! + i * u[k]! + j * v[k]!);
  const pos: number[] = [];
  const nrm: number[] = [];
  const quad = (n: number[], p: number[][]) => {
    const ln = Math.hypot(...n);
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...p[k]!), nrm.push(...n.map((c) => c / ln));
  };
  const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  for (let k = 0; k < 4; k++) {
    const [i0, j0] = S[k]!;
    const [i1, j1] = S[(k + 1) % 4]!;
    const n = [0, 1, 2].map((c) => (i0 + i1) * u[c]! + (j0 + j1) * v[c]!);
    quad(n, [corner(0, i0, j0), corner(0, i1, j1), corner(1, i1, j1), corner(1, i0, j0)]);
  }
  quad(w.map((c) => -c), S.map(([i, j]) => corner(0, i, j)).reverse());
  quad(w, S.map(([i, j]) => corner(1, i, j)));
  return { pos, nrm };
}

async function bike() {
  const M = bikeModel;
  const R = BIKE_RAW;
  const s = M.wheelRadius / R.tyre;
  const colour = Object.fromEntries(Object.entries(M.colours).map(([k, v]) => [k, linear(v)])) as Record<keyof typeof M.colours, number[]>;
  const out = { pos: [] as number[], nrm: [] as number[], col: [] as number[], joint: [] as number[] };
  const emit = (pos: number[], nrm: number[], part: Part, c: number[]) => {
    out.pos.push(...pos);
    out.nrm.push(...nrm);
    for (let i = 0; i < pos.length / 3; i++) out.col.push(...c), out.joint.push(JOINTS.indexOf(part));
  };
  const lower = ((R.saddleTop - R.ground) * s - M.build.saddle) / s; // raw units the saddle + post go down
  const [barBack, barUp] = [M.build.barBack / s, M.build.barUp / s];
  const counts: Record<string, number> = {};
  let grips: number[][] = [];
  for (const g of collect(await io.read(join(src, 'bicycle_poly-by-google.glb')))) {
    const mat = g.material.getName();
    if (mat === 'default_Mat') continue; // a flat plate on the stem (label spot): no logos
    // Connected components over the triangle soup (corners welded by position).
    const nTri = g.pos.length / 9;
    const par = Array.from({ length: nTri }, (_, i) => i);
    const find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i]!)));
    const seen = new Map<string, number>();
    for (let t = 0; t < nTri; t++) {
      for (let k = 0; k < 3; k++) {
        const key = [0, 1, 2].map((c) => g.pos[t * 9 + k * 3 + c]!.toFixed(2)).join();
        const o = seen.get(key);
        if (o === undefined) seen.set(key, t);
        else par[find(t)] = find(o);
      }
    }
    const comps = new Map<number, number[]>();
    for (let t = 0; t < nTri; t++) comps.set(find(t), [...(comps.get(find(t)) ?? []), t]);
    for (const tris of comps.values()) {
      const pts = tris.flatMap((t) => [0, 1, 2].map((k) => g.pos.slice(t * 9 + k * 3, t * 9 + k * 3 + 3)));
      const lo = [0, 1, 2].map((c) => Math.min(...pts.map((p) => p[c]!)));
      const hi = [0, 1, 2].map((c) => Math.max(...pts.map((p) => p[c]!)));
      const corners = [[lo[1]!, lo[2]!], [lo[1]!, hi[2]!], [hi[1]!, lo[2]!], [hi[1]!, hi[2]!]];
      const within = (c: readonly number[], r: number) => corners.every(([y, z]) => Math.hypot(y! - c[0]!, z! - c[1]!) <= r);
      const maxX = Math.max(-lo[0]!, hi[0]!);
      const near = (p: readonly number[], r: number) => [lo, hi].every((q) => Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!) <= r);
      const frontAxle = [R.front[0] + R.frontDrop, R.front[1]]; // before the drop
      let part: Part = 'frame';
      let f = (p: number[]) => p;
      const onAxle = (c: readonly number[]) => Math.hypot((lo[1]! + hi[1]!) / 2 - c[0]!, (lo[2]! + hi[2]!) / 2 - c[1]!) < 12 && hi[1]! - lo[1]! < 320 && hi[2]! - lo[2]! < 320;
      if (maxX <= 10 && (onAxle(R.rear) || onAxle(frontAxle))) {
        const front = onAxle(frontAxle);
        const axle = front ? R.front : R.rear;
        const [dy, dz] = [axle[0] - (lo[1]! + hi[1]!) / 2, axle[1] - (lo[2]! + hi[2]!) / 2]; // recentre on the axle
        part = front ? 'wheelF' : 'wheelR';
        f = ([x, y, z]) => [x!, y! + dy, z! + dz];
      } else if (near(R.pedal.l, 25) || near(R.pedal.r, 25)) {
        part = near(R.pedal.l, 25) ? 'pedalL' : 'pedalR';
        f = ([x, y, z]) => [x! * M.build.crankWidth, y!, z!];
      } else if (maxX <= 40 && within(R.bb, 90)) {
        part = 'crank';
        f = ([x, y, z]) => [x! * M.build.crankWidth, y!, z!];
      } else if (lo[2]! > 130) {
        part = 'fork';
        if (lo[1]! >= 240) f = ([x, y, z]) => [x!, y! - R.frontDrop + barUp, z! - barBack]; // bar + grips
        else if (lo[1]! >= 200) {
          f = ([x, y, z]) => {
            const t = (y! - R.stem[0]) / (R.stem[1] - R.stem[0]);
            return [x!, y! - R.frontDrop + t * barUp, z! - t * barBack];
          };
        } else f = ([x, y, z]) => [x!, y! - R.frontDrop, z!];
      } else if ((mat === 'Mat.3' || mat === 'Mat.4') && hi[2]! < 0 && lo[1]! > 140) {
        f = ([x, y, z]) => [x!, y! - lower, z!]; // saddle + seat post
      }
      const c =
        mat === 'Mat.1' ? colour.tyre
        : mat === 'Mat.3' ? colour.saddle
        : mat === 'Mat.2' ? (tris.length >= 130 ? colour.accent : colour.frame) // the two mudguards (131 / 132 triangles)
        : colour.metal; // Mat.4 spokes / hubs / post / bar / cranks, Mat (white) rims
      const toM = ([x, y, z]: number[]) => [x! * s, (y! - R.ground) * s, (z! - R.bb[1]) * s];
      const pos: number[] = [];
      const nrm: number[] = [];
      const kx = part === 'crank' || part.startsWith('pedal') ? M.build.crankWidth : 1;
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          const i = t * 9 + k * 3;
          pos.push(...toM(f(g.pos.slice(i, i + 3))));
          const n = [g.nrm[i]! / kx, g.nrm[i + 1]!, g.nrm[i + 2]!];
          nrm.push(...n.map((v) => v / (Math.hypot(...n) || 1)));
        }
      }
      if (mat === 'Mat.3' && part === 'fork') grips.push(toM(f([(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2])));
      emit(pos, nrm, part, c);
      counts[part] = (counts[part] ?? 0) + tris.length;
    }
  }
  grips = grips.sort((a, b) => b[0]! - a[0]!); // x > 0 = left first
  const P = (y: number, z: number, x = 0) => [x * s, (y - R.ground) * s, (z - R.bb[1]) * s];
  const at: Record<Part, number[]> = {
    frame: [0, 0, 0],
    fork: P(R.steerTop[0], R.steerTop[1]),
    wheelF: P(R.front[0], R.front[1]),
    wheelR: P(R.rear[0], R.rear[1]),
    crank: P(R.bb[0], R.bb[1]),
    pedalL: P(R.pedal.l[1], R.pedal.l[2], R.pedal.l[0] * M.build.crankWidth),
    pedalR: P(R.pedal.r[1], R.pedal.r[2], R.pedal.r[0] * M.build.crankWidth),
    stand: [0.06, 0.2, -0.08],
  };
  // Basket (fork): thin grey panels (bottom + 4 sides) and a green top rim, a bracket to the head tube.
  const { z: [z0, z1], y: [y0, y1], width } = M.build.basket;
  const [hw, th] = [width / 2, 0.006];
  const panel = (a: number[], b: number[], c: number[]) => emit(...(Object.values(bar(a, b, th)) as [number[], number[]]), 'fork', c);
  const box = (x0: number, x1: number, ya: number, yb: number, za: number, zb: number, c: number[]) => {
    const pos: number[] = [];
    const nrm: number[] = [];
    const [lo, hi] = [[x0, ya, za], [x1, yb, zb]];
    for (let a = 0; a < 3; a++) {
      for (const side of [0, 1]) {
        const [u, v] = [(a + 1) % 3, (a + 2) % 3];
        const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => {
          const p = [0, 0, 0];
          p[a] = (side ? hi : lo)[a]!;
          p[u] = (i ? hi : lo)[u]!;
          p[v] = (j ? hi : lo)[v]!;
          return p;
        });
        if (!side) q.reverse(); // counter-clockwise seen from outside
        const n = [0, 0, 0];
        n[a] = side ? 1 : -1;
        for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...q[k]!), nrm.push(...n);
      }
    }
    emit(pos, nrm, 'fork', c);
  };
  box(-hw, hw, y0, y0 + 2 * th, z0, z1, colour.frame); // bottom
  box(-hw, hw, y0, y1, z0, z0 + 2 * th, colour.frame); // back
  box(-hw, hw, y0, y1, z1 - 2 * th, z1, colour.frame); // front
  box(-hw, -hw + 2 * th, y0, y1, z0, z1, colour.frame); // sides
  box(hw - 2 * th, hw, y0, y1, z0, z1, colour.frame);
  const rim = [[-hw, z0], [hw, z0], [hw, z1], [-hw, z1]];
  for (let k = 0; k < 4; k++) panel([rim[k]![0]!, y1, rim[k]![1]!], [rim[(k + 1) % 4]![0]!, y1, rim[(k + 1) % 4]![1]!], colour.accent);
  const axis = [0, at.fork[1]! - at.wheelF[1]!, at.fork[2]! - at.wheelF[2]!];
  const onAxis = (y: number) => at.wheelF[2]! + ((y - at.wheelF[1]!) / axis[1]!) * axis[2]!; // head-tube z at height y
  panel([0, y0 + 0.03, onAxis(y0 + 0.03)], [0, y0 + 0.03, z0], colour.metal);
  panel([0, y1 - 0.03, onAxis(y1 - 0.03)], [0, y1 - 0.03, z0], colour.metal);
  // Kickstand (left, +x), built deployed: its tip touches the ground with the bike rolled standLeanDeg to the left.
  const lean = (M.standLeanDeg * Math.PI) / 180;
  const tipX = 0.19;
  const tip = [tipX, tipX * Math.tan(lean) + 0.012, -0.2];
  const leg = bar(at.stand, tip, 0.01);
  emit(leg.pos, leg.nrm, 'stand', colour.metal);
  // Folded: the leg turned onto the left chain stay (pointing back, level).
  const [d0, d1] = [tip.map((v, k) => v - at.stand[k]!), [0.02, 0.01, -1]].map((d) => d.map((c) => c / Math.hypot(...d)));
  const cr = [d0![1]! * d1![2]! - d0![2]! * d1![1]!, d0![2]! * d1![0]! - d0![0]! * d1![2]!, d0![0]! * d1![1]! - d0![1]! * d1![0]!];
  const half = Math.acos(Math.min(1, d0!.reduce((a, v, k) => a + v * d1![k]!, 0))) / 2;
  const fold = [...cr.map((c) => (c / Math.hypot(...cr)) * Math.sin(half)), Math.cos(half)];
  // Document: one skinned primitive.
  const doc = new Document();
  const buffer = doc.createBuffer();
  const acc = (type: 'VEC3' | 'VEC4' | 'MAT4', a: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>) => doc.createAccessor().setType(type).setArray(a).setBuffer(buffer);
  const n = out.pos.length / 3;
  const joints0 = new Uint8Array(n * 4);
  const weights0 = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) (joints0[i * 4] = out.joint[i]!), (weights0[i * 4] = 1);
  const mat = doc.createMaterial('bike').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.55).setMetallicFactor(0);
  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', acc('VEC3', new Float32Array(out.pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(out.nrm)))
    .setAttribute('COLOR_0', acc('VEC3', new Float32Array(out.col)))
    .setAttribute('JOINTS_0', acc('VEC4', joints0))
    .setAttribute('WEIGHTS_0', acc('VEC4', weights0));
  const nodes = Object.fromEntries(JOINTS.map((j) => [j, doc.createNode(j)])) as Record<Part, ReturnType<Document['createNode']>>;
  const parent: Record<Part, Part | null> = { frame: null, fork: 'frame', wheelF: 'fork', wheelR: 'frame', crank: 'frame', pedalL: 'crank', pedalR: 'crank', stand: 'frame' };
  for (const j of JOINTS) {
    const p = parent[j];
    nodes[j].setTranslation(at[j].map((v, k) => v - (p ? at[p][k]! : 0)) as [number, number, number]);
    if (p) nodes[p].addChild(nodes[j]);
  }
  const al = Math.hypot(...axis);
  const saddleZ = (R.sitZ - R.bb[1]) * s;
  nodes.frame.setExtras({ saddle: [0, M.build.saddle, saddleZ] });
  nodes.fork.setExtras({ steerAxis: axis.map((c) => c / al), gripL: grips[0]!.map((v, k) => v - at.fork[k]!), gripR: grips[1]!.map((v, k) => v - at.fork[k]!) });
  nodes.stand.setExtras({ fold });
  const ibm = new Float32Array(JOINTS.length * 16);
  JOINTS.forEach((j, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -at[j][0]!, -at[j][1]!, -at[j][2]!, 1], i * 16));
  const skin = doc.createSkin('bike').setSkeleton(nodes.frame).setInverseBindMatrices(acc('MAT4', ibm));
  for (const j of JOINTS) skin.addJoint(nodes[j]);
  doc.createScene('bike').addChild(nodes.frame).addChild(doc.createNode('bike').setMesh(doc.createMesh('bike').addPrimitive(prim)).setSkin(skin));
  const b = bounds([{ material: mat, pos: out.pos, nrm: [], uv: [] }]);
  console.log(`bike: ${JSON.stringify(counts)} tam giác / phần; dài ${(b.hi[2]! - b.lo[2]!).toFixed(2)} m, cao ${(b.hi[1]! - b.lo[1]!).toFixed(2)} m, yên ${M.build.saddle} m (hạ ${(lower * s).toFixed(3)} m)`);
  if (grips.length !== 2) throw new Error(`bike: ${grips.length} grips`);
  return doc;
}

// ═════ Phase 4B track A (docs/plans/phase4b.md §3.10, §6): NPC vehicles, Rocketbox pedestrians + clips ═════
type Mat4 = number[]; // column-major, like three / glTF
const compose = (p: number[], q: number[]): Mat4 => {
  const [x, y, z, w] = q as [number, number, number, number];
  const [xx, yy, zz, xy, xz, yz, wx, wy, wz] = [x * x, y * y, z * z, x * y, x * z, y * z, w * x, w * y, w * z].map((v) => 2 * v) as [number, number, number, number, number, number, number, number, number];
  return [1 - yy - zz, xy + wz, xz - wy, 0, xy - wz, 1 - xx - zz, yz + wx, 0, xz + wy, yz - wx, 1 - xx - yy, 0, p[0]!, p[1]!, p[2]!, 1];
};
const mul = (a: Mat4, b: Mat4): Mat4 => Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].reduce((s, k) => s + a[(i & 3) + 4 * k]! * b[k + 4 * (i >> 2)]!, 0));
const xform = (m: Mat4, v: number[], w = 1) => [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + w * m[12 + r]!);

/** Indexed primitive data: attribute arrays by glTF semantic + triangle indices. */
interface Mesh3 { attrs: Record<string, { type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4'; array: Float32Array | Uint16Array }>; index: Uint32Array }
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;

/** Welds a triangle soup (or an indexed mesh) and decimates it to about `target` triangles with meshopt. */
async function decimate(m: Partial<Mesh3> & Pick<Mesh3, 'attrs'>, target: number, error = 0.01): Promise<Mesh3> {
  const d = new Document();
  const buffer = d.createBuffer();
  const prim = d.createPrimitive();
  for (const [sem, a] of Object.entries(m.attrs)) prim.setAttribute(sem, d.createAccessor().setType(a.type).setArray(a.array as never).setBuffer(buffer));
  if (m.index) prim.setIndices(d.createAccessor().setType('SCALAR').setArray(m.index as never).setBuffer(buffer));
  d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(prim)));
  const n0 = m.index ? m.index.length / 3 : m.attrs.POSITION!.array.length / 9;
  await d.transform(weld());
  if (n0 > target) await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / n0, error, lockBorder: false }));
  const p = d.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  return {
    attrs: Object.fromEntries(p.listSemantics().map((s) => [s, { type: p.getAttribute(s)!.getType() as Mesh3['attrs'][string]['type'], array: p.getAttribute(s)!.getArray() as Float32Array | Uint16Array }])),
    index: Uint32Array.from(p.getIndices()!.getArray()!),
  };
}

const triCount = (m: Mesh3) => m.index.length / 3;

// ── Vehicles: 10 CarKinds → one GLB, a node per kind (name = kind). Source triangles → flat vertex colours (+ `_PAINT` = 1 on
// the body paint), scaled per axis to npc.vehicles[kind].dims, pivot = ground under the middle of the axles, nose +Z.
// The wheels are removed (axle centres + radius → node extras; the renderer draws one shared wheel); scooter / moto keep
// theirs and get a posed rider. extras: axles, wheelRadius, front (headlight centre), bodyBox (vehicle without rider).
interface Tri { p: number[]; n: number[]; c: number[]; mat: string; node: string } // 3 vertices, linear colour
const srgb = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const QUAT_PAINT = new Set(['LightBlue', 'Blue', 'White', 'Yellow']); // Quaternius car body materials
const chroma = (c: number[]) => Math.max(...c) - Math.min(...c);

interface Veh {
  file: string; // under src: .glb, or .fbx (rgsdev)
  wheel: RegExp | null; // wheel nodes (null: wheels stay on the body)
  paint: (t: Tri) => boolean;
  light: (t: Tri) => boolean; // the headlight triangles (extras.front)
  rot?: [number, number]; // rotate(ux, uz) so that the nose points to +Z
  rider?: { jacket: string; helmet: string; seat: [number, number]; lean: number }; // seat: [z, y] of the hips in final metres
}
const RG = 'free_low_poly_vehicles_pack_by_rgsdev/Free Low Poly Vehicles Pack by Rgsdev';
const quat = (file: string): Veh => ({ file, wheel: /Wheel/i, paint: (t) => QUAT_PAINT.has(t.mat), light: (t) => t.mat === 'Headlights' });
const rgs = (dir: string): Veh => ({ file: `${RG}/${dir}/${dir}.fbx`, wheel: /_wheel_/, paint: (t) => /^body /.test(t.mat) && !/black|white/.test(t.mat), light: (t) => t.mat === 'headlights' });
const VEHICLES: Record<keyof typeof npc.vehicles, Veh> = {
  city: quat('car-sedan-1_quaternius.glb'),
  sedan: quat('car-sedan-2_quaternius.glb'),
  suv: quat('suv_quaternius.glb'),
  taxi: quat('taxi_quaternius.glb'),
  truck: { file: 'truck-delivery_quaternius.glb', wheel: /Wheel/i, paint: (t) => Math.min(...t.c) > 0.4 || chroma(t.c) > 0.1, light: (t) => t.mat === 'Headlights' }, // the cargo box (the atlas' light grey) + the olive cab
  hatchback: rgs('Hatchback'),
  van: rgs('Van'),
  bus: rgs('Bus'),
  scooter: { file: 'scooter_poly-by-google.glb', wheel: null, paint: (t) => t.mat === '08___Default', light: (t) => t.mat === '01___Default', rider: { jacket: '#3a6ea5', helmet: '#e9e9e4', seat: [-0.35, 0.72], lean: 0 } },
  moto: { file: 'motorcycle_jeremy.glb', wheel: null, paint: (t) => t.mat === '455A64' || t.mat === '039BE5', light: (t) => t.mat === 'FFEB3B', rot: [0, -1], rider: { jacket: '#1c1c1e', helmet: '#151515', seat: [-0.38, 0.8], lean: 0.42 } },
};

/** Triangles of a source file, node transforms applied, with the colour of each (texture sampled at the UV centroid). */
async function readTris(file: string): Promise<Tri[]> {
  const out: Tri[] = [];
  if (file.endsWith('.fbx')) {
    for (const s of await inChrome((page) => readFbxSoup(page, join(src, file)))) {
      for (let t = 0; t < s.pos.length; t += 9) out.push({ p: s.pos.slice(t, t + 9), n: s.nrm.slice(t, t + 9), c: s.colour, mat: s.material, node: s.node });
    }
    return out;
  }
  const doc = await io.read(join(src, file));
  const tex = new Map<Texture, { data: Buffer; w: number; h: number }>();
  for (const node of doc.getRoot().listNodes()) {
    for (const g of collect(doc, [node])) {
      const t0 = g.material.getBaseColorTexture();
      if (t0 && !tex.has(t0)) {
        const r = await sharp(t0.getImage()!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        tex.set(t0, { data: r.data, w: r.info.width, h: r.info.height });
      }
      const im = t0 && tex.get(t0);
      for (let t = 0; t < g.pos.length; t += 9) {
        let c = g.material.getBaseColorFactor().slice(0, 3);
        if (im) {
          const [u, v] = [(g.uv[(t / 9) * 6]! + g.uv[(t / 9) * 6 + 2]! + g.uv[(t / 9) * 6 + 4]!) / 3, (g.uv[(t / 9) * 6 + 1]! + g.uv[(t / 9) * 6 + 3]! + g.uv[(t / 9) * 6 + 5]!) / 3];
          const i = (Math.min(im.h - 1, Math.floor(v * im.h)) * im.w + Math.min(im.w - 1, Math.floor(u * im.w))) * 4;
          c = [0, 1, 2].map((k) => srgb(im.data[i + k]! / 255));
        }
        out.push({ p: g.pos.slice(t, t + 9), n: g.nrm.slice(t, t + 9), c, mat: g.material.getName(), node: node.getName() });
      }
    }
  }
  return out;
}

const hexLinear = (hex: string) => linear(hex);

/** A flat-shaded UV sphere (latitude × longitude quads), as triangles. */
function sphere(c: number[], r: [number, number, number], colour: number[], seg = 10, ring = 6): Tri[] {
  const at = (i: number, j: number) => {
    const [a, b] = [(i / seg) * Math.PI * 2, (j / ring) * Math.PI];
    return [c[0]! + r[0] * Math.sin(b) * Math.cos(a), c[1]! + r[1] * Math.cos(b), c[2]! + r[2] * Math.sin(b) * Math.sin(a)];
  };
  const out: Tri[] = [];
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const [a, b, d, e] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      for (const q of j === 0 ? [[a, d, e]] : j === ring - 1 ? [[a, b, e]] : [[a, b, e], [b, d, e]]) {
        const n = [0, 1, 2].map((k) => (((q[0]![k]! + q[1]![k]! + q[2]![k]!) / 3 - c[k]!) / r[k]!) ** 1);
        const l = Math.hypot(...n);
        out.push({ p: q.flat(), n: [...n, ...n, ...n].map((v) => v / l), c: colour, mat: 'sphere', node: 'sphere' });
      }
    }
  }
  return out;
}

/** The player's body (UBC) posed as Driving_Loop at t = 0, skinned on the CPU, flat colours, helmet sphere; hips at the origin. */
async function riderTris(jacket: string, helmet: string) {
  const r = (await readBody()).getRoot();
  const skin = r.listSkins()[0]!;
  const joints = skin.listJoints();
  const ubc = joints.filter((j) => !j.getName().includes('_leaf'));
  const uald = (await io.read(UAL)).getRoot();
  const ual = uald.listSkins()[0]!.listJoints();
  const anim = uald.listAnimations().find((a) => a.getName() === 'Driving_Loop')!;
  const k = ubc[1]!.getTranslation()[2] / ual[1]!.getTranslation()[2];
  const rot = new Map<string, number[]>();
  let hips: number[] = [];
  for (const ch of anim.listChannels()) {
    const j = ual.indexOf(ch.getTargetNode()!);
    if (j < 1) continue; // not a skin joint, or the root
    const o = ch.getSampler()!.getOutput()!.getElement(0, []);
    if (ch.getTargetPath() === 'rotation') rot.set(ubc[j]!.getName(), o);
    else if (j === 1 && ch.getTargetPath() === 'translation') hips = o.map((v) => v * k);
  }
  const world = new Map<unknown, Mat4>();
  const worldOf = (n: (typeof joints)[number]): Mat4 => {
    if (!world.has(n)) {
      const name = n.getName();
      const local = rot.has(name) || (n === ubc[1] && hips.length) ? compose(n === ubc[1] ? hips : n.getTranslation(), rot.get(name) ?? n.getRotation()) : (n.getMatrix() as Mat4);
      const par = n.getParentNode();
      world.set(n, par ? mul(worldOf(par), local) : local);
    }
    return world.get(n)!;
  };
  const skinM = joints.map((j, i) => mul(worldOf(j), [...skin.getInverseBindMatrices()!.getElement(i, [] as number[])]));
  // the body mesh = the one with the most triangles
  const prim = r.listMeshes().flatMap((m) => m.listPrimitives()).sort((a, b) => b.getIndices()!.getCount() - a.getIndices()!.getCount())[0]!;
  const [P, NR, J, W, I] = [prim.getAttribute('POSITION')!, prim.getAttribute('NORMAL')!, prim.getAttribute('JOINTS_0')!, prim.getAttribute('WEIGHTS_0')!, prim.getIndices()!];
  const region = (name: string) =>
    /^(head|neck)/i.test(name) || /^(hand|index|middle|pinky|ring|thumb)/.test(name) ? 'skin'
    : /^(foot|ball)/.test(name) ? 'shoe'
    : /^(pelvis|thigh|calf)/.test(name) ? 'trousers'
    : 'jacket';
  const COL: Record<string, number[]> = { skin: hexLinear('#c18e6a'), shoe: hexLinear('#1d1d1f'), trousers: hexLinear('#2a3550'), jacket: hexLinear(jacket) };
  const verts = Array.from({ length: P.getCount() }, (_, i) => {
    const [p, n, j, w] = [P.getElement(i, []), NR.getElement(i, []), J.getElement(i, []), W.getElement(i, [])];
    const q = [0, 0, 0];
    const qn = [0, 0, 0];
    let best = 0;
    for (let c = 0; c < 4; c++) {
      if (w[c]! <= 0) continue;
      const m = skinM[j[c]!]!;
      xform(m, p).forEach((v, a) => (q[a]! += v * w[c]!));
      xform(m, n, 0).forEach((v, a) => (qn[a]! += v * w[c]!));
      if (w[c]! > w[best]!) best = c;
    }
    const l = Math.hypot(...qn) || 1;
    return { p: q, n: qn.map((v) => v / l), region: region(joints[j[best]!]!.getName()) };
  });
  const tris: Tri[] = [];
  for (let t = 0; t < I.getCount(); t += 3) {
    const v = [0, 1, 2].map((c) => verts[I.getScalar(t + c)]!);
    tris.push({ p: v.flatMap((x) => x.p), n: v.flatMap((x) => x.n), c: COL[v[0]!.region]!, mat: 'rider', node: 'rider' });
  }
  const head = verts.filter((v) => v.region === 'skin' && v.p[1]! > verts.reduce((m, x) => Math.max(m, x.p[1]!), -Infinity) - 0.3); // the head (the highest 0.3 m)
  const [lo, hi] = [0, 1, 2].map((a) => [Math.min(...head.map((v) => v.p[a]!)), Math.max(...head.map((v) => v.p[a]!))]).reduce((s, e) => [[...s[0]!, e[0]!], [...s[1]!, e[1]!]], [[], []] as number[][]) as [number[], number[]];
  tris.push(...sphere([0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2), [0, 1, 2].map((a) => ((hi[a]! - lo[a]!) / 2) * 1.2) as [number, number, number], hexLinear(helmet)));
  const pelvis = worldOf(ubc[1]!).slice(12, 15);
  const top = Math.max(...verts.map((v) => v.p[1]!));
  console.log(`rider: ${tris.length} tam giác, hông (${pelvis.map((v) => v.toFixed(2))}), cao ${top.toFixed(2)} m`);
  return { tris, pelvis };
}

async function npcVehicles() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('npc-vehicles');
  const mat = doc.createMaterial('npc-vehicle').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
  const acc = (type: 'SCALAR' | 'VEC3', a: Float32Array | Uint32Array) => doc.createAccessor().setType(type).setArray(a as never).setBuffer(buffer);
  for (const [kind, V] of Object.entries(VEHICLES) as [keyof typeof VEHICLES, Veh][]) {
    const [W, H, L] = npc.vehicles[kind].dims;
    let tris = await readTris(V.file);
    if (V.rot) for (const t of tris) for (const a of [t.p, t.n]) for (let i = 0; i < 9; i += 3) [a[i], a[i + 2]] = [a[i]! * V.rot[0] + a[i + 2]! * V.rot[1], -a[i]! * V.rot[1] + a[i + 2]! * V.rot[0]] as [number, number];
    // wheels: clusters by node and side of the centre line
    const isW = (t: Tri) => !!V.wheel?.test(t.node);
    const body = tris.filter((t) => !isW(t));
    const clusters = new Map<string, Tri[]>();
    for (const t of tris.filter(isW)) clusters.set(`${t.node}|${(t.p[0]! + t.p[3]! + t.p[6]!) / 3 >= 0}`, [...(clusters.get(`${t.node}|${(t.p[0]! + t.p[3]! + t.p[6]!) / 3 >= 0}`) ?? []), t]);
    const box = (ts: Tri[]) => {
      const [lo, hi] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
      for (const t of ts) for (let i = 0; i < 9; i++) (lo[i % 3] = Math.min(lo[i % 3]!, t.p[i]!)), (hi[i % 3] = Math.max(hi[i % 3]!, t.p[i]!));
      return { lo, hi };
    };
    const bb = box(body);
    const wheels = [...clusters.values()].map(box);
    const ground = wheels.length ? Math.min(...wheels.map((w) => w.lo[1]!)) : bb.lo[1]!;
    const s = [W / (bb.hi[0]! - bb.lo[0]!), H / (bb.hi[1]! - ground), L / (bb.hi[2]! - bb.lo[2]!)];
    const axleZ = wheels.length ? wheels.reduce((m, w) => m + (w.lo[2]! + w.hi[2]!) / 2, 0) / wheels.length : (bb.lo[2]! + bb.hi[2]!) / 2;
    const o = [(bb.lo[0]! + bb.hi[0]!) / 2, ground, axleZ];
    const place = (t: Tri): Tri => ({
      ...t,
      p: t.p.map((v, i) => (v - o[i % 3]!) * s[i % 3]!),
      n: [0, 3, 6].flatMap((v) => {
        const m = [0, 1, 2].map((k) => t.n[v + k]! / s[k]!); // normals follow the per-axis scale
        const l = Math.hypot(...m) || 1;
        return m.map((x) => x / l);
      }),
    });
    let placed = body.map(place);
    const axles = wheels.map((w) => [((w.lo[0]! + w.hi[0]!) / 2 - o[0]!) * s[0]!, ((w.lo[1]! + w.hi[1]!) / 2 - o[1]!) * s[1]!, ((w.lo[2]! + w.hi[2]!) / 2 - o[2]!) * s[2]!].map((v) => +v.toFixed(3)));
    // the vertical radius: the wheel then rests on y = 0 exactly (the z scale may differ a little, the wheel is drawn round)
    const wheelRadius = wheels.length ? +(wheels.reduce((m, w) => m + ((w.hi[1]! - w.lo[1]!) * s[1]!) / 2, 0) / wheels.length).toFixed(3) : 0;
    const lights = placed.filter(V.light);
    if (!lights.length) throw new Error(`npcVehicles ${kind}: no headlight triangles`);
    const front = [0, 1, 2].map((a) => +(lights.reduce((m, t) => m + (t.p[a]! + t.p[a + 3]! + t.p[a + 6]!) / 3, 0) / lights.length).toFixed(3));
    if (!V.rider && front[2]! <= 0) throw new Error(`npcVehicles ${kind}: headlights at z ${front[2]}, the nose is not +Z`);
    const bodyBox = box(placed);
    if (kind === 'taxi') {
      const top = bodyBox.hi[1]!;
      const [hw, hh, hl] = [0.22, 0.09, 0.11];
      const cz = (bodyBox.lo[2]! + bodyBox.hi[2]!) / 2 - 0.3;
      const white = hexLinear('#f4f4ef');
      const q = (c: number[], r: number[]) => sphere(c, r as [number, number, number], white, 8, 4);
      placed.push(...q([0, top + hh * 0.3, cz], [hw, hh, hl])); // TAXI roof lamp
    }
    const paintOf = new Set(placed.filter(V.paint));
    let rider: Tri[] = [];
    if (V.rider) {
      const R = await riderTris(V.rider.jacket, V.rider.helmet);
      const [sz, sy] = V.rider.seat;
      const lean = V.rider.lean;
      const [cs, sn] = [Math.cos(lean), Math.sin(lean)];
      // hips → the seat, leaning forward about them (+ = toward the nose)
      const seat = (v: number[]) => {
        const d = v.map((c, k) => c - R.pelvis[k]!);
        return [d[0]!, d[1]! * cs - d[2]! * sn + sy, d[1]! * sn + d[2]! * cs + sz];
      };
      const tilt = (v: number[]) => [v[0]!, v[1]! * cs - v[2]! * sn, v[1]! * sn + v[2]! * cs];
      const each = (a: number[], f: (v: number[]) => number[]) => Array.from({ length: a.length / 3 }, (_, i) => f(a.slice(i * 3, i * 3 + 3))).flat();
      rider = R.tris.map((t) => ({ ...t, p: each(t.p, seat), n: each(t.n, tilt) }));
    }
    const target = kind === 'bus' || kind === 'truck' ? npcAssets.maxTris.big : npcAssets.maxTris.car * (V.rider ? 0.85 : 1); // meshopt stops a little above its target
    const flat = (ts: Tri[], paint: Set<Tri>) => ({
      POSITION: { type: 'VEC3' as const, array: Float32Array.from(ts.flatMap((t) => t.p)) },
      NORMAL: { type: 'VEC3' as const, array: Float32Array.from(ts.flatMap((t) => t.n)) },
      COLOR_0: { type: 'VEC3' as const, array: Float32Array.from(ts.flatMap((t) => (paint.has(t) ? [1, 1, 1, 1, 1, 1, 1, 1, 1] : [...t.c, ...t.c, ...t.c]))) },
      _PAINT: { type: 'SCALAR' as const, array: Float32Array.from(ts.flatMap((t) => (paint.has(t) ? [1, 1, 1] : [0, 0, 0]))) },
    });
    const parts = [await decimate({ attrs: flat(placed, paintOf) }, target, 0.05)];
    if (rider.length) parts.push(await decimate({ attrs: flat(rider, new Set()) }, npcAssets.maxTris.rider * 0.9, 0.05));
    const prim = doc.createPrimitive().setMaterial(mat);
    let offset = 0;
    const idx: number[] = [];
    for (const m of parts) (idx.push(...Array.from(m.index, (i) => i + offset)), (offset += m.attrs.POSITION!.array.length / 3));
    for (const sem of Object.keys(parts[0]!.attrs)) {
      const len = COMPONENTS[parts[0]!.attrs[sem]!.type];
      const a = new Float32Array(offset * len);
      let at = 0;
      for (const m of parts) (a.set(m.attrs[sem]!.array, at), (at += m.attrs[sem]!.array.length));
      prim.setAttribute(sem, acc(parts[0]!.attrs[sem]!.type as 'SCALAR' | 'VEC3', a));
    }
    prim.setIndices(acc('SCALAR', Uint32Array.from(idx)));
    const n = doc.createNode(kind).setMesh(doc.createMesh(kind).addPrimitive(prim)).setExtras({
      axles, wheelRadius, front, rider: !!V.rider, bodyBox: [...bodyBox.lo, ...bodyBox.hi].map((v) => +v.toFixed(3)),
    });
    scene.addChild(n);
    console.log(`npc-vehicles: ${kind} ${parts.map(triCount).join(' + ')} tam giác, ${axles.length} trục r ${wheelRadius}, front z ${front[2]}`);
  }
  return doc;
}

// ── Rocketbox avatars (MIT, © 2020 Microsoft): FBX read in Chrome (scripts/fbx.ts), bones ×0.01, 3 textures → one 2048²
// atlas (body | head / opacity), groups merged into one skinned primitive with one MASK material; LOD0 + LOD1.
const RB = join(src, 'rocketbox/Assets');
const AVATARS = [
  { dir: 'Avatars/Adults/Male_Adult_08', name: 'Male_Adult_08', tex: 'm014', gender: 'm' },
  { dir: 'Avatars/Adults/Female_Adult_05', name: 'Female_Adult_05', tex: 'f005', gender: 'f' },
  { dir: 'Avatars/Professions/Business_Male_01', name: 'Business_Male_01', tex: 'm005', gender: 'm' },
  { dir: 'Avatars/Professions/Business_Female_01', name: 'Business_Female_01', tex: 'f014', gender: 'f' },
] as const;
const CM = 0.01;
const FACE_BONE = /^Bip01_[LRM][A-Z]/; // the 28 face bones (body bones are Bip01_L_*, Bip01_R_*)

/** TGA → RGBA pixels at `size`² (macOS sips reads TGA; alpha kept). */
async function readTga(file: string, size: number, opaque: boolean) {
  const tmp = mkdtempSync(join(tmpdir(), 'rb-'));
  try {
    execFileSync('sips', ['-s', 'format', 'png', file, '--out', join(tmp, 't.png')], { stdio: 'ignore' });
    let img = sharp(join(tmp, 't.png')).resize(size, size);
    img = opaque ? img.removeAlpha().ensureAlpha(1) : img.ensureAlpha();
    return await img.raw().toBuffer();
  } finally {
    rmSync(tmp, { recursive: true });
  }
}

async function npcPeds() {
  const N = npcAssets;
  const tile = N.atlas / 2;
  const raws = await inChrome(async (page) => {
    const r: RawAvatar[] = [];
    for (const a of AVATARS) r.push(await readFbxAvatar(page, join(RB, a.dir, 'Export', `${a.name}.fbx`)));
    return r;
  });
  copyFileSync(join(RB, '../LICENSE.md'), join(out, 'LICENSE-rocketbox.md')); // MIT: the notice must ship with the models
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('npc-peds');
  const acc = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4', a: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(a as never).setBuffer(buffer);
  for (const [ai, a] of AVATARS.entries()) {
    const raw = raws[ai]!;
    // atlas: body (top left) | head (top right) / opacity (bottom left); alpha only in the opacity tile
    const px = await Promise.all((['body', 'head', 'opacity'] as const).map((k) => readTga(join(RB, a.dir, 'Textures', `${a.tex}_${k}_color.tga`), tile, k !== 'opacity')));
    const atlas = sharp({ create: { width: N.atlas, height: N.atlas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).composite(
      px.map((input, i) => ({ input, raw: { width: tile, height: tile, channels: 4 as const }, left: (i % 2) * tile, top: Math.floor(i / 2) * tile })),
    );
    const image = new Uint8Array(await atlas.webp({ quality: 85, alphaQuality: 100 }).toBuffer());
    const tex = doc.createTexture(`${a.name}_atlas`).setImage(image).setMimeType('image/webp');
    const mat = doc.createMaterial(a.name).setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(0.5).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
    // geometry: bind matrix and ×0.01 baked in (the glTF mesh node is the identity), UVs → atlas tiles, V flipped to glTF
    const [P, Nr, UV, SW] = [unb64(raw.pos, Float32Array), unb64(raw.nrm, Float32Array), unb64(raw.uv, Float32Array), unb64(raw.skinWeight, Float32Array)];
    const SI = unb64(raw.skinIndex, Uint16Array);
    const n = P.length / 3;
    const [pos, nrm, uv] = [new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 2)];
    for (let i = 0; i < n; i++) {
      pos.set(xform(raw.bind, [P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!]).map((v) => v * CM), i * 3);
      nrm.set(xform(raw.bind, [Nr[i * 3]!, Nr[i * 3 + 1]!, Nr[i * 3 + 2]!], 0), i * 3);
    }
    for (const g of raw.groups) {
      const k = (['body', 'head', 'opacity'] as const).findIndex((s) => g.material.endsWith(s));
      if (k < 0) throw new Error(`npcPeds: material ${g.material}`);
      for (let i = g.start; i < g.start + g.count; i++) {
        const [u, v] = [Math.min(1, Math.max(0, UV[i * 2]!)), Math.min(1, Math.max(0, 1 - UV[i * 2 + 1]!))];
        uv.set([((k % 2) + u) / 2, (Math.floor(k / 2) + v) / 2], i * 2);
      }
    }
    // skeleton (cm → m) and its check against the file's inverse bind matrices
    const group = doc.createNode(`ped_${ai}`).setExtras({ gender: a.gender, avatar: a.name, height: 0 });
    const nodes = new Map(raw.bones.map((b) => [b.name, doc.createNode(b.name).setTranslation(b.p.map((v) => v * CM) as [number, number, number]).setRotation(b.q as [number, number, number, number])]));
    const byName = new Map(raw.bones.map((b) => [b.name, b]));
    const world = new Map<string, Mat4>(); // bones come in file order: a parent may follow its child
    const worldOf = (b: (typeof raw.bones)[number]): Mat4 => {
      if (!world.has(b.name)) {
        const local = compose(b.p.map((v) => v * CM), b.q);
        world.set(b.name, b.parent ? mul(worldOf(byName.get(b.parent)!), local) : local);
      }
      return world.get(b.name)!;
    };
    for (const b of raw.bones) {
      (b.parent ? nodes.get(b.parent)! : group).addChild(nodes.get(b.name)!);
      worldOf(b);
    }
    const ibm = unb64(raw.inverses, Float32Array);
    const joints = raw.bones.slice(raw.skin);
    let err = 0;
    joints.forEach((b, j) => {
      for (const t of [12, 13, 14]) ibm[j * 16 + t]! *= CM;
      const m = mul(world.get(b.name)!, [...ibm.slice(j * 16, j * 16 + 16)]);
      m.forEach((v, i) => (err = Math.max(err, Math.abs(v - Number(i % 5 === 0)))));
    });
    if (err > 2e-3) throw new Error(`npcPeds ${a.name}: bind pose ≠ inverse bind matrices (${err.toFixed(4)})`);
    const skin = doc.createSkin(a.name).setSkeleton(nodes.get(raw.bones[0]!.name)!).setInverseBindMatrices(acc('MAT4', ibm));
    for (const b of joints) skin.addJoint(nodes.get(b.name)!);
    // LODs
    const full: Mesh3['attrs'] = {
      POSITION: { type: 'VEC3', array: pos }, NORMAL: { type: 'VEC3', array: nrm }, TEXCOORD_0: { type: 'VEC2', array: uv },
      JOINTS_0: { type: 'VEC4', array: SI }, WEIGHTS_0: { type: 'VEC4', array: SW },
    };
    const lod0 = await decimate({ attrs: full }, Infinity);
    const lod1 = await decimate({ attrs: lod0.attrs, index: lod0.index }, Math.min(N.lod1Ratio * triCount(lod0), 0.97 * N.maxTris.pedLod1), 0.05);
    for (const [lod, m] of [lod0, lod1].entries()) {
      const prim = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', m.index));
      for (const [s, at] of Object.entries(m.attrs)) prim.setAttribute(s, acc(at.type, at.array));
      group.addChild(doc.createNode(`${a.name}_lod${lod}`).setMesh(doc.createMesh(`${a.name}_lod${lod}`).addPrimitive(prim)).setSkin(skin).setExtras({ lod }));
      console.log(`npc-peds: ${a.name} LOD${lod} ${triCount(m)} tam giác`);
    }
    const ys = Array.from({ length: n }, (_, i) => pos[i * 3 + 1]!);
    group.setExtras({ gender: a.gender, avatar: a.name, height: +(Math.max(...ys) - Math.min(...ys)).toFixed(3) });
    scene.addChild(group);
  }
  return doc;
}

// Clips: the 14 files of §2.3, names m_* / f_*. Only Bip01 / Bip01_Pelvis positions (Bip01 x / z dropped: walk in place,
// root speed → extras.speed) + body-bone rotations; face bones, Footsteps, MotionExtractionHelper, scale tracks dropped.
const CLIP_FILES: [string, string, string][] = [
  ['walk', 'xy', 'walk_neutral_01'], ['stroll', 'xy', 'walk_stroll_01'], ['idle', 'static', 'idle_neutral_01'],
  ['lookAround', 'static', 'idle_look_around_01'], ['phone', 'static', 'cell_phone_talk_01'], ['sit', 'static', 'sit_chair_idle_neutral_01'], ['wave', 'static', 'wave_01'],
];

async function npcPedAnims() {
  const raws = await inChrome(async (page) => {
    const r: { name: string; duration: number; tracks: RawClip['tracks'] }[] = [];
    for (const g of ['m', 'f']) {
      for (const [name, folder, file] of CLIP_FILES) {
        const dir = g === 'f' && file.startsWith('cell_phone') ? 'xyz' : folder; // the f_ phone clip only exists extracted as xyz
        r.push({ name: `${g}_${name}`, ...(await readFbxClip(page, join(RB, 'Animations', `all_animations_max_motextr_${dir}`, `${g}_${file}.max.fbx`))) });
      }
    }
    return r;
  });
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('npc-ped-anims');
  const nodes = new Map<string, ReturnType<Document['createNode']>>();
  const node = (n: string) => {
    let x = nodes.get(n);
    if (!x) scene.addChild((x = doc.createNode(n))), nodes.set(n, x);
    return x;
  };
  const acc = (type: 'SCALAR' | 'VEC3' | 'VEC4', a: Float32Array) => doc.createAccessor().setType(type).setArray(a as never).setBuffer(buffer);
  for (const c of raws) {
    const anim = doc.createAnimation(c.name);
    let rootZ = 0;
    for (const t of c.tracks) {
      const [bone, path] = t.name.split('.') as [string, 'position' | 'quaternion'];
      if (bone === 'Bip01_Footsteps' || FACE_BONE.test(bone)) continue;
      if (path === 'position' && bone !== 'Bip01' && bone !== 'Bip01_Pelvis') continue;
      const [times, values] = [unb64(t.times, Float32Array), unb64(t.values, Float32Array)];
      if (path === 'position') {
        if (bone === 'Bip01') rootZ = (values[values.length - 1]! - values[2]!) * CM;
        for (let i = 0; i < values.length; i += 3) {
          values[i + 1]! *= CM;
          if (bone === 'Bip01') (values[i] = 0), (values[i + 2] = 0);
          else (values[i] = values[i]! * CM), (values[i + 2] = values[i + 2]! * CM);
        }
      }
      const sampler = doc.createAnimationSampler().setInput(acc('SCALAR', times)).setOutput(acc(path === 'position' ? 'VEC3' : 'VEC4', values)).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node(bone)).setTargetPath(path === 'position' ? 'translation' : 'rotation').setSampler(sampler));
    }
    anim.setExtras({ duration: c.duration, speed: +(rootZ / c.duration).toFixed(3) });
  }
  await doc.transform(resample(), dedup());
  console.log(`npc-ped-anims: ${raws.map((c) => `${c.name} ${c.duration.toFixed(2)}s`).join(', ')}`);
  return doc;
}

mkdirSync(out, { recursive: true });
const BUILDS = [['eiffel', eiffel], ['arc', arc], ['player', player], ['player-anims', playerAnims], ['bike', bike], ['npc-vehicles', npcVehicles], ['npc-peds', npcPeds], ['npc-ped-anims', npcPedAnims]] as const;
for (const [name, build] of BUILDS.filter(([n]) => !only.length || only.includes(n))) {
  const doc = await build();
  await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = join(out, `${name}.glb`);
  writeFileSync(file, await io.writeBinary(doc));
  const bytes = statSync(file).size;
  console.log(`${file}: ${tris(doc).toLocaleString()} tam giác, ${(bytes / 2 ** 20).toFixed(2)} MB`);
  if (bytes > MAX_BYTES) throw new Error(`${file} > 25 MB`);
}
const playerBytes = ['player', 'player-anims'].reduce((s, n) => s + (existsSync(join(out, `${n}.glb`)) ? statSync(join(out, `${n}.glb`)).size : 0), 0);
if (playerBytes > 2 * 2 ** 20) throw new Error(`player*.glb ${(playerBytes / 2 ** 20).toFixed(2)} MB > 2 MB (docs/plans/phase3.md §8)`);

// credits.json: every downloaded asset (manifest.json written by the download step) + the map data. Each line = a
// Vietnamese usage label + the manifest attribution (its own label prefix dropped); "(đã chỉnh sửa)" only on the files
// this script modifies (the others are not processed or used yet: Phase 3 / 4B re-run this with their files added).
type Entry = { name: string; pageUrl: string; licence: string; author: string; attribution: string; usedFor: string };
// ped-*_quaternius (the first NPC pedestrians) are not used: Rocketbox replaced them (docs/plans/phase4b.md §3.10).
const ROCKETBOX: Entry = {
  name: 'rocketbox',
  pageUrl: 'https://github.com/microsoft/Microsoft-Rocketbox',
  licence: 'MIT',
  author: 'Microsoft',
  attribution: 'Người đi đường: "Microsoft Rocketbox Avatar Library" – © 2020 Microsoft, MIT, qua GitHub (đã chỉnh sửa)',
  usedFor: 'Pedestrian NPC: 4 avatars + 14 animations (LICENSE-rocketbox.md ships with the models)',
};
const all = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8')) as Entry[];
const manifest = [...all.filter((e) => !e.name.startsWith('ped-')), ...(all.some((e) => e.name === 'rocketbox') ? [] : [ROCKETBOX])];
// read by eiffel() / arc() / player() / playerAnims() / bike() / npcVehicles() (scooter, moto) / npcPeds() above (the CC0 attributions carry no "(đã chỉnh sửa)" to keep)
const MODIFIED = new Set(['eiffel_scott-marshall.glb', 'arc-triomphe_hoanghiepvu.glb', 'Universal Base Characters[Standard].zip', 'universal_animation_librarystandard.zip', 'bicycle_poly-by-google.glb', 'scooter_poly-by-google.glb', 'motorcycle_jeremy.glb', 'rocketbox']);
const LABELS: [RegExp, string][] = [
  [/^eiffel_/, 'Tháp Eiffel'],
  [/^arc-triomphe_/, 'Khải Hoàn Môn'],
  [/^car-sedan-(\d)_/, 'Xe NPC (sedan $1)'],
  [/^(free_low_poly_vehicles|suv|taxi|truck)/, 'Xe NPC'],
  [/^(scooter|motorcycle)_/, 'Xe máy NPC'],
  [/^bicycle_/, 'Xe đạp'],
  [/^rocketbox/, 'Người đi đường'],
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
