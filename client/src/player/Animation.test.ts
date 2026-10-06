// Animation state machine (pure pickState), playback speed, crash timeline, and the committed clip file
// (public/models/player-anims.glb from scripts/process-assets.ts) against the body (player.glb).
import { readFileSync } from 'node:fs';
import { type AnimationClip, type Object3D, Quaternion, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { bikeModel, character as C, playerSetup, swim } from '../config.ts';
import { bikeState, loadBike } from '../vehicle/BikeModel.test.ts';
import { BikeModel } from '../vehicle/BikeModel.ts';
import { type AnimState, armWeight, CharacterAnimator, crashPose, locomotionScale, pickState, UAL_CLIPS, UAL_CRASH_FALL } from './Animation.ts';
import { avatarClips, CharacterModel, prepareAsset } from './CharacterModel.ts';
import type { MoveMode, PlayerAction, PlayerState } from './types.ts';

const MODELS = new URL('../../public/models/', import.meta.url);

function state(o: { mode?: MoveMode; speed?: number; action?: PlayerAction; t?: number; jumps?: number } = {}): PlayerState {
  return {
    position: new Vector3(),
    velocity: new Vector3(0, 0, -(o.speed ?? 0)),
    yaw: 0,
    grounded: o.mode !== 'air',
    inWater: o.mode === 'swim',
    moveMode: o.mode ?? 'walk',
    jumps: o.jumps ?? 0,
    action: o.action ?? 'none',
    actionTime: o.t ?? 0,
  };
}

async function loadGlb(name: string) {
  const buf = readFileSync(new URL(name, MODELS));
  return new Promise<{ scene: Object3D; animations: AnimationClip[] }>((res, rej) =>
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer, '', res, rej),
  );
}

/** Node names of player.glb, from its JSON chunk (no texture decoding in Node). */
function bodyNodeNames() {
  const b = readFileSync(new URL('player.glb', MODELS));
  return new Set((JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { nodes: { name: string }[] }).nodes.map((n) => n.name));
}

describe('pickState', () => {
  const walk = C.moveThreshold + 1;
  it.each<[string, PlayerState, AnimState]>([
    ['still', state(), 'idle'],
    ['standard speed', state({ speed: 4 }), 'jog'],
    ['slow stride (wall slide)', state({ speed: 1.4 }), 'walk'],
    ['sprint (SPEC §17.29)', state({ speed: 8 }), 'jog'],
    ['swimming', state({ mode: 'swim', speed: 1.8 }), 'swimFwd'],
    ['floating', state({ mode: 'swim' }), 'swimIdle'],
    ['falling (no jump)', state({ mode: 'air' }), 'air'],
    ['open box', state({ action: 'openBox', speed: walk }), 'openBox'],
    ['celebrate', state({ action: 'celebrate' }), 'celebrate'],
    ['crash', state({ action: 'crash', mode: 'air' }), 'crash'],
    ['climb out', state({ action: 'climbOut', mode: 'swim' }), 'climbOut'],
    ['riding', state({ mode: 'bike', speed: 5 }), 'cycle'],
    ['crash wins over riding', state({ mode: 'bike', action: 'crash' }), 'crash'],
    ['wave while jogging = jog (arm layer)', state({ action: 'wave', speed: 4 }), 'jog'],
    ['standard mode below jogFrom (part-tilted stick, sliding) = walk', state({ speed: C.jogFrom[1] - 0.1 }), 'walk'],
  ])('%s', (_, p, want) => expect(pickState(p, 'idle', 1, false)).toBe(want));

  it('jump: jumpStart, then air; fall: air at once; landing still → land → idle, moving → locomotion', () => {
    const air = state({ mode: 'air', jumps: 1 });
    expect(pickState(air, 'jog', 0.2, true)).toBe('jumpStart');
    expect(pickState(air, 'jumpStart', C.jump.startSeconds / 2, false)).toBe('jumpStart');
    expect(pickState(air, 'jumpStart', C.jump.startSeconds + 0.01, false)).toBe('air');
    expect(pickState(state({ mode: 'air' }), 'jog', 0.2, false)).toBe('air');
    expect(pickState(state(), 'air', 0.5, false)).toBe('land');
    expect(pickState(state(), 'land', C.land.seconds / 2, false)).toBe('land');
    expect(pickState(state(), 'land', C.land.seconds + 0.01, false)).toBe('idle');
    expect(pickState(state({ speed: 4 }), 'air', 0.5, false)).toBe('jog');
  });

  it('walk ⇄ jog by speed with hysteresis (jogFrom)', () => {
    const mid = state({ speed: (C.jogFrom[0] + C.jogFrom[1]) / 2 });
    expect(pickState(mid, 'walk', 1, false)).toBe('walk');
    expect(pickState(mid, 'jog', 1, false)).toBe('jog');
    expect(pickState(state({ speed: C.jogFrom[0] - 0.01 }), 'jog', 1, false)).toBe('walk');
  });
});

describe('playback', () => {
  it('locomotion speed is proportional to the ground speed (1 at the clip speed), clamped', () => {
    expect(locomotionScale(1.2, 1.2)).toBe(1);
    expect(locomotionScale(1.4, 1)).toBeCloseTo(2 * locomotionScale(0.7, 1));
    expect(locomotionScale(100, 1)).toBe(C.timeScale.max);
    expect(locomotionScale(0, 1)).toBe(C.timeScale.min);
    const own = C.clipSpeed[UAL_CLIPS.jog!]!;
    expect(locomotionScale(4, own)).toBeCloseTo(4 / own);
  });

  it('crash: Hit_Chest, Death01 down to lying, ≈ 2 s on the ground (SPEC §6.3), back up at the end; never NaN', () => {
    const T = playerSetup.actions.crash.seconds;
    const [, lying] = C.crash.fall;
    expect(crashPose(0)).toEqual({ fall: false, time: 0 });
    let down = 0;
    for (let t = 0; t <= T; t += 0.01) {
      const p = crashPose(t);
      expect(Number.isFinite(p.time)).toBe(true);
      if (p.time === lying) down += 0.01;
    }
    expect(down).toBeGreaterThan(1.8);
    expect(crashPose(T)).toEqual({ fall: true, time: 0 });
  });

  it('arm layer weight fades in and out over the wave / celebrate gesture only', () => {
    for (const g of ['wave', 'celebrate'] as const) {
      const T = playerSetup.actions[g].seconds;
      expect([armWeight(g, 0), armWeight(g, T / 2), armWeight(g, T)]).toEqual([0, 1, 0]);
    }
    expect(armWeight('none', 1)).toBe(0);
    expect(armWeight('openBox', 1)).toBe(0);
  });
});

describe('player-anims.glb', async () => {
  const anims = await loadGlb('player-anims.glb');
  const names = anims.animations.map((c) => c.name);

  it('15 clips per avatar (m_ / f_): every state of UAL_CLIPS + the crash fall', () => {
    const want = [...new Set([...Object.values(UAL_CLIPS), UAL_CRASH_FALL])];
    expect(want).toHaveLength(15);
    expect(new Set(names)).toEqual(new Set(['m_', 'f_'].flatMap((p) => want.map((c) => p + c))));
    const all: AnimState[] = ['idle', 'walk', 'jog', 'jumpStart', 'air', 'land', 'swimIdle', 'swimFwd', 'openBox', 'pickUp', 'celebrate', 'crash', 'climbOut', 'talk', 'cycle'];
    for (const s of all) expect(UAL_CLIPS[s], s).toBeDefined();
  });

  it('every track targets a bone of player.glb; rotations + the pelvis translation only; no DEF- names', () => {
    const bones = bodyNodeNames();
    for (const c of anims.animations) {
      for (const t of c.tracks) {
        const [node, prop] = t.name.split('.');
        expect(bones.has(node!), t.name).toBe(true);
        expect(prop === 'quaternion' || (node === 'pelvis' && prop === 'position'), t.name).toBe(true);
        expect([...t.values].every(Number.isFinite)).toBe(true);
      }
    }
    anims.scene.traverse((o) => expect(o.name.startsWith('DEF-')).toBe(false));
  });

  it('animator on the clip skeleton: states change, wave raises the right hand, celebrate both, no NaN', async () => {
    const rig = await loadGlb('player-anims.glb'); // the bone tree without a mesh: enough to drive and measure
    const model = new CharacterModel(prepareAsset(rig.scene, avatarClips(rig.animations, 0)), { shirt: '#d8342c' });
    const anim = new CharacterAnimator(model);
    const at = (n: string) => model.root.getObjectByName(n)!.getWorldPosition(new Vector3());
    for (let i = 0; i < 30; i++) anim.update(state({ speed: 4 }), 1 / 30);
    expect(anim.state).toBe('jog');
    const T = playerSetup.actions.wave.seconds;
    for (let t = 0; t < T / 2; t += 1 / 30) anim.update(state({ action: 'wave', t }), 1 / 30);
    model.root.updateMatrixWorld(true);
    expect(anim.state).toBe('idle');
    expect(at('hand_r').y).toBeGreaterThan(at('Head').y);
    expect(at('hand_l').y).toBeLessThan(at('Head').y);
    for (let t = 0; t < playerSetup.actions.celebrate.seconds / 2; t += 1 / 30) anim.update(state({ action: 'celebrate', t }), 1 / 30);
    model.root.updateMatrixWorld(true);
    expect(anim.state).toBe('celebrate');
    expect(Math.min(at('hand_l').y, at('hand_r').y)).toBeGreaterThan(at('Head').y);
    const lying = 1.5; // crashPose: Death01 held at fall[1]
    for (let t = 0; t < lying; t += 1 / 30) anim.update(state({ action: 'crash', t }), 1 / 30);
    anim.update(state({ action: 'crash', t: lying }), 1 / 30);
    const fall = model.mixer.existingAction(model.clips.find((c) => c.name === UAL_CRASH_FALL)!)!;
    expect(fall.isScheduled() && fall.getEffectiveWeight()).toBe(1);
    expect(fall.time).toBeCloseTo(C.crash.fall[1], 3);
    for (let t = lying; t < playerSetup.actions.crash.seconds; t += 1 / 30) anim.update(state({ action: 'crash', t }), 1 / 30);
    expect(anim.state).toBe('crash');
    model.root.traverse((o) => expect([...o.quaternion.toArray(), ...o.position.toArray()].every(Number.isFinite)).toBe(true));
  });

  it('swimming forward: the horizontal crawl is lifted (character.clipLift) so the head reaches the surface; idle swim is not', async () => {
    const rig = await loadGlb('player-anims.glb');
    const model = new CharacterModel(prepareAsset(rig.scene, avatarClips(rig.animations, 0)), { shirt: '#d8342c' });
    const anim = new CharacterAnimator(model);
    const head = () => (model.root.updateMatrixWorld(true), model.root.getObjectByName('Head')!.getWorldPosition(new Vector3()).y);
    for (const speed of [0, 4]) {
      anim.update(state({ speed }), 1 / 30); // Swim_Fwd_Loop never played yet: no lift (feet on the ground)
      expect(model.body.position.y, `speed ${speed}`).toBe(0);
    }
    for (let i = 0; i < 30; i++) anim.update(state({ mode: 'swim', speed: 1.8 }), 1 / 30);
    expect(anim.state).toBe('swimFwd');
    expect(model.body.position.y).toBeCloseTo(C.clipLift.Swim_Fwd_Loop!, 3);
    expect(head()).toBeGreaterThan(swim.floatDepth - 0.2); // feet at 0, surface at floatDepth
    for (let i = 0; i < 30; i++) anim.update(state({ mode: 'swim' }), 1 / 30);
    expect(anim.state).toBe('swimIdle');
    expect(model.body.position.y).toBe(0);
    expect(head()).toBeGreaterThan(swim.floatDepth);
  });
});

describe('rider IK (player-anims.glb rig on bike.glb)', async () => {
  const [rig, bike] = [await loadGlb('player-anims.glb'), new BikeModel(await loadBike())];
  const model = new CharacterModel(prepareAsset(rig.scene, avatarClips(rig.animations, 0)), { shirt: '#d8342c' });
  const anim = new CharacterAnimator(model);
  const at = (n: string) => model.root.getObjectByName(n)!.getWorldPosition(new Vector3());
  const b = bikeState({ position: new Vector3(3, 0.5, -2), yaw: 0.7, rider: 'p', lean: 0.15, steer: 0.1 });
  const ride = (crank: number, dt: number) => {
    b.crankAngle = crank;
    bike.update(b, false, dt);
    model.setPose(b.position, b.yaw);
    anim.setRider(bike.riderTargets(), b.lean);
    anim.update(state({ mode: 'bike', speed: 5 }), dt);
    model.root.updateMatrixWorld(true);
  };

  it('seated, ball of each foot on its pedal (≤ 2 cm) at 8 crank angles, knees bent, hands on the grips', () => {
    for (let t = 0; t < bikeModel.mountBlend + 0.2; t += 1 / 30) ride(0, 1 / 30);
    expect(anim.state).toBe('cycle');
    for (let k = 0; k < 8; k++) {
      ride((k * Math.PI) / 4, 1 / 30);
      const T = bike.riderTargets();
      expect(at('pelvis').distanceTo(T.saddle), `pelvis ${k}`).toBeLessThan(0.02);
      for (const [s, pedal, grip] of [['l', T.pedalL, T.gripL], ['r', T.pedalR, T.gripR]] as const) {
        expect(at(`ball_${s}`).distanceTo(pedal), `foot ${s} ${k}`).toBeLessThan(0.02);
        const [hip, knee, ankle] = [at(`thigh_${s}`), at(`calf_${s}`), at(`foot_${s}`)];
        expect(hip.sub(knee).angleTo(ankle.sub(knee)), `knee ${s} ${k}`).toBeLessThan((175 * Math.PI) / 180);
        expect(at(`middle_01_${s}`).distanceTo(grip), `hand ${s} ${k}`).toBeLessThan(0.03);
      }
    }
  });

  it('ankling: pedal and foot pitch together, toes down behind the axle, heel down in front (± rider.ankleDeg)', () => {
    const [frame, pedal] = [bike.root.getObjectByName('frame')!, bike.root.getObjectByName('pedalL')!];
    const DEG = Math.PI / 180;
    const [tilt, rel, fwd]: number[][] = [[], [], []];
    for (let k = 0; k < 16; k++) {
      ride((k * Math.PI) / 8, 1 / 30);
      const inv = frame.getWorldQuaternion(new Quaternion()).invert(); // bike frame: +Z forward, +Y up, X the crank axis
      const q = inv.clone().multiply(pedal.getWorldQuaternion(new Quaternion())); // pedal: about X only
      const toes = at('ball_l').sub(at('foot_l')).applyQuaternion(inv);
      const T = bike.riderTargets();
      tilt.push((2 * Math.atan2(q.x, q.w)) / DEG); // + = toes down
      rel.push(Math.atan2(-toes.y, toes.z) / DEG - tilt.at(-1)!); // foot pitch on the pedal
      fwd.push(T.pedalL.clone().sub(T.pedalR).applyQuaternion(inv).normalize().z); // where the left crank points
    }
    const range = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(range(tilt)).toBeGreaterThan(1.9 * bikeModel.rider.ankleDeg);
    expect(range(tilt)).toBeLessThan(2.1 * bikeModel.rider.ankleDeg);
    expect(tilt[fwd.indexOf(Math.min(...fwd))]!).toBeGreaterThan(0.9 * bikeModel.rider.ankleDeg); // behind: toes down
    expect(tilt[fwd.indexOf(Math.max(...fwd))]!).toBeLessThan(-0.9 * bikeModel.rider.ankleDeg); // in front: heel down
    expect(range(rel)).toBeLessThan(0.3 * bikeModel.rider.ankleDeg); // the foot follows the pedal
  });

  it('dismount: the IK fades out over mountBlend (body back on its feet), no NaN', () => {
    anim.setRider(null, 0);
    for (let t = 0; t < bikeModel.mountBlend + 0.05; t += 1 / 30) anim.update(state(), 1 / 30);
    expect(model.body.position.toArray()).toEqual([0, 0, 0]);
    expect(model.body.rotation.z).toBe(0);
    model.root.traverse((o) => expect([...o.quaternion.toArray(), ...o.position.toArray()].every(Number.isFinite)).toBe(true));
  });
});
