import { describe, expect, it } from 'vitest';
import { parseOverrides } from './Player.ts';

describe('parseOverrides (URL test hooks)', () => {
  it('reads spawn, camera mode, orbit, action, autoMove, jump', () => {
    const o = parseOverrides(new URLSearchParams('player=10,-20,90&camMode=far&orbit=180&action=wave&autoMove=slow&jump'));
    expect(o).toEqual({ spawn: { x: 10, z: -20, yawDeg: 90 }, camMode: 'far', orbitDeg: 180, action: 'wave', autoMove: 'slow', holdJump: true });
  });
  it('ignores invalid values (bare ?player = default spawn)', () => {
    const o = parseOverrides(new URLSearchParams('player&camMode=top&action=fly&orbit=x&autoMove=run'));
    expect(o).toEqual({ camMode: undefined, action: undefined, autoMove: undefined });
  });
  it('Phase 4: ?bike starts mounted, autoTurn=left|right holds A / D', () => {
    expect(parseOverrides(new URLSearchParams('bike&autoTurn=left'))).toMatchObject({ bike: true, autoTurn: 'left' });
    expect(parseOverrides(new URLSearchParams('autoTurn=up')).autoTurn).toBeUndefined();
  });
});
