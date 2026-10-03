import { describe, expect, it } from 'vitest';
import { graphics8c } from '../config.ts';
import { FpsWatch, graphics, pickQuality } from './graphics.ts';

describe('pickQuality (Phase 8C)', () => {
  it('URL > stored > GPU', () => {
    expect(pickQuality('high', 'low', 'SwiftShader')).toBe('high');
    expect(pickQuality(null, 'high', 'ANGLE (Intel, Intel(R) UHD Graphics 620)')).toBe('high');
    expect(pickQuality('bogus', null, 'ANGLE (Intel, Intel(R) UHD Graphics 620)')).toBe('low');
  });
  it('weak GPUs → low, discrete / Apple → high', () => {
    for (const g of ['Google SwiftShader', 'llvmpipe (LLVM 15)', 'Mali-G78', 'Intel Iris Xe']) expect(pickQuality(null, null, g)).toBe('low');
    for (const g of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', 'ANGLE (Apple, Apple M2, OpenGL 4.1)', 'AMD Radeon RX 6600', 'Intel(R) Arc(TM) A770', '']) expect(pickQuality(null, null, g)).toBe('high');
  });
});

describe('FpsWatch (runtime downgrade)', () => {
  const cfg = { fps: 24, seconds: 8, graceSeconds: 5 };
  const run = (w: FpsWatch, fps: number, s: number) => {
    let fired = 0;
    for (let t = 0; t < s; t += 1 / fps) fired += +w.frame(1 / fps);
    return fired;
  };
  it('fires once after grace + a whole slow window, never at a good rate', () => {
    const slow = new FpsWatch(cfg);
    expect(run(slow, 15, 12)).toBe(0); // 5 s grace + 7 s: the window is not over
    expect(run(slow, 15, 2)).toBe(1);
    expect(run(slow, 15, 30)).toBe(0); // once
    expect(run(new FpsWatch(cfg), 30, 60)).toBe(0);
    expect(run(new FpsWatch(cfg), 1, 20)).toBe(1); // SwiftShader-slow frames still count
  });
  it('a long frame (hidden tab) restarts the window; a good window resets the count', () => {
    const w = new FpsWatch(cfg);
    expect(run(w, 30, 13)).toBe(0); // grace + one good window
    expect(run(w, 10, 6)).toBe(0);
    w.frame(30); // back from a hidden tab
    expect(run(w, 10, 7)).toBe(0);
    expect(run(w, 10, 1.5)).toBe(1);
    expect(graphics8c.quality.autoDowngrade.fps).toBeGreaterThan(0);
  });
});

describe('graphics()', () => {
  it('Node: high, items off until their track enables them', () => {
    const g = graphics();
    expect(g.quality).toBe('high');
    for (const k of Object.keys(graphics8c).filter((k) => k !== 'quality') as Parameters<typeof g.on>[0][]) expect(g.on(k)).toBe(graphics8c[k].enabled);
  });
});
