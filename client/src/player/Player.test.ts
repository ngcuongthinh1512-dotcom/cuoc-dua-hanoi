import { describe, expect, it } from 'vitest';
import { parseOverrides } from './Player.ts';

describe('parseOverrides (URL test hooks)', () => {
  it('reads spawn, camera mode, orbit, action, autoMove, jump', () => {
    const o = parseOverrides(new URLSearchParams('player=10,-20,90&camMode=far&orbit=180&action=wave&autoMove=sprint&jump'));
    expect(o).toEqual({ spawn: { x: 10, z: -20, yawDeg: 90 }, camMode: 'far', orbitDeg: 180, action: 'wave', autoMove: 'sprint', holdJump: true });
  });
  it('ignores invalid values (bare ?player = default spawn)', () => {
    const o = parseOverrides(new URLSearchParams('player&camMode=top&action=fly&orbit=x&autoMove=run'));
    expect(o).toEqual({ camMode: undefined, action: undefined, autoMove: undefined });
  });
  it('Phase 4: ?bike starts mounted, autoTurn=left|right holds A / D', () => {
    expect(parseOverrides(new URLSearchParams('bike&autoTurn=left'))).toMatchObject({ bike: true, autoTurn: 'left' });
    expect(parseOverrides(new URLSearchParams('autoTurn=up')).autoTurn).toBeUndefined();
  });
  it('Phase 4B: npc=0, npcSeed, npcDensity, npcZone=x,z,r[;…], npcTest=car:<kind>@x,z,yaw[;…]', () => {
    const o = parseOverrides(new URLSearchParams('npc=0&npcSeed=7&npcDensity=1.5&npcZone=10,-20,15;1,2,3&npcTest=car:van@3,-4,90;car:bus@0,0,0'));
    expect(o).toMatchObject({
      npc: false, npcSeed: 7, npcDensity: 1.5,
      npcZones: [{ x: 10, z: -20, r: 15 }, { x: 1, z: 2, r: 3 }],
      npcTest: [{ kind: 'van', x: 3, z: -4, yawDeg: 90 }, { kind: 'bus', x: 0, z: 0, yawDeg: 0 }],
    });
  });
  it('Phase 4B: invalid NPC fields ignored (npc=1 keeps them on)', () => {
    const o = parseOverrides(new URLSearchParams('npc=1&npcSeed=x&npcDensity=-1&npcZone=1,2;3,4,0;a,b,c&npcTest=car:tank@1,2,3;bus@1,2,3;car:van@1,2'));
    expect(['npc', 'npcSeed', 'npcDensity', 'npcZones', 'npcTest'].filter((k) => k in o)).toEqual([]);
    expect(parseOverrides(new URLSearchParams('npcDensity=0')).npcDensity).toBe(0);
  });
  it('Phase 6: online (in a race) drops every test hook, keeps the npc* fields', () => {
    const q = new URLSearchParams('player=10,-20,90&camMode=far&orbit=180&action=wave&autoMove=sprint&jump&bike&autoTurn=left&npc=0&npcSeed=3');
    expect(parseOverrides(q, true)).toEqual({ online: true, npc: false, npcSeed: 3 });
    expect(parseOverrides(q)).toMatchObject({ spawn: { x: 10, z: -20, yawDeg: 90 }, action: 'wave', autoMove: 'sprint', holdJump: true, bike: true, autoTurn: 'left' });
    expect(parseOverrides(q).online).toBeUndefined(); // offline: unchanged
  });
});
