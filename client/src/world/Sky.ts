// Daylight sky (STYLE_GUIDE: pale blue, thin clouds, haze fading the distance and hiding chunk edges): gradient +
// cloud equirect background, fog and camera.far scaled with altitude, Phase 1 lights with a shadow box that follows
// the camera. ponytail: fixed afternoon sun; the real-sun day/night cycle (SPEC §14) comes later.
// Phase 8C T1 (graphics8c.sky on): mode 'hdri' = Poly Haven sky .hdr as background + scene.environment (image-based
// light for every standard material; the renderer makes the PMREM once), rotated so its sun sits at our DirectionalLight's
// azimuth, fog = the HDRI's horizon colour; 'shader' = three's Sky.js (Preetham + clouds, no file) baked once into the
// environment. The canvas sky stays until the HDRI has loaded (and if it fails). Sun 35–45° high
// (graphics8c.sky.sunPosition), shadow box snapped to whole texels (no shimmer while moving).
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Sky as SkyMesh } from 'three/examples/jsm/objects/Sky.js';
import { graphics8c, render as R } from '../config.ts';
import { hash01 } from './geom.ts';
import { graphics } from './graphics.ts';
import { sceneEnvironmentOn, skyEnvironment } from './Water.ts';

const G = graphics8c.sky;

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

export type RGB = [number, number, number];

/** Pure: an equirect radiance image (RGBA, value k = at(k), row 0 = zenith as HDRLoader delivers it, flipY) → the
 *  brightest pixel's azimuth (rad, three's equirect convention φ = atan2(z, x)) and the mean colour of the band
 *  0…horizonBandDeg above the horizon (the fog colour). `step` subsamples. */
export function hdriStats(at: (k: number) => number, w: number, h: number, horizonBandDeg: number, step = 1) {
  let best = -1;
  let sunAzimuth = 0;
  const sum: RGB = [0, 0, 0];
  let n = 0;
  const top = Math.floor(h / 2 - (horizonBandDeg / 180) * h); // first row of the band (rows above = higher)
  for (let j = 0; j < h; j += step) {
    for (let i = 0; i < w; i += step) {
      const k = 4 * (j * w + i);
      const [r, g, b] = [at(k), at(k + 1), at(k + 2)];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > best) [best, sunAzimuth] = [lum, ((i + 0.5) / w - 0.5) * 2 * Math.PI];
      if (j >= top && j < h / 2) (sum[0] += r), (sum[1] += g), (sum[2] += b), n++;
    }
  }
  return { sunAzimuth, horizon: sum.map((v) => v / Math.max(1, n)) as RGB };
}

/** In place on half-float RGBA equirect data (row 0 = zenith): the lower hemisphere becomes `horizon` (a "pure sky"
 *  HDRI has blurred clouds there; the fogged ground meets a flat haze, as in the canvas sky) and the band
 *  0…bandDeg above the horizon fades into it (no hard line where the fog meets the sky). */
export function fillBelowHorizon(data: Uint16Array, w: number, h: number, bandDeg: number, horizon: RGB): void {
  const top = Math.floor(h / 2 - (bandDeg / 180) * h);
  const half = horizon.map((v) => THREE.DataUtils.toHalfFloat(v));
  for (let j = top; j < h; j++) {
    const t = j >= h / 2 ? 1 : (j - top) / Math.max(1, h / 2 - top); // 0 at the band's top → 1 at the horizon
    for (let i = 0; i < w; i++) {
      const k = 4 * (j * w + i);
      for (let c = 0; c < 3; c++) {
        data[k + c] = t === 1 ? half[c]! : THREE.DataUtils.toHalfFloat(THREE.MathUtils.lerp(THREE.DataUtils.fromHalfFloat(data[k + c]!), horizon[c]!, t * t));
      }
    }
  }
}

/** Pure: three's ACESFilmicToneMapping of a linear colour (the no-post path tone-maps the background in its shader but
 *  mixes the fog in after, so the fog colour must be the tone-mapped horizon to meet the sky without a seam). */
export function acesFilmic([r, g, b]: RGB, exposure: number): RGB {
  const e = exposure / 0.6;
  const [x, y, z] = [r * e, g * e, b * e];
  const i = [0.59719 * x + 0.35458 * y + 0.04823 * z, 0.076 * x + 0.90834 * y + 0.01566 * z, 0.0284 * x + 0.13383 * y + 0.83777 * z];
  const f = i.map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)) as RGB;
  const o = [1.60475 * f[0] - 0.53108 * f[1] - 0.07367 * f[2], -0.10208 * f[0] + 1.10813 * f[1] - 0.00605 * f[2], -0.00327 * f[0] - 0.07276 * f[1] + 1.07602 * f[2]];
  return o.map((v) => Math.min(1, Math.max(0, v))) as RGB;
}

/** The fog colour (linear) for the sky radiance `horizon`: as is when post-processing tone-maps everything at the end. */
const fogColour = (horizon: RGB, toneMappedLater: boolean): RGB => (toneMappedLater ? horizon : acesFilmic(horizon, R.exposure));

export function createSky(scene: THREE.Scene, camera: THREE.PerspectiveCamera, groundAt: (x: number, z: number) => number) {
  const canvasSky = skyTexture(); // until the HDRI (or Sky.js) replaces it, then disposed (review 1 #6: ~2 MB VRAM)
  scene.background = canvasSky;
  const fog = new THREE.Fog(R.sky.horizon, R.fog.near, R.fog.far);
  scene.fog = fog;

  const on = graphics().on('sky');
  const { hemiLight: h } = R;
  let envOn = sceneEnvironmentOn(); // low quality: HDRI background + fog only, graphics8c.sky.low light levels
  /** Sun / hemisphere intensities with and without the image-based light (graphics8c.sky off: Phase 7). */
  const levels = (env: boolean) => (env ? { sun: G.sunIntensity, hemi: G.hemiIntensity } : on ? { sun: G.low.sunIntensity, hemi: G.low.hemiIntensity } : { sun: R.sun.intensity, hemi: h.intensity });
  const s = on ? { ...R.sun, intensity: levels(envOn).sun, position: G.sunPosition } : R.sun;
  const hemi = new THREE.HemisphereLight(h.sky, h.ground, levels(envOn).hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(s.color, s.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(R.shadowMapSize);
  sun.shadow.radius = R.shadowRadius;
  sun.shadow.bias = R.shadowBias;
  sun.shadow.normalBias = R.shadowNormalBias;
  // ponytail: one shadow box around the camera (texel-snapped when graphics8c.sky is on); cascaded shadow maps (SPEC §14) in Phase 12.
  const e = R.shadowHalfExtent;
  Object.assign(sun.shadow.camera, { left: -e, right: e, bottom: -e, top: e, near: 1, far: R.shadowFar });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  let skyMesh: SkyMesh | undefined;
  let toneMappedLater = false;
  let horizon: RGB | undefined; // the HDRI's, once loaded
  const sunDir = new THREE.Vector3(s.position.x, s.position.y, s.position.z).normalize();
  if (on) {
    toneMappedLater = graphics().on('post');
    scene.environmentIntensity = G.environmentIntensity * (G.mode === 'shader' ? G.shaderEnvironmentScale : 1);
    if (G.mode === 'hdri') {
      const url = `textures/sky_${graphics().quality === 'low' ? '1k' : '2k'}.hdr`;
      new HDRLoader().load(
        url,
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          const { width: w, height: hh, data } = tex.image as { width: number; height: number; data: Uint16Array };
          const stats = hdriStats((k) => THREE.DataUtils.fromHalfFloat(data[k]!), w, hh, G.horizonBandDeg, 4);
          fillBelowHorizon(data, w, hh, G.horizonBandDeg, stats.horizon);
          // Rotate the image so its sun lies at our sun's azimuth (shadows and the bright sky agree).
          const yaw = stats.sunAzimuth - Math.atan2(sunDir.z, sunDir.x);
          scene.background = tex;
          canvasSky.dispose();
          scene.backgroundIntensity = G.backgroundIntensity;
          scene.backgroundRotation.set(0, yaw, 0);
          if (envOn) scene.environment = tex; // the renderer turns an equirect environment into a PMREM once
          scene.environmentRotation.set(0, yaw, 0);
          horizon = stats.horizon.map((v) => v * G.backgroundIntensity) as RGB;
          fog.color.setRGB(...fogColour(horizon, toneMappedLater), THREE.LinearSRGBColorSpace);
        },
        undefined,
        () => console.warn(`${url} missing (npm run process-assets -- hdri): canvas sky`),
      );
    } else if (G.mode === 'shader') {
      const sky = (skyMesh = new SkyMesh());
      const u = sky.material.uniforms;
      for (const [k, v] of Object.entries(G.shader)) u[k]!.value = v;
      u.sunPosition!.value.copy(sunDir);
      sky.frustumCulled = false;
      sky.renderOrder = -1;
      scene.background = null;
      canvasSky.dispose();
      scene.add(sky);
      fog.color.setRGB(...fogColour(G.shaderHorizon as unknown as RGB, toneMappedLater), THREE.LinearSRGBColorSpace);
      // Bake the environment once, on the first frame (onBeforeRender hands over the renderer; a nested render is fine,
      // three's Reflector does the same), without the sun disc: the DirectionalLight is the sun.
      if (envOn) sky.onBeforeRender = (renderer) => {
        sky.onBeforeRender = () => {};
        const probe = new SkyMesh();
        probe.material.uniforms = THREE.UniformsUtils.clone(u);
        probe.material.uniforms.showSunDisc!.value = 0;
        probe.scale.setScalar(100);
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new THREE.Scene().add(probe) as THREE.Scene, 0, 1, 1000).texture;
        pmrem.dispose();
        probe.geometry.dispose();
        probe.material.dispose();
      };
    }
  }

  // Light space of the fixed sun direction (z toward the sun) for the texel snap.
  const toLight = new THREE.Matrix4().lookAt(sunDir, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP);
  const fromLight = toLight.clone().invert();
  const snapped = new THREE.Vector3();
  const texel = (2 * e) / R.shadowMapSize;
  return {
    /** Runtime downgrade (main.ts FpsWatch, high quality): no image-based light (graphics8c.sky.low light levels, like low
     *  quality), the fog colour for the plain renderer (post-processing off too). `materials` that relied on
     *  scene.environment for their reflection (metals, the river: metalness ≥ 0.5 or roughness < 0.1, no envMap) get the
     *  small sky gradient instead, as on low quality. */
    lowLight(materials: Iterable<THREE.Material>) {
      if (!envOn && !toneMappedLater) return;
      envOn = toneMappedLater = false;
      scene.environment = null;
      skyMesh && (skyMesh.onBeforeRender = () => {}); // Sky.js: no late environment bake
      Object.assign(sun, { intensity: levels(false).sun });
      hemi.intensity = levels(false).hemi;
      const fogRgb = horizon ?? (G.mode === 'shader' && on ? (G.shaderHorizon as unknown as RGB) : undefined);
      if (fogRgb) fog.color.setRGB(...fogColour(fogRgb, false), THREE.LinearSRGBColorSpace);
      const env = skyEnvironment();
      for (const m of materials) {
        if (m instanceof THREE.MeshStandardMaterial && !m.envMap && (m.metalness >= 0.5 || m.roughness < 0.1)) (m.envMap = env), (m.needsUpdate = true);
      }
    },
    /** Per frame, after the camera moved. */
    update() {
      const p = camera.position;
      const ground = groundAt(p.x, p.z);
      const t = sun.target.position.set(p.x, ground, p.z);
      if (on) {
        snapped.copy(t).applyMatrix4(fromLight);
        t.copy(snapped.set(Math.round(snapped.x / texel) * texel, Math.round(snapped.y / texel) * texel, snapped.z).applyMatrix4(toLight));
      }
      sun.position.set(t.x + s.position.x, t.y + s.position.y, t.z + s.position.z);
      const lift = Math.max(0, p.y - ground) * R.fog.altitudeFactor;
      fog.near = R.fog.near + lift;
      fog.far = R.fog.far + lift;
      const far = fog.far * 1.05; // nothing is visible beyond the fog anyway; tighter depth range
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      skyMesh?.position.copy(p);
      skyMesh?.scale.setScalar(far);
    },
  };
}
