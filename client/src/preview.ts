// DEV PREVIEW HARNESS (docs/plans/phase2.md step 0): runs the chunk builders on the main thread for a few chunks and
// renders them through world/attach.ts, so each package can screenshot its own output before streaming exists.
// Dev server only: vite's build input stays index.html. URL params (/preview.html?…):
//   fixture=1 (default) | chunks=<key>,<key>… | at=<lat>,<lon>&r=<m>   chunks to build (at: every chunk touching the circle)
//   only=terrain,buildings,roads,bridges,vegetation,props,landmarks   builders to run (default all)
//   cam=x,y,z,yawDeg,pitchDeg   camera (default: oblique view from the south framing the selection)
//   graph=1 [route=lat,lon,lat,lon]   road graph overlay + A* walking route (Phase 4 track C)
//   carve=1   flattenPads(grid) + carveRiver(grid, water) before building · water=1   createWater(scene, water, grid)
import { latLonToWorld } from '@race/shared';
import { shortestPath } from '@race/shared/graph';
import * as THREE from 'three';
import { preview as P, render as R } from './config.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Input } from './core/Input.ts';
import { CHUNK_SIZE, type ChunkData, type ChunkKey, chunkBounds, type WaterData } from './geo/chunkData.ts';
import { fixture } from './geo/fixture.ts';
import { heightAt, loadHeightGrid } from './geo/heightGrid.ts';
import { graphLines, loadRoadGraph } from './geo/roadGraph.ts';
import { FreeFlyCamera } from './player/FreeFlyCamera.ts';
import { attachBuildOut, withFallbacks } from './world/attach.ts';
import { createBuildingMaterials } from './world/BuildingBuilder.ts';
import { BUILDERS, fallbackTerrain } from './world/chunkBuild.ts';
import type { BuildCtx, BuildOut } from './world/buildTypes.ts';
import { mergeBuckets } from './world/geom.ts';
import { createLandmarkMaterials } from './world/landmarks/index.ts';
import { createRoadMaterials } from './world/RoadBuilder.ts';
import { createPropMaterials, createPropMeshes } from './world/StreetProps.ts';
import { carveRiver, createTerrainMaterials, flattenPads } from './world/Terrain.ts';
import { createWater } from './world/Water.ts';

const q = new URLSearchParams(location.search);
const list = (name: string) => q.get(name)?.split(',').filter(Boolean);
const caption = document.getElementById('caption')!;

/** Runs f; on failure warns (never console.error: the screenshot run would fail) and returns undefined. */
function attempt<T>(label: string, f: () => T): T | undefined {
  try {
    return f();
  } catch (err) {
    console.warn(`preview: ${label} failed:`, err);
    return undefined;
  }
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`preview: ${url} missing or unreadable (${String(err)})`);
    return undefined;
  }
}

/** Keys from chunks=… or at=…&r=…; undefined → the fixture. */
function selectedKeys(): ChunkKey[] | undefined {
  const keys = list('chunks');
  if (keys?.length) return keys;
  const at = list('at')?.map(Number);
  if (at?.length !== 2 || !at.every(Number.isFinite)) return undefined;
  const c = latLonToWorld(at[0]!, at[1]!);
  const r = Number(q.get('r') ?? CHUNK_SIZE);
  const out: ChunkKey[] = [];
  const cell = (v: number) => Math.floor(v / CHUNK_SIZE);
  for (let i = cell(c.x - r); i <= cell(c.x + r); i++) {
    for (let j = cell(c.z - r); j <= cell(c.z + r); j++) {
      const b = chunkBounds(`${i}_${j}`);
      const dx = Math.max(b.minX - c.x, 0, c.x - b.maxX);
      const dz = Math.max(b.minZ - c.z, 0, c.z - b.maxZ);
      if (dx * dx + dz * dz <= r * r) out.push(`${i}_${j}`);
    }
  }
  return out;
}

async function start() {
  const keys = selectedKeys();
  const only = list('only') ?? Object.keys(BUILDERS);
  for (const name of only) if (!BUILDERS[name]) console.warn(`preview: unknown builder "${name}" in only=`);
  const wantWater = q.get('water') === '1';
  const wantCarve = q.get('carve') === '1';

  const [grid, water, loaded] = await Promise.all([
    loadHeightGrid('data/'),
    wantWater || wantCarve ? getJson<WaterData>('data/water.json') : undefined,
    keys && Promise.all(keys.map((k) => getJson<ChunkData>(`data/chunks/${k}.json`))),
  ]);
  // A missing chunk still gets the terrain: built as an empty chunk.
  const empty = (key: ChunkKey): ChunkData => ({ v: 2, key, buildings: [], roads: [], bridges: [], areas: [], points: [] });
  const chunks = keys ? keys.map((key, i) => (loaded?.[i]?.v === 2 ? loaded[i] : empty(key))) : [fixture];
  const missing = keys ? keys.length - (loaded?.filter((c) => c?.v === 2).length ?? 0) : 0;
  if (wantCarve) attempt('flattenPads', () => flattenPads(grid));
  if (wantCarve && water) attempt('carveRiver', () => carveRiver(grid, water));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = R.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(R.background); // no fog: the preview shows everything it built
  const camera = new THREE.PerspectiveCamera(R.fov, 1, R.near, R.far);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, R.maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const materials = withFallbacks(
    Object.assign(
      {},
      ...[createTerrainMaterials, createBuildingMaterials, createRoadMaterials, createPropMaterials, createLandmarkMaterials].map(
        (f) => attempt(f.name, f) ?? {},
      ),
    ),
  );
  const propMeshes = createPropMeshes();

  const perBuilder: Record<string, { triangles: number; drawCalls: number; ms: number }> = {};
  for (const chunk of chunks) {
    const bounds = chunkBounds(chunk.key);
    const ctx: BuildCtx = { key: chunk.key, bounds, height: (x, z) => heightAt(grid, x, z) };
    for (const name of only.filter((n) => BUILDERS[n])) {
      const t0 = performance.now();
      let out: BuildOut | undefined = attempt(`${name} @ ${chunk.key}`, () => BUILDERS[name]!(chunk, ctx));
      const ms = performance.now() - t0;
      if (name === 'terrain' && !out?.meshes.length) out = { meshes: [fallbackTerrain(grid, bounds)], instances: [], colliders: [] };
      const built = out && attempt(`attach ${name} @ ${chunk.key}`, () => attachBuildOut({ ...out, meshes: mergeBuckets(out.meshes) }, materials, propMeshes));
      if (!built) continue;
      scene.add(built.object);
      const s = (perBuilder[name] ??= { triangles: 0, drawCalls: 0, ms: 0 });
      s.triangles += built.triangles;
      s.drawCalls += built.drawCalls;
      s.ms += ms;
    }
  }
  const waterObj = wantWater && water ? attempt('createWater', () => createWater(scene, water, grid)) : undefined;
  if (q.get('graph') === '1') await drawGraph(scene, (x, z) => heightAt(grid, x, z));

  // Frame the requested chunks: centre, half-diagonal; Phase 1 sun + hemisphere light, shadow box around them.
  const b = (keys ?? [fixture.key]).map(chunkBounds);
  const minX = Math.min(...b.map((v) => v.minX));
  const minZ = Math.min(...b.map((v) => v.minZ));
  const maxX = Math.max(...b.map((v) => v.maxX));
  const maxZ = Math.max(...b.map((v) => v.maxZ));
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const centre = new THREE.Vector3(cx, heightAt(grid, cx, cz), cz);
  const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;

  scene.add(new THREE.HemisphereLight(R.hemiLight.sky, R.hemiLight.ground, R.hemiLight.intensity));
  const sun = new THREE.DirectionalLight(R.sun.color, R.sun.intensity);
  sun.position.copy(centre).add(R.sun.position);
  sun.target.position.copy(centre);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(R.shadowMapSize);
  sun.shadow.radius = R.shadowRadius;
  sun.shadow.bias = R.shadowBias;
  sun.shadow.normalBias = R.shadowNormalBias;
  Object.assign(sun.shadow.camera, { left: -radius, right: radius, bottom: -radius, top: radius, near: 1, far: R.shadowFar });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const fly = new FreeFlyCamera(camera);
  const cam = list('cam')?.map(Number);
  if (cam?.length === 5 && cam.every(Number.isFinite)) fly.setPose(cam[0]!, cam[1]!, cam[2]!, cam[3]!, cam[4]!);
  else {
    const d = radius * P.viewDistance;
    const p = (-P.viewPitchDeg * Math.PI) / 180;
    fly.setPose(cx, centre.y + d * Math.sin(p), cz + d * Math.cos(p), 0, P.viewPitchDeg);
  }
  const input = new Input(renderer.domElement);

  const total = { triangles: 0, drawCalls: 0 };
  for (const s of Object.values(perBuilder)) (total.triangles += s.triangles), (total.drawCalls += s.drawCalls);
  const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');
  caption.textContent = [
    `Xem trước: ${keys ? `${keys.length} chunk${missing ? ` (${missing} chưa có dữ liệu)` : ''}` : 'fixture'} · ${chunks.map((c) => c.key).join(' ')}`,
    `Tổng: ${fmt(total.triangles)} tam giác · ${fmt(total.drawCalls)} lệnh vẽ`,
    ...Object.entries(perBuilder).map(([n, s]) => `${n}: ${fmt(s.triangles)} tam giác · ${s.drawCalls} lệnh vẽ · ${s.ms.toFixed(1)} ms`),
    'Nhấp chuột rồi bay bằng W A S D / Space / Q',
  ].join('\n');
  Object.assign(window, { __STATS__: { ...total, perBuilder } });

  const loop = new GameLoop({
    fixedUpdate: () => {},
    update: (dt) => {
      input.poll();
      fly.update(dt, input);
      waterObj?.update(dt);
      input.endFrame();
    },
    render: () => {
      renderer.render(scene, camera);
      if (loop.frames >= 3) Object.assign(window, { __READY__: true }); // read by scripts/screenshot.ts
    },
  });
  loop.start();
}

/** graph=1: roadgraph.json edges (car blue, walk-only yellow, steps magenta) drawn over the map, on top of everything;
 *  route=lat,lon,lat,lon: the A* walking route between the two points in red. */
async function drawGraph(scene: THREE.Scene, h: (x: number, z: number) => number) {
  const g = await loadRoadGraph();
  if (!g) return;
  const r = list('route')?.map(Number);
  let path: readonly number[] | undefined;
  if (r?.length === 4) {
    const [a, b] = [latLonToWorld(r[0]!, r[1]!), latLonToWorld(r[2]!, r[3]!)];
    const t0 = performance.now();
    const p = shortestPath(g, g.nearestNode(a.x, a.z, 'walk'), g.nearestNode(b.x, b.z, 'walk'), 'walk');
    if (!p) console.warn('preview: no route');
    else console.log(`preview route: ${p.length.toFixed(0)} m, ${p.nodes.length} nodes, ${(performance.now() - t0).toFixed(1)} ms`);
    path = p?.nodes;
  }
  scene.add(graphLines(g, h, path));
}

start().catch((err: unknown) => {
  caption.textContent = `Xem trước bị lỗi: ${String(err)}`;
  console.error(err);
});
