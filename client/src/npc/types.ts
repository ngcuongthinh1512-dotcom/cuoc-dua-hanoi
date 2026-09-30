// Phase 4B contract between the tracks (docs/plans/phase4b.md §5.1). Changing it needs the integrator.
// Pure data: the sims (traffic.ts, crowd.ts) are three- and Rapier-free and step deterministically in fixedUpdate.
import type { npc } from '../config.ts';

export type CarKind = keyof typeof npc.vehicles; // city hatchback sedan suv taxi van truck bus scooter moto

/** Circle NPCs keep clear of (Phase 7: clue-box / finish-mat geofence); + npc.zoneMargin. */
export interface ExclusionZone { x: number; z: number; r: number }

/** What the NPCs live around and react to, rebuilt every fixed step (D). */
export interface NpcAnchor {
  x: number; z: number;          // player feet (or the spectator camera's ground point)
  viewYaw: number;               // camera heading (PlayerState convention): no pop-in inside the view cone
  body: boolean;                 // false = spectator: nothing to brake for / dodge
  vx: number; vz: number;
  nose: { x: number; z: number } | null; // riding: front wheel (feet + heading × bike.wheelBase)
  waving: boolean;               // G this step: pedestrians close by wave back
}

export interface CarPose {
  readonly id: number; readonly kind: CarKind; readonly paint: number; // sRGB 0xRRGGBB
  x: number; y: number; z: number; // ground under the middle of the wheelbase
  yaw: number; pitch: number;      // 0 = north (−Z), + = left; + = nose up
  speed: number; wheel: number;    // m/s; m rolled (the renderer divides by the model's wheelRadius: one radius for sim + draw)
  braking: boolean;
}

export type PedActivity = 'walk' | 'stand' | 'lookAround' | 'phone' | 'wave' | 'sit';
export interface PedPose {
  readonly id: number; readonly avatar: number; // 0 … avatars − 1 (npc-peds.glb order)
  x: number; y: number; z: number; yaw: number; speed: number;
  activity: PedActivity; activityTime: number;  // s since it started (clip phase, deterministic)
  stagger: number; staggerYaw: number;          // s since knocked (−1 = not); direction pushed toward
}

export type LightColour = 'green' | 'amber' | 'red';
/** One signal head per arriving edge of a lit node. (x, z) = the pole foot, already on the right kerb OUTSIDE the
 *  carriageway (centre line + halfWidth + traffic.lights.kerb, level with the stop line); yaw = where the lamps look
 *  (PlayerState convention, 0 = north / −Z, + = left) = TOWARD the oncoming cars, i.e. against their travel direction.
 *  The renderer places the pole exactly at (x, z), no extra offset. */
export interface SignalHead { readonly x: number; readonly z: number; readonly yaw: number; readonly junction: number; readonly edge: number }
export interface LightQuery {
  car(junction: number, edge: number): LightColour;       // cars arriving at `junction` along `edge`
  pedMayCross(junction: number, edge: number): boolean;   // true where there is no light
  headsNear(x: number, z: number, r: number): readonly SignalHead[];
}
export interface Seat { readonly x: number; readonly z: number; readonly yaw: number }

/** No traffic lights anywhere: Crowd.lights until D hands it traffic.lights (and the traffic stub's). */
export const NO_LIGHTS: LightQuery = { car: () => 'green', pedMayCross: () => true, headsNear: () => [] };

/** Rapier groups: NPC car colliders = membership bit 1; queries with IGNORE_NPC skip them. */
export const NPC_GROUPS = 0x0002_ffff;
export const IGNORE_NPC = 0xffff_fffd;
