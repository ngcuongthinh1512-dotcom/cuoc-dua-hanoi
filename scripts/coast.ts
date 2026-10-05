// Leg 2 (Macao): the sea is not an OSM polygon, only natural=coastline ways with LAND ON THE LEFT of travel.
// seaPolygons() chains those ways, clips them to the water rect and closes them along the rect border clockwise
// (north up, so the water stays on the right) → sea polygons {outer, holes = islands}; build-chunks files them as
// `river: true` so carveRiver / quays / stairs / bridge gaps treat the sea like the Seine.
import type { Rect } from '../client/src/geo/clip.ts';

type P = [number, number]; // (east, north): world z points south, flipped in and out so "left of travel" keeps its meaning
type Box = { minE: number; maxE: number; minN: number; maxN: number };
export type SeaPoly = { outer: number[]; holes: number[][] };

const EPS = 0.05; // m: how close to the border a clipped end must be

function clipSeg(a: P, b: P, r: Box): [P, P, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r.minE], [dx, r.maxE - a[0]], [-dy, a[1] - r.minN], [dy, r.maxN - a[1]]] as const) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        t0 = Math.max(t0, t);
      } else {
        if (t < t0) return null;
        t1 = Math.min(t1, t);
      }
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy], t0, t1];
}

const area = (r: P[]) => r.reduce((s, p, i) => s + (p[0] * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * p[1]), 0) / 2;
function inRing(p: P, r: P[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [a, b] = [r[i]!, r[j]!];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** ways: flat [x, z, …] polylines in OSM direction (land on the left); rect: the water rect (world x, z). */
export function seaPolygons(ways: number[][], rect: Rect): SeaPoly[] {
  const box: Box = { minE: rect.minX, maxE: rect.maxX, minN: -rect.maxZ, maxN: -rect.minZ };
  const W = box.maxE - box.minE;
  const H = box.maxN - box.minN;
  const perim = 2 * (W + H);
  const k = (p: P) => `${p[0]},${p[1]}`;
  const pl: P[][] = ways.map((w) => Array.from({ length: w.length / 2 }, (_, i) => [w[2 * i]!, -w[2 * i + 1]!] as P)).filter((w) => w.length >= 2);

  // 1. chain ways end to start (a coastline is split at arbitrary nodes)
  const ends = new Set(pl.map((w) => k(w.at(-1)!)));
  const byStart = new Map(pl.map((w, i) => [k(w[0]!), i]));
  const used = new Set<number>();
  const chains: P[][] = [];
  const follow = (i: number) => {
    const chain: P[] = [];
    for (let cur: number | undefined = i; cur !== undefined && !used.has(cur); cur = byStart.get(k(pl[cur]!.at(-1)!))) {
      used.add(cur);
      chain.push(...(chain.length ? pl[cur]!.slice(1) : pl[cur]!));
    }
    chains.push(chain);
  };
  pl.forEach((w, i) => !ends.has(k(w[0]!)) && !used.has(i) && follow(i)); // open chains from their head
  pl.forEach((_, i) => !used.has(i) && follow(i)); // what is left are closed rings

  // 2. closed ring fully inside = island (CCW = land inside); anything else is clipped into border-to-border pieces
  const inside = (p: P) => p[0] >= box.minE && p[0] <= box.maxE && p[1] >= box.minN && p[1] <= box.maxN;
  const islands: P[][] = [];
  const pieces: P[][] = [];
  for (let ch of chains) {
    const closed = k(ch[0]!) === k(ch.at(-1)!);
    if (closed && ch.every(inside)) {
      if (area(ch.slice(1)) > 0) islands.push(ch.slice(1));
      continue;
    }
    if (closed) { // start the ring outside the rect so no piece wraps around its seam
      const o = ch.findIndex((p) => !inside(p));
      ch = [...ch.slice(o, -1), ...ch.slice(0, o + 1)];
    }
    let cur: P[] | null = null;
    for (let i = 0; i + 1 < ch.length; i++) {
      const c = clipSeg(ch[i]!, ch[i + 1]!, box);
      if (!c) continue;
      cur ??= [c[0]];
      cur.push(c[1]);
      if (c[3] < 1) { pieces.push(cur); cur = null; }
    }
    if (cur) pieces.push(cur);
  }
  // clockwise position along the border (north up): left edge up, top east, right edge down, bottom west
  const param = (p: P): number | null => {
    const d = [Math.abs(p[0] - box.minE), Math.abs(p[1] - box.maxN), Math.abs(p[0] - box.maxE), Math.abs(p[1] - box.minN)];
    const e = d.indexOf(Math.min(...d));
    if (d[e]! > EPS) return null;
    return [p[1] - box.minN, H + (p[0] - box.minE), H + W + (box.maxN - p[1]), 2 * H + W + (box.maxE - p[0])][e]!;
  };
  const good = pieces.filter((p) => p.length > 1 && param(p[0]!) !== null && param(p.at(-1)!) !== null);
  if (good.length < pieces.length) console.warn(`[coast] ${pieces.length - good.length} coastline piece(s) end inside the water rect (data cut), dropped`);
  const corners = [0, H, H + W, 2 * H + W];
  const cornerPt: P[] = [[box.minE, box.minN], [box.minE, box.maxN], [box.maxE, box.maxN], [box.maxE, box.minN]];

  // 3. trace: along a piece, then clockwise along the border to the next piece start
  const rings: P[][] = [];
  const done = new Set<number>();
  for (let s = 0; s < good.length; s++) {
    if (done.has(s)) continue;
    const ring: P[] = [];
    for (let i = s; ; ) {
      done.add(i);
      ring.push(...good[i]!);
      const tx = param(good[i]!.at(-1)!)!;
      const gap = (t: number) => (((t - tx) % perim) + perim) % perim;
      let next = 0;
      good.forEach((g, j) => gap(param(g[0]!)!) < gap(param(good[next]![0]!)!) && (next = j));
      const gn = gap(param(good[next]![0]!)!);
      corners.map((c, ci) => ({ g: gap(c), ci })).filter((c) => c.g > EPS && c.g < gn - EPS).sort((a, b) => a.g - b.g).forEach((c) => ring.push(cornerPt[c.ci]!));
      if (next === s || done.has(next)) break;
      i = next;
    }
    rings.push(ring);
  }
  if (!rings.length && islands.length) rings.push([...cornerPt]); // no coast crosses the rect: all sea around the islands
  const out = (r: P[]) => r.filter((p, i) => i === 0 || k(p) !== k(r[i - 1]!)).flatMap(([e, n]) => [e, -n]);
  // the rest of the pipeline (ringArea in chunkData.ts) wants outer rings positive, holes negative, in (x, z)
  const wind = (f: number[], positive: boolean) => {
    let a = 0;
    for (let i = 0; i < f.length; i += 2) a += f[(i + 2) % f.length]! * f[i + 1]! - f[i]! * f[(i + 3) % f.length]!;
    if (a > 0 === positive) return f;
    const r: number[] = [];
    for (let i = f.length - 2; i >= 0; i -= 2) r.push(f[i]!, f[i + 1]!);
    return r;
  };
  return rings.map((r) => ({
    outer: wind(out(r), true),
    holes: islands.filter((isl) => inRing(isl[0]!, r)).map((isl) => wind(out(isl), false)),
  }));
}
