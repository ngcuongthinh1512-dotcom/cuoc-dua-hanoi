// Albedo fix for a Meshy avatar (scripts/ceti-avatar.ts): the generated texture is too dark (trousers black, collar brown-black,
// cuffs near-black) next to the source photo. Regions come from the MESH, not from colour alone (hair / shoes / eyes are dark
// too): every UV texel gets the normalised height (0 feet … 1 crown) of its triangle, then dark texels in a height band are
// moved to a target hue / saturation and brightened keeping their own fold detail (value / class mean value).
import sharp from 'sharp';

type Cls = { name: string; band: readonly [number, number]; pick: (h: number, s: number, v: number) => boolean; hue: number; sat: number; v: number };
/** Heights are fractions of the body (hips ≈ 0.54, collar ≈ 0.84, crown 1). Targets sampled from the reference render. */
export const CLASSES: readonly Cls[] = [
  { name: 'trousers', band: [0.035, 0.56], pick: (_h, s, v) => v < 0.45 && s < 0.9, hue: 32, sat: 0.32, v: 0.2 },
  { name: 'shirt', band: [0.48, 0.86], pick: (_h, s, v) => s < 0.12 && v > 0.6, hue: 200, sat: 0.04, v: 0.68 }, // melange grey (it renders near white)
  { name: 'cuffs', band: [0.6, 0.86], pick: (h, s, v) => h >= 80 && h <= 190 && s > 0.2 && v < 0.5, hue: 155, sat: 0.7, v: 0.2 },
  { name: 'collar', band: [0.8, 0.9], pick: (h, s, v) => (h <= 25 || h >= 320) && s > 0.12 && v < 0.45, hue: 348, sat: 0.62, v: 0.28 },
];
const HAIR = { band: [0.925, 1] as const, lift: 1.45, max: 0.2 }; // black slab → a little value so the locks read

const hsv = (r: number, g: number, b: number) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx === 0 ? 0 : d / mx, mx] as const;
};
const rgb = (h: number, s: number, v: number) => {
  const f = (n: number) => v - v * s * Math.max(0, Math.min(1, Math.min((n + h / 60) % 6, 4 - ((n + h / 60) % 6))));
  return [f(5), f(3), f(1)] as const;
};

/** `pos` / `uv` / `idx`: the mesh's POSITION (y up), TEXCOORD_0 and triangle indices. Returns the fixed image (PNG) + per-class texel counts. */
export async function recolor(image: Buffer, pos: ArrayLike<number>, uv: ArrayLike<number>, idx: ArrayLike<number>) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [W, H] = [info.width, info.height];
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 1; i < pos.length; i += 3) [lo, hi] = [Math.min(lo, pos[i]!), Math.max(hi, pos[i]!)];
  const hmap = new Float32Array(W * H).fill(-1); // normalised height per texel
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const P = [a, b, c].map((v) => [uv[v * 2]! * W, uv[v * 2 + 1]! * H, (pos[v * 3 + 1]! - lo) / (hi - lo)] as const);
    const [x0, x1] = [Math.max(0, Math.floor(Math.min(...P.map((p) => p[0])))), Math.min(W - 1, Math.ceil(Math.max(...P.map((p) => p[0]))))];
    const [y0, y1] = [Math.max(0, Math.floor(Math.min(...P.map((p) => p[1])))), Math.min(H - 1, Math.ceil(Math.max(...P.map((p) => p[1]))))];
    const den = (P[1]![1] - P[2]![1]) * (P[0]![0] - P[2]![0]) + (P[2]![0] - P[1]![0]) * (P[0]![1] - P[2]![1]);
    if (!den) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l0 = ((P[1]![1] - P[2]![1]) * (x + 0.5 - P[2]![0]) + (P[2]![0] - P[1]![0]) * (y + 0.5 - P[2]![1])) / den;
      const l1 = ((P[2]![1] - P[0]![1]) * (x + 0.5 - P[2]![0]) + (P[0]![0] - P[2]![0]) * (y + 0.5 - P[2]![1])) / den;
      const l2 = 1 - l0 - l1;
      if (l0 >= -0.02 && l1 >= -0.02 && l2 >= -0.02) hmap[y * W + x] = l0 * P[0]![2] + l1 * P[1]![2] + l2 * P[2]![2];
    }
  }
  const px = (i: number) => hsv(data[i * 4]! / 255, data[i * 4 + 1]! / 255, data[i * 4 + 2]! / 255);
  const counts: Record<string, number> = {};
  for (const c of CLASSES) {
    const hit: number[] = [];
    for (let i = 0; i < W * H; i++) {
      const hh = hmap[i]!;
      if (hh < c.band[0] || hh > c.band[1]) continue;
      const [h, s, v] = px(i);
      if (c.pick(h, s, v)) hit.push(i);
    }
    const mean = hit.reduce((a, i) => a + px(i)[2], 0) / (hit.length || 1);
    for (const i of hit) {
      const [r, g, b] = rgb(c.hue, c.sat, Math.min(0.9, (px(i)[2] / mean) * c.v));
      data.set([r * 255, g * 255, b * 255].map(Math.round), i * 4);
    }
    counts[c.name] = hit.length;
  }
  let hair = 0;
  for (let i = 0; i < W * H; i++) {
    if (hmap[i]! < HAIR.band[0]) continue;
    const [h, s, v] = px(i);
    if (v < 0.15 && s < 0.6) {
      const [r, g, b] = rgb(h, s, Math.min(HAIR.max, v * HAIR.lift));
      data.set([r * 255, g * 255, b * 255].map(Math.round), i * 4);
      hair++;
    }
  }
  counts.hair = hair;
  return { png: await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), counts };
}
