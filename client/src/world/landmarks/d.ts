// Leg 3 landmark details, part 3: Grand-Place guild houses, Manneken Pis, Galeries Royales Saint-Hubert, Parlement européen,
// Colonne du Congrès. Houses / galleries / parliament are ordinary OSM buildings that the registry tags as landmarks, so they are
// still drawn by BuildingBuilder (windows, shop fronts, curtain walls) through a one-building chunk, then dressed here.
// Details are never solid (SPEC §5.9); colliders come from the body only.
import type { BuildingRec, ChunkData, LandmarkId } from '../../geo/chunkData.ts';
import { buildBuildings, buildingHeight } from '../BuildingBuilder.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, ring, spire, UP, withExtras } from './b.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof loft>[0];

/** The record drawn as an ordinary building (what BuildingBuilder would have done without the landmark tag). */
export function town(rec: BuildingRec, ctx: LandmarkCtx, over: Partial<BuildingRec> = {}): BuildOut {
  const { landmark: _l, parts: _p, points: _q, ...plain } = rec;
  const chunk = { v: 2, key: ctx.key, buildings: [{ ...plain, ...over }], roads: [], bridges: [], areas: [], points: [], stairs: [], junctions: [] } as unknown as ChunkData;
  return buildBuildings(chunk, ctx);
}
/** Solid prism (square of half side hs around the frame centre) for a collider. */
const solid = (s: Sink, f: Fr, hs: number, y0: number, y1: number) =>
  s.prism([[P(f, -hs, 0, -hs), P(f, hs, 0, -hs), P(f, hs, 0, hs), P(f, -hs, 0, hs)].flatMap((p) => [p[0], p[2]])], y0, y1);
const join = (base: BuildOut, s: Sink): BuildOut => withExtras(base, s);

/** Lathe of n-gon rings [r, y] at (a, w); a last r = 0 closes with a spire. */
function lathe(buf: Buf, f: Fr, a: number, w: number, prof: [number, number][], n = 8) {
  const rs = prof.filter(([r]) => r > 0.02).map(([r, y]) => ring(f, a, w, r, y, n));
  if (rs.length > 1) loft(buf, rs, 4);
  const last = prof.at(-1)!;
  if (last[0] <= 0.02) spire(buf, rs.at(-1)!, P(f, a, last[1], w));
  else cap(buf, rs.at(-1)!, UP);
}

const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// ── Grand-Place: stepped gable with gilded caps, volutes and a finial on the façade that looks at the square ──

const SQUARE: [number, number] = [5.5, 2.5]; // centre of way/3517898

const guildHouse: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx);
  const o = rec.outer;
  const n = o.length / 2;
  // front edge = the (≥ 4 m) edge whose middle is nearest to the square's centre
  let best = { d: Infinity, i: 0 };
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    if (Math.hypot(bx - ax, bz - az) < 4) continue;
    const d = Math.hypot((ax + bx) / 2 - SQUARE[0], (az + bz) / 2 - SQUARE[1]);
    if (d < best.d) best = { d, i };
  }
  if (!Number.isFinite(best.d)) return base;
  const [ax, az, bx, bz] = [o[2 * best.i]!, o[2 * best.i + 1]!, o[2 * ((best.i + 1) % n)]!, o[2 * ((best.i + 1) % n) + 1]!];
  const len = Math.hypot(bx - ax, bz - az);
  let [ux, uz] = [(bx - ax) / len, (bz - az) / len];
  const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
  if (-uz * (SQUARE[0] - mx) + ux * (SQUARE[1] - mz) < 0) [ux, uz] = [-ux, -uz]; // w axis (−uz, ux) points at the square
  const f = { cx: mx, cz: mz, ux, uz, a: len / 2, b: 1, area: 0 } as Fr;
  const top = ctx.ground + buildingHeight(rec);
  const seed = hash(o[0]! * 3.1 + o[1]!);
  const s = new Sink();
  const stone = s.buf('masonry');
  const gold = s.buf('gold');
  const tones = ['#d8cdb4', '#cbbfa5', '#e0d6c0', '#c9c2b4'];
  stone.color = rgb(tones[Math.floor(seed * tones.length)]!);
  const hw = Math.min(len / 2, 5) - 0.3;
  const steps = 3 + Math.floor(seed * 2);
  const rise = 0.9 + seed * 0.3;
  const [w0, w1] = [-0.9, -0.15]; // behind the wall line, so it never pokes into the street
  let y = top;
  for (let k = 0; k < steps; k++) {
    const half = hw * (1 - (k * 0.8) / steps);
    fbox(stone, f, -half, half, w0, w1, y - 0.2, y + rise);
    fbox(gold, f, -half - 0.06, half + 0.06, w0 - 0.04, w1 + 0.04, y + rise, y + rise + 0.12); // gilded cap on every step
    y += rise;
  }
  lathe(gold, f, 0, (w0 + w1) / 2, [[0.45, y + 0.25], [0.3, y + 1.2], [0.5, y + 1.8], [0.15, y + 2.6], [0, y + 3.4]], 6); // finial
  for (const sg of [-1, 1]) { // volutes: a gilded block either side of the lowest step
    fbox(gold, f, sg * (hw + 0.2) - 0.35, sg * (hw + 0.2) + 0.35, w0 - 0.05, w1 + 0.05, top, top + 1.4);
  }
  return join(base, s);
};

// ── Manneken Pis: stone pedestal, iron railing, bronze boy, water jet ──

const mannekenPis: DetailFn = (rec, _parts, ctx) => {
  const f = footprintFrame(rec.outer);
  const g = ctx.minGround;
  const s = new Sink();
  const st = s.buf('masonry');
  st.color = rgb('#9c9a92');
  fbox(st, f, -0.9, 0.9, -0.9, 0.9, g - 0.2, g + 0.5); // basin kerb block
  fbox(st, f, -0.6, 0.6, -0.5, 0.5, g + 0.5, g + 2.2); // niche pedestal
  st.color = rgb('#807d76');
  fbox(st, f, -0.75, 0.75, -0.65, 0.65, g + 2.2, g + 2.35);
  solid(s, f, 0.6, g - 0.2, g + 2.4);
  const iron = s.buf('metal');
  iron.color = rgb('#25282b');
  for (const [a, w] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1], [0, -1.1], [0, 1.1], [-1.1, 0], [1.1, 0]] as const)
    lathe(iron, f, a, w, [[0.04, g], [0.04, g + 1.1], [0, g + 1.25]], 4);
  for (const y of [g + 0.35, g + 1.0]) {
    fbox(iron, f, -1.12, 1.12, -1.14, -1.06, y, y + 0.04);
    fbox(iron, f, -1.12, 1.12, 1.06, 1.14, y, y + 0.04);
    fbox(iron, f, -1.14, -1.06, -1.1, 1.1, y, y + 0.04);
    fbox(iron, f, 1.06, 1.14, -1.1, 1.1, y, y + 0.04);
  }
  const b = s.buf('bronze');
  const y0 = g + 2.35;
  fbox(b, f, -0.07, 0.07, -0.16, -0.04, y0, y0 + 0.2); // legs
  fbox(b, f, -0.07, 0.07, 0.04, 0.16, y0, y0 + 0.2);
  fbox(b, f, -0.1, 0.1, -0.2, 0.2, y0 + 0.2, y0 + 0.42); // body
  lathe(b, f, 0, 0, [[0.12, y0 + 0.42], [0.13, y0 + 0.55], [0.08, y0 + 0.62], [0, y0 + 0.65]], 8); // head
  fbox(b, f, 0.1, 0.2, -0.02, 0.02, y0 + 0.28, y0 + 0.31); // the member
  const jet = s.buf('waterJet');
  for (let k = 0; k < 6; k++) fbox(jet, f, 0.2 + 0.07 * k, 0.24 + 0.07 * k, -0.015, 0.015, y0 + 0.31 - 0.012 * k * k, y0 + 0.32 - 0.012 * k * k);
  fbox(jet, f, 0.62, 0.7, -0.03, 0.03, g + 0.5, y0 + 0.2); // thin stream falling into the basin
  return s.out();
};

// ── Galeries Royales Saint-Hubert: glass barrel vault along the passage ──

/** Barrel vault of the long axis (a), half span w, springing y0, rise r. */
function vault(buf: Buf, f: Fr, a0: number, a1: number, hw: number, y0: number, r: number, n = 10) {
  const pt = (a: number, k: number): V3 => P(f, a, y0 + r * Math.sin((Math.PI * k) / n), hw * Math.cos((Math.PI * k) / n));
  for (let k = 0; k < n; k++) {
    const mid = Math.PI * (k + 0.5) / n;
    const out: V3 = [-f.uz * Math.cos(mid), Math.sin(mid), f.ux * Math.cos(mid)];
    quadOut(buf, pt(a0, k), pt(a1, k), pt(a1, k + 1), pt(a0, k + 1), out, a0 / 3, k, a1 / 3, k + 1);
  }
}

const galeries: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx, { height: 17, levels: undefined, roofLevels: undefined });
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + 17;
  const s = new Sink();
  const glass = s.buf('glass');
  vault(glass, f, -f.a * 0.75, f.a * 0.75, 4.2, top, 4.2);
  const m = s.buf('metal');
  m.color = rgb('#2b2e31');
  for (let a = -f.a * 0.75; a <= f.a * 0.75; a += 5) { // iron ribs
    fbox(m, f, a - 0.1, a + 0.1, -4.4, -4.2, top, top + 0.15);
    fbox(m, f, a - 0.1, a + 0.1, 4.2, 4.4, top, top + 0.15);
    fbox(m, f, a - 0.1, a + 0.1, -0.1, 0.1, top + 4.2, top + 4.35);
  }
  return join(base, s);
};

// ── Parlement européen: the Paul-Henri Spaak block carries the glass hémicycle dome (position approximate) ──

const parlement: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx);
  if (rec.height !== 40) return base; // Altiero Spinelli: plain curtain-wall block
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + 40;
  const s = new Sink();
  const glass = s.buf('glass');
  const R = Math.min(f.a, f.b) * 0.55;
  lathe(glass, f, 0, 0, [[R, top], [R * 0.98, top + 2], [R * 0.85, top + 6], [R * 0.6, top + 9.5], [R * 0.3, top + 11.5], [0.001, top + 12]], 24);
  const m = s.buf('metal');
  m.color = rgb('#aeb4b8');
  lathe(m, f, 0, 0, [[R * 1.04, top - 0.2], [R * 1.04, top + 0.6]], 24);
  return join(base, s);
};

// ── Colonne du Congrès: pedestal, four bronze lions, fluted shaft 47 m in all, Leopold I on top ──

const colonne: DetailFn = (rec, _parts, ctx) => {
  const f = footprintFrame(rec.outer);
  const g = ctx.minGround;
  const s = new Sink();
  const st = s.buf('masonry');
  st.color = rgb('#8f9296');
  fbox(st, f, -f.a, f.a, -f.b, f.b, g - 0.3, g + 0.6); // the OSM podium, low
  fbox(st, f, -f.a * 0.8, f.a * 0.8, -f.b * 0.8, f.b * 0.8, g + 0.6, g + 1.2);
  const ped = 3.4;
  solid(s, f, ped, g - 0.3, g + 6);
  solid(s, f, 1.5, g + 6, g + 42);
  fbox(st, f, -ped, ped, -ped, ped, g + 1.2, g + 6); // pedestal
  st.color = rgb('#7d8084');
  fbox(st, f, -ped - 0.3, ped + 0.3, -ped - 0.3, ped + 0.3, g + 5.6, g + 6.2);
  st.color = rgb('#a2a5a8');
  const shaft = (r0: number, r1: number, y0: number, y1: number) => lathe(st, f, 0, 0, [[r0, y0], [r1, y1]], 16);
  shaft(1.75, 1.45, g + 6.2, g + 40); // fluted shaft (16-gon)
  fbox(st, f, -2.1, 2.1, -2.1, 2.1, g + 40, g + 41);
  fbox(st, f, -1.7, 1.7, -1.7, 1.7, g + 41, g + 42); // capital
  const br = s.buf('bronze');
  lathe(br, f, 0, 0, [[0.9, g + 42], [0.9, g + 43]], 8); // plinth of the statue
  fbox(br, f, -0.35, 0.35, -0.3, 0.3, g + 43, g + 45.2); // Leopold I: body
  lathe(br, f, 0, 0, [[0.28, g + 45.2], [0.28, g + 46.2], [0.14, g + 46.7], [0, g + 47]], 8);
  for (const [a, w] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) { // the lions at the corners of the pedestal
    const [ca, cw] = [a * (ped + 1.2), w * (ped + 1.2)];
    fbox(br, f, ca - 1.0, ca + 1.0, cw - 0.45, cw + 0.45, g + 0.6, g + 1.6);
    fbox(br, f, ca + a * 0.2 - 0.35, ca + a * 0.2 + 0.35, cw - 0.35, cw + 0.35, g + 1.6, g + 2.6);
  }
  const fl = s.buf('gold');
  lathe(fl, f, 0, 5.2, [[0.25, g], [0.1, g + 0.8], [0, g + 1.2]], 6); // eternal flame of the Unknown Soldier, at the foot
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'grand-place': guildHouse,
  'manneken-pis': mannekenPis,
  'galeries-saint-hubert': galeries,
  'parlement-europeen': parlement,
  'colonne-du-congres': colonne,
};
