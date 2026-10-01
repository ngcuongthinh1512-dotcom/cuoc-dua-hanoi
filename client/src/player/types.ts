// Phase 3 contract between the tracks (docs/plans/phase3.md). Changing it needs the integrator.
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MoveMode, PlayerAction } from '@race/shared/protocol';
import type { Vector3 } from 'three';
import type { WaterData } from '../geo/chunkData.ts';

/** walk = standard on-foot speed (movement.footSpeed, "jog" clip), slow = walkSlow held ("walk" clip),
 *  swim = in the Seine, air = jumping or falling, bike = riding (Phase 4, "cycle" clip + leg IK; vehicle/types.ts).
 *  Phase 6: the lists live in @race/shared/protocol (MOVE_MODES / PLAYER_ACTIONS: the wire sends their indices). */
export type { MoveMode, PlayerAction };

/** One-shot gesture over the locomotion; the controller times it (config playerSetup.actions), the animator plays it. */
export type Gesture = Exclude<PlayerAction, 'none'>;

/** Everything the animator and the camera need about one character. The local controller writes it every physics step;
 *  Phase 6 rebuilds it for remote players from snapshots, Phase 4B for pedestrians. */
export interface PlayerState {
  /** Feet (bottom of the capsule), world m. */
  readonly position: Vector3;
  /** World m/s; its horizontal length drives the locomotion clip speed. */
  readonly velocity: Vector3;
  /** Body heading, rad: 0 = facing north (−Z), + = turned left (toward −X), like FreeFlyCamera.yaw. */
  yaw: number;
  grounded: boolean;
  /** Over the river bed with the feet below the Seine surface (swimming, or wading in / climbing out). */
  inWater: boolean;
  moveMode: MoveMode;
  /** +1 at every jump take-off: the animator plays Jump_Start when it changes (air without a new jump = fall). */
  jumps: number;
  action: PlayerAction;
  /** s since `action` started (0 while 'none'). */
  actionTime: number;
}

/** What the player asks for, camera-relative; built every frame by readMoveIntent (CharacterController.ts). */
export interface MoveIntent {
  /** Forward (+) / back (−) and right (+) / left (−) of cameraYaw; |(forward, right)| ≤ 1 (half stick = half). */
  forward: number;
  right: number;
  /** rad, same convention as PlayerState.yaw. */
  cameraYaw: number;
  slow: boolean;
  /** Latched until a physics step consumes it: frames with no physics step must not lose the press. */
  jump: boolean;
}

/** World queries the controller needs besides Rapier. */
export interface PlayerEnv {
  /** Carved terrain grid (Terrain.ts carveRiver ran on it): river bed ≈ waterLevel − terrain.riverDepth. */
  heightAt(x: number, z: number): number;
  /** Seine surface y (Terrain.riverLevel); null without water data (then nobody swims). */
  waterLevel: number | null;
  /** River polygons (quay walls lie on their edges); undefined without water data. */
  water: WaterData | undefined;
}

/** What the camera follows, at the render (interpolated) pose. */
export interface CameraTarget {
  /** Feet, world m. */
  readonly position: Vector3;
  /** Body heading (recentre behind it). */
  yaw: number;
  /** Horizontal m/s (FOV boost, recentring only while moving). */
  speed: number;
  moveMode: MoveMode;
  /** Phase 4 hook: 'bike' = further and higher. */
  vehicle: 'foot' | 'bike';
  /** The player's own capsule: the camera shape cast ignores it. */
  collider?: RAPIER.Collider;
}
