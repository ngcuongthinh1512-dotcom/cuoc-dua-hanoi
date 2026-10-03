// Phase 5 contract between the tracks (docs/plans/phase5.md §5). Changing it needs the integrator.
import type { ServerNotice } from '@race/shared/protocol';
import type { BikeRefusal } from '../vehicle/types.ts';

/** What every HUD widget reads, built once per frame by main.ts (player mode only: the spectator has no HUD). */
export interface HudFrame {
  /** Feet at the render pose, world m. */
  x: number;
  z: number;
  /** Camera heading, rad, PlayerState.yaw convention (0 = looking north / −Z, + = turned left): the minimap turns so
   *  this points up. */
  heading: number;
  /** Body heading (same convention): the player arrow on the maps. */
  bodyYaw: number;
  /** Horizontal m/s (minimap zoom, speedometer). */
  speed: number;
  riding: boolean;
  swimming: boolean;
  /** s of sim clock since Player.activate (fades). */
  time: number;
  /** Phase 7: total penalty minutes (the "PHẠT" row; SPEC §17.23: no team race clock). */
  penaltyMinutes?: number;
  /** Street under / nearest the feet (geo/locate.ts, with hysteresis); undefined = none within locate.maxDistance. */
  street: string | undefined;
  /** Arrondissement 1…20 (geo/districts.ts), 0 = none. */
  district: number;
}

export interface MapPoint {
  x: number;
  z: number;
}

/** GPS state the maps draw (geo/gps.ts writes it). */
export interface GpsView {
  /** The player's waypoint (full map click, URL ?gps=x,z); null = none. */
  readonly target: Readonly<MapPoint> | null;
  /** Route polyline x0, z0, x1, z1… (m) from the player's point on it to the target; null = no target / no route
   *  (then the maps draw the target only). */
  readonly route: Float32Array | null;
  /** m along `route` still to go; NaN without a route. */
  readonly remaining: number;
}

export const NO_GPS: GpsView = { target: null, route: null, remaining: NaN };

/** Short messages in the toast feed above the minimap (ui/Toasts.ts holds the Vietnamese texts). bikeStairs = the
 *  front wheel met a stair flight (SPEC §6.6); respawn / respawnStairs = "Kẹt? Về chỗ an toàn" / out of the Seine;
 *  Phase 6: the server's `notice` codes (claim lost, bike gone / parked, walk-only route). */
export type NoticeCode = BikeRefusal | ServerNotice | 'bikeStairs' | 'respawn' | 'respawnStairs';
