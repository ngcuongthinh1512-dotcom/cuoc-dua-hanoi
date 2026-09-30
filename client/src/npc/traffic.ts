// STUB (foundation, docs/plans/phase4b.md §4): track B replaces the body, keeping the signatures of §5.2.
// No cars move, no lights; park() places a car that stands still (?npcTest), so D can build against it.
import type { CarKind, CarPose, ExclusionZone, LightQuery, NpcAnchor, PedPose } from './types.ts';
import { NO_LIGHTS } from './types.ts';
import type { NpcRoads } from './roads.ts';

export class Traffic {
  readonly cars: CarPose[] = [];
  readonly lights: LightQuery = NO_LIGHTS;
  readonly time: number = 0; // s simulated
  zones: readonly ExclusionZone[] = [];

  constructor(
    private readonly roads: NpcRoads,
    _seed: number,
  ) {}

  step(_dt: number, _anchor: NpcAnchor, _density: number, _peds: readonly PedPose[], _fill?: boolean): void {}

  /** ?npcTest: a car that never moves and never despawns. */
  park(kind: CarKind, x: number, z: number, yaw: number): CarPose {
    const car: CarPose = { id: this.cars.length, kind, paint: 0x8d9296, x, y: this.roads.heightAt(x, z), z, yaw, pitch: 0, speed: 0, wheel: 0, braking: false };
    this.cars.push(car);
    return car;
  }
}
