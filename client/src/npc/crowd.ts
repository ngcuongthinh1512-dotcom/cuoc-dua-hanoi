// STUB (foundation, docs/plans/phase4b.md §4): track C replaces the body, keeping the signatures of §5.2.
// Nobody walks, no seats.
import type { CarPose, ExclusionZone, LightQuery, NpcAnchor, PedPose, Seat } from './types.ts';
import { NO_LIGHTS } from './types.ts';
import type { NpcRoads } from './roads.ts';

export class Crowd {
  readonly peds: PedPose[] = [];
  lights: LightQuery = NO_LIGHTS; // D sets traffic.lights
  zones: readonly ExclusionZone[] = [];

  constructor(_roads: NpcRoads, _seed: number) {}

  /** knocked = pedestrians the bike nose hit this step (D: the player crashes, §17.11). */
  step(_dt: number, _anchor: NpcAnchor, _density: number, _cars: readonly CarPose[], _fill?: boolean): { knocked: number } {
    return { knocked: 0 };
  }

  /** Seats within r m of (x, z), deterministic from the graph (chairs drawn whether used or not). */
  seatsNear(_x: number, _z: number, _r: number): readonly Seat[] {
    return [];
  }
}
