// Track A (docs/plans/phase3.md): the clip state machine over a PlayerState. Locomotion clips play at the ground speed
// (feet don't slide), gestures are scrubbed by PlayerState.actionTime (deterministic, so Phase 6 remote players look the
// same from a snapshot), wave / celebrate arms are procedural layers applied after the mixer.
import { type AnimationAction, LoopOnce, LoopRepeat, MathUtils, type Object3D, Quaternion, Vector3 } from 'three';
import { character as C, playerSetup } from '../config.ts';
import type { CharacterModel } from './CharacterModel.ts';
import type { Gesture, PlayerState } from './types.ts';

export type AnimState =
  | 'idle'
  | 'walk' // moveMode 'slow'
  | 'jog' // moveMode 'walk' (standard speed)
  | 'jumpStart'
  | 'air' // jump loop and fall
  | 'land'
  | 'swimIdle'
  | 'swimFwd'
  | 'openBox'
  | 'pickUp'
  | 'celebrate'
  | 'wave'
  | 'crash'
  | 'climbOut'
  | 'talk' // Phase 7 Pit Stop host NPC
  | 'cycle'; // Phase 4: sitting pose + leg IK

/** UAL clip per state for the player body (docs/plans/phase3.md table). Pedestrians (Phase 4B) pass their own map. */
export const UAL_CLIPS: Readonly<Partial<Record<AnimState, string>>> = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  jumpStart: 'Jump_Start',
  air: 'Jump_Loop',
  land: 'Jump_Land',
  swimIdle: 'Swim_Idle_Loop',
  swimFwd: 'Swim_Fwd_Loop',
  openBox: 'Interact',
  pickUp: 'PickUp_Table',
  celebrate: 'Dance_Loop', // + both arms raised (ARM_SIDES); UAL's Celebration clip is the paid pack
  wave: 'Idle_Talking_Loop', // fallback; the wave itself is a procedural right-arm layer (ARM_SIDES)
  crash: 'Hit_Chest', // then Death01, then back up
  climbOut: 'Jump_Land',
  talk: 'Idle_Talking_Loop',
  cycle: 'Driving_Loop',
};
/** Second half of the crash (character.crash): falls backwards, held lying, played backwards to stand up. */
export const UAL_CRASH_FALL = 'Death01';

const LOOPED = new Set<AnimState>(['idle', 'walk', 'jog', 'air', 'swimIdle', 'swimFwd', 'celebrate', 'wave', 'talk', 'cycle']);
const hSpeed = (p: Readonly<PlayerState>) => Math.hypot(p.velocity.x, p.velocity.z);

/** Next state. `prev` / `prevTime` = current state and s spent in it; `jumped` = PlayerState.jumps changed this frame. */
export function pickState(p: Readonly<PlayerState>, prev: AnimState, prevTime: number, jumped: boolean): AnimState {
  if (p.action !== 'none' && p.action !== 'wave') return p.action; // openBox / celebrate / crash / climbOut
  const moving = hSpeed(p) >= C.moveThreshold;
  if (p.moveMode === 'swim') return moving ? 'swimFwd' : 'swimIdle';
  if (jumped) return 'jumpStart';
  if (p.moveMode === 'air') return prev === 'jumpStart' && prevTime < C.jump.startSeconds ? 'jumpStart' : 'air'; // air without a jump = fall
  const landing = prev === 'air' || prev === 'jumpStart' || (prev === 'land' && prevTime < C.land.seconds);
  if (!moving) return landing ? 'land' : 'idle';
  return p.moveMode === 'slow' ? 'walk' : 'jog';
}

/** Locomotion playback speed: proportional to the ground speed, 1 at the clip's own speed, clamped. */
export const locomotionScale = (speed: number, clipSpeed: number) => MathUtils.clamp(speed / clipSpeed, C.timeScale.min, C.timeScale.max);

/** Crash pose at `t` s into the gesture: Hit_Chest, then Death01 forward to lying, held, then backwards (stands up). */
export function crashPose(t: number, total = playerSetup.actions.crash.seconds): { fall: boolean; time: number } {
  const { hit, fall: [a, b], fallSeconds, standSeconds } = C.crash;
  if (t < hit) return { fall: false, time: Math.max(0, t) };
  const up = total - standSeconds;
  if (t < up) return { fall: true, time: a + (b - a) * Math.min(1, (t - hit) / fallSeconds) };
  return { fall: true, time: b * (1 - Math.min(1, (t - up) / standSeconds)) };
}

/** Gestures with a procedural arm layer (character.arms) and the arms raised: UBC bone suffixes. */
export const ARM_SIDES = { wave: ['r'], celebrate: ['l', 'r'] } as const;
type ArmGesture = keyof typeof ARM_SIDES;
const armGesture = (a: PlayerState['action']): a is ArmGesture => a in ARM_SIDES;

/** Weight of the arm layer `t` s into its gesture (0 for the other actions), fading in and out. */
export function armWeight(action: PlayerState['action'], t: number) {
  if (!armGesture(action)) return 0;
  const [f, total] = [C.arms[action].fade, playerSetup.actions[action].seconds];
  return MathUtils.smoothstep(t, 0, f) * MathUtils.smoothstep(total - t, 0, f);
}

const [_a, _b, _c, _up, _t] = [new Vector3(), new Vector3(), new Vector3(), new Vector3(0, 1, 0), new Vector3()];
const [_q, _p, _pi] = [new Quaternion(), new Quaternion(), new Quaternion()];

/** Rotates `bone` (in world space, by `w` of the full turn) so that bone → child points along `dir`. */
function aim(bone: Object3D, child: Object3D, dir: Vector3, w: number) {
  const from = child.getWorldPosition(_a).sub(bone.getWorldPosition(_b)).normalize();
  _q.identity().slerp(_p.setFromUnitVectors(from, dir), w);
  bone.parent!.getWorldQuaternion(_p);
  bone.quaternion.premultiply(_q.premultiply(_pi.copy(_p).invert()).multiply(_p)); // local = (P⁻¹ q P) · local
}

/** Picks the clip for a PlayerState, crossfades, matches playback speed to the ground speed. Call once per frame. */
export class CharacterAnimator {
  state: AnimState = 'idle';
  private time = 0; // s in `state`
  private jumps: number | undefined;
  private current: AnimationAction | undefined;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly arms = new Map<string, Object3D[]>(); // side → spine_03, upperarm, lowerarm, hand

  constructor(
    private readonly model: CharacterModel,
    readonly clipMap: Readonly<Partial<Record<AnimState, string>>> = UAL_CLIPS,
  ) {
    for (const c of model.clips) this.actions.set(c.name, model.mixer.clipAction(c));
    for (const s of ['l', 'r']) {
      const arm = ['spine_03', `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`].map((n) => model.root.getObjectByName(n));
      if (arm.every(Boolean)) this.arms.set(s, arm as Object3D[]); // ponytail: UBC bone names; Phase 4B rigs map theirs
    }
    this.play(this.actions.get(clipMap.idle ?? ''), true);
  }

  private play(a: AnimationAction | undefined, looped: boolean) {
    if (!a || a === this.current) return;
    a.reset().setLoop(looped ? LoopRepeat : LoopOnce, Infinity).play();
    a.clampWhenFinished = !looped;
    if (this.current) this.current.crossFadeTo(a, C.fade, false);
    this.current = a;
  }

  update(p: Readonly<PlayerState>, dt: number) {
    const jumped = this.jumps !== undefined && p.jumps !== this.jumps;
    this.jumps = p.jumps;
    const next = pickState(p, this.state, this.time, jumped);
    this.time = next === this.state && !jumped ? this.time + dt : 0;
    this.state = next;
    if (next === p.action) {
      // Gesture: scrubbed by actionTime (paused action, time set here).
      const crash = next === 'crash' ? crashPose(p.actionTime) : undefined;
      const a = this.actions.get((crash?.fall ? UAL_CRASH_FALL : this.clipMap[next]) ?? '');
      this.play(a, false);
      if (a) {
        const d = a.getClip().duration;
        a.paused = true;
        a.time = crash ? crash.time : LOOPED.has(next) ? p.actionTime % d : Math.min(d, (p.actionTime * d) / playerSetup.actions[p.action as Gesture].seconds);
      }
    } else {
      const name = this.clipMap[next] ?? '';
      const a = this.actions.get(name);
      this.play(a, LOOPED.has(next));
      if (a) a.paused = false;
      if (a && next === 'jumpStart' && this.time === 0) a.time = C.jump.startAt;
      if (a && next === 'land') a.timeScale = C.land.speed;
      const own = C.clipSpeed[name];
      if (a && own) a.timeScale = locomotionScale(hSpeed(p), own);
    }
    this.model.mixer.update(dt);
    let lift = 0;
    for (const [name, m] of Object.entries(C.clipLift)) lift += m * (this.actions.get(name)?.getEffectiveWeight() ?? 0);
    this.model.body.position.y = lift;
    const w = armWeight(p.action, p.actionTime);
    if (w > 0 && armGesture(p.action)) {
      for (const s of ARM_SIDES[p.action]) this.raiseArm(this.arms.get(s), C.arms[p.action], w, p.actionTime);
    }
  }

  /** Arm raised to its side, forearm swinging (world-space aims, so any clip underneath works). */
  private raiseArm(arm: Object3D[] | undefined, W: (typeof C.arms)[ArmGesture], w: number, t: number) {
    if (!arm) return;
    const [spine, upper, lower, hand] = arm;
    const out = upper!.getWorldPosition(_c).sub(spine!.getWorldPosition(_t)).setY(0).normalize();
    const r = MathUtils.degToRad(W.raiseDeg);
    aim(upper!, lower!, _t.copy(out).multiplyScalar(Math.cos(r)).addScaledVector(_up, Math.sin(r)), w);
    aim(lower!, hand!, _t.copy(_up).addScaledVector(out, W.swing * Math.sin(2 * Math.PI * W.hz * t)).normalize(), w);
  }
}
