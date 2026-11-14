// Walking player for the dev rooms (gallery.ts, choco.ts): the game's own body (CharacterModel + CharacterAnimator),
// the Rapier KCC (CharacterController) over a tiny box world (floor, walls, desks / tables from the rooms' slot data) and
// the ThirdPersonCamera, driven by the game's Input (WASD, Shift sprint, Space jump, mouse look under pointer lock).
// F within `reach` m of the own team's "Bắt đầu" button (any button without ?team=) → onPress(slot) (the overlay game);
// the mouse never opens a game. V (or ?fly=1 / ?view= / ?cam=) = the rooms' old free-fly camera. Params: avatar=0|1,
// autoMove=walk|sprint (holds W, screenshots). DEV: window.__ROOM__ = the RoomPlayer.
import type { Avatar } from '@race/shared/protocol';
import RAPIER from '@dimforge/rapier3d-compat';
import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { physics, playerSetup } from '../config.ts';
import { Input } from '../core/Input.ts';
import { CharacterAnimator } from '../player/Animation.ts';
import { CharacterController, haltIntent, newIntent, readMoveIntent } from '../player/CharacterController.ts';
import { CharacterModel, loadCharacterAsset } from '../player/CharacterModel.ts';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera.ts';
import type { CameraTarget } from '../player/types.ts';
import { pickAvatar } from '../ui/settings.ts';

export interface Slot { x: number; y: number; z: number; yaw: number }
/** An axis-aligned box in slot-local space, or (with yaw) a world box turned about Y. */
export interface Box { x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw?: number }
export interface RoomButton { slot: number; x: number; y: number; z: number; active: boolean }

/** A slot-local box (local +x right, +z forward / toward the aisle) as a world box at the slot. */
export function slotBox(s: Slot, b: Box): Box {
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  return { x: s.x + b.x * c + b.z * n, y: s.y + b.y, z: s.z - b.x * n + b.z * c, hx: b.hx, hy: b.hy, hz: b.hz, yaw: s.yaw };
}
/** Floor slab (top at y 0) + four walls, `t` m thick, just outside the room x0..x1 × z0..z1. */
export function shellBoxes(x0: number, x1: number, z0: number, z1: number, h = 8, t = 0.5): Box[] {
  const [cx, cz, hx, hz] = [(x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2];
  return [
    { x: cx, y: -0.5, z: cz, hx: hx + t, hy: 0.5, hz: hz + t },
    { x: x0 - t / 2, y: h / 2, z: cz, hx: t / 2, hy: h / 2, hz: hz + t },
    { x: x1 + t / 2, y: h / 2, z: cz, hx: t / 2, hy: h / 2, hz: hz + t },
    { x: cx, y: h / 2, z: z0 - t / 2, hx: hx + t, hy: h / 2, hz: t / 2 },
    { x: cx, y: h / 2, z: z1 + t / 2, hx: hx + t, hy: h / 2, hz: t / 2 },
  ];
}
/** Walk mode unless the URL asks for the free camera (?fly=1, a ?view= preset or ?cam=). */
export const wantsWalk = (q: URLSearchParams): boolean => q.get('fly') !== '1' && !q.get('view') && !q.get('cam');
/** The nearest button within `r` m of the feet (horizontal), active or not; null when none. */
export function nearestButton(px: number, pz: number, buttons: readonly RoomButton[], r: number): RoomButton | null {
  let best: RoomButton | null = null, d0 = r;
  for (const b of buttons) {
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d <= d0) [best, d0] = [b, d];
  }
  return best;
}

/** What one frame does: `live` = read input and move, `step` = run the physics (never while the overlay freezes the body
 *  or the free-fly camera has it), `edge` = the freeze just started / ended (drop held keys, release the pointer, stop). */
export function frameMode(frozen: boolean, flying: boolean, wasFrozen: boolean): { live: boolean; step: boolean; edge: 'freeze' | 'thaw' | null } {
  return { live: !frozen && !flying, step: !frozen && !flying, edge: frozen === wasFrozen ? null : frozen ? 'freeze' : 'thaw' };
}

export interface RoomPlayerOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  q: URLSearchParams;
  boxes: readonly Box[];
  buttons: readonly RoomButton[];
  spawn: { x: number; z: number; yaw: number };
  /** Shirt colour + name tag (+ Leg 2 avatar: 0 Nam / 1 Nữ; omitted = ?avatar / the menu setting); omitted = the test team (playerSetup). */
  team?: { name: string; colour: string; avatar?: Avatar };
  /** The race: the game's own Input (same canvas; main.ts polls it and owns canLock). Omitted = the room makes one (dev pages). */
  input?: Input;
  /** m from a button where F works and the prompt shows. */
  reach?: number;
  /** The overlay is open: the body freezes, no input, pointer lock stays released. */
  frozen: () => boolean;
  /** A grey reason the button is off (the team switched branch: only the exit ring is left); null = buttons work. */
  locked?: () => string | null;
  /** The prompt at a working button (default "Bấm F để bắt đầu"). */
  prompt?: string;
  onPress: (slot: number) => void;
  /** V toggled the free-fly camera (true = flying: the room drives the camera from its current pose). Absent = no V (the race). */
  onFly?: (flying: boolean) => void;
}

const PROMPT = 'Bấm F để bắt đầu', WRONG = 'Đây không phải bàn của đội bạn';
const ENV = { heightAt: () => 0, waterLevel: null, water: undefined };

export class RoomPlayer {
  flying: boolean;
  readonly position = new Vector3();
  readonly controller: CharacterController;
  readonly tpc: ThirdPersonCamera;
  readonly input: Input;
  private readonly animator: CharacterAnimator;
  private readonly intent = newIntent();
  private readonly target: CameraTarget;
  private readonly prompt = document.createElement('div');
  private readonly auto: 'walk' | 'sprint' | null;
  private acc = 0;
  private wasFrozen = false;

  constructor(readonly model: CharacterModel, private readonly world: RAPIER.World, private readonly o: RoomPlayerOptions) {
    this.flying = !wantsWalk(o.q);
    this.auto = o.q.get('autoMove') === 'walk' || o.q.get('autoMove') === 'sprint' ? (o.q.get('autoMove') as 'walk' | 'sprint') : null;
    this.controller = new CharacterController(world, ENV);
    this.controller.spawn(o.spawn.x, o.spawn.z, o.spawn.yaw);
    this.position.copy(this.controller.state.position);
    this.tpc = new ThirdPersonCamera(o.camera, world);
    this.tpc.yaw = o.spawn.yaw;
    this.animator = new CharacterAnimator(model);
    this.target = { position: this.position, yaw: o.spawn.yaw, speed: 0, moveMode: 'walk', vehicle: 'foot', collider: this.controller.collider };
    this.input = o.input ?? new Input(o.canvas);
    if (!o.input) this.input.canLock = () => !this.flying && !o.frozen();
    this.prompt.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 16px;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font:600 18px system-ui,sans-serif;text-shadow:0 1px 2px #000;pointer-events:none;white-space:nowrap';
    this.prompt.hidden = true;
    document.body.append(this.prompt);
    model.setPose(this.position, o.spawn.yaw);
  }

  /** Once per frame, before the render: input → physics steps → pose, animation, camera, prompt. While the overlay is open
   *  (frozen) the body stands perfectly still: no input, no physics step, velocity 0 (idle clip), the camera fixed. */
  update(dt: number) {
    const { input, o } = this;
    const s = this.controller.state;
    const frozen = o.frozen();
    const { live, step, edge } = frameMode(frozen, this.flying, this.wasFrozen);
    this.wasFrozen = frozen;
    if (edge) { // keys pressed into the game / dialog never send their keyup here; the body resumes from the same spot
      input.release();
      haltIntent(this.intent, null);
      if (edge === 'freeze') {
        document.exitPointerLock();
        this.controller.spawn(s.position.x, s.position.z, s.yaw); // teleports in place: velocity and the pending input gone
        this.acc = 0;
      }
    }
    if (!o.input) input.poll(); // a shared Input: main.ts polls / ends the frame
    if (!frozen && o.onFly && input.wasPressed('flyToggle')) {
      this.flying = !this.flying;
      if (this.flying) document.exitPointerLock();
      o.onFly?.(this.flying);
    }
    const near = nearestButton(this.position.x, this.position.z, o.buttons, o.reach ?? 1.8);
    if (live) {
      this.tpc.look(input, dt);
      readMoveIntent(input, this.tpc.yaw, this.intent);
      if (this.auto) [this.intent.forward, this.intent.right, this.intent.sprint] = [1, 0, this.auto === 'sprint'];
      if (near?.active && !o.locked?.() && input.wasPressed('interact')) o.onPress(near.slot);
    } else haltIntent(this.intent, null);
    if (step) {
      this.acc = Math.min(this.acc + dt, physics.maxFrameDt);
      for (; this.acc >= physics.fixedDt; this.acc -= physics.fixedDt) {
        this.controller.fixedUpdate(physics.fixedDt, this.intent);
        this.world.step();
      }
    }
    const a = this.acc / physics.fixedDt;
    const yaw = this.controller.renderYaw(a);
    this.controller.renderPosition(a, this.position);
    this.model.setPose(this.position, yaw);
    this.animator.update(s, dt);
    Object.assign(this.target, { yaw, speed: Math.hypot(s.velocity.x, s.velocity.z), moveMode: s.moveMode });
    if (step) this.tpc.update(dt, this.target);
    this.prompt.hidden = !live || !near;
    if (near) {
      const lock = o.locked?.();
      this.prompt.textContent = lock ?? (near.active ? (o.prompt ?? PROMPT) : WRONG);
      this.prompt.style.color = !lock && near.active ? '#fff' : '#bbb';
    }
    if (!o.input) input.endFrame();
  }

  /** Turn the camera (and so the next W) toward (x, z): the exit ring lit up at the far end of the room. */
  face(x: number, z: number) {
    this.tpc.yaw = Math.atan2(this.position.x - x, this.position.z - z);
  }

  /** The room is unmounted: the prompt leaves the page (the body goes with the scene). */
  dispose() {
    this.prompt.remove();
  }
}

/** Loads the avatar (?avatar=0|1, else the menu setting), builds the box world and the body at the spawn. */
export async function createRoomPlayer(o: RoomPlayerOptions): Promise<RoomPlayer> {
  const [asset] = await Promise.all([loadCharacterAsset(), RAPIER.init()]);
  const world = new RAPIER.World(physics.gravity);
  world.timestep = physics.fixedDt;
  for (const b of o.boxes) {
    const d = RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z);
    if (b.yaw) d.setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) });
    world.createCollider(d);
  }
  const team = o.team ?? { name: playerSetup.teamName, colour: playerSetup.teamColour };
  const model = new CharacterModel(asset, { shirt: team.colour, name: team.name, avatar: o.team?.avatar ?? pickAvatar(o.q, false) });
  o.scene.add(model.root);
  const p = new RoomPlayer(model, world, o);
  Object.assign(window, { __ROOM__: p });
  return p;
}
