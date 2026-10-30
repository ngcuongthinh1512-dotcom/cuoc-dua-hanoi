// "Xưởng sô-cô-la" — a Choco-Story-style workshop kitchen (Rue de l'Étuve, Brussels) as a self-contained Three.js interior
// with 11 team cooking tables; the Tempering Challenge (public/games/temper.html) opens in a letterboxed overlay from the
// own table's "Bắt đầu" button (F). `mountRoom(opts)` (rooms/types.ts) builds the room as ONE group in room-local metres
// (door at +z = R.zFront, rooms/roomFrame.ts) into the given scene, the overlay DOM and the exit ring; the dev page
// (choco.ts) adds its own walker / camera / composer, the race (main.ts) walks the game's body on colliders put into the
// game's Rapier world, `rooms.below` m under the branch box, next to the other teams in the room (normal poses).
// Dev params (choco.ts): team=1..11 (own table, the walker spawns at it, only its button works; none = every button works) ·
// hq=1 (shadows, bloom, steam, every lamp) · view=overview|table|plan / cam=x,y,z,yawDeg,pitchDeg / fly=1 · open=1 (overlay
// open at load) · skip=1&done=n (the "Bỏ qua" confirm, screenshots) · avatar=0|1, autoMove=walk|sprint. The race reads none.
// Privacy: the tally (placard, overlay, hint) is drawn for the OWN table only; the other tables show the team name alone.
// Results come from the iframe (postMessage 'choco-result') → onResult → `race room`; the race seeds the iframe from the
// server's tally (postMessage 'room-init').
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bar, v3 } from '../hall/hallBuild.ts';
import { R, TEAMS, TYPES, type Slot, type Team, archZs, isLight, lampSlots, plainName, tableAt, tableSlots, vaultA, vaultR } from './chocoBuild.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import { type Box, createRoomPlayer, nearestButton, shellBoxes, slotBox } from '../rooms/roomPlayer.ts';
import type { RoomHandle, RoomMountOptions } from '../rooms/types.ts';

export const PROMPT = 'Bấm F để bắt đầu', WRONG = 'Đây không phải bàn của đội bạn', LOCKED = 'Bạn đã đổi lựa chọn kép – ra khỏi phòng để đi tiếp';

// ---- procedural textures (module level: one page lifetime, shared by every mount; never disposed) -----------------------
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function canvasTex(px: number, draw: (c: CanvasRenderingContext2D, s: number) => void, rx = 1, ry = rx, srgb = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d')!, px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const rep = (t: THREE.Texture, rx: number, ry: number) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
const speckle = (c: CanvasRenderingContext2D, s: number, n: number, size: number, alpha: number) => {
  for (let i = 0; i < n; i++) { const v = Math.floor(rnd() * 255); c.fillStyle = `rgba(${v},${v},${v},${alpha})`; c.fillRect(rnd() * s, rnd() * s, size, size); }
};
const blotches = (c: CanvasRenderingContext2D, s: number, n: number, rgb: string, alpha: number, rMax = s / 3) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = rMax * (0.3 + 0.7 * rnd()), g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
};
/** Glazed wall tiles: 4 × 4 per texture (0.6 m), cream with a soft bevel highlight, cocoa grout. */
const tileTex = canvasTex(512, (c, s) => {
  c.fillStyle = '#5a3a28';
  c.fillRect(0, 0, s, s);
  const n = 4, w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * w + 3, y = j * w + 3, g = c.createLinearGradient(x, y, x + w, y + w), v = 0.96 + 0.04 * rnd();
    g.addColorStop(0, `rgba(${255 * v},${248 * v},${236 * v},1)`);
    g.addColorStop(1, `rgba(${232 * v},${218 * v},${196 * v},1)`);
    c.fillStyle = g;
    c.fillRect(x, y, w - 6, w - 6);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(x, y, w - 6, 3); // bevel
    c.fillRect(x, y, 3, w - 6);
  }
  speckle(c, s, 1200, 2, 0.04);
});
/** Running-bond brick: 3 × 6 per texture (0.66 × 0.42 m). */
const brickTex = (base: [number, number, number], mortar = '#cdbfa6') => canvasTex(512, (c, s) => {
  c.fillStyle = mortar;
  c.fillRect(0, 0, s, s);
  const bw = s / 3, bh = s / 6;
  for (let j = 0; j < 6; j++) for (let i = -1; i < 4; i++) {
    const x = i * bw + (j % 2 ? bw / 2 : 0), y = j * bh, k = 0.82 + 0.3 * rnd();
    c.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
    c.fillRect(x + 4, y + 4, bw - 8, bh - 8);
  }
  blotches(c, s, 14, '40,20,10', 0.16);
  speckle(c, s, 4000, 2, 0.08);
});
/** Terracotta / cream chequer floor: 4 × 4 tiles per texture (1.6 m). */
const floorTex = canvasTex(512, (c, s) => {
  const n = 4, w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 0.9 + 0.2 * rnd();
    c.fillStyle = (i + j) % 2 ? `rgb(${168 * k},${92 * k},${56 * k})` : `rgb(${224 * k},${204 * k},${170 * k})`;
    c.fillRect(i * w, j * w, w, w);
    c.fillStyle = 'rgba(60,30,15,0.5)';
    c.fillRect(i * w, j * w, w, 3);
    c.fillRect(i * w, j * w, 3, w);
  }
  blotches(c, s, 18, '50,25,10', 0.12);
  speckle(c, s, 5000, 2, 0.07);
});
const marbleTex = canvasTex(512, (c, s) => {
  c.fillStyle = '#f2ece2';
  c.fillRect(0, 0, s, s);
  blotches(c, s, 16, '150,140,130', 0.14);
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = `rgba(110,105,100,${0.08 + rnd() * 0.18})`;
    c.lineWidth = 0.5 + rnd() * 1.5;
    const x = rnd() * s, y = rnd() * s;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x + (rnd() - 0.5) * s, y + (rnd() - 0.5) * s, x + (rnd() - 0.5) * s, y + (rnd() - 0.5) * s, x + (rnd() - 0.5) * s * 0.8, y + (rnd() - 0.5) * s * 0.8);
    c.stroke();
  }
  speckle(c, s, 2500, 1, 0.05);
});
const woodTex = (base: string, planks = 1) => canvasTex(512, (c, s) => {
  c.fillStyle = base;
  c.fillRect(0, 0, s, s);
  blotches(c, s, 10, '60,30,8', 0.18, s / 2);
  for (let i = 0; i < 300; i++) {
    c.strokeStyle = `rgba(40,20,5,${0.05 + rnd() * 0.2})`;
    c.lineWidth = 0.6 + rnd() * 1.8;
    const x = rnd() * s;
    c.beginPath();
    c.moveTo(x, 0);
    c.bezierCurveTo(x + (rnd() - 0.5) * 14, s / 3, x + (rnd() - 0.5) * 14, (2 * s) / 3, x + (rnd() - 0.5) * 8, s);
    c.stroke();
  }
  c.fillStyle = '#2a160a';
  for (let i = 1; i < planks; i++) c.fillRect((i * s) / planks - 1, 0, 2, s);
});
const burlapTex = canvasTex(256, (c, s) => {
  c.fillStyle = '#8f7246';
  c.fillRect(0, 0, s, s);
  c.strokeStyle = 'rgba(70,45,20,0.45)';
  c.lineWidth = 1.5;
  for (let i = 0; i < s; i += 5) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.moveTo(0, i); c.lineTo(s, i); c.stroke(); }
  blotches(c, s, 8, '80,50,20', 0.25);
  speckle(c, s, 3000, 1, 0.12);
}, 3);
const bumpTex = canvasTex(256, (c, s) => { c.fillStyle = '#808080'; c.fillRect(0, 0, s, s); blotches(c, s, 30, '255,255,255', 0.12); blotches(c, s, 30, '0,0,0', 0.12); speckle(c, s, 6000, 1, 0.25); }, 1, 1, false);
const steamSprite = canvasTex(64, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
}, 1, 1, false);
const label = (px: number, py: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = py;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

// ---- materials -----------------------------------------------------------------------------------------------------
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const M = {
  floor: std({ map: rep(floorTex, 2 * R.halfW / 1.2, (R.zFront - R.zBack) / 1.2), bumpMap: bumpTex, bumpScale: 0.4, roughness: 0.8 }),
  tile: std({ map: tileTex, bumpMap: bumpTex, bumpScale: 0.15, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide }),
  brick: std({ map: brickTex([176, 96, 62]), bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.95, side: THREE.DoubleSide }),
  vault: std({ map: brickTex([150, 84, 58], '#b8a68c'), bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.95, side: THREE.DoubleSide }),
  beam: std({ map: woodTex('#4a2a14'), roughness: 0.6 }),
  shelfWood: std({ map: woodTex('#6e3f1c', 3), roughness: 0.55 }),
  marble: std({ map: marbleTex, bumpMap: bumpTex, bumpScale: 0.2, roughness: 0.22, metalness: 0.05 }),
  steel: std({ color: '#cfd3d8', metalness: 0.95, roughness: 0.25 }),
  iron: std({ color: '#2b2622', metalness: 0.7, roughness: 0.6 }),
  copper: std({ color: '#c8703c', metalness: 0.9, roughness: 0.34, emissive: '#3a1606', emissiveIntensity: 0.35 }),
  brass: std({ color: '#c99a4a', metalness: 0.9, roughness: 0.3 }),
  gold: std({ color: '#e0b25c', metalness: 0.9, roughness: 0.3, emissive: '#5a3a08', emissiveIntensity: 0.25 }),
  black: std({ color: '#111214', roughness: 0.15, metalness: 0.3 }),
  dark: std({ color: '#2a2320', roughness: 0.8 }),
  chocolate: new THREE.MeshPhysicalMaterial({ color: '#3a1d10', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
  milk: new THREE.MeshPhysicalMaterial({ color: '#8a5a32', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
  white: new THREE.MeshPhysicalMaterial({ color: '#efe2c4', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  beans: std({ color: '#5a3418', roughness: 0.9 }),
  sugar: std({ color: '#f3ead8', roughness: 0.95 }),
  nibs: std({ color: '#3a2214', roughness: 0.95 }),
  burlap: std({ map: burlapTex, roughness: 1 }),
  cloth: std({ color: '#ffffff', roughness: 0.95 }), // tinted per team (instance colour)
  shade: std({ color: '#ffffff', roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }), // tinted per team
  bulb: std({ color: '#fff6e0', emissive: '#ffe2a0', emissiveIntensity: 3, roughness: 1 }),
  ember: std({ color: '#ff9a3a', emissive: '#ff7a1a', emissiveIntensity: 2.4, roughness: 1 }),
  cream: std({ color: '#efe4cf', roughness: 0.8 }),
  thermo: std({ color: '#f4f4f4', roughness: 0.3 }),
  red: std({ color: '#d42a1e', roughness: 0.4 }),
  tin: std({ color: '#b43a2a', roughness: 0.5, metalness: 0.3 }),
  tin2: std({ color: '#2a5a8a', roughness: 0.5, metalness: 0.3 }),
  door: std({ map: woodTex('#5a3418', 6), roughness: 0.55 }),
  dome: std({ color: '#ffffff', emissive: '#ff2a10', emissiveIntensity: 0.25, roughness: 0.35 }), // tinted per table (instance colour)
};
// minimal graphics (default): round things at half the segments (never under 6); `hq` = the full count
let lowPoly = true;
const SEG = (n: number) => (lowPoly ? Math.max(6, Math.round(n / 2)) : n);
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, n = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, SEG(n), 1, open).translate(x, y, z);
const cylG = (rt: number, rb: number, h: number, n: number, hs = 1, open = false, t0?: number, tl?: number) => new THREE.CylinderGeometry(rt, rb, h, SEG(n), hs, open, t0, tl);
const torus = (r: number, t: number, rs: number, ts: number, arc?: number) => new THREE.TorusGeometry(r, t, SEG(rs), SEG(ts), arc);
const sphere = (r: number, w: number, h: number) => new THREE.SphereGeometry(r, SEG(w), SEG(h));
const slotMatrix = (s: Slot) => new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
const VR = vaultR(), VA = vaultA(), VC = R.apexY - VR; // vault circle centre y
const vaultY = (x: number) => VC + Math.sqrt(VR * VR - x * x);
const startLabel = label(256, 80, (c) => {
  c.fillStyle = '#2a1810';
  c.fillRect(0, 0, 256, 80);
  c.fillStyle = '#e3b45c';
  c.font = 'bold 44px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('BẮT ĐẦU', 128, 42);
});

const OVERLAY_HTML = `<style>
#ch-cross { position: fixed; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px; border-radius: 50%; background: #fff8; box-shadow: 0 0 0 1px #0006; pointer-events: none; }
#ch-hint { position: fixed; left: 50%; bottom: 7%; transform: translateX(-50%); padding: 8px 18px; border-radius: 999px; background: #2a1810d9; border: 1px solid #e3b45c66; color: #f7e8d6; font: 700 15px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; pointer-events: none; opacity: 0; transition: opacity .15s; }
#ch-hint.on { opacity: 1; }
#ch-prompt { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); padding: 6px 16px; border-radius: 8px; background: rgba(0,0,0,.55); color: #fff; font: 600 18px system-ui, sans-serif; text-shadow: 0 1px 2px #000; pointer-events: none; white-space: nowrap; }
#ch-prompt.off { color: #bbb; }
#ch-help { position: fixed; left: 14px; bottom: 12px; color: #d8c2a0; font: 12px system-ui, sans-serif; opacity: .75; pointer-events: none; }
#ch-ov { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; background: #0b0604; z-index: 10; color: #f7e8d6; font: 15px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; --cocoa: #2a1810; --cream: #f7e8d6; --gold: #e3b45c; }
#ch-ov.on { display: flex; }
#ch-top { width: 100%; max-width: 1180px; display: flex; align-items: center; gap: 12px; padding: 10px 16px; box-sizing: border-box; }
#ch-top b { font-size: 18px; display: flex; align-items: center; gap: 10px; }
#ch-top b i { width: 16px; height: 16px; border-radius: 50%; background: var(--team, #fff); box-shadow: 0 0 10px var(--team, #fff); }
#ch-res { color: #d8c2a0; flex: 1; }
#ch-top button, #ch-dlg button { padding: 8px 18px; border-radius: 999px; border: 1px solid #ffffff22; font: 700 14px inherit; color: var(--cream); background: #3a2419; cursor: pointer; }
#ch-ov .skip { padding: 10px 22px !important; border: 2px solid #ff8c5a !important; background: linear-gradient(#e8651f, #b8420c) !important; color: #fff !important; font-size: 16px !important; box-shadow: 0 0 14px #ff8c5a66; }
#ch-ov .skip:hover { filter: brightness(1.12); }
#ch-ov .skip:disabled { opacity: .35; cursor: default; box-shadow: none; }
#ch-bottom { width: 100%; max-width: 1180px; display: flex; justify-content: center; padding: 0 16px 14px; box-sizing: border-box; }
#ch-quit { background: linear-gradient(#f2b76a, #d98c3f) !important; color: var(--cocoa) !important; }
#ch-frame { flex: 1; width: 100%; max-width: 1180px; min-height: 0; display: flex; justify-content: center; padding: 0 16px 16px; box-sizing: border-box; }
#ch-game { width: min(100%, calc((100vh - 170px) * 1.5)); height: 100%; border: 0; border-radius: 18px; background: #2e1c13; box-shadow: 0 20px 60px #000c, 0 0 0 1px #ffffff14; }
#ch-dlg { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: #160c08cc; backdrop-filter: blur(6px); z-index: 20; color: #f7e8d6; font: 15px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; }
#ch-dlg.on { display: flex; }
#ch-dlg > div { max-width: 420px; margin: 20px; padding: 28px 28px 22px; border-radius: 24px; text-align: center; background: linear-gradient(160deg, #5a3a26, #2e1c13); border: 1px solid #ffd9a633; box-shadow: 0 24px 60px #000a; }
#ch-dlg h2 { margin: 0 0 10px; font-size: 20px; color: #e3b45c; }
#ch-dlg p { margin: 0 0 18px; line-height: 1.45; }
#ch-dlg p b { color: #ff8c5a; }
#ch-dlg .row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
#ch-yes { background: linear-gradient(#ff8c5a, #e8651f) !important; color: #fff !important; border: 0 !important; }
</style>
<div id="ch-cross"></div>
<div id="ch-hint"></div>
<div id="ch-prompt" hidden></div>
<div id="ch-help">Nhấp = nhìn quanh · WASD + Q/E · Shift nhanh · Enter / nhấp vào nút Bắt đầu</div>
<div id="ch-ov">
  <div id="ch-top"><b><i></i><span id="ch-who"></span></b><span id="ch-res"></span><button id="ch-skip" class="skip" title="Bỏ thử thách và nhận phạt tại vạch đích">⚑ Bỏ thử thách</button><button id="ch-quit">Thoát (Esc)</button></div>
  <div id="ch-frame"><iframe id="ch-game" title="Thử thách sô-cô-la"></iframe></div>
  <div id="ch-bottom"><button id="ch-skip2" class="skip" title="Bỏ thử thách và nhận phạt tại vạch đích">⚑ Bỏ thử thách và nhận phạt tại vạch đích</button></div>
</div>
<div id="ch-dlg"><div><h2>Bỏ thử thách?</h2><p id="ch-dtx"></p><div class="row"><button id="ch-yes">Bỏ thử thách và nhận phạt</button><button id="ch-no">Quay lại làm tiếp</button></div></div></div>`;

/** Room-local z of the door end (rooms/roomFrame.ts: the box stands here). */
export const DOOR_Z = R.zFront;

export async function mountRoom(o: RoomMountOptions): Promise<RoomHandle> {
  const { renderer, scene, frame } = o;
  const RACE = !!o.world;
  const HQ = !!o.hq;
  lowPoly = !HQ;
  const q = RACE ? new URLSearchParams() : o.q; // the race reads none of the dev params
  const PLAN = q.get('view') === 'plan';
  const OWN = o.team?.slot ?? (Number(q.get('team')) || 0); // 0 = dev mode, every table works
  const TOTAL = o.room?.total ?? TYPES, PEN = o.room?.penaltyMinutesEach ?? 20;
  /** The 11 placards: the race's real teams (TeamInfo), the own team first; the dev page's hard-coded list. */
  const teamOf = (slot: number): Team => {
    const t = o.team?.slot === slot ? o.team : o.teams?.find((x) => x.slot === slot);
    return t ? { slot, name: t.name, color: t.colour } : RACE ? { slot, name: `Đội ${slot}`, color: '#9a8a7a' } : TEAMS[slot - 1]!;
  };
  const teams = TEAMS.map((t) => teamOf(t.slot));
  // the scene's look while the room is up (restored on dispose): warm haze down the long room, the room's own environment map
  const was = { exposure: renderer.toneMappingExposure, background: scene.background, fog: scene.fog, environment: scene.environment, envIntensity: scene.environmentIntensity, pixelRatio: renderer.getPixelRatio() };
  renderer.toneMappingExposure = 0.85;
  scene.background = new THREE.Color('#1a100b');
  scene.fog = new THREE.FogExp2('#2a1a10', 0.028);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const g = new THREE.Group();
  g.name = 'room';
  const gp = groupPose(frame);
  g.position.set(gp.x, gp.y, gp.z);
  g.rotation.y = gp.yaw;
  scene.add(g);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = g) => { const mesh = new THREE.Mesh(geo, m); parent.add(mesh); return mesh; };
  const overhead: THREE.Object3D[] = []; // hidden in the plan view (vault, arches, beams, rails, pans, lamps)
  const merged = (parts: THREE.BufferGeometry[], m: THREE.Material) => add(mergeGeometries(parts, false)!, m);
  function instanced(geo: THREE.BufferGeometry, m: THREE.Material, slots: Slot[], tint?: (i: number) => THREE.Color) {
    const im = new THREE.InstancedMesh(geo, m, slots.length);
    slots.forEach((s, i) => { im.setMatrixAt(i, slotMatrix(s)); if (tint) im.setColorAt(i, tint(i)); });
    g.add(im);
    return im;
  }
  const shadow = (m: THREE.Object3D, on = true) => void (HQ && (m.castShadow = on));

  // ---- room shell: floor, tiled dado + brick walls, segmental brick vault with arches and tie beams -------------------
  const W = 2 * R.halfW, LEN = R.zFront - R.zBack, ZC = (R.zFront + R.zBack) / 2;
  add(new THREE.PlaneGeometry(W, LEN).rotateX(-Math.PI / 2).translate(0, 0, ZC), M.floor).receiveShadow = HQ;
  for (const s of [-1, 1]) { // long walls: tiles to tileY, brick above to the springing
    const geo = new THREE.PlaneGeometry(LEN, R.tileY).rotateY(-s * Math.PI / 2).translate(s * R.halfW, R.tileY / 2, ZC);
    add(geo, std({ ...M.tile, map: rep(tileTex, LEN / 0.6, R.tileY / 0.6) }));
    const h = R.springY - R.tileY;
    add(new THREE.PlaneGeometry(LEN, h).rotateY(-s * Math.PI / 2).translate(s * R.halfW, R.tileY + h / 2, ZC), std({ ...M.brick, map: rep(M.brick.map!, LEN / 0.66, h / 0.42) }));
  }
  { // end walls: rectangle + the vault segment (ShapeGeometry: uv = xy in metres)
    const shape = new THREE.Shape();
    shape.moveTo(-R.halfW, 0);
    shape.lineTo(R.halfW, 0);
    shape.lineTo(R.halfW, R.springY);
    shape.absarc(0, VC, VR, Math.PI / 2 - VA, Math.PI / 2 + VA, false);
    shape.lineTo(-R.halfW, 0);
    const brick = std({ ...M.brick, map: rep(M.brick.map!, 1 / 0.66, 1 / 0.42) }), tile = std({ ...M.tile, map: rep(tileTex, 1 / 0.6, 1 / 0.6) });
    for (const z of [R.zBack, R.zFront]) {
      add(new THREE.ShapeGeometry(shape, SEG(24)).translate(0, 0, z), brick);
      add(new THREE.PlaneGeometry(W, R.tileY).translate(0, R.tileY / 2, z + (z < 0 ? 0.02 : -0.02)), std({ ...tile, map: rep(tileTex, W / 0.6, R.tileY / 0.6) }));
    }
    // cocoa-brown tile border + brass rail along the top of the dado
    const border = std({ color: '#5a2e1a', roughness: 0.3, metalness: 0.05 });
    merged([box(W, 0.12, 0.03, 0, R.tileY + 0.06, R.zBack + 0.015), box(W, 0.12, 0.03, 0, R.tileY + 0.06, R.zFront - 0.015), box(0.03, 0.12, LEN, -R.halfW + 0.015, R.tileY + 0.06, ZC), box(0.03, 0.12, LEN, R.halfW - 0.015, R.tileY + 0.06, ZC)], border);
  }
  { // vault: a band of a cylinder, axis along z, inside faces down; transverse brick arches + oak tie beams at the springing
    const arc = 2 * VA * VR;
    const geo = cylG(VR, VR, LEN, 48, 1, true, -VA, 2 * VA).rotateX(-Math.PI / 2).translate(0, VC, ZC);
    overhead.push(add(geo, std({ ...M.vault, map: rep(M.vault.map!, arc / 0.66, LEN / 0.42) })));
    const ribs: THREE.BufferGeometry[] = [], beams: THREE.BufferGeometry[] = [];
    for (const z of archZs()) {
      ribs.push(torus(VR - 0.12, 0.2, 8, 40, 2 * VA).rotateZ(Math.PI / 2 - VA).translate(0, VC, z));
      beams.push(box(W - 0.1, 0.26, 0.26, 0, R.springY - 0.15, z));
      beams.push(box(0.5, 0.5, 0.4, -R.halfW + 0.2, R.springY - 0.45, z), box(0.5, 0.5, 0.4, R.halfW - 0.2, R.springY - 0.45, z)); // corbels
    }
    overhead.push(merged(ribs, std({ ...M.vault, map: rep(M.vault.map!, 2, 0.5) })), merged(beams, M.beam));
    shadow(overhead[overhead.length - 1]!);
  }
  { // front wall: a wide oak double door with a brass arch; back wall: the oven niche with a glowing hearth
    const z = R.zFront - 0.06;
    merged([box(1.1, 2.6, 0.08, -0.57, 1.3, z), box(1.1, 2.6, 0.08, 0.57, 1.3, z), box(0.7, 1.0, 0.03, -0.57, 1.8, z - 0.05), box(0.7, 1.0, 0.03, 0.57, 1.8, z - 0.05), box(0.7, 0.8, 0.03, -0.57, 0.6, z - 0.05), box(0.7, 0.8, 0.03, 0.57, 0.6, z - 0.05)], M.door);
    merged([box(2.6, 0.16, 0.14, 0, 2.68, z), box(0.16, 2.7, 0.14, -1.22, 1.35, z), box(0.16, 2.7, 0.14, 1.22, 1.35, z), sphere(0.04, 8, 6).translate(-0.12, 1.1, z - 0.1), sphere(0.04, 8, 6).translate(0.12, 1.1, z - 0.1)], M.brass);
    const arch = new THREE.Shape();
    arch.moveTo(-1.2, 1.15);
    arch.lineTo(1.2, 1.15);
    arch.lineTo(1.2, 2.3);
    arch.absarc(0, 2.3, 1.2, 0, Math.PI, false);
    arch.lineTo(-1.2, 1.15);
    add(new THREE.ShapeGeometry(arch, SEG(20)).translate(0, 0, R.zBack + 0.03), std({ color: '#0d0705', roughness: 1 })); // oven mouth
    add(new THREE.PlaneGeometry(1.8, 0.9).translate(0, 1.65, R.zBack + 0.04), M.ember); // embers
    merged([torus(1.32, 0.12, 8, 24, Math.PI).translate(0, 2.3, R.zBack + 0.05), box(0.24, 1.25, 0.24, -1.32, 1.72, R.zBack + 0.05), box(0.24, 1.25, 0.24, 1.32, 1.72, R.zBack + 0.05)], std({ ...M.brick, map: rep(M.brick.map!, 2, 0.5) }));
  }

  // ---- back end: marble counter, copper melters, chocolate fountain -----------------------------------------------------
  {
    const zc = R.zBack + 0.55, counter = 9.5;
    add(box(counter, 0.82, 0.9, 0, 0.41, zc), M.shelfWood);
    add(box(counter + 0.1, 0.07, 1.0, 0, 0.86, zc), M.marble).receiveShadow = HQ;
    const kettles: THREE.BufferGeometry[] = [], choc: THREE.BufferGeometry[] = [];
    for (const x of [-3.6, -1.9, 1.9, 3.6]) {
      kettles.push(cyl(0.42, 0.36, 0.62, x, 1.2, zc, 32, true), cyl(0.36, 0.36, 0.04, x, 0.91, zc, 32), torus(0.43, 0.025, 8, 32).rotateX(Math.PI / 2).translate(x, 1.51, zc));
      kettles.push(torus(0.1, 0.02, 6, 12).rotateY(Math.PI / 2).translate(x - 0.48, 1.3, zc), torus(0.1, 0.02, 6, 12).rotateY(Math.PI / 2).translate(x + 0.48, 1.3, zc)); // handles
      choc.push(cyl(0.4, 0.4, 0.02, x, 1.44, zc, 32));
    }
    kettles.push(cyl(0.4, 0.44, 0.06, 5.0, 0.93, zc, 32), sphere(0.06, 10, 8).translate(5.0, 0.99, zc)); // a lid set aside
    shadow(merged(kettles, M.copper));
    merged(choc, M.chocolate);
    // fountain on a round marble table at the end of the aisle
    const fx = 0, fz = R.zBack + 2.7;
    merged([cyl(0.12, 0.2, 0.8, fx, 0.4, fz, 16), cyl(0.5, 0.5, 0.06, fx, 0.03, fz, 32)], M.iron);
    add(cyl(0.78, 0.78, 0.06, fx, 0.83, fz, 48), M.marble);
    const tiers: [number, number][] = [[0.52, 0.92], [0.36, 1.3], [0.22, 1.62]], steel: THREE.BufferGeometry[] = [], flow: THREE.BufferGeometry[] = [];
    steel.push(cyl(0.6, 0.62, 0.1, fx, 0.91, fz, 48), cyl(0.035, 0.035, 0.95, fx, 1.38, fz, 10), sphere(0.07, 12, 10).translate(fx, 1.9, fz));
    for (const [r, y] of tiers) steel.push(cyl(r, r - 0.02, 0.035, fx, y, fz, 48));
    for (let i = 0; i < tiers.length; i++) { // chocolate curtain from each tier down to the next
      const [r, y] = tiers[i]!, y0 = i ? tiers[i - 1]![1] + 0.02 : 0.98;
      flow.push(cyl(r - 0.01, r + 0.015, y - y0, fx, (y + y0) / 2, fz, 48, true), cyl(r, r, 0.02, fx, y + 0.03, fz, 48));
    }
    flow.push(cyl(0.58, 0.58, 0.02, fx, 0.97, fz, 48), sphere(0.09, 12, 10).translate(fx, 1.88, fz));
    shadow(merged(steel, M.steel));
    merged(flow, M.chocolate);
    // a tray of pralines + a stack of white / milk bars beside it
    const bars: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) bars.push(box(0.3, 0.015, 0.14, fx - 0.5, 0.87 + i * 0.016, fz + 0.45).rotateY(0.1 * i));
    merged(bars, M.milk);
    merged([box(0.3, 0.015, 0.14, fx + 0.52, 0.87, fz + 0.4), box(0.3, 0.015, 0.14, fx + 0.5, 0.886, fz + 0.43)], M.white);
  }

  // ---- side shelves: jars, tins, moulds; cocoa sacks on the floor ---------------------------------------------------------
  {
    const boards: THREE.BufferGeometry[] = [], brackets: THREE.BufferGeometry[] = [];
    const jars: Slot[] = [], moulds: THREE.BufferGeometry[] = [], tins: Slot[] = [], tins2: Slot[] = [];
    const fills: Record<'beans' | 'sugar' | 'nibs', Slot[]> = { beans: [], sugar: [], nibs: [] };
    for (const s of [-1, 1]) {
      const x = s * (R.halfW - 0.19);
      for (const y of [2.05, 2.75]) {
        for (const [z0, z1] of [[-9.6, -4.2], [-2.5, 2.5], [4.2, 9.6]] as [number, number][]) {
          boards.push(box(0.34, 0.04, z1 - z0, x, y, (z0 + z1) / 2));
          for (let z = z0 + 0.3; z < z1; z += 1.6) brackets.push(box(0.3, 0.03, 0.03, x, y - 0.05, z), new THREE.BoxGeometry(0.03, 0.25, 0.03).translate(x + s * 0.15, y - 0.16, z));
          for (let z = z0 + 0.2; z < z1 - 0.1; z += HQ ? 0.34 : 0.68) { // minimal: every other jar
            const k = Math.floor(rnd() * 5);
            if (y > 2.5 && k < 2) { (k ? tins : tins2).push({ x: x + s * 0.02, y: y + 0.02, z, yaw: rnd() }); continue; }
            if (y < 2.5 && k === 4) { moulds.push(box(0.26, 0.03, 0.2, x, y + 0.035, z).rotateY(0.15 * (rnd() - 0.5))); continue; }
            jars.push({ x, y: y + 0.02, z, yaw: 0 });
            (k === 0 ? fills.sugar : k === 1 ? fills.nibs : fills.beans).push({ x, y: y + 0.02, z, yaw: 0 });
          }
        }
      }
    }
    merged(boards, M.shelfWood);
    merged(brackets, M.iron);
    instanced(cyl(0.075, 0.07, 0.2, 0, 0.1, 0, 14), M.glass, jars);
    instanced(mergeGeometries([cyl(0.085, 0.085, 0.03, 0, 0.215, 0, 14), sphere(0.025, 8, 6).translate(0, 0.235, 0)], false)!, M.brass, jars); // lids
    for (const [k, list] of Object.entries(fills)) instanced(cyl(0.068, 0.063, 0.15 + 0.03 * (k === 'sugar' ? 1 : 0), 0, 0.085, 0, 12), M[k as keyof typeof fills], list);
    merged(moulds, M.steel);
    instanced(cyl(0.07, 0.07, 0.17, 0, 0.085, 0, 14), M.tin, tins);
    instanced(cyl(0.07, 0.07, 0.17, 0, 0.085, 0, 14), M.tin2, tins2);
    // jute sacks: lumpy capsules on their sides and standing, in the back corners and by the door
    const sacks: Slot[] = [];
    for (const s of [-1, 1]) for (const [dx, dz, yaw] of [[0, 0, 0.3], [0.7, 0.3, 1.1], [0.35, 0.65, 2.0], [0, 1.2, 0.5], [0.8, 1.1, 1.6]] as [number, number, number][]) sacks.push({ x: s * (R.halfW - 0.75 - dx), y: 0, z: R.zBack + 1.9 + dz, yaw });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) sacks.push({ x: s * (R.halfW - 0.7 - 0.5 * (i % 2)), y: 0, z: R.zFront - 1.0 - i * 0.75, yaw: i });
    const sack = new THREE.CapsuleGeometry(0.3, 0.5, HQ ? 4 : 2, SEG(10)).scale(1, 0.95, 0.85).translate(0, 0.52, 0);
    const sp = sack.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) sp.setXYZ(i, sp.getX(i) * (1 + 0.08 * Math.sin(sp.getY(i) * 9)), sp.getY(i), sp.getZ(i) * (1 + 0.06 * Math.cos(sp.getX(i) * 11))); // lumps
    sack.computeVertexNormals();
    shadow(instanced(sack, M.burlap, sacks));
    instanced(cyl(0.08, 0.1, 0.1, 0, 1.0, 0, 8), M.burlap, sacks); // tied neck
  }

  // ---- rails over the rows: hanging copper pans + lamp cords ---------------------------------------------------------
  {
    const rails: THREE.BufferGeometry[] = [], pans: THREE.BufferGeometry[] = [];
    const z0 = R.zBack + 3.2, z1 = R.zFront - 3.2;
    for (const s of [-1, 1]) {
      const x = s * R.rail.x;
      rails.push(cylG(0.025, 0.025, z1 - z0, 8).rotateX(Math.PI / 2).translate(x, R.rail.y, (z0 + z1) / 2));
      for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 4) rails.push(cylG(0.012, 0.012, vaultY(x) - R.rail.y, 6).translate(x, (vaultY(x) + R.rail.y) / 2, z));
      for (let i = 0; i < 9; i++) { // a pan between every pair of lamps: disc hanging from a hook, handle up
        const z = z0 + 0.9 + i * (z1 - z0 - 1.8) / 8 + 0.1 * Math.sin(i * 3), r = 0.14 + 0.05 * ((i * 7) % 3), y = R.rail.y - 0.55 - r;
        pans.push(cylG(r, r * 0.9, 0.07, 24).rotateZ(Math.PI / 2).translate(x, y, z), cylG(r * 0.85, r * 0.85, 0.075, 24).rotateZ(Math.PI / 2).translate(x, y, z)); // pan body (rim darker: same copper)
        pans.push(box(0.03, 0.42, 0.015, x, y + r + 0.2, z), torus(0.035, 0.008, 6, 12).translate(x, R.rail.y - 0.05, z));
      }
    }
    overhead.push(merged(rails, M.iron), merged(pans, M.copper));
    shadow(overhead[overhead.length - 1]!);
  }

  // ---- lamps: cone pendants on cords (team colour over the tables, copper over the melters) ------------------------------
  const LAMPS = lampSlots();
  {
    const cords: THREE.BufferGeometry[] = [], bulbs: THREE.BufferGeometry[] = [];
    for (const l of LAMPS) { cords.push(cylG(0.006, 0.006, 0.6, 4).translate(l.x, l.y - 0.3, l.z)); bulbs.push(sphere(0.04, 10, 8).translate(l.x, l.y - 0.68, l.z)); }
    const shade = mergeGeometries([cylG(0.05, 0.24, 0.22, 28, 1, true).translate(0, -0.62, 0), cylG(0.05, 0.05, 0.08, 12).translate(0, -0.5, 0)], false)!;
    overhead.push(merged(cords, M.iron), merged(bulbs, M.bulb), instanced(shade, M.shade, LAMPS.slice(0, 11), (i) => new THREE.Color(teams[i]!.color)), instanced(shade, M.copper, LAMPS.slice(11)));
  }

  // ---- the 11 team tables -----------------------------------------------------------------------------------------------
  const SLOTS = tableSlots();
  const results: Record<number, { done: number; skipped: boolean; penalty: number }> = {};
  for (const t of teams) {
    let done = 0;
    if (!RACE) try { done = (JSON.parse(localStorage[`temper2${t.slot}won`] || '[]') as unknown[]).length; } catch { /* no storage */ }
    results[t.slot] = { done, skipped: false, penalty: (TOTAL - done) * PEN };
  }
  const tallyText = (slot: number) => { const r = results[slot]!; return r.skipped ? `${r.done}/${TOTAL} · bỏ qua · phạt ${r.penalty} phút` : `Hoàn thành: ${r.done}/${TOTAL}`; };
  /** Only the own table (the race: OWN) carries a tally; the others show the name alone (the other teams' results are private). */
  const showsTally = (slot: number) => !RACE || slot === OWN;
  // the 11 placards in ONE atlas (4 × 3 cells of 512 × 320) → one mesh, one draw call; a cell is redrawn when its tally changes
  const ATLAS = { cols: 4, rows: 3, w: 512, h: 320 };
  const atlas = label(ATLAS.cols * ATLAS.w, ATLAS.rows * ATLAS.h, () => {});
  atlas.flipY = true;
  function drawPlacard(t: Team) {
    const c = (atlas.image as HTMLCanvasElement).getContext('2d')!, dark = isLight(t.color);
    const i = t.slot - 1, ox = (i % ATLAS.cols) * ATLAS.w, oy = Math.floor(i / ATLAS.cols) * ATLAS.h;
    c.save();
    c.translate(ox, oy);
    c.fillStyle = '#f6ecd8';
    c.fillRect(0, 0, 512, 320);
    c.fillStyle = t.color;
    c.fillRect(0, 0, 512, 86);
    c.fillStyle = '#5a3a28';
    c.fillRect(0, 86, 512, 6);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = dark ? '#2a1810' : '#ffffff';
    c.font = 'bold 44px system-ui, sans-serif';
    c.fillText(`ĐỘI ${t.slot}`, 256, 45);
    c.fillStyle = '#2a1810';
    const name = plainName(t);
    c.font = `bold ${name.length > 9 ? 74 : 90}px system-ui, sans-serif`;
    c.fillText(name, 256, showsTally(t.slot) ? 175 : 205, 480);
    if (showsTally(t.slot)) {
      c.font = '600 36px system-ui, sans-serif';
      c.fillStyle = results[t.slot]!.skipped ? '#b4321e' : '#6b4a37';
      c.fillText(tallyText(t.slot), 256, 272, 480);
    }
    c.restore();
    atlas.needsUpdate = true;
  }
  const placardCell = (slot: number) => {
    const i = slot - 1, geo = new THREE.PlaneGeometry(0.56, 0.35).translate(0, 1.35, -0.343), uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i % ATLAS.cols + uv.getX(k)) / ATLAS.cols, (ATLAS.rows - 1 - Math.floor(i / ATLAS.cols) + uv.getY(k)) / ATLAS.rows);
    return geo;
  };
  let domes: THREE.InstancedMesh;
  const domeColour = (slot: number, hot = false) => new THREE.Color(!OWN || slot === OWN ? (hot ? '#ff6a4a' : '#9a140c') : '#6a6a6a');
  {
    const P: Record<string, THREE.BufferGeometry[]> = { marble: [], steel: [], copper: [], black: [], chocolate: [], thermo: [], red: [], dark: [], beam: [], glass: [], beans: [], milk: [], shelfWood: [] };
    const push = (k: keyof typeof M, geo: THREE.BufferGeometry, m: THREE.Matrix4) => (P[k as string] ??= []).push(geo.applyMatrix4(m));
    const skirts: Slot[] = [], plates: THREE.BufferGeometry[] = [], placards: THREE.BufferGeometry[] = [];
    for (const [i, s] of SLOTS.entries()) {
      const m = slotMatrix(s), t = teams[i]!;
      push('marble', box(1.7, 0.06, 0.8, 0, 0.87, 0), m);
      push('steel', box(1.72, 0.04, 0.82, 0, 0.82, 0), m);
      for (const [x, z] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]] as [number, number][]) push('steel', cyl(0.03, 0.03, 0.8, x, 0.4, z, 10), m);
      push('steel', box(1.6, 0.03, 0.7, 0, 0.22, 0), m);
      push('steel', box(0.03, 0.02, 0.7, -0.5, 0.235, 0), m); // bits on the undershelf
      push('shelfWood', box(0.5, 0.18, 0.3, 0.4, 0.33, 0.05).rotateY(0.2), m); // crate
      skirts.push(s);
      // induction hob + copper pot with chocolate, thermometer clipped to the rim
      push('black', box(0.44, 0.015, 0.44, -0.45, 0.907, 0.0), m);
      push('red', torus(0.14, 0.006, 4, 24).rotateX(Math.PI / 2).translate(-0.45, 0.916, 0), m);
      push('copper', cyl(0.18, 0.16, 0.22, -0.45, 1.02, 0, 24, true), m);
      push('copper', cyl(0.16, 0.16, 0.02, -0.45, 0.92, 0, 24), m);
      push('copper', torus(0.18, 0.012, 6, 24).rotateX(Math.PI / 2).translate(-0.45, 1.13, 0), m);
      push('copper', bar(v3(-0.63, 1.1, 0), v3(-0.9, 1.16, 0), 0.025, 0.012), m);
      push('chocolate', cyl(0.17, 0.17, 0.02, -0.45, 1.08, 0, 24), m);
      push('thermo', cylG(0.009, 0.009, 0.32, 8).rotateZ(-0.55).translate(-0.3, 1.2, -0.08), m);
      push('red', sphere(0.016, 8, 6).translate(-0.38, 1.07, -0.08), m);
      push('shelfWood', box(0.03, 0.01, 0.34, -0.2, 0.912, 0.22).rotateY(0.6), m); // spatula
      // praline mould tray + a bowl of beans + a glass jar + two finished bars
      push('dark', box(0.52, 0.03, 0.34, 0.42, 0.915, -0.06), m);
      for (let a = 0; a < 5; a++) for (let b = 0; b < 3; b++) push(b === 1 ? 'milk' : 'chocolate', sphere(0.03, 8, 6).scale(1, 0.55, 1).translate(0.24 + a * 0.09, 0.935, -0.14 + b * 0.08), m);
      push('steel', cylG(0.1, 0.06, 0.09, 16, 1, true).translate(0.3, 0.945, 0.25), m);
      push('steel', cyl(0.06, 0.06, 0.01, 0.3, 0.905, 0.25, 16), m);
      push('beans', cyl(0.09, 0.09, 0.02, 0.3, 0.97, 0.25, 14), m);
      push('glass', cyl(0.07, 0.065, 0.18, -0.15, 0.99, -0.28, 12), m);
      push('milk', cyl(0.062, 0.06, 0.12, -0.15, 0.97, -0.28, 12), m);
      push('chocolate', box(0.22, 0.012, 0.11, 0.65, 0.906, 0.25).rotateY(-0.3), m);
      // start button: steel base (merged), red dome (one instanced mesh: the hover highlight is its instance colour), engraved plate (merged)
      push('steel', cyl(0.1, 0.11, 0.035, 0, 0.918, 0.28, 24), m);
      plates.push(new THREE.PlaneGeometry(0.3, 0.094).rotateX(-Math.PI / 2).translate(0, 0.903, 0.22).applyMatrix4(m));
      // placard on a brass stand at the back edge
      push('steel', cyl(0.012, 0.012, 0.3, 0, 1.05, -0.34, 8), m);
      push('dark', box(0.6, 0.39, 0.02, 0, 1.35, -0.355), m);
      drawPlacard(t);
      placards.push(placardCell(t.slot).applyMatrix4(m));
    }
    for (const [k, geos] of Object.entries(P)) if (geos.length) shadow(merged(geos, M[k as keyof typeof M]), k !== 'glass');
    merged(plates, std({ map: startLabel, roughness: 0.4, metalness: 0.3 }));
    merged(placards, std({ map: atlas, roughness: 0.6 }));
    domes = instanced(sphere(0.07, 20, 14).scale(1, 0.7, 1).translate(0, 0.935, 0.28), M.dome, SLOTS, (i) => domeColour(i + 1));
    instanced(box(1.64, 0.56, 0.02, 0, 0.53, 0.41), M.cloth, skirts, (i) => new THREE.Color(teams[i]!.color));
    instanced(box(0.025, 0.56, 0.82, 0.82, 0.53, 0).rotateY(0), M.cloth, skirts, (i) => new THREE.Color(teams[i]!.color).multiplyScalar(0.8));
    instanced(box(0.025, 0.56, 0.82, -0.82, 0.53, 0), M.cloth, skirts, (i) => new THREE.Color(teams[i]!.color).multiplyScalar(0.8));
  }
  // own table (?team=): gold marker bobbing over its button
  let marker: THREE.Mesh | null = null;
  if (OWN) {
    const s = SLOTS[OWN - 1]!, p = tableAt(s, 0.28, 0, 1.4);
    marker = add(new THREE.OctahedronGeometry(0.11), std({ color: '#ffe36b', emissive: '#ffb400', emissiveIntensity: 1.1 }));
    marker.position.set(p.x, p.y, p.z);
  }

  // ---- steam over every pot, the melters and the fountain (additive sprites, cycled upward each frame; hq only) -----------
  const steam = HQ ? (() => {
    const src = [...SLOTS.map((s) => tableAt(s, 0, 0.45, 1.15)), ...[-3.6, -1.9, 1.9, 3.6].map((x) => ({ x, y: 1.55, z: R.zBack + 0.55 })), { x: 0, y: 1.3, z: R.zBack + 2.7 }];
    const n = src.length * 12, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) ph[i] = rnd();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: steamSprite, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true }));
    g.add(pts);
    return (t: number) => {
      for (let i = 0; i < n; i++) {
        const s = src[Math.floor(i / 12)]!, f = (t * 0.18 + ph[i]!) % 1, k = i % 12;
        pos[i * 3] = s.x + 0.08 * Math.sin(t * 1.3 + k) * (0.3 + f) + 0.05 * Math.cos(k * 2.1);
        pos[i * 3 + 1] = s.y + f * 0.9;
        pos[i * 3 + 2] = s.z + 0.08 * Math.cos(t * 1.1 + k * 1.7) * (0.3 + f);
        const a = 0.22 * Math.sin(f * Math.PI) * (s.y > 1.4 ? 1.4 : 1); // the melters steam more
        col[i * 3] = a * 1.0; col[i * 3 + 1] = a * 0.92; col[i * 3 + 2] = a * 0.8;
      }
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    };
  })() : null;

  // ---- lights: minimal = hemisphere + one directional + the three warm points (hearth / fountain / door), the lamps glow
  // by their emissive bulbs; hq = a point per lamp + the shadow-casting key spot (the dev page's full look) ---------------
  g.add(new THREE.HemisphereLight('#ffd9b0', '#3a2416', HQ ? 0.5 : 1.1));
  const pt = (x: number, y: number, z: number, color: string, cd: number, dist = 0) => { const l = new THREE.PointLight(color, cd, dist, 2); l.position.set(x, y, z); g.add(l); return l; };
  if (HQ) for (const [i, l] of LAMPS.entries()) pt(l.x, l.y - 0.72, l.z, i < 11 ? '#ffd39a' : '#ffb87a', OWN && i === OWN - 1 ? 1.8 : 1.3, 6);
  else {
    const sun = new THREE.DirectionalLight('#ffe2c0', 1.6);
    sun.position.set(2, 6, 3);
    g.add(sun, sun.target);
    if (OWN) { const l = LAMPS[OWN - 1]!; pt(l.x, l.y - 0.72, l.z, '#ffd39a', 2.2, 6); } // the own table lit a little warmer
  }
  pt(0, 2.4, R.zBack + 2.7, '#ffc080', 2, 5); // fountain
  pt(0, 1.7, R.zBack + 0.5, '#ff6a20', 6, 6); // hearth
  pt(0, 2.6, R.zFront - 1.5, '#ffd0a0', 3, 7); // door end
  if (HQ) { // one soft shadow-casting key from the crown of the vault over the aisle
    const s = new THREE.SpotLight('#fff1dc', 14, 0, 1.15, 0.7, 1.4);
    s.position.set(0, R.apexY - 0.3, 0);
    s.target.position.set(0, 0, -1);
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.camera.near = 1;
    s.shadow.camera.far = 20;
    s.shadow.bias = -0.0004;
    g.add(s, s.target);
  }
  // the exit portal between the fountain and the first tables (the door is the entrance end: +z)
  const exit = makeExitRing(g, 0, R.zBack + 4.4, R.springY);

  // ---- overlay: the challenge iframe per team, Thoát / Esc, Bỏ qua + confirm, results → placard tally ------------------
  const dom = document.createElement('div');
  dom.innerHTML = OVERLAY_HTML;
  document.body.append(dom);
  const $ = <T extends HTMLElement>(id: string) => dom.querySelector<T>(`#ch-${id}`)!;
  const ov = $('ov'), game = $<HTMLIFrameElement>('game'), hint = $('hint'), dlg = $('dlg'), skipBtn = $<HTMLButtonElement>('skip'), skipBtn2 = $<HTMLButtonElement>('skip2'), promptEl = $('prompt');
  $('help').hidden = RACE;
  const keys = new Set<string>();
  let current = 0, iframeLoaded = false, locked = false;
  const inOverlay = () => ov.classList.contains('on');
  const resultLine = () => { const r = results[current]!; $('res').textContent = r.skipped ? `Đã bỏ qua: ${r.done}/${TOTAL} loại · phạt ${r.penalty} phút tại đích` : `Hoàn thành ${r.done}/${TOTAL} loại sô-cô-la${r.done < TOTAL ? ` · còn thiếu ${TOTAL - r.done} → ${r.penalty} phút phạt nếu bỏ qua` : ' · không bị phạt'}`; };
  function setResult(slot: number, done: number, skipped: boolean) {
    results[slot] = { done, skipped, penalty: (TOTAL - done) * PEN };
    if (showsTally(slot)) drawPlacard(teams[slot - 1]!);
    if (slot === current) { resultLine(); skipBtn.disabled = skipBtn2.disabled = done >= TOTAL || skipped; }
  }
  function open(slot: number) {
    if ((OWN && slot !== OWN) || locked) return;
    current = slot;
    const t = teams[slot - 1]!;
    $('who').textContent = `Đội ${t.slot} · ${t.name}`;
    ov.style.setProperty('--team', t.color);
    document.exitPointerLock();
    keys.clear();
    iframeLoaded = false;
    game.onload = () => {
      iframeLoaded = true;
      // the race: the server's tally seeds the game (a switch away and back reset it; another device): never localStorage
      if (RACE) game.contentWindow?.postMessage({ type: 'room-init', done: results[slot]!.done, skipped: results[slot]!.skipped, key: `race:${slot}` }, '*');
      game.contentWindow?.focus();
    };
    game.src = `/games/temper.html?team=${slot}`;
    ov.classList.add('on');
    setResult(slot, results[slot]!.done, results[slot]!.skipped);
  }
  function close() {
    ov.classList.remove('on'); dlg.classList.remove('on'); game.onload = null; game.src = 'about:blank'; current = 0;
    (document.activeElement as HTMLElement | null)?.blur(); window.focus(); // the keyboard back to the page (the iframe kept the focus)
    o.onClose?.();
  }
  $('quit').onclick = close;
  skipBtn.onclick = () => {
    const r = results[current]!, left = TOTAL - r.done;
    $('dtx').innerHTML = left >= TOTAL
      ? `Đội chưa hoàn thành loại sô-cô-la nào (0/${TOTAL}). Nếu bỏ qua, đội sẽ bị phạt <b>${left * PEN} phút</b> tại vạch đích (${PEN} phút × ${left} loại).`
      : `Bạn còn <b>${left} loại</b> sô-cô-la chưa hoàn thành. Nếu bỏ qua, đội sẽ bị phạt <b>${left * PEN} phút</b> tại vạch đích (${PEN} phút × ${left} loại).`;
    dlg.classList.add('on');
    $('no').focus();
  };
  skipBtn2.onclick = () => skipBtn.click();
  $('no').onclick = () => { dlg.classList.remove('on'); game.contentWindow?.focus(); };
  $('yes').onclick = () => {
    const slot = current, done = results[slot]!.done;
    setResult(slot, done, true);
    o.onResult?.({ done, skipped: true });
    // the same message the game posts, for whatever embeds this page (the dev page; the race listens through onResult)
    if (!RACE) postMessage({ type: 'choco-result', team: String(slot), done, total: TOTAL, skipped: true, penaltyMinutes: (TOTAL - done) * PEN }, '*');
    close();
  };
  const onMessage = (e: MessageEvent) => {
    const d = e.data as { type?: string; done?: number; team?: string; skipped?: boolean };
    if (d?.type === 'choco-exit') close();
    if (d?.type === 'choco-result' && e.source === game.contentWindow && current) {
      setResult(current, d.done ?? 0, false);
      o.onResult?.({ done: d.done ?? 0, skipped: false });
    }
  };
  addEventListener('message', onMessage);
  if (!RACE) Object.assign(window, { __CHOCO__: { open, close, results } });
  // ?open=1 / ?skip=1&done=n: straight into the overlay (screenshots)
  if (q.get('open') || q.get('skip')) {
    const slot = OWN || 1;
    if (q.get('done')) setResult(slot, Number(q.get('done')), false);
    open(slot);
    if (q.get('skip')) skipBtn.click();
  }

  // ---- the walker: the race = the game's body on colliders in the game's world; the dev page = a RoomPlayer of its own ------
  // ponytail: collision = room shell + one box per table, the counter and the fountain; the sacks are walked through
  const roomButtons = SLOTS.map((s, i) => ({ slot: i + 1, ...tableAt(s, 0.28, 0, 0.93), active: !OWN || i + 1 === OWN }));
  const boxes: Box[] = [
    ...shellBoxes(-R.halfW, R.halfW, R.zBack, R.zFront, R.springY),
    ...SLOTS.map((s) => slotBox(s, { x: 0, y: 0.45, z: 0, hx: 0.86, hy: 0.45, hz: 0.42 })),
    { x: 0, y: 0.45, z: R.zBack + 0.55, hx: 4.8, hy: 0.45, hz: 0.5 },
    { x: 0, y: 0.45, z: R.zBack + 2.7, hx: 0.8, hy: 0.45, hz: 0.8 },
  ];
  const frozen = () => inOverlay() || !!o.frozen?.();
  const lockedText = () => (locked ? LOCKED : null);
  const colliders: RAPIER.Collider[] = [];
  if (o.world) for (const b of boxes) { // the race: into the game's physics, at the frame
    const p = toWorld(frame, b.x, b.z), yaw = (b.yaw ?? 0) + frame.yaw;
    colliders.push(o.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(p.x, frame.floorY + b.y, p.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })));
  }
  const camera = RACE ? undefined : new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 80);
  const own = SLOTS[(OWN || 1) - 1]!;
  const euler = new THREE.Euler();
  const walk = camera
    ? await createRoomPlayer({
        scene, camera, canvas: renderer.domElement, q, buttons: roomButtons, boxes,
        spawn: OWN ? { ...tableAt(own, 1.1, -0.3), yaw: own.yaw } : { x: 0, z: R.zFront - 2, yaw: 0 },
        team: OWN ? { name: `Đội ${OWN} · ${teams[OWN - 1]!.name}`, colour: teams[OWN - 1]!.color } : undefined,
        frozen, locked: lockedText, onPress: open,
        onFly: (flying: boolean) => { if (flying) euler.setFromQuaternion(camera.quaternion, 'YXZ'); },
      })
    : undefined;
  /** The feet in room-local metres. */
  const feet = () => (walk ? { x: walk.position.x, z: walk.position.z } : toLocal(frame, o.feet!().x, o.feet!().z));
  const nearOwn = () => { const f = feet(); return nearestButton(f.x, f.z, roomButtons, 1.8); };
  // dev page: camera presets / free-fly keys / composer
  let composer: EffectComposer | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (inOverlay()) { if (e.key === 'Escape') (dlg.classList.contains('on') ? $('no') : $('quit')).click(); return; }
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onClick = () => { if (walk?.flying && !inOverlay()) renderer.domElement.requestPointerLock(); }; // walking: roomPlayer's Input locks
  const onMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== renderer.domElement || !walk?.flying) return;
    euler.y -= e.movementX * 0.0022;
    euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.0022, -1.5, 1.5);
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  if (camera) {
    renderer.shadowMap.enabled = HQ;
    renderer.setPixelRatio(HQ ? Math.min(devicePixelRatio, 1.5) : 1);
    const behind = (s: Slot): [THREE.Vector3, THREE.Vector3] => { const a = tableAt(s, 2.1, -0.9, 1.65), b = tableAt(s, 0, 0, 1.0); return [v3(a.x, a.y, a.z), v3(b.x, b.y, b.z)]; };
    const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = { overview: [v3(0.4, 2.0, R.zFront - 1.0), v3(0, 1.5, R.zBack + 2)], table: behind(own), plan: [v3(0, 11, 0), v3(0, 0, 0)] };
    const [from, to] = VIEWS[q.get('view') ?? (OWN ? 'table' : 'overview')] ?? VIEWS.overview!;
    camera.position.copy(from);
    camera.lookAt(to);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    if (PLAN) { // straight down, the melter end up the screen; the vault, arches and rails hidden
      euler.set(-Math.PI / 2, -Math.PI / 2, 0);
      camera.fov = 75;
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
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.5, 0.88));
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - 0.4 * smoothstep(0.35, 0.95, d); c.rgb = mix(c.rgb, c.rgb * vec3(1.06, 0.96, 0.86), 0.4); gl_FragColor = c; }',
      }));
    }
    renderer.domElement.addEventListener('click', onClick);
    addEventListener('mousemove', onMove);
    $('help').textContent = 'WASD đi · chuột nhìn quanh (nhấp để khoá) · Shift chạy · F bắt đầu ở bàn của đội · V bay tự do';
  } else renderer.setPixelRatio(1); // the race: minimal graphics inside (main.ts resize() keeps it while the room is up)
  function hover() { // the dome of the table in reach glows (a prop, not a mouse target); the hint shows the own table's tally
    const near = walk?.flying ? null : nearOwn();
    for (let i = 0; i < SLOTS.length; i++) domes.setColorAt(i, domeColour(i + 1, !!near?.active && near.slot === i + 1 && !locked));
    domes.instanceColor!.needsUpdate = true;
    if (near && showsTally(near.slot)) hint.textContent = `Đội ${near.slot} – ${teams[near.slot - 1]!.name} · ${tallyText(near.slot)}`;
    hint.classList.toggle('on', !!near && showsTally(near.slot));
    $('cross').style.display = walk?.flying && document.pointerLockElement === renderer.domElement ? '' : 'none';
    if (!walk) { // the race: the prompt (the dev walker draws its own)
      const text = near ? (locked ? LOCKED : near.active ? PROMPT : WRONG) : '';
      promptEl.hidden = !text || frozen();
      promptEl.textContent = text;
      promptEl.classList.toggle('off', locked || !near?.active);
    }
  }

  const clock = new THREE.Clock();
  let frames = 0, loadedAt = 0;
  return {
    group: g,
    ceiling: R.apexY,
    player: walk,
    update(dt) {
      const v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9 : 2.6) * dt;
      walk?.update(dt);
      if (walk?.flying && camera) {
        camera.quaternion.setFromEuler(euler);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
        if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
        if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
        if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
        if (keys.has('KeyE')) camera.position.y += v;
        if (keys.has('KeyQ')) camera.position.y -= v;
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -R.halfW + 0.3, R.halfW - 0.3);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, R.zBack + 0.3, R.zFront - 0.3);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.4, PLAN || q.get('cam') ? 40 : R.apexY - 0.3);
      }
      clock.getDelta();
      const t = clock.elapsedTime;
      steam?.(t);
      exit.update(t);
      if (marker) { marker.position.y = 1.12 + 0.05 * Math.sin(t * 2.5); marker.rotation.y = t; }
      if (!inOverlay()) hover();
      frames++;
      if (inOverlay() && iframeLoaded && !loadedAt) loadedAt = frames;
    },
    interact() {
      const near = nearOwn();
      if (!near?.active || locked || frozen()) return false;
      open(near.slot);
      return true;
    },
    render() {
      if (!camera) return;
      if (composer) { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); } else renderer.render(scene, camera);
    },
    resize() {
      if (!camera) return;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      composer?.setSize(innerWidth, innerHeight);
    },
    setProgress: (done, skipped) => OWN && setResult(OWN, done, skipped),
    setExit(on) {
      exit.set(on);
      if (on) walk?.face(exit.x, exit.z);
    },
    setLocked(on) {
      locked = on;
      if (on && inOverlay()) close();
    },
    exitHit: () => { const f = feet(); return exit.hit(f.x, f.z); },
    overlayOpen: inOverlay,
    settled: () => frames >= 3 && (!inOverlay() || (iframeLoaded && frames >= loadedAt + 12)),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      if (inOverlay()) close();
      removeEventListener('message', onMessage);
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
      scene.background = was.background;
      scene.fog = was.fog;
      scene.environment = was.environment;
      scene.environmentIntensity = was.envIntensity;
      renderer.info.autoReset = true;
      // ponytail: per-mount geometries are left to the GC (materials / textures are module-level and shared); dispose them when a race shows a memory climb
    },
  };
}
