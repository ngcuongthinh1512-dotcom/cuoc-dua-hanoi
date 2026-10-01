// Track B (docs/plans/phase4.md §3.5–3.6): the bikes the local player can see and take. Phase 4: local dev bikes
// (bike.devSpawns around the spawn); Phase 6 fills the same list from the server (claims, parking, remote riders).
// F within bikeRules.interactRadius on foot takes + mounts (one bike per player: the old one disappears), F again gets off.
import RAPIER from '@dimforge/rapier3d-compat';
import { type Scene, Vector3 } from 'three';
import { bike as B, bikeRules as R, notices as N } from '../config.ts';
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

export class Bikes {
  readonly list: BikeState[] = [];
  private readonly models = new Map<string, BikeModel>();
  private n = 0;

  /** scene / asset null = no rendering (tests). */
  constructor(
    private readonly scene: Scene | null,
    private readonly asset: BikeAsset | null,
    readonly team: string,
    readonly colour: string,
    readonly playerId = 'local',
  ) {}

  add(x: number, y: number, z: number, yaw: number): BikeState {
    const b = newBike(`dev${this.n++}`, x, y, z, yaw);
    this.list.push(b);
    if (this.scene && this.asset) {
      const m = new BikeModel(this.asset);
      this.scene.add(m.root);
      this.models.set(b.id, m);
    }
    return b;
  }

  remove(b: BikeState) {
    this.list.splice(this.list.indexOf(b), 1);
    this.models.get(b.id)?.dispose();
    this.models.delete(b.id);
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
    const r = c.riding;
    if (r) {
      if (Math.abs(r.speed) > B.dismountMaxSpeed) return 'bikeTooFast';
      c.ride(null);
      r.rider = null;
      return 'dismount';
    }
    if (!canMount(c.state)) return null;
    const b = bikeInReach(this.list, c.state.position, this.team);
    if (!b) return bikeRefusal(this.list, c.state.position, this.team);
    this.take(b);
    b.rider = this.playerId;
    b.lean = 0; // picked up if it was lying after a crash
    c.ride(b);
    return 'mount';
  }

  /** Poses every model: the ridden one at the rider's render pose, parked ones sparkle when available and ≤
   *  bikeRules.sparkleRadius from `viewer`. Returns the rider's IK targets (null when on foot). */
  update(dt: number, viewer: Vector3, ridden: BikeState | null, riderPos: Vector3, riderYaw: number): RiderTargets | null {
    let targets: RiderTargets | null = null;
    for (const b of this.list) {
      const m = this.models.get(b.id);
      if (!m) continue;
      m.root.visible = b.rider === null || b.owner === this.team; // Phase 6: another team's ridden bike is net/RemotePlayers'
      if (b === ridden) {
        m.update({ ...b, position: riderPos, yaw: riderYaw }, false, dt);
        targets = m.riderTargets();
      } else m.update(b, b.owner === null && b.position.distanceTo(viewer) <= R.sparkleRadius, dt);
    }
    return targets;
  }
}
