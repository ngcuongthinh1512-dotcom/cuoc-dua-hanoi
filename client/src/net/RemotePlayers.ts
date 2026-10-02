// Phase 6 track B (docs/plans/phase6.md §3.13, §5.2): the other teams, rebuilt from ticks (SPEC §7): a PlayerState per
// slot interpolated remote.interpolationMs behind the server clock, drawn with CharacterModel + CharacterAnimator (team
// shirt, name tag) and a BikeModel while riding; ghosts (no Rapier body), hidden beyond presence.renderRadius.
import { MOVE_MODES, PLAYER_ACTIONS, type GestureKind, type MoveMode, type PlayerAction, type PoseSample, type TeamInfo, type TickEntry } from '@race/shared/protocol';
import { MathUtils, type Scene, Vector3 } from 'three';
import { bell } from '../audio/sfx.ts';
import { bike as B, bikeTopSpeed, movement, playerSetup, remote as R } from '../config.ts';
import { CharacterAnimator } from '../player/Animation.ts';
import { type CharacterAsset, CharacterModel } from '../player/CharacterModel.ts';
import type { PlayerState } from '../player/types.ts';
import { type BikeAsset, BikeModel, rollWheels } from '../vehicle/BikeModel.ts';
import { newBike } from '../vehicle/Bikes.ts';
import type { BikeState } from '../vehicle/types.ts';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A remote body at one instant: feet (m), heading (rad), horizontal velocity (m/s), turn rate (rad/s, + = left). */
export interface RemotePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  yawRate: number;
  mode: MoveMode;
  action: PlayerAction;
}
export const newRemotePose = (): RemotePose => ({ x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0, mode: 'walk', action: 'none' });

/** One team's samples by server time (ms). Pure: RemotePlayers draws what sample() returns. */
export class Track {
  private readonly s: { t: number; p: PoseSample }[] = [];

  get size() {
    return this.s.length;
  }

  /** A newer sample; one further than remote.snapDistance from the last (respawn, reconnect) restarts the buffer, so the
   *  body jumps there instead of sliding through walls. */
  push(t: number, p: PoseSample) {
    const last = this.s.at(-1);
    if (last && t <= last.t) return; // late / duplicate
    if (last && Math.hypot(p.x - last.p.x, p.y - last.p.y, p.z - last.p.z) > R.snapDistance) this.s.length = 0;
    this.s.push({ t, p });
    if (this.s.length > R.bufferSamples) this.s.shift();
  }

  clear() {
    this.s.length = 0;
  }

  /** The pose at server time t: linear between the samples around it (heading the short way across ±π); past the newest,
   *  carried on at the last velocity for ≤ remote.extrapolateMs, then held (velocity 0). mode / action of the sample at or
   *  before t. False when empty. */
  sample(t: number, out: RemotePose): boolean {
    const s = this.s;
    if (!s.length) return false;
    let i = s.length - 1;
    while (i > 0 && s[i]!.t > t) i--;
    const a = s[i]!;
    const later = s[i + 1];
    const [p, q, f] = later ? [a, later, Math.max(0, (t - a.t) / (later.t - a.t))] : s.length > 1 ? [s[i - 1]!, a, 1] : [a, a, 1];
    const dt = (q.t - p.t) / 1000 || Infinity;
    let k = later ? f : 1;
    let [vx, vz, yawRate] = [(q.p.x - p.p.x) / dt, (q.p.z - p.p.z) / dt, wrap(q.p.yaw - p.p.yaw) / dt];
    if (!later && t > a.t) {
      const ahead = t - a.t;
      k = 1 + Math.min(ahead, R.extrapolateMs) / 1000 / dt;
      if (ahead > R.extrapolateMs) vx = vz = yawRate = 0;
    }
    if (t < a.t) (k = 0), (vx = vz = yawRate = 0); // before the first sample: hold it
    Object.assign(out, {
      x: p.p.x + (q.p.x - p.p.x) * k,
      y: p.p.y + (q.p.y - p.p.y) * k,
      z: p.p.z + (q.p.z - p.p.z) * k,
      yaw: wrap(p.p.yaw + wrap(q.p.yaw - p.p.yaw) * k),
      vx, vz, yawRate,
      mode: a.p.mode,
      action: a.p.action,
    });
    return true;
  }
}

/** The animator's view of a remote body, rebuilt each frame from the sampled pose: jumps +1 when it goes airborne,
 *  actionTime restarts when the action changes (gestures are scrubbed by it, so they replay like the sender's). */
export function updateState(st: PlayerState, p: RemotePose, dt: number) {
  if (p.mode === 'air' && st.moveMode !== 'air') st.jumps++;
  st.actionTime = p.action === 'none' ? 0 : p.action === st.action ? st.actionTime + dt : 0;
  st.position.set(p.x, p.y, p.z);
  st.velocity.set(p.vx, 0, p.vz);
  Object.assign(st, { yaw: p.yaw, moveMode: p.mode, action: p.action, grounded: p.mode !== 'air' && p.mode !== 'swim', inWater: p.mode === 'swim' });
}

/** Rider lean (rad, + = right) for a speed and turn rate: tan(lean) = v·ω / g, clamped to bike.leanMaxDeg. Not on the
 *  wire: derived from the interpolated heading. */
export const leanFor = (speed: number, yawRate: number) =>
  MathUtils.clamp(-Math.atan((speed * yawRate) / 9.81), -B.leanMaxDeg * MathUtils.DEG2RAD, B.leanMaxDeg * MathUtils.DEG2RAD);

interface Remote {
  team: TeamInfo;
  track: Track;
  model: CharacterModel;
  animator: CharacterAnimator;
  state: PlayerState;
  bike?: { model: BikeModel; state: BikeState };
  /** In the latest tick (within NET.interestRadius) and online. */
  live: boolean;
}

const pose = newRemotePose();

export class RemotePlayers {
  private readonly slots = new Map<number, Remote>();
  private teams = new Map<number, TeamInfo>();
  private readonly viewer = new Vector3();
  private drawn = 0;
  private lastT = NaN;

  constructor(
    readonly scene: Scene,
    readonly asset: CharacterAsset,
    readonly bikeAsset: BikeAsset | null,
    /** m (Welcome.presence.renderRadius). */
    public renderRadius: number,
  ) {}

  /** Welcome.teams: names, colours, slots (also after a reconnect). */
  setTeams(teams: readonly TeamInfo[]) {
    this.teams = new Map(teams.map((t) => [t.slot, t]));
    for (const [slot, r] of this.slots) {
      const t = this.teams.get(slot);
      if (!t) continue;
      if (t.name !== r.team.name) r.model.setName(t.name);
      if (t.colour !== r.team.colour) r.model.setShirt(t.colour);
      r.team = t;
      if (!t.online) this.hide(r);
    }
  }

  setOnline(slot: number, online: boolean) {
    const t = this.teams.get(slot);
    if (t) t.online = online;
    const r = this.slots.get(slot);
    if (r && !online) this.hide(r);
  }

  /** One server tick: poses of the teams within the interest radius (never the local player). A slot missing from it
   *  left the radius (or went offline): hidden until it comes back. */
  apply(serverMs: number, entries: readonly TickEntry[]) {
    const seen = new Set<number>();
    for (const e of entries) {
      const r = this.slots.get(e.slot) ?? this.add(e.slot);
      if (!r) continue;
      seen.add(e.slot);
      r.track.push(serverMs, e.pose);
      r.live = true; // ticks carry online teams only
    }
    for (const [slot, r] of this.slots) if (!seen.has(slot)) this.hide(r);
  }

  /** G (wave) / R (bell) of another team (server `gesture`). The wave is in its poses already (action), so only the bell
   *  does something here: rung within remote.bellRadius of the viewer. */
  gesture(slot: number, g: GestureKind) {
    const r = this.slots.get(slot);
    if (g === 'bell' && r?.live && r.state.position.distanceTo(this.viewer) <= R.bellRadius) bell();
  }

  /** Every frame: interpolate, animate, cull by distance from `viewer`. Animation time follows the render clock (≤ the
   *  frame time): gestures replay on the sender's timeline, also when the clock is simulated (DEV ?peers).
   *  Phase 8B: `under` = the local player's feet are underground (the Louvre room; undefined = spectator / free-fly: no
   *  height cull), `heightAt` the shared terrain grid (inView). */
  update(frameDt: number, serverNow: number, viewer: Vector3, under?: boolean, heightAt?: (x: number, z: number) => number) {
    this.viewer.copy(viewer);
    const t = serverNow - R.interpolationMs;
    const dt = Number.isNaN(this.lastT) ? 0 : MathUtils.clamp((t - this.lastT) / 1000, 0, frameDt);
    this.lastT = t;
    this.drawn = 0;
    for (const r of this.slots.values()) {
      const shown = r.live && r.track.sample(t, pose) && inView(pose, viewer, this.renderRadius, under, heightAt);
      r.model.root.visible = shown;
      if (r.bike) r.bike.model.root.visible = shown && pose.mode === 'bike';
      if (!shown) continue;
      this.drawn++;
      updateState(r.state, pose, dt);
      r.model.setPose(r.state.position, pose.yaw);
      const riding = pose.mode === 'bike' && this.bikeAsset ? this.ride(r, dt) : null;
      r.animator.setRider(riding?.model.riderTargets() ?? null, riding?.state.lean ?? 0);
      r.animator.update(r.state, dt);
    }
  }

  /** Remote players drawn this frame (F3). */
  get count() {
    return this.drawn;
  }

  dispose() {
    for (const r of this.slots.values()) r.model.dispose(), r.bike?.model.dispose();
    this.slots.clear();
  }

  private add(slot: number): Remote | undefined {
    const team = this.teams.get(slot);
    // ponytail: a team created after our welcome stays unseen until our next welcome (reconnect); the Host creates teams
    // before the start. Upgrade: `team` online messages carry the TeamInfo.
    if (!team) return undefined;
    const model = new CharacterModel(this.asset, { shirt: team.colour, name: team.name });
    model.root.visible = false;
    this.scene.add(model.root);
    const state: PlayerState = {
      position: new Vector3(), velocity: new Vector3(), yaw: 0, grounded: true, inWater: false, moveMode: 'walk', jumps: 0, action: 'none', actionTime: 0,
    };
    const r: Remote = { team, track: new Track(), model, animator: new CharacterAnimator(model), state, live: false };
    this.slots.set(slot, r);
    return r;
  }

  private hide(r: Remote) {
    r.live = false;
    r.track.clear();
    r.model.root.visible = false;
    if (r.bike) r.bike.model.root.visible = false;
  }

  /** The bike under a remote rider (its own BikeModel; vehicle/Bikes.ts hides other teams' ridden server bikes). */
  private ride(r: Remote, dt: number) {
    if (!r.bike) {
      const model = new BikeModel(this.bikeAsset!);
      this.scene.add(model.root);
      r.bike = { model, state: Object.assign(newBike(`remote${r.team.slot}`, 0, 0, 0, 0), { rider: r.team.id }) };
    }
    const b = r.bike.state;
    const speed = Math.hypot(pose.vx, pose.vz);
    b.position.set(pose.x, pose.y, pose.z);
    b.yaw = pose.yaw;
    b.speed = speed;
    b.lean += (leanFor(speed, pose.yawRate) - b.lean) * (1 - Math.exp(-dt / R.leanSmoothing));
    rollWheels(b, speed * dt);
    r.bike.model.root.visible = true;
    r.bike.model.update(b, false, dt);
    return r.bike;
  }
}

// ── DEV stand-in (p6-peers, p6-debug): ?peers=slot,x,z,yawDeg,mode[,action];… fake remote players, no server ──

export interface FakePeer {
  slot: number;
  x: number;
  z: number;
  yaw: number;
  mode: MoveMode;
  action: PlayerAction;
}

/** Phase 8B: feet more than remote.hideDy under the terrain grid = underground (the Louvre room, 30 m under its box). */
export const underground = (p: { x: number; y: number; z: number }, heightAt: (x: number, z: number) => number) => p.y < heightAt(p.x, p.z) - R.hideDy;

/** Drawn: within `radius` m (x, z) of the viewer and (Phase 8B, verify-foundation #1) on the same side of the ground: a
 *  team in the Louvre room is no ghost for a team on the street and the other way round, while slopes (Trocadéro ≈ 36 m,
 *  Bir-Hakeim / Passy ≈ 18 m) hide nobody. `viewerUnder` undefined (spectator) = distance only. */
export const inView = (p: { x: number; y: number; z: number }, viewer: { x: number; z: number }, radius: number, viewerUnder?: boolean, heightAt?: (x: number, z: number) => number) =>
  Math.hypot(p.x - viewer.x, p.z - viewer.z) <= radius && (viewerUnder === undefined || !heightAt || underground(p, heightAt) === viewerUnder);

/** "0,10,-5,90,walk;1,…,bike;2,…,walk,wave" → peers (invalid groups dropped). */

export function parsePeers(v: string | null): FakePeer[] {
  return (v ?? '').split(';').flatMap((g) => {
    const [slot, x, z, yawDeg, mode, action = 'none'] = g.split(',');
    const n = [slot, x, z, yawDeg].map(Number);
    const m = MOVE_MODES.find((k) => k === mode);
    const a = PLAYER_ACTIONS.find((k) => k === action);
    return n.every(Number.isFinite) && m && a ? [{ slot: n[0]!, x: n[1]!, z: n[2]!, yaw: n[3]! * MathUtils.DEG2RAD, mode: m, action: a }] : [];
  });
}

const FAKE = { names: ['Đội Xanh', 'Đội Vàng', 'Đội Tím', 'Đội Cam'], colours: ['#2f7de1', '#e8c21c', '#8e44c9', '#f07f1d'], turn: 0.3 };

/** Teams for fake peers: names / colours of a stand-in race. */
export const fakeTeams = (peers: readonly FakePeer[]): TeamInfo[] =>
  peers.map((p, i) => ({ slot: p.slot, id: `t${p.slot}`, name: FAKE.names[i % FAKE.names.length]!, colour: FAKE.colours[i % FAKE.colours.length]!, online: true }));

/** The tick a server would send at `ms` (simulated clock): walkers go straight ahead at their mode's speed, riders at 60 %
 *  of the top speed along a circle (turn rate FAKE.turn: they lean); a peer with an action stands still and plays it,
 *  pauses 1 s, plays it again. */
export function fakeTick(peers: readonly FakePeer[], ms: number, groundAt: (x: number, z: number) => number): TickEntry[] {
  const t = ms / 1000;
  return peers.map((p) => {
    const speed = p.action !== 'none' ? 0 : { bike: 0.6 * bikeTopSpeed(), walk: movement.footSpeed, slow: movement.footSpeed * movement.slowWalkFactor, swim: 0, air: 0 }[p.mode];
    const w = p.mode === 'bike' ? FAKE.turn : 0;
    const yaw = p.yaw + w * t;
    const [x, z] = w
      ? [p.x + (speed / w) * (Math.cos(yaw) - Math.cos(p.yaw)), p.z - (speed / w) * (Math.sin(yaw) - Math.sin(p.yaw))]
      : [p.x - Math.sin(p.yaw) * speed * t, p.z - Math.cos(p.yaw) * speed * t];
    const g = p.action === 'none' ? 0 : playerSetup.actions[p.action].seconds;
    const action = g && t % (g + 1) < g ? p.action : 'none';
    return { slot: p.slot, pose: { x, y: groundAt(x, z), z, yaw: wrap(yaw), mode: p.mode, action } };
  });
}
