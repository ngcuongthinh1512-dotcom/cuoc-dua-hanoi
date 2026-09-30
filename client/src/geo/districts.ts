// Phase 5 foundation (docs/plans/phase5.md §5): arrondissement under a point (water.json `districts`, build-chunks).
// Pure, DOM-free: the HUD location label (main thread) and the street-sign district line (chunk worker) both use it.
import type { WaterData, XZ } from './chunkData.ts';

export type Districts = NonNullable<WaterData['districts']>;

/** Even-odd point in ring (flat x, z). */
export function inRing(x: number, z: number, r: XZ): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Arrondissement number (1…20) at (x, z), 0 outside every one (or no data). ponytail: linear scan of 13 polygons
 *  (~2.4k vertices, ≈ 10 µs); a bbox per polygon if it shows in a profile. */
export function districtAt(d: Districts | undefined, x: number, z: number): number {
  for (const p of d ?? []) if (inRing(x, z, p.outer) && !(p.holes ?? []).some((h) => inRing(x, z, h))) return p.n;
  return 0;
}

/** Street-plaque form (Paris enamel signs): 1 → "1er Arrt", 8 → "8e Arrt"; 0 → "". */
export const districtPlaque = (n: number) => (n ? `${n}${n === 1 ? 'er' : 'e'} Arrt` : '');

/** HUD form (Vietnamese): 8 → "Quận 8"; 0 → "". */
export const districtLabel = (n: number) => (n ? `Quận ${n}` : '');
