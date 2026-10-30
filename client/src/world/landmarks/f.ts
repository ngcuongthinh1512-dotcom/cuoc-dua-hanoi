// Leg 3 landmark details, rebuilt to match reference photos (overrides b.ts … e.ts for the ids registered here).
// Arcades du Cinquantenaire: built WITHOUT the generic body so the three passages are really open. Frame from the OSM
// outline (way/117837711 = the arch alone, 40.6 × 17.8 m; the curved museum wings are ordinary OSM buildings next to it),
// front = west (the lawn). Sizes from the reference photo: columns ≈ 22 m on stepped pedestals, attic top 40 m, quadriga ≈ 50 m.
// Collider: the four piers only (details are never solid, SPEC §5.9).
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { V3 } from '../geom.ts';
import { fbox, type Fr, P, rgb } from './b.ts';
import { facing, lathe } from './c.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];
const STONE = '#d9d0bb';
const STONE_DK = '#c6bca5';
const VERDIGRIS = '#4e8c6e';

/** Column: fluted-looking 12-gon shaft, flared capital, square abacus. */
function column(buf: Buf, f: Fr, a: number, w: number, r: number, y0: number, y1: number) {
  lathe(buf, f, a, w, [[r, y0], [r * 0.86, y1 - 2.2], [r * 0.8, y1 - 2.1], [r * 1.25, y1 - 0.5]], 12);
  fbox(buf, f, a - r * 1.5, a + r * 1.5, w - r * 1.5, w + r * 1.5, y1 - 0.5, y1);
}

/** Flat disc on the face plane a (medallion), facing ±u. */
function disc(buf: Buf, f: Fr, a: number, w: number, y: number, r: number, dir: number) {
  const out: V3 = [f.ux * dir, 0, f.uz * dir];
  const pts = Array.from({ length: 12 }, (_, k): [number, number] => [w + r * Math.cos((2 * Math.PI * k) / 12), y + r * Math.sin((2 * Math.PI * k) / 12)]);
  for (let i = 1; i + 1 < pts.length; i++) triOut(buf, P(f, a, pts[0]![1], pts[0]![0]), P(f, a, pts[i]![1], pts[i]![0]), P(f, a, pts[i + 1]![1], pts[i + 1]![0]), out);
}

/** Standing figure (abstracted: legs / torso / head), stone or bronze. */
function figure(buf: Buf, f: Fr, a: number, w: number, y: number, h: number) {
  lathe(buf, f, a, w, [[h * 0.11, y], [h * 0.13, y + h * 0.45], [h * 0.16, y + h * 0.6], [h * 0.12, y + h * 0.82], [h * 0.07, y + h * 0.84], [h * 0.08, y + h * 0.95], [0, y + h]], 8);
}

/** A horse abreast, body along +a (head at the front), scale k (k = 1 → a 3.6 m horse). */
function horse(buf: Buf, f: Fr, a: number, w: number, y: number, k: number) {
  const B = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) => fbox(buf, f, a + a0 * k, a + a1 * k, w + w0 * k, w + w1 * k, y + y0 * k, y + y1 * k);
  B(-1.2, 1.3, -0.45, 0.45, 1.2, 2.3); // body
  for (const [da, dw] of [[-0.9, -0.25], [-0.9, 0.25], [1.0, -0.25], [1.0, 0.25]] as const) B(da - 0.12, da + 0.12, dw - 0.12, dw + 0.12, 0, 1.3);
  B(1.0, 1.8, -0.25, 0.25, 2.0, 3.4); // neck (raised)
  B(1.5, 2.5, -0.22, 0.22, 3.0, 3.6); // head
}

const arcades: DetailFn = (rec, _parts, ctx) => {
  const f = facing(rec, 270);
  const s = new Sink();
  const g = ctx.ground;
  const base = ctx.minGround - 0.4;
  const D = f.a; // half depth (≈ 8.9)
  const W = f.b; // half width (≈ 20.3)
  const PED = g + 3.6; // column pedestal top
  const CAP = g + 25.6; // capital top = entablature bottom
  const ENT = g + 31; // cornice top
  const ATT = g + 40; // attic top
  const PL = ATT + 3; // quadriga plinth top
  // inner piers 0.3 m fatter than the OSM pedestal blocks inside them (BuildingBuilder draws those; they must stay hidden)
  const PIERS: [number, number][] = [[-W, -16.3], [-10.6, -4.2], [4.2, 10.6], [16.3, W]];
  const ARCHES: [number, number, number][] = [[0, 4.2, g + 18], [-13.45, 2.85, g + 13.5], [13.45, 2.85, g + 13.5]]; // centre w, radius, springing
  const dirW: V3 = [-f.uz, 0, f.ux];

  const st = s.buf('masonry');
  st.color = rgb(STONE);
  const dk = s.buf('masonry');
  dk.color = rgb(STONE_DK);
  const soffit = s.buf('masonry');
  soffit.color = rgb('#a89f8a');

  // piers (solid, the collider) + the spandrel faces and coffered soffits over the three openings
  for (const [w0, w1] of PIERS) {
    fbox(st, f, -D, D, w0, w1, base, CAP);
    s.prism([[P(f, -D, 0, w0), P(f, D, 0, w0), P(f, D, 0, w1), P(f, -D, 0, w1)].flatMap(([x, , z]) => [x, z])], base, CAP);
  }
  const N = 14;
  for (const [wc, r, spring] of ARCHES) {
    const arc = Array.from({ length: N + 1 }, (_, k): [number, number] => [wc - r * Math.cos((Math.PI * k) / N), spring + r * Math.sin((Math.PI * k) / N)]);
    for (let k = 0; k < N; k++) {
      const [p0, p1] = [arc[k]!, arc[k + 1]!];
      for (const dir of [1, -1]) { // spandrel strip from the arc up to the entablature on both faces
        const a = dir * D;
        quadOut(st, P(f, a, p0[1], p0[0]), P(f, a, p1[1], p1[0]), P(f, a, CAP, p1[0]), P(f, a, CAP, p0[0]), [f.ux * dir, 0, f.uz * dir]);
      }
      const th = (Math.PI * (k + 0.5)) / N;
      const inward: V3 = [dirW[0] * Math.cos(th), -Math.sin(th), dirW[2] * Math.cos(th)];
      quadOut(soffit, P(f, -D, p0[1], p0[0]), P(f, -D, p1[1], p1[0]), P(f, D, p1[1], p1[0]), P(f, D, p0[1], p0[0]), inward);
      if (k % 2 === 0) continue; // coffers: a darker square every other segment, three rows along the depth
      for (let row = 0; row < 3; row++) {
        const [a0, a1] = [-D + 1.2 + row * 5.6, -D + 1.2 + row * 5.6 + 4.2];
        const [q0, q1]: [number, number][] = [[p0[0] * 0.85 + p1[0] * 0.15, p0[1] * 0.85 + p1[1] * 0.15], [p0[0] * 0.15 + p1[0] * 0.85, p0[1] * 0.15 + p1[1] * 0.85]];
        const e = 0.06;
        quadOut(dk, P(f, a0, q0[1] - e * Math.sin(th), q0[0] - e * Math.cos(th)), P(f, a0, q1[1] - e * Math.sin(th), q1[0] - e * Math.cos(th)), P(f, a1, q1[1] - e * Math.sin(th), q1[0] - e * Math.cos(th)), P(f, a1, q0[1] - e * Math.sin(th), q0[0] - e * Math.cos(th)), inward);
      }
    }
    // keystone + two relief medallions in the spandrels
    for (const dir of [1, -1]) {
      const a = dir * (D + 0.15);
      fbox(dk, f, dir * D, a, wc - 0.5, wc + 0.5, spring + r - 0.6, spring + r + 1.8);
      for (const sgn of [-1, 1]) disc(dk, f, a, wc + sgn * (r + 1.4), spring + r - 0.2, 1.3, dir);
    }
  }

  // coupled Corinthian columns on stepped pedestals before every pier, both faces; the entablature breaks forward over each pair
  const br = s.buf('metal');
  br.color = rgb(VERDIGRIS);
  for (const [w0, w1] of PIERS) {
    const pc = (w0 + w1) / 2;
    for (const dir of [1, -1]) {
      const a0 = dir * D;
      const a1 = dir * (D + 2.6);
      fbox(dk, f, a0, dir * (D + 3.0), pc - 3.1, pc + 3.1, base, g + 0.5); // steps
      fbox(dk, f, a0, a1, pc - 2.8, pc + 2.8, g + 0.5, g + 1.2);
      fbox(st, f, a0, dir * (D + 2.3), pc - 2.55, pc + 2.55, g + 1.2, PED - 0.4);
      fbox(st, f, a0, a1, pc - 2.8, pc + 2.8, PED - 0.4, PED);
      for (const sgn of [-1, 1]) column(st, f, dir * (D + 1.3), pc + sgn * 1.35, 0.65, PED, CAP);
      fbox(st, f, a0, a1, pc - 2.9, pc + 2.9, CAP, ENT - 1.2); // ressaut
      fbox(st, f, a0, dir * (D + 3.2), pc - 3.5, pc + 3.5, ENT - 1.2, ENT);
    }
  }

  // entablature with the inscription frieze and the projecting cornice, over the whole width
  fbox(st, f, -D - 0.5, D + 0.5, -W - 0.5, W + 0.5, CAP, ENT - 1.2);
  const fr = s.buf('masonry');
  fr.color = rgb('#b9af98');
  for (const dir of [1, -1]) { // inscription band
    const a = dir * (D + 0.55);
    quadOut(fr, P(f, a, CAP + 1.8, -W - 0.5), P(f, a, CAP + 1.8, W + 0.5), P(f, a, CAP + 3.7, W + 0.5), P(f, a, CAP + 3.7, -W - 0.5), [f.ux * dir, 0, f.uz * dir]);
  }
  fbox(st, f, -D - 1.4, D + 1.4, -W - 1.4, W + 1.4, ENT - 1.2, ENT);

  // attic: central panel with the gilded coat of arms, 2 + 2 figures per face, garland panels, stepped corner piers with urns
  fbox(st, f, -D + 0.6, D - 0.6, -W + 4.2, W - 4.2, ENT, ATT);
  const gold = s.buf('gold');
  for (const dir of [1, -1]) {
    const a = dir * (D - 0.6);
    const out: V3 = [f.ux * dir, 0, f.uz * dir];
    fbox(dk, f, a, dir * (D - 0.2), -2.6, 2.6, ENT + 1.2, ATT - 1.2); // panel behind the arms
    fbox(gold, f, a, dir * (D + 0.1), -1.5, 1.5, ENT + 2.2, ENT + 6.4); // shield
    lathe(gold, f, dir * (D - 0.3), 0, [[1.0, ENT + 6.4], [1.3, ENT + 6.9], [0.7, ENT + 7.6], [0, ENT + 8.3]], 8); // crown
    for (const w of [-5.2, -8.4, 5.2, 8.4]) figure(st, f, dir * (D - 0.1), w, ENT + 0.4, 4.4);
    for (const sgn of [-1, 1]) { // garland reliefs
      quadOut(fr, P(f, a + dir * 0.5, ENT + 3, sgn * 10.5), P(f, a + dir * 0.5, ENT + 3, sgn * 15.6), P(f, a + dir * 0.5, ENT + 5.2, sgn * 15.6), P(f, a + dir * 0.5, ENT + 5.2, sgn * 10.5), out);
    }
  }
  for (const sgn of [-1, 1]) {
    fbox(st, f, -D + 0.3, D - 0.3, sgn * (W - 4.4), sgn * (W - 0.3), ENT, ATT + 1.0); // corner piers
    fbox(st, f, -D + 0.9, D - 0.9, sgn * (W - 3.8), sgn * (W - 0.9), ATT + 1.0, ATT + 2.0);
    for (const dir of [1, -1]) lathe(st, f, dir * (D - 3), sgn * (W - 2.4), [[0.5, ATT + 2], [0.9, ATT + 2.4], [1.1, ATT + 3.4], [0.6, ATT + 4.4], [0.9, ATT + 4.7], [0, ATT + 5.4]], 8); // urns
  }

  // central plinth + the verdigris bronze quadriga (four horses abreast, chariot, standing figure with a banner)
  fbox(st, f, -6, 6, -7.5, 7.5, ATT, ATT + 1.2);
  fbox(st, f, -5.2, 5.2, -6.6, 6.6, ATT + 1.2, PL);
  const K = 1.6; // the real group is ≈ 10 m high
  for (const w of [-4.2, -1.4, 1.4, 4.2]) horse(br, f, 1.0, w, PL, K);
  fbox(br, f, -4.6, -1.6, -2.2, 2.2, PL, PL + 2.6); // chariot
  for (const sgn of [-1, 1]) fbox(br, f, -4.4, -1.8, sgn * 2.25, sgn * 2.45, PL + 0.1, PL + 2.6); // wheels
  figure(br, f, -3.0, 0, PL + 2.2, 5.2);
  fbox(br, f, -2.8, -2.6, 0.8, 1.0, PL + 2.6, PL + 11); // banner pole
  quadOut(br, P(f, -2.7, PL + 7.6, 1.0), P(f, -2.7, PL + 7.6, 4.0), P(f, -2.7, PL + 10.8, 4.0), P(f, -2.7, PL + 10.8, 1.0), dirW);

  // four bronze groups at the foot of the inner column pairs (on the OSM pedestal buildings, ≈ 3.2 m high)
  for (const dir of [1, -1]) {
    for (const sgn of [-1, 1]) {
      const [a, w] = [dir * (D + 1.6), sgn * 7.4];
      const [x, z] = [f.cx + a * f.ux - w * f.uz, f.cz + a * f.uz + w * f.ux];
      const y = ctx.height(x, z) + 3.2;
      fbox(br, f, a - 1, a + 1, w - 1, w + 1, y, y + 0.3);
      figure(br, f, a + 0.3, w - 0.5, y + 0.3, 2.6);
      figure(br, f, a - 0.5, w + 0.6, y + 0.3, 2.2);
    }
  }
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'arcades-cinquantenaire': arcades,
};
