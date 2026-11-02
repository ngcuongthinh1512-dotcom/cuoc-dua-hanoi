import { describe, expect, it } from 'vitest';
import { STORE } from '@race/shared/cetiqlo';
import { rampYAt, stairRamp } from './cetiqloRoom.ts';

describe('stairRamp: the ramp collider lies on the step nosings', () => {
  const st = STORE.stair;
  it('passes through every nosing (step i front edge at (i + 1) × rise) and meets floor 2 at the last one', () => {
    for (let i = 0; i < st.steps; i++) expect(rampYAt(st.zBottom - i * st.tread)).toBeCloseTo((i + 1) * st.rise, 6);
    expect(rampYAt(st.zBottom - (st.steps - 1) * st.tread)).toBeCloseTo(STORE.floor2Y, 6);
    expect(rampYAt(st.zBottom + st.tread)).toBe(0); // starts at floor level one tread before the first riser
  });
  it('the slab: centred on the line, 28° (under player.maxSlopeDeg 45), spanning the stair width', () => {
    const r = stairRamp();
    expect(r.tilt * 180 / Math.PI).toBeCloseTo(28.07, 1);
    expect(r.x).toBe((st.x0 + st.x1) / 2);
    expect(r.hx).toBe((st.x1 - st.x0) / 2);
    // the slab's centre sits on the nosing line (top face ≈ 1 cm above it)
    expect(r.y + (r.hy) / Math.cos(r.tilt) - 0.01).toBeCloseTo(rampYAt(r.z), 6);
  });
});
