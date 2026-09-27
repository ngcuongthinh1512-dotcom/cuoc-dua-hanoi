// Race area edge (SPEC §4.1): invisible walls along RACE_BBOX + the distance used for the "leaving the area" banner.
import RAPIER from '@dimforge/rapier3d-compat';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { bounds, RACE_BBOX as B } from '../config.ts';

/** Metres to the nearest RACE_BBOX edge: > 0 inside, < 0 outside. East/west edges are meridians, so they are
 *  measured at the point's own latitude (the projected bbox is a slight trapezoid). */
export function edgeDistance(x: number, z: number): number {
  const { lat } = worldToLatLon(x, z);
  const west = latLonToWorld(lat, B.west).x;
  const east = latLonToWorld(lat, B.east).x;
  const north = latLonToWorld(B.north, B.west).z;
  const south = latLonToWorld(B.south, B.west).z;
  return Math.min(x - west, east - x, z - north, south - z);
}

/** Bbox corners in world XZ: SW, SE, NE, NW. */
export function bboxCorners(): [number, number][] {
  return [
    [B.south, B.west],
    [B.south, B.east],
    [B.north, B.east],
    [B.north, B.west],
  ].map(([lat, lon]) => {
    const p = latLonToWorld(lat!, lon!);
    return [p.x, p.z];
  });
}

/** 4 static cuboids (bounds.wallHeight tall, centred on y = 0) just outside the bbox edges. */
export function createBoundsWalls(world: RAPIER.World): void {
  const c = bboxCorners();
  const half = 1; // m, half thickness
  c.forEach(([ax, az], i) => {
    const [bx, bz] = c[(i + 1) % 4]!;
    const len = Math.hypot(bx - ax, bz - az);
    const [dx, dz] = [(bx - ax) / len, (bz - az) / len];
    const [ox, oz] = [-dz, dx]; // SW → SE → NE → NW with z = −north: outward normal
    const angle = Math.atan2(-dz, dx); // rotation about +Y taking local +X onto the edge direction
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(len / 2 + half, bounds.wallHeight / 2, half)
        .setTranslation((ax + bx) / 2 + ox * half, 0, (az + bz) / 2 + oz * half)
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }),
    );
  });
}
