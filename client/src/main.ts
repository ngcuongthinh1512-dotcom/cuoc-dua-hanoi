import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clickSound, popSound, reviewSound, unlockAudio } from './audio/sfx.ts';
import { type CardStatus, type LouvreView, NET, type PoseSample } from '@race/shared/protocol';
import { bounds, chunks as chunkCfg, flyCamera, keys, louvreRoom as roomCfg, movement, npc as npcCfg, physics, playerSetup, netClient, remote as remoteCfg, render as R, ui } from './config.ts';
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
import { autoExitLeft, demoLouvre, LouvreRoom, pickChange, preloadArt, ROOM_TEXT, roomCardOf, roomPrompt } from './race/LouvreRoom.ts';
import { PitHost } from './race/PitStop.ts';
import { boxInReach, RaceClient } from './race/RaceClient.ts';
import { RaceHud } from './race/ui/RaceHud.ts';
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
import { lockWrongText, notice, penalizedText, toast } from './ui/Toasts.ts';
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
import { carveRiver, createTerrainCollider, createTerrainMaterials, flattenPads, riverLevel } from './world/Terrain.ts';
import { createWater } from './world/Water.ts';
import { createPost } from './world/post.ts';
import { initTimeOfDay } from './world/night.ts';
import { FpsWatch, graphics } from './world/graphics.ts';
import { hideWorld, showWorld } from './world/hideWorld.ts';

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

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(R.fov, 1, R.near, R.far);
  let post = createPost(renderer, scene, camera); // Phase 8C T1: null = plain renderer.render
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, R.maxPixelRatio));
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
  const env = { heightAt: (x: number, z: number) => heightAt(grid, x, z), waterLevel: water ? riverLevel(grid, water) : null, water };
  const overrides = parseOverrides(query, !!session);
  // Phase 8B (docs/plans/phase8b.md §F): the Louvre room under the box. Critic C2: only the Player gets its OWN env (the
  // room floor, no Seine while inside); `env` stays the grid for the NPCs, the boxes, the overlays.
  const room = camOk || viewer ? undefined : new LouvreRoom(scene, world, env.heightAt);
  const playerEnv = {
    ...env,
    heightAt: (x: number, z: number) => (room?.active ? room.floorY : env.heightAt(x, z)),
    get waterLevel() {
      return room?.active ? null : env.waterLevel;
    },
  };
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
  // DEV ?louvre=1 (offline, p8b-room*): the room at the spawn with a stand-in card (?card=louvre-locked: penalised),
  // ?roomAt=view|button|lock; F picks / unpicks locally.
  let demo: { step: string; status: CardStatus; lv: LouvreView } | undefined;
  const nums = (k: string) => query.get(k)?.split(',').map(Number); // DEV ?artGlb=2,7&artPhoto=8 (p8b-real-*: the real files)
  if (import.meta.env.DEV && !session && player && room && query.get('louvre') === '1') {
    demo = { step: 'T3', status: query.get('card') === 'louvre-locked' ? 'locked' : 'active', lv: demoLouvre(player.position.x, player.position.z, 0, undefined, nums('artGlb') && { glb: nums('artGlb')!, photo: nums('artPhoto') ?? [] }) };
    room.build(demo.step, demo.lv);
    room.enter();
    player.bikesPlaced = true; // no dev bikes in the room
    const at = room.demoSpot(query.get('roomAt'), demo.lv.picks)!;
    spawnAt(at.x, at.z, at.yaw);
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
  const remote = assets && (session || peers.length) ? new RemotePlayers(scene, assets.character, assets.bike, remoteCfg.renderRadius) : undefined;
  if (peers.length) remote?.setTeams(fakeTeams(peers));
  let nextFakeTick = 0; // ms of the local clock below
  let demoClock = 0; // s since the world was ready, a viewer's clock (no Player.simTime): DEV fake ticks, ?wait=
  const localMs = () => (player ? player.simTime : demoClock) * 1000;
  // SPEC §17.40: the watch mode (spectate/Spectate.ts) for the Host / a spectator from the start, for a team once it finished
  // (X toggles it). `watching` = the camera is the Spectate's (a followed body, or free fly); the body then stands still,
  // sends no pose, and the server is told (`watch`) so the ticks carry every team.
  const spectate = remote && (viewer || session) ? new Spectate({ fly, poseOf: (slot) => remote.poseOf(slot), heightAt: env.heightAt, onFree: () => input.lock(), team: !!player }) : undefined;
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
          credits: () => race?.credits(), // Phase 8B: "Ghi nguồn" after the finish (Credits.ts asks through RaceHud)
          // SPEC §17.33: the louvre card's "Vào phòng": like F at the box (within enterReach), without reopening the card
          enterRoom: () => {
            const rc = roomCard();
            if (rc && room && !room.active && nearBox(rc)) enterRoom(rc.step, rc.lv, false);
          },
          ...(session && { resolveMedia: (name: string) => fetchMedia(session, name) }), // none offline: "Hình chỉ tải được trong cuộc đua"
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
          finished: (fresh) => {
            if (over) return;
            over = true;
            if (fresh) player.controller.startAction('celebrate'), pitHost?.cheer();
            spectate?.hint(SP.hintX); // SPEC §17.40: "Phím X: xem các đội khác"
          },
        })
      : undefined;
  /** Phase 8B: the current card's Louvre room (the stand-in offline), null when the card has none; its status is the live
   *  one (a wrong lock's countdown that ran out unlocks the lock button without a new card: fix F2 (1)). */
  const roomCard = (): { step: string; status: CardStatus; lv: LouvreView } | null => demo ?? roomCardOf(race?.view?.card, net ? net.serverNow() : Date.now());
  const roomTarget = () => {
    camera.getWorldDirection(view);
    return room!.nearest(player!.position.x, player!.position.z, view.x, view.z);
  };
  /** The body stands within louvreRoom.enterReach of the card's box (F / the card's "Vào phòng" enter from here). */
  const nearBox = (rc: { lv: LouvreView }) => Math.hypot(player!.position.x - rc.lv.room.x, player!.position.z - rc.lv.room.z) <= roomCfg.enterReach;
  /** In / out only change y (critic S5): Player.moveTo sends no `respawn`. The card opens on entering (F); the card's own
   *  "Vào phòng" button closes it instead (`openCard` false). */
  const enterRoom = (step: string, lv: LouvreView, openCard = true) => {
    room!.build(step, lv);
    const e = room!.enter()!;
    player!.moveTo(e.x, e.z, e.yaw);
    if (openCard) raceHud?.openCurrent();
  };
  // SPEC §17.33: no door. The step finishing while inside (a right lock, a Host "Cho qua") starts the automatic exit
  // autoExitSeconds later; a lock the team sent itself gets "CHÍNH XÁC" first. The race over for the team → out at once.
  let roomDoneAt: number | null = null; // ms (performance clock) the step finished while inside
  let lockSent = false; // our lock went out and has no verdict yet (lockWrong clears it)
  const leaveRoom = () => {
    roomDoneAt = null;
    const e = room!.leave();
    if (e) player!.moveTo(e.x, e.z, e.yaw);
    raceHud?.openCurrent(); // the next card (held while inside) / the finish card
  };
  /** F (docs/plans/phase8b.md §F): outside, at the box of a louvre card → in (gesture); inside: button / lock, no
   *  gesture ('quiet': the other teams in the room must not see what was pressed); false = not the room's F. */
  const roomInteract = (): boolean | 'quiet' => {
    if (!room) return false;
    const rc = roomCard();
    if (!room.active) {
      if (!rc || !nearBox(rc)) return false;
      return enterRoom(rc.step, rc.lv), true;
    }
    const t = roomTarget();
    if (!t || !rc || rc.step !== room.step) return 'quiet'; // the step is over: the automatic exit is running
    const now = performance.now();
    if (t.kind === 'button') {
      const on = !rc.lv.picks.includes(t.id);
      if (on && rc.lv.maxPicks !== null && rc.lv.picks.length >= rc.lv.maxPicks) return notice('pickLimit'), 'quiet'; // §17.19 (c): not sent
      // online the click plays when the server took it (the new card's picks, `message` below); offline at once
      if (!race && demo) (demo.lv.picks = on ? [...demo.lv.picks, t.id] : demo.lv.picks.filter((p) => p !== t.id)), clickSound(on);
      else race?.pick(rc.step, t.id, on, now);
    } else if (!rc.lv.picks.length) toast('Chưa chọn tác phẩm nào'); // N4: an empty lock is stopped here
    else if (rc.status === 'locked') notice('answerLocked');
    else if (race?.lock(rc.step, now)) lockSent = true;
    return 'quiet';
  };
  if (player) {
    // D23: F on foot asks the current box first; offline (DEV ?boxes=) it opens locally (manual tests). Phase 8B: then the room.
    player.onInteract = () => {
      const [x, z] = [player.position.x, player.position.z];
      if (!room?.active && race?.interact(boxes.boxes, x, z, performance.now())) return true; // no box opened from under the ground
      const r = roomInteract();
      if (r !== false || race) return r;
      const b = !session && boxInReach(boxes.boxes, x, z);
      return !!b && (boxes.apply({ t: 'box', op: 'reveal', box: { ...b, opened: true } }), true);
    };
  }
  let mySlot = -1; // welcome.team.slot: the feed pops only for the other teams' lines
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
        // Phase 8B: an F5 in the Louvre room (feet underground, the card still louvre) → the room first, then the spawn on
        // its floor; the step already done (no louvre card) → no room: the spawn ray finds the court (RACE_RULES §12).
        const lc = w.view?.card;
        if (!welcomed && w.pose && room && lc?.task?.louvre && underground(w.pose, env.heightAt)) room.build(lc.step, lc.task.louvre), room.enter();
        mySlot = w.team?.slot ?? -1;
        if (!welcomed && w.pose) spawnAt(w.pose.x, w.pose.z, w.pose.yaw, w.pose.y);
        else if (!welcomed && w.start) spawnAt(w.start.x, w.start.z, w.start.yaw);
        welcomed = true;
        bikeLink?.welcome(w); // w.bikes; w.pose.bikeId + mode 'bike' → mount again (SPEC §8.10)
        race?.welcome(w, player?.simTime ?? 0);
      },
      tick: (serverMs, entries) => remote?.apply(serverMs, entries),
      message: (m) => {
        if (m.t === 'feed' && m.slot !== mySlot) popSound(); // Phase 8B: another team's public line
        const before = room?.active ? roomCard() : null;
        if (race?.message(m)) {
          const after = before && roomCard();
          const lit = after?.step === before?.step ? pickChange(before?.lv.picks, after?.lv.picks) : null;
          if (lit !== null) clickSound(lit); // fix F2 (7): only a pick the server took clicks
          return;
        } // race / book / zone (Phase 7); feed / credits (Phase 8B) → RaceHud
        if (m.t === 'team') remote?.setOnline(m.slot, m.online), spectate?.team(m.slot, m.online, m.racing);
        else if (m.t === 'gesture') remote?.gesture(m.slot, m.g);
        else if (m.t === 'notice') {
          // Phase 8B: the wrong lock's minutes from the card (0.1 in a test leg: never "3")
          if (m.code === 'lockWrong') (lockSent = false), toast(lockWrongText(race?.view?.card?.retryPenaltyMinutes));
          else if (m.code === 'penalized') toast(penalizedText(m.score, m.of)); // SPEC §17.31
          else notice(m.code);
          if (m.code === 'approved' || m.code === 'penalized') reviewSound(m.code === 'approved'); // SPEC §8.9 (6)
          if (m.code === 'lockWrong' || (m.code === 'clueNew' && room?.active)) reviewSound(m.code === 'clueNew'); // Phase 8B: the lock's verdict
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
  const uiOpen = () => menu.isOpen || !!fullMap?.isOpen || !!raceHud?.open; // the body stops, keys go to the menu / map / Sổ mật thư
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
  };

  renderer.domElement.addEventListener('click', unlockAudio); // browsers only allow audio after a user gesture
  $('help-player').hidden = !player;
  $('help-fly').hidden = !!player;
  if (import.meta.env.DEV) Object.assign(window, { __GAME__: { fly, player, graph, npcs: () => npcs, gps: () => gps, minimap, fullMap: () => fullMap, net, remote, boxes, raceHud, menu, room } }); // for scratch test scripts, scripts/hud-check.ts
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
      if (!fullMap?.isOpen && !raceHud?.open && !spectate?.following) menu.open(); // following: the bar took the pointer, no menu
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
  // Phase 8B (§17.20): in a race "Ghi nguồn" is gated by RaceHud.setView and asks through actions.credits; offline the
  // static credits.json as before.
  initCredits();
  let preloaded: string | null = null; // the louvre step whose pictures are loading
  const edge = $('edge');
  const loading = $('loading');

  // Runtime downgrade (graphics8c.quality.autoDowngrade): high quality chosen by the user / GPU, not by ?quality= (tests)
  let fpsWatch = graphics().quality === 'high' && !graphics().forced ? new FpsWatch() : undefined;
  let lastFrame = performance.now();
  const hiddenForRoom = new Set<THREE.Object3D>();
  const keepInRoom = (o: THREE.Object3D) => (o as THREE.Light).isLight === true || o === room?.root || o === player?.model.root || !!remote?.owns(o);
  const waitArg = Number(query.get('wait') ?? NaN);
  const wait = Number.isFinite(waitArg) ? waitArg : playerSetup.readyWait; // s simulated before __READY__ (player mode)
  const euler = new THREE.Euler();
  let worldReady = false; // first view loaded: player spawns, chunk attach gets budgeted
  let ready = false; // window.__READY__
  let npcFrames = 0; // frames through npcs.update
  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      // Before the player (docs/plans/phase4b.md §5.2): cars → pedestrians → car colliders → shove / crash the body.
      if (npcs?.started) npcs.fixedUpdate(dt, npcAnchor(), player?.active && !flying && !watching ? player.controller : undefined);
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
      if (player) player.camera.override = room?.active ? roomCfg.camera : null; // fix F2 (5): over the shoulder, higher, in the room
      player?.update(dt, bodyCam ? input : null, loop.alpha, modal() || cardClosed); // the Space that closed a card is no jump
      if (room?.active && bodyCam) camera.position.y = Math.min(camera.position.y, room.floorY + roomCfg.size.height - 0.3); // no ceiling collider (C2): the camera stays under it
      if (player?.active) bikeLink?.frame(dt, player.controller);
      if (net && player?.active && bodyCam) net.sendPose(poseOf()); // 5 Hz, only on change (NetClient decides); a finished team too (§17.39), not while watching
      if (peers.length && (player ? player.active : worldReady) && localMs() >= nextFakeTick) {
        remote?.apply(nextFakeTick, fakeTick(peers, nextFakeTick, (x, z) => groundY(x, z) ?? env.heightAt(x, z))); // DEV: a server tick, simulated clock
        nextFakeTick += 1000 / NET.tickHz;
      }
      remote?.update(dt, net ? net.serverNow() : localMs(), camera.position, bodyCam ? underground(player.position, env.heightAt) : undefined, env.heightAt);
      // Phase 8B: the room's lights from THIS team's card only, its prompt, the pictures preloaded once a louvre card is there
      const rc = room && roomCard();
      if (rc && preloaded !== rc.step) (preloaded = rc.step), preloadArt(rc.lv.artworks);
      let prompt: string | null = null;
      let near = false; // within enterReach of the box: the card's "Vào phòng" button is live (SPEC §17.33)
      if (room && player?.active && bodyCam && !player.controller.riding) {
        const done = rc?.step !== room.step;
        if (room.active) {
          room.setPicks(done ? null : rc!.lv.picks);
          if (done && roomDoneAt == null) {
            roomDoneAt = performance.now();
            if (lockSent) raceHud?.announce(ROOM_TEXT.correct); // our lock was right (a Host "Cho qua" says nothing)
            lockSent = false;
          }
          const left = over ? 0 : autoExitLeft(roomDoneAt, performance.now()); // finished / BỊ LOẠI / the Host ended the race → out at once
          if (left === 0) leaveRoom();
          else if (!modal()) prompt = left != null ? ROOM_TEXT.autoExit(left) : roomPrompt(roomTarget(), rc?.lv ?? null, { done, locked: rc?.status === 'locked' });
        } else if (rc) {
          near = nearBox(rc);
          if (!modal()) prompt = near ? 'Bấm F để vào phòng Louvre' : Math.hypot(player.position.x - rc.lv.room.x, player.position.z - rc.lv.room.z) <= rc.lv.room.r ? 'Phòng Louvre: tới sát hòm mật thư rồi bấm F để vào' : null;
        }
      }
      raceHud?.setRoom(!!room?.active, near); // the louvre card says "Đang trong phòng" / its "Vào phòng" button
      boxes.update(camera.position);
      if (pitHost && player) pitHost.update(dt, boxes.mat, player.position);
      // No HUD while loading, flying (V) or watching the other teams: hud.css hides every .hud-box / .hud-hand (clock, minimap, toasts).
      document.body.classList.toggle('hud-off', !worldReady || flying || watching);
      if (player && hud && minimap) {
        const s = player.controller.state;
        camera.getWorldDirection(view);
        const [x, z] = [player.position.x, player.position.z];
        Object.assign(frame, {
          x, z, heading: Math.atan2(-view.x, -view.z), bodyYaw: s.yaw, speed: Math.hypot(s.velocity.x, s.velocity.z),
          riding: !!player.controller.riding, swimming: s.moveMode === 'swim', time: Math.max(0, player.simTime),
          street: room?.active ? 'Phòng Louvre' : streets?.at(x, z), district: room?.active ? 0 : districtAt(water?.districts, x, z), // fix F2 (7): not the court's street underground
          penaltyMinutes: race?.view?.penaltyMinutes,
        } satisfies HudFrame);
        const riding = !!player.controller.riding;
        // (race.frame runs in the Louvre room too: the hint marks' `view`; no box prompt from under the ground)
        const inZone = !player.active ? false : (race ? race.frame(boxes.boxes, x, z, riding, performance.now()).inZone : !riding && !!boxInReach(boxes.boxes, x, z)) && !room?.active;
        const bike = player.active && bodyCam && !room?.active && !modal() && !race?.view?.result ? player.bikes.prompt(player.controller) : null;
        raceHud?.update({ simTime: Math.max(0, player.simTime), serverNow: net ? net.serverNow() : 0, inZone, prompt, bike });
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
      const p = bodyCam ? player.position : camera.position; // streaming + colliders follow the body (watching / flying: the camera)
      sky.update();
      waterObj?.update(dt);
      chunks.update(p.x, p.y, p.z, worldReady ? chunkCfg.attachBudgetMs : Infinity); // the first view loads unbudgeted
      edge.hidden = edgeDistance(p.x, p.z) >= bounds.warnDistance;
    },
    render: () => {
      // Fix B (review 3 F3): in the Louvre room only the room, the players and the lights are drawn, without post-processing
      if (room?.active) hideWorld(scene.children, keepInRoom, hiddenForRoom);
      else if (hiddenForRoom.size) showWorld(hiddenForRoom);
      if (post && !room?.active) post.render();
      else {
        if (!renderer.info.autoReset) renderer.info.reset(); // post.ts counts its passes by hand
        renderer.render(scene, camera);
      }
      const now = performance.now();
      if (fpsWatch && worldReady && !room?.active && fpsWatch.frame((now - lastFrame) / 1000)) {
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
      // NPCs: ≥ 2 frames through npcs.update (drawn, and in __STATS__ above) — a viewer waits only for an explicit ?wait= (p9-watch).
      if (!ready && worldReady && npcReady && (!npcs || npcFrames >= 2) && (player ? player.simTime >= wait : demoClock >= (Number.isFinite(waitArg) ? waitArg : 0))) {
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
