// The CETIQLO store built headless: the hard performance gate (plan §1.8), the contract's geometry, and the game's capsule
// (CharacterController, the real Rapier KCC) walking floor 1 → the stair → floor 2 over the store's cuboid colliders.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOG, STORE } from '@race/shared/cetiqlo';
import { physics } from '../config.ts';
import { CharacterController, newIntent } from '../player/CharacterController.ts';
import { SHAPE_IDS, shapeGeometry, triangleCount } from './items.ts';
import { buildStore, FLOOR2_Y, type StoreHandle } from './storeScene.ts';

let store: StoreHandle;
beforeAll(() => { store = buildStore(new THREE.Scene()); });

describe('cetiqlo store budget', () => {
  it('≤ 150 draw calls, ≤ 200k triangles, ≤ 3 lights, no shadows, static matrices frozen', () => {
    store.mannequin.dress(['top.tee-crew.white', 'outer.padded-coat.black', 'bottom.jeans-wide.denim', 'shoes.sneaker.red', 'bag.backpack.olive', 'acc.cap.navy']);
    const b = store.budget();
    expect(b.meshes).toBeLessThanOrEqual(150);
    expect(b.triangles).toBeLessThanOrEqual(200_000);
    expect(b.lights).toBeLessThanOrEqual(3);
    store.group.traverse((ob) => {
      if (ob instanceof THREE.Light) expect(ob.castShadow).toBe(false);
      if (ob instanceof THREE.Mesh && !ob.parent?.name.includes('mannequin') && ob.name) expect(ob.matrixAutoUpdate, ob.name).toBe(false);
    });
  });
  it('every shape ≤ 200 triangles; items are InstancedMesh with instance colours', () => {
    for (const id of SHAPE_IDS) expect(triangleCount(shapeGeometry(id)), id).toBeLessThanOrEqual(200); // round 2: distinct silhouettes (was 120)
    const inst = store.group.getObjectByName('items')!.children;
    expect(inst.length).toBeGreaterThan(30);
    for (const m of inst) { expect(m).toBeInstanceOf(THREE.InstancedMesh); if (m.name !== 'hangers') expect((m as THREE.InstancedMesh).instanceColor).not.toBeNull(); }
    expect(inst.reduce((s, m) => s + (m as THREE.InstancedMesh).count, 0)).toBe(CATALOG.length + CATALOG.filter((i) => i.display === 'hang').length);
  });
});

describe('cetiqlo store contract', () => {
  it('anchors = catalog shelves; checkout, start spots, lobby and signs where the plan says', () => {
    expect(store.itemAnchors.size).toBe(CATALOG.length);
    for (const i of CATALOG) expect(store.itemAnchors.get(i.id)!.toArray()).toEqual([i.shelf.x, i.shelf.y, i.shelf.z]);
    expect(store.startSpots.length).toBeGreaterThanOrEqual(2);
    for (const s of store.startSpots) expect(Math.hypot(s.x - store.checkout.centre.x, s.z - store.checkout.centre.z)).toBeLessThan(8);
    expect(store.lobby.box.min.z).toBe(STORE.lobbyZ);
    expect(store.lobby.box.max.z).toBe(STORE.doorZ);
    expect(store.lobby.door.z).toBe(STORE.lobbyZ);
    expect(store.floorYAt(0, 5)).toBe(0);
    expect(store.floorYAt(0, -5)).toBe(0);
    expect(store.floorYAt(0, -5, FLOOR2_Y + 0.2)).toBe(FLOOR2_Y);
    expect(store.floorYAt(10, STORE.stair.zBottom - 0.1)).toBeCloseTo(STORE.stair.rise);
    expect(store.floorYAt(10, STORE.floor2Edge)).toBeCloseTo(FLOOR2_Y);
  });
  it('no walkable floor-1 item sits inside the stair or the checkout pad; floor 2 items over the slab', () => {
    for (const i of CATALOG) {
      if (i.floor === 2) expect(i.shelf.z).toBeLessThan(STORE.floor2Edge);
      else expect(i.shelf.x < STORE.stair.x0 - 0.5 || i.shelf.z < STORE.floor2Edge - 0.5).toBe(true);
    }
  });
});

describe('cetiqlo mannequin PiP camera', () => {
  it('frames the dressed figure: inside the frustum, centred, ≥ 70 % of the frame height (the camera is a child of the placed pedestal)', () => {
    store.mannequin.dress(['top.tee-crew.white', 'outer.padded-coat.black', 'bottom.jeans-wide.denim', 'shoes.sneaker.red', 'bag.backpack.olive', 'acc.cap.navy']);
    store.group.updateMatrixWorld(true);
    const cam = store.mannequin.pipCamera;
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const figure = store.mannequin.object.children.find((c) => c.type === 'Group')!; // the turning disc top: figure + clothes
    const box = new THREE.Box3().setFromObject(figure);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.5);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    expect(frustum.intersectsBox(box)).toBe(true);
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
      const p = new THREE.Vector3(sx ? box.max.x : box.min.x, sy ? box.max.y : box.min.y, sz ? box.max.z : box.min.z).project(cam);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    }
    expect(maxY - minY).toBeGreaterThanOrEqual(1.4); // ≥ 70 % of the NDC height
    expect(Math.abs((minY + maxY) / 2)).toBeLessThan(0.25); // centred
    expect(Math.abs((minX + maxX) / 2)).toBeLessThan(0.25);
  });
});

describe('cetiqlo stair walk (Rapier KCC)', () => {
  it('the capsule walks from the start spot up the stair onto floor 2 without jumping', async () => {
    await RAPIER.init();
    const world = new RAPIER.World(physics.gravity);
    world.timestep = physics.fixedDt;
    for (const b of store.colliders) {
      const d = RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z);
      if (b.yaw) d.setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) });
      world.createCollider(d);
    }
    const c = new CharacterController(world, { heightAt: () => 0, waterLevel: null, water: undefined });
    const ST = STORE.stair, x = (ST.x0 + ST.x1) / 2;
    c.spawn(x, ST.zBottom + 0.5, 0); // just in front of the first step (the lobby glass at z = 10 is 0.5 m behind), facing −z = up the stair
    const run = (s: number, forward: number) => { const i = { ...newIntent(), forward, cameraYaw: 0 }; for (let k = 0; k < Math.round(s / physics.fixedDt); k++) { c.fixedUpdate(physics.fixedDt, i); world.step(); } };
    run(0.5, 0);
    expect(c.state.position.y).toBeCloseTo(0, 1);
    let maxGap = 0;
    const walkAndTrack = (s: number) => { for (let t = 0; t < s; t += 0.1) { run(0.1, 1); const p = c.state.position; maxGap = Math.max(maxGap, Math.abs(p.y - store.floorYAt(p.x, p.z, p.y))); } };
    walkAndTrack(8);
    const p = c.state.position;
    expect(p.z).toBeLessThan(STORE.floor2Edge - 1); // past the top of the stair
    expect(p.y).toBeCloseTo(FLOOR2_Y, 1);
    expect(maxGap).toBeLessThan(0.45); // the feet never float / sink more than a step above floorYAt
    expect(c.state.moveMode).not.toBe('air');
  });
});
