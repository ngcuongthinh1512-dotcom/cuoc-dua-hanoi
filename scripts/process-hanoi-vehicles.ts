// Leg 3 Hà Nội street traffic (CLAUDE.md npc/): .cache/assets/hanoi (downloaded originals, licence-checked, never committed)
// → client/public/models/hanoi-vehicles.glb (+ its lines in client/public/credits.json, set "hanoi").
// Run: npm run process-hanoi. Deterministic; the output is committed. Same contract as npc-vehicles.glb (process-assets.ts
// npcVehicles): one node per CarKind, one primitive, flat vertex colours (linear) + `_PAINT` (1 = instance colour),
// nose +Z, pivot on the ground under the middle of the wheelbase, extras { axles, wheelRadius, front, rider, bodyBox };
// npc/NpcAssets.ts loads it next to npc-vehicles.glb and its kinds override / extend the old file's.
//   bus     RimiChama "Hanoi Bus": wheels → axles; the lower skirt = paint (red / green / yellow-green), yellow stripe kept
//   taxi    Quaternius Taxi: wheels → axles; paint = body (Mai Linh green / white), a white side stripe added
//   wave*   the motorbike front of Junaid's QINGQI rickshaw (cut at z 250 raw, saddle stretched, a rear wheel copied from
//           the front) + newArteest's T-posed rider bent into a riding pose by hard region rotations (no skinning):
//           wave / wave2 / wave3 shirt + helmet variants, waveHat a rider under ThrillDaWill's Rice Hat, wave2p + pillion
//   xichlo* Aditya Riyanto's Pedicap (passenger seat already in front, driver's saddle behind): wheels → 3 axles,
//           the sides / floor = paint (canopy colours), a pedalling driver (nón lá); xichlo2 adds a seated passenger
//   bagac   QINGQI again: motorbike + the cabin floor / low walls / rear wheels (y < 430 raw, no posts / roof) + goods
//           boxes on the bed + a helmeted driver (xe ba gác)
// ponytail: every rider is the same mesh in 4 hard-cut poses (hips / knees / shoulders); good enough at NPC distance,
// a skinned rider would need the UBC pipeline of process-assets.ts.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, type PBRSpecularGlossiness } from '@gltf-transform/extensions';
import { meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
// ponytail: sharp is a dependency of the approved @gltf-transform/cli (hoisted), like in process-assets.ts
import sharp from 'sharp';
import { npc } from '../client/src/config.ts';

const root = join(import.meta.dirname, '..');
const src = join(root, '.cache/assets/hanoi');
const out = join(root, 'client/public/models/hanoi-vehicles.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

type V3 = [number, number, number];
/** One triangle: 3 vertices, 3 normals, one linear colour, source material / node. */
interface Tri { p: number[]; n: number[]; c: V3; mat: string; node: string; paint?: boolean }

const srgb = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const hex = (h: string): V3 => [1, 3, 5].map((i) => srgb(parseInt(h.slice(i, i + 2), 16) / 255)) as V3;
const lum = (c: V3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c: V3) => Math.max(...c) - Math.min(...c);
const centroid = (t: Tri): V3 => [0, 1, 2].map((a) => (t.p[a]! + t.p[a + 3]! + t.p[a + 6]!) / 3) as V3;

// ── source triangles ──
/** Every triangle of a GLB in world space, coloured by its material's factor × the base / specGloss-diffuse texture
 *  sampled at the UV centroid (flat shading: textures are baked away, the game draws one untextured material). */
async function readTris(file: string): Promise<Tri[]> {
  const doc = await io.read(join(src, file));
  const tex = new Map<Texture, { data: Buffer; w: number; h: number }>();
  const out: Tri[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (!mat) continue;
      const sg = mat.getExtension<PBRSpecularGlossiness>('KHR_materials_pbrSpecularGlossiness');
      const t0 = mat.getBaseColorTexture() ?? sg?.getDiffuseTexture() ?? null;
      const factor = (sg ? sg.getDiffuseFactor() : mat.getBaseColorFactor()).slice(0, 3) as V3;
      if (t0 && !tex.has(t0)) {
        const r = await sharp(t0.getImage()!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        tex.set(t0, { data: r.data, w: r.info.width, h: r.info.height });
      }
      const im = t0 ? tex.get(t0) : undefined;
      const [P, N, T, I] = [prim.getAttribute('POSITION')!, prim.getAttribute('NORMAL'), prim.getAttribute('TEXCOORD_0'), prim.getIndices()];
      const n = I ? I.getCount() : P.getCount();
      const v = [0, 0, 0], uv = [0, 0];
      for (let k = 0; k < n; k += 3) {
        const p: number[] = [], nn: number[] = [];
        let [u, w] = [0, 0];
        for (let j = 0; j < 3; j++) {
          const i = I ? I.getScalar(det < 0 ? k + [0, 2, 1][j]! : k + j) : k + j;
          P.getElement(i, v);
          p.push(...[0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]!));
          if (N) N.getElement(i, v);
          else v.splice(0, 3, 0, 1, 0);
          const wn = [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]!);
          const l = Math.hypot(...wn) || 1;
          nn.push(...wn.map((c) => c / l));
          if (T) (T.getElement(i, uv), (u += uv[0]! / 3), (w += uv[1]! / 3));
        }
        let c = factor;
        if (im) {
          const [px, py] = [Math.floor((u - Math.floor(u)) * im.w), Math.floor((w - Math.floor(w)) * im.h)];
          const i = (Math.min(im.h - 1, py) * im.w + Math.min(im.w - 1, px)) * 4;
          c = [0, 1, 2].map((k) => factor[k]! * srgb(im.data[i + k]! / 255)) as V3;
        }
        out.push({ p, n: nn, c, mat: mat.getName(), node: node.getName() });
      }
    }
  }
  return out;
}

// ── geometry helpers (all on triangle soups) ──
type Fn3 = (v: V3) => V3;
/** Transform positions by f and normals by the linear part fn (default: f at the origin, for rotations). */
const map = (ts: Tri[], f: Fn3, fn?: Fn3): Tri[] => {
  const g = fn ?? ((v: V3) => { const o = f([0, 0, 0]), w = f(v); const r = [w[0] - o[0], w[1] - o[1], w[2] - o[2]] as V3; const l = Math.hypot(...r) || 1; return r.map((x) => x / l) as V3; });
  const each = (a: number[], h: Fn3) => Array.from({ length: 3 }, (_, i) => h(a.slice(i * 3, i * 3 + 3) as V3)).flat();
  return ts.map((t) => ({ ...t, p: each(t.p, f), n: each(t.n, g) }));
};
const scale = (ts: Tri[], s: V3) => map(ts, (v) => [v[0] * s[0], v[1] * s[1], v[2] * s[2]], (v) => { const r = [v[0] / s[0], v[1] / s[1], v[2] / s[2]] as V3; const l = Math.hypot(...r) || 1; return r.map((x) => x / l) as V3; });
const shift = (ts: Tri[], d: V3) => map(ts, (v) => [v[0] + d[0], v[1] + d[1], v[2] + d[2]], (v) => v);
/** Rotate about the X axis through (y0, z0) by a (rad): −y → +z for a < 0. */
const rotX = (a: number, y0 = 0, z0 = 0): Fn3 => { const [c, s] = [Math.cos(a), Math.sin(a)]; return (v) => { const [y, z] = [v[1] - y0, v[2] - z0]; return [v[0], y0 + y * c - z * s, z0 + y * s + z * c]; }; };
/** Rotate about the Y axis through (x0, z0) by b: +x → +z for b < 0. */
const rotY = (b: number, x0 = 0, z0 = 0): Fn3 => { const [c, s] = [Math.cos(b), Math.sin(b)]; return (v) => { const [x, z] = [v[0] - x0, v[2] - z0]; return [x0 + x * c + z * s, v[1], z0 - x * s + z * c]; }; };
const turn180 = (ts: Tri[]) => map(ts, (v) => [-v[0], v[1], -v[2]]);
const deg = (d: number) => (d * Math.PI) / 180;

interface Box { lo: V3; hi: V3 }
function bbox(ts: Tri[]): Box {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const t of ts) for (let i = 0; i < 9; i++) (lo[i % 3] = Math.min(lo[i % 3]!, t.p[i]!)), (hi[i % 3] = Math.max(hi[i % 3]!, t.p[i]!));
  return { lo, hi };
}
const mid = (b: Box, a: number) => (b.lo[a]! + b.hi[a]!) / 2;

/** A box (12 triangles, outward normals), centre c, size s. */
function box(c: V3, s: V3, colour: V3, paint = false): Tri[] {
  const out: Tri[] = [];
  const h = s.map((v) => v / 2) as V3;
  const faces: [V3, V3, V3][] = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  for (const [n, u, v] of faces) {
    const at = (a: number, b: number): V3 => [0, 1, 2].map((k) => c[k]! + h[k]! * (n[k]! + a * u[k]! + b * v[k]!)) as V3;
    const [p0, p1, p2, p3] = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
    for (const q of [[p0, p1, p2], [p0, p2, p3]]) out.push({ p: q.flat(), n: [...n, ...n, ...n], c: colour, mat: 'box', node: 'box', paint });
  }
  return out;
}
/** Wheel clusters (by `key`: default the node name and the side of the centre line) → axle centres + mean radius;
 *  returns the body without them. */
function wheels(ts: Tri[], isWheel: (t: Tri) => boolean, key = (t: Tri) => `${t.node}|${centroid(t)[0] >= 0}`) {
  const clusters = new Map<string, Tri[]>();
  for (const t of ts) if (isWheel(t)) { const k = key(t); (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(t); }
  const boxes = [...clusters.values()].map(bbox);
  return { body: ts.filter((t) => !isWheel(t)), axles: boxes.map((b): V3 => [mid(b, 0), mid(b, 1), mid(b, 2)]), radius: boxes.reduce((s, b) => s + (b.hi[1] - b.lo[1]) / 2, 0) / (boxes.length || 1), ground: boxes.length ? Math.min(...boxes.map((b) => b.lo[1])) : Infinity };
}

// ── meshopt decimation (one indexed primitive) ──
interface Mesh3 { pos: Float32Array; nrm: Float32Array; col: Float32Array; paint: Float32Array; index: Uint32Array }
const q12 = (c: V3) => c.map((v) => Math.round(v * 12) / 12) as V3; // texture-sampled colours differ on every triangle: 12 levels so welding finds shared vertices
/** Welds the soup (positions + colour, no normals: source normals are often per face and would stop the weld) and
 *  decimates it to about `target` triangles with meshopt; a decimated mesh gets flat face normals, a small one keeps its own. */
async function decimate(ts: Tri[], target: number, error = 0.05): Promise<Mesh3> {
  await MeshoptSimplifier.ready;
  const d = new Document();
  const buffer = d.createBuffer();
  const prim = d.createPrimitive();
  const acc = (type: 'SCALAR' | 'VEC3', a: Float32Array) => d.createAccessor().setType(type).setArray(a as never).setBuffer(buffer);
  const small = ts.length <= target;
  prim.setAttribute('POSITION', acc('VEC3', Float32Array.from(ts.flatMap((t) => t.p))));
  if (small) prim.setAttribute('NORMAL', acc('VEC3', Float32Array.from(ts.flatMap((t) => t.n))));
  prim.setAttribute('COLOR_0', acc('VEC3', Float32Array.from(ts.flatMap((t) => (t.paint ? [1, 1, 1, 1, 1, 1, 1, 1, 1] : [...q12(t.c), ...q12(t.c), ...q12(t.c)])))));
  prim.setAttribute('_PAINT', acc('SCALAR', Float32Array.from(ts.flatMap((t) => (t.paint ? [1, 1, 1] : [0, 0, 0])))));
  d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(prim)));
  await d.transform(weld());
  if (!small) await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / ts.length, error, lockBorder: false }));
  const p = d.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const get = (s: string) => Float32Array.from(p.getAttribute(s)!.getArray()!);
  const index = Uint32Array.from(p.getIndices()!.getArray()!);
  if (small) return { pos: get('POSITION'), nrm: get('NORMAL'), col: get('COLOR_0'), paint: get('_PAINT'), index };
  // un-index with face normals (flat shading, like the low-poly sources)
  const [P, C, A] = [get('POSITION'), get('COLOR_0'), get('_PAINT')];
  const n = index.length;
  const o: Mesh3 = { pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), col: new Float32Array(n * 3), paint: new Float32Array(n), index: Uint32Array.from({ length: n }, (_, i) => i) };
  for (let k = 0; k < n; k += 3) {
    const v = [0, 1, 2].map((j) => Array.from(P.subarray(index[k + j]! * 3, index[k + j]! * 3 + 3)));
    const [e1, e2] = [v[1]!.map((x, i) => x - v[0]![i]!), v[2]!.map((x, i) => x - v[0]![i]!)];
    const fn = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const l = Math.hypot(...fn) || 1;
    for (let j = 0; j < 3; j++) {
      const i = index[k + j]!;
      o.pos.set(v[j]!, (k + j) * 3);
      o.nrm.set(fn.map((x) => x / l), (k + j) * 3);
      o.col.set(C.subarray(i * 3, i * 3 + 3), (k + j) * 3);
      o.paint[k + j] = A[i]!;
    }
  }
  return o;
}

// ── the rider (newArteest, T-pose, full-face helmet) ──
const RIDER_H = 71; // raw height; raw forward = +X, arms along ±Z
const HIP = 33, KNEE = 15, SHOULDER = 54, NECK = 60, HAIR = 67; // raw y
type Pose = { thigh: number; shin: number; armFwd: number; armDown: number; lean: number }; // degrees
const POSES: Record<'ride' | 'pedal' | 'sit' | 'pillion', Pose> = {
  ride: { thigh: -78, shin: -8, armFwd: 75, armDown: 38, lean: 12 },
  pedal: { thigh: -55, shin: 5, armFwd: 70, armDown: 30, lean: 16 },
  sit: { thigh: -88, shin: -25, armFwd: 50, armDown: 70, lean: -4 },
  pillion: { thigh: -75, shin: 0, armFwd: 25, armDown: 75, lean: 2 },
};
interface Outfit { shirt: string; trousers?: string; helmet?: string; hat?: boolean } // no helmet → bare head (hair + skin) [+ nón lá]
let riderRaw: Tri[] | undefined;
let hatRaw: Tri[] | undefined;
const SKIN = hex('#d9a279'), HAIR_C = hex('#1a1612');
const isSkin = (c: V3) => c[0] > 0.3 && c[0] > c[1] * 1.15 && c[1] > c[2] * 1.1;

/** The rider bent into `pose`, in metres (height ≈ 1.7 × size), hips at the origin, facing +Z. */
async function rider(pose: Pose, o: Outfit, size = 1): Promise<Tri[]> {
  riderRaw ??= map(await readTris('sketchfab/rider-male_newarteest.glb'), (v) => [-v[2], v[1], v[0]]); // forward +X → +Z
  hatRaw ??= await readTris('sketchfab/rice-hat_thrilldawill.glb');
  const [shirt, trousers, helmet] = [hex(o.shirt), hex(o.trousers ?? '#2b2f3a'), o.helmet ? hex(o.helmet) : null];
  const dark = (c: V3) => lum(c) < 0.05;
  const t0 = riderRaw.map((t): Tri => {
    const y = centroid(t)[1];
    let c = t.c;
    if (y > NECK) c = helmet ? (dark(t.c) ? t.c : helmet) : y > HAIR ? HAIR_C : SKIN; // helmet: the visor stays black
    else if (!isSkin(t.c) && !dark(t.c)) c = y > HIP + 2 ? shirt : trousers; // gloves / boots stay dark
    return { ...t, c };
  });
  const legs = (t: Tri) => Math.abs(centroid(t)[0]) < 9 && centroid(t)[1] < HIP + 1;
  const arms = (t: Tri) => Math.abs(centroid(t)[0]) > 9 && centroid(t)[1] > 45;
  const kneeAt = rotX(deg(pose.thigh), HIP, 0)([0, KNEE, 0]);
  const posed = t0.map((t) => {
    const c = centroid(t);
    if (legs(t)) {
      if (c[1] > KNEE) return map([t], rotX(deg(pose.thigh), HIP, 0))[0]!; // thigh forward
      const dz = kneeAt[2], dy = kneeAt[1] - KNEE; // shin: carried by the knee, then bent a little
      return map([t], (v) => rotX(deg(pose.shin), kneeAt[1], kneeAt[2])([v[0], v[1] + dy, v[2] + dz]))[0]!;
    }
    if (arms(t)) {
      const side = Math.sign(c[0]);
      const fwd = rotY(-side * deg(pose.armFwd), side * 8, 0), down = rotX(deg(pose.armDown), SHOULDER, 0);
      return map([t], (v) => down(fwd(v)))[0]!;
    }
    return t;
  });
  const lean = rotX(deg(pose.lean), HIP, 0);
  const leaned = posed.map((t) => (centroid(t)[1] > HIP - 1 && !legs(t) ? map([t], lean)[0]! : t));
  const s = (1.7 * size) / RIDER_H;
  let outTris = map(leaned, (v) => [v[0] * s, (v[1] - HIP) * s, v[2] * s], (v) => v);
  if (o.hat) {
    const head = bbox(outTris.filter((t) => centroid(t)[1] > (NECK - HIP) * s));
    const hb = bbox(hatRaw);
    const hs = 0.44 / (hb.hi[0] - hb.lo[0]); // 44 cm nón lá
    const hat = map(hatRaw, (v) => [(v[0] - mid(hb, 0)) * hs + mid(head, 0), (v[1] - hb.lo[1]) * hs + head.hi[1] - 0.06, (v[2] - mid(hb, 2)) * hs + mid(head, 2)], (v) => v);
    outTris = outTris.concat(hat);
  }
  return outTris;
}

// ── kinds ──
interface Built { parts: Tri[][]; targets: number[]; axles: V3[]; wheelRadius: number; front: V3; rider: boolean; bodyBox: number[] }
const QINGQI_S = 2.2 / 1021; // the canopy roof ≈ 2.2 m up (a Vietnamese xe ba gác bed ≈ 1.2 m wide)
const QINGQI_CUT = 250; // raw z: the motorbike is ahead of it
let qingqi: Tri[] | undefined;
const qingqiTris = async () => (qingqi ??= await readTris('sketchfab/qingqi-rickshaw_junaid.glb'));

/** Flat-shaded n-gon tube from a to b (radius r0 → r1, section scaled sx along the local x / sy along the local y) with end
 *  caps; thin bars, pipes, the tank and the fairing of the motorbike below. */
function tube(a: V3, b: V3, r0: number, r1: number, n: number, colour: V3, paint = false, sx = 1, sy = 1): Tri[] {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(...d) || 1;
  const dn = d.map((v) => v / l) as V3;
  const up: V3 = Math.abs(dn[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u0: V3 = [dn[1] * up[2] - dn[2] * up[1], dn[2] * up[0] - dn[0] * up[2], dn[0] * up[1] - dn[1] * up[0]];
  const ul = Math.hypot(...u0) || 1;
  const u = u0.map((v) => v / ul) as V3;
  const v: V3 = [dn[1] * u[2] - dn[2] * u[1], dn[2] * u[0] - dn[0] * u[2], dn[0] * u[1] - dn[1] * u[0]];
  const ring = (c: V3, r: number): V3[] => Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n, cu = Math.cos(t) * r * sx, cv = Math.sin(t) * r * sy;
    return [c[0] + u[0] * cu + v[0] * cv, c[1] + u[1] * cu + v[1] * cv, c[2] + u[2] * cu + v[2] * cv];
  });
  const [ra, rb] = [ring(a, r0), ring(b, r1)];
  const out: Tri[] = [];
  const tri = (p: V3, q: V3, r: V3) => {
    const e1: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2: V3 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const nn: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...nn) || 1;
    const m = nn.map((x) => x / nl) as V3;
    out.push({ p: [...p, ...q, ...r], n: [...m, ...m, ...m], c: colour, mat: 'tube', node: 'tube', paint });
  };
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    tri(ra[k]!, rb[k]!, rb[j]!);
    tri(ra[k]!, rb[j]!, ra[j]!);
    if (k >= 1 && k + 1 < n) (tri(ra[0]!, ra[j]!, ra[k]!), tri(rb[0]!, rb[k]!, rb[j]!)); // caps
  }
  return out;
}
/** Mudguard: a strip of `seg` quads (two-sided, `th` thick) round a wheel centre c from angle a0 to a1 (0 = ahead, 90° = up). */
function guard(c: V3, r: number, width: number, a0: number, a1: number, seg: number, colour: V3, paint = true, th = 0.015): Tri[] {
  const out: Tri[] = [];
  const at = (a: number, rr: number, x: number): V3 => [c[0] + x, c[1] + rr * Math.sin(a), c[2] + rr * Math.cos(a)];
  const push = (p: V3, q: V3, r2: V3, nrm: V3) => out.push({ p: [...p, ...q, ...r2], n: [...nrm, ...nrm, ...nrm], c: colour, mat: 'guard', node: 'guard', paint });
  for (let k = 0; k < seg; k++) {
    const [b0, b1] = [a0 + ((a1 - a0) * k) / seg, a0 + ((a1 - a0) * (k + 1)) / seg];
    const am = (b0 + b1) / 2;
    const nOut: V3 = [0, Math.sin(am), Math.cos(am)], nIn: V3 = [0, -Math.sin(am), -Math.cos(am)];
    const [w0, w1] = [-width / 2, width / 2];
    push(at(b0, r, w0), at(b0, r, w1), at(b1, r, w1), nOut), push(at(b0, r, w0), at(b1, r, w1), at(b1, r, w0), nOut); // outside
    push(at(b0, r - th, w1), at(b0, r - th, w0), at(b1, r - th, w0), nIn), push(at(b0, r - th, w1), at(b1, r - th, w0), at(b1, r - th, w1), nIn); // inside
    for (const [x, nx] of [[w0, -1], [w1, 1]] as const) { // side lips
      const nrm: V3 = [nx, 0, 0];
      const [p0, p1, p2, p3] = [at(b0, r, x), at(b1, r, x), at(b1, r - th, x), at(b0, r - th, x)];
      if (nx > 0) (push(p0, p1, p2, nrm), push(p0, p2, p3, nrm)); else (push(p0, p2, p1, nrm), push(p0, p3, p2, nrm));
    }
  }
  return out;
}

/** A Honda Wave / Dream underbone motorbike (≈ 560 triangles; wheels = axles, drawn rolling by the renderer): nose +Z, pivot
 *  mid-wheelbase, wheels on y 0; paint = leg shield, side covers, mudguards, headlamp cowl. Tubes (8-gon) for the fork, frame
 *  spine, tank / side covers, seat, exhaust, handlebar and rack; curved mudguards over both wheels; a flat footboard between
 *  them. ponytail: jeremy's Poly Pizza "Scooter" turned out to be a kick scooter and the QINGQI's motorbike half is
 *  black-textured spoke soup once cut, so the bike is drawn by hand; swap in a real Wave model here if one is approved. */
const WAVE_R = 0.3, WAVE_BASE = 1.23; // wheel radius, wheelbase (m)
function waveBike(): { tris: Tri[]; axles: V3[]; seat: { y: number; z: number } } {
  const dark = hex('#1f2023'), chrome = hex('#9a9ea3'), engine = hex('#3a3d42'), rubber = hex('#2b2b2e'), paint: V3 = [1, 1, 1];
  const zF = WAVE_BASE / 2, zR = -WAVE_BASE / 2;
  const head: V3 = [0, 0.92, zF - 0.24]; // steering head
  const tilt = (ts: Tri[], a: number, y0: number, z0: number) => map(ts, rotX(deg(a), y0, z0));
  const tris: Tri[] = [
    ...[-0.07, 0.07].flatMap((x) => [
      ...tube([x, 0.88, zF - 0.22], [x, WAVE_R, zF], 0.016, 0.016, 6, chrome), // fork stanchions
      ...tube([x, 0.58, zF - 0.1], [x, WAVE_R, zF], 0.026, 0.022, 6, dark), // sliders
    ]),
    ...tube([head[0], head[1] - 0.1, head[2] + 0.02], [head[0], head[1] + 0.08, head[2] - 0.05], 0.045, 0.045, 6, dark), // steering head tube
    ...guard([0, WAVE_R, zF], 0.345, 0.11, deg(40), deg(118), 4, paint), // front mudguard (npc.vehicles.wave.dims: 1.7 m long)
    ...tube([0, 0.86, zF - 0.14], [0, 0.9, zF + 0.1], 0.12, 0.09, 8, paint, true, 1, 0.75), // headlamp cowl (flattened 8-gon)
    ...tube([0, 0.9, zF + 0.1], [0, 0.9, zF + 0.125], 0.085, 0.07, 6, hex('#f4efd8'), false, 1, 0.75), // lens
    ...box([0, 0.36, 0.02], [0.3, 0.035, 0.62], dark), // footboard
    ...tube([0, 0.82, zF - 0.28], [0, 0.42, -0.02], 0.05, 0.04, 8, paint, true, 2.6, 1), // leg shield: wide flat spine down from the head
    ...tube([0, 0.62, zF - 0.33], [0, 0.42, 0.14], 0.03, 0.03, 6, paint, true, 7, 0.6), // leg shield skirt (wide thin blade)
    ...tube([0, 0.4, -0.02], [0, 0.56, -0.58], 0.06, 0.05, 6, engine), // frame spine
    ...box([0, 0.33, -0.08], [0.28, 0.2, 0.26], engine), // crankcase
    ...tube([0, 0.42, 0.02], [0, 0.5, 0.2], 0.055, 0.05, 6, engine), // cylinder leaning forward
    ...tube([0, 0.6, 0.02], [0, 0.66, -0.56], 0.11, 0.1, 8, paint, true, 1.35, 0.85), // tank / side covers (wide 8-gon)
    ...tube([0, 0.79, -0.04], [0, 0.86, -0.7], 0.05, 0.05, 8, dark, false, 2.8, 0.9), // seat: long, flat, rising to the rear
    ...guard([0, WAVE_R, zR], 0.35, 0.12, deg(45), deg(130), 5, paint), // rear mudguard
    ...[-0.1, 0.1].flatMap((x) => tilt(box([x, 0.36, -0.37], [0.03, 0.035, 0.52], dark), -13, 0.36, -0.37)), // swingarm
    ...[-0.12, 0.12].flatMap((x) => tilt(box([x, 0.48, -0.55], [0.025, 0.3, 0.025], chrome), 20, 0.48, -0.55)), // rear shocks
    ...box([0, 0.64, -0.82], [0.1, 0.06, 0.03], hex('#c0392b')), // tail light
    ...box([0, 0.52, -0.825], [0.16, 0.11, 0.01], hex('#e9e6dc')), // number plate
    ...[-0.14, 0.14].flatMap((x) => [...box([x, 0.9, -0.66], [0.024, 0.024, 0.34], chrome), ...box([x, 0.78, -0.66], [0.024, 0.24, 0.024], chrome)]), // rack rails + posts
    ...[-0.5, -0.82].flatMap((z) => box([0, 0.9, z], [0.28, 0.024, 0.024], chrome)), // rack cross bars
    ...tube([0.17, 0.33, 0.14], [0.2, 0.3, -0.3], 0.03, 0.03, 6, chrome), // exhaust pipe
    ...tube([0.2, 0.3, -0.3], [0.22, 0.4, -0.78], 0.04, 0.05, 8, chrome), // muffler
    ...tube([-0.33, 1.0, 0.33], [0.33, 1.0, 0.33], 0.014, 0.014, 6, chrome), // handlebar
    ...[-0.3, 0.3].flatMap((x) => box([x, 1.0, 0.33], [0.12, 0.04, 0.04], rubber)), // grips
    ...[-0.28, 0.28].flatMap((x) => [...box([x, 1.12, 0.3], [0.09, 0.07, 0.015], chrome), ...box([x, 1.04, 0.31], [0.015, 0.09, 0.015], dark)]), // mirrors
    ...box([0, 0.31, 0.06], [0.52, 0.02, 0.05], dark), // foot pegs
    ...[-0.22, 0.22].flatMap((x) => box([x, 0.34, -0.62], [0.1, 0.02, 0.04], dark)), // pillion pegs
  ];
  return { tris, axles: [[0, WAVE_R, zF], [0, WAVE_R, zR]], seat: { y: 0.84, z: -0.2 } };
}

async function buildWave(outfit: Outfit, pillion?: Outfit): Promise<Built> {
  const b = waveBike();
  const r1 = shift(await rider(POSES.ride, outfit), [0, b.seat.y + 0.02, b.seat.z + 0.1]);
  const parts = [b.tris, r1];
  if (pillion) parts.push(shift(await rider(POSES.pillion, pillion, 0.95), [0, b.seat.y + 0.02, b.seat.z - 0.32]));
  const bb = bbox(b.tris);
  bb.lo[1] = 0;
  return { parts, targets: [600, 520, 520], axles: b.axles, wheelRadius: WAVE_R, front: [0, 0.86, bb.hi[2]], rider: true, bodyBox: [...bb.lo, ...bb.hi] };
}

async function buildBagac(): Promise<Built> {
  const all = await qingqiTris();
  const keep = all.filter((t) => { const c = centroid(t); return c[2] > QINGQI_CUT ? c[1] < 600 : c[1] < 430; });
  const rearBox = bbox(keep.filter((t) => { const c = centroid(t); return c[2] < -300 && c[1] < 300; }));
  const front = bbox(keep.filter((t) => { const c = centroid(t); return c[2] > 380 && c[1] < 290 && Math.abs(c[0]) < 40; }));
  const pivot: V3 = [0, Math.min(rearBox.lo[1], front.lo[1]), (mid(front, 2) + mid(rearBox, 2)) / 2];
  const paint = (t: Tri) => { const c = centroid(t); return chroma(t.c) > 0.1 && lum(t.c) > 0.04 && c[2] < 500 && c[1] > 60; }; // the yellow cab walls + the bike's panels
  const body = map(keep.map((t) => ({ ...t, paint: paint(t) })), (v) => [(v[0] - pivot[0]) * QINGQI_S, (v[1] - pivot[1]) * QINGQI_S, (v[2] - pivot[2]) * QINGQI_S], (v) => v);
  const bedY = 0.36, bedZ = (QINGQI_CUT - 300 - pivot[2]) * QINGQI_S; // middle of the bed
  const goods = [
    ...box([-0.25, bedY + 0.2, bedZ + 0.3], [0.5, 0.4, 0.5], hex('#b98a52')), ...box([0.3, bedY + 0.17, bedZ + 0.25], [0.45, 0.34, 0.45], hex('#a87a46')),
    ...box([-0.2, bedY + 0.55, bedZ + 0.3], [0.42, 0.3, 0.42], hex('#c49a62')), ...box([0.05, bedY + 0.22, bedZ - 0.35], [0.95, 0.44, 0.6], hex('#2f5fa8')),
    ...box([0.05, bedY + 0.52, bedZ - 0.35], [0.7, 0.16, 0.5], hex('#4f8a3a')),
  ];
  const saddle = bbox(body.filter((t) => { const c = centroid(t); return c[2] > (QINGQI_CUT - pivot[2]) * QINGQI_S && c[2] < (420 - pivot[2]) * QINGQI_S && c[1] > 0.55 && c[1] < 0.95; }));
  const r = shift(await rider(POSES.ride, { shirt: '#4a5a8a', helmet: '#e9e2c8' }), [0, saddle.hi[1] - 0.04, mid(saddle, 2) + 0.05]);
  const bb = bbox(body.concat(goods));
  return { parts: [body.concat(goods), r], targets: [2200, 520], axles: [], wheelRadius: 0, front: [0, 0.6, bb.hi[2]], rider: true, bodyBox: [...bb.lo, ...bb.hi] };
}

async function buildXichlo(passenger: boolean): Promise<Built> {
  const all = await readTris('sketchfab/pedicap_adityariyanto.glb');
  const w = wheels(all, (t) => /wheel/i.test(t.mat), (t) => { const c = centroid(t); return `${c[2] > -1 ? 'F' : 'R'}|${Math.abs(c[0]) > 0.3 ? c[0] > 0 : ''}`; }); // tyre + hub of one wheel together (front pair at z 0.8, rear at −3.4)
  const s = 0.44; // raw 2.77 m wide → 1.22 m
  const COL: Record<string, V3> = { 'becak_base.002': hex('#ffffff'), 'becak_Jok.002': hex('#3b2a1e'), 'becak_seat.002': hex('#6b4a2e'), 'becak_frame.002': hex('#3d4248'), 'becak_pedal.002': hex('#2a2a2a'), 'becak_seat.003': hex('#2a2a2a'), 'becak_base.001': hex('#3d4248') };
  const pivot: V3 = [0, w.ground, w.axles.reduce((m, a) => m + a[2], 0) / w.axles.length];
  const place = (v: V3): V3 => [(v[0] - pivot[0]) * s, (v[1] - pivot[1]) * s, (v[2] - pivot[2]) * s];
  const body = map(w.body.map((t) => ({ ...t, c: COL[t.mat] ?? t.c, paint: t.mat === 'becak_base.002' })), place, (v) => v);
  const saddle = bbox(body.filter((t) => t.mat === 'becak_Jok.002'));
  const parts = [body, shift(await rider(POSES.pedal, { shirt: '#6f7f5a', trousers: '#3a3f4a', hat: true }, 0.92), [0, saddle.hi[1] - 0.02, mid(saddle, 2) - 0.02])];
  const bench = bbox(body.filter((t) => { const c = centroid(t); return t.mat === 'becak_seat.002' && c[2] > 0.2 && Math.abs(c[0]) < 0.3 && c[1] < 0.8; })); // the passenger cushion (the back rest is higher)
  if (passenger) parts.push(shift(await rider(POSES.sit, { shirt: '#c9c3b4', trousers: '#4a4e5a' }, 0.9), [0, bench.hi[1] + 0.02, mid(bench, 2) - 0.08]));
  const bb = bbox(body);
  return { parts, targets: [1300, 520, 520], axles: w.axles.map(place), wheelRadius: w.radius * s, front: [0, 0.8, bb.hi[2]], rider: true, bodyBox: [...bb.lo, ...bb.hi] };
}

async function buildBus(): Promise<Built> {
  const all = turn180(await readTris('sketchfab/bus-hanoi_rimichama.glb')); // the front wheels sit at −z in the source
  const w = wheels(all, (t) => t.node.startsWith('Wheel_'), (t) => t.node.slice(0, 8)); // Wheel_FL_black + Wheel_FL_lightgrey = one wheel
  const [W, H, L] = npc.vehicles.bus.dims;
  const bb = bbox(w.body);
  const s: V3 = [W / (bb.hi[0] - bb.lo[0]), H / (bb.hi[1] - w.ground), L / (bb.hi[2] - bb.lo[2])];
  const o: V3 = [mid(bb, 0), w.ground, w.axles.reduce((m, a) => m + a[2], 0) / w.axles.length];
  const COL: Record<string, V3> = { 'white.002': hex('#f3f3ef'), 'yellow.002': hex('#f0c030'), 'darkgrey.002': hex('#2a3238'), 'black.002': hex('#15171a'), 'lightgrey.002': hex('#9a9a9a') };
  const body = scale(shift(w.body.map((t) => ({ ...t, c: COL[t.mat] ?? t.c, paint: t.mat === 'red.002' })), [-o[0], -o[1], -o[2]]), s);
  const lamps = [1, -1].flatMap((x) => box([x * (W / 2 - 0.35), 0.75, L / 2 - 0.02], [0.3, 0.18, 0.06], hex('#f6f2d8')));
  const axles = w.axles.map((a): V3 => [(a[0] - o[0]) * s[0], (a[1] - o[1]) * s[1], (a[2] - o[2]) * s[2]]);
  const b2 = bbox(body);
  return { parts: [body.concat(lamps)], targets: [1500], axles, wheelRadius: w.radius * s[1], front: [0, 0.75, L / 2], rider: false, bodyBox: [...b2.lo, ...b2.hi] };
}

async function buildTaxi(): Promise<Built> {
  const all = await readTris('polypizza/taxi-quaternius.glb');
  const w = wheels(all, (t) => /Wheel/i.test(t.node));
  const [W, H, L] = npc.vehicles.taxi.dims;
  const bb = bbox(w.body);
  const s: V3 = [W / (bb.hi[0] - bb.lo[0]), H / (bb.hi[1] - w.ground), L / (bb.hi[2] - bb.lo[2])];
  const o: V3 = [mid(bb, 0), w.ground, w.axles.reduce((m, a) => m + a[2], 0) / w.axles.length];
  const body = scale(shift(w.body.map((t) => ({ ...t, paint: t.mat === 'Yellow' })), [-o[0], -o[1], -o[2]]), s);
  const stripe = [1, -1].flatMap((x) => box([x * (W / 2 - 0.02), 0.62, 0.1], [0.05, 0.1, 2.6], hex('#f4f4f0'))); // Mai Linh's white side band
  const axles = w.axles.map((a): V3 => [(a[0] - o[0]) * s[0], (a[1] - o[1]) * s[1], (a[2] - o[2]) * s[2]]);
  const b2 = bbox(body);
  return { parts: [body.concat(stripe)], targets: [1900], axles, wheelRadius: w.radius * s[1], front: [0, 0.5, L / 2], rider: false, bodyBox: [...b2.lo, ...b2.hi] };
}

const BUILDS: Record<string, () => Promise<Built>> = {
  bus: buildBus,
  taxi: buildTaxi,
  wave: () => buildWave({ shirt: '#3a6fb0', helmet: '#f2f2ee' }),
  wave2: () => buildWave({ shirt: '#c94b3c', trousers: '#4a4a4a', helmet: '#1a1a1a' }),
  wave3: () => buildWave({ shirt: '#e9e4d6', trousers: '#1f2a44', helmet: '#2a5db0' }),
  waveHat: () => buildWave({ shirt: '#5c8a4c', trousers: '#3a3a3a', hat: true }),
  wave2p: () => buildWave({ shirt: '#2b2d33', helmet: '#e7d43b' }, { shirt: '#e3b23c', trousers: '#4a4a4a', helmet: '#c0392b' }),
  xichlo: () => buildXichlo(false),
  xichlo2: () => buildXichlo(true),
  bagac: buildBagac,
};

// ── assemble + write ──
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('hanoi-vehicles');
const mat = doc.createMaterial('hanoi-vehicle').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
let total = 0;
for (const [kind, build] of Object.entries(BUILDS)) {
  if (!(kind in npc.vehicles)) throw new Error(`process-hanoi: ${kind} is not in config npcVehicles`);
  const b = await build();
  const meshes = await Promise.all(b.parts.map((p, i) => decimate(p, b.targets[i] ?? 600)));
  const n = meshes.reduce((s, m) => s + m.pos.length / 3, 0);
  const join3 = (k: 'pos' | 'nrm' | 'col' | 'paint', w: number) => { const a = new Float32Array(n * w); let at = 0; for (const m of meshes) (a.set(m[k], at), (at += m[k].length)); return a; };
  const idx: number[] = [];
  let off = 0;
  for (const m of meshes) (idx.push(...Array.from(m.index, (i) => i + off)), (off += m.pos.length / 3));
  const acc = (type: 'SCALAR' | 'VEC3', a: Float32Array | Uint32Array) => doc.createAccessor().setType(type).setArray(a as never).setBuffer(buffer);
  const prim = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', join3('pos', 3))).setAttribute('NORMAL', acc('VEC3', join3('nrm', 3)))
    .setAttribute('COLOR_0', acc('VEC3', join3('col', 3))).setAttribute('_PAINT', acc('SCALAR', join3('paint', 1))).setIndices(acc('SCALAR', Uint32Array.from(idx)));
  const r3 = (v: number) => +v.toFixed(3);
  scene.addChild(doc.createNode(kind).setMesh(doc.createMesh(kind).addPrimitive(prim)).setExtras({
    axles: b.axles.map((a) => a.map(r3)), wheelRadius: r3(b.wheelRadius), front: b.front.map(r3), rider: b.rider, bodyBox: b.bodyBox.map(r3),
  }));
  const tris = idx.length / 3;
  total += tris;
  const [W, H, L] = npc.vehicles[kind as keyof typeof npc.vehicles].dims;
  const bx = b.bodyBox;
  console.log(`${kind}: ${meshes.map((m) => m.index.length / 3).join(' + ')} = ${tris} tam giác; thân ${r3(bx[3]! - bx[0]!)} × ${r3(bx[4]! - bx[1]!)} × ${r3(bx[5]! - bx[2]!)} m (dims ${W} × ${H} × ${L}), ${b.axles.length} trục r ${r3(b.wheelRadius)}`);
}
await MeshoptEncoder.ready;
await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
writeFileSync(out, await io.writeBinary(doc));
console.log(`${out}: ${total.toLocaleString()} tam giác, ${(statSync(out).size / 1024).toFixed(0)} KB`);

// ── credits.json: one line per source model (set "hanoi"; process-assets.ts rewrites the file keeping only set "8c") ──
const sf = (uid: string) => `https://sketchfab.com/3d-models/${uid}`;
const CREDITS = [
  ['Xe buýt Hà Nội', 'Low Poly Vietnamese Bus, Hanoi Bus [Game Ready]', 'RimiChama', 'CC BY 4.0', 'Sketchfab', sf('bd40cceb9abe48e38fdaca5a28a7adf6')],
  ['Xe taxi', 'Taxi', 'Quaternius', 'CC0 1.0', 'Poly Pizza', 'https://poly.pizza/m/x43lOScTpN'],
  ['Xe máy / xe ba gác (QINGQI)', 'Low poly QINGQI Rickshaw for mobile games', 'Junaid_shakoor', 'CC BY 4.0', 'Sketchfab', sf('99a87f79f5bb45ab83d6379d98cf9838')],
  ['Người lái xe máy / xích lô', 'Low-pol Bike Rider Male', 'newArteest', 'CC BY 4.0', 'Sketchfab', sf('a434472913e34238a708b5e562c9fa6b')],
  ['Nón lá', 'Rice Hat', 'ThrillDaWill', 'CC BY 4.0', 'Sketchfab', sf('70069222f23f46679588c9ea384219a4')],
  ['Xích lô', 'Pedicap', 'Aditya Riyanto', 'CC BY 4.0', 'Sketchfab', sf('00e9a255122c4876835f135b8f0c27ea')],
].map(([label, title, author, licence, via, url]) => ({
  title: `${label}: ${title}`,
  text: `${label}: "${title}" – ${author}, ${licence}, qua ${via} (đã chỉnh sửa)`,
  licence, url, author, set: 'hanoi',
}));
const creditsFile = join(root, 'client/public/credits.json');
const old = existsSync(creditsFile) ? (JSON.parse(readFileSync(creditsFile, 'utf8')) as { set?: string }[]) : [];
writeFileSync(creditsFile, `${JSON.stringify([...old.filter((c) => c.set !== 'hanoi'), ...CREDITS], null, 1)}\n`);
console.log(`${creditsFile}: + ${CREDITS.length} mục Hà Nội`);
