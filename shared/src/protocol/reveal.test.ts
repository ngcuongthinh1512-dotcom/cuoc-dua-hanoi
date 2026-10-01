import { describe, expect, it } from 'vitest';
import { boxVisible, DEFAULT_BOX_REVEAL } from './reveal.ts';

describe('boxVisible (SPEC §17.10)', () => {
  it('reveals inside the radius, hides only beyond radius + hysteresis', () => {
    const r = { radius: 150, hysteresis: 20 };
    expect(boxVisible(false, 151, r)).toBe(false);
    expect(boxVisible(false, 150, r)).toBe(true);
    expect(boxVisible(true, 165, r)).toBe(true); // in the band: stays
    expect(boxVisible(false, 165, r)).toBe(false); // in the band: not yet
    expect(boxVisible(true, 171, r)).toBe(false);
    expect(DEFAULT_BOX_REVEAL).toEqual({ radius: 150, hysteresis: 20 });
  });

  it('a team pacing across the boundary toggles once per full crossing, not per step', () => {
    let visible = false;
    const changes: boolean[] = [];
    for (const d of [200, 160, 149, 160, 165, 169, 171, 160, 149, 100]) {
      const next = boxVisible(visible, d);
      if (next !== visible) changes.push(next);
      visible = next;
    }
    expect(changes).toEqual([true, false, true]);
  });
});
