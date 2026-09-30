import { flyCamera, keys, padButtons, type Action } from '../config.ts';

const BOUND = new Set(Object.values(keys).flat());

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);

// Unikey/EVKey (Windows) send the converted letter with no physical code; macOS/Windows IMEs compose (key "Process", 229).
const looksLikeIme = (e: KeyboardEvent) =>
  e.isComposing ||
  e.key === 'Process' ||
  e.keyCode === 229 ||
  ((e.code === '' || e.code === 'Unidentified') && e.key.length === 1 && e.key.charCodeAt(0) > 127);

/** Radial deadzone, rescaled so the stick still reaches 1. */
function stick(x = 0, y = 0): [number, number] {
  const len = Math.hypot(x, y);
  const dz = flyCamera.gamepadDeadzone;
  if (len <= dz) return [0, 0];
  const k = Math.min(1, (len - dz) / (1 - dz)) / len;
  return [x * k, y * k];
}

/** Keyboard (by KeyboardEvent.code), pointer-locked mouse, wheel, gamepad. Call poll() then endFrame() once per frame. */
export class Input {
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0; // speed steps this frame; + = scroll down (slower)
  locked = false;
  imeSuspected = false;
  onPointerLockChange: (locked: boolean) => void = () => {};
  onImeSuspected: () => void = () => {};
  /** First standard-mapping gamepad: left stick move, right stick look, rise = RT/RB − LT/LB. */
  readonly pad = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, rise: 0 };
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly padHeld = new Set<number>(); // button indices (config padButtons)
  private readonly padPressed = new Set<number>();
  private lastWheel = -Infinity;

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => this.keydown(e));
    // macOS sends no keyup for a key released while Cmd is down, so releasing Cmd drops every held key.
    addEventListener('keyup', (e) => (e.key === 'Meta' ? this.held.clear() : this.held.delete(e.code)));
    addEventListener('blur', () => this.held.clear());
    document.addEventListener('visibilitychange', () => document.hidden && this.held.clear());
    canvas.addEventListener('click', () => this.lock());
    // The browser eats Esc while locked, so losing the lock is the "menu" signal (SPEC §17.2).
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onPointerLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    // One step per wheel event: a notch is ~100 px on Windows but ~4 px on macOS. Shift+wheel arrives as horizontal.
    // ponytail: min gap between steps, so very fast spins drop notches and a trackpad swipe still takes a few steps;
    // scale by delta per device if players find it too coarse.
    canvas.addEventListener(
      'wheel',
      (e) => {
        const d = e.deltaY || (e.shiftKey ? e.deltaX : 0);
        if (!d || e.timeStamp - this.lastWheel < flyCamera.wheelGapMs) return;
        this.lastWheel = e.timeStamp;
        this.wheel += Math.sign(d);
      },
      { passive: true },
    );
  }

  isDown(action: Action) {
    return keys[action].some((c) => this.held.has(c)) || !!padButtons[action]?.some((b) => this.padHeld.has(b));
  }

  /** True only in the frame the key / gamepad button went down (auto-repeat ignored). */
  wasPressed(action: Action) {
    return keys[action].some((c) => this.pressed.has(c)) || !!padButtons[action]?.some((b) => this.padPressed.has(b));
  }

  poll() {
    const gp = navigator.getGamepads?.().find((p) => p?.mapping === 'standard');
    const p = this.pad;
    if (!gp) {
      p.moveX = p.moveY = p.lookX = p.lookY = p.rise = 0;
      this.padHeld.clear();
      return;
    }
    gp.buttons.forEach((btn, i) => {
      if (!btn.pressed) this.padHeld.delete(i);
      else if (!this.padHeld.has(i)) {
        this.padHeld.add(i);
        this.padPressed.add(i);
      }
    });
    [p.moveX, p.moveY] = stick(gp.axes[0], gp.axes[1]);
    [p.lookX, p.lookY] = stick(gp.axes[2], gp.axes[3]);
    const b = (i: number) => gp.buttons[i]?.value ?? 0;
    p.rise = Math.max(b(7), b(5)) - Math.max(b(6), b(4));
  }

  endFrame() {
    this.pressed.clear();
    this.padPressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }

  private keydown(e: KeyboardEvent) {
    if (isTextField(e.target)) return; // future HUD fields type normally
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser/OS shortcuts (Cmd+R, Ctrl+F…) stay theirs, SPEC §17.1
    if (looksLikeIme(e)) {
      if (!this.imeSuspected) this.onImeSuspected();
      this.imeSuspected = true;
      return;
    }
    if (!BOUND.has(e.code)) return;
    e.preventDefault(); // Tab focus, Space scroll, F3 find…
    if (!e.repeat) this.pressed.add(e.code);
    this.held.add(e.code);
  }

  /** Pointer lock (canvas click; Phase 5: menu "Tiếp tục", closing the full map). Only inside a user gesture. */
  lock() {
    if (this.locked) return;
    // Chrome returns a Promise that rejects when re-locking too soon after Esc; Safari returns undefined.
    (this.canvas.requestPointerLock() as Promise<void> | undefined)?.catch(() => {});
  }
}
