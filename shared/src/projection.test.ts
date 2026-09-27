import { describe, expect, it } from 'vitest';
import { ORIGIN, RACE_BBOX } from './constants.ts';
import { latLonToWorld, worldToLatLon } from './projection.ts';

const ARC = { lat: 48.8738, lon: 2.295 };
const EIFFEL = { lat: 48.8584, lon: 2.2945 };

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
    ['Concorde → Khải Hoàn Môn', 2.1, ORIGIN, ARC],
    ['Eiffel → Khải Hoàn Môn', 1.7, EIFFEL, ARC],
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

  it('bbox is about 5.5 × 3.7 km', () => {
    const midLat = (RACE_BBOX.south + RACE_BBOX.north) / 2;
    const width = worldDist({ lat: midLat, lon: RACE_BBOX.west }, { lat: midLat, lon: RACE_BBOX.east });
    const height = worldDist(
      { lat: RACE_BBOX.south, lon: RACE_BBOX.west },
      { lat: RACE_BBOX.north, lon: RACE_BBOX.west },
    );
    expect(width).toBeGreaterThan(5400);
    expect(width).toBeLessThan(5600);
    expect(height).toBeGreaterThan(3600);
    expect(height).toBeLessThan(3800);
  });
});
