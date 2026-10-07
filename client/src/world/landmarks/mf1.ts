// Leg 2 landmark group mf1 (docs/plans/leg2-landmarks.md §4), tunables in config.ts landmarks.mf1 (published figures
// cited there, the rest "est."). DOM-free (chunk worker). Report: docs/reports/leg2-landmarks-f1.md.
//   Ruínas de São Paulo: the OSM outline with a height (w/1001795463) = the church floor plan, its south edge = the
//     façade (4 tiers + pediment, through doors / windows, niches with the bronze figures, relief panels, columns,
//     buttress ribs behind). The AWS DEM is blurred flat here, so the stone platform and the 68-step great stair are
//     built (terrace box + 4 flights with cheek walls, walkable ramp colliders flagged `stairs`). The outline without a
//     height (w/1001795464, the college remains to the east) and the nave sides get low ruin walls with gaps.
//     Floodlight: the façade is the unlit 'neon' material with the uplight baked into the vertex colours (the worker
//     knows no time of day; a night-only emissive stone would need a material in index.ts).
//   Macau Science Center: podium from the OSM multipolygon (with its courtyard) carrying a glowing window band, the
//     truncated cone with an oblique top and the lit spiral slit, the planetarium hemisphere, the convention hall box.
import { latLonToWorld } from '@race/shared';
import { buildings as B, landmarks as L, lighting, timeOfDay } from '../../config.ts';
import type { BuildingRec, LandmarkId, XZ } from '../../geo/chunkData.ts';
import type { BuildOut, MaterialId, MeshBucket, TriMesh } from '../buildTypes.ts';
import { MeshBuffer, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { box, extrude, footprintFrame, type Frame, loft, place, quadOut, triOut } from './kit.ts';
import { parseColour, partRings, Sink } from './parts.ts';

const R = L.mf1.ruinas;
const S = L.mf1.science;
const col = (hex: string, k = 1): V3 => {
  const [r, g, b] = parseColour(hex)!;
  return [r * k, g * k, b * k];
};

function paint(s: Sink, m: MaterialId, c: V3, lod?: 'near') {
  const b = s.buf(m, lod);
  b.color = c;
  return b;
}

/** Surface of revolution, profile [r, y] bottom → top around the vertical through (cx, cz); faceted, closed on top. */
function lathe(b: MeshBuffer, prof: readonly (readonly [number, number])[], n: number, cx: number, cz: number) {
  const P = (r: number, y: number, a: number): V3 => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  for (let k = 0; k + 1 < prof.length; k++) {
    const [[r0, y0], [r1, y1]] = [prof[k]!, prof[k + 1]!];
    const [nr, ny] = [y1 - y0, r0 - r1];
    for (let s = 0; s < n; s++) {
      const [a0, a1, am] = [(2 * Math.PI * s) / n, (2 * Math.PI * (s + 1)) / n, (2 * Math.PI * (s + 0.5)) / n];
      quadOut(b, P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  const [r, y] = prof.at(-1)!;
  if (r > 1e-3) for (let s = 1; s + 1 < n; s++) triOut(b, P(r, y, 0), P(r, y, (2 * Math.PI * s) / n), P(r, y, (2 * Math.PI * (s + 1)) / n), [0, 1, 0]);
}

/** Draped standing figure proxy (the Paris statue profile), height h, radius r. */
const FIGURE = [[1, 0], [0.8, 0.1], [0.65, 0.45], [0.85, 0.6], [0.95, 0.72], [0.4, 0.8], [0.5, 0.86], [0.45, 0.96], [0.15, 1]] as const;

/** Wall slab x ∈ [x0, x1] × y ∈ [y0, y1] × z ∈ [z0, z1] minus rectangular through-holes [x0, x1, y0, y1] (disjoint in x):
 *  one box per pier, sill and lintel. */
export function slab(b: MeshBuffer, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, holes: readonly (readonly [number, number, number, number])[]) {
  let x = x0;
  for (const h of [...holes].sort((p, q) => p[0] - q[0])) {
    if (h[0] > x + 1e-3) box(b, x, h[0], y0, y1, z0, z1);
    if (h[2] > y0 + 1e-3) box(b, h[0], h[1], y0, h[2], z0, z1);
    if (h[3] < y1 - 1e-3) box(b, h[0], h[1], h[3], y1, z0, z1);
    x = h[1];
  }
  if (x < x1 - 1e-3) box(b, x, x1, y0, y1, z0, z1);
}

/** Local → world for a BuildOut built in frame f (meshes and colliders). */
function placed(o: BuildOut, f: Frame, y0: number): BuildOut {
  for (const m of o.meshes) place(m, f, y0);
  for (const c of o.colliders) {
    const v = c.vertices;
    for (let i = 0; i < v.length; i += 3) {
      const [x, y, z] = [v[i]!, v[i + 1]!, v[i + 2]!];
      [v[i], v[i + 1], v[i + 2]] = [f.cx + x * f.ux - z * f.uz, y0 + y, f.cz + x * f.uz + z * f.ux];
    }
  }
  return o;
}
const join = (...os: BuildOut[]): BuildOut => ({ meshes: os.flatMap((o) => o.meshes), instances: [], colliders: os.flatMap((o) => o.colliders) });

// ── Ruínas de São Paulo ──

/** Façade frame: origin = foot centre of the outline's south edge (the façade), x east along it, local z = south (down
 *  the stair). Pure. */
export function facadeFrame(outer: XZ): Frame {
  let best = { mz: -Infinity, ax: 0, az: 0, bx: 0, bz: 0 };
  for (let i = 0, n = outer.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [outer[i]!, outer[i + 1]!, outer[(i + 2) % n]!, outer[(i + 3) % n]!];
    if ((az + bz) / 2 > best.mz) best = { mz: (az + bz) / 2, ax, az, bx, bz };
  }
  let [ux, uz] = [best.bx - best.ax, best.bz - best.az];
  if (ux < 0) [ux, uz] = [-ux, -uz];
  const l = Math.hypot(ux, uz) || 1;
  return { area: 0, cx: (best.ax + best.bx) / 2, cz: (best.az + best.bz) / 2, ux: ux / l, uz: uz / l, a: l / 2, b: 0 };
}

/** The great stair's nosing line (local z, y relative to the platform top), top landing edge → foot: flights of equal
 *  steps separated by landings. Pure. */
export function stairLine() {
  const { flights, landing, top, bottom } = R.stair;
  const rise = R.terrace.rise;
  const Lf = (bottom - top - (flights - 1) * landing) / flights;
  const n = Math.ceil(rise / flights / 0.16);
  const riser = rise / flights / n;
  const tread = Lf / n;
  return { Lf, n, riser, tread };
}

/** Bakes the floodlight into a 'neon' bucket: stone × (ambient + strength · max(0, n·dir) · (1 − fade · y / height)). y
 *  is local (platform top = 0). Pure (in place). */
export function bakeFlood(bk: MeshBucket) {
  const F = R.flood;
  const stone = col(F.stone, lighting.emissiveScale);
  const d = F.dir;
  const dl = Math.hypot(...d) || 1;
  const { position: p, normal: n, color: c } = bk;
  for (let i = 0; i < p.length; i += 3) {
    const lam = Math.max(0, (n[i]! * d[0] + n[i + 1]! * d[1] + n[i + 2]! * d[2]) / dl);
    const k = F.ambient + F.strength * lam * Math.max(0, 1 - (F.fade * Math.max(0, p[i + 1]!)) / R.height);
    [c![i], c![i + 1], c![i + 2]] = [stone[0] * k, stone[1] * k, stone[2] * k];
  }
}

/** The façade in the local frame (y from the platform top): walls (two layers so the niches are recesses), cornices,
 *  wedges, pediment, cross, dove, columns, figures, back ribs, floodlight boxes. */
function facade(k: Sink) {
  const [W, H, D, t, nz] = [R.width, R.height, R.depth, R.tiers, R.niche];
  const wall = k.buf('neon');
  const near = k.buf('neon', 'near');
  const bronze = k.buf('bronze', 'near');
  const hw = W / 2;
  const w4 = R.tier4Width / 2;
  type Hole = readonly [number, number, number, number];
  const at = (x: number, w: number, y0: number, y1: number): Hole => [x - w / 2, x + w / 2, y0, y1];
  const sym = (x: number, w: number, y0: number, y1: number): Hole[] => [at(-x, w, y0, y1), at(x, w, y0, y1)];
  // tier 1: three doors; tier 2: three windows + the four saints' niches; tier 3: the Virgin's niche + relief panels;
  // tier 4 (narrower): the child Jesus' niche + two panels
  const doors: Hole[] = [at(0, 3.4, 0, 5), ...sym(6.3, 2.2, 0, 4.1)];
  const win2: Hole[] = [at(0, 2, 7.6, 10.8), ...sym(6.3, 2, 7.6, 10.8)];
  const niche2: Hole[] = [...sym(3.3, 1.5, 7.3, 10.8), ...sym(9.3, 1.5, 7.3, 10.8)];
  const niche3: Hole[] = [at(0, 3, 12.9, 16.8)];
  const panel3: Hole[] = [...sym(4.2, 2.4, 13.2, 16.4), ...sym(8.6, 2.2, 13.2, 16.4)];
  const niche4: Hole[] = [at(0, 2.2, 18.2, 21.4)];
  const panel4: Hole[] = sym(4.2, 2.2, 18.5, 21);
  const tier = (x0: number, x1: number, y0: number, y1: number, through: Hole[], recess: Hole[]) => {
    slab(wall, x0, x1, y0, y1, -nz, 0, [...through, ...recess]);
    slab(wall, x0, x1, y0, y1, -D, -nz, through);
  };
  tier(-hw, hw, 0, t[0]!, doors, []);
  tier(-hw, hw, t[0]!, t[1]!, win2, niche2);
  tier(-hw, hw, t[1]!, t[2]!, [], [...niche3, ...panel3]);
  tier(-w4, w4, t[2]!, t[3]!, [], [...niche4, ...panel4]);
  // cornices (entablature bands) and the tier-4 side wedges
  const C = R.cornice;
  for (const [top, half] of [[t[0]!, hw], [t[1]!, hw], [t[2]!, hw], [t[3]!, w4]] as const) box(wall, -half - 0.2, half + 0.2, top - C.h, top, -D, C.out);
  for (const s of [-1, 1]) extrude(wall, [s * w4, t[2]!, s * hw, t[2]!, s * w4, t[2]! + 3.4], 'z', -D, 0);
  // pediment, cross, dove
  const pw = R.pedimentWidth / 2;
  extrude(wall, [-pw, t[3]!, pw, t[3]!, 0, t[4]!], 'z', -D, 0);
  box(near, -0.12, 0.12, t[4]! - 0.2, H, -D / 2 - 0.12, -D / 2 + 0.12);
  box(near, -0.6, 0.6, H - 0.8, H - 0.55, -D / 2 - 0.12, -D / 2 + 0.12);
  const disc = (x: number, y: number, z: number, r: number, b: MeshBuffer) => {
    for (let s = 0; s < 10; s++) {
      const [a0, a1] = [(2 * Math.PI * s) / 10, (2 * Math.PI * (s + 1)) / 10];
      triOut(b, [x, y, z], [x + r * Math.cos(a0), y + r * Math.sin(a0), z], [x + r * Math.cos(a1), y + r * Math.sin(a1), z], [0, 0, 1]);
    }
  };
  disc(0, t[3]! + 1.1, 0.06, 0.7, bronze); // the dove medallion
  // relief panels: a bronze slab in each recess, with a round boss (sun / moon, the instruments of the Passion)
  for (const [x0, x1, y0, y1] of [...panel3, ...panel4]) {
    box(bronze, x0 + 0.15, x1 - 0.15, y0 + 0.15, y1 - 0.15, -nz, -nz + 0.12);
    disc((x0 + x1) / 2, (y0 + y1) / 2, -nz + 0.14, Math.min(x1 - x0, y1 - y0) * 0.3, bronze);
  }
  // columns: a base and capital block, a faceted shaft, standing columnOut in front of the wall
  const cl = R.column;
  const column = (x: number, y0: number, y1: number) => {
    const z = R.columnOut;
    const c = cl.cap / 2;
    box(near, x - c, x + c, y0, y0 + 0.4, z - c, z + c);
    box(near, x - c, x + c, y1 - 0.6, y1, z - c, z + c);
    lathe(near, [[cl.r, y0 + 0.4], [cl.r, y1 - 0.6]], cl.segs, x, z);
  };
  const xs1 = [2.3, 4.5, 8, 10.8];
  for (const [y0, y1, xs] of [[0, t[0]!, xs1], [t[0]!, t[1]!, xs1], [t[1]!, t[2]!, [2.1, 6.45, 10.5]], [t[2]!, t[3]!, [1.7, 6.2]]] as const) {
    for (const x of xs) for (const s of [-1, 1]) column(s * x, y0 + 0.1, y1 - C.h);
  }
  // the bronze figures in the niches (4 Jesuit saints, the Virgin, the child Jesus)
  const st = R.statue;
  for (const [x0, x1, y0] of [...niche2, ...niche3, ...niche4]) lathe(bronze, FIGURE.map(([r, y]) => [r * st.r, y0 + y * st.h] as const), 8, (x0 + x1) / 2, -nz / 2);
  // buttress ribs on the back
  const bt = R.buttress;
  for (let i = 0; i < bt.n; i++) {
    const x = ((i - (bt.n - 1) / 2) * (W - 4)) / Math.max(1, bt.n - 1);
    box(wall, x - bt.w / 2, x + bt.w / 2, 0, t[2]!, -D - bt.d, -D);
  }
  // floodlight boxes on the platform in front of the façade (bright: bloom)
  const lamp = k.buf('neon');
  lamp.color = col(R.flood.lamp, R.flood.lampBright * lighting.emissiveScale);
  for (const [x, z] of R.lamps) box(lamp, x - 0.3, x + 0.3, 0, 0.3, z - 0.25, z + 0.25);
  // collider: the tier-1 piers only (players walk through the doors; the upper façade is out of reach)
  let x = -hw;
  for (const h of [...doors].sort((p, q) => p[0] - q[0])) {
    k.prism([[x, -D, h[0], -D, h[0], 0, x, 0]], 0, t[0]!);
    x = h[1];
  }
  k.prism([[x, -D, hw, -D, hw, 0, x, 0]], 0, t[0]!);
}

/** The platform box and the great stair (local frame, y from the platform top): core + cheek walls (extruded profiles),
 *  treads and risers, landings; colliders: the platform prism, a walkable ramp per flight (`stairs`), the cheeks. */
function platform(k: Sink, hAt: (x: number, z: number) => number, T: number): TriMesh[] {
  const { halfWidth: hw, back } = R.terrace;
  const ST = R.stair;
  const { n, riser, tread } = stairLine();
  const stone = col(L.colours.stone);
  const M = paint(k, 'masonry', stone);
  // platform: down to 1 m under the lowest terrain beneath it
  let lo = Infinity;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) lo = Math.min(lo, hAt(-hw + (i * 2 * hw) / 4, -back + (j * (ST.top + back)) / 4));
  const yb = lo - 1 - T;
  box(M, -hw, hw, yb, 0, -back, ST.top);
  k.prism([[-hw, -back, hw, -back, hw, ST.top, -hw, ST.top]], yb, 0);
  // nosing line (z, y) from the platform edge down: flights of n steps, landings between
  const nose: [number, number][] = [[ST.top - 0.5, 0]];
  const inner: [number, number][] = [[ST.top - 0.5, -0.03]];
  const ramps: TriMesh[] = [];
  const sx = ST.halfWidth - ST.cheek.w; // treads between the cheeks
  let [z, y] = [ST.top, 0];
  const ramp = (za: number, ya: number, zb: number, yb2: number) =>
    ramps.push({ vertices: new Float32Array([-sx, ya, za, sx, ya, za, sx, yb2, zb, -sx, yb2, zb]), indices: new Uint32Array([0, 2, 1, 0, 3, 2]), stairs: true });
  for (let f = 0; f < ST.flights; f++) {
    const [zf, yf] = [z, y];
    for (let s = 0; s < n; s++) {
      const yt = y - riser;
      quadOut(M, [-sx, yt, z], [sx, yt, z], [sx, y, z], [-sx, y, z], [0, 0, 1]); // riser
      quadOut(M, [-sx, yt, z], [sx, yt, z], [sx, yt, z + tread], [-sx, yt, z + tread], [0, 1, 0]); // tread
      inner.push([z, yt - 0.03]);
      [z, y] = [z + tread, yt];
    }
    nose.push([zf, yf], [z, y]);
    ramp(zf, yf, z, y);
    if (f + 1 < ST.flights) {
      quadOut(M, [-sx, y, z], [sx, y, z], [sx, y, z + ST.landing], [-sx, y, z + ST.landing], [0, 1, 0]);
      ramp(z, y, z + ST.landing, y);
      inner.push([z + ST.landing, y - 0.03]);
      z += ST.landing;
    }
  }
  inner.push([z, y - 0.03]);
  nose.push([z, y]);
  // side flights at sideStairs.z, outward along ±x down to the terrain (box steps + one walkable ramp each)
  const SS = R.sideStairs;
  const hz = SS.width / 2;
  for (const sd of [-1, 1]) {
    let [x, yy] = [sd * hw, 0];
    for (let q = 0; q < 80; q++) {
      const xb = x + sd * SS.tread;
      const g = Math.min(hAt(x, SS.z - hz), hAt(xb, SS.z - hz), hAt(x, SS.z + hz), hAt(xb, SS.z + hz)) - T;
      if (yy - SS.riser <= g + 0.02) break;
      box(M, Math.min(x, xb), Math.max(x, xb), g - 0.4, yy - SS.riser, SS.z - hz, SS.z + hz);
      [x, yy] = [xb, yy - SS.riser];
    }
    if (x === sd * hw) continue;
    const [xe, ye] = [x + sd * SS.tread, yy - SS.riser];
    // upward-facing quad: (x0, 0, z−) → (xe, ye, z−) → (xe, ye, z+) → (x0, 0, z+); winding flipped on the west side
    const v = new Float32Array([sd * hw, 0, SS.z - hz, xe, ye, SS.z - hz, xe, ye, SS.z + hz, sd * hw, 0, SS.z + hz]);
    ramps.push({ vertices: v, indices: new Uint32Array(sd > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]), stairs: true });
  }
  // core under the steps and the two cheek walls: profiles extruded along x
  const yLow = -R.terrace.rise - 2;
  const core = [...inner.flat(), z, yLow, ST.top - 0.5, yLow];
  extrude(M, core, 'x', -sx + 0.01, sx - 0.01);
  const ch = ST.cheek;
  const cheek = [...nose.flatMap(([cz, cy]) => [cz, cy + ch.h]), z + 0.3, y + ch.h, z + 0.3, yLow, ST.top - 0.5, yLow];
  const C = paint(k, 'masonry', stone);
  for (const s of [-1, 1]) {
    const b = new MeshBuffer('masonry');
    extrude(b, cheek, 'x', s * sx, s * (sx + ch.w));
    const bk = b.bucket();
    ramps.push({ vertices: bk.position.slice(), indices: bk.index.slice() });
    extrude(C, cheek, 'x', s * sx, s * (sx + ch.w));
  }
  return ramps;
}

/** Low ruin walls with gaps along the given edges (world coords); `top(x, z)` / `bottom(x, z)` give the wall's y. */
function ruinWalls(k: Sink, edges: [number, number, number, number][], top: (x: number, z: number) => number, bottom: (x: number, z: number) => number, collide = true) {
  const RW = R.ruinWall;
  const M = paint(k, 'masonry', col(L.colours.stone, 0.9));
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const [tx, tz] = [(bx - ax) / len, (bz - az) / len];
    const [nx, nzz] = [(-tz * RW.t) / 2, (tx * RW.t) / 2];
    for (let s = 0; s < len; s += RW.gapEvery) {
      const e = Math.min(len, s + RW.gapEvery - RW.gap);
      if (e - s < 1) continue;
      const P = (d: number, side: number): [number, number] => [ax + tx * d + nx * side, az + tz * d + nzz * side];
      const ring = [...P(s, -1), ...P(e, -1), ...P(e, 1), ...P(s, 1)];
      const ys = [P(s, 0), P(e, 0)].map(([x, z]) => top(x, z));
      const yb = Math.min(...[P(s, 0), P(e, 0)].map(([x, z]) => bottom(x, z)));
      const V = (i: number, y: number): V3 => [ring[2 * i]!, y, ring[2 * i + 1]!];
      const yAt = (i: number) => (i === 0 || i === 3 ? ys[0]! : ys[1]!);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        quadOut(M, V(i, yb), V(j, yb), V(j, yAt(j)), V(i, yAt(i)), [-(ring[2 * j + 1]! - ring[2 * i + 1]!), 0, ring[2 * j]! - ring[2 * i]!]);
      }
      quadOut(M, V(0, yAt(0)), V(1, yAt(1)), V(2, yAt(2)), V(3, yAt(3)), [0, 1, 0]);
      if (collide) k.prism([ring], yb, Math.max(...ys));
    }
  }
}

const edgesOf = (outer: XZ, skip?: (mz: number, i: number) => boolean) => {
  const out: [number, number, number, number][] = [];
  let [south, sz] = [-1, -Infinity];
  for (let i = 0, n = outer.length; i < n; i += 2) {
    const mz = (outer[i + 1]! + outer[(i + 3) % n]!) / 2;
    if (mz > sz) [south, sz] = [i, mz];
  }
  for (let i = 0, n = outer.length; i < n; i += 2) {
    if (skip?.(south, i)) continue;
    out.push([outer[i]!, outer[i + 1]!, outer[(i + 2) % n]!, outer[(i + 3) % n]!]);
  }
  return out;
};

/** Which Ruínas record this is (the registry may carry several outlines). Pure. */
export function classify(rec: BuildingRec): 'nave' | 'facade' | 'museum' | 'college' {
  if (rec.height === undefined) return 'college'; // w/1001795464: the college remains, no height
  if (footprintFrame(rec.outer).b < 2) return 'facade'; // w/192183185: the 2 m thin slab of the façade itself (built from the nave)
  return rec.height > 28 ? 'museum' : 'nave'; // w/192573692 (h 30.3) behind the nave; w/1001795463 (h 26.4) = the nave
}

const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };

export function ruinas(rec: BuildingRec, ctx: LandmarkCtx, h?: Pick<Helpers, 'renderPart'>): BuildOut {
  const kind = classify(rec);
  if (kind === 'facade') return EMPTY;
  if (kind === 'college') {
    const k = new Sink();
    // no collider (Leg 2 fix): knee-high remains whose gaps do not match the OSM footways running through the college
    ruinWalls(k, edgesOf(rec.outer), (x, z) => ctx.height(x, z) + R.ruinWall.h, (x, z) => ctx.height(x, z) - B.baseSink, false);
    return k.out();
  }
  if (kind === 'museum') {
    const k = new Sink();
    h?.renderPart({ ...rec, height: R.museumTop, roofShape: 'flat' }, { ground: ctx.ground, height: ctx.height, fallbackTop: R.museumTop }, k);
    return k.out();
  }
  const f = facadeFrame(rec.outer);
  const hAt = (x: number, z: number) => ctx.height(f.cx + x * f.ux - z * f.uz, f.cz + x * f.uz + z * f.ux);
  const T = hAt(0, R.stair.bottom) + R.terrace.rise; // platform top: the climb above the foot of the stair
  const kf = new Sink();
  facade(kf);
  const fo = kf.out();
  for (const m of fo.meshes) {
    for (let i = 2; i < m.position.length; i += 3) m.position[i]! += R.front; // onto the OSM façade line
    if (m.material === 'neon' && m.color) bakeFlood(m);
  }
  for (const c of fo.colliders) for (let i = 2; i < c.vertices.length; i += 3) c.vertices[i]! += R.front;
  placed(fo, f, T);
  const kp = new Sink();
  const ramps = platform(kp, hAt, T);
  const po = placed(kp.out(), f, T);
  for (const r of ramps) placed({ meshes: [], instances: [], colliders: [r] }, f, T);
  const nave = new Sink();
  ruinWalls(nave, edgesOf(rec.outer, (south, i) => i === south), () => T + R.ruinWall.h, () => T - 0.3);
  return join(fo, po, { meshes: [], instances: [], colliders: ramps }, nave.out());
}

// ── Macau Science Center ──

export function science(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const k = new Sink();
  const rings = partRings(rec);
  if (!rings) return k.out();
  const C = S.colours;
  const g = ctx.ground;
  const yb = ctx.minGround - B.baseSink;
  const top = g + S.podium.h;
  const [b0, b1] = [g + S.podium.band[0], g + S.podium.band[1]];
  const M = paint(k, 'masonry', col(C.podium));
  const N = paint(k, 'neon', col(C.band, S.bandBright * lighting.emissiveScale));
  const wall = (b: MeshBuffer, r: XZ, y0: number, y1: number) => {
    for (let i = 0, n = r.length; i < n; i += 2) {
      const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
      quadOut(b, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [-(bz - az), 0, bx - ax]);
    }
  };
  const cap = (b: MeshBuffer, rs: XZ[], y: number) => {
    const idx = triangulate(rs[0]!, rs.slice(1));
    const pts = rs.flat();
    const at = (i: number): V3 => [pts[2 * i]!, y, pts[2 * i + 1]!];
    for (let t = 0; t < idx.length; t += 3) triOut(b, at(idx[t]!), at(idx[t + 1]!), at(idx[t + 2]!), [0, 1, 0]);
  };
  // podium (exhibition wing) with the window band
  for (const r of rings) {
    wall(M, r, yb, b0);
    wall(N, r, b0, b1);
    wall(M, r, b1, top);
  }
  cap(M, rings, top);
  k.prism(rings, yb, top);
  // the cone: straight generatrix r(y) = R0 − kc·y around an axis leaning `lean` m/m away from lowAz (oblique cone), cut by
  // a plane through the axis at h, falling towards lowAz: y = h − tilt·d, d = distance from the axis(h) towards lowAz
  const cn = S.cone;
  const c = latLonToWorld(cn.lat, cn.lon);
  const kc = (cn.r * (1 - cn.topShare)) / cn.h;
  const tilt = Math.tan((cn.tiltDeg * Math.PI) / 180);
  const [lx, lz] = [Math.sin((cn.lowAz * Math.PI) / 180), -Math.cos((cn.lowAz * Math.PI) / 180)];
  const cut = (phi: number) => {
    const cs = Math.cos(phi) * lx + Math.sin(phi) * lz;
    return (cn.h * (1 - tilt * cn.lean) - tilt * cs * cn.r) / (1 - tilt * cn.lean - tilt * kc * cs);
  };
  const ring = (y: number, phi: number): V3 => {
    const r = cn.r - kc * y;
    return [c.x - lx * cn.lean * y + r * Math.cos(phi), g + y, c.z - lz * cn.lean * y + r * Math.sin(phi)];
  };
  // the moon would turn the grey metal dark blue: the vertex colour is lifted (> 1 is fine, the shading stays) so it reads as by day
  const clad = paint(k, 'metal', col(C.clad, timeOfDay === 'night' ? S.nightCladBoost : 1));
  const y0 = yb - g;
  for (let s = 0; s < cn.segs; s++) {
    const [p0, p1, pm] = [(2 * Math.PI * s) / cn.segs, (2 * Math.PI * (s + 1)) / cn.segs, (2 * Math.PI * (s + 0.5)) / cn.segs];
    quadOut(clad, ring(y0, p0), ring(y0, p1), ring(cut(p1), p1), ring(cut(p0), p0), [Math.cos(pm), kc, Math.sin(pm)]);
    triOut(clad, [c.x - lx * cn.lean * cn.h, g + cn.h, c.z - lz * cn.lean * cn.h], ring(cut(p0), p0), ring(cut(p1), p1), [0, 1, 0]);
  }
  const base: XZ = [];
  for (let s = 0; s < 24; s++) base.push(c.x + cn.r * Math.cos((2 * Math.PI * s) / 24), c.z + cn.r * Math.sin((2 * Math.PI * s) / 24));
  k.prism([base], yb, g + cn.h * 0.9);
  // the lit spiral slit (follows the inner ramp), on the cone surface `out` m proud
  const sp = S.spiral;
  const glow = paint(k, 'neon', col(C.spiral, sp.bright * lighting.emissiveScale));
  const yMax = Math.min(cut(Math.atan2(lz, lx)), cut(0)) * sp.y1Share;
  const nSeg = Math.round(sp.turns * cn.segs);
  const sPt = (j: number, dy: number): V3 => {
    const t = j / nSeg;
    const phi = 2 * Math.PI * sp.turns * t;
    const y = sp.y0 + (yMax - sp.h - sp.y0) * t + dy;
    const r = cn.r - kc * y + sp.out;
    return [c.x - lx * cn.lean * y + r * Math.cos(phi), g + y, c.z - lz * cn.lean * y + r * Math.sin(phi)];
  };
  for (let j = 0; j < nSeg; j++) {
    const phi = (2 * Math.PI * sp.turns * (j + 0.5)) / nSeg;
    quadOut(glow, sPt(j, 0), sPt(j + 1, 0), sPt(j + 1, sp.h), sPt(j, sp.h), [Math.cos(phi), kc, Math.sin(phi)]);
  }
  // planetarium: hemisphere on the podium
  const dm = S.dome;
  const d = latLonToWorld(dm.lat, dm.lon);
  const dRings: V3[][] = [];
  for (let i = 0; i < dm.rings; i++) {
    const th = ((i / dm.rings) * Math.PI) / 2;
    dRings.push(Array.from({ length: dm.segs }, (_, s): V3 => [d.x + dm.r * Math.cos(th) * Math.cos((2 * Math.PI * s) / dm.segs), top - 0.3 + dm.r * Math.sin(th), d.z + dm.r * Math.cos(th) * Math.sin((2 * Math.PI * s) / dm.segs)]));
  }
  loft(clad, dRings);
  const last = dRings.at(-1)!;
  for (let s = 0; s < dm.segs; s++) triOut(clad, [d.x, top - 0.3 + dm.r, d.z], last[s]!, last[(s + 1) % dm.segs]!, [0, 1, 0]);
  // convention hall (NE block)
  const hall = partRings({ outer: S.hall.corners.flatMap(([lat, lon]) => { const p = latLonToWorld(lat, lon); return [p.x, p.z]; }) });
  if (hall) {
    const Hm = paint(k, 'masonry', col(C.hall));
    wall(Hm, hall[0]!, top - 0.5, g + S.hall.h);
    cap(Hm, hall, g + S.hall.h);
  }
  return k.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'ruinas-sao-paulo': (rec, _parts, ctx, h) => ruinas(rec, ctx, h),
  'science-center': (rec, _parts, ctx) => science(rec, ctx),
};
