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

/** Parish number (1…5) at (x, z), 0 outside every one (or no data). ponytail: linear scan of a few polygons
 *  (~2.4k vertices, ≈ 10 µs); a bbox per polygon if it shows in a profile. */
export function districtAt(d: Districts | undefined, x: number, z: number): number {
  for (const p of d ?? []) if (inRing(x, z, p.outer) && !(p.holes ?? []).some((h) => inRing(x, z, h))) return p.n;
  return 0;
}

/** Macao Peninsula freguesias (OSM admin_level 6, `name:pt`); district number n = index + 1. Taipa / Coloane lie outside the box. */
export const PARISHES = ['Nossa Senhora de Fátima', 'Santo António', 'São Lázaro', 'Sé', 'São Lourenço'] as const;

/** Street-plaque form: the parish name (Paris "8e Arrt" in Leg 1); 0 → "". */
export const districtPlaque = (n: number) => PARISHES[n - 1] ?? '';

/** HUD form (Vietnamese): 4 → "Freguesia Sé"; 0 → "". */
export const districtLabel = (n: number) => (PARISHES[n - 1] ? `Freguesia ${PARISHES[n - 1]}` : '');
