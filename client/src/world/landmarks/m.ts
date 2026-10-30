// Leg 3 landmark details, part 12: GardeRobe MannekenPis, Rue du Chêne 19 (the City's museum of the Manneken Pis costumes), built
// after three photos (2026-10-30). The OSM corner house way/257712542 keeps its BuildingBuilder body (town, roof at the main
// cornice 14.3 m); the 6.7 m front (Rue du Chêne, NNE) is re-dressed 0.1 m proud: cream ashlar, a shopfront with two big glass
// bays around a dark-grey glass door (BXL / M transom), the sign band with "GARDEROBE MANNEKENPIS" in dark metal letters, three
// floors of two white-framed windows, a wrought lamp bracket at the corner, dentil cornice, slate mansard with gabled dormers.
// The 17.8 m blind side wall (Impasse du Val des Roses, NW; OSM artwork node "mural" at its corner end) carries the graffiti
// mural: a pixel mosaic of colour blocks, the Manneken-Pis boy in a denim jacket over a boombox, "MANNEKEN PEACE", tags below.
// Mural, lettering and logo are one OffscreenCanvas atlas per build on the 'mural' material (BuildOut.textures, like the street
// signs); without OffscreenCanvas (Node tests) the plates stay plain. Details are never solid (SPEC §5.9): the house's colliders only.
// Frames (k.ts wallFrame): a along the wall (+a = the viewer's right from the street), w outward, origin at the wall's middle.
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, UP, withExtras } from './b.ts';
import { bar, hash, rlathe, town } from './d.ts';
import type { DetailFn } from './index.ts';
import { wallFrame } from './k.ts';
import { loft, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];

const FRONT: [number, number] = [-99.65, 289.1]; // middle of the front edge C–E of way/257712542
const SIDE: [number, number] = [-107.85, 294.75]; // middle of the side wall C–A
const H = 3.35; // half width of the front
const S = 8.92; // half length of the side wall; the corner is at a = −S in the side frame
const MURAL_W = 9.6; // m of the side wall painted, from the corner
const CORNICE = 14.3; // main cornice above the front's ground
const CREAM = ['#d8ccb0', '#d2c6a9', '#ddd2b7'];
const DARK = '#2a2b2d';
const FLOORS: [number, number][] = [[5.4, 7.7], [8.4, 10.5], [11.3, 13.2]]; // window bottom / top per upper floor

// Atlas (px): the mural 1024 × 1024 ≙ MURAL_W × 14.3 m, the sign strip 1024 × 114 ≙ 6.3 × 0.7 m, the transom logo 256 × 128.
const [AW, AH] = [1024, 1280];
const SIGN = { y: 1024, h: 114 };
const LOGO = { y: 1152, w: 256, h: 128 };

/** The painted atlas; undefined without OffscreenCanvas. */
function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  const X = (u: number) => u * 1024;
  const Y = (v: number) => v * 1024;
  // ── mural: cream wall, grey rendered base with tags ──
  g.fillStyle = '#d6cfbf';
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = '#9d9c97';
  g.fillRect(0, Y(0.86), 1024, Y(0.14));
  // pixel mosaic: colour blocks hugging the top and the left (sparser toward the boy), 0.5 m cells
  const cols = ['#f2d53c', '#e94e8a', '#4cc3e6', '#8bd43f', '#f08a2b', '#8a5bc5', '#f4f4f4', '#2a9d8f', '#f5a3c7', '#1f6fd0'];
  const cell = 1024 / 19;
  for (let r = 0; r < 11; r++) {
    for (let k = 1; k < 17; k++) {
      const left = k < 7 || r < 2; // the left column reaches the boombox, the top rows span the wall
      const limit = left ? 10 : 8 - (k - 7) * 0.7; // staircase edge descending toward the right
      if (r > limit || hash(r * 17.3 + k * 3.7) > (left ? 0.9 : 0.65)) continue;
      g.fillStyle = cols[Math.floor(hash(r * 5.1 + k * 9.3) * cols.length)]!;
      g.fillRect(k * cell + 2, r * cell + 2, cell - 4, cell - 4);
    }
  }
  // boombox: silver body, dark top band, two black speakers with grey cones, handle
  g.fillStyle = '#b9bcc0';
  g.fillRect(X(0.17), Y(0.6), X(0.38), Y(0.21));
  g.fillStyle = '#2b2d30';
  g.fillRect(X(0.17), Y(0.6), X(0.38), Y(0.035));
  g.fillRect(X(0.25), Y(0.57), X(0.22), Y(0.03));
  for (const u of [0.26, 0.46]) {
    g.fillStyle = '#17181a';
    g.beginPath(), g.ellipse(X(u), Y(0.72), X(0.065), Y(0.065), 0, 0, 7), g.fill();
    g.fillStyle = '#6a6d70';
    g.beginPath(), g.ellipse(X(u), Y(0.72), X(0.027), Y(0.027), 0, 0, 7), g.fill();
  }
  g.fillStyle = '#5a5d60';
  g.fillRect(X(0.33), Y(0.67), X(0.06), Y(0.09)); // tape deck
  // the boy (≈ 9 m tall on the wall): white sneakers, pale rolled trousers, open denim jacket over a white shirt with the red
  // "MANNEKEN PEACE" badge, hands in the pockets, pale face, straw-blond hair; his head overlaps the mosaic
  g.fillStyle = '#eceae2';
  g.fillRect(X(0.52), Y(0.6), X(0.11), Y(0.26));
  g.fillRect(X(0.67), Y(0.6), X(0.11), Y(0.26));
  g.fillStyle = '#f6f6f4';
  g.fillRect(X(0.5), Y(0.84), X(0.14), Y(0.06));
  g.fillRect(X(0.66), Y(0.84), X(0.15), Y(0.06));
  g.fillStyle = '#2f3237';
  g.fillRect(X(0.5), Y(0.89), X(0.14), Y(0.015));
  g.fillRect(X(0.66), Y(0.89), X(0.15), Y(0.015));
  g.fillStyle = '#3b6cb0';
  g.fillRect(X(0.47), Y(0.37), X(0.36), Y(0.25)); // jacket
  g.fillStyle = '#2f5a98';
  g.fillRect(X(0.47), Y(0.4), X(0.07), Y(0.22)); // sleeves
  g.fillRect(X(0.76), Y(0.4), X(0.07), Y(0.22));
  g.fillStyle = '#ecebe6';
  g.fillRect(X(0.59), Y(0.38), X(0.12), Y(0.24)); // shirt in the open jacket
  g.fillStyle = '#d8d6cf';
  g.fillRect(X(0.54), Y(0.37), X(0.22), Y(0.025)); // collar
  g.fillStyle = '#d7352f';
  g.fillRect(X(0.6), Y(0.43), X(0.1), Y(0.08)); // red badge
  g.fillStyle = '#fff';
  g.font = `bold ${Y(0.018)}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('MANNEKEN', X(0.65), Y(0.455));
  g.fillText('PEACE', X(0.65), Y(0.48));
  g.fillStyle = '#f0d6c0';
  g.beginPath(), g.ellipse(X(0.65), Y(0.275), X(0.1), Y(0.1), 0, 0, 7), g.fill(); // head
  g.fillStyle = '#d8c48a';
  g.beginPath(), g.ellipse(X(0.65), Y(0.22), X(0.105), Y(0.06), 0, Math.PI, 2 * Math.PI), g.fill(); // hair
  g.fillStyle = '#3a3230';
  for (const u of [0.615, 0.685]) g.beginPath(), g.ellipse(X(u), Y(0.275), X(0.009), Y(0.009), 0, 0, 7), g.fill(); // eyes
  g.fillStyle = '#c98c7a';
  g.fillRect(X(0.63), Y(0.315), X(0.04), Y(0.007)); // mouth
  // "MANNEKEN PEACE" lettering on a black splash beside the jacket
  g.fillStyle = '#1b1b1d';
  g.beginPath(), g.ellipse(X(0.38), Y(0.52), X(0.1), Y(0.05), -0.3, 0, 7), g.fill();
  g.fillStyle = '#fff';
  g.font = `italic bold ${Y(0.03)}px Arial, sans-serif`;
  g.fillText('MANNEKEN', X(0.38), Y(0.505));
  g.fillText('PEACE', X(0.38), Y(0.535));
  // tags on the base: scribbles in black / white / red, a hashtag line
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = ['#1a1a1a', '#f2f2f2', '#d23a2f', '#1a1a1a'][i % 4]!;
    g.lineWidth = 3 + 4 * hash(i * 2.3);
    g.beginPath();
    const x0 = X(hash(i * 7.7) * 0.95);
    const y0 = Y(0.87 + hash(i * 3.1) * 0.11);
    g.moveTo(x0, y0);
    for (let k = 1; k < 5; k++) g.lineTo(x0 + X(0.03 * k * (hash(i + k * 0.7) - 0.3)), y0 + Y(0.03 * (hash(i * k + 1.3) - 0.5)));
    g.stroke();
  }
  g.fillStyle = '#f4f4f4';
  g.font = `bold ${Y(0.02)}px Arial, sans-serif`;
  g.fillText('#MANNEKENPEACE', X(0.27), Y(0.83));
  // ── sign strip: dark metal letters on cream stone ──
  g.fillStyle = '#d8cdb0';
  g.fillRect(0, SIGN.y, 1024, SIGN.h);
  g.fillStyle = '#2d2d2f';
  g.font = 'bold 86px "Futura", "Century Gothic", "Avenir", Arial, sans-serif';
  g.fillText('GARDEROBE  MANNEKENPIS', 512, SIGN.y + SIGN.h / 2 + 4, 1000);
  // ── transom logo: BXL + M on dark grey ──
  g.fillStyle = '#4a4d50';
  g.fillRect(0, LOGO.y, LOGO.w, LOGO.h);
  g.fillStyle = '#fff';
  g.font = 'bold 54px Arial, sans-serif';
  g.fillText('BXL', 80, LOGO.y + 64);
  g.beginPath(), g.ellipse(190, LOGO.y + 64, 40, 40, 0, 0, 7), g.fill();
  g.fillStyle = '#4a4d50';
  g.font = 'bold 56px Arial, sans-serif';
  g.fillText('M', 190, LOGO.y + 66);
  return c.transferToImageBitmap();
}

/** Outward-facing quad (a0..a1 × y0..y1) at depth w; uv from an atlas cell (px) when given. */
function plate(buf: Buf, f: Fr, a0: number, a1: number, y0: number, y1: number, w: number, cell?: [number, number, number, number]) {
  const [u0, v0, u1, v1] = cell ? [cell[0] / AW, (cell[1] + cell[3]) / AH, (cell[0] + cell[2]) / AW, cell[1] / AH] : [0, 0, 1, 1];
  buf.quad(P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w), u0, v0, u1, v1); // a→b→c→d is outward for +a = right
}

/** Window with a stone surround (sill + flat lintel), white cross frame, dark reflective glass; the wall is at depth wb. */
function window(s: Sink, f: Fr, a0: number, a1: number, y0: number, y1: number, wb: number, frame = '#e9e7e1') {
  const st = s.buf('masonry');
  const gl = s.buf('metal');
  st.color = rgb('#cfc3a5');
  fbox(st, f, a0 - 0.15, a0, wb, wb + 0.08, y0 - 0.1, y1 + 0.1);
  fbox(st, f, a1, a1 + 0.15, wb, wb + 0.08, y0 - 0.1, y1 + 0.1);
  fbox(st, f, a0 - 0.2, a1 + 0.2, wb, wb + 0.14, y0 - 0.14, y0); // sill
  fbox(st, f, a0 - 0.15, a1 + 0.15, wb, wb + 0.1, y1, y1 + 0.3); // lintel
  st.color = rgb(frame);
  for (const [p, q] of [[a0, a0 + 0.07], [a1 - 0.07, a1], [(a0 + a1) / 2 - 0.035, (a0 + a1) / 2 + 0.035]]) fbox(st, f, p!, q!, wb - 0.08, wb, y0, y1);
  fbox(st, f, a0, a1, wb - 0.08, wb, y0, y0 + 0.07);
  fbox(st, f, a0, a1, wb - 0.08, wb, y0 + (y1 - y0) * 0.62, y0 + (y1 - y0) * 0.62 + 0.07); // transom
  gl.color = rgb('#263039');
  plate(gl, f, a0, a1, y0, y1, wb - 0.08); // stays in front of the body wall (w = 0)
}

/** Gabled dormer on a mansard slope: box from the wall plane back into the roof, pointed gable, window. */
function dormer(s: Sink, f: Fr, c: number, y: number) {
  const st = s.buf('masonry');
  st.color = rgb(CREAM[0]!);
  fbox(st, f, c - 0.75, c + 0.75, -1.8, 0.12, y, y + 2.1);
  const [l, r, t] = [P(f, c - 0.85, y + 2.1, 0.14), P(f, c + 0.85, y + 2.1, 0.14), P(f, c, y + 2.9, 0.14)];
  triOut(st, l, r, t, [-f.uz, 0, f.ux]);
  st.color = rgb('#3d4248');
  for (const sg of [-1, 1]) quadOut(st, P(f, c + sg * 0.85, y + 2.1, -1.8), P(f, c + sg * 0.85, y + 2.1, 0.2), P(f, c, y + 2.95, 0.2), P(f, c, y + 2.95, -1.8), [sg * 0.6 * f.ux - 0.1 * f.uz, 0.8, sg * 0.6 * f.uz + 0.1 * f.ux]);
  fbox(st, f, c - 0.9, c + 0.9, -0.1, 0.2, y + 1.95, y + 2.1); // gable cornice
  window(s, f, c - 0.42, c + 0.42, y + 0.45, y + 1.75, 0.12);
}

/** Vertices of `ring` moved inward by `d` (mitred): the top ring of the mansard. */
function inset(ring: number[], d: number): V3[] {
  const n = ring.length / 2;
  const [cx, cz] = [ring.filter((_, k) => !(k % 2)).reduce((p, q) => p + q, 0) / n, ring.filter((_, k) => k % 2).reduce((p, q) => p + q, 0) / n];
  const normal = (i: number) => { // inward unit normal of edge i → i+1
    const [ax, az, bx, bz] = [ring[2 * i]!, ring[2 * i + 1]!, ring[(2 * i + 2) % (2 * n)]!, ring[(2 * i + 3) % (2 * n)]!];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [-(bz - az) / l, (bx - ax) / l];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    return [nx, nz];
  };
  return Array.from({ length: n }, (_, i) => {
    const [n1, n2] = [normal((i + n - 1) % n), normal(i)];
    const k = d / Math.max(0.3, 1 + n1[0]! * n2[0]! + n1[1]! * n2[1]!);
    return [ring[2 * i]! + (n1[0]! + n2[0]!) * k, 0, ring[2 * i + 1]! + (n1[1]! + n2[1]!) * k] as V3;
  });
}

const garderobe: DetailFn = (rec, _parts, ctx) => {
  const f = wallFrame(rec.outer, FRONT);
  const sf = wallFrame(rec.outer, SIDE);
  const p0 = P(f, 0, 0, 1);
  const g = ctx.height(p0[0], p0[2]);
  const base: BuildOut = town(rec, ctx, { height: CORNICE });
  const s = new Sink();
  const st = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  const gl = s.buf('metal');
  const iron = s.buf('metal');
  const mural = s.buf('mural');
  const image = paintAtlas();
  const cream = (b: Buf, k = 0) => { b.color = rgb(CREAM[k % 3]!); };
  const courses = (fr: Fr, a0: number, a1: number, y0: number, y1: number) => { // ashlar in 0.55 m courses of 3 tones, 0.1 m proud
    cream(st, 1);
    plate(st, fr, a0, a1, y0, y1, 0.08);
    for (let y = y0, row = 0; y < y1; y += 0.55, row++) {
      cream(near, Math.floor(hash(row * 3.3 + fr.cx) * 3));
      plate(near, fr, a0, a1, y, Math.min(y + 0.55, y1), 0.1);
    }
  };

  // ── front: shopfront (plinth, two glass bays, door with the BXL transom), sign band, ground-floor cornice ──
  st.color = rgb('#55565a');
  fbox(st, f, -H, H, 0, 0.16, g - 0.3, g + 0.55); // dark stone plinth
  courses(f, -H, H, g + 0.55, g + 3.3); // backing; the piers stay, the bays are cut in front of it
  for (const [a0, a1] of [[-H, -H + 0.5], [-0.85, -0.55], [0.55, 0.85], [H - 0.5, H]]) { cream(st, 0); fbox(st, f, a0!, a1!, 0, 0.22, g + 0.55, g + 3.3); } // piers
  for (const [a0, a1] of [[-H + 0.5, -0.85], [0.85, H - 0.5]]) { // glass bays: dark frame 0.08, glass 0.14 back
    st.color = rgb(DARK);
    for (const [p, q] of [[a0!, a0! + 0.08], [a1! - 0.08, a1!]]) fbox(st, f, p!, q!, 0.05, 0.2, g + 0.55, g + 3.3);
    fbox(st, f, a0!, a1!, 0.05, 0.2, g + 0.55, g + 0.63);
    fbox(st, f, a0!, a1!, 0.05, 0.2, g + 3.22, g + 3.3);
    gl.color = rgb('#2a333b');
    plate(gl, f, a0!, a1!, g + 0.63, g + 3.22, 0.14);
    near.color = rgb(hash(a0!) > 0.5 ? '#c0392b' : '#2c6fbd'); // costume mannequins behind the glass
    for (const c of [a0! + 0.5, (a0! + a1!) / 2, a1! - 0.5]) fbox(near, f, c - 0.14, c + 0.14, 0, 0.12, g + 0.75, g + 1.9);
  }
  st.color = rgb('#4a4d50'); // door: dark-grey frame, glass leaf, transom with the logo
  for (const [p, q] of [[-0.55, -0.45], [0.45, 0.55]]) fbox(st, f, p!, q!, 0.02, 0.2, g, g + 3.3);
  fbox(st, f, -0.55, 0.55, 0.02, 0.2, g + 2.35, g + 2.5);
  fbox(st, f, -0.55, 0.55, 0.02, 0.2, g + 3.22, g + 3.3);
  fbox(st, f, -0.45, 0.45, 0.02, 0.1, g, g + 0.5);
  gl.color = rgb('#30383f');
  plate(gl, f, -0.45, 0.45, g + 0.5, g + 2.35, 0.08);
  if (image) plate(mural, f, -0.45, 0.45, g + 2.5, g + 3.22, 0.1, [0, LOGO.y, LOGO.w, LOGO.h]);
  else { st.color = rgb('#4a4d50'); plate(st, f, -0.45, 0.45, g + 2.5, g + 3.22, 0.1); }
  st.color = rgb('#8a8d90');
  fbox(st, f, 0.3, 0.33, 0.2, 0.26, g + 1.0, g + 1.5); // handle
  courses(f, -H, H, g + 3.3, g + 4.4); // sign band
  if (image) plate(mural, f, -3.15, 3.15, g + 3.5, g + 4.2, 0.12, [0, SIGN.y, 1024, SIGN.h]);
  st.color = rgb('#2d2d2f');
  fbox(st, f, -3.15, 3.15, 0.1, 0.12, g + 3.5, g + 4.2); // the letters' shadow depth, backing the strip
  cream(st, 2);
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.25, g + 4.4, g + 4.7); // ground-floor cornice
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.18, g + 4.7, g + 5.05); // sill course of floor 1

  // ── front upper floors: cream ashlar, two bays of white windows per floor, corner quoins, main cornice ──
  courses(f, -H, H, g + 5.05, g + CORNICE - 0.4);
  for (const [y0, y1] of FLOORS) for (const c of [-1.6, 1.6]) window(s, f, c - 0.62, c + 0.62, g + y0, g + y1, 0.1);
  cream(st, 0);
  for (let y = g + 4.7, k = 0; y < g + CORNICE - 0.4; y += 0.55, k++) fbox(st, f, H - 0.55 - (k % 2) * 0.25, H, 0.1, 0.15, y, y + 0.53); // quoins
  cream(st, 2);
  fbox(st, f, -H - 0.1, H + 0.1, 0, 0.3, g + CORNICE - 0.4, g + CORNICE - 0.15);
  fbox(st, f, -H - 0.1, H + 0.1, 0, 0.45, g + CORNICE - 0.15, g + CORNICE + 0.05);
  cream(near, 1);
  for (let a = -H + 0.1; a < H; a += 0.4) fbox(near, f, a, a + 0.2, 0.3, 0.4, g + CORNICE - 0.6, g + CORNICE - 0.4); // dentils

  // ── lamp bracket at the corner: wrought scroll arm out of the wall at 6.2 m, a glazed lantern with a pointed cap ──
  iron.color = rgb('#1e2124');
  const arm = (a: number, y: number, w: number): V3 => P(f, a, y, w);
  bar(iron, arm(2.75, g + 5.9, 0.1), arm(2.75, g + 6.9, 0.95), 0.05);
  bar(iron, arm(2.75, g + 5.5, 0.1), arm(2.75, g + 6.3, 0.6), 0.03);
  bar(iron, arm(2.75, g + 6.3, 0.6), arm(2.75, g + 6.9, 0.95), 0.03);
  bar(iron, arm(2.75, g + 6.9, 0.95), arm(2.75, g + 7.3, 0.95), 0.03);
  bar(iron, arm(2.75, g + 5.5, 0.1), arm(2.75, g + 7.0, 0.1), 0.04); // wall plate
  gl.color = rgb('#dfe6c9');
  fbox(gl, f, 2.6, 2.9, 0.8, 1.1, g + 6.4, g + 6.9); // lantern glass
  rlathe(iron, f, 2.75, 0.95, [[0.22, g + 6.9], [0.1, g + 7.1], [0.03, g + 7.35]], 4); // cap
  rlathe(iron, f, 2.75, 0.95, [[0.18, g + 6.32], [0.05, g + 6.4]], 4);

  // ── side wall (alley): the mural on the first MURAL_W m from the corner, cream ashlar + two window bays beyond ──
  const gm = Math.min(g, ctx.height(...(([x, , z]) => [x, z] as const)(P(sf, -S + MURAL_W, 0, 1))));
  const gs = Math.min(gm, ctx.height(...(([x, , z]) => [x, z] as const)(P(sf, S, 0, 1))));
  if (image) plate(mural, sf, -S, -S + MURAL_W, gm - 0.3, g + CORNICE - 0.4, 0.1, [0, 0, 1024, 1024]);
  else courses(sf, -S, -S + MURAL_W, gm - 0.3, g + CORNICE - 0.4);
  courses(sf, -S + MURAL_W, S, gs - 0.3, g + CORNICE - 0.4);
  st.color = rgb('#55565a');
  fbox(st, sf, -S + MURAL_W, S, 0, 0.14, gs - 0.3, gs + 0.55);
  for (const [y0, y1] of FLOORS) for (const c of [3.0, 6.3]) window(s, sf, c - 0.6, c + 0.6, g + y0, g + y1, 0.1);
  cream(st, 2);
  fbox(st, sf, -S - 0.1, S + 0.1, 0, 0.3, g + CORNICE - 0.4, g + CORNICE - 0.15);
  fbox(st, sf, -S - 0.1, S + 0.1, 0, 0.45, g + CORNICE - 0.15, g + CORNICE + 0.05);

  // ── slate mansard over the whole house (outline → ring inset 2.8 m, 4 m up), three gabled dormers ──
  const slate = s.buf('masonry');
  slate.color = rgb('#3d4248');
  const lo: V3[] = [];
  for (let i = 0; i < rec.outer.length; i += 2) lo.push([rec.outer[i]!, g + CORNICE, rec.outer[i + 1]!]);
  const hi = inset(rec.outer, 2.8).map(([x, , z]): V3 => [x, g + CORNICE + 4, z]);
  loft(slate, [lo, hi], 2);
  cap(slate, hi, UP);
  for (const c of [-1.6, 1.6]) dormer(s, f, c, g + CORNICE + 0.05);
  dormer(s, sf, -4.6, g + CORNICE + 0.05);

  const out = withExtras(base, s);
  return image ? { ...out, textures: [...(out.textures ?? []), { material: 'mural', image }] } : out;
};

export const details: Partial<Record<LandmarkId, DetailFn>> = { 'garderobe-manneken-pis': garderobe };
