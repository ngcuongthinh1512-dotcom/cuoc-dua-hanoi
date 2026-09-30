// Track A (docs/plans/phase4.md): the Vélib'-style bicycle (public/models/bike.glb from scripts/process-assets.ts), loaded
// once and cloned per bike: wheels + crank spin from BikeState, lean and steer, kickstand, team lock marker, sparkle when
// available. One skinned primitive (the parts are bones: 1 draw call) + the lock sprite + the sparkle points.
// Unreadable file → console.warn and a grey box (the game still runs).
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { bikeModel as C } from '../config.ts';
import type { BikeState, RiderTargets } from './types.ts';

const DEG = Math.PI / 180;
const IDENTITY = new Quaternion();
/** Bones of bike.glb (scripts/process-assets.ts JOINTS). */
export const BIKE_PARTS = ['frame', 'fork', 'wheelF', 'wheelR', 'crank', 'pedalL', 'pedalR', 'stand'] as const;
type Part = (typeof BIKE_PARTS)[number];

export interface BikeAsset {
  /** Skinned bike (bones = BIKE_PARTS), null = placeholder box. Shared geometry: never dispose it per model. */
  readonly scene: Object3D | null;
}

/** Loads models/bike.glb once; unreadable → console.warn and the placeholder (the game still runs). */
export async function loadBikeAsset(url = C.url): Promise<BikeAsset> {
  try {
    return { scene: (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene };
  } catch (e) {
    console.warn(`BikeModel: ${url} missing or unreadable, box stand-in`, e);
    return { scene: null };
  }
}

/** Advances the wheel / crank angles by `distance` m rolled (+ forward): wheel = distance / radius, crank = wheel / gear. */
export function rollWheels(b: BikeState, distance: number) {
  b.wheelAngle += distance / C.wheelRadius;
  b.crankAngle += distance / C.wheelRadius / C.gearRatio;
}

/** Displayed roll: ridden = the state's lean; parked = on the kickstand, or lying on its side (|lean| ≥ 30°, a crash). */
export function shownLean(b: Readonly<BikeState>) {
  if (b.rider !== null || Math.abs(b.lean) >= 30 * DEG) return b.lean;
  return -C.standLeanDeg * DEG; // kickstand on the left
}

/** Tiny procedural RGBA textures (no DOM: also built in tests). `alpha(x, y)` in [-1, 1]² → 0…1. */
function texture(alpha: (x: number, y: number) => number, n = 32) {
  const d = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      d.set([255, 255, 255, Math.round(255 * Math.max(0, Math.min(1, alpha((2 * i + 1) / n - 1, 1 - (2 * j + 1) / n))))], (j * n + i) * 4);
    }
  }
  const t = new DataTexture(d, n, n);
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}
let shared: { sparkle: PointsMaterial; lock: DataTexture } | undefined;
const sharedAssets = () =>
  (shared ??= {
    sparkle: new PointsMaterial({
      size: C.sparkle.size,
      map: texture((x, y) => Math.max(0, 1 - Math.hypot(x, y)) ** 2 + Math.max(0, 1 - 6 * Math.abs(x) - Math.abs(y)) + Math.max(0, 1 - 6 * Math.abs(y) - Math.abs(x))),
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    // padlock: body y ∈ [-0.9, 0.1], shackle ring above it
    lock: texture((x, y) => (Math.abs(x) < 0.75 && y > -0.9 && y < 0.1 ? 1 : 0) + (y >= 0.1 && Math.abs(Math.hypot(x, y - 0.1) - 0.45) < 0.14 ? 1 : 0)),
  });

export class BikeModel {
  readonly root = new Group();
  /** The cloned asset under root (turned π: glTF faces +Z, yaw 0 faces −Z), rolled by the lean about the ground line. */
  private readonly body: Object3D;
  private readonly bones: Partial<Record<Part, Object3D>> = {};
  private readonly steerAxis = new Vector3(0, 1, 0);
  private readonly fold = new Quaternion();
  private readonly local = { saddle: new Vector3(0, 1, -0.2), gripL: new Vector3(), gripR: new Vector3() };
  private readonly targets: RiderTargets = {
    saddle: new Vector3(), pedalL: new Vector3(), pedalR: new Vector3(), gripL: new Vector3(), gripR: new Vector3(),
  };
  private readonly sparkle: Points;
  private readonly lock: Sprite;
  private roll: number | undefined;
  private time = 0;

  constructor(asset: BikeAsset) {
    if (asset.scene) {
      this.body = cloneSkinned(asset.scene);
      this.body.traverse((o) => {
        if ((BIKE_PARTS as readonly string[]).includes(o.name)) this.bones[o.name as Part] = o;
        if (o instanceof Mesh) o.castShadow = o.receiveShadow = true;
      });
      const [frame, fork, stand] = [this.bones.frame?.userData, this.bones.fork?.userData, this.bones.stand?.userData];
      if (frame?.saddle) this.local.saddle.fromArray(frame.saddle as number[]);
      if (fork?.steerAxis) this.steerAxis.fromArray(fork.steerAxis as number[]);
      if (fork?.gripL) this.local.gripL.fromArray(fork.gripL as number[]);
      if (fork?.gripR) this.local.gripR.fromArray(fork.gripR as number[]);
      if (stand?.fold) this.fold.fromArray(stand.fold as number[]);
    } else {
      const box = new Mesh(new BoxGeometry(0.08, 1, 1.75), new MeshStandardMaterial({ color: C.colours.frame }));
      box.position.y = 0.5;
      this.body = new Group().add(box);
    }
    this.body.rotation.y = Math.PI;
    this.root.add(this.body);
    const S = C.sparkle;
    const pos: number[] = [];
    for (let i = 0; i < S.count; i++) {
      const a = i * 2.39996; // golden angle: evenly spread, deterministic
      const r = 0.55 + 0.35 * ((i * 0.618) % 1);
      pos.push(Math.sin(a) * r * 0.6, 0.15 + (S.height - 0.15) * ((i * 0.382 + 0.2) % 1), Math.cos(a) * r);
    }
    const g = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(new Float32Array(pos.length), 3));
    const A = sharedAssets();
    this.sparkle = new Points(g, A.sparkle);
    this.sparkle.visible = false;
    this.root.add(this.sparkle);
    this.lock = new Sprite(new SpriteMaterial({ map: A.lock, depthWrite: false }));
    this.lock.scale.setScalar(C.lock.size);
    this.lock.position.copy(this.local.saddle).setY(this.local.saddle.y + C.lock.lift);
    this.lock.visible = false;
    this.body.add(this.lock);
  }

  /** Pose from the state: position (pivot at ground contact), yaw, lean, steer, wheel / crank angles, lock marker
   *  (ownerColour), sparkle on/off (the caller decides: available and ≤ bikeRules.sparkleRadius from the local player). */
  update(b: Readonly<BikeState>, sparkle: boolean, dt: number) {
    this.time += dt;
    this.root.position.copy(b.position);
    this.root.rotation.y = b.yaw;
    const target = shownLean(b);
    this.roll = this.roll === undefined ? target : this.roll + (target - this.roll) * (1 - Math.exp((-3 * dt) / C.mountBlend));
    this.body.rotation.z = this.roll;
    this.body.position.y = C.fallenLift * Math.sin(this.roll) ** 2;
    const B = this.bones;
    if (B.wheelF) B.wheelF.rotation.x = b.wheelAngle;
    if (B.wheelR) B.wheelR.rotation.x = b.wheelAngle;
    if (B.crank) B.crank.rotation.x = b.crankAngle;
    // Pedals level, then tilted with the rider's ankle (Animation.ts): heel down in front of the axle, toes down behind
    const [cos, sin] = [Math.cos(b.crankAngle), Math.sin(b.crankAngle)];
    for (const p of [B.pedalL, B.pedalR]) {
      if (!p) continue;
      const { y, z } = p.position; // from the axle, crank frame
      p.rotation.x = -b.crankAngle - (C.rider.ankleDeg * DEG * (y * sin + z * cos)) / Math.hypot(y, z);
    }
    B.fork?.quaternion.setFromAxisAngle(this.steerAxis, b.steer);
    B.stand?.quaternion.copy(b.rider === null && Math.abs(target) < 30 * DEG ? IDENTITY : this.fold);
    this.lock.visible = b.ownerColour !== null && b.rider === null;
    if (b.ownerColour) this.lock.material.color.set(b.ownerColour);
    this.sparkle.visible = sparkle;
    if (sparkle) {
      const c = this.sparkle.geometry.getAttribute('color') as Float32BufferAttribute;
      for (let i = 0; i < c.count; i++) {
        const k = Math.max(0, Math.sin(2 * Math.PI * C.sparkle.hz * this.time + i * 2.1)) ** 2;
        c.setXYZ(i, k, k * 0.92, k * 0.6);
      }
      c.needsUpdate = true;
    }
  }

  /** World IK targets at the current pose (after update): pelvis bone on the saddle, ball of each foot on its pedal,
   *  hands on the grips (bikeModel.rider offsets along the bike's up). */
  riderTargets(): RiderTargets {
    this.root.updateMatrixWorld(true);
    const t = this.targets;
    const [B, L, R] = [this.bones, this.local, C.rider];
    if (!B.frame || !B.fork || !B.pedalL || !B.pedalR) {
      for (const v of Object.values(t) as Vector3[]) v.set(0, 1, 0).applyMatrix4(this.body.matrixWorld);
      return t;
    }
    B.frame.localToWorld(t.saddle.copy(L.saddle).setY(L.saddle.y + R.pelvis));
    B.fork.localToWorld(t.gripL.copy(L.gripL));
    B.fork.localToWorld(t.gripR.copy(L.gripR));
    B.pedalL.localToWorld(t.pedalL.set(0, R.foot, 0));
    B.pedalR.localToWorld(t.pedalR.set(0, R.foot, 0));
    return t;
  }

  dispose() {
    this.body.traverse((o) => o instanceof SkinnedMesh && o.skeleton.dispose());
    this.sparkle.geometry.dispose();
    this.lock.material.dispose();
    this.root.removeFromParent();
  }
}
