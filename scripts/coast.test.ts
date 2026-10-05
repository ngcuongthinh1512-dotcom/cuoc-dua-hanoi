import { describe, expect, it } from 'vitest';
import { seaPolygons } from './coast.ts';

const rect = { minX: 0, maxX: 100, minZ: -100, maxZ: 0 };
const area = (f: number[]) => Math.abs(f.reduce((s, _, i) => (i % 2 ? s : s + f[i]! * f[(i + 3) % f.length]! - f[(i + 2) % f.length]! * f[i + 1]!), 0)) / 2;
const net = (p: { outer: number[]; holes: number[][] }) => area(p.outer) - p.holes.reduce((s, h) => s + area(h), 0);

describe('seaPolygons (land on the left of travel, world z = −north)', () => {
  // coast x = 40 running north (z falls), land west, sea east
  const coast = [40, 50, 40, -150];
  it('closes a coast that crosses the rect along the border', () => {
    const r = seaPolygons([coast], rect);
    expect(r).toHaveLength(1);
    expect(net(r[0]!)).toBeCloseTo(60 * 100);
  });
  it('chains a coast split into several ways', () => {
    expect(net(seaPolygons([[40, 50, 40, -30], [40, -30, 40, -90], [40, -90, 40, -150]], rect)[0]!)).toBeCloseTo(6000);
  });
  it('keeps a CCW island as a hole', () => {
    const island = [60, -40, 70, -40, 70, -50, 60, -50, 60, -40];
    const r = seaPolygons([coast, island], rect);
    expect(r[0]!.holes).toHaveLength(1);
    expect(net(r[0]!)).toBeCloseTo(6000 - 100);
  });
  it('a coast running south (reversed) makes the west the sea', () => {
    expect(net(seaPolygons([[40, -150, 40, 50]], rect)[0]!)).toBeCloseTo(40 * 100);
  });
});
