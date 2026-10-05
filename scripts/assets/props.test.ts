// Fix A (phase8c-review-speccode #1 / #4, review-visual #3): scan textures keep only what the kept triangles sample;
// loose scan bits dropped.
import sharp from 'sharp';
import { expect, test } from 'vitest';
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
