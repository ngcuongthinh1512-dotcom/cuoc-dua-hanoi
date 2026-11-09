// Where each step of a leg is done (SPEC §8.1–8.2), in world metres. Pure; the Durable Object checks poses against these,
// `npm run leg:check` walks them on the road graph.
import { latLonToWorld } from '../projection.ts';
import { LEG_LIMITS, type Destination, type Leg } from './schema.ts';

export interface Zone {
  x: number;
  z: number;
  /** Geofence radius, m. */
  r: number;
  /** destination / task location name (Host only: never sent to a team before the step is done). */
  name: string;
  /** SPEC §6.4 rack id, keyed by the POINT (rounded centre), not by the step: several steps done at one point (a route's
   *  box, then a challenge / detour there) share one rack, so vehicles.bikeParking.maxBikes counts right. */
  rack: string;
  /** Where that rack stands (the point's bikeParking), null = none in the file (the bike stays where it stands). */
  parking: { x: number; z: number } | null;
  /** Phase 8 (D7): heading of the box's front, rad (destination.yawDeg; 0 = north, + = left / west, like PlayerState.yaw). */
  yaw: number;
  /** SPEC §17.38: the Pit Stop's zone: "inside" = on the PIT_MAT rectangle (long axis along yaw), not within r. */
  mat?: true;
}

const rackId = (x: number, z: number) => `rack:${Math.round(x)}_${Math.round(z)}`;

const xz = (p: { lat: number; lon: number }) => {
  const w = latLonToWorld(p.lat, p.lon);
  return { x: w.x, z: w.z };
};

const zone = (d: Destination, mat = false): Zone => {
  const p = latLonToWorld(d.lat, d.lon);
  return { x: p.x, z: p.z, r: d.radius, name: d.name, rack: rackId(p.x, p.z), parking: d.bikeParking ? xz(d.bikeParking) : null, yaw: (d.yawDeg * Math.PI) / 180, ...(mat && { mat }) };
};

/** Index-aligned with leg.steps:
 *  - route_info → its destination, except the route right before the Pit Stop → the Pit Stop's (SPEC §8.1: that route is
 *    done by stepping onto the Pit Stop mat);
 *  - pit_stop → its destination (the mat: `mat` set, SPEC §17.38);
 *  - challenge → task.location, else where the team already is (the zone of the step before);
 *  - detour → the zone of the step before (each branch may have its own: branchZone). */
export function stepZones(leg: Leg): Zone[] {
  const out: Zone[] = [];
  const s0 = latLonToWorld(leg.start.lat, leg.start.lon);
  let prev: Zone = { x: s0.x, z: s0.z, r: LEG_LIMITS.radiusMax, name: leg.start.name, rack: rackId(s0.x, s0.z), parking: null, yaw: 0 };
  leg.steps.forEach((s, i) => {
    const next = leg.steps[i + 1];
    const z =
      s.type === 'route_info' ? (next?.type === 'pit_stop' ? zone(next.destination, true) : zone(s.destination))
      : s.type === 'pit_stop' ? zone(s.destination, true)
      : s.type === 'challenge' && s.task.location ? zone(s.task.location)
      : prev;
    out.push(z);
    prev = z;
  });
  return out;
}

/** The zone of a detour branch's task (its own location, else the detour's zone). */
export function branchZone(leg: Leg, zones: readonly Zone[], step: number, branch: string): Zone | null {
  const s = leg.steps[step];
  if (s?.type !== 'detour') return null;
  const b = s.branches.find((x) => x.id === branch);
  return b ? (b.task.location ? zone(b.task.location) : zones[step]!) : null;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** SPEC §17.12: where the team with start order `order` (1, 2, …) first appears — spread over leg.start.spreadMeters
 *  (sunflower pattern: no two of the first 8 closer than ~1.5 m at 5 m) so name tags of teams arriving together do not
 *  stack; heading leg.start.yawDeg (rad here). */
export function startSpot(leg: Leg, order: number): { x: number; z: number; yaw: number } {
  const p = latLonToWorld(leg.start.lat, leg.start.lon);
  const k = Math.max(0, order - 1);
  const r = leg.start.spreadMeters * Math.sqrt(((k % 8) + 0.5) / 8);
  const a = k * GOLDEN;
  return { x: p.x + r * Math.cos(a), z: p.z + r * Math.sin(a), yaw: (leg.start.yawDeg * Math.PI) / 180 };
}

/** m between two rows of a fixed fleet: a bike's length (≈ 1.8 m) + room to walk between the rows. */
export const FIXED_ROW_GAP = 2.5;

/** vehicles.fixedBikes → world spots, per fleet: `rows` rows centred on lat, lon (the last one shorter), bikes `spacing` m
 *  apart along the row direction angleDeg (0 = east, + = towards north), each facing across the row (yaw like
 *  PlayerState.yaw: 0 = north, + = west), rounded to cm. */
export function fixedBikeSpots(fleets: Leg['vehicles']['fixedBikes']): { x: number; z: number; yaw: number }[][] {
  return fleets.map((f) => {
    const c = latLonToWorld(f.lat, f.lon);
    const a = (f.angleDeg * Math.PI) / 180;
    const [ux, uz, vx, vz] = [Math.cos(a), -Math.sin(a), -Math.sin(a), -Math.cos(a)]; // along the row, then the bikes' facing
    const per = Math.ceil(f.count / f.rows);
    const rows = Math.ceil(f.count / per); // 4 bikes in 3 rows = 2 rows of 2
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return Array.from({ length: f.count }, (_, k) => {
      const [r, i] = [Math.floor(k / per), k % per];
      const inRow = Math.min(per, f.count - r * per);
      const [u, v] = [(i - (inRow - 1) / 2) * f.spacing, (r - (rows - 1) / 2) * FIXED_ROW_GAP];
      return { x: r2(c.x + ux * u + vx * v), z: r2(c.z + uz * u + vz * v), yaw: a };
    });
  });
}
