import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { unlockAudio } from './audio/sfx.ts';
import type { PoseSample } from '@race/shared/protocol';
import { bounds, chunks as chunkCfg, flyCamera, keys, movement, npc as npcCfg, physics, playerSetup, render as R, ui } from './config.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Input } from './core/Input.ts';
import { CHUNK_SIZE, type ChunkIndex, type ChunkKey, type SkylineData, type WaterData } from './geo/chunkData.ts';
import { districtAt } from './geo/districts.ts';
import { Gps } from './geo/gps.ts';
import { heightAt, loadHeightGrid } from './geo/heightGrid.ts';
import { StreetLocator } from './geo/locate.ts';
import { graphLines, loadRoadGraph } from './geo/roadGraph.ts';
import { NetClient } from './net/NetClient.ts';
import { RemotePlayers } from './net/RemotePlayers.ts';
import { startSession } from './net/session.ts';
import { Npc } from './npc/Npc.ts';
import type { NpcAnchor } from './npc/types.ts';
import { FreeFlyCamera } from './player/FreeFlyCamera.ts';
import { parseOverrides, Player } from './player/Player.ts';
import { initCredits } from './ui/Credits.ts';
import { createDebugOverlay } from './ui/DebugOverlay.ts';
import { FullMap } from './ui/FullMap.ts';
import { HUD } from './ui/HUD.ts';
import './ui/hud.css';
import { MapTiles } from './ui/MapTiles.ts';
import { Menu } from './ui/Menu.ts';
import { Minimap } from './ui/Minimap.ts';
import { notice } from './ui/Toasts.ts';
import { type HudFrame, NO_GPS } from './ui/types.ts';
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
  worker.postMessage({ type: 'init', grid, dataUrl: hasIndex ? new URL('data/', location.href).href : '', districts: water?.districts } satisfies ToWorker);
  const propMeshes = createPropMeshes();
  const models = createLandmarkModels(new URL('data/', location.href).href, (x, z) => heightAt(grid, x, z), materials, propMeshes);
  const chunks = new ChunkManager(worker, hasIndex ? index.keys : bboxKeys(), scene, world, materials, propMeshes, hasIndex ? models.attach : undefined);
  const tiles = new MapTiles(water); // Phase 5 minimap tiles, from each chunk's map layers (built in the worker)
  chunks.onMap = (key, map) => tiles.add(key, map);

  const input = new Input(renderer.domElement);
  const fly = new FreeFlyCamera(camera); // spectator: flies through everything, no collider
  const query = new URLSearchParams(location.search);
  // ?cam=x,y,z,yawDeg,pitchDeg = spectator (free-fly only, no body; landmark / topdown screenshots). Otherwise the player
  // walks from the spawn (?player[=x,z,yawDeg] overrides it, Player.parseOverrides) and V in the debug panel flies.
  const cam = query.get('cam')?.split(',').filter(Boolean).map(Number); // empty fields → not 5 numbers → spawn
  const spectator = cam?.length === 5 && cam.every(Number.isFinite);
  const s = flyCamera.spawn;
  const [x, y, z, yawDeg, pitchDeg] = spectator ? cam : [s.x, s.y, s.z, s.yawDeg, s.pitchDeg];
  fly.setPose(x, y, z, yawDeg, pitchDeg);
  const env = { heightAt: (x: number, z: number) => heightAt(grid, x, z), waterLevel: water ? riverLevel(grid, water) : null, water };
  const overrides = parseOverrides(query);
  const player = spectator ? undefined : await Player.create(scene, world, camera, env, overrides);
  let flying = !player;
  // Phase 6 (docs/plans/phase6.md §5): online session (team code → token → WebSocket to the race's Durable Object) or
  // the offline test world as before (null). Track B: login screen, spawn at the saved pose, respawn / G / R over the
  // wire, test URL params ignored online, free-fly for the Host / spectators / finished teams only.
  const session = await startSession(query);
  const remote = session && player ? new RemotePlayers(scene, player.assets.character, player.assets.bike, 300) : undefined;
  const net =
    session &&
    new NetClient(session, {
      welcome: (w) => {
        Object.assign(movement, w.movement); // SPEC §6.1: the leg file's speeds, also the server's speed-check limits
        remote?.setTeams(w.teams);
        if (remote) remote.renderRadius = w.presence.renderRadius;
      },
      tick: (serverMs, entries) => remote?.apply(serverMs, entries),
      message: (m) => {
        if (m.t === 'team') remote?.setOnline(m.slot, m.online);
        else if (m.t === 'gesture') remote?.gesture(m.slot, m.g);
      },
      status: () => {},
    });
  net?.connect();
  const poseOf = (): PoseSample => {
    const s = player!.controller.state;
    return { x: s.position.x, y: s.position.y, z: s.position.z, yaw: s.yaw, mode: s.moveMode, action: s.action };
  };
  // Cobbles (SPEC §6.6) once roadgraph.json is in; asphalt until then or where the graph knows nothing.
  const graph = loadRoadGraph();
  let graphLoaded = false; // the player activates after it (surfaces from the first step; deterministic screenshots)
  void graph.then(() => void (graphLoaded = true));
  if (player) void graph.then((g) => g && (player.controller.surfaceAt = (x, z) => g.surfaceAt(x, z) ?? 'asphalt'));
  // N (F3 panel open) or ?graph=1: road graph overlay, built on first use (~100k edges, 1 draw call).
  let graphOverlay: THREE.Object3D | undefined;
  const toggleGraph = () =>
    void graph.then((g) => {
      if (!g) return;
      if (graphOverlay) graphOverlay.visible = !graphOverlay.visible;
      else scene.add((graphOverlay = graphLines(g, env.heightAt)));
    });
  if (query.get('graph') === '1') toggleGraph();
  // Phase 4B: NPC traffic + pedestrians around the body (the spectator: around the ground under the camera). They start
  // (fill + warm-up) with the world; __READY__ waits for that. ?npc=0 off.
  let npcs: Npc | undefined;
  let npcReady = !(npcCfg.enabled && overrides.npc !== false);
  if (!npcReady) {
    void graph
      .then((g) => {
        if (!g) throw new Error('no road graph');
        return Npc.create(scene, world, g, env.heightAt, {
          seed: overrides.npcSeed ?? npcCfg.seed,
          density: overrides.npcDensity ?? npcCfg.density,
          // screenshots / scripted runs (?wait=, headless = navigator.webdriver) keep a fixed density: the frame rate of the
          // capturing machine must not change the picture (review m1)
          auto: overrides.npcDensity === undefined && !query.has('wait') && !navigator.webdriver,
          zones: overrides.npcZones ?? [],
          test: overrides.npcTest ?? [],
        });
      })
      .then((n) => void (npcs = n))
      .catch((err: unknown) => {
        console.warn('NPC disabled:', err);
        npcReady = true;
      });
  }
  const anchor: NpcAnchor = { x: 0, z: 0, viewYaw: 0, body: false, vx: 0, vz: 0, nose: null, waving: false };
  const view = new THREE.Vector3();
  const npcAnchor = () => {
    camera.getWorldDirection(view);
    const viewYaw = Math.atan2(-view.x, -view.z);
    if (player) return player.npcAnchor(anchor, viewYaw);
    return Object.assign(anchor, { x: camera.position.x, z: camera.position.z, viewYaw, body: false, vx: 0, vz: 0, nose: null, waving: false });
  };
  // Phase 5 HUD (docs/plans/phase5.md §5): player mode only (the spectator has no body). The full map, the GPS and the
  // street names need the road graph: created once it is in.
  document.body.classList.add('hud-off'); // until the world is ready (the loop toggles it)
  const hud = player && new HUD();
  const minimap = player && new Minimap(tiles);
  let gps: Gps | undefined;
  let fullMap: FullMap | undefined;
  let streets: StreetLocator | undefined;
  if (player) {
    void graph.then((g) => {
      if (!g) return;
      const nav = (gps = new Gps(g));
      streets = new StreetLocator(g);
      fullMap = new FullMap(g, water, (p) => (p ? nav.setTarget(p.x, p.z) : nav.clear()));
    });
  }
  const frame: HudFrame = { x: 0, z: 0, heading: 0, bodyYaw: 0, speed: 0, riding: false, swimming: false, time: 0, street: undefined, district: 0 };
  const menu = new Menu({
    resume: () => input.lock(),
    ...(player && { respawn: () => notice(player.controller.respawn() === 'stairs' ? 'respawnStairs' : 'respawn') }),
  });
  const modal = () => menu.isOpen || !!fullMap?.isOpen; // the body stops, keys go to the menu / map
  // URL hooks (screenshots, tests; docs/plans/phase5.md §7), applied once the world is ready: ?gps=x,z waypoint,
  // ?map[=metersPerPx] full map open, ?menu menu open, ?respawn=s "Kẹt? Về chỗ an toàn" after s simulated seconds.
  const gpsArg = query.get('gps')?.split(',').map(Number);
  const respawnArg = Number(query.get('respawn') ?? NaN);
  let respawnAt = Number.isFinite(respawnArg) ? respawnArg : Infinity;
  const applyUrlHooks = () => {
    if (gps && gpsArg?.length === 2 && gpsArg.every(Number.isFinite)) gps.setTarget(gpsArg[0]!, gpsArg[1]!);
    if (fullMap && query.has('map')) fullMap.open(frame, Number(query.get('map')) || undefined);
    else if (query.has('menu')) menu.open();
    help.hidden = input.locked || modal();
  };

  renderer.domElement.addEventListener('click', unlockAudio); // browsers only allow audio after a user gesture
  $('help-player').hidden = !player;
  $('help-fly').hidden = !!player;
  if (import.meta.env.DEV) Object.assign(window, { __GAME__: { fly, player, graph, npcs: () => npcs, gps: () => gps, minimap, fullMap: () => fullMap, net, remote } }); // for scratch test scripts
  const debug = createDebugOverlay(query.get('debug') === '1');

  // Esc releases the pointer (the browser eats the key), so "unlocked" = help/menu is showing. SPEC §17.2: the menu opens
  // by itself when the pointer is released (not at start: nothing was locked yet), except when M released it for the map.
  const help = $('help');
  help.hidden = false;
  let unlockedAt = -Infinity;
  input.onPointerLockChange = (locked) => {
    if (locked) menu.close();
    else {
      unlockedAt = performance.now();
      if (!fullMap?.isOpen) menu.open();
    }
    help.hidden = locked || modal();
  };
  // Firefox (and Safari) grant pointer lock only inside an input event handler, not in the frame loop that handles M /
  // Esc below: a key that will close the map or the menu locks right here (the loop closes it next frame; its own
  // lock() is then a no-op, or a rejected request that Input swallows). Chrome allows both.
  addEventListener('keydown', (e) => {
    if (e.repeat || input.locked || performance.now() - unlockedAt <= 300) return;
    if ((fullMap?.isOpen && (keys.map.includes(e.code) || keys.menu.includes(e.code))) || (menu.isOpen && keys.menu.includes(e.code))) input.lock();
  });
  input.onImeSuspected = () => {
    const box = $('ime');
    box.hidden = false;
    setTimeout(() => void (box.hidden = true), ui.imeNoticeMs);
  };
  initCredits();
  const edge = $('edge');
  const loading = $('loading');

  const waitArg = Number(query.get('wait') ?? NaN);
  const wait = Number.isFinite(waitArg) ? waitArg : playerSetup.readyWait; // s simulated before __READY__ (player mode)
  const euler = new THREE.Euler();
  let worldReady = false; // first view loaded: player spawns, chunk attach gets budgeted
  let ready = false; // window.__READY__
  let npcFrames = 0; // frames through npcs.update
  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      // Before the player (docs/plans/phase4b.md §5.2): cars → pedestrians → car colliders → shove / crash the body.
      if (npcs?.started) npcs.fixedUpdate(dt, npcAnchor(), player?.active && !flying ? player.controller : undefined);
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
      if (debug.visible && input.wasPressed('graphToggle')) toggleGraph();
      // Phase 5: M = full map (pointer released for dragging / clicking); Esc with the pointer free closes the map or
      // the menu, or opens the menu. A press right after an unlock is the Esc that released it (some browsers deliver
      // it): ignored.
      if (fullMap && input.wasPressed('map')) {
        if (fullMap.isOpen) fullMap.close(), input.lock();
        else if (!flying) {
          // not from the free-fly camera (V, debug): the map is the body's (review m14)
          menu.close();
          fullMap.open(frame);
          if (fullMap.isOpen) document.exitPointerLock();
        }
      }
      if (input.wasPressed('menu') && performance.now() - unlockedAt > 300) {
        if (fullMap?.isOpen) fullMap.close(), input.lock();
        else if (menu.isOpen) menu.close(), input.lock();
        else if (!input.locked) menu.open();
        help.hidden = input.locked || modal();
      }
      if (flying) fly.update(dt, input);
      if (player && player.simTime >= respawnAt) (respawnAt = Infinity), menu.actions.respawn?.();
      player?.update(dt, flying ? null : input, loop.alpha, modal());
      if (net && player?.active) net.sendPose(poseOf()); // 5 Hz, only on change (NetClient decides)
      if (net) remote?.update(dt, net.serverNow(), camera.position);
      // No HUD while loading or flying (V): hud.css hides every .hud-box / .hud-hand (clock, minimap, toasts).
      document.body.classList.toggle('hud-off', !worldReady || flying);
      if (player && hud && minimap) {
        const s = player.controller.state;
        camera.getWorldDirection(view);
        const [x, z] = [player.position.x, player.position.z];
        Object.assign(frame, {
          x, z, heading: Math.atan2(-view.x, -view.z), bodyYaw: s.yaw, speed: Math.hypot(s.velocity.x, s.velocity.z),
          riding: !!player.controller.riding, swimming: s.moveMode === 'swim', time: Math.max(0, player.simTime),
          street: streets?.at(x, z), district: districtAt(water?.districts, x, z),
        } satisfies HudFrame);
        gps?.update(x, z, frame.riding ? 'bike' : 'walk', dt);
        hud.update(frame, dt);
        minimap.update(frame, gps ?? NO_GPS, dt);
        if (fullMap?.isOpen) fullMap.update(frame, gps ?? NO_GPS);
      }
      if (npcs?.started) {
        npcs.update(dt, loop.alpha, camera);
        npcFrames++;
        npcs.zoneRings.visible = debug.visible;
      }
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
        `Nhân vật: ${ps.moveMode}${ps.action === 'none' ? '' : ` (${ps.action})`} · ${ps.grounded ? 'chạm đất' : 'không chạm đất'}` +
          `${ps.inWater ? ' · dưới nước' : ''} · ${Math.hypot(ps.velocity.x, ps.velocity.z).toFixed(2)} m/s · ` +
          `chân y ${ps.position.y.toFixed(2)} · camera ${flying ? 'bay tự do (V)' : player.camera.mode}`;
      const rb = player?.controller.riding;
      const bikeLine =
        player &&
        `Xe: ${rb ? `${rb.speed.toFixed(2)} m/s · nghiêng ${((rb.lean * 180) / Math.PI).toFixed(0)}° · mặt đường ${player.surface === 'pave' ? 'đá lát' : 'nhựa'}` : 'đi bộ'}` +
          ` · ${player.bikes.list.length} xe quanh đây`;
      const ns = npcs?.stats;
      const npcLine =
        ns &&
        `NPC: ${ns.cars} xe · ${ns.peds} người · mật độ ${ns.density.toFixed(2).replace('.', ',')} · ` +
          `${ns.simMs.toFixed(2).replace('.', ',')} ms/bước · vẽ ${ns.drawMs.toFixed(2).replace('.', ',')} ms · ${ns.colliders} collider`;
      const ts = tiles.stats;
      const hudLine =
        player &&
        `HUD: ${ts.tiles} ô bản đồ (${ts.vectors} chunk vector) · raster ${ts.rasterMs.toFixed(2).replace('.', ',')} ms · ` +
          `GPS ${gps?.stats.searches ?? 0} lần, ${(gps?.stats.ms ?? 0).toFixed(2).replace('.', ',')} ms`;
      const netLine =
        net &&
        `Mạng: ${net.connected ? 'đã nối' : 'mất kết nối'} · ping ${Number.isFinite(net.rtt) ? `${net.rtt.toFixed(0)} ms` : '–'} · ` +
          `${remote?.count ?? 0} người chơi đang thấy · gửi ${net.stats.sent} · nhận ${net.stats.received}`;
      debug.update({ fps: loop.fps, workMs: loop.workMs, renderer, position: camera.position, speed: fly.speed, chunks: cs, colliders, player: playerLine, bike: bikeLine, npc: npcLine, hud: hudLine, net: netLine || undefined });
      const { calls, triangles } = renderer.info.render;
      const npcStats = { npcCars: ns?.cars ?? 0, npcPeds: ns?.peds ?? 0, npcMs: +(ns?.simMs ?? 0).toFixed(3), npcDrawMs: +(ns?.drawMs ?? 0).toFixed(3) };
      Object.assign(window, { __STATS__: { calls, triangles, chunks: cs.loaded, colliders, geometries: renderer.info.memory.geometries, ...npcStats } });
      // Signal for scripts/screenshot.ts: every chunk around the camera attached and a few frames drawn.
      if (!worldReady) loading.textContent = `Đang tải bản đồ… còn ${cs.pending} ô`;
      if (!worldReady && loop.frames >= 3 && chunks.idle && models.idle && graphLoaded) {
        worldReady = true;
        loading.hidden = true;
        player?.activate(); // the chunk colliders around the spawn exist now
        applyUrlHooks();
      }
      if (worldReady && npcs && !npcs.started) {
        npcs.start(npcAnchor()); // fill + warm-up (npcRender.warmUp s)
        npcReady = true;
      }
      // NPCs: ≥ 2 frames through npcs.update (drawn, and in __STATS__ above) — the spectator has no `wait` to cover it.
      if (!ready && worldReady && npcReady && (!npcs || npcFrames >= 2) && (!player || player.simTime >= wait)) {
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
