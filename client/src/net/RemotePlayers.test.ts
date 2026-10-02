import type { PoseSample } from '@race/shared/protocol';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bike, remote } from '../config.ts';
import type { PlayerState } from '../player/types.ts';
import { fakeTick, inView, underground, leanFor, newRemotePose, parsePeers, Track, updateState } from './RemotePlayers.ts';

const P = (x: number, z = 0, yaw = 0, extra: Partial<PoseSample> = {}): PoseSample => ({ x, y: 0, z, yaw, mode: 'walk', action: 'none', ...extra });

describe('Track (interpolation behind the server clock, SPEC §7)', () => {
  it('two samples 200 ms apart: halfway at the middle time, velocity from the pair', () => {
    const t = new Track();
    t.push(1000, P(0));
    t.push(1200, P(1));
    const o = newRemotePose();
    expect(t.sample(1100, o)).toBe(true);
    expect(o.x).toBeCloseTo(0.5);
    expect(o.vx).toBeCloseTo(5); // 1 m / 0.2 s
  });

  it('heading interpolates the short way across ±π', () => {
    const t = new Track();
    t.push(0, P(0, 0, Math.PI - 0.1));
    t.push(200, P(0, 0, -Math.PI + 0.1));
    const o = newRemotePose();
    t.sample(100, o);
    expect(Math.abs(o.yaw)).toBeCloseTo(Math.PI); // through π, not through 0
    expect(o.yawRate).toBeCloseTo(0.2 / 0.2); // +0.2 rad in 0.2 s (left)
  });

  it('past the newest sample: carried on for extrapolateMs, then held with velocity 0', () => {
    const t = new Track();
    t.push(0, P(0));
    t.push(200, P(1)); // 5 m/s
    const o = newRemotePose();
    t.sample(200 + remote.extrapolateMs / 2, o);
    expect(o.x).toBeCloseTo(1 + (5 * remote.extrapolateMs) / 2000);
    expect(o.vx).toBeCloseTo(5);
    t.sample(200 + remote.extrapolateMs + 500, o);
    expect(o.x).toBeCloseTo(1 + (5 * remote.extrapolateMs) / 1000); // stopped where the extrapolation ended
    expect(o.vx).toBe(0);
  });

  it('a jump beyond snapDistance (respawn) is not interpolated: the old samples go', () => {
    const t = new Track();
    t.push(0, P(0));
    t.push(200, P(1));
    t.push(400, P(51));
    expect(t.size).toBe(1);
    const o = newRemotePose();
    t.sample(300, o);
    expect(o.x).toBe(51);
    expect(o.vx).toBe(0);
  });

  it('late / duplicate samples are dropped; the buffer is bounded; before the first sample: hold it', () => {
    const t = new Track();
    t.push(200, P(1));
    t.push(200, P(2));
    t.push(100, P(3));
    expect(t.size).toBe(1);
    for (let i = 1; i <= 30; i++) t.push(200 + i * 200, P(1 + i * 0.1));
    expect(t.size).toBe(remote.bufferSamples);
    const o = newRemotePose();
    t.sample(0, o);
    expect(o.x).toBeCloseTo(1 + 21 * 0.1);
    expect(o.vx).toBe(0);
    expect(new Track().sample(0, o)).toBe(false);
  });

  it('mode / action come from the sample at or before the render time', () => {
    const t = new Track();
    t.push(0, P(0));
    t.push(200, P(0.5, 0, 0, { mode: 'bike', action: 'wave' }));
    const o = newRemotePose();
    t.sample(150, o);
    expect([o.mode, o.action]).toEqual(['walk', 'none']);
    t.sample(250, o);
    expect([o.mode, o.action]).toEqual(['bike', 'wave']);
  });
});

describe('remote PlayerState for the animator', () => {
  const state = (): PlayerState => ({ position: new Vector3(), velocity: new Vector3(), yaw: 0, grounded: true, inWater: false, moveMode: 'walk', jumps: 0, action: 'none', actionTime: 0 });

  it('a changed action restarts actionTime at 0 (gestures replay from their start); going airborne counts a jump', () => {
    const s = state();
    const p = newRemotePose();
    p.action = 'wave';
    updateState(s, p, 0.1);
    expect(s.actionTime).toBe(0);
    updateState(s, p, 0.1);
    expect(s.actionTime).toBeCloseTo(0.1);
    p.action = 'celebrate';
    updateState(s, p, 0.1);
    expect([s.action, s.actionTime]).toEqual(['celebrate', 0]);
    p.mode = 'air';
    updateState(s, p, 0.1);
    updateState(s, p, 0.1);
    expect(s.jumps).toBe(1);
    expect(s.grounded).toBe(false);
  });

  it('rider lean: right turn leans right, clamped to bike.leanMaxDeg', () => {
    expect(leanFor(5, -0.5)).toBeGreaterThan(0); // yaw − = turning right
    expect(leanFor(5, 0.5)).toBeLessThan(0);
    expect(leanFor(0, 1)).toBeCloseTo(0);
    expect(leanFor(20, 5)).toBeCloseTo((-bike.leanMaxDeg * Math.PI) / 180);
  });
});

describe('DEV ?peers stand-ins', () => {
  it('parses slot,x,z,yawDeg,mode[,action] groups, dropping invalid ones', () => {
    expect(parsePeers('0,10,-5,90,walk;1,0,0,0,bike;2,1,2,3,walk,wave;x,1,2,3,walk;3,1,2,3,fly')).toEqual([
      { slot: 0, x: 10, z: -5, yaw: expect.closeTo(Math.PI / 2), mode: 'walk', action: 'none' },
      { slot: 1, x: 0, z: 0, yaw: 0, mode: 'bike', action: 'none' },
      { slot: 2, x: 1, z: 2, yaw: expect.closeTo((3 * Math.PI) / 180), mode: 'walk', action: 'wave' },
    ]);
    expect(parsePeers(null)).toEqual([]);
  });

  it('fakeTick: a walker heads along its yaw at footSpeed, on the given ground', () => {
    const [e] = fakeTick(parsePeers('4,0,0,0,walk'), 1000, () => 2);
    expect(e!.slot).toBe(4);
    expect(e!.pose.z).toBeCloseTo(-4); // yaw 0 = north = −Z, 4 m/s
    expect(e!.pose.y).toBe(2);
  });
});

describe('Phase 8B: height cull (Louvre room 30 m under the box; verify-foundation #1)', () => {
  it('hidden only when one side is underground (feet > remote.hideDy under the grid) and the other is not', () => {
    const v = { x: 0, z: 0 };
    const flat = () => 5;
    expect(inView({ x: 10, y: 5, z: 0 }, v, 300, false, flat)).toBe(true);
    expect(inView({ x: 10, y: -25, z: 0 }, v, 300, false, flat)).toBe(false); // in the room, seen from the court
    expect(inView({ x: 10, y: 5, z: 0 }, v, 300, true, flat)).toBe(false); // on the court, seen from the room
    expect(inView({ x: 10, y: -24, z: 0 }, v, 300, true, flat)).toBe(true); // both in the room
    expect(inView({ x: 10, y: -25, z: 0 }, v, 300, undefined, flat)).toBe(true); // spectator
    expect(inView({ x: 400, y: 5, z: 0 }, v, 300, false, flat)).toBe(false);
  });
  it('slopes hide nobody: Trocadéro esplanade (+29.6) and the fountain (−0.9) 275 m apart see each other', () => {
    const slope = (x: number) => (x < 100 ? 29.6 : -0.9);
    const ground = (x: number) => slope(x);
    // viewer on the esplanade (not underground), remote at the fountain on its own ground
    expect(inView({ x: 275, y: -0.9, z: 0 }, { x: 0, z: 0 }, 300, false, ground)).toBe(true);
    expect(underground({ x: 275, y: -0.9, z: 0 }, ground)).toBe(false);
    expect(underground({ x: 0, y: 29.6 - 30, z: 0 }, ground)).toBe(true); // a room under the esplanade
  });
});
