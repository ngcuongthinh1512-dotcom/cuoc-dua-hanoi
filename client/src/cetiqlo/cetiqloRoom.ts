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
import { CATALOG, ITEM_BY_ID, STORE } from '@race/shared/cetiqlo';
import { cetiqlo as C } from '../config.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import type { CqDebug, RoomHandle, RoomMountOptions } from '../rooms/types.ts';
import type { CqMatchView, CqResult, CqServerMessage } from './contract.ts';
import { CqHud } from './hud.ts';
import { type Anchor, clockOffset, countdown, insideCheckout, labelText, nearestItem, queueText } from './logic.ts';
import { ROOF_Y, buildStore } from './storeScene.ts';

/** Room-local z of the door end = the storefront (shared STORE plan); the body enters at (0, DOOR_Z − rooms.enterInset) in the lobby. */
export const DOOR_Z = STORE.doorZ;
/** The exit ring: in the lobby beside the storefront door (lit only once the step is done). */
export const EXIT = { x: -4.5, z: 14.6, r: 0.9 };
const CHECKOUT_TEXT = '[F] Chốt — kết thúc mua sắm';
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
          store.mannequin.dress(m.match.set);
          hud.cards(thumbnails(m.match.set)); // one-off per set, at the match start (not during play)
          pipAt = -Infinity; // the next frame re-renders the PiP
          if (m.startSpot) moveTo(m.startSpot);
          hud.toast(`Trận bắt đầu · đối thủ: ${oppName()}`);
        }
        hud.lobby(null);
        hud.match(true);
        hud.opponent(oppName(), colourOf(m.match.opp.slot), oppLocked);
        hud.bag(bagItems());
        hud.locked(locked);
      } else {
        if (m.phase === 'lobby') {
          if (before !== 'lobby') (match = null), (bag = []), (locked = false), moveTo(lobbySpot);
          queue = { pos: m.queuePos, len: m.queueLen };
          hud.lobby(queueText(m.queuePos, m.queueLen));
        } else hud.lobby(null);
        hud.match(false);
      }
    } else if (m.t === 'cq.bag') (bag = m.bag), hud.bag(bagItems());
    else if (m.t === 'cq.opp') { if (m.locked && !oppLocked) hud.toast(`${oppName()} đã chốt`); oppLocked = m.locked; if (match) hud.opponent(oppName(), colourOf(match.opp.slot), oppLocked); }
    else if (m.t === 'cq.result') {
      result = m;
      locked = false;
      openBag(false);
      hud.match(false);
      hud.result(m, ITEM_BY_ID, colourOf, m.startAt);
      document.exitPointerLock();
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
  // the nearest item: scanned at most every nearEveryMs, or sooner when the feet moved > nearMoveM (600 anchors a frame is cheap, but
  // the game loop has an 8 ms budget at 120 Hz: no per-frame scan, no per-frame allocation)
  let nearAt = -Infinity, nearX = NaN, nearZ = NaN, nearHit: Anchor | null = null;
  const near = (): Anchor | null => {
    if (phase !== 'match' || locked || o.frozen?.()) return null;
    const f = feet(), now = performance.now();
    if (now - nearAt < C.nearEveryMs && Math.hypot(f.x - nearX, f.z - nearZ) < C.nearMoveM) return nearHit;
    nearAt = now; nearX = f.x; nearZ = f.z;
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).applyAxisAngle(yAxis, -frame.yaw);
    return (nearHit = nearestItem(f.x, feetY(), f.z, fwd.x, fwd.z, anchors, C.labelRange));
  };
  const atCheckout = () => { if (phase !== 'match' || locked) return false; const f = feet(); return insideCheckout(f.x, f.z, checkout); };
  function interact(): boolean {
    if (result) return closeResult(), true;
    if (!cq || phase !== 'match' || locked) return false;
    const f = feet();
    if (atCheckout()) return cq.send({ t: 'cq.checkout', x: +f.x.toFixed(2), z: +f.z.toFixed(2) }), true;
    const a = near();
    if (!a) return false;
    cq.send({ t: 'cq.take', id: a.id, x: +f.x.toFixed(2), z: +f.z.toFixed(2) });
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
  const mapState = { bounds: store.minimapBounds, lobbyZ: store.lobby.box.min.z, checkout: { x: checkout.x, z: checkout.z, half: checkout.half ?? checkout.radius / Math.SQRT2 }, you: { x: 0, z: 0, yaw: 0, floor: 1 as 1 | 2, colour: o.team?.colour ?? '#fff' }, opp: null as { x: number; z: number; floor: 1 | 2; colour: string } | null };
  const oppPose = { x: 0, z: 0, floor: 1 as 1 | 2, colour: '#f07f1d' };
  const clock = new THREE.Clock();
  /** The lookbook cards' data: mannequin.thumbnails = each piece alone in a small canvas (cached per set; one-off at the match start). */
  const thumbnails = (set: readonly string[]) => store.mannequin.thumbnails(set, renderer, 160);
  // the PiP: the mannequin is rendered into its own render target at cetiqlo.pip.fps and blitted as a screen quad every frame
  // (a skinned Rocketbox human every frame would cost a second character pass; a skipped scissor draw would show the store behind it)
  const pipRT = new THREE.WebGLRenderTarget(C.pip.width, C.pip.height, { depthBuffer: true });
  pipRT.texture.colorSpace = THREE.SRGBColorSpace;
  const pipQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: pipRT.texture, toneMapped: false, depthTest: false, depthWrite: false }));
  const pipScene = new THREE.Scene().add(pipQuad), pipCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), pipBg = new THREE.Color('#f3efe6');
  let pipAt = -Infinity;
  const pipRect = { x: 0, y: 0, w: 0, h: 0 }, pipAim = new THREE.Vector3();
  let pipRectAt = -Infinity;

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
      state: () => ({ phase, matchId: match?.id ?? null, set: match?.set ?? [], bag: [...bag], locked, oppLocked, ...queue, exitLit: exit.on, result: result && { winner: result.winner, youPct: result.you.scorePct, oppPct: result.opp.scorePct, reason: result.reason } }),
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
      store.update(dt);
      exit.update(t);
      frames++;
      if (!hud) return;
      hud.update(now);
      if (phase === 'match' && match) {
        const c = countdown(match.endsAt, Date.now(), offset, C.warnMs);
        if (c.second !== lastSecond) { lastSecond = c.second; hud.clock(c.text, c.warn); if (c.warn && c.second > 0 && c.second <= C.warnMs / 1000) beep(); }
        const go = atCheckout(), a = go ? null : near();
        hud.label(go ? CHECKOUT_TEXT : a ? labelText(ITEM_BY_ID.get(a.id)!) : null, go);
        const f = feet();
        fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).applyAxisAngle(yAxis, -frame.yaw);
        Object.assign(mapState.you, { x: f.x, z: f.z, yaw: Math.atan2(-fwd.x, -fwd.z), floor: feetY() > C.floor2Y ? 2 : 1 });
        const p = o.peerPose?.(match.opp.slot);
        if (p) { const l = toLocal(frame, p.x, p.z); Object.assign(oppPose, { x: l.x, z: l.z, floor: p.y - frame.floorY > C.floor2Y ? 2 : 1, colour: colourOf(match.opp.slot) }); mapState.opp = oppPose; } else mapState.opp = null;
        hud.map(mapState, now);
      }
    },
    afterRender() {
      if (VIEWER || !hud || phase !== 'match' || !hud.lookbookOn) return;
      const now = performance.now();
      if (now - pipAt >= 1000 / C.pip.fps) { // the mannequin alone (its PiP camera, layer 1) into the render target
        pipAt = now;
        const bg = scene.background, pc = store.mannequin.pipCamera;
        // ponytail: mannequin.ts `camAt` calls lookAt(0, y, 0) AFTER the camera is parented under the pedestal, and Object3D.lookAt takes a
        // WORLD point: once the human asset lands the camera stares at the world origin. Re-aim at the figure (pedestal-local) each render.
        pipAim.set(0, pc.position.y - 0.04, 0);
        pc.lookAt(store.mannequin.object.localToWorld(pipAim));
        scene.background = pipBg;
        renderer.setRenderTarget(pipRT);
        renderer.render(scene, pc);
        renderer.setRenderTarget(null);
        scene.background = bg;
      }
      renderer.getSize(size); // pixelRatio is 1 inside a room: CSS px = renderer px (rect origin bottom-left)
      if (now - pipRectAt > 500) { pipRectAt = now; Object.assign(pipRect, hud.pipRect()); } // the HUD frame's box (60vh cap): layout read twice a second
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
      for (const c of colliders) o.world!.removeCollider(c, false);
      store.dispose();
      scene.remove(g);
      scene.background = was.background;
      scene.fog = was.fog;
      renderer.toneMappingExposure = was.exposure;
    },
  };
}
