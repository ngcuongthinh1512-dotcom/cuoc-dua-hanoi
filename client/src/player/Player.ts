// Phase 3 composition (foundation, the integrator edits it): model + animator + controller + camera for the local
// player. Frame order (main.ts): fixedUpdate × n → update(dt, input, alpha) → render.
// Phase 4 (track B): local dev bikes (vehicle/Bikes.ts), F take / mount / get off, R bell, camera 'bike'.
import type RAPIER from '@dimforge/rapier3d-compat';
import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { crashSound, bell, rolling } from '../audio/sfx.ts';
import { bike as B, bikeModel, npc, playerSetup, thirdPersonCamera } from '../config.ts';
import type { Input } from '../core/Input.ts';
import type { CarKind, ExclusionZone, NpcAnchor } from '../npc/types.ts';
import { notice } from '../ui/Toasts.ts';
import { type BikeAsset, loadBikeAsset } from '../vehicle/BikeModel.ts';
import { Bikes, groundAt } from '../vehicle/Bikes.ts';
import type { RoadSurface } from '../vehicle/types.ts';
import { CharacterAnimator } from './Animation.ts';
import { CharacterController, haltIntent, newIntent, readMoveIntent } from './CharacterController.ts';
import { type CharacterAsset, CharacterModel, loadCharacterAsset } from './CharacterModel.ts';
import { type CameraMode, ThirdPersonCamera } from './ThirdPersonCamera.ts';
import type { CameraTarget, Gesture, PlayerEnv } from './types.ts';
import type { GestureKind, RespawnHow } from '@race/shared/protocol';

const DEG = Math.PI / 180;

/** Test / screenshot overrides from the URL (docs/plans/phase3.md "Screenshot presets"). */
export interface PlayerOverrides {
  /** Phase 6: in a real race (?race=, not ?offline=1): the test hooks below are dropped (only npc* stay), no dev bikes
   *  (the server's shared bikes instead, track C). */
  online?: true;
  spawn?: { x: number; z: number; yawDeg: number };
  camMode?: CameraMode;
  /** Camera yaw relative to "behind the body", degrees (180 = in front, looking at the face). */
  orbitDeg?: number;
  action?: Gesture;
  /** Holds forward (screenshots of the locomotion). */
  autoMove?: 'walk' | 'sprint';
  /** Holds Space (screenshot of the quay climb-out: swim at the wall with Space held). */
  holdJump?: boolean;
  /** Phase 4: start mounted on the first dev bike (placed at the spawn). */
  bike?: boolean;
  /** Holds A (left) / D (right): on the bike a steady turn. */
  autoTurn?: 'left' | 'right';
  /** Phase 4B: ?npc=0 turns the NPCs off. */
  npc?: false;
  npcSeed?: number;
  /** ?npcDensity: fixed density (no automatic factor). */
  npcDensity?: number;
  npcZones?: ExclusionZone[];
  /** ?npcTest=car:<kind>@x,z,yawDeg[;…]: parked cars (Traffic.park). */
  npcTest?: { kind: CarKind; x: number; z: number; yawDeg: number }[];
}

const GESTURES = Object.keys(playerSetup.actions) as Gesture[];
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]) => (allowed as readonly string[]).includes(v ?? '') ? (v as T) : undefined;

const KINDS = Object.keys(npc.vehicles) as CarKind[];
/** "a,b,c;d,e,f" → the groups of `n` finite numbers (others dropped). */
const groups = (v: string | null, n: number) =>
  (v ?? '').split(';').map((g) => g.split(',').map(Number)).filter((g) => g.length === n && g.every(Number.isFinite));
const finite = (v: string | null) => (v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** ?player[=x,z,yawDeg]&camMode=near|far|first&orbit=deg&action=<gesture>&autoMove=walk|sprint&jump&bike&autoTurn=left|right;
 *  Phase 4B: npc=0, npcSeed=n, npcDensity=d, npcZone=x,z,r[;…], npcTest=car:<kind>@x,z,yawDeg[;…]. Invalid fields ignored.
 *  Phase 6: `online` (in a race) keeps only the npc* fields: a team cannot teleport, auto-walk or pose by URL. */
export function parseOverrides(q: URLSearchParams, online = false): PlayerOverrides {
  const p = q.get('player')?.split(',').map(Number);
  const orbit = Number(q.get('orbit'));
  const seed = finite(q.get('npcSeed')), density = finite(q.get('npcDensity'));
  const zones = groups(q.get('npcZone'), 3).filter(([, , r]) => r! > 0).map(([x, z, r]) => ({ x: x!, z: z!, r: r! }));
  const test = (q.get('npcTest') ?? '').split(';').flatMap((t) => {
    const m = /^car:(\w+)@(.+)$/.exec(t);
    const kind = oneOf(m?.[1] ?? null, KINDS);
    const at = groups(m?.[2] ?? null, 3)[0];
    return kind && at ? [{ kind, x: at[0]!, z: at[1]!, yawDeg: at[2]! }] : [];
  });
  const npcPart: PlayerOverrides = {
    ...(q.get('npc') === '0' ? { npc: false as const } : {}),
    ...(seed !== undefined ? { npcSeed: Math.trunc(seed) } : {}),
    ...(density !== undefined && density >= 0 ? { npcDensity: density } : {}),
    ...(zones.length ? { npcZones: zones } : {}),
    ...(test.length ? { npcTest: test } : {}),
  };
  if (online) return { online: true, ...npcPart };
  return {
    ...npcPart,
    ...(p?.length === 3 && p.every(Number.isFinite) ? { spawn: { x: p[0]!, z: p[1]!, yawDeg: p[2]! } } : {}),
    ...(q.has('orbit') && Number.isFinite(orbit) ? { orbitDeg: orbit } : {}),
    camMode: oneOf(q.get('camMode'), thirdPersonCamera.modes),
    action: oneOf(q.get('action'), GESTURES),
    autoMove: oneOf(q.get('autoMove'), ['walk', 'sprint'] as const),
    ...(q.has('jump') ? { holdJump: true } : {}),
    ...(q.has('bike') ? { bike: true } : {}),
    ...(oneOf(q.get('autoTurn'), ['left', 'right'] as const) ? { autoTurn: q.get('autoTurn') as 'left' | 'right' } : {}),
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
  /** Dev bikes placed. */
  bikesPlaced = false;
  private waved = false; // G since the last npcAnchor()
  private blocked = false; // menu / full map open (update → fixedUpdate)
  /** Surface under the bike this frame (tyre sound, debug line). */
  surface: RoadSurface = 'asphalt';
  /** Phase 6: G started a wave / R rang the bell (sent to the other teams). */
  onGesture?: (g: GestureKind) => void;
  /** Phase 6: the body was teleported (spawn placed, "Kẹt?", out of the Seine, fell through the world): the server resets
   *  its speed window instead of flagging the jump. */
  onRespawn?: (how: RespawnHow) => void;
  private stepping = false; // inside controller.fixedUpdate: a respawn there = fell through the world
  private spawnHint: number | undefined; // setSpawn's yHint (re-entry: welcome.pose.y)
  /** Phase 7 (D23): F on foot asks this first (main.ts: RaceClient.interact, the current box in reach → `race open`);
   *  true = handled (the openBox gesture plays, no bike), false = F goes to the bikes as before. */
  onInteract?: () => boolean;

  private constructor(
    readonly model: CharacterModel,
    readonly bikes: Bikes,
    /** The loaded GLBs (shared geometry): Phase 6 RemotePlayers clone the same character and bike. */
    readonly assets: { character: CharacterAsset; bike: BikeAsset },
    private readonly world: RAPIER.World,
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
    this.controller.onDismount = (b, crashed) => {
      b.rider = null; // the bike stays the team's (SPEC §6.3)
      if (crashed) (b.lean = bikeModel.fallenLeanDeg * DEG), crashSound(); // lying on its right side, rider on the left
    };
    this.controller.onStairs = () => notice('bikeStairs'); // Phase 5: SPEC §6.6
    // Phase 6: every respawn is reported (CharacterController untouched: the instance method is wrapped, so its own calls
    // from a physics step go through here too).
    const respawn = this.controller.respawn.bind(this.controller);
    this.controller.respawn = () => {
      const how = respawn();
      this.onRespawn?.(this.stepping ? 'fell' : how);
      return how;
    };
  }

  /** `team` (Phase 6, from the login): shirt, name tag and bike ownership; the test team offline. */
  static async create(scene: Scene, world: RAPIER.World, camera: PerspectiveCamera, env: PlayerEnv, o: PlayerOverrides = {}, team?: { id: string; name: string; colour: string }) {
    const [character, bike] = await Promise.all([loadCharacterAsset(), loadBikeAsset()]);
    const [id, name, colour] = team ? [team.id, team.name, team.colour] : [playerSetup.teamName, playerSetup.teamName, playerSetup.teamColour];
    const model = new CharacterModel(character, { shirt: colour, name });
    scene.add(model.root);
    const bikes = new Bikes(scene, bike, id);
    return new Player(model, bikes, { character, bike }, world, camera, env, o);
  }

  /** Phase 6: where the team last stood (welcome.pose, SPEC §8.10), before activate(): spawns there provisionally so the
   *  chunks stream around it; activate() then places it on the colliders. Phase 7: also the leg start (welcome.start);
   *  `yHint` = welcome.pose.y (D17: back onto the surface it stood on). */
  setSpawn(x: number, z: number, yaw: number, yHint?: number) {
    this.o.spawn = { x, z, yawDeg: yaw / DEG };
    this.spawnHint = yHint;
    this.controller.spawn(x, z, yaw, yHint);
    this.camera.yaw = yaw;
    this.position.copy(this.controller.state.position);
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
    this.controller.spawn(s.x, s.z, s.yawDeg * DEG, this.spawnHint);
    this.target.collider = this.controller.collider;
    if (this.o.action) this.controller.startAction(this.o.action);
    this.simTime = 0;
  }

  /** One physics step, before world.step(). Frozen until activate() and while `frozen` (free-fly debug camera). */
  fixedUpdate(dt: number, frozen: boolean) {
    if (!this.active || frozen) return;
    if (!this.bikesPlaced && this.controller.placed && !this.o.online) this.placeBikes(); // online: the server's bikes
    if (this.blocked) haltIntent(this.intent, this.controller.riding);
    const placed = this.controller.placed;
    this.stepping = true;
    this.controller.fixedUpdate(dt, this.intent);
    this.stepping = false;
    if (!placed && this.controller.placed) this.onRespawn?.('safe'); // spawn() found its ground (Phase 6: legit jump)
    this.simTime += dt;
  }

  /** Dev bikes at bike.devSpawns around the spawn, on the highest collider there; ?bike: the first one under the
   *  player, mounted. ponytail: local bikes only, Phase 6 replaces them with the server's. */
  private placeBikes() {
    this.bikesPlaced = true;
    const s = this.spawnPoint;
    const feet = this.controller.state.position;
    B.devSpawns.forEach(([dx, dz, yawDeg], i) => {
      if (i === 0 && this.o.bike) return this.bikes.add(feet.x, feet.y, feet.z, this.controller.state.yaw);
      const [x, z] = [s.x + dx, s.z + dz];
      const y = groundAt(this.world, x, z, feet.y + 5, this.controller.collider);
      if (y !== null) this.bikes.add(x, y, z, yawDeg * DEG);
    });
    if (this.o.bike) this.bikes.interact(this.controller);
  }

  /** Phase 4B: what the NPCs live around (docs/plans/phase4b.md §3.3): the feet (+ the front wheel when riding), the
   *  camera heading; waving = G since the last call. */
  npcAnchor(out: NpcAnchor, viewYaw: number): NpcAnchor {
    const s = this.controller.state;
    const r = this.controller.riding;
    out.nose = r ? { x: s.position.x - Math.sin(s.yaw) * B.wheelBase, z: s.position.z - Math.cos(s.yaw) * B.wheelBase } : null;
    Object.assign(out, { x: s.position.x, z: s.position.z, viewYaw, body: true, vx: s.velocity.x, vz: s.velocity.z, waving: this.waved });
    this.waved = false;
    return out;
  }

  /** Input → intent and gestures, render pose, animation, camera. `input` null while the free-fly camera has it;
   *  `blocked` (Phase 5: menu or full map open) = no input read, the body stops, a bike brakes to a stop (fixedUpdate,
   *  haltIntent); the camera still follows it. */
  update(dt: number, input: Input | null, alpha: number, blocked = false) {
    this.blocked = !!input && blocked;
    if (input && !blocked) {
      this.camera.look(input, dt);
      if (input.wasPressed('camera')) this.camera.cycleMode();
      readMoveIntent(input, this.camera.yaw, this.intent);
      if (this.o.autoMove) [this.intent.forward, this.intent.right, this.intent.sprint] = [1, 0, this.o.autoMove === 'sprint'];
      if (this.o.autoTurn) this.intent.right = this.o.autoTurn === 'left' ? -1 : 1;
      if (this.o.holdJump) this.intent.jump = true;
      const handled = input.wasPressed('interact') && !this.controller.riding ? this.onInteract?.() : false;
      if (handled) this.controller.startAction('openBox');
      else if (input.wasPressed('interact')) {
        const r = this.bikes.interact(this.controller);
        if (r && r !== 'mount' && r !== 'dismount') notice(r); // Phase 5: why F did nothing
      }
      if (input.wasPressed('bell') && this.controller.riding) bell(), this.onGesture?.('bell');
      if (input.wasPressed('wave') && !this.controller.riding && this.controller.startAction('wave')) (this.waved = true), this.onGesture?.('wave');
    }
    const s = this.controller.state;
    const a = input ? alpha : 1; // free-fly: fixedUpdate is frozen, so prev stays put; don't blend toward it
    const yaw = this.controller.renderYaw(a);
    this.controller.renderPosition(a, this.position);
    this.model.setPose(this.position, yaw);
    this.model.root.visible = this.camera.mode !== 'first';
    const ridden = this.controller.riding;
    this.animator.setRider(this.bikes.update(dt, this.position, ridden, this.position, yaw), ridden?.lean ?? 0);
    this.animator.update(s, dt);
    this.surface = this.controller.surfaceAt(this.position.x, this.position.z);
    rolling(ridden?.speed ?? 0, ridden ? this.surface : null);
    const vehicle = ridden ? 'bike' : 'foot';
    Object.assign(this.target, { yaw, speed: Math.hypot(s.velocity.x, s.velocity.z), moveMode: s.moveMode, vehicle });
    if (input) this.camera.update(dt, this.target);
  }
}
