// DEV TURNTABLE (Phase 4B track A): NPC models without the world. Dev server only (/npc.html?…):
//   show=cars   the 10 vehicles in two rows, side view, body paints from npc.paints (wheels drawn as dark cylinders)
//     · kinds=scooter,moto only those (one row, closer) · paint=<#hex> body paint for all
//   show=peds   the 4 Rocketbox avatars: LOD0 row in front, LOD1 row behind · clip=walk | stroll | idle | lookAround | phone | sit | wave
//     (several, comma separated: one per avatar, cycling; `m_` / `f_` by the avatar's gender) · t=<s> clip time (default 0)
//   dist=<m> camera distance · yaw=<°> camera angle around the row (0 = from +Z, front view of the peds)
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { npc, render as R } from '../config.ts';
import { loadNpcAssets } from './NpcAssets.ts';
import type { CarKind } from './types.ts';

const q = new URLSearchParams(location.search);
const num = (k: string, d = 0) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
const show = q.get('show') ?? 'cars';

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
sun.position.set(-6, 12, 10);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 12, bottom: -12 });
sun.shadow.mapSize.setScalar(2048);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a39a8c' }));
ground.receiveShadow = true;
scene.add(ground);

const assets = await loadNpcAssets();
const target = new THREE.Vector3(0, 0.9, 0);
let width = 4; // m the camera must frame

if (show === 'cars') {
  const only = q.get('kinds')?.split(',') as CarKind[] | undefined;
  const rows: CarKind[][] = only ? [only] : [['city', 'hatchback', 'sedan', 'suv', 'taxi'], ['van', 'truck', 'bus', 'scooter', 'moto']];
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9 });
  const GAP = 1.6;
  let i = 0;
  rows.forEach((kinds, r) => {
    const total = kinds.reduce((s, k) => s + npc.vehicles[k].dims[2] + GAP, -GAP);
    let x = -total / 2;
    width = Math.max(width, total);
    for (const k of kinds) {
      const t = assets.vehicles.get(k)!;
      const len = npc.vehicles[k].dims[2];
      const own = npc.vehicles[k].paint;
      const paint = new THREE.Color(q.get('paint') ?? (own ?? npc.paints)[own ? 0 : i++ % npc.paints.length]);
      const g = t.geometry.clone();
      const [col, pa] = [g.getAttribute('color'), g.getAttribute('_paint')];
      const tinted = new Float32Array(col.array);
      for (let v = 0; v < pa.count; v++) if (pa.getX(v) > 0.5) tinted.set([paint.r, paint.g, paint.b], v * 3);
      g.setAttribute('color', new THREE.Float32BufferAttribute(tinted, 3));
      const car = new THREE.Group();
      const body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
      body.castShadow = body.receiveShadow = true;
      car.add(body);
      for (const [ax, ay, az] of t.axles) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.scale.set(0.11, t.wheelRadius, t.wheelRadius);
        w.position.set(ax, ay, az);
        w.castShadow = true;
        car.add(w);
      }
      car.rotation.y = Math.PI / 2; // nose +Z → +X: the camera on +Z sees the right side
      car.position.set(x + len / 2, 0, rows.length > 1 ? (r ? 4.5 : -4.5) : 0);
      scene.add(car);
      x += len + GAP;
    }
  });
  target.set(0, 1.2, 0);
} else {
  const clips = (q.get('clip') ?? 'idle').split(',');
  const mixers: THREE.AnimationMixer[] = [];
  const SP = 1.6;
  const chair = new THREE.MeshStandardMaterial({ color: '#3f6b3a' });
  for (const lod of [0, 1]) {
    assets.peds.forEach((ped, i) => {
      const c = cloneSkinned(ped.scene);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.visible = o.userData.lod === lod), (o.castShadow = true), (o.frustumCulled = false);
      });
      c.position.set((i - 1.5) * SP, 0, lod ? -3 : 0);
      scene.add(c);
      const name = clips[i % clips.length]!;
      const clip = assets.clips.get(`${ped.gender}_${name}`);
      if (clip) {
        const m = new THREE.AnimationMixer(c);
        m.clipAction(clip).play();
        m.update(num('t'));
        mixers.push(m);
      }
      if (name === 'sit') {
        // stand-in chair: seat 0.45 m high, back behind the hips (ponytail: eyeballed against the clip, no chair model yet)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), chair);
        seat.position.set(c.position.x, 0.45, c.position.z - 0.12);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.04), chair);
        back.position.set(c.position.x, 0.7, c.position.z - 0.36);
        scene.add(seat, back);
      }
    });
  }
  width = 4 * SP + 1;
  target.set(0, 0.9, -1);
}

const camera = new THREE.PerspectiveCamera(R.fov, innerWidth / innerHeight, 0.1, 300);
const tanHalfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
const rows2 = show === 'cars' && !q.has('kinds');
const dist = num('dist') || ((width / 2 + 0.6) / tanHalfW) * (rows2 ? 1.3 : 1);
const yaw = THREE.MathUtils.degToRad(num('yaw'));
camera.position.set(target.x + Math.sin(yaw) * dist, show === 'cars' ? 1.6 + dist * (rows2 ? 0.42 : 0.1) : 1.2, (show === 'cars' ? 0 : 0) + Math.cos(yaw) * dist);
camera.lookAt(target);
let frames = 0;
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  if (++frames !== 3) return;
  const { calls, triangles } = renderer.info.render;
  Object.assign(window, { __STATS__: { calls, triangles }, __READY__: true });
});
