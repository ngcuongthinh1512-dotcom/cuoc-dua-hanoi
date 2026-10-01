// Track B (docs/plans/phase4.md §3.5–3.6): the bikes the local player can see and take. Phase 4: local dev bikes
// (bike.devSpawns around the spawn). Phase 6 track C (docs/plans/phase6.md §3 decision 14): online (`net` set) the list
// is the server's shared bikes (applyServer), F asks the server (claim → onClaimResult) and the rider state of the team's
// own bike is reported back (update → mount / dismount). Offline nothing changes (presets, ride-check).
// F within bikeRules.interactRadius on foot takes + mounts (one bike per player: the old one disappears), F again gets off.
import RAPIER from '@dimforge/rapier3d-compat';
import type { BikeInfo, ClientMessage, ServerMessage, TeamInfo } from '@race/shared/protocol';
import { type Scene, Vector3 } from 'three';
import { bike as B, bikeRules as R, notices as N, serverBikes as S } from '../config.ts';
import type { CharacterController } from '../player/CharacterController.ts';
import { IGNORE_NPC } from '../npc/types.ts';
import type { PlayerState } from '../player/types.ts';
import { type BikeAsset, BikeModel } from './BikeModel.ts';
import type { BikeRefusal, BikeState, RiderTargets } from './types.ts';

/** On foot, on the ground, no gesture running (SPEC §6.3: "đang đi bộ"). */
export const canMount = (s: Readonly<PlayerState>) =>
  (s.moveMode === 'walk' || s.moveMode === 'slow') && s.grounded && !s.inWater && s.action === 'none';

export const newBike = (id: string, x: number, y: number, z: number, yaw: number): BikeState => ({
  id, position: new Vector3(x, y, z), yaw, speed: 0, steer: 0, lean: 0, wheelAngle: 0, crankAngle: 0, owner: null, ownerColour: null, rider: null,
});

const distance = (b: BikeState, feet: Vector3) => Math.hypot(b.position.x - feet.x, b.position.y - feet.y, b.position.z - feet.z);

/** Nearest parked bike within interactRadius of the feet that `team` may take: available or already its own. */
export function bikeInReach(bikes: readonly BikeState[], feet: Vector3, team: string): BikeState | undefined {
  let best: BikeState | undefined;
  let bestD = R.interactRadius;
  for (const b of bikes) {
    const d = distance(b, feet);
    if (!b.rider && (b.owner === null || b.owner === team) && d <= bestD) [best, bestD] = [b, d];
  }
  return best;
}

/** Why F on foot found nothing to take (asked when bikeInReach found none): another team's bike in reach = 'bikeTaken'; a bike
 *  `team` may take beyond interactRadius but within notices.farReach = 'bikeTooFar'; else null (F stays silent: from Phase 7
 *  it also opens clue boxes). */
export function bikeRefusal(bikes: readonly BikeState[], feet: Vector3, team: string): BikeRefusal | null {
  let far = false;
  for (const b of bikes) {
    const d = distance(b, feet);
    if (b.owner !== null && b.owner !== team) {
      if (d <= R.interactRadius) return 'bikeTaken';
    } else if (!b.rider && d <= N.farReach) far = true;
  }
  return far ? 'bikeTooFar' : null;
}

/** Top of the highest collider under (x, z) (ray from `from` down 20 m; NPC cars ignored), or null. */
export function groundAt(world: RAPIER.World, x: number, z: number, from: number, exclude?: RAPIER.Collider): number | null {
  const ray = new RAPIER.Ray({ x: x + 0.001, y: from, z: z + 0.001 }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 20, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, IGNORE_NPC, exclude);
  return hit ? from - hit.timeOfImpact : null;
}

/** BikeState.rider of a bike another team rides: its model is hidden (net/RemotePlayers draws it under the rider). */
export const REMOTE_RIDER = 'remote';
/** Why the server refused F (SPEC §6.3 "Chậm một bước! Xe đã có người lấy.", §6.5) → a toast (ui/Toasts.ts notice). */
export type ClaimNotice = 'bikeLost' | 'bikeTooFar' | 'walkOnly';
type BikeAnswer = Extract<ServerMessage, { t: 'bike' }>;

export class Bikes {
  readonly list: BikeState[] = [];
  private readonly models = new Map<string, BikeModel>();
  private n = 0;
  /** Online (main.ts sets it): the shared bikes come from the server and F asks it. null = offline dev bikes. */
  net: { send(m: Extract<ClientMessage, { t: 'bike' }>): void } | null = null;
  /** Online: the top of the ground at (x, z) for a server bike (y = the server's, 0 = unknown: it has no DEM), null
   *  while that ground is not loaded. main.ts: groundAt(world, x, z, max(y, heightAt(x, z)) + 3). */
  ground: ((x: number, z: number, y: number) => number | null) | null = null;
  /** A refused claim → toast (main.ts: notice). */
  notify: (code: ClaimNotice) => void = () => {};
  private readonly colours = new Map<string, string>();
  /** The claim in flight (F → server → onClaimResult), timed by `clock`. */
  private pending: { id: string; at: number } | null = null;
  /** Own bikes the server believes ridden (from its lists and what we sent): update() reports any difference. */
  private readonly serverRiding = new Set<string>();
  /** Server bikes not yet put on the local ground (hidden until then). */
  private readonly unplaced = new Set<string>();
  private clock = 0;
  /** The local player's controller (the last one F was pressed with): a claim granted later mounts it. */
  private c: CharacterController | null = null;
  /** DEV ?bikes=free,other,mine,ridden,lost: the dev bikes become server-like stand-ins in that order (p6 presets). */
  private standIns = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('bikes') : null;

  /** scene / asset null = no rendering (tests). team = the team id online (main.ts), its name offline. */
  constructor(
    private readonly scene: Scene | null,
    private readonly asset: BikeAsset | null,
    public team: string,
    public colour: string,
    readonly playerId = 'local',
  ) {}

  add(x: number, y: number, z: number, yaw: number, id = `dev${this.n++}`): BikeState {
    const b = newBike(id, x, y, z, yaw);
    this.list.push(b);
    if (this.scene && this.asset) {
      const m = new BikeModel(this.asset);
      this.scene.add(m.root);
      this.models.set(b.id, m);
    }
    return b;
  }

  remove(b: BikeState) {
    if (this.c?.riding === b) this.getOff(this.c, b); // the server took it away under us
    this.list.splice(this.list.indexOf(b), 1);
    this.models.get(b.id)?.dispose();
    this.models.delete(b.id);
    this.serverRiding.delete(b.id);
    this.unplaced.delete(b.id);
  }

  /** Claims `b` for the team; beyond bikeRules.maxPerPlayer the team's oldest other bikes disappear (SPEC §6.3). */
  take(b: BikeState) {
    const others = this.list.filter((o) => o !== b && o.owner === this.team);
    for (const o of others.slice(0, Math.max(0, others.length - (R.maxPerPlayer - 1)))) this.remove(o);
    b.owner = this.team;
    b.ownerColour = this.colour;
  }

  /** F: get off (at ≤ bike.dismountMaxSpeed) or take + mount the bike in reach. What happened, why nothing did
   *  (BikeRefusal → toast, Phase 5), or null (nothing to do, silent). */
  interact(c: CharacterController): 'mount' | 'dismount' | BikeRefusal | null {
    this.c = c;
    const r = c.riding;
    if (r) {
      if (Math.abs(r.speed) > B.dismountMaxSpeed) return 'bikeTooFast';
      this.getOff(c, r);
      return 'dismount';
    }
    if (!canMount(c.state)) return null;
    const b = bikeInReach(this.list, c.state.position, this.team);
    if (!b) return bikeRefusal(this.list, c.state.position, this.team);
    if (this.net) {
      // Online the server decides (atomic, SPEC §6.3); onClaimResult mounts. Silent until it answers.
      if (this.pending && this.clock - this.pending.at < S.claimTimeoutMs / 1000) return null;
      this.pending = { id: b.id, at: this.clock };
      this.net.send({ t: 'bike', op: 'claim', id: b.id });
      return null;
    }
    this.mount(c, b);
    return 'mount';
  }

  private mount(c: CharacterController, b: BikeState) {
    this.take(b);
    b.rider = this.playerId;
    b.lean = 0; // picked up if it was lying after a crash
    c.ride(b);
  }

  private getOff(c: CharacterController, b: BikeState) {
    if (c.riding === b) c.ride(null);
    b.rider = null;
  }

  // ── Phase 6: server bikes ──

  /** Team id → colour for the lock markers (welcome.teams). */
  setTeams(teams: readonly TeamInfo[]) {
    for (const t of teams) this.colours.set(t.id, t.colour);
    for (const b of this.list) b.ownerColour = this.colourOf(b.owner);
  }

  private colourOf(owner: string | null) {
    return owner === null ? null : owner === this.team ? this.colour : (this.colours.get(owner) ?? null);
  }

  /** Server bikes: `welcome.bikes` (full: everything else goes) or a `bikes` message (changed ones + gone ids). The bike
   *  the local player rides keeps its local pose; another team's ridden bike is hidden (drawn under its rider). */
  applyServer(list: readonly BikeInfo[], gone: readonly string[] = [], full = false) {
    const keep = new Set(list.map((s) => s.id));
    for (const b of [...this.list]) if (gone.includes(b.id) || (full && !keep.has(b.id))) this.remove(b);
    for (const s of list) {
      const old = this.list.find((o) => o.id === s.id);
      const b = old ?? this.add(s.x, s.y, s.z, s.yaw, s.id);
      const mine = s.owner === this.team;
      if (mine && s.rider) this.serverRiding.add(s.id);
      else this.serverRiding.delete(s.id);
      const here = this.c?.riding === b;
      if (here && !mine) this.getOff(this.c!, b); // parked / released by the server
      b.owner = s.owner;
      b.ownerColour = this.colourOf(s.owner);
      if (here && mine) continue;
      b.rider = s.rider && !mine ? REMOTE_RIDER : null; // own bike "ridden" but not here (reconnect): parked, update() reports it
      if (!old || b.position.x !== s.x || b.position.z !== s.z || b.position.y !== s.y) {
        b.position.set(s.x, s.y, s.z);
        b.yaw = s.yaw;
        if (this.ground) this.unplaced.add(b.id);
      }
    }
  }

  /** The server's answer to a claim (or to a mount update()). Granted → mount if still on foot next to it; refused → the
   *  toast via notify, and off the bike if it was the one being ridden. */
  onClaimResult(m: BikeAnswer) {
    const b = this.list.find((o) => o.id === m.id);
    const asked = this.pending?.id === m.id;
    if (asked) this.pending = null;
    if (m.ok) {
      this.serverRiding.add(m.id);
      const c = this.c;
      if (asked && b && c && !c.riding && b.rider === null && canMount(c.state) && distance(b, c.state.position) <= R.interactRadius + 1) this.mount(c, b);
      return;
    }
    this.serverRiding.delete(m.id);
    if (b && this.c?.riding === b) this.getOff(this.c, b);
    this.notify(m.reason === 'far' ? 'bikeTooFar' : m.reason === 'walkOnly' ? 'walkOnly' : 'bikeLost');
  }

  /** Online, once a frame: tells the server when the own bike's rider state differs from what it knows (a dismount, a
   *  crash, the Seine, a respawn, a claim granted after walking off; mount after it dropped a rider it thought offline),
   *  and puts server bikes near `viewer` on the ground. */
  private sync(viewer: Vector3, ridden: BikeState | null) {
    if (this.pending && this.clock - this.pending.at >= S.claimTimeoutMs / 1000) this.pending = null;
    for (const b of this.list) {
      if (b.owner !== this.team || this.pending?.id === b.id) continue;
      const riding = b === ridden;
      if (riding === this.serverRiding.has(b.id)) continue;
      const { x, y, z } = b.position;
      this.net?.send(riding ? { t: 'bike', op: 'mount', id: b.id } : { t: 'bike', op: 'dismount', id: b.id, x, y, z, yaw: b.yaw });
      if (riding) this.serverRiding.add(b.id);
      else this.serverRiding.delete(b.id);
    }
    for (const id of this.unplaced) {
      const b = this.list.find((o) => o.id === id)!;
      if (Math.hypot(b.position.x - viewer.x, b.position.z - viewer.z) > S.groundRadius) continue;
      const y = this.ground?.(b.position.x, b.position.z, b.position.y);
      if (y === null || y === undefined) continue;
      b.position.y = y;
      this.unplaced.delete(id);
    }
  }

  /** DEV stand-ins (no server in screenshots): the dev bikes, once placed, become shared bikes of these kinds in order —
   *  free (sparkles), other (another team's: lock), mine (own, lock in the team colour), ridden (another team rides it:
   *  hidden), lost (free, and a claim on it was just refused: toast). */
  private applyStandIns() {
    const kinds = this.standIns!.split(',');
    this.standIns = null;
    this.setTeams([{ slot: 1, id: 'standin', name: 'Đội Xanh', colour: '#2c6bd8', online: true }]);
    const owner = { other: 'standin', ridden: 'standin', mine: this.team } as Record<string, string>;
    this.applyServer(this.list.slice(0, kinds.length).map((b, i) => ({
      id: b.id, x: b.position.x, y: b.position.y, z: b.position.z, yaw: b.yaw, owner: owner[kinds[i]!] ?? null, rider: kinds[i] === 'ridden', parked: false,
    })), [], true);
    const lost = this.list[kinds.indexOf('lost')];
    if (lost) this.onClaimResult({ t: 'bike', op: 'claim', id: lost.id, ok: false, reason: 'taken' });
  }

  /** Poses every model: the ridden one at the rider's render pose, parked ones sparkle when available and ≤
   *  bikeRules.sparkleRadius from `viewer`. Returns the rider's IK targets (null when on foot). */
  update(dt: number, viewer: Vector3, ridden: BikeState | null, riderPos: Vector3, riderYaw: number): RiderTargets | null {
    this.clock += dt;
    if (this.standIns && this.list.length) this.applyStandIns();
    if (this.net) this.sync(viewer, ridden);
    let targets: RiderTargets | null = null;
    for (const b of this.list) {
      if (b.rider === this.playerId && b !== ridden) b.rider = null; // thrown off / dropped (Seine, respawn)
      const m = this.models.get(b.id);
      if (!m) continue;
      m.root.visible = b.rider !== REMOTE_RIDER && !this.unplaced.has(b.id);
      if (b === ridden) {
        m.update({ ...b, position: riderPos, yaw: riderYaw }, false, dt);
        targets = m.riderTargets();
      } else m.update(b, b.owner === null && b.position.distanceTo(viewer) <= R.sparkleRadius, dt);
    }
    return targets;
  }
}
