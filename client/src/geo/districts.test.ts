// Phase 5 foundation: arrondissements in the real water.json (build-chunks), skipped when the data is missing.
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

  it('has the 13 arrondissements that touch the map', () => {
    expect(new Set(water.districts!.map((d) => d.n))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17]));
  });

  it('puts known places in their arrondissement', () => {
    expect(at(48.86548, 2.32115)).toBe(8); // Concorde obelisk
    expect(at(48.8584, 2.2945)).toBe(7); // Eiffel Tower
    expect(at(48.86111, 2.33547)).toBe(1); // Louvre pyramid
    expect(at(48.853, 2.3499)).toBe(4); // Notre-Dame
    expect(at(48.8698, 2.3076)).toBe(8); // Champs-Élysées (the 8e / 16e / 17e borders meet under the Arc de Triomphe)
    expect(at(48.86215, 2.28843)).toBe(16); // Trocadéro
    expect(at(48.8462, 2.3464)).toBe(5); // Panthéon
  });

  it('has the big-map park overview (Tuileries, Champ de Mars)', () => {
    const parks = water.parks!;
    expect(parks.every((r) => r.length >= 6 && ringArea(r) >= 300)).toBe(true); // ≥ 400 m² before the 2 m simplification
    for (const [lat, lon] of [[48.8635, 2.327], [48.8556, 2.2986]]) {
      const w = latLonToWorld(lat!, lon!);
      expect(parks.some((r) => inRing(w.x, w.z, r))).toBe(true);
    }
  });

  it('formats labels', () => {
    expect([districtPlaque(1), districtPlaque(8), districtPlaque(0)]).toEqual(['1er Arrt', '8e Arrt', '']);
    expect(districtLabel(16)).toBe('Quận 16');
    expect(districtAt(undefined, 0, 0)).toBe(0);
  });
});
