import { afterEach, describe, expect, it, vi } from 'vitest';
import { padButtons } from '../config.ts';
import { Input } from './Input.ts';

// Node has no DOM: stub the listeners Input registers and a standard-mapping gamepad.
const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
vi.stubGlobal('addEventListener', () => {});
vi.stubGlobal('document', { addEventListener: () => {} });
vi.stubGlobal('navigator', { getGamepads: () => [{ mapping: 'standard', axes: [0, 0, 0, 0], buttons }] });
const canvas = { addEventListener: () => {} } as unknown as HTMLCanvasElement;

afterEach(() => buttons.forEach((b) => (b.pressed = false)));

describe('Input gamepad buttons (config padButtons)', () => {
  it('jump: wasPressed only in the first frame, isDown while held', () => {
    const input = new Input(canvas);
    buttons[padButtons.jump![0]!]!.pressed = true;
    input.poll();
    expect([input.isDown('jump'), input.wasPressed('jump')]).toEqual([true, true]);
    input.endFrame();
    input.poll();
    expect([input.isDown('jump'), input.wasPressed('jump')]).toEqual([true, false]);
    buttons[padButtons.jump![0]!]!.pressed = false;
    input.endFrame();
    input.poll();
    expect(input.isDown('jump')).toBe(false);
  });

  it('an action without a pad binding stays keyboard-only', () => {
    const input = new Input(canvas);
    buttons.forEach((b) => (b.pressed = true));
    input.poll();
    expect(input.isDown('moveForward')).toBe(false);
    expect(input.isDown('walkSlow')).toBe(true);
  });
});
