// Phase 4 contract between the tracks (docs/plans/phase4.md §5). Changing it needs the integrator.
import type { Vector3 } from 'three';

/** One bicycle in the world. Phase 4: local dev bikes (track B, vehicle/Bikes.ts); Phase 6 rebuilds the same state from
 *  the server (shared bikes, claims, parking) and from snapshots of remote riders. */
export interface BikeState {
  readonly id: string;
  /** Ground contact under the bottom bracket (the model pivot), world m. */
  readonly position: Vector3;
  /** Heading, rad, PlayerState convention: 0 = north (−Z), + = turned left. */
  yaw: number;
  /** m/s along the heading (+ forward, − slow reverse). */
  speed: number;
  /** Front wheel angle, rad, + = steering left (visual; the physics turns by turn rate). */
  steer: number;
  /** Roll, rad, + = leaning right (into a right turn). */
  lean: number;
  /** Accumulated rotations, rad: wheel = distance / wheel radius, crank = wheel / gear ratio (bikeModel). */
  wheelAngle: number;
  crankAngle: number;
  /** Team holding it (Phase 6 claim; its one bike), null = none. §17.34: no lock, anyone may take a bike nobody rides. */
  owner: string | null;
  /** Player id riding it now, null = parked (standing on its stand). */
  rider: string | null;
}

/** World-space IK targets on a posed bike (BikeModel.riderTargets), for the rider's legs, hands and pelvis. */
export interface RiderTargets {
  readonly saddle: Vector3;
  readonly pedalL: Vector3;
  readonly pedalR: Vector3;
  readonly gripL: Vector3;
  readonly gripR: Vector3;
}

/** What the controller needs to know about the surface under a wheel (track C: RoadGraph.surfaceAt). */
export type RoadSurface = 'asphalt' | 'pave';

/** Phase 5 (docs/plans/phase5.md §5): why F did nothing (Bikes.interact) → a toast (ui/Toasts.ts notice). tooFast = riding
 *  above bike.dismountMaxSpeed; tooFar = a takeable bike near but beyond bikeRules.interactRadius; taken = a bike
 *  someone rides in reach (§17.34: no owner lock any more). */
export type BikeRefusal = 'bikeTooFast' | 'bikeTooFar' | 'bikeTaken';
