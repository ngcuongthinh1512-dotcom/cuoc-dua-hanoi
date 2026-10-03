// DEV TURNTABLE (Track A, docs/plans/phase4.md): a row of bikes, no world. Dev server only (/bike.html?…):
//   items=90,35,180   one bike per item: heading ° (0 = away from the camera, 90 = side view facing left); `yaw@crank`
//     fixes that bike's crank angle (°) · rider=1   the player on each bike (seated, IK) · speed=<m/s>   rolled for t s
//   t=<s> (default 1) · lean=<°> (+ = right) · steer=<°> (+ = left) · owner=<#hex>   team lock marker · sparkle=1
//   crash=1   bikes lying on their side, the player in the crash pose beside them · dist=<m> camera distance
import * as THREE from 'three';
import { bike as B, bikeModel, playerSetup, render as R } from '../config.ts';
import { CharacterAnimator } from '../player/Animation.ts';
import { CharacterModel, loadCharacterAsset } from '../player/CharacterModel.ts';
import type { PlayerState } from '../player/types.ts';
import { BikeModel, loadBikeAsset, rollWheels } from './BikeModel.ts';
import type { BikeState } from './types.ts';

const DEG = Math.PI / 180;
const q = new URLSearchParams(location.search);
const num = (k: string, d = 0) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
const items = (q.get('items') ?? '90,35,180').split(',').map((s) => s.split('@').map(Number) as [number, number?]);
const [rider, crash, T, speed] = [q.get('rider') === '1', q.get('crash') === '1', num('t', 1), num('speed')];
const GAP = 2.4; // m between bikes

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = R.exposure;
renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9bccd');
scene.add(new THREE.HemisphereLight('#e4ecf4', '#6b5d4c', 1.6));
const sun = new THREE.DirectionalLight('#fff2dc', 2.6);
sun.position.set(-4, 9, 7);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
sun.shadow.mapSize.setScalar(2048);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a39a8c' }));
ground.receiveShadow = true;
scene.add(ground);

const [bikeAsset, charAsset] = await Promise.all([loadBikeAsset(), rider || crash ? loadCharacterAsset() : undefined]);
const width = (items.length - 1) * GAP;
const person = (b: BikeState, mode: PlayerState['moveMode'], action: PlayerState['action'], t: number): PlayerState => ({
  position: b.position, velocity: new THREE.Vector3(0, 0, -b.speed), yaw: b.yaw, grounded: true, inWater: false,
  moveMode: mode, jumps: 0, action, actionTime: t,
});
items.forEach(([yawDeg, crankDeg], i) => {
  const b: BikeState = {
    id: `b${i}`, position: new THREE.Vector3(i * GAP - width / 2, 0, 0), yaw: yawDeg * DEG, speed, steer: num('steer') * DEG,
    lean: crash ? bikeModel.fallenLeanDeg * DEG : num('lean') * DEG, wheelAngle: 0, crankAngle: (crankDeg ?? 0) * DEG,
    owner: q.has('owner') ? 'team' : null, rider: rider ? 'p' : null,
  };
  const model = new BikeModel(bikeAsset);
  scene.add(model.root);
  const person3d = charAsset ? new CharacterModel(charAsset, { shirt: playerSetup.teamColour }) : undefined;
  const anim = person3d ? new CharacterAnimator(person3d) : undefined;
  if (person3d) scene.add(person3d.root);
  for (let t = 0, dt = 1 / 60; t < T; t += dt) {
    if (crankDeg === undefined) rollWheels(b, speed * dt);
    model.update(b, q.get('sparkle') === '1', dt);
    if (!person3d || !anim) continue;
    if (crash) {
      // beyond the bike lying on its right side (it covers ≈ 1.2 m), lying (crashPose ≈ 1.5 s)
      const side = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw)).multiplyScalar(B.dismountSide + 1);
      person3d.setPose(b.position.clone().add(side), b.yaw);
      anim.update(person(b, 'walk', 'crash', Math.min(t, 1.5)), dt);
    } else {
      person3d.setPose(b.position, b.yaw);
      anim.setRider(model.riderTargets(), b.lean);
      anim.update(person(b, 'bike', 'none', t), dt);
    }
  }
});

const camera = new THREE.PerspectiveCamera(R.fov, innerWidth / innerHeight, 0.1, 200);
const tanHalfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
camera.position.set(0, 1.3, num('dist') || (width / 2 + 1.3) / tanHalfW);
camera.lookAt(0, 0.7, 0);
let frames = 0;
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  if (++frames !== 3) return;
  const { calls, triangles } = renderer.info.render;
  Object.assign(window, { __STATS__: { calls, triangles }, __READY__: true });
});
