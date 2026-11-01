// Leg 3 (Hà Nội) landmark details, group h4 = Hai Bà Trưng: Công viên Thống Nhất, Đền Hai Bà Trưng, Đại học Bách Khoa (C10),
// Vincom Center Bà Triệu. Built in code on top of the generic S3DB body (index.ts `generic`); temple kit from h3.ts.
// Ground is flat (y ≈ 0); details are never solid (SPEC §5.9): colliders come from `h.renderPart` bodies / Sink.prism only.
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { V3 } from '../geom.ts';
import { cap, DOWN, fbox, P, rgb, ring, UP } from './b.ts';
import { lathe } from './d.ts';
import { BRICK, CREAM, DARK, frameAt, gate3, hall, monument, OCHRE, opening, STONE, TILE, tiledBody } from './h3.ts';
import type { DetailFn } from './index.ts';
import { footprintFrame, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

// ── Công viên Thống Nhất: the park polygon (kind artwork, 60 ha, mostly lawn and trees: the lawn is lost with the outline, see
// the report) — the main gate on Trần Nhân Tông (the notch in the outline at x ≈ −765 with a crossing at x = −761), two
// hexagonal pavilions beside the fountain plaza, statues on the OSM artwork nodes, jets on the fountain node. ──
const GATE: [number, number] = [-765, 1672];

function pavilion(s: Sink, x: number, z: number, g: number) {
  const f = frameAt(x, z);
  const st = s.buf('masonry');
  st.color = rgb(STONE);
  lathe(st, f, 0, 0, [[4.2, g - 0.1], [4.2, g + 0.35]], 6); // hexagonal floor slab
  const col = s.buf('masonry');
  col.color = rgb(CREAM);
  for (let k = 0; k < 6; k++) lathe(col, f, 3.3 * Math.cos((k * Math.PI) / 3), 3.3 * Math.sin((k * Math.PI) / 3), [[0.25, g + 0.35], [0.25, g + 3.2]], 6);
  const roof = s.buf('masonry');
  roof.color = rgb(TILE);
  lathe(roof, f, 0, 0, [[4.6, g + 3.0], [2.4, g + 4.4], [0, g + 5.6]], 6); // two-pitch hexagonal tile roof
  cap(roof, ring(f, 0, 0, 4.5, g + 3.0, 6), DOWN); // underside
}

const thongNhat: DetailFn = (rec, _parts, ctx) => {
  const s = new Sink();
  const g = ctx.ground;
  const fg = frameAt(GATE[0], GATE[1]); // a east–west across Trần Nhân Tông
  const st = s.buf('masonry');
  st.color = rgb(CREAM);
  for (const a of [-10.5, -4.5, 4.5, 10.5]) fbox(st, fg, a - 0.7, a + 0.7, -0.7, 0.7, g, g + 5.6); // four gate pylons
  fbox(st, fg, -12, 12, -0.5, 0.5, g + 5.6, g + 6.8); // lintel
  const sign = s.buf('masonry');
  sign.color = rgb(TILE);
  fbox(sign, fg, -4, 4, -0.3, 0.3, g + 6.8, g + 8.2); // name board
  const fp = rec.points?.find((p) => p.kind === 'fountain');
  if (fp) {
    pavilion(s, fp.x - 32, fp.z + 6, g);
    pavilion(s, fp.x + 32, fp.z + 6, g);
    const jet = s.buf('waterJet');
    const f = frameAt(fp.x, fp.z);
    lathe(jet, f, 0, 0, [[0.6, g - 0.3], [0.25, g + 2.6], [0.06, g + 4.6], [0, g + 5.2]], 8);
    for (let k = 0; k < 6; k++) lathe(jet, f, 3.5 * Math.cos((k * Math.PI) / 3), 3.5 * Math.sin((k * Math.PI) / 3), [[0.2, g - 0.3], [0.08, g + 1.4], [0, g + 1.9]], 6);
  }
  for (const p of rec.points ?? []) if (p.kind === 'artwork') monument(s, frameAt(p.x, p.z, 0, -1), g, p.sub === 'statue' ? 3.2 : 1.6, p.sub === 'statue' ? 4.5 : 2.2); // facing north
  return s.out();
};

// ── Đền Hai Bà Trưng (Đồng Nhân, relation/19179452: a 44 × 20 m compound with three inner holes): brick wall round the
// outline, a tam quan on the end that looks at hồ Đồng Nhân (east), side halls and the main hall at the back. ──
const LAKE_HBT: [number, number] = [370, 2190];

const denHaiBaTrung: DetailFn = (rec, _parts, ctx) => {
  const s = new Sink();
  const g = ctx.ground;
  const f0 = footprintFrame(rec.outer);
  const front = Math.hypot(f0.cx + f0.a * f0.ux - LAKE_HBT[0], f0.cz + f0.a * f0.uz - LAKE_HBT[1]) < Math.hypot(f0.cx - f0.a * f0.ux - LAKE_HBT[0], f0.cz - f0.a * f0.uz - LAKE_HBT[1]) ? 1 : -1;
  const f = front > 0 ? f0 : { ...f0, ux: -f0.ux, uz: -f0.uz }; // +a = towards the lake
  const { a, b } = f;
  const gateW = Math.min(2 * b - 2, 12);
  // perimeter wall on the outline, open at the gate
  const wb = s.buf('masonry');
  wb.color = rgb(BRICK);
  const o = rec.outer;
  const n = o.length / 2;
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    const mid = ((ax + bx) / 2 - f.cx) * f.ux + ((az + bz) / 2 - f.cz) * f.uz;
    const len = Math.hypot(bx - ax, bz - az);
    const gap = mid > a - 2 ? (gateW + 0.4) / 2 / len : 0; // the front edge: two stubs beside the gate
    const nn: V3 = [-(bz - az), 0, bx - ax];
    const seg = (t0: number, t1: number) => {
      const [x0, z0, x1, z1] = [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1];
      for (const sg of [1, -1]) quadOut(wb, [x0, g, z0], [x1, g, z1], [x1, g + 2.1, z1], [x0, g + 2.1, z0], [nn[0] * sg, 0, nn[2] * sg]);
      quadOut(wb, [x0, g + 2.1, z0], [x1, g + 2.1, z1], [x1 + nn[0] * 0.001, g + 2.1, z1], [x0, g + 2.1, z0 + 0.001], UP);
    };
    if (!gap) seg(0, 1);
    else {
      seg(0, 0.5 - gap);
      seg(0.5 + gap, 1);
    }
  }
  const fg = frameAt(f.cx + (a - 2.2) * f.ux, f.cz + (a - 2.2) * f.uz, -f.uz, f.ux); // gate frame: a across the front
  gate3(s, fg, 0, 0, gateW, 4.2, g);
  hall(s, f, -a + 1.5, -a + 13.5, -b + 1.8, b - 1.8, g, 4.6, 3.2, 1.3); // main hall (hậu cung + tiền tế)
  for (let k = -1; k <= 1; k++) opening(s, f, k * 4 - 1.2, k * 4 + 1.2, -a + 13.5, g, g + 3.2, 1); // three doors on the courtyard face
  for (const sg of [-1, 1]) hall(s, f, -a + 15, a - 7, sg * (b - 1.8), sg * (b - 5.2), g, 3.4, 2.2, 1.0, OCHRE); // side halls (tả / hữu vu)
  const br = s.buf('bronze');
  lathe(br, f, 2, 0, [[0.9, g + 0.2], [0.7, g + 0.6], [0.95, g + 1.4], [0.8, g + 1.6]], 10); // incense urn in the courtyard
  s.prism([[P(f, -a + 1.5, 0, -b + 1.8), P(f, -a + 13.5, 0, -b + 1.8), P(f, -a + 13.5, 0, b - 1.8), P(f, -a + 1.5, 0, b - 1.8)].flatMap((p) => [p[0], p[2]])], g, g + 4.6);
  for (const sg of [-1, 1]) s.prism([[P(f, -a + 15, 0, sg * (b - 1.8)), P(f, a - 7, 0, sg * (b - 1.8)), P(f, a - 7, 0, sg * (b - 5.2)), P(f, -a + 15, 0, sg * (b - 5.2))].flatMap((p) => [p[0], p[2]])], g, g + 3.4);
  return s.out();
};

// ── Đại học Bách Khoa: nhà C10 / C10b (way/158465677, way/821304201: 4 levels), 1960s blocks in ochre stucco under a hipped
// tile roof, dark window bands, a two-storey portico on the face that looks at Quảng trường C1 (north); the Parabol gate
// (the concrete arch over the campus road off Giải Phóng, OSM service way/856290141 at z ≈ 2999) is drawn with C10. ──
const PORTICO: [number, number] = [-829, 2953]; // middle of C10's north face
const PARABOL: [number, number] = [-1086, 2998]; // arch centre; it spans the road north–south

const bachKhoa: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  tiledBody(rec, ctx, h, s, 12.8, 3.4, { colour: '#dcbf7a', roofColour: '#8d4b33' }); // 4 × 3.2 m + roof
  const band = s.buf('masonry');
  band.color = rgb(DARK);
  const o = rec.outer;
  const n = o.length / 2;
  const f = footprintFrame(o);
  for (let i = 0; i < n; i++) { // window bands per level, proud 4 cm
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 6) continue;
    const [nx, nz] = [-(bz - az) / len, (bx - ax) / len];
    const sg = Math.sign(((ax + bx) / 2 - f.cx) * nx + ((az + bz) / 2 - f.cz) * nz) || 1; // outward side of the edge
    const [ox, oz] = [nx * sg * 0.04, nz * sg * 0.04];
    const in0 = 1.2 / len;
    for (let k = 0; k < 4; k++) {
      const [y0, y1] = [g + 1.1 + 3.2 * k, g + 2.7 + 3.2 * k];
      quadOut(band, [ax + (bx - ax) * in0 + ox, y0, az + (bz - az) * in0 + oz], [bx - (bx - ax) * in0 + ox, y0, bz - (bz - az) * in0 + oz], [bx - (bx - ax) * in0 + ox, y1, bz - (bz - az) * in0 + oz], [ax + (bx - ax) * in0 + ox, y1, az + (bz - az) * in0 + oz], [nx * sg, 0, nz * sg]);
    }
  }
  if (Math.hypot(f.cx - PORTICO[0], f.cz - PORTICO[1]) > 30) return s.out(); // C10b: no portico, no gate
  const st = s.buf('masonry');
  st.color = rgb(CREAM);
  const fp = frameAt(PORTICO[0], PORTICO[1] - 2.6); // 2.6 m north of the wall
  for (const a of [-15, -9, -3, 3, 9, 15]) fbox(st, fp, a - 0.45, a + 0.45, -0.45, 0.45, g, g + 10.2); // six pillars
  fbox(st, fp, -17, 17, -1.4, 2.8, g + 10.2, g + 11.3); // entablature back into the wall
  const ped: V3[] = [P(fp, -17, g + 11.3, -1.4), P(fp, 17, g + 11.3, -1.4), P(fp, 0, g + 14.2, -1.4)];
  triOut(st, ped[0]!, ped[1]!, ped[2]!, [0, 0, -1]); // pediment (front face only: the roof hides the back)
  quadOut(st, ped[0]!, ped[2]!, P(fp, 0, g + 14.2, 2.8), P(fp, -17, g + 11.3, 2.8), [-1, 1, 0]);
  quadOut(st, ped[1]!, ped[2]!, P(fp, 0, g + 14.2, 2.8), P(fp, 17, g + 11.3, 2.8), [1, 1, 0]);
  // Cổng Parabol: a parabolic concrete arch, 24 m span, 11 m high, 1 m × 0.6 m section, standing across the campus road
  const arch = s.buf('masonry');
  arch.color = rgb('#d8d2c4');
  const fa = frameAt(PARABOL[0], PARABOL[1], 0, 1); // a along the span (north–south), w = east–west (through the arch)
  const N = 16;
  const pt = (k: number, da: number, dw: number): V3 => {
    const t = -1 + (2 * k) / N;
    const a = 12 * t;
    const y = g + 11 * (1 - t * t);
    const [tx, ty] = [1, -2 * 11 * t / 12]; // tangent (da/dt, dy/dt)
    const l = Math.hypot(tx, ty);
    const [nx, ny] = [-ty / l, tx / l]; // normal in the (a, y) plane
    return P(fa, a + nx * da, y + ny * da, dw);
  };
  for (let k = 0; k < N; k++) {
    for (const [da, dw0, dw1] of [[0.5, -0.3, 0.3], [-0.5, 0.3, -0.3]] as const) { // outer and inner faces
      quadOut(arch, pt(k, da, dw0), pt(k + 1, da, dw0), pt(k + 1, da, dw1), pt(k, da, dw1), [0, da > 0 ? 1 : -1, 0]);
    }
    for (const dw of [-0.3, 0.3]) quadOut(arch, pt(k, -0.5, dw), pt(k + 1, -0.5, dw), pt(k + 1, 0.5, dw), pt(k, 0.5, dw), [-fa.uz * dw, 0, fa.ux * dw]); // sides
  }
  return s.out();
};

// ── Vincom Center Hà Nội (Bà Triệu, way/840204357 = one tower part from level 6 up). The 7-level mall block is the parent
// outline BuildingBuilder draws; the tower: 21 floors over it, ≈ 88 m total (Vincom City Towers, 2004; OSM levels 23), a
// stepped crown and a mast. ──
const vincomBaTrieu: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  const top = g + 88;
  h.renderPart({ ...rec, kind: 'yes', minHeight: 22.1, height: 88, material: 'glass', roofShape: 'flat', roofMaterial: 'concrete', roofColour: '#8d9298' }, { ground: g, height: ctx.height, fallbackTop: 88 }, s);
  const f = footprintFrame(rec.outer);
  const st = s.buf('masonry');
  st.color = rgb('#b9bcc0');
  fbox(st, f, -f.a * 0.7, f.a * 0.7, -f.b * 0.7, f.b * 0.7, top, top + 3.5); // stepped crown
  fbox(st, f, -f.a * 0.42, f.a * 0.42, -f.b * 0.42, f.b * 0.42, top + 3.5, top + 6.5);
  const mast = s.buf('metal');
  mast.color = rgb('#9aa0a6');
  lathe(mast, f, 0, 0, [[0.5, top + 6.5], [0.25, top + 18], [0, top + 19]], 6);
  const band = s.buf('metal');
  band.color = rgb('#2f3940');
  const o = rec.outer;
  const n = o.length / 2;
  const r = (y: number): V3[] => Array.from({ length: n }, (_, i) => [o[2 * i]! + (o[2 * i]! - f.cx) * 0.006, y, o[2 * i + 1]! + (o[2 * i + 1]! - f.cz) * 0.006]);
  for (const y of [top - 3, 22.4 + g]) { // dark bands: under the crown and where the tower meets the mall roof
    const lo = r(y);
    const hi = r(y + 2.4);
    for (let i = 0; i < n; i++) quadOut(band, lo[i]!, lo[(i + 1) % n]!, hi[(i + 1) % n]!, hi[i]!, [lo[i]![0] - f.cx, 0, lo[i]![2] - f.cz]);
  }
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'cv-thong-nhat': thongNhat,
  'den-hai-ba-trung': denHaiBaTrung,
  dhbk: bachKhoa,
  'vincom-ba-trieu': vincomBaTrieu,
};
