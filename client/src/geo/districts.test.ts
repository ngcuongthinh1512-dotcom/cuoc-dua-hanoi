// Phase 5 foundation: parishes (Leg 3: the 8 Brussels communes; Leg 2: Macao freguesias; Leg 1: arrondissements) in the real water.json (build-chunks), skipped when the data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { latLonToWorld } from '@race/shared';
import { describe, expect, it } from 'vitest';
import { type WaterData, ringArea } from './chunkData.ts';
import { districtAt, districtLabel, districtPlaque, inRing } from './districts.ts';

const FILE = new URL('../../public/data/water.json', import.meta.url);

describe.skipIf(!existsSync(FILE))('districts (water.json)', () => {
  const water = JSON.parse(readFileSync(FILE, 'utf8')) as WaterData;
  const at = (lat: number, lon: number) => {
    const w = latLonToWorld(lat, lon);
    return districtAt(water.districts, w.x, w.z);
  };

  it('has the 8 communes of the box', () => {
    expect(new Set(water.districts!.map((d) => d.n))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('puts known places in their commune', () => {
    expect(at(50.84855, 4.35815)).toBe(1); // Bruxelles (Cathédrale / centre)
    expect(at(50.85574, 4.37093)).toBe(2); // Saint-Josse-ten-Noode
    expect(at(50.83417, 4.3695)).toBe(3); // Ixelles
    expect(at(50.83057, 4.38937)).toBe(4); // Etterbeek
    expect(at(50.83327, 4.34253)).toBe(5); // Saint-Gilles
    expect(at(50.85484, 4.38797)).toBe(6); // Schaerbeek
    expect(at(50.85035, 4.33827)).toBe(7); // Molenbeek-Saint-Jean
    expect(at(50.84405, 4.33685)).toBe(8); // Anderlecht
    expect(at(50.84675, 4.35247)).toBe(1); // Grand-Place (the origin)
  });

  it('has the big-map park overview (Parc de Bruxelles, Parc du Cinquantenaire)', () => {
    const parks = water.parks!;
    expect(parks.every((r) => r.length >= 6 && ringArea(r) >= 150)).toBe(true); // ≥ 400 m² before the 2 m simplification (Macao: small triangular parks keep ≥ 180 m² after it; Paris kept ≥ 300)
    for (const [lat, lon] of [[50.8454, 4.363], [50.8403, 4.3935]]) {
      const w = latLonToWorld(lat!, lon!);
      expect(parks.some((r) => inRing(w.x, w.z, r))).toBe(true);
    }
  });

  it('formats labels', () => {
    expect([districtPlaque(1), districtPlaque(4), districtPlaque(0)]).toEqual(['Bruxelles', 'Etterbeek', '']);
    expect([districtLabel(4), districtLabel(5), districtLabel(0), districtLabel(16)]).toEqual(['Commune Etterbeek', 'Commune Saint-Gilles', '', '']);
    expect(districtAt(undefined, 0, 0)).toBe(0);
  });
});
