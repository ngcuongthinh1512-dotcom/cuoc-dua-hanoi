// Daylight sky (STYLE_GUIDE: pale blue, thin clouds, haze fading the distance and hiding chunk edges): gradient +
// cloud equirect background, fog and camera.far scaled with altitude, Phase 1 lights with a shadow box that follows
// the camera. ponytail: fixed afternoon sun; the real-sun day/night cycle (SPEC §14) comes later.
import * as THREE from 'three';
import { render as R } from '../config.ts';
import { hash01 } from './geom.ts';

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512; // equirect: y = 0 zenith, 256 horizon
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, R.sky.zenith);
  grad.addColorStop(1, R.sky.horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = R.sky.horizon;
  g.fillRect(0, 256, 1024, 256);
  // Thin clouds: soft flattened blobs between ~8° and ~40° elevation; x wraps around.
  for (let i = 0; i < R.sky.clouds; i++) {
    const x = hash01(i, 1) * 1024;
    const y = 140 + hash01(i, 2) * 95;
    const r = 30 + hash01(i, 3) * 70;
    for (const dx of [-1024, 0, 1024]) {
      const blob = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      blob.addColorStop(0, `rgba(255,255,255,${R.sky.cloudAlpha})`);
      blob.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = blob;
      g.setTransform(1, 0, 0, 0.3, 0, y * 0.7); // flatten vertically about y
      g.fillRect(x + dx - r, y - r, 2 * r, 2 * r);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSky(scene: THREE.Scene, camera: THREE.PerspectiveCamera, groundAt: (x: number, z: number) => number) {
  scene.background = skyTexture();
  const fog = new THREE.Fog(R.sky.horizon, R.fog.near, R.fog.far);
  scene.fog = fog;

  const { hemiLight: h, sun: s } = R;
  scene.add(new THREE.HemisphereLight(h.sky, h.ground, h.intensity));
  const sun = new THREE.DirectionalLight(s.color, s.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(R.shadowMapSize);
  sun.shadow.radius = R.shadowRadius;
  sun.shadow.bias = R.shadowBias;
  sun.shadow.normalBias = R.shadowNormalBias;
  // ponytail: one shadow box around the camera (no texel snapping: edges shimmer a little when moving);
  // cascaded shadow maps (SPEC §14) in Phase 12.
  const e = R.shadowHalfExtent;
  Object.assign(sun.shadow.camera, { left: -e, right: e, bottom: -e, top: e, near: 1, far: R.shadowFar });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  return {
    /** Per frame, after the camera moved. */
    update() {
      const p = camera.position;
      const ground = groundAt(p.x, p.z);
      sun.target.position.set(p.x, ground, p.z);
      sun.position.set(p.x + s.position.x, ground + s.position.y, p.z + s.position.z);
      const lift = Math.max(0, p.y - ground) * R.fog.altitudeFactor;
      fog.near = R.fog.near + lift;
      fog.far = R.fog.far + lift;
      const far = fog.far * 1.05; // nothing is visible beyond the fog anyway; tighter depth range
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    },
  };
}
