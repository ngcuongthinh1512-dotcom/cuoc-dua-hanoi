import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { reviewSound, unlockAudio } from './audio/sfx.ts';
import { NET, type PoseSample } from '@race/shared/protocol';
import { bounds, chunks as chunkCfg, flyCamera, keys, movement, npc as npcCfg, physics, playerSetup, netClient, raceClient, remote as remoteCfg, render as R, ui } from './config.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Input } from './core/Input.ts';
import { CHUNK_SIZE, type ChunkIndex, type ChunkKey, type SkylineData, type WaterData } from './geo/chunkData.ts';
import { districtAt } from './geo/districts.ts';
import { Gps } from './geo/gps.ts';
import { heightAt, loadHeightGrid } from './geo/heightGrid.ts';
import { StreetLocator } from './geo/locate.ts';
import { graphLines, loadRoadGraph } from './geo/roadGraph.ts';
import { BikeLink } from './net/bikeLink.ts';
import { ClueBoxes, parseBoxes } from './net/ClueBoxes.ts';
import { NetClient } from './net/NetClient.ts';
import { fakeTeams, fakeTick, parsePeers, RemotePlayers } from './net/RemotePlayers.ts';
import { fetchMedia, startSession } from './net/session.ts';
import { PitHost } from './race/PitStop.ts';
import { boxInReach, RaceClient } from './race/RaceClient.ts';
import { RaceHud } from './race/ui/RaceHud.ts';
import { Npc } from './npc/Npc.ts';
import type { NpcAnchor } from './npc/types.ts';
import { loadCharacterAsset } from './player/CharacterModel.ts';
import { FreeFlyCamera } from './player/FreeFlyCamera.ts';
import { parseOverrides, Player } from './player/Player.ts';
import { boxSurface, RailDecks } from './player/railDecks.ts';
import { initCredits } from './ui/Credits.ts';
import { createDebugOverlay } from './ui/DebugOverlay.ts';
import { FullMap } from './ui/FullMap.ts';
import { HUD } from './ui/HUD.ts';
import './ui/hud.css';
import { netDownText } from './ui/Login.ts';
import { MapTiles } from './ui/MapTiles.ts';
import { Menu } from './ui/Menu.ts';
import { Minimap } from './ui/Minimap.ts';
import { notice } from './ui/Toasts.ts';
import { type HudFrame, NO_GPS } from './ui/types.ts';
import { loadBikeAsset } from './vehicle/BikeModel.ts';
import { groundAt } from './vehicle/Bikes.ts';
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
  // Phase 6: online (?race= link, PROD) → the login screen comes up now, over the loading world; offline → null at once.
  const query = new URLSearchParams(location.search);
  const sessionP = startSession(query);
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
  // Phase 6 (docs/plans/phase6.md §3.11, §3.15): the session decides the body. A team (online) walks from where it last
  // stood (welcome.pose); the Host flies as a spectator; online, the test hooks (?player=, action, autoMove, jump, bike,
  // autoTurn, ?cam=) are ignored. Offline (dev server without ?race=, ?offline=1): the test world as before.
  const session = await sessionP;
  const host = session?.role === 'host';
  // ?cam=x,y,z,yawDeg,pitchDeg = spectator (free-fly only, no body; landmark / topdown screenshots; online: Host only).
  // Otherwise the player walks from the spawn (?player[=x,z,yawDeg] overrides it offline, Player.parseOverrides).
  const cam = query.get('cam')?.split(',').filter(Boolean).map(Number); // empty fields → not 5 numbers → spawn
  const camOk = cam?.length === 5 && cam.every(Number.isFinite) && (!session || host);
  const s = flyCamera.spawn;
  const [x, y, z, yawDeg, pitchDeg] = camOk ? cam : [s.x, s.y, s.z, s.yawDeg, s.pitchDeg];
  fly.setPose(x, y, z, yawDeg, pitchDeg);
  const env = { heightAt: (x: number, z: number) => heightAt(grid, x, z), waterLevel: water ? riverLevel(grid, water) : null, water };
  const overrides = parseOverrides(query, !!session);
  const player = camOk || host ? undefined : await Player.create(scene, world, camera, env, overrides, session?.team);
  // D17: no spawn / clue box on top of a rail viaduct (the Bir-Hakeim metro deck over the leg start)
  const rails = new RailDecks(new Set(hasIndex ? index.keys : []), new URL('data/', location.href).href);
  /** (Re)spawn at the leg start / where the team stood (welcome), DEV ?start=x,z,yawDeg: the same path (p7-start). */
  const spawnAt = (x: number, z: number, yaw: number, yHint?: number) => {
    rails.at(x, z); // fetched long before activate() places the body
    player?.setSpawn(x, z, yaw, yHint);
  };
  if (player) {
    player.controller.railAt = (x, z) => rails.at(x, z);
    rails.at(player.position.x, player.position.z);
    const st = query.get('start')?.split(',').map(Number);
    if (import.meta.env.DEV && !session && st?.length === 3 && st.every(Number.isFinite)) spawnAt(st[0]!, st[1]!, (st[2]! * Math.PI) / 180);
  }
  let flying = !player;
  let spectating = false; // D19: the team checked in (or the Host ended the race) → free-fly spectator for good
  let spectateAt = Infinity; // player.simTime then
  // V (F3 open): offline tests only. Never in a race: a finished team must not get its body back and take a shared bike
  // (review2 F9); the Host has no body.
  const canFly = () => !session;
  // Remote players: online, or DEV ?peers=slot,x,z,yawDeg,mode[,action];… stand-ins (p6-peers) offline.
  const peers = import.meta.env.DEV && !session ? parsePeers(query.get('peers')) : [];
  const assets = player?.assets ?? (host ? { character: await loadCharacterAsset(), bike: await loadBikeAsset() } : undefined);
  const remote = assets && (session || peers.length) ? new RemotePlayers(scene, assets.character, assets.bike, remoteCfg.renderRadius) : undefined;
  if (peers.length) remote?.setTeams(fakeTeams(peers));
  let nextFakeTick = 0; // ms of player.simTime
  const groundY = (x: number, z: number) => groundAt(world, x, z, env.heightAt(x, z) + 19); // 20 m ray: decks over the Seine bed too
  // Boxes / mat: the same 20 m ray, but never on a rail viaduct top (D17; null while that is not known → retried)
  const boxGround = (x: number, z: number) => {
    const rail = rails.at(x, z);
    return rail === undefined ? null : boxSurface(world, x, z, env.heightAt(x, z), rail);
  };
  // SPEC §17.10: this team's clue boxes, only from what the server sent (DEV ?boxes=step,x,z[,opened];… offline).
  const boxes = new ClueBoxes(scene, boxGround, env.heightAt);
  if (import.meta.env.DEV && !session) boxes.reset(parseBoxes(query.get('boxes'), query.has('mat') ? 'mat' : undefined));
  const pitHost = player && new PitHost(player.assets.character); // SPEC §8.6: at the mat once it is drawn
  const netPanel = $('net');
  let welcomed = !session; // the world waits for the first welcome (the spawn)
  // Track C's shared bikes: online the list is the server's (Player skips the dev bikes), F asks it (claim).
  const bikeLink = session && player ? new BikeLink(player.bikes) : undefined;
  if (player) player.bikes.notify = notice; // a refused claim → toast (offline too: the p6-bike-lost stand-in)
  // Phase 7 (docs/plans/phase7.md §5.3): race HUD widgets (track C; DEV offline: stand-ins from the URL, p7-* presets) and
  // the team's race state from the server (track B).
  // Offline there is no race: Tab shows an empty book, an "r2:" image resolves to null (the card's placeholder).
  // Phase 8 (D8): answer / branch / accept from anywhere, no pose first; images with the team token (D13).
  const raceHud = player
    ? new RaceHud(
        {
          book: () => void (net ? net.send({ t: 'race', op: 'book' }) : raceHud?.showBook([])),
          answer: (step, text) => race?.answer(step, text),
          branch: (step, id) => race?.branch(step, id),
          accept: (step) => race?.accept(step),
          resolveMedia: (name) => fetchMedia(session, name),
        },
        session?.team?.name ?? '',
      )
    : undefined;
  if (import.meta.env.DEV && !session) raceHud?.demo(query);
  const race =
    session && player
      ? new RaceClient({
          hud: raceHud,
          send: (m) => net?.send(m),
          // D4: the pose first (the gate reset makes it go out now even if unchanged / within 200 ms), then the op
          op: (m) => {
            net?.flushPose(poseOf());
            net?.send(m);
          },
          pose: () => net?.flushPose(poseOf()), // D9: a countdown ended (the branch box may be due)
          serverNow: () => (net ? net.serverNow() : Date.now()),
          team: session.team?.name,
          finished: (fresh) => {
            if (spectating || spectateAt < Infinity) return;
            if (fresh) player.controller.startAction('celebrate'), pitHost?.cheer();
            spectateAt = fresh ? player.simTime + raceClient.spectateAfterS : 0;
          },
        })
      : undefined;
  if (player) {
    // D23: F on foot asks the current box first; offline (DEV ?boxes=) it opens locally (manual tests)
    player.onInteract = () => {
      const [x, z] = [player.position.x, player.position.z];
      if (race) return race.interact(boxes.boxes, x, z, performance.now());
      const b = !session && boxInReach(boxes.boxes, x, z);
      return !!b && (boxes.apply({ t: 'box', op: 'reveal', box: { ...b, opened: true } }), true);
    };
  }
  const net =
    session &&
    new NetClient(session, {
      welcome: (w) => {
        Object.assign(movement, w.movement); // SPEC §6.1: the leg file's speeds, also the server's speed-check limits
        remote?.setTeams(w.teams);
        if (remote) remote.renderRadius = w.presence.renderRadius;
        boxes.reset(w.boxes);
        // SPEC §8.10: back where the team last stood, onto the surface it stood on (pose.y); first entry: its spot at the
        // leg start (D17). The first welcome only: after a reconnect the body stays put.
        if (!welcomed && w.pose) spawnAt(w.pose.x, w.pose.z, w.pose.yaw, w.pose.y);
        else if (!welcomed && w.start) spawnAt(w.start.x, w.start.z, w.start.yaw);
        welcomed = true;
        bikeLink?.welcome(w); // w.bikes; w.pose.bikeId + mode 'bike' → mount again (SPEC §8.10)
        race?.welcome(w, player?.simTime ?? 0);
      },
      tick: (serverMs, entries) => remote?.apply(serverMs, entries),
      message: (m) => {
        if (race?.message(m)) return; // race / book / zone (Phase 7)
        if (m.t === 'team') remote?.setOnline(m.slot, m.online);
        else if (m.t === 'gesture') remote?.gesture(m.slot, m.g);
        else if (m.t === 'notice') {
          notice(m.code);
          if (m.code === 'approved' || m.code === 'penalized') reviewSound(m.code === 'approved'); // SPEC §8.9 (6)
        }
        else if (m.t === 'box') boxes.apply(m);
        else bikeLink?.message(m); // 'bikes' / 'bike' (claim result)
      },
      status: (connected, reason) => {
        netPanel.textContent = connected ? '' : netDownText(reason ?? 'closed');
        netPanel.hidden = connected;
      },
    });
  if (net && player) {
    player.bikes.net = net; // team / colour: Player.create(…, session.team)
    player.bikes.ground = (x, z, y) => groundAt(world, x, z, Math.max(y, env.heightAt(x, z)) + 3);
    let gestureAt = -Infinity; // R / G mashing must not trip the server's message limit
    player.onGesture = (g) => {
      if (performance.now() - gestureAt < netClient.gestureGapMs) return;
      gestureAt = performance.now();
      net.send({ t: 'gesture', g });
    };
    player.onRespawn = (how) => {
      const p = player.controller.state;
      net.send({ t: 'respawn', x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, how });
    };
  }
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
  // D20 (SPEC §17.5): no NPC inside a box / mat zone (+ npc.zoneMargin); ?npcZone circles kept
  const npcZones = () => [...(overrides.npcZones ?? []), ...boxes.boxes.map((b) => ({ x: b.x, z: b.z, r: b.r }))];
  boxes.onChange = () => npcs?.setExclusionZones(npcZones());
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
          zones: npcZones(),
          test: overrides.npcTest ?? [],
        });
      })
      .then((n) => {
        npcs = n;
        n.setExclusionZones(npcZones()); // boxes that came (welcome / reveal) while the NPC assets loaded (review2 F3)
      })
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
  const modal = () => menu.isOpen || !!fullMap?.isOpen || !!raceHud?.open; // the body stops, keys go to the menu / map / Sổ mật thư
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
  if (import.meta.env.DEV) Object.assign(window, { __GAME__: { fly, player, graph, npcs: () => npcs, gps: () => gps, minimap, fullMap: () => fullMap, net, remote, boxes } }); // for scratch test scripts
  const debug = createDebugOverlay(query.get('debug') === '1');

  // Esc releases the pointer (the browser eats the key), so "unlocked" = help/menu is showing. SPEC §17.2: the menu opens
  // by itself when the pointer is released (not at start: nothing was locked yet), except when M released it for the map
  // or a clue card / the Sổ mật thư did (Phase 8 B1).
  const help = $('help');
  help.hidden = false;
  let unlockedAt = -Infinity;
  let cardClosed = false; // a clue card / the Sổ closed since the last frame: its Esc / Enter press opens no menu / card
  input.onPointerLockChange = (locked) => {
    if (locked) menu.close();
    else {
      unlockedAt = performance.now();
      if (!fullMap?.isOpen && !raceHud?.open) menu.open();
    }
    help.hidden = locked || modal();
  };
  // Phase 8 B1 (critic): links, images, buttons and the answer box of a card / the Sổ take the mouse, so the pointer is free
  // while one is open (no menu: above), and locked again on close, right inside the key / click handler that closed it
  // (Firefox grants the lock only there; Tab closes in the frame loop: locked in the keydown below).
  if (raceHud) {
    raceHud.onOpenChange = (open) => {
      if (open) return void document.exitPointerLock();
      cardClosed = true;
      input.lock();
    };
    // the dimmed backdrop lets clicks through to the canvas, which locks the pointer (Input): close the card first
    renderer.domElement.addEventListener('click', () => raceHud.open && raceHud.toggleBook());
  }
  // Firefox (and Safari) grant pointer lock only inside an input event handler, not in the frame loop that handles M /
  // Esc below: a key that will close the map or the menu locks right here (the loop closes it next frame; its own
  // lock() is then a no-op, or a rejected request that Input swallows). Chrome allows both.
  addEventListener('keydown', (e) => {
    if (e.repeat || input.locked || performance.now() - unlockedAt <= 300) return;
    if ((fullMap?.isOpen && (keys.map.includes(e.code) || keys.menu.includes(e.code))) || (menu.isOpen && keys.menu.includes(e.code))) input.lock();
    else if (raceHud?.open && keys.clueBook.includes(e.code) && !(e.target instanceof HTMLInputElement)) input.lock(); // Tab: the loop closes it (not from the answer box: core/Input.ts leaves text fields alone)
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
      // V: player ⇄ free-fly (debug only, SPEC §17.2 "camera bay tự do"); the body stays frozen where it was. Offline only
      // (canFly): a team in a race flies only as the D19 spectator, and stays one.
      if (player && !spectating && player.simTime >= spectateAt) {
        spectating = true; // D19: after the celebration (or at once on re-entry after the finish), the camera flies
        if (!flying) {
          flying = true;
          euler.setFromQuaternion(camera.quaternion, 'YXZ');
          fly.setPose(camera.position.x, camera.position.y, camera.position.z, euler.y / (Math.PI / 180), euler.x / (Math.PI / 180));
          $('help-player').hidden = true;
          $('help-fly').hidden = false;
        }
      }
      if (player && canFly() && debug.visible && input.wasPressed('flyToggle')) {
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
        else if (!flying && !raceHud?.open) {
          // not from the free-fly camera (V, debug): the map is the body's (review m14); not under the Sổ mật thư / card
          menu.close();
          fullMap.open(frame);
          if (fullMap.isOpen) document.exitPointerLock();
        }
      }
      if (raceHud && input.wasPressed('clueBook') && !menu.isOpen && !fullMap?.isOpen) raceHud.toggleBook(); // Tab: Sổ mật thư (SPEC §8.11)
      // Phase 8 (§17.14): Enter with nothing open → the current card again (answer history, input box)
      if (raceHud && input.wasPressed('clueCard') && !modal() && !flying && !cardClosed) raceHud.openCurrent();
      if (input.wasPressed('menu') && performance.now() - unlockedAt > 300 && !cardClosed) {
        if (fullMap?.isOpen) fullMap.close(), input.lock();
        else if (menu.isOpen) menu.close(), input.lock();
        else if (!input.locked) menu.open();
        help.hidden = input.locked || modal();
      }
      if (flying) fly.update(dt, input);
      if (player && player.simTime >= respawnAt) (respawnAt = Infinity), menu.actions.respawn?.();
      player?.update(dt, flying ? null : input, loop.alpha, modal() || cardClosed); // the Space that closed a card is no jump
      if (player?.active) bikeLink?.frame(dt, player.controller);
      if (net && player?.active && !flying) net.sendPose(poseOf()); // 5 Hz, only on change (NetClient decides); none while spectating
      if (peers.length && player?.active && player.simTime * 1000 >= nextFakeTick) {
        remote?.apply(nextFakeTick, fakeTick(peers, nextFakeTick, (x, z) => groundY(x, z) ?? env.heightAt(x, z))); // DEV: a server tick, simulated clock
        nextFakeTick += 1000 / NET.tickHz;
      }
      remote?.update(dt, net ? net.serverNow() : player ? player.simTime * 1000 : 0, camera.position);
      boxes.update(camera.position);
      if (pitHost && player) pitHost.update(dt, boxes.mat, player.position);
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
          raceTime: race ? race.raceTime() : undefined, penaltyMinutes: race?.view?.penaltyMinutes, raceStatus: race?.view?.status,
        } satisfies HudFrame);
        const riding = !!player.controller.riding;
        const inZone = !player.active ? false : race ? race.frame(boxes.boxes, x, z, riding, performance.now()).inZone : !riding && !!boxInReach(boxes.boxes, x, z);
        raceHud?.update({ simTime: Math.max(0, player.simTime), serverNow: net ? net.serverNow() : 0, inZone });
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
      cardClosed = false;
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
      const netLine = net
        ? `Mạng: ${net.connected ? 'đã nối' : 'mất kết nối'} · ping ${Number.isFinite(net.rtt) ? `${net.rtt.toFixed(0)} ms` : '–'} · ` +
          `${remote?.count ?? 0} người chơi đang thấy · gửi ${net.stats.sent} · nhận ${net.stats.received} · nối lại ${net.stats.reconnects}`
        : remote && `Mạng: ngoại tuyến · ${remote.count} người chơi giả đang thấy (?peers)`;
      debug.update({ fps: loop.fps, workMs: loop.workMs, renderer, position: camera.position, speed: fly.speed, chunks: cs, colliders, player: playerLine, bike: bikeLine, npc: npcLine, hud: hudLine, net: netLine || undefined });
      const { calls, triangles } = renderer.info.render;
      const npcStats = { npcCars: ns?.cars ?? 0, npcPeds: ns?.peds ?? 0, npcMs: +(ns?.simMs ?? 0).toFixed(3), npcDrawMs: +(ns?.drawMs ?? 0).toFixed(3) };
      Object.assign(window, { __STATS__: { calls, triangles, chunks: cs.loaded, colliders, geometries: renderer.info.memory.geometries, ...npcStats } });
      // Signal for scripts/screenshot.ts: every chunk around the camera attached and a few frames drawn.
      if (!worldReady) loading.textContent = cs.pending || welcomed ? `Đang tải bản đồ… còn ${cs.pending} ô` : 'Đang kết nối máy chủ…';
      if (!worldReady && loop.frames >= 3 && chunks.idle && models.idle && graphLoaded && welcomed) {
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
