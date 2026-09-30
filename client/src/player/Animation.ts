// Track A (docs/plans/phase3.md): the clip state machine over a PlayerState. Locomotion clips play at the ground speed
// (feet don't slide), gestures are scrubbed by PlayerState.actionTime (deterministic, so Phase 6 remote players look the
// same from a snapshot), wave / celebrate arms are procedural layers applied after the mixer.
import { type AnimationAction, LoopOnce, LoopRepeat, MathUtils, type Object3D, Quaternion, Vector3 } from 'three';
import { bikeModel, character as C, playerSetup } from '../config.ts';
import type { CharacterModel } from './CharacterModel.ts';
import type { RiderTargets } from '../vehicle/types.ts';
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
  crash: 'Hit_Chest', // then Death01, then back up
  climbOut: 'Jump_Land',
  talk: 'Idle_Talking_Loop',
  cycle: 'Driving_Loop',
};
/** Second half of the crash (character.crash): falls backwards, held lying, played backwards to stand up. */
export const UAL_CRASH_FALL = 'Death01';

const LOOPED = new Set<AnimState>(['idle', 'walk', 'jog', 'air', 'swimIdle', 'swimFwd', 'celebrate', 'talk', 'cycle']);
const hSpeed = (p: Readonly<PlayerState>) => Math.hypot(p.velocity.x, p.velocity.z);

/** Next state. `prev` / `prevTime` = current state and s spent in it; `jumped` = PlayerState.jumps changed this frame. */
export function pickState(p: Readonly<PlayerState>, prev: AnimState, prevTime: number, jumped: boolean): AnimState {
  if (p.action !== 'none' && p.action !== 'wave') return p.action; // openBox / celebrate / crash / climbOut (wave = arm layer)
  if (p.moveMode === 'bike') return 'cycle'; // Phase 4 track A: + leg / arm IK onto the bike (vehicle/BikeModel.ts)
  const moving = hSpeed(p) >= C.moveThreshold;
  if (p.moveMode === 'swim') return moving ? 'swimFwd' : 'swimIdle';
  if (jumped) return 'jumpStart';
  if (p.moveMode === 'air') return prev === 'jumpStart' && prevTime < C.jump.startSeconds ? 'jumpStart' : 'air'; // air without a jump = fall
  const landing = prev === 'air' || prev === 'jumpStart' || (prev === 'land' && prevTime < C.land.seconds);
  if (!moving) return landing ? 'land' : 'idle';
  // By speed too: a part-tilted stick or sliding along a wall must not skate a running stride (C.jogFrom).
  return p.moveMode !== 'slow' && hSpeed(p) >= C.jogFrom[prev === 'jog' ? 0 : 1] ? 'jog' : 'walk';
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
const [_A, _K, _G, _d, _n, _f, _r, _u] = Array.from({ length: 8 }, () => new Vector3());
const [_end, _cur, _pitch] = [new Quaternion(), new Quaternion(), new Quaternion()];
const RIDER_KEYS = ['saddle', 'pedalL', 'pedalR', 'gripL', 'gripR'] as const;

/** Rotates `bone` (in world space, by `w` of the full turn) so that bone → child points along `dir`. */
function aim(bone: Object3D, child: Object3D, dir: Vector3, w: number) {
  const from = child.getWorldPosition(_a).sub(bone.getWorldPosition(_b)).normalize();
  _q.identity().slerp(_p.setFromUnitVectors(from, dir), w);
  bone.parent!.getWorldQuaternion(_p);
  bone.quaternion.premultiply(_q.premultiply(_pi.copy(_p).invert()).multiply(_p)); // local = (P⁻¹ q P) · local
}

/** Turns `bone` by the world-space rotation `q` (local = P⁻¹ q P · local). */
function turnWorld(bone: Object3D, q: Quaternion) {
  bone.parent!.getWorldQuaternion(_p);
  bone.quaternion.premultiply(_q.copy(_pi.copy(_p).invert()).multiply(q).multiply(_p));
}

/** 2-bone IK (world space): a → b → c with the joint b bent toward `pole`, so that `tip` (a child of c: ball of the
 *  foot, knuckles) lands on `target`; c keeps its world orientation. By weight w (0 = the clip's pose). */
export function reach(chain: readonly Object3D[], target: Vector3, pole: Vector3, w: number) {
  const [a, b, c, tip] = chain as [Object3D, Object3D, Object3D, Object3D];
  c.getWorldQuaternion(_end);
  const goal = _G.copy(target).sub(tip.getWorldPosition(_t).sub(c.getWorldPosition(_c)));
  a.getWorldPosition(_A);
  const [lab, lbc] = [b.getWorldPosition(_b).distanceTo(_A), _c.distanceTo(_b)];
  const d = _d.copy(goal).sub(_A);
  const dist = MathUtils.clamp(d.length(), 1e-4, (lab + lbc) * 0.999); // never straight: the knee / elbow stays bent
  d.normalize();
  const cos = MathUtils.clamp((lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist), -1, 1);
  const n = _n.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const knee = _K.copy(_A).addScaledVector(d, lab * cos).addScaledVector(n, lab * Math.sqrt(1 - cos * cos));
  aim(a, b, knee.sub(_A).normalize(), w);
  aim(b, c, goal.sub(b.getWorldPosition(_b)).normalize(), w);
  c.getWorldQuaternion(_cur).slerp(_end, w);
  c.parent!.getWorldQuaternion(_p);
  c.quaternion.copy(_p.invert().multiply(_cur));
}

/** Picks the clip for a PlayerState, crossfades, matches playback speed to the ground speed. Call once per frame. */
export class CharacterAnimator {
  state: AnimState = 'idle';
  private time = 0; // s in `state`
  private jumps: number | undefined;
  private current: AnimationAction | undefined;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly arms = new Map<string, Object3D[]>(); // side → spine_03, upperarm, lowerarm, hand
  private readonly limbs: Object3D[][] = []; // rider IK: leg l, leg r, arm l, arm r (+ the tip child)
  private readonly trunk: (Object3D | undefined)[]; // pelvis, spine_01, neck_01
  /** Clip-pose rotations of the bones the rider IK turned last frame: put back before the mixer runs, since bones the
   *  clips don't animate (spine_01 has no track) would otherwise keep, and accumulate, the procedural turn. */
  private readonly unposed = new Map<Object3D, Quaternion>();
  private readonly lookRest = new Map<Object3D, Quaternion>();
  private readonly rider = {
    on: false,
    w: 0, // IK weight, ramps over bikeModel.mountBlend
    lean: 0,
    world: Object.fromEntries(RIDER_KEYS.map((k) => [k, new Vector3()])) as Record<(typeof RIDER_KEYS)[number], Vector3>,
    local: Object.fromEntries(RIDER_KEYS.map((k) => [k, new Vector3()])) as Record<(typeof RIDER_KEYS)[number], Vector3>, // root frame: kept for the dismount fade
  };

  constructor(
    private readonly model: CharacterModel,
    readonly clipMap: Readonly<Partial<Record<AnimState, string>>> = UAL_CLIPS,
  ) {
    for (const c of model.clips) this.actions.set(c.name, model.mixer.clipAction(c));
    for (const s of ['l', 'r']) {
      const arm = ['spine_03', `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`].map((n) => model.root.getObjectByName(n));
      if (arm.every(Boolean)) this.arms.set(s, arm as Object3D[]); // ponytail: UBC bone names; Phase 4B rigs map theirs
    }
    const bone = (n: string) => model.root.getObjectByName(n);
    for (const names of [['thigh', 'calf', 'foot', 'ball'], ['upperarm', 'lowerarm', 'hand', 'middle_01']]) {
      for (const s of ['l', 'r']) this.limbs.push(names.map((n) => bone(`${n}_${s}`)).filter((o) => o !== undefined));
    }
    this.trunk = ['pelvis', 'spine_01', 'neck_01'].map(bone);
    // Rest pose (as loaded, before the mixer): Driving_Loop glances sideways (mirror checks); a rider looks ahead.
    for (const n of ['neck_01', 'Head']) {
      const b = bone(n);
      if (b) this.lookRest.set(b, b.quaternion.clone());
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

  /** Phase 4: world IK targets on the bike being ridden (BikeModel.riderTargets, after its update) and its lean (rad,
   *  + = right), every frame before update(); null = on foot. The pose blends in / out over bikeModel.mountBlend. */
  setRider(t: RiderTargets | null, lean: number) {
    const R = this.rider;
    R.on = t !== null;
    if (!t) return;
    R.lean = lean;
    for (const k of RIDER_KEYS) R.world[k].copy(t[k]);
  }

  update(p: Readonly<PlayerState>, dt: number) {
    for (const [bone, q] of this.unposed) bone.quaternion.copy(q);
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
    for (const [name, m] of Object.entries(C.clipLift)) {
      const a = this.actions.get(name); // a never-played action reports weight 1: count only what the mixer applies
      lift += m * (a?.isScheduled() ? a.getEffectiveWeight() : 0);
    }
    this.model.body.position.set(0, lift, 0);
    this.model.body.rotation.z = 0;
    const w = armWeight(p.action, p.actionTime);
    if (w > 0 && armGesture(p.action)) {
      for (const s of ARM_SIDES[p.action]) this.raiseArm(this.arms.get(s), C.arms[p.action], w, p.actionTime);
    }
    const R = this.rider;
    R.w = MathUtils.clamp(R.w + (R.on ? dt : -dt) / bikeModel.mountBlend, 0, 1);
    if (R.w > 0) this.ride(MathUtils.smoothstep(R.w, 0, 1));
  }

  /** On the bike (weight w): body rolled by the lean, pelvis moved onto the saddle, spine pitched forward, feet on the
   *  pedals, hands on the grips (the Driving_Loop seat pose underneath). */
  private ride(w: number) {
    const [R, { root, body }] = [this.rider, this.model];
    root.updateMatrixWorld(true);
    if (R.on) for (const k of RIDER_KEYS) root.worldToLocal(R.local[k].copy(R.world[k]));
    const t = Object.fromEntries(RIDER_KEYS.map((k) => [k, root.localToWorld(R.world[k].copy(R.local[k]))])) as typeof R.world;
    body.rotation.z = R.lean * w; // body faces +Z inside root: + roll = top to its right, like the bike
    const [pelvis, spine, neck] = this.trunk;
    for (const bone of [spine, ...this.lookRest.keys(), ...this.limbs.flatMap((l) => l.slice(0, 3))]) {
      if (bone) this.unposed.set(bone, (this.unposed.get(bone) ?? new Quaternion()).copy(bone.quaternion));
    }
    if (pelvis) {
      const d = t.saddle.clone().sub(pelvis.getWorldPosition(_a)).multiplyScalar(w);
      body.position.add(d.applyQuaternion(root.getWorldQuaternion(_q).invert()));
    }
    body.updateMatrixWorld(true);
    body.getWorldQuaternion(_pi);
    const [fwd, up, right] = [_f.set(0, 0, 1).applyQuaternion(_pi), _u.set(0, 1, 0).applyQuaternion(_pi), _r.set(-1, 0, 0).applyQuaternion(_pi)];
    const Rd = bikeModel.rider;
    for (const [b, q] of this.lookRest) b.quaternion.slerp(q, w);
    if (spine) turnWorld(spine, _pitch.setFromAxisAngle(right, -MathUtils.degToRad(Rd.spineDeg) * w));
    if (neck) turnWorld(neck, _pitch.setFromAxisAngle(right, MathUtils.degToRad(Rd.neckDeg) * w));
    const [legL, legR, armL, armR] = this.limbs;
    const knee = fwd.clone().addScaledVector(up, 0.3);
    const elbow = (side: number) => up.clone().negate().addScaledVector(right, 0.6 * side).addScaledVector(fwd, -0.3);
    if (legL?.length === 4) reach(legL, t.pedalL, knee, w);
    if (legR?.length === 4) reach(legR, t.pedalR, knee, w);
    if (armL?.length === 4) reach(armL, t.gripL, elbow(-1), w);
    if (armR?.length === 4) reach(armR, t.gripR, elbow(1), w);
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
