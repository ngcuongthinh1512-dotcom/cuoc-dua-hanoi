// Polyline / ring geometry for scripts/build-chunks.ts: rect clip, per-chunk road split, bridge chain merge.
// DOM-free and three-free. Flat XZ arrays as in chunkData.ts.
import { CHUNK_SIZE, type ChunkKey, chunkKey, type XZ } from './chunkData.ts';

export type Rect = { minX: number; minZ: number; maxX: number; maxZ: number };

/** Fixed 0.1 m rounding of every stored coordinate (deterministic output, junctions matched by equality). */
export const r1 = (v: number) => Math.round(v * 10) / 10;

export function reversePts(p: XZ): XZ {
  const out: XZ = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i]!, p[i + 1]!);
  return out;
}

/** Drops consecutive duplicate points; with `ring`, also closing points equal to the first. */
export function dedupe(p: XZ, ring = false): XZ {
  const out: XZ = [];
  for (let i = 0; i < p.length; i += 2) {
    if (out.length && out.at(-2) === p[i] && out.at(-1) === p[i + 1]) continue;
    out.push(p[i]!, p[i + 1]!);
  }
  while (ring && out.length > 2 && out[0] === out.at(-2) && out[1] === out.at(-1)) out.length -= 2;
  return out;
}

/** Sutherland–Hodgman clip of a ring (not closed) to a rect. Keeps orientation. May return < 3 points, and
 *  zero-width seams along the rect edge for concave rings (harmless for filling / point-in-polygon). */
export function clipRing(ring: XZ, r: Rect): XZ {
  let pts = ring;
  for (const [axis, v, keep] of [[0, r.minX, 1], [0, r.maxX, -1], [1, r.minZ, 1], [1, r.maxZ, -1]] as const) {
    const out: XZ = [];
    for (let i = 0, n = pts.length; i < n; i += 2) {
      const j = (i + 2) % n;
      const a = pts[i + axis]!;
      const b = pts[j + axis]!;
      const inA = (a - v) * keep >= 0;
      if (inA) out.push(pts[i]!, pts[i + 1]!);
      if (inA !== (b - v) * keep >= 0) {
        const o = pts[i + 1 - axis]! + ((pts[j + 1 - axis]! - pts[i + 1 - axis]!) * (v - a)) / (b - a);
        out.push(...(axis === 0 ? [v, r1(o)] : [r1(o), v]));
      }
    }
    pts = out;
  }
  return dedupe(pts, true);
}

/** Area centroid of a ring (vertex average if degenerate). */
export function ringCentroid(r: XZ): [number, number] {
  const [x0, z0] = [r[0]!, r[1]!]; // relative coordinates keep the cross products small
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const k = (i + 2) % n;
    const [xi, zi, xk, zk] = [r[i]! - x0, r[i + 1]! - z0, r[k]! - x0, r[k + 1]! - z0];
    const c = xk * zi - xi * zk;
    a += c;
    cx += (xi + xk) * c;
    cz += (zi + zk) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < r.length; i += 2) [sx, sz] = [sx + r[i]!, sz + r[i + 1]!];
    return [sx / (r.length / 2), sz / (r.length / 2)];
  }
  return [x0 + cx / (3 * a), z0 + cz / (3 * a)];
}

const segLen = (p: XZ, i: number) => Math.hypot(p[i + 2]! - p[i]!, p[i + 3]! - p[i + 1]!);

export function polylineLength(p: XZ) {
  let l = 0;
  for (let i = 0; i + 3 < p.length; i += 2) l += segLen(p, i);
  return l;
}

/** Points at ascending arc lengths `ds` along a polyline of ≥ 2 points (clamped to its ends), rounded. */
function pointsAt(p: XZ, ds: number[]): XZ {
  const out: XZ = [];
  let i = 0;
  let s0 = 0;
  for (const d of ds) {
    while (i + 5 < p.length && s0 + segLen(p, i) < d) [s0, i] = [s0 + segLen(p, i), i + 2];
    const t = Math.min(1, Math.max(0, (d - s0) / (segLen(p, i) || 1)));
    out.push(r1(p[i]! + (p[i + 2]! - p[i]!) * t), r1(p[i + 1]! + (p[i + 3]! - p[i + 1]!) * t));
  }
  return out;
}

/** Points about every `step` m along a polyline, both ends included (natural=tree_row → trees). */
export function resample(p: XZ, step: number): XZ {
  const l = polylineLength(p);
  const n = Math.max(1, Math.round(l / step));
  return pointsAt(p, Array.from({ length: n + 1 }, (_, k) => (k * l) / n));
}

/** Point at half the arc length. */
export const midpoint = (p: XZ) => pointsAt(p, [polylineLength(p) / 2]) as [number, number];

export interface RoadPiece {
  key: ChunkKey;
  pts: XZ;
  junctions: number[];
  before?: [number, number];
  after?: [number, number];
}

/**
 * Splits a polyline (≥ 2 points) into per-chunk pieces: the points where it crosses the chunk grid are inserted,
 * then each segment goes to the chunk of its midpoint. Consecutive pieces share their border vertex; `before` /
 * `after` is the neighbour vertex across the split, or across the closing point of a closed way, so miters match.
 * `junction[k]` flags input vertex k; the pieces carry the flags as local vertex indices.
 */
export function splitPolyline(pts: XZ, junction: boolean[], size = CHUNK_SIZE): RoadPiece[] {
  const v: XZ = [pts[0]!, pts[1]!];
  const flag = [junction[0] ?? false];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const [ax, az, bx, bz] = [pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!];
    const ts: number[] = [];
    for (const [a, b] of [[ax, bx], [az, bz]] as const) {
      for (let g = Math.floor(Math.min(a, b) / size) + 1; g * size < Math.max(a, b); g++) ts.push((g * size - a) / (b - a));
    }
    for (const t of ts.sort((p, q) => p - q)) {
      const [x, z] = [r1(ax + (bx - ax) * t), r1(az + (bz - az) * t)];
      if ((x !== bx || z !== bz) && (x !== v.at(-2) || z !== v.at(-1))) {
        v.push(x, z);
        flag.push(false);
      }
    }
    v.push(bx, bz);
    flag.push(junction[i / 2 + 1] ?? false);
  }
  const n = v.length / 2;
  const closed = n > 2 && v[0] === v.at(-2) && v[1] === v.at(-1);
  const keys = Array.from({ length: n - 1 }, (_, k) => chunkKey((v[2 * k]! + v[2 * k + 2]!) / 2, (v[2 * k + 1]! + v[2 * k + 3]!) / 2));
  const pieces: RoadPiece[] = [];
  for (let k = 0, s = 0; k < n - 1; k++) {
    if (keys[k] === keys[k + 1]) continue;
    const e = k + 1; // piece = vertices s..e
    const junctions: number[] = [];
    for (let q = s; q <= e; q++) if (flag[q]) junctions.push(q - s);
    const before = s > 0 ? 2 * s - 2 : closed ? 2 * n - 4 : -1;
    const after = e < n - 1 ? 2 * e + 2 : closed ? 2 : -1;
    pieces.push({
      key: keys[k]!,
      pts: v.slice(2 * s, 2 * e + 2),
      junctions,
      ...(before >= 0 && { before: [v[before]!, v[before + 1]!] as [number, number] }),
      ...(after >= 0 && { after: [v[after]!, v[after + 1]!] as [number, number] }),
    });
    s = e;
  }
  return pieces;
}

/**
 * Joins polylines of the same `group` end to end into chains (bridge ways → one deck from bank to bank). At a
 * shared end point the straightest unused continuation is taken if it turns less than `maxTurn` rad, so the two
 * carriageways of a bridge meeting at an abutment never fold into one U-shaped chain. Seeds follow input order.
 */
export function mergeChains(lines: { pts: XZ; group: string }[], maxTurn = Math.PI / 4) {
  const endKey = (g: string, x: number, z: number) => `${g}|${x},${z}`;
  const ends = new Map<string, number[]>();
  lines.forEach((l, i) => {
    for (const k of [0, l.pts.length - 2]) {
      const key = endKey(l.group, l.pts[k]!, l.pts[k + 1]!);
      ends.set(key, [...(ends.get(key) ?? []), i]);
    }
  });
  const used = lines.map(() => false);
  const chains: { pts: XZ; members: number[] }[] = [];
  lines.forEach((seed, i) => {
    if (used[i]) return;
    used[i] = true;
    let pts = seed.pts;
    const members = [i];
    for (const atEnd of [true, false]) {
      for (;;) {
        const n = pts.length;
        const [ex, ez, px, pz] = atEnd ? [pts[n - 2]!, pts[n - 1]!, pts[n - 4]!, pts[n - 3]!] : [pts[0]!, pts[1]!, pts[2]!, pts[3]!];
        let best = -1;
        let bestTurn = maxTurn;
        let bestPts: XZ = [];
        for (const j of ends.get(endKey(seed.group, ex, ez)) ?? []) {
          if (used[j]) continue;
          const q = lines[j]!.pts;
          const o = q[0] === ex && q[1] === ez ? q : reversePts(q); // o starts at the chain end
          const [dx, dz, qx, qz] = [ex - px, ez - pz, o[2]! - o[0]!, o[3]! - o[1]!];
          const turn = Math.abs(Math.atan2(dx * qz - dz * qx, dx * qx + dz * qz));
          if (turn < bestTurn) [best, bestTurn, bestPts] = [j, turn, o];
        }
        if (best < 0) break;
        used[best] = true;
        members.push(best);
        pts = atEnd ? pts.concat(bestPts.slice(2)) : reversePts(bestPts).concat(pts.slice(2));
      }
    }
    chains.push({ pts, members });
  });
  return chains;
}
