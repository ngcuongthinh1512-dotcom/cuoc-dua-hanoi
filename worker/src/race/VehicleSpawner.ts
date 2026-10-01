// Phase 6 track C (docs/plans/phase6.md §6 C): shared bikes, SPEC §6.2–6.4. Pure and deterministic (seeded), no
// `cloudflare:workers` import, so Vitest runs it in Node. The Durable Object owns the clock, the SQLite rows and the
// sockets; this module only decides. The Host browser computes the candidates (A* corridors on roadgraph.json) and sends
// them as `host.candidates`; nothing here touches the road graph (CLAUDE.md: no heavy compute in the DO).
import type { BikeInfo } from '@race/shared/protocol';
import type { VehiclesConfig } from './leg.ts';

/** One bike as the server keeps it (bikes.data JSON). */
export interface ServerBike extends BikeInfo {
  /** Route segment index it was spawned for, −1 = decoy (SPEC §6.2 (6)). */
  segment: number;
  /** ms when the owner was last within vehicles.abandonMeters (SPEC §6.3: abandonSeconds beyond → gone). */
  nearOwnerAt: number;
  /** Step id of the rack it stands at (SPEC §6.4), null on the street. */
  rack: string | null;
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

export type ClaimResult = { ok: true } | { ok: false; reason: 'taken' | 'far' | 'walkOnly' | 'gone' };

/** mulberry32 (same as client/src/npc/rng.ts) so a seed replays the race's spawns. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── stubs: track C replaces the bodies, keeps the signatures (docs/plans/phase6.md §5.3) ──

/** Start of the race (SPEC §6.2 (3)): initialPerSegment bikes per segment + decoys by decoyRatio. */
export function initialSpawn(_cfg: VehiclesConfig, _cands: SpawnCandidates, _state: SpawnerState, _players: readonly PlayerSpot[], _now: number): ServerBike[] {
  return [];
}

/** One alarm tick (SPEC §6.2 (4)–(5)): per segment with chance spawnChance when fewer than maxAvailablePerSegment free
 *  street bikes, never within noSpawnNearPlayerMeters of a player. */
export function periodicSpawn(_cfg: VehiclesConfig, _cands: SpawnCandidates, _state: SpawnerState, _bikes: readonly ServerBike[], _players: readonly PlayerSpot[], _now: number): ServerBike[] {
  return [];
}

/** F on a bike (SPEC §6.3): atomic because the Durable Object runs one message at a time; the first claim wins. */
export function claim(_bike: ServerBike, _team: string, _at: PlayerSpot, _walkOnly: boolean, _now: number): ClaimResult {
  return { ok: false, reason: 'gone' };
}

/** Bikes whose owner has been > abandonMeters away for abandonSeconds (offline owners don't count, §6.3). */
export function abandoned(_cfg: VehiclesConfig, _bikes: readonly ServerBike[], _players: readonly PlayerSpot[], _now: number): string[] {
  return [];
}
