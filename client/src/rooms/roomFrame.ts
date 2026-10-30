// Leg 3 rooms in WORLD coordinates (the Leg 1 Louvre room's way, git 9425533^ race/LouvreRoom.ts roomFrame / toLocal /
// toWorld): a room is built `rooms.below` m under its branch box, its door end at the box's x, z, so going in / out only
// changes y (no `respawn`, no teleport flag) and the other teams inside are seen through the normal pose stream
// (RemotePlayers' height filter). Room-local metres: x across, z along, +z = the door end (`doorZ`), y 0 = the floor.
// World = frame origin + rotation.y = yaw (x' = x cos + z sin, z' = −x sin + z cos), like three's Object3D.
import { rooms as C } from '../config.ts';

export interface RoomFrame {
  /** World x, z of the door (the box). */
  x: number;
  z: number;
  /** rad, the room's rotation.y: the box's yaw + π, so local +z (the door end) points out of the box's FRONT (the side the team
   *  reads it from) and the room extends behind it. */
  yaw: number;
  /** World y of the floor. */
  floorY: number;
  /** Room-local z of the door end (the room extends toward −z from it). */
  doorZ: number;
}

/** The frame of a room under the box at (x, z) on ground `groundY`. */
export const roomFrame = (box: { x: number; z: number; yaw?: number }, groundY: number, doorZ: number): RoomFrame => ({ x: box.x, z: box.z, yaw: (box.yaw ?? 0) + Math.PI, floorY: Math.max(groundY - C.below, C.minFloorY), doorZ });
/** The dev pages: room-local = world, floor at 0. */
export const devFrame = (doorZ: number): RoomFrame => ({ x: 0, z: doorZ, yaw: 0, floorY: 0, doorZ });

export function toWorld(f: RoomFrame, lx: number, lz: number): { x: number; z: number } {
  const [s, c, dz] = [Math.sin(f.yaw), Math.cos(f.yaw), lz - f.doorZ];
  return { x: f.x + lx * c + dz * s, z: f.z - lx * s + dz * c };
}
export function toLocal(f: RoomFrame, x: number, z: number): { x: number; z: number } {
  const [s, c, dx, dz] = [Math.sin(f.yaw), Math.cos(f.yaw), x - f.x, z - f.z];
  return { x: dx * c - dz * s, z: dx * s + dz * c + f.doorZ };
}
/** Where the room group sits: world position of room-local (0, 0, 0) + its rotation.y. */
export const groupPose = (f: RoomFrame) => ({ ...toWorld(f, 0, 0), y: f.floorY, yaw: f.yaw });
/** The feet on entering: `enterInset` m inside the door, facing into the room (body yaw 0 = north = local −z turned by yaw). */
export const enterSpot = (f: RoomFrame) => ({ ...toWorld(f, 0, f.doorZ - C.enterInset), y: f.floorY, yaw: f.yaw });
/** The feet on leaving: `exitInset` m in front of the box on the street, facing it (the camera behind the body is on the street side). */
export const exitSpot = (f: RoomFrame) => ({ ...toWorld(f, 0, f.doorZ + C.exitInset), yaw: f.yaw });
