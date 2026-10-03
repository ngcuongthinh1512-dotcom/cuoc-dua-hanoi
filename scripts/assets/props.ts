// Phase 8C track T2 (docs/plans/phase8c-graphics.md #4; SPEC §17.20: no Wallace fountain, no pigeons yet): Paris street
// furniture → client/public/models/props.glb, one root node per prop kind (client/src/world/StreetProps.ts PROP_MODELS) at
// two levels of detail: `<kind>` and `<kind>_lod1` (same material, fewer triangles). Local frame: metres, foot at y = 0,
// centred on the footprint, front (the side people use) toward +z.
//   lamp        polyhaven/street_lamp_01 (CC0): cast-iron lamp, × props8c.lampScale
//   morris      sketchfab/french_colonne_morris (CC BY): the scanned cap + plinth; the scanned (modern, copyrighted) posters
//               are cut away and replaced by a cylinder of Belle Époque posters (commons/posters, PD / CC0)
//   shelter     sketchfab/abribus_bus_stop_bus_station (CC BY)
//   bench       sketchfab/mini_paris_bench (CC BY): its paving slab cut away
//   bouquiniste sketchfab/bouquinistes (CC BY): one stretch of the scanned row of stalls, ground and stands cut away
//   cafe        polyhaven/outdoor_table_chair_set_01 (CC0): table + 2 chairs
// Every prop's opaque materials are packed into one atlas (one draw call per level); blended glass stays apart.
// Also exports the triangle-soup helpers flamme.ts uses.
import { readFileSync } from 'node:fs';
import { Document, type Material, type Primitive } from '@gltf-transform/core';
import { compactPrimitive, meshopt, prune, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { props as PC } from '../../client/src/config.ts';
import { type Ctx, glbIO, type Target, writePublic } from './pipeline.ts';

// ── triangle soups: world-space, non-indexed triangles per material (easy to crop / move / merge) ──

export interface Mat { color: number[]; image?: Buffer; metal: number; rough: number; blend: boolean }
export interface Soup { mat: Mat; pos: number[]; nrm: number[]; uv: number[] }

/** Every triangle of a glTF / GLB file in world space, grouped per source material (KHR_texture_transform ignored). */
export async function readSoups(path: string): Promise<Soup[]> {
  const io = glbIO();
  await MeshoptDecoder.ready;
  const doc = path.endsWith('.gltf') ? await io.read(path) : await io.readBinary(new Uint8Array(readFileSync(path)));
  const mats = new Map<Material, Soup>();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (!mat || prim.getMode() !== 4) continue;
      let s = mats.get(mat);
      if (!s) {
        const img = mat.getBaseColorTexture()?.getImage();
        s = { mat: { color: mat.getBaseColorFactor(), image: img ? Buffer.from(img) : undefined, metal: mat.getMetallicFactor(), rough: mat.getRoughnessFactor(), blend: mat.getAlphaMode() === 'BLEND' }, pos: [], nrm: [], uv: [] };
        mats.set(mat, s);
      }
      const [P, N, T, I] = [prim.getAttribute('POSITION')!, prim.getAttribute('NORMAL'), prim.getAttribute('TEXCOORD_0'), prim.getIndices()];
      const n = I ? I.getCount() : P.getCount();
      const v = [0, 0, 0];
      const t = [0, 0];
      for (let k = 0; k < n; k++) {
        const i = I ? I.getScalar(det < 0 ? k - (k % 3) + [0, 2, 1][k % 3]! : k) : k;
        P.getElement(i, v);
        s.pos.push(...[0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]!));
        if (N) N.getElement(i, v);
        else v.splice(0, 3, 0, 1, 0);
        const w = [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]!);
        const l = Math.hypot(...w) || 1;
        s.nrm.push(w[0]! / l, w[1]! / l, w[2]! / l);
        if (T) T.getElement(i, t);
        s.uv.push(T ? t[0]! : 0, T ? t[1]! : 0);
      }
    }
  }
  return [...mats.values()];
}

const tris = (soups: Soup[]) => soups.reduce((n, s) => n + s.pos.length / 9, 0);

/** Keeps the triangles whose centroid passes `keep(x, y, z)`. */
export function crop(soups: Soup[], keep: (x: number, y: number, z: number) => boolean): Soup[] {
  return soups
    .map((s) => {
      const o: Soup = { mat: s.mat, pos: [], nrm: [], uv: [] };
      for (let t = 0; t < s.pos.length; t += 9) {
        const p = s.pos;
        if (!keep((p[t]! + p[t + 3]! + p[t + 6]!) / 3, (p[t + 1]! + p[t + 4]! + p[t + 7]!) / 3, (p[t + 2]! + p[t + 5]! + p[t + 8]!) / 3)) continue;
        o.pos.push(...p.slice(t, t + 9));
        o.nrm.push(...s.nrm.slice(t, t + 9));
        o.uv.push(...s.uv.slice((t / 3) * 2, (t / 3) * 2 + 6));
      }
      return o;
    })
    .filter((s) => s.pos.length);
}

/** p → R_y(yaw) · (scale ⊙ (p − from)) + to (normals by the inverse-transpose); a mirroring scale flips the winding. */
export function move(soups: Soup[], o: { from?: number[]; scale?: number[]; yaw?: number; to?: number[] }): Soup[] {
  const [f, s, t] = [o.from ?? [0, 0, 0], o.scale ?? [1, 1, 1], o.to ?? [0, 0, 0]];
  const [c, n] = [Math.cos(o.yaw ?? 0), Math.sin(o.yaw ?? 0)];
  const rot = (x: number, y: number, z: number) => [c * x + n * z, y, -n * x + c * z];
  const flip = s[0]! * s[1]! * s[2]! < 0;
  return soups.map((q) => {
    const r: Soup = { mat: q.mat, pos: [], nrm: [], uv: [...q.uv] };
    for (let i = 0; i < q.pos.length; i += 3) {
      const p = rot((q.pos[i]! - f[0]!) * s[0]!, (q.pos[i + 1]! - f[1]!) * s[1]!, (q.pos[i + 2]! - f[2]!) * s[2]!);
      r.pos.push(p[0]! + t[0]!, p[1]! + t[1]!, p[2]! + t[2]!);
      const w = rot(q.nrm[i]! / s[0]!, q.nrm[i + 1]! / s[1]!, q.nrm[i + 2]! / s[2]!);
      const l = Math.hypot(...w) || 1;
      r.nrm.push(w[0]! / l, w[1]! / l, w[2]! / l);
    }
    if (flip) for (let i = 0; i < r.pos.length; i += 9) for (const a of [r.pos, r.nrm]) for (let k = 0; k < 3; k++) [a[i + 3 + k], a[i + 6 + k]] = [a[i + 6 + k]!, a[i + 3 + k]!];
    if (flip) for (let i = 0; i < r.uv.length; i += 6) for (let k = 0; k < 2; k++) [r.uv[i + 2 + k], r.uv[i + 4 + k]] = [r.uv[i + 4 + k]!, r.uv[i + 2 + k]!];
    return r;
  });
}

export function bounds(soups: Soup[]) {
  const [lo, hi] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const s of soups) for (let i = 0; i < s.pos.length; i++) [lo[i % 3], hi[i % 3]] = [Math.min(lo[i % 3]!, s.pos[i]!), Math.max(hi[i % 3]!, s.pos[i]!)];
  return { lo, hi };
}

/** Vertices of the soups as [x, y, z] (for profiles / axes). */
const verts = (soups: Soup[]) => soups.flatMap((s) => Array.from({ length: s.pos.length / 3 }, (_, i) => [s.pos[3 * i]!, s.pos[3 * i + 1]!, s.pos[3 * i + 2]!] as const));
const median = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1] ?? 0;

/** Opaque soups → one soup on a shelf-packed atlas (`size` px wide): textured ones get a cell of ≤ cell px (their uv must
 *  lie in [0, 1], else they stay apart), plain colours an 8 px swatch; colour factors are multiplied into the pixels.
 *  Blended soups pass through. */
export async function atlas(soups: Soup[], size: number, cell: number): Promise<Soup[]> {
  const inUnit = (s: Soup) => s.uv.every((u) => u >= -0.002 && u <= 1.002);
  const pack = soups.filter((s) => !s.mat.blend && (!s.mat.image || inUnit(s)));
  if (pack.length < 2) return soups;
  const items = await Promise.all(
    pack.map(async (s) => {
      const [r, g, b] = s.mat.color.map((c) => Math.round(255 * Math.min(1, c ** (1 / 2.2)))); // linear factor → sRGB
      if (!s.mat.image) return { s, w: 8, h: 8, png: await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: r!, g: g!, b: b! } } }).png().toBuffer() };
      const meta = await sharp(s.mat.image).metadata();
      const k = Math.min(1, cell / Math.max(meta.width!, meta.height!));
      const [w, h] = [Math.max(8, Math.round(meta.width! * k)), Math.max(8, Math.round(meta.height! * k))];
      let img = sharp(s.mat.image).resize(w, h, { fit: 'fill' }).removeAlpha();
      if (s.mat.color.slice(0, 3).some((c) => c < 0.999)) img = img.linear(s.mat.color.slice(0, 3).map((c) => c ** (1 / 2.2)), [0, 0, 0]);
      return { s, w, h, png: await img.png().toBuffer() };
    }),
  );
  // shelf packing, tallest first; 2 px gutter
  const order = [...items].sort((p, q) => q.h - p.h || q.w - p.w);
  let [x, y, rowH] = [0, 0, 0];
  const at = new Map<(typeof items)[number], [number, number]>();
  for (const it of order) {
    if (x + it.w > size) [x, y, rowH] = [0, y + rowH + 2, 0];
    at.set(it, [x, y]);
    x += it.w + 2;
    rowH = Math.max(rowH, it.h);
  }
  const H = 2 ** Math.ceil(Math.log2(y + rowH));
  const image = await sharp({ create: { width: size, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .composite(items.map((it) => ({ input: it.png, left: at.get(it)![0], top: at.get(it)![1] })))
    .png()
    .toBuffer();
  const out: Soup = { mat: { color: [1, 1, 1, 1], image, metal: 0, rough: 0, blend: false }, pos: [], nrm: [], uv: [] };
  const area = (s: Soup) => s.pos.length; // weight of each source in the merged metal / roughness
  const total = items.reduce((n, it) => n + area(it.s), 0);
  for (const it of items) {
    const [ax, ay] = at.get(it)!;
    const half = it.s.mat.image ? 0 : 0.5;
    for (const x of it.s.pos) out.pos.push(x);
    for (const x of it.s.nrm) out.nrm.push(x);
    for (let i = 0; i < it.s.uv.length; i += 2) {
      const [u, v] = it.s.mat.image ? [it.s.uv[i]!, it.s.uv[i + 1]!] : [half, half];
      out.uv.push((ax + 0.5 + u * (it.w - 1)) / size, (ay + 0.5 + v * (it.h - 1)) / H);
    }
    out.mat.metal += (it.s.mat.metal * area(it.s)) / total;
    out.mat.rough += (it.s.mat.rough * area(it.s)) / total;
  }
  return [out, ...soups.filter((s) => !pack.includes(s))];
}

/** Writes `entries` (name → soups, triangle budget) as one GLB: one root node per entry, every soup a primitive (welded,
 *  simplified toward the budget), materials shared between entries that share a Mat, textures WebP ≤ texSize. */
export async function writeGlb(rel: string, entries: { name: string; soups: Soup[]; maxTris: number; error?: number; permissive?: boolean }[], texSize: number, log: (s: string) => void) {
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('props');
  const mats = new Map<Mat, Material>();
  const material = async (m: Mat) => {
    let x = mats.get(m);
    if (x) return x;
    // the sources' metal / roughness maps are not carried over: plain dielectric, matte (no env map to reflect yet)
    x = doc.createMaterial(`m${mats.size}`).setBaseColorFactor(m.color as [number, number, number, number]).setMetallicFactor(0).setRoughnessFactor(m.blend ? 0.1 : Math.min(1, Math.max(0.55, m.rough)));
    if (m.blend) x.setAlphaMode('BLEND').setDoubleSided(true);
    if (m.image) {
      const webp = await sharp(m.image).resize(texSize, texSize, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      x.setBaseColorTexture(doc.createTexture(`t${mats.size}`).setImage(new Uint8Array(webp)).setMimeType('image/webp'));
    }
    mats.set(m, x);
    return x;
  };
  for (const e of entries) {
    const mesh = doc.createMesh(e.name);
    const n = tris(e.soups);
    const prims: Primitive[] = [];
    for (const s of e.soups) {
      const acc = (data: number[], type: 'VEC3' | 'VEC2') => doc.createAccessor().setType(type).setArray(new Float32Array(data)).setBuffer(buffer);
      const prim = doc.createPrimitive().setAttribute('POSITION', acc(s.pos, 'VEC3')).setAttribute('NORMAL', acc(s.nrm, 'VEC3')).setAttribute('TEXCOORD_0', acc(s.uv, 'VEC2')).setMaterial(await material(s.mat));
      weldPrimitive(prim);
      if (n > e.maxTris) {
        // scans are cut into hundreds of uv islands whose seams stop a plain simplify above the budget; Permissive collapses
        // across them (texture smears: only for the far level)
        const I = prim.getIndices()!;
        const pos = prim.getAttribute('POSITION')!.getArray() as Float32Array;
        const want = Math.max(3, 3 * Math.round((e.maxTris * I.getCount()) / 3 / n));
        const [idx] = MeshoptSimplifier.simplify(new Uint32Array(I.getArray()!), pos, 3, want, e.error ?? 0.05, e.permissive ? ['Permissive', 'Prune'] : ['Prune']);
        I.setArray(new Uint32Array(idx));
        compactPrimitive(prim);
      }
      mesh.addPrimitive(prim);
      prims.push(prim);
    }
    const got = prims.reduce((k, p) => k + p.getIndices()!.getCount() / 3, 0);
    log(`  ${e.name}: ${Math.round(n)} → ${got} tris, ${prims.length} material(s)`);
    scene.addChild(doc.createNode(e.name).setMesh(mesh));
  }
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  writePublic(rel, await glbIO().writeBinary(doc), log);
}

// ── the props ──

const P = PC.models;

/** Lamp: scaled, glass apart (blended), post + bulb on one atlas. */
async function lamp(ctx: Ctx) {
  const s = await readSoups(ctx.file('polyhaven/street_lamp_01/street_lamp_01_1k.gltf'));
  const b = bounds(s);
  const k = P.lamp.scale;
  return atlas(move(s, { from: [(b.lo[0]! + b.hi[0]!) / 2, b.lo[1]!, (b.lo[2]! + b.hi[2]!) / 2], scale: [k, k, k] }), 1024, 1024);
}

/** Morris column: scan without its ground square and poster band + a poster cylinder (PD posters), one atlas. */
async function morris(ctx: Ctx) {
  const raw = await readSoups(ctx.file('sketchfab/french_colonne_morris.glb'));
  const b = bounds(raw);
  const M = P.morris; // scan units, measured with slice bounding boxes (axis, poster band, radius)
  const [[cx, cz], [lo, hi], r0] = [M.axis, M.band, M.scanRadius];
  const ground = b.lo[1]! + M.groundCut;
  const kept = await keepUsed(crop(raw, (x, y, z) => !(y < ground && Math.hypot(x - cx, z - cz) > M.plinthRadius) && (y < lo || y > hi)), 1024);
  // poster cylinder: 6 columns × 2 rows of posters, green dividers
  const posters = ctx.assets.filter((a) => a.file.startsWith('commons/posters/')).map((a) => a.file).sort();
  const [cw, ch, cols] = [256, 512, 6];
  const tiles = await Promise.all(
    Array.from({ length: cols * 2 }, (_, i) => sharp(ctx.file(posters[(i * 5) % posters.length]!)).resize(cw - 8, ch - 8, { fit: 'cover', position: 'top' }).png().toBuffer()),
  );
  const image = await sharp({ create: { width: cw * cols, height: ch * 2, channels: 3, background: P.morris.divider } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cw + 4, top: Math.floor(i / cols) * ch + 4 })))
    .png()
    .toBuffer();
  const cyl: Soup = { mat: { color: [1, 1, 1, 1], image, metal: 0, rough: 0.8, blend: false }, pos: [], nrm: [], uv: [] };
  const seg = 32;
  const rr = r0 + 0.005;
  for (let i = 0; i < seg; i++) {
    const [a0, a1] = [(2 * Math.PI * i) / seg, (2 * Math.PI * (i + 1)) / seg];
    const q = (a: number, y: number) => [cx + rr * Math.sin(a), y, cz + rr * Math.cos(a)];
    const nn = (a: number) => [Math.sin(a), 0, Math.cos(a)];
    // two triangles, counter-clockwise seen from outside; v = 0 at the top row of the image
    for (const [a, y, u, v] of [[a0, lo, i / seg, 1], [a1, lo, (i + 1) / seg, 1], [a1, hi, (i + 1) / seg, 0], [a0, lo, i / seg, 1], [a1, hi, (i + 1) / seg, 0], [a0, hi, i / seg, 0]] as const) {
      cyl.pos.push(...q(a, y));
      cyl.nrm.push(...nn(a));
      cyl.uv.push(u, v);
    }
  }
  const k = P.morris.radius / r0;
  return atlas(move([...kept, cyl], { from: [cx, ground, cz], scale: [k, k, k] }), 2048, 1024);
}

/** Bus shelter: centred, open side (+x in the source) turned to +z. Every texture above the floor slab (RATP advert with a
 *  real person, RATP network map, "Bus 60" sign with the RATP logo, a pictogram) is third-party content outside the
 *  modeller's CC BY → replaced by a flat neutral colour (SPEC §17.20: unknown licence); only the floor's concrete stays. */
async function shelter(ctx: Ctx) {
  const s = (await readSoups(ctx.file('sketchfab/abribus_bus_stop_bus_station.glb'))).map((q) =>
    q.mat.image && bounds([q]).hi[1]! > P.shelter.floor ? { ...q, mat: { ...q.mat, image: undefined, color: [...P.shelter.panel, 1] } } : q,
  );
  const b = bounds(s);
  return atlas(move(s, { from: [(b.lo[0]! + b.hi[0]!) / 2, b.lo[1]!, (b.lo[2]! + b.hi[2]!) / 2], yaw: P.shelter.yaw }), 1024, 512);
}

/** Bench: the scanned paving slab cut away, seat turned to +z. */
async function bench(ctx: Ctx) {
  const s = await readSoups(ctx.file('sketchfab/mini_paris_bench.glb'));
  const b = bounds(s);
  const cut = b.lo[1]! + P.bench.slab;
  const k = P.bench.scale;
  return keepUsed(move(crop(s, (_x, y) => y > cut), { from: [(b.lo[0]! + b.hi[0]!) / 2, cut, (b.lo[2]! + b.hi[2]!) / 2], scale: [...k], yaw: P.bench.yaw }), 1024);
}

/** Bouquinistes: the row's axis from the stalls (vertices above the parapet), one stretch of it, ground + stands cut
 *  away; along x, the sidewalk side (where the ground was) toward +z. */
async function bouquiniste(ctx: Ctx) {
  const s = await readSoups(ctx.file('sketchfab/bouquinistes.glb'));
  const b = bounds(s);
  const top = verts(s).filter(([, y]) => y > b.lo[1]! + P.bouquiniste.boxHeight);
  const [mx, mz] = [median(top.map((v) => v[0])), median(top.map((v) => v[2]))];
  let [sxx, sxz, szz] = [0, 0, 0];
  for (const [x, , z] of top) [sxx, sxz, szz] = [sxx + (x - mx) ** 2, sxz + (x - mx) * (z - mz), szz + (z - mz) ** 2];
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz); // principal axis
  const [ux, uz] = [Math.cos(ang), Math.sin(ang)];
  const along = (x: number, z: number) => (x - mx) * ux + (z - mz) * uz;
  const across = (x: number, z: number) => -(x - mx) * uz + (z - mz) * ux;
  const ground = verts(s).filter(([, y]) => y < b.lo[1]! + 0.2);
  const side = Math.sign(median(ground.map(([x, , z]) => across(x, z)))) || 1; // sidewalk side
  const [s0, s1] = P.bouquiniste.stretch;
  const [t0, t1] = P.bouquiniste.depth;
  const floor = b.lo[1]! + P.bouquiniste.groundCut;
  const kept = crop(s, (x, y, z) => {
    const [a, t] = [along(x, z), across(x, z) * side];
    return a >= s0 && a <= s1 && t >= t0 && t <= t1 && y > floor;
  });
  ctx.log(`  bouquiniste: axis ${(ang * 180 / Math.PI).toFixed(1)}°, sidewalk side ${side}, stretch ${s0}…${s1} m`);
  // local frame: x along the row (centred on the stretch), +z toward the sidewalk, y from the cut floor. move() maps
  // (ux, uz) to +x and the across direction (−uz, ux) to +z with yaw = atan2(uz, ux); half a turn more when side < 0.
  const [cx, cz] = [mx + (ux * (s0 + s1)) / 2, mz + (uz * (s0 + s1)) / 2];
  return keepUsed(move(kept, { from: [cx, floor, cz], yaw: Math.atan2(uz, ux) + (side > 0 ? 0 : Math.PI) }), 1024);
}

/** Scans cropped to a part: each texture cut to the uv box its kept triangles use (uv remapped), every pixel no kept
 *  triangle samples (± `pad` output px, for filtering / mips) painted neutral grey, then down to ≤ `px`. Nothing of the
 *  cut-away scan (modern posters, passers-by, book covers…) stays in the shipped file. */
export async function keepUsed(soups: Soup[], px: number, pad = 3): Promise<Soup[]> {
  for (const s of soups) {
    if (!s.mat.image) continue;
    if (!s.uv.every((u) => u >= -0.002 && u <= 1.002)) throw new Error('keepUsed: uv outside [0, 1] (tiled texture)');
    const { data, info } = await sharp(s.mat.image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [W, H] = [info.width, info.height];
    const d = (pad * Math.max(W, H)) / px; // pad in source px
    const used = new Uint8Array(W * H);
    let [x0, y0, x1, y1] = [W, H, 0, 0];
    for (let t = 0; t < s.uv.length; t += 6) {
      const p = [0, 2, 4].map((k) => [s.uv[t + k]! * W, s.uv[t + k + 1]! * H] as const);
      const sgn = Math.sign((p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1]) - (p[1]![1] - p[0]![1]) * (p[2]![0] - p[0]![0])) || 1;
      const [bx0, by0] = [Math.max(0, Math.floor(Math.min(...p.map((q) => q[0])) - d)), Math.max(0, Math.floor(Math.min(...p.map((q) => q[1])) - d))];
      const [bx1, by1] = [Math.min(W - 1, Math.ceil(Math.max(...p.map((q) => q[0])) + d)), Math.min(H - 1, Math.ceil(Math.max(...p.map((q) => q[1])) + d))];
      [x0, y0, x1, y1] = [Math.min(x0, bx0), Math.min(y0, by0), Math.max(x1, bx1), Math.max(y1, by1)];
      // pixel centre within d of the triangle: signed distance to every edge ≥ −d (degenerate edges ignored)
      const edges = [0, 1, 2].map((i) => {
        const [a, b] = [p[i]!, p[(i + 1) % 3]!];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return l < 1e-9 ? undefined : { a, nx: (sgn * (b[0] - a[0])) / l, ny: (sgn * (b[1] - a[1])) / l };
      });
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
          if (used[y * W + x]) continue;
          if (edges.every((e) => !e || e.nx * (y + 0.5 - e.a[1]) - e.ny * (x + 0.5 - e.a[0]) >= -d)) used[y * W + x] = 1;
        }
    }
    for (let i = 0; i < W * H; i++) if (!used[i]) data.fill(128, 3 * i, 3 * i + 3);
    const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
    s.mat.image = await sharp(data, { raw: { width: W, height: H, channels: 3 } }).extract({ left: x0, top: y0, width: w, height: h }).resize(px, px, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    for (let k = 0; k < s.uv.length; k += 2) [s.uv[k], s.uv[k + 1]] = [(s.uv[k]! * W - x0) / w, (s.uv[k + 1]! * H - y0) / h];
  }
  return soups;
}

async function cafe(ctx: Ctx) {
  const s = await readSoups(ctx.file('polyhaven/outdoor_table_chair_set_01/outdoor_table_chair_set_01_1k.gltf'));
  const b = bounds(s);
  return atlas(move(s, { from: [(b.lo[0]! + b.hi[0]!) / 2, b.lo[1]!, (b.lo[2]! + b.hi[2]!) / 2] }), 1024, 512);
}

const BUILD = { lamp, morris, shelter, bench, bouquiniste, cafe };

export const props: Target = async (ctx) => {
  const entries: Parameters<typeof writeGlb>[1] = [];
  for (const [name, build] of Object.entries(BUILD) as [keyof typeof BUILD, (c: Ctx) => Promise<Soup[]>][]) {
    const soups = await build(ctx);
    const b = bounds(soups);
    ctx.log(`  ${name}: ${b.lo.map((v) => v.toFixed(2))} → ${b.hi.map((v) => v.toFixed(2))}`);
    const [t0, t1] = P[name].tris;
    entries.push({ name, soups, maxTris: t0 });
    // LOD1: one draw call (blended glass dropped), heavier simplification
    entries.push({ name: `${name}_lod1`, soups: soups.filter((q) => !q.mat.blend), maxTris: t1, error: 0.2, permissive: true });
  }
  await writeGlb('models/props.glb', entries, 2048, ctx.log);
};
