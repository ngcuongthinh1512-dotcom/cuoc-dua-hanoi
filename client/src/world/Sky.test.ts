import { DataUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { graphics8c } from '../config.ts';
import { graphics } from './graphics.ts';
import { acesFilmic, fillBelowHorizon, hdriStats, type RGB } from './Sky.ts';

/** w × h RGBA equirect (row 0 = zenith): sky blue above, grey below, one bright pixel ("sun"). */
function image(w: number, h: number, sun: [number, number]) {
  const px = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.set(j < h / 2 ? [0.4, 0.5, 0.7, 1] : [0.2, 0.2, 0.2, 1], 4 * (j * w + i));
  px.set([50, 48, 45, 1], 4 * (sun[1] * w + sun[0]));
  return px;
}

describe('hdriStats (8C T1)', () => {
  it("sun azimuth from the brightest pixel (three's equirect u ↔ atan2(z, x)), horizon band mean", () => {
    const [w, h] = [64, 32];
    const px = image(w, h, [48, 6]); // u = 48.5 / 64 → φ = (u − 0.5)·2π
    const s = hdriStats((k) => px[k]!, w, h, 12);
    expect(s.sunAzimuth).toBeCloseTo((48.5 / 64 - 0.5) * 2 * Math.PI, 6);
    expect(s.horizon.map((v) => +v.toFixed(3))).toEqual([0.4, 0.5, 0.7]); // only rows above the horizon, sun not in the band
  });
});

describe('fillBelowHorizon (8C T1)', () => {
  it('lower hemisphere = horizon colour, the band above fades into it, the zenith untouched', () => {
    const [w, h] = [8, 36];
    const data = new Uint16Array(w * h * 4).map((_, k) => DataUtils.toHalfFloat(k % 4 === 3 ? 1 : 2));
    const horizon: RGB = [0.5, 0.25, 1];
    fillBelowHorizon(data, w, h, 20, horizon); // band = 4 rows (14…17)
    const at = (j: number, c: number) => DataUtils.fromHalfFloat(data[4 * j * w + c]!);
    expect(at(0, 0)).toBe(2);
    expect([0, 1, 2].map((c) => at(h - 1, c))).toEqual(horizon);
    expect([0, 1, 2].map((c) => at(h / 2, c))).toEqual(horizon);
    expect(at(14, 0)).toBe(2); // top of the band
    expect(at(16, 0)).toBeLessThan(2);
    expect(at(16, 0)).toBeGreaterThan(0.5);
    expect(at(h - 1, 3)).toBe(1); // alpha kept
  });
});

describe('acesFilmic (8C T1)', () => {
  it("matches three's ACESFilmicToneMapping: black stays black, monotonic, saturates at 1", () => {
    expect(acesFilmic([0, 0, 0], 1).every((v) => Math.abs(v) < 1e-3)).toBe(true);
    const grey = [0.1, 0.4, 1, 4].map((v) => acesFilmic([v, v, v], 1)[1]);
    for (let i = 1; i < grey.length; i++) expect(grey[i]!).toBeGreaterThan(grey[i - 1]!);
    expect(acesFilmic([100, 100, 100], 1)).toEqual([1, 1, 1]);
    expect(acesFilmic([0.18, 0.18, 0.18], 1)[0]).toBeCloseTo(0.2, 1); // mid grey ≈ 0.2 linear out (ACES fit)
  });
});

describe('T1 config', () => {
  it('sky, water, post on; post off on low quality (lowOff); sun 35–45° high', () => {
    expect(graphics().on('sky') && graphics().on('water') && graphics().on('post')).toBe(true);
    expect(graphics8c.post.lowOff).toBe(true);
    expect(graphics8c.sky.lowOff || graphics8c.water.lowOff).toBe(false);
    const { x, y, z } = graphics8c.sky.sunPosition;
    const elev = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
    expect(elev).toBeGreaterThanOrEqual(35);
    expect(elev).toBeLessThanOrEqual(45);
  });
});
