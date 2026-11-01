import { describe, expect, it } from 'vitest';
import { ORIGIN, RACE_BBOX } from './constants.ts';
import { latLonToWorld, worldToLatLon } from './projection.ts';

// Leg 3 (Hà Nội): the Nhà hát Lớn square (south-east of the origin) and the Ga Hà Nội (west side of the map)
const NHA_HAT_LON = { lat: 21.0243, lon: 105.8574 };
const GA_HA_NOI = { lat: 21.0246, lon: 105.8412 };

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

function worldDist(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const p = latLonToWorld(a.lat, a.lon);
  const q = latLonToWorld(b.lat, b.lon);
  return Math.hypot(p.x - q.x, p.z - q.z);
}

describe('projection', () => {
  it('maps ORIGIN to (0,0,0)', () => {
    const p = latLonToWorld(ORIGIN.lat, ORIGIN.lon);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it('north is −Z, east is +X, elevation is Y', () => {
    expect(latLonToWorld(ORIGIN.lat + 0.01, ORIGIN.lon).z).toBeLessThan(0);
    expect(latLonToWorld(ORIGIN.lat, ORIGIN.lon + 0.01).x).toBeGreaterThan(0);
    expect(latLonToWorld(ORIGIN.lat, ORIGIN.lon, 35).y).toBe(35);
  });

  it.each([
    ['Đông Kinh Nghĩa Thục → Nhà hát Lớn', 1.0, ORIGIN, NHA_HAT_LON],
    ['Ga Hà Nội → Nhà hát Lớn', 1.7, GA_HA_NOI, NHA_HAT_LON],
  ])('%s ≈ %s km', (_, km, a, b) => {
    const d = worldDist(a, b);
    expect(Math.abs(d - haversine(a, b))).toBeLessThan(50);
    expect(Math.round(d / 100) / 10).toBe(km);
  });

  it('round-trips the bbox corners to < 1 mm', () => {
    for (const lat of [RACE_BBOX.south, RACE_BBOX.north]) {
      for (const lon of [RACE_BBOX.west, RACE_BBOX.east]) {
        const p = latLonToWorld(lat, lon);
        const back = worldToLatLon(p.x, p.z);
        const q = latLonToWorld(back.lat, back.lon);
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(1e-3);
        expect(haversine({ lat, lon }, back)).toBeLessThan(1e-3);
      }
    }
  });

  it('bbox is about 9.1 × 6.1 km', () => {
    const midLat = (RACE_BBOX.south + RACE_BBOX.north) / 2;
    const width = worldDist({ lat: midLat, lon: RACE_BBOX.west }, { lat: midLat, lon: RACE_BBOX.east });
    const height = worldDist(
      { lat: RACE_BBOX.south, lon: RACE_BBOX.west },
      { lat: RACE_BBOX.north, lon: RACE_BBOX.west },
    );
    expect(width).toBeGreaterThan(9100);
    expect(width).toBeLessThan(9200);
    expect(height).toBeGreaterThan(6050);
    expect(height).toBeLessThan(6130);
  });
});
