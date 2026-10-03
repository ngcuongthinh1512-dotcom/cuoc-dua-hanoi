// Fix A (phase8c-review-speccode #1 / #4, review-visual #3): scan textures keep only what the kept triangles sample;
// loose scan bits dropped; the Flamme's steps are closed drums.
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { dropSmallParts, steps } from './flamme.ts';
import { keepUsed, type Soup } from './props.ts';

const red = async (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
const soup = (uv: number[], image?: Buffer): Soup => ({ mat: { color: [1, 1, 1, 1], image, metal: 0, rough: 1, blend: false }, pos: uv.flatMap((_, i) => (i % 2 ? [] : [i, 0, 0])), nrm: uv.flatMap((_, i) => (i % 2 ? [] : [0, 1, 0])), uv });

test('keepUsed: image cut to the used uv box, unused pixels grey, uv remapped', async () => {
  // one triangle in the top-left quarter of a 64² red image
  const [s] = await keepUsed([soup([0, 0, 0.5, 0, 0, 0.5], await red(64, 64))], 64, 1);
  const { data, info } = await sharp(s!.mat.image!).raw().toBuffer({ resolveWithObject: true });
  expect(info.width).toBeLessThanOrEqual(34);
  expect(info.height).toBeLessThanOrEqual(34);
  const px = (x: number, y: number) => [...data.subarray(3 * (y * info.width + x), 3 * (y * info.width + x) + 3)];
  expect(px(1, 1)).toEqual([255, 0, 0]); // inside the triangle
  expect(px(info.width - 1, info.height - 1)).toEqual([128, 128, 128]); // beyond its hypotenuse
  expect(s!.uv[2]! * info.width).toBeCloseTo(32, 0); // u 0.5 of the source = pixel 32
  await expect(keepUsed([soup([0, 0, 2, 0, 0, 1], await red(8, 8))], 8)).rejects.toThrow(/tiled/);
});

test('dropSmallParts keeps the connected parts with enough triangles', () => {
  const tri = (o: number) => [o, 0, 0, o + 1, 0, 0, o, 1, 0];
  const big = [...tri(0), 1, 0, 0, 1, 1, 0, 0, 1, 0]; // two triangles sharing an edge
  const s: Soup = { mat: { color: [1, 1, 1, 1], metal: 0, rough: 1, blend: false }, pos: [...big, ...tri(10)], nrm: Array(27).fill(0), uv: Array(18).fill(0) };
  const [out] = dropSmallParts([s], 2);
  expect(out!.pos).toEqual(big);
});

test('steps: one drum per tier, normals out / up, tops at their height', () => {
  const s = steps([[2, 0.3], [1, 0.6]], -0.3, [0.5, 0.5, 0.5]);
  expect(s.pos.length / 9).toBe(2 * 48 * 3);
  const ys = s.pos.filter((_, i) => i % 3 === 1);
  expect(Math.max(...ys)).toBeCloseTo(0.6);
  for (let i = 0; i < s.pos.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((k) => s.pos.slice(i + k, i + k + 3));
    const [e1, e2] = [b!.map((v, k) => v - a![k]!), c!.map((v, k) => v - a![k]!)];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const centre = [0, 1, 2].map((k) => (a![k]! + b![k]! + c![k]!) / 3);
    expect(n[0]! * centre[0]! + n[1]! + n[2]! * centre[2]!).toBeGreaterThan(0); // facing out (sides) or up (tops)
  }
});
