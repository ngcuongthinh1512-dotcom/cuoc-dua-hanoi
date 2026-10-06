import type { TeamInfo } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { spectate as C } from '../config.ts';
import { followPose, nextSlot, smoothPose, watchable } from './watch.ts';

const team = (slot: number, online = true, racing?: boolean): TeamInfo => ({ slot, id: `t${slot}`, name: `Đội ${slot}`, colour: '#fff', online, ...(racing === undefined ? {} : { racing }) });

describe('watch camera (SPEC §17.40)', () => {
  it('stands C.back m behind the body along its heading, C.up above the feet, looking slightly down at the head', () => {
    const north = followPose({ x: 10, y: 2, z: -5, yaw: 0 }); // facing north (−Z): the camera is south (+Z)
    expect([north.x, north.y, north.z]).toEqual([10, 2 + C.up, -5 + C.back]);
    expect(north.yaw).toBe(0);
    expect(north.pitch).toBeLessThan(0);
    const west = followPose({ x: 0, y: 0, z: 0, yaw: Math.PI / 2 }); // facing west (−X): the camera is east (+X)
    expect(west.x).toBeCloseTo(C.back);
    expect(west.z).toBeCloseTo(0);
  });

  it('smooths toward the goal, turns the short way, snaps a far jump', () => {
    const cur = { x: 0, y: 0, z: 0, yaw: 3, pitch: 0 };
    const goal = { x: 4, y: 0, z: 0, yaw: -3, pitch: -0.2 };
    const s = smoothPose(cur, goal, 1 / 60);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(4);
    expect(s.yaw).toBeGreaterThan(3); // 3 → −3 is a short step across ±π, not back through 0
    let p = cur;
    for (let i = 0; i < 600; i++) p = smoothPose(p, goal, 1 / 60);
    expect(p.x).toBeCloseTo(4, 3);
    expect(smoothPose(cur, { ...goal, x: C.snapDistance + 1 }, 1 / 60)).toEqual({ ...goal, x: C.snapDistance + 1 });
  });

  it('lists only online, racing teams by slot; [ / ] wrap; nothing in an empty list', () => {
    const list = watchable([team(3), team(1, false), team(2, true, false), team(0, true, true)]);
    expect(list.map((t) => t.slot)).toEqual([0, 3]);
    expect(nextSlot(list, 0, 1)).toBe(3);
    expect(nextSlot(list, 3, 1)).toBe(0);
    expect(nextSlot(list, 0, -1)).toBe(3);
    expect(nextSlot(list, null, 1)).toBe(0);
    expect(nextSlot(list, null, -1)).toBe(3);
    expect(nextSlot(list, 7, 1)).toBe(0); // the followed team left the list
    expect(nextSlot([], 0, 1)).toBeNull();
  });
});
