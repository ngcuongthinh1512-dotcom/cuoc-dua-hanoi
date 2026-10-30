// DEV ROOM (client/hall.html): Salle Henry Le Bœuf (BOZAR, Brussels) as a self-contained Three.js interior — no OSM, no chunks.
// The hall itself is built by hallScene.ts `buildHall` (shared with the race room hallRoom.ts; here always the full `hq` look).
// Params: view=stalls|balcony|stage|ceiling|side|stage_close|plan (camera preset, default stalls) · cam=x,y,z,yawDeg,pitchDeg
// (free pose) · seat=J-14 = marker on that seat + camera behind it (seat numbers are data only: StallSeat.num / seatLabel;
// dev hook window.__HALL__.seat(row, num)) · stage=empty = bare stage (default: a symphony orchestra mid-performance)
// · tour=1 = slow cinematic dolly from the stalls to the stage and up to the dome (loops) · post=0 = no bloom / vignette.
// Look: ACES + bloom on the ribbons / lamps, warm vignette, additive light cones from the stage spots, one shadow-casting
// key light on the orchestra, baked AO (vertex / instance colours) under the balconies, procedural plaster / marble / wood /
// velvet / carpet textures, gilded panel strips + rosettes on the balcony fronts, dentils under the cornice.
// Controls: click = mouse look (pointer lock), WASD + Q/E (down/up), Shift = fast. Sets window.__READY__ after 3 frames.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { seatLabel, v3 } from './hallBuild.ts';
import { buildHall, hallMaterials } from './hallScene.ts';

const q = new URLSearchParams(location.search);
const PLAN = q.get('view') === 'plan', MAPMODE = q.get('map') === '1', POST = q.get('post') !== '0', TOUR = q.get('tour') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a120c');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const { seats, stalls } = buildHall(scene, { hq: true, plan: PLAN, map: MAPMODE, cones: POST, orchestra: q.get('stage') !== 'empty' });

// ---- camera + free-fly + post --------------------------------------------------------------------------------------
// dev hook + ?seat=<label>: floating marker over the seat and a camera 2.5 m behind it
Object.assign(window, { __HALL__: { seat: (row: string, num: number) => stalls.seats.find((s) => s.row === row && s.num === num && !s.rear), label: seatLabel } });
const picked = q.get('seat') ? stalls.seats.find((s) => seatLabel(s) === q.get('seat')!.toUpperCase()) : undefined;
if (picked) scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8).translate(picked.x, picked.y + 1.6, picked.z), hallMaterials(true).marker));
const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  stalls: [v3(0, 4.3, 15), v3(0, 12.5, -14)],
  balcony: [v3(0, 14.6, 25.5), v3(0, 8.5, -14)],
  stage: [v3(-1, 2.9, -6.5), v3(0.5, 10.5, 20)],
  ceiling: [v3(0, 4.5, 9), v3(0, 22, 10.5)],
  side: [v3(-9, 9.5, 9), v3(10, 9, -8)],
  stage_close: [v3(-1.6, 1.7, -6.3), v3(0.3, 2.4, -13)], // eye height just in front of row A
  plan: [v3(0, 19.5, 10), v3(0, 0, 10)],
};
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 120);
const [from, to] = picked ? [v3(picked.x, picked.y + 2.2, picked.z + 2.8), v3(picked.x, picked.y + 0.9, picked.z)] : VIEWS[q.get('view') ?? 'stalls'] ?? VIEWS.stalls;
camera.position.copy(from);
camera.lookAt(to);
const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
if (PLAN) { // straight down, +z (the rear) up the screen so the stage is at the bottom like the seat map; upper storeys hidden
  euler.set(-Math.PI / 2, Math.PI, 0);
  camera.fov = 100;
  camera.updateProjectionMatrix();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox!.min.y > 4.5) o.visible = false;
  });
}
if (q.get('cam')) {
  const [x, y, z, yaw, pitch] = q.get('cam')!.split(',').map(Number);
  camera.position.set(x, y, z);
  euler.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0);
}
// ?tour=1: slow dolly on a spline through the stalls to the stage, then rising to the dome (60 s loop)
const tourPath = new THREE.CatmullRomCurve3([v3(0, 5.2, 24), v3(-3, 4.4, 10), v3(-2, 3.4, -2), v3(4, 3.6, -6), v3(2, 7.5, 2), v3(0, 11, 8), v3(-4, 13, 16), v3(0, 8.5, 26)], true, 'catmullrom', 0.4);
const tourLook = new THREE.CatmullRomCurve3([v3(0, 6, -14), v3(0, 4, -14), v3(0, 3, -14), v3(-2, 9, -12), v3(0, 17, 0), v3(0, 21, 10), v3(0, 14, -6), v3(0, 9, -10)], true, 'catmullrom', 0.4);
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  euler.y -= e.movementX * 0.0022;
  euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.0022, -1.5, 1.5);
});
// post: ACES + sRGB output, bloom on the display image (near-white only), then a warm vignette
const composer = POST ? new EffectComposer(renderer) : null;
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass()); // ACES + sRGB first: the bloom then only picks near-white pixels (ribbons, lamps, hot spots)
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.38, 0.45, 0.9));
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - 0.42 * smoothstep(0.3, 0.95, d); c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.97, 0.88), 0.45); gl_FragColor = c; }',
  }));
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
let frames = 0, tourT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 4) * dt;
  if (TOUR) {
    tourT = (tourT + dt / 60) % 1;
    camera.position.copy(tourPath.getPointAt(tourT));
    camera.lookAt(tourLook.getPointAt(tourT));
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
  }
  camera.quaternion.setFromEuler(euler);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
  if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
  if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
  if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
  if (keys.has('KeyE')) camera.position.y += v;
  if (keys.has('KeyQ')) camera.position.y -= v;
  if (composer) { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); } else renderer.render(scene, camera);
  if (++frames !== 3) return;
  const { calls, triangles } = renderer.info.render;
  Object.assign(window, { __STATS__: { calls, triangles, seats: seats.length }, __READY__: true });
});
