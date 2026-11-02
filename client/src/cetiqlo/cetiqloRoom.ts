// CETIQLO head-to-head room (docs/plans/cetiqlo.md §1, §6) as a Leg 3 race room (rooms/types.ts `mountRoom`, the BOZAR hall's contract):
// the team opens the box at Vincom Phạm Ngọc Thạch, walks into the store's LOBBY (z 10..16, glass to the sales floor) and is queued
// (`cq.join`); the server pairs it, dresses the mannequin with the set (`cq.state match`: set ids), moves the body to its start spot
// (Player.moveTo through `o.moveTo`, no teleport flag) and the 3:00 clock runs on the server clock (endsAt − serverNow offset).
// F near an item (≤ cetiqlo.labelRange, the one in front of the camera first) = `cq.take {id, x, z}` (room-local), the bag is HUD
// data (bottom-right; B opens it, click = `cq.drop`, Digit1–9 drop item n), F inside the red CHECKOUT square = `cq.checkout` → the
// body is locked (`frozen()`, main.ts). The opponent is a RemotePlayers body like anywhere else (plan §1.9); its bag is never shown.
// `cq.result` = the result screen (Enter / button closes it); a win makes the server complete the step, so the usual `race` view
// brings the next card + `exitReady` (the lit exit ring beside the door, the card held until the body walks into it, like the hall);
// a loss / draw: the server queues the team again and the next `cq.state lobby` puts the body back in the lobby.
// Scene: the store agent's `buildStore` (storeScene.ts; contract.ts names the types). Minimal graphics (no shadows / post, pixelRatio 1
// by main.ts). The mannequin PiP = `mannequin.renderPiP` (its own camera, layer 1 only) into a scissor rectangle right after the main
// render (`afterRender`): no second renderer, no extra pass over the store.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CATALOG, ITEM_BY_ID, STORE, displayShape } from '@race/shared/cetiqlo';
import { cetiqlo as C } from '../config.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import type { CqDebug, RoomHandle, RoomMountOptions } from '../rooms/types.ts';
import type { CqMatchView, CqResult, CqServerMessage } from './contract.ts';
import { CqHud } from './hud.ts';
import { type Anchor, NO_PICK, type PickState, clockOffset, countdown, insideCheckout, loserWaitText, pickItem, queueText } from './logic.ts';
import { shapeGeometry } from './items.ts';
import { ROOF_Y, buildStore } from './storeScene.ts';

/** Room-local z of the door end = the storefront (shared STORE plan); the body enters at (0, DOOR_Z − rooms.enterInset) in the lobby. */
export const DOOR_Z = STORE.doorZ;
/** The exit ring: in the lobby beside the storefront door (lit only once the step is done). */
export const EXIT = { x: -4.5, z: 14.6, r: 0.9 };
const CHECKOUT_TEXT = '[F] Chốt — kết thúc mua sắm';
const GLOW = { pick: '#ff4d1f', taken: '#2ecc71' }; // CETIQLO-red rim around the item in the crosshair; green on the ones in the bag
const REFUSAL: Record<string, string> = { far: 'Đứng gần kệ hơn mới lấy được', full: 'Túi đã đầy', dup: 'Món này đã có trong túi', locked: 'Đội đã chốt, không đổi được nữa', notRunning: 'Trận chưa bắt đầu', busy: 'Phòng đã đủ đội, thử lại sau', notInRoom: 'Không ở bước này' };

/** The stair's ramp collider (room-local): a thin slab whose top is the line through the step NOSINGS (step i's front top edge:
 *  z = zBottom − i·tread, y = (i + 1)·rise), tilted `tilt` about x (its +z / door end lower): it starts one tread in front of the
 *  first riser at floor level and meets floor 2 exactly at the last nosing, so no step box pokes through it. */
export function stairRamp(st = STORE.stair, thick = 0.1) {
  const run = st.steps * st.tread, rise = st.steps * st.rise, tilt = Math.atan2(rise, run), len = Math.hypot(run, rise);
  return { x: (st.x0 + st.x1) / 2, y: rise / 2 - (thick / 2) / Math.cos(tilt) + 0.01, z: st.zBottom + st.tread - run / 2, hx: (st.x1 - st.x0) / 2, hy: thick / 2, hz: len / 2, tilt };
}
/** The ramp's top surface height at room-local z (for tests). */
export const rampYAt = (z: number, st = STORE.stair) => Math.min(st.steps * st.rise, Math.max(0, ((st.zBottom + st.tread - z) / st.tread) * st.rise));

let audio: AudioContext | null = null;
/** A short beep (the last 30 s): WebAudio, created on first use (after the click that locked the pointer). */
function beep() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime, g = audio.createGain(), o = audio.createOscillator();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.frequency.value = 1320;
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.12);
  } catch { /* no audio */ }
}

export async function mountRoom(o: RoomMountOptions): Promise<RoomHandle> {
  const { renderer, scene, frame } = o;
  const VIEWER = !!o.viewer;
  const was = { background: scene.background, fog: scene.fog, exposure: renderer.toneMappingExposure };
  scene.background = new THREE.Color('#dfe6ee');
  scene.fog = null;
  renderer.toneMappingExposure = 1.0;
  const g = new THREE.Group();
  g.name = 'room';
  const gp = groupPose(frame);
  g.position.set(gp.x, gp.y, gp.z);
  g.rotation.y = gp.yaw;
  scene.add(g);
  const store = buildStore(g, { hq: !!o.hq, ...(o.characterAsset ? { avatar: o.characterAsset } : {}) }); // the game's Rocketbox asset: no second GLB load
  const exit = makeExitRing(g, EXIT.x, EXIT.z, 3.2, EXIT.r);
  const anchors: Anchor[] = [...store.itemAnchors].map(([id, v]) => ({ id, x: v.x, y: v.y, z: v.z }));
  const checkout = { x: store.checkout.centre.x, z: store.checkout.centre.z, radius: store.checkout.radius, half: store.checkout.halfExtents[0] };
  const lobbySpot = { x: store.lobby.door.x, z: (store.lobby.box.min.z + store.lobby.box.max.z) / 2, yaw: 0 }; // mid-lobby, facing the sales floor
  // colliders (the race only): the store's cuboids at the frame (the hall's way)
  const colliders: RAPIER.Collider[] = [];
  if (o.world) {
    for (const b of store.colliders) {
      const p = toWorld(frame, b.x, b.z), yaw = (b.yaw ?? 0) + frame.yaw;
      colliders.push(o.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(p.x, frame.floorY + b.y, p.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })));
    }
    // the stair as ONE ramp on the nosing line (28°, under player.maxSlopeDeg): the body glides up instead of the KCC autostep
    // hopping 16 cm at every one of the 24 step boxes (13 hops a second at walking speed = the "giật giật"); the steps stay drawn
    if (!(import.meta.env.DEV && o.q.get('noRamp') === '1')) { // DEV ?noRamp=1: the bare steps (scripts/room-smooth.ts A/B)
      const r = stairRamp();
      const p = toWorld(frame, r.x, r.z), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.tilt, frame.yaw, 0, 'YXZ'));
      colliders.push(o.world.createCollider(RAPIER.ColliderDesc.cuboid(r.hx, r.hy, r.hz).setTranslation(p.x, frame.floorY + r.y, p.z).setRotation(q)));
    }
  }
  const camera = o.camera ?? new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 150);
  const feet = () => toLocal(frame, o.feet!().x, o.feet!().z);
  const feetY = () => (o.feetY?.() ?? frame.floorY) - frame.floorY;
  const moveTo = (s: { x: number; z: number; yaw: number }) => { const p = toWorld(frame, s.x, s.z); o.moveTo?.(p.x, p.z, frame.yaw + s.yaw); };
  const colourOf = (slot: number) => o.teams?.find((t) => t.slot === slot)?.colour ?? (slot === o.team?.slot ? o.team.colour : '#f07f1d');
  const yAxis = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), size = new THREE.Vector2();

  // ---- state (from the server only) ----
  const hud = VIEWER ? null : new CqHud();
  const cq = VIEWER ? undefined : o.cq;
  let phase: 'lobby' | 'match' | 'result' = 'lobby';
  let match: CqMatchView | null = null;
  let bag: string[] = [];
  let locked = false, oppLocked = false;
  let offset = 0; // server clock − local clock
  let result: CqResult | null = null;
  let gotState = false, lastSecond = -1, frames = 0;
  let queue: { pos?: number; len?: number } = {};
  let holdEnds = Infinity; // server ms: a loser's result screen is over (then the lobby, even without a cq.state)
  let lostAt: number | null = null; // server ms of the last lost match's result: the lobby's "chờ thêm mm:ss" line (loserMaxWaitMs)
  let released: 'win' | 'timeout' | null = null; // cq.advance: the step is done (the ring lights through the usual race view)
  let waitText: string | null = null;
  let pick: PickState = NO_PICK; // look-to-select (logic.ts pickItem)
  const oppName = () => match?.opp.name ?? 'đối thủ';
  const bagItems = () => bag.map((id) => ITEM_BY_ID.get(id)).filter((i) => !!i);
  const closeResult = () => { if (!result) return; result = null; hud!.result(null, ITEM_BY_ID, colourOf, 0); o.onClose?.(); };
  const openBag = (on: boolean) => { if (!hud || hud.bagOpen === on) return; hud.openBag(on); if (on) document.exitPointerLock(); else o.onClose?.(); };
  const onMessage = (m: CqServerMessage) => {
    if (!hud) return;
    if (m.t === 'cq.state') {
      offset = clockOffset(m.serverNow, Date.now());
      gotState = true;
      const before = phase;
      phase = m.phase;
      if (m.phase === 'match' && m.match) {
        const fresh = match?.id !== m.match.id;
        match = m.match;
        bag = m.match.yourBag;
        locked = m.match.yourLocked;
        oppLocked = m.match.oppLocked;
        if (fresh) {
          closeResult();
          lostAt = null;
          hud.lobbyWait(null);
          store.mannequin.dress(m.match.set);
          store.brief.dress(m.match.set);
          pipAt = -Infinity; // the next frame re-renders the brief picture
          if (m.startSpot) moveTo(m.startSpot);
          hud.toast(`Trận bắt đầu · đối thủ: ${oppName()}`);
        }
        hud.lobby(null);
        hud.match(true);
        hud.opponent(oppName(), colourOf(m.match.opp.slot), oppLocked);
        hud.bag(bagItems());
        syncTaken();
        hud.locked(locked);
      } else {
        if (m.phase === 'lobby') {
          if (before !== 'lobby') (match = null), (bag = []), (locked = false), moveTo(lobbySpot);
          queue = { pos: m.queuePos, len: m.queueLen };
          hud.lobby(queueText(m.queuePos, m.queueLen));
        } else hud.lobby(null);
        hud.match(false);
      }
    } else if (m.t === 'cq.bag') (bag = m.bag), hud.bag(bagItems()), syncTaken();
    else if (m.t === 'cq.opp') { if (m.locked && !oppLocked) hud.toast(`${oppName()} đã chốt`); oppLocked = m.locked; if (match) hud.opponent(oppName(), colourOf(match.opp.slot), oppLocked); }
    else if (m.t === 'cq.result') {
      result = m;
      phase = 'result';
      holdEnds = m.winner === 'you' ? Infinity : m.serverNow + m.holdMs + 500; // update(): the lone loser's way back to the lobby (the server also sends cq.state lobby at holdUntil: whichever comes first flips the phase, the other is a no-op)
      lostAt = m.winner === 'you' ? null : m.serverNow;
      locked = false;
      openBag(false);
      hud.match(false);
      hud.result(m, ITEM_BY_ID, colourOf, m.startAt);
      document.exitPointerLock();
    } else if (m.t === 'cq.advance') { // the step is done: the next card + the lit ring come with the `race` view (RoomFlow exitReady)
      released = m.reason ?? 'win';
      if (released === 'timeout') { hud.toast('Bạn đã chờ quá 10 phút, được rời đi'); hud.lobby('Được rời đi: ra vòng sáng cạnh cửa để nhận mật thư kế'); hud.lobbyWait(null); lostAt = null; }
    } else if (m.t === 'cq.no') hud.toast(REFUSAL[m.why] ?? 'Máy chủ từ chối');
  };
  if (cq) {
    cq.onMessage = onMessage;
    cq.send({ t: 'cq.join' });
  }
  if (hud) {
    hud.onDrop = (id) => { if (phase === 'match' && !locked) cq?.send({ t: 'cq.drop', id }); };
    hud.onContinue = closeResult;
  }
  // ---- look-to-select: ONE reusable halo shell (the picked item's own low-poly shape, scaled up, additive BackSide) at the item's shelf
  // pose inside the room group (room-local, so the frame transform is the group's); small green shells on the items in the bag ----
  // a BackSide shell a bit larger than the item: its inner far faces show as a coloured rim around the garment's silhouette (normal
  // blending: additive would vanish on the white shelves); flat folded slabs get a taller shell so the rim is seen from above
  const haloMat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.BackSide, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), haloMat(GLOW.pick, 0.85));
  halo.visible = false;
  g.add(halo);
  const takenMat = haloMat(GLOW.taken, 0.5);
  const taken = new Map<string, THREE.Mesh>();
  const placeShell = (m: THREE.Mesh, id: string, k = 1.12) => { const it = ITEM_BY_ID.get(id)!; m.geometry = shapeGeometry(displayShape(it.shape, it.display)); m.position.set(it.shelf.x, it.shelf.y, it.shelf.z); m.rotation.y = it.shelf.yaw; m.scale.set(k, it.display === 'fold' ? k * 2.2 : k, k); };
  /** The green shells follow the bag (a few meshes at most: bagMax 24). */
  const syncTaken = () => {
    for (const [id, m] of taken) if (!bag.includes(id)) (g.remove(m), taken.delete(id));
    for (const id of bag) if (!taken.has(id) && ITEM_BY_ID.has(id)) { const m = new THREE.Mesh(new THREE.BufferGeometry(), takenMat); placeShell(m, id, 1.08); g.add(m); taken.set(id, m); }
  };
  const look = { x: 0, z: 0 }, feet3 = { x: 0, y: 0, z: 0 }, camLocal = new THREE.Vector3();
  /** The item in the crosshair this frame (none while locked / frozen / outside a match); updates the halo. */
  const updatePick = (now: number, t: number) => {
    let next = NO_PICK;
    if (phase === 'match' && !locked && !o.frozen?.()) {
      const f = feet();
      Object.assign(feet3, { x: f.x, y: feetY(), z: f.z });
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).applyAxisAngle(yAxis, -frame.yaw);
      Object.assign(look, { x: fwd.x, z: fwd.z });
      next = pickItem(look, feet3, anchors, pick, now, C.pick);
    }
    if (next.id !== pick.id) {
      if (next.id) placeShell(halo, next.id);
      halo.visible = !!next.id;
    }
    pick = next;
    if (halo.visible && pick.id) { const k = 1.12 + 0.03 * Math.sin(t * 5), fold = ITEM_BY_ID.get(pick.id)!.display === 'fold'; halo.scale.set(k, fold ? k * 2.2 : k, k); }
  };
  const atCheckout = () => { if (phase !== 'match' || locked) return false; const f = feet(); return insideCheckout(f.x, f.z, checkout); };
  function interact(): boolean {
    if (result) return closeResult(), true;
    if (!cq || phase !== 'match' || locked) return false;
    const f = feet();
    if (atCheckout()) return cq.send({ t: 'cq.checkout', x: +f.x.toFixed(2), z: +f.z.toFixed(2) }), true;
    if (!pick.id) return false;
    cq.send({ t: 'cq.take', id: pick.id, x: +f.x.toFixed(2), z: +f.z.toFixed(2) });
    return true;
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || !hud) return;
    if (result) { if (e.code === 'Enter' || e.code === 'KeyF' || e.code === 'Escape') setTimeout(closeResult, 60); return; } // after the game loop polled this key: it opens no card
    if (phase !== 'match') return;
    if (e.code === C.bagKey) openBag(!hud.bagOpen);
    else if (hud.bagOpen && e.code === 'Escape') openBag(false);
    else if (e.code === C.lookbookKey) hud.lookbook(!hud.lookbookOn);
    else if (/^Digit[1-9]$/.test(e.code) && !locked) { const id = bag[Number(e.code[5]) - 1]; if (id) cq?.send({ t: 'cq.drop', id }); }
  };
  if (!VIEWER) addEventListener('keydown', onKey);
  const clock = new THREE.Clock();
  // the brief picture (store.brief: the set's six pieces on a turning ring, no text) is rendered into its own render target at
  // cetiqlo.pip.fps and blitted as a screen quad every frame (a skipped scissor draw would show the store behind it)
  const B = store.brief.size;
  const pipRT = new THREE.WebGLRenderTarget(B.w, B.h, { depthBuffer: true });
  pipRT.texture.colorSpace = THREE.SRGBColorSpace;
  const pipQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: pipRT.texture, toneMapped: false, depthTest: false, depthWrite: false }));
  const pipScene = new THREE.Scene().add(pipQuad), pipCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let pipAt = -Infinity;
  const pipRect = { x: 0, y: 0, w: 0, h: 0 };
  let pipRectAt = -Infinity;
  hud?.pipAspect(B.w, B.h);

  /** DEV / tests: scripted moves against the real server (rooms/types.ts CqDebug; main.ts window.__GAME__.cq). */
  const cqDebug = (): CqDebug => {
    const at = (x: number, z: number) => ({ x: +x.toFixed(2), z: +z.toFixed(2) });
    const goTake = (id: string) => {
      const it = ITEM_BY_ID.get(id);
      if (!it || !cq) return;
      const off = Math.abs(it.shelf.x) > 11 ? { x: -Math.sign(it.shelf.x) * 1.1, z: 0 } : { x: 0, z: 1.1 }; // a step off the shelf, into the aisle
      const p = at(it.shelf.x + off.x, it.shelf.z + off.z);
      moveTo({ ...p, yaw: Math.atan2(off.x, off.z) + Math.PI });
      cq.send({ t: 'cq.take', id, ...p });
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    return {
      state: () => ({ phase, matchId: match?.id ?? null, set: match?.set ?? [], bag: [...bag], locked, oppLocked, ...queue, exitLit: exit.on, picked: pick.id, released, result: result && { winner: result.winner, youScore: result.you.score, oppScore: result.opp.score, reason: result.reason } }),
      async takeSet(correct, wrong = 0) {
        const set = match?.set ?? [], ids = set.slice(0, correct);
        for (const id of set.slice(correct, correct + wrong)) { const it = ITEM_BY_ID.get(id)!; const other = CATALOG.find((c) => c.slot === it.slot && c.id !== id); if (other) ids.push(other.id); }
        for (const id of ids) { goTake(id); await sleep(180); }
        return ids;
      },
      take: goTake,
      drop: (id) => cq?.send({ t: 'cq.drop', id }),
      checkout: () => { const p = at(checkout.x, checkout.z); moveTo({ ...p, yaw: 0 }); cq?.send({ t: 'cq.checkout', ...p }); },
    };
  };

  return {
    group: g,
    ceiling: ROOF_Y,
    cqDebug,
    update(dt) {
      clock.getDelta();
      const t = clock.elapsedTime, now = performance.now();
      { // the room-local camera for the store's LOD / floor culling (viewer too); inline toLocal: no per-frame allocation
        const dx = camera.position.x - frame.x, dz = camera.position.z - frame.z, sn = Math.sin(frame.yaw), cs = Math.cos(frame.yaw);
        camLocal.set(dx * cs - dz * sn, camera.position.y - frame.floorY, dx * sn + dz * cs + frame.doorZ);
      }
      store.update(dt, camLocal);
      exit.update(t);
      frames++;
      if (!hud) return;
      hud.update(now);
      // ponytail: a lone loser gets no `cq.state lobby` after the hold (the server's alarm only fires with ≥ 2 teams queued): once the hold
      // is over the client puts itself in the lobby (no queue numbers until the next cq.state); frame-driven, not a timer (background tabs)
      if (phase === 'result' && Date.now() + offset >= holdEnds) (holdEnds = Infinity), onMessage({ t: 'cq.state', phase: 'lobby', serverNow: Date.now() + offset });
      if (phase === 'lobby' && lostAt !== null && !released) { const w = loserWaitText(lostAt, C.loserMaxWaitMs, Date.now() + offset); if (w !== waitText) hud.lobbyWait((waitText = w)); } // once a second (the text changes per second)
      if (phase === 'match' && match) {
        const c = countdown(match.endsAt, Date.now(), offset, C.warnMs);
        if (c.second !== lastSecond) { lastSecond = c.second; hud.clock(c.text, c.warn); if (c.warn && c.second > 0 && c.second <= C.warnMs / 1000) beep(); }
        updatePick(now, t);
        const go = atCheckout();
        hud.label(go ? CHECKOUT_TEXT : pick.id ? '[F]' : null, go);
      } else if (halo.visible) (halo.visible = false), (pick = NO_PICK);
    },
    afterRender() {
      if (VIEWER || !hud || phase !== 'match' || !hud.lookbookOn) return;
      const now = performance.now();
      if (now - pipAt >= 1000 / C.pip.fps) { // the ring alone (brief.renderPiP: its own camera / layer) into the render target
        pipAt = now;
        renderer.setRenderTarget(pipRT);
        store.brief.renderPiP(renderer, { x: 0, y: 0, w: B.w, h: B.h });
        renderer.setRenderTarget(null);
      }
      renderer.getSize(size); // pixelRatio is 1 inside a room: CSS px = renderer px (rect origin bottom-left)
      if (now - pipRectAt > 500) { pipRectAt = now; Object.assign(pipRect, hud.pipRect()); } // the HUD frame's box (scaled by the viewport): layout read twice a second
      const x = Math.round(pipRect.x), y = Math.round(size.y - pipRect.y - pipRect.h), w = Math.round(pipRect.w), h = Math.round(pipRect.h), auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.render(pipScene, pipCam); // 1 draw call: the cached texture
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.setScissor(0, 0, size.x, size.y);
      renderer.autoClear = auto;
    },
    interact,
    setProgress: () => {},
    setExit: (on) => exit.set(on), // lit once the step is done (a win: main.ts 'exitReady')
    setLocked: () => {},
    exitHit: () => { const f = feet(); return exit.hit(f.x, f.z); },
    overlayOpen: () => !!result || !!hud?.bagOpen,
    frozen: () => locked || !!result,
    settled: () => frames >= 3 && (VIEWER || (gotState && (cq?.ready?.() ?? true))),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      if (!VIEWER) removeEventListener('keydown', onKey);
      if (cq) { cq.send({ t: 'cq.leave' }); cq.onMessage = null; }
      hud?.dispose();
      pipRT.dispose();
      pipQuad.geometry.dispose();
      (pipQuad.material as THREE.Material).dispose();
      (halo.material as THREE.Material).dispose();
      takenMat.dispose();
      for (const c of colliders) o.world!.removeCollider(c, false);
      store.dispose();
      scene.remove(g);
      scene.background = was.background;
      scene.fog = was.fog;
      renderer.toneMappingExposure = was.exposure;
    },
  };
}
