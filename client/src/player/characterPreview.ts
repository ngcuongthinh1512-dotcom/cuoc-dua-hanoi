// DEV TURNTABLE (Track A, docs/plans/phase3.md): the player body in a row of poses, two team colours alternating, no
// world. Dev server only (/character.html?…):
//   poses=idle,walk,jog,air,wave,openBox,celebrate,crash   one character per pose (AnimState / gesture names;
//     `pose@s` = its own simulated time) · turn=<°>   extra body yaw (0 = facing the camera; 180 = backs)
//   t=<s>   simulated time of the poses without @ (gestures start at 0) · dist=<m>   camera distance (default: fits the row)
import * as THREE from 'three';
import { movement, playerSetup, render as R } from '../config.ts';
import { CharacterAnimator } from './Animation.ts';
import { CharacterModel, loadCharacterAsset } from './CharacterModel.ts';
import type { Gesture, PlayerState } from './types.ts';

const q = new URLSearchParams(location.search);
const poses = (q.get('poses') ?? 'idle,walk,jog,air,wave,openBox,celebrate,crash').split(',');
const turn = THREE.MathUtils.degToRad(Number(q.get('turn') ?? 20));
const T = Number(q.get('t') ?? 1.2);
const TEAMS = [['#d8342c', 'Đội Đỏ'], ['#2c6bd8', 'Đội Xanh']] as const;
const GAP = 1.3; // m between characters
const LIFT: Record<string, number> = { air: 0.4 }; // m: the jump loop above the ground

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

const walk = 1.4; // m/s: a slow stride (the "walk" clip, below character.jogFrom)
function state(pose: string, t: number): PlayerState {
  const gesture = pose in playerSetup.actions;
  const speed = pose === 'jog' ? movement.footSpeed : pose === 'walk' ? walk : 0;
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 0, -speed),
    yaw: 0,
    grounded: pose !== 'air',
    inWater: false,
    moveMode: pose === 'air' ? 'air' : 'walk',
    jumps: 0,
    action: gesture ? (pose as Gesture) : 'none',
    actionTime: gesture ? t : 0,
  };
}

const asset = await loadCharacterAsset();
const width = (poses.length - 1) * GAP;
const cast = poses.map((p, i) => {
  const [pose, at] = p.split('@') as [string, string?];
  const [shirt, name] = TEAMS[i % 2]!;
  const model = new CharacterModel(asset, { shirt, name: i < 2 ? name : null }); // two tags: the rest would overlap
  model.setPose(new THREE.Vector3(i * GAP - width / 2, LIFT[pose] ?? 0, 0), Math.PI + turn); // yaw π faces +Z (camera)
  scene.add(model.root);
  const anim = new CharacterAnimator(model);
  for (let t = 0, dt = 1 / 60; t < Number(at ?? T); t += dt) anim.update(state(pose, t), dt);
  return anim;
});

const camera = new THREE.PerspectiveCamera(R.fov, innerWidth / innerHeight, 0.1, 200); // game fov: same name tag size
const tanHalfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
camera.position.set(0, 1.6, Number(q.get('dist')) || (width / 2 + 0.9) / tanHalfW);
camera.lookAt(0, 0.9, 0);
let frames = 0;
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  if (++frames !== 3) return;
  const { calls, triangles } = renderer.info.render;
  Object.assign(window, { __STATS__: { calls, triangles, states: cast.map((a) => a.state) }, __READY__: true });
});
