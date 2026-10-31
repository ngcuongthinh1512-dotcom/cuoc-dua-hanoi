// "Phòng trưng bày GardeRobe MannekenPis" — the ground floor of the small costume museum at Rue du Chêne 19 as a self-contained
// Three.js interior: cream-stone shopfront with two big street windows and a dark-grey door (+z, the entrance), dark walls,
// black glass cabinets full of small costumed figurines, track spots, dark parquet, a staircase up at the back right.
// Centrepiece: three tall glass vitrines on plinths in a shallow arc, each holding one of the three costume photos
// (public/garderobe/costume-a..c, the original files, shown whole at their native aspect, unlit MeshBasicMaterial so the
// colours stay exact). No origin / caption anywhere: the plaques say only 1–3 (the T1 "Tủ đồ" challenge, answered on the
// normal clue card). `mountRoom(opts)` (rooms/types.ts) builds the room as ONE group in room-local metres (door at +z =
// DOOR_Z, rooms/roomFrame.ts) into the given scene; the dev page (garderobe.ts) adds its own walker / camera / composer, the
// race (main.ts) walks the game's body on colliders put into the game's Rapier world, `rooms.below` m under the box the team
// opened (route L3B), the other teams in the room through the normal poses. No tally, no mini-game, no `race room`.
// Close-up: F within reach of a vitrine ("Bấm F để xem gần") glides the camera to a pose that shows the whole photo
// undistorted; Esc / F again glides back. The exit ring ("Ra khỏi phòng") beside the door lights once the step is done (dev page: always).
// Dev params (garderobe.ts): view=overview|plan|street / cam=x,y,z,yawDeg,pitchDeg (free camera) · n=1..3 / close=1..3
// (that vitrine's close-up at load) · hq=1 (shadows, bloom, every spot) · avatar=0|1, autoMove=walk|sprint. The race reads
// `close` only in the offline ?roomDemo= (screenshots).
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, PHOTOS, type Slot, cabinetSlots, figurineGeometry, figurineSlots, focusPose, printSize, slotLocal, stairGeometry, stairTop, vitrineGeometry, vitrineSlots } from './garderobeBuild.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import { type Box, createRoomPlayer, nearestButton, shellBoxes, slotBox } from '../rooms/roomPlayer.ts';
import type { RoomHandle, RoomMountOptions } from '../rooms/types.ts';

export const PROMPT = 'Bấm F để xem gần', BACK = 'Esc / F để quay lại';
/** Room-local z of the door end (rooms/roomFrame.ts: the box stands here; the street is beyond it). */
export const DOOR_Z = G.halfL;
/** The exit ring on the door half of the room, left of the aisle between the left cabinets and vitrine 1 (the body enters at
 *  (0, DOOR_Z − rooms.enterInset) facing −z and sees it ahead-left; 3.8 m off: never hit on entering). */
export const EXIT = { x: -3.3, z: 2.8, r: 0.6 };
const GLIDE_MS = 900, REACH = 1.7;

// ---- procedural textures (module level: one page lifetime, shared by every mount; never disposed) -----------------------
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function canvasTex(w: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, rep = 1, h = w): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const parquetTex = canvasTex(512, (c, s) => { // dark oak strip parquet
  c.fillStyle = '#4a2f1b';
  c.fillRect(0, 0, s, s);
  const W = s / 8, L = s / 2;
  for (let i = 0; i < 8; i++) for (let j = -1; j < 3; j++) {
    const x = j * L + (i % 2) * L / 2, y = i * W, b = 60 + rnd() * 30;
    c.fillStyle = `rgb(${b + 10},${b * 0.62},${b * 0.38})`;
    c.fillRect(x, y, L - 2, W - 2);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x, y + W * (k + 0.5) / 3); c.lineTo(x + L, y + W * (k + 0.5) / 3 + (rnd() - 0.5) * 4); c.stroke(); }
  }
}, 6);
const noiseTex = (base: string, cloud: string, n = 20) => canvasTex(512, (c, s) => {
  c.fillStyle = base;
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { const x = rnd() * s, y = rnd() * s, r = s * (0.1 + 0.25 * rnd()), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${cloud},0.1)`); g.addColorStop(1, `rgba(${cloud},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let i = 0; i < 6000; i++) { const v = 100 + rnd() * 155; c.fillStyle = `rgba(${v},${v},${v},0.06)`; c.fillRect(rnd() * s, rnd() * s, 2, 2); }
}, 2);
const stoneTex = canvasTex(512, (c, s) => { // cream ashlar with joints
  c.fillStyle = '#d9cdb4';
  c.fillRect(0, 0, s, s);
  for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) { const x = k * s / 2 + (r % 2) * s / 4, y = r * s / 4, v = 205 + rnd() * 25; c.fillStyle = `rgb(${v + 10},${v - 2},${v - 25})`; c.fillRect(x + 2, y + 2, s / 2 - 4, s / 4 - 4); }
}, 2);
const skyTex = canvasTex(64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6a9bd8'); g.addColorStop(0.5, '#b7d0ea'); g.addColorStop(1, '#e6ebee'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 1, 256);
const facadeTex = canvasTex(1024, (c, w, h) => { // the houses across the street: cream / grey facades with window grids
  c.fillStyle = '#cfc3ab';
  c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 256) { c.fillStyle = ['#cfc3ab', '#b8a98c', '#d8d2c4', '#a89c88'][(x / 256) % 4]!; c.fillRect(x, 0, 256, h); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { c.fillStyle = '#3a4048'; c.fillRect(x + 30 + k * 76, 40 + r * 110, 46, 80); c.fillStyle = '#e8e3d8'; c.fillRect(x + 24, 124 + r * 110, 208, 6); } }
}, 1, 512);
const signTex = canvasTex(2048, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#1f1f1f'; c.font = '600 118px "Futura", "Avenir Next", "Helvetica Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('GARDEROBE  MANNEKENPIS', w / 2, h / 2); }, 1, 256);
signTex.wrapS = signTex.wrapT = THREE.ClampToEdgeWrapping;
const numberTex = (n: number) => canvasTex(128, (c, w, h) => { c.fillStyle = '#b48a3c'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a1e0a'; c.font = 'bold 60px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2, h / 2 + 2); c.strokeStyle = '#2a1e0a'; c.lineWidth = 3; c.strokeRect(5, 5, w - 10, h - 10); }, 1, 80);

// ---- materials -----------------------------------------------------------------------------------------------------
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const wallMap = noiseTex('#3b3b3e', '80,80,90');
wallMap.repeat.set(3, 1.5);
const M = {
  parquet: std({ map: parquetTex, roughness: 0.4, metalness: 0.05 }),
  wall: std({ map: wallMap, side: THREE.DoubleSide }),
  ceiling: std({ color: '#2a2a2c', roughness: 1 }),
  stone: std({ map: stoneTex, roughness: 0.8 }),
  black: std({ color: '#141416', roughness: 0.55, metalness: 0.1 }),
  lacquer: std({ color: '#1a1a1d', roughness: 0.3, metalness: 0.15 }),
  brass: std({ color: '#c9a04a', metalness: 0.9, roughness: 0.3 }),
  darkWood: std({ color: '#3a2616', roughness: 0.55 }),
  doorGrey: std({ color: '#3d4043', roughness: 0.5, metalness: 0.2 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#e8f2ff', transparent: true, opacity: 0.09, roughness: 0.03, metalness: 0, clearcoat: 1, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
  windowGlass: new THREE.MeshPhysicalMaterial({ color: '#dbe8f5', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
  sky: new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide }),
  facade: new THREE.MeshBasicMaterial({ map: facadeTex }),
  cobble: std({ map: noiseTex('#6d6a66', '40,40,45', 40), roughness: 1 }),
  led: std({ color: '#fff4e0', emissive: '#ffe9c0', emissiveIntensity: 2.2 }),
  spotBody: std({ color: '#111', roughness: 0.5, metalness: 0.4 }),
  bronze: std({ color: '#2a2219', metalness: 0.75, roughness: 0.4 }),
  cloth: std({ color: '#ffffff', roughness: 0.9 }),
  sign: new THREE.MeshBasicMaterial({ map: signTex, transparent: true }),
  matBoard: std({ color: '#f4f1ea', roughness: 0.95 }),
  plaque: [1, 2, 3, 4].map((n) => std({ map: numberTex(n), roughness: 0.5, metalness: 0.5 })),
};
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const slotMatrix = (s: Slot, scale = 1) => new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(scale, scale, scale));
const PROMPT_HTML = `<style>
#gr-prompt { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); padding: 6px 16px; border-radius: 8px; background: rgba(0,0,0,.55); color: #fff; font: 600 18px system-ui, sans-serif; text-shadow: 0 1px 2px #000; pointer-events: none; white-space: nowrap; transition: bottom .3s; }
#gr-prompt.close { bottom: 6%; }
#gr-help { position: fixed; left: 14px; bottom: 12px; color: #d8d2c4; font: 12px system-ui, sans-serif; opacity: .75; pointer-events: none; }
</style><div id="gr-prompt" hidden></div><div id="gr-help"></div>`;

interface Vitrine { n: number; slot: Slot; frame: THREE.MeshStandardMaterial; aspect: number }

export async function mountRoom(o: RoomMountOptions): Promise<RoomHandle> {
  const { renderer, scene, frame } = o;
  const RACE = !!o.world || !!o.viewer; // the race (colliders) or a watching spectator (drawn only)
  const HQ = !!o.hq;
  const q = RACE ? new URLSearchParams(o.q.get('roomDemo') === 'garderobe' ? { close: o.q.get('close') ?? '' } : {}) : o.q; // the race reads none of the dev params (screenshots: `close`)
  const PLAN = q.get('view') === 'plan';
  // the scene's look while the room is up (restored on dispose)
  const was = { exposure: renderer.toneMappingExposure, background: scene.background, fog: scene.fog, environment: scene.environment, envIntensity: scene.environmentIntensity, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled };
  renderer.toneMappingExposure = 0.95;
  scene.background = new THREE.Color('#b7d0ea');
  scene.fog = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const g = new THREE.Group();
  g.name = 'room';
  const gp = groupPose(frame);
  g.position.set(gp.x, gp.y, gp.z);
  g.rotation.y = gp.yaw;
  scene.add(g);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = g) => { const mesh = new THREE.Mesh(geo, m); parent.add(mesh); return mesh; };
  const merged = (parts: THREE.BufferGeometry[], m: THREE.Material) => add(mergeGeometries(parts, false)!, m);
  const shadow = <T extends THREE.Object3D>(m: T, cast = true, receive = false): T => { if (HQ) (m.castShadow = cast), (m.receiveShadow = receive); return m; };
  const overhead: THREE.Object3D[] = []; // hidden in the plan view
  const brassParts: THREE.BufferGeometry[] = []; // door handles, stair rail, vitrine plates: one draw call

  // ---- shell: floor, ceiling + track spots, dark walls, cream shopfront with windows / door / sign, the street outside -----
  const { halfW, halfL, wallH } = G;
  shadow(add(new THREE.PlaneGeometry(2 * halfW, 2 * halfL).rotateX(-Math.PI / 2), M.parquet), false, true);
  overhead.push(add(new THREE.PlaneGeometry(2 * halfW, 2 * halfL).rotateX(Math.PI / 2).translate(0, wallH, 0), M.ceiling));
  shadow(merged([box(0.02, wallH, 2 * halfL, -halfW, wallH / 2, 0), box(0.02, wallH, 2 * halfL, halfW, wallH / 2, 0), box(2 * halfW, wallH, 0.02, 0, wallH / 2, -halfL)], M.wall), false, true);
  merged([box(2 * halfW, 0.12, 0.02, 0, 0.06, -halfL + 0.01), box(0.02, 0.12, 2 * halfL, -halfW + 0.01, 0.06, 0), box(0.02, 0.12, 2 * halfL, halfW - 0.01, 0.06, 0)], M.black); // skirting
  { // ceiling tracks with spot fixtures
    const rails: THREE.BufferGeometry[] = [], fixtures: THREE.BufferGeometry[] = [];
    for (const x of [-2.6, 0, 2.6]) { rails.push(box(0.06, 0.05, 2 * halfL - 1, x, wallH - 0.025, 0)); for (const z of [-6, -3, 0, 3, 6]) fixtures.push(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 12).translate(x, wallH - 0.14, z), new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6).translate(x, wallH - 0.06, z)); }
    overhead.push(merged(rails, M.black), merged(fixtures, M.spotBody));
  }
  { // shopfront (+z): cream stone piers / fascia / sill strips, glass, the door, the fascia sign outside, window platforms inside
    const { x0, x1, y0, y1 } = G.window, { hw, h } = G.door, zc = halfL + 0.15, stone: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    stone.push(box(halfW - x1, wallH, 0.3, -(halfW + x1) / 2, wallH / 2, zc), box(halfW - x1, wallH, 0.3, (halfW + x1) / 2, wallH / 2, zc)); // outer piers
    stone.push(box(x0 - hw, wallH, 0.3, -(x0 + hw) / 2, wallH / 2, zc), box(x0 - hw, wallH, 0.3, (x0 + hw) / 2, wallH / 2, zc)); // piers beside the door
    stone.push(box(2 * halfW, wallH - y1, 0.3, 0, (wallH + y1) / 2, zc)); // fascia
    for (const s of [-1, 1]) stone.push(box(x1 - x0, y0, 0.3, s * (x0 + x1) / 2, y0 / 2, zc), box(x1 - x0 + 0.2, 0.08, 0.5, s * (x0 + x1) / 2, y0 + 0.04, zc)); // under-sill strips, sills
    shadow(merged(stone, M.stone), false, true);
    for (const s of [-1, 1]) glass.push(box(x1 - x0, y1 - y0, 0.02, s * (x0 + x1) / 2, (y0 + y1) / 2, halfL + 0.05));
    glass.push(box(2 * hw, y1 - h, 0.02, 0, (y1 + h) / 2, halfL + 0.05)); // fanlight over the door
    glass.push(box(2 * hw - 0.4, h - 1.35, 0.02, 0, 0.95 + (h - 1.35) / 2, halfL + 0.05)); // the door's glazed panel
    merged(glass, M.windowGlass);
    const frames: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) frames.push(box(x1 - x0 + 0.06, 0.06, 0.08, s * (x0 + x1) / 2, y1 + 0.03, halfL + 0.05), box(0.06, y1 - y0, 0.08, s * x0, (y0 + y1) / 2, halfL + 0.05), box(0.06, y1 - y0, 0.08, s * x1, (y0 + y1) / 2, halfL + 0.05)); // black window frames
    frames.push(box(0.08, h + 0.08, 0.08, -hw - 0.04, h / 2, halfL + 0.05), box(0.08, h + 0.08, 0.08, hw + 0.04, h / 2, halfL + 0.05), box(2 * hw + 0.16, 0.08, 0.08, 0, h + 0.04, halfL + 0.05), box(2 * hw + 0.16, 0.06, 0.08, 0, y1, halfL + 0.05)); // door jambs, head, fanlight bar
    merged(frames, M.black);
    merged([box(2 * hw, 0.4, 0.06, 0, h - 0.2, halfL + 0.05), box(2 * hw, 0.95, 0.06, 0, 0.475, halfL + 0.05), box(0.2, h, 0.06, -hw + 0.1, h / 2, halfL + 0.05), box(0.2, h, 0.06, hw - 0.1, h / 2, halfL + 0.05)], M.doorGrey); // the door: rails + stiles around a glazed panel
    brassParts.push(new THREE.SphereGeometry(0.03, 10, 8).translate(hw - 0.15, 1.05, halfL + 0.1), new THREE.SphereGeometry(0.03, 10, 8).translate(hw - 0.15, 1.05, halfL)); // handles
    add(new THREE.PlaneGeometry(9, 1.1).translate(0, y1 + 0.35, halfL + 0.31), M.sign); // fascia sign, seen from the street
    const platforms: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) platforms.push(box(x1 - x0 - 0.2, 0.4, 0.9, s * (x0 + x1) / 2, 0.65, halfL - 0.65)); // window display platforms
    shadow(merged(platforms, M.darkWood));
    // the street: pavement, the houses opposite, sky
    add(new THREE.PlaneGeometry(40, 12).rotateX(-Math.PI / 2).translate(0, 0, halfL + 6), M.cobble);
    add(new THREE.PlaneGeometry(40, 20).translate(0, 10, halfL + 12).rotateY(Math.PI), M.facade);
    add(new THREE.SphereGeometry(70, 24, 12), M.sky);
  }
  { // wall cabinets: black lacquered boxes with shelves, LED strip, glass front; the back wall one is 7.8 m wide
    const body: THREE.BufferGeometry[] = [], shelves: THREE.BufferGeometry[] = [], leds: THREE.BufferGeometry[] = [], fronts: THREE.BufferGeometry[] = [];
    const { d, h, y0, shelfDy } = G.cabinet;
    for (const c of cabinetSlots()) {
      const m = slotMatrix(c), t = (geo: THREE.BufferGeometry) => geo.applyMatrix4(m);
      body.push(t(box(c.w, 0.04, d, 0, y0 + h, 0)), t(box(c.w, y0, d, 0, y0 / 2, 0)), t(box(c.w, h, 0.03, 0, y0 + h / 2, -d / 2 + 0.015)), t(box(0.04, h, d, -c.w / 2 + 0.02, y0 + h / 2, 0)), t(box(0.04, h, d, c.w / 2 - 0.02, y0 + h / 2, 0)));
      for (let s = 1; s < c.shelves; s++) shelves.push(t(box(c.w - 0.08, 0.025, d - 0.1, 0, y0 + s * shelfDy, -0.02)));
      for (let s = 0; s < c.shelves; s++) leds.push(t(box(c.w - 0.1, 0.02, 0.03, 0, y0 + (s + 1) * shelfDy - 0.04, d / 2 - 0.08)));
      fronts.push(t(box(c.w - 0.08, h, 0.01, 0, y0 + h / 2, d / 2 - 0.01)));
    }
    shadow(merged(body, M.lacquer));
    merged(shelves, M.black);
    merged(leds, M.led);
    merged(fronts, M.glass).renderOrder = 5;
  }
  { // small figurines in the cabinets + the window displays: instanced bronze bodies + tinted tunics / hats
    const slots = figurineSlots(), fg = figurineGeometry(!HQ), PAL = ['#c2352c', '#2f52b8', '#2b9a6a', '#e59ac6', '#f0c22b', '#f5f0e6', '#7a3b1e', '#5aa0e8', '#f07a1a', '#6e9a2a', '#8a3fb3', '#9ad0e8', '#1e1e22', '#d9b36a'];
    for (const [geo, mat, tint] of [[fg.bronze, M.bronze, false], [fg.cloth, M.cloth, true]] as const) {
      const im = new THREE.InstancedMesh(geo, mat, slots.length);
      slots.forEach((s, i) => { im.setMatrixAt(i, slotMatrix(s, s.scale)); if (tint) im.setColorAt(i, new THREE.Color(PAL[(s.tint * 7 + Math.floor(s.tint / 15)) % PAL.length])); });
      g.add(shadow(im));
    }
  }
  { // staircase up along the right wall at the back: dark wooden steps, brass handrail on iron balusters, a dark opening above
    shadow(add(stairGeometry(), M.darkWood));
    const { x, w, z0, steps, rise, run } = G.stair, bal: THREE.BufferGeometry[] = [];
    const a = new THREE.Vector3(x - w / 2 + 0.04, 0.95, z0), b = new THREE.Vector3(x - w / 2 + 0.04, 0.95 + rise * steps, z0 - run * steps);
    brassParts.push(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 10).rotateX(Math.PI / 2).applyMatrix4(new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)).setPosition(a.clone().add(b).multiplyScalar(0.5))));
    for (let i = 0; i < steps; i += 2) bal.push(box(0.025, 0.95, 0.025, a.x, rise * (i + 1) + 0.47, z0 - run * (i + 0.5)));
    merged(bal, M.black);
    const top = stairTop();
    add(box(w, 2.0, 0.6, top.x, top.y + 1.0, -halfL + 0.3), M.black); // the stairwell opening in the back wall
    add(box(0.3, wallH, 0.6, top.x - w / 2 - 0.15, wallH / 2, -halfL + 0.3), M.wall);
  }

  // ---- the three photo vitrines: plinth + brass + numbered plaque + print panel (unlit, exact colours) + glass + spot --------
  const vit = vitrineGeometry();
  const vitrines: Vitrine[] = [];
  const loader = new THREE.TextureLoader();
  const loaded: Promise<void>[] = [];
  const plinths: THREE.BufferGeometry[] = [], glasses: THREE.BufferGeometry[] = [];
  for (const s of vitrineSlots()) {
    const m = slotMatrix(s), frameMat = M.lacquer.clone();
    plinths.push(vit.plinth.clone().applyMatrix4(m));
    brassParts.push(vit.brass.clone().applyMatrix4(m), box(0.5, 0.08, 0.2, 0, G.vitrine.plinthH + 0.04, 0).applyMatrix4(m)); // plate + the print's foot
    shadow(add(vit.frame, frameMat)).applyMatrix4(m);
    const plaque = add(new THREE.PlaneGeometry(0.15, 0.09), M.plaque[s.n - 1]!);
    plaque.position.copy(slotLocal(s, 0, G.vitrine.plinthH - 0.3, G.vitrine.d / 2 + 0.007));
    plaque.rotation.y = s.yaw;
    glasses.push(box(G.vitrine.w - 0.06, G.vitrine.glassH - 0.06, G.vitrine.d - 0.06, 0, G.vitrine.plinthH + G.vitrine.glassH / 2, 0).applyMatrix4(m));
    // the print: an unlit plane (MeshBasicMaterial, toneMapped off, sRGB) sized to the image's native aspect once it loads,
    // on a white mat board in a thin black frame
    const print = add(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false }));
    const board = add(box(1, 1, 0.03), M.matBoard), pframe = add(box(1, 1, 0.025), M.black);
    const v: Vitrine = { n: s.n, slot: s, frame: frameMat, aspect: 385 / 565 };
    vitrines.push(v);
    loaded.push(new Promise((res) => loader.load(`/garderobe/${PHOTOS[s.n - 1]}`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 16;
      v.aspect = tex.image.width / tex.image.height;
      const p = printSize(v.aspect);
      Object.assign(print.material as THREE.MeshBasicMaterial, { map: tex, needsUpdate: true });
      (print.material as THREE.MeshBasicMaterial).color.set('#fff');
      print.scale.set(p.w, p.h, 1);
      board.scale.set(p.w + 0.1, p.h + 0.1, 1);
      pframe.scale.set(p.w + 0.16, p.h + 0.16, 1);
      for (const [ob, dz] of [[print, 0.03], [board, 0.012], [pframe, 0]] as const) { ob.position.copy(slotLocal(s, 0, p.y, dz)); ob.rotation.y = s.yaw; }
      res();
    }, undefined, () => res()))); // a missing photo: the black panel stays (never blocks __READY__)
    if (HQ) {
      const sp = new THREE.SpotLight('#fff1d8', 30, 5, 0.6, 0.5, 1.4);
      sp.position.copy(slotLocal(s, 0, G.vitrine.plinthH + G.vitrine.glassH + 0.02, 0.2));
      sp.target.position.copy(slotLocal(s, 0, G.vitrine.plinthH, 0.1));
      sp.castShadow = true;
      sp.shadow.mapSize.set(1024, 1024);
      sp.shadow.bias = -0.0005;
      g.add(sp, sp.target);
    }
  }
  shadow(merged(plinths, M.lacquer), true, true);
  merged(brassParts, M.brass);
  merged(glasses, M.glass).renderOrder = 10;

  // ---- lights: minimal = hemisphere + daylight through the shopfront + one warm point over the vitrines; hq = shadows,
  // a spot per vitrine (above) and per cabinet ----------------------------------------------------------------------------
  g.add(new THREE.HemisphereLight('#8c94a4', '#2a2420', HQ ? 0.4 : 1.0));
  const sun = new THREE.DirectionalLight('#eef3ff', HQ ? 1.4 : 1.2);
  sun.position.set(3, 7, 18);
  sun.target.position.set(0, 0, 0);
  if (HQ) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -6, near: 2, far: 40 });
    sun.shadow.bias = -0.0005;
  }
  g.add(sun, sun.target);
  if (HQ) for (const c of cabinetSlots()) {
    const sp = new THREE.SpotLight('#ffe4bd', 18, 7, 0.55, 0.6, 1.4);
    sp.position.copy(slotLocal(c, 0, wallH - 0.2, 1.6));
    sp.target.position.copy(slotLocal(c, 0, 1.4, 0));
    g.add(sp, sp.target);
  } else {
    const pt = new THREE.PointLight('#fff1d8', 24, 12, 2);
    pt.position.set(0, 3.4, 1.5);
    g.add(pt);
  }
  // the exit portal beside the door: in the race it lights only once the step is done (main.ts setExit); the dev page keeps it lit
  const exit = makeExitRing(g, EXIT.x, EXIT.z, wallH - 0.5, EXIT.r);
  exit.set(!RACE);

  // ---- prompt DOM, the walker (race: the game's body; dev: a RoomPlayer), the close-up glide ----------------------------
  const dom = document.createElement('div');
  dom.innerHTML = PROMPT_HTML;
  document.body.append(dom);
  const promptEl = dom.querySelector<HTMLElement>('#gr-prompt')!, help = dom.querySelector<HTMLElement>('#gr-help')!;
  help.hidden = RACE;
  const buttons = vitrines.map((v) => { const p = slotLocal(v.slot, 0, 0, G.vitrine.d / 2 + 0.7); return { slot: v.n, x: p.x, y: 0, z: p.z, active: true }; });
  // ponytail: collision = room shell + the vitrines, cabinets, window platforms and a block for the stair (no climbing)
  const boxes: Box[] = [
    ...shellBoxes(-halfW, halfW, -halfL, halfL, wallH),
    ...vitrineSlots().map((s) => slotBox(s, { x: 0, y: 1.4, z: 0, hx: G.vitrine.w / 2 + 0.04, hy: 1.4, hz: G.vitrine.d / 2 + 0.04 })),
    ...cabinetSlots().map((c) => slotBox(c, { x: 0, y: 1.5, z: 0, hx: c.w / 2, hy: 1.5, hz: G.cabinet.d / 2 })),
    ...[-1, 1].map((s) => ({ x: s * (G.window.x0 + G.window.x1) / 2, y: 0.45, z: halfL - 0.65, hx: (G.window.x1 - G.window.x0) / 2, hy: 0.45, hz: 0.45 })),
    { x: G.stair.x, y: 1.5, z: G.stair.z0 - (G.stair.run * G.stair.steps + 1) / 2, hx: G.stair.w / 2, hy: 1.5, hz: (G.stair.run * G.stair.steps + 1) / 2 },
  ];
  const colliders: RAPIER.Collider[] = [];
  if (o.world) for (const b of boxes) { // the race: into the game's physics, at the frame
    const p = toWorld(frame, b.x, b.z), yaw = (b.yaw ?? 0) + frame.yaw;
    colliders.push(o.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(p.x, frame.floorY + b.y, p.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })));
  }
  let focused: Vitrine | null = null, lastFocus: Vitrine | null = null, blend = 0; // blend 0 = the walker's camera, 1 = the close-up; glides between
  const frozen = () => !!focused || !!o.frozen?.();
  const camera = o.camera ?? new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 150);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const walk = RACE
    ? undefined
    : await createRoomPlayer({
        scene, camera, canvas: renderer.domElement, q, buttons, boxes, reach: REACH, prompt: PROMPT,
        spawn: { x: 0, z: halfL - 2.2, yaw: 0 },
        frozen, onPress: (n) => focus(n),
        onFly: (flying) => { if (flying) euler.setFromQuaternion(camera.quaternion, 'YXZ'); },
      });
  const feet = () => (walk ? { x: walk.position.x, z: walk.position.z } : toLocal(frame, o.feet!().x, o.feet!().z));
  const near = () => (walk?.flying ? null : nearestButton(feet().x, feet().z, buttons, REACH));
  const closeUp = (v: Vitrine): [THREE.Vector3, THREE.Vector3] => { const [from, to] = focusPose(v.slot, v.aspect, camera.fov, camera.aspect); return [g.localToWorld(from), g.localToWorld(to)]; };
  function focus(n: number) {
    const v = vitrines[n - 1];
    if (!v || focused) return;
    focused = lastFocus = v;
    document.exitPointerLock();
    keys.clear();
  }
  let resetAt = -Infinity;
  function reset() {
    if (!focused) return;
    focused = null;
    resetAt = performance.now();
    o.onClose?.();
  }
  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    if (focused) { if (e.code === 'Escape' || e.code === 'KeyF') reset(); return; }
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onClick = () => { if (walk?.flying && !focused) renderer.domElement.requestPointerLock(); };
  const onMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== renderer.domElement || !walk?.flying) return;
    euler.y -= e.movementX * 0.0022;
    euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.0022, -1.5, 1.5);
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  let composer: EffectComposer | null = null;
  if (!RACE) {
    renderer.shadowMap.enabled = HQ;
    renderer.setPixelRatio(HQ ? Math.min(devicePixelRatio, 1.5) : 1);
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = { overview: [v3(-0.6, 1.75, 7.2), v3(0.2, 1.5, -1.5)], plan: [v3(0, 14, 0), v3(0, 0, 0)], street: [v3(1.5, 1.7, 13.5), v3(0, 2.0, 8)] };
    const [from, to] = VIEWS[q.get('view') ?? ''] ?? VIEWS.overview!;
    camera.position.copy(from);
    camera.lookAt(to);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    if (PLAN) { // straight down, the room's long axis across the screen, ceiling / tracks hidden
      euler.set(-Math.PI / 2, 0, Math.PI / 2);
      camera.fov = 50;
      camera.updateProjectionMatrix();
      for (const ob of overhead) ob.visible = false;
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
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.5, 0.95));
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - 0.3 * smoothstep(0.4, 0.95, d); gl_FragColor = c; }',
      }));
    }
    renderer.domElement.addEventListener('click', onClick);
    addEventListener('mousemove', onMove);
    help.textContent = 'WASD đi · chuột nhìn quanh (nhấp để khoá) · Shift chạy · F cạnh tủ kính = xem gần, Esc / F quay lại · V bay tự do';
    Object.assign(window, { __GARDEROBE__: { focus: (n: number) => focus(n), reset: () => reset() } });
  } else renderer.setPixelRatio(1); // the race: minimal graphics inside (main.ts resize() keeps it while the room is up)
  const N = Number(q.get('close') || q.get('n')) || (q.get('view')?.startsWith('close') ? Number(q.get('view')!.slice(5)) : 0);
  let instant = false, photosReady = false;
  void Promise.all(loaded).then(() => { photosReady = true; if (N) focus(N), (instant = true); });
  function hover() {
    const n = near();
    for (const v of vitrines) { v.frame.emissive.set('#ffd080'); v.frame.emissiveIntensity = !focused && n?.slot === v.n ? 0.35 : 0; }
    if (!walk || focused) { // the race: the prompt (the dev walker draws its own while walking)
      const text = focused ? `Tủ kính ${focused.n} · ${BACK}` : n ? PROMPT : '';
      promptEl.hidden = !text || (!focused && !!o.frozen?.());
      promptEl.textContent = text;
      promptEl.classList.toggle('close', !!focused);
    }
  }

  const clock = new THREE.Clock();
  const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  let frames = 0;
  return {
    group: g,
    ceiling: wallH,
    player: walk,
    update(dt) {
      const v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 10 : 3.2) * dt;
      walk?.update(dt);
      if (walk?.flying && !focused) {
        camera.quaternion.setFromEuler(euler);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
        if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
        if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
        if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
        if (keys.has('KeyE')) camera.position.y += v;
        if (keys.has('KeyQ')) camera.position.y -= v;
      }
      // the close-up glide: the camera as the walker left it this frame → the pose that frames the whole photo (and back)
      const goal = focused ? 1 : 0;
      blend = instant ? goal : THREE.MathUtils.clamp(blend + (goal ? 1 : -1) * dt * 1000 / GLIDE_MS, 0, 1);
      instant = false;
      if (blend > 0) {
        const [from, to] = closeUp(lastFocus!); // returning: glide back from the same vitrine
        const e = blend < 0.5 ? 2 * blend * blend : 1 - (-2 * blend + 2) ** 2 / 2;
        p0.copy(camera.position);
        q0.copy(camera.quaternion);
        q1.setFromRotationMatrix(new THREE.Matrix4().lookAt(from, to, new THREE.Vector3(0, 1, 0)));
        camera.position.lerpVectors(p0, from, e);
        camera.quaternion.slerpQuaternions(q0, q1, e);
      }
      clock.getDelta();
      exit.update(clock.elapsedTime);
      hover();
      frames++;
    },
    interact() {
      if (focused) { reset(); return true; }
      const n = near();
      if (!n || o.frozen?.() || performance.now() - resetAt < 250) return false; // the F that just closed the close-up (onKey) reaches the game's Input a frame later: not a new one
      focus(n.slot);
      return true;
    },
    render() {
      if (RACE) return;
      if (composer && !focused) { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); } else { renderer.info.autoReset = true; renderer.render(scene, camera); }
    },
    resize() {
      if (RACE) return;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      composer?.setSize(innerWidth, innerHeight);
    },
    setProgress: () => {}, // no tally in this room
    setExit: (on: boolean) => exit.set(on), // the step done → lit (main.ts 'exitReady'); a Host undo puts it out again ('resume')
    setLocked: () => {},
    exitHit: () => { const f = feet(); return !focused && exit.hit(f.x, f.z); },
    overlayOpen: () => !!focused, // the close-up: the body stands still, the pointer is free, no menu on the lost lock
    settled: () => photosReady && frames >= 3 && blend === (focused ? 1 : 0),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      focused = null;
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
      // ponytail: per-mount geometries / photo textures are left to the GC (materials are module-level and shared)
    },
  };
}
