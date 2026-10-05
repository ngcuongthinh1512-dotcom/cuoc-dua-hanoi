import { describe, expect, it } from 'vitest';
import { facadeNightGlsl, initTimeOfDay, pickTime } from './night.ts';

describe('pickTime (Leg 2 night)', () => {
  it('?time= only offline, else the config default', () => {
    expect(pickTime('day', false, 'night')).toBe('day');
    expect(pickTime('night', false, 'day')).toBe('night');
    expect(pickTime('day', true, 'night')).toBe('night'); // a real race ignores it
    expect(pickTime('noon', false, 'night')).toBe('night');
    expect(pickTime(null, false, 'day')).toBe('day');
  });
});

describe('facadeNightGlsl (lit windows / shop signs)', () => {
  it('null by day, glow code at night', () => {
    initTimeOfDay(new URLSearchParams('time=day'), false);
    expect(facadeNightGlsl(false, 0.5, 0.5)).toBeNull();
    initTimeOfDay(new URLSearchParams('time=night'), false);
    const w = facadeNightGlsl(false, 0.5, 0.5)!;
    expect(w.glow).toContain('vec2(2.0000, 2.0000)'); // raw uv = bays × floors
    expect(w.glow).toContain('totalEmissiveRadiance');
    expect(facadeNightGlsl(true, 0.25, 1)!.glow).toContain('fSign');
  });
});
