import { describe, expect, it } from 'vitest';
import { playerSetup } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { moveDirection, newIntent, readMoveIntent, tickAction, yawOf } from './CharacterController.ts';
import type { PlayerState } from './types.ts';

const fakeInput = (held: string[], pad = { moveX: 0, moveY: 0 }, pressed: string[] = []) =>
  ({ pad: { ...pad, lookX: 0, lookY: 0, rise: 0 }, isDown: (a: string) => held.includes(a), wasPressed: (a: string) => pressed.includes(a) }) as unknown as Input;

const dir = (held: string[], cameraYaw = 0, pad?: { moveX: number; moveY: number }) =>
  moveDirection(readMoveIntent(fakeInput(held, pad), cameraYaw, newIntent())).map((v) => +v.toFixed(6) + 0);

describe('readMoveIntent + moveDirection (camera-relative)', () => {
  it('W goes where the camera looks: north at yaw 0, west at yaw 90°', () => {
    expect(dir(['moveForward'])).toEqual([0, -1]);
    expect(dir(['moveForward'], Math.PI / 2)).toEqual([-1, 0]);
  });
  it('D is to the right (east at yaw 0); W+D is normalised', () => {
    expect(dir(['moveRight'])).toEqual([1, 0]);
    const [x, z] = dir(['moveForward', 'moveRight']);
    expect(Math.hypot(x!, z!)).toBeCloseTo(1);
  });
  it('half stick = half speed share (stick up = −Y)', () => {
    const [x, z] = dir([], 0, { moveX: 0, moveY: -0.5 });
    expect([x, z]).toEqual([0, -0.5]);
  });
  it('jump latches until the consumer clears it', () => {
    const i = readMoveIntent(fakeInput([], undefined, ['jump']), 0, newIntent());
    readMoveIntent(fakeInput([]), 0, i);
    expect(i.jump).toBe(true);
  });
  it('yawOf inverts the heading convention', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0);
    expect(yawOf(-1, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('tickAction', () => {
  it('locks movement for openBox, then returns to none', () => {
    const s = { action: 'openBox', actionTime: 0 } as PlayerState;
    expect(tickAction(s, 0.1)).toBe(true);
    expect(tickAction(s, playerSetup.actions.openBox.seconds)).toBe(false);
    expect([s.action, s.actionTime]).toEqual(['none', 0]);
  });
  it('wave never locks', () => {
    expect(tickAction({ action: 'wave', actionTime: 0 } as PlayerState, 0.1)).toBe(false);
  });
});
