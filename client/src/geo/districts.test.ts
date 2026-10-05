// Phase 5 foundation: parishes (Leg 2: the 5 Macao freguesias; Leg 1: arrondissements) in the real water.json (build-chunks), skipped when the data is missing.
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

  it('has the 5 freguesias of the peninsula', () => {
    expect(new Set(water.districts!.map((d) => d.n))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('puts known places in their freguesia', () => {
    expect(at(22.2145, 113.5435)).toBe(1); // Portas do Cerco (Nossa Senhora de Fátima)
    expect(at(22.19756, 113.54089)).toBe(2); // Ruínas de São Paulo (Santo António)
    expect(at(22.19823, 113.547)).toBe(3); // Praça do Tap Seac (São Lázaro)
    expect(at(22.1905, 113.5495)).toBe(4); // Kun Iam statue (Sé)
    expect(at(22.18647, 113.53097)).toBe(5); // A-Ma Temple (São Lourenço)
    // not Largo do Senado (the origin): it sits on the Sé / São Lourenço border, the answer flips within 100 m
  });

  it('has the big-map park overview (Camões garden, the park at Tap Seac)', () => {
    const parks = water.parks!;
    expect(parks.every((r) => r.length >= 6 && ringArea(r) >= 150)).toBe(true); // ≥ 400 m² before the 2 m simplification (Macao: small triangular parks keep ≥ 180 m² after it; Paris kept ≥ 300)
    for (const [lat, lon] of [[22.1972, 113.541], [22.1963, 113.5464]]) {
      const w = latLonToWorld(lat!, lon!);
      expect(parks.some((r) => inRing(w.x, w.z, r))).toBe(true);
    }
  });

  it('formats labels', () => {
    expect([districtPlaque(1), districtPlaque(4), districtPlaque(0)]).toEqual(['Nossa Senhora de Fátima', 'Sé', '']);
    expect([districtLabel(4), districtLabel(5), districtLabel(0), districtLabel(16)]).toEqual(['Freguesia Sé', 'Freguesia São Lourenço', '', '']);
    expect(districtAt(undefined, 0, 0)).toBe(0);
  });
});
