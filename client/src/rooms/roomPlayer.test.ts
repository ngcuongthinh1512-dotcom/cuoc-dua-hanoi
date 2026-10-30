import { describe, expect, it } from 'vitest';
import { frameMode, nearestButton, shellBoxes, slotBox, wantsWalk } from './roomPlayer.ts';

describe('roomPlayer pure parts', () => {
  it('frameMode: the overlay freezes input + physics (edge on open / close), free-fly only stops them', () => {
    expect(frameMode(false, false, false)).toEqual({ live: true, step: true, edge: null });
    expect(frameMode(true, false, false)).toEqual({ live: false, step: false, edge: 'freeze' });
    expect(frameMode(true, false, true)).toEqual({ live: false, step: false, edge: null });
    expect(frameMode(false, false, true)).toEqual({ live: true, step: true, edge: 'thaw' });
    expect(frameMode(false, true, false)).toEqual({ live: false, step: false, edge: null });
    expect(frameMode(true, true, false).edge).toBe('freeze'); // the overlay over the free camera still releases the keys
  });
  it('slotBox turns a local box with the slot (gallery desk 7: right wall, yaw −π/2, local +z → world −x)', () => {
    const b = slotBox({ x: 6.55, y: 0, z: 6.8, yaw: -Math.PI / 2 }, { x: 0, y: 0.5, z: 1, hx: 0.8, hy: 0.5, hz: 0.4 });
    expect(b.x).toBeCloseTo(5.55);
    expect(b.z).toBeCloseTo(6.8);
    expect(b.y).toBe(0.5);
    expect(b.yaw).toBe(-Math.PI / 2);
  });
  it('shellBoxes: a floor under y 0 and four walls outside the room', () => {
    const [floor, ...walls] = shellBoxes(-8, 8, -15, 15);
    expect(floor!.y + floor!.hy).toBeCloseTo(0);
    expect(walls.length).toBe(4);
    for (const w of walls) expect(Math.abs(w.x) - w.hx >= 8 - 1e-9 || Math.abs(w.z) - w.hz >= 15 - 1e-9).toBe(true);
  });
  it('wantsWalk: default on, off for fly=1 / view= / cam=', () => {
    expect(wantsWalk(new URLSearchParams('team=7'))).toBe(true);
    expect(wantsWalk(new URLSearchParams('fly=1'))).toBe(false);
    expect(wantsWalk(new URLSearchParams('view=plan'))).toBe(false);
    expect(wantsWalk(new URLSearchParams('cam=0,1,2,3,4'))).toBe(false);
  });
  it('nearestButton: the closest within reach, active or not', () => {
    const bs = [{ slot: 1, x: 0, y: 1, z: 0, active: false }, { slot: 2, x: 1, y: 1, z: 0, active: true }];
    expect(nearestButton(0.8, 0, bs, 1.8)?.slot).toBe(2);
    expect(nearestButton(0.1, 0, bs, 1.8)?.slot).toBe(1);
    expect(nearestButton(5, 5, bs, 1.8)).toBeNull();
  });
});
