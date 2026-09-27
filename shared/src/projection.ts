import { ORIGIN } from './constants.ts';

// Local flat ENU about ORIGIN (SPEC §4.2): 1 unit = 1 m, X = East, Z = −North, Y = elevation.
// North uses the WGS84 meridional radius M(φ0); East uses the parallel radius N(φ0)·cos(φ) of the
// point itself, so z alone gives φ and the inverse is exact in closed form.
// ponytail: flat approximation, fine for ~10 km around ORIGIN (<0.1% distance error in RACE_BBOX);
// a larger map needs a real projection (e.g. transverse Mercator / proj4).

const DEG = Math.PI / 180;
const A = 6378137; // WGS84 semi-major axis (m)
const E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563); // first eccentricity squared
const SIN2 = Math.sin(ORIGIN.lat * DEG) ** 2;
const N0 = A / Math.sqrt(1 - E2 * SIN2); // prime-vertical radius at ORIGIN
const M0 = (A * (1 - E2)) / (1 - E2 * SIN2) ** 1.5; // meridional radius at ORIGIN

export function latLonToWorld(lat: number, lon: number, elevation = 0) {
  return {
    x: N0 * Math.cos(lat * DEG) * (lon - ORIGIN.lon) * DEG,
    y: elevation,
    z: -M0 * (lat - ORIGIN.lat) * DEG,
  };
}

export function worldToLatLon(x: number, z: number) {
  const lat = ORIGIN.lat - z / M0 / DEG;
  return { lat, lon: ORIGIN.lon + x / (N0 * Math.cos(lat * DEG)) / DEG };
}
