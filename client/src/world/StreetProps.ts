// Package E: lamps, Morris columns, metro entrances (InstanceSets) and street-name signs ('sign' bucket + atlas texture).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  type Material,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { props as P } from '../config.ts';
import { type ChunkData, type ChunkKey, chunkKey } from '../geo/chunkData.ts';
import type { BuildCtx, Builder, BuildOut, MaterialId, PropKind } from './buildTypes.ts';
import { hash01, MeshBuffer } from './geom.ts';
import { quadOut } from './landmarks/kit.ts';
import { roadWidth } from './RoadBuilder.ts';

const CAR = new Set(P.carKinds);
const STREET = new Set([...P.carKinds, ...P.streetKinds]);

/** Instance matrix (column-major): scale s, yaw about +Y (local +Z → (sin yaw, cos yaw)), then translate. */
export function pushMatrix(out: number[], x: number, y: number, z: number, yaw: number, s = 1) {
  const c = Math.cos(yaw) * s;
  const n = Math.sin(yaw) * s;
  out.push(c, 0, -n, 0, 0, s, 0, 0, n, 0, c, 0, x, y, z, 1);
}

interface Arm { a: number; dx: number; dz: number; hw: number; name?: string }
export interface Junction { x: number; z: number; arms: Arm[] } // arms sorted by angle atan2(dz, dx)

/** Street junctions owned by this chunk (≥ 3 arms, or 2 differently named streets), plus every street junction vertex
 *  (for the lamp gap). ponytail: arms of a road piece stored in the neighbour chunk are missed, so some border junctions
 *  are skipped; upgrade: a global junction list from build-graph (Phase 4). */
export function findJunctions(chunk: ChunkData, key: ChunkKey) {
  const map = new Map<string, Junction>();
  for (const r of chunk.roads) {
    if (!STREET.has(r.kind)) continue;
    const n = r.pts.length / 2;
    const hw = roadWidth(r) / 2;
    const pt = (i: number) => (i === -1 ? r.before : i === n ? r.after : i >= 0 && i < n ? [r.pts[2 * i]!, r.pts[2 * i + 1]!] : undefined);
    for (const i of r.junctions) {
      const x = r.pts[2 * i]!;
      const z = r.pts[2 * i + 1]!;
      const k = `${x},${z}`;
      let j = map.get(k);
      if (!j) map.set(k, (j = { x, z, arms: [] }));
      for (const q of [pt(i - 1), pt(i + 1)]) {
        if (!q) continue;
        const l = Math.hypot(q[0]! - x, q[1]! - z);
        if (l < 1e-6) continue;
        const a = Math.atan2(q[1]! - z, q[0]! - x);
        if (j.arms.some((o) => Math.abs(Math.atan2(Math.sin(o.a - a), Math.cos(o.a - a))) < 0.05)) continue; // duplicate arm
        j.arms.push({ a, dx: (q[0]! - x) / l, dz: (q[1]! - z) / l, hw, ...(r.name ? { name: r.name } : {}) });
      }
    }
  }
  const all = [...map.values()];
  const owned = all.filter(
    (j) => chunkKey(j.x, j.z) === key && (j.arms.length >= 3 || new Set(j.arms.map((a) => a.name).filter(Boolean)).size >= 2),
  );
  for (const j of owned) j.arms.sort((p, q) => p.a - q.a);
  return { owned, points: all };
}

/** Sidewalk corner between arm k and the next arm (counter-clockwise), `inset` m beyond both curbs. */
export function corner(j: Junction, k: number, inset: number): [number, number] {
  const a = j.arms[k]!;
  const b = j.arms[(k + 1) % j.arms.length]!;
  let g = b.a - a.a;
  if (g <= 1e-9) g += 2 * Math.PI;
  const mid = a.a + g / 2;
  const d = Math.min((Math.max(a.hw, b.hw) + inset) / Math.max(Math.sin(g / 2), 0.4), 40);
  return [j.x + Math.cos(mid) * d, j.z + Math.sin(mid) * d];
}

export interface SignSpot { name: string; x: number; z: number; dx: number; dz: number } // post; plaque along (dx, dz)

/** One sign per named street per junction, on the corner after its first arm; same name within signs.dedupe m skipped. */
export function placeSigns(junctions: Junction[]): SignSpot[] {
  const out: SignSpot[] = [];
  for (const j of junctions) {
    const done = new Set<string>();
    j.arms.forEach((arm, k) => {
      if (!arm.name || done.has(arm.name)) return;
      done.add(arm.name);
      const [x, z] = corner(j, k, P.cornerInset.sign);
      if (out.some((s) => s.name === arm.name && Math.hypot(s.x - x, s.z - z) < P.signs.dedupe)) return;
      out.push({ name: arm.name, x, z, dx: arm.dx, dz: arm.dz });
    });
  }
  return out;
}

/** Lamp positions: every lampSpacing m on both sides of car roads, not within lampJunctionGap m of a junction. */
export function placeLamps(chunk: ChunkData, junctionPts: { x: number; z: number }[]) {
  const out: { x: number; z: number; yaw: number }[] = [];
  for (const r of chunk.roads) {
    if (!CAR.has(r.kind)) continue;
    const off = roadWidth(r) / 2 + P.lampCurbOffset;
    let next = P.lampSpacing / 2; // arc length of the next lamp along this piece
    let s = 0;
    for (let i = 0; i + 1 < r.pts.length / 2; i++) {
      const [x0, z0, x1, z1] = [r.pts[2 * i]!, r.pts[2 * i + 1]!, r.pts[2 * i + 2]!, r.pts[2 * i + 3]!];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const [tx, tz] = [(x1 - x0) / len, (z1 - z0) / len];
      for (; next <= s + len; next += P.lampSpacing) {
        const x = x0 + tx * (next - s);
        const z = z0 + tz * (next - s);
        if (junctionPts.some((j) => Math.hypot(j.x - x, j.z - z) < P.lampJunctionGap)) continue;
        for (const side of [1, -1]) {
          const [nx, nz] = [tz * side, -tx * side]; // left normal × side
          out.push({ x: x + nx * off, z: z + nz * off, yaw: Math.atan2(-nx, -nz) }); // lantern side faces the road
        }
      }
      s += len;
    }
  }
  return out;
}

/** Unit direction from (x, z) to the closest point of the nearest street (any road if none), or undefined. */
function towardRoad(chunk: ChunkData, x: number, z: number): [number, number] | undefined {
  let best = Infinity;
  let dir: [number, number] | undefined;
  const streets = chunk.roads.some((r) => STREET.has(r.kind)) ? chunk.roads.filter((r) => STREET.has(r.kind)) : chunk.roads;
  for (const r of streets) {
    for (let i = 0; i + 1 < r.pts.length / 2; i++) {
      const [x0, z0, x1, z1] = [r.pts[2 * i]!, r.pts[2 * i + 1]!, r.pts[2 * i + 2]!, r.pts[2 * i + 3]!];
      const l2 = (x1 - x0) ** 2 + (z1 - z0) ** 2;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / l2)) : 0;
      const [px, pz] = [x0 + t * (x1 - x0) - x, z0 + t * (z1 - z0) - z];
      const d = Math.hypot(px, pz);
      if (d < best && d > 1e-6) [best, dir] = [d, [px / d, pz / d]];
    }
  }
  return dir;
}

let warnedCanvas = false;

/** Two plaque lines: street type + particles ("RUE DE LA") and the name proper ("PAIX"). */
export function splitName(name: string): [string, string] {
  const w = name.split(/\s+/);
  if (w.length < 2) return ['', name.toLocaleUpperCase('fr')];
  let i = 1;
  while (i < w.length - 1 && /^(de|du|des|la|le|les|l'|l’|d'|d’|aux|au|à)$/i.test(w[i]!)) i++;
  let pre = w.slice(0, i).join(' ');
  let main = w.slice(i).join(' ');
  const m = /^([dl]['’])(.+)$/i.exec(main);
  if (m) [pre, main] = [`${pre} ${m[1]}`, m[2]!];
  return [pre.toLocaleUpperCase('fr'), main.toLocaleUpperCase('fr')];
}

const FONT = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/** Per-chunk sign atlas (OffscreenCanvas, shelf-packed cells) + the 'sign' bucket (posts + double-sided plaques). */
function buildSigns(spots: SignSpot[], ctx: BuildCtx): Pick<BuildOut, 'meshes' | 'textures'> | undefined {
  if (!spots.length) return;
  if (typeof OffscreenCanvas === 'undefined') {
    if (!warnedCanvas) console.warn('StreetProps: OffscreenCanvas không có, bỏ qua biển tên đường');
    warnedCanvas = true;
    return;
  }
  const S = P.signs;
  const probe = new OffscreenCanvas(1, 1).getContext('2d')!;
  const pad = 12;
  const SOLID = 16; // px reserved at the atlas top-left: post colour above, border colour below
  const cells = new Map<string, { pre: string; main: string; fs: number; w: number; x: number; y: number }>();
  let [cx, cy] = [SOLID, 0];
  for (const name of new Set(spots.map((s) => s.name))) {
    const [pre, main] = splitName(name);
    let fs = 26;
    probe.font = `bold ${fs}px ${FONT}`;
    const mw = probe.measureText(main).width;
    if (mw > S.cellW - 2 * pad) fs = Math.max(15, Math.floor((fs * (S.cellW - 2 * pad)) / mw));
    probe.font = `bold ${fs}px ${FONT}`;
    const m2 = probe.measureText(main).width;
    probe.font = `bold 13px ${FONT}`;
    const w = Math.min(S.cellW, Math.max(96, Math.ceil(Math.max(m2, probe.measureText(pre).width) + 2 * pad)));
    if (cx + w > S.atlasW) [cx, cy] = [0, cy + S.cellH];
    cells.set(name, { pre, main, fs, w, x: cx, y: cy });
    cx += w;
  }
  const [W, H] = [S.atlasW, cy + S.cellH];
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d');
  if (!g) return void console.warn('StreetProps: không tạo được canvas 2D cho biển tên đường');
  g.fillStyle = S.post;
  g.fillRect(0, 0, SOLID, S.cellH / 2);
  g.fillStyle = S.border;
  g.fillRect(0, S.cellH / 2, SOLID, S.cellH / 2);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of cells.values()) {
    g.fillStyle = S.border;
    g.fillRect(c.x, c.y, c.w, S.cellH);
    g.fillStyle = S.enamel;
    g.fillRect(c.x + 4, c.y + 4, c.w - 8, S.cellH - 8);
    g.strokeStyle = S.text;
    g.lineWidth = 1.5;
    g.strokeRect(c.x + 7.5, c.y + 7.5, c.w - 15, S.cellH - 15);
    g.fillStyle = S.text;
    const mid = c.x + c.w / 2;
    if (c.pre) {
      g.font = `bold 13px ${FONT}`;
      g.fillText(c.pre, mid, c.y + 19, c.w - 2 * pad);
    }
    g.font = `bold ${c.fs}px ${FONT}`;
    g.fillText(c.main, mid, c.y + (c.pre ? 41 : 33), c.w - 2 * pad);
  }
  const image = canvas.transferToImageBitmap();

  // Geometry. uv: v = 0 is the atlas top row (attach sets flipY = false).
  const buf = new MeshBuffer('sign');
  const postUv = [SOLID / 2 / W, S.cellH / 4 / H] as const;
  const edgeUv = [SOLID / 2 / W, (3 * S.cellH) / 4 / H] as const;
  const ph = S.plaqueHeight;
  const t = 0.03; // half thickness
  for (const sp of spots) {
    const c = cells.get(sp.name)!;
    const y = ctx.height(sp.x, sp.z);
    const [y1, y0] = [y + S.postHeight, y + S.postHeight - ph];
    const hl = (ph * c.w) / S.cellH / 2; // half length
    const [dx, dz] = [sp.dx, sp.dz];
    const [nx, nz] = [dz, -dx];
    const P3 = (a: number, b: number, yy: number) => [sp.x + dx * a + nx * b, yy, sp.z + dz * a + nz * b] as const;
    // Text faces: seen from the front, left = −right; right vector for normal n is (nz, −nx).
    for (const side of [1, -1]) {
      const [fx, fz] = [nx * side, nz * side];
      const [rx, rz] = [fz, -fx];
      const q = (r: number, yy: number) => [sp.x + fx * t + rx * r, yy, sp.z + fz * t + rz * r] as const;
      buf.quad(q(-hl, y0), q(hl, y0), q(hl, y1), q(-hl, y1), c.x / W, (c.y + S.cellH) / H, (c.x + c.w) / W, c.y / H);
    }
    // Plaque edges (border colour) and the post (4 sides).
    const [u, v] = edgeUv;
    quadOut(buf, P3(-hl, -t, y1), P3(hl, -t, y1), P3(hl, t, y1), P3(-hl, t, y1), [0, 1, 0], u, v, u, v);
    quadOut(buf, P3(-hl, -t, y0), P3(hl, -t, y0), P3(hl, t, y0), P3(-hl, t, y0), [0, -1, 0], u, v, u, v);
    for (const e of [-hl, hl]) {
      quadOut(buf, P3(e, -t, y0), P3(e, t, y0), P3(e, t, y1), P3(e, -t, y1), [dx * e, 0, dz * e], u, v, u, v);
    }
    const pw = 0.04; // post half-size
    for (const [oa, ob] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const pc = (k: number, yy: number) => P3(oa * pw - ob * pw * k, ob * pw + oa * pw * k, yy);
      const out: [number, number, number] = [dx * oa + nx * ob, 0, dz * oa + nz * ob];
      quadOut(buf, pc(-1, y), pc(1, y), pc(1, y0), pc(-1, y0), out, postUv[0], postUv[1], postUv[0], postUv[1]);
    }
  }
  return { meshes: [buf.bucket()], textures: [{ material: 'sign', image }] };
}

export const buildStreetProps: Builder = (chunk, ctx) => {
  const { owned, points } = findJunctions(chunk, ctx.key);
  const lamps: number[] = [];
  for (const l of placeLamps(chunk, points)) pushMatrix(lamps, l.x, ctx.height(l.x, l.z), l.z, l.yaw);

  const spots = placeSigns(owned);
  const morris: number[] = [];
  for (const j of owned) {
    if (hash01(j.x, j.z, 11) >= 1 / P.morrisOneIn) continue;
    // A corner without a sign of this junction, else any.
    const used = new Set(j.arms.map((a, k) => (spots.some((s) => s.name === a.name && Math.hypot(s.x - j.x, s.z - j.z) < 40) ? k : -1)));
    const free = j.arms.map((_, k) => k).filter((k) => !used.has(k));
    const pick = free.length ? free : j.arms.map((_, k) => k);
    const [x, z] = corner(j, pick[Math.floor(hash01(j.x, j.z, 12) * pick.length)]!, P.cornerInset.morris);
    pushMatrix(morris, x, ctx.height(x, z), z, hash01(x, z, 13) * 2 * Math.PI);
  }

  const metro: number[] = [];
  for (const p of chunk.points) {
    if (p.kind !== 'subway_entrance') continue;
    const d = towardRoad(chunk, p.x, p.z);
    pushMatrix(metro, p.x, ctx.height(p.x, p.z), p.z, d ? Math.atan2(d[0], d[1]) : hash01(p.x, p.z, 14) * 2 * Math.PI);
  }

  const signs = buildSigns(spots, ctx);
  const sets: [PropKind, number[]][] = [['lamp', lamps], ['morris', morris], ['metro', metro]];
  return {
    meshes: signs?.meshes ?? [],
    instances: sets.filter(([, m]) => m.length).map(([kind, m]) => ({ kind, matrices: new Float32Array(m) })),
    colliders: [], // ponytail: props have no colliders; add thin cylinders in Phase 3 if players clip through lamps
    ...(signs?.textures ? { textures: signs.textures } : {}),
  };
};

/** The 'sign' material (its per-chunk atlas arrives as BuildOut.textures and is set on a clone, see attach.ts). */
export function createPropMaterials(): Partial<Record<MaterialId, Material>> {
  return { sign: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05 }) };
}

/** Colours one primitive (vertex colour, linear) after an optional transform. */
function part(g: BufferGeometry, colour: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  g.scale(sx, sy, sz).translate(x, y, z);
  const c = new Color(colour);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  return g;
}

const cyl = (rt: number, rb: number, h: number, seg: number, open = false) => new CylinderGeometry(rt, rb, h, seg, 1, open);

/** Shared mesh per instanced prop kind (≤ props.maxTriangles each), origin at its foot, front = local +Z. */
export function createPropMeshes(): Record<PropKind, { geometry: BufferGeometry; material: Material }> {
  const k = P.treeHeight / 15;
  const tree = [
    part(cyl(0.18, 0.3, 7, 6, true), '#9a9281', 0, 3.5), // mottled plane-tree bark
    part(new SphereGeometry(4.2, 7, 5), '#6a9a4a', 0, 10.4, 0, 1, 0.85, 1),
    part(new SphereGeometry(3.3, 6, 4), '#5f8e42', 2.4, 8.3, 1.1, 1, 0.8, 1),
    part(new SphereGeometry(3.4, 6, 4), '#74a352', -2.1, 8.8, -1.5, 1, 0.8, 1),
  ].map((g) => g.scale(k, k, k));
  const dark = '#1f2723';
  const lamp = [
    part(cyl(0.15, 0.22, 0.9, 6, true), dark, 0, 0.45),
    part(cyl(0.06, 0.08, 3.5, 6, true), dark, 0, 2.65),
    part(cyl(0.26, 0.13, 0.55, 4).rotateY(Math.PI / 4), '#f1e3b3', 0, 4.7), // lantern glass
    part(new ConeGeometry(0.32, 0.3, 4).rotateY(Math.PI / 4), dark, 0, 5.12),
    part(new ConeGeometry(0.05, 0.3, 4), dark, 0, 5.4),
  ];
  const green = '#2e4c38';
  const morris = [
    part(cyl(0.72, 0.76, 0.4, 12), green, 0, 0.2),
    part(cyl(0.62, 0.62, 2.6, 12, true), '#d2c29a', 0, 1.7), // posters
    part(cyl(0.7, 0.7, 0.35, 12), green, 0, 3.17),
    part(new SphereGeometry(0.64, 12, 3, 0, 2 * Math.PI, 0, Math.PI / 2), green, 0, 3.35),
    part(new ConeGeometry(0.1, 0.5, 6), green, 0, 4.2),
  ];
  const guimard = '#3d6b4f';
  const metro = [
    part(new PlaneGeometry(2, 5).rotateX(-Math.PI / 2), '#121212', 0, 0.03, -2.5), // stairwell
    part(new BoxGeometry(0.08, 1, 5), guimard, 1.05, 0.5, -2.5),
    part(new BoxGeometry(0.08, 1, 5), guimard, -1.05, 0.5, -2.5),
    part(new BoxGeometry(2.18, 1, 0.08), guimard, 0, 0.5, -5),
    part(new BoxGeometry(0.12, 3.2, 0.12), guimard, 1.1, 1.6, 0),
    part(new BoxGeometry(0.12, 3.2, 0.12), guimard, -1.1, 1.6, 0),
    part(new BoxGeometry(2.3, 0.36, 0.08), '#e2cf8c', 0, 2.8, 0), // "Métropolitain" board
    part(new SphereGeometry(0.17, 6, 4), '#e0762a', 1.1, 3.35, 0), // lamps
    part(new SphereGeometry(0.17, 6, 4), '#e0762a', -1.1, 3.35, 0),
  ];
  const mesh = (parts: BufferGeometry[], roughness: number) => ({
    geometry: mergeGeometries(parts)!,
    material: new MeshStandardMaterial({ vertexColors: true, roughness }),
  });
  return { tree: mesh(tree, 0.9), lamp: mesh(lamp, 0.5), morris: mesh(morris, 0.7), metro: mesh(metro, 0.6) };
}
