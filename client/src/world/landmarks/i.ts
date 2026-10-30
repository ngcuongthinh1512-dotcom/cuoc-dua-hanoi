// Leg 3 landmark details: the two curved colonnade wings of the Cinquantenaire (reference photo: grey-cream limestone, a 6 m
// ground storey with small barred windows, one open gallery of Tuscan columns ≈ 8 m high every ≈ 4 m before a mural wall,
// entablature + stone balustrade along the curved roof, a stepped square pavilion at the outer end). Each wing is a circular
// arc fitted to the OSM inner edge (centre, radius, angles below; atan2(z, x) degrees); the colonnade is drawn in polar
// coordinates about that centre and the OSM body (outline / parts) is pushed back behind the mural wall (`pushBack`), so the
// gallery is really open. Colliders: the ground storey, the pavilion and the generic body (details never, SPEC §5.9).
import { landmarks as L } from '../../config.ts';
import type { PartRec, XZ } from '../../geo/chunkData.ts';
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { V3 } from '../geom.ts';
import { fbox, type Fr, P, rgb } from './b.ts';
import { lathe } from './c.ts';
import type { DetailFn } from './index.ts';
import { quadOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];
const D2R = Math.PI / 180;
const DEPTH = 9; // m: column line → mural wall
const BAY = 4; // m: column spacing along the arc
const [BASE_H, CAP_H, ROOF_H, RAIL_H] = [6, 14, 16, 17.4]; // m above the arch-end ground: gallery floor, capital top, roof, balustrade top

interface Wing {
  cx: number;
  cz: number;
  r: number; // m: the column line = the OSM inner edge
  t0: number; // ° at the arch end
  t1: number; // ° at the pavilion end
  link?: [number, number]; // centre of the OSM part that joins the arch (its height is cut to the roof)
}
const WINGS: Record<string, Wing> = {
  'cinquantenaire-aile-nord': { cx: 2814.7, cz: 662.4, r: 44.2, t0: 3, t1: -97.4 },
  'cinquantenaire-aile-sud': { cx: 2803.5, cz: 705.5, r: 39.3, t0: 26, t1: 117, link: [2846, 720] },
};

const inArc = (w: Wing, th: number) => th >= Math.min(w.t0, w.t1) - 1 && th <= Math.max(w.t0, w.t1) + 1;

/** The ring with every vertex inside the colonnade strip moved out to the mural wall (radius r + DEPTH). */
function pushBack(ring: XZ, w: Wing): XZ {
  const out: XZ = [];
  for (let i = 0; i < ring.length; i += 2) {
    let [x, z] = [ring[i]!, ring[i + 1]!];
    const [dx, dz] = [x - w.cx, z - w.cz];
    const d = Math.hypot(dx, dz);
    if (d < w.r + DEPTH - 0.5 && inArc(w, Math.atan2(dz, dx) / D2R)) [x, z] = [w.cx + ((w.r + DEPTH) * dx) / d, w.cz + ((w.r + DEPTH) * dz) / d];
    const n = out.length;
    if (n && Math.hypot(out[n - 2]! - x, out[n - 1]! - z) < 0.2) continue;
    out.push(x, z);
  }
  return out;
}

const wing: DetailFn = (rec, parts, ctx, h) => {
  const w = WINGS[rec.landmark!]!;
  const s = new Sink();
  const pp = (th: number, rho: number, y: number): V3 => [w.cx + rho * Math.cos(th), y, w.cz + rho * Math.sin(th)];
  /** Local frame at (th, rho): a = radial (outward), w = along +th. */
  const fr = (th: number, rho: number): Fr => ({ area: 0, cx: w.cx + rho * Math.cos(th), cz: w.cz + rho * Math.sin(th), ux: Math.cos(th), uz: Math.sin(th), a: 0, b: 0 });
  const rad = (th: number, dir: number): V3 => [dir * Math.cos(th), 0, dir * Math.sin(th)];
  const [T0, T1] = [w.t0 * D2R, w.t1 * D2R];
  const sgn = Math.sign(T1 - T0); // +1: the arc runs toward +th
  const len = w.r * Math.abs(T1 - T0);
  const bays = Math.round(len / BAY);
  const N = bays * 2; // wall segments
  const T = (k: number) => T0 + ((T1 - T0) * k) / N;
  const [sx, , sz] = pp(T0, w.r, 0);
  const g = ctx.height(sx, sz); // the wing is level with the arch end
  let base = Infinity;
  for (let k = 0; k <= N; k++) for (const rho of [w.r, w.r + DEPTH]) base = Math.min(base, ctx.height(pp(T(k), rho, 0)[0], pp(T(k), rho, 0)[2]));
  base -= 0.5;

  // curved strips: vertical band at radius rho (dir −1 = facing the lawn), horizontal annulus at y (dir 1 = up), polar box
  const band = (buf: Buf, rho: number, y0: number, y1: number, dir: number) => {
    for (let k = 0; k < N; k++) quadOut(buf, pp(T(k), rho, y0), pp(T(k + 1), rho, y0), pp(T(k + 1), rho, y1), pp(T(k), rho, y1), rad(T(k + 0.5), dir));
  };
  const slab = (buf: Buf, rho0: number, rho1: number, y: number, dir: number) => {
    for (let k = 0; k < N; k++) quadOut(buf, pp(T(k), rho0, y), pp(T(k + 1), rho0, y), pp(T(k + 1), rho1, y), pp(T(k), rho1, y), [0, dir, 0]);
  };
  const pbox = (buf: Buf, rho0: number, rho1: number, y0: number, y1: number) => {
    band(buf, rho0, y0, y1, -1);
    band(buf, rho1, y0, y1, 1);
    slab(buf, rho0, rho1, y1, 1);
    slab(buf, rho0, rho1, y0, -1);
  };
  const arc = (rho: number, from: number, to: number): XZ => {
    const out: XZ = [];
    for (let k = from; from <= to ? k <= to : k >= to; k += from <= to ? 1 : -1) out.push(pp(T(k), rho, 0)[0], pp(T(k), rho, 0)[2]);
    return out;
  };

  // one masonry buffer per Sink (same material → same MeshBuffer): the colour is stamped per vertex, so set it before each group
  const m = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  const col = (hex: string) => { m.color = rgb(hex); };
  const [STONE, STONE_DK, OCHRE, ROOF] = ['#d9d0bb', '#c3b9a2', '#b98b55', '#8d8a82'];

  // ground storey (solid): front face, plinth cornice, gallery floor; its collider
  col(STONE_DK);
  band(m, w.r, base, g + BASE_H - 0.6, -1);
  slab(m, w.r + 0.2, w.r + DEPTH, g + BASE_H + 0.2, 1);
  col(STONE);
  pbox(m, w.r - 0.3, w.r + 0.2, g + BASE_H - 0.6, g + BASE_H + 0.2);
  s.prism([[...arc(w.r, 0, N), ...arc(w.r + DEPTH, N, 0)]], base, g + BASE_H + 0.2);

  // the mural wall (warm ochre band with painted panels per bay)
  col(OCHRE);
  band(m, w.r + DEPTH - 0.2, g + BASE_H + 0.2, g + ROOF_H, -1);
  const half = (len / bays) / 2;
  for (let j = 0; j < bays; j++) {
    const th = T0 + ((T1 - T0) * (j + 0.5)) / bays;
    const fm = fr(th, w.r + DEPTH - 0.3);
    col(j % 2 ? '#a67545' : '#c49a63');
    quadOut(m, P(fm, 0, g + BASE_H + 1.2, -(half - 0.9)), P(fm, 0, g + BASE_H + 1.2, half - 0.9), P(fm, 0, g + CAP_H - 1, half - 0.9), P(fm, 0, g + CAP_H - 1, -(half - 0.9)), rad(th, -1));
  }
  // entablature + cornice over the columns, gallery ceiling, grey flat roof
  col(STONE);
  pbox(m, w.r - 0.1, w.r + 2.2, g + CAP_H, g + ROOF_H - 0.6);
  pbox(m, w.r - 0.7, w.r + 2.2, g + ROOF_H - 0.6, g + ROOF_H);
  col(STONE_DK);
  slab(m, w.r + 2.2, w.r + DEPTH, g + ROOF_H - 0.6, -1);
  col(ROOF);
  slab(m, w.r - 0.7, w.r + DEPTH, g + ROOF_H, 1);
  // balustrade: rails as polar boxes, balusters every 0.55 m (near LOD), a pedestal over every column
  col(STONE);
  pbox(m, w.r - 0.5, w.r + 0.4, g + ROOF_H, g + ROOF_H + 0.25);
  pbox(m, w.r - 0.55, w.r + 0.45, g + RAIL_H - 0.3, g + RAIL_H);
  const nb = Math.round(len / 0.55);
  near.color = rgb(STONE);
  for (let i = 0; i <= nb; i++) {
    const f = fr(T0 + ((T1 - T0) * i) / nb, w.r - 0.05);
    fbox(near, f, -0.11, 0.11, -0.11, 0.11, g + ROOF_H + 0.25, g + RAIL_H - 0.3);
  }

  // columns on the plinth edge (Tuscan: base torus, tapered shaft, flared capital, square abacus), a pilaster behind each
  for (let j = 0; j <= bays; j++) {
    const th = T0 + ((T1 - T0) * j) / bays;
    const y0 = g + BASE_H + 0.2;
    const f = fr(th, w.r + 0.9);
    lathe(m, f, 0, 0, [[0.66, y0], [0.66, y0 + 0.3], [0.54, y0 + 0.45], [0.46, g + CAP_H - 0.9], [0.62, g + CAP_H - 0.35]], 10);
    fbox(m, f, -0.75, 0.75, -0.75, 0.75, g + CAP_H - 0.35, g + CAP_H);
    fbox(m, fr(th, w.r + DEPTH - 0.45), 0, 0.35, -0.5, 0.5, y0, g + CAP_H); // pilaster
    fbox(m, fr(th, w.r - 0.05), -0.5, 0.5, -0.5, 0.5, g + ROOF_H, g + RAIL_H + 0.15); // balustrade pedestal
  }
  // a barred window in the ground storey of every bay
  for (let j = 0; j < bays; j++) {
    const th = T0 + ((T1 - T0) * (j + 0.5)) / bays;
    const fw = fr(th, w.r - 0.04);
    const out = rad(th, -1);
    near.color = rgb('#2a2622');
    quadOut(near, P(fw, 0, g + 2.4, -0.7), P(fw, 0, g + 2.4, 0.7), P(fw, 0, g + 4.2, 0.7), P(fw, 0, g + 4.2, -0.7), out);
    near.color = rgb('#8a8580');
    for (const b of [-0.35, 0, 0.35]) quadOut(near, P(fw, -0.03, g + 2.4, b - 0.03), P(fw, -0.03, g + 2.4, b + 0.03), P(fw, -0.03, g + 4.2, b + 0.03), P(fw, -0.03, g + 4.2, b - 0.03), out);
  }

  // stepped square pavilion at the outer end (1 m proud of the column line, 2 m past the last column so it stays inside the OSM
  // outline and off the footway along the façade): plinth band, cornice, two steps
  {
    const f = fr(T1, w.r + 4.5);
    const [w0, w1] = sgn > 0 ? [-12, 2] : [-2, 12];
    col(STONE);
    fbox(m, f, -5.5, 6.5, w0, w1, base, g + ROOF_H + 1.5);
    fbox(m, f, -5.7, 6.7, w0 - 0.2, w1 + 0.2, g + BASE_H - 0.6, g + BASE_H + 0.2); // plinth cornice, continues the colonnade's
    fbox(m, f, -6.0, 7.0, w0 - 0.5, w1 + 0.5, g + ROOF_H + 1.5, g + ROOF_H + 2.5);
    fbox(m, f, -4.7, 5.7, w0 + 0.8, w1 - 0.8, g + ROOF_H + 2.5, g + ROOF_H + 4);
    fbox(m, f, -2.5, 3.5, w0 + 3, w1 - 3, g + ROOF_H + 4, g + ROOF_H + 5.5);
    col(STONE_DK);
    for (const wp of [w0 + 1.2, w1 - 1.2]) fbox(m, f, -5.8, -5.5, wp - 0.6, wp + 0.6, g + BASE_H + 0.2, g + CAP_H); // corner pilasters on the lawn face
    const wc = (w0 + w1) / 2;
    near.color = rgb('#2a2622');
    for (const [y0, y1, hw] of [[g + 0.6, g + 4.4, 1.3], [g + BASE_H + 1.5, g + CAP_H - 0.5, 1.6]] as const) {
      quadOut(near, P(f, -5.53, y0, wc - hw), P(f, -5.53, y0, wc + hw), P(f, -5.53, y1, wc + hw), P(f, -5.53, y1, wc - hw), rad(T1, -1));
    }
    s.prism([[P(f, -5.5, 0, w0), P(f, 6.5, 0, w0), P(f, 6.5, 0, w1), P(f, -5.5, 0, w1)].flatMap(([x, , z]) => [x, z])], base, g + ROOF_H + 1.5);
  }

  // the OSM body behind the gallery (museum halls, the block that joins the arch): parts, and the outline when they cover too little
  const o = { ground: g, height: ctx.height, fallbackTop: h.outlineTop(rec, ctx.def) };
  const centre = (p: { outer: XZ }): [number, number] => {
    const xs = p.outer.filter((_, k) => k % 2 === 0);
    const zs = p.outer.filter((_, k) => k % 2 === 1);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  };
  const ps: PartRec[] = [];
  for (const p of parts) {
    const [cx, cz] = centre(p);
    if (Math.hypot(cx - w.cx, cz - w.cz) < w.r + DEPTH + 8 && inArc(w, Math.atan2(cz - w.cz, cx - w.cx) / D2R)) continue; // the OSM colonnade part: drawn above
    ps.push(w.link && Math.hypot(cx - w.link[0], cz - w.link[1]) < 5 ? { ...p, height: ROOF_H + 1 } : p);
  }
  for (const p of ps) h.renderPart(p, o, s);
  if (!ps.length || h.coverage(rec, ps) < L.partCoverage) h.renderPart({ ...rec, outer: pushBack(rec.outer, w) }, o, s);
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'cinquantenaire-aile-nord': wing,
  'cinquantenaire-aile-sud': wing,
};
