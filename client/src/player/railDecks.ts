// Phase 7 D17 (docs/plans/phase7.md §2.1): nobody stands on top of an upper rail viaduct. The Line 6 deck over the Pont
// de Bir-Hakeim (BridgeRec rail kind, layer ≥ 2) sits roads.bridge.railLayerStep above the promenade, right over the leg
// start: "the highest walkable surface" put the teams (and clue boxes) on the metro. In a rail column the spawn / box ray
// starts above the viaduct and skips everything within railLayerStep − railSlack below its top (the deck, its slab, the
// stone massif between them); elsewhere the highest surface still wins (a bridge deck over a quay road, never the road).
// Which columns are rail: the upper rail strips of the chunk JSON (fetched on first use, the same static file the chunk
// worker reads; DOM-free besides fetch).
import RAPIER from '@dimforge/rapier3d-compat';
import { raceClient, roads as R } from '../config.ts';
import { type BridgeRec, type ChunkKey, chunkKey } from '../geo/chunkData.ts';
import { IGNORE_NPC } from '../npc/types.ts';
import { roadWidth, sidewalkWidth } from '../world/RoadBuilder.ts';

export interface Strip {
  pts: number[];
  half: number;
}

/** The upper rail decks of a chunk's bridges as centre lines + half widths (BridgeBuilder's deck edges + railSlack). */
export function railStrips(bridges: readonly BridgeRec[]): Strip[] {
  return bridges
    .filter((b) => b.layer >= 2 && R.railKinds.includes(b.kind) && b.pts.length >= 4)
    .map((b) => ({ pts: b.pts, half: roadWidth({ ...b, oneway: false }) / 2 + sidewalkWidth({ ...b, oneway: false }) + raceClient.railSlack }));
}

export function inStrips(strips: readonly Strip[], x: number, z: number): boolean {
  for (const { pts: p, half } of strips) {
    for (let i = 2; i < p.length; i += 2) {
      const [ax, az, bx, bz] = [p[i - 2]!, p[i - 1]!, p[i]!, p[i + 1]!];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
      const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
      if (Math.hypot(ax + t * (bx - ax) - x, az + t * (bz - az) - z) <= half) return true;
    }
  }
  return false;
}

export interface Hit {
  y: number;
  walkable: boolean;
}

/** Ray hits of one column, top-down → the surface to stand on: the top one; in a rail column the first one at least
 *  railLayerStep − railSlack below the top (the viaduct deck and everything up to it skipped). null if none / not walkable. */
export function pickSurface(hits: readonly Hit[], rail: boolean): number | null {
  const top = hits[0];
  const h = top && rail ? hits.find((o) => o.y <= top.y - (R.bridge.railLayerStep - raceClient.railSlack)) : top;
  return h?.walkable ? h.y : null;
}

const DOWN = { x: 0, y: -1, z: 0 };

/** Hits of a vertical ray from `from` down `depth` m (one hit unless `rail`: then every surface, top-down, ≤ 8; the
 *  casts after the first are not solid: they start just under a surface, maybe inside a shape). The ray
 *  is nudged 1 mm off the 5 m grid lines (Rapier's vertical ray can slip through the heightfield on a triangle edge). */
export function castColumn(
  world: RAPIER.World, x: number, z: number, from: number, depth: number, rail: boolean, minNormalY: number,
  exclude?: RAPIER.Collider, flags?: RAPIER.QueryFilterFlags,
): Hit[] {
  const hits: Hit[] = [];
  let y = from;
  while (hits.length < (rail ? 8 : 1) && y > from - depth) {
    const hit = world.castRayAndGetNormal(new RAPIER.Ray({ x: x + 0.001, y, z: z + 0.001 }, DOWN), y - (from - depth), hits.length === 0, flags, IGNORE_NPC, exclude);
    if (!hit) break;
    const hy = y - hit.timeOfImpact;
    hits.push({ y: hy, walkable: Math.abs(hit.normal.y) >= minNormalY });
    y = hy - 0.01;
  }
  return hits;
}

/** Clue box / Pit Stop mat surface (D17) at a column whose terrain is `ground`; rail: rails.at(). Only fixed (world)
 *  colliders: a kinematic body (the player's capsule, a remote stand-in, an NPC car) passing over the box must not lift it. */
export function boxSurface(world: RAPIER.World, x: number, z: number, ground: number, rail: boolean): number | null {
  const from = ground + 19 + (rail ? R.bridge.railLayerStep : 0);
  const F = RAPIER.QueryFilterFlags;
  return pickSurface(castColumn(world, x, z, from, from - ground + 1, rail, 0, undefined, F.EXCLUDE_SENSORS | F.EXCLUDE_KINEMATIC | F.EXCLUDE_DYNAMIC), rail);
}

/** Upper rail strips per chunk, fetched on first use. at(): true / false, undefined while that chunk is loading. */
export class RailDecks {
  private readonly chunks = new Map<ChunkKey, Strip[] | null>();

  constructor(
    /** Chunks with data (chunks/index.json); others hold no rail. */
    private readonly keys: ReadonlySet<ChunkKey>,
    private readonly dataUrl: string,
  ) {}

  at(x: number, z: number): boolean | undefined {
    const key = chunkKey(x, z);
    if (!this.keys.has(key)) return false;
    const s = this.chunks.get(key);
    if (s === undefined) this.load(key);
    return s === undefined || s === null ? undefined : inStrips(s, x, z);
  }

  private load(key: ChunkKey) {
    this.chunks.set(key, null);
    void fetch(`${this.dataUrl}chunks/${key}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ bridges?: BridgeRec[] }>) : { bridges: [] }))
      .catch(() => ({ bridges: [] }))
      .then((c) => void this.chunks.set(key, railStrips(c.bridges ?? [])));
  }
}
