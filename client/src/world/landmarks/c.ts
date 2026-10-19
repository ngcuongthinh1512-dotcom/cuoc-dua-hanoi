// Leg 3 (Brussels) landmark details, part 2 (b.ts holds the first three): churches, the cathedral, Maison du Roi, the two palaces,
// Bourse / La Monnaie porticoes, Berlaymont's glass skin, tower crowns. Everything is built on top of the OSM footprint and stays
// non-solid (SPEC §5.9); only the generic body (renderPart) adds a collider. Front directions (compass °) are eyeballed from the map,
// numbers marked "ước lượng" in docs/reports/leg3-landmarks.md are estimates, not surveyed values.
import type { BuildOut } from '../buildTypes.ts';
import type { BuildingRec, LandmarkId, PartRec } from '../../geo/chunkData.ts';
import type { V3 } from '../geom.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, ring, spire, UP, withExtras } from './b.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof loft>[0];
const SQ2 = Math.SQRT2;

// ── frame helpers ──

/** Footprint frame with +u turned toward the façade (compass az in °, 0 = north, or 'origin' = the Grand-Place); a / b = half
 *  depth / half width then. */
export function facing(rec: BuildingRec, az: number | 'origin'): Fr {
  const f = footprintFrame(rec.outer);
  const [dx, dz] = az === 'origin' ? [-f.cx, -f.cz] : [Math.sin((az * Math.PI) / 180), -Math.cos((az * Math.PI) / 180)];
  const [wx, wz] = [-f.uz, f.ux];
  const du = dx * f.ux + dz * f.uz;
  const dw = dx * wx + dz * wz;
  if (Math.abs(du) >= Math.abs(dw)) {
    const s = du < 0 ? -1 : 1;
    return { ...f, ux: s * f.ux, uz: s * f.uz };
  }
  const s = dw < 0 ? -1 : 1;
  return { ...f, ux: s * wx, uz: s * wz, a: f.b, b: f.a };
}

/** Local (a, w) of a world point in frame f. */
const loc = (f: Fr, x: number, z: number): [number, number] => [(x - f.cx) * f.ux + (z - f.cz) * f.uz, -(x - f.cx) * f.uz + (z - f.cz) * f.ux];

/** Largest a on the outline along the line w = const (the façade line there); f.a when the line misses. */
export function frontAt(rec: BuildingRec, f: Fr, w: number): number {
  const o = rec.outer;
  let best = -Infinity;
  for (let i = 0, n = o.length; i < n; i += 2) {
    const [a0, w0] = loc(f, o[i]!, o[i + 1]!);
    const [a1, w1] = loc(f, o[(i + 2) % n]!, o[(i + 3) % n]!);
    if ((w0 - w) * (w1 - w) > 0 || w0 === w1) continue;
    best = Math.max(best, a0 + ((w - w0) / (w1 - w0)) * (a1 - a0));
  }
  return Number.isFinite(best) ? best : f.a;
}

/** Whether the frame point (a, w) lies inside the outline (holes ignored). */
function inside(rec: BuildingRec, f: Fr, a: number, w: number): boolean {
  const [x, z] = [f.cx + a * f.ux - w * f.uz, f.cz + a * f.uz + w * f.ux];
  const o = rec.outer;
  let r = false;
  for (let i = 0, j = o.length - 2; i < o.length; j = i, i += 2) {
    if (o[i + 1]! > z !== o[j + 1]! > z && x < ((o[j]! - o[i]!) * (z - o[i + 1]!)) / (o[j + 1]! - o[i + 1]!) + o[i]!) r = !r;
  }
  return r;
}

/** Bounding box of a part in frame f: [a0, a1, w0, w1]. */
function bbox(f: Fr, p: { outer: number[] }): [number, number, number, number] {
  let [a0, a1, w0, w1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < p.outer.length; i += 2) {
    const [a, w] = loc(f, p.outer[i]!, p.outer[i + 1]!);
    [a0, a1, w0, w1] = [Math.min(a0, a), Math.max(a1, a), Math.min(w0, w), Math.max(w1, w)];
  }
  return [a0, a1, w0, w1];
}

// ── shapes ──

const sq = (f: Fr, a: number, w: number, hs: number, y: number) => ring(f, a, w, hs * SQ2, y, 4);
const dirU = (f: Fr): V3 => [f.ux, 0, f.uz];
const dirW = (f: Fr): V3 => [-f.uz, 0, f.ux];

/** Gable prism: ridge along a, base y0, ridge y1; both end triangles + both slopes. */
function gable(buf: Buf, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) {
  const wm = (w0 + w1) / 2;
  const [A, B, C, D] = [P(f, a0, y0, w0), P(f, a1, y0, w0), P(f, a1, y0, w1), P(f, a0, y0, w1)];
  const [R0, R1] = [P(f, a0, y1, wm), P(f, a1, y1, wm)];
  const wd = dirW(f);
  quadOut(buf, A, B, R1, R0, [-wd[0], 0.8, -wd[2]]);
  quadOut(buf, D, C, R1, R0, [wd[0], 0.8, wd[2]]);
  const u = dirU(f);
  triOut(buf, A, D, R0, [-u[0], 0, -u[2]]);
  triOut(buf, B, C, R1, u);
}

/** Round tower / pinnacle: rings [radius, y] (n-gon at (a, w)); a last radius 0 closes it with a spire. */
function lathe(buf: Buf, f: Fr, a: number, w: number, prof: [number, number][], n = 8) {
  const rs = prof.filter(([r]) => r > 0.02).map(([r, y]) => ring(f, a, w, r, y, n));
  if (rs.length > 1) loft(buf, rs, 4);
  const last = prof.at(-1)!;
  if (last[0] <= 0.02) spire(buf, rs.at(-1)!, P(f, a, last[1], w));
  else cap(buf, rs.at(-1)!, UP);
}

/** Vertical quad between two points of the frame (a, w), y0 → y1, normal out. */
const vq = (buf: Buf, f: Fr, [a0, w0]: [number, number], [a1, w1]: [number, number], y0: number, y1: number, out: V3) =>
  quadOut(buf, P(f, a0, y0, w0), P(f, a1, y0, w1), P(f, a1, y1, w1), P(f, a0, y1, w0), out);

/** Flat polygon (a, w, y triples as [w, y] pairs on plane a), facing +u (or −u with dir = −1), fan-triangulated (convex only). */
function plane(buf: Buf, f: Fr, a: number, pts: [number, number][], dir = 1) {
  const u = dirU(f);
  const out: V3 = [u[0] * dir, 0, u[2] * dir];
  for (let i = 1; i + 1 < pts.length; i++) triOut(buf, P(f, a, pts[0]![1], pts[0]![0]), P(f, a, pts[i]![1], pts[i]![0]), P(f, a, pts[i + 1]![1], pts[i + 1]![0]), out);
}

/** Pointed (or round) arch opening on plane a between w0 and w1: straight sides to `spring`, crown at `crown`. */
function arch(buf: Buf, f: Fr, a: number, w0: number, w1: number, y0: number, spring: number, crown: number, pointed = true, dir = 1) {
  const wm = (w0 + w1) / 2;
  const pts: [number, number][] = [[w0, y0], [w1, y0], [w1, spring]];
  const n = 6;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    pts.push([w1 + (wm - w1) * (pointed ? Math.sin((t * Math.PI) / 2) ** 1.4 : 1 - Math.cos((t * Math.PI) / 2)), spring + (crown - spring) * (pointed ? 1 - (1 - t) ** 2 : Math.sin((t * Math.PI) / 2))]);
  }
  pts.push([wm, crown]);
  for (let k = n - 1; k >= 1; k--) pts.push([2 * wm - pts[3 + k - 1]![0], pts[3 + k - 1]![1]]);
  pts.push([w0, spring]);
  plane(buf, f, a, pts, dir);
}

/** Disc (rose window / clock face) on plane a, centre (w, y). */
function disc(buf: Buf, f: Fr, a: number, w: number, y: number, r: number, dir = 1, n = 14) {
  plane(buf, f, a, Array.from({ length: n }, (_, k): [number, number] => [w + r * Math.cos((2 * Math.PI * k) / n), y + r * Math.sin((2 * Math.PI * k) / n)]), dir);
}

/** A column: shaft + capital slab. */
function column(buf: Buf, f: Fr, a: number, w: number, r: number, y0: number, y1: number) {
  loft(buf, [ring(f, a, w, r, y0, 8), ring(f, a, w, r * 0.85, y1 - r * 0.5, 8)], 4);
  fbox(buf, f, a - r * 1.3, a + r * 1.3, w - r * 1.3, w + r * 1.3, y1 - r * 0.5, y1);
}

interface Portico {
  a: number; // front line of the columns (frame a)
  w0: number;
  w1: number; // outer column axes
  n: number; // columns
  r: number;
  y0: number;
  y1: number; // column foot / capital top
  depth: number;
  pediment?: number; // peak height above the entablature
}
/** Columns + entablature (+ pediment) + two steps; the back wall is the building's. */
function portico(s: Sink, f: Fr, p: Portico, stone = '#d8cdb4') {
  const st = s.buf('masonry');
  st.color = rgb(stone);
  for (let k = 0; k < p.n; k++) column(st, f, p.a, p.w0 + ((p.w1 - p.w0) * k) / (p.n - 1), p.r, p.y0, p.y1);
  const eh = p.r * 2.4;
  fbox(st, f, p.a - p.depth, p.a + p.r * 1.4, p.w0 - p.r * 2, p.w1 + p.r * 2, p.y1, p.y1 + eh);
  if (p.pediment) gable(st, f, p.a - p.depth, p.a + p.r * 1.4, p.w0 - p.r * 2, p.w1 + p.r * 2, p.y1 + eh, p.y1 + eh + p.pediment);
  for (let k = 0; k < 2; k++) fbox(st, f, p.a - p.depth, p.a + p.r * 1.4 + 1.2 * (2 - k), p.w0 - p.r * 2.5, p.w1 + p.r * 2.5, p.y0 - 0.3, p.y0 + 0.4 - 0.4 * k);
}

const SLATE = '#4f565e';
const STONE = '#d6cbb1';

/** Render a footprint through the generic S3DB renderer with overridden roof facts. */
function body(rec: BuildingRec, ctx: LandmarkCtx, h: Helpers, s: Sink, over: Partial<PartRec>) {
  const o = { ground: ctx.ground, height: ctx.height, fallbackTop: h.outlineTop(rec, ctx.def) };
  h.renderPart({ ...rec, ...over }, o, s);
}

// ── towers (square shaft + cap), used by churches and the Tour Sainte-Catherine ──

type CapKind = 'pyramid' | 'needle' | 'baroque';
function towerAt(s: Sink, f: Fr, a: number, w: number, hs: number, y0: number, h: number, kind: CapKind, wall = STONE, round = false) {
  const st = s.buf('masonry');
  st.color = rgb(wall);
  if (round) {
    lathe(st, f, a, w, [[hs, y0], [hs * 0.94, y0 + h]], 16);
    const band = s.buf('masonry');
    band.color = rgb('#3a3835');
    lathe(band, f, a, w, [[hs * 0.945, y0 + h * 0.72], [hs * 0.945, y0 + h * 0.9]], 16);
  } else loft(st, [sq(f, a, w, hs, y0), sq(f, a, w, hs * 0.94, y0 + h)], 4);
  const dark = s.buf('masonry');
  dark.color = rgb('#3a3835'); // belfry openings: a dark band with pointed slits on all four faces
  for (const [ua, uw] of (round ? [] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) as readonly (readonly [number, number])[]) {
    const out: V3 = [ua * f.ux - uw * f.uz, 0, ua * f.uz + uw * f.ux];
    const [ca, cw] = [a + ua * (hs + 0.06), w + uw * (hs + 0.06)];
    for (const k of [-0.45, 0.45]) {
      const [s0, s1] = [k * hs - hs * 0.2, k * hs + hs * 0.2];
      vq(dark, f, [ca + uw * s0, cw - ua * s0], [ca + uw * s1, cw - ua * s1], y0 + h * 0.72, y0 + h * 0.9, out);
    }
  }
  const roof = s.buf('metal');
  roof.color = rgb(SLATE);
  const top = y0 + h;
  if (kind === 'pyramid') spire(roof, sq(f, a, w, hs * 1.04, top), P(f, a, top + hs * 2.2, w));
  else if (kind === 'needle') lathe(roof, f, a, w, [[hs * 1.3, top], [hs * 0.85, top + hs * 0.8], [hs * 0.55, top + hs * 2.6], [0, top + hs * 5.5]]);
  else lathe(roof, f, a, w, [[hs * 1.25, top], [hs * 0.9, top + hs * 0.6], [hs * 1.15, top + hs * 1.5], [hs * 0.7, top + hs * 2.4], [hs * 0.25, top + hs * 3.2], [0, top + hs * 4.4]]);
  const g = s.buf('gold');
  const gy = top + (kind === 'pyramid' ? hs * 2.2 : kind === 'needle' ? hs * 5.5 : hs * 4.4);
  lathe(g, f, a, w, [[0.25, gy - 0.2], [0.15, gy + 1.4], [0, gy + 2.2]], 6);
}

// ── churches ──

interface ChurchOpts {
  az: number | 'origin';
  wall: number; // eaves, m above ground
  roof: number; // ridge over the eaves (≤ 1.1 × half width)
  towers: 0 | 1 | 2;
  th: number; // tower height above ground
  tw: number; // tower half width
  cap: CapKind;
  stone?: string;
  slate?: string;
  portal?: boolean; // dark pointed portal on the façade
  fleche?: number; // slender spire over the middle of the roof (height above ridge)
}

const church = (o: ChurchOpts): DetailFn => (rec, _parts, ctx, h) => {
  const f = facing(rec, o.az);
  const s = new Sink();
  const roof = Math.min(o.roof, f.b * 1.1);
  body(rec, ctx, h, s, { height: o.wall + roof, roofShape: 'gabled', roofHeight: roof, colour: o.stone ?? '#d2c6a8', roofColour: o.slate ?? SLATE, levels: undefined, material: undefined, roofMaterial: undefined });
  const y0 = ctx.minGround - 0.3;
  const tw = Math.min(o.tw, f.b * 0.55);
  const sites = o.towers === 2 ? [-(f.b - tw - 0.4), f.b - tw - 0.4] : o.towers === 1 ? [0] : [];
  for (const w of sites) {
    const aF = frontAt(rec, f, w);
    towerAt(s, f, aF + 0.05 - tw, w, tw, y0, o.th - y0 + ctx.ground, o.cap, o.stone ?? '#d2c6a8');
  }
  if (o.portal !== false) {
    const dark = s.buf('masonry');
    dark.color = rgb('#3a3632');
    const aF = frontAt(rec, f, 0);
    const wid = Math.min(2.2, f.b * 0.25);
    arch(dark, f, aF + (o.towers === 1 ? tw : 0) + 0.3, -wid, wid, ctx.ground, ctx.ground + 4, ctx.ground + 7.5);
  }
  if (o.fleche) {
    const r = s.buf('metal');
    r.color = rgb(SLATE);
    const ra = f.a * 0.1;
    const ry = ctx.ground + o.wall + roof;
    lathe(r, f, ra, 0, [[1.3, ry - 1], [0.9, ry + o.fleche * 0.5], [0.5, ry + o.fleche * 0.85], [0, ry + o.fleche]]);
  }
  return s.out();
};

// ── Cathédrale Saints-Michel-et-Gudule ──

const cathedral: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const f = facing(rec, 270); // the façade looks west, down the hill
  const s = new Sink();
  const stone = s.buf('masonry');
  const dark = s.buf('masonry');
  const roofB = s.buf('metal');
  const towers = parts.filter((p) => (p.height ?? 0) >= 60 && !p.roofShape).map((p) => bbox(f, p)).sort((a, b) => a[2] - b[2]);
  const g = ctx.ground;
  for (const [a0, a1, w0, w1] of towers) {
    const [ca, cw] = [(a0 + a1) / 2, (w0 + w1) / 2];
    const hs = Math.min(a1 - a0, w1 - w0) / 2 - 0.8;
    stone.color = rgb('#cfc5ac');
    loft(stone, [sq(f, ca, cw, hs, g + 62), sq(f, ca, cw, hs, g + 69)], 4); // the real towers reach ≈ 69 m
    cap(stone, sq(f, ca, cw, hs, g + 69), UP);
    stone.color = rgb('#bdb398');
    for (const [da, dw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) { // corner pinnacles
      lathe(stone, f, ca + da * hs, cw + dw * hs, [[1.1, g + 66], [0.9, g + 71], [0.35, g + 73], [0, g + 75.5]], 6);
    }
    dark.color = rgb('#3d3a35'); // lancet openings on the west face
    for (const [y0, y1] of [[g + 36, g + 49], [g + 53, g + 62]] as const)
      for (const k of [-0.42, 0.42]) arch(dark, f, a1 + 0.1, cw + k * hs - 0.7, cw + k * hs + 0.7, y0, y1 - 3, y1);
  }
  if (towers.length === 2) {
    const [t0, t1] = towers as [typeof towers[0], typeof towers[0]];
    const [w0, w1] = [t0[3], t1[2]];
    const wm = (w0 + w1) / 2;
    const aF = frontAt(rec, f, wm);
    dark.color = rgb('#38352f');
    arch(dark, f, aF + 0.2, wm - 2.6, wm + 2.6, g, g + 8, g + 15); // main portal
    // rose window above it + stone gable
    stone.color = rgb('#d3c9b0');
    const gy = g + 30;
    disc(dark, f, aF + 0.2, wm, gy, 3.4);
    stone.color = rgb('#9fb0c4');
    disc(stone, f, aF + 0.26, wm, gy, 2.6);
    arch(dark, f, aF + 0.2, wm - 1.2, wm + 1.2, g + 18, g + 22, g + 26);
    stone.color = rgb('#d3c9b0');
    gable(stone, f, aF - 3, aF + 0.1, w0 + 0.3, w1 - 0.3, g + 39.5, g + 46); // west gable of the nave, between the towers
  }
  roofB.color = rgb(SLATE);
  return withExtras(base, s);
};

// ── Maison du Roi (Broodhuis): neo-Gothic, steep slate roof, corner turrets, ground arcade ──

const maisonDuRoi: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 'origin');
  const s = new Sink();
  body(rec, ctx, h, s, { height: 31, roofShape: 'hipped', roofHeight: 10, colour: '#d9cdb0', roofColour: SLATE, levels: undefined });
  const g = ctx.ground;
  const st = s.buf('masonry');
  st.color = rgb('#cfc4a8');
  const roof = s.buf('metal');
  roof.color = rgb('#3f6f62'); // turret caps: green copper
  for (const [da, dw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const [a, w] = [da * (f.a - 2.1), dw * (f.b - 2.1)];
    if (!inside(rec, f, a, w)) continue;
    lathe(st, f, a, w, [[1.9, g + 6], [1.7, g + 24], [2.1, g + 25]]);
    lathe(roof, f, a, w, [[2.3, g + 25], [1.4, g + 29], [0, g + 36]]);
    const gold = s.buf('gold');
    lathe(gold, f, a, w, [[0.2, g + 35.5], [0, g + 38]], 6);
  }
  const dark = s.buf('masonry');
  dark.color = rgb('#33302c');
  for (const sign of [1, -1]) { // a gallery of pointed arches along the ground floor of both long faces
    const wl = sign * (f.b + 0.12);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const ac = -f.a + ((k + 0.5) * 2 * f.a) / n;
      if (!inside(rec, f, ac, sign * (f.b - 0.6))) continue;
      const pts: [number, number][] = [[ac - 1, 0], [ac + 1, 0], [ac + 1, 4.2], [ac, 6.4], [ac - 1, 4.2]];
      for (let i = 1; i + 1 < pts.length; i++) {
        const [p0, p1, p2] = [pts[0]!, pts[i]!, pts[i + 1]!];
        triOut(dark, P(f, p0[0], g + p0[1], wl), P(f, p1[0], g + p1[1], wl), P(f, p2[0], g + p2[1], wl), [dirW(f)[0] * sign, 0, dirW(f)[2] * sign]);
      }
    }
  }
  // the front (looking at the Grand-Place): five arches, gabled centre bay
  const aF = f.a + 0.12;
  for (let k = 0; k < 5; k++) {
    const wc = -f.b + ((k + 0.5) * 2 * f.b) / 5;
    if (inside(rec, f, f.a - 0.6, wc)) arch(dark, f, aF, wc - 1.1, wc + 1.1, g, g + 4.2, g + 6.4);
  }
  st.color = rgb('#d6cbb1');
  gable(st, f, f.a - 1.2, f.a + 0.3, -f.b * 0.35, f.b * 0.35, g + 24, g + 34);
  return s.out();
};

// ── Palais de Justice (Poelaert): giant block, peristyle, drum + dome ──

const palaisDeJustice: DetailFn = (rec, parts, ctx, h) => {
  const f = facing(rec, 30);
  const g = ctx.ground;
  const rest = parts.filter((p) => p.roofShape !== 'dome'); // the OSM dome is a thin cylinder: replaced below
  const base = h.generic(rec, rest, ctx);
  const s = new Sink();
  const dome = parts.find((p) => p.roofShape === 'dome');
  const [a0, a1, w0, w1] = dome ? bbox(f, dome) : [-3, 18, -10, 12];
  const [ca, cw] = [(a0 + a1) / 2, (w0 + w1) / 2];
  const base0 = ctx.def.height ?? 48;
  const st = s.buf('masonry');
  st.color = rgb('#d6ccb2');
  const R = 17;
  lathe(st, f, ca, cw, [[R * 1.15, g + base0 - 1], [R, g + base0 + 2], [R * 0.92, g + base0 + 26], [R * 1.02, g + base0 + 28]], 20); // drum
  st.color = rgb('#c3b99e');
  for (let k = 0; k < 16; k++) { // drum colonnade
    const ph = (2 * Math.PI * k) / 16;
    column(st, f, ca + (R + 0.8) * Math.cos(ph), cw + (R + 0.8) * Math.sin(ph), 0.6, g + base0 + 2, g + base0 + 24);
  }
  const dm = s.buf('metal');
  dm.color = rgb('#56626b'); // zinc-grey dome
  lathe(dm, f, ca, cw, [[R * 1.0, g + base0 + 28], [R * 0.96, g + base0 + 34], [R * 0.78, g + base0 + 43], [R * 0.45, g + base0 + 51], [R * 0.2, g + base0 + 55], [R * 0.17, g + base0 + 59]], 20);
  const gd = s.buf('gold');
  lathe(gd, f, ca, cw, [[1.2, g + base0 + 58], [0.7, g + base0 + 60], [0, g + base0 + 62]], 8);
  // front: 8 columns portico over the main entrance
  const aF = frontAt(rec, f, 0);
  portico(s, f, { a: aF + 5, w0: -26, w1: 26, n: 8, r: 1.6, y0: g + 6, y1: g + 34, depth: 5, pediment: 8 }, '#d6ccb2');
  return withExtras(base, s);
};

// ── Palais de la Nation: neoclassical, Corinthian portico, pitched slate roofs ──

const palaisDeLaNation: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 190);
  const g = ctx.ground;
  const s = new Sink();
  body(rec, ctx, h, s, { height: 26, roofShape: 'hipped', roofHeight: 7, colour: '#d8cdb3', roofColour: SLATE, levels: undefined });
  const aF = frontAt(rec, f, 0);
  portico(s, f, { a: aF + 4, w0: -f.b * 0.28, w1: f.b * 0.28, n: 6, r: 0.9, y0: g + 1, y1: g + 16, depth: 4, pediment: 4.5 });
  return s.out();
};

// ── Bourse / La Monnaie: colonnaded fronts ──

const bourse: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 'origin');
  const g = ctx.ground;
  const s = new Sink();
  body(rec, ctx, h, s, { height: 31, roofShape: 'hipped', roofHeight: 7, colour: '#d5cab0', roofColour: '#5b6870', levels: undefined, roofLevels: undefined });
  const aF = frontAt(rec, f, 0);
  portico(s, f, { a: aF + 3.5, w0: -f.b * 0.6, w1: f.b * 0.6, n: 10, r: 0.8, y0: g + 2, y1: g + 17, depth: 3.5, pediment: 4.5 });
  return s.out();
};

const laMonnaie: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 'origin');
  const g = ctx.ground;
  const s = new Sink();
  body(rec, ctx, h, s, { height: 28, roofShape: 'flat', colour: '#d9cfb8', levels: undefined });
  const aF = frontAt(rec, f, 0);
  portico(s, f, { a: aF + 3, w0: -f.b * 0.6, w1: f.b * 0.6, n: 6, r: 0.75, y0: g + 2, y1: g + 14, depth: 3, pediment: 3.5 });
  const st = s.buf('masonry');
  st.color = rgb('#b5ab92'); // stage house rising behind the front block
  fbox(st, f, -f.a, -f.a * 0.1, -f.b * 0.85, f.b * 0.85, g + 27, g + 36);
  return s.out();
};

// ── Saint-Jacques-sur-Coudenberg: neoclassical, portico + drum behind ──

const stJacques: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 90);
  const g = ctx.ground;
  const s = new Sink();
  body(rec, ctx, h, s, { height: 18, roofShape: 'gabled', roofHeight: 4, colour: '#d8cdb2', roofColour: SLATE, levels: undefined });
  const aF = frontAt(rec, f, 0);
  portico(s, f, { a: aF + 4, w0: -7, w1: 7, n: 6, r: 0.75, y0: g + 1, y1: g + 12, depth: 4, pediment: 3.5 });
  const st = s.buf('masonry');
  st.color = rgb('#d3c8ad');
  const dm = s.buf('metal');
  dm.color = rgb('#56626b');
  const ca = f.a * 0.1;
  lathe(st, f, ca, 0, [[5, g + 15], [4.6, g + 24], [5, g + 25]], 12);
  lathe(dm, f, ca, 0, [[5, g + 25], [4.2, g + 28], [2.4, g + 31], [0.8, g + 33], [0, g + 36]], 12);
  return s.out();
};

// ── Berlaymont: glass-and-steel skin on the star-shaped outline ──

/** Glass curtain wall + two light slabs (sill / cornice) around the whole outline between ground + y0 and ground + y1. */
function glassSkin(rec: BuildingRec, ctx: LandmarkCtx, s: Sink, y0: number, y1: number) {
  const glass = s.buf('glass');
  const m = s.buf('metal');
  m.color = rgb('#8d949a');
  const o = rec.outer;
  const n = o.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) area += o[2 * i]! * o[2 * ((i + 1) % n) + 1]! - o[2 * ((i + 1) % n)]! * o[2 * i + 1]!;
  const sg = area > 0 ? 1 : -1;
  const [lo, hi] = [ctx.ground + y0, ctx.ground + y1];
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 3) continue;
    const out: V3 = [((bz - az) * sg) / len, 0, (-(bx - ax) * sg) / len]; // outward (rings are not guaranteed CCW: sign from area)
    const [A, B] = [[ax + out[0] * 0.18, az + out[2] * 0.18], [bx + out[0] * 0.18, bz + out[2] * 0.18]] as const;
    quadOut(glass, [A[0], lo, A[1]], [B[0], lo, B[1]], [B[0], hi, B[1]], [A[0], hi, A[1]], out, 0, 0, len / 3, (hi - lo) / 3);
    const [C, D] = [[ax + out[0] * 0.4, az + out[2] * 0.4], [bx + out[0] * 0.4, bz + out[2] * 0.4]] as const;
    for (const y of [lo, hi]) {
      quadOut(m, [ax, y, az], [bx, y, bz], [D[0], y, D[1]], [C[0], y, C[1]], UP);
      quadOut(m, [ax, y, az], [bx, y, bz], [D[0], y, D[1]], [C[0], y, C[1]], DOWN);
    }
  }
}

const berlaymont: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const s = new Sink();
  glassSkin(rec, ctx, s, 3, (rec.height ?? 55) - 1.5);
  return withExtras(base, s);
};

const gareCentrale: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const s = new Sink();
  glassSkin(rec, ctx, s, 4, h.outlineTop(rec, ctx.def) - 1.5);
  return withExtras(base, s);
};

/** Dark window ribbons (one 1.6 m band per `step`) on every ring of the outline (courtyards face inward), for slab blocks. */
function windowBands(rec: BuildingRec, s: Sink, ground: number, top: number, step: number, colour: string) {
  const m = s.buf('masonry');
  m.color = rgb(colour);
  const rings = [rec.outer, ...(rec.holes ?? [])];
  rings.forEach((o, ri) => {
    const n = o.length / 2;
    let area = 0;
    for (let i = 0; i < n; i++) area += o[2 * i]! * o[2 * ((i + 1) % n) + 1]! - o[2 * ((i + 1) % n)]! * o[2 * i + 1]!;
    const sg = (area > 0 ? 1 : -1) * (ri === 0 ? 1 : -1);
    for (let i = 0; i < n; i++) {
      const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4) continue;
      const out: V3 = [((bz - az) * sg) / len, 0, (-(bx - ax) * sg) / len];
      const e = 0.1;
      for (let y = ground + 4; y + 1.6 < ground + top - 1; y += step)
        quadOut(m, [ax + out[0] * e, y, az + out[2] * e], [bx + out[0] * e, y, bz + out[2] * e], [bx + out[0] * e, y + 1.6, bz + out[2] * e], [ax + out[0] * e, y + 1.6, az + out[2] * e], out);
    }
  });
}

const slab = (colour: string, step: number): DetailFn => (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const s = new Sink();
  windowBands(rec, s, ctx.ground, h.outlineTop(rec, ctx.def), step, colour);
  return withExtras(base, s);
};

// ── tower crowns: mechanical box + mast on the tallest part ──

const crown = (partsOnly = false): DetailFn => (rec, parts, ctx, h) => {
  let base: BuildOut;
  if (partsOnly) { // the outline would be extruded in stone over the glass parts
    const s0 = new Sink();
    for (const p of parts) h.renderPart(p.height === undefined && p.levels === undefined ? { ...p, height: 10 } : p, { ground: ctx.ground, height: ctx.height, fallbackTop: h.outlineTop(rec, ctx.def) }, s0);
    base = s0.out();
  } else base = h.generic(rec, parts, ctx);
  const tall = [...parts].filter((p) => p.kind !== 'roof').sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  if (!tall?.height) return base;
  const f = footprintFrame(tall.outer);
  const top = ctx.ground + tall.height;
  const s = new Sink();
  const m = s.buf('masonry');
  m.color = rgb('#9aa0a5');
  fbox(m, f, -f.a * 0.45, f.a * 0.45, -f.b * 0.45, f.b * 0.45, top - 0.2, top + 3.2);
  const mast = s.buf('metal');
  mast.color = rgb('#c9ced2');
  lathe(mast, f, f.a * 0.1, 0, [[0.35, top + 3], [0.18, top + 14], [0, top + 22]], 6);
  return withExtras(base, s);
};

// ── Mont des Arts carillon: a small clock tower (OSM has a 5 m line tagged artwork) ──

const carillon: DetailFn = (rec, _parts, ctx) => {
  const f = footprintFrame(rec.outer);
  const g = ctx.ground;
  const s = new Sink();
  const st = s.buf('masonry');
  st.color = rgb('#d3c9b1');
  const hs = 2.4;
  fbox(st, f, -hs, hs, -hs, hs, g - 0.3, g + 3.5); // arcaded base block
  loft(st, [ring(f, 0, 0, hs * 0.8 * SQ2, g + 3.5, 4), ring(f, 0, 0, hs * 0.7 * SQ2, g + 13, 4)], 4); // shaft
  const dark = s.buf('masonry');
  dark.color = rgb('#38352f');
  for (const dir of [1, -1]) arch(dark, f, dir * (hs + 0.06), -0.9, 0.9, g, g + 1.8, g + 3, false, dir);
  const face = s.buf('masonry');
  face.color = rgb('#efe8d6');
  for (const dir of [1, -1]) {
    disc(face, f, dir * (hs * 0.7 + 0.08), 0, g + 10.5, 1.3, dir, 16);
  }
  const roof = s.buf('metal');
  roof.color = rgb('#4b7f70');
  spire(roof, ring(f, 0, 0, hs * 0.85 * SQ2, g + 13, 4), P(f, 0, g + 18, 0));
  const gold = s.buf('gold');
  lathe(gold, f, 0, 0, [[0.3, g + 17.8], [0, g + 20]], 6);
  for (const k of [-1.2, 0, 1.2]) fbox(gold, f, hs * 0.7 + 0.05, hs * 0.7 + 0.45, k - 0.3, k + 0.3, g + 5.5, g + 7.5); // the jacquemart figures, abstracted
  return s.out();
};

// ── Tour Sainte-Catherine: a free-standing Baroque belfry (OSM outline 10 × 10 m, no height) ──

const tourSainteCatherine: DetailFn = (rec, _parts, ctx) => {
  const f = footprintFrame(rec.outer);
  const s = new Sink();
  const hs = Math.min(f.a, f.b) * 0.95;
  towerAt(s, f, 0, 0, hs, ctx.minGround - 0.3, ctx.ground + (ctx.def.height ?? 30) - 8 - (ctx.minGround - 0.3), 'baroque', '#c9b99a', true);
  return s.out();
};

// ── Le Botanique: long glasshouse + central rotunda ──

const botanique: DetailFn = (rec, _parts, ctx, h) => {
  const f = footprintFrame(rec.outer);
  const g = ctx.ground;
  const s = new Sink();
  body(rec, ctx, h, s, { height: 14, roofShape: 'round', roofHeight: 4, colour: '#cfd8d4', roofColour: '#9fb6b8', material: 'glass', roofMaterial: 'glass', levels: undefined });
  const st = s.buf('masonry');
  st.color = rgb('#d6ccb2');
  lathe(st, f, 0, 0, [[9.5, g - 0.3], [9.2, g + 12], [9.8, g + 13]], 16);
  const dm = s.buf('metal');
  dm.color = rgb('#5c8f7d');
  lathe(dm, f, 0, 0, [[9.8, g + 13], [8.8, g + 16], [6.5, g + 20], [3.5, g + 23], [1.2, g + 25], [0, g + 27]], 16);
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'cathedrale-st-michel': cathedral,
  'maison-du-roi': maisonDuRoi,
  'palais-de-justice': palaisDeJustice,
  'palais-de-la-nation': palaisDeLaNation,
  'st-jacques-coudenberg': stJacques,
  bourse,
  'la-monnaie': laMonnaie,
  berlaymont,
  'gare-centrale': gareCentrale,
  'tour-du-midi': crown(),
  'tour-rogier': crown(true),
  'madou-plaza': crown(),
  'carillon-mont-des-arts': carillon,
  'bibliotheque-royale': slab('#3d4852', 3.2),
  'justus-lipsius': slab('#3a4650', 3.2),
  'tour-sainte-catherine': tourSainteCatherine,
  botanique,
  'sainte-catherine': church({ az: 'origin', wall: 15, roof: 9, towers: 0, th: 0, tw: 0, cap: 'pyramid', fleche: 14 }),
  'saint-nicolas': church({ az: 'origin', wall: 11, roof: 6, towers: 1, th: 24, tw: 3.2, cap: 'pyramid', stone: '#c9b9a0' }),
  'notre-dame-sablon': church({ az: 'origin', wall: 18, roof: 12, towers: 1, th: 38, tw: 4, cap: 'pyramid', fleche: 10 }),
  'notre-dame-chapelle': church({ az: 'origin', wall: 15, roof: 8, towers: 1, th: 34, tw: 4, cap: 'baroque', stone: '#c8bda3' }),
  'begijnhof-st-jean': church({ az: 'origin', wall: 14, roof: 8, towers: 1, th: 30, tw: 3.5, cap: 'baroque', stone: '#cdbfa5' }),
  'notre-dame-riches-claires': church({ az: 'origin', wall: 11, roof: 6, towers: 1, th: 26, tw: 3, cap: 'baroque', stone: '#bfae92' }),
};
