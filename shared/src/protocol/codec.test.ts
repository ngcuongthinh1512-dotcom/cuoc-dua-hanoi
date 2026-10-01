import { describe, expect, it } from 'vitest';
import { decodePose, decodeTick, encodePose, encodeTick, isClientMessage, parseFrame, POSE_LEN, samePose } from './codec.ts';
import { NET } from './constants.ts';
import { MOVE_MODES, PLAYER_ACTIONS, type PoseSample, TAG } from './types.ts';

const pose: PoseSample = { x: 123.456, y: 1.234, z: -910.117, yaw: 2.5, mode: 'bike', action: 'none' };

describe('pose codec', () => {
  it('round-trips within 1 cm / 1 mrad and stays small', () => {
    const a = encodePose(pose);
    expect(a).toHaveLength(POSE_LEN);
    expect(a[0]).toBe(TAG.pos);
    expect(a.every(Number.isInteger)).toBe(true);
    const p = decodePose(a)!;
    expect(Math.abs(p.x - pose.x)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(p.y - pose.y)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(p.z - pose.z)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(p.yaw - pose.yaw)).toBeLessThanOrEqual(0.0005);
    expect([p.mode, p.action]).toEqual(['bike', 'none']);
    expect(JSON.stringify(a).length).toBeLessThan(40);
  });

  it('wraps the heading and encodes a still body to the same array', () => {
    expect(decodePose(encodePose({ ...pose, yaw: 2.5 + 2 * Math.PI }))!.yaw).toBeCloseTo(2.5, 3);
    expect(samePose(encodePose(pose), encodePose({ ...pose, x: pose.x + 0.004 }))).toBe(true); // < 1 cm: no send
    expect(samePose(encodePose(pose), encodePose({ ...pose, x: pose.x + 0.02 }))).toBe(false);
  });

  it('covers every mode and action', () => {
    for (const mode of MOVE_MODES) for (const action of PLAYER_ACTIONS) expect(decodePose(encodePose({ ...pose, mode, action }))).toMatchObject({ mode, action });
  });

  it('rejects malformed poses', () => {
    const ok = encodePose(pose);
    expect(decodePose(ok.slice(0, 6))).toBeNull(); // short
    expect(decodePose([...ok, 1])).toBeNull(); // long
    expect(decodePose([TAG.tick, ...ok.slice(1)])).toBeNull(); // wrong tag
    expect(decodePose([TAG.pos, 1.5, 0, 0, 0, 0, 0])).toBeNull(); // not an integer
    expect(decodePose([TAG.pos, 2_000_000, 0, 0, 0, 0, 0])).toBeNull(); // 20 km away
    expect(decodePose([TAG.pos, 0, -20_000, 0, 0, 0, 0])).toBeNull(); // 200 m under the Seine
    expect(decodePose([TAG.pos, 0, 0, 0, 0, MOVE_MODES.length, 0])).toBeNull();
    expect(decodePose([TAG.pos, 0, 0, 0, 0, 0, -1])).toBeNull();
    expect(decodePose([TAG.pos, 0, 0, 0, 0, 0, 'none'])).toBeNull();
    expect(decodePose([TAG.pos, 0, 0, 0, Infinity, 0, 0])).toBeNull();
    expect(decodePose({ t: 'pos' })).toBeNull();
    expect(decodePose(null)).toBeNull();
  });
});

describe('tick codec', () => {
  const entries = Array.from({ length: 20 }, (_, slot) => ({ slot, pose: { ...pose, x: pose.x + slot * 10, action: PLAYER_ACTIONS[slot % PLAYER_ACTIONS.length]! } }));

  it('round-trips 20 players in one small array', () => {
    const a = encodeTick(1_727_779_200_123.4, entries);
    const t = decodeTick(a)!;
    expect(t.serverMs).toBe(1_727_779_200_123);
    expect(t.entries).toHaveLength(20);
    t.entries.forEach((e, i) => {
      expect(e.slot).toBe(i);
      expect(e.pose.x).toBeCloseTo(entries[i]!.pose.x, 2);
      expect(e.pose.action).toBe(entries[i]!.pose.action);
    });
    expect(JSON.stringify(a).length).toBeLessThan(700); // measured 627 B (docs/plans/phase6.md §2)
    expect(decodeTick(encodeTick(5, []))).toEqual({ serverMs: 5, entries: [] });
  });

  it('rejects malformed ticks', () => {
    const a = encodeTick(1000, entries.slice(0, 2));
    expect(decodeTick(a.slice(0, -1))).toBeNull(); // stride broken
    expect(decodeTick([TAG.pos, ...a.slice(1)])).toBeNull();
    expect(decodeTick([TAG.tick, -1])).toBeNull();
    expect(decodeTick([TAG.tick, 1000, 20_000, ...a.slice(3, 9)])).toBeNull(); // slot out of range
    expect(decodeTick([TAG.tick, 1000, 0, 1.5, 0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('frames and JSON messages', () => {
  it('parses within the size limit only', () => {
    expect(parseFrame('[1,2]', NET.maxPlayerBytes)).toEqual([1, 2]);
    expect(parseFrame('x'.repeat(NET.maxPlayerBytes + 1), NET.maxPlayerBytes)).toBeNull();
    expect(parseFrame('{bad', NET.maxPlayerBytes)).toBeNull();
    expect(parseFrame(new ArrayBuffer(4), NET.maxPlayerBytes)).toBeNull();
  });

  it('accepts the player ops and refuses Host ops from a team', () => {
    expect(isClientMessage({ t: 'respawn', x: 1, y: 2, z: 3, yaw: 0, how: 'stairs' }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'respawn', x: 1, y: 2, z: 3, yaw: 0, how: 'teleport' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'respawn', x: 1, y: 2, z: 3, how: 'safe' }, 'team')).toBe(false); // yaw missing
    // metre bounds = the pose codec's: anything accepted encodes to a pose decodePose / decodeTick take back
    for (const [x, y] of [[9_999.999, -100], [-10_000, 1_000]] as const) {
      expect(isClientMessage({ t: 'respawn', x, y, z: 0, yaw: 7, how: 'safe' }, 'team')).toBe(true);
      expect(decodePose(encodePose({ x, y, z: 0, yaw: 7, mode: 'walk', action: 'none' }))).not.toBeNull();
    }
    for (const [x, y] of [[10_000.01, 0], [500_000, 0], [0, 5_000], [0, -101]] as const) {
      expect(isClientMessage({ t: 'respawn', x, y, z: 0, yaw: 0, how: 'safe' }, 'team')).toBe(false);
    }
    expect(isClientMessage({ t: 'gesture', g: 'bell' }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'gesture', g: 'dance' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'bike', op: 'claim', id: 'b1' }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'bike', op: 'dismount', id: 'b1' }, 'team')).toBe(false); // needs the resting pose
    expect(isClientMessage({ t: 'bike', op: 'dismount', id: 'b1', x: 1, y: 0, z: 2, yaw: 1 }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'bike', op: 'steal', id: 'b1' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.spawning', paused: true }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.spawning', paused: true }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.createTeams', teams: [{ name: 'Đội Xanh', colour: '#2c6bd8' }] }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.createTeams', teams: [{ name: '', colour: '#2c6bd8' }] }, 'host')).toBe(false);
    expect(isClientMessage({ t: 'host.candidates', segments: [[1, 2, 3, 4], []], decoys: [5, 6] }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.candidates', segments: [[1, 2, 3]], decoys: [] }, 'host')).toBe(false);
    expect(isClientMessage([1, 2, 3], 'team')).toBe(false);
    expect(isClientMessage('respawn', 'team')).toBe(false);
    expect(isClientMessage({ t: 'welcome' }, 'team')).toBe(false);
  });
});
