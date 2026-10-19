// Leg 3 (Brussels) landmark details, built in code on top of the generic S3DB body (index.ts `generic`): the extras that make the
// three signature silhouettes read at a distance. Sizes: Hôtel de Ville tower ≈ 96 m total (Wikipedia, crowned by St Michael),
// Cinquantenaire arcade 45 m with the bronze quadriga on top (OSM h 45), Royal Palace roof balustrade + flag.
// Orientation comes from the OSM outline (footprintFrame); the tower stands on the facade that looks at the Grand-Place (world
// origin). Colliders: the generic body only (details are never solid, SPEC §5.9).
import type { BuildingRec, LandmarkId, PartRec } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { parseColour, Sink } from './parts.ts';

export type Fr = ReturnType<typeof footprintFrame>;
export const rgb = (hex: string): V3 => parseColour(hex)! as unknown as V3;
export const P = (f: Fr, a: number, y: number, w: number): V3 => [f.cx + a * f.ux - w * f.uz, y, f.cz + a * f.uz + w * f.ux];
export const UP: V3 = [0, 1, 0];
export const DOWN: V3 = [0, -1, 0];

/** n-gon of radius r (r = half side for n = 4: pass r·√2 to get a square of half side r) around (a, w) at height y. */
export const ring = (f: Fr, a: number, w: number, r: number, y: number, n: number, rot = Math.PI / n): V3[] =>
  Array.from({ length: n }, (_, k) => P(f, a + r * Math.cos(rot + (2 * Math.PI * k) / n), y, w + r * Math.sin(rot + (2 * Math.PI * k) / n)));

export const cap = (buf: Parameters<typeof loft>[0], r: V3[], out: V3) => { for (let i = 1; i + 1 < r.length; i++) triOut(buf, r[0]!, r[i]!, r[i + 1]!, out); };
export function stack(buf: Parameters<typeof loft>[0], rings: V3[][]) {
  loft(buf, rings, 4);
  cap(buf, rings[0]!, DOWN);
  cap(buf, rings.at(-1)!, UP);
}
export function spire(buf: Parameters<typeof loft>[0], r: V3[], apex: V3) {
  for (let i = 0; i < r.length; i++) {
    const [a, b] = [r[i]!, r[(i + 1) % r.length]!];
    triOut(buf, a, b, apex, [(a[0] + b[0]) / 2 - apex[0], 0.4, (a[2] + b[2]) / 2 - apex[2]]);
  }
}
/** Axis-aligned-in-frame box. */
export const fbox = (buf: Parameters<typeof loft>[0], f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
  stack(buf, [[P(f, a0, y0, w0), P(f, a1, y0, w0), P(f, a1, y0, w1), P(f, a0, y0, w1)], [P(f, a0, y1, w0), P(f, a1, y1, w0), P(f, a1, y1, w1), P(f, a0, y1, w1)]]);

/** The generic body + a Sink of extras, merged. */
export function withExtras(base: BuildOut, s: Sink): BuildOut {
  const x = s.out();
  return { meshes: [...base.meshes, ...x.meshes], instances: base.instances, colliders: base.colliders, ...(base.textures && { textures: base.textures }) };
}

const hotelDeVille: DetailFn = (rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx, h: Helpers) => {
  const base = h.generic(rec, parts, ctx);
  const f = footprintFrame(rec.outer);
  const toSquare = -(f.cx * -f.uz) - f.cz * f.ux; // dot((−centre), w-axis): which side of the building faces the square
  const side = toSquare >= 0 ? 1 : -1;
  const [ta, tw] = [-0.12 * f.a, side * (f.b - 7)];
  const roof = ctx.ground + 26;
  const s = new Sink();
  const stone = s.buf('masonry');
  const slate = s.buf('metal');
  stone.color = rgb('#d9cfb8');
  stack(stone, [ring(f, ta, tw, 6.2, roof - 4, 4), ring(f, ta, tw, 5.8, roof + 24, 4)]); // square shaft (≈ 28 m over the roof)
  stone.color = rgb('#cfc4a8');
  stack(stone, [ring(f, ta, tw, 6.6, roof + 24, 4), ring(f, ta, tw, 6.6, roof + 26, 4)]); // gallery slab
  stack(stone, [ring(f, ta, tw, 4.6, roof + 26, 8), ring(f, ta, tw, 4.2, roof + 38, 8)]); // octagonal belfry
  stack(stone, [ring(f, ta, tw, 3.2, roof + 38, 8), ring(f, ta, tw, 2.8, roof + 48, 8)]); // lantern
  slate.color = rgb('#5f7f74'); // green-copper spire
  spire(slate, ring(f, ta, tw, 3.0, roof + 48, 8), P(f, ta, roof + 72, tw));
  const gold = s.buf('gold');
  spire(gold, ring(f, ta, tw, 0.6, roof + 71, 6), P(f, ta, roof + 76, tw)); // Saint Michael, simplified to a gilded finial
  stack(gold, [ring(f, ta, tw, 0.35, roof + 70, 6), ring(f, ta, tw, 0.3, roof + 71.5, 6)]);
  return withExtras(base, s);
};

const palaisRoyal: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + h.outlineTop(rec, ctx.def);
  const s = new Sink();
  const bal = s.buf('masonry');
  bal.color = rgb('#e2d9c4');
  const n = rec.outer.length / 2;
  for (let i = 0; i < n; i++) { // roof balustrade along the outline: a thin double-sided wall 1.1 m high
    const [ax, az, bx, bz] = [rec.outer[2 * i]!, rec.outer[2 * i + 1]!, rec.outer[(2 * ((i + 1) % n))]!, rec.outer[2 * ((i + 1) % n) + 1]!];
    const [a, b, c, d]: V3[] = [[ax, top, az], [bx, top, bz], [bx, top + 1.1, bz], [ax, top + 1.1, az]];
    const nx = bz - az, nz = -(bx - ax);
    quadOut(bal, a, b, c, d, [nx, 0, nz]);
    quadOut(bal, a, b, c, d, [-nx, 0, -nz]);
  }
  const pole = s.buf('gold');
  stack(pole, [ring(f, 0, 0, 0.25, top, 6), ring(f, 0, 0, 0.18, top + 14, 6)]); // flag pole on the central block
  const flag = s.buf('masonry');
  flag.color = rgb('#161616');
  fbox(flag, f, 0, 3.2, -0.05, 0.05, top + 10.2, top + 12);
  flag.color = rgb('#f3c614');
  fbox(flag, f, 3.2, 6.4, -0.05, 0.05, top + 10.2, top + 12);
  flag.color = rgb('#d3202a');
  fbox(flag, f, 6.4, 9.6, -0.05, 0.05, top + 10.2, top + 12);
  return withExtras(base, s);
};

const arcades: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + (rec.height ?? 45);
  const s = new Sink();
  // dark arched portals on both long faces (3 openings: the great arch + two lower side arches)
  const dark = s.buf('masonry');
  dark.color = rgb('#2c2a28');
  const portal = (a0: number, a1: number, spring: number, crown: number, w: number, sign: number) => {
    const pts: [number, number][] = [[a0, 0.5], [a1, 0.5]];
    const cx = (a0 + a1) / 2, r = (a1 - a0) / 2;
    for (let k = 0; k <= 10; k++) pts.push([cx + r * Math.cos((Math.PI * k) / 10), spring + (crown - spring) * Math.sin((Math.PI * k) / 10)]);
    const out: V3 = [-f.uz * sign, 0, f.ux * sign];
    for (let i = 1; i + 1 < pts.length; i++)
      triOut(dark, P(f, pts[0]![0], ctx.ground + pts[0]![1], w), P(f, pts[i]![0], ctx.ground + pts[i]![1], w), P(f, pts[i + 1]![0], ctx.ground + pts[i + 1]![1], w), out);
  };
  for (const sign of [1, -1]) {
    const w = sign * (f.b + 0.12);
    portal(-6.5, 6.5, 18, 26, w, sign);
    portal(-16.5, -9.5, 11, 15, w, sign);
    portal(9.5, 16.5, 11, 15, w, sign);
  }
  // attic + the bronze quadriga: a chariot, four horses abreast, a driver
  const stone = s.buf('masonry');
  stone.color = rgb('#d6ccb2');
  fbox(stone, f, -9, 9, -f.b * 0.55, f.b * 0.55, top - 0.5, top + 2.5);
  const g = s.buf('bronze');
  fbox(g, f, -2.5, 2.5, -1.4, 1.4, top + 2.5, top + 4);
  for (let k = 0; k < 4; k++) fbox(g, f, -3.6 + k * 2.4, -2.6 + k * 2.4, 1.6, 4.8, top + 2.5, top + 5.8);
  fbox(g, f, -0.5, 0.5, -0.5, 0.5, top + 4, top + 7);
  return withExtras(base, s);
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'hotel-de-ville': hotelDeVille,
  'palais-royal': palaisRoyal,
  'arcades-cinquantenaire': arcades,
};
