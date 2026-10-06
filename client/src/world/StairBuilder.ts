// Track D (docs/plans/phase4.md §7): highway=steps flights with real steps and stringers ('sidewalk', the footway stone)
// and handrails ('railing', the bridge iron): no new draw bucket where footways / bridges already are. Plus a collider
// the Phase 3 KCC climbs: a ramp through the mid-riser points when the flight is walkable (≤ player.maxSlopeDeg), else
// boxes. Stair colliders carry `stairs: true` (chunkBuild keeps them apart, ChunkManager registers their handles in
// world/stairs.ts).
import { lighting as LT, player as PL, roads as RC, stairs as S, terrain as T } from '../config.ts';
import type { StairRec } from '../geo/chunkData.ts';
import type { BuildCtx, Builder, TriMesh } from './buildTypes.ts';
import { MeshBuffer, type V3 } from './geom.ts';
import { quadOut, triOut } from './landmarks/kit.ts';
import { Path } from './RoadBuilder.ts';

/** A flight along `pts`: flat `landing` m at y0 from the start, then n equal treads to y1 at the end. Step k top =
 *  y0 + (y1 − y0)(k + 1)/n (the first riser starts at y0, the last tread is at y1) + lift[k] ≥ 0, which keeps a tread
 *  above the (coarse, smooth DEM) terrain where the ground bulges over the straight profile. `ext`: m the ramp collider
 *  goes on past the end along the slope (quay flights: under a swimmer's feet). */
export interface Flight {
  pts: number[]; width: number; y0: number; y1: number; n: number; landing: number; ext: number; lift: number[];
  wall?: 1 | -1; // quay: the side (sign of the offset, + = left) against the quay wall: no stringer, rail or side collider
}

const LIFT = 0.03; // m: terrain higher than this above a tread lifts the tread this far above it

/** Heights and step count of a StairRec on the (carved) grid. OSM: the ground at both ends, step_count or |Δh| / riser,
 *  never a riser above player.maxStep. Quay: coping level → stairs.quay.under below the river surface (the surface is
 *  the bed beside the flight + terrain.riverDepth). */
export function flightOf(r: StairRec, height: BuildCtx['height']): Flight {
  const p = new Path(r.pts);
  const n = r.pts.length;
  const width = r.width ?? RC.widthByKind.steps ?? RC.defaultWidth;
  if (r.quay) {
    const [mx, mz] = p.at(0, p.length / 2);
    const [dx, dz] = p.dir(p.length / 2);
    const off = width / 2 + 10; // one side is the raised quay, the other the carved bed
    const [hl, hr] = [height(mx + dz * off, mz - dx * off), height(mx - dz * off, mz + dx * off)];
    const level = Math.min(hl, hr) + T.riverDepth;
    const [y0, y1] = [level + T.quayHeight + T.copingLift, level - S.quay.under];
    const steps = Math.ceil((y0 - y1) / S.riser);
    const slope = (y0 - y1) / (p.length - S.quay.landing);
    const ext = (S.quay.rampDepth - S.quay.under) / slope;
    const wall = hl > hr ? 1 : -1;
    return { pts: r.pts, width, y0, y1, n: steps, landing: S.quay.landing, ext, lift: Array<number>(steps).fill(0), wall };
  }
  const [y0, y1] = [height(r.pts[0]!, r.pts[1]!), height(r.pts[n - 2]!, r.pts[n - 1]!)];
  const dh = Math.abs(y1 - y0);
  const steps = Math.max(r.steps ?? Math.round(dh / S.riser), Math.ceil(dh / PL.maxStep), 1);
  const f: Flight = { pts: r.pts, width, y0, y1, n: steps, landing: 0, ext: 0, lift: [] };
  const t = p.length / steps;
  for (let k = 0; k < steps; k++) {
    let g = -Infinity;
    for (const u of [k * t, (k + 0.5) * t, (k + 1) * t]) {
      for (const d of [-width / 2, 0, width / 2]) g = Math.max(g, height(...p.at(d, u)));
    }
    const over = g - stepTop(f, k);
    f.lift.push(over > LIFT ? over + LIFT : 0);
  }
  return f;
}

/** Top of step k (k = −1: the start level). */
export const stepTop = (f: Flight, k: number) => (k < 0 ? f.y0 : f.y0 + ((f.y1 - f.y0) * (k + 1)) / f.n + (f.lift[k] ?? 0));

/** Visual + collider of one flight; `glow`: a thin strip on every step nosing (material 'stairGlow': lit at night only;
 *  quay flights: none under the water). */
export function buildFlight(f: Flight, height: BuildCtx['height'], stone: MeshBuffer, rail: MeshBuffer, colliders: TriMesh[], glow?: MeshBuffer) {
  const p = new Path(f.pts);
  const L = p.length;
  const hw = f.width / 2;
  const t = (L - f.landing) / f.n; // tread
  const sOf = (k: number) => f.landing + k * t; // front edge of step k
  const rise = (f.y1 - f.y0) / f.n;
  // Ramp: flat on the landing, then through the mid-riser points of steps 1 … n − 1 to the last tread at the end,
  // extended past it along the mean slope (quay: ext).
  const knots: [number, number][] = [[0, f.y0], [f.landing, f.y0]];
  for (let k = 1; k < f.n; k++) knots.push([sOf(k), (stepTop(f, k - 1) + stepTop(f, k)) / 2]);
  knots.push([L, stepTop(f, f.n - 1)]);
  const ramp = (s: number) => {
    if (s >= L) return stepTop(f, f.n - 1) + ((s - L) * rise) / t;
    let i = 1;
    while (i < knots.length - 1 && knots[i]![0] < s) i++;
    const [[sa, ya], [sb, yb]] = [knots[i - 1]!, knots[i]!];
    return sb - sa > 1e-9 ? ya + ((yb - ya) * (s - sa)) / (sb - sa) : yb;
  };
  const nose = (s: number) => ramp(s) + Math.abs(rise) / 2; // line through the step nosings
  const P = (d: number, s: number, y: number): V3 => {
    const [x, z] = p.at(d, s);
    return [x, y, z];
  };
  /** P, continued straight past the end (s > L: the quay ramp under the water). */
  const Q = (d: number, s: number, y = ramp(s)): V3 => {
    const [x, , z] = P(d, Math.min(s, L), 0);
    const [dx, dz] = p.dir(L);
    const e = Math.max(0, s - L);
    return [x + dx * e, y, z + dz * e];
  };
  const [dx0, dz0] = p.dir(0);
  const back: V3 = [-dx0, 0, -dz0];
  // Quay flight (SPEC §4.4): from the first step within quay.sideOpen of the water on, the river side is open (no
  // stringer, rail or side wall) over a stone apron sloping out to quay.rampDepth under the surface, so a swimmer coming
  // from the side walks up onto the steps; above that the stringer's collider reaches down below a swimmer's feet.
  const level = f.y1 + S.quay.under;
  const low = f.wall ? level - S.quay.rampDepth : Infinity;
  let open = 0;
  while (f.wall && open < f.n && stepTop(f, open) > level + S.quay.sideOpen) open++;
  const end = f.wall ? sOf(open) : L; // the stringers, rails and side walls stop here

  // Landing + treads (+Y) and risers (facing the start when the flight goes down from it, else the end).
  if (f.landing > 0) quadOut(stone, P(-hw, 0, f.y0), P(hw, 0, f.y0), P(hw, f.landing, f.y0), P(-hw, f.landing, f.y0), [0, 1, 0]);
  for (let k = 0; k < f.n; k++) {
    const [s0, s1] = [sOf(k), sOf(k + 1)];
    const [ya, yb] = [stepTop(f, k - 1), stepTop(f, k)];
    quadOut(stone, P(-hw, s0, yb), P(hw, s0, yb), P(hw, s1, yb), P(-hw, s1, yb), [0, 1, 0], 0, s0, f.width, s1);
    const [dx, dz] = p.dir(s0);
    const face: V3 = yb > ya ? [-dx, 0, -dz] : [dx, 0, dz];
    if (Math.abs(yb - ya) > 1e-3) quadOut(stone, P(-hw, s0, ya), P(hw, s0, ya), P(hw, s0, yb), P(-hw, s0, yb), face, 0, ya, f.width, yb);
    const G = LT.stairs;
    if (glow && Math.abs(yb - ya) > 1e-3 && (!f.wall || Math.max(ya, yb) > level)) {
      // an L round the nose: on the upper tread (seen from above) and down the riser top (seen from below), lifted off both
      const up = yb > ya;
      const [y, a, b] = up ? [yb + G.lift, s0, s0 + G.strip] : [ya + G.lift, s0 - G.strip, s0];
      const r = up ? s0 - G.lift : s0 + G.lift;
      const w = hw - G.inset;
      quadOut(glow, P(-w, a, y), P(w, a, y), P(w, b, y), P(-w, b, y), [0, 1, 0]);
      quadOut(glow, P(-w, r, y - G.strip - G.lift), P(w, r, y - G.strip - G.lift), P(w, r, y), P(-w, r, y), face);
    }
  }
  // Stringers (both sides) from under the ground to stringer.height above the nosing line, with end caps.
  const sw = S.stringer.width;
  const st = [...new Set([...p.stations(0, end, 4), f.landing].sort((a, b) => a - b))];
  const top = (s: number) => nose(s) + S.stringer.height;
  const base = (d: number, s: number) => {
    const [x, z] = p.at(d, s);
    return Math.min(height(x, z), f.y0, f.y1) - S.base;
  };
  const sides = [1, -1].filter((side) => side !== f.wall);
  for (const side of sides) {
    const [di, do_] = [side * hw, side * (hw + sw)];
    for (let k = 1; k < st.length; k++) {
      const [s0, s1] = [st[k - 1]!, st[k]!];
      const [y0, y1] = [top(s0), top(s1)];
      const [ux, uz] = p.dir(s0);
      const out: V3 = [uz * side, 0, -ux * side];
      const inn: V3 = [-out[0], 0, -out[2]];
      quadOut(stone, P(di, s0, y0), P(do_, s0, y0), P(do_, s1, y1), P(di, s1, y1), [0, 1, 0]);
      quadOut(stone, P(do_, s0, base(do_, s0)), P(do_, s1, base(do_, s1)), P(do_, s1, y1), P(do_, s0, y0), out);
      quadOut(stone, P(di, s0, base(di, s0)), P(di, s1, base(di, s1)), P(di, s1, y1), P(di, s0, y0), inn);
    }
    for (const [s, dir] of [[0, back], [end, [-back[0], 0, -back[2]] as V3]] as const) {
      quadOut(stone, P(di, s, base(di, s)), P(do_, s, base(do_, s)), P(do_, s, top(s)), P(di, s, top(s)), dir);
    }
    // Handrail: a square tube on posts above the stringer middle.
    const d = side * (hw + sw / 2);
    const r = S.handrail.radius;
    const railY = (s: number) => nose(s) + S.handrail.height;
    // Square tube from (s0, y0) to (s1, y1) (vert: a post at s0, corners spread along s instead of up).
    const tube = (s0: number, s1: number, y0: number, y1: number, vert: boolean) => {
      const c = [[-r, -r], [r, -r], [r, r], [-r, r]] as const;
      const at = (i: number, s: number, y: number) => {
        const [a, b] = c[i % 4]!;
        return vert ? P(d + a, s + b, y) : P(d + a, s, y + b);
      };
      const mid = P(d, (s0 + s1) / 2, (y0 + y1) / 2);
      for (let i = 0; i < 4; i++) {
        const [q0, q1, q2, q3] = [at(i, s0, y0), at(i + 1, s0, y0), at(i + 1, s1, y1), at(i, s1, y1)];
        const o: V3 = [(q0[0] + q2[0]) / 2 - mid[0], vert ? 0 : (q0[1] + q2[1]) / 2 - mid[1], (q0[2] + q2[2]) / 2 - mid[2]];
        quadOut(rail, q0, q1, q2, q3, o);
      }
    };
    for (let k = 1; k < st.length; k++) tube(st[k - 1]!, st[k]!, railY(st[k - 1]!), railY(st[k]!), false);
    const posts = Math.max(1, Math.ceil(end / S.handrail.postEvery));
    for (let k = 0; k <= posts; k++) {
      const s = Math.min(Math.max((end * k) / posts, 2 * r), end - 2 * r);
      tube(s, s, top(s), railY(s), true);
    }
  }

  // Collider.
  const slope = Math.atan2(Math.abs(f.y1 - f.y0), L - f.landing);
  const v: number[] = [];
  const idx: number[] = [];
  const quad = (...q: V3[]) => {
    const b = v.length / 3;
    for (const c of q) v.push(...c);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  if (slope <= (PL.maxSlopeDeg * Math.PI) / 180 - 0.01) {
    const ss = [0, f.landing, ...Array.from({ length: f.n + 1 }, (_, k) => sOf(k)).map((s) => Math.min(s, L))].filter(
      (s, k, a) => k === 0 || s > a[k - 1]! + 1e-6,
    );
    if (f.ext > 0) ss.push(L + f.ext);
    for (let k = 1; k < ss.length; k++) quad(Q(-hw, ss[k - 1]!), Q(hw, ss[k - 1]!), Q(hw, ss[k]!), Q(-hw, ss[k]!));
    if (f.wall) {
      // The apron (collider + stone), from the steps' open river side out and down to `low`, and a wedge back along the
      // stringer's foot (2 × apron long) so a swimmer sliding along it is lifted onto the apron too; both ≤ 45°.
      const [di, de] = [-f.wall * hw, -f.wall * (hw + S.quay.apron)];
      const as = [end, ...ss.filter((s) => s > end + 1e-6)];
      for (let k = 1; k < as.length; k++) {
        const [s0, s1] = [as[k - 1]!, as[k]!];
        const q: [V3, V3, V3, V3] = [Q(di, s0), Q(di, s1), Q(de, s1, low), Q(de, s0, low)];
        quad(...q);
        quadOut(stone, ...q, [0, 1, 0], s0, 0, s1, S.quay.apron);
      }
      const w: [V3, V3, V3] = [P(-f.wall * (hw + sw), Math.max(0, end - 2 * S.quay.apron), low), Q(di, end), Q(de, end, low)];
      idx.push(v.length / 3, v.length / 3 + 1, v.length / 3 + 2);
      v.push(...w.flat());
      triOut(stone, ...w, [0, 1, 0]);
    }
  } else {
    // One closed box per step (and the landing), from under the ground to its top.
    const box = (s0: number, s1: number, y: number) => {
      const lo = Math.min(f.y0, f.y1) - S.base;
      const c = [P(-hw, s0, lo), P(hw, s0, lo), P(hw, s1, lo), P(-hw, s1, lo), P(-hw, s0, y), P(hw, s0, y), P(hw, s1, y), P(-hw, s1, y)];
      const b = v.length / 3;
      for (const q of c) v.push(...q);
      for (const [a, bb, cc, dd] of [[4, 5, 6, 7], [0, 3, 2, 1], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
        idx.push(b + a!, b + bb!, b + cc!, b + a!, b + cc!, b + dd!);
      }
    };
    // As few boxes as autostep allows (risers 0.9 × player.maxStep): the widest treads the KCC can land on. ponytail:
    // above ~50° (treads < capsule) a flight is not climbable, a DEM artefact on short OSM steps; fix the ends if it matters.
    const nb = Math.max(1, Math.ceil(Math.abs(f.y1 - f.y0) / (0.9 * PL.maxStep)));
    const tb = (L - f.landing) / nb;
    if (f.landing > 0) box(0, f.landing, f.y0);
    for (let k = 0; k < nb; k++) {
      const lift = Math.max(0, ...f.lift.filter((_, j) => sOf(j + 1) > f.landing + k * tb && sOf(j) < f.landing + (k + 1) * tb));
      box(f.landing + k * tb, f.landing + (k + 1) * tb, f.y0 + ((f.y1 - f.y0) * (k + 1)) / nb + lift);
    }
  }
  // Side walls up to the handrail (the flight's edges are not walked off; the rails are not colliders themselves). Quay:
  // below them the stringer's outer face down to `low` (a swimmer slides along the stone, never under the steps).
  for (const side of sides) {
    for (let k = 1; k < st.length; k++) {
      const [s0, s1] = [st[k - 1]!, st[k]!];
      const [d, e] = [side * hw, side * (hw + sw)];
      quad(P(d, s0, ramp(s0) - 0.2), P(d, s1, ramp(s1) - 0.2), P(d, s1, nose(s1) + S.handrail.height), P(d, s0, nose(s0) + S.handrail.height));
      if (f.wall) quad(P(e, s0, low), P(e, s1, low), P(e, s1, ramp(s1) - 0.2), P(e, s0, ramp(s0) - 0.2));
    }
  }
  colliders.push({ vertices: new Float32Array(v), indices: new Uint32Array(idx), stairs: true });
}

export const buildStairs: Builder = (chunk, ctx) => {
  const stone = new MeshBuffer('sidewalk');
  const rail = new MeshBuffer('railing');
  const glow = new MeshBuffer('stairGlow');
  const colliders: TriMesh[] = [];
  for (const r of chunk.stairs ?? []) if (r.pts.length >= 4) buildFlight(flightOf(r, ctx.height), ctx.height, stone, rail, colliders, glow);
  return { meshes: [stone.bucket(), rail.bucket(), glow.bucket()].filter((b) => b.index.length), instances: [], colliders };
};
