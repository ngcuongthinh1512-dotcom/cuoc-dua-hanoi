// Phase 6 track C (docs/plans/phase6.md §6 C): shared bikes, SPEC §6.2–6.4. Pure and deterministic (seeded), no
// `cloudflare:workers` import, so Vitest runs it in Node. The Durable Object owns the clock, the SQLite rows and the
// sockets; this module only decides. The Host browser computes the candidates (A* corridors on roadgraph.json) and sends
// them as `host.candidates`; nothing here touches the road graph (CLAUDE.md: no heavy compute in the DO).
import type { BikeInfo } from '@race/shared/protocol';
import type { VehiclesConfig } from './leg.ts';

/** One bike as the server keeps it (bikes.data JSON). */
export interface ServerBike extends BikeInfo {
  /** Route segment index it was spawned for, −1 = decoy (SPEC §6.2 (6)), −2 = put there by the Host. */
  segment: number;
  /** ms when the owner was last within vehicles.abandonMeters (SPEC §6.3: abandonSeconds beyond → gone). Memory only in
   *  effect: reset to "now" when the Durable Object reloads the rows, so a restart never makes a bike vanish at once. */
  nearOwnerAt: number;
  /** Step id of the rack it stands at (SPEC §6.4), null on the street. */
  rack: string | null;
  /** ms it was put at its rack (a full rack drops the longest parked one). */
  parkedAt?: number;
  spawnedAt: number;
}

/** Spawn points per route segment ([x, z, x, z…] m, bicycle parking first) + decoy points anywhere else. */
export interface SpawnCandidates {
  segments: number[][];
  decoys: number[];
}

/** What the spawner needs to know about a player (online ones only). */
export interface PlayerSpot {
  team: string;
  x: number;
  z: number;
}

export interface SpawnerState {
  seed: number;
  /** Draws so far (the RNG position; persisted in meta so a restart continues the same sequence). */
  draws: number;
  paused: boolean;
}

export type ClaimResult = { ok: true } | { ok: false; reason: 'taken' | 'far' | 'walkOnly' | 'finished' | 'gone' | 'broken' };

/** m between the claimer's last pose and the bike: bikeRules.interactRadius (2.5, client) + 1 m for a 5 Hz pose lag. */
export const CLAIM_REACH = 3.5;
/** m: how far the team's own standing bike may be from its last pose — where a dismount put it (believed within this,
 *  BikeService) or where the last 1 s tick left it when the team dropped offline (≤ 1 s at bikeTopSpeed 5.2 m/s). */
export const OWN_REACH = 10;
/** m: no new bike this close to another one. */
export const MIN_GAP = 3;
/** mulberry32's increment: draw n of rng(seed) = the first draw of rng(seed + n · K). */
const K = 0x6d2b79f5;

/** mulberry32 (same as client/src/npc/rng.ts) so a seed replays the race's spawns. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + K) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The race's random sequence from position state.draws on; every call advances state.draws (restart = same sequence). */
export function stream(state: SpawnerState): () => number {
  const next = rng((state.seed + Math.imul(state.draws, K)) >>> 0);
  return () => (state.draws++, next());
}

/** A uniformly chosen point of `pts` that is ≥ noSpawnNearPlayerMeters from every player and ≥ MIN_GAP from every bike. */
function pick(cfg: VehiclesConfig, pts: readonly number[], bikes: readonly ServerBike[], players: readonly PlayerSpot[], rand: () => number) {
  const ok: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const [x, z] = [pts[i]!, pts[i + 1]!];
    if (players.some((p) => Math.hypot(p.x - x, p.z - z) < cfg.noSpawnNearPlayerMeters)) continue;
    if (!bikes.some((b) => Math.hypot(b.x - x, b.z - z) < MIN_GAP)) ok.push(i);
  }
  const i = ok[Math.floor(rand() * ok.length)];
  return i === undefined ? null : [pts[i]!, pts[i + 1]!];
}

/** A free bike standing at (x, z); y 0 = unknown (the server has no DEM): clients put it on their ground. */
export const newBike = (id: string, x: number, z: number, yaw: number, segment: number, now: number): ServerBike => ({
  id, x, y: 0, z, yaw, owner: null, rider: false, parked: false, segment, nearOwnerAt: now, rack: null, spawnedAt: now,
});

const isFree = (b: ServerBike) => b.owner === null && b.rack === null;

/** One spawn round: `count(i)` bikes on segment i, each followed by decoys while rand() < decoyRatio (mean r / (1 − r)
 *  per route bike → decoys / all ≈ decoyRatio), free decoys capped at segments × maxAvailablePerSegment. */
function round(cfg: VehiclesConfig, cands: SpawnCandidates, state: SpawnerState, bikes: readonly ServerBike[], players: readonly PlayerSpot[], now: number, count: (i: number, rand: () => number) => number) {
  const rand = stream(state);
  const out: ServerBike[] = [];
  let decoyRoom = cands.segments.length * cfg.maxAvailablePerSegment - bikes.filter((b) => b.segment === -1 && isFree(b)).length;
  const add = (pts: readonly number[], segment: number) => {
    const p = pick(cfg, pts, [...bikes, ...out], players, rand);
    if (p) out.push(newBike(`b${state.draws}`, p[0]!, p[1]!, rand() * 2 * Math.PI, segment, now)); // id: unique, replayable
    return !!p;
  };
  cands.segments.forEach((pts, i) => {
    for (let n = count(i, rand); n > 0; n--) {
      if (!add(pts, i)) break;
      while (decoyRoom > 0 && rand() < cfg.decoyRatio) {
        decoyRoom--;
        add(cands.decoys, -1);
      }
    }
  });
  return out;
}

/** Start of the race (SPEC §6.2 (3)): initialPerSegment [min, max] bikes per segment + decoys by decoyRatio. */
export function initialSpawn(cfg: VehiclesConfig, cands: SpawnCandidates, state: SpawnerState, players: readonly PlayerSpot[], now: number): ServerBike[] {
  const [lo, hi] = cfg.initialPerSegment as [number, number];
  return round(cfg, cands, state, [], players, now, (_, rand) => lo + Math.floor(rand() * (hi - lo + 1)));
}

/** One alarm tick (SPEC §6.2 (4)–(5)): per segment with chance spawnChance when fewer than maxAvailablePerSegment free
 *  street bikes (racks don't count), never within noSpawnNearPlayerMeters of a player. */
export function periodicSpawn(cfg: VehiclesConfig, cands: SpawnCandidates, state: SpawnerState, bikes: readonly ServerBike[], players: readonly PlayerSpot[], now: number): ServerBike[] {
  if (state.paused) return [];
  const free = (i: number) => bikes.filter((b) => b.segment === i && isFree(b)).length;
  return round(cfg, cands, state, bikes, players, now, (i, rand) => (free(i) < cfg.maxAvailablePerSegment && rand() < cfg.spawnChance ? 1 : 0));
}

/** F on a bike (SPEC §6.3), also re-mounting the team's own bike: atomic because the Durable Object runs one message at a
 *  time, so the first claim wins. `at` = the claimer's last pose (null = unknown → too far). */
export function claim(bike: ServerBike | undefined, team: string, at: PlayerSpot | null, blocked: false | 'walkOnly' | 'finished'): ClaimResult {
  if (!bike) return { ok: false, reason: 'gone' };
  if (bike.segment === -1) return { ok: false, reason: 'broken' }; // decoy (SPEC §17.30): never granted, never changed
  if (bike.rider && bike.owner !== team) return { ok: false, reason: 'taken' }; // §17.34: no owner lock, only a rider holds it
  if (blocked) return { ok: false, reason: blocked };
  // A ridden bike (here only ever the claimer's own) follows its rider on the server (BikeService.tick); a standing one,
  // own included, must be in reach of the claimer's last pose: nobody summons a bike from afar.
  const reach = bike.owner === team ? OWN_REACH : CLAIM_REACH;
  if (!bike.rider && (!at || Math.hypot(at.x - bike.x, at.z - bike.z) > reach)) return { ok: false, reason: 'far' };
  return { ok: true };
}

/** Ids of bikes whose owner has been > abandonMeters away for abandonSeconds (SPEC §6.3). Updates nearOwnerAt: ridden,
 *  owner offline (not in `players`) or near = "now" (offline owners don't count, and coming back gives a fresh minute). */
export function abandoned(cfg: VehiclesConfig, bikes: readonly ServerBike[], players: readonly PlayerSpot[], now: number): string[] {
  const out: string[] = [];
  for (const b of bikes) {
    if (b.owner === null) continue;
    const p = players.find((q) => q.team === b.owner);
    if (b.rider || !p || Math.hypot(p.x - b.x, p.z - b.z) <= cfg.abandonMeters) b.nearOwnerAt = now;
    else if (now - b.nearOwnerAt >= cfg.abandonSeconds * 1000) out.push(b.id);
  }
  return out;
}
