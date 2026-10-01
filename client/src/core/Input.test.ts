import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Action, padButtons } from '../config.ts';
import { Input } from './Input.ts';

// Node has no DOM: stub the listeners Input registers and a standard-mapping gamepad.
const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
const on: Record<string, (e: unknown) => void> = {}; // window listeners of the newest Input
vi.stubGlobal('addEventListener', (type: string, f: (e: unknown) => void) => void (on[type] = f));
// Just enough DOM for the key target checks: a <button>, the <body>, an <input>.
class El {
  isContentEditable = false;
  constructor(readonly tag: string) {}
  matches = (sel: string) => sel.split(',').some((s) => s.trim() === this.tag);
}
class InputEl extends El {}
vi.stubGlobal('HTMLElement', El);
vi.stubGlobal('HTMLInputElement', InputEl);
vi.stubGlobal('HTMLTextAreaElement', class {});
vi.stubGlobal('HTMLSelectElement', class {});
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

describe('keys while a menu button has the focus (Phase 5, review m1)', () => {
  const ACTION: Record<string, Action> = { Space: 'jump', Tab: 'clueBook', Escape: 'menu' };
  /** [recorded as the game action, default prevented] */
  const press = (input: Input, code: string, target: El) => {
    const e = { code, key: code, keyCode: 0, target, repeat: false, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn() };
    on.keydown!(e);
    const r = [input.wasPressed(ACTION[code]!), e.preventDefault.mock.calls.length > 0];
    input.endFrame();
    return r;
  };
  it("Tab / Space stay the button's (focus moves, it is pressed); Esc still reaches the game (menu)", () => {
    const input = new Input(canvas);
    const button = new El('button');
    expect(press(input, 'Tab', button)).toEqual([false, false]);
    expect(press(input, 'Space', button)).toEqual([false, false]);
    expect(press(input, 'Escape', button)).toEqual([true, true]);
  });
  it('nothing focused, or the pointer locked (playing): game keys as before', () => {
    const input = new Input(canvas);
    expect(press(input, 'Space', new El('body'))).toEqual([true, true]);
    expect(press(input, 'Tab', new El('body'))).toEqual([true, true]);
    input.locked = true;
    expect(press(input, 'Space', new El('button'))).toEqual([true, true]);
  });
  it('an <input> (settings slider, checkbox) keeps every key: Esc there only blurs it (ui/Menu.ts)', () => {
    const input = new Input(canvas);
    expect(press(input, 'Escape', new InputEl('input'))).toEqual([false, false]);
  });
});
