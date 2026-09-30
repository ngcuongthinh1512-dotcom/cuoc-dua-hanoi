// Track D (docs/plans/phase4b.md §3.9): the static-mesh NPC layers. Cars: 1 InstancedMesh per kind sharing one vertex
// colour material whose `_paint` vertices take the instance colour; wheels: 1 InstancedMesh of a unit wheel for every
// car; traffic lights: poles + lit bulbs; zebra stripes at crossing nodes; park chairs at Crowd.seatsNear. frustumCulled
// = false everywhere (instances spread around the camera). ponytail: wheels roll but never steer; scooter / moto wheels
// are part of the body (their templates have no axles).
import {
  BoxGeometry, type BufferGeometry, Color, CylinderGeometry, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { npcRender as R, roads as RC, traffic } from '../config.ts';
import type { NpcAssets } from './NpcAssets.ts';
import type { NpcRoads } from './roads.ts';
import type { CarKind, CarPose, LightQuery, Seat, SignalHead } from './types.ts';

/** A pose at the previous fixed step (render = lerp(prev, latest, alpha)). */
export interface Snap { x: number; y: number; z: number; yaw: number; pitch: number; wheel: number; step: number }

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Render pose of `p` between its previous step `s` (none = just spawned) and now. */
export function lerpPose<T extends { x: number; y: number; z: number; yaw: number }>(p: T, s: Snap | undefined, a: number, out: Snap): Snap {
  const q = p as T & Partial<Snap>;
  if (!s) return Object.assign(out, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: q.pitch ?? 0, wheel: q.wheel ?? 0 });
  out.x = s.x + (p.x - s.x) * a;
  out.y = s.y + (p.y - s.y) * a;
  out.z = s.z + (p.z - s.z) * a;
  out.yaw = lerpAngle(s.yaw, p.yaw, a);
  out.pitch = s.pitch + ((q.pitch ?? 0) - s.pitch) * a;
  out.wheel = s.wheel + ((q.wheel ?? 0) - s.wheel) * a;
  return out;
}

/** Model (nose +Z, glTF) → world: heading yaw (0 = −Z, + = left), nose up by pitch. */
export const carQuaternion = (yaw: number, pitch: number, out = new Quaternion()) => out.setFromEuler(euler.set(-pitch, yaw + Math.PI, 0, 'YXZ'));
const euler = new Euler();
const m4 = new Matrix4(), w4 = new Matrix4(), r4 = new Matrix4();
const UP = new Vector3(0, 1, 0);
const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3(), col = new Color();
const pose: Snap = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, wheel: 0, step: 0 };
const CAPACITY = traffic.max + 8; // + ?npcTest parked cars
const MAX_WHEELS = CAPACITY * 6;
const MAX_STRIPES = 4096;
const MAX_HEADS = 512;
const MAX_CHAIRS = 512;

function instanced(geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, capacity: number, colours = false) {
  const m = new InstancedMesh(geometry, material, capacity);
  m.count = 0;
  m.frustumCulled = false;
  m.visible = false;
  if (colours) m.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return m;
}
const done = (m: InstancedMesh, n: number) => {
  m.count = n;
  m.visible = n > 0;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
};

/** One shared program: vertex colours, the instance colour replacing them where `_paint` = 1 (the body). */
function paintShader(shader: { vertexShader: string }) {
  shader.vertexShader = `attribute float _paint;\n${shader.vertexShader}`.replace(
    '#include <color_vertex>',
    '#include <color_vertex>\n\tvColor.rgb = mix(color.rgb, instanceColor.rgb, _paint);',
  );
}

/** Paris "Luxembourg" park chair (≈ 80 triangles), front toward −Z (a Seat's yaw), origin on the ground under the seat. */
function chairGeometry(): BufferGeometry {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) =>
    new BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z);
  return mergeGeometries([
    box(0.44, 0.03, 0.42, 0, 0.44, 0), // seat
    box(0.44, 0.42, 0.03, 0, 0.7, 0.23, -0.18), // back, leaning back
    ...[-0.2, 0.2].flatMap((x) => [box(0.025, 0.45, 0.025, x, 0.225, -0.18), box(0.025, 0.9, 0.025, x, 0.45, 0.2, -0.1)]), // legs
  ])!;
}

/** Pole (origin on the ground) with the signal housing on top; the lamps look toward +Z. */
function poleGeometry(): BufferGeometry {
  const h = R.lights.pole;
  return mergeGeometries([
    new CylinderGeometry(0.05, 0.06, h, 8).translate(0, h / 2, 0),
    new BoxGeometry(0.3, 0.85, 0.22).translate(0, h - 0.425, 0.12),
  ])!;
}
const local = new Vector3(), inv = new Matrix4();
/** `eye` (world) within npcRender.cameraClear m of the template's bounding box placed by `m`. */
function eyeInside(geometry: BufferGeometry, m: Matrix4, eye: Vector3): boolean {
  const box = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox)!;
  return box.distanceToPoint(local.copy(eye).applyMatrix4(inv.copy(m).invert())) <= R.cameraClear;
}
const BULB_Y = { red: -0.2, amber: -0.425, green: -0.65 } as const; // below the pole top

export class NpcRenderer {
  readonly root = new Group();
  /** Per kind; a kind missing from the assets is not drawn. */
  readonly carMeshes = new Map<CarKind, InstancedMesh>();
  readonly wheels: InstancedMesh;
  readonly poles: InstancedMesh;
  readonly bulbs: InstancedMesh;
  readonly zebras: InstancedMesh;
  readonly chairs: InstancedMesh;
  private heads: readonly SignalHead[] = [];
  private readonly headAt: Vector3[] = []; // pole foot per head

  constructor(private readonly assets: NpcAssets) {
    const paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
    paint.onBeforeCompile = paintShader;
    for (const [kind, t] of assets.vehicles) {
      const m = instanced(t.geometry, paint, CAPACITY, true);
      m.castShadow = m.receiveShadow = true;
      m.name = `npc-${kind}`;
      this.carMeshes.set(kind, m);
      this.root.add(m);
    }
    const wheel = new CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2); // axis X, radius 1, width 1
    this.wheels = instanced(wheel, new MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.9 }), MAX_WHEELS);
    this.wheels.castShadow = true;
    this.poles = instanced(poleGeometry(), new MeshStandardMaterial({ color: R.lights.colour, roughness: 0.6 }), MAX_HEADS);
    this.bulbs = instanced(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ toneMapped: false }), MAX_HEADS, true);
    const marking = new MeshStandardMaterial({ color: RC.colours.marking, roughness: 0.7, polygonOffset: true });
    Object.assign(marking, { polygonOffsetFactor: RC.polygonOffset.marking, polygonOffsetUnits: RC.polygonOffset.marking });
    this.zebras = instanced(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), marking, MAX_STRIPES);
    this.zebras.receiveShadow = true;
    this.chairs = instanced(chairGeometry(), new MeshStandardMaterial({ color: R.chair.colour, roughness: 0.5 }), MAX_CHAIRS);
    this.chairs.receiveShadow = true;
    this.root.add(this.wheels, this.poles, this.bulbs, this.zebras, this.chairs);
  }

  /** Every car at its render pose; wheels roll by CarPose.wheel (m) / the template's wheel radius. A car whose body box
   *  (+ npcRender.cameraClear m) holds `eye` is not drawn: the camera ignores NPC colliders (IGNORE_NPC), so a car stopped
   *  behind the player would fill the frame with its inside (review M5). */
  cars(cars: readonly CarPose[], prev: ReadonlyMap<number, Snap>, alpha: number, eye?: Vector3) {
    for (const mesh of this.carMeshes.values()) mesh.count = 0;
    let w = 0;
    for (const c of cars) {
      const mesh = this.carMeshes.get(c.kind);
      const t = this.assets.vehicles.get(c.kind);
      if (!mesh || !t || mesh.count >= CAPACITY) continue;
      const p = lerpPose(c, prev.get(c.id), alpha, pose);
      m4.compose(pos.set(p.x, p.y, p.z), carQuaternion(p.yaw, p.pitch, quat), scl.set(1, 1, 1));
      if (eye && eyeInside(t.geometry, m4, eye)) continue;
      const i = mesh.count++;
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setHex(c.paint));
      for (const [ax, ay, az] of t.axles) {
        if (w >= MAX_WHEELS) break;
        r4.makeRotationX(p.wheel / (t.wheelRadius || 1)).scale(scl.set(R.wheelWidth, t.wheelRadius, t.wheelRadius)).setPosition(ax, ay, az);
        this.wheels.setMatrixAt(w++, w4.multiplyMatrices(m4, r4));
      }
    }
    for (const mesh of this.carMeshes.values()) done(mesh, mesh.count);
    done(this.wheels, w);
  }

  /** Signal heads near the anchor (gathered again every npcRender.refresh m): the pole foot is SignalHead (x, z) itself
   *  (already on the right kerb, types.ts); its lamps (+Z of the housing) look along SignalHead.yaw = (−sin, −cos). */
  setLights(heads: readonly SignalHead[], roads: NpcRoads) {
    this.heads = heads.slice(0, MAX_HEADS);
    this.headAt.length = 0;
    this.heads.forEach((h, i) => {
      const way = roads.graph.edgeWay[h.edge]!;
      const y = roads.heightAt(h.x, h.z) + (roads.sidewalk(way) > 0 ? RC.lift + RC.curbHeight : 0);
      this.headAt.push(new Vector3(h.x, y, h.z));
      this.poles.setMatrixAt(i, m4.compose(pos.set(h.x, y, h.z), quat.setFromAxisAngle(UP, h.yaw + Math.PI), scl.set(1, 1, 1)));
    });
    done(this.poles, this.heads.length);
  }

  /** Lit bulb of every head: the colour its arriving cars see now. */
  lightColours(q: LightQuery) {
    this.heads.forEach((h, i) => {
      const c = q.car(h.junction, h.edge);
      const f = this.headAt[i]!;
      const [fx, fz] = [-Math.sin(h.yaw) * R.lights.bulbOut, -Math.cos(h.yaw) * R.lights.bulbOut]; // where the lamps look
      this.bulbs.setMatrixAt(i, m4.makeTranslation(f.x + fx, f.y + R.lights.pole + BULB_Y[c], f.z + fz));
      this.bulbs.setColorAt(i, col.set(R.lights.bulbs[c]));
    });
    done(this.bulbs, this.heads.length);
  }

  /** Zebra stripes at every crossing node on an NPC car edge within npcRender.zebra.radius (not at junctions). */
  setZebras(roads: NpcRoads, x: number, z: number) {
    const { graph: g } = roads;
    const Z = R.zebra;
    const nodes = new Set<number>();
    for (const e of g.edgesNear(x, z, Z.radius)) {
      if (!roads.car[e]) continue;
      for (const n of [g.edgeA[e]!, g.edgeB[e]!]) if (roads.crossing[n] && Math.hypot(g.x[n]! - x, g.z[n]! - z) <= Z.radius) nodes.add(n);
    }
    let k = 0;
    for (const n of [...nodes].sort((a, b) => a - b)) {
      const edges = g.edgesOf(n).filter((e) => roads.car[e]);
      if (edges.length > 2) continue; // a junction centre: no single road axis
      const e = edges[0]!;
      const o = g.edgeA[e] === n ? g.edgeB[e]! : g.edgeA[e]!;
      const yaw = Math.atan2(-(g.x[o]! - g.x[n]!), -(g.z[o]! - g.z[n]!)); // along the road
      const y = roads.heightOn(e, g.edgeA[e] === n ? 0 : g.edgeLength[e]!) + RC.surfaceLift.pave! + RC.markingLift;
      const half = roads.halfWidth(g.edgeWay[e]!);
      const count = Math.floor((2 * half - Z.stripe) / (2 * Z.stripe)); // a stripe of margin at each kerb
      quat.setFromAxisAngle(UP, yaw);
      for (let s = 0; s < count && k < MAX_STRIPES; s++) {
        const across = (s - (count - 1) / 2) * 2 * Z.stripe; // right = (cos, −sin) of yaw
        pos.set(g.x[n]! + Math.cos(yaw) * across, y, g.z[n]! - Math.sin(yaw) * across);
        this.zebras.setMatrixAt(k++, m4.compose(pos, quat, scl.set(Z.stripe, 1, Z.depth)));
      }
    }
    done(this.zebras, k);
  }

  setChairs(seats: readonly Seat[], heightAt: (x: number, z: number) => number) {
    const list = seats.slice(0, MAX_CHAIRS);
    list.forEach((s, i) => this.chairs.setMatrixAt(i, m4.compose(pos.set(s.x, heightAt(s.x, s.z), s.z), quat.setFromAxisAngle(UP, s.yaw), scl.set(1, 1, 1))));
    done(this.chairs, list.length);
  }
}
