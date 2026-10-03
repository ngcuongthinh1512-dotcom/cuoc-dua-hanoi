import { describe, expect, it } from 'vitest';
import { graphics8c } from '../config.ts';
import { graphics, pickQuality } from './graphics.ts';

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

describe('graphics()', () => {
  it('Node: high, items off until their track enables them', () => {
    const g = graphics();
    expect(g.quality).toBe('high');
    for (const k of Object.keys(graphics8c).filter((k) => k !== 'quality') as Parameters<typeof g.on>[0][]) expect(g.on(k)).toBe(graphics8c[k].enabled);
  });
});
