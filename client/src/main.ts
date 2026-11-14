import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { reviewSound, unlockAudio } from './audio/sfx.ts';
import { announceBeats, type CqWatch, NET, type PoseSample, type RaceView, type RoomAt } from '@race/shared/protocol';
import { bounds, chunks as chunkCfg, flyCamera, keys, movement, npc as npcCfg, physics, playerSetup, netClient, remote as remoteCfg, render as R, rooms as roomCfg, ui } from './config.ts';
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
import { fakeTeams, fakeTick, parsePeers, RemotePlayers, underground } from './net/RemotePlayers.ts';
import { fetchMedia, isOnline, startSession } from './net/session.ts';
import { PitHost } from './race/PitStop.ts';
import { boxInReach, RaceClient } from './race/RaceClient.ts';
import { RaceHud } from './race/ui/RaceHud.ts';
import { DEMO_ROOM_STATES, demoRoomResult, demoRoomViews, type DemoRoomState } from './rooms/roomDemo.ts';
import { enterSpot, exitSpot, roomFrame, toWorld } from './rooms/roomFrame.ts';
import { type CqLink, raceLink } from './cetiqlo/cetiqloNet.ts';
import type { CqDemoState, CqMock } from './cetiqlo/cetiqloMock.ts';
import { hideRoomDone, showRoomDone } from './rooms/doneScreen.ts';
import { ROOM_TEXT, RoomFlow, isFreeRoom, pickupView, roomOf, type RoomEvent, type RoomTarget } from './rooms/roomState.ts';
import type { RoomHandle } from './rooms/types.ts';
import { hideWorld, showWorld } from './world/hideWorld.ts';
import { Spectate, TEXT as SP } from './spectate/Spectate.ts';
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
import { Minimap, setArrowColour } from './ui/Minimap.ts';
import { notice, penalizedText, scoredText, toast } from './ui/Toasts.ts';
import { type HudFrame, NO_GPS } from './ui/types.ts';
import { loadBikeAsset } from './vehicle/BikeModel.ts';
import { groundAt } from './vehicle/Bikes.ts';
import { withFallbacks } from './world/attach.ts';
import { bboxCorners, createBoundsWalls, edgeDistance } from './world/Bounds.ts';
import { createBuildingMaterials } from './world/BuildingBuilder.ts';
import type { ToWorker } from './world/buildTypes.ts';
import { ChunkManager } from './world/ChunkManager.ts';
import { createLandmarkMaterials } from './world/landmarks/index.ts';
import { createStairMaterials } from './world/stairs.ts';
import { createLandmarkModels } from './world/landmarks/models.ts';
import { createRoadMaterials } from './world/RoadBuilder.ts';
import { createSky } from './world/Sky.ts';
import { createPropMaterials, createPropMeshes } from './world/StreetProps.ts';
import { carveRiver, createTerrainCollider, createTerrainMaterials, flattenPads, lakeSurfaceAt, riverLevel } from './world/Terrain.ts';
import { createWater } from './world/Water.ts';
import { createPost } from './world/post.ts';
import { applyLook, setLookActive } from './world/look.ts';
import { initTimeOfDay } from './world/night.ts';
import { FpsWatch, graphics } from './world/graphics.ts';

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
  initTimeOfDay(query, isOnline(query)); // Leg 2 night: before the sky, the post passes and every material
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = R.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 removed PCFSoftShadowMap; PCF is soft via light.shadow.radius
  document.body.prepend(renderer.domElement);
  applyLook(renderer.domElement); // Leg 3 'vintage hiện đại' grade (config look); off inside rooms
  let lookOn = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(R.fov, 1, R.near, R.far);
  let post = createPost(renderer, scene, camera); // Phase 8C T1: null = plain renderer.render
  let room: RoomHandle | undefined; // Leg 3: the Lựa chọn kép room the body is in (below)
  const resize = () => {
    renderer.setPixelRatio(room ? 1 : Math.min(devicePixelRatio, R.maxPixelRatio)); // Leg 3: minimal graphics inside a room
    renderer.setSize(innerWidth, innerHeight);
    post?.setSize(innerWidth, innerHeight);
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
  // Leg 2: the Paris skyline (Sacré-Cœur, Montparnasse, La Défense) is gone; Taipa / Cotai towers from skyline.json come in a later step
  void skyline;
  const materials = withFallbacks(
    Object.assign(
      {},
      ...[createTerrainMaterials, createBuildingMaterials, createRoadMaterials, createPropMaterials, createLandmarkMaterials, createStairMaterials].map(
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
  // Testing (docs/plans/cetiqlo.md "Chạy thử CETIQLO"): ?autoCq=1 with a team session = straight into the CETIQLO room: the world is
  // "ready" at the welcome (the street streams in the background), F at the box by itself, the clue card closed by itself.
  const autoCq = session?.role === 'team' && query.get('autoCq') === '1';
  // SPEC §17.40: the Host and a spectator (spectator code) have no body: the watch mode (Spectate) from the start. DEV
  // offline ?spectate=1 (+ ?peers= stand-ins): the same without a server (p9-watch).
  const viewer = (!!session && session.role !== 'team') || (import.meta.env.DEV && !session && query.has('spectate'));
  // ?cam=x,y,z,yawDeg,pitchDeg = free camera only (no body; landmark / topdown screenshots; online: Host only).
  // Otherwise the player walks from the spawn (?player[=x,z,yawDeg] overrides it offline, Player.parseOverrides).
  const cam = query.get('cam')?.split(',').filter(Boolean).map(Number); // empty fields → not 5 numbers → spawn
  const camOk = cam?.length === 5 && cam.every(Number.isFinite) && (!session || host);
  const s = flyCamera.spawn;
  const [x, y, z, yawDeg, pitchDeg] = camOk ? cam : [s.x, s.y, s.z, s.yawDeg, s.pitchDeg];
  fly.setPose(x, y, z, yawDeg, pitchDeg);
  const env = { heightAt: (x: number, z: number) => heightAt(grid, x, z), waterLevel: water ? riverLevel(grid, water) : null, water, lakeAt: (x: number, z: number) => lakeSurfaceAt(grid, x, z) };
  const overrides = parseOverrides(query, !!session);
  if (session?.team?.avatar !== undefined) overrides.avatar = session.team.avatar; // Leg 3: a personal avatar follows the player's name (server playerAvatar)
  // Leg 3 rooms (the Louvre room's critic C2): only the Player gets its OWN env (the room floor, no Seine while inside); `env`
  // stays the grid for the NPCs, the boxes, the overlays and the remote players' height filter.
  let roomFloor: number | null = null;
  const playerEnv = { ...env, heightAt: (x: number, z: number) => roomFloor ?? env.heightAt(x, z), get waterLevel() { return roomFloor != null ? null : env.waterLevel; }, lakeAt: (x: number, z: number) => (roomFloor != null ? null : env.lakeAt(x, z)) };
  const player = camOk || viewer ? undefined : await Player.create(scene, world, camera, playerEnv, overrides, session?.team);
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
  // SPEC §17.39: a team that finished (checked in, BỊ LOẠI, the Host's "Kết thúc") keeps its body: it walks, swims, sends
  // its poses like everyone else; the server refuses its race ops / bike claims (raceOver). No free-fly for good (old D19).
  let over = false;
  // V (F3 open): offline tests only. Never in a race (a finished team walks on with its body; the Host has no body).
  const canFly = () => !session;
  // Remote players: online, or DEV ?peers=slot,x,z,yawDeg,mode[,action];… stand-ins (p6-peers) offline.
  const peers = import.meta.env.DEV && !session ? parsePeers(query.get('peers')) : [];
  const assets = player?.assets ?? (viewer ? { character: await loadCharacterAsset(), bike: await loadBikeAsset() } : undefined);
  const remote = assets && (session || peers.length || (import.meta.env.DEV && query.get('roomDemo') === 'cetiqlo')) ? new RemotePlayers(scene, assets.character, assets.bike, remoteCfg.renderRadius) : undefined; // Leg 3: the CETIQLO mock's bot body
  if (peers.length) remote?.setTeams(fakeTeams(peers));
  let nextFakeTick = 0; // ms of the local clock below
  let demoClock = 0; // s since the world was ready, a viewer's clock (no Player.simTime): DEV fake ticks, ?wait=
  const localMs = () => (player ? player.simTime : demoClock) * 1000;
  // SPEC §17.40: the watch mode (spectate/Spectate.ts) for the Host / a spectator from the start, for a team once it finished
  // (X toggles it). `watching` = the camera is the Spectate's (a followed body, or free fly); the body then stands still,
  // sends no pose, and the server is told (`watch`) so the ticks carry every team.
  const spectate = remote && (viewer || session) ? new Spectate({ fly, poseOf: (slot) => remote.poseOf(slot), onFree: () => input.lock(), team: !!player }) : undefined;
  let watching = !!viewer;
  spectate?.show(watching);
  if (peers.length) spectate?.setTeams(fakeTeams(peers));
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
          answer: (step, text, parts) => race?.answer(step, text, parts),
          branch: (step, id) => race?.branch(step, id),
          accept: (step) => race?.accept(step),
          ...(session && { resolveMedia: (name: string) => fetchMedia(session, name) }), // none offline: "Hình chỉ tải được trong cuộc đua"
        },
        session?.team?.name ?? '',
      )
    : undefined;
  if (raceHud && pitHost) raceHud.announce = (beats, done) => pitHost.announce(beats, done); // the finish: Ceti says it in a bubble, then the card opens
  if (import.meta.env.DEV && !session && pitHost && query.has('announce')) {
    // DEV offline: ?announce=<rank>&announceAt=<s> — Ceti's bubble announcement, started part-way (screenshots)
    pitHost.announce(announceBeats('finish', Number(query.get('announce')) || 11, 12, 'Đội Xanh'), () => undefined, Number(query.get('announceAt') ?? 0));
  }
  if (import.meta.env.DEV && !session) raceHud?.demo(query);
  // Leg 3 (rooms/roomState.ts, the Leg 1 Louvre room's way): a Lựa chọn kép branch whose task has `room` = a 3D room
  // (chocolate workshop / comic gallery) built `rooms.below` m UNDER the branch box in world coordinates (rooms/roomFrame.ts)
  // once the team opened the box: the room module (dynamic import: its own chunk) puts one group into the game's scene and
  // its colliders into the game's Rapier world; the game's body walks in it (Player.moveTo in / out: only y changes, no
  // `respawn`, nothing for the server's speed check to flag), poses keep flowing, so the Host sees the team at the box and
  // the other teams in the same room see it walk (RemotePlayers' height filter: the street sees nobody underground). The
  // street world is hidden (world/hideWorld.ts) and its per-frame work paused (chunks, NPCs, sky / water, HUD / minimap).
  // Graphics inside are minimal (no shadows / post, pixel ratio 1). The cards (Enter / Tab, "Đổi lựa chọn kép") work inside.
  // The step completing (skip, or the Host's Duyệt) or a branch switch lights the exit ring at the far end; the next card is
  // HELD (RaceClient.release) until the body walks into it, back in front of the box. A reload inside: welcome.view puts it
  // back in the room (after a switch: ClueCard.leftRoom, ring lit); the step done meanwhile → the world, the next card pops.
  // A CHALLENGE card with `room: 'garderobe'` (the museum, garderobe/garderobeRoom.ts) is the same room flow under the box just
  // opened, but its ring is lit all the time: the team may walk out (roomFlow.leftKey: the unchanged card does not pull it
  // back) and F at the opened box goes back in (reenterBox); the next card is held only when the step completes INSIDE.
  const roomFlow = new RoomFlow();
  let roomBusy = false; // a fade / mount / unmount in flight: no exit check, no __READY__
  let roomChain: Promise<unknown> = Promise.resolve(); // room events run one after another (a switch right after the enter)
  let roomQueue = 0; // room events not finished yet (__READY__ / worldReady wait: the event's work starts a tick later)
  const queueRoom = (f: () => Promise<unknown> | unknown) => { roomQueue++; roomChain = roomChain.then(f).catch((err: unknown) => console.warn('room failed:', err)).finally(() => roomQueue--); };
  let demoHeld: RaceView | null = null; // DEV: the demo's held view (no RaceClient offline)
  let demoView: RaceView | null = null; // DEV: the demo's current view (the room's "server")
  let roomExit: { x: number; z: number; yaw: number } | null = null; // the feet on leaving (in front of the box)
  const hiddenForRoom = new Set<THREE.Object3D>();
  const keepInRoom = (o: THREE.Object3D) => o === room?.group || o === player?.model.root || !!remote?.owns(o);
  const keepInViewRoom = (o: THREE.Object3D) => o === vroom?.h.group || !!remote?.owns(o);
  const fadeEl = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'room-fade' }));
  const fadeTo = (on: boolean) => new Promise<void>((r) => (fadeEl.classList.toggle('on', on), setTimeout(r, roomCfg.fadeMs)));
  /** The room module of a kind (a dynamic import each: its own chunk). */
  const roomModule = (kind: RoomAt['kind']) =>
    kind === 'chocolate' ? import('./choco/chocoRoom.ts') : kind === 'garderobe' ? import('./garderobe/garderobeRoom.ts') : kind === 'hall' ? import('./hall/hallRoom.ts') : kind === 'cetiqlo' ? import('./cetiqlo/cetiqloRoom.ts') : import('./gallery/galleryRoom.ts');
  // Leg 3 CETIQLO (cetiqlo/cetiqloRoom.ts): the room's `cq.*` link = RaceClient's cq* hooks in the race (raceLink; RaceDeps.onCq feeds the
  // server's messages back), DEV offline `?roomDemo=cetiqlo` = cetiqloMock.ts (an in-page server + a bot body fed to RemotePlayers as ticks)
  let cqLink: CqLink | undefined;
  let cqMock: CqMock | undefined;
  const mountRoomFor = async (t: RoomTarget): Promise<RoomHandle> => {
    const mod = await roomModule(t.room.kind);
    const team = session?.team ?? { slot: Number(query.get('team')) || 1, name: playerSetup.teamName, colour: playerSetup.teamColour }; // offline: ?team=<slot>
    // under the branch box (the one being / just left: opened); a challenge room (GardeRobe): under the box just opened = the
    // last opened one (the step before); none known (a reload before the box came back) → under the feet
    const box = (isFreeRoom(t.room.kind) ? boxes.boxes.filter((b) => b.opened && !b.kind).at(-1) : boxes.boxes.find((b) => b.step === t.step && (t.branch ? b.branch === t.branch : b.opened && !!b.branch))) ?? { x: player!.position.x, z: player!.position.z, yaw: 0 };
    const frame = roomFrame(box, env.heightAt(box.x, box.z), mod.DOOR_Z);
    if (t.room.kind === 'cetiqlo' && import.meta.env.DEV && !session) { // the mock server + bot; its onAdvance = what a win brings (the next card)
      const { createCqMock, CQ_DEMO_STATES } = await import('./cetiqlo/cetiqloMock.ts');
      const st = (CQ_DEMO_STATES as readonly string[]).includes(query.get('roomState') ?? '') ? (query.get('roomState') as CqDemoState) : 'match';
      cqMock = createCqMock(team, st, (lx, ly, lz) => ({ ...toWorld(frame, lx, lz), y: frame.floorY + ly }));
      cqMock.onAdvance = () => demoRoomView(demoRoomViews('cetiqlo', 'done').then!);
      remote?.setTeams(cqMock.teams);
    }
    const r = await mod.mountRoom({
      renderer, q: query, scene, frame, world, camera, feet: () => ({ x: player!.position.x, z: player!.position.z }), frozen: modal, onClose: relock,
      team: { ...team, avatar: overrides.avatar },
      teams: [...(session?.welcome?.teams ?? []), ...(cqMock?.teams ?? [])].map(({ slot, name, colour }) => ({ slot, name, colour })),
      cq: cqMock?.link ?? cqLink,
      feetY: () => player!.position.y,
      moveTo: (x, z, yaw) => player!.moveTo(x, z, yaw),
      characterAsset: assets?.character,
      autostep: (m) => player!.controller.setAutostep(m),
      room: t.room,
      onPickup: () => {
        if (!roomFlow.pickedUp()) return;
        room?.setPickup?.(null);
        race ? race.release() : demoHeld && (raceHud?.setView(demoHeld), (demoHeld = null)); // the held card is the team's now
        raceHud?.openNew(); // and it opens at once (the stand-in had the same step: no new envelope by itself)
      },
      onSeat: (label) => (race ? race.answer(t.step, label) : demoSeat(label)),
      onResult: ({ done, skipped }) => (race && t.branch ? race.room(t.step, t.branch, done, skipped) : demoView && demoRoomView(demoRoomResult(demoView, done, skipped))),
    });
    roomFloor = frame.floorY;
    roomSent = { t, frame: { x: frame.x, z: frame.z, yaw: frame.yaw } };
    sendRoomAt(t, frame);
    roomExit = exitSpot(frame);
    const e = enterSpot(frame);
    if (player!.active) player!.moveTo(e.x, e.z, e.yaw);
    else spawnAt(e.x, e.z, e.yaw, e.y); // a reload inside: the body spawns at the door once the world is ready
    player!.camera.override = roomCfg.camera;
    const now = roomFlow.target ?? t; // a view may have come while the chunk loaded
    r.setProgress(now.room.done, now.room.skipped);
    if (roomFlow.exitReady) r.setExit(true);
    if (roomFlow.locked) r.setLocked(true);
    return r;
  };
  const leaveRoom = async () => {
    if (!room || roomBusy) return;
    roomBusy = true;
    await fadeTo(true);
    room.dispose();
    cqMock?.dispose();
    cqMock = undefined;
    roomSent = null;
    sendRoomAt(null);
    hideRoomDone();
    room = undefined;
    roomFloor = null;
    player!.camera.override = null;
    showWorld(hiddenForRoom);
    if (roomExit) player!.moveTo(roomExit.x, roomExit.z, roomExit.yaw);
    resize();
    roomFlow.left();
    await fadeTo(false);
    roomBusy = false;
    race?.release(); // the next card pops in front of the box
    if (demoHeld) raceHud?.setView(demoHeld), (demoHeld = null);
  };
  // Leg 3 watch mode: the Host / a spectator / a finished team following a team that stands in a room (its client reports the door,
  // `room` message): the room is built at that door and drawn, the street hidden, so the room's play can be watched.
  const viewRooms = new Map<number, RoomAt>();
  let vroom: { at: RoomAt; h: RoomHandle; floorY: number } | undefined;
  let vBusy = false;
  const sameRoom = (p: RoomAt | undefined, q: RoomAt | undefined) => !!p && !!q && p.kind === q.kind && p.x === q.x && p.z === q.z && p.yaw === q.yaw;
  let lastWatch: CqWatch | undefined; // the latest CETIQLO live view (Host / spectators), given to the room once it is drawn
  const syncViewRoom = async () => {
    if (vBusy || room) return;
    const slot = watching ? spectate?.slot ?? null : null;
    const at = slot === null ? undefined : viewRooms.get(slot);
    if (sameRoom(vroom?.at, at)) return;
    vBusy = true;
    try {
      if (vroom) {
        vroom.h.dispose();
        vroom = undefined;
        showWorld(hiddenForRoom);
      }
      if (at && slot !== null) {
        const mod = await roomModule(at.kind);
        const teams = (session?.welcome?.teams ?? []).map(({ slot, name, colour }) => ({ slot, name, colour }));
        const frame = roomFrame(at, env.heightAt(at.x, at.z), mod.DOOR_Z);
        const h = await mod.mountRoom({ renderer, q: query, scene, frame, camera, viewer: true, feet: () => ({ x: 1e6, z: 1e6 }), team: teams.find((t) => t.slot === slot), teams, room: { total: 0, penaltyMinutesEach: 0 }, characterAsset: assets?.character });
        vroom = { at, h, floorY: frame.floorY };
        if (lastWatch) h.watch?.(lastWatch);
      }
    } catch (err) {
      console.warn('view room failed:', err);
    } finally {
      vBusy = false;
    }
  };
  // DEV offline: ?spectate=1&peers=<slot>,0,0,0,walk,wave&viewRoom=<kind>,<doorX>,<doorZ>,<boxYawDeg>,<slot>: that stand-in stands in the room
  // at its entrance, so the watch mode's room view can be seen without a server (preset p11-watch-room)
  let demoRoomFloor: number | undefined;
  const vr = import.meta.env.DEV && !session && viewer ? query.get('viewRoom')?.split(',') : undefined;
  if (vr && vr.length === 5) {
    const [kind, x, z, yawDeg, slot] = vr;
    const at: RoomAt = { kind: kind as RoomAt['kind'], x: Number(x), z: Number(z), yaw: (Number(yawDeg) * Math.PI) / 180 };
    void (async () => {
      const mod = await roomModule(at.kind);
      const frame = roomFrame(at, env.heightAt(at.x, at.z), mod.DOOR_Z);
      const e = enterSpot(frame);
      const p = peers.find((q) => q.slot === Number(slot));
      if (p) Object.assign(p, { x: e.x, z: e.z, yaw: e.yaw });
      demoRoomFloor = frame.floorY;
      viewRooms.set(Number(slot), at);
    })();
  }
  let roomPingAt = 0; // the team's own client repeats where its room is every 15 s (the server keeps it in memory only)
  let autoAt = -Infinity; // autoCq: the last automatic F / card close
  const sendRoomAt = (t: RoomTarget | null, frame?: { x: number; z: number; yaw: number }) => {
    roomPingAt = performance.now();
    net?.send({ t: 'room', room: t && frame ? { kind: t.room.kind, x: frame.x, z: frame.z, yaw: frame.yaw - Math.PI } : null });
  };
  let roomSent: { t: RoomTarget; frame: { x: number; z: number; yaw: number } } | null = null;
  const roomEvent = (ev: RoomEvent, t: RoomTarget | null) =>
    queueRoom(async () => {
      if (ev === 'enter' && t) {
        roomBusy = true;
        await fadeTo(true);
        room?.dispose();
        room = await mountRoomFor(t);
        resize();
        await fadeTo(false);
        roomBusy = false;
      } else if (ev === 'exitReady') {
        room?.setExit(true);
        toast(isFreeRoom(t?.room.kind) ? ROOM_TEXT.exitDoor : ROOM_TEXT.exit);
        // Lựa chọn kép finished (not skipped): the big "Hoàn thành" screen, then the way out
        if (t && !isFreeRoom(t.room.kind) && !t.room.skipped) showRoomDone(t.room.kind === 'chocolate' ? 'phòng sô-cô-la' : 'phòng vẽ truyện tranh', 'Đi tới vòng sáng ở cuối phòng để ra khỏi phòng');
      }
      else if (ev === 'pickup' && roomFlow.pickup?.pickup && pickupHeld) room?.setPickup?.(roomFlow.pickup.pickup.prompt), raceHud?.setView(pickupView(pickupHeld, roomFlow.pickup.pickup)); // T2 done: the stand-in card, the next one waits for F at the stage
      else if (ev === 'switched') room?.setExit(true), room?.setLocked(true), toast(ROOM_TEXT.switched);
      else if (ev === 'resume') room?.setExit(false), room?.setLocked(false), hideRoomDone();
    });
  /** Every view before the HUD (RaceDeps.view): true = hold it. */
  let pickupHeld: RaceView | null = null; // the held view whose stand-in card shows (pickupView)
  const onRoomView = (v: RaceView | null): boolean => {
    const { event, hold } = roomFlow.onView(v);
    if (event === 'pickup') pickupHeld = v;
    if (event) roomEvent(event, roomFlow.target);
    else if (roomFlow.target) room?.setProgress(roomFlow.target.room.done, roomFlow.target.room.skipped);
    return hold;
  };
  /** The opened box in reach while the team stands outside the GardeRobe room it walked out of (its card still active): F goes back in. */
  const reenterBox = (x: number, z: number) => !room && !roomBusy && roomFlow.leftKey && isFreeRoom(roomOf(race ? race.view : demoView)?.room.kind) && boxes.boxes.some((b) => b.opened && !b.kind && Math.hypot(b.x - x, b.z - z) <= b.r);
  const demoSeat = (label: string) => toast(`(demo) đã chọn ghế ${label}`); // DEV offline: no server grades it
  /** DEV offline: a stand-in view through the same gate (held → released by leaveRoom). */
  const demoRoomView = (v: RaceView) => ((demoView = v), onRoomView(v) ? void (demoHeld = v) : raceHud?.setView(v));
  const race =
    session && player
      ? new RaceClient({
          hud: raceHud,
          view: onRoomView,
          send: (m) => net?.send(m),
          // D4: the pose first (the gate reset makes it go out now even if unchanged / within 200 ms), then the op
          op: (m) => {
            net?.flushPose(poseOf());
            net?.send(m);
          },
          pose: () => net?.flushPose(poseOf()), // D9: a countdown ended (the branch box may be due)
          serverNow: () => (net ? net.serverNow() : Date.now()),
          onCq: (m) => cqLink?.onMessage?.(m), // Leg 3 CETIQLO: the room's own messages (dropped while no room listens)
          finished: (fresh) => {
            if (over) return;
            over = true;
            if (fresh) player.controller.startAction('celebrate'), pitHost?.cheer();
            spectate?.hint(SP.hintX); // SPEC §17.40: "Phím X: xem các đội khác"
          },
        })
      : undefined;
  if (race) cqLink = raceLink(race, () => (net ? net.serverNow() : Date.now()));
  if (player) {
    // D23: F on foot asks the current box first; offline (DEV ?boxes=) it opens locally (manual tests).
    player.onInteract = () => {
      const [x, z] = [player.position.x, player.position.z];
      if (room) return room.interact(); // Leg 3: the own table's button / a vitrine close-up (never a box from under the ground)
      if (reenterBox(x, z)) return (roomFlow.reenter(), onRoomView(race ? race.view : demoView), true); // Leg 3: back into the GardeRobe room
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
        spectate?.setTeams(w.teams);
        if (remote) remote.renderRadius = w.presence.renderRadius;
        if (watching && player) net?.send({ t: 'watch', on: true }); // a reconnect: the socket's flag starts over
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
        if (m.t === 'cq.watch') return void ((lastWatch = m), vroom?.h.watch?.(m)); // Host / spectators: the CETIQLO match, live
        if (m.t === 'room') return void (m.room ? viewRooms.set(m.slot, m.room) : viewRooms.delete(m.slot)); // Host / spectators: a team entered / left a room
        if (race?.message(m)) return; // race / book / zone (Phase 7) → RaceHud
        if (m.t === 'team') remote?.setOnline(m.slot, m.online, m.avatar), spectate?.team(m.slot, m.online, m.racing);
        else if (m.t === 'gesture') remote?.gesture(m.slot, m.g);
        else if (m.t === 'notice') {
          if (m.code === 'penalized') toast(penalizedText(m.score, m.of)); // SPEC §17.31
          else if (m.code === 'autoCorrect' || m.code === 'autoPenalized' || m.code === 'scoreUpdated') toast(scoredText(m.code, m.score, m.of)); // Leg 3: the number every time
          else notice(m.code);
          if (m.code === 'approved' || m.code === 'penalized') reviewSound(m.code === 'approved'); // SPEC §8.9 (6)
        }
        else if (m.t === 'box') boxes.apply(m);
        else bikeLink?.message(m); // 'bikes' / 'bike' (claim result)
      },
      status: (connected, reason) => {
        netPanel.textContent = connected ? '' : netDownText(reason ?? 'closed');
        netPanel.hidden = connected;
      },
    }, { avatar: overrides.avatar }); // Leg 2: the body the other teams see ("Nhân vật"), once per connection
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
  const npcZones = () => [...(overrides.npcZones ?? []), ...npcCfg.landmarkZones.map(([x, z, r]) => ({ x, z, r })), ...boxes.boxes.map((b) => ({ x: b.x, z: b.z, r: b.r }))];
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
    if (player && !watching) return player.npcAnchor(anchor, viewYaw);
    return Object.assign(anchor, { x: camera.position.x, z: camera.position.z, viewYaw, body: false, vx: 0, vz: 0, nose: null, waving: false });
  };
  // Phase 5 HUD (docs/plans/phase5.md §5): player mode only (the spectator has no body). The full map, the GPS and the
  // street names need the road graph: created once it is in.
  document.body.classList.add('hud-off'); // until the world is ready (the loop toggles it)
  const hud = player && new HUD();
  const minimap = player && new Minimap(tiles);
  setArrowColour(session?.team?.colour); // the map arrow wears the team's colour (white is hard to see on the pale streets)
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
  const uiOpen = () => menu.isOpen || !!fullMap?.isOpen || !!raceHud?.open || !!room?.overlayOpen(); // the body stops, keys go to the menu / map / Sổ mật thư / a room's mini-game
  // SPEC §17.40: while the watch camera follows a team the pointer stays free (the bar is clickable): no lock, no "Nhấp chuột"
  const modal = () => uiOpen() || !!spectate?.following;
  input.canLock = () => !spectate?.following;
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
    // Leg 3 DEV offline: ?roomDemo=chocolate|comic|garderobe|hall&team=<slot>&roomState=in|pending|done|skipped|switch|left (rooms/roomDemo.ts,
    // p11-room-*): straight into the room with stand-in views; `then` once the room is up; `left` walks out by itself
    const kind = query.get('roomDemo');
    if (import.meta.env.DEV && !session && raceHud && (kind === 'chocolate' || kind === 'comic' || kind === 'garderobe' || kind === 'hall' || kind === 'cetiqlo')) {
      const state = (DEMO_ROOM_STATES as readonly string[]).includes(query.get('roomState') ?? '') ? (query.get('roomState') as DemoRoomState) : 'in'; // cetiqlo: its states are the mock's (CQ_DEMO_STATES)
      const d = demoRoomViews(kind, state);
      demoRoomView(d.first);
      if (d.then) queueRoom(() => demoRoomView(d.then!));
      if (state === 'left' || state === 'switch-left') queueRoom(() => new Promise((r) => setTimeout(r, 100)).then(leaveRoom)); // after the exitReady / switched event queued by `then`
    }
  };

  renderer.domElement.addEventListener('click', unlockAudio); // browsers only allow audio after a user gesture
  $('help-player').hidden = !player;
  $('help-fly').hidden = !!player;
  if (import.meta.env.DEV) Object.assign(window, { __GAME__: { fly, player, graph, npcs: () => npcs, gps: () => gps, minimap, fullMap: () => fullMap, net, remote, boxes, raceHud, menu, room: () => room, cqMock: () => cqMock, cq: () => room?.cqDebug?.(), race, roomFlow, renderer, scene, camera } }); // for scratch test scripts, scripts/hud-check.ts
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
      if (!fullMap?.isOpen && !raceHud?.open && !spectate?.following && !room?.overlayOpen()) menu.open(); // following / a room's mini-game: they took the pointer, no menu
    }
    help.hidden = locked || modal();
  };
  // Phase 8 B1 (critic): links, images, buttons and the answer box of a card / the Sổ take the mouse, so the pointer is free
  // while one is open (no menu: above), and locked again on close, right inside the key / click handler that closed it
  // (Firefox grants the lock only there: Tab / Esc / Space close in RaceHud's keydown, a backdrop click below).
  // Not while the map / menu stays open (a card that popped up over them, e.g. the Host's approval: review R-2).
  const relock = () => void (!modal() && input.lock());
  if (raceHud) {
    raceHud.onOpenChange = (open) => {
      if (open) return void document.exitPointerLock();
      cardClosed = true;
      relock();
      help.hidden = input.locked || modal(); // a refused lock (Firefox: Esc is no user gesture) shows "Nhấp chuột để chơi" again (R-3); a granted one hides it
    };
    // the dimmed backdrop lets clicks through to the canvas, which locks the pointer (Input): close the card first
    renderer.domElement.addEventListener('click', () => raceHud.open && raceHud.toggleBook());
  }
  // Firefox (and Safari) grant pointer lock only inside an input event handler, not in the frame loop that handles M /
  // Esc below: a key that will close the map or the menu locks right here (the loop closes it next frame; its own
  // lock() is then a no-op, or a rejected request that Input swallows). Chrome allows both.
  // A card / the Sổ closes inside RaceHud's own key handler (Tab / Esc / Space) and locks there (onOpenChange); this key was
  // its (cardClosed), and nothing locks while it is still open over the map / menu.
  addEventListener('keydown', (e) => {
    if (e.repeat || input.locked || cardClosed || raceHud?.open || performance.now() - unlockedAt <= 300) return;
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

  // Runtime downgrade (graphics8c.quality.autoDowngrade): high quality chosen by the user / GPU, not by ?quality= (tests)
  let fpsWatch = graphics().quality === 'high' && !graphics().forced ? new FpsWatch() : undefined;
  let lastFrame = performance.now();
  const waitArg = Number(query.get('wait') ?? NaN);
  const wait = Number.isFinite(waitArg) ? waitArg : playerSetup.readyWait; // s simulated before __READY__ (player mode)
  const euler = new THREE.Euler();
  let worldReady = false; // first view loaded: player spawns, chunk attach gets budgeted
  let ready = false; // window.__READY__
  let npcFrames = 0; // frames through npcs.update
  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      // Before the player (docs/plans/phase4b.md §5.2): cars → pedestrians → car colliders → shove / crash the body. Leg 3: inside a room the NPCs pause.
      if (npcs?.started && !room && !raceHud?.gameOpen) npcs.fixedUpdate(dt, npcAnchor(), player?.active && !flying && !watching ? player.controller : undefined);
      player?.fixedUpdate(dt, flying || watching); // the body stands frozen while its team watches the others (§17.40)
      world.step();
    },
    update: (dt) => {
      input.poll();
      if (input.wasPressed('debug')) debug.toggle();
      // V: player ⇄ free-fly (debug only, SPEC §17.2 "camera bay tự do"); the body stays frozen where it was. Offline only (canFly).
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
        if (fullMap.isOpen) fullMap.close(), relock(); // a card on top keeps the pointer
        else if (!flying && !watching && !raceHud?.open) {
          // not from the free-fly / watch camera: the map is the body's (review m14); not under the Sổ mật thư / card
          menu.close();
          fullMap.open(frame);
          if (fullMap.isOpen) document.exitPointerLock();
        }
      }
      if (raceHud && input.wasPressed('clueBook') && !menu.isOpen && !fullMap?.isOpen && !cardClosed) raceHud.toggleBook(); // Tab: Sổ mật thư (SPEC §8.11); the Tab that closed a card (RaceHud) opens nothing
      // Phase 8 (§17.14): Enter with nothing open → the current card again (answer history, input box)
      if (raceHud && input.wasPressed('clueCard') && !uiOpen() && !flying && !cardClosed) raceHud.openCurrent(); // while watching too: the finish card (§17.39)
      if (input.wasPressed('menu') && performance.now() - unlockedAt > 300 && !cardClosed) {
        if (fullMap?.isOpen) fullMap.close(), input.lock();
        else if (menu.isOpen) menu.close(), relock(); // not while the watch camera follows a team (the bar keeps the pointer)
        else if (!input.locked) menu.open();
        help.hidden = input.locked || modal();
      }
      // SPEC §17.40: X (a finished team) = watch the other teams ⇄ control the body again
      if (player && spectate && net && over && input.wasPressed('watch') && !uiOpen()) {
        watching = !watching;
        spectate.show(watching);
        spectate.hint(watching ? null : SP.hintX);
        net.send({ t: 'watch', on: watching });
        if (!watching) relock();
      }
      if (watching) help.hidden = input.locked || modal(); // following: no "Nhấp chuột để chơi" (the bar has the pointer)
      if (worldReady) demoClock += dt;
      const bodyCam = !!player && !flying && !watching; // the camera is the body's (else the Spectate's / free fly)
      if (watching && spectate?.update(dt, input)) {
        /* the camera follows a team */
      } else if (flying || watching) fly.update(dt, input);
      if (player && player.simTime >= respawnAt) (respawnAt = Infinity), menu.actions.respawn?.();
      player?.update(dt, bodyCam ? input : null, loop.alpha, modal() || cardClosed || !!room?.frozen?.()); // the Space that closed a card is no jump; Leg 3 CETIQLO: locked after the checkout (the intent halts, physics / the sim clock go on)
      // Leg 3: inside a room the game's body walks on the room's colliders; the room draws its prompt / ring and watches the exit
      // (after the Player placed the camera: the GardeRobe close-up glides it from there)
      if (room) {
        room.update(dt);
        if (!roomBusy && room.exitHit()) void leaveRoom();
      }
      if (room && roomFloor != null && bodyCam) camera.position.y = Math.min(camera.position.y, roomFloor + room.ceiling - 0.3); // no ceiling collider: the camera stays under it
      if (autoCq && player?.active && performance.now() - autoAt > 700) { // testing: F at the box once it is in reach, the card closed once the room is up
        autoAt = performance.now();
        if (!room && !roomBusy && !roomFlow.key && boxInReach(boxes.boxes, player.position.x, player.position.z)) player.onInteract?.();
        else if (room && raceHud?.open) raceHud.toggleBook();
      }
      if (player?.active && !room) bikeLink?.frame(dt, player.controller);
      if (net && player?.active && bodyCam) net.sendPose(poseOf()); // 5 Hz, only on change (NetClient decides); a finished team too (§17.39), not while watching; in a room too (the Host sees the team at the box, the room's teams see each other)
      if ((peers.length || cqMock) && (player ? player.active : worldReady) && localMs() >= nextFakeTick) {
        remote?.apply(nextFakeTick, [...fakeTick(peers, nextFakeTick, (x, z) => demoRoomFloor ?? groundY(x, z) ?? env.heightAt(x, z)), ...(cqMock?.tick(nextFakeTick) ?? [])]); // DEV: a server tick, simulated clock (+ the CETIQLO mock's bot)
        nextFakeTick += 1000 / NET.tickHz;
      }
      remote?.update(dt, net ? net.serverNow() : localMs(), camera.position, bodyCam ? underground(player.position, env.heightAt) : undefined, env.heightAt); // Leg 3: a team in a room is no ghost on the street and the other way round
      if (room && roomSent && net && performance.now() - roomPingAt > 15_000) sendRoomAt(roomSent.t, roomSent.frame);
      if (spectate && worldReady) void syncViewRoom();
      if (vroom) {
        vroom.h.update(dt);
        if (!flying) camera.position.y = Math.min(camera.position.y, vroom.floorY + vroom.h.ceiling - 0.3); // no ceiling collider: the camera stays under it
      }
      if (lookOn === !!(room || vroom)) setLookActive((lookOn = !(room || vroom))); // plain colours inside a room, the vintage grade on the street
      if (room || vroom) hideWorld(scene.children, vroom ? keepInViewRoom : keepInRoom, hiddenForRoom); // every frame: streamed chunks / NPCs added meanwhile too
      else {
        boxes.update(camera.position);
        if (pitHost && player) pitHost.update(dt, boxes.mat, player.position);
      }
      // No HUD while loading, flying (V) or watching the other teams: hud.css hides every .hud-box / .hud-hand (clock, minimap, toasts).
      document.body.classList.toggle('hud-off', !worldReady || flying || watching);
      if (player && hud && minimap) {
        const s = player.controller.state;
        camera.getWorldDirection(view);
        const [x, z] = [player.position.x, player.position.z];
        const riding = !!player.controller.riding;
        // Leg 3: the race HUD (countdowns, cards) runs inside a room too; the box prompt / bike prompt do not
        const inZone = !player.active ? false : (race ? race.frame(boxes.boxes, x, z, riding, performance.now()).inZone && !room : !room && !riding && !!boxInReach(boxes.boxes, x, z)) || (!riding && !!reenterBox(x, z));
        const bike = player.active && bodyCam && !modal() && !race?.view?.result && !room ? player.bikes.prompt(player.controller) : null;
        raceHud?.update({ simTime: Math.max(0, player.simTime), serverNow: net ? net.serverNow() : 0, inZone, bike });
        if (!room) { // Leg 3: the street HUD / minimap / GPS / full map wait while the body is in a room
          Object.assign(frame, {
            x, z, heading: Math.atan2(-view.x, -view.z), bodyYaw: s.yaw, speed: Math.hypot(s.velocity.x, s.velocity.z),
            riding, swimming: s.moveMode === 'swim', time: Math.max(0, player.simTime),
            street: streets?.at(x, z), district: districtAt(water?.districts, x, z),
            penaltyMinutes: race?.view?.penaltyMinutes,
          } satisfies HudFrame);
          gps?.update(x, z, frame.riding ? 'bike' : 'walk', dt);
          hud.update(frame, dt);
          minimap.update(frame, gps ?? NO_GPS, dt);
          if (fullMap?.isOpen) fullMap.update(frame, gps ?? NO_GPS);
        }
      }
      if (npcs?.started && !room && !raceHud?.gameOpen) {
        npcs.update(dt, loop.alpha, camera);
        npcFrames++;
        npcs.zoneRings.visible = debug.visible;
      }
      input.endFrame();
      cardClosed = false;
      if ((room || vroom || raceHud?.gameOpen) && worldReady) return; // Leg 3: the world's streaming / sky / water wait (the room has the camera; a mini-game covers the screen); a reload inside a room still streams until the world is ready
      const p = bodyCam ? player.position : camera.position; // streaming + colliders follow the body (watching / flying: the camera)
      sky.update();
      waterObj?.update(dt);
      chunks.update(p.x, p.y, p.z, worldReady ? chunkCfg.attachBudgetMs : Infinity); // the first view loads unbudgeted
      edge.hidden = edgeDistance(p.x, p.z) >= bounds.warnDistance;
    },
    render: () => {
      if (raceHud?.gameOpen) return void (lastFrame = performance.now()); // the mini-game's opaque iframe covers the world: no GPU work behind it (net / timers / HUD / card run in update); FpsWatch sees no gap
      if (room || vroom) renderer.render(scene, camera), room?.afterRender?.(); // Leg 3: plain render inside a room (no post / SMAA / bloom); CETIQLO: + the mannequin PiP
      else if (post) post.render();
      else {
        if (!renderer.info.autoReset) renderer.info.reset(); // post.ts counts its passes by hand
        renderer.render(scene, camera);
      }
      const now = performance.now();
      if (fpsWatch && worldReady && fpsWatch.frame((now - lastFrame) / 1000)) {
        // a weak GPU behind a "high" choice: no post-processing / image-based light for this session (the choice stays stored)
        post?.dispose();
        post = null;
        const mats = new Set<THREE.Material>();
        scene.traverse((o) => void (o instanceof THREE.Mesh && [o.material].flat().forEach((m: THREE.Material) => mats.add(m))));
        sky.lowLight(mats);
        toast('Đã tự giảm chất lượng đồ họa để chạy mượt');
        fpsWatch = undefined;
      }
      lastFrame = now;
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
      Object.assign(window, { __STATS__: { calls, triangles, frameMs: +loop.workMs.toFixed(2), chunks: cs.loaded, colliders, geometries: renderer.info.memory.geometries, ...npcStats } });
      // Signal for scripts/screenshot.ts: every chunk around the camera attached and a few frames drawn.
      if (!worldReady) loading.textContent = cs.pending || welcomed ? `Đang tải bản đồ… còn ${cs.pending} ô` : 'Đang kết nối máy chủ…';
      if (!worldReady && loop.frames >= 3 && ((chunks.idle && models.idle) || autoCq) && graphLoaded && welcomed && !roomQueue) { // Leg 3: a reload inside a room: its colliders first; autoCq: the terrain collider is enough to stand on
        worldReady = true;
        loading.hidden = true;
        player?.activate(); // the chunk colliders around the spawn exist now
        applyUrlHooks();
      }
      if (worldReady && npcs && !npcs.started) {
        npcs.start(npcAnchor()); // fill + warm-up (npcRender.warmUp s)
        npcReady = true;
      }
      // NPCs: ≥ 2 frames through npcs.update (drawn, and in __STATS__ above) — a viewer waits only for an explicit ?wait= (p9-watch).
      if (!ready && worldReady && npcReady && (!npcs || npcFrames >= 2) && !roomQueue && !roomBusy && (!room || room.settled()) && (player ? player.simTime >= wait : demoClock >= (Number.isFinite(waitArg) ? waitArg : 0))) {
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
