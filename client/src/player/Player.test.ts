import { describe, expect, it } from 'vitest';
import { parseOverrides } from './Player.ts';

describe('parseOverrides (URL test hooks)', () => {
  it('reads spawn, camera mode, orbit, action, autoMove', () => {
    const o = parseOverrides(new URLSearchParams('player=10,-20,90&camMode=far&orbit=180&action=wave&autoMove=slow'));
    expect(o).toEqual({ spawn: { x: 10, z: -20, yawDeg: 90 }, camMode: 'far', orbitDeg: 180, action: 'wave', autoMove: 'slow' });
  });
  it('ignores invalid values (bare ?player = default spawn)', () => {
    const o = parseOverrides(new URLSearchParams('player&camMode=top&action=fly&orbit=x&autoMove=run'));
    expect(o).toEqual({ camMode: undefined, action: undefined, autoMove: undefined });
  });
});
