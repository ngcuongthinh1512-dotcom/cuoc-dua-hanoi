// PLACEHOLDER world until Phase 2 replaces it with OSM chunks (ChunkManager, buildings, roads, Seine…):
// flat ground with a 100 m / 1 km grid for scale, the race bbox outline, an obelisk at the origin, and a few
// Rapier boxes dropped next to it to prove physics works.
import RAPIER from '@dimforge/rapier3d-compat';
import { latLonToWorld } from '@race/shared';
import * as THREE from 'three';
import { physics, RACE_BBOX as B, render } from '../config.ts';

export function createDevScene(scene: THREE.Scene) {
  const { hemiLight: h, sun: s } = render;
  scene.add(new THREE.HemisphereLight(h.sky, h.ground, h.intensity));
  const sun = new THREE.DirectionalLight(s.color, s.intensity);
  sun.position.copy(s.position); // target stays at the origin
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(render.shadowMapSize);
  sun.shadow.radius = render.shadowRadius;
  sun.shadow.bias = render.shadowBias;
  sun.shadow.normalBias = render.shadowNormalBias;
  // ponytail: one fixed shadow box around the origin; cascaded shadow maps (SPEC §14) replace it later.
  const e = render.shadowHalfExtent;
  Object.assign(sun.shadow.camera, { left: -e, right: e, bottom: -e, top: e, near: 1, far: render.shadowFar });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const corners = [
    [B.south, B.west],
    [B.south, B.east],
    [B.north, B.east],
    [B.north, B.west],
  ].map(([lat, lon]) => {
    const p = latLonToWorld(lat, lon);
    return new THREE.Vector3(p.x, 0, p.z);
  });
  const box = new THREE.Box3().setFromPoints(corners);
  const size = box.getSize(new THREE.Vector3()).addScalar(2 * render.far); // edge always beyond the far plane
  const center = box.getCenter(new THREE.Vector3());

  // Grid painted into a 1 km texture (100 m cells) rather than GL lines: 1 px lines alias, z-fight with the
  // ground, and headless SwiftShader drops line segments that cross the camera plane.
  const tile = document.createElement('canvas');
  tile.width = tile.height = 1000; // 1 px = 1 m
  const g2d = tile.getContext('2d')!;
  const cross = (at: number, width: number, color: string) => {
    g2d.fillStyle = color;
    g2d.fillRect(at, 0, width, 1000);
    g2d.fillRect(0, at, 1000, width);
  };
  cross(0, 1000, '#8a9187'); // background
  for (let m = 100; m < 1000; m += 100) cross(m - 1.5, 3, '#737a70');
  for (const m of [0, 997]) cross(m, 3, '#5d645a'); // 1 km lines straddle the tile edge, so one meets the origin
  const grid = new THREE.CanvasTexture(tile);
  grid.colorSpace = THREE.SRGBColorSpace;
  grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
  grid.anisotropy = 8;

  const groundGeo = new THREE.PlaneGeometry(size.x, size.z).rotateX(-Math.PI / 2).translate(center.x, 0, center.z);
  const pos = groundGeo.getAttribute('position');
  const uv = groundGeo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1000, -pos.getZ(i) / 1000); // UV in km, world-aligned
  // Pushed back one depth step so the bbox outline never z-fights with it, even from ~4 km up.
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ map: grid, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // Bbox outline: a low 20 m-wide red strip per edge (visible top-down and from the ground).
  const red = new THREE.MeshBasicMaterial({ color: 0xd8321f });
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % 4];
    const edge = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b) + 20, 1, 20), red);
    edge.position.addVectors(a, b).multiplyScalar(0.5);
    edge.rotation.y = Math.atan2(a.z - b.z, b.x - a.x);
    scene.add(edge);
  });

  const stone = new THREE.MeshStandardMaterial({ color: 0xc8b48c, roughness: 0.85 });
  const shaft = new THREE.CylinderGeometry(1.1, 1.75, 21, 4).rotateY(Math.PI / 4).translate(0, 10.5, 0);
  const tip = new THREE.ConeGeometry(1.1, 2, 4).rotateY(Math.PI / 4).translate(0, 22, 0);
  for (const g of [shaft, tip]) {
    const m = new THREE.Mesh(g, stone);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  const world = new RAPIER.World(physics.gravity);
  world.timestep = physics.fixedDt;
  world.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2, 1, size.z / 2).setTranslation(center.x, -1, center.z));

  const q = new THREE.Quaternion();
  const boxes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const s = 1 + (i % 3) * 0.6;
    q.setFromEuler(new THREE.Euler(i * 0.7, i * 1.3, i * 0.4));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(Math.cos(a) * 9, 3 + i * 1.5, Math.sin(a) * 9).setRotation(q),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2), body);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 8, 0.65, 0.5) }),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return { body, mesh };
  });
  const sync = () => {
    for (const { body, mesh } of boxes) {
      mesh.position.copy(body.translation());
      mesh.quaternion.copy(body.rotation());
    }
  };
  sync();

  return {
    /** One fixed physics step (dt = physics.fixedDt), then meshes follow their bodies. */
    step() {
      world.step();
      sync();
    },
    get bodyCount() {
      return world.bodies.len();
    },
    /** All dropped boxes have come to rest (Rapier put them to sleep). */
    get settled() {
      return boxes.every((b) => b.body.isSleeping());
    },
  };
}
