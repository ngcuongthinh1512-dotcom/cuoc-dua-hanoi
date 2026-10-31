// "Phòng hoà nhạc Henry Le Bœuf" (BOZAR) as a Leg 3 race room (rooms/types.ts `mountRoom`, the GardeRobe room's contract):
// the team opens the box at BOZAR, walks in at the back of the stalls (behind the last ground-floor row, facing the stage)
// and may walk the aisles freely — no mini-game, no table, no tally; the exit ring beside the entrance is lit all the time.
// The hall is hallScene.ts `buildHall` (shared with the dev page hall.ts): minimal graphics by default (no audience, no
// shadows / post, 7 lights), `hq` = the full dev look. Room-local metres = the hall's own (x across, stage at −z, the rear
// of the stalls at +z = the door end DOOR_Z, y 0 = the stalls floor at the stage front).
// Walking: a Rapier heightfield sampled from hallBuild `floorYAt` (the stepped terraces, 0.5 m cells), one thin cuboid per
// wall segment, one cuboid per run of ≤ 7 seats (no walking through the rows), and a 3 m block over the whole stage house
// (the stage is NOT climbable: the orchestra and the organ are scenery). The race puts them into the game's world at the
// frame; the dev page (hallRoomDev.ts) into the RoomPlayer's own world.
// Challenge 2 "chọn ghế": walking within SEAT_REACH m of a ground-floor seat (the nearest one, those in front of the camera
// first; every one of the 988 stalls seats counts, grey unsold ones too — the wheelchair squares are no seats) floats a small
// bobbing arrow over it + the prompt "Hàng J — Bấm F để chọn" (no seat number: the team counts); F (`interact()`) → `o.onSeat(label)` with hallBuild's
// `seatLabel` ("J-14", rear section "A2-12") and true. Right / wrong is the server's business (nothing changes in here).
// Clue pick-up (T3): main.ts `setPickup(prompt)` lights a gold ring + beam at PICKUP (the flat floor in front of row A,
// mid-hall); feet within PICKUP.r → the prompt, F → `o.onPickup()` and true (before any seat: row A is right there);
// `setPickup(null)` = off. Dev `?pickup=1` lights it; F without `onPickup` → a toast and off.
// Dev params (hallRoomDev.ts): walk mode by default (WASD, F = choose the seat: a toast when `onSeat` is absent) ·
// spawn=x,z,yawDeg · view=stalls|stage|exit|plan / cam=x,y,z,yawDeg,pitchDeg = free camera · hq=1 · avatar=0|1,
// autoMove=walk|sprint. The race reads none of them.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { H, type StallSeat, floorYAt, planPoints, seatLabel, stallsLayout, v3 } from './hallBuild.ts';
import { buildHall } from './hallScene.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { type RoomFrame, groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import { type Box, createRoomPlayer } from '../rooms/roomPlayer.ts';
import type { RoomHandle, RoomMountOptions } from '../rooms/types.ts';

/** Room-local z of the door end: just behind the rear wall's apex (H.zArc + H.rear = 28); the body enters at
 *  DOOR_Z − rooms.enterInset = (0, 26.3), in the rear centre aisle behind the last row, facing the stage. */
export const DOOR_Z = H.zArc + H.rear + 0.5;
/** The exit ring: on the last terrace, left of the rear centre aisle beside the entrance (5.4 m from the enter spot: never
 *  hit on entering; the body sees it over its left shoulder). */
export const EXIT = { x: -5.4, z: 26.6, r: 0.9 };
const HF = { cell: 0.5, x0: -H.halfW - 1, x1: H.halfW + 1, z0: H.zFront - 1, z1: H.zArc + H.rear + 1 };
export const SEAT_REACH = 2.0, PROMPT = 'Bấm F để chọn';
/** The clue pick-up spot (T3, `setPickup`): on the flat floor in front of row A, mid-hall (reached down the diagonal aisles or
 *  the wall corridor); warm gold, not the exit ring's cyan. */
export const PICKUP = { x: 0, z: -6.8, r: 2.5 };
/** A lit gold ring + light beam on the floor (the exit ring's language in another colour, no label). Hidden until `set`. */
function makePickupRing(parent: THREE.Object3D, x: number, z: number, h = 3.5, colour = '#ffc23c') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.visible = false;
  const mat = (opacity: number, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, ...extra });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40).rotateX(-Math.PI / 2).translate(0, 0.03, 0), mat(0.95));
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.7, 40).rotateX(-Math.PI / 2).translate(0, 0.025, 0), mat(0.4));
  const beamG = new THREE.CylinderGeometry(0.45, 0.9, h, 20, 1, true).translate(0, h / 2, 0), pos = beamG.getAttribute('position');
  beamG.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: pos.count }, (_, i) => [1, 1, 1, 0.8 * (1 - pos.getY(i) / h)]).flat(), 4));
  const beam = new THREE.Mesh(beamG, mat(1, { vertexColors: true }));
  const light = new THREE.PointLight(colour, 12, 8, 2);
  light.position.y = 1.2;
  g.add(ring, disc, beam, light);
  parent.add(g);
  return {
    set: (on: boolean) => { g.visible = on; },
    get on() { return g.visible; },
    update(t: number) { const k = 1 + 0.06 * Math.sin(t * 3); ring.scale.set(k, 1, k); (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 3); },
  };
}
export const seatPrompt = (s: StallSeat): string => `Hàng ${s.row}${s.rear ? '2' : ''} — ${PROMPT}`;
/** The seat to pick from (px, pz): the nearest within `r`, those in front (fx, fz = the look direction) before those behind. */
export function nearestSeat(px: number, pz: number, fx: number, fz: number, seats: readonly StallSeat[], r = SEAT_REACH): StallSeat | null {
  let best: StallSeat | null = null, score = Infinity;
  for (const s of seats) {
    const dx = s.x - px, dz = s.z - pz, d = Math.hypot(dx, dz);
    if (d > r) continue;
    const k = d * (dx * fx + dz * fz < 0 ? 1.6 : 1);
    if (k < score) [best, score] = [s, k];
  }
  return best;
}
const PROMPT_HTML = `<style>
#hr-prompt { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); padding: 6px 16px; border-radius: 8px; background: rgba(0,0,0,.55); color: #fff; font: 600 18px system-ui, sans-serif; text-shadow: 0 1px 2px #000; pointer-events: none; white-space: nowrap; }
#hr-toast { position: fixed; left: 50%; top: 14%; transform: translateX(-50%); padding: 8px 18px; border-radius: 8px; background: rgba(20,60,30,.8); color: #fff; font: 600 17px system-ui, sans-serif; pointer-events: none; transition: opacity .4s; }
#hr-help { position: fixed; left: 14px; bottom: 12px; color: #d8d2c4; font: 12px system-ui, sans-serif; opacity: .75; pointer-events: none; }
</style><div id="hr-prompt" hidden></div><div id="hr-toast" hidden></div><div id="hr-help" hidden></div>`;

/** Thin cuboids along the plan (walls) + the stage-house block + one cuboid per run of seats (rows are not walked through). */
export function hallBoxes(): Box[] {
  const out: Box[] = [];
  const wall = planPoints(0, 48, 8); // the plan runs counter-clockwise seen from above: the hall is on the right of each segment
  for (let i = 1; i < wall.length; i++) {
    const [ax, az] = wall[i - 1], [bx, bz] = wall[i], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len; // outward normal
    out.push({ x: (ax + bx) / 2 + 0.25 * nx, y: 10, z: (az + bz) / 2 + 0.25 * nz, hx: len / 2 + 0.1, hy: 10, hz: 0.25, yaw: Math.atan2(-(bz - az), bx - ax) }); // the inner face on the plan line
  }
  out.push({ x: 0, y: 1.5, z: (H.stage.back + H.zFront) / 2, hx: H.halfW, hy: 1.5, hz: (H.zFront - H.stage.back) / 2 }); // the stage house (not climbable)
  const runs = new Map<string, StallSeat[]>();
  for (const s of stallsLayout().seats) { const k = `${s.row}${s.rear ? '2' : ''}${s.block}`; (runs.get(k) ?? runs.set(k, []).get(k)!).push(s); }
  for (const seats of runs.values()) {
    seats.sort((p, q) => p.x - q.x);
    let run: StallSeat[] = [];
    const flush = () => {
      if (!run.length) return;
      const p = run[0], q = run[run.length - 1], len = Math.hypot(q.x - p.x, q.z - p.z) + 0.5, yaw = (p.yaw + q.yaw) / 2;
      // the block spans the row pitch (1.1 m: the back + the leg room in front, so rows touch and nothing wedges between them);
      // the front row A only its own seats (its tilted side blocks reach the stage: the 0.65 m gap there stays walkable)
      const front = !p.rear && p.row === 'A', shift = front ? 0 : 0.3, hz = front ? 0.33 : 0.55;
      out.push({ x: (p.x + q.x) / 2 - shift * Math.sin(yaw), y: p.y + 0.55, z: (p.z + q.z) / 2 - shift * Math.cos(yaw), hx: len / 2, hy: 0.55, hz, yaw: Math.atan2(-(q.z - p.z), q.x - p.x) });
      run = [];
    };
    for (const s of seats) { // a new run at the rear centre aisle (a gap wider than a seat pitch) and every 7 seats
      if (run.length && (Math.hypot(s.x - run[run.length - 1].x, s.z - run[run.length - 1].z) > 1.5 * H.stalls.seat || run.length === 7)) flush(); // ponytail: ≤ 7 seats per chord (sagitta < 0.1 m on the tightest row)
      run.push(s);
    }
    flush();
  }
  return out;
}
/** The stepped stalls floor as a Rapier heightfield (HF.cell m) placed at the frame. */
export function heightfieldDesc(frame: RoomFrame): RAPIER.ColliderDesc {
  const ncols = Math.round((HF.x1 - HF.x0) / HF.cell), nrows = Math.round((HF.z1 - HF.z0) / HF.cell), h = new Float32Array((ncols + 1) * (nrows + 1));
  for (let j = 0; j <= ncols; j++) for (let i = 0; i <= nrows; i++) h[j * (nrows + 1) + i] = floorYAt(HF.x0 + j * HF.cell, HF.z0 + i * HF.cell); // x → columns, z → rows (column-major)
  const p = toWorld(frame, (HF.x0 + HF.x1) / 2, (HF.z0 + HF.z1) / 2);
  return RAPIER.ColliderDesc.heightfield(nrows, ncols, h, { x: HF.x1 - HF.x0, y: 1, z: HF.z1 - HF.z0 }).setTranslation(p.x, frame.floorY, p.z).setRotation({ x: 0, y: Math.sin(frame.yaw / 2), z: 0, w: Math.cos(frame.yaw / 2) });
}

export async function mountRoom(o: RoomMountOptions): Promise<RoomHandle> {
  const { renderer, scene, frame } = o;
  const RACE = !!o.world;
  const HQ = !!o.hq;
  const q = RACE ? new URLSearchParams() : o.q; // the race reads none of the dev params
  const PLAN = q.get('view') === 'plan';
  // the scene's look while the room is up (restored on dispose)
  const was = { exposure: renderer.toneMappingExposure, background: scene.background, fog: scene.fog, environment: scene.environment, envIntensity: scene.environmentIntensity, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled };
  renderer.toneMappingExposure = 0.95;
  scene.background = new THREE.Color('#1a120c');
  scene.fog = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const g = new THREE.Group();
  g.name = 'room';
  const gp = groupPose(frame);
  g.position.set(gp.x, gp.y, gp.z);
  g.rotation.y = gp.yaw;
  scene.add(g);
  const { stalls } = buildHall(g, { hq: HQ, plan: PLAN });
  if (PLAN) g.traverse((ob) => { if (ob instanceof THREE.Mesh) { ob.geometry.computeBoundingBox(); if (ob.geometry.boundingBox!.min.y > 4.5) ob.visible = false; } });
  // the seat-pick arrow: one small emissive down-pointing arrow (cone + shaft), moved over the seat in reach, bobbing
  const arrow = new THREE.Mesh(
    mergeGeometries([new THREE.ConeGeometry(0.16, 0.3, 10).rotateX(Math.PI), new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).translate(0, 0.3, 0)], false)!,
    new THREE.MeshBasicMaterial({ color: '#ffd23c' }));
  arrow.visible = false;
  g.add(arrow);
  const dom = document.createElement('div');
  dom.innerHTML = PROMPT_HTML;
  document.body.append(dom);
  const promptEl = dom.querySelector<HTMLElement>('#hr-prompt')!, toastEl = dom.querySelector<HTMLElement>('#hr-toast')!, help = dom.querySelector<HTMLElement>('#hr-help')!;
  let toastAt = 0;
  const toast = (text: string) => { toastEl.textContent = text; toastEl.hidden = false; toastEl.style.opacity = '1'; toastAt = performance.now(); };
  // the exit portal beside the entrance, on the last terrace, lit all the time (the team may leave whenever it likes)
  const exitG = new THREE.Group();
  exitG.position.y = floorYAt(EXIT.x, EXIT.z);
  g.add(exitG);
  const exit = makeExitRing(exitG, EXIT.x, EXIT.z, 3.2, EXIT.r);
  exit.set(true);
  // the clue pick-up spot by the stage (main.ts `setPickup(prompt)` lights it after T2; dev `?pickup=1`)
  const pickup = makePickupRing(g, PICKUP.x, PICKUP.z);
  let pickupPrompt: string | null = null;
  const setPickup = (prompt: string | null) => { pickupPrompt = prompt; pickup.set(prompt !== null); };
  if (q.get('pickup') === '1') setPickup('Bấm F để nhận mật thư thử thách 3');

  // ---- colliders: the race → the game's world at the frame; the dev page → the RoomPlayer's own world ------------------
  const boxes = hallBoxes();
  const colliders: RAPIER.Collider[] = [];
  if (o.world) {
    for (const b of boxes) {
      const p = toWorld(frame, b.x, b.z), yaw = (b.yaw ?? 0) + frame.yaw;
      colliders.push(o.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(p.x, frame.floorY + b.y, p.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })));
    }
    colliders.push(o.world.createCollider(heightfieldDesc(frame)));
  }
  const frozen = () => !!o.frozen?.();
  const camera = o.camera ?? new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 150);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const walk = RACE
    ? undefined
    : await createRoomPlayer({
        scene, camera, canvas: renderer.domElement, q, buttons: [], boxes,
        spawn: (() => { const [x, z, yaw] = (q.get('spawn') ?? '').split(',').map(Number); return q.get('spawn') ? { x: x!, z: z!, yaw: THREE.MathUtils.degToRad(yaw || 0) } : { x: 0, z: DOOR_Z - 2.2, yaw: 0 }; })(),
        frozen, onPress: () => {},
        onFly: (flying) => { if (flying) euler.setFromQuaternion(camera.quaternion, 'YXZ'); },
      });
  if (walk) walk.controller.world.createCollider(heightfieldDesc(frame)); // the dev walker's world: the terraces (the spawn ray finds them)
  const feet = () => (walk ? { x: walk.position.x, z: walk.position.z } : toLocal(frame, o.feet!().x, o.feet!().z));
  const fwd = new THREE.Vector3();
  /** The seat in reach this frame (none while flying / frozen): nearest, the look direction (camera, room-local) first. */
  /** The pick-up spot is lit and the feet are within its reach (none while flying / frozen). */
  const atPickup = (): boolean => { if (pickupPrompt === null || walk?.flying || frozen()) return false; const f = feet(); return Math.hypot(f.x - PICKUP.x, f.z - PICKUP.z) <= PICKUP.r; };
  const near = (): StallSeat | null => {
    if (walk?.flying || frozen() || atPickup()) return null; // the pick-up spot wins over row A's seats beside it
    const f = feet();
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).applyAxisAngle(new THREE.Vector3(0, 1, 0), -frame.yaw);
    return nearestSeat(f.x, f.z, fwd.x, fwd.z, stalls.seats);
  };
  function interact(): boolean {
    if (atPickup()) {
      if (o.onPickup) o.onPickup();
      else if (!RACE) { toast('Đã nhận mật thư (dev)'); setPickup(null); }
      return true;
    }
    const s = near();
    if (!s) return false;
    const label = seatLabel(s);
    if (o.onSeat) o.onSeat(label);
    else if (!RACE) toast(`Đã chọn ghế ${label}`);
    return true;
  }
  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent) => { keys.add(e.code); if (e.code === 'KeyF' && !e.repeat) interact(); };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onClick = () => { if (walk?.flying) renderer.domElement.requestPointerLock(); };
  const onMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== renderer.domElement || !walk?.flying) return;
    euler.y -= e.movementX * 0.0022;
    euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.0022, -1.5, 1.5);
  };
  let composer: EffectComposer | null = null;
  if (!RACE) {
    renderer.shadowMap.enabled = HQ;
    renderer.setPixelRatio(HQ ? Math.min(devicePixelRatio, 1.5) : 1);
    const ey = floorYAt(EXIT.x, EXIT.z);
    const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
      stalls: [v3(0, 4.3, 15), v3(0, 12.5, -14)],
      stage: [v3(-1, 2.9, -6.5), v3(0.5, 10.5, 20)],
      exit: [v3(2.5, ey + 1.8, 23.5), v3(EXIT.x, ey + 1.2, EXIT.z)],
      plan: [v3(0, 19.5, 10), v3(0, 0, 10)],
    };
    const [from, to] = VIEWS[q.get('view') ?? ''] ?? VIEWS.stalls!;
    camera.position.copy(from);
    camera.lookAt(to);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    if (PLAN) { // straight down, the stage at the bottom like the seat map
      euler.set(-Math.PI / 2, Math.PI, 0);
      camera.fov = 100;
      camera.updateProjectionMatrix();
    }
    if (q.get('cam')) {
      const [x, y, z, yaw, pitch] = q.get('cam')!.split(',').map(Number);
      camera.position.set(x!, y!, z!);
      euler.set(THREE.MathUtils.degToRad(pitch!), THREE.MathUtils.degToRad(yaw!), 0);
    }
    if (HQ) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new OutputPass());
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.38, 0.45, 0.9));
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - 0.42 * smoothstep(0.3, 0.95, d); c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.97, 0.88), 0.45); gl_FragColor = c; }',
      }));
    }
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('click', onClick);
    addEventListener('mousemove', onMove);
    help.hidden = false;
    help.textContent = 'WASD đi · chuột nhìn quanh (nhấp để khoá) · Shift chạy · F cạnh ghế = chọn ghế · vòng sáng cạnh lối vào = ra khỏi phòng · V bay tự do';
  } else renderer.setPixelRatio(1); // the race: minimal graphics inside (main.ts resize() keeps it while the room is up)

  const clock = new THREE.Clock();
  let frames = 0;
  return {
    group: g,
    ceiling: H.ceilY,
    player: walk,
    update(dt) {
      const v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 4) * dt;
      walk?.update(dt);
      if (walk?.flying) {
        camera.quaternion.setFromEuler(euler);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
        if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
        if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
        if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
        if (keys.has('KeyE')) camera.position.y += v;
        if (keys.has('KeyQ')) camera.position.y -= v;
      }
      clock.getDelta();
      const t = clock.elapsedTime;
      exit.update(t);
      pickup.update(t);
      const s = near(), pick = atPickup();
      arrow.visible = !!s;
      if (s) arrow.position.set(s.x, s.y + 1.45 + 0.08 * Math.sin(t * 4), s.z);
      promptEl.hidden = !s && !pick;
      if (pick) promptEl.textContent = pickupPrompt!;
      else if (s) promptEl.textContent = seatPrompt(s);
      if (!toastEl.hidden && performance.now() - toastAt > 2200) { toastEl.style.opacity = '0'; if (performance.now() - toastAt > 2700) toastEl.hidden = true; }
      frames++;
    },
    interact,
    render() {
      if (RACE) return;
      if (composer) { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); } else { renderer.info.autoReset = true; renderer.render(scene, camera); }
    },
    resize() {
      if (RACE) return;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      composer?.setSize(innerWidth, innerHeight);
    },
    setProgress: () => {}, // no tally in this room
    setExit: () => {}, // the ring is always lit
    setLocked: () => {},
    setPickup,
    exitHit: () => { const f = feet(); return exit.hit(f.x, f.z); },
    overlayOpen: () => false,
    settled: () => frames >= 3 && (!walk || walk.flying || walk.controller.placed),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('click', onClick);
      walk?.dispose();
      dom.remove();
      composer?.dispose();
      pmrem.dispose();
      for (const c of colliders) o.world!.removeCollider(c, false);
      scene.remove(g);
      renderer.toneMappingExposure = was.exposure;
      renderer.setPixelRatio(was.pixelRatio);
      renderer.shadowMap.enabled = was.shadows;
      scene.background = was.background;
      scene.fog = was.fog;
      scene.environment = was.environment;
      scene.environmentIntensity = was.envIntensity;
      renderer.info.autoReset = true;
      // ponytail: per-mount geometries are left to the GC (materials / textures are module-level in hallScene.ts, shared)
    },
  };
}
