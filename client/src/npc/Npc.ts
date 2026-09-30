// Track D (docs/plans/phase4b.md §3.3–3.5, §3.8–3.9, §5.2): the NPC layer main.ts (and Phase 7) talks to. A fixed step:
// traffic → crowd → kinematic cuboids for the cars near the player → shove the player out of a car / crash the rider who
// hit a pedestrian. A frame: automatic density, render poses (lerp between the last two steps), the static sets around
// the anchor (zebras, light poles, chairs). Client-only and deterministic (seeded sims, fixed steps).
import RAPIER from '@dimforge/rapier3d-compat';
import type { RoadGraph } from '@race/shared/graph';
import { BufferGeometry, type Camera, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop, Quaternion, type Scene } from 'three';
import { bike as B, npc as N, npcRender as R, physics, player as P } from '../config.ts';
import type { CharacterController } from '../player/CharacterController.ts';
import { Crowd } from './crowd.ts';
import { loadNpcAssets, type NpcAssets, type VehicleTemplate } from './NpcAssets.ts';
import { carQuaternion, NpcRenderer, type Snap } from './NpcRenderer.ts';
import { PedRenderer } from './PedRenderer.ts';
import { NpcRoads } from './roads.ts';
import { Traffic } from './traffic.ts';
import { type CarKind, type CarPose, type ExclusionZone, NPC_GROUPS, type NpcAnchor } from './types.ts';

/** Automatic density factor state (npcRender.autoDensity). */
export interface AutoDensity { factor: number; time: number; frames: number; good: number }
export const newAutoDensity = (): AutoDensity => ({ factor: 1, time: 0, frames: 0, good: 0 });

/** One frame of dt s. Every `window` s the mean FPS decides: < minFps → factor × down (floor min); ≥ okFps for upAfter s
 *  in a row → + up (ceiling 1). Returns the factor. */
export function nextDensity(a: AutoDensity, dt: number): number {
  const A = R.autoDensity;
  a.time += dt;
  a.frames++;
  if (a.time < A.window) return a.factor;
  const fps = a.frames / a.time;
  if (fps < A.minFps) [a.factor, a.good] = [Math.max(A.min, a.factor * A.down), 0];
  else if (fps < A.okFps) a.good = 0;
  else if ((a.good += a.time) >= A.upAfter) [a.factor, a.good] = [Math.min(1, a.factor + A.up), 0];
  a.time = a.frames = 0;
  return a.factor;
}

/** Shove (dx, dz), at most `max` m, moving a circle (px, pz, r) out of a car footprint: centre (cx, cz), heading yaw,
 *  half width hw, half length hl. [0, 0] when they don't overlap. */
export function obbCirclePush(cx: number, cz: number, yaw: number, hw: number, hl: number, px: number, pz: number, r: number, max: number): [number, number] {
  const [fx, fz, rx, rz] = [-Math.sin(yaw), -Math.cos(yaw), Math.cos(yaw), -Math.sin(yaw)]; // forward, right
  const [dx, dz] = [px - cx, pz - cz];
  const [u, v] = [dx * rx + dz * rz, dx * fx + dz * fz]; // across, along
  const [cu, cv] = [Math.max(-hw, Math.min(hw, u)), Math.max(-hl, Math.min(hl, v))];
  let [nu, nv] = [u - cu, v - cv];
  let depth: number;
  const d = Math.hypot(nu, nv);
  if (d > 0) {
    if (d >= r) return [0, 0];
    [nu, nv, depth] = [nu / d, nv / d, r - d];
  } else if (hw - Math.abs(u) < hl - Math.abs(v)) [nu, nv, depth] = [u < 0 ? -1 : 1, 0, hw - Math.abs(u) + r]; // centre inside: nearest side
  else [nu, nv, depth] = [0, v < 0 ? -1 : 1, hl - Math.abs(v) + r];
  const k = Math.min(depth, max);
  return [(nu * rx + nv * fx) * k, (nu * rz + nv * fz) * k];
}

/** Collision box of a car template: half extents and the box centre's offset along the nose (+Z) from the pivot. */
export interface CarShape { hw: number; hh: number; hl: number; off: number }
export function carShape(t: VehicleTemplate): CarShape {
  const b = (t.geometry.boundingBox ?? (t.geometry.computeBoundingBox(), t.geometry.boundingBox))!;
  return { hw: (b.max.x - b.min.x) / 2, hh: b.max.y / 2, hl: (b.max.z - b.min.z) / 2, off: (b.max.z + b.min.z) / 2 };
}

/** Box centre of car c (ground pivot + the shape's offset along the heading). */
const centre = (c: CarPose, k: CarShape): [number, number] => [c.x - Math.sin(c.yaw) * k.off, c.z - Math.cos(c.yaw) * k.off];
const quat = new Quaternion();

/** Pool of npcRender.maxColliders kinematic cuboids (NPC_GROUPS) for the cars within colliderRadius of the player,
 *  nearest first: the KCC stops at them, the bike's nose probe crashes into them (SPEC §6.3). */
export class CarColliders {
  /** Cars holding a collider since the last update. */
  readonly near: CarPose[] = [];
  private readonly slots: { body: RAPIER.RigidBody; collider: RAPIER.Collider; kind: CarKind | null }[] = [];

  constructor(world: RAPIER.World, private readonly shapes: ReadonlyMap<CarKind, CarShape>) {
    for (let i = 0; i < R.maxColliders; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setCollisionGroups(NPC_GROUPS).setEnabled(false), body);
      this.slots.push({ body, collider, kind: null });
    }
  }

  update(cars: readonly CarPose[], x: number, z: number) {
    const d2 = (c: CarPose) => (c.x - x) ** 2 + (c.z - z) ** 2;
    this.near.length = 0;
    for (const c of cars) if (this.shapes.has(c.kind) && d2(c) <= R.colliderRadius ** 2) this.near.push(c);
    if (this.near.length > this.slots.length) this.near.sort((a, b) => d2(a) - d2(b)).length = this.slots.length;
    this.slots.forEach((s, i) => {
      const c = this.near[i];
      if (s.collider.isEnabled() !== !!c) s.collider.setEnabled(!!c);
      if (!c) return;
      const k = this.shapes.get(c.kind)!;
      if (s.kind !== c.kind) s.collider.setHalfExtents({ x: k.hw, y: k.hh, z: k.hl });
      s.kind = c.kind;
      const [cx, cz] = centre(c, k);
      s.body.setTranslation({ x: cx, y: c.y + k.hh, z: cz }, true);
      s.body.setRotation(carQuaternion(c.yaw, c.pitch, quat), true);
    });
  }
}

export interface NpcOptions {
  seed: number;
  /** Base density (npc.density or ?npcDensity), × the automatic factor when `auto`. */
  density: number;
  auto: boolean;
  zones: readonly ExclusionZone[];
  /** ?npcTest: parked cars (Traffic.park), yaw in degrees. */
  test: readonly { kind: CarKind; x: number; z: number; yawDeg: number }[];
}

export class Npc {
  readonly root = new Group();
  /** ?npcZone / setExclusionZones rings (radius + npc.zoneMargin); main.ts shows them while the F3 panel is open. */
  readonly zoneRings = new Group();
  readonly stats = { cars: 0, peds: 0, density: 1, simMs: 0, drawMs: 0, colliders: 0 };
  readonly traffic: Traffic;
  readonly crowd: Crowd;
  readonly colliders: CarColliders;
  readonly cars: NpcRenderer;
  readonly peds: PedRenderer;
  started = false;
  private readonly shapes = new Map<CarKind, CarShape>();
  private readonly prevCars = new Map<number, Snap>();
  private readonly prevPeds = new Map<number, Snap>();
  private readonly auto = newAutoDensity();
  private readonly ringMaterial = new LineBasicMaterial({ color: R.zoneRing, depthTest: false }); // shared by every zone ring
  private readonly at = { x: 0, z: 0 }; // anchor of the last step
  private readonly setAt = { x: Infinity, z: Infinity }; // anchor the static sets were gathered at
  private steps = 0;

  static async create(scene: Scene, world: RAPIER.World, graph: RoadGraph, heightAt: (x: number, z: number) => number, opts: NpcOptions) {
    const npc = new Npc(world, new NpcRoads(graph, heightAt), await loadNpcAssets(), opts);
    scene.add(npc.root);
    return npc;
  }

  constructor(world: RAPIER.World, readonly roads: NpcRoads, assets: NpcAssets, private readonly opts: NpcOptions) {
    for (const [kind, t] of assets.vehicles) this.shapes.set(kind, carShape(t));
    this.traffic = new Traffic(roads, opts.seed);
    this.crowd = new Crowd(roads, opts.seed);
    this.crowd.lights = this.traffic.lights;
    this.colliders = new CarColliders(world, this.shapes);
    this.cars = new NpcRenderer(assets);
    this.peds = new PedRenderer(assets);
    this.zoneRings.visible = false;
    this.root.add(this.cars.root, this.peds.root, this.zoneRings);
    this.setExclusionZones(opts.zones);
    for (const t of opts.test) this.traffic.park(t.kind, t.x, t.z, (t.yawDeg * Math.PI) / 180);
  }

  get density() {
    return this.opts.density * (this.opts.auto ? this.auto.factor : 1);
  }

  /** Fill the radius around the anchor, then npcRender.warmUp s of simulation (queues at red lights on frame one). */
  start(anchor: NpcAnchor) {
    const dt = physics.fixedDt;
    const quiet = { ...anchor, waving: false };
    this.simulate(dt, quiet, true);
    for (let t = dt; t < R.warmUp; t += dt) this.simulate(dt, quiet, false);
    this.started = true;
  }

  /** One fixed step, before the player's (docs/plans/phase4b.md §5.2 order). `player` = the body the cars collide with
   *  (none: spectator, or the body frozen under the free-fly camera). */
  fixedUpdate(dt: number, anchor: NpcAnchor, player?: CharacterController) {
    const t0 = performance.now();
    this.steps++;
    remember(this.traffic.cars, this.prevCars, this.steps);
    remember(this.crowd.peds, this.prevPeds, this.steps);
    const knocked = this.simulate(dt, anchor, false);
    if (anchor.body) this.colliders.update(this.traffic.cars, anchor.x, anchor.z);
    if (player) {
      this.shove(player, dt);
      // §17.11: riding into a pedestrian throws the rider like riding into a car (the same crashImpact threshold).
      if (knocked && Math.abs(player.riding?.speed ?? 0) >= B.crashImpact) player.crash();
    }
    this.stats.simMs += (performance.now() - t0 - this.stats.simMs) * 0.05;
  }

  /** Render poses at `alpha` (GameLoop.alpha), LOD against `camera`, automatic density from the frame time. */
  update(dt: number, alpha: number, camera: Camera) {
    const t0 = performance.now();
    if (this.opts.auto) nextDensity(this.auto, dt);
    if (Math.hypot(this.at.x - this.setAt.x, this.at.z - this.setAt.z) >= R.refresh) {
      Object.assign(this.setAt, this.at);
      const { x, z } = this.at;
      this.cars.setZebras(this.roads, x, z);
      this.cars.setLights(this.traffic.lights.headsNear(x, z, R.lights.radius), this.roads);
      this.cars.setChairs(this.crowd.seatsNear(x, z, R.chair.radius), this.roads.heightAt);
    }
    this.cars.lightColours(this.traffic.lights);
    this.cars.cars(this.traffic.cars, this.prevCars, alpha, camera.position);
    this.peds.update(this.crowd.peds, this.prevPeds, alpha, camera.position, dt);
    Object.assign(this.stats, { cars: this.traffic.cars.length, peds: this.crowd.peds.length, density: this.density, colliders: this.colliders.near.length });
    this.stats.drawMs += (performance.now() - t0 - this.stats.drawMs) * 0.05;
  }

  /** Phase 7: clue-box / finish-mat geofences NPCs keep clear of (the sims add npc.zoneMargin). */
  setExclusionZones(zones: readonly ExclusionZone[]) {
    this.traffic.zones = this.crowd.zones = zones;
    for (const o of this.zoneRings.children) (o as LineLoop).geometry.dispose();
    this.zoneRings.clear();
    const material = this.ringMaterial;
    for (const { x, z, r } of zones) {
      const pts: number[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * 2 * Math.PI, [px, pz] = [x + Math.cos(a) * (r + N.zoneMargin), z + Math.sin(a) * (r + N.zoneMargin)];
        pts.push(px, this.roads.heightAt(px, pz) + 0.3, pz);
      }
      const ring = new LineLoop(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts, 3)), material);
      ring.renderOrder = 10;
      this.zoneRings.add(ring);
    }
  }

  private simulate(dt: number, anchor: NpcAnchor, fill: boolean): number {
    Object.assign(this.at, { x: anchor.x, z: anchor.z });
    this.traffic.step(dt, anchor, this.density, this.crowd.peds, fill);
    return this.crowd.step(dt, anchor, this.density, this.traffic.cars, fill).knocked;
  }

  /** A car overlapping the player (box vs circle) shoves it through the KCC, ≤ push.maxSpeed (walls still stop it). */
  private shove(player: CharacterController, dt: number) {
    const s = player.state.position;
    const max = R.push.maxSpeed * dt;
    let [dx, dz] = [0, 0];
    for (const c of this.colliders.near) {
      const k = this.shapes.get(c.kind)!;
      if (s.y > c.y + 2 * k.hh || s.y + P.height < c.y) continue; // on a bridge above it, in a tunnel below
      const [cx, cz] = centre(c, k);
      const [px, pz] = obbCirclePush(cx, cz, c.yaw, k.hw, k.hl, s.x, s.z, P.radius, max);
      [dx, dz] = [dx + px, dz + pz];
    }
    const len = Math.hypot(dx, dz);
    if (len > max) [dx, dz] = [(dx * max) / len, (dz * max) / len];
    player.push(dx, dz);
  }
}

/** Copies every pose's (x, y, z, yaw, pitch, wheel) into `map` (the previous step for lerpPose); drops the gone ones. */
function remember(list: readonly { id: number; x: number; y: number; z: number; yaw: number; pitch?: number; wheel?: number }[], map: Map<number, Snap>, step: number) {
  for (const p of list) {
    const s = map.get(p.id) ?? map.set(p.id, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, wheel: 0, step }).get(p.id)!;
    Object.assign(s, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch ?? 0, wheel: p.wheel ?? 0, step });
  }
  for (const [id, s] of map) if (s.step !== step) map.delete(id);
}
