import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { bounds, chunks as chunkCfg, flyCamera, physics, playerSetup, render as R, ui } from './config.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Input } from './core/Input.ts';
import { CHUNK_SIZE, type ChunkIndex, type ChunkKey, type SkylineData, type WaterData } from './geo/chunkData.ts';
import { heightAt, loadHeightGrid } from './geo/heightGrid.ts';
import { FreeFlyCamera } from './player/FreeFlyCamera.ts';
import { parseOverrides, Player } from './player/Player.ts';
import { initCredits } from './ui/Credits.ts';
import { createDebugOverlay } from './ui/DebugOverlay.ts';
import { withFallbacks } from './world/attach.ts';
import { bboxCorners, createBoundsWalls, edgeDistance } from './world/Bounds.ts';
import { createBuildingMaterials } from './world/BuildingBuilder.ts';
import type { ToWorker } from './world/buildTypes.ts';
import { ChunkManager } from './world/ChunkManager.ts';
import { createSkyline } from './world/landmarks/g5.ts';
import { createLandmarkMaterials } from './world/landmarks/index.ts';
import { createLandmarkModels } from './world/landmarks/models.ts';
import { createRoadMaterials } from './world/RoadBuilder.ts';
import { createSky } from './world/Sky.ts';
import { createPropMaterials, createPropMeshes } from './world/StreetProps.ts';
import { carveRiver, createTerrainCollider, createTerrainMaterials, flattenPads, riverLevel } from './world/Terrain.ts';
import { createWater } from './world/Water.ts';

const $ = (id: string) => document.getElementById(id)!;

function fail(message: string, cause?: unknown) {
  if (cause !== undefined) console.error(cause);
  const box = $('error');
  box.textContent = message + (cause === undefined ? '' : `\n\nChi tiết: ${String(cause)}`);
  box.hidden = false;
}

/** Runs f; a failure is warned (never console.error: the screenshot run would fail) and yields undefined. */
function attempt<T>(label: string, f: () => T): T | undefined {
  try {
    return f();
  } catch (err) {
    console.warn(`${label} failed:`, err);
    return undefined;
  }
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`${url} missing or unreadable (${String(err)})`);
    return undefined;
  }
}

/** Every chunk touching RACE_BBOX, for when chunks/index.json is missing (terrain-only world). */
function bboxKeys(): ChunkKey[] {
  const c = bboxCorners();
  const cell = (v: number) => Math.floor(v / CHUNK_SIZE);
  const [xs, zs] = [c.map((p) => cell(p[0])), c.map((p) => cell(p[1]))];
  const keys: ChunkKey[] = [];
  for (let i = Math.min(...xs); i <= Math.max(...xs); i++) for (let j = Math.min(...zs); j <= Math.max(...zs); j++) keys.push(`${i}_${j}`);
  return keys;
}

async function start() {
  // Probe on a throwaway canvas: a second getContext() on three's canvas would ignore its attributes.
  if (!document.createElement('canvas').getContext('webgl2')) {
    return fail(
      'Trình duyệt hoặc card đồ họa của bạn không hỗ trợ WebGL2 nên không chạy được game. ' +
        'Hãy cập nhật Chrome, Edge, Firefox hoặc Safari và bật "tăng tốc phần cứng" trong cài đặt trình duyệt.',
    );
  }
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = R.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 removed PCFSoftShadowMap; PCF is soft via light.shadow.radius
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(R.fov, 1, R.near, R.far);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, R.maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  // 1. Height grid + water, then the plaza pads and the river carve (before the grid goes to the worker and the collider).
  const [grid, water, index, skyline] = await Promise.all([
    loadHeightGrid('data/'),
    getJson<WaterData>('data/water.json'),
    getJson<ChunkIndex>('data/chunks/index.json'),
    getJson<SkylineData>('data/skyline.json'),
  ]);
  attempt('flattenPads', () => flattenPads(grid));
  if (water) attempt('carveRiver', () => carveRiver(grid, water));

  // 2. Physics: terrain heightfield + invisible bbox walls (chunk trimeshes come with the chunks).
  const world = new RAPIER.World(physics.gravity);
  world.timestep = physics.fixedDt;
  attempt('createTerrainCollider', () => createTerrainCollider(world, grid));
  createBoundsWalls(world);

  // 3. Sky, lights, fog · 4. water · 5. streamed chunks.
  const sky = createSky(scene, camera, (x, z) => heightAt(grid, x, z));
  const waterObj = water && attempt('createWater', () => createWater(scene, water, grid));
  attempt('createSkyline', () => scene.add(createSkyline(skyline, (x, z) => heightAt(grid, x, z)))); // Sacré-Cœur, Montparnasse, La Défense
  const materials = withFallbacks(
    Object.assign(
      {},
      ...[createTerrainMaterials, createBuildingMaterials, createRoadMaterials, createPropMaterials, createLandmarkMaterials].map(
        (f) => attempt(f.name, f) ?? {},
      ),
    ),
  );
  const hasIndex = index?.v === 2 && Array.isArray(index.keys);
  if (!hasIndex) $('nodata').hidden = false;
  const worker = new Worker(new URL('./workers/chunkBuilder.worker.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ type: 'init', grid, dataUrl: hasIndex ? new URL('data/', location.href).href : '' } satisfies ToWorker);
  const propMeshes = createPropMeshes();
  const models = createLandmarkModels(new URL('data/', location.href).href, (x, z) => heightAt(grid, x, z), materials, propMeshes);
  const chunks = new ChunkManager(worker, hasIndex ? index.keys : bboxKeys(), scene, world, materials, propMeshes, hasIndex ? models.attach : undefined);

  const input = new Input(renderer.domElement);
  const fly = new FreeFlyCamera(camera); // spectator: flies through everything, no collider
  const query = new URLSearchParams(location.search);
  // Phase 3: ?player[=x,z,yawDeg] walks (docs/plans/phase3.md); without it the free-fly camera as before. The integrator
  // flips the default at the end of Phase 3 (fly only with ?cam= or V in the debug panel).
  const env = { heightAt: (x: number, z: number) => heightAt(grid, x, z), waterLevel: water ? riverLevel(grid, water) : null, water };
  const player = query.has('player') ? await Player.create(scene, world, camera, env, parseOverrides(query)) : undefined;
  let flying = !player;
  $('help-player').hidden = !player;
  $('help-fly').hidden = !!player;
  if (import.meta.env.DEV) Object.assign(window, { __GAME__: { fly, player } }); // for scratch test scripts

  // Deterministic views for screenshots: ?cam=x,y,z,yawDeg,pitchDeg and ?debug=1
  const cam = query.get('cam')?.split(',').filter(Boolean).map(Number); // empty fields → not 5 numbers → spawn
  const s = flyCamera.spawn;
  const [x, y, z, yawDeg, pitchDeg] = cam?.length === 5 && cam.every(Number.isFinite) ? cam : [s.x, s.y, s.z, s.yawDeg, s.pitchDeg];
  fly.setPose(x, y, z, yawDeg, pitchDeg);
  const debug = createDebugOverlay(query.get('debug') === '1');

  // Esc releases the pointer (the browser eats the key), so "unlocked" = help/menu is showing.
  const help = $('help');
  help.hidden = false;
  input.onPointerLockChange = (locked) => void (help.hidden = locked);
  input.onImeSuspected = () => {
    const notice = $('ime');
    notice.hidden = false;
    setTimeout(() => void (notice.hidden = true), ui.imeNoticeMs);
  };
  initCredits();
  const edge = $('edge');
  const loading = $('loading');

  const waitArg = Number(query.get('wait') ?? NaN);
  const wait = Number.isFinite(waitArg) ? waitArg : playerSetup.readyWait; // s simulated before __READY__ (player mode)
  const euler = new THREE.Euler();
  let worldReady = false; // first view loaded: player spawns, chunk attach gets budgeted
  let ready = false; // window.__READY__
  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      player?.fixedUpdate(dt, flying);
      world.step();
    },
    update: (dt) => {
      input.poll();
      if (input.wasPressed('debug')) debug.toggle();
      // V: player ⇄ free-fly (debug only, SPEC §17.2 "camera bay tự do"); the body stays frozen where it was.
      if (player && debug.visible && input.wasPressed('flyToggle')) {
        flying = !flying;
        euler.setFromQuaternion(camera.quaternion, 'YXZ');
        if (flying) fly.setPose(camera.position.x, camera.position.y, camera.position.z, euler.y / (Math.PI / 180), euler.x / (Math.PI / 180));
        $('help-player').hidden = flying;
        $('help-fly').hidden = !flying;
      }
      if (flying) fly.update(dt, input);
      player?.update(dt, flying ? null : input, loop.alpha);
      input.endFrame();
      const p = player && !flying ? player.position : camera.position; // streaming + colliders follow the body
      sky.update();
      waterObj?.update(dt);
      chunks.update(p.x, p.y, p.z, worldReady ? chunkCfg.attachBudgetMs : Infinity); // the first view loads unbudgeted
      edge.hidden = edgeDistance(p.x, p.z) >= bounds.warnDistance;
    },
    render: () => {
      renderer.render(scene, camera);
      const cs = chunks.stats;
      const colliders = world.colliders.len();
      const ps = player?.controller.state;
      const playerLine =
        ps &&
        `Nhân vật: ${ps.moveMode}${ps.grounded ? ' · trên đất' : ''}${ps.inWater ? ' · dưới nước' : ''} · ` +
          `${Math.hypot(ps.velocity.x, ps.velocity.z).toFixed(1)} m/s · camera ${flying ? 'bay tự do (V)' : player.camera.mode}`;
      debug.update({ fps: loop.fps, workMs: loop.workMs, renderer, position: camera.position, speed: fly.speed, chunks: cs, colliders, player: playerLine });
      const { calls, triangles } = renderer.info.render;
      Object.assign(window, { __STATS__: { calls, triangles, chunks: cs.loaded, colliders, geometries: renderer.info.memory.geometries } });
      // Signal for scripts/screenshot.ts: every chunk around the camera attached and a few frames drawn.
      if (!worldReady) loading.textContent = `Đang tải bản đồ… còn ${cs.pending} ô`;
      if (!worldReady && loop.frames >= 3 && chunks.idle && models.idle) {
        worldReady = true;
        loading.hidden = true;
        player?.activate(); // the chunk colliders around the spawn exist now
      }
      if (!ready && worldReady && (!player || player.simTime >= wait)) {
        ready = true;
        Object.assign(window, { __READY__: true });
      }
    },
  });
  loop.start();
}

addEventListener('error', (e) => fail('Game gặp lỗi. Hãy tải lại trang.', e.error));
start().catch((err: unknown) =>
  fail('Không khởi động được game. Hãy tải lại trang; nếu vẫn lỗi, hãy thử trình duyệt khác (Chrome, Edge, Firefox, Safari).', err),
);
