// Bike model (public/models/bike.glb from scripts/process-assets.ts): real-world size, parts, wheel roll = v / r,
// kickstand / fallen poses, rider targets.
import { readFileSync, statSync } from 'node:fs';
import { Box3, type Object3D, SkinnedMesh, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { bikeModel as C } from '../config.ts';
import { BIKE_PARTS, type BikeAsset, BikeModel, rollWheels } from './BikeModel.ts';
import type { BikeState } from './types.ts';

const FILE = new URL('../../public/models/bike.glb', import.meta.url);
const DEG = Math.PI / 180;

export async function loadBike(): Promise<BikeAsset> {
  const buf = readFileSync(FILE);
  const gltf = await new Promise<{ scene: Object3D }>((res, rej) =>
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer, '', res as never, rej),
  );
  return { scene: gltf.scene };
}

export const bikeState = (o: Partial<BikeState> = {}): BikeState => ({
  id: 'b1', position: new Vector3(), yaw: 0, speed: 0, steer: 0, lean: 0, wheelAngle: 0, crankAngle: 0,
  owner: null, ownerColour: null, rider: null, ...o,
});

/** Skinned vertex positions (world), optionally only those of one bone. */
function vertices(m: BikeModel, part?: string) {
  m.root.updateMatrixWorld(true);
  const out: Vector3[] = [];
  m.root.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    const j = part === undefined ? -1 : o.skeleton.bones.findIndex((b) => b.name === part);
    const idx = o.geometry.getAttribute('skinIndex');
    for (let i = 0; i < idx.count; i++) if (j < 0 || idx.getX(i) === j) out.push(o.getVertexPosition(i, new Vector3()).applyMatrix4(o.matrixWorld));
  });
  return out;
}

describe('bike.glb', async () => {
  const asset = await loadBike();

  it('one skinned primitive, the part bones, ≤ 6k triangles, ≤ 300 KB', () => {
    const meshes: SkinnedMesh[] = [];
    asset.scene!.traverse((o) => o instanceof SkinnedMesh && meshes.push(o));
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.skeleton.bones.map((b) => b.name).sort()).toEqual([...BIKE_PARTS].sort());
    expect(meshes[0]!.geometry.index!.count / 3).toBeLessThanOrEqual(6000);
    expect(statSync(FILE).size).toBeLessThanOrEqual(300 * 1024);
  });

  it('real size: ground at y 0, 1.7–1.9 m long, wheel radius = bikeModel.wheelRadius, saddle ≈ 0.95 m', () => {
    const m = new BikeModel(asset);
    m.update(bikeState({ rider: 'p' }), false, 0); // upright
    const box = new Box3().setFromPoints(vertices(m));
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.02);
    expect(box.max.z - box.min.z).toBeGreaterThan(1.7);
    expect(box.max.z - box.min.z).toBeLessThan(1.9);
    for (const w of ['wheelF', 'wheelR']) {
      const c = m.root.getObjectByName(w)!.getWorldPosition(new Vector3());
      const r = Math.max(...vertices(m, w).map((v) => v.distanceTo(c)));
      expect(r, w).toBeCloseTo(C.wheelRadius, 2);
      expect(c.y, w).toBeCloseTo(C.wheelRadius, 2); // on the ground
    }
    const t = m.riderTargets();
    expect(t.saddle.y - C.rider.pelvis).toBeCloseTo(C.build.saddle, 2);
    expect(t.gripL.x * t.gripR.x).toBeLessThan(0);
  });

  it('wheel angle = distance / radius, crank = wheel / gear ratio; the wheel bone turns by it', () => {
    const b = bikeState();
    rollWheels(b, 2);
    rollWheels(b, 1.3);
    expect(b.wheelAngle).toBeCloseTo(3.3 / C.wheelRadius, 9);
    expect(b.crankAngle).toBeCloseTo(b.wheelAngle / C.gearRatio, 9);
    const m = new BikeModel(asset);
    m.update(b, false, 0);
    expect(m.root.getObjectByName('wheelR')!.rotation.x).toBe(b.wheelAngle);
  });

  it('parked: leans on the kickstand, its tip on the ground; ridden: folded; fallen (crash): lies on its side', () => {
    const m = new BikeModel(asset);
    m.update(bikeState(), false, 0);
    const standMin = () => Math.min(...vertices(m, 'stand').map((v) => v.y));
    expect(Math.abs(standMin())).toBeLessThan(0.02);
    expect(Math.min(...vertices(m).map((v) => v.y))).toBeGreaterThan(-0.03);
    m.update(bikeState({ rider: 'p' }), false, 1);
    expect(standMin()).toBeGreaterThan(0.1);
    const fallen = new BikeModel(asset);
    fallen.update(bikeState({ lean: C.fallenLeanDeg * DEG }), false, 0);
    const ys = vertices(fallen).map((v) => v.y);
    expect(Math.min(...ys)).toBeGreaterThan(-0.04); // grip end on the ground, nothing buried
    expect(Math.max(...ys)).toBeLessThan(0.7);
  });

  it('lock marker only while owned and parked; sparkle only when asked', () => {
    const m = new BikeModel(asset);
    const lock = () => m.root.getObjectsByProperty('type', 'Sprite')[0]!.visible;
    const sparkle = () => m.root.getObjectsByProperty('type', 'Points')[0]!.visible;
    m.update(bikeState(), true, 0.1);
    expect([lock(), sparkle()]).toEqual([false, true]);
    m.update(bikeState({ owner: 't', ownerColour: '#2c6bd8' }), false, 0.1);
    expect([lock(), sparkle()]).toEqual([true, false]);
    m.update(bikeState({ owner: 't', ownerColour: '#2c6bd8', rider: 'p' }), false, 0.1);
    expect(lock()).toBe(false);
  });
});
