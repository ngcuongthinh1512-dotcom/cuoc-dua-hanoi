// Pure geometry / layout builders for the Salle Henry Le Bœuf dev room (client/hall.html, entry hall.ts). No DOM.
// 1 unit = 1 m. X across the hall, Z along it (stage at −Z, stalls at +Z), Y up; y 0 = the stalls floor at the stage front.
// Plan = horseshoe: straight side walls x = ±halfW from zFront to zArc, then a half-ellipse rear (rz = rear).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type XZ = [number, number];
export interface Slot { x: number; y: number; z: number; yaw: number }

export const H = {
  halfW: 16, zFront: -8, zArc: 14, rear: 14,
  ceilY: 20, cornice: 19.1,
  stage: { y: 1, halfW: 12.5, back: -21, truss: { y: 12.5, z: -12.5, halfW: 10.5 } },
  tiers: [
    { y: 6.6, inset: 3.8, rows: 3 },
    { y: 11.6, inset: 2.6, rows: 2 },
  ],
  // concentric elliptical coves: [a (x), b (z)] half-axes around (0, cz); lift[i] = height of ring i's flat band above ceilY
  oval: { cz: 11, rings: [[14.5, 16], [11, 12.4], [7.2, 8.6]] as XZ[], lift: [1.1, 2.2, 3.1], wave: 0.42, waves: 6 },
  chandelier: { x: 0, z: -3.2, r: 1.6 },
  // stalls: every centre row is an arc around (0, cz); px = seat-map pixels (MAP below), riser = step per row
  stalls: { cz: -8 - (1725 - 1100) * 0.0255, riser: 0.1, seat: 0.64, balconySeat: 0.56, balconyFocus: -16 },
  conductor: { x: 0, z: -11 },
};

// ---- seat map (BOZAR "Fauteuils / Zetels", plan view, stage at the bottom, 1382 × 1206 px) ------------------------
// px → m: x = (px − x0)·s, z = zFront + (y0 − py)·s; the centre rows are arcs around px (x0, arcY) = world (0, stalls.cz).
export const MAP = { s: 0.0255, x0: 705, y0: 1100, arcY: 1725 };
export type Cat = 'g' | 'y' | 'b' | 'r' | '.'; // price colour on the map, '.' = grey (exists, not on sale)
/** One row: y = px of the centre arc on the axis; c = centre seats left→right ('|' = the rear centre aisle);
 *  l / r = side block seats, l written outer→inner, r inner→outer; sx = px of the side row's inner (aisle) end,
 *  the side row then runs outward tilted TILT° towards the stage; wc = wheelchair space at the outer ends; odd = number of
 *  odd-numbered seats in the centre row when it is not floor(n / 2) (row M: 17…22, the row itself stays centred). */
export interface MapRow { k: string; y: number; c: string; l: string; r: string; sx: number; wc?: boolean; rear?: boolean; odd?: number }
const F = (k: string, y: number, c: string, l: string, r: string, sx: number, wc?: boolean): MapRow => ({ k, y, c, l, r, sx, wc });
export const STALLS_MAP: MapRow[] = [
  F('A', 970, '.ggggggg.....gg.', 'ggggggggg', '..ggggggg', 470),
  F('B', 927, 'ggggggg..ggggg..', 'ggggggggg', '.gggggggg', 465),
  F('C', 884, 'yyyyyyyyyyyyyyyyy', 'gggggggg.', '.gggggggg', 455),
  F('D', 841, 'yyyyyyyyyyyyyyy..', '.gggyyyyyy', '.....yggg.', 445, true),
  F('E', 798, 'yyyyyyyyyyyyyyyyyy', 'ggggggyyyyyy', 'yyyyyygggggg', 435),
  F('F', 755, 'bbbbbb........bbbb', 'ggggggyyyyyy', '..yyyygggggg', 430),
  F('G', 712, 'bbbbbbbbb.bbbbbbbbb', '.gggg.yyyyyy', '.yyyyy.g....', 420, true),
  F('H', 669, 'bb..bbbbbbbbb.bbb..', '.yyybbbbbb', 'bbbbbbyyy.', 420, true),
  F('I', 626, '..........bbbbbbbbbb', 'yyyybbbbbb', '..bbbbyyyy', 410),
  F('J', 583, '.bbbbbbbbbbbbbbb.bbb', 'yyyybbbbbb', '..bbbbyyyy', 405),
  F('K', 540, 'bbbbbbbbbbbb.bbbbb..', 'yyyybbbbbb', '..bbbbyyyy', 400),
  F('L', 497, 'rrrrrrrrrrrrrrrrrrrr', 'yyyybbbbbb', 'bbbbbbyyyy', 400),
  { ...F('M', 454, 'rrrrrrrrrr..........', '', '', 405), odd: 9 }, // 17…22 = 9 odd + 11 even = 20 seats; the side blocks skip M ("Fauteuils/Zetels" label)
  F('N', 411, 'rrrrrrrrrrrrrrrr....', '..yybbbbbbb', '....bbb.y..', 410),
  F('O', 368, '..........rrrrrrrrrr', 'yyyybbbbbbb', '.......yyyy', 410),
  F('P', 325, 'rrrrrrrrrrrrrrrrrrrr', 'yyyybbb....', '....bbbyyyy', 405),
  F('Q', 270, 'rrrrrrrrrrrr..rrrrrrrrrrrr', '.yyybbbbbbb', 'bbbbbbbyyy.', 366), // curved back row, the side parts continue its arc
  // rear section (behind the cross aisle): two halves around a centre aisle; the map is cropped above row E and left /
  // right of rows C–E, so only the A / B side rows are drawn and rows F… are extrapolated and grey
  { ...F('A', 225, '..rrrrrrrr.|.rrrrrrrr..', 'rrrrrr', '..rrrr', 365), rear: true },
  { ...F('B', 182, 'rrrrrr.....|...rrrrrrrr', 'rrrr..', '.rrrrr', 365), rear: true },
  { ...F('C', 139, '....rrrrrr..|............', '', '', 365), rear: true },
  { ...F('D', 96, '..rrrrrrrr....|..............', '', '', 365), rear: true },
  { ...F('E', 53, '..............|..............', '', '', 365), rear: true },
];
for (let k = 0; k < 5; k++) STALLS_MAP.push({ ...F('FGHIJ'[k], 53 - 43 * (k + 1), '..............|..............', '', '', 365), rear: true }); // rows K2 / L2 dropped (user); ponytail: cropped on the map, clipped to the plan
export const mapX = (px: number): number => (px - MAP.x0) * MAP.s;
export const mapZ = (py: number): number => H.zFront + (MAP.y0 - py) * MAP.s;
/** Radius of a row's centre arc around (0, stalls.cz). */
export const rowR = (row: MapRow): number => (MAP.arcY - row.y) * MAP.s;
export const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQ';
const TILT = [15, 11].map((d) => (d * Math.PI) / 180); // side rows: front section / rear section, ° towards the stage
const REAR_GAP = 1.8; // rear centre aisle, in seat pitches

const lerp = THREE.MathUtils.lerp;

export function planPoints(inset: number, arcN = 48, sideN = 12): XZ[] {
  const rx = H.halfW - inset, rz = H.rear - inset, pts: XZ[] = [];
  for (let i = 0; i < sideN; i++) pts.push([-rx, lerp(H.zFront, H.zArc, i / sideN)]);
  for (let i = 0; i <= arcN; i++) {
    const t = Math.PI - (Math.PI * i) / arcN;
    pts.push([rx * Math.cos(t), H.zArc + rz * Math.sin(t)]);
  }
  for (let i = 1; i <= sideN; i++) pts.push([rx, lerp(H.zArc, H.zFront, i / sideN)]);
  return pts;
}

export function insidePlan(x: number, z: number, inset = 0): boolean {
  const rx = H.halfW - inset, rz = H.rear - inset;
  if (z < H.zFront || Math.abs(x) > rx) return false;
  return z <= H.zArc || (x / rx) ** 2 + ((z - H.zArc) / rz) ** 2 <= 1;
}

/** Pushes a point outside the plan back onto its boundary (sides: clamp x; rear: scale toward the arc centre). */
export function clampPlan(x: number, z: number, inset = 0): XZ {
  const rx = H.halfW - inset, rz = H.rear - inset;
  if (z > H.zArc) {
    const s = Math.hypot(x / rx, (z - H.zArc) / rz);
    if (s > 1) return [x / s, H.zArc + (z - H.zArc) / s];
  }
  return [THREE.MathUtils.clamp(x, -rx, rx), z];
}

export function ellipsePts(a: number, b: number, n = 96, cz = H.oval.cz): XZ[] {
  const pts: XZ[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([a * Math.cos(t), cz + b * Math.sin(t)]);
  }
  return pts;
}

/** Vertical band along a polyline (closed = the last point joins the first). u = metres / 2, v = 0..1. */
export function strip(pts: XZ[], y0: number, y1: number, closed = false): THREE.BufferGeometry {
  const p = closed ? [...pts, pts[0]] : pts;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    if (i) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    pos.push(p[i][0], y0, p[i][1], p[i][0], y1, p[i][1]);
    uv.push(s / 2, 0, s / 2, 1);
    if (i) idx.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i, 2 * i + 1, 2 * i - 1);
  }
  return indexed(pos, uv, idx);
}

/** Band between two point rows of equal length (balcony floors, cove ledges). */
export function ring(inner: XZ[], outer: XZ[], yIn: number, yOut = yIn, closed = false): THREE.BufferGeometry {
  const a = closed ? [...inner, inner[0]] : inner, b = closed ? [...outer, outer[0]] : outer;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < a.length; i++) {
    pos.push(a[i][0], yIn, a[i][1], b[i][0], yOut, b[i][1]);
    uv.push(a[i][0] / 2, a[i][1] / 2, b[i][0] / 2, b[i][1] / 2);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1);
  }
  return indexed(pos, uv, idx);
}

/** Horizontal fill of a polygon (with optional holes) at height y, uv in metres / 2. */
export function polyFill(pts: XZ[], y: number, holes: XZ[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return g;
}

/** Box from p to q with a w × h section. */
export function bar(p: THREE.Vector3, q: THREE.Vector3, w: number, h = w): THREE.BufferGeometry {
  const d = q.clone().sub(p), len = d.length();
  const up = Math.abs(d.y) > 0.9 * len ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().lookAt(p, q, up).setPosition(p.clone().add(q).multiplyScalar(0.5));
  return new THREE.BoxGeometry(w, h, len).applyMatrix4(m);
}

export function v3(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, y, z); }

/** Column shaft with 24 flutes, capital (echinus + abacus) and base; foot at y 0, facing any way. `seg` = shaft segments
 *  (72 shows the flutes; the race room's 16 keeps the silhouette only). */
export function flutedColumn(r: number, h: number, seg = 72): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(r, r * 1.06, h - 0.9, seg, 1, true).translate(0, 0.3 + (h - 0.9) / 2, 0);
  const p = shaft.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), f = 1 - 0.07 * (0.5 + 0.5 * Math.cos(24 * a));
    p.setX(i, x * f);
    p.setZ(i, z * f);
  }
  shaft.computeVertexNormals();
  const parts = [
    shaft,
    new THREE.CylinderGeometry(r * 1.12, r * 1.25, 0.3, 24).translate(0, 0.15, 0), // base
    new THREE.CylinderGeometry(r * 1.3, r * 1.02, 0.35, 24).translate(0, h - 0.6 + 0.175, 0), // echinus
    new THREE.BoxGeometry(r * 2.9, 0.25, r * 2.9).translate(0, h - 0.125, 0), // abacus
  ];
  return mergeGeometries(parts, false)!;
}

/** Theatre seat facing −Z, feet at y 0: { fabric, wood } for two instanced meshes sharing one matrix set. `low` (the race
 *  room, 1 600 seats): open planes instead of boxes, 10 triangles a seat (DoubleSide materials). */
export function seatGeometry(low = false): { fabric: THREE.BufferGeometry; wood: THREE.BufferGeometry } {
  if (low) {
    const fabric = mergeGeometries([
      new THREE.PlaneGeometry(0.5, 0.62).rotateX(0.14).translate(0, 0.78, 0.2), // back
      new THREE.PlaneGeometry(0.5, 0.46).rotateX(-Math.PI / 2).translate(0, 0.51, 0.02), // cushion top
      new THREE.PlaneGeometry(0.5, 0.12).translate(0, 0.45, 0.25), // cushion front
    ], false)!;
    const wood = mergeGeometries([-1, 1].map((s) => new THREE.PlaneGeometry(0.5, 0.66).rotateY(Math.PI / 2).translate(s * 0.275, 0.42, 0.02)), false)!;
    return { fabric, wood };
  }
  const back = new THREE.BoxGeometry(0.5, 0.62, 0.09).rotateX(0.14).translate(0, 0.78, 0.24);
  const fabric = mergeGeometries([new THREE.BoxGeometry(0.5, 0.12, 0.46).translate(0, 0.45, 0.02), back], false)!;
  const side = (s: number) => new THREE.BoxGeometry(0.06, 0.66, 0.5).translate(s * 0.275, 0.42, 0.02);
  const wood = mergeGeometries([side(1), side(-1)], false)!;
  return { fabric, wood };
}

/** Yaw for an object facing −Z to face the point (tx, tz) from (x, z). */
export function faceYaw(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

export const rowY = (i: number): number => i * H.stalls.riser;
const tiltOf = (row: MapRow) => TILT[row.rear ? 1 : 0];
/** Inner (aisle) end of a row's side block, right-hand side (x > 0); the left block mirrors it. */
function sideStart(row: MapRow): XZ {
  const r = rowR(row), x = -mapX(row.sx);
  return [x, H.stalls.cz + Math.sqrt(r * r - x * x)];
}
/** Half-width of a centre row's outermost seat. */
function centreEdge(row: MapRow): number {
  const r = rowR(row), a = H.stalls.seat / r, h = row.c.split('|');
  return r * Math.sin((h.length > 1 ? REAR_GAP / 2 + h[0].length - 0.5 : (h[0].length - 1) / 2) * a);
}
export const RADII = STALLS_MAP.map(rowR);
// mid-line of the diagonal aisle per row (rear rows without side seats: the centre terrace reaches the wall)
export const AISLE_X = STALLS_MAP.map((row) => (row.l || !row.rear ? (centreEdge(row) + sideStart(row)[0]) / 2 : Infinity));
// side blocks per section: global row indices + the rows' coordinate along the section's tilted normal
const SIDE = [false, true].map((rear) => {
  const idx = STALLS_MAP.map((row, i) => (!!row.rear === rear && row.l ? i : -1)).filter((i) => i >= 0), t = TILT[rear ? 1 : 0];
  return { idx, u: idx.map((i) => { const [x, z] = sideStart(STALLS_MAP[i]); return x * Math.sin(t) + z * Math.cos(t); }) };
});
/** Index of the band around vals[i] (boundaries at the midpoints); −1 before the first band. */
function bandIndex(vals: number[], v: number): number {
  if (v < vals[0] - (vals[1] - vals[0]) / 2) return -1;
  let i = 0;
  while (i + 1 < vals.length && v >= (vals[i] + vals[i + 1]) / 2) i++;
  return i;
}
/** Stalls floor height: one terrace per row — arcs for the centre block + aisles, tilted straight terraces for the
 *  side blocks (beyond the diagonal aisle mid-line); flat (0) in front of row A. */
export function floorYAt(x: number, z: number): number {
  const i = bandIndex(RADII, Math.hypot(x, z - H.stalls.cz));
  if (i < 0) return 0;
  if (Math.abs(x) > AISLE_X[i]) {
    const row = STALLS_MAP[i], t = tiltOf(row), sec = SIDE[row.rear ? 1 : 0];
    return rowY(sec.idx[Math.max(0, bandIndex(sec.u, Math.abs(x) * Math.sin(t) + z * Math.cos(t)))]);
  }
  return rowY(i);
}

/** Stepped stalls floor as a height field of flat cells (top quad + risers to the neighbours), clipped to the plan. */
export function stallsFloor(cell = 0.25): THREE.BufferGeometry {
  const zMax = H.zArc + H.rear, nx = Math.ceil((2 * H.halfW) / cell), nz = Math.ceil((zMax - H.zFront) / cell);
  const h = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = -H.halfW + (i + 0.5) * cell, z = H.zFront + (j + 0.5) * cell;
    if (insidePlan(x, z, 0.05)) h[j * nx + i] = floorYAt(x, z);
  }
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const quad = (p: [number, number, number][]) => {
    const n = pos.length / 3;
    for (const [x, y, z] of p) { pos.push(x, y, z); uv.push(x / 2, z / 2); }
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const y = h[j * nx + i];
    if (Number.isNaN(y)) continue;
    const x0 = -H.halfW + i * cell, x1 = x0 + cell, z0 = H.zFront + j * cell, z1 = z0 + cell;
    quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
    const ex = i + 1 < nx ? h[j * nx + i + 1] : NaN, ez = j + 1 < nz ? h[(j + 1) * nx + i] : NaN; // risers to +x / +z
    if (!Number.isNaN(ex) && ex !== y) quad(ex > y ? [[x1, y, z0], [x1, ex, z0], [x1, ex, z1], [x1, y, z1]] : [[x1, ex, z0], [x1, y, z0], [x1, y, z1], [x1, ex, z1]]);
    if (!Number.isNaN(ez) && ez !== y) quad(ez > y ? [[x1, y, z1], [x1, ez, z1], [x0, ez, z1], [x0, y, z1]] : [[x1, ez, z1], [x1, y, z1], [x0, y, z1], [x0, ez, z1]]);
  }
  return indexed(pos, uv, idx);
}

/** num / side: BOZAR numbering — the centre row's first `odd` seats from the left (default floor(n / 2): seats 1 and 2
 *  either side of the axis, an odd-count row gives its axis seat to the even side) are 1, 3, 5… outward to the left
 *  (audience view), the rest 2, 4, 6… to the right, unbroken across the aisles into the side blocks
 *  (map: row C → left block starts at 17, right block at 20; row M 17…22 = 9 odd + 11 even). */
export interface StallSeat extends Slot { row: string; block: 'L' | 'C' | 'R'; cat: Cat; rear: boolean; num: number; side: 'odd' | 'even' }
export interface Plate extends Slot { cell: number; num?: number } // cell = index in the plate atlas (ROW_LETTERS, then WC_CELL); num = wheelchair space's seat number
/** "J-14"; rear-section rows get a 2 ("A2-12"). */
export const seatLabel = (s: { row: string; rear: boolean; num: number }): string => `${s.row}${s.rear ? '2' : ''}-${s.num}`;
export const WC_CELL = ROW_LETTERS.length;
/** Seats, brass row-letter plates (row ends) and wheelchair-space quads (outer ends of D / G / H) from STALLS_MAP. */
export function stallsLayout(): { seats: StallSeat[]; plates: Plate[]; wc: Plate[] } {
  const { cz, seat } = H.stalls, seats: StallSeat[] = [], plates: Plate[] = [], wc: Plate[] = [];
  const ok = (x: number, z: number, inset: number) => insidePlan(x, z, inset) && z < H.zArc + H.rear - 1.6;
  STALLS_MAP.forEach((row, i) => {
    const r = rowR(row), a = seat / r, y = rowY(i), t = tiltOf(row), cell = ROW_LETTERS.indexOf(row.k), rear = !!row.rear;
    const halves = row.c.split('|'), gap = halves.length > 1 ? REAR_GAP : 0, angles: number[] = [];
    halves.forEach((str, hh) => {
      for (let k = 0; k < str.length; k++) {
        const th = halves.length === 1 ? (k - (str.length - 1) / 2) * a : hh === 0 ? -(gap / 2 + str.length - k - 0.5) * a : (gap / 2 + k + 0.5) * a;
        const x = r * Math.sin(th), z = cz + r * Math.cos(th);
        angles.push(th);
        if (ok(x, z, 1.1)) seats.push({ x, y, z, yaw: faceYaw(x, z, 0, cz), row: row.k, block: 'C', cat: str[k] as Cat, rear, num: 0, side: 'even' });
      }
    });
    for (const th of [Math.min(...angles) - 0.9 * a, Math.max(...angles) + 0.9 * a]) {
      const x = r * Math.sin(th), z = cz + r * Math.cos(th);
      if (ok(x, z, 0.6)) plates.push({ x, y: y + 0.75, z, yaw: faceYaw(x, z, 0, cz), cell });
    }
    const [xIn, zIn] = sideStart(row);
    for (const s of [-1, 1]) {
      const str = s < 0 ? [...row.l].reverse().join('') : row.r; // inner → outer
      const at = (j: number): XZ => [s * (xIn + j * seat * Math.cos(t)), zIn - j * seat * Math.sin(t)];
      for (let j = 0; j < str.length; j++) {
        const [x, z] = at(j);
        if (ok(x, z, 1.1)) seats.push({ x, y, z, yaw: s * t, row: row.k, block: s < 0 ? 'L' : 'R', cat: str[j] as Cat, rear, num: 0, side: 'even' });
      }
      if (!str) continue;
      const [px, pz] = at(str.length + 0.4), [wx, wz] = at(str.length + 1.1);
      if (ok(px, pz, 0.6)) plates.push({ x: px, y: y + 0.75, z: pz, yaw: s * t, cell });
      if (row.wc && ok(wx, wz, 0.2)) wc.push({ x: wx, y: y + 0.005, z: wz, yaw: s * t, cell: WC_CELL, num: 0 });
    }
    // numbering: this row's seats by side of the axis (the axis seat counts as even), outward from the centre
    const mine = seats.filter((q) => q.row === row.k && q.rear === rear), c = mine.filter((q) => q.block === 'C').sort((p, q) => p.x - q.x);
    const nOdd = row.odd ?? Math.floor(c.length / 2);
    const odd = [...c.slice(0, nOdd).reverse(), ...mine.filter((q) => q.block === 'L')], even = [...c.slice(nOdd), ...mine.filter((q) => q.block === 'R')];
    for (const [list, first, side] of [[odd, 1, 'odd'], [even, 2, 'even']] as const) {
      list.sort((p, q) => (side === 'odd' ? q.x - p.x : p.x - q.x)).forEach((q, k) => Object.assign(q, { num: first + 2 * k, side }));
      const w = wc.find((q) => q.num === 0 && q.cell === WC_CELL && (q.x < 0) === (side === 'odd') && Math.abs(q.y - y - 0.005) < 1e-6);
      if (w) w.num = first + 2 * list.length; // the wheelchair space is the outermost number of its side
    }
  });
  return { seats, plates, wc };
}
export const stallSeats = (): StallSeat[] => stallsLayout().seats;

/** Vertical 16 × 11 cm plates (row letters) or flat 1 m squares (wheelchair symbol), uv = one atlas cell, merged. */
export function plateGeometry(plates: Plate[], cells: number, flat = false): THREE.BufferGeometry {
  const parts = plates.map((p) => {
    const g = flat ? new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) : new THREE.PlaneGeometry(0.16, 0.11);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (p.cell + uv.getX(i)) / cells);
    return g.applyMatrix4(new THREE.Matrix4().makeRotationY(p.yaw + (flat ? 0 : Math.PI)).setPosition(p.x, p.y, p.z));
  });
  return mergeGeometries(parts, false)!;
}

/** Points every `step` m along a polyline. */
export function resample(pts: XZ[], step: number): XZ[] {
  const out: XZ[] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az);
    for (let s = carry; s < len; s += step) out.push([lerp(ax, bx, s / len), lerp(az, bz, s / len)]);
    carry = ((carry - len) % step + step) % step;
  }
  return out;
}

export function balconySeats(tier: { y: number; inset: number; rows: number }): Slot[] {
  const out: Slot[] = [];
  for (let k = 0; k < tier.rows; k++) {
    for (const [x, z] of resample(planPoints(tier.inset + 0.75 + k * 0.95, 96, 24), H.stalls.balconySeat)) {
      if (z < H.zFront + 1.2 || (Math.abs(x) < 0.5 && z > H.zArc)) continue;
      out.push({ x, y: tier.y + 0.02 + k * 0.38, z, yaw: faceYaw(x, z, 0, H.stalls.balconyFocus) });
    }
  }
  return out;
}

// ---- symphony orchestra on the stage: a fan around the conductor's podium ORCH.c, low wooden steps at the back ----------
export type Kind = 'vln1' | 'vln2' | 'vla' | 'vc' | 'db' | 'fl' | 'ww' | 'brass' | 'perc' | 'timp' | 'bdrum' | 'harp' | 'piano';
export const ORCH = {
  c: { x: 0, z: -9.0 }, // podium (stage coordinates); angle a = 0 points at the organ, a < 0 = audience's left (−x)
  steps: [[7.7, 8.6, 0.2], [8.6, 9.4, 0.4]] as [number, number, number][], // [r0, r1, height]: brass / percussion tiers
  span: 0.75, // half-angle of the step tiers (brass / percussion only; horns and basses stay on the floor)
  strings: [2.2, 3.3, 4.4, 5.5], gap: 0.8, // row radii, spacing along the row
};
export interface OrchSlot extends Slot { kind: Kind; row: number; seated: boolean }
export const stepH = (r: number): number => ORCH.steps.find(([r0, r1]) => r >= r0 && r < r1)?.[2] ?? 0;
/** Musicians (feet / chair on the stage or a step) facing the conductor, plus timpani, bass drum, harp and piano spots. */
export function orchestraSlots(): OrchSlot[] {
  const { c, strings, gap } = ORCH, out: OrchSlot[] = [];
  const put = (kind: Kind, r: number, a: number, row: number, seated = true, face = true) => {
    const x = c.x + r * Math.sin(a), z = c.z - r * Math.cos(a);
    if (Math.abs(x) > H.stage.halfW - 1 || z < H.stage.back + 2.3) return;
    out.push({ x, y: H.stage.y + stepH(r), z, yaw: face ? faceYaw(x, z, c.x, c.z) : 0, kind, row, seated });
  };
  strings.forEach((r, row) => { // violins I (left) · violins II · violas · cellos (right), by angle
    const n = Math.floor((2 * 1.3 * r) / gap);
    for (let k = 0; k < n; k++) {
      const a = (-(n - 1) / 2 + k) * (gap / r);
      put(a < -0.55 ? 'vln1' : a < 0 ? 'vln2' : a < 0.55 ? 'vla' : 'vc', r, a, row);
    }
  });
  (['fl', 'fl', 'ww', 'ww', 'ww'] as Kind[]).forEach((k, i) => put(k, 6.6, -0.5 + i * 0.25, 4)); // flutes, oboes
  for (let i = 0; i < 5; i++) put('ww', 7.4, -0.5 + i * 0.25, 5); // clarinets, bassoons
  for (let i = 0; i < 4; i++) put('db', 7.2, 0.85 + i * 0.15, 5, false); // double basses, standing at the back right
  for (let i = 0; i < 4; i++) put('brass', 7.3, -1.2 + i * 0.15, 5); // horns, back left
  for (let i = 0; i < 7; i++) put('brass', 8.15, -0.55 + i * 0.165, 6); // trumpets, trombones, tuba on step 1
  for (const a of [-0.58, -0.4, -0.22]) put('timp', 8.85, a, 7, false, false); // timpani on step 2 …
  put('perc', 9.2, -0.4, 7, false); // … with the timpanist behind them
  put('bdrum', 8.85, 0.3, 7, false, false);
  put('perc', 9.2, 0.3, 7, false);
  put('perc', 9.2, 0.02, 7, false);
  out.push({ x: -6.6, y: H.stage.y, z: -12.0, yaw: faceYaw(-6.6, -12, c.x, c.z), kind: 'harp', row: 2, seated: true });
  out.push({ x: -9.4, y: H.stage.y, z: -15.6, yaw: Math.PI + 0.55, kind: 'piano', row: 6, seated: true });
  return out;
}
/** Desk music stands: one per pair of string players in a row, one per wind / brass / harp player; 0.55 m towards the conductor. */
export function standSlots(slots: OrchSlot[]): Slot[] {
  const { c } = ORCH, out: Slot[] = [], toward = (x: number, z: number, d: number): XZ => { const l = Math.hypot(c.x - x, c.z - z); return [x + ((c.x - x) / l) * d, z + ((c.z - z) / l) * d]; };
  const pair = (p: OrchSlot, q: OrchSlot) => { const [x, z] = toward((p.x + q.x) / 2, (p.z + q.z) / 2, 0.55); out.push({ x, y: p.y, z, yaw: faceYaw(x, z, c.x, c.z) }); };
  for (const kind of ['vln1', 'vln2', 'vla', 'vc'] as Kind[]) for (let row = 0; row < 4; row++) {
    const sec = slots.filter((s) => s.kind === kind && s.row === row);
    for (let i = 0; i < sec.length; i += 2) pair(sec[i], sec[Math.min(i + 1, sec.length - 1)]);
  }
  for (const s of slots) if (['fl', 'ww', 'brass', 'db', 'harp'].includes(s.kind)) pair(s, s);
  return out;
}
/** Wooden step tiers (annular sectors around ORCH.c) with black skirting; y relative to the stage top. */
export function stageSteps(): { tops: THREE.BufferGeometry; skirt: THREE.BufferGeometry } {
  const { c, span, steps } = ORCH, y0 = H.stage.y, tops: THREE.BufferGeometry[] = [], skirt: THREE.BufferGeometry[] = [];
  const arc = (r: number): XZ[] => Array.from({ length: 33 }, (_, i) => { const t = -span + (2 * span * i) / 32; return [c.x + r * Math.sin(t), c.z - r * Math.cos(t)]; });
  steps.forEach(([r0, r1, h], i) => {
    const inner = arc(r0), outer = arc(r1), below = i ? steps[i - 1][2] : 0;
    tops.push(ring(outer, inner, y0 + h));
    skirt.push(strip(inner, y0 + below, y0 + h), strip([inner[0], outer[0]], y0, y0 + h), strip([inner[32], outer[32]], y0, y0 + h));
  });
  return { tops: mergeGeometries(tops, false)!, skirt: mergeGeometries(skirt, false)! };
}
/** Lighting truss over the stage: 4 chords + zigzag diagonals, hanger cables to the ceiling; lamps hang below. */
export function trussBars(): { bars: THREE.BufferGeometry; lamps: Slot[] } {
  const { y, z, halfW } = H.stage.truss, d = 0.25, parts: THREE.BufferGeometry[] = [], P = (x: number, dy: number, dz: number) => v3(x, y + dy, z + dz);
  for (const [dy, dz] of [[d, d], [d, -d], [-d, d], [-d, -d]]) parts.push(bar(P(-halfW, dy, dz), P(halfW, dy, dz), 0.05));
  for (let x = -halfW; x < halfW; x += 1) {
    const s = Math.round(x) % 2 ? 1 : -1;
    parts.push(bar(P(x, -d, s * d), P(x + 1, d, s * d), 0.03), bar(P(x, -d, -s * d), P(x + 1, d, -s * d), 0.03)); // diagonals
    parts.push(bar(P(x, d, -d), P(x, d, d), 0.03), bar(P(x, -d, -d), P(x, -d, d), 0.03)); // cross bars
  }
  for (const x of [-halfW + 0.5, -halfW / 2, 0, halfW / 2, halfW - 0.5]) parts.push(bar(P(x, d, 0), v3(x, H.ceilY, z), 0.02)); // cables
  const lamps: Slot[] = [];
  for (let i = 0; i < 12; i++) lamps.push({ x: -halfW + 1 + (i * (2 * halfW - 2)) / 11, y: y - d - 0.1, z, yaw: 0 });
  return { bars: mergeGeometries(parts, false)!, lamps };
}

export interface Pipe { x: number; y: number; h: number; r: number; gold: boolean }
/** Organ pipes in three towers + two flats, foot y and height per pipe (z = organ case front). */
export function organPipes(): Pipe[] {
  const out: Pipe[] = [];
  const tower = (cx: number, w: number, y: number, hMax: number, gold: boolean) => {
    const n = Math.round(w / 0.42);
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2), h = hMax * (0.55 + 0.45 * (1 - u * u));
      out.push({ x: cx + (i - (n - 1) / 2) * 0.42, y, h, r: 0.1 + 0.06 * (1 - u * u), gold });
    }
  };
  tower(0, 3.8, 7.4, 8.8, false);
  tower(-8.3, 3, 6.4, 7.2, false);
  tower(8.3, 3, 6.4, 7.2, false);
  tower(-4.3, 3, 7.6, 4, true);
  tower(4.3, 3, 7.6, 4, true);
  tower(-6.3, 1.2, 6.8, 2.4, true);
  tower(6.3, 1.2, 6.8, 2.4, true);
  return out;
}

/** Lattice "rose" of a coffered dome panel: rim + inner ellipse, radial ribs and crossing chords, as bars. */
export function latticeRibs(a: number, b: number, y: number, cz = H.oval.cz): THREE.BufferGeometry {
  const n = 28, rim = ellipsePts(a, b, n, cz), inner = ellipsePts(a * 0.42, b * 0.42, n, cz), mid = ellipsePts(a * 0.72, b * 0.72, n, cz);
  const parts: THREE.BufferGeometry[] = [];
  const P = (p: XZ, dy = 0) => v3(p[0], y + dy, p[1]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    parts.push(bar(P(rim[i]), P(rim[j]), 0.14, 0.18));
    parts.push(bar(P(mid[i], 0.25), P(mid[j], 0.25), 0.1, 0.14));
    parts.push(bar(P(inner[i], 0.42), P(inner[j], 0.42), 0.1, 0.14));
    parts.push(bar(P(rim[i]), P(inner[i], 0.42), 0.09, 0.14)); // arching radial rib
    if (i % 2 === 0) parts.push(bar(P(rim[i]), P(mid[(i + 4) % n], 0.25), 0.07, 0.1), bar(P(rim[i]), P(mid[(i - 4 + n) % n], 0.25), 0.07, 0.1));
  }
  parts.push(new THREE.CylinderGeometry(0.5, 0.35, 0.3, 16).translate(0, y + 0.5, cz)); // central boss
  return mergeGeometries(parts, false)!;
}

/** Closed curve of a glowing ribbon on an ellipse, rising and dipping `wave` m `waves` times. */
export function ribbonCurve(a: number, b: number, y: number, wave = H.oval.wave, waves = H.oval.waves, cz = H.oval.cz): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    pts.push(v3(a * Math.cos(t), y + wave * Math.sin(waves * t), cz + b * Math.sin(t)));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
}

function indexed(pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
