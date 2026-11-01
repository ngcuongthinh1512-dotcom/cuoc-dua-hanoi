// Phase 5 foundation: parishes (Leg 3 Hà Nội: the 10 old quận; Leg 2b: the 8 Brussels communes; Leg 2: Macao freguesias; Leg 1: arrondissements) in the real water.json (build-chunks), skipped when the data is missing.
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

  it('has the 10 districts of the box', () => {
    expect(new Set(water.districts!.map((d) => d.n))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it('puts known places in their district', () => {
    expect(at(21.0285, 105.8524)).toBe(1); // Hồ Hoàn Kiếm
    expect(at(21.0285, 105.8494)).toBe(1); // Nhà thờ Lớn
    expect(at(21.0187, 105.8436)).toBe(2); // Hồ Thiền Quang (Hai Bà Trưng)
    expect(at(21.0125, 105.8465)).toBe(2); // Công viên Thống Nhất
    expect(at(21.029, 105.836)).toBe(3); // Văn Miếu (Đống Đa)
    expect(at(21.0245, 105.8412)).toBe(3); // Đống Đa
    expect(at(21.0368, 105.8346)).toBe(4); // Ba Đình (no content any more, boundary only)
    expect(at(21.045, 105.825)).toBe(5); // Tây Hồ
    expect(at(21.03218, 105.85213)).toBe(1); // Đông Kinh Nghĩa Thục square (the origin)
  });

  it('has the big-map park overview (Công viên Thống Nhất, Văn Miếu)', () => {
    const parks = water.parks!;
    expect(parks.every((r) => r.length >= 6 && ringArea(r) >= 150)).toBe(true); // ≥ 400 m² before the 2 m simplification (Macao: small triangular parks keep ≥ 180 m² after it; Paris kept ≥ 300)
    for (const [lat, lon] of [[21.01282, 105.84458], [21.0289, 105.83541]]) {
      const w = latLonToWorld(lat!, lon!);
      expect(parks.some((r) => inRing(w.x, w.z, r))).toBe(true);
    }
  });

  it('formats labels', () => {
    expect([districtPlaque(1), districtPlaque(4), districtPlaque(0)]).toEqual(['Hoàn Kiếm', 'Ba Đình', '']);
    expect([districtLabel(4), districtLabel(5), districtLabel(0), districtLabel(16)]).toEqual(['Quận Ba Đình', 'Quận Tây Hồ', '', '']);
    expect(districtAt(undefined, 0, 0)).toBe(0);
  });
});
