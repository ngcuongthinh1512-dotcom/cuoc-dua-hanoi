import { describe, expect, it } from 'vitest';
import { lighting as L } from '../config.ts';
import { facadeNightGlsl, glowOn, glowScale, initTimeOfDay, isNight, litShareAt, pickTime } from './night.ts';

describe('pickTime (Leg 2 night)', () => {
  it('?time= only offline, else the config default', () => {
    expect(pickTime('day', false, 'night')).toBe('day');
    expect(pickTime('night', false, 'day')).toBe('night');
    expect(pickTime('day', true, 'night')).toBe('night'); // a real race ignores it
    expect(pickTime('noon', false, 'night')).toBe('night');
    expect(pickTime(null, false, 'day')).toBe('day');
    expect(pickTime('dusk', false, 'day')).toBe('dusk'); // Leg 3 hoàng hôn
  });
});

describe('dusk (Leg 3 hoàng hôn)', () => {
  it('glows like night, with lighting.dusk shares: lit buildings vs the rest', () => {
    initTimeOfDay(new URLSearchParams('time=dusk'), false);
    expect(glowOn()).toBe(true);
    expect(isNight()).toBe(false);
    expect(glowScale()).toBeCloseTo(L.emissiveScale * L.dusk.emissiveScale);
    const w = facadeNightGlsl(false, 0.5, 0.5)!;
    expect(w.glow).toContain(`mix(${L.dusk.windows.otherShare.toFixed(4)}, ${L.dusk.windows.litShare.toFixed(4)}, step(0.001, vLit))`);
    initTimeOfDay(new URLSearchParams('time=day'), false);
    expect(glowOn()).toBe(false);
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

describe('lit window share by lighting.hour, TV flicker', () => {
  it('dusk = windows.litShare, small hours = × lateShare, clamped', () => {
    expect(litShareAt(0)).toBeCloseTo(L.windows.litShare);
    expect(litShareAt(1)).toBeCloseTo(L.windows.litShare * L.windows.lateShare);
    expect(litShareAt(2)).toBeCloseTo(litShareAt(1));
    expect(litShareAt(0.5)).toBeLessThan(litShareAt(0));
  });
  it('the facade glow reads the shared time uniform', () => {
    initTimeOfDay(new URLSearchParams('time=night'), false);
    const w = facadeNightGlsl(false, 0.5, 0.5)!;
    expect(w.uniforms.uNightTime).toBeDefined();
    expect(w.fragmentHead).toContain('uniform float uNightTime');
    expect(w.glow).toContain('fTv');
  });
});
