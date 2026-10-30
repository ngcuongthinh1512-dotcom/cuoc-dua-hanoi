// Leg 3 landmark details, part 11: The Big Game Brussels Sports Bar, Rue Henri Maus 5 (south side of the Bourse), built after a
// Street View photo (2026-10-27). The OSM house way/264142187 keeps its BuildingBuilder body (town, roof at the main cornice); the
// street facade is re-dressed 0.1 m proud of the front wall: red brick with grey-blue stone bands, three glass bays between rough
// stone piers on the ground floor, a balustraded balcony, three round-arched windows in a stone bay, an iron balcony, dentil
// cornice, mansard slope with three pointed stone dormers. The 2 m strip way/264142295 in front is not built: the terrace
// (orange round tables + slatted chairs, black parasols) stands there. Details are never solid (SPEC §5.9): the house's colliders only.
// Frame: a along the front edge (+a = the viewer's right, seen from the street), w toward the street, origin at the edge's middle.
import type { LandmarkId } from '../../geo/chunkData.ts';
import { ringArea } from '../../geo/chunkData.ts';
import { cap, fbox, type Fr, P, rgb, UP, withExtras } from './b.ts';
import { bar, hash, hcyl, rlathe, town } from './d.ts';
import type { DetailFn } from './index.ts';
import { wallFrame } from './k.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];

const FRONT: [number, number] = [-195.7, -119.75]; // middle of the front edge of way/264142187
const BRICK = ['#8f4a3d', '#874538', '#964f41', '#824236'];
const STONE = '#8e959c';
const STONE2 = '#7f868d';
const DARK = '#2b2420';

/** Front-facing quad (a0..a1 × y0..y1) at depth w. */
const plate = (buf: Buf, f: Fr, a0: number, a1: number, y0: number, y1: number, w: number) =>
  quadOut(buf, P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w), [-f.uz, 0, f.ux]);

const bigGame: DetailFn = (rec, _parts, ctx) => {
  if (Math.abs(ringArea(rec.outer)) < 40) return { meshes: [], instances: [], colliders: [] }; // the 2 m strip: terrace ground only
  const f = wallFrame(rec.outer, FRONT);
  const p0 = P(f, 0, 0, 1);
  const g = ctx.height(p0[0], p0[2]);
  const base = town(rec, ctx, { height: 17.8 });
  const s = new Sink();
  const st = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  const gl = s.buf('metal'); // dark reflective panes (the 'glass' diamond texture reads as leaded X frames on these big bays)
  gl.color = rgb('#263039');
  const iron = s.buf('metal');
  const H = 5; // half width of the front
  const stone = (b: Buf, k = 0) => { b.color = rgb(k ? STONE2 : STONE); };
  const brick = (b: Buf, k: number) => { b.color = rgb(BRICK[k % 4]!); };

  // ── brick skin above the ground floor, 0.1 m proud, in 0.4 m courses of 4 tones ──
  for (let y = g + 5.9, row = 0; y < g + 17.2; y += 0.4, row++) {
    brick(near, Math.floor(hash(row * 7.3 + f.cx) * 4));
    plate(near, f, -H, H, y, Math.min(y + 0.4, g + 17.2), 0.1);
  }
  brick(st, 1);
  plate(st, f, -H, H, g + 5.9, g + 17.2, 0.08); // far LOD backing
  // stone bands (window sill / lintel levels) and the corner quoins
  stone(st);
  for (let y = 6.0; y < 17.0; y += 1.1) fbox(st, f, -H, H, 0.1, 0.16, g + y, g + y + 0.32); // speklagen: a stone course every 1.1 m
  for (const sg of [-1, 1]) for (let y = g + 5.9, k = 0; y < g + 17.2; y += 0.8, k++) fbox(st, f, sg * (H - 0.5) - 0.25 + (k % 2) * sg * 0.25, sg * H, 0.1, 0.16, y, y + 0.4);

  /** Window: stone surround 0.25 wide (0.15 proud), dark frame, recessed glass; arched when r > 0 (round top of radius r over the lintel). */
  const win = (a0: number, a1: number, y0: number, y1: number, r = 0, wb = 0.1) => {
    stone(st);
    fbox(st, f, a0 - 0.25, a0, wb, wb + 0.15, g + y0 - 0.2, g + y1);
    fbox(st, f, a1, a1 + 0.25, wb, wb + 0.15, g + y0 - 0.2, g + y1);
    fbox(st, f, a0 - 0.3, a1 + 0.3, wb, wb + 0.2, g + y0 - 0.25, g + y0); // sill
    st.color = rgb(DARK);
    fbox(st, f, a0, a0 + 0.08, wb - 0.15, wb, g + y0, g + y1);
    fbox(st, f, a1 - 0.08, a1, wb - 0.15, wb, g + y0, g + y1);
    fbox(st, f, a0, a1, wb - 0.15, wb, g + y0, g + y0 + 0.08);
    fbox(st, f, (a0 + a1) / 2 - 0.03, (a0 + a1) / 2 + 0.03, wb - 0.15, wb, g + y0, g + y1); // mullion
    plate(gl, f, a0, a1, g + y0, g + y1, wb - 0.15);
    if (r > 0) { // round arch: stone ring + glass tympanum
      const c = (a0 + a1) / 2;
      const at = (rr: number, t: number, w: number) => P(f, c + rr * Math.cos(t), g + y1 + rr * Math.sin(t), w);
      stone(st);
      for (let i = 0; i < 12; i++) {
        const [t0, t1] = [(Math.PI * i) / 12, (Math.PI * (i + 1)) / 12];
        quadOut(st, at(r, t0, wb + 0.15), at(r, t1, wb + 0.15), at(r + 0.25, t1, wb + 0.15), at(r + 0.25, t0, wb + 0.15), [-f.uz, 0, f.ux]);
        const mo = at(r + 0.25, (t0 + t1) / 2, wb);
        const cc = at(0, 0, wb);
        quadOut(st, at(r + 0.25, t0, wb), at(r + 0.25, t1, wb), at(r + 0.25, t1, wb + 0.15), at(r + 0.25, t0, wb + 0.15), [mo[0] - cc[0], mo[1] - cc[1], mo[2] - cc[2]]);
        const mi = at(r, (t0 + t1) / 2, wb);
        quadOut(st, at(r, t0, wb - 0.15), at(r, t1, wb - 0.15), at(r, t1, wb + 0.15), at(r, t0, wb + 0.15), [cc[0] - mi[0], cc[1] - mi[1], cc[2] - mi[2]]);
        triOut(gl, at(0, 0, wb - 0.15), at(r, t0, wb - 0.15), at(r, t1, wb - 0.15), [-f.uz, 0, f.ux]);
      }
      stone(st, 1);
      fbox(st, f, c - 0.12, c + 0.12, wb, wb + 0.22, g + y1 + r + 0.15, g + y1 + r + 0.5); // keystone
    } else {
      stone(st, 1);
      fbox(st, f, a0 - 0.25, a1 + 0.25, wb, wb + 0.18, g + y1, g + y1 + 0.3); // flat stone lintel
    }
  };

  /** Turned-stone balustrade a0..a1 at depth w, standing on y. */
  const balustrade = (a0: number, a1: number, y: number, w: number) => {
    stone(st);
    fbox(st, f, a0, a1, w - 0.15, w + 0.15, y, y + 0.08);
    fbox(st, f, a0, a1, w - 0.16, w + 0.16, y + 0.95, y + 1.08); // rail
    for (let a = a0 + 0.15; a < a1 - 0.1; a += 0.28) rlathe(near, f, a, w, [[0.06, y + 0.08], [0.11, y + 0.3], [0.07, y + 0.55], [0.1, y + 0.8], [0.06, y + 0.95]], 8);
    for (const a of [a0 + 0.12, a1 - 0.12]) fbox(st, f, a - 0.14, a + 0.14, w - 0.17, w + 0.17, y, y + 1.08); // end posts
  };

  // ── ground floor: three rough stone piers, dark frames, glass bays with a dark transom band over the doors ──
  const rough = (a0: number, a1: number) => {
    for (let y = g - 0.2, k = 0; y < g + 5.2; y += 0.55, k++) {
      near.color = rgb(['#6f6e6a', '#7a7872', '#656460', '#83817a'][k % 4]!);
      fbox(near, f, a0 + (k % 2) * 0.03, a1 - ((k + 1) % 2) * 0.03, 0, 0.4 + 0.05 * (k % 3), y, Math.min(y + 0.53, g + 5.2));
    }
    st.color = rgb('#73726d');
    fbox(st, f, a0, a1, 0, 0.3, g - 0.2, g + 5.2);
    stone(st, 1);
    fbox(st, f, a0 - 0.1, a1 + 0.1, 0, 0.5, g + 5.0, g + 5.3); // capital
  };
  rough(-H, -H + 0.9);
  rough(-0.45, 0.45);
  rough(H - 0.9, H);
  for (const [a0, a1] of [[-H + 0.9, -0.45], [0.45, H - 0.9]]) {
    st.color = rgb(DARK);
    fbox(st, f, a0, a1, 0, 0.25, g + 3.6, g + 4.3); // transom band
    fbox(st, f, a0, a1, 0, 0.2, g - 0.2, g + 0.1); // threshold
    fbox(st, f, a0, a1, 0, 0.2, g + 5.0, g + 5.2);
    for (let k = 0; k <= 3; k++) { const a = a0 + ((a1 - a0) * k) / 3; fbox(st, f, a - 0.05, a + 0.05, 0, 0.2, g, g + 5.2); }
    plate(gl, f, a0, a1, g, g + 3.6, 0.05);
    plate(gl, f, a0, a1, g + 4.3, g + 5.2, 0.05);
    st.color = rgb('#3a3028');
    for (let k = 0; k < 3; k++) fbox(st, f, a0 + 0.3 + 1.2 * k, a0 + 0.5 + 1.2 * k, 0.05, 0.1, g + 2.1, g + 2.2); // door handles / lamps
  }
  // ground-floor cornice: moulded stone, a row of discs, dentils
  stone(st);
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.45, g + 5.3, g + 5.6);
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.6, g + 5.6, g + 5.9);
  stone(st, 1);
  for (let a = -H + 0.5; a < H - 0.3; a += 0.8) hcyl(near, f, a, g + 5.45, 0.09, 0.45, 0.5, 8);

  // ── floor 1 (5.9–9.4): wide balustraded balcony left + centre, small one right; windows ──
  stone(st);
  fbox(st, f, -H + 0.1, 1.1, 0.1, 1.2, g + 5.9, g + 6.3); // balcony slab
  fbox(st, f, 2.4, H - 0.1, 0.1, 0.8, g + 5.9, g + 6.3);
  balustrade(-H + 0.1, 1.1, g + 6.3, 1.1);
  balustrade(2.4, H - 0.1, g + 6.3, 0.7);
  for (const sg of [-1, 1]) fbox(st, f, sg * 0.2 - 0.1, sg * 0.2 + 0.1, 0.9, 1.2, g + 6.3, g + 7.4); // nothing between the balconies: brick
  win(-4.3, -2.6, 6.5, 9.0);
  win(-1.5, 1.5, 6.5, 9.0);
  win(2.9, 4.4, 6.5, 9.0);
  // ── floor 2 (9.4–13.2): projecting stone bay with three round-arched windows, rectangular windows either side ──
  stone(st);
  fbox(st, f, -2.2, 2.2, 0.1, 0.35, g + 9.4, g + 13.6);
  for (const c of [-1.35, 0, 1.35]) win(c - 0.45, c + 0.45, 10.2, 12.4, 0.45, 0.35);
  for (const c of [-2.2, 2.2]) fbox(st, f, c - 0.15, c + 0.15, 0.35, 0.5, g + 9.6, g + 13.3); // bay pilasters
  win(-4.4, -2.9, 10.3, 12.8);
  win(2.9, 4.4, 10.3, 12.8);
  // ── floor 3 (13.2–17.2): iron balcony on the bay's top, three small windows, rectangular ones either side ──
  stone(st);
  fbox(st, f, -2.4, 2.4, 0.1, 0.6, g + 13.6, g + 13.9);
  iron.color = rgb('#1e2124');
  for (const y of [g + 14.0, g + 14.5, g + 14.9]) bar(iron, P(f, -2.35, y, 0.55), P(f, 2.35, y, 0.55), 0.03);
  for (let a = -2.35; a <= 2.36; a += 0.2) bar(iron, P(f, a, g + 13.9, 0.55), P(f, a, g + 14.95, 0.55), 0.02);
  for (const c of [-1.35, 0, 1.35]) win(c - 0.4, c + 0.4, 14.4, 16.4);
  win(-4.4, -2.9, 14.5, 16.4);
  win(2.9, 4.4, 14.5, 16.4);
  // ── main cornice with dentils, mansard slope, three pointed stone dormers ──
  stone(st);
  fbox(st, f, -H - 0.1, H + 0.1, 0, 0.5, g + 17.2, g + 17.5);
  fbox(st, f, -H - 0.1, H + 0.1, 0, 0.7, g + 17.5, g + 17.8);
  stone(near, 1);
  for (let a = -H + 0.2; a < H; a += 0.5) fbox(near, f, a, a + 0.25, 0.5, 0.62, g + 16.95, g + 17.2);
  const slate = s.buf('masonry');
  slate.color = rgb('#3d4248');
  quadOut(slate, P(f, -H, g + 17.8, 0.2), P(f, H, g + 17.8, 0.2), P(f, H, g + 21.6, -3.2), P(f, -H, g + 21.6, -3.2), [-f.uz, 0.6, f.ux]);
  fbox(slate, f, -H, H, -3.4, -3.0, g + 17.8, g + 21.8); // ridge wall behind the slope (the town roof is flat at 17.8)
  for (const c of [-3.3, 0, 3.3]) {
    stone(st);
    fbox(st, f, c - 0.85, c + 0.85, -0.5, 0.3, g + 17.8, g + 20.2);
    const [l, r, t] = [P(f, c - 0.95, g + 20.2, 0.32), P(f, c + 0.95, g + 20.2, 0.32), P(f, c, g + 21.4, 0.32)];
    triOut(st, l, r, t, [-f.uz, 0, f.ux]); // pointed gable
    triOut(st, P(f, c - 0.95, g + 20.2, -0.5), P(f, c, g + 21.4, -0.5), P(f, c + 0.95, g + 20.2, -0.5), [f.uz, 0, -f.ux]);
    for (const sg of [-1, 1]) quadOut(st, P(f, c + sg * 0.95, g + 20.2, -0.5), P(f, c + sg * 0.95, g + 20.2, 0.32), P(f, c, g + 21.4, 0.32), P(f, c, g + 21.4, -0.5), [sg * 0.6 * f.ux - f.uz * 0.1, 0.8, sg * 0.6 * f.uz + f.ux * 0.1]);
    fbox(st, f, c - 1.0, c + 1.0, -0.5, 0.4, g + 20.0, g + 20.25); // gable cornice
    win(c - 0.45, c + 0.45, 18.3, 19.7, 0, 0.3);
  }
  cap(st, [P(f, -H, g + 21.6, -3.2), P(f, -H, g + 21.8, -3.4), P(f, H, g + 21.8, -3.4), P(f, H, g + 21.6, -3.2)], UP);

  // ── terrace: orange round tables on pedestals, slatted folding chairs, two closed black parasols ("ICE COLD") ──
  const wood = s.buf('masonry', 'near');
  const steel = s.buf('metal', 'near');
  const gt = ctx.height(P(f, 0, 0, 3)[0], P(f, 0, 0, 3)[2]);
  for (const [a, w] of [[-3.6, 1.6], [-1.4, 1.6], [1.2, 1.6], [3.4, 1.6], [-3.9, 4.0], [-1.6, 4.3], [0.9, 4.1], [3.2, 4.4]] as const) {
    const t = gt + 0.72;
    wood.color = rgb('#c8702a');
    rlathe(wood, f, a, w, [[0.36, t - 0.03], [0.36, t]], 14);
    steel.color = rgb('#55595d');
    rlathe(steel, f, a, w, [[0.03, gt], [0.03, t - 0.03]], 6);
    rlathe(steel, f, a, w, [[0.22, gt], [0.2, gt + 0.03]], 10);
    for (let k = 0; k < 4; k++) { // four chairs around, seat 0.45 m, slatted back leaning out
      const t2 = (Math.PI / 4) + (k * Math.PI) / 2;
      const [ca, cw] = [a + 0.62 * Math.cos(t2), w + 0.62 * Math.sin(t2)];
      const [ox, oz] = [Math.cos(t2), Math.sin(t2)]; // outward from the table
      wood.color = rgb(k % 2 ? '#c46a26' : '#cd762e');
      const q = (da: number, dw: number, y: number) => P(f, ca + da * ox - dw * oz, y, cw + da * oz + dw * ox);
      quadOut(wood, q(-0.2, -0.2, gt + 0.45), q(0.2, -0.2, gt + 0.45), q(0.2, 0.2, gt + 0.45), q(-0.2, 0.2, gt + 0.45), UP);
      quadOut(wood, q(0.2, -0.18, gt + 0.47), q(0.2, 0.18, gt + 0.47), q(0.27, 0.18, gt + 0.9), q(0.27, -0.18, gt + 0.9), [ox * f.ux - 0 * f.uz, 0, ox * f.uz]);
      quadOut(wood, q(0.2, 0.18, gt + 0.47), q(0.2, -0.18, gt + 0.47), q(0.27, -0.18, gt + 0.9), q(0.27, 0.18, gt + 0.9), [-ox * f.ux, 0, -ox * f.uz]);
      steel.color = rgb('#3c4044');
      for (const [da, dw] of [[-0.17, -0.17], [-0.17, 0.17], [0.17, -0.17], [0.17, 0.17]] as const) bar(steel, q(da, dw, gt), q(da, dw, gt + 0.44), 0.02);
    }
  }
  const black = s.buf('masonry');
  black.color = rgb('#15161a');
  for (const a of [-2.6, 2.4]) {
    rlathe(black, f, a, 1.6, [[0.12, gt + 0.9], [0.2, gt + 1.6], [0.16, gt + 2.6], [0.04, gt + 3.3], [0.001, gt + 3.4]], 10, 0.08, 8);
    steel.color = rgb('#55595d');
    rlathe(steel, f, a, 1.6, [[0.03, gt], [0.03, gt + 0.9]], 6);
    rlathe(steel, f, a, 1.6, [[0.3, gt], [0.28, gt + 0.05]], 10);
  }
  return withExtras(base, s);
};

export const details: Partial<Record<LandmarkId, DetailFn>> = { 'big-game-sports-bar': bigGame };
