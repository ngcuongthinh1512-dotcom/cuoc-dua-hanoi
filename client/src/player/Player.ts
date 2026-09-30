// Phase 3 composition (foundation, the integrator edits it): model + animator + controller + camera for the local
// player. Frame order (main.ts): fixedUpdate × n → update(dt, input, alpha) → render.
import type RAPIER from '@dimforge/rapier3d-compat';
import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { playerSetup, thirdPersonCamera } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { CharacterAnimator } from './Animation.ts';
import { CharacterController, newIntent, readMoveIntent } from './CharacterController.ts';
import { CharacterModel, loadCharacterAsset } from './CharacterModel.ts';
import { type CameraMode, ThirdPersonCamera } from './ThirdPersonCamera.ts';
import type { CameraTarget, Gesture, PlayerEnv } from './types.ts';

const DEG = Math.PI / 180;

/** Test / screenshot overrides from the URL (docs/plans/phase3.md "Screenshot presets"). */
export interface PlayerOverrides {
  spawn?: { x: number; z: number; yawDeg: number };
  camMode?: CameraMode;
  /** Camera yaw relative to "behind the body", degrees (180 = in front, looking at the face). */
  orbitDeg?: number;
  action?: Gesture;
  /** Holds forward (screenshots of the locomotion). */
  autoMove?: 'walk' | 'slow';
  /** Holds Space (screenshot of the quay climb-out: swim at the wall with Space held). */
  holdJump?: boolean;
}

const GESTURES = Object.keys(playerSetup.actions) as Gesture[];
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]) => (allowed as readonly string[]).includes(v ?? '') ? (v as T) : undefined;

/** ?player[=x,z,yawDeg]&camMode=near|far|first&orbit=deg&action=<gesture>&autoMove=walk|slow&jump; invalid fields ignored. */
export function parseOverrides(q: URLSearchParams): PlayerOverrides {
  const p = q.get('player')?.split(',').map(Number);
  const orbit = Number(q.get('orbit'));
  return {
    ...(p?.length === 3 && p.every(Number.isFinite) ? { spawn: { x: p[0]!, z: p[1]!, yawDeg: p[2]! } } : {}),
    ...(q.has('orbit') && Number.isFinite(orbit) ? { orbitDeg: orbit } : {}),
    camMode: oneOf(q.get('camMode'), thirdPersonCamera.modes),
    action: oneOf(q.get('action'), GESTURES),
    autoMove: oneOf(q.get('autoMove'), ['walk', 'slow'] as const),
    ...(q.has('jump') ? { holdJump: true } : {}),
  };
}

export class Player {
  readonly controller: CharacterController;
  readonly camera: ThirdPersonCamera;
  readonly animator: CharacterAnimator;
  /** Feet at the render pose (interpolated). */
  readonly position = new Vector3();
  /** s simulated since activate(); -1 before. */
  simTime = -1;
  private readonly intent = newIntent();
  private readonly target: CameraTarget;

  private constructor(
    readonly model: CharacterModel,
    world: RAPIER.World,
    camera: PerspectiveCamera,
    env: PlayerEnv,
    private readonly o: PlayerOverrides,
  ) {
    this.controller = new CharacterController(world, env);
    this.camera = new ThirdPersonCamera(camera, world);
    this.animator = new CharacterAnimator(model);
    const s = this.spawnPoint;
    this.controller.spawn(s.x, s.z, s.yawDeg * DEG); // provisional (terrain only) so chunks stream around it
    this.camera.yaw = s.yawDeg * DEG + (o.orbitDeg ?? 0) * DEG;
    if (o.camMode) while (this.camera.mode !== o.camMode) this.camera.cycleMode();
    this.position.copy(this.controller.state.position);
    this.target = { position: this.position, yaw: 0, speed: 0, moveMode: 'walk', vehicle: 'foot', collider: this.controller.collider };
  }

  static async create(scene: Scene, world: RAPIER.World, camera: PerspectiveCamera, env: PlayerEnv, o: PlayerOverrides = {}) {
    const model = new CharacterModel(await loadCharacterAsset(), { shirt: playerSetup.teamColour, name: playerSetup.teamName });
    scene.add(model.root);
    return new Player(model, world, camera, env, o);
  }

  private get spawnPoint() {
    return this.o.spawn ?? playerSetup.spawn;
  }

  get active() {
    return this.simTime >= 0;
  }

  /** Once the chunk colliders around the spawn exist (the world is ready): real spawn, simulation starts. */
  activate() {
    if (this.active) return;
    const s = this.spawnPoint;
    this.controller.spawn(s.x, s.z, s.yawDeg * DEG);
    this.target.collider = this.controller.collider;
    if (this.o.action) this.controller.startAction(this.o.action);
    this.simTime = 0;
  }

  /** One physics step, before world.step(). Frozen until activate() and while `frozen` (free-fly debug camera). */
  fixedUpdate(dt: number, frozen: boolean) {
    if (!this.active || frozen) return;
    this.controller.fixedUpdate(dt, this.intent);
    this.simTime += dt;
  }

  /** Input → intent and gestures, render pose, animation, camera. `input` null while the free-fly camera has it. */
  update(dt: number, input: Input | null, alpha: number) {
    if (input) {
      this.camera.look(input, dt);
      if (input.wasPressed('camera')) this.camera.cycleMode();
      readMoveIntent(input, this.camera.yaw, this.intent);
      if (this.o.autoMove) [this.intent.forward, this.intent.right, this.intent.slow] = [1, 0, this.o.autoMove === 'slow'];
      if (this.o.holdJump) this.intent.jump = true;
      if (input.wasPressed('wave')) this.controller.startAction('wave');
    }
    const s = this.controller.state;
    const a = input ? alpha : 1; // free-fly: fixedUpdate is frozen, so prev stays put; don't blend toward it
    const yaw = this.controller.renderYaw(a);
    this.controller.renderPosition(a, this.position);
    this.model.setPose(this.position, yaw);
    this.model.root.visible = this.camera.mode !== 'first';
    this.animator.update(s, dt);
    Object.assign(this.target, { yaw, speed: Math.hypot(s.velocity.x, s.velocity.z), moveMode: s.moveMode });
    if (input) this.camera.update(dt, this.target);
  }
}
