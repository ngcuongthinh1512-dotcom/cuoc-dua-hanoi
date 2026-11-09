// CETIQLO head-to-head room (docs/plans/cetiqlo.md §1, §6) as a Leg 3 race room (rooms/types.ts `mountRoom`, the BOZAR hall's contract):
// the team opens the box at Vincom Phạm Ngọc Thạch, lands on the FORECOURT outside the store's glass front (the waiting area, board.ts:
// z 16..30) and is queued (`cq.join`); the server pairs it, dresses the mannequin with the set (`cq.state match`: set ids), moves the body to its start spot
// (Player.moveTo through `o.moveTo`, no teleport flag) and the 3:30 clock (CETIQLO.pickMs) runs on the server clock (endsAt − serverNow offset).
// The WAITING AREA is the forecourt in front of the shop (board.ts): benches, canopy, a street backdrop + the LIVE BOARD on a pylon
// beside the door (arrival order 1..11, who plays / waits / lost / left), redrawn only on `cq.board`; the same rows in the HUD panel;
// H opens the condensed rules (hud.ts RULES_HTML). A loser / waiter is put back on the forecourt (WAIT_SPOT); the shop's lobby (z 10..16)
// is just the entrance vestibule.
// F near an item (≤ cetiqlo.labelRange, the one in front of the camera first) = `cq.take {id, x, z}` (room-local), the bag is HUD
// data (bottom-right; B opens it, click = `cq.drop`, Digit1–9 drop item n), F inside the red CHECKOUT square = `cq.checkout` → the
// body is locked (`frozen()`, main.ts). The opponent is a RemotePlayers body like anywhere else (plan §1.9); its bag is never shown.
// `cq.result` = the result screen (Enter / button closes it); a win makes the server complete the step, so the usual `race` view
// brings the next card + `exitReady` (the lit exit ring beside the door, the card held until the body walks into it, like the hall);
// a loss / draw: the server queues the team again and the next `cq.state lobby` puts the body back on the forecourt.
// Scene: the store agent's `buildStore` (storeScene.ts; contract.ts names the types). Minimal graphics (no shadows / post, pixelRatio 1
// by main.ts). The brief ("đề bài") = six STILLS (`store.brief.snapshots`, one render-target pass per set when the match starts / is
// restored, then disposed) in the HUD's 3 × 2 grid; a cell click / T opens the zoom lightbox (pointer freed, relocked on close): no
// per-frame PiP at all.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CATALOG, ITEM_BY_ID, STORE, displayShape } from '@race/shared/cetiqlo';
import { cetiqlo as C } from '../config.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import type { CqDebug, RoomHandle, RoomMountOptions } from '../rooms/types.ts';
import type { Box } from '../rooms/roomPlayer.ts';
import { CETIQLO } from '../../../worker/src/race/cetiqlo/config.ts'; // the server's rule numbers (maxWaitMs): no client copy to drift
import { FORECOURT, buildWaitingRoom } from './board.ts';
import type { CqBoardRow, CqMatchView, CqResult, CqServerMessage } from './contract.ts';
import { CqHud } from './hud.ts';
import { type Anchor, NO_PICK, type PickState, clockOffset, countdown, insideCheckout, mmss, pickItem, queueText, waitText } from './logic.ts';
import { shapeGeometry } from './items.ts';
import { NPC_GROUPS } from '../npc/types.ts';
import { ROOF_Y, buildStore } from './storeScene.ts';

/** Room-local z of the room's door end = the STREET side of the forecourt (board.ts FORECOURT, outside the shop's glass front at
 *  STORE.doorZ); the body enters at (0, DOOR_Z − rooms.enterInset) on the forecourt = the waiting area, facing the shop. */
export const DOOR_Z = STORE.doorZ + FORECOURT.depth;
/** The exit ring: on the forecourt beside the room door (lit only once the step is done). */
export const EXIT = { x: -4.5, z: DOOR_Z - 1.6, r: 0.9 };
/** Where a waiting team stands (the forecourt's middle, facing the shop / the board). */
export const WAIT_SPOT = { x: 0, z: STORE.doorZ + FORECOURT.depth / 2, yaw: 0 };
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

/** The owner's "sàn nhà bằng phẳng" (2026-11-03): the KCC must never step on, brush or catch anything at foot height. From the store's
 *  boxes (room-local cuboids): the two floor slabs stay as they are (one big cuboid each, 1 m thick); every other box standing on a floor
 *  (bottom within 0.1 m of 0 or floor2Y) is dropped when its top is under `FLAT.minTop` above that floor (zone markers, rack feet, the
 *  pedestal, the checkout pad: nothing to autostep onto), else embedded `FLAT.embed` m into the slab (no coplanar bottom face at the slab
 *  top = no ghost contacts) and shortened `FLAT.trim` m at both ends (the capsule slides past corners instead of catching them). */
export const FLAT = { minTop: 0.5, embed: 0.05, trim: 0.03 };
export function flatFloorBoxes(boxes: readonly Box[], floor2Y = STORE.floor2Y): Box[] {
  const out: Box[] = [];
  for (const b of boxes) {
    const bottom = b.y - b.hy, top = b.y + b.hy;
    if (b.hx >= 10 && b.hz >= 10 && b.hy >= 0.1) { out.push(b); continue; } // a floor slab (floor 1 / floor 2)
    const level = Math.abs(bottom) <= 0.1 ? 0 : Math.abs(bottom - floor2Y) <= 0.1 ? floor2Y : null;
    if (level === null) { out.push(b); continue; } // not standing on a floor (the roof, the floor-2 balustrade top, hanging things)
    if (top - level < FLAT.minTop) continue;
    const lo = level - FLAT.embed;
    out.push({ ...b, y: (top + lo) / 2, hy: (top - lo) / 2, hx: Math.max(0.02, b.hx - FLAT.trim), hz: Math.max(0.02, b.hz - FLAT.trim) });
  }
  return out;
}

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
  const board = buildWaitingRoom(g); // the forecourt outside the glass front: benches, canopy, backdrop + the LIVE BOARD (scenery for a viewer too; rows arrive with cq.board)
  const anchors: Anchor[] = [...store.itemAnchors].map(([id, v]) => ({ id, x: v.x, y: v.y, z: v.z }));
  const checkout = { x: store.checkout.centre.x, z: store.checkout.centre.z, radius: store.checkout.radius, half: store.checkout.halfExtents[0] };
  const lobbySpot = WAIT_SPOT; // a loser / a waiter stands on the forecourt, facing the shop
  // colliders (the race only): the store's + the forecourt's cuboids at the frame (the hall's way)
  const colliders: RAPIER.Collider[] = [];
  // the shop door (the 3 m opening in the glass front): an invisible panel while this team waits outside (owner: "người đang đứng chờ thì
  // không được vào trong store"); removed for the pair of a match and for a winner / released team walking out. Per player: its own collider.
  let door: RAPIER.Collider | null = null;
  const setDoor = (closed: boolean) => {
    if (!o.world || closed === !!door) return;
    if (!closed) { o.world.removeCollider(door!, false); door = null; return; }
    const p = toWorld(frame, 0, STORE.doorZ);
    door = o.world.createCollider(RAPIER.ColliderDesc.cuboid(1.6, 2, 0.1).setTranslation(p.x, frame.floorY + 2, p.z).setRotation({ x: 0, y: Math.sin(frame.yaw / 2), z: 0, w: Math.cos(frame.yaw / 2) }));
  };
  if (o.world) {
    for (const b of flatFloorBoxes([...store.colliders, ...board.colliders])) {
      const p = toWorld(frame, b.x, b.z), yaw = (b.yaw ?? 0) + frame.yaw;
      const desc = RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(p.x, frame.floorY + b.y, p.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
      // fixtures (tables, rails, shelves, balustrades, the pedestal: low boxes) block the body but NOT the camera's spring-arm cast
      // (ThirdPersonCamera casts with IGNORE_NPC = everything but membership bit 1): the arm being pulled in and out by every shelf
      // the camera brushed past was the "cà giựt" measured on the main aisle (camera speed ±37 % per frame vs ±3 % on the street)
      // (never a floor slab (top at y 0): the spawn ray ignores NPC_GROUPS, so a body placed in the room would land on the roof)
      if (((b.hy < 1 && b.y < 3) || b.hx < 0.1 || b.hz < 0.1) && b.y + b.hy > 0.05) desc.setCollisionGroups(NPC_GROUPS); // low fixtures + thin panes (glass, balustrades, the stair's side wall)
      colliders.push(o.world.createCollider(desc));
    }
    o.autostep?.(C.autostepM); // a flat shop floor: no stepping onto anything (the stair is a ramp); the street's step height is back on dispose
    setDoor(true); // the shop door is shut for a waiting team (opened by the match state / a win)
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
  const yAxis = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3();

  // ---- state (from the server only) ----
  const hud = VIEWER ? null : new CqHud();
  const cq = VIEWER ? undefined : o.cq;
  let phase: 'lobby' | 'match' | 'result' = 'lobby';
  let match: CqMatchView | null = null;
  let bag: string[] = [];
  let locked = false, oppLocked = false;
  let offset = 0; // server clock − local clock
  let result: CqResult | null = null;
  const noHowto = new URLSearchParams(location.search).has('noHowto'); // DEV: no how-to overlay at all (screenshots)
  let gotState = false, lastSecond = -1, frames = 0;
  let briefFor: string | null = null; // match id whose brief / dressed model are on screen (made at startAt, also after F5 into a running match)
  let countLast = -1; // the 5-4-3-2-1 second on screen
  /** In a match, before startAt: the pair stands frozen on the mat, no brief, no take. */
  const inCountdown = () => phase === 'match' && !!match && Date.now() + offset < match.startAt;
  /** …and while the fixed READING time (match.readMs, a fresh team paired at once) runs: how-to locked open, no numbers yet. */
  const readLeft = () => (phase === 'match' && match?.readMs ? match.startAt - CETIQLO.countdownMs - (Date.now() + offset) : 0);
  const startBrief = () => {
    if (!hud || !match || briefFor === match.id) return;
    briefFor = match.id;
    store.mannequin.dress(match.set);
    store.brief.dress(match.set);
    hud.brief(store.brief.snapshots(renderer, C.pip.snapPx), renderer.domElement.style.filter); // six stills from the shop's own meshes / lights, once per set; the canvas's CSS grade on the <img>s too
    hud.showBrief(true);
    hud.countdown(null);
    hud.toast(`Bắt đầu · ${mmss(CETIQLO.pickMs)} · đối thủ: ${oppName()}`);
  };
  let queue: { pos?: number; len?: number } = {};
  let holdEnds = Infinity; // server ms: a loser's result screen is over (then the lobby, even without a cq.state)
  let waitFrom: number | null = null; // server ms the wait clock started (joined the queue / the last result without a win): the lobby's "còn chờ tối đa mm:ss" line (CETIQLO.maxWaitMs)
  let released: 'win' | 'timeout' | null = null; // cq.advance: the step is done (the ring lights through the usual race view)
  let waitLine: string | null = null;
  let boardRows: CqBoardRow[] = [];
  let pick: PickState = NO_PICK; // look-to-select (logic.ts pickItem)
  const oppName = () => match?.opp.name ?? 'đối thủ';
  const bagItems = () => bag.map((id) => ITEM_BY_ID.get(id)).filter((i) => !!i);
  const closeResult = () => { if (!result) return; result = null; hud!.result(null, ITEM_BY_ID, colourOf, 0); o.onClose?.(); };
  const openBag = (on: boolean) => { if (!hud || hud.bagOpen === on) return; hud.openBag(on); if (on) document.exitPointerLock(); else o.onClose?.(); };
  const onMessage = (m: CqServerMessage) => {
    if (!hud) return;
    if (m.t === 'cq.state') {
      offset = clockOffset(m.serverNow, Date.now());
      if (!gotState && m.phase === 'lobby' && !noHowto) hud.rules(true); // entering the room: the how-to opens once, no timer (closable; not on an F5 into a match / countdown / result)
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
          waitFrom = null;
          hud.lobbyWait(null);
          if (!m.match.readMs) hud.rules(false); // paired out of the queue: the mat + the 5-4-3-2-1, no reading time
          hud.showBrief(false); // the brief (and the dressed model) only from startAt: update() → startBrief()
          if (m.startSpot) moveTo(m.startSpot); // the pair is placed on the CHECKOUT mat for the 5-4-3-2-1
          hud.toast(`Ghép trận · đối thủ: ${oppName()}`);
        }
        setDoor(false);
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
        if (m.waitUntil !== undefined) waitFrom = m.waitUntil - CETIQLO.maxWaitMs; // the server's clock (also after F5 / reconnect)
        hud.match(false);
        setDoor(m.phase === 'lobby' && !released); // a waiting team stays outside; a winner / a released team walks out through the open door
      }
    } else if (m.t === 'cq.board') { boardRows = m.rows; board.draw(m.rows, o.team?.slot ?? null, colourOf); hud.board(m.rows, o.team?.slot ?? null, colourOf); } // the wall screen + the HUD panel, only now (no per-frame work)
    else if (m.t === 'cq.bag') (bag = m.bag), hud.bag(bagItems()), syncTaken();
    else if (m.t === 'cq.opp') { if (m.locked && !oppLocked) hud.toast(`${oppName()} đã chốt`); oppLocked = m.locked; if (match) hud.opponent(oppName(), colourOf(match.opp.slot), oppLocked); }
    else if (m.t === 'cq.result') {
      result = m;
      phase = 'result';
      holdEnds = m.winner === 'you' ? Infinity : m.serverNow + m.holdMs + 500; // update(): the lone loser's way back to the lobby (the server also sends cq.state lobby at holdUntil: whichever comes first flips the phase, the other is a no-op)
      waitFrom = m.winner === 'you' ? null : m.serverNow;
      locked = false;
      openBag(false);
      hud.match(false);
      hud.result(m, ITEM_BY_ID, colourOf, m.startAt);
      document.exitPointerLock();
    } else if (m.t === 'cq.advance') { // the step is done: the next card + the lit ring come with the `race` view (RoomFlow exitReady)
      released = m.reason ?? 'win';
      setDoor(false);
      if (released === 'timeout') { hud.toast(`Bạn đã chờ quá ${Math.round(CETIQLO.maxWaitMs / 60_000)} phút, được rời đi`); hud.lobby('Được rời đi: ra vòng sáng ngoài sân để nhận mật thư kế'); hud.lobbyWait(null); waitFrom = null; }
    } else if (m.t === 'cq.no') hud.toast(REFUSAL[m.why] ?? 'Máy chủ từ chối');
  };
  if (cq) {
    cq.onMessage = onMessage;
    cq.send({ t: 'cq.join' });
  }
  if (hud) {
    hud.onDrop = (id) => { if (phase === 'match' && !locked) cq?.send({ t: 'cq.drop', id }); };
    hud.onContinue = closeResult;
    hud.onZoom = (open) => { if (open) document.exitPointerLock(); else if (!hud.bagOpen) o.onClose?.(); }; // the zoom frees the pointer like the bag; the clock / match go on
    hud.onRules = (open) => { if (open) document.exitPointerLock(); else if (!hud.bagOpen && hud.zoom === null) o.onClose?.(); }; // the rules panel (H) likewise
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
  const placeShell = (m: THREE.Mesh, id: string, k = 1.12) => { const it = ITEM_BY_ID.get(id)!, a = store.itemAnchors.get(id); m.geometry = shapeGeometry(displayShape(it.shape, it.display)); if (a) m.position.copy(a); else m.position.set(it.shelf.x, it.shelf.y, it.shelf.z); m.rotation.y = it.shelf.yaw; m.scale.set(k, it.display === 'fold' ? k * 2.2 : k, k); }; // the store's anchor = the item's centre (geometries are cached in items.ts: no clone / upload per selection)
  /** The green shells follow the bag (a few meshes at most: bagMax 24). */
  const syncTaken = () => {
    for (const [id, m] of taken) if (!bag.includes(id)) (g.remove(m), taken.delete(id));
    for (const id of bag) if (!taken.has(id) && ITEM_BY_ID.has(id)) { const m = new THREE.Mesh(new THREE.BufferGeometry(), takenMat); placeShell(m, id, 1.08); g.add(m); taken.set(id, m); }
  };
  const look = { x: 0, y: 0, z: 0 }, feet3 = { x: 0, y: 0, z: 0 }, camLocal = new THREE.Vector3();
  /** The item in the crosshair this frame (none while locked / frozen / outside a match); updates the halo. */
  const updatePick = (now: number, t: number) => {
    let next = NO_PICK;
    if (phase === 'match' && !locked && !o.frozen?.()) {
      const f = feet();
      feet3.x = f.x; feet3.y = feetY(); feet3.z = f.z;
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).applyAxisAngle(yAxis, -frame.yaw); // the real camera ray (pitch included), room-local
      look.x = fwd.x; look.y = fwd.y; look.z = fwd.z;
      next = pickItem(camLocal, look, feet3, anchors, pick, now, C.pick); // camLocal = the camera, room-local (set in update() before)
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
    if (e.code === C.rulesKey) return hud.rules(!hud.rulesOpen); // the rules panel, any phase (the waiting room above all)
    if (hud.rulesOpen) { if (e.code === 'Escape') hud.rules(false); return; }
    if (phase !== 'match') return;
    if (e.code === C.bagKey) openBag(!hud.bagOpen);
    else if (hud.zoom !== null && (e.code === 'Escape' || e.code === C.lookbookKey)) hud.setZoom(null);
    else if (hud.bagOpen && e.code === 'Escape') openBag(false);
    else if (e.code === C.lookbookKey) hud.setZoom('grid');
    else if (/^Digit[1-9]$/.test(e.code) && !locked) { const id = bag[Number(e.code[5]) - 1]; if (id) cq?.send({ t: 'cq.drop', id }); }
  };
  if (!VIEWER) addEventListener('keydown', onKey);
  const clock = new THREE.Clock();

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
      state: () => ({ phase, matchId: match?.id ?? null, set: match?.set ?? [], bag: [...bag], locked, oppLocked, queuePos: queue.pos, queueLen: queue.len, exitLit: exit.on, picked: pick.id, endsAt: match?.endsAt ?? null, oppSlot: match?.opp.slot ?? null, waitUntil: waitFrom === null ? null : waitFrom + CETIQLO.maxWaitMs, board: boardRows.map((r) => `${r.order}:${r.slot}:${r.status}`), countdown: inCountdown(), feet: (() => { const f = feet(); return { x: +f.x.toFixed(2), y: +feetY().toFixed(2), z: +f.z.toFixed(2) }; })(), released, result: result && { winner: result.winner, youScore: result.you.score, oppScore: result.opp.score, reason: result.reason } }),
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

  if (import.meta.env.DEV) Object.assign(window, { __CQ_ROOM__: { store, scene, renderer, camera, frame, camLocal } }); // scratch scripts: brief still vs shelf colour checks
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
      if (phase === 'lobby' && waitFrom !== null && !released) { const w = waitText(waitFrom, CETIQLO.maxWaitMs, Date.now() + offset); if (w !== waitLine) hud.lobbyWait((waitLine = w)); } // once a second (the text changes per second)
      { const l = readLeft(); hud.reading(l > 0 && !noHowto ? l : null, match?.readMs); }
      if (phase === 'match' && match && inCountdown() && readLeft() > 0) { if (countLast !== -1) (countLast = -1), hud.countdown(null); if (halo.visible) (halo.visible = false), (pick = NO_PICK); } // reading: still, no numbers
      else if (phase === 'match' && match && inCountdown()) { // 5-4-3-2-1 on the mat (server clock): a beep per second, 'BẮT ĐẦU!' is the first running frame below
        const s = Math.min(Math.ceil(CETIQLO.countdownMs / 1000), Math.ceil((match.startAt - (Date.now() + offset)) / 1000)); // (the DEV 'countdown' demo holds it: never above 5)
        if (s !== countLast) { countLast = s; hud.countdown(String(s)); beep(); }
        if (halo.visible) (halo.visible = false), (pick = NO_PICK);
      } else if (phase === 'match' && match) {
        if (briefFor !== match.id) { startBrief(); hud.countdown(countLast > 0 ? 'BẮT ĐẦU!' : null); countLast = -1; setTimeout(() => { if (briefFor === match?.id) hud.countdown(null); }, 900); }
        const c = countdown(match.endsAt, Date.now(), offset, C.warnMs);
        if (c.second !== lastSecond) { lastSecond = c.second; hud.clock(c.text, c.warn); if (c.warn && c.second > 0 && c.second <= C.warnMs / 1000) beep(); }
        updatePick(now, t);
        const go = atCheckout();
        hud.label(go ? CHECKOUT_TEXT : pick.id ? '[F]' : null, go);
      } else if (halo.visible) (halo.visible = false), (pick = NO_PICK);
    },
    interact,
    setProgress: () => {},
    setExit: (on) => exit.set(on), // lit once the step is done (a win: main.ts 'exitReady')
    setLocked: () => {},
    exitHit: () => { const f = feet(); return exit.hit(f.x, f.z); },
    overlayOpen: () => !!result || !!hud?.bagOpen || hud?.zoom != null || !!hud?.rulesOpen,
    frozen: () => locked || !!result || inCountdown(),
    settled: () => frames >= 3 && (VIEWER || (gotState && (cq?.ready?.() ?? true))),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      if (!VIEWER) removeEventListener('keydown', onKey);
      if (cq) { cq.send({ t: 'cq.leave' }); cq.onMessage = null; }
      hud?.dispose();
      (halo.material as THREE.Material).dispose();
      takenMat.dispose();
      board.dispose();
      setDoor(false);
      for (const c of colliders) o.world!.removeCollider(c, false);
      o.autostep?.(null);
      store.dispose();
      scene.remove(g);
      scene.background = was.background;
      scene.fog = was.fog;
      renderer.toneMappingExposure = was.exposure;
    },
  };
}
